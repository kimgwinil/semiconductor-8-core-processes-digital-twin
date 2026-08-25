import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';
import { UM_PER_MIL } from './units';

/**
 * 🔴 **B군 — A15-op 적용 구역.** (오케스트레이터 승인 2026-08-20, `10_P7_EDS_판정요청.md` §3)
 *
 * 여기 있는 것은 **물리 법칙이 아니다.** 프로브 카드·니들의 **장비 스펙 범위와 운영 규약**이며,
 * 문헌에 계산식이 존재하지 않는다. 그래서 **없는 식을 지어내지 않고**
 *  - B1~B3 : 문헌 범위와 대조하는 **조회**
 *  - B4    : 좌표 포함 여부를 보는 **기하 판정**
 * 만으로 구현한다(op-2). 모든 수치에 S번호가 붙는다(op-1 — A6 는 B군에도 그대로다).
 *
 * 출처: **S229** Tektronix, *Probe Card Tutorial* · **S230** NASA NEPAG EEE Parts Bulletin(KGD)
 *
 * 🔴 **기존 명세값 3종을 원장과 대조해 정정했다.**
 *  | 기존 명세 | S229 실제 | 조치 |
 *  |---|---|---|
 *  | 스크럽 마크 **45.0 µm** 수치 판정 | S229 는 **수치규격을 주지 않는다.** "최대 오버드라이브에서 패시베이션 개구부 내" 라는 **기하 조건**뿐 | 수치 판정을 만들지 않고 **개구부 포함 여부**로 구현 |
 *  | 오버드라이브 정답창 **90~105 µm** | 실무범위 **25~76 µm** (1–3 mil) — 하한 90 이 이미 범위 밖 | **25~76 µm** 로 재설정 |
 *  | 접촉저항 합격 **0.90 Ω** | BeCu **100 µΩ**(Au)/**200 µΩ**(Al) · W **250 µΩ** — 3~4자릿수 차이 | 문헌 공칭값으로 재설정 |
 */

/**
 * 🔴 **A15-op 표식.** B군 출력의 `assumptions` **첫 항목**에 반드시 이 문자열이 온다.
 * 화면은 이것을 보고 물리식과 다른 배지를 단다 — 학습자가 「업계 운영 범위」임을 알아야 한다(op-3·조건 3).
 */
export const OPERATIONAL_ASSUMPTION = '[운영규약] A15-op — 물리 법칙이 아니라 업계 운영 범위';

/* ------------------------------------------------------------------ *
 * B1 — 프로브 오버드라이브 실무 범위
 * ------------------------------------------------------------------ */

/**
 * S229: 실무 오버드라이브 **1–3 mil**. 원장 §3-6 이 µm 환산값을 함께 인쇄한다.
 *
 * 🔴 **어느 쪽이 원문인가 — PLN 판정(2026-08-22).** 원문 텍스트는 **mil(1–3)** 이고,
 *    **25–76 µm 는 그것을 환산해 인쇄한 값**이다(76 은 `3 × 25.4 = 76.2` 를 정수로 끊은 것).
 *    두 표기는 **같은 진술의 두 인쇄**이므로 둘 다 S229 로 남긴다 — 어느 한쪽이 파생 계산이 아니다.
 */
const OD_MIN_MIL = withSource(1, 'mil', 'S229');
const OD_MAX_MIL = withSource(3, 'mil', 'S229');
const OD_MIN_UM = withSource(25, 'µm', 'S229');
const OD_MAX_UM = withSource(76, 'µm', 'S229');

/** 🔴 **정정된 정답창.** 기존 명세의 90~105 µm 는 하한부터 문헌 범위 밖이었다. */
export const OVERDRIVE_PRACTICE_RANGE_UM: [number, number] = [OD_MIN_UM.value, OD_MAX_UM.value];
/**
 * 🔴 **문헌이 인쇄한 mil 표기 그대로**의 실무창 [mil]. **정의역이 아니다.**
 *
 * 이 상수를 쓰는 곳은 「문헌이 뭐라고 적었나」를 읽는 자리뿐이다 —
 * `labs/eds.ts` 의 `EDS_FORCE_MAX_G`(= 2.5 g/mil × **인쇄된 상한 3 mil**, 씬 게이지의 0–1 축)와
 * 그 상한을 못박는 골든 테스트가 그것이다. **입력 검사에는 쓰지 않는다** — 아래 참조.
 */
