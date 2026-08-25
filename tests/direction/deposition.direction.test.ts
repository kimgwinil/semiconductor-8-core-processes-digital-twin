// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { DEPOSITION_RULES, depositionModel } from '@/models/physics/deposition/rules';
import { runRule, expectTradeoff, type Sweep } from './runner';

/**
 * 🔴 A12 — 증착·이온주입 방향성 검증.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(제품 상수가 아니다).
 */
const BASE: Record<string, number> = {
  // ALD (S186)
  aldTempC: 200,
  aldCycles: 200,
  // 확산 (S182 · S188) — 1100 °C = 1373.15 K
  diffTempK: 1373.15,
  diffTimeS: 1800,
  diffCsCm3: 1e20,
  diffCbCm3: 1e16,
  // CVD (S184) — 계수는 문헌 표가 없어 전량 입력이다
  cvdTempK: 1100,
  cvdHgCmPerS: 1,
  cvdK0CmPerS: 1e7,
  cvdEaEv: 1.8,
  cvdCgCm3: 1e16,
  cvdFilmDensityCm3: 5e22,
  // Stoney (S187 · S244) — 725 µm Si(001) 웨이퍼, 곡률 반경 50 m
  substrateModulusPa: 1.803e11,
  substrateThicknessM: 725e-6,
  filmThicknessM: 1e-6,
  curvatureRadiusM: 50,
  // 스퍼터 (S185) — He⁺ → Cu
  z1: 2, m1: 4, z2: 29, m2: 63.55,
  ionEnergyEv: 1000,
  // 이온주입 (S180 · S181) — R_p·ΔR_p 는 조건으로 제시된 값이다(R150 조건)
  implantDoseCm2: 1e14,
  implantRpUm: 0.24,
  implantDeltaRpUm: 0.063,
  implantSubstrateCm3: 2e16,
  annealDCm2PerS: 1e-14,
  annealTimeS: 0,
  beamCurrentA: 1e-3,
  waferDiameterCm: 20,
  chargeState: 1,
  implantFixedTimeS: 90,
};

const sweeps: Record<string, Sweep> = {
  'DEP-D1': { from: 150, to: 250, steps: 4, baseline: { ...BASE } },
  'DEP-D2': { from: 10, to: 500, steps: 12, baseline: { ...BASE } },
  'DEP-D3': { from: 1173.15, to: 1573.15, steps: 8, baseline: { ...BASE } },
  'DEP-D4': { from: 60, to: 7200, steps: 20, baseline: { ...BASE } },
  'DEP-D5': { from: 800, to: 1400, steps: 12, baseline: { ...BASE } },
  'DEP-D6': { from: 1e-7, to: 2e-6, steps: 12, baseline: { ...BASE } },
  'DEP-D7': { from: 100, to: 10000, steps: 30, baseline: { ...BASE } },
  'DEP-D8': { from: 1e13, to: 1e15, steps: 12, baseline: { ...BASE } },
  'DEP-D9': { from: 0.02, to: 0.12, steps: 10, baseline: { ...BASE } },
  'DEP-D10': { from: 1e15, to: 1e18, steps: 12, baseline: { ...BASE } },
  'DEP-D11': { from: 0, to: 3600, steps: 12, baseline: { ...BASE } },
  'DEP-D12': { from: 1, to: 500, steps: 20, baseline: { ...BASE } },
  'DEP-D13': { from: 0.1, to: 50, steps: 20, baseline: { ...BASE } },
};

describe('A12 증착·이온주입 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(DEPOSITION_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of DEPOSITION_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of DEPOSITION_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
});

for (const rule of DEPOSITION_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, depositionModel);
    });
  });
}

describe('🔴 DEP-D1 — ALD 창의 평탄성은 이 공정의 핵심이다', () => {
  it('GPC 추세가 flat 으로 선언돼 있다 (increasing·decreasing 이면 자기제한을 거꾸로 가르친다)', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D1');
    expect(r?.expect.find((e) => e.output === 'gpcAngstrom')?.trend).toBe('flat');
  });
  it('창 안에서 온도를 흔들어도 두께가 비트 단위로 같다', () => {
    const a = depositionModel({ ...BASE, aldTempC: 160 }).thicknessNm;
    const b = depositionModel({ ...BASE, aldTempC: 240 }).thicknessNm;
    expect(a).toBe(b);
  });
  it('창 밖(120 °C)은 범위 밖으로 거부된다 — 억지로 외삽하지 않는다', () => {
    expect(() => depositionModel({ ...BASE, aldTempC: 120 })).toThrow();
  });
});

describe('상충 규칙 — 두 출력의 추세가 반대로 선언돼 있다', () => {
  it('DEP-D4 확산: 깊이↑ vs 증가율↓', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D4');
    expectTradeoff(r!, 'diffusionJunctionUm', 'diffusionJunctionRateUmPerS');
    expect(r?.expect.find((e) => e.output === 'diffusionJunctionUm')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'diffusionJunctionRateUmPerS')?.trend).toBe('decreasing');
  });
  it('DEP-D5 CVD: 성장률↑ vs 겉보기 활성화에너지↓', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D5');
    expectTradeoff(r!, 'cvdGrowthRateCmPerS', 'cvdApparentEaEv');
  });
  it('DEP-D10 주입: 깊은 접합↓ vs 얕은 접합↑ (두 접합이 서로 다가온다)', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D10');
    expectTradeoff(r!, 'junctionDeepNm', 'junctionShallowNm');
    expect(r?.expect.find((e) => e.output === 'junctionDeepNm')?.trend).toBe('decreasing');
    expect(r?.expect.find((e) => e.output === 'junctionShallowNm')?.trend).toBe('increasing');
  });
  it('DEP-D11 어닐: 피크 농도↓ vs 깊은 접합↑', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D11');
    expectTradeoff(r!, 'peakCm3', 'junctionDeepNm');
  });
});

describe('DEP-D7 — 핵정지능의 최댓값은 실재한다', () => {
  it('non-monotonic 으로 선언돼 있다 (단조로 걸면 틀린 물리를 강제한다)', () => {
    const r = DEPOSITION_RULES.find((x) => x.id === 'DEP-D7');
    expect(r?.expect.find((e) => e.output === 'nuclearStoppingSn')?.trend).toBe('non-monotonic');
  });
});
