import type { ProcessContent, QuestionSet, EquipmentLabelFile, Lang } from './types';

/**
 * 콘텐츠는 코드가 아니라 데이터다. 전부 동적 import 라 초기 청크에 들어가지 않는다.
 * PLN 이 JSON 을 넣으면 코드 수정 없이 화면에 나온다(설계서 §7).
 */
const contentModules = import.meta.glob('./??/*.json');
const questionModules = import.meta.glob('./??/questions/*.json');

export async function loadContent(lang: Lang, processId: string): Promise<ProcessContent | null> {
  const key = `./${lang}/${processId}.json`;
  // 일본어 전문 원고가 아직 없는 공정은 한국어가 새지 않도록 영문 정본으로 안전하게 내린다.
  const loader = contentModules[key] ?? (lang === 'ja' ? contentModules[`./en/${processId}.json`] : undefined);
  if (!loader) return null;
  const mod = await loader() as { default: ProcessContent };
  return mod.default;
}

export async function loadQuestions(lang: Lang, processId: string): Promise<QuestionSet | null> {
  const key = `./${lang}/questions/${processId}.json`;
  const loader = questionModules[key] ?? (lang === 'ja' ? questionModules[`./en/questions/${processId}.json`] : undefined);
  if (!loader) return null;
  const mod = await loader() as { default: QuestionSet };
  return mod.default;
}

/** 장비 라벨은 public/ 에 있다 — DSN 이 코드 저장소를 건드리지 않고 넣을 수 있게. */
export async function loadLabels(processId: string): Promise<EquipmentLabelFile | null> {
  const base = import.meta.env?.BASE_URL ?? '/';
  try {
    const res = await fetch(`${base}assets/equipment/${processId}/labels.json`);
    if (!res.ok) return null;
    return await res.json() as EquipmentLabelFile;
  } catch { return null; }
}