export const OVERDRIVE_PRACTICE_RANGE_MIL: [number, number] = [OD_MIN_MIL.value, OD_MAX_MIL.value];

/**
 * 🔴 **`probeContactForce` 의 정의역 [mil] — µm 쪽에서 파생한다.**
 *
 * 왜 인쇄값 `[1, 3]` 을 그대로 쓰지 않는가:
 *  - 실무창의 **정본은 µm 쪽(25–76)** 이다. 슬라이더도 판정(`overdriveRangeMarginUm`)도
 *    합격/불합격 피드백도 전부 µm 로 돌아가고, mil 은 S229 의 계수 단위(g/mil)를 맞추려고
 *    **파생시키는 중간값**일 뿐이다.
 *  - `25.4` 로 정직하게 환산하면 실무창 하한 25 µm 는 **0.984 mil** 이 된다. 인쇄값 `[1, 3]` 을
 *    정의역으로 두면 **µm 쪽이 합격이라고 말한 입력에서 mil 쪽이 정지**한다 — 같은 실무창을
 *    두 단위가 서로 다르게 판정하는 것이고, 이번 정정이 없애려는 어긋남 바로 그것이다.
 *  - 반대쪽도 같다. 3 mil = 76.2 µm 는 µm 정본 상한 76 을 **넘는다.** 인쇄값을 정의역으로 두면
 *    µm 쪽이 거부하는 오버드라이브를 mil 쪽이 받아 준다.
 *
 * 🔴 **실무창(정답창) 자체는 손대지 않았다** — µm 25–76 그대로다(D-041 ②). 바뀐 것은
 *    「같은 창을 mil 로 말하면 얼마인가」뿐이다.
 */
export const OVERDRIVE_MIL_DOMAIN: [number, number] = [
  OD_MIN_UM.value / UM_PER_MIL,
  OD_MAX_UM.value / UM_PER_MIL,
];

/**
 * 🔴 **실무창 밖이라 경계로 고정했다**는 사실을 화면에 싣는 한 줄.
 *
 * 접촉력은 `role: 'display'` 출력이다. 클램프된 숫자는 화면에서 **실측처럼 읽힌다** —
 * OD 를 80·120·150 µm 로 올려도 같은 값이 서 있으면 학습자는 「측정이 포화했다」고 읽지
 * 「문헌 범위를 벗어나 계산을 멈췄다」고 읽지 않는다. 그래서 고정된 경우에만 이 줄을 단다.
 */
export const PRACTICE_WINDOW_PINNED_ASSUMPTION = '문헌 유효범위 밖 — 경계 고정';

/** 실무 범위 안인가 — 조회일 뿐 계산이 아니다. */
export function overdriveWithinPractice(overdriveUm: number): boolean {
  return overdriveUm >= OD_MIN_UM.value && overdriveUm <= OD_MAX_UM.value;
}

/**
 * 실무 범위 여유 [µm] — 양수면 범위 안, 음수면 밖. 양 끝에서 0 이고 가운데서 최대이므로
 * 오버드라이브에 대해 **단조가 아니다**(A12 규칙 EDS-D10 이 이것을 고정한다).
 */
