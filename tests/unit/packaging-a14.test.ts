// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError, type Quantity } from '@/models/contract';
import {
  junctionTemperature, recommendedTestPowerW, testBoardWidthMm, thermalResistanceJA,
  THETA_TABLE_RANGE,
} from '@/models/physics/packaging/thermal';
import {
  MSL_HOURLY_LEVELS, MSL_LEVELS, floorLifeHours, mslSpec, standardSoakHours,
} from '@/models/physics/packaging/msl';
import {
  BOLTZMANN_EV_PER_K, BURN_IN_HOURS_RANGE, CHI_SQUARE_60PCT_2_FAILURES,
  elfrFit, elfrPpm, equivalentUseHours, fitIsExpressible,
  temperatureAccelerationFactor, totalAccelerationFactor, voltageAccelerationFactor,
} from '@/models/physics/packaging/reliability';
import {
  DIE_AREA_UNIT_IN2, ballBondShearArea, dieShearRequirementKg, shearStrengthPerArea,
  wirePullRequirementGf, type DieShearCondition,
} from '@/models/physics/packaging/bondStrength';
import {
  GAP_RANGE_UM, UNDERFILL_SUBSTRATES, apparentViscosity, capillaryPressure, referenceFillTimeS,
} from '@/models/physics/packaging/underfill';
import {
  classifyShearSpeed, shearSpeedClassIndex,
} from '@/models/physics/packaging/solderBallShear';
import {
  singulatedChipFractureStrength, thinnedWaferFractureStrength,
} from '@/models/physics/packaging/waferThinning';
import { PACKAGING_RULES, packagingModel } from '@/models/physics/packaging/rules';

/**
 * 🔴 A14 — 계산 정확성 (규약 §0-3). 패키징(P8) 전용.
 *  1. 결정론   — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조 (골든 테스트와 별도로 대표 3점 이상 고정)
 *  3. 경계 안정성 — 전 파라미터 min·max·경계에서 NaN·Infinity·발산 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위·출처·유효범위를 갖고 차원이 맞는다
 */

const BURN_IN = {
  activationEnergyEv: 0.65, tUseK: 343, tStressK: 403,
  gammaVPerVolt: 5.5, vStress: 1.6, vUse: 1.2,
};

const DIRECTION_BASE = {
  thetaJaCPerW: 40, powerW: 1, ambientTempC: 25, dieAreaUnits: 16, mslHourlyIndex: 0,
  useTempK: 343, stressTempK: 403, activationEnergyEv: 0.65, sampleSize: 3000,
  testHours: 48, chiSquare: 6.21, earlyLifePeriodH: 5840, ballDiameterUm: 70,
  gapUm: 214, shearRatePerS: 10, shearSpeedMmPerS: 0.5,
};

// ───────────────────────────── A14-1 결정론 ─────────────────────────────

describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('θ_JA 를 200회 반복해도 비트 단위로 같다', () => {
    const first = thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }).value;
    for (let i = 0; i < 200; i++) {
      expect(thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }).value).toBe(first);
    }
  });
  it('총 가속계수를 200회 반복해도 비트 단위로 같다', () => {
    const first = totalAccelerationFactor(BURN_IN).value;
    for (let i = 0; i < 200; i++) expect(totalAccelerationFactor(BURN_IN).value).toBe(first);
  });
  it('볼 전단 면적·모세관압·다이 전단 요구치가 200회 반복해도 같다', () => {
    const a = ballBondShearArea(70).value;
    const p = capillaryPressure({ gapUm: 214, substrate: 'FR4' }).value;
    const d = dieShearRequirementKg({ areaIn2: 0.0016, condition: '1.0X' }).value;
    for (let i = 0; i < 200; i++) {
      expect(ballBondShearArea(70).value).toBe(a);
      expect(capillaryPressure({ gapUm: 214, substrate: 'FR4' }).value).toBe(p);
      expect(dieShearRequirementKg({ areaIn2: 0.0016, condition: '1.0X' }).value).toBe(d);
    }
  });
  it('시각을 바꿔도(=호출 시점이 달라도) 값이 변하지 않는다', async () => {
    const a = elfrFit({ chiSquare: 6.21, accelerationFactor: 238.5, sampleSize: 3000, testHours: 48 }).value;
    await new Promise((r) => setTimeout(r, 20));
    expect(elfrFit({ chiSquare: 6.21, accelerationFactor: 238.5, sampleSize: 3000, testHours: 48 }).value).toBe(a);
  });
  it('방향성 어댑터도 결정론이다', () => {
    const first = JSON.stringify(packagingModel({ ...DIRECTION_BASE }));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(packagingModel({ ...DIRECTION_BASE }))).toBe(first);
    }
  });
});

