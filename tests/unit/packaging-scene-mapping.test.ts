// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(`ald-scene-mapping.test.ts` 선례).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import {
  PACKAGING_LABS,
  PKG_DIE_AREA_UNITS_MAX,
  PKG_MARGIN_AXIS_H,
  PKG_POWER_AXIS_MAX_W,
  PKG_RISE_AXIS_MAX_C,
  PKG_SHEAR_AXIS_MAX_KG,
  PKG_SHEAR_CLASS_MAX,
  PKG_SPEED_MAX_MM_PER_S,
  PKG_SPEED_MIN_MM_PER_S,
  PKG_THETA_MAX,
  PKG_THETA_MIN,
  PKG_TIME_AXIS_MAX_H,
} from '@/models/labs/packaging';
import { labSceneBindings } from '@/models/labs/spec';
import type { LabSceneBinding, LabSpec } from '@/models/labs/spec';
import {
  PT_POWER_AXIS_MAX_W,
  PT_POWER_BANDS,
  PT_RISE_AXIS_MAX_C,
  PT_THETA_MAX,
  PT_THETA_MIN,
  packageThermalModel,
} from '@/viz/gl/scenes/models/packageThermal.model';
import {
  MS_FLOOR_LIFE_STEPS_H,
  MS_MARGIN_AXIS_H,
  MS_MARGIN_ZERO,
  MS_SOAK_STEPS_H,
  MS_TIME_AXIS_MAX_H,
  moistureSoakModel,
  msMarginHours,
} from '@/viz/gl/scenes/models/moistureSoak.model';
import {
  ST_AREA_KNEE_UNITS,
  ST_DIE_AREA_UNITS_MAX,
  ST_KNEE_SIDE,
  ST_PLATEAU_KG,
  ST_SHEAR_AXIS_MAX_KG,
  ST_SHEAR_CLASS_MAX,
  ST_SLOPE_KG_PER_UNIT,
  ST_SPEED_MAX,
  ST_SPEED_MIN,
  shearTestModel,
  stDieSide,
  stSpeedLog,
} from '@/viz/gl/scenes/models/shearTest.model';

/**
 * 🔴 **패키징 3칸의 랩(models) ↔ 씬(viz) 결속.**
 *
 * `scripts/check-layering.mjs` 가 `src/models` → `src/viz` import 를 금지한다. 그래서
 * **정규화 분모**(`PKG_*`, `src/models/labs/packaging.ts`)와 **화면 역정규화 정박점**
 * (`PT_*`/`MS_*`/`ST_*`, `src/viz/gl/scenes/models/*.model.ts`)이 두 층에 **나뉘어** 있다.
 * 한쪽만 고치면 화면이 조용히 낡는다 — 값은 여전히 0~1 이라 아무 게이트도 울지 않는다.
 * **양쪽을 여기서 import 해 일치를 단언하는 것이 유일한 결속 수단**이다
 * (`deposition.ts` 의 `ALD_SCENE_TEMP_WINDOW` ↔ `ald-scene-mapping.test.ts` 와 같은 관례).
 *
 * 🔴 **이 파일의 핵심은 「이산값이 이산으로 남는가」다.** 6종 중 4종이 계단이고
 * (`recommendedPowerW` 5단 · `floorLifeH` 4단 · `standardSoakH` 4단 · `shearSpeedClass` 3단),
 * `dieShearRequiredKg` 는 a = 64 → 65 에서 **표준에 실재하는 불연속**(2.56 → 2.50 kg)을 갖는다.
 * 누군가 「튀는 값」을 매끄럽게 펴면 표준이 왜곡된다 — 그것을 여기서 막는다.
 *
 * 🔴 부분문자열 검사를 쓰지 않는다. 전부 **값**으로 단언한다.
 */

/* ---------------- 검증 설정 (제품 상수가 아니다) ---------------- */

