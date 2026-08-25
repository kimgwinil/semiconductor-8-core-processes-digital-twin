import { describe, expect, it } from 'vitest';
import type { QuestionSet, QuestionItem } from '@/content/types';

/**
 * A3 — 「문항별 해설」의 나머지 절반인 **오답 사유**가 실제로 실려 있는지.
 *
 * 🔴 이 파일이 있는 이유. 원장 `04_문항원장.md` 는 문항마다 「오답 해설」을 갖고 있었는데
 * 앱에는 `explanation`(정답이 왜 정답인가)만 실려 있었다. 학습자가 틀렸을 때 화면은
 * 「오답」이라고만 말하고 **내가 고른 그것이 왜 틀렸는지는 말하지 않았다.**
 * 데이터가 다시 조용히 빠져나가지 않도록 여기서 개수와 정합성을 붙잡는다.
 *
 * ⚠️ en 은 검사하지 않는다 — 원장이 한국어뿐이라 **en 오답 사유 원고가 존재하지 않는다.**
 *    없는 번역을 지어내지 않기로 한 결정이며, en 원고가 들어오면 이 파일에 en 절을 연다.
 */

/** 앱과 **같은 경로**로 읽는다 — 테스트만 따로 읽으면 배선이 끊겨도 초록이 뜬다. */
const MODULES = import.meta.glob<{ default: QuestionSet }>(
  '/src/content/ko/questions/*.json',
  { eager: true },
);

const files: { pid: string; set: QuestionSet }[] = Object.entries(MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([p, mod]) => ({ pid: p.replace(/^.*\/(.*)\.json$/, '$1'), set: mod.default }));
const allItems: QuestionItem[] = files.flatMap((f) => f.set.items);

/**
 * 🔴 원장과 앱의 정본이 **갈려 있어** 오답 사유를 싣지 못한 문항.
 * 원장 쪽 수치로 쓰인 오답 사유를 앱 지문 위에 얹으면 화면이 학습자에게 거짓 수치를 말한다.
 * 정본이 확정되면 이 목록을 비우고 배선한다 — 목록이 빈 채로 통과하는 것이 최종 상태다.
 */
const HELD_FOR_SOURCE_CONFLICT: Record<string, string> = {
  'photo-q07': '원장 k₂ = 0.745(정답 78.9 nm) ↔ 앱 k2 = 0.60(정답 63.5 nm) — 정본 판정 대기',
  // metal-q08 은 앱을 원장 정본(Ea = 0.80 eV · 1.54×10⁵ h)으로 맞춘 뒤 배선했다.
};

describe('오답 사유 — 배선', () => {
  it('공정 파일이 8개이고 각 10문항이다', () => {
    expect(files).toHaveLength(8);
    for (const { pid, set } of files) {
      expect(set.items, pid).toHaveLength(10);
    }
  });

  it('정본 충돌로 보류한 문항을 뺀 79문항 전부가 오답 사유를 갖는다', () => {
    const missing = allItems
      .filter((q) => !(q.id in HELD_FOR_SOURCE_CONFLICT))
      .filter((q) => (q.distractors ?? []).length === 0)
      .map((q) => q.id);
    expect(missing).toEqual([]);
    expect(allItems.filter((q) => (q.distractors ?? []).length > 0)).toHaveLength(79);
  });

  it('보류 문항은 오답 사유를 갖지 않는다 — 절반만 실린 상태를 만들지 않는다', () => {
    for (const id of Object.keys(HELD_FOR_SOURCE_CONFLICT)) {
      const q = allItems.find((x) => x.id === id);
      expect(q, id).toBeDefined();
      expect(q?.distractors, id).toBeUndefined();
    }
  });
});

describe('오답 사유 — 정합성', () => {
  it('🔴 정답 보기가 오답 사유 목록에 들어 있지 않다', () => {
    const lying = allItems
      .filter((q) => q.type === 'single')
      .flatMap((q) => (q.distractors ?? [])
        .filter((d) => d.choiceIndex === q.answer)
        .map(() => `${q.id}: 정답 ${String(q.answer)} 가 오답으로 실렸다`));
    expect(lying).toEqual([]);
  });

  it('선택형의 choiceIndex 가 보기 범위 안이고 중복되지 않는다', () => {
    const bad: string[] = [];
    for (const q of allItems.filter((x) => x.type === 'single')) {
      const n = (q.choices ?? []).length;
      const seen = new Set<number>();
      for (const d of q.distractors ?? []) {
        if (typeof d.choiceIndex !== 'number') { bad.push(`${q.id}: choiceIndex 없음`); continue; }
        if (d.choiceIndex < 0 || d.choiceIndex >= n) bad.push(`${q.id}: ${d.choiceIndex} 범위 밖(0~${n - 1})`);
        if (seen.has(d.choiceIndex)) bad.push(`${q.id}: ${d.choiceIndex} 중복`);
        seen.add(d.choiceIndex);
      }
    }
    expect(bad).toEqual([]);
  });

  it('단답·계산형에는 choiceIndex 가 없다 — 보기가 없는 유형이다', () => {
    const bad = allItems
      .filter((q) => q.type !== 'single')
      .flatMap((q) => (q.distractors ?? [])
        .filter((d) => d.choiceIndex !== undefined)
        .map(() => `${q.id}: ${q.type} 인데 choiceIndex 가 있다`));
    expect(bad).toEqual([]);
  });

  it('오답 사유 본문이 비어 있지 않다', () => {
    const empty = allItems.flatMap((q) => (q.distractors ?? [])
      .filter((d) => d.text.trim().length === 0)
      .map(() => q.id));
    expect(empty).toEqual([]);
  });

  it('Markdown 문법과 보기 번호 접두사가 본문에 남아 있지 않다', () => {
    const dirty = allItems.flatMap((q) => (q.distractors ?? [])
      .filter((d) => /\*\*|`/.test(d.text) || /^[①②③④]/.test(d.text))
      .map((d) => `${q.id}: ${d0(d.text)}`));
    expect(dirty).toEqual([]);
  });

  /**
   * 🔴 학습자 화면에 출제 측 내부 편집 이력이 새지 않는지.
   * 원장에는 「PLN 정정 2026-08-20: …」 같은 검수 메모가 해설 본문에 섞여 있는 자리가 있다.
   * 그런 원소는 배선하지 않고 보류했다 — 이 검사가 그 결정을 지킨다.
   * 🔴 **사내 문서 포인터(「규약 §6-3」 등)도 같이 막는다.** 학습자는 그 문서를 볼 수 없다.
   *    2026-08-22 실측: 7건이 새어 있었고 포인터만 지워 문장은 그대로 두었다.
   */
  it('내부 편집 이력·사내 문서 포인터가 학습자용 본문에 실려 있지 않다', () => {
    const leaked = allItems.flatMap((q) => (q.distractors ?? [])
      .filter((d) => /PLN 정정|전수 점검 #|(규약|원장|설계서|명세|채점 규칙|README)\s*§|§\d/.test(d.text))
      .map((d) => `${q.id}: ${d0(d.text)}`));
    expect(leaked).toEqual([]);
  });
});

function d0(s: string): string {
  return s.slice(0, 60);
}
