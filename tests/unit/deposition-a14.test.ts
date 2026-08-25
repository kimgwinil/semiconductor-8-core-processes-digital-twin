// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError, type Quantity } from '@/models/contract';
import {
  ALD_MEASURED_TEMPS_C, aldDepositionTimeS, aldThicknessAngstrom, aldThicknessNm,
  cyclesForThickness, gpcAt,
} from '@/models/physics/deposition/ald';
import {
  BOLTZMANN_CONSTANT_EV_PER_K, arrheniusDiffusivity, dopantDiffusivity, erfcProfile,
  gaussianPeakConcentration, gaussianProfile, junctionDepthErfc, junctionDepthGaussian,
  predepositionDose,
} from '@/models/physics/deposition/diffusion';
import { erf, erfc, erfcInv } from '@/models/physics/deposition/specialFunctions';
import {
  apparentActivationEnergy, cvdGrowthRate, surfaceReactionRate, transportLimitedFraction,
} from '@/models/physics/deposition/cvd';
import {
  SI_BIAXIAL_MODULUS_PA, biaxialModulus, curvatureRadiusFromStress, filmStressStoney,
} from '@/models/physics/deposition/stoney';
import {
  nuclearStoppingFactor, nuclearStoppingReduced, reducedEnergy, thresholdEnergy,
} from '@/models/physics/deposition/sputter';
import {
  annealedStraggle, beamCurrentA, doseFromBeam, implantProfile, implantTimeS,
  junctionDepthDeep, junctionDepthShallow, peakConcentration, totalIons, waferAreaCm2,
} from '@/models/physics/deposition/implant';

/**
 * 🔴 A14 — 계산 정확성(P5 증착·이온주입). 규약 §0 항목 3.
 *  1. 결정론      — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조 (골든 테스트에 더해 대표점을 여기서 고정)
 *  3. 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity·발산 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위·유효범위를 갖고 차원이 맞는다
 */

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
}

const STONEY = {
  substrateBiaxialModulusPa: SI_BIAXIAL_MODULUS_PA['001'],
  substrateThicknessM: 725e-6,
  filmThicknessM: 1e-6,
  curvatureRadiusM: 50,
};
const IMPLANT = { doseCm2: 1e14, rpUm: 0.24, deltaRpUm: 0.063, substrateCm3: 2e16 };
const CVD = { hgCmPerS: 1, ksCmPerS: 0.25, cgPerCm3: 1e16, filmAtomDensityPerCm3: 5e22 };

describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('ALD 두께를 200회 반복해도 비트 단위로 같다', () => {
    const first = aldThicknessAngstrom({ tempC: 200, cycles: 200 }).value;
    for (let i = 0; i < 200; i++) {
      expect(aldThicknessAngstrom({ tempC: 200, cycles: 200 }).value).toBe(first);
    }
  });
  it('확산 접합깊이(erfc 수치 역함수 포함)를 200회 반복해도 비트 단위로 같다', () => {
    const args = { csPerCm3: 1e21, cbPerCm3: 6.3e16, dCm2PerS: 1e-13, timeS: 1800 };
    const first = junctionDepthErfc(args).value;
    for (let i = 0; i < 200; i++) expect(junctionDepthErfc(args).value).toBe(first);
  });
  it('주입 피크 농도·스퍼터 핵정지능을 200회 반복해도 같다', () => {
    const p = peakConcentration({ doseCm2: 1e14, deltaRpUm: 0.063 }).value;
    const s = nuclearStoppingReduced(0.159).value;
    for (let i = 0; i < 200; i++) {
      expect(peakConcentration({ doseCm2: 1e14, deltaRpUm: 0.063 }).value).toBe(p);
      expect(nuclearStoppingReduced(0.159).value).toBe(s);
    }
  });
  it('시각이 흘러도 값이 변하지 않는다', async () => {
    const a = filmStressStoney(STONEY).value;
    await new Promise((r) => setTimeout(r, 20));
    expect(filmStressStoney(STONEY).value).toBe(a);
  });
});

