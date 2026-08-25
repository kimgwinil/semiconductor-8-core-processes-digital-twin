import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * 패키지 열저항 θ_JA — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S247** = JEDEC **JESD51-2A**(자연대류 θ_JA) · **JESD51-7**(시험 PCB).
 * 골든값 **R200**(정의식) · **R201**(측정 전력 선정표).
 *
 * 🔴 **M-26 — `T_J ≤ 105 °C` 를 「표준값」으로 표기하지 않는다.**
 *    JESD51 계열은 θ_JA 의 **측정 방법**만 규정하고 **최대 접합온도를 정하지 않는다.**
 *    이 파일은 T_J 를 **계산**만 하고, 상한은 호출자(문항·데이터시트)가 조건으로 준다.
 * 🔴 θ_JA 는 **자연대류 한정**이다(S247 JESD51-2A §1·§4). 강제대류에 θ_JA 를 쓰면 표준 위반이다.
 *    → 강제대류는 **θ_JMA** 이고 근거는 **S255(JESD51-6)** 다. 2026-08-20 입수·등재됐다.
 *       구현은 `packaging/windTunnel.ts` 에 있고, 지표명·출처 배지가 v=0/v>0 에서 전환된다.
 *    🔴 **여전히 없는 것:** 풍속 → 열저항을 **예측하는 식**. S255 는 θ_JMA 를 식(1) 측정 결과로만 정의한다.
 *       그래서 θ_JMA 는 **측정 입력**으로 받고 v 는 **규격 적합성 판정**에만 쓴다. 지어내지 않는다.
 * 🔴 θ_JA 는 패키지 간 열성능 **비교용** 지표이지 실제 시스템의 접합온도 예측값이 아니다(동 §1).
 */

/** 0 초과의 실수만 허용한다. 문헌 상한이 없는 양에 쓴다 — 숫자 리터럴을 만들지 않기 위해 Number 상수를 쓴다. */
const POSITIVE_RANGE: [number, number] = [Number.MIN_VALUE, Number.MAX_VALUE];

/** 계산 결과가 가질 수 있는 물리적 범위(정지공기 패키지). 유한성 확인용이며 판정선이 아니다. */
const THETA_RANGE: [number, number] = [0, Number.MAX_VALUE];
const TEMPERATURE_RANGE_C: [number, number] = [-Number.MAX_VALUE, Number.MAX_VALUE];

/**
 * S247 JESD51-2A 식 (1): θ_JA = (T_J − T_A)/P_H  [°C/W]
 * @param tJunctionC 접합온도 [°C] · @param tAmbientC 주위온도 [°C] · @param powerW 가열전력 P_H [W]
 */
export function thermalResistanceJA(args: {
  tJunctionC: number; tAmbientC: number; powerW: number;
}): Quantity {
  assertWithin('powerW', args.powerW, POSITIVE_RANGE, 'W');
  assertWithin('tJunctionC', args.tJunctionC, TEMPERATURE_RANGE_C, '°C');
  assertWithin('tAmbientC', args.tAmbientC, TEMPERATURE_RANGE_C, '°C');
  const v = (args.tJunctionC - args.tAmbientC) / args.powerW;
  return quantity(v, {
    modelId: 'packaging.thermal.thetaJA',
    unit: '°C/W',
    sourceId: 'S247',
    validRange: THETA_RANGE,
    assumptions: [
      '자연대류(정지공기) 한정 — 강제대류에는 적용하지 않는다',
      '패키지 간 열성능 비교 지표. 시스템 접합온도 예측값이 아니다',
      'JESD51-7 규정 2s2p 시험 PCB 조건',
    ],
  });
}

/**
 * 같은 식 (1) 의 역산: T_J = T_A + θ_JA · P.
 * 🔴 상한 판정은 하지 않는다(M-26). 값만 돌려준다.
 */
export function junctionTemperature(args: {
  tAmbientC: number; thetaJA: number; powerW: number;
}): Quantity {
  assertWithin('thetaJA', args.thetaJA, THETA_RANGE, '°C/W');
  assertWithin('powerW', args.powerW, POSITIVE_RANGE, 'W');
  assertWithin('tAmbientC', args.tAmbientC, TEMPERATURE_RANGE_C, '°C');
  const v = args.tAmbientC + args.thetaJA * args.powerW;
  return quantity(v, {
    modelId: 'packaging.thermal.junctionTemp',
    unit: '°C',
    sourceId: 'S247',
    validRange: TEMPERATURE_RANGE_C,
    assumptions: [
      '자연대류(정지공기) 한정',
      '🔴 접합온도 상한은 표준값이 아니다 — 소자 데이터시트가 정한다(M-26)',
    ],
  });
}

