// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, it, expect } from 'vitest';
import { METAL_RULES, metalModel } from '@/models/physics/metal/rules';
import { runRule, expectTradeoff, type Sweep } from './runner';

/**
 * 🔴 A12 — P6 금속배선·CMP 방향성 검증.
 * 스윕 구간·기준값은 **검증 설정**이므로 이 파일이 소유한다(제품 상수가 아니다).
 */
const BASE: Record<string, number> = {
  lineWidthNm: 100,
  lineThicknessNm: 100,
  lineLengthUm: 100,
  currentDensity1: 1e6,
  currentDensity2: 1e6,
  temperature1K: 400,
  temperature2K: 400,
  exponentN: 1.2,                 // Cu 표면확산 (S201 §2.2.1)
  activationEnergyEv: 0.8,        // Cu 표면 (S201 Table 2.1)
  prestonCoefficient: 1.6e-13,    // Cu 정본 (원장 §1-5)
  cmpPressurePa: 24760,           // R165 Table 2
  cmpVelocityMps: 1.089,          // R165 조건에서 계산된 상대속도
  targetRemovalNm: 500,
  dielectricConstant: 4.0,        // SiO₂ (S208)
  platingCurrentA: 1,
  platingTimeS: 1000,
  molarMassGPerMol: 63.546,
  valence: 2,
};

const sweeps: Record<string, Sweep> = {
  'MC-D1': { from: 20, to: 1000, steps: 20, baseline: { ...BASE } },
  // 🔴 하한 10 → 12 nm. M-29 수정으로 ρ_eff 가 S216 Eq.(8) 유효구간(k > 0.5)을 요구하는데,
  //    W = 100 nm 에서 k = 0.5 가 되는 두께가 11.11 nm 다. 스윕 구간을 모델 유효구간 안으로 들인 것이지
  //    결과에 맞춰 기준을 옮긴 것이 아니다(t = 12 nm 에서 k = 0.536).
  'MC-D2': { from: 12, to: 500, steps: 20, baseline: { ...BASE } },
  'MC-D3': { from: 1e5, to: 1e7, steps: 20, baseline: { ...BASE } },
  'MC-D4': { from: 300, to: 600, steps: 20, baseline: { ...BASE } },
  'MC-D5': { from: 4000, to: 66000, steps: 20, baseline: { ...BASE } },
  'MC-D6': { from: 0.05, to: 3.91, steps: 20, baseline: { ...BASE } },
  'MC-D7': { from: 1, to: 7, steps: 20, baseline: { ...BASE } },
  'MC-D8': { from: 0.1, to: 10, steps: 20, baseline: { ...BASE } },
  'MC-D9': { from: 10, to: 200, steps: 20, baseline: { ...BASE } },
};

describe('A12 금속배선 — 공정당 최소 5개 규칙', () => {
  it('규칙이 5개 이상이다', () => {
    expect(METAL_RULES.length).toBeGreaterThanOrEqual(5);
  });
  it('모든 규칙에 근거 S번호가 있다', () => {
    for (const r of METAL_RULES) expect(r.sourceId.length).toBeGreaterThan(0);
  });
  it('모든 규칙에 스윕 설정이 있다', () => {
    for (const r of METAL_RULES) expect(sweeps[r.id], `${r.id} 스윕 누락`).toBeDefined();
  });
  it('모든 규칙의 processId 가 metal 이다', () => {
    for (const r of METAL_RULES) expect(r.processId).toBe('metal');
  });
});

for (const rule of METAL_RULES) {
  describe(`${rule.id} — ${rule.statement}`, () => {
    it('방향성이 문헌대로다', () => {
      const sweep = sweeps[rule.id];
      expect(sweep).toBeDefined();
      runRule(rule, sweep as Sweep, metalModel);
    });
  });
}

describe('MC-D5 상충 — 하중을 올리면 제거율은 오르고 연마시간은 준다', () => {
  it('두 출력의 추세가 반대로 선언돼 있다', () => {
    const r = METAL_RULES.find((x) => x.id === 'MC-D5');
    expect(r).toBeDefined();
    expectTradeoff(r!, 'removalRateNmPerMin', 'polishTimeMin');
    expect(r?.expect.find((e) => e.output === 'removalRateNmPerMin')?.trend).toBe('increasing');
    expect(r?.expect.find((e) => e.output === 'polishTimeMin')?.trend).toBe('decreasing');
  });
});

/**
 * 🔴 **MC-D5 × MC-D6 등가 — Preston 식에서 하중과 상대속도는 대등하다.**
 * A12 규칙표에는 두 축의 **방향성**(둘 다 증가)만 있고 **대등성**이 없었다. 그런데 랩 피드백
 * MT-B3 은 「같은 제거율을 회전수로도 만들 수 있다」고 명시적으로 가르치고, CMP 씬도 그것을
 * 그려야 한다(2026-08-21 씬 결함 ❌-2 — 씬에서 회전수 항이 상쇄돼 글과 그림이 반대였다).
 * 가르치는 것은 검사한다.
 */
