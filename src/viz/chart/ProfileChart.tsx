/**
 * ProfileChart — 깊이-농도 같은 **세로축 프로파일**.
 * 세로축 = 깊이(위가 표면, 아래로 갈수록 깊다) · 가로축 = 값. 로그 스케일 옵션.
 * 반응형 · currentColor/CSS 변수 · 가로 스크롤 유발 금지.
 */
import type { JSX } from 'react';
import type { SeriesTone } from './common';
import { CHART_STYLE, DEFAULT_MARGIN, LABEL_HALO, axisTitle, extent, formatTick, niceTicks, scaler, styledSeries } from './common';

export interface ProfilePoint {
  depth: number;
  value: number;
}

export interface ProfileSeries {
  id: string;
  label: string;
  points: ProfilePoint[];
  color?: string;
  dashed?: boolean;
  /** 🔴 `LineSeries.tone` 과 같은 뜻 — 규격선/참고선은 전용 색·파선으로 그리고 팔레트 순번을 쓰지 않는다. */
  tone?: SeriesTone;
}

export interface ProfileChartProps {
  series: ProfileSeries[];
  depthLabel?: string;
  depthUnit?: string;
  valueLabel?: string;
  valueUnit?: string;
  /** 가로축 로그 스케일(농도 프로파일 기본 표기) */
  log?: boolean;
  depthDomain?: [number, number];
  valueDomain?: [number, number];
  /** 수평 표시선(예: Rp) */
  markers?: Array<{ depth: number; label: string }>;
  width?: number;
  height?: number;
  showLegend?: boolean;
  ariaLabel?: string;
}

function decadeTicks(lo: number, hi: number): number[] {
  const a = Math.floor(Math.log10(lo));
  const b = Math.ceil(Math.log10(hi));
  const out: number[] = [];
  for (let e = a; e <= b && out.length < 24; e++) out.push(Math.pow(10, e));
  return out;
}

