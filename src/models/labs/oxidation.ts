import type { LabChartBinding, LabSceneBinding, LabSpec } from './spec';
import { coefficientsAt, oxideThickness, siliconConsumed } from '../physics/oxidation/dealGrove';
import { assertWithin, quantity, withSource } from '../contract';
import { MINUTES_PER_HOUR, NM_PER_UM } from '../physics/units';

/**
 * P2 산화 실습 명세 — PLN `03_실습3단계명세.md` §P2 「기초 (S5)」·「응용 (S6)」·「심화 (S7)」 배선.
 * (아래 머리주석은 기초(S5) 것이다. 응용·심화의 판단 기록은 `OXIDATION_LABS` 바로 위 블록에 있다.)
 * 🔴 여기서 식을 새로 쓰지 않는다. `physics/oxidation/dealGrove` 를 호출한다.
 *
 * 🔴 **합격창을 옮겼다 — 사유를 남긴다.**
 *    PLN 명세는 합격창 `95 ≤ x_ox ≤ 105 nm`, 파라미터 `t: 10~300 min`, `T: 920/1000/1100 °C` 다.
 *    정본 계수(S120 Table II 건식 ⟨100⟩)로 재계산하면 PLN 이 검산한 표와 값이 다르다 —
 *    PLN 은 ⟨100⟩ 보정을 반영하기 전 값으로 표를 만들었다(원장 §1-2b 의 87 nm vs 64.1 nm 와 같은 원인).
 *    **원칙대로 계수를 건드리지 않고 합격창을 옮겼다.** 실제 도달 가능 구간은 §PASS_WINDOW 주석 참조.
 */

const PROCESS_ID = 'oxidation';

/** 소모 Si : 산화막 = 0.44 : 1 (S121 §4.1). 표면 융기분은 그 나머지다. */
const SI_CONSUMED_RATIO = withSource(0.44, '', 'S121');

/** 정본표 온도 3택. 🔴 보간하지 않는다(원장 규칙 1) — dealGrove 가 표 밖 온도를 거부한다. */
const TEMPS = [920, 1000, 1100];

function nearestTemp(v: number): number {
  let best = TEMPS[0] as number;
  for (const t of TEMPS) if (Math.abs(t - v) < Math.abs(best - v)) best = t;
  return best;
}

/**
 * 🔴 합격창 — 원 명세대로 95~105 nm. **건드리지 않는다.**
 *
 * ⚠️ **2026-08-20 정정.** 이 자리에 있던 종전 주석은 **틀렸고, 그 틀린 수가 상위 승인의 근거였다.**
 *    종전 주석: 「1000 °C · t 상한 300 min 에서 x = 87.0 nm → 95 nm 에 도달하지 못한다」
 *
 * **실행해서 확인한 값**(`oxideThickness`, 건식 ⟨100⟩ 정본 계수 A=0.2772 µm · B=0.0117 µm²/h · τ=0.37 h):
 *
 *   | 조건 | 두께 |
 *   |---|---|
 *   | 1000 °C · 140 min | **86.9 nm**  ← 🔴 종전 주석의 「87.0」은 **이 값**이다 |
 *   | 1000 °C · 165 min | 97.4 nm  ✅ 합격 |
 *   | 1000 °C · 170 min | 99.5 nm  ✅ 합격 |
 *   | 1000 °C · 178 min | 102.7 nm ✅ 합격 |
 *   | 1000 °C · 300 min | **147.8 nm** ← 300 min 의 실제 값 |
 *   | 920 °C · 300 min  | **67.8 nm** ← 시간 상한을 다 써도 미달 |
 *   | 1100 °C · 300 min | 302.2 nm |
 *
 * 🔴 **오류의 정체는 시간 착오이지 면방위 착오가 아니다.** ⟨111⟩ 로 계산해도 300 min 은 181.4 nm 로
 *    87 과 무관하다. 87.0 은 **140 min 의 값**을 300 min 이라고 적은 것이다.
 *
 * **따라서 「1000 °C 로는 도달 불가」는 거짓이다.** 1000 °C 는 t ≈ 165~178 min 에서 합격창을 지나간다.
 * 🔴 **「저온에서는 시간으로 메울 수 없다」는 920 °C 에 대해서만 참이다**(300 min = 67.8 nm).
 *    화면 문구를 전수 확인한 결과 **이미 920 °C 로만 적혀 있어 고칠 것이 없었다**
 *    — 오조작 피드백(§피드백 「920 °C 로는 시간 상한을 다 써도…」)과 두께–시간 차트 note 둘 다.
 *    **1000 °C 를 예로 든 학습 문구는 없다.** 틀린 서술은 이 주석 안에만 있었다.
 *
 * 🔴 **합격창을 좁히지 않는다(D-041 ①).** 도달 가능해진 것은 실습이 나아진 것이지 창을 손댈 이유가 아니다.
 */
const PASS_MIN_NM = 95;
const PASS_MAX_NM = 105;

/* ═══════════════════════════════════════════════════════════════════════════
 * 응용(S6)·심화(S7) 공통 — PLN `03_실습3단계명세.md` §P2 「응용 (S6)」·「심화 (S7)」
 *
 * 🔴 **A15 에 대한 정직한 고지.** 두께는 전부 `physics/oxidation/dealGrove` 를 호출한다.
 *    그러나 σ(웨이퍼 간 산포)·TP(처리량)·D_sf(OISF 밀도)·부하지수·부식지수는
 *    **문헌식이 아니라 PLN 이 설계한 교육용 합성 모델**이다. 물리층은 「합성 계수 0건」이
 *    설계 원칙이라 여기에 둘 수 없고(`check-physics` 가 막는다), 협업 경계상 나는
 *    `physics/**` 를 만들 수도 고칠 수도 없다. 그래서 **스코어링 성격의 코드로 이 파일에**
 *    두고 계수의 출처를 「PLN 명세」로 명시한다. 화면에는 `registry.ts` 가 「경향모델」
 *    배지와 고지를 상시 붙인다(A6-b). — P4(식각)가 먼저 내린 것과 같은 판단이다.
 *
 * 🔴 **유량 제한 f_Q 를 시간으로 옮긴 근거.**
 *    PLN 은 `f_Q = min(1, Q/6)` 를 **B 와 B/A 에 곱하라**고 했다. 둘 다 f 배 하면
 *    `A = B/(B/A)` 는 변하지 않고 **B 만 f 배**가 된다. τ 의 정의 `τ = (x_i² + A·x_i)/B`
 *    에 따라 τ 는 1/f 배가 되므로
 *      `f·B·(t + τ/f) = f·B·t + B·τ`
 *    즉 **「성장 시간 t 만 f 배 한 것」과 대수적으로 완전히 같다.**
 *    → `dealGrove.oxideThickness` 를 **f_Q 배 한 시간으로 호출**한다. 식을 새로 쓰지 않았고,
 *      표의 τ(초기 산화막)도 건드리지 않았다. 가스 공급이 모자라다고 이미 자란 초기 산화막이
 *      줄어들 리 없으므로 물리적으로도 이쪽이 맞다.
 *    🔴 PLN 은 「죽은 판정 없음 확인」에서 f_Q 를 **적용하지 않고** 기본값 두께를 91 nm 로
 *      적었다. f_Q 를 적용하면 **68.9 nm** 다. 어느 쪽이든 하한 380 nm 에 한참 못 미쳐
 *      판정 결과(불합격)는 같다.
 *
 * 🔴 **`E_bd ≥ 8.0 MV/cm` 판정을 넣지 않았다 (원장 M-36).**
 *    8.0 MV/cm 는 **어느 문헌에도 판정기준으로 나오지 않는다.** 통용값 ~10 MV/cm 를 제시하는
 *    독립 2건은 **둘 다 라이선스 불가**라 절대값 자체를 화면에 쓸 수 없다.
 *    → 절대 전계(MV/cm)를 화면에서 **뺐다.** 대신 **건식·청정·1000 °C 를 1.00 으로 두는
 *      상대 지수**만 표시하고, 합격선 0.90 은 **문헌 기준이 아니라 이 실습이 제시하는 조건**
 *      임을 출력 라벨과 assumptions 에 명시한다(원장 M-26 의 Tj 처리와 같은 방식).
 *      이렇게 하지 않으면 F2(수분 혼입) 복구가 판정에 아무 영향을 못 주어
 *      「리크 점검을 안 해도 합격」이 되고 LO-P2-05 가 통째로 죽는다.
 *
 * 🔴 **불량 시나리오를 난수로 뽑지 않았다.** PLN 은 「실행마다 2종 무작위」라고 했지만
 *    A14-1(결정론)이 `src/models/**` 에서 `Math.random` 을 금지한다(`check-physics` 가 막는다).
 *    → **입력 파라미터(`faultScenario`)로 열었다.** P4 심화가 먼저 쓴 방식과 같다.
 *
 * 🔴 **화면에 옮기지 못한 것 — 정직하게 남긴다.**
 *    슬롯 50개 막대 그래프 · 상면 뷰 결함 점 · E_bd 히스토그램 · 간트 바 · 진단 선택지 UI 는
 *    공용 하네스(`LabRunner`)에 없다. 하네스는 8명이 공유하므로 나 혼자 고칠 수 없다.
 *    → 진단에 꼭 필요한 **슬롯당 두께 기울기**만 수치 출력으로 대체했다(F1 의 결정적 증거).
 * ═══════════════════════════════════════════════════════════════════════════ */

/* 🔴 단위 환산은 `../physics/units.ts` 가 정본이다 — 분/시는 `MINUTES_PER_HOUR`,
 *    nm/µm 은 `NM_PER_UM`. 여기서 다시 선언하지 않는다(`check-constants` R1). */

/** 대상 웨이퍼 면방위 — 원장 §1-2b 「이 절의 대상 웨이퍼는 ⟨100⟩ 이다」. */
const ORIENTATION = '100' as const;

/** 산화제 공급이 포화되는 유량. PLN `f_Q = min(1, Q/6)`. */
const Q_SATURATION_SLM = 6;

/** 배치 구성 — 보트 50장, 로딩 20 min, 언로드·언로딩 15 min. PLN `TP` 식의 상수. */
const BATCH_WAFERS = 50;
const LOAD_MIN = 20;
const UNLOAD_MIN = 15;

/** 안정화 시간을 10 → 30 min 으로 늘리면 사이클에 20 min 이 더 붙는다. PLN §심화 ②. */
const STABILIZE_EXTRA_MIN = 20;

function ambientOf(m: number): 'wet' | 'dry' {
  return m >= 0.5 ? 'wet' : 'dry';
}

/** 산화제 공급 제한 계수 f_Q = min(1, Q/6). Q ≥ 6 slm 이면 두께에 더 이상 영향이 없다. */
function supplyFactor(qSlm: number): number {
  return Math.min(1, qSlm / Q_SATURATION_SLM);
}

/**
 * 산화막 두께 [nm]. **식을 쓰지 않는다 — `dealGrove.oxideThickness` 를 부른다.**
 * `growthScale` = f_Q × (수분 혼입 배수). 위 머리주석의 「시간으로 옮기기」 근거 참조.
 */
