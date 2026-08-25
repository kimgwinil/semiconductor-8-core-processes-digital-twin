// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { OXIDATION_RULES, oxidationModel } from '@/models/physics/oxidation/rules';
import { runRule, type Sweep } from './runner';

/**
 * 🔴 A12 — 산화 방향성 검증. 골든값이 「값이 맞는가」라면 이쪽은 「방향이 맞는가」다.
 * 스윕 구간·기준값은 검증 설정이므로 이 파일이 소유한다.
 */
const BASE = { tempC: 1000, timeH: 2, ambientIndex: 1, orientationIndex: 1 };

const sweeps: Record<string, Sweep> = {
  'OX-D1': { from: 920, to: 1200, steps: 3, baseline: { ...BASE } },
  'OX-D2': { from: 0, to: 1, steps: 1, baseline: { ...BASE } },
  'OX-D3': { from: 0.1, to: 20, steps: 24, baseline: { ...BASE } },
  'OX-D4': { from: 0, to: 1, steps: 1, baseline: { ...BASE, timeH: 0.2 } },
  'OX-D5': { from: 0.5, to: 10, steps: 12, baseline: { ...BASE } },
};

describe('A12 산화 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(OXIDATION_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of OXIDATION_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of OXIDATION_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
});

for (const rule of OXIDATION_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, oxidationModel);
    });
  });
}

describe('OX-D3 상충 — 두께는 늘고 성장률은 준다', () => {
  it('두 출력의 추세가 반대로 선언돼 있다', () => {
    const r = OXIDATION_RULES.find((x) => x.id === 'OX-D3');
    expect(r?.expect.find((e) => e.output === 'thicknessNm')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'growthRateNmPerMin')?.trend).toBe('decreasing');
  });
});
