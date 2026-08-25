import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { PERCENT, SECONDS_PER_MINUTE } from '../units';

/**
 * 건식(플라즈마) 식각 — **물리층. 합성 계수 0건.**
 *
 *  · **심도식각 사이클 공정** — Bosch · STiGer 실측 레시피. 원장 R135·R136 / **S160 Table 1+2**.
 *  · **RIE lag(ARDE)** · **마스크 선택비** — 정의식 + 실측. 원장 R137·R138 / **S161**.
 *  · **Clausing 전달확률** — 원장 R141 / **S162 식 (3)**. **α > 10 에서만 유효**하다고 원문이 명시한다.
 *  · **셀프바이어스 면적비칙** — **S167 식 (1)**. 등급 B(원문이 실기 이탈을 경고).
 *
 * 🔴 **스캘롭의 nm 실측값은 원장에 없다(M-13).** 사이클당 깊이(S160 역산)까지만 계산한다.
 * 🔴 **Mogab 로딩효과 원식은 페이월(M-13)** 이라 구현하지 않는다.
 * 🔴 **S161 은 프리프린트(RIE lag 27 %)가 아니라 게재본(10.8 %)** 을 쓴다.
 */

export type DeepEtchRecipe = 'bosch' | 'stiger';

interface DeepEtchRow {
  readonly cycles: SourcedConst;
  readonly etchStepS: SourcedConst;
  readonly passivationStepS: SourcedConst;
  readonly totalTimeS: SourcedConst;
  readonly depthUm: SourcedConst;
  readonly selectivityToOxide: SourcedConst;
  readonly substrateTempC: SourcedConst;
  readonly trenchWidthUm: SourcedConst;
}

/**
 * S160 Table 1(레시피) + Table 2(결과). **표에 인쇄된 값 그대로**이며, 우리가 조정한 수치는 없다.
 * 🔴 조건값(사이클 수·스텝 시간·기판온도·트렌치 폭)도 문헌 데이터이므로 전부 `withSource` 로 감싼다.
 */
const DEEP_ETCH: Record<DeepEtchRecipe, DeepEtchRow> = {
  bosch: {
    cycles: withSource(30, 'cycle', 'S160'),
    etchStepS: withSource(15, 's', 'S160'),
    passivationStepS: withSource(10, 's', 'S160'),
    totalTimeS: withSource(750, 's', 'S160'),
    depthUm: withSource(31.2, 'µm', 'S160'),
    selectivityToOxide: withSource(138, '', 'S160'),
    substrateTempC: withSource(21.4, '°C', 'S160'),
    trenchWidthUm: withSource(4, 'µm', 'S160'),
  },
  stiger: {
    cycles: withSource(30, 'cycle', 'S160'),
    etchStepS: withSource(15, 's', 'S160'),
    passivationStepS: withSource(7, 's', 'S160'),
    totalTimeS: withSource(660, 's', 'S160'),
    depthUm: withSource(27.8, 'µm', 'S160'),
    selectivityToOxide: withSource(185, '', 'S160'),
    substrateTempC: withSource(-90.0, '°C', 'S160'),
    trenchWidthUm: withSource(4, 'µm', 'S160'),
  },
};

/** 문헌 레시피 조회 — 골든 테스트가 표를 되짚을 때 쓴다. */
export function deepEtchRecipe(recipe: DeepEtchRecipe): {
  cycles: number; etchStepS: number; passivationStepS: number; totalTimeS: number;
  depthUm: number; selectivityToOxide: number; substrateTempC: number; trenchWidthUm: number;
} {
  const r = DEEP_ETCH[recipe];
  return {
    cycles: r.cycles.value,
    etchStepS: r.etchStepS.value,
    passivationStepS: r.passivationStepS.value,
    totalTimeS: r.totalTimeS.value,
    depthUm: r.depthUm.value,
    selectivityToOxide: r.selectivityToOxide.value,
    substrateTempC: r.substrateTempC.value,
    trenchWidthUm: r.trenchWidthUm.value,
  };
}

/** 사이클당 소요 시간 = 식각 스텝 + 패시베이션 스텝. S160 Table 1. */
function cycleTimeS(recipe: DeepEtchRecipe): number {
  const r = DEEP_ETCH[recipe];
  return r.etchStepS.value + r.passivationStepS.value;
}

/** 사이클당 깊이 = 총 깊이 / 사이클 수. S160 Table 1·2 역산 (원장 §3-4: 1.04 µm/cycle). */
export function deepEtchCycleDepth(recipe: DeepEtchRecipe): Quantity {
  const r = DEEP_ETCH[recipe];
  return quantity(r.depthUm.value / r.cycles.value, {
    modelId: 'etch.dry.cycleDepth',
    unit: 'µm/cycle',
    sourceId: 'S160',
    validRange: [0, r.depthUm.value],
    assumptions: [
      '사이클당 깊이가 일정하다고 본다 — S160 이 총 깊이와 사이클 수만 인쇄했다',
      '🔴 스캘롭의 nm 치수는 원장에 없다(M-13). 여기서 계산하지 않는다',
    ],
  });
}