function oxideNm(tempC: number, m: number, timeMin: number, growthScale: number): number {
  const timeH = (timeMin * growthScale) / MINUTES_PER_HOUR;
  return oxideThickness({ tempC, timeH, ambient: ambientOf(m), orientation: ORIENTATION }).value * NM_PER_UM;
}

/**
 * 웨이퍼 간 두께 산포 σ [%] — PLN 합성식.
 *   σ = [0.55 + 0.0040·(T−900) + 0.30·M + 0.09·|Q−12| + 0.04·max(0, R−6)] × k_grad × k_slip − 보정
 * 응용(S6)에는 R·k_grad·k_slip·보정이 없다 — 기본값(R=6·1.0·1.0·0)으로 부르면 PLN 응용식과 같아진다.
 */
function spreadPct(a: {
  tempC: number; m: number; qSlm: number; rampRate: number;
  kGrad: number; slip: boolean; correctionPct: number;
}): number {
  const base = 0.55
    + 0.0040 * (a.tempC - 900)
    + 0.30 * a.m
    + 0.09 * Math.abs(a.qSlm - 12)
    + 0.04 * Math.max(0, a.rampRate - 6);
  const withDisturbance = base * a.kGrad * (a.slip ? 1.4 : 1);
  return Math.max(0, withDisturbance - a.correctionPct);
}

/**
 * 배치 처리량 TP [wafer/h] — PLN 합성식.
 *   TP = 50 / (t + 20 + (T−600)/R + 15 + 추가오버헤드) × 60
 * 응용(S6)은 승온율 파라미터가 없어 R = 10 °C/min 고정이다(PLN 응용식의 `(T−600)/10`).
 */
function throughputWph(tempC: number, timeMin: number, rampRate: number, extraOvhMin: number): number {
  const cycleMin = timeMin + LOAD_MIN + (tempC - 600) / rampRate + UNLOAD_MIN + extraOvhMin;
  return (BATCH_WAFERS / cycleMin) * MINUTES_PER_HOUR;
}

/** 가스·배기 부하 지수 — PLN 명세의 3점(Q=4 → 1.0 · Q=12 → 3.0 · Q=20 → 5.0)을 지나는 직선. */
function gasLoadIndex(qSlm: number): number {
  return 1 + 0.25 * (qSlm - 4);
}

/**
 * OISF 밀도 D_sf [ea/cm²] — PLN 합성식.
 *   D_sf = 180 × exp(−(T−950)/90) × (1 − 0.15·C) × k_cont
 * 🔴 HCl 의 **정량** 효과는 원장 M-9 에서 미확보로 판정된 항목이다. 이 계수는 문헌값이 아니라
 *    PLN 이 설계한 교육용 값이며, 가르치는 것은 **방향(HCl → 게터링 → OISF 감소)** 뿐이다.
 */
function oisfDensity(tempC: number, hclPct: number, kCont: number): number {
  return 180 * Math.exp(-(tempC - 950) / 90) * (1 - 0.15 * hclPct) * kCont;
}

/**
 * 절연 파괴 전계 **상대 지수** (건식·청정·1000 °C·HCl 0 % = 1.00).
 * 🔴 절대값(MV/cm)을 반환하지 않는다 — 원장 M-36. 위 머리주석 참조.
 * PLN 합성식 `min(11.0, 10.5 − 1.2·M − 2.5·L − 0.004·(T−900) + min(2.0, 0.8·C))` 를
 * **기준 조건의 값으로 나눈 비**다. 화면에 남는 것은 비율뿐이고 절대 전계는 어디에도 나오지 않는다.
 */
const EBD_BASELINE = 10.5 - 0.004 * (1000 - 900);
function breakdownIndex(m: number, leak: number, tempC: number, hclPct: number): number {
  const raw = Math.min(11.0, 10.5 - 1.2 * m - 2.5 * leak - 0.004 * (tempC - 900) + Math.min(2.0, 0.8 * hclPct));
  return raw / EBD_BASELINE;
}

/** 배관 부식 지수 — PLN 명세의 2점(C=0 → 1.0 · C=2 → 2.6)을 지나는 직선. */
function corrosionIndex(hclPct: number): number {
  return 1 + 0.8 * hclPct;
}

function inWindow(v: number | undefined, lo: number, hi: number): boolean {
  return v !== undefined && Number.isFinite(v) && v >= lo && v <= hi;
}

/* ══════════ 🔴 두께–시간 그래프 (PLN `03_실습3단계명세.md` §P2 기초(S5) §4) ══════════
 * 🔵 **2026-08-21 DP-1 정정 후의 현행 정본을 옮긴다.** PLN 명세 「두께–시간 그래프의 곡선이
 *   **전이 두께 x ≈ A 아래에서는** 직선(기울기 B/A, 선 색 `#4CC38A`)이다가 그 뒤 √t
 *   곡선(선 색 `#F0883E`)으로 꺾이며, 꺾이는 지점에 **「선형 → 포물선 전이(x ≈ A)」**
 *   캡션이 붙는다.」
 *
 * 🔴 **식을 새로 쓰지 않았다.** 곡선의 모든 점은 `dealGrove.oxideThickness` 호출이고,
 *    전이선의 값은 `dealGrove.coefficientsAt` 이 돌려주는 **문헌 계수 A 그 자체**다.
 *    선형 점근선 x ≈ (B/A)(t+τ) 는 **그리지 않는다** — 물리층이 내주지 않는 곡선이라
 *    여기서 만들면 없는 데이터를 지어내는 것이 된다(참조 구현 `diameterZoomChart` 와 같은 판단).
 *
 * 🔴🔴 **폐기된 설계다 — 되살리지 마라.** 이 자리에는 옛 정본 문구
 *    「처음 20 nm 구간에서는 직선」이 인용돼 있었다. **PLN 이 2026-08-21 DP-1 판정으로
 *    그 문구를 정본에서 삭제**했고(삭제 선언 블록이 정본에 남아 있다), 지금 위에 옮긴 문장이
 *    그 자리를 대신한다. **정본에 없는 문구이므로 주석에 다시 적지 않는다.**
 *    폐기 근거(PLN): 「처음 20 nm」와 「x ≈ A」는 같은 지점을 가리키지 못한다. 정본 계수표
 *    (S120 Table I·II + 면방위비 1.68)의 A 는 ⟨100⟩ 기준 67.2 ~ 840 nm 이고, S5 가 노출하는
 *    온도 3택(920/1000/1100 °C · 건식)에서는 151.2 ~ 394.8 nm 다. **20 nm 는 자릿수가 다르다.**
 *    🔴 **여기 있던 원인 설명(「⟨100⟩ 보정 전 표에서 나온 수다」)은 PLN 이 채택하지 않았다** —
 *    보정 전 ⟨111⟩ 표의 A 는 건식 40/90/165/235/370 nm · 습식 50/110/226/500 nm 로 **20 인 항이
 *    하나도 없다**. 정본 기록상 원인은 **「근거 미상」**이다. 지어내서 메우지 마라.
 *
 * 🔴 **구현은 폐기 설계를 따른 적이 없다.** 전이선은 아래 `transitionNm` 이 유일하게 정하며
 *    그 값은 `dealGrove.coefficientsAt(...).A` 그 자체다. 이 파일에 20 nm 상수는 없다
 *    (전수 검색 0건 · 2026-08-22). 명세가 지정한 캡션 문구만 그대로 옮긴다.
 *
 * 🔴 ~~`judgesOutputs` 를 달지 않는다. 두께 판정은 씬(`filmGrowth`)에서 관찰 가능하다~~
 *    ~~— 명세 §4 의 스케일이 1 nm = 1.2 px 이라 합격창 10 nm 가 12 px 다. 이 차트는~~
 *    ~~「판정이 옮겨온 곳」이 아니라 성장 거동을 읽는 그림이므로 규격선만 표시한다.~~
 *
 * 🔴🔴 **2026-08-21 정정(개발팀장) — 위 판단은 사실관계가 틀렸다. `judgesOutputs` 를 단다.**
 *    위 주석은 「두께 판정은 씬에서 관찰 가능하다」고 했으나, 씬이 보여주는 것은 **두께**이지
 *    **판정**이 아니다. `src/viz/gl/scenes/filmGrowth.ts` 를 전수 검색한 결과
 *    **합격창 경계(95 nm · 105 nm)를 그리는 코드가 0건**이다(유일한 수치 히트
 *    `vec3(0.95, 0.98, 1.0)` 은 색상 상수로 무관). 즉 **학습자가 「규격 안인가」를 볼 수 있는
 *    곳은 이 차트뿐**이고, 그 규격선을 그려 놓고도 「판정한다」고 적지 않아 장식으로 보였다.
 *    → 신설 게이트 W6-4 가 「기준선 [105, 95] 가 합격창 {min:95,max:105} 경계와 정확히 일치」로
 *      이 상태를 세웠다. **게이트가 옳고 이 주석이 과보수적이었다.**
 *    🔴 판단 근거는 「게이트가 빨간불이라서」가 **아니다** — 씬 코드 실측이다(D-041 역방향 주의).
 *    화면 문구는 출력별로 좁게 나간다: `ko.json` `lab.chartJudges` = 「🔴 판정은 이 차트에서
 *    합니다 — {items}」 이며 items 는 선언한 출력명뿐이라 과대주장이 되지 않는다.
 */
const CHART_TIME_MAX_MIN = 300;
const CHART_TIME_STEPS = 120;
/** 명세 §4 의 단면 뷰 스케일 「0 → 300 nm가 0 → 360 px」 와 같은 세로 범위. */
const CHART_THICK_MAX_NM = 300;

