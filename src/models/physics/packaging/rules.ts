import type { DirectionRule } from '../../direction';
import { junctionTemperature, recommendedTestPowerW } from './thermal';
import { MSL_HOURLY_LEVELS, floorLifeHours, standardSoakHours, type MslLevel } from './msl';
import { DIE_AREA_UNIT_IN2, ballBondShearArea, dieShearRequirementKg } from './bondStrength';
import { elfrFit, elfrPpm, temperatureAccelerationFactor } from './reliability';
import { apparentViscosity, capillaryPressure } from './underfill';
import { shearSpeedClassIndex } from './solderBallShear';

/** 카탈로그 공정 ID. 배럴(index.ts)이 리터럴을 또 박지 않도록 상수로 내보낸다(C1). */
export const PACKAGING_PROCESS_ID = 'packaging';

/**
 * A12 — 패키징 방향성 규칙 **선언**.
 * 스윕 구간·기준값은 `tests/direction/packaging.direction.test.ts` 가 소유한다(규약 §2-4).
 */
export const PACKAGING_RULES: DirectionRule[] = [
  {
    id: 'PKG-D11', processId: 'packaging',
    statement: '시험 가열전력을 올리면 같은 열저항에서 접합온도 상승폭이 선형으로 증가한다.',
    inputName: 'testPowerW', expect: [{ output: 'riseC', trend: 'increasing' }],
    sourceId: 'S247', scope: 'lab',
    note: 'ΔT = θ·P. 실습의 testPowerW 단위 W를 그대로 쓴다.',
  },
  {
    id: 'PKG-D1',
    processId: 'packaging',
    statement: '같은 패키지·같은 주위온도에서 소비전력을 올리면 접합온도가 올라간다.',
    inputName: 'powerW',
    expect: [{ output: 'riseC', trend: 'increasing' }],
    sourceId: 'S247',
    note: 'T_J = T_A + θ_JA·P — JESD51-2A 식 (1)의 역산. 🔴 상한(예: 105 °C)은 표준값이 아니다(M-26).',
  },
  {
    id: 'PKG-D2',
    processId: 'packaging',
    statement:
      '열저항 θ_JA 가 큰 패키지일수록 같은 전력에서 접합온도가 높아지지만, 표준이 권장하는 측정 전력은 오히려 낮아진다.',
    inputName: 'thetaJaCPerW',
    expect: [
      { output: 'riseC', trend: 'increasing' },
      { output: 'recommendedPowerW', trend: 'decreasing' },
    ],
    sourceId: 'S247',
    note: '🔴 상충 규칙. 열이 잘 안 빠지는 패키지에 큰 전력을 걸면 온도 상승폭이 과해 측정이 불안정해진다(JESD51-2A §5.5 Table 2).',
  },
  {
    id: 'PKG-D3',
    processId: 'packaging',
    statement: 'MSL 등급이 올라갈수록(민감할수록) 플로어 라이프도 표준 소킹 시간도 짧아진다.',
    inputName: 'mslHourlyIndex',
    expect: [
      { output: 'floorLifeH', trend: 'decreasing' },
      { output: 'standardSoakH', trend: 'decreasing' },
    ],
    sourceId: 'S248',
    note:
      '🔴 흡습량(wt%)으로 가르지 않는다 — J-STD-020F 에 wt% 판정 기준이 없다(M-25). ' +
      '플로어 라이프가 시간으로 규정된 등급(3·4·5·5a)만 시간축에서 비교한다.',
  },
  {
    id: 'PKG-D4',
    processId: 'packaging',
    statement:
      '다이 면적이 커지면 요구 전단강도가 비례해 커지다가, 64×10⁻⁴ in² 를 넘는 순간 2.5 kg 고정값으로 바뀌면서 직전 비례값보다 오히려 소폭 낮아진다.',
    inputName: 'dieAreaUnits',
    expect: [{ output: 'dieShearRequiredKg', trend: 'non-monotonic' }],
    sourceId: 'S43',
    note:
      '🔴 실재하는 불연속이다. 64×10⁻⁴ in² 에서 비례값은 0.04×64 = 2.56 kg 인데 NOTE 1 의 고정값은 2.5 kg 이다. ' +
      '단조 증가로 걸면 표준에 없는 매끈함을 강요하게 된다.',
  },
  {
    id: 'PKG-D5',
    processId: 'packaging',
    statement: '번인 스트레스 접합온도를 올리면 온도 가속계수 A_T 가 커져 같은 시험시간으로 더 긴 사용시간을 대체한다.',
    inputName: 'stressTempK',
    expect: [
      { output: 'temperatureAF', trend: 'increasing' },
      { output: 'equivalentUseH', trend: 'increasing' },
    ],
    sourceId: 'S54',
    note: 'A_T = exp[(E_aa/k)(1/T_U − 1/T_A)] — JESD74A 식 [1]. 온도는 접합온도이고 켈빈으로 받는다.',
  },
  {
    id: 'PKG-D6',
    processId: 'packaging',
    statement: '번인 시료 수를 늘리면 같은 무고장 결과라도 ELFR 상측 신뢰한계(FIT·ppm)가 낮아진다.',
    inputName: 'sampleSize',
    expect: [
      { output: 'elfrFit', trend: 'decreasing' },
      { output: 'elfrPpm', trend: 'decreasing' },
    ],
    sourceId: 'S54',
    note: 'ELFR(FIT) = 10⁹·χ²/(2·A·N·t_A) — JESD74A 식 [6]. N 이 분모에 있다.',
  },
  {
    id: 'PKG-D7',
    processId: 'packaging',
    statement: '압착 볼 직경이 커지면 전단 면적은 직경의 제곱으로 커진다.',
    inputName: 'ballDiameterUm',
    expect: [{ output: 'ballShearAreaUm2', trend: 'increasing' }],
    sourceId: 'S53',
    note: 'A = πd²/4 — JESD22-B116B §4.3. 🔴 면적만 계산한다. 합격기준은 JESD47 소관이며 미확보다.',
  },
  {
    id: 'PKG-D8',
    processId: 'packaging',
    statement: '언더필 갭이 넓어질수록 모세관 구동압이 낮아진다.',
    inputName: 'gapUm',
    expect: [{ output: 'capillaryPressurePa', trend: 'decreasing' }],
    sourceId: 'S241',
    note: 'Δp = 2σcosθ/h — 갭 h 가 분모에 있다.',
  },
  {
    id: 'PKG-D9',
    processId: 'packaging',
    statement: '언더필은 전단농화 유체다 — 전단속도가 오르면 겉보기 점도가 오른다.',
    inputName: 'shearRatePerS',
    expect: [{ output: 'apparentViscosityPaS', trend: 'increasing' }],
    sourceId: 'S241',
    note: 'η = m·γ̇^(n−1), n = 1.22 > 1. n < 1(전단박화)로 잘못 외우기 쉬운 지점이다.',
  },
  {
    id: 'PKG-D10',
    processId: 'packaging',
    statement:
      '솔더볼 전단속도를 올리면 저속(Condition A) → 표준 미규정 구간 → 고속(Condition B) 으로 시험 조건이 바뀐다.',
    inputName: 'shearSpeedMmPerS',
    expect: [{ output: 'shearSpeedClass', trend: 'increasing' }],
    sourceId: 'S249',
    note:
      '0.1–0.8 mm/s 와 > 50 mm/s 사이는 표준이 규정하지 않았다. ' +
      '🔴 고속 관심사에 저속 시험을 대체하지 않는다(§4.7). 합격기준은 이 표준에 없다(M-27).',
  },
];

