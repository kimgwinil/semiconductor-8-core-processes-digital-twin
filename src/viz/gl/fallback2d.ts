/**
 * Canvas2D 폴백 — 설계서 §10 L4.
 * WebGL2 를 못 얻는 환경에서 **같은 정규화 파라미터**로 단면 + 프로파일 곡선을 그린다.
 * 화려할 필요는 없으나 파라미터를 움직이면 그림이 반드시 바뀐다.
 *
 * 🔴 모듈 최상위에서 document/window 를 만지지 않는다.
 *
 * 🔴🔴 **여기서 물리를 계산하지 않는다.** 씬과 폴백이 각자 식을 들고 있으면 하나는 반드시
 *    낡는다(README §6 규율 5). 실제로 2026-08-21 실측에서 폴백이 GL 정본과 최대 **23.06 배**
 *    갈려 있었다(ALD 100 °C 의 사이클당 성장 0.0394 vs 0.9091). 그래서 계산식은 셰이더 문자열이
 *    없는 순수 모듈 `scenes/models/*.model.ts` 하나에 두고, **씬과 폴백이 둘 다 그것을 import** 한다.
 *
 *    씬 모듈(`scenes/aldCycle.ts` 등)을 직접 static import 하면 셰이더 문자열까지 이 청크로
 *    끌려와 코드분할이 깨진다(A9) — 그래서 씬이 아니라 **모델 모듈**을 가져온다.
 *
 *    🔴 **8종 전부 모델 모듈로 전환 완료**(2026-08-22 확인).
 *    이 자리에 「아직 전환되지 않은 씬: `filmGrowth`·`ionTrajectory`·`stepCoverage` … 그 3종의
 *    draw 함수는 여전히 사본이다」라고 적혀 있었으나 **거짓이었다** — 아래 41~67행이 그 셋의
 *    모델 모듈을 전부 import 하고 있고, `drawStepCoverage` 는 첫 줄에서 `stepCoverageModel(p)` 를 부른다.
 *    `scripts/check-fallback-purity.mjs` 의 `SCENE_DRAWERS` 가 **8종 전부의 매핑을 강제**하며 PASS 다.
 *    🔴 씬을 새로 만들면 그 표에 한 줄 추가해야 이 규율이 유지된다.
 *
 * 🔴 좌표계: 모델 모듈은 셰이더와 같은 **UV(세로 0~1, 위가 +)** 로 말하고, Canvas2D 는 세로가
 *    뒤집혀 있다. 변환은 `toY()` 한 곳에서만 한다.
 */
import type { SceneParams } from './renderer';
import { applyRealisticBackdrop } from '../realisticBackdrops';
import { MAX_DPR } from './context';
import { pick } from './scenes/common';
/* 🔴 테마 색 판독기 — 순수 모듈이라 셰이더 문자열이 딸려 오지 않는다(A9 안전). */
import { REDUCED_MOTION_TIME, onReducedMotionChange, prefersReducedMotion } from './scenes/motion';
import {
  readVizPalette, onColorSchemeChange, cssOf, parseCssRgb,
  VIZ2D_SPEC_DASH, VIZ2D_INFO_DASH, VIZ2D_DATA_DASH,
  VIZ2D_SPEC_WIDTH, VIZ2D_INFO_WIDTH, VIZ2D_DATA_WIDTH,
} from './scenes/theme';
import {
  CYCLE_MAX as ALD_CYCLE_MAX,
  LAYER_MAX as ALD_LAYER_MAX,
  aldCycleModel,
  temperatureWindowShape,
} from './scenes/models/aldCycle.model';
import {
  BASE_TOP as POLISH_BASE_TOP,
  SUB_TOP as POLISH_SUB_TOP,
  TRENCH_BOT as POLISH_TRENCH_BOT,
  metalAt as polishMetalAt,
  padGap as polishPadGap,
  polishRemoval,
  polishSurface,
} from './scenes/models/polishProfile.model';
import { PLASMA_GEOMETRY, plasmaGlowGain, sheathThickness } from './scenes/models/plasma.model';
import {
  RULER_DIVISIONS as FG_RULER_DIVISIONS,
  FILM_MAX as FG_FILM_MAX,
  filmGrowthModel,
} from './scenes/models/filmGrowth.model';
import {
  DEPTH_SPAN as ION_DEPTH_SPAN,
  PANEL_L0 as ION_PANEL_L0,
  PANEL_L1 as ION_PANEL_L1,
  PANEL_R0 as ION_PANEL_R0,
  PANEL_W as ION_PANEL_W,
  SURFACE_Y as ION_SURFACE_Y,
  X0_BASE as ION_X0_BASE,
  X0_SPAN as ION_X0_SPAN,
  ionConcentration,
  ionTrajectoryModel,
} from './scenes/models/ionTrajectory.model';
import {
  BOT_Y as SC_BOT_Y,
  CX as SC_CX,
  FIELD_Y as SC_FIELD_Y,
  HW_EFF_FLOOR as SC_HW_EFF_FLOOR,
  TRENCH_H as SC_TRENCH_H,
  bottomCoverageAt,
  stepCoverageModel,
  wallCoverageAt,
} from './scenes/models/stepCoverage.model';
/* 🔴 대칭축 `AXIS_X`(= 0.5)는 **두 씬 공용**이라 `layout.model.ts` 가 유일한 정본이다
   (2026-08-21 팀장 조치 — 종전에는 두 모델이 각자 선언해 `check-constants` R1 이 발화했다).
   그 밖의 배치 상수는 씬별 모델에 그대로 있고, 이름이 겹치는 것들(`Rgb`·`COLOR_*` 일부)만
   여기서 **alias 로** 피한다(`CG_`/`AI_` 접두). */
import { AXIS_X } from './scenes/models/layout.model';
import {
  MELT_BOTTOM as CG_MELT_BOTTOM,
  NECK_HALF as CG_NECK_HALF,
  NECK_TOP as CG_NECK_TOP,
  SHOULDER_TOP as CG_SHOULDER_TOP,
  CHUCK_BOTTOM as CG_CHUCK_BOTTOM,
  CHUCK_HALF as CG_CHUCK_HALF,
  CRUCIBLE_HALF as CG_CRUCIBLE_HALF,
  CRUCIBLE_WALL as CG_CRUCIBLE_WALL,
  SUSCEPTOR_WALL as CG_SUSCEPTOR_WALL,
  HEATER_INNER as CG_HEATER_INNER,
  HEATER_OUTER as CG_HEATER_OUTER,
  HEATER_TOP as CG_HEATER_TOP,
  HEATER_BOTTOM as CG_HEATER_BOTTOM,
  HEATER_MEANDER_FREQ as CG_MEANDER_FREQ,
  BOTTOM_HEATER_TOP as CG_BH_TOP,
  BOTTOM_HEATER_BOTTOM as CG_BH_BOTTOM,
  BOTTOM_HEATER_HALF as CG_BH_HALF,
  INSULATION_OUTER as CG_INSULATION_OUTER,
  SHIELD_INNER_HALF as CG_SHIELD_IN,
  SHIELD_OUTER_HALF as CG_SHIELD_OUT,
  SHIELD_BOTTOM as CG_SHIELD_BOTTOM,
  SHIELD_TOP as CG_SHIELD_TOP,
  VIEWPORT_X as CG_VIEWPORT_X,
  VIEWPORT_Y0 as CG_VIEWPORT_Y0,
  VIEWPORT_Y1 as CG_VIEWPORT_Y1,
  CRYSTAL_ARC_RADIUS as CG_CRYSTAL_ARC_R,
  CRYSTAL_ARC_Y as CG_CRYSTAL_ARC_Y,
  CRUCIBLE_ARC_RADIUS as CG_CRUCIBLE_ARC_R,
  CRUCIBLE_ARC_Y as CG_CRUCIBLE_ARC_Y,
  PARTICLE_SLOTS as CG_PARTICLE_SLOTS,
  PARTICLE_SIZE as CG_PARTICLE_SIZE,
  FUME_SPAN as CG_FUME_SPAN,
  FACET_FREQ as CG_FACET_FREQ,
  COLOR_MELT_SI,
  COLOR_MELT_SI_HI,
  COLOR_HEATER,
  COLOR_HEATER_HOT,
  COLOR_CRYSTAL,
  COLOR_QUARTZ,
  COLOR_GRAPHITE,
  COLOR_INSULATION,
  COLOR_SHIELD,
  COLOR_CHUCK,
  COLOR_ARGON,
  COLOR_FUME,
  COLOR_POWDER,
  COLOR_PARTICLE,
  COLOR_MENISCUS,
  crystalGrowthModel,
  type Rgb,
} from './scenes/models/crystalGrowth.model';
import {
  IS_AXIS_Y,
  IS_INGOT_X0,
  IS_INGOT_X1,
  IS_OUTPUT_COUNT,
  IS_OUTPUT_X0,
  IS_OUTPUT_X1,
  IS_WIRE_COUNT,
  IS_WIRE_X0,
  IS_WIRE_X1,
  ingotSlicingModel,
} from './scenes/models/ingotSlicing.model';
import {
  SUBSTRATE_TOP as AI_SUBSTRATE_TOP,
  PITCH_UV as AI_PITCH_UV,
  LINE_COUNT as AI_LINE_COUNT,
  LENS_BOTTOM as AI_LENS_BOTTOM,
  LENS_TOP as AI_LENS_TOP,
  LENS_SAG as AI_LENS_SAG,
  BARREL_HALF as AI_BARREL_HALF,
  GAP_HALF as AI_GAP_HALF,
  NOZZLE_HALF_IN as AI_NOZZLE_IN,
  NOZZLE_HALF_OUT as AI_NOZZLE_OUT,
  GAS_SEAL_OUT as AI_GAS_SEAL_OUT,
  SCAN_ARROW_Y as AI_SCAN_ARROW_Y,
  SCAN_BAR as AI_SCAN_BAR,
  PUPIL_CX as AI_PUPIL_CX,
  PUPIL_CY as AI_PUPIL_CY,
  PUPIL_R as AI_PUPIL_R,
  SW_SPACING_V as AI_SW_SPACING_V,
  SW_CONTRAST_BASE as AI_SW_CONTRAST_BASE,
  EDGE_BLUR_MAX as AI_EDGE_BLUR_MAX,
  WATER_FLOW_SPEED as AI_WATER_FLOW_SPEED,
  IMMERSION_INDEX as AI_IMMERSION_INDEX,
  NA_SCENE_MAX as AI_NA_SCENE_MAX,
  COLOR_BARREL as AI_COLOR_BARREL,
  COLOR_LENS as AI_COLOR_LENS,
  COLOR_WATER as AI_COLOR_WATER,
  COLOR_NOZZLE as AI_COLOR_NOZZLE,
  COLOR_GAS as AI_COLOR_GAS,
  COLOR_SUBSTRATE as AI_COLOR_SUBSTRATE,
  COLOR_RESIST as AI_COLOR_RESIST,
  COLOR_LIGHT as AI_COLOR_LIGHT,
  aerialImageModel,
} from './scenes/models/aerialImage.model';
/* 🔴 2026-08-22 신설 5종 — eds·packaging 이 「화면이 하나도 없는 2공정」이던 상태를 닫는다.
   상수·파생값의 정본은 전부 아래 모델 모듈이고, drawer 는 **호출만** 한다(check-fallback-purity R1·R2). */
import {
  PS_BAND_HALF,
  PS_CLAMP_HI_X0,
  PS_CLAMP_HI_X1,
  PS_CLAMP_LO_X0,
  PS_CLAMP_LO_X1,
  PS_FORCE_AXIS_X0,
  PS_FORCE_AXIS_X1,
  PS_FORCE_AXIS_Y,
  PS_HATCH_STEP_PX,
  PS_MIN_DIM_PX,
  PS_OD_AXIS_X0,
  PS_OD_AXIS_X1,
  PS_OD_AXIS_Y,
  PS_OD_MARGIN_Y,
  PS_OD_WIN_FILL,
  PS_OD_WIN_X0,
  PS_OD_WIN_X1,
  PS_PAD_CX,
  PS_PAD_CY,
  PS_VERDICT_R_PX,
  probeScrubModel,
} from './scenes/models/probeScrub.model';
import {
  WM_BADGE_CX,
  WM_BADGE_R,
  WM_DIE_DIM_ALPHA,
  WM_DL_DECADE_Y,
  WM_DL_PASS_Y,
  WM_GAUGE_X0,
  WM_GAUGE_X1,
  WM_GAUGE_Y0,
  WM_WAFER_CX,
  WM_WAFER_CY,
  WM_WAFER_R_Y,
  waferMapModel,
  wmCellInDisk,
  wmIsDefect,
} from './scenes/models/waferMap.model';
import {
  PT_BOARD_BOT,
  PT_BOARD_FILL_A,
  PT_BOARD_TOP,
  PT_BOUNDARIES,
  PT_DIE_X0,
  PT_DIE_X1,
  PT_DIE_Y0,
  PT_DIE_Y1,
  PT_DOMAIN_START_X,
  PT_DOMAIN_START_Y,
  PT_DOT_R,
  /* 🔴 열류 표시 — 이 씬의 **유일한 시간 의존**. 통과율 ∝ P_H(모델 §③). */
  PT_FLUX_DN_Y0,
  PT_FLUX_DN_Y1,
  PT_FLUX_HALF_H,
  PT_FLUX_HALF_W,
  PT_FLUX_MARKS,
  PT_FLUX_UP_Y0,
  PT_FLUX_UP_Y1,
  PT_FLUX_X,
  PT_MARKER_R,
  PT_PAXIS_X0,
  PT_PAXIS_X1,
  PT_PAXIS_Y0,
  PT_PAXIS_Y1,
  PT_PKG_FILL_A,
  PT_PKG_TOP,
  PT_PKG_X0,
  PT_PKG_X1,
  PT_REF_X0,
  PT_REF_X1,
  PT_SECTION_X0,
  PT_SECTION_X1,
  PT_STEPS,
  PT_TAXIS_X,
  PT_TAXIS_Y0,
  PT_TAXIS_Y1,
  PT_TCOL_X0,
  PT_TCOL_X1,
  PT_VERDICT_R,
  PT_VERDICT_X,
  PT_VERDICT_Y,
  packageThermalModel,
  ptFluxAmplitude,
  ptFluxPhase,
} from './scenes/models/packageThermal.model';
import {
  MS_AXIS_TICK_H,
  MS_AXIS_TICK_X,
  MS_AXIS_Y,
  MS_DIM_ARROW_HALF,
  MS_DIM_ARROW_LEN,
  MS_DIM_EXT_HALF,
  MS_GHOST_ALPHA,
  MS_MARK_HALF_W,
  MS_MARK_OVERHANG,
  MS_ROW_FLOOR_Y0,
  MS_ROW_FLOOR_Y1,
  MS_ROW_MARGIN_Y,
  MS_ROW_SOAK_Y0,
  MS_ROW_SOAK_Y1,
  MS_TIME_X0,
  MS_TIME_X1,
  MS_VERDICT_R,
  MS_VERDICT_X,
  moistureSoakModel,
} from './scenes/models/moistureSoak.model';
import {
  ST_BADGE_CY,
  ST_BAND_H,
  ST_BELOW_LOW_X0,
  ST_DIE_PANEL_CX,
  ST_DIE_PANEL_CY,
  ST_FILL_ALPHA,
  ST_FORCE_BAR_X0,
  ST_FORCE_BAR_X1,
  ST_FORCE_BAR_Y0,
  ST_HATCH_PX,
  ST_HATCH_W_PX,
  ST_MARK_R,
  ST_SPEED_AXIS_X0,
  ST_SPEED_AXIS_X1,
  ST_SPEED_AXIS_Y,
  ST_VERDICT_CX,
  ST_VERDICT_CY,
  shearTestModel,
} from './scenes/models/shearTest.model';

export type FallbackSceneId =
  | 'filmGrowth'
  | 'plasma'
  | 'ionTrajectory'
  | 'polishProfile'
  | 'stepCoverage'
  | 'aldCycle'
  | 'crystalGrowth'
  | 'ingotSlicing'
  | 'aerialImage'
  /* 🔴 2026-08-22 신설 — eds 병치 2종 + packaging 3종. 이제 13종 전부 폴백 drawer 를 갖는다. */
  | 'probeScrub'
  | 'waferMap'
  | 'packageThermal'
  | 'moistureSoak'
  | 'shearTest';

export interface Fallback2D {
  readonly id: FallbackSceneId;
  update(params: SceneParams): void;
  redraw(): void;
  /**
   * 🔴 **시각을 지정해 한 장 그린다.** 폴백의 rAF 루프도 이 함수를 통해 그리므로 경로가 하나다.
   *    이 값이 폴백의 내부 시계가 되고, 이후 `update()`·테마 전환·리사이즈는 **이 시각을 그대로 쓴다** —
   *    그래서 계측(테마 프로브·단위테스트)이 결정론적으로 재현된다.
   */
  drawAt(t: number): void;
  dispose(): void;
}

/* 🔴 DPR 상한은 `./context.ts` 가 정본이다 — 여기서 다시 선언하지 않는다(§3-X A-9 · `check-constants` R1).
 *    `context.ts` 는 아무것도 import 하지 않는 순수 모듈이고, 배럴(`src/viz/index.ts`)이 이미
 *    폴백과 함께 정적으로 재수출하므로 이 import 로 초기 청크가 늘지 않는다. */

