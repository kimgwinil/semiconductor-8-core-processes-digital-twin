import type { DirectionRule } from '../../direction';
import { dopantDensity, resistivityFromDensity } from './resistivity';
import {
  defectDiffusivity, dominantDefectRegime, voronkovRatio, XI_CRIT_TYPICAL,
  type ParameterSetId,
} from './pointDefect';
import { maxPullRate, scheilAxialConcentration } from './czochralski';
import { normalForceByFeedRate, normalForceByWireSpeed } from './wireSaw';
import { MM_PER_CM } from '../units';

/** 🔴 공정 ID 리터럴은 이 모듈이 소유한다(카탈로그 복제 금지 C1). 배럴은 이 상수를 쓴다. */
export const WAFER_PROCESS_ID = 'wafer';

/**
 * A12 — 웨이퍼 제조 방향성 규칙 **선언**.
 * 스윕 구간·기준값은 `tests/direction/wafer.direction.test.ts` 가 소유한다(검증 설정이지 제품 상수가 아니다).
 */
export const WAFER_RULES: DirectionRule[] = [
  {
    id: 'WF-D8',
    processId: 'wafer',
    statement: '인상속도를 올리면 길이 기준 처리량이 같은 비율로 증가한다.',
    inputName: 'pullRateMmPerMin',
    expect: [{ output: 'throughputMmPerMin', trend: 'increasing' }],
    sourceId: 'S106',
    scope: 'lab',
    note: '실습 슬라이더의 mm/min 단위를 그대로 관찰한 길이 기준 처리량이다.',
  },
  {
    id: 'WF-D1',
    processId: 'wafer',
    statement: '인상속도를 올리면 ξ = v/G 가 커지고, 임계 ξ_crit 을 넘는 순간 지배 결함이 침입형에서 공공형으로 바뀐다.',
    inputName: 'pullRateCmPerMin',
    expect: [
      { output: 'vgRatio', trend: 'increasing' },
      { output: 'defectRegimeIndex', trend: 'increasing' },
    ],
    sourceId: 'S101',
    note: 'Voronkov 기준 — ξ < ξ_crit 이면 침입형 과잉, ξ > ξ_crit 이면 공공 과잉(S101 §3.2.1). '
      + `ξ_crit = ${XI_CRIT_TYPICAL.value} cm²·min⁻¹·K⁻¹ (S101 Table 4). 🔴 A6 고정 목록 A6L-01.`,
  },
  {
    id: 'WF-D2',
    processId: 'wafer',
    statement: '온도가 높을수록 점결함(침입형·공공)의 확산계수가 커진다. 1000 °C 아래로 내려가면 사실상 동결된다.',
    inputName: 'tempK',
    expect: [
      { output: 'diffusivityI', trend: 'increasing' },
      { output: 'diffusivityV', trend: 'increasing' },
    ],
    sourceId: 'S101',
    note: 'D = D⁰exp(−Hᵐ/kT) — Hᵐ > 0 이므로 T 에 단조 증가한다(S101 식 4).',
  },
  {
    id: 'WF-D3',
    processId: 'wafer',
    statement: '저항률이 높을수록 도핑밀도는 낮다. 뒤집어 말하면 도핑농도를 올리면 저항률이 떨어진다.',
    inputName: 'resistivityOhmCm',
    expect: [{ output: 'dopantDensityCm3', trend: 'decreasing' }],
    sourceId: 'S100',
    note: 'N = (qρN)/(qρ). 곱 qρN 은 저항률에 완만히 변하지만 1/ρ 항이 지배한다(S100 식 1). '
      + '이동도가 농도에 의존하므로 상수 이동도 근사가 아니라 경험식을 쓴다.',
  },
  {
    id: 'WF-D4',
    processId: 'wafer',
    statement: '고화율이 올라갈수록(잉곳 꼬리로 갈수록) 축방향 도핑농도는 올라가고 저항률은 떨어진다 — k₀ < 1 이기 때문이다.',
    inputName: 'solidFraction',
    expect: [
      { output: 'axialDopantCm3', trend: 'increasing' },
      { output: 'axialResistivityOhmCm', trend: 'decreasing' },
    ],
    sourceId: 'S107',
    note: 'C_s = k₀C₀(1−X)^(k₀−1). k₀ < 1 이면 지수가 음수라 X→1 에서 발산한다. '
      + '🔴 M-1: 이 규칙의 출처(S107)는 라이선스 미확보다. 화면에 출처 배지를 달지 마라.',
  },
  {
    id: 'WF-D5',
    processId: 'wafer',
    statement: '이송속도를 올리면 와이어쏘 절삭 법선력이 커진다(α = 0.568 > 0).',
    inputName: 'feedRateMmPerMin',
    expect: [{ output: 'normalForceFeedN', trend: 'increasing' }],
    sourceId: 'S104',
    note: 'F_n = 3.253·V_x^0.568, 와이어 속도 1.5 m/s 고정 조건의 실측 피팅(S104 식 2).',
  },
  {
    id: 'WF-D6',
    processId: 'wafer',
    statement: '와이어 속도를 올리면 같은 이송속도에서 법선력이 오히려 줄어든다(β = −0.455 < 0). 이송속도와 반대 방향이다.',
    inputName: 'wireSpeedMPerS',
    expect: [{ output: 'normalForceSpeedN', trend: 'decreasing' }],
    sourceId: 'S104',
    note: '와이어가 빠를수록 지립 하나가 담당하는 절삭량이 줄어든다. WF-D5 와 짝을 이루는 상충 관계다.',
  },
  {
    id: 'WF-D7',
    processId: 'wafer',
    statement: '결정 직경이 커지면 뽑을 수 있는 최대 인상속도가 떨어진다 — 잠열을 빼낼 면적당 능력이 줄기 때문이다.',
    inputName: 'crystalDiameterCm',
    expect: [{ output: 'pullRateLimitMmPerMin', trend: 'decreasing' }],
    sourceId: 'S106',
    note: 'V_max ∝ r^(−1/2). 독립 열전달 모델 3종이 같은 지수를 준다(S106 §A.1·Fig. 3).',
  },
];

