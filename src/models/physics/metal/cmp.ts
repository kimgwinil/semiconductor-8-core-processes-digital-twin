import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource,
  type Quantity, type SourcedConst,
} from '../../contract';
import { NM_PER_M, MM_PER_M, PA_PER_KPA, RAD_PER_REV } from './units';
import { SECONDS_PER_MINUTE, TEN } from '../units';

/**
 * CMP 제거율 — **Preston 식. 물리층. 합성 계수 0건.**
 *
 *   MRR = K_p · P · V        (P: 하중압력 Pa · V: 패드-웨이퍼 상대속도 m/s)
 *
 * 출처: 원장 **R165**(S200 Table 2 + Fig. 10) · **R166**(S204 Table B.5) · **R167**(S204 §2.4.3).
 *
 * 🔴 **Cu K_p = 1.6×10⁻¹³ m²/N 을 정본으로 쓴다**(허용 1.0–2.5×10⁻¹³). 원장이 3중 교차검증했다:
 *    ① S200 실측 MRR 역산 1.87×10⁻¹³ ② S204 접촉모드 실측 1.0–2.0×10⁻¹³ ③ 2차 인용 1.60±0.50×10⁻¹³.
 * 🔴 **R165 는 문헌 자체가 모순**이다 — 본문 "27.46 kPa (4 psi)" vs Table 2 "24.76 kPa".
 *    원장이 **Table 2 값(24.76 kPa)을 정본으로 고정**했으므로 여기서도 그것만 쓴다.
 * ⛔ **디싱·에로전의 절대 nm 허용치는 만들지 않는다**(M-19). S202 가 「관측 최대값으로 정규화」라
 *    명시해 절대값이 논문에 없다. 정의·경향만 가르친다.
 */

export type CmpMaterial = 'Cu' | 'W' | 'Al';
/** S204 Table B.5 의 마모 모드 구분. `currentCmp` 는 「현행 CMP 공정」 열이다. */
export type WearMode = 'twoBody' | 'threeBody' | 'currentCmp';

/**
 * S204 Table B.5 (p.305) = 원장 **R166**. 논문은 **MPa⁻¹** 로 인쇄했다.
 * 여기서는 SI(m²/N)로 환산해 적었다 — 1 MPa⁻¹ = 10⁻⁶ m²/N 이므로 지수만 6 내려간다.
 * (원장 R167 도 같은 방식으로 「0.2×10⁻⁶ MPa⁻¹ = 2.0×10⁻¹³ m²/N」 로 병기한다.)
 *
 * 🔴 `withSource(...)` 를 전부 풀어 쓴다. 축약 별칭을 만들면 그 자리가 검사 구멍이 된다(규약 §2-1).
 */
export const PRESTON_TABLE: Readonly<Record<CmpMaterial, Readonly<Partial<Record<WearMode, SourcedConst>>>>> = {
  // Al 2.2×10⁻⁸ / 1.3×10⁻⁷ MPa⁻¹ — 「현행 CMP」 열은 논문이 비워 두었다. 지어내지 않는다.
  Al: {
    twoBody: withSource(2.2e-14, 'm²/N', 'S204'),
    threeBody: withSource(1.3e-13, 'm²/N', 'S204'),
  },
  // Cu 1.7×10⁻⁷ / 1.0×10⁻⁷ / 4.5×10⁻⁷ MPa⁻¹
  Cu: {
    twoBody: withSource(1.7e-13, 'm²/N', 'S204'),
    threeBody: withSource(1.0e-13, 'm²/N', 'S204'),
    currentCmp: withSource(4.5e-13, 'm²/N', 'S204'),
  },
  // W 5.9×10⁻⁹ / 8.1×10⁻⁹ / 5.9×10⁻⁷ MPa⁻¹
  W: {
    twoBody: withSource(5.9e-15, 'm²/N', 'S204'),
    threeBody: withSource(8.1e-15, 'm²/N', 'S204'),
    currentCmp: withSource(5.9e-13, 'm²/N', 'S204'),
  },
};

