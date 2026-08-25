import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 포토리소그래피 — **빛 + 마스크.**
 * 위에서 내려온 빛이 마스크의 열린 구멍(가운데 끊긴 자리)을 지나 아래 웨이퍼면에 닿는다.
 * 8종 중 **유일한 화살촉**이다.
 */
export function PhotoIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M3.5 8.5h5.5" />
      <path d="M15 8.5h5.5" />
      <path d="M12 3.5v11.5" />
      <path d="m9.9 12.9 2.1 2.1 2.1-2.1" />
      <path d="M3.5 18.5h17" />
    </Icon>
  );
}
