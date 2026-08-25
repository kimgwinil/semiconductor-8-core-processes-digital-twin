// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError, type Quantity } from '@/models/contract';
import {
  apparentMobility, dopantDensity, resistivityDensityProduct, resistivityFromDensity,
  PHOSPHORUS_RHO_RANGE, BORON_RHO_RANGE,
} from '@/models/physics/wafer/resistivity';
import {
  defectDiffusivity, equilibriumConcentration, transportCapacity, voronkovRatio,
  voronkovCriticalRatio, dominantDefectRegime,
  DEFECT_TEMP_RANGE_K, PARAMETER_SET_IDS, PULL_RATE_RANGE_CM_PER_MIN,
  SILICON_MELTING_POINT_K, XI_CRIT_TYPICAL, BOLTZMANN_AS_PRINTED, BOLTZMANN_USED_EV_PER_K,
  isStressedSet,
} from '@/models/physics/wafer/pointDefect';
import {
  maxPullRate, meltConcentrationFromSolid, scheilAxialConcentration,
  CRYSTAL_DIAMETER_RANGE_CM, SOLID_FRACTION_RANGE, SEGREGATION_SOURCE_HIDDEN_IN_UI,
} from '@/models/physics/wafer/czochralski';
import {
  normalForceByFeedRate, normalForceByWireSpeed,
  FEED_RATE_RANGE_MM_PER_MIN, WIRE_SPEED_RANGE_M_PER_S, KERF_LOSS_FRACTION,
} from '@/models/physics/wafer/wireSaw';
import { bulkResistivityFourPoint } from '@/models/physics/wafer/probe';

/**
 * 🔴 A14 — 웨이퍼 제조 계산 정확성. 예외 없다.
 *  1. 결정론   — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조 (골든은 tests/golden/wafer.golden.test.ts, 여기서는 대표점 추가 고정)
 *  3. 경계 안정성 — 전 파라미터 min·max·경계에서 NaN·Infinity·발산 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위를 갖고 차원이 맞는다
 */

const REF_DEFECT = { setId: 'A' as const, species: 'I' as const, tempK: 1500 };
const REF_RHO = 12.5;

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
}

// ── A14-1 결정론 ──────────────────────────────────────────────────────────────
describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('점결함 확산계수를 200회 반복해도 비트 단위로 같다', () => {
    const first = defectDiffusivity(REF_DEFECT).value;
    for (let i = 0; i < 200; i++) expect(defectDiffusivity(REF_DEFECT).value).toBe(first);
  });
  it('저항률→도핑밀도를 200회 반복해도 비트 단위로 같다', () => {
    const first = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: REF_RHO }).value;
    for (let i = 0; i < 200; i++) {
      expect(dopantDensity({ dopant: 'phosphorus', rhoOhmCm: REF_RHO }).value).toBe(first);
    }
  });
  it('이분법 역산도 반복 호출에서 비트 단위로 같다 (수렴 상태가 남지 않는다)', () => {
    const first = resistivityFromDensity({ dopant: 'boron', densityCm3: 3.6e15 }).value;
    for (let i = 0; i < 100; i++) {
      expect(resistivityFromDensity({ dopant: 'boron', densityCm3: 3.6e15 }).value).toBe(first);
    }
  });
  it('시각이 흘러도 값이 변하지 않는다', async () => {
    const a = voronkovCriticalRatio('C').value;
    await new Promise((r) => setTimeout(r, 20));
    expect(voronkovCriticalRatio('C').value).toBe(a);
  });
});

