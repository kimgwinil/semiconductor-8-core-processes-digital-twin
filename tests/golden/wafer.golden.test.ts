// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  dopantDensity, resistivityDensityProduct, resistivityFromDensity,
} from '@/models/physics/wafer/resistivity';
import {
  defectDiffusivity, equilibriumConcentration, voronkovCriticalRatio,
  SILICON_MELTING_POINT_K, XI_CRIT_TYPICAL, XI_CRIT_ADJUSTED_RANGE,
  type ParameterSetId,
} from '@/models/physics/wafer/pointDefect';
import {
  maxPullRate, meltConcentrationFromSolid, scheilAxialConcentration,
} from '@/models/physics/wafer/czochralski';
import {
  normalForceByFeedRate, normalForceByWireSpeed,
  WIRE_SAW_FEED_COEFFICIENTS, WIRE_SAW_SPEED_COEFFICIENTS,
} from '@/models/physics/wafer/wireSaw';
import { bulkResistivityFourPoint } from '@/models/physics/wafer/probe';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-1 (R101~R106).
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 */

const T0 = SILICON_MELTING_POINT_K;

// ─────────────────────────────────────────────────────────────────────────────
// R101 · R102 — S101 Table 1 → Table 2. 융점에서의 D 와 C^eq. 허용 ±0.1 %
// ─────────────────────────────────────────────────────────────────────────────
interface DefectRow { dI: number; dV: number; cI: number; cV: number }

/** S101 Table 2 (융점값). D 는 10⁻⁴ cm²/s, C^eq 는 10¹⁴ cm⁻³ 단위로 인쇄돼 있다. */
const TABLE2: Record<ParameterSetId, DefectRow> = {
  A: { dI: 6.898e-4, dV: 1.390e-4, cI: 7.030e14, cV: 8.850e14 },
  C: { dI: 5.000e-4, dV: 0.445e-4, cI: 4.840e14, cV: 6.490e14 },
  F: { dI: 3.734e-4, dV: 0.338e-4, cI: 6.917e14, cV: 8.520e14 },
  G: { dI: 9.250e-4, dV: 1.370e-4, cI: 2.950e14, cV: 4.550e14 },
  I: { dI: 0.887e-4, dV: 0.541e-4, cI: 6.301e14, cV: 6.407e14 },
};

const TOL_DEFECT = 0.001; // ±0.1 %
const rel = (got: number, want: number): number => Math.abs(got - want) / want;

function checkSet(setId: ParameterSetId, e: DefectRow): void {
  it(`세트 ${setId} — Dᴵ = ${e.dI.toExponential(3)} cm²/s`, () => {
    expect(rel(defectDiffusivity({ setId, species: 'I', tempK: T0 }).value, e.dI))
      .toBeLessThanOrEqual(TOL_DEFECT);
  });
  it(`세트 ${setId} — Dⱽ = ${e.dV.toExponential(3)} cm²/s`, () => {
    expect(rel(defectDiffusivity({ setId, species: 'V', tempK: T0 }).value, e.dV))
      .toBeLessThanOrEqual(TOL_DEFECT);
  });
  it(`세트 ${setId} — C_Iᵉq = ${e.cI.toExponential(3)} cm⁻³`, () => {
    expect(rel(equilibriumConcentration({ setId, species: 'I', tempK: T0 }).value, e.cI))
      .toBeLessThanOrEqual(TOL_DEFECT);
  });
  it(`세트 ${setId} — C_Vᵉq = ${e.cV.toExponential(3)} cm⁻³`, () => {
    expect(rel(equilibriumConcentration({ setId, species: 'V', tempK: T0 }).value, e.cV))
      .toBeLessThanOrEqual(TOL_DEFECT);
  });
}

describe('R101 — S101 세트 A(2000-Nakamura) 융점 점결함 4점 (±0.1 %)', () => {
  checkSet('A', TABLE2.A);
});

describe('R102 — S101 세트 C·F·G·I 융점 점결함 16점 (±0.1 %)', () => {
  for (const setId of ['C', 'F', 'G', 'I'] as ParameterSetId[]) {
    checkSet(setId, TABLE2[setId]);
  }
});

