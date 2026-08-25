/**
 * `stepCoverage`(트렌치 단면 스텝 커버리지) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 셋이다:
 *   · `scenes/stepCoverage.ts` — 유니폼을 채우고 아래 배치값을 GLSL 리터럴로 주입한다.
 *   · `gl/fallback2d.ts`       — Canvas2D 로 같은 형상을 그린다(WebGL2 미지원 경로).
 *   · 테스트 — 셰이더 적분을 직접 부를 수 없으므로 이 함수들이 검증 대상이다.
 *
 * ── 시각 모델 ──────────────────────────────────────────────────────────────
 * 장식이 아니라 **가시각(可視角) 적분**으로 구동한다. 트렌치 벽면의 한 점이 받는 플럭스는
 * 그 점에서 「입구를 통해 보이는 하늘」의 각도 범위를 소스 각분포 S(φ)=cos^m(φ) 로 적분한 값이다.
 *   · 측벽(깊이 d):   F = (1 − cos^(m+1) φmax) / ((m+1)·N),  φmax = atan(2·hw_eff / d)
 *   · 바닥(가로 s):   F = ∫_{φ1}^{φ2} cos^(m+1) φ dφ / N,    φ1,2 = atan((∓hw_eff − s)/H)
 *   · 평탄면:         F = 1 (정규화 기준). N = ∫_{−π/2}^{π/2} cos^(m+1) φ dφ
 * 여기 나오는 숫자는 전부 **화면 배치값**이고 물리 상수가 아니다.
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ---------------- 화면 배치값 ---------------- */

/** 웨이퍼 평탄면(원 표면)의 화면 높이. */
export const FIELD_Y = 0.7;
/** 트렌치 바닥의 화면 높이. */
export const BOT_Y = 0.12;
/** 트렌치 깊이(화면 단위) — 깊이는 고정하고 폭만 바꿔 종횡비를 만든다. */
export const TRENCH_H = FIELD_Y - BOT_Y;
/** 트렌치 중심의 가로 위치(화면 비율). */
export const CX = 0.40;
/** 종횡비 0 / 1 일 때의 트렌치 반폭. 폭이 줄면 깊이/폭 비가 커진다. */
export const HW_WIDE = 0.29;
export const HW_NARROW = 0.042;
/** 누적 증착량 1.0 일 때 평탄면 막 두께. */
export const TAU_MAX = 0.15;
/** 소스 각분포 cos^m 의 m — 좁음(콜리메이션) ↔ 넓음(산란). 기하 형상 계수이지 물리 상수가 아니다. */
export const EXP_NARROW = 20;
export const EXP_BROAD = 0.5;
/** 각분포 폭: 직진성↓ · 압력↑ 이 각각 얼마나 넓히는가. 화면 배치값. */
export const SPREAD_DIR_GAIN = 0.6;
export const SPREAD_PRESS_GAIN = 0.6;
/** 유효 입구 반폭의 하한(화면 단위). 0 이 되면 적분이 발산한다. */
export const HW_EFF_FLOOR = 0.004;

/* ---------------- 각분포 적분 ---------------- */

/** ∫_a^b cos^m(φ) dφ — 심프슨. m 이 정수가 아니라 닫힌 형태가 없다. */
export function cosPowInt(a: number, b: number, m: number, steps = 32): number {
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  let s = Math.pow(Math.max(Math.cos(a), 0), m) + Math.pow(Math.max(Math.cos(b), 0), m);
  for (let i = 1; i < n; i++) {
    const w = i % 2 === 1 ? 4 : 2;
    s += w * Math.pow(Math.max(Math.cos(a + i * h), 0), m);
  }
  return (s * h) / 3;
}

