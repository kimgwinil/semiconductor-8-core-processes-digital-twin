// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(`ald-scene-mapping.test.ts` 선례).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import {
  EDS_CLEARANCE_MAX_UM,
  EDS_CLEARANCE_MIN_UM,
  EDS_DL_DECADES,
  EDS_DL_MAX_PPM,
  EDS_DL_MIN_PPM,
  EDS_FORCE_MAX_G,
  EDS_LABS,
  EDS_MARK_LENGTH_RANGE_UM,
  EDS_OD_MARGIN_MAX_UM,
  EDS_OD_MARGIN_MIN_UM,
  EDS_OD_SLIDER_RANGE_UM,
  EDS_WAFER_CELLS_MAX,
} from '@/models/labs/eds';
import { contactForceCoefficient } from '@/models/physics/eds/probeOperations';
import { UM_PER_MIL } from '@/models/physics/eds/units';
import { labSceneBindings } from '@/models/labs/spec';
import type { LabSceneBinding, LabSpec } from '@/models/labs/spec';
import {
  PS_CLR_MAX_UM,
  PS_CLR_MIN_UM,
  PS_DEF_CLEARANCE,
  PS_DEF_OD_MARGIN,
  PS_FORCE_MAX_G,
  PS_ODM_MAX_UM,
  PS_ODM_MIN_UM,
  PS_OD_SLIDER_MAX,
  PS_OD_SLIDER_MIN,
  PS_UV_PER_UM,
  probeScrubModel,
  psClearanceUm,
  psForceG,
  psMarkSideUv,
  psOdMarginUm,
} from '@/viz/gl/scenes/models/probeScrub.model';
import {
  WM_CELLS_MAX,
  WM_DL_DECADES,
  WM_DL_MAX_PPM,
  WM_DL_MIN_PPM,
  WM_GAUGE_SPAN,
  WM_GAUGE_Y0,
  waferMapModel,
  yOfDL,
} from '@/viz/gl/scenes/models/waferMap.model';

/**
 * 🔴 **EDS 심화 칸의 랩(models) ↔ 씬(viz) 결속.**
 *
 * `scripts/check-layering.mjs` 가 `src/models` → `src/viz` import 를 금지한다. 그래서
 * **정규화 분모**(`EDS_*`, `src/models/labs/eds.ts`)와 **화면 역정규화 정박점**(`PS_*`/`WM_*`,
 * `src/viz/gl/scenes/models/*.model.ts`)이 두 층에 **나뉘어** 있다. 한쪽만 고치면 화면이 조용히
 * 낡는다 — 값은 여전히 0~1 이라 아무 게이트도 울지 않고, 눈금만 거짓이 된다.
 * **양쪽을 여기서 import 해 일치를 단언하는 것이 유일한 결속 수단**이다
 * (`deposition.ts` 의 `ALD_SCENE_TEMP_WINDOW` ↔ `ald-scene-mapping.test.ts` 와 같은 관례).
 *
 * 이 파일이 막는 것:
 *   (A) 분모/정박점이 갈라지는 것 — §1.
 *   (B) 문헌·정의역에서 나온 수가 「화면에 맞춘 수」로 바뀌는 것 — §2.
 *   (C) **부호 있는 두 양의 0(합격선)이 화면에서 옮겨 다니는 것** — §3.
 *   (D) map 이 **출력이 아니라 입력에서** 값을 파생하기 시작하는 것(A12) — §4.
 *   (E) 랩 `compute()` 의 실도달 구간이 축 밖으로 나가 클리핑되는 것 — §5.
 *
 * 🔴 부분문자열 검사를 쓰지 않는다. 전부 **값**으로 단언한다.
 */

/* ---------------- 검증 설정 (제품 상수가 아니다) ---------------- */

const spec = EDS_LABS.find((l) => l.stage === 'lab-advanced') as LabSpec;
const bindings = labSceneBindings(spec);
const probeScrub = bindings.find((b) => b.sceneId === 'probeScrub') as LabSceneBinding;
const waferMap = bindings.find((b) => b.sceneId === 'waferMap') as LabSceneBinding;

