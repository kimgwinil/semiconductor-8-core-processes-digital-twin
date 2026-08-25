import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource, type Quantity,
} from '../../contract';
import { MM_PER_M, NM_PER_M } from './units';

/**
 * 배선 RC 지연과 low-k 비교 — **물리층. 합성 계수 0건.**
 *
 * S205 Eq.(1)–(6):
 *   (1) R   = ρ·L/(W·H)
 *   (2) C_v = K_ox·ε₀·(W·L)/X_ox        ← 하부 접지면에 대한 평행판 성분
 *   (3) C_l = K_ox·ε₀·(H·L)/L_S         ← 이웃 배선에 대한 측면 성분(크로스토크의 출처)
 *   (4) C   = K_I·(C_v + C_l),  K_I ≈ 2 ← 프린지 보정
 *   (5) τ   = 0.89·R·C                   ← 분포 RC 시정수
 *   (6) 이상 스케일링(X_ox = H = W = L_S = λ) → **τ = 3.56·ρ·K_ox·ε₀·L²/λ²**
 *
 * 🔴 **3.56 은 리터럴이 아니다.** 0.89 × K_I × (1+1) 로 **계산해서 나온다** — 그래서 원장 R172 의
 *    「오차 0(대수 항등)」이 코드에서 그대로 성립한다.
 * 🔴 **절대 지연시간(초)을 내지 않는다.** ε₀ 에 붙일 S번호가 원장에 없다. 대신 τ 를 ρ·ε₀ 로 나눈
 *    **무차원 지연**과 **비율**만 낸다 — ε₀ 가 약분되므로 low-k 비교 학습은 온전히 성립한다.
 * ⛔ **Sakurai–Tamaru 계수 1.15/2.80/0.222 를 쓰지 않는다(M-14).** 본문 미열람.
 *    S205 Eq.(2)–(4) + K_I ≈ 2 로 대체한다.
 */

/** 프린지(fringing) 보정 K_I ≈ 2. S205 Eq.(4). */
export const FRINGE_KI = withSource(2, '', 'S205');

/** 분포 RC 시정수 계수 0.89. S205 Eq.(5). */
export const DISTRIBUTED_RC_FACTOR = withSource(0.89, '', 'S205');

/* ── 유전율 (S208 Table 2 · S207) ─────────────────────────────────────────────── */
/** SiO₂. S208 Table 2. */
export const K_SIO2 = withSource(4.0, '', 'S208');
/** FSG(불소 도핑 실리케이트 유리) ≈ 3.5. S208 Table 2. */
export const K_FSG = withSource(3.5, '', 'S208');
/** SiCOH(탄소 도핑 산화막) 2.6–2.7. S208 Table 2. */
export const K_SICOH_MIN = withSource(2.6, '', 'S208');
export const K_SICOH_MAX = withSource(2.7, '', 'S208');
/** 다공성 low-k — 2.6 미만, PECVD 로 2.0 까지. S208 Table 2. */
export const K_POROUS_MIN = withSource(2.0, '', 'S208');
export const K_POROUS_MAX = withSource(2.6, '', 'S208');
/** 에어갭 구조의 **유효** 유전율 ≈ 2.0. S207. */
export const K_AIRGAP_EFFECTIVE = withSource(2.0, '', 'S207');
/** SiN 캡층 ≈ 7 — low-k 를 깔아도 실효 k 를 끌어올리는 주범. S207 §II. */
export const K_SIN_CAP = withSource(7, '', 'S207');

/** 유전율 입력 유효구간 — 에어갭 극한(1)부터 SiN 캡(7)까지. S207·S208. */
export const K_RANGE: [number, number] = [1, K_SIN_CAP.value];

/* ─────────────── 아래 범위선은 UI 안전장치다 — 출처를 붙일 수 없다 ───────────────
 * 🔴 2026-08-22 정정. 아래 셋은 종전에 전부 `withSource(…, 'S205')` 였다.
 *    S205 가 진술하는 것은 **Eq.(1)–(6) 과 이상 스케일링 논의**이지 「입력 치수 1 nm–1 mm」도
 *    「무차원 지연 출력 상한 10³⁰」도 아니다. 주석이 이미 「UI 안전장치」라고 스스로 적고 있었다.
 *    10³⁰ 에 이르면 **그런 수를 진술하는 문헌은 존재할 수 없다.**
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 1e−9 · 1e−3 · 1e30 그대로이며 비트 단위로 대조했다.
 *    매직넘버 차단(규약 §2-3)은 면제되지 않으므로 `./units` 환산과 허용 리터럴로 조립한다. */

/** 치수 입력 유효구간(m) — 1 nm ~ 1 mm. **우리가** 잡은 스케일 창이다.
 *  `1 / NM_PER_M` = 1e−9(비트 `95d626e80b2e113e`) · `1 / MM_PER_M` = 1e−3(비트 `fca9f1d24d62503f`). */
