// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError } from '@/models/contract';
import {
  CU_PRESTON_KP, KP_RANGE, PRESSURE_RANGE_PA, VELOCITY_RANGE_MPS, MRR_RANGE_NM_PER_MIN,
  relativeVelocity, removalRate, prestonCoefficientFromRate, polishTime,
} from '@/models/physics/metal/cmp';
import {
  CU_RHO0, THICKNESS_RANGE_NM, WIDTH_RANGE_NM, FS_K_VALID_MIN, FS_K_WIDE_MIN,
  effectiveResistivityFS, effectiveResistivityFSLine, fsDimensionlessK, fsCoefficientForK,
  lineCharacteristicLengthNm, sizeEffectRatio, lineResistance, copperLineResistance,
} from '@/models/physics/metal/resistance';
import {
  sheetResistance, resistivityFromSheet, CF_INFINITE,
} from '@/models/physics/metal/fourPointProbe';
import {
  normalizedRcDelay, idealScalingCoefficient, delayRatioByDielectric, K_RANGE,
} from '@/models/physics/metal/rcDelay';
import {
  blackAccelerationFactor, copperBlechCriticalProduct, isImmortal,
  EM_BOLTZMANN_EV_PER_K, CURRENT_DENSITY_RANGE, TEMP_RANGE_K,
} from '@/models/physics/metal/electromigration';
import { FARADAY_CONSTANT, depositedMass, charge } from '@/models/physics/metal/electroplating';
import { metalModel } from '@/models/physics/metal/rules';

/**
 * 🔴 A14 — P6 금속배선.
 *   ① 결정론 ② 손계산 대조 3점 이상 ③ 경계 스윕에서 NaN·발산 0 ④ 단위 일관성.
 */

const BASE: Record<string, number> = {
  lineWidthNm: 100, lineThicknessNm: 100, lineLengthUm: 100,
  currentDensity1: 1e6, currentDensity2: 2e6,
  temperature1K: 400, temperature2K: 350,
  exponentN: 1.2, activationEnergyEv: 0.8,
  prestonCoefficient: 1.6e-13, cmpPressurePa: 24760, cmpVelocityMps: 1.089,
  targetRemovalNm: 500, dielectricConstant: 4.0,
  platingCurrentA: 1, platingTimeS: 1000, molarMassGPerMol: 63.546, valence: 2,
};

describe('A14-1 결정론 — 같은 입력이면 언제나 같은 출력', () => {
  it('metalModel 을 200회 호출해도 비트 단위로 동일하다', () => {
    const first = JSON.stringify(metalModel(BASE));
    for (let i = 0; i < 200; i++) {
      expect(JSON.stringify(metalModel(BASE))).toBe(first);
    }
  });
  it('개별 모델도 반복 호출에서 동일하다', () => {
    const a = effectiveResistivityFS({ thicknessNm: 37 }).value;
    const b = effectiveResistivityFS({ thicknessNm: 37 }).value;
    expect(a).toBe(b);
    expect(copperBlechCriticalProduct().value).toBe(copperBlechCriticalProduct().value);
    expect(idealScalingCoefficient().value).toBe(idealScalingCoefficient().value);
  });
});

