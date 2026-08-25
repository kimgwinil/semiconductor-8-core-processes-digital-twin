import { assertWithin, quantity, withSource, type Quantity } from '../../contract';

/**
 * 이온주입 — **물리층. 합성 계수 0건.**
 *
 * 식 출처: **S180**(Tuttle, *EE 432/532 Ion Implantation Examples*, Iowa State) ·
 *          **S181**(Chu, *AP6120 Ch.9 Ion Implantation*, CityU).
 * 골든값: 원장 **R150 · R151 · R152 · R153** · 정착점 **R154**.
 *
 * 🔴 **R_p·ΔR_p 는 룩업하지 않는다. 필수 입력 인자로 받는다.**(DEV 팀장 판정 2026-08-20)
 *    자유 라이선스 range 표가 존재하지 않는다 — 공개 R_p 표는 ①Gibbons 1975(절판·접근제한)
 *    ②SRIM 파생(비상업 라이선스 · S191 ⛔) ③유료 저널, 셋뿐이다. 대학 강의자료가 예외 없이
 *    「그래프에서 읽어 R_p ≈ … 로 주고 시작」하는 이유가 이것이며, **문헌이 채택한 방식을 그대로 따른다.**
 *    → 에너지별 표를 지어내지 않는다. 표가 조달되면 `projectedRange()` 자리에 채운다.
 *
 * 🔴 **「음수 근은 버린다」고 쓰지 않는다.** S180 Example 1 의 해당 서술은 문헌 오류다
 *    (0.24 − √2·0.063·√(ln 315) = **+0.026 µm** 로 양수다). **얕은 접합도 실재한다.**
 */

const NON_NEGATIVE: [number, number] = [0, Number.POSITIVE_INFINITY];

/** µm → cm. SI 단위 정의이므로 허용 리터럴로 조립한다. */
const CM_PER_MICRON = 1 / (100 * 100);

/** 기본전하. 2019 SI 재정의로 정확값이며, S181 식 9.10 이 이 상수를 쓴다. */
const ELEMENTARY_CHARGE_C = withSource(1.602176634e-19, 'C', 'S181');

/**
 * 정착점(anchor) — 원장 **R154 · S181 Table 9.1**. ¹¹B⁺ 100 keV → Si(ρ 2.33).
 * 🔴 **이 한 점만 실측 인용값**이다. 다른 에너지·재료로 확장하지 않는다.
 */
export const B_100KEV_INTO_SI = {
  rpAngstrom: withSource(2968, 'Å', 'S181').value,
  straggleAngstrom: withSource(735, 'Å', 'S181').value,
} as const;

/**
 * ⛔ **미조달 인터페이스** — 에너지별 투영비정 R_p.
 * 조달되면 여기에 표를 채운다. 그때까지 호출부는 R_p 를 조건으로 받아야 한다.
 */
export function projectedRange(): never {
  throw new Error(
    '[미조달] 이온·에너지별 R_p 표 — 자유 라이선스 공개 표가 존재하지 않는다. ' +
    'S192(Gibbons 1975) 접근 실패 · S193 HTTP 403 · S191(SRIM) 비상업 라이선스로 사용 불가. ' +
    '→ R_p 는 문제 조건으로 제시받아 `peakConcentration()`·`junctionDepthDeep()` 에 직접 넘겨라. ' +
    `정착점 1건만 상수로 있다: B 100 keV → Si, R_p=${B_100KEV_INTO_SI.rpAngstrom} Å.`,
  );
}

/** ⛔ 미조달 인터페이스 — 에너지별 종방향 표준편차 ΔR_p. `projectedRange()` 와 같은 사유. */
export function rangeStraggle(): never {
  throw new Error(
    '[미조달] 이온·에너지별 ΔR_p 표 — `projectedRange()` 와 같은 사유(S191·S192·S193). ' +
    `정착점 1건: B 100 keV → Si, σ_p=${B_100KEV_INTO_SI.straggleAngstrom} Å.`,
  );
}

