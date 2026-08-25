import { describe, expect, it } from 'vitest';
import {
  assertSubmittable, checkPseudonym, PseudonymRejectedError, PSEUDONYM_MAX_LEN,
} from '@/result/pseudonym';
import { aggregateItemStats, toAssessment, toImprovement } from '@/result/access';
import { LocalEraser, STORAGE_LOCATIONS } from '@/result/erasure';
import type { ResultPayload } from '@/result/schema';

/**
 * 🔴 D-038 — 시트 소유가 CJH그룹 계정이라 우리가 개인정보 보관자다.
 * 실명 유입 차단·목적 구분·파기 경로가 법적 의무 쪽에 있다.
 */

const POLICY = { format: 'alnum' as const };

describe('실명 유입 차단 — 화이트리스트', () => {
  it('영문·숫자·하이픈·밑줄만 통과한다', () => {
    for (const ok of ['A03', 'stu-014', 'c2_11', 'Z9']) {
      expect(checkPseudonym(ok, POLICY).ok, ok).toBe(true);
    }
  });

  it('🔴 한글이 한 글자라도 있으면 거부한다', () => {
    for (const bad of ['홍길동', '홍길동01', 'A반-03', '김', 'stu-김철수']) {
      const r = checkPseudonym(bad, POLICY);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.reason).toBe('contains-hangul');
    }
  });

  it('공백·기호는 문자 집합에 없다', () => {
    for (const bad of ['A 03', 'a@b', 'a.b', 'a/b']) {
      expect(checkPseudonym(bad, POLICY).ok, bad).toBe(false);
    }
  });

  it(`길이 상한 ${PSEUDONYM_MAX_LEN}자를 넘으면 거부한다`, () => {
    const r = checkPseudonym('a'.repeat(PSEUDONYM_MAX_LEN + 1), POLICY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too-long');
  });

  it('class-number 형식도 한글을 쓰지 않는다', () => {
    const p = { format: 'class-number' as const };
    expect(checkPseudonym('A-03', p).ok).toBe(true);
    expect(checkPseudonym('A반-03', p).ok).toBe(false);
  });

  it('🔴 사전 등록 목록이 있어도 한글은 먼저 막는다', () => {
    const r = checkPseudonym('홍길동', { format: 'alnum', allowList: ['홍길동'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('contains-hangul');
  });

  it('사전 등록 목록 밖은 거부한다 (완전 차단 경로)', () => {
    const r = checkPseudonym('A99', { format: 'alnum', allowList: ['A01', 'A02'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-allowed');
  });
});

describe('🔴 형식 위반은 전송 자체를 막는다 (경고만 띄우지 않는다)', () => {
  it('위반이면 던진다', () => {
    expect(() => assertSubmittable('홍길동', POLICY)).toThrow(PseudonymRejectedError);
    expect(() => assertSubmittable('a b', POLICY)).toThrow(PseudonymRejectedError);
  });
  it('통과하면 정규화된 값을 돌려준다', () => {
    expect(assertSubmittable('  A03  ', POLICY)).toBe('A03');
  });
  it('익명 제출(미입력)은 허용된다', () => {
    expect(assertSubmittable(undefined, POLICY)).toBeUndefined();
    expect(assertSubmittable('', POLICY)).toBeUndefined();
  });
});

function payload(pseudonymId?: string): ResultPayload {
  const p: ResultPayload = {
    schemaVersion: 1, submittedAt: '2026-08-20T00:00:00.000Z', appVersion: 'test',
    trackId: 'fe', processId: 'oxidation', attemptNo: 1,
    score: { correct: 1, total: 2, percent: 50 },
    items: [
      { questionId: 'oxidation-q01', objectiveId: 'LO-P2-01', weakTopic: 'dg', difficulty: 'low', correct: true, selected: 0, elapsedMs: 1000 },
      { questionId: 'oxidation-q02', objectiveId: 'LO-P2-01', weakTopic: 'dg', difficulty: 'mid', correct: false, selected: 1, elapsedMs: 2000 },
    ],
    weakDiagnosis: [{ weakTopic: 'dg', wrong: 1, total: 2, objectiveIds: ['LO-P2-01'] }],
  };
  if (pseudonymId) p.pseudonymId = pseudonymId;
  return p;
}

describe('🔴 목적 구분 — 성적 관리용과 제품 개선용을 뭉치지 않는다', () => {
  it('성적 관리용 뷰는 가명 ID 를 유지한다', () => {
    expect(toAssessment(payload('A03')).pseudonymId).toBe('A03');
  });
  it('🔴 제품 개선용 뷰에는 가명 ID 필드가 아예 없다', () => {
    const rows = toImprovement(payload('A03'));
    for (const r of rows) {
      expect('pseudonymId' in r).toBe(false);
      expect(JSON.stringify(r).includes('A03')).toBe(false);
    }
  });
  it('제품 개선용 뷰는 문항 단위로 펼쳐진다', () => {
    expect(toImprovement(payload('A03')).length).toBe(2);
  });
});

describe('🔴 집계 접근은 개인 단위 레코드를 반환하지 않는다', () => {
  const rows = [
    ...toImprovement(payload('A01')), ...toImprovement(payload('A02')),
    ...toImprovement(payload('A03')), ...toImprovement(payload('A04')),
    ...toImprovement(payload('A05')),
  ];
  it('문항별 정답률만 나온다', () => {
    const stats = aggregateItemStats(rows);
    expect(stats.every((s) => !('pseudonymId' in s))).toBe(true);
    expect(stats.find((s) => s.questionId === 'oxidation-q02')?.correctRate).toBe(0);
  });
  it('표본이 적은 문항은 집계에서 제외한다 (개인 특정 방지)', () => {
    expect(aggregateItemStats(toImprovement(payload('A01')), 5)).toEqual([]);
  });
});

describe('🔴 파기·열람 경로 (D-038 · 5일 내 파기 의무)', () => {
  it('저장 위치 원장이 비어 있지 않다 — 어디를 지워야 하는지 알 수 있다', () => {
    expect(STORAGE_LOCATIONS.length).toBeGreaterThan(0);
    for (const l of STORAGE_LOCATIONS) expect(l.desc.length).toBeGreaterThan(0);
  });
  it('CSV 내려받기는 우리 통제 밖임이 원장에 명시돼 있다', () => {
    expect(STORAGE_LOCATIONS.some((l) => l.desc.includes('통제 밖'))).toBe(true);
  });
  it('열람·파기 인터페이스가 가명 ID 로 동작한다', async () => {
    const e = new LocalEraser();
    expect(typeof e.find).toBe('function');
    expect(typeof e.erase).toBe('function');
    // localStorage 가 없는 node 환경에서도 안전하게 빈 결과를 낸다
    await expect(e.find('A03')).resolves.toBeInstanceOf(Array);
  });
});
