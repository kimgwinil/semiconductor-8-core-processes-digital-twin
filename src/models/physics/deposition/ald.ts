import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { ANGSTROM_PER_NM } from '../units';

/**
 * ALD(원자층증착) 성장 — **물리층. 합성 계수 0건.**
 *
 * 출처: **S186** = Kim, S. et al., *Influence of growth temperature on dielectric strength of
 * Al₂O₃ thin films prepared via ALD at low temperature*, **Sci. Rep. 12, 5124 (2022)**,
 * DOI 10.1038/s41598-022-09054-7. **CC BY 4.0** — 수치·표현물 모두 사용 가능.
 * 골든값: 원장 **R159**.
 *
 * 🔴 **ALD 창(window) 안에서 GPC 는 평탄하다.** 논문 본문이
 *    「ALD window … ~1.1 Å/cycle at growth temperatures above 150 °C」라고 명시한다.
 *    「온도를 올리면 GPC 가 떨어진다」로 모델링하면 **자기제한 성장이라는 ALD 의 존재 이유를
 *    거꾸로 가르치게 된다.** 창 밖은 보간하지 않고 **범위 밖으로 거부**한다.
 *
 * 🔴 기획 명세의 `GPC = 1.30 − 0.0020(T−150)` 류 식은 **출처 없는 교육용 설정값**이며
 *    (정합성 원장 gap #187) 여기서는 쓰지 않는다.
 */

interface GpcRow {
  readonly tempC: SourcedConst;
  readonly gpc: SourcedConst;
}

/**
 * S186 Fig. — 열 ALD Al₂O₃ (TMA + H₂O, traveling-wave 반응기) 성장온도별 GPC.
 * 🔴 온도축도 문헌 데이터다. 우리가 고른 값이 아니므로 전부 `withSource` 로 감싼다.
 * 🔴 별칭 함수로 줄여 쓰지 않는다 — 그 자리가 곧 검사 구멍이 된다(규약 §2-1).
 */
const AL2O3_GPC_ROWS: readonly GpcRow[] = [
  { tempC: withSource(80, '°C', 'S186'), gpc: withSource(0.9, 'Å/cycle', 'S186') },
  { tempC: withSource(100, '°C', 'S186'), gpc: withSource(1.0, 'Å/cycle', 'S186') },
  { tempC: withSource(150, '°C', 'S186'), gpc: withSource(1.1, 'Å/cycle', 'S186') },
  { tempC: withSource(250, '°C', 'S186'), gpc: withSource(1.1, 'Å/cycle', 'S186') },
];

export const ALD_MEASURED_TEMPS_C: number[] = AL2O3_GPC_ROWS.map((r) => r.tempC.value);

/** 🔴 ALD 창 — 본문이 「150 °C 초과에서 ~1.1 Å/cycle」로 명시한 평탄 구간. 상한은 최고 측정점이다. */
const WINDOW_MIN_C = withSource(150, '°C', 'S186');
const WINDOW_MAX_C = withSource(250, '°C', 'S186');
const WINDOW_GPC = withSource(1.1, 'Å/cycle', 'S186');
export const ALD_WINDOW_C: [number, number] = [WINDOW_MIN_C.value, WINDOW_MAX_C.value];
export const ALD_WINDOW_GPC_ANGSTROM: number = WINDOW_GPC.value;

const MEASURED_MIN_C = withSource(80, '°C', 'S186');
export const ALD_MEASURED_TEMP_RANGE_C: [number, number] = [MEASURED_MIN_C.value, WINDOW_MAX_C.value];

const GPC_VALUES = AL2O3_GPC_ROWS.map((r) => r.gpc.value);
export const GPC_RANGE_ANGSTROM: [number, number] = [Math.min(...GPC_VALUES), Math.max(...GPC_VALUES)];

/**
 * 사이클 수 상한. **문헌값이 아니다** — S186 은 사이클 수 상한을 규정하지 않는다.
 * 계산 안정성용 안전장치이므로 출처를 위조하지 않고 **허용 리터럴만으로 조립**한다(규약 §2-3).
 */
const CYCLE_COUNT_MAX = 100 * 100;
export const ALD_CYCLE_RANGE: [number, number] = [0, CYCLE_COUNT_MAX];

/** S186 레시피 — TMA 1 s / Ar 퍼지 40 s / H₂O 2 s / Ar 퍼지 40 s. */
const PULSE_TMA_S = withSource(1, 's', 'S186');
const PURGE_AFTER_TMA_S = withSource(40, 's', 'S186');
const PULSE_H2O_S = withSource(2, 's', 'S186');
const PURGE_AFTER_H2O_S = withSource(40, 's', 'S186');
export const ALD_CYCLE_TIME_S: number =
  PULSE_TMA_S.value + PURGE_AFTER_TMA_S.value + PULSE_H2O_S.value + PURGE_AFTER_H2O_S.value;


