/**
 * 씬: 트렌치 단면 스텝 커버리지 (**공용** — PVD 배리어·시드, 다마신 충전 전 단계 공통).
 *
 * 🟢 DSN 권고(12_시각화씬_공백보고 §4-4)에 따라 **PVD 전용으로 만들지 않았다.**
 *    「입구가 있는 홈에 위에서 물질이 날아와 쌓인다」는 기하 문제 하나만 다루므로
 *    금속배선의 배리어·시드 커버리지에도 그대로 쓸 수 있다.
 *
 * 반응 파라미터(전부 0~1 정규화, 물리값 변환은 상위가 한다):
 *   aspectRatio    종횡비 → 트렌치가 좁아진다(깊이 고정). 자기 그림자가 심해져 측벽·바닥이 급격히 얇아진다
 *   directionality 직진성 → 소스 각분포가 좁아진다. 비스듬한 성분이 걸러져 **오버행이 완화**된다
 *   deposited      누적 증착량 → 막이 두꺼워지고, 오버행이 자라 입구가 **핀치오프** → 안쪽에 **보이드** 봉인
 *   pressure       압력 → 아르곤 충돌로 방향이 흩어져 **도달 각도 분포가 넓어진다**(직진성과 반대 방향)
 *
 * 🔴 UI 에 종횡비 임계값(1:1·4:1) 숫자를 쓰지 않는다 — 원장 U-7 로 전문 미열람.
 *    이 씬은 **숫자를 전혀 그리지 않고** 상대 변화(막 두께 비교 게이지)로만 보여준다.
 *
 * ── 시각 모델 ──────────────────────────────────────────────────────────────
 * 장식이 아니라 **가시각(可視角) 적분**으로 구동한다. 트렌치 벽면의 한 점이 받는 플럭스는
 * 그 점에서 「입구를 통해 보이는 하늘」의 각도 범위를 소스 각분포 S(φ)=cos^m(φ) 로 적분한 값이다.
 *   · 측벽(깊이 d):   F = ∫₀^φmax cos^m φ · sin φ dφ / N,  φmax = atan(2·hw_eff / d)   (닫힌 형태)
 *   · 바닥(가로 s):   F = ∫_{φ1}^{φ2} cos^(m+1) φ dφ / N,  φ1,2 = atan((∓hw_eff − s)/H)
 *   · 평탄면:         F = 1 (정규화 기준). N = ∫_{−π/2}^{π/2} cos^(m+1) φ dφ
 * 오버행은 별도 모델이 아니라 **깊이 0 의 측벽 두께**다(그림자가 없어 가장 두껍다). 그래서
 * 직진성↑(m↑)이면 오버행이 저절로 줄고, 압력↑(m↓)이면 저절로 자란다 — 억지 매핑이 아니다.
 * 여기 나오는 숫자는 전부 **화면 배치값**(어디에 얼마나 크게 그리는가)이고 물리 상수가 아니다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { ALBEDO_GLSL, acquireTextures, texMeanGLSL, type TextureSet } from '../textures';
import { TEX_SUBSTRATE } from '../texUnits';
import { FULLSCREEN_VS, FRAG_HEAD, NOISE_GLSL, DRAW_GLSL, setCommonUniforms, clear } from './common';
import { readVizPalette, type Rgb3 } from './theme';
import { BOT_Y, CX, FIELD_Y, TRENCH_H, stepCoverageModel } from './models/stepCoverage.model';
import type { StepCoverageModel } from './models/stepCoverage.model';

/**
 * 🔴 **가시각 적분과 화면 배치값의 정본은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/stepCoverage.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *
 * 🔴 재수출 — 기존 import 경로(`@/viz/gl/scenes/stepCoverage`)를 쓰던 테스트가 그대로 돈다.
 */
export { stepCoverageModel } from './models/stepCoverage.model';
export type { StepCoverageModel } from './models/stepCoverage.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

