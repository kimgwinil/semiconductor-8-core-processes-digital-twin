// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError, type Quantity } from '@/models/contract';
import { erfc, normalCdf, probit } from '@/models/physics/eds/normalStats';
import {
  ALPHA_RANGE, DERIVED_EXPECTATION, boseEinsteinYield, defectDensityFromPoissonYield,
  defectLevel, dieYield, dieYieldModelUsed, goodDiePerWafer, grossDiePerWafer,
  monthlyLossReduction, murphyYield, negativeBinomialYield, overallYield, poissonApplicable,
  poissonYield, seedsYield, systematicYield, yieldLossAfterLearning,
} from '@/models/physics/eds/yieldModels';
import {
  controlChartConstants, defectiveFractionCentered, defectiveFractionOneSided,
  maxYieldSigmaDistance, processCapability, processCapabilityK, randomYieldFromMaxObserved,
  rangeChartLowerLimit, rangeChartUpperLimit, sigmaFromMeanRange, xBarControlLimits,
} from '@/models/physics/eds/statistics';
import {
  GRADE_C_NOT_FOR_JUDGEMENT, KGD_DEFINITION, OPERATIONAL_ASSUMPTION,
  OVERDRIVE_MIL_DOMAIN, OVERDRIVE_PRACTICE_RANGE_MIL, OVERDRIVE_PRACTICE_RANGE_UM,
  PRACTICE_WINDOW_PINNED_ASSUMPTION,
  nominalContactResistance,
  overdriveRangeMarginUm, overdriveWithinPractice, probeContactForce,
  scrubMarkClearanceUm, scrubMarkWithinOpening,
} from '@/models/physics/eds/probeOperations';
import { UM_PER_MIL } from '@/models/physics/eds/units';

/**
 * 🔴 A14 — EDS 계산 정확성. 예외 없다.
 *  1. 결정론   — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조(골든 테스트 외 대표점)
 *  3. 경계 안정성 — 전 파라미터 경계에서 NaN·Infinity·발산 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위를 갖고 차원이 맞는다
 * + A15-op(B군) 과 A4(적용한계)의 계약을 여기서 고정한다.
 */

const POISSON_OK = { areaCm2: 0.2, defectDensityPerCm2: 0.5 };

/* ---------------------------------------------------------------- 1 */

describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('Poisson 수율을 200회 반복해도 비트 단위로 같다', () => {
    const first = poissonYield(POISSON_OK).value;
    for (let i = 0; i < 200; i++) expect(poissonYield(POISSON_OK).value).toBe(first);
  });
  it('불량률(정규 꼬리)을 200회 반복해도 비트 단위로 같다', () => {
    const first = defectiveFractionCentered(1.33).value;
    for (let i = 0; i < 200; i++) expect(defectiveFractionCentered(1.33).value).toBe(first);
  });
  it('binomial-sigma 분해를 200회 반복해도 비트 단위로 같다', () => {
    const args = { maxDieYield: 0.57, wafers: 755, candidateSites: 372, sitesAtMax: 1 };
    const first = randomYieldFromMaxObserved(args).value;
    for (let i = 0; i < 200; i++) expect(randomYieldFromMaxObserved(args).value).toBe(first);
  });
  it('시각이 지나도 값이 변하지 않는다', async () => {
    const a = defectLevel({ dieYield: 0.99, coverage: 0.997 }).value;
    await new Promise((r) => setTimeout(r, 20));
    expect(defectLevel({ dieYield: 0.99, coverage: 0.997 }).value).toBe(a);
  });
});

/* ---------------------------------------------------------------- 2 */

