/**
 * 씬: **다이 전단시험** — 좌 = 다이 상면도(면적) ＋ 요구력 막대 / 우 = 전단속도 로그축 3구간.
 * 칸: `packaging/lab-advanced`.
 *
 * 반응 파라미터(전부 0~1 정규화. 랩 `models/labs/packaging.ts` 가 만든다):
 *   required   요구 전단력 / 5 kg   → 요구력 막대 높이
 *   applied    인가 전단력 / 5 kg   → 같은 축 위 수평 파선 ＋ 합·부 판정 형태
 *   dieArea    다이 면적 / 100      → 다이 사각형 **한 변 = 0.30·√(a/100)**(면적을 면적으로)
 *   speedClass 속도구분 / 3         → 강조되는 속도 구간 ＋ 배지 형태(🔴 이산 4단. 보간 금지)
 *   speedLog   log10 위치 0~1       → 속도축 마커 x
 *
 * 🔴 **배치 상수와 파생값은 여기 없다.** 셰이더 문자열이 없는 순수 모듈
 *    `models/shearTest.model.ts` 가 정본이고, 이 파일은 그것을 GLSL 리터럴로 **주입**만 한다.
 *    Canvas2D 폴백(`gl/fallback2d.ts`)도 같은 모듈을 import 한다 — 그래서 사본이 없다.
 *
 * 🔴 **글자를 그리지 않는다**(씬은 도형만 낸다). 합격 `●` · 불합격 `▲` · 미규정 `▨`(45° 빗금)은
 *    글리프가 아니라 **도형**으로 그린다.
 * 🔴 **배경을 칠하지 않는다** — `clear()` 로 투명하게 지우고 도형만 알파 합성해 얹는다.
 *
 * 🔴 **a = 64 → 65 의 불연속은 실재한다.** 요구치가 2.56 kg(최대) 에서 2.50 kg 로 **내려앉는다**
 *    (S43 FIGURE 2019-4 NOTE 1 · `LARGE_AREA_LIMIT`). 씬은 이 계단을 그대로 보인다 — 평활 금지.
 * 🔴 **미규정 구간이 축의 약 60 % 인데 어떤 관심사에서도 합격이 아니다.** 학습자가 기본값
 *    5 mm/s 에서 출발해 여기 갇혀 있다는 사실이 이 칸의 교육 내용이다 — 빗금을 순하게 만들지 마라.
 *
 * 🔴 **그리지 않는 것**: 파단 위치·파괴모드 분류 도해(저작권 판정 D-015) · 볼/솔더볼 단면 ·
 *    전단 툴의 실물 형상. 명세에 없거나 금지된 것을 채워 넣지 않았다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, setCommonUniforms, clear } from './common';
import {
  readVizPalette,
  onColorSchemeChange,
  VIZ2D_SPEC_DASH,
  VIZ2D_DATA_DASH,
  VIZ2D_SPEC_WIDTH,
  VIZ2D_INFO_WIDTH,
  VIZ2D_DATA_WIDTH,
} from './theme';
import {
  ST_BADGE_CY,
  ST_BAND_H,
  ST_BELOW_LOW_X0,
  ST_DIE_PANEL_CX,
  ST_DIE_PANEL_CY,
  ST_FILL_ALPHA,
  ST_FORCE_BAR_X0,
  ST_FORCE_BAR_X1,
  ST_FORCE_BAR_Y0,
  ST_HATCH_PX,
  ST_HATCH_W_PX,
  ST_KNEE_SIDE,
  ST_MARK_R,
  ST_SPEED_AXIS_X0,
  ST_SPEED_AXIS_X1,
  ST_SPEED_AXIS_Y,
  ST_VERDICT_CX,
  ST_VERDICT_CY,
  shearTestModel,
  type ShearTestModel,
} from './models/shearTest.model';

/**
 * 🔴 재수출 — 다른 곳이 이 씬의 배치·파생값을 필요로 하면 여기가 아니라 모델 모듈에서 가져간다.
 */
export {
  ST_BAND_H, ST_FORCE_BAR_H, ST_FORCE_BAR_Y0, ST_KNEE_SIDE,
  ST_SPEED_AXIS_X0, ST_SPEED_AXIS_X1, ST_SPEED_AXIS_Y,
  shearTestModel, stDieSide, stForceY, stSpeedLog, stXOfSpeed,
} from './models/shearTest.model';

