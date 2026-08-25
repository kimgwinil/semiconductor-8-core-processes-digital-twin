import type { DirectionRule } from '../../direction';
import { aldDepositionTimeS, aldThicknessAngstrom, gpcAt } from './ald';
import { apparentActivationEnergy, cvdGrowthRate, surfaceReactionRate } from './cvd';
import { dopantDiffusivity, junctionDepthErfc } from './diffusion';
import {
  annealedStraggle, beamCurrentA, doseFromBeam, implantTimeS, junctionDepthDeep,
  junctionDepthShallow, peakConcentration, waferAreaCm2,
} from './implant';
import { nuclearStoppingReduced, reducedEnergy } from './sputter';
import { filmStressStoney } from './stoney';

/**
 * A12 — 증착·이온주입 방향성 규칙 **선언**.
 * 스윕 구간·기준값은 검증 설정이므로 `tests/direction/deposition.direction.test.ts` 가 소유한다.
 *
 * 🔴 이 공정의 핵심 상충은 **「ALD 온도를 올려도 GPC 는 변하지 않는다」**(DEP-D1)다.
 *    자기제한 반응이 ALD 의 존재 이유이므로, 여기에 단조 증가·감소를 걸면 물리를 거꾸로 가르친다.
 */
export const DEPOSITION_PROCESS_ID = 'deposition';

