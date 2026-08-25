import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * PVD(스퍼터) — Yamamura 경험식의 **재현 가능한 중간량**만 구현한다. **물리층. 합성 계수 0건.**
 *
 * 서지 표기: **Matsunami, Yamamura, Itikawa et al., *At. Data Nucl. Data Tables* 31, 1 (1984)**
 * (= 원장 **S185**. 원장 주석대로 IPPJ-AM-32 예비판이 아니라 **정식 출판본**으로 인용한다.)
 * 골든값: 원장 **R158** — He⁺ → Cu, 1 keV, 수직입사.
 *
 * 🔴 **최종 수율 Y 는 구현하지 않는다.**
 *    ① 원장이 「최종 Y = 0.25 는 골든값이 아니다(문헌 샘플계산이 자기모순)」라고 못박았고,
 *    ② Y 계산에 필요한 α*(M₂/M₁) 계수식을 원장이 **형태로 제시하지 않아** 재현할 수 없다.
 *    지어내지 않고 `sputterYield()` 를 **명시적으로 던지는 인터페이스**로 남긴다.
 *
 * 🔴 아래 식의 계수는 전부 원장 R158 의 **인쇄된 중간값으로 역검증**했다:
 *    ε = 0.15921(원장 0.159) · s_n = 0.39199(원장 0.3920) · K = 8.781(원장 8.76) · E_th = 21.90 eV(원장 21.9).
 */

const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];

/** Lindhard 환산에너지 계수. E[eV] 를 무차원 ε 로 바꾼다. */
const REDUCED_ENERGY_COEFF = withSource(0.03255, '', 'S185');

/** Thomas–Fermi 핵정지능 근사식 s_n(ε) 의 계수 5종. */
const SN_NUM_COEFF = withSource(3.441, '', 'S185');
const SN_LOG_OFFSET = withSource(2.718, '', 'S185');
const SN_DEN_SQRT = withSource(6.355, '', 'S185');
const SN_DEN_LIN_SQRT = withSource(6.882, '', 'S185');
const SN_DEN_LIN = withSource(1.708, '', 'S185');

/** 핵정지단면 환산계수 K. */
const K_COEFF = withSource(8.478, '', 'S185');

/** 스퍼터 임계에너지식(경이온 M₁ < M₂ 분기)의 계수 3종. */
const ETH_CONST = withSource(1.9, '', 'S185');
const ETH_INV_COEFF = withSource(3.8, '', 'S185');
const ETH_POW_COEFF = withSource(0.134, '', 'S185');
const ETH_POW_EXP = withSource(1.24, '', 'S185');

/** Cu 표면결합에너지(승화열). R158 샘플계산이 쓰는 값. */
export const CU_SURFACE_BINDING_EV: number = withSource(3.49, 'eV', 'S185').value;

/** 원자번호로 만드는 Lindhard 차폐 항 √(Z₁^{2/3} + Z₂^{2/3}). 2/3 은 대수 지수다. */
function screeningTerm(z1: number, z2: number): number {
  const twoThirds = 2 / (2 + 1);
  return Math.sqrt(Math.pow(z1, twoThirds) + Math.pow(z2, twoThirds));
}

/** 환산에너지 ε = 0.03255·E·M₂ / ( (M₁+M₂)·Z₁·Z₂·√(Z₁^{2/3}+Z₂^{2/3}) ). E 는 eV. */
export function reducedEnergy(args: {
  z1: number; m1: number; z2: number; m2: number; energyEv: number;
}): Quantity {
  assertWithin('energyEv', args.energyEv, NON_NEGATIVE, 'eV');
  const value =
    (REDUCED_ENERGY_COEFF.value * args.energyEv * args.m2) /
    ((args.m1 + args.m2) * args.z1 * args.z2 * screeningTerm(args.z1, args.z2));
  return quantity(value, {
    modelId: 'deposition.sputter.reducedEnergy',
    unit: '',
    sourceId: 'S185',
    validRange: NON_NEGATIVE,
  });
}

