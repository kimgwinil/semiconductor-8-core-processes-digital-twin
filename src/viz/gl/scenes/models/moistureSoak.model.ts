/**
 * `moistureSoak`(MSL 플로어 라이프 · 표준 소킹 시간축) 씬의 **계산 정본**.
 * 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/moistureSoak.ts` — 아래 배치값을 GLSL 리터럴로 **주입**해 화면을 만든다.
 *   · `gl/fallback2d.ts`        — Canvas2D 로 같은 그림을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(원점 좌하단 · 세로 0~1 · 위쪽이 +)** 다.
 * Canvas2D 는 세로가 뒤집혀 있으므로 폴백이 `toY(uv,h)=(1−uv)·h` 로 변환한다 —
 * **변환은 폴백의 몫이고 배치는 여기 하나다.**
 *
 * ── 이 씬이 그리는 것 (DSN 스레드 §P-2 · §P-4 정본) ─────────────────────────
 *   공용 시간축(0 → 192 h) 위에
 *     ① 플로어 라이프 막대   ② 표준 소킹 막대   ③ 노출 마커 ▮   ④ 여유 치수선
 *   을 얹는다. `packaging/lab-applied` 는 8공정 24칸 중 **차트가 0개**인 칸이라
 *   `floorLifeH`·`standardSoakH`·`floorLifeMarginH` 가 지금 화면 어디에도 없다.
 *
 * 🔴 **그리지 않는 것** — 습기 확산 프로파일 · 수분 농도장 · 팝콘 크랙 형상 ·
 *   가속 소킹(60 °C/60 %RH) 조건 도해 · MSL 1·2·2a 눈금.
 *   앞의 셋은 명세에 없고, 가속 소킹은 이 씬의 파라미터에 없으며,
 *   MSL 1·2·2a 는 물리층 `floorLifeHours()` 가 예외를 던져 **슬라이더가 노출하지 않는다**
 *   (도달할 수 없는 화면을 만들지 않는다).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';
import { MSL_HOURLY_LEVELS, mslSpec } from '../../../../models/physics/packaging/msl';

/* ══════════════════════════ 화면 배치값 (전부 UV) ══════════════════════════
 * 🔴 여기 나오는 수는 **전부 화면 배치값이고 물리 상수가 아니다**(설계서 §8).
 *    문헌값(24·48·72·96·168·192 h)은 아래 §시간 눈금 에서 **물리층에서 받아 온다** —
 *    이 파일이 표준의 수를 손으로 적지 않는다.
 */

/** 공용 시간축의 좌·우 끝. `MS_TIME_X0` = 0 h, `MS_TIME_X1` = `MS_TIME_AXIS_MAX_H`. */
export const MS_TIME_X0 = 0.10;
export const MS_TIME_X1 = 0.94;

/** 플로어 라이프 막대 행. */
export const MS_ROW_FLOOR_Y0 = 0.56;
export const MS_ROW_FLOOR_Y1 = 0.64;

/** 표준 소킹 막대 행. */
export const MS_ROW_SOAK_Y0 = 0.40;
export const MS_ROW_SOAK_Y1 = 0.48;

/** 여유(마커↔플로어 막대끝) 치수선의 y. */
export const MS_ROW_MARGIN_Y = 0.26;

/** 시간축 눈금선의 y. */
export const MS_AXIS_Y = 0.16;

/**
 * 미선택 MSL 단계의 **유령 눈금** 투명도.
 * 🔴 이 씬의 슬라이더는 4점뿐이라 막대 끝이 네 자리만 밟는다. 네 자리를 **항상** 흐리게 그려야
 *    「값이 안 변한다(얼어붙음)」가 아니라 **「다음 칸이 저기 있다」**로 읽힌다.
 *    🔴 이산값을 보간해 부드럽게 움직이면 표준을 왜곡한다 — **계단은 계단으로 그린다.**
 */
export const MS_GHOST_ALPHA = 0.22;

/** 시간축 상한 [h]. 축의 오른쪽 끝(`MS_TIME_X1`)이 이 시각이다. */
export const MS_TIME_AXIS_MAX_H = 192;

/**
 * 여유 축 반폭 [h]. 랩이 `margin = clamp01(0.5 + floorLifeMarginH / 384)` 로 넘기는데
 * 그 384 가 **이 값의 2배**다 — 즉 `margin = 0.5` 가 **여유 0 h**(합격선)이고
 * 좌우로 ±`MS_MARGIN_AXIS_H` 시간이 0~1 에 담긴다.
 */
export const MS_MARGIN_AXIS_H = 192;

/**
 * 🔴 **여유 0 h = 합격선.** 파라미터에 부호가 있어 0 이 화면 한가운데(0.5)로 온다.
 *    이 씬에서 `0.5` 는 「기본값을 몰라서 반으로 둔 수」가 아니라 **물리적 의미가 있는 값**이다.
 */
export const MS_MARGIN_ZERO = 0.5;

/** 노출 마커 ▮ — 막대 위아래로 나오는 길이(세로 UV)와 반폭(가로 UV). */
export const MS_MARK_OVERHANG = 0.02;
export const MS_MARK_HALF_W = 0.006;