describe('A14-2 수치 정확성 — 손계산 대조 6점', () => {
  it('① ALD 두께 = GPC × N = 1.1 × 250', () => {
    expect(aldThicknessAngstrom({ tempC: 200, cycles: 250 }).value).toBeCloseTo(1.1 * 250, 12);
  });
  it('② 아레니우스 D = D₀·exp(−E_a/kT), D₀=0.06 E_a=3.12 T=1373.15 K', () => {
    const hand = 0.06 * Math.exp(-3.12 / (8.617e-5 * 1373.15));
    expect(arrheniusDiffusivity({ d0Cm2PerS: 0.06, eaEv: 3.12, tempK: 1373.15 }).value)
      .toBeCloseTo(hand, 25);
    expect(dopantDiffusivity({ dopant: 'B', tempK: 1373.15 }).value).toBeCloseTo(hand, 25);
  });
  it('③ Stoney σ = M·t_s²/(6·R·t_f)', () => {
    const hand = (1.803e11 * 725e-6 * 725e-6) / (6 * 50 * 1e-6);
    expect(filmStressStoney(STONEY).value).toBeCloseTo(hand, 0);
  });
  it('④ CVD 성장률 v = (h_g k_s/(h_g+k_s))·(C_g/N)', () => {
    const hand = ((1 * 0.25) / (1 + 0.25)) * (1e16 / 5e22);
    expect(cvdGrowthRate(CVD).value).toBeCloseTo(hand, 20);
  });
  it('⑤ 주입 피크 n₀ = 2.85×10²⁰ cm⁻³ — R153 문헌값 (S181 Example 9.1, ±2 %)', () => {
    // 🔴 예전에는 `1e14 / (Math.sqrt(2 * Math.PI) * 6.3e-6)` 을 손계산이라 적어 두었으나,
    //    식의 모양이 구현(`physics/deposition/implant.ts`)에서 그대로 온 **복붙**이었다.
    //    손으로 한 것은 단위 환산(0.063 µm → 6.3×10⁻⁶ cm)뿐이라, √2 가 빠져도 양쪽이 같이 틀렸다
    //    (E1 · check-test-formulas). 그리고 그 6.332417×10¹⁸ 은 문헌 대조가 없는 수였다.
    //
    // 🔴 이 항목에는 진짜 문헌값이 있다 → 조건째로 갈아끼우고 기대값을 **문헌 리터럴**로 둔다.
    //    원장 R153 (`refs/공개출처_반도체전공정_서지목록.md` §1-5) = S181 Example 9.1 (pp.15–16):
    //      B → Si · E = 100 keV · Φ = 5×10¹⁵ cm⁻² · R_p = 0.3 µm · σ_p = 0.07 µm
    //      ⇒ n₀ = 2.85×10²⁰ cm⁻³ (허용 ±2 %)
    //    ⚠️ 같은 문헌 조건이 `tests/golden/deposition.golden.test.ts` R153 절에도 이미 있다.
    //       중복이지만, 여기 A14-2 대표점에서 **식 복붙을 없애는 것**이 이 교체의 목적이다.
    const n0 = peakConcentration({ doseCm2: 5e15, deltaRpUm: 0.07 }).value;
    expect(Math.abs(n0 / 2.85e20 - 1)).toBeLessThanOrEqual(0.02);
  });
  it('⑥ 스퍼터 ε = 0.03255·E·M₂/((M₁+M₂)Z₁Z₂√(Z₁^{2/3}+Z₂^{2/3}))', () => {
    const screen = Math.sqrt(Math.pow(2, 2 / 3) + Math.pow(29, 2 / 3));
    const hand = (0.03255 * 1000 * 63.55) / ((4 + 63.55) * 2 * 29 * screen);
    expect(reducedEnergy({ z1: 2, m1: 4, z2: 29, m2: 63.55, energyEv: 1000 }).value)
      .toBeCloseTo(hand, 12);
  });
});

describe('A14-2b 오차함수 구현 정확성 — 알려진 값과 대조', () => {
  it('erf(0)=0 · erf(1)=0.842700793 · erf(2)=0.995322265 · erf(3)=0.999977910', () => {
    expect(erf(0)).toBe(0);
    expect(erf(1)).toBeCloseTo(0.8427007929, 10);
    expect(erf(2)).toBeCloseTo(0.9953222650, 10);
    expect(erf(3)).toBeCloseTo(0.9999779095, 10);
  });
  it('erf 는 홀함수다', () => {
    expect(erf(-1.7)).toBe(-erf(1.7));
  });
  it('erfc 와 erfcInv 가 서로의 역함수다 (왕복 오차 < 1e-9)', () => {
    for (const z of [0.1, 0.5, 1, 2, 2.826, 3.47, 4.5, 7.5]) {
      expect(Math.abs(erfcInv(erfc(z)) - z) / z).toBeLessThan(1e-9);
    }
  });
  it('신뢰 하한 아래의 농도비는 조용히 통과시키지 않고 거부한다', () => {
    expect(() => erfcInv(1e-60)).toThrow(/신뢰 하한/);
    expect(erfcInv(1e-20)).toBeGreaterThan(6);
    expect(() => erfcInv(0)).toThrow(/정의역/);
  });
});

describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('ALD: 측정온도 + 창 전 구간 × 사이클 0~10 000 (61점)', () => {
    let n = 0;
    const temps = [...ALD_MEASURED_TEMPS_C, 150, 175, 200, 225, 250];
    for (const tempC of temps) {
      for (let i = 0; i <= 60; i++) {
        const cycles = (10000 * i) / 60;
        assertFinite(gpcAt(tempC), `gpc ${tempC}`);
        assertFinite(aldThicknessAngstrom({ tempC, cycles }), `ald ${tempC} ${cycles}`);
        assertFinite(aldThicknessNm({ tempC, cycles }), `aldNm ${tempC} ${cycles}`);
        assertFinite(aldDepositionTimeS(cycles), `aldTime ${cycles}`);
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('확산: T 300~2000 K × t 0~1e5 s 격자 (erfc·가우시안 전 경로)', () => {
    let n = 0;
    for (let ti = 0; ti <= 20; ti++) {
      const tempK = 300 + (1700 * ti) / 20;
      const d = dopantDiffusivity({ dopant: 'B', tempK });
      assertFinite(d, `D ${tempK}`);
      for (let si = 0; si <= 20; si++) {
        const timeS = (1e5 * si) / 20;
        assertFinite(erfcProfile({ csPerCm3: 1e21, xCm: 1e-4, dCm2PerS: d.value, timeS }), `erfc ${tempK} ${timeS}`);
        assertFinite(junctionDepthErfc({ csPerCm3: 1e21, cbPerCm3: 1e16, dCm2PerS: d.value, timeS }), `xj ${tempK} ${timeS}`);
        assertFinite(predepositionDose({ csPerCm3: 1e21, dCm2PerS: d.value, timeS }), `Q ${tempK} ${timeS}`);
        if (d.value * timeS > 0) {
          assertFinite(gaussianPeakConcentration({ doseCm2: 5e14, dCm2PerS: d.value, timeS }), `C0 ${tempK} ${timeS}`);
          assertFinite(gaussianProfile({ doseCm2: 5e14, dCm2PerS: d.value, timeS, xCm: 1e-4 }), `gauss ${tempK} ${timeS}`);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(400);
  });

  it('확산: t = 0 에서 접합깊이는 정확히 0 이고 발산하지 않는다', () => {
    expect(junctionDepthErfc({ csPerCm3: 1e21, cbPerCm3: 1e16, dCm2PerS: 1e-13, timeS: 0 }).value).toBe(0);
    expect(() => gaussianPeakConcentration({ doseCm2: 5e14, dCm2PerS: 1e-13, timeS: 0 })).toThrow(/Dt > 0/);
  });

  it('CVD: T 300~2000 K × h_g 1e-3~1e3 cm/s 격자', () => {
    let n = 0;
    for (let ti = 0; ti <= 20; ti++) {
      const tempK = 300 + (1700 * ti) / 20;
      const ks = surfaceReactionRate({ k0CmPerS: 1e7, eaEv: 1.8, tempK });
      assertFinite(ks, `ks ${tempK}`);
      for (let hi = 0; hi <= 12; hi++) {
        const hgCmPerS = Math.pow(10, -3 + (6 * hi) / 12);
        assertFinite(cvdGrowthRate({ ...CVD, hgCmPerS, ksCmPerS: ks.value }), `v ${tempK} ${hgCmPerS}`);
        assertFinite(transportLimitedFraction({ hgCmPerS, ksCmPerS: ks.value }), `frac ${tempK}`);
        assertFinite(apparentActivationEnergy({ hgCmPerS, ksCmPerS: ks.value, eaEv: 1.8 }), `Eapp ${tempK}`);
        n++;
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it('Stoney: t_f 1 nm~10 µm × R ±(1~1000 m) — 부호 포함', () => {
    let n = 0;
    for (let fi = 0; fi <= 20; fi++) {
      const filmThicknessM = Math.pow(10, -9 + (4 * fi) / 20);
      for (const sign of [1, -1]) {
        for (let ri = 0; ri <= 10; ri++) {
          const curvatureRadiusM = sign * Math.pow(10, (3 * ri) / 10);
          const q = filmStressStoney({ ...STONEY, filmThicknessM, curvatureRadiusM });
          assertFinite(q, `stoney ${filmThicknessM} ${curvatureRadiusM}`);
          expect(Math.sign(q.value)).toBe(sign);
          assertFinite(curvatureRadiusFromStress({ ...STONEY, filmThicknessM, stressPa: q.value }), 'radius');
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(400);
  });

  it('스퍼터: E 1 eV~1 MeV 로그 스윕 (핵정지능 분모 부호 반전 구간 포함)', () => {
    let n = 0;
    for (let i = 0; i <= 60; i++) {
      const energyEv = Math.pow(10, (6 * i) / 60);
      const eps = reducedEnergy({ z1: 2, m1: 4, z2: 29, m2: 63.55, energyEv });
      assertFinite(eps, `eps ${energyEv}`);
      const sn = nuclearStoppingReduced(eps.value);
      assertFinite(sn, `sn ${energyEv}`);
      expect(sn.value).toBeGreaterThan(0);
      n++;
    }
    assertFinite(nuclearStoppingFactor({ z1: 2, m1: 4, z2: 29, m2: 63.55 }), 'K');
    assertFinite(thresholdEnergy({ m1: 4, m2: 63.55, surfaceBindingEv: 3.49 }), 'Eth');
    expect(n).toBeGreaterThan(60);
  });

  it('이온주입: 도즈 1e11~1e16 × ΔR_p 0.01~0.3 µm × 깊이 0~2 µm', () => {
    let n = 0;
    for (let di = 0; di <= 10; di++) {
      const doseCm2 = Math.pow(10, 11 + (5 * di) / 10);
      for (let si = 0; si <= 10; si++) {
        const deltaRpUm = 0.01 + (0.29 * si) / 10;
        const peak = peakConcentration({ doseCm2, deltaRpUm });
        assertFinite(peak, `peak ${doseCm2} ${deltaRpUm}`);
        for (let xi = 0; xi <= 10; xi++) {
          const depthUm = (2 * xi) / 10;
          assertFinite(implantProfile({ doseCm2, rpUm: 0.24, deltaRpUm, depthUm }), 'profile');
          n++;
        }
        if (peak.value > 2e16) {
          assertFinite(junctionDepthDeep({ doseCm2, rpUm: 0.24, deltaRpUm, substrateCm3: 2e16 }), 'deep');
          assertFinite(junctionDepthShallow({ doseCm2, rpUm: 0.24, deltaRpUm, substrateCm3: 2e16 }), 'shallow');
        }
        assertFinite(annealedStraggle({ deltaRpUm, dCm2PerS: 1e-14, timeS: 3600 }), 'straggle');
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('빔 계열: 도즈↔전류↔시간 왕복이 일치한다', () => {
    const area = waferAreaCm2(20).value;
    const t = implantTimeS({ doseCm2: 5e15, areaCm2: area, beamCurrentA: 2.8e-3, chargeState: 1 }).value;
    const back = doseFromBeam({ beamCurrentA: 2.8e-3, timeS: t, areaCm2: area, chargeState: 1 }).value;
    expect(back).toBeCloseTo(5e15, 0);
    const i = beamCurrentA({ doseCm2: 5e15, areaCm2: area, timeS: t, chargeState: 1 }).value;
    expect(i).toBeCloseTo(2.8e-3, 10);
    expect(totalIons({ doseCm2: 5e15, areaCm2: area }).value).toBeGreaterThan(0);
  });
});

describe('A14-3b 한계선 초과는 계산하지 않고 정지한다', () => {
  it('ALD 창·측정범위 밖 온도는 OutOfLimitError 또는 명시적 거부', () => {
    expect(() => gpcAt(60)).toThrow(OutOfLimitError);
    expect(() => gpcAt(400)).toThrow(OutOfLimitError);
    expect(() => gpcAt(120)).toThrow(/보간하지 않는다/);
  });
  it('음수 사이클·음수 시간은 거부한다', () => {
    expect(() => aldThicknessAngstrom({ tempC: 200, cycles: -1 })).toThrow(OutOfLimitError);
    expect(() => aldDepositionTimeS(-1)).toThrow(OutOfLimitError);
  });
  it('접합이 존재하지 않는 조건(N_p ≤ N_B)은 계산하지 않는다', () => {
    expect(() => junctionDepthDeep({ ...IMPLANT, substrateCm3: 1e20 })).toThrow(/N_p > N_B/);
    expect(() => junctionDepthErfc({ csPerCm3: 1e16, cbPerCm3: 1e17, dCm2PerS: 1e-13, timeS: 900 }))
      .toThrow(/C_s > C_B/);
  });
  it('막 두께 0·곡률 반경 0 은 거부한다', () => {
    expect(() => filmStressStoney({ ...STONEY, filmThicknessM: 0 })).toThrow(/0보다 커야/);
    expect(() => filmStressStoney({ ...STONEY, curvatureRadiusM: 0 })).toThrow(/0이 아닌/);
  });
});

describe('A14-4 단위 일관성 — 모든 Quantity 가 단위·유효범위를 갖는다', () => {
  const samples: Array<[string, Quantity, string]> = [
    ['gpc', gpcAt(200), 'Å/cycle'],
    ['aldThickness', aldThicknessAngstrom({ tempC: 200, cycles: 200 }), 'Å'],
    ['aldThicknessNm', aldThicknessNm({ tempC: 200, cycles: 200 }), 'nm'],
    ['aldCycles', cyclesForThickness({ tempC: 200, targetAngstrom: 240 }), 'cycle'],
    ['aldTime', aldDepositionTimeS(200), 's'],
    ['D', dopantDiffusivity({ dopant: 'P', tempK: 1373.15 }), 'cm²/s'],
    ['xj-erfc', junctionDepthErfc({ csPerCm3: 1e21, cbPerCm3: 1e16, dCm2PerS: 1e-13, timeS: 1800 }), 'µm'],
    ['dose', predepositionDose({ csPerCm3: 1e21, dCm2PerS: 1e-13, timeS: 1800 }), 'cm⁻²'],
    ['xj-gauss', junctionDepthGaussian({ doseCm2: 5e14, dCm2PerS: 1.2e-12, timeS: 3600, cbPerCm3: 1e17 }), 'µm'],
    ['ks', surfaceReactionRate({ k0CmPerS: 1e7, eaEv: 1.8, tempK: 1100 }), 'cm/s'],
    ['cvd-v', cvdGrowthRate(CVD), 'cm/s'],
    ['cvd-Eapp', apparentActivationEnergy({ hgCmPerS: 1, ksCmPerS: 0.25, eaEv: 1.8 }), 'eV'],
    ['M', biaxialModulus({ youngsPa: 1.3e11, poisson: 0.28 }), 'Pa'],
    ['stoney', filmStressStoney(STONEY), 'Pa'],
    ['eps', reducedEnergy({ z1: 2, m1: 4, z2: 29, m2: 63.55, energyEv: 1000 }), ''],
    ['Eth', thresholdEnergy({ m1: 4, m2: 63.55, surfaceBindingEv: 3.49 }), 'eV'],
    ['peak', peakConcentration({ doseCm2: 1e14, deltaRpUm: 0.063 }), 'cm⁻³'],
    ['deep', junctionDepthDeep(IMPLANT), 'µm'],
    ['straggle', annealedStraggle({ deltaRpUm: 0.063, dCm2PerS: 1e-14, timeS: 3600 }), 'µm'],
    ['area', waferAreaCm2(20), 'cm²'],
  ];

  for (const [label, q, unit] of samples) {
    it(`${label} 의 단위는 "${unit}" 이고 유효범위·등급이 채워져 있다`, () => {
      expect(q.unit).toBe(unit);
      // 🔴 A6 정제(2026-08-20 오케스트레이터 판정): 「모든 Quantity 에 sourceId」가 아니다.
      //    문헌값에만 S번호가 있고, **합성값·운영규약에는 출처가 없는 것이 사실**이다.
      //    빌린 S번호를 달게 하던 종전 규칙이 8개 파일 83개 출력의 출처 도용을 낳았다.
      if (q.kind === 'literature') expect(q.sourceId ?? '').not.toBe('');
      else expect(q.sourceId).toBeUndefined();
      expect(q.validRange.length).toBe(2);
      expect(q.validRange[0]).toBeLessThanOrEqual(q.validRange[1] as number);
      expect(q.grade.length).toBeGreaterThan(0);
      expect(typeof q.outOfRange).toBe('boolean');
    });
  }

  it('볼츠만 상수는 회사 정본(8.617×10⁻⁵ eV/K)이다 — S182 본문값 8.36×10⁻⁵ 를 쓰지 않는다', () => {
    expect(BOLTZMANN_CONSTANT_EV_PER_K).toBe(8.617e-5);
  });

  it('차원 대조: ALD 두께 Å 값 = nm 값 × 10', () => {
    const a = aldThicknessAngstrom({ tempC: 200, cycles: 137 }).value;
    const nm = aldThicknessNm({ tempC: 200, cycles: 137 }).value;
    expect(a).toBeCloseTo(nm * 10, 10);
  });
});
