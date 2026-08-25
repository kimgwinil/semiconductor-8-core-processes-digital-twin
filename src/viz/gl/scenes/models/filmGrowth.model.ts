/**
 * `filmGrowth`(박막 성장 단면) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/filmGrowth.ts` — 화면 배치값을 GLSL 리터럴로 주입한다.
 *   · `gl/fallback2d.ts`     — Canvas2D 로 같은 단면을 그린다.
 *
 * 🔴 **재현되는 것은 형상과 진폭이고, 노이즈의 무늬가 아니다.** GL 은 `fbm`/`vnoise`,
 *    폴백은 결정적 지터를 쓴다 — 요철의 무늬까지 같게 만들 수는 없다. 반드시 같아야 하는 것은
 *    **원표면 · 두께 1.0 의 막 높이 · 계면 하강량 · 거칠기 진폭 · 균일도 편차 진폭 · 눈금 등분**이며,
 *    그 전부가 이 파일에 있다.
 *
 * 여기 나오는 숫자는 전부 화면 배치값이며 물리 상수가 아니다(설계서 §8) —
 * **딱 하나 예외가 `SI_CONSUMED_FRACTION` 이고, 그것은 이 파일이 만들지 않고 물리층에서 받아 온다.**
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';
import { SI_CONSUMPTION_RATIO } from '../../../../models/physics/oxidation/dealGrove';

/* ---------------- 물리층에서 받아 오는 값(화면 배치값 아님) ---------------- */

/**
 * 🔴 **산화막 두께 중 「원표면 아래」로 먹힌 Si 의 비율.** 씬이 계수를 지어내지 않는다 —
 * Deal–Grove 물리층 `SI_CONSUMPTION_RATIO`(S121 §4.1, 현재 0.44)를 **그대로 받는다.**
 * 같은 상수가 랩 출력 `siConsumedNm`·`surfaceRiseNm` 을 만든다
 * (`models/physics/oxidation/dealGrove.ts` `siliconConsumed()` → `models/labs/oxidation.ts`).
 * 그래서 **화면의 계면 하강량과 랩이 옆에 띄우는 숫자가 같은 뿌리에서 나온다.**
 *
 * 🔴 이 값을 **씬 파라미터(uniform 키)로 만들지 않는다** — `12_시각화씬_공백보고.md` §4-1 공백 2:
 *    「**셰이더 내부 상수로 고정**해야지 별도 키로 두면 학습자가 독립 변수로 오해한다」.
 */
export const SI_CONSUMED_FRACTION = SI_CONSUMPTION_RATIO.value;

/* ---------------- 화면 배치값 ---------------- */

/**
 * 산화 전 **원표면**의 화면 높이(UV, 위가 +).
 * 🔴 이것은 기판 상면이 **아니다.** 막이 자라면 계면은 여기서 `SI_CONSUMED_FRACTION` 만큼
 *    내려가고 막 상면은 나머지만큼 올라간다 — 원표면은 그 둘을 재는 **기준선**으로 고정된다.
 */
export const ORIG_SURFACE = 0.24;
/** 두께 1.0 일 때의 **산화막 총 두께**(화면 높이). 원표면 위아래로 나뉘어 배치된다. */
export const FILM_MAX = 0.50;
/** 좌측 눈금 영역 폭. */
export const RULER_X = 0.075;
/** 두께 눈금 등분 수. */
export const RULER_DIVISIONS = 10;
/** 거칠기 1.0 일 때 박막 표면 / 기판 계면 요철의 진폭. */
export const ROUGH_FILM = 0.045;
export const ROUGH_SUB = 0.030;
/** 균일도 0 일 때 좌우 두께 편차의 최대 비율(막 두께에 곱한다). */
export const UNIFORMITY_DEV = 0.12;

/** 씬이 셰이더에 넘기는 파생값. */
export interface FilmGrowthModel {
  /** 산화 전 원표면(UV) — 소모 Si 와 표면 융기를 재는 기준선. 두께와 무관하게 고정이다. */
  origSurface: number;
  /**
   * 산화막/기판 **계면**(UV). 소모된 Si 만큼 원표면 **아래**로 내려간다.
   * 🔴 2026-08-21 이전에는 이 값이 상수였다 — 「산화막이 기판을 먹고 자란다」가 화면에 없었고,
   *    바로 옆에서 랩이 `siConsumedNm` 을 숫자로 띄우고 있어 그림과 숫자가 반대말을 했다(S-A V-1).
   */
  subTop: number;
  /** 요철·편차를 뺀 **평균** 박막 상면(UV) = 원표면 + 표면 융기. */
  filmTopMean: number;
  /** 소모된 Si 두께(UV) = 원표면 − 계면. 랩의 `siConsumedNm` 과 같은 비율이다. */
  siConsumed: number;
  /** 표면 융기(UV) = 막 상면 − 원표면. 랩의 `surfaceRiseNm` 과 같은 비율이다. */
  surfaceRise: number;
  /** 정규화 두께 0~1 */
  thickness: number;
  /** 박막 표면 요철의 진폭(UV) */
  roughFilmAmp: number;
  /** 기판 계면 요철의 진폭(UV) */
  roughSubAmp: number;
  /**
   * 균일도가 만드는 **좌우 두께 편차의 진폭**(UV).
   * 🔴 폴백에 이 항이 통째로 빠져 있었다 — `uniformity` 슬라이더가 그림을 전혀 못 움직였다.
   */
  lateralDevAmp: number;
  /** 재질 색 보간 위치 0=산화막 1=금속막 */
  tint: number;
}

export function filmGrowthModel(params: SceneParams): FilmGrowthModel {
  const thickness = pick(params, 'thickness', 0.35);
  const roughness = pick(params, 'roughness', 0.25);
  const tint = pick(params, 'tint', 0);
  const uniformity = pick(params, 'uniformity', 0.85);
  /** 산화막 총 두께(화면). 이 두께가 원표면을 기준으로 아래/위로 갈라진다. */
  const filmSpan = thickness * FILM_MAX;
  const siConsumed = SI_CONSUMED_FRACTION * filmSpan;
  const surfaceRise = filmSpan - siConsumed;
  return {
    origSurface: ORIG_SURFACE,
    subTop: ORIG_SURFACE - siConsumed,
    filmTopMean: ORIG_SURFACE + surfaceRise,
    siConsumed,
    surfaceRise,
    thickness,
    roughFilmAmp: roughness * ROUGH_FILM,
    roughSubAmp: roughness * ROUGH_SUB,
    lateralDevAmp: (1 - uniformity) * UNIFORMITY_DEV * thickness * FILM_MAX,
    tint,
  };
}
