import {
  assertWithin, describeUiGuard, OutOfLimitError, quantity, uiGuard, withSource, type Quantity,
} from '../../contract';
import { NM_PER_UM, TEN } from '../units';
import { MM_PER_M, NM_PER_M, UM_PER_M } from './units';

/**
 * 배선 저항과 Cu 크기효과 — **물리층. 합성 계수 0건.**
 *
 *   R = ρ·L / (W·T)                                   (S205 Eq.(1) · S210)
 *   ρ_eff(d) = ρ₀·[1 + (3/8)(1−p)·λ/d]                 Fuchs–Sondheimer 표면산란 (S210 Eq.(1)–(2))
 *   ρ_eff(k) = ρ₀·[1 + C(k)(1−p)/k],  k·λ = 4·A/P     S216 Eq.(8) — **유한 선폭 배선**
 *
 * 🔴 **두 식은 기하가 다르다. 섞어 쓰지 않는다**(M-28 형 사고 예방):
 *    · `effectiveResistivityFS`     — **무한폭 박막**. 특성길이 = 두께, 계수 3/8 고정(S210).
 *    · `effectiveResistivityFSLine` — **유한 선폭 배선**. 특성길이 = 4·단면적/둘레, 계수 구간 분기(S216).
 *    배선 저항(`copperLineResistance`)은 **뒤쪽**을 쓴다. 앞쪽을 배선에 쓰면 ρ_eff 가 낮게 나온다(M-29).
 *
 * 🔴 **λ = 40 nm 를 300 K 정본으로 쓴다**(S210 본문, 원출처 Graham APL 2010).
 *    39 nm 는 S207 본문·S216 으로 **인용 가능**하다(원장 2026-08-20 정정 — 종전의 「사용 금지」는 철회됐다).
 *    정본은 40 nm 이므로 계산에는 40 만 쓴다.
 * 🔴 ⛔ **Mayadas–Shatzkes 입계 산란 항은 여전히 구현하지 않는다(M-17).** 원장은 2026-08-20 에
 *    **R = 0.17**(S216 Table IV, 다마신 Cu)을 확보해 **근거 공백은 해소**했지만, MS 항을 넣는 것은
 *    별건이고 이 수정의 범위 밖이다. 화면 라벨은 **「표면 산란」**이라고만 쓴다 — 「표면·입계」로
 *    적으면 없는 항을 있다고 말하는 것이다. MS 를 넣을 때는 **α = (λ/D)·R/(1−R) 규약이 정본**이다(M-28).
 * 🔴 ⛔ **S210 의 ρ₀Λ₀ = 1.99×10⁻¹⁵ Ω·m² 를 쓰지 않는다.** 역산하면 Λ₀ = 117.8 nm 로 같은 논문
 *    본문의 40 nm 와 3배 어긋난다. **ρ₀ 와 λ 로 직접 곱한다**(1.68e-8 × 40e-9 = 6.72×10⁻¹⁶ Ω·m²,
 *    원장이 지시한 6.7×10⁻¹⁶ 과 일치).
 * ⛔ **배리어 두께 파라미터는 만들지 않는다(M-18).** S207 이 정성 서술뿐이라 정량치가 없다.
 */

/** Cu 벌크 저항률 (300 K). S210 (본문 1.68 – 피팅 1.69 ×10⁻⁸ Ω·m 중 하한 채택). */
export const CU_RHO0 = withSource(1.68e-8, 'Ω·m', 'S210');

/** 🔴 Cu 전자 평균자유행정 (300 K) = **40 nm**. S210 본문(원출처 Graham APL 2010). */
export const CU_MEAN_FREE_PATH_NM = withSource(40, 'nm', 'S210');

/**
 * Fuchs–Sondheimer 근사식의 계수 **3/8**. S210 Eq.(1)–(2)
 * (κ = d/λ ≳ 1 영역의 표준 근사 `ρ = ρ₀[1 + (3/8)(1−p)λ/d]`).
 *
 * 🔴 이 상수는 **무한폭 박막 전용**이다. 유한 선폭 배선에는 아래 S216 분기를 쓴다(M-29).
 */
export const FS_COEFFICIENT = withSource(0.375, '', 'S210');

