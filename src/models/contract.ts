import type { SourceId } from './sources.generated';

/**
 * 계산 함수 계약 — `common/규정_제품품질수용기준.md` §3 상속.
 * 모든 모델 함수는 생 number 를 반환하지 않는다.
 */
export type Grade = '검증식' | '문헌식' | '경향모델';

/**
 * 🔴 A6-b 기계 검사 필드 (오케스트레이터 판정 2026-08-20).
 *
 * 고지 **문장**은 공정별 맥락에 맞게 자유롭게 쓴다(획일화하면 맥락이 죽는다).
 * 그러나 게이트는 문장을 세지 않는다 — **이 필드**로 검사한다.
 *  - `literature`  : 계산 경로의 상수가 전부 `withSource`(문헌계수)다.
 *  - `synthetic`   : 값 자체가 교육용 스코어링 합성이다(임의 가중·감점·지수).
 *  - `operational` : 🔴 물리 법칙이 아니라 **업계 운영 범위**다(A15-op, 오케스트레이터 승인 2026-08-20).
 *                    값은 문헌 조회값이지만 식으로 유도한 결과가 아니므로 물리식과 **다른 배지**를 단다.
 *
 * 종전에는 「실제 장비 상수 아님」이라는 **상수 사용 횟수**로 셌다. 그러면 그 상수를 선언한
 * 3개 파일 밖에서는 검사가 아예 돌지 않는다(비서 실측 3/24). 그래서 구조 필드로 바꿨다.
 */
export type ModelKind = 'literature' | 'synthetic' | 'operational';

export interface Quantity {
  /** 🔴 등급 원장(`src/content/model-grades.json`) 키. DOM 에 새겨 게이트가 원장과 대조한다. */
  modelId: string;
  value: number;
  unit: string;
  /** 화면 언어가 영어일 때만 쓰는 단위. 기호가 아닌 한국어 단어 단위에만 채운다. */
  unitEn?: string;
  /** 화면에 표시되는 **실효** 등급. L2 미통과 상태의 강등이 이미 반영돼 있다. */
  grade: Grade;
  /** 🔴 원장 등재 등급. L2 를 통과하면 `grade` 가 될 값. 강등 여부와 무관하게 보존된다. */
  declaredGrade: Grade;
  /** 🔴 기계 검사 필드 — 게이트는 고지 문장이 아니라 이것으로 합성 여부를 판정한다. */
  kind: ModelKind;
  /** L2(현업 검증) 미통과라 등급이 강등된 상태인가. */
  l2Pending: boolean;
  /**
   * 🔴 문헌 S번호. **합성값(`synthetic`)·운영규약(`operational`)에는 없다 — 없는 것이 사실이다.**
   *
   * 종전에는 필수 필드였다. 그래서 합성 출력 83개가 **그 공정의 문헌 S번호를 빌려 달고** 있었다
   * (wafer→S106, oxidation→S120/S121, photo→S141/S144 …). 배지에 문헌 번호가 떠서
   * 얼핏 문헌식처럼 보였다. **개별 부주의가 아니라 타입이 거짓말을 강요한 결과**다.
   *
   * 🔴 오케스트레이터 판정(2026-08-20): **합성값에 S번호를 채번하지 않는다.** S번호 원장은
   *    「공개 문헌」 원장이고, 지어낸 값에 채번하면 **「S번호가 있다 = 문헌에 있다」가 무너진다.**
   *    그래서 필수 필드를 여는 쪽을 택했다. 합성값은 `basis` 로 근거를 서술한다.
   */
  sourceId?: SourceId;
  /** `sourceId` 가 없을 때의 근거 서술(문헌 S번호가 아닌 근거). 합성값·운영규약은 이쪽을 쓴다. */
  basis?: string;
  validRange: [number, number];
  outOfRange: boolean;
  assumptions: string[];
  /**
   * 🔴 A6-b — `경향모델` 등급이면 **반드시 채워진다.** 화면에 상시 고지된다.
   * 교육용 합성 계수를 실측값처럼 보이게 하는 것이 이 제품에서 가장 위험한 결함이다(README §3-8).
   */
  notice?: string;
}

/**
 * 🔴 층 구분 — CEO 지시 2026-08-20 (README §3-9 · A14 · A15).
 *  - `physics` : 입력 파라미터 → 물리 출력. **문헌식·문헌계수만. 합성 계수 0건.** 골든값(R번호)이 검증한다.
 *  - `scoring` : 물리 출력 → 합격·감점·수율·스루풋. 합성값은 등급 원장에 `kind: 'synthetic'` 으로
 *               등재되며 `[경향모델]` 배지 + 고지가 강제된다(`check-grades` G3·G4).
 * 디렉터리로도 강제한다: `src/models/physics/**`.
 * 🔴 `scoring` 층은 **만들지 않기로 확정**됐다(09_물리층_구현규약.md §7-1). `Layer` 타입은 계약으로 남기되
 *    디렉터리는 두지 않는다 — 합성값 표시는 등급 원장(`kind: 'synthetic'`)이 강제한다.
 */
export type Layer = 'physics' | 'scoring';

export type CoefficientClass = '문헌계수' | '합성계수';

/** 출처가 붙은 상수. src/models/**  는 이 형태로만 상수를 선언한다(§8). */
export interface SourcedConst {
  readonly value: number;
  readonly unit: string;
  readonly sourceId: SourceId;
  readonly cls: CoefficientClass;
  /** 합성계수면 필수 — 무엇을 조절하는 값인지. */
  readonly notice?: string;
}

