import { useMemo } from 'react';
import type { LabParam, LabSpec } from '@/models/labs/spec';
import { isDiscreteParam, paramOptionCount, paramOptions } from '@/models/labs/spec';
import type { Quantity } from '@/models/contract';
import { LineChart } from '@/viz';
import { DEFAULT_MARGIN, LABEL_HALO, extent, padDomain, scaler } from '@/viz/chart/common';
import { formatQuantity, inPassWindow } from '@/lib/format';
import { t } from '@/lib/i18n';
import { passBasisNode } from '@/ui/widgets/PassBasisBadge';
import '@/ui/styles/instruments.css';

/**
 * 🔴 **스코프 패널** — 「지금 만지고 있는 입력을 축으로, 판정 출력이 어떻게 변하는가」.
 *
 * CEO 지시(2026-08-22): 「내부 구조 · 안에서 어떤 일이 일어나고 있고 · 외부 조정값에 의하여
 * 어떻게 내부에서 동작하는지 및 그것에 대한 **계측기 및 스코프(파형 보는 것)**」.
 *
 * 종전 화면은 ①씬 ②숫자 ③차트(공정별 고정 축)까지였다. 없던 것은 **「내가 지금 돌리는 손잡이」와
 * 「판정」을 같은 그림에 놓는 축**이다. `charts:` 는 명세가 정한 고정 축이라 학습자가 다른 슬라이더를
 * 잡으면 그 손잡이는 그림에서 사라진다. 스코프는 반대로 **손잡이를 따라간다.**
 *
 * ## 무엇을 그리는가 (🔴 A15 — 물리를 지어내지 않는다)
 * 가로축 격자마다 **`spec.compute()` 를 그 입력으로 실제로 다시 부른다.** 보간·근사·곡선 맞춤이
 * 하나도 없다. 화면의 곡선 위 어느 점이든 그 x 로 슬라이더를 옮기면 출력 지표와 **정확히 같은 수**가 나온다.
 * (그래서 느릴 수 있다 — 아래 「성능」 참조.)
 *
 * ## 🔴 A14 — 끊어 그린다, 이어 그리지 않는다
 * 스윕 도중 `compute()` 가 `OutOfLimitError` 를 던지거나 비유한값이 나오는 구간은 **점을 만들지 않고
 * 계열을 거기서 끊는다.** 계열 하나를 통째로 넘기면 `LineChart` 의 `path()` 가 비유한 점만 걸러내고
 * 남은 점을 `L` 로 이어 붙여 **금지 구간을 가로지르는 가짜 직선**이 생긴다. 그래서 연속 구간마다
 * **별도 계열**로 쪼갠다(`runs`). 계열이 여럿이어도 색은 하나로 고정한다 — 아래 `SCOPE_COLOR` 참조.
 *
 * ## 🔴 성능 — 드래그 중에는 스윕을 다시 돌리지 않는다
 * 스윕 결과는 **「지금 만지는 파라미터를 뺀 나머지 입력」에만** 의존한다. 그 파라미터 자신의 값은
 * 곡선을 바꾸지 않고 **마커 위치만** 바꾼다. 그래서 memo 키에서 활성 파라미터를 빼면
 * 슬라이더를 끌 때 `compute()` 가 **0회** 다시 돌고 마커만 움직인다. 이게 「스코프」의 감각이다.
 *
 * ## 🔴 색만으로 구분하지 않는다
 * · 합격창 = 반투명 면 **＋ 대각 해치 무늬** ＋ 「합격창」 글자표
 * · 규격 경계 = 빨강 **장-단 파선**(`tone: 'spec'` — 공용 규약)
 * · 현재 동작점 = 세로 파선 ＋ **속 빈 원 + 흰 테**, 그리고 값이 **글자로** 함께 나온다
 */

/** 스윕 격자 상한. 이 이상은 `step` 을 건너뛰며 솎는다(성능). */
const SWEEP_MAX_POINTS = 61;

/** 🔴 계열이 여러 개로 쪼개져도(금지 구간 때문에) **같은 곡선**으로 읽혀야 한다. 색을 못박는다. */
const SCOPE_COLOR = 'var(--viz-series-1, #1f6feb)';

/** `LineChart` 기본 뷰박스. 오버레이가 **같은 좌표계**를 써야 하므로 여기서 못박고 그대로 넘긴다. */
const SCOPE_VB_W = 640;
const SCOPE_VB_H = 340;

