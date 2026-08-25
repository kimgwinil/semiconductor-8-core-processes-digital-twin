/**
 * 씬: CMP 연마 단면 — 패드/웨이퍼 접촉과 제거 프로파일(**디싱만**. 에로전은 정본이 금지했다).
 * 반응 파라미터(전부 0~1 정규화):
 *   pressure  하중 → 제거량 증가 + 패드 압입(접촉면이 눌린다)
 *   speed     상대속도 → 제거량 증가 + 패드 무늬 이송 속도
 *   time      연마 시간 → 제거량 누적(세 값의 곱이 총 제거량이다)
 *   slurry    슬러리 공급 → 접촉면 입자 밀도와 표면 스크래치 표현
 * 제거량 = pressure * speed * time (Preston 형태의 **시각 매핑**일 뿐, 물리 상수는 없다).
 *
 * 🔴 호출하는 랩이 `time` 에 **연마 소요시간**을 넣으면 안 된다 — 소요시간은 MRR ∝ P·V 의 역수여서
 *    곱하는 순간 P·V 가 상쇄되고 하중·회전수가 화면에서 사라진다. `time` 은 **고정된 사이클 예산**을
 *    넣어야 Preston 등가성(하중 2배 ≡ 속도 2배)이 화면에 남는다. (metal 랩 2026-08-21 정정)
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { ALBEDO_GLSL, acquireTextures, texMeanGLSL, type TextureSet } from '../textures';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, pick, setCommonUniforms, clear } from './common';
import { readVizPalette, type Rgb3 } from './theme';
import {
  BASE_TOP,
  DENSE_EDGES,
  DENSE_STRIPE_FREQ,
  DEPTH_DISH,
  DEPTH_FLAT,
  DEPTH_MAX,
  PAD_GAP_AT_MAX,
  PAD_GAP_AT_MIN,
  SUB_TOP,
  TRENCH_BOT,
  WIDE_EDGES,
} from './models/polishProfile.model';

/**
 * 🔴 **깊이 상수와 프로파일 식은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/polishProfile.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *    (2026-08-21 이전에는 폴백이 두 번째 사본을 들고 옛 깊이 0.10/0.075/0.045 와
 *     클램프 없는 식을 쓰고 있었다 — 같은 조건에서 하강이 정확히 절반이었다.)
 *
 * 🔴 재수출 — 다른 곳이 프로파일 식을 필요로 하면 여기가 아니라 모델 모듈에서 가져간다.
 */
export {
  BASE_TOP, DEPTH_DISH, DEPTH_FLAT, DEPTH_MAX, SUB_TOP, TRENCH_BOT,
  denseZone, metalAt, padGap, polishDepth, polishRemoval, polishSurface, wideZone,
} from './models/polishProfile.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * 재질 알베도 텍스처(설계서 §6-5) — 이 씬에서 텍스처를 받는 재질은 **연마 패드** 하나다.
 * 텍스처 유닛 번호는 셰이더의 샘플러 유니폼과 1:1 로 맞춘다.
 *
 * 🔴 배선처 근거: 이 씬은 이미 `inPad`/`padCol` 로 **패드 지오메트리를 그리고 있었고**,
 *    그 표면 무늬만 절차적 fbm 이었다. `slurry-pad` 자산은 「다공질 폴리우레탄 패드 표면 알베도」
 *    (`public/assets/tex/PROVENANCE.md` §1)이므로 **지오메트리를 새로 만들지 않고** 그 fbm 자리를
 *    그대로 대체한다. 웨이퍼 적층·제거 프로파일·슬러리 입자는 전혀 건드리지 않는다.
 */
const TEX_PAD = 0;

/**
 * 셰이더 설명 3줄:
 * 1) 아래쪽에 산화막 + 금속이 채워진 패턴 웨이퍼를, 위쪽에 이송하는 연마 패드를 그린다.
 * 2) 표면 높이 surf(x) 를 제거량으로 낮추되 넓은 금속 패드 위는 더 파인다(디싱).
 *    🔴 **조밀 패턴 구간의 광역 침하(에로전)는 그리지 않는다** — 정본이 두 번 금지했다
 *    (`12_시각화씬_공백보고.md` §4-3 공백 4 · `씬명세/scene_stepCoverage.md` §5).
 *    그래서 조밀 구간과 평탄부의 대비는 디싱만 남는다 — **허전한 것이 틀린 것보다 낫다.**
 * 3) 초기 표면선을 점선으로 남겨 제거 전/후 차이를 눈으로 비교할 수 있게 한다.
 *
 * 🔴 패드 표면은 절차적 fbm 이 아니라 **알베도 텍스처**다(§6-5). 자산에는 색조가 아니라
 *    무늬만 들어 있으므로(textures.ts 참조) 평균 알베도로 나눠 무늬 배율만 뽑아 패드 색에 곱한다.
 *    홈(groove)·이송 속도·슬러리 입자·제거 프로파일은 종전 그대로다.
 */
