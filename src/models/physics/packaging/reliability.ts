import { assertWithin, quantity, withSource, type Quantity } from '../../contract';
import { BOLTZMANN_EV_PER_K } from '../constants';

/**
 * 번인 가속계수 · 초기고장률(ELFR) — **물리층. 합성 계수 0건.**
 * 출처: 후공정 원장 **S54** = JEDEC **JESD74A**, *Early Life Failure Rate Calculation Procedure*.
 * 골든값 **R13**(A_T·A_V·A) · **R14**(FIT) · **R15**(ppm 3구간) · **R16**(k 채택값).
 *
 * 🔴 온도는 **켈빈으로 받는다.** JESD74A Annex A 자체가 70 °C→343 K, 130 °C→403 K 로 계산한다.
 *    °C↔K 오프셋(273 vs 273.15)은 원장이 **공개 출처로 확정하지 못한 항목**이므로
 *    물리층에서 환산하지 않고 **호출자가 켈빈으로 준다.**
 */

/**
 * 볼츠만 상수. 🔴 표준 간 반올림 차이가 있다 —
 * JESD91B §2 는 8.62×10⁻⁵, **JESD74A 식 [1] 은 8.617×10⁻⁵**. AF 가 0.24 % 어긋난다.
 * 원장이 **8.617×10⁻⁵ 채택 · 허용오차 ±0.5 %** 로 못박았다(R16).
 */
/* 🔴 2026-08-22 — 정본은 `../constants` 로 옮겼고 여기서는 **다시 내보내기만** 한다.
 *    (기존 import 경로를 쓰는 테스트·호출부가 그대로 동작한다.) */
export { BOLTZMANN_EV_PER_K };

const POSITIVE_RANGE: [number, number] = [Number.MIN_VALUE, Number.MAX_VALUE];
const NON_NEGATIVE_RANGE: [number, number] = [0, Number.MAX_VALUE];

/** S54 §4.3 — 번인 지속시간 통상 실무 범위. 밖은 실증적 모델 정당화가 필요하다. */
const BURN_IN_MIN_H = withSource(48, 'h', 'S54');
const BURN_IN_MAX_H = withSource(168, 'h', 'S54');
export const BURN_IN_HOURS_RANGE: [number, number] = [BURN_IN_MIN_H.value, BURN_IN_MAX_H.value];

/** S54 §4.1 — 최소 신뢰수준 60 % · 연속되지 않은 3로트 이상 · 단일 로트 40 % 이하. */
export const ELFR_MIN_CONFIDENCE = withSource(60, '%', 'S54');
export const ELFR_MIN_LOTS = withSource(3, 'lot', 'S54');
export const ELFR_MAX_SINGLE_LOT_SHARE = withSource(40, '%', 'S54');

/** S54 Annex J Table J.1 — 60 % 신뢰, 고장 2건(자유도 6). **원장이 확보한 유일한 χ² 값이다.** */
export const CHI_SQUARE_60PCT_2_FAILURES = withSource(6.21, '', 'S54');

/** S54 §5 식 [1] — 온도 가속계수 A_T = exp[(E_aa/k)(1/T_U − 1/T_A)]. */
export function temperatureAccelerationFactor(args: {
  activationEnergyEv: number; tUseK: number; tStressK: number;
}): Quantity {
  assertWithin('activationEnergyEv', args.activationEnergyEv, NON_NEGATIVE_RANGE, 'eV');
  assertWithin('tUseK', args.tUseK, POSITIVE_RANGE, 'K');
  assertWithin('tStressK', args.tStressK, POSITIVE_RANGE, 'K');
  const v = Math.exp(
    (args.activationEnergyEv / BOLTZMANN_EV_PER_K.value) * (1 / args.tUseK - 1 / args.tStressK),
  );
  return quantity(v, {
    modelId: 'packaging.burnIn.temperatureAF',
    unit: '',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
    assumptions: [
      '온도는 **접합온도**다 — 주위온도가 아니다(S54 식 [1] 정의)',
      `k = ${BOLTZMANN_EV_PER_K.value} eV/K 채택(R16)`,
    ],
  });
}

/** S54 §5 식 [2] — 전압 가속계수 A_V = exp[γ_V (V_A − V_U)]. */
export function voltageAccelerationFactor(args: {
  gammaVPerVolt: number; vStress: number; vUse: number;
}): Quantity {
  assertWithin('gammaVPerVolt', args.gammaVPerVolt, NON_NEGATIVE_RANGE, '1/V');
  assertWithin('vStress', args.vStress, NON_NEGATIVE_RANGE, 'V');
  assertWithin('vUse', args.vUse, NON_NEGATIVE_RANGE, 'V');
  const v = Math.exp(args.gammaVPerVolt * (args.vStress - args.vUse));
  return quantity(v, {
    modelId: 'packaging.burnIn.voltageAF',
    unit: '',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
    assumptions: ['실험으로 검증된 전압 가속모델이 없을 때 표준이 권장하는 형태(S54 식 [2])'],
  });
}

