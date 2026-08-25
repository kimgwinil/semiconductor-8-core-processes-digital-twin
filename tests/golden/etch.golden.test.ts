// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  kohEtchRate, kohOrientationSelectivity, kohAnisotropyDegree, anisotropyDegree,
  KOH_TABLE_TEMP_C, KOH_WT_POINTS,
} from '@/models/physics/etch/wetEtch';
import {
  deepEtchRecipe, deepEtchAverageRate, deepEtchCycleDepth, deepEtchDepth, deepEtchTime,
  deepEtchOxideSelectivity, rieLag, maskSelectivity, clausingTransmission, selfBiasVoltageRatio,
  selfBiasExponent, RIE_LAG_WIDE_DEPTH_UM, RIE_LAG_NARROW_DEPTH_UM, MASK_CONSUMED_UM,
  MAX_MEASURED_DEPTH_UM,
} from '@/models/physics/etch/dryEtch';
import {
  debyeLength, electronPlasmaFrequency, debyeSphereCount, probeToDebyeRatio, PROBE_RADIUS_MM,
} from '@/models/physics/etch/plasma';
import { endpointWavelength, carbonMonoxideLine } from '@/models/physics/etch/oes';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-4 (R135~R144).
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 * 🔴 R142·R143 은 원장이 ㉴(조사자 재계산)로 분류했으므로 **여기가 아니라 `tests/unit/etch-a14.test.ts`** 에 있다.
 */

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

describe('R135 — S160 Table 1+2: Bosch 심도식각 (㉮ 측정값, ±1 %)', () => {
  const r = deepEtchRecipe('bosch');
  it('레시피 조건이 표와 일치한다 (30 사이클 · 식각 15 s · 패시베이션 10 s · 21.4 °C · 4 µm 트렌치)', () => {
    expect(r.cycles).toBe(30);
    expect(r.etchStepS).toBe(15);
    expect(r.passivationStepS).toBe(10);
    expect(r.substrateTempC).toBeCloseTo(21.4, 10);
    expect(r.trenchWidthUm).toBe(4);
  });
  it('㉰ 대수 항등 — 사이클 수 × 사이클 시간 = 총 12분 30초 (오차 0)', () => {
    expect(r.cycles * (r.etchStepS + r.passivationStepS)).toBe(r.totalTimeS);
    expect(r.totalTimeS).toBe(750);
    expect(deepEtchTime({ recipe: 'bosch', cycles: r.cycles }).value).toBeCloseTo(12.5, 12);
  });
  it('깊이 31.2 µm · 평균 식각속도 2.50 µm/min (±1 %)', () => {
    expect(r.depthUm).toBeCloseTo(31.2, 10);
    expect(rel(deepEtchAverageRate('bosch').value, 2.5)).toBeLessThanOrEqual(0.01);
  });
  it('사이클당 깊이 1.04 µm/cycle (S160 역산, 원장 §3-4)', () => {
    expect(rel(deepEtchCycleDepth('bosch').value, 1.04)).toBeLessThanOrEqual(0.01);
  });
  it('Si:SiO₂ 선택비 138', () => {
    expect(deepEtchOxideSelectivity('bosch').value).toBe(138);
  });
});