describe('A14-2 수치 정확성 — 손계산 대조', () => {
  it('① Poisson: A=0.2, D₀=0.5 → e^(−0.1)', () => {
    expect(poissonYield(POISSON_OK).value).toBeCloseTo(Math.exp(-0.1), 15);
  });
  it('② 음이항: A=1, D₀=0.8, α=3 → (1+0.8/3)^(−3)', () => {
    const hand = Math.pow(1 + 0.8 / 3, -3);
    expect(negativeBinomialYield({ areaCm2: 1, defectDensityPerCm2: 0.8, alpha: 3 }).value)
      .toBeCloseTo(hand, 15);
  });
  it('③ 웨이퍼당 다이: d=30.48 cm, S=2.5 cm² → π(d/2)²/S − πd/√(2S)', () => {
    const d = 30.48, s = 2.5;
    const hand = (Math.PI * (d / 2) * (d / 2)) / s - (Math.PI * d) / Math.sqrt(2 * s);
    expect(grossDiePerWafer({ diameterCm: d, dieAreaCm2: s }).value).toBeCloseTo(hand, 12);
  });
  it('④ 결함수준: Y=0.99, T=0.997 → 1 − 0.99^0.003', () => {
    expect(defectLevel({ dieYield: 0.99, coverage: 0.997 }).value)
      .toBeCloseTo(1 - Math.pow(0.99, 1 - 0.997), 15);
  });
  it('⑤ Cpk: USL=10, LSL=2, µ=4, σ=1 → min(6/3, 2/3) = 0.6667', () => {
    expect(processCapabilityK({ usl: 10, lsl: 2, mean: 4, sigma: 1 }).value)
      .toBeCloseTo(2 / 3, 15);
  });
  it('⑥ 학습곡선: YL(0)=0.5, 180nm(γ=0.067), t=12 → 0.5·e^(−0.804)', () => {
    expect(yieldLossAfterLearning({ initialLoss: 0.5, months: 12, node: '180nm' }).value)
      .toBeCloseTo(0.5 * Math.exp(-0.067 * 12), 15);
  });
  it('⑦ 관리도: n=5, R̄=2 → UCL_X̄ = X̿ + 0.577·2, σ̂ = 2/2.326', () => {
    const lim = xBarControlLimits({ grandMean: 10, meanRange: 2, subgroupSize: 5 });
    expect(lim.upper.value).toBeCloseTo(10 + 0.577 * 2, 12);
    expect(lim.lower.value).toBeCloseTo(10 - 0.577 * 2, 12);
    expect(rangeChartUpperLimit({ meanRange: 2, subgroupSize: 5 }).value).toBeCloseTo(2.114 * 2, 12);
    expect(sigmaFromMeanRange({ meanRange: 2, subgroupSize: 5 }).value).toBeCloseTo(2 / 2.326, 12);
  });
});

describe('A14-2b 정규분포 루틴 정확성 (자체 구현이므로 독립 대조)', () => {
  const cases: Array<[number, number]> = [
    [0.5, 0.4795001221869535],
    [1, 0.15729920705028513],
    [2, 0.004677734981047266],
    [3, 0.00002209049699858544],
    [4, 1.541725790028002e-8],
  ];
  for (const [x, ref] of cases) {
    it(`erfc(${x}) 상대오차 < 1e-13`, () => {
      expect(Math.abs(erfc(x) - ref) / ref).toBeLessThan(1e-13);
    });
  }
  it('erfc 는 대칭식 erfc(−x) = 2 − erfc(x) 를 만족한다', () => {
    expect(erfc(-1.7)).toBeCloseTo(2 - erfc(1.7), 14);
  });
  it('Φ(0) = 0.5 · Φ(1.959963985) ≈ 0.975', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(1.9599639845400545)).toBeCloseTo(0.975, 14);
  });
  it('probit 은 Φ 의 역함수다 (왕복 오차 < 1e-12)', () => {
    for (const p of [0.001, 0.025, 0.5, 0.9, 0.9973118279569892]) {
      expect(normalCdf(probit(p))).toBeCloseTo(p, 12);
    }
  });
  it('probit 은 (0,1) 밖을 거부한다', () => {
    expect(() => probit(0)).toThrow(RangeError);
    expect(() => probit(1)).toThrow(RangeError);
  });
});