function thicknessTimeChart(): LabChartBinding {
  return {
    id: 'oxidation.thicknessTime',
    kind: 'line',
    ko: '두께–시간 그래프',
    en: 'Thickness vs. time',
    // 🔴 2026-08-21 — 합격창 경계(95·105 nm)를 그리는 유일한 화면이다. 위 정정 주석 참조.
    judgesOutputs: ['thicknessNm'],
    xKo: '산화 시간 t', xEn: 'Oxidation time', xUnit: 'min',
    yKo: '산화막 두께 x_ox', yEn: 'Oxide thickness', yUnit: 'nm',
    xDomain: [0, CHART_TIME_MAX_MIN],
    yDomain: [0, CHART_THICK_MAX_NM],
    refLines: [
      { value: PASS_MAX_NM, ko: '규격 상한 105 nm', en: 'Spec upper 105 nm', tone: 'spec' },
      { value: PASS_MIN_NM, ko: '규격 하한 95 nm', en: 'Spec lower 95 nm', tone: 'spec' },
    ],
    captionKo: '선형 → 포물선 전이(x ≈ A)',
    captionEn: 'Linear → parabolic transition (x ≈ A)',
    note: '가로축 전 구간을 현재 온도의 정본 계수(S120 건식 ⟨100⟩)로 다시 계산한 곡선입니다. 초반의 직선 구간은 계면 반응이, 뒤의 √t 구간은 산화종 확산이 속도를 정합니다. 전이선은 문헌 계수 A 자체이며 920 °C 에서는 A = 394.8 nm 로 세로축(300 nm) 위에 있습니다 — 즉 920 °C 곡선은 시간 상한까지 전부 선형 영역이고, 그것이 「저온에서는 시간으로 메울 수 없다」의 정체입니다.',
    build: (inputs, outputs) => {
      const tempC = nearestTemp(inputs['tempC'] ?? 1000);
      // 🔴 물리층 호출 — 문헌 계수 A(µm) 를 그대로 받아 nm 로 환산만 한다.
      const transitionNm = coefficientsAt(tempC, 'dry', ORIENTATION).A * NM_PER_UM;
      const curve: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= CHART_TIME_STEPS; i++) {
        const timeMin = (i / CHART_TIME_STEPS) * CHART_TIME_MAX_MIN;
        // 🔴 물리층 호출 — Deal–Grove 명시해. f_Q 가 없는 기초(S5) 조건이라 성장 배율은 1 이다.
        curve.push({ x: timeMin, y: oxideNm(tempC, 0, timeMin, 1) });
      }
      return [
        { id: 'growth', ko: `${tempC} °C 건식 성장 곡선`, en: `${tempC} °C dry growth curve`, points: curve },
        {
          id: 'transition',
          ko: `선형 → 포물선 전이 x ≈ A = ${transitionNm.toFixed(1)} nm`,
          en: `Linear → parabolic transition x ≈ A = ${transitionNm.toFixed(1)} nm`,
          points: [{ x: 0, y: transitionNm }, { x: CHART_TIME_MAX_MIN, y: transitionNm }],
          dashed: true,
        },
        // 🔴 2026-08-21 추가 — **현재 동작점**. 이것이 없으면 규격선을 그려 놓고도
        //    학습자가 「지금 내 값이 창 안인가」를 읽을 수 없어, judgesOutputs 배지가
        //    화면이 뒷받침하지 못하는 주장이 된다(독립 검증 §4-C 지적 ㉮).
        //    photo `operating` · wafer 와 같은 관례를 따른다. 식을 새로 쓰지 않는다 —
        //    세로 위치는 `compute()` 가 이미 낸 판정값 `thicknessNm` 그대로다.
        {
          id: 'operating',
          ko: '현재 시간·두께',
          en: 'Current time and thickness',
          points: [
            { x: inputs['timeMin'] ?? 0, y: 0 },
            { x: inputs['timeMin'] ?? 0, y: outputs['thicknessNm'] ?? oxideNm(tempC, 0, inputs['timeMin'] ?? 0, 1) },
          ],
          dashed: true,
        },
      ];
    },
  };
}

/* ── 응용(S6) 합격창 · 범위 ─────────────────────────────────────────────────
 * 🔴 **합격창을 옮기지 않았다.** 정본 계수(습식 Table I × 면방위비 → ⟨100⟩)로 직접 재계산한
 *    결과 PLN 표와 소수점까지 일치했다. 기초(S5)와 달리 응용은 습식이 주력이라
 *    ⟨100⟩ 보정 누락 문제가 없었다 — PLN 의 습식 수치는 처음부터 ⟨100⟩ 로 맞아 있었다.
 *
 * 🔴 검산 (2026-08-20 · DEV · 정본 S120 Table I·II + A_⟨100⟩ = 1.68 × A_⟨111⟩):
 *    · 1000 °C 건식 80 min → 59.2 nm  (PLN 59.2 ✅)
 *    · 1000 °C 습식 80 min → 457.2 nm (PLN 457.2 ✅ · 7.7배 ✅)
 *    · 1100 °C 건식 300 min → 302.2 nm (PLN 산출값 302 nm ✅ — 건식 상한이 380 nm 에 못 미친다)
 *    · **기본값** T=1000·건식·t=150·Q=4 → x = 68.9 nm ❌ / σ = 1.67 % ❌ / TP = 13.33 ❌
 *      → **3개 전부 불합격.** (f_Q 미적용 시 91.2 nm. PLN 표의 91 nm 는 f_Q 를 빼고 센 값이다)
 *    · **합격 조합 ①** T=1000·습식·t=65·Q=12 → x = 399.2 ✅ / σ = 1.25 ✅ / TP = 21.43 ✅
 *    · **합격 조합 ②** T=1000·습식·t=70·Q=12 → x = 419.2 ✅ / σ = 1.25 ✅ / TP = 20.69 ✅
 *    · **합격 조합 ③** T=1000·습식·t=65·Q=11 → x = 399.2 ✅ / σ = 1.34 ✅ / TP = 21.43 ✅
 *      (Q 는 10~14 slm 이 σ 1.5 % 안에 든다)
 *    · 920 °C 습식은 t 137~156 min 에서 두께는 들어오지만 TP 14.5 ❌ — 저온의 대가가 처리량이다.
 *    · 1100 °C 는 σ = 1.65 % ❌ 로 막힌다 — 고온의 대가가 균일도다.
 *    → **죽은 판정 아님.**
 * ─────────────────────────────────────────────────────────────────────────── */

const S6_PASS_THICK_MIN_NM = 380;
const S6_PASS_THICK_MAX_NM = 420;
const S6_PASS_SIGMA_MAX_PCT = 1.5;
const S6_PASS_TP_MIN_WPH = 18;

/** 응용은 승온율 파라미터가 없다 — PLN `TP` 식이 `(T−600)/10` 으로 고정한 값. */
const S6_FIXED_RAMP = 10;

const S6_TEMP_RANGE: [number, number] = [920, 1100];
const S6_TIME_RANGE: [number, number] = [10, 300];
const S6_Q_RANGE: [number, number] = [2, 20];
const S6_M_RANGE: [number, number] = [0, 1];

/* ── 심화(S7) 합격창 · 범위 ─────────────────────────────────────────────────
 * 🔴 **합격창을 옮기지 않았다.** 다만 **시간 스텝을 5 → 1 min 으로 줄였다.** 사유:
 *    1100 °C 습식에서 t=25 min → 377.7 nm, t=30 min → 421.0 nm 로 **5분 격자가 385~415 nm
 *    창을 통째로 건너뛴다.** 그리고 F1(온도 구배) 복구해는 t ≈ 27 min 에만 존재한다
 *    (아래 검산). 스텝 1 min 은 5 min 격자의 상위집합이라 잃는 것이 없다.
 *
 * 🔴 검산 (2026-08-20 · DEV):
 *    · **기본값** T=1000·건식·t=150·Q=4·R=10·C=0·F2+F3 활성
 *      → x = 79.0 nm ❌(<385) / σ = 1.83 % ❌ / E_rel = 0.752 ❌(<0.90)
 *        / D_sf = 826 ea/cm² ❌ / TP = 13.33 ❌ → **5개 전부 불합격**
 *      (PLN 은 111 nm 로 적었다 — f_Q 미적용분 차이다. 판정 결과는 같다)
 *    · **합격 조합 ①(F2+F3 · 기본 시나리오)** T=1000·습식·t=65·Q=12·R=10·C=2·리크점검 실행
 *      → x = 399.2 ✅ / σ = 1.41 ✅ / E_rel = 1.040 ✅ / D_sf = 72.3 ✅ / TP = 21.43 ✅
 *      (PLN 의 기준 해와 두께·σ·D_sf·TP 가 전부 일치한다)
 *    · **합격 조합 ②(F1 · 온도 구배)** T=1100·습식·t=27·Q=12·**R=6**·C=2·**더미 10장**·**안정화 30 min**
 *      → x = 395.5 ✅ / σ = 1.20 ✅ / E_rel = 1.000 ✅ / D_sf = 23.8 ✅ / TP = 18.15 ✅
 *      (셋을 다 적용해야 k_grad 가 1.8 → 1.0 이 된다. 하나라도 빠지면 σ = 3.26 % ❌)
 *    · **합격 조합 ③(정상)** T=1000·습식·t=65·Q=12·R=10·**C=0.5**
 *      → x = 399.2 ✅ / σ = 1.41 ✅ / E_rel = 0.921 ✅ / D_sf = 95.5 ✅ / TP = 21.43 ✅
 *      (C=0 이면 D_sf = 103.3 ❌ — 청정 조건에서도 HCl 을 조금은 써야 한다)
 *    · **복구를 빼면 반드시 깨진다:** F2 에서 리크 점검을 하지 않으면 두께를 t 로 맞춰도
 *      E_rel = 0.792 ❌ 다. F3 에서 C < 1 이면 k_cont = 8 → D_sf ≥ 800 ❌ 다.
 *    → **죽은 판정 아님.**
 * ─────────────────────────────────────────────────────────────────────────── */

const S7_PASS_THICK_MIN_NM = 385;
const S7_PASS_THICK_MAX_NM = 415;
const S7_PASS_SIGMA_MAX_PCT = 1.5;
const S7_PASS_EBD_INDEX_MIN = 0.90;
const S7_PASS_OISF_MAX = 100;
const S7_PASS_TP_MIN_WPH = 18;

/** F1 활성 시 승온율을 이 값 이하로 내려야 k_grad 복구 조건 하나가 채워진다. */
const S7_RAMP_RECOVERY_MAX = 6;
/** F4(급속 승온 슬립) 발동 승온율. */
const S7_SLIP_RAMP = 13;
/** F1 미복구 시 산포 배수. */
const S7_KGRAD_DISTURBED = 1.8;
/** F3 미게터링(C < 1 %) 시 오염 배수. */
const S7_KCONT_DIRTY = 8;
const S7_HCL_GETTER_MIN = 1;
/** F1 이 슬롯별 두께에 얹는 선형 기울기 [%/slot]. 50개 막대 그래프 대신 수치로 낸다. */
const S7_SLOT_SLOPE_PCT = 0.13;
/** F2(수분 혼입) 미해소 시 성장 속도 배수. */
const S7_MOISTURE_GROWTH = 1.22;

const S7_DUMMY_CORRECTION_PCT = 0.25;
const S7_STABILIZE_CORRECTION_PCT = 0.20;

const S7_TIME_RANGE: [number, number] = [10, 300];
const S7_Q_RANGE: [number, number] = [2, 20];
const S7_RAMP_RANGE: [number, number] = [2, 15];
const S7_HCL_RANGE: [number, number] = [0, 5];
const S7_SCENARIO_RANGE: [number, number] = [0, 4];

/** 불량 시나리오 코드. 0 정상 · 1 F1 온도구배 · 2 F2 수분혼입 · 3 F3 금속오염 · 4 F2+F3. */
const SC_GRADIENT = 1;
const SC_MOISTURE = 2;
const SC_CONTAM = 3;
const SC_BOTH = 4;

interface AdvState {
  tempC: number; m: number; timeMin: number; qSlm: number; rampRate: number; hclPct: number;
  purge: number; dummy10: boolean; stab30: boolean; scenario: number;
}

function advState(inputs: Readonly<Record<string, number>>): AdvState {
  return {
    tempC: nearestTemp(inputs['tempC'] ?? 1000),
    m: (inputs['ambient'] ?? 0) >= 0.5 ? 1 : 0,
    timeMin: inputs['timeMin'] ?? 150,
    qSlm: inputs['flowSlm'] ?? 4,
    rampRate: inputs['rampRate'] ?? 10,
    hclPct: inputs['hclPct'] ?? 0,
    purge: (inputs['leakPurge'] ?? 0) >= 0.5 ? 1 : 0,
    dummy10: (inputs['dummyWafers'] ?? 5) >= 10,
    stab30: (inputs['stabilizeMin'] ?? 10) >= 30,
    scenario: Math.round(inputs['faultScenario'] ?? SC_BOTH),
  };
}

