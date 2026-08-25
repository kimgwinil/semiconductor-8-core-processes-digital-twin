/**
 * 설계서 §6-6 아이콘 기반틀.
 *
 * 🔴 **인라인 SVG만.** 아이콘 폰트·PNG 스프라이트 금지.
 *    이 화면이 여태 쓰던 `✓`(U+2713)·`⇄`(U+21C4)·`←`(U+2190)는 전부 **폰트 글리프**다.
 *    본문 폰트(Pretendard·Apple SD Gothic Neo)에 없어서 플랫폼마다 다른 대체 폰트로 떨어지고,
 *    크기·베이스라인이 제각각이며 `stroke-width` 를 줄 수 없다 — §6-6 이 막으려는 것이 이것이다.
 *
 * 확정 규격: **24×24 viewBox · 스트로크 1.5 · `currentColor`**.
 *
 * 🔴 아이콘은 **쓸 자리가 있을 때만** 만든다. 「나중에 쓸 것」을 미리 만들면
 *    배럴에만 있고 호출부가 0인 死코드가 된다(`check-wiring` W4 · 이 프로젝트에서 컴포넌트 4종 격리 전례).
 *    그래서 배럴(`index.ts`)을 두지 않고 쓰는 곳에서 직접 import 한다.
 */
export interface IconProps {
  className?: string;
  /**
   * 의미를 가진 아이콘의 접근 가능한 이름.
   * 없으면 **장식용**으로 보고 `aria-hidden` 을 준다 — 옆 글자가 이미 뜻을 말하고 있는 자리다.
   */
  label?: string;
}

export function Icon(
  { className, label, children }: IconProps & { children: React.ReactNode },
): React.ReactElement {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label === undefined
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      {children}
    </svg>
  );
}
