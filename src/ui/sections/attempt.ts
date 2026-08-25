import type { QuestionSet } from '@/content/types';
import { gradeItem, type Submitted } from '@/models/grading';
import { RESULT_SCHEMA_VERSION, type ResultItem, type ResultPayload, type WeakDiagnosisRow } from '@/result/schema';
import { LocalResultSink, submitResult, storedResults } from '@/result/sink';
import { trackOf } from '@/content/catalog';

/** UI 가 모으는 응답. 채점은 `@/models/grading` 이 한다(계층 분리). */
export type Answer = Submitted;

const APP_VERSION = (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? 'dev';

export function buildPayload(
  processId: string,
  set: QuestionSet,
  answers: Record<string, Answer>,
  elapsedTotalMs: number,
): ResultPayload {
  const perItem = set.items.length > 0 ? Math.round(elapsedTotalMs / set.items.length) : 0;
  const items: ResultItem[] = set.items.map((q) => ({
    questionId: q.id,
    objectiveId: q.objectiveId,
    weakTopic: q.weakTopic,
    difficulty: q.difficulty,
    correct: gradeItem(q, answers[q.id]),
    selected: toSelected(answers[q.id]),
    elapsedMs: perItem,
  }));

  const byTopic = new Map<string, WeakDiagnosisRow>();
  for (const it of items) {
    const row = byTopic.get(it.weakTopic) ?? { weakTopic: it.weakTopic, wrong: 0, total: 0, objectiveIds: [] };
    row.total += 1;
    if (!it.correct) row.wrong += 1;
    if (!row.objectiveIds.includes(it.objectiveId)) row.objectiveIds.push(it.objectiveId);
    byTopic.set(it.weakTopic, row);
  }

  const correct = items.filter((i) => i.correct).length;
  const attemptNo = storedResults().filter((r) => r.processId === processId).length + 1;

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    submittedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    trackId: trackOf(processId)?.id ?? '',
    processId,
    attemptNo,
    score: { correct, total: items.length, percent: items.length === 0 ? 0 : Math.round((correct / items.length) * 100) },
    items,
    weakDiagnosis: [...byTopic.values()].sort((a, b) => (b.wrong / b.total) - (a.wrong / a.total)),
    client: { locale: navigator.language, viewport: [window.innerWidth, window.innerHeight] },
  };
}

function toSelected(a: Answer | undefined): ResultItem['selected'] {
  if (!a) return null;
  if (a.kind === 'numeric') return { value: a.value, unit: a.unit ?? '' };
  if (a.kind === 'numeric-multi') return a.values.map((v) => ({ value: v.value, unit: v.unit ?? '' }));
  if (a.kind === 'short') return a.value;
  return a.value;
}

export function saveAttempt(
  processId: string,
  set: QuestionSet,
  answers: Record<string, Answer>,
  elapsedTotalMs: number,
): ResultPayload {
  const payload = buildPayload(processId, set, answers, elapsedTotalMs);
  // 🔴 화면 렌더를 막지 않는다. 실패해도 예외를 던지지 않는다(설계서 §12-3).
  void submitResult(payload, [new LocalResultSink()]);
  return payload;
}
