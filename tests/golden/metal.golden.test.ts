// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  CU_PRESTON_KP, CU_KP_RANGE, CU_KP_CONTACT_14KPA, CU_KP_CONTACT_48KPA,
  PRESTON_TABLE, prestonCoefficientOf, prestonCoefficientFromRate, relativeVelocity, removalRate,
  R165_PRESSURE_KPA, R165_PLATEN_RPM, R165_HEAD_RPM, R165_CENTER_DISTANCE_MM,
  R165_MRR_NM_PER_MIN, R165_WIWNU_PERCENT,
} from '@/models/physics/metal/cmp';
import {
  CF_INFINITE, diameterCorrection, thicknessCorrection, sheetResistance,
} from '@/models/physics/metal/fourPointProbe';
import {
  CU_RHO0, CU_MEAN_FREE_PATH_NM, CU_RHO0_TIMES_MFP, FS_COEFFICIENT,
  FS_AREA_PERIMETER_FACTOR, FS_K_WIDE_MIN, FS_K_VALID_MIN,
  FS_COEFFICIENT_WIDE, FS_COEFFICIENT_MID,
  effectiveResistivityFS, effectiveResistivityFSLine, lineResistance,
  lineCharacteristicLengthNm, fsDimensionlessK, fsCoefficientForK,
} from '@/models/physics/metal/resistance';
import {
  DISTRIBUTED_RC_FACTOR, FRINGE_KI, idealScalingCoefficient, normalizedRcDelay,
  delayRatioByDielectric, K_SIO2, K_FSG, K_SICOH_MIN, K_SICOH_MAX,
  K_POROUS_MIN, K_POROUS_MAX, K_AIRGAP_EFFECTIVE, K_SIN_CAP,
} from '@/models/physics/metal/rcDelay';
import {
  EM_ACTIVATION_ENERGY, BLACK_N_AL, BLACK_N_CU_MIN, BLACK_N_CU_MAX,
  EM_BOLTZMANN_EV_PER_K, blackAccelerationFactor, copperBlechCriticalProduct,
  BLECH_CU_SIGMA_CRIT_MPA, BLECH_CU_ATOMIC_VOLUME, BLECH_CU_RESISTIVITY, BLECH_CU_Z_STAR,
} from '@/models/physics/metal/electromigration';
import { FARADAY_CONSTANT, depositedMass } from '@/models/physics/metal/electroplating';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-5 (R165~R173).
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 */

const A_PER_UM_TO_A_PER_CM = 1e4;

