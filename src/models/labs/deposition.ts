import type { LabChartBinding, LabSceneBinding, LabSpec } from './spec';
import {
  ALD_CYCLE_TIME_S, ALD_MEASURED_TEMPS_C, ALD_WINDOW_C, ALD_WINDOW_GPC_ANGSTROM, aldDepositionTimeS,
  aldThicknessAngstrom, aldThicknessNm, cyclesForThickness, gpcAt,
} from '../physics/deposition/ald';
import { dopantDiffusivity } from '../physics/deposition/diffusion';
import {
  annealedStraggle, implantTimeS, junctionDepthDeep, junctionDepthShallow,
  peakConcentration, totalIons, waferAreaCm2,
} from '../physics/deposition/implant';
import { quantity } from '../contract';
import { A_PER_MA, ANGSTROM_PER_NM, NM_PER_UM } from '../physics/units';
import { WAFER_DIAMETER_CM } from './fixed';

/**
 * P5 증착·이온주입 실습 명세 — PLN `03_실습3단계명세.md` §「P5 실습 3단계」 배선.
 *
 * 🔴 여기서 식을 새로 쓰지 않는다(A15). 전부 `physics/deposition/**` 호출이다.
 *    labs 층이 하는 일은 ①단위 환산 ②슬라이더 범위 ③합격창 ④피드백 조건뿐이다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **PLN 명세에서 뺀 것과 그 사유** — 전부 「구현할 물리가 없어서」다. 지어내지 않았다.
 *
 * 1. **틸트 각 θ · 채널링 가산 깊이 `120·f_ch`** — 뺐다.
 *    채널링 항은 PLN 이 「교육용 설정값」으로 명시한 합성 계수이고, `physics/deposition/**`
 *    어디에도 대응 구현이 없다. compute() 에서 새로 쓰면 A15 위반이다.
 *    씬 쪽도 막혀 있다 — DSN `12_시각화씬_공백보고.md` §4-4 가 `ionTrajectory.tilt` 매핑을
 *    **기각**했다(격자 단면 씬이 없으면 「왜 7°인가」를 못 보여준다).
 *
 * 2. **시트 저항 R_s = 1/(q·μ·η·Q)** — 뺐다. 이동도 μ·활성화율 η 가 둘 다 교육용 설정값이고
 *    물리층에 이 식이 없다. `metal/fourPointProbe.sheetResistance` 는 4탐침 **측정** 모델
 *    (R_s = CF·V/I)이라 도핑 활성화와 무관하다 — 이름이 같다고 갖다 쓰면 틀린 물리다.
 *
 * 3. **단차피복률 SC · 트렌치 바닥 두께 d_bot · 보이드·심 판정 · 수율 Y** — 뺐다.
 *    포화 필요 펄스 `t_sat = 0.05(1+AR²/25)`, 필요 퍼지 `0.4·AR`, 수율 감점표가 전부
 *    교육용 설정값이고 **물리층에 트렌치 형상 모델이 없다** — 뺀 사유는 이것이다.
 *    🔴 **씬 `stepCoverage` 는 「제작 중」이 아니다**(2026-08-22 실측 정정 · PLN §22-1-2).
 *       구현(`src/viz/gl/scenes/stepCoverage.ts`) · `SceneId` 등록 · Canvas2D 폴백 drawer 까지
 *       **전부 있다.** 안 붙은 사유는 미완성이 아니라 ①위 물리층 부재 ②SC·d_bot·보이드 수치가
 *       `03` §P5 배너로 **PLN 보류 중** ③씬의 반응 키가 `aspectRatio`·`directionality`·`pressure`
 *       로 **PVD 기하**인데 ALD 의 구동량은 포화 노출량 t_p 이고 그 슬라이더가 이 공정 어느 칸에도
 *       없다 — 셋이다. 🔴 **DEV 는 이 셋이 풀리기 전에 이 씬을 어느 칸에도 붙이지 마라**(A6·A15).
 *       「제작 중」이라고 적어 두면 다음 사람이 **씬만 만들면 되는 줄 안다.** 실제로 그렇게 읽혔다.
 *
 *    🔴 **2026-08-22 재조사 — V3(유령 씬) 1건은 그대로 둔다. 이유가 하나 더 늘었다.**
 *       씬이 읽는 4키 중 이 공정의 `compute()` 에 대응 출력이 있는 것은 **`deposited` 하나뿐**이다
 *       (막 두께 → 평탄면 막 두께). 나머지 셋 `aspectRatio`·`directionality`·`pressure` 는
 *       **트렌치 형상과 PVD 소스 각분포**이고 이 공정 어느 칸에도 입력·출력이 없다.
 *       셋을 씬 기본값(0.5 · 0.5 · 0.4)에 맡기고 붙이면 화면은 **종횡비 약 1.75 의 트렌치에
 *       cos^m(m≈2.7)의 넓은 소스**를 그린다 — 즉 **오버행과 바닥 결핍이 있는 PVD 그림**이다.
 *       그런데 이 칸의 공정은 ALD 이고, ALD 의 요점은 **자기제한 반응이라 단차피복이 거의 100 %**
 *       라는 것이다. 붙이는 순간 화면이 **ALD 를 스텝커버리지가 나쁜 공정으로 가르친다** —
 *       배선이 없는 것보다 나쁘다. 🔴 **V3 위반 1건이 남는 것이 거짓 배선보다 낫다.**
 *       (푸는 길: 트렌치 형상 물리층 + AR·직진성·압력 입력. 그 전에는 붙이지 마라.)
 *
 * 4. **처리량 WPH · 웨이퍼 최고 온도 T_w = 25 + 18·I** — 뺐다.
 *    배치 오버헤드(600 s·25 s/장)와 발열 계수 18 이 교육용 설정값이다.
 *    대신 **물리량인 「주입 시간 t」와 「증착 시간 t_dep」를 그대로 판정·표시**한다.
 *    (PLN 의 처리량 목표는 시간 축으로 옮겼다 — 아래 §합격창 참조.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **이온주입 R_p·ΔR_p 는 룩업하지 않는다 — 「문제가 제시하는 조건」으로 슬라이더에 올렸다.**
 *    PLN 명세의 에너지별 R_p/ΔR_p 표 12열 중 **100 keV 한 열만 실측**이고 나머지 11열은
 *    지어낸 값이다(PLN 스스로 2026-08-20 보류 배너로 선언). 물리층도 같은 판정을 내려
 *    `projectedRange()`·`rangeStraggle()` 을 **미조달 인터페이스로 던지게** 해 두었다.
 *    → **에너지 슬라이더를 없애고 R_p·ΔR_p 를 직접 조건으로 받는다.** 대학 강의자료가
 *      예외 없이 쓰는 방식이고(S180·S181 예제 전부), PLN 의 보류 사유가 그대로 해소된다.
 *    정착점 1건: **¹¹B⁺ 100 keV → Si, R_p = 296.8 nm · σ_p = 73.5 nm** (R154 · S181 Table 9.1).
 *    두 슬라이더 모두 이 점을 정확히 밟을 수 있게 스텝을 0.1 nm 로 잡았다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **합격창 — 옮긴 것과 그대로 둔 것**
 *
 * | 지표 | PLN 명세 | 이 구현 | 사유 |
 * |---|---|---|---|
 * | 막 두께 d (기초) | 23.0–25.0 nm | **그대로** | 도달 가능. GPC 1.1 Å/cyc 에서 N = 220 → 24.2 nm |
 * | 접합 깊이 x_j | 180–220 nm 🔴보류 | **그대로 채택** | 보류 사유(지어낸 R_p 표)가 조건 입력화로 해소됐다. 도달 가능 — 아래 §죽은 판정 |
 * | 주입 시간 t | (WPH ≥ 60) | **t ≤ 35 s 로 이설** | PLN 판정식 `3600/(t+25) ≥ 60` 의 t 조건과 **같은 선**이다. 오버헤드 25 s 가 설정값이라 WPH 를 화면에 내지 않고 물리량 t 로 판정한다 |
 * | 시트 저항 R_s | 380–520 Ω/sq | **삭제** | 위 2번 |
 * | SC · d_bot · 수율 (심화) | 6개 동시 | **삭제** | 위 3번 |
 * | 어닐 후 straggle σ′ | (없음) | **≤ 40 nm 신설** | 심화 판정 3개 이상을 채우면서 「어닐은 공짜가 아니다」를 물리로 가르치는 유일한 대체 지표. σ′ = √(ΔR_p² + 2Dt) 는 S180 문헌식이고 D 는 S188 실측 세트다 |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **죽은 판정 없음 확인** (전부 아래 `tests` 없이도 손으로 재현 가능한 값이다)
 *
 * - **기초 S5** — 기본값 N = 100 · T = 200 °C → GPC 1.1 Å/cyc → d = **11.0 nm ✗**.
 *   **N = 220 · T = 200 °C → d = 24.2 nm ✅**. 가동 범위는 0.9 nm(N=10·T=80) ~ 55.0 nm(N=500)
 *   로 합격창 23–25 nm 를 반드시 통과한다.
 * - **응용 S6** — 기본값 R_p = 100 · ΔR_p = 73.5 nm · Q = 1.0e14 · I = 1.0 mA
 *   → x_j = **307.7 nm ✗** · t = 11.3 s ✓ → **2개 중 1개 불합격**.
 *   **R_p = 100 · ΔR_p = 30.0 · Q = 2.5e14 · I = 1.0 mA → x_j = 202.2 nm ✅ · t = 28.3 s ✅**
 *   → **2개 동시 합격**.
 * - **심화 S7** — 기본값(N = 100 · T = 200 · R_p = 100 · ΔR_p = 73.5 · Q = 1.0e14 · I = 1.0 ·
 *   T_a = 1223 K · t_a = 10 s) → d = 11.0 ✗ · σ′ = 73.6 ✗ · x_j = 308 ✗ · t = 11.3 ✓
 *   → **4개 중 3개 불합격**.
 *   **N = 220 · T = 200 · R_p = 100 · ΔR_p = 30.0 · Q = 2.5e14 · I = 1.0 · T_a = 1223 K ·
 *   t_a = 10 s → d = 24.2 ✅ · σ′ = 30.3 ✅ · x_j = 203.1 ✅ · t = 28.3 ✅** → **4개 동시 합격**.
 * - 죽은 입력 0개: 모든 슬라이더가 최소 2개 출력에 서로 반대 방향으로 작용한다(각 단계 tradeoffs).
 *   단 하나의 예외가 **의도된 것**이다 — 기초의 기판 온도는 ALD 창(150–250 °C) 안에서
 *   **아무것도 바꾸지 않는다.** 그것이 자기제한 성장이고 이 공정의 핵심 상충(DEP-D1)이다.
 */

const PROCESS_ID = 'deposition';

/* ---------------- 고정 조건 (화면 배지·assumptions 로 노출) ---------------- */

/* 웨이퍼 지름 300 mm(= 30 cm)는 P7 EDS 와 공유하는 고정 조건이라 `./fixed` 가 정본이다. */

/** 기판 배경 농도 N_B. PLN 고정 조건(¹¹B⁺ 주입 대상 n형 기판). */
const SUBSTRATE_CM3 = 1e17;

/** ¹¹B⁺ 는 1가. S181 식 9.10 의 n. */
const CHARGE_STATE = 1;

/**
 * 스캔 면적 A [cm²] = πD²/4. **고정 조건 배지가 쓰는 값이고 `runImplant()` 가 계산에 쓰는 값과 같다** —
 * 두 자리가 갈라지지 않게 여기 한 번 계산해 둔다(`waferAreaCm2` 는 물리층 정본이다).
 * 🔴 PLN 명세는 `A = 700 cm²` 로 **반올림해** 적었다. 화면·계산 모두 이 값(706.86)이다 —
 *    명세 숫자를 배지에 올리면 학습자가 보는 조건과 실제 계산이 갈라진다.
 */
const SCAN_AREA_CM2 = waferAreaCm2(WAFER_DIAMETER_CM).value;

/** 도펀트 — 어닐 확산계수는 붕소 세트(S188)를 쓴다. */
const DOPANT = 'B' as const;

/* ---------------- 단위 환산 (SI 정의. 물리 계수가 아니다) ----------------
 * 🔴 `NM_PER_UM` · `A_PER_MA` · `ANGSTROM_PER_NM` 은 **여기서 선언하지 않는다** —
 *    `../physics/units.ts` 가 정본이고 위에서 import 한다(`check-constants` R1). */

const DOSE_UNIT_CM2 = 1e14; // 슬라이더 눈금 1 = 1×10¹⁴ cm⁻²

