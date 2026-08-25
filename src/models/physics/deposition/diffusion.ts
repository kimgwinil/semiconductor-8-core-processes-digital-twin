import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { BOLTZMANN_EV_PER_K } from '../constants';
import { erfc, erfcInv } from './specialFunctions';

/**
 * 확산(Fick) — **물리층. 합성 계수 0건.**
 *
 * 식 출처: **S182** = Chu, P. K., *AP6120 Chapter 8: Diffusion*, City Univ. of Hong Kong.
 *   - 무한소스(predeposition): C(x,t) = C_s·erfc( x / (2√(Dt)) )
 *   - 유한소스(drive-in, 가우시안): C(x,t) = Q/√(πDt) · exp( −x² / (4Dt) )
 *   - 아레니우스: D = D₀·exp(−E_a / kT)
 * 골든값: 원장 **R155 · R156 · R157**.
 *
 * 🔴 **볼츠만 상수 규약.** 회사 정본은 후공정 원장이 확정한 **k = 8.617×10⁻⁵ eV/K (S54)** 다.
 *    S182 본문은 k = 8.36×10⁻⁵ 를 쓰며, 그 값으로만 R157 의 인쇄값이 재현된다.
 *    → **R157 은 「문헌 상수 고정 테스트」로 분리**하고, 일반 아레니우스 계산에는 회사 정본을 쓴다.
 *    두 경로를 별도 함수로 갈라 두어 실수로 섞이지 않게 한다.
 *
 * 🔴 **온도는 켈빈으로 받는다.** 섭씨→켈빈 변환상수(273.15)는 **어느 원장에도 없다**
 *    (후공정 원장이 「제품 코드 현행값을 가리키는 항목이라 공개 출처 원장에 둘 수 없다」고 명시하고 제외했다).
 *    출처를 위조하느니 물리층은 켈빈만 받는다. 단위 환산은 상위 층의 몫이다.
 */

/* 🔴 회사 정본 볼츠만 상수(S54 · R16 · 허용오차 ±0.5 %)는 `../constants` 가 정본이다(2026-08-22 통합).
 *    종전에는 이 파일이 같은 값을 각자 선언했다 — 4개 파일이 그랬다. */
export const BOLTZMANN_CONSTANT_EV_PER_K: number = BOLTZMANN_EV_PER_K.value;

/** 🔴 S182 본문이 쓰는 값. **R157 재현 전용**이며 일반 계산에 쓰지 않는다. */
const BOLTZMANN_S182_EV_PER_K = withSource(8.36e-5, 'eV/K', 'S182');
export const BOLTZMANN_S182_LITERATURE_EV_PER_K: number = BOLTZMANN_S182_EV_PER_K.value;

/** 절대온도는 음수가 될 수 없다. 상한은 문헌이 규정하지 않으므로 두지 않는다. */
export const TEMP_K_RANGE: [number, number] = [0, Number.POSITIVE_INFINITY];
const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];

/** cm → µm. SI 단위 정의이므로 허용 리터럴로 조립한다(출처 없는 상수를 만들지 않는다). */
const MICRON_PER_CM = 100 * 100;

export interface DiffusionCoefficient {
  readonly d0: SourcedConst;
  readonly ea: SourcedConst;
  readonly d0Uncertainty: SourcedConst;
  readonly eaUncertainty: SourcedConst;
}

/**
 * **S188** = Christensen, J. S., *Dopant Diffusion in Si and SiGe*, PhD thesis, KTH (공개 학위논문).
 *   P: D = (8 ± 5)×10⁻⁴ · exp(−(2.74 ± 0.07 eV)/kT) cm²/s
 *   B: D = (0.06 ± 0.02) · exp(−(3.12 ± 0.04 eV)/kT) cm²/s
 *
 * ⚠️ **저자들이 Fahey 리뷰값(P 3.66 eV · B 3.25–3.87 eV)과의 불일치를 명시한다.**
 *    이 구현은 **S188 실측 세트를 정본으로 쓰고**, 그 사실을 모든 출력의 `assumptions` 에 적는다.
 *    (Fahey 세트는 D₀ 가 원장에 없어 계산 자체가 불가능하다.)
 */
export const DOPANT_DIFFUSIVITY: Record<'P' | 'B', DiffusionCoefficient> = {
  P: {
    d0: withSource(8e-4, 'cm²/s', 'S188'),
    ea: withSource(2.74, 'eV', 'S188'),
    d0Uncertainty: withSource(5e-4, 'cm²/s', 'S188'),
    eaUncertainty: withSource(0.07, 'eV', 'S188'),
  },
  B: {
    d0: withSource(0.06, 'cm²/s', 'S188'),
    ea: withSource(3.12, 'eV', 'S188'),
    d0Uncertainty: withSource(0.02, 'cm²/s', 'S188'),
    eaUncertainty: withSource(0.04, 'eV', 'S188'),
  },
};

