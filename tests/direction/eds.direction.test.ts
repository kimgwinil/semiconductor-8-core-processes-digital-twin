// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { EDS_RULES, edsModel } from '@/models/physics/eds/rules';
import { murphyYield, poissonYield, seedsYield } from '@/models/physics/eds/yieldModels';
import { OPERATIONAL_ASSUMPTION } from '@/models/physics/eds/probeOperations';
import { runRule, type Sweep } from './runner';

/**
 * 🔴 A12 — EDS 방향성 검증. 골든값이 「값이 맞는가」라면 이쪽은 「방향이 맞는가」다.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(규약 §2-4).
 *
 * 🔴 기준값은 Poisson 적용한계(S220 §5) 안에 있도록 잡았다 — 스윕 도중 계산이 정지하지 않게.
 */
const BASE: Record<string, number> = {
  dieAreaCm2: 0.2,
  defectDensityPerCm2: 0.5,
  alpha: 2,
  adProduct: 1,
  diameterCm: 30,
  dieYield: 0.9,
  coverage: 0.95,
  sigma: 0.3,
  usl: 1,
  lsl: -1,
  mean: 0,
  months: 6,
  initialLoss: 0.5,
  overdriveMil: 2,
  overdriveUm: 50,
  markLengthUm: 30,
  markWidthUm: 20,
  offsetXUm: 0,
  offsetYUm: 0,
  openingWidthUm: 60,
  openingHeightUm: 100,
};

const sweeps: Record<string, Sweep> = {
  // A = 0.2 cm² ≤ 0.25 → 전 구간에서 Poisson 적용한계 안
  'EDS-D1': { from: 0.05, to: 1.0, steps: 20, baseline: { ...BASE } },
  // D₀ = 0.5 → A·D₀ ≤ 0.95 < 1 → 전 구간 적용한계 안
  'EDS-D2': { from: 0.05, to: 1.9, steps: 20, baseline: { ...BASE } },
  'EDS-D3': { from: 0.1, to: 4.0, steps: 20, baseline: { ...BASE } },
  'EDS-D4': { from: 0.5, to: 0.999, steps: 20, baseline: { ...BASE } },
  'EDS-D5': { from: 0.1, to: 0.5, steps: 16, baseline: { ...BASE } },
  'EDS-D6': { from: 0.5, to: 7, steps: 20, baseline: { ...BASE } },
  'EDS-D7': { from: 1, to: 3, steps: 8, baseline: { ...BASE } },
  'EDS-D8': { from: 10, to: 55, steps: 15, baseline: { ...BASE } },
  'EDS-D9': { from: 0, to: 24, steps: 24, baseline: { ...BASE } },
  'EDS-D10': { from: 25, to: 76, steps: 34, baseline: { ...BASE } },
};

describe('A12 EDS — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(EDS_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of EDS_RULES) expect(r.sourceId.length, r.id).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of EDS_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
  it('모든 규칙의 processId 가 eds 다', () => {
    for (const r of EDS_RULES) expect(r.processId).toBe('eds');
  });
});

for (const rule of EDS_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, edsModel);
    });
  });
}

describe('EDS-D3 순서 관계 — 같은 A·D₀ 에서 Seeds ≥ Murphy ≥ Poisson', () => {
  it('A·D₀ 를 0.1~4 로 훑어도 순서가 뒤집히지 않는다', () => {
    for (let i = 1; i <= 40; i++) {
      const ad = i / 10;
      const args = { areaCm2: 1, defectDensityPerCm2: ad };
      const seeds = seedsYield(args).value;
      const murphy = murphyYield(args).value;
      const poisson = Math.exp(-ad); // 적용한계 밖이라 poissonYield() 는 거부한다 — 식으로만 비교
      expect(seeds, `A·D₀=${ad}`).toBeGreaterThanOrEqual(murphy);
      expect(murphy, `A·D₀=${ad}`).toBeGreaterThanOrEqual(poisson);
    }
  });
  it('적용한계 안(A ≤ 0.25)에서도 순서가 같다 — 실제 계산 경로로 확인', () => {
    const args = { areaCm2: 0.25, defectDensityPerCm2: 2 };
    expect(seedsYield(args).value).toBeGreaterThanOrEqual(murphyYield(args).value);
    expect(murphyYield(args).value).toBeGreaterThanOrEqual(poissonYield(args).value);
  });
});

describe('EDS-D5 상충 — σ 가 커지면 Cpk 는 떨어지고 불량률은 오른다', () => {
  it('두 출력의 추세가 반대로 선언돼 있다', () => {
    const r = EDS_RULES.find((x) => x.id === 'EDS-D5');
    expect(r?.expect.find((e) => e.output === 'cpk')?.trend).toBe('decreasing');
    expect(r?.expect.find((e) => e.output === 'defectiveFraction')?.trend).toBe('increasing');
  });
});

describe('🔴 A15-op — B군 규칙은 화면에서 구분된다', () => {
  const bGroup = ['EDS-D7', 'EDS-D8', 'EDS-D10'];
  it('B군 규칙의 note 가 「[운영규약」으로 시작한다', () => {
    for (const id of bGroup) {
      const r = EDS_RULES.find((x) => x.id === id);
      expect(r?.note, id).toMatch(/^\[운영규약/);
    }
  });
  it('B군 규칙의 statement 에도 [운영규약] 표식이 있다', () => {
    for (const id of bGroup) {
      expect(EDS_RULES.find((x) => x.id === id)?.statement, id).toMatch(/\[운영규약\]/);
    }
  });
  it('A군 규칙에는 운영규약 표식이 없다', () => {
    for (const r of EDS_RULES.filter((x) => !bGroup.includes(x.id))) {
      expect(r.statement, r.id).not.toMatch(/운영규약/);
    }
  });
  it('표식 상수가 정해진 문자열이다 (UI 배지가 이것을 본다)', () => {
    expect(OPERATIONAL_ASSUMPTION).toBe('[운영규약] A15-op — 물리 법칙이 아니라 업계 운영 범위');
  });
});
