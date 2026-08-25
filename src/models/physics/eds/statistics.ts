import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { normalCdf, probit } from './normalStats';

/**
 * EDS 통계층 — 공정능력 · 관리도 · 수율 분해. **문헌식·문헌계수만.**
 *
 *  - **S224** NIST/SEMATECH e-Handbook §6.1.6(Cp·Cpk) · §6.3.2.1(Shewhart) — **미국 정부 저작물**
 *  - **S225** Tables of Constants for Control Charts (A₂·d₂·D₃·D₄)
 *  - **S220** Leachman IEOR 130 §7 — binomial-sigma 분해 식 (16)(17)
 *
 * 🔴 **등급 C 항목은 여기에 없다.** %GRR 10/30 % 와 Cpk 1.33/1.67/2.00 은 **2차 인용**이며
 *    S224(NIST)는 임계를 규정하지 않는다. **합격/불합격을 가르는 데 쓰지 않는다** —
 *    필요하면 문항이 조건으로 제시한다(k₂·Black A 와 같은 처리, A15-op op-3).
 */

/* ------------------------------------------------------------------ *
 * 1. A7 — 공정능력지수 → 불량률
 * ------------------------------------------------------------------ */

/**
 * 🔴 정의식의 계수 3. S224 §6.1.6 이 인쇄한 식
 *   `Cp = (USL − LSL)/(6σ)` · `Cpk = min[(USL − µ)/3σ, (µ − LSL)/3σ]`
 * 의 일부다. 대수 전개로 없앨 수 있는 상수가 아니라 **문헌이 정한 정의값**이므로 출처를 붙인다.
 * 6σ 는 `2 × 3σ` 로 쓴다 — 별도 상수를 만들지 않는다.
 */
const CAPABILITY_SIGMA_SPAN = withSource(3, 'σ', 'S224');

const POSITIVE: [number, number] = [0, Number.POSITIVE_INFINITY];
/**
 * 🔴 0 을 허용하지 않는 입력(분모로 들어가는 σ·R̄·규격폭).
 * 하한을 배정도 최소 양수로 두면 리터럴 없이 「0 초과」를 표현할 수 있다.
 */
const STRICTLY_POSITIVE: [number, number] = [Number.MIN_VALUE, Number.POSITIVE_INFINITY];
const UNIT_INTERVAL: [number, number] = [0, 1];

/** **A7** 공정능력 `Cp = (USL − LSL)/(6σ)` — S224 §6.1.6. */
export function processCapability(args: { usl: number; lsl: number; sigma: number }): Quantity {
  assertWithin('sigma', args.sigma, STRICTLY_POSITIVE, '');
  const specWidth = args.usl - args.lsl;
  assertWithin('USL − LSL', specWidth, STRICTLY_POSITIVE, '');
  return quantity(specWidth / (2 * CAPABILITY_SIGMA_SPAN.value * args.sigma), {
    modelId: 'eds.spc.cp',
    unit: '',
    sourceId: 'S224',
    validRange: POSITIVE,
    assumptions: ['공정이 중심에 있다고 가정한다 — 치우침은 Cpk 가 본다'],
  });
}

/** **A7** `Cpk = min[(USL − µ)/3σ, (µ − LSL)/3σ]` — S224 §6.1.6. */
export function processCapabilityK(args: {
  usl: number; lsl: number; mean: number; sigma: number;
}): Quantity {
  assertWithin('sigma', args.sigma, STRICTLY_POSITIVE, '');
  const denom = CAPABILITY_SIGMA_SPAN.value * args.sigma;
  const upper = (args.usl - args.mean) / denom;
  const lower = (args.mean - args.lsl) / denom;
  return quantity(Math.min(upper, lower), {
    modelId: 'eds.spc.cpk',
    unit: '',
    sourceId: 'S224',
    validRange: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
    assumptions: [
      '정규분포 가정',
      '🔴 임계값 1.33/1.67/2.00 은 2차 인용이라 판정에 쓰지 않는다 — 문항이 조건으로 제시한다',
    ],
  });
}

/**
 * **A7** 중심 잡힌 공정의 양쪽 꼬리 불량률 `p = 2·Φ(−3·Cp)` (분율).
 * 골든값 R184~R187 이 이 함수를 겨눈다: 6σ 폭 0.27 % · 8σ 64 ppm · 10σ 0.6 ppm · 12σ 2 ppb.
 */
export function defectiveFractionCentered(cp: number): Quantity {
  assertWithin('cp', cp, POSITIVE, '');
  return quantity(2 * normalCdf(-CAPABILITY_SIGMA_SPAN.value * cp), {
    modelId: 'eds.spc.defectiveCentered',
    unit: '',
    sourceId: 'S224',
    validRange: UNIT_INTERVAL,
    assumptions: ['정규분포 · 공정 중심 = 규격 중심'],
  });
}

