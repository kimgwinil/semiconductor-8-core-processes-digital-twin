/**
 * 씬: 박막 성장 단면 (산화·증착 공용).
 * 반응 파라미터(전부 0~1 정규화, 물리값 변환은 상위가 한다):
 *   thickness  두께 → 산화막이 **원표면 위로 융기하는 동시에 계면이 아래로 내려간다**
 *              (총 두께의 SI_CONSUMED_FRACTION 만큼은 먹힌 Si 다) + 두께 눈금의 마커가 따라 올라간다
 *   roughness  계면 거칠기 → 기판/박막 경계와 박막 표면의 요철 진폭
 *   tint       재질 색 → 산화막(청색) ↔ 금속막(황동색) 보간
 *   uniformity 균일도 → 낮을수록 좌우 두께 편차가 커진다(웨이퍼 내 불균일)
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { ALBEDO_GLSL, acquireTextures, texMeanGLSL, type TextureSet } from '../textures';
import { TEX_SUBSTRATE } from '../texUnits';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, pick, setCommonUniforms, clear } from './common';
import {
  FILM_MAX, ORIG_SURFACE, ROUGH_FILM, ROUGH_SUB, RULER_DIVISIONS, RULER_X,
  SI_CONSUMED_FRACTION, UNIFORMITY_DEV,
} from './models/filmGrowth.model';

/**
 * 🔴 **화면 배치값의 정본은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/filmGrowth.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *    (2026-08-21 이전 폴백은 기판 상면 0.28·막 높이 0.48·거칠기 0.035 라는 **다른 수**를 썼고,
 *     `uniformity` 항은 통째로 빠져 있었다 — 슬라이더가 그림을 전혀 못 움직였다.)
 */
export { filmGrowthModel } from './models/filmGrowth.model';
export type { FilmGrowthModel } from './models/filmGrowth.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * 재질 알베도 텍스처(설계서 §6-5) — 기판은 실리콘, 박막은 uTint 로 산화막↔금속막을 오간다.
 * 텍스처 유닛 번호는 셰이더의 샘플러 유니폼과 1:1 로 맞춘다.
 *
 * 🔴 바탕 유닛(`TEX_SUBSTRATE`)은 **여기서 선언하지 않는다** — 세 씬이 공유하므로 정본은
 *    `../texUnits` 다(예전엔 세 파일이 각자 `= 0` 을 들고 있었다: check-constants R1).
 *    아래 둘은 이 씬만 쓰는 **겹쳐 칠하는 막**의 자리라 씬 지역 상수로 남긴다.
 */
const TEX_OXIDE = 1;
const TEX_METAL = 2;

/**
 * 셰이더 설명 4줄:
 * 1) 화면 하단에 기판(실리콘)을 깔고, **산화 전 원표면(ORIG_SURFACE)** 을 기준선으로 잡는다.
 * 2) 두께 파라미터가 만든 산화막을 그 기준선 위아래로 나눠 배치한다 —
 *    `SI_CONSUMED` 만큼은 **원표면 아래로 파고들고**(먹힌 Si), 나머지는 위로 융기한다.
 *    그래서 두께를 올리면 **막 상면은 올라가고 기판 계면은 내려간다.**
 * 3) 기판/박막 경계선과 박막 표면선을 fbm 노이즈로 흔들어 계면 거칠기를 표현하고,
 *    박막 내부는 두께에 따른 간섭 줄무늬로 층이 자란 정도를 눈으로 읽히게 한다.
 * 4) 좌측 여백에 **계면에서 시작하는** 등간격 두께 눈금과 현재 두께 마커를 그리고,
 *    원표면 자리에 파선 기준선을 남긴다(수치 텍스트는 DOM 담당).
 *
 * 🔴 **`SI_CONSUMED` 는 이 씬이 만든 계수가 아니다.** Deal–Grove 물리층의 `SI_CONSUMPTION_RATIO`
 *    (S121)를 `models/filmGrowth.model.ts` 가 받아 오고 여기는 주입만 한다 — 랩이 화면 옆에
 *    띄우는 `siConsumedNm`·`surfaceRiseNm` 과 **같은 상수에서 나온다.**
 *
 * 🔴 재질 표면은 절차적 fbm 이 아니라 **알베도 텍스처**다(§6-5). 자산에는 색조가 아니라
 *    무늬만 들어 있으므로(textures.ts 참조) 평균 알베도로 나눠 무늬 배율만 뽑아 재질 색에 곱한다.
 *    조명·경계선·눈금·비네팅은 종전 그대로 그 위에 얹는다 — 화면 구성은 바뀌지 않는다.
 */
