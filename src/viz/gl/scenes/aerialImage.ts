/**
 * 씬: ArF 침지 노광 — **광축을 포함하는 수직 종단면 1개 + 퓨필 정면 인셋 1개.**
 * 포토 공정 3칸(기초·응용·심화) 공용.
 *
 * 🔴 **정본은 `DSN-8대공정-001.SD.md` §3(3-0~3-7)이다.** `photo.ts` 의 `map()` 이 넘기는
 *    `SceneParams` 계약은 정확히 6키다(그 밖의 키는 읽지 않는다) — 값은 전부 0~1:
 *      na               광 원뿔 반각·초점 허용 띠 두께의 원천(NA 앵커 [0.60, 1.35], SD §3-1)
 *      defocus           0.5 가 초점면(ΔF = 0). 부호가 살아 있다 — 좌우 대칭(비단조)
 *      exposureDose      슬릿 스캔 화살표 길이의 원천(공통 앵커 E [10, 80] mJ/cm², SD §0-3)
 *      resistThickness   레지스트 층 두께(앵커 [60, 900] nm)
 *      lineWidth         레지스트 라인 폭 — 랩 출력 `cdNm` 을 (cd−20)/50 로 넘긴 값(확장 키)
 *      fringeAmplitude   측벽 정재파 대비 배율 — BARC 계수 √R_s/√0.35(PLN 소관, 확장 키)
 *    씬은 위 6키에서 **광 원뿔·초점 허용 띠·측벽각·스캔 길이·정재파 간격을 전부 직접 계산**한다
 *    (`models/aerialImage.model.ts` 의 P-1~P-6 식). 랩 출력을 다시 읽지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 **이 씬은 193 nm 굴절계 전용이다.** EUV 반사경 6매·반사형 마스크·지그재그 광로는
 *    **근거 없음 — 그리지 않았다**(조사 B 에 구조 도면 근거가 없다).
 * 🔴 **액침을 「수조」로 그리지 않았다.** 물이 채우는 것은 최종 렌즈면 아래의 **국소 갭뿐**이다
 *    (조사 §F-3 3대 오답의 하나). 갭은 **항상 채워진 상태**로 그린다 — 건식/액침 토글에 대응하는
 *    lab 파라미터가 없다(`photo.ts` 가 NA 하한 1.00 으로 ArF 침지를 고정 조건으로 굳혔다).
 *
 * 🔴 **그리지 않은 것 — SD §3-6 「구현하지 마라」16건, 근거가 없어서 뺐다(A15).**
 *   · **퓨필 형상 4종**(conventional/annular/dipole/quadrupole) · `pupil`·`medium` 이산 키 —
 *     대응 lab 입력이 없다(SD §3-6 #3·#4). 인셋은 **NA 크기만** 보인다.
 *   · **λ 4단 전환 · 오버레이 벡터도 · 웨이퍼맵 · 수율 맵** — 이 씬의 뷰(단면 1뷰) 밖(#6·#9).
 *   · **패턴 붕괴 애니메이션**(라인이 기울어 맞붙음) — 형상 근거 미확보(#8).
 *   · **PEB** — 노광 **후** 트랙 공정. 공정 순서를 왜곡한다(#7).
 *   · **정재파 진폭 계수 √R_s 를 씬 안에서 계산** — PLN 소관. `fringeAmplitude` 키로 **받기만** 한다(#16).
 *   · **워터마크·기포 발생 조건을 파라미터에 걸기** — 임계 관계 미확인(#12).
 *   · **공중상 강도 프로파일 · Bossung 등고선** — 씬 밖(`viz/chart` 소관, #10).
 *   · **E₀·k₁·nm·wph 등 절대 숫자를 씬 UI 에** — PLN 이 「교육용 설정」으로 자인(#13).
 *   · **측벽각 숫자를 게이지처럼 정확하게** — 조사 B 는 프로파일 형상을 정성까지만 확보(#15).
 *
 * ✅ **Canvas2D 폴백 등재 완료(2026-08-22).** `drawAerialImage` + `SCENE_DRAWERS` 등재.
 *    3칸 전수 실측에서 폴백으로 뜬다(배지 `--fallback`). 폴백은 `models/aerialImage.model.ts` 를
 *    import 해서 그린다 — 식을 옮겨 적지 않는다.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 **화면 배치값의 정본은 여기 없다** — `models/aerialImage.model.ts` 다. 이 파일은 주입만 한다.
 *    물리층 상수(`N_WATER_193`·`K2_ARF_IMMERSION`·`ARF_LAMBDA`·`NA_IMMERSION_MAX`)도 그 모듈이
 *    받아 온다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, setCommonUniforms, clear } from './common';
import { AXIS_X } from './models/layout.model';
import { readVizPalette, type Rgb3 } from './theme';
import {
  aerialImageModel,
  IMMERSION_INDEX, NA_SCENE_MAX,
  SUBSTRATE_TOP, PITCH_UV, LINE_COUNT, SW_SPACING_V,
  LENS_BOTTOM, LENS_TOP, LENS_SAG, BARREL_HALF,
  GAP_HALF, NOZZLE_HALF_IN, NOZZLE_HALF_OUT, GAS_SEAL_OUT,
  SCAN_ARROW_Y, SCAN_BAR, PUPIL_CX, PUPIL_CY, PUPIL_R,
  SCAN_TIP_LEN_V, SCAN_TIP_MIN_PX, SCAN_TIP_FLARE, SCAN_TIP_STROKE_HALF_PX,
  SW_CONTRAST_BASE, EDGE_BLUR_MAX, WATER_FLOW_SPEED,
  COLOR_BARREL, COLOR_LENS, COLOR_WATER, COLOR_NOZZLE, COLOR_GAS,
  COLOR_SUBSTRATE, COLOR_RESIST, COLOR_LIGHT,
  type AerialImageModel, type Rgb,
} from './models/aerialImage.model';

export { aerialImageModel } from './models/aerialImage.model';
export type { AerialImageModel } from './models/aerialImage.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}
/** 재료색을 GLSL vec3 리터럴로 찍는다. */
function glslRgb(c: Rgb): string {
  return `vec3(${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])})`;
}

