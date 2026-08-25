import raw from './catalog.json';
import type { Catalog, Lang, ProcessDef, SectionId, TrackDef } from './types';

export const catalog = raw as unknown as Catalog;

/** 프로덕션에서는 draft 공정을 숨긴다(§11 C6). */
const includeDraft = import.meta.env?.DEV ?? false;

export function activeTracks(): TrackDef[] {
  return [...catalog.tracks]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ ...t, processes: t.processes.filter(isVisible) }))
    .filter((t) => t.processes.length > 0);
}

export function isVisible(processId: string): boolean {
  const p = catalog.processes[processId];
  if (!p) return false;
  return p.status === 'active' || includeDraft;
}

export function getProcess(processId: string): ProcessDef | undefined {
  return catalog.processes[processId];
}

/** 전 트랙을 가로지른 순서대로의 공정 ID 목록. 개수는 데이터가 정한다. */
export function allProcessIds(): string[] {
  return activeTracks().flatMap((t) => t.processes);
}

export function trackOf(processId: string): TrackDef | undefined {
  return activeTracks().find((t) => t.processes.includes(processId));
}

export function sectionsOf(processId: string): SectionId[] {
  return getProcess(processId)?.sections ?? [];
}

export function processName(processId: string, lang: Lang): string {
  const p = getProcess(processId);
  if (!p) return processId;
  return lang === 'en' ? p.en : p.ko;
}

export function trackName(track: TrackDef, lang: Lang): string {
  return lang === 'en' ? track.en : track.ko;
}

/** 전체 절 수 — 진도율 분모. 상수가 아니다(§11-3). */
export function totalSectionCount(): number {
  return allProcessIds().reduce((n, id) => n + sectionsOf(id).length, 0);
}

/** 트랙이 1개면 트랙 선택기를 숨긴다(§11 C4). */
export function showTrackSelector(): boolean {
  return activeTracks().length > 1;
}
