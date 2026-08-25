// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { ALD_TEMP_WINDOW, aldCycleModel, temperatureWindow } from '@/viz/gl/scenes/aldCycle';
import { ALD_SCENE_TEMP_WINDOW, DEPOSITION_LABS, aldTempToSceneAxis } from '@/models/labs/deposition';
import type { LabSpec } from '@/models/labs/spec';

/**
 * 🔴 씬 결함 ❌-1 회귀 — **ALD 온도축 범주 오류**.
 *
 * 사고: 랩이 씬의 `temperature` 슬롯(= 온도축 위의 정규화 위치)에 「성장률 비 GPC/1.1」을
 * 꽂았다. 단위계가 다른 두 양이 한 슬롯에 섞여, ① 온도 막대 마커가 **반대로** 움직이고
 * ② 성장률이 전 온도에서 0.04 로 붕괴해 계단 그래프가 정상의 3.9 % 로 납작해졌다.
 * 「사이클 수에 선형인 계단」이라는 이 랩의 유일한 학습 요점이 화면에서 사라져 있었다.
 *
 * 이 파일이 막는 것은 두 가지다:
 *   (A) **랩의 온도축 매핑과 씬의 평탄 창이 갈라지는 것.** 상수가 두 층에 나뉘어 있으므로
 *       (계층 규칙상 `src/models` 는 `src/viz` 를 import 할 수 없다 — `check-layering`)
 *       **테스트가 양쪽을 import 해 일치를 단언**하는 것이 유일한 결속 수단이다.
 *   (B) 성장률이 온도축 슬롯으로 되돌아가 계단이 다시 붕괴하는 것.
 *
 * 🔴 부분문자열 검사를 쓰지 않는다. 전부 **수치와 구조**로 본다.
 */

/* ---------------- 검증 설정 (제품 상수가 아니다) ---------------- */

/** S186 측정점·창 경계. 랩 슬라이더가 실제로 밟는 온도들이다. */
const T_BELOW_WINDOW = [80, 100] as const;
const T_IN_WINDOW = [150, 200, 250] as const;

/**
 * 기대 온도축 위치 — 팀장 확정 설계의 검산표. **본 것에 맞춰 쓴 것이 아니라 먼저 박은 값이다.**
 * axis(T) = 0.30 + (T − 150)/(250 − 150) × (0.66 − 0.30), clamp01
 */
const EXPECTED_AXIS: ReadonlyArray<readonly [number, number]> = [
  [80, 0.048],
  [100, 0.12],
  [150, 0.3],
  [200, 0.48],
  [250, 0.66],
];

/** 기대 성장률 비 = GPC(T)/1.1 Å. S186: 80 °C=0.9 · 100 °C=1.0 · 150–250 °C=1.1 */
const EXPECTED_GROWTH: ReadonlyArray<readonly [number, number]> = [
  [80, 0.9 / 1.1],
  [100, 1.0 / 1.1],
  [150, 1],
  [200, 1],
  [250, 1],
];

/** 씬이 이 랩에서 쓰는 고정 사이클 수(임의 선택 — 결과가 사이클 수에 의존하지 않는 것도 함께 본다). */
const CYCLES = 200;

const basicLab = DEPOSITION_LABS.find((l) => l.stage === 'lab-basic') as LabSpec | undefined;

/** 랩 compute → scene.map 을 실제 배선 그대로 통과시킨다(수치를 손으로 재현하지 않는다). */
function sceneParamsFor(tempC: number, cycles = CYCLES): Record<string, number> {
  const spec = basicLab as LabSpec;
  const inputs = { cycles, tempC };
  const out = spec.compute(inputs);
  const nums: Record<string, number> = {};
  for (const [k, q] of Object.entries(out)) nums[k] = q.value;
  return spec.scene!.map(inputs, nums);
}

