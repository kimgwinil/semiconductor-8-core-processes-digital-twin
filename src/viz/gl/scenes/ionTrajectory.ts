/**
 * 씬: 이온 주입 궤적 + 깊이-농도 프로파일.
 * 반응 파라미터(전부 0~1 정규화):
 *   energy  가속 에너지 → 평균 정지 깊이(Rp)와 스트래글이 커진다. 궤적이 깊어지고 프로파일 봉우리가 아래로 이동
 *   dose    도즈       → 보이는 이온 개수와 프로파일 곡선의 진폭
 *   tilt    틸트각     → 입사 방향이 기울어진다(채널링 회피). 궤적이 사선이 된다
 *   scatter 산란       → 궤적의 좌우 흐트러짐과 프로파일 폭
 *
 * 인스턴싱을 쓰지 않는다 — 점 스프라이트(gl.POINTS) 다중 정점으로 그린다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { ALBEDO_GLSL, acquireTextures, texMeanGLSL, type TextureSet } from '../textures';
import { TEX_SUBSTRATE } from '../texUnits';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, pick, setCommonUniforms, clear } from './common';
import { readVizPalette, type Rgb3 } from './theme';
import {
  CONC_FLOOR, CONC_GAIN, DEPTH_SPAN, LATERAL_BASE, LATERAL_SCATTER,
  PANEL_L0, PANEL_L1, PANEL_R0, PANEL_R1, PANEL_W, RANGE_FRAC,
  SCATTER_STRAGGLE_GAIN, SIGMA_BASE, SIGMA_ENERGY, SIGMA_SCATTER,
  STRAGGLE_HI, STRAGGLE_LO, SURFACE_Y, TILT_SWING, X0_BASE, X0_SPAN,
} from './models/ionTrajectory.model';

/**
 * 🔴 **축 배치와 파생값의 정본은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/ionTrajectory.model.ts` 가 정본이고, 이 파일은 그것을 세 셰이더(배경 FS ·
 *    입자 VS · 프로파일 VS)에 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *    (2026-08-21 이전 폴백은 깊이 축을 0.58 로 잡아 R_p·σ 가 정본보다 **26.1 % 깊게** 찍혔다.)
 */
export { ionConcentration, ionRangePeak, ionSigma, ionTrajectoryModel } from './models/ionTrajectory.model';
export type { IonTrajectoryModel } from './models/ionTrajectory.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

const PARTICLE_COUNT = 2400;
const PROFILE_SEGMENTS = 160;

/*
 * 기판 재질 알베도(설계서 §6-5)는 텍스처 유닛 `TEX_SUBSTRATE` 에 올린다 — 배경 셰이더의
 * 샘플러와 1:1 로 맞춘다. 🔴 번호의 정본은 `../texUnits` 이며 여기서 선언하지 않는다
 * (예전엔 이 씬을 포함한 세 파일이 각자 `= 0` 을 들고 있었다: check-constants R1).
 */

/**
 * 배경 셰이더 설명 3줄:
 * 1) 왼쪽 패널에 기판 단면을 깔고 표면선과 등간격 깊이 눈금을 긋는다.
 * 2) 오른쪽 패널에 깊이-농도 프로파일용 축 틀과 격자를 그린다(세로=깊이, 가로=농도).
 * 3) 두 패널의 깊이 좌표계를 같은 스케일로 맞춰 궤적의 정지 깊이와 곡선 봉우리가 나란히 읽히게 한다.
 *
 * 🔴 기판 표면은 절차적 fbm 이 아니라 **실리콘 알베도 텍스처**다(§6-5). 자산에는 색조가 아니라
 *    무늬만 들어 있으므로 평균 알베도로 나눠 무늬 배율만 뽑아 기판 색에 곱한다. 표면선·깊이 눈금·
 *    Rp 표시선·패널 축은 종전 그대로 그 위에 얹는다 — 패널 배치와 그래프는 바뀌지 않는다.
 */