/** 슬라이더 기본값 한 벌. */
const DEFAULTS: Record<string, number> = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
/** 정의역 아래 끝 · 위 끝 한 벌. */
const ALL_MIN: Record<string, number> = Object.fromEntries(spec.params.map((p) => [p.id, p.min]));
const ALL_MAX: Record<string, number> = Object.fromEntries(spec.params.map((p) => [p.id, p.max]));

/** 랩 `compute()` 를 실제로 돌려 실값만 뽑는다(수치를 손으로 재현하지 않는다). */
function outputsFor(inputs: Record<string, number>): Record<string, number> {
  const out = spec.compute(inputs);
  const nums: Record<string, number> = {};
  for (const [k, q] of Object.entries(out)) nums[k] = q.value;
  return nums;
}

/** 슬라이더 하나만 갈아끼운 입력. */
function withParam(id: string, value: number): Record<string, number> {
  return { ...DEFAULTS, [id]: value };
}

function paramOf(id: string): { min: number; max: number; step: number } {
  const p = spec.params.find((x) => x.id === id);
  if (!p) throw new Error(`슬라이더 ${id} 가 없다`);
  return { min: p.min, max: p.max, step: p.step };
}

/** 씬이 실제로 받을 파라미터(랩 배선 그대로). */
function probeParams(inputs: Record<string, number>): Record<string, number> {
  return probeScrub.map(inputs, outputsFor(inputs));
}
function waferParams(inputs: Record<string, number>): Record<string, number> {
  return waferMap.map(inputs, outputsFor(inputs));
}

/* ════════════════════════════════════════════════════════════════ */

describe('EDS 심화 칸 — 씬 2종 병치 배선', () => {
  it('심화 칸이 probeScrub · waferMap 두 씬에 이 순서로 배선돼 있다', () => {
    expect(bindings.map((b) => b.sceneId)).toEqual(['probeScrub', 'waferMap']);
  });

  it('probeScrub 은 5키, waferMap 은 3키를 넘긴다 — 키가 늘거나 줄면 씬이 못 읽는다', () => {
    expect(Object.keys(probeParams(DEFAULTS)).sort())
      .toEqual(['clearance', 'force', 'forceCeil', 'odMargin', 'overdrive']);
    expect(Object.keys(waferParams(DEFAULTS)).sort())
      .toEqual(['defectLevel', 'dieAcross', 'rawYield']);
  });
});

describe('EDS 3단계 시각화 배선', () => {
  it('기초는 프로브 스크럽, 응용은 웨이퍼 맵, 심화는 두 씬을 병치한다', () => {
    const basic = EDS_LABS.find((l) => l.stage === 'lab-basic') as LabSpec;
    const applied = EDS_LABS.find((l) => l.stage === 'lab-applied') as LabSpec;
    expect(labSceneBindings(basic).map((b) => b.sceneId)).toEqual(['probeScrub']);
    expect(labSceneBindings(applied).map((b) => b.sceneId)).toEqual(['waferMap']);
    expect(labSceneBindings(spec).map((b) => b.sceneId)).toEqual(['probeScrub', 'waferMap']);
  });
});

