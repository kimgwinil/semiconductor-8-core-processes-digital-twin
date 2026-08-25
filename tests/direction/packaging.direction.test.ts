// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { PACKAGING_RULES, packagingModel } from '@/models/physics/packaging/rules';
import { runRule, expectTradeoff, type Sweep } from './runner';

/**
 * 🔴 A12 — 패키징 방향성 검증. 골든값이 「값이 맞는가」라면 이쪽은 「방향이 맞는가」다.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(규약 §2-4).
 */
const BASE = {
  // 열저항 (S247)
  thetaJaCPerW: 40,
  powerW: 1,
  ambientTempC: 25,
  // 다이 전단 (S43) — 표준이 세는 단위 10⁻⁴ in²
  dieAreaUnits: 16,
  // MSL (S248) — 플로어 라이프가 시간으로 규정된 등급 3·4·5·5a 중 첫 번째
  mslHourlyIndex: 0,
  // 번인·ELFR (S54) — Annex A 조건
  useTempK: 343,
  stressTempK: 403,
  activationEnergyEv: 0.65,
  sampleSize: 3000,
  testHours: 48,
  chiSquare: 6.21,
  earlyLifePeriodH: 5840,
  // 볼본드 (S53)
  ballDiameterUm: 70,
  // 언더필 (S241)
  gapUm: 214,
  shearRatePerS: 10,
  // 솔더볼 전단 (S249)
  shearSpeedMmPerS: 0.5,
};

const sweeps: Record<string, Sweep> = {
  // 전력 0.5 → 3 W (S247 §5.5 권장 전력 범위)
  'PKG-D1': { from: 0.5, to: 3, steps: 10, baseline: { ...BASE } },
  // θ_JA 15.5 → 150 °C/W. 표의 최저 경계(15) 아래는 표준이 규정하지 않아 제외한다.
  'PKG-D2': { from: 15.5, to: 150, steps: 30, baseline: { ...BASE } },
  // 등급 3 · 4 · 5 · 5a
  'PKG-D3': { from: 0, to: 3, steps: 3, baseline: { ...BASE } },
  // 🔴 64×10⁻⁴ in² 경계를 부동소수로 정확히 밟지 않도록 2.2 간격으로 훑는다.
  'PKG-D4': { from: 1, to: 100, steps: 45, baseline: { ...BASE } },
  // 스트레스 접합온도 373 → 448 K (100 → 175 °C)
  'PKG-D5': { from: 373, to: 448, steps: 15, baseline: { ...BASE } },
  // 시료 수 500 → 10,000
  'PKG-D6': { from: 500, to: 10000, steps: 19, baseline: { ...BASE } },
  // 압착 볼 직경 20 → 150 µm
  'PKG-D7': { from: 20, to: 150, steps: 13, baseline: { ...BASE } },
  // 갭 200 → 600 µm (S241 실제 패키지 범위)
  'PKG-D8': { from: 200, to: 600, steps: 20, baseline: { ...BASE } },
  // 전단속도 1 → 1000 1/s
  'PKG-D9': { from: 1, to: 1000, steps: 20, baseline: { ...BASE } },
  // 전단시험 속도 0.01 → 100 mm/s — 저속·미규정·고속 구간을 모두 지난다
  'PKG-D10': { from: 0.01, to: 100, steps: 40, baseline: { ...BASE } },
  'PKG-D11': { from: 0.5, to: 3, steps: 10, baseline: { ...BASE } },
};

describe('A12 패키징 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(PACKAGING_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of PACKAGING_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of PACKAGING_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
  it('모든 규칙 id 가 유일하다', () => {
    const ids = PACKAGING_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

for (const rule of PACKAGING_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, packagingModel);
    });
  });
}

describe('PKG-D2 상충 — 열저항이 크면 접합온도는 오르고 권장 측정 전력은 내린다', () => {
  it('두 출력의 추세가 반대로 선언돼 있다', () => {
    const r = PACKAGING_RULES.find((x) => x.id === 'PKG-D2');
    expect(r).toBeDefined();
    expectTradeoff(r!, 'riseC', 'recommendedPowerW');
    expect(r?.expect.find((e) => e.output === 'riseC')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'recommendedPowerW')?.trend).toBe('decreasing');
  });
});

describe('PKG-D4 — 64×10⁻⁴ in² 의 불연속이 non-monotonic 으로 선언돼 있다', () => {
  it('단조 증가로 걸지 않았다', () => {
    const r = PACKAGING_RULES.find((x) => x.id === 'PKG-D4');
    expect(r?.expect.find((e) => e.output === 'dieShearRequiredKg')?.trend).toBe('non-monotonic');
  });
});

describe('죽은 입력이 없다 — 각 규칙의 입력을 흔들면 선언한 출력이 실제로 움직인다', () => {
  for (const rule of PACKAGING_RULES) {
    it(`${rule.id}: ${rule.inputName}`, () => {
      const sweep = sweeps[rule.id] as Sweep;
      const lo = packagingModel({ ...sweep.baseline, [rule.inputName]: sweep.from });
      const hi = packagingModel({ ...sweep.baseline, [rule.inputName]: sweep.to });
      const moved = rule.expect.some((e) => lo[e.output] !== hi[e.output]);
      expect(moved, `${rule.id}: 전 구간에서 출력이 전혀 변하지 않는다`).toBe(true);
    });
  }
});