describe('R101·R102 보강 — 융점 T₀ 는 1685 K 다 (S101 §3.1)', () => {
  it('T₀ = 1685 K', () => {
    expect(SILICON_MELTING_POINT_K).toBe(1685);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S101 Table 4 — Voronkov 임계비 ξ_crit (식 7). 🔴 A6 고정 목록 A6L-01
// ─────────────────────────────────────────────────────────────────────────────
describe('S101 Table 4 「orig.」 — 식 (7)이 표의 ξ_crit 을 재현한다 (무응력 세트, ±1 %)', () => {
  // 단위 10⁻³ cm²·min⁻¹·K⁻¹
  const expected: Array<[ParameterSetId, number]> = [
    ['A', 1.22], ['C', 1.63], ['F', 1.35], ['G', 2.32],
  ];
  for (const [setId, want] of expected) {
    it(`세트 ${setId} — ξ_crit = ${want} ×10⁻³`, () => {
      const got = voronkovCriticalRatio(setId).value;
      expect(rel(got, want * 1e-3)).toBeLessThanOrEqual(0.01);
    });
  }
  it('🔴 응력 포함 세트(I)는 식 (7)만으로 재현되지 않으므로 거부한다 — 근사하지 않는다', () => {
    expect(() => voronkovCriticalRatio('I')).toThrow(/thermal stress/);
  });
  it('🔴 A6L-01 — ξ_crit 전형값 1.3×10⁻³ 은 Table 4 「adj.」 창(0.85~1.50×10⁻³) 안에 있다', () => {
    expect(XI_CRIT_TYPICAL.value).toBe(1.3e-3);
    expect(XI_CRIT_TYPICAL.value).toBeGreaterThanOrEqual(XI_CRIT_ADJUSTED_RANGE[0]);
    expect(XI_CRIT_TYPICAL.value).toBeLessThanOrEqual(XI_CRIT_ADJUSTED_RANGE[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R103 — S100 Table 9(23 °C, ρ 기준열). 저항률 → 인 도핑밀도. 허용 ±5 %
// ─────────────────────────────────────────────────────────────────────────────
describe('R103 — S100 저항률↔도핑밀도(인) 4점 (±5 %)', () => {
  // 원장이 기록한 재계산 편차: −0.85 / −0.59 / +1.69 / +3.42 %
  const cases: Array<[number, number, number]> = [
    [158.6, 2.701e13, -0.0085],
    [110.3, 3.893e13, -0.0059],
    [9.184, 4.769e14, 0.0169],
    [5.699, 7.646e14, 0.0342],
  ];
  for (const [rho, wantN, wantDev] of cases) {
    it(`ρ = ${rho} Ω·cm → N = ${wantN.toExponential(3)} cm⁻³`, () => {
      const got = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: rho }).value;
      expect(rel(got, wantN)).toBeLessThanOrEqual(0.05);
      // 🔴 원장에 기록된 편차를 그대로 고정한다. 계수를 잘못 옮기면 여기서 먼저 깨진다.
      expect((got - wantN) / wantN).toBeCloseTo(wantDev, 3);
    });
  }
  it('저농도에서 곱 qρN 이 거의 일정하다 — 이동도 포화 영역 (S100 §7)', () => {
    const a = resistivityDensityProduct('phosphorus', 158.6, '23C');
    const b = resistivityDensityProduct('phosphorus', 110.3, '23C');
    expect(rel(a, b)).toBeLessThanOrEqual(0.01);
  });
  it('300 K 열과 23 °C 열은 서로 다른 피팅이다 (혼용 금지)', () => {
    const at23 = resistivityDensityProduct('phosphorus', 10, '23C');
    const at300 = resistivityDensityProduct('phosphorus', 10, '300K');
    expect(at23).not.toBe(at300);
  });
});

describe('T1 — 저항률↔도핑밀도 왕복 항등 (역산은 정방향 식의 수치 역함수다)', () => {
  for (const rho of [0.01, 1, 10, 500]) {
    it(`ρ = ${rho} Ω·cm 왕복 오차 < 1e-9`, () => {
      const n = dopantDensity({ dopant: 'phosphorus', rhoOhmCm: rho }).value;
      const back = resistivityFromDensity({ dopant: 'phosphorus', densityCm3: n }).value;
      expect(rel(back, rho)).toBeLessThan(1e-9);
    });
  }
  it('붕소도 왕복이 닫힌다', () => {
    const n = dopantDensity({ dopant: 'boron', rhoOhmCm: 6.283185307179586 }).value;
    const back = resistivityFromDensity({ dopant: 'boron', densityCm3: n }).value;
    expect(rel(back, 6.283185307179586)).toBeLessThan(1e-9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R104 — Scheil 축방향 편석 (산소). 허용 ±2 %
// ─────────────────────────────────────────────────────────────────────────────
describe('R104 — Scheil 산소 축방향 분포 (±2 %)', () => {
  // k₀(O) = 0.25 는 호출자가 넘기는 값이다 — 편석계수 표를 제품 코드에 싣지 않는다(M-1).
  const k0 = 0.25;
  it('x = 0.05 에서 C_s = 1.3×10¹⁸ 이면 C₀ = 5.0×10¹⁸ cm⁻³', () => {
    const c0 = meltConcentrationFromSolid({
      k0, solidConcentrationCm3: 1.3e18, solidFraction: 0.05,
    }).value;
    expect(rel(c0, 5.0e18)).toBeLessThanOrEqual(0.02);
  });
  it('그 C₀ 로 x = 0.4 에서 C_s = 1.83×10¹⁸ cm⁻³', () => {
    const c0 = meltConcentrationFromSolid({
      k0, solidConcentrationCm3: 1.3e18, solidFraction: 0.05,
    }).value;
    const cs = scheilAxialConcentration({
      k0, meltConcentrationCm3: c0, solidFraction: 0.4,
    }).value;
    expect(rel(cs, 1.83e18)).toBeLessThanOrEqual(0.02);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R105 — 4점 프로브 + Scheil 복합 (붕소). 허용 ±3 %
// ─────────────────────────────────────────────────────────────────────────────
describe('R105 — 4점 프로브 + Scheil 붕소 복합 예제 (±3 %)', () => {
  const k0 = 0.8;
  const rhoSeed = bulkResistivityFourPoint({ vOverIOhm: 10, spacingCm: 0.1 }).value;

  it('S = 1 mm, V/I = 10 Ω → ρ_seed = 6.3 Ω·cm', () => {
    expect(rel(rhoSeed, 6.3)).toBeLessThanOrEqual(0.03);
  });
  it('ρ_seed → N_seed = 2×10¹⁵ cm⁻³ (문헌은 유효숫자 1자리로 인쇄)', () => {
    const n = dopantDensity({ dopant: 'boron', rhoOhmCm: rhoSeed }).value;
    // 🔴 문헌값 2×10¹⁵ 는 유효숫자 1자리다. S100 식 (3)은 2.14×10¹⁵ 을 준다(+7 %).
    //    1자리로 반올림하면 일치한다 — 그 사실을 그대로 고정한다.
    expect(Number(n.toPrecision(1))).toBe(2e15);
  });
  it('N_seed = 2×10¹⁵ → C₀ = 2.5×10¹⁵ cm⁻³', () => {
    const c0 = meltConcentrationFromSolid({
      k0, solidConcentrationCm3: 2e15, solidFraction: 0,
    }).value;
    expect(rel(c0, 2.5e15)).toBeLessThanOrEqual(0.03);
  });
  it('X = 0.95 에서 C_s = 3.6×10¹⁵ cm⁻³', () => {
    const cs = scheilAxialConcentration({
      k0, meltConcentrationCm3: 2.5e15, solidFraction: 0.95,
    }).value;
    expect(rel(cs, 3.6e15)).toBeLessThanOrEqual(0.03);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R106 — 와이어쏘 절삭 법선력 계수. 허용 ±2 %
// ─────────────────────────────────────────────────────────────────────────────
describe('R106 — S104 식 (2) 와이어쏘 법선력 두 피팅 (±2 %)', () => {
  it('① 이송속도 피팅: K = 3.253, α = 0.568 (V_s = 1.5 m/s 고정)', () => {
    expect(WIRE_SAW_FEED_COEFFICIENTS.k).toBeCloseTo(3.253, 6);
    expect(WIRE_SAW_FEED_COEFFICIENTS.alpha).toBeCloseTo(0.568, 6);
    expect(WIRE_SAW_FEED_COEFFICIENTS.fixedWireSpeedMPerS).toBe(1.5);
    // F_n(V_x = 1) = K 여야 한다 (1^α = 1) — 계수가 그대로 드러나는 지점
    expect(rel(normalForceByFeedRate(1).value, 3.253)).toBeLessThanOrEqual(0.02);
  });
  it('② 와이어속도 피팅: K = 2.794, β = −0.455 (V_x = 0.75 mm/min 고정)', () => {
    expect(WIRE_SAW_SPEED_COEFFICIENTS.k).toBeCloseTo(2.794, 6);
    expect(WIRE_SAW_SPEED_COEFFICIENTS.beta).toBeCloseTo(-0.455, 6);
    expect(WIRE_SAW_SPEED_COEFFICIENTS.fixedFeedMmPerMin).toBe(0.75);
    expect(rel(normalForceByWireSpeed(1).value, 2.794)).toBeLessThanOrEqual(0.02);
  });
  it('🔴 두 피팅은 독립이라 공통 조건에서 어긋난다 — 억지로 맞추지 않았다는 사실을 고정', () => {
    const viaFeed = normalForceByFeedRate(0.75).value;   // 2.763 N
    const viaSpeed = normalForceByWireSpeed(1.5).value;  // 2.323 N
    expect(viaFeed).toBeCloseTo(2.763, 2);
    expect(viaSpeed).toBeCloseTo(2.323, 2);
    expect(rel(viaFeed, viaSpeed)).toBeGreaterThan(0.15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S106 — CZ 최대 인상속도. 원장 §3-1
// ─────────────────────────────────────────────────────────────────────────────
describe('S106 §A.1 · Fig. 3 — V_max ∝ r^(−1/2), ⌀12 cm 에서 20–30 cm/h', () => {
  it('기준 직경 12 cm 에서 띠가 20–30 cm/h 다', () => {
    expect(maxPullRate({ diameterCm: 12, bound: 'low' }).value).toBeCloseTo(20, 10);
    expect(maxPullRate({ diameterCm: 12, bound: 'high' }).value).toBeCloseTo(30, 10);
  });
  it('직경을 4배로 하면 V_max 가 절반이 된다 (지수 −1/2 의 정의)', () => {
    const at12 = maxPullRate({ diameterCm: 12, bound: 'high' }).value;
    const at24 = maxPullRate({ diameterCm: 24, bound: 'high' }).value;
    expect(at12 / at24).toBeCloseTo(Math.SQRT2, 10);
  });
  it('300 mm(⌀30 cm) 에서 19.0 cm/h 이하로 떨어진다', () => {
    expect(maxPullRate({ diameterCm: 30, bound: 'high' }).value).toBeLessThan(19.0);
  });
});
