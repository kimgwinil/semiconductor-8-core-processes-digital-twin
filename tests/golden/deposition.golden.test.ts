// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  ALD_CYCLE_TIME_S, ALD_WINDOW_GPC_ANGSTROM, aldThicknessAngstrom, cyclesForThickness, gpcAt,
} from '@/models/physics/deposition/ald';
import {
  arrheniusDiffusivityLiteratureK, driveInTime, junctionDepthErfc, junctionDepthGaussian,
  predepositionDose,
} from '@/models/physics/deposition/diffusion';
import { erfcInv } from '@/models/physics/deposition/specialFunctions';
import {
  nuclearStoppingFactor, nuclearStoppingReduced, reducedEnergy, sputterYield, thresholdEnergy,
  CU_SURFACE_BINDING_EV,
} from '@/models/physics/deposition/sputter';
import {
  B_100KEV_INTO_SI, annealedStraggle, beamCurrentA, junctionDepthDeep, junctionDepthShallow,
  peakConcentration, projectedRange, rangeStraggle, totalIons, waferAreaCm2,
} from '@/models/physics/deposition/implant';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-5 (R150~R159).
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 */

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

/** 섭씨→켈빈. 🔴 물리층에는 이 상수를 두지 않는다(어느 원장에도 없다). 테스트 설정으로만 쓴다. */
const K0 = 273.15;

describe('R159 — S186: 열 ALD Al₂O₃ GPC (그래프 판독 ±10 %)', () => {
  const expected: Array<[number, number]> = [[80, 0.9], [100, 1.0], [150, 1.1], [250, 1.1]];
  for (const [tempC, gpc] of expected) {
    it(`${tempC} °C → ${gpc} Å/cycle`, () => {
      expect(rel(gpcAt(tempC).value, gpc)).toBeLessThanOrEqual(0.10);
    });
  }
  it('🔴 ALD 창(150 °C 초과)에서 GPC 는 평탄하다 — 150 °C 와 250 °C 가 같은 값이다', () => {
    expect(gpcAt(150).value).toBe(gpcAt(250).value);
    expect(gpcAt(150).value).toBe(ALD_WINDOW_GPC_ANGSTROM);
  });
  it('창 안의 비측정 온도는 보간이 아니라 본문이 명시한 평탄값이다', () => {
    expect(gpcAt(200).value).toBe(ALD_WINDOW_GPC_ANGSTROM);
  });
  it('창 아래 비측정 온도(120 °C)는 보간하지 않고 거부한다', () => {
    expect(() => gpcAt(120)).toThrow(/보간하지 않는다/);
  });
  it('두께는 사이클 수에 선형이다 — t = GPC × N', () => {
    expect(aldThicknessAngstrom({ tempC: 200, cycles: 200 }).value).toBeCloseTo(1.1 * 200, 10);
    expect(cyclesForThickness({ tempC: 200, targetAngstrom: 240 }).value).toBeCloseTo(240 / 1.1, 10);
  });
  it('S186 레시피 1 사이클 = 83 s (TMA 1 + Ar 40 + H₂O 2 + Ar 40)', () => {
    expect(ALD_CYCLE_TIME_S).toBe(83);
  });
});

describe('R155 — S182 Example 8.1: P 확산 erfc 무한소스 (975 °C, 1800 s)', () => {
  const D = 1e-13, t = 1800, cs = 1e21;
  it('(a) N_A = 6.3×10¹⁶ → z = 2.83, x_j = 0.76 µm (±3 %)', () => {
    expect(rel(erfcInv(6.3e16 / cs), 2.826)).toBeLessThanOrEqual(0.03);
    const xj = junctionDepthErfc({ csPerCm3: cs, cbPerCm3: 6.3e16, dCm2PerS: D, timeS: t }).value;
    expect(rel(xj, 0.76)).toBeLessThanOrEqual(0.03);
  });
  it('(b) N_A = 6.8×10¹⁴ → z = 3.47, x_j = 0.94 µm (±3 %)', () => {
    expect(rel(erfcInv(6.8e14 / cs), 3.47)).toBeLessThanOrEqual(0.03);
    const xj = junctionDepthErfc({ csPerCm3: cs, cbPerCm3: 6.8e14, dCm2PerS: D, timeS: t }).value;
    expect(rel(xj, 0.94)).toBeLessThanOrEqual(0.03);
  });
});

