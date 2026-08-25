import type { LabChartBinding, LabSpec } from './spec';
import { assertWithin, quantity } from '../contract';
import { ETCH_PROCESS_ID } from '../physics/etch/rules';
import { PERCENT, SECONDS_PER_MINUTE } from '../physics/units';
import { endpointWavelength } from '../physics/etch/oes';

/**
 * P4 식각 실습 3단계 — PLN `03_실습3단계명세.md` §「P4 실습 3단계」(1005~1326행) 배선.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **A15 에 대한 정직한 고지 — 이 파일은 물리층을 「전부」 호출하지 못한다.**
 *
 *    `src/models/physics/etch/**` 는 설계상 **「합성 계수 0건」** 이다(dryEtch.ts 머리주석).
 *    건식 쪽에는 S160 Bosch/STiGer 레시피 · S161 RIE lag/마스크선택비 · S162 Clausing ·
 *    S163/S165 플라즈마 파라미터 · S167 셀프바이어스 · S168/S172 OES 파장이 있고,
 *    습식 쪽(`wetEtch.ts`)에는 S164 아레니우스 · S166 KOH 실측표 · **S256/S257 이방성도 정의식**이 있다.
 *
 *    🔴 **2026-08-22 정정 — 이 목록은 「S160·S161·S162·S163/S165·S167·S168/S172 만 있다」였다.**
 *       그 사이 물리층에 **S256·S257 이 들어왔다**(`wetEtch.ts` `anisotropyDegree`, 2026-08-22).
 *       실측(2026-08-22 11시대 · `grep -rho 'S[0-9]\{3\}' src/models/physics/etch/` · 중복 포함 건수):
 *       S160 30 · S166 23 · S161 20 · S172 18 · S164 17 · S165 16 · S163 13 · S167 7 · S162 7 ·
 *       **S257 5 · S256 3** · S168 3 · S262 1 · S171 1 · S169 1.
 *
 *    **PLN 이 설계한 P4 실습 모델식(R_vert = 150 + 0.60·P_b 류)은 교육용 합성 모델**이라
 *    물리층에 넣으면 A15 위반이고 `check-physics` 가 막는다. 그래서 물리층에 없다.
 *
 *    → 협업 경계상 나는 `physics/**` 를 만들 수도 고칠 수도 없다. 따라서 **합성 모델식은
 *      스코어링 성격의 코드로 이 파일 안에 두고**, 물리층에서 **실제로 가져올 수 있는 것은
 *      가져온다**(`endpointWavelength` — OES 종점 파장 S172/S168 · `ETCH_PROCESS_ID` ·
 *      단위 상수). 계수의 출처는 **PLN 명세**이며 실측 장비 상수가 아니다.
 *      화면에는 `registry.ts` 가 「경향모델」 배지 + 고지를 상시 붙인다(A6-b).
 *
 *    🔴 **아직 안 가져온 것 하나 — `wetEtch.anisotropyDegree`(S257).** 물리층에 이방성도 정의식이
 *       생겼는데(2026-08-22) 이 파일은 세 단계 모두 `1 − R_lat/R_vert` 를 **각자 다시 계산한다**.
 *       **일부러 그대로 뒀다:** ① 물리층 함수는 `sourceId: 'S257'` 이 붙은 `Quantity` 를 돌려주는데,
 *       여기 넣는 R_lat·R_vert 는 **설계값**이라 결과에 S257 배지가 붙으면 거짓 표시가 된다.
 *       ② 물리층 함수는 `assertWithin('lateralRate', …, [0, verticalRate])` 로 A ≥ 0 을 강제하는데
 *       심화 단계는 `validRange: [-1, 1]` 로 **음수 A 를 표시 대상으로 남겨 뒀다**(드리프트 표현).
 *       ③ 물리층 함수의 단위 계는 µm/min, 여기는 nm/min 이다.
 *       → **식의 소재만 주석·`assumptions` 로 인용**하고 계산은 여기 둔다. 배선 전환은 DEV 팀장 판정 대상.
 *
 * ✅ **DEV 팀장 판정(2026-08-20) — 승격하지 않는다. 다시 묻지 마라.**
 *    근거: `projects/8대공정-001/09_물리층_구현규약.md` §7-1(오케스트레이터 판정).
 *    A6-b 의 목적 3가지가 이미 다른 수단으로 충족됐다 — ①물리층 합성 0건은 `check-physics` 가,
 *    ②학습자 고지는 `[경향모델]` 배지 + 고지 렌더가, ③기계 검사는 `check-grades`(등급 원장)와
 *    `check-a6b`(DOM 실측)가 강제한다. **디렉터리는 수단이었지 목적이 아니다.**
 *    `src/models/scoring/` 빈 디렉터리는 2026-08-20 제거했다 — 있으면 「예정된 층」으로 오해된다.
 *    남기는 규율 하나: `§합성모델` 블록은 **파일당 하나의 연속 블록**으로 유지한다(나중에 잘라 옮길 수 있게).
 *    게이트 대상은 아니다 — 배지가 강제되는 한 파일 내 위치는 표시 품질에 영향이 없다.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 **합격창을 옮기지 않았다.** PLN 명세의 합격창·기본값·기준 합격 해를 그대로 재계산해
 *    전부 일치함을 확인했다(§검산 주석). 값을 손댈 이유가 없었다.
 *
 * 🔴 **씬** — DSN `12_시각화씬_공백보고.md` §4-2 확인 매핑만 쓴다.
 *    `plasma.bias` · `plasma.pressure` · `plasma.power` **셋뿐**이며, 기초·응용에만 붙는다.
 *    `plasma.flow` 는 근거가 없어 매핑하지 않는다.
 *    🔴 **심화(lab-advanced)에는 씬이 없다.** 2026-08-21 에 `ionTrajectory` 를 뗐다 —
 *    깊이–농도 가우시안 + R_p 는 이온주입 전용 표현이라 식각에 붙이면 A11 위반이다.
 *    사유와 「전용 씬이 생기면 무엇을 붙일지」는 심화 명세 안 §「씬 없음」 주석에 적어 뒀다.
 *    **프로파일 결함(언더컷·테이퍼·마이크로트렌칭·ARDE·스캘럽) 단면 씬은 존재하지 않는다**(§4-2 공백 1).
 *    `polishProfile` 은 CMP 전용이므로 대용하지 않는다. 언더컷·노칭은 **수치로만** 나온다.
 *
 * 🔴 **"Seidel" 을 출처로 쓰지 않았다**(원장 M-12, 접근 실패). 이 파일이 참조하는 식각 원장은
 *    **S160·S161·S162·S168·S172 · S256·S257** 이며, 습식 아레니우스(S164)·KOH 실측표(S166)는
 *    P4 건식 실습에 직접 쓰이지 않아 인용하지 않았다(원장 §2-4 · §3-4 대조 완료).
 *
 *    🔴 **S256·S257 은 2026-08-22 에 추가했다 — 그전까지 이 파일에 0건이었다.**
 *       원장 §2-4 가 2026-08-22 에 S256~S262 로 늘었는데 이 목록이 따라가지 않았다.
 *       두 건 모두 **이방성도 A 의 정의식 출처**이고, 이 파일 세 단계의 `1 − R_lat/R_vert` 가
 *       바로 그 형태다. 붙인 자리는 세 곳의 `anisotropy` `quantity()` 다(기초·응용·심화).
 *
 *    🔴 **라이선스 제약을 지켰다 — 원문 문장을 옮기지 않았다.** 원장이 S256·S257 을 둘 다
 *       **「❌ 불가 — 정의식·수치 인용만」**(규칙 7)으로 못박는다. 그래서 주석·`assumptions` 는
 *       **식이 어디에 인쇄돼 있는지만 지목**하고, 슬라이드·본문 문장은 인용하지 않았다.
 *
 *    🔴 **정본·교차확인의 순서를 뒤집지 않았다.** 원장 S257 난이 「교과서 파생 자료로 보인다 —
 *       단독 정본으로 쓰지 않고 **S256 의 교차확인용으로만** 둔다」고 지시한다. 다만 **코드의 식과
 *       글자 그대로 같은 형태**(`1 − v_l/v_v`)를 인쇄한 쪽은 S257 §6.2 식 (6.1) 이므로,
 *       **형태의 소재는 S257, 등급 정본은 S256** 으로 나눠 적었다(물리층 `wetEtch.ts` 와 같은 규약).
 *
 *    🔴 **등급은 그대로다.** 계수가 전부 설계값이므로 세 `anisotropy` 는 여전히
 *       `교육용 합성`(synthetic)이다. `model-grades.json` 은 한 글자도 건드리지 않았고
 *       `sourceId` 도 붙이지 않았다 — **채운 것은 「인용」이지 「배지」가 아니다.**
 */

/* ══════════════════ 공통 고정 조건 (PLN 공통 고지) ══════════════════ */

/** 대상막 = 폴리실리콘 두께. 기초·응용은 500 nm 를 「레지스트 초기 두께」로도 쓴다. */
const POLY_THICKNESS_NM = 500;
/** 레지스트 초기 두께 — 기초·응용 500 nm / 심화 700 nm. */
const RESIST_INIT_BASIC_NM = 500;
const RESIST_INIT_ADV_NM = 700;
/** 하부막 SiO₂ 두께. 이 값 이상 깎이면 펀치스루다. */
const UNDERLAYER_THICKNESS_NM = 10;

const DEG_PER_RAD = 180 / Math.PI;

/* ══════════════════ 합격창 상수 ══════════════════
 * 🔴 숫자 리터럴이 아니라 **이름 있는 상수**로 둔다. PLN 명세 ③ 표 그대로다.
 */
const PASS_DEPTH_BASIC_MIN_NM = 285;
const PASS_DEPTH_BASIC_MAX_NM = 315;

const PASS_DEPTH_APPLIED_MIN_NM = 380;
const PASS_DEPTH_APPLIED_MAX_NM = 420;
const PASS_ANISO_APPLIED_MIN = 0.930;
const PASS_SPR_APPLIED_MIN = 9.0;

const PASS_ANISO_ADV_MIN = 0.940;
const PASS_UL_LOSS_ADV_MAX_NM = 5.0;
const PASS_RESIDUE_ADV_MAX = 15.0;
const PASS_THROUGHPUT_ADV_MIN = 12.0;
const PASS_YIELD_ADV_MIN = 90.0;

/* ══════════════════ 기초(S5) 모델 — PLN §기초 ②
 * 압력 30 mTorr · 소스파워 1000 W 고정이므로 단순화된 식이다.
 *
 * 🔴 검산 (2026-08-20 · DEV, 전 항목 PLN 표와 일치):
 *   기본값 P_b=50 · t=60 → R_vert 180 · D 180.0 nm ❌ · A 0.7778 · θ 77.47° · S_PR 5.60
 *                          · U 40.0 nm · 잔막 467.9 nm
 *   합격 해 (a) P_b= 50 · t=100 → D 300.0 ✅ / A 0.7778 / θ 77.47° / S_PR 5.60 / U 66.7 / 잔막 446.4
 *   합격 해 (b) P_b=150 · t= 75 → D 300.0 ✅ / A 0.8333 / θ 80.54° / S_PR 4.80 / U 50.0 / 잔막 437.5
 *   합격 해 (c) P_b=250 · t= 60 → D 300.0 ✅ / A 0.8667 / θ 82.41° / S_PR 4.00 / U 40.0 / 잔막 425.0
 *   → **기본값 불합격 · 합격 조합 3종 실재. 죽은 판정 아님.**
 * ══════════════════ */

const BASIC_PB_RANGE: [number, number] = [0, 500];
const BASIC_TIME_RANGE: [number, number] = [10, 180];

interface BasicOut {
  depthNm: number; anisotropy: number; sidewallAngleDeg: number;
  selectivityPR: number; undercutNm: number; resistRemainNm: number;
}

function basicModel(biasW: number, timeS: number): BasicOut {
  const vertRate = 150 + 0.60 * biasW;          // nm/min
  const lateralRate = 40;                        // nm/min — 압력 고정이므로 상수
  const selectivityPR = 6.00 - 0.008 * biasW;
  const minutes = timeS / SECONDS_PER_MINUTE;
  return {
    depthNm: vertRate * minutes,
    anisotropy: 1 - lateralRate / vertRate,
    sidewallAngleDeg: 90 - Math.atan(lateralRate / vertRate) * DEG_PER_RAD,
    selectivityPR,
    undercutNm: lateralRate * minutes,
    resistRemainNm: RESIST_INIT_BASIC_NM - (vertRate / selectivityPR) * minutes,
  };
}

/* ══════════════════ 응용(S6) 모델 — PLN §응용 ②
 * 🔴 검산 (전 항목 PLN 표와 일치):
 *   기본값 p=30·P_s=1000·P_b=50·t=60 → R_v 95.00 · R_l 9.857 · D 95.0 ❌ · A 0.8962 ❌(θ 84.08°)
 *                                      · S_PR 8.44 ❌ → 3개 전부 불합격
 *   기준 해 p=190·P_s=1700·P_b=400·t=65 → R_v 357.0 · R_l 23.27
 *                                      → D 386.8 ✅ · A 0.9348 ✅(θ 86.27°) · S_PR 9.13 ✅ · U 25.2
 *   실패 4종도 재현: (500 W) S_PR 8.40❌·D 430.1❌ / (300 mTorr) A 0.9149❌·D 446.3❌
 *                   (40 mTorr) S_PR 5.79❌·D 305.5❌ / (기본+t180) D 285.0❌·A 0.8962❌
 * ══════════════════ */

const APPLIED_P_RANGE: [number, number] = [5, 300];
const APPLIED_PS_RANGE: [number, number] = [200, 2000];
const APPLIED_PB_RANGE: [number, number] = [0, 500];
const APPLIED_TIME_RANGE: [number, number] = [10, 180];