/**
 * S247 JESD51-2A §5.5 Table 2 — **권장 측정 전력 선정표**(골든값 R201).
 * 표준은 엄격부등호(θ_JA > 100 / 60 < θ_JA < 100 / …)로 써서 **경계값 100·60·30·20 이
 * 어느 구간에도 속하지 않는다.** 화면이 멈추지 않도록 경계는 **낮은 전력 쪽(보수적)** 으로 귀속시킨다.
 * 🔴 이것은 값을 만든 것이 아니라 **경계 처리 규칙**이다. 표의 수치는 하나도 바꾸지 않았다.
 */
interface PowerBand {
  /** 이 밴드가 적용되는 θ_JA 의 하한(포함). */
  readonly thetaMin: SourcedConst;
  readonly powerW: SourcedConst;
}

const POWER_BANDS: readonly PowerBand[] = [
  { thetaMin: withSource(100, '°C/W', 'S247'), powerW: withSource(0.5, 'W', 'S247') },
  { thetaMin: withSource(60, '°C/W', 'S247'), powerW: withSource(0.75, 'W', 'S247') },
  { thetaMin: withSource(30, '°C/W', 'S247'), powerW: withSource(1, 'W', 'S247') },
  { thetaMin: withSource(20, '°C/W', 'S247'), powerW: withSource(2, 'W', 'S247') },
  { thetaMin: withSource(15, '°C/W', 'S247'), powerW: withSource(3, 'W', 'S247') },
];

/** 표의 최저 경계. 이보다 낮은 θ_JA 는 표준이 "etc" 로 남겨 두었다 — 보간하지 않고 거부한다. */
const THETA_TABLE_MIN = withSource(15, '°C/W', 'S247');
export const THETA_TABLE_RANGE: [number, number] = [THETA_TABLE_MIN.value, Number.MAX_VALUE];

/** 최소 권장 접합온도 상승폭 20 °C · 통상 30~60 °C (S247 JESD51-2A §5.5). 판정선이 아니라 시험 설계 지침이다. */
export const MIN_RECOMMENDED_RISE_C = withSource(20, '°C', 'S247');
export const TYPICAL_RISE_MIN_C = withSource(30, '°C', 'S247');
export const TYPICAL_RISE_MAX_C = withSource(60, '°C', 'S247');

/** 목표 θ_JA 구간에 대응하는 권장 측정 전력 [W]. R201. */
export function recommendedTestPowerW(thetaJA: number): Quantity {
  assertWithin('thetaJA', thetaJA, THETA_TABLE_RANGE, '°C/W');
  let picked = POWER_BANDS[POWER_BANDS.length - 1] as PowerBand;
  for (const band of POWER_BANDS) {
    if (thetaJA >= band.thetaMin.value) {
      picked = band;
      break;
    }
  }
  return quantity(picked.powerW.value, {
    modelId: 'packaging.thermal.recommendedPower',
    unit: 'W',
    sourceId: 'S247',
    validRange: [POWER_BANDS[0]?.powerW.value ?? 0, POWER_BANDS[POWER_BANDS.length - 1]?.powerW.value ?? 0],
    assumptions: ['경계값(100·60·30·20)은 낮은 전력 쪽으로 귀속시킨다 — 표준은 엄격부등호로 정의한다'],
  });
}

/**
 * S247 JESD51-7 §4 — θ_JA 시험 PCB(2s2p) 규격. 값을 계산에 쓰지는 않지만
 * **측정 조건을 화면에 그대로 보여 주기 위해** 물리층이 문헌값으로 보유한다.
 */
export const TEST_BOARD = Object.freeze({
  material: 'FR-4',
  finishedThicknessMm: withSource(1.6, 'mm', 'S247'),
  thicknessTolerancePct: withSource(10, '%', 'S247'),
  /** 패키지 본체 27 mm 미만 */
  smallBodyWidthMm: withSource(76.2, 'mm', 'S247'),
  /** 패키지 본체 27 mm 이상 */
  largeBodyWidthMm: withSource(101.6, 'mm', 'S247'),
  lengthMm: withSource(114.3, 'mm', 'S247'),
  dimensionToleranceMm: withSource(0.25, 'mm', 'S247'),
  bodySizeSplitMm: withSource(27, 'mm', 'S247'),
  /** 상·하 트레이스층 2 oz = 0.070 mm */
  traceCopperThicknessMm: withSource(0.07, 'mm', 'S247'),
  convection: '자연대류(정지공기)',
});

/** 본체 크기에 따른 시험 PCB 폭 [mm]. S247 JESD51-7 §4. */
export function testBoardWidthMm(packageBodySizeMm: number): Quantity {
  assertWithin('packageBodySizeMm', packageBodySizeMm, POSITIVE_RANGE, 'mm');
  const v = packageBodySizeMm >= TEST_BOARD.bodySizeSplitMm.value
    ? TEST_BOARD.largeBodyWidthMm.value
    : TEST_BOARD.smallBodyWidthMm.value;
  return quantity(v, {
    modelId: 'packaging.thermal.testBoardWidth',
    unit: 'mm',
    sourceId: 'S247',
    validRange: [TEST_BOARD.smallBodyWidthMm.value, TEST_BOARD.largeBodyWidthMm.value],
  });
}