/** 방향성 검사용 모델 어댑터. 점결함은 원장 R101 이 검증한 세트 A 를 쓴다. */
const DIRECTION_SET: ParameterSetId = 'A';
/** 축방향 편석 예제의 도펀트는 붕소다 — 원장 R105 와 같은 경로를 흔든다. */
const AXIAL_DOPANT = 'boron' as const;

export function waferModel(inputs: Record<string, number>): Record<string, number> {
  const tempK = req(inputs, 'tempK');
  const pullRateCmPerMin = req(inputs, 'pullRateCmPerMin');
  const gradientKPerCm = req(inputs, 'gradientKPerCm');
  const resistivityOhmCm = req(inputs, 'resistivityOhmCm');
  const solidFraction = req(inputs, 'solidFraction');
  const meltConcentrationCm3 = req(inputs, 'meltConcentrationCm3');
  const k0 = req(inputs, 'k0');
  const feedRateMmPerMin = req(inputs, 'feedRateMmPerMin');
  const wireSpeedMPerS = req(inputs, 'wireSpeedMPerS');
  const crystalDiameterCm = req(inputs, 'crystalDiameterCm');

  const xi = voronkovRatio({ pullRateCmPerMin, gradientKPerCm }).value;
  const axialDopantCm3 = scheilAxialConcentration({
    k0, meltConcentrationCm3, solidFraction,
  }).value;

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    throughputMmPerMin: inputs['pullRateMmPerMin'] ?? pullRateCmPerMin * MM_PER_CM,
    vgRatio: xi,
    defectRegimeIndex: dominantDefectRegime(xi) === 'vacancy-rich' ? 1 : 0,
    diffusivityI: defectDiffusivity({ setId: DIRECTION_SET, species: 'I', tempK }).value,
    diffusivityV: defectDiffusivity({ setId: DIRECTION_SET, species: 'V', tempK }).value,
    dopantDensityCm3: dopantDensity({ dopant: 'phosphorus', rhoOhmCm: resistivityOhmCm }).value,
    axialDopantCm3,
    axialResistivityOhmCm: resistivityFromDensity({
      dopant: AXIAL_DOPANT, densityCm3: axialDopantCm3,
    }).value,
    normalForceFeedN: normalForceByFeedRate(feedRateMmPerMin).value,
    normalForceSpeedN: normalForceByWireSpeed(wireSpeedMPerS).value,
    pullRateLimitMmPerMin: maxPullRate({ diameterCm: crystalDiameterCm, bound: 'high' }).value,
  };
}

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}