describe('A14-2c 파생 기대값 (T2 아님 · M-20) — 식 자기정합만 고정한다', () => {
  it('Murphy 는 A·D₀ = 1.5 에서 0.268234 다 (손계산 리터럴)', () => {
    // 🔴 예전에는 이 자리에 `Math.pow((1 - Math.exp(-ad)) / ad, 2)` 가 그대로 적혀 있었다.
    //    구현(`physics/eds/yieldModels.ts`)과 글자까지 같은 **식 복붙**이라, 구현이 틀리면 기대값도
    //    같이 틀려 탐지력이 0 이었다(E1 · check-test-formulas).
    //
    // 🔴 문헌값으로 바꿀 수는 없다 — 원장 M-20 이 「Murphy·Seeds 모델의 문헌 인쇄 수치표 미발견」으로
    //    **이미 종결**했다(`refs/공개출처_반도체전공정_서지목록.md` M-20). 그래서 T2 골든이 아니다.
    //    → 남는 길은 손계산 리터럴뿐이다.
    //
    // 손계산 (2026-08-22 · 구현 코드를 보지 않고 S220 식 (9) 에서 직접 계산):
    //   Y = ((1 − e^(−A·D₀)) / (A·D₀))²,  A·D₀ = 1.5
    //   1 − e^(−1.5) = 0.7768698398515702 → /1.5 = 0.5179132265677134 → ² = 0.2682341102537797
    //
    // 🔴 정밀도를 15 → 6 으로 낮춘 것은 **완화가 아니다.** 바뀐 것은 자리수가 아니라 **비교 대상**이다:
    //    (구현 출력 ↔ 구현 출력) 이던 항등식 검사를 (고정 리터럴 ↔ 구현 출력) 값 검사로 바꿨다.
    //    15자리 리터럴을 그대로 적으면 그 리터럴이 곧 구현의 출력이 되어 탐지력이 회복되지 않으므로,
    //    사람이 종이에서 재현할 수 있는 6자리로 끊는다. 탐지력은 0 → 6자리로 **올라간다.**
    //    (DEV 팀장 판정 2026-08-22 · 스레드 §4-A-2 (다) #16 · §4-A-6-③)
    expect(murphyYield({ areaCm2: 1, defectDensityPerCm2: 1.5 }).value).toBeCloseTo(0.268234, 6);
  });
  it('Seeds 는 음이항 α = 1 과 같다', () => {
    const args = { areaCm2: 1, defectDensityPerCm2: 1.3 };
    expect(seedsYield(args).value)
      .toBeCloseTo(negativeBinomialYield({ ...args, alpha: 1 }).value, 14);
  });
  it('🔴 Bose–Einstein 은 음이항과 같지 않다 (원장 §2-6 각주 2)', () => {
    const args = { areaCm2: 1, defectDensityPerCm2: 1 };
    const be = boseEinsteinYield({ ...args, criticalLayers: 3 }).value;
    const nb = negativeBinomialYield({ ...args, alpha: 3 }).value;
    expect(be).not.toBeCloseTo(nb, 3);
  });
  it('Murphy·Seeds·BE 출력에 「파생 기대값」 표식이 남는다', () => {
    for (const q of [
      murphyYield({ areaCm2: 1, defectDensityPerCm2: 1 }),
      seedsYield({ areaCm2: 1, defectDensityPerCm2: 1 }),
      boseEinsteinYield({ areaCm2: 1, defectDensityPerCm2: 1, criticalLayers: 2 }),
    ]) {
      expect(q.assumptions[0]).toBe(DERIVED_EXPECTATION);
    }
  });
  it('Poisson 역산은 정산의 역함수다', () => {
    const y = poissonYield(POISSON_OK).value;
    expect(defectDensityFromPoissonYield({ dieYield: y, areaCm2: POISSON_OK.areaCm2 }).value)
      .toBeCloseTo(POISSON_OK.defectDensityPerCm2, 12);
  });
  it('α → 큰 값에서 음이항이 Poisson 에 수렴한다 (S220 §4)', () => {
    const args = { areaCm2: 0.2, defectDensityPerCm2: 0.5 };
    const nb = negativeBinomialYield({ ...args, alpha: ALPHA_RANGE[1] }).value;
    expect(Math.abs(nb - poissonYield(args).value)).toBeLessThan(0.01);
  });
});

