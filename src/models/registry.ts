import raw from '@/content/model-grades.json';
import { __setGradeResolver, type Grade, type GradeVerdict, type ModelKind } from './contract';
import { L2_VERIFIED } from '@/config/verification';

/**
 * 모델 ID → 등급 원장. 함수 본문에 등급·공정 ID 리터럴을 쓰지 않는다(설계서 §11 C1).
 * 🔴 원장 정본은 **데이터**다 — `src/content/model-grades.json`. 이 파일은 접근자다.
 *
 * 🔴 A6 / A6-b — README §3-8 (오케스트레이터 판정 2026-08-20)
 *  - A6   : 물리 계산식·합격판정 기준값 → S번호 필수. 예외 없음.
 *  - A6-b : 교육용 합성 계수 → 원장 등재 + 배지 + 「실제 장비 상수 아님」 고지. **셋 다.**
 *
 * 🔴 2026-08-20 반려① 로 고친 것 — 다시 비우지 마라.
 *   종전에는 `declared` 가 **완전히 비어 있었다.** 그 결과 문헌식 Rayleigh(S140)도 Deal-Grove 도
 *   합성 스루풋 지수도 **전부 똑같이 `[경향모델]`** 을 달았다. 배지가 아무것도 가르지 못했고
 *   `SYNTHETIC_NOTICE` 는 코드상 도달 불가였으며 `auditRegistry()` 는 공허하게 통과했다.
 *   「L2 미통과라 강등」과 「등급이 없어 강등」은 다르다. 전자는 고지, 후자는 결함이다.
 */

/** 교육용 합성 계수의 표준 고지 문구. 개별 사유가 있으면 그쪽을 쓴다. */
export const SYNTHETIC_NOTICE = '실제 장비 상수가 아닙니다. 학습용으로 조정된 값입니다.';

/** L2 미통과 기간의 표준 고지 문구. 화면은 이것을 `l2Pending` 을 보고 별도 줄로 낸다. */
export const PRE_L2_NOTICE = '현업 검증(L2) 전입니다. 값의 크기를 실측값으로 신뢰하지 마십시오.';

export interface Entry {
  /** 원장 등재 등급. L2 를 통과하면 화면 등급이 된다. */
  declaredGrade: Grade;
  /** 🔴 기계 검사 필드. 게이트는 고지 문장이 아니라 이것으로 합성 여부를 판정한다. */
  kind: ModelKind;
  /** `kind: 'synthetic'` 이면 필수 — 무엇을 조절한 합성값인지. */
  notice?: string;
}

const declared: Record<string, Entry> = (raw as { models: Record<string, Entry> }).models;

/**
 * 🔴 L2(현업 검증) 미통과 기간의 표시 정책 — **여기 한 곳에서만 정한다.**
 *
 * D-011 원문은 「2차 검증을 통과하지 못한 항목에 `[검증식]` 배지를 붙이지 않는다」이고,
 * 이어서 「전부 `[경향모델]`로 표시한다」고 적혀 있다. 후자를 문자 그대로 적용하면
 * **문헌식과 합성값이 화면에서 구분되지 않아** A6-b 의 목적(학습자가 교육용 값과 문헌값을 구분)이 0 이 된다.
 *
 * 그래서 이 구현은 **`검증식` → `문헌식` 강등만** 적용하고, 원장이 `문헌식` 인 항목은
 * `문헌식` 으로 표시하되 **「현업 검증(L2) 전」 고지를 상시 동반**한다.
 * `문헌식` 은 「문헌에 있는 식」이라는 사실 주장이지 「검증됨」 주장이 아니므로 과대주장이 아니다.
 *
 * 🔴 이 판단은 D-011 원문 문구와 어긋날 수 있어 **오케스트레이터 판정 요청 대상**이다.
 *    「전부 경향모델」로 되돌리려면 아래 함수 한 곳만 고치면 된다. 호출부를 흩지 마라.
 */
function demote(declaredGrade: Grade): Grade {
  if (L2_VERIFIED) return declaredGrade;
  return declaredGrade === '검증식' ? '문헌식' : declaredGrade;
}

export function gradeOf(modelId: string): GradeVerdict {
  const entry = declared[modelId];

  // 🔴 미등록 모델 — 조용히 경향모델로 흘려보내지 않는다. 안전한 최하위로 떨어뜨리되
  //    `check-grades` 게이트가 CI 에서 이 상태를 **실패**로 잡는다.
  if (!entry) {
    return {
      grade: '경향모델', declaredGrade: '경향모델', kind: 'synthetic', l2Pending: !L2_VERIFIED,
      notice: `${SYNTHETIC_NOTICE} (등급 미등재 모델: ${modelId})`,
    };
  }

  const grade = demote(entry.declaredGrade);
  const l2Pending = !L2_VERIFIED;

  // 🔴 고지는 **두 줄로 나눠 흐른다.**
  //    `notice`  = 이 모델 고유의 고지(합성 사유·운영규약·출처 등급 한정 등). 원장이 정한다.
  //    L2 고지   = 화면이 `l2Pending` 을 보고 스스로 붙인다. 두 줄을 합치면 DOM 게이트가 어느 쪽이
  //                빠졌는지 구분하지 못한다 — 그래서 합치지 않는다.
  const verdict: GradeVerdict = { grade, declaredGrade: entry.declaredGrade, kind: entry.kind, l2Pending };
  const notice = entry.notice ?? (entry.kind === 'synthetic' ? SYNTHETIC_NOTICE : undefined);
  if (notice) verdict.notice = notice;
  return verdict;
}

__setGradeResolver(gradeOf);

export function registeredModelIds(): string[] {
  return Object.keys(declared);
}

export function entryOf(modelId: string): Entry | undefined {
  return declared[modelId];
}

/**
 * 등록 무결성 자체 점검 — `kind: 'synthetic'` 인데 notice 가 없는 항목을 찾는다.
 * 🔴 종전에는 `declared` 가 비어 **공허하게 통과**했다. 이제 `check-grades` 가
 *    미등재 modelId 까지 함께 잡으므로 이 함수만으로 충분하다고 여기지 마라.
 */
export function auditRegistry(): string[] {
  return Object.entries(declared)
    .filter(([, e]) => e.kind !== 'literature' && !e.notice)
    .map(([id]) => id);
}
