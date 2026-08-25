import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * EDS(웨이퍼 테스트) — **프로브 침 + 다이 격자.**
 * 비스듬히 내려온 프로브 침이 다이 3칸 중 가운데 칸에 접촉한다.
 * 8종 중 **유일한 사선**이라 이것만으로 갈린다.
 */
export function EdsIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M18.5 3.5 12 16.2" />
      <rect x="3.5" y="16.5" width="17" height="4" rx="0.75" />
      <path d="M9.2 16.5v4" />
      <path d="M14.8 16.5v4" />
    </Icon>
  );
}
