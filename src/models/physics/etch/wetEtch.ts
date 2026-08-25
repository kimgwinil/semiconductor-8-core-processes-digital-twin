import {
  assertWithin, describeSiDefinition, quantity, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';
import { BOLTZMANN_EV_PER_K } from '../constants';
import { KELVIN_AT_ZERO_CELSIUS } from '../siDefinitions';

/**
 * 습식 식각 (이방성 알칼리 식각) — **물리층. 합성 계수 0건.**
 *
 * 두 축으로 세운다.
 *  ① **면방위별 실측 대조표** — KOH 수용액 70 °C, 30/40/50 wt% 의 (100)·(110)·(111) 식각속도.
 *     원장 **R144 / S166 Appendix Table 1** (원출처 Sato et al., Sens. Actuators A 64, 87–93 (1998)).
 *     🔴 **보간은 농도축에서만** 한다. 온도축은 표가 70 °C 한 점뿐이라 보간할 근거가 없다.
 *  ② **아레니우스** `r = r₀·exp(−E_a/kT)` — NaOH 50 % · TMAH 25 %. 원장 **S164 식 (1)**.
 *
 * 🔴 **Seidel et al. 1990 은 출처가 아니다(M-12 · S169 접근 실패).**
 *    흔히 인용되는 (110):(100):(111) = 50:30:1 과 E_a 0.61/0.59/0.70 eV 는
 *    **검색 스니펫에만 존재**하며 원장에 등재돼 있지 않다. 이 파일은 그 값을 쓰지 않는다.
 * 🔴 KOH 의 아레니우스 계수(r₀·E_a)는 원장에 없다. **KOH 는 표 보간으로만, NaOH·TMAH 는 아레니우스로만** 계산한다.
 *    두 경로를 섞지 않는다.
 */

export type SiOrientation = '100' | '110' | '111';
export type WetEtchant = 'NaOH50' | 'TMAH25';

/* ────────────────────────────── ① KOH 면방위별 실측표 (S166) ────────────────────────────── */

interface KohRow {
  readonly wtPercent: SourcedConst;
  readonly r100: SourcedConst;
  readonly r110: SourcedConst;
  readonly r111: SourcedConst;
}

/**
 * 🔴 농도(wt%)도 문헌 데이터다 — 저자가 측정한 조건점이지 우리가 고른 값이 아니다.
 *    그래서 전부 `withSource` 로 감싼다(규약 §2-2).
 * 🔴 별칭 함수로 줄여 쓰지 않는다(규약 §2-1).
 */
const KOH_70C: readonly KohRow[] = [
  {
    wtPercent: withSource(30, 'wt%', 'S166'),
    r100: withSource(0.797, 'µm/min', 'S166'),
    r110: withSource(1.455, 'µm/min', 'S166'),
    r111: withSource(0.005, 'µm/min', 'S166'),
  },
  {
    wtPercent: withSource(40, 'wt%', 'S166'),
    r100: withSource(0.599, 'µm/min', 'S166'),
    r110: withSource(1.294, 'µm/min', 'S166'),
    r111: withSource(0.009, 'µm/min', 'S166'),
  },
  {
    wtPercent: withSource(50, 'wt%', 'S166'),
    r100: withSource(0.539, 'µm/min', 'S166'),
    r110: withSource(0.870, 'µm/min', 'S166'),
    r111: withSource(0.009, 'µm/min', 'S166'),
  },
];

/** 표가 측정된 온도. **이 한 점뿐이므로 온도 보간을 하지 않는다.** S166 Appendix Table 1. */
export const KOH_TABLE_TEMP_C = withSource(70, '°C', 'S166');

/** 표가 덮는 농도 구간. 밖은 계산하지 않고 정지시킨다(원장 규칙 1). */
export const KOH_WT_RANGE: [number, number] = [
  (KOH_70C[0] as KohRow).wtPercent.value,
  (KOH_70C[KOH_70C.length - 1] as KohRow).wtPercent.value,
];

/** 표에 실린 농도점 — 골든 테스트가 이 목록으로 표를 되짚는다. */
export const KOH_WT_POINTS: number[] = KOH_70C.map((r) => r.wtPercent.value);

/** 출력 유효범위 상한 — 표의 최댓값(1.455 µm/min)을 덮는 경계. 표에서 파생하므로 리터럴이 없다. */
const KOH_RATE_MAX = Math.max(
  ...KOH_70C.map((r) => Math.max(r.r100.value, r.r110.value, r.r111.value)),
);
export const KOH_RATE_RANGE_UM_PER_MIN: [number, number] = [0, KOH_RATE_MAX];

function pick(row: KohRow, orientation: SiOrientation): number {
  if (orientation === '100') return row.r100.value;
  if (orientation === '110') return row.r110.value;
  return row.r111.value;
}

/** 농도축 선형보간. **면방위축·온도축은 보간하지 않는다.** */
function rateFromTable(wtPercent: number, orientation: SiOrientation): number {
  for (let i = 1; i < KOH_70C.length; i++) {
    const lo = KOH_70C[i - 1] as KohRow;
    const hi = KOH_70C[i] as KohRow;
    if (wtPercent <= hi.wtPercent.value) {
      const span = hi.wtPercent.value - lo.wtPercent.value;
      const f = (wtPercent - lo.wtPercent.value) / span;
      return pick(lo, orientation) + f * (pick(hi, orientation) - pick(lo, orientation));
    }
  }
  // assertWithin 이 앞에서 막으므로 도달하지 않는다. 방어적으로 표의 끝값을 준다.
  return pick(KOH_70C[KOH_70C.length - 1] as KohRow, orientation);
}

/**
 * KOH 면방위별 식각속도 — **70 °C 고정**. 농도만 보간한다.
 * 원장 R144 / S166 Appendix Table 1.
 */
export function kohEtchRate(args: { wtPercent: number; orientation: SiOrientation }): Quantity {
  assertWithin('wtPercent', args.wtPercent, KOH_WT_RANGE, 'wt%');
  return quantity(rateFromTable(args.wtPercent, args.orientation), {
    modelId: 'etch.wet.kohRate',
    unit: 'µm/min',
    sourceId: 'S166',
    validRange: KOH_RATE_RANGE_UM_PER_MIN,
    assumptions: [
      `KOH 수용액 ${KOH_TABLE_TEMP_C.value} °C 고정 (표가 이 온도 한 점만 측정했다)`,
      `면방위 (${args.orientation})`,
      '농도축만 선형보간 — 면방위·온도는 보간하지 않는다',
    ],
  });
}

/** 면방위 선택비 — 표의 두 실측값의 비. 예: (110)/(100). */
export function kohOrientationSelectivity(args: {
  wtPercent: number; fast: SiOrientation; slow: SiOrientation;
}): Quantity {
  assertWithin('wtPercent', args.wtPercent, KOH_WT_RANGE, 'wt%');
  const fast = rateFromTable(args.wtPercent, args.fast);
  const slow = rateFromTable(args.wtPercent, args.slow);
  return quantity(fast / slow, {
    modelId: 'etch.wet.kohOrientationSelectivity',
    unit: '',
    sourceId: 'S166',
    validRange: [0, KOH_RATE_MAX / (KOH_70C[0] as KohRow).r111.value],
    assumptions: [`KOH ${KOH_TABLE_TEMP_C.value} °C`, `(${args.fast})/(${args.slow})`],
  });
}

/* ────────────────────────────── ② 아레니우스 (S164) ────────────────────────────── */

/* 볼츠만 상수는 **회사 규약값**(S54 JESD74A 식[1] · 후공정 원장 R16)이며 정본은 `../constants` 다.
 * 🔴 2026-08-22 — 종전에는 이 파일이 같은 값을 **각자 선언**했다(4개 파일이 그랬다). 값·출처 불변. */

/**
 * 섭씨↔켈빈 환산의 영점. **측정 계수가 아니라 SI 온도눈금 정의**(0 °C = 273.15 K)이며,
 * S164 가 조건은 °C 로, 아레니우스는 절대온도로 쓰기 때문에 필요하다.
 *
 * 🔴 2026-08-22 정정 — 이것은 `withSource(273.15, 'K', 'S164')` 였다. **S164 가 진술하는 것은
 *    NaOH·TMAH 아레니우스 계수(r₀·E_a)이지 「0 °C = 273.15 K」가 아니다.** 위 주석이 이미
 *    「측정 계수가 아니라 SI 온도눈금 정의」라고 **스스로 근거를 부정하고 있었다.**
 *    🔴 **수치는 한 자리도 바꾸지 않았다** — 정본(`../siDefinitions`)의 조립값이 십진 표기
 *    `273.15` 와 비트까지 같음을 `tests/unit/si-definitions.test.ts` 가 고정한다.
 */
const KELVIN_AT_ZERO_C = KELVIN_AT_ZERO_CELSIUS;

interface ArrheniusRow {
  readonly r0: SourcedConst;
  readonly ea: SourcedConst;
}

/**
 * S164 식 (1) 의 Si(100) 계수. **(110) 은 활성화에너지만 실려 있고 r₀ 가 없으므로 구현하지 않는다.**
 * (원장 §3-4: Si(110) E_a = 0.42(TMAH) – 0.61(NaOH) eV — 전지수인자 미확보)
 */
const WET_ARRHENIUS_100: Record<WetEtchant, ArrheniusRow> = {
  NaOH50: { r0: withSource(3.7e11, 'µm/h', 'S164'), ea: withSource(0.68, 'eV', 'S164') },
  TMAH25: { r0: withSource(3.0e9, 'µm/h', 'S164'), ea: withSource(0.57, 'eV', 'S164') },
};

/** S164 가 측정한 온도 구간. 밖에서는 계산하지 않는다. */
const WET_TEMP_MIN_C = withSource(28, '°C', 'S164');
const WET_TEMP_MAX_C = withSource(80, '°C', 'S164');
export const WET_TEMP_RANGE_C: [number, number] = [WET_TEMP_MIN_C.value, WET_TEMP_MAX_C.value];

/**
 * 출력 유효범위 상한 — 측정 구간 최고온도에서 가장 빠른 에천트의 값(≈72 µm/h)을 덮는 경계.
 * 계수에서 파생하므로 출처 없는 리터럴이 없다.
 */
const WET_RATE_MAX_UM_PER_H = Object.values(WET_ARRHENIUS_100)
  .map((row) => row.r0.value * Math.exp(
    -row.ea.value / (BOLTZMANN_EV_PER_K.value * (WET_TEMP_MAX_C.value + KELVIN_AT_ZERO_C.value)),
  ))
  .reduce((a, b) => Math.max(a, b), 0);
export const WET_RATE_RANGE_UM_PER_H: [number, number] = [0, WET_RATE_MAX_UM_PER_H];

/**
 * 습식 아레니우스 식각속도 `r = r₀·exp(−E_a/kT)` — Si(100). S164 식 (1).
 * 🔴 원장은 이 출력을 **T1(조사자 재계산)** 으로 분류한다(R142·R143). 문헌이 인쇄한 것은 r₀·E_a 뿐이다.
 */
export function wetArrheniusRate(args: { etchant: WetEtchant; tempC: number }): Quantity {
  assertWithin('tempC', args.tempC, WET_TEMP_RANGE_C, '°C');
  const row = WET_ARRHENIUS_100[args.etchant];
  const tempK = args.tempC + KELVIN_AT_ZERO_C.value;
  const r = row.r0.value * Math.exp(-row.ea.value / (BOLTZMANN_EV_PER_K.value * tempK));
  return quantity(r, {
    modelId: 'etch.wet.arrheniusRate',
    unit: 'µm/h',
    sourceId: 'S164',
    validRange: WET_RATE_RANGE_UM_PER_H,
    assumptions: [
      'Si(100) 면. (110) 은 전지수인자 r₀ 미확보로 계산하지 않는다',
      args.etchant === 'NaOH50' ? 'NaOH 50 wt% 수용액' : 'TMAH 25 wt% 수용액',
      `k = ${BOLTZMANN_EV_PER_K.value} eV/K (회사 규약)`,
      // 🔴 계수(r₀·E_a)는 S164 가 뒷받침하지만 **°C→K 영점은 어느 문헌도 뒷받침하지 않는다** — 정의값이다.
      `°C→K 영점: ${describeSiDefinition(KELVIN_AT_ZERO_CELSIUS)}`,
    ],
  });
}

/** 문헌 계수 조회 — 골든/단위 테스트가 손계산을 재현할 때 쓴다. */
export function wetArrheniusCoefficients(etchant: WetEtchant): { r0: number; eaEv: number } {
  const row = WET_ARRHENIUS_100[etchant];
  return { r0: row.r0.value, eaEv: row.ea.value };
}

/* ────────────────────────────── ③ 이방성도 (정의식) ────────────────────────────── */

/**
 * 이방성도 `A_f = 1 − v_l / v_v` — **정의식**(S257 §6.2 식 6.1).
 * A_f = 1 이면 완전 이방성(수직), A_f = 0 이면 완전 등방성.
 *
 * 🔴 2026-08-22 정정 — 이 출력은 `sourceId: 'S172'` 였다. **S172 가 진술하는 것은 종점검출**
 *    (레이저 간섭계 · OES · Table I 신호 면적의존성 · 엔드포인트 파장 483.5 nm)이지
 *    **이방성도 정의식이 아니다.** 원장 식각 절(S160~S172 · S256~S262)을 다시 대조해
 *    정의식을 실제로 인쇄한 출처로 바꿨다:
 *      · **S257**(Chu, *AP6120* Ch.6 §6.2 식 6.1) — "degree of anisotropy, A_f, is defined to be:
 *        `A_f ≡ 1 − l/h_f = 1 − v_l/v_v`", `l` = **편측** 언더컷 거리. **이 코드의 식과 같은 형태**라
 *        정본으로 삼는다.
 *      · **S256**(Cheung, *EE143* Lecture 14 슬라이드 5) — 같은 양을 `A_f = 1 − B/(2h_f)` 로 적는다.
 *        `B` 는 **좌우를 합친** etch bias 이므로 `B = 2l` 로 S257 과 서로 검산된다.
 *    🔴 **수식도 수치도 바꾸지 않았다. 출처 번호만 바로잡았다.**
 */
export function anisotropyDegree(args: { lateralRate: number; verticalRate: number }): Quantity {
  assertWithin('verticalRate', args.verticalRate, [Number.MIN_VALUE, Number.MAX_VALUE], 'µm/min');
  assertWithin('lateralRate', args.lateralRate, [0, args.verticalRate], 'µm/min');
  return quantity(1 - args.lateralRate / args.verticalRate, {
    modelId: 'etch.anisotropyDegree',
    unit: '',
    sourceId: 'S257',
    validRange: [0, 1],
    assumptions: [
      'A_f = 1 − v_l/v_v (S257 §6.2 식 6.1 정의식)',
      '🔴 v_l 은 **편측** 측방 속도다. 좌우 언더컷을 합친 etch bias B 를 넣으면 안 된다 — '
      + 'S256 슬라이드 5 는 같은 양을 B/(2h_f) 로 적는다(B = 2·l)',
    ],
  });
}

/**
 * KOH 이방성도 — 수직 = (100), 측벽 = (111). **같은 표·같은 온도의 두 실측값**만 쓴다.
 * (80 °C 볼록코너 언더컷 ≈3 µm/min 은 다른 온도 조건이므로 여기에 섞지 않는다.)
 */
export function kohAnisotropyDegree(wtPercent: number): Quantity {
  assertWithin('wtPercent', wtPercent, KOH_WT_RANGE, 'wt%');
  return anisotropyDegree({
    lateralRate: rateFromTable(wtPercent, '111'),
    verticalRate: rateFromTable(wtPercent, '100'),
  });
}