/** GLSL 리터럴로 안전하게 찍는다 — 정수는 소수점을 붙여야 float 로 파싱된다. */
function glslFloat(v: number): string {
  const n = Number(v.toFixed(6));
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/* 🔴 선종의 정본은 `scenes/theme.ts`(그 정본은 다시 `viz/chart/common.ts` 의 문자열)다.
   여기서 숫자를 다시 적지 않고 **인자 목록 문자열로 조립해 주입**한다. */
const specDashArgs = VIZ2D_SPEC_DASH.map(glslFloat).join(', ');
const dataDashArgs = VIZ2D_DATA_DASH.map(glslFloat).join(', ');

/**
 * 셰이더 설명 3줄:
 * 1) 좌 패널 — 면적에 비례해 넓어지는 다이 사각형 위에 **a = 64 기준 사각형**(규격 파선)을 겹치고,
 *    그 옆에 요구력 막대와 인가력 수평 파선을 같은 축에 그린다.
 * 2) 우 패널 — 전단속도 로그축에 4구간(도달 불가 · 저속 A · 표준 미규정 · 고속 B)을 **미리** 깔고,
 *    현재 구분에 해당하는 구간만 채움으로 강조한다. 미규정 구간은 언제나 45° 빗금이다.
 * 3) 경계마다 `●`(포함) / `○`(불포함)을 찍어 **0.8 은 저속 A · 50.0 은 아직 미규정**임을 형태로 말한다.
 *
 * 🔴 GLSL 안에 `const float NAME = …;` 를 선언하지 않는다 — 값은 전부 `${}` 로 식에 주입한다
 *    (`check-scene-constants` B1~B3). 색은 CSS 토큰에서 읽어 유니폼으로 들어온다.
 */
export const SHEAR_TEST_FS = `${FRAG_HEAD}
uniform vec3 uInk;
uniform vec3 uSpec;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uDieSide;
uniform float uBarTopY;
uniform float uAppliedY;
uniform float uMarkerX;
uniform float uClassIndex;
uniform float uAppliedKnown;
uniform float uPass;
uniform float uBandLowX1;
uniform float uBandMidX1;

/* 1 device px 를 UV 로 — 가로와 세로가 다르다. 선 굵기는 px 로 말하고 여기서 환산한다. */
float pxY() { return 1.0 / max(uRes.y, 1.0); }
float pxX() { return 1.0 / max(uRes.x, 1.0); }
vec2 aspectXY() { return vec2(uRes.x / max(uRes.y, 1.0), 1.0); }

/* ── 알파 합성(src-over). 🔴 배경을 칠하지 않는다 — 도형이 없는 자리는 알파 0 으로 남는다. ── */
vec4 over(vec4 dst, vec3 c, float a) {
  float ao = a + dst.a * (1.0 - a);
  vec3 co = (c * a + dst.rgb * dst.a * (1.0 - a)) / max(ao, 1e-5);
  return vec4(co, ao);
}

/* ── 파선 패턴(px 단위 진행거리 s). 값은 theme.ts 의 VIZ2D_*_DASH 에서 주입된다. ── */
float dash2(float s, float a, float b) { return step(mod(s, a + b), a); }
float dash4(float s, float a, float b, float c, float d) {
  float f = mod(s, a + b + c + d);
  return clamp(step(f, a) + step(a + b, f) * step(f, a + b + c), 0.0, 1.0);
}

/* ── 기본 도형 ── */
float rectFill(vec2 p, vec2 c, vec2 hs) {
  vec2 d = abs(p - c);
  return step(d.x, hs.x) * step(d.y, hs.y);
}
float hSeg(vec2 p, float y, float x0, float x1, float wPx) {
  float hw = wPx * 0.5 * pxY();
  return step(x0, p.x) * step(p.x, x1) * (1.0 - smoothstep(hw, hw + pxY(), abs(p.y - y)));
}
float vSeg(vec2 p, float x, float y0, float y1, float wPx) {
  float hw = wPx * 0.5 * pxX();
  return step(y0, p.y) * step(p.y, y1) * (1.0 - smoothstep(hw, hw + pxX(), abs(p.x - x)));
}
float rectLine(vec2 p, vec2 c, vec2 hs, float wPx) {
  float m = hSeg(p, c.y - hs.y, c.x - hs.x, c.x + hs.x, wPx);
  m = max(m, hSeg(p, c.y + hs.y, c.x - hs.x, c.x + hs.x, wPx));
  m = max(m, vSeg(p, c.x - hs.x, c.y - hs.y, c.y + hs.y, wPx));
  m = max(m, vSeg(p, c.x + hs.x, c.y - hs.y, c.y + hs.y, wPx));
  return m;
}
/* 규격선 파선 테두리 — 가로변은 x 로, 세로변은 y 로 진행거리를 잰다. */
float rectLineSpec(vec2 p, vec2 c, vec2 hs, float wPx) {
  float dx = dash4(p.x * uRes.x, ${specDashArgs});
  float dy = dash4(p.y * uRes.y, ${specDashArgs});
  float m = hSeg(p, c.y - hs.y, c.x - hs.x, c.x + hs.x, wPx) * dx;
  m = max(m, hSeg(p, c.y + hs.y, c.x - hs.x, c.x + hs.x, wPx) * dx);
  m = max(m, vSeg(p, c.x - hs.x, c.y - hs.y, c.y + hs.y, wPx) * dy);
  m = max(m, vSeg(p, c.x + hs.x, c.y - hs.y, c.y + hs.y, wPx) * dy);
  return m;
}

/* ── 판정 형태 3종 — 🔴 글자가 아니라 도형이다 ── */
/** 합격 ● — 채운 원. */
float markDisc(vec2 p, vec2 c, float r) {
  float L = length((p - c) * aspectXY());
  return 1.0 - smoothstep(r - pxY(), r + pxY(), L);
}
/** 불포함 ○ — 테두리만 있는 원. */
float markRing(vec2 p, vec2 c, float r, float w) {
  float L = length((p - c) * aspectXY());
  return (1.0 - smoothstep(r + w, r + w + pxY(), L)) * smoothstep(r - w - pxY(), r - w, L);
}
/** 불합격 ▲ — 위로 향한 정삼각형(꼭짓점 (0,1)·(∓√3/2,−1/2)). */
float markTri(vec2 p, vec2 c, float r) {
  vec2 d = (p - c) * aspectXY() / max(r, 1e-5);
  float ea = -0.8660254 * (d.y - 1.0) + 1.5 * d.x;
  float eb = 1.7320508 * (d.y + 0.5);
  float ec = -0.8660254 * (d.y + 0.5) - 1.5 * (d.x - 0.8660254);
  return step(0.0, ea) * step(0.0, eb) * step(0.0, ec);
}
/** 미규정 ▨ — 45° 빗금(간격·굵기는 px). 밴드 해칭과 **같은 함수**를 쓴다. */
float hatch45(vec2 p) {
  vec2 q = p * uRes;
  float s = (q.x + q.y) * 0.70710678;
  return step(mod(s, ${glslFloat(ST_HATCH_PX)}), ${glslFloat(ST_HATCH_W_PX)});
}
/** 빗금을 사각 테두리 안에 채운 미규정 배지. */
float markHatched(vec2 p, vec2 c, float r) {
  vec2 hs = vec2(r * (uRes.y / max(uRes.x, 1.0)), r);
  float box = rectFill(p, c, hs);
  return max(box * hatch45(p), rectLine(p, c, hs, ${glslFloat(VIZ2D_INFO_WIDTH)}));
}

void main() {
  vec2 p = vUv;
  vec4 acc = vec4(0.0);

  /* ══════════ 좌 패널 — 다이 상면도 ══════════ */
  vec2 dieC = vec2(${glslFloat(ST_DIE_PANEL_CX)}, ${glslFloat(ST_DIE_PANEL_CY)});
  vec2 dieHS = vec2(uDieSide * 0.5);
  acc = over(acc, uInk, rectFill(p, dieC, dieHS) * ${glslFloat(ST_FILL_ALPHA)});
  acc = over(acc, uInk, rectLine(p, dieC, dieHS, ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* 시험 활성 상태만 중앙 로딩 펌스로 나타낸다. 툴 형상·파단 경로는 추정하지 않는다. */
  float loadR = 0.020 + 0.009 * (0.5 + 0.5 * sin(uTime * 4.8));
  float loadPulse = markRing(p, dieC, loadR, ${glslFloat(VIZ2D_INFO_WIDTH)} * 0.5 * pxY());
  acc = over(acc, uInfo, loadPulse * 0.72);

  /* a = 64 기준 사각형 — 🔴 **항상** 겹쳐 그린다. 다이가 이 윤곽을 넘는 순간이 NOTE 1 전이다. */
  vec2 kneeHS = vec2(${glslFloat(ST_KNEE_SIDE * 0.5)});
  acc = over(acc, uSpec, rectLineSpec(p, dieC, kneeHS, ${glslFloat(VIZ2D_SPEC_WIDTH)}));

  /* ══════════ 좌 패널 — 요구력 막대 ＋ 인가력 파선 ══════════ */
  float barX0 = ${glslFloat(ST_FORCE_BAR_X0)};
  float barX1 = ${glslFloat(ST_FORCE_BAR_X1)};
  float barY0 = ${glslFloat(ST_FORCE_BAR_Y0)};
  vec2 barC = vec2((barX0 + barX1) * 0.5, (barY0 + uBarTopY) * 0.5);
  vec2 barHS = vec2((barX1 - barX0) * 0.5, max(uBarTopY - barY0, 0.0) * 0.5);
  acc = over(acc, uSpec, rectFill(p, barC, barHS) * ${glslFloat(ST_FILL_ALPHA)});
  /* 막대 바닥선(0 kg)과 꼭대기선 — 얇아도 「여기가 요구치」가 보이게 한다. */
  acc = over(acc, uSpec, hSeg(p, barY0, barX0, barX1, ${glslFloat(VIZ2D_SPEC_WIDTH)}));
  acc = over(acc, uSpec, hSeg(p, uBarTopY, barX0, barX1, ${glslFloat(VIZ2D_SPEC_WIDTH)}));
  acc = over(acc, uSpec, vSeg(p, barX0, barY0, uBarTopY, ${glslFloat(VIZ2D_INFO_WIDTH)}));
  acc = over(acc, uSpec, vSeg(p, barX1, barY0, uBarTopY, ${glslFloat(VIZ2D_INFO_WIDTH)}));

  /* 🔴 인가력이 NaN 이면 여유 표시를 그리지 않는다(랩이 예외를 던지지 않는 경로). */
  float appliedDash = dash2(p.x * uRes.x, ${dataDashArgs});
  acc = over(acc, uInk,
    hSeg(p, uAppliedY, barX0, barX1, ${glslFloat(VIZ2D_DATA_WIDTH)}) * appliedDash * uAppliedKnown);

  /* 판정 배지 — 합격 ● / 불합격 ▲ / 인가력 미상 ▨ */
  vec2 vc = vec2(${glslFloat(ST_VERDICT_CX)}, ${glslFloat(ST_VERDICT_CY)});
  float r = ${glslFloat(ST_MARK_R)};
  acc = over(acc, uSpec, markDisc(p, vc, r) * uAppliedKnown * uPass);
  acc = over(acc, uSpec, markTri(p, vc, r) * uAppliedKnown * (1.0 - uPass));
  acc = over(acc, uInfo, markHatched(p, vc, r) * (1.0 - uAppliedKnown));

  /* ══════════ 우 패널 — 전단속도 로그축 4구간 ══════════ */
  float axY0 = ${glslFloat(ST_SPEED_AXIS_Y)};
  float axY1 = ${glslFloat(ST_SPEED_AXIS_Y + ST_BAND_H)};
  float axX0 = ${glslFloat(ST_SPEED_AXIS_X0)};
  float axX1 = ${glslFloat(ST_SPEED_AXIS_X1)};
  float bandCY = (axY0 + axY1) * 0.5;
  float bandHY = (axY1 - axY0) * 0.5;

  /* 도달 불가(v < 0.1) — 🔴 축 **왼쪽 밖**에 옅게 그린다. 마커는 절대 들어가지 않는다. */
  float lowOutX0 = ${glslFloat(ST_BELOW_LOW_X0)};
  vec2 outC = vec2((lowOutX0 + axX0) * 0.5, bandCY);
  vec2 outHS = vec2((axX0 - lowOutX0) * 0.5, bandHY);
  acc = over(acc, uInfo, rectFill(p, outC, outHS) * ${glslFloat(ST_FILL_ALPHA)});

  /* 저속 A(0.1 ≤ v ≤ 0.8) — series[1] 실선 테두리. class 1 이면 채움으로 강조. */
  vec2 loC = vec2((axX0 + uBandLowX1) * 0.5, bandCY);
  vec2 loHS = vec2((uBandLowX1 - axX0) * 0.5, bandHY);
  acc = over(acc, uS2, rectFill(p, loC, loHS) * ${glslFloat(ST_FILL_ALPHA)} * step(abs(uClassIndex - 1.0), 0.25));
  acc = over(acc, uS2, rectLine(p, loC, loHS, ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* 표준 미규정(0.8 < v ≤ 50) — 🔴 **언제나** 45° 빗금 ＋ 규격 파선 테두리. 축의 약 60 % 다. */
  vec2 midC = vec2((uBandLowX1 + uBandMidX1) * 0.5, bandCY);
  vec2 midHS = vec2((uBandMidX1 - uBandLowX1) * 0.5, bandHY);
  float midBox = rectFill(p, midC, midHS);
  acc = over(acc, uSpec, midBox * ${glslFloat(ST_FILL_ALPHA)} * step(abs(uClassIndex - 2.0), 0.25));
  acc = over(acc, uSpec, midBox * hatch45(p));
  acc = over(acc, uSpec, rectLineSpec(p, midC, midHS, ${glslFloat(VIZ2D_SPEC_WIDTH)}));

  /* 고속 B(v > 50) — series[0] 실선 테두리. class 3 이면 채움으로 강조. */
  vec2 hiC = vec2((uBandMidX1 + axX1) * 0.5, bandCY);
  vec2 hiHS = vec2((axX1 - uBandMidX1) * 0.5, bandHY);
  acc = over(acc, uS1, rectFill(p, hiC, hiHS) * ${glslFloat(ST_FILL_ALPHA)} * step(abs(uClassIndex - 3.0), 0.25));
  acc = over(acc, uS1, rectLine(p, hiC, hiHS, ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* 축선 */
  acc = over(acc, uInk, hSeg(p, axY0, lowOutX0, axX1, ${glslFloat(VIZ2D_INFO_WIDTH)}));

  /* 🔴 경계 귀속 — 닫힌 쪽에 ●, 열린 쪽에 ○ 를 경계 양옆에 나란히 찍는다.
     0.1 은 저속 A 에 포함 · 0.8 은 저속 A 에 포함(미규정은 열림) · 50.0 은 아직 미규정(고속 B 는 열림). */
  float mr = r * 0.7;
  float rw = ${glslFloat(VIZ2D_DATA_WIDTH)} * 0.5 * pxY();
  float mx = mr * (uRes.y / max(uRes.x, 1.0));
  acc = over(acc, uS2, markDisc(p, vec2(axX0 + mx, bandCY), mr));
  acc = over(acc, uS2, markDisc(p, vec2(uBandLowX1 - mx, bandCY), mr));
  acc = over(acc, uSpec, markRing(p, vec2(uBandLowX1 + mx, bandCY), mr, rw));
  acc = over(acc, uSpec, markDisc(p, vec2(uBandMidX1 - mx, bandCY), mr));
  acc = over(acc, uS1, markRing(p, vec2(uBandMidX1 + mx, bandCY), mr, rw));

  /* 현재 속도 마커 — class 0 이면 축 왼쪽 끝에 고정돼 들어온다(모델이 정한다). */
  acc = over(acc, uInk, vSeg(p, uMarkerX, axY0, axY1, ${glslFloat(VIZ2D_DATA_WIDTH)}));

  /* 속도구분 배지 — 1 ⇒ ● series[1] · 2 ⇒ ▨ spec · 3 ⇒ ● series[0] · 0 ⇒ ▨ info(도달 불가) */
  vec2 bc = vec2(uMarkerX, ${glslFloat(ST_BADGE_CY)});
  acc = over(acc, uInfo, markHatched(p, bc, r) * step(abs(uClassIndex), 0.25));
  acc = over(acc, uS2, markDisc(p, bc, r) * step(abs(uClassIndex - 1.0), 0.25));
  acc = over(acc, uSpec, markHatched(p, bc, r) * step(abs(uClassIndex - 2.0), 0.25));
  acc = over(acc, uS1, markDisc(p, bc, r) * step(abs(uClassIndex - 3.0), 0.25));

  /* 🔴 premultipliedAlpha: true — 알파를 곱해 내보낸다. 도형이 없는 자리는 완전 투명이다. */
  fragColor = vec4(acc.rgb * acc.a, acc.a);
}
`;

interface Uniforms {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  spec: WebGLUniformLocation | null;
  info: WebGLUniformLocation | null;
  s1: WebGLUniformLocation | null;
  s2: WebGLUniformLocation | null;
  dieSide: WebGLUniformLocation | null;
  barTopY: WebGLUniformLocation | null;
  appliedY: WebGLUniformLocation | null;
  markerX: WebGLUniformLocation | null;
  classIndex: WebGLUniformLocation | null;
  appliedKnown: WebGLUniformLocation | null;
  pass: WebGLUniformLocation | null;
  bandLowX1: WebGLUniformLocation | null;
  bandMidX1: WebGLUniformLocation | null;
}

export function createScene(): Scene {
  let ctx: GLContext | null = null;
  let prog: WebGLProgram | null = null;
  let u: Uniforms | null = null;
  let offTheme: (() => void) | null = null;
  let lastT = 0;
  /** 🔴 파생값은 전부 모델이 만든다 — 씬은 유니폼으로 옮기기만 한다. */
  let m: ShearTestModel = shearTestModel({});

  const render = (t: number): void => {
    if (!ctx || !prog || !u || ctx.lost) return;
    const gl = ctx.gl;
    clear(gl);
    gl.useProgram(prog);
    setCommonUniforms(gl, u.res, u.time, ctx.size.width, ctx.size.height, t);

    /* 🔴 매번 읽는다 — 캐시하면 테마 전환 뒤 옛 색이 남는다(정적 씬이라 호출은 드물다). */
    const pal = readVizPalette(ctx.canvas);
    const s0 = pal.series[0] ?? pal.ink;
    const s1 = pal.series[1] ?? pal.ink;
    if (u.ink) gl.uniform3f(u.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
    if (u.spec) gl.uniform3f(u.spec, pal.spec[0], pal.spec[1], pal.spec[2]);
    if (u.info) gl.uniform3f(u.info, pal.info[0], pal.info[1], pal.info[2]);
    if (u.s1) gl.uniform3f(u.s1, s0[0], s0[1], s0[2]);
    if (u.s2) gl.uniform3f(u.s2, s1[0], s1[1], s1[2]);

    if (u.dieSide) gl.uniform1f(u.dieSide, m.dieSide);
    if (u.barTopY) gl.uniform1f(u.barTopY, m.barTopY);
    if (u.appliedY) gl.uniform1f(u.appliedY, m.appliedY);
    if (u.markerX) gl.uniform1f(u.markerX, m.markerX);
    if (u.classIndex) gl.uniform1f(u.classIndex, m.classIndex);
    if (u.appliedKnown) gl.uniform1f(u.appliedKnown, m.appliedKnown ? 1 : 0);
    if (u.pass) gl.uniform1f(u.pass, m.pass ? 1 : 0);
    if (u.bandLowX1) gl.uniform1f(u.bandLowX1, m.bandLowX1);
    if (u.bandMidX1) gl.uniform1f(u.bandMidX1, m.bandMidX1);

    ctx.drawFullscreen();
  };

  return {
    id: 'shearTest',
    animated: true, // 다이 중앙 로딩 펄스가 시간에 따라 변한다
    init(gl) {
      ctx = gl;
      prog = gl.program('shearTest', FULLSCREEN_VS, SHEAR_TEST_FS);
      u = {
        res: gl.uniform(prog, 'uRes'),
        time: gl.uniform(prog, 'uTime'),
        ink: gl.uniform(prog, 'uInk'),
        spec: gl.uniform(prog, 'uSpec'),
        info: gl.uniform(prog, 'uInfo'),
        s1: gl.uniform(prog, 'uS1'),
        s2: gl.uniform(prog, 'uS2'),
        dieSide: gl.uniform(prog, 'uDieSide'),
        barTopY: gl.uniform(prog, 'uBarTopY'),
        appliedY: gl.uniform(prog, 'uAppliedY'),
        markerX: gl.uniform(prog, 'uMarkerX'),
        classIndex: gl.uniform(prog, 'uClassIndex'),
        appliedKnown: gl.uniform(prog, 'uAppliedKnown'),
        pass: gl.uniform(prog, 'uPass'),
        bandLowX1: gl.uniform(prog, 'uBandLowX1'),
        bandMidX1: gl.uniform(prog, 'uBandMidX1'),
      };
      /* 🔴 정적 씬은 테마가 바뀌어도 루프가 draw 를 건너뛴다 — 스스로 한 장 더 그린다. */
      offTheme = onColorSchemeChange(() => {
        if (ctx && !ctx.lost) render(lastT);
      });
    },
    update(params: SceneParams) {
      m = shearTestModel(params);
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