describe('R136 — S160 Table 1+2: STiGer 극저온 심도식각 (㉮ 측정값, ±1 %)', () => {
  const r = deepEtchRecipe('stiger');
  it('레시피 조건이 표와 일치한다 (30 사이클 · 15 s / 7 s · −90.0 °C)', () => {
    expect(r.cycles).toBe(30);
    expect(r.etchStepS).toBe(15);
    expect(r.passivationStepS).toBe(7);
    expect(r.substrateTempC).toBeCloseTo(-90.0, 10);
  });
  it('㉰ 대수 항등 — 30 × 22 s = 660 s = 11 min (오차 0)', () => {
    expect(r.cycles * (r.etchStepS + r.passivationStepS)).toBe(r.totalTimeS);
    expect(r.totalTimeS).toBe(660);
    expect(deepEtchTime({ recipe: 'stiger', cycles: r.cycles }).value).toBeCloseTo(11, 12);
  });
  it('깊이 27.8 µm · 평균 식각속도 2.53 µm/min (±1 %) · 선택비 185', () => {
    expect(r.depthUm).toBeCloseTo(27.8, 10);
    expect(rel(deepEtchAverageRate('stiger').value, 2.53)).toBeLessThanOrEqual(0.01);
    expect(deepEtchOxideSelectivity('stiger').value).toBe(185);
  });
  it('🔴 극저온 레시피가 상온 Bosch 보다 선택비가 높다 (185 > 138)', () => {
    expect(deepEtchOxideSelectivity('stiger').value)
      .toBeGreaterThan(deepEtchOxideSelectivity('bosch').value);
  });
});

describe('R137 — S161 Fig. 2: RIE lag(ARDE) 10.8 % (㉮ 측정값, ±0.2 %p)', () => {
  it('20 µm 38.8 µm vs 5 µm 34.6 µm → 10.8 %', () => {
    const got = rieLag({
      wideDepthUm: RIE_LAG_WIDE_DEPTH_UM.value,
      narrowDepthUm: RIE_LAG_NARROW_DEPTH_UM.value,
    }).value;
    expect(Math.abs(got - 10.8)).toBeLessThanOrEqual(0.2);
  });
  it('🔴 arXiv 프리프린트의 27 % 를 재현하지 않는다 — 게재본 수치를 쓴다', () => {
    const got = rieLag({
      wideDepthUm: RIE_LAG_WIDE_DEPTH_UM.value,
      narrowDepthUm: RIE_LAG_NARROW_DEPTH_UM.value,
    }).value;
    expect(Math.abs(got - 27)).toBeGreaterThan(10);
  });
});

describe('R138 — S161 §2.1: 마스크 선택비 71 (㉮ 측정값, ±2 %)', () => {
  it('141 µm / 2 µm = 71', () => {
    const got = maskSelectivity({
      depthUm: MAX_MEASURED_DEPTH_UM.value, maskConsumedUm: MASK_CONSUMED_UM.value,
    }).value;
    expect(rel(got, 71)).toBeLessThanOrEqual(0.02);
  });
});

describe('R139 — S163 Table I: r_probe/λ_D 실측 3점 (㉮ 측정값, ±1 %)', () => {
  // 🔴 ID=6A 행과 α·t_CL 열은 원장이 제외했다 — 아래 3점만 쓴다.
  const cases: Array<{ neM3: number; teEv: number; lambdaMm: number; ratio: number }> = [
    { neM3: 1.87e14, teEv: 2.30, lambdaMm: 0.825, ratio: 15.4 },
    { neM3: 2.20e14, teEv: 2.27, lambdaMm: 0.755, ratio: 16.8 },
    { neM3: 4.85e14, teEv: 2.97, lambdaMm: 0.582, ratio: 21.8 },
  ];
  for (const c of cases) {
    it(`n_e=${c.neM3} m⁻³ · T_e=${c.teEv} eV → λ_D=${c.lambdaMm} mm · r/λ_D=${c.ratio}`, () => {
      expect(rel(debyeLength({ neM3: c.neM3, teEv: c.teEv }).value, c.lambdaMm))
        .toBeLessThanOrEqual(0.01);
      expect(rel(probeToDebyeRatio({ neM3: c.neM3, teEv: c.teEv }).value, c.ratio))
        .toBeLessThanOrEqual(0.01);
    });
  }
  it('프로브 반경은 S163 의 12.7 mm 다', () => {
    expect(PROBE_RADIUS_MM.value).toBeCloseTo(12.7, 10);
  });
});

