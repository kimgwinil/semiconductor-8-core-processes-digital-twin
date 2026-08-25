// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  DIE_AREA_UNIT_IN2, FLIP_CHIP_MIN_GF_PER_BUMP, BEAM_LEAD_MIN_GF_PER_MM,
  WIRE_PULL_DIAMETERS_IN, ballBondShearArea, dieShearRequirementKg,
  isTabulatedPullDiameter, wirePullRequirementGf,
} from '@/models/physics/packaging/bondStrength';
import {
  BOLTZMANN_EV_PER_K, CHI_SQUARE_60PCT_2_FAILURES, elfrFit, elfrPpm,
  temperatureAccelerationFactor, totalAccelerationFactor, voltageAccelerationFactor,
} from '@/models/physics/packaging/reliability';
import {
  MSL_LEVELS, acceleratedSoakApplicable, mslSpec, type MslLevel,
} from '@/models/physics/packaging/msl';
import {
  junctionTemperature, recommendedTestPowerW, thermalResistanceJA,
} from '@/models/physics/packaging/thermal';
import {
  LOW_SPEED_RANGE_MM_PER_S, HIGH_SPEED_THRESHOLD_MM_PER_S,
  classifyShearSpeed, guidanceFor,
} from '@/models/physics/packaging/solderBallShear';
import {
  singulatedChipFractureStrength, thinnedWaferFractureStrength,
} from '@/models/physics/packaging/waferThinning';
import {
  UNDERFILL_VALIDATION, capillaryPressure, referenceFillTimeS,
} from '@/models/physics/packaging/underfill';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체후공정_서지목록.md` §1(R1~R17) ·
 * `refs/공개출처_반도체전공정_서지목록.md` §1-6(R195~R202).
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 */

/** in² ↔ mm². 1 in = 25.4 mm (국제 인치 정의). 시험 설정이므로 테스트가 소유한다. */
const MM2_PER_IN2 = 25.4 * 25.4;

describe('R1 — S43 예제1: 다이 면적 0.0004 in² (0.02×0.02 in)', () => {
  const areaIn2 = 0.02 * 0.02;
  it('면적이 4×10⁻⁴ in² 로 환산된다', () => {
    expect(areaIn2 / DIE_AREA_UNIT_IN2).toBeCloseTo(4, 10);
  });
  it('1.0X = 0.16 kg', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '1.0X' }).value).toBeCloseTo(0.16, 10);
  });
  it('1.25X = 0.20 kg', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '1.25X' }).value).toBeCloseTo(0.2, 10);
  });
  it('2.0X = 0.32 kg', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '2.0X' }).value).toBeCloseTo(0.32, 10);
  });
});

describe('R2 — S43 예제2: 다이 면적 0.0016 in² (0.04×0.04 in)', () => {
  const areaIn2 = 0.04 * 0.04;
  it('1.0X / 1.25X / 2.0X = 0.64 / 0.80 / 1.28 kg', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '1.0X' }).value).toBeCloseTo(0.64, 10);
    expect(dieShearRequirementKg({ areaIn2, condition: '1.25X' }).value).toBeCloseTo(0.8, 10);
    expect(dieShearRequirementKg({ areaIn2, condition: '2.0X' }).value).toBeCloseTo(1.28, 10);
  });
});

describe('R3 — S43 NOTE 1: 다이 면적 100 mm² (= 1550×10⁻⁴ in²)', () => {
  const areaIn2 = 100 / MM2_PER_IN2;
  it('환산 면적이 1550×10⁻⁴ in² 다 (±0.5 %)', () => {
    const units = areaIn2 / DIE_AREA_UNIT_IN2;
    expect(Math.abs(units - 1550) / 1550).toBeLessThanOrEqual(0.005);
  });
  it('1.0X = 2.5 kg 로 고정된다', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '1.0X' }).value).toBe(2.5);
  });
  it('2.0X = 5.0 kg 로 고정된다', () => {
    expect(dieShearRequirementKg({ areaIn2, condition: '2.0X' }).value).toBe(5);
  });
  it('🔴 64×10⁻⁴ in² 를 넘는 순간 요구치가 2.5 kg 로 낮아진다(실재하는 불연속)', () => {
    // 부동소수 경계를 밟지 않도록 63.5 · 64.5 를 쓴다. 표의 경계 자체는 64 다.
    const below = dieShearRequirementKg({ areaIn2: 63.5 * DIE_AREA_UNIT_IN2, condition: '1.0X' }).value;
    const above = dieShearRequirementKg({ areaIn2: 64.5 * DIE_AREA_UNIT_IN2, condition: '1.0X' }).value;
    expect(below).toBeCloseTo(2.54, 10);
    expect(above).toBe(2.5);
    expect(above).toBeLessThan(below);
  });
  it('🔴 1.25X 의 대면적 고정값은 원장에 없다 — 지어내지 않고 거부한다', () => {
    expect(() => dieShearRequirementKg({ areaIn2, condition: '1.25X' })).toThrow(/원장에 없다/);
  });
});

describe('R4 · R5 — S42 TABLE I: 와이어 풀 최소 요구치', () => {
  it('R4: AU 0.0010 in · post-seal = 2.5 gf', () => {
    expect(wirePullRequirementGf({ material: 'AU', diameterIn: 0.001, stage: 'post-seal' }).value).toBe(2.5);
  });
  it('R5: AL 0.0015 in · pre-seal = 4.0 gf', () => {
    expect(wirePullRequirementGf({ material: 'AL', diameterIn: 0.0015, stage: 'pre-seal' }).value).toBe(4);
  });
  it('플립칩 5 gf/범프 · 빔리드 30 gf/mm', () => {
    expect(FLIP_CHIP_MIN_GF_PER_BUMP.value).toBe(5);
    expect(BEAM_LEAD_MIN_GF_PER_MM.value).toBe(30);
  });
  it('표 이산 직경 6종을 그대로 보유한다', () => {
    expect([...WIRE_PULL_DIAMETERS_IN]).toEqual([0.0007, 0.001, 0.00125, 0.0013, 0.0015, 0.003]);
    expect(isTabulatedPullDiameter(0.001)).toBe(true);
    expect(isTabulatedPullDiameter(0.002)).toBe(false);
  });
  it('🔴 원장에 없는 조합은 보간하지 않고 거부한다', () => {
    expect(() => wirePullRequirementGf({ material: 'AU', diameterIn: 0.0007, stage: 'pre-seal' }))
      .toThrow(/원장에 없다/);
  });
});

describe('R17 — S53 §4.3: 압착 볼 직경 70 µm → A = πd²/4 = 3,848 µm²', () => {
  it('면적이 3,848 µm² 다 (±0.1 %)', () => {
    const a = ballBondShearArea(70).value;
    expect(Math.abs(a - 3848) / 3848).toBeLessThanOrEqual(0.001);
  });
  it('식이 πd²/4 와 대수적으로 같다', () => {
    const d = 70;
    expect(ballBondShearArea(d).value).toBeCloseTo((Math.PI * d * d) / 4, 10);
  });
});

describe('R16 — 아레니우스 식 형태 교차검증 (S52 §2 · S54 식[1])', () => {
  it('k = 8.617×10⁻⁵ eV/K 를 채택한다', () => {
    expect(BOLTZMANN_EV_PER_K.value).toBe(8.617e-5);
  });
  it('E_aa 0.7 eV, T_U 25 °C(298.15 K) → T_A 125 °C(398.15 K) 에서 AF = 937.50 (±0.5 %)', () => {
    const af = temperatureAccelerationFactor({ activationEnergyEv: 0.7, tUseK: 298.15, tStressK: 398.15 }).value;
    expect(Math.abs(af - 937.5) / 937.5).toBeLessThanOrEqual(0.005);
  });
});

describe('R13 — S54 Annex A: 번인 가속계수', () => {
  const cond = {
    activationEnergyEv: 0.65, tUseK: 343, tStressK: 403,
    gammaVPerVolt: 5.5, vStress: 1.6, vUse: 1.2,
  };
  it('A_T = 26.4 (±0.5 %)', () => {
    const at = temperatureAccelerationFactor(cond).value;
    expect(Math.abs(at - 26.4) / 26.4).toBeLessThanOrEqual(0.005);
  });
  it('A_V = 9.03 (±0.5 %)', () => {
    const av = voltageAccelerationFactor(cond).value;
    expect(Math.abs(av - 9.03) / 9.03).toBeLessThanOrEqual(0.005);
  });
  it('A = A_T × A_V = 238.5 (±0.5 %)', () => {
    const a = totalAccelerationFactor(cond).value;
    expect(Math.abs(a - 238.5) / 238.5).toBeLessThanOrEqual(0.005);
  });
});

describe('R14 · R15 — S54 Annex A: ELFR', () => {
  const af = totalAccelerationFactor({
    activationEnergyEv: 0.65, tUseK: 343, tStressK: 403,
    gammaVPerVolt: 5.5, vStress: 1.6, vUse: 1.2,
  }).value;
  const fit = elfrFit({
    chiSquare: CHI_SQUARE_60PCT_2_FAILURES.value,
    accelerationFactor: af, sampleSize: 3000, testHours: 48,
  }).value;

  it('χ²(60 %, 자유도 6) = 6.21 을 원장값으로 보유한다', () => {
    expect(CHI_SQUARE_60PCT_2_FAILURES.value).toBe(6.21);
  });
  it('R14: ELFR = 90 FIT (±1 %)', () => {
    expect(Math.abs(fit - 90) / 90).toBeLessThanOrEqual(0.01);
  });
  it('R15: t_ELF = 4,380 / 5,840 / 8,760 h → 396 / 528 / 792 ppm (±1 %)', () => {
    const cases: Array<[number, number]> = [[4380, 396], [5840, 528], [8760, 792]];
    for (const [tElf, expected] of cases) {
      const ppm = elfrPpm({ fit, earlyLifePeriodH: tElf }).value;
      expect(Math.abs(ppm - expected) / expected, `t_ELF=${tElf}`).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('R199 — S248 J-STD-020F Table 4: MSL 등급별 플로어 라이프·표준 소킹', () => {
  const expected: Record<MslLevel, { floor: string; soakH: number; soakT: number; soakRh: number }> = {
    '1': { floor: '무제한', soakH: 168, soakT: 85, soakRh: 85 },
    '2': { floor: '1년', soakH: 168, soakT: 85, soakRh: 60 },
    '2a': { floor: '4주', soakH: 696, soakT: 30, soakRh: 60 },
    '3': { floor: '168 h', soakH: 192, soakT: 30, soakRh: 60 },
    '4': { floor: '72 h', soakH: 96, soakT: 30, soakRh: 60 },
    '5': { floor: '48 h', soakH: 72, soakT: 30, soakRh: 60 },
    '5a': { floor: '24 h', soakH: 48, soakT: 30, soakRh: 60 },
  };
  it('원장 R199 의 7개 등급을 그대로 보유한다', () => {
    expect([...MSL_LEVELS]).toEqual(['1', '2', '2a', '3', '4', '5', '5a']);
  });
  for (const level of Object.keys(expected) as MslLevel[]) {
    it(`Level ${level} — 플로어 라이프·소킹 조건이 표와 일치한다`, () => {
      const e = expected[level];
      const s = mslSpec(level);
      expect(s.floorLifeLabel).toBe(e.floor);
      expect(s.soakHours).toBe(e.soakH);
      expect(s.soakTempC).toBe(e.soakT);
      expect(s.soakRhPct).toBe(e.soakRh);
    });
  }
  it('🔴 M-25 — 가속 소킹은 E_a 0.30–0.39 / 0.40–0.48 eV 구간에서만, 필러 있는 EMC 에만 적용된다', () => {
    expect(acceleratedSoakApplicable({ moistureDiffusionEaEv: 0.35, moldCompoundHasFiller: true }).applicable).toBe(true);
    expect(acceleratedSoakApplicable({ moistureDiffusionEaEv: 0.44, moldCompoundHasFiller: true }).applicable).toBe(true);
    expect(acceleratedSoakApplicable({ moistureDiffusionEaEv: 0.395, moldCompoundHasFiller: true }).applicable).toBe(false);
    expect(acceleratedSoakApplicable({ moistureDiffusionEaEv: 0.35, moldCompoundHasFiller: false }).applicable).toBe(false);
  });
});

describe('R200 — S247 JESD51-2A 식 (1): θ_JA = (T_J − T_A)/P_H', () => {
  it('T_J 125 °C · T_A 25 °C · P 2 W → 50 °C/W', () => {
    expect(thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }).value).toBe(50);
  });
  it('역산이 대수 항등이다 — T_J = T_A + θ_JA·P', () => {
    const theta = thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }).value;
    expect(junctionTemperature({ tAmbientC: 25, thetaJA: theta, powerW: 2 }).value).toBeCloseTo(125, 10);
  });
});

describe('R201 — S247 JESD51-2A: θ_JA 구간별 권장 측정 전력', () => {
  const cases: Array<[number, number]> = [
    [150, 0.5], [101, 0.5], [99, 0.75], [61, 0.75],
    [59, 1], [31, 1], [29, 2], [21, 2], [19, 3], [16, 3],
  ];
  for (const [theta, watt] of cases) {
    it(`θ_JA = ${theta} °C/W → ${watt} W`, () => {
      expect(recommendedTestPowerW(theta).value).toBe(watt);
    });
  }
  it('🔴 표의 최저 경계(15 °C/W) 아래는 표준이 "etc" 로 남겼다 — 거부한다', () => {
    expect(() => recommendedTestPowerW(14)).toThrow();
  });
});

describe('R202 — S249 JESD22-B117B §4.7: 솔더볼 전단속도 구분', () => {
  it('저속(Condition A) 0.1–0.8 mm/s', () => {
    expect(LOW_SPEED_RANGE_MM_PER_S).toEqual([0.1, 0.8]);
    expect(classifyShearSpeed(0.1)).toBe('low');
    expect(classifyShearSpeed(0.8)).toBe('low');
  });
  it('고속(Condition B) > 50 mm/s', () => {
    expect(HIGH_SPEED_THRESHOLD_MM_PER_S).toBe(50);
    expect(classifyShearSpeed(50)).not.toBe('high');
    expect(classifyShearSpeed(50.1)).toBe('high');
  });
  it('두 구간 사이는 「표준 미규정」이다 — 저속·고속으로 몰아 넣지 않는다', () => {
    expect(classifyShearSpeed(10)).toBe('between');
    expect(classifyShearSpeed(0.05)).toBe('below-low');
  });
  it('Table 4.1 — 관심사 → 속도 → 파괴모드 매핑', () => {
    expect(guidanceFor('bulk-solder-strength')).toMatchObject({ recommendedSpeed: 'low', failureModes: ['1'] });
    expect(guidanceFor('interfacial-pad-strength')).toMatchObject({ recommendedSpeed: 'high', failureModes: ['2A'] });
    expect(guidanceFor('substrate-strength')).toMatchObject({ recommendedSpeed: 'high', failureModes: ['2B'] });
    expect(guidanceFor('pad-contamination')).toMatchObject({ recommendedSpeed: 'either', failureModes: ['3', '4'] });
    expect(guidanceFor('interfacial-solder-strength')).toMatchObject({ recommendedSpeed: 'high', failureModes: ['4'] });
    expect(guidanceFor('mechanical-shock')).toMatchObject({ recommendedSpeed: 'high', failureModes: ['2', '4'] });
  });
});

describe('R195 · R196 — S243: 박막화·싱귤레이션 파괴강도', () => {
  it('R195: Si(111) 60 µm 폴리싱, 3점 굽힘(스팬 2.4 mm · 1 mm/min) = 21.2 kgf (±10 %)', () => {
    const v = thinnedWaferFractureStrength({ thicknessUm: 60, thinning: 'polishing' }).value;
    expect(Math.abs(v - 21.2) / 21.2).toBeLessThanOrEqual(0.1);
  });
  it('R196: 60 µm 스텔스 다이싱 후 칩 = 153 kgf (±10 %)', () => {
    const v = singulatedChipFractureStrength({ thicknessUm: 60, singulation: 'stealth-dicing' }).value;
    expect(Math.abs(v - 153) / 153).toBeLessThanOrEqual(0.1);
  });
  it('🔴 원장에 없는 두께는 보간하지 않고 거부한다', () => {
    expect(() => thinnedWaferFractureStrength({ thicknessUm: 90, thinning: 'polishing' }))
      .toThrow(/원장에 없다/);
  });
});

describe('R197 — S241: 언더필 모세관 충전 (갭 214 µm)', () => {
  it('문헌 실측 충전시간 334 s 를 그대로 보유한다 (±5 %)', () => {
    const v = referenceFillTimeS(214).value;
    expect(Math.abs(v - 334) / 334).toBeLessThanOrEqual(0.05);
    expect(UNDERFILL_VALIDATION.simulationDeviationPct).toBe(1.48);
  });
  it('🔴 다른 갭의 충전시간은 추정하지 않는다 — S241 은 닫힌 형태의 충전시간 식을 인쇄하지 않았다', () => {
    expect(() => referenceFillTimeS(430)).toThrow(/추정하지 않는다/);
  });
  it('Young–Laplace Δp = 2σcosθ/h — FR4(35°) · σ 0.025 N/m · h 214 µm', () => {
    const hand = (2 * 0.025 * Math.cos((35 * Math.PI) / 180)) / (214e-6);
    expect(capillaryPressure({ gapUm: 214, substrate: 'FR4' }).value).toBeCloseTo(hand, 8);
  });
  it('접촉각이 작을수록(Al₂O₃ 25° < Cu 33° < FR4 35°) 모세관 구동압이 크다', () => {
    const p = (s: 'FR4' | 'Al2O3' | 'Cu') => capillaryPressure({ gapUm: 214, substrate: s }).value;
    expect(p('Al2O3')).toBeGreaterThan(p('Cu'));
    expect(p('Cu')).toBeGreaterThan(p('FR4'));
  });
});