export function overdriveRangeMarginUm(overdriveUm: number): Quantity {
  assertWithin('overdriveUm', overdriveUm, [0, Number.POSITIVE_INFINITY], 'µm');
  const margin = Math.min(overdriveUm - OD_MIN_UM.value, OD_MAX_UM.value - overdriveUm);
  const halfSpan = (OD_MAX_UM.value - OD_MIN_UM.value) / 2;
  return quantity(margin, {
    modelId: 'eds.probe.overdriveMargin',
    unit: 'µm',
    basis: "업계 운영 범위(A15-op) — 물리 법칙이 아니라 조회값이며 문헌 식이 아닙니다.",
    validRange: [Number.NEGATIVE_INFINITY, halfSpan],
    assumptions: [
      OPERATIONAL_ASSUMPTION,
      `실무 오버드라이브 ${OD_MIN_UM.value}–${OD_MAX_UM.value} µm (= ${OD_MIN_MIL.value}–${OD_MAX_MIL.value} mil, S229)`,
    ],
  });
}

/* ------------------------------------------------------------------ *
 * B2 — 프로브 접촉력
 * ------------------------------------------------------------------ */

export type NeedleMaterial = 'W' | 'W-Re' | 'BeCu';

interface ForceBand { readonly min: SourcedConst; readonly max: SourcedConst }

/**
 * S229: 니들 재질별 접촉력 계수 [g / mil OD].
 * 🔴 단위가 「그램 / 오버드라이브 1 mil」이므로 **접촉력 = 계수 × OD(mil)** 은 단위 산술일 뿐
 *    새로 세운 식이 아니다.
 */
const CONTACT_FORCE: Readonly<Record<NeedleMaterial, ForceBand>> = Object.freeze({
  'W': { min: withSource(1.0, 'g/mil', 'S229'), max: withSource(2.5, 'g/mil', 'S229') },
  'W-Re': { min: withSource(1.0, 'g/mil', 'S229'), max: withSource(2.5, 'g/mil', 'S229') },
  'BeCu': { min: withSource(0.5, 'g/mil', 'S229'), max: withSource(1.6, 'g/mil', 'S229') },
});

export function contactForceCoefficient(material: NeedleMaterial): { min: number; max: number } {
  const band = CONTACT_FORCE[material];
  if (!band) {
    throw new Error(`[S229] 등재되지 않은 니들 재질 '${material}'. 등재: ${Object.keys(CONTACT_FORCE).join(', ')}`);
  }
  return { min: band.min.value, max: band.max.value };
}

/**
 * 접촉력 [g] = 계수 [g/mil] × 오버드라이브 [mil]. `bound` 로 범위의 어느 끝인지 고른다.
 *
 * 🔴 정의역은 **`OVERDRIVE_MIL_DOMAIN`**(µm 정본에서 파생)이다. 인쇄값 `[1, 3]` 이 아니다 —
 *    이유는 그 상수의 주석에 적었다.
 *
 * `pinnedToPracticeWindow` 는 호출자가 **실무창 밖 입력을 경계로 고정해서** 넘겼다는 신고다.
 * 그러면 `assumptions` 에 `PRACTICE_WINDOW_PINNED_ASSUMPTION` 한 줄이 더 붙는다.
 * 🔴 고정되지 않은 호출에는 붙지 않는다 — 상시로 달면 「지금 고정됐다」는 정보가 사라진다.
 */
export function probeContactForce(args: {
  material: NeedleMaterial; overdriveMil: number; bound: 'min' | 'max';
  pinnedToPracticeWindow?: boolean;
}): Quantity {
  assertWithin('overdriveMil', args.overdriveMil, OVERDRIVE_MIL_DOMAIN, 'mil');
  const band = contactForceCoefficient(args.material);
  const coeff = args.bound === 'min' ? band.min : band.max;
  return quantity(coeff * args.overdriveMil, {
    modelId: 'eds.probe.contactForce',
    unit: 'g',
    basis: "업계 운영 범위(A15-op) — 물리 법칙이 아니라 조회값이며 문헌 식이 아닙니다.",
    // 🔴 상한은 **인쇄된 실무창 상한 3 mil** 로 잡는다 — 씬 게이지의 0–1 축(`EDS_FORCE_MAX_G`)과
    //    같은 자를 써야 게이지가 자기 축을 넘지 않는다. 실제 도달값은 2.992 mil 까지이므로
    //    상한에 아주 못 미치는 것이 정상이다(OD 76 µm 에서 7.480 g / 7.5 g = 0.997).
    validRange: [0, band.max * OD_MAX_MIL.value],
    assumptions: [
      OPERATIONAL_ASSUMPTION,
      `${args.material} 접촉력 ${band.min}–${band.max} g/mil OD (S229) — 범위 조회이지 계산식이 아니다`,
      ...(args.pinnedToPracticeWindow ? [PRACTICE_WINDOW_PINNED_ASSUMPTION] : []),
    ],
  });
}