/* ---------------------------------------------------------------- 3 */

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
}

describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('수율 모델: 면적 0~0.25 × D₀ 0~50 × α 전 범위 (적용한계 안)', () => {
    let n = 0;
    for (let i = 0; i <= 25; i++) {
      const areaCm2 = (i / 100) / 1;
      for (let j = 0; j <= 50; j++) {
        const defectDensityPerCm2 = j;
        assertFinite(poissonYield({ areaCm2, defectDensityPerCm2 }), `poisson A=${areaCm2} D=${j}`);
        assertFinite(murphyYield({ areaCm2, defectDensityPerCm2 }), `murphy A=${areaCm2} D=${j}`);
        assertFinite(seedsYield({ areaCm2, defectDensityPerCm2 }), `seeds A=${areaCm2} D=${j}`);
        for (const alpha of [ALPHA_RANGE[0], 1, 2, 3, ALPHA_RANGE[1]]) {
          assertFinite(
            negativeBinomialYield({ areaCm2, defectDensityPerCm2, alpha }),
            `nb A=${areaCm2} D=${j} a=${alpha}`,
          );
        }
        n++;
      }
    }
    expect(n).toBe(26 * 51);
  });
  it('A·D₀ = 0 (양 극단)에서도 정의값이 나온다', () => {
    expect(poissonYield({ areaCm2: 0, defectDensityPerCm2: 10 }).value).toBe(1);
    expect(murphyYield({ areaCm2: 0, defectDensityPerCm2: 10 }).value).toBe(1);
    expect(seedsYield({ areaCm2: 0, defectDensityPerCm2: 10 }).value).toBe(1);
  });
  it('결함수준: 수율 0~1 × 커버리지 0~1 격자', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        assertFinite(defectLevel({ dieYield: i / 20, coverage: j / 20 }), `DL ${i}/${j}`);
      }
    }
  });
  it('공정능력: σ 0.01~5 스윕에서 Cp·Cpk·불량률 전부 유한', () => {
    for (let i = 1; i <= 500; i++) {
      const sigma = i / 100;
      const cp = processCapability({ usl: 1, lsl: -1, sigma });
      const cpk = processCapabilityK({ usl: 1, lsl: -1, mean: 0.2, sigma });
      assertFinite(cp, `cp σ=${sigma}`);
      assertFinite(cpk, `cpk σ=${sigma}`);
      assertFinite(defectiveFractionCentered(cp.value), `p σ=${sigma}`);
      assertFinite(defectiveFractionOneSided(cpk.value), `p1 σ=${sigma}`);
    }
  });
  it('극단 Cp = 5 (30σ 폭)에서도 불량률이 0 이상 유한하다', () => {
    const p = defectiveFractionCentered(5);
    assertFinite(p, 'Cp=5');
    expect(p.value).toBeGreaterThanOrEqual(0);
  });
  it('binomial-sigma: 후보 사이트 2~2000 스윕', () => {
    for (let n = 2; n <= 2000; n += 7) {
      const args = { maxDieYield: 0.57, wafers: 755, candidateSites: n, sitesAtMax: 1 };
      assertFinite(maxYieldSigmaDistance(args), `k n=${n}`);
      assertFinite(randomYieldFromMaxObserved(args), `YR n=${n}`);
    }
  });
  it('다이 수: 지름 10~45 cm × 면적 0.05~4 cm²', () => {
    for (let d = 10; d <= 45; d++) {
      for (let i = 1; i <= 80; i++) {
        const dieAreaCm2 = i / 20;
        assertFinite(grossDiePerWafer({ diameterCm: d, dieAreaCm2 }), `dpw ${d}/${dieAreaCm2}`);
        assertFinite(
          goodDiePerWafer({ diameterCm: d, dieAreaCm2, dieYield: 0.5 }), `good ${d}/${dieAreaCm2}`,
        );
      }
    }
  });
  it('학습곡선: 0~120개월 · 3개 노드', () => {
    for (const node of ['350nm', '250nm', '180nm'] as const) {
      for (let t = 0; t <= 120; t++) {
        assertFinite(yieldLossAfterLearning({ initialLoss: 1, months: t, node }), `${node} t=${t}`);
      }
      assertFinite(monthlyLossReduction(node), node);
    }
  });
  it('B군: 오버드라이브 0~150 µm · 마크 0~120 µm 스윕', () => {
    for (let od = 0; od <= 150; od++) assertFinite(overdriveRangeMarginUm(od), `od=${od}`);
    for (let L = 0; L <= 120; L++) {
      assertFinite(scrubMarkClearanceUm({
        markLengthUm: L, markWidthUm: 20, offsetXUm: 0, offsetYUm: 0,
        openingWidthUm: 60, openingHeightUm: 100,
      }), `mark=${L}`);
    }
    // 🔴 정의역은 **µm 정본에서 파생된** [0.984, 2.992] mil 이다(인쇄값 [1, 3] 이 아니다).
    //    종전에는 1.0~3.0 mil 을 훑었는데, 3.0 mil = 76.2 µm 는 실무창 상한 76 µm 를 넘는다 —
    //    µm 쪽이 거부하는 오버드라이브를 mil 쪽만 받아 주던 어긋남이었다. 두 끝을 포함해 훑는다.
    const [MIL_LO, MIL_HI] = OVERDRIVE_MIL_DOMAIN;
    const MIL_STEPS = 20;
    for (let i = 0; i <= MIL_STEPS; i++) {
      const mil = MIL_LO + ((MIL_HI - MIL_LO) * i) / MIL_STEPS;
      assertFinite(probeContactForce({ material: 'W', overdriveMil: mil, bound: 'max' }), `f=${mil}`);
    }
  });
  it('범위 밖 입력은 계산하지 않고 정지한다(OutOfLimitError)', () => {
    expect(() => poissonYield({ areaCm2: -1, defectDensityPerCm2: 1 })).toThrow(OutOfLimitError);
    expect(() => defectLevel({ dieYield: 1.2, coverage: 0.9 })).toThrow(OutOfLimitError);
    expect(() => processCapability({ usl: 1, lsl: -1, sigma: 0 })).toThrow(OutOfLimitError);
    expect(() => negativeBinomialYield({ areaCm2: 1, defectDensityPerCm2: 1, alpha: 0.1 }))
      .toThrow(OutOfLimitError);
    expect(() => probeContactForce({ material: 'W', overdriveMil: 5, bound: 'max' }))
      .toThrow(OutOfLimitError);
    expect(() => poissonYield({ areaCm2: Number.NaN, defectDensityPerCm2: 1 }))
      .toThrow(OutOfLimitError);
  });
});