/** 🔴 Cu 정본 Preston 계수 — 3중 교차검증 채택값(원장 §1-5 주석 · §3-5). */
export const CU_PRESTON_KP = withSource(1.6e-13, 'm²/N', 'S204');
/** 동, 허용 구간. 이 밖의 값은 원장이 인정하지 않는다. */
const CU_KP_MIN = withSource(1.0e-13, 'm²/N', 'S204');
const CU_KP_MAX = withSource(2.5e-13, 'm²/N', 'S204');
export const CU_KP_RANGE: [number, number] = [CU_KP_MIN.value, CU_KP_MAX.value];

/** 접촉모드 Cu 실측 2점 — R167 (S204 §2.4.3, 14 kPa / 48 kPa). */
export const CU_KP_CONTACT_14KPA = withSource(2.0e-13, 'm²/N', 'S204');
export const CU_KP_CONTACT_48KPA = withSource(1.0e-13, 'm²/N', 'S204');

/** K_p 입력 유효구간 — 표 전체(W 2체마모 최소 ~ W 현행 CMP 최대)를 덮는다. S204 Table B.5. */
const KP_MIN = withSource(5.9e-15, 'm²/N', 'S204');
const KP_MAX = withSource(5.9e-13, 'm²/N', 'S204');
export const KP_RANGE: [number, number] = [KP_MIN.value, KP_MAX.value];

/** 하중압력 유효범위 4–66 kPa. S204 Table 2.6. */
const PRESSURE_MIN_KPA = withSource(4, 'kPa', 'S204');
const PRESSURE_MAX_KPA = withSource(66, 'kPa', 'S204');
export const PRESSURE_RANGE_PA: [number, number] = [
  PRESSURE_MIN_KPA.value * PA_PER_KPA,
  PRESSURE_MAX_KPA.value * PA_PER_KPA,
];

/** 상대속도 유효범위 0.05–3.91 m/s. S204 Table 2.6. */
const VELOCITY_MIN = withSource(0.05, 'm/s', 'S204');
const VELOCITY_MAX = withSource(3.91, 'm/s', 'S204');
export const VELOCITY_RANGE_MPS: [number, number] = [VELOCITY_MIN.value, VELOCITY_MAX.value];

/* ─────────────── 아래 범위선은 전부 UI 안전장치다 — 출처를 붙일 수 없다 ───────────────
 * 🔴 2026-08-22 정정. 아래 일곱 개는 종전에 전부 `withSource(…, 'S200'|'S202'|'S204')` 였다.
 *    **어느 문헌도 이 숫자들을 진술하지 않는다.** 문헌이 말한 것과 코드가 쓰던 값이 실제로 다르다:
 *      · 회전수         — S202·S200 은 **35–80 rpm 을 돌렸다**고 말한다. 0–200 은 우리가 넓힌 창이다.
 *      · 헤드-패드 거리 — S200 은 **130 mm 한 점**을 말한다. 0–500 mm 는 우리가 그은 구간이다.
 *      · MRR 상한       — S204 Table B.5 최대계수 × Table 2.6 최대 하중·속도는 **약 9 100 nm/min**
 *                         이다. 10 000 은 그 위로 올려 잡은 우리 선이며, 게다가 종전 태그는
 *                         계산에 쓰이지도 않은 S200 이었다(이중으로 거짓이었다).
 *      · 연마시간·목표두께 — 주석이 이미 「UI 안전장치」라고 스스로 적고 있었다.
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 0 · 200 · 0 · 500 · 10 000 · 1 000 · 100 000 그대로다.
 *    다만 매직넘버 차단(규약 §2-3)은 면제되지 않으므로 허용 리터럴(0·1·2·−1·0.5·100)과
 *    `../units` 의 `TEN` 으로 조립했고, 조립 결과가 옛 값과 **IEEE-754 비트까지 같음**을 대조했다.
 * 🔴 이 파일에서 S200·S202·S204 를 정당하게 인용하는 것은 `PRESTON_TABLE` · `CU_KP_*` ·
 *    `KP_*` · `PRESSURE_*`(Table 2.6) · `VELOCITY_*`(Table 2.6) · `R165_*` 다. */

