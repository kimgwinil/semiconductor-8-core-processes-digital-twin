import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';
import { TEN } from '../units';
import { CM_PER_M, NM_PER_M } from './units';

/**
 * 4탐침(four-point probe) 면저항 — **물리층. 합성 계수 0건.**
 *
 *   R_s = CF · (V / I)          CF = CF_d(시료 지름) × CF_t(시료 두께)
 *
 * 출처: 원장 **R169·R170·R171** = **S203** Table 1(원 Smits 1958) · Table 2(원 Valdes 1954).
 * 🔴 표에 없는 d/s · t/s 는 **보간하지 않고 거부**한다(원장 규칙 1).
 */

/** 🔴 무한 시료 보정계수 = **4.5324** (= π/ln 2). S203 Table 1 · 원장 R169. */
export const CF_INFINITE = withSource(4.5324, '', 'S203');

/** S203 Table 1 — 유한 원형 시료 보정계수 CF_d (a/d ≥ 4). 원장 R170. */
const CF_DIAMETER_TABLE: ReadonlyArray<{ ratio: SourcedConst; cf: SourcedConst }> = [
  { ratio: withSource(40, '', 'S203'), cf: withSource(4.5129, '', 'S203') },
  { ratio: withSource(20, '', 'S203'), cf: withSource(4.4553, '', 'S203') },
  { ratio: withSource(10, '', 'S203'), cf: withSource(4.2357, '', 'S203') },
  { ratio: withSource(5, '', 'S203'), cf: withSource(3.5750, '', 'S203') },
  { ratio: withSource(3, '', 'S203'), cf: withSource(2.7005, '', 'S203') },
];

/** S203 Table 2 — 두께 보정계수 CF_t. 원장 R171. */
const CF_THICKNESS_TABLE: ReadonlyArray<{ ratio: SourcedConst; cf: SourcedConst }> = [
  { ratio: withSource(0.5, '', 'S203'), cf: withSource(0.9974, '', 'S203') },
  { ratio: withSource(0.625, '', 'S203'), cf: withSource(0.9898, '', 'S203') },
  { ratio: withSource(1.0, '', 'S203'), cf: withSource(0.9214, '', 'S203') },
  { ratio: withSource(2.0, '', 'S203'), cf: withSource(0.6336, '', 'S203') },
];

/** t/s < 0.5 이면 CF_t ≈ 1 로 두어도 된다 — S203 이 명시한 근사 조건. */
export const CF_T_UNITY_LIMIT = withSource(0.5, '', 'S203');

export const CF_DIAMETER_RATIOS: number[] = CF_DIAMETER_TABLE.map((r) => r.ratio.value);
export const CF_THICKNESS_RATIOS: number[] = CF_THICKNESS_TABLE.map((r) => r.ratio.value);

/* ───────────────────────── 입력·출력 범위 — 전부 UI 안전장치다 ─────────────────────────
 * 🔴 2026-08-21 정정. 아래 넷은 종전에 **전부 `withSource(…, 'S203')`** 였다.
 *    S203 이 진술하는 것은 **Table 1·2·3 의 보정계수와 CF_t ≈ 1 근사 조건**뿐이다 —
 *    「측정 전류 1 nA~1 A」·「전압 100 V」·「면저항 10⁹ Ω/sq」는 그 문서 어디에도 없다.
 *    주석이 이미 「4탐침 장비 상식」이라고 적어 스스로 근거를 부정하고 있었다.
 * 🔴 **수치는 그대로다.** 1e-9 · 1 · 100 · 1e9. 조립만 허용 리터럴로 바꿨다(규약 §2-3).
 * 🔴 이 파일에서 S203 의 정당한 인용은 **CF 표 3종과 CF_INFINITE·CF_T_UNITY_LIMIT** 이다. */

/** **4탐침 측정** 전류 유효구간 [A] — 1 nA ~ 1 A.
 *  🔴 `electroplating.ts` 의 `PLATING_CURRENT_MAX_A`(1000 A) 와 **다른 물리량**이다 — 통일하지 말 것. */
const PROBE_CURRENT_MIN_A = uiGuard(
  1 / (100 * 100 * 100 * TEN * TEN * TEN), 'A',
  '전류원 분해능 아래(1 nA 미만)를 막는 입력 하한. 4탐침 장비 상식이지 S203 의 진술이 아니다',
);
const PROBE_CURRENT_MAX_A = uiGuard(
  1, 'A',
  '시료를 태우지 않는 측정 전류 상한. 4탐침 장비 상식이지 S203 의 진술이 아니다',
);
/** 측정 전압 유효구간. */
const VOLTAGE_MAX_V = uiGuard(100, 'V', '4탐침 전압계 실측 범위의 상식적 상한. 문헌 근거 없음');
/** 면저항 출력 유효구간. */
const SHEET_MAX = uiGuard(
  100 * 100 * 100 * TEN * TEN * TEN, 'Ω/sq',
  '절연체에 가까운 값까지 덮는 출력 표시 상한. 물리적 한계가 아니다',
);
export const SHEET_RANGE: [number, number] = [0, SHEET_MAX.value];

