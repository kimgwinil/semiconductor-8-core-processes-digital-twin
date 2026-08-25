import {
  OutOfLimitError, assertWithin, quantity, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';

/**
 * EDS 수율 모델 — **물리·통계층. 합성 계수 0건.**
 *
 * 정본 출처
 *  - **S220** Leachman, IEOR 130 *Yield Modeling and Analysis* — 식 (2) Poisson · (9) Murphy ·
 *    (10) Seeds · (11) Bose–Einstein · (12) 음이항 · (14) DY = Y_S·Y_R · §5 적용한계 · §8 학습률
 *  - **S221** Bogdanov et al., *Statistical Yield Modeling…* — Poisson 수율표(R175·R176)
 *  - **S222** Parhami, *Dependable Computing* Ch.5 — 음이항 Example 5.2 (R177~R180)
 *  - **S223** ITRS 2009 Yield Enhancement — Y = Y_M·Y_S·Y_R · **α = 2**
 *  - **S148** — 웨이퍼당 다이 수(R131)
 *  - **S227** — 결함수준 DL (2차 출처. 1차 S232 는 오픈액세스 부재 확정 → 등급 하향)
 *
 * 🔴 명칭 충돌 3건은 원장 §2-6 각주대로 처리했다.
 *   1. Seeds = `1/(1+AD)` (S220 식 10 계보). `e^(−√(AD))` 를 Seeds 라 부르는 웹자료는 따르지 않는다.
 *   2. Bose–Einstein `(1+AD)^(−n)` ≠ 음이항 `(1+AD/α)^(−α)`. **분리 구현**했다.
 *   3. Murphy 정본은 `((1−e^(−AD))/(AD))²`. `(1+DA)e^(−DA)` 는 오기다.
 */

/* ------------------------------------------------------------------ *
 * 1. 문헌 상수
 * ------------------------------------------------------------------ */

/** 🔴 A4 — Poisson 적용한계. S220 §2·§5 가 명시: "A ≤ 0.25 sq cm" 또는 "D₀A < 1.0". */
export const POISSON_AREA_LIMIT_CM2 = withSource(0.25, 'cm²', 'S220');
export const POISSON_AD_LIMIT = withSource(1, '', 'S220');

/**
 * 🔴 음이항 클러스터 계수 α 의 기본값 = **2**.
 * ITRS 2009(S223)가 MPU·DRAM·Flash 전 제품군에 α=2 를 쓴다. 교재값 3~4(S222)·1(Seeds)은 프리셋.
 */
export const ALPHA_DEFAULT = withSource(2, '', 'S223');

/** 「파생 기대값」 표식 — 식은 문헌이지만 **대조할 문헌 인쇄 수치가 없다**(M-20). */
export const DERIVED_EXPECTATION = '[파생 기대값] 문헌 인쇄 수치표 미확보(M-20) — T2 골든값 아님';

/**
 * α 유효범위 0.3–7. **S221 §2 식 (17) 바로 다음 문단이 그대로 인쇄한 값이다:**
 * "The parameter a is called the cluster parameter. **Its typical values approximately range
 * from 0.3 to 7.** In actual fact, fault clustering disappears if a exceeds 4 or 5…"
 *
 * 🔴 2026-08-22 원문 대조로 **닫은 항목**(arXiv physics/0303039 전문 확인). 종전에는 주석이
 *    뒷문장(「α > 4~5 면 클러스터링 소멸」)만 인용해 **0.3 도 7 도 담지 않는 근거**처럼 보였고,
 *    그래서 「출처가 그 진술을 뒷받침하는가」 판독에서 UNDETERMINED 로 남아 있었다.
 *    **두 숫자는 같은 문단 앞문장에 있다 — 인용이 부족했던 것이지 오귀속이 아니다.** 표기 유지.
 * ⚠️ 다만 원문 표현은 "**typical values approximately**" 로 **전형값의 대략적 범위**이지 물리적
 *    상·하한이 아니다. 이 값을 `assertWithin` 하드 경계로 쓰는 것은 문헌보다 강한 주장이다
 *    (원문 기호도 α 가 아니라 `a` 다). 경계를 완화·강화하려면 원장 재판정이 먼저다.
 */
const ALPHA_MIN = withSource(0.3, '', 'S221');
const ALPHA_MAX = withSource(7, '', 'S221');
export const ALPHA_RANGE: [number, number] = [ALPHA_MIN.value, ALPHA_MAX.value];

/**
 * 🔴 상한이 문헌에 없는 입력은 **지어내지 않고 무한대로 둔다.**
 * assertWithin 은 음수·NaN 만 걸러내고, 판정은 문헌이 준 한계(POISSON_*)가 담당한다.
 */
const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];
/** 수율·커버리지처럼 정의상 [0, 1] 인 무차원량. */
const UNIT_INTERVAL: [number, number] = [0, 1];

