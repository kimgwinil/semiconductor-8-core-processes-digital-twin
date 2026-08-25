/**
 * 가명 ID 검증 — 설계서 §12-4 · §17.
 *
 * 🔴 **D-038 이후 이것은 법적 의무 쪽이다.** 시트 소유가 CJH그룹 계정으로 확정돼
 *    우리가 개인정보 보관자가 됐다. 실명이 유입되면 우리 시트에 실명이 쌓인다.
 *
 * 설계 원칙:
 *  1. **화이트리스트만.** 허용 문자 집합을 정하고 그 밖은 전부 거부한다. 블랙리스트는 뚫린다.
 *  2. **한글은 문자 집합에서 아예 제외한다.** 「순수 한글 2~4자만 거부」같은 부분 차단이 아니다.
 *  3. **형식 위반은 전송 자체를 막는다.** 경고만 띄우고 보내지 않는다.
 *
 * 남는 한계: 규칙에 맞는 문자열 안의 실명(`honggildong01`)은 형식으로 막을 수 없다.
 *            완전 차단은 기관 사전 등록 목록(allowList)뿐이며, 그 밖은 LEG 파기 절차와 물린다.
 */
export type PseudonymFormat = 'alnum' | 'class-number';

export const PSEUDONYM_PATTERNS: Record<PseudonymFormat, RegExp> = {
  // 🔴 화이트리스트: 영문·숫자·하이픈·밑줄만. 한글·공백·기호는 문자 집합에 없다.
  alnum: /^[A-Za-z0-9][A-Za-z0-9_-]{1,15}$/,
  // 반-번호 형태도 **한글을 쓰지 않는다** (예: A-03, C2-12). 「A반-03」은 거부된다.
  'class-number': /^[A-Za-z0-9]{1,4}-\d{1,3}$/,
};

/** 🔴 한글이 한 글자라도 있으면 거부한다. 이름의 부분 유입을 막는 1차 방어선이다. */
const HAS_HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

export const PSEUDONYM_MAX_LEN = 16;

export interface PseudonymPolicy {
  format: PseudonymFormat;
  /** 기관 사전 등록 목록. 비어 있지 않으면 이 목록 밖의 값은 전부 거부한다(가장 확실한 차단). */
  allowList?: string[];
}

export type PseudonymRejection =
  | 'empty' | 'too-long' | 'format' | 'contains-hangul' | 'not-allowed';

export type PseudonymCheck =
  | { ok: true; value: string }
  | { ok: false; reason: PseudonymRejection };

export function checkPseudonym(input: string, policy: PseudonymPolicy): PseudonymCheck {
  const v = input.trim();
  if (v.length === 0) return { ok: false, reason: 'empty' };
  if (v.length > PSEUDONYM_MAX_LEN) return { ok: false, reason: 'too-long' };
  // 🔴 한글 포함이면 사전 등록 목록보다 먼저 막는다 — 목록 자체에 실명이 들어와도 통과시키지 않는다.
  if (HAS_HANGUL.test(v)) return { ok: false, reason: 'contains-hangul' };

  const list = policy.allowList;
  if (list && list.length > 0) {
    return list.includes(v) ? { ok: true, value: v } : { ok: false, reason: 'not-allowed' };
  }
  const pattern = PSEUDONYM_PATTERNS[policy.format];
  if (!pattern.test(v)) return { ok: false, reason: 'format' };
  return { ok: true, value: v };
}

/**
 * 🔴 전송 가드 — 형식 위반이면 **전송 자체를 막는다.**
 * `submitResult` 호출 전에 반드시 통과해야 한다(경고만 띄우고 보내지 않는다).
 */
export function assertSubmittable(input: string | undefined, policy: PseudonymPolicy): string | undefined {
  if (input === undefined || input === '') return undefined; // 익명 제출은 허용된다
  const r = checkPseudonym(input, policy);
  if (!r.ok) {
    throw new PseudonymRejectedError(r.reason);
  }
  return r.value;
}

export class PseudonymRejectedError extends Error {
  constructor(readonly reason: PseudonymRejection) {
    super(`pseudonym rejected: ${reason}`);
    this.name = 'PseudonymRejectedError';
  }
}
