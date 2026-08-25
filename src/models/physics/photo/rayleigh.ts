import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource, type Quantity,
} from '../../contract';
import { TEN } from '../units';

/**
 * Rayleigh 해상도·초점심도 — **물리층. 합성 계수 0건.**
 * `R = k₁·λ/NA` · `DOF = k₂·λ/NA²`. 원장 S140(Mack CHE323 L48) · S150(ASML) · S143(Tutor 44).
 *
 * 🔴 k₂ 는 범용값이 존재하지 않는다(원장 §4-1). 확보한 것은
 *    **ArF 침지 조건의 실험 추출값 0.745 (S149, CC BY 4.0)** 뿐이다.
 *    → 그 조건 밖에서는 **DOF 절대값을 계산하지 않고 비율만** 낸다(`dofRatio`).
 */

/** k₁ 물리 하한 — 2광속 결상 한계. S140 L48 s5 + S150 두 독립 출처 일치. */
export const K1_PHYSICAL_FLOOR = withSource(0.25, '', 'S140');

/** k₂ — ArF 침지 실험 추출값. **이 조건 밖에서는 쓰지 않는다.** */
export const K2_ARF_IMMERSION = withSource(0.745, '', 'S149');

/** ArF 파장. S140. */
export const ARF_LAMBDA = withSource(193, 'nm', 'S140');

/** 침지수 굴절률 @193 nm. S140 L48 s7. */
export const N_WATER_193 = withSource(1.436, '', 'S140');

/** 건식 NA 이론 상한(sinθ). S140 L48 s6. */
export const NA_DRY_MAX = withSource(0.93, '', 'S140');
/** ArF 침지 NA 상한. S140 · S149. */
export const NA_IMMERSION_MAX = withSource(1.35, '', 'S140');

/** 실용 파장 하한(EUV 13.5 nm) · 상한(g-line 436 nm). S140·S141·S147. */
const LAMBDA_MIN = withSource(13.5, 'nm', 'S147');
const LAMBDA_MAX = withSource(436, 'nm', 'S140');
export const LAMBDA_RANGE_NM: [number, number] = [LAMBDA_MIN.value, LAMBDA_MAX.value];

/* ─────────────── 아래 둘은 UI 안전장치다 — 출처를 붙일 수 없다 ───────────────
 * 🔴 2026-08-22 정정. 둘 다 `withSource(…, 'S140')` 이었다. **S140 이 말한 숫자와 코드의 숫자가
 *    실제로 다르다** — 이것이 「문헌이 진술하는 범위」와 「우리가 그은 선」을 가르는 시금석이다:
 *      · S140 L48 s10 이 진술한 1975년 세대는 **NA 0.16 · k₁ 1.0** 이다.
 *      · 코드가 쓰던 값은 **NA 0.1 · k₁ 1.5** 다. 둘 다 우리가 여유를 붙인 값이다.
 *    (반대로 같은 파일의 `K1_PHYSICAL_FLOOR`(0.25) · `NA_DRY_MAX`(0.93) · `LAMBDA_*` 는
 *     문헌이 그 숫자를 그대로 진술하므로 `withSource` 로 남는다.)
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 0.1 = `1 / TEN`(비트 `9a9999999999b93f`) ·
 *    1.5 = `1 + 0.5`(비트 `000000000000f83f`). 허용 리터럴·환산으로만 조립했다(규약 §2-3). */