/* ---------------------------------------------------------------- 4 */

describe('A14-4 단위 일관성', () => {
  it('무차원 수율은 단위가 비어 있고 값이 [0,1] 이다', () => {
    for (const q of [
      poissonYield(POISSON_OK),
      negativeBinomialYield(POISSON_OK),
      murphyYield(POISSON_OK),
      seedsYield(POISSON_OK),
      dieYield(POISSON_OK),
      defectLevel({ dieYield: 0.99, coverage: 0.9 }),
      overallYield({ materialYield: 1, systematicYield: 0.95, randomYield: 0.9 }),
      systematicYield({ dieYield: 0.431, randomYield: 0.518 }),
    ]) {
      expect(q.unit).toBe('');
      expect(q.value).toBeGreaterThanOrEqual(0);
      expect(q.value).toBeLessThanOrEqual(1);
      expect(q.outOfRange).toBe(false);
    }
  });
  it('차원이 있는 출력은 문헌 단위를 그대로 쓴다', () => {
    expect(grossDiePerWafer({ diameterCm: 30, dieAreaCm2: 1 }).unit).toBe('dies');
    expect(defectDensityFromPoissonYield({ dieYield: 0.9, areaCm2: 1 }).unit).toBe('/cm²');
    expect(maxYieldSigmaDistance({ sitesAtMax: 1, candidateSites: 372 }).unit).toBe('σ');
    expect(nominalContactResistance({ material: 'BeCu', pad: 'Au' }).unit).toBe('µΩ');
    expect(probeContactForce({ material: 'W', overdriveMil: 2, bound: 'max' }).unit).toBe('g');
    expect(overdriveRangeMarginUm(50).unit).toBe('µm');
    expect(scrubMarkClearanceUm({
      markLengthUm: 30, markWidthUm: 20, offsetXUm: 0, offsetYUm: 0,
      openingWidthUm: 60, openingHeightUm: 100,
    }).unit).toBe('µm');
  });
  it('문헌 출력에는 원장 S번호가 붙고, 운영규약 출력에는 붙지 않는다', () => {
    // 🔴 A6 정제(2026-08-20 오케스트레이터 판정): 「모든 출력에 S번호」가 아니다.
    //    S번호 원장은 **공개 문헌** 원장이다. 운영규약(A15-op)·교육용 합성값에 채번하면
    //    「S번호가 있다 = 문헌에 있다」가 무너진다. 없는 것은 없다고 둔다.
    const literature = [
      poissonYield(POISSON_OK),
      negativeBinomialYield(POISSON_OK),
      grossDiePerWafer({ diameterCm: 30, dieAreaCm2: 1 }),
      defectLevel({ dieYield: 0.99, coverage: 0.9 }),
      processCapability({ usl: 1, lsl: -1, sigma: 0.2 }),
      randomYieldFromMaxObserved({
        maxDieYield: 0.57, wafers: 755, candidateSites: 372, sitesAtMax: 1,
      }),
    ];
    for (const q of literature) {
      expect(q.kind).toBe('literature');
      expect(q.sourceId ?? '').toMatch(/^S\d+$/);
    }

    // 🔴 프로브 접촉저항은 물리 법칙이 아니라 **업계 운영 범위**다(A15-op 승인 항목).
    //    출처가 없는 것이 사실이므로 S번호를 달지 않고, 대신 고지를 반드시 단다.
    const operational = nominalContactResistance({ material: 'W', pad: 'Al' });
    expect(operational.kind).toBe('operational');
    expect(operational.sourceId).toBeUndefined();
    expect(operational.notice ?? '').not.toBe('');
  });
});