describe('A14-2 손계산 대조 — 종이에서 계산한 값과 맞는가', () => {
  it('① 상대속도 V = 2π·(80/60)·0.130 = 1.0890854 m/s', () => {
    const hand = ((2 * Math.PI * 80) / 60) * 0.130;
    expect(relativeVelocity({ platenRpm: 80, headRpm: 80, centerDistanceMm: 130 }).value)
      .toBeCloseTo(hand, 12);
    expect(hand).toBeCloseTo(1.0890855, 6);
  });

  it('② Preston MRR = 1.6e-13 × 24760 Pa × 1.0890854 m/s = 258.87 nm/min', () => {
    const v = ((2 * Math.PI * 80) / 60) * 0.130;
    const handMetersPerSecond = 1.6e-13 * 24760 * v;
    const handNmPerMin = handMetersPerSecond * 1e9 * 60;
    const got = removalRate({ prestonCoefficient: CU_PRESTON_KP.value, pressurePa: 24760, velocityMps: v });
    expect(got.value).toBeCloseTo(handNmPerMin, 9);
    expect(got.value).toBeCloseTo(258.87, 2);
  });

  it('③ 배선 저항 R = 1.68e-8 × 100e-6 / (100e-9 × 100e-9) = 168 Ω', () => {
    const hand = (1.68e-8 * 100e-6) / (100e-9 * 100e-9);
    expect(hand).toBeCloseTo(168, 9);
    expect(lineResistance({ resistivityOhmM: 1.68e-8, lengthUm: 100, widthNm: 100, thicknessNm: 100 }).value)
      .toBeCloseTo(hand, 9);
  });

  it('④ FS 실효 저항률 ρ = 1.68e-8 × (1 + 0.375 × 40/100) = 1.932e-8 Ω·m', () => {
    const hand = 1.68e-8 * (1 + 0.375 * (40 / 100));
    expect(hand).toBeCloseTo(1.932e-8, 20);
    expect(effectiveResistivityFS({ thicknessNm: 100 }).value).toBeCloseTo(hand, 20);
  });

  it('④-2 S216 Eq.(8) 배선식 손계산 — W 85 · T 117 nm', () => {
    // 4·A/P = 4·85·117 / (2·(85+117)) = 39780/404 = 98.4653 nm → k = 2.46163 → 0.5<k≤4 → C = 0.474
    const d = (4 * 85 * 117) / (2 * (85 + 117));
    expect(d).toBeCloseTo(98.46535, 5);
    expect(lineCharacteristicLengthNm({ widthNm: 85, thicknessNm: 117 })).toBeCloseTo(d, 10);
    const k = d / 40;
    expect(k).toBeCloseTo(2.461634, 6);
    expect(fsDimensionlessK({ widthNm: 85, thicknessNm: 117 })).toBeCloseTo(k, 10);
    const hand = 1.68e-8 * (1 + 0.474 / k);
    expect(hand).toBeCloseTo(2.00348e-8, 12);
    expect(effectiveResistivityFSLine({ widthNm: 85, thicknessNm: 117 }).value).toBeCloseTo(hand, 20);
  });

  it('④-3 광폭 분기 손계산 — k > 4 면 계수가 3/8 로 돌아온다 (W 400 · T 117 nm)', () => {
    const d = (4 * 400 * 117) / (2 * (400 + 117));
    const k = d / 40;
    expect(k).toBeGreaterThan(FS_K_WIDE_MIN.value);
    const hand = 1.68e-8 * (1 + 0.375 / k);
    expect(effectiveResistivityFSLine({ widthNm: 400, thicknessNm: 117 }).value).toBeCloseTo(hand, 20);
  });

  it('⑤ Blech (jl)_crit = 2×41e6×1.18e-29 / (1.602176634e-19 × 1 × 2.25e-8) = 0.26841 A/µm', () => {
    const hand = (2 * 41e6 * 1.18e-29) / (1.602176634e-19 * 1 * 2.25e-8) / 1e6;
    expect(hand).toBeCloseTo(0.26841, 5);
    expect(copperBlechCriticalProduct().value).toBeCloseTo(hand, 12);
  });

  it('⑥ Black AF = (1e6/2e6)^1.2 × exp[(0.8/8.617e-5)(1/350 − 1/400)] = 11.988', () => {
    const hand = Math.pow(1e6 / 2e6, 1.2)
      * Math.exp((0.8 / 8.617e-5) * (1 / 350 - 1 / 400));
    const got = blackAccelerationFactor({
      currentDensity1: 1e6, currentDensity2: 2e6,
      temperature1K: 400, temperature2K: 350,
      exponentN: 1.2, activationEnergyEv: 0.8,
    });
    expect(got.value).toBeCloseTo(hand, 9);
    expect(got.value).toBeCloseTo(11.988, 3);
  });

  it('⑦ Faraday m = 63.546 × 1 A × 1000 s / (2 × 96485.33212) = 0.329303 g', () => {
    const hand = (63.546 * 1 * 1000) / (2 * FARADAY_CONSTANT.value);
    expect(hand).toBeCloseTo(0.3293, 4);
    expect(depositedMass({ currentA: 1, timeS: 1000, molarMassGPerMol: 63.546, valence: 2 }).value)
      .toBeCloseTo(hand, 12);
  });

  it('⑧ 면저항 R_s = 4.5324 × (0.005 V / 0.002 A) = 11.331 Ω/sq', () => {
    const hand = CF_INFINITE.value * (0.005 / 0.002);
    expect(hand).toBeCloseTo(11.331, 3);
    expect(sheetResistance({ voltageV: 0.005, currentA: 0.002 }).value).toBeCloseTo(hand, 10);
  });
});

