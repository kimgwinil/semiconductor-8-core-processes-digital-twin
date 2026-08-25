/**
 * 씬: 패키지 **열경로 단면** ＋ **ΔT 온도 기둥** ＋ **θ→권장전력 계단**(`packaging` / `lab-basic`).
 *
 * 반응 파라미터(전부 0~1 정규화 · **정확히 4키**):
 *   rise       ΔT / 300 °C        → 온도 기둥 높이(1차 판독) + 다이 채움색(보조)
 *   recPower   권장전력 / 3 W     → 계단선의 현재 세로 위치(이산 5단)
 *   testPower  시험전력 / 3 W     → 수평 파선 1개(연속)
 *   theta      (θ − 15) / 85      → 계단선 위 현재 위치 마커
 *
 * 🔴 **여기에 물리는 없다.** 계산은 랩(`src/models/labs/packaging.ts` → `physics/packaging/thermal.ts`)이
 *    끝내고 0~1 로 정규화해 넘긴다. 이 파일이 하는 일은 배치값 주입과 색 배선뿐이다.
 * 🔴 **배치 상수·계단표는 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/packageThermal.model.ts` 가 정본이고, 이 파일은 그것을 `${glslFloat(...)}` 로 **식 안에
 *    직접 주입**한다(`const float NAME = …;` 선언을 만들지 않는다 — 이름을 만들면 정본이 둘이 된다).
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 * 🔴 **색은 CSS 토큰에서만 온다**(`scenes/theme.ts`). GLSL 색 리터럴이 하나도 없어서
 *    라이트/다크 전환이 그대로 따라온다. 감속 모드에서는 프레임을 건너뛰므로
 *    `onColorSchemeChange` 로 스스로 다시 그린다.
 *
 * 🔴 **이 씬이 그리는 시간 발전은 하나뿐이다 — 정상상태 열류 P_H(= dQ/dt).**
 *    열류 마커의 **초당 통과 횟수 ∝ P_H** 이고, 비례관계의 정본은 모델의 `ptFluxLapsPerSecond()` 다.
 *    ⛔ **ΔT 의 과도 상승은 그리지 않는다.** `physics/packaging/thermal.ts` 는 정상상태 `ΔT = θ·P`
 *       하나뿐이고 시상수 τ·열용량 C_th·과도 열임피던스 Z_θ(t) 가 **없다** — 그리려면 지어내야 한다.
 *       기둥 높이·계단선·판정 도형은 여전히 t 의 함수가 아니다.
 * 🔴 **글자를 그리지 않는다**(씬에는 폰트가 없다). 합격/불합격은 **도형**이다 — ● / ▲.
 * 🔴 **배경을 칠하지 않는다.** `clear()` 로 투명하게 지우고 프리멀티플라이드 알파로 얹기만 한다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, DRAW_GLSL, setCommonUniforms, clear } from './common';
import {
  readVizPalette,
  onColorSchemeChange,
  VIZ2D_SPEC_DASH,
  VIZ2D_INFO_DASH,
  VIZ2D_DATA_DASH,
  VIZ2D_SPEC_WIDTH,
  VIZ2D_INFO_WIDTH,
  VIZ2D_DATA_WIDTH,
} from './theme';
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
  PT_RISE_PASS_MAX_C,
  PT_RISE_PASS_MIN_C,
  PT_RISE_REF_C,
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
  ptYOfRise,
  type PackageThermalModel,
} from './models/packageThermal.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}
const F = glslFloat;

/** `readonly number[]` 를 4항 dash 인자로 편다. 없는 자리는 0(= 그 구간 없음). */
function dashArgs(pattern: readonly number[]): string {
  return [0, 1, 2, 3].map((i) => F(pattern[i] ?? 0)).join(', ');
}

/** 계단 트레드 5단 + 라이저 4개. 마지막 단은 가로 폭 0(θ = 100 이 정의역 끝)이라 점으로 남는다. */
const STEP_TREADS = PT_STEPS
  .map((s) => `  st = max(st, segLine(P, vec2(${F(s.x0)}, ${F(s.y)}), vec2(${F(s.x1)}, ${F(s.y)}), wData));`)
  .join('\n');
const STEP_RISERS = PT_BOUNDARIES
  .map((b) => `  st = max(st, segLine(P, vec2(${F(b.x)}, ${F(b.yOpen)}), vec2(${F(b.x)}, ${F(b.yClosed)}), wData));`)
  .join('\n');