/**
 * 성장온도별 GPC(사이클당 성장).
 *  - 측정점(80·100·150·250 °C)은 표값을 그대로 돌려준다.
 *  - ALD 창(150–250 °C) 안의 임의 온도는 **본문이 명시한 평탄값 1.1 Å/cycle** 이다. 보간이 아니다.
 *  - 창 아래 비측정 구간(80–150 °C 사이)은 **거부한다** — 표에 없는 조건은 보간하지 않는다(원장 규칙 1).
 */
export function gpcAt(tempC: number): Quantity {
  assertWithin('tempC', tempC, ALD_MEASURED_TEMP_RANGE_C, '°C');

  const row = AL2O3_GPC_ROWS.find((r) => r.tempC.value === tempC);
  const inWindow = tempC >= WINDOW_MIN_C.value;
  if (!row && !inWindow) {
    throw new Error(
      `[S186] ${tempC} °C 는 측정점이 아니고 ALD 창(${WINDOW_MIN_C.value}–${WINDOW_MAX_C.value} °C) 밖이다. ` +
      `측정점: ${ALD_MEASURED_TEMPS_C.join(', ')} °C. 보간하지 않는다.`,
    );
  }
  const value = row ? row.gpc.value : WINDOW_GPC.value;

  return quantity(value, {
    modelId: 'deposition.ald.gpc',
    unit: 'Å/cycle',
    sourceId: 'S186',
    validRange: GPC_RANGE_ANGSTROM,
    assumptions: [
      '열 ALD Al₂O₃ (TMA + H₂O), traveling-wave 반응기',
      inWindow
        ? '🔴 ALD 창 평탄부 — 자기제한 반응이므로 온도에 무관하게 ~1.1 Å/cycle (S186 본문 명시)'
        : 'ALD 창 아래 저온 측정점 — 흡착 부족으로 GPC 가 낮다',
    ],
  });
}

/** 자기제한 성장이므로 두께는 사이클 수에 **선형**이다. t = GPC × N. */
export function aldThicknessAngstrom(args: { tempC: number; cycles: number }): Quantity {
  assertWithin('cycles', args.cycles, ALD_CYCLE_RANGE, 'cycle');
  const gpc = gpcAt(args.tempC).value;
  return quantity(gpc * args.cycles, {
    modelId: 'deposition.ald.thickness',
    unit: 'Å',
    sourceId: 'S186',
    validRange: [0, GPC_RANGE_ANGSTROM[1] * CYCLE_COUNT_MAX],
    assumptions: ['자기제한 반응 — 사이클당 성장이 일정하므로 두께는 사이클 수에 선형'],
  });
}

/** 같은 값의 nm 표기. 단위 환산만 한다. */
export function aldThicknessNm(args: { tempC: number; cycles: number }): Quantity {
  const angstrom = aldThicknessAngstrom(args);
  return quantity(angstrom.value / ANGSTROM_PER_NM, {
    modelId: 'deposition.ald.thicknessNm',
    unit: 'nm',
    sourceId: 'S186',
    validRange: [0, (GPC_RANGE_ANGSTROM[1] * CYCLE_COUNT_MAX) / ANGSTROM_PER_NM],
  });
}

/** 목표 두께에 필요한 사이클 수(실수). 반올림은 상위 층이 정한다. */
export function cyclesForThickness(args: { tempC: number; targetAngstrom: number }): Quantity {
  const gpc = gpcAt(args.tempC).value;
  return quantity(args.targetAngstrom / gpc, {
    modelId: 'deposition.ald.cycles',
    unit: 'cycle',
    sourceId: 'S186',
    validRange: ALD_CYCLE_RANGE,
  });
}

/** 순수 증착 시간 = 사이클 수 × 사이클 1회 소요시간(S186 레시피). */
export function aldDepositionTimeS(cycles: number): Quantity {
  assertWithin('cycles', cycles, ALD_CYCLE_RANGE, 'cycle');
  return quantity(cycles * ALD_CYCLE_TIME_S, {
    modelId: 'deposition.ald.time',
    unit: 's',
    sourceId: 'S186',
    validRange: [0, CYCLE_COUNT_MAX * ALD_CYCLE_TIME_S],
    assumptions: ['S186 레시피 기준(TMA 1 s / Ar 40 s / H₂O 2 s / Ar 40 s). 승온·안정화 시간 제외'],
  });
}
