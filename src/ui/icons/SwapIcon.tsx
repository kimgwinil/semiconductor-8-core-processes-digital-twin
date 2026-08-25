import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 상충 관계(trade-off) 항목 표식 — 「이쪽을 얻으면 저쪽을 잃는다」.
 *
 * 🔴 종전에는 CSS `content: "⇄"`(U+21C4) 였다. 이 글자는 본문 폰트에 없어 기호 폰트로 떨어지고
 *    플랫폼마다 굵기·크기가 다르게 나온다(§6-6 이 아이콘 폰트를 금지하는 이유와 같다).
 * 장식용이다 — 항목 문장 자체가 상충 내용을 말한다.
 */
export function SwapIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M4 9h15m-4-4 4 4-4 4" />
      <path d="M20 15H5m4-4-4 4 4 4" />
    </Icon>
  );
}
