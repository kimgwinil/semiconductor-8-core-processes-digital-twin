import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';

export interface EquipmentAnchor {
  id: string;
  anchor: readonly [number, number];
}

interface MotionRoute {
  id: string;
  labelKo: string;
  labelEn: string;
  labelJa?: string;
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
    { id: 'argon', labelKo: '아르곤 유입 → 표면 세정 → 배기', labelEn: 'Argon inlet → surface sweep → exhaust', labelJa: 'アルゴン流入 → 表面掃引 → 排気', nodeIds: ['argon-flow', 'heat-shield', 'silicon-melt', 'exhaust-port'], durationS: 4.8, tone: 'info' },
    { id: 'pull', labelKo: '융액 → 메니스커스 → 결정 인상', labelEn: 'Melt → meniscus → crystal pulling', labelJa: '融液 → メニスカス → 結晶引上げ', nodeIds: ['silicon-melt', 'meniscus', 'crystal-body', 'neck', 'seed-chuck'], durationS: 5.6, tone: 'material' },
    { id: 'thermal', labelKo: '히터 → 도가니 → 고액 계면 열전달', labelEn: 'Heater → crucible → interface heat transfer', labelJa: 'ヒーター → るつぼ → 固液界面の熱伝達', nodeIds: ['graphite-heater', 'graphite-susceptor', 'quartz-crucible', 'silicon-melt', 'meniscus'], durationS: 4.2, tone: 'energy' },
    { id: 'crucible', labelKo: '회전축 → 서셉터 → 도가니 회전·승강', labelEn: 'Shaft → susceptor → crucible rotation and lift', labelJa: '回転軸 → サセプタ → るつぼ回転・昇降', nodeIds: ['crucible-shaft', 'graphite-susceptor', 'quartz-crucible'], durationS: 4.6, tone: 'material' },
  ],
  oxidation: [
    { id: 'oxidant', labelKo: '산화제 공급 → 웨이퍼 반응 → 배기', labelEn: 'Oxidant supply → wafer reaction → exhaust', labelJa: '酸化剤供給 → ウェーハ反応 → 排気', nodeIds: ['gas-supply-line', 'gas-injector', 'wafer-stack', 'exhaust-port'], durationS: 5.0, tone: 'info' },
    { id: 'thermal', labelKo: '다중 존 가열 → 온도 측정', labelEn: 'Multi-zone heating → temperature sensing', labelJa: '多ゾーン加熱 → 温度測定', nodeIds: ['multi-zone-heater', 'spike-thermocouple', 'profile-thermocouple'], durationS: 4.0, tone: 'energy' },
  ],
  photo: [
    { id: 'optical', labelKo: '레이저 → 레티클 → 웨이퍼 노광', labelEn: 'Laser → reticle → wafer exposure', labelJa: 'レーザー → レチクル → ウェーハ露光', nodeIds: ['excimer-laser', 'beam-delivery', 'illuminator', 'exposure-slit', 'reticle', 'projection-lens', 'final-lens', 'water-gap', 'wafer-stage'], durationS: 6.2, tone: 'energy' },
    { id: 'track', labelKo: '코팅 → 베이크 → 현상 이송', labelEn: 'Coating → bake → develop transfer', labelJa: '塗布 → ベーク → 現像搬送', nodeIds: ['hmds-prime', 'spin-coater', 'soft-bake', 'chill-plate', 'peb-plate', 'developer'], durationS: 6.8, tone: 'material' },
  ],
  etch: [
    { id: 'plasma', labelKo: '가스 → 플라즈마 → 이온 식각', labelEn: 'Gas → plasma → ion etching', labelJa: 'ガス → プラズマ → イオンエッチング', nodeIds: ['showerhead', 'bulk-plasma', 'sheath', 'ion-trajectory', 'esc'], durationS: 4.4, tone: 'energy' },
    { id: 'exhaust', labelKo: '반응 부산물 → 펌프 배기', labelEn: 'Reaction by-products → pump exhaust', labelJa: '反応副生成物 → ポンプ排気', nodeIds: ['bulk-plasma', 'pump-port', 'turbo-pump'], durationS: 4.8, tone: 'info' },
  ],
  deposition: [
    { id: 'sputter', labelKo: '타깃 → 스퍼터 입자 → 웨이퍼 증착', labelEn: 'Target → sputtered particles → wafer deposition', labelJa: 'ターゲット → スパッタ粒子 → ウェーハ成膜', nodeIds: ['sputter-target', 'plasma-torus', 'wafer-pedestal', 'vacuum-pump'], durationS: 4.8, tone: 'material' },
    { id: 'implant', labelKo: '이온원 → 분석·가속 → 웨이퍼 주입', labelEn: 'Ion source → analysis and acceleration → wafer implant', labelJa: 'イオン源 → 分析・加速 → ウェーハ注入', nodeIds: ['ion-source', 'extraction-electrode', 'analyzer-magnet', 'resolving-slit', 'accel-column', 'beam-scanner', 'tilted-wafer'], durationS: 6.0, tone: 'energy' },
  ],
  metal: [
    { id: 'plating', labelKo: '전원·구리 이온 → 웨이퍼 도금', labelEn: 'Power and copper ions → wafer plating', labelJa: '電源・銅イオン → ウェーハめっき', nodeIds: ['dc-power-supply', 'anode-cu', 'anode-membrane', 'plating-bath', 'wafer-face-down'], durationS: 5.4, tone: 'material' },
    { id: 'cmp', labelKo: '슬러리 공급 → 패드 연마 → 평탄화', labelEn: 'Slurry supply → pad polishing → planarization', labelJa: 'スラリー供給 → パッド研磨 → 平坦化', nodeIds: ['slurry-arm', 'wafer-face-down-cmp', 'polishing-pad', 'pad-conditioner'], durationS: 4.8, tone: 'info' },
  ],
  eds: [
    { id: 'signal', labelKo: '테스트 헤드 → 프로브 → 웨이퍼 신호', labelEn: 'Test head → probe → wafer signal', labelJa: 'テストヘッド → プローブ → ウェーハ信号', nodeIds: ['test-head', 'pogo-pin-unit', 'probe-card-pcb', 'space-transformer', 'probe-needle', 'wafer-chuck'], durationS: 5.2, tone: 'energy' },
    { id: 'contact', labelKo: '니들 접촉 → 오버드라이브 → 스크럽', labelEn: 'Needle contact → overdrive → scrub', labelJa: 'ニードル接触 → オーバードライブ → スクラブ', nodeIds: ['probe-needle', 'overdrive', 'scrub-mark'], durationS: 3.6, tone: 'material' },
  ],
  packaging: [
    { id: 'bond', labelKo: '볼 형성 → 1차 본드 → 스티치 본드', labelEn: 'Ball formation → first bond → stitch bond', labelJa: 'ボール形成 → 第1ボンド → ステッチボンド', nodeIds: ['efo-electrode', 'free-air-ball', 'capillary', 'ball-bond', 'stitch-bond'], durationS: 5.0, tone: 'energy' },
    { id: 'wire', labelKo: '와이어 공급 → 초음파 접합', labelEn: 'Wire feed → ultrasonic bonding', labelJa: 'ワイヤ供給 → 超音波接合', nodeIds: ['wire-clamp', 'ultrasonic-transducer', 'capillary', 'die-bond-pad'], durationS: 4.6, tone: 'material' },
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
export function EquipmentMotionOverlay({ processId, labels, activeRouteId }: {
  processId: string;
  labels: readonly EquipmentAnchor[];
  activeRouteId?: string;
}): React.ReactElement | null {
  const reduced = useReducedMotion();
  const lang = getLang();
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
    <g className={`equipMotion equipMotion--${processId}`} aria-label={t('equip.motionPaths')}>
      <defs>
        <filter id={`equip-motion-glow-${processId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {drawable.map(({ route, d, end }) => {
        const color = COLOR[route.tone];
        const routeLabel = lang === 'ko' ? route.labelKo : lang === 'ja' ? (route.labelJa ?? route.labelEn) : route.labelEn;
        const points = route.nodeIds.map((id) => anchors.get(id)).filter((p): p is readonly [number, number] => Boolean(p));
        return (
          <g
            key={route.id}
            className={`equipMotion__route equipMotion__route--${route.id}`}
            data-active={!activeRouteId || route.id === activeRouteId ? 'true' : 'false'}
            aria-label={routeLabel}
          >
            <path className="equipMotion__glow" d={d} fill="none" stroke={color} strokeWidth="13" strokeOpacity="0.16" filter={`url(#equip-motion-glow-${processId})`} />
            <path className="equipMotion__track" d={d} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.92" strokeDasharray="18 12" />
            {route.id === 'pull' && anchors.get('crystal-body') && (
              <g className="equipMotion__pullLift" stroke={color} fill="none">
                <line x1={anchors.get('crystal-body')?.[0]} y1={(anchors.get('crystal-body')?.[1] ?? 0) + 72} x2={anchors.get('crystal-body')?.[0]} y2={(anchors.get('crystal-body')?.[1] ?? 0) - 84} strokeWidth="10" strokeLinecap="round" />
                <polyline points={`${(anchors.get('crystal-body')?.[0] ?? 0) - 18},${(anchors.get('crystal-body')?.[1] ?? 0) - 58} ${anchors.get('crystal-body')?.[0]},${(anchors.get('crystal-body')?.[1] ?? 0) - 86} ${(anchors.get('crystal-body')?.[0] ?? 0) + 18},${(anchors.get('crystal-body')?.[1] ?? 0) - 58}`} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {route.id === 'thermal' && anchors.get('silicon-melt') && [0, 1, 2].map((ring) => (
              <ellipse
                key={`heat-ring-${ring}`}
                className="equipMotion__heatWave"
                style={{ animationDelay: `${ring * -0.65}s` }}
                cx={anchors.get('silicon-melt')?.[0]}
                cy={anchors.get('silicon-melt')?.[1]}
                rx="42" ry="20" fill="none" stroke={color} strokeWidth="7"
              />
            ))}
            {route.id === 'crucible' && anchors.get('quartz-crucible') && (
              <g className="equipMotion__crucibleMotion" stroke={color} fill="none">
                <ellipse cx={anchors.get('quartz-crucible')?.[0]} cy={anchors.get('quartz-crucible')?.[1]} rx="112" ry="35" strokeWidth="9" strokeDasharray="34 22" />
                <line x1={anchors.get('crucible-shaft')?.[0]} y1={(anchors.get('crucible-shaft')?.[1] ?? 0) + 52} x2={anchors.get('crucible-shaft')?.[0]} y2={(anchors.get('crucible-shaft')?.[1] ?? 0) - 50} strokeWidth="9" strokeLinecap="round" />
              </g>
            )}
            {points.map(([x, y], index) => (
              <circle key={`${route.id}-node-${index}`} className="equipMotion__node" cx={x} cy={y} r={index === 0 || index === points.length - 1 ? 9 : 6} fill={color} />
            ))}
            {reduced ? (
              <circle cx={end[0]} cy={end[1]} r="7" fill={color} opacity="0.9" />
            ) : [0, 1, 2, 3, 4].map((particle) => (
              <circle key={particle} r={particle === 0 ? 9 : 6} fill={color} opacity="0.96" filter={`url(#equip-motion-glow-${processId})`}>
                <animateMotion
                  dur={`${route.durationS}s`}
                  begin={`${-(particle * route.durationS) / 5}s`}
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