describe('§1 🔴 정규화 분모 결속 — 계층 때문에 나뉘어 있는 정본을 여기서 묶는다', () => {
  it('개구부 여유 [µm] 축: EDS_CLEARANCE_{MIN,MAX}_UM = PS_CLR_{MIN,MAX}_UM', () => {
    expect(EDS_CLEARANCE_MIN_UM).toBeCloseTo(PS_CLR_MIN_UM, 12);
    expect(EDS_CLEARANCE_MAX_UM).toBeCloseTo(PS_CLR_MAX_UM, 12);
  });

  it('실무창 여유 [µm] 축: EDS_OD_MARGIN_{MIN,MAX}_UM = PS_ODM_{MIN,MAX}_UM', () => {
    expect(EDS_OD_MARGIN_MIN_UM).toBeCloseTo(PS_ODM_MIN_UM, 12);
    expect(EDS_OD_MARGIN_MAX_UM).toBeCloseTo(PS_ODM_MAX_UM, 12);
  });

  it('접촉력 [g] 축: EDS_FORCE_MAX_G = PS_FORCE_MAX_G', () => {
    expect(EDS_FORCE_MAX_G).toBeCloseTo(PS_FORCE_MAX_G, 12);
  });

  it('오버드라이브 슬라이더 정의역 [µm]: EDS_OD_SLIDER_RANGE_UM = [PS_OD_SLIDER_MIN, PS_OD_SLIDER_MAX]', () => {
    expect(EDS_OD_SLIDER_RANGE_UM[0]).toBeCloseTo(PS_OD_SLIDER_MIN, 12);
    expect(EDS_OD_SLIDER_RANGE_UM[1]).toBeCloseTo(PS_OD_SLIDER_MAX, 12);
  });

  it('🔴 마크 장축 정의역이 씬의 마크 사각형 크기와 같은 수다 — 여유 양끝에서 마크가 10 · 90 µm 다', () => {
    // 씬은 마크 「한 변(UV)」만 안다. 그것을 µm 로 되돌리면 랩의 슬라이더 정의역이 나와야 한다.
    expect(psMarkSideUv(PS_CLR_MAX_UM) / PS_UV_PER_UM).toBeCloseTo(EDS_MARK_LENGTH_RANGE_UM[0], 9);
    expect(psMarkSideUv(PS_CLR_MIN_UM) / PS_UV_PER_UM).toBeCloseTo(EDS_MARK_LENGTH_RANGE_UM[1], 9);
  });

  it('DL 로그 게이지: EDS_DL_{MIN,MAX}_PPM · EDS_DL_DECADES = WM_DL_{MIN,MAX}_PPM · WM_DL_DECADES', () => {
    expect(EDS_DL_MIN_PPM).toBeCloseTo(WM_DL_MIN_PPM, 12);
    expect(EDS_DL_MAX_PPM).toBeCloseTo(WM_DL_MAX_PPM, 12);
    expect(EDS_DL_DECADES).toBeCloseTo(WM_DL_DECADES, 12);
  });

  it('웨이퍼 격자 한 변 칸 수 상한: EDS_WAFER_CELLS_MAX = WM_CELLS_MAX', () => {
    expect(EDS_WAFER_CELLS_MAX).toBeCloseTo(WM_CELLS_MAX, 12);
  });
});

describe('§2 🔴 값의 출처 — 문헌·정의역에서 나온 수다 (화면에 맞춰 고른 수가 아니다)', () => {
  it('개구부 여유 [µm] = −15 ~ +25 — 개구부 60 µm 정사각 · 마크 정의역 10~90 µm ⇒ 여유 = 30 − L/2', () => {
    expect(EDS_CLEARANCE_MIN_UM).toBe(-15);
    expect(EDS_CLEARANCE_MAX_UM).toBe(25);
    // 랩 슬라이더를 정의역 양끝으로 밀면 정확히 그 두 값이 나온다(사슬을 실제로 통과시켜 본다).
    expect(outputsFor(withParam('markLengthUm', 90))['scrubClearanceUm']).toBeCloseTo(-15, 12);
    expect(outputsFor(withParam('markLengthUm', 10))['scrubClearanceUm']).toBeCloseTo(25, 12);
  });

  it('실무창 여유 [µm] = −74 ~ +25.5 — OD 상한 150 에서 76 − 150 · 실무창 25~76 의 절반폭', () => {
    expect(EDS_OD_MARGIN_MIN_UM).toBe(-74);
    expect(EDS_OD_MARGIN_MAX_UM).toBe(25.5);
    expect(outputsFor(withParam('overdriveUm', 150))['overdriveMarginUm']).toBeCloseTo(-74, 12);
    // 실무창 한가운데(50.5 µm)에서 여유가 최대다. 슬라이더 step 5 라 그 점은 밟지 않으므로 상한만 본다.
    expect(outputsFor(withParam('overdriveUm', 50))['overdriveMarginUm']).toBeLessThanOrEqual(25.5);
  });

  it('접촉력 상한 [g] = 7.5 — W 계수 상한 2.5 g/mil × 실무창 상한 3 mil (S229)', () => {
    expect(EDS_FORCE_MAX_G).toBe(7.5);
    expect(EDS_FORCE_MAX_G).toBeCloseTo(2.5 * 3, 12);
  });

  it('DL 게이지는 정확히 5 decade — 10 ppm → 1,000,000 ppm', () => {
    expect(EDS_DL_DECADES).toBe(5);
    expect(EDS_DL_MIN_PPM).toBe(10);
    expect(EDS_DL_MAX_PPM).toBe(1e6);
  });
});

