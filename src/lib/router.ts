import { allProcessIds, sectionsOf } from '@/content/catalog';
import type { SectionId } from '@/content/types';

export type Route =
  | { kind: 'hub' }
  | { kind: 'section'; processId: string; sectionId: SectionId }
  | { kind: 'about' };

/** `#/p/{processId}/{sectionId}` · `#/` · `#/about` */
export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'hub' };
  if (parts[0] === 'about') return { kind: 'about' };
  if (parts[0] === 'p' && parts.length >= 2) {
    const processId = parts[1] as string;
    if (!allProcessIds().includes(processId)) return { kind: 'hub' };
    const sections = sectionsOf(processId);
    const first = sections[0];
    if (first === undefined) return { kind: 'hub' };
    const wanted = parts[2];
    const sectionId = (wanted && sections.includes(wanted as SectionId))
      ? (wanted as SectionId)
      : first;
    return { kind: 'section', processId, sectionId };
  }
  return { kind: 'hub' };
}

export function hrefFor(route: Route): string {
  switch (route.kind) {
    case 'hub': return '#/';
    case 'about': return '#/about';
    case 'section': return `#/p/${route.processId}/${route.sectionId}`;
  }
}

export function navigate(route: Route): void {
  const next = hrefFor(route);
  if (location.hash !== next) location.hash = next;
}

export function subscribeRoute(fn: () => void): () => void {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}