describe('R140 — S165 p.27–28: λ_D · ω_pe · 드바이구 입자수 동시검산 (±10 %)', () => {
  // n = 10¹⁴ cm⁻³ = 10²⁰ m⁻³, T = 1 eV
  const neM3 = 1e20, teEv = 1;
  it('ω_pe ≈ 6×10¹¹ s⁻¹', () => {
    expect(rel(electronPlasmaFrequency(neM3).value, 6e11)).toBeLessThanOrEqual(0.1);
  });
  it('λ_D ≈ 7×10⁻⁵ cm', () => {
    const cm = debyeLength({ neM3, teEv }).value / 10;
    expect(rel(cm, 7e-5)).toBeLessThanOrEqual(0.1);
  });
  it('n·λ_D³ ≈ 40', () => {
    expect(rel(debyeSphereCount({ neM3, teEv }).value, 40)).toBeLessThanOrEqual(0.1);
  });
});

describe('R141 — S162 식 (3): Clausing 전달확률 K = ln(α)/α (㉯ 풀이된 예제, ±5 %)', () => {
  it('α = 10 → K = 0.2303', () => {
    expect(rel(clausingTransmission(10).value, 0.2303)).toBeLessThanOrEqual(0.05);
  });
  it('🔴 α < 10 은 계산하지 않고 정지한다 (원문이 유효범위를 명시했다)', () => {
    expect(() => clausingTransmission(5)).toThrow();
  });
});

describe('R144 — S166 Appendix Table 1: KOH 70 °C 면방위별 실측표 (㉮ 측정값)', () => {
  const table: Record<number, { r100: number; r110: number; r111: number }> = {
    30: { r100: 0.797, r110: 1.455, r111: 0.005 },
    40: { r100: 0.599, r110: 1.294, r111: 0.009 },
    50: { r100: 0.539, r110: 0.870, r111: 0.009 },
  };
  it('표가 덮는 농도점은 30 / 40 / 50 wt% 뿐이다', () => {
    expect(KOH_WT_POINTS).toEqual([30, 40, 50]);
    expect(KOH_TABLE_TEMP_C.value).toBe(70);
  });
  for (const [wtStr, e] of Object.entries(table)) {
    const wt = Number(wtStr);
    it(`${wt} wt% — (100)/(110)/(111) 이 표와 일치한다`, () => {
      expect(kohEtchRate({ wtPercent: wt, orientation: '100' }).value).toBeCloseTo(e.r100, 12);
      expect(kohEtchRate({ wtPercent: wt, orientation: '110' }).value).toBeCloseTo(e.r110, 12);
      expect(kohEtchRate({ wtPercent: wt, orientation: '111' }).value).toBeCloseTo(e.r111, 12);
    });
  }
  it('🔴 표 밖 농도(28 wt% · 55 wt%)는 외삽하지 않고 정지한다', () => {
    expect(() => kohEtchRate({ wtPercent: 28, orientation: '100' })).toThrow();
    expect(() => kohEtchRate({ wtPercent: 55, orientation: '100' })).toThrow();
  });
  it('🔴 (110)/(100) 선택비가 40 wt% 에서 최대다 — 문헌이 실제로 측정한 비단조', () => {
    const s30 = kohOrientationSelectivity({ wtPercent: 30, fast: '110', slow: '100' }).value;
    const s40 = kohOrientationSelectivity({ wtPercent: 40, fast: '110', slow: '100' }).value;
    const s50 = kohOrientationSelectivity({ wtPercent: 50, fast: '110', slow: '100' }).value;
    expect(s40).toBeGreaterThan(s30);
    expect(s40).toBeGreaterThan(s50);
    expect(s30).toBeCloseTo(1.455 / 0.797, 10);
    expect(s40).toBeCloseTo(1.294 / 0.599, 10);
    expect(s50).toBeCloseTo(0.870 / 0.539, 10);
  });
  it('🔴 금지된 Seidel 스니펫 비(110:100:111 = 50:30:1)를 쓰지 않는다', () => {
    // 우리 값은 S166 실측이며 50:30:1(=1.667 : 1 : 0.0333)과 명백히 다르다.
    const s = kohOrientationSelectivity({ wtPercent: 40, fast: '110', slow: '100' }).value;
    expect(Math.abs(s - 50 / 30)).toBeGreaterThan(0.2);
    const anis = kohOrientationSelectivity({ wtPercent: 40, fast: '100', slow: '111' }).value;
    expect(Math.abs(anis - 30)).toBeGreaterThan(10); // 실제 66.6
  });
  it('출처 표기가 S166 이다', () => {
    expect(kohEtchRate({ wtPercent: 40, orientation: '100' }).sourceId).toBe('S166');
  });
});