/* ------------------------------------------------------------------ *
 * B3 — 접촉저항 공칭값
 * ------------------------------------------------------------------ */

export type PadMetal = 'Au' | 'Al';

/**
 * 🔴 **정정.** 기존 명세는 합격선을 **0.90 Ω** 으로 두었다. S229 의 공칭 접촉저항은
 * **µΩ 단위**이며 3~4자릿수가 어긋난다. 문헌 공칭값으로 재설정한다.
 * BeCu 100 µΩ(Au) / 200 µΩ(Al) · W 250 µΩ(Au·Al).
 */
const R_BECU_AU = withSource(100, 'µΩ', 'S229');
const R_BECU_AL = withSource(200, 'µΩ', 'S229');
const R_TUNGSTEN = withSource(250, 'µΩ', 'S229');

const CONTACT_RESISTANCE: Readonly<Record<string, SourcedConst>> = Object.freeze({
  'BeCu|Au': R_BECU_AU,
  'BeCu|Al': R_BECU_AL,
  'W|Au': R_TUNGSTEN,
  'W|Al': R_TUNGSTEN,
  'W-Re|Au': R_TUNGSTEN,
  'W-Re|Al': R_TUNGSTEN,
});

export function nominalContactResistance(args: {
  material: NeedleMaterial; pad: PadMetal;
}): Quantity {
  const key = `${args.material}|${args.pad}`;
  const entry = CONTACT_RESISTANCE[key];
  if (!entry) {
    throw new Error(
      `[S229] 접촉저항 공칭값이 없는 조합 '${key}'. 등재: ${Object.keys(CONTACT_RESISTANCE).join(', ')}. 보간하지 않는다.`,
    );
  }
  return quantity(entry.value, {
    modelId: 'eds.probe.contactResistance',
    unit: 'µΩ',
    basis: "업계 운영 범위(A15-op) — 물리 법칙이 아니라 조회값이며 문헌 식이 아닙니다.",
    validRange: [0, R_TUNGSTEN.value],
    assumptions: [
      OPERATIONAL_ASSUMPTION,
      '재질·표면 상태에 의존하는 실측 공칭값이다 — 계산식이 아니라 조회값',
      '🔴 기존 명세의 「합격 0.90 Ω」은 이 문헌 공칭값과 3~4자릿수 어긋난다(폐기)',
    ],
  });
}

/* ------------------------------------------------------------------ *
 * B4 — 스크럽 마크 (기하 판정)
 * ------------------------------------------------------------------ */

/**
 * 🔴 **S229 는 스크럽 마크의 수치규격을 주지 않는다.**
 * 요구조건은 *"최대 오버드라이브에서 마크가 패시베이션 개구부 안에 있을 것"* 이라는 **기하 조건**뿐이다.
 * 그래서 「Dm ≤ 45 µm」 같은 **수치 판정을 만들지 않는다.** 마크의 실측 기하와
 * 개구부 기하를 받아 **포함 여부**만 본다.
 *
 * 반환값은 개구부 경계까지의 **최소 여유** [µm]. 0 이상이면 개구부 안(요구조건 충족).
 */