describe('R165 — S200 Table 2 + Fig. 10: Cu CMP 제거율 (Preston)', () => {
  // 🔴 본문의 "27.46 kPa" 가 아니라 **Table 2 의 24.76 kPa** 가 정본이다(원장 §1-5 주석).
  const pressurePa = R165_PRESSURE_KPA.value * 1e3;
  const velocity = relativeVelocity({
    platenRpm: R165_PLATEN_RPM.value,
    headRpm: R165_HEAD_RPM.value,
    centerDistanceMm: R165_CENTER_DISTANCE_MM.value,
  });

  it('문헌 조건이 원장 그대로다 (24.76 kPa · 80/80 rpm · 130 mm · 302.5 nm/min · WIWNU 6.47 %)', () => {
    expect(R165_PRESSURE_KPA.value).toBe(24.76);
    expect(R165_PLATEN_RPM.value).toBe(80);
    expect(R165_HEAD_RPM.value).toBe(80);
    expect(R165_CENTER_DISTANCE_MM.value).toBe(130);
    expect(R165_MRR_NM_PER_MIN.value).toBe(302.5);
    expect(R165_WIWNU_PERCENT.value).toBe(6.47);
  });

  it('상대속도 V = ω·d = 1.089 m/s (플래튼·헤드 동일 회전수)', () => {
    // 손계산: (80 rev/min)(2π rad/rev)/(60 s/min) × 0.130 m = 1.08909 m/s
    expect(velocity.value).toBeCloseTo(1.08909, 5);
    expect(velocity.outOfRange).toBe(false);
  });

  it('MRR 302.5 nm/min 을 역산하면 K_p = 1.87×10⁻¹³ m²/N 이다 (±5 %)', () => {
    const kp = prestonCoefficientFromRate({
      removalRateNmPerMin: R165_MRR_NM_PER_MIN.value,
      pressurePa,
      velocityMps: velocity.value,
    });
    expect(Math.abs(kp.value - 1.87e-13) / 1.87e-13).toBeLessThanOrEqual(0.05);
  });

  it('🔴 역산 K_p 가 채택구간 1.0–2.5×10⁻¹³ 안에 든다 (3중 교차검증의 근거)', () => {
    const kp = prestonCoefficientFromRate({
      removalRateNmPerMin: R165_MRR_NM_PER_MIN.value,
      pressurePa,
      velocityMps: velocity.value,
    });
    expect(kp.value).toBeGreaterThanOrEqual(CU_KP_RANGE[0]);
    expect(kp.value).toBeLessThanOrEqual(CU_KP_RANGE[1]);
  });

  it('채택 K_p 구간으로 정방향 계산하면 문헌 MRR 302.5 를 감싼다', () => {
    const low = removalRate({ prestonCoefficient: CU_KP_RANGE[0], pressurePa, velocityMps: velocity.value });
    const high = removalRate({ prestonCoefficient: CU_KP_RANGE[1], pressurePa, velocityMps: velocity.value });
    expect(low.value).toBeLessThan(R165_MRR_NM_PER_MIN.value);
    expect(high.value).toBeGreaterThan(R165_MRR_NM_PER_MIN.value);
  });

  it('채택 정본 K_p = 1.6×10⁻¹³ 의 MRR 은 258.9 nm/min (문헌 대비 −14 %, 구간 내)', () => {
    const mrr = removalRate({
      prestonCoefficient: CU_PRESTON_KP.value, pressurePa, velocityMps: velocity.value,
    });
    expect(mrr.value).toBeCloseTo(258.9, 1);
  });

  it('🔴 회전수가 다르면 균일 상대속도 가정이 깨지므로 계산을 거부한다', () => {
    expect(() => relativeVelocity({ platenRpm: 80, headRpm: 60, centerDistanceMm: 130 }))
      .toThrow(/균일 상대속도/);
  });
});

describe('R166 — S204 Table B.5: 재료별 Preston 상수 (MPa⁻¹ → m²/N)', () => {
  // 논문은 MPa⁻¹ 로 인쇄했다. 1 MPa⁻¹ = 10⁻⁶ m²/N 이므로 지수만 6 내려간다.
  const expected: Array<[Parameters<typeof prestonCoefficientOf>[0], Parameters<typeof prestonCoefficientOf>[1], number]> = [
    ['Al', 'twoBody', 2.2e-14],
    ['Al', 'threeBody', 1.3e-13],
    ['Cu', 'twoBody', 1.7e-13],
    ['Cu', 'threeBody', 1.0e-13],
    ['Cu', 'currentCmp', 4.5e-13],
    ['W', 'twoBody', 5.9e-15],
    ['W', 'threeBody', 8.1e-15],
    ['W', 'currentCmp', 5.9e-13],
  ];
  for (const [material, mode, value] of expected) {
    it(`${material} / ${mode} = ${value} m²/N`, () => {
      expect(prestonCoefficientOf(material, mode).value).toBe(value);
    });
  }
  it('🔴 논문이 비워 둔 칸(Al 현행 CMP)은 채우지 않고 던진다', () => {
    expect(PRESTON_TABLE.Al.currentCmp).toBeUndefined();
    expect(() => prestonCoefficientOf('Al', 'currentCmp')).toThrow(/비워 둔 칸/);
  });
});