/** 경계 귀속 — 채운 점(●)은 값을 **갖는** 쪽(낮은 전력), 빈 점(○)은 **안 갖는** 쪽. */
const STEP_CLOSED_DOTS = [
  `  dotFill = max(dotFill, discM(P, vec2(${F(PT_DOMAIN_START_X)}, ${F(PT_DOMAIN_START_Y)}), ${F(PT_DOT_R)}));`,
  ...PT_BOUNDARIES.map((b) => `  dotFill = max(dotFill, discM(P, vec2(${F(b.x)}, ${F(b.yClosed)}), ${F(PT_DOT_R)}));`),
].join('\n');
const STEP_OPEN_DOTS = PT_BOUNDARIES
  .map((b) => `  dotOpen = max(dotOpen, ringM(P, vec2(${F(b.x)}, ${F(b.yOpen)}), ${F(PT_DOT_R)}, wRing));`)
  .join('\n');

/**
 * 열류 마커 — 가지(위·아래) × `PT_FLUX_MARKS` 개. 위상 오프셋은 모델의 `ptFluxPhase` 와 **같은 식**
 * `(k + 0.5)/N` 이다(정본은 모델 주석 §③). 셰이더 안에서 루프를 돌지 않고 TS 가 펼쳐 주입한다 —
 * 이 파일의 계단 트레드·라이저와 같은 방식이고, 마커 수가 바뀌면 자동으로 따라온다.
 */
const FLUX_MARKS = Array.from({ length: PT_FLUX_MARKS }, (_v, k) => {
  const off = (k + 0.5) / PT_FLUX_MARKS;
  return [
    `  fl = max(fl, fluxMark(P, ${F(PT_FLUX_UP_Y0)}, ${F(PT_FLUX_UP_Y1)}, ${F(off)}));`,
    `  fl = max(fl, fluxMark(P, ${F(PT_FLUX_DN_Y0)}, ${F(PT_FLUX_DN_Y1)}, ${F(off)}));`,
  ].join('\n');
}).join('\n');

