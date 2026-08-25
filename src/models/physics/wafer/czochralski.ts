import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * CZ 결정성장 — 최대 인상속도 + 축방향 편석. **물리층. 합성 계수 0건.**
 *
 * 🔴 기존 기획 명세의 `D = 260 − 32·V`(직경-인상속도 선형식)는 **교육용으로 지어낸 합성식**이었다.
 *    문헌식으로 갈아엎은 것이 이 파일이다. 그 식은 이 코드베이스에 존재하지 않는다.
 *
 * 출처
 *  - **S106** *Large Area Czochralski Silicon*, ERDA/JPL 954475-76/1 (1977–78), NTRS 19780008498.
 *    미국 정부 발주 공개보고서. §A.1 · Fig. 3 — **V_max ∝ r^(−1/2)** (독립 3개 모델이 같은 지수),
 *    ⌀12 cm 에서 **20–30 cm/h**.
 *  - **S107** 축방향 편석(Scheil / normal freezing) 예제. ⚠ 아래 M-1 주의를 반드시 읽어라.
 */

/**
 * 🔴 **M-1 (원장 §4-2).** 편석계수 k₀ 표의 유일 출처 S107 은 **라이선스 불가**다.
 *  - 수치·수식은 사실이므로 **계산에 쓰는 것은 된다.**
 *  - **표를 제품 화면에 전재하지 않는다.** 그래서 이 파일은 **k₀ 표를 담지 않는다** — 호출자가 넘긴다.
 *  - 대체 출처 확보 전까지 **이 계산의 출처(S107)를 화면에 노출하지 않는다.**
 * UI 층이 기계적으로 확인할 수 있도록 플래그로 내보낸다.
 */
export const SEGREGATION_SOURCE_HIDDEN_IN_UI = true;
export const SEGREGATION_UI_NOTE =
  '편석계수 출처는 라이선스 미확보(M-1)입니다. 계수표와 출처 표기를 화면에 내지 마십시오.';

/** S106 §A.1 · Fig. 3 — 기준점. ⌀12 cm 에서 20–30 cm/h. */
const VMAX_REFERENCE_DIAMETER_CM = withSource(12, 'cm', 'S106');
const VMAX_LOW_CM_PER_H = withSource(20, 'cm/h', 'S106');
const VMAX_HIGH_CM_PER_H = withSource(30, 'cm/h', 'S106');

/**
 * 직경 유효창.
 *  - 하한: 문헌 기준점의 **절반**까지만 외삽한다(우리가 고른 수가 아니라 기준점에서 파생시킨 값).
 *  - 상한: 현행 300 mm = 30 cm 웨이퍼 직경 (S108 제품 데이터시트의 대상 규격).
 */
const DIAMETER_MAX_CM = withSource(30, 'cm', 'S108');
const DIAMETER_MIN_CM_VALUE = VMAX_REFERENCE_DIAMETER_CM.value / 2;
export const CRYSTAL_DIAMETER_RANGE_CM: [number, number] = [DIAMETER_MIN_CM_VALUE, DIAMETER_MAX_CM.value];

export type PullRateBound = 'low' | 'high';

/**
 * 최대 인상속도. **V_max ∝ r^(−1/2)** (S106 §A.1 — 열전달 모델 3종이 같은 지수를 준다).
 * 기준점을 통과시켜 쓴다: V_max(d) = V_ref · √(d_ref / d).
 *
 * 🔴 **절대값이 아니라 「띠」로 낸다.** 문헌이 기준 직경에서 20–30 cm/h 라는 폭을 준 이상
 *    한 값으로 좁히는 것은 우리가 지어내는 것이다.
 */
export function maxPullRate(args: { diameterCm: number; bound: PullRateBound }): Quantity {
  assertWithin('diameterCm', args.diameterCm, CRYSTAL_DIAMETER_RANGE_CM, 'cm');
  const reference = args.bound === 'low' ? VMAX_LOW_CM_PER_H : VMAX_HIGH_CM_PER_H;
  // r^(−1/2) 는 직경비의 −1/2 승과 같다(반지름과 직경은 비례하므로 비에서 2가 약분된다).
  const v = reference.value * Math.sqrt(VMAX_REFERENCE_DIAMETER_CM.value / args.diameterCm);
  return quantity(v, {
    modelId: 'wafer.czochralski.maxPullRate',
    unit: 'cm/h',
    sourceId: 'S106',
    validRange: [
      VMAX_LOW_CM_PER_H.value * Math.sqrt(VMAX_REFERENCE_DIAMETER_CM.value / DIAMETER_MAX_CM.value),
      VMAX_HIGH_CM_PER_H.value * Math.sqrt(VMAX_REFERENCE_DIAMETER_CM.value / DIAMETER_MIN_CM_VALUE),
    ],
    assumptions: [
      'V_max ∝ r^(−1/2) (S106 §A.1, 독립 열전달 모델 3종 공통)',
      `기준점 ⌀${VMAX_REFERENCE_DIAMETER_CM.value} cm 에서 ${VMAX_LOW_CM_PER_H.value}–${VMAX_HIGH_CM_PER_H.value} cm/h (S106 Fig. 3)`,
      '🔴 융점 방사율 e 는 출처 간 불일치(S106 0.46 vs S101 고상 0.64·액상 0.30)라 이 모델에 넣지 않았다',
    ],
  });
}

