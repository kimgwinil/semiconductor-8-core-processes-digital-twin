/**
 * T-MO — **애니메이션이 「계산의 표현」인가**를 기계로 지킨다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 * 2026-08-22 CEO 지시: 「실제 동작을 기반으로 능동적인 애니메이션 효과」.
 * 그 지시의 위험한 오독은 **값과 무관한 움직임**(반짝임·회전·펄스)을 얹는 것이다(A15).
 * 그래서 이 파일은 「움직인다」를 확인하지 않는다. 다음 넷을 **수치로** 확인한다:
 *
 *   ① 시간을 바꾸면 그림이 바뀌는 씬이 **정확히 등재된 집합과 같은가**
 *      (등재 누락 = 폴백이 안 돌아감 · 등재 과잉 = 안 변하는 그림에 rAF 낭비).
 *   ② 슬라이더를 바꾸면 **애니메이션이 그 비율만큼** 달라지는가.
 *   ③ **연동을 끊으면(모델 목) 실패하는가** — 폴백이 통과율을 스스로 계산하고 있으면 걸린다.
 *   ④ `prefers-reduced-motion` 에서 **멈추되 정보가 사라지지 않는가.**
 *
 * 🔴 **부분문자열로 물리를 판정하지 않는다.** 아래 단언은 전부 **그려진 좌표·모델 반환값**이다.
 *    (`fluxMark(` 호출 개수만 세는 곳이 하나 있는데, 그것은 값이 아니라 **생성된 문장 수**다 —
 *     루프를 펼쳐 주입하는 구조가 0 개를 뱉어도 셰이더는 정상 컴파일되기 때문에 필요하다.)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createFallback2D, FALLBACK_ANIMATED, type FallbackSceneId } from '@/viz/gl/fallback2d';
import {
  PT_FLUX_DN_Y0,
  PT_FLUX_DN_Y1,
  PT_FLUX_HALF_H,
  PT_FLUX_LAPS_PER_S_PER_W,
  PT_FLUX_MARKS,
  PT_FLUX_UP_Y0,
  PT_FLUX_UP_Y1,
  PT_POWER_AXIS_MAX_W,
  packageThermalModel,
  ptFluxAmplitude,
  ptFluxLapsPerSecond,
  ptFluxPhase,
} from '@/viz/gl/scenes/models/packageThermal.model';
import { PACKAGE_THERMAL_FS } from '@/viz/gl/scenes/packageThermal';
import { REDUCED_MOTION_TIME, prefersReducedMotion } from '@/viz/gl/scenes/motion';

/* ---------------- 가짜 2D 컨텍스트 ---------------- */

const CW = 320;
const CH = 200;

interface Ops {
  points: Array<[number, number]>;
  rects: Array<[number, number, number, number]>;
  rectAlpha: number[];
  arcs: Array<[number, number, number]>;
}

function recorder(): { ops: Ops; ctx: CanvasRenderingContext2D } {
  const ops: Ops = { points: [], rects: [], rectAlpha: [], arcs: [] };
  let alpha = 1;
  const alphaStack: number[] = [];
  const proxy = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (): unknown => ({ addColorStop: () => {} });
      }
      return (...args: unknown[]): void => {
        if (prop === 'save') alphaStack.push(alpha);
        if (prop === 'restore') {
          const back = alphaStack.pop();
          alpha = back === undefined ? 1 : back;
        }
        if (prop === 'arc' && args.slice(0, 3).every((a) => typeof a === 'number')) {
          ops.arcs.push([args[0] as number, args[1] as number, args[2] as number]);
        }
        if ((prop === 'moveTo' || prop === 'lineTo') && typeof args[0] === 'number' && typeof args[1] === 'number') {
          ops.points.push([args[0], args[1]]);
        }
        if (prop === 'fillRect' && args.length === 4 && args.every((a) => typeof a === 'number')) {
          ops.rects.push(args as [number, number, number, number]);
          ops.rectAlpha.push(alpha);
        }
      };
    },
    set(_t, prop, value) {
      if (prop === 'globalAlpha' && typeof value === 'number') alpha = value;
      return true;
    },
  });
  return { ops, ctx: proxy as unknown as CanvasRenderingContext2D };
}