export const ION_BG_FS = `${FRAG_HEAD}
uniform float uEnergy;
uniform sampler2D uSubstrateTex;
/* 🔴 색은 CSS 토큰(--bg · --ink · --viz-info)에서 읽어 유니폼으로 들어온다 — 라이트/다크를 따라간다. */
uniform vec3 uBg;
uniform vec3 uInk;
uniform vec3 uInfo;
${NOISE_GLSL}
${DRAW_GLSL}
${ALBEDO_GLSL}

/* 🔴 아래 배치값은 models/ionTrajectory.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다. */
const float SURFACE_Y = ${glslFloat(SURFACE_Y)};
const float DEPTH_SPAN = ${glslFloat(DEPTH_SPAN)};
const float PANEL_L0 = ${glslFloat(PANEL_L0)};
const float PANEL_L1 = ${glslFloat(PANEL_L1)};
const float PANEL_R0 = ${glslFloat(PANEL_R0)};
const float PANEL_R1 = ${glslFloat(PANEL_R1)};

// 알베도 UV 배율 — 화면에 타일이 몇 장 들어오는가. **화면 배치값이며 물리 상수가 아니다.**
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUB_TEX_UV」/「FILM_TEX_UV」 라는 **같은 이름**으로 **다른 값**을 들고 있었다
   (SUB 1.6/1.8/1.7 · FILM 2.4/2.6). grep 하면 어느 것이 이 화면의 값인지 구별이 안 됐다(A-10 「육안 구별 불가」).
   🔴 **값은 한 자리도 바꾸지 않았다 — 이름만 갈랐다.** 씬마다 기판이 화면에서 차지하는 크기가 달라
   확대율이 다른 것이 의도로 보이며, 「세 값을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5). 통일로 판정되면 layout.model.ts 로 올려 주입하면 된다. */
const float ION_SUB_TEX_UV = 1.8;
// 텍스처 평균 알베도(textures.ts 실측). 무늬 배율을 뽑는 나눗셈 기준이다.
const vec3 MEAN_SI = ${texMeanGLSL('silicon-surface')};
// 기판 색 — 종전 절차적 색의 평균을 그대로 옮겼다(화면 색을 바꾸지 않는다). 화면 배치값이다.
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUBSTRATE_COLOR」 라는 **같은 이름**으로 **다른 색**을 들고 있었다
   (filmGrowth 0.25/0.275/0.32 · ionTrajectory 0.20/0.22/0.275 · stepCoverage 0.24/0.265/0.31).
   🔴 **색은 한 성분도 바꾸지 않았다 — 이름만 갈랐다.** 같은 실리콘 기판인데 씬마다 조명·배경이 달라
   눈으로 맞춘 값으로 보이며, 「세 색을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5 — 색 조정은 DSN 소관이라 여기서 정하지 않았다). */
const vec3 ION_SUBSTRATE_COLOR = vec3(0.20, 0.22, 0.275);

void main() {
  vec2 uv = vUv;
  vec3 col = uBg;

  float inLeft = bandMask(uv.x, PANEL_L0, PANEL_L1);
  float inRight = bandMask(uv.x, PANEL_R0, PANEL_R1);

  // 좌: 기판 단면 — 재질 표면은 알베도 텍스처, 조명·경계선은 아래에서 셰이더가 얹는다.
  // 재질 표면 UV — 캔버스가 옆으로 길어져도 무늬가 늘어나지 않게 가로를 화면비로 환산한다.
  vec2 tuv = vec2(uv.x * (uRes.x / max(uRes.y, 1.0)), uv.y);
  float sub = step(uv.y, SURFACE_Y) * inLeft * step(SURFACE_Y - DEPTH_SPAN - 0.08, uv.y);
  vec3 subCol = ION_SUBSTRATE_COLOR * albedoDetail(texture(uSubstrateTex, tuv * ION_SUB_TEX_UV).rgb, MEAN_SI);
  col = mix(col, subCol, sub);
  col = mix(col, uInk, clamp(lineMask(uv.y - SURFACE_Y, 0.0016) * inLeft * 0.9, 0.0, 1.0));

  // 깊이 눈금 5등분 (좌·우 패널 공통 스케일)
  float g = fract((SURFACE_Y - uv.y) / (DEPTH_SPAN * 0.2));
  float tick = lineMask(min(g, 1.0 - g), 0.035) * bandMask(uv.y, SURFACE_Y - DEPTH_SPAN, SURFACE_Y);
  col = mix(col, uInfo, clamp(tick * (inLeft * bandMask(uv.x, PANEL_L0, PANEL_L0 + 0.035) + inRight * 0.35), 0.0, 1.0));

  // 우: 프로파일 패널 축
  float axisV = lineMask(uv.x - PANEL_R0, 0.0016) * bandMask(uv.y, SURFACE_Y - DEPTH_SPAN, SURFACE_Y);
  float axisH = lineMask(uv.y - SURFACE_Y, 0.0016) * inRight;
  col = mix(col, uInk, clamp((axisV + axisH) * 0.9, 0.0, 1.0));

  // Rp(평균 투영 비정) 표시선 — 에너지에 따라 내려간다
  float rp = SURFACE_Y - uEnergy * DEPTH_SPAN * ${glslFloat(RANGE_FRAC)};
  float rpLine = lineMask(uv.y - rp, 0.0012) * step(0.5, fract(uv.x * 90.0));
  col = mix(col, uInfo, clamp(rpLine * (inLeft + inRight) * 0.55, 0.0, 1.0));

  fragColor = vec4(col, 1.0);
}
`;