const mapAdvancedOxidationScene: LabSceneBinding['map'] = (_inputs, out) => ({
  thickness: clamp01((out['thicknessNm'] ?? 0) / 600),
  uniformity: clamp01(1 - (out['spreadPct'] ?? 0) / 3),
});

const hasGradient = (s: AdvState): boolean => s.scenario === SC_GRADIENT;
const hasMoisture = (s: AdvState): boolean => s.scenario === SC_MOISTURE || s.scenario === SC_BOTH;
const hasContam = (s: AdvState): boolean => s.scenario === SC_CONTAM || s.scenario === SC_BOTH;

/** k_grad — F1 활성 + (승온율 ≤ 6 · 안정화 30 min · 더미 10장) 셋을 다 적용해야 1.0 으로 돌아온다. */
function gradientFactor(s: AdvState): number {
  if (!hasGradient(s)) return 1;
  const recovered = s.rampRate <= S7_RAMP_RECOVERY_MAX && s.stab30 && s.dummy10;
  return recovered ? 1 : S7_KGRAD_DISTURBED;
}

/** L — 배관 수분 누설. F2 활성이고 리크 점검·N₂ 퍼지를 실행하지 않았을 때만 1. */
function leakFlag(s: AdvState): number {
  return hasMoisture(s) && s.purge === 0 ? 1 : 0;
}

/** k_cont — F3 활성이고 HCl 이 1 % 미만일 때만 8. HCl 게터링이 걸리면 1. */
function contamFactor(s: AdvState): number {
  return hasContam(s) && s.hclPct < S7_HCL_GETTER_MIN ? S7_KCONT_DIRTY : 1;
}

