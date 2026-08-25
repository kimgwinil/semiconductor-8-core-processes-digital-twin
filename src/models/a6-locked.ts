import raw from '@/content/a6-locked.json';

/**
 * 🔴 A6 고정 목록 — **A6-b(교육용 합성 계수)로 내리는 것이 금지된 항목**.
 *
 * 기획팀이 「교육용이라며 등급을 낮출 수 있었으나 막은」 항목이다.
 * 처리 규칙은 셋뿐이다. **네 번째 선택지(배지 붙이고 통과)는 없다.**
 *   ① 출처를 확보해 `withSource` 로 구현한다
 *   ② 못 구하면 **화면에서 그 항목을 뺀다**
 *   ③ 상위 결정으로 범위에서 제외한다
 *
 * 🔴 목록 자체는 **데이터**다(`src/content/a6-locked.json`).
 *    코드에 공정 ID 를 리터럴로 늘어놓지 않는다(설계서 §11 C1).
 */
export interface A6LockedItem {
  id: string;
  processId: string;
  item: string;
  reason: string;
  resolution: string;
  status: 'blocked' | 'resolved';
}

export const A6_LOCKED: readonly A6LockedItem[] =
  (raw as { items: A6LockedItem[] }).items;

/** 아직 막혀 있는 항목 — 화면에서 빼야 할 대상. */
export function blockedA6Items(): readonly A6LockedItem[] {
  return A6_LOCKED.filter((x) => x.status === 'blocked');
}

export function a6LockedOf(processId: string): readonly A6LockedItem[] {
  return A6_LOCKED.filter((x) => x.processId === processId);
}
