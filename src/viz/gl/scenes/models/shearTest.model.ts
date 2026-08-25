/**
 * `shearTest`(다이 전단시험 — 면적 대 요구력 · 전단속도 3구간) 씬의 **계산 정본**.
 * 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/shearTest.ts` — 아래 상수를 GLSL 리터럴로 주입해 배치를 만든다.
 *   · `gl/fallback2d.ts`    — Canvas2D 로 같은 그림을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(세로 0~1, 위쪽이 +, 원점 좌하단)** 다. Canvas2D 는 세로가
 * 뒤집혀 있으므로 폴백이 `toY(uv,h) = (1 − uv)·h` 로 변환한다 — 변환은 폴백의 몫이고 형상은 여기 하나다.
 *
 * ── 씬이 받는 파라미터 5키(전부 0~1 정규화. 랩 `models/labs/packaging.ts` 가 만든다) ──
 *   `required`   = `dieShearRequiredKg` / 5
 *   `applied`    = `appliedDieShearKg`  / 5
 *   `dieArea`    = `dieAreaUnits`       / 100
 *   `speedClass` = `shearSpeedClass`    / 3      (0~1 이산 색인 4단: 0·1/3·2/3·1)
 *   `speedLog`   = log10(max(v,0.1)/0.1) / log10(100/0.1)
 *
 * 🔴 **여기에 물리는 없다.** 요구력·속도구분은 물리층(`models/physics/packaging/*`)이 계산해
 *    이미 정규화한 값으로 들어온다. 이 파일이 하는 일은 그 0~1 을 **화면 배치**로 옮기는 것뿐이다.
 *
 * 🔴 `Math.sqrt`·`Math.log10` 은 **이 파일 안에서만** 쓴다 — 폴백 drawer 가 `Math.log10`·`Math.pow`
 *    를 부르면 `check-fallback-purity` R2/R3 로 실패한다.
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ══════════════ 물리량 축의 상한 — 랩이 나눈 그 수(역산 근거) ══════════════ */

/** 요구력·인가력 축의 상한 [kg]. 랩의 `APPLIED_DIE_SHEAR_MAX_KG`. */
export const ST_SHEAR_AXIS_MAX_KG = 5;
/** 다이 면적 슬라이더 상한 [10⁻⁴ in² 단위]. 랩의 `DIE_AREA_UNITS_MAX`. */
export const ST_DIE_AREA_UNITS_MAX = 100;
/** 속도구분 색인 상한. `shearSpeedClass.validRange[1]`(0 하한미만 · 1 저속A · 2 미규정 · 3 고속B). */
export const ST_SHEAR_CLASS_MAX = 3;
/** 전단속도 슬라이더 min/max [mm/s]. 로그축의 양끝이다. */
export const ST_SPEED_MIN = 0.1;
export const ST_SPEED_MAX = 100;
/** S249 §4.7.1 Condition A 의 상한 [mm/s] — **v = 0.8 은 저속 A 에 포함**된다. */
export const ST_LOW_SPEED_MAX = 0.8;
/** S249 §4.7.2 Condition B 의 하한 [mm/s] — **50 을 넘어야** 고속 B 다(50.0 은 아직 미규정). */
export const ST_HIGH_SPEED_MIN = 50;

/* ══════════════ 요구력 곡선의 꺾임 — 🔴 실재하는 불연속 ══════════════ */

/**
 * `LARGE_AREA_LIMIT`(S43 FIGURE 2019-4 NOTE 1). a 가 이 값을 **넘으면** 요구치가 평탄해진다.
 * 🔴 a = 64 ⇒ 0.04×64 = **2.56 kg**(최대) · a = 65 ⇒ **2.50 kg**. 화면에서 막대가 내려앉는다.
 *    **이것은 결함이 아니라 표준의 실재하는 불연속이다. 보간·평활하지 마라.**
 */
export const ST_AREA_KNEE_UNITS = 64;
/** `largeAreaPlateauKg`(조건 1.0X) [kg] — a > 64 구간의 고정 요구치. */
export const ST_PLATEAU_KG = 2.5;
/** `perUnitAreaKg`(조건 1.0X) [kg / 10⁻⁴ in²] — a ≤ 64 구간의 기울기. */
export const ST_SLOPE_KG_PER_UNIT = 0.04;

/* ══════════════ 화면 배치값(UV) — 전부 배치이고 물리 상수가 아니다 ══════════════ */

/** 좌 패널 다이 상면도의 중심. */
export const ST_DIE_PANEL_CX = 0.24;
export const ST_DIE_PANEL_CY = 0.56;
/** a = 100 일 때 정사각형 한 변. a 1→100 에서 변이 0.0300 → 0.3000 으로 자란다(면적비 그대로). */
export const ST_DIE_SIDE_MAX = 0.30;
/** a = 64 기준 사각형의 한 변 = `ST_DIE_SIDE_MAX × √(64/100)`. 이 윤곽을 넘는 순간이 NOTE 1 전이다. */
export const ST_KNEE_SIDE = 0.2400;

