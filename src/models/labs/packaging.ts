import type { LabChartBinding, LabSceneBinding, LabSpec } from './spec';
import { quantity, type Quantity } from '../contract';
import { PACKAGING_PROCESS_ID } from '../physics/packaging/rules';
import {
  junctionTemperature,
  recommendedTestPowerW,
  MIN_RECOMMENDED_RISE_C,
  TYPICAL_RISE_MIN_C,
  TYPICAL_RISE_MAX_C,
  THETA_TABLE_RANGE,
} from '../physics/packaging/thermal';
import {
  MSL_HOURLY_LEVELS,
  floorLifeHours,
  standardSoakHours,
  acceleratedSoakApplicable,
  ACCELERATED_SOAK_TEMP_C,
  ACCELERATED_SOAK_RH_PCT,
  type MslLevel,
} from '../physics/packaging/msl';
import {
  classifyShearSpeed,
  shearSpeedClassIndex,
  guidanceFor,
  SHEAR_CONCERNS,
  ELAPSED_AFTER_REFLOW,
  LOW_SPEED_RANGE_MM_PER_S,
  HIGH_SPEED_THRESHOLD_MM_PER_S,
  NO_ACCEPTANCE_CRITERIA_NOTICE,
  type ShearConcern,
} from '../physics/packaging/solderBallShear';
import {
  dieShearRequirementKg,
  DIE_AREA_UNIT_IN2,
} from '../physics/packaging/bondStrength';
import {
  thermalResistanceMetricName,
  thermalResistanceMetricSourceId,
  isMovingAir,
  velocityIsDirectionIndependent,
  velocityMeasurementLocationValid,
  tunnelVelocityConformanceIndex,
  TUNNEL_VELOCITY_LIMIT_M_PER_S,
  DIRECTION_INDEPENDENT_ABOVE_M_PER_S,
  FLOW_QUALITY_LIMITS,
  REFERENCE_AIR_DENSITY_KG_PER_M3,
} from '../physics/packaging/windTunnel';

/**
 * P8 패키징 실습 3단계 — PLN `03_실습3단계명세.md` §P8 배선.
 *
 * 🔴 **A15 — 여기서 식을 새로 쓰지 않는다.** 전 출력이 `physics/packaging/**` 호출이다.
 * 🟢 **씬 3종 배선 완료(2026-08-22).** 종전에는 「씬 없음 — 대응 씬 0 %」였고 세 칸 모두 ③이 비어 있었다.
 *    DSN 세션6 §P 구현명세로 칸마다 전용 씬을 신설했다:
 *      basic `packageThermal` · applied `moistureSoak` · advanced `shearTest`.
 *    🔴 **다른 공정 씬을 갖다 붙이지 않았다** — 세 씬 모두 이 공정 전용 신설이다.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 PLN 명세에서 **뺀 판정과 그 사유** (원장 금지항목 · 물리층 미보유)
 * ──────────────────────────────────────────────────────────────────────────
 *  1. **흡습률 `M = M0·exp(−t_bake/6)` · 팝콘 임계 `M_crit = 0.11 wt%` 판정 — 뺐다.**
 *     **M-25.** J-STD-020F 에 wt% 판정 기준이 **없다.** 이 표준은 MSL 을
 *     **플로어 라이프 · 소킹 조건**으로만 규정한다(원장 R199).
 *     → 응용실습은 흡습률 대신 **플로어 라이프 잔여시간**으로 판정한다. 학습 의도
 *       (「개봉 후 방치하면 리플로우에서 깨진다」)는 그대로 살아 있고, 판정 기준만 표준의 것으로 바꿨다.
 *  2. **`Tj ≤ 105 °C` 판정 — 뺐다.** **M-26.** JESD51 계열은 θ 의 **측정 방법**만 규정하고
 *     최대 접합온도를 정하지 않는다. 105 °C 는 어느 표준에도 없다.
 *     → 기초실습은 T_J 를 **계산**만 하고, 판정은 표준이 실제로 규정한
 *       **접합온도 상승폭 ΔT**(§5.5 최소 20 °C · 통상 30~60 °C)로 한다.
 *  3. **솔더볼 전단 합격/불합격 판정 — 뺐다.** **M-27.** JESD22-B117B §1 이
 *     "test method only; acceptance criteria … are not defined" 라고 명시한다.
 *     → 심화실습은 **시험 조건(속도 구간·관심사 정합·리플로우 후 경과시간)** 만 판정하고
 *       전단력의 합·부는 판정하지 않는다. 반대로 **다이 전단은 MIL-STD-883 METHOD 2019.10 이
 *       요구치를 정하므로**(원장 R1~R3) 힘으로 판정한다. **이 대비가 심화의 학습 포인트다.**
 *  4. **SAC(무연) 솔더 수명 · 리드프레임 재질 선택 · EMC 필러 함량 의존 열전도율 — 넣지 않았다.**
 *     M-22 · M-30 · M-31. 계수가 원장에 없다.
 *  5. **PLN B-0 공통 계산 모델(θ_top·θ_bot 합성, 워피지 W, 코플래너리티 C, 비용지수 CI,
 *     수율 Y, 처리량 UPH, 패드 피치 p, 최소 층수 L_min) — 배선하지 않았다.**
 *     PLN 이 「전량 교육용 설정값」이라고 스스로 밝힌 합성 모델이고,
 *     `src/models/physics/packaging/**` 에 **구현이 없다.** 합성 계수는 스코어링층 전용인데
 *     (contract.ts `withSynthetic`) `src/models/scoring/` 은 **만들지 않기로 확정**됐다
 *     (09_물리층_구현규약.md §7-1 · 빈 디렉터리는 2026-08-20 제거). 따라서 이 판정은 유효하다 —
 *     합성 계수를 compute() 에서 직접 쓰지 않은 선택을 **되돌리지 마라.**
 *     compute() 안에서 직접 쓰면 **A15 위반**이므로 쓰지 않았다.
 *     → 그 결과 응용·심화의 「4지표 동시」·「7지표 중 5」 구조는 재현하지 못했다.
 *       판정 개수를 줄이는 대신 **남은 판정은 전부 문헌 근거가 있는 것**으로만 채웠다.
 *  6. 🔴 **`fixedConditions` (고정 조건 배지) — 세 칸 모두 넣지 않았다.** (2026-08-22)
 *     `LabSpec.fixedConditions` 는 「조작할 수 없지만 **결과를 정하는** 값」의 자리다. PLN 명세가
 *     P8 세 칸에 선언한 고정 조건은 **이 구현에서 결과를 정하는 것이 하나도 없다.** 항목별로:
 *       · 기초`유형 = BGA · A_d = 100 mm² · N = 256 · L = 6층` — 전부 위 5번의 **B-0 합성
 *         모델(θ_top·θ_bot 합성)의 입력**이다. 그 모델을 배선하지 않았고, 이 칸은 **θ 를 측정값으로
 *         입력받는다**(15~100 °C/W 슬라이더). 배지로 올리면 「지금 이 θ 는 저 다이·핀·층수에서 나온
 *         값」이라고 가르치게 되는데, 사실이 아니다.
 *       · 기초 `P = 3.0 W` — **슬라이더 `testPowerW` 그 자체다**(기본값이 상한 3.0 W). 조작 가능한
 *         값을 「고정」이라 적을 수 없다.
 *       · 기초·응용·심화 `Ta = 45 °C` — 🔴 이 구현은 `junctionTemperature({ tAmbientC: 0, … })` 로
 *         **주위온도를 0 으로 두어 우변이 곧 상승폭 ΔT** 가 되게 부른다(판정이 T_J 가 아니라 ΔT 이므로 —
 *         위 2번 M-26). 45 °C 를 배지에 올리면 화면의 ΔT 판정과 어긋난다.
 *       · 응용 `P = 8.0 W · t_bake = 0 h` — 응용 칸은 열·흡습 모델을 쓰지 않는다. 흡습률
 *         `M = M0·exp(−t_bake/6)` 는 위 1번(M-25)에서 뺐고, 판정은 J-STD-020F 의 플로어 라이프다.
 *       · 응용 `L = max(2, ceil(N/256)+1)` — **종속변수**다. 명세도 「자동 산출·표시」라 적었다.
 *       · 심화 `시나리오 지정 초기 흡습률 M0` — **수치가 명세에 없다.** 지어내지 않는다(A6).
 *     🔴 **되돌리려면 순서가 있다**: 먼저 B-0 합성 모델을 배선할 자리(스코어링층)를 정하고,
 *        그 다음에 그 모델의 입력을 배지로 올린다. 배지가 먼저 서면 없는 모델을 광고하게 된다.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 θJA → θJMA 라벨 전환 — 구현 방식 (2026-08-20 2차 · JESD51-6 입수 반영)
 * ──────────────────────────────────────────────────────────────────────────
 *  JESD51-2A §4 는 **"applies only to natural convection, θJA"** 다(원장 S247).
 *  강제 공랭의 소관 표준 **JESD51-6 이 원장 S255 로 등재**되면서(골든값 R203)
 *  「v > 0 이면 θJMA」가 **이름뿐 아니라 판정 근거까지 갖춘 사실**이 되었다.
 *
 *  🔴 **1차 구현의 0/1 이산 토글을 v 연속 슬라이더(0 ~ 10 m/s)로 올렸다.** 사유:
 *     ⓐ S255 §4.1 이 풍동 유속 상한을 **10 m/s 미만**으로 규정한다 — 크기에 판정선이 생겼다.
 *     ⓑ S255 는 **2 m/s 초과에서 소자 방향 의존성이 사라진다**고 적었다 — 크기에 물리 사실이 붙었다.
 *     ⓒ PLN 명세의 v = 0 ~ 3.0 m/s 는 규격 안(< 10)이다. 범위를 좁힐 이유가 없다.
 *
 *  🔴 **그러나 v 로부터 θ_JMA 를 계산하지는 않는다.**
 *     JESD51-6 은 θ_JMA 를 **측정 결과**로 정의할 뿐(식 (1)) 풍속→열저항 예측식을 인쇄하지 않았고,
 *     대류계수 합성식(`h = 10 + 12·v` 류)은 여전히 **두 원장 어디에도 없다**.
 *     → **θ 는 측정값으로 입력받고, v 는 「그 측정이 규격에 맞았는가」 판정에만 쓴다.**
 *       이것이 지어낸 값 없이 v 를 연속으로 쓸 수 있는 유일한 방식이다.
 *
 *  화면에서 라벨 전환이 나타나는 자리 4곳:
 *   ⓐ 열저항 출력의 **출처 배지가 v = 0 에서 S247, v > 0 에서 S255 로 바뀐다**
 *      (`thermalResistanceMetricSourceId`). 근거 표준이 바뀌는 것을 배지로 본다.
 *   ⓑ 출력 `metricIsThetaJMA` 가 0(θJA) ↔ 1(θJMA) 로 바뀐다 — 지표명이 화면의 수치가 된다.
 *   ⓒ 판정 `velocityWithinTunnelRange`(§4.1) · `velocityMeasurementValid`(§4.5.1)
 *      — 강제 공랭에서만 실효가 있는 **조문 기반 판정**이다.
 *   ⓓ **필수 캡션은 유지하되 근거를 S247 + S255 로 보강**했다(피드백 PKG-B1):
 *      「데이터시트의 θJA 를 강제 공랭에 그대로 쓰면 안 된다」.
 *
 *  🔴 **아직 안 되는 것:** 유동 품질 4항목(균일도 ±5 % · 스월 < 5 % · 난류도 < 2 % · 비정상성 < 5 %)은
 *     물리층 `windTunnel.flowQualityConformance()` 에 구현해 두었으나, 기초실습의 슬라이더를
 *     6개로 불리지 않기 위해 **상시 hint 피드백으로 기준만 고지**한다. 파라미터화는 별건.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔴 죽은 판정 없음 — 합격 조합을 적어 둔다 (회귀 시험 기준)
 * ──────────────────────────────────────────────────────────────────────────
 *  기초  기본값 θ = 100 · P = 3.0 · v = 10.0 m/s · 하류 측정
 *        → ΔT = 300 °C ✗ / 풍동유속 0 ✗ / 측정위치 0 ✗ (0/3) · 지표명 θJMA
 *        합격 예 ① θ = 30 °C/W · P = 1.00 W · v = 0 · (측정위치 무관) → ΔT = 30.0 ✓ (3/3) · 지표명 θJA
 *        합격 예 ② θ = 30 °C/W · P = 1.00 W · v = 2.50 m/s · 상류 측정 → (3/3) · 지표명 θJMA · 방향무관 1
 *        합격 예 ③ θ = 15 °C/W · P = 3.00 W · v = 9.75 m/s · 상류 측정 → ΔT = 45.0 ✓ (3/3)
 *  응용  기본값 MSL 5a · 노출 192 h · Ea 0.395 eV · 필러 있음 → 잔여 −168 h ✗ / 가속소킹 0 ✗ (0/2)
 *        합격 예 ① MSL 3(색인 0) · 노출 168 h · Ea 0.350 eV · 필러 있음 → 잔여 0 h ✓ · 가속소킹 1 ✓ (2/2)
 *        합격 예 ② MSL 4(색인 1) · 노출 72 h · Ea 0.440 eV · 필러 있음 → 잔여 0 h ✓ (2/2)
 *  심화  기본값 관심사 0 · 속도 5.0 mm/s · 경과 24 h · SnPb · 면적 100 · 인가 0.5 kg
 *        → 속도정합 0 ✗ / 경과시간 0 ✗ / 전단여유 −2.00 kg ✗ (0/3)
 *        합격 예 ① 관심사 0(솔더 벌크·저속) · 0.5 mm/s · 경과 2 h · SnPb · 면적 100 · 인가 2.5 kg
 *        → 정합 1 ✓ · 경과 1 ✓ · 여유 0.00 kg ✓ (3/3)
 *        합격 예 ② 관심사 1(패드 계면·고속) · 60.0 mm/s · 경과 24 h · 무연 · 면적 20 · 인가 1.0 kg
 *        → 정합 1 ✓ · 경과 1 ✓ · 여유 0.20 kg ✓ (3/3)
 */

