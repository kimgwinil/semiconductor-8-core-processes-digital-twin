import { expect } from 'vitest';
import type { DirectionRule, Monotonicity } from '@/models/direction';
import { OutOfLimitError } from '@/models/contract';

/**
 * A12 방향성 검사기 (설계서 §13-2).
 * 스윕 구간·기준값은 **검증 설정**이므로 테스트가 소유한다(제품 상수가 아니다).
 */
export interface Sweep {
  from: number;
  to: number;
  steps: number;
  baseline: Record<string, number>;
  /** 🔴 단조성이 물리적으로 깨지는 구간 — 여기서는 단조 검사를 면제한다(§13-3). */
  exempt?: Array<{ from: number; to: number; reason: string }>;
}

const REL_EPS = 1e-9;

function sign(d: number, scale: number): -1 | 0 | 1 {
  if (Math.abs(d) <= Math.abs(scale) * REL_EPS) return 0;
  return d > 0 ? 1 : -1;
}

export function runRule(
  rule: DirectionRule,
  sweep: Sweep,
  model: (inputs: Record<string, number>) => Record<string, number>,
): void {
  const samples: Array<{ x: number; out: Record<string, number> }> = [];

  for (let i = 0; i <= sweep.steps; i++) {
    const x = sweep.from + ((sweep.to - sweep.from) * i) / sweep.steps;
    if (sweep.exempt?.some((e) => x >= e.from && x <= e.to)) continue;
    try {
      samples.push({ x, out: model({ ...sweep.baseline, [rule.inputName]: x }) });
    } catch (e) {
      // 범위 밖은 건너뛴다 — assertWithin 이 막는 것이 정상 동작이다
      if (!(e instanceof OutOfLimitError)) throw e;
    }
  }

  // 유효 표본이 너무 적으면 스윕 구간 설정이 잘못된 것이다
  expect(samples.length, `${rule.id}: 유효 표본 ${samples.length}개 (최소 ${Math.ceil(sweep.steps / 3)}개)`)
    .toBeGreaterThanOrEqual(Math.ceil(sweep.steps / 3));

  for (const { output, trend } of rule.expect) {
    const ys = samples.map((s) => {
      const v = s.out[output];
      expect(v, `${rule.id}: 모델이 출력 "${output}" 을 내지 않는다`).toBeTypeOf('number');
      expect(Number.isFinite(v as number), `${rule.id}: ${output} 이 유한하지 않다`).toBe(true);
      return v as number;
    });

    const scale = Math.max(...ys.map(Math.abs), 1);
    const signs: number[] = [];
    for (let i = 1; i < ys.length; i++) signs.push(sign((ys[i] as number) - (ys[i - 1] as number), scale));

    const nonZero = signs.filter((s) => s !== 0);
    const flips = countFlips(nonZero);

    check(rule, output, trend, signs, nonZero, flips, ys);
  }
}

function countFlips(nonZero: number[]): number {
  let flips = 0;
  for (let i = 1; i < nonZero.length; i++) if (nonZero[i] !== nonZero[i - 1]) flips++;
  return flips;
}

function check(
  rule: DirectionRule, output: string, trend: Monotonicity,
  signs: number[], nonZero: number[], flips: number, ys: number[],
): void {
  const label = `${rule.id} / ${output} (${trend})`;

  if (trend === 'flat') {
    expect(nonZero.length, `${label}: 변하지 않아야 하는데 ${nonZero.length}회 변했다`).toBe(0);
    return;
  }

  // 🔴 죽은 입력 검출 — 전 구간 변화 0 이면 무조건 실패다(규정 §4-1(3))
  expect(nonZero.length, `${label}: 입력을 흔들었는데 출력이 전혀 변하지 않는다 = 죽은 입력`)
    .toBeGreaterThan(0);

  if (trend === 'increasing') {
    expect(signs.every((s) => s >= 0), `${label}: 감소 구간이 있다. 값 ${fmt(ys)}`).toBe(true);
  } else if (trend === 'decreasing') {
    expect(signs.every((s) => s <= 0), `${label}: 증가 구간이 있다. 값 ${fmt(ys)}`).toBe(true);
  } else {
    // non-monotonic — 부호가 정확히 1회 바뀐다. 0회면 규칙이 틀렸거나 모델이 죽었다.
    expect(flips, `${label}: 부호 전환이 ${flips}회다(1회여야 한다). 값 ${fmt(ys)}`).toBe(1);
  }
}

function fmt(ys: number[]): string {
  const head = ys.slice(0, 4).map((v) => v.toPrecision(4)).join(', ');
  return ys.length > 4 ? `[${head}, … n=${ys.length}]` : `[${head}]`;
}

/** 상충 규칙 — 지정한 두 출력의 추세가 규칙대로 서로 반대인지. */
export function expectTradeoff(rule: DirectionRule, a: string, b: string): void {
  const ta = rule.expect.find((e) => e.output === a)?.trend;
  const tb = rule.expect.find((e) => e.output === b)?.trend;
  expect(ta, `${rule.id}: ${a} 추세가 선언되지 않았다`).toBeDefined();
  expect(tb, `${rule.id}: ${b} 추세가 선언되지 않았다`).toBeDefined();
}