/* ── S216 Eq.(8) — FS 계수의 구간 분기 (원장 M-29 해소) ──────────────────────
 * 원장이 확정한 내용 그대로다:
 *   `k·λ = 4 × 단면적 / 둘레`  ·  **k > 4 → 3/8(0.375)**  ·  **0.5 < k < 4 → 0.474**
 * S216 = Smith 외(IBM), AIP Advances 9(2) 025015 (2019), DOI 10.1063/1.5063896 (CC BY 4.0).
 * 🔴 계수가 커지는 방향이므로, 3/8 고정은 미세 배선에서 ρ_eff 를 **낮게** 낸다(0.375→0.474 = +26.4 %). */

/** S216 Eq.(8) 의 특성길이 정의 인자 — `k·λ = **4**·A/P`. 정의값이지 피팅값이 아니다. */
export const FS_AREA_PERIMETER_FACTOR = withSource(4, '', 'S216');
/** S216 Eq.(8) 구간 경계 상단 **k = 4**. 이 위가 광폭 영역이다. */
export const FS_K_WIDE_MIN = withSource(4, '', 'S216');
/** S216 Eq.(8) 구간 경계 하단 **k = 0.5**. 이 아래로는 S216 이 계수를 주지 않는다. */
export const FS_K_VALID_MIN = withSource(0.5, '', 'S216');
/** k > 4 (광폭) 계수 **3/8**. S216 Eq.(8). S210 의 3/8 과 같은 값이지만 출처가 다르다. */
export const FS_COEFFICIENT_WIDE = withSource(0.375, '', 'S216');
/** 0.5 < k ≤ 4 계수 **0.474**. S216 Eq.(8). */
export const FS_COEFFICIENT_MID = withSource(0.474, '', 'S216');

/** S216 Eq.(8) 이 계수를 주는 k 구간의 하한(열린 구간). 이 값 **이하**는 계산을 거부한다. */
export const FS_K_VALID_RANGE: [number, number] = [FS_K_VALID_MIN.value, Number.POSITIVE_INFINITY];

/** 정반사율 p — Cu/SiO₂ 계면 가정. S210. p = 0 이면 표면 산란이 전부 확산 산란이다. */
export const SPECULARITY_P = withSource(0, '', 'S210');

/** ρ₀·λ 곱 — **직접 계산한다.** S210 이 인쇄한 1.99×10⁻¹⁵ 는 원장이 금지했다. */
export const CU_RHO0_TIMES_MFP = CU_RHO0.value * (CU_MEAN_FREE_PATH_NM.value / NM_PER_M);

/* 🔴 2026-08-21 정정 — 아래 둘은 `withSource(…, 'S210')` 이었다. S210 이 진술하는 것은
 * FS 표면산란 식과 Cu 벌크 저항률·평균자유행로이지 **「두께 입력 5 nm~1 µm」가 아니다.**
 * 주석도 이미 「**UI 여유를 준 값**」이라고 적어 스스로 근거를 부정하고 있었다.
 * 수치는 그대로 두고(5 · 1000) 표기만 고쳤다. 허용 리터럴·환산 상수로 조립한다(규약 §2-3). */

/** FS 근사가 성립하는 두께 구간 — S210 이 다룬 초박막대에 **우리가** UI 여유를 준 값. */
const THICKNESS_MIN_NM = uiGuard(
  2 + 2 + 1, 'nm',
  '이보다 얇으면 연속 박막 가정 자체가 무너져 FS 식을 쓸 수 없다고 보고 그은 입력 하한. S210 이 정한 한계가 아니다',
);
const THICKNESS_MAX_NM = uiGuard(
  NM_PER_UM, 'nm',
  '크기효과가 사실상 사라지는 1 µm 를 입력 상한으로 삼았다. 문헌이 정한 상한이 아니다',
);
export const THICKNESS_RANGE_NM: [number, number] = [THICKNESS_MIN_NM.value, THICKNESS_MAX_NM.value];

/** 선폭 유효구간 — 5 nm(최신 노드) ~ 100 µm(파워 레일).
 *  🔴 종전 `withSource(…, 'S205')` 인데 **주석이 스스로 「UI 안전장치」라고 적고 있었다.**
 *  「최신 노드」·「파워 레일」은 업계 상식이지 S205 의 진술이 아니다. 수치 불변(5 · 100000). */
const WIDTH_MIN_NM = uiGuard(
  2 + 2 + 1, 'nm',
  '최신 노드보다 좁은 선폭은 이 모델의 논의 대상이 아니라고 보고 그은 입력 하한. 문헌 하한이 아니다',
);
const WIDTH_MAX_NM = uiGuard(
  NM_PER_UM * 100, 'nm',
  '파워 레일급 100 µm 까지만 열어 둔 입력 상한. 문헌이 정한 상한이 아니다',
);
export const WIDTH_RANGE_NM: [number, number] = [WIDTH_MIN_NM.value, WIDTH_MAX_NM.value];

