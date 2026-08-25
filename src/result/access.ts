import type { ResultPayload } from './schema';

/**
 * 🔴 D-038 — 시트 소유가 CJH그룹 계정으로 확정돼 **우리가 개인정보 보관자**가 됐다.
 * 그래서 다음 세 가지를 코드 경계로 강제한다.
 *
 *  ① **목적 구분** — 「성적 관리용(assessment)」과 「제품 개선용(improvement)」을 뭉치지 않는다.
 *     목적 범위를 벗어난 이용은 형사 사안이다(개인정보 보호법 제71조 2호).
 *  ② **개인 단위 접근과 집계 접근을 분리** — 내부 분석은 집계 경로만 쓴다.
 *  ③ **열람·정정삭제·처리정지 대응** — 특정 가명 ID 의 레코드를 찾아서 지울 수 있어야 한다.
 *
 * 🔴 대외 홍보 통계(등급 C)는 기관 개별 동의 없이 금지다. **그 경로를 여기에 만들지 않았다.**
 */

export type Purpose = 'assessment' | 'improvement';

/** 성적 관리용 뷰 — 개인(가명 ID) 단위. 기관에 돌려주는 것이 목적이다. */
export interface AssessmentRecord {
  pseudonymId?: string;
  submittedAt: string;
  trackId: string;
  processId: string;
  attemptNo: number;
  score: ResultPayload['score'];
  items: ResultPayload['items'];
  weakDiagnosis: ResultPayload['weakDiagnosis'];
}

/**
 * 제품 개선용 뷰 — **가명 ID 가 제거된 집계 원자료**.
 * 문항 난이도 조정에 필요한 것은 「누가」가 아니라 「어느 문항이 얼마나 틀렸는가」다.
 */
export interface ImprovementRecord {
  appVersion: string;
  trackId: string;
  processId: string;
  questionId: string;
  objectiveId: string;
  weakTopic: string;
  difficulty: string;
  correct: boolean;
  elapsedMs: number;
}

export function toAssessment(p: ResultPayload): AssessmentRecord {
  const r: AssessmentRecord = {
    submittedAt: p.submittedAt,
    trackId: p.trackId,
    processId: p.processId,
    attemptNo: p.attemptNo,
    score: p.score,
    items: p.items,
    weakDiagnosis: p.weakDiagnosis,
  };
  if (p.pseudonymId !== undefined) r.pseudonymId = p.pseudonymId;
  return r;
}

/** 🔴 가명 ID 를 **구조적으로** 떨어뜨린다. 실수로 흘러 들어갈 자리가 없다. */
export function toImprovement(p: ResultPayload): ImprovementRecord[] {
  return p.items.map((it) => ({
    appVersion: p.appVersion,
    trackId: p.trackId,
    processId: p.processId,
    questionId: it.questionId,
    objectiveId: it.objectiveId,
    weakTopic: it.weakTopic,
    difficulty: it.difficulty,
    correct: it.correct,
    elapsedMs: it.elapsedMs,
  }));
}

export interface ItemStat {
  questionId: string;
  attempts: number;
  correct: number;
  correctRate: number;
}

/**
 * 집계 접근 — 문항 난이도 조정용. **개인 단위 레코드를 반환하지 않는다.**
 * `minAttempts` 미만인 문항은 집계에서 제외한다(소수 표본으로 개인이 특정되는 것을 막는다).
 */
export function aggregateItemStats(rows: ImprovementRecord[], minAttempts = 5): ItemStat[] {
  const byQ = new Map<string, { attempts: number; correct: number }>();
  for (const r of rows) {
    const cur = byQ.get(r.questionId) ?? { attempts: 0, correct: 0 };
    cur.attempts += 1;
    if (r.correct) cur.correct += 1;
    byQ.set(r.questionId, cur);
  }
  return [...byQ.entries()]
    .filter(([, v]) => v.attempts >= minAttempts)
    .map(([questionId, v]) => ({
      questionId,
      attempts: v.attempts,
      correct: v.correct,
      correctRate: v.correct / v.attempts,
    }))
    .sort((a, b) => a.correctRate - b.correctRate);
}