interface Palette {
  fg: string;
  dim: string;
  bg: string;
  substrate: string;
  film: string;
  metal: string;
  accent: string;
  warn: string;
  /* 🔴 2026-08-22 신설 — **판정선·데이터 계열의 색은 CSS 토큰이 정본이다**(`ui/styles/index.css`).
     eds·packaging 신설 씬 5종이 규격선(`--viz-spec`)·참고선(`--viz-info`)·계열색(`--viz-series-N`)을
     쓴다. 아래 세 값은 `readVizPalette()` 가 캔버스에 적용된 실제 토큰을 읽어 만든 것이라
     **라이트/다크가 CSS 한 곳에서 갈린다** — 폴백이 색을 따로 들고 있지 않다. */
  spec: string;
  info: string;
  series: readonly string[];
}

function palette(canvas: HTMLCanvasElement): Palette {
  let fg = '#c8ccd6';
  try {
    const c = typeof getComputedStyle === 'function' ? getComputedStyle(canvas).color : '';
    if (c) fg = c;
  } catch {
    /* jsdom 등에서 실패해도 기본값으로 진행 */
  }
  const viz = readVizPalette(canvas);
  return {
    fg,
    dim: 'rgba(128,140,160,0.55)',
    bg: cssOf(viz.bg),
    substrate: '#3a3f4a',
    film: '#4d93cf',
    metal: '#d08c4a',
    accent: '#5fd0d8',
    warn: '#e8c04a',
    spec: cssOf(viz.spec),
    info: cssOf(viz.info),
    series: viz.series.map((v) => cssOf(v)),
  };
}

/** UV 세로좌표(위가 +) → Canvas2D 세로좌표(아래가 +). 모델 ↔ 화면 변환은 여기 한 곳뿐이다. */
function toY(uvY: number, h: number): number {
  return (1 - uvY) * h;
}

/** #rrggbb 두 색을 t(0~1)로 섞는다. GL 의 mix(colA, colB, t) 와 같은 역할. */
function mixHex(a: string, b: string, t: number): string {
  const u = Math.min(1, Math.max(0, t));
  const ch = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const v = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * u));
  return `rgb(${v[0]},${v[1]},${v[2]})`;
}

/**
 * 모델이 export 하는 재료색(`Rgb`, 0~1 세 성분)을 CSS 색으로 바꾼다.
 * GL 은 같은 배열을 `glslRgb()` 로 vec3 리터럴로 찍는다 — **값의 정본은 모델 하나**이고
 * 여기서는 표기만 바꾼다. `gain` 은 GLSL 의 `col *= k`(파셋 명암·열응력)에 해당한다.
 */
function rgbOf(v: Rgb, alpha = 1, gain = 1): string {
  const q = (i: number): number => Math.round(Math.min(1, Math.max(0, (v[i] ?? 0) * gain)) * 255);
  return alpha >= 1 ? `rgb(${q(0)},${q(1)},${q(2)})` : `rgba(${q(0)},${q(1)},${q(2)},${alpha})`;
}

/**
 * 팔레트 색 문자열에 알파를 입힌다 — `rgbOf(COLOR_X, a)` 의 **토큰판**이다.
 *
 * 🔴 왜 필요한가 — 재질색은 `Rgb` 배열이라 `rgbOf(v, a)` 로 알파를 줄 수 있지만,
 *    테마 토큰은 `Palette` 에 이미 CSS 문자열로 들어 있다(`cssOf(viz.*)`).
 *    계측선을 토큰으로 옮기면서 **알파 합성을 그대로 유지**해야 해서 문자열 → RGB → 문자열로 되돌린다.
 *    새 색을 만들지 않는다 — 파싱·직렬화는 전부 `scenes/theme` 의 정본 함수를 쓴다.
 */
function withAlpha(css: string, alpha: number): string {
  return cssOf(parseCssRgb(css, [1, 1, 1]), alpha);
}

/** 두 재료색을 섞는다 — GLSL `mix(a, b, t)` 와 같다(히터 미앤더·융액 반사에 쓴다). */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** GLSL `smoothstep(e0,e1,x)` 과 같다 — 잉곳 숄더처럼 셰이더가 mix 하는 자리에서만 쓴다. */
function smoothstep01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

/** 거칠기 파라미터를 눈에 보이는 요철로 바꾼다(결정적 의사난수 — 화면이 재현된다). */
function jitter(i: number, amp: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * amp;
}

function line(g: CanvasRenderingContext2D, pts: Array<[number, number]>, color: string, width: number, dash?: number[]): void {
  if (pts.length === 0) return;
  g.save();
  g.beginPath();
  if (dash) g.setLineDash(dash);
  const first = pts[0];
  if (!first) {
    g.restore();
    return;
  }
  g.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    if (q) g.lineTo(q[0], q[1]);
  }
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
  g.restore();
}

/* ---------------- 씬별 드로잉 ---------------- */

function drawFilmGrowth(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  // 🔴 원표면·계면 하강량·막 높이·거칠기 진폭·균일도 편차는 전부 models/filmGrowth.model 이 정본이다.
  //    (종전 사본은 0.28 / 0.48 / 0.035 라는 다른 수를 썼고 `uniformity` 는 아예 없었다.)
  // 🔴 `m.subTop` 은 **두께에 따라 내려가는 계면**이다 — 산화막이 Si 를 먹고 자라는 몫(S121)이
  //    모델에 들어 있어 폴백도 GL 과 같은 그림을 그린다. 여기서 다시 계산하지 않는다.
  const m = filmGrowthModel(p);
  const subTop = toY(m.subTop, h);
  const devPx = m.lateralDevAmp * h;
  const roughPx = m.roughFilmAmp * h;
  const subRoughPx = m.roughSubAmp * h;
  /** 균일도가 만드는 좌우 기울기 — GL 은 vnoise, 여기는 결정적 sin. **진폭이 정본이다.** */
  const lateral = (x: number): number => Math.sin(x * Math.PI * 2 + 1.7) * devPx;
  const filmTop = (x: number): number => toY(m.filmTopMean, h) + lateral(x / w);

  // 기상 반응종이 막 표면으로 이동하는 과정. 밀도·속도는 공정 계수로
  // 표시하지 않는 장면 설명용 고정값이다. 입력으로 받지 않은 유량을 꾸며내지 않는다.
  const speciesColor = mixHex(c.info, c.warn, m.tint);
  g.fillStyle = speciesColor;
  g.globalAlpha = 0.72;
  for (let i = 0; i < 24; i++) {
    const x = ((i * 0.6180339887 + 0.07) % 1) * w;
    const topY = h * 0.08;
    const bottomY = Math.max(topY + 1, filmTop(x) - h * 0.025);
    const q = (i * 0.173 + t * 0.13) % 1;
    const y = topY + q * (bottomY - topY);
    g.beginPath();
    g.arc(x, y, 1.5 + (i % 3) * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  g.fillStyle = c.substrate;
  g.fillRect(0, subTop, w, h - subTop);

  // 박막 — 재질 색은 tint 로 **연속 보간**한다(GL 과 같다. 종전 폴백은 0.5 에서 뚝 끊겼다)
  g.fillStyle = mixHex(c.film, c.metal, m.tint);
  g.globalAlpha = 0.85;
  for (let x = 0; x < w; x += 2) {
    const y = filmTop(x);
    g.fillRect(x, y, 2, subTop - y);
  }
  g.globalAlpha = 1;

  // 계면 거칠기 — 두 계면 모두 흔들린다(GL 은 fbm, 여기는 결정적 지터. 진폭은 모델 값이다)
  const n = 120;
  const filmPts: Array<[number, number]> = [];
  const subPts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    // GL 은 막 상면의 fbm 두 번째 축에 uTime×0.12 를 넣는다. Canvas2D 도
    // 기판 계면은 고정하고 막 상면 요동만 시간에 따라 이동시킨다.
    filmPts.push([x, filmTop(x) + jitter(i + t * 7.3, roughPx)]);
    subPts.push([x, subTop + jitter(i + 57, subRoughPx)]);
  }
  line(g, filmPts, c.fg, 1.5);
  line(g, subPts, c.dim, 1);

  // 두께 눈금 + 현재 두께 마커(요철·편차를 뺀 평균 높이 — GL 의 마커와 같은 값)
  for (let i = 0; i <= FG_RULER_DIVISIONS; i++) {
    const y = subTop - (i / FG_RULER_DIVISIONS) * FG_FILM_MAX * h;
    line(g, [[6, y], [i % 5 === 0 ? 26 : 16, y]], c.dim, 1);
  }
  line(g, [[0, toY(m.filmTopMean, h)], [w, toY(m.filmTopMean, h)]], c.warn, 1, [5, 4]);

  // 산화 전 원표면 기준선 — 이 선 아래가 먹힌 Si, 위가 표면 융기다(GL 의 파선과 같은 자리).
  const origY = toY(m.origSurface, h);
  line(g, [[0, origY], [w, origY]], c.dim, 1, [3, 5]);
}

function drawPlasma(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const power = pick(p, 'power', 0.5);
  const pressure = pick(p, 'pressure', 0.4);
  const bias = pick(p, 'bias', 0.35);
  const flow = pick(p, 'flow', 0.5);

  // 🔴 시스 두께와 발광 배율을 **여기서 계산하지 않는다** — 정본은 models/plasma.model 이다.
  //    (종전 사본은 `(0.10 − 0.07·pressure)·(0.7 + 0.65·power)` 로 전력 부호가 반대였고
  //     bias 항이 아예 없었다 — 결함 ❌-3 · ❌-4 가 폴백에만 남아 있었다.)
  const sheath = sheathThickness({ pressure, power, bias }) * h;
  const glow = plasmaGlowGain(power);
  const top = toY(PLASMA_GEOMETRY.SHOWER_Y, h);      // 상부 전극 하면
  const bottom = toY(PLASMA_GEOMETRY.WAFER_Y, h);    // 웨이퍼 상면
  const susTop = toY(PLASMA_GEOMETRY.SUSCEPTOR_Y, h);
  const bulkH = Math.max(0, bottom - top - 2 * sheath);

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);

  // 벌크 플라즈마 휘도 — 시스 바깥에서만. 전력 하한에서도 꺼지지 않는다(glowGain 의 하한).
  const grad = g.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, `rgba(150,80,220,${0.45 * glow})`);
  grad.addColorStop(0.5, `rgba(220,120,200,${0.85 * glow})`);
  grad.addColorStop(1, `rgba(150,80,220,${0.45 * glow})`);
  g.fillStyle = grad;
  g.fillRect(w * 0.06, top + sheath, w * 0.88, bulkH);

  // 전극·서셉터·웨이퍼
  g.fillStyle = c.substrate;
  g.fillRect(w * 0.06, top - h * 0.10, w * 0.88, h * 0.10);   // 샤워헤드
  g.fillRect(w * 0.10, susTop, w * 0.80, h * 0.10);            // 서셉터
  g.fillStyle = '#9ea8b8';
  g.fillRect(w * 0.14, bottom, w * 0.72, susTop - bottom);     // 웨이퍼

  // 샤워헤드 가스 유입. WebGL 의 uFlow 줄기와 같이 유량이 줄기 수·길이,
  // 시간이 하강 위치를 결정한다. 플라즈마 전력과 가스 유량을 같은 밝기로
  // 표현하지 않는다 — flow=0 이어도 벌크 발광은 power 항으로 남는다.
  const gasCount = Math.max(2, Math.round(3 + 10 * flow));
  const gasSpan = Math.max(1, bottom - sheath - top);
  const gasLen = h * (0.018 + 0.055 * flow);
  g.globalAlpha = 0.35 + 0.5 * flow;
  for (let i = 0; i < gasCount; i++) {
    const x = w * (0.12 + (i / Math.max(1, gasCount - 1)) * 0.76);
    const phase = (t * (0.35 + 1.25 * flow) + i * 0.173) % 1;
    const y0 = top + phase * gasSpan;
    const y1 = Math.min(bottom - sheath, y0 + gasLen);
    line(g, [[x, y0], [x, y1]], c.info, 1 + flow);
  }
  g.globalAlpha = 1;

  // 시스 경계
  line(g, [[w * 0.06, top + sheath], [w * 0.94, top + sheath]], c.accent, 1.5, [6, 4]);
  line(g, [[w * 0.06, bottom - sheath], [w * 0.94, bottom - sheath]], c.accent, 1.5, [6, 4]);

  // 이온 플럭스 화살표(하부 시스 → 웨이퍼). 바이어스가 길이·굵기를 정한다.
  const len = sheath * (0.4 + 0.6 * bias);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.12 + (i / 8) * 0.76);
    const y0 = bottom - sheath;
    const y1 = y0 + len;
    line(g, [[x, y0], [x, y1]], c.accent, 1 + 2 * bias);
    line(g, [[x - 4, y1 - 6], [x, y1], [x + 4, y1 - 6]], c.accent, 1 + 2 * bias);
  }
}

function drawIonTrajectory(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  // 🔴 축 배치·R_p·σ·틸트각·농도 진폭은 전부 models/ionTrajectory.model 이 정본이다.
  //    (종전 사본은 깊이 축을 0.58 로 잡아 R_p·σ 가 26.1 % 깊게 찍혔다.)
  const m = ionTrajectoryModel(p);
  const dose = pick(p, 'dose', 0.6);
  const surfaceY = toY(ION_SURFACE_Y, h);
  const span = ION_DEPTH_SPAN * h;
  const panelX = ION_PANEL_R0 * w;
  const panelW = ION_PANEL_W * w;

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = c.substrate;
  g.fillRect(ION_PANEL_L0 * w, surfaceY, (ION_PANEL_L1 - ION_PANEL_L0) * w, h - surfaceY);
  line(g, [[0, surfaceY], [w, surfaceY]], c.fg, 1.5);

  // 궤적 — 개수는 도즈, 깊이는 R_p×스트래글, 기울기는 틸트각, 흐트러짐은 산란
  // (개별 이온의 난수는 GL 과 다르다 — 같아야 하는 것은 범위·각도이고 그 전부가 모델 값이다.)
  const count = Math.max(6, Math.round(10 + dose * 50));
  for (let i = 0; i < count; i++) {
    const seedX = (i * 0.6180339887) % 1;
    const seedY = (i * 0.7548776662) % 1;
    const straggle = m.straggleLo + (m.straggleHi - m.straggleLo) * seedY;
    const d = m.rangePeak * straggle * h;
    const x0 = (ION_X0_BASE + seedX * ION_X0_SPAN) * w;
    const x1 = x0 + d * Math.tan(m.tiltAngle) + jitter(i + 99, d * m.lateralGain * 0.5);
    g.globalAlpha = 0.55;
    line(g, [[x0, surfaceY], [x1, surfaceY + d]], c.accent, 1);
    g.globalAlpha = 1;
    g.fillStyle = c.warn;
    g.fillRect(x1 - 1.5, surfaceY + d - 1.5, 3, 3);

    // 주입 중인 이온 전면. 꾸며낸 추가 깊이를 생성하지 않고, 이미 계산된
    // 구간 [표면, R_p×straggle] 안에서만 시간 위상을 이동시킨다.
    const q = (t * 0.48 + seedY) % 1;
    const ionX = x0 + (x1 - x0) * q;
    const ionY = surfaceY + d * q;
    g.fillStyle = c.accent;
    g.beginPath();
    g.arc(ionX, ionY, 1.8 + dose * 0.8, 0, Math.PI * 2);
    g.fill();
  }

  // 깊이-농도 프로파일(가우시안) — 곡선의 정본은 ionConcentration()
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 100; i++) {
    const depth = (i / 100) * ION_DEPTH_SPAN;
    pts.push([panelX + ionConcentration(depth, m) * panelW, surfaceY + depth * h]);
  }
  line(g, [[panelX, surfaceY], [panelX, surfaceY + span]], c.dim, 1);
  line(g, pts, c.warn, 2);
  // R_p 표시선
  const rpY = surfaceY + m.rangePeak * h;
  line(g, [[panelX, rpY], [w - 6, rpY]], c.dim, 1, [4, 4]);
}