/**
 * 시료 지름비 d/s 의 보정계수. `Infinity` 는 무한 시료(R169).
 * 🔴 표에 없는 비율은 던진다 — 보간하면 원장에 없는 값을 제품에 넣는 것이다.
 */
export function diameterCorrection(diameterOverSpacing: number): number {
  if (!Number.isFinite(diameterOverSpacing)) return CF_INFINITE.value;
  const row = CF_DIAMETER_TABLE.find((r) => r.ratio.value === diameterOverSpacing);
  if (!row) {
    throw new Error(
      `[S203] Table 1 에 d/s = ${diameterOverSpacing} 항목이 없다. ` +
      `사용 가능: ${CF_DIAMETER_RATIOS.join(', ')} 또는 Infinity(무한 시료). 보간하지 않는다.`,
    );
  }
  return row.cf.value;
}

/**
 * 시료 두께비 t/s 의 보정계수.
 * t/s < 0.5 이면 S203 이 명시한 대로 1 로 둔다. 그 위는 **표에 있는 값만** 쓴다.
 */
export function thicknessCorrection(thicknessOverSpacing: number): number {
  if (thicknessOverSpacing < CF_T_UNITY_LIMIT.value) return 1;
  const row = CF_THICKNESS_TABLE.find((r) => r.ratio.value === thicknessOverSpacing);
  if (!row) {
    throw new Error(
      `[S203] Table 2 에 t/s = ${thicknessOverSpacing} 항목이 없다. ` +
      `사용 가능: t/s < 0.5 (CF_t = 1) 또는 ${CF_THICKNESS_RATIOS.join(', ')}. 보간하지 않는다.`,
    );
  }
  return row.cf.value;
}

/**
 * 면저항 `R_s = CF·(V/I)`.
 * `diameterOverSpacing` 을 생략하면 무한 시료(CF = 4.5324), `thicknessOverSpacing` 을 생략하면
 * t/s < 0.5 로 보아 CF_t = 1 이다.
 */
export function sheetResistance(args: {
  voltageV: number; currentA: number;
  diameterOverSpacing?: number; thicknessOverSpacing?: number;
}): Quantity {
  assertWithin('voltageV', args.voltageV, [0, VOLTAGE_MAX_V.value], 'V');
  assertWithin('currentA', args.currentA, [PROBE_CURRENT_MIN_A.value, PROBE_CURRENT_MAX_A.value], 'A');
  const cfD = diameterCorrection(args.diameterOverSpacing ?? Number.POSITIVE_INFINITY);
  const cfT = thicknessCorrection(args.thicknessOverSpacing ?? 0);
  return quantity(cfD * cfT * (args.voltageV / args.currentA), {
    modelId: 'metal.fourPointProbe.sheetResistance',
    unit: 'Ω/sq',
    sourceId: 'S203',
    validRange: SHEET_RANGE,
    assumptions: [
      '등간격 4탐침, 직선 배열',
      'a/d ≥ 4 (탐침이 시료 중앙)',
      // 🔴 CF 는 S203 이 뒷받침하지만 **입력·출력 범위선은 아무 문헌도 뒷받침하지 않는다.**
      `전류 입력구간: ${describeUiGuard(PROBE_CURRENT_MAX_A)}`,
      `면저항 유효구간: ${describeUiGuard(SHEET_MAX)}`,
    ],
  });
}

/** 면저항과 막두께로부터 체적 저항률 `ρ = R_s · t`. S203. */
export function resistivityFromSheet(args: { sheetOhmPerSq: number; thicknessNm: number }): Quantity {
  assertWithin('sheetOhmPerSq', args.sheetOhmPerSq, SHEET_RANGE, 'Ω/sq');
  const thicknessCm = (args.thicknessNm / NM_PER_M) * CM_PER_M;
  return quantity(args.sheetOhmPerSq * thicknessCm, {
    modelId: 'metal.fourPointProbe.resistivity',
    unit: 'Ω·cm',
    sourceId: 'S203',
    validRange: [0, SHEET_MAX.value],
    assumptions: [
      '막두께 균일',
      'ρ = R_s·t',
      `면저항 유효구간: ${describeUiGuard(SHEET_MAX)}`,
    ],
  });
}