describe('R167 — S204 §2.4.3: 접촉모드 Cu Preston 상수 2점', () => {
  it('14 kPa → 2.0×10⁻¹³ · 48 kPa → 1.0×10⁻¹³ m²/N', () => {
    expect(CU_KP_CONTACT_14KPA.value).toBe(2.0e-13);
    expect(CU_KP_CONTACT_48KPA.value).toBe(1.0e-13);
  });
  it('🔴 채택 정본 1.6×10⁻¹³ 이 실측 2점 사이에 든다', () => {
    expect(CU_PRESTON_KP.value).toBeGreaterThanOrEqual(CU_KP_CONTACT_48KPA.value);
    expect(CU_PRESTON_KP.value).toBeLessThanOrEqual(CU_KP_CONTACT_14KPA.value);
  });
});

describe('R168 — S206 §V-A·§V-C 식 (7): Blech 임계곱 (Cu 이중다마신)', () => {
  it('파라미터가 원장 그대로다 (ρ=2.25e-8 · Ω=1.18e-29 · σ_crit=41 MPa · z*=1)', () => {
    expect(BLECH_CU_RESISTIVITY.value).toBe(2.25e-8);
    expect(BLECH_CU_ATOMIC_VOLUME.value).toBe(1.18e-29);
    expect(BLECH_CU_SIGMA_CRIT_MPA.value).toBe(41);
    expect(BLECH_CU_Z_STAR.value).toBe(1);
  });
  it('(jl)_crit = 0.27 A/µm (±5 %)', () => {
    const jl = copperBlechCriticalProduct();
    expect(Math.abs(jl.value - 0.27) / 0.27).toBeLessThanOrEqual(0.05);
  });
  it('= 2 700 A/cm (±5 %) — 원장의 손 재유도 0.268 A/µm 과 일치', () => {
    const jl = copperBlechCriticalProduct();
    expect(jl.value * A_PER_UM_TO_A_PER_CM).toBeCloseTo(2684, 0);
    expect(Math.abs(jl.value * A_PER_UM_TO_A_PER_CM - 2700) / 2700).toBeLessThanOrEqual(0.05);
  });
});

describe('R169·R170 — S203 Table 1: 4탐침 지름 보정계수 CF_d', () => {
  it('무한 시료 CF = 4.5324 (= π/ln 2, ±0.0005)', () => {
    expect(CF_INFINITE.value).toBe(4.5324);
    expect(Math.abs(CF_INFINITE.value - Math.PI / Math.LN2)).toBeLessThanOrEqual(0.0005);
  });
  const table: Array<[number, number]> = [
    [40, 4.5129], [20, 4.4553], [10, 4.2357], [5, 3.5750], [3, 2.7005],
  ];
  for (const [ratio, cf] of table) {
    it(`d/s = ${ratio} → CF_d = ${cf} (±0.0005)`, () => {
      expect(Math.abs(diameterCorrection(ratio) - cf)).toBeLessThanOrEqual(0.0005);
    });
  }
  it('🔴 표에 없는 d/s 는 보간하지 않고 던진다', () => {
    expect(() => diameterCorrection(15)).toThrow(/보간하지 않는다/);
  });
});

describe('R171 — S203 Table 2: 4탐침 두께 보정계수 CF_t', () => {
  const table: Array<[number, number]> = [
    [0.5, 0.9974], [0.625, 0.9898], [1.0, 0.9214], [2.0, 0.6336],
  ];
  for (const [ratio, cf] of table) {
    it(`t/s = ${ratio} → CF_t = ${cf} (±0.0005)`, () => {
      expect(Math.abs(thicknessCorrection(ratio) - cf)).toBeLessThanOrEqual(0.0005);
    });
  }
  it('t/s < 0.5 는 S203 이 명시한 대로 CF_t = 1', () => {
    expect(thicknessCorrection(0.4)).toBe(1);
  });
  it('면저항 R_s = CF·(V/I) — 무한 시료·박막에서 4.5324×(V/I)', () => {
    const rs = sheetResistance({ voltageV: 0.01, currentA: 0.001 });
    expect(rs.value).toBeCloseTo(45.324, 6);
  });
});