/** 플래그형 판정 출력의 합격값. 🔴 숫자 리터럴로 두면 check-labs 의 파라미터 정규식이
 *  출력 객체를 파라미터로 오인한다 — 상수로 둔다(oxidation.ts 와 같은 이유). */
const FLAG_PASS = 1;
/** 여유(margin) 판정의 합격 하한 — 0 이상이면 요구치를 만족한다. */
const MARGIN_PASS_MIN = 0;

const FLAG_RANGE: [number, number] = [0, 1];
const NON_NEGATIVE: [number, number] = [0, Number.MAX_VALUE];

/* ── 🔴 「여유(margin)」 출력의 정의역 — 2026-08-21 편측 합격창 점검 ──────────────────
 *
 * 종전에는 두 여유 출력이 `UNBOUNDED = [-Number.MAX_VALUE, Number.MAX_VALUE]` 를 달고 있었다.
 * 그것은 「경계가 없다」가 아니라 **경계를 말하지 않은 것**이다. 두 출력의 합격창은
 * `pass: { min: 0 }` 편측이라 **위쪽이 열려 있고**, validRange 도 열려 있으면 물리적으로
 * 나올 수 없는 크기의 값이 나와도 아무도 못 잡는다.
 *
 * 여유는 차(差)이므로 **음수는 정당하다**(요구치 미달). 그러나 무한히 크거나 작을 수는 없다 —
 * 두 항이 모두 유한한 슬라이더 범위와 표준 표에서 오기 때문이다. 그래서 아래처럼 닫는다:
 *   여유 ∈ [ (인가·잔여 최소) − (요구치 최대),  (인가·잔여 최대) − (요구치 최소) ]
 * 🔴 숫자를 손으로 적지 않는다. 요구치 쪽은 **물리층 함수를 그대로 훑어서** 얻는다.
 */

/** 방습백 개봉 후 라인 노출시간의 슬라이더 상한 [h]. J-STD-020F Table 4 가 규정한 시간값
 *  (플로어 라이프 168·72·48·24 h · 표준 소킹 192·96·72·48 h)의 최대치. S248. */
const FLOOR_EXPOSURE_MAX_H = 192;

/** 다이 면적 슬라이더 [10⁻⁴ in²] — S43 FIGURE 2019-4 NOTES 의 구간 경계 5·64 를 모두 지나도록 잡은 창. */
const DIE_AREA_UNITS_MIN = 1;
const DIE_AREA_UNITS_MAX = 100;
const DIE_AREA_UNITS_STEP = 1;

/** 인가 다이 전단력 슬라이더 [kg]. S43 FIGURE 2019-4 NOTE 1 의 대면적 고정 요구치
 *  1.0X = 2.5 kg · 2.0X = 5 kg 이 상한을 준다. */
const APPLIED_DIE_SHEAR_MIN_KG = 0;
const APPLIED_DIE_SHEAR_MAX_KG = 5;

/** 이 실습이 판정에 쓰는 다이 전단 시험조건. */
const DIE_SHEAR_CONDITION = '1.0X' as const;

/* ═══════════════ 차트 축 · 스윕 (2026-08-22 · W6-6 해소) ═══════════════
 * 🔴 세로축 상한 = **합격 임계의 2배**. ΔT 는 도달 범위가 7.5 ~ 300 °C 라
 *    합격창 20~60 °C 가 축의 13.7 % 밖에 안 된다(PLN `threads/parts/차트-P8-packaging.md` §1-1).
 *    상한 60 의 2배로 잡으면 합격창이 세로의 1/3 을 차지한다.
 * 🔴 합격창 숫자 자체는 건드리지 않는다(D-041 · PLN 소관) — 임계에서 **파생**만 시킨다. */
const RISE_CHART_Y_MAX_FACTOR = 2;

/** 🔴 열저항 **슬라이더** 창 [°C/W]. `THETA_TABLE_RANGE` 와 혼동하지 마라 —
 *  그쪽은 판정 정의역이라 상한이 `Number.MAX_VALUE` 다(2026-08-22 실측: 그대로 스윕하면 무한 루프).
 *  경계 15·100 은 JESD51-2A §5.5 Table 2 의 밴드 경계이며 종전 슬라이더 선언과 **같은 숫자**다. */
const THETA_SLIDER_RANGE: [number, number] = [15, 100];
const THETA_SLIDER_STEP = 5;

/** 시험 가열전력 **슬라이더** 창 [W]. JESD51-2A Table 2 의 권장 전력 0.5·0.75·1·2·3 W 가 범위를 준다.
 *  🔴 `recommendedPowerW` 가 돌려주는 5단의 최대·최소와 같은 숫자다 — 씬의 전력축이 이 창을 쓴다. */
const TEST_POWER_SLIDER_RANGE: [number, number] = [0.5, 3];
/** 솔더볼 전단속도 **슬라이더** 창 [mm/s]. JESD22-B117B Condition A 하한 0.1 ~ 상한 100. */
const SHEAR_SPEED_SLIDER_RANGE: [number, number] = [0.1, 100];
/** `shearSpeedClass` 의 색인 상한(3 = 고속 B). 0 은 슬라이더 하한 때문에 도달 불가다. */
const SHEAR_SPEED_CLASS_MAX = 3;

/** 열저항 스윕 격자 [°C/W] — **슬라이더 격자 그대로**(15~100, step 5 → 18점). */
function thetaGrid(): number[] {
  const out: number[] = [];
  for (let t = THETA_SLIDER_RANGE[0]; t <= THETA_SLIDER_RANGE[1] + 1e-9; t += THETA_SLIDER_STEP) out.push(t);
  return out;
}

/** 다이 면적 스윕 격자 [10⁻⁴ in²] — **슬라이더 격자 그대로**(1~100, step 1).
 *  🔴 성기게 훑으면 a = 64 의 **불연속(2.56 → 2.50)** 이 사라진다. 그 불연속이 이 차트의 요점이다. */
function dieAreaGrid(): number[] {
  const out: number[] = [];
  for (let u = DIE_AREA_UNITS_MIN; u <= DIE_AREA_UNITS_MAX; u += DIE_AREA_UNITS_STEP) out.push(u);
  return out;
}

/** 시간축이 규정된 MSL 등급들의 플로어 라이프 최대치 [h].
 *  🔴 168 을 손으로 적지 않는다 — 물리층 표(S248)에서 최대를 뽑는다.
 *  지연 계산 + 메모: `quantity()` 는 등급 리졸버를 요구하므로 모듈 로드 시점에 부르지 않는다. */
let floorLifeMaxHCache: number | undefined;
function floorLifeMaxH(): number {
  if (floorLifeMaxHCache === undefined) {
    floorLifeMaxHCache = Math.max(...MSL_HOURLY_LEVELS.map((l) => floorLifeHours(l).value));
  }
  return floorLifeMaxHCache;
}

/** 다이 전단 요구치가 슬라이더 면적 창에서 취할 수 있는 [최소, 최대] [kg].
 *  🔴 요구치는 3구간 분기(소면적 절대 하한 · 비례 · 대면적 고정)라 최대가 **구간 경계**에서 생긴다.
 *     경계값(5·64)을 여기로 복사하면 물리층과 어긋날 수 있으므로 **슬라이더 격자를 그대로 훑는다**.
 *     격자는 100점뿐이고 한 번만 계산한다. */
let dieShearRequirementRangeCache: [number, number] | undefined;
function dieShearRequirementRangeKg(): [number, number] {
  if (dieShearRequirementRangeCache === undefined) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let u = DIE_AREA_UNITS_MIN; u <= DIE_AREA_UNITS_MAX; u += DIE_AREA_UNITS_STEP) {
      const v = dieShearRequirementKg({ areaIn2: u * DIE_AREA_UNIT_IN2, condition: DIE_SHEAR_CONDITION }).value;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    dieShearRequirementRangeCache = [lo, hi];
  }
  return dieShearRequirementRangeCache;
}

/** 슬라이더가 이산 색인일 때 격자에 스냅한다. A14 — 표 밖 조회로 예외가 나가지 않게 한다. */
function snapIndex(v: number, len: number): number {
  if (!Number.isFinite(v)) return 0;
  const i = Math.round(v);
  return i < 0 ? 0 : i >= len ? len - 1 : i;
}