// ─────────────────────── A14-2 손계산 대조 (3점 이상) ───────────────────────

describe('A14-2 수치 정확성 — 손계산 대조 6점', () => {
  it('① θ_JA = (T_J − T_A)/P = (125 − 25)/2 = 50 °C/W', () => {
    expect(thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }).value)
      .toBeCloseTo((125 - 25) / 2, 12);
  });
  it('② A_T = exp[(0.65/8.617e-5)(1/343 − 1/403)]', () => {
    const hand = Math.exp((0.65 / 8.617e-5) * (1 / 343 - 1 / 403));
    expect(temperatureAccelerationFactor(BURN_IN).value).toBeCloseTo(hand, 10);
    expect(BOLTZMANN_EV_PER_K.value).toBe(8.617e-5);
  });
  it('③ A_V = exp[5.5 × (1.6 − 1.2)] = exp(2.2)', () => {
    expect(voltageAccelerationFactor(BURN_IN).value).toBeCloseTo(Math.exp(2.2), 12);
  });
  it('④ A = πd²/4, d = 70 µm', () => {
    expect(ballBondShearArea(70).value).toBeCloseTo((Math.PI * 70 * 70) / 4, 10);
  });
  it('⑤ 다이 전단 비례구간: 0.04 kg × 16 = 0.64 kg', () => {
    expect(dieShearRequirementKg({ areaIn2: 16 * DIE_AREA_UNIT_IN2, condition: '1.0X' }).value)
      .toBeCloseTo(0.04 * 16, 12);
  });
  it('⑥ η = m·γ̇^(n−1) = 0.54 × 10^0.22', () => {
    expect(apparentViscosity(10).value).toBeCloseTo(0.54 * Math.pow(10, 0.22), 12);
  });
  it('⑦ ELFR(FIT) = 1e9 × 6.21 / (2 × 238.5 × 3000 × 48)', () => {
    const hand = (1e9 * 6.21) / (2 * 238.5 * 3000 * 48);
    expect(elfrFit({ chiSquare: 6.21, accelerationFactor: 238.5, sampleSize: 3000, testHours: 48 }).value)
      .toBeCloseTo(hand, 8);
  });
});

// ───────────────────── A14-3 경계 안정성 (NaN·발산 0건) ─────────────────────

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
}

describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('θ_JA 15 → 500 °C/W · 전력 0.1 → 10 W 를 격자 스윕', () => {
    let n = 0;
    for (let i = 0; i <= 40; i++) {
      const theta = THETA_TABLE_RANGE[0] + ((500 - THETA_TABLE_RANGE[0]) * i) / 40;
      assertFinite(recommendedTestPowerW(theta), `power@θ=${theta}`);
      for (let j = 0; j <= 20; j++) {
        const p = 0.1 + (9.9 * j) / 20;
        assertFinite(junctionTemperature({ tAmbientC: 25, thetaJA: theta, powerW: p }), `Tj@${theta},${p}`);
        assertFinite(thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: p }), `θ@${p}`);
        n++;
      }
    }
    expect(n).toBe(41 * 21);
  });

  it('다이 면적 0.01 → 5,000 (×10⁻⁴ in²) × 조건 3종 (1.25X 대면적은 거부가 정상)', () => {
    const conditions: DieShearCondition[] = ['1.0X', '1.25X', '2.0X'];
    let evaluated = 0;
    let refused = 0;
    for (const condition of conditions) {
      for (let i = 0; i <= 120; i++) {
        const units = 0.01 * Math.pow(5000 / 0.01, i / 120);
        try {
          const q = dieShearRequirementKg({ areaIn2: units * DIE_AREA_UNIT_IN2, condition });
          assertFinite(q, `dieShear@${units},${condition}`);
          expect(q.value).toBeGreaterThan(0);
          evaluated++;
        } catch (e) {
          // 1.25X 대면적은 원장에 값이 없어 거부하는 것이 정상 동작이다
          expect((e as Error).message).toMatch(/원장에 없다/);
          refused++;
        }
      }
    }
    expect(evaluated).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });

  it('볼 직경 0.1 → 500 µm 에서 면적·단위면적당 강도가 유한하고 단조 증가/감소한다', () => {
    let prevArea = -1;
    for (let i = 0; i <= 100; i++) {
      const d = 0.1 + (499.9 * i) / 100;
      const area = ballBondShearArea(d);
      assertFinite(area, `area@${d}`);
      expect(area.value).toBeGreaterThan(prevArea);
      prevArea = area.value;
      assertFinite(shearStrengthPerArea({ shearForceGf: 30, ballDiameterUm: d }), `strength@${d}`);
    }
  });

  it('언더필 갭 200 → 600 µm × 기재 3종 · 전단속도 1e-3 → 1e5 1/s', () => {
    for (const substrate of UNDERFILL_SUBSTRATES) {
      for (let i = 0; i <= 40; i++) {
        const gapUm = GAP_RANGE_UM[0] + ((GAP_RANGE_UM[1] - GAP_RANGE_UM[0]) * i) / 40;
        const q = capillaryPressure({ gapUm, substrate });
        assertFinite(q, `Δp@${gapUm},${substrate}`);
        expect(q.value).toBeGreaterThan(0);
      }
    }
    for (let i = 0; i <= 80; i++) {
      const rate = Math.pow(10, -3 + (8 * i) / 80);
      assertFinite(apparentViscosity(rate), `η@${rate}`);
    }
  });

  it('번인: 스트레스 온도 300 → 500 K · E_aa 0 → 2 eV · 시험시간 48 → 168 h', () => {
    for (let i = 0; i <= 40; i++) {
      const tStressK = 300 + (200 * i) / 40;
      for (let j = 0; j <= 10; j++) {
        const activationEnergyEv = (2 * j) / 10;
        const af = totalAccelerationFactor({ ...BURN_IN, tStressK, activationEnergyEv });
        assertFinite(af, `A@${tStressK},${activationEnergyEv}`);
        for (let k = 0; k <= 8; k++) {
          const testHours = BURN_IN_HOURS_RANGE[0]
            + ((BURN_IN_HOURS_RANGE[1] - BURN_IN_HOURS_RANGE[0]) * k) / 8;
          assertFinite(equivalentUseHours({ accelerationFactor: af.value, testHours }), `tU@${testHours}`);
          const fit = elfrFit({
            chiSquare: CHI_SQUARE_60PCT_2_FAILURES.value,
            accelerationFactor: af.value, sampleSize: 3000, testHours,
          });
          assertFinite(fit, `FIT@${tStressK},${activationEnergyEv},${testHours}`);
          assertFinite(elfrPpm({ fit: fit.value, earlyLifePeriodH: 8760 }), 'ppm');
        }
      }
    }
  });

  it('전단속도 1e-4 → 1e4 mm/s 에서 구분 지수가 유한하고 단조 증가한다', () => {
    let prev = -1;
    for (let i = 0; i <= 80; i++) {
      const v = Math.pow(10, -4 + (8 * i) / 80);
      const q = shearSpeedClassIndex(v);
      assertFinite(q, `class@${v}`);
      expect(q.value).toBeGreaterThanOrEqual(prev);
      prev = q.value;
    }
    expect(prev).toBe(3);
  });

  it('MSL 전 등급 조회가 유한하고, 시간 규정 등급만 시간값을 준다', () => {
    for (const level of MSL_LEVELS) {
      const spec = mslSpec(level);
      expect(Number.isFinite(spec.soakHours)).toBe(true);
      assertFinite(standardSoakHours(level), `soak@${level}`);
      if (spec.floorLifeHours === undefined) {
        expect(() => floorLifeHours(level)).toThrow(/원장에 없다/);
      } else {
        assertFinite(floorLifeHours(level), `floor@${level}`);
      }
    }
    expect([...MSL_HOURLY_LEVELS]).toEqual(['3', '4', '5', '5a']);
  });

  it('범위 밖 입력은 NaN 을 흘리지 않고 OutOfLimitError 로 정지한다', () => {
    expect(() => thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 0 })).toThrow(OutOfLimitError);
    expect(() => junctionTemperature({ tAmbientC: 25, thetaJA: -1, powerW: 1 })).toThrow(OutOfLimitError);
    expect(() => recommendedTestPowerW(14.9)).toThrow(OutOfLimitError);
    expect(() => ballBondShearArea(0)).toThrow(OutOfLimitError);
    expect(() => capillaryPressure({ gapUm: 199, substrate: 'FR4' })).toThrow(OutOfLimitError);
    expect(() => capillaryPressure({ gapUm: 601, substrate: 'FR4' })).toThrow(OutOfLimitError);
    expect(() => elfrFit({ chiSquare: 6.21, accelerationFactor: 1, sampleSize: 100, testHours: 24 }))
      .toThrow(OutOfLimitError);
    expect(() => elfrFit({ chiSquare: 6.21, accelerationFactor: 1, sampleSize: 100, testHours: 200 }))
      .toThrow(OutOfLimitError);
    expect(() => temperatureAccelerationFactor({ activationEnergyEv: 0.65, tUseK: 0, tStressK: 403 }))
      .toThrow(OutOfLimitError);
    expect(() => temperatureAccelerationFactor({ activationEnergyEv: Number.NaN, tUseK: 343, tStressK: 403 }))
      .toThrow(OutOfLimitError);
  });
});

