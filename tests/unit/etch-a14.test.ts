// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError, type Quantity } from '@/models/contract';
import {
  kohEtchRate, kohAnisotropyDegree, kohOrientationSelectivity, wetArrheniusRate,
  wetArrheniusCoefficients, anisotropyDegree, KOH_WT_RANGE, WET_TEMP_RANGE_C,
} from '@/models/physics/etch/wetEtch';
import {
  clausingTransmission, deepEtchAverageRate, deepEtchCycleDepth, deepEtchDepth, deepEtchTime,
  maskSelectivity, rieLag, selfBiasVoltageRatio, CLAUSING_ALPHA_RANGE, CYCLE_COUNT_RANGE,
  MASK_CONSUMED_RANGE_UM, AREA_RATIO_RANGE, MAX_MEASURED_DEPTH_UM,
} from '@/models/physics/etch/dryEtch';
import {
  debyeLength, debyeSphereCount, electronPlasmaFrequency, probeToDebyeRatio,
  NE_RANGE_M3, TE_RANGE_EV,
} from '@/models/physics/etch/plasma';
import { endpointLineIds, endpointWavelength } from '@/models/physics/etch/oes';

/**
 * 🔴 A14 — 식각 계산 정확성 (규약 §0-3).
 *  1. 결정론   — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조 3점 이상
 *  3. 경계 안정성 — 전 파라미터 min·max·경계에서 NaN·Infinity 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위를 갖고 차원이 맞는다
 *
 * 🔴 **R142·R143 이 여기 있다.** 원장이 ㉴(조사자 재계산)로 분류해 T2 골든이 아니라 T1 로 옮겼다 —
 *    문헌이 인쇄한 것은 r₀·E_a 이고 80 °C 값은 조사자가 계산한 것이다.
 */

const KB = 8.617e-5; // eV/K — 회사 규약값(후공정 원장 S54)
const KELVIN0 = 273.15;
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('습식 아레니우스를 200회 반복해도 비트 단위로 같다', () => {
    const first = wetArrheniusRate({ etchant: 'NaOH50', tempC: 80 }).value;
    for (let i = 0; i < 200; i++) {
      expect(wetArrheniusRate({ etchant: 'NaOH50', tempC: 80 }).value).toBe(first);
    }
  });
  it('KOH 표 보간을 200회 반복해도 비트 단위로 같다', () => {
    const first = kohEtchRate({ wtPercent: 37.3, orientation: '110' }).value;
    for (let i = 0; i < 200; i++) {
      expect(kohEtchRate({ wtPercent: 37.3, orientation: '110' }).value).toBe(first);
    }
  });
  it('시각이 달라져도 값이 변하지 않는다', async () => {
    const a = clausingTransmission(23.7).value;
    await new Promise((r) => setTimeout(r, 20));
    expect(clausingTransmission(23.7).value).toBe(a);
  });
});

describe('A14-2 수치 정확성 — 손계산 대조 (5점)', () => {
  it('① R142 — NaOH 50 %, 80 °C: r₀·exp(−E_a/kT) ≈ 72 µm/h (±15 %)', () => {
    const { r0, eaEv } = wetArrheniusCoefficients('NaOH50');
    expect(r0).toBe(3.7e11);
    expect(eaEv).toBe(0.68);
    const hand = r0 * Math.exp(-eaEv / (KB * (80 + KELVIN0)));
    const got = wetArrheniusRate({ etchant: 'NaOH50', tempC: 80 }).value;
    expect(got).toBeCloseTo(hand, 9);
    expect(rel(got, 72)).toBeLessThanOrEqual(0.15);
    // 원장이 함께 인쇄한 분당 환산 1.20 µm/min
    expect(rel(got / 60, 1.2)).toBeLessThanOrEqual(0.15);
  });
  it('② R143 — TMAH 25 %, 80 °C: ≈ 22 µm/h (±15 %)', () => {
    const { r0, eaEv } = wetArrheniusCoefficients('TMAH25');
    expect(r0).toBe(3.0e9);
    expect(eaEv).toBe(0.57);
    const hand = r0 * Math.exp(-eaEv / (KB * (80 + KELVIN0)));
    const got = wetArrheniusRate({ etchant: 'TMAH25', tempC: 80 }).value;
    expect(got).toBeCloseTo(hand, 9);
    expect(rel(got, 22)).toBeLessThanOrEqual(0.15);
    expect(rel(got / 60, 0.37)).toBeLessThanOrEqual(0.15);
  });
  it('③ Clausing K(10) = ln(10)/10 = 0.2302585…', () => {
    expect(clausingTransmission(10).value).toBeCloseTo(Math.log(10) / 10, 15);
    expect(clausingTransmission(10).value).toBeCloseTo(0.2302585093, 9);
  });
  it('④ KOH 농도축 선형보간 — 35 wt% (100) = (0.797+0.599)/2 = 0.698 µm/min', () => {
    expect(kohEtchRate({ wtPercent: 35, orientation: '100' }).value)
      .toBeCloseTo((0.797 + 0.599) / 2, 12);
    expect(kohEtchRate({ wtPercent: 45, orientation: '110' }).value)
      .toBeCloseTo((1.294 + 0.870) / 2, 12);
  });
  it('⑤ RIE lag = (38.8 − 34.6)/38.8 × 100 = 10.8247 %', () => {
    expect(rieLag({ wideDepthUm: 38.8, narrowDepthUm: 34.6 }).value)
      .toBeCloseTo(((38.8 - 34.6) / 38.8) * 100, 12);
  });
  it('⑥ 마스크 선택비 141/2 = 70.5 · 셀프바이어스 2⁴ = 16', () => {
    expect(maskSelectivity({ depthUm: 141, maskConsumedUm: 2 }).value).toBeCloseTo(70.5, 12);
    expect(selfBiasVoltageRatio(2).value).toBe(16);
  });
});

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
  expect(q.unit.length >= 0, `${label} unit`).toBe(true);
}

