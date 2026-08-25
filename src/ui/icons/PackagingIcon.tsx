import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 패키징 — **칩 + 몰드 + 리드.**
 * 몰드 본체 안에 칩(속 채운 사각)이 있고 좌우로 리드가 나와 있다.
 * 8종 중 **유일한 좌우 돌출**이다.
 */
export function PackagingIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <rect x="6" y="8" width="12" height="9" rx="1.5" />
      <path d="M3.5 11H6" />
      <path d="M3.5 14H6" />
      <path d="M18 11h2.5" />
      <path d="M18 14h2.5" />
      <rect x="10" y="11" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}