describe('A14-3 경계 스윕 — NaN·Infinity·발산 0건', () => {
  const finite = (x: number) => Number.isFinite(x);

  it('Preston: K_p·P·V 전 구간 유한하고 단조 증가', () => {
    let prev = -1;
    for (let i = 0; i <= 60; i++) {
      const p = PRESSURE_RANGE_PA[0] + ((PRESSURE_RANGE_PA[1] - PRESSURE_RANGE_PA[0]) * i) / 60;
      const q = removalRate({
        prestonCoefficient: CU_PRESTON_KP.value, pressurePa: p, velocityMps: VELOCITY_RANGE_MPS[1],
      });
      expect(finite(q.value)).toBe(true);
      expect(q.outOfRange).toBe(false);
      expect(q.value).toBeGreaterThan(prev);
      prev = q.value;
    }
  });

  it('Preston: K_p 양 끝값에서도 유한', () => {
    for (const kp of KP_RANGE) {
      const q = removalRate({ prestonCoefficient: kp, pressurePa: PRESSURE_RANGE_PA[1], velocityMps: VELOCITY_RANGE_MPS[1] });
      expect(finite(q.value)).toBe(true);
      expect(q.outOfRange).toBe(false);
    }
  });

  it('FS 실효 저항률: 두께 5–1000 nm 전 구간 유한·단조 감소·벌크 초과', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 100; i++) {
      const t = THICKNESS_RANGE_NM[0] + ((THICKNESS_RANGE_NM[1] - THICKNESS_RANGE_NM[0]) * i) / 100;
      const rho = effectiveResistivityFS({ thicknessNm: t });
      expect(finite(rho.value)).toBe(true);
      expect(rho.outOfRange).toBe(false);
      expect(rho.value).toBeGreaterThan(CU_RHO0.value);
      expect(rho.value).toBeLessThan(prev);
      prev = rho.value;
      expect(sizeEffectRatio({ thicknessNm: t }).value).toBeGreaterThan(1);
      // 🔴 M-29: widthNm 을 주면 배선식으로 갈린다. 종전에는 이 인자가 조용히 무시됐다.
      if (t > 12) {
        const withWidth = sizeEffectRatio({ thicknessNm: t, widthNm: 60 });
        expect(finite(withWidth.value)).toBe(true);
        expect(withWidth.sourceId).toBe('S216');
        expect(withWidth.value).toBeGreaterThan(1);
      }
    }
  });

  it('배선 저항: 선폭 5 nm–100 µm 전 구간 유한 (ρ 는 호출자가 준다)', () => {
    for (let i = 0; i <= 100; i++) {
      const w = WIDTH_RANGE_NM[0] + ((WIDTH_RANGE_NM[1] - WIDTH_RANGE_NM[0]) * i) / 100;
      const r = lineResistance({ resistivityOhmM: CU_RHO0.value, lengthUm: 100, widthNm: w, thicknessNm: 50 });
      expect(finite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThan(0);
    }
  });

  /**
   * 🔴 2026-08-21 M-29 — `copperLineResistance` 의 스윕 하한이 5 → 12.5 nm 로 올라갔다.
   *    종전에는 ρ_eff 가 두께로만 정해져 선폭 5 nm 도 계산됐다. 지금은 S216 Eq.(8) 을 쓰므로
   *    `k = (4·A/P)/λ ≤ 0.5` 인 곳에서는 **논문이 계수를 주지 않아 계산을 거부**한다.
   *    W = 5 nm · T = 50 nm 면 k = 0.227 이다. 스윕 구간을 모델의 유효구간에 맞춘 것이고,
   *    유효구간 밖은 아래 별도 항목에서 **던지는지**를 단언한다 — 조용한 통과가 아니다.
   */
  it('Cu 배선 저항: S216 유효구간(k > 0.5) 안에서 선폭 전 구간 유한', () => {
    // T = 50 nm 에서 k = 0.5 가 되는 선폭이 정확히 12.5 nm 다(2·W·T/(W+T) = 20 nm).
    // 구간이 **열려 있으므로**(k > 0.5) 12.5 자체는 밖이다 — 한 눈금 안쪽에서 시작한다.
    const wMin = 12.6;
    for (let i = 0; i <= 100; i++) {
      const w = wMin + ((WIDTH_RANGE_NM[1] - wMin) * i) / 100;
      const r = copperLineResistance({ lengthUm: 100, widthNm: w, thicknessNm: 50 });
      expect(finite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThan(0);
    }
  });

  it('🔴 k ≤ 0.5 는 조용히 아무 값이나 내지 않고 던진다 (S216 이 계수를 주지 않는 구간)', () => {
    expect(fsDimensionlessK({ widthNm: 5, thicknessNm: 50 })).toBeLessThan(FS_K_VALID_MIN.value);
    expect(() => copperLineResistance({ lengthUm: 100, widthNm: 5, thicknessNm: 50 }))
      .toThrow(OutOfLimitError);
    expect(() => effectiveResistivityFSLine({ widthNm: 5, thicknessNm: 50 })).toThrow(OutOfLimitError);
    expect(() => fsCoefficientForK(FS_K_VALID_MIN.value)).toThrow(OutOfLimitError);   // 경계 자체도 밖
    expect(() => fsCoefficientForK(Number.NaN)).toThrow(OutOfLimitError);
  });

  it('배선식 ρ_eff: k > 0.5 인 선폭 전 구간 유한·단조 감소·벌크 초과 (T = 117 nm)', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 200; i++) {
      const w = 11 + ((WIDTH_RANGE_NM[1] - 11) * i) / 200;
      const rho = effectiveResistivityFSLine({ widthNm: w, thicknessNm: 117 });
      expect(finite(rho.value)).toBe(true);
      expect(rho.outOfRange).toBe(false);
      expect(rho.value).toBeGreaterThan(CU_RHO0.value);
      expect(rho.value).toBeLessThan(prev);
      prev = rho.value;
    }
  });

  it('EM AF: 전류밀도·온도 전 구간 유한(지수 발산 없음)', () => {
    for (let i = 0; i <= 40; i++) {
      const j = CURRENT_DENSITY_RANGE[0]
        + ((CURRENT_DENSITY_RANGE[1] - CURRENT_DENSITY_RANGE[0]) * i) / 40;
      const t = TEMP_RANGE_K[0] + ((TEMP_RANGE_K[1] - TEMP_RANGE_K[0]) * i) / 40;
      const af = blackAccelerationFactor({
        currentDensity1: 1e6, currentDensity2: j,
        temperature1K: 400, temperature2K: t,
        exponentN: 2, activationEnergyEv: 2.3,
      });
      expect(finite(af.value)).toBe(true);
      expect(af.value).toBeGreaterThan(0);
    }
  });

  it('RC 무차원 지연: 유전율 1–7 전 구간 유한·단조 증가', () => {
    let prev = -1;
    for (let i = 0; i <= 60; i++) {
      const k = K_RANGE[0] + ((K_RANGE[1] - K_RANGE[0]) * i) / 60;
      const d = normalizedRcDelay({
        dielectricConstant: k,
        lengthM: 1e-4, widthM: 1e-7, heightM: 1e-7, oxideThicknessM: 1e-7, spacingM: 1e-7,
      });
      expect(finite(d.value)).toBe(true);
      expect(d.value).toBeGreaterThan(prev);
      prev = d.value;
    }
  });

  it('연마시간: MRR 하한 근처에서도 발산하지 않고 범위 밖 플래그로 잡힌다', () => {
    const t = polishTime({ targetRemovalNm: 500, removalRateNmPerMin: MRR_RANGE_NM_PER_MIN[1] });
    expect(finite(t.value)).toBe(true);
    expect(t.value).toBeGreaterThan(0);
  });

  it('전기도금: 전류·시간 전 구간 유한·단조 증가', () => {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const m = depositedMass({
        currentA: i / 50 * 10, timeS: 1000, molarMassGPerMol: 63.546, valence: 2,
      });
      expect(finite(m.value)).toBe(true);
      expect(m.value).toBeGreaterThanOrEqual(prev);
      prev = m.value;
    }
  });
});