/** 상단 모서리 라운딩이 적용되는 라인 상단 구간의 비율(순수 화면 연출값 — SD 형상 근거 없음). */
const CORNER_ROUND_ZONE = 0.42;

/* 🔴 화살촉(갈매기꼴) 기하는 **`models/aerialImage.model.ts` 가 정본**이다(2026-08-22 승격).
 *    여기서 다시 선언하지 마라 — GL 과 폴백이 각자 들면 조용히 갈린다(§3-X 사각지대 ③).
 *    왜 갈매기꼴인가: 종전 GL 은 촉을 **원형 글로우**로 그려 촉 끝 **바깥**으로 반지름만큼
 *    번졌고, 화면 길이가 모델보다 +5 px 길어졌다(실측 600×300 px). 이 씬이 가르치는 것이
 *    「길이 × 노광량 = 일정」(P-4)이라는 비례인데 그 과길이가 비례를 깼다.
 *    ⛔ 모델(`SCAN_LEN_COEF`)은 정확했다. 고친 것은 렌더뿐이다. 판정식은 **P-3g**. */

/**
 * 셰이더 설명 5줄:
 * 1) 위에서부터 투영 렌즈 배럴 → **최종 렌즈면**(볼록 하면) → **국소 갭**(물막·노즐·기체 실) →
 *    웨이퍼 + 레지스트 순으로 칠한다. 물은 갭 폭 안에서만 채워진다(수조가 아니다).
 * 2) 최종 렌즈면에서 초점면까지 **광 원뿔**을 그린다. 반각은 `asin(NA / n)` 이며
 *    n 은 물리층 침지수 굴절률(S140)을 주입받은 상수다 — 씬이 만든 수가 아니다.
 * 3) 초점면 높이는 `uFocusY`(ΔF 부호가 살아 있다), **초점 허용 띠**의 반두께는 `uBandHalf`
 *    (모델이 `DOF_nm × M_z`로 환산한 값)다. NA 를 올리면 반각은 1차로 벌어지고
 *    띠는 **제곱으로 얇아진다** — 이 씬의 교육 내용 전부가 그 대비다(SD §3-3 P-1·P-2).
 * 4) 레지스트 라인 3개를 사다리꼴로 세운다. 바닥 반폭은 CD/2, 옆면 기울기는 모델이 계산한
 *    SWA_scr(SD §3-3 P-3 — 랩 게이지 swaDeg 와 다르게 그린다), 상단 모서리는 `uCornerRound`
 *    만큼 둥글어진다.
 * 5) 측벽 정재파 줄무늬는 **상수 간격**(`SW_SPACING`, 파라미터 무관)으로 찍고 대비는
 *    `uFringeAmp`(BARC 계수)로 조절한다 — 개수만 늘고 간격은 절대 변하지 않는다(SD R5).
 *    좌상단 퓨필 인셋은 NA/NA_max 만큼 채워진다.
 */
