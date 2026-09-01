/**
 * 씬: CZ(초크랄스키) 핫존 **수직 종단면** — 웨이퍼 공정 3칸(기초·응용·심화) 공용.
 *
 * 🔴 **2026-08-21 DSN S-D 확정명세(`DSN-8대공정-001.SD.md` §2)로 재배선.** 계산 정본은 셰이더가 아니라
 *    `models/crystalGrowth.model.ts` 다 — 아래 7키의 뜻과 D-1~D-10 공식은 그 파일 머리말이 정본이고,
 *    여기서는 셰이더가 무엇을 유니폼으로 받는지만 요약한다.
 *
 * 씬 키(전부 0~1. 물리 앵커 → 정규화는 `models/labs/wafer.ts` 가 한다. **씬은 outputs 를 받지 않는다**):
 *   pullRate         잉곳 바디 폭 + 메니스커스 밝은 링 2개(같은 방향·같은 크기) + 계면 볼록도(볼록→평탄)
 *                    + 파셋(습관선) 스크롤 속도(대비는 상수 — 「구조 손실」로 읽히는 것을 막는다)
 *   thermalGradient  결정 내 등온선의 간격·개수(간격 **∝ 1/G**) + 표면 열응력 표시 농도(명도만)
 *   crystalRotation  계면 등온선의 좌우 비대칭 ↓ + 시드 회전 원호 화살표 각속도(실제 회전 주기, 배율 1.0)
 *   crucibleRotation 도가니 회전 원호 화살표 각속도(**부호 반대**, 배율 1.0) + 내벽 미립 생성률·상승 속도
 *   argonFlow        SiO 흄 알파 + 뷰포트·냉벽 응축 분말층 두께 + 아르곤 유선 가닥 수·하강 속도
 *   chamberPressure  SiO 흄 알파(로그 앵커로 넘어온다) — 비단조 반전은 위치 미확인이라 그리지 않는다
 *   solidFraction    융액 자유표면 높이(D-11) — 0=자유표면 v0.622(정지 기하) → 1=도가니 내부 바닥
 *                    v0.744. 대응 lab 입력이 없어 세 칸 모두 **항상 0** 이지만, 값은 실제로 읽어 쓴다
 *                    (자체 타이머로 애니메이션하지는 않는다 — §2-5 #14는 그것만 금지한다)
 *   ※ V–I 경계 세로선 2가닥은 8번째 키를 받지 않는다 — 모델이 `pullRate`·`thermalGradient` 에서
 *     ξ = 10V/G 를 직접 되계산한다(칸간 정합을 위해 outputs 를 우회한다).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 **그리지 않은 것 — 근거가 없어서 뺐다(A15).** 지어내면 안 되는 목록이다.
 *   · **도펀트 농도에 따른 융액 색 변화** — 조사 A 에 도펀트·편석 근거 0건. 도펀트는 ppb 수준이라
 *     눈에 보이지 않는다(그래서 색이 아니라 **저항률**로 잰다). 씬명세 §2-2 기각③.
 *   · **도가니 침식의 갈색 반점** — 색·형태 근거 0건. 무채색 미립 표시로만 그린다.
 *   · **구조 손실(파셋 소실 애니메이션)** — DSN §2-5 #7 이 명시 금지. 나선 슬립 라인·다결정 다각형
 *     패치 같은 시각 형태도 근거가 없다. 그래서 **파셋 대비는 `pullRate` 에 걸지 않고 상수로 고정했다**
 *     — 인상속도를 올려도 파셋이 옅어지거나 사라지지 않는다(옅어지는 것 자체가 「구조 손실」로 읽힌다).
 *     `pullRate` 가 바꾸는 것은 **스크롤 속도뿐**이다(D-10, WB-4).
 *   · **σ_D(직경 편차)** — 200 mm 잉곳에서 ±0.34 px 서브픽셀이라 관찰 불가.
 *     `wafer.diameterZoom` 확대 차트가 판정한다 — PLN 명세 「판정은 이 차트에서 한다」.
 *   · **등온선 온도 숫자 · 회전수 절대치 · G 절대치** — 근거 있는 값이 1,414 °C 하나뿐이고
 *     나머지는 PLN 이 「출처 미확보」로 자인했다. **선만 그리고 숫자를 쓰지 않는다.**
 *   · **챔버 압력의 비단조 반전** — 반전이 일어나는 위치가 미확인이다. 위치를 임의로 박으면
 *     그 순간 A15 위반이므로 **반전을 그리지 않았다.** (씬명세 CG-D8 · §E-⑤)
 *   · **판정색·합격 배지·잉곳 은청색 채색** — 씬 밖(`viz/svg` 오버레이 소관, 씬명세 §6-4).
 *
 * 🔴 **재료색:** 실리콘 융액은 **주황이 아니다.** 1,414 °C 이상 융액은 흰빛에 가깝고 표면은
 *    거울처럼 반사한다. 주황~백열은 **히터에만** 쓴다(조사 A §F-5 정정).
 *
 * ✅ **Canvas2D 폴백 등재 완료(2026-08-22).** `gl/fallback2d.ts` 의 `drawCrystalGrowth` 와
 *    `check-fallback-purity.mjs` 의 `SCENE_DRAWERS` 표 등재가 함께 들어갔다.
 *    WebGL2 미지원 기기에서도 이 씬은 **간이 렌더로 뜬다**(3칸 전수 실측 · 배지 `--fallback`).
 *    🔴 폴백은 이 파일이 아니라 **`models/crystalGrowth.model.ts` 를 import 해서 그린다** —
 *    셰이더가 폴백 청크로 딸려오지 않게 하려는 것이고, 식을 옮겨 적으면 정본이 둘이 된다.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 **화면 배치값의 정본은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/crystalGrowth.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    파생값(계면 볼록 깊이·등온선 간격·경계 반경·회전 각속도 …)도 그 모듈이 계산한다 —
 *    셰이더는 받은 수를 그리기만 한다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, setCommonUniforms, clear } from './common';
import { AXIS_X } from './models/layout.model';
import { readVizPalette, type Rgb3 } from './theme';
import {
  crystalGrowthModel,
  MELT_BOTTOM,
  NECK_HALF, NECK_TOP, SHOULDER_TOP, CHUCK_BOTTOM, CHUCK_HALF,
  CRUCIBLE_HALF, CRUCIBLE_WALL, SUSCEPTOR_WALL,
  HEATER_INNER, HEATER_OUTER, HEATER_TOP, HEATER_BOTTOM, HEATER_MEANDER_FREQ,
  BOTTOM_HEATER_TOP, BOTTOM_HEATER_BOTTOM, BOTTOM_HEATER_HALF, INSULATION_OUTER,
  SHIELD_INNER_HALF, SHIELD_OUTER_HALF, SHIELD_BOTTOM, SHIELD_TOP,
  VIEWPORT_X, VIEWPORT_Y0, VIEWPORT_Y1,
  ISOTHERM_COUNT_MAX,
  CRYSTAL_ARC_RADIUS, CRYSTAL_ARC_Y, CRUCIBLE_ARC_RADIUS, CRUCIBLE_ARC_Y,
  PARTICLE_SLOTS, PARTICLE_SIZE, FUME_SPAN, FACET_FREQ,
  COLOR_MELT_SI, COLOR_MELT_SI_HI, COLOR_HEATER, COLOR_HEATER_HOT, COLOR_CRYSTAL,
  COLOR_QUARTZ, COLOR_GRAPHITE, COLOR_INSULATION, COLOR_SHIELD, COLOR_CHUCK,
  COLOR_ARGON, COLOR_FUME, COLOR_POWDER, COLOR_PARTICLE,
  COLOR_MENISCUS,
  type CrystalGrowthModel, type Rgb,
} from './models/crystalGrowth.model';

export { crystalGrowthModel } from './models/crystalGrowth.model';
export type { CrystalGrowthModel } from './models/crystalGrowth.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}
/** 재료색을 GLSL vec3 리터럴로 찍는다. */
function glslRgb(c: Rgb): string {
  return `vec3(${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])})`;
}

