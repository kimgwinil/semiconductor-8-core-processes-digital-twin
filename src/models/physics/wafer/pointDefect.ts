import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { BOLTZMANN_SI_EV_PER_K } from '../siDefinitions';
import { SECONDS_PER_MINUTE } from '../units';

/**
 * 점결함(자기침입형 I · 공공 V) 아레니우스 모델 + Voronkov V/G 임계 — **물리층. 합성 계수 0건.**
 *
 * 원논문: Sabanskis, Plāte, Sattler, Miller, Virbulis,
 * *Evaluation of the Performance of Published Point Defect Parameter Sets…*,
 * **Crystals 2021, 11(5), 460** = 원장 **S101**. **CC BY 4.0.**
 *
 * 구현한 문헌식 3개
 *  - 식 (4)  D    = D⁰·exp(−Hᵐ/kT)
 *  - 식 (5)  C^eq = C⁰·exp(−(H^f + ΔH^f)/kT)      ※ ΔH^f 는 열응력 항 — 여기서는 0(무응력)
 *  - 식 (7)  ξ_crit = [C_I·D_I·(H^f_av − Q*_I) − C_V·D_V·(H^f_av − Q*_V)] / [(C_V − C_I)·k·T₀²]
 *            H^f_av = (H^f_I + H^f_V)/2,  모든 양은 융점에서 평가
 *
 * 🔴 **A6L-01(A6 고정 목록)** — V/G 임계는 교육용 눈금이 아니라 실제 물리 경계다.
 *    ξ_crit 을 경향모델로 내리면 A6 위반이다. 아래 상수는 전부 `withSource`.
 * 🔴 **Table 1 을 통째로 옮기지 않는다**(원장 규칙 8). 원장 R101·R102 가 지정한 세트 5개만 싣는다.
 */

export type DefectSpecies = 'I' | 'V';
/** 원장 R101(A) · R102(C·F·G·I) 가 지정한 세트만. 원논문 Table 1 은 12세트지만 전재하지 않는다. */
export type ParameterSetId = 'A' | 'C' | 'F' | 'G' | 'I';

interface SpeciesParams {
  /** D⁰ — 확산 전인자 [cm²/s] */
  readonly d0: SourcedConst;
  /** Hᵐ — 이동(migration) 에너지 [eV] */
  readonly hMigration: SourcedConst;
  /** C⁰ — 평형농도 전인자 [cm⁻³]. 생성 엔트로피가 여기에 포함돼 있다(원논문 명시) */
  readonly c0: SourcedConst;
  /** H^f — 생성(formation) 엔탈피 [eV] */
  readonly hFormation: SourcedConst;
  /** Q* — 열확산(Soret) 활성화 엔탈피 [eV]. 표에 값이 없는 세트는 0 이다 */
  readonly qStar: SourcedConst;
}

interface ParameterSet {
  readonly label: string;
  /** 🔴 열응력(ΔH^f)을 포함한 세트("-s"). 식 (7)만으로는 Table 4 를 재현하지 못한다 */
  readonly stressed: boolean;
  readonly I: SpeciesParams;
  readonly V: SpeciesParams;
}

/**
 * 볼츠만 상수 [eV/K]. 원논문 §3.2.1 은 본문에 **k = 8.617 × 10⁻⁵ eV/K** 로 (반올림해) 적었지만,
 * 계산에는 정밀값을 썼다는 것이 Table 2 로 확인된다.
 * 🔴 **반올림값 8.617e-5 을 쓰면 C^eq 가 최대 0.137 % 어긋나 원장 허용오차 ±0.1 % 를 깬다.**
 *    SI 정의값(k = 1.380 649×10⁻²³ J/K ÷ e)을 쓰면 최대 편차가 0.044 % 로 떨어져 표를 재현한다.
 *    → **정의 상수를 쓴다.** 이것은 피팅 계수가 아니라 단위계가 정의한 값이다.
 *    골든 테스트가 두 선택의 차이를 그대로 고정한다.
 *
 * 🔴 2026-08-22 정정 — 이것은 `withSource(8.617333262e-5, 'eV/K', **'S101'**)` 이었다.
 *    **S101 은 이 숫자를 인쇄한 적이 없다.** 바로 위 주석이 스스로 「원논문 §3.2.1 은 본문에
 *    반올림해 적었다」고 말하고 있고, 그 인쇄값은 아래 `BOLTZMANN_AS_PRINTED` 로 **따로** 있다.
 *    즉 **오귀속은 의도가 아니라 누락**이었다. 이 값은 문헌이 잰 것이 아니라 SI 가 정의한 것이므로
 *    출처를 빌리지 않고 `../siDefinitions` 의 `siDefinition()` 정본을 쓴다.
 *    🔴 **수치는 한 자리도 바꾸지 않았다** — 조립값이 십진 표기와 비트까지 같음을
 *    `tests/unit/si-definitions.test.ts` 가 고정한다.
 */