interface AppliedOut {
  vertRate: number; lateralRate: number; depthNm: number; anisotropy: number;
  sidewallAngleDeg: number; selectivityPR: number; undercutNm: number; resistRemainNm: number;
}

function appliedModel(p: number, sourceW: number, biasW: number, timeS: number): AppliedOut {
  const vertRate = 0.06 * sourceW + 0.40 * biasW + 0.5 * p;
  const lateralRate = (0.004 * sourceW + 0.25 * p) * (300 / (300 + biasW));
  const selectivityPR =
    9.0 * (300 / (300 + 0.4 * biasW)) * (1 + 0.004 * (p - 30)) * Math.pow(1000 / sourceW, 0.10);
  const minutes = timeS / SECONDS_PER_MINUTE;
  return {
    vertRate,
    lateralRate,
    depthNm: vertRate * minutes,
    anisotropy: 1 - lateralRate / vertRate,
    sidewallAngleDeg: 90 - Math.atan(lateralRate / vertRate) * DEG_PER_RAD,
    selectivityPR,
    undercutNm: lateralRate * minutes,
    resistRemainNm: RESIST_INIT_BASIC_NM - (vertRate / selectivityPR) * minutes,
  };
}

/* ══════════════════ 심화(S7) 모델 — PLN §심화 ②
 * 🔴 **PLN 정정 2026-08-20 반영**: 노칭 조건은 `P_b > 400`(등호 제거) AND `OE ≥ 35`.
 *    등호를 남기면 P_b=400 에서 N=0 인데 경고만 뜨는 죽은 판정이 된다.
 *
 * 🔴 **외란(disturbance)을 조작 파라미터로 열었다 — 설계 추가가 아니라 배선상 불가피.**
 *    PLN LO-P4-05 는 「주입된 외란 3종 중 발생한 것을 진단하고 복구」를 요구하는데,
 *    `LabRunner` 는 **순수 함수 하네스**라 시간축 이벤트를 주입할 방법이 없다.
 *    외란 A(K_drift)·B(저개구율 OES 실패)를 입력으로 열지 않으면 그 학습목표 전체가 **죽은 콘텐츠**가 된다.
 *    외란 C(차징 노칭)는 파라미터 조합(P_b·OE)이 스스로 발동시키므로 입력이 필요 없다.
 *
 * 🔴 검산 (전 항목 PLN 표와 일치):
 *   기본값 p=30·P_s=1000·P_b=50·Q=100·OE=20·f=10·OES자동·정상
 *     → R_v 85.5 · R_l 7.89 · S_UL 19.64 · t_EP 350.9 s
 *     → A 0.9078❌ · Δd_UL 5.09❌ · R_res 24.55❌ · TH 7.7❌ · Y 87.5❌ → **5개 전부 불합격**
 *   기준 해 p=150·P_s=1800·P_b=350·Q=300·OE=30·f=24·OES자동·정상
 *     → g 1.3333 · R_v 327.3 · R_l 10.73 · S_UL 30.85 · S_PR 8.85 · t_EP 91.7 s · t_cycle 164.2 s
 *     → A 0.9672✅ · Δd_UL 4.86✅ · R_res 14.12✅ · TH 21.9✅ · Y 98.0✅ · 잔막 626.6 · N 0
 *   시나리오 A(드리프트) + OES자동 → t_EP 111.8 s · TH 18.9 · Y 98.0 (5개 유지)
 *   시나리오 A(드리프트) + 고정시간 90 s → 미식각(t_fix < t_EP) → **Y 0**
 *   시나리오 B(저개구율) + OES자동 t_max 300 → 실효 OE 227.3 % · Δd_UL 36.84 ≥ 10 → **펀치스루 Y 0**
 *     복구① 간섭계(IEP) 전환 → Δd_UL 4.86 ✅ (5개 전부 회복)
 *     복구② t_max 115 s → 실효 OE 25.5 % · Δd_UL 4.13 ✅ (단 R_res 20.6 은 아직 미달 — PLN 서술과 동일)
 *   시나리오 C p=150·P_s=1800·P_b=480·Q=300·OE=45·f=24
 *     → N 12.0 · Δd_UL 8.41❌ · R_res 4.05✅ · TH 22.6✅ · A 0.9765✅ · **Y 57.8❌**
 *     복구: P_b 350 · OE 30 → 기준 해로 복귀 (Y 98.0 ✅)
 * ══════════════════ */

const ADV_P_RANGE: [number, number] = [5, 300];
const ADV_PS_RANGE: [number, number] = [200, 2000];
const ADV_PB_RANGE: [number, number] = [0, 500];
const ADV_Q_RANGE: [number, number] = [20, 500];
const ADV_OE_RANGE: [number, number] = [0, 80];
const ADV_F_RANGE: [number, number] = [0, 40];
const ADV_MODE_RANGE: [number, number] = [0, 2];
const ADV_TFIX_RANGE: [number, number] = [10, 600];
const ADV_TMAX_RANGE: [number, number] = [60, 600];
const ADV_DISTURBANCE_RANGE: [number, number] = [0, 2];

/** 종점 검출 모드. 0 = OES 자동 · 1 = 간섭계(IEP) · 2 = 고정 시간. */
const MODE_OES = 0;
const MODE_FIXED = 2;
/** 외란. 0 = 정상 · 1 = 챔버 컨디션 드리프트 · 2 = 저개구율(OES 신호 부족). */
const DIST_NONE = 0;
const DIST_DRIFT = 1;
const DIST_LOW_OPEN_AREA = 2;

/** 이송·펌핑·안정화 오버헤드. PLN §심화 ② `t_cycle = t_etch·(1+OE/100) + 45`. */
const HANDLING_OVERHEAD_S = 45;

/* ═══════════════ 차트 축 · 스윕 (2026-08-22 · W6-6 해소) ═══════════════
 * 🔴 세로축 상한 = **합격 임계의 2배**. 확대하지 않으면 판정이 보이지 않는다 —
 *    Δd_UL 은 도달 범위가 0 ~ 550 nm 라 합격선 5.0 nm 가 축 바닥 0.9 % 에 붙고,
 *    R_res 는 0 ~ 220 이라 합격선 15.0 이 6.8 % 에 붙는다
 *    (PLN 차트 판정 `threads/parts/차트-P4-etch.md` §3).
 *    임계의 2배로 잡으면 합격선이 세로 한가운데에 서고 위 절반이 「얼마나 못 미치는가」를 보여준다.
 * 🔴 합격 임계 자체는 여기서 건드리지 않는다(D-041 · PLN 소관) — 임계에서 **파생**만 시킨다.
 */
const OE_CHART_Y_MAX_FACTOR = 2;
/** 오버에치 스윕 표본수 — 정의역 0~80 % 를 1 %p 간격으로 훑는다.
 *  Δd_UL 과 R_res 의 **동시 합격 구간이 1.58 %p** 밖에 안 되므로(PLN §C4) 성기게 그리면 띠가 사라진다. */
const OE_CHART_STEPS = 80;

interface AdvInput {
  p: number; sourceW: number; biasW: number; flowSccm: number;
  overetchPct: number; passivationPct: number; mode: number;
  fixedTimeS: number; timeoutS: number; disturbance: number;
}

interface AdvOut {
  vertRate: number; lateralRate: number; anisotropy: number; sidewallAngleDeg: number;
  selectivityPR: number; selectivityUL: number;
  endpointTimeS: number; totalEtchTimeS: number; effectiveOveretchPct: number;
  underlayerLossNm: number; residueIndex: number; notchWidthNm: number;
  cycleTimeS: number; throughputWph: number; yieldPct: number; resistRemainNm: number;
  underEtched: boolean; endpointFound: boolean;
}

function advancedModel(a: AdvInput): AdvOut {
  // 챔버 컨디션 드리프트 — 벽·라이너 폴리머 축적으로 반응종이 벽에 소모된다(식각률 −18 %).
  const drift = a.disturbance === DIST_DRIFT ? 0.82 : 1.0;
  // 반응종 공급 포화 함수. g(100) = 1.00 이 되도록 PLN 이 정규화했다.
  const supply = 1.60 * a.flowSccm / (a.flowSccm + 60);

  const vertRate =
    (0.06 * a.sourceW + 0.40 * a.biasW + 0.5 * a.p) * supply * (1 - 0.010 * a.passivationPct) * drift;
  const lateralRate =
    (0.004 * a.sourceW + 0.25 * a.p) * (300 / (300 + a.biasW)) * (1 - 0.020 * a.passivationPct) * drift;
  const selectivityPR =
    9.0 * (300 / (300 + 0.4 * a.biasW)) * (1 + 0.004 * (a.p - 30))
    * Math.pow(1000 / a.sourceW, 0.10) * (1 + 0.012 * a.passivationPct)
    * Math.pow(100 / a.flowSccm, 0.20);
  const selectivityUL =
    20 * (1 + 0.010 * (a.p - 30)) * (300 / (300 + 0.6 * a.biasW)) * (1 + 0.008 * a.passivationPct);

  const anisotropy = 1 - lateralRate / vertRate;
  const sidewallAngleDeg = 90 - Math.atan(lateralRate / vertRate) * DEG_PER_RAD;

  // 종점 시각 — 폴리Si 를 다 벗기는 데 걸리는 시간.
  const endpointTimeS = (POLY_THICKNESS_NM / vertRate) * SECONDS_PER_MINUTE;

  // 🔴 저개구율(외란 B)에서는 **OES 자동만** 종점을 놓친다. 간섭계는 개구율에 둔감하다.
  const endpointFound = !(a.mode === MODE_OES && a.disturbance === DIST_LOW_OPEN_AREA);

  let totalEtchTimeS: number;
  if (a.mode === MODE_FIXED) totalEtchTimeS = a.fixedTimeS;
  else if (!endpointFound) totalEtchTimeS = a.timeoutS;         // EP NOT FOUND → 타임아웃까지 계속
  else totalEtchTimeS = endpointTimeS * (1 + a.overetchPct / PERCENT);

  const effectiveOveretchPct = (totalEtchTimeS / endpointTimeS - 1) * PERCENT;
  const underEtched = effectiveOveretchPct < 0;   // 종점 전에 멈췄다 = 콘택트 미개통
  const oe = Math.max(0, effectiveOveretchPct);

  const underlayerLossNm = (oe / PERCENT) * POLY_THICKNESS_NM / selectivityUL;
  const residueIndex = PERCENT * Math.exp(-oe / 12) * (1 + 0.030 * a.passivationPct);
  const notchWidthNm =
    a.biasW > 400 && oe >= 35 ? 0.10 * (a.biasW - 400) * (oe - 30) / 10 : 0;

  const cycleTimeS = totalEtchTimeS + HANDLING_OVERHEAD_S;
  const throughputWph = 3600 / cycleTimeS;

  let yieldPct =
    98
    - 3.0 * Math.max(0, underlayerLossNm - PASS_UL_LOSS_ADV_MAX_NM)
    - 0.4 * Math.max(0, residueIndex - PASS_RESIDUE_ADV_MAX)
    - 200 * Math.max(0, PASS_ANISO_ADV_MIN - anisotropy)
    - 2.5 * notchWidthNm;
  // 펀치스루(하부막 관통) 또는 미식각(콘택트 미개통)이면 다이가 전멸한다.
  if (underlayerLossNm >= UNDERLAYER_THICKNESS_NM || underEtched) yieldPct = 0;
  yieldPct = Math.min(PERCENT, Math.max(0, yieldPct));

  return {
    vertRate, lateralRate, anisotropy, sidewallAngleDeg, selectivityPR, selectivityUL,
    endpointTimeS, totalEtchTimeS, effectiveOveretchPct,
    underlayerLossNm, residueIndex, notchWidthNm,
    cycleTimeS, throughputWph, yieldPct,
    resistRemainNm: RESIST_INIT_ADV_NM - (vertRate / selectivityPR) * totalEtchTimeS / SECONDS_PER_MINUTE,
    underEtched, endpointFound,
  };
}

/** 오버에치 스윕 격자 — 슬라이더 정의역과 같은 구간을 훑는다. */
function oeGrid(): number[] {
  const out: number[] = [];
  for (let i = 0; i <= OE_CHART_STEPS; i++) {
    out.push(ADV_OE_RANGE[0] + (i / OE_CHART_STEPS) * (ADV_OE_RANGE[1] - ADV_OE_RANGE[0]));
  }
  return out;
}

/* ══════════════════ 공통 주석·보조 ══════════════════ */

/** 🔴 A6-b — 모든 P4 실습 출력에 붙는 고지. 화면 배지와 별개로 assumptions 에도 남긴다. */
const SYNTHETIC_ASSUMPTION =
  '🔴 교육용 합성 모델 — 계수의 크기는 실제 장비 상수가 아니다(PLN 명세 §P4 공통 고지). ' +
  '방향(부호)과 상충 구조만 물리적으로 옳게 설계되어 있다.';

/** 대상막·마스크 조건. PLN 공통 고정 조건. */
const FILM_ASSUMPTION =
  '대상막 폴리실리콘 500 nm · 하부막 SiO₂ 10 nm · 마스크 CD 200 nm';

/**
 * 🔴 압력–식각률 비단조에 대한 상시 고지.
 *    실제 장비에서 압력을 올리면 식각률은 어느 지점까지 오르다 **최댓값을 지나 다시 떨어진다.**
 *    원장에 압력–식각률 곡선이 없어(M-13, Mogab 로딩효과 페이월) PLN 모델은 최댓값 **아래 구간만**
 *    선형으로 근사한다. 이 사실을 화면 서술에서 빼면 학습자가 단조라고 잘못 배운다.
 */
const PRESSURE_NONMONOTONIC_NOTE =
  '🔴 압력–식각률은 실제로 단조가 아니다 — 최댓값이 존재하고 그 위에서는 다시 떨어진다. ' +
  '이 모델은 최댓값 아래 구간만 근사한다(원장 M-13: 압력–식각률 곡선 미확보).';

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 슬라이더 구간을 0~1 로. 씬 매핑 전용. */
function norm(v: number, range: [number, number]): number {
  return clamp01((v - range[0]) / (range[1] - range[0]));
}