/* --------------------------------------------------- A4 · A15-op */

describe('🔴 A4 — Poisson 적용한계 (S220 §2·§5)', () => {
  it('판정 규칙: A ≤ 0.25 **또는** A·D₀ < 1.0', () => {
    expect(poissonApplicable(0.25, 100)).toBe(true);   // 면적 조건 충족
    expect(poissonApplicable(2, 0.4)).toBe(true);      // A·D₀ = 0.8 < 1
    expect(poissonApplicable(2, 0.5)).toBe(false);     // A·D₀ = 1.0 — 「< 1.0」이 아니다
    expect(poissonApplicable(1, 4)).toBe(false);       // 현 제품이 쓰던 A·D₀ = 4
  });
  it('한계 밖에서 자동 전환하고 그 사실을 출력에 남긴다', () => {
    const args = { areaCm2: 2, defectDensityPerCm2: 1 };
    expect(dieYieldModelUsed(args)).toBe('negativeBinomial');
    const q = dieYield(args);
    expect(q.sourceId).toBe('S222');
    expect(q.assumptions.join(' ')).toMatch(/Poisson 적용한계 초과/);
    expect(q.value).toBeCloseTo(Math.pow(1 + 2 / 2, -2), 15);
  });
  it('한계 안에서는 Poisson 을 쓰고 그 사실도 남긴다', () => {
    const q = dieYield(POISSON_OK);
    expect(dieYieldModelUsed(POISSON_OK)).toBe('poisson');
    expect(q.sourceId).toBe('S221');
    expect(q.assumptions.join(' ')).toMatch(/Poisson 적용/);
  });
  it('🔴 전환 지점에서 음이항이 Poisson 보다 높다 — 그래서 자동 전환이 필요하다', () => {
    const args = { areaCm2: 2, defectDensityPerCm2: 1 };
    expect(dieYield(args).value).toBeGreaterThan(Math.exp(-2));
  });
});