/**
 * R_p·ΔR_p 슬라이더 상한 [nm]. **`ionTrajectory` 씬 정규화의 분모이기도 하다** —
 * 슬라이더 선언과 씬 매핑이 같은 수를 두 자리에 손으로 적고 있었다(둘 다 `400`·`120`).
 * 한쪽만 옮기면 화면이 조용히 잘리거나 축이 남으므로 이름을 붙여 한 자리로 묶는다.
 * 🔴 물리 계수가 아니라 **이 실습이 다루기로 한 정의역**이다(문헌 관행대로 조건으로 받는 값).
 */
const RP_MAX_NM = 400;
const DELTA_RP_MAX_NM = 120;

/**
 * ΔR_p 슬라이더 하한 · 빔 전류 · 어닐 시간의 **정의역**.
 * 🔴 물리 계수가 아니다 — 슬라이더가 다루기로 한 구간이고, 아래 차트의 가로축이 **같은 구간**을
 *    쓸어야 해서 이름을 붙였다. 숫자를 두 자리(슬라이더 선언 · 차트 축)에 손으로 적으면
 *    한쪽만 옮겨졌을 때 「축 밖에서 판정하는 그림」이 된다(RP_MAX_NM 이 씬 매핑과 갈라질 뻔한 것과 같은 사고).
 */
const DELTA_RP_MIN_NM = 10;
const BEAM_CURRENT_MIN_MA = 0.1;
const BEAM_CURRENT_MAX_MA = 5.0;
const ANNEAL_TIME_MIN_S = 1;
const ANNEAL_TIME_MAX_S = 120;

/* ---------------- 합격창 ---------------- */

const THICKNESS_TARGET_NM = 24.0;
const THICKNESS_MIN_NM = 23.0;
const THICKNESS_MAX_NM = 25.0;

const JUNCTION_MIN_NM = 180;
const JUNCTION_MAX_NM = 220;

/** PLN `3600/(t+25) ≥ 60` 과 같은 선. 오버헤드가 설정값이라 t 로만 판정한다. */
const IMPLANT_TIME_MAX_S = 35;

/** 심화 신설 — 어닐 후 유효 straggle 상한. 접합 급준도(abruptness)를 지키는 선. */
const STRAGGLE_MAX_NM = 40;

/* ---------------- 도우미 (계산이 아니라 조회·환산이다) ---------------- */

/**
 * ALD 기판 온도 스냅.
 * S186 이 준 것은 **측정점 4개(80·100·150·250 °C)** 와 **창 평탄부(150–250 °C)** 뿐이다.
 * 창 안은 본문이 「~1.1 Å/cycle」로 명시했으므로 임의 온도를 그대로 넘겨도 보간이 아니다.
 * 창 아래는 표에 없는 온도를 만들지 않고 **최근접 측정점으로 스냅**한다(원장 규칙 1).
 */