function labOf(stage: string): LabSpec {
  const spec = PACKAGING_LABS.find((l) => l.stage === stage);
  if (!spec) throw new Error(`패키징 ${stage} 칸이 없다`);
  return spec;
}
function sceneOf(spec: LabSpec, sceneId: string): LabSceneBinding {
  const b = labSceneBindings(spec).find((x) => x.sceneId === sceneId);
  if (!b) throw new Error(`${sceneId} 씬 배선이 없다`);
  return b;
}
function defaultsOf(spec: LabSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
}
function outputsOf(spec: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const out = spec.compute(inputs);
  const nums: Record<string, number> = {};
  for (const [k, q] of Object.entries(out)) nums[k] = q.value;
  return nums;
}
/** 슬라이더 격자 전량(min → max, step 단위). */
function gridOf(spec: LabSpec, id: string): number[] {
  const p = spec.params.find((x) => x.id === id);
  if (!p) throw new Error(`슬라이더 ${id} 가 없다`);
  const out: number[] = [];
  const decimals = Math.max(0, (String(p.step).split('.')[1] ?? '').length);
  for (let v = p.min; v <= p.max + p.step / 2; v += p.step) out.push(Number(v.toFixed(decimals + 3)));
  return out;
}

const basic = labOf('lab-basic');
const applied = labOf('lab-applied');
const advanced = labOf('lab-advanced');
const packageThermal = sceneOf(basic, 'packageThermal');
const moistureSoak = sceneOf(applied, 'moistureSoak');
const shearTest = sceneOf(advanced, 'shearTest');

const BASIC_DEF = defaultsOf(basic);
const APPLIED_DEF = defaultsOf(applied);
const ADV_DEF = defaultsOf(advanced);

function thermalParams(inputs: Record<string, number>): Record<string, number> {
  return packageThermal.map(inputs, outputsOf(basic, inputs));
}
function soakParams(inputs: Record<string, number>): Record<string, number> {
  return moistureSoak.map(inputs, outputsOf(applied, inputs));
}
function shearParams(inputs: Record<string, number>): Record<string, number> {
  return shearTest.map(inputs, outputsOf(advanced, inputs));
}

/* ════════════════════════════════════════════════════════════════ */

describe('패키징 3칸 — 씬 배선', () => {
  it('기초·응용·심화가 각각 packageThermal · moistureSoak · shearTest 에 배선돼 있다', () => {
    expect(labSceneBindings(basic).map((b) => b.sceneId)).toEqual(['packageThermal']);
    expect(labSceneBindings(applied).map((b) => b.sceneId)).toEqual(['moistureSoak']);
    expect(labSceneBindings(advanced).map((b) => b.sceneId)).toEqual(['shearTest']);
  });

  it('씬이 받는 키가 각각 4 · 4 · 5 개다 — 늘거나 줄면 씬이 못 읽는다', () => {
    expect(Object.keys(thermalParams(BASIC_DEF)).sort()).toEqual(['recPower', 'rise', 'testPower', 'theta']);
    expect(Object.keys(soakParams(APPLIED_DEF)).sort()).toEqual(['exposure', 'floorLife', 'margin', 'soak']);
    expect(Object.keys(shearParams(ADV_DEF)).sort())
      .toEqual(['applied', 'dieArea', 'required', 'speedClass', 'speedLog']);
  });
});

