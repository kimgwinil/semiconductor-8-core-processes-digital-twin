/**
 * 🔴 **AC-R1 픽스처 — 오검출 0건.**
 * `src/` 에는 학습자에게 나가는 한국어 문구가 대량으로 있고 거기도 「」를 쓴다.
 * 무차별 검사하면 게이트가 즉시 노이즈가 되어 꺼진다. 이 파일에서 인용은 **0건**이어야 한다.
 */
export const FEEDBACK_KO = '「공정 한계선 초과 — 석영관 연화·웨이퍼 슬립 위험. 장비 정지.」';
export const FEEDBACK_EN = 'Process limit exceeded — 「furnace tube softening」';

/** 표지 없는 주석 인용 — 이것도 대상이 아니다: 「아무 문구나 감싼 것」. */
export const LABEL = '「판정은 이 차트에서 합니다」';

/* 🔴 아래 넷은 **표지처럼 보이지만** 어느 문서인지 특정되지 않아 대상이 아니다(R-1 좁힘).
 *    사각지대 목록에 전건 출력된다. */
// PLN 명세에서 뺀 것과 그 사유 — 전부 「구현할 물리가 없어서」다.
// 사유는 심화 명세 안 §「씬 없음」 주석에 적어 뒀다.
// (`spec.ts` 정의 원문: 「이 차트가 판정을 보여주는 출력 id 들」)
// `이미지/씬명세/scene_stepCoverage.md` §5 실패형상표: 「🔴 에로전 — ❌ 그리지 마라.」
export function Panel() {
  // JSX 본문의 `//` 가 주석으로 오독되면 안 된다.
  return <div title="https://example.invalid/a//b">「보기」</div>;
}