function drawPolishProfile(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const pressure = pick(p, 'pressure', 0.5);
  const speed = pick(p, 'speed', 0.5);
  const slurry = pick(p, 'slurry', 0.5);

  // 🔴 제거량·깊이 상수·구역 함수는 전부 models/polishProfile.model 이 정본이다.
  //    (종전 사본은 깊이 0.10/0.075/0.045 에 클램프가 없어 같은 조건에서 하강이 정확히 절반이었다.)
  const removal = polishRemoval(p);
  const baseTop = toY(POLISH_BASE_TOP, h);
  const trenchBot = toY(POLISH_TRENCH_BOT, h);
  const subTop = toY(POLISH_SUB_TOP, h);
  const surf = (xPx: number): number => toY(polishSurface(xPx / w, removal), h);

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = c.substrate;
  g.fillRect(0, subTop, w, h - subTop);

  // 산화막 + 금속 채움 — 금속 유무도 모델의 metalAt() 이 정한다
  for (let x = 0; x < w; x += 2) {
    const y = surf(x);
    g.fillStyle = '#2f4457';
    g.fillRect(x, y, 2, subTop - y);
    if (polishMetalAt(x / w) >= 0.5) {
      g.fillStyle = c.metal;
      g.fillRect(x, y, 2, trenchBot - y);
    }
  }

  const pts: Array<[number, number]> = [];
  for (let x = 0; x <= w; x += 4) pts.push([x, surf(x)]);
  line(g, pts, c.fg, 1.8);
  line(g, [[0, baseTop], [w, baseTop]], c.warn, 1, [6, 4]); // 연마 전 표면

  // 패드(하중이 클수록 표면에 밀착)
  const gap = polishPadGap(pressure) * h;
  const padPts: Array<[number, number]> = pts.map(([x, y]) => [x, y - gap] as [number, number]);
  line(g, padPts, '#a08cc0', 2);
  g.fillStyle = 'rgba(160,140,192,0.18)';
  g.fillRect(0, 0, w, Math.max(0, baseTop - gap));

  // 이송 속도 표시(패드 홈)
  for (let i = 0; i < 12; i++) {
    const x = ((i / 12) * w + t * (0.05 + 0.45 * speed) * w) % w;
    line(g, [[x, 4], [x, Math.max(6, baseTop - gap - 4)]], 'rgba(160,140,192,0.35)', 1);
  }

  // 접촉면 슬러리 입자. 밀도는 slurry, 이송 속도는 speed 가 결정한다.
  const slurryCount = Math.max(3, Math.round(4 + 28 * slurry));
  g.fillStyle = withAlpha(c.info, 0.85);
  for (let i = 0; i < slurryCount; i++) {
    const q = (i * 0.6180339887 + t * (0.08 + 0.72 * speed)) % 1;
    const x = q * w;
    const y = surf(x) - gap * (0.18 + 0.64 * ((i * 0.37) % 1));
    g.beginPath();
    g.arc(x, y, 1.1 + slurry * 1.2, 0, Math.PI * 2);
    g.fill();
  }
}


/**
 * 트렌치 단면 스텝 커버리지 — 가시각 적분으로 측벽·바닥 두께를 정하고 오프셋 윤곽으로 그린다.
 * 종횡비↑ → 좁고 깊어져 안쪽이 얇아지고, 직진성↓·압력↑ → 처마가 커져 입구가 닫힌다.
 *
 * 🔴 적분·상수는 전부 `models/stepCoverage.model` 이 정본이다. 여기서 다시 적지 않는다.
 *    (종전 사본은 심프슨 구간 수가 24 로 달랐고 평탄면·바닥의 화면 높이가 0.04 씩 어긋나 있었다.)
 */
function drawStepCoverage(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette): void {
  const m = stepCoverageModel(p);
  const ar = w / h;                       // GL 은 가로도 「높이 단위」로 잰다
  const fieldY = toY(SC_FIELD_Y, h);
  const botY = toY(SC_BOT_Y, h);
  const depthH = SC_TRENCH_H * h;
  const cx = SC_CX * w;
  const hw = Math.min(m.halfWidth, 0.36 * ar) * h;              // 지나치게 좁은 캔버스에서만 걸린다
  const hwEff = Math.max(hw - (m.halfWidth - m.hwEff) * h, SC_HW_EFF_FLOOR * h);
  const tauField = m.tauField * h;
  const overhang = m.overhang * h;

  const tauWall = (d: number): number => tauField * wallCoverageAt(d / h, hwEff / h, m.srcExp, m.norm);
  const tauBot = (sx: number): number => tauField * bottomCoverageAt(sx / h, hwEff / h, m.srcExp, m.norm);

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);

  // 기판 + 트렌치
  g.fillStyle = c.substrate;
  g.fillRect(0, fieldY, w * 0.82, h - fieldY);
  g.fillStyle = c.bg;
  g.fillRect(cx - hw, fieldY, hw * 2, botY - fieldY);

  // 막 — 평탄면 · 측벽 · 바닥
  g.fillStyle = '#c6cbd8';
  g.fillRect(0, fieldY - tauField, cx - hw, tauField);
  g.fillRect(cx + hw, fieldY - tauField, w * 0.82 - (cx + hw), tauField);
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * depthH;
    const t = tauWall(d);
    const y = fieldY + d;
    const seg = depthH / steps + 1;
    g.fillRect(cx - hw, y, t, seg);
    g.fillRect(cx + hw - t, y, t, seg);
  }
  for (let i = 0; i <= steps; i++) {
    const sx = (-1 + (2 * i) / steps) * hw;
    const t = tauBot(sx);
    g.fillRect(cx + sx, botY - t, (2 * hw) / steps + 1, t);
  }
  // 처마(입구 위로 말려 올라가는 부분)
  g.fillRect(cx - hw, fieldY - tauField, overhang, tauField);
  g.fillRect(cx + hw - overhang, fieldY - tauField, overhang, tauField);

  // 봉인된 보이드 강조 — 판정은 모델의 pinch 다
  if (m.pinch > 0.5) {
    g.save();
    g.strokeStyle = '#f05a4a';
    g.lineWidth = 2;
    g.strokeRect(cx - hw + tauWall(depthH * 0.5), fieldY + overhang, Math.max(2, 2 * (hw - tauWall(depthH * 0.5))), Math.max(2, depthH - overhang - tauBot(0)));
    g.restore();
  }

  // 원래 트렌치 윤곽(점선)
  line(g, [[0, fieldY], [cx - hw, fieldY], [cx - hw, botY], [cx + hw, botY], [cx + hw, fieldY], [w * 0.82, fieldY]], c.accent, 1, [5, 4]);

  // 플럭스 부채꼴 — 각분포가 넓을수록 벌어진다
  for (let i = -6; i <= 6; i++) {
    const phi = (i / 6) * (Math.PI / 2) * 0.9;
    const alpha = Math.pow(Math.max(Math.cos(phi), 0), m.srcExp);
    if (alpha < 0.02) continue;
    g.globalAlpha = Math.min(1, alpha);
    line(g, [[cx + Math.tan(phi) * (fieldY - tauField), 0], [cx, fieldY - tauField]], c.accent, 1.2);
    g.globalAlpha = 1;
  }

  // 상대 두께 비교 게이지(숫자 없음 — U-7). 막대 길이도 모델의 커버리지 값이다.
  const gx = w * 0.85;
  const gwid = w * 0.13;
  const bars: Array<[number, number, string]> = [
    [h * 0.34, 1, c.fg],
    [h * 0.46, m.wallCoverage, c.accent],
    [h * 0.58, m.bottomCoverage, c.warn],
  ];
  for (const [y, v, color] of bars) {
    g.fillStyle = 'rgba(128,140,160,0.25)';
    g.fillRect(gx, y, gwid, h * 0.05);
    g.fillStyle = color;
    g.fillRect(gx, y, gwid * Math.min(1, Math.max(0, v)), h * 0.05);
  }
}

/**
 * ALD 사이클 — 두께가 사이클 수에 **계단형으로 선형** 증가하는 것이 핵심.
 * 계단 모서리가 원점에서 뻗은 직선 위에 얹힌다. 포화·온도창이 그 직선의 기울기를 정한다.
 *
 * 🔴 파생값을 **여기서 계산하지 않는다** — `aldCycleModel()` 이 정본이다. 특히 선택 파라미터
 *    `growth`(상위 층이 아는 사이클당 성장률)를 폴백이 몰라서, 종전 사본은 80·100 °C 에서
 *    사이클당 성장을 0.0394 로 계산했다 — 정본 0.8182 · 0.9091 의 1/21 · 1/23 이다.
 */
