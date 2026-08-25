/**
 * 🔴 회귀 게이트 — **연속으로 보이는 것이 연속이 아니면 그 자체가 화면의 거짓말이다.**
 *
 * 사고(2026-08-24 · CEO 지적 「산화에서 산화 온도를 변화 줄 수 없는데 그것이 맞는지?」).
 * `oxidation` 의 `tempC` 는 `min 920 · max 1100 · step 90` — 고를 수 있는 값이
 * **920 · 1000 · 1100 세 개뿐**이다. Deal-Grove 계수표에 그 세 온도만 있어 사이 값은
 * 보간하면 지어내는 것이 된다(A15). **3택인 것은 옳다.**
 * 틀린 것은 그것을 `<input type="range">` 슬라이더로 그린 것이었다 — 끌어도 거의 안 움직여
 * 「바꿀 수 없다」로 읽혔다.
 *
 * 이 파일이 고정하는 것은 둘이다.
 *   ① **물리 제약을 건드리지 않았다** — 선택지 ≤5 파라미터의 `min·max·step` 을 실측 그대로 못박는다.
 *      이 표가 깨지면 「화면을 고치려다 물리를 고친 것」이다. 화면 문제보다 훨씬 무겁다.
 *   ② **화면이 그 사실대로 그린다** — 선택지 ≤5 는 range 가 아니라 라디오 N개로 나온다.
 *      6개 이상은 종전대로 range 다(기준선을 흔들지 않는다).
 *
 * 🔴 이 파일은 모델이 아니라 **마크업**을 본다. 종전 사고가 전부 「모델은 맞는데 화면이 안 받았다」였다.
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/models/registry';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerAllLabs, labSpec, registeredLabKeys } from '../../src/models/labs';
import type { LabSpec, LabStage } from '../../src/models/labs/spec';
import {
  DISCRETE_PARAM_MAX_OPTIONS,
  isDiscreteParam,
  paramOptionCount,
  paramOptions,
} from '../../src/models/labs/spec';
import { setLang } from '../../src/lib/i18n';
import { LabRunner } from '../../src/ui/sections/LabRunner';

beforeAll(async () => {
  registerAllLabs();
  await setLang('ko');
});

function allSpecs(): LabSpec[] {
  return registeredLabKeys().map((k) => {
    const [pid, stage] = k.split('/');
    const s = labSpec(pid as string, stage as LabStage);
    if (!s) throw new Error(`실습 명세 없음: ${k}`);
    return s;
  });
}

/**
 * 🔴 **2026-08-24 전수 실측.** 24칸 112개 파라미터 중 선택지 ≤5 인 것 **19개**.
 *    형식: `공정/단계/파라미터 id` → `[min, max, step, 선택지 수]`.
 *
 * ⛔ **이 표의 min·max·step 을 「고쳐서」 통과시키지 마라.** 물리 제약이다.
 *    값이 정말 바뀌어야 한다면 물리 근거를 먼저 확정하고 그 다음에 이 표를 고친다.
 */
const DISCRETE_BASELINE: Record<string, [number, number, number, number]> = {
  'eds/lab-basic/needleMaterialIndex': [0, 2, 1, 3],
  'eds/lab-advanced/needleCleanAction': [0, 1, 1, 2],
  'eds/lab-advanced/needleMaterialIndex': [0, 2, 1, 3],
  'etch/lab-advanced/endpointMode': [0, 2, 1, 3],
  'etch/lab-advanced/disturbance': [0, 2, 1, 3],
  'oxidation/lab-basic/tempC': [920, 1100, 90, 3],
  'oxidation/lab-applied/tempC': [920, 1100, 90, 3],
  'oxidation/lab-applied/ambient': [0, 1, 1, 2],
  'oxidation/lab-advanced/tempC': [920, 1100, 90, 3],
  'oxidation/lab-advanced/ambient': [0, 1, 1, 2],
  'oxidation/lab-advanced/leakPurge': [0, 1, 1, 2],
  'oxidation/lab-advanced/dummyWafers': [5, 10, 5, 2],
  'oxidation/lab-advanced/stabilizeMin': [10, 30, 20, 2],
  'oxidation/lab-advanced/faultScenario': [0, 4, 1, 5],
  'packaging/lab-basic/velocityUpstream': [0, 1, 1, 2],
  'packaging/lab-applied/mslHourlyIndex': [0, 3, 1, 4],
  'packaging/lab-applied/moldHasFiller': [0, 1, 1, 2],
  'packaging/lab-advanced/alloyIsLeadFree': [0, 1, 1, 2],
  'photo/lab-advanced/barcOn': [0, 1, 1, 2],
};

