/**
 * 🔴 근거 미확정(`sourceId: 'PENDING'`) 잔여 집계 — **한 곳에서만 센다.**
 *
 * 오케스트레이터 판정 3 (2026-08-20): PENDING 을 FAIL→WARN 으로 완화하는 것은 승인됐다.
 * **다만 영구 면제가 아니다.** 조건 3가지가 붙었고 그중 둘이 이 모듈에 걸려 있다:
 *   ① 잔여를 **출시 게이트(D-008) 차단 항목**으로 등재 → README §1 게이트 1-8
 *   ② 잔여 건수를 **verify 요약에 항상 출력** → verify.mjs 가 이 함수를 부른다
 *   ③ 앞으로 게이트 완화는 **사전에 오케스트레이터 판정 사항** (강화는 개발팀 재량)
 *
 * `check-sources` 와 `verify` 가 각자 세면 언젠가 두 숫자가 갈린다. 그래서 공용으로 뺐다.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const PENDING_SOURCE_ID = 'PENDING';

function walkJson(node, fn) {
  if (Array.isArray(node)) { for (const n of node) walkJson(n, fn); return; }
  if (node && typeof node === 'object') { fn(node); for (const v of Object.values(node)) walkJson(v, fn); }
}

/** @returns {{ hits: number, itemIds: Set<string>, files: Map<string, number> }} */
export function countPending(appRoot) {
  const itemIds = new Set();
  const files = new Map();
  let hits = 0;
  const contentDir = join(appRoot, 'src', 'content');
  if (!existsSync(contentDir)) return { hits, itemIds, files };

  const stack = [contentDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.json')) continue;
      let data;
      try { data = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
      let n = 0;
      walkJson(data, (node) => {
        if (node.sourceId === PENDING_SOURCE_ID) {
          hits++; n++;
          itemIds.add(String(node.id ?? '(id 없음)'));
        }
      });
      if (n > 0) files.set(p.slice(appRoot.length + 1), n);
    }
  }
  return { hits, itemIds, files };
}

/** verify 요약 한 줄. 0 이면 0 이라고 적는다 — 침묵은 「없음」의 증거가 아니다. */
export function pendingSummaryLine(appRoot) {
  const { hits, itemIds } = countPending(appRoot);
  return hits === 0
    ? '근거 미확정(PENDING) 0건 — 출시 게이트 1-8 해제 가능'
    : `🔴 근거 미확정(PENDING) ${hits}건 (문항 ${itemIds.size}개 × 2언어) — 0 이 되기 전 대외 공개 불가(출시 게이트 1-8)`;
}
