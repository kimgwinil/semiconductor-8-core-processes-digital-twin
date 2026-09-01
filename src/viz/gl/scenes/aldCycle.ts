/**
 * 씬: ALD 사이클 — 자기제한 반응과 사이클 선형 성장.
 *
 * 🔴 **ALD 는 자기제한이 존재 이유다.** 사이클 축이 없으면 「사이클당 정확히 한 층」이라는
 *    유일한 요점이 통째로 사라진다(12_시각화씬_공백보고 §4-4). 그래서 이 씬의 중심은
 *    **두께–사이클 계단 그래프**이고, 단면은 그 계단이 실제로 층으로 쌓이는 것을 보여주는 보조다.
 *
 * 반응 파라미터(전부 0~1 정규화, 물리값 변환은 상위가 한다):
 *   cycles      사이클 수 → 두께가 **계단형으로 선형 증가**. 계단의 모서리가 직선 위에 정확히 얹힌다
 *   phase       0→1 이 **전구체 A → 퍼지 → 전구체 B → 퍼지** 4단계를 한 바퀴(이산 4구간)
 *   saturation  노출량 → 표면 흡착 포화. **포화 후에는 더 넣어도 층 두께가 늘지 않는다**(계단 높이가 멈춘다)
 *   temperature **온도축 위의 정규화 위치**. 온도 막대의 마커가 여기 선다.
 *               🔴 성장률이 아니다 — 성장률은 `growth` 가 따로 정한다. 두 양을 한 슬롯에
 *               섞으면 마커가 거꾸로 돌고 계단이 붕괴한다(2026-08-21 결함 ❌-1 의 원인).
 *               평탄 창은 `ALD_TEMP_WINDOW`(=[0.30, 0.66]). 상위 층은 자기 온도 범위를
 *               이 창에 얹어 넘긴다.
 *   growth      **선택**. 사이클당 성장률(이상값 대비 0~1). 주면 `gpc` 를 이것으로 정하고,
 *               없으면 씬이 `satCoverage × tempFactor` 로 자체 산출한다(씬 단독 사용 하위호환)
 *
 * 🔴 `temperature` 축에 **온도 숫자를 넣지 않는다** — 원장 U-8 로 대표 구간 미확인.
 *    셰이더는 글자·숫자를 전혀 그리지 않는다. 온도 막대는 「저온 이탈대 / 창 / 고온 이탈대」 3구간의
 *    색과 마커 위치만 그리고, **「낮음 ← 온도 → 높음」 및 이탈 모드 이름(응축·불완전반응 / 탈착·분해)은
 *    DOM 라벨이 붙인다.** 저온 2모드·고온 2모드의 선후 순서는 확인되지 않았으므로
 *    이탈대를 다시 쪼개 순서를 주장하지 않는다.
 *
 * 여기 나오는 숫자는 전부 화면 배치값이며 물리 상수가 아니다(설계서 §8).
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, pick, setCommonUniforms, clear } from './common';
import {
  CYCLE_MAX,
  LAYER_MAX,
  SAT_K,
  TEMP_RAMP_HI,
  TEMP_RAMP_LO,
  aldCycleModel,
} from './models/aldCycle.model';
import type { AldCycleModel } from './models/aldCycle.model';
import { readVizPalette, type Rgb3 } from './theme';

/**
 * 🔴 **계산식과 상수는 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/aldCycle.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *    (2026-08-21 이전에는 폴백이 두 번째 사본을 들고 `growth` 를 몰라, 100 °C 에서 사이클당
 *     성장을 0.0394 로 계산했다 — 정본 0.9091 의 1/23 이다.)
 *
 * 🔴 재수출 — 기존 import 경로(`@/viz/gl/scenes/aldCycle`)를 쓰던 테스트·호출부가 그대로 돈다.
 *    새 코드는 `models/aldCycle.model` 에서 직접 가져오는 편이 낫다(셰이더가 딸려오지 않는다).
 */
