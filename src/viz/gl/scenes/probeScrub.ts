/**
 * 씬: EDS 프로브 접촉·스크럽 — **패드 상면도(스크럽 마크 vs 패시베이션 개구부)** 와
 * **OD 축 · 힘 축** 두 개의 1차원 게이지.
 *
 * 반응 파라미터(전부 0~1 정규화 · **정확히 5키**. DSN §E'-2):
 *   clearance  `scrubClearanceUm`   0 = −15 µm · 1 = +25 µm · **0 µm(합격선) = 0.37500**
 *   odMargin   `overdriveMarginUm`  0 = −74 µm · 1 = +25.5 µm · **0 µm(합격선) = 0.74372**
 *   force      `contactForceG`      0 = 0 g · 1 = 7.5 g
 *   forceCeil  재질별 접촉력 상한    W·W-Re 1.0 · BeCu 0.64
 *   overdrive  `overdriveUm`        0 = 20 µm · 1 = 150 µm
 *
 * 🔴 **웨이퍼 맵·수율·결함은 이 씬이 그리지 않는다** — 병치되는 별도 씬 `waferMap` 소관이다.
 * 🔴 **씬 안에 글자를 그리지 않는다.** 수치는 랩 출력표가 낸다(DSN-S6-정정 ①).
 * 🔴 **배경을 칠하지 않는다.** `clear()` 가 투명하게 지우고 배경은 CSS 가 깐다.
 *
 * 🔴 **배치 상수·변환식은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/probeScrub.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *
 * 🔴 **색을 GLSL 에 굽지 않는다.** CSS 토큰(`--viz-*`)을 `theme.ts` 로 읽어 유니폼으로 넣는다 —
 *    구워 두면 라이트 테마에서 색이 안 바뀐다. 정적 씬이라 테마 전환 때 `draw()` 가 건너뛰어지므로
 *    `onColorSchemeChange()` 로 스스로 한 장 더 그린다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, pick, setCommonUniforms, clear } from './common';
import {
  readVizPalette,
  onColorSchemeChange,
  VIZ2D_SPEC_DASH,
  VIZ2D_INFO_DASH,
  VIZ2D_SPEC_WIDTH,
  VIZ2D_INFO_WIDTH,
  VIZ2D_DATA_WIDTH,
} from './theme';
import {
  PS_BAND_HALF,
  PS_CLAMP_HI_X0,
  PS_CLAMP_HI_X1,
  PS_CLAMP_LO_X0,
  PS_CLAMP_LO_X1,
  PS_DEF_CLEARANCE,
  PS_DEF_FORCE,
  PS_DEF_FORCE_CEIL,
  PS_DEF_OD_MARGIN,
  PS_DEF_OVERDRIVE,
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
  PS_OPEN_HALF,
  PS_PAD_CX,
  PS_PAD_CY,
  PS_VERDICT_R_PX,
  probeScrubModel,
  type ProbeScrubModel,
} from './models/probeScrub.model';

/**
 * 🔴 재수출 — 다른 곳이 이 씬의 배치·변환을 필요로 하면 여기가 아니라 모델 모듈에서 가져간다.
 *    (폴백은 이미 모델을 직접 import 한다.)
 */
export {
  PS_PAD_CX, PS_PAD_CY, PS_OPEN_HALF, PS_UV_PER_UM,
  PS_OD_AXIS_X0, PS_OD_AXIS_X1, PS_OD_AXIS_Y, PS_OD_UV_PER_UM, PS_OD_MARGIN_Y,
  PS_FORCE_AXIS_X0, PS_FORCE_AXIS_X1, PS_FORCE_AXIS_Y,
  probeScrubModel, psXOfOD, psXOfForce, psMarkSideUv,
} from './models/probeScrub.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/** UV 점 → 픽셀 좌표식. UV 는 비등방이라 축마다 따로 곱한다. */
function px(x: number, y: number): string {
  return `vec2(${glslFloat(x)} * uRes.x, ${glslFloat(y)} * uRes.y)`;
}