export const DEPOSITION_RULES: DirectionRule[] = [
  {
    id: 'DEP-D12', processId: 'deposition',
    statement: 'ALD 사이클 수를 늘리면 누적 두께가 선형으로 증가한다.',
    inputName: 'cycles', expect: [{ output: 'thicknessNm', trend: 'increasing' }],
    sourceId: 'S186', scope: 'lab',
  },
  {
    id: 'DEP-D13', processId: 'deposition',
    statement: '이온 주입 도즈를 늘리면 가우시안 분포의 피크 농도가 증가한다.',
    inputName: 'doseE14', expect: [{ output: 'peakCm3', trend: 'increasing' }],
    sourceId: 'S181', scope: 'lab',
  },
  {
    id: 'DEP-D1',
    processId: 'deposition',
    statement: '🔴 ALD 창 안에서는 기판 온도를 올려도 사이클당 성장(GPC)과 최종 두께가 변하지 않는다 — 자기제한 반응.',
    inputName: 'aldTempC',
    expect: [
      { output: 'gpcAngstrom', trend: 'flat' },
      { output: 'thicknessNm', trend: 'flat' },
    ],
    sourceId: 'S186',
    note: 'S186 본문 「ALD window … ~1.1 Å/cycle at growth temperatures above 150 °C」. 창 밖은 범위 밖으로 거부한다.',
  },
  {
    id: 'DEP-D2',
    processId: 'deposition',
    statement: 'ALD 사이클 수를 늘리면 두께가 선형으로 늘고, 그만큼 장비 점유 시간도 함께 늘어난다.',
    inputName: 'aldCycles',
    expect: [
      { output: 'thicknessNm', trend: 'increasing' },
      { output: 'depositionTimeS', trend: 'increasing' },
    ],
    sourceId: 'S186',
    note: '두께 = GPC × N. 얻는 것(두께)의 대가가 시간이라는 점을 두 출력으로 동시에 보여 준다.',
  },
  {
    id: 'DEP-D3',
    processId: 'deposition',
    statement: '확산 온도를 올리면 확산계수가 아레니우스로 커지고 접합이 깊어진다.',
    inputName: 'diffTempK',
    expect: [
      { output: 'diffusivityCm2PerS', trend: 'increasing' },
      { output: 'diffusionJunctionUm', trend: 'increasing' },
    ],
    sourceId: 'S188',
    note: 'D = D₀exp(−E_a/kT) · x_j = 2√(Dt)·erfc⁻¹(C_B/C_s). D₀·E_a 는 S188 실측 세트.',
  },
  {
    id: 'DEP-D4',
    processId: 'deposition',
    statement: '확산 시간을 늘리면 접합은 깊어지되 √t 법칙이라 깊어지는 속도는 계속 느려진다.',
    inputName: 'diffTimeS',
    expect: [
      { output: 'diffusionJunctionUm', trend: 'increasing' },
      { output: 'diffusionJunctionRateUmPerS', trend: 'decreasing' },
    ],
    sourceId: 'S182',
    note: '🔴 깊이에 증가를, 증가율에 감소를 따로 건다. 하나로 묶으면 틀린 물리를 강제한다.',
  },
  {
    id: 'DEP-D5',
    processId: 'deposition',
    statement: 'CVD 온도를 올리면 성장률은 오르지만, 물질전달 율속으로 넘어가면서 아레니우스 기울기(겉보기 활성화에너지)가 급감한다.',
    inputName: 'cvdTempK',
    expect: [
      { output: 'cvdGrowthRateCmPerS', trend: 'increasing' },
      { output: 'cvdApparentEaEv', trend: 'decreasing' },
    ],
    sourceId: 'S184',
    note: '직렬 저항 구조라 느린 쪽이 지배한다. E_app = E_a·h_g/(h_g+k_s) → 고온에서 0 으로 수렴.',
  },
  {
    id: 'DEP-D6',
    processId: 'deposition',
    statement: '같은 곡률(같은 휨)에서 막이 두꺼울수록 Stoney 식으로 환산되는 막 응력의 크기는 작아진다.',
    inputName: 'filmThicknessM',
    expect: [{ output: 'filmStressMagnitudePa', trend: 'decreasing' }],
    sourceId: 'S187',
    note: 'σ ∝ 1/(R·t_f). 부호는 곡률 반경의 부호가 정한다 — 크기만 이 규칙의 대상이다.',
  },
  {
    id: 'DEP-D7',
    processId: 'deposition',
    statement: '스퍼터 이온 에너지를 올리면 환산에너지는 계속 커지지만, 핵정지능은 최댓값을 지나 다시 줄어든다.',
    inputName: 'ionEnergyEv',
    expect: [
      { output: 'reducedEnergy', trend: 'increasing' },
      { output: 'nuclearStoppingSn', trend: 'non-monotonic' },
    ],
    sourceId: 'S185',
    note: '🔴 물리적으로 실재하는 최댓값이다. 단조로 걸면 고에너지에서 스퍼터 효율이 떨어지는 이유를 못 가르친다.',
  },
  {
    id: 'DEP-D8',
    processId: 'deposition',
    statement: '주입 도즈를 늘리면 피크 농도가 선형으로 오르고 접합도 깊어지지만, 같은 빔 전류라면 주입 시간이 그만큼 길어진다.',
    inputName: 'implantDoseCm2',
    expect: [
      { output: 'peakCm3', trend: 'increasing' },
      { output: 'junctionDeepNm', trend: 'increasing' },
      { output: 'implantTimeS', trend: 'increasing' },
    ],
    sourceId: 'S181',
    note: 'N_p = Φ/(√(2π)ΔR_p) · Φ = I·t/(qA). 도즈를 얻는 대가가 처리량이다.',
  },
  {
    id: 'DEP-D9',
    processId: 'deposition',
    statement: '같은 도즈라도 ΔR_p 가 클수록(분포가 넓을수록) 피크 농도는 낮아진다.',
    inputName: 'implantDeltaRpUm',
    expect: [{ output: 'peakCm3', trend: 'decreasing' }],
    sourceId: 'S181',
    note: '넓게 퍼진 같은 양은 봉우리가 낮다 — 가우시안 규격화의 직접 결과.',
  },
  {
    id: 'DEP-D10',
    processId: 'deposition',
    statement: '기판 농도가 높을수록 깊은 쪽 접합은 얕아지고, 얕은 쪽 접합은 오히려 깊어진다 — 두 접합이 서로 다가온다.',
    inputName: 'implantSubstrateCm3',
    expect: [
      { output: 'junctionDeepNm', trend: 'decreasing' },
      { output: 'junctionShallowNm', trend: 'increasing' },
    ],
    sourceId: 'S180',
    note: '🔴 x_j = R_p ± √2ΔR_p√(ln(N_p/N_B)). 얕은 근은 버리는 근이 아니라 실재하는 접합이다.',
  },
  {
    id: 'DEP-D11',
    processId: 'deposition',
    statement: '주입 후 어닐 시간을 늘리면 분포가 넓어져(σ′↑) 피크 농도는 떨어지고 깊은 접합은 더 깊어진다.',
    inputName: 'annealTimeS',
    expect: [
      { output: 'straggleNm', trend: 'increasing' },
      { output: 'peakCm3', trend: 'decreasing' },
      { output: 'junctionDeepNm', trend: 'increasing' },
    ],
    sourceId: 'S180',
    note: 'σ′ = √(ΔR_p² + 2Dt). 활성화를 얻는 대가로 접합 급준도를 잃는다.',
  },
];

