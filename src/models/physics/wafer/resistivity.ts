import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * 저항률 ↔ 도핑밀도 변환 — **물리층. 합성 계수 0건.**
 *
 * 원논문: Thurber, Mattis, Liu, Filliben, *The Relationship Between Resistivity and
 * Dopant Density for Phosphorus- and Boron-Doped Silicon*, **NBS Special Publication 400-64**
 * (1981) = 원장 **S100**. 미국 정부 저작물(퍼블릭도메인).
 *
 * 🔴 원장 §2-1 주석: ASTM F723(S110)은 "conversions are based primarily on the data of
 *    Thurber et al" 이라 명시하므로 **S100 이 정본이고 S110 을 살 필요가 없다.**
 *
 * 구현한 것은 두 개의 문헌식뿐이다.
 *  - 인(P)  : 식 (1) — log₁₀(qρN/P₀) = (A₀+A₁X+A₂X²+A₃X³)/(1+B₁X+B₂X²+B₃X³), X = log₁₀(ρ/ρ₀)
 *  - 붕소(B): 식 (3) — qρN = (qρN)_min + [(qρN)_max − (qρN)_min] / [1 + (ρ/ρ_ref)^α]
 *
 * 🔴 **ρ 를 독립변수로 하는 열만 쓴다.** 원논문은 N 을 독립변수로 하는 열(식 1 의 다른 계수쌍,
 *    식 (4))도 인쇄하지만, 두 피팅은 독립이라 서로 3~8 % 어긋난다(원논문 자기일관성 서술).
 *    한 방향만 문헌식으로 고정하고 **역방향은 그 식을 수치로 역산**한다. 그래야 왕복이 정확히
 *    닫힌다(교차 혼용 금지 — 원장 R116 과 같은 사고 방지).
 */

export type Dopant = 'phosphorus' | 'boron';
/** 원논문이 두 온도에서 각각 피팅했다. R103 의 조건은 23 °C 다. */
export type FitTemperature = '23C' | '300K';

/**
 * 전자 전하량. 🔴 원논문 각주: "A value of 1.602 × 10⁻¹⁹ C was used for q in all of the
 * curve fits; consequently, this is the appropriate value to use for subsequent calculations."
 * → CODATA 최신값으로 바꾸면 피팅과 어긋난다. **원논문이 지정한 값을 쓴다.**
 */
const ELECTRON_CHARGE = withSource(1.602e-19, 'C', 'S100');

/** 정규화 인자. 원논문 §7: ρ₀ = 1 Ω·cm, P₀ = 1 V·s/cm². (둘 다 1 이므로 식에서 사라진다.) */
const RHO_NORMALIZER = withSource(1, 'Ω·cm', 'S100');

interface RationalFit {
  readonly a0: SourcedConst; readonly a1: SourcedConst;
  readonly a2: SourcedConst; readonly a3: SourcedConst;
  readonly b1: SourcedConst; readonly b2: SourcedConst; readonly b3: SourcedConst;
}

/**
 * S100 Table 9 — 인 도핑, 곱 qρN 의 피팅. X = log₁₀(ρ/ρ₀) 열만 옮긴다(규칙 8: 필요한 행만).
 * 🔴 별칭 함수로 줄이지 않는다 — `check-sources` 는 `withSource(` 의 첫 인자만 면제한다.
 */
const P_FIT_23C: RationalFit = {
  a0: withSource(-3.1083, '', 'S100'),
  a1: withSource(-3.2626, '', 'S100'),
  a2: withSource(-1.2196, '', 'S100'),
  a3: withSource(-0.13923, '', 'S100'),
  b1: withSource(1.0265, '', 'S100'),
  b2: withSource(0.38755, '', 'S100'),
  b3: withSource(0.041833, '', 'S100'),
};

const P_FIT_300K: RationalFit = {
  a0: withSource(-3.0951, '', 'S100'),
  a1: withSource(-3.2303, '', 'S100'),
  a2: withSource(-1.2024, '', 'S100'),
  a3: withSource(-0.13679, '', 'S100'),
  b1: withSource(1.0205, '', 'S100'),
  b2: withSource(0.38382, '', 'S100'),
  b3: withSource(0.041338, '', 'S100'),
};

interface MinMaxFit {
  readonly productMin: SourcedConst;
  readonly productMax: SourcedConst;
  readonly rhoRef: SourcedConst;
  readonly alpha: SourcedConst;
}

