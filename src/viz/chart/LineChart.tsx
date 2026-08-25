/**
 * LineChart — x/y 시리즈 N개(**상한 없음** — 2026-08-21 에 3계열 상한을 제거했다). 축·눈금·단위 라벨 포함.
 * 반응형(viewBox + preserveAspectRatio) · 다크/라이트는 currentColor 와 CSS 변수로 대응.
 */
import type { CSSProperties, JSX } from 'react';
import type { SeriesTone } from './common';
import {
  CHART_STYLE, DEFAULT_MARGIN, LABEL_HALO, axisTitle, extent, formatTick, niceTicks, padDomain, scaler, styledSeries,
} from './common';

/**
 * 🔴 **획 반폭(`strokeWidth / 2`).** SVG 획은 **중심선** 좌표로 그려지고 화면에는 좌우로 반폭씩 번진다.
 *    그래서 「어떤 경계 위에 놓인 선」을 그 경계에서 정확히 잘라 내면 **폭이 절반**이 된다.
 *
 *    이 차트에서 가장 굵은 획은 규격선이다 — `common.ts` 의 `TONE_WIDTH.spec = 2.4` → 반폭 **1.2**.
 *    DSN 실측(2026-08-22): dpr 1 에서 데이터 점 1 device px 에 대해 **규격선 실폭은 1.32 device px** 뿐이다.
 *    절반이 되면 0.66 px 로 화면에서 사라진다. 그래서 `TONE_WIDTH.spec` 은 **낮추지 않으며**(정본은 common.ts),
 *    아래 `LINE_CHART_STYLE` 의 잘라 내는 경계는 **그릴 수 있는 자리에서 최소 이 값만큼 떨어져 있어야 한다.**
 *
 *    현재 여유 = `DEFAULT_MARGIN` 의 최소값 18(top·right) ≫ 1.2 이므로 잘리는 획은 **0개**다.
 *    여백을 줄이는 사람이 이 사실을 모르고 지나가지 못하도록 `tests/unit/linechart-clip-headroom.test.ts` 가 고정한다.
 */
export const MAX_STROKE_HALF_WIDTH_PX = 1.2;

/**
 * 🔴 **선 차트는 자기 틀 밖으로 잉크를 내보내지 않는다(OV-1 · 2026-08-22).**
 *
 * 공용 `CHART_STYLE` 은 `overflow: 'visible'` 이다. 그 값에서 `wafer.vgWindow` 의 V 곡선이
 * **svg 박스 위쪽으로 345.9 CSS px(375 px 폭) · 1024.8 CSS px(1440 px 폭)** 까지 삐져나와
 *   · 「판정은 이 차트에서 합니다」 배지 위를 지나가고(배지 면적의 1.19 % 에서 배지 대신 곡선이 잡혔다),
 *   · svg 박스 **밖** 128 지점(375 px)·294 지점(1440 px)에서 **히트테스트 최상위**가 되어
 *     본문(`.labChart__note`)의 클릭·드래그 선택을 가로챘다.
 * 실측 6차트 중 이 현상은 `wafer.vgWindow` 하나뿐이었다(나머지 5차트는 넘침 0).
 *
 * 🔴 **잘라 내는 경계는 「그림 영역(plot rect)」이 아니라 「차트 틀(viewBox)」이다. 이 구분이 핵심이다.**
 *    그림 영역에서 자르면 축을 넘어간 선이 **축에 딱 맞게 끝난 선과 구별되지 않는다** —
 *    학습자가 「내 동작점이 축 위로 벗어났다」는 정보를 잃는다. `wafer.vgWindow` 의 캡션·노트가
 *    바로 그 정보를 가르치고 있으므로(「V 를 올리면 창 위로 밀려난다, G 를 함께 올려 되돌리라」)
 *    지워서는 안 된다. 차트 틀에서 자르면 선은 **위쪽 여백 18 units 를 가로질러 달린 뒤 틀에서 잘리므로**
 *    「계속 이어진다」가 그대로 읽히고, 대신 **차트 밖 페이지로는 한 픽셀도 나가지 않는다.**
 *
 * ⚠️ `yDomain` 을 늘려 해결하지 않았다 — 늘리면 폭 0.065 의 합격창이 다시 뭉개진다(판정 완료 사항).
 * ⚠️ `common.ts` 의 `CHART_STYLE` 자체는 건드리지 않았다(다른 하위가 편집 중 · 읽기 전용).
 *    `BarChart` · `ProfileChart` 는 실측 넘침 0 이라 그대로 두었다.
 */
const LINE_CHART_STYLE: CSSProperties = { ...CHART_STYLE, overflow: 'hidden' };

export interface XYPoint { x: number; y: number }

export interface LineSeries {
  id: string;
  label: string;
  points: XYPoint[];
  color?: string;
  dashed?: boolean;
  /**
   * 🔴 **계열의 역할.** 붙어 있으면 데이터 계열이 아니라 **규격선/참고선**으로 그린다 —
   * 전용 색 · 전용 파선을 쓰고 **데이터 팔레트 순번을 소비하지 않는다**(`seriesStyles`).
   * 정본은 `models/labs/spec.ts` 의 `LabChartRefLine.tone` 이며 `ui/sections/LabCharts.tsx` 가 실어 보낸다.
   */
  tone?: SeriesTone;
}

