/**
 * 씬: EDS 웨이퍼 맵 — 다이 격자의 **불량 칸 분포** + 출하 결함수준(DL) 로그 게이지.
 * 반응 파라미터(전부 0~1 정규화, **셋 다 랩 출력에서 온다 — 입력은 하나도 읽지 않는다**):
 *   rawYield     수율 → 불량 칸 비율(= 1 − rawYield)
 *   defectLevel  DL 로그 정규화 → 게이지 기둥 높이
 *   dieAcross    다이 크기 → 격자 한 변의 칸 수(12~34)
 *
 * 🔴 **형상·판정식은 여기 없다.** 셰이더 문자열이 없는 순수 모듈 `models/waferMap.model.ts` 가
 *    정본이고, 이 파일은 배치값을 GLSL 리터럴로 **주입**하고 파생값을 유니폼으로 넣기만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *
 * 🔴 **GLSL 안에 `const float NAME = ...;` 를 선언하지 않는다.** 값은 전부 `${glslFloat(...)}` 로
 *    식 안에 직접 주입한다 — 이름을 붙여 두면 그 이름이 곧 「TS 정본의 사본」이 된다
 *    (`check-scene-constants` B1/B2/B3 이 잡는 형태다).
 *
 * 🔴 **배경을 칠하지 않는다.** 전면을 불투명하게 덮으면 라이트/다크 배경이 캔버스에서만 끊긴다.
 *    그려야 할 요소만 알파를 쌓고(`over()`), 나머지는 알파 0 으로 남긴다.
 * 🔴 **글자를 그리지 않는다.** 판정은 도형(● / ▲)으로만 말한다.
 * 🔴 색은 CSS 토큰(`--viz-*`)에서 읽어 유니폼으로 넣는다 — GLSL 색 리터럴이 없다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, setCommonUniforms, clear } from './common';
import { readVizPalette, onColorSchemeChange, VIZ2D_SPEC_DASH, VIZ2D_INFO_DASH, VIZ2D_SPEC_WIDTH, VIZ2D_INFO_WIDTH, type Rgb3 } from './theme';
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
  type WaferMapModel,
} from './models/waferMap.model';

/**
 * GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다.
 * (`polishProfile.ts` 의 같은 이름 헬퍼를 옮긴 것이다. 파생 상수의 부동소수 꼬리를 잘라
 *  `0.30000000000000004` 같은 표기가 셰이더에 들어가지 않게 6자리에서 반올림하는 것만 더했다.)
 */