/** S54 §5 식 [3] — 총 가속계수 A = A_T × A_V. */
export function totalAccelerationFactor(args: {
  activationEnergyEv: number; tUseK: number; tStressK: number;
  gammaVPerVolt: number; vStress: number; vUse: number;
}): Quantity {
  const at = temperatureAccelerationFactor(args).value;
  const av = voltageAccelerationFactor(args).value;
  return quantity(at * av, {
    modelId: 'packaging.burnIn.totalAF',
    unit: '',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
  });
}

/** S54 §5 식 [4] — 등가 사용조건 시간 t_U = A × t_A. */
export function equivalentUseHours(args: { accelerationFactor: number; testHours: number }): Quantity {
  assertWithin('accelerationFactor', args.accelerationFactor, POSITIVE_RANGE, '');
  assertWithin('testHours', args.testHours, BURN_IN_HOURS_RANGE, 'h');
  return quantity(args.accelerationFactor * args.testHours, {
    modelId: 'packaging.burnIn.equivalentUseHours',
    unit: 'h',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
    assumptions: [`번인 지속시간 ${BURN_IN_MIN_H.value}–${BURN_IN_MAX_H.value} h 범위 안에서만 계산한다(§4.3)`],
  });
}

/**
 * S54 §5.1.1 식 [6] — ELFR(FIT) = 10⁹ × χ²_{c,d} / (2 × A × N × t_A).
 * χ² 는 **호출자가 준다.** 원장이 확보한 χ² 는 60 % 신뢰·고장 2건의 6.21 하나뿐이므로
 * 표를 물리층에 심지 않는다(원장 규칙 1).
 */
const FIT_PER_FAILURE_PER_DEVICE_HOUR = withSource(1e9, 'FIT·device·h', 'S54');

export function elfrFit(args: {
  chiSquare: number; accelerationFactor: number; sampleSize: number; testHours: number;
}): Quantity {
  assertWithin('chiSquare', args.chiSquare, POSITIVE_RANGE, '');
  assertWithin('accelerationFactor', args.accelerationFactor, POSITIVE_RANGE, '');
  assertWithin('sampleSize', args.sampleSize, POSITIVE_RANGE, 'ea');
  assertWithin('testHours', args.testHours, BURN_IN_HOURS_RANGE, 'h');
  const deviceHours = 2 * args.accelerationFactor * args.sampleSize * args.testHours;
  const v = (FIT_PER_FAILURE_PER_DEVICE_HOUR.value * args.chiSquare) / deviceHours;
  return quantity(v, {
    modelId: 'packaging.elfr.fit',
    unit: 'FIT',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
    assumptions: [
      '지수분포(일정 고장률) 가정 — 와이불 형상모수 m ≠ 1 이면 FIT 로 표현할 수 없다(§5.2)',
      `상측 신뢰한계. 표준 권장 신뢰수준 ${ELFR_MIN_CONFIDENCE.value} %`,
    ],
  });
}

/** S54 §5.1.1 식 [12] — ELFR(ppm/t_ELF) = t_ELF × 10⁻³ × ELFR(FIT). */
const PPM_PER_FIT_HOUR = withSource(1e-3, 'ppm/(FIT·h)', 'S54');

export function elfrPpm(args: { fit: number; earlyLifePeriodH: number }): Quantity {
  assertWithin('fit', args.fit, NON_NEGATIVE_RANGE, 'FIT');
  assertWithin('earlyLifePeriodH', args.earlyLifePeriodH, POSITIVE_RANGE, 'h');
  const v = args.earlyLifePeriodH * PPM_PER_FIT_HOUR.value * args.fit;
  return quantity(v, {
    modelId: 'packaging.elfr.ppm',
    unit: 'ppm',
    sourceId: 'S54',
    validRange: NON_NEGATIVE_RANGE,
    assumptions: ['ppm 은 지정한 초기수명 구간에만 적용된다 — 구간을 함께 표기해야 한다(§5.1.1)'],
  });
}

/**
 * S54 §5.2 — 와이불 형상모수 m 이 1 이 아니면 고장률이 일정하지 않으므로 **FIT 로 표현할 수 없다.**
 * 초기고장은 m < 1 이다.
 */
export function fitIsExpressible(weibullShapeM: number): boolean {
  assertWithin('weibullShapeM', weibullShapeM, POSITIVE_RANGE, '');
  return weibullShapeM === 1;
}
