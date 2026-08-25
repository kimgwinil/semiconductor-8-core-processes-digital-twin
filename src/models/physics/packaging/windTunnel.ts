import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * 강제 공랭 열저항 θ_JMA 의 **시험 환경 규격** — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S255** = JEDEC **JESD51-6**, *Integrated Circuit Thermal Test Method Environmental
 * Conditions — Forced Convection (Moving Air)*. 골든값 **R203**.
 *
 * 🔴 **이 파일은 v → θ_JMA 를 계산하지 않는다.**
 *    JESD51-6 은 θ_JMA 를 **측정 결과**로 정의할 뿐(식 (1) `θ_JMA = (T_J − T_A)/P_H`),
 *    풍속으로부터 열저항을 예측하는 식을 인쇄하지 않았다.
 *    대류 열전달계수 합성식(`h = 10 + 12·v` 류)은 **두 원장 어디에도 없다** —
 *    여기에 넣으면 A15 위반이다. 이 파일이 다루는 것은 **「그 측정이 규격에 맞게 이뤄졌는가」** 뿐이다.
 *
 * 🔴 **지표명이 갈리는 자리다.** 같은 식 `(T_J − T_A)/P_H` 라도
 *    정지 공기(v = 0)에서 재면 **θ_JA**(JESD51-2A · 원장 S247),
 *    움직이는 공기(v > 0)에서 재면 **θ_JMA**(JESD51-6 · 원장 S255)다.
 *    값이 아니라 **이름과 소관 규격**이 바뀐다.
 */

const VELOCITY_RANGE: [number, number] = [0, Number.MAX_VALUE];
const PERCENT_RANGE: [number, number] = [0, Number.MAX_VALUE];

/* ─────────────────── §4.1 풍동 유속 범위 ─────────────────── */

/** S255 §4.1 — 풍동 유속은 **10 m/s 미만**이어야 한다(엄격부등호). */
const MAX_TUNNEL_VELOCITY = withSource(10, 'm/s', 'S255');
export const TUNNEL_VELOCITY_LIMIT_M_PER_S = MAX_TUNNEL_VELOCITY.value;

/** S255 — **2 m/s 를 넘으면 소자 방향(orientation)에 대한 의존성이 사라진다.** */
const DIRECTION_INDEPENDENT_ABOVE = withSource(2, 'm/s', 'S255');
export const DIRECTION_INDEPENDENT_ABOVE_M_PER_S = DIRECTION_INDEPENDENT_ABOVE.value;

/* ─────────────── §4.1.1~§4.1.4 유동 품질 4항목 ─────────────── */

/** S255 §4.1.1 — 중앙 90 % 단면에서 유속 균일도 ±5 %. */
const UNIFORMITY_CORE_PCT = withSource(90, '%', 'S255');
const UNIFORMITY_TOLERANCE_PCT = withSource(5, '%', 'S255');
/** S255 §4.1.2 — 스월(선회) 5 % 미만. */
const MAX_SWIRL_PCT = withSource(5, '%', 'S255');
/** S255 §4.1.3 — 난류도 2 % 미만. */
const MAX_TURBULENCE_PCT = withSource(2, '%', 'S255');
/** S255 §4.1.4 — 비정상성 5 % 미만. */
const MAX_UNSTEADINESS_PCT = withSource(5, '%', 'S255');

export const FLOW_QUALITY_LIMITS = Object.freeze({
  uniformityCorePct: UNIFORMITY_CORE_PCT.value,
  uniformityTolerancePct: UNIFORMITY_TOLERANCE_PCT.value,
  swirlPct: MAX_SWIRL_PCT.value,
  turbulencePct: MAX_TURBULENCE_PCT.value,
  unsteadinessPct: MAX_UNSTEADINESS_PCT.value,
});

/* ─────────────── §4.5.1 유속 측정 위치·기준 밀도 ─────────────── */

/**
 * S255 §4.5.1 — 유속은 **소자 상류(upstream)** 에서 측정한다.
 * 하류에서 재면 소자가 만든 후류(wake)가 섞여 다른 값이 나온다.
 */
export const VELOCITY_MEASUREMENT_LOCATION = 'upstream';

/** S255 §4.5.1 — 보고 유속은 **기준 공기밀도 1.2 kg/m³** 로 환산한다. */
const REFERENCE_AIR_DENSITY = withSource(1.2, 'kg/m³', 'S255');
export const REFERENCE_AIR_DENSITY_KG_PER_M3 = REFERENCE_AIR_DENSITY.value;

/** 기준 밀도 1.2 kg/m³ 에 해당하는 두 등가 조건. S255 §4.5.1 이 함께 적었다. */
export const REFERENCE_AIR_CONDITIONS = Object.freeze({
  dryPressureKPa: withSource(101.325, 'kPa', 'S255').value,
  dryTempC: withSource(21, '°C', 'S255').value,
  humidTempC: withSource(20, '°C', 'S255').value,
  humidRhPct: withSource(50, '%RH', 'S255').value,
});

/* ─────────────────────── 판정 함수 ─────────────────────── */