/** 피크 농도 N_p = Φ / (√(2π)·ΔR_p). S181 식 9.7. */
export function peakConcentration(args: { doseCm2: number; deltaRpUm: number }): Quantity {
  assertWithin('doseCm2', args.doseCm2, NON_NEGATIVE, 'cm⁻²');
  if (!(args.deltaRpUm > 0)) throw new Error('[S181] ΔR_p 는 0보다 커야 한다.');
  const deltaRpCm = args.deltaRpUm * CM_PER_MICRON;
  return quantity(args.doseCm2 / (Math.sqrt(2 * Math.PI) * deltaRpCm), {
    modelId: 'deposition.implant.peak',
    unit: 'cm⁻³',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
    assumptions: ['R_p·ΔR_p 는 문제 조건으로 제시된 값이다 — 룩업표를 쓰지 않는다'],
  });
}

/** 주입 직후 종방향 분포 n(x) = N_p·exp(−(x−R_p)²/(2ΔR_p²)). S181 식 9.6 형태. */
export function implantProfile(args: {
  doseCm2: number; rpUm: number; deltaRpUm: number; depthUm: number;
}): Quantity {
  const peak = peakConcentration({ doseCm2: args.doseCm2, deltaRpUm: args.deltaRpUm }).value;
  const d = args.depthUm - args.rpUm;
  const value = peak * Math.exp(-(d * d) / (2 * args.deltaRpUm * args.deltaRpUm));
  return quantity(value, {
    modelId: 'deposition.implant.profile',
    unit: 'cm⁻³',
    sourceId: 'S181',
    validRange: [0, peak],
  });
}

/** 접합 반폭 √2·ΔR_p·√(ln(N_p/N_B)). 깊은 근·얕은 근이 공유하는 항이다. */
function junctionHalfWidthUm(args: { doseCm2: number; deltaRpUm: number; substrateCm3: number }): number {
  const peak = peakConcentration({ doseCm2: args.doseCm2, deltaRpUm: args.deltaRpUm }).value;
  if (!(args.substrateCm3 > 0) || !(peak > args.substrateCm3)) {
    throw new Error('[S180] 접합은 N_p > N_B > 0 일 때만 존재한다.');
  }
  return Math.sqrt(2) * args.deltaRpUm * Math.sqrt(Math.log(peak / args.substrateCm3));
}

/** 깊은 쪽 접합깊이 x_j = R_p + √2·ΔR_p·√(ln(N_p/N_B)). S180. */
export function junctionDepthDeep(args: {
  doseCm2: number; rpUm: number; deltaRpUm: number; substrateCm3: number;
}): Quantity {
  const half = junctionHalfWidthUm(args);
  return quantity(args.rpUm + half, {
    modelId: 'deposition.implant.junctionDeep',
    unit: 'µm',
    sourceId: 'S180',
    validRange: NON_NEGATIVE,
    assumptions: ['가우시안 프로파일 · 어닐 전(또는 어닐 후 σ′ 로 치환한 값)'],
  });
}

/**
 * 얕은 쪽 접합깊이 x_j = R_p − √2·ΔR_p·√(ln(N_p/N_B)). S180.
 * 🔴 **버리는 근이 아니다** — 표면과 피크 사이에도 실제 접합이 하나 더 있다.
 *    값이 음수로 나오면 「접합이 없다」가 아니라 **도핑 영역이 표면까지 닿았다**는 뜻이며,
 *    `outOfRange` 로 표시된다.
 */
export function junctionDepthShallow(args: {
  doseCm2: number; rpUm: number; deltaRpUm: number; substrateCm3: number;
}): Quantity {
  const half = junctionHalfWidthUm(args);
  return quantity(args.rpUm - half, {
    modelId: 'deposition.implant.junctionShallow',
    unit: 'µm',
    sourceId: 'S180',
    validRange: NON_NEGATIVE,
    assumptions: [
      '얕은 근도 실재하는 접합이다. 음수면 도핑 영역이 표면까지 닿은 것이다(접합 소실)',
    ],
  });
}