const DIM_MIN_M = uiGuard(
  1 / NM_PER_M, 'm',
  '1 nm 아래는 연속체 RC 모형이 의미를 잃는다고 보고 그은 입력 하한. S205 가 정한 하한이 아니다',
);
const DIM_MAX_M = uiGuard(
  1 / MM_PER_M, 'm',
  '1 mm 위는 온칩 배선이 아니라고 보고 그은 입력 상한. S205 가 정한 상한이 아니다',
);
const DIM_RANGE_M: [number, number] = [DIM_MIN_M.value, DIM_MAX_M.value];

/** 배선 길이 입력 유효구간(m) — 1 nm ~ 1 m. **우리가** 잡은 스케일 창이다.
 *  🔴 2026-08-22 정정 — 둘 다 `withSource(…, 'S205')` 였다. 바로 위 `DIM_*`·`NORM_DELAY_MAX` 를
 *     같은 사유로 옮길 때 **옆줄인 이 둘만 남았다.** 근거는 위 블록과 똑같다 —
 *     S205 가 진술하는 것은 Eq.(1)–(6)과 이상 스케일링이지 입력 길이 구간이 아니다.
 *     🔴 상한은 **1 m** 인데 같은 파일의 폭·높이 상한은 **1 mm** 다. 온칩 배선 1 미터를 진술하는
 *     문헌은 없다 — 계산이 죽지 않게 열어 둔 선이다.
 *  🔴 형제 파일 `metal/resistance.ts` 의 `LENGTH_MIN_UM`·`LENGTH_MAX_UM` 이 이미 같은 사유로
 *     `uiGuard` 화됐다. 그 방식을 그대로 따랐다.
 *  🔴 **수치는 한 자리도 바꾸지 않았다.** `1 / NM_PER_M` = 1e−9 는 위 `DIM_MIN_M` 과 **같은 식**이고
 *     (그 주석이 비트 일치를 이미 기록해 두었다), 상한 1 은 허용 리터럴 그대로다. */
const LEN_MIN_M = uiGuard(
  1 / NM_PER_M, 'm',
  '1 nm 아래는 연속체 RC 모형이 의미를 잃는다고 보고 그은 입력 하한. S205 가 정한 하한이 아니다',
);
const LEN_MAX_M = uiGuard(
  1, 'm',
  '온칩 배선이 1 m 를 넘지 않는다고 보고 그은 입력 상한. S205 가 정한 상한이 아니다',
);

/**
 * 무차원 지연 출력 상한.
 * 🔴 10³⁰ 은 **허용 리터럴 100 을 15번 곱해** 조립한다. 지수 표기 `1e30` 도 지수 `30` 도
 *    매직넘버라 쓸 수 없다(규약 §2-3 · 허용집합 0·1·2·−1·0.5·100).
 *    조립 결과가 `1e30` 과 **비트까지 같음**을 확인했다(IEEE-754 `46293e5939a08cea`).
 */
const NORM_DELAY_MAX = uiGuard(
  100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100 * 100, '',
  '형상비가 발산해도 화면·검사가 죽지 않게 둔 출력 상한. 이만한 수를 진술하는 문헌은 존재할 수 없다',
);
export const NORMALIZED_DELAY_RANGE: [number, number] = [0, NORM_DELAY_MAX.value];

export interface LineGeometryM {
  /** 배선 길이 L [m] */
  lengthM: number;
  /** 배선 폭 W [m] */
  widthM: number;
  /** 배선 높이 H [m] */
  heightM: number;
  /** 배선-접지면 절연막 두께 X_ox [m] */
  oxideThicknessM: number;
  /** 이웃 배선과의 간격 L_S [m] */
  spacingM: number;
}

function assertGeometry(g: LineGeometryM): void {
  assertWithin('lengthM', g.lengthM, [LEN_MIN_M.value, LEN_MAX_M.value], 'm');
  assertWithin('widthM', g.widthM, DIM_RANGE_M, 'm');
  assertWithin('heightM', g.heightM, DIM_RANGE_M, 'm');
  assertWithin('oxideThicknessM', g.oxideThicknessM, DIM_RANGE_M, 'm');
  assertWithin('spacingM', g.spacingM, DIM_RANGE_M, 'm');
}

/**
 * 단위 커패시턴스 형상항 — `C / (K_ox·ε₀)` [m]. S205 Eq.(2)–(4).
 * ε₀ 를 곱하지 않으므로 출처 없는 상수가 필요 없다.
 */