/**
 * 재질 알베도 텍스처(설계서 §6-5) — 기판은 실리콘, 쌓이는 막은 금속(PVD 배리어·시드).
 * 텍스처 유닛 번호는 셰이더의 샘플러 유니폼과 1:1 로 맞춘다.
 *
 * 🔴 바탕 유닛(`TEX_SUBSTRATE`)은 **여기서 선언하지 않는다** — 세 씬이 공유하므로 정본은
 *    `../texUnits` 다(예전엔 세 파일이 각자 `= 0` 을 들고 있었다: check-constants R1).
 *    아래 하나는 이 씬만 쓰는 **쌓이는 막**의 자리라 씬 지역 상수로 남긴다.
 */
const TEX_FILM = 1;

/**
 * 셰이더 설명 3줄:
 * 1) 아래쪽에 트렌치가 파인 기판 단면을 SDF 로 깔고, 원래 표면에서 τ(위치)만큼 오프셋한 영역을 막으로 칠한다.
 *    τ 는 그 지점에서 입구를 통해 보이는 하늘의 각도 범위를 소스 각분포로 적분한 값이라, 깊을수록 저절로 얇아진다.
 * 2) 입구 lip(깊이 0)은 그림자가 없어 가장 두껍게 자라 처마가 되고, 양쪽 처마가 만나면 입구가 닫혀
 *    안쪽 빈 공간이 **보이드**로 봉인된다(테두리를 붉게 강조한다).
 * 3) 위쪽에는 소스에서 오는 플럭스 부채꼴을 각분포 그대로 그리고(압력↑·직진성↓ 이면 눈에 띄게 벌어진다),
 *    오른쪽 패널에 평탄면·측벽·바닥 두께를 상대 길이 막대로 비교한다(숫자는 그리지 않는다 — U-7).
 *
 * 🔴 기판·막의 재질 표면은 절차적 fbm 이 아니라 **알베도 텍스처**다(§6-5). 자산에는 색조가 아니라
 *    무늬만 들어 있으므로 평균 알베도로 나눠 무늬 배율만 뽑아 재질 색에 곱한다. SDF·막 두께·보이드
 *    강조·게이지 패널은 종전 그대로다 — 기하와 게이지 판정은 텍스처에 전혀 영향받지 않는다.
 */
