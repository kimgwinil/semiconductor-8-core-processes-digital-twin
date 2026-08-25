// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  ALPHA_DEFAULT, defectLevel, goodDiePerWafer, grossDiePerWafer, monthlyLossReduction,
  negativeBinomialYield, overallYield, poissonYield, systematicYield,
} from '@/models/physics/eds/yieldModels';
import {
  controlChartConstants, defectiveFractionCentered, maxYieldSigmaDistance,
  processCapability, randomYieldFromMaxObserved,
} from '@/models/physics/eds/statistics';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-5(EDS · 수율) R175~R190 + R131.
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다. 실패하면 병합 차단.
 *
 * 🔴 여기 없는 것 — 이유가 있다
 *  - **Murphy · Seeds**: 문헌 인쇄 수치표 미확보(M-20). 「파생 기대값」이라 T2 에 넣지 않는다.
 *    → `tests/unit/eds-a14.test.ts` 에서 T1(식 자기정합)으로만 고정한다.
 *  - **%GRR · Cpk 임계**: 2차 인용이라 판정에 쓰지 않는다(A15-op op-3). 골든값이 될 수 없다.
 */

const PPM = 100 * 100 * 100;

describe('R175 — S221 Table 1: Poisson Y = e^(−λ₀), λ₀ = 0.5', () => {
  it('Y = 0.6065 (±0.0001 절대)', () => {
    // λ₀ = A·D₀ = 0.5 (n = 10⁶, p = 5×10⁻⁷)
    const y = poissonYield({ areaCm2: 1, defectDensityPerCm2: 0.5 }).value;
    expect(Math.abs(y - 0.6065)).toBeLessThanOrEqual(0.0001);
  });
});

describe('R176 — S221 Table 2: Poisson 5점', () => {
  const cases: Array<[number, number]> = [
    [0.0262144, 0.9741],
    [0.1048576, 0.9005],
    [0.4194304, 0.6574],
    [1.6777216, 0.1868],
    [6.7108864, 0.0012],
  ];
  for (const [lambda, expected] of cases) {
    it(`λ₀ = ${lambda} → Y = ${expected} (±0.0001)`, () => {
      // 면적 1 cm² 로 두면 A·D₀ = D₀ = λ₀ 다. λ₀ ≥ 1 인 점은 Poisson 적용한계를 넘으므로
      // 🔴 면적을 0.25 cm² 이하로 잡고 D₀ 를 그만큼 키워 **같은 λ₀** 를 만든다(S220 §5 준수).
      const areaCm2 = 0.25;
      const y = poissonYield({ areaCm2, defectDensityPerCm2: lambda / areaCm2 }).value;
      expect(Math.abs(y - expected)).toBeLessThanOrEqual(0.0001);
    });
  }
});

describe('R177~R180 — S222 Example 5.2: 음이항 Y = (1+AD₀/α)^(−α)', () => {
  const cases: Array<[string, number, number, number, number]> = [
    ['R177', 1, 3, 0.492, 0.001],
    ['R178', 4, 3, 0.113, 0.001],
    ['R179', 1, 4, 0.482, 0.001],
    ['R180', 4, 4, 0.095, 0.001],
  ];
  for (const [id, areaCm2, alpha, expected, tol] of cases) {
    it(`${id} — D₀=0.8 /cm², A=${areaCm2} cm², α=${alpha} → Y = ${expected}`, () => {
      const y = negativeBinomialYield({ areaCm2, defectDensityPerCm2: 0.8, alpha }).value;
      expect(Math.abs(y - expected)).toBeLessThanOrEqual(tol);
    });
  }
});

describe('R181 — S226: 음이항 AD₀ = 0.5, α = 0.5', () => {
  it('Y = 70.7 % (±0.001)', () => {
    const y = negativeBinomialYield({ areaCm2: 1, defectDensityPerCm2: 0.5, alpha: 0.5 }).value;
    expect(Math.abs(y - 0.707)).toBeLessThanOrEqual(0.001);
  });
});