/**
 * `setLineDash()` 배열을 GLSL 온/오프 함수로 옮긴다.
 * 🔴 **값의 정본은 `theme.ts` 의 `VIZ2D_*_DASH` 하나**다 — 여기서 숫자를 다시 적지 않는다.
 *    그래야 폴백(Canvas2D)과 GL 의 선종이 갈리지 않는다.
 */
function glslDashFn(name: string, dash: readonly number[]): string {
  const period = dash.reduce((s, v) => s + v, 0);
  const parts: string[] = [];
  let acc = 0;
  for (let i = 0; i < dash.length; i++) {
    acc += dash[i] ?? 0;
    parts.push(`m < ${glslFloat(acc)} ? ${i % 2 === 0 ? '1.0' : '0.0'}`);
  }
  const expr = parts.join(' : (') + ' : 0.0' + ')'.repeat(Math.max(0, parts.length - 1));
  return `float ${name}(float s) {\n  float m = mod(s, ${glslFloat(period)});\n  return ${expr};\n}`;
}

/* 미리 계산해 두는 정적 사각형(중심·반폭) — 셰이더에서 다시 나누지 않는다. */
const OD_WIN_CX = (PS_OD_WIN_X0 + PS_OD_WIN_X1) / 2;
const OD_WIN_HX = (PS_OD_WIN_X1 - PS_OD_WIN_X0) / 2;
const CLAMP_LO_CX = (PS_CLAMP_LO_X0 + PS_CLAMP_LO_X1) / 2;
const CLAMP_LO_HX = (PS_CLAMP_LO_X1 - PS_CLAMP_LO_X0) / 2;
const CLAMP_HI_CX = (PS_CLAMP_HI_X0 + PS_CLAMP_HI_X1) / 2;
const CLAMP_HI_HX = (PS_CLAMP_HI_X1 - PS_CLAMP_HI_X0) / 2;

/**
 * 셰이더 설명 3줄:
 * 1) 패드 상면도에 **패시베이션 개구부**(규격선 · 변 0.240 고정)와 **스크럽 마크**(데이터 · 변 가변)를
 *    겹쳐 그린다. 마크가 개구부를 넘으면 넘은 띠만 규격색 45° 빗금이 덮고 판정 도형이 ▲ 가 된다.
 * 2) OD 축에는 **실무창 25–76 µm**(15 % 채움)과 🔴 **접촉력 클램프 구간 45° 빗금**을 미리 깔고,
 *    그 위에 OD 마커와 여유 치수선을 얹는다.
 * 3) 힘 축에는 접촉력 막대와 재질 상한 눈금을 얹는다. **힘은 막대 길이로만 낸다** —
 *    캔틸레버 강성이 없어 「휘는 니들」을 그리면 지어낸 물리다(DSN §E-6).
 *
 * 🔴 길이는 전부 **픽셀 공간**에서 잰다. 선 굵기(2.4·1.8·2.2)와 빗금 간격(6)이 명세에서 px 이고,
 *    UV 는 비등방이라 UV 로 재면 가로·세로 굵기가 달라진다.
 */