/** 문헌에서 직접 읽은 계수. **물리층에서 쓸 수 있는 유일한 형태**다. */
export function withSource(value: number, unit: string, sourceId: SourceId): SourcedConst {
  return Object.freeze({ value, unit, sourceId, cls: '문헌계수' as const });
}

/**
 * 🔴 교육용 합성 계수 (A6-b). **`src/models/physics/**` 에서 쓰면 A15 위반이고 CI 가 차단한다.**
 * 스코어링층 전용이며, 원장에 `경향모델` 등급으로 등재된 sourceId 를 요구한다.
 */
export function withSynthetic(
  value: number, unit: string, sourceId: SourceId, notice: string,
): SourcedConst {
  if (!notice) throw new Error('[A6-b] withSynthetic requires a notice');
  return Object.freeze({ value, unit, sourceId, cls: '합성계수' as const, notice });
}

/* ───────────────────────── UI 안전장치 — 출처를 「가질 수 없는」 값 ───────────────────────── */

/**
 * 🔴 화면·원장 표기 문구의 **정본**. 사람이 읽는 자리에는 이 문자열을 쓴다.
 * 「출처 비공개」(라이선스로 번호만 가림)·「PENDING」(문헌은 있는데 못 찾음)과 **다른 상태**다.
 * 이쪽은 **애초에 뒷받침할 문헌이 존재할 수 없는 값**이다 — 우리가 그은 선이다.
 */
export const UI_GUARD_LABEL = '출처 없음 — UI 안전장치';

/**
 * 🔴 **입력·출력 범위를 막는 UI 안전장치.** 문헌 인용이 **아니다.**
 *
 * 왜 별도 타입인가 — 2026-08-21 실측:
 *   `PLATING_CURRENT_MAX_A`(1000 A) · `TIME_MAX_S`(86400 s) · 몰질량 창이 전부
 *   **S212(NIST CODATA Faraday constant)** 를 달고 있었다. NIST 기본상수 페이지는
 *   「도금 셀 전류 상한 1000 A」도 「24시간 상한」도 **진술할 수 없다.** 주석이 스스로
 *   근거를 부정하고 있었다 —「도금 셀 **상식**. UI 안전장치」.
 *
 * 🔴 이 유형은 **탐지로 못 잡는다.** `check-sources` 는 「S번호가 원장에 있는가」만 보고
 *    「그 출처가 그 진술을 뒷받침하는가」는 원리적으로 못 본다. 그래서 **틀린 것을 애초에
 *    표현할 수 없게** 타입으로 갈랐다:
 *
 *   · `UiGuard.cls` 는 `'UI안전장치'` 로 `CoefficientClass`(`'문헌계수'|'합성계수'`)와
 *     **겹치지 않는다** → `UiGuard` 를 `SourcedConst` 자리에 넣을 수 없고 그 반대도 안 된다.
 *   · `UiGuard.sourceId` 는 `never` 다 → **S번호를 실을 수 없다.** 붙이려 하면 `tsc` 가 거부한다.
 *   · `withSource(value: number, …)` 는 숫자를 받으므로 `UiGuard` 객체를 넘길 수도 없다.
 *
 * 🔴 **값을 이 래퍼에 넣는다고 매직넘버 차단이 면제되지는 않는다.** `check-sources` 는
 *    `withSource(` 의 첫 인자만 면제한다. 그러므로 가드 값은 규약 §2-3 대로
 *    **허용 리터럴(0·1·2·−1·0.5·100)과 `physics/units.ts` 의 환산 상수만으로 조립**한다.
 *    (별칭으로 게이트에 구멍을 내지 않는다 — 09_물리층_구현규약 §2-1.)
 */
export interface UiGuard {
  readonly value: number;
  readonly unit: string;
  /** 🔴 왜 이 선을 그었는가. **문헌 근거가 아니라 운용상의 이유**를 적는다. 필수다. */
  readonly reason: string;
  /** 🔴 판별 태그. `CoefficientClass` 와 겹치지 않아 `SourcedConst` 와 상호 배타다. */
  readonly cls: 'UI안전장치';
  /**
   * 🔴 **구조적 차단 — 「쓰기」만이다.** 정확히 어디까지 막히는지 적어 둔다.
   * (2026-08-22 DEV 실측. 다음 사람이 「반만 막혔다」를 또 결함으로 올리지 않도록.)
   *
   * · **쓰기는 막힌다.** `uiGuard(...)` 결과에 `sourceId: 'S212'` 를 실으려 하면
   *   `SourceId` 를 `never` 에 대입할 수 없어 `tsc` 가 거부한다. **이게 이 필드의 목적**이고,
   *   실제로 막고 싶었던 사고(전류 상한 1000 A 에 NIST 번호가 붙던 일)는 전부 쓰기였다.
   * · **읽기는 안 막힌다.** 옵셔널이라 `guard.sourceId` 의 타입은 `never | undefined`,
   *   즉 `undefined` 다. 그래서 읽는 코드가 컴파일된다.
   *
   * 🔴 **그래도 무해한 이유** — 읽어도 나오는 값은 `undefined` 뿐이고, 그것이 흘러갈 수 있는
   *    유일한 자리는 `QuantitySpec.sourceId?: SourceId` 인데 거기서 `undefined` 는
   *    **「출처 없음」과 정확히 같은 뜻**이다(`quantity()` 는 falsy 면 `Quantity.sourceId` 를
   *    아예 세팅하지 않는다). 즉 **거짓 출처가 만들어지는 경로가 아니다.**
   *    현재 저장소의 `uiGuard(` 호출 41 곳 중 `.sourceId` 를 읽는 곳은 **0 건**이다.
   *
   * 🔴 **옵셔널을 뗄 수 없다 — 그 「강화」는 존재하지 않는 선택지다.** `readonly sourceId: never`
   *    로 바꾸면 `never` 를 만족시킬 값이 없으므로 **`uiGuard()` 자신이 통과 못 한다** —
   *    아래 `uiGuard()` 의 `return` 문에서 곧바로 터진다:
   *      `error TS2741: Property 'sourceId' is missing in type
   *       'Readonly<{ value: number; unit: string; reason: string; cls: "UI안전장치"; }>'
   *       but required in type 'UiGuard'.`
   *    유일한 우회는 생성자에서 `as` 로 타입을 속이는 것인데, 그러면 이 타입이 지키려는
   *    「거짓을 표현할 수 없게 한다」는 성질 자체가 무너진다. **읽기 차단의 값어치보다
   *    비싸다** — 위에서 봤듯 읽기로는 거짓 출처가 생기지 않으므로 막을 것이 없다.
   */
  readonly sourceId?: never;
  /** 🔴 동, 합성계수 고지도 달 수 없다. 이 값은 계산 경로 계수가 아니라 범위선이다. */
  readonly notice?: never;
}