/** 평균 식각속도 = 총 깊이 / 총 시간. 원장 R135(2.50) · R136(2.53) µm/min. */
export function deepEtchAverageRate(recipe: DeepEtchRecipe): Quantity {
  const r = DEEP_ETCH[recipe];
  const minutes = r.totalTimeS.value / SECONDS_PER_MINUTE;
  return quantity(r.depthUm.value / minutes, {
    modelId: 'etch.dry.averageRate',
    unit: 'µm/min',
    sourceId: 'S160',
    validRange: [0, r.depthUm.value],
    assumptions: [
      recipe === 'bosch' ? 'Bosch, 기판 +21.4 °C' : 'STiGer, 기판 −90.0 °C',
      `트렌치 폭 ${r.trenchWidthUm.value} µm`,
    ],
  });
}

/**
 * 사이클 수 입력의 실용 구간. **문헌값이 아니라 UI 안전장치**이므로
 * 출처를 붙이지 않고 허용 리터럴만으로 적는다(규약 §2-3).
 */
export const CYCLE_COUNT_RANGE: [number, number] = [1, 100];

/** S161 이 보고한 최대 식각 깊이 — 깊이 출력의 유효범위 상한으로 쓴다. */
export const MAX_MEASURED_DEPTH_UM = withSource(141, 'µm', 'S161');

/** 사이클 수 → 깊이. 사이클당 깊이(문헌 역산)를 곱한다. */
export function deepEtchDepth(args: { recipe: DeepEtchRecipe; cycles: number }): Quantity {
  assertWithin('cycles', args.cycles, CYCLE_COUNT_RANGE, 'cycle');
  const perCycle = DEEP_ETCH[args.recipe].depthUm.value / DEEP_ETCH[args.recipe].cycles.value;
  return quantity(perCycle * args.cycles, {
    modelId: 'etch.dry.depth',
    unit: 'µm',
    sourceId: 'S160',
    validRange: [0, MAX_MEASURED_DEPTH_UM.value],
    assumptions: ['사이클당 깊이 일정 가정. ARDE 로 실제로는 깊어질수록 느려진다(S161)'],
  });
}

/** 사이클 수 → 소요 시간(분). */
export function deepEtchTime(args: { recipe: DeepEtchRecipe; cycles: number }): Quantity {
  assertWithin('cycles', args.cycles, CYCLE_COUNT_RANGE, 'cycle');
  const totalS = cycleTimeS(args.recipe) * args.cycles;
  return quantity(totalS / SECONDS_PER_MINUTE, {
    modelId: 'etch.dry.time',
    unit: 'min',
    sourceId: 'S160',
    validRange: [0, (cycleTimeS(args.recipe) * CYCLE_COUNT_RANGE[1]) / SECONDS_PER_MINUTE],
  });
}

/** Si:SiO₂ 선택비 — 문헌 실측(Bosch 138 · STiGer 185). S160 Table 2. */
export function deepEtchOxideSelectivity(recipe: DeepEtchRecipe): Quantity {
  const r = DEEP_ETCH[recipe];
  return quantity(r.selectivityToOxide.value, {
    modelId: 'etch.dry.oxideSelectivity',
    unit: '',
    sourceId: 'S160',
    validRange: [0, r.selectivityToOxide.value],
  });
}

/* ────────────────────────────── RIE lag · 마스크 선택비 (S161) ────────────────────────────── */

/**
 * **RIE lag (ARDE)** `lag = (d_wide − d_narrow)/d_wide`. S161 Fig. 2 캡션.
 * 🔴 게재본 수치(20 µm → 38.8 µm, 5 µm → 34.6 µm, lag 10.8 %)를 쓴다.
 *    arXiv 프리프린트의 27 % 는 채택하지 않는다.
 */
export function rieLag(args: { wideDepthUm: number; narrowDepthUm: number }): Quantity {
  assertWithin('wideDepthUm', args.wideDepthUm, [Number.MIN_VALUE, MAX_MEASURED_DEPTH_UM.value], 'µm');
  assertWithin('narrowDepthUm', args.narrowDepthUm, [0, args.wideDepthUm], 'µm');
  const lag = (args.wideDepthUm - args.narrowDepthUm) / args.wideDepthUm;
  return quantity(lag * PERCENT, {
    modelId: 'etch.dry.rieLag',
    unit: '%',
    sourceId: 'S161',
    validRange: [0, PERCENT],
    assumptions: ['같은 웨이퍼·같은 레시피에서 폭만 다른 두 트렌치의 깊이 차'],
  });
}