/** NA 입력 하한. 🔴 S140 이 진술한 실용 최소치는 **0.16**(1975년)이고 0.1 은 그 아래로 잡은 선이다. */
const NA_MIN = uiGuard(
  1 / TEN, '',
  'S140 L48 s10 의 1975년 NA 0.16 아래로 슬라이더가 내려가도 식이 깨지지 않게 둔 여유폭. 문헌이 정한 하한이 아니다',
);
/** k₁ 입력 상한. 🔴 S140 이 진술한 1975년 세대 값은 **1.0** 이고 1.5 는 그 위로 잡은 선이다. */
const K1_MAX = uiGuard(
  1 + 0.5, '',
  'S140 L48 s10 의 1975년 k₁ 1.0 위로 둔 여유폭. 문헌이 정한 상한이 아니다',
);
/* ───────── 아래 셋도 UI 안전장치다 — 위 둘과 **같은 사유인데 그때 빠졌다** ─────────
 * 🔴 2026-08-22 2차 정정. `withSource(…,'S140')` · `withSource(…,'S143')` 였다.
 *    위 `NA_MIN`·`K1_MAX` 를 내릴 때 **바로 아래 세 줄이 같은 계열인데 남았다.**
 *
 * 🔴 **원문 전수 대조 결과 세 숫자는 원문에 아예 없다**(`pdftotext -layout` 전문 추출):
 *      · S140(Mack CHE323 L48)에 **"1 nm" 0건 · "5000" 0건.** 인쇄된 해상도는 **36 nm ~ 2700 nm** 다.
 *      · S143(Tutor 44)에 **"1000" 0건.** 그 글이 다루는 DOF 비율은 **1.4 ~ 2.0** 이다.
 *    ⚠️ 원장 §2-2 S140 항목의 「이미지형 PDF → 렌더링 판독」 주석 때문에 종전 대조가 접혔던 것으로 보이는데,
 *       **그 주석이 사실과 다르다**(텍스트 레이어가 있다). 원장 쪽도 같은 날 함께 고쳤다.
 *
 * 🔴 **코드 자신이 「우리가 그은 선」임을 증언한다 — 문헌값이면 나올 수 없는 모순이다:**
 *      · `resolution` 의 입력 상한 조합(λ=436 · NA=0.1 · k₁=1.5)은 **6540 nm** 로 `OUT_MAX` 5000 을 **넘는다.**
 *        즉 유효범위가 자기 정의역보다 좁다 — 문헌이 준 물리 경계라면 있을 수 없다.
 *      · `dofRatio` 의 NA 구간으로 가능한 **수학적 최대 비율은 (1.35/0.1)² = 182.25** 로 1000 에 한참 못 미친다.
 *        `RATIO_MAX` 는 도달 불가능한 선이다 — 화면·검사가 죽지 않게 둔 여유폭일 뿐이다.
 *
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 1 은 허용 리터럴 그대로 ·
 *    5000 = `(2+2+1)*TEN*100`(비트 `40b3880000000000`) · 1000 = `TEN*100`(비트 `408f400000000000`).
 *    허용 리터럴·환산으로만 조립했다(규약 §2-3). */

/** 해상도·DOF 출력 하한. 🔴 S140 이 인쇄한 최소 해상도는 **36 nm** 이고 1 nm 는 그 아래로 잡은 선이다. */
const OUT_MIN = uiGuard(
  1, 'nm',
  '1 nm 아래 해상도는 이 교육모형이 다루지 않는다고 보고 그은 출력 하한. S140 이 정한 하한이 아니다',
);
/** 해상도·DOF 출력 상한. 🔴 S140 이 인쇄한 최대 해상도는 **2700 nm** 이고 5000 nm 는 그 위로 잡은 선이다. */
const OUT_MAX = uiGuard(
  (2 + 2 + 1) * TEN * 100, 'nm',
  'g-line·저 NA 조합에서 계산이 죽지 않게 둔 출력 상한. S140 이 정한 상한이 아니다',
);
/** DOF 비율 출력 상한. 🔴 S143 이 다루는 비율은 **1.4~2.0** 이고 1000 은 도달 불가능한 여유폭이다. */
const RATIO_MAX = uiGuard(
  TEN * 100, '',
  'NA 비가 발산해도 화면·검사가 죽지 않게 둔 출력 상한. 현 NA 구간으로는 182.25 를 넘을 수 없어 실제로 닿지 않는다',
);

export function resolution(args: { lambdaNm: number; na: number; k1: number }): Quantity {
  assertWithin('lambdaNm', args.lambdaNm, LAMBDA_RANGE_NM, 'nm');
  assertWithin('na', args.na, [NA_MIN.value, NA_IMMERSION_MAX.value], '');
  // 🔴 k₁ < 0.25 는 물리적으로 불가능하다. 면제가 아니라 범위 밖이다(설계서 §13-3).
  assertWithin('k1', args.k1, [K1_PHYSICAL_FLOOR.value, K1_MAX.value], '');
  return quantity((args.k1 * args.lambdaNm) / args.na, {
    modelId: 'photo.rayleigh.resolution',
    unit: 'nm',
    sourceId: 'S140',
    validRange: [OUT_MIN.value, OUT_MAX.value],
    assumptions: [
      '주기 패턴 half-pitch', '단일 노광',
      // 🔴 식·상수는 S140 이 뒷받침하지만 **범위선은 아무 문헌도 뒷받침하지 않는다.**
      `NA 입력구간 하한: ${describeUiGuard(NA_MIN)}`,
      `k₁ 입력구간 상한: ${describeUiGuard(K1_MAX)}`,
      `출력구간: ${describeUiGuard(OUT_MIN)} / ${describeUiGuard(OUT_MAX)}`,
    ],
  });
}

