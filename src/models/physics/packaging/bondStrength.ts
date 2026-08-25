import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * 접합 강도 요구치 — **물리층. 합성 계수 0건.**
 *  - 다이 전단 : 후공정 원장 **S43** = MIL-STD-883K CHG-3 **METHOD 2019.10** FIGURE 2019-4 NOTES (골든 **R1·R2·R3**)
 *  - 와이어 풀 : 후공정 원장 **S42** = 동 문서 **METHOD 2011.10** TABLE I (골든 **R4·R5**)
 *  - 볼본드 전단 면적 : 후공정 원장 **S53** = JEDEC **JESD22-B116B** §4.3 (골든 **R17**)
 *
 * 🔴 **볼본드 전단은 면적만 계산한다.** 수치 합격기준은 B116B 가 JESD47 로 이관했고 JESD47 은 미확보다.
 */

const POSITIVE_RANGE: [number, number] = [Number.MIN_VALUE, Number.MAX_VALUE];

// ────────────────────────────── 다이 전단 (S43) ──────────────────────────────

/** FIGURE 2019-4 가 면적을 세는 단위. 10⁻⁴ in². */
const AREA_UNIT = withSource(1e-4, 'in²', 'S43');
export const DIE_AREA_UNIT_IN2 = AREA_UNIT.value;

/** 구간 경계 — 표준이 NOTES 에서 나눈 3구간. 단위는 10⁻⁴ in². */
const SMALL_AREA_LIMIT = withSource(5, '10⁻⁴ in²', 'S43');
const LARGE_AREA_LIMIT = withSource(64, '10⁻⁴ in²', 'S43');

export type DieShearCondition = '1.0X' | '1.25X' | '2.0X';

interface DieShearConditionSpec {
  /** 비례 구간의 기울기 — 10⁻⁴ in² 당 kg. */
  readonly perUnitAreaKg: SourcedConst;
  /** 소면적 구간(< 5×10⁻⁴ in²)의 절대 하한. 표준이 1.25X 에 대해서는 적지 않았다. */
  readonly smallAreaFloorKg?: SourcedConst;
  /** 대면적 구간(> 64×10⁻⁴ in²)의 고정 요구치. 표준이 1.25X 에 대해서는 적지 않았다. */
  readonly largeAreaPlateauKg?: SourcedConst;
}

const DIE_SHEAR_CONDITIONS: Record<DieShearCondition, DieShearConditionSpec> = {
  '1.0X': {
    perUnitAreaKg: withSource(0.04, 'kg', 'S43'),
    smallAreaFloorKg: withSource(0.04, 'kg', 'S43'),
    largeAreaPlateauKg: withSource(2.5, 'kg', 'S43'),
  },
  '1.25X': {
    perUnitAreaKg: withSource(0.05, 'kg', 'S43'),
  },
  '2.0X': {
    perUnitAreaKg: withSource(0.08, 'kg', 'S43'),
    smallAreaFloorKg: withSource(0.08, 'kg', 'S43'),
    largeAreaPlateauKg: withSource(5, 'kg', 'S43'),
  },
};

export const DIE_SHEAR_CONDITION_LIST: readonly DieShearCondition[] = ['1.0X', '1.25X', '2.0X'];

/** 다이 면적을 표준의 세는 단위(10⁻⁴ in²)로 환산한 값. */
export function dieAreaUnits(areaIn2: number): number {
  return areaIn2 / AREA_UNIT.value;
}

const SHEAR_FORCE_RANGE_KG: [number, number] = [0, Number.MAX_VALUE];

/**
 * 최소 다이 전단 요구치 [kg]. S43 FIGURE 2019-4 NOTES 1~3 의 3구간 분기.
 *  - a < 5      : 비례식과 절대 하한 중 **큰 쪽**
 *  - 5 ≤ a ≤ 64 : 비례식 (기울기 = 조건별 kg / 10⁻⁴ in²)
 *  - a > 64     : 고정값
 * (a = 면적 ÷ 10⁻⁴ in²)
 */