describe('§3 🔴 0 이 화면의 어디에 오는가 — 부호 있는 두 양의 합격선', () => {
  it('scrubClearanceUm = 0 µm ⇒ clearance = 0.37500 (= 15/40)', () => {
    const inputs = withParam('markLengthUm', 60);
    expect(outputsFor(inputs)['scrubClearanceUm']).toBe(0);
    expect(probeParams(inputs)['clearance']).toBeCloseTo(0.375, 12);
  });

  it('overdriveMarginUm = 0 µm ⇒ odMargin = 0.74372 (= 74/99.5) — 실무창 두 경계 모두에서', () => {
    for (const od of [25, 76]) {
      const inputs = withParam('overdriveUm', od);
      expect(outputsFor(inputs)['overdriveMarginUm'], `OD=${od}`).toBe(0);
      expect(probeParams(inputs)['odMargin'], `OD=${od}`).toBeCloseTo(0.74372, 5);
    }
  });

  it('🔴 그 두 자리가 씬의 결측 기본값과 같다 — 값이 없을 때 마커가 합격선에 선다(A15)', () => {
    expect(probeParams(withParam('markLengthUm', 60))['clearance']).toBeCloseTo(PS_DEF_CLEARANCE, 5);
    expect(probeParams(withParam('overdriveUm', 25))['odMargin']).toBeCloseTo(PS_DEF_OD_MARGIN, 5);
  });

  it('🔴 씬의 역정규화가 랩의 µm 값을 그대로 되돌린다 — 왕복이 닫힌다', () => {
    for (const markLengthUm of [10, 30, 60, 68, 90]) {
      const inputs = withParam('markLengthUm', markLengthUm);
      const want = outputsFor(inputs)['scrubClearanceUm'] as number;
      expect(psClearanceUm(probeParams(inputs)['clearance'] as number), `L=${markLengthUm}`)
        .toBeCloseTo(want, 9);
    }
    for (const overdriveUm of [20, 25, 50, 76, 100, 150]) {
      const inputs = withParam('overdriveUm', overdriveUm);
      const want = outputsFor(inputs)['overdriveMarginUm'] as number;
      expect(psOdMarginUm(probeParams(inputs)['odMargin'] as number), `OD=${overdriveUm}`)
        .toBeCloseTo(want, 9);
      const wantG = outputsFor(inputs)['contactForceG'] as number;
      expect(psForceG(probeParams(inputs)['force'] as number), `OD=${overdriveUm} 힘`)
        .toBeCloseTo(wantG, 9);
    }
  });

  it('0 은 화면 한가운데(0.5)가 아니다 — 두 양의 합격선이 서로 다른 자리에 있다', () => {
    const clearanceZero = probeParams(withParam('markLengthUm', 60))['clearance'] as number;
    const marginZero = probeParams(withParam('overdriveUm', 25))['odMargin'] as number;
    expect(clearanceZero).not.toBeCloseTo(0.5, 2);
    expect(marginZero).not.toBeCloseTo(0.5, 2);
    expect(clearanceZero).not.toBeCloseTo(marginZero, 2);
  });
});