/**
 * 수율 학습률 γ [1/month] — S220 §8 Table 2 「Average」 열.
 * SEMATECH 회원사 5곳(아시아 1·유럽 2·미국 2) 실측을 노드별로 평균한 값이다.
 */
export const LEARNING_RATE_PER_MONTH: Readonly<Record<string, SourcedConst>> = Object.freeze({
  '350nm': withSource(0.045, '1/month', 'S220'),
  '250nm': withSource(0.041, '1/month', 'S220'),
  '180nm': withSource(0.067, '1/month', 'S220'),
});

export type TechnologyNode = '350nm' | '250nm' | '180nm';

/* ------------------------------------------------------------------ *
 * 2. A4 — Poisson 적용한계 게이트
 * ------------------------------------------------------------------ */

/** S220 §5 판정: 「A ≤ 0.25 cm²」 **또는** 「A·D₀ < 1.0」 이면 Poisson 을 써도 된다. */
export function poissonApplicable(areaCm2: number, defectDensityPerCm2: number): boolean {
  return areaCm2 <= POISSON_AREA_LIMIT_CM2.value
    || areaCm2 * defectDensityPerCm2 < POISSON_AD_LIMIT.value;
}

/**
 * 🔴 적용한계를 넘으면 **계산하지 않고 정지**한다(규약 §1).
 * 현 제품이 `A·D₀ ≤ 4` 에서 Poisson 단독을 쓰고 있었다 — 문헌 한계의 4배다.
 */
export function assertPoissonApplicable(areaCm2: number, defectDensityPerCm2: number): void {
  if (poissonApplicable(areaCm2, defectDensityPerCm2)) return;
  throw new OutOfLimitError(
    'A·D₀ (Poisson 적용한계 — S220 §2·§5)',
    areaCm2 * defectDensityPerCm2,
    [0, POISSON_AD_LIMIT.value],
    '',
  );
}

/* ------------------------------------------------------------------ *
 * 3. 수율 모델
 * ------------------------------------------------------------------ */

interface DefectArgs { areaCm2: number; defectDensityPerCm2: number }

function assertDefectArgs(args: DefectArgs): number {
  assertWithin('areaCm2', args.areaCm2, NON_NEGATIVE, 'cm²');
  assertWithin('defectDensityPerCm2', args.defectDensityPerCm2, NON_NEGATIVE, '/cm²');
  return args.areaCm2 * args.defectDensityPerCm2;
}

/** **A1** Poisson 수율 `Y = e^(−A·D₀)` — S220 식 (2) · S221. 적용한계 밖이면 정지한다. */
export function poissonYield(args: DefectArgs): Quantity {
  const ad = assertDefectArgs(args);
  assertPoissonApplicable(args.areaCm2, args.defectDensityPerCm2);
  return quantity(Math.exp(-ad), {
    modelId: 'eds.yield.poisson',
    unit: '',
    sourceId: 'S221',
    validRange: UNIT_INTERVAL,
    assumptions: [
      '결함이 웨이퍼 위에 무작위·독립으로 분포한다(클러스터링 없음)',
      `적용한계 준수: A ≤ ${POISSON_AREA_LIMIT_CM2.value} cm² 또는 A·D₀ < ${POISSON_AD_LIMIT.value} (S220 §5)`,
    ],
  });
}

/** Poisson 역산 `D₀ = −ln(DY)/A` — S220 식 (3). */
export function defectDensityFromPoissonYield(args: { dieYield: number; areaCm2: number }): Quantity {
  assertWithin('dieYield', args.dieYield, UNIT_INTERVAL, '');
  // 🔴 면적이 분모로 들어가므로 0 을 허용하지 않는다. 리터럴 없이 「0 초과」를 표현한다.
  assertWithin('areaCm2', args.areaCm2, [Number.MIN_VALUE, Number.POSITIVE_INFINITY], 'cm²');
  return quantity(-Math.log(args.dieYield) / args.areaCm2, {
    modelId: 'eds.yield.poissonInverse',
    unit: '/cm²',
    sourceId: 'S220',
    validRange: NON_NEGATIVE,
  });
}

