import type { DirectionRule } from '../../direction';
import {
  defectLevel, grossDiePerWafer, murphyYield, negativeBinomialYield, poissonYield,
  seedsYield, yieldLossAfterLearning,
} from './yieldModels';
import { defectiveFractionCentered, processCapability, processCapabilityK } from './statistics';
import { overdriveRangeMarginUm, probeContactForce, scrubMarkClearanceUm } from './probeOperations';

/**
 * A12 — EDS 방향성 규칙 **선언**. 스윕 구간·기준값은 `tests/direction/eds.direction.test.ts` 가 소유한다.
 *
 * 🔴 B군(A15-op) 규칙은 `note` 첫머리에 「[운영규약]」을 달아 물리 규칙과 구분한다.
 *    출력의 `assumptions[0]` 에도 같은 표식이 실린다(`OPERATIONAL_ASSUMPTION`).
 */
/** 🔴 공정 ID 는 이 모듈이 소유한다 — 배럴에 리터럴을 두지 않는다(C1). */
export const EDS_PROCESS_ID = 'eds';

export const EDS_RULES: DirectionRule[] = [
  {
    id: 'EDS-D1',
    processId: 'eds',
    statement: '결함밀도 D₀ 가 올라가면 같은 다이 면적에서 수율이 떨어진다.',
    inputName: 'defectDensityPerCm2',
    expect: [
      { output: 'poissonYield', trend: 'decreasing' },
      { output: 'rawYield', trend: 'decreasing' },
    ],
    sourceId: 'S221',
    note: 'Y = e^(−AD₀) 는 D₀ 에 대해 단조 감소한다(S220 식 2). 음이항도 마찬가지다(식 12).',
  },
  {
    id: 'EDS-D2',
    processId: 'eds',
    statement: '다이 면적을 키우면 수율도 떨어지고 웨이퍼당 다이 수도 줄어든다 — 두 손해가 겹친다.',
    inputName: 'dieAreaCm2',
    expect: [
      { output: 'poissonYield', trend: 'decreasing' },
      { output: 'grossDie', trend: 'decreasing' },
    ],
    sourceId: 'S148',
    note: '수율은 S220 식 (2), 다이 수는 S148 의 N ≈ πd²/(4S) − πd/√(2S). 둘 다 면적에 단조 감소.',
  },
  {
    id: 'EDS-D3',
    processId: 'eds',
    statement:
      '같은 A·D₀ 에서 수율은 항상 Seeds ≥ Murphy ≥ Poisson 이고, A·D₀ 가 커질수록 그 격차가 벌어진다.',
    inputName: 'adProduct',
    expect: [
      { output: 'seedsOverPoisson', trend: 'increasing' },
      { output: 'murphyOverPoisson', trend: 'increasing' },
    ],
    sourceId: 'S220',
    note: '클러스터링을 무시하는 Poisson 은 A·D₀ > 1 이나 큰 다이에서 수율을 과소평가한다(S220 §4).',
  },
  {
    id: 'EDS-D4',
    processId: 'eds',
    statement: '테스트 커버리지 T 를 올리면 출하 결함수준 DL 이 내려간다.',
    inputName: 'coverage',
    expect: [{ output: 'defectLevelPpm', trend: 'decreasing' }],
    sourceId: 'S227',
    note: 'DL = 1 − Y^(1−T). T → 1 이면 DL → 0. 커버리지는 계산 결과가 아니라 입력값이다.',
  },
  {
    id: 'EDS-D5',
    processId: 'eds',
    statement: '산포 σ 가 커지면 Cpk 가 떨어지고 불량률이 올라간다.',
    inputName: 'sigma',
    expect: [
      { output: 'cpk', trend: 'decreasing' },
      { output: 'defectiveFraction', trend: 'increasing' },
    ],
    sourceId: 'S224',
    note: 'Cpk = min[(USL−µ)/3σ, (µ−LSL)/3σ] · p = 2Φ(−3Cp) (NIST §6.1.6). 임계값은 쓰지 않는다.',
  },
  {
    id: 'EDS-D6',
    processId: 'eds',
    statement: '클러스터 계수 α 가 커질수록(=클러스터링이 약할수록) 음이항 수율은 Poisson 쪽으로 낮아진다.',
    inputName: 'alpha',
    expect: [{ output: 'rawYield', trend: 'decreasing' }],
    sourceId: 'S220',
    note: 'α ≥ 10 에서 음이항은 사실상 Poisson 과 같아진다(S220 §4). α = 1 이면 Seeds.',
  },
  {
    id: 'EDS-D7',
    processId: 'eds',
    statement: '[운영규약] 오버드라이브를 키우면 프로브 접촉력이 비례해 커진다.',
    inputName: 'overdriveMil',
    expect: [{ output: 'contactForceG', trend: 'increasing' }],
    sourceId: 'S229',
    note: '[운영규약 · A15-op] S229 가 접촉력을 「g / mil OD」로 준다 — 범위 조회이지 물리식이 아니다.',
  },
  {
    id: 'EDS-D8',
    processId: 'eds',
    statement: '[운영규약] 스크럽 마크가 길어질수록 패시베이션 개구부까지의 여유가 줄어든다.',
    inputName: 'markLengthUm',
    expect: [{ output: 'scrubClearanceUm', trend: 'decreasing' }],
    sourceId: 'S229',
    note: '[운영규약 · A15-op] S229 는 수치규격을 주지 않는다 — 「개구부 내」라는 기하 조건만 판정한다.',
  },
  {
    id: 'EDS-D9',
    processId: 'eds',
    statement: '양산 개월 수가 쌓이면 수율손실이 지수적으로 줄어든다(수율 학습).',
    inputName: 'months',
    expect: [{ output: 'yieldLoss', trend: 'decreasing' }],
    sourceId: 'S220',
    note: 'YL(t) = YL(0)·e^(−γt), γ 는 SEMATECH 5개사 실측 평균(S220 §8 Table 2).',
  },
  {
    id: 'EDS-D10',
    processId: 'eds',
    statement:
      '[운영규약] 오버드라이브의 실무범위(25–76 µm) 여유는 단조가 아니다 — 너무 작아도, 너무 커도 벗어난다.',
    inputName: 'overdriveUm',
    expect: [{ output: 'overdriveMarginUm', trend: 'non-monotonic' }],
    sourceId: 'S229',
    note: '[운영규약 · A15-op] 🔴 기존 명세의 정답창 90~105 µm 는 하한부터 문헌 범위 밖이었다.',
  },
];

