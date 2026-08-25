import type { DirectionRule } from '../../direction';
import { removalRate, polishTime, relativeVelocity, R165_CENTER_DISTANCE_MM } from './cmp';
import { copperLineResistance, effectiveResistivityFSLine } from './resistance';
import { normalizedRcDelay } from './rcDelay';
import { blackAccelerationFactor } from './electromigration';
import { depositedMass } from './electroplating';
import { NM_PER_M, UM_PER_M } from './units';

/**
 * A12 — P6 금속배선·CMP 방향성 규칙 **선언**.
 * 스윕 구간·기준값은 `tests/direction/metal.direction.test.ts` 가 소유한다(검증 설정이지 제품 상수가 아니다).
 *
 * 🔴 라벨 표기 규율: 크기효과는 **「표면 산란」**이라고만 쓴다. 입계 산란은 구현하지 않았다(M-17).
 */
export const METAL_RULES: DirectionRule[] = [
  {
    id: 'MC-D9', processId: 'metal',
    statement: '정반 회전수를 올리면 패드–웨이퍼 상대 선속도가 증가한다.',
    inputName: 'platenRpm', expect: [{ output: 'velocityMps', trend: 'increasing' }],
    sourceId: 'S200', scope: 'lab',
    note: 'V = ωr. 반지름이 고정된 실습에서 rpm과 선속도는 정비례한다.',
  },
  {
    id: 'MC-D1',
    processId: 'metal',
    statement: '선폭을 넓히면 단면적이 커지는 데 더해 표면 산란까지 약해져, 배선 저항이 1/W 보다 빠르게 내려간다.',
    inputName: 'lineWidthNm',
    expect: [
      { output: 'effectiveResistivityUOhmCm', trend: 'decreasing' },
      { output: 'lineResistanceOhm', trend: 'decreasing' },
    ],
    sourceId: 'S216',
    note: '🔴 2026-08-21 M-29 수정 전에는 「폭은 단면적에만 걸린다 · R 은 정확히 1/W」였다. S216 Eq.(8) 의 특성길이가 4·A/P 라 **폭도 표면 산란에 걸린다.**',
  },
  {
    id: 'MC-D2',
    processId: 'metal',
    statement: '배선을 두껍게 하면 단면적이 커지는 데 더해 표면 산란까지 약해져, 저항이 1/T 보다 더 빠르게 내려간다.',
    inputName: 'lineThicknessNm',
    expect: [
      { output: 'effectiveResistivityUOhmCm', trend: 'decreasing' },
      { output: 'lineResistanceOhm', trend: 'decreasing' },
    ],
    sourceId: 'S216',
    note: '🔴 두 효과가 같은 방향으로 겹친다(가중). Fuchs–Sondheimer 표면 산란만 반영했다 — 입계 산란은 M-17 로 제외. 특성길이는 4·A/P (S216 Eq.(8)).',
  },
  {
    id: 'MC-D3',
    processId: 'metal',
    statement: '전류밀도를 올리면 일렉트로마이그레이션 수명이 짧아진다(수명비가 내려간다).',
    inputName: 'currentDensity2',
    expect: [{ output: 'emLifetimeRatio', trend: 'decreasing' }],
    sourceId: 'S201',
    note: 'Black 식의 J^(−n) 항. 🔴 MTTF 절대값이 아니라 계수 A 가 약분된 비율이다(A6L-03).',
  },
  {
    id: 'MC-D4',
    processId: 'metal',
    statement: '온도를 올리면 확산이 빨라져 일렉트로마이그레이션 수명이 짧아진다.',
    inputName: 'temperature2K',
    expect: [{ output: 'emLifetimeRatio', trend: 'decreasing' }],
    sourceId: 'S201',
    note: 'exp(E_a/kT) 항. E_a 는 확산경로에 따라 다르다 — S201 Table 2.1 (Cu 표면 0.8 eV).',
  },
  {
    id: 'MC-D5',
    processId: 'metal',
    statement: 'CMP 하중압력을 올리면 제거율이 비례해 올라가고, 같은 두께를 깎는 데 걸리는 시간은 줄어든다.',
    inputName: 'cmpPressurePa',
    expect: [
      { output: 'removalRateNmPerMin', trend: 'increasing' },
      { output: 'polishTimeMin', trend: 'decreasing' },
    ],
    sourceId: 'S204',
    note: 'Preston MRR = K_p·P·V. 🔴 두 출력을 반대 방향으로 함께 걸어 「슬라이더 장난감」을 막는다.',
  },
  {
    id: 'MC-D6',
    processId: 'metal',
    statement: 'CMP 상대속도를 올리면 제거율이 비례해 올라간다.',
    inputName: 'cmpVelocityMps',
    expect: [{ output: 'removalRateNmPerMin', trend: 'increasing' }],
    sourceId: 'S204',
    note: 'Preston 식의 V 항. 유효구간 0.05–3.91 m/s (S204 Table 2.6) 밖은 계산하지 않는다.',
  },
  {
    id: 'MC-D7',
    processId: 'metal',
    statement: '층간절연막의 유전율이 높을수록 RC 지연이 커진다. 그래서 SiO₂(4.0)를 low-k(2.6)로 바꾸면 지연이 줄어든다.',
    inputName: 'dielectricConstant',
    expect: [{ output: 'rcDelayRatio', trend: 'increasing' }],
    sourceId: 'S205',
    note: 'τ = 0.89·R·C, C ∝ K_ox. 🔴 ε₀ 를 분리한 무차원 지연이라 절대 초를 주장하지 않는다.',
  },
  {
    id: 'MC-D8',
    processId: 'metal',
    statement: '전해도금 전류를 올리면 같은 시간에 석출되는 구리 질량이 비례해 늘어난다.',
    inputName: 'platingCurrentA',
    expect: [{ output: 'platedMassG', trend: 'increasing' }],
    sourceId: 'S212',
    note: 'Faraday m = M·I·t/(nF). F 는 NIST CODATA 정확값.',
  },
];

