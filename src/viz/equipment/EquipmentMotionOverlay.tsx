import { useEffect, useState } from 'react';

export interface EquipmentAnchor {
  id: string;
  anchor: readonly [number, number];
}

interface MotionRoute {
  id: string;
  labelKo: string;
  nodeIds: readonly string[];
  durationS: number;
  tone: 'info' | 'energy' | 'material';
}

/**
 * 장비 단면의 기존 라벨 앵커를 잇는 내부 동작 경로.
 * 새 좌표를 발명하지 않고 labels.json의 실물 부위 좌표만 사용한다.
 */
export const EQUIPMENT_MOTION_ROUTES: Readonly<Record<string, readonly MotionRoute[]>> = {
  wafer: [
    { id: 'argon', labelKo: '아르곤 유입·배기', nodeIds: ['argon-flow', 'silicon-melt', 'exhaust-port'], durationS: 4.8, tone: 'info' },
    { id: 'pull', labelKo: '결정 인상 경로', nodeIds: ['silicon-melt', 'meniscus', 'crystal-body', 'neck', 'seed-chuck'], durationS: 5.6, tone: 'material' },
  ],
  oxidation: [
    { id: 'oxidant', labelKo: '산화제 공급·배기', nodeIds: ['gas-supply-line', 'gas-injector', 'wafer-stack', 'exhaust-port'], durationS: 5.0, tone: 'info' },
    { id: 'thermal', labelKo: '가열·온도 계측', nodeIds: ['multi-zone-heater', 'spike-thermocouple', 'profile-thermocouple'], durationS: 4.0, tone: 'energy' },
  ],
  photo: [
    { id: 'optical', labelKo: '노광 광학 경로', nodeIds: ['excimer-laser', 'beam-delivery', 'illuminator', 'exposure-slit', 'reticle', 'projection-lens', 'final-lens', 'water-gap', 'wafer-stage'], durationS: 6.2, tone: 'energy' },
    { id: 'track', labelKo: '코팅·베이크·현상 이송', nodeIds: ['hmds-prime', 'spin-coater', 'soft-bake', 'chill-plate', 'peb-plate', 'developer'], durationS: 6.8, tone: 'material' },
  ],
  etch: [
    { id: 'plasma', labelKo: '가스·플라즈마·이온 경로', nodeIds: ['showerhead', 'bulk-plasma', 'sheath', 'ion-trajectory', 'esc'], durationS: 4.4, tone: 'energy' },
    { id: 'exhaust', labelKo: '반응 부산물 배기', nodeIds: ['bulk-plasma', 'pump-port', 'turbo-pump'], durationS: 4.8, tone: 'info' },
  ],
  deposition: [
    { id: 'sputter', labelKo: '스퍼터 입자 경로', nodeIds: ['sputter-target', 'plasma-torus', 'wafer-pedestal', 'vacuum-pump'], durationS: 4.8, tone: 'material' },
    { id: 'implant', labelKo: '이온 빔 수송 경로', nodeIds: ['ion-source', 'extraction-electrode', 'analyzer-magnet', 'resolving-slit', 'accel-column', 'beam-scanner', 'tilted-wafer'], durationS: 6.0, tone: 'energy' },
  ],
  metal: [
    { id: 'plating', labelKo: '전해 도금 전류·물질 경로', nodeIds: ['dc-power-supply', 'anode-cu', 'anode-membrane', 'plating-bath', 'wafer-face-down'], durationS: 5.4, tone: 'material' },
    { id: 'cmp', labelKo: 'CMP 슬러리·연마 경로', nodeIds: ['slurry-arm', 'wafer-face-down-cmp', 'polishing-pad', 'pad-conditioner'], durationS: 4.8, tone: 'info' },
  ],
  eds: [
    { id: 'signal', labelKo: '테스트 신호 경로', nodeIds: ['test-head', 'pogo-pin-unit', 'probe-card-pcb', 'space-transformer', 'probe-needle', 'wafer-chuck'], durationS: 5.2, tone: 'energy' },
    { id: 'contact', labelKo: '프로브 접촉·스크럽', nodeIds: ['probe-needle', 'overdrive', 'scrub-mark'], durationS: 3.6, tone: 'material' },
  ],
  packaging: [
    { id: 'bond', labelKo: '와이어 본딩 순서', nodeIds: ['efo-electrode', 'free-air-ball', 'capillary', 'ball-bond', 'stitch-bond'], durationS: 5.0, tone: 'energy' },
    { id: 'wire', labelKo: '와이어 공급·접합 경로', nodeIds: ['wire-clamp', 'ultrasonic-transducer', 'capillary', 'die-bond-pad'], durationS: 4.6, tone: 'material' },
  ],
};

const COLOR: Record<MotionRoute['tone'], string> = {
  info: 'var(--viz-info, #4598d8)',
  energy: 'var(--viz-spec, #ef635b)',
  material: 'var(--viz-series-2, #37a779)',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => setReduced(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return reduced;
}

/** 기존 장비 SVG 안에 삽입한다. 좌표계는 labels.json의 이미지 픽셀 좌표와 동일하다. */
export function EquipmentMotionOverlay({ processId, labels }: {
  processId: string;
  labels: readonly EquipmentAnchor[];
}): React.ReactElement | null {
  const reduced = useReducedMotion();
  const routes = EQUIPMENT_MOTION_ROUTES[processId] ?? [];
  const anchors = new Map(labels.map((label) => [label.id, label.anchor] as const));

  const drawable = routes.flatMap((route) => {
    const points = route.nodeIds.map((id) => anchors.get(id)).filter((p): p is readonly [number, number] => Boolean(p));
    if (points.length !== route.nodeIds.length || points.length < 2) return [];
    const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    const end = points[points.length - 1];
    return end ? [{ route, d, end }] : [];
  });
  if (drawable.length === 0) return null;

  return (
    <g className="equipMotion" aria-label="장비 내부 동작 경로">
      {drawable.map(({ route, d, end }) => {
        const color = COLOR[route.tone];
        return (
          <g key={route.id} aria-label={route.labelKo}>
            <path d={d} fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.58" strokeDasharray="10 10" />
            {reduced ? (
              <circle cx={end[0]} cy={end[1]} r="7" fill={color} opacity="0.9" />
            ) : [0, 1, 2].map((particle) => (
              <circle key={particle} r="6" fill={color} opacity="0.92">
                <animateMotion
                  dur={`${route.durationS}s`}
                  begin={`${-(particle * route.durationS) / 3}s`}
                  repeatCount="indefinite"
                  path={d}
                />
              </circle>
            ))}
          </g>
        );
      })}
    </g>
  );
}