export const AERIAL_IMAGE_FS = `${FRAG_HEAD}
/* 🔴 테마 토큰 — CSS(\`--bg\`·\`--ink\`·\`--viz-spec\`·\`--viz-series-1\`)에서 읽어 매 draw 마다 올린다.
   재료색([B])은 모델 상수 그대로이고, 여기 유니폼은 **지시선·표식([A])과 베이스 배경**만 담당한다. */
uniform vec3 uBg;
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uS1;
uniform float uNaValue;
uniform float uResistH;
uniform float uLineHalf;
uniform float uSidewall;
uniform float uCornerRound;
uniform float uFocusY;
uniform float uBandHalf;
uniform float uDefocus;
uniform float uScanLen;
uniform float uFringeAmp;
${NOISE_GLSL}
${DRAW_GLSL}

/* 🔴 아래 배치값은 models/aerialImage.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다. */
const float AXIS_X = ${glslFloat(AXIS_X)};
const float SUBSTRATE_TOP = ${glslFloat(SUBSTRATE_TOP)};
const float PITCH_UV = ${glslFloat(PITCH_UV)};
const float LENS_BOTTOM = ${glslFloat(LENS_BOTTOM)};
const float LENS_TOP = ${glslFloat(LENS_TOP)};
const float LENS_SAG = ${glslFloat(LENS_SAG)};
const float BARREL_HALF = ${glslFloat(BARREL_HALF)};
const float GAP_HALF = ${glslFloat(GAP_HALF)};
const float NOZZLE_HALF_IN = ${glslFloat(NOZZLE_HALF_IN)};
const float NOZZLE_HALF_OUT = ${glslFloat(NOZZLE_HALF_OUT)};
const float GAS_SEAL_OUT = ${glslFloat(GAS_SEAL_OUT)};
const float SCAN_ARROW_Y = ${glslFloat(SCAN_ARROW_Y)};
const float SCAN_BAR = ${glslFloat(SCAN_BAR)};
const float PUPIL_CX = ${glslFloat(PUPIL_CX)};
const float PUPIL_CY = ${glslFloat(PUPIL_CY)};
const float PUPIL_R = ${glslFloat(PUPIL_R)};
const float SW_CONTRAST_BASE = ${glslFloat(SW_CONTRAST_BASE)};
/* 🔴 정재파 간격 — 상수(SD R5). resistThickness 가 바뀌어도 절대 변하지 않는다(uniform 이 아니다). */
const float SW_SPACING = ${glslFloat(SW_SPACING_V)};
const float CORNER_ROUND_ZONE = ${glslFloat(CORNER_ROUND_ZONE)};
/* 🔴 화살촉 기하 — 안쪽 갈매기꼴. 값의 뜻은 위 TS 선언부 주석 참조(바깥으로 번지면 길이가 거짓말을 한다). */
const float SCAN_TIP_LEN_V = ${glslFloat(SCAN_TIP_LEN_V)};
const float SCAN_TIP_MIN_PX = ${glslFloat(SCAN_TIP_MIN_PX)};
const float SCAN_TIP_FLARE = ${glslFloat(SCAN_TIP_FLARE)};
const float SCAN_TIP_STROKE_HALF_PX = ${glslFloat(SCAN_TIP_STROKE_HALF_PX)};
const float EDGE_BLUR_MAX = ${glslFloat(EDGE_BLUR_MAX)};
const float WATER_FLOW_SPEED = ${glslFloat(WATER_FLOW_SPEED)};
const int LINE_COUNT = ${String(Math.round(LINE_COUNT))};

/* 🔴 물리층 상수 — 씬이 만든 수가 아니다(models/aerialImage.model.ts 가 rayleigh.ts 에서 받아 온다). */
const float N_IMMERSION = ${glslFloat(IMMERSION_INDEX)};   // 침지수 굴절률 @193 nm (S140)
const float NA_MAX = ${glslFloat(NA_SCENE_MAX)};            // SD §3-1 na 앵커 상한 (= NA_IMMERSION_MAX)

const vec3 C_BARREL = ${glslRgb(COLOR_BARREL)};
const vec3 C_LENS = ${glslRgb(COLOR_LENS)};
const vec3 C_WATER = ${glslRgb(COLOR_WATER)};
const vec3 C_NOZZLE = ${glslRgb(COLOR_NOZZLE)};
const vec3 C_GAS = ${glslRgb(COLOR_GAS)};
const vec3 C_SUB = ${glslRgb(COLOR_SUBSTRATE)};
const vec3 C_RESIST = ${glslRgb(COLOR_RESIST)};
const vec3 C_LIGHT = ${glslRgb(COLOR_LIGHT)};

float ax(float x) { return abs(x - AXIS_X); }

/** 점 p 에서 선분 a—b 까지의 거리. 화살촉 갈매기꼴을 **획**으로 그리는 데 쓴다. */
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}

/** 최종 렌즈면(볼록 하면)의 높이 — 축에서 가장 낮다. */
float lensSurfaceY(float x) {
  float r = clamp(ax(x) / BARREL_HALF, 0.0, 1.0);
  return LENS_BOTTOM + LENS_SAG * (1.0 - sqrt(max(1.0 - r * r, 0.0)));
}

/** 사다리꼴 레지스트 라인의 높이 y 에서의 반폭. 상단은 SWA_scr 로 좁아지고 우CornerRound 로 둥글어진다. */
float lineHalfAt(float y) {
  float h = max(uResistH, 1e-4);
  float t = clamp((y - SUBSTRATE_TOP) / h, 0.0, 1.0);
  // 측벽 기울기 — 모델이 SD §3-3 P-3 식으로 계산한 SWA_scr. 90° 면 수직이다.
  float inset = h / max(tan(uSidewall), 1e-3);
  float hw = uLineHalf - inset * t;
  // 상단 모서리 둥글기 — SD §3-3 P-3: 라인 반폭 × (1 − SWA_scr/88).
  float fillet = uLineHalf * uCornerRound;
  float k = clamp((t - (1.0 - CORNER_ROUND_ZONE)) / CORNER_ROUND_ZONE, 0.0, 1.0);
  hw -= fillet * (1.0 - sqrt(max(1.0 - k * k, 0.0)));
  return max(hw, 0.0);
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float arf = uRes.x / max(uRes.y, 1.0);
  vec3 col = uBg;

  /* ── 1. 광 원뿔 — 최종 렌즈면에서 초점면으로 모인다. 반각 θ = asin(NA/n) (SD §3-3 P-2) ── */
  float sinTheta = clamp(uNaValue / N_IMMERSION, 0.0, 0.999);
  float tanTheta = sinTheta / sqrt(max(1.0 - sinTheta * sinTheta, 1e-4));
  // 초점면에서 위로 올라갈수록 반경이 tanθ 로 벌어진다 — 정점이 초점인 원뿔이다.
  float coneHalf = tanTheta * max(uv.y - uFocusY, 0.0);
  float inCone = bandMask(uv.y, uFocusY, lensSurfaceY(uv.x)) * step(ax(uv.x), coneHalf);
  col = mix(col, C_LIGHT, inCone * 0.20);
  // 원뿔 모서리 광선 2가닥
  float edge = bandMask(uv.y, uFocusY, LENS_BOTTOM + LENS_SAG) * lineMask(ax(uv.x) - coneHalf, 0.0022);
  col += C_LIGHT * edge * 0.75;

  /* ── 2. 국소 갭 — 물막 · 노즐 · 기체 실 (🔴 수조가 아니다) ── */
  float resistTop = SUBSTRATE_TOP + uResistH;
  float gapBand = bandMask(uv.y, resistTop, lensSurfaceY(uv.x));
  float inWater = gapBand * step(ax(uv.x), GAP_HALF);
  // 물 순환 — 공급(좌) → 회수(우) 방향으로 흐르는 결
  float flow = 0.5 + 0.5 * sin((uv.x * 44.0) - t * WATER_FLOW_SPEED * 6.0);
  col = mix(col, C_WATER * (0.82 + 0.18 * flow), inWater * 0.72);
  col = mix(col, C_NOZZLE, gapBand * bandMask(ax(uv.x), NOZZLE_HALF_IN, NOZZLE_HALF_OUT));
  col = mix(col, C_GAS, gapBand * bandMask(ax(uv.x), NOZZLE_HALF_OUT, GAS_SEAL_OUT) * 0.7);

  /* ── 3. 최종 렌즈면 · 배럴 ── */
  float lensY = lensSurfaceY(uv.x);
  float inLens = step(ax(uv.x), BARREL_HALF) * bandMask(uv.y, lensY, LENS_TOP);
  col = mix(col, C_LENS, inLens * 0.55);
  col = mix(col, C_BARREL, step(ax(uv.x), BARREL_HALF) * bandMask(uv.y, LENS_TOP, LENS_TOP + 0.06));
  col = mix(col, uInk, clamp(inLens * lineMask(uv.y - lensY, 0.0022) * 0.9, 0.0, 1.0));

  /* ── 4. 웨이퍼 기판 ── */
  col = mix(col, C_SUB, step(uv.y, SUBSTRATE_TOP));

  /* ── 5. 레지스트 라인 3개 (사다리꼴 + 정재파 줄무늬) ── */
  float inResistY = bandMask(uv.y, SUBSTRATE_TOP, resistTop);
  float hw = lineHalfAt(uv.y);
  float blur = EDGE_BLUR_MAX * uDefocus + 0.0016;
  float lineCover = 0.0;
  for (int k = 0; k < LINE_COUNT; k++) {
    float cx = AXIS_X + (float(k) - float(LINE_COUNT - 1) * 0.5) * PITCH_UV;
    lineCover = max(lineCover, smoothstep(hw + blur, hw - blur, abs(uv.x - cx)));
  }
  float inLine = lineCover * inResistY * step(0.0001, uResistH);
  if (inLine > 0.001) {
    vec3 resist = C_RESIST;
    // 정재파 줄무늬 — 간격은 SW_SPACING 상수(파라미터 무관, SD R5). 대비만 uFringeAmp 로 조절한다.
    float ph = fract((uv.y - SUBSTRATE_TOP) / SW_SPACING);
    resist *= 1.0 + SW_CONTRAST_BASE * uFringeAmp * (cos(ph * 6.2831853) * 0.5);
    col = mix(col, resist, inLine);
  }

  /* ── 6. 초점 허용 띠 + 초점면 선 ── */
  float band = bandMask(uv.y, uFocusY - uBandHalf, uFocusY + uBandHalf);
  col = mix(col, uSpec, band * 0.16);
  col = mix(col, uSpec, clamp(lineMask(uv.y - (uFocusY + uBandHalf), 0.0013) * 0.55, 0.0, 1.0));
  col = mix(col, uSpec, clamp(lineMask(uv.y - (uFocusY - uBandHalf), 0.0013) * 0.55, 0.0, 1.0));
  float dash = step(0.45, fract(uv.x * 60.0));
  col = mix(col, uInk, clamp(lineMask(uv.y - uFocusY, 0.0014) * dash * 0.65, 0.0, 1.0));

  /* ── 7. 슬릿 스캔 화살표(좌향 1개, SD §3-2 요소 12) — 도즈↑ → 길이↓(SD §3-3 P-4) ── */
  float sy = lineMask(uv.y - SCAN_ARROW_Y, SCAN_BAR);
  float sx = bandMask(uv.x, AXIS_X - uScanLen, AXIS_X);
  col = mix(col, uInk, clamp(sy * sx * 0.75, 0.0, 1.0));
  /* 화살촉 1개(좌측 끝 — 좌향). 🔴 **촉은 막대 안쪽(오른쪽)으로만 뻗는다.**
     종전의 원형 글로우는 촉 끝 **바깥**으로도 반지름만큼 번져 화면 길이를 늘렸다(P-3g 위반).
     좌표계: 촉 끝을 원점으로 두고 가로를 화면비로 환산해 **등방(화면 높이 = 1)** 으로 만든다. */
  float tipX = AXIS_X - uScanLen;
  vec2 q = vec2((uv.x - tipX) * arf, uv.y - SCAN_ARROW_Y);
  float tipLen = max(SCAN_TIP_MIN_PX / max(uRes.y, 1.0), SCAN_TIP_LEN_V);
  vec2 armUp = vec2(tipLen, tipLen * SCAN_TIP_FLARE);
  vec2 armDn = vec2(tipLen, -tipLen * SCAN_TIP_FLARE);
  float tipD = min(segDist(q, vec2(0.0), armUp), segDist(q, vec2(0.0), armDn));
  float tipHalf = SCAN_TIP_STROKE_HALF_PX / max(uRes.y, 1.0);  // 폴백 lineWidth 2 의 절반
  float tipAA = 0.5 / max(uRes.y, 1.0);                    // 안티에일리어싱 전이폭 ≈ 1 px
  float tipL = 1.0 - smoothstep(tipHalf - tipAA, tipHalf + tipAA, tipD);
  col = mix(col, uInk, clamp(tipL * 0.9, 0.0, 1.0));   // 0.9 = 폴백 화살촉 획의 알파와 같다

  /* ── 8. 퓨필 정면 인셋 — 바깥 원이 NA 상한, 채워진 원이 현재 NA ── */
  vec2 pd = vec2((uv.x - PUPIL_CX) * arf, uv.y - PUPIL_CY);
  float pr = length(pd);
  col = mix(col, uInk, clamp(lineMask(pr - PUPIL_R, 0.0022) * 0.7, 0.0, 1.0));
  float fill = PUPIL_R * clamp(uNaValue / NA_MAX, 0.0, 1.0);
  col = mix(col, uS1, smoothstep(fill, fill - 0.006, pr) * 0.65);

  /* ── 9. 비네팅 ── */
  float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(arf, 1.0)));
  col *= 0.80 + 0.20 * vig;

  fragColor = vec4(col, 1.0);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  naValue: WebGLUniformLocation | null;
  resistH: WebGLUniformLocation | null;
  lineHalf: WebGLUniformLocation | null;
  sidewall: WebGLUniformLocation | null;
  cornerRound: WebGLUniformLocation | null;
  focusY: WebGLUniformLocation | null;
  bandHalf: WebGLUniformLocation | null;
  defocus: WebGLUniformLocation | null;
  scanLen: WebGLUniformLocation | null;
  fringeAmp: WebGLUniformLocation | null;
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
  let m: AerialImageModel = aerialImageModel({});

  return {
    id: 'aerialImage',
    animated: true, // 갭의 물 순환이 흐른다
    init(gl) {
      ctx = gl;
      prog = gl.program('aerialImage', FULLSCREEN_VS, AERIAL_IMAGE_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        bg: gl.uniform(prog, 'uBg'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        s1: gl.uniform(prog, 'uS1'),
        naValue: gl.uniform(prog, 'uNaValue'),
        resistH: gl.uniform(prog, 'uResistH'),
        lineHalf: gl.uniform(prog, 'uLineHalf'),
        sidewall: gl.uniform(prog, 'uSidewall'),
        cornerRound: gl.uniform(prog, 'uCornerRound'),
        focusY: gl.uniform(prog, 'uFocusY'),
        bandHalf: gl.uniform(prog, 'uBandHalf'),
        defocus: gl.uniform(prog, 'uDefocus'),
        scanLen: gl.uniform(prog, 'uScanLen'),
        fringeAmp: gl.uniform(prog, 'uFringeAmp'),
      };
    },
    update(params: SceneParams) {
      // 🔴 파생값을 여기서 계산하지 않는다 — 모델 모듈이 정본이다.
      m = aerialImageModel(params);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      const pal = readVizPalette(ctx.canvas);
      set3(gl, u.bg, pal.bg, pal.bg);
      set3(gl, u.ink, pal.ink, pal.ink);
      set3(gl, u.spec, pal.spec, pal.ink);
      set3(gl, u.s1, pal.series[0], pal.ink);

      if (u.naValue) gl.uniform1f(u.naValue, m.naValue);
      if (u.resistH) gl.uniform1f(u.resistH, m.resistHeight);
      if (u.lineHalf) gl.uniform1f(u.lineHalf, m.lineHalf);
      if (u.sidewall) gl.uniform1f(u.sidewall, m.sidewallRad);
      if (u.cornerRound) gl.uniform1f(u.cornerRound, m.cornerRoundFrac);
      if (u.focusY) gl.uniform1f(u.focusY, m.focusPlaneY);
      if (u.bandHalf) gl.uniform1f(u.bandHalf, m.focusBandHalf);
      if (u.defocus) gl.uniform1f(u.defocus, m.defocusMag);
      if (u.scanLen) gl.uniform1f(u.scanLen, m.scanLength);
      if (u.fringeAmp) gl.uniform1f(u.fringeAmp, m.fringeAmp);
      ctx.drawFullscreen();
    },
    dispose() {
      ctx = null;
      prog = null;
      u = null;
    },
  };
}