/** 요구력 막대의 가로 구간. */
export const ST_FORCE_BAR_X0 = 0.44;
export const ST_FORCE_BAR_X1 = 0.50;
/** 요구력 막대 바닥 = 0 kg. */
export const ST_FORCE_BAR_Y0 = 0.30;
/** 요구력 막대 전장 = 5 kg. */
export const ST_FORCE_BAR_H = 0.52;

/** 우 패널 전단속도 로그축의 양끝과 높이. */
export const ST_SPEED_AXIS_X0 = 0.58;
export const ST_SPEED_AXIS_X1 = 0.96;
export const ST_SPEED_AXIS_Y = 0.46;
/** 구간 밴드 높이(축 위쪽으로 쌓는다). */
export const ST_BAND_H = 0.10;

/* ── 아래 다섯은 **명세에 치수가 없어 위 배치값에서 파생**시킨 렌더 치수다.
      ⛔ 새 물리값이 아니다 — 도형을 그리려면 반드시 있어야 하는 크기·투명도뿐이다. ── */

/** 판정 글리프(●·▲·▨·○)의 반지름 = `ST_BAND_H × 0.2`. */
export const ST_MARK_R = 0.020;
/** 면 채움 투명도. 「도달 불가 구간을 info 색 20 % 투명으로」에서 온 값을 밴드 강조에도 함께 쓴다. */
export const ST_FILL_ALPHA = 0.20;
/** 45° 해칭의 수직 간격 [px] — 명세 「간격 6 px」. */
export const ST_HATCH_PX = 6;
/** 해칭 선 굵기 [px]. */
export const ST_HATCH_W_PX = 1;
/**
 * 「도달 불가(v < 0.1)」 구간의 왼쪽 끝 = 좌 패널 막대(0.50)와 속도축(0.58) 사이 **빈 구간의 중점**.
 * 🔴 명세는 「축 왼쪽 밖에 그린다」고만 하고 **폭을 주지 않았다.** 지어내지 않고 두 배치값에서 파생시켰다.
 */
export const ST_BELOW_LOW_X0 = (ST_FORCE_BAR_X1 + ST_SPEED_AXIS_X0) / 2;

/* ── 배지 자리(파생) ── */
/** 다이 전단 판정 배지의 중심 x = 요구력 막대의 가로 중앙. */
export const ST_VERDICT_CX = (ST_FORCE_BAR_X0 + ST_FORCE_BAR_X1) / 2;
/** 다이 전단 판정 배지의 중심 y = 막대 꼭대기(5 kg) 위로 글리프 지름만큼. */
export const ST_VERDICT_CY = ST_FORCE_BAR_Y0 + ST_FORCE_BAR_H + 2 * ST_MARK_R;
/** 속도구분 배지의 중심 y = 밴드 위로 글리프 지름만큼. */
export const ST_BADGE_CY = ST_SPEED_AXIS_Y + ST_BAND_H + 2 * ST_MARK_R;

/** 속도축 가로 길이(파생). */
export const ST_SPEED_AXIS_SPAN = ST_SPEED_AXIS_X1 - ST_SPEED_AXIS_X0;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 다이 사각형 한 변(UV). `dieArea` 는 **이미 a/100 으로 정규화된 값**이다.
 * 🔴 면적을 면적으로 그린다 — 변은 √ 로 줄어들어야 넓이의 비가 눈에 그대로 남는다.
 *    a 1 → 100 에서 0.0300 → 0.3000(10.0 배), a = 64 에서 0.2400.
 */
export function stDieSide(dieArea: number): number {
  return ST_DIE_SIDE_MAX * Math.sqrt(clamp01(dieArea));
}

/**
 * 전단속도 [mm/s] → 0~1 로그 위치. 랩이 넘기는 `speedLog` 와 **같은 식**이다.
 * 🔴 v ≤ 0 이면 로그가 −∞ 가 되므로 `ST_SPEED_MIN` 으로 막는다(랩은 class 0 을 준다).
 */
export function stSpeedLog(speedMmPerS: number): number {
  const v = Number.isFinite(speedMmPerS) ? Math.max(speedMmPerS, ST_SPEED_MIN) : ST_SPEED_MIN;
  return clamp01(Math.log10(v / ST_SPEED_MIN) / Math.log10(ST_SPEED_MAX / ST_SPEED_MIN));
}

/** 0~1 로그 위치 → 속도축 x(UV). */
export function stXOfSpeedLog(t: number): number {
  return ST_SPEED_AXIS_X0 + clamp01(t) * ST_SPEED_AXIS_SPAN;
}

/** 전단속도 [mm/s] → 속도축 x(UV). 밴드 경계와 마커가 **같은 함수**를 타야 어긋나지 않는다. */
export function stXOfSpeed(speedMmPerS: number): number {
  return stXOfSpeedLog(stSpeedLog(speedMmPerS));
}

