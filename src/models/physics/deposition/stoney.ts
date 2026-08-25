import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * 박막 잔류응력 — Stoney 식. **물리층. 합성 계수 0건.**
 *
 * 출처: **S187** = Huff, M., *Residual Stresses in Deposited Thin-Film Material Layers for
 * Micro- and Nano-Systems Manufacturing*, **Micromachines 13(12), 2084 (2022)** — **CC BY 4.0**.
 *
 *   σ_f = E_s·t_s² / ( 6·(1 − ν_s)·R·t_f )
 *
 * E_s/(1−ν_s) 는 기판의 **이축탄성계수 M_s** 그 자체이므로, 이 구현은 M_s 를 직접 받는다.
 * (E 와 ν 를 따로 가진 경우 `biaxialModulus()` 로 만든다.)
 *
 * 🔴 분모의 6 은 **판 이론에서 나오는 대수 상수**이지 맞춘 계수가 아니다.
 *    허용 리터럴만으로 조립해 출처 없는 상수를 만들지 않는다(규약 §2-3).
 * 🔴 **부호는 곡률이 정한다.** R > 0(볼록, 막이 기판을 잡아당김) → 인장(σ > 0),
 *    R < 0 → 압축(σ < 0). Stoney 식은 크기와 부호를 동시에 준다.
 * 🔴 가정: t_f ≪ t_s · 등방 이축응력 · 막 두께 균일 · 소변형. S187 이 명시한 성립 조건이다.
 */

const STONEY_DENOMINATOR = 2 * (2 + 1);
const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];
const SIGNED: [number, number] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];

/**
 * Si 기판 이축탄성계수 M = E/(1−ν). 원장 **R198 · S244**.
 * ⚠️ R198 은 **출력만 인용 가능**하고 골든값에서 제외된 항목이다(M-24: 입력 컴플라이언스 텐서 미확보).
 *    → 여기서는 **계산 입력의 기본값**으로만 쓰고, 골든 테스트 대상으로 삼지 않는다.
 */
export const SI_BIAXIAL_MODULUS_PA: Record<'001' | '111', number> = {
  '001': withSource(1.803e11, 'Pa', 'S244').value,
  '111': withSource(2.291e11, 'Pa', 'S244').value,
};

/** 이축탄성계수 M = E/(1−ν). */
export function biaxialModulus(args: { youngsPa: number; poisson: number }): Quantity {
  if (!(args.poisson < 1)) throw new Error('[S187] 푸아송비는 1 미만이어야 한다.');
  assertWithin('youngsPa', args.youngsPa, NON_NEGATIVE, 'Pa');
  return quantity(args.youngsPa / (1 - args.poisson), {
    modelId: 'deposition.stoney.biaxialModulus',
    unit: 'Pa',
    sourceId: 'S187',
    validRange: NON_NEGATIVE,
  });
}

/** Stoney 식 — 곡률 반경으로부터 막 응력을 구한다. */
export function filmStressStoney(args: {
  substrateBiaxialModulusPa: number;
  substrateThicknessM: number;
  filmThicknessM: number;
  curvatureRadiusM: number;
}): Quantity {
  assertWithin('substrateThicknessM', args.substrateThicknessM, NON_NEGATIVE, 'm');
  if (!(args.filmThicknessM > 0)) throw new Error('[S187] 막 두께는 0보다 커야 한다.');
  if (!(args.curvatureRadiusM !== 0) || !Number.isFinite(args.curvatureRadiusM)) {
    throw new Error('[S187] 곡률 반경은 0이 아닌 유한값이어야 한다(평탄하면 응력 0).');
  }
  const ts = args.substrateThicknessM;
  const value =
    (args.substrateBiaxialModulusPa * ts * ts) /
    (STONEY_DENOMINATOR * args.curvatureRadiusM * args.filmThicknessM);
  return quantity(value, {
    modelId: 'deposition.stoney.stress',
    unit: 'Pa',
    sourceId: 'S187',
    validRange: SIGNED,
    assumptions: [
      't_f ≪ t_s · 등방 이축응력 · 두께 균일 · 소변형 (S187 명시 성립조건)',
      '곡률 반경의 부호가 인장(+)·압축(−)을 정한다',
    ],
  });
}

/** 같은 응력이라면 막이 두꺼울수록 기판이 더 휜다 — 역산(곡률 반경). */
export function curvatureRadiusFromStress(args: {
  substrateBiaxialModulusPa: number;
  substrateThicknessM: number;
  filmThicknessM: number;
  stressPa: number;
}): Quantity {
  if (!(args.filmThicknessM > 0)) throw new Error('[S187] 막 두께는 0보다 커야 한다.');
  if (args.stressPa === 0) throw new Error('[S187] 응력 0 은 곡률 반경 무한대다.');
  const ts = args.substrateThicknessM;
  const value =
    (args.substrateBiaxialModulusPa * ts * ts) /
    (STONEY_DENOMINATOR * args.stressPa * args.filmThicknessM);
  return quantity(value, {
    modelId: 'deposition.stoney.radius',
    unit: 'm',
    sourceId: 'S187',
    validRange: SIGNED,
  });
}
