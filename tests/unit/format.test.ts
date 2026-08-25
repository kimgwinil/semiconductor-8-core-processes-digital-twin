/**
 * `src/lib/format.ts` — 화면 수치 서식 정본.
 *
 * 🔴 기대값은 **손으로 적는다.** 구현의 수식을 테스트에 옮겨 적으면 두 벌이 함께 틀린다.
 *    (이 파일이 막으려는 것이 바로 그 「정본이 둘」 상태다.)
 *
 * 🔴 이 파일의 핵심은 개별 문자열이 아니라 **아래 두 그룹**이다.
 *    · 「공유 규칙」 — 배지와 눈금이 **반드시 같아야** 하는 것(비유한값·0·지수 전환 지점)
 *    · 「의도된 차이」 — 자릿수. 눈금은 짧아야 하고 배지는 유효숫자가 중요하다.
 *    공유 규칙이 갈라지면 그것이 곧 정본이 둘로 쪼개졌다는 신호다.
 */
import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatQuantity,
  formatTick,
  NON_FINITE_LABEL,
  EXP_THRESHOLD_HI,
  EXP_THRESHOLD_LO,
  QUANTITY_FORMAT,
  TICK_FORMAT,
} from '@/lib/format';

describe('공유 규칙 — 배지와 눈금이 갈라지면 안 되는 것', () => {
  it('비유한값은 양쪽 모두 「—」', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatQuantity(v)).toBe('—');
      expect(formatTick(v)).toBe('—');
    }
    expect(NON_FINITE_LABEL).toBe('—');
  });

  it('digits 를 줘도 비유한값은 「—」 — toFixed 결과가 새어 나가면 안 된다', () => {
    expect(formatQuantity(Number.NaN, 2)).toBe('—');
    expect(formatQuantity(Number.POSITIVE_INFINITY, 0)).toBe('—');
  });

  it('0 과 -0 은 양쪽 모두 「0」', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatTick(0)).toBe('0');
    expect(formatQuantity(-0)).toBe('0');
    expect(formatTick(-0)).toBe('0');
  });

  it('지수 전환은 같은 지점에서 일어난다', () => {
    const isExp = (s: string): boolean => s.includes('e');
    const around = [
      EXP_THRESHOLD_LO, EXP_THRESHOLD_LO * 0.999, EXP_THRESHOLD_LO * 1.001,
      EXP_THRESHOLD_HI, EXP_THRESHOLD_HI * 0.999, EXP_THRESHOLD_HI * 1.001,
      1e-6, 1e-4, 0.5, 1, 999, 1e4, 1e6, 1e9,
    ];
    for (const v of [...around, ...around.map((x) => -x)]) {
      expect([v, isExp(formatQuantity(v))]).toEqual([v, isExp(formatTick(v))]);
    }
  });

  it('지수 표기에 「+」 를 붙이지 않는다 — 양쪽이 같은 모양을 쓴다', () => {
    expect(formatQuantity(2e8)).not.toContain('+');
    expect(formatTick(2e8)).not.toContain('+');
  });
});

describe('formatQuantity — 수치 배지 프리셋', () => {
  it('지수 경계 바로 아래는 일반 표기(소수 3자리 반올림)', () => {
    expect(formatQuantity(99999)).toBe('99999');
    expect(formatQuantity(99999.9)).toBe('99999.9');
    expect(formatQuantity(0.001)).toBe('0.001');
    expect(formatQuantity(0.0012345)).toBe('0.001');
    expect(formatQuantity(12.3456)).toBe('12.346');
  });

  it('지수 경계 위/아래는 지수 표기(가수 3자리)', () => {
    expect(formatQuantity(1e5)).toBe('1.000e5');
    expect(formatQuantity(0.0005)).toBe('5.000e-4');
    expect(formatQuantity(1.2345e8)).toBe('1.234e8');
  });

  it('음수', () => {
    expect(formatQuantity(-1234.5)).toBe('-1234.5');
    expect(formatQuantity(-2e6)).toBe('-2.000e6');
    expect(formatQuantity(-0.0005)).toBe('-5.000e-4');
  });

  it('digits 를 주면 그 자릿수로 고정하고 지수 전환을 하지 않는다', () => {
    expect(formatQuantity(3.14159, 2)).toBe('3.14');
    expect(formatQuantity(2e6, 1)).toBe('2000000.0');
    expect(formatQuantity(0.00012, 5)).toBe('0.00012');
    expect(formatQuantity(-7.77, 0)).toBe('-8');
  });
});

describe('formatTick — 축 눈금 프리셋', () => {
  it('지수 경계 바로 아래는 일반 표기(유효숫자 4자리, 정수는 그대로)', () => {
    expect(formatTick(99999)).toBe('99999');
    expect(formatTick(12.34)).toBe('12.34');
    expect(formatTick(0.001)).toBe('0.001');
    expect(formatTick(0.0012345)).toBe('0.001234');
  });

  it('지수 경계 위/아래는 짧은 지수 표기(가수 1자리, 정수면 소수부 제거)', () => {
    expect(formatTick(1e5)).toBe('1e5');
    expect(formatTick(0.0005)).toBe('5e-4');
    expect(formatTick(1.5e8)).toBe('1.5e8');
    expect(formatTick(-2e6)).toBe('-2e6');
  });

  it('가수가 10 으로 올라가면 지수를 올린다 — 「10.0e7」 같은 표기는 지수 표기가 아니다', () => {
    expect(formatTick(9.9999e7)).toBe('1.0e8');
    expect(formatQuantity(9.9999e7)).toBe('1.000e8');
  });

  it('가수가 정수에 아주 가까우면 정수로 적는다', () => {
    expect(formatTick(2.0000000001e8)).toBe('2e8');
  });
});

describe('formatNumber — 정본', () => {
  it('프리셋은 formatNumber 위의 얇은 껍데기다', () => {
    expect(formatQuantity(1.2345e8)).toBe(formatNumber(1.2345e8, QUANTITY_FORMAT));
    expect(formatTick(1.2345e8)).toBe(formatNumber(1.2345e8, TICK_FORMAT));
  });

  it('임의 옵션 — 가수 2자리 · 유효숫자 2자리', () => {
    const opts = {
      expMantissaDigits: 2,
      trimExpMantissa: false,
      plain: { mode: 'significant', digits: 2 },
    } as const;
    expect(formatNumber(1.2345e8, opts)).toBe('1.23e8');
    expect(formatNumber(12.34, opts)).toBe('12');
    expect(formatNumber(Number.NaN, opts)).toBe('—');
    expect(formatNumber(0, opts)).toBe('0');
  });
});