/** 시간축 눈금의 길이(세로 UV). */
export const MS_AXIS_TICK_H = 0.03;

/** 치수선 화살촉 — 길이(가로 UV) · 반높이(세로 UV) · 양끝 보조선 반높이(세로 UV). */
export const MS_DIM_ARROW_LEN = 0.020;
export const MS_DIM_ARROW_HALF = 0.014;
export const MS_DIM_EXT_HALF = 0.022;

/**
 * 판정 형태(●/▲/▨)의 중심 x 와 반지름. y 는 `MS_ROW_MARGIN_Y` 를 그대로 쓴다 —
 * **판정은 여유 치수선의 판정**이므로 같은 행에 선다. x 는 시간축(0.10) 왼쪽 여백이다.
 */
export const MS_VERDICT_X = 0.05;
export const MS_VERDICT_R = 0.026;

/* ══════════════════════════ 시간 눈금 — 물리층에서 받아 온다 ══════════════════════════
 * 🔴 표준의 시간값을 **여기서 손으로 적지 않는다.** J-STD-020F Table 4 의 정본은
 *    `src/models/physics/packaging/msl.ts`(원장 S248 · 골든 R199)이고, 이 씬은 그것을 읽는다.
 *    같은 표를 두 곳이 들고 있으면 하나는 낡는다 — 이 저장소가 이미 여러 번 당한 사고다.
 * 🔴 `MSL_HOURLY_LEVELS` 는 **플로어 라이프가 시간으로 규정된 등급**만 준다 = 3 · 4 · 5 · 5a.
 *    MSL 1·2·2a 는 애초에 여기 없다 — 「∞ 표시 분기」를 만들 자리가 없다는 뜻이다.
 */
const hourlySpecs = MSL_HOURLY_LEVELS.map((level) => mslSpec(level));

/** 플로어 라이프 이산 4단 [h] — 등급 순서(3·4·5·5a) 그대로. */
export const MS_FLOOR_LIFE_STEPS_H: readonly number[] = hourlySpecs
  .map((s) => s.floorLifeHours)
  .filter((v): v is number => typeof v === 'number');

/** 표준 소킹 이산 4단 [h] — 같은 등급 순서. */
export const MS_SOAK_STEPS_H: readonly number[] = hourlySpecs.map((s) => s.soakHours);

/* ══════════════════════════ 좌표 변환 ══════════════════════════ */

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 정규화 시간(0~1) → 시간축 x(UV). 씬·폴백이 **둘 다 이 함수 하나**를 쓴다. */
export function msXOfNorm(u: number): number {
  return MS_TIME_X0 + clamp01(u) * (MS_TIME_X1 - MS_TIME_X0);
}

/** 시각[h] → 시간축 x(UV). `xOfHour(hr) = 0.10 + (hr / 192) · 0.84`. */
export function msXOfHour(hours: number): number {
  return msXOfNorm(hours / MS_TIME_AXIS_MAX_H);
}

/** 정규화 여유(0~1, 0.5 = 0 h) → 여유 시간[h]. 부호가 있는 값이다. */
export function msMarginHours(margin: number): number {
  return (clamp01(margin) - MS_MARGIN_ZERO) * 2 * MS_MARGIN_AXIS_H;
}

/** 플로어 라이프 유령 눈금 x 4개. */
export const MS_FLOOR_GHOST_X: readonly number[] = MS_FLOOR_LIFE_STEPS_H.map((hr) => msXOfHour(hr));
/** 표준 소킹 유령 눈금 x 4개. */
export const MS_SOAK_GHOST_X: readonly number[] = MS_SOAK_STEPS_H.map((hr) => msXOfHour(hr));

/**
 * 시간축 눈금 x — 플로어 4단 ∪ 소킹 4단(= 24·48·72·96·168·192 h)의 오름차순.
 * 🔴 눈금 자리를 지어내지 않았다. **표준이 값을 준 시각에만** 눈금이 선다.
 */
export const MS_AXIS_TICK_X: readonly number[] = [...new Set([...MS_FLOOR_LIFE_STEPS_H, ...MS_SOAK_STEPS_H])]
  .sort((a, b) => a - b)
  .map((hr) => msXOfHour(hr));

/* ══════════════════════════ 결측 기본값 ══════════════════════════
 * 🔴 **0.5 를 기본값으로 쓰지 않는다**(A15) — 유일한 예외가 `margin` 이고, 그것은
 *    「모르니까 반」이 아니라 **여유 0 h = 합격선**이라는 물리적 의미를 갖는 값이다.
 *    나머지 셋은 **최저단**(가장 보수적인 화면)으로 떨어진다.
 */
/** 플로어 라이프 결측 시 최저단(= 24 h ⇒ 0.125). */
export const MS_DEFAULT_FLOOR_LIFE = Math.min(...MS_FLOOR_LIFE_STEPS_H) / MS_TIME_AXIS_MAX_H;
/** 표준 소킹 결측 시 최저단(= 48 h ⇒ 0.25). */
export const MS_DEFAULT_SOAK = Math.min(...MS_SOAK_STEPS_H) / MS_TIME_AXIS_MAX_H;
/** 노출 결측 시 0 h. */
export const MS_DEFAULT_EXPOSURE = 0;

