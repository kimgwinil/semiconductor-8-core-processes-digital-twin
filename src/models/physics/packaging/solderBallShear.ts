import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * 솔더볼 전단 **시험조건** — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S249** = JEDEC **JESD22-B117B** §1 · §4.7 · Table 4.1 · Table 4.2.
 * 골든값 **R202**(저속·고속 전단속도 구분).
 *
 * 🔴 **M-27 — 이 파일은 합격/불합격을 판정하지 않는다.**
 *    S249 §1 이 "test method only; acceptance criteria and qualification requirements are not defined"
 *    라고 **명시**한다. 수치 합격기준의 소재지는 JESD47(후공정 원장 S9-2)이고 **미확보**다.
 *    합·부 판정 함수를 여기에 추가하면 M-27 위반이다.
 * 🔴 고속 관심사에 저속 시험을 **대체하지 않는다** — 표준이 오해를 낳는다고 명시했다(§4.7).
 */

/** S249 §4.7.1 Condition A — 저속 전단. */
const LOW_SPEED_MIN = withSource(0.1, 'mm/s', 'S249');
const LOW_SPEED_MAX = withSource(0.8, 'mm/s', 'S249');
/** S249 §4.7.2 Condition B — 고속 전단. */
const HIGH_SPEED_MIN = withSource(50, 'mm/s', 'S249');

export const LOW_SPEED_RANGE_MM_PER_S: [number, number] = [LOW_SPEED_MIN.value, LOW_SPEED_MAX.value];
export const HIGH_SPEED_THRESHOLD_MM_PER_S = HIGH_SPEED_MIN.value;

/**
 * 전단속도 구분. **표준이 규정한 두 구간과 그 사이·아래의 「미규정」 구간을 구분해 보여 준다** —
 * 미규정 구간을 저속·고속 중 하나로 몰아 넣으면 표준에 없는 판정을 만드는 것이다.
 */
export type ShearSpeedClass = 'below-low' | 'low' | 'between' | 'high';

const SHEAR_SPEED_CLASS_ORDER: readonly ShearSpeedClass[] = ['below-low', 'low', 'between', 'high'];

export function classifyShearSpeed(speedMmPerS: number): ShearSpeedClass {
  assertWithin('speedMmPerS', speedMmPerS, [0, Number.MAX_VALUE], 'mm/s');
  if (speedMmPerS < LOW_SPEED_MIN.value) return 'below-low';
  if (speedMmPerS <= LOW_SPEED_MAX.value) return 'low';
  if (speedMmPerS > HIGH_SPEED_MIN.value) return 'high';
  return 'between';
}

/** 구분을 순서 지수로. 화면 슬라이더·방향성 검사에서 「속도를 올리면 조건이 바뀐다」를 보이기 위한 것. */
export function shearSpeedClassIndex(speedMmPerS: number): Quantity {
  const cls = classifyShearSpeed(speedMmPerS);
  const idx = SHEAR_SPEED_CLASS_ORDER.indexOf(cls);
  return quantity(idx, {
    modelId: 'packaging.solderBallShear.speedClass',
    unit: '',
    sourceId: 'S249',
    validRange: [0, SHEAR_SPEED_CLASS_ORDER.length - 1],
    assumptions: [
      `저속(Condition A) ${LOW_SPEED_MIN.value}–${LOW_SPEED_MAX.value} mm/s · 고속(Condition B) > ${HIGH_SPEED_MIN.value} mm/s`,
      '두 구간 사이는 표준이 규정하지 않았다 — 「미규정」으로 표시한다',
    ],
  });
}

/**
 * S249 Table 4.2 — 파괴모드 분류. 설명문은 전재하지 않고 **분류 자체만** 요약해 적는다(D-015).
 */
export type FailureModeCode = '1A' | '1B' | '2A' | '2B' | '3' | '4A' | '4B';

