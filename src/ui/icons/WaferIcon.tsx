import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 웨이퍼 제조 — **원판 + 오리엔테이션 플랫.**
 * 잉곳을 잘라 낸 둥근 웨이퍼와, 결정 방위를 표시하는 아랫면 직선 절단부.
 * 8종 중 **유일한 곡선 폐도형**이라 15px 에서도 실루엣만으로 갈린다.
 *
 * 장식용이다 — 사이드바·허브 카드 모두 옆(아래)에 공정명이 이미 있다. 그래서 `label` 을 주지 않는다.
 */
export function WaferIcon({ className, label }: IconProps): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d="M5.99 18.01A8.5 8.5 0 1 1 18.01 18.01Z" />
    </Icon>
  );
}