/** 배선 길이 유효구간 — local 배선 0.01 µm ~ global 배선 100 mm.
 *  🔴 S205 는 배선 **계층(local/global)을 논할** 뿐 입력 구간 0.01 µm~100 mm 를 진술하지 않는다.
 *  0.01 은 2진수로 정확 표현되지 않아 `1 / 100` 이 리터럴과 **같은 비트**임을 확인하고 썼다. */
const LENGTH_MIN_UM = uiGuard(
  1 / 100, 'µm',
  'local 배선보다 짧은 구간은 이 모델이 다루지 않는다고 보고 그은 입력 하한. 문헌 하한이 아니다',
);
const LENGTH_MAX_UM = uiGuard(
  100 * (UM_PER_M / MM_PER_M), 'µm',
  'global 배선급 100 mm 까지만 열어 둔 입력 상한. 문헌이 정한 상한이 아니다',
);
export const LENGTH_RANGE_UM: [number, number] = [LENGTH_MIN_UM.value, LENGTH_MAX_UM.value];

/** 저항률 출력 유효구간 — 벌크 Cu 하한부터 극박막 상한까지.
 *  🔴 종전 `withSource(…, 'S210')`. Cu 벌크 ρ₀ ≈ 1.7×10⁻⁸ 의 약 60배로 잡은 **표시 상한**이지
 *  S210 이 정한 물리 한계가 아니다. 1e-6 도 정확 표현이 안 돼 `1 / UM_PER_M` 의 비트를 대조했다. */
const RESISTIVITY_MAX = uiGuard(
  1 / UM_PER_M, 'Ω·m',
  '극박막까지 덮도록 잡은 출력 표시 상한. 물리적 한계가 아니다',
);
export const RESISTIVITY_RANGE: [number, number] = [0, RESISTIVITY_MAX.value];

/** 저항 출력 유효구간 — UI 안전장치.
 *  🔴 주석이 **이미 「UI 안전장치」라고 적어 두고** `withSource(…, 'S205')` 를 달고 있었다.
 *  10⁹ = `100⁴ × TEN` 조립. 비트 대조 `41cdcd6500000000`. */
const RESISTANCE_MAX_OHM = uiGuard(
  100 * 100 * 100 * 100 * TEN, 'Ω',
  '출력 표시가 깨지지 않게 둔 저항 상한. 물리적 한계가 아니다',
);
export const RESISTANCE_RANGE_OHM: [number, number] = [0, RESISTANCE_MAX_OHM.value];

/**
 * Fuchs–Sondheimer **표면 산란**만 반영한 실효 저항률 — **무한폭 박막 전용**.
 * `d` 는 **박막의 두께 방향 치수**다 — S210 이 초박막(ultrathin Cu film)을 다뤘기 때문이다.
 *
 * 🔴 **배선에 쓰지 마라.** 선폭이 식에 들어가지 않으므로 좁은 배선에서 ρ_eff 를 낮게 낸다(M-29).
 *    배선은 `effectiveResistivityFSLine` 을 쓴다.
 * 🔴 입계 산란(Mayadas–Shatzkes)은 여기에 **없다**(M-17). 그래서 이 값은 실제 미세 배선의
 *    저항률 **하한** 쪽에 가깝다. 화면에서도 그렇게 고지해야 한다.
 */