export const FAILURE_MODES: ReadonlyArray<{ code: FailureModeCode; ko: string }> = [
  { code: '1A', ko: '연성 — 솔더 벌크 내 파단' },
  { code: '1B', ko: '준연성 — 연성이 우세한 혼합 파단' },
  { code: '2A', ko: '패드 리프트 — 패드가 볼과 함께 들림' },
  { code: '2B', ko: '패드 크레이터 — 들린 패드에 기재가 딸려 나옴' },
  { code: '3', ko: '비젖음 — 패드 상면 도금이 드러남' },
  { code: '4A', ko: '취성 — 솔더/금속간화합물 계면 파단' },
  { code: '4B', ko: '준취성 — 취성이 우세한 혼합 파단' },
];

/**
 * S249 Table 4.1 — **관심사 → 권장 전단속도 → 예상 파괴모드** 매핑.
 * 표준이 "general guidance" 로 제시한 것이며 **합격기준이 아니다**(M-27).
 */
export type ShearConcern =
  | 'bulk-solder-strength'
  | 'interfacial-pad-strength'
  | 'substrate-strength'
  | 'pad-contamination'
  | 'interfacial-solder-strength'
  | 'mechanical-shock';

export interface ConcernGuidance {
  concern: ShearConcern;
  ko: string;
  /** 권장 속도. 'low' | 'high' | 'either' */
  recommendedSpeed: 'low' | 'high' | 'either';
  failureModes: readonly string[];
}

const CONCERN_TABLE: readonly ConcernGuidance[] = [
  { concern: 'bulk-solder-strength', ko: '솔더 벌크 강도', recommendedSpeed: 'low', failureModes: ['1'] },
  { concern: 'interfacial-pad-strength', ko: '패드 계면 강도(패드 리프트)', recommendedSpeed: 'high', failureModes: ['2A'] },
  { concern: 'substrate-strength', ko: '기판 강도(패드 크레이터링)', recommendedSpeed: 'high', failureModes: ['2B'] },
  { concern: 'pad-contamination', ko: '패드 오염·비젖음', recommendedSpeed: 'either', failureModes: ['3', '4'] },
  { concern: 'interfacial-solder-strength', ko: '솔더 계면 강도(보이드·취성 파단)', recommendedSpeed: 'high', failureModes: ['4'] },
  { concern: 'mechanical-shock', ko: '기계적 충격 신뢰성', recommendedSpeed: 'high', failureModes: ['2', '4'] },
];

export const SHEAR_CONCERNS: readonly ShearConcern[] = CONCERN_TABLE.map((c) => c.concern);

/** 관심사에 대응하는 시험조건 안내. 표에 없는 관심사는 지어내지 않고 거부한다. */
export function guidanceFor(concern: ShearConcern): ConcernGuidance {
  const row = CONCERN_TABLE.find((c) => c.concern === concern);
  if (!row) {
    throw new Error(
      `[S249] Table 4.1 에 없는 관심사 "${concern}". 사용 가능: ${SHEAR_CONCERNS.join(', ')}.`,
    );
  }
  return row;
}

/** 🔴 합격기준이 없다는 사실 자체가 이 표준의 핵심 교육 내용이다. 화면에 그대로 띄운다. */
export const NO_ACCEPTANCE_CRITERIA_NOTICE =
  'JESD22-B117B 는 시험 방법만 규정한다. 합격기준·인증 요구사항은 정의하지 않는다(§1). ' +
  '수치 합격기준은 JESD47 소관이며 본 제품은 해당 표준을 확보하지 않았다.';

/** 리플로우 후 경과시간 권장 — S249 §4.12. 판정선이 아니라 시험 재현 조건이다. */
export const ELAPSED_AFTER_REFLOW = Object.freeze({
  minHours: withSource(1, 'h', 'S249'),
  snpbMaxHours: withSource(4, 'h', 'S249'),
  leadFreeMaxHours: withSource(24, 'h', 'S249'),
});
