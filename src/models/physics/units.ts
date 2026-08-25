/**
 * SI 단위 환산 상수 — **공정을 가리지 않는 정본.** 문헌 계수가 아니다.
 *
 * 🔴 **왜 한 파일인가.** 같은 환산을 파일마다 각자 선언하면 정본이 사라진다(`check-constants` R1).
 *    2026-08-21 실측으로 잡힌 것만 —
 *      · `TEN` 이 `etch/units.ts`(√100)와 `metal/units.ts`(2·2·2+2)에 따로, **표기까지 갈렸다**
 *      · `SECONDS_PER_MINUTE` 이 **4곳**(etch·metal·labs/eds·wafer/pointDefect)에 각자 있었다
 *      · `NM_PER_UM`·`A_PER_MA`·`ANGSTROM_PER_NM`·`MM2_PER_CM2`·`MM_PER_CM`·`PERCENT`·
 *        「분↔시」 환산이 labs 파일들에 2벌씩 있었다
 *    값이 전부 같아서 아무도 안 본다. 한쪽만 고치면 나머지가 조용히 옛 값으로 남는다.
 *    **여기가 정본이다. 새로 선언하지 말고 여기서 import 한다.**
 *
 * 🔴 규약 §2-3 「대수 상수는 식을 다시 써서 없앤다」의 적용이다.
 *    단위 환산은 정의이지 측정값이 아니므로 `withSource` 로 감싸면 오히려 **거짓 출처**가 된다.
 *    그래서 `check-sources` 의 허용 리터럴(0 · 1 · 2 · −1 · 0.5 · 100)만으로 조립한다.
 *    IEEE-754 에서 아래 값은 전부 **정확히** 표현된다(√100 = 10 은 정확 반올림 결과다).
 *
 * 🔴 **공정 전용 환산은 여기 두지 않는다** — `physics/metal/units.ts` 처럼 그 공정 곁에 둔다.
 *    여기 올릴 것은 「두 공정 이상이 실제로 쓰는 것」뿐이다.
 *
 * 🔴 **십진 접두어가 아닌 SI 정의상수는 `./siDefinitions.ts` 다**(2026-08-22 신설).
 *    볼츠만 `k`(eV/K)·켈빈 영점 `273.15` 처럼 **단위계가 정의로 고정한 값**은 여기가 아니라 그쪽이다.
 *    같은 「정의이지 측정값이 아니다」 원칙을 공유하지만, 그쪽은 `siDefinition()` 으로 감싸
 *    **정의 관계식을 필수로 적게** 하고 S번호 부착을 타입으로 막는다. 조립 관례(허용 리터럴만)는 같다.
 *
 * 🔴 계층: `src/models/physics/**` 다. labs → physics 방향 참조는 기존 관례이며
 *    (`labs/etch.ts` · `labs/metal.ts` 가 이미 그렇게 쓰고 있다) `check-layering` 이 허용한다.
 *    반대 방향(physics → labs)은 두지 않는다.
 */

/** 10 — 십진 접두어의 밑이자 다른 환산의 조립 단위. */
export const TEN = Math.sqrt(100);

/** 1 min = 60 s. */
export const SECONDS_PER_MINUTE = TEN * (2 + 2 + 2);

/** 1 h = 60 min. */
export const MINUTES_PER_HOUR = TEN * (2 + 2 + 2);

/** 1 cm = 10 mm. */
export const MM_PER_CM = TEN;

/** 1 cm² = 100 mm². */
export const MM2_PER_CM2 = 100;

/** 1 m³ = 10⁶ cm³. */
export const CM3_PER_M3 = 100 * 100 * 100;

/** 1 µm = 10³ nm. */
export const NM_PER_UM = 100 * TEN;

/** 1 nm = 10 Å. */
export const ANGSTROM_PER_NM = TEN;

/** 1 mA = 10⁻³ A. */
export const A_PER_MA = 1 / (100 * TEN);

/** 백분율 환산(배수 100). */
export const PERCENT = 100;