const STEPS = 60;
function sweep(from: number, to: number, fn: (x: number) => void): void {
  for (let i = 0; i <= STEPS; i++) fn(from + ((to - from) * i) / STEPS);
}

describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('습식: 28–80 °C × 2 에천트', () => {
    let n = 0;
    for (const etchant of ['NaOH50', 'TMAH25'] as const) {
      sweep(WET_TEMP_RANGE_C[0], WET_TEMP_RANGE_C[1], (tempC) => {
        assertFinite(wetArrheniusRate({ etchant, tempC }), `wet ${etchant} ${tempC}`);
        n++;
      });
    }
    expect(n).toBe((STEPS + 1) * 2);
  });
  it('KOH: 30–50 wt% × 3 면방위 + 선택비 + 이방성도', () => {
    for (const orientation of ['100', '110', '111'] as const) {
      sweep(KOH_WT_RANGE[0], KOH_WT_RANGE[1], (wt) => {
        assertFinite(kohEtchRate({ wtPercent: wt, orientation }), `koh ${orientation} ${wt}`);
      });
    }
    sweep(KOH_WT_RANGE[0], KOH_WT_RANGE[1], (wt) => {
      assertFinite(kohAnisotropyDegree(wt), `anis ${wt}`);
      assertFinite(kohOrientationSelectivity({ wtPercent: wt, fast: '110', slow: '100' }), `sel ${wt}`);
      const a = kohAnisotropyDegree(wt).value;
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(1);
    });
  });
  it('건식: 사이클 1–100 · 종횡비 10–100 · 마스크 0.5–2 µm · 면적비 1–100', () => {
    sweep(CYCLE_COUNT_RANGE[0], CYCLE_COUNT_RANGE[1], (c) => {
      assertFinite(deepEtchDepth({ recipe: 'bosch', cycles: c }), `depth ${c}`);
      assertFinite(deepEtchTime({ recipe: 'stiger', cycles: c }), `time ${c}`);
    });
    sweep(CLAUSING_ALPHA_RANGE[0], CLAUSING_ALPHA_RANGE[1], (a) => {
      assertFinite(clausingTransmission(a), `clausing ${a}`);
    });
    sweep(MASK_CONSUMED_RANGE_UM[0], MASK_CONSUMED_RANGE_UM[1], (m) => {
      assertFinite(maskSelectivity({ depthUm: MAX_MEASURED_DEPTH_UM.value, maskConsumedUm: m }), `sel ${m}`);
    });
    sweep(AREA_RATIO_RANGE[0], AREA_RATIO_RANGE[1], (r) => {
      assertFinite(selfBiasVoltageRatio(r), `bias ${r}`);
    });
    assertFinite(deepEtchAverageRate('bosch'), 'avg bosch');
    assertFinite(deepEtchCycleDepth('stiger'), 'cycle stiger');
  });
  it('플라즈마: n_e 1.09×10¹⁴–10²⁰ m⁻³ × T_e 1–4.26 eV (로그 스윕)', () => {
    const lo = Math.log(NE_RANGE_M3[0]);
    const hi = Math.log(NE_RANGE_M3[1]);
    for (let i = 0; i <= STEPS; i++) {
      // 로그 스윕의 양 끝은 exp/log 왕복 오차로 경계를 1 ulp 넘길 수 있어 정확히 고정한다.
      const raw = Math.exp(lo + ((hi - lo) * i) / STEPS);
      const neM3 = Math.min(Math.max(raw, NE_RANGE_M3[0]), NE_RANGE_M3[1]);
      for (const teEv of [TE_RANGE_EV[0], 2.3, TE_RANGE_EV[1]]) {
        assertFinite(debyeLength({ neM3, teEv }), `lam ${neM3} ${teEv}`);
        assertFinite(debyeSphereCount({ neM3, teEv }), `nd ${neM3} ${teEv}`);
        assertFinite(probeToDebyeRatio({ neM3, teEv }), `ratio ${neM3} ${teEv}`);
      }
      assertFinite(electronPlasmaFrequency(neM3), `wpe ${neM3}`);
    }
  });
  it('범위 밖 입력은 NaN 을 흘리지 않고 OutOfLimitError 로 정지한다', () => {
    const cases: Array<() => unknown> = [
      () => wetArrheniusRate({ etchant: 'NaOH50', tempC: 27 }),
      () => wetArrheniusRate({ etchant: 'NaOH50', tempC: 81 }),
      () => kohEtchRate({ wtPercent: 29.9, orientation: '100' }),
      () => kohEtchRate({ wtPercent: 50.1, orientation: '100' }),
      () => clausingTransmission(9.9),
      () => clausingTransmission(101),
      () => deepEtchDepth({ recipe: 'bosch', cycles: 0 }),
      () => maskSelectivity({ depthUm: 141, maskConsumedUm: 0.4 }),
      () => selfBiasVoltageRatio(0.5),
      () => debyeLength({ neM3: 1e13, teEv: 2 }),
      () => debyeLength({ neM3: 1e18, teEv: 5 }),
      () => anisotropyDegree({ lateralRate: 2, verticalRate: 1 }),
      () => anisotropyDegree({ lateralRate: 1, verticalRate: 0 }),
      () => wetArrheniusRate({ etchant: 'NaOH50', tempC: Number.NaN }),
    ];
    for (const f of cases) expect(f).toThrow(OutOfLimitError);
  });
});