const S188_ASSUMPTION =
  '확산계수 세트: S188(KTH 공개 학위논문) 실측값. ⚠️ 저자들이 Fahey 리뷰값(P 3.66 eV · B 3.25–3.87 eV)과의 불일치를 명시한다.';

/** D = D₀·exp(−E_a/kT). 회사 정본 k 를 쓴다. */
export function arrheniusDiffusivity(args: {
  d0Cm2PerS: number; eaEv: number; tempK: number;
}): Quantity {
  assertWithin('tempK', args.tempK, TEMP_K_RANGE, 'K');
  assertWithin('d0Cm2PerS', args.d0Cm2PerS, NON_NEGATIVE, 'cm²/s');
  const value = args.d0Cm2PerS * Math.exp(-args.eaEv / (BOLTZMANN_EV_PER_K.value * args.tempK));
  return quantity(value, {
    modelId: 'deposition.diffusion.arrhenius',
    unit: 'cm²/s',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
    assumptions: [`볼츠만 상수 k = ${BOLTZMANN_EV_PER_K.value} eV/K (회사 정본 · S54)`],
  });
}

/** 도펀트별 확산계수 — S188 실측 세트. */
export function dopantDiffusivity(args: { dopant: 'P' | 'B'; tempK: number }): Quantity {
  const set = DOPANT_DIFFUSIVITY[args.dopant];
  const q = arrheniusDiffusivity({ d0Cm2PerS: set.d0.value, eaEv: set.ea.value, tempK: args.tempK });
  return quantity(q.value, {
    modelId: 'deposition.diffusion.dopantD',
    unit: 'cm²/s',
    sourceId: 'S188',
    validRange: NON_NEGATIVE,
    assumptions: [S188_ASSUMPTION, `볼츠만 상수 k = ${BOLTZMANN_EV_PER_K.value} eV/K (회사 정본 · S54)`],
  });
}

/**
 * 🔴 **R157 전용** — S182 본문의 k = 8.36×10⁻⁵ eV/K 로 계산한다.
 * 문헌 인쇄값 재현 테스트에만 쓴다. 제품 화면 계산에 쓰지 마라.
 */
export function arrheniusDiffusivityLiteratureK(args: {
  d0Cm2PerS: number; eaEv: number; tempK: number;
}): Quantity {
  assertWithin('tempK', args.tempK, TEMP_K_RANGE, 'K');
  const value = args.d0Cm2PerS * Math.exp(-args.eaEv / (BOLTZMANN_S182_EV_PER_K.value * args.tempK));
  return quantity(value, {
    modelId: 'deposition.diffusion.arrheniusLiteratureK',
    unit: 'cm²/s',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
    assumptions: [
      `🔴 S182 본문 상수 k = ${BOLTZMANN_S182_EV_PER_K.value} eV/K 사용 — 문헌 재현 전용.`,
      '회사 정본(8.617×10⁻⁵)으로 계산하면 D 가 약 2.8배 커진다(원장 R157 주석).',
    ],
  });
}

/** 무한소스(predeposition) 농도 분포 — C(x,t) = C_s·erfc(x/(2√(Dt))). */
export function erfcProfile(args: {
  csPerCm3: number; xCm: number; dCm2PerS: number; timeS: number;
}): Quantity {
  assertWithin('xCm', args.xCm, NON_NEGATIVE, 'cm');
  assertWithin('dCm2PerS', args.dCm2PerS, NON_NEGATIVE, 'cm²/s');
  assertWithin('timeS', args.timeS, NON_NEGATIVE, 's');
  const twoSqrtDt = 2 * Math.sqrt(args.dCm2PerS * args.timeS);
  const value = twoSqrtDt === 0 ? 0 : args.csPerCm3 * erfc(args.xCm / twoSqrtDt);
  return quantity(value, {
    modelId: 'deposition.diffusion.erfcProfile',
    unit: 'cm⁻³',
    sourceId: 'S182',
    validRange: [0, args.csPerCm3],
    assumptions: ['무한소스 — 표면 농도 C_s 가 시간에 무관하게 일정하다(고용한도 고정)'],
  });
}