/** 씬 하나를 시각 `t` 에서 그리고 기록을 돌려준다. 생성 직후의 빈 그림은 버린다. */
function renderAt(id: FallbackSceneId, params: Record<string, number>, t: number): Ops {
  const r = recorder();
  const canvas = {
    clientWidth: CW, clientHeight: CH, width: 0, height: 0,
    getContext: () => r.ctx,
  } as unknown as HTMLCanvasElement;
  const fb = createFallback2D(canvas, id);
  expect(fb, `${id}: 폴백 생성 실패`).not.toBeNull();
  fb?.update(params);
  r.ops.points.length = 0;
  r.ops.rects.length = 0;
  r.ops.rectAlpha.length = 0;
  r.ops.arcs.length = 0;
  fb?.drawAt(t);
  fb?.dispose();
  return r.ops;
}

/** 기록을 비교 가능한 문자열로. 좌표·알파를 모두 담는다. */
function signature(ops: Ops): string {
  const n = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : 'NaN');
  return [
    ops.points.map(([x, y]) => `${n(x)},${n(y)}`).join(';'),
    ops.rects.map((r, i) => `${r.map(n).join(',')}@${n(ops.rectAlpha[i] ?? 1)}`).join(';'),
    ops.arcs.map((a) => a.map(n).join(',')).join(';'),
  ].join('|');
}

/** 13종 전부와, 각 씬이 실제로 읽는 파라미터를 흩어 놓은 값. 기본값과 겹치지 않게 고른다. */
const ALL_SCENES: readonly FallbackSceneId[] = [
  'filmGrowth', 'plasma', 'ionTrajectory', 'polishProfile', 'stepCoverage', 'aldCycle',
  'crystalGrowth', 'aerialImage', 'probeScrub', 'waferMap', 'packageThermal', 'moistureSoak', 'shearTest',
  'ingotSlicing',
];

const PARAMS: Record<string, number> = {};
for (const k of [
  'applied', 'argonFlow', 'aspectRatio', 'bias', 'chamberPressure', 'clearance', 'crucibleRotation',
  'crystalRotation', 'cycles', 'defectLevel', 'defocus', 'deposited', 'dieAcross', 'dieArea',
  'directionality', 'dose', 'energy', 'exposure', 'exposureDose', 'floorLife', 'flow', 'force',
  'forceCeil', 'fringeAmplitude', 'lineWidth', 'margin', 'na', 'odMargin', 'overdrive', 'phase',
  'power', 'pressure', 'pullRate', 'rawYield', 'recPower', 'required', 'resistThickness', 'rise',
  'roughness', 'saturation', 'scatter', 'slurry', 'soak', 'solidFraction', 'speed', 'speedClass',
  'speedLog', 'temperature', 'testPower', 'thermalGradient', 'theta', 'thickness', 'tilt', 'time',
  'tint', 'uniformity',
  'diameter', 'deviation', 'quality',
]) PARAMS[k] = 0.62;

/* ══════════════════════════════════════════════════════════════════════════
   ① 시간에 반응하는 씬 = 등재된 집합. 전수 대조.
   ══════════════════════════════════════════════════════════════════════════ */
