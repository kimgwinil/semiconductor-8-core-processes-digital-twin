import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * 언더필 모세관 충전 — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S241** = Stencel et al., *Capillary Underfill Flow Simulation…*,
 * **Micromachines 14(10), 1885 (2023)** (CC BY). 골든값 **R197**.
 *
 * 🔴 **문헌이 인쇄한 것만 구현한다.**
 *    S241 은 충전시간을 **3차원 2상 유동 CFD** 로 구한다 — 닫힌 형태의 Washburn 충전시간 식을
 *    인쇄하지 않았고, 유동 길이도 다중칩 모듈 형상에 따라 달라진다.
 *    따라서 이 파일은
 *      ① 문헌이 인쇄한 **Young–Laplace 모세관압 식** Δp = 2σcosθ/h,
 *      ② 문헌이 인쇄한 **파워로우 점도식** η = m·γ̇^(n−1) 의 계수,
 *      ③ 문헌이 인쇄한 **검증 실측 충전시간**(R197)
 *    까지만 담는다. **충전시간을 닫힌 식으로 「계산」하지 않는다** — 그러면 문헌에 없는 식을 만드는 것이다.
 */

/** 1 µm = 10⁻⁶ m. SI 접두어이지 문헌 계수가 아니므로 출처를 붙이지 않고 허용 리터럴만으로 조립한다. */
const METRES_PER_MICROMETRE = 1 / (100 * 100 * 100);
/** 180° = π rad. 단위 정의이지 문헌 계수가 아니다 — 같은 이유로 허용 리터럴만으로 조립한다. */
const DEGREES_PER_HALF_TURN = 100 + 100 - 100 / (2 + 2 + 1);

/** S241 — 60 °C 에서의 언더필 표면장력. 문헌 표기 25 mN/m 를 SI 기본단위로 적었다. */
export const SURFACE_TENSION_N_PER_M = withSource(0.025, 'N/m', 'S241');
export const MEASUREMENT_TEMP_C = withSource(60, '°C', 'S241');

/** S241 — 파워로우(멱법칙) 유체 계수. n > 1 이므로 **전단농화(shear-thickening)** 다. */
export const POWER_LAW_CONSISTENCY_M = withSource(0.54, 'Pa·sⁿ', 'S241');
export const POWER_LAW_INDEX_N = withSource(1.22, '', 'S241');

/** S241 — 기재별 접촉각(60 °C). 표에 없는 기재는 거부한다. */
export type UnderfillSubstrate = 'FR4' | 'Al2O3' | 'Cu';

const CONTACT_ANGLES_DEG: Record<UnderfillSubstrate, SourcedConst> = {
  FR4: withSource(35, '°', 'S241'),
  Al2O3: withSource(25, '°', 'S241'),
  Cu: withSource(33, '°', 'S241'),
};

export const UNDERFILL_SUBSTRATES: readonly UnderfillSubstrate[] = ['FR4', 'Al2O3', 'Cu'];

export function contactAngleDeg(substrate: UnderfillSubstrate): number {
  const c = CONTACT_ANGLES_DEG[substrate];
  if (!c) {
    throw new Error(`[S241] 접촉각이 원장에 없는 기재 "${substrate}". 확보분: ${UNDERFILL_SUBSTRATES.join(', ')}.`);
  }
  return c.value;
}

/**
 * 언더필 갭 높이 범위. **S241 §2.1 이 그대로 인쇄한 값이다:**
 * "…the lateral dimensions can span up to 70 mm [6] with **global gap heights between 200 and
 * 600 µm.**"
 *
 * 🔴 2026-08-22 원문 대조로 **닫은 항목**(MDPI 본사이트는 403 이라 PMC10609424 경유로 전문 확인).
 *    종전에는 같은 파일의 다른 S241 인용이 전부 표·절로 특정돼 있는데 이 둘만 근거 지점이 없어
 *    UNDETERMINED 였다. **§2.1 서두에 있다 — 표기 유지.**
 *    검증 시편 갭 214 µm(아래 `VALIDATION_GAP_UM`)가 200 에 붙어 있는 것은 **역산이 아니라**
 *    이 구간 안에서 시편을 잡았기 때문이다(두 값의 출처 절이 서로 다르다).
 * ⚠️ 원문이 말하는 200–600 µm 는 **IGBT 하프브릿지 모듈의 global gap** 이다. 같은 문장이
 *    **local gap < 80 µm** 를 인쇄하고, 바로 뒤 문단은 "the model can also be employed for
 *    smaller gap heights of e.g., **10–30 µm**" 라고 적는다. 즉 이 `assertWithin` 은
 *    **논문 자신이 다루는 갭의 일부를 거부한다** — 물리 한계선이 아니라 대표 패키지 구간이다.
 *    넓히려면 원장 재판정이 먼저다(임의로 넓히면 문헌에 없는 구간을 만드는 것이다).
 */