export function dieShearRequirementKg(args: {
  areaIn2: number; condition: DieShearCondition;
}): Quantity {
  assertWithin('areaIn2', args.areaIn2, POSITIVE_RANGE, 'in²');
  const spec = DIE_SHEAR_CONDITIONS[args.condition];
  if (!spec) {
    throw new Error(`[S43] 알 수 없는 시험조건 "${args.condition}". 사용 가능: ${DIE_SHEAR_CONDITION_LIST.join(', ')}.`);
  }
  const a = dieAreaUnits(args.areaIn2);
  const proportional = spec.perUnitAreaKg.value * a;
  const assumptions: string[] = [`면적 ${a.toPrecision(4)} × 10⁻⁴ in²`, `시험조건 ${args.condition}`];

  let v: number;
  if (a > LARGE_AREA_LIMIT.value) {
    if (!spec.largeAreaPlateauKg) {
      throw new Error(
        `[S43] NOTE 1(면적 > ${LARGE_AREA_LIMIT.value}×10⁻⁴ in²)의 고정 요구치가 조건 ${args.condition} 에 대해 ` +
        '원장에 없다. 1.0X·2.0X 만 확보돼 있다 — 보간하지 않는다.',
      );
    }
    v = spec.largeAreaPlateauKg.value;
    assumptions.push(`대면적 구간 — 요구치가 ${v} kg 로 고정된다(NOTE 1)`);
  } else if (a < SMALL_AREA_LIMIT.value && spec.smallAreaFloorKg) {
    v = Math.max(proportional, spec.smallAreaFloorKg.value);
    assumptions.push(`소면적 구간 — 비례값과 절대 하한 ${spec.smallAreaFloorKg.value} kg 중 큰 쪽`);
  } else {
    v = proportional;
    if (a < SMALL_AREA_LIMIT.value) {
      assumptions.push('소면적 구간이나 조건 1.25X 의 절대 하한은 원장에 없어 비례값만 적용한다');
    }
  }

  return quantity(v, {
    modelId: 'packaging.dieShear.requirement',
    unit: 'kg',
    sourceId: 'S43',
    validRange: SHEAR_FORCE_RANGE_KG,
    assumptions,
  });
}

// ────────────────────────────── 와이어 풀 (S42) ──────────────────────────────

export type WireMaterial = 'AU' | 'AL';
export type SealStage = 'pre-seal' | 'post-seal';

interface WirePullRow {
  readonly material: WireMaterial;
  readonly diameterIn: SourcedConst;
  readonly stage: SealStage;
  readonly minStrengthGf: SourcedConst;
}

/**
 * S42 TABLE I 중 **원장이 수치를 명시한 행만** 옮겼다.
 * 🔴 표의 나머지 칸은 원장에 값이 없다 — 지어내지 않고 조회 시 거부한다(원장 규칙 1).
 */
const WIRE_PULL_TABLE: readonly WirePullRow[] = [
  {
    material: 'AU',
    diameterIn: withSource(0.001, 'in', 'S42'),
    stage: 'post-seal',
    minStrengthGf: withSource(2.5, 'gf', 'S42'),
  },
  {
    material: 'AL',
    diameterIn: withSource(0.0015, 'in', 'S42'),
    stage: 'pre-seal',
    minStrengthGf: withSource(4, 'gf', 'S42'),
  },
];

/** S42 TABLE I 이 다루는 와이어 직경(이산값). 그 밖은 Figure 2011-1 곡선 소관이며 원장 미확보다. */
export const WIRE_PULL_DIAMETERS_IN: readonly number[] = [
  withSource(0.0007, 'in', 'S42').value,
  withSource(0.001, 'in', 'S42').value,
  withSource(0.00125, 'in', 'S42').value,
  withSource(0.0013, 'in', 'S42').value,
  withSource(0.0015, 'in', 'S42').value,
  withSource(0.003, 'in', 'S42').value,
];

/** 플립칩 범프 1개당 최소 결합강도 · 빔리드 1 mm 당 최소 결합강도. S42. */
export const FLIP_CHIP_MIN_GF_PER_BUMP = withSource(5, 'gf/bump', 'S42');
export const BEAM_LEAD_MIN_GF_PER_MM = withSource(30, 'gf/mm', 'S42');

/** 표준 표가 다루는 직경인가. 아니면 「표준 적용범위 밖」으로 표시한다. */
export function isTabulatedPullDiameter(diameterIn: number): boolean {
  return WIRE_PULL_DIAMETERS_IN.some((d) => d === diameterIn);
}

