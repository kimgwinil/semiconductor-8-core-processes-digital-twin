/**
 * 자체 SVG 차트 공용 유틸 — 설계서 §2(차트 라이브러리 미채택).
 * 색은 CSS 변수 + currentColor 만 쓴다 → 다크/라이트가 토큰 재정의로 끝난다.
 * 🔴 모듈 최상위에서 document/window 를 만지지 않는다.
 */
import type { CSSProperties } from 'react';

/**
 * 데이터 계열 기본색. `ui` 가 `--viz-series-N` 을 재정의하면 그 값이 이긴다.
 *
 * 🔴 **2026-08-21 — 토큰을 `src/ui/styles/index.css` 「@layer tokens」에 실제로 정의했다.**
 *    그 전까지 이 파일은 `--viz-series-N` 을 참조만 하고 CSS 정의는 **0건**이었다.
 *    즉 화면 색은 전부 아래 리터럴 폴백이었고, 「ui 가 재정의하면 이긴다」는 **아무도 안 쓰는 기전**이었다.
 *    지금은 참이다 — 라이트/다크 값이 `index.css` 에 있고 다크는 `prefers-color-scheme` 로 갈린다.
 *    **여기 리터럴은 CSS 가 로드되기 전/토큰이 지워졌을 때의 최후 폴백일 뿐**이며,
 *    `index.css` 의 라이트 값과 같은 값으로 맞춰 둔다(두 곳이 갈라지면 폴백이 거짓말을 한다).
 *
 * 🔴 **빨강 계열은 데이터 팔레트에 넣지 않는다.** 빨강은 규격선(`TONE_COLORS.spec`) 전용이다 —
 *    PLN `03_실습3단계명세.md` 476행 「규격 하한선(수평 빨간 파선, 상단값의 70 %)」. 데이터에
 *    빨강을 쓰면 아래 `tone` 구분이 다시 무너진다.
 */
export const SERIES_COLORS: readonly string[] = [
  'var(--viz-series-1, #1f6feb)', // 파랑
  'var(--viz-series-2, #0f766e)', // 청록
  'var(--viz-series-3, #7c3aed)', // 보라
  'var(--viz-series-4, #8a6510)', // 황토
  'var(--viz-series-5, #b32d80)', // 자홍
  'var(--viz-series-6, #4d7c0f)', // 올리브
];

/**
 * 🔴 **계열의 「역할」.** `undefined` 는 데이터 계열이다.
 *
 * 정본은 `models/labs/spec.ts` 의 `LabChartRefLine.tone` (`'spec' | 'info'`)이며,
 * `ui/sections/LabCharts.tsx` 가 규격선을 계열로 합칠 때 **그대로 실어 보낸다.**
 * 종전에는 여기서 끊겨(`tone` 미전달) 규격선이 그냥 「N번째 데이터 계열」로 그려졌다.
 */
export type SeriesTone = 'spec' | 'info';

/** 규격선·참고선 전용 색. 데이터 팔레트와 **겹치지 않는다.** */
export const TONE_COLORS: Readonly<Record<SeriesTone, string>> = {
  spec: 'var(--viz-spec, #c0261c)', // 빨강 — 합격창 경계
  info: 'var(--viz-info, #4b5563)', // 슬레이트 — 참고선(판정 경계가 아니다)
};

/**
 * 획 패턴 — 🔴 **색 하나에만 기대지 않는다(색각 이상 대응).**
 * 데이터 계열은 실선이거나 `dashed` 파선 하나뿐이므로, 규격선·참고선은 **그 둘과 다른 패턴**을 쓴다.
 */
export const DATA_DASH = '6 5';        // 데이터 계열의 dashed
export const SPEC_DASH = '11 4 2 4';   // 규격선 — 장-단(dash-dot)
export const INFO_DASH = '2 5';        // 참고선 — 점선

const TONE_DASH: Readonly<Record<SeriesTone, string>> = { spec: SPEC_DASH, info: INFO_DASH };
const TONE_WIDTH: Readonly<Record<SeriesTone, number>> = { spec: 2.4, info: 1.8 };
const DATA_WIDTH = 2.2;