describe('R172 — S205 Eq.(1)–(6): RC 지연 스케일링 항등식 (오차 0)', () => {
  it('🔴 이상 스케일링 계수가 정확히 3.56 이다 (= 0.89 × K_I × 2)', () => {
    expect(DISTRIBUTED_RC_FACTOR.value).toBe(0.89);
    expect(FRINGE_KI.value).toBe(2);
    expect(idealScalingCoefficient().value).toBe(3.56); // 대수 항등 — 오차 0
  });
  it('X_ox = H = W = L_S = λ 를 넣으면 τ/(ρ·K_ox·ε₀) = 3.56·L²/λ² 가 된다', () => {
    const lambda = 1e-7;   // 100 nm
    const length = 1e-5;   // 10 µm
    const got = normalizedRcDelay({
      dielectricConstant: 1,
      lengthM: length, widthM: lambda, heightM: lambda,
      oxideThicknessM: lambda, spacingM: lambda,
    }).value;
    const expected = 3.56 * ((length * length) / (lambda * lambda));
    expect(Math.abs(got - expected) / expected).toBeLessThanOrEqual(1e-12);
  });
  it('τ ∝ L² — 길이를 2배로 하면 지연은 4배', () => {
    const base = { dielectricConstant: 4, widthM: 1e-7, heightM: 1e-7, oxideThicknessM: 1e-7, spacingM: 1e-7 };
    const t1 = normalizedRcDelay({ ...base, lengthM: 1e-5 }).value;
    const t2 = normalizedRcDelay({ ...base, lengthM: 2e-5 }).value;
    expect(t2 / t1).toBeCloseTo(4, 10);
  });
});

describe('S208 Table 2 · S207 — low-k 유전율과 RC 비교', () => {
  it('SiO₂ 4.0 · FSG 3.5 · SiCOH 2.6–2.7 · 다공성 2.0–2.6 · 에어갭 유효 2.0 · SiN 캡 7', () => {
    expect(K_SIO2.value).toBe(4.0);
    expect(K_FSG.value).toBe(3.5);
    expect(K_SICOH_MIN.value).toBe(2.6);
    expect(K_SICOH_MAX.value).toBe(2.7);
    expect(K_POROUS_MIN.value).toBe(2.0);
    expect(K_POROUS_MAX.value).toBe(2.6);
    expect(K_AIRGAP_EFFECTIVE.value).toBe(2.0);
    expect(K_SIN_CAP.value).toBe(7);
  });
  it('SiO₂ → SiCOH(2.7) 로 바꾸면 RC 지연이 0.675배 (−32.5 %)', () => {
    const r = delayRatioByDielectric({ kFrom: K_SIO2.value, kTo: K_SICOH_MAX.value });
    expect(r.value).toBeCloseTo(0.675, 10);
  });
  it('SiN 캡(7)은 SiO₂ 보다 지연을 1.75배로 키운다 — 실효 k 를 끌어올리는 주범', () => {
    const r = delayRatioByDielectric({ kFrom: K_SIO2.value, kTo: K_SIN_CAP.value });
    expect(r.value).toBeCloseTo(1.75, 10);
  });
});