/**
 * 소스(ICP) 전력 → 씬 `power`(정규화 전자밀도 n_e 대리). 씬 매핑 전용.
 *
 * 🔴 **구간 정규화 `(P_s − 200)/1800` 를 쓰지 않는다.** 그러면 슬라이더 유효 하한
 *    P_s = 200 W 에서 `power` 가 정확히 0 이 되는데, 200 W 는 「전자밀도 0」이 아니다.
 *    씬은 이 값을 n_e 대리로 써서 발광 세기와 시스 두께(∝ n_e^(−1/2))를 만들므로,
 *    0 이 들어가면 **모델은 식각이 진행 중이라 하는데 화면은 꺼진 챔버**가 된다.
 *    n_e ∝ P_s 이므로 **비율 정규화 P_s / P_s,max** 가 물리적으로 정직하다.
 *    (셰이더에도 발광 하한 `GLOW_FLOOR` 를 따로 뒀다 — 그쪽은 화면 배치값이다.)
 */
function powerScene(sourceW: number): number {
  return clamp01(sourceW / APPLIED_PS_RANGE[1]);
}

/** 폴리Si 식각의 OES 감시선 — SiF 440.2 nm(S172). 🔴 물리층에서 가져온다(합성 아님). */
const SIF_LINE = endpointWavelength('SiF');

/* ══════════════════════════════ 명세 ══════════════════════════════ */

/* ═══════════════ 차트 팩터리 (2026-08-22 · W6-6 해소) ═══════════════
 * 🔴 **차트 리터럴을 `LabSpec` 객체 안에 직접 쓰지 않는다.** 저장소 관례이자 게이트 요건이다 —
 *    `check-labs.mjs` 항목 6 은 칸 구간의 `tone:` 을 **feedback tone** 으로 읽는데
 *    `LabChartRefLine.tone` 은 `'spec' | 'info'` 라 구간 안에 있으면 **오탐으로 실패**한다
 *    (그 파일 200–212행이 이 함정을 명시해 두었다). `photo.ts`·`oxidation.ts`·`wafer.ts` 가
 *    전부 모듈 수준 팩터리 함수로 빼 둔 이유가 이것이다. 2026-08-22 실측으로 재확인했다.
 */

function etchAdvancedCharts(): LabChartBinding[] {
  return [
      {
        id: 'etch.advanced.overetchUnderlayerLoss',
        kind: 'line',
        ko: '오버에치 스윕 — 하부막 손실 Δd_UL (합격창 확대)',
        en: 'Overetch sweep — underlayer loss (spec window zoomed)',
        judgesOutputs: ['underlayerLossNm'],
        xKo: '오버에치율 OE', xEn: 'Overetch', xUnit: '%',
        yKo: '하부막(SiO₂) 손실 Δd_UL', yEn: 'Underlayer loss', yUnit: 'nm',
        xDomain: [ADV_OE_RANGE[0], ADV_OE_RANGE[1]],
        yDomain: [0, OE_CHART_Y_MAX_FACTOR * PASS_UL_LOSS_ADV_MAX_NM],
        refLines: [
          { value: PASS_UL_LOSS_ADV_MAX_NM, ko: '합격 상한 5.0 nm', en: 'Spec upper 5.0 nm', tone: 'spec' },
          { value: UNDERLAYER_THICKNESS_NM, ko: '펀치스루 10 nm (하부막 두께)', en: 'Punch-through 10 nm (underlayer thickness)', tone: 'info' },
        ],
        captionKo: '오버에치를 올릴수록 하부막이 선형으로 깎여 들어갑니다 — 기울기를 정하는 것은 하부막 선택비 S_UL 이고, 압력을 올리거나 바이어스를 낮추면 이 직선이 눕습니다. 아래 잔류물 패널과 가로축이 같습니다: 잔류물을 합격선 아래로 내리는 오버에치 구간과 하부막을 합격선 아래로 지키는 구간이 겹치는 띠는 **1.58 %p 밖에 되지 않으며, 5 %p 격자 위에서 그 안에 드는 눈금은 OE = 30 하나뿐입니다.**',
        captionEn: 'More overetch eats the underlayer linearly — the slope is set by the underlayer selectivity S_UL, so raising pressure or lowering bias flattens this line. This panel shares its x-axis with the residue panel below: the band where residue drops under its spec and the underlayer stays under its own is only 1.58 %p wide, and on the 5 %p slider grid only OE = 30 falls inside it.',
        note: '곡선은 오버에치율만 정의역 전체로 훑고 나머지 조건(압력·소스·바이어스·유량·패시베이션·종점 모드·외란)은 현재 값으로 고정한 것이며, `compute()` 가 판정에 쓰는 함수(`advancedModel`)와 **같은 함수 하나**로 그립니다. 세로 점선은 현재 오버에치 위치입니다. ⚠️ 종점 모드가 「고정시간」이거나 저개구율 외란으로 종점을 놓친 상태에서는 오버에치 슬라이더가 무시되므로 이 곡선은 수평선이 됩니다 — 그 자체가 「종점을 놓치면 오버에치를 조작할 수 없다」는 사실입니다.',
        build: (inputs, outputs) => {
          const at = (oe: number): AdvOut => advancedModel({
            p: inputs['pressureMTorr'] ?? 30,
            sourceW: inputs['sourceW'] ?? 1000,
            biasW: inputs['biasW'] ?? 50,
            flowSccm: inputs['flowSccm'] ?? 100,
            overetchPct: oe,
            passivationPct: inputs['passivationPct'] ?? 10,
            mode: Math.round(inputs['endpointMode'] ?? MODE_OES),
            fixedTimeS: inputs['fixedTimeS'] ?? 90,
            timeoutS: inputs['timeoutS'] ?? 300,
            disturbance: Math.round(inputs['disturbance'] ?? DIST_NONE),
          });
          const oeNow = inputs['overetchPct'] ?? 20;
          return [
            {
              id: 'ulLoss',
              ko: `Δd_UL(OE) · S_UL = ${at(oeNow).selectivityUL.toFixed(2)}`,
              en: `Underlayer loss(OE) at S_UL = ${at(oeNow).selectivityUL.toFixed(2)}`,
              points: oeGrid().map((oe) => ({ x: oe, y: at(oe).underlayerLossNm })),
            },
            {
              id: 'operating',
              ko: '현재 오버에치',
              en: 'Current overetch',
              points: [{ x: oeNow, y: 0 }, { x: oeNow, y: outputs['underlayerLossNm'] ?? at(oeNow).underlayerLossNm }],
              dashed: true,
            },
          ];
        },
      },
      {
        id: 'etch.advanced.overetchResidue',
        kind: 'line',
        ko: '오버에치 스윕 — 잔류물 지수 R_res (같은 가로축)',
        en: 'Overetch sweep — residue index (same x-axis)',
        judgesOutputs: ['residueIndex'],
        xKo: '오버에치율 OE', xEn: 'Overetch', xUnit: '%',
        yKo: '잔류물 지수 R_res', yEn: 'Residue index',
        xDomain: [ADV_OE_RANGE[0], ADV_OE_RANGE[1]],
        yDomain: [0, OE_CHART_Y_MAX_FACTOR * PASS_RESIDUE_ADV_MAX],
        refLines: [
          { value: PASS_RESIDUE_ADV_MAX, ko: '합격 상한 15.0', en: 'Spec upper 15.0', tone: 'spec' },
        ],
        captionKo: '잔류물은 오버에치에 대해 지수적으로 줄어듭니다 — 12 %p 마다 1/e 로 떨어집니다. 그런데 패시베이션 가스비 f 를 올리면 곡선 전체가 (1 + 0.030·f) 배로 들려, 같은 오버에치로는 합격선 아래에 닿지 못하게 됩니다. 위 하부막 패널과 겹쳐 보십시오: 이 곡선을 합격선 아래로 내리려고 오버에치를 올리면 위 패널의 직선이 자기 합격선을 뚫습니다.',
        captionEn: 'Residue falls exponentially with overetch — by 1/e every 12 %p. But raising the passivation ratio f lifts the whole curve by (1 + 0.030 f), so the same overetch no longer reaches under the spec line. Read it against the underlayer panel above: pushing overetch up to bring this curve down drives that straight line through its own spec.',
        note: '곡선은 오버에치율만 훑고 나머지 조건은 현재 값으로 고정했으며, `compute()` 가 판정에 쓰는 `advancedModel()` 과 같은 함수입니다. 세로 점선은 현재 오버에치입니다. 세로축 상한은 합격 임계의 2배이며 임계 자체는 건드리지 않았습니다(D-041). ⚠️ 위 패널과 같은 주의: 고정시간 모드·종점 미검출에서는 오버에치 슬라이더가 무시되어 곡선이 수평선이 됩니다.',
        build: (inputs, outputs) => {
          const at = (oe: number): AdvOut => advancedModel({
            p: inputs['pressureMTorr'] ?? 30,
            sourceW: inputs['sourceW'] ?? 1000,
            biasW: inputs['biasW'] ?? 50,
            flowSccm: inputs['flowSccm'] ?? 100,
            overetchPct: oe,
            passivationPct: inputs['passivationPct'] ?? 10,
            mode: Math.round(inputs['endpointMode'] ?? MODE_OES),
            fixedTimeS: inputs['fixedTimeS'] ?? 90,
            timeoutS: inputs['timeoutS'] ?? 300,
            disturbance: Math.round(inputs['disturbance'] ?? DIST_NONE),
          });
          const oeNow = inputs['overetchPct'] ?? 20;
          const f = inputs['passivationPct'] ?? 10;
          return [
            {
              id: 'residue',
              ko: `R_res(OE) · f = ${f} %`,
              en: `Residue(OE) at f = ${f} %`,
              points: oeGrid().map((oe) => ({ x: oe, y: at(oe).residueIndex })),
            },
            {
              id: 'operating',
              ko: '현재 오버에치',
              en: 'Current overetch',
              points: [{ x: oeNow, y: 0 }, { x: oeNow, y: outputs['residueIndex'] ?? at(oeNow).residueIndex }],
              dashed: true,
            },
          ];
        },
      },
  ];
}