/** 최소 와이어 풀 요구치 [gf]. 원장에 없는 조합은 **보간하지 않고 거부**한다. */
export function wirePullRequirementGf(args: {
  material: WireMaterial; diameterIn: number; stage: SealStage;
}): Quantity {
  const row = WIRE_PULL_TABLE.find(
    (r) => r.material === args.material && r.diameterIn.value === args.diameterIn && r.stage === args.stage,
  );
  if (!row) {
    const available = WIRE_PULL_TABLE
      .map((r) => `${r.material} ${r.diameterIn.value} in ${r.stage}`)
      .join(' · ');
    throw new Error(
      `[S42] TABLE I 의 (${args.material}, ${args.diameterIn} in, ${args.stage}) 값이 원장에 없다. ` +
      `확보분: ${available}. 보간하지 않는다.`,
    );
  }
  return quantity(row.minStrengthGf.value, {
    modelId: 'packaging.wirePull.requirement',
    unit: 'gf',
    sourceId: 'S42',
    validRange: [0, Number.MAX_VALUE],
    assumptions: [`${args.material} · ${args.diameterIn} in · ${args.stage}`],
  });
}

// ─────────────────────── 볼본드 전단 면적 (S53) ───────────────────────

/** S53 §1 적용범위 — 와이어 직경 15~76 µm(0.6~3.0 mil). 밖이면 「표준 적용범위 밖」. */
const WIRE_DIAMETER_MIN_UM = withSource(15, 'µm', 'S53');
const WIRE_DIAMETER_MAX_UM = withSource(76, 'µm', 'S53');
export const WIRE_DIAMETER_SCOPE_UM: [number, number] = [WIRE_DIAMETER_MIN_UM.value, WIRE_DIAMETER_MAX_UM.value];

/** S53 §1 — 안정적 전단 결과를 위한 볼 높이 하한. */
export const BALL_HEIGHT_MIN_UM = withSource(4, 'µm', 'S53');
/** S53 §3 — 전단 툴 폭은 본드 직경의 1.2배 이상, 검사 배율 70X 이상. */
export const SHEAR_TOOL_WIDTH_RATIO_MIN = withSource(1.2, '', 'S53');
export const INSPECTION_MAGNIFICATION_MIN = withSource(70, 'X', 'S53');

const AREA_RANGE_UM2: [number, number] = [0, Number.MAX_VALUE];

/**
 * 압착 볼 전단 면적 — S53 §4.3: **A = πr² = πd²/4**.
 * 🔴 리터럴 4 를 쓰지 않으려고 반지름으로 다시 쓴다. 값은 완전히 같다.
 */
export function ballBondShearArea(ballDiameterUm: number): Quantity {
  assertWithin('ballDiameterUm', ballDiameterUm, POSITIVE_RANGE, 'µm');
  const radius = ballDiameterUm / 2;
  const v = Math.PI * radius * radius;
  return quantity(v, {
    modelId: 'packaging.ballBond.shearArea',
    unit: 'µm²',
    sourceId: 'S53',
    validRange: AREA_RANGE_UM2,
    assumptions: [
      '압착 볼을 원으로 본다(S53 §4.3)',
      `표준 적용 와이어 직경 ${WIRE_DIAMETER_MIN_UM.value}–${WIRE_DIAMETER_MAX_UM.value} µm · 볼 높이 ${BALL_HEIGHT_MIN_UM.value} µm 이상`,
      '🔴 수치 합격기준은 JESD47 소관이며 미확보다 — 면적만 계산한다',
    ],
  });
}

/** 단위면적당 전단강도 [gf/µm²]. S53 §5 b) 가 조달문서에 명시하라고 요구하는 양이다(기준값 자체는 미확보). */
export function shearStrengthPerArea(args: { shearForceGf: number; ballDiameterUm: number }): Quantity {
  assertWithin('shearForceGf', args.shearForceGf, [0, Number.MAX_VALUE], 'gf');
  const area = ballBondShearArea(args.ballDiameterUm).value;
  return quantity(args.shearForceGf / area, {
    modelId: 'packaging.ballBond.shearStrengthPerArea',
    unit: 'gf/µm²',
    sourceId: 'S53',
    validRange: [0, Number.MAX_VALUE],
    assumptions: ['🔴 최소 허용치는 조달문서(JESD47)가 정한다 — 이 값만으로 합·부를 가르지 않는다'],
  });
}
