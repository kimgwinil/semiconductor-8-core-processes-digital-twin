import { assertWithin, quantity, withSource, type Quantity } from '../../contract';
import { CM3_PER_M3, MM_PER_CM } from '../units';

/**
 * 식각 플라즈마의 기본 파라미터 — **물리층. 합성 계수 0건.**
 *
 *  · 드바이 길이 `λ_D[cm] = 7.43×10²·√(T_e[eV]/n_e[cm⁻³])`
 *  · 전자 플라즈마 주파수 `ω_pe[s⁻¹] = 5.64×10⁴·√(n_e[cm⁻³])`
 *  · 드바이구 입자수 `N = n_e·λ_D³`
 * 실용식과 계수는 **S165(2019 NRL Plasma Formulary) p.27–28**. 검산은 원장 **R140**.
 * 프로브 실측 대조는 **S163 Table I** (원장 **R139**).
 *
 * ⚠️ **S163 은 hollow-cathode 소스이며 식각 장비가 아니다.** 이 값을 「식각기 실측」이라 표기하지 않는다.
 * ⚠️ **S163 Table I 의 ID=6A 행과 α·t_CL 열은 쓰지 않는다** — 6A 만 재계산과 3.9 % 어긋나고,
 *    α 열은 본문 α 가 아니라 상수 0.715 로 계산돼 있다(원장 명시). 이 파일에 그 행·열은 없다.
 * ⛔ Bohm 전류(Γ = 0.6065·n_s·u_B)는 **구현하지 않는다** — 식 형태의 확인 경로가 S171(MIT OCW,
 *    CC BY-NC-SA)뿐이라 상업 사용 불가이며, 원장에 다른 근거가 없다.
 */

/** λ_D[cm] = 7.43×10²·√(T_e[eV]/n_e[cm⁻³]). S165 p.27–28 실용식. */
const NRL_DEBYE_COEFF = withSource(7.43e2, 'cm·(eV/cm⁻³)^-1/2', 'S165');

/** ω_pe[s⁻¹] = 5.64×10⁴·√(n_e[cm⁻³]). S165 p.27–28 실용식. */
const NRL_PLASMA_FREQ_COEFF = withSource(5.64e4, 's⁻¹·cm^3/2', 'S165');

/** 밀도 하한 — S163 Table I 최솟값 1.09×10¹⁴ m⁻³. */
const NE_MIN_M3 = withSource(1.09e14, 'm⁻³', 'S163');
/** 밀도 상한 — S165 p.27–28 예제 조건 n = 10¹⁴ cm⁻³ = 10²⁰ m⁻³. */
const NE_MAX_M3 = withSource(1e20, 'm⁻³', 'S165');
export const NE_RANGE_M3: [number, number] = [NE_MIN_M3.value, NE_MAX_M3.value];

/** 전자온도 하한 — S165 예제 조건 1 eV. */
const TE_MIN_EV = withSource(1, 'eV', 'S165');
/** 전자온도 상한 — S163 Table I 최댓값 4.26 eV. */
const TE_MAX_EV = withSource(4.26, 'eV', 'S163');
export const TE_RANGE_EV: [number, number] = [TE_MIN_EV.value, TE_MAX_EV.value];

/** S163 의 프로브 반경. 원장 R139 의 r_probe/λ_D 대조에 쓴다. */
export const PROBE_RADIUS_MM = withSource(12.7, 'mm', 'S163');

function debyeLengthCm(neM3: number, teEv: number): number {
  const neCm3 = neM3 / CM3_PER_M3;
  return NRL_DEBYE_COEFF.value * Math.sqrt(teEv / neCm3);
}

/** 유효범위 상한은 입력 구간의 양 끝에서 파생한다 — 출처 없는 리터럴을 만들지 않는다. */
const DEBYE_MAX_MM = debyeLengthCm(NE_MIN_M3.value, TE_MAX_EV.value) * MM_PER_CM;
const DEBYE_MIN_MM = debyeLengthCm(NE_MAX_M3.value, TE_MIN_EV.value) * MM_PER_CM;

/** 드바이 길이 λ_D. S165 p.27–28. */
export function debyeLength(args: { neM3: number; teEv: number }): Quantity {
  assertWithin('neM3', args.neM3, NE_RANGE_M3, 'm⁻³');
  assertWithin('teEv', args.teEv, TE_RANGE_EV, 'eV');
  return quantity(debyeLengthCm(args.neM3, args.teEv) * MM_PER_CM, {
    modelId: 'etch.plasma.debyeLength',
    unit: 'mm',
    sourceId: 'S165',
    validRange: [0, DEBYE_MAX_MM],
    assumptions: [
      'NRL 실용식 (T_e 는 eV, n_e 는 cm⁻³ 로 환산해 계산한다)',
      '⚠️ 대조 실측(S163)은 hollow-cathode 소스이며 식각 장비가 아니다',
    ],
  });
}

/** 전자 플라즈마 주파수 ω_pe. S165 p.27–28. */
export function electronPlasmaFrequency(neM3: number): Quantity {
  assertWithin('neM3', neM3, NE_RANGE_M3, 'm⁻³');
  const neCm3 = neM3 / CM3_PER_M3;
  return quantity(NRL_PLASMA_FREQ_COEFF.value * Math.sqrt(neCm3), {
    modelId: 'etch.plasma.electronPlasmaFrequency',
    unit: 's⁻¹',
    sourceId: 'S165',
    validRange: [0, NRL_PLASMA_FREQ_COEFF.value * Math.sqrt(NE_MAX_M3.value / CM3_PER_M3)],
    assumptions: ['각주파수(rad/s). 2π 로 나누지 않은 값이다'],
  });
}

/** 드바이구 입자수 N = n_e·λ_D³ — 플라즈마 성립 조건(N ≫ 1). S165 p.27–28 · 원장 R140. */
export function debyeSphereCount(args: { neM3: number; teEv: number }): Quantity {
  assertWithin('neM3', args.neM3, NE_RANGE_M3, 'm⁻³');
  assertWithin('teEv', args.teEv, TE_RANGE_EV, 'eV');
  const neCm3 = args.neM3 / CM3_PER_M3;
  const lamCm = debyeLengthCm(args.neM3, args.teEv);
  const maxCount = (NE_MIN_M3.value / CM3_PER_M3) * Math.pow(DEBYE_MAX_MM / MM_PER_CM, 2 + 1);
  return quantity(neCm3 * Math.pow(lamCm, 2 + 1), {
    modelId: 'etch.plasma.debyeSphereCount',
    unit: '',
    sourceId: 'S165',
    validRange: [0, maxCount],
    assumptions: ['N = n·λ_D³ (구 부피계수 4π/3 을 곱하지 않은 형태 — 원장 R140 과 같은 정의)'],
  });
}

/**
 * 프로브 반경 / 드바이 길이 — S163 Table I 이 인쇄한 무차원 비. 원장 R139.
 * ⚠️ Table I 의 **ID=6A 행은 대조에 쓰지 않는다**(원장 명시).
 */
export function probeToDebyeRatio(args: { neM3: number; teEv: number }): Quantity {
  const lam = debyeLength(args);
  return quantity(PROBE_RADIUS_MM.value / lam.value, {
    modelId: 'etch.plasma.probeToDebyeRatio',
    unit: '',
    sourceId: 'S163',
    validRange: [0, PROBE_RADIUS_MM.value / DEBYE_MIN_MM],
    assumptions: [`r_probe = ${PROBE_RADIUS_MM.value} mm (S163)`],
  });
}
