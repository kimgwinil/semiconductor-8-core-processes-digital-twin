/**
 * `probeScrub`(EDS 프로브 접촉·스크럽) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/probeScrub.ts` — 아래 상수를 GLSL 리터럴로 주입하고, 파생값을 유니폼으로 넣는다.
 *   · `gl/fallback2d.ts`     — Canvas2D 로 같은 그림을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(세로 0~1, 위쪽이 +)** 다. Canvas2D 는 세로가 뒤집혀 있으므로
 * 폴백이 `toY(uv, h) = (1 − uv) · h` 로 변환한다 — 변환은 폴백의 몫이고, 형상은 여기 하나다.
 *
 * 🔴 여기 나오는 숫자는 **전부 화면 배치값 · 랩 출력의 역정규화 정박점**이며 물리 상수가 아니다.
 *    물리는 `models/physics/eds/**` 와 `models/labs/eds.ts` 가 계산해 0~1 로 정규화해 넘긴다
 *    (설계서 §3 계층 규칙). 정본 명세: DSN 스레드 §E-3-1 · §E-4 · §E-4-2 · §E-5 · §E'-2.
 *
 * 🔴 **이 씬은 웨이퍼 맵·수율·결함을 그리지 않는다.** 그것은 병치되는 별도 씬 `waferMap` 소관이다
 *    (DSN §E'-1 이 `eds/lab-advanced` 를 두 씬으로 쪼갰다).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ═══════════════ 화면 배치값 (UV · 좌하단 원점 · y 위쪽이 +) ═══════════════ */

/** 패드 상면도 중심(DSN §E-4 `PAD_C`). */
export const PS_PAD_CX = 0.24;
export const PS_PAD_CY = 0.74;

/** 1 µm = 몇 UV 인가(패드 상면도 척도). 개구부 60 µm ⇒ 변 0.240 · 마크 최대 90 µm ⇒ 0.360. */
export const PS_UV_PER_UM = 0.004;

/** 패시베이션 개구부 **반변**(= 60 µm 정사각형의 절반). */
export const PS_OPEN_HALF = 0.120;

/** OD 축 — 가로 [x0, x1] 이 오버드라이브 20 → 150 µm 에 대응한다. */
export const PS_OD_AXIS_X0 = 0.06;
export const PS_OD_AXIS_X1 = 0.42;
/** OD 축 y. */
export const PS_OD_AXIS_Y = 0.34;
/** OD 축 척도 = 0.36 / 130 µm. 🔴 값의 정본은 이 상수다(축 길이에서 다시 나누지 않는다). */
export const PS_OD_UV_PER_UM = 0.00276923;
/** OD **여유 치수선**이 놓이는 y. */
export const PS_OD_MARGIN_Y = 0.29;

/** 힘 축 — 가로 [x0, x1] 이 접촉력 0 → 7.5 g 에 대응한다. */
export const PS_FORCE_AXIS_X0 = 0.06;
export const PS_FORCE_AXIS_X1 = 0.42;
/** 힘 축 y. */
export const PS_FORCE_AXIS_Y = 0.14;

/* ═══════════════ 역정규화 정박점 (0~1 → 물리량) ═══════════════
 * 🔴 **부호 있는 양이라 원점을 옮긴다.** 두 양 모두 **0 이 합격선**이고 음수가 실재하므로
 *    `(v − min)/(max − min)` 를 쓴다(DSN §E-3 각주). 0 이 화면 어디에 오는지가 아래 기본값이다.
 */