/**
 * 입자 정점 셰이더 설명 3줄:
 * 1) 각 정점은 이온 1개다. 시드 난수로 입사 위치와 개별 비정(range)을 흩는다.
 * 2) 틸트각으로 입사 방향을 기울이고, 진행 거리에 비례해 산란 폭을 더해 궤적을 만든다.
 * 3) 도즈보다 인덱스가 큰 이온은 화면 밖으로 보내 개수를 도즈에 비례시킨다.
 */
export const ION_PARTICLE_VS = `#version 300 es
layout(location = 0) in vec2 aSeed;
layout(location = 1) in float aIndex;
uniform float uTime;
uniform float uEnergy;
uniform float uDose;
uniform float uTilt;
uniform float uScatter;
uniform float uPointSize;
out float vAlpha;
out float vDepth;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

const float SURFACE_Y = ${glslFloat(SURFACE_Y)};
const float DEPTH_SPAN = ${glslFloat(DEPTH_SPAN)};

void main() {
  float visible = step(aIndex, uDose);
  if (visible < 0.5) {
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  // 30% 는 비행 중(시간에 따라 이동), 70% 는 이미 정지한 분포
  float anim = step(0.70, hash11(aIndex * 7.13 + 0.37));
  float t = mix(1.0, fract(uTime * 0.30 + aSeed.y), anim);

  float straggle = mix(${glslFloat(STRAGGLE_LO)}, ${glslFloat(STRAGGLE_HI)}, aSeed.y) * (1.0 + uScatter * ${glslFloat(SCATTER_STRAGGLE_GAIN)});
  float range = uEnergy * DEPTH_SPAN * ${glslFloat(RANGE_FRAC)} * straggle;
  float ang = (uTilt - 0.5) * ${glslFloat(TILT_SWING)};
  float x0 = ${glslFloat(X0_BASE)} + aSeed.x * ${glslFloat(X0_SPAN)};
  float d = range * t;
  float lateral = (hash11(aIndex * 3.77) - 0.5) * d * (${glslFloat(LATERAL_BASE)} + ${glslFloat(LATERAL_SCATTER)} * uScatter);

  float x = x0 + d * tan(ang) + lateral;
  float y = SURFACE_Y - d;

  vDepth = clamp(d / DEPTH_SPAN, 0.0, 1.0);
  vAlpha = mix(0.85, 0.35, anim) * (0.35 + 0.65 * t);
  gl_PointSize = uPointSize * mix(0.8, 1.5, uEnergy);
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * 입자 프래그먼트 셰이더 설명 3줄:
 * 1) gl_PointCoord 로 사각 스프라이트를 둥근 점으로 깎는다.
 * 2) 깊이에 따라 색을 청록 → 자홍으로 옮겨 얕은 이온과 깊은 이온을 구분한다.
 * 3) 가산 합성으로 그려 겹칠수록 밝아지게 해 농도가 높은 구간이 저절로 드러나게 한다.
 */
export const ION_PARTICLE_FS = `#version 300 es
precision highp float;
in float vAlpha;
in float vDepth;
out vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float falloff = 1.0 - r;
  vec3 col = mix(vec3(0.35, 0.95, 0.95), vec3(1.0, 0.45, 0.75), vDepth);
  fragColor = vec4(col * vAlpha * falloff, vAlpha * falloff);
}
`;

/**
 * 프로파일 셰이더 설명 3줄:
 * 1) 정점 t(0~1)를 깊이로 바꾸고 가우시안 농도를 계산해 오른쪽 패널의 가로 위치로 쓴다.
 * 2) side(±1)로 곡선을 좌우로 벌려 삼각형 스트립 리본을 만든다(lineWidth 의존 제거).
 * 3) 봉우리 위치는 에너지, 폭은 산란, 진폭은 도즈에 반응한다.
 */
export const ION_PROFILE_VS = `#version 300 es
layout(location = 0) in vec2 aTS;
uniform float uEnergy;
uniform float uDose;
uniform float uScatter;
out float vConc;

const float SURFACE_Y = ${glslFloat(SURFACE_Y)};
const float DEPTH_SPAN = ${glslFloat(DEPTH_SPAN)};
const float PANEL_R0 = ${glslFloat(PANEL_R0)};
const float PANEL_W = ${glslFloat(PANEL_W)};