describe('R156 — S182 Example 8.2: B predep(erfc) → drive-in(가우시안) (±5 %)', () => {
  const csA = 3.8e20, dA = 1.5e-15, tA = 900, substrate = 1e17;
  it('(a) predep 950 °C 900 s → x_j = 0.06 µm', () => {
    const xj = junctionDepthErfc({ csPerCm3: csA, cbPerCm3: substrate, dCm2PerS: dA, timeS: tA }).value;
    expect(rel(xj, 0.06)).toBeLessThanOrEqual(0.05);
  });
  it('(a) 도즈 Q = 5×10¹⁴ cm⁻²', () => {
    const q = predepositionDose({ csPerCm3: csA, dCm2PerS: dA, timeS: tA }).value;
    expect(rel(q, 5e14)).toBeLessThanOrEqual(0.05);
  });
  it('(b) drive-in 1250 °C 3600 s (D = 1.2×10⁻¹²) → x_j = 2.5 µm', () => {
    const q = predepositionDose({ csPerCm3: csA, dCm2PerS: dA, timeS: tA }).value;
    const xj = junctionDepthGaussian({ doseCm2: q, dCm2PerS: 1.2e-12, timeS: 3600, cbPerCm3: substrate }).value;
    expect(rel(xj, 2.5)).toBeLessThanOrEqual(0.05);
  });
});

describe('R157 ⚠️ — S182 Example 8.3: 「문헌 상수 고정 테스트」 (k = 8.36×10⁻⁵ eV/K)', () => {
  // 🔴 이 describe 블록은 **일반 아레니우스 검증이 아니다.** S182 본문 상수로만 재현되는 값을 고정한다.
  //    회사 정본 k = 8.617×10⁻⁵ 로 계산하면 D 가 약 2.8배 커진다 — 그래서 함수 자체를 분리해 두었다.
  const d0 = 0.76, ea = 3.46;
  const dPredep = arrheniusDiffusivityLiteratureK({ d0Cm2PerS: d0, eaEv: ea, tempK: 950 + K0 }).value;
  const dDrive = arrheniusDiffusivityLiteratureK({ d0Cm2PerS: d0, eaEv: ea, tempK: 1250 + K0 }).value;

  it('D(950 °C) = 1.527×10⁻¹⁵ cm²/s (±1 %)', () => {
    expect(rel(dPredep, 1.527e-15)).toBeLessThanOrEqual(0.01);
  });
  it('D(1250 °C) = 1.193×10⁻¹² cm²/s (±1 %)', () => {
    expect(rel(dDrive, 1.193e-12)).toBeLessThanOrEqual(0.01);
  });
  it('predep 900 s → x_j = 0.0605 µm (±3 %)', () => {
    const xj = junctionDepthErfc({ csPerCm3: 3.8e20, cbPerCm3: 1e17, dCm2PerS: dPredep, timeS: 900 }).value;
    expect(rel(xj, 0.0605)).toBeLessThanOrEqual(0.03);
  });
  it('도즈 Q = 5.03×10¹⁴ cm⁻² (±3 %)', () => {
    const q = predepositionDose({ csPerCm3: 3.8e20, dCm2PerS: dPredep, timeS: 900 }).value;
    expect(rel(q, 5.03e14)).toBeLessThanOrEqual(0.03);
  });
  it('목표 Dt = 9×10⁻⁹ cm² → drive-in 126 min (±3 %)', () => {
    const seconds = driveInTime({ dtTargetCm2: 9e-9, dCm2PerS: dDrive }).value;
    expect(rel(seconds / 60, 126)).toBeLessThanOrEqual(0.03);
  });
});