export const ETCH_LABS: LabSpec[] = [
  /* ─────────────── 기초 (S5) — 「깊이를 맞춘다」 ─────────────── */
  {
    processId: ETCH_PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P4-03',
    titleKo: '바이어스 파워와 시간으로 트렌치 깊이 맞추기',
    titleEn: 'Hit the target trench depth with bias power and time',
    params: [
      {
        id: 'biasW', ko: '바이어스 파워 P_b', en: 'Bias power', unit: 'W',
        min: 0, max: 500, step: 10, initial: 50, sourceId: 'S162',
        note: 'S162 Table 1 격자 DRIE 실측 RF 30–50 W 를 기준선으로, PLN 이 교육용으로 0–500 W 까지 넓혔다. 압력 30 mTorr·소스파워 1000 W 는 이 단계에서 고정이다.',
      },
      {
        id: 'timeS', ko: '식각 시간 t', en: 'Etch time', unit: 's',
        min: 10, max: 180, step: 5, initial: 60, sourceId: 'S160',
        note: 'S160 Table 1 의 식각 스텝 15 s · 총 750 s 를 기준선으로 한 단일 스텝 구간(PLN 명세).',
      },
    ],
    /* 🔴 **고정 조건 카드** — 출처 두 곳이다.
     *   ① PLN 명세(§P4 공통 고지): 「공통 고정 조건: 대상막 = 폴리실리콘,
     *      레지스트 초기 두께 = 500 nm(기초·응용) / 700 nm(심화), 하부막 = SiO2 두께 10 nm,
     *      마스크 CD = 200 nm.」 → 세 단계 전부에 싣는다.
     *   ② PLN 명세(§기초 ② 조작 파라미터 표의 *(고정)* 행):
     *      「(고정) 챔버 압력 p = 30 mTorr」 · 「(고정) 소스 파워 P_s = 1000 W」 → 이 단계 전용.
     *
     * 🔴 6개 전부 슬라이더(`params`)와 겹치지 않는다 — 기초의 조작 파라미터는 P_b·t 둘뿐이다.
     *    p·P_s 는 **응용·심화에서 슬라이더로 열리므로 그 두 칸에서는 고정 조건이 아니다.**
     * 🔴 값은 이미 있는 상수에서 끌어온다(마스크 CD 만 예외 — 아래 주석). */
    fixedConditions: [
      {
        id: 'targetFilm', ko: '대상막', en: 'Target film',
        value: '폴리실리콘', valueEn: 'Polysilicon',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: `두께 ${POLY_THICKNESS_NM} nm. 이 값 이상 깎이면 하부막에 닿는다.`,
      },
      {
        id: 'resistInitialNm', ko: '레지스트 초기 두께', en: 'Initial resist thickness',
        value: String(RESIST_INIT_BASIC_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건 — 기초·응용 500 nm / 심화 700 nm.',
        note: '레지스트 잔막 출력의 출발점이다. 선택비 S_PR 이 낮으면 이 두께를 다 쓰기 전에 마스크가 사라진다.',
      },
      {
        id: 'underlayerNm', ko: '하부막 SiO₂ 두께', en: 'Underlayer SiO₂ thickness',
        value: String(UNDERLAYER_THICKNESS_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: '이 값 이상 깎이면 펀치스루다. 심화(§S7)의 하부막 손실 Δd_UL 판정이 이 두께에 걸린다.',
      },
      {
        /* 🔴 이름 있는 상수가 없다 — 200 nm 는 이 파일 어느 식에도 들어가지 않고
           `FILM_ASSUMPTION` 문자열 안에만 적혀 있다(교육용 합성 모델이 CD 를 입력으로 받지 않는다).
           상수를 새로 만들면 「식에 쓰이는 값」처럼 보이므로 리터럴로 두고 사유를 여기 남긴다. */
        id: 'maskCdNm', ko: '마스크 CD', en: 'Mask CD',
        value: '200', unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건(교육용 설정). 🔴 이 교육용 합성 모델은 CD 를 입력으로 받지 않는다 — 언더컷 U 를 읽을 때의 기준 폭으로만 쓰인다.',
      },
      {
        /* 🔴 상수가 없다 — 기초 모델(`basicModel`)은 압력·소스파워가 고정이라는 전제로
           **이미 단순화된 식**이라 두 값이 식에 등장하지 않는다(측방 식각률 40 nm/min 이
           「압력 고정이므로 상수」인 것이 그 자국이다). 응용·심화에서는 슬라이더가 되므로
           `APPLIED_P_RANGE` 같은 정의역 상수만 있고 고정값 상수는 없다. */
        id: 'chamberPressureMTorr', ko: '챔버 압력 p', en: 'Chamber pressure',
        value: '30', unit: 'mTorr',
        basis: 'PLN 명세 §기초 ② 표의 *(고정)* 행. 기초는 이 압력에 고정된 단순화 식을 쓴다 — 압력을 움직이는 것은 응용(§S6)의 학습 내용이다.',
        note: '측방 식각률이 40 nm/min 상수로 굳어 있는 것이 이 고정의 결과다. 압력이 열리면 그 자리에 압력 의존 항이 들어선다.',
      },
      {
        id: 'sourcePowerW', ko: '소스 파워 P_s', en: 'Source (ICP) power',
        value: '1000', unit: 'W',
        basis: 'PLN 명세 §기초 ② 표의 *(고정)* 행. 응용(§S6)에서 200–2000 W 슬라이더로 열린다.',
      },
    ],
    outputs: [
      { id: 'depthNm', ko: '트렌치 깊이 D', en: 'Trench depth', role: 'judge',
        pass: { min: PASS_DEPTH_BASIC_MIN_NM, max: PASS_DEPTH_BASIC_MAX_NM }, digits: 1 },
      { id: 'anisotropy', ko: '이방성도 A', en: 'Anisotropy', role: 'display', digits: 4 },
      { id: 'sidewallAngleDeg', ko: '측벽각 θ', en: 'Sidewall angle', role: 'display', digits: 2 },
      { id: 'selectivityPR', ko: '레지스트 선택비 S_PR', en: 'Resist selectivity', role: 'display', digits: 2 },
      { id: 'undercutNm', ko: '언더컷 U', en: 'Undercut', role: 'display', digits: 1 },
      { id: 'resistRemainNm', ko: '레지스트 잔막', en: 'Remaining resist', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const biasW = inputs['biasW'] ?? 50;
      const timeS = inputs['timeS'] ?? 60;
      // 🔴 A14 — 범위 밖은 계산하지 않고 정지시킨다.
      assertWithin('biasW', biasW, BASIC_PB_RANGE, 'W');
      assertWithin('timeS', timeS, BASIC_TIME_RANGE, 's');

      const m = basicModel(biasW, timeS);
      const common = [SYNTHETIC_ASSUMPTION, FILM_ASSUMPTION, '압력 30 mTorr · 소스파워 1000 W 고정'];
      return {
        depthNm: quantity(m.depthNm, {
          modelId: 'etch.lab.basic.depthNm', unit: 'nm', basis: "교육용 합성 — R_vert = 150 + 0.60·P_b 등 학습용 합성 식각률 모델입니다.",
          validRange: [0, 1350],
          assumptions: [...common, 'D = R_vert·t/60, R_vert = 150 + 0.60·P_b [nm/min]'],
        }),
        /* 🔴 A 의 **식 형태**는 합성이 아니다 — S257 §6.2 식 (6.1) 그 자체다(`A_f ≡ 1 − v_l/v_v`).
         *    합성인 것은 **거기에 넣는 R_lat·R_vert 계수**다. 그래서 `sourceId` 를 붙이지 않고
         *    (붙이면 설계값에 문헌 배지가 달린다) **식의 소재만** `assumptions` 에 인용한다.
         *    등급은 `교육용 합성`(synthetic) 그대로다. */
        anisotropy: quantity(m.anisotropy, {
          modelId: 'etch.lab.basic.anisotropy', unit: '', basis: "교육용 합성 — 학습용 합성 측면·수직 식각률비에서 유도한 이방성도입니다. 식의 형태 A = 1 − R_lat/R_vert 는 S257 §6.2 식 (6.1) 을 따랐고(S256 슬라이드 5 와 교차확인), 그 식에 넣는 계수만 설계값입니다.",
          validRange: [0, 1],
          assumptions: [
            ...common,
            'A = 1 − R_lat/R_vert. 압력 고정이라 R_lat = 40 nm/min 로 불변이다',
            '식의 소재: S257 §6.2 식 (6.1) — 이방성도를 1 − v_l/v_v 로 정의한다. S256 슬라이드 5 는 '
            + '같은 양을 1 − B/(2h_f) 로 적고, B 는 좌우를 합친 etch bias 이므로 B = 2·l 로 서로 검산된다',
            '🔴 R_lat 은 **편측** 측면 식각률이다(S257 의 l 규약). 좌우 언더컷을 합친 값을 넣으면 A 가 절반만큼 낮게 나온다',
            '🔴 계수 150 · 0.60 · 40 은 전부 PLN 설계값이다 — S256·S257 은 **식의 형태만** 뒷받침하고 계수는 뒷받침하지 않는다',
          ],
        }),
        sidewallAngleDeg: quantity(m.sidewallAngleDeg, {
          modelId: 'etch.lab.basic.sidewallAngleDeg', unit: '°', basis: "교육용 합성 — 합성 식각률비에서 유도한 학습용 측벽각입니다.",
          validRange: [0, 90],
          assumptions: [...common, 'θ = 90° − arctan(R_lat/R_vert). S161 실측 사이드월 89.6°~91.1° 가 기준선'],
        }),
        selectivityPR: quantity(m.selectivityPR, {
          modelId: 'etch.lab.basic.selectivityPR', unit: '', basis: "교육용 합성 — S_PR 식의 계수가 전부 학습용 설계값입니다.",
          validRange: [2, 6],
          assumptions: [...common, 'S_PR = 6.00 − 0.008·P_b. S161 Si:포토레지스트 실측 22 가 상한 기준선'],
        }),
        undercutNm: quantity(m.undercutNm, {
          modelId: 'etch.lab.basic.undercutNm', unit: 'nm', basis: "교육용 합성 — 합성 측면 식각률로 계산한 학습용 언더컷입니다.",
          validRange: [0, 120],
          assumptions: [...common, '🔴 언더컷 단면을 그릴 씬이 없다 — 수치로만 확인한다(DSN §4-2 공백 1)'],
        }),
        resistRemainNm: quantity(m.resistRemainNm, {
          modelId: 'etch.lab.basic.resistRemainNm', unit: 'nm', basis: "교육용 합성 — 합성 선택비로 계산한 학습용 레지스트 잔막입니다.",
          validRange: [-175, RESIST_INIT_BASIC_NM],
          assumptions: [...common, '잔막 = 500 − (R_vert/S_PR)·t/60. 0 이하면 마스크 소실이다'],
        }),
      };
    },
    scene: {
      sceneId: 'plasma',
      // 🔴 DSN §4-2 확인 매핑만. `flow` 는 근거가 없어 매핑하지 않는다.
      map: (i, out) => ({
        bias: clamp01(out['anisotropy'] ?? norm(i['biasW'] ?? 50, BASIC_PB_RANGE)),
        // 기초는 압력·소스파워가 고정이다 — 상수로 넘겨 「발광이 안 변한다」를 그대로 보여준다.
        pressure: norm(30, APPLIED_P_RANGE),
        power: powerScene(1000),
      }),
      note:
        'bias = P_b/500 → 시스 두께(차일드–랭뮤어 s ∝ V^¾ — 바이어스↑ 시스 두꺼워짐). ' +
        'pressure·power 는 이 단계에서 고정값이라 상수로 넘긴다 — 발광이 변하지 않는 것이 학습 의도다(PLN §④3). ' +
        'flow 는 근거가 없어 매핑하지 않는다(DSN §4-2).',
    },
    feedback: [
      {
        id: 'ET-B1', tone: 'stop',
        ko: '공정 한계선 초과 — 레지스트 소진. 마스크가 사라져 하부막 전면이 식각됩니다. 바이어스 파워를 낮춰 선택비를 회복하거나 식각 시간을 줄인 뒤 다시 실행하세요.',
        en: 'Process limit exceeded — resist fully consumed. With no mask left the entire underlayer is etched. Lower the bias power to recover selectivity, or shorten the etch time, then run again.',
        when: (_i, o) => (o['resistRemainNm'] ?? 1) <= 0,
      },
      {
        id: 'ET-B2', tone: 'warn',
        ko: '목표 초과 — 하부막이 손상되었습니다. 식각 시간 또는 바이어스 파워를 낮추세요.',
        en: 'Target exceeded — the underlayer is damaged. Lower the etch time or the bias power.',
        when: (_i, o) => (o['depthNm'] ?? 0) > PASS_DEPTH_BASIC_MAX_NM,
      },
      {
        id: 'ET-B3', tone: 'hint',
        ko: '목표 미달 — 트렌치 바닥에 잔막이 남아 하부 배선이 열리지 않습니다. 식각 시간 또는 바이어스 파워를 올리세요.',
        en: 'Below target — residue remains at the trench bottom and the underlying contact does not open. Raise the etch time or the bias power.',
        when: (_i, o) => (o['depthNm'] ?? 0) < PASS_DEPTH_BASIC_MIN_NM,
      },
      {
        id: 'ET-B4', tone: 'hint',
        ko: '바이어스 0 W — 이온 방향성이 없어 화학 식각만 진행됩니다. 측벽각이 75°까지 눕습니다. 바이어스를 올려 이방성 변화를 관찰하세요.',
        en: 'Bias at 0 W — with no ion directionality only chemical etching proceeds and the sidewall lies back to 75°. Raise the bias to observe the change in anisotropy.',
        when: (i) => (i['biasW'] ?? 50) === 0,
      },
      {
        id: 'ET-B5', tone: 'warn',
        ko: '레지스트 잔막이 100 nm 아래입니다. 바이어스를 더 올리면 선택비가 떨어져 마스크가 먼저 사라집니다.',
        en: 'Remaining resist has fallen below 100 nm. Raising the bias further lowers selectivity and the mask will disappear first.',
        when: (_i, o) => (o['resistRemainNm'] ?? 500) > 0 && (o['resistRemainNm'] ?? 500) < 100,
      },
    ],
    tradeoffs: [
      {
        ko: '바이어스 파워↑ → 이방성도 A 가 오른다(좋음) / 레지스트 선택비 S_PR 가 떨어진다(나쁨). P_b 50→250 W 에서 A 0.778→0.867(+11 %), S_PR 5.60→4.00(−29 %).',
        en: 'Higher bias power raises anisotropy (good) but lowers resist selectivity (bad). From 50 to 250 W: A 0.778→0.867 (+11 %), S_PR 5.60→4.00 (−29 %).',
      },
      {
        ko: '식각 시간↑ → 깊이가 목표에 다가간다(좋음) / 언더컷이 커지고 레지스트 잔막이 준다(나쁨). t 60→100 s 에서 U 40.0→66.7 nm(+67 %), 최종 선폭 120→66.6 nm.',
        en: 'Longer etch time approaches the target depth (good) but widens the undercut and consumes resist (bad). From 60 to 100 s: undercut 40.0→66.7 nm (+67 %), final linewidth 120→66.6 nm.',
      },
      {
        ko: '같은 깊이 300 nm 를 만드는 길이 셋이다 — (50 W·100 s)는 선택비가 넉넉하지만 언더컷 66.7 nm, (250 W·60 s)는 언더컷 40.0 nm 지만 선택비가 4.00 까지 떨어진다. 「무엇을 포기할지」가 이 단계의 답이다.',
        en: 'Three different routes reach 300 nm — 50 W/100 s keeps selectivity high but leaves a 66.7 nm undercut; 250 W/60 s holds the undercut at 40.0 nm but drops selectivity to 4.00. Choosing what to give up is the answer here.',
      },
      {
        ko: '🔴 이 단계는 압력이 고정이라 언더컷 속도 R_lat 가 40 nm/min 로 고정이다. 압력을 여는 응용 단계에서는 압력이 이방성과 선택비를 정반대로 끌어당긴다.',
        en: 'Pressure is fixed here, so the lateral rate stays at 40 nm/min. Once pressure opens up in the applied stage it pulls anisotropy and selectivity in opposite directions.',
      },
    ],
  },

  /* ─────────────── 응용 (S6) — 「깊이·이방성·선택비를 동시에」 ─────────────── */
  {
    processId: ETCH_PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P4-04',
    titleKo: '압력·소스파워·바이어스·시간으로 3개 지표 동시 만족',
    titleEn: 'Satisfy depth, anisotropy and selectivity at once',
    params: [
      {
        id: 'pressureMTorr', ko: '챔버 압력 p', en: 'Chamber pressure', unit: 'mTorr',
        min: 5, max: 300, step: 5, initial: 30, sourceId: 'S162',
        note: 'S162 Table 1 격자 DRIE 실측 15–25 mTorr 를 기준선으로, PLN 이 교육용으로 5–300 mTorr 까지 넓혔다.',
      },
      {
        id: 'sourceW', ko: '소스 파워 (ICP) P_s', en: 'Source (ICP) power', unit: 'W',
        min: 200, max: 2000, step: 50, initial: 1000, sourceId: 'S162',
        note: 'S162 Table 1 ICP 600–800 W · S160 소스전력 1500 W(장비 최대 3000 W)를 기준선으로 한 구간.',
      },
      {
        id: 'biasW', ko: '바이어스 파워 P_b', en: 'Bias power', unit: 'W',
        min: 0, max: 500, step: 10, initial: 50, sourceId: 'S162',
        note: 'S162 Table 1 RF 30–50 W 기준선. S160 의 자기바이어스 30–105 V 와 대응한다.',
      },
      {
        id: 'timeS', ko: '식각 시간 t', en: 'Etch time', unit: 's',
        min: 10, max: 180, step: 5, initial: 60, sourceId: 'S160',
        note: 'S160 Table 1 식각 스텝 15 s · 총 750 s 기준선.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P4 **공통** 고정 조건 4개만이다.
     *   기초의 p = 30 mTorr · P_s = 1000 W 는 **이 단계에서 슬라이더로 열려 있어**
     *   (`pressureMTorr` · `sourceW`) 고정 조건이 아니다 — 조작 가능한 값을 「정해진 것」으로
     *   보이면 학습자가 그 축을 손대지 않는다. 4개는 슬라이더와 겹치지 않는다. */
    fixedConditions: [
      {
        id: 'targetFilm', ko: '대상막', en: 'Target film',
        value: '폴리실리콘', valueEn: 'Polysilicon',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: `두께 ${POLY_THICKNESS_NM} nm.`,
      },
      {
        id: 'resistInitialNm', ko: '레지스트 초기 두께', en: 'Initial resist thickness',
        value: String(RESIST_INIT_BASIC_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건 — 기초·응용 500 nm(심화만 700 nm).',
        note: '🔴 이 단계는 선택비 S_PR ≥ 9.0 이 판정이다. 잔막이 이 두께에서 출발한다.',
      },
      {
        id: 'underlayerNm', ko: '하부막 SiO₂ 두께', en: 'Underlayer SiO₂ thickness',
        value: String(UNDERLAYER_THICKNESS_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: '이 값 이상 깎이면 펀치스루다.',
      },
      {
        /* 🔴 상수 없음 — 기초 칸과 같은 사유다(교육용 합성 모델이 CD 를 입력으로 받지 않는다). */
        id: 'maskCdNm', ko: '마스크 CD', en: 'Mask CD',
        value: '200', unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건(교육용 설정). 모델 입력이 아니라 언더컷 U 를 읽는 기준 폭이다.',
      },
    ],
    outputs: [
      { id: 'depthNm', ko: '트렌치 깊이 D', en: 'Trench depth', role: 'judge',
        pass: { min: PASS_DEPTH_APPLIED_MIN_NM, max: PASS_DEPTH_APPLIED_MAX_NM }, digits: 1 },
      { id: 'anisotropy', ko: '이방성도 A', en: 'Anisotropy', role: 'judge',
        pass: { min: PASS_ANISO_APPLIED_MIN }, digits: 4 },
      { id: 'selectivityPR', ko: '레지스트 선택비 S_PR', en: 'Resist selectivity', role: 'judge',
        pass: { min: PASS_SPR_APPLIED_MIN }, digits: 2 },
      { id: 'etchRateNmPerMin', ko: '수직 식각률 R_vert', en: 'Vertical etch rate', role: 'display', digits: 1 },
      { id: 'lateralRateNmPerMin', ko: '측면 식각률 R_lat', en: 'Lateral etch rate', role: 'display', digits: 2 },
      { id: 'sidewallAngleDeg', ko: '측벽각 θ', en: 'Sidewall angle', role: 'display', digits: 2 },
      { id: 'undercutNm', ko: '언더컷 U', en: 'Undercut', role: 'display', digits: 1 },
      { id: 'resistRemainNm', ko: '레지스트 잔막', en: 'Remaining resist', role: 'display', digits: 1 },
      { id: 'endpointWavelengthNm', ko: 'OES 감시 파장 (SiF)', en: 'OES monitored line (SiF)', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const p = inputs['pressureMTorr'] ?? 30;
      const sourceW = inputs['sourceW'] ?? 1000;
      const biasW = inputs['biasW'] ?? 50;
      const timeS = inputs['timeS'] ?? 60;
      assertWithin('pressureMTorr', p, APPLIED_P_RANGE, 'mTorr');
      assertWithin('sourceW', sourceW, APPLIED_PS_RANGE, 'W');
      assertWithin('biasW', biasW, APPLIED_PB_RANGE, 'W');
      assertWithin('timeS', timeS, APPLIED_TIME_RANGE, 's');

      const m = appliedModel(p, sourceW, biasW, timeS);
      const common = [SYNTHETIC_ASSUMPTION, FILM_ASSUMPTION, PRESSURE_NONMONOTONIC_NOTE];
      return {
        depthNm: quantity(m.depthNm, {
          modelId: 'etch.lab.applied.depthNm', unit: 'nm', basis: "교육용 합성 — R_vert = 150 + 0.60·P_b 등 학습용 합성 식각률 모델입니다.",
          validRange: [0, 1410],
          assumptions: [...common, 'R_vert = 0.06·P_s + 0.40·P_b + 0.5·p [nm/min]'],
        }),
        /* 🔴 기초와 같다 — 식 형태는 S257 §6.2 식 (6.1), 계수만 설계값. `sourceId` 는 붙이지 않는다. */
        anisotropy: quantity(m.anisotropy, {
          modelId: 'etch.lab.applied.anisotropy', unit: '', basis: "교육용 합성 — 학습용 합성 측면·수직 식각률비에서 유도한 이방성도입니다. 식의 형태 A = 1 − R_lat/R_vert 는 S257 §6.2 식 (6.1) 을 따랐고(S256 슬라이드 5 와 교차확인), R_lat·R_vert 의 계수만 설계값입니다.",
          validRange: [0, 1],
          assumptions: [
            ...common,
            'R_lat = (0.004·P_s + 0.25·p)·300/(300+P_b) — 바이어스↑는 측면 식각을 누른다',
            '식의 소재: S257 §6.2 식 (6.1) — 이방성도를 1 − v_l/v_v 로 정의한다. S256 슬라이드 5 의 '
            + '1 − B/(2h_f) 와 B = 2·l 로 서로 검산된다',
            '🔴 R_lat 은 **편측** 값이다(S257 의 l 규약) — 화면의 언더컷 U = R_lat·t 도 편측이다. 좌우를 합치지 않는다',
            '🔴 압력·소스·바이어스 계수는 전부 PLN 설계값이다. S256·S257 은 **정의식의 형태만** 뒷받침한다',
          ],
        }),
        selectivityPR: quantity(m.selectivityPR, {
          modelId: 'etch.lab.applied.selectivityPR', unit: '', basis: "교육용 합성 — S_PR 식의 계수가 전부 학습용 설계값입니다.",
          validRange: [0, 22],
          assumptions: [
            ...common,
            'S_PR = 9.0·300/(300+0.4·P_b)·(1+0.004(p−30))·(1000/P_s)^0.10 — 압력↑ 폴리머 전구체↑, 바이어스↑ 스퍼터 침식↑',
          ],
        }),
        etchRateNmPerMin: quantity(m.vertRate, {
          modelId: 'etch.lab.applied.etchRate', unit: 'nm/min', basis: "교육용 합성 — 학습용 합성 수직 식각률입니다.",
          validRange: [0, 470],
          assumptions: [...common, 'S162 Table 1 초기 식각속도 실측 18.0–73.3 nm/s 가 크기 기준선'],
        }),
        lateralRateNmPerMin: quantity(m.lateralRate, {
          modelId: 'etch.lab.applied.lateralRate', unit: 'nm/min', basis: "교육용 합성 — 학습용 합성 측면 식각률입니다.",
          validRange: [0, 83], assumptions: common,
        }),
        sidewallAngleDeg: quantity(m.sidewallAngleDeg, {
          modelId: 'etch.lab.applied.sidewallAngleDeg', unit: '°', basis: "교육용 합성 — 합성 식각률비에서 유도한 학습용 측벽각입니다.",
          validRange: [0, 90],
          assumptions: [...common, 'A ≥ 0.930 은 측벽각 86.0° 에 해당한다'],
        }),
        undercutNm: quantity(m.undercutNm, {
          modelId: 'etch.lab.applied.undercutNm', unit: 'nm', basis: "교육용 합성 — 합성 측면 식각률로 계산한 학습용 언더컷입니다.",
          validRange: [0, 250],
          assumptions: [...common, '🔴 언더컷 단면 씬은 없다 — 수치로만 확인한다(DSN §4-2 공백 1)'],
        }),
        resistRemainNm: quantity(m.resistRemainNm, {
          modelId: 'etch.lab.applied.resistRemainNm', unit: 'nm', basis: "교육용 합성 — 합성 선택비로 계산한 학습용 레지스트 잔막입니다.",
          validRange: [280, RESIST_INIT_BASIC_NM], assumptions: common,
        }),
        // 🔴 이 값만 합성이 아니다 — 물리층 `etch/oes` 가 원장 S172 에서 읽어 온다.
        endpointWavelengthNm: quantity(SIF_LINE.value, {
          modelId: 'etch.lab.applied.endpointWavelengthNm', unit: 'nm', sourceId: SIF_LINE.sourceId,
          validRange: SIF_LINE.validRange,
          assumptions: [
            '폴리Si 식각 부산물 SiF 선(440.2 nm)을 종점 감시선으로 쓴다 — 물리층 etch/oes 호출',
            ...SIF_LINE.assumptions,
          ],
        }),
      };
    },
    scene: {
      sceneId: 'plasma',
      map: (i, out) => ({
        bias: clamp01(out['anisotropy'] ?? norm(i['biasW'] ?? 50, APPLIED_PB_RANGE)),
        pressure: norm(i['pressureMTorr'] ?? 30, APPLIED_P_RANGE),
        power: powerScene(i['sourceW'] ?? 1000),
      }),
      note:
        'bias = P_b/500 → 시스 두께 s ∝ V^¾(바이어스↑ → 시스 두꺼워짐, 차일드–랭뮤어) · ' +
        'pressure = (p−5)/295 → 압력↑ → n_e↑ → 시스 얇아짐 · ' +
        'power = P_s/2000 → 전자밀도 n_e 대리. 소스전력↑ → n_e↑ → 발광↑ **이면서 시스는 얇아진다**' +
        '(디바이 길이 λ_D ∝ n_e^(−½)). DSN §4-2 확인 매핑 3종. ' +
        'flow 는 근거가 없어 매핑하지 않는다. 트렌치 단면·언더컷을 그릴 씬은 존재하지 않는다.',
    },
    feedback: [
      {
        id: 'ET-A1', tone: 'stop',
        ko: '공정 한계선 초과 — 레지스트 소진. 마스크가 소실됐습니다. 바이어스를 낮추거나 압력을 올려 선택비를 확보한 뒤 재실행하세요.',
        en: 'Process limit exceeded — resist consumed and the mask is gone. Lower the bias or raise the pressure to regain selectivity, then run again.',
        when: (_i, o) => (o['resistRemainNm'] ?? 1) <= 0,
      },
      {
        id: 'ET-A2', tone: 'stop',
        ko: '공정 한계선 초과 — 고압·고바이어스 동시 조건에서 방전이 불안정합니다(아크·V_dc 진동). 압력 또는 바이어스 중 하나를 낮추세요.',
        en: 'Process limit exceeded — the discharge is unstable at high pressure combined with high bias (arcing, V_dc oscillation). Lower either the pressure or the bias.',
        when: (i) => (i['pressureMTorr'] ?? 30) >= 250 && (i['biasW'] ?? 50) >= 400,
      },
      {
        id: 'ET-A3', tone: 'stop',
        ko: '플라즈마 미점화 — 압력 또는 소스 파워가 부족합니다. 압력을 15 mTorr 이상 또는 소스 파워를 300 W 이상으로 올리세요.',
        en: 'Plasma will not strike — pressure or source power is too low. Raise the pressure above 15 mTorr or the source power above 300 W.',
        when: (i) => (i['sourceW'] ?? 1000) < 300 && (i['pressureMTorr'] ?? 30) < 15,
      },
      {
        id: 'ET-A4', tone: 'hint',
        ko: '3개 지표 중 2개만 합격입니다. 선택비는 압력↑·바이어스↓ 방향에서, 이방성은 그 반대 방향에서 좋아집니다 — 한 인자만 한 칸씩 움직여 보세요.',
        en: 'Two of the three targets pass. Selectivity improves with higher pressure and lower bias; anisotropy improves in the opposite direction — move one parameter one step at a time.',
        when: (_i, o) => appliedPassCount(o) === 2,
      },
      {
        id: 'ET-A5', tone: 'warn',
        ko: '극단값에서는 다른 지표가 반드시 무너집니다. 바이어스만 최대로 밀면 선택비가, 압력만 최대로 밀면 이방성이 먼저 무너집니다 — 압력과 바이어스를 짝으로 조정하세요.',
        en: 'At the extremes another target always collapses: max bias breaks selectivity, max pressure breaks anisotropy. Adjust pressure and bias as a pair.',
        when: (i) =>
          (i['biasW'] ?? 50) >= 500 || (i['pressureMTorr'] ?? 30) >= 300
          || (i['pressureMTorr'] ?? 30) <= 5 || (i['sourceW'] ?? 1000) >= 2000,
      },
      {
        id: 'ET-A6', tone: 'hint',
        ko: '시간만으로는 이방성도·선택비를 만들 수 없습니다. 시간은 깊이 하나만 움직입니다 — 압력·바이어스를 먼저 잡고 시간으로 깊이를 맞추세요.',
        en: 'Time alone cannot produce anisotropy or selectivity — it only moves depth. Fix pressure and bias first, then dial in depth with time.',
        when: (_i, o) =>
          (o['anisotropy'] ?? 0) < PASS_ANISO_APPLIED_MIN
          && (o['selectivityPR'] ?? 0) < PASS_SPR_APPLIED_MIN,
      },
    ],
    tradeoffs: [
      {
        ko: '압력↑(30→190 mTorr, P_s=1700 고정) → 선택비 S_PR 5.57→9.13(+64 %)·식각률 277→357 nm/min(좋음) / 이방성도 0.9779→0.9348·측벽각 88.73°→86.27°·언더컷 6.6→25.2 nm(3.8배)(나쁨). 압력은 「선택비의 친구, 이방성의 적」이다.',
        en: 'Raising pressure 30→190 mTorr (at 1700 W source) lifts selectivity 5.57→9.13 (+64 %) and etch rate 277→357 nm/min (good), while anisotropy falls 0.9779→0.9348, the sidewall lies from 88.73° to 86.27°, and the undercut widens 6.6→25.2 nm — 3.8× (bad). Pressure is a friend of selectivity and an enemy of anisotropy.',
      },
      {
        ko: '바이어스↑(50→400 W) → 이방성도 0.7855→0.9348·측벽각 77.89°→86.27°·식각률 217→357 nm/min(좋음) / 선택비 13.12→9.13(−30 %)·레지스트 어깨 라운딩 0→18 nm(나쁨). 바이어스는 「이방성의 친구, 선택비의 적」이다.',
        en: 'Raising bias 50→400 W lifts anisotropy 0.7855→0.9348, stands the sidewall from 77.89° to 86.27°, and raises the etch rate 217→357 nm/min (good), while selectivity drops 13.12→9.13 (−30 %) and resist shoulder rounding grows 0→18 nm (bad). Bias is a friend of anisotropy and an enemy of selectivity.',
      },
      {
        ko: '소스 파워↑(1000→1700 W) → 식각률 235→277 nm/min·저바이어스 영역에서만 이방성 상승(P_b=50: 0.8962→0.9105 / P_b=400: 0.9790→0.9779 로 포화)(좋음) / 선택비 −5 %(나쁨). 플럭스는 레지스트도 함께 깎는다.',
        en: 'Raising source power 1000→1700 W lifts the etch rate 235→277 nm/min and improves anisotropy only in the low-bias region (0.8962→0.9105 at 50 W bias; already saturated at 400 W, 0.9790→0.9779), but costs about 5 % of selectivity. More flux etches the resist too.',
      },
      {
        ko: '식각 시간↑ → 깊이가 목표에 다가간다(좋음) / 언더컷이 커지고 레지스트 잔막이 준다(나쁨). t 60→65 s 에서 D 357→386.8 nm, U 23.3→25.2 nm.',
        en: 'Longer etch time approaches the target depth (good) but widens the undercut and consumes resist (bad). From 60 to 65 s: depth 357→386.8 nm, undercut 23.3→25.2 nm.',
      },
      {
        ko: '→ 도달해야 할 통찰: 압력과 바이어스는 선택비·이방성에 정확히 반대 방향으로 작용한다. 하나만 극단으로 밀면 반드시 한 지표가 무너지고, 「압력으로 선택비를 벌고 그 대가로 잃은 이방성을 바이어스로 되사는」 균형점(p≈190 mTorr, P_b≈400 W)에서만 3개가 동시에 성립한다.',
        en: 'The insight: pressure and bias push selectivity and anisotropy in exactly opposite directions. Push either one to an extreme and a target breaks. All three pass only at the balance point where pressure buys selectivity and bias buys back the anisotropy it cost — around 190 mTorr and 400 W.',
      },
      {
        ko: PRESSURE_NONMONOTONIC_NOTE,
        en: 'Note: in a real chamber the pressure–etch-rate relation is not monotonic — it peaks and then falls again. This model approximates only the branch below that maximum (ledger M-13: the pressure–rate curve was not obtained).',
      },
    ],
  },

  /* ─────────────── 심화 (S7) — 「외란 속에서 수율과 처리량을」 ─────────────── */
  {
    processId: ETCH_PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P4-05',
    titleKo: '외란 3종을 진단하고 수율·처리량을 동시에 회복시키기',
    titleEn: 'Diagnose three disturbances and restore yield and throughput together',
    params: [
      {
        id: 'pressureMTorr', ko: '챔버 압력 p', en: 'Chamber pressure', unit: 'mTorr',
        min: 5, max: 300, step: 5, initial: 30, sourceId: 'S162',
        note: 'S162 Table 1 실측 15–25 mTorr 기준선을 PLN 이 교육용으로 넓힌 구간.',
      },
      {
        id: 'sourceW', ko: '소스 파워 (ICP) P_s', en: 'Source (ICP) power', unit: 'W',
        min: 200, max: 2000, step: 50, initial: 1000, sourceId: 'S162',
        note: 'S162 ICP 600–800 W · S160 1500 W(최대 3000 W) 기준선.',
      },
      {
        id: 'biasW', ko: '바이어스 파워 P_b', en: 'Bias power', unit: 'W',
        min: 0, max: 500, step: 10, initial: 50, sourceId: 'S162',
        note: 'S162 RF 30–50 W 기준선. 400 W 를 넘고 오버에치 35 % 이상이면 차징 노칭이 발동한다.',
      },
      {
        id: 'flowSccm', ko: '식각가스 총유량 Q', en: 'Total etch gas flow', unit: 'sccm',
        min: 20, max: 500, step: 10, initial: 100, sourceId: 'S160',
        note: 'S160 Table 1 SF₆ 50 · C₄F₈ 27 · SiF₄ 25+O₂ 12 sccm 실측을 기준선으로 넓힌 구간.',
      },
      {
        id: 'overetchPct', ko: '오버에치율 OE', en: 'Overetch', unit: '%',
        min: 0, max: 80, step: 5, initial: 20, sourceId: 'S160',
        note: '오버에치가 하부막을 깎는 양은 Δd_UL = (OE/100)·d/S_UL 로, 하부막 선택비가 좌우한다. S160 Table 2 의 Si:SiO₂ 실측 138(Bosch)·185(STiGer)가 그 기준선이다.',
      },
      {
        id: 'passivationPct', ko: '패시베이션 가스비 f', en: 'Passivation gas ratio', unit: '%',
        min: 0, max: 40, step: 2, initial: 10, sourceId: 'S160',
        note: 'S160 Bosch 레시피의 C₄F₈ 27 sccm / (SF₆ 50 + C₄F₈ 27) ≈ 35 % 가 기준선. 36 % 이상에서 바닥까지 폴리머가 덮여 식각이 멈춘다.',
      },
      {
        id: 'endpointMode', ko: '종점 검출 모드 (0=OES · 1=간섭계 · 2=고정시간)', en: 'Endpoint mode (0=OES, 1=IEP, 2=fixed time)', unit: '',
        min: 0, max: 2, step: 1, initial: 0, sourceId: 'S168',
        note: 'OES 는 발광 세기로, 간섭계(IEP)는 막두께 간섭 신호로 종점을 잡는다. 개구율이 낮으면 OES 만 신호를 놓친다(S168 §비아 식각 종점검출).',
      },
      {
        id: 'fixedTimeS', ko: '식각 시간 t_fix (고정시간 모드 전용)', en: 'Fixed etch time (fixed-time mode only)', unit: 's',
        min: 10, max: 600, step: 5, initial: 90, sourceId: 'S160',
        note: 'S160 총 식각시간 750 s 기준선. 고정시간 모드(2)에서만 쓰인다 — 다른 모드에서는 무시된다.',
      },
      {
        id: 'timeoutS', ko: 'OES 타임아웃 t_max', en: 'OES timeout', unit: 's',
        min: 60, max: 600, step: 5, initial: 300, sourceId: 'S160',
        note: '종점을 못 찾았을 때 장비가 식각을 멈추는 안전 시각. S160 총 식각시간 750 s 가 크기 기준선이다.',
      },
      {
        id: 'disturbance', ko: '외란 (0=정상 · 1=챔버 드리프트 · 2=저개구율)', en: 'Disturbance (0=none, 1=chamber drift, 2=low open area)', unit: '',
        min: 0, max: 2, step: 1, initial: 0, sourceId: 'S168',
        note: '🔴 PLN §④ 불량 시나리오 A·B 를 입력으로 연 것이다. 순수 함수 하네스에는 시간축 이벤트 주입 경로가 없어, 이렇게 열지 않으면 LO-P4-05(외란 진단·복구)가 통째로 죽는다. 시나리오 C(차징 노칭)는 P_b·OE 조합이 스스로 발동시키므로 입력이 없다.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P4 공통 고정 조건 4개.
     *   🔴 **레지스트 초기 두께만 700 nm 다** — 명세가 「500 nm(기초·응용) / **700 nm(심화)**」로
     *      단계를 갈라 적었다. 여기서 500 을 복사해 오면 오버에치 80 % 구간의 잔막 계산과
     *      화면 조건이 갈라진다.
     *   심화의 조작 파라미터 10개(p·P_s·P_b·Q·OE·f·종점모드·t_fix·t_max·외란) 중
     *   겹치는 것은 없다. */
    fixedConditions: [
      {
        id: 'targetFilm', ko: '대상막', en: 'Target film',
        value: '폴리실리콘', valueEn: 'Polysilicon',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: `두께 ${POLY_THICKNESS_NM} nm. 종점 검출(OES SiF 440.2 nm)이 잡는 것이 이 막의 소진 시점이다.`,
      },
      {
        id: 'resistInitialNm', ko: '레지스트 초기 두께', en: 'Initial resist thickness',
        value: String(RESIST_INIT_ADV_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건 — 🔴 **심화만 700 nm**(기초·응용은 500 nm). 오버에치를 최대 80 % 까지 거는 단계라 마스크 예산을 더 준다.',
      },
      {
        id: 'underlayerNm', ko: '하부막 SiO₂ 두께', en: 'Underlayer SiO₂ thickness',
        value: String(UNDERLAYER_THICKNESS_NM), unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건.',
        note: `🔴 이 단계의 판정 지표다 — 하부막 손실 Δd_UL ≤ ${PASS_UL_LOSS_ADV_MAX_NM} nm 이므로 ${UNDERLAYER_THICKNESS_NM} nm 중 절반까지만 쓸 수 있다.`,
      },
      {
        /* 🔴 상수 없음 — 기초·응용 칸과 같은 사유다. */
        id: 'maskCdNm', ko: '마스크 CD', en: 'Mask CD',
        value: '200', unit: 'nm',
        basis: 'PLN 명세 §P4 공통 고정 조건(교육용 설정). 모델 입력이 아니라 언더컷·노칭을 읽는 기준 폭이다.',
      },
    ],
    outputs: [
      { id: 'anisotropy', ko: '이방성도 A', en: 'Anisotropy', role: 'judge',
        pass: { min: PASS_ANISO_ADV_MIN }, digits: 4 },
      { id: 'underlayerLossNm', ko: '하부막(SiO₂) 손실 Δd_UL', en: 'Underlayer loss', role: 'judge',
        pass: { max: PASS_UL_LOSS_ADV_MAX_NM }, digits: 2 },
      { id: 'residueIndex', ko: '잔류물 지수 R_res', en: 'Residue index', role: 'judge',
        pass: { max: PASS_RESIDUE_ADV_MAX }, digits: 2 },
      { id: 'throughputWph', ko: '처리량 TH', en: 'Throughput', role: 'judge',
        pass: { min: PASS_THROUGHPUT_ADV_MIN }, digits: 1 },
      { id: 'yieldPct', ko: '수율 Y', en: 'Yield', role: 'judge',
        pass: { min: PASS_YIELD_ADV_MIN }, digits: 1 },
      { id: 'etchRateNmPerMin', ko: '수직 식각률 R_vert', en: 'Vertical etch rate', role: 'display', digits: 1 },
      { id: 'endpointTimeS', ko: '종점 시각 t_EP', en: 'Endpoint time', role: 'display', digits: 1 },
      { id: 'totalEtchTimeS', ko: '실제 식각 시간', en: 'Actual etch time', role: 'display', digits: 1 },
      { id: 'effectiveOveretchPct', ko: '실효 오버에치', en: 'Effective overetch', role: 'display', digits: 1 },
      { id: 'cycleTimeS', ko: '사이클 시간 t_cycle', en: 'Cycle time', role: 'display', digits: 1 },
      { id: 'notchWidthNm', ko: '차징 노치 폭 N', en: 'Charging notch width', role: 'display', digits: 1 },
      { id: 'selectivityUL', ko: '하부막 선택비 S_UL', en: 'Underlayer selectivity', role: 'display', digits: 2 },
      { id: 'selectivityPR', ko: '레지스트 선택비 S_PR', en: 'Resist selectivity', role: 'display', digits: 2 },
      { id: 'resistRemainNm', ko: '레지스트 잔막', en: 'Remaining resist', role: 'display', digits: 1 },
      { id: 'endpointWavelengthNm', ko: 'OES 감시 파장 (SiF)', en: 'OES monitored line (SiF)', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const a: AdvInput = {
        p: inputs['pressureMTorr'] ?? 30,
        sourceW: inputs['sourceW'] ?? 1000,
        biasW: inputs['biasW'] ?? 50,
        flowSccm: inputs['flowSccm'] ?? 100,
        overetchPct: inputs['overetchPct'] ?? 20,
        passivationPct: inputs['passivationPct'] ?? 10,
        mode: Math.round(inputs['endpointMode'] ?? MODE_OES),
        fixedTimeS: inputs['fixedTimeS'] ?? 90,
        timeoutS: inputs['timeoutS'] ?? 300,
        disturbance: Math.round(inputs['disturbance'] ?? DIST_NONE),
      };
      assertWithin('pressureMTorr', a.p, ADV_P_RANGE, 'mTorr');
      assertWithin('sourceW', a.sourceW, ADV_PS_RANGE, 'W');
      assertWithin('biasW', a.biasW, ADV_PB_RANGE, 'W');
      assertWithin('flowSccm', a.flowSccm, ADV_Q_RANGE, 'sccm');
      assertWithin('overetchPct', a.overetchPct, ADV_OE_RANGE, '%');
      assertWithin('passivationPct', a.passivationPct, ADV_F_RANGE, '%');
      assertWithin('endpointMode', a.mode, ADV_MODE_RANGE, '');
      assertWithin('fixedTimeS', a.fixedTimeS, ADV_TFIX_RANGE, 's');
      assertWithin('timeoutS', a.timeoutS, ADV_TMAX_RANGE, 's');
      assertWithin('disturbance', a.disturbance, ADV_DISTURBANCE_RANGE, '');

      const m = advancedModel(a);
      const common = [SYNTHETIC_ASSUMPTION, FILM_ASSUMPTION, PRESSURE_NONMONOTONIC_NOTE,
        '레지스트 초기 두께 700 nm(심화)'];
      return {
        /* 🔴 기초·응용과 같은 식이되 **정의역이 다르다** — 아래 `validRange` 주석 참조.
         *    식 형태의 소재는 S257 §6.2 식 (6.1), 계수는 설계값. `sourceId` 는 붙이지 않는다. */
        anisotropy: quantity(m.anisotropy, {
          modelId: 'etch.lab.advanced.anisotropy', unit: '', basis: "교육용 합성 — 학습용 합성 측면·수직 식각률비에서 유도한 이방성도입니다. 식의 형태 A = 1 − R_lat/R_vert 는 S257 §6.2 식 (6.1) 을 따랐고(S256 슬라이드 5 와 교차확인), 계수와 정의역 하한은 설계값입니다.",
          validRange: [-1, 1],
          assumptions: [
            ...common,
            'A ≥ 0.940 은 측벽각 86.6° 에 해당한다. 드리프트는 R_vert·R_lat 를 함께 낮춰 A 를 바꾸지 않는다',
            '식의 소재: S257 §6.2 식 (6.1) — 이방성도를 1 − v_l/v_v 로 정의한다. S256 슬라이드 5 의 '
            + '1 − B/(2h_f) 와 B = 2·l 로 서로 검산된다',
            '🔴 **정의역 하한이 문헌과 다르다.** S256 슬라이드 5 는 0 ≤ A_f ≤ 1 로 적지만 여기 validRange 는 '
            + '[-1, 1] 이다. 이 단계는 R_lat 에만 공급 포화 g(Q) 가 곱해지지 않아 저유량·고압에서 '
            + 'R_lat > R_vert 가 실제로 나오고(실측 예: p=300 mTorr·P_s=200 W·P_b=0 W·Q=20 sccm·f=0 % → A ≈ −0.170), '
            + '그때 음수 A 를 0 으로 잘라 숨기지 않고 그대로 보여 준다. 🔴 이 음수 구간은 문헌이 뒷받침하지 않는 '
            + '합성 모델의 거동이다 — 「등방성보다 더 나쁜 상태」라는 학습용 신호로만 읽어야 한다',
            '🔴 계수는 전부 PLN 설계값이다. S256·S257 은 **정의식의 형태만** 뒷받침한다',
          ],
        }),
        underlayerLossNm: quantity(m.underlayerLossNm, {
          modelId: 'etch.lab.advanced.underlayerLossNm', unit: 'nm', basis: "교육용 합성 — 합성 하부막 선택비 S_UL 로 계산한 학습용 하부막 손실입니다.",
          validRange: [0, 550],
          assumptions: [
            ...common,
            'Δd_UL = (OE/100)·500/S_UL. S160 Table 2 의 Si:SiO₂ 실측 138·185 가 하부막 선택비의 크기 기준선이다',
            `하부막 SiO₂ 두께 ${UNDERLAYER_THICKNESS_NM} nm 이상 깎이면 펀치스루로 수율 0`,
          ],
        }),
        residueIndex: quantity(m.residueIndex, {
          modelId: 'etch.lab.advanced.residueIndex', unit: '', basis: "교육용 합성 — R_res = 100·exp(−OE/12)·(1+0.030·f) 는 학습용 잔사 지수입니다.",
          validRange: [0, 220],
          assumptions: [...common, 'R_res = 100·exp(−OE/12)·(1+0.030·f) — 오버에치는 잔류물을 지우고 하부막을 깎는다'],
        }),
        throughputWph: quantity(m.throughputWph, {
          modelId: 'etch.lab.advanced.throughputWph', unit: 'wafer/h', basis: "교육용 합성 — 이송·펌핑 오버헤드 45 s 를 가정한 학습용 처리량 지수입니다.",
          validRange: [0, 66],
          assumptions: [...common, `t_cycle = 실제 식각시간 + ${HANDLING_OVERHEAD_S} s(이송·펌핑·안정화)`],
        }),
        yieldPct: quantity(m.yieldPct, {
          modelId: 'etch.lab.advanced.yieldPct', unit: '%', basis: "교육용 합성 — 감점 가중(3.0/0.4/200/2.5)을 임의로 정한 학습용 수율 점수입니다.",
          validRange: [0, 100],
          assumptions: [
            ...common,
            'Y = 98 − 3.0·max(0,Δd_UL−5) − 0.4·max(0,R_res−15) − 200·max(0,0.94−A) − 2.5·N',
            '펀치스루(Δd_UL ≥ 10 nm) 또는 미식각(종점 전 정지)이면 Y = 0',
          ],
        }),
        etchRateNmPerMin: quantity(m.vertRate, {
          modelId: 'etch.lab.advanced.etchRate', unit: 'nm/min', basis: "교육용 합성 — 학습용 합성 수직 식각률입니다.",
          validRange: [0, 680],
          assumptions: [...common, 'g(Q) = 1.60·Q/(Q+60) 반응종 공급 포화. 드리프트 시 −18 %'],
        }),
        endpointTimeS: quantity(m.endpointTimeS, {
          modelId: 'etch.lab.advanced.endpointTimeS', unit: 's', basis: "교육용 합성 — 합성 식각률로 역산한 학습용 종점 시각입니다.",
          validRange: [0, 11000],
          assumptions: [...common, 't_EP = 500 nm / R_vert × 60. 드리프트가 이 값을 뒤로 민다'],
        }),
        totalEtchTimeS: quantity(m.totalEtchTimeS, {
          modelId: 'etch.lab.advanced.totalEtchTimeS', unit: 's', basis: "교육용 합성 — 합성 종점 시각에 오버에치를 곱한 학습용 식각 시간입니다.",
          validRange: [0, 19000],
          assumptions: [
            ...common,
            m.endpointFound
              ? '종점 검출 성공 — t_EP·(1+OE/100)'
              : '🔴 EP NOT FOUND — 타임아웃 t_max 까지 계속 식각한다',
          ],
        }),
        effectiveOveretchPct: quantity(m.effectiveOveretchPct, {
          modelId: 'etch.lab.advanced.effectiveOveretchPct', unit: '%', basis: "교육용 합성 — 합성 종점 시각 대비 실효 오버에치입니다.",
          validRange: [-100, 1250],
          assumptions: [...common, '설정 OE 가 아니라 **실제로 일어난** 오버에치다. 음수면 종점 전에 멈춘 것(미식각)이다'],
        }),
        cycleTimeS: quantity(m.cycleTimeS, {
          modelId: 'etch.lab.advanced.cycleTimeS', unit: 's', basis: "교육용 합성 — 오버헤드 45 s 를 가정한 학습용 사이클 시간입니다.",
          validRange: [0, 19000], assumptions: common,
        }),
        notchWidthNm: quantity(m.notchWidthNm, {
          modelId: 'etch.lab.advanced.notchWidthNm', unit: 'nm', basis: "교육용 합성 — 차징 노칭 발동 조건·폭 계수를 임의로 정한 학습용 지표입니다.",
          validRange: [0, 1220],
          assumptions: [
            ...common,
            'N = 0.10·(P_b−400)·(OE−30)/10, 단 P_b > 400 AND OE ≥ 35 일 때만(PLN 정정 2026-08-20: 등호 제거)',
            '절연 하부막에 쌓인 양전하가 이온 궤적을 바닥 모서리로 휘게 한다. 셀프바이어스 근거는 S167(등급 B)',
            '🔴 노치 홈 단면을 그릴 씬은 없다 — 수치로만 확인한다(DSN §4-2 공백 1)',
          ],
        }),
        selectivityUL: quantity(m.selectivityUL, {
          modelId: 'etch.lab.advanced.selectivityUL', unit: '', basis: "교육용 합성 — 학습용 합성 하부막 선택비입니다.",
          validRange: [0, 98],
          assumptions: [...common, 'S_UL = 20·(1+0.010(p−30))·300/(300+0.6·P_b)·(1+0.008·f)'],
        }),
        selectivityPR: quantity(m.selectivityPR, {
          modelId: 'etch.lab.advanced.selectivityPR', unit: '', basis: "교육용 합성 — S_PR 식의 계수가 전부 학습용 설계값입니다.",
          validRange: [0, 45],
          assumptions: [...common, '유량↑ → 체류시간↓ → 폴리머 전구체↓ → (100/Q)^0.20 만큼 선택비가 떨어진다'],
        }),
        resistRemainNm: quantity(m.resistRemainNm, {
          modelId: 'etch.lab.advanced.resistRemainNm', unit: 'nm', basis: "교육용 합성 — 합성 선택비로 계산한 학습용 레지스트 잔막입니다.",
          validRange: [-705, RESIST_INIT_ADV_NM], assumptions: common,
        }),
        endpointWavelengthNm: quantity(SIF_LINE.value, {
          modelId: 'etch.lab.advanced.endpointWavelengthNm', unit: 'nm', sourceId: SIF_LINE.sourceId,
          validRange: SIF_LINE.validRange,
          assumptions: [
            '폴리Si 식각 부산물 SiF 선(440.2 nm)을 종점 감시선으로 쓴다 — 물리층 etch/oes 호출',
            '🔴 파장은 「무엇을 보고 종료를 판정하는가」만 가르친다. 세기·기울기로 합격을 판정하지 않는다',
            ...SIF_LINE.assumptions,
          ],
        }),
      };
    },
    /* ══════════════════ 🔴 씬 없음 — 되붙이지 마라 (A11) ══════════════════
     *
     * **여기에는 `ionTrajectory` 가 붙어 있었다. 2026-08-21 에 뗐다.**
     *
     * 왜 뗐나 —
     *   `ionTrajectory` 는 **이온주입 전용 표현**이다. 그 씬의 본체는 「깊이–농도 가우시안
     *   분포 + 투영비정 R_p 선」이고, 그것은 이온이 고체 안에서 **멈춰 서서 농도 분포를
     *   만든다**는 물리를 그린 것이다. **식각에서 이온은 그렇게 멈추지 않는다** — 표면에
     *   도달해 반응·스퍼터하고 끝난다. 깊이–농도 곡선도 R_p 도 식각에는 존재하지 않는다.
     *   `energy` uniform 하나가 우연히 맞는다고 나머지 그림 전체가 거짓말을 하면
     *   학습자는 「식각 이온이 특정 깊이에 박힌다」를 배운다. 그게 A11 위반이다.
     *   근거 정본: `src/models/labs/spec.ts` §LabSceneBinding
     *   —「다른 공정 씬을 억지로 갖다 붙이지 않는다」.
     *
     *   photo·eds·wafer·packaging 15칸은 같은 이유로 「준비 중」을 정직하게 비워 뒀다.
     *   여기만 예외를 둘 근거가 없다. **처리를 같게 한다.**
     *   → `scene` 을 넣지 않으면 `LabRunner` 가 「내부 시각화 준비 중」을 표시한다.
     *
     * 전용 씬이 생기면 무엇을 붙이나 —
     *   필요한 것은 **트렌치 단면 프로파일 씬**이다. 이 단계가 가르치는 결함이 전부 「어디가
     *   어떻게 파였는가」이기 때문이다(피드백 ET-C10 의 감별 포인트 그대로):
     *     · 차징 노치 N  → 바닥 **안쪽 모서리**에만 파인 홈 (측벽 상·중단은 멀쩡 = 감별점)
     *     · 언더컷 U     → 마스크 **바로 아래**의 측면 잠식
     *     · ARDE/RIE lag → 좁은 패턴이 **전체적으로 얕음**
     *     · 마이크로로딩 → 패턴 **밀집도**에 따라 깊이가 다름
     *     · 하부막 손실 Δd_UL → 트렌치 **바닥 아래** SiO₂ 가 깎여 들어간 양(펀치스루)
     *   즉 필요한 uniform 은 depth · undercut · notch · sidewallAngle · underlayerLoss 다.
     *   `ionTrajectory` 의 energy·dose·tilt·scatter 와는 **하나도 겹치지 않는다.**
     *   DSN `12_시각화씬_공백보고.md` §4-2 공백 1 이 이 씬의 부재를 이미 기록해 뒀다.
     *
     * 🔴 **그때까지 이 단계의 프로파일 결함은 「수치로만」 확인한다.** 노치 폭 N ·
     *    언더컷 · Δd_UL 은 전부 출력 수치로 나온다. 대용 씬을 붙이지 마라.
     * ═══════════════════════════════════════════════════════════════════ */
    /* ── 차트 (W6-6 해소 · PLN `threads/parts/차트-P4-etch.md` §배선 제안) ──
     * PLN 판정은 **3개**였다: ①-a 오버에치 스윕 → Δd_UL · ①-b 오버에치 스윕 → R_res ·
     * ② OES/IEP 종점 곡선(판정선언 없는 **설명 도해**, J3).
     *
     * 🔴 **①-a·①-b 만 넣었다. ②는 넣지 못했다 — 사유를 숨기지 않고 여기 적는다.**
     *   ② 는 「발광 세기의 시간 곡선과 그 1차미분 최소점」을 그리라는 요구인데, 이 파일의 모델에는
     *   **발광 세기 I(t) 가 없다.** 있는 것은 종점 **시각** t_EP 하나(스칼라)뿐이다.
     *   곡선을 그리려면 강도 모델을 **새로 지어내야** 하고 그것은 A15 위반이다.
     *   → **씬/강도모델 별건으로 등재.** ② 없이도 W6-6 은 ①-a·①-b 로 해소되며,
     *     지어낸 곡선 위에 「설명 도해」를 얹는 것보다 안 만드는 쪽이 낫다.
     *
     * 🔴 두 패널은 **가로축(OE)을 공유한다.** `LabChartBinding` 은 세로축이 1개라
     *   단위가 다른 Δd_UL(nm) 과 R_res(지수) 를 한 그림에 못 겹친다 — 상충을 보이려면 이 방법뿐이다.
     */
    charts: etchAdvancedCharts(),
    scene: {
      sceneId: 'plasma',
      map: (i, out) => ({
        bias: clamp01(out['anisotropy'] ?? norm(i['biasW'] ?? 50, ADV_PB_RANGE)),
        pressure: norm(i['pressureMTorr'] ?? 30, ADV_P_RANGE),
        power: powerScene(i['sourceW'] ?? 1000),
        flow: norm(i['flowSccm'] ?? 100, ADV_Q_RANGE),
      }),
      note: '심화 조작값을 식각 플라즈마에 연결한다. P_b→시스 두께, p·P_s→전자밀도·발광, Q→샤워헤드 가스 유입 밀도로 표시한다. 이온주입용 ionTrajectory는 사용하지 않으며 오버에치·잔사·하부막 손실은 계산 차트에서 판정한다.',
    },
    feedback: [
      {
        id: 'ET-C1', tone: 'stop',
        ko: '하부막 펀치스루 — 손실이 하부막 두께 10 nm 를 넘었습니다. 수율 0 %. 오버에치율을 낮추거나 하부막 선택비를 올리세요(압력↑ · 바이어스↓ · 패시베이션↑).',
        en: 'Underlayer punch-through — the loss exceeds the 10 nm underlayer. Yield is 0 %. Lower the overetch, or raise underlayer selectivity (more pressure, less bias, more passivation).',
        when: (_i, o) => (o['underlayerLossNm'] ?? 0) >= UNDERLAYER_THICKNESS_NM,
      },
      {
        id: 'ET-C2', tone: 'stop',
        ko: '공정 한계선 초과 — 레지스트 소진. 바이어스↓ / 압력↑ / 패시베이션↑ 으로 선택비를 확보하세요.',
        en: 'Process limit exceeded — resist consumed. Regain selectivity with less bias, more pressure, or more passivation.',
        when: (_i, o) => (o['resistRemainNm'] ?? 1) <= 0,
      },
      {
        id: 'ET-C3', tone: 'stop',
        ko: 'EP NOT FOUND — 개구율이 낮아 발광 신호의 S/N 이 부족합니다. 장비가 타임아웃까지 계속 식각해 하부막을 뚫습니다. 종점 모드를 간섭계(1)로 바꾸거나 타임아웃을 예상 종점의 1.25배 근처로 낮추세요.',
        en: 'EP NOT FOUND — the open area is too small for a usable optical signal. The tool keeps etching to timeout and punches through. Switch the endpoint mode to interferometry (1), or lower the timeout to roughly 1.25× the expected endpoint.',
        when: (i) =>
          Math.round(i['endpointMode'] ?? MODE_OES) === MODE_OES
          && Math.round(i['disturbance'] ?? DIST_NONE) === DIST_LOW_OPEN_AREA,
      },
      {
        id: 'ET-C4', tone: 'stop',
        ko: '미식각 — 종점 전에 식각을 멈췄습니다. 폴리Si 잔막이 남아 콘택트가 열리지 않습니다. 수율 0 %. 고정 시간을 종점 시각 위로 올리거나 종점 자동 검출로 바꾸세요.',
        en: 'Under-etched — the etch stopped before the endpoint, leaving poly-Si residue so the contact never opens. Yield is 0 %. Raise the fixed time above the endpoint time, or switch to automatic endpoint detection.',
        when: (_i, o) => (o['effectiveOveretchPct'] ?? 0) < 0,
      },
      {
        id: 'ET-C5', tone: 'warn',
        ko: '차징 노칭 발생 — 절연 하부막 위 고바이어스·고오버에치 조합입니다. 바닥 모서리 안쪽에만 노치 홈이 파입니다(측벽 상·중단은 멀쩡한 것이 감별점). 바이어스와 오버에치를 함께 낮추세요.',
        en: 'Charging notch — high bias combined with high overetch over an insulating underlayer. A notch is carved only at the inner bottom corner while the upper sidewall stays intact, which is the diagnostic tell. Lower bias and overetch together.',
        when: (_i, o) => (o['notchWidthNm'] ?? 0) > 0,
      },
      {
        id: 'ET-C6', tone: 'stop',
        ko: '공정 한계선 초과 — 배기 용량 부족으로 목표 압력을 유지할 수 없습니다(스로틀 개도 100 %). 유량을 낮추거나 목표 압력을 올리세요.',
        en: 'Process limit exceeded — the pump cannot hold the target pressure at this flow (throttle fully open). Lower the flow or raise the target pressure.',
        when: (i) => (i['flowSccm'] ?? 100) >= 400 && (i['pressureMTorr'] ?? 30) <= 20,
      },
      {
        id: 'ET-C7', tone: 'stop',
        ko: '식각 정지(etch stop) — 패시베이션이 과다해 측벽뿐 아니라 바닥까지 폴리머가 덮였습니다. 패시베이션 가스비를 낮추거나 바이어스를 올리세요.',
        en: 'Etch stop — passivation is so heavy that polymer covers the trench bottom as well as the sidewall. Lower the passivation ratio or raise the bias.',
        when: (i) => (i['passivationPct'] ?? 10) >= 36,
      },
      {
        id: 'ET-C8', tone: 'warn',
        ko: '챔버 컨디션 드리프트 중 — 벽·라이너 폴리머 축적으로 식각률이 18 % 떨어져 종점 시각이 뒤로 밀렸습니다. 종점 자동 검출(OES/간섭계)이면 시간이 자동 연장되어 5개 지표가 유지됩니다. 고정 시간 모드라면 잔막이 남아 수율이 0 이 됩니다.',
        en: 'Chamber condition drift — polymer on the walls and liner has cut the etch rate by 18 % and pushed the endpoint later. Automatic endpoint detection extends the time and all five targets hold; in fixed-time mode residue is left and yield collapses to zero.',
        when: (i) => Math.round(i['disturbance'] ?? DIST_NONE) === DIST_DRIFT,
      },
      {
        id: 'ET-C9', tone: 'hint',
        ko: '5개 지표 중 4개가 합격입니다. 남은 하나는 오버에치·바이어스·패시베이션 중 하나를 한 칸 움직이면 잡히지만, 반드시 다른 지표가 반대로 움직입니다 — 두 인자를 짝으로 조정하세요.',
        en: 'Four of the five targets pass. One step of overetch, bias or passivation will close the last one, but it always moves another target the other way — adjust two parameters as a pair.',
        when: (_i, o) => advancedPassCount(o) === 4,
      },
      {
        id: 'ET-C10', tone: 'hint',
        ko: '감별 포인트 — 노칭은 바닥 코너 국부, ARDE/RIE lag 는 좁은 패턴 전체가 얕음, 마이크로 로딩은 패턴 밀집도에 따라 깊이가 달라짐, 언더컷은 마스크 바로 아래입니다. 어디가 파였는지로 원인을 가르세요.',
        en: 'Diagnostic tells — a notch is local to the bottom corner, ARDE/RIE lag makes narrow patterns uniformly shallower, micro-loading changes depth with pattern density, and an undercut sits right under the mask. Read where the damage is to name the cause.',
        when: (_i, o) => (o['yieldPct'] ?? 100) < PASS_YIELD_ADV_MIN,
      },
    ],
    tradeoffs: [
      {
        ko: '오버에치율↑(20→30 %) → 잔류물 R_res 32.49→14.12(−57 %)(좋음) / 하부막 손실 Δd_UL 3.24→4.86 nm(+50 %) · 사이클 시간 +9.2 s → 처리량↓(나쁨). Δd_UL = (OE/100)·d/S_UL 이 그대로 작동한다.',
        en: 'Raising overetch 20→30 % cuts the residue index 32.49→14.12 (−57 %) but costs underlayer loss 3.24→4.86 nm (+50 %) and 9.2 s of cycle time, lowering throughput.',
      },
      {
        ko: '바이어스↑(350→480 W) → 이방성도 0.9672→0.9765 · 식각률↑(좋음) / 하부막 선택비 30.85→26.76(−13 %) · 레지스트 선택비↓ · 오버에치 35 % 이상이면 차징 노칭 발생(나쁨). 바이어스는 이방성을 사고 선택비와 차징 안전을 판다.',
        en: 'Raising bias 350→480 W lifts anisotropy 0.9672→0.9765 and the etch rate, but underlayer selectivity falls 30.85→26.76 (−13 %), resist selectivity drops, and above 35 % overetch a charging notch appears. Bias buys anisotropy and sells selectivity and charging safety.',
      },
      {
        ko: '압력↑(30→150 mTorr) → 하부막 선택비 14.02→30.85(+120 %) · 레지스트 선택비↑ · 식각률↑(좋음) / 이방성도↓(측면 라디칼 식각↑)(나쁨). 응용 단계의 상충이 하부막 선택비로 확장된 것이다.',
        en: 'Raising pressure 30→150 mTorr more than doubles underlayer selectivity 14.02→30.85, improves resist selectivity and etch rate, but lowers anisotropy as lateral radical etching grows — the applied-stage trade-off extended to the underlayer.',
      },
      {
        ko: '패시베이션 가스비↑(10→24 %) → 이방성도 0.9574→0.9672 · 선택비 2종 상승(좋음) / 식각률 387.6→327.3 nm/min(−16 %, 처리량↓) · 잔류물 10.67→14.12(+32 %)(나쁨). 폴리머는 측벽을 지키지만 바닥에도 쌓인다.',
        en: 'Raising the passivation ratio 10→24 % lifts anisotropy 0.9574→0.9672 and both selectivities, but slows the etch 387.6→327.3 nm/min (−16 %, less throughput) and raises residue 10.67→14.12 (+32 %). Polymer protects the sidewall but also settles on the floor.',
      },
      {
        ko: '가스 유량↑(100→300 sccm) → 식각률 245.5→327.3 nm/min(×1.33, 처리량↑)(좋음) / 체류시간 0.94→0.31 s 로 줄어 폴리머 전구체가 덜 생기고 레지스트 선택비 11.03→8.85(−20 %)(나쁨). 많이 넣는다고 다 좋지 않다.',
        en: 'Raising the flow 100→300 sccm speeds the etch 245.5→327.3 nm/min (×1.33, more throughput), but residence time falls 0.94→0.31 s, fewer polymer precursors form, and resist selectivity drops 11.03→8.85 (−20 %). More gas is not simply better.',
      },
      {
        ko: '소스 파워↑(1000→1800 W) → 식각률↑ · 이방성도↑(좋음) / 레지스트 선택비 9.39→8.85(−6 %)(나쁨). 플럭스는 레지스트도 함께 깎는다.',
        en: 'Raising source power 1000→1800 W speeds the etch and improves anisotropy, but resist selectivity falls 9.39→8.85 (−6 %). More flux etches the resist too.',
      },
      {
        ko: '종점 검출 모드는 상충이 아니라 **보험**이다 — 정상 챔버에서는 세 모드가 같은 결과를 낸다. 챔버가 드리프트하면 고정 시간만 미식각으로 무너지고, 개구율이 낮으면 OES 만 종점을 놓쳐 하부막을 뚫는다. 간섭계는 두 외란 모두에 견딘다.',
        en: 'The endpoint mode is insurance rather than a trade-off — all three agree on a healthy chamber. Under drift only fixed time under-etches; at low open area only OES misses the endpoint and punches through. Interferometry survives both.',
      },
      {
        ko: PRESSURE_NONMONOTONIC_NOTE,
        en: 'Note: in a real chamber the pressure–etch-rate relation is not monotonic — it peaks and then falls again. This model approximates only the branch below that maximum (ledger M-13: the pressure–rate curve was not obtained).',
      },
    ],
  },
];

/* ══════════════════ 판정 보조 ══════════════════
 * 🔴 `evaluate()` 를 부르면 순환이 되므로 피드백용으로만 합격 개수를 센다.
 *    합격창 상수를 재사용하므로 창이 움직이면 여기도 함께 움직인다.
 */

function appliedPassCount(o: Readonly<Record<string, number>>): number {
  const d = o['depthNm'] ?? Number.NaN;
  const a = o['anisotropy'] ?? Number.NaN;
  const s = o['selectivityPR'] ?? Number.NaN;
  let n = 0;
  if (d >= PASS_DEPTH_APPLIED_MIN_NM && d <= PASS_DEPTH_APPLIED_MAX_NM) n++;
  if (a >= PASS_ANISO_APPLIED_MIN) n++;
  if (s >= PASS_SPR_APPLIED_MIN) n++;
  return n;
}

function advancedPassCount(o: Readonly<Record<string, number>>): number {
  let n = 0;
  if ((o['anisotropy'] ?? Number.NaN) >= PASS_ANISO_ADV_MIN) n++;
  if ((o['underlayerLossNm'] ?? Number.NaN) <= PASS_UL_LOSS_ADV_MAX_NM) n++;
  if ((o['residueIndex'] ?? Number.NaN) <= PASS_RESIDUE_ADV_MAX) n++;
  if ((o['throughputWph'] ?? Number.NaN) >= PASS_THROUGHPUT_ADV_MIN) n++;
  if ((o['yieldPct'] ?? Number.NaN) >= PASS_YIELD_ADV_MIN) n++;
  return n;
}