/** 어닐 후 유효 straggle σ′ = √(ΔR_p² + 2Dt). 확산이 분포를 넓힌다. */
export function annealedStraggle(args: {
  deltaRpUm: number; dCm2PerS: number; timeS: number;
}): Quantity {
  assertWithin('dCm2PerS', args.dCm2PerS, NON_NEGATIVE, 'cm²/s');
  assertWithin('timeS', args.timeS, NON_NEGATIVE, 's');
  const deltaRpCm = args.deltaRpUm * CM_PER_MICRON;
  const value = Math.sqrt(deltaRpCm * deltaRpCm + 2 * args.dCm2PerS * args.timeS);
  return quantity(value / CM_PER_MICRON, {
    modelId: 'deposition.implant.annealedStraggle',
    unit: 'µm',
    sourceId: 'S180',
    validRange: NON_NEGATIVE,
    assumptions: ['가우시안 ⊛ 가우시안 = 가우시안. 분산이 2Dt 만큼 더해진다'],
  });
}

/** 웨이퍼 면적 A = π(d/2)². */
export function waferAreaCm2(diameterCm: number): Quantity {
  assertWithin('diameterCm', diameterCm, NON_NEGATIVE, 'cm');
  const r = diameterCm / 2;
  return quantity(Math.PI * r * r, {
    modelId: 'deposition.implant.waferArea',
    unit: 'cm²',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
  });
}

/** 도즈 Φ = I·t/(q·A). S181 식 9.10 (전류 일정 구간). */
export function doseFromBeam(args: {
  beamCurrentA: number; timeS: number; areaCm2: number; chargeState: number;
}): Quantity {
  assertWithin('beamCurrentA', args.beamCurrentA, NON_NEGATIVE, 'A');
  assertWithin('timeS', args.timeS, NON_NEGATIVE, 's');
  if (!(args.areaCm2 > 0)) throw new Error('[S181] 웨이퍼 면적은 0보다 커야 한다.');
  if (!(args.chargeState > 0)) throw new Error('[S181] 전하수는 1 이상이다.');
  const value =
    (args.beamCurrentA * args.timeS) /
    (args.chargeState * ELEMENTARY_CHARGE_C.value * args.areaCm2);
  return quantity(value, {
    modelId: 'deposition.implant.dose',
    unit: 'cm⁻²',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
  });
}

/** 총 이온수 = Φ·A. */
export function totalIons(args: { doseCm2: number; areaCm2: number }): Quantity {
  return quantity(args.doseCm2 * args.areaCm2, {
    modelId: 'deposition.implant.totalIons',
    unit: 'ions',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
  });
}

/** 빔 전류 역산 I = Φ·q·A/t. */
export function beamCurrentA(args: {
  doseCm2: number; areaCm2: number; timeS: number; chargeState: number;
}): Quantity {
  if (!(args.timeS > 0)) throw new Error('[S181] 주입 시간은 0보다 커야 한다.');
  const value =
    (args.doseCm2 * args.chargeState * ELEMENTARY_CHARGE_C.value * args.areaCm2) / args.timeS;
  return quantity(value, {
    modelId: 'deposition.implant.beamCurrent',
    unit: 'A',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
  });
}

/** 주입 시간 역산 t = Φ·q·A/I. */
export function implantTimeS(args: {
  doseCm2: number; areaCm2: number; beamCurrentA: number; chargeState: number;
}): Quantity {
  if (!(args.beamCurrentA > 0)) throw new Error('[S181] 빔 전류는 0보다 커야 한다.');
  const value =
    (args.doseCm2 * args.chargeState * ELEMENTARY_CHARGE_C.value * args.areaCm2) / args.beamCurrentA;
  return quantity(value, {
    modelId: 'deposition.implant.time',
    unit: 's',
    sourceId: 'S181',
    validRange: NON_NEGATIVE,
  });
}

/**
 * ⛔ **미구현 인터페이스** — 2차원(횡방향) 분포 n(x,y) (S181 식 9.8).
 * 원장에 σ⊥(횡방향 straggle) 표가 없을 뿐 아니라, 식 9.8 의 규격화(마스크 모서리 적분 형태 vs
 * 점원 형태)에 따라 **차원이 달라진다.** 원문 형태를 확정하기 전에는 넣지 않는다 —
 * 차원이 틀린 식을 화면에 띄우는 것이 값이 없는 것보다 나쁘다.
 */
export function lateralProfile(): never {
  throw new Error(
    '[미구현] 횡방향 2차원 분포 — σ⊥ 표 미확보 + S181 식 9.8 의 규격화 형태 미확정. ' +
    '마스크 모서리 판정에 쓰지 마라.',
  );
}
