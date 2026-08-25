/**
 * `plasma`(플라즈마 챔버 단면) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 셋이다:
 *   · `scenes/plasma.ts`  — 아래 상수를 GLSL 리터럴로 주입해 `sheath()`·`glowGain()` 을 만든다.
 *   · `gl/fallback2d.ts`  — Canvas2D 로 같은 시스·발광을 그린다(WebGL2 미지원 경로).
 *   · `tests/unit/plasma-sheath.test.ts` — 셰이더 식을 직접 부를 수 없으므로 이 함수를 검증한다.
 *
 * 2026-08-21 이전에는 폴백이 `(0.10 − 0.07·pressure) · (0.7 + 0.65·power)` 라는 **세 번째 사본**을
 * 들고 있었다 — 전력 부호가 반대였고 `bias` 항이 아예 없었다(결함 ❌-3 · ❌-4 가 폴백에만 남아 있던 것).
 * 식을 여기 하나로 모아 그 사본을 없앴다.
 *
 * ══════════════════ 시스 두께 척도 상수 ══════════════════
 * 🔴 **여기 있는 수는 전부 「화면 배치값」이며 물리 상수가 아니다.** 챔버 단면을 화면에
 *    보기 좋게 담기 위한 진폭일 뿐이고, S번호를 붙일 수 있는 실측값이 아니다.
 *
 * 🔴 **방향(부호)과 지수만 물리에서 가져왔다.** 유도 근거:
 *      디바이 길이        λ_D ∝ (T_e / n_e)^(1/2)
 *      차일드–랭뮤어 시스  s  ≈ λ_D · (2V / T_e)^(3/4)
 *    ⇒ **s ∝ n_e^(−1/2) · V^(3/4)**
 *    · 소스전력↑ → n_e↑ ⇒ 시스 **얇아진다**  (SHEATH_NE_EXP = −0.5)
 *    · 압력↑    → n_e↑ · 평균자유행로↓ ⇒ 시스 **얇아진다**
 *    · 바이어스↑ → 시스 전압 V↑ ⇒ 시스 **두꺼워진다** (SHEATH_BIAS_EXP = 0.75)
 *
 * 🔴 **정본은 이 파일 하나뿐이다.** GLSL `sheath()` 는 아래 상수를 템플릿 리터럴로 주입받고,
 *    폴백은 아래 `sheathThickness()` 를 그대로 호출한다. 식을 옮겨 적지 마라.
 */

/** 챔버 기하 — UV(0~1, 캔버스 세로 비율). */
const WAFER_Y = 0.22;      // 웨이퍼 상면
const SUSCEPTOR_Y = 0.20;
const SHOWER_Y = 0.84;     // 상부 전극 하면

/** 기준 시스 두께(UV). 화면 배치값. */
export const SHEATH_BASE_UV = 0.070;
/** 압력 배율 — uPressure 0 → 1. 화면 배치값(비 3.6배). */
export const SHEATH_PRESSURE_AT_MIN = 1.30;
export const SHEATH_PRESSURE_AT_MAX = 0.36;
/** 전력 0 에서의 정규화 전자밀도 n_e. 0 이면 pow 가 발산하므로 하한을 둔다. 화면 배치값. */
export const SHEATH_NE_AT_MIN_POWER = 0.36;
/** λ_D ∝ n_e^(−1/2) — **물리에서 온 지수**(화면 배치값 아님). */
export const SHEATH_NE_EXP = -0.5;
/** 바이어스 0(부유전위 시스)에서 남는 배율 + 바이어스 1 까지의 증분. 화면 배치값. */
export const SHEATH_BIAS_FLOOR = 0.62;
export const SHEATH_BIAS_GAIN = 0.70;
/** 차일드–랭뮤어 s ∝ V^(3/4) — **물리에서 온 지수**(화면 배치값 아님). */
export const SHEATH_BIAS_EXP = 0.75;

/**
 * 벌크 발광의 하한 배율. 화면 배치값.
 * 🔴 이유: 슬라이더 유효 하한(식각 응용/심화의 P_s = 200 W)에서도 모델은 「식각이 진행 중」
 *    이라고 표시한다. 발광을 uPower 에 그대로 비례시키면 그 지점에서 화면이 완전히 꺼져
 *    **모델과 그림이 서로 다른 말을 한다.** 실제 방전도 점화된 이상 최소 휘도가 있다.
 */
export const GLOW_FLOOR = 0.25;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface SheathParams {
  /** 압력 0~1. 높을수록 얇아진다. */
  pressure: number;
  /** 소스 전력 0~1 (전자밀도 대리). 높을수록 얇아진다. */
  power: number;
  /** 바이어스 0~1. 높을수록 두꺼워진다. */
  bias: number;
}

/**
 * 시스 두께(UV 단위). 🔴 **GLSL `sheath()` 와 같은 식이다** — 상수는 위 블록에서 공유한다.
 * 셰이더 식을 테스트가 직접 부를 수 없으므로 이 함수가 검증 대상이다.
 */
export function sheathThickness(p: SheathParams): number {
  const pressure = clamp01(p.pressure);
  const power = clamp01(p.power);
  const bias = clamp01(p.bias);
  const ne = mix(SHEATH_NE_AT_MIN_POWER, 1.0, power);
  return (
    SHEATH_BASE_UV
    * mix(SHEATH_PRESSURE_AT_MIN, SHEATH_PRESSURE_AT_MAX, pressure)
    * Math.pow(ne, SHEATH_NE_EXP)
    * (SHEATH_BIAS_FLOOR + SHEATH_BIAS_GAIN * Math.pow(bias, SHEATH_BIAS_EXP))
  );
}

/** 벌크 발광 배율. 🔴 GLSL 의 `glowGain()` 과 같은 식이다. 전력 0 에서도 0 이 아니다. */
export function plasmaGlowGain(power: number): number {
  return GLOW_FLOOR + (1 - GLOW_FLOOR) * clamp01(power);
}

/** 시스 두 겹이 챔버를 삼키지 않는지 — 테스트가 쓰는 기하 상수. */
export const PLASMA_GEOMETRY = { WAFER_Y, SUSCEPTOR_Y, SHOWER_Y } as const;