export function scrubMarkClearanceUm(args: {
  /** 마크 장축 길이 [µm] (스크럽 방향) */
  markLengthUm: number;
  /** 마크 단축 폭 [µm] */
  markWidthUm: number;
  /** 개구부 중심 기준 마크 중심 오프셋 [µm] */
  offsetXUm: number;
  offsetYUm: number;
  /** 패시베이션 개구부 크기 [µm] */
  openingWidthUm: number;
  openingHeightUm: number;
}): Quantity {
  const nonNeg: [number, number] = [0, Number.POSITIVE_INFINITY];
  assertWithin('markLengthUm', args.markLengthUm, nonNeg, 'µm');
  assertWithin('markWidthUm', args.markWidthUm, nonNeg, 'µm');
  assertWithin('openingWidthUm', args.openingWidthUm, nonNeg, 'µm');
  assertWithin('openingHeightUm', args.openingHeightUm, nonNeg, 'µm');

  const halfOpenX = args.openingWidthUm / 2;
  const halfOpenY = args.openingHeightUm / 2;
  const halfMarkX = args.markLengthUm / 2;
  const halfMarkY = args.markWidthUm / 2;

  const clearanceRight = halfOpenX - (args.offsetXUm + halfMarkX);
  const clearanceLeft = halfOpenX + (args.offsetXUm - halfMarkX);
  const clearanceTop = halfOpenY - (args.offsetYUm + halfMarkY);
  const clearanceBottom = halfOpenY + (args.offsetYUm - halfMarkY);

  const clearance = Math.min(clearanceRight, clearanceLeft, clearanceTop, clearanceBottom);
  return quantity(clearance, {
    modelId: 'eds.probe.scrubClearance',
    unit: 'µm',
    basis: "업계 운영 범위(A15-op) — 물리 법칙이 아니라 조회값이며 문헌 식이 아닙니다.",
    validRange: [Number.NEGATIVE_INFINITY, Math.min(halfOpenX, halfOpenY)],
    assumptions: [
      OPERATIONAL_ASSUMPTION,
      '🔴 S229 는 수치규격을 주지 않는다 — "최대 오버드라이브에서 패시베이션 개구부 내"라는 기하 조건뿐이다',
      '마크·개구부를 축정렬 직사각형으로 근사한다',
    ],
  });
}

/** 기하 요구조건 충족 여부 — 여유가 0 이상이면 개구부 안이다. */
export function scrubMarkWithinOpening(args: Parameters<typeof scrubMarkClearanceUm>[0]): boolean {
  return scrubMarkClearanceUm(args).value >= 0;
}

/* ------------------------------------------------------------------ *
 * B5~B7 — 계산 출력이 아닌 것들
 * ------------------------------------------------------------------ */

/**
 * **B5 빈(bin) 분류** — 순수 운영 규약이며 회사·제품마다 다르다. **계산 출력이 아니므로 구현하지 않는다.**
 * **B6 테스트 커버리지 T** — 테스트 패턴 생성 결과인 **입력값**이다. `defectLevel()` 의 인자로만 쓴다.
 * **B7 KGD** — 정의는 있으나 수치식이 아니다. 정의만 노출한다.
 */
export const KGD_DEFINITION = {
  sourceId: 'S230',
  statement:
    'Known Good Die — MIL-PRF-38534 정의. QML 인증 다이는 다이 레벨 온도사이클·번인을 요구하지 않는다.',
  note: '정의이지 수치식이 아니다. 판정에 쓰는 수치가 없다(S230 · NASA NEPAG · 미국 정부 저작물).',
} as const;

/**
 * 🔴 **등급 C 목록 — 판정에 쓰지 않는다**(A15-op op-3).
 * %GRR 10/30 % 는 AIAG MSA 2차 인용이고, Cpk 임계 1.33/1.67/2.00 은 2차 웹자료다.
 * **S224(NIST)는 임계를 규정하지 않는다.** 화면 합격선으로 쓰면 출처 없는 값이 판정에 들어간다.
 * 필요하면 **문항이 조건으로 제시**한다(k₂·Black A 와 같은 처리).
 */
export const GRADE_C_NOT_FOR_JUDGEMENT: readonly string[] = Object.freeze([
  '%GRR 10 % / 30 % 임계 — AIAG MSA 2차 인용, 1차 원문 유상·미확인',
  'Cpk 실무 임계 1.33 / 1.67 / 2.00 — 2차 웹자료. S224(NIST)는 임계를 규정하지 않는다',
]);