function drawAldCycle(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = aldCycleModel(p);
  const temperature = pick(p, 'temperature', 0.5);
  const phase = Math.min(m.stage / 4 + m.local / 4, 0.999999);
  const n = m.cycleCount;

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);

  /* 왼쪽: 단면 — 사이클마다 한 겹 */
  const subTop = h * 0.70;
  const layerH = m.layerHeight * h;   // 모델은 UV 단위로 말한다
  const filmH = m.filmHeight * h;
  g.fillStyle = c.substrate;
  g.fillRect(w * 0.04, subTop, w * 0.46, h * 0.12);
  g.fillStyle = '#2f5f88';
  g.fillRect(w * 0.04, subTop - filmH, w * 0.46, filmH);
  if (layerH > 2) {
    for (let k = 1; k <= n; k++) {
      const y = subTop - k * layerH;
      line(g, [[w * 0.04, y], [w * 0.50, y]], 'rgba(190,215,240,0.5)', 1);
    }
  }
  line(g, [[w * 0.04, subTop - filmH], [w * 0.50, subTop - filmH]], c.fg, 1.5);

  // 기상 분자 흐름. 전구체/반응체 단계는 표면 방향, 퍼지 단계는 반대 방향으로
  // 움직여 4단계를 색만으로 구분하지 않는다. 속도 0.24는 Canvas2D 표시용 위상값이며
  // 물리 계수로 표시하지 않는다.
  const gasSpeed = 0.24;
  const towardSurface = m.stage === 0 || m.stage === 2;
  const gasColor = m.stage >= 2 ? '#61dba9' : '#f5b252';
  g.fillStyle = gasColor;
  g.globalAlpha = 0.72;
  for (let i = 0; i < 18; i++) {
    const x = w * (0.055 + ((i * 0.6180339887) % 1) * 0.44);
    const seed = (i * 0.137) % 1;
    const q = (seed + t * gasSpeed) % 1;
    const yFrac = towardSurface ? q : 1 - q;
    const y = h * 0.10 + yFrac * Math.max(1, subTop - filmH - h * 0.15);
    g.beginPath();
    g.arc(x, y, 1.5 + (i % 3) * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 표면 흡착 자리(점유율 = m.adsorbed, 상한 = 포화)
  const sites = 26;
  const stageCol = m.stage >= 2 ? '#61dba9' : '#f5b252';
  for (let i = 0; i < sites; i++) {
    const s = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (s >= m.adsorbed) continue;
    const x = w * 0.04 + ((i + 0.5) / sites) * w * 0.46;
    g.fillStyle = stageCol;
    g.beginPath();
    g.arc(x, subTop - filmH - 4, 3.2, 0, Math.PI * 2);
    g.fill();
  }

  /* 4단계 타임라인 */
  const tlY = h * 0.90;
  const tlW = w * 0.46;
  const segCols = ['#f5b252', '#4c525f', '#61dba9', '#4c525f'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = segCols[i] ?? '#4c525f';
    g.globalAlpha = i === m.stage ? 1 : 0.45;
    g.fillRect(w * 0.04 + (i / 4) * tlW, tlY, tlW / 4 - 2, h * 0.05);
    g.globalAlpha = 1;
  }
  line(g, [[w * 0.04 + phase * tlW, tlY - 3], [w * 0.04 + phase * tlW, tlY + h * 0.05 + 3]], c.fg, 2);

  /* 오른쪽: 두께–사이클 계단 그래프 */
  const px0 = w * 0.58;
  const px1 = w * 0.97;
  const py0 = h * 0.72;
  const py1 = h * 0.08;
  const yMax = ALD_CYCLE_MAX * ALD_LAYER_MAX * h;   // 축 고정(= 0.40·h)
  const toX = (cy: number): number => px0 + (cy / ALD_CYCLE_MAX) * (px1 - px0);
  const toYg = (th: number): number => py0 + (th / yMax) * (py1 - py0);
  line(g, [[px0, py0], [px1, py0]], c.dim, 1);
  line(g, [[px0, py0], [px0, py1]], c.dim, 1);
  // 이상 선형선
  line(g, [[toX(0), toYg(0)], [toX(ALD_CYCLE_MAX), toYg(ALD_CYCLE_MAX * layerH)]], c.warn, 1.5, [6, 4]);
  // 계단 — 완성된 층은 정수 계단으로, 진행 중인 맨 위 층은 **실제 막 두께까지** 올린다.
  // 🔴 마지막 점의 x 는 `cyclesShown`(연속)이다. `cycleCount`(정수)로 끊으면 계단 모서리가
  //    이상 선형선에서 떨어져 나가 「선형이 아니다」로 보인다(D-5b 와 같은 뿌리).
  const stair: Array<[number, number]> = [[toX(0), toYg(0)]];
  for (let k = 1; k <= n; k++) {
    stair.push([toX(k - 1), toYg(k * layerH)]);
    stair.push([toX(k), toYg(k * layerH)]);
  }
  stair.push([toX(m.cyclesShown), toYg(filmH)]);
  line(g, stair, c.fg, 2);
  line(g, [[px0, toYg(filmH)], [px1, toYg(filmH)]], c.accent, 1, [4, 4]);

  /* 온도창 막대 — 3구간 + 마커. 숫자·글자 없음(U-8)
     🔴 구간 색의 근거값은 `temperatureWindowShape()` 다 — 셰이더 tempBar() 의 `win` 과 같은 양이다. */
  const tby = h * 0.82;
  const tbh = h * 0.07;
  for (let i = 0; i < 60; i++) {
    const u = i / 59;
    const win = temperatureWindowShape(u);
    g.fillStyle = win > 0.5 ? '#4cb875' : '#b8433c';
    g.globalAlpha = 0.35 + 0.65 * (win > 0.5 ? 1 : 0.5);
    g.fillRect(px0 + u * (px1 - px0), tby, (px1 - px0) / 59 + 1, tbh);
    g.globalAlpha = 1;
  }
  line(g, [[px0 + temperature * (px1 - px0), tby - 4], [px0 + temperature * (px1 - px0), tby + tbh + 4]], c.fg, 2);
}

/** 회전 원호 스윕을 정규화하는 상한(rev/s) = 결정 회전 상한 30 rpm ÷ 60. **폴백 전용 화면값**이다 —
 *  폴백에는 rAF 루프가 없어(§ `LabRunner` 주석) 각속도를 애니메이션으로 못 보여 준다. 그래서 |ω| 를
 *  **원호의 길이**로, 부호를 **도는 방향**으로 바꿔 정지 그림에 담는다. 부호곱 < 0 불변식은 그대로 산다. */
const FB_ARC_OMEGA_FULL = 0.5;

/**
 * CZ(초크랄스키) 핫존 **수직 종단면** — `wafer` 3칸(기초·응용·심화) 공용.
 * 🔴 세 칸이 **같은 것**을 그린다. 씬은 자기가 어느 칸에 붙었는지 모른다(DSN §0-1).
 *
 * 🔴 파생값·기하 상수는 전부 `models/crystalGrowth.model` 이 정본이다 — 여기서 다시 계산하지 않는다.
 *    7키(`pullRate`·`thermalGradient`·`crystalRotation`·`crucibleRotation`·`argonFlow`·
 *    `chamberPressure`·`solidFraction`)는 **모델을 거쳐서만** 화면에 닿는다. `pick()` 을 쓰지 않는다.
 *
 * 🔴 GL 의 시간 의존 표현을 Canvas2D 에서도 직접 재현한다:
 *    · 회전 원호(D-8) → 원호 **길이** ∝ |ω| · 방향 = sign(ω)
 *    · 미립 상승(D-9) → `particleRise × t` 로 도가니 내부를 상승
 *    · 파셋 스크롤(D-10) → `pullAnimSpeed × t` 로 성장선이 이동
 *    · 아르곤 유속 → 파선 마디 길이
 */
function drawCrystalGrowth(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = crystalGrowthModel(p);
  const X = (u: number): number => u * w;
  const V = (v: number): number => toY(v, h);
  const axis = X(AXIS_X);
  const surfY = V(m.meltSurfaceV);
  const botY = V(CG_MELT_BOTTOM);

  /** GL 의 `bandMask(a, lo, hi)` — 축에서 잰 좌·우 두 띠. */
  const bandLR = (lo: number, hi: number, v0: number, v1: number, fill: string): void => {
    g.fillStyle = fill;
    const y = V(v1);
    const hh = Math.max(0, V(v0) - y);
    const bw = Math.max(0, (hi - lo) * w);
    g.fillRect(X(AXIS_X - hi), y, bw, hh);
    g.fillRect(X(AXIS_X + lo), y, bw, hh);
  };
  /** 축을 가운데 두는 한 덩어리 띠. */
  const bandC = (hw: number, v0: number, v1: number, fill: string): void => {
    g.fillStyle = fill;
    const y = V(v1);
    g.fillRect(X(AXIS_X - hw), y, Math.max(0, 2 * hw * w), Math.max(0, V(v0) - y));
  };

  /* ── 1. 챔버 배경 · 단열재 · 미앤더 히터(주황~백열은 히터에만 — 조사 A §F-5) ── */
  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);
  bandLR(CG_HEATER_OUTER, CG_INSULATION_OUTER, 0, 1, rgbOf(COLOR_INSULATION));
  const hRows = Math.max(10, Math.round(((CG_HEATER_TOP - CG_HEATER_BOTTOM) * h) / 3));
  const hStep = (CG_HEATER_TOP - CG_HEATER_BOTTOM) / hRows;
  for (let i = 0; i < hRows; i++) {
    const v = CG_HEATER_BOTTOM + i * hStep;
    const k = 0.5 + 0.5 * Math.sin(v * CG_MEANDER_FREQ);
    bandLR(CG_HEATER_INNER, CG_HEATER_OUTER, v, v + hStep, rgbOf(mixRgb(COLOR_HEATER, COLOR_HEATER_HOT, k)));
  }
  const bCols = Math.max(10, Math.round((2 * CG_BH_HALF * w) / 3));
  for (let i = 0; i < bCols; i++) {
    const u = AXIS_X - CG_BH_HALF + ((i + 0.5) / bCols) * 2 * CG_BH_HALF;
    const k = 0.5 + 0.5 * Math.sin(u * CG_MEANDER_FREQ);
    g.fillStyle = rgbOf(mixRgb(COLOR_HEATER, COLOR_HEATER_HOT, k));
    g.fillRect(X(u), V(CG_BH_TOP), (2 * CG_BH_HALF * w) / bCols + 1, Math.max(0, V(CG_BH_BOTTOM) - V(CG_BH_TOP)));
  }

  /* ── 2. 흑연 서셉터 · 석영 도가니 · 융액 ──
     🔴 자유표면 높이 `meltSurfaceV` 는 D-11(= `solidFraction` 의 함수)이다. 오늘 세 칸 모두 g=0 이라
        움직이지 않지만, 값이 생기면 여기 전부(도가니 밴드·잉곳 놓임·메니스커스·흄)가 같이 내려간다. */
  const susOuter = CG_CRUCIBLE_HALF + CG_SUSCEPTOR_WALL;
  const crucInner = CG_CRUCIBLE_HALF - CG_CRUCIBLE_WALL;
  bandLR(CG_CRUCIBLE_HALF, susOuter, CG_MELT_BOTTOM - CG_SUSCEPTOR_WALL, m.meltSurfaceV + CG_SUSCEPTOR_WALL, rgbOf(COLOR_GRAPHITE));
  bandC(susOuter, CG_MELT_BOTTOM - CG_SUSCEPTOR_WALL, CG_MELT_BOTTOM, rgbOf(COLOR_GRAPHITE));
  bandLR(crucInner, CG_CRUCIBLE_HALF, CG_MELT_BOTTOM, m.meltSurfaceV + CG_CRUCIBLE_WALL, rgbOf(COLOR_QUARTZ));
  const melt = g.createLinearGradient(0, botY, 0, surfY);
  melt.addColorStop(0, rgbOf(COLOR_MELT_SI));
  melt.addColorStop(1, rgbOf(COLOR_MELT_SI_HI));
  g.fillStyle = melt;
  g.fillRect(X(AXIS_X - crucInner), surfY, 2 * crucInner * w, Math.max(0, botY - surfY));

  // 도가니 내벽 미립(D-9) — 개수는 `particleCount`, 세로 배치 위상은 `particleRise` 가 민다.
  const slots = Math.min(CG_PARTICLE_SLOTS, Math.round(m.particleCount));
  g.fillStyle = rgbOf(COLOR_PARTICLE, 0.85);
  for (let k = 0; k < slots; k++) {
    const hx = Math.abs(jitter(k * 3.7, 1));
    const hy = Math.abs(jitter(k * 1.31 + 11, 1));
    const side = k % 2 === 0 ? -1 : 1;
    const pu = AXIS_X + side * crucInner * (0.94 - 0.30 * hx);
    const pv = CG_MELT_BOTTOM + ((hy + m.particleRise * t) % 1) * (m.meltSurfaceV - CG_MELT_BOTTOM);
    g.beginPath();
    g.arc(X(pu), V(pv), Math.max(1.2, CG_PARTICLE_SIZE * h), 0, Math.PI * 2);
    g.fill();
  }

  /* ── 3. 열차폐(원뿔형) ── */
  const shieldCss = rgbOf(COLOR_SHIELD);
  for (const s of [-1, 1]) {
    line(
      g,
      [
        [X(AXIS_X + s * CG_SHIELD_IN), V(CG_SHIELD_BOTTOM)],
        [X(AXIS_X + s * CG_SHIELD_OUT), V(CG_SHIELD_TOP)],
      ],
      shieldCss,
      Math.max(3, 0.028 * h),
    );
  }

  /* ── 4. 잉곳(시드척·넥·숄더·바디) + 성장 파셋 + 열응력 ──
     고액계면 `interfaceV(u)` 는 바디 반폭 안에서 융액 쪽으로 파고든 포물선이다(D-3). */
  const ingotHalfAt = (v: number): number => {
    const t = smoothstep01(CG_SHOULDER_TOP, CG_NECK_TOP, v);
    return m.bodyHalf + (CG_NECK_HALF - m.bodyHalf) * t;
  };
  const rows = Math.max(24, Math.round((CG_CHUCK_BOTTOM - (m.meltSurfaceV - m.convexDepth)) * h));
  const vStep = (CG_CHUCK_BOTTOM - (m.meltSurfaceV - m.convexDepth)) / rows;
  for (let i = 0; i < rows; i++) {
    const v = m.meltSurfaceV - m.convexDepth + i * vStep;
    let hw = ingotHalfAt(v);
    const dv = m.meltSurfaceV - v;
    if (dv > 0) {
      // v = interfaceV(u) 를 반경에 대해 푼 것 — 계면 아래는 잉곳이 아니다.
      const kk = 1 - dv / Math.max(m.convexDepth, 1e-6);
      hw = kk <= 0 ? 0 : Math.min(hw, Math.sqrt(kk) * m.bodyHalf);
    }
    if (hw <= 0) continue;
    // 파셋(습관선) — 대비는 상수(§2-5 #7), **위상만** `pullAnimSpeed` 가 민다.
    const facet = 0.5 + 0.5 * Math.sin((v - m.pullAnimSpeed * t) * CG_FACET_FREQ);
    const y = V(v + vStep);
    const rowH = Math.max(1, V(v) - y + 1);
    g.fillStyle = rgbOf(COLOR_CRYSTAL, 1, 1 + m.facetContrast * (facet - 0.5) * 2);
    g.fillRect(axis - hw * w, y, 2 * hw * w, rowH);
    // 열응력(D-6) — **명도만**(판정색 금지). r_edge² 를 2단으로 근사한다.
    const bw = hw * w;
    g.fillStyle = `rgba(0,0,0,${(m.stressShade * 0.30).toFixed(3)})`;
    g.fillRect(axis - bw, y, bw * 0.5, rowH);
    g.fillRect(axis + bw * 0.5, y, bw * 0.5, rowH);
    g.fillStyle = `rgba(0,0,0,${(m.stressShade * 0.55).toFixed(3)})`;
    g.fillRect(axis - bw, y, bw * 0.25, rowH);
    g.fillRect(axis + bw * 0.75, y, bw * 0.25, rowH);
  }
  bandC(CG_CHUCK_HALF, CG_CHUCK_BOTTOM, CG_CHUCK_BOTTOM + 0.045, rgbOf(COLOR_CHUCK));

  /* ── 5. 등온선(D-4·D-7) · V–I 경계 세로선(D-5) ── */
  const interfaceV = (u: number): number => {
    const r = Math.min(1, Math.abs(u - AXIS_X) / Math.max(m.bodyHalf, 1e-4));
    return m.meltSurfaceV - m.convexDepth * (1 - r * r);
  };
  const isoCss = withAlpha(c.info, 0.85);
  for (let k = 1; k <= m.isothermCount; k++) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 40; i++) {
      const u = AXIS_X + (-1 + (2 * i) / 40) * m.bodyHalf;
      const asym = m.isothermAsym * (u - AXIS_X) / Math.max(m.bodyHalf, 1e-4);
      const v = interfaceV(u) + m.isothermSpacing * asym + k * m.isothermSpacing;
      if (v > CG_CHUCK_BOTTOM) continue;
      pts.push([X(u), V(v)]);
    }
    line(g, pts, isoCss, 1.2);
  }
  const viU = m.viRadius * m.bodyHalf;
  if (viU > 0.004) {
    const viCss = withAlpha(c.info, 0.9);
    for (const s of [-1, 1]) {
      const u = AXIS_X + s * viU;
      line(g, [[X(u), V(interfaceV(u))], [X(u), V(CG_SHOULDER_TOP)]], viCss, 1.6);
    }
  }

  /* ── 6. 메니스커스 밝은 링 2개(좌·우 삼중점) — 프레임 최고휘도 ──
     GL 은 `smoothstep(r, 0, d)` 뒤 제곱·1.25 배로 번지므로 폴백도 반경 3 배 헤일로로 흉내 낸다. */
  const menR = Math.max(1.5, m.meniscusRadius * h);
  for (const s of [-1, 1]) {
    const mx = X(AXIS_X + s * m.bodyHalf);
    const halo = g.createRadialGradient(mx, surfY, 0, mx, surfY, menR * 3);
    halo.addColorStop(0, rgbOf(COLOR_MENISCUS, 1));
    halo.addColorStop(0.34, rgbOf(COLOR_MENISCUS, 0.55));
    halo.addColorStop(1, rgbOf(COLOR_MENISCUS, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(mx, surfY, menR * 3, 0, Math.PI * 2);
    g.fill();
  }

  /* ── 7. 회전 원호 화살표 2개 — 🔴 부호가 **항상 반대**다(D-8 불변식) ── */
  const arcArrow = (cv: number, rU: number, omega: number, color: string): void => {
    const r = rU * h;
    const cy = V(cv);
    const dir = omega >= 0 ? 1 : -1;
    const sweep = Math.PI * (0.35 + 1.15 * Math.min(1, Math.abs(omega) / FB_ARC_OMEGA_FULL));
    const a0 = -Math.PI / 2;
    const a1 = a0 + dir * sweep;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, 0.004 * h);
    g.beginPath();
    g.arc(axis, cy, r, a0, a1, dir < 0);
    g.stroke();
    g.restore();
    const tx = axis + r * Math.cos(a1);
    const ty = cy + r * Math.sin(a1);
    const tg = a1 + (dir * Math.PI) / 2;
    const hl = Math.max(5, 0.016 * h);
    line(
      g,
      [
        [tx - hl * Math.cos(tg - 0.5), ty - hl * Math.sin(tg - 0.5)],
        [tx, ty],
        [tx - hl * Math.cos(tg + 0.5), ty - hl * Math.sin(tg + 0.5)],
      ],
      color,
      Math.max(1.5, 0.004 * h),
    );
  };
  arcArrow(CG_CRYSTAL_ARC_Y, CG_CRYSTAL_ARC_R, m.crystalOmega, withAlpha(c.series[0] ?? c.fg, 0.9));
  arcArrow(CG_CRUCIBLE_ARC_Y, CG_CRUCIBLE_ARC_R, m.crucibleOmega, withAlpha(c.series[1] ?? c.fg, 0.9));

  /* ── 8. 아르곤 유선 — 가닥 수 `argonLines`, 유속은 파선 마디 길이로 ── */
  const laneLo = CG_SHIELD_OUT;
  const laneHi = CG_HEATER_INNER;
  const nLines = Math.max(1, Math.round(m.argonLines));
  const dashLen = Math.max(4, m.argonSpeed * 0.30 * h);
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < nLines; i++) {
      const u = AXIS_X + s * (laneLo + ((i + 0.5) / nLines) * (laneHi - laneLo));
      line(g, [[X(u), 0], [X(u), h]], rgbOf(COLOR_ARGON, 0.30), 1.2, [dashLen, dashLen * 0.8]);
    }
  }

  /* ── 9. SiO 흄(D-10) — 자유표면 위 밴드. 알파가 `fumeDensity`(argonFlow·chamberPressure) ── */
  const fumeTop = V(m.meltSurfaceV + CG_FUME_SPAN);
  const fume = g.createLinearGradient(0, surfY, 0, fumeTop);
  fume.addColorStop(0, rgbOf(COLOR_FUME, Math.min(1, m.fumeDensity)));
  fume.addColorStop(1, rgbOf(COLOR_FUME, 0));
  g.fillStyle = fume;
  for (const s of [-1, 1]) {
    const lo = AXIS_X + (s < 0 ? -CG_CRUCIBLE_HALF : m.bodyHalf);
    g.fillRect(X(lo), fumeTop, (CG_CRUCIBLE_HALF - m.bodyHalf) * w, Math.max(0, surfY - fumeTop));
  }

  /* ── 10. 뷰포트(냉벽) 창 + 응축 분말층 — **두께가 지표**다(D-10) ── */
  const winTop = V(CG_VIEWPORT_Y1);
  const winH = Math.max(0, V(CG_VIEWPORT_Y0) - winTop);
  g.fillStyle = rgbOf(COLOR_QUARTZ, 0.65);
  g.fillRect(X(CG_VIEWPORT_X), winTop, 0.016 * w, winH);
  if (m.powderThickness > 0.0005) {
    g.fillStyle = rgbOf(COLOR_POWDER, 0.9);
    g.fillRect(X(CG_VIEWPORT_X - m.powderThickness), winTop, m.powderThickness * w, winH);
  }
  line(g, [[X(CG_VIEWPORT_X), winTop], [X(CG_VIEWPORT_X), winTop + winH]], c.dim, 1);
}

/**
 * ArF 침지 노광 — 광축을 포함하는 **수직 종단면 + 퓨필 인셋**. `photo` 3칸 공용.
 * 🔴 세 칸이 같은 것을 그린다(SD §3-0). 6키뿐이다:
 *    `na` · `defocus` · `exposureDose` · `resistThickness` · `lineWidth` · `fringeAmplitude`.
 *    (`medium`·`pupil` 은 **구동 입력이 없다** — SD §3 이 명시했다. 만들지 않는다.)
 *
 * 🔴 파생값은 전부 `models/aerialImage.model` 이 정본이다. 폴백이 다시 계산하는 것은
 *    셰이더와 **똑같이** 광 원뿔의 반각 `θ = asin(NA/n)` 하나뿐이다 — 모델이 `naValue` 와
 *    물리층 굴절률(`IMMERSION_INDEX`)을 내보내고 각도를 내보내지 않아서, GL 도 셰이더 안에서
 *    같은 두 값으로 같은 식을 쓴다(`aerialImage.ts` §1). 구조가 GL 과 대칭이다.
 */