describe('ALD 랩 ↔ aldCycle 씬 — 온도축 결속', () => {
  it('기초 랩이 aldCycle 씬에 배선돼 있다', () => {
    expect(basicLab).toBeDefined();
    expect(basicLab?.scene?.sceneId).toBe('aldCycle');
  });

  it('🔴 랩의 온도축 창 상수가 씬의 평탄 창과 같다 (계층 때문에 나뉘어 있는 정본을 여기서 묶는다)', () => {
    expect(ALD_SCENE_TEMP_WINDOW[0]).toBe(ALD_TEMP_WINDOW.lo);
    expect(ALD_SCENE_TEMP_WINDOW[1]).toBe(ALD_TEMP_WINDOW.hi);
  });

  it.each(EXPECTED_AXIS)('axis(%i °C) = %f', (tempC, want) => {
    expect(aldTempToSceneAxis(tempC)).toBeCloseTo(want, 6);
  });

  it('🔴 ALD 창(150–250 °C)이 씬 평탄 창 안에서 tempFactor = 1 이다', () => {
    for (const t of T_IN_WINDOW) {
      expect(temperatureWindow(aldTempToSceneAxis(t)), `${t} °C`).toBeCloseTo(1, 6);
    }
  });

  it('🔴 창 아래 측정점(80·100 °C)은 이탈대에 있다 — 마커가 빨간 구간에 선다', () => {
    expect(temperatureWindow(aldTempToSceneAxis(80))).toBeLessThan(0.2);
    expect(temperatureWindow(aldTempToSceneAxis(100))).toBeLessThan(0.35);
  });

  it('온도축 매핑은 단조 증가다 — 온도를 올리면 마커가 오른쪽으로 간다(반대로 가지 않는다)', () => {
    const axes = [...T_BELOW_WINDOW, ...T_IN_WINDOW].map(aldTempToSceneAxis);
    for (let i = 1; i < axes.length; i++) {
      expect(axes[i], `${i}번째`).toBeGreaterThan(axes[i - 1] as number);
    }
  });
});

describe('ALD 랩 scene.map — 온도축과 성장률이 서로 다른 슬롯이다', () => {
  it('map 이 temperature·growth 를 둘 다 넘긴다', () => {
    const p = sceneParamsFor(200);
    expect(Object.keys(p).sort()).toEqual(['cycles', 'growth', 'phase', 'saturation', 'temperature']);
  });

  it.each(EXPECTED_AXIS)('%i °C → temperature = %f (온도축 위치이지 성장률이 아니다)', (tempC, want) => {
    expect(sceneParamsFor(tempC)['temperature']).toBeCloseTo(want, 6);
  });

  it.each(EXPECTED_GROWTH)('%i °C → growth = %f (= GPC/1.1 Å, S186)', (tempC, want) => {
    expect(sceneParamsFor(tempC)['growth']).toBeCloseTo(want, 6);
  });

  it('🔴 두 슬롯이 실제로 다른 값이다 — 같으면 범주 오류가 되돌아온 것이다', () => {
    const p = sceneParamsFor(80);
    expect(p['temperature']).not.toBeCloseTo(p['growth'] as number, 3);
  });
});

describe('aldCycleModel — growth 파라미터', () => {
  it('growth 를 주면 gpc 가 growth 와 같다 (satCoverage × tempFactor 를 쓰지 않는다)', () => {
    for (const g of [0.25, 0.5, 0.8182, 1]) {
      const m = aldCycleModel({ cycles: 0.4, phase: 0.1, saturation: 0.85, temperature: 0.48, growth: g });
      expect(m.gpc, `growth=${g}`).toBeCloseTo(g, 12);
    }
  });

  it('growth 가 없으면 종전대로 gpc = satCoverage × tempFactor 다 (씬 단독 사용 하위호환)', () => {
    const m = aldCycleModel({ cycles: 0.4, phase: 0.1, saturation: 0.85, temperature: 0.48 });
    expect(m.gpc).toBeCloseTo(m.satCoverage * m.tempFactor, 12);
  });

  it('growth 를 넘겨도 tempFactor 는 온도축으로 계산된다 (온도 막대의 근거가 살아 있다)', () => {
    const inWin = aldCycleModel({ temperature: aldTempToSceneAxis(200), growth: 1 });
    const below = aldCycleModel({ temperature: aldTempToSceneAxis(80), growth: 0.9 / 1.1 });
    expect(inWin.tempFactor).toBeCloseTo(1, 6);
    expect(below.tempFactor).toBeLessThan(0.2);
  });

  it('layerHeight 가 gpc 에 비례한다', () => {
    const full = aldCycleModel({ temperature: 0.48, growth: 1 });
    const half = aldCycleModel({ temperature: 0.48, growth: 0.5 });
    expect(half.layerHeight).toBeCloseTo(full.layerHeight / 2, 12);
  });
});