describe('R173 — S201 Table 2.1: EM 확산경로별 활성화에너지', () => {
  it('Al 벌크 1.2 / 입계 0.7 / 표면 0.8 eV', () => {
    expect(EM_ACTIVATION_ENERGY.Al.bulk.value).toBe(1.2);
    expect(EM_ACTIVATION_ENERGY.Al.grainBoundary.value).toBe(0.7);
    expect(EM_ACTIVATION_ENERGY.Al.surface.value).toBe(0.8);
  });
  it('Cu 벌크 2.3 / 입계 1.2 / 표면 0.8 eV', () => {
    expect(EM_ACTIVATION_ENERGY.Cu.bulk.value).toBe(2.3);
    expect(EM_ACTIVATION_ENERGY.Cu.grainBoundary.value).toBe(1.2);
    expect(EM_ACTIVATION_ENERGY.Cu.surface.value).toBe(0.8);
  });
  it('Black 지수 n — Al 2 · Cu 1.1–1.3 (S201 §2.2.1)', () => {
    expect(BLACK_N_AL.value).toBe(2);
    expect(BLACK_N_CU_MIN.value).toBe(1.1);
    expect(BLACK_N_CU_MAX.value).toBe(1.3);
  });
  it('볼츠만 상수는 회사 규약 8.617×10⁻⁵ eV/K (후공정 원장 R16)', () => {
    expect(EM_BOLTZMANN_EV_PER_K.value).toBe(8.617e-5);
  });
  it('🔴 AF 는 비율이다 — 같은 조건이면 정확히 1 (계수 A 가 약분된다)', () => {
    const af = blackAccelerationFactor({
      currentDensity1: 1e6, currentDensity2: 1e6,
      temperature1K: 400, temperature2K: 400,
      exponentN: BLACK_N_CU_MAX.value, activationEnergyEv: EM_ACTIVATION_ENERGY.Cu.surface.value,
    });
    expect(af.value).toBe(1);
  });
  it('전류밀도만 2배로 올리면 AF = 2^(−n) — Al(n=2)은 정확히 0.25', () => {
    const af = blackAccelerationFactor({
      currentDensity1: 1e6, currentDensity2: 2e6,
      temperature1K: 400, temperature2K: 400,
      exponentN: BLACK_N_AL.value, activationEnergyEv: EM_ACTIVATION_ENERGY.Al.grainBoundary.value,
    });
    expect(af.value).toBeCloseTo(0.25, 12);
  });
});

describe('S210 — Cu 크기효과 (Fuchs–Sondheimer 표면산란만)', () => {
  /**
   * 🔴 2026-08-21 정정: 이 항목의 옛 제목은 「39 nm(S216)는 **접근 실패**라 쓰지 않는다」였다.
   *    원장이 2026-08-20 에 그 근거를 철회했다 — S216 의 403 은 페이월이 아니라 Cloudflare 봇
   *    차단이었고 논문은 CC BY 4.0 골드 OA 다. **인용 불가**가 아니라 **정본이 아닐 뿐**이다.
   *    단언 자체(40 을 쓴다)는 그대로 옳으므로 값은 건드리지 않고 사유만 바로잡는다.
   */
  it('🔴 λ = 40 nm 가 300 K 정본이다 (39 nm 는 S207·S216 으로 인용 가능하나 정본이 아니다)', () => {
    expect(CU_MEAN_FREE_PATH_NM.value).toBe(40);
    expect(CU_MEAN_FREE_PATH_NM.value).not.toBe(39);
  });
  it('ρ₀ = 1.68×10⁻⁸ Ω·m · FS 계수 3/8 (무한폭 박막식)', () => {
    expect(CU_RHO0.value).toBe(1.68e-8);
    expect(FS_COEFFICIENT.value).toBe(0.375);
  });
  it('🔴 ρ₀λ 를 직접 계산하면 6.7×10⁻¹⁶ Ω·m² 다 — 논문 인쇄값 1.99×10⁻¹⁵ 가 아니다', () => {
    expect(CU_RHO0_TIMES_MFP).toBeCloseTo(6.72e-16, 18);
    expect(Math.abs(CU_RHO0_TIMES_MFP - 6.7e-16) / 6.7e-16).toBeLessThanOrEqual(0.01);
    expect(Math.abs(CU_RHO0_TIMES_MFP - 1.99e-15) / 1.99e-15).toBeGreaterThan(0.5);
  });
  // 🔴 아래 두 항목은 **무한폭 박막식**(S210, 특성길이 = 두께)의 재현이다. 배선식(S216 Eq.(8))은
  //    아래 별도 describe 에서 검증한다 — 3/8 이 여기 남아 있다고 해서 낡은 골든이 아니다.
  it('d = λ = 40 nm 에서 ρ_eff = ρ₀·(1 + 3/8) = 2.31×10⁻⁸ Ω·m', () => {
    const rho = effectiveResistivityFS({ thicknessNm: 40 });
    expect(rho.value).toBeCloseTo(1.68e-8 * 1.375, 18);
  });
  it('두꺼워질수록 벌크값으로 수렴한다 (1000 nm 에서 +1.5 %)', () => {
    const rho = effectiveResistivityFS({ thicknessNm: 1000 });
    expect(rho.value / CU_RHO0.value).toBeCloseTo(1.015, 6);
  });
  it('R = ρL/(W·T) 손계산 — ρ=1.68e-8, L=100 µm, W=T=100 nm → 168 Ω', () => {
    const r = lineResistance({
      resistivityOhmM: CU_RHO0.value, lengthUm: 100, widthNm: 100, thicknessNm: 100,
    });
    expect(r.value).toBeCloseTo(168, 9);
  });
});