export interface LineChartProps {
  series: LineSeries[];
  xLabel?: string;
  yLabel?: string;
  xUnit?: string;
  yUnit?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  width?: number;
  height?: number;
  showLegend?: boolean;
  /** 접근성 설명. 지정하지 않으면 축 라벨로 만든다. */
  ariaLabel?: string;
}

export function LineChart(props: LineChartProps): JSX.Element {
  const W = props.width ?? 640;
  const H = props.height ?? 340;
  const m = DEFAULT_MARGIN;
  const iw = Math.max(1, W - m.left - m.right);
  const ih = Math.max(1, H - m.top - m.bottom);

  const all = props.series.flatMap((s) => s.points);
  const xd = props.xDomain ?? extent(all.map((p) => p.x));
  const yd = props.yDomain ?? padDomain(extent(all.map((p) => p.y)));
  const sx = scaler(xd[0], xd[1], m.left, m.left + iw);
  const sy = scaler(yd[0], yd[1], m.top + ih, m.top);
  const xTicks = niceTicks(xd[0], xd[1], 5);
  const yTicks = niceTicks(yd[0], yd[1], 5);

  const path = (pts: XYPoint[]): string =>
    pts
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`)
      .join(' ');

  const legend = props.showLegend ?? props.series.length > 1;
  // 🔴 색·파선을 여기서 한 번에 정한다. 계열 본체와 범례가 **같은 배열**을 보므로 어긋날 수 없다.
  const styled = styledSeries(props.series);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={LINE_CHART_STYLE}
      role="img"
      aria-label={props.ariaLabel ?? `${axisTitle(props.yLabel, props.yUnit)} vs ${axisTitle(props.xLabel, props.xUnit)}`}
    >
      {/* 격자 */}
      <g stroke="currentColor" opacity={0.16}>
        {yTicks.map((t) => (
          <line key={`gy${t}`} x1={m.left} y1={sy(t)} x2={m.left + iw} y2={sy(t)} />
        ))}
        {xTicks.map((t) => (
          <line key={`gx${t}`} x1={sx(t)} y1={m.top} x2={sx(t)} y2={m.top + ih} />
        ))}
      </g>

      {/* 축 */}
      <g stroke="currentColor" strokeWidth={1.5} opacity={0.75}>
        <line x1={m.left} y1={m.top} x2={m.left} y2={m.top + ih} />
        <line x1={m.left} y1={m.top + ih} x2={m.left + iw} y2={m.top + ih} />
      </g>

      {/* 눈금 라벨 */}
      <g fill="currentColor" fontSize={12} opacity={0.8}>
        {yTicks.map((t) => (
          <text key={`ly${t}`} x={m.left - 8} y={sy(t) + 4} textAnchor="end">
            {formatTick(t)}
          </text>
        ))}
        {xTicks.map((t) => (
          <text key={`lx${t}`} x={sx(t)} y={m.top + ih + 18} textAnchor="middle">
            {formatTick(t)}
          </text>
        ))}
      </g>

      {/* 축 제목(단위 포함) */}
      <text x={m.left + iw / 2} y={H - 8} textAnchor="middle" fill="currentColor" fontSize={13} opacity={0.9}>
        {axisTitle(props.xLabel, props.xUnit)}
      </text>
      <text
        transform={`translate(14 ${m.top + ih / 2}) rotate(-90)`}
        textAnchor="middle"
        fill="currentColor"
        fontSize={13}
        opacity={0.9}
      >
        {axisTitle(props.yLabel, props.yUnit)}
      </text>

      {/* 시리즈 */}
      {styled.map(({ s, style }) => (
        <path
          key={s.id}
          d={path(s.points)}
          fill="none"
          data-series-tone={s.tone ?? 'data'}
          // 🔴 **계열은 포인터를 받지 않는다(OV-1 ⓐ).** 획의 히트 영역은 중심선 ± `strokeWidth / 2` 라
          //    선 위 어디서든 최상위 대상이 된다. 이 차트의 계열에는 툴팁·호버·클릭이 **하나도 없으므로**
          //    (`<title>` 0건 · 이벤트 핸들러 0건 — 2026-08-22 전수 확인) 잃는 상호작용이 없다.
          //    🔴 **svg 루트가 아니라 계열에만 건다.** 루트에 걸면 눈금 라벨·범례 텍스트의 **드래그 선택**까지 죽는다.
          //    🔴 **`BarChart` 에 따라 붙이지 마라** — 거기 막대에는 `<title>` 툴팁이 살아 있다(BarChart.tsx:97).
          pointerEvents="none"
          stroke={style.stroke}
          strokeWidth={style.width}
          strokeLinejoin="round"
          strokeLinecap={s.tone ? 'butt' : 'round'}
          strokeDasharray={style.dash}
        />
      ))}

      {/* 범례 */}
      {legend ? (
        <g fontSize={12} fill="currentColor">
          {styled.map(({ s, style }, i) => (
            <g key={`lg${s.id}`} transform={`translate(${m.left + 8} ${m.top + 6 + i * 18})`}>
              {/* 🔴 범례에도 파선을 그대로 넣는다 — 색만 보여 주면 색각 이상 사용자가 규격선을 못 가른다. */}
              <line x1={0} y1={0} x2={18} y2={0} stroke={style.stroke} strokeWidth={3} strokeDasharray={style.dash} />
              {/* 🔴 후광 — 범례는 플롯 **안**에 있어 데이터 곡선·규격 파선이 글자를 관통한다(2026-08-24 실측). */}
              <text x={24} y={4} style={LABEL_HALO}>{s.label}</text>
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

export default LineChart;