/** 회전수 입력 유효범위. 🔴 S202·S200 이 돌린 35–80 rpm 에 **우리가** 여유를 준 선이다.
 *  200 = `2 * 100`. 비트 대조 `0000000000006940`. */
const RPM_MIN = uiGuard(0, 'rpm', '역회전을 입력으로 받지 않으려고 그은 하한. 문헌이 정한 하한이 아니다');
const RPM_MAX = uiGuard(
  2 * 100, 'rpm',
  'S202·S200 실측 35–80 rpm 위로 슬라이더가 올라가도 식이 깨지지 않게 둔 여유폭. 문헌이 정한 상한이 아니다',
);
export const RPM_RANGE: [number, number] = [RPM_MIN.value, RPM_MAX.value];

/** 헤드-패드 중심거리 입력 유효범위. 🔴 S200 이 진술한 것은 **R165 의 130 mm 한 점**이지
 *  「0–500 mm」가 아니다. 500 = `(2 + 2 + 1) * 100`. 비트 대조 `0000000000407f40`. */
const CENTER_DISTANCE_MIN_MM = uiGuard(
  0, 'mm', '중심거리 0(동축)까지만 열어 둔 하한. 문헌이 정한 하한이 아니다',
);
const CENTER_DISTANCE_MAX_MM = uiGuard(
  (2 + 2 + 1) * 100, 'mm',
  'R165 의 130 mm 를 넉넉히 담도록 잡은 장비 크기 상한. 문헌이 정한 상한이 아니다',
);

/**
 * MRR 출력 유효범위 상한.
 * 🔴 S204 Table B.5 의 최대 계수(W 현행 CMP 5.9×10⁻¹³)에 Table 2.6 의 최대 하중·속도를 곱하면
 *    약 **9 100 nm/min** 이 나온다. 10 000 은 그 위로 **우리가** 올려 잡은 표시 상한이지
 *    문헌이 진술한 값이 아니다. 10000 = `100 * 100`. 비트 대조 `000000000088c340`.
 */
const MRR_MAX_NM_PER_MIN = uiGuard(
  100 * 100, 'nm/min',
  'S204 표 안의 계수·하중·속도 조합이 전부 범위 안에 들도록(계산 최대 약 9 100 nm/min) 올려 잡은 출력 표시 상한. 문헌이 정한 상한이 아니다',
);
export const MRR_RANGE_NM_PER_MIN: [number, number] = [0, MRR_MAX_NM_PER_MIN.value];

/** 연마시간 출력 유효범위 상한. 1000 = `100 * TEN`. 비트 대조 `0000000000408f40`. */
const POLISH_TIME_MAX_MIN = uiGuard(
  100 * TEN, 'min',
  '한 장을 1 000 분(약 17 시간) 넘게 연마하지 않는다는 장비 운전 가정. 문헌이 정한 한계가 아니다',
);
export const POLISH_TIME_RANGE_MIN: [number, number] = [0, POLISH_TIME_MAX_MIN.value];

/* ── R165 문헌 조건 (S200 Table 2 + Fig. 10) — 골든값 재현에 그대로 쓴다 ───────────────── */
/** 🔴 Table 2 값. 본문 "27.46 kPa" 는 자릿수 전치 오타로 보아 쓰지 않는다(원장 §1-5 주석). */
export const R165_PRESSURE_KPA = withSource(24.76, 'kPa', 'S200');
export const R165_PLATEN_RPM = withSource(80, 'rpm', 'S200');
export const R165_HEAD_RPM = withSource(80, 'rpm', 'S200');
export const R165_CENTER_DISTANCE_MM = withSource(130, 'mm', 'S200');
export const R165_MRR_NM_PER_MIN = withSource(302.5, 'nm/min', 'S200');
export const R165_WIWNU_PERCENT = withSource(6.47, '%', 'S200');