export function ProfileChart(props: ProfileChartProps): JSX.Element {
  const W = props.width ?? 420;
  const H = props.height ?? 420;
  const m = { ...DEFAULT_MARGIN, left: 66, right: 24 };
  const iw = Math.max(1, W - m.left - m.right);
  const ih = Math.max(1, H - m.top - m.bottom);

  const all = props.series.flatMap((s) => s.points);
  const dd = props.depthDomain ?? extent(all.map((p) => p.depth));
  const positives = all.map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0);
  const rawV = props.valueDomain ?? extent(all.map((p) => p.value));
  const logLo = positives.length > 0 ? Math.min(...positives) : 1;
  const logHi = positives.length > 0 ? Math.max(...positives) : 10;
  const vLo = props.log ? (props.valueDomain?.[0] ?? logLo) : Math.min(0, rawV[0]);
  const vHi = props.log ? (props.valueDomain?.[1] ?? logHi) : rawV[1];

  const tx = props.log
    ? (() => {
        const s = scaler(Math.log10(Math.max(vLo, Number.MIN_VALUE)), Math.log10(Math.max(vHi, vLo * 10)), m.left, m.left + iw);
        return (v: number) => s(Math.log10(Math.max(v, vLo)));
      })()
    : scaler(vLo, vHi, m.left, m.left + iw);
  // 깊이는 아래로 증가 — 표면(최소 깊이)이 위다
  const ty = scaler(dd[0], dd[1], m.top, m.top + ih);

  const vTicks = props.log ? decadeTicks(Math.max(vLo, Number.MIN_VALUE), Math.max(vHi, vLo * 10)) : niceTicks(vLo, vHi, 4);
  const dTicks = niceTicks(dd[0], dd[1], 5);
  // 🔴 계열 본체와 범례가 같은 배열을 본다 — 색·파선이 어긋날 수 없다.
  const styled = styledSeries(props.series);

  const path = (pts: ProfilePoint[]): string =>
    pts
      .filter((p) => Number.isFinite(p.depth) && Number.isFinite(p.value))
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.value).toFixed(2)},${ty(p.depth).toFixed(2)}`)
      .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={CHART_STYLE}
      role="img"
      aria-label={props.ariaLabel ?? `${axisTitle(props.valueLabel, props.valueUnit)} / ${axisTitle(props.depthLabel, props.depthUnit)}`}
    >
      <g stroke="currentColor" opacity={0.16}>
        {dTicks.map((t) => (
          <line key={`gd${t}`} x1={m.left} y1={ty(t)} x2={m.left + iw} y2={ty(t)} />
        ))}
        {vTicks.map((t) => (
          <line key={`gv${t}`} x1={tx(t)} y1={m.top} x2={tx(t)} y2={m.top + ih} />
        ))}
      </g>

      <g stroke="currentColor" strokeWidth={1.5} opacity={0.75}>
        <line x1={m.left} y1={m.top} x2={m.left} y2={m.top + ih} />
        <line x1={m.left} y1={m.top} x2={m.left + iw} y2={m.top} />
      </g>

      <g fill="currentColor" fontSize={12} opacity={0.8}>
        {dTicks.map((t) => (
          <text key={`td${t}`} x={m.left - 8} y={ty(t) + 4} textAnchor="end">
            {formatTick(t)}
          </text>
        ))}
        {vTicks.map((t) => (
          <text key={`tv${t}`} x={tx(t)} y={m.top - 6} textAnchor="middle">
            {formatTick(t)}
          </text>
        ))}
      </g>

      {(props.markers ?? []).map((mk) => (
        <g key={`mk${mk.depth}${mk.label}`}>
          <line
            x1={m.left}
            y1={ty(mk.depth)}
            x2={m.left + iw}
            y2={ty(mk.depth)}
            stroke="currentColor"
            strokeWidth={1.4}
            strokeDasharray="5 4"
            opacity={0.65}
          />
          {/* 🔴 후광 — 마커 라벨은 플롯 안 오른쪽 끝에 붙어 프로파일 곡선과 겹친다. */}
          <text x={m.left + iw - 4} y={ty(mk.depth) - 5} textAnchor="end" fill="currentColor" fontSize={11} opacity={0.85} style={LABEL_HALO}>
            {mk.label}
          </text>
        </g>
      ))}

      {styled.map(({ s, style }) => (
        <path
          key={s.id}
          d={path(s.points)}
          fill="none"
          data-series-tone={s.tone ?? 'data'}
          stroke={style.stroke}
          strokeWidth={style.width}
          strokeLinejoin="round"
          strokeDasharray={style.dash}
        />
      ))}

      <text
        transform={`translate(16 ${m.top + ih / 2}) rotate(-90)`}
        textAnchor="middle"
        fill="currentColor"
        fontSize={13}
        opacity={0.9}
      >
        {axisTitle(props.depthLabel, props.depthUnit)}
      </text>
      <text x={m.left + iw / 2} y={H - 10} textAnchor="middle" fill="currentColor" fontSize={13} opacity={0.9}>
        {axisTitle(props.valueLabel, props.valueUnit)}
        {props.log ? ' · log' : ''}
      </text>

      {(props.showLegend ?? props.series.length > 1) ? (
        <g fontSize={12} fill="currentColor">
          {styled.map(({ s, style }, i) => (
            <g key={`lg${s.id}`} transform={`translate(${m.left + 10} ${m.top + ih - 8 - i * 18})`}>
              {/* 🔴 범례에도 파선을 넣는다 — 색만으로는 색각 이상 사용자가 규격선을 못 가른다. */}
              <line x1={0} y1={0} x2={18} y2={0} stroke={style.stroke} strokeWidth={3} strokeDasharray={style.dash} />
              {/* 🔴 후광 — 범례가 플롯 안에 있어 프로파일 곡선이 글자를 관통한다. */}
              <text x={24} y={4} style={LABEL_HALO}>{s.label}</text>
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

export default ProfileChart;
