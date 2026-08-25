import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 증착·이온주입 — **위에서 내려앉는 입자 + 기판.**
 * 높이가 서로 다른 입자 3개가 기판을 향해 내려온다. 8종 중 **유일한 흩어진 점**이다.
 *
 * 🔴 입자는 속을 채운다 — `fill="currentColor" stroke="none"`. 1.15 반지름을 1.5 굵기 스트로크로
 *    그리면 15px 에서 점이 뭉개진다. `Icon.tsx` 가 준 `fill="none"` 을 요소 단위로 덮는다.
 */
export function DepositionIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <circle cx="7.5" cy="9" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
      <rect x="3.5" y="15.5" width="17" height="5" rx="1" />
    </Icon>
  );
}