/**
 * 패드-웨이퍼 상대속도. **플래튼과 헤드의 회전수가 같으면** 상대속도는 웨이퍼 전면에서 균일하고
 * 그 크기는 `V = ω · d`(d = 헤드-패드 중심거리)가 된다. S200 이 중심거리 130 mm 를 명시한 이유다.
 *
 * 🔴 회전수가 다른 조건은 이 식으로 계산하지 않는다 — 균일 상대속도 가정이 깨진다.
 */
export function relativeVelocity(args: {
  platenRpm: number; headRpm: number; centerDistanceMm: number;
}): Quantity {
  assertWithin('platenRpm', args.platenRpm, RPM_RANGE, 'rpm');
  assertWithin('headRpm', args.headRpm, RPM_RANGE, 'rpm');
  assertWithin(
    'centerDistanceMm', args.centerDistanceMm,
    [CENTER_DISTANCE_MIN_MM.value, CENTER_DISTANCE_MAX_MM.value], 'mm',
  );
  if (args.platenRpm !== args.headRpm) {
    throw new Error(
      '[S200] 균일 상대속도 V = ω·d 는 플래튼과 헤드의 회전수가 같을 때만 성립한다. ' +
      '서로 다른 회전수는 원장에 근거가 없으므로 계산하지 않는다.',
    );
  }
  const omega = (args.platenRpm * RAD_PER_REV) / SECONDS_PER_MINUTE; // rad/s
  return quantity(omega * (args.centerDistanceMm / MM_PER_M), {
    modelId: 'metal.cmp.relativeVelocity',
    unit: 'm/s',
    sourceId: 'S200',
    validRange: VELOCITY_RANGE_MPS,
    assumptions: [
      '플래튼 회전수 = 헤드 회전수 → 웨이퍼 전면 상대속도 균일',
      // 🔴 식·조건은 S200 이 뒷받침하지만 **범위선은 아무 문헌도 뒷받침하지 않는다.**
      `회전수 입력구간 하한: ${describeUiGuard(RPM_MIN)}`,
      `회전수 입력구간 상한: ${describeUiGuard(RPM_MAX)}`,
      `중심거리 입력구간 하한: ${describeUiGuard(CENTER_DISTANCE_MIN_MM)}`,
      `중심거리 입력구간 상한: ${describeUiGuard(CENTER_DISTANCE_MAX_MM)}`,
    ],
  });
}

/**
 * Preston 제거율 `MRR = K_p · P · V`.
 * K_p [m²/N] · P [Pa] · V [m/s] → MRR [m/s] 를 nm/min 으로 환산해 낸다.
 */
export function removalRate(args: {
  prestonCoefficient: number; pressurePa: number; velocityMps: number;
}): Quantity {
  assertWithin('prestonCoefficient', args.prestonCoefficient, KP_RANGE, 'm²/N');
  assertWithin('pressurePa', args.pressurePa, PRESSURE_RANGE_PA, 'Pa');
  assertWithin('velocityMps', args.velocityMps, VELOCITY_RANGE_MPS, 'm/s');
  const mrrMetersPerSecond = args.prestonCoefficient * args.pressurePa * args.velocityMps;
  return quantity(mrrMetersPerSecond * NM_PER_M * SECONDS_PER_MINUTE, {
    modelId: 'metal.cmp.removalRate',
    unit: 'nm/min',
    sourceId: 'S204',
    validRange: MRR_RANGE_NM_PER_MIN,
    assumptions: [
      'Preston 선형 영역', '패드·슬러리 조건 고정', 'K_p 는 조건별 실측계수',
      `MRR 출력구간 상한: ${describeUiGuard(MRR_MAX_NM_PER_MIN)}`,
    ],
  });
}