describe('🔴 A15-op — B군은 운영규약임이 출력에 드러난다', () => {
  const bGroupOutputs = [
    overdriveRangeMarginUm(50),
    probeContactForce({ material: 'BeCu', overdriveMil: 2, bound: 'min' }),
    nominalContactResistance({ material: 'BeCu', pad: 'Al' }),
    scrubMarkClearanceUm({
      markLengthUm: 30, markWidthUm: 20, offsetXUm: 0, offsetYUm: 0,
      openingWidthUm: 60, openingHeightUm: 100,
    }),
  ];
  it('assumptions 첫 항목이 A15-op 표식이다', () => {
    for (const q of bGroupOutputs) expect(q.assumptions[0]).toBe(OPERATIONAL_ASSUMPTION);
  });
  it('A군 출력에는 그 표식이 없다', () => {
    for (const q of [poissonYield(POISSON_OK), defectLevel({ dieYield: 0.99, coverage: 0.9 })]) {
      expect(q.assumptions.includes(OPERATIONAL_ASSUMPTION)).toBe(false);
    }
  });
});

describe('🔴 B군 3종 정정 — 기존 명세값을 원장 S229 로 교체했다', () => {
  it('① 오버드라이브 실무범위는 25~76 µm (기존 정답창 90~105 µm 폐기)', () => {
    expect(OVERDRIVE_PRACTICE_RANGE_UM).toEqual([25, 76]);
    expect(OVERDRIVE_PRACTICE_RANGE_MIL).toEqual([1, 3]);
    expect(overdriveWithinPractice(90)).toBe(false); // 기존 정답창 하한이 범위 밖이다
    expect(overdriveWithinPractice(105)).toBe(false);
    expect(overdriveWithinPractice(50)).toBe(true);
  });
  it('② 접촉저항은 µΩ 공칭값이다 (기존 합격선 0.90 Ω 폐기 — 3~4자릿수 차이)', () => {
    expect(nominalContactResistance({ material: 'BeCu', pad: 'Au' }).value).toBe(100);
    expect(nominalContactResistance({ material: 'BeCu', pad: 'Al' }).value).toBe(200);
    expect(nominalContactResistance({ material: 'W', pad: 'Au' }).value).toBe(250);
    expect(nominalContactResistance({ material: 'W', pad: 'Al' }).value).toBe(250);
    // 0.90 Ω = 900,000 µΩ — 문헌 공칭값의 3600배다
    expect(900000 / 250).toBeGreaterThan(1000);
  });
  it('③ 스크럽 마크는 수치규격이 아니라 기하 판정이다', () => {
    const inside = {
      markLengthUm: 40, markWidthUm: 20, offsetXUm: 0, offsetYUm: 0,
      openingWidthUm: 60, openingHeightUm: 60,
    };
    expect(scrubMarkWithinOpening(inside)).toBe(true);
    expect(scrubMarkClearanceUm(inside).value).toBeCloseTo(10, 12);
    // 개구부를 넘으면 여유가 음수가 된다 — 「45 µm」 같은 고정 수치 판정을 쓰지 않는다
    expect(scrubMarkWithinOpening({ ...inside, markLengthUm: 70 })).toBe(false);
    // 마크가 작아도 중심에서 벗어나면 탈락한다 — 지름만으로는 판정할 수 없다는 근거
    expect(scrubMarkWithinOpening({ ...inside, markLengthUm: 20, offsetXUm: 25 })).toBe(false);
  });
  it('④ 접촉력은 g/mil OD 조회다', () => {
    expect(probeContactForce({ material: 'W', overdriveMil: 2, bound: 'min' }).value)
      .toBeCloseTo(2, 12);
    expect(probeContactForce({ material: 'BeCu', overdriveMil: 2, bound: 'max' }).value)
      .toBeCloseTo(3.2, 12);
  });
  it('🔴 ④-b 접촉력 정의역은 **µm 정본에서 파생**된다 — 인쇄값 [1, 3] mil 이 아니다', () => {
    // 실무창 하한 25 µm 는 정직하게 환산하면 0.984 mil 이다. 인쇄값 [1, 3] 을 정의역으로 두면
    // **µm 쪽이 합격이라고 말한 입력에서 mil 쪽이 정지**한다 — 그것이 이 파생의 이유다.
    expect(OVERDRIVE_MIL_DOMAIN[0]).toBe(25 / UM_PER_MIL);
    expect(OVERDRIVE_MIL_DOMAIN[1]).toBe(76 / UM_PER_MIL);
    expect(OVERDRIVE_MIL_DOMAIN[0]).toBeLessThan(OVERDRIVE_PRACTICE_RANGE_MIL[0]);
    expect(OVERDRIVE_MIL_DOMAIN[1]).toBeLessThan(OVERDRIVE_PRACTICE_RANGE_MIL[1]);
    // 🔴 (b) µm 실무창 **하한**에서 정지하지 않는다 — 종전 리터럴 [1, 3] 이면 여기서 던졌다.
    expect(() => probeContactForce({
      material: 'W', overdriveMil: 25 / UM_PER_MIL, bound: 'max',
    })).not.toThrow();
    expect(() => probeContactForce({
      material: 'W', overdriveMil: 76 / UM_PER_MIL, bound: 'max',
    })).not.toThrow();
    // 실무창 밖은 여전히 정지한다 — 정의역이 넓어진 것이 아니라 **옮겨간** 것이다.
    expect(() => probeContactForce({ material: 'W', overdriveMil: 3, bound: 'max' }))
      .toThrow(OutOfLimitError);
  });
  it('🔴 ④-c 경계 고정 고지는 **고정됐을 때만** 붙는다', () => {
    const pinned = probeContactForce({
      material: 'W', overdriveMil: OVERDRIVE_MIL_DOMAIN[1], bound: 'max',
      pinnedToPracticeWindow: true,
    });
    const free = probeContactForce({
      material: 'W', overdriveMil: OVERDRIVE_MIL_DOMAIN[1], bound: 'max',
    });
    expect(pinned.assumptions).toContain(PRACTICE_WINDOW_PINNED_ASSUMPTION);
    expect(free.assumptions).not.toContain(PRACTICE_WINDOW_PINNED_ASSUMPTION);
    // A15-op 표식은 어느 쪽이든 여전히 첫 항목이다.
    expect(pinned.assumptions[0]).toBe(OPERATIONAL_ASSUMPTION);
    expect(free.assumptions[0]).toBe(OPERATIONAL_ASSUMPTION);
  });
  it('⑤ 등급 C 는 판정에 쓰지 않는다는 사실이 코드에 남아 있다', () => {
    expect(GRADE_C_NOT_FOR_JUDGEMENT.length).toBe(2);
    expect(GRADE_C_NOT_FOR_JUDGEMENT.join(' ')).toMatch(/S224\(NIST\)는 임계를 규정하지 않는다/);
  });
  it('⑥ KGD 는 정의만 있고 판정 수치가 없다', () => {
    expect(KGD_DEFINITION.sourceId).toBe('S230');
    expect(KGD_DEFINITION.statement).not.toMatch(/\d+\s*(µm|Ω|%)/);
  });
  it('⑦ 등재되지 않은 재질·조합은 거부한다', () => {
    expect(() => nominalContactResistance({
      material: 'W-Re', pad: 'Au',
    }).value).not.toThrow();
    expect(() => rangeChartLowerLimit({ meanRange: 2, subgroupSize: 5 }))
      .toThrow(/D₃ 가 인쇄돼 있지 않다/);
    expect(() => controlChartConstants(3)).toThrow(/보간하지 않는다/);
  });
});
