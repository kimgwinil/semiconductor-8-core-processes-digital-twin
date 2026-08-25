/**
 * 씬: 플라즈마 챔버 단면 (식각·PECVD).
 * 반응 파라미터(전부 0~1 정규화):
 *   power     소스(ICP) 전력 → 전자밀도 n_e → 벌크 플라즈마 휘도·요동 세기 + 시스가 **얇아진다**
 *   pressure  압력    → 시스(sheath) 두께(높을수록 얇아진다) + 발광 영역이 촘촘해진다
 *   bias      바이어스→ 시스 두께(높을수록 **두꺼워진다**) + 이온 플럭스 화살표의 속도·밝기
 *   flow      가스 유량→ 상단 샤워헤드에서 내려오는 가스 줄기 밀도
 *
 * 🔴 **시스·발광 식과 상수는 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/plasma.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *    (2026-08-21 이전에는 폴백이 세 번째 사본을 들고 전력 부호가 반대였다.)
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { ALBEDO_GLSL, acquireTextures, texMeanGLSL, type TextureSet } from '../textures';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, pick, setCommonUniforms, clear } from './common';
import { readVizPalette, type Rgb3 } from './theme';
import {
  GLOW_FLOOR,
  PLASMA_GEOMETRY,
  SHEATH_BASE_UV,
  SHEATH_BIAS_EXP,
  SHEATH_BIAS_FLOOR,
  SHEATH_BIAS_GAIN,
  SHEATH_NE_AT_MIN_POWER,
  SHEATH_NE_EXP,
  SHEATH_PRESSURE_AT_MAX,
  SHEATH_PRESSURE_AT_MIN,
} from './models/plasma.model';

/**
 * 🔴 재수출 — 기존 import 경로(`@/viz/gl/scenes/plasma`)를 쓰던 테스트·호출부가 그대로 돈다.
 *    새 코드는 `models/plasma.model` 에서 직접 가져오는 편이 낫다(셰이더가 딸려오지 않는다).
 */
export { PLASMA_GEOMETRY, plasmaGlowGain, sheathThickness } from './models/plasma.model';
export type { SheathParams } from './models/plasma.model';

const { WAFER_Y, SUSCEPTOR_Y, SHOWER_Y } = PLASMA_GEOMETRY;

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * 재질 알베도 텍스처(설계서 §6-5) — 이 씬에서 텍스처를 받는 재질은 **레지스트 마스크** 하나다.
 * 텍스처 유닛 번호는 셰이더의 샘플러 유니폼과 1:1 로 맞춘다.
 *
 * 🔴 **배선처 근거와, 새로 그린 것에 대한 고지(둘 다 남긴다).**
 *    ① 이 `plasma` 씬 id 를 쓰는 랩은 **`src/models/labs/etch.ts` 뿐이다**(전수 grep — 기초 L403 ·
 *       응용 L577). 즉 화면상 이 단면은 **식각 챔버**이고, 식각은 정의상 **마스크를 통해** 진행된다.
 *    ② 그런데 종전 셰이더에는 **레지스트 지오메트리가 없었다.** 웨이퍼(`bandMask(uv.y, SUSCEPTOR_Y,
 *       WAFER_Y)`) 상면이 맨살이었고, 이온 플럭스 화살표가 그 맨살에 그대로 내리꽂혔다 —
 *       「어디는 깎이고 어디는 안 깎이는가」가 화면에서 통째로 빠져 있었다.
 *    ③ 그래서 **웨이퍼 상면에 라인/스페이스 마스크 층을 새로 그린다.** 개구 수는 이미 그려지던
 *       이온 화살표 열 수(9)와 같게 맞춰 **개구 자리에 화살표가 들어가도록** 정렬했다.
 *    🔴 **이 마스크는 정지 조형물이다** — 서셉터·샤워헤드·웨이퍼와 같은 급이며, 파라미터에
 *       반응하지 않고 물리량을 주장하지 않는다. 식각 깊이·선폭·언더컷은 **그리지 않는다**
 *       (그 형상은 미구현 씬 `etchProfile` 의 몫이다 · 12_시각화씬_공백보고 §5).
 *       모델 모듈(`models/plasma.model.ts`)에 상수를 넣지 않는 이유도 같다 — 계산 정본이 아니다.
 */
const TEX_RESIST = 0;

