import { Icon, type IconProps } from '@/ui/icons/Icon';

/**
 * 앞·뒤 공정으로 가는 화살표. 사이드바 하단 이동 링크에 붙는다.
 *
 * 🔴 종전에는 본문 안의 `←`·`→` 글리프였다. 화살표는 **글자가 아니라 아이콘**이라
 *    폰트 대체가 걸리면 크기·베이스라인이 옆 글자와 어긋난다(§6-6).
 * 장식용이다 — 링크 글자(앞/뒤 공정 이름)가 이미 뜻을 말한다. 그래서 `label` 을 주지 않는다.
 */
export function ArrowIcon({ className, label, dir }: IconProps & {
  /** `prev` = 뒤(시작 방향), `next` = 앞(진행 방향). */
  dir: 'prev' | 'next';
}): React.ReactElement {
  return (
    <Icon className={className} label={label}>
      <path d={dir === 'prev' ? 'M19.5 12h-15m6-6-6 6 6 6' : 'M4.5 12h15m-6-6 6 6-6 6'} />
    </Icon>
  );
}