/** 방향성 검사용 모델 어댑터. */
export function packagingModel(inputs: Record<string, number>): Record<string, number> {
  const thetaJA = req(inputs, 'thetaJaCPerW');
  const powerW = inputs['testPowerW'] ?? req(inputs, 'powerW');
  const ambientC = req(inputs, 'ambientTempC');
  const areaUnits = req(inputs, 'dieAreaUnits');
  const mslIndex = Math.round(req(inputs, 'mslHourlyIndex'));
  const useTempK = req(inputs, 'useTempK');
  const stressTempK = req(inputs, 'stressTempK');
  const eaaEv = req(inputs, 'activationEnergyEv');
  const sampleSize = req(inputs, 'sampleSize');
  const testHours = req(inputs, 'testHours');
  const chiSquare = req(inputs, 'chiSquare');
  const elfPeriodH = req(inputs, 'earlyLifePeriodH');
  const ballDiameterUm = req(inputs, 'ballDiameterUm');
  const gapUm = req(inputs, 'gapUm');
  const shearRatePerS = req(inputs, 'shearRatePerS');
  const shearSpeedMmPerS = req(inputs, 'shearSpeedMmPerS');

  const level = pickLevel(mslIndex);
  const af = temperatureAccelerationFactor({ activationEnergyEv: eaaEv, tUseK: useTempK, tStressK: stressTempK });
  const fit = elfrFit({ chiSquare, accelerationFactor: af.value, sampleSize, testHours });

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    riseC: junctionTemperature({ tAmbientC: ambientC, thetaJA, powerW }).value,
    recommendedPowerW: recommendedTestPowerW(thetaJA).value,
    floorLifeH: floorLifeHours(level).value,
    standardSoakH: standardSoakHours(level).value,
    dieShearRequiredKg: dieShearRequirementKg({
      areaIn2: areaUnits * DIE_AREA_UNIT_IN2,
      condition: '1.0X',
    }).value,
    temperatureAF: af.value,
    equivalentUseH: af.value * testHours,
    elfrFit: fit.value,
    elfrPpm: elfrPpm({ fit: fit.value, earlyLifePeriodH: elfPeriodH }).value,
    ballShearAreaUm2: ballBondShearArea(ballDiameterUm).value,
    capillaryPressurePa: capillaryPressure({ gapUm, substrate: 'FR4' }).value,
    apparentViscosityPaS: apparentViscosity(shearRatePerS).value,
    shearSpeedClass: shearSpeedClassIndex(shearSpeedMmPerS).value,
  };
}

function pickLevel(index: number): MslLevel {
  const list = MSL_HOURLY_LEVELS;
  const clamped = Math.min(Math.max(index, 0), list.length - 1);
  return list[clamped] as MslLevel;
}

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}
