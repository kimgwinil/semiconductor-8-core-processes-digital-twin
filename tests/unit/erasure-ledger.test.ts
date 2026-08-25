import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalResultSink, enqueue, queuedResults, storedResults } from '@/result/sink';
import { LocalEraser, STORAGE_LOCATIONS, type StorageLocation } from '@/result/erasure';
import { RESULT_QUEUE_KEY, RESULT_STORE_KEY } from '@/result/keys';
import type { ResultPayload } from '@/result/schema';

/**
 * 🔴 D-038 파기 경로 회귀 — 「값이 같아서 아무도 못 보는」 결함을 다시 만들지 않기 위한 테스트.
 *
 * 2026-08-21 이전 상태: 키가 sink·erasure·원장 세 곳에 각각 적혀 있었고,
 * 한쪽만 v2 로 올려도 **18개 기존 테스트가 전부 통과**했다(실측). 그 상태에서
 * `erase()` 는 옛 키에서 0건을 찾아 `remaining: []` 을 돌려주고,
 * 호출부는 그것을 「파기 완료」로 읽는다 — 조용한 파기 실패다.
 *
 * 그래서 이 파일은 **문자열을 비교하지 않는다.** 실제로 저장하고, 실제로 파기하고,
 * 저장소에 무엇이 남았는지로 판정한다(부분문자열 검사 금지 — README §6 규율 3).
 */

/** 테스트용 localStorage 스텁. 어떤 키에 실제로 썼는지 관찰한다. */
class MemStorage {
  readonly map = new Map<string, string>();
  /** 실제로 쓰기가 일어난 키. 「sink 가 어디에 쓰는가」를 코드가 아니라 관찰로 얻는다. */
  readonly written = new Set<string>();
  /** 이 키에 쓰면 실패한다(용량 초과·차단 재현). */
  readonly failOn = new Set<string>();

  getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string): void {
    if (this.failOn.has(k)) throw new Error('quota exceeded (테스트 스텁)');
    this.written.add(k);
    this.map.set(k, v);
  }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

let store: MemStorage;

beforeEach(() => {
  store = new MemStorage();
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = store;
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: MemStorage }).localStorage;
});

function payload(pseudonymId: string): ResultPayload {
  return {
    schemaVersion: 1,
    submittedAt: '2026-08-21T00:00:00.000Z',
    appVersion: 'test',
    trackId: 'fe',
    processId: 'oxidation',
    attemptNo: 1,
    score: { correct: 1, total: 2, percent: 50 },
    items: [],
    weakDiagnosis: [],
    pseudonymId,
  };
}

/** 원장에서 localStorage 종류만 골라 실제 키 집합을 만든다. */
function ledgerLocalKeys(locations: readonly StorageLocation[] = STORAGE_LOCATIONS): Set<string> {
  const out = new Set<string>();
  for (const l of locations) if (l.kind === 'localStorage') out.add(l.key);
  return out;
}

describe('🔴 왕복 — sink 가 쓴 것을 erasure 가 반드시 찾아낸다', () => {
  it('본저장·재시도 큐에 실제로 저장한 뒤 파기하면 0건이 된다', async () => {
    await new LocalResultSink().submit(payload('A03'));
    await new LocalResultSink().submit(payload('A03'));
    await new LocalResultSink().submit(payload('B77'));
    enqueue(payload('A03'));
    enqueue(payload('B77'));

    expect(storedResults().length).toBe(3);
    expect(queuedResults().length).toBe(2);

    const eraser = new LocalEraser();
    expect((await eraser.find('A03')).length).toBe(3); // 본저장 2 + 큐 1

    const r = await eraser.erase('A03');
    expect(r.found).toBe(3);
    expect(r.erased).toBe(3);

    // 🔴 판정은 저장소의 실제 내용으로 한다.
    expect(storedResults().filter((x) => x.pseudonymId === 'A03').length).toBe(0);
    expect(queuedResults().filter((x) => x.pseudonymId === 'A03').length).toBe(0);
    // 남의 데이터는 건드리지 않는다.
    expect(storedResults().filter((x) => x.pseudonymId === 'B77').length).toBe(1);
    expect(queuedResults().filter((x) => x.pseudonymId === 'B77').length).toBe(1);
    expect(await eraser.find('A03')).toEqual([]);
  });

  it('🔴 sink 가 실제로 쓴 키는 전부 원장에 등재돼 있다 (관찰로 판정)', async () => {
    await new LocalResultSink().submit(payload('A03'));
    enqueue(payload('A03'));

    const ledger = ledgerLocalKeys();
    // 「파기되지 않는 곳은 원장에 없다」의 역 — 저장되는 곳은 반드시 원장에 있다.
    for (const k of store.written) {
      expect(ledger.has(k), `저장은 되는데 원장에 없는 키: ${k}`).toBe(true);
    }
    // 두 경로 모두 실제로 쓰였는지 확인한다(빈 집합이면 위 루프가 공허하게 통과한다).
    expect(store.written.size).toBe(2);
  });

  it('원장의 두 정본 키가 실제 저장 키와 일치한다', async () => {
    await new LocalResultSink().submit(payload('A03'));
    enqueue(payload('A03'));
    expect([...store.written].sort()).toEqual([RESULT_QUEUE_KEY, RESULT_STORE_KEY].sort());
  });
});