describe('A14-4 범위 밖 입력은 계산하지 않고 정지한다', () => {
  it('CMP 하중이 유효범위(4–66 kPa) 밖이면 OutOfLimitError', () => {
    expect(() => removalRate({
      prestonCoefficient: CU_PRESTON_KP.value, pressurePa: 1, velocityMps: 1,
    })).toThrow(OutOfLimitError);
    expect(() => removalRate({
      prestonCoefficient: CU_PRESTON_KP.value, pressurePa: 1e6, velocityMps: 1,
    })).toThrow(OutOfLimitError);
  });
  it('상대속도가 0.05–3.91 m/s 밖이면 정지', () => {
    expect(() => removalRate({
      prestonCoefficient: CU_PRESTON_KP.value, pressurePa: 24760, velocityMps: 10,
    })).toThrow(OutOfLimitError);
  });
  it('전류밀도가 EM 발생 하한(10⁴ A/cm²) 아래면 정지 — 그 아래는 EM 모델의 대상이 아니다', () => {
    expect(() => blackAccelerationFactor({
      currentDensity1: 1e3, currentDensity2: 1e6,
      temperature1K: 400, temperature2K: 400, exponentN: 2, activationEnergyEv: 0.8,
    })).toThrow(OutOfLimitError);
  });
  it('Black 지수 n 이 1–2 밖이면 정지 (S201 이 준 구간)', () => {
    expect(() => blackAccelerationFactor({
      currentDensity1: 1e6, currentDensity2: 1e6,
      temperature1K: 400, temperature2K: 400, exponentN: 3, activationEnergyEv: 0.8,
    })).toThrow(OutOfLimitError);
  });
  it('NaN 입력은 흘려보내지 않는다', () => {
    expect(() => effectiveResistivityFS({ thicknessNm: Number.NaN })).toThrow(OutOfLimitError);
    expect(() => delayRatioByDielectric({ kFrom: Number.NaN, kTo: 4 })).toThrow(OutOfLimitError);
  });
});

