import { describe, expect, it } from 'vitest';
import {
  gradeItem, gradeNumeric, gradeShort, gradeSingle,
  isDimensionless, normalizeShort, normalizeUnit,
} from '@/models/grading';
import type { QuestionItem } from '@/content/types';

/**
 * PLN 채점 규약(`threads/PLN-8대공정-001.md` §2-5) 검증.
 * 🔴 T-6 — 무차원 계산형(선택비·이방성도)이 「단위 불일치는 오답」 규칙에 걸려
 *          정답까지 오답 처리되지 않는지가 이 파일의 핵심이다.
 */

function q(partial: Partial<QuestionItem>): QuestionItem {
  return {
    id: 'etch-q06', type: 'numeric', difficulty: 'mid', objectiveId: 'LO-P4-03',
    stem: '', explanation: '', sourceId: 'S160', weakTopic: 'selectivity',
    answer: { value: 1, unit: null, tolerance: 0.05 },
    ...partial,
  } as QuestionItem;
}

describe('normalizeShort — 정규화 순서', () => {
  it('앞뒤 공백·내부 공백·하이픈·중점을 제거한다', () => {
    expect(normalizeShort('  포토 레지 - 스트 ')).toBe('포토레지스트');
    expect(normalizeShort('Deal · Grove')).toBe('dealgrove');
  });
  it('영문을 소문자화한다', () => {
    expect(normalizeShort('DEAL-GROVE')).toBe('dealgrove');
  });
  it('괄호 안 부기를 제거한다', () => {
    expect(normalizeShort('석영관(Quartz Tube)')).toBe('석영관');
  });
  it('전각을 반각으로 수렴시킨다', () => {
    expect(normalizeShort('ＡＬＤ')).toBe('ald');
  });
  // 🔴 PLN 규약 §6-2 개정 — 구두점 제거가 없으면 아래가 전부 오답 처리된다
  it('마침표를 제거한다 (C.O.P.)', () => {
    expect(normalizeShort('C.O.P.')).toBe('cop');
    expect(normalizeShort('COP')).toBe('cop');
  });
  it('밑줄을 제거한다 (E_0)', () => {
    expect(normalizeShort('E_0')).toBe('e0');
    expect(normalizeShort('E0')).toBe('e0');
  });
  it('쉼표·슬래시·따옴표를 제거한다', () => {
    expect(normalizeShort("Deal, Grove")).toBe('dealgrove');
    expect(normalizeShort('B/A')).toBe('ba');
    expect(normalizeShort("O'Hanlon")).toBe('ohanlon');
  });
  it('붙임표 3종(-, –, —)을 모두 제거한다', () => {
    expect(normalizeShort('Deal–Grove')).toBe('dealgrove');
    expect(normalizeShort('Deal—Grove')).toBe('dealgrove');
  });
  it('괄호 제거를 구두점 제거보다 먼저 한다', () => {
    // '석영관(Quartz Tube)' → 괄호 먼저 지워야 '석영관'이 남는다
    expect(normalizeShort('석영관(Quartz Tube)')).toBe('석영관');
  });
});

describe('gradeShort — 구두점 변형 수용 (PLN §6-2)', () => {
  it('C.O.P. 와 COP 를 같은 답으로 본다', () => {
    expect(gradeShort({ accept: ['COP'] }, 'C.O.P.')).toBe(true);
    expect(gradeShort({ accept: ['C.O.P.'] }, 'cop')).toBe(true);
  });
  it('E_0 와 E0 를 같은 답으로 본다', () => {
    expect(gradeShort({ accept: ['E0'] }, 'E_0')).toBe(true);
  });
  it('구두점을 지워도 부정문은 여전히 오답이다', () => {
    expect(gradeShort({ accept: ['패키징'] }, '패키징. 아님')).toBe(false);
  });
});

describe('gradeShort — 🔴 부분 문자열 매칭 금지', () => {
  const answer = { accept: ['패키징', 'packaging', 'package'] };
  it('완전 일치를 정답으로 본다', () => {
    expect(gradeShort(answer, '패키징')).toBe(true);
    expect(gradeShort(answer, ' Packaging ')).toBe(true);
  });
  it('🔴 부정문을 정답 처리하지 않는다 (참조 사이트 결함)', () => {
    expect(gradeShort(answer, '패키징 아님')).toBe(false);
    expect(gradeShort(answer, '패키징이 아니다')).toBe(false);
    expect(gradeShort(answer, 'not packaging')).toBe(false);
  });
  it('빈 입력은 오답이다', () => {
    expect(gradeShort(answer, '   ')).toBe(false);
  });
});