void main() {
  float t = aTS.x;
  float side = aTS.y;
  float depth = t * DEPTH_SPAN;
  float rp = uEnergy * DEPTH_SPAN * ${glslFloat(RANGE_FRAC)};
  float sigma = DEPTH_SPAN * (${glslFloat(SIGMA_BASE)} + ${glslFloat(SIGMA_SCATTER)} * uScatter + ${glslFloat(SIGMA_ENERGY)} * uEnergy);
  float z = (depth - rp) / max(sigma, 1e-4);
  float conc = exp(-0.5 * z * z) * (${glslFloat(CONC_FLOOR)} + ${glslFloat(CONC_GAIN)} * uDose);
  vConc = conc;
  float x = PANEL_R0 + conc * PANEL_W + side * 0.0035;
  float y = SURFACE_Y - depth;
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const ION_PROFILE_FS = `#version 300 es
precision highp float;
in float vConc;
out vec4 fragColor;
/* 🔴 배경 FS 와 **다른 프로그램**이다 — 색 유니폼을 여기에도 따로 달아 매 draw 마다 올린다. */
uniform vec3 uS1;
uniform vec3 uS2;
void main() {
  vec3 col = mix(uS1, uS2, vConc);
  fragColor = vec4(col, 0.95);
}
`;

/**
 * 색 유니폼 로케이션 — **프로그램마다 따로 잡는다.**
 * (배경 FS 와 프로파일 FS 는 별개 프로그램이라 로케이션이 공유되지 않는다.)
 */
interface ColorUniforms {
  bgBg: WebGLUniformLocation | null;
  bgInk: WebGLUniformLocation | null;
  bgInfo: WebGLUniformLocation | null;
  profS1: WebGLUniformLocation | null;
  profS2: WebGLUniformLocation | null;
}

function set3(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null, v: Rgb3 | undefined, fallback: Rgb3): void {
  if (!loc) return;
  const c = v ?? fallback;
  gl.uniform3f(loc, c[0], c[1], c[2]);
}

function makeParticleData(count: number): Float32Array {
  // [seedX, seedY, index01] * count — 결정적 난수(같은 화면이 재현된다)
  const data = new Float32Array(count * 3);
  let s = 0x2f6e2b1;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    data[i * 3] = rnd();
    data[i * 3 + 1] = rnd();
    data[i * 3 + 2] = i / count;
  }
  return data;
}