describe('A14-5 단위 일관성', () => {
  it('각 출력의 단위 라벨이 계약대로다', () => {
    expect(relativeVelocity({ platenRpm: 80, headRpm: 80, centerDistanceMm: 130 }).unit).toBe('m/s');
    expect(removalRate({ prestonCoefficient: 1.6e-13, pressurePa: 24760, velocityMps: 1 }).unit).toBe('nm/min');
    expect(effectiveResistivityFS({ thicknessNm: 100 }).unit).toBe('Ω·m');
    expect(effectiveResistivityFSLine({ widthNm: 100, thicknessNm: 100 }).unit).toBe('Ω·m');
    expect(lineResistance({ resistivityOhmM: 1.68e-8, lengthUm: 1, widthNm: 100, thicknessNm: 100 }).unit).toBe('Ω');
    expect(sheetResistance({ voltageV: 0.01, currentA: 0.001 }).unit).toBe('Ω/sq');
    expect(copperBlechCriticalProduct().unit).toBe('A/µm');
    expect(depositedMass({ currentA: 1, timeS: 10, molarMassGPerMol: 63.546, valence: 2 }).unit).toBe('g');
    expect(charge({ currentA: 1, timeS: 10 }).unit).toBe('C');
  });

  it('Preston 정·역방향이 서로의 역함수다 (단위 왕복 무손실)', () => {
    const mrr = removalRate({ prestonCoefficient: CU_PRESTON_KP.value, pressurePa: 24760, velocityMps: 1.089 }).value;
    const back = prestonCoefficientFromRate({ removalRateNmPerMin: mrr, pressurePa: 24760, velocityMps: 1.089 }).value;
    expect(back).toBeCloseTo(CU_PRESTON_KP.value, 20);
  });

  it('면저항 → 체적 저항률 → 면저항 왕복이 일치한다 (ρ = R_s·t)', () => {
    const rs = sheetResistance({ voltageV: 0.01, currentA: 0.001 }).value;
    const rho = resistivityFromSheet({ sheetOhmPerSq: rs, thicknessNm: 200 }).value; // Ω·cm
    // t = 200 nm = 2e-5 cm
    expect(rho / 2e-5).toBeCloseTo(rs, 6);
  });

  it('무차원 지연은 ε₀·ρ 를 뺀 값이므로 형상만 같으면 유전율에 비례한다', () => {
    const g = { lengthM: 1e-4, widthM: 1e-7, heightM: 1e-7, oxideThicknessM: 1e-7, spacingM: 1e-7 };
    const a = normalizedRcDelay({ ...g, dielectricConstant: 2 }).value;
    const b = normalizedRcDelay({ ...g, dielectricConstant: 4 }).value;
    expect(b / a).toBeCloseTo(2, 12);
  });

  it('볼츠만 상수는 eV/K 이고 E_a 는 eV — 지수부가 무차원이다', () => {
    expect(EM_BOLTZMANN_EV_PER_K.unit).toBe('eV/K');
    const af = blackAccelerationFactor({
      currentDensity1: 1e6, currentDensity2: 1e6,
      temperature1K: 300, temperature2K: 300, exponentN: 2, activationEnergyEv: 1.2,
    });
    expect(af.value).toBeCloseTo(1, 12);
    expect(af.unit).toBe('');
  });

  it('Blech 불멸 판정 — j·l 이 임계곱보다 작으면 불멸', () => {
    const jl = copperBlechCriticalProduct().value;
    // j = 1e6 A/cm², l = 1 µm → j·l = 1e6/1e8 = 0.01 A/µm < 0.268 → 불멸
    expect(isImmortal({ currentDensityAPerCm2: 1e6, lengthUm: 1, criticalProductAPerUm: jl })).toBe(true);
    // l = 100 µm → 1.0 A/µm > 0.268 → 불멸 아님
    expect(isImmortal({ currentDensityAPerCm2: 1e6, lengthUm: 100, criticalProductAPerUm: jl })).toBe(false);
  });
});