export const OXIDATION_LABS: LabSpec[] = [
  {
    processId: PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P2-03',
    titleKo: '온도와 시간으로 산화막 두께 맞추기',
    titleEn: 'Hit the target oxide thickness with temperature and time',
    params: [
      {
        id: 'tempC', ko: '산화 온도', en: 'Oxidation temperature', unit: '°C',
        min: 920, max: 1100, step: 90, initial: 1000, sourceId: 'S120',
        /* 🔴 화면이 내는 값의 정본. 간격이 80·100 으로 달라 `step` 하나로는 표현할 수 없다 —
           `step: 90` 만 두면 격자가 920·**1010**·1100 이 되어 화면이 1010 을 보이는 동안
           `nearestTemp()` 가 1000 으로 스냅해 계산한다. `min`·`max`·`step` 은 그대로 두고
           여기서 **모델이 쓰는 그 상수를 그대로** 넘긴다(값을 손으로 다시 적지 않는다). */
        options: TEMPS,
        note: '정본표 온도 3택(920 / 1000 / 1100). 보간하지 않는다.',
      },
      {
        id: 'timeMin', ko: '산화 시간', en: 'Oxidation time', unit: 'min',
        min: 10, max: 300, step: 5, initial: 30, sourceId: 'S120',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P2 기초(S5):
     *   「고정 조건(조작 불가, **화면에 배지로 표시**): 분위기 = 건식 O₂ · 산화제 유량 Q = 12 slm ·
     *     승온율 R = 10 °C/min · 웨이퍼 방위 (100) · 압력 1 atm.」
     *   면방위는 §P2 공통 전제가 다시 「**⟨100⟩** 으로 확정하고 **화면 조건 카드에 상시 표시**한다」로
     *   위치까지 규정했다 — 기초 고정 조건의 「(100)」과 같은 항목이라 하나로 싣는다.
     *
     * 🔴 **5개 전부** 슬라이더(`params`)와 겹치지 않는다 — 이 단계의 조작 파라미터는 T·t 둘뿐이다.
     * 🔴 Q·R 은 **이 단계 계산에 들어가지 않는다**(기초는 Deal-Grove 두께만 낸다). 그래도 명세가
     *    고정 조건으로 선언했으므로 그대로 싣고, 「어디에서 살아나는 값인가」를 note 에 남긴다. */
    fixedConditions: [
      {
        id: 'ambient', ko: '분위기', en: 'Ambient',
        value: '건식 O₂', valueEn: 'Dry O₂',
        basis: 'PLN 명세 §P2 기초(S5)고정 조건. 기초 단계는 분위기를 조작하지 않는다 — 건식/습식을 고르는 것은 응용(§S6)의 학습 내용이다.',
        note: '`oxideThickness({ ambient: \'dry\' })` 로 고정 호출한다. 건식 계수는 S120 Table II 실측표다(습식 Table I 과 섞지 않는다).',
      },
      {
        id: 'pressureAtm', ko: '압력', en: 'Pressure',
        value: '1', unit: 'atm', sourceId: 'S120',
        note: '건식 산화 정본표(S120 Table II)가 실측된 압력이 1 atm 이다. 습식 Table I 은 640 Torr 라 두 표를 섞을 수 없다.',
      },
      {
        /* 🔴 상수가 없다 — 기초 단계 계산에 Q 가 들어가지 않기 때문이다. 이 파일에서 12 는
           산포식 `0.09·|Q − 12|`(144행) 안의 **최적 유량**으로만 등장하고 이름이 붙어 있지 않다. */
        id: 'oxidantFlow', ko: '산화제 유량 Q', en: 'Oxidant flow',
        value: '12', unit: 'slm',
        basis: 'PLN 명세 §P2 기초(S5)고정 조건(교육용 설정). 기초 두께식에는 들어가지 않는다.',
        note: '응용(§S6)에서 슬라이더로 열리며, 산포식 σ 의 `0.09·|Q − 12|` 항이 12 slm 을 최적점으로 잡는다 — 기초는 그 최적점에 고정해 둔 것이다.',
      },
      {
        /* 🔴 상수가 없다. `S6_FIXED_RAMP`(=10)이 같은 수를 담고 있지만 그것은 **응용 단계
           처리량식 `(T−600)/10` 의 상수**라 의미가 다르다 — 끌어오면 응용의 식을 손댈 때
           기초의 조건 카드가 함께 흔들린다. 값이 같다는 이유로 묶지 않는다. */
        id: 'rampRate', ko: '승온율 R', en: 'Ramp rate',
        value: '10', unit: '°C/min',
        basis: 'PLN 명세 §P2 기초(S5)고정 조건(교육용 설정). 기초 두께식에는 들어가지 않는다.',
        note: '심화(§S7)에서 슬라이더로 열린다 — 6 °C/min 이하로 내려야 온도 구배 외란이 복구되고, 13 °C/min 이상이면 급속 승온 슬립이 발동한다.',
      },
      {
        id: 'orientation', ko: '웨이퍼 면방위', en: 'Wafer orientation',
        value: `⟨${ORIENTATION}⟩`,
        basis: 'PLN 명세 — 원문에 면방위가 어디에도 없어 CMOS 표준 ⟨100⟩ 으로 확정하고 「화면 조건 카드에 상시 표시」로 규정했다.',
        note: '🔴 면방위비 1.68 이 Deal-Grove 선형항 A 에만 걸린다(S120). 면방위를 적지 않으면 두께가 결정되지 않는다 — 그래서 조건 카드에서 뺄 수 없는 값이다.',
      },
    ],
    outputs: [
      { id: 'thicknessNm', ko: '산화막 두께 x_ox', en: 'Oxide thickness', role: 'judge',
        pass: { min: PASS_MIN_NM, max: PASS_MAX_NM }, digits: 1 },
      { id: 'siConsumedNm', ko: '소모 Si 두께 x_Si', en: 'Silicon consumed', role: 'display', digits: 1 },
      { id: 'surfaceRiseNm', ko: '표면 융기 x_up', en: 'Surface rise', role: 'display', digits: 1 },
      { id: 'growthRateNmPerMin', ko: '순간 성장률', en: 'Instantaneous growth rate', role: 'display', digits: 3 },
    ],
    compute(inputs) {
      const tempC = nearestTemp(inputs['tempC'] ?? 1000);
      const timeMin = inputs['timeMin'] ?? 30;
      const timeH = timeMin / 60;

      const xUm = oxideThickness({ tempC, timeH, ambient: 'dry', orientation: '100' });
      const xNm = xUm.value * 1000;
      const siUm = siliconConsumed(xUm.value);

      // 순간 성장률 — 수치 미분. 물리 상수가 아니라 계산 방식이다.
      const eps = Math.max(timeH, 1) / 1000;
      const xPlus = oxideThickness({ tempC, timeH: timeH + eps, ambient: 'dry', orientation: '100' }).value;
      const rate = ((xPlus - xUm.value) * 1000) / (eps * 60);

      return {
        thicknessNm: quantity(xNm, {
          modelId: 'oxidation.lab.thicknessNm', unit: 'nm', sourceId: 'S120',
          validRange: [0, 2000],
          assumptions: ['건식 O₂ 1 atm', '⟨100⟩', `정본표 ${tempC} °C`],
        }),
        siConsumedNm: quantity(siUm.value * 1000, {
          modelId: 'oxidation.lab.siConsumedNm', unit: 'nm', sourceId: 'S121', validRange: [0, 1000],
        }),
        surfaceRiseNm: quantity(xNm - siUm.value * 1000, {
          modelId: 'oxidation.lab.surfaceRiseNm', unit: 'nm', sourceId: 'S121', validRange: [0, 2000],
        }),
        growthRateNmPerMin: quantity(rate, {
          modelId: 'oxidation.lab.growthRate', unit: 'nm/min', sourceId: 'S120', validRange: [0, 100],
        }),
      };
    },
    scene: {
      sceneId: 'filmGrowth',
      // 🔴 DSN `12_시각화씬_공백보고.md` §4-1 확인 매핑만 쓴다.
      //    `roughness` 는 매핑 근거가 없어 매핑하지 않는다. `tint` 는 S번호 확정 전까지 보류.
      map: (_inputs, out) => ({
        /* 🔴 2026-08-22 — 총 두께를 **랩이 이미 낸 두 조각의 합**으로 넘긴다.
         *    값은 종전(x_ox/300)과 **한 자리도 다르지 않다** — compute() 가
         *    표면 융기 = x_ox − x_Si 로 만들므로 x_Si + x_up ≡ x_ox 인 항등식이다.
         *    새 계수·새 스케일을 하나도 넣지 않았다.
         *
         *    이렇게 적는 이유는 **씬이 실제로 하는 일이 그 가름**이기 때문이다.
         *    `filmGrowth` 는 받은 총 두께를 산화 전 원표면(ORIG_SURFACE)을 기준으로
         *      · 아래로 파고든 몫 = 소모 Si (계면이 내려간다)
         *      · 위로 융기한 몫  = 표면 융기 (막 상면이 올라간다)
         *    로 갈라 그리고, 그 가름에 쓰는 상수는 랩의 소모 Si 출력을 만드는 것과
         *    **같은 S121 §4.1 의 0.44**다 — 씬이 지어낸 계수가 아니라 물리층
         *    `dealGrove.SI_CONSUMPTION_RATIO` 를 `viz/gl/scenes/models/filmGrowth.model.ts`
         *    가 그대로 받아 쓴다(그 파일 머리주석이 「랩의 소모 Si·표면 융기와 같은 비율」이라고 적어 둔 그것이다).
         *    즉 학습자가 보는 **계면 하강량이 곧 소모 Si 두께**, **막 상면 융기량이 곧 표면 융기**이므로,
         *    화면에 넘기는 총 두께를 그 두 출력의 합으로 적는 것이 화면의 사실 그대로다. */
        thickness: clamp01((((out['siConsumedNm'] ?? 0) + (out['surfaceRiseNm'] ?? 0))) / 300),
        // 두께가 커질수록 계면 도달이 어려워지는 것을 균일도 저하로 표현한다.
        uniformity: clamp01(1 - (out['thicknessNm'] ?? 0) / 600),
      }),
      note: 'thickness = (x_Si + x_up)/300 nm — 씬이 총 두께를 원표면 기준으로 「소모 Si(계면 하강) + 표면 융기(막 상면)」로 갈라 그리고 그 가름 상수가 x_Si 를 만드는 것과 같은 S121 0.44 라서, 그 두 조각의 합으로 넘긴다(값은 x_ox 와 동일한 항등식). uniformity 는 막 두께에 따른 계면 도달 난이도. roughness·tint 는 근거 미확보로 매핑하지 않음(DSN §4-1).',
    },
    charts: [thicknessTimeChart()],   // 🔴 PLN 명세 §P2 S5 §4 — 선형 → 포물선 전이 지점을 캡션으로 표시한다
    feedback: [
      {
        id: 'OX-F1', tone: 'warn',
        ko: '배치 사이클이 6시간에 가깝습니다. 처리량 조건이 있는 응용실습에서는 불합격이 됩니다.',
        en: 'The batch cycle approaches six hours. This would fail the applied stage, which judges throughput.',
        when: (i) => (i['timeMin'] ?? 0) >= 280,
      },
      {
        id: 'OX-F2', tone: 'hint',
        ko: '920 °C 로는 시간 상한(300분)을 다 써도 목표 두께에 닿지 못합니다. 저온에서는 시간으로 메울 수 없습니다 — 온도를 올려 보세요.',
        en: 'At 920 °C the target is unreachable even at the 300 min limit. Low temperature cannot be compensated with time — raise the temperature.',
        when: (i) => nearestTemp(i['tempC'] ?? 1000) === 920,
      },
      {
        id: 'OX-F3', tone: 'hint',
        ko: '선형 영역에서는 시간에 거의 비례하지만, 두꺼워지면 포물선 영역에 들어가 시간을 2배로 해도 두께는 √2배 남짓입니다.',
        en: 'Growth is near-linear at first, but once in the parabolic regime doubling the time only gains about √2 in thickness.',
        when: (_i, o) => (o['thicknessNm'] ?? 0) > 0 && (o['thicknessNm'] ?? 0) < PASS_MIN_NM,
      },
      {
        id: 'OX-F4', tone: 'stop',
        ko: '목표를 초과했습니다. 산화는 되돌릴 수 없습니다 — 시간이나 온도를 낮춰 처음부터 다시 실행해야 합니다.',
        en: 'Target exceeded. Oxidation is irreversible — lower time or temperature and run again from the start.',
        when: (_i, o) => (o['thicknessNm'] ?? 0) > PASS_MAX_NM,
      },
    ],
    tradeoffs: [
      {
        ko: '온도↑ → 목표 도달 시간이 크게 준다(좋음) / 슬롯 간 두께 산포가 벌어진다(나쁨).',
        en: 'Higher temperature reaches the target much faster (good) but widens slot-to-slot spread (bad).',
      },
      {
        ko: '시간↑ → 두께가 목표에 가까워진다(좋음) / 사이클 시간이 늘어 시간당 처리량이 떨어진다(나쁨).',
        en: 'Longer time approaches the target (good) but lowers wafers-per-hour (bad).',
      },
      {
        ko: '두 파라미터 모두 소모 Si 두께를 함께 키운다 — 산화막 100 nm 를 얻으면 기판이 44 nm 사라진다.',
        en: 'Both parameters also consume more silicon — 100 nm of oxide costs 44 nm of substrate.',
      },
    ],
  },

  /* ─────────────── 응용 (S6) — 「두께·균일도·처리량을 동시에」 ─────────────── */
  {
    processId: PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P2-04',
    titleKo: '필드 산화막 두께·균일도·처리량 3개를 동시에 맞추기',
    titleEn: 'Hit thickness, uniformity and throughput at the same time',
    params: [
      {
        id: 'tempC', ko: '산화 온도 T', en: 'Oxidation temperature', unit: '°C',
        min: 920, max: 1100, step: 90, initial: 1000, sourceId: 'S120',
        /* 🔴 화면이 내는 값의 정본. 간격이 80·100 으로 달라 `step` 하나로는 표현할 수 없다 —
           `step: 90` 만 두면 격자가 920·**1010**·1100 이 되어 화면이 1010 을 보이는 동안
           `nearestTemp()` 가 1000 으로 스냅해 계산한다. `min`·`max`·`step` 은 그대로 두고
           여기서 **모델이 쓰는 그 상수를 그대로** 넘긴다(값을 손으로 다시 적지 않는다). */
        options: TEMPS,
        note: '정본표 온도 3택(920 / 1000 / 1100). 습식·건식 표에 모두 있는 온도만 골랐다. 보간하지 않는다.',
      },
      {
        id: 'ambient', ko: '산화 분위기 M (0 = 건식 O₂ · 1 = 습식 H₂O)', en: 'Ambient (0 = dry O2, 1 = wet H2O)', unit: '',
        min: 0, max: 1, step: 1, initial: 0, sourceId: 'S120',
        note: '건식은 Table II(1 atm), 습식은 Table I(640 Torr) 실측표를 쓴다. 두 표를 섞지 않는다.',
      },
      {
        id: 'timeMin', ko: '산화 시간 t', en: 'Oxidation time', unit: 'min',
        min: 10, max: 300, step: 5, initial: 150,
        basis: 'PLN 03_실습3단계명세 §P2 응용 ② — 배치로 1회 운전 시간 범위(장비 운전 한계). 문헌 수치가 아니다.',
      },
      {
        id: 'flowSlm', ko: '산화제 유량 Q', en: 'Oxidant flow', unit: 'slm',
        min: 2, max: 20, step: 1, initial: 4,
        basis: 'PLN 03_실습3단계명세 §P2 응용 ② — 유량 공급 제한 f_Q = min(1, Q/6) 시나리오에서 유도한 구간. 문헌 수치가 아니다.',
      },
    ],
    outputs: [
      { id: 'thicknessNm', ko: '산화막 평균 두께 x̄', en: 'Mean oxide thickness', role: 'judge',
        pass: { min: S6_PASS_THICK_MIN_NM, max: S6_PASS_THICK_MAX_NM }, digits: 1 },
      { id: 'spreadPct', ko: '웨이퍼 간 두께 산포 σ (1σ/평균)', en: 'Wafer-to-wafer spread', role: 'judge',
        pass: { max: S6_PASS_SIGMA_MAX_PCT }, digits: 2 },
      { id: 'throughputWph', ko: '배치 처리량 TP', en: 'Batch throughput', role: 'judge',
        pass: { min: S6_PASS_TP_MIN_WPH }, digits: 2 },
      { id: 'supplyFactorQ', ko: '산화제 공급 제한 계수 f_Q', en: 'Oxidant supply factor', role: 'display', digits: 3 },
      { id: 'gasLoadIndex', ko: '가스·배기 부하 지수', en: 'Gas and exhaust load index', role: 'display', digits: 2 },
      { id: 'siConsumedNm', ko: '소모 Si 두께 x_Si', en: 'Silicon consumed', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const tempC = nearestTemp(inputs['tempC'] ?? 1000);
      const m = (inputs['ambient'] ?? 0) >= 0.5 ? 1 : 0;
      const timeMin = inputs['timeMin'] ?? 150;
      const qSlm = inputs['flowSlm'] ?? 4;

      assertWithin('tempC', tempC, S6_TEMP_RANGE, '°C');
      assertWithin('ambient', m, S6_M_RANGE, '');
      assertWithin('timeMin', timeMin, S6_TIME_RANGE, 'min');
      assertWithin('flowSlm', qSlm, S6_Q_RANGE, 'slm');

      const fQ = supplyFactor(qSlm);
      const xNm = oxideNm(tempC, m, timeMin, fQ);
      const siNm = siliconConsumed(xNm / NM_PER_UM).value * NM_PER_UM;
      const sigma = spreadPct({ tempC, m, qSlm, rampRate: S6_FIXED_RAMP, kGrad: 1, slip: false, correctionPct: 0 });
      const tp = throughputWph(tempC, timeMin, S6_FIXED_RAMP, 0);

      const common = [
        m === 1 ? '습식 H₂O 640 Torr (S120 Table I)' : '건식 O₂ 1 atm (S120 Table II)',
        '면방위 ⟨100⟩ — A_⟨100⟩ = 1.68 × A_⟨111⟩ (선형항에만)',
        `정본표 ${tempC} °C · 온도 보간 없음`,
      ];
      return {
        thicknessNm: quantity(xNm, {
          modelId: 'oxidation.lab.applied.thicknessNm', unit: 'nm', basis: "교육용 합성 — Deal-Grove 문헌식에 교육용 산화제 공급제한 f_Q = min(1, Q/6)을 곱한 시간으로 계산한 값입니다 — 포화 유량 6 slm 은 문헌값이 아닙니다.",
          validRange: [0, 2000],
          assumptions: [...common,
            'f_Q = min(1, Q/6) 는 성장 시간에 곱해 반영했다 — B·B/A 를 f 배 하는 것과 대수적으로 동일하다'],
        }),
        spreadPct: quantity(sigma, {
          modelId: 'oxidation.lab.applied.spreadPct', unit: '%', basis: "교육용 합성 — 웨이퍼 간 산포는 학습용 선형 합성식이며 실측 장비 산포가 아닙니다.",
          validRange: [0, 20],
          assumptions: [...common,
            '🔴 PLN 이 설계한 교육용 합성식이다. 실측 장비 산포가 아니다',
            'σ = 0.55 + 0.0040·(T−900) + 0.30·M + 0.09·|Q−12| — 최적 유량은 12 slm'],
        }),
        throughputWph: quantity(tp, {
          modelId: 'oxidation.lab.applied.throughputWph', unit: 'wafer/h', basis: "교육용 합성 — 보트 50장·로딩 20분·언로드 15분을 가정한 학습용 배치 스루풋 모형입니다.",
          validRange: [0, 200],
          assumptions: [...common,
            '🔴 PLN 이 설계한 교육용 합성식이다',
            '보트 50장 · 로딩 20 min · 램프업 (T−600)/10 min · 언로드 15 min'],
        }),
        supplyFactorQ: quantity(fQ, {
          modelId: 'oxidation.lab.applied.supplyFactorQ', unit: '', basis: "교육용 합성 — 포화 유량 6 slm 을 가정한 학습용 공급제한 계수입니다.",
          validRange: [0, 1],
          assumptions: ['Q ≥ 6 slm 이면 1.0 — 그 위로는 두께가 더 늘지 않는다'],
        }),
        gasLoadIndex: quantity(gasLoadIndex(qSlm), {
          modelId: 'oxidation.lab.applied.gasLoadIndex', unit: '', basis: "교육용 합성 — 유량 3점(4→1.0 · 12→3.0 · 20→5.0)을 지나는 학습용 직선 지수입니다.",
          validRange: [0, 10],
          assumptions: ['🔴 PLN 명세의 3점(Q=4 → 1.0 · Q=12 → 3.0 · Q=20 → 5.0)을 지나는 교육용 직선'],
        }),
        siConsumedNm: quantity(siNm, {
          modelId: 'oxidation.lab.applied.siConsumedNm', unit: 'nm', basis: "교육용 합성 — 소모비 0.44(S121)는 문헌값이나 곱해지는 두께가 교육용 공급제한 계수를 거친 값입니다.",
          validRange: [0, 1000],
          assumptions: ['소모 Si : 산화막 = 0.44 : 1 (S121 §4.1)'],
        }),
      };
    },
    scene: {
      sceneId: 'filmGrowth',
      // 🔴 DSN `12_시각화씬_공백보고.md` §4-1 확인 매핑만 쓴다.
      //    `roughness` 는 매핑 근거가 없어 매핑하지 않는다(§4-1 공백 4).
      //    `tint` 는 S번호 확정 전까지 보류다(§4-1 공백 5).
      //    🔴 습식이라고 기공(void)을 그리게 하는 파라미터는 넘기지 않는다 — 습식막은
      //       다공질이 아니라 덜 치밀한 비정질막이다(PLN 정정 · DSN §4-1 제약).
      map: (_inputs, out) => ({
        thickness: clamp01((out['thicknessNm'] ?? 0) / 600),
        // 🔴 DSN 공백 3(uniformity 의 0/1 방향이 규격에 없다)에 대한 **DEV 정의**:
        //    1 = 균일 · 0 = 불균일. σ 3 % 를 0 으로 두는 선형 매핑이다.
        uniformity: clamp01(1 - (out['spreadPct'] ?? 0) / 3),
      }),
      note: 'thickness = x̄/600 nm(필드 산화막 스케일) · uniformity = 1 − σ/3 %(1 = 균일, DEV 정의 — DSN §4-1 공백 3). roughness·tint 는 근거 미확보로 매핑하지 않음.',
    },
    feedback: [
      {
        id: 'OX6-F1', tone: 'warn',
        ko: '산화제 공급 제한이 걸려 있습니다(f_Q < 1). 계면에 도달하는 산화종이 모자라 시간을 늘려도 두께가 잘 늘지 않습니다 — 유량을 6 slm 이상으로 올리세요.',
        en: 'Oxidant supply is limiting (f_Q < 1). Too few oxidant species reach the interface, so more time buys little thickness — raise the flow to at least 6 slm.',
        when: (i) => (i['flowSlm'] ?? 4) < 6,
      },
      {
        id: 'OX6-F2', tone: 'hint',
        ko: '건식은 400 nm급 필드 산화막에 실용적이지 않습니다. 시간 상한(300분)에서도 목표에 못 미치고 처리량 조건이 먼저 깨집니다 — 분위기를 습식으로 전환하세요.',
        en: 'Dry oxidation is impractical for a 400 nm field oxide. Even at the 300 min limit it falls short, and the throughput target breaks first — switch to a wet ambient.',
        when: (i, o) => (i['ambient'] ?? 0) < 0.5
          && (i['timeMin'] ?? 0) >= 300
          && (o['thicknessNm'] ?? 0) < S6_PASS_THICK_MIN_NM,
      },
      {
        id: 'OX6-F3', tone: 'warn',
        ko: '산포 σ 가 1.5 % 를 넘었습니다. 기여하는 항은 온도항·분위기항·유량항 셋뿐입니다. 유량은 12 slm 에서 기여가 0 이 되고, 온도항은 1100 °C 에서 가장 큽니다 — 가장 큰 항부터 줄이세요.',
        en: 'The spread exceeds 1.5 %. Only three terms contribute: temperature, ambient and flow. The flow term vanishes at 12 slm and the temperature term is largest at 1100 °C — cut the biggest term first.',
        when: (_i, o) => (o['spreadPct'] ?? 0) > S6_PASS_SIGMA_MAX_PCT,
      },
      {
        id: 'OX6-F4', tone: 'hint',
        ko: '세 지표 중 둘만 합격입니다. 두 지표를 살리려다 나머지 하나를 놓치고 있습니다 — 아래 상충 표에서 반대 방향으로 움직이는 항을 찾으세요.',
        en: 'Two of the three targets pass. You are trading the third away — find the term that moves the other way in the trade-off table below.',
        when: (_i, o) => {
          const ok = [
            inWindow(o['thicknessNm'], S6_PASS_THICK_MIN_NM, S6_PASS_THICK_MAX_NM),
            (o['spreadPct'] ?? 99) <= S6_PASS_SIGMA_MAX_PCT,
            (o['throughputWph'] ?? 0) >= S6_PASS_TP_MIN_WPH,
          ].filter(Boolean).length;
          return ok === 2;
        },
      },
      {
        id: 'OX6-F5', tone: 'warn',
        ko: '유량이 12 slm 을 넘었습니다. 성장률은 이미 포화라 두께는 더 늘지 않고, 과유량 난류로 산포만 다시 벌어지며 가스·배기 부하 지수만 오릅니다.',
        en: 'Flow is above 12 slm. Growth is already saturated, so thickness gains nothing while turbulence widens the spread again and the gas load index keeps climbing.',
        when: (i) => (i['flowSlm'] ?? 4) > 12,
      },
      {
        id: 'OX6-F6', tone: 'stop',
        ko: '산화막이 목표 상한을 넘었습니다. 산화는 되돌릴 수 없습니다 — 시간이나 온도를 낮춰 처음부터 다시 실행해야 합니다.',
        en: 'The oxide exceeded the upper limit. Oxidation is irreversible — lower the time or temperature and run again from the start.',
        when: (_i, o) => (o['thicknessNm'] ?? 0) > S6_PASS_THICK_MAX_NM,
      },
    ],
    tradeoffs: [
      {
        ko: '분위기 건식 → 습식: 같은 1000 °C·80 min 에서 두께 59.2 → 457.2 nm(7.7배)로 늘고 목표 도달 시간이 짧아진다(좋음) / 산포가 +0.30 %p 벌어지고 막이 덜 치밀해져 절연 특성이 나빠진다(나쁨).',
        en: 'Dry to wet: at 1000 °C and 80 min the oxide grows 59.2 to 457.2 nm — 7.7 times — and the target is reached far sooner (good), but the spread widens by 0.30 %p and the less dense film has poorer insulating quality (bad).',
      },
      {
        ko: '온도 1000 → 1100 °C: 성장이 빨라져 같은 두께를 짧은 시간에 얻는다(좋음) / 산포가 1.25 → 1.65 % 로 벌어져 균일도 조건이 먼저 깨지고 열예산도 커진다(나쁨). 1100 °C 에서는 두께를 맞춰도 σ 로 불합격이다.',
        en: 'From 1000 to 1100 °C growth speeds up and the same thickness arrives sooner (good), but the spread widens from 1.25 to 1.65 % — the uniformity target breaks first and the thermal budget grows (bad). At 1100 °C you fail on spread even with the thickness on target.',
      },
      {
        ko: '시간 65 → 150 min: 두께가 계속 두꺼워진다(좋음, 목표를 지나치기 전까지) / 처리량이 21.4 → 13.3 wafer/h 로 38 % 떨어진다(나쁨).',
        en: 'From 65 to 150 min the oxide keeps thickening (good, until it overshoots) but throughput falls from 21.4 to 13.3 wafer/h — a 38 % loss (bad).',
      },
      {
        ko: '유량 4 → 12 slm: 산포가 1.67 → 0.95 %(건식 기준)로 좋아지고 f_Q 가 0.67 → 1.0 이 되어 성장률 제한이 풀린다(좋음) / 가스·배기 부하 지수가 1.0 → 3.0 으로 3배가 된다(나쁨).',
        en: 'From 4 to 12 slm the spread improves from 1.67 to 0.95 % (dry basis) and f_Q rises from 0.67 to 1.0, lifting the growth-rate limit (good), while the gas and exhaust load index triples from 1.0 to 3.0 (bad).',
      },
      {
        ko: '유량 12 → 20 slm: 좋아지는 것이 없다. 성장률은 이미 포화이고 산포는 0.95 → 1.67 % 로 되돌아가며 부하 지수만 5.0 까지 오른다. 12 slm 이 최적점이다.',
        en: 'From 12 to 20 slm nothing improves: growth is saturated, the spread returns from 0.95 to 1.67 %, and the load index climbs to 5.0. Twelve slm is the optimum.',
      },
      {
        ko: '→ 도달해야 할 통찰: 두께는 온도·시간·분위기로 벌고, 균일도는 온도로 잃고 유량으로 되산다. 세 지표가 동시에 서는 곳은 1000 °C 습식 · 65~70 min · 10~14 slm 뿐이다.',
        en: 'The insight: thickness is bought with temperature, time and ambient; uniformity is lost to temperature and bought back with flow. All three targets stand only at 1000 °C wet, 65 to 70 min, 10 to 14 slm.',
      },
    ],
  },

  /* ─────────────── 심화 (S7) — 「외란을 진단하고 5개 지표를 되살린다」 ─────────────── */
  {
    processId: PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P2-05',
    titleKo: '외란을 진단하고 두께·균일도·절연·결함·처리량을 동시에 회복시키기',
    titleEn: 'Diagnose the disturbance and restore all five indicators together',
    params: [
      {
        id: 'tempC', ko: '산화 온도 T', en: 'Oxidation temperature', unit: '°C',
        min: 920, max: 1100, step: 90, initial: 1000, sourceId: 'S120',
        /* 🔴 화면이 내는 값의 정본. 간격이 80·100 으로 달라 `step` 하나로는 표현할 수 없다 —
           `step: 90` 만 두면 격자가 920·**1010**·1100 이 되어 화면이 1010 을 보이는 동안
           `nearestTemp()` 가 1000 으로 스냅해 계산한다. `min`·`max`·`step` 은 그대로 두고
           여기서 **모델이 쓰는 그 상수를 그대로** 넘긴다(값을 손으로 다시 적지 않는다). */
        options: TEMPS,
        note: '정본표 온도 3택(920 / 1000 / 1100). 보간하지 않는다.',
      },
      {
        id: 'ambient', ko: '산화 분위기 M (0 = 건식 O₂ · 1 = 습식 H₂O)', en: 'Ambient (0 = dry O2, 1 = wet H2O)', unit: '',
        min: 0, max: 1, step: 1, initial: 0, sourceId: 'S120',
        note: '건식은 Table II(1 atm), 습식은 Table I(640 Torr). 두 표를 섞지 않는다.',
      },
      {
        id: 'timeMin', ko: '산화 시간 t', en: 'Oxidation time', unit: 'min',
        min: 10, max: 300, step: 1, initial: 150,
        basis: 'PLN 명세는 스텝 5 min 이나 1 min 으로 줄였다 — 1100 °C 습식에서 5분 격자가 385~415 nm 창을 통째로 건너뛰고(25분 377.7 nm · 30분 421.0 nm) F1 복구해가 27분에만 존재하기 때문이다. 5분 격자의 상위집합이라 잃는 것이 없다.',
      },
      {
        id: 'flowSlm', ko: '산화제 유량 Q', en: 'Oxidant flow', unit: 'slm',
        min: 2, max: 20, step: 1, initial: 4,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② — f_Q = min(1, Q/6) 시나리오 유도값. 문헌 수치가 아니다.',
      },
      {
        id: 'rampRate', ko: '승온율 R', en: 'Ramp rate', unit: '°C/min',
        min: 2, max: 15, step: 1, initial: 10,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② — 장비 운전 한계. 13 °C/min 이상에서 열응력 슬립(F4)이 발동한다.',
      },
      {
        id: 'hclPct', ko: 'HCl 첨가 농도 C', en: 'HCl concentration', unit: 'vol %',
        min: 0, max: 5, step: 0.5, initial: 0,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② — 게터링 시나리오 유도값. 🔴 HCl 의 정량 효과는 원장 M-9 에서 미확보로 판정됐다. 가르치는 것은 방향뿐이다.',
      },
      {
        id: 'leakPurge', ko: '배관 리크 점검·N₂ 퍼지 (0 = 미실행 · 1 = 실행)', en: 'Leak check and N2 purge (0 = no, 1 = yes)', unit: '',
        min: 0, max: 1, step: 1, initial: 0,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② 추가 조작 — F2(배관 수분 혼입)의 정답 복구 조작이다.',
      },
      {
        id: 'dummyWafers', ko: '더미 웨이퍼 상하 매수', en: 'Dummy wafers per end', unit: '장', unitEn: 'wafers',
        min: 5, max: 10, step: 5, initial: 5,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② 추가 조작 — 10장으로 늘리면 flat zone 가장자리 효과가 줄어 산포에 −0.25 %p.',
      },
      {
        id: 'stabilizeMin', ko: '온도 안정화 시간', en: 'Temperature stabilization time', unit: 'min',
        min: 10, max: 30, step: 20, initial: 10,
        basis: 'PLN 03_실습3단계명세 §P2 심화 ② 추가 조작 — 30 min 으로 늘리면 산포에 −0.20 %p, 사이클에 +20 min.',
      },
      {
        id: 'faultScenario', ko: '불량 시나리오 (0 정상 · 1 온도구배 · 2 수분혼입 · 3 금속오염 · 4 수분+오염)', en: 'Fault scenario (0 none, 1 gradient, 2 moisture, 3 contamination, 4 moisture+contamination)', unit: '',
        min: 0, max: 4, step: 1, initial: 4,
        basis: 'PLN §불량 시나리오 F1~F3 를 입력으로 연 것이다. 🔴 PLN 은 실행마다 무작위 2종이라 했으나 A14-1(결정론)이 src/models 에서 난수를 금지한다. 선택형으로 바꾸지 않으면 LO-P2-05 가 통째로 죽는다. F4(급속 승온 슬립)는 승온율 13 이상에서 스스로 발동하므로 선택지가 없다.',
      },
    ],
    outputs: [
      { id: 'thicknessNm', ko: '산화막 평균 두께 x̄', en: 'Mean oxide thickness', role: 'judge',
        pass: { min: S7_PASS_THICK_MIN_NM, max: S7_PASS_THICK_MAX_NM }, digits: 1 },
      { id: 'spreadPct', ko: '웨이퍼 간 두께 산포 σ', en: 'Wafer-to-wafer spread', role: 'judge',
        pass: { max: S7_PASS_SIGMA_MAX_PCT }, digits: 2 },
      { id: 'breakdownIndex', ko: '절연 파괴 전계 상대 지수 (건식·청정·1000 °C = 1.00)', en: 'Relative dielectric-breakdown index (dry, clean, 1000 °C = 1.00)', role: 'judge',
        pass: { min: S7_PASS_EBD_INDEX_MIN }, digits: 3 },
      /* 🔴 `counted` — 결함 **개수** 밀도다. 경계에서 자릿수를 올리면 `100.04 ea/cm²` 가 되는데
         그것은 셈값에 없는 정밀도다. 상향 대신 곧바로 부등호 표기로 간다(R-DISP-1 · PLN §27-3). */
      { id: 'oisfDensity', ko: 'OISF 밀도 D_sf', en: 'OISF density', role: 'judge',
        pass: { max: S7_PASS_OISF_MAX }, digits: 1, displayMode: 'counted' },
      { id: 'throughputWph', ko: '배치 처리량 TP', en: 'Batch throughput', role: 'judge',
        pass: { min: S7_PASS_TP_MIN_WPH }, digits: 2 },
      { id: 'slotSlopePct', ko: '슬롯당 두께 기울기 (도어측 → 가스측)', en: 'Thickness slope per slot (door to gas side)', role: 'display', digits: 3 },
      { id: 'supplyFactorQ', ko: '산화제 공급 제한 계수 f_Q', en: 'Oxidant supply factor', role: 'display', digits: 3 },
      { id: 'gasLoadIndex', ko: '가스·배기 부하 지수', en: 'Gas and exhaust load index', role: 'display', digits: 2 },
      { id: 'corrosionIndex', ko: '배관 부식 지수', en: 'Pipework corrosion index', role: 'display', digits: 2 },
      { id: 'siConsumedNm', ko: '소모 Si 두께 x_Si', en: 'Silicon consumed', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const s = advState(inputs);
      assertWithin('tempC', s.tempC, S6_TEMP_RANGE, '°C');
      assertWithin('ambient', s.m, S6_M_RANGE, '');
      assertWithin('timeMin', s.timeMin, S7_TIME_RANGE, 'min');
      assertWithin('flowSlm', s.qSlm, S7_Q_RANGE, 'slm');
      assertWithin('rampRate', s.rampRate, S7_RAMP_RANGE, '°C/min');
      assertWithin('hclPct', s.hclPct, S7_HCL_RANGE, 'vol %');
      assertWithin('faultScenario', s.scenario, S7_SCENARIO_RANGE, '');

      const leak = leakFlag(s);
      const kGrad = gradientFactor(s);
      const kCont = contamFactor(s);
      const slip = s.rampRate >= S7_SLIP_RAMP;
      const fQ = supplyFactor(s.qSlm);

      const xNm = oxideNm(s.tempC, s.m, s.timeMin, fQ * (leak === 1 ? S7_MOISTURE_GROWTH : 1));
      const siNm = siliconConsumed(xNm / NM_PER_UM).value * NM_PER_UM;
      const correction = (s.dummy10 ? S7_DUMMY_CORRECTION_PCT : 0) + (s.stab30 ? S7_STABILIZE_CORRECTION_PCT : 0);
      const sigma = spreadPct({
        tempC: s.tempC, m: s.m, qSlm: s.qSlm, rampRate: s.rampRate,
        kGrad, slip, correctionPct: correction,
      });
      const tp = throughputWph(s.tempC, s.timeMin, s.rampRate, s.stab30 ? STABILIZE_EXTRA_MIN : 0);

      const common = [
        s.m === 1 ? '습식 H₂O 640 Torr (S120 Table I)' : '건식 O₂ 1 atm (S120 Table II)',
        '면방위 ⟨100⟩ — A_⟨100⟩ = 1.68 × A_⟨111⟩ (선형항에만)',
        `정본표 ${s.tempC} °C · 온도 보간 없음`,
        '🔴 불량 시나리오는 난수가 아니라 입력이다 — A14-1(결정론) 때문이다',
      ];
      return {
        thicknessNm: quantity(xNm, {
          modelId: 'oxidation.lab.advanced.thicknessNm', unit: 'nm', basis: "교육용 합성 — Deal-Grove 문헌식에 교육용 공급제한 f_Q 와 수분혼입 배수 1.22 를 시간에 곱해 반영한 값입니다.",
          validRange: [0, 2000],
          assumptions: [...common,
            'f_Q 와 수분 혼입 배수 1.22 는 성장 시간에 곱해 반영했다 — B·B/A 를 배수만큼 키우는 것과 대수적으로 동일하다'],
        }),
        spreadPct: quantity(sigma, {
          modelId: 'oxidation.lab.advanced.spreadPct', unit: '%', basis: "교육용 합성 — 온도구배 ×1.8 · 슬립 ×1.4 · 더미 −0.25 %p 는 학습용으로 설계된 계수입니다.",
          validRange: [0, 20],
          assumptions: [...common,
            '🔴 PLN 이 설계한 교육용 합성식이다. 실측 장비 산포가 아니다',
            '온도 구배 외란이 살아 있으면 ×1.8, 승온율 13 이상이면 ×1.4',
            '더미 10장 −0.25 %p · 안정화 30 min −0.20 %p'],
        }),
        breakdownIndex: quantity(breakdownIndex(s.m, leak, s.tempC, s.hclPct), {
          modelId: 'oxidation.lab.advanced.breakdownIndex', unit: '', basis: "교육용 합성 — 절대 전계(MV/cm)는 출처 라이선스 미확보(M-36)로 표시하지 않으며, 기준 조건을 1.00 으로 둔 학습용 상대 지수입니다.",
          validRange: [0, 2],
          assumptions: [...common,
            '🔴 절대 전계(MV/cm)를 표시하지 않는다 — 통용값 ~10 MV/cm 를 제시하는 출처 2건이 모두 라이선스 불가다(원장 M-36)',
            '🔴 합격선 0.90 은 문헌 기준이 아니라 이 실습이 제시하는 조건이다(원장 M-26 의 Tj 처리와 동일)',
            '기준 1.00 = 건식·수분누설 없음·1000 °C·HCl 0 %'],
        }),
        oisfDensity: quantity(oisfDensity(s.tempC, s.hclPct, kCont), {
          modelId: 'oxidation.lab.advanced.oisfDensity', unit: 'ea/cm²', basis: "교육용 합성 — HCl 게터링의 정량 효과는 미확보(M-9)이며 가르치는 것은 방향뿐인 학습용 결함밀도 모형입니다.",
          validRange: [0, 5000],
          assumptions: [...common,
            '🔴 PLN 이 설계한 교육용 합성식이다. HCl 의 정량 효과는 원장 M-9 에서 미확보 판정',
            '금속 오염이 살아 있고 HCl 이 1 % 미만이면 ×8'],
        }),
        throughputWph: quantity(tp, {
          modelId: 'oxidation.lab.advanced.throughputWph', unit: 'wafer/h', basis: "교육용 합성 — 승온율·안정화 연장을 반영한 학습용 배치 스루풋 모형입니다.",
          validRange: [0, 200],
          assumptions: [...common,
            '🔴 PLN 이 설계한 교육용 합성식이다',
            '보트 50장 · 로딩 20 min · 램프업 (T−600)/R min · 언로드 15 min · 안정화 연장 시 +20 min'],
        }),
        slotSlopePct: quantity(kGrad > 1 ? S7_SLOT_SLOPE_PCT : 0, {
          modelId: 'oxidation.lab.advanced.slotSlopePct', unit: '%/slot', basis: "교육용 합성 — 슬롯 50개 프로파일 그래프를 대신하는 학습용 진단 지표(0.13 %/slot 고정)입니다.",
          validRange: [0, 1],
          assumptions: [
            '🔴 슬롯 50개 막대 그래프가 공용 하네스에 없어 진단 증거를 수치로 대체한 것이다',
            '0 이 아니면 도어측에서 가스측으로 단조 우상향 프로파일 — 온도 구배 외란의 결정적 증거다',
            '평균 두께만 맞추는 조작으로는 이 값이 0 이 되지 않는다'],
        }),
        supplyFactorQ: quantity(fQ, {
          modelId: 'oxidation.lab.advanced.supplyFactorQ', unit: '', basis: "교육용 합성 — 포화 유량 6 slm 을 가정한 학습용 공급제한 계수입니다.",
          validRange: [0, 1],
          assumptions: ['Q ≥ 6 slm 이면 1.0'],
        }),
        gasLoadIndex: quantity(gasLoadIndex(s.qSlm), {
          modelId: 'oxidation.lab.advanced.gasLoadIndex', unit: '', basis: "교육용 합성 — 유량 3점을 지나는 학습용 직선 지수입니다.",
          validRange: [0, 10],
          assumptions: ['🔴 PLN 명세의 3점을 지나는 교육용 직선'],
        }),
        corrosionIndex: quantity(corrosionIndex(s.hclPct), {
          modelId: 'oxidation.lab.advanced.corrosionIndex', unit: '', basis: "교육용 합성 — HCl 2점(0 %→1.0 · 2 %→2.6)을 지나는 학습용 배관 부식 직선 지수입니다.",
          validRange: [0, 10],
          assumptions: ['🔴 PLN 명세의 2점(C=0 → 1.0 · C=2 → 2.6)을 지나는 교육용 직선'],
        }),
        siConsumedNm: quantity(siNm, {
          modelId: 'oxidation.lab.advanced.siConsumedNm', unit: 'nm', basis: "교육용 합성 — 소모비 0.44(S121)는 문헌값이나 곱해지는 두께가 교육용 외란 배수를 거친 값입니다.",
          validRange: [0, 1000],
          assumptions: ['소모 Si : 산화막 = 0.44 : 1 (S121 §4.1)'],
        }),
      };
    },
    scene: {
      sceneId: 'filmGrowth',
      // 🔴 응용(S6)과 같은 매핑이다. `roughness`(§4-1 공백 4) 미매핑 · `tint`(공백 5) 보류.
      //    습식막에 기공을 그리게 하는 파라미터는 넘기지 않는다.
      map: mapAdvancedOxidationScene,
      note: 'thickness = x̄/600 nm · uniformity = 1 − σ/3 %(1 = 균일, DEV 정의 — DSN §4-1 공백 3). roughness·tint 는 근거 미확보로 매핑하지 않음.',
    },
    feedback: [
      {
        id: 'OX7-F1', tone: 'stop',
        ko: '수분 혼입 외란이 그대로 남아 있습니다. 파라미터를 아무리 바꿔도 두께 초과와 절연 특성 저하는 반복됩니다 — 「배관 리크 점검·N₂ 퍼지」를 먼저 실행하세요.',
        en: 'The moisture ingress is still unresolved. No parameter change will stop the thickness overshoot and the insulation loss — run the leak check and N2 purge first.',
        when: (i) => {
          const sc = Math.round(i['faultScenario'] ?? SC_BOTH);
          return (sc === SC_MOISTURE || sc === SC_BOTH) && (i['leakPurge'] ?? 0) < 0.5;
        },
      },
      {
        id: 'OX7-F2', tone: 'warn',
        ko: '슬롯당 두께 기울기가 남아 있습니다. 평균 두께는 맞출 수 있어도 위치 의존 편차는 평균값 조작으로 잡히지 않습니다 — 승온율을 6 °C/min 이하로 내리고, 안정화를 30분으로 늘리고, 더미를 10장으로 증설하는 세 가지를 모두 적용해야 복구됩니다.',
        en: 'A slot-to-slot slope remains. You can hit the mean thickness, but a position-dependent deviation never yields to mean-value tuning — all three of ramp rate at or below 6, stabilization at 30 min, and ten dummy wafers must be applied.',
        when: (_i, o) => (o['slotSlopePct'] ?? 0) > 0,
      },
      {
        id: 'OX7-F3', tone: 'warn',
        ko: 'OISF 밀도가 합격선의 여러 배입니다. 두께와 산포가 정상인데 결함만 많다면 원인은 공정 조건이 아니라 금속 오염입니다 — HCl 을 1 % 이상 넣어 게터링하세요.',
        en: 'The OISF density is several times the limit. When thickness and spread look normal but defects do not, the cause is metal contamination, not the recipe — add at least 1 % HCl to getter it.',
        when: (_i, o) => (o['oisfDensity'] ?? 0) > S7_PASS_OISF_MAX * 2,
      },
      {
        id: 'OX7-F4', tone: 'warn',
        ko: 'HCl 농도가 3 % 를 넘었습니다. 게터링 효과는 이미 포화했고(보정 상한 도달) 배관 부식만 진행됩니다 — 1~2 % 대로 낮추세요.',
        en: 'HCl is above 3 %. The gettering benefit has saturated at its cap and only pipework corrosion advances — bring it back to the 1 to 2 % range.',
        when: (i) => (i['hclPct'] ?? 0) > 3,
      },
      {
        id: 'OX7-F5', tone: 'stop',
        ko: '승온율이 13 °C/min 이상입니다. 열응력으로 웨이퍼에 방사형 슬립 라인이 생기고 산포가 1.4배가 됩니다 — 10 °C/min 이하로 내리세요.',
        en: 'The ramp rate is at or above 13 °C/min. Thermal stress produces radial slip lines and the spread grows by a factor of 1.4 — bring it down to 10 °C/min or lower.',
        when: (i) => (i['rampRate'] ?? 10) >= S7_SLIP_RAMP,
      },
      {
        id: 'OX7-F6', tone: 'warn',
        ko: '산화제 공급 제한이 걸려 있습니다(f_Q < 1). 유량을 6 slm 이상으로 올리세요. 산포까지 고려하면 12 slm 이 최적입니다.',
        en: 'Oxidant supply is limiting (f_Q < 1). Raise the flow to at least 6 slm; counting the spread term as well, 12 slm is optimal.',
        when: (i) => (i['flowSlm'] ?? 4) < 6,
      },
      {
        id: 'OX7-F7', tone: 'hint',
        ko: '다섯 지표 중 넷만 합격입니다. 마지막 하나는 대개 처리량입니다 — 승온율을 낮추고 안정화를 늘리면 균일도는 좋아지지만 사이클이 길어집니다. 온도를 올려 산화 시간을 줄이는 쪽으로 되사세요.',
        en: 'Four of the five pass. The last one is usually throughput — a slower ramp and longer stabilization buy uniformity but lengthen the cycle. Buy it back by raising the temperature and shortening the oxidation.',
        when: (_i, o) => {
          const ok = [
            inWindow(o['thicknessNm'], S7_PASS_THICK_MIN_NM, S7_PASS_THICK_MAX_NM),
            (o['spreadPct'] ?? 99) <= S7_PASS_SIGMA_MAX_PCT,
            (o['breakdownIndex'] ?? 0) >= S7_PASS_EBD_INDEX_MIN,
            (o['oisfDensity'] ?? 9999) <= S7_PASS_OISF_MAX,
            (o['throughputWph'] ?? 0) >= S7_PASS_TP_MIN_WPH,
          ].filter(Boolean).length;
          return ok === 4;
        },
      },
    ],
    tradeoffs: [
      {
        ko: '온도 1000 → 1100 °C: OISF 밀도가 72 → 24 ea/cm² 로 3분의 1이 되고 성장이 빨라진다(좋음) / 산포가 벌어지고 절연 파괴 상대 지수가 내려가며 열예산이 커진다(나쁨). 두 게이지가 정확히 반대로 움직인다.',
        en: 'From 1000 to 1100 °C the OISF density drops from 72 to 24 per cm2 and growth speeds up (good), while the spread widens, the relative breakdown index falls and the thermal budget grows (bad). The two gauges move in exactly opposite directions.',
      },
      {
        ko: '분위기 건식 → 습식: 400 nm 도달 시간이 4분의 1 이하가 되어 처리량을 벌어 준다(좋음) / 막이 덜 치밀해 절연 파괴 상대 지수가 내려가고 산포가 +0.30 %p 벌어진다(나쁨). 습식막은 다공질이 아니라 Si–OH 가 많은 덜 치밀한 비정질막이다.',
        en: 'Dry to wet cuts the time to 400 nm by more than four times and buys throughput (good), but the less dense film lowers the relative breakdown index and widens the spread by 0.30 %p (bad). A wet oxide is not porous — it is a less dense amorphous film rich in Si-OH.',
      },
      {
        ko: 'HCl 0 → 2 %: 금속 오염 배수가 8 → 1 로 풀려 OISF 가 급감하고 절연 파괴 상대 지수도 올라간다(좋음) / 배관 부식 지수가 1.0 → 2.6 으로 커지고 소모품 교체 주기가 짧아진다(나쁨). 3 % 를 넘으면 좋아지는 것 없이 부식만 남는다.',
        en: 'From 0 to 2 % HCl the contamination factor relaxes from 8 to 1, OISF collapses and the relative breakdown index rises (good), while the corrosion index grows from 1.0 to 2.6 and consumables wear out sooner (bad). Above 3 % only the corrosion remains.',
      },
      {
        ko: '승온율 10 → 4 °C/min: 오버슈트가 줄고 슬립이 억제되며 온도 구배 복구 조건 하나가 채워진다(좋음) / 램프업이 길어져 처리량이 크게 떨어진다(나쁨). 승온율은 TP 식의 분모에 (T−600)/R 로 직접 들어간다.',
        en: 'From 10 to 4 °C/min the overshoot shrinks, slip is suppressed and one gradient-recovery condition is met (good), but a longer ramp-up costs a lot of throughput (bad) — the ramp rate enters the throughput denominator directly as (T-600)/R.',
      },
      {
        ko: '안정화 연장 · 더미 증설: 산포를 합계 0.45 %p 줄여 준다(좋음) / 사이클이 20분 늘고 보트에 실을 제품 매수가 준다(나쁨).',
        en: 'Longer stabilization and more dummy wafers cut the spread by 0.45 %p in total (good) but add 20 min to the cycle and take product slots off the boat (bad).',
      },
      {
        ko: '유량 4 → 12 slm: 산포가 0.72 %p 좋아지고 성장률 제한이 풀린다(좋음) / 가스·배기 부하 지수가 3배가 된다(나쁨).',
        en: 'From 4 to 12 slm the spread improves by 0.72 %p and the growth-rate limit lifts (good), while the gas and exhaust load index triples (bad).',
      },
      {
        ko: '→ 도달해야 할 통찰: 외란은 파라미터로 상쇄하는 것이 아니라 원인을 없애는 것이다. 수분 혼입은 퍼지로, 금속 오염은 HCl 로, 온도 구배는 승온율·안정화·더미 세 가지를 함께 적용해야만 사라진다. 두께만 맞추면 나머지 네 지표가 차례로 무너진다.',
        en: 'The insight: a disturbance is removed at its cause, not offset with parameters. Moisture goes with the purge, contamination with HCl, and the thermal gradient only with ramp rate, stabilization and dummy wafers applied together. Match the thickness alone and the other four indicators fall one by one.',
      },
    ],
  },
];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const OXIDATION_SI_RATIO = SI_CONSUMED_RATIO;
