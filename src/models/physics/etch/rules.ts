import type { DirectionRule } from '../../direction';
import {
  kohEtchRate, kohOrientationSelectivity, kohAnisotropyDegree, wetArrheniusRate,
} from './wetEtch';
import {
  clausingTransmission, deepEtchAverageRate, deepEtchDepth, maskSelectivity,
  selfBiasVoltageRatio, MAX_MEASURED_DEPTH_UM,
} from './dryEtch';
import { debyeLength, electronPlasmaFrequency } from './plasma';
import { TEN } from '../units';

/** `index.ts` 가 카탈로그 ID 리터럴을 또 박지 않도록 여기서 한 번만 선언한다(C1). */
export const ETCH_PROCESS_ID = 'etch';

/**
 * A12 — 식각 방향성 규칙 **선언**. 스윕 구간은 `tests/direction/etch.direction.test.ts` 가 소유한다.
 *
 * 🔴 **압력 vs 식각률의 최댓값(비단조)은 선언하지 않았다.** 물리적으로 실재하지만
 *    원장에 압력–식각률 곡선이 없다(관련: M-13 Mogab 로딩효과 페이월). 계수를 지어내면 A15 위반이다.
 *    대신 **문헌이 실제로 측정한 비단조** — KOH 농도에 대한 (110)/(100) 면방위 선택비의 40 wt% 최댓값
 *    (S166 Appendix Table 1) — 을 `non-monotonic` 으로 건다.
 */
export const ETCH_RULES: DirectionRule[] = [
  {
    id: 'ET-D10',
    processId: 'etch',
    statement: '바이어스 파워를 올리면 수직 식각 성분이 커져 이방성도가 증가한다.',
    inputName: 'biasW',
    expect: [{ output: 'anisotropy', trend: 'increasing' }],
    sourceId: 'S162',
    scope: 'lab',
    note: '실습 응답식 R_vert = 150 + 0.60·P_b, A = 1 − R_lat/R_vert의 조합이다.',
  },
  {
    id: 'ET-D1',
    processId: 'etch',
    statement: '용액 온도를 올리면 습식 식각속도가 아레니우스 형태로 빨라진다.',
    inputName: 'tempC',
    expect: [{ output: 'wetRateUmPerH', trend: 'increasing' }],
    sourceId: 'S164',
    note: 'r = r₀·exp(−E_a/kT). NaOH 50 % 는 E_a = 0.68 eV 라 28→80 °C 에서 두 자릿수 배로 커진다.',
  },
  {
    id: 'ET-D2',
    processId: 'etch',
    statement: 'KOH 농도를 30 → 50 wt% 로 올리면 (100)·(110) 두 면의 식각속도가 모두 느려진다.',
    inputName: 'kohWtPercent',
    expect: [
      { output: 'koh100RateUmPerMin', trend: 'decreasing' },
      { output: 'koh110RateUmPerMin', trend: 'decreasing' },
    ],
    sourceId: 'S166',
    note: '70 °C 실측: (100) 0.797→0.539, (110) 1.455→0.870 µm/min.',
  },
  {
    id: 'ET-D3',
    processId: 'etch',
    statement:
      '🔴 (110)/(100) 면방위 선택비는 농도에 단조롭지 않다 — 40 wt% 부근에서 최대가 되고 다시 떨어진다.',
    inputName: 'kohWtPercent',
    expect: [{ output: 'koh110over100', trend: 'non-monotonic' }],
    sourceId: 'S166',
    note:
      '실측 비: 30 wt% 1.83 → 40 wt% 2.16 → 50 wt% 1.61. 두 면의 농도 의존성이 다르기 때문이며, ' +
      '단조로 걸면 문헌이 실제로 측정한 최댓값을 지운다.',
  },
  {
    id: 'ET-D4',
    processId: 'etch',
    statement: 'KOH 농도를 올리면 (111) 대비 이방성도가 조금씩 떨어진다.',
    inputName: 'kohWtPercent',
    expect: [{ output: 'kohAnisotropy', trend: 'decreasing' }],
    sourceId: 'S166',
    note: 'A = 1 − r(111)/r(100). 70 °C 실측으로 0.9937 → 0.9850 → 0.9833.',
  },
  {
    id: 'ET-D5',
    processId: 'etch',
    statement: '종횡비가 커질수록 개구 전달확률이 떨어진다 — 깊은 구조가 느려지는 ARDE 의 뿌리다.',
    inputName: 'aspectRatio',
    expect: [{ output: 'clausingK', trend: 'decreasing' }],
    sourceId: 'S162',
    note: 'K ≈ ln(α)/α. 원문이 α > 10 에서만 유효(오차 <4.4 %)라고 명시했으므로 그 구간만 스윕한다.',
  },
  {
    id: 'ET-D6',
    processId: 'etch',
    statement: '사이클 수를 늘리면 깊이는 비례해 깊어지지만, 평균 식각속도는 레시피가 정하므로 변하지 않는다.',
    inputName: 'cycles',
    expect: [
      { output: 'boschDepthUm', trend: 'increasing' },
      { output: 'boschAvgRateUmPerMin', trend: 'flat' },
    ],
    sourceId: 'S160',
    note: '30 사이클 12분 30초 31.2 µm → 1.04 µm/cycle · 2.50 µm/min. 속도는 사이클 수의 함수가 아니다.',
  },
  {
    id: 'ET-D7',
    processId: 'etch',
    statement: '같은 깊이를 얻는 데 마스크가 더 많이 깎일수록 마스크 선택비는 낮아진다.',
    inputName: 'maskConsumedUm',
    expect: [{ output: 'maskSelectivityRatio', trend: 'decreasing' }],
    sourceId: 'S161',
    note: 'S = 깊이/마스크 소모. 141 µm / 2 µm = 71 이 문헌 실측점이다.',
  },
  {
    id: 'ET-D8',
    processId: 'etch',
    statement: '플라즈마 밀도를 올리면 드바이 길이는 짧아지고 플라즈마 주파수는 빨라진다 — 서로 반대로 움직인다.',
    inputName: 'neM3',
    expect: [
      { output: 'debyeLengthMm', trend: 'decreasing' },
      { output: 'plasmaFreqPerS', trend: 'increasing' },
    ],
    sourceId: 'S165',
    note: 'λ_D ∝ n^(−1/2), ω_pe ∝ n^(+1/2). 같은 입력이 두 출력을 반대로 끈다.',
  },
  {
    id: 'ET-D9',
    processId: 'etch',
    statement: '접지전극이 구동전극보다 넓을수록 구동전극에 걸리는 셀프바이어스 비가 급격히 커진다.',
    inputName: 'areaRatio',
    expect: [{ output: 'selfBiasRatio', trend: 'increasing' }],
    sourceId: 'S167',
    note: '🔴 V₁/V₂ = (A₂/A₁)^4 는 이상화 한계(등급 B). 원문이 실기에서 지수가 더 작다고 경고한다.',
  },
];

