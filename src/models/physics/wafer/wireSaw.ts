import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * 다이아몬드 와이어쏘 절삭 법선력 — **물리층. 합성 계수 0건.**
 *
 * 출처: Wang, Li, Liang, *Experiment Comparative Analysis of Feed Rate with Velocity Control
 * in Cutting Mono Crystalline Silicon Using a Diamond Wire Saw*, **Micromachines 2024, 15(4), 473**
 * = 원장 **S104**. **CC BY 4.0.**
 *
 * 정적 모델 식 (1):  F_n(t) = K_n · V_x(t)^α · V_s(t)^β
 *   V_x = 시편 이송속도 [mm/min], V_s = 와이어 속도 [m/s]
 *
 * 🔴 **식 (2) 는 「하나의 3파라미터 피팅」이 아니라 「두 개의 1변수 최소제곱 피팅」이다**(원장 R106).
 *   ① V_s = 1.5 m/s 고정 →  F_n = 3.253 · V_x^0.568
 *   ② V_x = 0.75 mm/min 고정 → F_n = 2.794 · V_s^(−0.455)
 *   두 피팅은 독립이라 **공통 조건(V_x=0.75, V_s=1.5)에서 서로 약 19 % 어긋난다**
 *   (① 2.763 N vs ② 2.323 N). 문헌이 그렇게 인쇄했으므로 **억지로 맞추지 않는다.**
 *   대신 어느 피팅을 쓰는지 함수로 분리하고, 어긋남 자체를 골든값으로 고정한다.
 */

/** 피팅 ① — V_s 고정. */
const FIT_FEED_K = withSource(3.253, 'N·(mm/min)^-α', 'S104');
const FIT_FEED_ALPHA = withSource(0.568, '', 'S104');
const FIT_FEED_FIXED_WIRE_SPEED = withSource(1.5, 'm/s', 'S104');

/** 피팅 ② — V_x 고정. */
const FIT_SPEED_K = withSource(2.794, 'N·(m/s)^-β', 'S104');
const FIT_SPEED_BETA = withSource(-0.455, '', 'S104');
const FIT_SPEED_FIXED_FEED = withSource(0.75, 'mm/min', 'S104');

export const WIRE_SAW_FEED_COEFFICIENTS = {
  k: FIT_FEED_K.value, alpha: FIT_FEED_ALPHA.value, fixedWireSpeedMPerS: FIT_FEED_FIXED_WIRE_SPEED.value,
};
export const WIRE_SAW_SPEED_COEFFICIENTS = {
  k: FIT_SPEED_K.value, beta: FIT_SPEED_BETA.value, fixedFeedMmPerMin: FIT_SPEED_FIXED_FEED.value,
};

/** 실험이 실제로 훑은 구간. §2.2.1: V_x 0.5 / 0.75 / 1.0 mm/min, V_s 1.0 / 1.5 / 2.0 m/s. */
const FEED_MIN = withSource(0.5, 'mm/min', 'S104');
const FEED_MAX = withSource(1.0, 'mm/min', 'S104');
const WIRE_SPEED_MIN = withSource(1.0, 'm/s', 'S104');
const WIRE_SPEED_MAX = withSource(2.0, 'm/s', 'S104');
export const FEED_RATE_RANGE_MM_PER_MIN: [number, number] = [FEED_MIN.value, FEED_MAX.value];
export const WIRE_SPEED_RANGE_M_PER_S: [number, number] = [WIRE_SPEED_MIN.value, WIRE_SPEED_MAX.value];

/** 측정계 상한 — ATI Gamma SI-32-2.5 다이나모미터 32 N. 이 위는 측정 자체가 없다. */
const DYNAMOMETER_RANGE_N = withSource(32, 'N', 'S104');