function snapAldTempC(v: number): number {
  if (v >= ALD_WINDOW_C[0]) return v;
  const below = ALD_MEASURED_TEMPS_C.filter((t) => t < ALD_WINDOW_C[0]);
  let best = below[0] as number;
  for (const t of below) if (Math.abs(t - v) < Math.abs(best - v)) best = t;
  return best;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 🔴 **`aldCycle` 씬의 평탄 창** — 씬이 `ALD_TEMP_WINDOW` 로 export 하는 값과 **같아야 한다**.
 *
 * 계층 규칙상 `src/models` 는 `src/viz` 를 import 할 수 없다(check-layering). 그래서 정본을
 * 직접 참조하지 못하고 여기에 같은 값을 둔다. **갈라지면 조용히 낡으므로**
 * `tests/unit/ald-scene-mapping.test.ts` 가 양쪽을 import 해 일치를 단언한다.
 * 씬의 온도축 위 좌표(0~1)이며 **화면 배치값이지 물리 상수가 아니다.**
 */
export const ALD_SCENE_TEMP_WINDOW: readonly [number, number] = [0.3, 0.66];

/**
 * 기판 온도(°C) → `aldCycle` 씬의 **온도축 위 정규화 위치**.
 *
 * 🔴 씬의 `temperature` 는 **온도축 위치**이지 성장률이 아니다. 성장률은 `growth` 로 따로 간다.
 *    (2026-08-21 결함 ❌-1: 여기에 GPC/1.1 을 꽂아 두 단위계가 한 슬롯에 섞였고,
 *     창 밖 80 °C 가 화면의 초록 창 안에, 창 안 250 °C 가 빨간 이탈대에 섰다.)
 *
 * ALD 창(150–250 °C, S186)을 씬 평탄 창에 선형으로 얹는다:
 *   axis(T) = lo + (T − 150)/(250 − 150) × (hi − lo)
 * 검산 — 80 °C→0.048 · 100 °C→0.12 · 150 °C→0.30 · 200 °C→0.48 · 250 °C→0.66.
 * 80·100 °C 가 창 아래로 떨어지는 것은 **물리적으로 옳다** — 실제로 ALD 창 밖이다.
 */
export function aldTempToSceneAxis(tempC: number): number {
  const [tLo, tHi] = ALD_WINDOW_C;                 // 150 · 250 °C (S186)
  const [aLo, aHi] = ALD_SCENE_TEMP_WINDOW;        // 씬 평탄 창 (화면 배치값)
  return clamp01(aLo + ((tempC - tLo) / (tHi - tLo)) * (aHi - aLo));
}

/**
 * ALD 사이클 슬라이더 상한 = `aldCycle` 씬 **사이클 축의 만재 지점**.
 * 기초·심화 두 랩의 `max` 와 씬 축 정규화가 같은 값을 봐야 해서 이름을 붙였다.
 * 물리층 안전상한(10 000 사이클) 안이다.
 */
const ALD_CYCLES_MAX = 500;

/**
 * 사이클 수 → `aldCycle` 씬의 **사이클 축 위 정규화 위치** 0~1.
 *
 * 🔴 **형태를 여기서 정하지 않는다.** 물리층 `aldThicknessAngstrom`(자기제한 → t = GPC × N)의
 *    사이클 비를 그대로 옮긴다. 기준 온도를 ALD 창 평탄부로 잡아 GPC 가 약분되므로 결과는
 *    순수한 사이클 비이고, 성장률(GPC)은 `growth` 슬롯이 따로 나른다 — 두 축을 섞지 않는다.
 *
 * 🔴 **`(N − min)/(max − min)` 으로 쓰면 안 된다.** 절편이 생겨 화면이 「0 사이클에 이미 막이
 *    있다」고 가르친다. 2026-08-21 D-5b 실측이 정확히 그것이었다 — 10 사이클에 이미 1층,
 *    배가쌍 7쌍 중 2.000 은 1쌍뿐(1.333~2.500), 그리고 씬 쪽 층 반올림과 겹쳐
 *    **사이클을 올렸는데 막이 얇아지는 구간 4곳**(190→200 −10.00 % · 230→240 −8.33 % ·
 *    270→280 −7.14 % · 310→320 −6.25 %).
 */
function aldCyclesToSceneAxis(cycles: number): number {
  const refTempC = ALD_WINDOW_C[1];
  const full = aldThicknessAngstrom({ tempC: refTempC, cycles: ALD_CYCLES_MAX }).value;
  if (!(full > 0)) return 0;
  return clamp01(aldThicknessAngstrom({ tempC: refTempC, cycles: clampCycles(cycles) }).value / full);
}

/** 물리층 `assertWithin` 이 던지지 않게 슬라이더 정의역 안으로 접는다. 계산이 아니라 방어다. */
function clampCycles(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > ALD_CYCLES_MAX ? ALD_CYCLES_MAX : v;
}

/** 씬 `dose` 키는 「봉우리 높이」다(DSN §4-4). 높이의 물리량 N_p 를 로그 정규화한다. */
function peakToSceneDose(peakCm3: number): number {
  if (!(peakCm3 > 0)) return 0;
  return clamp01((Math.log10(peakCm3) - 17) / 4);
}

/**
 * 🔴 **`aldCycle` 씬 매핑 — 기초·심화 두 칸이 이 하나를 공유한다.** (PLN §22-1 D-P5-2)
 *
 * 왜 함수로 뽑았는가: 심화에 씬을 병치하면서 **같은 매핑을 두 벌 적을 뻔했다.** 두 벌이 되는
 * 순간 한쪽만 고쳐지고 갈라진다 — 2026-08-21 결함 ❌-1(온도축 슬롯과 성장률 슬롯 혼동)이
 * 바로 이 매핑에서 났고 **고치는 데 실측이 필요했다.** 그 매핑을 다시 손으로 옮겨 적지 않는다.
 * PLN 지정: 「새로 만들 매핑이 아니라 **검증된 매핑을 한 칸 더 쓰는 것**이다.」
 *
 * 🔴 이 함수가 읽는 출력은 `gpcAngstrom` **하나**다. 붙이는 칸은 그 출력을 반드시 가져야 한다
 *    (심화 칸에 `gpcAngstrom` 을 `display` 출력으로 추가한 이유다).
 * 🔴 `filmThicknessNm × 10 / cycles` 로 GPC 를 역산하지 마라. 값은 같아도(`t[Å] = GPC × N`)
 *    같은 양을 두 낱말로 부르게 된다 — 두 칸 모두 `gpcAt()` 이라는 **같은 물리 함수**를 부른다.
 */
const aldSceneMap: LabSceneBinding['map'] = (inputs, out) => ({
  // 사이클 축 위치. 🔴 원점을 지나는 순수 비다 — 절편을 만들면 D-5b 가 되돌아온다.
  cycles: aldCyclesToSceneAxis(
    (out['thicknessNm'] !== undefined && (out['gpcAngstrom'] ?? 0) > 0)
      ? out['thicknessNm'] * 10 / (out['gpcAngstrom'] as number)
      : (inputs['cycles'] ?? 100),
  ),
  // 4단계(전구체 A → 퍼지 → B → 퍼지)를 사이클 진행에 맞춰 한 바퀴 돌린다.
  // 🔴 이 값은 **사이클 내부의 시간축**이다. 씬은 이것을 두께에 더하지 않는다
  //    (더하던 것이 D-5b 의 톱니였다 — `aldCycle.model.ts` `cyclesShown` 주석 참조).
  phase: clamp01((((inputs['cycles'] ?? 100) / 10) % 4) / 4),
  // 자기제한: 사이클당 노출이 충분하다는 전제이므로 포화쪽에 둔다.
  saturation: 0.85,
  // 온도축 위의 위치. ALD 창 150–250 °C 가 씬 평탄 창에 정확히 얹힌다.
  temperature: aldTempToSceneAxis(inputs['tempC'] ?? 200),
  // 사이클당 성장(이상값 대비). 창 안 평탄값 1.1 Å 를 1.0 으로 본다(S186).
  growth: clamp01((out['gpcAngstrom'] ?? 0) / ALD_WINDOW_GPC_ANGSTROM),
});

/** `aldSceneMap` 의 근거 문구. 화면 「근거」에 그대로 노출된다 — 두 칸이 같은 문장을 쓴다. */
const ALD_SCENE_NOTE =
  'cycles=사이클 수 · phase=4단계 순환 · saturation=포화(자기제한 전제) · '
  + 'temperature=기판 온도의 축 위치(ALD 창 150–250 °C 가 막대의 초록 구간에 얹힌다) · '
  + 'growth=GPC/1.1 Å(계단 높이). 창 안에서 온도를 올려도 계단 높이가 그대로인 것이 ALD 의 요점이다.';

/* ---------------- 공통 계산 조각 ---------------- */

interface ImplantOut {
  peakCm3: number;
  junctionDeepNm: number;
  junctionShallowNm: number;
  effectiveStraggleNm: number;
  timeS: number;
  ions: number;
}

/**
 * 이온주입 한 묶음. 🔴 **여기에 식은 없다** — `physics/deposition/implant` 호출과 단위 환산뿐이다.
 * `annealDCm2PerS`·`annealTimeS` 가 0 이면 σ′ = ΔR_p 로 어닐 전 상태가 된다.
 */
function runImplant(args: {
  doseCm2: number; rpNm: number; deltaRpNm: number;
  beamCurrentA: number; annealDCm2PerS: number; annealTimeS: number;
}): ImplantOut {
  const rpUm = args.rpNm / NM_PER_UM;
  const straggleUm = annealedStraggle({
    deltaRpUm: args.deltaRpNm / NM_PER_UM,
    dCm2PerS: args.annealDCm2PerS,
    timeS: args.annealTimeS,
  }).value;
  const areaCm2 = waferAreaCm2(WAFER_DIAMETER_CM).value;
  const shared = {
    doseCm2: args.doseCm2, rpUm, deltaRpUm: straggleUm, substrateCm3: SUBSTRATE_CM3,
  };
  return {
    peakCm3: peakConcentration({ doseCm2: args.doseCm2, deltaRpUm: straggleUm }).value,
    junctionDeepNm: junctionDepthDeep(shared).value * NM_PER_UM,
    junctionShallowNm: junctionDepthShallow(shared).value * NM_PER_UM,
    effectiveStraggleNm: straggleUm * NM_PER_UM,
    timeS: implantTimeS({
      doseCm2: args.doseCm2, areaCm2,
      beamCurrentA: args.beamCurrentA, chargeState: CHARGE_STATE,
    }).value,
    ions: totalIons({ doseCm2: args.doseCm2, areaCm2 }).value,
  };
}

const IMPLANT_ASSUMPTIONS = [
  '¹¹B⁺ 1가 · 웨이퍼 ⌀300 mm · 기판 배경 농도 1×10¹⁷ cm⁻³',
  '🔴 R_p·ΔR_p 는 문제가 제시하는 조건이다 — 에너지→R_p 변환표를 쓰지 않는다(공개 표 미조달)',
];

/* ---------------- 차트 (판정 경로) ----------------
 * 🔴 차트는 「보조 그림」이 아니라 **판정 경로**다(`spec.ts` 차트 절 · PLN 427).
 *    이 파일은 2026-08-22 까지 차트가 **0개**였다 — 합격창(23–25 nm · 180–220 nm · 35 s · 40 nm)을
 *    숫자로만 내고 있었고, 학습자는 「지금 값이 창의 어느 쪽으로 얼마나 벗어났는지」를 볼 곳이 없었다.
 *
 * 🔴 **여기서 물리식을 새로 쓰지 않는다.** 아래 build() 는 전부 그 칸의 `compute()` 가 부르는
 *    **같은 물리 함수**를 가로축만 바꿔 다시 부른다(`aldThicknessNm` · `runImplant` ·
 *    `annealedStraggle` · `dopantDiffusivity`). 보간·근사·대체식은 하나도 없다.
 * 🔴 **기준선의 수를 다시 타이핑하지 않는다.** `refLines` 는 `pass` 창이 쓰는 상수 그 자체를 참조한다
 *    (THICKNESS_MIN_NM · THICKNESS_MAX_NM · JUNCTION_MIN_NM · JUNCTION_MAX_NM ·
 *     IMPLANT_TIME_MAX_S · STRAGGLE_MAX_NM). 한쪽만 옮기면 규격선이 조용히 거짓말을 한다.
 * 🔴 **가로축은 슬라이더 정의역과 같은 상수**를 쓴다 — 축이 슬라이더보다 좁으면 학습자가
 *    도달할 수 있는 영역에서 판정선이 사라진다.
 */

/** 가로축 표본 수. 40~60 구간(성능·해상도 절충). 51점 = 표본 50구간. */
const CHART_SAMPLES = 50;

/**
 * 가로축을 쓸며 y 를 **물리층에서 다시 받아** 점을 만든다.
 *
 * 🔴 `try/catch` 로 **버리는** 이유: 물리층은 정의역 밖에서 던진다(예: `junctionDepthDeep` 은
 *    N_p ≤ N_B 면 「접합이 존재하지 않는다」로 던진다). 없는 점을 0 이나 보간으로 메우면
 *    그림이 물리를 지어낸다 — **빼는 것이 옳다.** 비유한값도 같은 이유로 버린다.
 */
function sweptPoints(
  from: number, to: number, steps: number, yAt: (x: number) => number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    if (!Number.isFinite(x)) continue;
    let y: number;
    try { y = yAt(x); } catch { continue; }
    if (!Number.isFinite(y)) continue;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * **현재 동작점 십자선.** (x_lo → x_cur) 가로 + (y_cur → y_floor) 세로의 「ㄴ」 자 한 획이다.
 *
 * 🔴 왜 필요한가 — W6-7(2026-08-21 신설)이 세우는 위반 그대로다: 합격창을 그려 놓고 곡선이
 *    일반 곡선이면 **학습자는 자기 값이 창 안인지 그림에서 읽을 수 없다.** 그러면
 *    「판정은 이 차트에서 합니다」 배지가 화면이 뒷받침하지 못하는 주장이 된다.
 * 🔴 `y_floor` 는 **곡선이 실제로 가진 최솟값**이다 — 세로축을 넓히지 않으려고 지어낸 수가 아니다.
 * 🔴 점이 2개 미만이면 `LineChart` 가 `path` 로 그리므로 아무것도 보이지 않는다. 그래서 3점이다.
 */
function crosshairPoints(
  xLo: number, xCur: number, yCur: number, curve: ReadonlyArray<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (!Number.isFinite(xCur) || !Number.isFinite(yCur) || curve.length === 0) return [];
  let yFloor = curve[0]!.y;
  for (const p of curve) if (p.y < yFloor) yFloor = p.y;
  if (!Number.isFinite(yFloor)) return [];
  return [{ x: xLo, y: yCur }, { x: xCur, y: yCur }, { x: xCur, y: yFloor }];
}

/**
 * **막 두께 – ALD 사이클 수.** 기초·심화가 같은 함수를 쓴다(출력 id 만 다르다).
 * 🔴 `compute()` 와 **같은 `aldThicknessNm()`** 를 사이클만 바꿔 다시 부른다.
 *    온도는 `compute()` 와 같은 `snapAldTempC()` 로 스냅한다 — 표에 없는 온도를 만들지 않는다.
 */
function aldThicknessChart(args: { id: string; outputId: string }): LabChartBinding {
  return {
    id: args.id,
    kind: 'line',
    ko: '막 두께 – 사이클 수',
    en: 'Film thickness vs. ALD cycles',
    // 🔴 이 칸에서 두께 합격창(23–25 nm)을 그리는 유일한 화면이다.
    judgesOutputs: [args.outputId],
    xKo: 'ALD 사이클 수 N', xEn: 'ALD cycles', xUnit: '사이클',
    yKo: '막 두께 d', yEn: 'Film thickness', yUnit: 'nm',
    xDomain: [0, ALD_CYCLES_MAX],
    refLines: [
      { value: THICKNESS_MAX_NM, ko: `규격 상한 ${THICKNESS_MAX_NM} nm`, en: `Spec upper ${THICKNESS_MAX_NM} nm`, tone: 'spec' },
      { value: THICKNESS_MIN_NM, ko: `규격 하한 ${THICKNESS_MIN_NM} nm`, en: `Spec lower ${THICKNESS_MIN_NM} nm`, tone: 'spec' },
    ],
    captionKo: '자기제한 성장 — 원점을 지나는 직선이다',
    captionEn: 'Self-limiting growth — a straight line through the origin',
    note: '가로축을 사이클 수로 잡은 이유는 이 칸에서 두께를 바꾸는 것이 사이클 수뿐이기 때문이다. '
      + '곡선은 현재 기판 온도의 GPC 로 다시 계산한 것이라, 온도를 ALD 창(150–250 °C) 안에서 움직이면 '
      + '기울기가 **바뀌지 않고**, 창 아래로 내리면 기울기가 눕는다 — 그것이 이 실습의 요점이다. '
      + '원점을 지나는 것도 물리다(0 사이클 = 0 두께).',
    build: (inputs, outputs) => {
      const tempC = snapAldTempC(inputs['tempC'] ?? 200);
      // 🔴 물리층 호출 — compute() 와 같은 함수·같은 온도다.
      const curve = sweptPoints(0, ALD_CYCLES_MAX, CHART_SAMPLES,
        (cycles) => aldThicknessNm({ tempC, cycles }).value);
      const gpc = gpcAt(tempC).value;
      return [
        {
          id: 'growth',
          ko: `${tempC} °C 성장선 (GPC ${gpc.toFixed(1)} Å/사이클)`,
          en: `${tempC} °C growth line (GPC ${gpc.toFixed(1)} Å/cycle)`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 사이클 수·두께',
          en: 'Current cycles and thickness',
          points: crosshairPoints(0, clampCycles(inputs['cycles'] ?? 100), outputs[args.outputId] ?? Number.NaN, curve),
          dashed: true,
        },
      ];
    },
  };
}

/**
 * **접합 깊이 – ΔR_p.** 응용(S6) 칸의 x_j 판정 화면.
 * 🔴 `compute()` 와 **같은 `runImplant()`** 를 ΔR_p 만 바꿔 다시 부른다(어닐 없음 — 이 칸과 같다).
 */
function junctionStraggleChart(): LabChartBinding {
  return {
    id: 'deposition.junctionStraggle',
    kind: 'line',
    ko: '접합 깊이 – 종방향 straggle',
    en: 'Junction depth vs. range straggle',
    judgesOutputs: ['junctionDeepNm'],
    xKo: '종방향 straggle ΔR_p', xEn: 'Range straggle ΔR_p', xUnit: 'nm',
    yKo: '접합 깊이 x_j (깊은 쪽)', yEn: 'Junction depth (deep)', yUnit: 'nm',
    xDomain: [DELTA_RP_MIN_NM, DELTA_RP_MAX_NM],
    refLines: [
      { value: JUNCTION_MAX_NM, ko: `합격 상한 ${JUNCTION_MAX_NM} nm`, en: `Pass upper ${JUNCTION_MAX_NM} nm`, tone: 'spec' },
      { value: JUNCTION_MIN_NM, ko: `합격 하한 ${JUNCTION_MIN_NM} nm`, en: `Pass lower ${JUNCTION_MIN_NM} nm`, tone: 'spec' },
    ],
    captionKo: 'x_j = R_p + √2·ΔR_p·√ln(N_p/N_B)',
    captionEn: 'x_j = R_p + √2·ΔR_p·√ln(N_p/N_B)',
    note: '가로축을 ΔR_p 로 잡은 이유: R_p 는 x_j 를 1:1 로 평행이동시킬 뿐이지만, ΔR_p 는 '
      + '**폭을 넓히는 동시에 피크를 낮춰** 두 방향으로 x_j 를 움직인다 — 합격창을 벗어나는 실제 원인이 여기다. '
      + '곡선은 현재 R_p·도즈로 다시 계산하므로, 두 슬라이더를 움직이면 곡선 전체가 위아래로 이동한다.',
    build: (inputs, outputs) => {
      const doseCm2 = (inputs['doseE14'] ?? 1) * DOSE_UNIT_CM2;
      const rpNm = inputs['rpNm'] ?? 100;
      const beamCurrentA = (inputs['beamCurrentMA'] ?? 1) * A_PER_MA;
      // 🔴 물리층 호출 — compute() 와 같은 묶음이다. 어닐 없음(annealTimeS = 0) 도 같다.
      const curve = sweptPoints(DELTA_RP_MIN_NM, DELTA_RP_MAX_NM, CHART_SAMPLES, (deltaRpNm) =>
        runImplant({ doseCm2, rpNm, deltaRpNm, beamCurrentA, annealDCm2PerS: 0, annealTimeS: 0 }).junctionDeepNm);
      return [
        {
          id: 'junction',
          ko: `R_p ${rpNm.toFixed(1)} nm · Q ${(inputs['doseE14'] ?? 1).toFixed(1)}×10¹⁴ cm⁻² 에서의 x_j`,
          en: `x_j at R_p ${rpNm.toFixed(1)} nm and Q ${(inputs['doseE14'] ?? 1).toFixed(1)}×10¹⁴ cm⁻²`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 ΔR_p·접합 깊이',
          en: 'Current ΔR_p and junction depth',
          points: crosshairPoints(DELTA_RP_MIN_NM, inputs['deltaRpNm'] ?? 73.5, outputs['junctionDeepNm'] ?? Number.NaN, curve),
          dashed: true,
        },
      ];
    },
  };
}

/**
 * **주입 시간 – 빔 전류.** t = Q·q·A/(n·I) 의 반비례 곡선. 응용·심화가 같은 함수를 쓴다.
 * 🔴 `compute()` 와 **같은 `runImplant()`** 를 빔 전류만 바꿔 다시 부른다.
 */
function implantTimeCurrentChart(id: string): LabChartBinding {
  return {
    id,
    kind: 'line',
    ko: '주입 시간 – 빔 전류',
    en: 'Implant time vs. beam current',
    judgesOutputs: ['implantTimeS'],
    xKo: '빔 전류 I', xEn: 'Beam current', xUnit: 'mA',
    yKo: '주입 시간 t', yEn: 'Implant time', yUnit: 's',
    xDomain: [BEAM_CURRENT_MIN_MA, BEAM_CURRENT_MAX_MA],
    refLines: [
      { value: IMPLANT_TIME_MAX_S, ko: `합격 상한 ${IMPLANT_TIME_MAX_S} s`, en: `Pass limit ${IMPLANT_TIME_MAX_S} s`, tone: 'spec' },
    ],
    captionKo: 't = Q·q·A / (n·I) — 전류에 반비례한다',
    captionEn: 't = Q·q·A / (n·I) — inversely proportional to current',
    note: '가로축을 빔 전류로 잡은 이유: 주입 시간을 줄이는 유일한 손잡이가 전류이고, 도즈는 '
      + '깊이 판정과 묶여 있어 자유롭게 못 낮춘다. 곡선은 현재 도즈로 다시 계산하므로 도즈를 올리면 '
      + '곡선 전체가 위로 올라가 합격선(35 s)을 넘는 전류 구간이 넓어진다 — 「시간을 사는 것이지 프로파일을 사는 것이 아니다」.',
    build: (inputs, outputs) => {
      const doseCm2 = (inputs['doseE14'] ?? 1) * DOSE_UNIT_CM2;
      const rpNm = inputs['rpNm'] ?? 100;
      const deltaRpNm = inputs['deltaRpNm'] ?? 73.5;
      // 🔴 물리층 호출 — compute() 와 같은 묶음. 시간항은 어닐과 무관하므로 어닐 인자는 0 이다.
      const curve = sweptPoints(BEAM_CURRENT_MIN_MA, BEAM_CURRENT_MAX_MA, CHART_SAMPLES, (mA) =>
        runImplant({
          doseCm2, rpNm, deltaRpNm, beamCurrentA: mA * A_PER_MA,
          annealDCm2PerS: 0, annealTimeS: 0,
        }).timeS);
      return [
        {
          id: 'time',
          ko: `Q ${(inputs['doseE14'] ?? 1).toFixed(1)}×10¹⁴ cm⁻² 에서의 주입 시간`,
          en: `Implant time at Q ${(inputs['doseE14'] ?? 1).toFixed(1)}×10¹⁴ cm⁻²`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 빔 전류·주입 시간',
          en: 'Current beam current and implant time',
          points: crosshairPoints(BEAM_CURRENT_MIN_MA, inputs['beamCurrentMA'] ?? 1, outputs['implantTimeS'] ?? Number.NaN, curve),
          dashed: true,
        },
      ];
    },
  };
}

/**
 * **어닐 후 유효 straggle σ′ – 어닐 시간.** 심화(S7)의 σ′ 판정 화면.
 * 🔴 `compute()` 와 **같은 `dopantDiffusivity()` · `annealedStraggle()`** 를 시간만 바꿔 다시 부른다.
 */
function straggleAnnealChart(): LabChartBinding {
  return {
    id: 'deposition.straggleAnneal',
    kind: 'line',
    ko: '어닐 후 유효 straggle – 어닐 시간',
    en: 'Effective straggle after anneal vs. anneal time',
    judgesOutputs: ['straggleNm'],
    xKo: '활성화 어닐 시간 t_a', xEn: 'Activation anneal time', xUnit: 's',
    yKo: '어닐 후 유효 straggle σ′', yEn: 'Effective straggle', yUnit: 'nm',
    xDomain: [0, ANNEAL_TIME_MAX_S],
    refLines: [
      { value: STRAGGLE_MAX_NM, ko: `합격 상한 ${STRAGGLE_MAX_NM} nm`, en: `Pass limit ${STRAGGLE_MAX_NM} nm`, tone: 'spec' },
    ],
    captionKo: "σ′ = √(ΔR_p² + 2Dt) — t = 0 에서의 절편이 ΔR_p 다",
    captionEn: 'σ′ = √(ΔR_p² + 2Dt) — the intercept at t = 0 is ΔR_p',
    note: '가로축을 어닐 시간으로 잡은 이유: 이 칸에서 「어닐은 공짜가 아니다」를 보여 주는 축이 이것이다. '
      + 't = 0 의 절편이 곧 주입 직후 ΔR_p 이고, 거기서 위로 벌어지는 만큼이 열예산의 대가다. '
      + '곡선은 현재 어닐 온도의 확산계수 D(아레니우스)로 다시 계산하므로, 온도를 올리면 같은 시간에서 곡선이 급격히 솟는다.',
    build: (inputs, outputs) => {
      const deltaRpUm = (inputs['deltaRpNm'] ?? 73.5) / NM_PER_UM;
      // 🔴 물리층 호출 — compute() 와 같은 D 다(붕소 세트 S188).
      const dCm2PerS = dopantDiffusivity({ dopant: DOPANT, tempK: inputs['annealTempK'] ?? 1223 }).value;
      const curve = sweptPoints(0, ANNEAL_TIME_MAX_S, CHART_SAMPLES, (timeS) =>
        annealedStraggle({ deltaRpUm, dCm2PerS, timeS }).value * NM_PER_UM);
      return [
        {
          id: 'straggle',
          ko: `${(inputs['annealTempK'] ?? 1223).toFixed(0)} K 에서의 σ′`,
          en: `σ′ at ${(inputs['annealTempK'] ?? 1223).toFixed(0)} K`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 어닐 시간·σ′',
          en: 'Current anneal time and σ′',
          points: crosshairPoints(0, inputs['annealTimeS'] ?? 10, outputs['straggleNm'] ?? Number.NaN, curve),
          dashed: true,
        },
      ];
    },
  };
}

/**
 * **어닐 후 접합 깊이 – 어닐 시간.** 심화(S7)의 x_j 판정 화면. σ′ 차트와 **같은 가로축**이라
 * 두 그림을 나란히 읽으면 「σ′ 가 벌어진 만큼 x_j 가 깊어진다」가 그대로 보인다.
 * 🔴 `compute()` 와 **같은 `dopantDiffusivity()` + `runImplant()`** 를 어닐 시간만 바꿔 다시 부른다.
 */
function junctionAnnealChart(): LabChartBinding {
  return {
    id: 'deposition.junctionAnneal',
    kind: 'line',
    ko: '어닐 후 접합 깊이 – 어닐 시간',
    en: 'Junction depth after anneal vs. anneal time',
    judgesOutputs: ['junctionDeepNm'],
    xKo: '활성화 어닐 시간 t_a', xEn: 'Activation anneal time', xUnit: 's',
    yKo: '어닐 후 접합 깊이 x_j', yEn: 'Junction depth after anneal', yUnit: 'nm',
    xDomain: [0, ANNEAL_TIME_MAX_S],
    refLines: [
      { value: JUNCTION_MAX_NM, ko: `합격 상한 ${JUNCTION_MAX_NM} nm`, en: `Pass upper ${JUNCTION_MAX_NM} nm`, tone: 'spec' },
      { value: JUNCTION_MIN_NM, ko: `합격 하한 ${JUNCTION_MIN_NM} nm`, en: `Pass lower ${JUNCTION_MIN_NM} nm`, tone: 'spec' },
    ],
    captionKo: 'ΔR_p 자리에 σ′ 를 넣은 x_j — 어닐이 접합을 밀어낸다',
    captionEn: 'x_j with σ′ in place of ΔR_p — the anneal pushes the junction out',
    note: '가로축은 σ′ 차트와 같은 어닐 시간이다. 판정 두 개(σ′ ≤ 40 nm · x_j 180–220 nm)가 '
      + '**같은 손잡이로 반대 방향으로** 움직이는 것을 한 화면에서 읽게 하려고 축을 맞췄다. '
      + '🔴 곡선이 오른쪽에서 끊기면 그 시간에서는 피크 농도가 기판 배경 농도 이하로 내려가 **접합 자체가 없다**는 뜻이다 — '
      + '없는 점을 이어 붙이지 않는다.',
    build: (inputs, outputs) => {
      const doseCm2 = (inputs['doseE14'] ?? 1) * DOSE_UNIT_CM2;
      const rpNm = inputs['rpNm'] ?? 100;
      const deltaRpNm = inputs['deltaRpNm'] ?? 73.5;
      const beamCurrentA = (inputs['beamCurrentMA'] ?? 1) * A_PER_MA;
      // 🔴 물리층 호출 — compute() 와 같은 D·같은 묶음이다.
      const dCm2PerS = dopantDiffusivity({ dopant: DOPANT, tempK: inputs['annealTempK'] ?? 1223 }).value;
      const curve = sweptPoints(0, ANNEAL_TIME_MAX_S, CHART_SAMPLES, (annealTimeS) =>
        runImplant({
          doseCm2, rpNm, deltaRpNm, beamCurrentA,
          annealDCm2PerS: dCm2PerS, annealTimeS,
        }).junctionDeepNm);
      return [
        {
          id: 'junction',
          ko: `${(inputs['annealTempK'] ?? 1223).toFixed(0)} K 에서의 x_j`,
          en: `x_j at ${(inputs['annealTempK'] ?? 1223).toFixed(0)} K`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 어닐 시간·접합 깊이',
          en: 'Current anneal time and junction depth',
          points: crosshairPoints(0, inputs['annealTimeS'] ?? 10, outputs['junctionDeepNm'] ?? Number.NaN, curve),
          dashed: true,
        },
      ];
    },
  };
}

/* ---------------- 명세 ---------------- */

export const DEPOSITION_LABS: LabSpec[] = [
  /* ══════════════ 기초 (S5) — ALD 증착 ══════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P5-03',
    titleKo: 'ALD 사이클 수로 막 두께 맞추기 — 온도를 올려도 두께는 변하지 않는다',
    titleEn: 'Hit the target film thickness with ALD cycles — temperature will not help',
    params: [
      {
        id: 'cycles', ko: 'ALD 사이클 수', en: 'ALD cycles', unit: '사이클', unitEn: 'cycles',
        min: 10, max: ALD_CYCLES_MAX, step: 10, initial: 100, sourceId: 'S186',
        note: '자기제한 반응이므로 두께는 사이클 수에 선형이다. 상한 500 은 물리층 안전상한(10 000 사이클) 안이다.',
      },
      {
        id: 'tempC', ko: '기판 온도', en: 'Substrate temperature', unit: '°C',
        min: 80, max: 250, step: 10, initial: 200, sourceId: 'S186',
        note: 'S186 측정 구간 80–250 °C. 유효한 것은 측정점 80·100 °C 와 ALD 창 150–250 °C 뿐이라, 그 사이 값은 최근접 측정점으로 스냅한다 — 보간하지 않는다.',
      },
    ],
    /* 🔴 **고정 조건** — PLN 명세 §P5 기초(S5) 「고정 조건(조작 불가 · 화면에 배지로 상시 표시)」.
     *    명세가 선언한 것 중 **이 구현에 실체가 있는 것만** 옮긴다. 화면에 없는 모델의 조건을
     *    배지로 올리면 학습자가 그 모델을 화면에서 찾게 된다 — 배선 없는 씬을 붙이지 않는 것과 같은 이유다.
     *    · **배치 25장 · 배치 오버헤드 600 s** — 뺐다. 처리량 WPH 를 판정·표시에서 뺐으므로(머리 §4)
     *      이 두 값이 닿는 출력이 화면에 하나도 없다.
     */
    fixedConditions: [
      {
        /* 🔴 명세는 교육용 설정값으로 「t_p 0.20 + 퍼지 2.00 + 반응체 0.30 + 퍼지 2.50 = 1사이클 5.00 s」를
           적었다. 그런데 이 칸이 표시하는 `depositionTimeS` 는 **S186 실측 레시피**로 계산된다.
           명세의 5.00 s 를 배지에 올리면 바로 옆 출력 t_dep(= N × 83 s)과 대놓고 어긋난다.
           → 출처 있는 원장 값을 올리고 명세가 다르게 적었다는 사실을 여기서 밝힌다.
           (photo.ts 가 명세의 n = 1.44 대신 S140 의 1.436 을 올린 것과 같은 판단이다.) */
        id: 'aldCycleTimeS', ko: 'ALD 1사이클 소요시간', en: 'ALD cycle time',
        value: ALD_CYCLE_TIME_S.toFixed(2), unit: 's', sourceId: 'S186',
        note: 'S186 레시피 TMA 1 s / Ar 퍼지 40 s / H₂O 2 s / Ar 퍼지 40 s. PLN 명세는 교육용 설정값 5.00 s 로 적었으나, 화면의 증착 시간 t_dep 은 이 원장 값으로 계산한다.',
      },
      {
        id: 'substrateShape', ko: '기판 형상', en: 'Substrate geometry',
        value: '평판 · 종횡비 0 (flat, no trench)', valueEn: 'Flat · aspect ratio 0 (no trench)',
        basis: 'PLN 명세 고정 조건 — 기초 단계는 평탄면만 다룬다. 트렌치 단차피복(SC·바닥 두께)은 물리층에 형상 모델이 없어 구현하지 않았다(파일 머리 §3).',
      },
      {
        /* 🔴 이름 있는 상수가 없어 문자열 리터럴이다. 상수를 만들지 않은 이유: 이 값을 읽는
           계산이 하나도 없다 — S186 의 GPC·두께 모델은 압력을 입력으로 받지 않는다.
           쓰이지 않는 상수를 만들면 「어딘가 계산에 들어간다」고 읽힌다. */
        id: 'chamberPressureTorr', ko: '챔버 압력', en: 'Chamber pressure',
        value: '1.0', unit: 'Torr',
        basis: 'PLN 명세 고정 조건(교육용 설정값). 조작할 수 없는 조건으로만 표시한다 — S186 의 GPC·두께 모델은 압력을 입력으로 받지 않아 계산에 들어가지 않는다.',
      },
    ],
    outputs: [
      { id: 'thicknessNm', ko: '막 두께 d', en: 'Film thickness', role: 'judge',
        pass: { min: THICKNESS_MIN_NM, max: THICKNESS_MAX_NM }, digits: 2 },
      { id: 'gpcAngstrom', ko: '사이클당 성장 GPC', en: 'Growth per cycle', role: 'display', digits: 2 },
      { id: 'depositionTimeS', ko: '순수 증착 시간 t_dep', en: 'Deposition time', role: 'display', digits: 0 },
      { id: 'cyclesForTarget', ko: '목표 24.0 nm 에 필요한 사이클 수', en: 'Cycles needed for 24.0 nm', role: 'display', digits: 0 },
    ],
    compute(inputs) {
      const cycles = inputs['cycles'] ?? 100;
      const tempC = snapAldTempC(inputs['tempC'] ?? 200);

      const thickness = aldThicknessNm({ tempC, cycles });
      const gpc = gpcAt(tempC);
      const time = aldDepositionTimeS(cycles);
      const needed = cyclesForThickness({
        tempC, targetAngstrom: THICKNESS_TARGET_NM * ANGSTROM_PER_NM,
      });

      return {
        thicknessNm: thickness,
        gpcAngstrom: gpc,
        depositionTimeS: time,
        cyclesForTarget: needed,
      };
    },
    // 🔴 두께 합격창(23–25 nm)을 그리는 화면. 이 칸의 판정 경로다 — 종전에는 숫자만 있었다.
    charts: [aldThicknessChart({ id: 'deposition.thicknessCycles', outputId: 'thicknessNm' })],
    // 🔴 **씬 `aldCycle` 은 완성돼 있고 바로 아래가 그 배선이다**(E트랙 2026-08-20 완성).
    //    ↓ 다음 두 줄은 **2026-08-20 이전의 이력**이다. 현재 상태로 읽지 마라.
    //      · 「대응 씬 없음」 — DSN §4-4 가 ALD 사이클 성장에 대해 그렇게 적었던 시기의 기록.
    //      · `filmGrowth.thickness` 로 두께만 밀면 「사이클당 정확히 한 층」이라는 ALD 의 요점이
    //        사라지므로, 남의 씬을 갖다 붙이지 않고 전용 씬을 기다린 것이 옳은 판단이었다.
    //    키는 DSN 12번 §4-4 가 제안한 그대로다.
    // 🔴 2026-08-21 수정 — **온도축과 성장률은 다른 슬롯이다**(결함 ❌-1).
    //    이전 매핑은 `temperature` 에 GPC/1.1 을 꽂았다. 그런데 씬의 `temperature` 는
    //    「온도축 위의 위치」이고 평탄 창이 [0.30, 0.66] 이라, GPC 비 {0.818, 0.909, 1.000} 은
    //    **전부 창 상한 밖**이었다. 결과: ① 마커가 거꾸로 — 창 밖 80 °C 가 초록 창 안에,
    //    창 안 250 °C 가 빨간 「탈착·분해」 이탈대에 섰다. ② 성장률이 전 온도에서 0.04 로 붕괴해
    //    계단 그래프가 정상의 3.9 % 로 납작해졌다 — 이 랩의 유일한 학습 요점이 화면에서 사라졌다.
    //    → 온도는 `temperature`(온도축 위치)로, 성장률은 `growth` 로 **분리해서** 넘긴다.
    // 🔴 매핑 본문은 파일 스코프 `aldSceneMap` 에 있다 — **심화 칸이 같은 것을 쓴다**(PLN §22-1).
    scene: { sceneId: 'aldCycle', map: aldSceneMap, note: ALD_SCENE_NOTE },
    feedback: [
      {
        id: 'DEP-B1', tone: 'hint',
        ko: 'ALD 창(150–250 °C) 안에서는 온도를 올려도 GPC 가 1.1 Å/사이클로 그대로입니다. 자기제한 반응이라 그렇습니다 — 두께는 사이클 수로만 바뀝니다.',
        en: 'Inside the ALD window (150–250 °C) the GPC stays at 1.1 Å/cycle no matter how hot you go. That is self-limiting growth — only the cycle count changes thickness.',
        when: (i) => (i['tempC'] ?? 0) >= ALD_WINDOW_C[0],
      },
      {
        id: 'DEP-B2', tone: 'warn',
        ko: 'ALD 창 아래입니다. 흡착이 부족해 사이클당 성장이 낮고, 측정점(80·100 °C) 밖의 온도는 표에 없어 최근접 측정점으로 스냅됩니다.',
        en: 'Below the ALD window: adsorption is incomplete so the growth per cycle drops, and temperatures away from the measured points (80/100 °C) snap to the nearest one.',
        when: (i) => (i['tempC'] ?? 0) < ALD_WINDOW_C[0],
      },
      {
        id: 'DEP-B3', tone: 'hint',
        ko: '두께 = 사이클 수 × GPC 입니다. 화면의 「목표 24.0 nm 에 필요한 사이클 수」만큼 사이클을 올려 보세요.',
        en: 'Thickness = cycles × GPC. Raise the cycle count to the number shown as "cycles needed for 24.0 nm".',
        when: (_i, o) => (o['thicknessNm'] ?? 0) > 0 && (o['thicknessNm'] ?? 0) < THICKNESS_MIN_NM,
      },
      {
        id: 'DEP-B4', tone: 'stop',
        ko: '목표를 넘었습니다. 쌓은 막은 되돌릴 수 없습니다 — 사이클 수를 줄여 처음부터 다시 실행해야 합니다.',
        en: 'Target exceeded. Deposited film cannot be undone — lower the cycle count and run again from the start.',
        when: (_i, o) => (o['thicknessNm'] ?? 0) > THICKNESS_MAX_NM,
      },
      {
        id: 'DEP-B5', tone: 'warn',
        ko: '증착 시간이 4시간을 넘었습니다. S186 레시피는 퍼지가 사이클당 80 s 라 사이클 수가 그대로 장비 점유 시간이 됩니다 — 두께의 대가입니다.',
        en: 'Deposition now exceeds four hours. The S186 recipe purges for 80 s per cycle, so cycle count is tool time — that is the price of thickness.',
        when: (_i, o) => (o['depositionTimeS'] ?? 0) > 4 * 60 * 60,
      },
    ],
    tradeoffs: [
      {
        ko: '사이클 수↑ → 두께가 정확히 비례해 늘어난다(좋음) / 장비 점유 시간이 같은 비율로 늘어난다(나쁨). N = 100 → 220 이면 두께 11.0 → 24.2 nm, 시간 8 300 → 18 260 s.',
        en: 'More cycles give exactly proportional thickness (good) but cost the same proportion in tool time (bad): N = 100 → 220 raises 11.0 → 24.2 nm and 8,300 → 18,260 s.',
      },
      {
        ko: '🔴 기판 온도↑ → ALD 창(150–250 °C) 안에서는 「아무것도 얻지 못한다」. GPC 는 1.1 Å/사이클로 평탄하다. 「온도를 올리면 빨리 쌓인다」는 CVD 의 직관이고, ALD 에서는 틀렸다.',
        en: '🔴 Raising substrate temperature buys nothing inside the ALD window (150–250 °C): GPC stays flat at 1.1 Å/cycle. "Hotter grows faster" is CVD intuition and it is wrong for ALD.',
      },
      {
        ko: '기판 온도↓ (창 아래) → 열예산은 아낀다(좋음) / 흡착이 부족해 GPC 가 1.1 → 1.0 → 0.9 Å/사이클로 떨어져 같은 두께에 사이클을 더 써야 한다(나쁨).',
        en: 'Going below the window saves thermal budget (good) but incomplete adsorption drops GPC 1.1 → 1.0 → 0.9 Å/cycle, so the same thickness costs more cycles (bad).',
      },
    ],
  },

  /* ══════════════ 응용 (S6) — 이온주입 ══════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P5-04',
    titleKo: '도즈와 빔 전류로 접합 깊이와 주입 시간을 동시에 맞추기',
    titleEn: 'Hit junction depth and implant time together with dose and beam current',
    params: [
      {
        id: 'rpNm', ko: '투영비정 R_p (문제 조건)', en: 'Projected range R_p (given)', unit: 'nm',
        min: 50, max: RP_MAX_NM, step: 0.1, initial: 100, sourceId: 'S181',
        note: '🔴 에너지→R_p 변환표를 쓰지 않는다 — 자유 라이선스 공개 표가 없다. 문헌 관행대로 조건으로 받는다. 정착점 ¹¹B⁺ 100 keV → Si = 296.8 nm 를 정확히 밟을 수 있다.',
      },
      {
        id: 'deltaRpNm', ko: '종방향 straggle ΔR_p (문제 조건)', en: 'Range straggle ΔR_p (given)', unit: 'nm',
        min: DELTA_RP_MIN_NM, max: DELTA_RP_MAX_NM, step: 0.1, initial: 73.5, sourceId: 'S181',
        note: '같은 사유로 조건 입력이다. 정착점 ¹¹B⁺ 100 keV → Si = 73.5 nm.',
      },
      {
        id: 'doseE14', ko: '도즈 Q', en: 'Dose', unit: '×10¹⁴ cm⁻²',
        min: 0.1, max: 50, step: 0.1, initial: 1.0, sourceId: 'S181',
        note: 'S180·S181 예제가 다루는 10¹³–5×10¹⁵ cm⁻² 대역. 물리층에는 cm⁻² 로 넘긴다.',
      },
      {
        id: 'beamCurrentMA', ko: '빔 전류 I', en: 'Beam current', unit: 'mA',
        min: BEAM_CURRENT_MIN_MA, max: BEAM_CURRENT_MAX_MA, step: 0.1, initial: 1.0, sourceId: 'S181',
        note: 'R153 검산점(2.8 mA)을 포함하는 중전류 주입기 대역.',
      },
    ],
    /* 🔴 **고정 조건** — PLN 명세 §P5 응용(S6) 「고정 조건(배지 표시)」.
     *    🔴 **뺀 것과 사유** — 전부 「그 조건이 닿는 모델이 이 칸에 없어서」다. 지어내지 않았고, 감추지도 않는다.
     *    · **활성화 어닐 = 스파이크 1050 °C 고정(η = 0.90)** — 뺐다. 이 칸은 **어닐 전** 가우시안으로
     *      계산한다(`runImplant` 에 annealTimeS = 0). 어닐은 심화 칸의 슬라이더다. 배지로 올리면
     *      출력의 `assumptions`「어닐 전 가우시안 분포」와 정면으로 어긋난다.
     *    · **정공 이동도 μ = 60 cm²/V·s** — 뺐다. 시트 저항 R_s 를 구현하지 않았다(머리 §2).
     *    · **엔드스테이션 오버헤드 25 s/장** — 뺐다. 처리량 WPH 를 화면에 내지 않는다(머리 §4).
     *      (합격창 t ≤ 35 s 가 PLN 의 `3600/(t+25) ≥ 60` 과 같은 선이라는 사실은 상수 주석에 있다.)
     *    · **스크린 산화막 10 nm · 트위스트 각 27°** — 뺐다. 둘 다 채널링·정지능을 통해서만 의미를 갖는데
     *      이 구현은 **R_p·ΔR_p 를 문제 조건으로 직접 받고** 채널링 항을 구현하지 않았다(머리 §1).
     *      배지로 올리면 「이 조건이 R_p 에 반영돼 있다」고 읽힌다 — 반영돼 있지 않다.
     *    · **전하량 q = 1.602×10⁻¹⁹ C** — 뺐다. 실습 조건이 아니라 SI 정의 상수이고, 정본은 물리층
     *      `implant.ts` 의 비공개 상수(1.602176634×10⁻¹⁹ · S181)다. 명세의 반올림값을 여기 옮겨 적으면
     *      **정본이 두 벌**이 된다.
     */
    fixedConditions: [
      {
        id: 'ionSpecies', ko: '이온종', en: 'Ion species',
        value: `¹¹B⁺ (${CHARGE_STATE}가)`, sourceId: 'S181',
        note: '1가이므로 주입 시간 식의 전하수 n = 1 이다. 🔴 수가 아닌 조건이라 문자열이다.',
      },
      {
        id: 'scanAreaCm2', ko: `스캔 면적 A (웨이퍼 ⌀${WAFER_DIAMETER_CM} cm)`, en: 'Scanned area A (300 mm wafer)',
        value: SCAN_AREA_CM2.toFixed(2), unit: 'cm²',
        basis: 'PLN 명세 고정 조건 「웨이퍼 300 mm, 스캔 면적 A = 700 cm²」. 🔴 명세의 700 은 반올림값이고, 지름 정본(labs/fixed.ts `WAFER_DIAMETER_CM`)에서 πD²/4 로 나오는 706.86 cm² 를 화면·계산 모두에 쓴다. 주입 시간 t = Q·q·A/I 의 A 다.',
      },
      {
        /* 🔴 상수는 `SUBSTRATE_CM3`(= 1e17). 값 자체를 String() 으로 찍으면 '100000000000000000' 이라
           명세 표기와 다른 것이 화면에 선다 — 표기만 지수 문자열로 적는다(수는 위 상수가 정본이다). */
        id: 'substrateDopingCm3', ko: '기판 배경 농도 N_B', en: 'Substrate background doping N_B',
        value: '1×10¹⁷', unit: 'cm⁻³',
        basis: 'PLN 명세 고정 조건. 접합 깊이 x_j 는 가우시안이 이 농도와 만나는 깊이이므로, 이 값이 판정 출력을 직접 정한다.',
      },
    ],
    outputs: [
      { id: 'junctionDeepNm', ko: '접합 깊이 x_j (깊은 쪽)', en: 'Junction depth (deep)', role: 'judge',
        pass: { min: JUNCTION_MIN_NM, max: JUNCTION_MAX_NM }, digits: 1 },
      { id: 'implantTimeS', ko: '주입 시간 t', en: 'Implant time', role: 'judge',
        pass: { max: IMPLANT_TIME_MAX_S }, digits: 1 },
      { id: 'peakCm3', ko: '피크 농도 N_p', en: 'Peak concentration', role: 'display' },
      { id: 'junctionShallowNm', ko: '접합 깊이 x_j (얕은 쪽)', en: 'Junction depth (shallow)', role: 'display', digits: 1 },
      { id: 'totalIonsImplanted', ko: '총 주입 이온 수', en: 'Total ions implanted', role: 'display' },
    ],
    compute(inputs) {
      const doseCm2 = (inputs['doseE14'] ?? 1) * DOSE_UNIT_CM2;
      const r = runImplant({
        doseCm2,
        rpNm: inputs['rpNm'] ?? 100,
        deltaRpNm: inputs['deltaRpNm'] ?? 73.5,
        beamCurrentA: (inputs['beamCurrentMA'] ?? 1) * A_PER_MA,
        annealDCm2PerS: 0,
        annealTimeS: 0,
      });

      return {
        junctionDeepNm: quantity(r.junctionDeepNm, {
          modelId: 'deposition.lab.junctionDeepNm', unit: 'nm', sourceId: 'S180',
          validRange: [0, 2000], assumptions: [...IMPLANT_ASSUMPTIONS, '어닐 전 가우시안 분포'],
        }),
        implantTimeS: quantity(r.timeS, {
          modelId: 'deposition.lab.implantTimeS', unit: 's', sourceId: 'S181',
          validRange: [0, 100 * 100 * 100], assumptions: IMPLANT_ASSUMPTIONS,
        }),
        peakCm3: quantity(r.peakCm3, {
          modelId: 'deposition.lab.peakCm3', unit: 'cm⁻³', sourceId: 'S181',
          validRange: [0, 1e23], assumptions: IMPLANT_ASSUMPTIONS,
        }),
        junctionShallowNm: quantity(r.junctionShallowNm, {
          modelId: 'deposition.lab.junctionShallowNm', unit: 'nm', sourceId: 'S180',
          validRange: [0, 2000],
          assumptions: ['🔴 버리는 근이 아니다. 음수면 도핑 영역이 표면까지 닿았다는 뜻이다'],
        }),
        totalIonsImplanted: quantity(r.ions, {
          modelId: 'deposition.lab.totalIons', unit: 'ions', sourceId: 'S181',
          validRange: [0, 1e25], assumptions: IMPLANT_ASSUMPTIONS,
        }),
      };
    },
    // 🔴 판정 2개(x_j 180–220 nm · t ≤ 35 s)가 서로 다른 손잡이로 움직이므로 화면도 2개다.
    //    한 축에 두 판정을 겹치면 어느 쪽이 무엇 때문에 벗어났는지 읽히지 않는다.
    charts: [junctionStraggleChart(), implantTimeCurrentChart('deposition.implantTimeCurrent')],
    scene: {
      sceneId: 'ionTrajectory',
      /* 🔴 **`scatter` 매핑 신설 (2026-08-22).** 종전 주석은 「`scatter` 는 질량분석 빔 갈라짐용이라
       *    무관하다」고 적혀 있었다 — **씬 구현을 읽으면 사실이 아니다.**
       *      · 씬 머리 주석(`scenes/ionTrajectory.ts`): 「scatter 산란 → 궤적의 좌우 흐트러짐과 **프로파일 폭**」
       *      · `scenes/models/ionTrajectory.model.ts` `ionSigma(energy, scatter)` — 깊이–농도
       *        가우시안의 폭 σ 를 `SIGMA_SCATTER`(0.10) 만큼 벌리는 **유일한** 파라미터다.
       *      · 같은 파일 `SCATTER_STRAGGLE_GAIN` 주석: 「산란이 **스트래글**을 얼마나 더 벌리는가」,
       *        `straggleLo/Hi` 주석: 「이온별 비정 산포(**스트래글**) 배율 범위」.
       *    즉 씬의 `scatter` 가 표현하는 물리량은 **주입 프로파일의 폭(= 종방향 straggle)** 이다.
       *    랩이 이미 가진 양과 같은 것을 가리키고 있었고, 이름이 달라 안 이어져 있었을 뿐이다.
       *
       * 🔴 이었어야 하는 이유 — **글과 그림이 반대였다.** `scatter` 가 씬 기본값 0.3 에 얼어 있어
       *    분포 폭을 바꾸는 조건을 끝에서 끝까지 밀어도 **프로파일 폭이 한 픽셀도 변하지 않았다.**
       *    (2026-08-21 CMP 씬 결함 ❌-2 「글과 그림이 반대」와 같은 종류다.)
       * 🔴 정규화 분모는 ΔR_p 슬라이더 상한 `DELTA_RP_MAX_NM` 이다 — `energy ← R_p/RP_MAX_NM` 과
       *    **같은 관례**(정의역 상한 대비 비율)이며 물리 계수를 새로 지어내지 않았다.
       * 🔴 `tilt` 는 여전히 매핑하지 않는다(격자 단면 씬 부재 — DSN §4-4 기각). */
      /* 🔴 이 칸은 어닐이 없으므로 σ′ = ΔR_p 다(`runImplant` 에 `annealTimeS: 0` 을 넘긴다).
       *    그래서 **출력이 아니라 조건 입력**에서 읽는다 — 이 칸의 `compute()` 가 내지 않는
       *    출력 이름(`straggleNm`)을 적지 않는다. */
      map: (i, o) => ({
        energy: clamp01((i['rpNm'] ?? 0) / RP_MAX_NM),
        dose: peakToSceneDose(o['peakCm3'] ?? 0),
        scatter: clamp01((i['deltaRpNm'] ?? 73.5) / DELTA_RP_MAX_NM),
      }),
      note: 'energy ← R_p/400 nm (봉우리 깊이) · dose ← 피크 농도 N_p 의 로그 정규화(DSN §4-4 가 dose 키를 「봉우리 높이」로 규정했고 그 물리량이 N_p 다) · scatter ← ΔR_p/120 nm (프로파일 폭). 씬의 scatter 는 깊이–농도 가우시안의 폭 σ 를 벌리는 파라미터이고(ionSigma), 이 칸은 어닐이 없어 σ′ = ΔR_p 이므로 ΔR_p 가 곧 그 폭이다. 🔴 tilt 는 매핑하지 않는다(채널링은 격자 단면 씬이 필요하다 — DSN 기각).',
    },
    feedback: [
      {
        id: 'DEP-A1', tone: 'hint',
        ko: '접합이 너무 깊습니다. R_p 를 줄이거나, ΔR_p 를 줄여 분포를 좁히세요 — 깊이의 두 번째 항이 √2·ΔR_p·√ln(N_p/N_B) 입니다.',
        en: 'The junction is too deep. Lower R_p, or narrow the distribution with a smaller ΔR_p — the second term of the depth is √2·ΔR_p·√ln(N_p/N_B).',
        when: (_i, o) => (o['junctionDeepNm'] ?? 0) > JUNCTION_MAX_NM,
      },
      {
        id: 'DEP-A2', tone: 'hint',
        ko: '접합이 너무 얕습니다. R_p 를 키우거나 도즈를 올리세요 — 도즈를 올리면 피크 농도가 올라가 배경 농도와 만나는 점이 깊어집니다.',
        en: 'The junction is too shallow. Raise R_p or the dose — a higher dose lifts the peak, so it meets the background concentration deeper in.',
        when: (_i, o) => (o['junctionDeepNm'] ?? 0) > 0 && (o['junctionDeepNm'] ?? 0) < JUNCTION_MIN_NM,
      },
      {
        id: 'DEP-A3', tone: 'warn',
        ko: '주입 시간이 35 s 를 넘었습니다. 처리량 목표에 걸립니다 — 빔 전류를 올리거나 도즈를 낮추세요. 도즈는 시간이 아니라 적산 전하로 결정됩니다.',
        en: 'Implant time now exceeds 35 s and misses the throughput target — raise the beam current or lower the dose. Dose is set by integrated charge, not by elapsed time.',
        when: (_i, o) => (o['implantTimeS'] ?? 0) > IMPLANT_TIME_MAX_S,
      },
      {
        id: 'DEP-A4', tone: 'warn',
        ko: '얕은 쪽 접합이 음수입니다. 도핑 영역이 표면까지 닿았다는 뜻입니다 — 접합이 하나 사라졌습니다. R_p 를 키우거나 ΔR_p 를 줄이세요.',
        en: 'The shallow junction is negative: the doped region reaches the surface, so one junction is gone. Increase R_p or reduce ΔR_p.',
        when: (_i, o) => (o['junctionShallowNm'] ?? 1) < 0,
      },
      {
        id: 'DEP-A5', tone: 'hint',
        ko: '같은 도즈라도 ΔR_p 가 크면 피크 농도가 낮아집니다 — 넓게 퍼진 같은 양은 봉우리가 낮습니다. 지금 ΔR_p 가 100 nm 를 넘었습니다.',
        en: 'For a fixed dose, a larger ΔR_p lowers the peak — the same amount spread wider has a lower crest. ΔR_p is now above 100 nm.',
        when: (i) => (i['deltaRpNm'] ?? 0) > 100,
      },
      {
        id: 'DEP-A6', tone: 'stop',
        ko: '도즈가 1×10¹⁵ cm⁻² 를 넘었습니다. 이 대역에서는 표층이 비정질화되어 고정 스파이크 어닐로는 완전 재결정이 어렵습니다 — 심화 단계에서 어닐을 직접 조작하게 됩니다.',
        en: 'Dose is above 1×10¹⁵ cm⁻². In this range the surface layer amorphises and a fixed spike anneal cannot fully recrystallise it — the advanced stage lets you drive the anneal yourself.',
        when: (i) => (i['doseE14'] ?? 0) * DOSE_UNIT_CM2 >= 1e15,
      },
    ],
    tradeoffs: [
      {
        ko: '도즈↑ → 피크 농도가 선형으로 오르고 접합이 깊어진다(원하는 방향) / 같은 빔 전류면 주입 시간이 그만큼 길어진다(나쁨). Q 1.0e14 → 2.5e14 (R_p 100 · ΔR_p 30 · I 1.0): x_j 193.8 → 202.2 nm, t 11.3 → 28.3 s.',
        en: 'More dose raises the peak linearly and deepens the junction (wanted) but stretches implant time at the same beam current: Q 1.0e14 → 2.5e14 (R_p 100, ΔR_p 30, I 1.0) moves x_j 193.8 → 202.2 nm and t 11.3 → 28.3 s.',
      },
      {
        ko: '빔 전류↑ → 주입 시간이 반비례로 줄어 처리량이 오른다(좋음) / 도즈·깊이는 하나도 바뀌지 않는다. 시간을 사는 것이지 프로파일을 사는 것이 아니다. I 1.0 → 2.0 mA (Q 2.5e14): t 28.3 → 14.2 s, x_j 202.2 nm 그대로.',
        en: 'More beam current shortens the implant inversely and lifts throughput (good) while dose and depth do not move at all — you buy time, not profile: I 1.0 → 2.0 mA at Q 2.5e14 gives t 28.3 → 14.2 s with x_j unchanged at 202.2 nm.',
      },
      {
        ko: 'ΔR_p↑ (분포가 넓어짐) → 접합은 깊어진다 / 피크 농도는 떨어진다. ΔR_p 30 → 73.5 nm (R_p 100 · Q 1.0e14): x_j 193.8 → 307.7 nm, N_p 1.33e19 → 5.43e18 (−59 %).',
        en: 'A wider ΔR_p deepens the junction but lowers the peak: ΔR_p 30 → 73.5 nm at R_p 100 and Q 1.0e14 moves x_j 193.8 → 307.7 nm while N_p falls 1.33e19 → 5.43e18 (−59 %).',
      },
      {
        ko: '기판 배경 농도가 높을수록 깊은 접합은 얕아지고 얕은 접합은 깊어진다 — 두 접합이 서로 다가온다. 이 실습에서는 1×10¹⁷ cm⁻³ 로 고정이지만, 두 x_j 를 나란히 표시해 그 구조를 보인다.',
        en: 'A higher background concentration pulls the deep junction shallower and the shallow one deeper — the two move toward each other. It is fixed at 1×10¹⁷ cm⁻³ here, but both x_j values are shown side by side so the structure is visible.',
      },
    ],
  },

  /* ══════════════ 심화 (S7) — 증착 + 이온주입 + 활성화 어닐 ══════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P5-05',
    titleKo: '절연막 증착 · 이온주입 · 활성화 어닐을 한 번에 — 어닐은 공짜가 아니다',
    titleEn: 'Film, implant and activation anneal at once — the anneal is never free',
    params: [
      {
        id: 'cycles', ko: 'ALD 사이클 수', en: 'ALD cycles', unit: '사이클', unitEn: 'cycles',
        min: 10, max: ALD_CYCLES_MAX, step: 10, initial: 100, sourceId: 'S186',
        note: '기초 단계와 같은 물리층·같은 범위.',
      },
      {
        id: 'tempC', ko: '기판 온도', en: 'Substrate temperature', unit: '°C',
        min: 80, max: 250, step: 10, initial: 200, sourceId: 'S186',
        note: 'ALD 창 150–250 °C. 창 아래는 측정점으로 스냅.',
      },
      {
        id: 'rpNm', ko: '투영비정 R_p (문제 조건)', en: 'Projected range R_p (given)', unit: 'nm',
        min: 50, max: RP_MAX_NM, step: 0.1, initial: 100, sourceId: 'S181',
        note: '🔴 에너지 변환표를 쓰지 않는다. 정착점 296.8 nm 를 정확히 밟을 수 있다.',
      },
      {
        id: 'deltaRpNm', ko: '종방향 straggle ΔR_p (문제 조건)', en: 'Range straggle ΔR_p (given)', unit: 'nm',
        min: DELTA_RP_MIN_NM, max: DELTA_RP_MAX_NM, step: 0.1, initial: 73.5, sourceId: 'S181',
        note: '어닐 전 값이다. 어닐을 걸면 σ′ = √(ΔR_p² + 2Dt) 로 넓어진다.',
      },
      {
        id: 'doseE14', ko: '도즈 Q', en: 'Dose', unit: '×10¹⁴ cm⁻²',
        min: 0.1, max: 50, step: 0.1, initial: 1.0, sourceId: 'S181',
      },
      {
        id: 'beamCurrentMA', ko: '빔 전류 I', en: 'Beam current', unit: 'mA',
        min: BEAM_CURRENT_MIN_MA, max: BEAM_CURRENT_MAX_MA, step: 0.1, initial: 1.0, sourceId: 'S181',
      },
      {
        id: 'annealTempK', ko: '활성화 어닐 온도', en: 'Activation anneal temperature', unit: 'K',
        min: 1173, max: 1373, step: 1, initial: 1223, sourceId: 'S188',
        note: '🔴 켈빈으로 받는다 — 섭씨↔켈빈 변환상수가 어느 원장에도 없어 물리층이 켈빈만 받는다. 대략 900–1100 °C 대역이다.',
      },
      {
        id: 'annealTimeS', ko: '활성화 어닐 시간', en: 'Activation anneal time', unit: 's',
        min: ANNEAL_TIME_MIN_S, max: ANNEAL_TIME_MAX_S, step: 1, initial: 10, sourceId: 'S180',
        note: '스파이크~단시간 RTA 대역. σ′ = √(ΔR_p² + 2Dt) 의 t 다.',
      },
    ],
    /* 🔴 **고정 조건** — PLN 명세 §P5 심화(S7) 「고정 조건」.
     *    🔴 **뺀 것과 사유**
     *    · **트렌치 W 50 nm / D 750 nm / AR 15** — 뺐다. 단차피복·보이드·심 판정을 구현하지 않았고
     *      (머리 §3) 물리층에 트렌치 형상 모델이 없다. AR 15 를 배지에 올리면 화면에 없는
     *      「종횡비 15 의 홀을 메우는 실습」을 약속하게 된다.
     *    · **반응체 펄스 = 1.5 × t_p** — 뺐다. 사이클 시간의 정본은 아래 `aldCycleTimeS`(S186 레시피)이고,
     *      명세의 펄스 배분(교육용 설정값)은 그 값을 만들지 않는다. 기초 칸과 같은 처리다.
     *    · **μ = 60 cm²/V·s** — 시트 저항 미구현(머리 §2). · **ALD 배치 25장 · ALD 오버헤드 600 s ·
     *      주입 오버헤드 25 s/장 · 어닐 60 s/장** — 전부 처리량 모델의 조건인데 처리량을 내지 않는다(머리 §4).
     *      🔴 특히 「어닐 60 s/장」은 **슬라이더 `annealTimeS` 와 다른 것**이다(장비 점유 오버헤드 ≠ 어닐 시간) —
     *      같은 이름으로 보인다고 슬라이더 값을 고정 조건으로 올리면 조작 가능한 값을 「고정」이라 가르친다.
     */
    fixedConditions: [
      {
        id: 'aldCycleTimeS', ko: 'ALD 1사이클 소요시간', en: 'ALD cycle time',
        value: ALD_CYCLE_TIME_S.toFixed(2), unit: 's', sourceId: 'S186',
        note: '기초 칸과 같은 S186 레시피(TMA 1 s / Ar 40 s / H₂O 2 s / Ar 40 s). 화면의 「ALD 증착 시간」과 「3공정 합계 시간」이 이 값으로 계산된다.',
      },
      {
        id: 'ionSpecies', ko: '이온종', en: 'Ion species',
        value: `¹¹B⁺ (${CHARGE_STATE}가)`, sourceId: 'S181',
        note: '1가. 어닐 확산계수도 붕소 세트(S188)를 쓴다 — 이온종이 바뀌면 D 도 바뀐다.',
      },
      {
        id: 'scanAreaCm2', ko: `스캔 면적 A (웨이퍼 ⌀${WAFER_DIAMETER_CM} cm)`, en: 'Scanned area A (300 mm wafer)',
        value: SCAN_AREA_CM2.toFixed(2), unit: 'cm²',
        basis: 'PLN 명세 고정 조건 「A = 700 cm²」. 🔴 명세의 700 은 반올림값이고 계산·표시 모두 지름 정본에서 나오는 706.86 cm² 를 쓴다(응용 칸과 같은 값).',
      },
      {
        id: 'substrateDopingCm3', ko: '기판 배경 농도 N_B', en: 'Substrate background doping N_B',
        value: '1×10¹⁷', unit: 'cm⁻³',
        basis: 'PLN 명세 고정 조건. 어닐 후 접합 깊이 판정이 이 농도와의 교점이다. (수의 정본은 `SUBSTRATE_CM3` 이며 여기는 표기다.)',
      },
    ],
    outputs: [
      { id: 'filmThicknessNm', ko: '절연막 두께 d', en: 'Dielectric film thickness', role: 'judge',
        pass: { min: THICKNESS_MIN_NM, max: THICKNESS_MAX_NM }, digits: 2 },
      { id: 'junctionDeepNm', ko: '어닐 후 접합 깊이 x_j', en: 'Junction depth after anneal', role: 'judge',
        pass: { min: JUNCTION_MIN_NM, max: JUNCTION_MAX_NM }, digits: 1 },
      { id: 'straggleNm', ko: '어닐 후 유효 straggle σ′', en: 'Effective straggle after anneal', role: 'judge',
        pass: { max: STRAGGLE_MAX_NM }, digits: 1 },
      { id: 'implantTimeS', ko: '주입 시간 t', en: 'Implant time', role: 'judge',
        pass: { max: IMPLANT_TIME_MAX_S }, digits: 1 },
      { id: 'peakCm3', ko: '어닐 후 피크 농도 N_p', en: 'Peak concentration after anneal', role: 'display' },
      // 🔴 `aldCycle` 씬의 `growth`(계단 높이) 슬롯이 읽는 출력. 기초 칸과 **같은 물리 함수** `gpcAt()` 이다.
      //    씬을 붙이려고 만든 숫자가 아니라 이 칸이 원래 계산하던 값을 화면에 드러낸 것뿐이다.
      { id: 'gpcAngstrom', ko: '사이클당 성장 GPC', en: 'Growth per cycle', role: 'display', digits: 2 },
      { id: 'diffusivityCm2PerS', ko: '붕소 확산계수 D', en: 'Boron diffusivity', role: 'display' },
      { id: 'aldTimeS', ko: 'ALD 증착 시간', en: 'ALD deposition time', role: 'display', digits: 0 },
      { id: 'totalProcessTimeS', ko: '3공정 합계 시간', en: 'Total time of the three steps', role: 'display', digits: 0 },
    ],
    compute(inputs) {
      const cycles = inputs['cycles'] ?? 100;
      const tempC = snapAldTempC(inputs['tempC'] ?? 200);
      const annealTempK = inputs['annealTempK'] ?? 1223;
      const annealTimeS = inputs['annealTimeS'] ?? 10;

      const film = aldThicknessNm({ tempC, cycles });
      const aldTime = aldDepositionTimeS(cycles);
      const diffusivity = dopantDiffusivity({ dopant: DOPANT, tempK: annealTempK });

      const r = runImplant({
        doseCm2: (inputs['doseE14'] ?? 1) * DOSE_UNIT_CM2,
        rpNm: inputs['rpNm'] ?? 100,
        deltaRpNm: inputs['deltaRpNm'] ?? 73.5,
        beamCurrentA: (inputs['beamCurrentMA'] ?? 1) * A_PER_MA,
        annealDCm2PerS: diffusivity.value,
        annealTimeS,
      });

      return {
        filmThicknessNm: film,
        junctionDeepNm: quantity(r.junctionDeepNm, {
          modelId: 'deposition.lab.adv.junctionDeepNm', unit: 'nm', sourceId: 'S180',
          validRange: [0, 2000],
          assumptions: [...IMPLANT_ASSUMPTIONS, '어닐 후 — ΔR_p 자리에 σ′ = √(ΔR_p² + 2Dt) 를 넣은 값'],
        }),
        straggleNm: quantity(r.effectiveStraggleNm, {
          modelId: 'deposition.lab.adv.straggleNm', unit: 'nm', sourceId: 'S180',
          validRange: [0, 1000],
          assumptions: ['가우시안 ⊛ 가우시안 = 가우시안. 분산이 2Dt 만큼 더해진다'],
        }),
        implantTimeS: quantity(r.timeS, {
          modelId: 'deposition.lab.adv.implantTimeS', unit: 's', sourceId: 'S181',
          validRange: [0, 100 * 100 * 100], assumptions: IMPLANT_ASSUMPTIONS,
        }),
        peakCm3: quantity(r.peakCm3, {
          modelId: 'deposition.lab.adv.peakCm3', unit: 'cm⁻³', sourceId: 'S181',
          validRange: [0, 1e23], assumptions: IMPLANT_ASSUMPTIONS,
        }),
        // 🔴 기초 칸과 **같은 물리 함수**를 같은 인자로 부른다(PLN §22-1 D-P5-2).
        //    `filmThicknessNm × 10 / cycles` 로 역산하지 않는다 — 값이 같아도 같은 양을 두 낱말로 부르게 된다.
        gpcAngstrom: gpcAt(tempC),
        diffusivityCm2PerS: diffusivity,
        aldTimeS: aldTime,
        totalProcessTimeS: quantity(aldTime.value + r.timeS + annealTimeS, {
          modelId: 'deposition.lab.adv.totalTimeS', unit: 's', sourceId: 'S186',
          validRange: [0, 100 * 100 * 100 * 100],
          assumptions: [
            'ALD 증착(S186 레시피) + 주입 + 어닐의 단순 합.',
            '🔴 장비 오버헤드·배치 크기는 교육용 설정값이라 넣지 않았다 — 처리량(WPH)을 화면에 내지 않는 이유다.',
          ],
        }),
      };
    },
    /* 🔴 판정 4개 중 3개를 그림으로 낸다 — 두께(증착 축) · x_j 와 σ′(어닐 축).
     *    x_j 와 σ′ 를 **같은 가로축(어닐 시간)** 에 둔 것은 의도다: 한 손잡이가 두 판정을
     *    반대 방향으로 미는 것이 이 칸의 학습 요점이다.
     *    🔴 주입 시간 t 는 여기 차트를 붙이지 않았다 — 이 칸에서 t 를 움직이는 손잡이(도즈·빔 전류)와
     *       그 반비례 곡선은 응용 칸의 `deposition.implantTimeCurrent` 와 **완전히 같은 그림**이다.
     *       같은 그림을 한 벌 더 두면 갈라질 자리만 는다. 판정은 숫자 카드와 DEP-X4 피드백이 맡는다. */
    charts: [
      aldThicknessChart({ id: 'deposition.adv.thicknessCycles', outputId: 'filmThicknessNm' }),
      junctionAnnealChart(),
      straggleAnnealChart(),
    ],
    /* 🔴🔴 **씬 2개 병치** — 좌 `aldCycle`(증착 축) · 중앙 `ionTrajectory`(주입·어닐 축).
     *      PLN §22-1 확정(2026-08-22). **명세가 처음부터 3분할 화면을 지정했고**, 구현은 중앙
     *      하나만 있었다. 새 설계가 아니라 **빠져 있던 것을 복구**하는 것이다.
     *
     * 🔴 **종전 주석이 거짓이었다** — 「증착·트렌치 쪽 씬(`stepCoverage`·`aldCycle`)은 제작 중이라
     *    붙이지 않는다」. `aldCycle` 은 **같은 파일의 기초 칸에 이미 배선돼 있었다.** 「제작 중」이라
     *    적힌 탓에 「이 칸의 `cycles`·`tempC` 는 구조상 영원히 화면에 못 나온다」는 진단이 나왔고,
     *    그 진단으로 **칸을 쪼개자는 설계안까지 올라갔다.** 낡은 주석 한 줄이 만든 우회로다.
     *
     * 🔴 `stepCoverage` 는 여기 붙이지 않는다 — 사유는 이 파일 머리 주석 §3(물리층 트렌치 형상
     *    모델 부재 · PLN 수치 보류 · 반응 키가 PVD 기하). **「제작 중」이어서가 아니다.**
     *
     * 🔴 선언 방식: `scene` 은 **종전 그대로 두고** 왼쪽에 세울 씬만 `scenes` 에 적는다.
     *    `labSceneBindings()` 가 `scenes` → `scene` 순으로 이어 붙여 [aldCycle, ionTrajectory] 가 된다.
     *    이렇게 하면 `scene` 을 런타임·소스텍스트로 읽는 `scripts/**` 게이트 3종이 그대로 동작한다. */
    scenes: [
      // 매핑은 **기초 칸과 같은 `aldSceneMap`** 이다. 새로 쓰지 않았다(PLN D-P5-2 · ❌-1 재발 방지).
      { sceneId: 'aldCycle', map: aldSceneMap, note: ALD_SCENE_NOTE },
    ],
    scene: {
      sceneId: 'ionTrajectory',
      /* 🔴 **`scatter` 매핑 신설 (2026-08-22).** 종전 주석은 「`scatter` 는 질량분석 빔 갈라짐용이라
       *    무관하다」고 적혀 있었다 — **씬 구현을 읽으면 사실이 아니다.**
       *      · 씬 머리 주석(`scenes/ionTrajectory.ts`): 「scatter 산란 → 궤적의 좌우 흐트러짐과 **프로파일 폭**」
       *      · `scenes/models/ionTrajectory.model.ts` `ionSigma(energy, scatter)` — 깊이–농도
       *        가우시안의 폭 σ 를 `SIGMA_SCATTER`(0.10) 만큼 벌리는 **유일한** 파라미터다.
       *      · 같은 파일 `SCATTER_STRAGGLE_GAIN` 주석: 「산란이 **스트래글**을 얼마나 더 벌리는가」,
       *        `straggleLo/Hi` 주석: 「이온별 비정 산포(**스트래글**) 배율 범위」.
       *    즉 씬의 `scatter` 가 표현하는 물리량은 **주입 프로파일의 폭(= 종방향 straggle)** 이다.
       *    랩이 이미 가진 양과 같은 것을 가리키고 있었고, 이름이 달라 안 이어져 있었을 뿐이다.
       *
       * 🔴 이었어야 하는 이유 — **글과 그림이 반대였다.** `scatter` 가 씬 기본값 0.3 에 얼어 있어
       *    분포 폭을 바꾸는 조건을 끝에서 끝까지 밀어도 **프로파일 폭이 한 픽셀도 변하지 않았다.**
       *    (2026-08-21 CMP 씬 결함 ❌-2 「글과 그림이 반대」와 같은 종류다.)
       * 🔴 정규화 분모는 ΔR_p 슬라이더 상한 `DELTA_RP_MAX_NM` 이다 — `energy ← R_p/RP_MAX_NM` 과
       *    **같은 관례**(정의역 상한 대비 비율)이며 물리 계수를 새로 지어내지 않았다.
       * 🔴 `tilt` 는 여전히 매핑하지 않는다(격자 단면 씬 부재 — DSN §4-4 기각). */
      /* 🔴 이 칸은 어닐이 있으므로 폭의 정본이 **출력 `straggleNm`**(σ′ = √(ΔR_p² + 2Dt))이다.
       *    ΔR_p 조건 입력을 그대로 쓰면 **어닐이 화면에서 사라진다** — DEP-X1 과 상충표가 가르치는
       *    「활성화를 얻는 대가로 접합 급준도를 잃는다」가 그림에 남지 않는다. */
      map: (i, o) => ({
        energy: clamp01((i['rpNm'] ?? 0) / RP_MAX_NM),
        dose: peakToSceneDose(o['peakCm3'] ?? 0),
        scatter: clamp01((o['straggleNm'] ?? 0) / DELTA_RP_MAX_NM),
      }),
      note: 'energy ← R_p/400 nm · dose ← 어닐 후 피크 농도 N_p 의 로그 정규화(DSN §4-4) · scatter ← 어닐 후 유효 straggle σ′/120 nm (프로파일 폭). 어닐을 걸면 σ′ 가 커져 봉우리가 낮아지는 동시에 곡선이 옆으로 퍼진다 — 두 변화가 같은 화면에서 함께 보인다. 🔴 tilt 는 매핑하지 않는다(채널링은 격자 단면 씬이 필요하다 — DSN 기각). 🔴 트렌치 단면(`stepCoverage`)은 물리층에 트렌치 형상 모델이 없어 아직 배선하지 않았다 — 씬 자체는 완성돼 있다.',
    },
    feedback: [
      {
        id: 'DEP-X1', tone: 'warn',
        ko: '어닐 후 유효 straggle σ′ 가 40 nm 를 넘었습니다. 분포가 뭉개져 접합이 급준하지 않습니다 — 어닐 온도나 시간을 줄이세요. σ′ = √(ΔR_p² + 2Dt) 입니다.',
        en: 'Effective straggle σ′ now exceeds 40 nm: the profile has smeared and the junction is no longer abrupt. Lower the anneal temperature or time — σ′ = √(ΔR_p² + 2Dt).',
        when: (_i, o) => (o['straggleNm'] ?? 0) > STRAGGLE_MAX_NM,
      },
      {
        id: 'DEP-X2', tone: 'hint',
        ko: '접합이 깊습니다. 초과분이 어닐에서 온 것인지 확인하세요 — 어닐 시간을 1 s 로 내려 보면 σ′ 가 ΔR_p 로 돌아가고 그 차이가 곧 열예산의 대가입니다.',
        en: 'The junction is deep. Check how much of it came from the anneal — drop the anneal time to 1 s and σ′ returns to ΔR_p; that difference is the thermal-budget bill.',
        when: (_i, o) => (o['junctionDeepNm'] ?? 0) > JUNCTION_MAX_NM,
      },
      {
        id: 'DEP-X3', tone: 'hint',
        ko: '절연막 두께가 목표 구간 밖입니다. 두께는 사이클 수로만 바꾸세요 — 기판 온도는 ALD 창 안에서 두께를 바꾸지 않습니다.',
        en: 'The dielectric thickness is outside its target band. Change it with cycles only — substrate temperature does not move thickness while inside the ALD window',
        when: (_i, o) => {
          const d = o['filmThicknessNm'] ?? 0;
          return d < THICKNESS_MIN_NM || d > THICKNESS_MAX_NM;
        },
      },
      {
        id: 'DEP-X4', tone: 'warn',
        ko: '주입 시간이 35 s 를 넘었습니다. 다만 이 공정에서 시간을 지배하는 것은 주입이 아니라 ALD 입니다 — 병목이 아닌 곳을 최적화해도 합계는 거의 줄지 않습니다.',
        en: 'Implant time exceeds 35 s. Note that ALD, not the implant, dominates the total here — optimising something that is not the bottleneck barely moves the sum.',
        when: (_i, o) => (o['implantTimeS'] ?? 0) > IMPLANT_TIME_MAX_S,
      },
      {
        id: 'DEP-X5', tone: 'hint',
        ko: '어닐 온도를 올리면 확산계수가 아레니우스로 급증합니다. 지금 온도에서 100 K 만 올려도 D 가 한 자릿수 가까이 뜁니다 — 활성화를 얻는 대가로 접합 급준도를 잃습니다.',
        en: 'Raising the anneal temperature blows the diffusivity up in Arrhenius fashion — another 100 K multiplies D by nearly an order of magnitude. Activation is paid for with junction abruptness.',
        when: (i) => (i['annealTempK'] ?? 0) >= 1300,
      },
      {
        id: 'DEP-X6', tone: 'stop',
        ko: '증착 시간이 6시간을 넘었습니다. S186 레시피는 사이클당 퍼지가 80 s 라 사이클 수를 늘리는 대가가 통째로 장비 점유 시간입니다 — 목표 두께를 다시 확인하세요.',
        en: 'Deposition passed six hours. The S186 recipe purges 80 s per cycle, so every extra cycle is tool time — re-check the target thickness.',
        when: (_i, o) => (o['aldTimeS'] ?? 0) > 6 * 60 * 60,
      },
    ],
    tradeoffs: [
      {
        ko: '어닐 온도↑ → 도펀트 활성화·손상 회복이 좋아진다(원하는 방향) / σ′ 가 커져 접합이 깊어지고 피크 농도가 떨어진다(나쁨). T_a 1223 → 1373 K (ΔR_p 30 · t_a 10 s): σ′ 30.3 → 36.4 nm, x_j 203.1 → 221.9 nm(합격 상한 220 초과 — 어닐만 올려서는 통과하지 못한다).',
        en: 'A hotter anneal activates dopant and repairs damage (wanted) but widens σ′, deepening the junction and lowering the peak: T_a 1223 → 1373 K at ΔR_p 30 and 10 s moves σ′ 30.3 → 36.4 nm and x_j 203.1 → 221.9 nm — past the 220 nm limit, so a hotter anneal alone will not pass.',
      },
      {
        ko: '어닐 시간↑ → 같은 온도에서 활성화 시간을 번다 / 2Dt 가 시간에 비례해 커져 σ′ 가 넓어진다. T_a 1373 K 에서 t_a 10 → 120 s: σ′ 36.4 → 77.3 nm(합격 상한 40 초과) · x_j 221.9 → 341.0 nm.',
        en: 'A longer anneal buys activation time at the same temperature, but 2Dt grows linearly with it: at 1373 K, 10 → 120 s widens σ′ 36.4 → 77.3 nm — past the 40 nm limit — and pushes x_j 221.9 → 341.0 nm.',
      },
      {
        ko: '도즈↑ → 피크 농도·접합 깊이가 오른다 / 같은 빔 전류면 주입 시간이 비례해 늘어난다. 여기서는 ALD 가 병목이라 합계 시간은 거의 그대로다 — 「병목이 아닌 곳을 최적화해도 전체는 나아지지 않는다」.',
        en: 'More dose raises the peak and the depth but stretches implant time proportionally. ALD is the bottleneck here, so the total barely changes — optimising a non-bottleneck does not help the whole.',
      },
      {
        ko: 'ALD 사이클 수↑ → 절연막이 두꺼워진다 / 3공정 합계 시간이 사이클당 83 s 씩 그대로 늘어난다. N 100 → 220: 합계 8 321 → 18 298 s.',
        en: 'More ALD cycles thicken the dielectric but add 83 s each to the total: N 100 → 220 takes the sum from 8,321 to 18,298 s.',
      },
      {
        ko: '🔴 기판 온도는 ALD 창 안에서 두께를 바꾸지 않는다. 심화에서도 이 규칙은 그대로다 — 자기제한 반응은 조건이 아니라 성질이다.',
        en: '🔴 Substrate temperature still does not move thickness while inside the ALD window — self-limiting growth is a property, not a setting.',
      },
    ],
  },
];
