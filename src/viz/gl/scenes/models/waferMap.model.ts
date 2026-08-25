/**
 * `waferMap`(EDS 웨이퍼 맵 + 결함수준 게이지) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/waferMap.ts` — 아래 배치값을 GLSL 리터럴로 주입하고, 파생값을 유니폼으로 넣는다.
 *   · `gl/fallback2d.ts`   — Canvas2D 로 같은 그림을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(세로 0~1, 위쪽이 +)** 다. Canvas2D 는 세로가 뒤집혀 있으므로
 * 폴백이 `toY(uv, h) = (1 − uv)·h` 로 변환한다 — 변환은 폴백의 몫이고, 형상은 여기 하나다.
 *
 * ── 이 씬이 받는 것 ────────────────────────────────────────────────────────
 * 🔴 **입력을 전혀 읽지 않는다. 3키 전부 랩 출력에서 온다**(`models/labs/eds.ts` · `eds/lab-advanced`).
 *   `rawYield`    o['rawYield'] 그대로 0~1
 *   `defectLevel` o['defectLevelPpm'] 을 로그 정규화 — (log10(clamp(ppm,10,1e6)) − 1) / 5
 *   `dieAcross`   sqrt(4·o['grossDie']/π) / 34 를 clamp01
 * 결측 기본값은 셋 다 **0** 이다. 🔴 0.5 를 쓰지 않는다(A15) — 「없는 값」이 「중간 조건」으로
 * 보이면 학습자가 안 넣은 조건을 넣었다고 오해한다.
 *
 * ── 🔴 그리지 않는 것 (DSN §E-6) ──────────────────────────────────────────
 *   · **에지 링 · 중심 클러스터** — 모델이 D₀ 를 **공간 균일**로 못박았다. 「올려도 에지 링이
 *     생기지 않고 전면 산포가 짙어질 뿐이다」(PLN 정정 2026-08-20 — 원문의 「에지 링 전이」는
 *     **물리 오류**였다). 반경 가중 없이 고정 해시로 균일하게 흩뿌린다.
 *   · **클러스터링(α=2)의 시각적 뭉침** — 공간 상관 모델이 없다.
 *   · **실제 다이 수만큼의 칸** — N 이 136~6,857 이라 6,857칸은 400 px 캔버스에서 칸 하나가
 *     0.35 px 다. 격자를 12~34칸/변으로 제한한다. **N 을 정확히 그렸다고 주장하지 않는다.**
 *   · **스캔 진행 · 프로브 카드 · 병렬 측정 사이트** — 이 씬 소관이 아니다.
 *
 * 여기 나오는 숫자는 전부 **화면 배치값**이고 물리 상수가 아니다(설계서 §8).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ---------------- 화면 배치값(단독 캔버스 UV) ---------------- */

/** 웨이퍼 디스크 중심. */
export const WM_WAFER_CX = 0.42;
export const WM_WAFER_CY = 0.54;
/**
 * 웨이퍼 디스크의 **세로** 반지름.
 * 🔴 UV 는 비등방이다(가로·세로 각각 0~1). 캔버스가 `aspect-ratio: 16/10` 이므로 원을 그리려면
 *    **가로 반지름 = WM_WAFER_R_Y × (uRes.y / uRes.x)** 로 환산한다. 픽셀로 보면 두 반지름이
 *    똑같이 `WM_WAFER_R_Y × h` 라서, 폴백은 환산 없이 `h` 만 쓰면 된다.
 */
export const WM_WAFER_R_Y = 0.40;

/** 격자 한 변의 칸 수 하한/상한. 상한 34 는 랩의 `dieAcross` 정규화 분모와 같은 수다. */
export const WM_CELLS_MIN = 12;
export const WM_CELLS_MAX = 34;

/** DL 게이지 기둥의 가로 범위. */
export const WM_GAUGE_X0 = 0.86;
export const WM_GAUGE_X1 = 0.94;
/** DL 게이지 기둥의 세로 범위 = 10 ppm → 1e6 ppm. */
export const WM_GAUGE_Y0 = 0.14;
export const WM_GAUGE_Y1 = 0.94;
/** 게이지 전체 높이(= 5 decade). 기둥 높이는 `defectLevel × WM_GAUGE_SPAN` 이다. */
export const WM_GAUGE_SPAN = WM_GAUGE_Y1 - WM_GAUGE_Y0;

/* ---------------- DL 축(로그) ---------------- */

