// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다.
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { DEPOSITION_LABS } from '@/models/labs/deposition';
import type { LabSpec } from '@/models/labs/spec';
import { aldCycleModel } from '@/viz/gl/scenes/models/aldCycle.model';

/**
 * 🔴 **「게이트가 못 본다」와 「화면에 없다」는 다른 명제다** (2026-08-22 신설).
 *
 * `scripts/check-direction.mjs` V1 은 `scene.map` 본문에서 `out['Y']` 가 읽히는지를 본다.
 * 그래서 DEP-D1(`gpcAngstrom`+`thicknessNm`)·DEP-D2(`thicknessNm`+`depositionTimeS`)가
 * **A12 미달**로 찍힌다 — `aldSceneMap` 이 `out['thicknessNm']` 을 읽지 않기 때문이다.
 *
 * 🔴 그러나 **두께는 이미 화면에 정확히 비례로 그려지고 있다.** 씬은 두께를
 * `filmHeight = cyclesShown × layerHeight` 라는 **곱**으로 받는다(`aldCycle.model.ts:196`) —
 * 랩이 `cycles`(사이클 축)와 `growth`(GPC/1.1 Å) 두 슬롯으로 쪼개 넘기기 때문이다.
 * 즉 `out['thicknessNm']` 을 읽을 **슬롯이 없을 뿐**이고, 없는 것은 화면이 아니라 **이름 경로**다.
 *
 * 이 테스트는 그 사실을 **수치로 고정한다.** 앞으로 누군가
 *   ⓐ `cycles` 나 `growth` 매핑을 건드려 비례가 깨지거나
 *   ⓑ 게이트 숫자를 올리려고 두께를 슬롯에 이중으로 밀어 넣으면(GPC 두 번 곱)
 * 여기서 빨간불이 난다.
 *
 * 🔴 **이 테스트는 「배선이 있다」를 단언하지 않는다.** 배선은 없다. 단언하는 것은
 *    「화면의 막 높이가 랩의 두께에 정확히 비례한다」 하나뿐이다.
 */

const ALD_STAGE = 'lab-basic';

/** 랩 선언에서 직접 읽는다 — 여기 손으로 적으면 슬라이더가 바뀔 때 갈라진다. */
function labOf(stage: string): LabSpec {
  const s = DEPOSITION_LABS.find((x) => x.stage === stage);
  expect(s, `deposition ${stage} 랩이 없다`).toBeDefined();
  return s as LabSpec;
}

const basic = labOf(ALD_STAGE);

function values(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(lab.compute(inputs))) out[k] = (v as { value: number }).value;
  return out;
}

/** 실제 배선(`lab.scene.map`)을 그대로 태운다. 문자열 검사를 쓰지 않는다. */
function sceneParams(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const scene = lab.scene;
  expect(scene, '씬 배선이 없다').toBeDefined();
  expect(scene!.sceneId).toBe('aldCycle');
  return scene!.map(inputs, values(lab, inputs));
}

function num(v: number | undefined): number {
  expect(v, '수치가 없다').toBeTypeOf('number');
  return v as number;
}

/** 측정 격자 — 온도는 **ALD 창 밖(80·100 °C)까지** 포함한다. 창 안만 재면 GPC 가 상수라 검사가 무의미해진다. */
const TEMPS_C = [80, 100, 150, 200, 250];
const CYCLES = [10, 100, 220, 500];

describe('DEP-D1·D2 — 게이트는 못 보지만 막 두께는 화면에 비례로 살아 있다', () => {
  it('filmHeight / thicknessNm 이 20조합(온도 5 × 사이클 4) 전부에서 같은 상수다', () => {
    const ratios: number[] = [];
    for (const tempC of TEMPS_C) {
      for (const cycles of CYCLES) {
        const inputs = { tempC, cycles };
        const thicknessNm = num(values(basic, inputs)['thicknessNm']);
        expect(thicknessNm, `두께가 0 이면 비를 못 잰다 (T=${tempC}, N=${cycles})`).toBeGreaterThan(0);
        const { filmHeight } = aldCycleModel(sceneParams(basic, inputs));
        ratios.push(filmHeight / thicknessNm);
      }
    }
    expect(ratios.length).toBe(TEMPS_C.length * CYCLES.length);
    const ref = num(ratios[0]);
    expect(ref).toBeGreaterThan(0);
    for (const r of ratios) expect(r).toBeCloseTo(ref, 12);
  });

  it('얼어 있지 않다 — 사이클을 정의역 끝에서 끝까지 밀면 filmHeight 가 실제로 움직인다', () => {
    const p = basic.params.find((x) => x.id === 'cycles');
    expect(p, 'cycles 슬라이더 선언이 없다').toBeDefined();
    const lo = aldCycleModel(sceneParams(basic, { tempC: 200, cycles: num(p!.min) })).filmHeight;
    const hi = aldCycleModel(sceneParams(basic, { tempC: 200, cycles: num(p!.max) })).filmHeight;
    expect(hi).toBeGreaterThan(lo * 5);
  });

  it('🔴 창 밖에서는 온도가 두께를 움직이고, 화면도 같이 움직인다(D-1 의 대조군)', () => {
    // ALD 창(150–250 °C) 안에서는 GPC 가 평탄이라 두께가 안 변하는 것이 DEP-D1 이다.
    const inWindow = [150, 200, 250].map((tempC) =>
      aldCycleModel(sceneParams(basic, { tempC, cycles: 100 })).filmHeight,
    );
    const ref = num(inWindow[0]);
    for (const h of inWindow) expect(h).toBeCloseTo(ref, 12);

    // 창 밖(80 °C)은 GPC 가 낮아 두께가 작다 — 화면 높이도 낮아져야 한다.
    const outside = aldCycleModel(sceneParams(basic, { tempC: 80, cycles: 100 })).filmHeight;
    expect(outside).toBeLessThan(ref);
  });
});