function drawAerialImage(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = aerialImageModel(p);
  const X = (u: number): number => u * w;
  const V = (v: number): number => toY(v, h);
  const axis = X(AXIS_X);

  /** 최종 렌즈면(볼록 하면) — 축에서 가장 낮다. */
  const lensY = (u: number): number => {
    const r = Math.min(1, Math.abs(u - AXIS_X) / AI_BARREL_HALF);
    return AI_LENS_BOTTOM + AI_LENS_SAG * (1 - Math.sqrt(Math.max(1 - r * r, 0)));
  };
  const resistTop = AI_SUBSTRATE_TOP + m.resistHeight;

  g.fillStyle = c.bg;
  g.fillRect(0, 0, w, h);

  /* ── 1. 광 원뿔 — 초점면이 정점. 반각 θ = asin(NA/n)(SD §3-3 P-2) ── */
  const sinTheta = Math.min(0.999, Math.max(0, m.naValue / AI_IMMERSION_INDEX));
  const tanTheta = sinTheta / Math.sqrt(Math.max(1 - sinTheta * sinTheta, 1e-4));
  const coneTopV = AI_LENS_BOTTOM + AI_LENS_SAG;
  const coneHalf = tanTheta * Math.max(coneTopV - m.focusPlaneY, 0);
  g.fillStyle = rgbOf(AI_COLOR_LIGHT, 0.20);
  g.beginPath();
  g.moveTo(axis, V(m.focusPlaneY));
  g.lineTo(axis - coneHalf * w, V(coneTopV));
  g.lineTo(axis + coneHalf * w, V(coneTopV));
  g.closePath();
  g.fill();
  const coneCss = rgbOf(AI_COLOR_LIGHT, 0.75);
  for (const s of [-1, 1]) {
    line(g, [[axis, V(m.focusPlaneY)], [axis + s * coneHalf * w, V(coneTopV)]], coneCss, 1.6);
  }

  /* ── 2. 국소 갭 — 물막 · 노즐 · 기체 실. 🔴 **수조가 아니다**(조사 §F-3) ── */
  const cols = Math.max(40, Math.round(w / 3));
  for (let i = 0; i < cols; i++) {
    const u = (i + 0.5) / cols;
    const a = Math.abs(u - AXIS_X);
    if (a > AI_GAS_SEAL_OUT) continue;
    const yTop = V(lensY(u));
    const yBot = V(resistTop);
    const cw = w / cols + 1;
    g.fillStyle = a <= AI_GAP_HALF
      ? rgbOf(AI_COLOR_WATER, 0.72)
      : a <= AI_NOZZLE_IN
        ? rgbOf(AI_COLOR_GAS, 0.5)
        : a <= AI_NOZZLE_OUT
          ? rgbOf(AI_COLOR_NOZZLE, 1)
          : rgbOf(AI_COLOR_GAS, 0.7);
    g.fillRect(X(u) - cw / 2, yTop, cw, Math.max(0, yBot - yTop));
  }

  // 국소 침지수 순환 — GL 의 `x*44 - t*speed*6` 위상과 같은 시간 축을 쓴다.
  // 수조처럼 전면을 흐르지 않고, 최종 렌즈 바로 아래 `GAP_HALF` 내에서만 움직인다.
  const flowPhase = (t * AI_WATER_FLOW_SPEED) % 1;
  const flowY = V(resistTop + (AI_LENS_BOTTOM - resistTop) * 0.42);
  const flowSpan = 2 * AI_GAP_HALF * w;
  const flowLeft = X(AXIS_X - AI_GAP_HALF);
  g.globalAlpha = 0.78;
  for (let i = 0; i < 9; i++) {
    const q = (flowPhase + i / 9) % 1;
    const x = flowLeft + q * flowSpan;
    const dir = i % 2 === 0 ? 1 : -1;
    const yy = flowY + dir * h * 0.018;
    const len = Math.max(5, w * 0.012);
    line(g, [[x - dir * len, yy], [x, yy]], rgbOf(AI_COLOR_WATER, 0.95), 1.4);
    line(g, [[x - dir * 4, yy - 3], [x, yy], [x - dir * 4, yy + 3]], rgbOf(AI_COLOR_WATER, 0.95), 1.4);
  }
  g.globalAlpha = 1;

  /* ── 3. 최종 렌즈면 · 배럴 ── */
  const lensPts: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i++) {
    const u = AXIS_X - AI_BARREL_HALF + (i / 60) * 2 * AI_BARREL_HALF;
    lensPts.push([X(u), V(lensY(u))]);
  }
  g.fillStyle = rgbOf(AI_COLOR_LENS, 0.55);
  g.beginPath();
  g.moveTo(X(AXIS_X - AI_BARREL_HALF), V(AI_LENS_TOP));
  for (const q of lensPts) g.lineTo(q[0], q[1]);
  g.lineTo(X(AXIS_X + AI_BARREL_HALF), V(AI_LENS_TOP));
  g.closePath();
  g.fill();
  line(g, lensPts, withAlpha(c.fg, 0.9), 1.8);
  g.fillStyle = rgbOf(AI_COLOR_BARREL);
  g.fillRect(X(AXIS_X - AI_BARREL_HALF), V(AI_LENS_TOP + 0.06), 2 * AI_BARREL_HALF * w, 0.06 * h);

  /* ── 4. 웨이퍼 기판 ── */
  g.fillStyle = rgbOf(AI_COLOR_SUBSTRATE);
  g.fillRect(0, V(AI_SUBSTRATE_TOP), w, h - V(AI_SUBSTRATE_TOP));

  /* ── 5. 레지스트 라인 3개(사다리꼴 + 정재파 줄무늬) ──
     🔴 줄무늬 간격 `SW_SPACING_V` 는 **상수**다 — `resistThickness` 가 바뀌어도 변하지 않고
        개수만 는다(SD R5). 대비만 `fringeAmp`(BARC 계수)가 조절한다. */
  if (m.resistHeight > 1e-4) {
    const rRows = Math.max(12, Math.round(m.resistHeight * h));
    const rStep = m.resistHeight / rRows;
    const inset = m.resistHeight / Math.max(Math.tan(m.sidewallRad), 1e-3);
    const blur = AI_EDGE_BLUR_MAX * m.defocusMag;
    for (let i = 0; i < rRows; i++) {
      const v = AI_SUBSTRATE_TOP + i * rStep;
      const t = i / rRows;
      // 상단 모서리 라운딩 — 모델의 `cornerRoundFrac`(= 1 − SWA/88)을 위쪽으로 갈수록 강하게 준다.
      const hw = Math.max(0, m.lineHalf - inset * t - m.lineHalf * m.cornerRoundFrac * t * t);
      if (hw <= 0) continue;
      const ph = ((v - AI_SUBSTRATE_TOP) / AI_SW_SPACING_V) % 1;
      const gain = 1 + AI_SW_CONTRAST_BASE * m.fringeAmp * Math.cos(ph * Math.PI * 2) * 0.5;
      const y = V(v + rStep);
      const rowH = Math.max(1, V(v) - y + 1);
      for (let k = 0; k < AI_LINE_COUNT; k++) {
        const cx = X(AXIS_X + (k - (AI_LINE_COUNT - 1) * 0.5) * AI_PITCH_UV);
        if (blur > 0) {
          // 디포커스 흐림(보조 연출) — 초점이 어긋날수록 가장자리가 번진다.
          g.fillStyle = rgbOf(AI_COLOR_RESIST, 0.35, gain);
          g.fillRect(cx - (hw + blur) * w, y, 2 * (hw + blur) * w, rowH);
        }
        g.fillStyle = rgbOf(AI_COLOR_RESIST, 1, gain);
        g.fillRect(cx - hw * w, y, 2 * hw * w, rowH);
      }
    }
  }

  /* ── 6. 초점 허용 띠 + 초점면 선 — 🔴 NA 를 올리면 반각은 1차로 벌어지고 띠는 **제곱으로 얇아진다** ── */
  const bandTop = V(m.focusPlaneY + m.focusBandHalf);
  const bandBot = V(m.focusPlaneY - m.focusBandHalf);
  g.fillStyle = withAlpha(c.spec, 0.16);
  g.fillRect(0, bandTop, w, Math.max(1, bandBot - bandTop));
  const bandCss = withAlpha(c.spec, 0.85);
  line(g, [[0, bandTop], [w, bandTop]], bandCss, 1.2);
  line(g, [[0, bandBot], [w, bandBot]], bandCss, 1.2);
  line(g, [[0, V(m.focusPlaneY)], [w, V(m.focusPlaneY)]], withAlpha(c.fg, 0.8), 1.4, [6, 5]);

  /* ── 7. 슬릿 스캔 화살표(좌향 1개) — 도즈↑ → 길이↓(SD §3-3 P-4, 길이 × E = 3.00) ── */
  const sy = V(AI_SCAN_ARROW_Y);
  const sxEnd = X(AXIS_X - m.scanLength);
  g.fillStyle = withAlpha(c.fg, 0.75);
  g.fillRect(sxEnd, sy - AI_SCAN_BAR * h, axis - sxEnd, 2 * AI_SCAN_BAR * h);
  const tip = Math.max(6, 0.020 * h);
  line(g, [[sxEnd + tip, sy - tip * 0.7], [sxEnd, sy], [sxEnd + tip, sy + tip * 0.7]], withAlpha(c.fg, 0.9), 2);

  /* ── 8. 퓨필 정면 인셋 — 바깥 원이 NA 상한, 채워진 원이 현재 NA ── */
  const pcx = X(AI_PUPIL_CX);
  const pcy = V(AI_PUPIL_CY);
  const pr = AI_PUPIL_R * h;
  g.save();
  g.strokeStyle = withAlpha(c.fg, 0.7);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(pcx, pcy, pr, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  g.fillStyle = withAlpha(c.series[0] ?? c.fg, 0.65);
  g.beginPath();
  g.arc(pcx, pcy, pr * Math.min(1, m.naValue / AI_NA_SCENE_MAX), 0, Math.PI * 2);
  g.fill();
  line(g, [[pcx - pr, pcy], [pcx + pr, pcy]], c.dim, 1);
}

/**
 * EDS 프로브 접촉·스크럽 — 패드 상면도(마크 vs 개구부) + OD 축 + 힘 축.
 *
 * 🔴 배치·변환·판정은 전부 `models/probeScrub.model` 이 정본이다. 여기서 다시 계산하지 않는다.
 * 🔴 **글자를 그리지 않는다**(`fillText` 금지 — GL 경로에 텍스트 래스터라이저가 없어 두 경로가 갈린다).
 * 🔴 **배경을 칠하지 않는다**(전면 `fillRect` 금지 — 라이트 테마가 안 바뀐다).
 * 🔴 **웨이퍼 맵·수율·결함은 이 씬 소관이 아니다**(별도 씬 `waferMap`).
 * 🔴 `x > 0.44` 는 **비워 둔다** — 명세에 그 영역의 요소가 없다. 지어내서 채우지 않는다.
 */
function drawProbeScrub(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = probeScrubModel(p);

  /* UV → 캔버스 픽셀. 세로 뒤집기는 fallback2d 의 toY() 한 곳뿐이다. */
  const X = (uv: number): number => uv * w;
  const Y = (uv: number): number => toY(uv, h);
  /** 🔴 NaN 하나면 Canvas2D path 가 통째로 사라진다(A14). 못 그리는 요소는 **그리지 않는다**. */
  const ok = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));

  const DATA = c.series[0] ?? c.fg;
  const WINDOW = c.series[1] ?? c.fg;

  /** 축정렬 사각형 테두리. */
  const rectStroke = (cx: number, cy: number, hx: number, hy: number, color: string, width: number, dash?: number[]): void => {
    if (!ok(cx, cy, hx, hy) || hx <= 0 || hy <= 0) return;
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    line(g, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], color, width, dash);
  };

  /**
   * 45° 빗금(수직 간격 `PS_HATCH_STEP_PX`)을 사각형 안에만 친다.
   * 🔴 GL 은 `(x+y)/√2` 의 등고선을 쓴다. 캔버스는 세로가 뒤집혀 있으므로 `x − y` 를 쓴다 —
   *    그래야 **화면에서 같은 방향**으로 기운다.
   */
  const hatchRect = (x0: number, y0: number, x1: number, y1: number, color: string, width: number): void => {
    if (!ok(x0, y0, x1, y1) || x1 <= x0 || y1 <= y0) return;
    const step = PS_HATCH_STEP_PX * Math.SQRT2;
    if (!(step > 0)) return;
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    const kMin = x0 - y1;
    const kMax = x1 - y0;
    // 전역 격자에 정렬한다 — 구역이 나뉘어도 빗금이 이어져 보인다.
    let k = Math.ceil(kMin / step) * step;
    for (; k <= kMax; k += step) {
      line(g, [[k + y0, y0], [k + y1, y1]], color, width);
    }
    g.restore();
  };

  /** 판정 ● — 합격. */
  const verdictPass = (cx: number, cy: number): void => {
    if (!ok(cx, cy)) return;
    g.save();
    g.beginPath();
    g.arc(cx, cy, PS_VERDICT_R_PX, 0, Math.PI * 2);
    g.fillStyle = c.fg;
    g.fill();
    g.restore();
  };

  /** 판정 ▲ — 불합격. 정삼각형(꼭짓점 위). 🔴 얇은 획이 아니라 **채운 도형**이다. */
  const verdictFail = (cx: number, cy: number): void => {
    if (!ok(cx, cy)) return;
    const r = PS_VERDICT_R_PX;
    const half = r * Math.sqrt(0.75); // = r·√3/2
    g.save();
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx - half, cy + r * 0.5);
    g.lineTo(cx + half, cy + r * 0.5);
    g.closePath();
    g.fillStyle = c.spec;
    g.fill();
    g.restore();
  };

  /* ── OD 축 밴드 기하 ── */
  const odY = Y(PS_OD_AXIS_Y);
  const bandHy = PS_BAND_HALF * h;
  const odTop = odY - bandHy;
  const odBot = odY + bandHy;

  /* ── ① 🔴 접촉력 클램프 구간 45° 빗금 (OD 20–25 · 76–150) ──
     `contactForceG` 가 이 두 구간에서 완전히 평평한 것은 **배선 누락이 아니라 의도된 클램프**다
     (`eds.ts:293` 「실무창 밖은 문헌 계수의 유효범위 밖이므로 경계로 클램프한다」).
     🔴 **이 빗금을 지우지 마라** — 없으면 다음 검수자가 「7.5 g 에 얼어 있다」를 결함으로 오진한다. */
  hatchRect(X(PS_CLAMP_LO_X0), odTop, X(PS_CLAMP_LO_X1), odBot, c.info, VIZ2D_INFO_WIDTH);
  hatchRect(X(PS_CLAMP_HI_X0), odTop, X(PS_CLAMP_HI_X1), odBot, c.info, VIZ2D_INFO_WIDTH);

  /* ── ② OD 실무창 25–76 µm — 15 % 채움 + 실선 테두리 ── */
  const winX0 = X(PS_OD_WIN_X0);
  const winX1 = X(PS_OD_WIN_X1);
  if (ok(winX0, winX1, odTop, odBot) && winX1 > winX0) {
    g.save();
    g.globalAlpha = PS_OD_WIN_FILL; // 🔴 색 문자열을 파싱하지 않는다 — 형식이 hex/rgb() 로 갈린다
    g.fillStyle = WINDOW;
    g.fillRect(winX0, odTop, winX1 - winX0, odBot - odTop);
    g.restore();
    line(g, [[winX0, odTop], [winX1, odTop], [winX1, odBot], [winX0, odBot], [winX0, odTop]], WINDOW, VIZ2D_DATA_WIDTH);
  }

  /* ── ③ 두 축의 기준선(참고선 — 판정이 아니다) ── */
  const fY = Y(PS_FORCE_AXIS_Y);
  line(g, [[X(PS_OD_AXIS_X0), odY], [X(PS_OD_AXIS_X1), odY]], c.info, VIZ2D_INFO_WIDTH, [...VIZ2D_INFO_DASH]);
  line(g, [[X(PS_FORCE_AXIS_X0), fY], [X(PS_FORCE_AXIS_X1), fY]], c.info, VIZ2D_INFO_WIDTH, [...VIZ2D_INFO_DASH]);

  /* ── ④ 재질별 접촉력 상한 눈금(세로 짧은 선) — W·W-Re 1.0 ⇒ x 0.4200 · BeCu 0.64 ⇒ 0.2904 ── */
  const ceilX = X(m.forceCeilX);
  if (ok(ceilX)) {
    line(g, [[ceilX, fY - bandHy], [ceilX, fY + bandHy]], c.info, VIZ2D_INFO_WIDTH, [...VIZ2D_INFO_DASH]);
  }

  /* ── ⑤ 힘 막대 — 길이만이 신호다.
     🔴 니들의 휨·변형은 그리지 않는다(캔틸레버 강성이 문헌에도 코드에도 없다 — DSN §E-6). */
  const barX0 = X(PS_FORCE_AXIS_X0);
  const barX1 = X(m.forceBarX1);
  if (ok(barX0, barX1) && barX1 - barX0 >= PS_MIN_DIM_PX) {
    line(g, [[barX0, fY], [barX1, fY]], DATA, VIZ2D_DATA_WIDTH);
  }

  /* ── ⑥ OD 마커(세로선) + 실무창 여유 치수선 ──
     🔴 OD 는 **1차원 축 위 위치**로만 그린다. 접촉 단면의 관통 깊이는 수치가 없다(DSN §E-6). */
  const odX = X(m.odMarkerX);
  if (ok(odX)) line(g, [[odX, odTop], [odX, odBot]], DATA, VIZ2D_DATA_WIDTH);

  const odMY = Y(PS_OD_MARGIN_Y);
  const odDimX0 = X(m.odDimX0);
  const odDimX1 = X(m.odDimX1);
  // margin 0(OD 25 또는 76) ⇒ 치수선 없음. 길이 0 선은 round cap 때문에 **점으로 남는다**.
  if (ok(odDimX0, odDimX1, odMY) && odDimX1 - odDimX0 >= PS_MIN_DIM_PX) {
    line(g, [[odDimX0, odMY], [odDimX1, odMY]], DATA, VIZ2D_DATA_WIDTH);
  }

  /* ── ⑦ 패드 상면도 — 개구부(규격 · 고정) · 스크럽 마크(데이터 · 가변) ──
     🔴 마크는 **축정렬 정사각형** 그대로다. 코드가 정사각형 근사를 쓰고 방향이 없으므로
        긁힘 무늬·방향성·밀려난 금속 둔덕(pile-up)을 지어내지 않는다(DSN §E-6). */
  const padCx = X(PS_PAD_CX);
  const padCy = Y(PS_PAD_CY);
  const openHx = m.openHalf * w;
  const openHy = m.openHalf * h;
  const markHx = m.markHalf * w;
  const markHy = m.markHalf * h;

  // 마크 사각형(데이터)
  rectStroke(padCx, padCy, markHx, markHy, DATA, VIZ2D_DATA_WIDTH);

  // 방향 정보가 없으므로 긁힘 궤적 대신 동심원 펌스로 접촉 시퀀스만 표시한다.
  const pulseR = (0.018 + 0.010 * (0.5 + 0.5 * Math.sin(t * 5.2))) * h;
  g.save();
  g.strokeStyle = withAlpha(c.info, 0.72);
  g.lineWidth = VIZ2D_INFO_WIDTH;
  g.beginPath();
  g.arc(padCx, padCy, pulseR, 0, Math.PI * 2);
  g.stroke();
  g.restore();

  // 실패 형상 — 개구부 **밖으로 나간 띠 부분만** 규격색 빗금(마크 ∖ 개구부)
  if (m.clearFail && ok(padCx, padCy, markHx, markHy, openHx, openHy)) {
    g.save();
    g.beginPath();
    g.rect(padCx - markHx, padCy - markHy, markHx * 2, markHy * 2);
    g.rect(padCx - openHx, padCy - openHy, openHx * 2, openHy * 2);
    g.clip('evenodd'); // 바깥 사각형 ∖ 안쪽 사각형
    hatchRect(padCx - markHx, padCy - markHy, padCx + markHx, padCy + markHy, c.spec, VIZ2D_SPEC_WIDTH);
    g.restore();
  }

  // 패시베이션 개구부(규격선 · 60 µm ⇒ 변 0.240 고정)
  rectStroke(padCx, padCy, openHx, openHy, c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);

  // 개구부 여유 치수선 — 개구부 모서리 ↔ 마크 모서리. clearanceUm = 0 이면 **그리지 않는다**.
  const clrX0 = X(m.clearDimX0);
  const clrX1 = X(m.clearDimX1);
  if (ok(clrX0, clrX1, padCy) && clrX1 - clrX0 >= PS_MIN_DIM_PX) {
    line(g, [[clrX0, padCy], [clrX1, padCy]], DATA, VIZ2D_DATA_WIDTH);
  }

  /* ── ⑧ 판정 도형 — 합격 ● / 불합격 ▲.
     🔴 색에만 기대지 않는다(흑백 인쇄·색각이상에서 정보가 사라지면 안 된다).
     🔴 **글자가 아니라 도형**이다 — arc · 3점 폴리곤. */
  if (m.clearFail) verdictFail(clrX1, padCy);
  else verdictPass(clrX1, padCy);

  if (m.odFail) verdictFail(odX, odY);
  else verdictPass(odX, odY);

  /* 🔴 x > 0.44 는 비워 둔다. 명세에 그 영역의 요소가 없다(우 패널은 별도 씬 waferMap 으로 분리됐다).
     ⛔ 웨이퍼 맵 · 에지 링 · 수율 격자 · DL 게이지를 여기 그리지 않는다. */
}

