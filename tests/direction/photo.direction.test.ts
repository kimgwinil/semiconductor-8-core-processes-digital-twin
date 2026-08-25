// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { PHOTO_RULES, photoModel } from '@/models/physics/photo/rules';
import { runRule, type Sweep } from './runner';

/** 🔴 A12 — 포토 방향성 검증. 핵심은 해상도↔DOF 상충이다. */
const BASE = { lambdaNm: 193, na: 1.0, k1: 0.3, targetCdNm: 60 };

const sweeps: Record<string, Sweep> = {
  'PH-D1': { from: 0.4, to: 1.35, steps: 20, baseline: { ...BASE } },
  'PH-D2': { from: 193, to: 436, steps: 16, baseline: { ...BASE, na: 0.8 } },
  'PH-D3': { from: 0.25, to: 1.0, steps: 16, baseline: { ...BASE, na: 1.35 } },
  'PH-D4': { from: 0.4, to: 1.35, steps: 16, baseline: { ...BASE } },
  'PH-D5': { from: 0.33, to: 0.55, steps: 12, baseline: { ...BASE, lambdaNm: 13.5 } },
  'PH-D6': { from: -150, to: 150, steps: 30, baseline: { ...BASE } },
};

describe('A12 포토 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => expect(PHOTO_RULES.length).toBeGreaterThanOrEqual(5));
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of PHOTO_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
});

for (const rule of PHOTO_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, photoModel);
    });
  });
}

describe('🔴 PH-D1 상충 — NA 를 올리면 해상도는 좋아지고 DOF 는 나빠진다', () => {
  it('두 출력이 같은 부호로 함께 감소한다 (얻는 것과 잃는 것)', () => {
    const lo = photoModel({ ...BASE, na: 0.6 });
    const hi = photoModel({ ...BASE, na: 1.3 });
    expect(hi['cdNm']).toBeLessThan(lo['cdNm'] as number);       // 해상도 개선
    expect(hi['dofNm']).toBeLessThan(lo['dofNm'] as number); // DOF 손실
  });
  it('단일 인자가 결과 2개를 서로 다른 의미로 움직인다 (규정 §4-1(1) 슬라이더 장난감 방지)', () => {
    const r = PHOTO_RULES.find((x) => x.id === 'PH-D1');
    expect(r?.expect.length).toBeGreaterThanOrEqual(2);
  });
});