/**
 * UI 안전장치 값을 만든다. **출처를 요구하지 않고, 받을 수도 없다.**
 * @param reason 왜 이 상·하한인가. 비우면 던진다 — 이유 없는 선은 그냥 매직넘버다.
 */
export function uiGuard(value: number, unit: string, reason: string): UiGuard {
  if (!reason) {
    throw new Error('[uiGuard] reason is required — 왜 이 선을 그었는지 적어라. 이유 없는 상한은 매직넘버다.');
  }
  return Object.freeze({ value, unit, reason, cls: 'UI안전장치' as const });
}

/** 화면·보고·`assumptions` 에 그대로 실을 한 줄 표기. 문구 정본은 `UI_GUARD_LABEL` 하나뿐이다. */
export function describeUiGuard(guard: UiGuard): string {
  return `${UI_GUARD_LABEL} · ${guard.reason}`;
}

/* ─────────────────── SI 정의상수 — 출처를 「가질 필요가 없는」 값 ─────────────────── */

/**
 * 🔴 화면·원장 표기 문구의 **정본**. `UI_GUARD_LABEL` 과 **다른 상태**다.
 *
 * `uiGuard` 는 「**우리가** 그은 선 — 뒷받침할 문헌이 애초에 존재할 수 없다」이고,
 * 이쪽은 「**단위계가 정의한 값** — 재려는 대상이 아니라 재는 자[尺] 자체다」이다.
 * 둘을 한 칸에 넣으면 「모르는 것」과 「정확히 아는 것」이 섞인다.
 */
export const SI_DEFINITION_LABEL = 'SI 정의값 — 측정값이 아님';

/**
 * 🔴 **SI 가 정의로 확정한 값.** 문헌 인용이 **아니고**, UI 안전장치도 **아니다.**
 *
 * 왜 제3의 타입인가 — 2026-08-22 실측:
 *   `pointDefect.ts` 의 볼츠만 **SI 정의값** `8.617333262e-5 eV/K` 가 **S101**(MDPI 점결함 논문)을,
 *   `wetEtch.ts` 의 켈빈 영점 `273.15 K` 가 **S164**(NaOH·TMAH 습식식각 실험논문)를 달고 있었다.
 *   🔴 **두 논문 모두 그 숫자를 인쇄하지 않았다.** S101 은 본문에 **반올림값 8.617×10⁻⁵** 를 적었고
 *   (그래서 같은 파일이 `BOLTZMANN_AS_PRINTED` 를 **따로** 두고 있다 — 오귀속은 의도가 아니라 누락이다),
 *   S164 는 SI 온도눈금을 **정의하지 않고 사용할 뿐**이다. 코드 주석 자신이
 *   「**측정 계수가 아니라 SI 온도눈금 정의**」라고 적어 놓고 논문 번호를 달고 있었다.
 *
 * 🔴 **`uiGuard` 를 쓰지 않는 이유 — 뜻이 정반대다.**
 *   `UI_GUARD_LABEL` 은 「출처 없음」이고 그 정의는 「**애초에 뒷받침할 문헌이 존재할 수 없는 값**」이다.
 *   SI 정의값은 그 반대다 — **BIPM SI Brochure 와 NIST CODATA 라는 정본이 실재**하고, 값에
 *   **불확도가 0** 이다(2019 재정의로 k·e 가 정확값이 되었다). 「출처 없음」이라고 쓰면 그것도 거짓이다.
 *   게다가 `UiGuard` 는 스스로 「**계산 경로 계수가 아니라 범위선**」이라고 용도를 못박았는데
 *   볼츠만은 지수함수 안에 들어가는 **계산 경로 계수**다. 범위선 타입에 넣을 수 없다.
 *
 * 🔴 **`withSource` 를 쓰지 않는 이유 — `physics/units.ts` 가 이미 답을 적어 두었다.**
 *   「**단위 환산은 정의이지 측정값이 아니므로 `withSource` 로 감싸면 오히려 거짓 출처가 된다.**」
 *   S번호 원장은 「**공개 문헌**」 원장이고, 원장에는 BIPM SI Brochure 도 NIST CODATA 데이터셋도
 *   등재돼 있지 않다(2026-08-22 원장 2권 전수 확인 — NIST 계열은 S212「Faraday 상수 **한 값**」·
 *   S224「NIST/SEMATECH 통계 e-Handbook」·S266「JCGM 106:2012」뿐).
 *   없는 출처를 있는 척 빌려 다는 것이 이 결함의 정체이므로, **빌리지 않는 쪽**을 택했다.
 *
 * 🔴 **매직넘버 차단은 면제되지 않는다 — 그리고 면제를 요구하지도 않는다.**
 *   `check-sources` 는 `withSource(` 의 **첫 인자만** 면제한다(`scripts/check-sources.mjs:203`,
 *   함수명이 정규식에 박혀 있어 다른 래퍼는 면제 대상이 아니다). 그래서 이 타입은
 *   **게이트에 면제를 새로 요구하는 대신, 값을 게이트가 이미 허용하는 형태로 만든다** —
 *   `physics/units.ts` 관례 그대로 **허용 리터럴(0·1·2·−1·0.5·100)로만 조립**한다.
 *   🔴 이것이 이 설계의 핵심이다: **게이트를 넓히지 않고 값을 게이트 안으로 들여놓았다.**
 *   조립식이 십진 표기와 **비트까지 같음**은 `tests/unit/si-definitions.test.ts` 가 못박는다.
 *
 * 구조적 배타는 `UiGuard` 선례를 그대로 따른다:
 *   · `cls` 가 `'SI정의'` 라 `CoefficientClass`(`'문헌계수'|'합성계수'`)·`'UI안전장치'` 와 겹치지 않는다.
 *   · `sourceId` 가 `never` 라 **S번호를 실을 수 없다.** 붙이려 하면 `tsc` 가 거부한다.
 *     (옵셔널을 떼지 못하는 이유는 `UiGuard.sourceId` 주석에 적힌 것과 같다.)
 */
