import { allProcessIds, sectionsOf, trackOf, activeTracks } from '@/content/catalog';
import type { SectionId } from '@/content/types';

export type SectionState = 'unvisited' | 'visited' | 'done';

/** progress[trackId][processId][sectionId] */
type ProgressMap = Record<string, Record<string, Record<string, SectionState>>>;

const KEY = 'cjh.progress.v1';

function load(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p: unknown = JSON.parse(raw);
    return (p && typeof p === 'object') ? (p as ProgressMap) : {};
  } catch { return {}; }
}

function save(m: ProgressMap): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* noop */ }
}

let cache: ProgressMap | null = null;
const listeners = new Set<() => void>();

function map(): ProgressMap {
  if (cache === null) cache = load();
  return cache;
}

export function subscribeProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function stateOf(processId: string, sectionId: SectionId): SectionState {
  const track = trackOf(processId);
  if (!track) return 'unvisited';
  return map()[track.id]?.[processId]?.[sectionId] ?? 'unvisited';
}

export function mark(processId: string, sectionId: SectionId, state: SectionState): void {
  const track = trackOf(processId);
  if (!track) return;
  const m = map();
  const byTrack = (m[track.id] ??= {});
  const byProcess = (byTrack[processId] ??= {});
  const prev = byProcess[sectionId];
  // done 은 visited 로 되돌리지 않는다
  if (prev === 'done' && state === 'visited') return;
  byProcess[sectionId] = state;
  save(m);
  listeners.forEach((fn) => fn());
}

export type Scope =
  | { kind: 'all' }
  | { kind: 'track'; id: string }
  | { kind: 'process'; id: string };

export interface ProgressSummary { done: number; visited: number; total: number; percent: number }

/** 트랙별로도, 전체로도 집계된다(설계서 §11-3). 분모는 상수가 아니다. */
export function aggregate(scope: Scope): ProgressSummary {
  let ids: string[];
  if (scope.kind === 'process') ids = [scope.id];
  else if (scope.kind === 'track') ids = activeTracks().find((t) => t.id === scope.id)?.processes ?? [];
  else ids = allProcessIds();

  let done = 0, visited = 0, total = 0;
  for (const pid of ids) {
    for (const sid of sectionsOf(pid)) {
      total += 1;
      const st = stateOf(pid, sid);
      if (st === 'done') done += 1;
      else if (st === 'visited') visited += 1;
    }
  }
  return { done, visited, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
