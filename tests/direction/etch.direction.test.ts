// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { ETCH_RULES, etchModel } from '@/models/physics/etch/rules';
import { runRule, expectTradeoff, type Sweep } from './runner';

/**
 * 🔴 A12 — 식각 방향성 검증. 골든값이 「값이 맞는가」라면 이쪽은 「방향이 맞는가」다.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(규약 §2-4).
 *
 * 🔴 **비단조를 단조로 걸지 않는다.** ET-D3 은 문헌이 실측한 (110)/(100) 선택비의 40 wt% 최댓값이며
 *    `non-monotonic` 으로 검사한다. 무조건 단조로 걸면 틀린 물리를 강제한다.
 */
const BASE = {
  tempC: 70,
  kohWtPercent: 40,
  aspectRatio: 20,
  cycles: 30,
  maskConsumedUm: 2,
  neM3: 1e18,
  teEv: 2.3,
  areaRatio: 2,
};

const sweeps: Record<string, Sweep> = {
  // S164 가 측정한 28–80 °C 전 구간
  'ET-D1': { from: 28, to: 80, steps: 26, baseline: { ...BASE } },
  // S166 Appendix Table 1 이 덮는 30–50 wt%
  'ET-D2': { from: 30, to: 50, steps: 20, baseline: { ...BASE } },
  'ET-D3': { from: 30, to: 50, steps: 20, baseline: { ...BASE } },
  'ET-D4': { from: 30, to: 50, steps: 20, baseline: { ...BASE } },
  // S162 가 유효하다고 명시한 α > 10 구간만
  'ET-D5': { from: 10, to: 100, steps: 18, baseline: { ...BASE } },
  'ET-D6': { from: 1, to: 100, steps: 20, baseline: { ...BASE } },
  'ET-D7': { from: 0.5, to: 2, steps: 15, baseline: { ...BASE } },
  // S163 최솟값 ~ S165 예제 조건
  'ET-D8': { from: 1.09e14, to: 1e20, steps: 20, baseline: { ...BASE } },
  'ET-D9': { from: 1, to: 100, steps: 20, baseline: { ...BASE } },
  'ET-D10': { from: 0, to: 500, steps: 20, baseline: { ...BASE } },
};

describe('A12 식각 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(ETCH_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of ETCH_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of ETCH_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
  it('🔴 비단조 규칙이 최소 1개 있다 — 실재하는 최댓값을 단조로 뭉개지 않았다', () => {
    const nm = ETCH_RULES.filter((r) => r.expect.some((e) => e.trend === 'non-monotonic'));
    expect(nm.length).toBeGreaterThanOrEqual(1);
  });
  it('출력 2개를 함께 보는 상충 규칙이 최소 2개 있다', () => {
    expect(ETCH_RULES.filter((r) => r.expect.length >= 2).length).toBeGreaterThanOrEqual(2);
  });
});

for (const rule of ETCH_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, etchModel);
    });
  });
}

describe('ET-D6 상충 — 깊이는 늘고 평균 속도는 그대로다', () => {
  it('두 출력의 추세가 각각 선언돼 있다', () => {
    const r = ETCH_RULES.find((x) => x.id === 'ET-D6');
    expect(r).toBeDefined();
    expectTradeoff(r!, 'boschDepthUm', 'boschAvgRateUmPerMin');
    expect(r?.expect.find((e) => e.output === 'boschDepthUm')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'boschAvgRateUmPerMin')?.trend).toBe('flat');
  });
});

describe('ET-D8 상충 — 같은 입력이 두 출력을 반대로 끈다', () => {
  it('λ_D 는 감소, ω_pe 는 증가로 선언돼 있다', () => {
    const r = ETCH_RULES.find((x) => x.id === 'ET-D8');
    expect(r).toBeDefined();
    expectTradeoff(r!, 'debyeLengthMm', 'plasmaFreqPerS');
    expect(r?.expect.find((e) => e.output === 'debyeLengthMm')?.trend).toBe('decreasing');
    expect(r?.expect.find((e) => e.output === 'plasmaFreqPerS')?.trend).toBe('increasing');
  });
});

describe('🔴 ET-D3 비단조 — 최댓값이 실제로 스윕 안에 있다', () => {
  it('40 wt% 값이 양 끝보다 크다', () => {
    const at = (wt: number) => etchModel({ ...BASE, kohWtPercent: wt }).koh110over100 as number;
    expect(at(40)).toBeGreaterThan(at(30));
    expect(at(40)).toBeGreaterThan(at(50));
  });
});