export interface SiDefinition {
  readonly value: number;
  readonly unit: string;
  /**
   * 🔴 **어떤 정의에서 나온 값인가.** 필수다. 출처가 아니라 **정의 관계식**을 적는다.
   * 예: 「k/e — k = 1.380 649×10⁻²³ J/K · e = 1.602 176 634×10⁻¹⁹ C (2019 SI 재정의, 둘 다 정확값)」
   */
  readonly definition: string;
  /** 🔴 판별 태그. `CoefficientClass`·`'UI안전장치'` 와 겹치지 않아 상호 배타다. */
  readonly cls: 'SI정의';
  /** 🔴 S번호를 실을 수 없다. 이 값은 문헌이 측정한 것이 아니라 단위계가 정한 것이다. */
  readonly sourceId?: never;
  /** 🔴 합성계수 고지도 달 수 없다. 교육용 눈금이 아니라 정의값이다. */
  readonly notice?: never;
}

/**
 * SI 정의값을 만든다. **출처를 요구하지 않고, 받을 수도 없다.**
 * @param definition 어떤 정의에서 나온 값인가. 비우면 던진다 —
 *                   정의를 밝히지 않은 정의값은 그냥 매직넘버다.
 */
export function siDefinition(value: number, unit: string, definition: string): SiDefinition {
  if (!definition) {
    throw new Error(
      '[siDefinition] definition is required — 어떤 정의에서 나온 값인지 적어라. '
      + '정의를 밝히지 않은 「정의값」은 출처 없는 매직넘버와 구별되지 않는다.',
    );
  }
  return Object.freeze({ value, unit, definition, cls: 'SI정의' as const });
}

/** 화면·보고·`assumptions` 에 그대로 실을 한 줄 표기. 문구 정본은 `SI_DEFINITION_LABEL` 하나뿐이다. */
export function describeSiDefinition(si: SiDefinition): string {
  return `${SI_DEFINITION_LABEL} · ${si.definition}`;
}

export interface QuantitySpec {
  modelId: string;
  unit: string;
  /** `unit` 이 한국어 단어일 때의 영문 표시. 계산·채점에는 영향을 주지 않는다. */
  unitEn?: string;
  /** 🔴 문헌값에만 단다. 합성값·운영규약은 비우고 `basis` 를 쓴다(위 `Quantity.sourceId` 주석 참조). */
  sourceId?: SourceId;
  /** 문헌 S번호가 아닌 근거 서술. 예: 「PLN §P1 S5 교육용 합성 응답식」 */
  basis?: string;
  validRange: [number, number];
  assumptions?: string[];
}

/**
 * grade 는 함수가 자체 선언하지 않는다 — 레지스트리가 주입한다(규정 §3).
 * gradeResolver 는 registry.ts 가 주입한다. 순환 의존을 피하려고 지연 바인딩한다.
 */
export interface GradeVerdict {
  /** 실효 등급(강등 반영). */
  grade: Grade;
  /** 원장 등재 등급. */
  declaredGrade: Grade;
  /** 🔴 기계 검사 필드. */
  kind: ModelKind;
  /** L2 미통과 강등 상태인가. */
  l2Pending: boolean;
  notice?: string;
}

/**
 * 🔴 리졸버 미설치 상태 — **조용히 넘어가지 않는다. 즉시 터뜨린다.**
 *
 * 종전에는 「안전한 기본값」으로 `경향모델`을 돌려줬다. 그게 사고를 숨겼다:
 * 2026-08-20, 물리층 모듈을 **배럴을 거치지 않고 직접 import** 한 테스트들이
 * 리졸버 없이 돌면서 문헌값을 `kind: 'synthetic'` 으로 받아 **sourceId 가 조용히 사라졌다.**
 * 값은 맞고 테스트도 오래 통과했다 — 아무도 못 봤다.
 *
 * 리졸버가 없다는 것은 **배선 버그**다(`check-wiring` W2 가 앱 경로를 막는다).
 * 기본값으로 때우면 그 버그가 등급·출처를 왜곡한 채 살아남는다. 그래서 던진다.
 * 🔴 물리층·실습층 모듈을 직접 쓰는 곳은 `import '@/models/registry';` 를 함께 적어라.
 */
