// bundle-budget.mjs — A9 초기 청크 예산의 **정본**.
//
// 🔴 왜 별도 모듈인가.
//    이 수(1,048,576 B)는 `check-bundle.mjs`(게이트 본체)와 `selftest-gates.mjs`
//    (게이트 자체검증의 초과 픽스처) **양쪽이 알아야 한다.** 두 곳에 리터럴로 박아 두면
//    한쪽만 고쳐지고 픽스처가 조용히 무의미해진다 — check-constants R1·R3 가 잡은 그 자리다.
//    `check-bundle.mjs` 는 최상위에서 검사를 실행하고 `process.exit` 까지 하는 **실행 스크립트**라
//    import 하는 순간 게이트가 돌아 버린다. 그래서 정본을 부작용 없는 이 모듈에 둔다.
//
// ⛔ 값은 바꾸지 말 것. 바꾸려면 A9 예산 재판정이 먼저다.

/** A9 초기 청크(엔트리 + 정적 import 그래프) raw 바이트 상한. 1 MiB. */
export const JS_LIMIT = 1048576;
