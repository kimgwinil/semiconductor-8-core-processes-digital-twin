import { assertWithin, quantity, type Quantity } from '../../contract';
// 🔴 회사 정본 볼츠만 상수(S54 · R16). 2026-08-22 통합 — 종전에는 4개 파일이 같은 값을 각자 선언했다.
import { BOLTZMANN_EV_PER_K } from '../constants';

/**
 * CVD 성장 — Grove 형 2단 직렬 저항 모델. **물리층. 합성 계수 0건.**
 *
 * 출처: **S184** = Plummer·Deal·Griffin, *Silicon VLSI Technology* Ch.9 *Thin Film Deposition*
 * 강의 슬라이드. ⚠️ **© Prentice Hall — 슬라이드·표·그림 전재 금지.**
 * 식은 공지 사실이므로 **자체 서술로 재작성**했고, 표·그림은 하나도 옮기지 않았다.
 *
 *   성장률   v = ( h_g·k_s / (h_g + k_s) ) · ( C_g / N )
 *     h_g : 기상 물질전달계수 [cm/s]
 *     k_s : 표면반응 속도상수 [cm/s]
 *     C_g : 기상 반응종 농도 [cm⁻³]
 *     N   : 막 1 cm³ 를 이루는 원자수 [cm⁻³]
 *
 * 직렬 저항 구조라 **느린 쪽이 전체를 지배**한다.
 *   k_s ≪ h_g → 반응율속(reaction limited)   : v ≈ k_s·C_g/N , 온도에 아레니우스로 급증
 *   k_s ≫ h_g → 물질전달율속(transport limited): v ≈ h_g·C_g/N , 온도 의존이 거의 사라진다
 *
 * 🔴 **k_s 의 D₀·E_a 실측 계수는 원장에 없다.** 그래서 표를 지어내지 않고
 *    **전량 호출자 입력**으로 받는다(원장 처리지침 ② — 절대값 대신 형태·비율만 제공).
 */

const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];

/** 표면반응 속도상수 k_s = k₀·exp(−E_a/kT). 계수는 문헌에 없으므로 호출자가 준다. */
export function surfaceReactionRate(args: {
  k0CmPerS: number; eaEv: number; tempK: number;
}): Quantity {
  assertWithin('tempK', args.tempK, NON_NEGATIVE, 'K');
  assertWithin('k0CmPerS', args.k0CmPerS, NON_NEGATIVE, 'cm/s');
  const value = args.k0CmPerS * Math.exp(-args.eaEv / (BOLTZMANN_EV_PER_K.value * args.tempK));
  return quantity(value, {
    modelId: 'deposition.cvd.ks',
    unit: 'cm/s',
    sourceId: 'S184',
    validRange: NON_NEGATIVE,
    assumptions: [
      'k₀·E_a 는 호출자 입력이다 — 원장에 실측 계수표가 없어 내장하지 않는다',
      // 🔴 2026-08-22 추가 — 계산에 볼츠만을 쓰면서 고지하지 않고 있었다.
      //    같은 값을 쓰는 형제 구현 3곳(diffusion·wetEtch·electromigration)은 전부 고지한다.
      `k = ${BOLTZMANN_EV_PER_K.value} eV/K (회사 정본 · S54)`,
    ],
  });
}

/** Grove 성장률. */
export function cvdGrowthRate(args: {
  hgCmPerS: number; ksCmPerS: number; cgPerCm3: number; filmAtomDensityPerCm3: number;
}): Quantity {
  assertWithin('hgCmPerS', args.hgCmPerS, NON_NEGATIVE, 'cm/s');
  assertWithin('ksCmPerS', args.ksCmPerS, NON_NEGATIVE, 'cm/s');
  assertWithin('cgPerCm3', args.cgPerCm3, NON_NEGATIVE, 'cm⁻³');
  if (!(args.filmAtomDensityPerCm3 > 0)) {
    throw new Error('[S184] 막 원자밀도 N 은 0보다 커야 한다.');
  }
  const sum = args.hgCmPerS + args.ksCmPerS;
  const series = sum === 0 ? 0 : (args.hgCmPerS * args.ksCmPerS) / sum;
  return quantity((series * args.cgPerCm3) / args.filmAtomDensityPerCm3, {
    modelId: 'deposition.cvd.growthRate',
    unit: 'cm/s',
    sourceId: 'S184',
    validRange: NON_NEGATIVE,
    assumptions: ['정상상태 1차원 · 경계층 근사(Grove). 소모(depletion)에 의한 웨이퍼간 불균일은 다루지 않는다'],
  });
}

/**
 * 물질전달이 전체를 지배하는 정도 = k_s/(h_g+k_s). 0 → 완전 반응율속, 1 → 완전 물질전달율속.
 * 온도가 오르면 k_s 만 커지므로 이 값은 단조 증가한다.
 */
export function transportLimitedFraction(args: { hgCmPerS: number; ksCmPerS: number }): Quantity {
  const sum = args.hgCmPerS + args.ksCmPerS;
  if (!(sum > 0)) throw new Error('[S184] h_g + k_s > 0 이어야 한다.');
  return quantity(args.ksCmPerS / sum, {
    modelId: 'deposition.cvd.transportFraction',
    unit: '',
    sourceId: 'S184',
    validRange: [0, 1],
  });
}

/**
 * 겉보기 활성화에너지. 아레니우스 도표의 **기울기**에 해당한다.
 *   ln v = ln k_s − ln(h_g+k_s) + const  →  E_app = E_a · h_g/(h_g+k_s)
 * 🔴 저온(반응율속)에서는 E_app → E_a, 고온(물질전달율속)에서는 E_app → 0.
 *    「고온에서 기울기가 급감한다」는 교과서 서술이 이 식 하나로 나온다.
 */
export function apparentActivationEnergy(args: {
  hgCmPerS: number; ksCmPerS: number; eaEv: number;
}): Quantity {
  const sum = args.hgCmPerS + args.ksCmPerS;
  if (!(sum > 0)) throw new Error('[S184] h_g + k_s > 0 이어야 한다.');
  return quantity((args.eaEv * args.hgCmPerS) / sum, {
    modelId: 'deposition.cvd.apparentEa',
    unit: 'eV',
    sourceId: 'S184',
    validRange: [0, args.eaEv],
    assumptions: ['해석적으로 유도한 기울기 — 수치미분이 아니라 닫힌 형태다'],
  });
}