// ── A14-2 손계산 대조 ────────────────────────────────────────────────────────
describe('A14-2 수치 정확성 — 손계산 대조 5점', () => {
  it('① D = D⁰exp(−Hᵐ/kT): 세트 A 침입형, 1500 K', () => {
    const hand = 1.040e4 * Math.exp(-2.4 / (BOLTZMANN_USED_EV_PER_K * 1500));
    expect(defectDiffusivity(REF_DEFECT).value).toBeCloseTo(hand, 12);
  });
  it('② C^eq = C⁰exp(−H^f/kT): 세트 A 공공, 융점', () => {
    const hand = 5.290e22 * Math.exp(-2.6 / (BOLTZMANN_USED_EV_PER_K * SILICON_MELTING_POINT_K));
    const got = equilibriumConcentration({ setId: 'A', species: 'V', tempK: SILICON_MELTING_POINT_K }).value;
    expect(Math.abs(got - hand) / hand).toBeLessThan(1e-12);
  });
  it('③ N = (qρN)/(qρ): S100 식 (1) 을 손으로 전개', () => {
    const x = Math.log10(REF_RHO);
    const num = -3.1083 + -3.2626 * x + -1.2196 * x * x + -0.13923 * x * x * x;
    const den = 1 + 1.0265 * x + 0.38755 * x * x + 0.041833 * x * x * x;
    const hand = Math.pow(10, num / den) / (1.602e-19 * REF_RHO);
    const got = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: REF_RHO }).value;
    expect(Math.abs(got - hand) / hand).toBeLessThan(1e-12);
  });
  it('④ Scheil: C_s = k₀C₀(1−X)^(k₀−1)', () => {
    const hand = 0.8 * 2.5e15 * Math.pow(1 - 0.95, 0.8 - 1);
    const got = scheilAxialConcentration({ k0: 0.8, meltConcentrationCm3: 2.5e15, solidFraction: 0.95 }).value;
    expect(Math.abs(got - hand) / hand).toBeLessThan(1e-12);
  });
  it('⑤ ρ = 2πs(V/I): s = 1 mm, V/I = 10 Ω', () => {
    expect(bulkResistivityFourPoint({ vOverIOhm: 10, spacingCm: 0.1 }).value)
      .toBeCloseTo(2 * Math.PI * 0.1 * 10, 12);
  });
  it('⑥ 🔴 볼츠만 상수를 본문 표기(8.617e-5)로 되돌리면 Table 2 재현이 깨진다', () => {
    const printed = BOLTZMANN_AS_PRINTED.value;
    const withPrinted = 1.884e29 * Math.exp(-4.95 / (printed * SILICON_MELTING_POINT_K));
    const dev = Math.abs(withPrinted - 2.950e14) / 2.950e14;
    expect(dev).toBeGreaterThan(0.001);            // ±0.1 % 허용오차를 넘는다
    const withExact = equilibriumConcentration({ setId: 'G', species: 'I', tempK: SILICON_MELTING_POINT_K }).value;
    expect(Math.abs(withExact - 2.950e14) / 2.950e14).toBeLessThan(0.001);
  });
});

// ── A14-3 경계 안정성 ────────────────────────────────────────────────────────
describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('점결함: 5세트 × 2종 × 온도창 41점', () => {
    let n = 0;
    for (const setId of PARAMETER_SET_IDS) {
      for (const species of ['I', 'V'] as const) {
        for (let i = 0; i <= 40; i++) {
          const tempK = DEFECT_TEMP_RANGE_K[0]
            + ((DEFECT_TEMP_RANGE_K[1] - DEFECT_TEMP_RANGE_K[0]) * i) / 40;
          assertFinite(defectDiffusivity({ setId, species, tempK }), `D ${setId}/${species}@${tempK}`);
          assertFinite(equilibriumConcentration({ setId, species, tempK }), `C ${setId}/${species}@${tempK}`);
          assertFinite(transportCapacity({ setId, species, tempK }), `P ${setId}/${species}@${tempK}`);
          n += 3;
        }
      }
    }
    expect(n).toBe(5 * 2 * 41 * 3);
  });
  it('저항률: 인·붕소 유효창을 로그 스윕 61점 (양끝 포함)', () => {
    for (const [dopant, range] of [
      ['phosphorus', PHOSPHORUS_RHO_RANGE], ['boron', BORON_RHO_RANGE],
    ] as const) {
      const lo = Math.log10(range[0]);
      const hi = Math.log10(range[1]);
      for (let i = 0; i <= 60; i++) {
        const rho = Math.min(range[1], Math.pow(10, lo + ((hi - lo) * i) / 60));
        const n = dopantDensity({ dopant, rhoOhmCm: rho });
        assertFinite(n, `N ${dopant}@${rho}`);
        expect(n.value, `N ${dopant}@${rho} 는 양수여야 한다`).toBeGreaterThan(0);
        assertFinite(apparentMobility({ dopant, rhoOhmCm: rho }), `μ ${dopant}@${rho}`);
      }
    }
  });
  it('저항률: 도핑밀도가 저항률에 대해 단조 감소한다 (발산·역전 0건)', () => {
    for (const dopant of ['phosphorus', 'boron'] as const) {
      const range = dopant === 'phosphorus' ? PHOSPHORUS_RHO_RANGE : BORON_RHO_RANGE;
      const lo = Math.log10(range[0]);
      const hi = Math.log10(range[1]);
      let prev = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 120; i++) {
        const rho = Math.min(range[1], Math.pow(10, lo + ((hi - lo) * i) / 120));
        const n = dopantDensity({ dopant, rhoOhmCm: rho }).value;
        expect(n, `${dopant} ρ=${rho}`).toBeLessThan(prev);
        prev = n;
      }
    }
  });
  it('Scheil: 고화율 0~0.99 를 100점 스윕해도 유한하다', () => {
    for (const k0 of [0.023, 0.25, 0.35, 0.8, 1]) {
      for (let i = 0; i <= 100; i++) {
        const solidFraction = (SOLID_FRACTION_RANGE[1] * i) / 100;
        assertFinite(
          scheilAxialConcentration({ k0, meltConcentrationCm3: 5e18, solidFraction }),
          `C_s k0=${k0} X=${solidFraction}`,
        );
      }
    }
  });
  it('CZ·와이어쏘·V/G: 각 유효창 양끝과 중앙에서 유한하다', () => {
    for (const bound of ['low', 'high'] as const) {
      for (const d of [CRYSTAL_DIAMETER_RANGE_CM[0], 12, CRYSTAL_DIAMETER_RANGE_CM[1]]) {
        assertFinite(maxPullRate({ diameterCm: d, bound }), `V_max@${d}`);
      }
    }
    for (const v of [FEED_RATE_RANGE_MM_PER_MIN[0], 0.75, FEED_RATE_RANGE_MM_PER_MIN[1]]) {
      assertFinite(normalForceByFeedRate(v), `F_n(V_x)@${v}`);
    }
    for (const v of [WIRE_SPEED_RANGE_M_PER_S[0], 1.5, WIRE_SPEED_RANGE_M_PER_S[1]]) {
      assertFinite(normalForceByWireSpeed(v), `F_n(V_s)@${v}`);
    }
    for (let i = 0; i <= 50; i++) {
      const pullRateCmPerMin = (PULL_RATE_RANGE_CM_PER_MIN[1] * i) / 50;
      assertFinite(voronkovRatio({ pullRateCmPerMin, gradientKPerCm: 30 }), `ξ@${pullRateCmPerMin}`);
    }
  });
});