/**
 * 셰이더 설명 3줄:
 * 1) 상부 전극(샤워헤드)과 하부 서셉터 사이를 챔버 내부로 보고, 그 사이를 플라즈마 휘도장으로 채운다.
 * 2) 두 전극 표면에는 발광이 꺼지는 어두운 시스 층을 두께 파라미터만큼 깔고 시스 경계선을 긋는다.
 * 3) 하부 시스 구간에 아래로 내려가는 이온 플럭스 화살표를 반복 배치해 바이어스에 따라 흐르게 한다.
 *
 * 🔴 웨이퍼 상면의 레지스트 마스크 표면은 절차적 노이즈가 아니라 **알베도 텍스처**다(§6-5).
 *    자산에는 색조가 아니라 무늬만 들어 있으므로(textures.ts 참조) 평균 알베도로 나눠 무늬 배율만
 *    뽑아 재질 색에 곱한다. 시스·발광·화살표는 전부 종전 그대로다.
 */
export const PLASMA_FS = `${FRAG_HEAD}
uniform float uPower;
uniform float uPressure;
uniform float uBias;
uniform float uFlow;
uniform sampler2D uResistTex;
uniform vec3 uBg;    // 페이지 바탕(--bg) — 씬이 전면을 불투명하게 덮을 때의 베이스
uniform vec3 uInk;   // 본문·선(--ink) — 챔버 벽 라인
${NOISE_GLSL}
${DRAW_GLSL}
${ALBEDO_GLSL}

const float WAFER_Y = ${glslFloat(WAFER_Y)};      // 웨이퍼 상면
const float SUSCEPTOR_Y = ${glslFloat(SUSCEPTOR_Y)};
const float SHOWER_Y = ${glslFloat(SHOWER_Y)};     // 상부 전극 하면

// 레지스트 마스크 — 전부 **화면 배치값**이며 물리 상수가 아니다(설계서 §8).
const float RESIST_H = 0.030;     // 마스크 두께(UV). 웨이퍼 상면 위로 이만큼 올라간다
const float RESIST_COLS = 9.0;    // 개구 주기 — 이온 화살표 열 수(cols)와 같게 맞춘다
const float RESIST_OPEN = 0.27;   // 개구 반폭(주기 기준). 0.5 면 마스크가 사라진다
const float RESIST_TEX_UV = 2.6;  // 알베도 UV 배율 — 화면에 타일이 몇 장 들어오는가
// 텍스처 평균 알베도(textures.ts 실측). 무늬 배율을 뽑는 나눗셈 기준이다.
const vec3 MEAN_RESIST = ${texMeanGLSL('photoresist')};
// 재질 색 — 명세 §6-5 의 --xs-resist (#f0abfc) 색상을 챔버 조명 아래 밝기로 낮춘 값이다.
// 벌크 플라즈마(자홍)와 구분되도록 채도를 낮췄다. 화면 배치값이다.
const vec3 RESIST_COLOR = vec3(0.56, 0.40, 0.59);

// 시스 두께 — TS sheathThickness() 와 같은 식이다(상수는 위 상수 블록에서 주입).
//    s ∝ n_e^(-1/2) · V^(3/4) : 압력↑·전력↑ → 얇아지고, 바이어스↑ → 두꺼워진다.
//    진폭 상수는 전부 화면 배치값이며 물리 상수가 아니다.
float sheath() {
  float pr = clamp(uPressure, 0.0, 1.0);
  float pw = clamp(uPower, 0.0, 1.0);
  float bi = clamp(uBias, 0.0, 1.0);
  float ne = mix(${glslFloat(SHEATH_NE_AT_MIN_POWER)}, 1.0, pw);
  return ${glslFloat(SHEATH_BASE_UV)}
    * mix(${glslFloat(SHEATH_PRESSURE_AT_MIN)}, ${glslFloat(SHEATH_PRESSURE_AT_MAX)}, pr)
    * pow(ne, ${glslFloat(SHEATH_NE_EXP)})
    * (${glslFloat(SHEATH_BIAS_FLOOR)} + ${glslFloat(SHEATH_BIAS_GAIN)} * pow(bi, ${glslFloat(SHEATH_BIAS_EXP)}));
}

// 벌크 발광 배율 — TS plasmaGlowGain() 과 같은 식. 전력 하한에서도 0 이 아니다.
float glowGain() {
  return ${glslFloat(GLOW_FLOOR)} + ${glslFloat(1 - GLOW_FLOOR)} * clamp(uPower, 0.0, 1.0);
}

// 아래로 향하는 화살표 글리프. c = (가로 오프셋, 진행 0~1)
float arrow(vec2 c) {
  float shaft = bandMask(c.y, 0.18, 0.92) * lineMask(c.x, 0.010);
  float head = bandMask(c.y, 0.0, 0.20) * step(abs(c.x), c.y * 0.30);
  return clamp(shaft + head, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  float sh = sheath();
  float lowSheath = WAFER_Y + sh;
  float upSheath = SHOWER_Y - sh;

  vec3 wall = vec3(0.09, 0.10, 0.13);
  vec3 metalPart = vec3(0.26, 0.28, 0.33);
  vec3 col = uBg;   // 🔴 전면 베이스는 페이지 바탕 토큰이다(wall 은 샤워헤드 구멍이 계속 쓴다)

  // 챔버 내부(전극 사이)
  float inside = bandMask(uv.y, SUSCEPTOR_Y, SHOWER_Y) * bandMask(uv.x, 0.06, 0.94);

  // 벌크 플라즈마 휘도 — 시스 바깥에서만 발광
  float bulk = smoothstep(lowSheath, lowSheath + 0.06, uv.y) * smoothstep(upSheath, upSheath - 0.06, uv.y);
  float flicker = fbm(vec2(uv.x * 6.0 + uTime * 0.35, uv.y * 6.0 - uTime * 0.22));
  float density = mix(3.0, 9.0, uPressure);
  float grain = fbm(vec2(uv.x * density, uv.y * density + uTime * 0.5));
  // 🔴 uPower 를 그대로 곱하면 슬라이더 하한(P_s = 200 W)에서 챔버가 완전히 꺼진다.
  //    모델은 그 지점에서도 식각이 진행 중이라고 표시하므로 하한을 둔다(glowGain).
  float glow = bulk * inside * glowGain() * (0.55 + 0.55 * flicker) * (0.7 + 0.5 * grain);
  vec3 plasmaCol = mix(vec3(0.55, 0.25, 0.85), vec3(1.0, 0.55, 0.85), uPower);
  // 🔴 가산이 아니라 알파 합성이다. 바탕이 거의 검을 때 base + C*k*m 과 mix(base, C*k, m) 은
  //    m=1 에서 같은 값이고 그 사이도 base*(1-m) 만큼만 다르다 — 즉 **다크 테마는 사실상 그대로**다.
  //    반면 바탕이 밝아지면(라이트) 가산은 1.0 으로 포화해 **챔버가 통째로 백색이 된다**
  //    (2026-08-22 실측: 라이트 luma 216.5 · 그림이 사라졌다). 그래서 합성만 바꾼다.
  col = mix(col, plasmaCol * 1.25, clamp(glow, 0.0, 1.0));

  // 시스 경계선
  float sheathLine = lineMask(uv.y - lowSheath, 0.0016) + lineMask(uv.y - upSheath, 0.0016);
  col = mix(col, vec3(0.45, 0.85, 1.0), clamp(sheathLine * inside * (0.35 + 0.5 * uPower), 0.0, 1.0));

  // 가스 줄기(상부 샤워헤드 → 아래)
  float gx = fract(uv.x * 14.0) - 0.5;
  float gasBand = bandMask(uv.y, upSheath, SHOWER_Y);
  float gas = lineMask(gx, 0.035) * gasBand * uFlow * (0.4 + 0.6 * fract(uTime * 0.6 + uv.x * 3.0));
  col = mix(col, vec3(0.35, 0.75, 0.70) * 0.5, clamp(gas, 0.0, 1.0));

  // 이온 플럭스 화살표(하부 시스 → 웨이퍼)
  float cols = 9.0;
  float ax = fract(uv.x * cols) - 0.5;
  float travel = (uv.y - WAFER_Y) / max(sh, 1e-3);
  float speed = 0.25 + 1.25 * uBias;
  float ay = fract(travel * 1.6 - uTime * speed);
  float within = bandMask(uv.y, WAFER_Y, lowSheath) * bandMask(uv.x, 0.10, 0.90);
  float a = arrow(vec2(ax * 1.6, ay)) * within;
  col = mix(col, vec3(0.55, 0.95, 1.0) * (0.25 + 0.85 * uBias), clamp(a, 0.0, 1.0));

  // 전극·서셉터·웨이퍼
  float shower = bandMask(uv.y, SHOWER_Y, SHOWER_Y + 0.10) * bandMask(uv.x, 0.06, 0.94);
  float holes = lineMask(fract(uv.x * 14.0) - 0.5, 0.06) * shower;
  col = mix(col, metalPart, shower);
  col = mix(col, wall * 0.6, holes * 0.9);
  float susc = bandMask(uv.y, 0.10, SUSCEPTOR_Y) * bandMask(uv.x, 0.10, 0.90);
  col = mix(col, metalPart * 0.9, susc);
  float wafer = bandMask(uv.y, SUSCEPTOR_Y, WAFER_Y) * bandMask(uv.x, 0.14, 0.86);
  col = mix(col, vec3(0.62, 0.66, 0.72), wafer);

  // 레지스트 마스크 — 웨이퍼 상면의 라인/스페이스. **개구가 이온이 들어가는 자리**이고,
  // 마스크가 남은 자리는 화살표를 가린다(위 화살표를 덮어쓰므로 그 순서가 중요하다).
  // 🔴 texture() 는 분기 밖에서 한 번만 부른다 — 비균일 제어 흐름 안에서는 밉 미분값이 정의되지 않는다.
  vec2 rtuv = vec2(uv.x * (uRes.x / max(uRes.y, 1.0)), uv.y);
  vec3 resistCol = RESIST_COLOR * albedoDetail(texture(uResistTex, rtuv * RESIST_TEX_UV).rgb, MEAN_RESIST);
  float resistLine = step(RESIST_OPEN, abs(fract(uv.x * RESIST_COLS) - 0.5));
  float resist = bandMask(uv.y, WAFER_Y, WAFER_Y + RESIST_H) * bandMask(uv.x, 0.14, 0.86) * resistLine;
  col = mix(col, resistCol, resist);
  col = mix(col, vec3(0.90, 0.72, 0.95) * 0.45,
            clamp(lineMask(uv.y - (WAFER_Y + RESIST_H), 0.0014) * resistLine * bandMask(uv.x, 0.14, 0.86), 0.0, 1.0));

  // 챔버 벽 라인
  float wallLine = lineMask(uv.x - 0.06, 0.0018) + lineMask(uv.x - 0.94, 0.0018);
  // 🔴 가산이 아니라 mix 다 — 라이트 테마에서 잉크가 어두워지면 가산 합성으로는 선이 사라진다.
  col = mix(col, uInk, clamp(wallLine * bandMask(uv.y, 0.08, 0.96), 0.0, 1.0));

  fragColor = vec4(col, 1.0);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  power: WebGLUniformLocation | null;
  pressure: WebGLUniformLocation | null;
  bias: WebGLUniformLocation | null;
  flow: WebGLUniformLocation | null;
  resistTex: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
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
  const p = { power: 0.5, pressure: 0.4, bias: 0.35, flow: 0.5 };

  return {
    id: 'plasma',
    animated: true,
    init(gl) {
      ctx = gl;
      prog = gl.program('plasma', FULLSCREEN_VS, PLASMA_FS);
      // 비동기 로드다. 도착 전에는 평균 알베도 1×1 이 바인딩돼 있어 마스크가 비지 않는다.
      // 이 씬은 animated: true 라 도착한 다음 프레임에서 무늬가 저절로 나타난다.
      tex = acquireTextures(gl, ['photoresist']);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        power: gl.uniform(prog, 'uPower'),
        pressure: gl.uniform(prog, 'uPressure'),
        bias: gl.uniform(prog, 'uBias'),
        flow: gl.uniform(prog, 'uFlow'),
        resistTex: gl.uniform(prog, 'uResistTex'),
        bg: gl.uniform(prog, 'uBg'),
        ink: gl.uniform(prog, 'uInk'),
      };
    },
    update(params: SceneParams) {
      p.power = pick(params, 'power', p.power);
      p.pressure = pick(params, 'pressure', p.pressure);
      p.bias = pick(params, 'bias', p.bias);
      p.flow = pick(params, 'flow', p.flow);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);
      if (u.power) gl.uniform1f(u.power, p.power);
      if (u.pressure) gl.uniform1f(u.pressure, p.pressure);
      if (u.bias) gl.uniform1f(u.bias, p.bias);
      if (u.flow) gl.uniform1f(u.flow, p.flow);
      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      const pal = readVizPalette(ctx.canvas);
      set3(gl, u.bg, pal.bg, pal.bg);
      set3(gl, u.ink, pal.ink, pal.ink);
      if (tex) tex.bind(TEX_RESIST, 'photoresist');
      if (u.resistTex) gl.uniform1i(u.resistTex, TEX_RESIST);
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