describe('MC-D5 × MC-D6 등가 — 하중 2배와 속도 2배가 같은 제거율을 낸다', () => {
  const REL_EPS = 1e-9;
  const base = metalModel(BASE).removalRateNmPerMin as number;

  it('기준 제거율이 유한하고 0 이 아니다', () => {
    expect(Number.isFinite(base)).toBe(true);
    expect(base).toBeGreaterThan(0);
  });

  // k 상한 2.5 — 24 760 Pa × 3 = 74 280 Pa 은 S204 Table 2.6 의 유효범위 4–66 kPa 를 벗어나
  // `assertWithin` 이 정상적으로 막는다. 범위를 넘겨 놓고 등가성을 논할 수는 없다.
  it('하중 k배 ≡ 속도 k배 (k = 1.25 · 1.5 · 2 · 2.5, 상대오차 1e-9 이내)', () => {
    for (const k of [1.25, 1.5, 2, 2.5]) {
      const byLoad = metalModel({ ...BASE, cmpPressurePa: (BASE['cmpPressurePa'] as number) * k })
        .removalRateNmPerMin as number;
      const bySpeed = metalModel({ ...BASE, cmpVelocityMps: (BASE['cmpVelocityMps'] as number) * k })
        .removalRateNmPerMin as number;
      expect(Math.abs(byLoad - bySpeed) / Math.max(byLoad, bySpeed), `k=${k}: ${byLoad} vs ${bySpeed}`)
        .toBeLessThanOrEqual(REL_EPS);
      expect(byLoad / base).toBeCloseTo(k, 9);
    }
  });

  it('연마시간도 대등하게 줄어든다 (P·V 곱에만 의존한다)', () => {
    const byLoad = metalModel({ ...BASE, cmpPressurePa: (BASE['cmpPressurePa'] as number) * 2 })
      .polishTimeMin as number;
    const bySpeed = metalModel({ ...BASE, cmpVelocityMps: (BASE['cmpVelocityMps'] as number) * 2 })
      .polishTimeMin as number;
    expect(Math.abs(byLoad - bySpeed) / Math.max(byLoad, bySpeed)).toBeLessThanOrEqual(REL_EPS);
  });
});

describe('MC-D2 가중 — 두께는 단면적과 표면산란에 동시에 걸린다', () => {
  it('저항이 1/T 보다 빠르게 떨어진다 (두께 2배 → 저항 1/2 보다 더 작아진다)', () => {
    const thin = metalModel({ ...BASE, lineThicknessNm: 50 });
    const thick = metalModel({ ...BASE, lineThicknessNm: 100 });
    expect(thick.lineResistanceOhm as number).toBeLessThan((thin.lineResistanceOhm as number) / 2);
  });
  it('실효 저항률도 함께 내려간다', () => {
    const thin = metalModel({ ...BASE, lineThicknessNm: 50 });
    const thick = metalModel({ ...BASE, lineThicknessNm: 100 });
    expect(thick.effectiveResistivityUOhmCm as number).toBeLessThan(thin.effectiveResistivityUOhmCm as number);
  });
});

/**
 * 🔴 2026-08-21 M-29 — **이 블록은 통째로 뒤집혔다.**
 *
 * 종전 제목은 「선폭은 단면적에만 걸린다」였고, 두 단언이 각각
 *  ① `narrow.effectiveResistivityUOhmCm === wide.effectiveResistivityUOhmCm` (폭 무관)
 *  ② `R(50)/R(100) === 2` (정확히 1/W)
 * 였다. **둘 다 M-29 결함 그 자체를 박아 둔 테스트였다** — 물리층이 무한폭 박막식을 배선에 쓰고
 * 있었기 때문에 성립하던 성질이고, S216 Eq.(8) 은 특성길이를 `4·A/P` 로 두어 **폭도 표면 산란에
 * 걸린다**고 말한다. 그래서 「옛 동작을 지키는 단언」을 「옳은 방향을 지키는 단언」으로 바꾼다.
 */
describe('MC-D1 가중 — 선폭은 단면적과 표면산란에 동시에 걸린다 (S216 Eq.(8))', () => {
  it('🔴 선폭을 바꾸면 실효 저항률도 바뀐다 — 좁을수록 높다', () => {
    const narrow = metalModel({ ...BASE, lineWidthNm: 30 });
    const wide = metalModel({ ...BASE, lineWidthNm: 300 });
    expect(narrow.effectiveResistivityUOhmCm as number)
      .toBeGreaterThan(wide.effectiveResistivityUOhmCm as number);
  });
  it('🔴 저항은 1/W 보다 빠르게 떨어진다 (폭 2배 → 저항이 절반보다 더 작아진다)', () => {
    const narrow = metalModel({ ...BASE, lineWidthNm: 50 });
    const wide = metalModel({ ...BASE, lineWidthNm: 100 });
    expect(wide.lineResistanceOhm as number).toBeLessThan((narrow.lineResistanceOhm as number) / 2);
    // 옛 동작(정확히 1/W)이 되살아나면 여기서 걸린다.
    expect((narrow.lineResistanceOhm as number) / (wide.lineResistanceOhm as number))
      .toBeGreaterThan(2);
  });
});