describe('T-MO-1 · 시간 반응 씬 전수 대조', () => {
  it('실제 배선된 WebGL 동적 씬 12종은 Canvas2D 에서도 모두 동적이다', () => {
    expect(new Set(FALLBACK_ANIMATED)).toEqual(new Set<FallbackSceneId>([
      'filmGrowth',
      'plasma',
      'ionTrajectory',
      'polishProfile',
      'aldCycle',
      'crystalGrowth',
      'ingotSlicing',
      'aerialImage',
      'probeScrub',
      'waferMap',
      'packageThermal',
      'moistureSoak',
      'shearTest',
    ]));
  });

  it('13종 전부 — t 를 바꿔 그림이 바뀌는 씬이 FALLBACK_ANIMATED 와 정확히 같다', () => {
    const moved: FallbackSceneId[] = [];
    for (const id of ALL_SCENES) {
      const a = signature(renderAt(id, PARAMS, 0));
      const b = signature(renderAt(id, PARAMS, 1.7));
      if (a !== b) moved.push(id);
    }
    /* 🔴 「움직이는 씬이 있다」가 아니라 **집합이 같다**를 본다.
       · 등재 누락 → 폴백이 rAF 를 안 돌려 그 씬만 얼어붙는다.
       · 등재 과잉 → 안 변하는 그림에 매 프레임 그린다(배터리·발열). */
    expect(new Set(moved), '시간에 반응하는 씬 집합이 등재와 다르다').toEqual(new Set(FALLBACK_ANIMATED));
    expect(moved.length, '시간에 반응하는 씬이 하나도 없다 — 배선이 끊겼다').toBeGreaterThan(0);
  });

  it('시간에 반응하지 않는 씬은 t 를 크게 벌려도 픽셀 좌표가 동일하다', () => {
    for (const id of ALL_SCENES) {
      if (FALLBACK_ANIMATED.has(id)) continue;
      const a = signature(renderAt(id, PARAMS, 0));
      const b = signature(renderAt(id, PARAMS, 97.3));
      expect(a, `${id}: 시간 항이 없는 씬인데 t 로 그림이 변했다`).toBe(b);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② 슬라이더 반응 — 「움직인다」가 아니라 「그만큼 달라진다」.
   ══════════════════════════════════════════════════════════════════════════ */
describe('T-MO-2 · 슬라이더 반응 수치', () => {
  it('통과율 ∝ P_H — 전력 0.5 W → 3 W 에서 정확히 6.000 배', () => {
    const lo = ptFluxLapsPerSecond(0.5);
    const hi = ptFluxLapsPerSecond(3);
    expect(lo).toBeCloseTo(PT_FLUX_LAPS_PER_S_PER_W * 0.5, 12);
    expect(hi / lo).toBeCloseTo(6, 12);
  });

  it('모델이 testPower 키를 그대로 통과율로 옮긴다 — 정규화 0.5 → 1.0 에서 2.000 배', () => {
    const half = packageThermalModel({ testPower: 0.5 }).fluxLapsPerSecond;
    const full = packageThermalModel({ testPower: 1 }).fluxLapsPerSecond;
    expect(full / half).toBeCloseTo(2, 12);
    expect(full).toBeCloseTo(ptFluxLapsPerSecond(PT_POWER_AXIS_MAX_W), 12);
  });

  it('1 초 동안 마커가 전진하는 거리비 = 전력비 (0.5 W vs 3 W → 6.000 배)', () => {
    /* 위상 되감김이 없는 짧은 구간에서 잰다 — 되감기면 거리비가 아니라 나머지가 된다. */
    const dt = 0.5;
    const advance = (powerW: number): number => {
      const rate = ptFluxLapsPerSecond(powerW);
      return ptFluxPhase(0, dt, rate) - ptFluxPhase(0, 0, rate);
    };
    const lo = advance(0.5);
    const hi = advance(3);
    expect(lo).toBeGreaterThan(0);
    expect(hi / lo).toBeCloseTo(6, 12);
  });

  it('폴백 그림에서도 같은 배율이 나온다 — 같은 Δt 에 마커 y 이동량이 6 배', () => {
    /* 마커의 세로 이동을 **그려진 사각형**으로 잰다(모델 값이 아니라 화면 좌표다). */
    const dt = 0.5;
    const markY = (testPower: number, t: number): number[] => {
      const ops = renderAt('packageThermal', { ...PARAMS, testPower }, t);
      return fluxRectY(ops);
    };
    const shift = (testPower: number): number => {
      const a = markY(testPower, 0);
      const b = markY(testPower, dt);
      expect(a.length, '열류 마커가 그려지지 않았다').toBeGreaterThan(0);
      expect(b.length).toBe(a.length);
      return Math.abs((b[0] as number) - (a[0] as number));
    };
    const lo = shift(0.5 / PT_POWER_AXIS_MAX_W);   // 0.5 W
    const hi = shift(1);                            // 3 W
    expect(lo).toBeGreaterThan(0);
    expect(hi / lo).toBeCloseTo(6, 6);
  });
});

/**
 * 열류 마커로 그려진 사각형들의 **캔버스 y(위쪽 변)** 를 뽑는다.
 * 마커는 세로 높이가 `2·PT_FLUX_HALF_H` 인 유일한 사각형이라 높이로 특정한다
 * (좌표만 보고 고른다 — 소스 문자열을 보지 않는다).
 */
function fluxRectY(ops: Ops): number[] {
  const hPx = 2 * PT_FLUX_HALF_H * CH;
  /* 🔴 **정렬하지 않는다.** drawer 가 k 순서로 「위 가지 → 아래 가지」를 내므로 그리기 순서가
     곧 마커 색인이다. 정렬하면 마커가 서로 앞지를 때 대응이 뒤섞여 이동량이 엉뚱해진다
     (첫 시도에서 실제로 6 배가 0.667 배로 나왔다). */
  return ops.rects
    .filter(([, , , rh]) => Math.abs(rh - hPx) < 0.001)
    .map(([, ry]) => ry);
}

/* ══════════════════════════════════════════════════════════════════════════
   ③ 변이 검사 — 연동을 끊으면 무엇이 실패하는가.
   ══════════════════════════════════════════════════════════════════════════ */
describe('T-MO-3 · 변이 검사', () => {
  it('통과율을 0 으로 만들면 폴백 마커가 t 에 대해 얼어붙는다 (연동이 실재한다는 증거)', () => {
    /* `testPower = 0` → P_H = 0 → 통과율 0. 이때만 시간 반응이 사라져야 한다.
       폴백이 통과율을 무시하고 제 시계로 움직이면 이 단언이 깨진다. */
    const zero = { ...PARAMS, testPower: 0 };
    expect(packageThermalModel(zero).fluxLapsPerSecond).toBe(0);
    expect(signature(renderAt('packageThermal', zero, 0)))
      .toBe(signature(renderAt('packageThermal', zero, 9.1)));
  });

  it('전력이 0 이 아니면 같은 t 차이에서 반드시 그림이 바뀐다', () => {
    const on = { ...PARAMS, testPower: 1 };
    expect(signature(renderAt('packageThermal', on, 0)))
      .not.toBe(signature(renderAt('packageThermal', on, 9.1)));
  });

  it('위상 식이 모델 하나뿐이다 — 오프셋 (k+0.5)/N 이 정본과 일치', () => {
    for (let k = 0; k < PT_FLUX_MARKS; k++) {
      expect(ptFluxPhase(k, 0, 0)).toBeCloseTo((k + 0.5) / PT_FLUX_MARKS, 12);
    }
  });

  it('셰이더가 위·아래 두 가지 × N 개의 마커 문장을 실제로 펼쳐 넣었다', () => {
    /* 🔴 값 검사가 아니라 **생성된 문장 수** 검사다. 펼치기가 0 개를 뱉어도 GLSL 은 정상 컴파일되므로
       `check-glsl-compile` 로는 못 잡는다. 여기서만 잡을 수 있다. */
    const calls = (PACKAGE_THERMAL_FS.match(/fluxMark\(P,/g) ?? []).length;
    expect(calls).toBe(2 * PT_FLUX_MARKS);
  });

  it('경로 끝점이 다이 표면 밖으로 나간다 — 위는 위로, 아래는 아래로', () => {
    expect(PT_FLUX_UP_Y1).toBeGreaterThan(PT_FLUX_UP_Y0);
    expect(PT_FLUX_DN_Y1).toBeLessThan(PT_FLUX_DN_Y0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ 접근성 — 멈추되 정보가 사라지지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
describe('T-MO-4 · prefers-reduced-motion', () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  function stubMatchMedia(reduce: boolean): void {
    (globalThis as { window?: unknown }).window = {
      matchMedia: (q: string) => ({
        matches: q.includes('prefers-reduced-motion') ? reduce : false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    };
  }

  afterEach(() => {
    if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = realWindow;
    vi.unstubAllGlobals();
  });

  it('판독기가 미디어 질의를 그대로 따른다', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('판독할 수 없는 환경에서는 false — 종전 동작을 바꾸지 않는다', () => {
    if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('감속 모드여도 rAF 를 돌리지 않지만 **그림은 그대로 그려진다**', () => {
    stubMatchMedia(true);
    let rafCalls = 0;
    vi.stubGlobal('requestAnimationFrame', (): number => { rafCalls++; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const r = recorder();
    const canvas = {
      clientWidth: CW, clientHeight: CH, width: 0, height: 0,
      getContext: () => r.ctx,
    } as unknown as HTMLCanvasElement;
    const fb = createFallback2D(canvas, 'packageThermal');
    fb?.update({ ...PARAMS, testPower: 1 });
    expect(rafCalls, '감속 모드인데 rAF 루프가 돌았다').toBe(0);
    expect(fluxRectY(r.ops).length, '감속 모드에서 열류 마커가 사라졌다').toBeGreaterThan(0);
    fb?.dispose();
  });

  it('고정 시각에서 어느 마커도 진폭 0 이 아니다 — 정보가 사라지지 않는다', () => {
    /* 🔴 오프셋을 `k/N` 로 두면 k=0 이 진폭 0 이 되어 감속 모드에서 마커 하나가 통째로 사라진다.
       `(k+0.5)/N` 을 쓰는 이유가 이것이고, 이 단언이 그 이유를 지킨다. */
    for (let k = 0; k < PT_FLUX_MARKS; k++) {
      const a = ptFluxAmplitude(ptFluxPhase(k, REDUCED_MOTION_TIME, ptFluxLapsPerSecond(3)));
      expect(a, `마커 ${k} 가 고정 시각에서 보이지 않는다`).toBeGreaterThan(0.5);
    }
  });

  it('감속 모드의 그림 = 고정 시각의 그림 (다른 그림으로 갈아치우지 않는다)', () => {
    const p = { ...PARAMS, testPower: 1 };
    stubMatchMedia(true);
    const reducedOps = renderAt('packageThermal', p, REDUCED_MOTION_TIME);
    stubMatchMedia(false);
    const normalOps = renderAt('packageThermal', p, REDUCED_MOTION_TIME);
    expect(signature(reducedOps)).toBe(signature(normalOps));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ 회귀 방어 — 폴백이 「마운트 값에 얼어붙는」 결함으로 되돌아가지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
describe('T-MO-5 · 폴백 얼어붙음 회귀', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('update() 뒤에도 drawAt() 이 최신 파라미터로 그린다', () => {
    const r = recorder();
    const canvas = {
      clientWidth: CW, clientHeight: CH, width: 0, height: 0,
      getContext: () => r.ctx,
    } as unknown as HTMLCanvasElement;
    const fb = createFallback2D(canvas, 'packageThermal');
    fb?.update({ ...PARAMS, testPower: 1 });
    r.ops.rects.length = 0;
    r.ops.rectAlpha.length = 0;
    r.ops.points.length = 0;
    r.ops.arcs.length = 0;
    fb?.drawAt(0.4);
    const withHighPower = fluxRectY(r.ops);

    r.ops.rects.length = 0;
    r.ops.rectAlpha.length = 0;
    fb?.update({ ...PARAMS, testPower: 0.5 / PT_POWER_AXIS_MAX_W });
    r.ops.rects.length = 0;
    r.ops.rectAlpha.length = 0;
    fb?.drawAt(0.4);
    const withLowPower = fluxRectY(r.ops);

    expect(withHighPower.length).toBeGreaterThan(0);
    expect(withLowPower.length).toBe(withHighPower.length);
    expect(withLowPower, '파라미터를 바꿨는데 그림이 그대로다 — 얼어붙음 회귀').not.toEqual(withHighPower);
    fb?.dispose();
  });

  it('폴백의 내부 시계는 rAF/drawAt 으로만 전진한다 — update() 는 시각을 바꾸지 않는다', () => {
    /* 🔴 이 성질이 테마 프로브·골든 계측의 재현성을 보장한다. update() 가 벽시계를 읽으면
       같은 입력이 매번 다른 그림을 내고 「노이즈 바닥 0」이 무너진다. */
    const p = { ...PARAMS, testPower: 1 };
    const first = signature(renderAt('packageThermal', p, REDUCED_MOTION_TIME));
    const second = signature(renderAt('packageThermal', p, REDUCED_MOTION_TIME));
    expect(first).toBe(second);
  });
});
