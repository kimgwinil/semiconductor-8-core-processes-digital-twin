/**
 * 🔴 회귀 게이트 — **선 차트는 자기 틀 밖으로 잉크를 내보내지 않는다(OV-1 · 2026-08-22).**
 *
 * 사고 경위(DSN 검수 → DEV 실측). `wafer.vgWindow` 의 V 곡선은 `yDomain`(0~0.30) 을
 * **의도적으로** 벗어난다 — 「V 를 올리면 동작점이 창 위로 밀려난다」가 이 차트의 학습 내용이다.
 * 그런데 공용 `CHART_STYLE` 이 `overflow: 'visible'` 이라 그 곡선이 svg 박스 **밖**까지 그려졌고,
 * SVG 획의 히트 영역은 중심선 ± `strokeWidth / 2` 이므로 **차트 밖 본문의 클릭·선택을 가로챘다.**
 * 실측(playwright, dpr 1):
 *   · 375 px 폭 — svg 박스 위로 345.9 CSS px 돌출 · 박스 밖 128 지점에서 곡선이 히트테스트 최상위
 *   · 배지(`.labChart__judges`) 면적 4807 표본 중 57(1.19 %)에서 배지 대신 곡선이 잡힘
 *   · 1440 px 폭 — 1024.8 CSS px 돌출 · 박스 밖 294 지점 · 배지 42 지점
 *   · 나머지 5차트는 전부 0. `wafer.vgWindow` 1차트에 국한.
 *
 * 이 테스트가 고정하는 것 3가지:
 *  ① 계열 `path` 는 포인터를 받지 않는다(ⓐ).
 *  ② svg 루트는 `overflow: hidden` 이다 — **차트 틀(viewBox)** 에서 자른다(ⓑ).
 *  ③ 🔴 **자르는 경계와 그릴 수 있는 자리 사이의 여유가 획 반폭보다 크다.**
 *     여유가 반폭보다 작으면 경계 위에 놓인 규격선이 **반쪽**이 된다.
 *     규격선 실폭은 dpr 1 에서 1.32 device px 뿐이라(DSN 실측) 반쪽이면 화면에서 사라진다.
 *     즉 `DEFAULT_MARGIN` 을 줄이거나 `TONE_WIDTH.spec` 을 키우면 여기서 걸린다.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineChart, MAX_STROKE_HALF_WIDTH_PX } from '../../src/viz/chart/LineChart';
import { DEFAULT_MARGIN } from '../../src/viz/chart/common';

/** 데이터 계열 1개 + 규격선 1개. 규격선은 `yDomain` 상한 **그 위에** 두어 넘침을 재현한다. */
function markup(): string {
  return renderToStaticMarkup(
    createElement(LineChart, {
      series: [
        { id: 'curve', label: 'curve', points: [{ x: 0, y: 0 }, { x: 1, y: 9 }] },
        { id: 'spec', label: 'spec', points: [{ x: 0, y: 0.3 }, { x: 1, y: 0.3 }], tone: 'spec' as const },
      ],
      yDomain: [0, 0.3],
      xDomain: [0, 1],
    }),
  );
}

describe('LineChart — 차트 밖으로 잉크·포인터를 내보내지 않는다 (OV-1)', () => {
  it('① 계열 path 는 전부 pointer-events:none 이다', () => {
    const html = markup();
    const paths = html.match(/<path\b[^>]*>/g) ?? [];
    expect(paths.length).toBe(2);
    for (const p of paths) {
      expect(p, `계열 path 가 포인터를 받는다 → 차트 밖 본문 클릭을 가로챈다: ${p}`)
        .toMatch(/pointer-events:\s*none|pointer-events="none"/);
    }
  });

  it('② svg 루트는 overflow:hidden 이다 (차트 틀에서 자른다)', () => {
    const html = markup();
    const svg = html.slice(0, html.indexOf('>') + 1);
    expect(svg).toMatch(/overflow:\s*hidden/);
    expect(svg, 'overflow:visible 이면 곡선이 페이지 본문 위로 다시 새어 나간다').not.toMatch(/overflow:\s*visible/);
  });

  it('③ 자르는 경계와 그릴 수 있는 자리 사이 여유 ≥ 획 반폭', () => {
    // 자르는 경계 = viewBox 테두리. 그릴 수 있는 자리 = 그림 영역(plot rect).
    // 둘 사이 거리는 곧 여백이다.
    const headroom = Math.min(
      DEFAULT_MARGIN.top, DEFAULT_MARGIN.right, DEFAULT_MARGIN.bottom, DEFAULT_MARGIN.left,
    );
    expect(headroom).toBeGreaterThanOrEqual(MAX_STROKE_HALF_WIDTH_PX);
  });

  it('③-b 상수가 실제로 그려지는 가장 굵은 **계열** 획의 반폭 이상이다', () => {
    // `TONE_WIDTH` 는 common.ts 의 내부 상수라 import 할 수 없다. **그려진 마크업에서 읽는다.**
    //
    // 🔴 **계열(`<path>`)만 센다.** 경계 위에 놓일 수 있는 것은 계열뿐이다 —
    //    계열의 y 값은 `yDomain` 끝에 정확히 닿을 수 있고(규격선이 대표적이다) 그때 중심선이 곧 경계다.
    //    범례 견본은 `<line stroke-width="3">` 으로 더 굵지만 그림 영역 **안쪽**
    //    (`m.top + 6` = 24, 자르는 경계에서 24 units)에 고정 배치라 잘릴 수 없다.
    //    격자·축(`<line>`)도 마찬가지로 안쪽 고정이다.
    const html = markup();
    const seriesTags = html.match(/<path\b[^>]*>/g) ?? [];
    expect(seriesTags.length).toBeGreaterThan(0);
    const widths = seriesTags.map((tag) => Number(/stroke-width="([\d.]+)"/.exec(tag)?.[1] ?? NaN));
    expect(widths.every(Number.isFinite), `계열 획 폭을 읽지 못했다: ${seriesTags.join(' ')}`).toBe(true);
    const widest = Math.max(...widths);
    expect(
      MAX_STROKE_HALF_WIDTH_PX,
      `가장 굵은 계열 획 ${widest} 의 반폭 ${widest / 2} 이 상수보다 크다 — 상수를 올려라(획을 줄이지 마라)`,
    ).toBeGreaterThanOrEqual(widest / 2);
  });
});