export const FILM_GROWTH_FS = `${FRAG_HEAD}
uniform float uThickness;
uniform float uRoughness;
uniform float uTint;
uniform float uUniformity;
/* 🔴 테마 잉크색(0~1). 캔버스의 CSS color 실측값이다 — Canvas2D 폴백 palette() 와 **같은 출처**다. */
uniform vec3 uInk;
uniform sampler2D uSubstrateTex;
uniform sampler2D uOxideTex;
uniform sampler2D uMetalTex;
${NOISE_GLSL}
${DRAW_GLSL}
${ALBEDO_GLSL}

/* 🔴 아래 배치값은 models/filmGrowth.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다. */
const float ORIG_SURFACE = ${glslFloat(ORIG_SURFACE)};   // 산화 전 원표면(화면 배치값)
const float FILM_MAX = ${glslFloat(FILM_MAX)};  // 두께 1.0 일 때의 산화막 총 두께(화면 높이)
const float RULER_X = ${glslFloat(RULER_X)};  // 좌측 눈금 영역 폭
// 🔴 물리층 상수(S121). 화면 배치값이 아니다 — models/filmGrowth.model.ts 가 물리층에서 받아 온다.
const float SI_CONSUMED = ${glslFloat(SI_CONSUMED_FRACTION)};

// 알베도 UV 배율 — 화면에 타일이 몇 장 들어오는가. **화면 배치값이며 물리 상수가 아니다.**
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUB_TEX_UV」/「FILM_TEX_UV」 라는 **같은 이름**으로 **다른 값**을 들고 있었다
   (SUB 1.6/1.8/1.7 · FILM 2.4/2.6). grep 하면 어느 것이 이 화면의 값인지 구별이 안 됐다(A-10 「육안 구별 불가」).
   🔴 **값은 한 자리도 바꾸지 않았다 — 이름만 갈랐다.** 씬마다 기판이 화면에서 차지하는 크기가 달라
   확대율이 다른 것이 의도로 보이며, 「세 값을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5). 통일로 판정되면 layout.model.ts 로 올려 주입하면 된다. */
const float FG_SUB_TEX_UV  = 1.6;
const float FG_FILM_TEX_UV = 2.4;

// 텍스처 평균 알베도(textures.ts 실측). 무늬 배율을 뽑는 나눗셈 기준이다.
const vec3 MEAN_SI    = ${texMeanGLSL('silicon-surface')};
const vec3 MEAN_OXIDE = ${texMeanGLSL('oxide')};
const vec3 MEAN_METAL = ${texMeanGLSL('metal')};

// 재질 색 — 종전 절차적 색의 평균을 그대로 옮겼다(색 설계를 바꾸지 않는다). 화면 배치값이다.
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUBSTRATE_COLOR」 라는 **같은 이름**으로 **다른 색**을 들고 있었다
   (filmGrowth 0.25/0.275/0.32 · ionTrajectory 0.20/0.22/0.275 · stepCoverage 0.24/0.265/0.31).
   🔴 **색은 한 성분도 바꾸지 않았다 — 이름만 갈랐다.** 같은 실리콘 기판인데 씬마다 조명·배경이 달라
   눈으로 맞춘 값으로 보이며, 「세 색을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5 — 색 조정은 DSN 소관이라 여기서 정하지 않았다). */
const vec3 FG_SUBSTRATE_COLOR = vec3(0.25, 0.275, 0.32);
const vec3 OXIDE_COLOR     = vec3(0.30, 0.60, 0.88);
const vec3 METAL_COLOR     = vec3(0.86, 0.71, 0.38);

/** 국소 산화막 총 두께(화면). 균일도가 만드는 좌우 편차를 포함한다. */
float localThickness(float x) {
  float dev = (1.0 - uUniformity) * ${glslFloat(UNIFORMITY_DEV)};   // 균일도 → 좌우 편차
  float lateral = (vnoise(vec2(x * 2.0, 3.1)) - 0.5) * 2.0 * dev;
  return uThickness * FILM_MAX * (1.0 + lateral);
}

/** 막 상면 — 원표면 위로 융기한 몫만 올라간다(총 두께의 1 − SI_CONSUMED). */
float filmTopAt(float x) {
  float rough = uRoughness * ${glslFloat(ROUGH_FILM)};
  float wob = (fbm(vec2(x * 22.0, uTime * 0.12)) - 0.5) * 2.0 * rough;
  return ORIG_SURFACE + (1.0 - SI_CONSUMED) * localThickness(x) + wob;
}

/** 산화막/기판 계면 — 먹힌 Si 만큼 원표면 아래로 내려간다(총 두께의 SI_CONSUMED). */
float subTopAt(float x) {
  float rough = uRoughness * ${glslFloat(ROUGH_SUB)};
  return ORIG_SURFACE - SI_CONSUMED * localThickness(x)
       + (fbm(vec2(x * 31.0, 7.7)) - 0.5) * 2.0 * rough;
}

void main() {
  vec2 uv = vUv;
  float sTop = subTopAt(uv.x);
  float fTop = filmTopAt(uv.x);

  // 재질 표면 UV — 캔버스가 옆으로 길어져도 무늬가 늘어나지 않게 가로를 화면비로 환산한다.
  vec2 tuv = vec2(uv.x * (uRes.x / max(uRes.y, 1.0)), uv.y);

  vec3 substrate = FG_SUBSTRATE_COLOR * albedoDetail(texture(uSubstrateTex, tuv * FG_SUB_TEX_UV).rgb, MEAN_SI);
  vec3 oxide = OXIDE_COLOR * albedoDetail(texture(uOxideTex, tuv * FG_FILM_TEX_UV).rgb, MEAN_OXIDE);
  vec3 metal = METAL_COLOR * albedoDetail(texture(uMetalTex, tuv * FG_FILM_TEX_UV).rgb, MEAN_METAL);
  vec3 filmBase = mix(oxide, metal, uTint);

  // 기상 반응종: 표면 위의 빈 공간을 공정 동작으로 읽히게 하는 설명용 표현이다.
  // 밀도·속도는 입력 물리량으로 표시하지 않고 고정해, 배선되지 않은 유량을 꾸며내지 않는다.
  float species = 0.0;
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float px = fract(fi * 0.6180339887 + 0.07);
    float pyTop = 0.92;
    float pyBottom = filmTopAt(px) + 0.025;
    float q = fract(fi * 0.173 + uTime * 0.13);
    float py = mix(pyTop, pyBottom, q);
    float radius = 0.004 + float(i % 3) * 0.0012;
    species += smoothstep(radius, 0.0, length((uv - vec2(px, py)) * aspect));
  }
  species = clamp(species, 0.0, 1.0) * step(fTop + 0.012, uv.y);
  vec3 speciesColor = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.80, 0.30), uTint);

  // 국소 두께 → 간섭 줄무늬(층이 자라는 것을 눈으로 읽히게 하는 시각 장치)
  float local = max(fTop - sTop, 0.0);
  float band = 0.5 + 0.5 * cos((uv.y - sTop) * 34.0 + local * 22.0);
  vec3 film = filmBase * (0.84 + 0.16 * band);

  /* 🔴 **배경을 칠하지 않는다 — CSS 가 깐다.**(2026-08-22 · DSN 검수 GL 결함 ②)
     종전에는 「vec3 ambient = vec3(0.05,0.07,0.11)」 을 화면 전체에 깔고 「vec4(col, 1.0)」 으로
     내보냈다. 그래서 common.ts 의 clear() 가 투명하게 지워 놓은 것을 셰이더가 **불투명하게
     덮어썼고**, 같은 칸을 라이트 모드로 보는 학습자와 다크 모드로 보는 학습자가 WebGL2 지원
     여부에 따라 전혀 다른 그림을 봤다(실측 600×300 px·dpr 1: 폴백 54.2→199.1 · GL 52.7→52.7).
     Canvas2D 폴백은 clearRect 뒤 막·기판만 칠해 배경이 비치므로 테마를 따라간다 —
     **폴백이 옳다.** 여기서는 커버리지를 알파로 내보내 같은 동작으로 되돌린다.
     🔴 컨텍스트는 premultipliedAlpha: true (context.ts:121)다. 아래 col 은
        「색 × 커버리지」를 누적하므로 **이미 프리멀티플라이드**이며 그대로 내보내면 된다. */
  float cover = step(uv.y, fTop);                                  // 막·기판 = 불투명
  vec3 col = mix(film, substrate, step(uv.y, sTop)) * cover;
  float alpha = cover;
  col += speciesColor * species * 0.78;
  alpha = clamp(alpha + species * 0.78, 0.0, 1.0);

  // 경계선 강조 — 🔴 막 상면 선은 **테마 잉크색**을 쓴다(폴백의 c.fg 와 같은 출처: 캔버스 CSS color).
  float edgeFilm = lineMask(uv.y - fTop, 0.0016) * 0.85;
  float edgeSub = lineMask(uv.y - sTop, 0.0012) * 0.55;
  col += uInk * edgeFilm;
  col += vec3(0.75, 0.80, 0.90) * edgeSub;
  alpha = clamp(alpha + edgeFilm + edgeSub, 0.0, 1.0);

  // 원표면 기준선 — 산화 전 Si 표면이 어디였는지 남긴다(파선).
  // 이 선 **아래**가 먹힌 Si, **위**가 표면 융기다. 물리량을 새로 주장하지 않는 기준선이다.
  float dash = step(0.45, fract(uv.x * 42.0));
  float origLine = lineMask(uv.y - ORIG_SURFACE, 0.0013) * dash * 0.55;
  col += vec3(0.85, 0.88, 0.95) * origLine;
  alpha = clamp(alpha + origLine, 0.0, 1.0);

  // 두께 눈금(좌측) — **계면에서 시작해** 10등분 + 현재 두께 마커(막 상면)
  float subMean = ORIG_SURFACE - SI_CONSUMED * uThickness * FILM_MAX;
  float filmMean = ORIG_SURFACE + (1.0 - SI_CONSUMED) * uThickness * FILM_MAX;
  float inRuler = bandMask(uv.x, 0.012, RULER_X);
  float g = fract((uv.y - subMean) / (FILM_MAX / ${glslFloat(RULER_DIVISIONS)}));
  float tick = lineMask(min(g, 1.0 - g), 0.04) * step(subMean, uv.y) * step(uv.y, subMean + FILM_MAX) * inRuler * 0.7;
  col += vec3(0.55, 0.62, 0.72) * tick;
  float marker = lineMask(uv.y - filmMean, 0.0022) * (0.35 + 0.65 * inRuler);
  col += vec3(1.0, 0.85, 0.35) * marker;
  alpha = clamp(alpha + tick + marker, 0.0, 1.0);

  // 챔버 비네팅 — 그려진 것에만 건다(배경은 CSS 몫이라 여기서 어둡게 만들지 않는다).
  float vig = smoothstep(1.05, 0.35, length((uv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0)));
  col *= 0.75 + 0.25 * vig;

  fragColor = vec4(col, alpha);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  thickness: WebGLUniformLocation | null;
  roughness: WebGLUniformLocation | null;
  tint: WebGLUniformLocation | null;
  uniformity: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  substrateTex: WebGLUniformLocation | null;
  oxideTex: WebGLUniformLocation | null;
  metalTex: WebGLUniformLocation | null;
}

/**
 * 🔴 **테마 잉크색을 읽는 경로 — 새로 발명한 것이 아니다.**
 * Canvas2D 폴백 `gl/fallback2d.ts` 의 `palette()` 가 이미 `getComputedStyle(canvas).color` 를
 * 읽어 `c.fg` 로 쓴다. GL 쪽에도 **그 관례를 그대로** 옮겼다(별도의 테마 배선·props·전역 상태를
 * 만들지 않는다 — `src/viz/**` 는 `src/ui/**` 를 import 할 수 없다: §3 계층 규칙).
 * 🔴 모듈 최상위에서 부르지 않는다 — 호출은 전부 `draw()` 안이다.
 */