/** 게이지 아래끝/위끝의 ppm 과 decade 수. */
export const WM_DL_MIN_PPM = 10;
export const WM_DL_MAX_PPM = 1e6;
export const WM_DL_DECADES = 5;
/** 합격 상한 ppm. 이 선을 넘으면 판정 배지가 ▲ 로 바뀐다. */
export const WM_DL_PASS_PPM = 1500;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * ppm → 게이지 세로 UV.
 * 🔴 **`Math.log10` 은 이 파일 안에만 있다.** 폴백 drawer 가 로그를 직접 부르면
 *    `check-fallback-purity` R2 로 실패한다 — drawer 는 이 함수를 **호출만** 한다(DSN 명시).
 * 🔴 `clamp(ppm, 10, 1e6)` 를 **로그 앞에** 건다 — `log10(0) = −∞` 를 막는다.
 *    실도달 구간 [19.298, 669,667] 은 게이지 [10, 1e6] 안이라 클리핑은 0 건이다.
 */
export function yOfDL(ppm: number): number {
  const p = clamp(ppm, WM_DL_MIN_PPM, WM_DL_MAX_PPM);
  return WM_GAUGE_Y0 + ((Math.log10(p) - Math.log10(WM_DL_MIN_PPM)) / WM_DL_DECADES) * WM_GAUGE_SPAN;
}

/**
 * 합격 상한선의 세로 UV.
 * 🔴 씬도 폴백도 이 값을 **계산하지 않고 읽는다** — 로그를 두 번 적으면 한쪽이 낡는다.
 */
export const WM_DL_PASS_Y = yOfDL(WM_DL_PASS_PPM);

/**
 * decade 눈금(10 · 100 · 1k · 10k · 100k · 1M)의 세로 UV — 6개.
 * `WM_GAUGE_Y0` 부터 decade 당 `WM_GAUGE_SPAN / WM_DL_DECADES` 씩 올라간다.
 */
export const WM_DL_DECADE_Y: readonly number[] = Array.from(
  { length: WM_DL_DECADES + 1 },
  (_v, i) => WM_GAUGE_Y0 + (i / WM_DL_DECADES) * WM_GAUGE_SPAN,
);

/* ---------------- 판정 배지 ---------------- */
/**
 * 배지는 **DL 기둥 꼭대기에 올라탄다.** 위치·크기를 새로 지어내지 않으려고 게이지 폭에서 파생시켰다
 * — 가로 중심은 게이지 중심, 반지름은 게이지 반폭이다. 세로는 기둥 꼭대기(`gaugeTop`)다.
 */
export const WM_BADGE_CX = (WM_GAUGE_X0 + WM_GAUGE_X1) / 2;
export const WM_BADGE_R = (WM_GAUGE_X1 - WM_GAUGE_X0) / 2;

/* ---------------- 렌더 불투명도 ---------------- */
/**
 * 🔴 **명세에 없는 값이다 — 배치값이 아니라 그리기 농도다.** DSN 표는 「불량 칸을 어둡게」라고만
 *    적었고 색 토큰은 라이트/다크 어느 쪽에서도 「어두운 색」이 아니다(둘 다 배경 대비용이다).
 *    그래서 **불량 칸은 `info` 를 낮은 불투명도로 깔아** 배경 쪽으로 가라앉힌다 — 두 테마에서
 *    모두 정상 칸(`series[0]` 불투명)보다 흐리다. 이 수는 게이트가 아니라 눈이 정한다.
 */
export const WM_DIE_DIM_ALPHA = 0.22;

/* ---------------- 해시(불량 칸 선택) ---------------- */

/**
 * 🔴 `scenes/common.ts` 의 GLSL `hash12` **원문을 그대로 옮긴 것**이다.
 *    GL 과 폴백이 **같은 칸을 어둡게** 해야 하므로 정의가 한 글자도 달라선 안 된다.
 *
 *    원문:
 *      float hash12(vec2 p) {
 *        vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
 *        p3 += dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
 *        return fract((p3.x + p3.y) * p3.z);
 *      }
 *
 * 🔴 **`Math.fround` 로 32비트 부동소수를 흉내낸다.** GLSL `highp float` 은 IEEE754 single 이고
 *    JS 는 double 이다. 그냥 double 로 계산하면 결과가 0.001 수준에서 갈려, 임계값 근처의 칸이
 *    한두 개 뒤집힌다. 연산마다 fround 를 걸면 GPU 와 같은 반올림을 밟는다.
 *    (남는 위험은 GPU 가 `dot()` 을 FMA 로 융합하는 경우뿐이다 — 그 경우도 오차는 1 ulp 급이다.)
 */
export const WM_HASH_MUL = 0.1031;
export const WM_HASH_ADD = 33.33;

const f32 = Math.fround;

/** GLSL `fract(x)` 를 32비트로. */
function fract32(x: number): number {
  return f32(x - Math.floor(x));
}