/** 치우친 공정에서 **가까운 쪽 한 방향** 꼬리 불량률 `p = Φ(−3·Cpk)`. */
export function defectiveFractionOneSided(cpk: number): Quantity {
  return quantity(normalCdf(-CAPABILITY_SIGMA_SPAN.value * cpk), {
    modelId: 'eds.spc.defectiveOneSided',
    unit: '',
    sourceId: 'S224',
    validRange: UNIT_INTERVAL,
    assumptions: ['정규분포', '규격 한쪽(µ 에 가까운 쪽)의 꼬리만 센다'],
  });
}

/* ------------------------------------------------------------------ *
 * 2. A8 — Shewhart 관리도 상수
 * ------------------------------------------------------------------ */

interface ControlChartRow {
  readonly a2: SourcedConst;
  readonly d2: SourcedConst;
  readonly d4: SourcedConst;
  /** n < 7 에서는 표가 값을 인쇄하지 않는다 — 지어내지 않고 비워 둔다. */
  readonly n: SourcedConst;
  readonly d3?: SourcedConst;
}

/**
 * **A8** 관리도 상수 — 골든값 R189 가 인쇄한 표본크기만 등재한다(n = 2·5·10·25).
 * 🔴 **표에 없는 n 은 보간하지 않고 거부**한다(원장 규칙 1). 출처는 S225 와 S224 교차확인.
 */
/**
 * 🔴 표본크기 n 자체도 문헌 데이터다 — 우리가 고른 값이 아니라 표가 인쇄한 행이다.
 *    그래서 Map 키(생 숫자) 대신 `withSource` 로 감싼 배열로 둔다.
 *    별칭 함수로 줄여 쓰지 않는다 — CI 는 `withSource(` 의 첫 인자만 면제한다.
 */
const CONTROL_CHART: readonly ControlChartRow[] = [
  {
    n: withSource(2, 'ea', 'S225'),
    a2: withSource(1.880, '', 'S225'),
    d2: withSource(1.128, '', 'S225'),
    d4: withSource(3.267, '', 'S225'),
  },
  {
    n: withSource(5, 'ea', 'S225'),
    a2: withSource(0.577, '', 'S225'),
    d2: withSource(2.326, '', 'S225'),
    d4: withSource(2.114, '', 'S225'),
  },
  {
    n: withSource(10, 'ea', 'S225'),
    a2: withSource(0.308, '', 'S225'),
    d2: withSource(3.078, '', 'S225'),
    d4: withSource(1.777, '', 'S225'),
    d3: withSource(0.223, '', 'S225'),
  },
  {
    n: withSource(25, 'ea', 'S225'),
    a2: withSource(0.153, '', 'S225'),
    d2: withSource(3.931, '', 'S225'),
    d4: withSource(1.541, '', 'S225'),
    d3: withSource(0.459, '', 'S225'),
  },
];

export const CONTROL_CHART_SAMPLE_SIZES: number[] = CONTROL_CHART.map((r) => r.n.value);

export function controlChartConstants(subgroupSize: number): {
  a2: number; d2: number; d4: number; d3?: number;
} {
  const row = CONTROL_CHART.find((r) => r.n.value === subgroupSize);
  if (!row) {
    throw new Error(
      `[S225] 표본크기 n = ${subgroupSize} 의 관리도 상수가 원장에 없다. `
      + `등재: n = ${CONTROL_CHART_SAMPLE_SIZES.join(', ')}. 보간하지 않는다.`,
    );
  }
  return row.d3
    ? { a2: row.a2.value, d2: row.d2.value, d4: row.d4.value, d3: row.d3.value }
    : { a2: row.a2.value, d2: row.d2.value, d4: row.d4.value };
}

/** X̄ 관리한계 `X̿ ± A₂·R̄` — S224 §6.3.2.1. */
export function xBarControlLimits(args: {
  grandMean: number; meanRange: number; subgroupSize: number;
}): { upper: Quantity; lower: Quantity } {
  assertWithin('meanRange', args.meanRange, STRICTLY_POSITIVE, '');
  const { a2 } = controlChartConstants(args.subgroupSize);
  const half = a2 * args.meanRange;
  const span: [number, number] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  return {
    upper: quantity(args.grandMean + half, {
      modelId: 'eds.spc.xbarUcl', unit: '', sourceId: 'S224', validRange: span,
    }),
    lower: quantity(args.grandMean - half, {
      modelId: 'eds.spc.xbarLcl', unit: '', sourceId: 'S224', validRange: span,
    }),
  };
}

/** R 관리도 상한 `D₄·R̄` — S224 §6.3.2.1. */
export function rangeChartUpperLimit(args: { meanRange: number; subgroupSize: number }): Quantity {
  assertWithin('meanRange', args.meanRange, STRICTLY_POSITIVE, '');
  const { d4 } = controlChartConstants(args.subgroupSize);
  return quantity(d4 * args.meanRange, {
    modelId: 'eds.spc.rUcl', unit: '', sourceId: 'S224', validRange: POSITIVE,
  });
}

