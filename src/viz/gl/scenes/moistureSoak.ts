/**
 * 씬: **MSL 플로어 라이프 · 표준 소킹 시간축**(packaging / lab-applied).
 *
 * 공용 시간축(0 → 192 h) 위에 네 가지를 얹는다:
 *   ① 플로어 라이프 막대(오른쪽 끝 = `floorLifeH`)
 *   ② 표준 소킹 막대(오른쪽 끝 = `standardSoakH`)
 *   ③ 노출 마커 ▮(= `floorExposureH`)
 *   ④ 마커 ↔ 플로어 막대끝 **여유 치수선**(부호 = `floorLifeMarginH`)
 *
 * 반응 파라미터(전부 0~1 정규화) — **정확히 4키**:
 *   floorLife  플로어 라이프 / 192 h   (이산 4단 24·48·72·168 h)
 *   soak       표준 소킹 / 192 h        (이산 4단 48·72·96·192 h)
 *   exposure   개봉 후 노출시간 / 192 h (4 h 눈금 · 49점)
 *   margin     clamp01(0.5 + 여유h/384) — 🔴 **0.5 가 여유 0 h(합격선)** 이다
 *
 * 🔴 **이산 계단을 「얼어붙음」으로 오해하지 않게 하는 장치가 이 씬의 핵심이다.**
 *    MSL 색인 슬라이더는 4점뿐이라 막대 끝이 네 자리만 밟는다. 그래서 **네 자리 전부를
 *    유령 눈금(잉크색 · alpha 0.22)으로 항상 그리고**, 현재 등급의 눈금만 실선·불투명으로 둔다.
 *    「값이 안 변한다」가 아니라 **「다음 칸이 저기 있다」**로 읽히게 하는 장치다.
 *    🔴 이산값을 보간해 부드럽게 움직이면 표준을 왜곡한다 — **계단은 계단으로 그린다.**
 *
 * 🔴 **씬 안에 글자를 그리지 않는다.** 판정은 **도형**이다 — ● 합격 · ▲ 불합격 · ▨ 미규정.
 * 🔴 **배경을 칠하지 않는다.** `clear()` 가 투명하게 지우고, 프래그먼트는 **알파를 스스로 합성**해
 *    (premultiplied) 그린 자리에만 색을 남긴다 — 라이트/다크 배경은 CSS 가 깐다.
 * 🔴 **색은 CSS 토큰에서만** 온다(`scenes/theme.ts` → `--ink`·`--viz-spec`·`--viz-info`·`--viz-series-N`).
 *    셰이더에 색을 굽지 않는다 — 구우면 라이트 테마에서 안 바뀐다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, DRAW_GLSL, clear, setCommonUniforms } from './common';
import { readVizPalette, onColorSchemeChange } from './theme';
import {
  MS_AXIS_TICK_H,
  MS_AXIS_TICK_X,
  MS_AXIS_Y,
  MS_DIM_ARROW_HALF,
  MS_DIM_ARROW_LEN,
  MS_DIM_EXT_HALF,
  MS_FLOOR_GHOST_X,
  MS_GHOST_ALPHA,
  MS_MARK_HALF_W,
  MS_MARK_OVERHANG,
  MS_ROW_FLOOR_Y0,
  MS_ROW_FLOOR_Y1,
  MS_ROW_MARGIN_Y,
  MS_ROW_SOAK_Y0,
  MS_ROW_SOAK_Y1,
  MS_SOAK_GHOST_X,
  MS_TIME_X0,
  MS_TIME_X1,
  MS_VERDICT_R,
  MS_VERDICT_X,
  moistureSoakModel,
  type MoistureSoakModel,
} from './models/moistureSoak.model';

/**
 * GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다.
 * (`polishProfile.ts` 의 같은 함수를 파일 로컬로 복사한 것이다. 씬끼리 셰이더 유틸을 공유하지 않는다.)
 */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/* 선 굵기 — **화면 배치값**이다(세로 UV 기준. 세로선은 셰이더가 화면비로 나눠 같은 두께로 만든다).
   🔴 GLSL 안에서 `const float NAME = …;` 을 선언하지 않는다. 값은 전부 `${}` 로 식에 주입한다. */
