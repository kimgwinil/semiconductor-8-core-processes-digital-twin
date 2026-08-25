// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { WAFER_RULES, waferModel } from '@/models/physics/wafer/rules';
import { runRule, type Sweep } from './runner';

/**
 * 🔴 A12 — 웨이퍼 제조 방향성 검증. 골든값이 「값이 맞는가」라면 이쪽은 「방향이 맞는가」다.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(제품 상수가 아니다).
 */
const BASE: Record<string, number> = {
  tempK: 1500,
  pullRateCmPerMin: 0.04,
  gradientKPerCm: 30,
  resistivityOhmCm: 10,
  solidFraction: 0.5,
  meltConcentrationCm3: 2.5e15, // R105 의 붕소 융액 농도
  k0: 0.8,                      // R105 의 붕소 편석계수 — 제품 코드가 아니라 검증 설정이다
  feedRateMmPerMin: 0.75,
  wireSpeedMPerS: 1.5,
  crystalDiameterCm: 20,
  pullRateMmPerMin: 1.5,
};

const sweeps: Record<string, Sweep> = {
  // ξ_crit = 1.3×10⁻³, G = 30 K/cm → v_crit ≈ 0.039 cm/min. 구간이 임계를 반드시 가로지른다.
  'WF-D1': { from: 0.01, to: 0.12, steps: 22, baseline: { ...BASE } },
  'WF-D2': { from: 1273.15, to: 1685, steps: 20, baseline: { ...BASE } },
  'WF-D3': { from: 0.01, to: 1000, steps: 40, baseline: { ...BASE } },
  'WF-D4': { from: 0, to: 0.95, steps: 20, baseline: { ...BASE } },
  'WF-D5': { from: 0.5, to: 1.0, steps: 10, baseline: { ...BASE } },
  'WF-D6': { from: 1.0, to: 2.0, steps: 10, baseline: { ...BASE } },
  'WF-D7': { from: 6, to: 30, steps: 24, baseline: { ...BASE } },
  'WF-D8': { from: 0.5, to: 3, steps: 20, baseline: { ...BASE } },
};

describe('A12 웨이퍼 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(WAFER_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of WAFER_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of WAFER_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
  it('모든 규칙의 processId 가 wafer 다', () => {
    for (const r of WAFER_RULES) expect(r.processId).toBe('wafer');
  });
});

for (const rule of WAFER_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, waferModel);
    });
  });
}

describe('WF-D1 — V/G 임계에서 지배 결함이 실제로 바뀐다 (A6L-01)', () => {
  const at = (pullRateCmPerMin: number): Record<string, number> =>
    waferModel({ ...BASE, pullRateCmPerMin });
  it('임계 아래는 침입형 과잉(0), 위는 공공 과잉(1)', () => {
    expect(at(0.02).defectRegimeIndex).toBe(0);
    expect(at(0.10).defectRegimeIndex).toBe(1);
  });
  it('경계를 정확히 한 번만 넘는다 — 두 번 뒤집히면 판정식이 틀린 것이다', () => {
    let flips = 0;
    let prev = at(0.01).defectRegimeIndex as number;
    for (let i = 1; i <= 100; i++) {
      const v = 0.01 + (0.11 * i) / 100;
      const cur = at(v).defectRegimeIndex as number;
      if (cur !== prev) flips++;
      prev = cur;
    }
    expect(flips).toBe(1);
  });
});

describe('WF-D4 · WF-D5/D6 상충 — 두 출력의 추세가 반대로 선언돼 있다', () => {
  it('WF-D4: 축방향 농도는 늘고 저항률은 준다', () => {
    const r = WAFER_RULES.find((x) => x.id === 'WF-D4');
    expect(r?.expect.find((e) => e.output === 'axialDopantCm3')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'axialResistivityOhmCm')?.trend).toBe('decreasing');
  });
  it('WF-D5 와 WF-D6: 같은 법선력을 두 입력이 반대로 민다', () => {
    const d5 = WAFER_RULES.find((x) => x.id === 'WF-D5');
    const d6 = WAFER_RULES.find((x) => x.id === 'WF-D6');
    expect(d5?.expect[0]?.trend).toBe('increasing');
    expect(d6?.expect[0]?.trend).toBe('decreasing');
  });
});