/** 표 2 밖의 θ 는 물리층이 거부한다(보간 금지). 슬라이더 하한과 같지만 방어적으로 묶는다. */
function clampTheta(v: number): number {
  const [lo, hi] = THETA_TABLE_RANGE;
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function flag(value: boolean, modelId: string, sourceId: 'S247' | 'S248' | 'S249' | 'S255', assumptions: string[]): Quantity {
  return quantity(value ? 1 : 0, { modelId, unit: '', sourceId, validRange: FLAG_RANGE, assumptions });
}

/* ══════════════════════════ 기초 (S5 · LO-P8-03) ══════════════════════════ */

const HALF_STEP = 0.5; // 0/1 슬라이더의 판정 경계. 물리 상수가 아니라 색인 경계다.

/* ══════════════════════════ 응용 (S6 · LO-P8-04) ══════════════════════════ */

/** 표준 소킹이 시간으로 규정된 등급만 다룬다 — 1·2·2a 는 「1년」「4주」라 시간 비교가 불가능하다. */
const HOURLY_LEVELS = MSL_HOURLY_LEVELS;

/* ══════════════════════════ 심화 (S7 · LO-P8-05) ══════════════════════════ */

const CONCERNS = SHEAR_CONCERNS;

function concernAt(i: number): ShearConcern {
  return CONCERNS[snapIndex(i, CONCERNS.length)] as ShearConcern;
}

function levelAt(i: number): MslLevel {
  return HOURLY_LEVELS[snapIndex(i, HOURLY_LEVELS.length)] as MslLevel;
}

/* ═══════════════ 차트 팩터리 (2026-08-22 · W6-6 해소) ═══════════════
 * 🔴 **차트 리터럴을 `LabSpec` 객체 안에 직접 쓰지 않는다.** 저장소 관례이자 게이트 요건이다 —
 *    `check-labs.mjs` 항목 6 은 칸 구간의 `tone:` 을 **feedback tone** 으로 읽는데
 *    `LabChartRefLine.tone` 은 `'spec' | 'info'` 라 구간 안에 있으면 **오탐으로 실패**한다
 *    (그 파일가 이 함정을 명시해 두었다). `photo.ts`·`oxidation.ts`·`wafer.ts` 가
 *    전부 모듈 수준 팩터리 함수로 빼 둔 이유가 이것이다. 2026-08-22 실측으로 재확인했다.
 */

function packagingBasicCharts(): LabChartBinding[] {
  return [
      {
        id: 'packaging.basic.riseVsTheta',
        kind: 'line',
        ko: '열저항 스윕 — 접합온도 상승폭 ΔT (합격창 확대)',
        en: 'Thermal-resistance sweep — junction temperature rise (spec window zoomed)',
        judgesOutputs: ['riseC'],
        xKo: '측정 열저항 θ', xEn: 'Measured thermal resistance', xUnit: '°C/W',
        yKo: '접합온도 상승폭 ΔT', yEn: 'Junction temperature rise', yUnit: '°C',
        xDomain: [THETA_SLIDER_RANGE[0], THETA_SLIDER_RANGE[1]],
        yDomain: [0, RISE_CHART_Y_MAX_FACTOR * TYPICAL_RISE_MAX_C.value],
        refLines: [
          { value: TYPICAL_RISE_MAX_C.value, ko: '통상 상한 60 °C', en: 'Typical upper 60 °C', tone: 'spec' },
          { value: MIN_RECOMMENDED_RISE_C.value, ko: '최소 권장 20 °C', en: 'Minimum recommended 20 °C', tone: 'spec' },
          { value: TYPICAL_RISE_MIN_C.value, ko: '통상 하한 30 °C', en: 'Typical lower 30 °C', tone: 'info' },
        ],
        captionKo: 'ΔT = θ·P 는 직선입니다 — 시험 전력 P 가 그 기울기입니다. 측정 대상의 열저항 θ 는 바꿀 수 없으므로, 상승폭을 권장 창(20~60 °C) 안으로 넣는 손잡이는 **가열 전력 하나뿐**입니다. 전력을 올리면 직선이 서고, 열저항이 큰 패키지에서는 권장 창을 위로 뚫습니다. 상승폭이 20 °C 를 밑돌면 측정 잡음에 묻혀 열저항 자체를 믿을 수 없게 됩니다.',
        captionEn: 'Delta-T = theta times P is a straight line, and the test power sets its slope. You cannot change the thermal resistance of the part under test, so the only handle for landing the rise inside the recommended 20-60 C window is the heating power. More power steepens the line and overshoots the window on high-resistance packages; below 20 C the rise drowns in measurement noise and the resistance reading cannot be trusted.',
        note: '직선은 현재 시험 전력을 고정한 채 열저항만 슬라이더 격자(15~100 °C/W · 5 단위) 전체로 훑은 것이며, `compute()` 가 판정에 쓰는 물리층 함수 `junctionTemperature()` 와 **같은 함수 하나**로 그립니다(T_A = 0 기준점을 넣어 우변이 곧 상승폭이 되는 호출). 세로 점선은 현재 열저항 위치입니다. 세로축 상한은 통상 상한 60 °C 의 2배이며 합격창 숫자는 건드리지 않았습니다(D-041).',
        build: (inputs, outputs) => {
          const theta = clampTheta(inputs['thetaCPerW'] ?? THETA_SLIDER_RANGE[0]);
          const power = Math.max(inputs['testPowerW'] ?? 1, Number.MIN_VALUE);
          const at = (th: number): number =>
            junctionTemperature({ tAmbientC: 0, thetaJA: th, powerW: power }).value;
          return [
            {
              id: 'riseLine',
              ko: `ΔT(θ) · P_H = ${power} W`,
              en: `Rise(theta) at P_H = ${power} W`,
              points: thetaGrid().map((th) => ({ x: th, y: at(th) })),
            },
            {
              id: 'operating',
              ko: '현재 열저항',
              en: 'Current thermal resistance',
              points: [{ x: theta, y: 0 }, { x: theta, y: outputs['riseC'] ?? at(theta) }],
              dashed: true,
            },
          ];
        },
      },
  ];
}

function packagingAdvancedCharts(): LabChartBinding[] {
  return [
      {
        id: 'packaging.advanced.dieShearRequirement',
        kind: 'line',
        ko: '다이 면적 스윕 — 전단 요구치 곡선과 인가력의 교차점',
        en: 'Die-area sweep — requirement curve versus applied force',
        judgesOutputs: ['dieShearMarginKg'],
        xKo: '다이 면적', xEn: 'Die area', xUnit: '×10⁻⁴ in²',
        yKo: '다이 전단력', yEn: 'Die shear force', yUnit: 'kg',
        xDomain: [DIE_AREA_UNITS_MIN, DIE_AREA_UNITS_MAX],
        yDomain: [APPLIED_DIE_SHEAR_MIN_KG, APPLIED_DIE_SHEAR_MAX_KG],
        captionKo: '요구치 곡선은 세 구간으로 꺾입니다 — 5 ×10⁻⁴ in² 미만은 절대 하한으로 평평하고, 그 위는 면적에 비례해 오르며, 64 를 넘으면 다시 고정값으로 평평해집니다. 🔴 64 에서 요구치가 2.56 kg 에서 2.50 kg 으로 **내려앉는 불연속**이 있습니다 — 다이를 조금 더 크게 만들면 요구치가 오히려 낮아지는 구간입니다. 합격 여부는 인가력 수평선이 요구치 곡선 **위**에 있는가입니다. 두 선이 만나는 x 좌표가 이 인가력으로 감당할 수 있는 최대 면적입니다.',
        captionEn: 'The requirement curve breaks into three segments: flat at an absolute floor below 5 units of area, rising in proportion above it, then flat again at a fixed value past 64. At 64 the requirement drops discontinuously from 2.56 kg to 2.50 kg, so a slightly larger die can actually require less force. You pass when the applied-force line sits above the requirement curve; where the two meet is the largest area this applied force can carry.',
        note: '요구치 곡선은 물리층 `dieShearRequirementKg()` 를 슬라이더 격자(1~100, 1단위) 그대로 훑어 그립니다 — 여기에 0.04·a 같은 식을 손으로 옮겨 적지 않았습니다(A15). 수평선은 현재 인가 전단력, 세로 점선은 현재 다이 면적입니다. 판정 출력 「다이 전단 여유」는 현재 면적에서 이 두 선의 **간격**이며, 간격이 0 이상이면 합격입니다. 세로축은 인가력 슬라이더 정의역(0~5 kg)이라 요구치 창 0.04~2.56 kg 을 모두 담습니다.',
        build: (inputs, outputs) => {
          const units = Math.max(inputs['dieAreaUnits'] ?? DIE_AREA_UNITS_MAX, DIE_AREA_UNITS_MIN);
          const applied = Math.max(inputs['appliedDieShearKg'] ?? 0, 0);
          const requiredAt = (u: number): number =>
            dieShearRequirementKg({ areaIn2: u * DIE_AREA_UNIT_IN2, condition: DIE_SHEAR_CONDITION }).value;
          const margin = outputs['dieShearMarginKg'] ?? applied - requiredAt(units);
          return [
            {
              id: 'required',
              ko: `전단 요구치 (조건 ${DIE_SHEAR_CONDITION})`,
              en: `Shear requirement (condition ${DIE_SHEAR_CONDITION})`,
              points: dieAreaGrid().map((u) => ({ x: u, y: requiredAt(u) })),
            },
            {
              id: 'applied',
              ko: `인가 전단력 ${applied.toFixed(2)} kg`,
              en: `Applied shear force ${applied.toFixed(2)} kg`,
              points: [
                { x: DIE_AREA_UNITS_MIN, y: applied },
                { x: DIE_AREA_UNITS_MAX, y: applied },
              ],
              dashed: true,
            },
            {
              id: 'operating',
              ko: `현재 다이 면적 (여유 ${margin.toFixed(2)} kg)`,
              en: `Current die area (margin ${margin.toFixed(2)} kg)`,
              points: [{ x: units, y: requiredAt(units) }, { x: units, y: applied }],
              dashed: true,
            },
          ];
        },
      },
  ];
}

/* ═══════════════ 씬 배선 (2026-08-22 신설 · DSN 세션6 §P-1 ~ §P-5) ═══════════════
 *
 * 🔴 **왜 만들었는가 — 게이트 점수가 아니다.** `packaging` 은 8공정 중 **화면이 하나도 없는 두 공정**
 *    중 하나였다(다른 하나는 `eds`). 특히 `lab-applied` 는 **차트도 0개**였다 — 24칸 중 가장 빈 자리다.
 *    위 파일 머리말의 「🔴 씬 없음」은 이 배선으로 해소된다.
 *
 * 🔴 **3칸을 한 씬의 「모드」로 묶지 않았다.** 물리 주제가 서로 다르고(열저항 / 흡습 / 전단),
 *    모드 번호 파라미터는 `check-scene-constants`·`check-direction` 이 읽을 수 없는 상태값이 된다.
 *
 * 🔴 **6종 중 4종이 이산값이다** — `recommendedPowerW` 5단 · `floorLifeH` 4단 · `standardSoakH` 4단 ·
 *    `shearSpeedClass` 3단. 씬은 **보간하지 않고 계단을 계단으로** 그리고, 계단이 튀는 것을
 *    「얼어붙음(결함)」으로 오해하지 않도록 **다음 눈금을 유령선으로 미리** 그린다.
 *
 * 🔴 정규화 분모는 전부 이 파일에 이미 있는 값에서 파생한다. 계층 규칙상 `src/models` 는
 *    `src/viz` 를 import 할 수 없어(check-layering) 씬 모델의 `PT_*`/`MS_*`/`ST_*` 를 직접 못 쓴다.
 *    **갈라지면 조용히 낡으므로** `tests/unit/packaging-scene-mapping.test.ts` 가 양쪽을 import 해
 *    일치를 단언한다(`deposition.ts` 의 `ALD_SCENE_TEMP_WINDOW` 와 같은 관례).
 */

/**
 * ΔT 축 상한 [°C] = θ 슬라이더 상한 × 시험전력 슬라이더 상한.
 * 🔴 지어낸 값이 아니라 **이 칸이 도달할 수 있는 ΔT 의 상한 그 자체**다(ΔT = θ · P).
 */
export const PKG_RISE_AXIS_MAX_C = THETA_SLIDER_RANGE[1] * TEST_POWER_SLIDER_RANGE[1];
/** 전력 축 상한 [W] = 시험전력 슬라이더 상한(= Table 2 권장 전력 5단의 최대). */
export const PKG_POWER_AXIS_MAX_W = TEST_POWER_SLIDER_RANGE[1];
/** θ 축 구간 [°C/W] = 슬라이더 정의역. */
export const PKG_THETA_MIN = THETA_SLIDER_RANGE[0];
export const PKG_THETA_MAX = THETA_SLIDER_RANGE[1];
/**
 * 시간 축 상한 [h] = 노출시간 슬라이더 상한 = MSL3 표준 소킹 192 h.
 * 🔴 두 값이 같아서 **축 하나로 세 양(플로어 라이프·소킹·노출)을 잰다.**
 */
export const PKG_TIME_AXIS_MAX_H = FLOOR_EXPOSURE_MAX_H;
/** 여유 축 반폭 [h] — `floorLifeMarginH` 의 도달 구간 [−192, +168] 을 전부 덮는다. */
export const PKG_MARGIN_AXIS_H = FLOOR_EXPOSURE_MAX_H;
/**
 * 전단력 축 상한 [kg] = 인가력 슬라이더 상한.
 * 🔴 **요구치와 인가력을 같은 축에 올려야 여유가 화면의 길이가 된다.** 요구치 단독 상한(2.56)을
 *    쓰면 두 축이 갈라져 여유를 눈으로 못 잰다.
 */
export const PKG_SHEAR_AXIS_MAX_KG = APPLIED_DIE_SHEAR_MAX_KG;
/** 다이 면적 축 상한 [10⁻⁴ in²] = 슬라이더 상한. */
export const PKG_DIE_AREA_UNITS_MAX = DIE_AREA_UNITS_MAX;
/** 전단속도 구분 색인 상한. */
export const PKG_SHEAR_CLASS_MAX = SHEAR_SPEED_CLASS_MAX;
/** 전단속도 로그 축 구간 [mm/s] = 슬라이더 정의역. 3 decade 라 **로그축**이다 —
 *  선형이면 Condition A(0.1~0.8)가 축의 0.7 % 로 뭉개진다. */
export const PKG_SPEED_MIN_MM_PER_S = SHEAR_SPEED_SLIDER_RANGE[0];
export const PKG_SPEED_MAX_MM_PER_S = SHEAR_SPEED_SLIDER_RANGE[1];

const clamp01 = (v: number): number => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/** 【기초】 `packageThermal` — 패키지 열경로 단면 ＋ ΔT 온도 기둥 ＋ θ→권장전력 계단. */
const packageThermalMap: LabSceneBinding['map'] = (i, out) => ({
  rise: clamp01((out['riseC'] ?? 0) / PKG_RISE_AXIS_MAX_C),
  recPower: clamp01((out['recommendedPowerW'] ?? TEST_POWER_SLIDER_RANGE[0]) / PKG_POWER_AXIS_MAX_W),
  testPower: clamp01((i['testPowerW'] ?? TEST_POWER_SLIDER_RANGE[0]) / PKG_POWER_AXIS_MAX_W),
  theta: clamp01(((i['thetaCPerW'] ?? PKG_THETA_MIN) - PKG_THETA_MIN) / (PKG_THETA_MAX - PKG_THETA_MIN)),
});

const PACKAGE_THERMAL_NOTE =
  '왼쪽은 패키지 열경로 단면이고 붉게 물드는 사각형이 접합부(다이)입니다. 가운데 기둥이 접합온도 상승폭 ΔT 이며 '
  + '파선 두 줄이 합격창 20~60 °C 입니다 — 기본 조건 300 °C 는 축 꼭대기, 합격창의 6 배 위입니다. '
  + '오른쪽 계단은 JESD51-2A Table 2 의 권장 측정 전력이고 0.5 · 0.75 · 1 · 2 · 3 W **다섯 자리만** 밟습니다. '
  + '🔴 계단 사이를 보간하지 않습니다 — 표준이 그 사이를 규정하지 않았습니다. 채운 점이 경계값을 갖는 쪽입니다. '
  + '수평 파선은 지금 적용한 시험 전력입니다. ΔT 축 상한 300 °C 는 θ 상한 100 × 전력 상한 3 W, 곧 이 칸이 '
  + '도달할 수 있는 상한 그 자체입니다.';

/** 【응용】 `moistureSoak` — 공용 시간축 위 플로어라이프 막대 ＋ 소킹 막대 ＋ 노출 마커. */
const moistureSoakMap: LabSceneBinding['map'] = (i, out) => ({
  /* 🔴 결측 기본값은 **표의 최저단**(플로어 24 h · 소킹 48 h = MSL 5a)이다.
     축 한가운데(0.5)를 쓰지 않는다 — 없는 값을 중간값으로 그리는 것이 A15 위반이다. */
  floorLife: clamp01((out['floorLifeH'] ?? 24) / PKG_TIME_AXIS_MAX_H),
  soak: clamp01((out['standardSoakH'] ?? 48) / PKG_TIME_AXIS_MAX_H),
  exposure: clamp01((i['floorExposureH'] ?? 0) / PKG_TIME_AXIS_MAX_H),
  margin: clamp01(0.5 + (out['floorLifeMarginH'] ?? 0) / (2 * PKG_MARGIN_AXIS_H)),
});

const MOISTURE_SOAK_NOTE =
  '가로축은 시간(0~192 h) 하나이고 세 양을 같은 자로 잽니다. 위 막대가 표준 플로어 라이프, 아래 막대가 표준 소킹 '
  + '시간이며, 위 막대 위의 굵은 세로 표시가 지금까지의 라인 노출시간입니다. 둘 사이의 치수선이 잔여 여유이고 '
  + '왼쪽으로 뻗으면 초과(불합격)입니다. 흐린 눈금 넷은 MSL 3 · 4 · 5 · 5a 가 각각 밟는 자리입니다 — '
  + '🔴 등급을 바꾸면 막대 끝이 이 **네 자리만** 옮겨 다닙니다. 값이 멈춘 것이 아니라 표준이 네 값만 규정했습니다. '
  + '🔴 플로어 라이프와 소킹 시간은 J-STD-020F Table 4 **조회값**이라 계산식이 없습니다 — 씬이 다시 계산하지 않습니다. '
  + '여유가 0 인 자리가 곧 합격선입니다. MSL 1 · 2 · 2a 는 「무제한 / 1년 / 4주」라 시간축에 올릴 수 없어 이 칸에 없습니다.';

/** 【심화】 `shearTest` — 좌: 다이 상면도(면적) ＋ 요구력 막대 / 우: 전단속도 로그축 3구간. */
const shearTestMap: LabSceneBinding['map'] = (i, out) => ({
  required: clamp01((out['dieShearRequiredKg'] ?? 0) / PKG_SHEAR_AXIS_MAX_KG),
  applied: clamp01((i['appliedDieShearKg'] ?? 0) / PKG_SHEAR_AXIS_MAX_KG),
  dieArea: clamp01((i['dieAreaUnits'] ?? DIE_AREA_UNITS_MIN) / PKG_DIE_AREA_UNITS_MAX),
  speedClass: clamp01((out['shearSpeedClass'] ?? 1) / PKG_SHEAR_CLASS_MAX),
  speedLog: clamp01(
    Math.log10(Math.max(i['shearSpeedMmPerS'] ?? PKG_SPEED_MIN_MM_PER_S, PKG_SPEED_MIN_MM_PER_S)
      / PKG_SPEED_MIN_MM_PER_S)
      / Math.log10(PKG_SPEED_MAX_MM_PER_S / PKG_SPEED_MIN_MM_PER_S),
  ),
});

const SHEAR_TEST_NOTE =
  '왼쪽 사각형이 다이 면적입니다 — 넓이가 곧 면적비라 한 변이 √a 로 늘어납니다. 파선 사각형이 '
  + 'MIL-STD-883K FIGURE 2019-4 NOTE 1 의 경계 64 ×10⁻⁴ in² 이고, 다이가 이 윤곽을 넘는 순간 요구치가 '
  + '2.56 kg 에서 **2.50 kg 으로 내려앉습니다** — 🔴 이 계단은 표준에 실재하는 불연속이지 결함이 아닙니다. '
  + '가운데 막대가 요구 전단력, 수평 파선이 인가 전단력이며 둘이 같은 축이라 간격이 곧 여유입니다. '
  + '오른쪽은 전단속도 로그축입니다. 왼쪽 띠가 Condition A(0.1~0.8 mm/s), 오른쪽 끝 띠가 Condition B(> 50 mm/s)이고 '
  + '🔴 가운데 빗금 구간(0.8~50)은 **표준이 규정하지 않은 자리**로 축의 60 %를 차지합니다. 기본값 5 mm/s 가 그 안입니다. '
  + '경계에서 채운 점은 포함, 빈 점은 불포함입니다.';

export const PACKAGING_LABS: LabSpec[] = [
  {
    processId: PACKAGING_PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P8-03',
    titleKo: '열저항 측정 조건 세우기 — 지금 이 값은 θJA 인가 θJMA 인가',
    titleEn: 'Setting up a thermal-resistance measurement — is this θJA or θJMA?',
    params: [
      {
        id: 'thetaCPerW', ko: '측정 열저항 θ (v = 0 → θJA · v > 0 → θJMA)',
        en: 'Measured thermal resistance θ (v = 0 → θJA · v > 0 → θJMA)', unit: '°C/W',
        min: THETA_SLIDER_RANGE[0], max: THETA_SLIDER_RANGE[1], step: THETA_SLIDER_STEP,
        initial: THETA_SLIDER_RANGE[1], sourceId: 'S247',
        note: 'JESD51-2A §5.5 Table 2 의 밴드 경계 15·20·30·60·100 °C/W 가 범위를 준다. 15 미만은 표준이 "etc" 로 남겨 두어 보간하지 않는다. 🔴 θ 는 측정 결과로 입력받는다 — 풍속으로부터 계산하지 않는다(예측식이 두 원장에 없다).',
      },
      {
        id: 'testPowerW', ko: '시험 가열전력 P_H', en: 'Test heating power P_H', unit: 'W',
        min: TEST_POWER_SLIDER_RANGE[0], max: TEST_POWER_SLIDER_RANGE[1], step: 0.25,
        initial: TEST_POWER_SLIDER_RANGE[1], sourceId: 'S247',
        note: 'Table 2 가 권장하는 측정 전력 0.5 · 0.75 · 1 · 2 · 3 W 가 범위를 준다.',
      },
      {
        id: 'airVelocityMPerS', ko: '풍동 유속 v (0 = 정지 공기)', en: 'Wind tunnel air velocity v (0 = still air)',
        unit: 'm/s', min: 0, max: 10, step: 0.25, initial: 10, sourceId: 'S255',
        note: 'JESD51-6 §4.1 — 풍동 유속은 10 m/s 미만이어야 한다. 슬라이더 상한 10.00 은 규격 밖(엄격부등호)이며 그 사실을 판정으로 보여 준다. PLN 명세의 0~3.0 m/s 는 이 범위 안이다.',
      },
      {
        id: 'velocityUpstream', ko: '유속 측정 위치 (0 = 소자 하류 · 1 = 소자 상류)',
        en: 'Velocity measurement location (0 = downstream · 1 = upstream)', unit: '',
        min: 0, max: 1, step: 1, initial: 0, sourceId: 'S255',
        note: 'JESD51-6 §4.5.1 — 유속은 소자 상류에서 측정한다. 하류에서 재면 소자가 만든 후류가 섞인다. 정지 공기에는 잴 유동이 없어 이 요건이 적용되지 않는다.',
      },
    ],
    outputs: [
      {
        id: 'riseC', ko: '접합온도 상승폭 ΔT = T_J − T_A', en: 'Junction temperature rise ΔT',
        role: 'judge', pass: { min: MIN_RECOMMENDED_RISE_C.value, max: TYPICAL_RISE_MAX_C.value }, digits: 1,
      },
      {
        id: 'tunnelVelocityOk', ko: '풍동 유속이 규격 범위 안인가 (1 = 10 m/s 미만)',
        en: 'Tunnel velocity within range (1 = below 10 m/s)',
        /* 🔴 `counted` — 값이 정확히 0·1 인 **플래그**다. 규칙이 발동할 여지가 없지만
           PLN §27-3 이 「명시적으로 못박아 둔다」고 지정했다. 나중에 이 출력이 연속량으로
           바뀌면 이 표식이 먼저 눈에 걸린다. */
        role: 'judge', pass: { min: FLAG_PASS, max: FLAG_PASS }, digits: 0, displayMode: 'counted',
      },
      {
        id: 'velocityMeasurementOk', ko: '유속을 소자 상류에서 쟀는가 (1 = 적합 · 정지 공기면 해당 없음)',
        en: 'Velocity measured upstream (1 = valid · N/A in still air)',
        /* 🔴 `counted` — 값이 정확히 0·1 인 **플래그**다. 규칙이 발동할 여지가 없지만
           PLN §27-3 이 「명시적으로 못박아 둔다」고 지정했다. 나중에 이 출력이 연속량으로
           바뀌면 이 표식이 먼저 눈에 걸린다. */
        role: 'judge', pass: { min: FLAG_PASS, max: FLAG_PASS }, digits: 0, displayMode: 'counted',
      },
      {
        id: 'metricIsThetaJMA', ko: '지표명 (0 = θJA · JESD51-2A / 1 = θJMA · JESD51-6)',
        en: 'Metric name (0 = θJA · JESD51-2A / 1 = θJMA · JESD51-6)', role: 'display', digits: 0,
      },
      {
        id: 'thetaLabelled', ko: '열저항 θ — 출처 배지가 v 에 따라 S247 ↔ S255 로 바뀐다',
        en: 'Thermal resistance θ — the source badge flips S247 ↔ S255 with v', role: 'display', digits: 1,
      },
      {
        id: 'directionIndependent', ko: '소자 방향 의존성 소멸 (1 = v > 2 m/s)',
        en: 'Orientation independence reached (1 = v > 2 m/s)', role: 'display', digits: 0,
      },
      {
        id: 'recommendedPowerW', ko: 'Table 2 권장 측정 전력', en: 'Table 2 recommended test power',
        role: 'display', digits: 2,
      },
      {
        id: 'powerVsTableRatio', ko: '적용 전력 ÷ 권장 전력', en: 'Applied power ÷ recommended power',
        role: 'display', digits: 2,
      },
    ],
    compute(inputs) {
      const theta = clampTheta(inputs['thetaCPerW'] ?? THETA_TABLE_RANGE[0]);
      const power = Math.max(inputs['testPowerW'] ?? 1, Number.MIN_VALUE);
      const velocity = Math.max(inputs['airVelocityMPerS'] ?? 0, 0);
      const upstream = (inputs['velocityUpstream'] ?? 0) >= HALF_STEP;

      // 🔴 새 식이 아니다. JESD51-2A 식 (1) 의 역산 T_J = T_A + θ·P 에 기준점 T_A = 0 °C 를 넣으면
      //    우변이 그대로 상승폭 ΔT 가 된다. 물리층 함수를 그대로 부르기 위한 호출 방식이다.
      const rise = junctionTemperature({ tAmbientC: 0, thetaJA: theta, powerW: power });
      const rec = recommendedTestPowerW(theta);
      const moving = isMovingAir(velocity);

      return {
        riseC: quantity(rise.value, {
          modelId: 'packaging.lab.basic.riseC', unit: '°C', sourceId: 'S247', validRange: NON_NEGATIVE,
          assumptions: [
            `최소 권장 상승폭 ${MIN_RECOMMENDED_RISE_C.value} °C · 통상 ${TYPICAL_RISE_MIN_C.value}~${TYPICAL_RISE_MAX_C.value} °C (JESD51-2A §5.5)`,
            '🔴 접합온도 상한(예: 105 °C)은 표준값이 아니다 — 판정에 쓰지 않는다(M-26)',
          ],
        }),
        tunnelVelocityOk: tunnelVelocityConformanceIndex(velocity),
        velocityMeasurementOk: flag(
          velocityMeasurementLocationValid({ velocityMPerS: velocity, measuredUpstream: upstream }),
          'packaging.lab.basic.velocityLocation', 'S255',
          [
            '유속은 소자 상류에서 측정한다 (JESD51-6 §4.5.1)',
            '🔴 정지 공기(v = 0)에는 잴 유동이 없어 이 요건이 적용되지 않는다 — 표준 적용범위를 넘겨 판정하지 않는다',
          ],
        ),
        metricIsThetaJMA: flag(moving, 'packaging.lab.basic.metricName',
          thermalResistanceMetricSourceId(velocity),
          [
            `현재 지표명: ${thermalResistanceMetricName(velocity)}`,
            moving
              ? '움직이는 공기에서 잰 값이다 — JESD51-6 소관 θJMA(v)'
              : '정지 공기에서 잰 값이다 — JESD51-2A 소관 θJA',
          ]),
        thetaLabelled: quantity(theta, {
          modelId: 'packaging.lab.basic.theta', unit: '°C/W',
          // 🔴 라벨 전환의 핵심 — 근거 표준 자체가 바뀌므로 출처 배지도 함께 바뀐다.
          sourceId: thermalResistanceMetricSourceId(velocity),
          validRange: THETA_TABLE_RANGE,
          assumptions: [
            `현재 지표명: ${thermalResistanceMetricName(velocity)}`,
            moving
              ? `보고 유속은 기준 공기밀도 ${REFERENCE_AIR_DENSITY_KG_PER_M3} kg/m³ 로 환산한다 (JESD51-6 §4.5.1)`
              : 'JESD51-7 규정 2s2p 시험 PCB · 자연대류(정지 공기)',
            '패키지 간 열성능 비교 지표이지 시스템 접합온도 예측값이 아니다',
            '🔴 θ 는 측정값이다 — 풍속으로부터 계산하지 않았다(풍속→열저항 예측식이 원장에 없다)',
          ],
        }),
        directionIndependent: flag(velocityIsDirectionIndependent(velocity),
          'packaging.lab.basic.directionIndependence', 'S255',
          [`${DIRECTION_INDEPENDENT_ABOVE_M_PER_S} m/s 를 넘으면 소자 방향에 대한 의존성이 사라진다 (JESD51-6)`]),
        recommendedPowerW: rec,
        powerVsTableRatio: quantity(power / rec.value, {
          modelId: 'packaging.lab.basic.powerRatio', unit: '', sourceId: 'S247', validRange: NON_NEGATIVE,
          assumptions: ['1.00 이면 Table 2 권장 전력과 같다'],
        }),
      };
    },
    /* ── 차트 (W6-6 해소 · PLN `threads/parts/차트-P8-packaging.md` §1-1 「필요 — 1개」) ──
     * 🔴 판정선언은 **`riseC` 1건뿐**이다. `tunnelVelocityOk`·`velocityMeasurementOk` 는
     *    0/1 플래그라 스칼라로 합·부가 그대로 보인다 — PLN 이 C5 로 「판정선언 금지」를 명시했다.
     */
    scene: { sceneId: 'packageThermal', map: packageThermalMap, note: PACKAGE_THERMAL_NOTE },
    charts: packagingBasicCharts(),
    feedback: [
      {
        id: 'PKG-B1', tone: 'stop',
        ko: '강제 공랭 조건입니다. 지금 이 값은 θJA 가 아니라 θJMA(v) 이고, 소관 표준이 JESD51-2A(자연대류 한정 · §4)에서 JESD51-6(강제대류)으로 바뀝니다. 「데이터시트의 θJA 를 강제 공랭에 그대로 쓰면 안 된다」 — 두 값은 같은 식으로 구하지만 다른 환경에서 잰 다른 지표입니다.',
        en: 'Forced air. This value is θJMA(v), not θJA: the governing standard moves from JESD51-2A (natural convection only, §4) to JESD51-6. Never apply a datasheet θJA to a forced-air design — same equation, different environment, different metric.',
        when: (i) => (i['airVelocityMPerS'] ?? 0) > 0,
      },
      {
        id: 'PKG-B2', tone: 'hint',
        ko: '정지 공기 조건입니다. 지금 이 지표의 이름은 θJA 이고, JESD51-7 규정 2s2p 시험 PCB 위에서 측정한 값과 비교할 수 있습니다. 풍속을 조금이라도 올리면 이름과 출처 배지가 함께 바뀌는 것을 보십시오.',
        en: 'Still air. The metric is properly called θJA and is comparable with values from the JESD51-7 2s2p test board. Raise the velocity even slightly and watch both the name and the source badge change.',
        when: (i) => (i['airVelocityMPerS'] ?? 0) === 0,
      },
      {
        id: 'PKG-B3', tone: 'stop',
        ko: `풍동 유속이 규격 범위를 벗어났습니다. JESD51-6 §4.1 은 유속을 ${TUNNEL_VELOCITY_LIMIT_M_PER_S} m/s 미만으로 규정합니다 — 그 이상에서 얻은 θJMA 는 이 표준의 데이터가 아닙니다.`,
        en: 'The tunnel velocity is out of range. JESD51-6 §4.1 specifies below 10 m/s — a θJMA taken above that is not data under this standard.',
        when: (_i, o) => (o['tunnelVelocityOk'] ?? 1) < FLAG_PASS,
      },
      {
        id: 'PKG-B4', tone: 'warn',
        ko: '유속을 소자 하류에서 재고 있습니다. JESD51-6 §4.5.1 은 상류 측정을 요구합니다 — 하류에는 소자가 만든 후류가 섞여 실제 접근 유속보다 낮거나 흐트러진 값이 나옵니다.',
        en: 'The velocity is being measured downstream of the device. JESD51-6 §4.5.1 requires an upstream measurement — the device wake corrupts the downstream reading.',
        when: (_i, o) => (o['velocityMeasurementOk'] ?? 1) < FLAG_PASS,
      },
      {
        id: 'PKG-B5', tone: 'warn',
        ko: '접합온도 상승폭이 20 °C 미만입니다. 표준은 측정 잡음에 묻히지 않도록 최소 20 °C, 통상 30~60 °C 를 권합니다(§5.5). 전력을 올리거나 열저항이 큰 시료를 쓰십시오.',
        en: 'The junction temperature rise is below 20 °C. The standard recommends at least 20 °C, typically 30–60 °C, so the reading is not buried in noise (§5.5).',
        when: (_i, o) => (o['riseC'] ?? 0) < MIN_RECOMMENDED_RISE_C.value,
      },
      {
        id: 'PKG-B6', tone: 'warn',
        ko: '상승폭이 통상 구간(30~60 °C)을 넘었습니다. 전력이 과하면 열저항 자체가 온도에 따라 변해 패키지 간 비교값으로서의 의미가 흐려집니다. Table 2 권장 전력과 비교해 보십시오.',
        en: 'The rise exceeds the typical 30–60 °C band. Excess power makes θ itself temperature-dependent and weakens its value as a package-to-package comparison metric.',
        when: (_i, o) => (o['riseC'] ?? 0) > TYPICAL_RISE_MAX_C.value,
      },
      {
        id: 'PKG-B7', tone: 'hint',
        ko: '적용 전력이 Table 2 권장값과 다릅니다. 열이 잘 빠지지 않는 패키지(θ 가 큰 쪽)일수록 표준은 오히려 낮은 전력을 권합니다 — 상승폭이 과해져 측정이 불안정해지기 때문입니다.',
        en: 'The applied power differs from the Table 2 recommendation. The higher the θ, the lower the power the standard recommends — an excessive rise destabilises the measurement.',
        when: (_i, o) => Math.abs((o['powerVsTableRatio'] ?? 1) - 1) > 1e-9,
      },
      {
        id: 'PKG-B8', tone: 'hint',
        ko: '2 m/s 를 넘었습니다. 이 구간부터는 소자를 어느 방향으로 놓아도 θJMA 가 사실상 같아집니다(JESD51-6). 그 아래에서는 방향을 함께 보고해야 값이 재현됩니다.',
        en: 'Above 2 m/s the θJMA becomes effectively independent of device orientation (JESD51-6). Below it, the orientation must be reported for the value to be reproducible.',
        when: (_i, o) => (o['directionIndependent'] ?? 0) >= FLAG_PASS,
      },
      {
        id: 'PKG-B9', tone: 'hint',
        ko: `풍동 자체도 규격을 만족해야 합니다 — 중앙 ${FLOW_QUALITY_LIMITS.uniformityCorePct} % 단면 유속 균일도 ±${FLOW_QUALITY_LIMITS.uniformityTolerancePct} %(§4.1.1) · 스월 ${FLOW_QUALITY_LIMITS.swirlPct} % 미만(§4.1.2) · 난류도 ${FLOW_QUALITY_LIMITS.turbulencePct} % 미만(§4.1.3) · 비정상성 ${FLOW_QUALITY_LIMITS.unsteadinessPct} % 미만(§4.1.4). 보고 유속은 기준 공기밀도 ${REFERENCE_AIR_DENSITY_KG_PER_M3} kg/m³ 로 환산합니다(§4.5.1). 이 네 항목은 물리층 windTunnel.flowQualityConformance() 에 구현돼 있으나 아직 슬라이더로 두지 않았고 기준만 고지합니다.`,
        en: 'The tunnel itself must conform: ±5 % velocity uniformity over the central 90 % (§4.1.1), swirl below 5 % (§4.1.2), turbulence below 2 % (§4.1.3), unsteadiness below 5 % (§4.1.4). Reported velocity is corrected to a 1.2 kg/m³ reference air density (§4.5.1). These four are stated here, not yet exposed as sliders.',
        when: (i) => (i['airVelocityMPerS'] ?? 0) > 0,
      },
    ],
    tradeoffs: [
      {
        ko: '전력↑ → 상승폭이 커져 측정 잡음 대비 신호가 좋아진다(좋음) / 너무 크면 열저항 자체가 온도에 따라 변해 비교 지표로서의 의미가 흐려진다(나쁨).',
        en: 'More power gives a better signal-to-noise rise (good) but makes θ itself temperature-dependent, weakening it as a comparison metric (bad).',
      },
      {
        ko: '열저항이 큰 패키지 → 같은 전력으로 상승폭을 확보하기 쉽다(좋음) / 그러나 Table 2 는 오히려 더 낮은 측정 전력을 권한다 — 두 요구가 반대로 움직인다.',
        en: 'A higher-θ package makes it easy to reach a measurable rise (good) but Table 2 prescribes a lower test power — the two requirements pull in opposite directions.',
      },
      {
        ko: '풍속↑ → 실제 접합온도는 내려가고(설계상 좋음) 2 m/s 를 넘으면 소자 방향 의존성도 사라져 재현성이 좋아진다(좋음) / 그러나 그 값은 더 이상 θJA 가 아니어서 데이터시트와 직접 비교할 수 없고(나쁨), 10 m/s 를 넘으면 JESD51-6 의 시험 범위 자체를 벗어난다.',
        en: 'Higher velocity lowers the real junction temperature (good) and above 2 m/s removes orientation dependence, improving reproducibility (good) — but the result is no longer θJA and cannot be compared with datasheets (bad), and above 10 m/s it leaves the JESD51-6 test envelope entirely.',
      },
      {
        ko: '🔴 풍속을 올려 θ 를 낮추는 것과, 그 값을 데이터시트의 θJA 와 나란히 놓는 것은 동시에 성립하지 않는다. 값이 좋아지는 대신 비교 근거를 잃는다 — 규격을 읽을 줄 아는 것이 이 실습의 목표다.',
        en: 'Lowering θ with airflow and quoting it alongside a datasheet θJA cannot both be true at once: the number improves and the basis for comparison is lost. Reading the standard correctly is the objective here.',
      },
    ],
  },

  {
    processId: PACKAGING_PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P8-04',
    titleKo: 'MSL 등급과 플로어 라이프 — 개봉한 패키지를 언제까지 실장할 수 있는가',
    titleEn: 'MSL and floor life — how long may an opened package wait before reflow?',
    params: [
      {
        id: 'mslHourlyIndex', ko: 'MSL 등급 (0 = Level 3 · 1 = Level 4 · 2 = Level 5 · 3 = Level 5a)',
        en: 'MSL level (0 = 3 · 1 = 4 · 2 = 5 · 3 = 5a)', unit: '',
        min: 0, max: 3, step: 1, initial: 3, sourceId: 'S248',
        note: 'J-STD-020F Table 4. 플로어 라이프가 시간으로 규정된 등급만 다룬다 — Level 1·2·2a 는 「무제한」「1년」「4주」라 시간축 비교가 불가능하다.',
      },
      {
        id: 'floorExposureH', ko: '방습백 개봉 후 라인 노출시간', en: 'Floor exposure after bag opening', unit: 'h',
        min: 0, max: FLOOR_EXPOSURE_MAX_H, step: 4, initial: FLOOR_EXPOSURE_MAX_H, sourceId: 'S248',
        note: 'Table 4 가 규정한 시간값(플로어 라이프 168·72·48·24 h · 표준 소킹 192·96·72·48 h)의 최대치 192 h 가 상한을 준다. 조건은 30 °C / 60 %RH.',
      },
      {
        id: 'moistureEaEv', ko: '수분확산 활성화에너지 E_a', en: 'Moisture diffusion activation energy E_a', unit: 'eV',
        min: 0.3, max: 0.48, step: 0.005, initial: 0.395, sourceId: 'S248',
        note: 'Table 4 NOTE 1 이 가속 소킹을 허용하는 두 구간 0.30~0.39 eV · 0.40~0.48 eV 가 범위를 준다. 두 구간 사이(0.39~0.40)는 표준이 비워 둔 자리다.',
      },
      {
        id: 'moldHasFiller', ko: '몰드 컴파운드 필러 (0 = 없음 · 1 = 있음)',
        en: 'Mold compound filler (0 = none · 1 = filled)', unit: '',
        min: 0, max: 1, step: 1, initial: 1, sourceId: 'S248',
        note: 'Table 4 NOTE 5 — 필러가 없는 몰드 컴파운드에는 가속 소킹 요건이 적용되지 않을 수 있다.',
      },
    ],
    outputs: [
      {
        id: 'floorLifeMarginH', ko: '플로어 라이프 잔여 (플로어 라이프 − 노출시간)',
        /* 🔴 `counted` — MSL 플로어 라이프가 **시간 단위 정수 규격**이다. 자릿수를 올려
           `-0.4 h` 를 만들어 봐야 규격에 없는 정밀도다. 경계·부호소실은 부등호로 낸다. */
        en: 'Floor life remaining (floor life − exposure)', role: 'judge', pass: { min: MARGIN_PASS_MIN }, digits: 0,
        displayMode: 'counted',
      },
      {
        id: 'acceleratedSoakOk', ko: '가속 소킹(60 °C/60 %RH) 적용 가능 (1 = 가능)',
        en: 'Accelerated soak (60 °C/60 %RH) applicable (1 = yes)',
        /* 🔴 `counted` — 값이 정확히 0·1 인 **플래그**다. 규칙이 발동할 여지가 없지만
           PLN §27-3 이 「명시적으로 못박아 둔다」고 지정했다. 나중에 이 출력이 연속량으로
           바뀌면 이 표식이 먼저 눈에 걸린다. */
        role: 'judge', pass: { min: FLAG_PASS, max: FLAG_PASS }, digits: 0, displayMode: 'counted',
      },
      {
        id: 'floorLifeH', ko: '표준 플로어 라이프 (30 °C / 60 %RH)', en: 'Standard floor life (30 °C / 60 %RH)',
        role: 'display', digits: 0,
      },
      {
        id: 'standardSoakH', ko: '표준 소킹 시간', en: 'Standard soak duration', role: 'display', digits: 0,
      },
    ],
    compute(inputs) {
      const level = levelAt(inputs['mslHourlyIndex'] ?? 0);
      const exposure = Math.max(inputs['floorExposureH'] ?? 0, 0);
      const ea = inputs['moistureEaEv'] ?? 0;
      const filler = (inputs['moldHasFiller'] ?? 0) >= HALF_STEP;

      const floor = floorLifeHours(level);
      const soak = standardSoakHours(level);
      const verdict = acceleratedSoakApplicable({
        moistureDiffusionEaEv: ea,
        moldCompoundHasFiller: filler,
      });

      return {
        // 🔴 새 식이 아니다. J-STD-020F Table 4 의 준수 조건 「노출시간 ≤ 플로어 라이프」를
        //    그대로 잔여시간으로 적은 것이다. 흡습률 wt% 로 가르지 않는다(M-25).
        floorLifeMarginH: quantity(floor.value - exposure, {
          modelId: 'packaging.lab.applied.floorMargin', unit: 'h', sourceId: 'S248',
          // 🔴 편측 합격창(min: 0) 의 열린 쪽(위)을 정의역으로 닫는다.
          //    아래 = 노출시간 최대 − 플로어 라이프 최소(0 은 아니므로 보수적으로 −노출최대),
          //    위   = 플로어 라이프 최대 − 노출시간 0.
          validRange: [-FLOOR_EXPOSURE_MAX_H, floorLifeMaxH()],
          assumptions: [
            `MSL ${level} 플로어 라이프 ${floor.value} h @ 30 °C / 60 %RH`,
            `🔴 정의역 −${FLOOR_EXPOSURE_MAX_H} ~ ${floorLifeMaxH()} h — 노출시간 상한과 Table 4 플로어 라이프 최대치가 양쪽을 닫는다`,
            '🔴 흡습량(wt%) 임계로 가르지 않는다 — J-STD-020F 에 wt% 판정 기준이 없다(M-25)',
            '플로어 라이프는 습기·리플로우 관련 고장에만 관계한다(Table 4 NOTE 4)',
          ],
        }),
        acceleratedSoakOk: flag(verdict.applicable, 'packaging.lab.applied.acceleratedSoak', 'S248', [
          verdict.reason,
          `가속 소킹 조건 ${ACCELERATED_SOAK_TEMP_C.value} °C / ${ACCELERATED_SOAK_RH_PCT.value} %RH`,
          '🔴 가속 소킹의 시간값은 원장에 없다 — 적용 가부만 판정한다',
        ]),
        floorLifeH: floor,
        standardSoakH: soak,
      };
    },
    scene: { sceneId: 'moistureSoak', map: moistureSoakMap, note: MOISTURE_SOAK_NOTE },
    feedback: [
      {
        id: 'PKG-A1', tone: 'stop',
        ko: '플로어 라이프를 초과했습니다. 이 패키지는 그대로 리플로우에 넣을 수 없고, 규정 베이크 후 다시 실장해야 합니다. 판정 근거는 흡습량(wt%)이 아니라 J-STD-020F Table 4 가 정한 노출시간입니다 — 표준에 wt% 임계값은 없습니다.',
        en: 'Floor life exceeded. This package must not go straight into reflow; it needs the prescribed bake first. The criterion is the exposure time in J-STD-020F Table 4, not a moisture weight percentage — the standard defines no wt% threshold.',
        when: (_i, o) => (o['floorLifeMarginH'] ?? 0) < 0,
      },
      {
        id: 'PKG-A2', tone: 'warn',
        ko: '필러가 없는 몰드 컴파운드입니다. Table 4 NOTE 5 에 따라 가속 소킹 요건이 적용되지 않을 수 있습니다 — 표준 소킹 조건으로 되돌아가야 합니다.',
        en: 'The mold compound is unfilled. Under Table 4 NOTE 5 the accelerated soak requirement may not apply — fall back to the standard soak condition.',
        when: (i) => (i['moldHasFiller'] ?? 0) < HALF_STEP,
      },
      {
        id: 'PKG-A3', tone: 'hint',
        ko: '활성화에너지가 표준이 허용한 두 구간(0.30~0.39 eV · 0.40~0.48 eV) 사이에 있습니다. 이 틈은 표준이 비워 둔 자리이며, 여기서는 가속 소킹과 표준 소킹의 손상응답 상관성을 별도로 확립해야 합니다(Table 4 NOTE 1).',
        en: 'The activation energy falls in the gap between the two windows the standard allows (0.30–0.39 eV · 0.40–0.48 eV). The standard leaves this gap empty — correlation between accelerated and standard soak must be established separately (Table 4 NOTE 1).',
        when: (i) => {
          const ea = i['moistureEaEv'] ?? 0;
          return ea > 0.39 && ea < 0.4;
        },
      },
      {
        id: 'PKG-A4', tone: 'warn',
        ko: 'MSL 5 이상입니다. 플로어 라이프가 48 h 이하로 줄어 라인 재고 운용이 급격히 어려워집니다 — 건조보관·질소캐비닛 없이는 사실상 당일 실장만 가능합니다.',
        en: 'MSL 5 or worse: floor life drops to 48 h or less, which makes line inventory very hard to run — without dry storage this is effectively same-day assembly only.',
        when: (i) => (i['mslHourlyIndex'] ?? 0) >= 2,
      },
      {
        id: 'PKG-A5', tone: 'hint',
        ko: '표준 소킹 시간과 플로어 라이프를 함께 보십시오. 등급이 민감해질수록 둘 다 짧아집니다 — 라인에서 버틸 수 있는 시간도, 인증 시험에서 견뎌야 하는 시간도 같은 방향으로 움직입니다.',
        en: 'Read the standard soak duration together with the floor life: as the level gets more sensitive both shorten — the time the line may take and the time the qualification test imposes move together.',
        when: () => true,
      },
    ],
    tradeoffs: [
      {
        ko: 'MSL 등급을 덜 민감한 쪽으로 잡으면 라인 노출 여유가 커진다(좋음) / 그 등급을 실제로 인증하려면 더 긴 표준 소킹(최대 192 h)을 견뎌야 한다(나쁨).',
        en: 'A less sensitive MSL buys more floor time (good) but qualifying at that level means surviving a longer standard soak, up to 192 h (bad).',
      },
      {
        ko: '가속 소킹(60 °C/60 %RH)은 인증 기간을 줄인다(좋음) / 수분확산 활성화에너지가 표준의 두 구간 밖이거나 몰드에 필러가 없으면 쓸 수 없다(제약).',
        en: 'The accelerated soak shortens qualification (good) but is unavailable when the moisture diffusion activation energy lies outside the two windows or the mold compound is unfilled (constraint).',
      },
      {
        ko: '노출시간을 줄이면 합격하지만, 그만큼 건조보관·재베이크·질소캐비닛 운용 부담이 늘어난다 — 판정은 통과하고 비용은 라인이 낸다.',
        en: 'Cutting exposure passes the criterion, but the cost moves to dry storage, re-bake and nitrogen cabinets — the verdict passes and the line pays.',
      },
    ],
  },

  {
    processId: PACKAGING_PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P8-05',
    titleKo: '접합부 검증 시험 설계 — 합격기준이 있는 시험과 없는 시험을 구분한다',
    titleEn: 'Designing bond verification tests — which test has acceptance criteria, and which does not',
    params: [
      {
        id: 'concernIndex',
        ko: '관심사 (0 솔더 벌크 · 1 패드 계면 · 2 기판 강도 · 3 패드 오염 · 4 솔더 계면 · 5 기계적 충격)',
        en: 'Concern (0 bulk solder · 1 pad interface · 2 substrate · 3 pad contamination · 4 solder interface · 5 mechanical shock)',
        unit: '', min: 0, max: 5, step: 1, initial: 0, sourceId: 'S249',
        note: 'JESD22-B117B Table 4.1 이 열거한 관심사 6종 그대로. 표에 없는 관심사는 물리층이 거부한다.',
      },
      {
        id: 'shearSpeedMmPerS', ko: '솔더볼 전단 속도', en: 'Solder ball shear speed', unit: 'mm/s',
        min: SHEAR_SPEED_SLIDER_RANGE[0], max: SHEAR_SPEED_SLIDER_RANGE[1], step: 0.1,
        initial: 5, sourceId: 'S249',
        note: 'JESD22-B117B §4.7.1 Condition A 0.1~0.8 mm/s · §4.7.2 Condition B > 50 mm/s. 두 구간 사이는 표준이 규정하지 않았다.',
      },
      {
        id: 'elapsedAfterReflowH', ko: '리플로우 후 경과시간', en: 'Elapsed time after reflow', unit: 'h',
        min: 1, max: 24, step: 1, initial: 24, sourceId: 'S249',
        note: 'JESD22-B117B §4.12 — 최소 1 h · SnPb 최대 4 h · 무연 최대 24 h.',
      },
      {
        id: 'alloyIsLeadFree', ko: '솔더 합금 (0 = SnPb · 1 = 무연)', en: 'Solder alloy (0 = SnPb · 1 = lead-free)',
        unit: '', min: 0, max: 1, step: 1, initial: 0, sourceId: 'S249',
        note: '§4.12 가 SnPb 와 무연에 서로 다른 경과시간 상한을 준다. 🔴 무연 솔더의 수명 계수는 원장에 없어(M-22) 수명은 다루지 않는다 — 경과시간 창만 다룬다.',
      },
      {
        id: 'dieAreaUnits', ko: '다이 면적 (10⁻⁴ in² 단위)', en: 'Die area (units of 10⁻⁴ in²)', unit: '',
        min: DIE_AREA_UNITS_MIN, max: DIE_AREA_UNITS_MAX, step: DIE_AREA_UNITS_STEP,
        initial: DIE_AREA_UNITS_MAX, sourceId: 'S43',
        note: 'MIL-STD-883K METHOD 2019.10 FIGURE 2019-4 NOTES 가 5 · 64 ×10⁻⁴ in² 에서 구간을 나눈다. 그 경계를 모두 지나도록 잡았다.',
      },
      {
        id: 'appliedDieShearKg', ko: '인가 다이 전단력', en: 'Applied die shear force', unit: 'kg',
        min: APPLIED_DIE_SHEAR_MIN_KG, max: APPLIED_DIE_SHEAR_MAX_KG, step: 0.1, initial: 0.5, sourceId: 'S43',
        note: 'FIGURE 2019-4 NOTE 1 의 대면적 고정 요구치 1.0X = 2.5 kg · 2.0X = 5 kg 이 상한을 준다.',
      },
    ],
    outputs: [
      {
        id: 'speedMatchesConcern', ko: '전단속도가 관심사에 맞는가 (1 = 맞음)',
        en: 'Shear speed matches the concern (1 = yes)', role: 'judge', pass: { min: FLAG_PASS, max: FLAG_PASS }, digits: 0,
        displayMode: 'counted',
      },
      {
        id: 'elapsedWithinWindow', ko: '리플로우 후 경과시간이 규격 창 안인가 (1 = 안)',
        en: 'Elapsed time within the specified window (1 = yes)', role: 'judge', pass: { min: FLAG_PASS, max: FLAG_PASS }, digits: 0,
        displayMode: 'counted',
      },
      {
        id: 'dieShearMarginKg', ko: '다이 전단 여유 (인가력 − 요구치)', en: 'Die shear margin (applied − required)',
        role: 'judge', pass: { min: MARGIN_PASS_MIN }, digits: 2,
      },
      {
        id: 'shearSpeedClass', ko: '전단속도 구분 (0 하한 미만 · 1 저속 A · 2 표준 미규정 · 3 고속 B)',
        en: 'Shear speed class (0 below range · 1 low A · 2 unspecified · 3 high B)', role: 'display', digits: 0,
      },
      {
        id: 'dieShearRequiredKg', ko: '다이 전단 요구치 (조건 1.0X)', en: 'Die shear requirement (condition 1.0X)',
        role: 'display', digits: 2,
      },
    ],
    compute(inputs) {
      const concern = concernAt(inputs['concernIndex'] ?? 0);
      const speed = Math.max(inputs['shearSpeedMmPerS'] ?? 0, 0);
      const elapsed = inputs['elapsedAfterReflowH'] ?? 0;
      const leadFree = (inputs['alloyIsLeadFree'] ?? 0) >= HALF_STEP;
      const units = Math.max(inputs['dieAreaUnits'] ?? 1, 1);
      const applied = Math.max(inputs['appliedDieShearKg'] ?? 0, 0);

      const guidance = guidanceFor(concern);
      const cls = classifyShearSpeed(speed);
      const clsIndex = shearSpeedClassIndex(speed);
      const speedIsSpecified = cls === 'low' || cls === 'high';
      const matches = guidance.recommendedSpeed === 'either'
        ? speedIsSpecified
        : cls === guidance.recommendedSpeed;

      const elapsedMax = leadFree
        ? ELAPSED_AFTER_REFLOW.leadFreeMaxHours.value
        : ELAPSED_AFTER_REFLOW.snpbMaxHours.value;
      const elapsedOk = elapsed >= ELAPSED_AFTER_REFLOW.minHours.value && elapsed <= elapsedMax;

      const required = dieShearRequirementKg({ areaIn2: units * DIE_AREA_UNIT_IN2, condition: DIE_SHEAR_CONDITION });

      return {
        speedMatchesConcern: flag(matches, 'packaging.lab.advanced.speedMatch', 'S249', [
          `관심사 「${guidance.ko}」 권장 속도: ${guidance.recommendedSpeed}`,
          `예상 파괴모드 ${guidance.failureModes.join(' · ')} (Table 4.2)`,
          `저속 A ${LOW_SPEED_RANGE_MM_PER_S[0]}~${LOW_SPEED_RANGE_MM_PER_S[1]} mm/s · 고속 B > ${HIGH_SPEED_THRESHOLD_MM_PER_S} mm/s`,
          NO_ACCEPTANCE_CRITERIA_NOTICE,
        ]),
        elapsedWithinWindow: flag(elapsedOk, 'packaging.lab.advanced.elapsed', 'S249', [
          `${leadFree ? '무연' : 'SnPb'} — ${ELAPSED_AFTER_REFLOW.minHours.value}~${elapsedMax} h (§4.12)`,
        ]),
        // 🔴 여기만 힘으로 판정한다. 다이 전단은 MIL-STD-883 이 요구치를 정하기 때문이다.
        //    솔더볼 전단에는 같은 판정을 만들지 않는다(M-27).
        dieShearMarginKg: quantity(applied - required.value, {
          modelId: 'packaging.lab.advanced.dieShearMargin', unit: 'kg', sourceId: 'S43',
          // 🔴 편측 합격창(min: 0) 의 열린 쪽(위)을 정의역으로 닫는다.
          //    여유 = 인가력 − 요구치. 두 항 모두 유한한 창을 가지므로 여유도 유한하다.
          validRange: [
            APPLIED_DIE_SHEAR_MIN_KG - dieShearRequirementRangeKg()[1],
            APPLIED_DIE_SHEAR_MAX_KG - dieShearRequirementRangeKg()[0],
          ],
          assumptions: [
            `요구치 ${required.value.toPrecision(4)} kg · 면적 ${units} ×10⁻⁴ in² · 조건 ${DIE_SHEAR_CONDITION}`,
            `🔴 정의역 ${(APPLIED_DIE_SHEAR_MIN_KG - dieShearRequirementRangeKg()[1]).toPrecision(3)} ~ `
            + `${(APPLIED_DIE_SHEAR_MAX_KG - dieShearRequirementRangeKg()[0]).toPrecision(3)} kg — `
            + `인가력 창 ${APPLIED_DIE_SHEAR_MIN_KG}~${APPLIED_DIE_SHEAR_MAX_KG} kg 와 `
            + `요구치 창 ${dieShearRequirementRangeKg()[0].toPrecision(3)}~${dieShearRequirementRangeKg()[1].toPrecision(3)} kg 가 양쪽을 닫는다`,
            ...required.assumptions,
          ],
        }),
        shearSpeedClass: clsIndex,
        dieShearRequiredKg: required,
      };
    },
    /* ── 차트 (W6-6 해소 · PLN `threads/parts/차트-P8-packaging.md` §1-1 「필요 — 1개」) ──
     * 🔴 이 차트는 **C2(합격창이 좁다)가 아니라 C3** 으로 필요하다 — 근거를 섞지 않는다.
     *    요구치는 FIGURE 2019-4 의 **3구간 분기 곡선**이고 a = 64 에서 **2.56 → 2.50 의 실재 불연속**이 있다.
     *    학습자가 읽어야 하는 것은 스칼라 여유값이 아니라 **인가력 수평선과 요구치 곡선의 교차점**,
     *    즉 「이 인가력으로 합격할 수 있는 면적 구간은 어디까지인가」다.
     * 🔴 판정선언은 **`dieShearMarginKg` 1건뿐**. `speedMatchesConcern`·`elapsedWithinWindow` 는
     *    0/1 플래그라 PLN 이 판정선언을 금지했다.
     * 🔴 `kind` 는 `'profile'` 이 아니라 `'line'` 이다 — `ProfileChart` 는 가로축을 **깊이**로 이름 붙인다.
     *    여기 가로축은 면적이라 그 이름이 거짓이 된다. PLN 의 「C3」 는 **필요 사유의 코드**이지 렌더러 지정이 아니다.
     */
    scene: { sceneId: 'shearTest', map: shearTestMap, note: SHEAR_TEST_NOTE },
    charts: packagingAdvancedCharts(),
    feedback: [
      {
        id: 'PKG-X1', tone: 'hint',
        ko: NO_ACCEPTANCE_CRITERIA_NOTICE + ' 그래서 이 실습은 솔더볼 전단에서는 「조건」만 판정하고 힘의 합·부는 판정하지 않습니다. 반대로 다이 전단은 MIL-STD-883 METHOD 2019.10 이 요구치를 정하므로 힘으로 판정합니다 — 두 시험의 규격값을 서로 옮겨 쓰지 마십시오.',
        en: 'JESD22-B117B defines the test method only; acceptance criteria are not defined (§1). So this lab judges the solder-ball shear *conditions*, never the force. Die shear is different — MIL-STD-883 METHOD 2019.10 does set a requirement, so it is judged by force. Never carry criteria across the two tests.',
        when: () => true,
      },
      {
        id: 'PKG-X2', tone: 'stop',
        ko: '전단속도 0.8 ~ 50 mm/s 는 표준이 규정하지 않은 구간입니다(§4.7). 저속 Condition A(0.1~0.8 mm/s)나 고속 Condition B(> 50 mm/s) 중 하나를 고르십시오 — 그 사이 값으로 얻은 결과는 어느 조건의 데이터도 아닙니다.',
        en: '0.8–50 mm/s is a range the standard does not specify (§4.7). Pick Condition A (0.1–0.8 mm/s) or Condition B (> 50 mm/s) — a result taken in between belongs to neither condition.',
        when: (_i, o) => (o['shearSpeedClass'] ?? 0) === 2,
      },
      {
        id: 'PKG-X3', tone: 'warn',
        ko: '관심사에 맞지 않는 전단속도입니다. Table 4.1 은 관심사별 권장 속도를 정하고, §4.7 은 고속 관심사(패드 리프트·크레이터링·취성 파단·기계적 충격)에 저속 시험을 대체하면 오해를 낳는다고 명시합니다.',
        en: 'The shear speed does not match the concern. Table 4.1 prescribes a speed per concern, and §4.7 warns that substituting a low-speed test for a high-speed concern is misleading.',
        when: (_i, o) => (o['speedMatchesConcern'] ?? 0) < 1 && (o['shearSpeedClass'] ?? 0) !== 2,
      },
      {
        id: 'PKG-X4', tone: 'warn',
        ko: '리플로우 후 경과시간이 규격 창을 벗어났습니다 — SnPb 는 1~4 h, 무연은 1~24 h 입니다(§4.12). 금속간화합물이 계속 자라므로 언제 시험했는지가 결과를 바꿉니다.',
        en: 'The elapsed time after reflow is outside the window — 1–4 h for SnPb, 1–24 h for lead-free (§4.12). Intermetallics keep growing, so when you test changes what you measure.',
        when: (_i, o) => (o['elapsedWithinWindow'] ?? 0) < 1,
      },
      {
        id: 'PKG-X5', tone: 'stop',
        ko: '다이 전단력이 요구치에 미달합니다. MIL-STD-883K METHOD 2019.10 FIGURE 2019-4 는 면적 구간별 최소 전단력을 정합니다 — 이쪽은 솔더볼 전단과 달리 수치 합격기준이 존재하는 시험입니다.',
        en: 'The die shear force is below the requirement. MIL-STD-883K METHOD 2019.10 FIGURE 2019-4 sets a minimum per area band — unlike solder ball shear, this test does have numeric acceptance criteria.',
        when: (_i, o) => (o['dieShearMarginKg'] ?? 0) < 0,
      },
      {
        id: 'PKG-X6', tone: 'hint',
        ko: '면적이 64 ×10⁻⁴ in² 를 넘으면 요구치가 2.5 kg 로 고정됩니다. 직전 비례값(0.04 × 64 = 2.56 kg)보다 오히려 낮아지는 실재하는 불연속이며, 표준에 없는 매끈함을 기대하면 틀립니다.',
        en: 'Above 64 ×10⁻⁴ in² the requirement is fixed at 2.5 kg — slightly lower than the proportional value just below it (0.04 × 64 = 2.56 kg). The discontinuity is real; do not expect a smoothness the standard never had.',
        when: (i) => (i['dieAreaUnits'] ?? 0) > 64,
      },
    ],
    tradeoffs: [
      {
        ko: '고속 전단(Condition B) → 패드 리프트·크레이터링·취성 파단 같은 계면 약점을 드러낸다(좋음) / 솔더 벌크 강도를 보려는 목적에는 맞지 않는다 — 관심사와 속도는 한 쌍으로 정해야 한다.',
        en: 'High-speed shear (Condition B) exposes interfacial weaknesses such as pad lift, cratering and brittle fracture (good) but is wrong for probing bulk solder strength — concern and speed must be chosen as a pair.',
      },
      {
        ko: '리플로우 직후 시험 → 라인 회전이 빠르다(좋음) / 1 h 미만이면 금속간화합물이 아직 안정되지 않아 결과가 흔들린다(나쁨). 반대로 너무 늦으면 SnPb 4 h · 무연 24 h 창을 벗어난다.',
        en: 'Testing right after reflow keeps the line moving (good) but under 1 h the intermetallics have not settled and results scatter (bad); too late and you fall outside the 4 h SnPb / 24 h lead-free window.',
      },
      {
        ko: '다이 면적↑ → 요구 전단력이 비례해 커지다가 64 ×10⁻⁴ in² 를 넘으면 2.5 kg 로 고정된다 — 큰 다이일수록 단위면적당 요구는 오히려 완화된다. 대신 큰 다이는 접합 보이드·휨의 위험이 커진다.',
        en: 'A larger die raises the required shear force proportionally until 64 ×10⁻⁴ in², where it caps at 2.5 kg — so per unit area the requirement relaxes for big dies, while void and warpage risk grows.',
      },
      {
        ko: '🔴 합격기준이 있는 시험(다이 전단)과 없는 시험(솔더볼 전단)을 섞으면, 없는 기준을 지어내게 된다. 규격을 읽을 줄 아는 것이 이 실습의 목표다.',
        en: 'Mixing a test that has acceptance criteria (die shear) with one that does not (solder ball shear) ends in inventing a criterion. Reading the standard correctly is the objective here.',
      },
    ],
  },
];
