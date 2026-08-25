import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 금속배선·CMP — **배선 격자 + 비아.**
 * 위·아래 두 금속층과 그 사이를 잇는 수직 비아 2개(속 채운 점은 비아 접점).
 * 8종 중 **유일한 격자**다.
 */
export function MetalIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M3.5 8h17" />
      <path d="M3.5 16h17" />
      <path d="M7.5 8v8" />
      <path d="M15.5 8v8" />
      <circle cx="7.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="16" r="1.15" fill="currentColor" stroke="none" />
    </Icon>
  );
}