/** S161 Fig. 2 게재본 실측 — 골든값 R137 의 입력. */
export const RIE_LAG_WIDE_DEPTH_UM = withSource(38.8, 'µm', 'S161');
export const RIE_LAG_NARROW_DEPTH_UM = withSource(34.6, 'µm', 'S161');
export const RIE_LAG_WIDE_WIDTH_UM = withSource(20, 'µm', 'S161');
export const RIE_LAG_NARROW_WIDTH_UM = withSource(5, 'µm', 'S161');

/** S161 §2.1 실측 — 골든값 R138 의 입력. */
export const MASK_CONSUMED_UM = withSource(2, 'µm', 'S161');
export const MASK_TRENCH_WIDTH_UM = withSource(200, 'µm', 'S161');

/**
 * 마스크 소모량 입력 구간. 상한은 문헌 실측(2 µm, S161), 하한은 UI 안전장치(허용 리터럴 0.5).
 */
export const MASK_CONSUMED_RANGE_UM: [number, number] = [0.5, MASK_CONSUMED_UM.value];

/**
 * 마스크 선택비 `S = 식각 깊이 / 마스크 소모 두께`. S161 §2.1 (141 µm / 2 µm = 71).
 */
export function maskSelectivity(args: { depthUm: number; maskConsumedUm: number }): Quantity {
  assertWithin('depthUm', args.depthUm, [0, MAX_MEASURED_DEPTH_UM.value], 'µm');
  assertWithin('maskConsumedUm', args.maskConsumedUm, MASK_CONSUMED_RANGE_UM, 'µm');
  return quantity(args.depthUm / args.maskConsumedUm, {
    modelId: 'etch.dry.maskSelectivity',
    unit: '',
    sourceId: 'S161',
    validRange: [0, MAX_MEASURED_DEPTH_UM.value / MASK_CONSUMED_RANGE_UM[0]],
  });
}

/* ────────────────────────────── Clausing 전달확률 (S162) ────────────────────────────── */

/**
 * 🔴 **α > 10 에서만 유효**하다고 S162 가 명시한다(그 구간에서 정밀값 대비 오차 < 4.4 %).
 *    그 이하는 오차가 급증하므로 **계산하지 않고 정지**시킨다.
 */
const CLAUSING_ALPHA_MIN = withSource(10, '', 'S162');
/** 상한은 문헌값이 아니라 UI 안전장치다. 허용 리터럴만으로 적는다. */
export const CLAUSING_ALPHA_RANGE: [number, number] = [CLAUSING_ALPHA_MIN.value, 100];

/**
 * Clausing 전달확률 근사 `K ≈ ln(α)/α` (슬릿형). S162 식 (3).
 * 종횡비가 커질수록 컨덕턴스가 떨어져 반응종 공급이 줄고, 이것이 ARDE 의 물리적 뿌리다.
 */
export function clausingTransmission(aspectRatio: number): Quantity {
  assertWithin('aspectRatio', aspectRatio, CLAUSING_ALPHA_RANGE, '');
  return quantity(Math.log(aspectRatio) / aspectRatio, {
    modelId: 'etch.dry.clausingTransmission',
    unit: '',
    sourceId: 'S162',
    validRange: [0, Math.log(CLAUSING_ALPHA_MIN.value) / CLAUSING_ALPHA_MIN.value],
    assumptions: [
      '슬릿형 개구, 자유분자류',
      `🔴 α > ${CLAUSING_ALPHA_MIN.value} 에서만 유효 — 원문이 오차 <4.4 % 를 이 구간에 한정했다`,
    ],
  });
}

/* ────────────────────────────── 셀프바이어스 면적비칙 (S167) ────────────────────────────── */

/**
 * 셀프바이어스 면적비칙 `V₁/V₂ = (A₂/A₁)^q`. S167 식 (1).
 * 🔴 **등급 B** — 원문이 q = 4 를 **이상화 한계**로 제시하고 실기 이탈을 경고한다.
 */
const SELF_BIAS_EXPONENT = withSource(4, '', 'S167');
/** 면적비 입력 구간 — UI 안전장치. 허용 리터럴. */
export const AREA_RATIO_RANGE: [number, number] = [1, 100];

export function selfBiasVoltageRatio(areaRatio: number): Quantity {
  assertWithin('areaRatio', areaRatio, AREA_RATIO_RANGE, '');
  return quantity(Math.pow(areaRatio, SELF_BIAS_EXPONENT.value), {
    modelId: 'etch.dry.selfBiasRatio',
    unit: '',
    sourceId: 'S167',
    validRange: [0, Math.pow(AREA_RATIO_RANGE[1], SELF_BIAS_EXPONENT.value)],
    assumptions: [
      'A₂/A₁ = 접지전극 면적 / 구동전극 면적',
      '🔴 q = 4 는 이상화 한계값이다(S167). 실기에서는 더 작게 나온다고 원문이 경고한다',
    ],
  });
}

export function selfBiasExponent(): number {
  return SELF_BIAS_EXPONENT.value;
}