describe('이방성도 A = 1 − v_lat/v_vert (정의식, S172)', () => {
  it('완전 이방성·완전 등방성의 양 끝이 정의대로다', () => {
    expect(anisotropyDegree({ lateralRate: 0, verticalRate: 1 }).value).toBe(1);
    expect(anisotropyDegree({ lateralRate: 1, verticalRate: 1 }).value).toBe(0);
  });
  it('KOH 40 wt% 70 °C 이방성도 = 1 − 0.009/0.599', () => {
    expect(kohAnisotropyDegree(40).value).toBeCloseTo(1 - 0.009 / 0.599, 12);
  });
});

describe('S167 식 (1) — 셀프바이어스 면적비칙 (㉰ 대수 항등, 등급 B)', () => {
  it('지수 q = 4 이며 V₁/V₂ = (A₂/A₁)⁴ 다', () => {
    expect(selfBiasExponent()).toBe(4);
    expect(selfBiasVoltageRatio(2).value).toBe(16);
    expect(selfBiasVoltageRatio(3).value).toBe(81);
  });
  it('🔴 이상화 한계임을 가정문에 남긴다', () => {
    expect(selfBiasVoltageRatio(2).assumptions.join(' ')).toMatch(/이상화 한계/);
  });
});

describe('S168 · S172 — OES 엔드포인트 파장', () => {
  const expected: Array<[Parameters<typeof endpointWavelength>[0], number]> = [
    ['SiF', 440.2], ['SiO2', 248.6], ['Si', 505.6],
    ['CO_in_SiO2', 483.5], ['CO_in_SiC', 482.5],
    ['Al', 308.2], ['F_703', 703.7], ['F_685', 685.4], ['F_712', 712.8], ['H', 656.5],
  ];
  for (const [id, nm] of expected) {
    it(`${id} = ${nm} nm`, () => {
      expect(endpointWavelength(id).value).toBeCloseTo(nm, 10);
    });
  }
  it('🔴 CO 는 문맥으로 갈린다 — SiO₂ 483.5 / SiC 482.5, 출처도 다르다', () => {
    expect(carbonMonoxideLine('SiO2').value).toBeCloseTo(483.5, 10);
    expect(carbonMonoxideLine('SiO2').sourceId).toBe('S172');
    expect(carbonMonoxideLine('SiC').value).toBeCloseTo(482.5, 10);
    expect(carbonMonoxideLine('SiC').sourceId).toBe('S168');
  });
});

describe('🔴 깊이는 사이클 수에 비례한다 (S160 사이클당 깊이 역산)', () => {
  it('30 사이클이면 문헌 깊이 31.2 µm 를 되돌려준다', () => {
    expect(deepEtchDepth({ recipe: 'bosch', cycles: 30 }).value).toBeCloseTo(31.2, 10);
  });
  it('사이클 수 범위 밖(0 · 200)은 정지한다', () => {
    expect(() => deepEtchDepth({ recipe: 'bosch', cycles: 0 })).toThrow();
    expect(() => deepEtchDepth({ recipe: 'bosch', cycles: 200 })).toThrow();
  });
});