export function effectiveResistivityFS(args: { thicknessNm: number }): Quantity {
  assertWithin('thicknessNm', args.thicknessNm, THICKNESS_RANGE_NM, 'nm');
  const dMeters = args.thicknessNm / NM_PER_M;
  const lambdaMeters = CU_MEAN_FREE_PATH_NM.value / NM_PER_M;
  const surfaceTerm = FS_COEFFICIENT.value * (1 - SPECULARITY_P.value) * (lambdaMeters / dMeters);
  return quantity(CU_RHO0.value * (1 + surfaceTerm), {
    modelId: 'metal.resistance.effectiveResistivity',
    unit: 'Ω·m',
    sourceId: 'S210',
    validRange: RESISTIVITY_RANGE,
    assumptions: [
      'Fuchs–Sondheimer 표면 산란만 (입계 산란 미포함 — M-17)',
      '정반사율 p = 0 (Cu/SiO₂)',
      'λ = 40 nm (300 K 정본, S210). 39 nm 는 S207·S216 으로 인용 가능',
      '🔴 무한 폭 박막 근사 (특성길이 = 두께). 유한 선폭 배선에는 effectiveResistivityFSLine 을 쓴다',
      '계수 3/8 고정 — S210 이 박막에 인쇄한 값. 계수 분기는 S216 Eq.(8) 쪽에 있다 (M-29 해소)',
      // 🔴 FS 식과 계수는 S210 이 뒷받침하지만 **두께 입력 범위선은 아무 문헌도 뒷받침하지 않는다.**
      `두께 입력구간 하한: ${describeUiGuard(THICKNESS_MIN_NM)}`,
      `두께 입력구간 상한: ${describeUiGuard(THICKNESS_MAX_NM)}`,
      `저항률 출력 상한: ${describeUiGuard(RESISTIVITY_MAX)}`,
      '🔴 3/8 은 k > 4 (S216 이 부르는 fat wires) 영역의 근사다 — S216 §V A 가 명시한다',
    ],
  });
}

/**
 * S216 **Eq.(5)** 의 특성길이 `k·λ = 4 × 단면적 / 둘레` 에서 **4·A/P [nm]** 를 낸다.
 * 🔴 **식 번호 정정 2026-08-21(원문 열람).** 종전 주석은 이 기하를 Eq.(8) 이라 적었으나
 *    Eq.(8) 은 **계수 분기식**(`ρ_interface = ρ_bulk·λ·(1−p)·0.474·(1/w+1/h)`, 조건 0.5 < k < 4)이고
 *    `4·A/P` 기하는 **Eq.(5)**(Sondheimer 귀속)다. 두 식은 등가로 연결되므로 **수치 영향은 없다**
 *    (`1/k = (λ/2)(1/w+1/h)` ⇒ `(1/w+1/h) = P/(2A)`). 인용 라벨만 틀려 있었다.
 * 🔴 **이 기하는 박막에도 적용된다** — S216 **Table I** 이 박막을 같은 체계에 넣고 `≈ 2 × height` 를 준다
 *    (무한폭 박막에서 `4wh/2w = 2h`). 그러므로 박막식과 배선식을 가르는 근거는 **기하가 아니라
 *    「k 영역이 달라 계수가 다르다」**이다(박막은 통상 k > 4 → 3/8, 배선은 0.5 < k < 4 → 0.474).
 * ⚠️ **Eq.(5)의 k 는 Steinhoegl 등의 k 와 인수 4만큼 다르다**(원문 명시 경고). 타 문헌 k 와 혼용 금지.
 * 직사각 단면이면 `4·W·T / (2(W+T)) = 2WT/(W+T)` — W 와 T 의 조화평균이다.
 * 극단에서 상식과 맞는다: W = T 인 정사각 배선이면 W, W ≫ T 인 광폭 배선이면 2T 로 간다.
 */
export function lineCharacteristicLengthNm(args: { widthNm: number; thicknessNm: number }): number {
  assertWithin('widthNm', args.widthNm, WIDTH_RANGE_NM, 'nm');
  assertWithin('thicknessNm', args.thicknessNm, THICKNESS_RANGE_NM, 'nm');
  const area = args.widthNm * args.thicknessNm;
  const perimeter = 2 * (args.widthNm + args.thicknessNm);
  return (FS_AREA_PERIMETER_FACTOR.value * area) / perimeter;
}

/** S216 Eq.(8) 의 무차원 `k = (4·A/P) / λ`. 배선이 평균자유행정 몇 개만큼 굵은지를 뜻한다. */
export function fsDimensionlessK(args: { widthNm: number; thicknessNm: number }): number {
  return lineCharacteristicLengthNm(args) / CU_MEAN_FREE_PATH_NM.value;
}

/**
 * S216 Eq.(8) 의 **구간별 FS 계수**.
 *   · `k > 4`        → **0.375 (3/8)**  — 광폭
 *   · `0.5 < k ≤ 4`  → **0.474**
 *   · `k ≤ 0.5`      → 🔴 **S216 이 값을 주지 않는다. 계산을 거부한다.**
 *
 * 🔴 **경계 k = 4 는 우리 규약이지 S216 의 진술이 아니다.** 논문은 `k > 4` 와 `0.5 < k < 4` 만
 *    적었고 `k = 4` 자체는 어느 구간에도 넣지 않았다. 우리는 **0.474 쪽에 닫는다** — 계수가 큰
 *    쪽이라 ρ_eff 를 낮게 잡는 오류(M-29 결함의 방향)로 다시 기울지 않기 때문이다.
 * 🔴 `k ≤ 0.5` 에서 아무 값이나 외삽하지 않는다. 집안 관례대로(S203 보정표·S204 빈 칸) **던진다.**
 *    이 영역은 FS 급수 근사 자체가 깨지는 곳이라 「가까운 값」이 존재하지 않는다.
 */
