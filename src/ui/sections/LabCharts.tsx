import { useEffect, useRef, useState } from 'react';
import type { LabChartBinding, LabSpec } from '@/models/labs/spec';
import type { Quantity } from '@/models/contract';
import { LineChart, ProfileChart, BarChart } from '@/viz';
import { t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import '@/ui/styles/charts.css';

/**
 * 🔴 출처·등급 표기 제거 — CEO 지시 2026-08-23·08-24. **표시만 끈다. 원문 데이터는 보존.**
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}


/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴 ChartFrame — **viewBox 를 렌더 폭에 맞춘다.** (2026-08-24 · CEO 「불필요하게 큽니다」)
 * ══════════════════════════════════════════════════════════════════════════════
 *  ── 무엇이 문제였나 (실측) ────────────────────────────────────────────────────
 *    차트 3종은 viewBox 가 **640 × 340 고정**이고 CSS 는 `width: 100 %` 다.
 *    그래서 화면 폭에 따라 **그림 전체가 확대·축소**되고 **글자도 같이 늘었다 줄었다** 한다.
 *      · 1400 px 뷰포트 → 차트 1132 px → **1.77배** → 눈금 글자 12 units 가 **21 px**
 *      · 375 px 뷰포트 → 차트 343 px → **0.54배** → 같은 글자가 **6.4 px**
 *    같은 원인이 양쪽 끝에서 반대 증상으로 나왔다. CEO 가 본 「불필요하게 크다」와
 *    조사원들이 본 「모바일에서 3~5 px 라 못 읽는다」는 **같은 결함의 두 얼굴**이다.
 *
 *  ── 고친 방식 ────────────────────────────────────────────────────────────────
 *    칸의 실제 폭을 재서 **그 폭을 그대로 viewBox 폭으로 넘긴다.** 배율이 항상 1.0 이 되어
 *    글자가 **설계 크기 그대로** 나온다. 폭이 변해도 글자 크기는 변하지 않는다.
 *    🔴 이것이 「텍스트를 줄인다」의 본체다. 글자 상수를 만지는 것이 아니라
 *       **글자를 늘리고 있던 확대를 없앤다.**
 *
 *  ── 상·하한 ──────────────────────────────────────────────────────────────────
 *    MIN 320: 이보다 좁으면 왼쪽 여백 62 units 를 빼고 나면 그림 영역이 남지 않는다.
 *    MAX 760: `charts.css` 의 `.labChart { max-width: 47.5rem }` 와 같은 수다.
 *             🔴 둘이 어긋나면 CSS 가 이긴 폭과 viewBox 폭이 달라져 배율이 1.0 이 아니게 된다.
 *
 *  ⚠️ **`LabScope` 에는 적용하지 않았다.** 스코프는 오버레이가 `SCOPE_VB_W/H` 와 같은
 *     좌표계를 손으로 다시 계산해 겹쳐 그리므로 폭을 바꾸면 마커가 어긋난다. 게다가 그 파일은
 *     2026-08-24 현재 다른 세션이 편집 중이다. **보고에 남긴다.**
 * ══════════════════════════════════════════════════════════════════════════════ */
const CHART_MIN_W = 320;
const CHART_MAX_W = 760;

function ChartFrame({ ratio, minH, maxH, render }: {
  ratio: number;
  minH: number;
  maxH: number;
  render: (w: number, h: number) => React.ReactElement;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState(CHART_MAX_W);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // 🔴 1px 미만 변화는 무시한다 — 안 그러면 소수점 떨림으로 렌더가 무한히 돈다.
      setBox((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = Math.round(Math.min(CHART_MAX_W, Math.max(CHART_MIN_W, box)));
  const h = Math.round(Math.min(maxH, Math.max(minH, w * ratio)));
  return <div className="labChart__box" ref={ref}>{render(w, h)}</div>;
}

/**
 * 🔴 실습 차트 패널 — **판정 경로**다. 장식이 아니다.
 *
 * PLN `03_실습3단계명세.md` 427행: **「판정은 이 차트에서 한다.」**
 * 허용치가 너무 작아 GL 씬에서 서브픽셀이 되는 판정을 여기로 옮긴다.
 * 예) P1 웨이퍼 심화 직경 편차 σ_D — 허용치 1 mm 미만 → 잉곳 단면 씬에서 **±0.34 px**.
 *     세로축을 200 ± 3 mm 로 확대하면 **0.71 mm 가 28 px** 로 또렷해진다(명세 426).
 *
 * 🔴 이 컴포넌트가 존재해야 `viz` 의 차트 3종이 **실제 호출부**를 갖는다.
 *    2026-08-20 에 차트가 배럴에만 있어 사용자에게 전송되면서 아무 화면에도 안 떴다 —
 *    `check-wiring` W4 가 그 상태를 막는다. **이 파일을 지우면 W4 가 다시 발화한다.**
 */
export function LabCharts({ charts, spec, inputs, q, lang }: {
  charts: LabChartBinding[];
  spec: LabSpec;
  inputs: Readonly<Record<string, number>>;
  q: Record<string, Quantity>;
  lang: string;
}): React.ReactElement {
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(q)) values[k] = v.value;

  return (
    <section className="lab__charts">
      <h3>{t('lab.charts')}</h3>
      {/* 🔴 격자는 **제목을 뺀 그림들만** 감싼다.
             제목을 격자 안에 두고 `grid-column: 1 / -1` 로 늘리면 그 제목이 두 칸을 모두
             **점유**해 `auto-fit` 의 빈 칸 접기가 일어나지 않는다. 그러면 차트가 하나뿐인
             칸에서도 폭이 절반(558px)에 묶여 오른쪽 절반이 빈 채로 남는다(실측 확인).
             그림만 격자에 넣으면 1개일 때는 상한(760px)까지, 2개 이상일 때는 2단이 된다. */}
      <div className="lab__chartGrid">
      {charts.map((c) => {
        const series = c.build(inputs, values);
        const title = say(lang === 'en' ? c.en : c.ko);
        const caption = lang === 'en' ? c.captionEn : c.captionKo;
        const xLabel = lang === 'en' ? c.xEn : c.xKo;
        const yLabel = lang === 'en' ? c.yEn : c.yKo;

        // 🔴 규격선은 계열로 합쳐 그린다 — 차트 컴포넌트에 별도 API 를 만들지 않는다.
        //    도메인을 모르면 선을 그릴 수 없으므로 x 범위는 계열에서 취한다.
        const xs = series.flatMap((sr) => sr.points.map((pt) => pt.x));
        const xLo = c.xDomain?.[0] ?? (xs.length ? Math.min(...xs) : 0);
        const xHi = c.xDomain?.[1] ?? (xs.length ? Math.max(...xs) : 1);
        // 🔴 **`tone` 을 반드시 실어 보낸다.** 여기서 버리면 규격선이 그냥 「배열 뒤쪽의 N번째 데이터 계열」이 되어
        //    데이터 계열과 같은 색·같은 파선으로 그려진다. 2026-08-21 `oxidation.thicknessTime` 에서
        //    「선형→포물선 전이선」과 「규격 하한 95 nm」가 **색·파선이 완전히 같았던** 원인이 이 한 줄의 누락이었다.
        //    데이터 모델(`LabChartRefLine.tone`)은 이미 둘을 구분하고 있었는데 렌더러가 그 구분을 버리고 있었다.
        //    `tone` 이 없는 선은 `'spec'` 으로 본다 — `refLines` 는 정의상 판정 경계이고,
        //    「참고선일 뿐」이라고 말하려면 데이터 쪽에서 `tone: 'info'` 를 **명시**해야 한다.
        const refSeries = (c.refLines ?? []).map((r) => ({
          id: `ref-${r.value}`,
          label: say(lang === 'en' ? r.en : r.ko),
          points: [{ x: xLo, y: r.value }, { x: xHi, y: r.value }],
          dashed: true,
          tone: r.tone ?? ('spec' as const),
        }));

        const judged = (c.judgesOutputs ?? [])
          .map((id) => spec.outputs.find((o) => o.id === id))
          .filter((o): o is NonNullable<typeof o> => Boolean(o))
          .map((o) => say(lang === 'en' ? o.en : o.ko));

        return (
          <figure className="labChart" key={c.id} data-chart-id={c.id} data-chart-kind={c.kind}>
            <figcaption className="labChart__head">
              <strong>{title}</strong>
              {judged.length > 0 && (
                // 🔴 「이 차트가 판정한다」를 화면에 명시한다(PLN 427). 안 적으면 학습자가 장식으로 본다.
                <span className="labChart__judges" data-judges={(c.judgesOutputs ?? []).join(',')}>
                  {t('lab.chartJudges', { items: judged.join(', ') })}
                </span>
              )}
            </figcaption>

            {/* 🔴 세 차트 모두 `ChartFrame` 을 거친다 — 폭을 재서 viewBox 로 넘겨야 배율이 1.0 이 된다.
                   비율은 원래 기본값을 그대로 옮긴 것이다: 선·막대 340/640 = 0.531, 프로파일은
                   정사각(1.0)이면 넓은 칸에서 지나치게 높아져 0.86 으로 낮추고 상·하한을 뒀다. */}
            {c.kind === 'profile'
              ? <ChartFrame ratio={0.86} minH={300} maxH={460} render={(w, h) => (
                  <ProfileChart
                    width={w} height={h}
                    series={[...series, ...refSeries].map((sr) => ({
                      id: sr.id,
                      label: say('label' in sr ? sr.label : (lang === 'en' ? sr.en : sr.ko)),
                      points: sr.points.map((pt) => ({ depth: pt.x, value: pt.y })),
                      dashed: sr.dashed,
                      tone: 'tone' in sr ? sr.tone : undefined,
                    }))}
                    depthLabel={xLabel} depthUnit={c.xUnit}
                    valueLabel={yLabel} valueUnit={c.yUnit}
                    depthDomain={c.xDomain} valueDomain={c.yDomain}
                    ariaLabel={title}
                  />
                )} />
              : c.kind === 'bar'
                ? <ChartFrame ratio={0.531} minH={260} maxH={400} render={(w, h) => (
                    <BarChart
                      width={w} height={h}
                      groups={series.map((sr) => ({
                        category: say(lang === 'en' ? sr.en : sr.ko),
                        values: sr.points.map((pt) => pt.y),
                      }))}
                      yLabel={yLabel} yUnit={c.yUnit} xLabel={xLabel}
                      ariaLabel={title}
                    />
                  )} />
                : <ChartFrame ratio={0.531} minH={260} maxH={400} render={(w, h) => (
                    <LineChart
                      width={w} height={h}
                      series={[...series, ...refSeries].map((sr) => ({
                        id: sr.id,
                        label: say('label' in sr ? sr.label : (lang === 'en' ? sr.en : sr.ko)),
                        points: sr.points,
                        dashed: sr.dashed,
                        tone: 'tone' in sr ? sr.tone : undefined,
                      }))}
                      xLabel={xLabel} xUnit={c.xUnit}
                      yLabel={yLabel} yUnit={c.yUnit}
                      xDomain={c.xDomain} yDomain={c.yDomain}
                      ariaLabel={title}
                    />
                  )} />}

            {caption && <p className="labChart__caption">{caption}</p>}
            {c.note && <p className="labChart__note">{say(c.note)}</p>}
          </figure>
        );
      })}
      </div>
    </section>
  );
}