describe('§1 🔴 정규화 분모 결속 — 계층 때문에 나뉘어 있는 정본을 여기서 묶는다', () => {
  it('ΔT 축 [°C]: PKG_RISE_AXIS_MAX_C = PT_RISE_AXIS_MAX_C = 300', () => {
    expect(PKG_RISE_AXIS_MAX_C).toBeCloseTo(PT_RISE_AXIS_MAX_C, 12);
    expect(PKG_RISE_AXIS_MAX_C).toBe(300);
  });

  it('전력 축 [W]: PKG_POWER_AXIS_MAX_W = PT_POWER_AXIS_MAX_W = 3', () => {
    expect(PKG_POWER_AXIS_MAX_W).toBeCloseTo(PT_POWER_AXIS_MAX_W, 12);
    expect(PKG_POWER_AXIS_MAX_W).toBe(3);
  });

  it('θ 축 [°C/W]: PKG_THETA_{MIN,MAX} = PT_THETA_{MIN,MAX} = 15 · 100', () => {
    expect(PKG_THETA_MIN).toBeCloseTo(PT_THETA_MIN, 12);
    expect(PKG_THETA_MAX).toBeCloseTo(PT_THETA_MAX, 12);
    expect(PKG_THETA_MIN).toBe(15);
    expect(PKG_THETA_MAX).toBe(100);
  });

  it('시간 축 [h]: PKG_TIME_AXIS_MAX_H = MS_TIME_AXIS_MAX_H = 192', () => {
    expect(PKG_TIME_AXIS_MAX_H).toBeCloseTo(MS_TIME_AXIS_MAX_H, 12);
    expect(PKG_TIME_AXIS_MAX_H).toBe(192);
  });

  it('여유 축 반폭 [h]: PKG_MARGIN_AXIS_H = MS_MARGIN_AXIS_H = 192', () => {
    expect(PKG_MARGIN_AXIS_H).toBeCloseTo(MS_MARGIN_AXIS_H, 12);
    expect(PKG_MARGIN_AXIS_H).toBe(192);
  });

  it('전단력 축 [kg]: PKG_SHEAR_AXIS_MAX_KG = ST_SHEAR_AXIS_MAX_KG = 5', () => {
    expect(PKG_SHEAR_AXIS_MAX_KG).toBeCloseTo(ST_SHEAR_AXIS_MAX_KG, 12);
    expect(PKG_SHEAR_AXIS_MAX_KG).toBe(5);
  });

  it('다이 면적 축 [10⁻⁴ in²]: PKG_DIE_AREA_UNITS_MAX = ST_DIE_AREA_UNITS_MAX = 100', () => {
    expect(PKG_DIE_AREA_UNITS_MAX).toBeCloseTo(ST_DIE_AREA_UNITS_MAX, 12);
    expect(PKG_DIE_AREA_UNITS_MAX).toBe(100);
  });

  it('속도구분 색인 상한: PKG_SHEAR_CLASS_MAX = ST_SHEAR_CLASS_MAX = 3', () => {
    expect(PKG_SHEAR_CLASS_MAX).toBeCloseTo(ST_SHEAR_CLASS_MAX, 12);
    expect(PKG_SHEAR_CLASS_MAX).toBe(3);
  });

  it('전단속도 로그축 [mm/s]: PKG_SPEED_{MIN,MAX}_MM_PER_S = ST_SPEED_{MIN,MAX} = 0.1 · 100', () => {
    expect(PKG_SPEED_MIN_MM_PER_S).toBeCloseTo(ST_SPEED_MIN, 12);
    expect(PKG_SPEED_MAX_MM_PER_S).toBeCloseTo(ST_SPEED_MAX, 12);
    expect(PKG_SPEED_MIN_MM_PER_S).toBe(0.1);
    expect(PKG_SPEED_MAX_MM_PER_S).toBe(100);
  });
});