// ───────────────────────── A14-4 단위 일관성 ─────────────────────────

describe('A14-4 단위 일관성 — 모든 Quantity 가 단위·출처·유효범위를 갖는다', () => {
  const samples: Array<[string, Quantity, string]> = [
    ['θ_JA', thermalResistanceJA({ tJunctionC: 125, tAmbientC: 25, powerW: 2 }), '°C/W'],
    ['T_J', junctionTemperature({ tAmbientC: 25, thetaJA: 50, powerW: 2 }), '°C'],
    ['권장 전력', recommendedTestPowerW(40), 'W'],
    ['시험 PCB 폭', testBoardWidthMm(30), 'mm'],
    ['플로어 라이프', floorLifeHours('3'), 'h'],
    ['표준 소킹', standardSoakHours('3'), 'h'],
    ['다이 전단 요구치', dieShearRequirementKg({ areaIn2: 0.0016, condition: '1.0X' }), 'kg'],
    ['와이어 풀 요구치', wirePullRequirementGf({ material: 'AU', diameterIn: 0.001, stage: 'post-seal' }), 'gf'],
    ['볼 전단 면적', ballBondShearArea(70), 'µm²'],
    ['A_T', temperatureAccelerationFactor(BURN_IN), ''],
    ['A_V', voltageAccelerationFactor(BURN_IN), ''],
    ['A', totalAccelerationFactor(BURN_IN), ''],
    ['등가 사용시간', equivalentUseHours({ accelerationFactor: 238.5, testHours: 48 }), 'h'],
    ['ELFR FIT', elfrFit({ chiSquare: 6.21, accelerationFactor: 238.5, sampleSize: 3000, testHours: 48 }), 'FIT'],
    ['ELFR ppm', elfrPpm({ fit: 90, earlyLifePeriodH: 5840 }), 'ppm'],
    ['박막화 파괴강도', thinnedWaferFractureStrength({ thicknessUm: 60, thinning: 'polishing' }), 'kgf'],
    ['싱귤레이션 파괴강도', singulatedChipFractureStrength({ thicknessUm: 60, singulation: 'stealth-dicing' }), 'kgf'],
    ['모세관압', capillaryPressure({ gapUm: 214, substrate: 'FR4' }), 'Pa'],
    ['겉보기 점도', apparentViscosity(10), 'Pa·s'],
    ['충전시간', referenceFillTimeS(214), 's'],
    ['전단속도 구분', shearSpeedClassIndex(0.5), ''],
  ];

  for (const [label, q, unit] of samples) {
    it(`${label} — 단위 "${unit}" · 출처 · 유효범위가 붙어 있다`, () => {
      expect(q.unit).toBe(unit);
      expect(q.sourceId).toMatch(/^S\d+/);
      expect(q.validRange).toHaveLength(2);
      expect(Number.isFinite(q.value)).toBe(true);
      expect(q.grade).toBeDefined();
    });
  }

  it('차원 일관: T_A + θ_JA·P 가 θ_JA 정의식과 왕복 일치한다', () => {
    const theta = 37.5;
    const tj = junctionTemperature({ tAmbientC: 30, thetaJA: theta, powerW: 1.6 }).value;
    expect(thermalResistanceJA({ tJunctionC: tj, tAmbientC: 30, powerW: 1.6 }).value).toBeCloseTo(theta, 10);
  });

  it('차원 일관: 등가 사용시간 = A × t_A 이고, FIT 은 시료·시간에 반비례한다', () => {
    const af = totalAccelerationFactor(BURN_IN).value;
    expect(equivalentUseHours({ accelerationFactor: af, testHours: 48 }).value).toBeCloseTo(af * 48, 8);
    const base = elfrFit({ chiSquare: 6.21, accelerationFactor: af, sampleSize: 3000, testHours: 48 }).value;
    const doubled = elfrFit({ chiSquare: 6.21, accelerationFactor: af, sampleSize: 6000, testHours: 48 }).value;
    expect(doubled).toBeCloseTo(base / 2, 10);
  });

  it('차원 일관: 단위면적당 전단강도 × 면적 = 전단력', () => {
    const d = 70;
    const per = shearStrengthPerArea({ shearForceGf: 30, ballDiameterUm: d }).value;
    expect(per * ballBondShearArea(d).value).toBeCloseTo(30, 10);
  });

  it('전단속도 구분과 지수가 서로 모순되지 않는다', () => {
    expect(classifyShearSpeed(0.5)).toBe('low');
    expect(shearSpeedClassIndex(0.5).value).toBe(1);
    expect(shearSpeedClassIndex(100).value).toBe(3);
  });

  it('와이불 형상모수 m ≠ 1 이면 FIT 으로 표현할 수 없다(S54 §5.2)', () => {
    expect(fitIsExpressible(1)).toBe(true);
    expect(fitIsExpressible(0.5)).toBe(false);
  });

  it('모든 방향성 규칙의 선언 출력이 어댑터에 실재한다', () => {
    const out = packagingModel({ ...DIRECTION_BASE });
    for (const rule of PACKAGING_RULES) {
      for (const e of rule.expect) {
        expect(out[e.output], `${rule.id}: 출력 "${e.output}" 없음`).toBeTypeOf('number');
        expect(Number.isFinite(out[e.output] as number)).toBe(true);
      }
    }
  });
});