/**
 * 🔴 **계열 표시 상한(`MAX_SERIES = 3`)은 2026-08-21 에 제거했다. 다시 넣지 마라.**
 *
 * 종전: 세 차트(`LineChart` · `BarChart` · `ProfileChart`)가 계열을 3개까지만 그렸다. **총 6곳**이다:
 *   · `slice(0, 3)` **5곳** — LineChart 계열·범례 · ProfileChart 계열·범례 · BarChart 범례
 *   · 🔴 `Math.min(3, …)` **1곳** — `BarChart` 의 `nSeries`. **막대 자체**를 3개로 잘랐다.
 *
 * 🔴 **여섯 번째는 `slice` 가 아니라 `Math.min` 이라 절단 전수 grep 에 걸리지 않았다.**
 *    「`slice(0, 3)` 을 전부 지웠다」고 보고했다면 **거짓이 될 뻔했다.** 상한은 여러 철자로 쓸 수 있다 —
 *    다음 사람은 `slice` 만 찾지 말고 `Math.min` · `MAX_` · `length > N` 도 함께 봐라.
 *
 * **왜 없앴나 — 근거를 찾을 수 없었다:**
 *  · 코드 주석·설계서(`01_아키텍처설계.md`)에 「3」의 근거가 **없다**.
 *  · **팔레트 때문도 아니다** — 아래 `seriesColor` 가 이미 `i % length` 로 순환하므로
 *    색은 4번째부터 반복될 뿐 **그리지 못할 이유가 없다.** 팔레트는 상한을 요구하지 않는다.
 *  → D-041 4항: 근거 미상인 제약은 **조용히 유지하지 않는다.** 없앤다.
 *
 * 🔴 **무엇이 잘리고 있었나(실측):** `LabCharts` 는 `[...series, ...refSeries]` 를 넘긴다.
 *    즉 **규격선(판정선)이 배열 뒤쪽**이라 상한에 걸리면 **판정선부터** 잘렸다.
 *    `wafer.diameterZoom` = 데이터 3계열(upper·lower·nominal) + 규격선 2개 = **5계열**.
 *    `slice(0, 3)` 이 뒤 2개를 버려 **규격 ±1 mm 선이 화면에 아예 없었다.**
 *    「판정은 이 차트에서 합니다」 배지를 단 차트가 정작 **합격창을 안 그리고** 있었다.
 *
 * 🔴 **`truncatedNote()` 도 함께 지웠다.** 「잘렸다」를 알리려고 만들어 뒀지만
 *    **어느 차트에서도 호출되지 않았다**(2026-08-21 전수 grep: 정의 1건 · 호출 0건).
 *    절단은 끝까지 **경고 한 줄 없이** 조용했다. 절단이 사라졌으니 이 함수도 필요 없다.
 *
 * 🔴 **계열이 7개 이상이면 색이 반복된다.** 그것은 상한의 근거가 아니라 **팔레트 확장 과제**다.
 *    (2026-08-21 에 3색 → 6색으로 늘렸고, 규격선은 아래 `tone` 때문에 팔레트 순번을 **쓰지 않는다.**
 *     그래서 실제로 팔레트를 쓰는 것은 데이터 계열뿐이며 현재 최대 3개다.)
 *    구분은 색 × 파선 조합으로 선다(`dashed` 는 계열마다 따로 온다).
 */

/**
 * ⚠️ **낮은 수준 API.** 팔레트 순번 → 색만 준다. `tone` 을 모른다.
 * 선 차트에서는 이것을 직접 부르지 말고 아래 `styledSeries()` 를 써라 —
 * 규격선이 데이터 계열의 색 순번을 훔쳐 가는 것이 **2026-08-21 충돌의 원인**이었다.
 * (`BarChart` 는 `refLines` 를 계열로 받지 않으므로 이것을 그대로 쓴다.)
 */
export function seriesColor(i: number, override?: string): string {
  if (override) return override;
  return SERIES_COLORS[i % SERIES_COLORS.length] ?? 'currentColor';
}

/** `styledSeries()` 의 입력 — `LineSeries` · `ProfileSeries` 가 모두 만족한다. */
export interface SeriesStyleInput {
  tone?: SeriesTone;
  color?: string;
  dashed?: boolean;
}

export interface SeriesStyle {
  stroke: string;
  /** `undefined` = 실선 */
  dash: string | undefined;
  width: number;
}

/**
 * 🔴 **계열 배열 → `{ 계열, 획 스타일 }` 배열.** 선 차트(`LineChart` · `ProfileChart`)의 유일한 스타일 결정자다.
 *
 * 두 가지를 한다:
 *  1. `tone` 이 붙은 계열(규격선·참고선)은 **팔레트가 아니라 전용 색·전용 파선**으로 그린다.
 *  2. 그런 계열은 **팔레트 순번을 소비하지 않는다.** 데이터 계열의 색은 규격선이 몇 개 붙든
 *     항상 1·2·3… 순서로 고정된다.
 *
 * 🔴 **왜 필요한가(2026-08-21 실측):** `LabCharts` 가 `[...데이터, ...규격선]` 을 넘기는데
 *    규격선의 `tone` 이 버려져 배열 인덱스로만 색이 정해졌다. `oxidation.thicknessTime` 은
 *    5계열인데 팔레트가 3색이라 `i % 3` 이 돌아 **idx1(선형→포물선 전이선)과 idx4(규격 하한 95 nm)가
 *    같은 색 + 같은 파선(`6 5`)** 이 됐다. 팔레트만 늘리는 것은 해결이 아니다 —
 *    계열이 늘면 또 겹친다. **규격선은 「N번째 계열」이 아니라 「규격선」으로 그려져야 한다.**
 */