describe('A14-4 단위 일관성', () => {
  it('모든 출력이 기대 단위를 단다', () => {
    expect(kohEtchRate({ wtPercent: 40, orientation: '100' }).unit).toBe('µm/min');
    expect(wetArrheniusRate({ etchant: 'NaOH50', tempC: 70 }).unit).toBe('µm/h');
    expect(deepEtchDepth({ recipe: 'bosch', cycles: 30 }).unit).toBe('µm');
    expect(deepEtchTime({ recipe: 'bosch', cycles: 30 }).unit).toBe('min');
    expect(deepEtchAverageRate('bosch').unit).toBe('µm/min');
    expect(deepEtchCycleDepth('bosch').unit).toBe('µm/cycle');
    expect(rieLag({ wideDepthUm: 38.8, narrowDepthUm: 34.6 }).unit).toBe('%');
    expect(debyeLength({ neM3: 1e18, teEv: 2 }).unit).toBe('mm');
    expect(electronPlasmaFrequency(1e18).unit).toBe('s⁻¹');
    expect(endpointWavelength('SiF').unit).toBe('nm');
  });
  it('무차원량은 빈 단위를 단다', () => {
    for (const q of [
      clausingTransmission(20),
      maskSelectivity({ depthUm: 141, maskConsumedUm: 2 }),
      selfBiasVoltageRatio(2),
      kohAnisotropyDegree(40),
      debyeSphereCount({ neM3: 1e18, teEv: 2 }),
      probeToDebyeRatio({ neM3: 1e18, teEv: 2 }),
    ]) expect(q.unit).toBe('');
  });
  it('차원 정합 — 사이클당 깊이 × 사이클 수 = 깊이, 평균속도 × 시간 = 깊이', () => {
    const cycles = 17;
    const depth = deepEtchDepth({ recipe: 'bosch', cycles }).value;
    expect(depth).toBeCloseTo(deepEtchCycleDepth('bosch').value * cycles, 10);
    const t = deepEtchTime({ recipe: 'bosch', cycles }).value;
    expect(deepEtchAverageRate('bosch').value * t).toBeCloseTo(depth, 9);
  });
  it('모든 출력에 원장 S번호가 붙어 있다', () => {
    const quantities: Quantity[] = [
      kohEtchRate({ wtPercent: 40, orientation: '100' }),
      wetArrheniusRate({ etchant: 'TMAH25', tempC: 60 }),
      kohAnisotropyDegree(40),
      deepEtchDepth({ recipe: 'bosch', cycles: 30 }),
      deepEtchAverageRate('stiger'),
      rieLag({ wideDepthUm: 38.8, narrowDepthUm: 34.6 }),
      maskSelectivity({ depthUm: 141, maskConsumedUm: 2 }),
      clausingTransmission(20),
      selfBiasVoltageRatio(2),
      debyeLength({ neM3: 1e18, teEv: 2 }),
      electronPlasmaFrequency(1e18),
      debyeSphereCount({ neM3: 1e18, teEv: 2 }),
      probeToDebyeRatio({ neM3: 1e18, teEv: 2 }),
      ...endpointLineIds().map((id) => endpointWavelength(id)),
    ];
    for (const q of quantities) expect(q.sourceId).toMatch(/^S\d+$/);
    expect(quantities.length).toBeGreaterThanOrEqual(20);
  });
});