describe('선택지 ≤5 파라미터 — 물리는 그대로, 화면만 바뀐다', () => {
  it('① 전수 목록이 실측 그대로다 — min·max·step 을 건드리지 않았다', () => {
    const found: Record<string, [number, number, number, number]> = {};
    for (const s of allSpecs()) {
      for (const p of s.params) {
        if (!isDiscreteParam(p)) continue;
        found[`${s.processId}/${s.stage}/${p.id}`] = [p.min, p.max, p.step, paramOptionCount(p)];
      }
    }
    expect(found).toEqual(DISCRETE_BASELINE);
  });

  it('② 선택지 수는 (max − min) / step + 1 이다 (명시 목록이 없는 한)', () => {
    for (const s of allSpecs()) {
      for (const p of s.params) {
        if (!isDiscreteParam(p)) continue;
        const key = `${s.processId}/${s.stage}/${p.id}`;
        const n = paramOptionCount(p);
        expect(n, key).toBeLessThanOrEqual(DISCRETE_PARAM_MAX_OPTIONS);
        if (p.options) {
          // 명시 목록이 정본이다. 다만 목록은 [min, max] 안에 있어야 한다 — 범위 밖 값은 지어낸 값이다.
          expect(n, key).toBe(p.options.length);
          for (const v of p.options) {
            expect(v, `${key} 값 ${v} 가 [min, max] 밖`).toBeGreaterThanOrEqual(p.min);
            expect(v, `${key} 값 ${v} 가 [min, max] 밖`).toBeLessThanOrEqual(p.max);
          }
        } else {
          expect((p.max - p.min) / p.step + 1, key).toBe(n);
        }
      }
    }
  });

  it('③ 선택지 목록은 min + i·step 격자 위에 있다 — 사이 값을 만들지 않는다', () => {
    for (const s of allSpecs()) {
      for (const p of s.params) {
        if (!isDiscreteParam(p)) continue;
        const opts = paramOptions(p);
        const key = `${s.processId}/${s.stage}/${p.id}`;
        expect(opts.length, key).toBe(paramOptionCount(p));
        expect(opts[0], key).toBe(p.min);
        expect(opts[opts.length - 1], key).toBe(p.max);
        // 🔴 초기값이 격자 밖이면 라디오가 **하나도 선택되지 않은** 화면이 된다.
        expect(opts, `${key} initial`).toContain(p.initial);
      }
    }
  });

  it('④ 화면이 선택지 ≤5 를 슬라이더로 그리지 않는다 — 24칸 전수', () => {
    for (const s of allSpecs()) {
      const html = renderToStaticMarkup(createElement(LabRunner, { spec: s }));
      const key = `${s.processId}/${s.stage}`;

      const discrete = s.params.filter(isDiscreteParam);
      const continuous = s.params.filter((p) => !isDiscreteParam(p));

      // range 는 연속 파라미터 개수와 **정확히** 같다. 하나라도 남으면 거짓 UI 가 남은 것이다.
      const ranges = html.match(/type="range"/g) ?? [];
      expect(ranges.length, `${key} range 개수`).toBe(continuous.length);

      // 라디오는 선택지 수의 총합이다.
      const radios = html.match(/type="radio"/g) ?? [];
      const expected = discrete.reduce((a, p) => a + paramOptionCount(p), 0);
      expect(radios.length, `${key} radio 개수`).toBe(expected);

      for (const p of discrete) {
        expect(html, `${key}/${p.id} 선택 묶음`).toContain(`data-param="${p.id}"`);
        expect(html, `${key}/${p.id} 선택지 수 표기`).toContain(`data-options="${paramOptionCount(p)}"`);
        // 선택된 칸이 **정확히 하나**여야 한다.
        expect(html, `${key}/${p.id}`).toContain('data-selected="true"');
      }
    }
  });

  it('⑤ 산화 기초의 온도가 3칸 버튼으로 나온다 (CEO 지적 그 자리)', () => {
    const s = labSpec('oxidation', 'lab-basic');
    if (!s) throw new Error('oxidation/lab-basic 없음');
    const html = renderToStaticMarkup(createElement(LabRunner, { spec: s }));

    expect(html).toContain('data-param="tempC"');
    expect(html).toContain('data-options="3"');
    // 온도 슬라이더가 사라졌다. 남은 range 는 시간(59택) 하나뿐이다.
    expect((html.match(/type="range"/g) ?? []).length).toBe(1);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
  });

  /**
   * 🔴🔴 **화면이 내는 수 = 계산이 쓰는 수.**
   *
   * `oxidation` 의 정본표 온도는 `TEMPS = [920, 1000, 1100]`(`src/models/labs/oxidation.ts:24`)
   * 인데 간격이 **80 · 100 으로 다르다.** 등간격 `step` 으로는 표현할 수 없다.
   * 그래서 선언이 `min 920 · max 1100 · step 90` 이었고, `min + k·step` 격자는
   * **920 · 1010 · 1100** 이 됐다 — 가운데가 1000 이 아니라 **1010** 이다.
   *
   * 실측(2026-08-24 · 팀장 직접 `s.compute()` 호출):
   * ```
   * tempC=1000 → thicknessNm 91.15848188913507  assumptions [… "정본표 1000 °C"]
   * tempC=1010 → thicknessNm 91.15848188913507  assumptions [… "정본표 1000 °C"]
   * ```
   * `nearestTemp()` 가 1010 을 1000 으로 **조용히 스냅**했다. 즉 **화면은 1010 을 보이고
   * 계산은 1000 으로 돌았다.** 슬라이더 시절에도 같았다 — `initial: 1000` 자체가 격자 밖이라
   * 브라우저가 첫 조작에서 값을 1010 으로 끌어올린다. 선언이 스스로 모순을 말하고 있었다.
   *
   * 🔴 고친 방법: **`min`·`max`·`step` 은 그대로 두고** `LabParam.options` 에
   *    **모델이 쓰는 그 상수(`TEMPS`)를 그대로** 넘겼다. 숫자를 손으로 다시 적지 않았다.
   *    출력 집합은 변하지 않는다(위 실측대로 1010 과 1000 의 결과가 같았으므로).
   *    **바뀐 것은 화면에 적히는 수가 참이 된 것뿐이다.**
   */
  it('⑥ 산화 온도는 정본표 그대로 920 · 1000 · 1100 이다 (1010 이 아니다)', () => {
    for (const stage of ['lab-basic', 'lab-applied', 'lab-advanced'] as LabStage[]) {
      const s = labSpec('oxidation', stage);
      if (!s) throw new Error(`oxidation/${stage} 없음`);
      const p = s.params.find((x) => x.id === 'tempC');
      if (!p) throw new Error(`oxidation/${stage} tempC 없음`);

      expect(paramOptions(p), stage).toEqual([920, 1000, 1100]);
      // 🔴 min·max·step 은 손대지 않았다.
      expect([p.min, p.max, p.step], stage).toEqual([920, 1100, 90]);
      // 초기값이 목록 안에 있다 → 화면에 반드시 한 칸이 선택돼 있다.
      expect(paramOptions(p), stage).toContain(p.initial);

      const html = renderToStaticMarkup(createElement(LabRunner, { spec: s }));
      for (const v of [920, 1000, 1100]) expect(html, `${stage} ${v}`).toContain(`value="${v}"`);
      expect(html, `${stage} 1010 이 있으면 안 된다`).not.toContain('value="1010"');
    }
  });
});