const MS_GL_AXIS_W = 0.0016;
const MS_GL_DATA_W = 0.0022;
const MS_GL_GLYPH_W = 0.0040;

/** 같은 굵기의 세로선 여러 개를 한 식으로 만든다(유령 눈금·시간축 눈금). */
function vlineSum(xs: readonly number[], y0: number, y1: number, wExpr: string): string {
  return xs
    .map((x) => `vline(p, ${glslFloat(x)}, ${glslFloat(y0)}, ${glslFloat(y1)}, ${wExpr})`)
    .join('\n           + ');
}

export const MOISTURE_SOAK_FS = `${FRAG_HEAD}
/* 🔴 색은 전부 CSS 토큰에서 온다(scenes/theme.ts). 셰이더에 구운 색은 하나도 없다. */
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;

/* 시간축 좌표(UV). 전부 models/moistureSoak.model.ts 가 계산해 넘긴다. */
uniform float uFloorX;
uniform float uSoakX;
uniform float uExpX;
uniform float uDimX0;
uniform float uDimX1;
/** 1 = 화살표 오른쪽(여유 ≥ 0 · 합격) · 0 = 왼쪽(불합격) */
uniform float uTipRight;
/** 1 = 치수선을 그릴 수 있다 · 0 = 미규정(▨) */
uniform float uDefined;
${DRAW_GLSL}

/* 배경을 칠하지 않는다 — premultiplied 알파를 직접 합성한다(그린 자리에만 색이 남는다). */
void paint(inout vec3 col, inout float a, vec3 c, float m) {
  float k = clamp(m, 0.0, 1.0);
  col = col * (1.0 - k) + c * k;
  a = a * (1.0 - k) + k;
}

float rectMask(vec2 p, float x0, float x1, float y0, float y1) {
  return bandMask(p.x, x0, x1) * bandMask(p.y, y0, y1);
}
float hline(vec2 p, float y, float x0, float x1, float w) {
  return lineMask(p.y - y, w) * bandMask(p.x, x0, x1);
}
float vline(vec2 p, float x, float y0, float y1, float w) {
  return lineMask(p.x - x, w) * bandMask(p.y, y0, y1);
}

void main() {
  vec2 p = vUv;
  /* 세로선은 가로 UV 로 재므로 화면비로 나눠야 가로선과 같은 두께로 보인다. */
  float aspect = uRes.x / max(uRes.y, 1.0);
  float axW = ${glslFloat(MS_GL_AXIS_W)};
  float axWx = axW / aspect;
  float dataW = ${glslFloat(MS_GL_DATA_W)};
  float dataWx = dataW / aspect;

  vec3 col = vec3(0.0);
  float a = 0.0;

  /* ── ① 공용 시간축(0 → 192 h)과 눈금 ──
     🔴 눈금은 **표준이 값을 준 시각**(24·48·72·96·168·192 h)에만 선다 — 자리를 지어내지 않았다. */
  paint(col, a, uInk, hline(p, ${glslFloat(MS_AXIS_Y)}, ${glslFloat(MS_TIME_X0)}, ${glslFloat(MS_TIME_X1)}, axW));
  float axisTicks = ${vlineSum(MS_AXIS_TICK_X, MS_AXIS_Y, MS_AXIS_Y + MS_AXIS_TICK_H, 'axWx')};
  paint(col, a, uInk, axisTicks);

  /* ── ② 유령 눈금 — 이산 4단 **전부**를 항상 그린다(얼어붙음 오해 방지) ── */
  float ghostFloor = ${vlineSum(MS_FLOOR_GHOST_X, MS_ROW_FLOOR_Y0, MS_ROW_FLOOR_Y1, 'axWx')};
  paint(col, a, uInk, ghostFloor * ${glslFloat(MS_GHOST_ALPHA)});
  float ghostSoak = ${vlineSum(MS_SOAK_GHOST_X, MS_ROW_SOAK_Y0, MS_ROW_SOAK_Y1, 'axWx')};
  paint(col, a, uInk, ghostSoak * ${glslFloat(MS_GHOST_ALPHA)});

  /* ── ③ 막대 두 개. 오른쪽 끝이 곧 값이다 ── */
  paint(col, a, uS1, rectMask(p, ${glslFloat(MS_TIME_X0)}, max(uFloorX, ${glslFloat(MS_TIME_X0)}), ${glslFloat(MS_ROW_FLOOR_Y0)}, ${glslFloat(MS_ROW_FLOOR_Y1)}));
  paint(col, a, uS2, rectMask(p, ${glslFloat(MS_TIME_X0)}, max(uSoakX, ${glslFloat(MS_TIME_X0)}), ${glslFloat(MS_ROW_SOAK_Y0)}, ${glslFloat(MS_ROW_SOAK_Y1)}));

  /* ── ④ 현재 등급의 눈금만 실선·불투명(막대 끝 자리) ── */
  paint(col, a, uInk, vline(p, uFloorX, ${glslFloat(MS_ROW_FLOOR_Y0)}, ${glslFloat(MS_ROW_FLOOR_Y1)}, dataWx));
  paint(col, a, uInk, vline(p, uSoakX, ${glslFloat(MS_ROW_SOAK_Y0)}, ${glslFloat(MS_ROW_SOAK_Y1)}, dataWx));

  /* ── ⑤ 노출 마커 ▮ — 플로어 막대 위로 걸치는 굵은 짧은 세로 막대 ── */
  paint(col, a, uInk, rectMask(p,
    uExpX - ${glslFloat(MS_MARK_HALF_W)}, uExpX + ${glslFloat(MS_MARK_HALF_W)},
    ${glslFloat(MS_ROW_FLOOR_Y0 - MS_MARK_OVERHANG)}, ${glslFloat(MS_ROW_FLOOR_Y1 + MS_MARK_OVERHANG)}));
  // 노출시간 값은 정지해 있고, 현재 마커의 펌스만 동작한다.
  float expPulseR = 0.018 + 0.007 * (0.5 + 0.5 * sin(uTime * 4.4));
  vec2 expD = vec2((p.x - uExpX) * aspect, p.y - ${glslFloat((MS_ROW_FLOOR_Y0 + MS_ROW_FLOOR_Y1) / 2)});
  float expPulse = lineMask(length(expD) - expPulseR, axW);
  paint(col, a, uInfo, expPulse * 0.72);

  /* ── ⑥ 여유 치수선 ──
     🔴 **길이는 좌표에서, 부호는 margin 에서.** 두 경로가 갈라지면 그림이 판정과 다른 말을 한다.
     🔴 uDefined = 0(노출시간이 NaN·∞) 이면 **아예 그리지 않는다** — 판정 자리에 ▨ 만 남는다. */
  float dim = hline(p, ${glslFloat(MS_ROW_MARGIN_Y)}, uDimX0, uDimX1, dataW)
            + vline(p, uDimX0, ${glslFloat(MS_ROW_MARGIN_Y - MS_DIM_EXT_HALF)}, ${glslFloat(MS_ROW_MARGIN_Y + MS_DIM_EXT_HALF)}, axWx)
            + vline(p, uDimX1, ${glslFloat(MS_ROW_MARGIN_Y - MS_DIM_EXT_HALF)}, ${glslFloat(MS_ROW_MARGIN_Y + MS_DIM_EXT_HALF)}, axWx);
  float tipX = mix(uDimX0, uDimX1, uTipRight);
  float dir = mix(-1.0, 1.0, uTipRight);
  vec2 q = vec2((p.x - tipX) * dir, p.y - ${glslFloat(MS_ROW_MARGIN_Y)});
  float arrow = step(-${glslFloat(MS_DIM_ARROW_LEN)}, q.x) * step(q.x, 0.0)
              * step(abs(q.y), ${glslFloat(MS_DIM_ARROW_HALF)} * (-q.x) / ${glslFloat(MS_DIM_ARROW_LEN)});
  paint(col, a, uSpec, clamp(dim + arrow, 0.0, 1.0) * uDefined);

  /* ── ⑦ 판정 형태 — 글자가 아니라 도형 ──
     ● 합격(여유 ≥ 0) · ▲ 불합격 · ▨ 미규정(노출시간이 유한하지 않다) */
  vec2 vq = vec2((p.x - ${glslFloat(MS_VERDICT_X)}) * aspect, p.y - ${glslFloat(MS_ROW_MARGIN_Y)});
  float vr = ${glslFloat(MS_VERDICT_R)};
  float circle = 1.0 - step(vr, length(vq));
  float tri = step(-0.6 * vr, vq.y) * step(abs(vq.x), 0.5625 * (vr - vq.y));
  float sq = step(abs(vq.x), vr) * step(abs(vq.y), vr);
  float inner = step(abs(vq.x), vr - ${glslFloat(MS_GL_GLYPH_W)}) * step(abs(vq.y), vr - ${glslFloat(MS_GL_GLYPH_W)});
  float hatch = step(0.5, fract((vq.x + vq.y) / (vr * 0.5)));
  float hatched = clamp((sq - inner) + inner * hatch, 0.0, 1.0);
  paint(col, a, uSpec, uDefined * (circle * uTipRight + tri * (1.0 - uTipRight)));
  paint(col, a, uInfo, (1.0 - uDefined) * hatched);

  fragColor = vec4(col, a);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
  floorX: WebGLUniformLocation | null;
  soakX: WebGLUniformLocation | null;
  expX: WebGLUniformLocation | null;
  dimX0: WebGLUniformLocation | null;
  dimX1: WebGLUniformLocation | null;
  tipRight: WebGLUniformLocation | null;
  defined: WebGLUniformLocation | null;
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let offTheme: (() => void) | null = null;
  let lastT = 0;
  /* 파라미터가 오기 전에도 그림이 비지 않게 결측 기본값으로 시작한다(모델이 정한다). */
  let m: MoistureSoakModel = moistureSoakModel({});

  const render = (t: number): void => {
    if (!ctx || ctx.lost || !prog || !u) return;
    const gl = ctx.gl;
    clear(gl);
    gl.useProgram(prog);
    setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

    /* 🔴 매 draw 마다 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다. */
    const pal = readVizPalette(ctx.canvas);
    const s1 = pal.series[0] ?? pal.ink;
    const s2 = pal.series[1] ?? pal.ink;
    if (u.ink) gl.uniform3f(u.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
    if (u.spec) gl.uniform3f(u.spec, pal.spec[0], pal.spec[1], pal.spec[2]);
    if (u.info) gl.uniform3f(u.info, pal.info[0], pal.info[1], pal.info[2]);
    if (u.s1) gl.uniform3f(u.s1, s1[0], s1[1], s1[2]);
    if (u.s2) gl.uniform3f(u.s2, s2[0], s2[1], s2[2]);

    if (u.floorX) gl.uniform1f(u.floorX, m.xFloorEnd);
    if (u.soakX) gl.uniform1f(u.soakX, m.xSoakEnd);
    if (u.expX) gl.uniform1f(u.expX, m.xExposure);
    if (u.dimX0) gl.uniform1f(u.dimX0, m.dimX0);
    if (u.dimX1) gl.uniform1f(u.dimX1, m.dimX1);
    if (u.tipRight) gl.uniform1f(u.tipRight, m.dimTipRight ? 1 : 0);
    if (u.defined) gl.uniform1f(u.defined, m.defined ? 1 : 0);

    ctx.drawFullscreen();
  };

  return {
    id: 'moistureSoak',
    animated: true, // 현재 노출시간 마커 펄스가 시간에 따라 변한다
    init(gl) {
      ctx = gl;
      prog = gl.program('moistureSoak', FULLSCREEN_VS, MOISTURE_SOAK_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        floorX: gl.uniform(prog, 'uFloorX'),
        soakX: gl.uniform(prog, 'uSoakX'),
        expX: gl.uniform(prog, 'uExpX'),
        dimX0: gl.uniform(prog, 'uDimX0'),
        dimX1: gl.uniform(prog, 'uDimX1'),
        tipRight: gl.uniform(prog, 'uTipRight'),
        defined: gl.uniform(prog, 'uDefined'),
      };
      /* 🔴 정적 씬은 테마가 바뀌어도 루프가 다시 그리지 않는다 — 스스로 한 장 더 그린다. */
      offTheme = onColorSchemeChange(() => {
        if (ctx && !ctx.lost) render(lastT);
      });
    },
    update(params: SceneParams) {
      m = moistureSoakModel(params);
    },
    draw(t) {
      lastT = t;
      render(t);
    },
    dispose() {
      if (offTheme) offTheme();
      offTheme = null;
      ctx = null;
      prog = null;
      u = null;
    },
  };
}
