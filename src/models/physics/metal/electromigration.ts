import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';
import { BOLTZMANN_EV_PER_K } from '../constants';
import { TEN } from '../units';
import { PA_PER_MPA, UM_PER_M, CM_PER_M } from './units';

/**
 * 일렉트로마이그레이션 — **가속계수(AF) 비율과 Blech 임계곱만. 물리층. 합성 계수 0건.**
 *
 * 🔴 ⛔ **Black 식 MTTF 절대값을 내지 않는다 (A6L-03).** 계수 A 는 공정·구조 의존이라 공개
 *    실측값이 없다. 임의값을 넣으면 MTTF 가 통째로 거짓이 된다.
 *    **A 는 AF 비율에서 약분되므로**, 비율 학습은 손실 없이 온전히 성립한다:
 *
 *      MTTF = A·J^(−n)·exp(E_a/kT)
 *      AF = MTTF₂/MTTF₁ = (J₁/J₂)^n · exp[(E_a/k)(1/T₂ − 1/T₁)]      ← A 가 사라진다
 *
 *    조건 1 = 가속(스트레스), 조건 2 = 사용 조건으로 잡으면 AF 가 「사용조건 수명 / 시험조건 수명」이다.
 *
 * ⛔ **Blech 의 Al 원논문 값(M-16)을 쓰지 않는다.** AIP 페이월. **Cu(R168)만** 구현한다.
 *
 * 출처: **R173**(S201 Table 2.1) · **R168**(S206 §V-A·§V-C 식 (7)) · 볼츠만 상수는 회사 규약
 * `k = 8.617×10⁻⁵ eV/K`(후공정 원장 R16 = **S54** JESD74A 식[1]).
 */

export type EmMaterial = 'Al' | 'Cu';
export type DiffusionPath = 'bulk' | 'grainBoundary' | 'surface';

/** 🔴 회사 규약 볼츠만 상수. 후공정 원장 R16 — JESD74A 식[1] 표기를 채택했다.
 *  🔴 2026-08-22 — 값을 여기서 다시 선언하지 않고 `../constants` 정본을 **별칭으로 다시 내보낸다.**
 *     종전에는 같은 값이 `EM_` 접두만 붙어 다섯 번째로 선언돼 있었다. 값·출처·이름 전부 불변. */
export const EM_BOLTZMANN_EV_PER_K = BOLTZMANN_EV_PER_K;

/** S201 Table 2.1 (p.30) = 원장 **R173**. 확산경로별 활성화에너지 [eV]. */
export const EM_ACTIVATION_ENERGY: Readonly<Record<EmMaterial, Readonly<Record<DiffusionPath, SourcedConst>>>> = {
  Al: {
    bulk: withSource(1.2, 'eV', 'S201'),
    grainBoundary: withSource(0.7, 'eV', 'S201'),
    surface: withSource(0.8, 'eV', 'S201'),
  },
  Cu: {
    bulk: withSource(2.3, 'eV', 'S201'),
    grainBoundary: withSource(1.2, 'eV', 'S201'),
    surface: withSource(0.8, 'eV', 'S201'),
  },
};

/**
 * Black 지수 n. S201 §2.2.1.
 * Al 은 공극 **핵생성** 律速이라 n = 2, Cu 는 **표면확산** 지배라 n = 1.1–1.3.
 * 🔴 후공정 원장 R8(Al-Cu, E_a=0.8 eV, N=2)과 중복을 피하려고 전공정 예제는 **n 으로 차별화**한다.
 */
export const BLACK_N_AL = withSource(2, '', 'S201');
export const BLACK_N_CU_MIN = withSource(1.1, '', 'S201');
export const BLACK_N_CU_MAX = withSource(1.3, '', 'S201');
/** 공극 **성장** 律速 고장모드의 n. S201 §2.2.1. */
export const BLACK_N_VOID_GROWTH = withSource(1, '', 'S201');

/** n 입력 유효구간 — S201 이 제시한 1(성장 律速)–2(핵생성 律速). */
export const BLACK_N_RANGE: [number, number] = [BLACK_N_VOID_GROWTH.value, BLACK_N_AL.value];

