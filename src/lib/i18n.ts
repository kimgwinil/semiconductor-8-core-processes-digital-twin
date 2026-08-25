import type { Lang } from '@/content/types';

type Dict = Record<string, string>;

const loaded = new Map<Lang, Dict>();
let current: Lang = 'ko';
let dict: Dict = {};
const listeners = new Set<() => void>();

export const LANGS: Lang[] = ['ko', 'en'];

export function getLang(): Lang {
  return current;
}

export async function setLang(lang: Lang): Promise<void> {
  if (!loaded.has(lang)) {
    const mod = lang === 'en'
      ? await import('@/locales/en.json')
      : await import('@/locales/ko.json');
    loaded.set(lang, (mod as { default: Dict }).default);
  }
  current = lang;
  dict = loaded.get(lang) ?? {};
  try { localStorage.setItem('cjh.lang', lang); } catch { /* 저장 실패는 무시 */ }
  listeners.forEach((fn) => fn());
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('cjh.lang');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* noop */ }
  return 'ko';
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * 사전이 렌더 **입력**이다. 렌더 후 DOM 텍스트를 치환하지 않는다(설계서 F2).
 * 키를 못 찾으면 키 문자열을 그대로 돌려주고 dev 에서 경고한다 — 조용히 빈 문자열을 내지 않는다.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = dict[key];
  if (raw === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key} (${current})`);
    return key;
  }
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    return v === undefined ? m : String(v);
  });
}