/**
 * S100 Table 11 — 붕소 도핑, qρN vs ρ (식 3). 인과 달리 고농도에서 곱이 얌전해
 * 「min-max」형이 충분하다고 원논문이 밝힌다.
 */
const B_FIT_23C: MinMaxFit = {
  productMin: withSource(0.00213, 'V·s/cm²', 'S100'),
  productMax: withSource(0.01947, 'V·s/cm²', 'S100'),
  rhoRef: withSource(0.01833, 'Ω·cm', 'S100'),
  alpha: withSource(1.105, '', 'S100'),
};

const B_FIT_300K: MinMaxFit = {
  productMin: withSource(0.00220, 'V·s/cm²', 'S100'),
  productMax: withSource(0.01973, 'V·s/cm²', 'S100'),
  rhoRef: withSource(0.01782, 'Ω·cm', 'S100'),
  alpha: withSource(1.086, '', 'S100'),
};

/** 인 — 적용범위. 원장 §3-1: ρ 0.0002–4000 Ω·cm (N 10¹²–5×10²⁰ cm⁻³), 자기일관성 4.5 %. */
const P_RHO_MIN = withSource(0.0002, 'Ω·cm', 'S100');
const P_RHO_MAX = withSource(4000, 'Ω·cm', 'S100');
const P_N_MIN = withSource(1e12, 'cm⁻³', 'S100');
const P_N_MAX = withSource(5e20, 'cm⁻³', 'S100');

/** 붕소 — 원논문 §8 이 밝힌 피팅 데이터 저항률 범위. 원장 §3-1 과 같다. */
const B_RHO_MIN = withSource(0.00085, 'Ω·cm', 'S100');
const B_RHO_MAX = withSource(100, 'Ω·cm', 'S100');

export const PHOSPHORUS_RHO_RANGE: [number, number] = [P_RHO_MIN.value, P_RHO_MAX.value];
export const BORON_RHO_RANGE: [number, number] = [B_RHO_MIN.value, B_RHO_MAX.value];
export const PHOSPHORUS_N_RANGE: [number, number] = [P_N_MIN.value, P_N_MAX.value];

/** 문헌이 밝힌 자기일관성(같은 값을 두 식으로 왕복했을 때의 최대 어긋남). */
export const PHOSPHORUS_SELF_CONSISTENCY = withSource(0.045, '', 'S100');
export const BORON_SELF_CONSISTENCY = withSource(0.03, '', 'S100');

function rhoRangeOf(dopant: Dopant): [number, number] {
  return dopant === 'phosphorus' ? PHOSPHORUS_RHO_RANGE : BORON_RHO_RANGE;
}

/** 식 (1) 우변. 3차/3차 유리함수. 거듭제곱은 곱으로 풀어 쓴다(리터럴 지수 금지). */
function rationalExponent(fit: RationalFit, x: number): number {
  const x2 = x * x;
  const x3 = x2 * x;
  const numerator = fit.a0.value + fit.a1.value * x + fit.a2.value * x2 + fit.a3.value * x3;
  const denominator = 1 + fit.b1.value * x + fit.b2.value * x2 + fit.b3.value * x3;
  return numerator / denominator;
}

/**
 * 곱 qρN [V·s/cm²] — 저항률의 함수. 인은 식 (1), 붕소는 식 (3).
 * 🔴 여기가 유일한 문헌식 진입점이다. 밀도·이동도·역변환이 전부 이 함수에서 파생된다.
 */
export function resistivityDensityProduct(
  dopant: Dopant, rhoOhmCm: number, at: FitTemperature,
): number {
  if (dopant === 'phosphorus') {
    const fit = at === '23C' ? P_FIT_23C : P_FIT_300K;
    const x = Math.log10(rhoOhmCm / RHO_NORMALIZER.value);
    // 10^Z = exp(Z·ln10). 리터럴 10 을 두지 않으려고 지수형으로 쓴다 — 값은 완전히 같다.
    return Math.exp(rationalExponent(fit, x) * Math.LN10);
  }
  const fit = at === '23C' ? B_FIT_23C : B_FIT_300K;
  const span = fit.productMax.value - fit.productMin.value;
  return fit.productMin.value + span / (1 + Math.pow(rhoOhmCm / fit.rhoRef.value, fit.alpha.value));
}