export const STEP_COVERAGE_FS = `${FRAG_HEAD}
uniform float uHalfWidth;
uniform float uHwEff;
uniform float uTauField;
uniform float uSrcExp;
uniform float uNorm;
uniform float uPinch;
uniform float uCovWall;
uniform float uCovBot;
uniform float uSpread;
uniform sampler2D uSubstrateTex;
uniform sampler2D uFilmTex;
/* 🔴 색은 CSS 토큰(--bg · --ink · --viz-spec · --viz-info · --viz-series-*)에서 읽어
   유니폼으로 들어온다 — 라이트/다크를 따라간다. */
uniform vec3 uBg;
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform vec3 uS3;
${NOISE_GLSL}
${DRAW_GLSL}
${ALBEDO_GLSL}

// 알베도 UV 배율 — 화면에 타일이 몇 장 들어오는가. **화면 배치값이며 물리 상수가 아니다.**
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUB_TEX_UV」/「FILM_TEX_UV」 라는 **같은 이름**으로 **다른 값**을 들고 있었다
   (SUB 1.6/1.8/1.7 · FILM 2.4/2.6). grep 하면 어느 것이 이 화면의 값인지 구별이 안 됐다(A-10 「육안 구별 불가」).
   🔴 **값은 한 자리도 바꾸지 않았다 — 이름만 갈랐다.** 씬마다 기판이 화면에서 차지하는 크기가 달라
   확대율이 다른 것이 의도로 보이며, 「세 값을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5). 통일로 판정되면 layout.model.ts 로 올려 주입하면 된다. */
const float SC_SUB_TEX_UV  = 1.7;
const float SC_FILM_TEX_UV = 2.6;
// 텍스처 평균 알베도(textures.ts 실측). 무늬 배율을 뽑는 나눗셈 기준이다.
const vec3 MEAN_SI    = ${texMeanGLSL('silicon-surface')};
const vec3 MEAN_METAL = ${texMeanGLSL('metal')};
// 재질 색 — 종전 절차적 색의 평균을 그대로 옮겼다(화면 색을 바꾸지 않는다). 화면 배치값이다.
/* 🔴 이름을 씬별로 갈랐다(2026-08-22 · check-scene-constants B1).
   종전에는 세 씬이 전부 「SUBSTRATE_COLOR」 라는 **같은 이름**으로 **다른 색**을 들고 있었다
   (filmGrowth 0.25/0.275/0.32 · ionTrajectory 0.20/0.22/0.275 · stepCoverage 0.24/0.265/0.31).
   🔴 **색은 한 성분도 바꾸지 않았다 — 이름만 갈랐다.** 같은 실리콘 기판인데 씬마다 조명·배경이 달라
   눈으로 맞춘 값으로 보이며, 「세 색을 하나로 통일할 것인가」는 **DSN 판정 대기 중**이다
   (threads/parts/TEX_SUBSTRATE-정본화.md §5 — 색 조정은 DSN 소관이라 여기서 정하지 않았다). */
const vec3 SC_SUBSTRATE_COLOR = vec3(0.24, 0.265, 0.31);
const vec3 FILM_COLOR      = vec3(0.74, 0.775, 0.845);

/* 🔴 아래 4개는 models/stepCoverage.model.ts 에서 주입된다 — 손으로 적으면 조용히 갈린다. */
const float FIELD_Y  = ${glslFloat(FIELD_Y)};   // 웨이퍼 평탄면(화면 배치값)
const float BOT_Y    = ${glslFloat(BOT_Y)};   // 트렌치 바닥
const float TRENCH_H = ${glslFloat(Number(TRENCH_H.toFixed(6)))};   // = FIELD_Y - BOT_Y. 가로도 이 「높이 단위」로 재므로 종횡비가 등방으로 보인다
const float CX       = ${glslFloat(CX)};   // 트렌치 중심 x(화면 비율)
const float GAUGE_X  = 0.82;   // 오른쪽 비교 게이지 패널 시작
const float SRC_Y    = 1.60;   // 플럭스 부채꼴의 가상 소스 높이(화면 밖)
const float PI_2     = 1.5707963;

// ∫_a^b cos^m(φ) dφ — 심프슨 16구간. TS 쪽 cosPowInt 와 같은 식이다.
float scCosPowInt(float a, float b, float m) {
  const int NS = 16;
  float h = (b - a) / float(NS);
  float s = pow(max(cos(a), 0.0), m) + pow(max(cos(b), 0.0), m);
  for (int i = 1; i < NS; i++) {
    float w = (i % 2 == 1) ? 4.0 : 2.0;
    s += w * pow(max(cos(a + float(i) * h), 0.0), m);
  }
  return s * h / 3.0;
}

// 측벽 두께: 깊이 d 에서 입구가 보이는 각도까지의 적분(닫힌 형태). d=0 이면 그림자가 없어 최대 = 처마.
float tauWall(float d, float hwe) {
  float phiMax = min(atan(2.0 * hwe, max(d, 1e-4)), PI_2);
  return uTauField * (1.0 - pow(max(cos(phiMax), 0.0), uSrcExp + 1.0)) / ((uSrcExp + 1.0) * uNorm);
}

// 바닥 두께: 중심에서 s 만큼 떨어진 바닥점이 보는 입구 각도 구간의 적분.
float tauBot(float s, float hwe) {
  return uTauField * scCosPowInt(atan(-hwe - s, TRENCH_H), atan(hwe - s, TRENCH_H), uSrcExp + 1.0) / uNorm;
}

// 🔴 재질 색은 **인자로 받는다.** 이 함수는 main 의 삼항 분기 안에서 불리는데, GLSL ES 3.00 에서
//    분기(비균일 제어 흐름) 안의 texture() 는 밉 선택용 미분값이 정의되지 않는다. 그래서 샘플링은
//    main 에서 무조건 한 번 하고 결과만 넘긴다.
vec3 crossSection(vec2 uv, float ar, vec3 substrate, vec3 filmCol) {
  // 가로를 「높이 단위」로 환산한다. 캔버스가 아무리 옆으로 길어도 종횡비가 왜곡되지 않는다.
  float xw = (uv.x - CX) * ar;
  float hw = min(uHalfWidth, 0.36 * ar);                 // 지나치게 좁은 캔버스에서만 걸린다
  float hwe = max(hw - (uHalfWidth - uHwEff), 0.004);    // (uHalfWidth-uHwEff) = 처마가 먹은 폭
  float dx = abs(xw);

  float dField = uv.y - FIELD_Y;
  float dWall  = hw - dx;
  float dBot   = uv.y - BOT_Y;
  float dInner = min(dWall, dBot);
  float sdSolid = max(dField, dInner);     // 원래 기판 형상의 SDF. >0 = 고체 바깥

  // 원표면에서 잰 거리 sd 와, **그 자리의** 막 두께 tau. 자리마다 받는 플럭스가 달라 tau 가 달라진다.
  float sd, tau;
  if (uv.y > FIELD_Y && dx < hw) {
    // 입구 바로 위 — 여기 쌓이는 것은 lip 에서 안쪽으로 자란 **처마**뿐이다.
    // 열린 입구 위를 평탄면 막이 가로지르지 않는다(핀치오프 전까지 입구는 뚫려 있다).
    sd  = dWall;
    tau = tauWall(0.0, hwe) * step(uv.y, FIELD_Y + uTauField);
  } else if (uv.y > FIELD_Y) {
    sd  = dField;                          // 평탄면 위
    tau = uTauField;
  } else {
    sd  = dInner;                          // 기판 안(트렌치 내벽·바닥)
    tau = (dWall <= dBot) ? tauWall(FIELD_Y - uv.y, hwe) : tauBot(xw, hwe);
  }

  float e = fwidth(sdSolid) + 1e-5;
  float outside = smoothstep(-e, e, sdSolid);
  float filmM   = outside * step(0.0, sd) * (1.0 - smoothstep(tau - e, tau + e, sd));

  vec3 vacuum    = uBg;

  vec3 col = vacuum;

  // 위쪽 플럭스 광선 다발 — 소스 각분포 cos^m 그대로다(압력↑·직진성↓ 이면 눈에 띄게 벌어진다).
  float above = step(FIELD_Y + uTauField, uv.y);
  float phi = atan(xw, max(SRC_Y - uv.y, 1e-3));
  float lobe = pow(max(cos(phi), 0.0), uSrcExp);
  float rays = pow(0.5 + 0.5 * cos(phi * 60.0), 8.0);
  float flow = fract(length(vec2(xw, SRC_Y - uv.y)) * 5.0 - uTime * 0.45);
  // 🔴 가산이 아니라 알파 합성이다 — 바탕이 거의 검을 때는 같은 값이고(다크 무변화), 바탕이 밝아지면
  //    가산은 1.0 으로 포화해 광선 다발이 백색으로 사라진다(2026-08-22 실측).
  col = mix(col, vec3(0.32, 0.70, 0.86) * 1.4,
            clamp(lobe * rays * (0.30 + 0.70 * flow) * above * step(uv.x, GAUGE_X - 0.01), 0.0, 1.0));

  col = mix(col, substrate, 1.0 - outside);
  col = mix(col, filmCol, filmM);

  // 트렌치 안의 채워지지 않은 공간. 핀치오프되면 봉인된 보이드로 강조한다.
  float inTrench = step(dx, hw) * step(BOT_Y, uv.y) * step(uv.y, FIELD_Y);
  float voidM = inTrench * outside * (1.0 - filmM);
  col = mix(col, vec3(0.02, 0.02, 0.04), voidM * 0.85);
  col = mix(col, mix(col, uSpec, 0.30), voidM * uPinch);
  col = mix(col, uSpec, clamp(voidM * (1.0 - smoothstep(tau, tau + 0.012, sd)) * uPinch * 0.9, 0.0, 1.0));

  // 막 표면선 + 원래 트렌치 윤곽(점선) — 얼마나 덜 덮였는지 눈으로 대조한다.
  col = mix(col, uInk, clamp(lineMask(sd - tau, 0.0016) * outside * 0.55, 0.0, 1.0));
  float dashO = step(0.5, fract((uv.x + uv.y) * 55.0));
  col = mix(col, uInfo, clamp(lineMask(sdSolid, 0.0012) * dashO * 0.55, 0.0, 1.0));

  return col;
}

// 오른쪽 게이지: 평탄면(기준) · 측벽 · 바닥 두께를 **상대 길이**로만 비교한다(숫자 없음 — U-7).
vec3 gaugePanel(vec2 uv) {
  vec3 col = uBg;
  float x0 = GAUGE_X + 0.025;
  float x1 = 0.975;
  float u = (uv.x - x0) / (x1 - x0);

  float bar = 0.042;
  float rows[3];
  rows[0] = 0.62; rows[1] = 0.48; rows[2] = 0.34;
  float vals[3];
  vals[0] = 1.0; vals[1] = clamp(uCovWall, 0.0, 1.0); vals[2] = clamp(uCovBot, 0.0, 1.0);
  vec3 cols[3];
  cols[0] = uInk;
  cols[1] = uS1;
  cols[2] = uS2;

  for (int i = 0; i < 3; i++) {
    float inRow = bandMask(uv.y, rows[i], rows[i] + bar) * bandMask(uv.x, x0, x1);
    col = mix(col, cols[i], clamp(0.10 * inRow, 0.0, 1.0));                                    // 트랙
    col = mix(col, cols[i], clamp(inRow * step(u, vals[i]) * 0.85, 0.0, 1.0));                 // 채움
  }
  // 기준선(평탄면 = 막대 전체 길이)
  col = mix(col, uInfo, clamp(lineMask(uv.x - x1, 0.0018) * bandMask(uv.y, 0.30, 0.70) * 0.5, 0.0, 1.0));
  // 도달 각도 분포의 폭(넓을수록 길어진다)
  float sBar = bandMask(uv.y, 0.16, 0.20) * bandMask(uv.x, x0, x1);
  col = mix(col, uS3, clamp(sBar * (0.12 + 0.88 * step(u, clamp(uSpread, 0.0, 1.0))), 0.0, 1.0));
  return col;
}

void main() {
  vec2 uv = vUv;
  float ar = uRes.x / max(uRes.y, 1.0);

  // 재질 표면 UV — 가로를 화면비로 환산해 캔버스가 길어져도 무늬가 늘어나지 않게 한다.
  // 샘플링은 분기 밖에서 무조건 한다(위 crossSection 주석 — 비균일 제어 흐름의 밉 선택 문제).
  vec2 tuv = vec2(uv.x * ar, uv.y);
  vec3 substrate = SC_SUBSTRATE_COLOR * albedoDetail(texture(uSubstrateTex, tuv * SC_SUB_TEX_UV).rgb, MEAN_SI);
  vec3 filmCol   = FILM_COLOR * albedoDetail(texture(uFilmTex, tuv * SC_FILM_TEX_UV).rgb, MEAN_METAL);

  vec3 col = (uv.x > GAUGE_X) ? gaugePanel(uv) : crossSection(uv, ar, substrate, filmCol);
  col = mix(col, uInk, clamp(lineMask(uv.x - GAUGE_X, 0.0012) * 0.6, 0.0, 1.0));

  float vig = smoothstep(1.10, 0.35, length((uv - 0.5) * vec2(ar, 1.0)));
  col *= 0.78 + 0.22 * vig;
  fragColor = vec4(col, 1.0);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  halfWidth: WebGLUniformLocation | null;
  hwEff: WebGLUniformLocation | null;
  tauField: WebGLUniformLocation | null;
  srcExp: WebGLUniformLocation | null;
  norm: WebGLUniformLocation | null;
  pinch: WebGLUniformLocation | null;
  covWall: WebGLUniformLocation | null;
  covBot: WebGLUniformLocation | null;
  spread: WebGLUniformLocation | null;
  substrateTex: WebGLUniformLocation | null;
  filmTex: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
  s3: WebGLUniformLocation | null;
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
  let m: StepCoverageModel = stepCoverageModel({});

  return {
    id: 'stepCoverage',
    animated: true, // 플럭스 부채꼴이 흐른다
    init(gl) {
      ctx = gl;
      prog = gl.program('stepCoverage', FULLSCREEN_VS, STEP_COVERAGE_FS);
      // 비동기 로드다. 도착 전에는 평균 알베도 1×1 이 바인딩돼 있어 단면이 비지 않는다.
      // 이 씬은 animated: true 라 도착한 다음 프레임에서 무늬가 저절로 나타난다.
      tex = acquireTextures(gl, ['silicon-surface', 'metal']);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        halfWidth: gl.uniform(prog, 'uHalfWidth'),
        hwEff: gl.uniform(prog, 'uHwEff'),
        tauField: gl.uniform(prog, 'uTauField'),
        srcExp: gl.uniform(prog, 'uSrcExp'),
        norm: gl.uniform(prog, 'uNorm'),
        pinch: gl.uniform(prog, 'uPinch'),
        covWall: gl.uniform(prog, 'uCovWall'),
        covBot: gl.uniform(prog, 'uCovBot'),
        spread: gl.uniform(prog, 'uSpread'),
        substrateTex: gl.uniform(prog, 'uSubstrateTex'),
        filmTex: gl.uniform(prog, 'uFilmTex'),
        bg: gl.uniform(prog, 'uBg'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        s3: gl.uniform(prog, 'uS3'),
      };
    },
    update(params: SceneParams) {
      // 🔴 각분포 폭도 모델이 돌려준다 — 여기서 다시 계산하면 사본이 늘어난다.
      m = stepCoverageModel(params);
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
      set3(gl, u.info, pal.info, pal.ink);
      set3(gl, u.s1, pal.series[0], pal.ink);
      set3(gl, u.s2, pal.series[1], pal.ink);
      set3(gl, u.s3, pal.series[2], pal.ink);

      if (u.halfWidth) gl.uniform1f(u.halfWidth, m.halfWidth);
      if (u.hwEff) gl.uniform1f(u.hwEff, m.hwEff);
      if (u.tauField) gl.uniform1f(u.tauField, m.tauField);
      if (u.srcExp) gl.uniform1f(u.srcExp, m.srcExp);
      if (u.norm) gl.uniform1f(u.norm, m.norm);
      if (u.pinch) gl.uniform1f(u.pinch, m.pinch);
      if (u.covWall) gl.uniform1f(u.covWall, m.wallCoverage);
      if (u.covBot) gl.uniform1f(u.covBot, m.bottomCoverage);
      if (u.spread) gl.uniform1f(u.spread, m.spread);
      if (tex) {
        tex.bind(TEX_SUBSTRATE, 'silicon-surface');
        tex.bind(TEX_FILM, 'metal');
      }
      if (u.substrateTex) gl.uniform1i(u.substrateTex, TEX_SUBSTRATE);
      if (u.filmTex) gl.uniform1i(u.filmTex, TEX_FILM);
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
