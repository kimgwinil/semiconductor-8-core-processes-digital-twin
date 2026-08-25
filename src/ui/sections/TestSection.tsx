import { useEffect, useState } from 'react';
import type { QuestionSet } from '@/content/types';
import { loadQuestions } from '@/content/loader';
import { getLang, t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { EmptySlot } from '@/ui/widgets/EmptySlot';
import { saveAttempt, type Answer } from '@/ui/sections/attempt';
import { isDimensionless, isNumericAnswer, isNumericMultiAnswer } from '@/models/grading';
import type { QuestionItem } from '@/content/types';
import { hrefFor } from '@/lib/router';
import { mark } from '@/lib/progress';

/**
 * 🔴 출처·등급 표기 제거 — CEO 지시 2026-08-23·08-24. **표시만 끈다. 원문 데이터는 보존.**
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}


/**
 * A2 — 공정당 10문항.
 * 규정 §4-2: **선택 즉시 정답을 노출하지 않는다.** 전 문항 완료 후 「최종 제출」로만 채점한다.
 */
/** 계산형의 단위 문자열. 무차원이면 빈 문자열. */
function unitOf(q: QuestionItem): string {
  return isNumericAnswer(q.answer) ? (q.answer.unit ?? '') : '';
}

/**
 * 🔴 다항 계산형(`(a)(b)(c)`)의 한 항목 값을 갱신한다. **다른 항목은 건드리지 않는다.**
 * 아직 아무것도 안 낸 항목이 있으면 `NaN` 으로 둔다 — 채점(`gradeNumericMulti`)이
 * `Number.isFinite` 로 걸러내므로 「비었다」가 「0이다」로 둔갑하지 않는다.
 */
function setNumericMultiPart(
  a: Record<string, Answer>,
  q: QuestionItem,
  partsLen: number,
  idx: number,
  value: number,
  unit: string | null,
): Record<string, Answer> {
  const prev = a[q.id];
  const values = prev?.kind === 'numeric-multi'
    ? [...prev.values]
    : Array.from({ length: partsLen }, () => ({ value: Number.NaN, unit: null as string | null }));
  values[idx] = { value, unit };
  return { ...a, [q.id]: { kind: 'numeric-multi', values } };
}

export function TestSection({ processId }: { processId: string }): React.ReactElement {
  const lang = getLang();
  const [set, setSet] = useState<QuestionSet | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [startedAt] = useState(() => Date.now());
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let alive = true;
    setSet(undefined);
    void loadQuestions(lang, processId).then((q) => { if (alive) setSet(q); });
    return () => { alive = false; };
  }, [lang, processId]);

  if (set === undefined) return <div className="loading">{t('app.loading')}</div>;
  if (set === null || set.items.length === 0) return <EmptySlot processId={processId} sectionId="test" owner="PLN" />;

  /* 🔴 다항 계산형은 항목 전부가 유한값이어야 「응답함」이다 — 하나만 채우고 나머지를
        비워도 제출 가능하게 두면 그 학습자는 나머지를 못 낸 채 채점된다. */
  function isAnswered(q: QuestionItem): boolean {
    const a = answers[q.id];
    if (a === undefined) return false;
    if (a.kind === 'numeric-multi') return a.values.every((v) => Number.isFinite(v.value));
    return true;
  }
  const answered = set.items.filter(isAnswered).length;
  const complete = answered === set.items.length;

  function submit(): void {
    if (!set || !complete) return;
    saveAttempt(processId, set, answers, Date.now() - startedAt);
    mark(processId, 'test', 'done');
    setSubmitted(true);
    location.hash = hrefFor({ kind: 'section', processId, sectionId: 'result' });
  }

  return (
    <div className="test">
      <p className="test__meta">{t('test.progress', { answered, total: set.items.length })}</p>
      <ol className="test__list">
        {set.items.map((q, i) => (
          <li className="q" key={q.id}>
            <p className="q__stem"><span className="q__no">{i + 1}</span> {say(q.stem)}</p>
            {q.type === 'numeric' && isNumericAnswer(q.answer) && (
              <label className="q__numeric">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  aria-label={t('test.valueLabel')}
                  onChange={(e) => setAnswers((a) => ({
                    ...a,
                    [q.id]: { kind: 'numeric', value: Number(e.target.value), unit: unitOf(q) },
                  }))}
                />
                {/* 🔴 무차원(unit: null) 문항은 단위 입력란을 아예 만들지 않는다 — PLN 테스트 T-6 */}
                {isDimensionless(q)
                  ? <span className="q__unit q__unit--none">{t('test.dimensionless')}</span>
                  : <span className="q__unit">{unitOf(q)}</span>}
              </label>
            )}

            {/* 🔴 다항 계산형 — 원장이 `(a)(b)(c)` 처럼 여러 값을 요구하는 문항.
                   CEO 지시 2026-08-24 3차: 「채점은 문제 문항수에 따라 다 하는 것이 기준」.
                   부분마다 입력란을 따로 낸다 — 하나로 뭉쳐 받으면 서식·구분자를 학습자가
                   맞혀야 하는 별개의 문제가 생긴다. */}
            {/* 🔴 스타일은 인라인이다 — `src/ui/styles/index.css`는 이 작업의 편집 범위 밖이다
                   (2026-08-24 실제 사고 기록 참조, `.q__numeric` 클래스로 기본 여백·테두리는
                   그대로 물려받는다). */}
            {q.type === 'numeric' && isNumericMultiAnswer(q.answer) && (
              <div className="q__numericMulti" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.answer.parts.map((part, idx) => (
                  <label className="q__numeric q__numericPart" key={part.label}>
                    <span className="q__partLabel" style={{ fontWeight: 600, marginInlineEnd: 4 }}>({part.label})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      aria-label={t('test.valueLabelPart', { label: part.label })}
                      onChange={(e) => setAnswers((a) => setNumericMultiPart(
                        a, q, (isNumericMultiAnswer(q.answer) ? q.answer.parts.length : 0),
                        idx, Number(e.target.value), part.unit,
                      ))}
                    />
                    {part.unit === null
                      ? <span className="q__unit q__unit--none">{t('test.dimensionless')}</span>
                      : <span className="q__unit">{part.unit}</span>}
                  </label>
                ))}
              </div>
            )}

            {q.type === 'short' && (
              <label className="q__short">
                <input
                  type="text"
                  autoComplete="off"
                  aria-label={t('test.shortLabel')}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { kind: 'short', value: e.target.value } }))}
                />
              </label>
            )}

            {q.type === 'single' && (
              <ul className="q__choices">
                {(q.choices ?? []).map((c, ci) => (
                  <li key={ci}>
                    <label>
                      <input
                        type="radio"
                        name={q.id}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: { kind: 'single', value: ci } }))}
                      />
                      <span>{c}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {/* 🔴 선택 즉시 정답·해설을 노출하지 않는다 */}
          </li>
        ))}
      </ol>
      <button className="btn btn--primary" type="button" disabled={!complete || submitted} onClick={submit}>
        {t('test.submit')}
      </button>
      {!complete && <p className="test__hint">{t('test.incomplete')}</p>}
    </div>
  );
}