describe('R158 ⚠️ — S185(정식 출판본 ADNDT 31, 1984): He⁺ → Cu, 1 keV 중간값 (±2 %)', () => {
  const ion = { z1: 2, m1: 4, z2: 29, m2: 63.55 };
  const eps = reducedEnergy({ ...ion, energyEv: 1000 }).value;
  it('환산에너지 ε = 0.159', () => {
    expect(rel(eps, 0.159)).toBeLessThanOrEqual(0.02);
  });
  it('환산 핵정지능 s_n = 0.3920', () => {
    expect(rel(nuclearStoppingReduced(eps).value, 0.3920)).toBeLessThanOrEqual(0.02);
  });
  it('핵정지단면 환산계수 K = 8.76', () => {
    expect(rel(nuclearStoppingFactor(ion).value, 8.76)).toBeLessThanOrEqual(0.02);
  });
  it('임계에너지 E_th = 21.9 eV (U_s(Cu) = 3.49 eV)', () => {
    const eth = thresholdEnergy({ m1: ion.m1, m2: ion.m2, surfaceBindingEv: CU_SURFACE_BINDING_EV }).value;
    expect(rel(eth, 21.9)).toBeLessThanOrEqual(0.02);
  });
  it('🔴 최종 수율 Y 는 골든값이 아니다 — 구현하지 않고 명시적으로 던진다', () => {
    expect(() => sputterYield()).toThrow(/미구현/);
  });
  it('🔴 핵정지능은 ε 에 대해 최댓값을 가진다(단봉)', () => {
    const low = nuclearStoppingReduced(0.05).value;
    const peak = nuclearStoppingReduced(0.33).value;
    const high = nuclearStoppingReduced(2).value;
    expect(peak).toBeGreaterThan(low);
    expect(peak).toBeGreaterThan(high);
  });
});

describe('R154 — S181 Table 9.1: B 100 keV → Si 정착점 (정확 일치)', () => {
  it('R_p = 2968 Å · σ_p = 735 Å', () => {
    expect(B_100KEV_INTO_SI.rpAngstrom).toBe(2968);
    expect(B_100KEV_INTO_SI.straggleAngstrom).toBe(735);
  });
  it('🔴 에너지별 range 표는 만들지 않았다 — 호출하면 조달 사유와 함께 던진다', () => {
    expect(() => projectedRange()).toThrow(/미조달/);
    expect(() => rangeStraggle()).toThrow(/미조달/);
  });
});

describe('R150 — S180 Example 1: B → Si, 80 keV, Φ = 1×10¹⁴ cm⁻²', () => {
  const args = { doseCm2: 1e14, rpUm: 0.24, deltaRpUm: 0.063, substrateCm3: 2e16 };
  it('피크 농도 N_p = 6.3×10¹⁸ cm⁻³ (±2 %)', () => {
    expect(rel(peakConcentration(args).value, 6.3e18)).toBeLessThanOrEqual(0.02);
  });
  it('깊은 접합 x_j = 0.45 µm (±2 %)', () => {
    expect(rel(junctionDepthDeep(args).value, 0.45)).toBeLessThanOrEqual(0.02);
  });
  it('🔴 얕은 접합은 +0.026 µm 로 **양수**다 — 문헌의 「음수라 버린다」 서술이 틀렸다', () => {
    const shallow = junctionDepthShallow(args).value;
    expect(shallow).toBeGreaterThan(0);
    expect(rel(shallow, 0.026)).toBeLessThanOrEqual(0.05);
  });
});