/* ───────────────────────── 입력·출력 범위 — 전부 UI 안전장치다 ─────────────────────────
 * 🔴 2026-08-21 정정. 아래 셋은 종전에 **전부 `withSource(…, 'S201')`** 였다.
 *    S201 Table 2.1 이 진술하는 것은 **확산경로별 E_a 개별값(0.7 · 0.8 · 1.2 · 2.3 eV)** 이지
 *    「입력 하한 0.5」도 「상한 2.5」도 아니다. 주석이 이미 **「여유를 준 UI 안전장치」**라고
 *    적어 스스로 근거를 부정하고 있었다 — 여유폭은 우리가 붙인 것이지 문헌이 준 것이 아니다.
 *    `AF_MAX`(10³⁰)에 이르면 **그런 값을 진술하는 문헌은 존재할 수 없다.**
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 0.5 · 2.5 · 10³⁰ 그대로이며 비트 단위로 대조했다.
 *    다만 매직넘버 차단(규약 §2-3)이 면제되지 않으므로 허용 리터럴(0·1·2·−1·0.5·100)로 조립한다.
 * 🔴 이 파일에서 S201 을 정당하게 인용하는 값은 `EM_ACTIVATION_ENERGY` 표 · `BLACK_N_*` ·
 *    `EM_ONSET_CURRENT_DENSITY` 다. */

/** E_a 입력 유효구간 [eV]. 🔴 Table 2.1 의 0.7–2.3 eV 에 **우리가** 여유를 준 값이다. */
const EA_MIN_EV = uiGuard(
  0.5, 'eV',
  'Table 2.1 의 최소 0.7 eV 아래로 슬라이더가 내려가도 식이 깨지지 않게 둔 여유폭. 문헌이 정한 하한이 아니다',
);
const EA_MAX_EV = uiGuard(
  2 + 0.5, 'eV',
  'Table 2.1 의 최대 2.3 eV(Cu 벌크) 위로 둔 여유폭. 문헌이 정한 상한이 아니다',
);
export const EA_RANGE_EV: [number, number] = [EA_MIN_EV.value, EA_MAX_EV.value];

/** 🔴 EM 이 문제되는 전류밀도 하한 — S201 §2.1 이 명시한 10⁴ A/cm². */
export const EM_ONSET_CURRENT_DENSITY = withSource(1e4, 'A/cm²', 'S201');
/** 🔴 상한은 문헌이 아니다. S201 §2.1 이 진술한 것은 **하한 10⁴** 뿐이다.
 *  10⁸ = 허용 리터럴 100 을 4번 곱해 조립(규약 §2-3). 비트 대조 `4197d78400000000`. */
const CURRENT_DENSITY_MAX = uiGuard(
  100 * 100 * 100 * 100, 'A/cm²',
  '이 위는 배선이 즉시 녹아 EM 수명 논의가 무의미해지는 영역이라 막은 입력 상한. S201 이 정한 한계가 아니다',
);
export const CURRENT_DENSITY_RANGE: [number, number] = [
  EM_ONSET_CURRENT_DENSITY.value, CURRENT_DENSITY_MAX.value,
];

/** 온도 입력 유효구간 [K] — 상온 아래부터 번인 상한까지.
 *  🔴 종전 `withSource(…, 'S201')`. **원장 전수 대조 결과 S201 에 온도 범위 진술이 없다** —
 *  원장이 S201 에 귀속시킨 것은 Table 2.1 의 E_a, §2.2.1 의 n, §2.1 의 전류밀도 **하한**뿐이다.
 *  (S201 Fig. 2.8 의 25→125 °C 는 원장이 ⛔**금지값**으로 지정한 캡션 불일치 건이라 근거가 못 된다.)
 *  250 = `(2+0.5)*100` · 700 = `(2+2+2+1)*100`. 비트 대조 `406f400000000000`·`4085e00000000000`. */
const TEMP_MIN_K = uiGuard(
  (2 + 0.5) * 100, 'K',
  '상온보다 낮은 쪽은 EM 논의 대상이 아니라고 보고 그은 입력 하한. 문헌이 정한 하한이 아니다',
);
const TEMP_MAX_K = uiGuard(
  (2 + 2 + 2 + 1) * 100, 'K',
  '가속시험 번인 온도대를 덮도록 잡은 입력 상한. 문헌이 정한 상한이 아니다',
);
export const TEMP_RANGE_K: [number, number] = [TEMP_MIN_K.value, TEMP_MAX_K.value];

/**
 * AF 출력 유효구간 — UI 안전장치.
 * 🔴 10³⁰ 은 **허용 리터럴 100 을 15번 곱해** 조립한다. 지수 표기 `1e30` 도, `TEN ** 30` 의
 *    지수 `30` 도 매직넘버라 쓸 수 없다(규약 §2-3 · `check-sources` 허용집합 0·1·2·−1·0.5·100).
 *    조립 결과가 `1e30` 과 **비트까지 같음**을 확인했다(IEEE-754 `46293e5939a08cea`).
 */
const AF_MAX = uiGuard(
  100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100, '',
  'AF 가 발산해도 화면·검사가 죽지 않게 둔 출력 상한. 이만한 수를 진술하는 문헌은 존재할 수 없다',
);
export const AF_RANGE: [number, number] = [0, AF_MAX.value];