/** 무한소스 접합깊이 — x_j = 2√(Dt)·erfc⁻¹(C_B/C_s). */
export function junctionDepthErfc(args: {
  csPerCm3: number; cbPerCm3: number; dCm2PerS: number; timeS: number;
}): Quantity {
  assertWithin('dCm2PerS', args.dCm2PerS, NON_NEGATIVE, 'cm²/s');
  assertWithin('timeS', args.timeS, NON_NEGATIVE, 's');
  if (!(args.cbPerCm3 > 0) || !(args.csPerCm3 > args.cbPerCm3)) {
    throw new Error('[S182] 접합은 C_s > C_B > 0 일 때만 존재한다.');
  }
  const value = 2 * Math.sqrt(args.dCm2PerS * args.timeS) * erfcInv(args.cbPerCm3 / args.csPerCm3);
  return quantity(value * MICRON_PER_CM, {
    modelId: 'deposition.diffusion.junctionErfc',
    unit: 'µm',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
    assumptions: ['무한소스 erfc 해. x_j ∝ √t 이므로 시간에 대한 증가율은 계속 줄어든다'],
  });
}

/** predeposition 으로 들어간 총 도즈 — Q = 2·C_s·√(Dt/π). */
export function predepositionDose(args: {
  csPerCm3: number; dCm2PerS: number; timeS: number;
}): Quantity {
  assertWithin('dCm2PerS', args.dCm2PerS, NON_NEGATIVE, 'cm²/s');
  assertWithin('timeS', args.timeS, NON_NEGATIVE, 's');
  const value = 2 * args.csPerCm3 * Math.sqrt((args.dCm2PerS * args.timeS) / Math.PI);
  return quantity(value, {
    modelId: 'deposition.diffusion.dose',
    unit: 'cm⁻²',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
  });
}

/** drive-in 표면(피크) 농도 — C₀ = Q/√(πDt). */
export function gaussianPeakConcentration(args: {
  doseCm2: number; dCm2PerS: number; timeS: number;
}): Quantity {
  const dt = args.dCm2PerS * args.timeS;
  if (!(dt > 0)) throw new Error('[S182] drive-in 은 Dt > 0 에서만 정의된다.');
  return quantity(args.doseCm2 / Math.sqrt(Math.PI * dt), {
    modelId: 'deposition.diffusion.gaussianPeak',
    unit: 'cm⁻³',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
    assumptions: ['유한소스 — 도즈 Q 가 보존된다(재증착·증발 없음)'],
  });
}

/** drive-in 농도 분포 — C(x,t) = C₀·exp(−x²/(4Dt)). */
export function gaussianProfile(args: {
  doseCm2: number; dCm2PerS: number; timeS: number; xCm: number;
}): Quantity {
  const dt = args.dCm2PerS * args.timeS;
  if (!(dt > 0)) throw new Error('[S182] drive-in 은 Dt > 0 에서만 정의된다.');
  const c0 = args.doseCm2 / Math.sqrt(Math.PI * dt);
  const value = c0 * Math.exp(-(args.xCm * args.xCm) / (2 * 2 * dt));
  return quantity(value, {
    modelId: 'deposition.diffusion.gaussianProfile',
    unit: 'cm⁻³',
    sourceId: 'S182',
    validRange: [0, c0],
  });
}

/** drive-in 접합깊이 — x_j = √( 4Dt·ln(C₀/C_B) ). */
export function junctionDepthGaussian(args: {
  doseCm2: number; dCm2PerS: number; timeS: number; cbPerCm3: number;
}): Quantity {
  const dt = args.dCm2PerS * args.timeS;
  if (!(dt > 0)) throw new Error('[S182] drive-in 은 Dt > 0 에서만 정의된다.');
  const c0 = args.doseCm2 / Math.sqrt(Math.PI * dt);
  if (!(c0 > args.cbPerCm3) || !(args.cbPerCm3 > 0)) {
    throw new Error('[S182] 접합은 C₀ > C_B > 0 일 때만 존재한다.');
  }
  const value = Math.sqrt(2 * 2 * dt * Math.log(c0 / args.cbPerCm3));
  return quantity(value * MICRON_PER_CM, {
    modelId: 'deposition.diffusion.junctionGaussian',
    unit: 'µm',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
  });
}

/** 목표 Dt 에 필요한 drive-in 시간 — t = (Dt)/D. */
export function driveInTime(args: { dtTargetCm2: number; dCm2PerS: number }): Quantity {
  if (!(args.dCm2PerS > 0)) throw new Error('[S182] D > 0 이어야 한다.');
  assertWithin('dtTargetCm2', args.dtTargetCm2, NON_NEGATIVE, 'cm²');
  return quantity(args.dtTargetCm2 / args.dCm2PerS, {
    modelId: 'deposition.diffusion.driveInTime',
    unit: 's',
    sourceId: 'S182',
    validRange: NON_NEGATIVE,
  });
}
