import { WaferIcon } from '@/ui/icons/WaferIcon';
import { OxidationIcon } from '@/ui/icons/OxidationIcon';
import { PhotoIcon } from '@/ui/icons/PhotoIcon';
import { EtchIcon } from '@/ui/icons/EtchIcon';
import { DepositionIcon } from '@/ui/icons/DepositionIcon';
import { MetalIcon } from '@/ui/icons/MetalIcon';
import { EdsIcon } from '@/ui/icons/EdsIcon';
import { PackagingIcon } from '@/ui/icons/PackagingIcon';
import type { IconProps } from '@/ui/icons/Icon';

/**
 * 공정 아이콘 배분기 — 공정 id 하나를 받아 그 공정의 인라인 SVG 를 그린다.
 *
 * 🔴 **여기는 배럴(`index.ts`)이 아니다.** `Icon.tsx` 가 막는 것은 「쓸 자리 없이 모아만 둔 것」이고,
 *    이 파일은 **호출부가 2곳(사이드바·허브 카드)인 실제 배분기**다. 8종 전부 이 표를 통해 렌더된다.
 *    표를 두 화면에 각각 복사하면 공정이 늘 때 한쪽만 고쳐지므로 한 곳으로 모은다.
 *    (배럴을 만들면 배선 검사 W4 가 추가로 붙는다 — 만들지 마라.)
 *
 * 🔴 **표의 값은 컴포넌트 참조가 아니라 「JSX 를 반환하는 함수」다.** 이유가 있다:
 *    `{ wafer: WaferIcon }` 처럼 참조만 담고 `<Glyph />` 로 부르면 트리 어디에도 `<WaferIcon` 이라는
 *    **리터럴 태그가 없다.** 배선 검사(`scripts/check-wiring.mjs`) W5 는 정규식으로 리터럴 JSX 호출부를
 *    세므로 8종 전부 「import 만 되고 렌더 안 됨」으로 잡힌다(DEV 실측: 참조 방식일 때 W5 위반 8건 발생).
 *    아래처럼 쓰면 실제로 이 파일 안에서 리터럴 JSX 로 렌더되므로 검사와 사실이 일치한다.
 *
 * 🔴 종전에는 `Sidebar.tsx` 안의 이모지 1자 문자열 맵이었다(`💿🔥💡⚡🧪🔗🔬📦`).
 *    이모지는 **폰트 글리프**라 플랫폼마다 다른 그림이 나오고, `stroke-width` 를 줄 수 없으며,
 *    **색이 글자를 따라가지 않는다** — 활성 행 반전 배경에서 글자만 반전되고 이모지는 제 색으로 남았다.
 *    `currentColor` 인라인 SVG 가 그 셋을 한꺼번에 없앤다.
 *
 * 크기는 호출부 CSS 의 `font-size` 가 정한다(`.icon { inline-size: 1em }`). 색은 부모의 `color` 를 상속한다.
 */
const PROCESS_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  wafer: (p) => <WaferIcon {...p} />,
  oxidation: (p) => <OxidationIcon {...p} />,
  photo: (p) => <PhotoIcon {...p} />,
  etch: (p) => <EtchIcon {...p} />,
  deposition: (p) => <DepositionIcon {...p} />,
  metal: (p) => <MetalIcon {...p} />,
  eds: (p) => <EdsIcon {...p} />,
  packaging: (p) => <PackagingIcon {...p} />,
};

export function ProcessIcon({ processId, className, label }: IconProps & {
  /** `content/catalog` 의 공정 id. 8공정 전부 위 표에 등록돼 있다. */
  processId: string;
}): React.ReactElement {
  const draw = PROCESS_ICON[processId];
  if (draw) return draw({ className, label });

  /**
   * 🔴 **미등록 공정 폴백. 지금은 도달하지 않는다** — 8공정이 전부 위 표에 있다.
   *    그래도 지우면 9번째 공정이 생겼을 때 화면이 조용히 빈칸이 된다. 남겨 둔다.
   *
   * 🔴 왜 9번째 SVG 를 미리 그리지 않았나: `Icon.tsx` 가 「쓸 자리가 있을 때만 만든다」를 명시한다.
   *    아직 없는 공정의 아이콘은 호출부 0인 死코드이고, 배선 검사 W5 에 그대로 잡힌다.
   *    종전 폴백 `⚙️` 를 그대로 둔다 — **눈에 띄게 이질적인 것이 오히려 낫다.** 8종과 확연히 달라
   *    「등록이 빠졌다」가 화면에서 바로 읽힌다. 위 표에 한 줄 넣으면 사라진다.
   */
  return <span aria-hidden="true">⚙️</span>;
}
