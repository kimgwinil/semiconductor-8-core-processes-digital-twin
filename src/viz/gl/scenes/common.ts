/**
 * 씬 공용 GLSL 조각과 유틸.
 *
 * 🔴 여기에도, 각 씬에도 **물리 상수는 없다.** 등장하는 숫자는 전부 화면 배치값
 *    (단면이 화면의 어디에 그려지는가 · 색 · 선 굵기)이며, 물리량은 models 가 계산해
 *    0~1 로 정규화한 값만 uniform 으로 들어온다 — 설계서 §3 계층 규칙 · §8 매직넘버 규칙.
 */

/** 풀스크린 삼각형용 정점 셰이더. vUv 는 좌하단 (0,0), 우상단 (1,1). */
export const FULLSCREEN_VS = `#version 300 es
// 풀스크린 삼각형 3정점을 클립 공간에 그대로 놓는다.
// aPos(-1..3) 를 0..1 UV 로 변환해 프래그먼트에 넘긴다.
// y 는 위쪽이 +1 이다 — 단면 그림의 "위"가 화면 위와 일치한다.
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** 프래그먼트 셰이더 공통 머리말(버전·정밀도·입출력·공용 유니폼). */
export const FRAG_HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 fragColor;
`;

/** 해시·값노이즈·fbm. 텍스처 없이 거칠기/휘도 요동을 만든다. */
export const NOISE_GLSL = `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 5; k++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
`;

/** 선/눈금 보조 함수. px 폭은 화면 해상도와 무관하게 일정하게 보이도록 fwidth 로 잡는다. */
export const DRAW_GLSL = `
float lineMask(float d, float w) {
  float e = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(w - e, w + e, abs(d));
}
float bandMask(float v, float lo, float hi) {
  return step(lo, v) * step(v, hi);
}
`;

/** 0~1 로 클램프한 파라미터를 읽는다. 키가 없으면 fallback. */
export function pick(params: Readonly<Record<string, number>>, key: string, fallback = 0.5): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 공용 유니폼(uRes·uTime) 설정. 씬마다 반복되는 코드를 줄인다. */
export function setCommonUniforms(
  gl: WebGL2RenderingContext,
  resLoc: WebGLUniformLocation | null,
  timeLoc: WebGLUniformLocation | null,
  width: number,
  height: number,
  t: number,
): void {
  if (resLoc) gl.uniform2f(resLoc, width, height);
  if (timeLoc) gl.uniform1f(timeLoc, t);
}

/** 캔버스를 투명하게 지운다(배경은 CSS 가 깐다 — 다크/라이트 대응). */
export function clear(gl: WebGL2RenderingContext): void {
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
