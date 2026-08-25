/**
 * `polishProfile`(CMP 연마 단면) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/polishProfile.ts` — 아래 상수를 GLSL 리터럴로 주입해 `surf()` 를 만든다.
 *   · `gl/fallback2d.ts`        — Canvas2D 로 같은 프로파일을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(세로 0~1, 위쪽이 +)** 다. Canvas2D 는 세로가 뒤집혀 있으므로
 * 폴백이 `y_canvas = (1 − y_uv) · h` 로 변환한다 — 변환은 폴백의 몫이고, 형상은 여기 하나다.
 *
 * 제거량 = pressure × speed × time (Preston 형태의 **시각 매핑**일 뿐, 물리 상수는 없다).
 * 여기 나오는 숫자는 전부 화면 배치값이다(설계서 §8).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ---------------- 화면 배치값(세로 UV) ---------------- */

/** 연마 전 표면. */
export const BASE_TOP = 0.52;
/** 금속이 채워진 트렌치 바닥. */
export const TRENCH_BOT = 0.34;
/** 기판 상면. */
export const SUB_TOP = 0.30;

/**
 * 제거량 → 표면 하강 깊이(화면 세로 0~1). **전부 화면 배치값이고 물리 상수가 아니다.**
 * 2026-08-21 에 종전 0.10 / 0.075 / 0.045 에서 **비율을 그대로 둔 채 일괄 2배**로 키웠다.
 * 사유: 매핑을 바로잡은 뒤 기본 조건(24.76 kPa · 80 rpm)의 removal 이 0.1045 인데, 종전 상수로는
 * 전면 하강이 0.0104 = 캔버스 세로 400 px 기준 4.2 px 라 슬러리 스페클(±6 px) 에 묻힌다.
 * 2배로 8.4 px 가 되어 눈에 남는다. **매핑을 왜곡해 진폭을 만들지 않았다** — 매핑은 물리고,
 * 여기는 화면이다. 최대 조건(66 kPa · 200 rpm, removal 0.6963)에서도 평탄부 하강은 0.139 로
 * 트렌치 바닥(0.18) 을 넘지 않는다.
 */
export const DEPTH_FLAT = 0.20;    // 전면 제거
export const DEPTH_DISH = 0.15;    // 디싱 — 넓은 금속 위 추가 하강
/*
 * 🔴 **에로전(erosion) 상수는 여기 없다 — 정본이 두 번 「그리지 마라」고 했다.**
 *   · `12_시각화씬_공백보고.md` §4-3 공백 4:
 *     「**에로전(erosion)** — 🔴 조사가 **정의를 미확인**으로 남겼다. **씬에 넣지 마라.** 디싱만 구현한다」
 *   · `이미지/씬명세/scene_stepCoverage.md` §5 실패형상표: 「🔴 **에로전** — ❌ **그리지 마라.**」
 *   랩도 같은 근거로 미구현이다(`models/labs/metal.ts` 머리말 `E_ero` 행).
 *   2026-08-21 에 `DEPTH_EROSION = 0.09` 와 `d += denseZone(x)·removal·DEPTH_EROSION` 을 삭제했다(S-A V-2).
 *   🔴 **빈자리를 다른 그림이나 진폭 재조정으로 메우지 않았다** — 근거 없이 그리는 것보다 허전한 편이 낫다.
 */
/** 표시 한계 — Cu 가 전부 걷힌 지점(트렌치 바닥)보다 아래는 이 씬이 그리지 않는다. */
export const DEPTH_MAX = BASE_TOP - TRENCH_BOT;

/** 조밀 패턴 영역(좌) / 넓은 금속 영역(우)의 전이 구간(가로 UV). */
export const DENSE_EDGES: readonly [number, number, number, number] = [0.10, 0.14, 0.48, 0.44];
export const WIDE_EDGES: readonly [number, number, number, number] = [0.60, 0.64, 0.90, 0.86];
/** 조밀 구간 금속 줄무늬의 공간 주파수. */
export const DENSE_STRIPE_FREQ = 22.0;

/** 패드-웨이퍼 간극. 하중 0 → 1 에서 좁아진다(패드가 눌린다). */
export const PAD_GAP_AT_MIN = 0.045;
export const PAD_GAP_AT_MAX = 0.008;

/**
 * GLSL `smoothstep` 과 같은 정의.
 * 🔴 `e0 > e1`(내림차순) 로도 부른다 — 씬의 `smoothstep(0.48, 0.44, x)` 가 그렇다.
 *    GLSL 규격상 이 경우는 미정의지만 실제 구현은 전부 아래와 같이 `t=(x−e0)/(e1−e0)` 를
 *    클램프해 내려가는 계단을 준다. 폴백이 같은 그림을 그리려면 같은 정의를 써야 한다.
 */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 제거량 — pressure · speed · time 의 곱(0~1). */
export function polishRemoval(params: SceneParams): number {
  return clamp01(pick(params, 'pressure', 0.5) * pick(params, 'speed', 0.5) * pick(params, 'time', 0.4));
}

/** 조밀 패턴 영역(좌). */
export function denseZone(x: number): number {
  return smoothstep(DENSE_EDGES[0], DENSE_EDGES[1], x) * smoothstep(DENSE_EDGES[2], DENSE_EDGES[3], x);
}

/** 넓은 금속 영역(우). */
export function wideZone(x: number): number {
  return smoothstep(WIDE_EDGES[0], WIDE_EDGES[1], x) * smoothstep(WIDE_EDGES[2], WIDE_EDGES[3], x);
}

/** 금속이 존재하는 가로 위치(0~1). 조밀 구간은 줄무늬, 넓은 구간은 통짜다. */
export function metalAt(x: number): number {
  const f = x * DENSE_STRIPE_FREQ;
  const stripe = f - Math.floor(f) >= 0.5 ? 1 : 0; // GLSL step(0.5, fract(...))
  return clamp01(denseZone(x) * stripe + wideZone(x));
}

/** 표면 하강 깊이(UV). 표시 한계 `DEPTH_MAX` 에서 멈춘다. */
export function polishDepth(x: number, removal: number): number {
  let d = removal * DEPTH_FLAT;                          // 전면 제거
  d += wideZone(x) * removal * DEPTH_DISH * metalAt(x);  // 디싱: 넓은 금속이 더 깊게 파인다
  // 🔴 에로전 항은 없다(위 상수 블록의 금지 근거 참조). 조밀 구간은 전면 제거만 받는다.
  return Math.min(d, DEPTH_MAX);
}

/**
 * 연마 후 표면 높이(UV, 위쪽이 +). **미세 요철(노이즈)은 포함하지 않는다** —
 * 노이즈는 렌더 방식(GL 은 fbm, 폴백은 결정적 지터)에 딸린 표현이지 형상이 아니다.
 */
export function polishSurface(x: number, removal: number): number {
  return BASE_TOP - polishDepth(x, removal);
}

/** 패드 하면과 표면 사이 간극(UV). 하중이 클수록 좁다. */
export function padGap(pressure: number): number {
  const p = clamp01(pressure);
  return PAD_GAP_AT_MIN + (PAD_GAP_AT_MAX - PAD_GAP_AT_MIN) * p;
}
