import { quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * 웨이퍼 박막화·싱귤레이션 파괴강도 — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S243** = Choi et al., *Si Characterization on Thinning and Singulation Processes
 * for 2.5/3D HBM Package Integration*, **Materials 17(22), 5529 (2024)** (CC BY 4.0).
 * 골든값 **R195**(박막화 웨이퍼 3점 굽힘) · **R196**(싱귤레이션 후 칩).
 *
 * 🔴 **실측 대조표다. 계산식이 아니다.** 원장이 확보한 조건은 두 점뿐이므로
 *    **다른 두께·다른 공정으로 보간하지 않고 거부**한다(원장 규칙 1).
 */

/** S243 §2 — 3점 굽힘 시험조건. */
export const BEND_TEST = Object.freeze({
  spanMm: withSource(2.4, 'mm', 'S243'),
  crossheadSpeedMmPerMin: withSource(1, 'mm/min', 'S243'),
  orientation: 'Si (111)',
});

/** S243 — HBM 적층에서 보고된 박막화 두께. (최저 20 µm 보고) */
export const REPORTED_THINNED_THICKNESS_UM: readonly number[] = [
  withSource(60, 'µm', 'S243').value,
  withSource(90, 'µm', 'S243').value,
  withSource(120, 'µm', 'S243').value,
];
export const MIN_REPORTED_THICKNESS_UM = withSource(20, 'µm', 'S243');

export type ThinningProcess = 'polishing';
export type SingulationProcess = 'stealth-dicing';

interface StrengthRow {
  readonly thicknessUm: SourcedConst;
  readonly process: string;
  readonly strengthKgf: SourcedConst;
}

/** R195 — 박막화(폴리싱) 웨이퍼, 두께 60 µm, 3점 굽힘. */
const THINNED_TABLE: readonly StrengthRow[] = [
  { thicknessUm: withSource(60, 'µm', 'S243'), process: 'polishing', strengthKgf: withSource(21.2, 'kgf', 'S243') },
];

/** R196 — 싱귤레이션(스텔스 다이싱) 후 칩, 두께 60 µm. */
const SINGULATED_TABLE: readonly StrengthRow[] = [
  { thicknessUm: withSource(60, 'µm', 'S243'), process: 'stealth-dicing', strengthKgf: withSource(153, 'kgf', 'S243') },
];

const STRENGTH_RANGE_KGF: [number, number] = [0, Number.MAX_VALUE];

function lookup(table: readonly StrengthRow[], thicknessUm: number, process: string, label: string): StrengthRow {
  const row = table.find((r) => r.thicknessUm.value === thicknessUm && r.process === process);
  if (!row) {
    const available = table.map((r) => `${r.thicknessUm.value} µm / ${r.process}`).join(' · ');
    throw new Error(
      `[S243] ${label}: (${thicknessUm} µm, ${process}) 의 실측값이 원장에 없다. 확보분: ${available}. ` +
      '두께·공정 사이를 보간하지 않는다.',
    );
  }
  return row;
}

/** 박막화 웨이퍼 파괴강도 [kgf]. 3점 굽힘, 스팬 2.4 mm, 1 mm/min. */
export function thinnedWaferFractureStrength(args: {
  thicknessUm: number; thinning: ThinningProcess;
}): Quantity {
  const row = lookup(THINNED_TABLE, args.thicknessUm, args.thinning, '박막화 웨이퍼');
  return quantity(row.strengthKgf.value, {
    modelId: 'packaging.waferThinning.fractureStrength',
    unit: 'kgf',
    sourceId: 'S243',
    validRange: STRENGTH_RANGE_KGF,
    assumptions: [
      `3점 굽힘 · 스팬 ${BEND_TEST.spanMm.value} mm · ${BEND_TEST.crossheadSpeedMmPerMin.value} mm/min`,
      BEND_TEST.orientation,
      '문헌 실측값 — 계산식으로 유도한 값이 아니다',
    ],
  });
}

/** 싱귤레이션 후 칩 파괴강도 [kgf]. */
export function singulatedChipFractureStrength(args: {
  thicknessUm: number; singulation: SingulationProcess;
}): Quantity {
  const row = lookup(SINGULATED_TABLE, args.thicknessUm, args.singulation, '싱귤레이션 칩');
  return quantity(row.strengthKgf.value, {
    modelId: 'packaging.singulation.fractureStrength',
    unit: 'kgf',
    sourceId: 'S243',
    validRange: STRENGTH_RANGE_KGF,
    assumptions: ['문헌 실측값 — 계산식으로 유도한 값이 아니다'],
  });
}