/** **A2** 음이항 수율 `Y = (1 + A·D₀/α)^(−α)` — S220 식 (12) · S222 Example 5.2. 기본 α = 2(S223). */
export function negativeBinomialYield(args: DefectArgs & { alpha?: number }): Quantity {
  const ad = assertDefectArgs(args);
  const alpha = args.alpha ?? ALPHA_DEFAULT.value;
  assertWithin('alpha', alpha, ALPHA_RANGE, '');
  return quantity(Math.pow(1 + ad / alpha, -alpha), {
    modelId: 'eds.yield.negativeBinomial',
    unit: '',
    sourceId: 'S222',
    validRange: UNIT_INTERVAL,
    assumptions: [
      '결함밀도 D 가 감마분포를 따른다(클러스터링) — S220 식 (12)',
      `α = ${alpha}${args.alpha === undefined ? ' (기본값 — ITRS 2009 전 제품군 채택, S223)' : ''}`,
    ],
  });
}

/**
 * **A3** Murphy 수율 `Y = ((1 − e^(−A·D₀))/(A·D₀))²` — S220 식 (9).
 * ⚠️ **골든값 없음(M-20).** 문헌 인쇄 수치표를 확보하지 못했다 → **T2 골든 테스트에 넣지 않는다.**
 *    화면에서도 「파생 기대값」으로 분리 표시한다. 식 출처(S220 식 9) 표기는 필수.
 */
export function murphyYield(args: DefectArgs): Quantity {
  const ad = assertDefectArgs(args);
  // AD → 0 극한은 1 이다. 0 으로 나누지 않고 정의값을 돌려준다.
  const y = ad === 0 ? 1 : Math.pow((1 - Math.exp(-ad)) / ad, 2);
  return quantity(y, {
    modelId: 'eds.yield.murphy',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
    assumptions: [
      DERIVED_EXPECTATION,
      '결함밀도 D 가 0~2D₀ 대칭 삼각분포를 따른다 — S220 식 (9)',
    ],
  });
}

/**
 * **A3** Seeds 수율 `Y = 1/(1 + A·D₀)` — S220 식 (10).
 * S220·S221 계보의 정의를 정본으로 삼는다(원장 §2-6 각주 1). 음이항 α = 1 과 등가다.
 * ⚠️ Murphy 와 같은 이유로 **T2 골든값 없음(M-20)**.
 */
export function seedsYield(args: DefectArgs): Quantity {
  const ad = assertDefectArgs(args);
  return quantity(1 / (1 + ad), {
    modelId: 'eds.yield.seeds',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
    assumptions: [
      DERIVED_EXPECTATION,
      '결함밀도 D 가 지수분포를 따른다 — S220 식 (10). 음이항 α = 1 과 등가',
    ],
  });
}

/**
 * Bose–Einstein 수율 `Y = (1/(1 + A·D₀))^n` — S220 식 (11). n = 임계 마스크층 수.
 * 🔴 **음이항과 다른 식이다.** n = α 로 두어도 일치하지 않는다(원장 §2-6 각주 2).
 */
export function boseEinsteinYield(args: DefectArgs & { criticalLayers: number }): Quantity {
  const ad = assertDefectArgs(args);
  assertWithin('criticalLayers', args.criticalLayers, NON_NEGATIVE, 'layers');
  return quantity(Math.pow(1 / (1 + ad), args.criticalLayers), {
    modelId: 'eds.yield.boseEinstein',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
    assumptions: [
      DERIVED_EXPECTATION,
      '임계층마다 Seeds 모델이 성립하고 층별 수율이 곱해진다 — S220 식 (11)',
    ],
  });
}

/**
 * 🔴 **A4 자동 전환.** 적용한계 안이면 Poisson, 밖이면 음이항(기본 α=2)으로 **자동 전환**하고
 * 전환 사실을 `assumptions` 에 남긴다. 한계를 넘은 채 Poisson 을 쓰는 일이 없게 하는 진입점이다.
 */