export function fsCoefficientForK(k: number): number {
  if (!Number.isFinite(k) || k <= FS_K_VALID_MIN.value) {
    throw new OutOfLimitError('k (S216 Eq.(8) 유효구간, k > 0.5)', k, FS_K_VALID_RANGE, '');
  }
  return k > FS_K_WIDE_MIN.value ? FS_COEFFICIENT_WIDE.value : FS_COEFFICIENT_MID.value;
}

/**
 * **유한 선폭 배선**의 FS 실효 저항률 — S216 Eq.(8).
 *
 *   `ρ_eff = ρ₀·[1 + C(k)·(1 − p)/k]`,  `k·λ = 4 × 단면적 / 둘레`
 *
 * 🔴 원장 M-29 해소분이다. 종전 구현은 계수를 3/8 로 고정하고 선폭을 아예 무시했다 —
 *    0.5 < k ≤ 4 구간(= 이 제품의 배선 전부)에서 ρ_eff 가 최대 **26.4 %** 낮게 나왔다.
 * 🔴 입계 산란(Mayadas–Shatzkes)은 여기에도 **없다**(M-17). 이 값은 여전히 하한 쪽이다.
 */
export function effectiveResistivityFSLine(args: {
  widthNm: number; thicknessNm: number;
}): Quantity {
  const k = fsDimensionlessK(args);
  const coefficient = fsCoefficientForK(k);
  const surfaceTerm = (coefficient * (1 - SPECULARITY_P.value)) / k;
  return quantity(CU_RHO0.value * (1 + surfaceTerm), {
    // 🔴 **박막식과 키를 나눈다**(오케스트레이터 판정 2026-08-21). 두 식은 **기하가 다르고 출처가 다르다**
    //    (S210 무한폭 박막 vs S216 유한 선폭). 한 키로 묶으면 **원장에서 두 식이 구분되지 않는다** —
    //    「합성 출력이 문헌 S번호를 빌려 쓰던」 사고의 약한 판본이다.
    modelId: 'metal.resistance.effectiveResistivityLine',
    unit: 'Ω·m',
    sourceId: 'S216',
    validRange: RESISTIVITY_RANGE,
    assumptions: [
      'Fuchs–Sondheimer 표면 산란만 (입계 산란 미포함 — M-17)',
      '정반사율 p = 0 (Cu/SiO₂, S210)',
      'λ = 40 nm (300 K 정본, S210). 39 nm 는 S216 이 21 °C 기준으로 네 곳에서 주며 인용 가능하나 정본이 아니다 — 온도 조건이 다르다',
      '유한 선폭 배선: 특성길이 = 4·단면적/둘레 (S216 Eq.(5))',
      'FS 계수는 k 로 분기한다 — k > 4 → 0.375, 0.5 < k ≤ 4 → 0.474 (S216 Eq.(8))',
      '🔴 표면거칠기 항 Δp 미반영 — 이 값은 실제보다 낮다. S216 의 최종형은 Eq.(8) 이 아니라 '
        + 'Eq.(10)·(11) 로 (1−p−Δp) 형태이고, 논문 결론은 R = 0.17 · p = 0 · Δp = 0.06~0.07 이다. '
        + '유효 (1−p−Δp) 는 Table V 기준 1.196~1.261 — 거칠기를 넣으면 ρ_interface 가 약 20~26 % 오른다',
      '🔴 0.474 는 Table II 평균 0.948 의 절반이라고 S216 이 밝힌다(k=1→0.982 · k=2→0.951 · k=3→0.915). '
        + '다만 그 세 값의 실제 산술평균은 0.9493(절반 0.4747)이라 원문 표기 자체에 반올림 차가 있다. '
        + '우리는 원문 표기값 0.474 를 따른다',
      '🔴 k ≤ 0.5 는 S216 이 계수를 주지 않아 계산을 거부한다 (외삽하지 않는다)',
      '균일 직사각 단면 · 배리어 잠식 미반영 (M-18 — 정량치 미확보)',
    ],
  });
}