/* ══════════════════════════ 모델 ══════════════════════════ */

/** 여유 치수선의 판정. **글자가 아니라 도형**으로 그린다 — ● 합격 · ▲ 불합격 · ▨ 미규정. */
export type MsVerdict = 'pass' | 'fail' | 'unspecified';

export interface MoistureSoakModel {
  /* --- 정규화 입력(0~1) --- */
  floorLife: number;
  soak: number;
  exposure: number;
  /** 0.5 = 여유 0 h. 부호가 있다. */
  margin: number;

  /* --- 시간축 좌표(UV) --- */
  /** 플로어 라이프 막대의 오른쪽 끝. */
  xFloorEnd: number;
  /** 표준 소킹 막대의 오른쪽 끝. */
  xSoakEnd: number;
  /** 노출 마커 ▮ 의 x. */
  xExposure: number;

  /* --- 여유 치수선 --- */
  /** 치수선 왼쪽 끝 = min(막대끝, 마커). */
  dimX0: number;
  /** 치수선 오른쪽 끝 = max(막대끝, 마커). */
  dimX1: number;
  /**
   * 🔴 **불변식**: `dimLength = |msXOfNorm(floorLife) − msXOfNorm(exposure)|`.
   *    길이는 **좌표에서만** 나온다 — `margin` 으로 길이를 다시 계산하지 않는다.
   */
  dimLength: number;
  /** 화살촉이 붙는 끝. 방향(부호)은 **`margin` 이 정한다.** */
  dimTipX: number;
  /** 화살표가 오른쪽을 보는가(= 여유 ≥ 0). */
  dimTipRight: boolean;
  /**
   * 치수선을 그려도 되는가. 🔴 `floorExposureH` 가 NaN·∞ 면 `floorLifeMarginH` 도 NaN 이 되는데
   * 랩의 예외는 이 경로를 **통과시킨다**. NaN 을 좌표로 넣으면 Canvas2D path 가 통째로 사라지므로
   * (A14) 씬이 스스로 막고 판정 자리에 **미규정 ▨** 를 그린다.
   */
  defined: boolean;
  verdict: MsVerdict;

  /* --- 유령 눈금(이산 4단) --- */
  floorGhostX: readonly number[];
  soakGhostX: readonly number[];
}

/**
 * 🔴 파라미터가 **있는데 유한하지 않은가**를 본다.
 *    `pick()` 은 NaN 을 조용히 기본값으로 바꿔 놓기 때문에(=「합격」으로 보이게 만든다)
 *    유한성 판정은 **원값**을 봐야 한다. 키가 아예 없는 것은 결측이므로 기본값이 맞다.
 */
function msIsDefined(params: SceneParams, key: string): boolean {
  const v: number | undefined = params[key];
  return v === undefined || Number.isFinite(v);
}

/**
 * 씬이 받는 파라미터는 **정확히 4키**다(랩 `models/labs/packaging.ts` 가 넘긴다):
 *   `floorLife` = floorLifeH/192 · `soak` = standardSoakH/192 ·
 *   `exposure` = floorExposureH/192 · `margin` = clamp01(0.5 + floorLifeMarginH/384)
 */
export function moistureSoakModel(params: SceneParams): MoistureSoakModel {
  const floorLife = pick(params, 'floorLife', MS_DEFAULT_FLOOR_LIFE);
  const soak = pick(params, 'soak', MS_DEFAULT_SOAK);
  const exposure = pick(params, 'exposure', MS_DEFAULT_EXPOSURE);
  const margin = pick(params, 'margin', MS_MARGIN_ZERO);

  const defined =
    msIsDefined(params, 'floorLife') && msIsDefined(params, 'exposure') && msIsDefined(params, 'margin');

  /* 🔴 막대 끝과 마커는 **같은 함수**로 잡는다 — 두 경로가 갈라지면 그림이 판정과 다른 말을 한다. */
  const xFloorEnd = msXOfNorm(floorLife);
  const xSoakEnd = msXOfNorm(soak);
  const xExposure = msXOfNorm(exposure);

  /* 치수선: **길이는 좌표**(floorLife·exposure), **부호는 margin**. 명세의 불변식 그대로다. */
  const dimX0 = Math.min(xFloorEnd, xExposure);
  const dimX1 = Math.max(xFloorEnd, xExposure);
  const dimTipRight = margin >= MS_MARGIN_ZERO;

  return {
    floorLife,
    soak,
    exposure,
    margin,
    xFloorEnd,
    xSoakEnd,
    xExposure,
    dimX0,
    dimX1,
    dimLength: Math.max(0, dimX1 - dimX0),
    dimTipX: dimTipRight ? dimX1 : dimX0,
    dimTipRight,
    defined,
    verdict: !defined ? 'unspecified' : dimTipRight ? 'pass' : 'fail',
    floorGhostX: MS_FLOOR_GHOST_X,
    soakGhostX: MS_SOAK_GHOST_X,
  };
}