/**
 * EDS 웨이퍼 맵 — 다이 격자의 불량 칸 분포 + DL 로그 게이지.
 *
 * 🔴 격자 칸 수 · 불량 판정(고정 해시) · 게이지 높이 · 합격선 y 는 전부
 *    `models/waferMap.model` 이 정본이다. 여기서 다시 적지 않는다.
 * 🔴 웨이퍼는 **픽셀 공간에서 정원(正圓)**이다 — UV 가로 반지름이 `R_Y × (h/w)` 이므로
 *    픽셀로 환산하면 가로·세로 모두 `R_Y × h` 가 된다(그래서 아래에 `rPx` 하나뿐이다).
 * 🔴 **에지 링·중심 클러스터를 그리지 않는다.** 반경 가중 없이 고정 해시로 균일 산포다
 *    (모델이 D₀ 를 공간 균일로 못박았다 — PLN 정정 2026-08-20).
 */
function drawWaferMap(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = waferMapModel(p);

  const ok = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));
  if (!ok(w, h) || w <= 0 || h <= 0) return;

  const good = c.series[0] ?? c.fg;
  const passCol = c.series[1] ?? c.fg;

  /* ── ① 웨이퍼 격자 ─────────────────────────────────────────── */
  const cx = WM_WAFER_CX * w;
  const cy = toY(WM_WAFER_CY, h);
  const rPx = WM_WAFER_R_Y * h;          // 가로·세로 같다(위 주석 참조)
  const n = m.across;
  const cell = (2 * rPx) / n;

  if (ok(cx, cy, rPx, cell) && n > 0) {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!wmCellInDisk(col, row, n)) continue;
        const x = cx - rPx + col * cell;
        // row 는 UV(위가 +) 기준이라 캔버스에서는 아래에서 위로 쌓인다.
        const y = cy + rPx - (row + 1) * cell;
        if (!ok(x, y)) continue;
        const defect = wmIsDefect(col, row, m.rawYield);
        g.save();
        g.globalAlpha = defect ? WM_DIE_DIM_ALPHA : 1;
        g.fillStyle = defect ? c.info : good;
        g.fillRect(x, y, cell, cell);
        g.restore();
      }
    }
  }

  // 결함 맵은 고정하고, 현재 검사 행만 웨이퍼 안에서 이동시킨다.
  const scanY = cy + rPx - ((t * 0.10) % 1) * 2 * rPx;
  const dy = (scanY - cy) / Math.max(rPx, 1);
  const scanHalf = Math.sqrt(Math.max(0, 1 - dy * dy)) * rPx;
  line(g, [[cx - scanHalf, scanY], [cx + scanHalf, scanY]], passCol, VIZ2D_INFO_WIDTH);

  /* ── ② DL 게이지 기둥 ──────────────────────────────────────── */
  const gx0 = WM_GAUGE_X0 * w;
  const gx1 = WM_GAUGE_X1 * w;
  const gy0 = toY(WM_GAUGE_Y0, h);
  const gyTop = toY(m.gaugeTop, h);
  if (ok(gx0, gx1, gy0, gyTop)) {
    g.fillStyle = c.fg;
    g.fillRect(gx0, gyTop, gx1 - gx0, gy0 - gyTop);
  }

  /* ── ③ decade 눈금(참고선) ─────────────────────────────────── */
  for (const uy of WM_DL_DECADE_Y) {
    const y = toY(uy, h);
    if (!ok(y)) continue;
    line(g, [[gx0, y], [gx1, y]], c.info, VIZ2D_INFO_WIDTH, [...VIZ2D_INFO_DASH]);
  }

  /* ── ④ 합격 상한선(규격선, 1,500 ppm) ───────────────────────── */
  const passY = toY(WM_DL_PASS_Y, h);
  if (ok(passY)) {
    line(g, [[gx0, passY], [gx1, passY]], c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);
  }

  /* ── ⑤ 판정 배지 — 기둥 꼭대기에 올라탄다 ────────────────────── */
  const bx = WM_BADGE_CX * w;
  const br = WM_BADGE_R * h;             // 배지도 픽셀 공간에서 정원이므로 h 기준이다
  if (ok(bx, br, gyTop) && br > 0) {
    g.fillStyle = m.pass ? passCol : c.spec;
    g.beginPath();
    if (m.pass) {
      g.arc(bx, gyTop, br, 0, Math.PI * 2);           // ● 합격
    } else {
      g.moveTo(bx, gyTop - br);                        // ▲ 불합격
      g.lineTo(bx + br, gyTop + br);
      g.lineTo(bx - br, gyTop + br);
      g.closePath();
    }
    g.fill();
  }
}

/**
 * 패키지 열경로 단면 ＋ ΔT 온도 기둥 ＋ θ→권장전력 계단 — 패키징 공정 기초 칸(lab-basic) 전용.
 *
 * 🔴 배치 상수·계단표·판정은 전부 `models/packageThermal.model` 이 정본이다. 여기서 다시 적지 않는다.
 * 🔴 **글자를 그리지 않는다**(`fillText` 없음). 합격 ●(채운 원) · 불합격 ▲(삼각형) — 도형이다.
 * 🔴 **배경을 칠하지 않는다**(전면 `fillRect` 없음 · `c.bg` 미사용). 라이트 테마가 그대로 비친다.
 * 🔴 `Math.exp/log/log10/log2/pow` 를 부르지 않는다 — 그리기에는 필요 없다.
 */
function drawPackageThermal(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = packageThermalModel(p);   // 🔴 첫 줄에서 모델 호출(check-fallback-purity R1)

  /* NaN 좌표 방어(A14) — 모델의 pick() 이 이미 비유한값을 기본값으로 되돌리지만,
     캔버스 크기가 0/NaN 으로 들어오는 경로가 남아 있어 마지막 관문을 여기 둔다. */
  const fin = (v: number, alt: number): number => (Number.isFinite(v) ? v : alt);
  const W = fin(w, 0);
  const H = fin(h, 0);
  if (W <= 0 || H <= 0) return;

  const X = (uvX: number): number => fin(uvX, 0) * W;
  const Y = (uvY: number): number => toY(fin(uvY, 0), H);
  /** UV 세로 단위 반지름 → px. 캔버스가 옆으로 길어도 원이 타원이 되지 않는다. */
  const R = (r: number): number => Math.max(0, fin(r, 0) * H);

  const ink = c.fg;
  const colCol = c.series[0] ?? c.fg;   // ΔT 기둥
  const powCol = c.series[1] ?? c.fg;   // 전력 계단 계열(계단선 · 시험전력 파선 · 현재 위치 마커)

  const hLine = (uvY: number, x0: number, x1: number, color: string, width: number, dash: number[]): void => {
    const y = Y(uvY);
    line(g, [[X(x0), y], [X(x1), y]], color, width, dash);
  };
  const disc = (uvX: number, uvY: number, r: number, color: string): void => {
    g.save();
    g.beginPath();
    g.arc(X(uvX), Y(uvY), R(r), 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.restore();
  };
  const ring = (uvX: number, uvY: number, r: number, color: string, width: number): void => {
    g.save();
    g.beginPath();
    g.arc(X(uvX), Y(uvY), R(r), 0, Math.PI * 2);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
    g.restore();
  };
  const rectFill = (x0: number, x1: number, y0: number, y1: number, color: string, alpha: number): void => {
    const px = X(x0);
    const py = Y(y1);
    const pw = X(x1) - px;
    const ph = Y(y0) - py;
    if (!(pw > 0) || !(ph > 0)) return;   // 폭·높이 0 이면 그리지 않는다(기둥 높이 0 포함)
    g.save();
    g.globalAlpha = Math.min(1, Math.max(0, fin(alpha, 1)));
    g.fillStyle = color;
    g.fillRect(px, py, pw, ph);
    g.restore();
  };
  const rectEdge = (x0: number, x1: number, y0: number, y1: number, color: string, width: number): void => {
    line(g, [
      [X(x0), Y(y0)], [X(x1), Y(y0)], [X(x1), Y(y1)], [X(x0), Y(y1)], [X(x0), Y(y0)],
    ], color, width);
  };

  /* ── ① 열경로 단면 — 기판 · 패키지 몸체 · 다이 ────────────────────────── */
  rectFill(PT_SECTION_X0, PT_SECTION_X1, PT_BOARD_BOT, PT_BOARD_TOP, c.info, PT_BOARD_FILL_A);
  rectFill(PT_PKG_X0, PT_PKG_X1, PT_BOARD_TOP, PT_PKG_TOP, c.info, PT_PKG_FILL_A);
  rectEdge(PT_PKG_X0, PT_PKG_X1, PT_BOARD_TOP, PT_PKG_TOP, ink, VIZ2D_INFO_WIDTH);

  /* 다이 채움색 `c.dim` → `c.spec` 선형 보간, t = rise. **보조 채널**이다 — 1차 판독은 기둥 높이.
     🔴 `mixHex` 는 `#rrggbb` 전용인데 `c.dim` 은 `rgba(...)` 라 쓸 수 없다. 저온색을 깔고
        고온색을 알파 t 로 덮어 같은 보간을 만든다. */
  rectFill(PT_DIE_X0, PT_DIE_X1, PT_DIE_Y0, PT_DIE_Y1, c.dim, 1);
  rectFill(PT_DIE_X0, PT_DIE_X1, PT_DIE_Y0, PT_DIE_Y1, c.spec, m.dieHeat);
  rectEdge(PT_DIE_X0, PT_DIE_X1, PT_DIE_Y0, PT_DIE_Y1, ink, VIZ2D_INFO_WIDTH);

  /* ── ①-b 열류 — **정상상태에서도 열은 흐른다.** 통과율이 P_H 다(모델 §③).
     ⛔ ΔT 의 과도곡선이 아니다 — τ·C_th 가 물리층에 없어 그리지 않는다.
     🔴 위상·진폭은 `ptFluxPhase`·`ptFluxAmplitude` 가 정본이다. GL 셰이더와 **같은 식**이라
        두 경로가 같은 자리에 같은 진하기로 그린다. 여기서 다시 계산하지 않는다. */
  for (let k = 0; k < PT_FLUX_MARKS; k++) {
    const ph = ptFluxPhase(k, t, m.fluxLapsPerSecond);
    const a = ptFluxAmplitude(ph);
    if (!(a > 0)) continue;
    const yUp = PT_FLUX_UP_Y0 + (PT_FLUX_UP_Y1 - PT_FLUX_UP_Y0) * ph;
    const yDn = PT_FLUX_DN_Y0 + (PT_FLUX_DN_Y1 - PT_FLUX_DN_Y0) * ph;
    rectFill(PT_FLUX_X - PT_FLUX_HALF_W, PT_FLUX_X + PT_FLUX_HALF_W, yUp - PT_FLUX_HALF_H, yUp + PT_FLUX_HALF_H, powCol, a);
    rectFill(PT_FLUX_X - PT_FLUX_HALF_W, PT_FLUX_X + PT_FLUX_HALF_W, yDn - PT_FLUX_HALF_H, yDn + PT_FLUX_HALF_H, powCol, a);
  }

  /* ── ② 온도축 + ΔT 기둥 — 이 씬의 1차 판독 채널 ──────────────────────── */
  line(g, [[X(PT_TAXIS_X), Y(PT_TAXIS_Y0)], [X(PT_TAXIS_X), Y(PT_TAXIS_Y1)]], ink, VIZ2D_INFO_WIDTH);
  rectFill(PT_TCOL_X0, PT_TCOL_X1, PT_TAXIS_Y0, m.colTop, colCol, 1);

  /* ── ③ 합격창(20 · 60 °C) · 참고선(30 °C) ───────────────────────────────
     🔴 합격창은 축(0.20~0.92)의 13.3 % 다. **축을 자르지 않는다** — 기본 조건 300 °C 가 축 꼭대기이고
        「기본 조건이 합격창의 6 배 위에 있다」가 이 칸의 교육 내용이다. 대신 참고선을 온도축 오른쪽으로
        `PT_MINOR_TICK_W` 만큼 더 뻗어(=`PT_REF_X1`) 좁은 구간의 판독을 돕는다. */
  hLine(m.passLoY, PT_REF_X0, PT_REF_X1, c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);
  hLine(m.passHiY, PT_REF_X0, PT_REF_X1, c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);
  hLine(m.refY, PT_REF_X0, PT_REF_X1, c.info, VIZ2D_INFO_WIDTH, [...VIZ2D_INFO_DASH]);

  /* ── ④ 판정 — 글자가 아니라 도형. 합격 ●(채운 원) · 불합격 ▲(삼각형) ─── */
  if (m.risePass) {
    disc(PT_VERDICT_X, PT_VERDICT_Y, PT_VERDICT_R, ink);
  } else {
    const cx = X(PT_VERDICT_X);
    const cy = Y(PT_VERDICT_Y);
    const r = R(PT_VERDICT_R);
    const k = Math.sqrt(3) * 0.5;   // 정삼각형 반폭 비율. sqrt 는 기하이지 물리가 아니다
    g.save();
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + k * r, cy + r * 0.5);
    g.lineTo(cx - k * r, cy + r * 0.5);
    g.closePath();
    g.fillStyle = ink;
    g.fill();
    g.restore();
  }

  /* ── ⑤ θ → 권장전력 계단 ────────────────────────────────────────────────
     🔴 이산 5단 {0.5, 0.75, 1, 2, 3} W 다. **보간하면 표준을 왜곡한다.**
        5단을 항상 전부 그려 둬야 계단의 점프가 「얼어붙음(결함)」이 아니라 정보로 읽힌다.
        마지막 단(θ = 100 → 0.5 W)은 정의역 끝이라 가로 폭이 0 이고 채운 점으로만 남는다. */
  line(g, [[X(PT_PAXIS_X0), Y(PT_PAXIS_Y0)], [X(PT_PAXIS_X0), Y(PT_PAXIS_Y1)]], ink, VIZ2D_INFO_WIDTH);
  line(g, [[X(PT_PAXIS_X0), Y(PT_PAXIS_Y0)], [X(PT_PAXIS_X1), Y(PT_PAXIS_Y0)]], ink, VIZ2D_INFO_WIDTH);
  for (const s of PT_STEPS) {
    if (s.x1 > s.x0) line(g, [[X(s.x0), Y(s.y)], [X(s.x1), Y(s.y)]], powCol, VIZ2D_DATA_WIDTH);
  }
  for (const b of PT_BOUNDARIES) {
    // 라이저 — 어디서 전환이 일어나는지 미리 보여 준다
    line(g, [[X(b.x), Y(b.yOpen)], [X(b.x), Y(b.yClosed)]], powCol, VIZ2D_DATA_WIDTH);
  }
  /* 🔴 경계 귀속: 채운 점(●)은 값을 **갖는** 쪽(오른쪽·낮은 전력), 빈 점(○ = 테두리만)은 **안 갖는** 쪽.
        이게 없으면 학습자가 경계값(θ = 20·30·60·100)이 어느 단에 속하는지 못 읽는다. */
  disc(PT_DOMAIN_START_X, PT_DOMAIN_START_Y, PT_DOT_R, powCol);   // θ = 15 도 포함 경계다
  for (const b of PT_BOUNDARIES) disc(b.x, b.yClosed, PT_DOT_R, powCol);
  for (const b of PT_BOUNDARIES) ring(b.x, b.yOpen, PT_DOT_R, powCol, VIZ2D_DATA_WIDTH);

  /* ── ⑥ 시험전력 파선(연속) + 현재 θ 위치 마커 ───────────────────────── */
  hLine(m.testY, PT_PAXIS_X0, PT_PAXIS_X1, powCol, VIZ2D_DATA_WIDTH, [...VIZ2D_DATA_DASH]);
  disc(m.markerX, m.stepY, PT_MARKER_R, powCol);
  ring(m.markerX, m.stepY, PT_MARKER_R, ink, VIZ2D_DATA_WIDTH);
}