// ── A14-3b 한계선 초과는 계산하지 않고 정지한다 ────────────────────────────────
describe('A14-3b 범위 밖 입력은 OutOfLimitError 로 정지한다 (NaN 을 흘리지 않는다)', () => {
  it('저항률 상·하한 밖', () => {
    expect(() => dopantDensity({ dopant: 'phosphorus', rhoOhmCm: 5000 })).toThrow(OutOfLimitError);
    expect(() => dopantDensity({ dopant: 'boron', rhoOhmCm: 101 })).toThrow(OutOfLimitError);
  });
  it('점결함 동결 온도 아래', () => {
    expect(() => defectDiffusivity({ setId: 'A', species: 'I', tempK: 1000 })).toThrow(OutOfLimitError);
    expect(() => defectDiffusivity({ setId: 'A', species: 'I', tempK: 2000 })).toThrow(OutOfLimitError);
  });
  it('고화율 1 (수학적 특이점) · 직경 창 밖 · 이송속도 창 밖', () => {
    expect(() => scheilAxialConcentration({ k0: 0.8, meltConcentrationCm3: 1e15, solidFraction: 1 }))
      .toThrow(OutOfLimitError);
    expect(() => maxPullRate({ diameterCm: 45, bound: 'high' })).toThrow(OutOfLimitError);
    expect(() => normalForceByFeedRate(3)).toThrow(OutOfLimitError);
  });
  it('NaN·Infinity 입력도 정지시킨다', () => {
    expect(() => dopantDensity({ dopant: 'phosphorus', rhoOhmCm: Number.NaN })).toThrow(OutOfLimitError);
    expect(() => normalForceByWireSpeed(Number.POSITIVE_INFINITY)).toThrow(OutOfLimitError);
  });
  it('응력 포함 세트의 ξ_crit 은 근사하지 않고 거부한다', () => {
    expect(isStressedSet('I')).toBe(true);
    expect(() => voronkovCriticalRatio('I')).toThrow(/thermal stress/);
  });
});

