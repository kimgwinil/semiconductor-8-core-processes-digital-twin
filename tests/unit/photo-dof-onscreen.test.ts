// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다.
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { PHOTO_LABS } from '@/models/labs/photo';
import type { LabSpec } from '@/models/labs/spec';
import { aerialImageModel } from '@/viz/gl/scenes/models/aerialImage.model';

/**
 * 🔴 **「게이트가 못 본다」와 「화면에 없다」는 다른 명제다** (2026-08-22 신설).
 *
 * `scripts/check-direction.mjs` V1 은 `scene.map` 본문에서 `out['Y']` 가 읽히는지를 본다.
 * 그래서 PH-D1(`cdNm`+`dofNm`)·PH-D5(`dofNm`)가 **A12 미달**로 찍힌다 —
 * `photo*SceneMap` 이 `out['dofNm']` 을 읽지 않기 때문이다.
 *
 * 🔴 그러나 **DOF 는 이미 화면에 초점 허용 띠로 그려지고 있다.** 씬이 `na` 하나에서
 * `dofNm = DOF_COEF_NM / naValue²` 를 **스스로 계산하기** 때문이다(`aerialImage.model.ts:255`).
 * 즉 랩의 `dofNm` 과 씬의 띠는 **같은 물리량을 같은 계수로 계산한 같은 값**이고,
 * 없는 것은 화면이 아니라 **이름 경로**다.
 *
 * 🔴 그래서 `defocus` 슬롯에 `out['dofNm']` 을 나눠 넣으면 **DOF 로 두 번 나누는 이중 계상**이 되고,
 *    `na` 슬롯에 역산(`na ← √(DOF_COEF/dofNm)`)을 꽂으면 NA→DOF→NA 순환이라
 *    **화면이 한 픽셀도 달라지지 않는다.** 둘 다 게이트 숫자만 올린다 — 하지 마라.
 *
 * 이 테스트가 단언하는 것은 하나뿐이다: **화면의 초점 허용 띠가 랩의 `dofNm` 에 정확히 비례한다.**
 * `na` 매핑이 깨지거나 상수로 얼어붙으면 여기서 빨간불이 난다.
 */

function labOf(stage: string): LabSpec {
  const s = PHOTO_LABS.find((x) => x.stage === stage);
  expect(s, `photo ${stage} 랩이 없다`).toBeDefined();
  return s as LabSpec;
}

/** NA 가 조작 대상인 칸은 응용(S6)·심화(S7)다. 기초는 NA 고정이라 대조군으로 쓴다. */
const applied = labOf('lab-applied');
const basic = labOf('lab-basic');

function values(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(lab.compute(inputs))) out[k] = (v as { value: number }).value;
  return out;
}

/** 실제 배선(`lab.scene.map`)을 그대로 태운다. 문자열 검사를 쓰지 않는다. */
function sceneParams(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const scene = lab.scene;
  expect(scene, '씬 배선이 없다').toBeDefined();
  expect(scene!.sceneId).toBe('aerialImage');
  return scene!.map(inputs, values(lab, inputs));
}

function num(v: number | undefined): number {
  expect(v, '수치가 없다').toBeTypeOf('number');
  return v as number;
}

/** NA 슬라이더 정의역은 랩 선언에서 읽는다 — 손으로 적으면 갈라진다. */
function naDomain(lab: LabSpec): [number, number] {
  const p = lab.params.find((x) => x.id === 'na');
  expect(p, 'na 슬라이더 선언이 없다').toBeDefined();
  return [num(p!.min), num(p!.max)];
}

const STEPS = 14;

describe('PH-D1·D5 — 게이트는 못 보지만 DOF 는 화면에 초점 허용 띠로 살아 있다', () => {
  it('focusBandHalf / dofNm 이 NA 정의역 전 구간에서 같은 상수다', () => {
    const [lo, hi] = naDomain(applied);
    const ratios: number[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const na = lo + ((hi - lo) * i) / STEPS;
      const inputs = { na, doseMjCm2: 25, focusOffsetNm: 0 };
      const dofNm = num(values(applied, inputs)['dofNm']);
      expect(dofNm, `DOF 가 0 이면 비를 못 잰다 (NA=${na})`).toBeGreaterThan(0);
      ratios.push(aerialImageModel(sceneParams(applied, inputs)).focusBandHalf / dofNm);
    }
    const ref = num(ratios[0]);
    expect(ref).toBeGreaterThan(0);
    for (const r of ratios) expect(r).toBeCloseTo(ref, 12);
  });

  it('얼어 있지 않다 — NA 를 정의역 끝에서 끝까지 밀면 띠가 실제로 좁아진다(DOF ∝ 1/NA²)', () => {
    const [lo, hi] = naDomain(applied);
    const at = (na: number) =>
      aerialImageModel(sceneParams(applied, { na, doseMjCm2: 25, focusOffsetNm: 0 })).focusBandHalf;
    const wide = at(lo);
    const narrow = at(hi);
    expect(narrow).toBeLessThan(wide);
    // NA 1.00 → 1.35 면 1/NA² 로 (1/1.35²) = 0.5487 배. 계수를 새로 적지 않고 비로 확인한다.
    expect(narrow / wide).toBeCloseTo((lo * lo) / (hi * hi), 9);
  });

  it('단조: NA 를 올릴 때마다 띠가 좁아진다(중간에서 뒤집히지 않는다)', () => {
    const [lo, hi] = naDomain(applied);
    let prev = Infinity;
    for (let i = 0; i <= STEPS; i++) {
      const na = lo + ((hi - lo) * i) / STEPS;
      const band = aerialImageModel(
        sceneParams(applied, { na, doseMjCm2: 25, focusOffsetNm: 0 }),
      ).focusBandHalf;
      expect(band).toBeLessThan(prev);
      prev = band;
    }
  });

  it('대조군 — 기초 칸은 NA 고정이므로 띠도 고정이다(랩의 dofNm 과 같이 고정)', () => {
    const a = aerialImageModel(sceneParams(basic, { doseMjCm2: 20, focusOffsetNm: -100 }));
    const b = aerialImageModel(sceneParams(basic, { doseMjCm2: 40, focusOffsetNm: 120 }));
    expect(a.focusBandHalf).toBeCloseTo(b.focusBandHalf, 12);
  });
});