export { ALD_TEMP_WINDOW, aldCycleModel, temperatureWindow } from './models/aldCycle.model';
export type { AldCycleModel } from './models/aldCycle.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * 셰이더 설명 3줄:
 * 1) 왼쪽 패널은 챔버 단면이다. 기판 위에 **사이클마다 한 겹씩** 경계선이 보이는 층을 쌓고,
 *    표면의 흡착 자리에 전구체가 붙는 것(포화 상한까지만)과 퍼지로 기상 분자가 빠지는 것을 그린다.
 * 2) 오른쪽 위 패널은 두께–사이클 **계단 그래프**다. 계단 모서리가 원점에서 뻗은 직선 위에 정확히
 *    얹히게 그려 「사이클 수에 선형」임을 눈으로 확인시킨다. 기울기 = 사이클당 성장.
 * 3) 오른쪽 아래는 온도창 막대(저온 이탈대·창·고온 이탈대 3구간 + 현재 위치 마커)이고,
 *    왼쪽 아래는 4단계 사이클 타임라인 + 재생 헤드다. **글자·숫자는 그리지 않는다**(DOM 라벨 담당).
 */
export const ALD_CYCLE_FS = `${FRAG_HEAD}
/* 🔴 uBg(페이지 바탕)를 더 쓰지 않는다 — 아래 「배경을 칠하지 않는다」 주석 참조(2026-09-01).
   유니폼 선언과 TS 쪽 배선을 **같이** 걷어냈다(한쪽만 남기면 조용히 죽은 배선이 된다). */
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uCycleN;
uniform float uFilmH;
uniform float uLayerH;
uniform float uGpc;
uniform float uPhase;
uniform float uAdsorbed;
uniform float uReacted;
uniform float uGasA;
uniform float uGasB;
uniform float uByproduct;
uniform float uSatCov;
uniform float uSaturation;
uniform float uTemperature;
${NOISE_GLSL}
${DRAW_GLSL}

/* 왼쪽 챔버 패널 */
/* 🔴 「SUB_TOP」 → 「ALD_SUB_TOP」 으로 개명했다(2026-08-22 · check-scene-constants B1).
   종전 이름이 「models/polishProfile.model.ts:24」 의 TS 상수 「SUB_TOP」(= 0.30, 「기판 상면」)과
   **같은 이름**이라 grep 으로 구별이 안 됐다. 🔴 **값은 그대로 0.30 이다 — 이름만 갈랐다.**
   🔴 **통일하지 않은 이유:** 값이 우연히 같을 뿐 뜻이 같지 않다. 이쪽은 화면 왼쪽
   **챔버 패널 안**(x = XA0~XA1)의 기판 상면이고, polishProfile 쪽은 **캔버스 전폭**의 기판 상면이다.
   두 씬은 어느 실습 칸에서도 병치되지 않으므로(병치 칸은 deposition/lab-advanced 의
   aldCycle+ionTrajectory 하나뿐이다) 높이가 일치해야 할 이유가 없다.
   「layout.model.ts」 로 올리면 **없던 결합**이 생겨 polishProfile 을 고칠 때 이 씬이 조용히 따라 움직인다
   — 그 파일 머리주석도 「여러 씬이 **같은 뜻으로** 쓰는 값만 둔다」고 못박고 있다.
   🔴 뒤집으려면: 두 씬의 기판 상면을 **일부러 맞춰야 한다**는 교육 설계 근거가 나올 때다(PLN·DSN 소관). */
const float SUB_BOT = 0.18;
const float ALD_SUB_TOP = 0.30;
const float XA0 = 0.05;
const float XA1 = 0.50;
const float NSITE = 26.0;
/* 오른쪽 계단 그래프 패널 */
const float PX0 = 0.62;
const float PX1 = 0.97;
const float PY0 = 0.30;
const float PY1 = 0.92;
const float CYCLE_MAX = ${glslFloat(CYCLE_MAX)};
const float LAYER_MAX = ${glslFloat(Number(LAYER_MAX.toFixed(7)))};   // = 0.40 / 24 (TS LAYER_MAX 주입)
/* 온도창 막대 · 사이클 타임라인 */
const float TB_Y0 = 0.10;
const float TB_Y1 = 0.17;
const float TL_Y0 = 0.055;
const float TL_Y1 = 0.125;

/* 🔴 막 상단은 **모델의 filmHeight 를 그대로** 쓴다. 여기서 다시 조립하면 정본이 둘이 된다.
   종전에는 (uCycleN + uReacted) * uLayerH 로 조립해 4단계 애니메이션의 uReacted 를 두께에 더했고,
   그래서 사이클을 올렸는데 막이 얇아지는 구간이 생겼다(D-5b). */
float aldFilmTop() { return ALD_SUB_TOP + uFilmH; }

/* ═══ 🔴 **배경을 칠하지 않는다 — 뒤의 실사 장비 사진이 비쳐야 한다.**
   (2026-09-01 · 근거: DSN 스레드 §S8-3 「계열 II 15칸이 전면을 불투명하게 덮는다」 ·
    선례 src/viz/gl/scenes/filmGrowth.ts 160~215행 — 2026-08-22 에 같은 결함을 이미 한 번 고쳤다)

   종전에는 패널마다 vec3 col = uBg 로 시작해 화면 전체를 페이지 바탕색으로 채우고
   마지막에 vec4(col, 1.0) 으로 내보냈다. 그래서 common.ts 의 clear() 가 투명하게 지워 놓은 것을
   셰이더가 **불투명하게 덮어썼다** — 실측(2026-09-01 · 320x200 dpr 1 · dark):
   빈 자리(알파 8/255 이하) 면적 **0.0 %**, 꽉 찬 자리 **100.0 %**.
   그 상태에서 CSS opacity 를 낮추면 「겹침」이 아니라 **「사진↔도해 크로스페이드」**가 되어
   도해도 사진도 제대로 안 보인다. 여기서는 **그린 것에만 커버리지**를 주고 나머지는 알파 0 이다.

   🔴 컨텍스트는 premultipliedAlpha: true 다(src/viz/gl/context.ts 121행). 아래 두 함수는
      「색 × 커버리지」로 누적하므로 결과가 **이미 프리멀티플라이드**이며 그대로 내보내면 된다.

   🔴 **무엇을 배경으로 판정했는가(넷뿐이다):**
      ① 패널 바깥 여백(main 의 else 가지) ② 챔버 패널의 기상 공간
      ③ 계단 그래프 패널의 판때기 ④ 포화 곡선 인셋의 판때기.
   🟢 **지우지 않은 것:** 전구체 A/B 가스·부산물 점(물리적으로 의미 있는 요소라 알파만 줬다) ·
      기판 · 층 · 흡착 자리 · 계단/격자/축 · 온도창 막대 · 사이클 타임라인.
   🔵 판때기(③④)를 없앤 근거: 이미 계열 I 인 차트 씬이 판때기 없이 축·격자를 바로 그린다
      (probeScrub.ts 225행 vec4 dst = vec4(0.0) · moistureSoak.ts 123행 col/a 누적).
      저장소 관례를 따랐다. **색은 한 성분도 바꾸지 않았다 — 알파만 도입했다.** ═══ */

/** 불투명 색 c 를 커버리지 k 로 덮어 얹는다(over 합성 · 프리멀티플라이드). */
void over(inout vec4 dst, vec3 c, float k) {
  float m = clamp(k, 0.0, 1.0);
  dst.rgb = dst.rgb * (1.0 - m) + c * m;
  dst.a = dst.a * (1.0 - m) + m;
}
/** 빛나는 요소를 세기 k 로 더한다(종전 col += 자리 · filmGrowth 179~180행과 같은 형태). */
void plus(inout vec4 dst, vec3 c, float k) {
  float m = clamp(k, 0.0, 1.0);
  dst.rgb += c * m;
  dst.a = clamp(dst.a + m, 0.0, 1.0);
}

// 기상 분자 점: 셀 해시로 흩뿌리고 시간에 따라 흘린다. density 가 0 이면 사라진다.
float aldGasDots(vec2 uv, float density, float scale, float drift, float seed) {
  if (density <= 0.001) return 0.0;
  vec2 q = vec2(uv.x * scale + seed, uv.y * scale + uTime * drift);
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash12(cell + seed);
  float on = step(1.0 - density * 0.55, h);
  return on * (1.0 - smoothstep(0.12, 0.30, length(f)));
}

vec4 chamberPanel(vec2 uv) {
  vec4 dst = vec4(0.0);   // 🔴 기상 공간은 비운다 — 종전 vec3 col = uBg 자리
  float filmTop = aldFilmTop();

  vec3 substrate = mix(vec3(0.19, 0.21, 0.25), vec3(0.28, 0.31, 0.36), fbm(vec2(uv.x * 40.0, uv.y * 40.0)));
  vec3 filmCol = vec3(0.32, 0.56, 0.78);
  vec3 colA = vec3(0.96, 0.70, 0.32);
  vec3 colB = vec3(0.38, 0.86, 0.66);

  // 기상 분자(전구체 A / B / 부산물) — 퍼지 단계에서 밀도가 0 으로 빠진다
  // 🔴 지우지 않았다. 물리적으로 의미 있는 요소라 **알파만** 줬다(빈 자리로 판정하지 않는다).
  float gasZone = step(filmTop + 0.01, uv.y) * bandMask(uv.x, XA0 - 0.02, XA1 + 0.02);
  plus(dst, colA, aldGasDots(uv, uGasA, 46.0, -0.55, 0.0) * gasZone * 0.95);
  plus(dst, colB, aldGasDots(uv, uGasB, 46.0, -0.55, 17.0) * gasZone * 0.95);
  plus(dst, vec3(0.72, 0.74, 0.80), aldGasDots(uv, uByproduct, 70.0, 0.9, 41.0) * gasZone * 0.6);

  // 기판
  float inSub = bandMask(uv.y, SUB_BOT, ALD_SUB_TOP) * bandMask(uv.x, XA0 - 0.02, XA1 + 0.02);
  over(dst, substrate, inSub);

  // 사이클마다 한 겹 — 층 경계선이 계단 그래프의 계단 수와 일치한다
  float inFilm = bandMask(uv.y, ALD_SUB_TOP, filmTop) * bandMask(uv.x, XA0 - 0.02, XA1 + 0.02);
  float h = uv.y - ALD_SUB_TOP;
  float li = uLayerH > 1e-5 ? h / uLayerH : 0.0;
  float partial = step(uCycleN, li);                 // 진행 중인 맨 위 층
  over(dst, filmCol * (0.85 + 0.30 * fbm(vec2(uv.x * 60.0, uv.y * 90.0))), inFilm);
  over(dst, colB * 0.75, inFilm * partial * 0.55);
  float fl = fract(li);
  float lamina = (uLayerH * uRes.y > 3.0) ? lineMask(min(fl, 1.0 - fl), 0.055) : 0.0;
  plus(dst, vec3(0.80, 0.90, 1.00), lamina * inFilm * 0.55);
  plus(dst, vec3(1.0), lineMask(uv.y - filmTop, 0.0016) * bandMask(uv.x, XA0 - 0.02, XA1 + 0.02) * 0.6);

  // 표면 흡착 자리 — 점유율이 uAdsorbed. 포화 상한(uSatCov) 이상은 절대 안 붙는다(자기제한)
  float siteW = (XA1 - XA0) / NSITE;
  float idx = floor((uv.x - XA0) / siteW);
  float cx = XA0 + (idx + 0.5) * siteW;
  float r = siteW * 0.40;
  float d = length(vec2(uv.x - cx, uv.y - (filmTop + r * 0.75)));
  float occupied = step(hash11(idx * 1.37 + 3.0), uAdsorbed);
  float inRange = bandMask(uv.x, XA0, XA1);
  float bump = (1.0 - smoothstep(r * 0.72, r, d)) * occupied * inRange;
  over(dst, mix(colA, colB, uReacted), bump);

  // 포화 곡선 인셋: 노출량↑ → 흡착률이 평탄해진다(더 넣어도 안 는다)
  float ix0 = 0.31, ix1 = 0.51, iy0 = 0.76, iy1 = 0.92;
  float inInset = bandMask(uv.x, ix0, ix1) * bandMask(uv.y, iy0, iy1);
  if (inInset > 0.5) {
    /* 🔴 인셋 안은 챔버 그림을 지운다 — 종전 col = uBg 와 **같은 자리**이며 판때기만 없앴다.
       (인셋 밖으로 새는 그림이 없어야 곡선이 읽힌다. 지우는 범위는 종전과 한 픽셀도 다르지 않다.) */
    dst = vec4(0.0);
    float gx = (uv.x - ix0) / (ix1 - ix0);
    float gy = (uv.y - iy0) / (iy1 - iy0);
    float curve = 1.0 - exp(-${glslFloat(SAT_K)} * gx);
    over(dst, uS1, clamp(lineMask(gy - curve, 0.035) * 0.95, 0.0, 1.0));
    over(dst, uInfo, clamp(lineMask(gx - uSaturation, 0.010) * 0.85, 0.0, 1.0));
    over(dst, uSpec, clamp(lineMask(gy - uSatCov, 0.012) * 0.55, 0.0, 1.0));   // 도달한 포화 상한
    over(dst, uInk, clamp((lineMask(gy, 0.012) + lineMask(gx, 0.012)) * 0.6, 0.0, 1.0));
  }
  return dst;
}

// 계단 그래프: x = 사이클, y = 두께. 계단 모서리가 직선 위에 얹히면 선형이다.
// 🔴 판때기(종전 vec3 col = uBg)를 걷어냈다 — 격자·축·계단만 그린다(계열 I 차트 씬 관례).
vec4 stairPanel(vec2 uv) {
  vec4 dst = vec4(0.0);
  float gx = (uv.x - PX0) / (PX1 - PX0);
  float gy = (uv.y - PY0) / (PY1 - PY0);
  float c = gx * CYCLE_MAX;
  float yMax = CYCLE_MAX * LAYER_MAX;      // 축 고정 — 기울기 변화가 그대로 보인다

  // 격자
  float fc = fract(c * 0.25);
  float fg = fract(gy * 5.0);
  float gv = lineMask(min(fc, 1.0 - fc), 0.012);
  float gh = lineMask(min(fg, 1.0 - fg), 0.012);
  over(dst, uInfo, clamp((gv + gh), 0.0, 1.0));

  // 계단: c 사이클 시점의 두께. 진행 중인 사이클은 부분 높이로 올라간다
  float k = floor(c);
  float v = -1.0;
  if (c < uCycleN) v = (k + 1.0) * uLayerH / yMax;
  else if (c < uCycleN + 1.0) v = uFilmH / yMax;   // 진행 중인 맨 위 계단 = 실제 막 두께
  float has = step(0.0, v);
  over(dst, uS1, has * step(gy, v) * 0.85);
  over(dst, uS1, clamp(has * lineMask(gy - v, 0.005) * 0.95, 0.0, 1.0));

  // 이상 선형선(원점에서 뻗은 직선, 기울기 = 사이클당 성장) — 계단 위에 겹쳐 그려
  // **계단 모서리가 이 직선 위에 정확히 얹히는 것**을 보게 한다. ALD 선형성의 증거다.
  float lin = c * uLayerH / yMax;
  float dash = step(0.5, fract(gx * 42.0));
  over(dst, uInfo, clamp(lineMask(gy - lin, 0.006) * dash * 1.1, 0.0, 1.0));

  // 현재 두께 수평 점선 — 왼쪽 단면의 막 상단과 같은 값이다
  float cur = uFilmH / yMax;
  float dash2 = step(0.5, fract(gx * 30.0));
  over(dst, uS2, clamp(lineMask(gy - cur, 0.004) * dash2 * 0.65, 0.0, 1.0));

  // 축
  over(dst, uInk, clamp((lineMask(gy, 0.006) + lineMask(gx, 0.006)) * 0.8, 0.0, 1.0));
  return dst;
}

// 온도창 막대: 저온 이탈대 / 창 / 고온 이탈대 3구간 + 현재 위치 마커. 숫자·글자 없음(U-8).
// 🔴 이 막대 자체가 **그린 것**이다(배경이 아니다) — 막대 안은 종전대로 불투명(알파 1)이고,
//    막대 밖은 main 이 알파 0 으로 남긴다.
vec4 tempBar(vec2 uv) {
  float g = (uv.x - PX0) / (PX1 - PX0);
  // 🔴 전이 구간은 TS 상수에서 그대로 박아 넣는다 — 손으로 적으면 temperatureWindow() 와 조용히 갈린다.
  float win = smoothstep(${glslFloat(TEMP_RAMP_LO[0])}, ${glslFloat(TEMP_RAMP_LO[1])}, g) * (1.0 - smoothstep(${glslFloat(TEMP_RAMP_HI[0])}, ${glslFloat(TEMP_RAMP_HI[1])}, g));
  vec3 bad = uSpec;
  vec3 good = uS2;
  vec3 col = mix(bad, good, win);
  float hatch = step(0.5, fract((uv.x * 60.0 + uv.y * 60.0)));
  col = mix(col, col * 0.55, (1.0 - win) * hatch * 0.7);
  vec4 dst = vec4(col, 1.0);   // 알파 1 = 프리멀티플라이드 상태에서 rgb 는 그대로다
  over(dst, uInk, clamp(lineMask(g - uTemperature, 0.010) * 0.95, 0.0, 1.0));
  return dst;
}

// 사이클 타임라인: 전구체A · 퍼지 · 전구체B · 퍼지 4구간 + 재생 헤드.
// 🔴 tempBar 와 같다 — 이 막대 자체가 그린 것이므로 막대 안은 불투명하게 남긴다.
vec4 timeline(vec2 uv) {
  float g = (uv.x - 0.03) / (0.53 - 0.03);
  float seg = floor(clamp(g, 0.0, 0.9999) * 4.0);
  vec3 colA = uS1;
  vec3 colB = uS2;
  vec3 purge = uInfo;
  vec3 col = (seg < 0.5) ? colA : ((seg < 1.5) ? purge : ((seg < 2.5) ? colB : purge));
  col *= 0.45;
  float segOn = step(abs(seg - floor(clamp(uPhase, 0.0, 0.9999) * 4.0)), 0.1);   // 'active' 는 GLSL 예약어다
  col *= (0.6 + 0.9 * segOn);
  float fs = fract(g * 4.0);
  vec4 dst = vec4(col, 1.0);
  over(dst, uInk, clamp(lineMask(min(fs, 1.0 - fs), 0.02), 0.0, 1.0));
  over(dst, uInk, clamp(lineMask(g - uPhase, 0.006) * 0.95, 0.0, 1.0));
  return dst;
}

void main() {
  vec2 uv = vUv;
  vec4 dst;
  if (uv.x > 0.57) {
    if (uv.y > PY0 - 0.02 && uv.y < PY1 + 0.02 && uv.x > PX0 - 0.02 && uv.x < PX1 + 0.02) dst = stairPanel(uv);
    else if (uv.y > TB_Y0 && uv.y < TB_Y1 && uv.x > PX0 && uv.x < PX1) dst = tempBar(uv);
    else dst = vec4(0.0);   // 🔴 패널 바깥 여백 = 배경. 비운다(종전 col = uBg 자리)
  } else {
    if (uv.y > TL_Y0 && uv.y < TL_Y1 && uv.x > 0.03 && uv.x < 0.53) dst = timeline(uv);
    else dst = chamberPanel(uv);
  }
  over(dst, uInk, clamp(lineMask(uv.x - 0.565, 0.0012) * 0.7, 0.0, 1.0));

  // 성장률이 무너지면 화면 전체가 식는다. 🔴 uGpc 는 **성장률**이지 온도창 계수가 아니다 —
  // 온도창 이탈은 아래 온도 막대의 마커 위치·색이 말한다(두 개는 별개의 사실이다).
  // 🔴 감쇠·비네팅은 **그려진 것에만** 건다(rgb 만 곱한다) — 배경을 어둡게 만들지 않는다.
  //    프리멀티플라이드에서 rgb 에만 곱해도 rgb <= a 가 유지되므로 합성이 깨지지 않는다.
  dst.rgb *= 0.55 + 0.45 * clamp(uGpc, 0.0, 1.0);

  float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0)));
  dst.rgb *= 0.80 + 0.20 * vig;
  fragColor = dst;
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  /* 🔴 bg 는 없앴다(2026-09-01) — 셰이더가 배경을 칠하지 않으므로 uBg 를 안 쓴다. */
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
  cycleN: WebGLUniformLocation | null;
  filmH: WebGLUniformLocation | null;
  layerH: WebGLUniformLocation | null;
  gpc: WebGLUniformLocation | null;
  phase: WebGLUniformLocation | null;
  adsorbed: WebGLUniformLocation | null;
  reacted: WebGLUniformLocation | null;
  gasA: WebGLUniformLocation | null;
  gasB: WebGLUniformLocation | null;
  byproduct: WebGLUniformLocation | null;
  satCov: WebGLUniformLocation | null;
  saturation: WebGLUniformLocation | null;
  temperature: WebGLUniformLocation | null;
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
  let m: AldCycleModel = aldCycleModel({});
  let saturation = 0.7;
  let temperature = 0.5;

  return {
    id: 'aldCycle',
    animated: true, // 기상 분자가 흐른다
    init(gl) {
      ctx = gl;
      prog = gl.program('aldCycle', FULLSCREEN_VS, ALD_CYCLE_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        cycleN: gl.uniform(prog, 'uCycleN'),
        filmH: gl.uniform(prog, 'uFilmH'),
        layerH: gl.uniform(prog, 'uLayerH'),
        gpc: gl.uniform(prog, 'uGpc'),
        phase: gl.uniform(prog, 'uPhase'),
        adsorbed: gl.uniform(prog, 'uAdsorbed'),
        reacted: gl.uniform(prog, 'uReacted'),
        gasA: gl.uniform(prog, 'uGasA'),
        gasB: gl.uniform(prog, 'uGasB'),
        byproduct: gl.uniform(prog, 'uByproduct'),
        satCov: gl.uniform(prog, 'uSatCov'),
        saturation: gl.uniform(prog, 'uSaturation'),
        temperature: gl.uniform(prog, 'uTemperature'),
      };
    },
    update(params: SceneParams) {
      m = aldCycleModel(params);
      saturation = pick(params, 'saturation', saturation);
      temperature = pick(params, 'temperature', temperature);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      const pal = readVizPalette(ctx.canvas);
      set3(gl, u.ink, pal.ink, pal.ink);
      set3(gl, u.spec, pal.spec, pal.ink);
      set3(gl, u.info, pal.info, pal.ink);
      set3(gl, u.s1, pal.series[0], pal.ink);
      set3(gl, u.s2, pal.series[1], pal.ink);

      if (u.cycleN) gl.uniform1f(u.cycleN, m.cycleCount);
      if (u.filmH) gl.uniform1f(u.filmH, m.filmHeight);
      if (u.layerH) gl.uniform1f(u.layerH, m.layerHeight);
      if (u.gpc) gl.uniform1f(u.gpc, m.gpc);
      if (u.phase) gl.uniform1f(u.phase, Math.min(m.stage / 4 + m.local / 4, 0.999999));
      if (u.adsorbed) gl.uniform1f(u.adsorbed, m.adsorbed);
      if (u.reacted) gl.uniform1f(u.reacted, m.reacted);
      if (u.gasA) gl.uniform1f(u.gasA, m.gasA);
      if (u.gasB) gl.uniform1f(u.gasB, m.gasB);
      if (u.byproduct) gl.uniform1f(u.byproduct, m.byproduct);
      if (u.satCov) gl.uniform1f(u.satCov, m.satCoverage);
      if (u.saturation) gl.uniform1f(u.saturation, saturation);
      if (u.temperature) gl.uniform1f(u.temperature, temperature);
      ctx.drawFullscreen();
    },
    dispose() {
      ctx = null;
      prog = null;
      u = null;
    },
  };
}