/**
 * 셰이더 설명 5줄:
 * 1) 챔버 배경 → 단열재 → 미앤더 히터(좌·우 + 바닥) → 흑연 서셉터 → 석영 도가니 → 융액 순으로
 *    바깥에서 안으로 칠한다. **주황은 히터에만** 들어간다.
 * 2) 융액 자유표면 위에 잉곳을 세운다. 시드척–넥–숄더–바디의 반폭을 `ingotHalf(y)` 하나가 준다.
 *    고액계면은 바디 반폭 안에서 `uConvexDepth` 만큼 융액 쪽으로 파고든 포물선이다.
 * 3) 결정 안에 등온선 5개(간격 `uIsoSpacing`, 좌우 비대칭 `uIsoAsym`)와 V–I 경계 세로선 2가닥
 *    (반경 `uViRadius`)을 얹는다. 성장 파셋 줄무늬가 `uPullAnim` 속도로 위로 흐른다.
 * 4) 좌·우 삼중점에 **메니스커스 밝은 링 2개**를 찍는다 — 프레임 최고휘도 화소이고,
 *    실제 장비가 지름을 재는 신호다. 회전 원호 화살표 2개는 **부호가 항상 반대**로 돈다.
 * 5) 아르곤 유선이 위에서 내려와 아래로 빠지고, SiO 흄이 자유표면 위에 뜬 뒤 배기 쪽으로
 *    쓸려 나간다. 뷰포트(냉벽)에는 응축 분말층이 두께를 갖고 쌓인다.
 */