/** 정규화 힘(0~1) → 막대 꼭대기 y(UV). */
export function stForceY(force01: number): number {
  return ST_FORCE_BAR_Y0 + clamp01(force01) * ST_FORCE_BAR_H;
}

/** 씬이 그리는 모든 파생값. 씬도 폴백도 **여기만** 본다. */
export interface ShearTestModel {
  /** 요구력(0~1) = 요구치 kg / 5. */
  readonly required: number;
  /** 인가력(0~1) = 인가력 kg / 5. `appliedKnown` 이 false 면 의미가 없다. */
  readonly applied: number;
  /** 다이 면적(0~1) = a / 100. */
  readonly dieArea: number;
  /** 속도구분 원값(0~1). */
  readonly speedClass: number;
  /** 속도 로그 위치(0~1). */
  readonly speedLog: number;
  /** 속도구분 이산 색인 0~3. 🔴 보간하지 않는다. */
  readonly classIndex: number;
  /** 다이 사각형 한 변(UV). */
  readonly dieSide: number;
  /** a = 64 기준 사각형 한 변(UV) — 항상 겹쳐 그린다. */
  readonly kneeSide: number;
  /** 요구력 막대 꼭대기 y(UV). */
  readonly barTopY: number;
  /** 인가력 수평 파선의 y(UV). */
  readonly appliedY: number;
  /** 속도 마커 x(UV). class 0 이면 축 왼쪽 끝에 고정된다. */
  readonly markerX: number;
  /** `appliedDieShearKg` 가 NaN 이면 false — 여유 표시를 그리지 않고 ▨ 를 낸다. */
  readonly appliedKnown: boolean;
  /** 인가력 ≥ 요구력. `appliedKnown` 이 false 면 판정 자체가 없다. */
  readonly pass: boolean;
  /** a > 64 — 🔴 면적 자체로만 판정한다(부동소수 잔차 때문에 `===` 비교 금지). */
  readonly overKnee: boolean;
  /** 밴드 경계 x(UV) — 저속A 시작 · 저속A 끝(= 미규정 시작) · 미규정 끝(= 고속B 시작) · 축 끝. */
  readonly bandLowX0: number;
  readonly bandLowX1: number;
  readonly bandMidX1: number;
  readonly bandHighX1: number;
}

/**
 * 🔴 **파라미터 5키를 여기서 전부 읽는다.** 결측 기본값은 명세값이고 ⛔ 0.5 는 쓰지 않는다.
 *   `required` 0 · `applied` 0 · `dieArea` 0.01(= a 1) · `speedClass` 0.3333(= class 1) · `speedLog` 0
 */
export function shearTestModel(params: SceneParams): ShearTestModel {
  const required = pick(params, 'required', 0);
  const applied = pick(params, 'applied', 0);
  const dieArea = pick(params, 'dieArea', 0.01);
  const speedClass = pick(params, 'speedClass', 0.3333);
  const speedLog = pick(params, 'speedLog', 0);

  /* 🔴 `pick()` 은 NaN 을 기본값으로 바꿔 버린다 — 그래서 **원값을 따로 본다.**
     키가 아예 없으면(기본값 경로) 「모르는 것」이 아니라 「0 kg」이다. 키가 왔는데 유한하지 않을 때만
     판정을 포기하고 ▨ 를 낸다(`dieShearMarginKg` 가 NaN 이 되는 경로 — 랩이 예외를 던지지 않는다). */
  const rawApplied = params['applied'];
  const appliedKnown = rawApplied === undefined || Number.isFinite(rawApplied);

  const classIndex = Math.round(clamp01(speedClass) * ST_SHEAR_CLASS_MAX);

  /* class 0(도달 불가)은 로그가 정의되지 않는 구간이다 — 마커를 축 왼쪽 끝에 고정한다. */
  const markerX = classIndex === 0 ? ST_SPEED_AXIS_X0 : stXOfSpeedLog(speedLog);

  return {
    required,
    applied,
    dieArea,
    speedClass,
    speedLog,
    classIndex,
    dieSide: stDieSide(dieArea),
    kneeSide: ST_KNEE_SIDE,
    barTopY: stForceY(required),
    appliedY: stForceY(applied),
    markerX,
    appliedKnown,
    pass: appliedKnown && applied >= required,
    overKnee: dieArea * ST_DIE_AREA_UNITS_MAX > ST_AREA_KNEE_UNITS,
    bandLowX0: stXOfSpeed(ST_SPEED_MIN),
    bandLowX1: stXOfSpeed(ST_LOW_SPEED_MAX),
    bandMidX1: stXOfSpeed(ST_HIGH_SPEED_MIN),
    bandHighX1: stXOfSpeed(ST_SPEED_MAX),
  };
}
