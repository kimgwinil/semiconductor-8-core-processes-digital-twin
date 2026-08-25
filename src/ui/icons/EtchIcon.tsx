import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 식각 — **파인 홈.**
 * 표면이 깎여 트렌치가 생긴 기판 단면 실루엣. 8종 중 **유일한 요철 실루엣**이다.
 * (트렌치 깊이는 7.5 → 5.5단위로 줄여 잡았다. 더 깊으면 알파벳 U 로 읽힌다 — DSN 자기정정.)
 */
export function EtchIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M3.5 7.5h6V13h5V7.5h6v13h-17z" />
    </Icon>
  );
}