export const CRYSTAL_GROWTH_FS = `${FRAG_HEAD}
/* 🔴 테마 토큰 — CSS(\`--viz-info\`·\`--viz-series-*\`)에서 읽어 매 draw 마다 올린다.
   재료색([B])은 모델 상수 그대로이고, 여기 유니폼은 **지시선·표식([A])** 만 담당한다.
   🔴 2026-09-01 \`uBg\` 삭제 — 배경을 셰이더가 칠하지 않게 되면서 쓰는 곳이 사라졌다(main 머리말 참조). */
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uBodyHalf;
uniform float uMeltSurface;
uniform float uMeniscusRadius;
uniform float uConvexDepth;
uniform float uIsoSpacing;
uniform float uIsoCount;
uniform float uIsoAsym;
uniform float uViRadius;
uniform float uCrystalOmega;
uniform float uCrucibleOmega;
uniform float uParticleCount;
uniform float uParticleRise;
uniform float uArgonLines;
uniform float uArgonSpeed;
uniform float uFume;
uniform float uPowder;
uniform float uFacet;
uniform float uPullAnim;
uniform float uStress;
${NOISE_GLSL}
${DRAW_GLSL}

/* 🔴 아래 배치값은 models/crystalGrowth.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다.
   물리 상수는 하나도 없다: 이 씬이 그리는 물리량은 전부 랩 출력을 정규화해 uniform 으로 받는다. */
const float AXIS_X = ${glslFloat(AXIS_X)};
const float MELT_BOTTOM = ${glslFloat(MELT_BOTTOM)};
const float NECK_HALF = ${glslFloat(NECK_HALF)};
const float NECK_TOP = ${glslFloat(NECK_TOP)};
const float SHOULDER_TOP = ${glslFloat(SHOULDER_TOP)};
const float CHUCK_BOTTOM = ${glslFloat(CHUCK_BOTTOM)};
const float CHUCK_HALF = ${glslFloat(CHUCK_HALF)};
const float CRUCIBLE_HALF = ${glslFloat(CRUCIBLE_HALF)};
const float CRUCIBLE_WALL = ${glslFloat(CRUCIBLE_WALL)};
const float SUSCEPTOR_WALL = ${glslFloat(SUSCEPTOR_WALL)};
const float HEATER_INNER = ${glslFloat(HEATER_INNER)};
const float HEATER_OUTER = ${glslFloat(HEATER_OUTER)};
const float HEATER_TOP = ${glslFloat(HEATER_TOP)};
const float HEATER_BOTTOM = ${glslFloat(HEATER_BOTTOM)};
const float HEATER_MEANDER_FREQ = ${glslFloat(HEATER_MEANDER_FREQ)};
const float BOTTOM_HEATER_TOP = ${glslFloat(BOTTOM_HEATER_TOP)};
const float BOTTOM_HEATER_BOTTOM = ${glslFloat(BOTTOM_HEATER_BOTTOM)};
const float BOTTOM_HEATER_HALF = ${glslFloat(BOTTOM_HEATER_HALF)};
const float INSULATION_OUTER = ${glslFloat(INSULATION_OUTER)};
const float SHIELD_INNER_HALF = ${glslFloat(SHIELD_INNER_HALF)};
const float SHIELD_OUTER_HALF = ${glslFloat(SHIELD_OUTER_HALF)};
const float SHIELD_BOTTOM = ${glslFloat(SHIELD_BOTTOM)};
const float SHIELD_TOP = ${glslFloat(SHIELD_TOP)};
const float VIEWPORT_X = ${glslFloat(VIEWPORT_X)};
const float VIEWPORT_Y0 = ${glslFloat(VIEWPORT_Y0)};
const float VIEWPORT_Y1 = ${glslFloat(VIEWPORT_Y1)};
const float CRYSTAL_ARC_RADIUS = ${glslFloat(CRYSTAL_ARC_RADIUS)};
const float CRYSTAL_ARC_Y = ${glslFloat(CRYSTAL_ARC_Y)};
const float CRUCIBLE_ARC_RADIUS = ${glslFloat(CRUCIBLE_ARC_RADIUS)};
const float CRUCIBLE_ARC_Y = ${glslFloat(CRUCIBLE_ARC_Y)};
const float PARTICLE_SIZE = ${glslFloat(PARTICLE_SIZE)};
const float FUME_SPAN = ${glslFloat(FUME_SPAN)};
const float FACET_FREQ = ${glslFloat(FACET_FREQ)};
const int ISO_COUNT_MAX = ${String(Math.round(ISOTHERM_COUNT_MAX))};
const int PARTICLE_SLOTS = ${String(Math.round(PARTICLE_SLOTS))};

const vec3 C_MELT = ${glslRgb(COLOR_MELT_SI)};
const vec3 C_MELT_HI = ${glslRgb(COLOR_MELT_SI_HI)};
const vec3 C_HEATER = ${glslRgb(COLOR_HEATER)};
const vec3 C_HEATER_HOT = ${glslRgb(COLOR_HEATER_HOT)};
const vec3 C_CRYSTAL = ${glslRgb(COLOR_CRYSTAL)};
const vec3 C_QUARTZ = ${glslRgb(COLOR_QUARTZ)};
const vec3 C_GRAPHITE = ${glslRgb(COLOR_GRAPHITE)};
const vec3 C_INSUL = ${glslRgb(COLOR_INSULATION)};
const vec3 C_SHIELD = ${glslRgb(COLOR_SHIELD)};
const vec3 C_CHUCK = ${glslRgb(COLOR_CHUCK)};
const vec3 C_ARGON = ${glslRgb(COLOR_ARGON)};
const vec3 C_FUME = ${glslRgb(COLOR_FUME)};
const vec3 C_POWDER = ${glslRgb(COLOR_POWDER)};
const vec3 C_PARTICLE = ${glslRgb(COLOR_PARTICLE)};
const vec3 C_MENISCUS = ${glslRgb(COLOR_MENISCUS)};

/** 축에서의 거리(가로). */
float ax(float x) { return abs(x - AXIS_X); }

/** 잉곳 반폭 — 바디 → 숄더 → 넥 을 하나의 함수로 준다. */
float ingotHalf(float y) {
  float t = smoothstep(SHOULDER_TOP, NECK_TOP, y);
  return mix(uBodyHalf, NECK_HALF, t);
}

/** 고액계면 높이 — 바디 반폭 안에서 융액 쪽으로 파고든 포물선. 볼록도 0 이면 평탄. */
float interfaceY(float x) {
  float r = clamp(ax(x) / max(uBodyHalf, 1e-4), 0.0, 1.0);
  return uMeltSurface - uConvexDepth * (1.0 - r * r);
}

/** 열차폐의 반폭(원뿔형) — 아래가 좁고 위가 넓다. */
float shieldHalf(float y) {
  float t = clamp((y - SHIELD_BOTTOM) / max(SHIELD_TOP - SHIELD_BOTTOM, 1e-4), 0.0, 1.0);
  return mix(SHIELD_INNER_HALF, SHIELD_OUTER_HALF, t);
}

/** 원호 화살표 한 개. 중심 (AXIS_X, cy) · 반경 r · 각속도 w(부호가 회전 방향). */
float arcArrow(vec2 uv, float cy, float r, float w, float t) {
  vec2 d = vec2((uv.x - AXIS_X) * (uRes.x / max(uRes.y, 1.0)), uv.y - cy);
  float rad = length(d);
  float ring = lineMask(rad - r, 0.0035);
  float ang = atan(d.y, d.x);
  // 진행 위치 — 부호가 반대면 반대로 돈다.
  float phase = fract((ang / 6.2831853 - w * t) + 1.0);
  // 원호는 한 바퀴 중 40 % 만 남기고, 앞쪽 15 % 를 화살촉처럼 굵게 만든다.
  float body = smoothstep(0.42, 0.38, phase);
  float head = smoothstep(0.06, 0.0, phase) * 1.8;
  return ring * (body + head);
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float a = ax(uv.x);

  /* 🔴 **배경을 칠하지 않는다 — 뒤에 실사 장비 사진이 깔린다.**
     (2026-09-01 · DSN 스레드 §S8-3 · 선례: \`filmGrowth.ts\` 160~215행, 2026-08-22)
     종전에는 \`vec3 col = uBg;\` 로 **화면 전체**를 페이지 바탕색으로 칠하고 \`vec4(col, 1.0)\` 으로
     내보냈다. 그래서 핫존이 아무것도 그리지 않은 빈 자리(챔버 밖 여백)까지 불투명해져 사진을
     덮었고, CSS \`opacity\` 로 낮추면 「겹침」이 아니라 **「사진↔도해 크로스페이드」**가 됐다.
     🔴 **무엇을 배경으로 봤는가:** \`uBg\` **하나뿐**이다. 단열재·히터·서셉터·도가니·융액·열차폐·
        잉곳·시드척·뷰포트는 전부 실재 구조물이고, 메니스커스 링·등온선·V–I 경계·회전 화살표·
        아르곤 유선·SiO 흄·응축 분말은 전부 **물리적으로 의미 있는 표시**다 —
        하나도 지우지 않고 **알파만 줬다.** 도가니 안쪽 융액 위의 빈 공간과 챔버 바깥만 비운다.
     🔴 컨텍스트는 premultipliedAlpha: true (context.ts:121)다. 아래 누적은 대부분
        \`col = mix(col, X, m)\` 인데, col 이 프리멀티플라이드일 때 이 식은 \`X*m + col*(1-m)\`
        즉 **프리멀티플라이드 source-over 그대로**다. 알파만 짝을 맞춰 \`alpha = mix(alpha, 1.0, m)\`
        로 올린다. 가산으로 얹는 것(메니스커스·아르곤)만 \`alpha = clamp(alpha + 세기, 0, 1)\` 이다.
        **색은 한 성분도 바꾸지 않았다.** */
  /* ── 1. 단열재 · 히터 ── */
  vec3 col = vec3(0.0);   // 색 × 커버리지(프리멀티플라이드) 누적
  float alpha = 0.0;      // 커버리지 누적
  float insul = bandMask(a, HEATER_OUTER, INSULATION_OUTER);
  col = mix(col, C_INSUL, insul);
  alpha = mix(alpha, 1.0, insul);

  // 좌·우 미앤더 히터 — 세로로 굽이치는 띠. 주황~백열은 여기에만 쓴다.
  float meander = 0.5 + 0.5 * sin(uv.y * HEATER_MEANDER_FREQ);
  float heaterSide = bandMask(a, HEATER_INNER, HEATER_OUTER) * bandMask(uv.y, HEATER_BOTTOM, HEATER_TOP);
  float heaterBot = bandMask(a, 0.0, BOTTOM_HEATER_HALF) * bandMask(uv.y, BOTTOM_HEATER_BOTTOM, BOTTOM_HEATER_TOP)
                  * (0.5 + 0.5 * sin(uv.x * HEATER_MEANDER_FREQ));
  float heater = clamp(heaterSide * meander + heaterBot, 0.0, 1.0);
  col = mix(col, mix(C_HEATER, C_HEATER_HOT, meander), heater);
  alpha = mix(alpha, 1.0, heater);

  /* ── 2. 서셉터 · 도가니 · 융액 ── */
  float inMeltBox = bandMask(uv.y, MELT_BOTTOM, uMeltSurface);
  float susOuter = CRUCIBLE_HALF + SUSCEPTOR_WALL;
  float susWall = bandMask(a, CRUCIBLE_HALF, susOuter)
                * bandMask(uv.y, MELT_BOTTOM - SUSCEPTOR_WALL, uMeltSurface + SUSCEPTOR_WALL);
  col = mix(col, C_GRAPHITE, susWall);
  alpha = mix(alpha, 1.0, susWall);
  float susFloor = bandMask(a, 0.0, susOuter)
                 * bandMask(uv.y, MELT_BOTTOM - SUSCEPTOR_WALL, MELT_BOTTOM);
  col = mix(col, C_GRAPHITE, susFloor);
  alpha = mix(alpha, 1.0, susFloor);
  float crucInner = CRUCIBLE_HALF - CRUCIBLE_WALL;
  float crucWall = bandMask(a, crucInner, CRUCIBLE_HALF) * bandMask(uv.y, MELT_BOTTOM, uMeltSurface + CRUCIBLE_WALL);
  col = mix(col, C_QUARTZ, crucWall);
  alpha = mix(alpha, 1.0, crucWall);

  float inMelt = bandMask(a, 0.0, crucInner) * inMeltBox;
  if (inMelt > 0.5) {
    // 융액 대류 무늬 — 도가니 각속도가 클수록 무늬가 빨리 감긴다.
    float swirl = fbm(vec2(uv.x * 7.0 + uCrucibleOmega * t * 0.8, uv.y * 9.0 - t * 0.15));
    // 자유표면 쪽은 거울처럼 밝다(실리콘 융액은 주황이 아니다 — §F-5).
    float toSurface = smoothstep(MELT_BOTTOM, uMeltSurface, uv.y);
    vec3 melt = mix(C_MELT, C_MELT_HI, 0.35 * swirl + 0.55 * toSurface * toSurface);
    col = melt;
    alpha = 1.0;   // 융액은 불투명한 실물이다 — 덮어쓰는 것이 맞다

    // 도가니 내벽에서 올라오는 미립 표시 — 개수·속도가 도가니 회전수에 따라 는다.
    float dots = 0.0;
    for (int k = 0; k < PARTICLE_SLOTS; k++) {
      if (float(k) >= uParticleCount) break;
      float fk = float(k);
      float side = (mod(fk, 2.0) < 1.0) ? -1.0 : 1.0;
      float px = AXIS_X + side * (crucInner - 0.012 - 0.055 * hash11(fk * 3.7));
      float py = MELT_BOTTOM + fract(hash11(fk * 1.31) + t * uParticleRise) * (uMeltSurface - MELT_BOTTOM);
      vec2 dd = vec2((uv.x - px) * (uRes.x / max(uRes.y, 1.0)), uv.y - py);
      dots += smoothstep(PARTICLE_SIZE, 0.0, length(dd));
    }
    col = mix(col, C_PARTICLE, clamp(dots, 0.0, 0.85));
  }

  /* ── 3. 열차폐 ── */
  float sh = shieldHalf(uv.y);
  float inShield = bandMask(uv.y, SHIELD_BOTTOM, SHIELD_TOP)
                 * bandMask(a, sh - 0.020, sh + 0.012);
  col = mix(col, C_SHIELD, inShield);
  alpha = mix(alpha, 1.0, inShield);

  /* ── 4. 잉곳(시드척·넥·숄더·바디) ── */
  float ingotH = ingotHalf(uv.y);
  float iy = interfaceY(uv.x);
  float inIngot = bandMask(a, 0.0, ingotH) * bandMask(uv.y, iy, CHUCK_BOTTOM);
  if (inIngot > 0.5) {
    vec3 crystal = C_CRYSTAL;
    // 성장 파셋(습관선) — 위로 흐른다. 인상속도가 오르면 대비가 옅어진다.
    float facet = 0.5 + 0.5 * sin((uv.y - t * uPullAnim) * FACET_FREQ);
    crystal *= 1.0 + uFacet * (facet - 0.5) * 2.0;
    // 표면 열응력 표시 — **명도만** 쓴다(판정색 금지). 가장자리로 갈수록 짙다.
    float rEdge = clamp(a / max(ingotH, 1e-4), 0.0, 1.0);
    crystal *= 1.0 - uStress * rEdge * rEdge;
    col = crystal;
    alpha = 1.0;   // 잉곳도 불투명한 실물이다
  }
  float chuck = bandMask(a, 0.0, CHUCK_HALF) * bandMask(uv.y, CHUCK_BOTTOM, CHUCK_BOTTOM + 0.045);
  col = mix(col, C_CHUCK, chuck);
  alpha = mix(alpha, 1.0, chuck);

  /* ── 5. 결정 내부 — 등온선 5개 · V–I 경계 세로선 2가닥 ── */
  if (inIngot > 0.5) {
    // 계면 형상을 그대로 위로 올린 등온선. 좌우 비대칭은 회전수가 줄인다(정성만).
    float asym = uIsoAsym * (uv.x - AXIS_X) / max(uBodyHalf, 1e-4);
    float base = iy + uIsoSpacing * asym;
    float iso = 0.0;
    for (int k = 1; k <= ISO_COUNT_MAX; k++) {
      if (float(k) > uIsoCount) break; // D-4 — 바디 상단을 넘는 가닥은 그리지 않는다(개수는 모델이 정한다)
      float line = base + float(k) * uIsoSpacing;
      iso += lineMask(uv.y - line, 0.0016);
    }
    col = mix(col, uInfo, clamp(clamp(iso, 0.0, 1.0) * 0.55, 0.0, 1.0));

    // V–I 경계 — 반경이 0 이면 두 가닥이 축에서 만난다(침입형 과잉).
    float viX = uViRadius * uBodyHalf;
    float vi = lineMask(a - viX, 0.0018) * step(0.004, viX);
    col = mix(col, uInfo, clamp(vi * 0.85, 0.0, 1.0));
  }

  /* ── 6. 메니스커스 밝은 링 2개 (좌·우 삼중점) — 프레임 최고휘도 ── */
  float arf = uRes.x / max(uRes.y, 1.0);
  float mL = length(vec2((uv.x - (AXIS_X - uBodyHalf)) * arf, uv.y - uMeltSurface));
  float mR = length(vec2((uv.x - (AXIS_X + uBodyHalf)) * arf, uv.y - uMeltSurface));
  float men = smoothstep(uMeniscusRadius, 0.0, min(mL, mR));
  // 🔴 가산으로 얹는다 — 프레임 최고휘도 화소이므로 세기를 그대로 알파에도 더한다.
  col += C_MENISCUS * men * men * 1.25;
  alpha = clamp(alpha + men * men * 1.25, 0.0, 1.0);

  /* ── 7. 회전 원호 화살표 2개 — 부호가 항상 반대다 ── */
  float arcC = clamp(arcArrow(uv, CRYSTAL_ARC_Y, CRYSTAL_ARC_RADIUS, uCrystalOmega, t) * 0.55, 0.0, 1.0);
  col = mix(col, uS1, arcC);
  alpha = mix(alpha, 1.0, arcC);
  float arcR = clamp(arcArrow(uv, CRUCIBLE_ARC_Y, CRUCIBLE_ARC_RADIUS, uCrucibleOmega, t) * 0.45, 0.0, 1.0);
  col = mix(col, uS2, arcR);
  alpha = mix(alpha, 1.0, arcR);

  /* ── 8. 아르곤: 상부 유입 → 하부 배기 ── */
  float lane = bandMask(a, SHIELD_OUTER_HALF, HEATER_INNER);
  float wob = 0.010 * sin(uv.y * 18.0 + t * 1.3);
  float streak = fract((uv.x + wob) * uArgonLines * 2.0);
  float argon = lineMask(min(streak, 1.0 - streak), 0.055) * lane
              * (0.35 + 0.65 * fract(uv.y * 3.0 + t * uArgonSpeed));
  col += C_ARGON * argon * 0.30;
  alpha = clamp(alpha + argon * 0.30, 0.0, 1.0);

  /* ── 9. SiO 흄 — 자유표면 위에 뜬 뒤 아르곤을 타고 배기 쪽으로 쓸린다 ── */
  float above = bandMask(uv.y, uMeltSurface, uMeltSurface + FUME_SPAN)
              * bandMask(a, uBodyHalf, CRUCIBLE_HALF);
  float drift = fbm(vec2(uv.x * 6.0 + t * (0.05 + uArgonSpeed), (uv.y - uMeltSurface) * 16.0 - t * 0.25));
  float fade = 1.0 - smoothstep(uMeltSurface, uMeltSurface + FUME_SPAN, uv.y);
  float fumeA = clamp(above * fade * drift * uFume, 0.0, 1.0);
  col = mix(col, C_FUME, fumeA);
  alpha = mix(alpha, 1.0, fumeA);

  /* ── 10. 뷰포트(냉벽) 응축 분말층 — 두께가 지표다 ── */
  float win = bandMask(uv.y, VIEWPORT_Y0, VIEWPORT_Y1);
  float glass = clamp(win * bandMask(uv.x, VIEWPORT_X, VIEWPORT_X + 0.016) * 0.65, 0.0, 1.0);
  col = mix(col, C_QUARTZ, glass);
  alpha = mix(alpha, 1.0, glass);
  float powder = win * bandMask(uv.x, VIEWPORT_X - uPowder, VIEWPORT_X)
               * (0.55 + 0.45 * vnoise(vec2(uv.y * 90.0, 3.3)));
  float powderA = clamp(powder * step(0.0005, uPowder), 0.0, 1.0);
  col = mix(col, C_POWDER, powderA);
  alpha = mix(alpha, 1.0, powderA);

  /* ── 11. 비네팅 — 🔴 **그려진 것에만** 건다(배경을 어둡게 만들지 않는다). ── */
  float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(arf, 1.0)));
  col *= 0.78 + 0.22 * vig;

  fragColor = vec4(col, alpha);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
  bodyHalf: WebGLUniformLocation | null;
  meltSurface: WebGLUniformLocation | null;
  meniscusRadius: WebGLUniformLocation | null;
  convexDepth: WebGLUniformLocation | null;
  isoSpacing: WebGLUniformLocation | null;
  isoCount: WebGLUniformLocation | null;
  isoAsym: WebGLUniformLocation | null;
  viRadius: WebGLUniformLocation | null;
  crystalOmega: WebGLUniformLocation | null;
  crucibleOmega: WebGLUniformLocation | null;
  particleCount: WebGLUniformLocation | null;
  particleRise: WebGLUniformLocation | null;
  argonLines: WebGLUniformLocation | null;
  argonSpeed: WebGLUniformLocation | null;
  fume: WebGLUniformLocation | null;
  powder: WebGLUniformLocation | null;
  facet: WebGLUniformLocation | null;
  pullAnim: WebGLUniformLocation | null;
  stress: WebGLUniformLocation | null;
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
  let m: CrystalGrowthModel = crystalGrowthModel({});

  return {
    id: 'crystalGrowth',
    animated: true, // 회전 화살표·미립·아르곤 유선·흄이 시간에 따라 움직인다
    init(gl) {
      ctx = gl;
      prog = gl.program('crystalGrowth', FULLSCREEN_VS, CRYSTAL_GROWTH_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        bodyHalf: gl.uniform(prog, 'uBodyHalf'),
        meltSurface: gl.uniform(prog, 'uMeltSurface'),
        meniscusRadius: gl.uniform(prog, 'uMeniscusRadius'),
        convexDepth: gl.uniform(prog, 'uConvexDepth'),
        isoSpacing: gl.uniform(prog, 'uIsoSpacing'),
        isoCount: gl.uniform(prog, 'uIsoCount'),
        isoAsym: gl.uniform(prog, 'uIsoAsym'),
        viRadius: gl.uniform(prog, 'uViRadius'),
        crystalOmega: gl.uniform(prog, 'uCrystalOmega'),
        crucibleOmega: gl.uniform(prog, 'uCrucibleOmega'),
        particleCount: gl.uniform(prog, 'uParticleCount'),
        particleRise: gl.uniform(prog, 'uParticleRise'),
        argonLines: gl.uniform(prog, 'uArgonLines'),
        argonSpeed: gl.uniform(prog, 'uArgonSpeed'),
        fume: gl.uniform(prog, 'uFume'),
        powder: gl.uniform(prog, 'uPowder'),
        facet: gl.uniform(prog, 'uFacet'),
        pullAnim: gl.uniform(prog, 'uPullAnim'),
        stress: gl.uniform(prog, 'uStress'),
      };
    },
    update(params: SceneParams) {
      // 🔴 파생값을 여기서 계산하지 않는다 — 모델 모듈이 정본이다.
      m = crystalGrowthModel(params);
    },
    draw(t) {
      if (!ctx || !prog || !u) return;
      const gl = ctx.gl;
      clear(gl);
      gl.useProgram(prog);
      setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

      // 🔴 매 draw 마다 다시 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다.
      // 🔴 `uBg` 는 2026-09-01 알파 전환에서 삭제했다 — 배경을 셰이더가 칠하지 않는다.
      const pal = readVizPalette(ctx.canvas);
      set3(gl, u.info, pal.info, pal.ink);
      set3(gl, u.s1, pal.series[0], pal.ink);
      set3(gl, u.s2, pal.series[1], pal.ink);

      if (u.bodyHalf) gl.uniform1f(u.bodyHalf, m.bodyHalf);
      if (u.meltSurface) gl.uniform1f(u.meltSurface, m.meltSurfaceV);
      if (u.meniscusRadius) gl.uniform1f(u.meniscusRadius, m.meniscusRadius);
      if (u.convexDepth) gl.uniform1f(u.convexDepth, m.convexDepth);
      if (u.isoSpacing) gl.uniform1f(u.isoSpacing, m.isothermSpacing);
      if (u.isoCount) gl.uniform1f(u.isoCount, m.isothermCount);
      if (u.isoAsym) gl.uniform1f(u.isoAsym, m.isothermAsym);
      if (u.viRadius) gl.uniform1f(u.viRadius, m.viRadius);
      if (u.crystalOmega) gl.uniform1f(u.crystalOmega, m.crystalOmega);
      if (u.crucibleOmega) gl.uniform1f(u.crucibleOmega, m.crucibleOmega);
      if (u.particleCount) gl.uniform1f(u.particleCount, m.particleCount);
      if (u.particleRise) gl.uniform1f(u.particleRise, m.particleRise);
      if (u.argonLines) gl.uniform1f(u.argonLines, m.argonLines);
      if (u.argonSpeed) gl.uniform1f(u.argonSpeed, m.argonSpeed);
      if (u.fume) gl.uniform1f(u.fume, m.fumeDensity);
      if (u.powder) gl.uniform1f(u.powder, m.powderThickness);
      if (u.facet) gl.uniform1f(u.facet, m.facetContrast);
      if (u.pullAnim) gl.uniform1f(u.pullAnim, m.pullAnimSpeed);
      if (u.stress) gl.uniform1f(u.stress, m.stressShade);
      ctx.drawFullscreen();
    },
    dispose() {
      ctx = null;
      prog = null;
      u = null;
    },
  };
}