describe('🔴 원장이 곧 파기 경로다', () => {
  it('원장 항목을 추가하면 파기 순회가 그 자리도 지운다', async () => {
    const extraKey = 'cjh.results.extra.test';
    const extra: StorageLocation = {
      kind: 'localStorage',
      id: `localStorage:${extraKey}`,
      key: extraKey,
      desc: '테스트용 추가 저장 위치',
      remote: false,
    };
    store.map.set(extraKey, JSON.stringify([payload('A03'), payload('B77')]));

    const r = await new LocalEraser([...STORAGE_LOCATIONS, extra]).erase('A03');
    expect(r.found).toBe(1);
    expect(r.erased).toBe(1);

    const left = JSON.parse(store.map.get(extraKey)!) as ResultPayload[];
    expect(left.map((x) => x.pseudonymId)).toEqual(['B77']);
  });

  it('원장 항목이 열람(find)에도 그대로 반영된다', async () => {
    const extraKey = 'cjh.results.extra.test';
    const extra: StorageLocation = {
      kind: 'localStorage', id: `localStorage:${extraKey}`, key: extraKey,
      desc: '테스트용 추가 저장 위치', remote: false,
    };
    store.map.set(extraKey, JSON.stringify([payload('A03')]));
    expect((await new LocalEraser([...STORAGE_LOCATIONS, extra]).find('A03')).length).toBe(1);
    // 원장에 없으면 보이지 않는다 — 원장이 시야의 전부라는 뜻이다.
    expect((await new LocalEraser().find('A03')).length).toBe(0);
  });

  it('원장의 localStorage 항목 id 는 키에서 조립된다 (문자열을 따로 적지 않는다)', () => {
    for (const l of STORAGE_LOCATIONS) {
      if (l.kind !== 'localStorage') continue;
      expect(l.id).toBe(`localStorage:${l.key}`);
    }
  });

  it('정본 두 키가 원장에 등재돼 있다', () => {
    const keys = ledgerLocalKeys();
    expect(keys.has(RESULT_STORE_KEY)).toBe(true);
    expect(keys.has(RESULT_QUEUE_KEY)).toBe(true);
  });
});

describe('🔴 remaining 이 비어 있다는 것은 「완전 파기」를 뜻한다', () => {
  it('내려받기 사본은 코드로 지울 수 없으므로 항상 remaining 에 남는다', async () => {
    const uncontrolled = STORAGE_LOCATIONS.filter((l) => l.kind === 'uncontrolled');
    expect(uncontrolled.length).toBeGreaterThan(0);

    // 로컬에 데이터가 0건이어도 「완전 파기」라고 말하지 않는다.
    const empty = await new LocalEraser().erase('A03');
    expect(empty.found).toBe(0);
    for (const l of uncontrolled) expect(empty.remaining).toContain(l.id);

    // 데이터를 지운 뒤에도 마찬가지다.
    await new LocalResultSink().submit(payload('A03'));
    const after = await new LocalEraser().erase('A03');
    expect(after.erased).toBe(1);
    for (const l of uncontrolled) expect(after.remaining).toContain(l.id);
  });

  it('remote 항목은 「지웠다」로 세지 않고 remaining 에 남긴다', async () => {
    const remote: StorageLocation = {
      kind: 'remote', id: 'sheet:2026-1학기_A기관', desc: '원격 시트(테스트)', remote: true,
    };
    const r = await new LocalEraser([remote]).erase('A03');
    expect(r.found).toBe(0);
    expect(r.erased).toBe(0);
    expect(r.remaining).toEqual(['sheet:2026-1학기_A기관']);
  });

  it('🔴 파기기가 다룰 줄 모르는 새 종류는 조용히 넘어가지 않는다', async () => {
    // 원장에 새 kind 가 늘었는데 파기기가 배우지 못한 상황을 재현한다.
    const unknown = {
      kind: 'indexedDB', id: 'indexedDB:cjh.future', desc: '미래에 생길 저장소', remote: false,
    } as unknown as StorageLocation;
    const r = await new LocalEraser([unknown]).erase('A03');
    expect(r.erased).toBe(0);
    expect(r.remaining).toEqual(['indexedDB:cjh.future']);
  });

  it('쓰기 실패는 그 위치를 remaining 에 남긴다', async () => {
    await new LocalResultSink().submit(payload('A03'));
    store.failOn.add(RESULT_STORE_KEY);

    const r = await new LocalEraser().erase('A03');
    expect(r.found).toBe(1);
    expect(r.erased).toBe(0);
    expect(r.remaining).toContain(`localStorage:${RESULT_STORE_KEY}`);
    // 실제로 남아 있어야 한다 — 「실패했다」는 보고가 사실인지 저장소로 확인한다.
    expect(storedResults().filter((x) => x.pseudonymId === 'A03').length).toBe(1);
  });
});