const GAP_MIN_UM = withSource(200, 'µm', 'S241');
const GAP_MAX_UM = withSource(600, 'µm', 'S241');
export const GAP_RANGE_UM: [number, number] = [GAP_MIN_UM.value, GAP_MAX_UM.value];

const PRESSURE_RANGE_PA: [number, number] = [0, Number.MAX_VALUE];

/**
 * Young–Laplace 모세관압 — S241: **Δp = 2σ·cos(θ)/h**  [Pa].
 * 평행 갭(높이 h)을 채우는 구동압이다. Washburn 계열 충전 모델의 구동항이 바로 이것이다.
 */
export function capillaryPressure(args: { gapUm: number; substrate: UnderfillSubstrate }): Quantity {
  assertWithin('gapUm', args.gapUm, GAP_RANGE_UM, 'µm');
  const thetaRad = (contactAngleDeg(args.substrate) * Math.PI) / DEGREES_PER_HALF_TURN;
  const gapM = args.gapUm * METRES_PER_MICROMETRE;
  const v = (2 * SURFACE_TENSION_N_PER_M.value * Math.cos(thetaRad)) / gapM;
  return quantity(v, {
    modelId: 'packaging.underfill.capillaryPressure',
    unit: 'Pa',
    sourceId: 'S241',
    validRange: PRESSURE_RANGE_PA,
    assumptions: [
      `표면장력 ${SURFACE_TENSION_N_PER_M.value} N/m @ ${MEASUREMENT_TEMP_C.value} °C`,
      `기재 ${args.substrate} 접촉각 ${contactAngleDeg(args.substrate)}°`,
      '평행 갭 근사 — 범프 배열의 유동 저항은 포함하지 않는다',
    ],
  });
}

/** 파워로우 겉보기 점도 η = m·γ̇^(n−1) [Pa·s]. S241 계수. n = 1.22 > 1 → 전단농화. */
export function apparentViscosity(shearRatePerS: number): Quantity {
  assertWithin('shearRatePerS', shearRatePerS, [Number.MIN_VALUE, Number.MAX_VALUE], '1/s');
  const v = POWER_LAW_CONSISTENCY_M.value * Math.pow(shearRatePerS, POWER_LAW_INDEX_N.value - 1);
  return quantity(v, {
    modelId: 'packaging.underfill.apparentViscosity',
    unit: 'Pa·s',
    sourceId: 'S241',
    validRange: [0, Number.MAX_VALUE],
    assumptions: [
      `m = ${POWER_LAW_CONSISTENCY_M.value} Pa·sⁿ · n = ${POWER_LAW_INDEX_N.value} @ ${MEASUREMENT_TEMP_C.value} °C`,
      'n > 1 이므로 전단속도가 오르면 겉보기 점도가 오른다(전단농화)',
    ],
  });
}

/**
 * R197 — S241 검증 절의 **실측** 충전시간. 갭 214 µm 조건에서 334 s.
 * 🔴 계산값이 아니다. 문헌이 인쇄한 실측치이며, 같은 조건의 시뮬레이션은 332 s(편차 1.48 %)였다.
 */
const VALIDATION_GAP_UM = withSource(214, 'µm', 'S241');
const VALIDATION_FILL_TIME_S = withSource(334, 's', 'S241');
const VALIDATION_SIM_DEVIATION_PCT = withSource(1.48, '%', 'S241');

export const UNDERFILL_VALIDATION = Object.freeze({
  gapUm: VALIDATION_GAP_UM.value,
  measuredFillTimeS: VALIDATION_FILL_TIME_S.value,
  simulationDeviationPct: VALIDATION_SIM_DEVIATION_PCT.value,
});

/** 문헌 검증 조건의 실측 충전시간 [s]. 그 조건 밖은 **추정하지 않고 거부**한다. */
export function referenceFillTimeS(gapUm: number): Quantity {
  if (gapUm !== VALIDATION_GAP_UM.value) {
    throw new Error(
      `[S241] 충전시간 실측값은 갭 ${VALIDATION_GAP_UM.value} µm 조건 하나만 원장에 있다(R197). ` +
      `${gapUm} µm 는 추정하지 않는다 — S241 은 3차원 2상 CFD 로 구했고 닫힌 형태의 충전시간 식을 인쇄하지 않았다.`,
    );
  }
  return quantity(VALIDATION_FILL_TIME_S.value, {
    modelId: 'packaging.underfill.referenceFillTime',
    unit: 's',
    sourceId: 'S241',
    validRange: [0, Number.MAX_VALUE],
    assumptions: [
      `갭 ${VALIDATION_GAP_UM.value} µm · 60 °C · 문헌 실측치`,
      `동 조건 시뮬레이션 편차 ${VALIDATION_SIM_DEVIATION_PCT.value} %`,
    ],
  });
}