const INK_DEFAULT: readonly [number, number, number] = [0.784, 0.800, 0.839];
/** CSS `color` 를 다시 읽는 최소 간격(초). 매 프레임 `getComputedStyle` 을 부르면 스타일 재계산이 돈다. */
const INK_POLL_S = 0.25;

function readInk(canvas: HTMLCanvasElement): [number, number, number] | null {
  try {
    if (typeof getComputedStyle !== 'function') return null;
    const m = getComputedStyle(canvas).color.match(/-?\d+(?:\.\d+)?/g);
    if (!m || m.length < 3) return null;
    const v: [number, number, number] = [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
    return v.every((x) => Number.isFinite(x)) ? v : null;
  } catch {
    return null; // jsdom 등에서 실패해도 기본값으로 진행한다(폴백 palette() 과 같은 태도)
  }
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let tex: TextureSet | null = null;
  const p = { thickness: 0.35, roughness: 0.25, tint: 0.0, uniformity: 0.85 };
  let ink: [number, number, number] = [...INK_DEFAULT];
  let inkAt = Number.NEGATIVE_INFINITY;

  return {
    id: 'filmGrowth',
    animated: true, // 계면 요동이 시간에 따라 흔들린다
    init(gl) {
      ctx = gl;
      prog = gl.program('filmGrowth', FULLSCREEN_VS, FILM_GROWTH_FS);
      // 비동기 로드다. 도착 전에는 평균 알베도 1×1 이 바인딩돼 있어 화면이 비지 않는다.
      // 이 씬은 animated: true 라 도착한 다음 프레임에서 무늬가 저절로 나타난다.
      tex = acquireTextures(gl, ['silicon-surface', 'oxide', 'metal']);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        thickness: gl.uniform(prog, 'uThickness'),
        roughness: gl.uniform(prog, 'uRoughness'),
        tint: gl.uniform(prog, 'uTint'),
        uniformity: gl.uniform(prog, 'uUniformity'),
        ink: gl.uniform(prog, 'uInk'),
        substrateTex: gl.uniform(prog, 'uSubstrateTex'),
        oxideTex: gl.uniform(prog, 'uOxideTex'),
        metalTex: gl.uniform(prog, 'uMetalTex'),
      };
    },
    update(params: SceneParams) {
      p.thickness = pick(params, 'thickness', p.thickness);
      p.roughness = pick(params, 'roughness', p.roughness);
      p.tint = pick(params, 'tint', p.tint);
      p.uniformity = pick(params, 'uniformity', p.uniformity);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);
      if (u.thickness) gl.uniform1f(u.thickness, p.thickness);
      if (u.roughness) gl.uniform1f(u.roughness, p.roughness);
      if (u.tint) gl.uniform1f(u.tint, p.tint);
      if (u.uniformity) gl.uniform1f(u.uniformity, p.uniformity);
      /* 테마 잉크색 — 이 씬은 `animated: true` 라 프레임이 계속 돌고, 테마를 바꾸면
         다음 폴링 때(≤ INK_POLL_S 초) 저절로 따라간다. 매 프레임 읽지 않는다. */
      if (t - inkAt >= INK_POLL_S) {
        inkAt = t;
        const next = readInk(ctx.canvas);
        if (next) ink = next;
      }
      if (u.ink) gl.uniform3f(u.ink, ink[0], ink[1], ink[2]);
      if (tex) {
        tex.bind(TEX_SUBSTRATE, 'silicon-surface');
        tex.bind(TEX_OXIDE, 'oxide');
        tex.bind(TEX_METAL, 'metal');
      }
      if (u.substrateTex) gl.uniform1i(u.substrateTex, TEX_SUBSTRATE);
      if (u.oxideTex) gl.uniform1i(u.oxideTex, TEX_OXIDE);
      if (u.metalTex) gl.uniform1i(u.metalTex, TEX_METAL);
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