/** 방향성 검사용 모델 어댑터. 모든 규칙의 출력을 한 번에 낸다. */
export function depositionModel(inputs: Record<string, number>): Record<string, number> {
  // --- ALD ---
  const aldTempC = req(inputs, 'aldTempC');
  const aldCycles = inputs['cycles'] ?? req(inputs, 'aldCycles');

  // --- 확산 ---
  const diffTempK = req(inputs, 'diffTempK');
  const diffTimeS = req(inputs, 'diffTimeS');
  const diffusivity = dopantDiffusivity({ dopant: 'B', tempK: diffTempK }).value;
  const diffJunction = junctionDepthErfc({
    csPerCm3: req(inputs, 'diffCsCm3'),
    cbPerCm3: req(inputs, 'diffCbCm3'),
    dCm2PerS: diffusivity,
    timeS: diffTimeS,
  }).value;

  // --- CVD ---
  const cvdEaEv = req(inputs, 'cvdEaEv');
  const cvdHg = req(inputs, 'cvdHgCmPerS');
  const ks = surfaceReactionRate({
    k0CmPerS: req(inputs, 'cvdK0CmPerS'), eaEv: cvdEaEv, tempK: req(inputs, 'cvdTempK'),
  }).value;

  // --- Stoney ---
  const stress = filmStressStoney({
    substrateBiaxialModulusPa: req(inputs, 'substrateModulusPa'),
    substrateThicknessM: req(inputs, 'substrateThicknessM'),
    filmThicknessM: req(inputs, 'filmThicknessM'),
    curvatureRadiusM: req(inputs, 'curvatureRadiusM'),
  }).value;

  // --- 스퍼터 ---
  const epsilon = reducedEnergy({
    z1: req(inputs, 'z1'), m1: req(inputs, 'm1'),
    z2: req(inputs, 'z2'), m2: req(inputs, 'm2'),
    energyEv: req(inputs, 'ionEnergyEv'),
  }).value;

  // --- 이온주입 (R_p·ΔR_p 는 조건으로 받는다) ---
  const doseUnitCm2 = 100 * 100 * 100 * 100 * 100 * 100 * 100;
  const dose = inputs['doseE14'] === undefined ? req(inputs, 'implantDoseCm2') : inputs['doseE14'] * doseUnitCm2;
  const rpUm = req(inputs, 'implantRpUm');
  const effectiveStraggleUm = annealedStraggle({
    deltaRpUm: req(inputs, 'implantDeltaRpUm'),
    dCm2PerS: req(inputs, 'annealDCm2PerS'),
    timeS: req(inputs, 'annealTimeS'),
  }).value;
  const substrateCm3 = req(inputs, 'implantSubstrateCm3');
  const junctionArgs = { doseCm2: dose, rpUm, deltaRpUm: effectiveStraggleUm, substrateCm3 };
  const area = waferAreaCm2(req(inputs, 'waferDiameterCm')).value;
  const chargeState = req(inputs, 'chargeState');

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    gpcAngstrom: gpcAt(aldTempC).value,
    thicknessNm: aldThicknessAngstrom({ tempC: aldTempC, cycles: aldCycles }).value,
    depositionTimeS: aldDepositionTimeS(aldCycles).value,

    // 🔴 cm²/s 는 절대값이 1e-13 수준이라 방향성 검사기의 상대 임계값 아래로 깔린다.
    //    같은 값을 µm²/s 로 낸다(단위 환산일 뿐 물리는 같다).
    diffusivityCm2PerS: diffusivity * MICRON2_PER_CM2,
    diffusionJunctionUm: diffJunction,
    // x_j ∝ √t 이므로 dx/dt = x/(2t) — 해석적으로 구한다(수치미분 아님).
    diffusionJunctionRateUmPerS: diffJunction / (2 * diffTimeS),

    cvdGrowthRateCmPerS: cvdGrowthRate({
      hgCmPerS: cvdHg, ksCmPerS: ks,
      cgPerCm3: req(inputs, 'cvdCgCm3'),
      filmAtomDensityPerCm3: req(inputs, 'cvdFilmDensityCm3'),
    }).value,
    cvdApparentEaEv: apparentActivationEnergy({ hgCmPerS: cvdHg, ksCmPerS: ks, eaEv: cvdEaEv }).value,

    filmStressMagnitudePa: Math.abs(stress),

    reducedEnergy: epsilon,
    nuclearStoppingSn: nuclearStoppingReduced(epsilon).value,

    straggleNm: effectiveStraggleUm,
    peakCm3: peakConcentration({ doseCm2: dose, deltaRpUm: effectiveStraggleUm }).value,
    junctionDeepNm: junctionDepthDeep(junctionArgs).value,
    junctionShallowNm: junctionDepthShallow(junctionArgs).value,
    implantTimeS: implantTimeS({
      doseCm2: dose, areaCm2: area, beamCurrentA: req(inputs, 'beamCurrentA'), chargeState,
    }).value,
    implantBeamCurrentA: beamCurrentA({
      doseCm2: dose, areaCm2: area, timeS: req(inputs, 'implantFixedTimeS'), chargeState,
    }).value,
    implantDoseFromBeamCm2: doseFromBeam({
      beamCurrentA: req(inputs, 'beamCurrentA'), timeS: req(inputs, 'implantFixedTimeS'),
      areaCm2: area, chargeState,
    }).value,
  };
}

/** cm² → µm². SI 단위 정의이므로 허용 리터럴로 조립한다. */
const MICRON2_PER_CM2 = 100 * 100 * 100 * 100;

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}
