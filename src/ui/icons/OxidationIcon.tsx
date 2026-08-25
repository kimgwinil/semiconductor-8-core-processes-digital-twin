import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 산화 — **층이 쌓인 단면.**
 * 실리콘 기판 위에 산화막이 층을 이루며 성장한 단면(3층). 등간격 수평선 3개가 유일 요소다.
 */
export function OxidationIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <rect x="3.5" y="6.5" width="17" height="14" rx="1.5" />
      <path d="M3.5 11h17" />
      <path d="M3.5 15.5h17" />
    </Icon>
  );
}