export function styledSeries<T extends SeriesStyleInput>(list: readonly T[]): Array<{ s: T; style: SeriesStyle }> {
  let dataIndex = 0;
  return list.map((s) => {
    if (s.tone) {
      // 규격선·참고선 — 팔레트를 쓰지 않으므로 dataIndex 를 올리지 않는다.
      return { s, style: { stroke: s.color ?? TONE_COLORS[s.tone], dash: TONE_DASH[s.tone], width: TONE_WIDTH[s.tone] } };
    }
    const style: SeriesStyle = {
      stroke: seriesColor(dataIndex, s.color),
      dash: s.dashed ? DATA_DASH : undefined,
      width: DATA_WIDTH,
    };
    dataIndex++;
    return { s, style };
  });
}

/**
 * 🔴 **플롯 안에 놓인 글자의 배경 후광.** (2026-08-24 · CEO 지적 「그래프·도형이 텍스트와 겹친다」)
 *
 * ── 무엇이 문제였나 (전수 육안 실측으로 확인 — 두 조사원이 독립적으로 같은 결론) ──
 *   범례·합격창 라벨은 **플롯 영역 안**에 배경 없이 그려진다. 그래서 그 자리를 지나는
 *   **데이터 곡선 · 규격 파선 · 해칭 무늬가 글자를 그대로 관통**한다. 실측 예:
 *     · `wafer/lab-applied`  파란 「직경 +σ_D」 선이 범례 「규격 하한 (−1 mm)」를 가로 관통
 *     · `wafer/lab-advanced` 초록 세로 파선이 범례 4줄을 세로로 관통
 *     · `deposition/lab-basic` 빨간 일점쇄선이 「합격창」 글자의 위아래를 잘라냄
 *
 * ── 왜 「범례를 밖으로 빼기」가 아니라 후광인가 ──
 *   🔴 **정보를 지워서 겹침을 없애지 않는다**(CEO 지시). 라벨 삭제도, 범례 축소도 아니다.
 *   그리고 **배치를 바꾸지 않는다** — 세 차트의 여백 상수(`DEFAULT_MARGIN`)와 viewBox 는
 *   `check-overflow`·`linechart-clip-headroom` 테스트가 이미 잡고 있는 계약이다.
 *   후광은 **좌표를 하나도 건드리지 않고** 가독성만 되살린다.
 *
 * ── 어떻게 도나 ──
 *   `paint-order: stroke` 는 글리프의 **테두리를 먼저 칠하고 그 위에 본문 색을 얹는다.**
 *   테두리 색을 카드 배경(`--surface`)으로 주면 글자 주위에 배경색 띠가 생겨,
 *   뒤로 어떤 선이 지나가도 글자 모양이 살아난다. 다크 모드는 `--surface` 가 따라 바뀐다.
 *
 * 🔴 **`fill` 은 여기서 정하지 않는다.** 글자 색은 각 차트가 `currentColor` 나 상태색으로
 *    이미 정하고 있고, 그것을 여기서 덮으면 합격/불합격 색이 조용히 사라진다.
 */
export const LABEL_HALO: CSSProperties = {
  paintOrder: 'stroke',
  stroke: 'var(--surface, #ffffff)',
  strokeWidth: 3,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
};

/** 반응형: viewBox + preserveAspectRatio. 가로 스크롤을 만들지 않는다(A10). */
export const CHART_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  height: 'auto',
  overflow: 'visible',
};

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN: Margin = { top: 18, right: 18, bottom: 44, left: 62 };

/** 사람이 읽기 좋은 눈금값. 1/2/5 × 10ⁿ 단위로 끊는다. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min];
  const span = Math.abs(max - min);
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1;
  const step = mult * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start, guard = 0; v <= max + step * 1e-9 && guard < 64; v += step, guard++) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out.length > 0 ? out : [min, max];
}

/**
 * 눈금 라벨 서식 — 본체는 **`src/lib/format.ts` 하나뿐**이다.
 *
 * 🔴 여기 있던 본체는 2026-08-21 에 정본으로 올렸다. 수치 배지 서식기와 규칙이 갈라져
 *    비유한값에서 `formatTick(Infinity) === 'NaNeInfinity'` 같은 것까지 나오고 있었다.
 *    **여기에 다시 로직을 적지 마라.**
 *    (`src/lib` 은 ui·viz 양쪽이 참조해도 되는 자리다 — `scripts/check-layering.mjs` 가
 *     막는 것은 viz→ui 와 models→ui/viz 뿐이다.)
 */
export { formatTick } from '../../lib/format';

/** 축 라벨에 단위를 붙인다. 단위는 빈 문자열이면 생략(계약 §5는 모델 쪽 규칙이고 여기는 표시 규칙). */
export function axisTitle(label?: string, unit?: string): string {
  if (!label) return unit ? `(${unit})` : '';
  return unit ? `${label} (${unit})` : label;
}

/** 값 → 픽셀 스케일러. */
export function scaler(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** 배열에서 안전하게 min/max 를 구한다(noUncheckedIndexedAccess 대응). */
export function extent(values: number[]): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

/** 도메인에 여백을 준다(선이 축에 붙지 않게). */
export function padDomain([lo, hi]: [number, number], frac = 0.06): [number, number] {
  const pad = (hi - lo) * frac;
  return [lo - pad, hi + pad];
}
