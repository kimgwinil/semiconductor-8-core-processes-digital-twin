import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 완료 표시. 사이드바의 「학습 완료한 절」에 붙는다.
 *
 * 🔴 종전에는 CSS `content: "✓"` 였다. 의사요소 글리프는 **접근 가능한 이름을 줄 수 없고**
 *    폰트에 따라 크기가 널뛴다. 여기서는 `label` 로 이름을 준다 — 이 아이콘은 장식이 아니라
 *    「이 절은 끝냈다」는 **정보**를 혼자 지고 있기 때문이다(옆에는 절 번호뿐이다).
 */
export function CheckIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M4.5 12.75 9.5 17.75 19.5 6.75" />
    </Icon>
  );
}