describe('§4 🔴 map 이 「출력에서」 읽는가 — A12 의 전부다', () => {
  /** 입력은 고정하고 출력만 갈아끼운다. 결과가 그대로 따라와야 한다. */
  const FIXED_IN = { ...DEFAULTS };

  it('probeScrub — 지정 3키가 출력을 그대로 따라간다', () => {
    const atZero = probeScrub.map(FIXED_IN, {
      scrubClearanceUm: 0, overdriveMarginUm: 0, contactForceG: 0,
    });
    expect(atZero['clearance']).toBeCloseTo(0.375, 12);
    expect(atZero['odMargin']).toBeCloseTo(0.74372, 5);
    expect(atZero['force']).toBeCloseTo(0, 12);

    const atTop = probeScrub.map(FIXED_IN, {
      scrubClearanceUm: 25, overdriveMarginUm: 25.5, contactForceG: 7.5,
    });
    expect(atTop['clearance']).toBeCloseTo(1, 12);
    expect(atTop['odMargin']).toBeCloseTo(1, 12);
    expect(atTop['force']).toBeCloseTo(1, 12);

    const atBottom = probeScrub.map(FIXED_IN, {
      scrubClearanceUm: -15, overdriveMarginUm: -74, contactForceG: 0,
    });
    expect(atBottom['clearance']).toBeCloseTo(0, 12);
    expect(atBottom['odMargin']).toBeCloseTo(0, 12);
  });

  it('🔴 출력을 고정한 채 입력만 흔들면 그 3키는 꿈쩍도 하지 않는다 (씬이 값을 다시 파생하지 않는다)', () => {
    const OUT = { scrubClearanceUm: 3, overdriveMarginUm: -20, contactForceG: 4 };
    const base = probeScrub.map(DEFAULTS, OUT);
    const shaken = probeScrub.map(
      { ...DEFAULTS, markLengthUm: 10, overdriveUm: 20, needleCleanAction: 1, coverage: 0.999 },
      OUT,
    );
    expect(shaken['clearance']).toBe(base['clearance']);
    expect(shaken['odMargin']).toBe(base['odMargin']);
    expect(shaken['force']).toBe(base['force']);
    // 반대로 **입력에서 오는 것으로 선언된** 2키는 움직여야 한다 — 죽은 키가 아니다.
    expect(shaken['overdrive']).not.toBe(base['overdrive']);
    expect(base['overdrive']).toBeCloseTo((130 - 20) / 130, 12);
    expect(shaken['overdrive']).toBeCloseTo(0, 12);
  });

  it('forceCeil 만 니들 재질(입력)에서 온다 — W · W-Re = 1.00 · BeCu = 0.64', () => {
    const OUT = { scrubClearanceUm: 0, overdriveMarginUm: 0, contactForceG: 0 };
    expect(probeScrub.map(withParam('needleMaterialIndex', 0), OUT)['forceCeil']).toBeCloseTo(1, 12);
    expect(probeScrub.map(withParam('needleMaterialIndex', 1), OUT)['forceCeil']).toBeCloseTo(1, 12);
    expect(probeScrub.map(withParam('needleMaterialIndex', 2), OUT)['forceCeil']).toBeCloseTo(0.64, 12);
  });

  it('🔴 waferMap 은 입력을 전혀 안 읽는다 — 입력을 아무리 흔들어도 결과가 한 글자도 안 바뀐다', () => {
    const OUT = { rawYield: 0.5, defectLevelPpm: 1500, grossDie: 900 };
    const base = waferMap.map(DEFAULTS, OUT);
    for (const inputs of [ALL_MIN, ALL_MAX, {}, { rawYield: 0.01, grossDie: 1 }]) {
      expect(waferMap.map(inputs, OUT)).toEqual(base);
    }
  });

  it('waferMap 은 출력만으로 움직인다 — 세 키가 각각 제 출력을 따라간다', () => {
    const base = { rawYield: 0.5, defectLevelPpm: 1500, grossDie: 900 };
    expect(waferMap.map(DEFAULTS, { ...base, rawYield: 0.25 })['rawYield']).toBeCloseTo(0.25, 12);
    // DL 게이지: 10 ppm ⇒ 0 · 1,000 ppm ⇒ 0.4 · 1,000,000 ppm ⇒ 1
    expect(waferMap.map(DEFAULTS, { ...base, defectLevelPpm: 10 })['defectLevel']).toBeCloseTo(0, 12);
    expect(waferMap.map(DEFAULTS, { ...base, defectLevelPpm: 1000 })['defectLevel']).toBeCloseTo(0.4, 12);
    expect(waferMap.map(DEFAULTS, { ...base, defectLevelPpm: 1e6 })['defectLevel']).toBeCloseTo(1, 12);
    // dieAcross: 격자 한 변 칸 수 상한 34 가 분모다 — 다이 수 34²·π/4 개면 딱 1 이다.
    const full = (34 * 34 * Math.PI) / 4;
    expect(waferMap.map(DEFAULTS, { ...base, grossDie: full })['dieAcross']).toBeCloseTo(1, 9);
  });

  it('🔴 DL 게이지 눈금이 씬의 `yOfDL()` 과 같은 자를 쓴다 — 기둥 높이가 랩 값과 갈리지 않는다', () => {
    for (const ppm of [10, 19.298107773906125, 1500, 31862.580521592714, 669666.6666666667, 1e6]) {
      const norm = waferMap.map(DEFAULTS, { rawYield: 0.5, defectLevelPpm: ppm, grossDie: 900 })['defectLevel'] as number;
      expect((yOfDL(ppm) - WM_GAUGE_Y0) / WM_GAUGE_SPAN, `${ppm} ppm`).toBeCloseTo(norm, 12);
    }
  });
});

