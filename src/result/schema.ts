import type { Difficulty } from '@/content/types';

/**
 * 평가 결과 payload — 설계서 §12-2 · §12-4.
 * 🔴 개인 식별은 **교육기관 발급 가명 ID 하나**뿐이다(CEO 확정 2026-08-20 · README §3-6).
 *    이름·학번·소속·이메일 필드는 이 스키마에 존재하지 않는다.
 */
/**
 * payload 모양의 판. **레코드마다 `schemaVersion` 으로 찍힌다.**
 *
 * 🔴 **`keys.ts` 의 저장소 키 접미사 `v1` 과는 무관하다 — 우연히 같은 수다.**
 *    연동하지 않는 이유:
 *     ① 레코드마다 버전이 박혀 있으므로 한 저장소에 여러 버전이 섞여도 읽고 옮길 수 있다.
 *        저장소를 버전별로 쪼갤 이유가 없다.
 *     ② 🔴 키를 스키마 버전에서 파생시키면 **스키마를 올리는 순간 옛 키의 개인정보가
 *        파기 순회의 시야에서 사라진다.** 그것이 지금 막고 있는 조용한 파기 실패다
 *        (D-038 · LEG `11_파기절차.md` 5일 내 파기 의무).
 *    ➡️ 이 수를 올릴 때 **저장소 키는 건드리지 않는다.** 반대도 같다.
 */
export const RESULT_SCHEMA_VERSION = 1 as const;

export interface ResultItem {
  questionId: string;
  objectiveId: string;
  weakTopic: string;
  difficulty: Difficulty;
  correct: boolean;
  /** 🔴 다항 계산형(`(a)(b)(c)`)은 배열 — CEO 지시 2026-08-24 3차, packaging-q08. */
  selected: number | string | { value: number; unit: string } | { value: number; unit: string }[] | null;
  elapsedMs: number;
}

export interface WeakDiagnosisRow {
  weakTopic: string;
  wrong: number;
  total: number;
  objectiveIds: string[];
}

export interface ResultPayload {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  submittedAt: string;
  appVersion: string;
  trackId: string;
  processId: string;
  attemptNo: number;
  score: { correct: number; total: number; percent: number };
  items: ResultItem[];
  weakDiagnosis: WeakDiagnosisRow[];
  /** 🔴 교육기관 발급 가명 ID. 미설정이면 아예 넣지 않는다. */
  pseudonymId?: string;
  client?: { locale: string; viewport: [number, number] };
}