export const PACKAGE_THERMAL_FS = `${FRAG_HEAD}
uniform float uRise;      // 0~1. 기둥 높이 배율 · 다이 채움색 보간 t
uniform float uColTop;    // ΔT 기둥 윗면(UV) — 모델이 계산해 넘긴다
uniform float uStepY;     // 계단선 현재 세로 위치(UV)
uniform float uTestY;     // 시험전력 파선 세로 위치(UV)
uniform float uMarkerX;   // 현재 θ 가로 위치(UV)
uniform float uPass;      // 1 = 합격(●) · 0 = 불합격(▲)
uniform float uFluxRate;  // 열류 마커의 초당 통과 횟수 [1/s] = 표시이득 × P_H — 모델이 계산해 넘긴다
uniform vec3 uInk;        // 축·외곽선 — --ink
uniform vec3 uSpec;       // 합격창 경계 · 다이 고온단 — --viz-spec
uniform vec3 uInfo;       // 참고선 · 구조물 · 다이 저온단 — --viz-info
uniform vec3 uS1;         // ΔT 기둥 — --viz-series-1
uniform vec3 uS2;         // 전력 계단 계열 — --viz-series-2
${DRAW_GLSL}

/* 가로를 세로 단위로 환산한다 — 캔버스가 옆으로 길어져도 원이 타원이 되지 않는다. */
vec2 aspv() { return vec2(uRes.x / max(uRes.y, 1.0), 1.0); }
/* px → 세로 UV. 선 굵기·점 테두리를 해상도와 무관하게 일정하게 보이게 한다. */
float pxu(float p) { return p / max(uRes.y, 1.0); }

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * hh);
}
float fillAA(float d) {
  float w = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(-w, w, d);
}
float segLine(vec2 p, vec2 a, vec2 b, float halfW) {
  vec2 A = aspv();
  return fillAA(segDist(p, a * A, b * A) - halfW);
}
float rectFill(vec2 uv, float x0, float x1, float y0, float y1) {
  return bandMask(uv.x, x0, x1) * bandMask(uv.y, y0, y1);
}
float rectEdge(vec2 p, float x0, float x1, float y0, float y1, float halfW) {
  float m = segLine(p, vec2(x0, y0), vec2(x1, y0), halfW);
  m = max(m, segLine(p, vec2(x1, y0), vec2(x1, y1), halfW));
  m = max(m, segLine(p, vec2(x1, y1), vec2(x0, y1), halfW));
  m = max(m, segLine(p, vec2(x0, y1), vec2(x0, y0), halfW));
  return m;
}
float discM(vec2 p, vec2 c, float r) {
  return fillAA(length(p - c * aspv()) - r);
}
float ringM(vec2 p, vec2 c, float r, float halfW) {
  return fillAA(abs(length(p - c * aspv()) - r) - halfW);
}
/* ▲ — 위쪽 꼭짓점 정삼각형. 세 변의 반평면 교집합이다(수치는 sqrt(3)/2 하나뿐). */
float triM(vec2 p, vec2 c, float r) {
  vec2 q = p - c * aspv();
  float k = sqrt(3.0) * 0.5;
  float d = max(-q.y - r * 0.5, max(dot(q, vec2(k, 0.5)) - r * 0.5, dot(q, vec2(-k, 0.5)) - r * 0.5));
  return fillAA(d);
}
/* 열류 마커 하나.
   ph = fract(uTime·uFluxRate + off) 가 y0 → y1 을 훑고, 진폭은 4·ph·(1−ph) 다
   (양 끝에서 0 이라 나타나고 사라지는 자리가 튀지 않는다).
   🔴 「속도」를 지어낸 것이 아니라 **초당 통과 횟수 = 표시이득 × P_H** 를 옮긴 것이다.
      uFluxRate = 0 이면 위상이 off 로 굳어 마커가 제자리에 선다 — 정보는 남는다. */
float fluxMark(vec2 p, float y0, float y1, float off) {
  float ph = fract(uTime * uFluxRate + off);
  vec2 A = aspv();
  vec2 q = abs(p - vec2(${F(PT_FLUX_X)}, mix(y0, y1, ph)) * A)
         - vec2(${F(PT_FLUX_HALF_W)} * A.x, ${F(PT_FLUX_HALF_H)});
  return fillAA(max(q.x, q.y)) * (4.0 * ph * (1.0 - ph));
}
/* Canvas2D setLineDash 와 같은 패턴을 px 단위로 재현한다(on a, off b, on c, off d). */
float dashOn(float s, float a, float b, float c, float d) {
  float p = max(a + b + c + d, 1e-3);
  float f = mod(s, p);
  float on = step(f, a) + step(a + b, f) * step(f, a + b + c);
  return clamp(on, 0.0, 1.0);
}
/* 프리멀티플라이드 source-over. 🔴 배경을 칠하지 않고 얹기만 한다. */
void paint(inout vec4 dst, vec3 c, float a) {
  float s = clamp(a, 0.0, 1.0);
  dst = vec4(c * s, s) + dst * (1.0 - s);
}

void main() {
  vec2 uv = vUv;
  vec2 P = uv * aspv();
  vec4 dst = vec4(0.0);

  float wAxis = pxu(${F(VIZ2D_INFO_WIDTH)}) * 0.5;
  float wSpec = pxu(${F(VIZ2D_SPEC_WIDTH)}) * 0.5;
  float wInfo = pxu(${F(VIZ2D_INFO_WIDTH)}) * 0.5;
  float wData = pxu(${F(VIZ2D_DATA_WIDTH)}) * 0.5;
  float wRing = pxu(${F(VIZ2D_DATA_WIDTH)}) * 0.5;

  /* ── ① 열경로 단면 — 기판 · 패키지 몸체 · 다이 ────────────────────────── */
  paint(dst, uInfo, rectFill(uv, ${F(PT_SECTION_X0)}, ${F(PT_SECTION_X1)}, ${F(PT_BOARD_BOT)}, ${F(PT_BOARD_TOP)}) * ${F(PT_BOARD_FILL_A)});
  paint(dst, uInfo, rectFill(uv, ${F(PT_PKG_X0)}, ${F(PT_PKG_X1)}, ${F(PT_BOARD_TOP)}, ${F(PT_PKG_TOP)}) * ${F(PT_PKG_FILL_A)});
  paint(dst, uInk, rectEdge(P, ${F(PT_PKG_X0)}, ${F(PT_PKG_X1)}, ${F(PT_BOARD_TOP)}, ${F(PT_PKG_TOP)}, wAxis));
  /* 다이 채움색: 무채(uInfo) → 고온(uSpec) 선형 보간, t = rise. **보조 채널**이다. */
  paint(dst, mix(uInfo, uSpec, uRise), rectFill(uv, ${F(PT_DIE_X0)}, ${F(PT_DIE_X1)}, ${F(PT_DIE_Y0)}, ${F(PT_DIE_Y1)}));
  paint(dst, uInk, rectEdge(P, ${F(PT_DIE_X0)}, ${F(PT_DIE_X1)}, ${F(PT_DIE_Y0)}, ${F(PT_DIE_Y1)}, wAxis));

  /* ── ①-b 열류 — **정상상태에서도 열은 흐른다.** 통과율이 P_H 다(모델 §③).
     ⛔ ΔT 의 과도곡선이 아니다 — τ·C_th 가 물리층에 없어 그리지 않는다. */
  float fl = 0.0;
${FLUX_MARKS}
  paint(dst, uS2, fl);

  /* ── ② 온도축 + ΔT 기둥 — 이 씬의 1차 판독 채널 ──────────────────────── */
  paint(dst, uInk, segLine(P, vec2(${F(PT_TAXIS_X)}, ${F(PT_TAXIS_Y0)}), vec2(${F(PT_TAXIS_X)}, ${F(PT_TAXIS_Y1)}), wAxis));
  paint(dst, uS1, rectFill(uv, ${F(PT_TCOL_X0)}, ${F(PT_TCOL_X1)}, ${F(PT_TAXIS_Y0)}, uColTop));

  /* ── ③ 합격창(20·60 °C) · 참고선(30 °C) ────────────────────────────────
     축 오른쪽으로 나간 부분이 곧 합격창 확대 눈금이다. 🔴 축을 자르지 않는다. */
  float sx = uv.x * uRes.x;
  float dSpec = dashOn(sx, ${dashArgs(VIZ2D_SPEC_DASH)});
  float dInfo = dashOn(sx, ${dashArgs(VIZ2D_INFO_DASH)});
  float dData = dashOn(sx, ${dashArgs(VIZ2D_DATA_DASH)});
  paint(dst, uSpec, segLine(P, vec2(${F(PT_REF_X0)}, ${F(ptYOfRise(PT_RISE_PASS_MIN_C))}), vec2(${F(PT_REF_X1)}, ${F(ptYOfRise(PT_RISE_PASS_MIN_C))}), wSpec) * dSpec);
  paint(dst, uSpec, segLine(P, vec2(${F(PT_REF_X0)}, ${F(ptYOfRise(PT_RISE_PASS_MAX_C))}), vec2(${F(PT_REF_X1)}, ${F(ptYOfRise(PT_RISE_PASS_MAX_C))}), wSpec) * dSpec);
  paint(dst, uInfo, segLine(P, vec2(${F(PT_REF_X0)}, ${F(ptYOfRise(PT_RISE_REF_C))}), vec2(${F(PT_REF_X1)}, ${F(ptYOfRise(PT_RISE_REF_C))}), wInfo) * dInfo);

  /* ── ④ 판정 — 글자가 아니라 도형. 합격 ●(채운 원) · 불합격 ▲(삼각형) ─── */
  paint(dst, uInk, mix(
    triM(P, vec2(${F(PT_VERDICT_X)}, ${F(PT_VERDICT_Y)}), ${F(PT_VERDICT_R)}),
    discM(P, vec2(${F(PT_VERDICT_X)}, ${F(PT_VERDICT_Y)}), ${F(PT_VERDICT_R)}),
    uPass));

  /* ── ⑤ θ → 권장전력 계단(이산 5단. 보간하지 않는다) ─────────────────── */
  paint(dst, uInk, segLine(P, vec2(${F(PT_PAXIS_X0)}, ${F(PT_PAXIS_Y0)}), vec2(${F(PT_PAXIS_X0)}, ${F(PT_PAXIS_Y1)}), wAxis));
  paint(dst, uInk, segLine(P, vec2(${F(PT_PAXIS_X0)}, ${F(PT_PAXIS_Y0)}), vec2(${F(PT_PAXIS_X1)}, ${F(PT_PAXIS_Y0)}), wAxis));
  float st = 0.0;
${STEP_TREADS}
${STEP_RISERS}
  paint(dst, uS2, st);

  float dotFill = 0.0;
${STEP_CLOSED_DOTS}
  float dotOpen = 0.0;
${STEP_OPEN_DOTS}
  paint(dst, uS2, dotFill);
  paint(dst, uS2, dotOpen);

  /* ── ⑥ 시험전력 파선(연속) + 현재 θ 위치 마커 ───────────────────────── */
  paint(dst, uS2, segLine(P, vec2(${F(PT_PAXIS_X0)}, uTestY), vec2(${F(PT_PAXIS_X1)}, uTestY), wData) * dData);
  paint(dst, uS2, discM(P, vec2(uMarkerX, uStepY), ${F(PT_MARKER_R)}));
  paint(dst, uInk, ringM(P, vec2(uMarkerX, uStepY), ${F(PT_MARKER_R)}, wRing));

  fragColor = dst; // 프리멀티플라이드 알파(context.ts premultipliedAlpha: true)
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  rise: WebGLUniformLocation | null;
  colTop: WebGLUniformLocation | null;
  stepY: WebGLUniformLocation | null;
  testY: WebGLUniformLocation | null;
  markerX: WebGLUniformLocation | null;
  pass: WebGLUniformLocation | null;
  fluxRate: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let offTheme: (() => void) | null = null;
  let lastT = 0;
  /** 🔴 파라미터 → 화면값 변환은 전부 모델이 한다. 여기서 다시 계산하지 않는다. */
  let m: PackageThermalModel = packageThermalModel({});

  const render = (t: number): void => {
    if (!ctx || !prog || !u || ctx.lost) return;
    const gl = ctx.gl;
    clear(gl);
    gl.useProgram(prog);
    setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

    // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
    const pal = readVizPalette(ctx.canvas);
    const s1 = pal.series[0] ?? pal.ink;
    const s2 = pal.series[1] ?? pal.ink;
    if (u.ink) gl.uniform3f(u.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
    if (u.spec) gl.uniform3f(u.spec, pal.spec[0], pal.spec[1], pal.spec[2]);
    if (u.info) gl.uniform3f(u.info, pal.info[0], pal.info[1], pal.info[2]);
    if (u.s1) gl.uniform3f(u.s1, s1[0], s1[1], s1[2]);
    if (u.s2) gl.uniform3f(u.s2, s2[0], s2[1], s2[2]);

    if (u.rise) gl.uniform1f(u.rise, m.rise);
    if (u.colTop) gl.uniform1f(u.colTop, m.colTop);
    if (u.stepY) gl.uniform1f(u.stepY, m.stepY);
    if (u.testY) gl.uniform1f(u.testY, m.testY);
    if (u.markerX) gl.uniform1f(u.markerX, m.markerX);
    if (u.pass) gl.uniform1f(u.pass, m.risePass ? 1 : 0);
    // 🔴 시간 의존은 이 한 줄뿐이다 — 통과율 ∝ P_H. 모델이 계산한 값을 그대로 올린다.
    if (u.fluxRate) gl.uniform1f(u.fluxRate, m.fluxLapsPerSecond);

    ctx.drawFullscreen();
  };

  return {
    id: 'packageThermal',
    /* 🔴 **무엇의 시간 발전인가 — 정상상태 열류 P_H(= dQ/dt) 다.** 그것 하나뿐이다.
       ΔT 기둥·계단선·판정 도형은 t 의 함수가 아니라 여전히 정지다(τ·C_th 가 물리층에 없다).
       감속 모드(`scenes/motion.ts`)에서는 렌더러가 t 를 고정해 마커가 제자리에 선다. */
    animated: true,
    init(gl) {
      ctx = gl;
      prog = gl.program('packageThermal', FULLSCREEN_VS, PACKAGE_THERMAL_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        rise: gl.uniform(prog, 'uRise'),
        colTop: gl.uniform(prog, 'uColTop'),
        stepY: gl.uniform(prog, 'uStepY'),
        testY: gl.uniform(prog, 'uTestY'),
        markerX: gl.uniform(prog, 'uMarkerX'),
        pass: gl.uniform(prog, 'uPass'),
        fluxRate: gl.uniform(prog, 'uFluxRate'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
      };
      /* 🔴 감속 모드에서는 이 씬도 프레임을 건너뛴다 — 그때 테마가 바뀌면 스스로 한 장 더 그린다.
         (`renderer.ts` 도 같은 리스너를 걸어 두었다. 겹쳐도 테마 전환 때 한 장 더 그릴 뿐이다.) */
      if (offTheme) offTheme();
      offTheme = onColorSchemeChange(() => {
        if (ctx && !ctx.lost) render(lastT);
      });
    },
    update(params: SceneParams) {
      m = packageThermalModel(params);
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