/**
 * 환산 핵정지능
 *   s_n(ε) = 3.441·√ε·ln(ε+2.718) / [ 1 + 6.355·√ε + ε·(6.882·√ε − 1.708) ]
 * 🔴 ε 에 대해 **단봉(최댓값 존재)** 이다 — 저에너지에서는 오르고 고에너지에서는 내린다.
 */
export function nuclearStoppingReduced(epsilon: number): Quantity {
  assertWithin('epsilon', epsilon, NON_NEGATIVE, '');
  const root = Math.sqrt(epsilon);
  const numerator = SN_NUM_COEFF.value * root * Math.log(epsilon + SN_LOG_OFFSET.value);
  const denominator =
    1 + SN_DEN_SQRT.value * root + epsilon * (SN_DEN_LIN_SQRT.value * root - SN_DEN_LIN.value);
  return quantity(numerator / denominator, {
    modelId: 'deposition.sputter.nuclearStopping',
    unit: '',
    sourceId: 'S185',
    validRange: NON_NEGATIVE,
    assumptions: ['Thomas–Fermi 퍼텐셜 기반 경험식. ε 에 대해 최댓값을 가진다'],
  });
}

/** 핵정지단면 환산계수 K = 8.478·Z₁Z₂·M₁ / ( (M₁+M₂)·√(Z₁^{2/3}+Z₂^{2/3}) ). */
export function nuclearStoppingFactor(args: {
  z1: number; m1: number; z2: number; m2: number;
}): Quantity {
  const value =
    (K_COEFF.value * args.z1 * args.z2 * args.m1) /
    ((args.m1 + args.m2) * screeningTerm(args.z1, args.z2));
  return quantity(value, {
    modelId: 'deposition.sputter.kFactor',
    unit: '',
    sourceId: 'S185',
    validRange: NON_NEGATIVE,
  });
}

/**
 * 스퍼터 임계에너지 — **경이온(M₁ < M₂) 분기만** 구현한다.
 *   E_th = U_s·( 1.9 + 3.8·(M₁/M₂) + 0.134·(M₂/M₁)^1.24 )
 * 🔴 중이온(M₁ ≥ M₂) 분기는 원장의 중간값으로 역검증할 수단이 없어 **거부한다.**
 */
export function thresholdEnergy(args: {
  m1: number; m2: number; surfaceBindingEv: number;
}): Quantity {
  if (!(args.m1 > 0) || !(args.m2 > 0)) throw new Error('[S185] 질량은 양수여야 한다.');
  if (args.m1 >= args.m2) {
    throw new Error(
      '[S185] 중이온(M₁ ≥ M₂) 분기는 구현하지 않았다 — 원장 R158 이 경이온 조건(He→Cu)만 ' +
      '중간값으로 고정하고 있어 역검증 수단이 없다.',
    );
  }
  const ratio = args.m2 / args.m1;
  const value =
    args.surfaceBindingEv *
    (ETH_CONST.value + ETH_INV_COEFF.value / ratio + ETH_POW_COEFF.value * Math.pow(ratio, ETH_POW_EXP.value));
  return quantity(value, {
    modelId: 'deposition.sputter.thresholdEnergy',
    unit: 'eV',
    sourceId: 'S185',
    validRange: NON_NEGATIVE,
    assumptions: ['경이온(M₁ < M₂) 분기 · 수직입사'],
  });
}

/**
 * ⛔ **미구현 인터페이스.** 최종 스퍼터 수율.
 * 사유 2건 — ① 원장이 최종 Y = 0.25 를 골든값에서 제외했다(문헌 샘플계산 자기모순),
 * ② Y 에 필요한 α*(M₂/M₁) 계수식이 원장에 형태로 등재돼 있지 않아 재현 불가.
 */
export function sputterYield(): never {
  throw new Error(
    '[미구현] 스퍼터 수율 Y — α*(M₂/M₁) 계수식 미확보. ' +
    '원장 R158 은 최종 Y=0.25 를 「골든값 아님(sanity check)」으로 분류했다. ' +
    'α* 식이 등재되면 이 자리에 채운다.',
  );
}