describe('R182·R183 — S223 Table YE3: 종합수율 Y = Y_M·Y_S·Y_R (㉱ 로드맵 — 구조 정합성 확인용)', () => {
  // ⚠️ 로드맵 **목표치**다. 물리 재현 테스트가 아니라 「모델 구조가 로드맵과 맞물리는가」만 본다.
  //    Y_M > 99 % 는 상한 1 로 둔다(원장 재계산도 Y_S·Y_R 만 곱했다).
  it('R182 — DRAM 양산 Y_S=95 %, Y_R=89.5 % → Y = 85 % (±0.5 %p)', () => {
    const y = overallYield({ materialYield: 1, systematicYield: 0.95, randomYield: 0.895 }).value;
    expect(Math.abs(y - 0.85) * 100).toBeLessThanOrEqual(0.5);
  });
  it('R183 — MPU 양산 Y_S=90 %, Y_R=83 % → Y = 75 % (±0.5 %p)', () => {
    const y = overallYield({ materialYield: 1, systematicYield: 0.90, randomYield: 0.83 }).value;
    expect(Math.abs(y - 0.75) * 100).toBeLessThanOrEqual(0.5);
  });
});

describe('R184~R187 — S224 §6.1.6: 규격폭 대비 불량률', () => {
  // Cp = 규격폭/(6σ). σ = 1 로 두면 규격폭이 곧 σ 개수다.
  const cases: Array<[string, number, number, number, string]> = [
    ['R184', 6, 0.0027, 0.00001, '0.27 %'],
    ['R185', 8, 64 / PPM, 1 / PPM, '64 ppm (NIST 올림 표기)'],
    ['R186', 10, 0.6 / PPM, 0.05 / PPM, '0.6 ppm'],
    ['R187', 12, 2 / (PPM * 100 * 10), 0.05 / (PPM * 100 * 10), '2 ppb'],
  ];
  for (const [id, span, expected, tol, label] of cases) {
    it(`${id} — 규격폭 ${span}σ → ${label}`, () => {
      const cp = processCapability({ usl: span / 2, lsl: -span / 2, sigma: 1 }).value;
      const p = defectiveFractionCentered(cp).value;
      expect(Math.abs(p - expected)).toBeLessThanOrEqual(tol);
    });
  }
  it('R184 은 Cp = 1.00 · R187 은 Cp = 2.00 이다 (정의 확인)', () => {
    expect(processCapability({ usl: 3, lsl: -3, sigma: 1 }).value).toBeCloseTo(1, 12);
    expect(processCapability({ usl: 6, lsl: -6, sigma: 1 }).value).toBeCloseTo(2, 12);
  });
});

describe('R188 — S220 §7: binomial-sigma 로 Y_R / Y_S 분해', () => {
  const args = { maxDieYield: 0.57, wafers: 755, candidateSites: 372, sitesAtMax: 1 };
  it('k = Φ⁻¹(1 − 1/372) = 2.78 (±0.002)', () => {
    const k = maxYieldSigmaDistance(args).value;
    expect(Math.abs(k - 2.78)).toBeLessThanOrEqual(0.005);
  });
  it('Y_R = 51.8 % (±0.3 %p)', () => {
    const yr = randomYieldFromMaxObserved(args).value;
    expect(Math.abs(yr - 0.518) * 100).toBeLessThanOrEqual(0.3);
  });
  it('Y_S = DY/Y_R = 83.2 % (±0.5 %p — 원장 재계산 82.98)', () => {
    const yr = randomYieldFromMaxObserved(args).value;
    const ys = systematicYield({ dieYield: 0.431, randomYield: yr }).value;
    expect(Math.abs(ys - 0.832) * 100).toBeLessThanOrEqual(0.5);
  });
  it('🔴 식 (17) 을 되돌리면 MY 가 복원된다 (대수 항등)', () => {
    const yr = randomYieldFromMaxObserved(args).value;
    const k = maxYieldSigmaDistance(args).value;
    const my = yr + k * Math.sqrt((yr * (1 - yr)) / args.wafers);
    expect(my).toBeCloseTo(0.57, 10);
  });
});

describe('R189 — S225 + S224: 관리도 상수 A₂·d₂·D₃·D₄ (±0.002)', () => {
  const table: Record<number, { a2: number; d2: number; d4: number; d3?: number }> = {
    2: { a2: 1.880, d2: 1.128, d4: 3.267 },
    5: { a2: 0.577, d2: 2.326, d4: 2.114 },
    10: { a2: 0.308, d2: 3.078, d4: 1.777, d3: 0.223 },
    25: { a2: 0.153, d2: 3.931, d4: 1.541, d3: 0.459 },
  };
  for (const [nStr, e] of Object.entries(table)) {
    it(`n = ${nStr}`, () => {
      const got = controlChartConstants(Number(nStr));
      expect(Math.abs(got.a2 - e.a2)).toBeLessThanOrEqual(0.002);
      expect(Math.abs(got.d2 - e.d2)).toBeLessThanOrEqual(0.002);
      expect(Math.abs(got.d4 - e.d4)).toBeLessThanOrEqual(0.002);
      if (e.d3 === undefined) expect(got.d3).toBeUndefined();
      else expect(Math.abs((got.d3 as number) - e.d3)).toBeLessThanOrEqual(0.002);
    });
  }
  it('🔴 표에 없는 n 은 보간하지 않고 거부한다 (원장 규칙 1)', () => {
    expect(() => controlChartConstants(7)).toThrow(/원장에 없다/);
  });
});