export function dieYield(args: DefectArgs & { alpha?: number }): Quantity {
  const ad = assertDefectArgs(args);
  const applicable = poissonApplicable(args.areaCm2, args.defectDensityPerCm2);
  const alpha = args.alpha ?? ALPHA_DEFAULT.value;
  if (applicable) {
    return quantity(Math.exp(-ad), {
      modelId: 'eds.yield.auto',
      unit: '',
      sourceId: 'S221',
      validRange: UNIT_INTERVAL,
      assumptions: [`Poisson 적용 — A·D₀ = ${ad.toPrecision(4)} 가 S220 §5 적용한계 안이다`],
    });
  }
  assertWithin('alpha', alpha, ALPHA_RANGE, '');
  return quantity(Math.pow(1 + ad / alpha, -alpha), {
    modelId: 'eds.yield.auto',
    unit: '',
    sourceId: 'S222',
    validRange: UNIT_INTERVAL,
    assumptions: [
      `🔴 Poisson 적용한계 초과(A = ${args.areaCm2} cm² > ${POISSON_AREA_LIMIT_CM2.value} 이고 `
      + `A·D₀ = ${ad.toPrecision(4)} ≥ ${POISSON_AD_LIMIT.value}) — 음이항(α = ${alpha})으로 전환했다. S220 §5`,
    ],
  });
}

/** 자동 전환이 실제로 어느 모델을 골랐는지 — 화면 배지용. */
export function dieYieldModelUsed(args: DefectArgs): 'poisson' | 'negativeBinomial' {
  return poissonApplicable(args.areaCm2, args.defectDensityPerCm2) ? 'poisson' : 'negativeBinomial';
}

/* ------------------------------------------------------------------ *
 * 4. A5 — 종합수율 분해
 * ------------------------------------------------------------------ */

/**
 * **A5** 종합수율 `Y = Y_M · Y_S · Y_R` — S223(ITRS 2009 Yield Enhancement) Table YE3 구조.
 * ⚠️ R182·R183 은 **㉱ 로드맵 목표**다. 「구조 정합성」 확인용이지 물리 재현이 아니다.
 */
export function overallYield(args: {
  materialYield: number; systematicYield: number; randomYield: number;
}): Quantity {
  assertWithin('materialYield', args.materialYield, UNIT_INTERVAL, '');
  assertWithin('systematicYield', args.systematicYield, UNIT_INTERVAL, '');
  assertWithin('randomYield', args.randomYield, UNIT_INTERVAL, '');
  return quantity(args.materialYield * args.systematicYield * args.randomYield, {
    modelId: 'eds.yield.overall',
    unit: '',
    sourceId: 'S223',
    validRange: UNIT_INTERVAL,
    assumptions: ['세 손실 기구가 서로 독립이라고 본다 — ITRS 2009 Yield Enhancement 식 (1)'],
  });
}

/** 계통수율 `Y_S = DY / Y_R` — S220 식 (14) 의 나머지 항. */
export function systematicYield(args: { dieYield: number; randomYield: number }): Quantity {
  assertWithin('dieYield', args.dieYield, UNIT_INTERVAL, '');
  assertWithin('randomYield', args.randomYield, UNIT_INTERVAL, '');
  return quantity(args.dieYield / args.randomYield, {
    modelId: 'eds.yield.systematic',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
  });
}

/* ------------------------------------------------------------------ *
 * 5. A9 — 웨이퍼당 다이 수
 * ------------------------------------------------------------------ */

/**
 * **A9** 웨이퍼당 총 다이 수 `N ≈ πd²/(4S) − πd/√(2S)` — S148 · 골든값 R131.
 *
 * 🔴 원장 주석: S148 슬라이드의 2항 분모 조판은 **차원이 맞지 않는다.** 표준형만 구현한다.
 * 🔴 리터럴 4 는 반지름으로 다시 써서 없앴다 — `πd²/(4S) = π(d/2)²/S`. 값은 완전히 같다.
 */
export function grossDiePerWafer(args: { diameterCm: number; dieAreaCm2: number }): Quantity {
  assertWithin('diameterCm', args.diameterCm, NON_NEGATIVE, 'cm');
  assertWithin('dieAreaCm2', args.dieAreaCm2, [Number.MIN_VALUE, Number.POSITIVE_INFINITY], 'cm²');
  const radius = args.diameterCm / 2;
  const waferArea = Math.PI * radius * radius;
  const edgeLoss = (Math.PI * args.diameterCm) / Math.sqrt(2 * args.dieAreaCm2);
  const n = waferArea / args.dieAreaCm2 - edgeLoss;
  return quantity(Math.max(n, 0), {
    modelId: 'eds.dieCount.gross',
    unit: 'dies',
    sourceId: 'S148',
    validRange: [0, waferArea / args.dieAreaCm2],
    assumptions: ['정사각형 다이·직교 배열 근사', '2항은 가장자리 부분다이 손실'],
  });
}