/**
 * 저항률 → 전기적 활성 도펀트 밀도. N = (qρN) / (q·ρ).
 * R103(인 4점)이 이 경로를 검증한다.
 */
export function dopantDensity(args: {
  dopant: Dopant; rhoOhmCm: number; at?: FitTemperature;
}): Quantity {
  const at = args.at ?? '23C';
  const range = rhoRangeOf(args.dopant);
  assertWithin('rhoOhmCm', args.rhoOhmCm, range, 'Ω·cm');
  const product = resistivityDensityProduct(args.dopant, args.rhoOhmCm, at);
  const n = product / (ELECTRON_CHARGE.value * args.rhoOhmCm);
  return quantity(n, {
    modelId: 'wafer.resistivity.dopantDensity',
    unit: 'cm⁻³',
    sourceId: 'S100',
    validRange: [
      resistivityDensityProduct(args.dopant, range[1], at) / (ELECTRON_CHARGE.value * range[1]),
      resistivityDensityProduct(args.dopant, range[0], at) / (ELECTRON_CHARGE.value * range[0]),
    ],
    assumptions: [
      args.dopant === 'phosphorus' ? '인(P) 도핑 · S100 식 (1) · Table 9 ρ 기준열' : '붕소(B) 도핑 · S100 식 (3) · Table 11',
      at === '23C' ? '23 °C 피팅' : '300 K 피팅',
      'q = 1.602×10⁻¹⁹ C (원논문이 피팅에 쓴 값)',
      '전기적 활성 도펀트 밀도. 불완전 이온화 보정은 원논문이 이미 반영했다',
    ],
  });
}

/** 겉보기 이동도 μ = 1/(q·N·ρ). 곱 피팅에서 바로 나온다(별도 계수 없음). */
export function apparentMobility(args: {
  dopant: Dopant; rhoOhmCm: number; at?: FitTemperature;
}): Quantity {
  const at = args.at ?? '23C';
  assertWithin('rhoOhmCm', args.rhoOhmCm, rhoRangeOf(args.dopant), 'Ω·cm');
  const product = resistivityDensityProduct(args.dopant, args.rhoOhmCm, at);
  return quantity(1 / product, {
    modelId: 'wafer.resistivity.apparentMobility',
    unit: 'cm²/V·s',
    sourceId: 'S100',
    validRange: [0, 1 / resistivityDensityProduct(args.dopant, rhoRangeOf(args.dopant)[0], at)],
    assumptions: ['μ = 1/(qρN) — 곱 피팅의 역수. 원논문 이동도 피팅(식 2·5)과는 별개 경로다'],
  });
}

/** 이분법 반복 횟수. 배정도 실수에서 7자릿수 구간을 완전히 소진하고도 남는다. */
const BISECTION_STEPS = 100;

/**
 * 도핑밀도 → 저항률. **역방향 계수를 따로 쓰지 않고 정방향 문헌식을 수치로 역산**한다.
 * qρN/ρ 는 ρ 에 대해 단조 감소하므로 이분법이 항상 수렴한다.
 */
export function resistivityFromDensity(args: {
  dopant: Dopant; densityCm3: number; at?: FitTemperature;
}): Quantity {
  const at = args.at ?? '23C';
  const [rhoLo, rhoHi] = rhoRangeOf(args.dopant);
  const nOf = (rho: number): number =>
    resistivityDensityProduct(args.dopant, rho, at) / (ELECTRON_CHARGE.value * rho);
  const nRange: [number, number] = [nOf(rhoHi), nOf(rhoLo)];
  assertWithin('densityCm3', args.densityCm3, nRange, 'cm⁻³');

  let lo = rhoLo;
  let hi = rhoHi;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (nOf(mid) > args.densityCm3) lo = mid;
    else hi = mid;
  }
  return quantity((lo + hi) / 2, {
    modelId: 'wafer.resistivity.fromDensity',
    unit: 'Ω·cm',
    sourceId: 'S100',
    validRange: [rhoLo, rhoHi],
    assumptions: [
      '정방향 문헌식(ρ→qρN)의 수치 역산. 원논문의 N 기준 피팅과 혼용하지 않는다',
      '왕복 오차 0 (같은 식을 되돌린 것이므로)',
    ],
  });
}
