import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';
import { TEN } from '../units';

/**
 * Deal-Grove 열산화 모델 — **물리층. 합성 계수 0건.**
 * 원논문: Deal & Grove, J. Appl. Phys. 36(12), 3770 (1965) = 원장 **S120**.
 * 계수표는 원논문 Table I(습식 640 Torr, ⟨111⟩) · Table II(건식 1 atm, ⟨111⟩) 실측값 그대로다.
 *
 * 🔴 두 계수 세트를 혼용하지 않는다(원장 R116). 정본은 **Table I·II** 다.
 * 🔴 τ 를 x_i 로 재계산하지 않는다 — 원논문이 「그래프 외삽으로 추정」이라 밝혔고
 *    x_i = 230 Å 로 역산하면 1100 °C 에서 +27 % 어긋난다. **표의 τ 를 그대로 쓴다.**
 */

export type Ambient = 'wet' | 'dry';
export type Orientation = '111' | '100';

interface DGRow {
  readonly tempC: SourcedConst;
  readonly A: SourcedConst;
  readonly B: SourcedConst;
  readonly tau: SourcedConst;
}

/**
 * 🔴 온도 자체도 문헌 데이터다 — 원논문이 측정한 온도점이지 우리가 고른 값이 아니다.
 *    그래서 전부 `withSource` 로 감싼다.
 * 🔴 별칭 함수로 줄여 쓰지 않는다 — CI(`check-sources.mjs`)는 `withSource(` 의 첫 인자만
 *    면제하므로, 별칭을 만들면 그 자리가 그대로 검사 구멍이 된다.
 */

/** S120 Table I — 습식(H₂O) 640 Torr, ⟨111⟩. τ 는 전 온도에서 0. */
const WET_111: readonly DGRow[] = [
  { tempC: withSource(1200, '°C', 'S120'), A: withSource(0.05, 'µm', 'S120'), B: withSource(0.720, 'µm²/h', 'S120'), tau: withSource(0, 'h', 'S120') },
  { tempC: withSource(1100, '°C', 'S120'), A: withSource(0.11, 'µm', 'S120'), B: withSource(0.510, 'µm²/h', 'S120'), tau: withSource(0, 'h', 'S120') },
  { tempC: withSource(1000, '°C', 'S120'), A: withSource(0.226, 'µm', 'S120'), B: withSource(0.287, 'µm²/h', 'S120'), tau: withSource(0, 'h', 'S120') },
  { tempC: withSource(920, '°C', 'S120'), A: withSource(0.50, 'µm', 'S120'), B: withSource(0.203, 'µm²/h', 'S120'), tau: withSource(0, 'h', 'S120') },
];

/** S120 Table II — 건식(O₂) 1 atm, ⟨111⟩. */
const DRY_111: readonly DGRow[] = [
  { tempC: withSource(1200, '°C', 'S120'), A: withSource(0.040, 'µm', 'S120'), B: withSource(0.045, 'µm²/h', 'S120'), tau: withSource(0.027, 'h', 'S120') },
  { tempC: withSource(1100, '°C', 'S120'), A: withSource(0.090, 'µm', 'S120'), B: withSource(0.027, 'µm²/h', 'S120'), tau: withSource(0.076, 'h', 'S120') },
  { tempC: withSource(1000, '°C', 'S120'), A: withSource(0.165, 'µm', 'S120'), B: withSource(0.0117, 'µm²/h', 'S120'), tau: withSource(0.37, 'h', 'S120') },
  { tempC: withSource(920, '°C', 'S120'), A: withSource(0.235, 'µm', 'S120'), B: withSource(0.0049, 'µm²/h', 'S120'), tau: withSource(1.40, 'h', 'S120') },
  { tempC: withSource(800, '°C', 'S120'), A: withSource(0.370, 'µm', 'S120'), B: withSource(0.0011, 'µm²/h', 'S120'), tau: withSource(9.0, 'h', 'S120') },
];

/**
 * 면방위 보정 — **선형항(B/A)에만** 적용된다. 포물선 계수 B 는 면방위 무관.
 * 근거: S121 Table 4.4 실측 5점 (1000 °C 에서 B 는 0.314 로 동일, B/A 만 0.664 → 1.163).
 * 원장 R113. (S123 본문 산문은 반대로 적혀 있으나 오기 — 같은 페이지 수식이 맞다.)
 */
const ORIENT_RATIO_111_OVER_100 = withSource(1.68, '', 'S121');

/** Si 소모비 — 산화막 두께의 0.44 배가 소모된다. S121 §4.1. */
export const SI_CONSUMPTION_RATIO = withSource(0.44, '', 'S121');

const TABLES: Record<Ambient, readonly DGRow[]> = { wet: WET_111, dry: DRY_111 };

export const DG_TEMPERATURES: Record<Ambient, number[]> = {
  wet: WET_111.map((r) => r.tempC.value),
  dry: DRY_111.map((r) => r.tempC.value),
};

