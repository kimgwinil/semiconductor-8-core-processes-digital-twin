import { useEffect, useState } from 'react';
import type { DistractorNote, QuestionItem, QuestionSet } from '@/content/types';
import { loadQuestions } from '@/content/loader';
import { getLang, t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { storedResults, toCsv } from '@/result/sink';
import type { ResultItem, ResultPayload } from '@/result/schema';
import { hrefFor } from '@/lib/router';
import { EmptySlot } from '@/ui/widgets/EmptySlot';
import { SourceBadge } from '@/ui/widgets/SourceBadge';
import { isNumericAnswer, isNumericMultiAnswer, isShortAnswer } from '@/models/grading';

/**
 * 🔴 출처·등급 표기 제거 — CEO 지시 2026-08-23·08-24. **표시만 끈다. 원문 데이터는 보존.**
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}


/** 학습자가 실제로 낸 답 — 화면에 보이는 문자열로. 무응답은 null. */
function selectedText(q: QuestionItem, sel: ResultItem['selected']): string | null {
  if (sel === null || sel === undefined) return null;
  if (typeof sel === 'number') return q.choices?.[sel] ?? String(sel);
  if (typeof sel === 'string') return sel;
  // 🔴 다항 계산형(`(a)(b)(c)`) — 배열이면 각 항목을 원장과 같은 순서로 이어 붙인다.
  if (Array.isArray(sel)) {
    const labels = isNumericMultiAnswer(q.answer) ? q.answer.parts.map((p) => p.label) : [];
    return sel.map((v, i) => {
      const label = labels[i];
      const text = v.unit ? `${v.value} ${v.unit}` : String(v.value);
      return label ? `(${label}) ${text}` : text;
    }).join(' · ');
  }
  return sel.unit ? `${sel.value} ${sel.unit}` : String(sel.value);
}

/** 정답 — 유형별로 사람이 읽는 형태로. 원장 값을 그대로 쓴다. */
function correctText(q: QuestionItem): string {
  if (isNumericAnswer(q.answer)) {
    return q.answer.unit ? `${q.answer.value} ${q.answer.unit}` : String(q.answer.value);
  }
  if (isNumericMultiAnswer(q.answer)) {
    return q.answer.parts
      .map((p) => `(${p.label}) ${p.unit ? `${p.value} ${p.unit}` : p.value}`)
      .join(' · ');
  }
  if (isShortAnswer(q.answer)) return q.answer.accept[0] ?? '';
  return q.choices?.[q.answer] ?? String(q.answer);
}

/**
 * 학습자가 고른 보기에 대응하는 오답 사유를 맨 앞으로 올린다.
 * 🔴 목록 전체를 보여 주되 **내가 고른 것을 먼저** 보여 준다 — 오답 복기의 출발점이 그것이라서다.
 */
function orderedDistractors(q: QuestionItem, sel: ResultItem['selected']): DistractorNote[] {
  const list = q.distractors ?? [];
  if (typeof sel !== 'number') return list;
  const mine = list.filter((d) => d.choiceIndex === sel);
  if (mine.length === 0) return list;
  return [...mine, ...list.filter((d) => d.choiceIndex !== sel)];
}

/**
 * A3 — 점수 + 문항별 정오·해설 + 약점 진단.
 * 데이터는 전부 로컬(LocalResultSink)에서 온다. 원격 전송은 CEO 승인 게이트라 1단계에 없다.
 */
export function ResultSection({ processId }: { processId: string }): React.ReactElement {
  const lang = getLang();
  const [set, setSet] = useState<QuestionSet | null | undefined>(undefined);
  const [rows, setRows] = useState<ResultPayload[]>([]);

  useEffect(() => {
    setRows(storedResults().filter((r) => r.processId === processId));
    let alive = true;
    void loadQuestions(lang, processId).then((q) => { if (alive) setSet(q); });
    return () => { alive = false; };
  }, [lang, processId]);

  const latest = rows[rows.length - 1];
  if (!latest) {
    return (
      <div className="result">
        <p className="result__none">{t('result.none')}</p>
        <a className="btn" href={hrefFor({ kind: 'section', processId, sectionId: 'test' })}>{t('result.goTest')}</a>
      </div>
    );
  }
  if (set === undefined) return <div className="loading">{t('app.loading')}</div>;
  if (set === null) return <EmptySlot processId={processId} sectionId="result" owner="PLN" />;

  const byId = new Map(set.items.map((q) => [q.id, q]));

  function download(): void {
    const blob = new Blob([toCsv(storedResults())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cjh-results.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="result">
      <section className="result__score">
        <p className="result__big">{latest.score.percent}<span>%</span></p>
        <p className="result__sub">{t('result.score', { correct: latest.score.correct, total: latest.score.total, attempt: latest.attemptNo })}</p>
        <p className="result__storage">{t('result.localOnly')}</p>
      </section>

      <section className="result__weak">
        <h3>{t('result.weakHeading')}</h3>
        {latest.weakDiagnosis.filter((w) => w.wrong > 0).length === 0
          ? <p>{t('result.weakNone')}</p>
          : (
            <ol>
              {latest.weakDiagnosis.filter((w) => w.wrong > 0).slice(0, 3).map((w) => (
                <li key={w.weakTopic}>
                  <strong>{w.weakTopic}</strong> — {t('result.weakRow', { wrong: w.wrong, total: w.total })}
                  <span className="result__objs">{w.objectiveIds.join(', ')}</span>
                </li>
              ))}
            </ol>
          )}
      </section>

      <section className="result__items">
        <h3>{t('result.itemsHeading')}</h3>
        <ol>
          {latest.items.map((it) => {
            const q = byId.get(it.questionId);
            if (!q) {
              return (
                <li key={it.questionId} className={it.correct ? 'is-correct' : 'is-wrong'}>
                  <p className="result__mark">{it.correct ? t('result.correct') : t('result.wrong')}</p>
                  <p className="result__stem">{it.questionId}</p>
                </li>
              );
            }
            const mine = selectedText(q, it.selected);
            const notes = orderedDistractors(q, it.selected);
            return (
              <li key={it.questionId} className={it.correct ? 'is-correct' : 'is-wrong'}>
                <p className="result__mark">{it.correct ? t('result.correct') : t('result.wrong')}</p>
                <p className="result__stem">{say(q.stem)}</p>

                {/* 🔴 틀렸다고만 말하고 끝내지 않는다 — 내가 낸 답과 정답을 나란히 놓는다. */}
                {!it.correct && (
                  <dl className="result__answers">
                    <dt>{t('result.yourAnswer')}</dt>
                    <dd className="result__mine">{mine ?? t('result.noAnswer')}</dd>
                    <dt>{t('result.correctAnswer')}</dt>
                    <dd className="result__truth">{correctText(q)}</dd>
                  </dl>
                )}

                <p className="result__expl">{q.explanation}</p>

                {/* 원장의 「오답 해설」. ko 에만 있다 — en 원고가 없으면 이 절이 통째로 빠진다. */}
                {notes.length > 0 && (
                  <details className="result__why" open={!it.correct}>
                    <summary>{t('result.whyWrongHeading')}</summary>
                    <ul className="result__whyList">
                      {notes.map((d, i) => {
                        const isMine = typeof it.selected === 'number' && d.choiceIndex === it.selected;
                        const tag = d.choiceIndex !== undefined
                          ? (q.choices?.[d.choiceIndex] ?? `${d.choiceIndex + 1}`)
                          : d.label;
                        return (
                          <li key={i} className={isMine ? 'is-mine' : undefined}>
                            {tag && <strong className="result__whyTag">{tag}</strong>}
                            {isMine && <span className="result__whyMine">{t('result.youPicked')}</span>}
                            <span className="result__whyText">{d.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}

                {/* 출처는 원장이 문항마다 갖고 있다. 배지로 그대로 낸다. */}
                <p className="result__src">
                  <SourceBadge sourceId={q.sourceId} compact />
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="result__actions">
        <a className="btn" href={hrefFor({ kind: 'section', processId, sectionId: 'test' })}>{t('result.retry')}</a>
        <button className="btn" type="button" onClick={download}>{t('result.csv')}</button>
      </div>
    </div>
  );
}