/** R 관리도 하한 `D₃·R̄`. 🔴 표가 D₃ 를 인쇄하지 않는 n 에서는 **계산을 거부**한다. */
export function rangeChartLowerLimit(args: { meanRange: number; subgroupSize: number }): Quantity {
  assertWithin('meanRange', args.meanRange, STRICTLY_POSITIVE, '');
  const row = controlChartConstants(args.subgroupSize);
  if (row.d3 === undefined) {
    throw new Error(
      `[S225] n = ${args.subgroupSize} 에는 D₃ 가 인쇄돼 있지 않다. `
      + `0 으로 채우지 않는다 — R 관리도 하한을 표시하지 않는다.`,
    );
  }
  return quantity(row.d3 * args.meanRange, {
    modelId: 'eds.spc.rLcl', unit: '', sourceId: 'S224', validRange: POSITIVE,
  });
}

/** R̄ 로부터의 σ 추정 `σ̂ = R̄/d₂` — S224 §6.3.2.1. */
export function sigmaFromMeanRange(args: { meanRange: number; subgroupSize: number }): Quantity {
  assertWithin('meanRange', args.meanRange, STRICTLY_POSITIVE, '');
  const { d2 } = controlChartConstants(args.subgroupSize);
  return quantity(args.meanRange / d2, {
    modelId: 'eds.spc.sigmaHat', unit: '', sourceId: 'S224', validRange: POSITIVE,
  });
}

/* ------------------------------------------------------------------ *
 * 3. A6 — binomial-sigma 로 Y_R / Y_S 분해
 * ------------------------------------------------------------------ */

/**
 * **A6-1** 최대관측 다이수율이 랜덤수율 평균에서 몇 σ 떨어져 있는가:
 *   `k = Φ⁻¹(1 − l/n)`  (l = MY 가 나타난 다이사이트 수, n = 후보 다이사이트 수) — S220 §7.
 */
export function maxYieldSigmaDistance(args: { sitesAtMax: number; candidateSites: number }): Quantity {
  assertWithin('sitesAtMax', args.sitesAtMax, STRICTLY_POSITIVE, 'sites');
  assertWithin('candidateSites', args.candidateSites, STRICTLY_POSITIVE, 'sites');
  if (args.sitesAtMax >= args.candidateSites) {
    throw new Error('[S220 §7] l < n 이어야 한다 — 최대수율 사이트 수가 후보 사이트 수 이상이다.');
  }
  return quantity(probit(1 - args.sitesAtMax / args.candidateSites), {
    modelId: 'eds.yield.maxSigmaDistance',
    unit: 'σ',
    sourceId: 'S220',
    validRange: POSITIVE,
    assumptions: ['웨이퍼 표본이 충분히 커서 이항 수율 분포가 정규로 근사된다 — S220 §7'],
  });
}

/**
 * **A6-2** 랜덤 결함 제한 수율 Y_R — S220 §7 식 (16)(17):
 *   `MY = Y_R + k·√(Y_R(1 − Y_R)/m)`  → 이차방정식으로 푼다.
 *   `(1+c)·Y_R² − (2·MY + c)·Y_R + MY² = 0`,  `c = k²/m`
 * 두 근 중 **MY 이하인 작은 근**이 답이다(최대관측수율은 평균보다 위에 있어야 한다).
 *
 * 골든값 **R188**: m=755, n=372, l=1, MY=57 %, DY=43.1 % → k=2.78 · Y_R=51.8 % · Y_S=83.2 %.
 */
export function randomYieldFromMaxObserved(args: {
  maxDieYield: number; wafers: number; candidateSites: number; sitesAtMax: number;
}): Quantity {
  assertWithin('maxDieYield', args.maxDieYield, UNIT_INTERVAL, '');
  assertWithin('wafers', args.wafers, STRICTLY_POSITIVE, 'wafers');
  const k = maxYieldSigmaDistance(args).value;
  const my = args.maxDieYield;
  const c = (k * k) / args.wafers;
  const b = 2 * my + c;
  const disc = b * b - 2 * (2 * (1 + c) * my * my);
  if (disc < 0) {
    throw new Error('[S220 §7] 식 (17) 의 판별식이 음수다 — 입력 조합이 이 근사와 맞지 않는다.');
  }
  const yr = (b - Math.sqrt(disc)) / (2 * (1 + c));
  return quantity(yr, {
    modelId: 'eds.yield.randomFromMaxObserved',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
    assumptions: [
      'binomial-sigma 법 — 가장자리·이상변동 사이트를 제외한 후보 사이트만 쓴다(S220 §7)',
      `k = Φ⁻¹(1 − ${args.sitesAtMax}/${args.candidateSites}) = ${k.toPrecision(4)}`,
    ],
  });
}