/** v > 0 이면 지표는 θ_JMA 다. v = 0 이면 θ_JA 다. */
export function isMovingAir(velocityMPerS: number): boolean {
  assertWithin('velocityMPerS', velocityMPerS, VELOCITY_RANGE, 'm/s');
  return velocityMPerS > 0;
}

/** 지표명. 🔴 값이 아니라 **이름**이 바뀐다 — 이 제품이 가르려는 지점이다. */
export function thermalResistanceMetricName(velocityMPerS: number): 'θJA' | 'θJMA' {
  return isMovingAir(velocityMPerS) ? 'θJMA' : 'θJA';
}

/** 지표를 규정한 표준의 원장 번호. 화면 출처 배지가 이 값에 따라 바뀐다. */
export function thermalResistanceMetricSourceId(velocityMPerS: number): 'S247' | 'S255' {
  return isMovingAir(velocityMPerS) ? 'S255' : 'S247';
}

/** §4.1 — 풍동 유속이 규격 범위(10 m/s 미만) 안인가. */
export function velocityWithinTunnelRange(velocityMPerS: number): boolean {
  assertWithin('velocityMPerS', velocityMPerS, VELOCITY_RANGE, 'm/s');
  return velocityMPerS < MAX_TUNNEL_VELOCITY.value;
}

/** 소자 방향 의존성이 사라지는 구간(2 m/s 초과)인가. */
export function velocityIsDirectionIndependent(velocityMPerS: number): boolean {
  assertWithin('velocityMPerS', velocityMPerS, VELOCITY_RANGE, 'm/s');
  return velocityMPerS > DIRECTION_INDEPENDENT_ABOVE.value;
}

/**
 * §4.5.1 — 유속 측정 위치 적합성.
 * 🔴 정지 공기(v = 0)에는 잴 유동이 없으므로 이 요건이 적용되지 않는다.
 *    표준의 적용 범위를 넘겨 판정하지 않기 위해 명시적으로 분기한다.
 */
export function velocityMeasurementLocationValid(args: {
  velocityMPerS: number; measuredUpstream: boolean;
}): boolean {
  assertWithin('velocityMPerS', args.velocityMPerS, VELOCITY_RANGE, 'm/s');
  if (!isMovingAir(args.velocityMPerS)) return true;
  return args.measuredUpstream;
}

export interface FlowQualityVerdict {
  conforming: boolean;
  /** 위반한 항목의 사람이 읽는 사유. 비어 있으면 적합. */
  failures: string[];
}

/** §4.1.1~§4.1.4 유동 품질 4항목 동시 판정. 표준이 정한 상한만 쓴다. */
export function flowQualityConformance(args: {
  uniformityDeviationPct: number; swirlPct: number; turbulencePct: number; unsteadinessPct: number;
}): FlowQualityVerdict {
  assertWithin('uniformityDeviationPct', args.uniformityDeviationPct, PERCENT_RANGE, '%');
  assertWithin('swirlPct', args.swirlPct, PERCENT_RANGE, '%');
  assertWithin('turbulencePct', args.turbulencePct, PERCENT_RANGE, '%');
  assertWithin('unsteadinessPct', args.unsteadinessPct, PERCENT_RANGE, '%');
  const failures: string[] = [];
  if (args.uniformityDeviationPct > UNIFORMITY_TOLERANCE_PCT.value) {
    failures.push(
      `유속 균일도 ${args.uniformityDeviationPct} % — 중앙 ${UNIFORMITY_CORE_PCT.value} % 단면에서 ` +
      `±${UNIFORMITY_TOLERANCE_PCT.value} % 이내여야 한다 (§4.1.1)`,
    );
  }
  if (args.swirlPct >= MAX_SWIRL_PCT.value) {
    failures.push(`스월 ${args.swirlPct} % — ${MAX_SWIRL_PCT.value} % 미만이어야 한다 (§4.1.2)`);
  }
  if (args.turbulencePct >= MAX_TURBULENCE_PCT.value) {
    failures.push(`난류도 ${args.turbulencePct} % — ${MAX_TURBULENCE_PCT.value} % 미만이어야 한다 (§4.1.3)`);
  }
  if (args.unsteadinessPct >= MAX_UNSTEADINESS_PCT.value) {
    failures.push(`비정상성 ${args.unsteadinessPct} % — ${MAX_UNSTEADINESS_PCT.value} % 미만이어야 한다 (§4.1.4)`);
  }
  return { conforming: failures.length === 0, failures };
}

/** 규격 적합성을 0/1 로. 화면 판정·방향성 검사에서 쓴다. */
export function tunnelVelocityConformanceIndex(velocityMPerS: number): Quantity {
  return quantity(velocityWithinTunnelRange(velocityMPerS) ? 1 : 0, {
    modelId: 'packaging.windTunnel.velocityConformance',
    unit: '',
    sourceId: 'S255',
    validRange: [0, 1],
    assumptions: [
      `풍동 유속은 ${MAX_TUNNEL_VELOCITY.value} m/s 미만 (JESD51-6 §4.1)`,
      `보고 유속은 기준 공기밀도 ${REFERENCE_AIR_DENSITY.value} kg/m³ 로 환산한다 (§4.5.1)`,
      `유속은 소자 ${VELOCITY_MEASUREMENT_LOCATION} 에서 측정한다 (§4.5.1)`,
    ],
  });
}