/** `clearance` 0 ↔ −15 µm · 1 ↔ +25 µm (`scrubClearanceUm` 실도달 범위). */
export const PS_CLR_MIN_UM = -15;
export const PS_CLR_MAX_UM = 25;
/** `odMargin` 0 ↔ −74 µm · 1 ↔ +25.5 µm (`overdriveMarginUm` 실도달 범위). */
export const PS_ODM_MIN_UM = -74;
export const PS_ODM_MAX_UM = 25.5;
/** `force` 1 ↔ 7.5 g (= W 계수 2.5 g/mil × 실무창 상단 3 mil). */
export const PS_FORCE_MAX_G = 7.5;
/** `overdrive` 0 ↔ 20 µm · 1 ↔ 150 µm (슬라이더 정의역). */
export const PS_OD_SLIDER_MIN = 20;
export const PS_OD_SLIDER_MAX = 150;
/** 패시베이션 개구부 한 변 [µm]. 마크 변 식의 상수항이다. */
export const PS_OPENING_UM = 60;

/** OD **실무창** [µm] — 문헌 계수의 유효 구간. 바깥은 접촉력이 경계로 클램프된다. */
export const PS_OD_WIN_LO_UM = 25;
export const PS_OD_WIN_HI_UM = 76;

/* ═══════════════ 결측 기본값 ═══════════════
 * 🔴 **0.5 를 쓰지 않는다.** 0.5 는 「중간쯤 되는 가짜 값」이고 그 자체가 A15 위반이다(DSN §E-5).
 *    부호 있는 두 양은 **합격선(0 µm)** 으로, 나머지는 **축의 원점(0)** 으로 떨어뜨린다.
 */
/** = 15 / 40 → clearanceUm 0 µm(합격선). */
export const PS_DEF_CLEARANCE = 0.375;
/** = 74 / 99.5 → odMarginUm 0 µm(합격선). */
export const PS_DEF_OD_MARGIN = 0.74372;
/** 힘 0 g — 막대가 없다(있지도 않은 접촉력을 그리지 않는다). */
export const PS_DEF_FORCE = 0;
/** 재질 상한 미상 — 눈금이 축 원점에 붙는다. */
export const PS_DEF_FORCE_CEIL = 0;
/** OD 20 µm — 축 왼쪽 끝. */
export const PS_DEF_OVERDRIVE = 0;

/* ═══════════════ 표시 전용 상수 ═══════════════ */

/**
 * OD 축 · 힘 축 위 밴드(실무창 채움 · 클램프 빗금 · 마커 세로선 · 상한 눈금)의 **세로 반높이**.
 * 🔴 **명세에 세로 치수가 없다.** 지어내지 않고 **명세가 준 두 y 의 간격**에서 파생시켰다 —
 *    밴드 아래 모서리가 OD 여유 치수선 행(`PS_OD_MARGIN_Y`)에 정확히 닿는다.
 *    **어떤 물리량도 인코딩하지 않는 표시값**이다. DSN 이 치수를 확정하면 그 값으로 갈아끼운다.
 */
export const PS_BAND_HALF = Number((PS_OD_AXIS_Y - PS_OD_MARGIN_Y).toFixed(6)); // = 0.05

/** OD 실무창 채움 불투명도(DSN §E-4-1 「15 % 채움」). */
export const PS_OD_WIN_FILL = 0.15;

/** 45° 빗금 간격 [px] (DSN §E-4-1 「45° 빗금(간격 6 px)」). */
export const PS_HATCH_STEP_PX = 6;

/**
 * 판정 도형(● / ▲)의 반지름 [px].
 * 🔴 **명세에 크기가 없다.** 표시 전용이며 어떤 물리량도 인코딩하지 않는다 — DSN 확정 시 교체한다.
 */
export const PS_VERDICT_R_PX = 5;

/**
 * 길이 0 인 치수선을 **그리지 않기 위한** 최소 화면 길이 [px].
 * 🔴 사유는 명세가 적어 뒀다 — 「길이 0 선은 Canvas2D 에서 점으로 남는다」(DSN §E-5).
 *    `lineCap='round'` 라 0 길이 경로가 동그란 점이 되어 **없는 여유를 있다고 그린다.**
 */
export const PS_MIN_DIM_PX = 1;