describe('S212 — NIST CODATA Faraday 상수와 전기도금', () => {
  it('F = 96 485.332 12 C/mol (exact)', () => {
    expect(FARADAY_CONSTANT.value).toBe(96485.33212);
  });
  it('Q = n·F 를 흘리면 1 몰의 1/1 이 석출된다 — m = M/n × (Q/F)', () => {
    // I = 2 A, t = F/2 s → Q = F C → m = M/n
    const m = depositedMass({
      currentA: 2, timeS: FARADAY_CONSTANT.value / 2, molarMassGPerMol: 63.546, valence: 2,
    });
    expect(m.value).toBeCloseTo(63.546 / 2, 10);
  });
});

/**
 * S216 Eq.(8) — FS 계수의 구간 분기 (원장 M-29 해소분).
 * Smith 외(IBM), *AIP Advances* 9(2) 025015 (2019), DOI 10.1063/1.5063896 · CC BY 4.0.
 *
 * 🔴 원장이 확정한 진술은 이것뿐이다: `k·λ = 4×면적/둘레` · `k > 4 → 3/8` · `0.5 < k < 4 → 0.474`.
 *    **그 밖은 우리 규약이고, 아래 주석이 그렇다고 밝힌다.**
 */
describe('S216 Eq.(8) — FS 근사계수의 선폭 의존 분기 (M-29)', () => {
  it('상수가 원장 그대로다 (인자 4 · 경계 0.5 와 4 · 계수 0.375 와 0.474)', () => {
    expect(FS_AREA_PERIMETER_FACTOR.value).toBe(4);
    expect(FS_K_VALID_MIN.value).toBe(0.5);
    expect(FS_K_WIDE_MIN.value).toBe(4);
    expect(FS_COEFFICIENT_WIDE.value).toBe(0.375);
    expect(FS_COEFFICIENT_MID.value).toBe(0.474);
  });

  it('🔴 두 계수의 비가 1.264 — 3/8 고정이 미세 배선에서 ρ 항을 26.4 % 낮게 낸 크기다', () => {
    expect(FS_COEFFICIENT_MID.value / FS_COEFFICIENT_WIDE.value).toBeCloseTo(1.264, 3);
  });

  it('특성길이 = 4·A/P — 정사각 단면이면 변 길이, 광폭이면 두께의 2배로 간다', () => {
    expect(lineCharacteristicLengthNm({ widthNm: 100, thicknessNm: 100 })).toBeCloseTo(100, 10);
    // W ≫ T: 4WT/(2(W+T)) → 2T. W = 100 µm · T = 50 nm 에서 2T = 100 nm 에 0.1 % 안으로 붙는다.
    const wide = lineCharacteristicLengthNm({ widthNm: 100000, thicknessNm: 50 });
    expect(Math.abs(wide - 100) / 100).toBeLessThan(1e-3);
  });

  it('🔴 경계값 k = 4 바로 아래·위에서 계수가 실제로 갈린다', () => {
    expect(fsCoefficientForK(4 - 1e-9)).toBe(FS_COEFFICIENT_MID.value);
    expect(fsCoefficientForK(4 + 1e-9)).toBe(FS_COEFFICIENT_WIDE.value);
    // k = 4 정확히: S216 은 `k > 4` 와 `0.5 < k < 4` 만 적었고 4 자체를 어느 쪽에도 넣지 않았다.
    // 우리는 0.474 쪽에 닫는다 — **논문의 진술이 아니라 이 제품의 규약**이다.
    expect(fsCoefficientForK(4)).toBe(FS_COEFFICIENT_MID.value);
  });

  it('🔴 경계값 k = 0.5 이하는 S216 이 값을 주지 않는다 — 외삽하지 않고 던진다', () => {
    expect(fsCoefficientForK(0.5 + 1e-9)).toBe(FS_COEFFICIENT_MID.value);
    expect(() => fsCoefficientForK(0.5)).toThrow(/0.5/);
    expect(() => fsCoefficientForK(0.4)).toThrow(/0.5/);
    expect(() => fsCoefficientForK(0)).toThrow(/0.5/);
  });

  it('배선식 ρ_eff = ρ₀[1 + C(k)(1−p)/k] — 두 구간 각각 손계산과 맞는다', () => {
    // ① 0.5 < k ≤ 4: W = 60 · T = 117 → 4A/P = 2·60·117/177 = 79.322 nm → k = 1.98305 → C = 0.474
    const dMid = (4 * 60 * 117) / (2 * (60 + 117));
    expect(dMid).toBeCloseTo(79.32203, 5);
    expect(fsDimensionlessK({ widthNm: 60, thicknessNm: 117 })).toBeCloseTo(dMid / 40, 12);
    expect(effectiveResistivityFSLine({ widthNm: 60, thicknessNm: 117 }).value)
      .toBeCloseTo(1.68e-8 * (1 + 0.474 / (dMid / 40)), 20);
    // ② k > 4: W = 1000 · T = 500 → 4A/P = 2·1000·500/1500 = 666.67 nm → k = 16.67 → C = 0.375
    const dWide = (4 * 1000 * 500) / (2 * (1000 + 500));
    expect(dWide / 40).toBeGreaterThan(4);
    expect(effectiveResistivityFSLine({ widthNm: 1000, thicknessNm: 500 }).value)
      .toBeCloseTo(1.68e-8 * (1 + 0.375 / (dWide / 40)), 20);
  });

  it('🔴 M-29 결함 재현 — 배선식이 박막식보다 높다 (같은 두께 117 nm, W 20–200 nm 전 구간)', () => {
    const film = effectiveResistivityFS({ thicknessNm: 117 }).value;
    for (let w = 20; w <= 200; w++) {
      expect(effectiveResistivityFSLine({ widthNm: w, thicknessNm: 117 }).value)
        .toBeGreaterThan(film);
    }
    // 대표점: W = 85 nm 에서 1.8954 → 2.0035 µΩ·cm (+5.70 %)
    const w85 = effectiveResistivityFSLine({ widthNm: 85, thicknessNm: 117 }).value;
    expect(film * 1e8).toBeCloseTo(1.8954, 4);
    expect(w85 * 1e8).toBeCloseTo(2.0035, 4);
  });

  it('🔴 sourceId 가 S216 이다 — 배선식은 S210 이 아니라 S216 을 근거로 한다', () => {
    expect(effectiveResistivityFSLine({ widthNm: 85, thicknessNm: 117 }).sourceId).toBe('S216');
    expect(effectiveResistivityFS({ thicknessNm: 117 }).sourceId).toBe('S210');
  });
});