const BOLTZMANN_EV_PER_K = BOLTZMANN_SI_EV_PER_K;
/** 원논문 본문이 인쇄한 반올림 표기. 재현 실패를 증명하는 용도로만 쓴다.
 *  🔴 **이쪽은 `withSource` 가 맞다** — S101 §3.2.1 이 실제로 인쇄한 값이다. 위 정의값과
 *     **개념이 다르므로 통일하지 않는다.** */
export const BOLTZMANN_AS_PRINTED = withSource(8.617e-5, 'eV/K', 'S101');
export const BOLTZMANN_USED_EV_PER_K = BOLTZMANN_EV_PER_K.value;
/** 실리콘 융점 T₀. 원논문 §3.1: "The melting point of silicon T0 = 1685 K." */
const MELTING_POINT_K = withSource(1685, 'K', 'S101');
export const SILICON_MELTING_POINT_K = MELTING_POINT_K.value;

/**
 * 점결함이 사실상 동결되는 온도. 원논문 §3.2.2: "At temperatures below 1000 °C, the PD
 * diffusion coefficients are so low that the defects are practically frozen-in."
 * 🔴 1000 °C 를 절대온도로 적은 것이다 — 우리가 고른 값이 아니라 문헌 조건값이다.
 */
const FROZEN_IN_TEMP_K = withSource(1273.15, 'K', 'S101');
export const DEFECT_TEMP_RANGE_K: [number, number] = [FROZEN_IN_TEMP_K.value, MELTING_POINT_K.value];

