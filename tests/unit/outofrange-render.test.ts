/**
 * 🔴 회귀 게이트 — **물리층 `outOfRange` 가 화면까지 닿는가.**
 *
 * 사고 경위(2026-08-21, 팀장 실측). `LabRunner.tsx` 가 `.qty` 마크업을 손으로 짜면서
 * `row.pass`(합격창 판정)만 보고 **`q.outOfRange`(물리층 `validRange` 이탈)를 통째로 버렸다.**
 * 그래서
 *  · 판정 창이 없는 출력(`role: 'display'`)은 **경고가 하나도 안 떴고**
 *  · 판정 창이 있는 출력은 음수 선폭·음수 표준편차까지 「규격 밖」으로만 보였다.
 * 같은 파일에 `QuantityView` 라는 **올바른 렌더가 이미 있었는데 호출부가 0곳**이었다.
 *
 * 그래서 이 테스트는 두 층을 함께 고정한다.
 *  ① 사실 — 슬라이더 극단에서 `outOfRange` 가 나는 출력이 존재하고,
 *     그중 **판정 창이 없어 종전 코드로는 화면에 아무것도 안 뜨던 것**이 존재한다.
 *  ② 렌더 — 그 값을 실제로 그려 보면 「한계선 초과」 표식이 마크업에 있다.
 *     그리고 `LabRunner` 가 **정본 컴포넌트를 거친다**(손으로 다시 짜지 않았다).
 *
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/models/registry';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerAllLabs, labSpec, registeredLabKeys } from '../../src/models/labs';
import type { LabStage } from '../../src/models/labs/spec';
import type { Quantity } from '../../src/models/contract';
import { setLang } from '../../src/lib/i18n';
import { QuantityView } from '../../src/ui/widgets/SourceBadge';
import { LabRunner } from '../../src/ui/sections/LabRunner';

interface Hit {
  key: string;
  outputId: string;
  role: 'judge' | 'display';
  hasPassWindow: boolean;
  q: Quantity;
}

/** 각 슬라이더를 min·initial·max 로 훑는다 — 팀장 계측과 같은 방식. */
function sweep(): Hit[] {
  const hits = new Map<string, Hit>();
  for (const k of registeredLabKeys()) {
    const [processId, stage] = k.split('/') as [string, LabStage];
    const spec = labSpec(processId, stage);
    if (!spec) continue;

    const base: Record<string, number> = {};
    for (const p of spec.params) base[p.id] = p.initial;
    const trials: Record<string, number>[] = [{ ...base }];
    for (const p of spec.params) {
      trials.push({ ...base, [p.id]: p.min });
      trials.push({ ...base, [p.id]: p.max });
    }

    for (const inputs of trials) {
      let out: Record<string, Quantity>;
      try { out = spec.compute(inputs); } catch { continue; }
      for (const o of spec.outputs) {
        const q = out[o.id];
        if (!q?.outOfRange) continue;
        hits.set(`${k}/${o.id}`, {
          key: k, outputId: o.id, role: o.role,
          hasPassWindow: o.role === 'judge' && o.pass !== undefined,
          q,
        });
      }
    }
  }
  return [...hits.values()];
}

let hits: Hit[] = [];

beforeAll(async () => {
  registerAllLabs();
  await setLang('ko');
  hits = sweep();
});

describe('물리층 outOfRange 가 화면까지 닿는다', () => {
  it('① 슬라이더 극단에서 outOfRange 가 나는 출력이 존재한다', () => {
    expect(hits.length).toBeGreaterThan(0);
  });

  it('① 그중 **판정 창이 없는** 출력이 존재한다 — 종전 코드는 여기에 경고를 하나도 못 냈다', () => {
    const invisible = hits.filter((h) => !h.hasPassWindow);
    // 🔴 이 사실이 사라지면(모델이 정의역을 고쳐서) 이 테스트는 실패한다.
    //    그때는 결함이 없어진 것이므로 **사유를 적고** 기대를 낮춰라. 조용히 지우지 마라.
    expect(
      invisible.map((h) => `${h.key}/${h.outputId} (role=${h.role})`).sort(),
    ).not.toHaveLength(0);
  });

  it('② outOfRange 인 값은 렌더 결과에 「한계선 초과」 표식을 갖는다', () => {
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const html = renderToStaticMarkup(createElement(QuantityView, {
        q: h.q,
        label: h.outputId,
        outputId: h.outputId,
        // 판정 창이 없는 출력은 `specFail` 이 절대 true 가 될 수 없다 — 결함의 핵심이 이것이었다.
        specFail: h.hasPassWindow ? false : undefined,
      }));
      expect(html, `${h.key}/${h.outputId}`).toContain('data-out-of-range="true"');
      expect(html, `${h.key}/${h.outputId}`).toContain('qty__warn--limit');
      expect(html, `${h.key}/${h.outputId}`).toContain('한계선 초과');
    }
  });

  it('② 「규격 밖」과 「한계선 초과」는 서로 다른 표식이다', () => {
    // 유효범위 안이면서 합격창만 미달인 상태를 인위적으로 만든다.
    const sample = hits[0];
    if (sample === undefined) throw new Error('outOfRange 표본이 없다 — 앞 테스트가 먼저 실패했어야 한다.');
    const inRange: Quantity = { ...sample.q, outOfRange: false };

    const specFailHtml = renderToStaticMarkup(createElement(QuantityView, {
      q: inRange, label: 'x', outputId: 'x', specFail: true,
    }));
    expect(specFailHtml).toContain('규격 밖');
    expect(specFailHtml).not.toContain('한계선 초과');
    expect(specFailHtml).toContain('data-out-of-range="false"');
    expect(specFailHtml).toContain('data-spec-fail="true"');

    // 둘 다 해당하면 물리 유효범위 쪽을 우선한다 — 음수 길이가 「규격 밖」으로만 읽히면 안 된다.
    const bothHtml = renderToStaticMarkup(createElement(QuantityView, {
      q: { ...inRange, outOfRange: true }, label: 'x', outputId: 'x', specFail: true,
    }));
    expect(bothHtml).toContain('한계선 초과');
    expect(bothHtml).not.toContain('규격 밖');
  });

  it('② LabRunner 는 정본 컴포넌트를 거친다 — 마크업을 손으로 다시 짜지 않는다', () => {
    // 종전 손수 마크업에는 `data-out-of-range` 가 아예 없었다.
    // 배선된 칸 전부에서 모든 `.qty` 가 이 속성을 달고 있으면 정본을 거친 것이다.
    let checked = 0;
    for (const k of registeredLabKeys()) {
      const [processId, stage] = k.split('/') as [string, LabStage];
      const spec = labSpec(processId, stage);
      if (!spec) continue;
      const html = renderToStaticMarkup(createElement(LabRunner, { spec }));
      const qtyOpenTags = html.match(/<div class="qty[^"]*"[^>]*>/g) ?? [];
      if (qtyOpenTags.length === 0) continue;
      checked += 1;
      for (const tag of qtyOpenTags) {
        expect(tag, k).toContain('data-out-of-range=');
        expect(tag, k).toContain('data-model-id=');
        expect(tag, k).toContain('data-kind=');
        expect(tag, k).toContain('data-l2-pending=');
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