// ── A14-4 단위 일관성 ────────────────────────────────────────────────────────
describe('A14-4 단위 일관성 — 모든 Quantity 가 단위·출처·범위를 갖는다', () => {
  const samples: Array<[string, Quantity, string]> = [
    ['D', defectDiffusivity(REF_DEFECT), 'cm²/s'],
    ['C^eq', equilibriumConcentration(REF_DEFECT), 'cm⁻³'],
    ['ξ_crit', voronkovCriticalRatio('A'), 'cm²·min⁻¹·K⁻¹'],
    ['ξ', voronkovRatio({ pullRateCmPerMin: 0.04, gradientKPerCm: 30 }), 'cm²·min⁻¹·K⁻¹'],
    ['N', dopantDensity({ dopant: 'phosphorus', rhoOhmCm: REF_RHO }), 'cm⁻³'],
    ['ρ', resistivityFromDensity({ dopant: 'boron', densityCm3: 3.6e15 }), 'Ω·cm'],
    ['μ', apparentMobility({ dopant: 'phosphorus', rhoOhmCm: REF_RHO }), 'cm²/V·s'],
    ['V_max', maxPullRate({ diameterCm: 20, bound: 'high' }), 'cm/h'],
    ['C_s', scheilAxialConcentration({ k0: 0.8, meltConcentrationCm3: 2.5e15, solidFraction: 0.5 }), 'cm⁻³'],
    ['C₀', meltConcentrationFromSolid({ k0: 0.25, solidConcentrationCm3: 1.3e18, solidFraction: 0.05 }), 'cm⁻³'],
    ['F_n(V_x)', normalForceByFeedRate(0.75), 'N'],
    ['F_n(V_s)', normalForceByWireSpeed(1.5), 'N'],
    ['ρ_probe', bulkResistivityFourPoint({ vOverIOhm: 10, spacingCm: 0.1 }), 'Ω·cm'],
  ];
  for (const [label, q, unit] of samples) {
    it(`${label} 의 단위는 ${unit} 이고 출처·유효범위·가정이 붙어 있다`, () => {
      expect(q.unit).toBe(unit);
      // 🔴 A6 정제(2026-08-20 오케스트레이터 판정): 「모든 Quantity 에 sourceId」가 아니다.
      //    문헌값에만 S번호가 있고, **합성값·운영규약에는 출처가 없는 것이 사실**이다.
      //    빌린 S번호를 달게 하던 종전 규칙이 8개 파일 83개 출력의 출처 도용을 낳았다.
      if (q.kind === 'literature') expect(q.sourceId ?? '').not.toBe('');
      else expect(q.sourceId).toBeUndefined();
      expect(q.validRange).toHaveLength(2);
      expect(q.validRange[0]).toBeLessThanOrEqual(q.validRange[1]);
      assertFinite(q, label);
    });
  }
  it('차원 검증: qρN = q · ρ · N 이 곱 피팅값과 같다', () => {
    const rho = 42;
    const n = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: rho }).value;
    const product = 1.602e-19 * rho * n;
    expect(product).toBeCloseTo(resistivityDensityProduct('phosphorus', rho, '23C'), 15);
  });
  it('차원 검증: μ · (q·N·ρ) = 1', () => {
    const rho = 42;
    const n = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: rho }).value;
    const mu = apparentMobility({ dopant: 'phosphorus', rhoOhmCm: rho }).value;
    expect(mu * 1.602e-19 * n * rho).toBeCloseTo(1, 12);
  });
  it('차원 검증: ξ = v/G 가 v 와 G 의 정의와 일치한다', () => {
    expect(voronkovRatio({ pullRateCmPerMin: 0.06, gradientKPerCm: 40 }).value).toBeCloseTo(0.0015, 15);
  });
  it('판정 일관성: ξ_crit 바로 아래·위에서 지배 결함이 갈린다', () => {
    const c = XI_CRIT_TYPICAL.value;
    expect(dominantDefectRegime(c * 0.999)).toBe('interstitial-rich');
    expect(dominantDefectRegime(c * 1.001)).toBe('vacancy-rich');
  });
});

// ── A14-5 원장이 금지한 것을 구현하지 않았다 ─────────────────────────────────
describe('A14-5 미확보 항목 처리 (원장 §4-2) — 금지된 것을 만들지 않았다', () => {
  it('M-1: 편석계수 k₀ 표를 제품 코드에 싣지 않았다 (호출자가 넘긴다) · 화면 출처 노출 금지 플래그', () => {
    expect(SEGREGATION_SOURCE_HIDDEN_IN_UI).toBe(true);
    const q = scheilAxialConcentration({ k0: 0.8, meltConcentrationCm3: 1e15, solidFraction: 0.5 });
    expect(q.assumptions.some((a) => a.includes('M-1') || a.includes('라이선스'))).toBe(true);
  });
  it('M-5: 커프 손실은 비율만 있고 µm 실측값이 없다', () => {
    expect(KERF_LOSS_FRACTION.value).toBe(0.4);
    expect(KERF_LOSS_FRACTION.unit).toBe('');
  });
  it('⚠ 융점 방사율 e 는 출처 간 불일치라 모델에 쓰지 않았고 가정에 명시했다', () => {
    const q = maxPullRate({ diameterCm: 12, bound: 'high' });
    expect(q.assumptions.some((a) => a.includes('방사율'))).toBe(true);
  });
});
