import type { ResultPayload } from './schema';
// 🔴 키 정본은 `keys.ts` 한 곳뿐이다. 여기서 다시 선언하지 않는다 —
//    저장 쪽만 키를 올리면 파기기가 못 찾아 조용한 파기 실패가 된다.
import { RESULT_QUEUE_KEY, RESULT_STORE_KEY } from './keys';

/**
 * 결과 제출 경계 — 설계서 §12-3.
 * 1단계에서는 로컬 구현체만 붙인다. 원격(Apps Script) 구현체는 CEO 승인 후.
 * 🔴 전송 실패·오프라인에서도 학습이 멈추지 않는다. 전송은 부가 기능이고 학습이 본체다.
 */
export interface SubmitOutcome { ok: boolean; detail?: string }

export interface ResultSink {
  readonly id: string;
  submit(payload: ResultPayload): Promise<SubmitOutcome>;
}

function readAll(key: string): ResultPayload[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResultPayload[]) : [];
  } catch { return []; }
}

function writeAll(key: string, rows: ResultPayload[]): boolean {
  try { localStorage.setItem(key, JSON.stringify(rows)); return true; }
  catch { return false; }
}

export class LocalResultSink implements ResultSink {
  readonly id = 'local';
  async submit(payload: ResultPayload): Promise<SubmitOutcome> {
    const rows = readAll(RESULT_STORE_KEY);
    rows.push(payload);
    const ok = writeAll(RESULT_STORE_KEY, rows);
    return ok ? { ok: true } : { ok: false, detail: 'localStorage 쓰기 실패(용량 초과 또는 차단)' };
  }
}

export function storedResults(): ResultPayload[] { return readAll(RESULT_STORE_KEY); }
export function queuedResults(): ResultPayload[] { return readAll(RESULT_QUEUE_KEY); }
export function enqueue(payload: ResultPayload): void {
  const q = readAll(RESULT_QUEUE_KEY); q.push(payload); writeAll(RESULT_QUEUE_KEY, q);
}
export function clearQueue(): void { writeAll(RESULT_QUEUE_KEY, []); }

/** 교사가 시트에 붙여넣을 수 있는 CSV. 시트 연동 승인 전까지의 실질 대안이다. */
export function toCsv(rows: ResultPayload[]): string {
  const head = [
    'submittedAt','appVersion','pseudonymId','trackId','processId','attemptNo',
    'correct','total','percent','questionId','objectiveId','weakTopic','difficulty','itemCorrect','elapsedMs',
  ];
  const esc = (v: string | number | boolean): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(',')];
  for (const r of rows) {
    for (const it of r.items) {
      lines.push([
        r.submittedAt, r.appVersion, r.pseudonymId ?? '', r.trackId, r.processId, r.attemptNo,
        r.score.correct, r.score.total, r.score.percent,
        it.questionId, it.objectiveId, it.weakTopic, it.difficulty, it.correct, it.elapsedMs,
      ].map(esc).join(','));
    }
  }
  return lines.join('\n');
}

/**
 * 여러 싱크에 뿌린다. 싱크가 0개여도 앱은 정상 동작한다.
 * 어떤 싱크가 실패해도 예외를 던지지 않는다 — 화면을 막지 않기 위해서다.
 */
export async function submitResult(
  payload: ResultPayload,
  sinks: ResultSink[],
): Promise<Record<string, SubmitOutcome>> {
  const out: Record<string, SubmitOutcome> = {};
  await Promise.all(sinks.map(async (s) => {
    try { out[s.id] = await s.submit(payload); }
    catch (e) { out[s.id] = { ok: false, detail: e instanceof Error ? e.message : String(e) }; }
  }));
  return out;
}