describe('§2 🔴 이산값이 이산으로 남는가 — recommendedPowerW 는 5단뿐이다', () => {
  const POWER_STEPS = [0.5, 0.75, 1, 2, 3] as const;

  it('θ 슬라이더 격자 전량을 훑어도 서로 다른 값이 5개 이하이며 전부 {0.5, 0.75, 1, 2, 3} W 안이다', () => {
    const seen = new Set<number>();
    for (const theta of gridOf(basic, 'thetaCPerW')) {
      seen.add(outputsOf(basic, { ...BASIC_DEF, thetaCPerW: theta })['recommendedPowerW'] as number);
    }
    expect(seen.size).toBeLessThanOrEqual(5);
    expect([...seen].sort((a, b) => a - b)).toEqual([...POWER_STEPS]);
  });

  it.each([[15, 3], [20, 2], [25, 2], [30, 1], [45, 1], [60, 0.75], [95, 0.75], [100, 0.5]] as const)(
    '경계 귀속: θ = %i °C/W ⇒ %f W (경계값은 **낮은 전력 쪽**이 갖는다)',
    (theta, want) => {
      expect(outputsOf(basic, { ...BASIC_DEF, thetaCPerW: theta })['recommendedPowerW']).toBeCloseTo(want, 12);
    },
  );

  it('🔴 씬이 들고 있는 계단표(PT_POWER_BANDS)가 랩 계산과 한 칸도 어긋나지 않는다', () => {
    expect(PT_POWER_BANDS.map((b) => b.powerW)).toEqual([...POWER_STEPS].reverse());
    for (const theta of gridOf(basic, 'thetaCPerW')) {
      // 씬 표를 θ 오름차순으로 훑어 마지막으로 만족하는 밴드가 그 θ 의 전력이다.
      let sceneSide = PT_POWER_BANDS[0]?.powerW ?? 0;
      for (const band of PT_POWER_BANDS) if (theta >= band.thetaMin) sceneSide = band.powerW;
      const labSide = outputsOf(basic, { ...BASIC_DEF, thetaCPerW: theta })['recommendedPowerW'] as number;
      expect(sceneSide, `θ=${theta}`).toBeCloseTo(labSide, 12);
    }
  });

  it('계단을 보간하지 않는다 — 인접 θ 사이에서 값이 뛰거나 그대로일 뿐 중간값이 없다', () => {
    for (const theta of gridOf(basic, 'thetaCPerW')) {
      const w = outputsOf(basic, { ...BASIC_DEF, thetaCPerW: theta })['recommendedPowerW'] as number;
      expect(POWER_STEPS.some((s) => Math.abs(s - w) < 1e-12), `θ=${theta} → ${w}`).toBe(true);
    }
  });
});

describe('§3 🔴 이산값이 이산으로 남는가 — floorLifeH 4단 · standardSoakH 4단', () => {
  it('MSL 색인 0~3 전량에서 floorLifeH ∈ {24, 48, 72, 168} · standardSoakH ∈ {48, 72, 96, 192}', () => {
    const floors: number[] = [];
    const soaks: number[] = [];
    for (const idx of gridOf(applied, 'mslHourlyIndex')) {
      const out = outputsOf(applied, { ...APPLIED_DEF, mslHourlyIndex: idx });
      floors.push(out['floorLifeH'] as number);
      soaks.push(out['standardSoakH'] as number);
    }
    expect(floors).toEqual([168, 72, 48, 24]);
    expect(soaks).toEqual([192, 96, 72, 48]);
    expect([...new Set(floors)].sort((a, b) => a - b)).toEqual([24, 48, 72, 168]);
    expect([...new Set(soaks)].sort((a, b) => a - b)).toEqual([48, 72, 96, 192]);
  });

  it('🔴 씬의 유령 눈금(MS_FLOOR_LIFE_STEPS_H · MS_SOAK_STEPS_H)이 랩의 4단과 같은 표다', () => {
    const floors = gridOf(applied, 'mslHourlyIndex')
      .map((idx) => outputsOf(applied, { ...APPLIED_DEF, mslHourlyIndex: idx })['floorLifeH'] as number);
    const soaks = gridOf(applied, 'mslHourlyIndex')
      .map((idx) => outputsOf(applied, { ...APPLIED_DEF, mslHourlyIndex: idx })['standardSoakH'] as number);
    expect([...MS_FLOOR_LIFE_STEPS_H]).toEqual(floors);
    expect([...MS_SOAK_STEPS_H]).toEqual(soaks);
  });

  it('막대 끝이 네 자리만 밟는다 — 정규화값도 4개뿐이다', () => {
    const floorNorm = new Set<number>();
    const soakNorm = new Set<number>();
    for (const idx of gridOf(applied, 'mslHourlyIndex')) {
      const p = soakParams({ ...APPLIED_DEF, mslHourlyIndex: idx });
      floorNorm.add(p['floorLife'] as number);
      soakNorm.add(p['soak'] as number);
    }
    expect([...floorNorm].sort((a, b) => a - b)).toEqual([0.125, 0.25, 0.375, 0.875]);
    expect([...soakNorm].sort((a, b) => a - b)).toEqual([0.25, 0.375, 0.5, 1]);
  });
});