/** 방향성 검사용 모델 어댑터. 물리 출력과 B군 조회 출력을 한 번에 낸다. */
export function edsModel(inputs: Record<string, number>): Record<string, number> {
  const areaCm2 = req(inputs, 'dieAreaCm2');
  const defectDensityPerCm2 = req(inputs, 'defectDensityPerCm2');
  const alpha = req(inputs, 'alpha');
  const adProduct = req(inputs, 'adProduct');
  const diameterCm = req(inputs, 'diameterCm');
  const coverage = req(inputs, 'coverage');
  const sigma = req(inputs, 'sigma');
  const usl = req(inputs, 'usl');
  const lsl = req(inputs, 'lsl');
  const mean = req(inputs, 'mean');
  const months = req(inputs, 'months');
  const initialLoss = req(inputs, 'initialLoss');

  // 🔴 A·D₀ 를 직접 흔드는 규칙(EDS-D3)은 면적을 1 cm² 로 두고 결함밀도에 실어 계산한다.
  //    단위 면적이므로 A·D₀ = D₀ 가 되어 곱이 그대로 들어간다.
  const unitArea = { areaCm2: 1, defectDensityPerCm2: adProduct };
  // 🔴 여기서만 Poisson 을 적용한계 밖에서도 계산한다 — **한계를 넘으면 얼마나 어긋나는가**를
  //    보여주는 것이 이 규칙의 목적이기 때문이다. 제품 계산 경로는 poissonYield() 가 막는다.
  const poissonAtAd = Math.exp(-adProduct);
  const cpk = processCapabilityK({ usl, lsl, mean, sigma }).value;
  const cp = processCapability({ usl, lsl, sigma }).value;

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    poissonYield: poissonYield({ areaCm2, defectDensityPerCm2 }).value,
    rawYield: negativeBinomialYield({ areaCm2, defectDensityPerCm2, alpha }).value,
    grossDie: grossDiePerWafer({ diameterCm, dieAreaCm2: areaCm2 }).value,
    seedsOverPoisson: seedsYield(unitArea).value / poissonAtAd,
    murphyOverPoisson: murphyYield(unitArea).value / poissonAtAd,
    defectLevelPpm: defectLevel({ dieYield: req(inputs, 'dieYield'), coverage }).value,
    cpk,
    defectiveFraction: defectiveFractionCentered(cp).value,
    yieldLoss: yieldLossAfterLearning({ initialLoss, months, node: '180nm' }).value,
    contactForceG: probeContactForce({
      material: 'W', overdriveMil: req(inputs, 'overdriveMil'), bound: 'max',
    }).value,
    scrubClearanceUm: scrubMarkClearanceUm({
      markLengthUm: req(inputs, 'markLengthUm'),
      markWidthUm: req(inputs, 'markWidthUm'),
      offsetXUm: req(inputs, 'offsetXUm'),
      offsetYUm: req(inputs, 'offsetYUm'),
      openingWidthUm: req(inputs, 'openingWidthUm'),
      openingHeightUm: req(inputs, 'openingHeightUm'),
    }).value,
    overdriveMarginUm: overdriveRangeMarginUm(req(inputs, 'overdriveUm')).value,
  };
}

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}