describe('R190 — S227(2차): 결함수준 DL = 1 − Y^(1−T)', () => {
  it('Y = 0.99, T = 0.997 → DL = 30 ppm (±0.5 ppm)', () => {
    const dl = defectLevel({ dieYield: 0.99, coverage: 0.997 }).value * PPM;
    expect(Math.abs(dl - 30)).toBeLessThanOrEqual(0.5);
  });
  it('🔴 등급 하향이 출력에 남아 있다 — 1차 출처 오픈액세스 부재(M-21)', () => {
    const q = defectLevel({ dieYield: 0.99, coverage: 0.997 });
    expect(q.sourceId).toBe('S227');
    expect(q.assumptions.join(' ')).toMatch(/2차 출처/);
  });
});

describe('R131 — S148: 12 in 웨이퍼 · 다이 2.5 cm² · D=1 /cm² · α=3 (±3 %)', () => {
  // 🔴 표준형만 구현한다 — 슬라이드 조판형은 차원이 맞지 않는다(원장 §1-3 주석).
  const diameterCm = 30.48; // 12 in
  const dieAreaCm2 = 2.5;
  it('웨이퍼당 다이 252개', () => {
    const n = grossDiePerWafer({ diameterCm, dieAreaCm2 }).value;
    expect(Math.abs(n - 252) / 252).toBeLessThanOrEqual(0.03);
  });
  it('다이 수율 16 % (음이항 α=3)', () => {
    const y = negativeBinomialYield({ areaCm2: dieAreaCm2, defectDensityPerCm2: 1, alpha: 3 }).value;
    expect(Math.abs(y - 0.16) / 0.16).toBeLessThanOrEqual(0.03);
  });
  it('양품 다이 40개', () => {
    const y = negativeBinomialYield({ areaCm2: dieAreaCm2, defectDensityPerCm2: 1, alpha: 3 }).value;
    const good = goodDiePerWafer({ diameterCm, dieAreaCm2, dieYield: y }).value;
    expect(Math.abs(good - 40) / 40).toBeLessThanOrEqual(0.03);
  });
});

describe('S220 Table 2 — 학습률 γ 와 「월별 감소율」 열의 자기정합 (±0.1 %p)', () => {
  // 문헌이 같은 표에 γ 와 1−e^(−γ) 를 함께 인쇄했다. 두 열이 서로를 검증한다.
  const cases: Array<['350nm' | '250nm' | '180nm', number]> = [
    ['350nm', 4.4], ['250nm', 4.0], ['180nm', 6.5],
  ];
  for (const [node, pct] of cases) {
    it(`${node} → ${pct} %/month`, () => {
      expect(Math.abs(monthlyLossReduction(node).value * 100 - pct)).toBeLessThanOrEqual(0.1);
    });
  }
});

describe('🔴 A4 — Poisson 적용한계를 넘으면 계산을 거부한다 (S220 §2·§5)', () => {
  it('A = 2 cm², D₀ = 1 /cm² (A > 0.25 이고 A·D₀ = 2 ≥ 1) → 던진다', () => {
    expect(() => poissonYield({ areaCm2: 2, defectDensityPerCm2: 1 }))
      .toThrow(/Poisson 적용한계/);
  });
  it('현 제품이 쓰던 A·D₀ ≤ 4 는 문헌 한계의 4배다 — A·D₀ = 4 도 거부된다', () => {
    expect(() => poissonYield({ areaCm2: 4, defectDensityPerCm2: 1 })).toThrow();
  });
  it('A ≤ 0.25 cm² 면 A·D₀ 가 커도 허용된다 (S220 은 「또는」이다)', () => {
    expect(poissonYield({ areaCm2: 0.25, defectDensityPerCm2: 20 }).value).toBeGreaterThan(0);
  });
  it('음이항 기본 α 는 2 다 (S223 · ITRS 전 제품군)', () => {
    expect(ALPHA_DEFAULT.value).toBe(2);
    expect(ALPHA_DEFAULT.sourceId).toBe('S223');
  });
});
