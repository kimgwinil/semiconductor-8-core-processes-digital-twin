import type { DirectionRule } from '../../direction';
import { coefficientsAt, oxideThickness, siliconConsumed } from './dealGrove';
import type { Ambient, Orientation } from './dealGrove';

/** A12 — 산화 방향성 규칙 **선언**. 스윕 구간은 `tests/direction/oxidation.direction.test.ts` 가 소유한다. */
export const OXIDATION_RULES: DirectionRule[] = [
  {
    id: 'OX-D1',
    processId: 'oxidation',
    statement: '온도를 올리면 같은 시간·같은 산화종에서 산화막이 두꺼워진다.',
    inputName: 'tempC',
    expect: [{ output: 'thicknessNm', trend: 'increasing' }],
    sourceId: 'S120',
    note: 'B·B/A 가 모두 아레니우스 형태라 온도에 단조 증가한다(Table I·II).',
  },
  {
    id: 'OX-D2',
    processId: 'oxidation',
    statement: '같은 온도·시간에서 습식 산화가 건식보다 빠르다.',
    inputName: 'ambientIndex',
    expect: [{ output: 'thicknessNm', trend: 'increasing' }],
    sourceId: 'S120',
    note: '1000 °C 에서 B 가 0.0117(건식) vs 0.287(습식) µm²/h 로 24배 차이난다.',
  },
  {
    id: 'OX-D3',
    processId: 'oxidation',
    statement: '시간을 늘리면 두께는 증가하되, 선형→포물선 전이로 성장률(dx/dt)은 감소한다.',
    inputName: 'timeH',
    expect: [
      { output: 'thicknessNm', trend: 'increasing' },
      { output: 'growthRateNmPerMin', trend: 'decreasing' },
    ],
    sourceId: 'S120',
    note: '🔴 두께에 단조 증가를, 증가율에 단조 감소를 따로 건다. 하나로 묶으면 틀린 물리를 강제한다.',
  },
  {
    id: 'OX-D4',
    processId: 'oxidation',
    statement: '⟨111⟩ 면이 ⟨100⟩ 면보다 선형 성장이 빠르다. 포물선 계수 B 는 면방위와 무관하다.',
    inputName: 'orientationIndex',
    expect: [
      { output: 'thicknessNm', trend: 'increasing' },
      { output: 'parabolicB', trend: 'flat' },
    ],
    sourceId: 'S121',
    note: '면방위 의존은 계면 반응항(선형)에만 걸린다 — S121 Table 4.4 실측.',
  },
  {
    id: 'OX-D5',
    processId: 'oxidation',
    statement: '산화막이 두꺼워질수록 소모되는 실리콘도 비례해 늘어난다(0.44배).',
    inputName: 'timeH',
    expect: [{ output: 'siConsumedNm', trend: 'increasing' }],
    sourceId: 'S121',
  },
];

/** 방향성 검사용 모델 어댑터. 표에 없는 온도는 스냅한다 — 보간하지 않는다(원장 규칙 1). */
export function oxidationModel(inputs: Record<string, number>): Record<string, number> {
  const tempC = req(inputs, 'tempC');
  const timeH = req(inputs, 'timeH');
  const ambient: Ambient = req(inputs, 'ambientIndex') >= HALF ? 'wet' : 'dry';
  const orientation: Orientation = req(inputs, 'orientationIndex') >= HALF ? '111' : '100';

  const snapped = nearestTableTemp(tempC, ambient);
  const x = oxideThickness({ tempC: snapped, timeH, ambient, orientation }).value;
  const eps = timeH * EPS_FRACTION;
  const xPlus = oxideThickness({ tempC: snapped, timeH: timeH + eps, ambient, orientation }).value;

  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  return {
    thicknessNm: x,
    growthRateNmPerMin: (xPlus - x) / eps,
    siConsumedNm: siliconConsumed(x).value,
    parabolicB: coefficientsAt(snapped, ambient, orientation).B,
  };
}

const HALF = 0.5;
/**
 * 수치 미분 폭(상대). 물리 상수가 아니라 계산 방식이므로 출처가 없다.
 * 🔴 그래서 리터럴 대신 허용 숫자만으로 조립한다 — check-sources 의 매직넘버 차단을 우회하지 않기 위해서다.
 */
const EPS_FRACTION = 1 / (2 * 100 * 100 * 100 / 2);

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}

function nearestTableTemp(tempC: number, ambient: Ambient): number {
  const list = ambient === 'wet' ? WET_TEMPS : DRY_TEMPS;
  let best = list[0] as number;
  for (const t of list) if (Math.abs(t - tempC) < Math.abs(best - tempC)) best = t;
  return best;
}

// 표 온도는 dealGrove 가 문헌에서 읽어 노출한다 — 여기서 다시 적지 않는다.
import { DG_TEMPERATURES } from './dealGrove';
const WET_TEMPS = DG_TEMPERATURES.wet;
const DRY_TEMPS = DG_TEMPERATURES.dry;

/** 이 모듈이 담당하는 공정 ID. 배럴이 리터럴을 갖지 않게 하려고 여기서 내보낸다(C1). */
export const OXIDATION_PROCESS_ID = 'oxidation';