/** 방향성 검사용 모델 어댑터. 범위 밖 입력은 `assertWithin` 이 정지시키고 검사기가 건너뛴다. */
export function etchModel(inputs: Record<string, number>): Record<string, number> {
  const tempC = req(inputs, 'tempC');
  const kohWtPercent = req(inputs, 'kohWtPercent');
  const aspectRatio = req(inputs, 'aspectRatio');
  const cycles = req(inputs, 'cycles');
  const maskConsumedUm = req(inputs, 'maskConsumedUm');
  const neM3 = req(inputs, 'neM3');
  const teEv = req(inputs, 'teEv');
  const areaRatio = req(inputs, 'areaRatio');

  return {
    anisotropy: inputs['biasW'] === undefined ? 0 : 1
      - (2 * 2 * TEN) / (100 + 100 / 2 + ((2 + 2 + 2) / TEN) * inputs['biasW']),
    wetRateUmPerH: wetArrheniusRate({ etchant: 'NaOH50', tempC }).value,
    koh100RateUmPerMin: kohEtchRate({ wtPercent: kohWtPercent, orientation: '100' }).value,
    koh110RateUmPerMin: kohEtchRate({ wtPercent: kohWtPercent, orientation: '110' }).value,
    koh110over100: kohOrientationSelectivity({ wtPercent: kohWtPercent, fast: '110', slow: '100' }).value,
    kohAnisotropy: kohAnisotropyDegree(kohWtPercent).value,
    clausingK: clausingTransmission(aspectRatio).value,
    boschDepthUm: deepEtchDepth({ recipe: 'bosch', cycles }).value,
    boschAvgRateUmPerMin: deepEtchAverageRate('bosch').value,
    maskSelectivityRatio: maskSelectivity({
      depthUm: MAX_MEASURED_DEPTH_UM.value, maskConsumedUm,
    }).value,
    debyeLengthMm: debyeLength({ neM3, teEv }).value,
    plasmaFreqPerS: electronPlasmaFrequency(neM3).value,
    selfBiasRatio: selfBiasVoltageRatio(areaRatio).value,
  };
}

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}
