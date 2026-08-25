import { assertWithin, describeUiGuard, quantity, uiGuard, type Quantity } from '../../contract';

/**
 * 시드단 저항률 측정(4점 프로브 · 벌크 조건) — **물리층. 합성 계수 0건.**
 *
 * 출처: *Measurement of Semiconductor Resistivity using a Four Point Probe*,
 * UT Austin FabLab Manual (file 4PTPR) = 원장 **S203** (원 표는 Smits 1958 · Valdes 1954).
 *
 * 🔴 **중복 구현하지 않았다.** 유한 시료 보정계수 CF_d(R170)·두께 보정 CF_t(R171)·박막 시트저항은
 *    이미 `src/models/physics/metal/fourPointProbe.ts` 에 있다. 여기에는 **원장 R105 가 요구하는
 *    반무한(벌크) 조건 ρ = 2π·s·(V/I) 하나만** 둔다. 같은 표를 두 곳에 적지 않는다(원장 규칙 8).
 */

/* 🔴 2026-08-21 정정 — 아래 둘은 `withSource(…, 'S203')` 이었다. S203 이 진술하는 것은
 * 보정계수 표와 ρ = 2π·s·(V/I) 식이지 **「V/I 상한 10⁶ Ω」·「탐침 간격 상한 1 cm」가 아니다.**
 * 주석도 이미 「실용 상한」이라고 적고 있었다. 수치는 그대로 두고 표기만 고쳤다. */

/** 측정 저항 V/I 의 실용 상한 (10⁶ Ω). */
const V_OVER_I_MAX = uiGuard(
  100 * 100 * 100, 'Ω',
  '측정기가 실용적으로 읽어 주는 저항 상한. S203 이 정한 한계가 아니다',
);
export const WAFER_PROBE_V_OVER_I_RANGE: [number, number] = [Number.MIN_VALUE, V_OVER_I_MAX.value];
/** 탐침 간격 s 의 실용 상한(표준 헤드는 1 mm). */
const SPACING_MAX_CM = uiGuard(
  1, 'cm',
  '표준 4탐침 헤드(간격 1 mm)의 10배까지 열어 둔 입력 상한. 문헌 근거 없음',
);
export const WAFER_PROBE_SPACING_RANGE_CM: [number, number] = [Number.MIN_VALUE, SPACING_MAX_CM.value];

/**
 * 두꺼운 시료(반무한) 저항률: **ρ = 2π·s·(V/I)**.
 * 원장 **R105** 의 첫 단계다 — s = 1 mm, V/I = 10 Ω → ρ = 6.283 Ω·cm (문헌 인쇄값 6.3 Ω·cm).
 */
export function bulkResistivityFourPoint(args: { vOverIOhm: number; spacingCm: number }): Quantity {
  assertWithin('vOverIOhm', args.vOverIOhm, WAFER_PROBE_V_OVER_I_RANGE, 'Ω');
  assertWithin('spacingCm', args.spacingCm, WAFER_PROBE_SPACING_RANGE_CM, 'cm');
  return quantity(2 * Math.PI * args.spacingCm * args.vOverIOhm, {
    modelId: 'wafer.probe.bulkResistivity',
    unit: 'Ω·cm',
    sourceId: 'S203',
    validRange: [0, 2 * Math.PI * SPACING_MAX_CM.value * V_OVER_I_MAX.value],
    assumptions: [
      '시료 두께 t ≫ 탐침 간격 s (반무한 시료 근사) — 잉곳 시드단 검사 조건',
      '탐침 4개 등간격 일직선 배치',
      '박막·유한시료 보정계수는 metal/fourPointProbe.ts 가 담당한다',
      // 🔴 식은 S203(R105)이 뒷받침하지만 **범위선은 아무 문헌도 뒷받침하지 않는다.**
      `V/I 입력구간: ${describeUiGuard(V_OVER_I_MAX)}`,
      `탐침 간격 입력구간: ${describeUiGuard(SPACING_MAX_CM)}`,
    ],
  });
}