/* ═══════════════ 변환식 — DSN 스레드 §E-4 가 준 변환식 전량 ═══════════════
 * 🔴 종전에는 이 자리에 「변환식 전량」이 **「」 인용**으로 적혀 있었고 표지가 「명세 §E-4」였다.
 *    그러면 `check-citations` 가 그 문구를 PLN `03_실습3단계명세.md` 에서 찾다가 **죽은 인용**으로 잡는다 —
 *    §E-4 는 PLN 명세가 아니라 **DSN 스레드**의 절이기 때문이다. 출처를 바로잡았다(문구를 숨긴 것이 아니다). */

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 유한하지 않은 값이 좌표로 새어 나가는 것을 막는다(A14 — NaN 하나면 path 가 통째로 사라진다). */
function finite(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** `clearance`(0~1) → 개구부 여유 [µm]. */
export function psClearanceUm(clearance: number): number {
  return PS_CLR_MIN_UM + clamp01(clearance) * (PS_CLR_MAX_UM - PS_CLR_MIN_UM);
}

/** `odMargin`(0~1) → 실무창 여유 [µm]. */
export function psOdMarginUm(odMargin: number): number {
  return PS_ODM_MIN_UM + clamp01(odMargin) * (PS_ODM_MAX_UM - PS_ODM_MIN_UM);
}

/** `force`(0~1) → 접촉력 [g]. */
export function psForceG(force: number): number {
  return clamp01(force) * PS_FORCE_MAX_G;
}

/** `overdrive`(0~1) → 오버드라이브 [µm]. */
export function psOverdriveUm(overdrive: number): number {
  return PS_OD_SLIDER_MIN + clamp01(overdrive) * (PS_OD_SLIDER_MAX - PS_OD_SLIDER_MIN);
}

/** 스크럽 마크 사각형 **한 변**(UV) = `(60 − 2·clearanceUm) × 0.004`. */
export function psMarkSideUv(clearanceUm: number): number {
  return (PS_OPENING_UM - 2 * clearanceUm) * PS_UV_PER_UM;
}

/** OD [µm] → OD 축 위 x(UV) = `0.06 + (od − 20)/130 × 0.36`. */
export function psXOfOD(odUm: number): number {
  return PS_OD_AXIS_X0 + (odUm - PS_OD_SLIDER_MIN) * PS_OD_UV_PER_UM;
}

/** 접촉력 [g] → 힘 축 위 x(UV) = `0.06 + (g / 7.5) × 0.36`. */
export function psXOfForce(g: number): number {
  return PS_FORCE_AXIS_X0 + (g / PS_FORCE_MAX_G) * (PS_FORCE_AXIS_X1 - PS_FORCE_AXIS_X0);
}

/** 개구부 여유 치수선 길이(UV) = `|clearanceUm| × 0.004`. 0 이면 그리지 않는다. */
export function psClearanceDimUv(clearanceUm: number): number {
  return Math.abs(clearanceUm) * PS_UV_PER_UM;
}

/** 실무창 여유 치수선 길이(UV) = `|marginUm| × 0.00276923`. 0 이면 그리지 않는다. */
export function psOdMarginDimUv(marginUm: number): number {
  return Math.abs(marginUm) * PS_OD_UV_PER_UM;
}

/** 힘 막대 길이(UV) = `force × 0.36`. */
export function psForceBarUv(force: number): number {
  return clamp01(force) * (PS_FORCE_AXIS_X1 - PS_FORCE_AXIS_X0);
}

/* ── 미리 그려 두는 것의 x 좌표(정적) ── */

/** OD 실무창 25 µm 경계 x = 0.0738. */
export const PS_OD_WIN_X0 = psXOfOD(PS_OD_WIN_LO_UM);
/** OD 실무창 76 µm 경계 x = 0.2151. */
export const PS_OD_WIN_X1 = psXOfOD(PS_OD_WIN_HI_UM);

/**
 * 🔴 **접촉력 클램프 구간** — `contactForceG` 가 완전히 평평한 두 구간의 x 범위.
 *    OD 20–25 (2.5 g 고정) 과 OD 76–150 (7.5 g 고정). 슬라이더 27스텝 중 16스텝(59 %)이 여기 있고
 *    **기본값 130 µm 도 여기 안**이다.
 *
 * 🔴 **이 빗금을 지우지 마라.** 배선 누락이 아니라 **의도된 클램프**다 — `eds.ts:293` 원문:
 *    「실무창 밖은 문헌 계수의 유효범위 밖이므로 경계로 클램프한다(접촉력은 표시 전용이다)」.
 *    빗금이 없으면 다음 검수자가 「7.5 g 에 얼어 있다」를 **결함으로 오진한다**(DSN §E-4-2).
 */
export const PS_CLAMP_LO_X0 = PS_OD_AXIS_X0;
export const PS_CLAMP_LO_X1 = PS_OD_WIN_X0;
export const PS_CLAMP_HI_X0 = PS_OD_WIN_X1;
export const PS_CLAMP_HI_X1 = PS_OD_AXIS_X1;

/* ═══════════════ 씬이 그리는 파생값 한 벌 ═══════════════ */

export interface ProbeScrubModel {
  /* 정규화 입력(0~1) */
  clearance: number;
  odMargin: number;
  force: number;
  forceCeil: number;
  overdrive: number;

  /* 역정규화 물리량 */
  clearanceUm: number;
  odMarginUm: number;
  forceG: number;
  overdriveUm: number;

  /* 패드 상면도 */
  /** 개구부 반변(UV) — 상수지만 폴백이 한 곳에서 받게 같이 낸다. */
  openHalf: number;
  /** 마크 사각형 한 변(UV). */
  markSide: number;
  /** 마크 사각형 반변(UV). */
  markHalf: number;
  /** 여유 치수선 길이(UV). 0 이면 그리지 않는다. */
  clearDim: number;
  /** 여유 치수선 좌·우 끝 x(UV). 개구부 모서리 ↔ 마크 모서리 사이다. */
  clearDimX0: number;
  clearDimX1: number;
  /** 마크가 개구부를 넘었는가(`clearanceUm < 0`). 넘은 띠만 빗금 친다. */
  clearFail: boolean;

  /* OD 축 */
  /** OD 마커 x(UV). */
  odMarkerX: number;
  /** 실무창 여유 치수선 길이(UV). 0 이면 그리지 않는다. */
  odDim: number;
  /** 치수선 좌·우 끝 x(UV). 마커 ↔ 가장 가까운 실무창 경계다. */
  odDimX0: number;
  odDimX1: number;
  /** 실무창 밖인가(`odMarginUm < 0`). 치수선이 창 **바깥쪽**으로 뻗는다. */
  odFail: boolean;

  /* 힘 축 */
  /** 힘 막대 길이(UV). */
  forceBar: number;
  /** 힘 막대 오른쪽 끝 x(UV). */
  forceBarX1: number;
  /** 재질별 접촉력 상한 눈금 x(UV). */
  forceCeilX: number;

  /* 판정 */
  /** 둘 다 ≥ 0 이면 합격(●), 하나라도 음수면 불합격(▲). */
  pass: boolean;
  /** 축 장식 밴드의 세로 반높이(UV). */
  bandHalf: number;
}

/**
 * 🔴 **이 씬의 모든 키를 여기서 읽는다.** `check-direction` V4 는 아래 `pick(...)` 호출의
 *    **키 문자열**로 「씬이 그 키를 읽는가」를 판정하고, `check-fallback-purity` R1 은 폴백 drawer 가
 *    이 함수를 부르는지를 판정한다. 키는 **정확히 5개**다 — 늘리지도 줄이지도 않는다(DSN §E'-2).
 *
 * 🔴 주석에 `pick(` + 키 문자열 형태를 **예시로 적지 마라.** V4 계측기는 주석을 걷어내지 않고
 *    원문을 정규식으로 훑는다 — 예시가 그대로 「이 씬이 읽는 키」로 집계돼 판정이 헐거워진다
 *    (2026-08-22 실측: 예시로 적은 문자열 하나가 없는 키를 소비 목록에 올렸다).
 */
export function probeScrubModel(params: SceneParams): ProbeScrubModel {
  const clearance = pick(params, 'clearance', PS_DEF_CLEARANCE);
  const odMargin = pick(params, 'odMargin', PS_DEF_OD_MARGIN);
  const force = pick(params, 'force', PS_DEF_FORCE);
  const forceCeil = pick(params, 'forceCeil', PS_DEF_FORCE_CEIL);
  const overdrive = pick(params, 'overdrive', PS_DEF_OVERDRIVE);

  const clearanceUm = finite(psClearanceUm(clearance), 0);
  const odMarginUm = finite(psOdMarginUm(odMargin), 0);
  const forceG = finite(psForceG(force), 0);
  const overdriveUm = finite(psOverdriveUm(overdrive), PS_OD_SLIDER_MIN);

  /* ── 패드 상면도 ──
   * markHalf − openHalf = −clearanceUm × 0.004 이므로 두 모서리 사이가 곧 치수선이다.
   * 길이를 따로 재지 않는다 — **같은 식에서 나와야 그림과 수치가 갈리지 않는다.** */
  const markSide = finite(psMarkSideUv(clearanceUm), 2 * PS_OPEN_HALF);
  const markHalf = markSide / 2;
  const clearDim = finite(psClearanceDimUv(clearanceUm), 0);
  const inner = Math.min(PS_OPEN_HALF, markHalf);
  const outer = Math.max(PS_OPEN_HALF, markHalf);

  /* ── OD 축 ──
   * 치수선의 한 끝은 **마커**, 다른 끝은 **가장 가까운 실무창 경계**다.
   * 길이는 |marginUm| × OD_UV_PER_UM 로 명세가 못 박았고, 두 끝의 간격이 정확히 그 값이 된다. */
  const odMarkerX = finite(psXOfOD(overdriveUm), PS_OD_AXIS_X0);
  const odDim = finite(psOdMarginDimUv(odMarginUm), 0);
  const towardRight =
    overdriveUm < PS_OD_WIN_LO_UM
      ? true // 창 왼쪽 밖 — 오른쪽 경계(25 µm)를 향해 뻗는다
      : overdriveUm > PS_OD_WIN_HI_UM
        ? false // 창 오른쪽 밖 — 왼쪽 경계(76 µm)를 향해 뻗는다
        : overdriveUm - PS_OD_WIN_LO_UM > PS_OD_WIN_HI_UM - overdriveUm; // 창 안 — 가까운 쪽
  const odDimX0 = towardRight ? odMarkerX : odMarkerX - odDim;
  const odDimX1 = towardRight ? odMarkerX + odDim : odMarkerX;

  /* ── 힘 축 ── */
  const forceBar = finite(psForceBarUv(force), 0);
  const forceCeilX = finite(psXOfForce(psForceG(forceCeil)), PS_FORCE_AXIS_X0);

  return {
    clearance,
    odMargin,
    force,
    forceCeil,
    overdrive,

    clearanceUm,
    odMarginUm,
    forceG,
    overdriveUm,

    openHalf: PS_OPEN_HALF,
    markSide,
    markHalf,
    clearDim,
    clearDimX0: PS_PAD_CX + inner,
    clearDimX1: PS_PAD_CX + outer,
    clearFail: clearanceUm < 0,

    odMarkerX,
    odDim,
    odDimX0,
    odDimX1,
    odFail: odMarginUm < 0,

    forceBar,
    forceBarX1: PS_FORCE_AXIS_X0 + forceBar,
    forceCeilX,

    pass: clearanceUm >= 0 && odMarginUm >= 0,
    bandHalf: PS_BAND_HALF,
  };
}
