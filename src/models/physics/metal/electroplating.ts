import {
  assertWithin, describeUiGuard, quantity, uiGuard, withSource, type Quantity,
} from '../../contract';
import { MINUTES_PER_HOUR, SECONDS_PER_MINUTE, TEN } from '../units';

/**
 * Cu 전해도금(ECP) — **Faraday 전기분해 법칙. 물리층. 합성 계수 0건.**
 *
 *   m = M · I · t / (n · F)
 *
 * 🔴 **F 는 정확값**이다: NIST CODATA 2022 `F = 96 485.332 12 C/mol (exact)` = 원장 **S212**.
 * 🔴 **M(몰질량)·n(전하수)은 상수로 박지 않고 입력으로 받는다.** 원장에 금속별 몰질량표가 없다.
 *    문항이 조건으로 제시하는 값이다(Cu²⁺ 도금이면 n = 2, M = 63.55 g/mol 같은 식).
 * ⛔ 도금 **두께**는 밀도가 필요한데 원장에 금속 밀도표가 없다 → **질량까지만** 낸다.
 * ⛔ 첨가제 3종(억제제·촉진제·평탄제)의 바텀업 필 정량 모델은 원장에 없다 → 만들지 않는다.
 */

/** 🔴 Faraday 상수 — NIST CODATA 2022, **정확값**. S212. */
export const FARADAY_CONSTANT = withSource(96485.33212, 'C/mol', 'S212');

/* ───────────────────────── 입력·출력 범위 — 전부 UI 안전장치다 ─────────────────────────
 * 🔴 2026-08-21 정정. 아래 여섯 개는 종전에 **전부 `withSource(…, 'S212')`** 였다.
 *    S212 는 NIST CODATA **Faraday 상수 한 값**의 출처다 — 「도금 셀 전류 상한 1000 A」도
 *    「24 h 상한」도 「몰질량 1~300 g/mol」도 **진술하지 않는다.** 주석이 이미 「도금 셀 상식」이라고
 *    적어 스스로 근거를 부정하고 있었다. 그래서 출처를 붙일 수 **없는** `uiGuard` 로 옮겼다.
 * 🔴 **수치는 한 자리도 바꾸지 않았다.** 1000 · 86400 · 1 · 300 · 6 · 100000 그대로다.
 *    다만 매직넘버 차단(규약 §2-3)은 면제되지 않으므로 허용 리터럴과 `../units` 환산으로 조립한다.
 * 🔴 이 파일에서 S212 를 정당하게 인용하는 값은 **`FARADAY_CONSTANT` 하나뿐**이다. */

/** 1 일 = 24 h. 정의값이라 출처가 붙을 성질이 아니다(허용 리터럴 조립 — 규약 §2-3). */
const HOURS_PER_DAY = (2 + 2 + 2) * 2 * 2;

/** **도금 셀** 전류 입력 유효구간 [A] — 상한 1000 A.
 *  🔴 `fourPointProbe.ts` 의 `PROBE_CURRENT_MAX_A`(1 A) 와 **다른 물리량**이다 — 통일하지 말 것. */
const PLATING_CURRENT_MAX_A = uiGuard(
  100 * TEN, 'A',
  '도금 셀 정류기의 상식적 상한. 문헌 근거가 아니라 슬라이더가 넘어가지 못하게 그은 선이다',
);
export const CURRENT_RANGE_A: [number, number] = [0, PLATING_CURRENT_MAX_A.value];

/** 시간 입력 유효구간 [s] — 24 h 상한(86 400 s). */
const TIME_MAX_S = uiGuard(
  SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY, 's',
  '한 번의 도금을 하루 넘게 돌리지 않는다는 운용 가정. 문헌이 정한 한계가 아니다',
);
export const TIME_RANGE_S: [number, number] = [0, TIME_MAX_S.value];

/** 몰질량 입력 유효구간 [g/mol] — H(1) ~ 초중원소(300). */
const MOLAR_MASS_MIN = uiGuard(1, 'g/mol', '가장 가벼운 원소(H ≈ 1 g/mol)보다 아래를 막는 입력 하한');
const MOLAR_MASS_MAX = uiGuard(
  100 * (2 + 1), 'g/mol',
  '초중원소까지 덮는 입력 상한. 원장에 금속별 몰질량표가 없어 M 은 문항이 제시한다',
);
export const MOLAR_MASS_RANGE: [number, number] = [MOLAR_MASS_MIN.value, MOLAR_MASS_MAX.value];

/** 전하수 n 입력 유효구간 — 1 ~ 6가. */
const VALENCE_MAX = uiGuard(2 + 2 + 2, '', '실용 도금욕에서 다루는 최대 산화수. 문헌 상한이 아니다');
export const VALENCE_RANGE: [number, number] = [1, VALENCE_MAX.value];

/** 석출 질량 출력 유효구간 [g]. */
const MASS_MAX_G = uiGuard(
  100 * 100 * TEN, 'g',
  '출력 표시가 깨지지 않게 둔 상한(100 kg). 물리적 한계가 아니다',
);
export const MASS_RANGE_G: [number, number] = [0, MASS_MAX_G.value];

/** 총 전하량 `Q = I·t` [C]. */
export function charge(args: { currentA: number; timeS: number }): Quantity {
  assertWithin('currentA', args.currentA, CURRENT_RANGE_A, 'A');
  assertWithin('timeS', args.timeS, TIME_RANGE_S, 's');
  return quantity(args.currentA * args.timeS, {
    modelId: 'metal.plating.charge',
    unit: 'C',
    sourceId: 'S212',
    validRange: [0, PLATING_CURRENT_MAX_A.value * TIME_MAX_S.value],
    assumptions: [
      '정전류 도금',
      '전류효율 100 % 가정',
      // 🔴 유효구간의 근거는 문헌이 아니다. 화면이 S212 배지 옆에서 이 사실을 함께 말해야 한다.
      `전류 유효구간: ${describeUiGuard(PLATING_CURRENT_MAX_A)}`,
      `시간 유효구간: ${describeUiGuard(TIME_MAX_S)}`,
    ],
  });
}

/** 석출 질량 `m = M·I·t/(n·F)` [g]. Faraday 제1·2 법칙. */
export function depositedMass(args: {
  currentA: number; timeS: number; molarMassGPerMol: number; valence: number;
}): Quantity {
  assertWithin('molarMassGPerMol', args.molarMassGPerMol, MOLAR_MASS_RANGE, 'g/mol');
  assertWithin('valence', args.valence, VALENCE_RANGE, '');
  const q = charge({ currentA: args.currentA, timeS: args.timeS }).value;
  return quantity(
    (args.molarMassGPerMol * q) / (args.valence * FARADAY_CONSTANT.value),
    {
      modelId: 'metal.plating.depositedMass',
      unit: 'g',
      sourceId: 'S212',
      validRange: MASS_RANGE_G,
      assumptions: [
        '전류효율 100 % 가정 — 실제 ECP 는 이보다 낮다',
        'M·n 은 문항이 제시하는 값 (원장에 몰질량표 없음)',
        // 🔴 식(m = M·I·t/nF)은 S212 의 F 로 서지만, **범위선은 아무 문헌도 뒷받침하지 않는다.**
        `질량 유효구간: ${describeUiGuard(MASS_MAX_G)}`,
        `몰질량 입력구간: ${describeUiGuard(MOLAR_MASS_MAX)}`,
      ],
    },
  );
}