describe('R151 — S180 Example 2: P → Si, 100 keV, 목표 x_j = 0.3 µm', () => {
  const dose = 3.4e14, rpUm = 0.12, deltaRpUm = 0.045, substrateCm3 = 1e16;
  it('문헌 도즈 3.4×10¹⁴ 를 넣으면 N_p = 3×10¹⁹ cm⁻³ (±3 %)', () => {
    expect(rel(peakConcentration({ doseCm2: dose, deltaRpUm }).value, 3e19)).toBeLessThanOrEqual(0.03);
  });
  it('그때 접합깊이가 목표 0.3 µm 로 돌아온다 (±3 %)', () => {
    const xj = junctionDepthDeep({ doseCm2: dose, rpUm, deltaRpUm, substrateCm3 }).value;
    expect(rel(xj, 0.3)).toBeLessThanOrEqual(0.03);
  });
});

describe('R152 ⚠️ — S180 Example 3: 문헌 오류 2건을 고친 값으로 고정한다', () => {
  // ① 도즈 10¹⁶ → 10¹³ (풀이 전 과정이 10¹³ 을 쓴다)  ② 어닐 후 피크농도 지수 오기 → 4.0×10¹⁷
  const dose = 1e13, rpUm = 0.3, deltaRpUm = 0.07, substrateCm3 = 1e16;
  it('주입 직후 N_p = 5.7×10¹⁷ cm⁻³ (±3 %)', () => {
    expect(rel(peakConcentration({ doseCm2: dose, deltaRpUm }).value, 5.7e17)).toBeLessThanOrEqual(0.03);
  });
  it('주입 직후 접합 2개 = 0.1 / 0.5 µm (±3 %)', () => {
    const a = { doseCm2: dose, rpUm, deltaRpUm, substrateCm3 };
    expect(rel(junctionDepthShallow(a).value, 0.1)).toBeLessThanOrEqual(0.03);
    expect(rel(junctionDepthDeep(a).value, 0.5)).toBeLessThanOrEqual(0.03);
  });

  // 어닐 1000 °C × 30 min → Dt = 2.5×10⁻¹¹ cm²
  const sigma = annealedStraggle({ deltaRpUm, dCm2PerS: 2.5e-11, timeS: 1 }).value;
  it('어닐 후 유효 straggle σ′ = √(ΔR_p² + 2Dt) ≈ 0.0995 µm', () => {
    expect(rel(sigma, 0.0995)).toBeLessThanOrEqual(0.02);
  });
  it('어닐 후 N_p = 4.0×10¹⁷ cm⁻³ (±3 %) — 인쇄된 4.7×10⁻¹⁷ 는 지수 오기다', () => {
    expect(rel(peakConcentration({ doseCm2: dose, deltaRpUm: sigma }).value, 4.0e17))
      .toBeLessThanOrEqual(0.03);
  });
  it('어닐 후 접합 2개 = 0.03 / 0.57 µm (±3 %)', () => {
    const a = { doseCm2: dose, rpUm, deltaRpUm: sigma, substrateCm3 };
    expect(rel(junctionDepthShallow(a).value, 0.03)).toBeLessThanOrEqual(0.03);
    expect(rel(junctionDepthDeep(a).value, 0.57)).toBeLessThanOrEqual(0.03);
  });
});

describe('R153 — S181 Example 9.1: B 100 keV, Φ = 5×10¹⁵, ⌀200 mm, 90 s', () => {
  const dose = 5e15;
  const area = waferAreaCm2(20).value;
  it('피크 농도 n₀ = 2.85×10²⁰ cm⁻³ (±2 %)', () => {
    expect(rel(peakConcentration({ doseCm2: dose, deltaRpUm: 0.07 }).value, 2.85e20))
      .toBeLessThanOrEqual(0.02);
  });
  it('총 이온수 = 1.57×10¹⁸ (±2 %)', () => {
    expect(rel(totalIons({ doseCm2: dose, areaCm2: area }).value, 1.57e18)).toBeLessThanOrEqual(0.02);
  });
  it('빔 전류 = 2.8 mA (±3 %)', () => {
    const amps = beamCurrentA({ doseCm2: dose, areaCm2: area, timeS: 90, chargeState: 1 }).value;
    expect(rel(amps * 1000, 2.8)).toBeLessThanOrEqual(0.03);
  });
});