export const PROBE_SCRUB_FS = `${FRAG_HEAD}
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;

uniform float uMarkHalf;     // 마크 사각형 반변(UV)
uniform vec2 uClearDimX;     // 개구부 여유 치수선 (x0, x1) UV
uniform float uClearFail;    // clearanceUm < 0 이면 1
uniform float uOdMarkerX;    // OD 마커 x(UV)
uniform vec2 uOdDimX;        // 실무창 여유 치수선 (x0, x1) UV
uniform float uOdFail;       // odMarginUm < 0 이면 1
uniform float uForceBarX1;   // 힘 막대 오른쪽 끝 x(UV)
uniform float uForceCeilX;   // 재질 상한 눈금 x(UV)

${glslDashFn('dashSpec', VIZ2D_SPEC_DASH)}
${glslDashFn('dashInfo', VIZ2D_INFO_DASH)}

/* 획 앤티에일리어싱 — 폭은 px, 번짐은 화면 미분으로 잡는다. */
float aaStroke(float d, float w) {
  float e = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(w * 0.5 - e, w * 0.5 + e, d);
}

/* 선분까지의 거리(px)와 시작점에서의 호길이(px, 파선 위상용). */
float segDist(vec2 p, vec2 a, vec2 b, out float s) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float L = max(length(ba), 1e-6);
  float t = clamp(dot(pa, ba) / (L * L), 0.0, 1.0);
  s = t * L;
  return length(pa - ba * t);
}

float segSolid(vec2 p, vec2 a, vec2 b, float w) {
  float s;
  return aaStroke(segDist(p, a, b, s), w);
}

float segSpecDash(vec2 p, vec2 a, vec2 b, float w) {
  float s;
  float d = segDist(p, a, b, s);
  return aaStroke(d, w) * dashSpec(s);
}

float segInfoDash(vec2 p, vec2 a, vec2 b, float w) {
  float s;
  float d = segDist(p, a, b, s);
  return aaStroke(d, w) * dashInfo(s);
}

/* 축정렬 사각형 부호거리(px). 안쪽이 음수. */
float rectSdf(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2(0.0)));
}

float rectFill(vec2 p, vec2 c, vec2 h) {
  float sd = rectSdf(p, c, h);
  float e = fwidth(sd) + 1e-5;
  return 1.0 - smoothstep(-e, e, sd);
}

/* 45° 빗금 — 간격·굵기 모두 px. */
float hatch45(vec2 p, float stepPx, float w) {
  float u = (p.x + p.y) * inversesqrt(2.0);
  float m = mod(u, stepPx);
  float d = min(m, stepPx - m);
  return aaStroke(d, w);
}

/* 판정 도형 ● */
float circleFill(vec2 p, vec2 c, float r) {
  float sd = length(p - c) - r;
  float e = fwidth(sd) + 1e-5;
  return 1.0 - smoothstep(-e, e, sd);
}

/* 판정 도형 ▲ — 볼록 폴리곤 반평면 최대값. CCW 이면 안쪽이 음수. */
float edgeD(vec2 p, vec2 a, vec2 b) {
  vec2 e = b - a;
  return ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / max(length(e), 1e-6);
}

float triFill(vec2 p, vec2 a, vec2 b, vec2 c) {
  float sd = max(max(edgeD(p, a, b), edgeD(p, b, c)), edgeD(p, c, a));
  float e = fwidth(sd) + 1e-5;
  return 1.0 - smoothstep(-e, e, sd);
}

/* 🔴 **미리곱해진(premultiplied) 알파**로 쌓는다 — 컨텍스트가 premultipliedAlpha: true 다.
   불투명한 색 c 를 덮개율 k 로 얹으면 소스는 (c·k, k) 이고, 그것을 dst 위에 over 한다.
   여기서 스트레이트 알파로 섞고 나중에 곱하면 반투명 요소(실무창 15 % 채움)가 두 번 어두워진다. */
void over(inout vec4 dst, vec3 c, float m) {
  float k = clamp(m, 0.0, 1.0);
  dst.rgb = dst.rgb * (1.0 - k) + c * k;
  dst.a = dst.a * (1.0 - k) + k;
}

void main() {
  vec2 P = vUv * uRes;
  vec4 dst = vec4(0.0);

  float bandH = ${glslFloat(PS_BAND_HALF)} * uRes.y;
  float odY = ${glslFloat(PS_OD_AXIS_Y)} * uRes.y;
  float odMY = ${glslFloat(PS_OD_MARGIN_Y)} * uRes.y;
  float fY = ${glslFloat(PS_FORCE_AXIS_Y)} * uRes.y;
  float minDim = ${glslFloat(PS_MIN_DIM_PX)};

  /* ── ① 🔴 접촉력 클램프 구간 45° 빗금 (OD 20–25 · 76–150) ──
     지우지 마라. 이 구간에서 contactForceG 가 평평한 것은 결함이 아니라 **의도된 클램프**다. */
  float clampBand = max(
    rectFill(P, ${px(CLAMP_LO_CX, PS_OD_AXIS_Y)}, vec2(${glslFloat(CLAMP_LO_HX)} * uRes.x, bandH)),
    rectFill(P, ${px(CLAMP_HI_CX, PS_OD_AXIS_Y)}, vec2(${glslFloat(CLAMP_HI_HX)} * uRes.x, bandH))
  );
  over(dst, uInfo, clampBand * hatch45(P, ${glslFloat(PS_HATCH_STEP_PX)}, ${glslFloat(VIZ2D_INFO_WIDTH)}));

  /* ── ② OD 실무창 25–76 µm — 15 % 채움 + 실선 테두리 ── */
  vec2 winC = ${px(OD_WIN_CX, PS_OD_AXIS_Y)};
  vec2 winH = vec2(${glslFloat(OD_WIN_HX)} * uRes.x, bandH);
  over(dst, uS2, rectFill(P, winC, winH) * ${glslFloat(PS_OD_WIN_FILL)});
  over(dst, uS2, aaStroke(abs(rectSdf(P, winC, winH)), ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* ── ③ 두 축의 기준선(참고선 — 판정이 아니다) ── */
  over(dst, uInfo, segInfoDash(P, vec2(${glslFloat(PS_OD_AXIS_X0)} * uRes.x, odY), vec2(${glslFloat(PS_OD_AXIS_X1)} * uRes.x, odY), ${glslFloat(VIZ2D_INFO_WIDTH)}));
  over(dst, uInfo, segInfoDash(P, vec2(${glslFloat(PS_FORCE_AXIS_X0)} * uRes.x, fY), vec2(${glslFloat(PS_FORCE_AXIS_X1)} * uRes.x, fY), ${glslFloat(VIZ2D_INFO_WIDTH)}));

  /* ── ④ 재질별 접촉력 상한 눈금(세로 짧은 선) ── */
  float ceilX = uForceCeilX * uRes.x;
  over(dst, uInfo, segInfoDash(P, vec2(ceilX, fY - bandH), vec2(ceilX, fY + bandH), ${glslFloat(VIZ2D_INFO_WIDTH)}));

  /* ── ⑤ 힘 막대 — 길이만이 신호다. 니들의 휨은 그리지 않는다(강성 미상). ── */
  float barX1 = uForceBarX1 * uRes.x;
  float barLen = barX1 - ${glslFloat(PS_FORCE_AXIS_X0)} * uRes.x;
  over(dst, uS1, segSolid(P, vec2(${glslFloat(PS_FORCE_AXIS_X0)} * uRes.x, fY), vec2(barX1, fY), ${glslFloat(VIZ2D_DATA_WIDTH)}) * step(minDim, barLen));

  /* ── ⑥ OD 마커(세로선) + 실무창 여유 치수선 ── */
  float odX = uOdMarkerX * uRes.x;
  over(dst, uS1, segSolid(P, vec2(odX, odY - bandH), vec2(odX, odY + bandH), ${glslFloat(VIZ2D_DATA_WIDTH)}));
  float odDimLen = (uOdDimX.y - uOdDimX.x) * uRes.x;
  over(dst, uS1, segSolid(P, vec2(uOdDimX.x * uRes.x, odMY), vec2(uOdDimX.y * uRes.x, odMY), ${glslFloat(VIZ2D_DATA_WIDTH)}) * step(minDim, odDimLen));

  /* ── ⑦ 패드 상면도 — 개구부(규격) · 마크(데이터) ── */
  vec2 padC = ${px(PS_PAD_CX, PS_PAD_CY)};
  vec2 openH = vec2(${glslFloat(PS_OPEN_HALF)} * uRes.x, ${glslFloat(PS_OPEN_HALF)} * uRes.y);
  vec2 markH = vec2(uMarkHalf * uRes.x, uMarkHalf * uRes.y);

  vec2 obl = padC - openH;
  vec2 obr = padC + vec2(openH.x, -openH.y);
  vec2 otr = padC + openH;
  vec2 otl = padC + vec2(-openH.x, openH.y);
  float openEdge = max(
    max(segSpecDash(P, obl, obr, ${glslFloat(VIZ2D_SPEC_WIDTH)}), segSpecDash(P, obr, otr, ${glslFloat(VIZ2D_SPEC_WIDTH)})),
    max(segSpecDash(P, otr, otl, ${glslFloat(VIZ2D_SPEC_WIDTH)}), segSpecDash(P, otl, obl, ${glslFloat(VIZ2D_SPEC_WIDTH)}))
  );

  over(dst, uS1, aaStroke(abs(rectSdf(P, padC, markH)), ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* 접촉 시퀀스 펌스. 스크럽 방향은 명세에 없으므로 이동 궤적을 그리지 않고,
     마크 중앙의 동심원으로 접촉이 진행 중임만 표시한다. */
  float pulseR = (0.018 + 0.010 * (0.5 + 0.5 * sin(uTime * 5.2))) * uRes.y;
  float pulse = aaStroke(abs(length(P - padC) - pulseR), ${glslFloat(VIZ2D_INFO_WIDTH)});
  over(dst, uInfo, pulse * 0.72);

  /* 실패 형상 — 개구부 **밖으로 나간 띠 부분만** 규격색 빗금. */
  float outsideBand = clamp(rectFill(P, padC, markH) - rectFill(P, padC, openH), 0.0, 1.0);
  over(dst, uSpec, outsideBand * hatch45(P, ${glslFloat(PS_HATCH_STEP_PX)}, ${glslFloat(VIZ2D_SPEC_WIDTH)}) * uClearFail);

  over(dst, uSpec, openEdge);

  /* 개구부 여유 치수선 — 길이 0 이면 그리지 않는다(점으로 남는다). */
  float clrDimLen = (uClearDimX.y - uClearDimX.x) * uRes.x;
  over(dst, uS1, segSolid(P, vec2(uClearDimX.x * uRes.x, padC.y), vec2(uClearDimX.y * uRes.x, padC.y), ${glslFloat(VIZ2D_DATA_WIDTH)}) * step(minDim, clrDimLen));

  /* ── ⑧ 판정 도형 — 합격 ● / 불합격 ▲. 색에만 기대지 않는다(흑백·색각이상). ── */
  float vr = ${glslFloat(PS_VERDICT_R_PX)};
  vec2 vTop = vec2(0.0, vr);
  vec2 vBL = vec2(-vr * sqrt(0.75), -vr * 0.5);
  vec2 vBR = vec2(vr * sqrt(0.75), -vr * 0.5);

  vec2 vc1 = vec2(uClearDimX.y * uRes.x, padC.y);
  over(dst, uInk, circleFill(P, vc1, vr) * (1.0 - uClearFail));
  over(dst, uSpec, triFill(P, vc1 + vTop, vc1 + vBL, vc1 + vBR) * uClearFail);

  vec2 vc2 = vec2(odX, odY);
  over(dst, uInk, circleFill(P, vc2, vr) * (1.0 - uOdFail));
  over(dst, uSpec, triFill(P, vc2 + vTop, vc2 + vBL, vc2 + vBR) * uOdFail);

  /* 🔴 x > 0.44 는 **비워 둔다.** 명세에 그 영역의 요소가 없다 — 지어내서 채우지 않는다.
     (원래 이 좌표계는 좌 패널이었고, 우 패널은 별도 씬 waferMap 으로 분리됐다. DSN §E'-1) */

  fragColor = dst;
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
  markHalf: WebGLUniformLocation | null;
  clearDimX: WebGLUniformLocation | null;
  clearFail: WebGLUniformLocation | null;
  odMarkerX: WebGLUniformLocation | null;
  odDimX: WebGLUniformLocation | null;
  odFail: WebGLUniformLocation | null;
  forceBarX1: WebGLUniformLocation | null;
  forceCeilX: WebGLUniformLocation | null;
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let offTheme: (() => void) | null = null;
  let lastT = 0;

  /** 🔴 결측 기본값은 모델이 정본이다. **0.5 를 쓰지 않는다**(A15). */
  const p = {
    clearance: PS_DEF_CLEARANCE,
    odMargin: PS_DEF_OD_MARGIN,
    force: PS_DEF_FORCE,
    forceCeil: PS_DEF_FORCE_CEIL,
    overdrive: PS_DEF_OVERDRIVE,
  };
  let m: ProbeScrubModel = probeScrubModel(p);

  const render = (t: number): void => {
    if (!ctx || !prog || !u || ctx.lost) return;
    const gl = ctx.gl;
    clear(gl);
    gl.useProgram(prog);
    setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

    // 🔴 매 draw 마다 새로 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
    const pal = readVizPalette(ctx.canvas);
    if (u.ink) gl.uniform3f(u.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
    if (u.spec) gl.uniform3f(u.spec, pal.spec[0], pal.spec[1], pal.spec[2]);
    if (u.info) gl.uniform3f(u.info, pal.info[0], pal.info[1], pal.info[2]);
    const s1 = pal.series[0] ?? pal.ink;
    const s2 = pal.series[1] ?? pal.ink;
    if (u.s1) gl.uniform3f(u.s1, s1[0], s1[1], s1[2]);
    if (u.s2) gl.uniform3f(u.s2, s2[0], s2[1], s2[2]);

    if (u.markHalf) gl.uniform1f(u.markHalf, m.markHalf);
    if (u.clearDimX) gl.uniform2f(u.clearDimX, m.clearDimX0, m.clearDimX1);
    if (u.clearFail) gl.uniform1f(u.clearFail, m.clearFail ? 1 : 0);
    if (u.odMarkerX) gl.uniform1f(u.odMarkerX, m.odMarkerX);
    if (u.odDimX) gl.uniform2f(u.odDimX, m.odDimX0, m.odDimX1);
    if (u.odFail) gl.uniform1f(u.odFail, m.odFail ? 1 : 0);
    if (u.forceBarX1) gl.uniform1f(u.forceBarX1, m.forceBarX1);
    if (u.forceCeilX) gl.uniform1f(u.forceCeilX, m.forceCeilX);

    ctx.drawFullscreen();
  };

  return {
    id: 'probeScrub',
    animated: true, // 패드 접촉 시퀀스 펌스가 시간에 따라 변한다
    init(gl) {
      ctx = gl;
      prog = gl.program('probeScrub', FULLSCREEN_VS, PROBE_SCRUB_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        markHalf: gl.uniform(prog, 'uMarkHalf'),
        clearDimX: gl.uniform(prog, 'uClearDimX'),
        clearFail: gl.uniform(prog, 'uClearFail'),
        odMarkerX: gl.uniform(prog, 'uOdMarkerX'),
        odDimX: gl.uniform(prog, 'uOdDimX'),
        odFail: gl.uniform(prog, 'uOdFail'),
        forceBarX1: gl.uniform(prog, 'uForceBarX1'),
        forceCeilX: gl.uniform(prog, 'uForceCeilX'),
      };
      // 🔴 정적 씬이라 테마가 바뀌어도 루프가 draw 를 건너뛴다 — 스스로 한 장 더 그린다.
      offTheme = onColorSchemeChange(() => {
        if (ctx && !ctx.lost) render(lastT);
      });
    },
    update(params: SceneParams) {
      p.clearance = pick(params, 'clearance', PS_DEF_CLEARANCE);
      p.odMargin = pick(params, 'odMargin', PS_DEF_OD_MARGIN);
      p.force = pick(params, 'force', PS_DEF_FORCE);
      p.forceCeil = pick(params, 'forceCeil', PS_DEF_FORCE_CEIL);
      p.overdrive = pick(params, 'overdrive', PS_DEF_OVERDRIVE);
      m = probeScrubModel(p);
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