export const POLISH_FS = `${FRAG_HEAD}
uniform float uPressure;
uniform float uSpeed;
uniform float uTimeP;
uniform float uSlurry;
uniform sampler2D uPadTex;
uniform vec3 uBg;    // 페이지 바탕(--bg) — 씬이 전면을 불투명하게 덮을 때의 베이스
uniform vec3 uInfo;  // 참고선(--viz-info) — 연마 전 초기 표면 점선
${NOISE_GLSL}
${DRAW_GLSL}
${ALBEDO_GLSL}

/* 🔴 아래 상수는 전부 models/polishProfile.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다. */
const float BASE_TOP = ${glslFloat(BASE_TOP)};   // 연마 전 표면(화면 배치값)
const float TRENCH_BOT = ${glslFloat(TRENCH_BOT)}; // 금속이 채워진 트렌치 바닥
const float SUB_TOP = ${glslFloat(SUB_TOP)};    // 기판 상면

const float DEPTH_FLAT = ${glslFloat(DEPTH_FLAT)};    // 전면 제거
const float DEPTH_DISH = ${glslFloat(DEPTH_DISH)};    // 디싱 — 넓은 금속 위 추가 하강
// 🔴 에로전 상수는 없다 — 정본이 두 번 「그리지 마라」고 했다(models/polishProfile.model.ts 참조).
const float DEPTH_MAX = ${glslFloat(Number(DEPTH_MAX.toFixed(6)))};     // 표시 한계 = BASE_TOP - TRENCH_BOT

// 알베도 UV 배율 — 화면에 타일이 몇 장 들어오는가. **화면 배치값이며 물리 상수가 아니다.**
const float PAD_TEX_UV = 3.2;
// 텍스처 평균 알베도(textures.ts 실측). 무늬 배율을 뽑는 나눗셈 기준이다.
const vec3 MEAN_PAD = ${texMeanGLSL('slurry-pad')};
// 🔴 종전 절차적 표현 0.75 + 0.35 * fbm() 의 **평균 밝기**(fbm 평균 0.5 → 0.925).
//    albedoDetail 은 평균이 1.0 이므로, 이 계수를 곱해야 패드가 종전과 같은 밝기로 남는다.
//    (색 설계를 바꾸지 않는다 — 자산은 무늬만 얹는다.)
const float PAD_PROC_MEAN = 0.925;

float removal() {
  return clamp(uPressure * uSpeed * uTimeP, 0.0, 1.0);
}

// 조밀 패턴 영역(좌) / 넓은 금속 영역(우)
float denseZone(float x) { return smoothstep(${glslFloat(DENSE_EDGES[0])}, ${glslFloat(DENSE_EDGES[1])}, x) * smoothstep(${glslFloat(DENSE_EDGES[2])}, ${glslFloat(DENSE_EDGES[3])}, x); }
float wideZone(float x)  { return smoothstep(${glslFloat(WIDE_EDGES[0])}, ${glslFloat(WIDE_EDGES[1])}, x) * smoothstep(${glslFloat(WIDE_EDGES[2])}, ${glslFloat(WIDE_EDGES[3])}, x); }

// 금속이 존재하는 가로 위치
float metalAt(float x) {
  float dense = denseZone(x) * step(0.5, fract(x * ${glslFloat(DENSE_STRIPE_FREQ)}));
  return clamp(dense + wideZone(x), 0.0, 1.0);
}

// 연마 후 표면 높이
float surf(float x) {
  float r = removal();
  float d = r * DEPTH_FLAT;                        // 전면 제거
  d += wideZone(x) * r * DEPTH_DISH * metalAt(x);  // 디싱: 넓은 금속이 더 깊게 파인다
  // 🔴 에로전 항 없음 — 조밀 구간은 전면 제거만 받는다(정본 금지).
  d = min(d, DEPTH_MAX);                           // 표시 한계에서 멈춘다
  float h = BASE_TOP - d;
  h -= (fbm(vec2(x * 60.0, 1.7)) - 0.5) * 0.004;   // 미세 요철
  return h;
}

void main() {
  vec2 uv = vUv;
  float h = surf(uv.x);
  float m = metalAt(uv.x);

  vec3 oxide = vec3(0.32, 0.44, 0.58);
  vec3 metalCol = vec3(0.85, 0.55, 0.30);
  vec3 substrate = vec3(0.22, 0.24, 0.28);
  vec3 padCol = vec3(0.30, 0.26, 0.34);

  vec3 col = uBg;   // 🔴 전면 베이스는 페이지 바탕 토큰이다(종전 air 리터럴을 대체한다)

  // 웨이퍼 적층
  float inWafer = step(uv.y, h);
  float inTrench = bandMask(uv.y, TRENCH_BOT, h);
  vec3 layer = mix(oxide, metalCol, m * inTrench);
  col = mix(col, layer, inWafer);
  col = mix(col, substrate, step(uv.y, SUB_TOP));

  // 표면선 + 연마 전 초기 표면(점선)
  col += vec3(1.0) * lineMask(uv.y - h, 0.0016) * 0.75;
  float dash = step(0.5, fract(uv.x * 70.0));
  // 🔴 가산이 아니라 mix 다 — 라이트 테마에서 참고선 색이 어두워지면 가산으로는 선이 사라진다.
  col = mix(col, uInfo, clamp(lineMask(uv.y - BASE_TOP, 0.0014) * dash * 0.7, 0.0, 1.0));

  // 연마 패드 — 표면을 따라 내려앉고, 하중이 클수록 더 눌린다
  float gap = mix(${glslFloat(PAD_GAP_AT_MIN)}, ${glslFloat(PAD_GAP_AT_MAX)}, uPressure);
  float padBottom = h + gap;
  float inPad = step(padBottom, uv.y) * step(uv.y, padBottom + 0.20);
  float grooves = lineMask(fract((uv.x + uTime * (0.05 + 0.45 * uSpeed)) * 11.0) - 0.5, 0.09);
  // 패드 표면 UV — 홈과 **같은 이송량**으로 흘려야 무늬와 홈이 따로 놀지 않는다.
  // 가로는 화면비로 환산한다(캔버스가 옆으로 길어져도 무늬가 늘어나지 않게).
  vec2 padUv = vec2((uv.x + uTime * (0.05 + 0.45 * uSpeed)) * (uRes.x / max(uRes.y, 1.0)), uv.y);
  vec3 pad = padCol * PAD_PROC_MEAN * albedoDetail(texture(uPadTex, padUv * PAD_TEX_UV).rgb, MEAN_PAD);
  col = mix(col, pad, inPad);
  col = mix(col, padCol * 0.5, inPad * grooves * 0.8);

  // 슬러리: 패드-웨이퍼 사이 입자
  float slurryBand = bandMask(uv.y, h, padBottom);
  float particles = step(1.0 - 0.35 * uSlurry, hash12(floor(vec2(uv.x * 300.0 + uTime * 30.0 * uSpeed, uv.y * 300.0))));
  col += vec3(0.85, 0.95, 1.0) * particles * slurryBand * 0.9;
  col += vec3(0.30, 0.55, 0.70) * slurryBand * uSlurry * 0.25;

  fragColor = vec4(col, 1.0);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  pressure: WebGLUniformLocation | null;
  speed: WebGLUniformLocation | null;
  timeP: WebGLUniformLocation | null;
  slurry: WebGLUniformLocation | null;
  padTex: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
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
  let tex: TextureSet | null = null;
  const p = { pressure: 0.5, speed: 0.5, time: 0.4, slurry: 0.5 };

  return {
    id: 'polishProfile',
    animated: true, // 패드가 이송된다
    init(gl) {
      ctx = gl;
      prog = gl.program('polishProfile', FULLSCREEN_VS, POLISH_FS);
      // 비동기 로드다. 도착 전에는 평균 알베도 1×1 이 바인딩돼 있어 패드가 비지 않는다.
      // 이 씬은 animated: true 라 도착한 다음 프레임에서 무늬가 저절로 나타난다.
      tex = acquireTextures(gl, ['slurry-pad']);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        pressure: gl.uniform(prog, 'uPressure'),
        speed: gl.uniform(prog, 'uSpeed'),
        timeP: gl.uniform(prog, 'uTimeP'),
        slurry: gl.uniform(prog, 'uSlurry'),
        padTex: gl.uniform(prog, 'uPadTex'),
        bg: gl.uniform(prog, 'uBg'),
        info: gl.uniform(prog, 'uInfo'),
      };
    },
    update(params: SceneParams) {
      p.pressure = pick(params, 'pressure', p.pressure);
      p.speed = pick(params, 'speed', p.speed);
      p.time = pick(params, 'time', p.time);
      p.slurry = pick(params, 'slurry', p.slurry);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);
      if (u.pressure) gl.uniform1f(u.pressure, p.pressure);
      if (u.speed) gl.uniform1f(u.speed, p.speed);
      if (u.timeP) gl.uniform1f(u.timeP, p.time);
      if (u.slurry) gl.uniform1f(u.slurry, p.slurry);
      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      const pal = readVizPalette(ctx.canvas);
      set3(gl, u.bg, pal.bg, pal.bg);
      set3(gl, u.info, pal.info, pal.ink);
      if (tex) tex.bind(TEX_PAD, 'slurry-pad');
      if (u.padTex) gl.uniform1i(u.padTex, TEX_PAD);
      ctx.drawFullscreen();
    },
    dispose() {
      if (tex) tex.release();
      tex = null;
      ctx = null;
      prog = null;
      u = null;
    },
  };
}