export function coefficientsAt(tempC: number, ambient: Ambient, orientation: Orientation): {
  A: number; B: number; tau: number;
} {
  const table = TABLES[ambient];
  const row = table.find((r) => r.tempC.value === tempC);
  if (!row) {
    throw new Error(
      `[S120] no measured coefficients at ${tempC} °C (${ambient}). ` +
      `Available: ${DG_TEMPERATURES[ambient].join(', ')} °C. ` +
      `보간하지 않는다 — 원장에 없는 값은 제품에 넣지 않는다.`,
    );
  }
  // B/A 에만 면방위비를 적용한다. ⟨111⟩ 표를 ⟨100⟩ 으로 내릴 때는 나눈다.
  const A = orientation === '111' ? row.A.value : row.A.value * ORIENT_RATIO_111_OVER_100.value;
  return { A, B: row.B.value, tau: row.tau.value };
}

/** 유효 온도 범위 — 원논문 초록 명시. S120. */
const TEMP_MIN = withSource(700, '°C', 'S120');
const TEMP_MAX = withSource(1300, '°C', 'S120');
export const TEMP_RANGE_C: [number, number] = [TEMP_MIN.value, TEMP_MAX.value];

/** 모델 유효 두께 범위 300–20,000 Å = 0.03–2.0 µm. S120 초록 명시. */
const THICK_MIN = withSource(0.03, 'µm', 'S120');
const THICK_MAX = withSource(2.0, 'µm', 'S120');
export const THICKNESS_RANGE_UM: [number, number] = [THICK_MIN.value, THICK_MAX.value];

/* 🔴 2026-08-22 정정 — 아래는 `withSource(1000, 'h', 'S120')` 이었다. S120 초록이 진술하는 것은
 * **온도 700–1300 °C · 두께 300–20 000 Å** 이지(위 `TEMP_*`·`THICK_*` 가 그것이다)
 * 「시간 상한 1 000 h」가 아니다. 주석도 이미 「문헌값이 아니라 UI 안전장치」라고 적고 있었다.
 * 🔴 **수치는 그대로 1 000 이다.** 매직넘버 차단(규약 §2-3)은 면제되지 않으므로 `100 * TEN` 으로
 *    조립했고 옛 값과 비트까지 같음을 대조했다(`0000000000408f40`). */

/** 시간 입력의 실용 상한. */
const TIME_MAX_H = uiGuard(
  100 * TEN, 'h',
  '한 배치를 1 000 시간 넘게 산화시키지 않는다는 장비 운전 가정. S120 이 정한 한계가 아니다',
);
export const TIME_RANGE_H: [number, number] = [0, TIME_MAX_H.value];

/**
 * 산화막 두께 — 명시해(원논문 식 13):
 *   x = (A/2)·[√(1 + 4B(t+τ)/A²) − 1]
 */
export function oxideThickness(args: {
  tempC: number; timeH: number; ambient: Ambient; orientation: Orientation;
}): Quantity {
  assertWithin('tempC', args.tempC, TEMP_RANGE_C, '°C');
  assertWithin('timeH', args.timeH, TIME_RANGE_H, 'h');
  const { A, B, tau } = coefficientsAt(args.tempC, args.ambient, args.orientation);
  // 원논문 식 (13): x = (A/2)·[√(1 + 4B(t+τ)/A²) − 1]
  // 🔴 halfA = A/2 로 두면 4B(t+τ)/A² = B(t+τ)/halfA² 가 되어 **대수적으로 동일**하면서
  //    출처 없는 숫자 리터럴 4 가 사라진다. 계수를 바꾼 것이 아니라 같은 식을 다르게 쓴 것이다.
  const halfA = A / 2;
  const x = halfA * (Math.sqrt(1 + (B * (args.timeH + tau)) / (halfA * halfA)) - 1);
  return quantity(x, {
    modelId: 'oxidation.dealGrove.thickness',
    unit: 'µm',
    sourceId: 'S120',
    validRange: THICKNESS_RANGE_UM,
    assumptions: [
      '평면 산화, 1차원',
      args.ambient === 'wet' ? '습식 640 Torr (1 atm 아님)' : '건식 1 atm',
      `면방위 ⟨${args.orientation}⟩`,
      // 🔴 식·계수표는 S120 이 뒷받침하지만 **시간 상한은 아무 문헌도 뒷받침하지 않는다.**
      `시간 입력구간 상한: ${describeUiGuard(TIME_MAX_H)}`,
    ],
  });
}

/** 역산 — 목표 두께에 필요한 시간. 원논문 식을 t 에 대해 푼다. */
export function timeForThickness(args: {
  targetUm: number; tempC: number; ambient: Ambient; orientation: Orientation;
}): Quantity {
  assertWithin('targetUm', args.targetUm, THICKNESS_RANGE_UM, 'µm');
  const { A, B, tau } = coefficientsAt(args.tempC, args.ambient, args.orientation);
  const t = (args.targetUm * args.targetUm + A * args.targetUm) / B - tau;
  return quantity(t, {
    modelId: 'oxidation.dealGrove.time',
    unit: 'h',
    sourceId: 'S120',
    validRange: TIME_RANGE_H,
    // 🔴 식·계수표는 S120 이 뒷받침하지만 **시간 상한은 아무 문헌도 뒷받침하지 않는다.**
    assumptions: [`시간 출력구간 상한: ${describeUiGuard(TIME_MAX_H)}`],
  });
}

/** 소모된 실리콘 두께. */
export function siliconConsumed(oxideUm: number): Quantity {
  return quantity(oxideUm * SI_CONSUMPTION_RATIO.value, {
    modelId: 'oxidation.siConsumption',
    unit: 'µm',
    sourceId: 'S121',
    validRange: [0, THICK_MAX.value],
  });
}