describe('🔴 회귀 — 계단 붕괴가 실제로 풀렸다 (증상이 아니라 수치로 본다)', () => {
  /**
   * 사고 당시 랩이 250 °C 에서 씬에 넘기던 값 그대로다.
   * `temperature: GPC/1.1 = 1.0` → 씬 평탄 창 [0.30, 0.66] 상한 밖 → tempFactor = 0.04.
   */
  const BROKEN = { cycles: 0.4, phase: 0.1, saturation: 0.85, temperature: 1.0 } as const;

  it('사고 재현: 옛 매핑은 250 °C 에서 tempFactor 가 하한 0.04 로 붕괴했다', () => {
    const old = aldCycleModel(BROKEN);
    expect(old.tempFactor).toBeCloseTo(0.04, 12);
    expect(old.gpc).toBeLessThan(0.05);
  });

  it('새 매핑은 250 °C 에서 tempFactor = 1 · gpc = 1 이다', () => {
    const p = sceneParamsFor(250);
    const now = aldCycleModel(p);
    expect(now.tempFactor).toBeCloseTo(1, 6);
    expect(now.gpc).toBeCloseTo(1, 6);
  });

  it('🔴 계단 높이(layerHeight)가 옛 값보다 20배 이상 크다', () => {
    const old = aldCycleModel(BROKEN);
    const now = aldCycleModel(sceneParamsFor(250));
    expect(old.layerHeight).toBeGreaterThan(0);
    expect(now.layerHeight / old.layerHeight).toBeGreaterThan(20);
  });

  it('계단이 사이클 수에 정확히 선형이다 — filmHeight = cyclesShown × layerHeight, 절편 0', () => {
    const m = aldCycleModel({ ...sceneParamsFor(250), phase: 0 });
    expect(m.filmHeight).toBeCloseTo(m.cyclesShown * m.layerHeight, 12);
    // 🔴 절편 0 — 0 사이클이면 막이 없다. 종전 구현은 `1 + floor(·)` 라 여기서 한 층이 나왔다(D-5b N-3).
    expect(aldCycleModel({ ...sceneParamsFor(250), cycles: 0, phase: 0 }).filmHeight).toBe(0);
    // 🔴 사이클 슬라이더를 2배로 올리면 두께가 **정확히** 2배다. 「±1 사이클 오차」를 허용하지 않는다 —
    //    그 허용치가 `1 + floor(·)` 를 정의상 통과시키던 구멍이었다(§S-9-2).
    const lo = aldCycleModel({ ...sceneParamsFor(250), cycles: 0.25, phase: 0 });
    const hi = aldCycleModel({ ...sceneParamsFor(250), cycles: 0.5, phase: 0 });
    expect(hi.filmHeight / lo.filmHeight).toBeCloseTo(2, 12);
  });

  it('🔴 두께가 4단계 애니메이션(phase)에 전혀 좌우되지 않는다 — D-5b 톱니 회귀 방지', () => {
    const base = sceneParamsFor(250);
    const ref = aldCycleModel({ ...base, phase: 0 }).filmHeight;
    for (const phase of [0, 0.1, 0.24, 0.26, 0.49, 0.51, 0.74, 0.76, 0.99]) {
      expect(aldCycleModel({ ...base, phase }).filmHeight, `phase=${phase}`).toBe(ref);
    }
  });

  it('🔴 랩 슬라이더 단위로 재도 단조·비례가 지켜진다 (계측 규칙 M-1: 씬 정규화가 아니라 슬라이더로 잰다)', () => {
    const spec = basicLab as LabSpec;
    const cyclesParam = spec.params.find((p) => p.id === 'cycles');
    if (!cyclesParam) throw new Error('cycles 슬라이더가 없다');
    const Ns: number[] = [];
    for (let n = cyclesParam.min; n <= cyclesParam.max; n += cyclesParam.step) Ns.push(n);
    const h = (n: number): number => aldCycleModel(sceneParamsFor(250, n)).filmHeight;

    // ① 전수 스윕에서 두께가 한 번도 줄지 않는다 (종전 4곳에서 줄었다)
    for (let i = 1; i < Ns.length; i++) {
      expect(h(Ns[i] as number), `${Ns[i - 1]} → ${Ns[i]}`).toBeGreaterThan(h(Ns[i - 1] as number));
    }
    // ② 배가쌍이 전부 정확히 2.000
    for (const n of Ns) {
      if (!Ns.includes(n * 2)) continue;
      expect(h(n * 2) / h(n), `배가쌍 ${n}→${n * 2}`).toBeCloseTo(2, 12);
    }
    // ③ 절편 0 — 두께/사이클 이 전 구간에서 같은 상수다
    const slope = h(Ns[0] as number) / (Ns[0] as number);
    for (const n of Ns) expect(h(n) / n, `N=${n}`).toBeCloseTo(slope, 12);
  });
});