/** S101 Table 1 — 원장이 지정한 5세트만. */
const SETS: Record<ParameterSetId, ParameterSet> = {
  A: {
    label: '2000-Nakamura',
    stressed: false,
    I: {
      d0: withSource(1.040e4, 'cm²/s', 'S101'),
      hMigration: withSource(2.4, 'eV', 'S101'),
      c0: withSource(1.060e22, 'cm⁻³', 'S101'),
      hFormation: withSource(2.4, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
    V: {
      d0: withSource(2.140, 'cm²/s', 'S101'),
      hMigration: withSource(1.4, 'eV', 'S101'),
      c0: withSource(5.290e22, 'cm⁻³', 'S101'),
      hFormation: withSource(2.6, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
  },
  C: {
    label: '2002-Nakamura',
    stressed: false,
    I: {
      d0: withSource(2.459e-1, 'cm²/s', 'S101'),
      hMigration: withSource(0.9, 'eV', 'S101'),
      c0: withSource(6.284e26, 'cm⁻³', 'S101'),
      hFormation: withSource(4.05, 'eV', 'S101'),
      qStar: withSource(-1.01, 'eV', 'S101'),
    },
    V: {
      d0: withSource(3.513e-4, 'cm²/s', 'S101'),
      hMigration: withSource(0.3, 'eV', 'S101'),
      c0: withSource(3.951e26, 'cm⁻³', 'S101'),
      hFormation: withSource(3.94, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
  },
  F: {
    label: '2007-Sinno',
    stressed: false,
    I: {
      d0: withSource(2.370e-1, 'cm²/s', 'S101'),
      hMigration: withSource(0.937, 'eV', 'S101'),
      c0: withSource(6.365e26, 'cm⁻³', 'S101'),
      hFormation: withSource(4.0, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
    V: {
      d0: withSource(7.870e-4, 'cm²/s', 'S101'),
      hMigration: withSource(0.457, 'eV', 'S101'),
      c0: withSource(9.931e25, 'cm⁻³', 'S101'),
      hFormation: withSource(3.7, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
  },
  G: {
    label: '2009-Voronkov',
    stressed: false,
    I: {
      d0: withSource(3.667e-3, 'cm²/s', 'S101'),
      hMigration: withSource(0.2, 'eV', 'S101'),
      c0: withSource(1.884e29, 'cm⁻³', 'S101'),
      hFormation: withSource(4.95, 'eV', 'S101'),
      qStar: withSource(4.5, 'eV', 'S101'),
    },
    V: {
      d0: withSource(1.876e-3, 'cm²/s', 'S101'),
      hMigration: withSource(0.38, 'eV', 'S101'),
      c0: withSource(2.967e26, 'cm⁻³', 'S101'),
      hFormation: withSource(3.95, 'eV', 'S101'),
      qStar: withSource(29, 'eV', 'S101'),
    },
  },
  I: {
    label: '2013-Vanhellemont-s',
    stressed: true,
    I: {
      d0: withSource(3.800e-2, 'cm²/s', 'S101'),
      hMigration: withSource(0.88, 'eV', 'S101'),
      c0: withSource(6.400e25, 'cm⁻³', 'S101'),
      hFormation: withSource(3.68, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
    V: {
      d0: withSource(1.200e-3, 'cm²/s', 'S101'),
      hMigration: withSource(0.45, 'eV', 'S101'),
      c0: withSource(2.580e26, 'cm⁻³', 'S101'),
      hFormation: withSource(3.88, 'eV', 'S101'),
      qStar: withSource(0, 'eV', 'S101'),
    },
  },
};

export const PARAMETER_SET_IDS: ParameterSetId[] = ['A', 'C', 'F', 'G', 'I'];
export function parameterSetLabel(id: ParameterSetId): string { return SETS[id].label; }
export function isStressedSet(id: ParameterSetId): boolean { return SETS[id].stressed; }

function speciesOf(id: ParameterSetId, s: DefectSpecies): SpeciesParams {
  return s === 'I' ? SETS[id].I : SETS[id].V;
}

/** 식 (4) — 점결함 확산계수 D = D⁰·exp(−Hᵐ/kT). */
export function defectDiffusivity(args: {
  setId: ParameterSetId; species: DefectSpecies; tempK: number;
}): Quantity {
  assertWithin('tempK', args.tempK, DEFECT_TEMP_RANGE_K, 'K');
  const p = speciesOf(args.setId, args.species);
  const kT = BOLTZMANN_EV_PER_K.value * args.tempK;
  const d = p.d0.value * Math.exp(-p.hMigration.value / kT);
  return quantity(d, {
    modelId: 'wafer.pointDefect.diffusivity',
    unit: 'cm²/s',
    sourceId: 'S101',
    validRange: [0, speciesOf(args.setId, args.species).d0.value],
    assumptions: [
      `S101 Table 1 파라미터 세트 ${args.setId}(${SETS[args.setId].label})`,
      '무응력 조건 — 열응력에 의한 ΔH^f 는 확산계수에 걸리지 않는다(원논문 식 5 에만 붙는다)',
    ],
  });
}

/** 식 (5) — 평형 점결함 농도 C^eq = C⁰·exp(−H^f/kT). ΔH^f(열응력) = 0 인 무응력 형태다. */
export function equilibriumConcentration(args: {
  setId: ParameterSetId; species: DefectSpecies; tempK: number;
}): Quantity {
  assertWithin('tempK', args.tempK, DEFECT_TEMP_RANGE_K, 'K');
  const p = speciesOf(args.setId, args.species);
  const kT = BOLTZMANN_EV_PER_K.value * args.tempK;
  const c = p.c0.value * Math.exp(-p.hFormation.value / kT);
  return quantity(c, {
    modelId: 'wafer.pointDefect.equilibriumConcentration',
    unit: 'cm⁻³',
    sourceId: 'S101',
    validRange: [0, p.c0.value],
    assumptions: [
      `S101 Table 1 파라미터 세트 ${args.setId}(${SETS[args.setId].label})`,
      'ΔH^f = 0 (열응력 미포함). 응력 포함 세트는 이 식만으로 Table 4 를 재현하지 못한다',
    ],
  });
}

/** 수송능 P = D·C^eq. 원논문 Table 2 가 함께 인쇄한 양이며 실험으로 측정 가능한 조합이다. */
export function transportCapacity(args: {
  setId: ParameterSetId; species: DefectSpecies; tempK: number;
}): Quantity {
  const d = defectDiffusivity(args).value;
  const c = equilibriumConcentration(args).value;
  return quantity(d * c, {
    modelId: 'wafer.pointDefect.transportCapacity',
    unit: 'cm⁻¹·s⁻¹',
    sourceId: 'S101',
    validRange: [0, Number.MAX_VALUE],
    assumptions: ['P = D·C^eq — 원논문 Table 2 의 마지막 두 열'],
  });
}

/*
 * 분 ↔ 초 환산은 `../units.ts` 의 `SECONDS_PER_MINUTE` 가 정본이다(위에서 import).
 * 🔴 물리 상수가 아니라 단위 환산이므로 출처가 없고, 종전에는 여기서 `(2·2·2·2−1)·2·2` 로
 *    따로 조립하고 있었다 — 값은 같지만 정본이 넷이었다(`check-constants` R1, 2026-08-21 실측).
 */

/**
 * 식 (7) — Voronkov 임계비 ξ_crit = (v/G)_crit. 단위 cm²·min⁻¹·K⁻¹ (원논문 Table 4 와 같은 단위).
 *
 * 🔴 **A6L-01.** 이 값은 반드시 문헌 근거로 계산한다. 교육용 눈금으로 대체하면 무결함 창의 의미가 사라진다.
 * 🔴 **응력 포함 세트("-s")는 거부**한다 — Table 4 는 σ_ave = −20 MPa 에서 ΔH^f 를 반영한 값이라
 *    무응력 식 (7) 로는 재현되지 않는다(세트 I: 식 1.86×10⁻³ vs 표 0.60×10⁻³). 보간·근사하지 않고 정지한다.
 */
export function voronkovCriticalRatio(setId: ParameterSetId): Quantity {
  if (SETS[setId].stressed) {
    throw new Error(
      `[S101] parameter set ${setId}(${SETS[setId].label}) includes thermal stress (ΔH^f). ` +
      'Equation (7) without ΔH^f does not reproduce Table 4 for stressed sets. ' +
      '무응력 세트(A·C·F·G)만 계산한다 — 근사하지 않는다.',
    );
  }
  const tMelt = MELTING_POINT_K.value;
  const dI = defectDiffusivity({ setId, species: 'I', tempK: tMelt }).value;
  const dV = defectDiffusivity({ setId, species: 'V', tempK: tMelt }).value;
  const cI = equilibriumConcentration({ setId, species: 'I', tempK: tMelt }).value;
  const cV = equilibriumConcentration({ setId, species: 'V', tempK: tMelt }).value;
  const hAv = (SETS[setId].I.hFormation.value + SETS[setId].V.hFormation.value) / 2;
  const numerator = cI * dI * (hAv - SETS[setId].I.qStar.value)
    - cV * dV * (hAv - SETS[setId].V.qStar.value);
  const denominator = (cV - cI) * BOLTZMANN_EV_PER_K.value * tMelt * tMelt;
  const xiPerSecond = numerator / denominator;
  return quantity(xiPerSecond * SECONDS_PER_MINUTE, {
    modelId: 'wafer.pointDefect.voronkovCritical',
    unit: 'cm²·min⁻¹·K⁻¹',
    sourceId: 'S101',
    validRange: [XI_CRIT_ORIG_MIN.value, XI_CRIT_ORIG_MAX.value],
    assumptions: [
      `S101 식 (7) · 세트 ${setId}(${SETS[setId].label}) · 모든 양은 융점 ${tMelt} K 에서 평가`,
      '무응력(ΔH^f = 0). Table 4 「orig」 열과 대조한다',
    ],
  });
}

/**
 * 🔴 **A6L-01 의 확정값.** 원장 §3-1: ξ_crit = 1.3×10⁻³ 전형.
 * S101 Table 4 「adj.」 열 12세트의 대표값이다(0.85 ~ 1.50 ×10⁻³ 사이에 몰려 있다).
 */
export const XI_CRIT_TYPICAL = withSource(1.3e-3, 'cm²·min⁻¹·K⁻¹', 'S101');
/** S101 Table 4 「orig.」 열의 최소·최대 (세트 I 0.60, 세트 B 2.51). */
const XI_CRIT_ORIG_MIN = withSource(0.60e-3, 'cm²·min⁻¹·K⁻¹', 'S101');
const XI_CRIT_ORIG_MAX = withSource(2.51e-3, 'cm²·min⁻¹·K⁻¹', 'S101');
/** S101 Table 4 「adj.」 열의 최소·최대 (세트 I 0.85, 세트 A 1.50). */
export const XI_CRIT_ADJUSTED_MIN = withSource(0.85e-3, 'cm²·min⁻¹·K⁻¹', 'S101');
export const XI_CRIT_ADJUSTED_MAX = withSource(1.50e-3, 'cm²·min⁻¹·K⁻¹', 'S101');

export const XI_CRIT_ORIG_RANGE: [number, number] = [XI_CRIT_ORIG_MIN.value, XI_CRIT_ORIG_MAX.value];
export const XI_CRIT_ADJUSTED_RANGE: [number, number] = [
  XI_CRIT_ADJUSTED_MIN.value, XI_CRIT_ADJUSTED_MAX.value,
];

/** 인상속도·축방향 온도구배의 실용 범위. 이 창을 벗어나면 계산하지 않고 정지한다. */
const PULL_RATE_MIN = withSource(0, 'cm/min', 'S101');
/** 원장 §3-1: ⌀12 cm 에서 V_max 20–30 cm/h. 상한은 그 값을 분 단위로 옮긴 것이다(S106). */
const PULL_RATE_MAX = withSource(0.5, 'cm/min', 'S106');
export const PULL_RATE_RANGE_CM_PER_MIN: [number, number] = [PULL_RATE_MIN.value, PULL_RATE_MAX.value];
/**
 * 🔴 축방향 온도구배 G 자체의 문헌 상·하한은 원장에 없다. 없는 값을 지어내지 않고
 * **양수·유한 여부만** 검사한다. 대신 결과값 ξ 가 문헌이 보고한 창 안에 있는지를 본다.
 */
const GRADIENT_RANGE_K_PER_CM: [number, number] = [Number.MIN_VALUE, Number.MAX_VALUE];

/**
 * ξ 의 유효창. S101 Table 4 「orig.」 열의 최대치의 2배까지를 본다 — 그 밖은
 * 문헌이 다룬 어느 세트에서도 임계가 놀지 않는 영역이라 판정 자체가 무의미해진다.
 */
function xiRange(): [number, number] { return [0, 2 * XI_CRIT_ORIG_MAX.value]; }

/** ξ = v/G. Voronkov 파라미터 그 자체. */
export function voronkovRatio(args: { pullRateCmPerMin: number; gradientKPerCm: number }): Quantity {
  assertWithin('pullRateCmPerMin', args.pullRateCmPerMin, PULL_RATE_RANGE_CM_PER_MIN, 'cm/min');
  assertWithin('gradientKPerCm', args.gradientKPerCm, GRADIENT_RANGE_K_PER_CM, 'K/cm');
  return quantity(args.pullRateCmPerMin / args.gradientKPerCm, {
    modelId: 'wafer.pointDefect.voronkovRatio',
    unit: 'cm²·min⁻¹·K⁻¹',
    sourceId: 'S101',
    validRange: xiRange(),
    assumptions: [
      'ξ = v/G. 결정화 계면에서 평가한다',
      'G 의 문헌 상·하한은 원장에 없다 — 양수성만 검사하고 판정은 ξ 창으로 한다',
    ],
  });
}

export type DefectRegime = 'interstitial-rich' | 'vacancy-rich';

/**
 * 지배 결함 판정. 원논문 §3.2.1: "The crystal is interstitial-rich for ξ < ξ_crit and
 * vacancy-rich for ξ > ξ_crit."
 */
export function dominantDefectRegime(xi: number, xiCrit: number = XI_CRIT_TYPICAL.value): DefectRegime {
  return xi < xiCrit ? 'interstitial-rich' : 'vacancy-rich';
}
