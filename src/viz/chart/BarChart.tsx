/**
 * BarChart — 범주형 1시리즈 또는 그룹 N시리즈(**상한 없음** — 2026-08-21 에 3계열 상한을 제거했다).
 * 반응형 · currentColor/CSS 변수 · 가로 스크롤 유발 금지(라벨은 회전으로 흡수한다).
 */
import type { JSX } from 'react';
import { CHART_STYLE, DEFAULT_MARGIN, LABEL_HALO, axisTitle, extent, formatTick, niceTicks, scaler, seriesColor } from './common';

export interface BarGroup {
  /** 범주 이름 (x축) */
  category: string;
  /** 시리즈 개수만큼의 값. 부족하면 0 으로 본다. */
  values: number[];
}

export interface BarChartProps {
  groups: BarGroup[];
  /** 시리즈 이름. 개수 제한 없다. 생략하면 단일 시리즈로 본다. */
  seriesLabels?: string[];
  yLabel?: string;
  yUnit?: string;
  xLabel?: string;
  width?: number;
  height?: number;
  /** 범주 라벨을 기울인다(긴 한글 라벨 대응). */
  rotateLabels?: boolean;
  colors?: string[];
  ariaLabel?: string;
}

export function BarChart(props: BarChartProps): JSX.Element {
  const W = props.width ?? 640;
  const H = props.height ?? 340;
  const m = { ...DEFAULT_MARGIN, bottom: props.rotateLabels ? 74 : DEFAULT_MARGIN.bottom };
  const iw = Math.max(1, W - m.left - m.right);
  const ih = Math.max(1, H - m.top - m.bottom);

  /* 🔴 2026-08-21 — 종전 `Math.min(3, …)` 로 **막대 자체가 3개까지만** 그려졌다.
     `slice(0, 3)` 이 아니라 `Math.min` 이라 절단 전수 grep 에 **걸리지 않았다**(계측기 사각지대).
     상한의 근거는 `common.ts` 의 `MAX_SERIES` 와 같은 「근거 미상」이라 함께 없앴다. */
  const nSeries = Math.max(1, props.seriesLabels?.length ?? 1);
  const flat = props.groups.flatMap((g) => g.values.slice(0, nSeries));
  const [lo, hi] = extent(flat.concat([0]));
  const yMax = hi > 0 ? hi : 1;
  const yMin = lo < 0 ? lo : 0;
  const sy = scaler(yMin, yMax, m.top + ih, m.top);
  const yTicks = niceTicks(yMin, yMax, 5);

  const n = Math.max(1, props.groups.length);
  const slot = iw / n;
  const barW = (slot * 0.72) / nSeries;
  const zeroY = sy(0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={CHART_STYLE}
      role="img"
      aria-label={props.ariaLabel ?? axisTitle(props.yLabel, props.yUnit)}
    >
      <g stroke="currentColor" opacity={0.16}>
        {yTicks.map((t) => (
          <line key={`g${t}`} x1={m.left} y1={sy(t)} x2={m.left + iw} y2={sy(t)} />
        ))}
      </g>
      <g stroke="currentColor" strokeWidth={1.5} opacity={0.75}>
        <line x1={m.left} y1={m.top} x2={m.left} y2={m.top + ih} />
        <line x1={m.left} y1={zeroY} x2={m.left + iw} y2={zeroY} />
      </g>
      <g fill="currentColor" fontSize={12} opacity={0.8}>
        {yTicks.map((t) => (
          <text key={`t${t}`} x={m.left - 8} y={sy(t) + 4} textAnchor="end">
            {formatTick(t)}
          </text>
        ))}
      </g>

      {props.groups.map((grp, gi) => {
        const x0 = m.left + gi * slot + (slot - barW * nSeries) / 2;
        return (
          <g key={grp.category}>
            {Array.from({ length: nSeries }, (_, si) => {
              const v = grp.values[si] ?? 0;
              const y = sy(v);
              const top = Math.min(y, zeroY);
              const hgt = Math.max(1, Math.abs(zeroY - y));
              return (
                <rect
                  key={`${grp.category}-${si}`}
                  x={x0 + si * barW}
                  y={top}
                  width={Math.max(1, barW - 2)}
                  height={hgt}
                  rx={2}
                  fill={seriesColor(si, props.colors?.[si])}
                >
                  <title>{`${grp.category}: ${formatTick(v)}`}</title>
                </rect>
              );
            })}
            <text
              x={m.left + gi * slot + slot / 2}
              y={m.top + ih + (props.rotateLabels ? 14 : 18)}
              textAnchor={props.rotateLabels ? 'end' : 'middle'}
              fill="currentColor"
              fontSize={12}
              opacity={0.85}
              transform={props.rotateLabels ? `rotate(-40 ${m.left + gi * slot + slot / 2} ${m.top + ih + 14})` : undefined}
            >
              {grp.category}
            </text>
          </g>
        );
      })}

      <text
        transform={`translate(14 ${m.top + ih / 2}) rotate(-90)`}
        textAnchor="middle"
        fill="currentColor"
        fontSize={13}
        opacity={0.9}
      >
        {axisTitle(props.yLabel, props.yUnit)}
      </text>
      {props.xLabel ? (
        <text x={m.left + iw / 2} y={H - 6} textAnchor="middle" fill="currentColor" fontSize={13} opacity={0.9}>
          {props.xLabel}
        </text>
      ) : null}

      {props.seriesLabels && props.seriesLabels.length > 1 ? (
        <g fontSize={12} fill="currentColor">
          {props.seriesLabels.map((lab, i) => (
            <g key={lab} transform={`translate(${m.left + 8} ${m.top + 6 + i * 18})`}>
              <rect x={0} y={-8} width={14} height={10} fill={seriesColor(i, props.colors?.[i])} rx={2} />
              {/* 🔴 후광 — 범례가 플롯 안에 있어 막대·격자선이 글자를 관통한다. */}
              <text x={20} y={1} style={LABEL_HALO}>{lab}</text>
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

export default BarChart;