/**
 * 고화율(응고 분율) X 의 유효창. **X = 1 은 (1−X)^(k₀−1) 이 발산하는 수학적 특이점**이므로 제외한다.
 * 🔴 문헌값이 아니라 수치 안전장치다. 그래서 출처를 붙이지 않고 허용 숫자만으로 조립한다.
 */
const SOLID_FRACTION_MAX_VALUE = 1 - 1 / 100;
export const SOLID_FRACTION_RANGE: [number, number] = [0, SOLID_FRACTION_MAX_VALUE];
/**
 * 편석계수의 창. k₀ = 1 이면 편석이 없다(상한). 하한도 문헌값이 아닌 수치 안전장치다
 * — 원장이 싣는 가장 작은 k₀(Cu 4×10⁻⁶)보다 아래다.
 */
const SEGREGATION_COEFF_MIN_VALUE = 1 / (100 * 100 * 100);
export const SEGREGATION_COEFF_RANGE: [number, number] = [SEGREGATION_COEFF_MIN_VALUE, 1];

/**
 * Scheil 축방향 편석 (normal freezing): **C_s = k₀·C₀·(1 − X)^(k₀ − 1)**
 *  - C₀ : 초기 융액 농도, X : 응고 분율, k₀ : 평형 편석계수
 *  - k₀ < 1 이면 지수가 음수라 X 가 커질수록 C_s 가 증가한다 → 잉곳 꼬리가 더 진해진다.
 *
 * 🔴 **k₀ 를 인자로 받는다.** 편석계수 표를 코드에 싣지 않는 것이 M-1 대응이다.
 */
export function scheilAxialConcentration(args: {
  k0: number; meltConcentrationCm3: number; solidFraction: number;
}): Quantity {
  assertWithin('k0', args.k0, SEGREGATION_COEFF_RANGE, '');
  assertWithin('solidFraction', args.solidFraction, SOLID_FRACTION_RANGE, '');
  const cs = args.k0 * args.meltConcentrationCm3
    * Math.pow(1 - args.solidFraction, args.k0 - 1);
  return quantity(cs, {
    modelId: 'wafer.czochralski.scheilAxial',
    unit: 'cm⁻³',
    sourceId: 'S107',
    validRange: [
      args.k0 * args.meltConcentrationCm3,
      args.k0 * args.meltConcentrationCm3 * Math.pow(1 - SOLID_FRACTION_MAX_VALUE, args.k0 - 1),
    ],
    assumptions: [
      'Scheil(normal freezing) — 융액 완전혼합, 고상 확산 무시, k₀ 일정',
      '평형 편석계수. 성장속도가 빠르면 실효 편석계수 k_eff 가 1 에 가까워지지만 그 보정식은 미확보다',
      SEGREGATION_UI_NOTE,
    ],
  });
}

/**
 * 고상의 어느 지점 농도로부터 초기 융액 농도 C₀ 를 역산한다 — Scheil 식을 C₀ 에 대해 푼 것이다.
 *   C₀ = C_s / [k₀·(1 − X)^(k₀ − 1)]
 * R104 는 X = 0.05 에서, R105 는 시드단 X = 0 에서 이 역산으로 시작한다.
 */
export function meltConcentrationFromSolid(args: {
  k0: number; solidConcentrationCm3: number; solidFraction: number;
}): Quantity {
  assertWithin('k0', args.k0, SEGREGATION_COEFF_RANGE, '');
  assertWithin('solidFraction', args.solidFraction, SOLID_FRACTION_RANGE, '');
  const c0 = args.solidConcentrationCm3
    / (args.k0 * Math.pow(1 - args.solidFraction, args.k0 - 1));
  return quantity(c0, {
    modelId: 'wafer.czochralski.meltConcentration',
    unit: 'cm⁻³',
    sourceId: 'S107',
    validRange: [0, Number.MAX_VALUE],
    assumptions: ['C₀ = C_s / [k₀(1−X)^(k₀−1)] — Scheil 식의 역산', SEGREGATION_UI_NOTE],
  });
}
