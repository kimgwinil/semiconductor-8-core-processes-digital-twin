/**
 * 실습 공통 **고정 조건** — 여러 실습 명세가 함께 쓰는 PLN 설정값의 정본.
 *
 * 🔴 단위 환산이 아니다. 단위 환산은 `../physics/units.ts` 가 정본이다.
 *    여기 있는 것은 **PLN `03_실습3단계명세.md` 가 소유한 고정 조건**이며, 명세가 바뀌면 여기만 고친다.
 *
 * 🔴 왜 파일을 따로 두는가: `labs/*.ts` 는 실습 1개당 1파일이라 서로를 import 하지 않는다.
 *    고정 조건을 각 파일이 각자 들고 있으면 정본이 사라진다(`check-constants` R1 — 2026-08-21 실측으로
 *    `WAFER_DIAMETER_CM` 이 `deposition.ts` 와 `eds.ts` 에 2벌 있었다). **여기가 정본이다.**
 */

/**
 * 웨이퍼 지름 300 mm = 30 cm → A = 706.86 cm². **PLN 고정 조건.**
 *
 * 근거: `03_실습3단계명세.md` 「웨이퍼 300 mm」 · 「웨이퍼 지름 D = 300 mm」 ·
 * 「웨이퍼 지름 D = 300 mm … SEMI 표준」(등급표 #295). 쓰는 곳 —
 * P5 증착·이온주입(`deposition.ts`, 주입 총 이온수의 면적)과 P7 EDS(`eds.ts`, DPW 계산의 입력).
 * 수식은 물리층이 갖는다(P5 `waferAreaCm2` · P7 `grossDiePerWafer` S148). 여기는 조건값만 둔다.
 */
export const WAFER_DIAMETER_CM = 30;