/** 씬이 셰이더에 넘기는 파생값. 방향성 테스트(A12)가 이 함수를 직접 검사한다. */
export interface StepCoverageModel {
  /** 트렌치 반폭(화면 단위). 종횡비↑ → 작아진다 */
  halfWidth: number;
  /** 깊이/폭 종횡비 — 화면에 숫자로 쓰지 않는다(U-7). 테스트 확인용 */
  aspect: number;
  /** 오버행이 갉아먹은 유효 입구 반폭 */
  hwEff: number;
  /** 평탄면 막 두께 */
  tauField: number;
  /** 소스 각분포 지수 m — 직진성↑·압력↓ 이면 커진다(=분포가 좁다) */
  srcExp: number;
  /** 정규화 상수 ∫cos^(m+1) */
  norm: number;
  /** 입구 lip 의 막 두께 = 오버행이 입구를 파고든 길이 */
  overhang: number;
  /** 중간 깊이 측벽 커버리지(평탄면=1 기준) */
  wallCoverage: number;
  /** 바닥 중앙 커버리지(평탄면=1 기준) */
  bottomCoverage: number;
  /** 입구 폐쇄도 0~1. 1 이면 핀치오프 — 안쪽 공간이 보이드로 봉인된다 */
  pinch: number;
  /** 각분포 폭 0~1 — 오른쪽 게이지의 표시 전용 값 */
  spread: number;
}

/** 측벽 커버리지(평탄면 대비). depth=0 이면 그림자가 없어 최대 = 오버행. */
export function wallCoverageAt(depth: number, hwEff: number, m: number, norm: number): number {
  const phiMax = Math.atan2(2 * hwEff, Math.max(depth, 1e-4));
  const c = Math.max(Math.cos(Math.min(phiMax, Math.PI / 2)), 0);
  return (1 - Math.pow(c, m + 1)) / ((m + 1) * norm);
}

/** 바닥 커버리지(평탄면 대비). s = 트렌치 중심에서의 가로 거리. */
export function bottomCoverageAt(s: number, hwEff: number, m: number, norm: number): number {
  const a = Math.atan2(-hwEff - s, TRENCH_H);
  const b = Math.atan2(hwEff - s, TRENCH_H);
  return cosPowInt(a, b, m + 1) / norm;
}

/**
 * 정규화 파라미터 4개 → 셰이더 유니폼으로 쓸 파생값.
 * 셰이더 안의 식과 같은 식을 쓴다(테스트가 여기서 방향성을 검증하면 화면도 같이 검증된다).
 */
export function stepCoverageModel(params: SceneParams): StepCoverageModel {
  const aspectRatio = pick(params, 'aspectRatio', 0.5);
  const directionality = pick(params, 'directionality', 0.5);
  const deposited = pick(params, 'deposited', 0.45);
  const pressure = pick(params, 'pressure', 0.4);

  const halfWidth = HW_WIDE + (HW_NARROW - HW_WIDE) * aspectRatio;
  // 직진성↓ · 압력↑ 이면 도달 각도 분포가 넓어진다 → m 이 작아진다.
  const spread = Math.min(1, Math.max(0, (1 - directionality) * SPREAD_DIR_GAIN + pressure * SPREAD_PRESS_GAIN));
  const srcExp = EXP_NARROW * Math.pow(EXP_BROAD / EXP_NARROW, spread);
  const norm = cosPowInt(-Math.PI / 2, Math.PI / 2, srcExp + 1);
  const tauField = deposited * TAU_MAX;

  // 오버행 = 그림자가 전혀 없는 깊이 0 의 측벽 두께.
  const overFrac = 1 / ((srcExp + 1) * norm);
  const overhang = tauField * overFrac;
  // 성장 이력의 평균 입구 폭으로 근사한다(준정적 자기정합).
  const hwEff = Math.max(halfWidth - 0.5 * overhang, HW_EFF_FLOOR);
  const pinch = Math.min(1, Math.max(0, (overhang / halfWidth - 0.8) / 0.2));

  return {
    halfWidth,
    aspect: TRENCH_H / (2 * halfWidth),
    hwEff,
    tauField,
    srcExp,
    norm,
    overhang,
    wallCoverage: wallCoverageAt(TRENCH_H * 0.5, hwEff, srcExp, norm),
    bottomCoverage: bottomCoverageAt(0, hwEff, srcExp, norm),
    pinch,
    spread,
  };
}
