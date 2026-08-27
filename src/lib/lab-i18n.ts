import jaLab from '@/locales/ja-labs.json';

const JA_LAB = jaLab as Record<string, string>;

export function labText(lang: string, item: { ko: string; en: string; ja?: string }): string {
  if (lang === 'ko') return item.ko;
  if (lang === 'ja') return item.ja ?? JA_LAB[item.en] ?? item.en;
  return item.en;
}

export function labEnglishText(lang: string, en: string | undefined): string | undefined {
  if (!en || lang !== 'ja') return en;
  return JA_LAB[en] ?? en;
}