let gradeResolver: (modelId: string) => GradeVerdict = (modelId) => {
  throw new Error(
    `[wiring] grade resolver is not installed; cannot grade "${modelId}". ` +
    `Import '@/models/registry' (side effect) before computing quantities.`,
  );
};

export function __setGradeResolver(fn: (modelId: string) => GradeVerdict): void {
  gradeResolver = fn;
}

/* ─────────────────── 경계 비교 — 부동소수점 반올림 오차 폭 ─────────────────── */

/**
 * 🔴 경계 비교가 허용하는 반올림 오차 — **`Number.EPSILON` 의 배수(상대 오차)**.
 *
 * 왜 필요한가 — 2026-08-22 DSN 실측:
 *   `etch/lab-advanced` 의 `residueIndex` 가 `validRange` 상한 220 에 대해
 *   **220.00000000000003** 을 냈다. 초과폭 2.842170943040401e-14 = **정확히 1 ULP** 다.
 *   식은 `R_res = 100·exp(−OE/12)·(1+0.030·f)`(`labs/etch.ts:254`) 이고 OE=0 · f=40 에서
 *   참값은 **정확히 220** 이다. 그런데 십진 리터럴 `0.030` 이 binary64 로 파싱될 때 이미
 *   반올림되어 `0.030*40 = 1.1999999999999999556`, `1 + …  = 2.2000000000000001776`
 *   (2.2 보다 1 ULP 위), `× 100` 하면 220 보다 1 ULP 위다.
 *   **연산 3 회, 물리는 개입하지 않았다.** 이걸 화면에 「이 값은 성립하지 않습니다」로
 *   띄우면 거짓말이다. 그래서 **비교 방식**을 고쳤다 — `validRange` 는 손대지 않았다.
 *
 * 🔴 왜 절대 엡실론이 아닌가 — 이 저장소의 값은 막 두께 1e-9 부터 농도 1e25 까지
 *    **34 자릿수**에 걸쳐 있다. 고정 엡실론은 큰 쪽에서 무의미하고 작은 쪽에서 위험하다.
 *
 * 🔴 왜 4 인가 — **상쇄 없는 연산 8 회 분량**이다. 근거는 「대충」이 아니라 IEEE-754 다:
 *    · binary64 에서 `+ − × ÷ √` 는 **정확히 반올림**되므로 연산 1 회의 상대오차는
 *      u = 2⁻⁵³ = `Number.EPSILON`/2 이하다.
 *    · 상쇄(cancellation)가 없는 k 회 연쇄의 상대오차 한계는 (1+u)^k − 1 ≈ k·u 다
 *      (표준 γ_k 한계 — k·u ≪ 1 인 동안 성립).
 *    · 이 상수 1 단위 = `Number.EPSILON`·|bound| = **2u** 의 여유다.
 *      따라서 **4 → 8u**, 즉 **상쇄 없는 연산 8 회**를 덮는다.
 *    · 실측 경로의 비용: 십진 리터럴 파싱 반올림 1u + 곱·합 3 회 3u + `Math.exp` 다.
 *      ECMAScript 는 초월함수의 정확한 반올림을 **요구하지 않지만** V8 의 fdlibm 이식은
 *      < 1 ULP(≈ 2u)를 목표로 한다. 1+3+2 = 6u < 8u 로 덮인다.
 *
 *    🔴 **덮을 수 있는 최대치가 아니라 관측된 부류를 덮는 최소치로 골랐다.**
 *       어떤 경로가 이보다 큰 여유를 요구한다면 그건 이 상수를 올릴 근거가 아니라
 *       **그 식이 수치적으로 불안정하다는 증거**다. 올리기 전에 식을 고쳐라.
 *
 * 🔴 스케일은 `|bound|` 하나뿐이다 — `Math.max(|value|, |bound|)` 를 **쓰지 않는다.**
 *
 *    먼저 **틀린 근거를 적어 두지 않기 위해** 실측한 것부터 남긴다(2026-08-22 DEV):
 *    「max 를 쓰면 `lo = 0` 에서 `max(|value|, 0) = |value|` 라 음수 이탈을 봐준다」는
 *    말이 돌았는데 **사실이 아니다.** 조건을 풀어 보면 `value < 0 − K·|value|`,
 *    즉 `|value| > K·|value|` 이고 `K = 4·Number.EPSILON = 8.88e-16 < 1` 이므로
 *    **음수는 크기와 무관하게 전부 잡힌다.** −16.97 nm 도 −1e−300 도 −`Number.MIN_VALUE`
 *    도 두 식 모두 이탈로 판정한다(`tests/unit/boundary-ulp.test.ts` 가 이 등가성까지 고정한다).
 *
 *    그런데도 `|bound|` 를 쓰는 이유는 **판정이 갈려서가 아니라 뜻이 다르기 때문**이다:
 *     ① **봐주는 폭이 명세의 성질이어야 한다.** `|bound|` 면 `[0, 220]` 이 봐주는 폭은
 *        `220 + 1.954e-13` 로 **고정**이라 사람에게 한 줄로 말할 수 있고 감사도 된다.
 *        max 면 폭이 **들어온 값에 따라 변한다** — 즉 **이탈이 클수록 봐주는 폭이 커진다.**
 *        판정이 뒤집히지 않더라도 규칙으로서 앞뒤가 맞지 않는다.
 *     ② **`lo = 0` 에서 max 는 기준을 바꿔 버린다.** `max(|value|, 0) = |value|` 는
 *        「경계에 대한 상대오차」가 아니라 「값 자신에 대한 상대오차」다. 결과가 우연히
 *        같을 뿐 재는 대상이 다르다. 이 저장소는 **271 곳 중 227 곳(83.8%)이 `[0, …]`**
 *        이라 기준이 바뀌는 자리가 압도적으로 많다.
 *    한편 경계에서 몇 ULP 안에 있는 값은 **어차피 경계와 크기가 같으므로**, 정작 봐줘야 하는
 *    자리에서는 두 식이 일치한다. `|bound|` 는 좁은 것이 아니라 말이 되는 쪽일 뿐이다.
 *
 * 주의 — `Number.EPSILON`·|x| 는 x 가 놓인 이진 구간(binade) 안에서 **1~2 ULP** 다
 *       (x ∈ [2ᵉ, 2ᵉ⁺¹) 이면 ulp(x) = 2ᵉ⁻⁵², x·2⁻⁵² 는 그 1~2 배).
 *       그래서 실제로 봐주는 폭은 **4~8 ULP** 이고 **8 ULP 를 절대 넘지 않는다.**
 *       220 에서는 여유가 6.875 ULP 인데, `hi + 여유` 라는 **합 자체가 반올림**되어
 *       정확히 7 ULP 지점에 놓인다. 그래서 실측 선은 **7 ULP 까지 봐주고 8 ULP 부터 잡는다**
 *       (2026-08-22 DEV 실측 — 짐작이 아니라 쟀다).
 *       `tests/unit/boundary-ulp.test.ts` 가 이 선을 숫자로 못 박아 둔다.
 */