/**
 * MSL 플로어 라이프 · 표준 소킹 시간축(packaging / lab-applied).
 *
 * 공용 시간축(0 → 192 h) 위에 플로어 라이프 막대 · 표준 소킹 막대 · 노출 마커 ▮ ·
 * 여유 치수선을 얹는다. 🔴 **좌표·판정은 전부 `models/moistureSoak.model` 이 정본**이고
 * 여기서는 UV → 캔버스 변환과 칠하기만 한다.
 *
 * 🔴 **글자를 그리지 않는다**(fillText 금지). 판정은 도형이다 — ● 합격 · ▲ 불합격 · ▨ 미규정.
 * 🔴 **배경을 칠하지 않는다**(전면 fillRect 금지 · `c.bg` 사용 금지). 그린 자리에만 잉크가 남는다.
 * 🔴 **이산 4단 유령 눈금을 항상 그린다.** MSL 슬라이더는 4점뿐이라 막대 끝이 네 자리만 밟는데,
 *    다음 칸을 보여 주지 않으면 「값이 안 변한다」로 읽힌다. 보간해서 부드럽게 만들지 않는다 —
 *    **계단은 계단으로 그린다.**
 */
function drawMoistureSoak(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = moistureSoakModel(p);   // 🔴 파생값은 전부 모델이 만든다

  const X = (uv: number): number => uv * w;
  const Y = (uv: number): number => toY(uv, h);
  /** 🔴 A14 — NaN·∞ 좌표를 Canvas2D 에 넣으면 path 가 통째로 사라진다. 넣기 전에 막는다. */
  const ok = (...vs: number[]): boolean => vs.every((v) => Number.isFinite(v));

  const ink = c.fg;
  const barFloorCol = c.series[0] ?? c.fg;
  const barSoakCol = c.series[1] ?? c.fg;

  const x0 = X(MS_TIME_X0);
  const x1 = X(MS_TIME_X1);
  const axisY = Y(MS_AXIS_Y);
  const marginY = Y(MS_ROW_MARGIN_Y);

  /* ── ① 공용 시간축과 눈금 ──
     🔴 눈금은 표준이 값을 준 시각(24·48·72·96·168·192 h)에만 선다 — 자리를 지어내지 않았다. */
  if (ok(x0, x1, axisY)) line(g, [[x0, axisY], [x1, axisY]], ink, VIZ2D_INFO_WIDTH);
  const tickTop = Y(MS_AXIS_Y + MS_AXIS_TICK_H);
  for (const ux of MS_AXIS_TICK_X) {
    const tx = X(ux);
    if (ok(tx, axisY, tickTop)) line(g, [[tx, axisY], [tx, tickTop]], ink, VIZ2D_INFO_WIDTH);
  }

  /* ── ② 유령 눈금 — 이산 4단 **전부**를 흐리게, 항상 ── */
  const ghostRow = (xs: readonly number[], uy0: number, uy1: number): void => {
    const yb = Y(uy0);
    const yt = Y(uy1);
    for (const ux of xs) {
      const gx = X(ux);
      if (ok(gx, yb, yt)) line(g, [[gx, yb], [gx, yt]], ink, VIZ2D_INFO_WIDTH);
    }
  };
  g.save();
  g.globalAlpha = MS_GHOST_ALPHA;
  ghostRow(m.floorGhostX, MS_ROW_FLOOR_Y0, MS_ROW_FLOOR_Y1);
  ghostRow(m.soakGhostX, MS_ROW_SOAK_Y0, MS_ROW_SOAK_Y1);
  g.restore();

  /* ── ③ 막대 두 개. 오른쪽 끝이 곧 값이다 ── */
  const bar = (xEndUv: number, uy0: number, uy1: number, color: string): void => {
    const top = Y(uy1);
    const bh = Y(uy0) - top;
    const bw = Math.max(0, X(xEndUv) - x0);
    if (!ok(x0, top, bw, bh)) return;
    g.fillStyle = color;
    g.fillRect(x0, top, bw, bh);   // 막대다 — 전면 칠이 아니다
  };
  bar(m.xFloorEnd, MS_ROW_FLOOR_Y0, MS_ROW_FLOOR_Y1, barFloorCol);
  bar(m.xSoakEnd, MS_ROW_SOAK_Y0, MS_ROW_SOAK_Y1, barSoakCol);

  /* ── ④ 현재 등급의 눈금만 실선·불투명(막대 끝 자리) ── */
  const solidTick = (xUv: number, uy0: number, uy1: number): void => {
    const sx = X(xUv);
    const yb = Y(uy0);
    const yt = Y(uy1);
    if (ok(sx, yb, yt)) line(g, [[sx, yb], [sx, yt]], ink, VIZ2D_DATA_WIDTH);
  };
  solidTick(m.xFloorEnd, MS_ROW_FLOOR_Y0, MS_ROW_FLOOR_Y1);
  solidTick(m.xSoakEnd, MS_ROW_SOAK_Y0, MS_ROW_SOAK_Y1);

  /* ── ⑤ 노출 마커 ▮ — 플로어 막대 위로 걸치는 굵은 짧은 세로 막대 ── */
  const markTop = Y(MS_ROW_FLOOR_Y1 + MS_MARK_OVERHANG);
  const markH = Y(MS_ROW_FLOOR_Y0 - MS_MARK_OVERHANG) - markTop;
  const markX = X(m.xExposure - MS_MARK_HALF_W);
  const markW = X(2 * MS_MARK_HALF_W);
  if (ok(markX, markTop, markW, markH)) {
    g.fillStyle = ink;
    g.fillRect(markX, markTop, markW, markH);
  }
  // 노출시간 값은 고정하고 현재 마커만 펄스로 강조한다.
  const expCx = X(m.xExposure);
  const expCy = Y((MS_ROW_FLOOR_Y0 + MS_ROW_FLOOR_Y1) / 2);
  const expR = (0.018 + 0.007 * (0.5 + 0.5 * Math.sin(t * 4.4))) * h;
  if (ok(expCx, expCy, expR)) {
    g.save();
    g.strokeStyle = withAlpha(c.info, 0.72);
    g.lineWidth = VIZ2D_INFO_WIDTH;
    g.beginPath();
    g.arc(expCx, expCy, expR, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  /* ── ⑥ 여유 치수선 ──
     🔴 **길이는 좌표에서**(|xOfHour(floorLife) − xOfHour(exposure)|), **부호는 margin 에서.**
     🔴 `m.defined` 가 false = 노출시간이 NaN·∞ → **치수선을 아예 그리지 않는다.**
        (라벨로 알릴 수 없다 — 씬은 글자를 안 그린다. 판정 자리에 미규정 ▨ 를 그린다.) */
  if (m.defined) {
    const dx0 = X(m.dimX0);
    const dx1 = X(m.dimX1);
    const extTop = Y(MS_ROW_MARGIN_Y + MS_DIM_EXT_HALF);
    const extBot = Y(MS_ROW_MARGIN_Y - MS_DIM_EXT_HALF);
    if (ok(dx0, dx1, marginY)) {
      line(g, [[dx0, marginY], [dx1, marginY]], c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);
    }
    if (ok(dx0, extTop, extBot)) line(g, [[dx0, extBot], [dx0, extTop]], c.spec, VIZ2D_INFO_WIDTH);
    if (ok(dx1, extTop, extBot)) line(g, [[dx1, extBot], [dx1, extTop]], c.spec, VIZ2D_INFO_WIDTH);

    // 화살촉 — 방향(부호)은 margin 이 정한다
    const dir = m.dimTipRight ? 1 : -1;
    const tipX = X(m.dimTipX);
    const baseX = X(m.dimTipX - dir * MS_DIM_ARROW_LEN);
    const ah = MS_DIM_ARROW_HALF * h;
    if (ok(tipX, baseX, marginY, ah)) {
      g.save();
      g.beginPath();
      g.moveTo(tipX, marginY);
      g.lineTo(baseX, marginY - ah);
      g.lineTo(baseX, marginY + ah);
      g.closePath();
      g.fillStyle = c.spec;
      g.fill();
      g.restore();
    }
  }

  /* ── ⑦ 판정 형태 — 글자가 아니라 도형 ──
     ● 합격(여유 ≥ 0) · ▲ 불합격 · ▨ 미규정(45° 빗금) */
  const vx = X(MS_VERDICT_X);
  const vy = marginY;
  const vr = MS_VERDICT_R * h;
  if (ok(vx, vy, vr) && vr > 0) {
    if (m.verdict === 'pass') {
      g.save();
      g.beginPath();
      g.arc(vx, vy, vr, 0, Math.PI * 2);
      g.fillStyle = c.spec;
      g.fill();
      g.restore();
    } else if (m.verdict === 'fail') {
      g.save();
      g.beginPath();
      g.moveTo(vx, vy - vr);
      g.lineTo(vx - vr * 0.9, vy + vr * 0.6);
      g.lineTo(vx + vr * 0.9, vy + vr * 0.6);
      g.closePath();
      g.fillStyle = c.spec;
      g.fill();
      g.restore();
    } else {
      // ▨ 미규정 — 판정이 아니므로 참고선 색(c.info)을 쓴다
      g.save();
      g.beginPath();
      g.rect(vx - vr, vy - vr, vr * 2, vr * 2);
      g.strokeStyle = c.info;
      g.lineWidth = VIZ2D_INFO_WIDTH;
      g.stroke();
      g.clip();
      const gap = vr * 0.5;
      for (let d = -vr * 2; d <= vr * 2; d += gap) {
        line(g, [[vx - vr + d, vy + vr], [vx + vr + d, vy - vr]], c.info, VIZ2D_INFO_WIDTH);
      }
      g.restore();
    }
  }
}

/**
 * 씬 `shearTest` 의 Canvas2D 판 — 좌 = 다이 상면도 ＋ 요구력 막대 / 우 = 전단속도 로그축 3구간.
 *
 * 🔴 **계산은 한 줄도 하지 않는다.** 면적 → 한 변(√), 속도 → 로그 위치, 속도구분 이산화,
 *    합·부 판정은 전부 `shearTestModel()` 이 끝내서 준다. 여기는 그 UV 를 화면 px 로 옮길 뿐이다.
 *    (그래서 `Math.log10`·`Math.pow` 가 이 함수에 없다 — `check-fallback-purity` R2/R3.)
 * 🔴 **글자를 그리지 않는다.** 합격 `●` · 불합격 `▲` · 미규정 `▨`(45° 빗금)은 도형이다.
 * 🔴 **배경을 칠하지 않는다.** 전면 `fillRect` 도 `c.bg` 도 쓰지 않는다.
 * 🔴 a = 64 → 65 의 요구치 계단(2.56 → 2.50 kg)은 **실재하는 불연속**이다 — 평활하지 않는다.
 */
function drawShearTest(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = shearTestModel(p);

  /* UV → 화면 px. 세로 뒤집기는 `toY()` 한 곳에서만 한다. */
  const X = (uv: number): number => uv * w;
  const V = (uv: number): number => toY(uv, h);
  /* 🔴 A14 — NaN/∞ 좌표가 캔버스에 들어가면 그 뒤 경로가 통째로 사라진다. 그리기 직전에 막는다. */
  const ok = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));

  const sA = c.series[1] ?? c.fg;   // 저속 A(Condition A)
  const sB = c.series[0] ?? c.fg;   // 고속 B(Condition B)

  // 툴 형상·파단 경로를 추정하지 않고 다이 중앙 로딩 상태만 펄스로 보인다.
  const loadCx = X(ST_DIE_PANEL_CX);
  const loadCy = V(ST_DIE_PANEL_CY);
  const loadR = (0.020 + 0.009 * (0.5 + 0.5 * Math.sin(t * 4.8))) * h;
  if (ok(loadCx, loadCy, loadR)) {
    g.save();
    g.strokeStyle = withAlpha(c.info, 0.72);
    g.lineWidth = VIZ2D_INFO_WIDTH;
    g.beginPath();
    g.arc(loadCx, loadCy, loadR, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  /** UV 사각형을 옅게 채운다(강조·도달불가 표시). 전면 채움이 아니다. */
  const fillBox = (x0: number, x1: number, y0: number, y1: number, col: string): void => {
    const px = X(x0); const py = V(y1); const pw = X(x1) - px; const ph = V(y0) - py;
    if (!ok(px, py, pw, ph) || pw <= 0 || ph <= 0) return;
    g.save();
    g.globalAlpha = ST_FILL_ALPHA;
    g.fillStyle = col;
    g.fillRect(px, py, pw, ph);
    g.restore();
  };

  /** UV 사각형 테두리. `dash` 를 주면 규격선·데이터선 선종이 된다. */
  const strokeBox = (x0: number, x1: number, y0: number, y1: number, col: string, wid: number, dash?: number[]): void => {
    const a = X(x0); const b = X(x1); const t = V(y1); const u = V(y0);
    if (!ok(a, b, t, u)) return;
    line(g, [[a, t], [b, t], [b, u], [a, u], [a, t]], col, wid, dash);
  };

  const hLine = (y: number, x0: number, x1: number, col: string, wid: number, dash?: number[]): void => {
    const a = X(x0); const b = X(x1); const t = V(y);
    if (!ok(a, b, t)) return;
    line(g, [[a, t], [b, t]], col, wid, dash);
  };

  const vLine = (x: number, y0: number, y1: number, col: string, wid: number, dash?: number[]): void => {
    const a = X(x); const t = V(y1); const u = V(y0);
    if (!ok(a, t, u)) return;
    line(g, [[a, t], [a, u]], col, wid, dash);
  };

  /** 45° 해칭 — 간격·굵기는 px(명세 6 px). GL 셰이더의 `hatch45()` 와 같은 방향·간격이다. */
  const hatchArea = (px0: number, py0: number, px1: number, py1: number, col: string): void => {
    if (!ok(px0, py0, px1, py1) || px1 <= px0 || py1 <= py0) return;
    const step = ST_HATCH_PX * Math.SQRT2;
    if (!ok(step) || step <= 0) return;
    g.save();
    g.beginPath();
    g.rect(px0, py0, px1 - px0, py1 - py0);
    g.clip();
    const kEnd = px1 - py0;
    for (let k = Math.floor((px0 - py1) / step) * step; k <= kEnd; k += step) {
      line(g, [[k + py0, py0], [k + py1, py1]], col, ST_HATCH_W_PX);
    }
    g.restore();
  };

  /* ── 판정 형태 3종 — 좌표는 px, 반지름도 px ── */
  const R = ST_MARK_R * h;

  /** 합격 `●` — 채운 원. */
  const glyphDisc = (cx: number, cy: number, r: number, col: string): void => {
    if (!ok(cx, cy, r) || r <= 0) return;
    g.save();
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  /** 불포함 `○` — 테두리만 있는 원. */
  const glyphRing = (cx: number, cy: number, r: number, col: string): void => {
    if (!ok(cx, cy, r) || r <= 0) return;
    g.save();
    g.strokeStyle = col;
    g.lineWidth = VIZ2D_DATA_WIDTH;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  };

  /** 불합격 `▲` — 위로 향한 정삼각형. */
  const glyphTri = (cx: number, cy: number, r: number, col: string): void => {
    if (!ok(cx, cy, r) || r <= 0) return;
    g.save();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.8660254, cy + r * 0.5);
    g.lineTo(cx - r * 0.8660254, cy + r * 0.5);
    g.closePath();
    g.fill();
    g.restore();
  };

  /** 미규정 `▨` — 45° 빗금을 채운 사각형. */
  const glyphHatched = (cx: number, cy: number, r: number, col: string): void => {
    if (!ok(cx, cy, r) || r <= 0) return;
    hatchArea(cx - r, cy - r, cx + r, cy + r, col);
    line(g, [
      [cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r],
    ], col, VIZ2D_INFO_WIDTH);
  };

  /* ══════════ 좌 패널 — 다이 상면도 ══════════
     🔴 면적을 면적으로 그린다. 한 변은 모델이 √ 로 준다(a 1→100 ⇒ 0.0300→0.3000).
     🔴 a = 64 기준 사각형(한 변 0.2400)을 **항상** 규격 파선으로 겹쳐 그린다 —
        다이가 이 윤곽을 넘는 순간이 S43 NOTE 1 전이다. */
  const dieH = m.dieSide / 2;
  fillBox(ST_DIE_PANEL_CX - dieH, ST_DIE_PANEL_CX + dieH, ST_DIE_PANEL_CY - dieH, ST_DIE_PANEL_CY + dieH, c.fg);
  strokeBox(ST_DIE_PANEL_CX - dieH, ST_DIE_PANEL_CX + dieH, ST_DIE_PANEL_CY - dieH, ST_DIE_PANEL_CY + dieH, c.fg, VIZ2D_DATA_WIDTH);

  const kneeH = m.kneeSide / 2;
  strokeBox(
    ST_DIE_PANEL_CX - kneeH, ST_DIE_PANEL_CX + kneeH, ST_DIE_PANEL_CY - kneeH, ST_DIE_PANEL_CY + kneeH,
    c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH],
  );

  /* ══════════ 좌 패널 — 요구력 막대 ＋ 인가력 파선 ══════════ */
  fillBox(ST_FORCE_BAR_X0, ST_FORCE_BAR_X1, ST_FORCE_BAR_Y0, m.barTopY, c.spec);
  hLine(ST_FORCE_BAR_Y0, ST_FORCE_BAR_X0, ST_FORCE_BAR_X1, c.spec, VIZ2D_SPEC_WIDTH);
  hLine(m.barTopY, ST_FORCE_BAR_X0, ST_FORCE_BAR_X1, c.spec, VIZ2D_SPEC_WIDTH);
  vLine(ST_FORCE_BAR_X0, ST_FORCE_BAR_Y0, m.barTopY, c.spec, VIZ2D_INFO_WIDTH);
  vLine(ST_FORCE_BAR_X1, ST_FORCE_BAR_Y0, m.barTopY, c.spec, VIZ2D_INFO_WIDTH);

  /* 🔴 인가력이 NaN 이면(`dieShearMarginKg` 가 NaN 이 되는 경로) **여유를 그리지 않고** ▨ 를 낸다. */
  if (m.appliedKnown) {
    hLine(m.appliedY, ST_FORCE_BAR_X0, ST_FORCE_BAR_X1, c.fg, VIZ2D_DATA_WIDTH, [...VIZ2D_DATA_DASH]);
  }

  const vcx = X(ST_VERDICT_CX);
  const vcy = V(ST_VERDICT_CY);
  if (!m.appliedKnown) glyphHatched(vcx, vcy, R, c.info);
  else if (m.pass) glyphDisc(vcx, vcy, R, c.spec);
  else glyphTri(vcx, vcy, R, c.spec);

  /* ══════════ 우 패널 — 전단속도 로그축 4구간(미리 깔아 둔다) ══════════ */
  const bandTop = ST_SPEED_AXIS_Y + ST_BAND_H;

  /* 도달 불가(v < 0.1) — 🔴 축 **왼쪽 밖**. info 색 20 % 로만 둔다. 마커는 절대 들어가지 않는다. */
  fillBox(ST_BELOW_LOW_X0, ST_SPEED_AXIS_X0, ST_SPEED_AXIS_Y, bandTop, c.info);

  /* 저속 A — series[1] 실선 테두리. class 1 이면 채움으로 강조. */
  if (m.classIndex === 1) fillBox(m.bandLowX0, m.bandLowX1, ST_SPEED_AXIS_Y, bandTop, sA);
  strokeBox(m.bandLowX0, m.bandLowX1, ST_SPEED_AXIS_Y, bandTop, sA, VIZ2D_DATA_WIDTH);

  /* 표준 미규정 — 🔴 **언제나** 45° 빗금 ＋ 규격 파선 테두리. 축의 약 60 % 를 차지한다.
     🔴 어떤 관심사에서도 합격이 아니다. 빗금을 지우거나 순하게 만들지 마라. */
  if (m.classIndex === 2) fillBox(m.bandLowX1, m.bandMidX1, ST_SPEED_AXIS_Y, bandTop, c.spec);
  hatchArea(X(m.bandLowX1), V(bandTop), X(m.bandMidX1), V(ST_SPEED_AXIS_Y), c.spec);
  strokeBox(m.bandLowX1, m.bandMidX1, ST_SPEED_AXIS_Y, bandTop, c.spec, VIZ2D_SPEC_WIDTH, [...VIZ2D_SPEC_DASH]);

  /* 고속 B — series[0] 실선 테두리. class 3 이면 채움으로 강조. */
  if (m.classIndex === 3) fillBox(m.bandMidX1, m.bandHighX1, ST_SPEED_AXIS_Y, bandTop, sB);
  strokeBox(m.bandMidX1, m.bandHighX1, ST_SPEED_AXIS_Y, bandTop, sB, VIZ2D_DATA_WIDTH);

  /* 축선 */
  hLine(ST_SPEED_AXIS_Y, ST_BELOW_LOW_X0, ST_SPEED_AXIS_X1, c.fg, VIZ2D_INFO_WIDTH);

  /* 🔴 경계 귀속을 형태로 명시한다 — 닫힌 쪽 `●` · 열린 쪽 `○` 를 경계 양옆에 나란히 찍는다.
     v = 0.1 · 0.8 은 **저속 A 에 포함** · v = 50.0 은 **아직 미규정** · 50 을 **넘어야** 고속 B. */
  const MR = R * 0.7;
  const bandMidY = V((ST_SPEED_AXIS_Y + bandTop) / 2);
  glyphDisc(X(m.bandLowX0) + MR, bandMidY, MR, sA);
  glyphDisc(X(m.bandLowX1) - MR, bandMidY, MR, sA);
  glyphRing(X(m.bandLowX1) + MR, bandMidY, MR, c.spec);
  glyphDisc(X(m.bandMidX1) - MR, bandMidY, MR, c.spec);
  glyphRing(X(m.bandMidX1) + MR, bandMidY, MR, sB);

  /* 현재 속도 마커 — class 0(도달 불가)이면 모델이 축 왼쪽 끝으로 고정해 준다. */
  vLine(m.markerX, ST_SPEED_AXIS_Y, bandTop, c.fg, VIZ2D_DATA_WIDTH);

  /* 속도구분 배지 — 🔴 이산 4단이다. 보간하지 않는다.
     0 도달 불가 ⇒ ▨ info · 1 저속 A ⇒ ● series[1] · 2 미규정 ⇒ ▨ spec · 3 고속 B ⇒ ● series[0] */
  const bcx = X(m.markerX);
  const bcy = V(ST_BADGE_CY);
  if (m.classIndex === 1) glyphDisc(bcx, bcy, R, sA);
  else if (m.classIndex === 3) glyphDisc(bcx, bcy, R, sB);
  else if (m.classIndex === 2) glyphHatched(bcx, bcy, R, c.spec);
  else glyphHatched(bcx, bcy, R, c.info);
}

/** 성장 완료 잉곳 → 다중 와이어 웹 → 웨이퍼 배출. 형상값은 모델 정본만 읽는다. */
function drawIngotSlicing(g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number): void {
  const m = ingotSlicingModel(p);
  const y = toY(IS_AXIS_Y, h);
  const r = m.radius * h;
  const phase = (t * 0.24) % 1;
  const s1 = c.series[0] ?? c.fg;
  const s2 = c.series[1] ?? c.info;

  g.save();
  g.fillStyle = withAlpha(s1, 0.30);
  g.fillRect(IS_INGOT_X0 * w, y - r, (IS_INGOT_X1 - IS_INGOT_X0) * w, r * 2);
  line(g, [[IS_INGOT_X0 * w, y - r], [IS_INGOT_X1 * w, y - r]], c.fg, 2);
  line(g, [[IS_INGOT_X0 * w, y + r], [IS_INGOT_X1 * w, y + r]], c.fg, 2);
  g.strokeStyle = c.info; g.lineWidth = 2; g.beginPath();
  g.ellipse(IS_INGOT_X0 * w, y, 0.030 * w, r, 0, 0, Math.PI * 2); g.stroke();

  for (let k = 0; k < IS_WIRE_COUNT; k += 1) {
    const wx = (IS_WIRE_X0 + (IS_WIRE_X1 - IS_WIRE_X0) * k / (IS_WIRE_COUNT - 1)) * w;
    line(g, [[wx, 0.14 * h], [wx, 0.88 * h]], s2, 1.5);
    const markerY = (0.14 + ((phase + k / IS_WIRE_COUNT) % 1) * 0.74) * h;
    g.fillStyle = s2; g.fillRect(wx - 2, markerY - 4, 4, 8);
  }
  line(g, [[IS_WIRE_X0 * w, 0.14 * h], [IS_WIRE_X1 * w, 0.14 * h]], c.fg, 2);
  line(g, [[IS_WIRE_X0 * w, 0.88 * h], [IS_WIRE_X1 * w, 0.88 * h]], c.fg, 2);

  for (let k = 0; k < IS_OUTPUT_COUNT; k += 1) {
    const fk = k / (IS_OUTPUT_COUNT - 1);
    const x = (IS_OUTPUT_X0 + (IS_OUTPUT_X1 - IS_OUTPUT_X0) * fk) * w;
    const yy = y + ((((phase + fk) % 1) - 0.5) * 0.07 * h);
    g.strokeStyle = fk <= m.goodFraction ? s1 : c.info;
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, yy, 0.016 * w, r * 0.92, 0, 0, Math.PI * 2); g.stroke();
  }
  line(g, [[(IS_OUTPUT_X0 - 0.04) * w, y + r + 0.055 * h], [(IS_OUTPUT_X1 + 0.02) * w, y + r + 0.055 * h]], c.fg, 2);
  g.restore();
}