/** 절삭 조건(고정). 웨이퍼 소재·와이어 제원 — 화면 서술용. */
export const WIRE_SAW_CONDITIONS = {
  wireDiameterMm: withSource(0.24, 'mm', 'S104').value,
  abrasiveGrainMinUm: withSource(30, 'µm', 'S104').value,
  abrasiveGrainMaxUm: withSource(50, 'µm', 'S104').value,
  contactLengthMm: withSource(26, 'mm', 'S104').value,
  siliconDensityGPerCm3: withSource(2.33, 'g/cm³', 'S104').value,
};

/** 피팅 ① — 이송속도로 본 법선력. V_s = 1.5 m/s 조건에서만 유효하다. */
export function normalForceByFeedRate(feedMmPerMin: number): Quantity {
  assertWithin('feedMmPerMin', feedMmPerMin, FEED_RATE_RANGE_MM_PER_MIN, 'mm/min');
  const f = FIT_FEED_K.value * Math.pow(feedMmPerMin, FIT_FEED_ALPHA.value);
  return quantity(f, {
    modelId: 'wafer.wireSaw.normalForceByFeed',
    unit: 'N',
    sourceId: 'S104',
    validRange: [0, DYNAMOMETER_RANGE_N.value],
    assumptions: [
      `S104 식 (2) 피팅 ① — 와이어 속도 ${FIT_FEED_FIXED_WIRE_SPEED.value} m/s 고정 조건`,
      '🔴 피팅 ② 와 공통 조건에서 약 19 % 어긋난다. 두 피팅을 섞지 않는다',
    ],
  });
}

/** 피팅 ② — 와이어 속도로 본 법선력. V_x = 0.75 mm/min 조건에서만 유효하다. β < 0 이라 감소한다. */
export function normalForceByWireSpeed(wireSpeedMPerS: number): Quantity {
  assertWithin('wireSpeedMPerS', wireSpeedMPerS, WIRE_SPEED_RANGE_M_PER_S, 'm/s');
  const f = FIT_SPEED_K.value * Math.pow(wireSpeedMPerS, FIT_SPEED_BETA.value);
  return quantity(f, {
    modelId: 'wafer.wireSaw.normalForceByWireSpeed',
    unit: 'N',
    sourceId: 'S104',
    validRange: [0, DYNAMOMETER_RANGE_N.value],
    assumptions: [
      `S104 식 (2) 피팅 ② — 이송속도 ${FIT_SPEED_FIXED_FEED.value} mm/min 고정 조건`,
      'β < 0: 와이어가 빨라지면 재료제거가 분산돼 법선력이 줄어든다',
    ],
  });
}

/**
 * 🔴 **구현하지 않은 것** (원장 §4-2 가 금지한 항목)
 *  - M-4: 슬라이싱 MRR 식 · 랩핑·에칭 정량 모델 · 폴리싱 후 Ra 규격 → 파라미터 자체를 만들지 않았다
 *  - M-5: 커프 손실의 µm 실측값 → S109 는 비율(잉곳의 약 40 %)만 준다.
 *         **웨이퍼 수량 계산에 t_kerf 를 쓰지 않는다.** 비율만 상수로 내보낸다.
 *  - M-3: 폴리싱 Preston 계수 → 절대 MRR 계산 불가. 상대 비교(MRR ∝ P·v)만 가능
 */
export const KERF_LOSS_FRACTION = withSource(0.4, '', 'S109');
export const KERF_LOSS_NOTE =
  '커프 손실은 잉곳 대비 비율(약 40 %)로만 문헌에 있다. µm 단위 실측값은 미확보(M-5)이므로 '
  + '웨이퍼 장수 계산에 커프 두께를 쓰지 않는다.';

/** S105 실측 — 절삭 손상층(비정질) 깊이와 잔류응력. 정량 모델이 아니라 관측 범위다. */
export const SAW_DAMAGE_DEPTH_RANGE_NM: [number, number] = [
  withSource(6.6, 'nm', 'S105').value, withSource(22.7, 'nm', 'S105').value,
];
export const SAW_RESIDUAL_STRESS_COMPRESSIVE_MPA: [number, number] = [
  withSource(85, 'MPa', 'S105').value, withSource(179, 'MPa', 'S105').value,
];