describe('§4 🔴 이산값이 이산으로 남는가 — shearSpeedClass 는 {1, 2, 3} 만 도달한다', () => {
  it('속도 슬라이더 격자 전량에서 도달 구분이 정확히 {1, 2, 3} 이다 (0 은 하한 0.1 때문에 도달 불가)', () => {
    const seen = new Set<number>();
    for (const v of gridOf(advanced, 'shearSpeedMmPerS')) {
      seen.add(outputsOf(advanced, { ...ADV_DEF, shearSpeedMmPerS: v })['shearSpeedClass'] as number);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it.each([[0.1, 1], [0.8, 1], [0.9, 2], [5, 2], [50, 2], [50.1, 3], [100, 3]] as const)(
    '경계 귀속: v = %f mm/s ⇒ class %i (0.8 은 저속 A 포함 · 50.0 은 아직 미규정)',
    (v, want) => {
      expect(outputsOf(advanced, { ...ADV_DEF, shearSpeedMmPerS: v })['shearSpeedClass']).toBe(want);
    },
  );

  it('정규화 speedClass 는 3단(1/3 · 2/3 · 1)뿐이고 씬이 색인으로 되돌린다', () => {
    for (const [v, idx, norm] of [[0.5, 1, 1 / 3], [5, 2, 2 / 3], [80, 3, 1]] as const) {
      const p = shearParams({ ...ADV_DEF, shearSpeedMmPerS: v });
      expect(p['speedClass'], `v=${v}`).toBeCloseTo(norm, 12);
      expect(shearTestModel(p).classIndex, `v=${v}`).toBe(idx);
    }
  });
});

describe('§5 🔴 dieShearRequiredKg 의 a = 64 → 65 불연속 — 표준에 실재한다(펴지 마라)', () => {
  const required = (a: number): number =>
    outputsOf(advanced, { ...ADV_DEF, dieAreaUnits: a })['dieShearRequiredKg'] as number;

  it('a = 64 ⇒ 2.56 kg · a = 65 ⇒ 2.50 kg · a = 100 ⇒ 2.50 kg', () => {
    expect(required(64)).toBeCloseTo(2.56, 12);
    expect(required(65)).toBeCloseTo(2.5, 12);
    expect(required(100)).toBeCloseTo(2.5, 12);
  });

  it('🔴 최댓값은 a = 64 다 — 면적을 더 키우면 요구치가 **내려앉는다**', () => {
    let best = -Infinity;
    let bestAt = -1;
    for (let a = 1; a <= 100; a++) {
      const kg = required(a);
      if (kg > best) { best = kg; bestAt = a; }
    }
    expect(bestAt).toBe(64);
    expect(best).toBeCloseTo(2.56, 12);
  });

  it('a ≥ 65 는 전부 2.50 kg 평탄이다 — 한 점도 예외가 없다', () => {
    for (let a = 65; a <= 100; a++) expect(required(a), `a=${a}`).toBeCloseTo(2.5, 12);
  });

  it('🔴 씬이 들고 있는 꺾임 상수(ST_AREA_KNEE_UNITS · ST_PLATEAU_KG · ST_SLOPE_KG_PER_UNIT)가 랩 곡선과 같다', () => {
    expect(ST_AREA_KNEE_UNITS).toBe(64);
    expect(ST_PLATEAU_KG).toBe(2.5);
    expect(ST_SLOPE_KG_PER_UNIT).toBe(0.04);
    for (let a = 1; a <= 100; a++) {
      const want = a <= ST_AREA_KNEE_UNITS ? ST_SLOPE_KG_PER_UNIT * a : ST_PLATEAU_KG;
      expect(required(a), `a=${a}`).toBeCloseTo(want, 12);
    }
    // 불연속의 크기도 값으로 못박는다 — 0.06 kg 이 사라지면 누군가 곡선을 폈다는 뜻이다.
    expect(required(64) - required(65)).toBeCloseTo(0.06, 12);
  });

  it('막대 높이(정규화)도 그 계단을 그대로 갖는다 — a 64 ⇒ 0.512 · 65 ⇒ 0.500', () => {
    expect(shearParams({ ...ADV_DEF, dieAreaUnits: 64 })['required']).toBeCloseTo(0.512, 12);
    expect(shearParams({ ...ADV_DEF, dieAreaUnits: 65 })['required']).toBeCloseTo(0.5, 12);
  });

  it('씬의 꺾임 사각형 한 변이 a = 64 의 다이 사각형과 같다 — 윤곽을 넘는 순간이 그 전이다', () => {
    expect(stDieSide(shearParams({ ...ADV_DEF, dieAreaUnits: 64 })['dieArea'] as number))
      .toBeCloseTo(ST_KNEE_SIDE, 9);
    expect(shearTestModel(shearParams({ ...ADV_DEF, dieAreaUnits: 64 })).overKnee).toBe(false);
    expect(shearTestModel(shearParams({ ...ADV_DEF, dieAreaUnits: 65 })).overKnee).toBe(true);
  });
});

describe('§6 🔴 씬 map 을 실제로 호출해 확인 — packageThermal', () => {
  it('riseC 7.5 °C ⇒ rise 0.025 · riseC 300 °C ⇒ rise 1.0', () => {
    const lo = { ...BASIC_DEF, thetaCPerW: 15, testPowerW: 0.5 };
    const hi = { ...BASIC_DEF, thetaCPerW: 100, testPowerW: 3 };
    expect(outputsOf(basic, lo)['riseC']).toBeCloseTo(7.5, 12);
    expect(outputsOf(basic, hi)['riseC']).toBeCloseTo(300, 12);
    expect(thermalParams(lo)['rise']).toBeCloseTo(0.025, 12);
    expect(thermalParams(hi)['rise']).toBeCloseTo(1, 12);
  });

  it('θ · 시험전력 · 권장전력이 각각 제 축으로 간다', () => {
    const lo = { ...BASIC_DEF, thetaCPerW: 15, testPowerW: 0.5 };
    const hi = { ...BASIC_DEF, thetaCPerW: 100, testPowerW: 3 };
    expect(thermalParams(lo)['theta']).toBeCloseTo(0, 12);
    expect(thermalParams(hi)['theta']).toBeCloseTo(1, 12);
    expect(thermalParams(lo)['testPower']).toBeCloseTo(1 / 6, 12);
    expect(thermalParams(hi)['testPower']).toBeCloseTo(1, 12);
    // θ=15 → 3 W(축 꼭대기) · θ=100 → 0.5 W(표의 최저단)
    expect(thermalParams(lo)['recPower']).toBeCloseTo(1, 12);
    expect(thermalParams(hi)['recPower']).toBeCloseTo(1 / 6, 12);
  });

  it('씬 모델이 눈금으로 되돌린 값이 랩 출력과 같다 — 300 °C 는 합격창(20~60) 밖이다', () => {
    const hi = { ...BASIC_DEF, thetaCPerW: 100, testPowerW: 3 };
    const m = packageThermalModel(thermalParams(hi));
    expect(m.riseC).toBeCloseTo(300, 9);
    expect(m.thetaCPerW).toBeCloseTo(100, 9);
    expect(m.testPowerW).toBeCloseTo(3, 9);
    expect(m.recPowerW).toBeCloseTo(0.5, 9);
    expect(m.risePass).toBe(false);
  });
});

describe('§7 🔴 씬 map 을 실제로 호출해 확인 — moistureSoak (합격선이 화면 한가운데)', () => {
  it('여유 0 h ⇒ margin 정확히 0.5 — 네 등급 전부에서', () => {
    for (const idx of gridOf(applied, 'mslHourlyIndex')) {
      const floor = outputsOf(applied, { ...APPLIED_DEF, mslHourlyIndex: idx })['floorLifeH'] as number;
      const inputs = { ...APPLIED_DEF, mslHourlyIndex: idx, floorExposureH: floor };
      expect(outputsOf(applied, inputs)['floorLifeMarginH'], `MSL 색인 ${idx}`).toBe(0);
      expect(soakParams(inputs)['margin'], `MSL 색인 ${idx}`).toBeCloseTo(0.5, 12);
    }
    expect(MS_MARGIN_ZERO).toBe(0.5);
  });

  it('여유 −168 h ⇒ 0.0625 · +168 h ⇒ 0.9375', () => {
    // MSL 5a(색인 3) · 플로어 24 h · 노출 192 h ⇒ 여유 −168 h
    const under = { ...APPLIED_DEF, mslHourlyIndex: 3, floorExposureH: 192 };
    expect(outputsOf(applied, under)['floorLifeMarginH']).toBe(-168);
    expect(soakParams(under)['margin']).toBeCloseTo(0.0625, 12);
    // MSL 3(색인 0) · 플로어 168 h · 노출 0 h ⇒ 여유 +168 h
    const over = { ...APPLIED_DEF, mslHourlyIndex: 0, floorExposureH: 0 };
    expect(outputsOf(applied, over)['floorLifeMarginH']).toBe(168);
    expect(soakParams(over)['margin']).toBeCloseTo(0.9375, 12);
  });

  it('🔴 씬의 역정규화가 여유 시간을 그대로 되돌린다 — 왕복이 닫힌다', () => {
    for (const idx of gridOf(applied, 'mslHourlyIndex')) {
      for (const exposure of [0, 24, 48, 96, 192]) {
        const inputs = { ...APPLIED_DEF, mslHourlyIndex: idx, floorExposureH: exposure };
        const want = outputsOf(applied, inputs)['floorLifeMarginH'] as number;
        expect(msMarginHours(soakParams(inputs)['margin'] as number), `MSL ${idx} · ${exposure} h`)
          .toBeCloseTo(want, 9);
      }
    }
  });

  it('노출 마커가 시간축을 그대로 탄다 — 0 h ⇒ 0 · 192 h ⇒ 1', () => {
    expect(soakParams({ ...APPLIED_DEF, floorExposureH: 0 })['exposure']).toBeCloseTo(0, 12);
    expect(soakParams({ ...APPLIED_DEF, floorExposureH: 96 })['exposure']).toBeCloseTo(0.5, 12);
    expect(soakParams({ ...APPLIED_DEF, floorExposureH: 192 })['exposure']).toBeCloseTo(1, 12);
  });

  it('씬 모델의 판정이 랩의 합격선(여유 ≥ 0)과 같다', () => {
    const pass = { ...APPLIED_DEF, mslHourlyIndex: 0, floorExposureH: 168 };
    const fail = { ...APPLIED_DEF, mslHourlyIndex: 0, floorExposureH: 172 };
    expect(moistureSoakModel(soakParams(pass)).verdict).toBe('pass');
    expect(moistureSoakModel(soakParams(fail)).verdict).toBe('fail');
  });
});

describe('§8 🔴 씬 map 을 실제로 호출해 확인 — shearTest 의 로그 속도축', () => {
  /**
   * 🔴 기대값은 로그축 정의 `log10(v / 0.1) / log10(100 / 0.1)` 에서 나온다(3 decade).
   *    v = 0.8 ⇒ log10(8)/3 = 0.30103 · v = 5 ⇒ log10(50)/3 = 0.5663233 ·
   *    v = 50 ⇒ log10(500)/3 = 0.8996567.
   */
  it.each([
    [0.1, 0],
    [0.8, 0.30103],
    [5, 0.5663233],
    [50, 0.8996567],
    [100, 1],
  ] as const)('v = %f mm/s ⇒ speedLog %f', (v, want) => {
    expect(shearParams({ ...ADV_DEF, shearSpeedMmPerS: v })['speedLog']).toBeCloseTo(want, 6);
  });

  it('🔴 씬의 `stSpeedLog()` 와 랩의 speedLog 가 격자 전량에서 같다 — 로그축이 두 벌이 되지 않는다', () => {
    for (const v of gridOf(advanced, 'shearSpeedMmPerS')) {
      expect(shearParams({ ...ADV_DEF, shearSpeedMmPerS: v })['speedLog'], `v=${v}`)
        .toBeCloseTo(stSpeedLog(v), 12);
    }
  });

  it('로그축이라 Condition A(0.1~0.8)가 축의 30 % 를 차지한다 — 선형이면 0.7 % 로 뭉개진다', () => {
    const a = shearParams({ ...ADV_DEF, shearSpeedMmPerS: 0.8 })['speedLog'] as number;
    expect(a).toBeGreaterThan(0.29);
    expect(a).toBeLessThan(0.31);
  });

  it('요구력·인가력·면적이 같은 축을 쓴다 — 간격이 곧 여유다', () => {
    const inputs = { ...ADV_DEF, dieAreaUnits: 100, appliedDieShearKg: 0.5 };
    const p = shearParams(inputs);
    expect(p['required']).toBeCloseTo(0.5, 12);   // 2.5 kg / 5 kg
    expect(p['applied']).toBeCloseTo(0.1, 12);    // 0.5 kg / 5 kg
    expect(p['dieArea']).toBeCloseTo(1, 12);      // a 100 / 100
    const m = shearTestModel(p);
    expect(m.pass).toBe(false);
    expect(outputsOf(advanced, inputs)['dieShearMarginKg']).toBeCloseTo(-2, 12);
  });
});

describe('§9 A14 — 세 씬 모두 랩 실제 출력에서 유한 · [0, 1]', () => {
  const CASES: ReadonlyArray<readonly [string, LabSpec, LabSceneBinding]> = [
    ['packageThermal', basic, packageThermal],
    ['moistureSoak', applied, moistureSoak],
    ['shearTest', advanced, shearTest],
  ];

  it.each(CASES)('%s — 기본값·정의역 양끝·전 모서리에서 씬 파라미터가 전부 유한하고 [0, 1] 안이다',
    (label, spec, binding) => {
      const corners: Array<Record<string, number>> = [
        defaultsOf(spec),
        Object.fromEntries(spec.params.map((p) => [p.id, p.min])),
        Object.fromEntries(spec.params.map((p) => [p.id, p.max])),
      ];
      // 슬라이더 하나씩 양끝으로 미는 경우도 함께 본다.
      for (const p of spec.params) {
        corners.push({ ...defaultsOf(spec), [p.id]: p.min });
        corners.push({ ...defaultsOf(spec), [p.id]: p.max });
      }
      for (const inputs of corners) {
        const params = binding.map(inputs, outputsOf(spec, inputs));
        for (const [k, v] of Object.entries(params)) {
          expect(Number.isFinite(v), `${label}.${k} = ${v}`).toBe(true);
          expect(v, `${label}.${k}`).toBeGreaterThanOrEqual(0);
          expect(v, `${label}.${k}`).toBeLessThanOrEqual(1);
        }
      }
    });
});