export const BOUNDARY_EPSILON_MULTIPLE = 4;

/**
 * 경계 **하나**가 허용하는 절대 오차폭. `0` 과 `±Infinity` 와 `NaN` 에서는 **0** 이다.
 *
 * 🔴 `bound === 0` → **엄격 비교(여유 0)**. 이 갈래가 이 파일에서 가장 중요하다:
 *    · 0 은 binary64 로 **정확히** 표현된다 — 봐줄 표현 오차가 애초에 없다.
 *    · 0 경계 근처에서 나온 0 아닌 값은 반올림이 아니라 **부호**다. 음의 선폭·음의
 *      표준편차는 이 제품이 반드시 잡아야 하는 결함이다.
 *    · 0 근처 상쇄가 만드는 오차의 크기는 **피연산자의 크기**이지 0 의 크기가 아니다.
 *      그러므로 0 에 비례하는 상대 엡실론은 원리적으로 존재할 수 없다.
 *    (`-0 === 0` 이므로 `-0` 경계도 이 갈래로 들어온다.)
 *
 * 🔴 `±Infinity` → 여유 0. 편측 정의역이 실재한다(`physics/eds/probeOperations.ts` 등).
 *    무한대 경계에는 표현 오차가 없어 봐줄 것이 없고, 여기서 0 을 주지 않으면
 *    `Infinity * Number.EPSILON = Infinity` 라 `hi + tol` 이 `Infinity`,
 *    `lo − tol` 이 `−Infinity` 로 번진다. 산술을 아예 하지 않는 쪽이 안전하다.
 *
 * `NaN` 경계 → 여유 0. 판정 자체는 `isOutOfRange` 가 앞에서 막는다.
 *
 * 이 저장소에 실재하는 나머지 두 관용구도 실측해 뒀다(2026-08-22 DEV) — **둘 다 무해하다**:
 *  · `Number.MAX_VALUE` 상한(packaging 트리의 「사실상 무한」 관용구, 20+ 곳):
 *    여유 1.597e+293 이 더해지며 `MAX_VALUE + 여유` 는 **`Infinity` 로 올림된다.** 그래도
 *    유한한 값은 애초에 `MAX_VALUE` 를 넘을 수 없고 무한대 값은 `Number.isFinite(value)`
 *    가 앞에서 이탈로 잘라내므로 **판정이 달라지는 입력이 존재하지 않는다.**
 *  · `Number.MIN_VALUE` 하한(「엄밀 양수」 관용구, 20+ 곳): 여유가 **0 으로 언더플로**한다
 *    (4·2⁻⁵²·4.94e−324 → 0). 비정규수 바닥에서는 완화가 아예 걸리지 않는다 — 의도대로다.
 */
export function boundaryTolerance(bound: number): number {
  if (!Number.isFinite(bound) || bound === 0) return 0;
  return BOUNDARY_EPSILON_MULTIPLE * Number.EPSILON * Math.abs(bound);
}