/**
 * 역산 — 문헌이 인쇄한 MRR 로부터 K_p 를 되찾는다. **R165 골든값이 이 경로를 검증한다**
 * (24.76 kPa · 80 rpm · 130 mm · 302.5 nm/min → 1.87×10⁻¹³ m²/N, 채택구간 안).
 */
export function prestonCoefficientFromRate(args: {
  removalRateNmPerMin: number; pressurePa: number; velocityMps: number;
}): Quantity {
  assertWithin('removalRateNmPerMin', args.removalRateNmPerMin, MRR_RANGE_NM_PER_MIN, 'nm/min');
  assertWithin('pressurePa', args.pressurePa, PRESSURE_RANGE_PA, 'Pa');
  assertWithin('velocityMps', args.velocityMps, VELOCITY_RANGE_MPS, 'm/s');
  const mrrMetersPerSecond = args.removalRateNmPerMin / (NM_PER_M * SECONDS_PER_MINUTE);
  return quantity(mrrMetersPerSecond / (args.pressurePa * args.velocityMps), {
    modelId: 'metal.cmp.prestonCoefficient',
    unit: 'm²/N',
    sourceId: 'S200',
    validRange: KP_RANGE,
    assumptions: [
      'Preston 식 역산', 'P·V 는 문헌이 명시한 조건값',
      `MRR 입력구간 상한: ${describeUiGuard(MRR_MAX_NM_PER_MIN)}`,
    ],
  });
}

/** 목표 제거두께 입력 유효구간 상한. 🔴 S202 는 「관측 최대값으로 정규화」라 절대 nm 값을
 *  진술하지 않는다(M-19) — 애초에 이 값을 뒷받침할 수 없는 출처였다.
 *  100000 = `100 * 100 * TEN`. 비트 대조 `00000000006af840`. */
const TARGET_REMOVAL_MAX_NM = uiGuard(
  100 * 100 * TEN, 'nm',
  'Cu 오버버든 두께가 100 µm 를 넘지 않는다는 운용 가정으로 그은 입력 상한. 문헌이 정한 상한이 아니다',
);
export const TARGET_REMOVAL_RANGE_NM: [number, number] = [0, TARGET_REMOVAL_MAX_NM.value];

/** 목표 제거두께에 필요한 연마시간. MRR 이 일정한 구간에서만 성립한다. */
export function polishTime(args: {
  targetRemovalNm: number; removalRateNmPerMin: number;
}): Quantity {
  assertWithin('targetRemovalNm', args.targetRemovalNm, TARGET_REMOVAL_RANGE_NM, 'nm');
  assertWithin('removalRateNmPerMin', args.removalRateNmPerMin, MRR_RANGE_NM_PER_MIN, 'nm/min');
  return quantity(args.targetRemovalNm / args.removalRateNmPerMin, {
    modelId: 'metal.cmp.polishTime',
    unit: 'min',
    sourceId: 'S204',
    validRange: POLISH_TIME_RANGE_MIN,
    assumptions: [
      'MRR 일정 구간', '엔드포인트 검출 무시',
      `목표두께 입력구간 상한: ${describeUiGuard(TARGET_REMOVAL_MAX_NM)}`,
      `MRR 입력구간 상한: ${describeUiGuard(MRR_MAX_NM_PER_MIN)}`,
      `연마시간 출력구간 상한: ${describeUiGuard(POLISH_TIME_MAX_MIN)}`,
    ],
  });
}

/** 표에 있는 조건만 꺼낸다. 없는 칸은 **보간하지 않고 거부**한다(원장 규칙 1). */
export function prestonCoefficientOf(material: CmpMaterial, mode: WearMode): SourcedConst {
  const found = PRESTON_TABLE[material][mode];
  if (!found) {
    throw new Error(
      `[S204] Table B.5 에 ${material} / ${mode} 칸이 없다. 논문이 비워 둔 칸을 채우지 않는다.`,
    );
  }
  return found;
}