/**
 * 🔴 drawer 는 **6번째 인자로 시각 `t`[s] 를 받는다.** 쓰는 것은 지금 `drawPackageThermal` 하나뿐이고
 *    (열류 통과율 ∝ P_H), 나머지는 인자를 선언하지 않아 그대로 무시한다 — TS 는 인자가 적은 함수를
 *    이 형에 대입할 수 있다. `t` 를 실제로 소비하는 씬 목록은 아래 `FALLBACK_ANIMATED` 가 정본이다.
 */
const DRAWERS: Record<FallbackSceneId, (g: CanvasRenderingContext2D, w: number, h: number, p: SceneParams, c: Palette, t: number) => void> = {
  filmGrowth: drawFilmGrowth,
  plasma: drawPlasma,
  ionTrajectory: drawIonTrajectory,
  polishProfile: drawPolishProfile,
  stepCoverage: drawStepCoverage,
  aldCycle: drawAldCycle,
  crystalGrowth: drawCrystalGrowth,
  ingotSlicing: drawIngotSlicing,
  aerialImage: drawAerialImage,
  probeScrub: drawProbeScrub,
  waferMap: drawWaferMap,
  packageThermal: drawPackageThermal,
  moistureSoak: drawMoistureSoak,
  shearTest: drawShearTest,
};

/**
 * 🔴 **폴백 drawer 가 시각 `t` 를 실제로 소비하는 씬.** 이 목록에 오른 씬만 rAF 루프를 돌린다.
 *
 * 🔴 왜 「GL 씬의 `animated` 플래그」를 그대로 쓰지 않는가 — 폴백은 씬 모듈을 import 할 수 없다
 *    (셰이더 문자열이 청크로 끌려온다 · A9). 그래서 목록이 둘이 되는 것은 구조상 불가피한데,
 *    **둘이 갈리는 것은 막아야 한다**: `tests/unit/viz-motion.test.ts` 가 「t 를 바꾸면 그림이
 *    바뀌는가」를 13종 전부에 대해 실제로 그려 보고 이 집합과 대조한다(등재 누락·과잉 둘 다 실패).
 *
 * `filmGrowth`는 막 상면 요동, `polishProfile`은 패드·슬러리, `ionTrajectory`는 이온 전면,
 * `aldCycle`는 기상 분자, `crystalGrowth`는 미립·파셋,
 * `aerialImage`는 침지수, `plasma`는 가스 줄기, `packageThermal`은 열류의 시간축을 쓴다.
 * 나머지 5종은 루프를 돌리지 않는다.
 */
export const FALLBACK_ANIMATED: ReadonlySet<FallbackSceneId> = new Set<FallbackSceneId>([
  'filmGrowth', 'plasma', 'ionTrajectory', 'polishProfile', 'aldCycle', 'crystalGrowth', 'aerialImage',
  'ingotSlicing',
  'probeScrub', 'waferMap', 'packageThermal', 'moistureSoak', 'shearTest',
]);

export function createFallback2D(canvas: HTMLCanvasElement, sceneId: FallbackSceneId, stage?: string): Fallback2D | null {
  applyRealisticBackdrop(canvas, sceneId, stage);
  let g2d: CanvasRenderingContext2D | null = null;
  try {
    g2d = canvas.getContext('2d');
  } catch {
    g2d = null;
  }
  if (!g2d) return null;
  const g = g2d;
  const draw = DRAWERS[sceneId];
  /* 🔴 **2026-08-21 해소** — `crystalGrowth`·`aerialImage` 폴백 drawer 2종을 신설했다.
     이제 8종 전부 drawer 가 있고, `wafer` 3칸 + `photo` 3칸도 WebGL2 없이 그려진다.
     (종전에는 이 두 씬이 `null` → `LabRunner` 가 「오류」 배지로 표시했다.)
     🔴 그래도 이 `null` 반환은 남겨 둔다 — 앞으로 새 씬이 drawer 없이 들어와도 **예외로 죽지 않고**
        정직하게 「오류」로 보이게 하는 안전망이다. 예외로 죽으면 원인 불명 화면이 된다.
     🔴 drawer 를 추가할 때는 `scripts/check-fallback-purity.mjs` 의 `SCENE_DRAWERS` 표에도
        같이 등재한다(R5 가 미등재 drawer 를 실패시킨다). 이번 2종은 등재까지 마쳤다. */
  if (typeof draw !== 'function') return null;
  const animated = FALLBACK_ANIMATED.has(sceneId);
  /* 🔴 2026-08-22 — 팔레트를 **생성 시점에 한 번** 만들어 캐시하고 있었다. 그러면
     `prefers-color-scheme` 이 바뀌어도 캔버스만 옛 색으로 남는다(오늘 잡힌 테마 결함의 형태).
     이제 `redraw()` 가 매번 다시 읽고, OS 테마 전환에도 스스로 다시 그린다.
     비용: 폴백은 rAF 루프가 없고 **값이 바뀔 때만** 그리므로 getComputedStyle 호출은 드물다. */
  let params: SceneParams = {};
  let disposed = false;

  /**
   * 🔴 폴백의 내부 시계 [s]. **rAF 콜백(과 `drawAt`)에서만 전진한다.**
   *    `update()`·테마 전환·리사이즈가 부르는 `redraw()` 는 이 값을 그대로 쓴다 —
   *    그래서 프레임이 한 번도 안 돈 상태(테마 프로브·단위테스트)에서는 정확히 0 이고 재현된다.
   */
  let animT = REDUCED_MOTION_TIME;
  let raf = 0;
  let start = 0;
  let reduced = prefersReducedMotion();

  let ro: ResizeObserver | null = null;
  let offTheme: (() => void) | null = null;
  let offMotion: (() => void) | null = null;

  function redraw(): void {
    if (disposed) return;
    const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, MAX_DPR);
    const cssW = canvas.clientWidth || canvas.width || 320;
    const cssH = canvas.clientHeight || canvas.height || 180;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g, w, h, params, palette(canvas), animT);
  }

  /**
   * 시각을 지정해 한 장 그린다. 내부 시계가 이 값으로 옮겨 간다.
   * 🔴 이름이 `drawAt` 이 **아닌** 이유: `check-fallback-purity` R5 가 `function draw[A-Z]…` 를
   *    전부 「씬 drawer」로 읽어 `SCENE_DRAWERS` 등재를 요구한다(실측으로 걸렸다).
   *    공개 이름은 `Fallback2D.drawAt` 그대로이고, 여기서만 이름을 피한다.
   */
  function paintAt(t: number): void {
    animT = Number.isFinite(t) ? t : REDUCED_MOTION_TIME;
    redraw();
  }

  /**
   * 🔴🔴 **폴백에도 rAF 루프를 둔다 — 능동 씬에 한해서.**
   *    종전에는 루프가 아예 없어서 「값이 바뀔 때만」 그렸고, 그래서 폴백 경로에서는 시간 발전을
   *    보여 줄 수단이 없었다. 다만 **정적 씬까지 매 프레임 돌리지는 않는다** —
   *    돌려 봐야 같은 그림이고 배터리만 먹는다. `FALLBACK_ANIMATED` 가 그 경계다.
   *  · 탭이 숨겨지면(`document.hidden`) 프레임을 건너뛴다(GL 루프와 같은 규율).
   *  · 감속 모드(`prefers-reduced-motion`)면 루프를 아예 시작하지 않고 `REDUCED_MOTION_TIME` 에
   *    고정된 한 장으로 남는다 — **그림은 그대로 있고 움직임만 선다.**
   */
  function frame(now: number): void {
    raf = 0;
    if (disposed || reduced) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // 숨은 동안에는 세워 둔다. visibilitychange 가 아니라 다음 rAF 가 깨운다(브라우저가 멈춰 준다).
      raf = requestAnimationFrame(frame);
      return;
    }
    if (start === 0) start = now;
    raf = requestAnimationFrame(frame);
    paintAt((now - start) / 1000);
  }

  function startAnim(): void {
    if (disposed || !animated || reduced || raf) return;
    if (typeof requestAnimationFrame !== 'function') return;   // node·테스트 환경
    start = 0;
    raf = requestAnimationFrame(frame);
  }

  function stopAnim(): void {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
  }

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
  }
  offTheme = onColorSchemeChange(() => redraw());
  offMotion = onReducedMotionChange(() => {
    reduced = prefersReducedMotion();
    if (reduced) {
      stopAnim();
      paintAt(REDUCED_MOTION_TIME);   // 🔴 멈추되 지우지 않는다 — 고정 시각으로 한 장 남긴다
    } else {
      startAnim();
    }
  });
  redraw();
  startAnim();

  return {
    id: sceneId,
    update(next: SceneParams) {
      params = { ...next };
      redraw();
    },
    redraw,
    drawAt: paintAt,
    dispose() {
      disposed = true;
      stopAnim();
      if (ro) ro.disconnect();
      ro = null;
      if (offTheme) offTheme();
      offTheme = null;
      if (offMotion) offMotion();
      offMotion = null;
    },
  };
}