/**
 * 초점심도 — **k₂ 출처가 있는 조건에서만** 절대값을 낸다.
 * ArF 침지(λ=193 nm, NA>1) 밖이면 던진다. 「출처 없는 값을 슬라이더로 감추지 않는다」(원장 규칙 10).
 */
export function depthOfFocusArFImmersion(args: { lambdaNm: number; na: number }): Quantity {
  if (args.lambdaNm !== ARF_LAMBDA.value) {
    throw new Error(
      `[S149] k₂ = 0.745 는 ArF(193 nm) 침지 실험 추출값이다. λ=${args.lambdaNm} nm 에는 적용할 수 없다. ` +
      `dofRatio() 로 비율만 구하라.`,
    );
  }
  assertWithin('na', args.na, [N_WATER_193.value - N_WATER_193.value + 1, NA_IMMERSION_MAX.value], '');
  return quantity((K2_ARF_IMMERSION.value * args.lambdaNm) / (args.na * args.na), {
    modelId: 'photo.rayleigh.dof',
    unit: 'nm',
    sourceId: 'S149',
    validRange: [OUT_MIN.value, OUT_MAX.value],
    assumptions: [
      'ArF 침지 실험 추출 k₂ = 0.745', '조건 한정 — 다른 파장·건식에 전용 불가',
      `출력구간: ${describeUiGuard(OUT_MIN)} / ${describeUiGuard(OUT_MAX)}`,
    ],
  });
}

/**
 * NA 변화에 따른 DOF **비율**. `DOF ∝ 1/NA²` 이므로 k₂ 가 약분되어 사라진다.
 * → **출처 없는 상수를 쓰지 않고** EUV(0.33 → 0.55 NA) 같은 조건도 가르칠 수 있다.
 */
export function dofRatio(args: { naFrom: number; naTo: number }): Quantity {
  assertWithin('naFrom', args.naFrom, [NA_MIN.value, NA_IMMERSION_MAX.value], '');
  assertWithin('naTo', args.naTo, [NA_MIN.value, NA_IMMERSION_MAX.value], '');
  const r = (args.naFrom * args.naFrom) / (args.naTo * args.naTo);
  return quantity(r, {
    modelId: 'photo.rayleigh.dofRatio',
    unit: '',
    sourceId: 'S143',
    validRange: [0, RATIO_MAX.value],
    assumptions: [
      'k₂ 가 약분되어 상수가 필요 없다', '파라시알(근축) 근사',
      `NA 입력구간 하한: ${describeUiGuard(NA_MIN)}`,
      `출력구간 상한: ${describeUiGuard(RATIO_MAX)}`,
    ],
  });
}

/** 역산 — 목표 CD 를 만드는 k₁. 공정 난이도를 읽는 지표다. */
export function requiredK1(args: { targetCdNm: number; lambdaNm: number; na: number }): Quantity {
  assertWithin('targetCdNm', args.targetCdNm, [OUT_MIN.value, OUT_MAX.value], 'nm');
  return quantity((args.targetCdNm * args.na) / args.lambdaNm, {
    modelId: 'photo.rayleigh.requiredK1',
    unit: '',
    sourceId: 'S140',
    validRange: [K1_PHYSICAL_FLOOR.value, K1_MAX.value],
    assumptions: [
      'k₁ 하한 0.25 는 2광속 결상 물리 한계 (S140 L48 s5 · S150)',
      `k₁ 출력구간 상한: ${describeUiGuard(K1_MAX)}`,
      `목표 CD 입력구간: ${describeUiGuard(OUT_MIN)} / ${describeUiGuard(OUT_MAX)}`,
    ],
  });
}