/**
 * 🔴 **경계가 무엇을 뜻하는가.** 여유를 줄지 말지는 「얼마나 관대할까」가 아니라
 *    **「이 경계를 1 ULP 넘으면 식의 모양이 바뀌는가」**로 갈린다.
 *
 * 사고 경위(2026-08-22, 같은 날 오후). ULP 여유를 넣자 `assertWithin` 까지 여유를 얻었고,
 * `physics/wafer/czochralski.ts:94` 의 `assertWithin('k0', …, [1e-6, 1])` 이 **뚫렸다.**
 * Scheil 식 `C_s = k₀·C₀·(1−X)^(k₀−1)` 에서 **`k₀ = 1` 은 지수 `k₀−1` 의 부호가 바뀌는
 * 전환점**이다. 실측:
 *
 * ```
 *   k₀ = 1 (정확히)  통과 · validRange 폭 0        ← 정당한 값이다
 *   k₀ = 1 + 1 ULP   🔴 통과 · validRange 뒤집힘(폭 −96)
 *   k₀ = 1 + 2~4 ULP 🔴 통과 · 뒤집힘 · outOfRange = true  ← 값은 lo 와 같은데 이탈이라 한다
 *   k₀ = 1 + 5 ULP~  차단(정상)
 * ```
 * 여유 폭이 경계 1 에서 정확히 4 ULP 라 **1~4 ULP 가 관문을 통과했다.** 통과한 뒤에는
 * 아무 게이트도 못 잡는다 — 값은 유한하고, A14 는 NaN·Infinity 만 본다.
 *
 * 🔴 **되돌리는 것이 답이 아니다.** 여유를 빼면 `residueIndex` 오표기가 되살아난다.
 *    드러난 것은 **한 함수가 두 용도를 못 가른다**는 사실이다. 그래서 **용도를 인자로 받는다** —
 *    판정의 **정본은 `isOutOfRange` 하나로 유지한다**(정본이 둘이 되면 언젠가 갈라진다).
 *
 * | 용도 | 경계의 성격 | 모드 |
 * |---|---|---|
 * | 출력값 비교(`quantity()` 의 `validRange`) | 값이 창을 벗어났는가 — **연속**. 1 ULP 초과는 계산 인공물 | `'tolerant'` |
 * | 정의역 관문(`assertWithin()`) | 넘는 순간 **식의 모양이 바뀐다** — **불연속**. 1 ULP 가 의미를 바꾼다 | `'exact'` |
 *
 * 🔴 **기본값은 `'exact'` 다. 두 실패의 무게가 다르기 때문이다:**
 *  · 실수로 **여유**를 얻으면 → **조용히 틀린 물리**(정의역 뒤집힘·부호 반전·NaN)가 통과한다.
 *    위 `k₀` 가 바로 그 꼴이었다 — 테스트도 게이트도 전부 초록인 채로 틀렸다.
 *  · 실수로 **엄격**해지면 → 1 ULP 값에 「한계선 초과」가 붙는다. **눈에 보이고**,
 *    `check-live-judgment` 의 `정의역이탈` 카운터가 세어 준다. 오늘 이렇게 발견했다.
 *  **조용히 틀린 쪽이 훨씬 나쁘다.** 그래서 안전한 쪽(엄격)을 기본으로 두고, 여유는
 *  「이 경계는 연속이다」를 확인한 자리에서만 **명시적으로 켠다.** 실제로 켜는 곳은 1 곳뿐이다.
 *
 * 🔴 `assertWithin()` 에는 이 인자를 **일부러 열지 않았다.** 정의역 관문은 여유가 위험한
 *    바로 그 용도이고, 호출부 229 곳 중 여유가 필요한 곳은 0 곳이다. 위험한 자리에
 *    손잡이를 달아 두면 언젠가 누가 돌린다. 필요해지면 그때 근거와 함께 여는 편이 낫다.
 */
export type BoundaryStrictness = 'exact' | 'tolerant';

/**
 * 🔴 `validRange` 이탈 판정의 **정본**. `quantity()` 와 `assertWithin()` 이 함께 쓴다.
 * 판정 규칙을 두 곳에 복사해 두면 언젠가 갈라진다 — 여기 하나만 둔다.
 * 다른 것은 **여유를 켜는지 뿐**이다(`strictness`).
 *
 * **값이 `NaN`·`±Infinity`** → 이탈(종전 `Number.isFinite(value)` 판정 그대로).
 *  · `NaN` 은 「어디에도 있지 않은 값」이라 범위 안이라고 말할 수 없다. 봐주면 계산이
 *    깨진 것을 정상이라고 표시하게 된다.
 *  · 상한이 `+Infinity` 여도 `value = +Infinity` 는 이탈로 본다. 계산이 **발산**한 것이지
 *    정의역 안에 착지한 것이 아니다.
 *
 * 🔴 **경계가 `NaN`** → 이탈. 종전에는 `value < NaN` 도 `value > NaN` 도 false 라
 *    **무엇이든 범위 안**이라고 답했다 — 망가진 명세가 조용히 통과했다. 현재 저장소에
 *    `NaN` 경계는 0 건이므로 이 갈래는 동작을 바꾸지 않고 앞으로만 막는다.
 */
export function isOutOfRange(
  value: number, lo: number, hi: number, strictness: BoundaryStrictness = 'exact',
): boolean {
  if (!Number.isFinite(value)) return true;
  if (Number.isNaN(lo) || Number.isNaN(hi)) return true;
  const slack = strictness === 'tolerant';
  const loEdge = slack ? lo - boundaryTolerance(lo) : lo;
  const hiEdge = slack ? hi + boundaryTolerance(hi) : hi;
  return value < loEdge || value > hiEdge;
}