/** 방향성 검사용 모델 어댑터. 전 출력을 매 호출마다 계산한다. */
export function metalModel(inputs: Record<string, number>): Record<string, number> {
  const lineWidthNm = req(inputs, 'lineWidthNm');
  const lineThicknessNm = req(inputs, 'lineThicknessNm');
  const lineLengthUm = req(inputs, 'lineLengthUm');
  const currentDensity1 = req(inputs, 'currentDensity1');
  const currentDensity2 = req(inputs, 'currentDensity2');
  const temperature1K = req(inputs, 'temperature1K');
  const temperature2K = req(inputs, 'temperature2K');
  const exponentN = req(inputs, 'exponentN');
  const activationEnergyEv = req(inputs, 'activationEnergyEv');
  const prestonCoefficient = req(inputs, 'prestonCoefficient');
  const cmpPressurePa = req(inputs, 'cmpPressurePa');
  const cmpVelocityMps = req(inputs, 'cmpVelocityMps');
  const targetRemovalNm = req(inputs, 'targetRemovalNm');
  const dielectricConstant = req(inputs, 'dielectricConstant');
  const platingCurrentA = req(inputs, 'platingCurrentA');
  const platingTimeS = req(inputs, 'platingTimeS');
  const molarMassGPerMol = req(inputs, 'molarMassGPerMol');
  const valence = req(inputs, 'valence');

  const mrr = removalRate({ prestonCoefficient, pressurePa: cmpPressurePa, velocityMps: cmpVelocityMps }).value;

  // RC 지연 형상 — 이상 스케일링을 따라 X_ox = L_S = W 로 둔다(S205 Eq.(6) 의 전제).
  const widthM = lineWidthNm / NM_PER_M;
  const heightM = lineThicknessNm / NM_PER_M;
  const lengthM = lineLengthUm / UM_PER_M;

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    velocityMps: inputs['platenRpm'] === undefined ? cmpVelocityMps : relativeVelocity({
      platenRpm: inputs['platenRpm'], headRpm: inputs['platenRpm'], centerDistanceMm: R165_CENTER_DISTANCE_MM.value,
    }).value,
    // 🔴 M-29: 무한폭 박막식이 아니라 **배선식**을 쓴다. 폭이 실효 저항률에 실제로 들어간다.
    effectiveResistivityUOhmCm: effectiveResistivityFSLine({
      widthNm: lineWidthNm, thicknessNm: lineThicknessNm,
    }).value,
    lineResistanceOhm: copperLineResistance({
      lengthUm: lineLengthUm, widthNm: lineWidthNm, thicknessNm: lineThicknessNm,
    }).value,
    emLifetimeRatio: blackAccelerationFactor({
      currentDensity1, currentDensity2, temperature1K, temperature2K, exponentN, activationEnergyEv,
    }).value,
    removalRateNmPerMin: mrr,
    polishTimeMin: polishTime({ targetRemovalNm, removalRateNmPerMin: mrr }).value,
    rcDelayRatio: normalizedRcDelay({
      dielectricConstant,
      lengthM, widthM, heightM, oxideThicknessM: widthM, spacingM: widthM,
    }).value,
    platedMassG: depositedMass({
      currentA: platingCurrentA, timeS: platingTimeS, molarMassGPerMol, valence,
    }).value,
  };
}

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}

/** 이 모듈이 담당하는 공정 ID. 배럴이 리터럴을 갖지 않게 하려고 여기서 내보낸다(C1). */
export const METAL_PROCESS_ID = 'metal';