export interface LabScopeProps {
  spec: LabSpec;
  inputs: Readonly<Record<string, number>>;
  /** 학습자가 마지막으로 만진 슬라이더. 없으면 첫 파라미터. */
  activeParamId: string | null;
  /** 현재 입력의 계산 결과. 마커의 y 는 **여기서** 온다(스윕 값이 아니라 실제 출력이다). */
  q: Record<string, Quantity>;
  /** 세로축에 올릴 출력 id. 부모가 상태로 들고 있다(선택 UI 가 부모에 있다). */
  outputId: string | null;
  onSelectOutput(id: string): void;
  lang: string;
}

export function LabScope(props: LabScopeProps): React.ReactElement | null {
  const { spec, inputs, activeParamId, q, lang } = props;

  const param: LabParam | undefined = useMemo(
    () => spec.params.find((p) => p.id === activeParamId) ?? spec.params[0],
    [spec.params, activeParamId],
  );

  /** 스코프에 올릴 수 있는 출력 — **판정 출력 우선.** 판정이 하나도 없으면 표시 출력이라도 올린다. */
  const candidates = useMemo(() => {
    const judges = spec.outputs.filter((o) => o.role === 'judge');
    return judges.length > 0 ? judges : spec.outputs;
  }, [spec.outputs]);

  const output = useMemo(
    () => candidates.find((o) => o.id === props.outputId) ?? candidates[0],
    [candidates, props.outputId],
  );

  /* 🔴 **memo 키에서 활성 파라미터를 뺀다.** 위 「성능」 항의 핵심 한 줄이다.
     빼지 않으면 슬라이더 한 번 끌 때마다 61회 × 프레임수 만큼 `compute()` 가 돈다. */
  const otherInputsSig = useMemo(() => {
    const pid = param?.id;
    return Object.keys(inputs).sort()
      .filter((k) => k !== pid)
      .map((k) => `${k}:${inputs[k]}`)
      .join('|');
  }, [inputs, param?.id]);

  const sweep = useMemo(
    () => (param ? runSweep(spec, inputs, param) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 🔴 `inputs` 대신 서명을 쓴다(위 「성능」).
    [spec, param, otherInputsSig],
  );

  if (!param || !output || !sweep) return null;

  const cur = q[output.id];
  const curX = inputs[param.id] ?? param.initial;
  const pass = output.role === 'judge' ? output.pass : undefined;

  /* 연속 구간별 계열. 🔴 금지 구간을 가로지르는 선을 만들지 않는다. */
  const runs = splitRuns(sweep, output.id);

  /* 🔴 **선택지가 5개 이하인 축은 「선」이 아니라 「점 몇 개」다.**
     그런데 `LineChart` 는 점을 이어 그리므로, 3택짜리 축도 매끈한 꺾은선으로 보인다 —
     보는 사람은 그 선 위 아무 데나 설 수 있다고 읽는다. **그건 사실이 아니다.**
     그래서 이 경우에만 표본 점을 **눈에 띄게 찍어** 「여기밖에 못 선다」를 보이게 한다.
     ⛔ 선을 지우지는 않는다 — 추세를 읽는 단서는 남긴다. 점이 사실을 말한다. */
  const discrete = isDiscreteParam(param);
  const ys = runs.flatMap((r) => r.map((pt) => pt.y));
  if (ys.length === 0) {
    // 스윕 전 구간이 계산 불가 — **지어내지 않고 그 사실을 말한다.**
    return (
      <section className="scope scope--empty">
        <h3>{t('lab.scope')}</h3>
        <p className="scope__empty">{t('lab.scopeNoData')}</p>
      </section>
    );
  }

  const bounds = [
    ...ys,
    ...(pass?.min !== undefined && Number.isFinite(pass.min) ? [pass.min] : []),
    ...(pass?.max !== undefined && Number.isFinite(pass.max) ? [pass.max] : []),
    ...(cur && Number.isFinite(cur.value) ? [cur.value] : []),
  ];
  const yDomain = padDomain(extent(bounds));
  const xDomain: [number, number] = [param.min, param.max];

  const series = runs.map((pts, i) => ({
    id: `scope-run-${i}`,
    label: lang === 'en' ? output.en : output.ko,
    points: pts,
    color: SCOPE_COLOR,
  }));

  /* 규격 경계선 — 공용 규약대로 `tone: 'spec'`(빨강 장-단 파선). 팔레트 순번을 소비하지 않는다. */
  const refSeries = [
    ...(pass?.min !== undefined && Number.isFinite(pass.min)
      ? [{ id: 'scope-ref-min', label: t('lab.scopeSpecMin'), value: pass.min }] : []),
    ...(pass?.max !== undefined && Number.isFinite(pass.max)
      ? [{ id: 'scope-ref-max', label: t('lab.scopeSpecMax'), value: pass.max }] : []),
  ].map((r) => ({
    id: r.id,
    label: r.label,
    points: [{ x: xDomain[0], y: r.value }, { x: xDomain[1], y: r.value }],
    dashed: true,
    tone: 'spec' as const,
  }));

  const paramName = lang === 'en' ? param.en : param.ko;
  const paramUnit = lang === 'en' ? (param.unitEn ?? param.unit) : param.unit;
  const outputName = lang === 'en' ? output.en : output.ko;
  const curPass = cur && pass ? inPassWindow(pass, cur.value) : null;

  return (
    <section className="scope" data-scope-param={param.id} data-scope-output={output.id}>
      <div className="scope__head">
        <h3>{t('lab.scope')}</h3>
        {/* 🔴 「무엇을 무엇으로 보고 있는가」를 글자로 못박는다. 축 라벨만 있으면
            학습자가 「이게 내가 방금 만진 그 손잡이인가」를 확신하지 못한다. */}
        <p className="scope__lead">{t('lab.scopeLead', { param: paramName, output: outputName })}</p>
        {candidates.length > 1 && (
          <label className="scope__pick">
            <span>{t('lab.scopeAxis')}</span>
            <select
              value={output.id}
              onChange={(e) => props.onSelectOutput(e.target.value)}
              aria-label={t('lab.scopeAxis')}
            >
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>{lang === 'en' ? o.en : o.ko}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* 🔴 차트 본체는 **기존 `LineChart` 그대로**다. 새 차트 엔진을 만들지 않았다.
          합격창 띠와 현재 동작점 마커만 **같은 viewBox 를 쓰는 오버레이 SVG** 로 겹친다 —
          `xDomain`·`yDomain` 을 명시로 넘기므로 두 그림의 좌표 변환이 **정의상 같다.**
          (넘기지 않으면 `LineChart` 가 `padDomain(extent(...))` 로 스스로 정하고, 오버레이는
           그 결정을 알 수 없어 어긋난다. 그래서 도메인은 여기서 계산해 **양쪽에 같은 값**을 준다.) */}
      <div className="scope__plot">
        <LineChart
          series={[...series, ...refSeries]}
          width={SCOPE_VB_W}
          height={SCOPE_VB_H}
          xLabel={paramName} xUnit={paramUnit}
          yLabel={outputName} yUnit={cur ? (lang === 'en' ? (cur.unitEn ?? cur.unit) : cur.unit) : undefined}
          xDomain={xDomain} yDomain={yDomain}
          showLegend={false}
          ariaLabel={t('lab.scopeLead', { param: paramName, output: outputName })}
        />
        <ScopeOverlay
          xDomain={xDomain} yDomain={yDomain}
          passMin={pass?.min} passMax={pass?.max}
          curX={curX} curY={cur?.value}
          bandLabel={t('lab.scopeBand')}
          samples={discrete ? runs.flat() : undefined}
        />
      </div>

      {/* 자체 범례 — 🔴 `LineChart` 범례를 끈 이유: 금지 구간 때문에 계열이 N개로 쪼개지면
          같은 이름이 N줄 쌓인다. 여기서는 **의미 단위 3줄**로 낸다. */}
      <ul className="scope__legend">
        <li><Swatch kind="data" /> {outputName}</li>
        {refSeries.length > 0 && <li><Swatch kind="spec" /> {t('lab.scopeSpecLine')}</li>}
        {(pass?.min !== undefined || pass?.max !== undefined) && (
          // 🔴 합격창 근거를 **범례에** 단다. 띠 자체는 `ScopeOverlay` 의 `<svg aria-hidden>` 안이라
          //    HTML 배지를 넣을 수 없고, 넣더라도 스크린리더에 닿지 않는다. 범례는 띠를 설명하는
          //    자리이므로 「저 초록 띠가 어디서 온 창인가」가 붙을 자리로 맞다.
          //    세 표시 지점이 **같은 함수**(`passBasisNode`)를 부른다 — 갈라질 수 없다.
          <li><Swatch kind="band" /> {t('lab.scopeBand')} {passBasisNode(spec, output)}</li>
        )}
        <li><Swatch kind="marker" /> {t('lab.scopeMarker')}</li>
      </ul>

      <p className="scope__readout" role="status">
        <strong>{paramName} = {formatQuantity(curX, undefined)} {paramUnit}</strong>
        {cur && (
          <span className={curPass === false ? 'scope__now scope__now--fail' : 'scope__now'}>
            {outputName} = {formatQuantity(cur.value, output.digits)} {lang === 'en' ? (cur.unitEn ?? cur.unit) : cur.unit}
            {curPass !== null && ` · ${curPass ? t('lab.pass') : t('lab.fail')}`}
          </span>
        )}
        {sweep.blocked > 0 && (
          // 🔴 끊긴 구간이 있으면 **왜 끊겼는지** 말한다. 말없이 끊으면 「버그로 안 그려진 것」과 구별이 안 된다.
          <span className="scope__blocked">{t('lab.scopeBlocked', { n: sweep.blocked })}</span>
        )}
      </p>
      {/* 🔴 점이 몇 개뿐인지는 **그림만으로 끝내지 않는다.** 오버레이는 `aria-hidden` 이라
          스크린리더에 닿지 않고, 색·크기만으로 「3점뿐」을 읽게 하는 것도 위험하다. */}
      {discrete && (
        <p className="scope__discrete">{t('lab.scopeDiscrete', { n: paramOptionCount(param) })}</p>
      )}
      <p className="scope__note">{t('lab.scopeNote', { n: sweep.points.length })}</p>
    </section>
  );
}

/* ---------------- 오버레이 ---------------- */

/**
 * 합격창 띠 + 현재 동작점 마커.
 *
 * 🔴 `LineChart` 를 고치지 않고 겹친다. 같은 `viewBox`·같은 `preserveAspectRatio`·같은 여백을 쓰면
 *    두 그림은 **픽셀 단위로 같은 격자** 위에 앉는다. `DEFAULT_MARGIN` 을 import 로 가져오므로
 *    나중에 누가 여백을 바꿔도 **자동으로 따라간다**(숫자를 손으로 베끼면 그 순간부터 어긋난다).
 * 🔴 `pointerEvents: none` — 아래 차트의 드래그 선택을 뺏지 않는다.
 * 🔴 `aria-hidden` — 같은 정보를 위 `role="status"` 판독부가 **글자로** 말한다. 스크린리더에 두 번 읽히지 않게 한다.
 */
function ScopeOverlay({ xDomain, yDomain, passMin, passMax, curX, curY, bandLabel, samples }: {
  xDomain: [number, number];
  yDomain: [number, number];
  passMin?: number;
  passMax?: number;
  curX: number;
  curY?: number;
  bandLabel: string;
  /**
   * 🔴 **선택지가 5개 이하일 때만** 넘어온다. 학습자가 실제로 설 수 있는 점 전부다.
   *    넘어오지 않으면(연속 축) 아무것도 그리지 않는다 — 61점을 다 찍으면 선이 지저분해질 뿐이다.
   */
  samples?: Array<{ x: number; y: number }>;
}): React.ReactElement {
  const m = DEFAULT_MARGIN;
  const iw = Math.max(1, SCOPE_VB_W - m.left - m.right);
  const ih = Math.max(1, SCOPE_VB_H - m.top - m.bottom);
  const sx = scaler(xDomain[0], xDomain[1], m.left, m.left + iw);
  const sy = scaler(yDomain[0], yDomain[1], m.top + ih, m.top);

  /* 합격창을 화면 안으로 자른다. 창이 도메인 밖으로 열려 있으면(편측 규격) 그림 경계까지 채운다 —
     그게 사실이다. 열린 쪽을 임의의 값에서 끊으면 「거기까지만 합격」이라는 거짓말이 된다. */
  const yTop = sy(Math.min(passMax ?? yDomain[1], yDomain[1]));
  const yBot = sy(Math.max(passMin ?? yDomain[0], yDomain[0]));
  const hasBand = passMin !== undefined || passMax !== undefined;
  const bandY = Math.min(yTop, yBot);
  const bandH = Math.abs(yBot - yTop);

  const px = Number.isFinite(curX) ? sx(curX) : null;
  const py = curY !== undefined && Number.isFinite(curY) ? sy(curY) : null;
  const pyIn = py !== null && py >= m.top && py <= m.top + ih;

  return (
    <svg
      className="scope__overlay"
      viewBox={`0 0 ${SCOPE_VB_W} ${SCOPE_VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* 🔴 무늬로 한 번 더 구분한다 — 색각 이상 사용자에게 띠가 「연한 회색 사각형」으로만 보이면 안 된다. */}
        <pattern id="scopeBandHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--ok, #1a7f4b)" strokeWidth="1.4" opacity="0.42" />
        </pattern>
      </defs>

      {hasBand && bandH > 0 && (
        <g>
          <rect
            x={m.left} y={bandY} width={iw} height={bandH}
            fill="url(#scopeBandHatch)"
            stroke="var(--ok, #1a7f4b)" strokeWidth={1} strokeOpacity={0.55}
          />
          {/* 🔴 후광 — 이 라벨은 **띠 안**에 있다. 띠가 얇으면 위·아래 규격 일점쇄선이
                 글자를 잘라내고 해칭 사선이 관통한다(2026-08-24 전수 육안 실측: deposition·
                 wafer·oxidation lab 절에서 재현). 좌표는 그대로 두고 가독성만 되살린다. */}
          <text
            x={m.left + 6} y={bandY + 13}
            fontSize={11} fill="var(--ok, #1a7f4b)" opacity={0.95}
            style={LABEL_HALO}
          >
            {bandLabel}
          </text>
        </g>
      )}

      {/* 🔴 **선택 가능한 점.** 흰 테를 두른 속 찬 원 — 곡선 색과 겹쳐도 개수가 세어진다.
          `aria-hidden` 인 오버레이라 같은 사실을 아래 `.scope__discrete` 가 **글자로** 말한다. */}
      {samples && samples.map((s, i) => {
        const dx = sx(s.x);
        const dy = sy(s.y);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
        if (dy < m.top || dy > m.top + ih) return null;
        return (
          <g key={`${s.x}-${i}`}>
            <circle cx={dx} cy={dy} r={5} fill="var(--surface, #ffffff)" />
            <circle cx={dx} cy={dy} r={5} fill={SCOPE_COLOR} fillOpacity={0.95}
              stroke="var(--surface, #ffffff)" strokeWidth={2} />
          </g>
        );
      })}

      {px !== null && (
        <g>
          {/* 현재 x — 세로 파선. 슬라이더를 끌면 **이 선이 곡선 위를 달린다.** */}
          <line
            x1={px} y1={m.top} x2={px} y2={m.top + ih}
            stroke="currentColor" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.7}
          />
          {/* 축 위 삼각 표식 — 세로선이 격자선과 겹쳐 보일 때의 보조 단서. */}
          <path
            d={`M${px - 5},${m.top + ih + 6} L${px + 5},${m.top + ih + 6} L${px},${m.top + ih} Z`}
            fill="currentColor" opacity={0.8}
          />
          {pyIn && py !== null && (
            <g>
              {/* 흰 테를 두른 속 빈 원 — 곡선 색과 겹쳐도 원의 형태가 남는다. */}
              <circle cx={px} cy={py} r={6.5} fill="none" stroke="var(--surface, #ffffff)" strokeWidth={3.5} />
              <circle cx={px} cy={py} r={6.5} fill="none" stroke="currentColor" strokeWidth={2} />
              <circle cx={px} cy={py} r={1.8} fill="currentColor" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

/** 범례 색표 — 🔴 색 사각형이 아니라 **실제 획 모양**을 그린다(파선 패턴이 구분의 절반이다). */
function Swatch({ kind }: { kind: 'data' | 'spec' | 'band' | 'marker' }): React.ReactElement {
  return (
    <svg className="scope__swatch" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
      {kind === 'data' && <line x1="1" y1="6" x2="23" y2="6" stroke={SCOPE_COLOR} strokeWidth="2.6" />}
      {kind === 'spec' && (
        <line x1="1" y1="6" x2="23" y2="6" stroke="var(--viz-spec, #c0261c)" strokeWidth="2.6" strokeDasharray="11 4 2 4" />
      )}
      {kind === 'band' && (
        <g>
          <rect x="1" y="2" width="22" height="8" fill="none" stroke="var(--ok, #1a7f4b)" strokeWidth="1" />
          {[4, 9, 14, 19].map((x) => (
            <line key={x} x1={x} y1="10" x2={x + 4} y2="2" stroke="var(--ok, #1a7f4b)" strokeWidth="1.2" opacity="0.7" />
          ))}
        </g>
      )}
      {kind === 'marker' && (
        <g stroke="currentColor">
          <line x1="12" y1="0" x2="12" y2="12" strokeWidth="1.4" strokeDasharray="4 3" />
          <circle cx="12" cy="6" r="4" fill="none" strokeWidth="1.8" />
        </g>
      )}
    </svg>
  );
}

/* ---------------- 스윕 ---------------- */

interface SweepSample {
  x: number;
  /** 계산 불가(한계선 초과·비유한)면 `null`. 🔴 **0 으로 채우지 않는다.** */
  values: Record<string, number> | null;
}

interface SweepResult {
  points: SweepSample[];
  /** 계산이 막힌 격자점 수. 화면에 그대로 알린다. */
  blocked: number;
}

/**
 * 🔴 **실제 모델을 격자마다 다시 부른다.** 이 함수가 A15 의 경계다 —
 *    여기에 보간·근사·곡선 맞춤이 들어오는 순간 스코프는 물리를 지어내는 장치가 된다.
 *
 * 🔴 예외를 삼키되 **삼켰다는 사실은 세어서 올려보낸다**(`blocked`).
 *    `OutOfLimitError` 는 정상 동작이다(그 구간은 장비가 못 도는 조건이다). 그러나 그것과
 *    「계산이 깨졌다」를 화면에서 구별할 수 없으면 결함이 조용히 산다.
 */
function runSweep(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  param: LabParam,
): SweepResult {
  const grid = sweepGrid(param);
  const points: SweepSample[] = [];
  let blocked = 0;

  for (const x of grid) {
    let values: Record<string, number> | null = null;
    try {
      const q = spec.compute({ ...inputs, [param.id]: x });
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(q)) out[k] = v.value;
      values = out;
    } catch {
      // 한계선 초과 등 — 그리지 않는다. 지어내지 않는다.
      values = null;
    }
    if (values === null) blocked += 1;
    points.push({ x, values });
  }
  return { points, blocked };
}

/**
 * `step` 격자. 🔴 **`step` 을 무시하고 균등 분할하지 않는다** — 학습자가 실제로 멈출 수 있는 값
 * 위에 점이 찍혀야 「곡선 위의 점 = 내가 슬라이더를 거기 두면 나오는 값」이 성립한다.
 * 격자가 상한을 넘으면 `step` 의 **정수배**로 솎는다(여전히 격자 위에 있다).
 */
function sweepGrid(p: LabParam): number[] {
  /* 🔴 **명시 값 목록이 있으면 그것이 학습자가 설 수 있는 자리 전부다.**
     `oxidation` 의 온도처럼 간격이 고르지 않은 축은 `step` 격자가 정본이 아니다 —
     `step` 으로 스윕하면 화면에는 **모델이 실제로 받지 않는 x**(1010) 위에 점이 찍힌다. */
  if (p.options && p.options.length > 0) return paramOptions(p);
  const span = p.max - p.min;
  if (!Number.isFinite(span) || span <= 0) return [p.min];
  const step = Number.isFinite(p.step) && p.step > 0 ? p.step : span / (SWEEP_MAX_POINTS - 1);
  const nSteps = Math.max(1, Math.round(span / step));
  const stride = Math.max(1, Math.ceil(nSteps / (SWEEP_MAX_POINTS - 1)));
  const out: number[] = [];
  // 🔴 `min + i*step` 으로 만든다. 누산(`v += step`)하면 부동소수 오차가 쌓여 격자에서 벗어난다.
  for (let i = 0; i <= nSteps; i += stride) out.push(snap(p.min + i * step));
  const last = snap(p.min + nSteps * step);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** 부동소수 잔재(0.30000000000000004)를 걷어낸다. 값 자체는 바꾸지 않는다. */
function snap(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(12)) : v;
}

/**
 * 계산 가능한 **연속 구간**으로 쪼갠다. 🔴 이 함수가 A14 의 경계다 —
 * 하나로 합치면 `LineChart` 가 금지 구간을 가로지르는 직선을 그린다.
 */
function splitRuns(sweep: SweepResult, outputId: string): Array<Array<{ x: number; y: number }>> {
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let cur: Array<{ x: number; y: number }> = [];
  for (const s of sweep.points) {
    const y = s.values?.[outputId];
    if (y === undefined || !Number.isFinite(y)) {
      if (cur.length > 0) { runs.push(cur); cur = []; }
      continue;
    }
    cur.push({ x: s.x, y });
  }
  if (cur.length > 0) runs.push(cur);
  // 점 1개짜리 구간은 선이 안 그려진다 — 그대로 둔다. 마커가 그 자리를 말한다.
  return runs;
}