/** 양품 다이 수 = 총 다이 수 × 다이 수율. R131 의 세 번째 출력. */
export function goodDiePerWafer(args: {
  diameterCm: number; dieAreaCm2: number; dieYield: number;
}): Quantity {
  assertWithin('dieYield', args.dieYield, UNIT_INTERVAL, '');
  const gross = grossDiePerWafer(args);
  return quantity(gross.value * args.dieYield, {
    modelId: 'eds.dieCount.good',
    unit: 'dies',
    sourceId: 'S148',
    validRange: gross.validRange,
  });
}

/* ------------------------------------------------------------------ *
 * 6. A10 — 결함수준(Defect Level)
 * ------------------------------------------------------------------ */

/**
 * **A10** 출하 결함수준 `DL = 1 − Y^(1−T)` (분율). ppm 은 화면에서 환산한다.
 *
 * ⚠️ **등급 하향(R190).** 1차 출처 Williams & Brown 1981(S232)은 OpenAlex 조회로
 *    **오픈 액세스본 부재가 확정**됐다. 식 형태와 수치정합만 2차 출처 **S227** 로 확인했다.
 * 🔴 커버리지 T 는 **입력값**이다 — 테스트 패턴 생성 결과이지 이 층이 계산하는 물리량이 아니다.
 */
export function defectLevel(args: { dieYield: number; coverage: number }): Quantity {
  assertWithin('dieYield', args.dieYield, UNIT_INTERVAL, '');
  assertWithin('coverage', args.coverage, UNIT_INTERVAL, '');
  return quantity(1 - Math.pow(args.dieYield, 1 - args.coverage), {
    modelId: 'eds.defectLevel',
    unit: '',
    sourceId: 'S227',
    validRange: UNIT_INTERVAL,
    assumptions: [
      '🔴 2차 출처 기반 — 1차(Williams & Brown 1981) 오픈액세스본 부재 확정(M-21)',
      '커버리지 T 는 계산 결과가 아니라 입력값이다',
    ],
  });
}

/* ------------------------------------------------------------------ *
 * 7. A11 — 수율 학습곡선
 * ------------------------------------------------------------------ */

/**
 * **A11** 수율손실 학습곡선 `YL(t) = YL(0)·e^(−γt)` (t: 개월) — S220 §8.
 * γ 는 SEMATECH 5개사 실측 평균(Table 2). 노드별 값만 있고 **보간하지 않는다.**
 */
export function yieldLossAfterLearning(args: {
  initialLoss: number; months: number; node: TechnologyNode;
}): Quantity {
  assertWithin('initialLoss', args.initialLoss, UNIT_INTERVAL, '');
  assertWithin('months', args.months, NON_NEGATIVE, 'month');
  const gamma = LEARNING_RATE_PER_MONTH[args.node];
  if (!gamma) {
    throw new Error(
      `[S220 §8] 학습률이 등재되지 않은 노드 '${args.node}'. `
      + `등재 노드: ${Object.keys(LEARNING_RATE_PER_MONTH).join(', ')}. 보간하지 않는다.`,
    );
  }
  return quantity(args.initialLoss * Math.exp(-gamma.value * args.months), {
    modelId: 'eds.learning.yieldLoss',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
    assumptions: [`γ = ${gamma.value} /month (${args.node}, SEMATECH 5개사 평균 — S220 Table 2)`],
  });
}

/** 월별 손실 감소율 `1 − e^(−γ)` — S220 Table 2 「Equivalent percentage reduction」 열과 대조된다. */
export function monthlyLossReduction(node: TechnologyNode): Quantity {
  const gamma = LEARNING_RATE_PER_MONTH[node];
  if (!gamma) throw new Error(`[S220 §8] 미등재 노드 '${node}'`);
  return quantity(1 - Math.exp(-gamma.value), {
    modelId: 'eds.learning.monthlyReduction',
    unit: '',
    sourceId: 'S220',
    validRange: UNIT_INTERVAL,
  });
}
