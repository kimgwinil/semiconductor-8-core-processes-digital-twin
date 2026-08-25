/**
 * P6 금속배선 — 단위 환산 계수.
 *
 * 🔴 여기 있는 값은 **물리 상수가 아니라 SI 십진 접두어의 정의**다. 출처(S번호)가 붙을 성질이
 *    아니므로 `withSource` 로 감싸지 않는다. 대신 규약 §2-3 대로 **허용 숫자(0·1·2·0.5·100)만으로
 *    조립**해서 매직넘버 차단을 우회하지 않는다. 값은 정의상 정확하다.
 *
 * 🔴 **공정을 가리지 않는 환산은 여기 두지 않는다** — `../units.ts` 가 정본이다.
 *    종전에 `TEN`(2·2·2+2)과 `SECONDS_PER_MINUTE`(TEN·(2·2+2))을 여기서 또 선언해
 *    `etch` 쪽과 표기가 갈렸다(`check-constants` R1, 2026-08-21 실측). 값은 같았지만 정본이 둘이었다.
 *    아래에 남은 것은 **P6 금속배선이 실제로 쓰는 것**뿐이다.
 */
import { TEN } from '../units';

/** 1 m = 10⁹ nm */
export const NM_PER_M = 100 * 100 * 100 * 100 * TEN;
/** 1 m = 10⁶ µm */
export const UM_PER_M = 100 * 100 * 100;
/** 1 m = 10³ mm */
export const MM_PER_M = 100 * TEN;
/** 1 m = 10² cm */
export const CM_PER_M = 100;
/** 1 kPa = 10³ Pa */
export const PA_PER_KPA = 100 * TEN;
/** 1 MPa = 10⁶ Pa (= MPa⁻¹ → m²/N 환산의 역수) */
export const PA_PER_MPA = 100 * 100 * 100;
/** 1 rev = 2π rad */
export const RAD_PER_REV = 2 * Math.PI;