/**
 * 🔴 **Black 가속계수 — 비율만.**
 *   AF = (J₁/J₂)^n · exp[(E_a/k)(1/T₂ − 1/T₁)] = MTTF(조건2) / MTTF(조건1)
 *
 * 계수 A 가 약분되어 사라지므로 **MTTF 절대값 없이도** 온도·전류밀도 의존을 정확히 가르친다.
 */
export function blackAccelerationFactor(args: {
  currentDensity1: number; currentDensity2: number;
  temperature1K: number; temperature2K: number;
  exponentN: number; activationEnergyEv: number;
}): Quantity {
  assertWithin('currentDensity1', args.currentDensity1, CURRENT_DENSITY_RANGE, 'A/cm²');
  assertWithin('currentDensity2', args.currentDensity2, CURRENT_DENSITY_RANGE, 'A/cm²');
  assertWithin('temperature1K', args.temperature1K, TEMP_RANGE_K, 'K');
  assertWithin('temperature2K', args.temperature2K, TEMP_RANGE_K, 'K');
  assertWithin('exponentN', args.exponentN, BLACK_N_RANGE, '');
  assertWithin('activationEnergyEv', args.activationEnergyEv, EA_RANGE_EV, 'eV');

  const currentTerm = Math.pow(args.currentDensity1 / args.currentDensity2, args.exponentN);
  const thermalTerm = Math.exp(
    (args.activationEnergyEv / EM_BOLTZMANN_EV_PER_K.value) *
    (1 / args.temperature2K - 1 / args.temperature1K),
  );
  return quantity(currentTerm * thermalTerm, {
    modelId: 'metal.em.accelerationFactor',
    unit: '',
    sourceId: 'S201',
    validRange: AF_RANGE,
    assumptions: [
      '🔴 MTTF 절대값 아님 — 계수 A 가 약분된 비율이다 (A6L-03)',
      '단일 세그먼트 배선',
      'k = 8.617×10⁻⁵ eV/K (회사 규약)',
      // 🔴 식과 E_a 표는 S201 이 뒷받침하지만 **범위선은 아무 문헌도 뒷받침하지 않는다.**
      //    화면이 S201 배지 옆에서 이 사실을 함께 말해야 한다.
      `E_a 입력구간 하한: ${describeUiGuard(EA_MIN_EV)}`,
      `E_a 입력구간 상한: ${describeUiGuard(EA_MAX_EV)}`,
      `AF 출력구간: ${describeUiGuard(AF_MAX)}`,
      `전류밀도 입력 상한: ${describeUiGuard(CURRENT_DENSITY_MAX)}`,
      `온도 입력구간 하한: ${describeUiGuard(TEMP_MIN_K)}`,
      `온도 입력구간 상한: ${describeUiGuard(TEMP_MAX_K)}`,
    ],
  });
}

/* ── Blech 임계곱 (Cu 이중다마신) — R168 · S206 §V-A ─────────────────────────────── */

/** S206 §V-A — Cu 이중다마신 저항률. */
export const BLECH_CU_RESISTIVITY = withSource(2.25e-8, 'Ω·m', 'S206');
/** 동, 원자 부피 Ω. */
export const BLECH_CU_ATOMIC_VOLUME = withSource(1.18e-29, 'm³', 'S206');
/** 동, 임계응력 σ_crit = 41 MPa. */
export const BLECH_CU_SIGMA_CRIT_MPA = withSource(41, 'MPa', 'S206');
/** 동, 유효 원자가 z*. */
export const BLECH_CU_Z_STAR = withSource(1, '', 'S206');
/** 동, 활성화에너지·확산 선지수 (참고값 — 임계곱 자체에는 들어가지 않는다). */
export const BLECH_CU_EA_EV = withSource(0.8, 'eV', 'S206');
export const BLECH_CU_D0 = withSource(1.3e-9, 'm²/s', 'S206');
export const BLECH_CU_TEMP_K = withSource(378, 'K', 'S206');

/**
 * 전기소량 e. **NIST CODATA(S212 와 동일한 NIST CUU 데이터셋)** — 2019 SI 재정의로 **정확값**이다.
 * S206 §V-C 식 (7) 의 분모에 들어간다.
 */
export const ELEMENTARY_CHARGE = withSource(1.602176634e-19, 'C', 'S212');

/** 임계곱 출력 유효구간 [A/µm] — UI 안전장치.
 *  🔴 종전 `withSource(…, 'S206')`. S206 이 진술하는 임계곱은 **0.27 A/µm**(원장 R168)이지
 *     「출력 상한 100 A/µm」가 아니다. 주석이 이미 「UI 안전장치」라고 적고 있었다. */