/**
 * 벌크 대비 상승률 ρ_eff/ρ₀. λ 와 ρ₀ 가 함께 들어가므로 크기효과만 뽑아 본다.
 *
 * 🔴 `widthNm` 을 주면 **배선식(S216)**, 주지 않으면 **박막식(S210)** 이다.
 *    종전에는 `widthNm` 을 받아 놓고 **쓰지 않고 버렸다** — 인자가 결과에 안 나타나는 조용한 무시였다(M-29).
 */
export function sizeEffectRatio(args: { thicknessNm: number; widthNm?: number }): Quantity {
  const rho = args.widthNm === undefined
    ? effectiveResistivityFS({ thicknessNm: args.thicknessNm }).value
    : effectiveResistivityFSLine({ thicknessNm: args.thicknessNm, widthNm: args.widthNm }).value;
  return quantity(rho / CU_RHO0.value, {
    modelId: 'metal.resistance.sizeEffectRatio',
    unit: '',
    sourceId: args.widthNm === undefined ? 'S210' : 'S216',
    validRange: [1, RESISTIVITY_MAX.value / CU_RHO0.value],
    assumptions: [
      '표면 산란만',
      args.widthNm === undefined
        ? '무한폭 박막 (특성길이 = 두께, 계수 3/8 — S210)'
        : '유한 선폭 배선 (특성길이 = 4·A/P, 계수 구간 분기 — S216 Eq.(8))',
    ],
  });
}

/** 배선 저항 `R = ρ·L/(W·T)`. 저항률을 호출자가 준다(벌크든 FS 실효값이든). S205 Eq.(1). */
export function lineResistance(args: {
  resistivityOhmM: number; lengthUm: number; widthNm: number; thicknessNm: number;
}): Quantity {
  assertWithin('resistivityOhmM', args.resistivityOhmM, RESISTIVITY_RANGE, 'Ω·m');
  assertWithin('lengthUm', args.lengthUm, LENGTH_RANGE_UM, 'µm');
  assertWithin('widthNm', args.widthNm, WIDTH_RANGE_NM, 'nm');
  assertWithin('thicknessNm', args.thicknessNm, THICKNESS_RANGE_NM, 'nm');
  const lengthM = args.lengthUm / UM_PER_M;
  const areaM2 = (args.widthNm / NM_PER_M) * (args.thicknessNm / NM_PER_M);
  return quantity((args.resistivityOhmM * lengthM) / areaM2, {
    modelId: 'metal.resistance.lineResistance',
    unit: 'Ω',
    sourceId: 'S205',
    validRange: RESISTANCE_RANGE_OHM,
    assumptions: [
      '균일 직사각 단면',
      '배리어 잠식 미반영 (M-18 — 정량치 미확보)',
      // 🔴 R = ρ·L/(W·T) 는 S205 가 뒷받침하지만 **두께 범위선은 아무 문헌도 뒷받침하지 않는다.**
      `두께 입력구간 상한: ${describeUiGuard(THICKNESS_MAX_NM)}`,
      `선폭 입력구간: ${describeUiGuard(WIDTH_MIN_NM)} / ${describeUiGuard(WIDTH_MAX_NM)}`,
      `길이 입력구간: ${describeUiGuard(LENGTH_MIN_UM)} / ${describeUiGuard(LENGTH_MAX_UM)}`,
      `저항 출력 상한: ${describeUiGuard(RESISTANCE_MAX_OHM)}`,
    ],
  });
}

/**
 * Cu 배선 저항 — **선폭과 두께가 함께 정하는** FS 표면산란을 실효 저항률에 반영해 계산한다.
 *
 * 🔴 2026-08-21 M-29 수정: 종전에는 `effectiveResistivityFS({thicknessNm})`(무한폭 박막식)을 썼다.
 *    그래서 ρ_eff 가 **선폭과 무관**했고 R 이 정확히 1/W 로만 움직였다. 지금은 S216 Eq.(8) 로 바뀌어
 *    **좁은 배선에서 ρ_eff 가 올라간다** — R 은 1/W 보다 빠르게 커진다.
 */
export function copperLineResistance(args: {
  lengthUm: number; widthNm: number; thicknessNm: number;
}): Quantity {
  const rho = effectiveResistivityFSLine({
    widthNm: args.widthNm, thicknessNm: args.thicknessNm,
  }).value;
  return lineResistance({ resistivityOhmM: rho, ...args });
}