export function quantity(value: number, spec: QuantitySpec): Quantity {
  const [lo, hi] = spec.validRange;
  const verdict = gradeResolver(spec.modelId);
  // 🔴 A6-b — 합성값인데 고지가 없으면 개발 중에 즉시 터뜨린다. 조용히 통과시키지 않는다.
  //    판정 축은 **등급이 아니라 `kind`** 다. 등급은 L2 상태에 따라 흔들리지만 kind 는 안 흔들린다.
  if (verdict.kind !== 'literature' && !verdict.notice) {
    throw new Error(
      `[A6-b] model "${spec.modelId}" is kind=${verdict.kind} but carries no notice. ` +
      `Register a notice in src/models/registry.ts.`,
    );
  }
  const q: Quantity = {
    modelId: spec.modelId,
    value,
    unit: spec.unit,
    ...(spec.unitEn ? { unitEn: spec.unitEn } : {}),
    grade: verdict.grade,
    declaredGrade: verdict.declaredGrade,
    kind: verdict.kind,
    l2Pending: verdict.l2Pending,
    validRange: spec.validRange,
    // 🔴 **여기가 여유를 켜는 유일한 자리다.** `validRange` 는 「값이 창을 벗어났는가」를
    //    묻는 **연속** 경계라 1 ULP 초과는 물리가 아니라 계산 인공물이다
    //    (`residueIndex` 220.00000000000003 — 근거는 `BOUNDARY_EPSILON_MULTIPLE` 주석).
    //    정의역 관문(`assertWithin`)은 반대로 `'exact'` 다 — 근거는 `BoundaryStrictness` 주석.
    outOfRange: isOutOfRange(value, lo, hi, 'tolerant'),
    assumptions: spec.assumptions ?? [],
  };
  // 🔴 합성값·운영규약은 **문헌 S번호를 싣지 않는다.** 호출부가 아직 빌린 번호를 넘기더라도
  //    여기서 잘라낸다 — 화면이 먼저 거짓말을 멈춰야 한다. 호출부 정리는 `check-grades` G7 이 강제한다.
  if (verdict.kind === 'literature' && spec.sourceId) q.sourceId = spec.sourceId;
  if (spec.basis) q.basis = spec.basis;
  if (verdict.notice) q.notice = verdict.notice;
  return q;
}

/**
 * 정지를 만든 **조건 한 건** — 「어느 입력이 · 지금 얼마이고 · 한계는 얼마인가」.
 *
 * 🔴 **한계값을 버리지 않기 위해 있는 타입이다.** 종전에는 `OutOfLimitError` 가 `limit` 을
 *    들고 있었는데도 화면이 `parameter = given unit` 만 찍고 한계 숫자를 버렸다. 학습자는
 *    「얼마까지가 되는지」를 모른 채 슬라이더를 더듬어야 했다.
 */
export interface LimitCondition {
  /**
   * 🔴 **실습 명세의 파라미터 id 를 그대로 쓴다**(`LabParam.id`). 화면이 이 id 로
   *    `spec.params` 를 찾아 사람이 읽는 이름을 붙인다 — 사유를 괄호로 덧붙인 문자열을
   *    여기 넣으면 그 조회가 깨지고 화면에 변수명이 그대로 노출된다.
   *    사유는 `reasonKo`·`reasonEn` 에 적는다.
   */
  parameter: string;
  given: number;
  limit: [number, number];
  unit: string;
}

/** 한계선 초과 — 규정 §4-1(2). 계산을 멈추고 정지 상태를 반환한다. */
export class OutOfLimitError extends Error {
  /**
   * 🔴 **결합 조건** — 이 정지를 **함께** 만든 다른 입력들.
   *
   * 왜 필요한가: 2026-08-22 실측으로 `metal/lab-advanced` 의 정지는 「저유전율막 k < 2.6
   * **이면서** 하중 > 24.76 kPa」일 때만 일어난다. 그런데 오류는 하중 하나만 지목했고,
   * 화면도 하중만 보여 줬다 — **학습자가 압력만 되돌린다.** 진짜 원인의 절반이 화면에
   * 닿지 않았다. 결합 조건이면 **걸린 값을 전부** 싣는다.
   *
   * 비어 있으면 종전과 같은 단일 조건 정지다(23칸이 그렇다).
   */
  readonly coupled: readonly LimitCondition[];

  constructor(
    readonly parameter: string,
    readonly given: number,
    readonly limit: [number, number],
    readonly unit: string,
    /** 결합 조건. 생략하면 종전 동작 그대로다 — 기존 호출부 전부가 그대로 성립한다. */
    coupled: readonly LimitCondition[] = [],
    /** 왜 이 조합이 막혔는가. 화면이 그대로 읽어 준다. 없으면 표시하지 않는다. */
    readonly reasonKo?: string,
    readonly reasonEn?: string,
  ) {
    super(`parameter "${parameter}" = ${given} ${unit} is outside [${limit[0]}, ${limit[1]}] ${unit}`);
    this.name = 'OutOfLimitError';
    this.coupled = coupled;
  }

  /**
   * 정지를 만든 조건 **전부**. 주 조건이 첫 원소이고, 결합 조건이 뒤에 붙는다.
   * 🔴 화면은 이것만 읽는다 — `parameter`/`coupled` 를 각자 해석하면 칸마다 다르게 그려진다.
   */
  get conditions(): readonly LimitCondition[] {
    return [
      { parameter: this.parameter, given: this.given, limit: this.limit, unit: this.unit },
      ...this.coupled,
    ];
  }
}

export function assertWithin(
  parameter: string,
  given: number,
  limit: [number, number],
  unit: string,
): void {
  // 🔴 `quantity()` 와 **같은 판정 함수**를 쓰되 **모드가 다르다** — 여기는 `'exact'`(기본값).
  //    정의역 관문은 넘는 순간 **식의 모양이 바뀌는** 경계다. 2026-08-22 실측:
  //    여유를 주자 `k₀ = 1 + 1~4 ULP` 가 이 관문을 통과해 Scheil 식의 지수 부호를 뒤집고
  //    `validRange` 를 역전시켰다(`BoundaryStrictness` 주석에 전문). 여기서 1 ULP 는
  //    반올림이 아니라 **의미**다. 봐주지 않는다.
  if (isOutOfRange(given, limit[0], limit[1])) {
    throw new OutOfLimitError(parameter, given, limit, unit);
  }
}