describe('§5 🔴 끝에서 끝까지 — 랩 compute() 의 실제 출력이 씬 눈금 안에 들어온다', () => {
  const CORNERS: ReadonlyArray<readonly [string, Record<string, number>]> = [
    ['기본값', DEFAULTS],
    ['정의역 하단', ALL_MIN],
    ['정의역 상단', ALL_MAX],
  ];

  it.each(CORNERS)('%s — 씬 파라미터가 전부 유한하고 [0, 1] 안이다 (A14)', (_label, inputs) => {
    for (const [k, v] of Object.entries({ ...probeScrub.map(inputs, outputsFor(inputs)), ...waferMap.map(inputs, outputsFor(inputs)) })) {
      expect(Number.isFinite(v), `${k} = ${v}`).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    }
  });

  it('정의역 양끝에서 화면이 실제로 달라진다 — 슬라이더가 죽어 있지 않다', () => {
    const lo = { ...probeParams(ALL_MIN), ...waferParams(ALL_MIN) };
    const hi = { ...probeParams(ALL_MAX), ...waferParams(ALL_MAX) };
    for (const k of ['clearance', 'odMargin', 'force', 'overdrive', 'rawYield', 'defectLevel', 'dieAcross']) {
      expect(lo[k], `${k} 하단`).not.toBeCloseTo(hi[k] as number, 3);
    }
  });

  /**
   * 🔴 **클램프 고원의 값이 2026-08-22 에 바뀌었다 — 게이지 축은 그대로다.**
   *
   * `overdriveToMil` 이 두 정박점 보간(실효 25.5 µm/mil)에서 **정의 환산 `/25.4`** 로 바뀌면서
   * 실무창 상한 76 µm 는 3 mil 이 아니라 **2.9921 mil** 이 된다 → 2.5 g/mil × 2.9921 = **7.4803 g**.
   * 하한 25 µm 는 0.9843 mil → **2.4606 g** 이다.
   *
   * 🔴 **`EDS_FORCE_MAX_G`(= 7.5 g) 는 바꾸지 않았다.** 그것은 문헌 조합값
   * (계수 상한 2.5 g/mil × **인쇄된** 실무창 상한 3 mil)이자 게이지의 0–1 축이다. 그래서
   * 고원에서 게이지가 1.000 이 아니라 **0.9974** 를 가리키는 것이 정상이다 — 축을 실도달값에
   * 맞춰 다시 깎으면 「문헌 상한」이라는 축의 뜻이 사라진다.
   */
  const CLAMP_HI_G = contactForceCoefficient('W').max * (76 / UM_PER_MIL);
  const CLAMP_LO_G = contactForceCoefficient('W').max * (25 / UM_PER_MIL);

  it('🔴 접촉력은 OD 80~150 µm 전 구간에서 7.480 g 로 얼어 있다 — **의도된 클램프**다(결함이 아니다)', () => {
    const { step } = paramOf('overdriveUm');
    const seen = new Set<number>();
    for (let od = 80; od <= 150; od += step) {
      const inputs = withParam('overdriveUm', od);
      expect(outputsFor(inputs)['contactForceG'], `OD=${od}`).toBeCloseTo(CLAMP_HI_G, 12);
      seen.add(probeParams(inputs)['force'] as number);
    }
    // 정규화까지 정확히 같은 한 값이어야 한다 — 「살짝 다름」도 클램프가 풀린 것이다.
    expect([...seen]).toEqual([CLAMP_HI_G / EDS_FORCE_MAX_G]);
    // 🔴 축(7.5 g)은 문헌 상한 그대로이므로 고원은 1.000 이 아니라 0.9974 다 — 기대된 결과다.
    expect(CLAMP_HI_G / EDS_FORCE_MAX_G).toBeCloseTo(0.9973753280839894, 12);
    expect(probeParams(withParam('overdriveUm', 80))['force'])
      .toBe(probeParams(withParam('overdriveUm', 150))['force']);
  });

  it('OD 20~25 µm 도 같은 이유로 2.461 g 에 얼어 있다 — 실무창 아래쪽 클램프', () => {
    for (const od of [20, 25]) {
      expect(outputsFor(withParam('overdriveUm', od))['contactForceG'], `OD=${od}`)
        .toBeCloseTo(CLAMP_LO_G, 12);
      expect(probeParams(withParam('overdriveUm', od))['force'], `OD=${od}`)
        .toBeCloseTo(CLAMP_LO_G / EDS_FORCE_MAX_G, 12);
    }
  });

  it('🔴 rawYield 는 0 에 닿지 않는다 — 최소 ≈ 0.1043 (웨이퍼가 통째로 검게 칠해지지 않는다)', () => {
    let min = Number.POSITIVE_INFINITY;
    for (const inputs of cornerSweep()) min = Math.min(min, outputsFor(inputs)['rawYield'] as number);
    expect(min).toBeCloseTo(0.10432733075603094, 9);
    expect(min).toBeGreaterThan(0);
  });

  it('🔴 defectLevelPpm 의 실도달 구간 [19.298, 669,667] ppm 이 게이지 [10, 1e6] 안이다 — 클리핑 0건', () => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const inputs of cornerSweep()) {
      const ppm = outputsFor(inputs)['defectLevelPpm'] as number;
      min = Math.min(min, ppm);
      max = Math.max(max, ppm);
    }
    expect(min).toBeCloseTo(19.298107773906125, 9);
    expect(max).toBeCloseTo(669666.6666666667, 6);
    // 축을 넘지 않는다 = `clamp()` 가 한 번도 물지 않는다.
    expect(min).toBeGreaterThan(10);
    expect(max).toBeLessThan(1e6);
    // 그래서 게이지 기둥이 바닥·천장에 붙어 정보를 잃는 일이 없다.
    for (const inputs of cornerSweep()) {
      const norm = waferParams(inputs)['defectLevel'] as number;
      expect(norm).toBeGreaterThan(0);
      expect(norm).toBeLessThan(1);
    }
  });

  it('씬 모델이 랩이 넘긴 값을 그대로 받는다 — probeScrubModel · waferMapModel 이 되돌린 물리량이 일치한다', () => {
    for (const [, inputs] of CORNERS) {
      const out = outputsFor(inputs);
      const ps = probeScrubModel(probeScrub.map(inputs, out));
      expect(ps.clearanceUm).toBeCloseTo(out['scrubClearanceUm'] as number, 9);
      expect(ps.odMarginUm).toBeCloseTo(out['overdriveMarginUm'] as number, 9);
      expect(ps.forceG).toBeCloseTo(out['contactForceG'] as number, 9);
      expect(ps.pass).toBe((out['scrubClearanceUm'] as number) >= 0 && (out['overdriveMarginUm'] as number) >= 0);

      const wm = waferMapModel(waferMap.map(inputs, out));
      expect(wm.rawYield).toBeCloseTo(out['rawYield'] as number, 12);
      expect(wm.across).toBeGreaterThanOrEqual(12);
      expect(wm.across).toBeLessThanOrEqual(WM_CELLS_MAX);
      expect(wm.pass).toBe((out['defectLevelPpm'] as number) <= 1500);
    }
  });
});

/**
 * 수율·결함수준을 움직이는 5축의 **정의역 모서리 전량**(2⁵ = 32점).
 * 🔴 랩 계산을 실제로 돌린 값만 본다 — 기대 수치를 식으로 재현하지 않는다.
 */
function cornerSweep(): Array<Record<string, number>> {
  const axes = ['coverage', 'dieAreaMm2', 'defectDensity', 'guardbandPct', 'redundancy'];
  const out: Array<Record<string, number>> = [];
  for (let mask = 0; mask < 1 << axes.length; mask++) {
    const inputs: Record<string, number> = { ...DEFAULTS };
    axes.forEach((id, k) => {
      const p = paramOf(id);
      inputs[id] = ((mask >> k) & 1) === 0 ? p.min : p.max;
    });
    out.push(inputs);
  }
  return out;
}