function glslFloat(v: number): string {
  const r = Number(Number(v).toFixed(6));
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

/** decade 눈금 6개를 픽셀 세로선 마스크로 펼친다(GLSL 배열·루프 없이 인라인). */
const DECADE_TICKS_GLSL = WM_DL_DECADE_Y
  .map((y) => `  tick = max(tick, bandPx(px.y - ${glslFloat(y)} * uRes.y, ${glslFloat(VIZ2D_INFO_WIDTH)}));`)
  .join('\n');

/**
 * 셰이더 설명 3줄:
 * 1) 웨이퍼 디스크를 `across × across` 격자로 자르고, **칸 중심**이 디스크 안인 칸만 칠한다.
 *    (픽셀 단위로 디스크를 판정하면 경계 칸이 반쪽만 칠해져 폴백과 실루엣이 갈린다.)
 * 2) 칸의 고정 해시 순위가 `rawYield` 이상이면 불량 칸이다 — 수율을 올리면 어두운 칸이
 *    **전면에서 고르게** 줄어든다. 🔴 반경 가중이 없다: 에지 링·중심 클러스터를 그리지 않는다
 *    (모델이 D₀ 를 공간 균일로 못박았다 — PLN 정정 2026-08-20).
 * 3) 오른쪽에 DL 로그 게이지 — 기둥·decade 눈금·합격 상한선·판정 배지(● / ▲).
 *
 * 🔴 UV 는 비등방이다. 원을 그리려면 **가로 반지름 = 세로 반지름 × (uRes.y / uRes.x)** 다.
 */
export const WAFER_MAP_FS = `${FRAG_HEAD}
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uRawYield;   // 수율 0~1 — 칸 순위가 이 값 이상이면 불량
uniform float uAcross;     // 격자 한 변의 칸 수(12~34, 모델이 정한다)
uniform float uGaugeTop;   // DL 기둥 꼭대기 세로 UV(모델이 정한다)
uniform float uPass;       // 1 = 합격(●) · 0 = 불합격(▲)
${NOISE_GLSL}
${DRAW_GLSL}

/* src-over 합성. 🔴 배경을 칠하지 않으므로 알파를 직접 쌓는다. */
void over(inout vec4 dst, vec3 c, float a) {
  float na = a + dst.a * (1.0 - a);
  vec3 rgb = na > 0.0 ? (c * a + dst.rgb * dst.a * (1.0 - a)) / na : vec3(0.0);
  dst = vec4(rgb, na);
}

/* 픽셀 폭 wPx 의 선 마스크. 폴백의 lineWidth 와 같은 단위(디바이스 px)다. */
float bandPx(float d, float wPx) {
  return 1.0 - smoothstep(wPx * 0.5 - 0.5, wPx * 0.5 + 0.5, abs(d));
}

/* 대시 패턴(px). 값은 theme.ts 의 VIZ2D_*_DASH 가 정본이고 여기로 주입된다. */
float dash4(float px, float a, float b, float c, float d) {
  float q = mod(px, a + b + c + d);
  return clamp(step(q, a) + bandMask(q, a + b, a + b + c), 0.0, 1.0);
}
float dash2(float px, float a, float b) {
  return step(mod(px, a + b), a);
}

void main() {
  vec2 uv = vUv;
  vec2 px = uv * uRes;
  vec4 dst = vec4(0.0);

  /* ── ① 웨이퍼 격자 ─────────────────────────────────────────── */
  float rx = ${glslFloat(WM_WAFER_R_Y)} * (uRes.y / max(uRes.x, 1.0));
  vec2 dw = vec2((uv.x - ${glslFloat(WM_WAFER_CX)}) / max(rx, 1e-5),
                 (uv.y - ${glslFloat(WM_WAFER_CY)}) / ${glslFloat(WM_WAFER_R_Y)});
  float across = max(uAcross, 1.0);
  if (abs(dw.x) <= 1.0 && abs(dw.y) <= 1.0) {
    float col = clamp(floor((dw.x + 1.0) * 0.5 * across), 0.0, across - 1.0);
    float row = clamp(floor((dw.y + 1.0) * 0.5 * across), 0.0, across - 1.0);
    // 칸 중심으로 디스크 안팎을 판정한다 — 폴백과 같은 계단 실루엣이 나온다.
    vec2 cc = (vec2(col, row) + 0.5) / across * 2.0 - 1.0;
    if (dot(cc, cc) <= 1.0) {
      float defect = step(uRawYield, hash12(vec2(col, row)));
      over(dst, mix(uS1, uInfo, defect), mix(1.0, ${glslFloat(WM_DIE_DIM_ALPHA)}, defect));
    }
  }

  /* EDS 다이 스캔 행. 결함 분포나 수율 판정을 바꾸지 않고 현재 검사 위치만 겹쳐 그린다. */
  float scanY = ${glslFloat(WM_WAFER_CY - WM_WAFER_R_Y)} + fract(uTime * 0.10) * ${glslFloat(2 * WM_WAFER_R_Y)};
  float scanHalf = sqrt(max(0.0, 1.0 - pow((scanY - ${glslFloat(WM_WAFER_CY)}) / ${glslFloat(WM_WAFER_R_Y)}, 2.0))) * rx;
  float scan = bandPx(px.y - scanY * uRes.y, ${glslFloat(VIZ2D_INFO_WIDTH)})
             * bandMask(uv.x, ${glslFloat(WM_WAFER_CX)} - scanHalf, ${glslFloat(WM_WAFER_CX)} + scanHalf);
  over(dst, uS2, scan * 0.90);

  /* ── ② DL 게이지 기둥 ──────────────────────────────────────── */
  float inGx = bandMask(uv.x, ${glslFloat(WM_GAUGE_X0)}, ${glslFloat(WM_GAUGE_X1)});
  over(dst, uInk, inGx * bandMask(uv.y, ${glslFloat(WM_GAUGE_Y0)}, uGaugeTop));

  /* ── ③ decade 눈금(참고선) ─────────────────────────────────── */
  float tick = 0.0;
${DECADE_TICKS_GLSL}
  over(dst, uInfo, tick * inGx * dash2(px.x, ${glslFloat(VIZ2D_INFO_DASH[0] ?? 0)}, ${glslFloat(VIZ2D_INFO_DASH[1] ?? 0)}));

  /* ── ④ 합격 상한선(규격선) ─────────────────────────────────── */
  float specLine = bandPx(px.y - ${glslFloat(WM_DL_PASS_Y)} * uRes.y, ${glslFloat(VIZ2D_SPEC_WIDTH)});
  over(dst, uSpec, specLine * inGx * dash4(px.x, ${glslFloat(VIZ2D_SPEC_DASH[0] ?? 0)}, ${glslFloat(VIZ2D_SPEC_DASH[1] ?? 0)}, ${glslFloat(VIZ2D_SPEC_DASH[2] ?? 0)}, ${glslFloat(VIZ2D_SPEC_DASH[3] ?? 0)}));

  /* ── ⑤ 판정 배지 — 기둥 꼭대기에 올라탄다 ────────────────────── */
  float br = ${glslFloat(WM_BADGE_R)};
  vec2 bd = vec2((uv.x - ${glslFloat(WM_BADGE_CX)}) / max(br * (uRes.y / max(uRes.x, 1.0)), 1e-5),
                 (uv.y - uGaugeTop) / br);
  float disc = step(dot(bd, bd), 1.0);                                        // ●
  float tri = bandMask(bd.y, -1.0, 1.0) * step(abs(bd.x), (1.0 - bd.y) * 0.5); // ▲
  over(dst, mix(uSpec, uS2, uPass), mix(tri, disc, uPass));

  // 🔴 premultipliedAlpha: true (context.ts) — RGB 에 알파를 곱해 내보낸다.
  fragColor = vec4(dst.rgb * dst.a, dst.a);
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
  rawYield: WebGLUniformLocation | null;
  across: WebGLUniformLocation | null;
  gaugeTop: WebGLUniformLocation | null;
  pass: WebGLUniformLocation | null;
}

function set3(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, v: Rgb3 | undefined, fallback: Rgb3): void {
  if (!loc) return;
  const c = v ?? fallback;
  gl.uniform3f(loc, c[0], c[1], c[2]);
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let offTheme: (() => void) | null = null;
  let lastT = 0;
  /** 🔴 파라미터 판독은 모델 하나가 한다(결측 기본값 0 — ⛔ 0.5 금지). */
  let m: WaferMapModel = waferMapModel({});

  const render = (t: number): void => {
    if (!ctx || !prog || !u || ctx.lost) return;
    const gl = ctx.gl;
    clear(gl);
    gl.disable(gl.BLEND); // 단일 풀스크린 패스 — 알파는 셰이더가 직접 쌓는다
    gl.useProgram(prog);
    setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

    // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
    const pal = readVizPalette(ctx.canvas);
    set3(gl, u.ink, pal.ink, pal.ink);
    set3(gl, u.spec, pal.spec, pal.ink);
    set3(gl, u.info, pal.info, pal.ink);
    set3(gl, u.s1, pal.series[0], pal.ink);
    set3(gl, u.s2, pal.series[1], pal.ink);

    if (u.rawYield) gl.uniform1f(u.rawYield, m.rawYield);
    if (u.across) gl.uniform1f(u.across, m.across);
    if (u.gaugeTop) gl.uniform1f(u.gaugeTop, m.gaugeTop);
    if (u.pass) gl.uniform1f(u.pass, m.pass ? 1 : 0);

    ctx.drawFullscreen();
  };

  return {
    id: 'waferMap',
    animated: true, // 웨이퍼 다이 검사 행이 시간에 따라 스캔한다
    init(gl) {
      ctx = gl;
      prog = gl.program('waferMap', FULLSCREEN_VS, WAFER_MAP_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        rawYield: gl.uniform(prog, 'uRawYield'),
        across: gl.uniform(prog, 'uAcross'),
        gaugeTop: gl.uniform(prog, 'uGaugeTop'),
        pass: gl.uniform(prog, 'uPass'),
      };
      /* 🔴 정적 씬은 파라미터가 안 바뀌면 renderer 루프가 draw() 를 건너뛴다.
         테마가 바뀌어도 다시 그리지 않으므로 씬이 스스로 한 장 더 그린다. */
      offTheme = onColorSchemeChange(() => {
        if (ctx && !ctx.lost) render(lastT);
      });
    },
    update(params: SceneParams) {
      m = waferMapModel(params);
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