function makeProfileData(segments: number): Float32Array {
  const data = new Float32Array((segments + 1) * 2 * 2);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    data[i * 4] = t;
    data[i * 4 + 1] = -1;
    data[i * 4 + 2] = t;
    data[i * 4 + 3] = 1;
  }
  return data;
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let bgProg: WebGLProgram | null = null;
  let partProg: WebGLProgram | null = null;
  let profProg: WebGLProgram | null = null;
  let partVAO: WebGLVertexArrayObject | null = null;
  let partVBO: WebGLBuffer | null = null;
  let profVAO: WebGLVertexArrayObject | null = null;
  let profVBO: WebGLBuffer | null = null;
  let tex: TextureSet | null = null;
  let cu: ColorUniforms | null = null;
  const p = { energy: 0.5, dose: 0.6, tilt: 0.5, scatter: 0.3 };

  return {
    id: 'ionTrajectory',
    animated: true,
    init(glc) {
      ctx = glc;
      const gl = glc.gl;
      bgProg = glc.program('ion.bg', FULLSCREEN_VS, ION_BG_FS);
      partProg = glc.program('ion.particle', ION_PARTICLE_VS, ION_PARTICLE_FS);
      profProg = glc.program('ion.profile', ION_PROFILE_VS, ION_PROFILE_FS);
      cu = {
        bgBg: glc.uniform(bgProg, 'uBg'),
        bgInk: glc.uniform(bgProg, 'uInk'),
        bgInfo: glc.uniform(bgProg, 'uInfo'),
        profS1: glc.uniform(profProg, 'uS1'),
        profS2: glc.uniform(profProg, 'uS2'),
      };
      // 비동기 로드다. 도착 전에는 평균 알베도 1×1 이 바인딩돼 있어 기판이 비지 않는다.
      // 이 씬은 animated: true 라 도착한 다음 프레임에서 무늬가 저절로 나타난다.
      tex = acquireTextures(glc, ['silicon-surface']);

      partVAO = gl.createVertexArray();
      partVBO = gl.createBuffer();
      if (!partVAO || !partVBO) throw new Error('ionTrajectory: 입자 버퍼 생성 실패');
      gl.bindVertexArray(partVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, partVBO);
      gl.bufferData(gl.ARRAY_BUFFER, makeParticleData(PARTICLE_COUNT), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      gl.bindVertexArray(null);

      profVAO = gl.createVertexArray();
      profVBO = gl.createBuffer();
      if (!profVAO || !profVBO) throw new Error('ionTrajectory: 프로파일 버퍼 생성 실패');
      gl.bindVertexArray(profVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, profVBO);
      gl.bufferData(gl.ARRAY_BUFFER, makeProfileData(PROFILE_SEGMENTS), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    },
    update(params: SceneParams) {
      p.energy = pick(params, 'energy', p.energy);
      p.dose = pick(params, 'dose', p.dose);
      p.tilt = pick(params, 'tilt', p.tilt);
      p.scatter = pick(params, 'scatter', p.scatter);
    },
    draw(t) {
      if (!ctx || !bgProg || !partProg || !profProg) return;
      const gl = ctx.gl;
      clear(gl);

      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      //    프로그램이 셋이라 useProgram 뒤에 각각 올린다.
      const pal = readVizPalette(ctx.canvas);

      // 1) 배경 단면 + 축
      gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      if (cu) {
        set3(gl, cu.bgBg, pal.bg, pal.bg);
        set3(gl, cu.bgInk, pal.ink, pal.ink);
        set3(gl, cu.bgInfo, pal.info, pal.ink);
      }
      setCommonUniforms(gl, ctx.uniform(bgProg, 'uRes'), ctx.uniform(bgProg, 'uTime'), ctx.size.width, ctx.size.height, t);
      const bgE = ctx.uniform(bgProg, 'uEnergy');
      if (bgE) gl.uniform1f(bgE, p.energy);
      if (tex) tex.bind(TEX_SUBSTRATE, 'silicon-surface');
      const bgTex = ctx.uniform(bgProg, 'uSubstrateTex');
      if (bgTex) gl.uniform1i(bgTex, TEX_SUBSTRATE);
      ctx.drawFullscreen();

      // 2) 프로파일 곡선(리본)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(profProg);
      if (cu) {
        set3(gl, cu.profS1, pal.series[0], pal.ink);
        set3(gl, cu.profS2, pal.series[1], pal.ink);
      }
      const pe = ctx.uniform(profProg, 'uEnergy');
      const pd = ctx.uniform(profProg, 'uDose');
      const ps = ctx.uniform(profProg, 'uScatter');
      if (pe) gl.uniform1f(pe, p.energy);
      if (pd) gl.uniform1f(pd, p.dose);
      if (ps) gl.uniform1f(ps, p.scatter);
      if (profVAO) {
        gl.bindVertexArray(profVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, (PROFILE_SEGMENTS + 1) * 2);
        gl.bindVertexArray(null);
      }

      // 3) 이온 점 스프라이트(가산 합성 — 겹칠수록 밝다)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(partProg);
      const uTimeLoc = ctx.uniform(partProg, 'uTime');
      if (uTimeLoc) gl.uniform1f(uTimeLoc, t);
      const ue = ctx.uniform(partProg, 'uEnergy');
      const ud = ctx.uniform(partProg, 'uDose');
      const ut = ctx.uniform(partProg, 'uTilt');
      const us = ctx.uniform(partProg, 'uScatter');
      const upz = ctx.uniform(partProg, 'uPointSize');
      if (ue) gl.uniform1f(ue, p.energy);
      if (ud) gl.uniform1f(ud, p.dose);
      if (ut) gl.uniform1f(ut, p.tilt);
      if (us) gl.uniform1f(us, p.scatter);
      if (upz) gl.uniform1f(upz, 2.2 * ctx.size.dpr);
      if (partVAO) {
        gl.bindVertexArray(partVAO);
        gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
        gl.bindVertexArray(null);
      }
      gl.disable(gl.BLEND);
    },
    dispose() {
      if (tex) tex.release();
      tex = null;
      if (ctx && !ctx.lost) {
        const gl = ctx.gl;
        if (partVAO) gl.deleteVertexArray(partVAO);
        if (partVBO) gl.deleteBuffer(partVBO);
        if (profVAO) gl.deleteVertexArray(profVAO);
        if (profVBO) gl.deleteBuffer(profVBO);
      }
      ctx = null;
      cu = null;
      bgProg = null;
      partProg = null;
      profProg = null;
      partVAO = null;
      partVBO = null;
      profVAO = null;
      profVBO = null;
    },
  };
}
