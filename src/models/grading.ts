import type { NumericAnswer, NumericMultiAnswer, QuestionItem, ShortAnswer } from '@/content/types';

/**
 * 채점 규칙 — PLN 확정 규약(`threads/PLN-8대공정-001.md` §2-5) 구현.
 * 참조 사이트는 **부분 문자열 매칭**으로 채점해 "패키징 아님" 같은 부정문도 정답 처리되는 결함이 있었다.
 * 여기서는 정규화 후 **완전 일치**만 정답으로 본다. `includes()` 를 쓰지 않는다.
 * 🔴 무차원 문항(`unit: null`)에 단위 일치 검사를 걸면 정답도 오답이 된다 — 테스트 T-6.
 */

/**
 * 정규화 순서: 앞뒤 공백 → NFKC(전각→반각) → 괄호 부기 제거 → 공백·구두점 제거 → 소문자.
 * 🔴 구두점 제거가 없으면 `C.O.P.`·`E_0` 같은 정답이 탈락한다(PLN 규약 §6-2 개정).
 * 🔴 괄호 제거를 **구두점 제거보다 먼저** 한다 — 괄호를 먼저 지우면 부기가 본문에 붙어 버린다.
 */
const PUNCT = /[\s\-–—·.,_/\\'"`~!?;:+*^]/g;

export function normalizeShort(raw: string): string {
  return raw
    .trim()
    .normalize('NFKC')
    .replace(/\(.*?\)/g, '')
    .replace(PUNCT, '')
    .toLowerCase();
}

/** 단위 정규화 — 대소문자·공백·전각을 흡수한다. 무차원은 빈 문자열로 수렴한다. */
export function normalizeUnit(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return raw.trim().replace(/\s/g, '').normalize('NFKC').toLowerCase();
}

export type Submitted =
  | { kind: 'single'; value: number }
  | { kind: 'short'; value: string }
  | { kind: 'numeric'; value: number; unit: string | null }
  | { kind: 'numeric-multi'; values: { value: number; unit: string | null }[] };

export function gradeSingle(answer: number, got: number): boolean {
  return Number.isInteger(got) && got === answer;
}

export function gradeShort(answer: ShortAnswer, got: string): boolean {
  const n = normalizeShort(got);
  if (n.length === 0) return false;
  // 🔴 완전 일치만. some(a => norm(a).includes(n)) 로 바꾸지 마라.
  return answer.accept.some((a) => normalizeShort(a) === n);
}

export function gradeNumeric(answer: NumericAnswer, got: number, gotUnit: string | null): boolean {
  if (!Number.isFinite(got)) return false;

  // 🔴 무차원(unit: null): 단위 검사를 건너뛴다.
  if (answer.unit !== null) {
    if (normalizeUnit(gotUnit) !== normalizeUnit(answer.unit)) return false;
  }

  const expected = answer.value;
  if (expected === 0) return Math.abs(got) <= answer.tolerance;
  return Math.abs(got - expected) / Math.abs(expected) <= answer.tolerance;
}

/**
 * 다항 계산형 채점 — `(a)(b)(c)` 전부. 🔴 **부분점수 없음** — 단항 문항과 같은 규약이다.
 * 하나라도 빠지거나 순서가 안 맞으면(부분 개수 불일치) 즉시 오답이다.
 */
export function gradeNumericMulti(
  answer: NumericMultiAnswer,
  got: { value: number; unit: string | null }[],
): boolean {
  if (got.length !== answer.parts.length) return false;
  return answer.parts.every((part, i) => {
    const g = got[i];
    return g !== undefined && gradeNumeric(part, g.value, g.unit);
  });
}

/** 부분점수 없음. 문항당 1점. */
export function gradeItem(q: QuestionItem, got: Submitted | undefined): boolean {
  if (got === undefined) return false;
  switch (q.type) {
    case 'single':
      return got.kind === 'single' && typeof q.answer === 'number' && gradeSingle(q.answer, got.value);
    case 'short':
      return got.kind === 'short' && isShortAnswer(q.answer) && gradeShort(q.answer, got.value);
    case 'numeric':
      if (got.kind === 'numeric' && isNumericAnswer(q.answer)) return gradeNumeric(q.answer, got.value, got.unit);
      if (got.kind === 'numeric-multi' && isNumericMultiAnswer(q.answer)) {
        return gradeNumericMulti(q.answer, got.values);
      }
      return false;
  }
}

export function isShortAnswer(a: QuestionItem['answer']): a is ShortAnswer {
  return typeof a === 'object' && a !== null && 'accept' in a;
}

export function isNumericAnswer(a: QuestionItem['answer']): a is NumericAnswer {
  return typeof a === 'object' && a !== null && 'value' in a && 'tolerance' in a;
}

export function isNumericMultiAnswer(a: QuestionItem['answer']): a is NumericMultiAnswer {
  return typeof a === 'object' && a !== null && 'parts' in a;
}

/** 무차원 문항인가 — UI 가 단위 입력란을 숨길지 결정한다. */
export function isDimensionless(q: QuestionItem): boolean {
  return q.type === 'numeric' && isNumericAnswer(q.answer) && q.answer.unit === null;
}