export function capacitanceShapeFactor(g: LineGeometryM): Quantity {
  assertGeometry(g);
  const vertical = (g.widthM * g.lengthM) / g.oxideThicknessM;
  const lateral = (g.heightM * g.lengthM) / g.spacingM;
  return quantity(FRINGE_KI.value * (vertical + lateral), {
    modelId: 'metal.rc.capacitanceShape',
    unit: 'm',
    sourceId: 'S205',
    validRange: [0, NORM_DELAY_MAX.value],
    assumptions: [
      'S205 Eq.(2)–(4)', '프린지 보정 K_I ≈ 2', 'Sakurai–Tamaru 계수 미사용 (M-14)',
      // 🔴 식은 S205 가 뒷받침하지만 **범위선은 아무 문헌도 뒷받침하지 않는다.**
      `치수 입력구간 하한: ${describeUiGuard(DIM_MIN_M)}`,
      `치수 입력구간 상한: ${describeUiGuard(DIM_MAX_M)}`,
      `길이 입력구간: ${describeUiGuard(LEN_MIN_M)} / ${describeUiGuard(LEN_MAX_M)}`,
      `출력구간 상한: ${describeUiGuard(NORM_DELAY_MAX)}`,
    ],
  });
}

/** 저항 형상항 `R/ρ = L/(W·H)` [1/m]. S205 Eq.(1). */
export function resistanceShapeFactor(g: LineGeometryM): Quantity {
  assertGeometry(g);
  return quantity(g.lengthM / (g.widthM * g.heightM), {
    modelId: 'metal.rc.resistanceShape',
    unit: '1/m',
    sourceId: 'S205',
    validRange: [0, NORM_DELAY_MAX.value],
    assumptions: [
      'S205 Eq.(1)',
      `치수 입력구간 하한: ${describeUiGuard(DIM_MIN_M)}`,
      `치수 입력구간 상한: ${describeUiGuard(DIM_MAX_M)}`,
      `길이 입력구간: ${describeUiGuard(LEN_MIN_M)} / ${describeUiGuard(LEN_MAX_M)}`,
      `출력구간 상한: ${describeUiGuard(NORM_DELAY_MAX)}`,
    ],
  });
}

/**
 * 무차원 RC 지연 `τ / (ρ·ε₀)` = 0.89 · [L/(W·H)] · K_I·K_ox·L·(W/X_ox + H/L_S).
 * ρ 와 ε₀ 를 빼 두었으므로 **재료(K_ox)와 형상의 효과만** 순수하게 본다.
 */
export function normalizedRcDelay(args: LineGeometryM & { dielectricConstant: number }): Quantity {
  assertWithin('dielectricConstant', args.dielectricConstant, K_RANGE, '');
  const r = resistanceShapeFactor(args).value;
  const c = args.dielectricConstant * capacitanceShapeFactor(args).value;
  return quantity(DISTRIBUTED_RC_FACTOR.value * r * c, {
    modelId: 'metal.rc.normalizedDelay',
    unit: 'τ/(ρ·ε₀)',
    sourceId: 'S205',
    validRange: NORMALIZED_DELAY_RANGE,
    assumptions: [
      'S205 Eq.(1)–(5)', 'τ = 0.89·R·C (분포 RC)', 'ε₀·ρ 를 분리한 무차원량',
      `치수 입력구간 하한: ${describeUiGuard(DIM_MIN_M)}`,
      `치수 입력구간 상한: ${describeUiGuard(DIM_MAX_M)}`,
      `길이 입력구간: ${describeUiGuard(LEN_MIN_M)} / ${describeUiGuard(LEN_MAX_M)}`,
      `출력구간 상한: ${describeUiGuard(NORM_DELAY_MAX)}`,
    ],
  });
}

/**
 * 🔴 **R172 — 이상 스케일링 계수.** X_ox = H = W = L_S = λ 를 넣으면 Eq.(5)가 Eq.(6)이 된다:
 *   τ = **3.56**·ρ·K_ox·ε₀·L²/λ².
 * 이 함수는 그 **3.56 을 계산해서** 돌려준다(0.89 × K_I × (1+1)). 대수 항등이므로 오차가 0이다.
 */
export function idealScalingCoefficient(): Quantity {
  return quantity(DISTRIBUTED_RC_FACTOR.value * FRINGE_KI.value * (1 + 1), {
    modelId: 'metal.rc.idealScalingCoefficient',
    unit: '',
    sourceId: 'S205',
    validRange: [0, NORM_DELAY_MAX.value],
    assumptions: [
      'X_ox = H = W = L_S = λ', 'S205 Eq.(6)',
      `출력구간 상한: ${describeUiGuard(NORM_DELAY_MAX)}`,
    ],
  });
}

/**
 * low-k 도입 효과 — 같은 형상에서 유전율만 바꿨을 때의 **지연 비율** τ_to/τ_from = K_to/K_from.
 * 형상·ρ·ε₀ 가 전부 약분된다.
 */
export function delayRatioByDielectric(args: { kFrom: number; kTo: number }): Quantity {
  assertWithin('kFrom', args.kFrom, K_RANGE, '');
  assertWithin('kTo', args.kTo, K_RANGE, '');
  return quantity(args.kTo / args.kFrom, {
    modelId: 'metal.rc.delayRatio',
    unit: '',
    sourceId: 'S208',
    validRange: [0, K_SIN_CAP.value],
    assumptions: ['형상 동일', 'ε₀·ρ 약분'],
  });
}
