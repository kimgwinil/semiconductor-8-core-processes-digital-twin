// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  K1_PHYSICAL_FLOOR, depthOfFocusArFImmersion, dofRatio, requiredK1, resolution,
} from '@/models/physics/photo/rayleigh';

/** T2 골든 테스트 — 원장 §1-3 (R120~R124, R132). */

describe('R120·R121·R122 — Rayleigh 해상도 (문헌 인쇄값)', () => {
  const cases: Array<[string, { lambdaNm: number; na: number; k1: number }, number, number]> = [
    ['R120 물리 하한: λ193 NA1.35 k₁0.25 → 36 nm', { lambdaNm: 193, na: 1.35, k1: 0.25 }, 36, 0.02],
    ['R121 1975 세대: λ436 NA0.16 k₁1.0 → 2700 nm', { lambdaNm: 436, na: 0.16, k1: 1.0 }, 2700, 0.02],
    ['R122 2010 최고: λ193 NA1.35 k₁0.28 → 40 nm', { lambdaNm: 193, na: 1.35, k1: 0.28 }, 40, 0.01],
  ];
  for (const [name, args, expected, tol] of cases) {
    it(name, () => {
      const got = resolution(args).value;
      expect(Math.abs(got - expected) / expected).toBeLessThanOrEqual(tol);
    });
  }
});

describe('R123·R124 — EUV 로드맵 (㉱ 로드맵 목표 · 구조 정합성만 확인)', () => {
  // 🔴 이 두 건은 물리 실측이 아니라 로드맵 목표다(원장 §1-0). 통과해도 물리가 맞다는 뜻이 아니다.
  it('0.33 NA · half-pitch 13 nm 에서 역산한 k₁ 이 물리 하한 위다', () => {
    const k1 = requiredK1({ targetCdNm: 13, lambdaNm: 13.5, na: 0.33 }).value;
    expect(k1).toBeGreaterThan(K1_PHYSICAL_FLOOR.value);
    expect(k1).toBeCloseTo(0.318, 2);
  });
  it('0.55 NA · half-pitch 8 nm 에서 역산한 k₁ 이 0.33 NA 값과 서로 정합한다', () => {
    const k1 = requiredK1({ targetCdNm: 8, lambdaNm: 13.5, na: 0.55 }).value;
    expect(k1).toBeCloseTo(0.326, 2);
  });
});

describe('🔴 k₂ 는 출처가 있는 조건에서만 쓴다 (원장 §4-1)', () => {
  it('ArF 침지에서는 DOF 절대값을 낸다', () => {
    const dof = depthOfFocusArFImmersion({ lambdaNm: 193, na: 1.35 });
    expect(dof.value).toBeCloseTo((0.745 * 193) / (1.35 * 1.35), 6);
    expect(dof.sourceId).toBe('S149');
  });
  it('EUV(13.5 nm)에는 k₂ 를 전용하지 않고 던진다', () => {
    expect(() => depthOfFocusArFImmersion({ lambdaNm: 13.5, na: 0.33 })).toThrow(/ArF/);
  });
  it('대신 비율은 상수 없이 구해진다 — EUV 0.33 → 0.55 NA 는 0.36 배', () => {
    expect(dofRatio({ naFrom: 0.33, naTo: 0.55 }).value).toBeCloseTo(0.36, 4);
  });
});

describe('🔴 k₁ 물리 하한 0.25 미만은 범위 밖으로 거부한다 (설계서 §13-3)', () => {
  it('k₁ = 0.20 은 던진다', () => {
    expect(() => resolution({ lambdaNm: 193, na: 1.35, k1: 0.20 })).toThrow(/k1/);
  });
});
