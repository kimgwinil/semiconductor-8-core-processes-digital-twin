/**
 * 🔴 현업 검증(L2) 상태 플래그 — `common/규정_제품품질수용기준.md` §2 · D-011 · D-013.
 *
 * false 인 동안:
 *  - 전 계산 항목이 '경향모델' 로 강등된다(registry.ts)
 *  - 화면에 「현업 검증 전」 이 상시 노출된다(ui/shell/VerificationBanner)
 *  - 「품질 확보 완료」를 선언하지 않는다
 *
 * true 로 바꾸려면 `common/양식_현업검증시트.md` 전 항목이 「타당」이어야 하고,
 * 판정자는 CEO 본인이다(D-013). 개발팀이 임의로 켜지 않는다.
 */
export const L2_VERIFIED = false;