/** GLSL `hash12(vec2(x, y))` 와 같은 값(0~1). */
export function wmHash12(x: number, y: number): number {
  const k = f32(WM_HASH_MUL);
  const add = f32(WM_HASH_ADD);
  let p0 = fract32(f32(f32(x) * k));
  let p1 = fract32(f32(f32(y) * k));
  let p2 = fract32(f32(f32(x) * k)); // 원문의 vec3(p.x, p.y, p.x) — 3번째 성분은 x 다
  // dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33) — 좌→우 누적 순서로 더한다.
  const dot = f32(f32(f32(p0 * f32(p1 + add)) + f32(p1 * f32(p2 + add))) + f32(p2 * f32(p0 + add)));
  p0 = f32(p0 + dot);
  p1 = f32(p1 + dot);
  p2 = f32(p2 + dot);
  return fract32(f32(f32(p0 + p1) * p2));
}

/** 칸 (col, row) 의 순위값(0~1). 고정 해시라 파라미터가 바뀌어도 **같은 칸이 같은 순위**다. */
export function wmCellRank(col: number, row: number): number {
  return wmHash12(col, row);
}

/**
 * 칸이 불량인가. `rank >= rawYield` 이면 불량이다.
 * 순위가 균일 분포이므로 불량 비율 ≈ `1 − rawYield` 가 된다 —
 * 수율을 올리면 어두운 칸이 **전면에서 고르게** 줄어든다(에지 링이 생기지 않는다).
 */
export function wmIsDefect(col: number, row: number, rawYield: number): boolean {
  return wmCellRank(col, row) >= rawYield;
}

/**
 * 칸 중심이 디스크 안인가.
 * 🔴 **GL 도 픽셀이 아니라 칸 중심으로 판정한다.** 그래야 두 경로의 웨이퍼 실루엣이 같은
 *    계단 모양이 된다(픽셀 판정을 쓰면 경계 칸이 반쪽만 칠해져 폴백과 갈린다).
 */
export function wmCellInDisk(col: number, row: number, across: number): boolean {
  if (!(across > 0)) return false;
  const u = ((col + 0.5) / across) * 2 - 1;
  const v = ((row + 0.5) / across) * 2 - 1;
  return u * u + v * v <= 1;
}

/**
 * 격자 한 변의 칸 수. `dieAcross` 를 12~34 로 클램프한다.
 * `grossDie = 0`(도달 불가) 이면 `across` 가 하한 12 로 바닥칠 뿐 **0 나눗셈은 없다**.
 */
export function wmAcross(dieAcross: number): number {
  const n = Math.round(clamp(dieAcross, 0, 1) * WM_CELLS_MAX);
  return clamp(n, WM_CELLS_MIN, WM_CELLS_MAX);
}

/**
 * 검증·테스트용 칸 집계(그리기에는 쓰지 않는다 — draw 마다 돌릴 이유가 없다).
 * @returns 디스크 안 칸 수와 그중 불량 칸 수
 */
export function wmCellCounts(across: number, rawYield: number): { inDisk: number; defect: number } {
  let inDisk = 0;
  let defect = 0;
  for (let row = 0; row < across; row++) {
    for (let col = 0; col < across; col++) {
      if (!wmCellInDisk(col, row, across)) continue;
      inDisk++;
      if (wmIsDefect(col, row, rawYield)) defect++;
    }
  }
  return { inDisk, defect };
}

/* ---------------- 씬이 쓰는 파생값 ---------------- */

export interface WaferMapModel {
  /** 수율(0~1). 칸 순위가 이 값 이상이면 불량이다. */
  readonly rawYield: number;
  /** DL 로그 정규화값(0~1). */
  readonly defectLevel: number;
  /** 다이 크기의 정규화값(0~1). */
  readonly dieAcross: number;
  /** 격자 한 변의 칸 수(12~34). */
  readonly across: number;
  /** DL 기둥 꼭대기의 세로 UV = `WM_GAUGE_Y0 + defectLevel × WM_GAUGE_SPAN`. */
  readonly gaugeTop: number;
  /** 합격인가 — 기둥 꼭대기가 합격선 이하인가(= DL ≤ 1500 ppm). */
  readonly pass: boolean;
}

/**
 * 🔴 **모든 파라미터 판독은 여기 한 곳뿐이다.** 씬도 폴백도 이 함수를 부른다.
 *    결측 기본값은 셋 다 0 이다(⛔ 0.5 금지 — A15).
 */
export function waferMapModel(params: SceneParams): WaferMapModel {
  const rawYield = pick(params, 'rawYield', 0);
  const defectLevel = pick(params, 'defectLevel', 0);
  const dieAcross = pick(params, 'dieAcross', 0);

  const gaugeTop = WM_GAUGE_Y0 + defectLevel * WM_GAUGE_SPAN;

  return {
    rawYield,
    defectLevel,
    dieAcross,
    across: wmAcross(dieAcross),
    gaugeTop,
    pass: gaugeTop <= WM_DL_PASS_Y,
  };
}