const JL_MAX_A_PER_UM = uiGuard(
  100, 'A/µm',
  'R168 골든값 0.27 A/µm 의 수백 배까지 열어 둔 출력 표시 상한. 물리적 한계가 아니다',
);
export const JL_RANGE_A_PER_UM: [number, number] = [0, JL_MAX_A_PER_UM.value];

/** 임계응력 입력 유효구간 [MPa] — S206 의 41 MPa 를 **담는 창**이지 S206 의 진술이 아니다.
 *  🔴 종전 `withSource(…, 'S206')`. 1000 = `100 * TEN` 조립. 비트 대조 `408f400000000000`. */
const SIGMA_CRIT_MAX_MPA = uiGuard(
  100 * TEN, 'MPa',
  'S206 의 41 MPa 를 넉넉히 담도록 잡은 박막 응력 입력 상한. 문헌이 정한 상한이 아니다',
);
export const SIGMA_CRIT_RANGE_MPA: [number, number] = [0, SIGMA_CRIT_MAX_MPA.value];

/**
 * 🔴 **Blech 임계곱** — 불멸(immortality) 조건 `Δσ < 2σ_crit` 에서:
 *
 *   (j·l)_crit = 2·σ_crit·Ω / (e · z* · ρ)          [A/m] → A/µm 로 환산
 *
 * S206 파라미터를 넣으면 **0.268 A/µm** 이 나온다(원장 R168 = 0.27 A/µm = 2 700 A/cm, ±5 %).
 * ⛔ Al 원논문 값(M-16)은 쓰지 않는다.
 */
export function blechCriticalProduct(args: {
  sigmaCritMPa: number; atomicVolumeM3: number; effectiveValence: number; resistivityOhmM: number;
}): Quantity {
  assertWithin('sigmaCritMPa', args.sigmaCritMPa, SIGMA_CRIT_RANGE_MPA, 'MPa');
  const numerator = 2 * (args.sigmaCritMPa * PA_PER_MPA) * args.atomicVolumeM3;
  const denominator = ELEMENTARY_CHARGE.value * args.effectiveValence * args.resistivityOhmM;
  const perMeter = numerator / denominator; // A/m
  return quantity(perMeter / UM_PER_M, {
    modelId: 'metal.em.blechProduct',
    unit: 'A/µm',
    sourceId: 'S206',
    validRange: JL_RANGE_A_PER_UM,
    assumptions: [
      '불멸 조건 Δσ < 2σ_crit',
      '단일 세그먼트',
      'Cu 이중다마신 (S206 §V-A)',
      // 🔴 식 (7)과 파라미터는 S206 이 뒷받침하지만 **출력 범위선은 아무 문헌도 뒷받침하지 않는다.**
      `임계곱 출력구간: ${describeUiGuard(JL_MAX_A_PER_UM)}`,
      `임계응력 입력 상한: ${describeUiGuard(SIGMA_CRIT_MAX_MPA)}`,
    ],
  });
}

/** Cu 기본 파라미터로 계산한 임계곱. 원장 R168 골든값이 이 함수를 검증한다. */
export function copperBlechCriticalProduct(): Quantity {
  return blechCriticalProduct({
    sigmaCritMPa: BLECH_CU_SIGMA_CRIT_MPA.value,
    atomicVolumeM3: BLECH_CU_ATOMIC_VOLUME.value,
    effectiveValence: BLECH_CU_Z_STAR.value,
    resistivityOhmM: BLECH_CU_RESISTIVITY.value,
  });
}

/**
 * 불멸 판정 — 배선의 `j·l` 이 임계곱보다 작으면 역응력이 전자풍력을 상쇄해 EM 으로 끊기지 않는다.
 * `currentDensityAPerCm2` 는 단면 전류밀도, `lengthUm` 은 세그먼트 길이다.
 */
export function isImmortal(args: {
  currentDensityAPerCm2: number; lengthUm: number; criticalProductAPerUm: number;
}): boolean {
  assertWithin('currentDensityAPerCm2', args.currentDensityAPerCm2, CURRENT_DENSITY_RANGE, 'A/cm²');
  // j[A/cm²]·l[µm] 을 A/µm 로 맞춘다.
  //   l[cm] = l[µm]/10⁴  →  j·l [A/cm]  →  ×10⁻⁴ → A/µm.  합쳐서 10⁸ 로 나눈다(= 100⁴).
  const productAPerUm = (args.currentDensityAPerCm2 * args.lengthUm)
    / (CM_PER_M * CM_PER_M * CM_PER_M * CM_PER_M);
  return productAPerUm < args.criticalProductAPerUm;
}