describe('gradeSingle', () => {
  it('정답 인덱스와 정확히 일치할 때만 정답', () => {
    expect(gradeSingle(2, 2)).toBe(true);
    expect(gradeSingle(2, 1)).toBe(false);
  });
});

describe('gradeNumeric — 상대 오차', () => {
  const a = { value: 302.5, unit: 'nm/min', tolerance: 0.05 };
  it('허용 오차 안이면 정답', () => {
    expect(gradeNumeric(a, 310, 'nm/min')).toBe(true);
    expect(gradeNumeric(a, 302.5, 'nm/min')).toBe(true);
  });
  it('허용 오차 밖이면 오답', () => {
    expect(gradeNumeric(a, 400, 'nm/min')).toBe(false);
  });
  it('단위가 다르면 오답', () => {
    expect(gradeNumeric(a, 302.5, 'µm/min')).toBe(false);
  });
  it('단위 표기 흔들림(공백·대소문자)은 흡수한다', () => {
    expect(gradeNumeric(a, 302.5, ' NM/MIN ')).toBe(true);
  });
  it('NaN 은 오답', () => {
    expect(gradeNumeric(a, Number.NaN, 'nm/min')).toBe(false);
  });
  it('기대값이 0 이면 절대 오차로 판정한다', () => {
    expect(gradeNumeric({ value: 0, unit: null, tolerance: 0.01 }, 0.005, null)).toBe(true);
    expect(gradeNumeric({ value: 0, unit: null, tolerance: 0.01 }, 0.5, null)).toBe(false);
  });
});

describe('🔴 T-6 — 무차원 계산형(unit: null)', () => {
  const selectivity = q({ answer: { value: 138, unit: null, tolerance: 0.02 } });

  it('무차원 문항임을 UI 가 식별할 수 있다', () => {
    expect(isDimensionless(selectivity)).toBe(true);
    expect(isDimensionless(q({ answer: { value: 1, unit: 'nm', tolerance: 0.1 } }))).toBe(false);
  });

  it('단위를 안 넣어도 정답이다', () => {
    expect(gradeItem(selectivity, { kind: 'numeric', value: 138, unit: null })).toBe(true);
  });

  it('빈 문자열 단위를 넣어도 정답이다', () => {
    expect(gradeItem(selectivity, { kind: 'numeric', value: 138, unit: '' })).toBe(true);
  });

  it('🔴 엉뚱한 단위를 넣어도 무차원 문항은 단위로 오답 처리하지 않는다', () => {
    expect(gradeItem(selectivity, { kind: 'numeric', value: 138, unit: 'nm' })).toBe(true);
  });

  it('값이 틀리면 여전히 오답이다', () => {
    expect(gradeItem(selectivity, { kind: 'numeric', value: 71, unit: null })).toBe(false);
  });

  it('이방성도(0~1 무차원)도 같은 규칙을 탄다', () => {
    const anisotropy = q({ id: 'etch-q08', answer: { value: 0.95, unit: null, tolerance: 0.03 } });
    expect(gradeItem(anisotropy, { kind: 'numeric', value: 0.96, unit: null })).toBe(true);
    expect(gradeItem(anisotropy, { kind: 'numeric', value: 0.5, unit: null })).toBe(false);
  });
});

describe('gradeItem — 유형 불일치는 오답', () => {
  it('선택형에 문자열 응답이 오면 오답', () => {
    const item = q({ type: 'single', answer: 2, choices: ['a', 'b', 'c'] });
    expect(gradeItem(item, { kind: 'short', value: '2' })).toBe(false);
  });
  it('무응답은 오답', () => {
    expect(gradeItem(q({}), undefined)).toBe(false);
  });
});

describe('normalizeUnit', () => {
  it('null·undefined·빈문자열이 모두 같은 값으로 수렴한다', () => {
    expect(normalizeUnit(null)).toBe('');
    expect(normalizeUnit(undefined)).toBe('');
    expect(normalizeUnit('  ')).toBe('');
  });
});
