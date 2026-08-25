import { describe, expect, it } from 'vitest';
import { A6_LOCKED, blockedA6Items } from '@/models/a6-locked';

/**
 * 🔴 A6 고정 목록이 형해화되지 않게 지킨다.
 * 「교육용이니 배지 붙이고 통과」가 조용히 일어나는 것을 막는 장치다.
 */
describe('A6 고정 목록 — A6-b 로 내릴 수 없는 항목', () => {
  it('목록이 비어 있지 않다', () => {
    expect(A6_LOCKED.length).toBeGreaterThan(0);
  });

  it('모든 항목에 「왜 못 내리는가」와 「어떻게 풀리는가」가 적혀 있다', () => {
    for (const x of A6_LOCKED) {
      expect(x.reason.length, `${x.id} reason`).toBeGreaterThan(20);
      expect(x.resolution.length, `${x.id} resolution`).toBeGreaterThan(20);
    }
  });

  it('막힌 항목은 「화면에서 뺀다」 또는 「대체 표현」이 명시돼 있다', () => {
    for (const x of blockedA6Items()) {
      const ok = /뺀다|제외|대기|비율만/.test(x.resolution);
      expect(ok, `${x.id}: 막힌 항목인데 처리 방침이 불명확하다 — ${x.resolution}`).toBe(true);
    }
  });

  it('id 가 전역 유일하다', () => {
    const ids = A6_LOCKED.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
