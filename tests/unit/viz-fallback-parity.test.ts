/**
 * T-FB — **Canvas2D 폴백이 GL 씬과 같은 정본을 쓴다**는 구조적 결속.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 * `src/viz/gl/fallback2d.ts` 는 WebGL2 미지원 기기가 실제로 타는 제품 경로다
 * (`LabRunner.tsx` → `viz.createFallback2D`, 설계서 §15 L4). 그런데 이 파일은 씬 모듈을
 * import 하지 않고(셰이더 문자열이 청크로 끌려오므로 — A9) **계산식을 손으로 다시 적고 있었다.**
 * 결과는 정본이 둘이 되는 것이었고, 2026-08-21 실측에서 다음만큼 갈려 있었다:
 *
 *   · ALD 사이클당 성장  100 °C : 폴백 0.0394 vs 정본 0.9091  (**23.06 배**)
 *   · CMP 전면 하강      전 조건 : 폴백이 정확히 **절반**(옛 깊이 상수 0.10, 클램프 없음)
 *   · 플라즈마 시스 전력 0→1    : 폴백 1.929 배 **증가**, 정본 0.600 배 **감소**(부호 반대)
 *   · 플라즈마 시스 바이어스     : 폴백에 항이 **없음**(비 1.000), 정본 2.129 배
 *
 * 이 결함을 잡는 게이트는 **하나도 없었다.** `qa/sweep` 126 장은 전부 WebGL2 가 되는
 * Chrome 에서 찍혔으므로 폴백 경로는 한 번도 화면 검증을 받은 적이 없다.
 *
 * ── 이 파일이 막는 것 ─────────────────────────────────────────────────────
 *  (A) 폴백이 **자체 계산으로 되돌아가는 것.** 모델 모듈을 목(mock)으로 바꿔치기한 뒤,
 *      폴백이 그린 그림이 **목이 돌려준 값을 실제로 따라가는지** 본다. 폴백이 식을 다시
 *      인라인하면 목의 반환값을 무시하게 되므로 이 단언이 깨진다.
 *      🔴 「함수를 불렀다」로 끝내지 않는다 — 부르고 결과를 버려도 통과해 버리기 때문이다.
 *  (B) 이번에 바로잡은 세 값이 폴백에서 다시 낡는 것(growth · 깊이 2배 · 시스 부호/바이어스).
 *
 * 🔴 **부분문자열 검사를 쓰지 않는다.** GLSL 문자열도 소스도 `includes()` 로 보지 않는다.
 *    전부 **그려진 좌표의 수치**로 본다. (이 프로젝트에서 부분문자열 검사 사고가 5번 났다.)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

/** 목이 반환값을 갈아끼울 수 있도록 하는 공유 상태(vi.mock 은 호이스팅된다). */
const H = vi.hoisted(() => ({
  calls: {
    sheath: [] as Array<{ pressure: number; power: number; bias: number }>,
    glow: [] as number[],
    removal: [] as number[],
    surface: [] as number[],
    ald: [] as Array<Record<string, number>>,
    film: [] as Array<Record<string, number>>,
    ion: [] as Array<Record<string, number>>,
    step: [] as Array<Record<string, number>>,
    /* 🔴 2026-08-22 신설 — `crystalGrowth`·`aerialImage`. 두 씬은 2026-08-21 에 폴백 drawer 가
       들어왔는데 **이 파일의 `FbId` 에는 오르지 않아** 결속 테스트가 0건이었다(DSN O-1 · 2회차 재요청).
       `check-fallback-purity` 는 `SCENE_DRAWERS` 에 등재돼 있어 EXIT=0 이었다 —
       「정적 게이트는 초록인데 결속은 비어 있다」의 실례다. */
    crystal: [] as Array<Record<string, number>>,
    aerial: [] as Array<Record<string, number>>,
    /* 🔴 2026-08-22 신설 — eds·packaging 신규 5종. `crystalGrowth`·`aerialImage` 때와 같은 사고
       (씬은 배선됐는데 `FbId` 에 없어 결속 검사 0건)를 되풀이하지 않으려고 당일 등재한다. */
    probe: [] as Array<Record<string, number>>,
    wafer: [] as Array<Record<string, number>>,
    pkg: [] as Array<Record<string, number>>,
    soak: [] as Array<Record<string, number>>,
    shear: [] as Array<Record<string, number>>,
  },
  /** null 이면 실제 구현으로 위임한다. */
  override: {
    sheathUv: null as number | null,
    surfaceUv: null as number | null,
    aldFilmHeight: null as number | null,
    filmTopMean: null as number | null,
    ionRangePeak: null as number | null,
    ionConcentration: null as number | null,
    stepWallCoverage: null as number | null,
    meltSurfaceV: null as number | null,
    scanLength: null as number | null,
    /* 신규 5종 — 각 씬에서 **화면을 1차로 읽는 좌표** 하나씩을 갈아끼운다. */
    psMarkHalf: null as number | null,
    wmGaugeTop: null as number | null,
    ptColTop: null as number | null,
    msFloorEnd: null as number | null,
    stBarTopY: null as number | null,
  },
  reset(): void {
    H.calls.sheath = [];
    H.calls.glow = [];
    H.calls.removal = [];
    H.calls.surface = [];
    H.calls.ald = [];
    H.calls.film = [];
    H.calls.ion = [];
    H.calls.step = [];
    H.override.sheathUv = null;
    H.override.surfaceUv = null;
    H.override.aldFilmHeight = null;
    H.override.filmTopMean = null;
    H.override.ionRangePeak = null;
    H.override.ionConcentration = null;
    H.override.stepWallCoverage = null;
    H.override.meltSurfaceV = null;
    H.override.scanLength = null;
    H.calls.crystal = [];
    H.calls.aerial = [];
    H.calls.probe = [];
    H.calls.wafer = [];
    H.calls.pkg = [];
    H.calls.soak = [];
    H.calls.shear = [];
    H.override.psMarkHalf = null;
    H.override.wmGaugeTop = null;
    H.override.ptColTop = null;
    H.override.msFloorEnd = null;
    H.override.stBarTopY = null;
  },
}));

vi.mock('@/viz/gl/scenes/models/plasma.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/plasma.model')>();
  return {
    ...real,
    sheathThickness: (p: { pressure: number; power: number; bias: number }): number => {
      H.calls.sheath.push({ ...p });
      return H.override.sheathUv ?? real.sheathThickness(p);
    },
    plasmaGlowGain: (v: number): number => {
      H.calls.glow.push(v);
      return real.plasmaGlowGain(v);
    },
  };
});

vi.mock('@/viz/gl/scenes/models/polishProfile.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/polishProfile.model')>();
  return {
    ...real,
    polishRemoval: (params: Record<string, number>): number => {
      const r = real.polishRemoval(params);
      H.calls.removal.push(r);
      return r;
    },
    polishSurface: (x: number, removal: number): number => {
      H.calls.surface.push(x);
      return H.override.surfaceUv ?? real.polishSurface(x, removal);
    },
  };
});

vi.mock('@/viz/gl/scenes/models/aldCycle.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/aldCycle.model')>();
  return {
    ...real,
    aldCycleModel: (params: Record<string, number>) => {
      H.calls.ald.push({ ...params });
      const m = real.aldCycleModel(params);
      return H.override.aldFilmHeight === null ? m : { ...m, filmHeight: H.override.aldFilmHeight };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/filmGrowth.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/filmGrowth.model')>();
  return {
    ...real,
    filmGrowthModel: (params: Record<string, number>) => {
      H.calls.film.push({ ...params });
      const m = real.filmGrowthModel(params);
      return H.override.filmTopMean === null ? m : { ...m, filmTopMean: H.override.filmTopMean };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/ionTrajectory.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/ionTrajectory.model')>();
  return {
    ...real,
    ionTrajectoryModel: (params: Record<string, number>) => {
      H.calls.ion.push({ ...params });
      const m = real.ionTrajectoryModel(params);
      return H.override.ionRangePeak === null ? m : { ...m, rangePeak: H.override.ionRangePeak };
    },
    ionConcentration: (depth: number, m: Parameters<typeof real.ionConcentration>[1]): number =>
      H.override.ionConcentration ?? real.ionConcentration(depth, m),
  };
});

/* 🔴 2026-08-22 신설 — 신규 씬 2종의 정본 결속. `FbId` 누락(DSN O-1)을 닫는다. */
vi.mock('@/viz/gl/scenes/models/crystalGrowth.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/crystalGrowth.model')>();
  return {
    ...real,
    crystalGrowthModel: (params: Record<string, number>) => {
      H.calls.crystal.push({ ...params });
      const m = real.crystalGrowthModel(params);
      return H.override.meltSurfaceV === null ? m : { ...m, meltSurfaceV: H.override.meltSurfaceV };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/aerialImage.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/aerialImage.model')>();
  return {
    ...real,
    aerialImageModel: (params: Record<string, number>) => {
      H.calls.aerial.push({ ...params });
      const m = real.aerialImageModel(params);
      return H.override.scanLength === null ? m : { ...m, scanLength: H.override.scanLength };
    },
  };
});

/* 🔴 2026-08-22 신설 — eds·packaging 5종의 정본 결속.
   각 목은 모델의 **반환 필드 하나**를 제품 어디에도 없는 값으로 갈아끼운다. 폴백이 식을 다시
   인라인하면 이 값을 무시하게 되므로 좌표 단언이 깨진다. 「불렀다」가 아니라 **「따라갔다」**를 본다. */
vi.mock('@/viz/gl/scenes/models/probeScrub.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/probeScrub.model')>();
  return {
    ...real,
    probeScrubModel: (params: Record<string, number>) => {
      H.calls.probe.push({ ...params });
      const m = real.probeScrubModel(params);
      return H.override.psMarkHalf === null
        ? m
        : { ...m, markHalf: H.override.psMarkHalf, markSide: 2 * H.override.psMarkHalf };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/waferMap.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/waferMap.model')>();
  return {
    ...real,
    waferMapModel: (params: Record<string, number>) => {
      H.calls.wafer.push({ ...params });
      const m = real.waferMapModel(params);
      return H.override.wmGaugeTop === null ? m : { ...m, gaugeTop: H.override.wmGaugeTop };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/packageThermal.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/packageThermal.model')>();
  return {
    ...real,
    packageThermalModel: (params: Record<string, number>) => {
      H.calls.pkg.push({ ...params });
      const m = real.packageThermalModel(params);
      return H.override.ptColTop === null ? m : { ...m, colTop: H.override.ptColTop };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/moistureSoak.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/moistureSoak.model')>();
  return {
    ...real,
    moistureSoakModel: (params: Record<string, number>) => {
      H.calls.soak.push({ ...params });
      const m = real.moistureSoakModel(params);
      return H.override.msFloorEnd === null ? m : { ...m, xFloorEnd: H.override.msFloorEnd };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/shearTest.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/shearTest.model')>();
  return {
    ...real,
    shearTestModel: (params: Record<string, number>) => {
      H.calls.shear.push({ ...params });
      const m = real.shearTestModel(params);
      return H.override.stBarTopY === null ? m : { ...m, barTopY: H.override.stBarTopY };
    },
  };
});

vi.mock('@/viz/gl/scenes/models/stepCoverage.model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/viz/gl/scenes/models/stepCoverage.model')>();
  return {
    ...real,
    stepCoverageModel: (params: Record<string, number>) => {
      H.calls.step.push({ ...params });
      const m = real.stepCoverageModel(params);
      return H.override.stepWallCoverage === null ? m : { ...m, wallCoverage: H.override.stepWallCoverage };
    },
  };
});

import { createFallback2D } from '@/viz/gl/fallback2d';
import * as plasmaModel from '@/viz/gl/scenes/models/plasma.model';
import * as polishModel from '@/viz/gl/scenes/models/polishProfile.model';
import * as aldModel from '@/viz/gl/scenes/models/aldCycle.model';
import * as filmModel from '@/viz/gl/scenes/models/filmGrowth.model';
import * as ionModel from '@/viz/gl/scenes/models/ionTrajectory.model';
import * as aerialModel from '@/viz/gl/scenes/models/aerialImage.model';
import { AXIS_X as aerialModel_AXIS } from '@/viz/gl/scenes/models/layout.model';
/* 🔴 신규 5종의 배치 상수·변환식. **수치를 테스트에 옮겨 적지 않는다** — 정본에서 읽는다.
   (목 팩토리가 `...real` 를 펼치므로 상수는 목을 통해도 실제 값 그대로다.) */
import {
  PS_PAD_CX, PS_PAD_CY, PS_OPEN_HALF,
  PS_OD_AXIS_X0, PS_OD_AXIS_X1, PS_OD_AXIS_Y, PS_BAND_HALF,
  PS_FORCE_AXIS_X0, PS_FORCE_AXIS_X1, PS_FORCE_AXIS_Y,
} from '@/viz/gl/scenes/models/probeScrub.model';
import {
  WM_WAFER_CX, WM_WAFER_CY, WM_WAFER_R_Y, WM_DIE_DIM_ALPHA,
  WM_GAUGE_X0, WM_GAUGE_X1, WM_GAUGE_Y0, WM_GAUGE_SPAN,
  WM_BADGE_CX, WM_BADGE_R, wmAcross,
} from '@/viz/gl/scenes/models/waferMap.model';
import {
  PT_TCOL_X0, PT_TCOL_X1, PT_TAXIS_Y0, PT_RISE_SPAN, PT_MARKER_R,
  PT_POWER_AXIS_MAX_W, PT_POWER_BANDS, PT_STEPS, PT_BOUNDARIES,
  PT_THETA_MIN, PT_THETA_MAX, ptYOfPower,
} from '@/viz/gl/scenes/models/packageThermal.model';
import {
  MS_TIME_X0, MS_TIME_AXIS_MAX_H, MS_MARGIN_ZERO,
  MS_ROW_FLOOR_Y0, MS_ROW_FLOOR_Y1, MS_ROW_MARGIN_Y,
  MS_FLOOR_LIFE_STEPS_H, MS_FLOOR_GHOST_X, msXOfNorm,
} from '@/viz/gl/scenes/models/moistureSoak.model';
import {
  ST_FORCE_BAR_X0, ST_FORCE_BAR_X1, ST_FORCE_BAR_Y0, ST_FORCE_BAR_H,
  ST_DIE_PANEL_CX, ST_DIE_PANEL_CY, ST_DIE_SIDE_MAX,
  ST_SPEED_AXIS_X0, ST_SPEED_AXIS_X1, ST_SPEED_AXIS_Y, ST_SPEED_AXIS_SPAN, ST_BAND_H,
  ST_AREA_KNEE_UNITS, ST_PLATEAU_KG, ST_SLOPE_KG_PER_UNIT,
  ST_SHEAR_AXIS_MAX_KG, ST_DIE_AREA_UNITS_MAX, ST_SHEAR_CLASS_MAX,
  ST_SPEED_MIN, ST_LOW_SPEED_MAX, ST_HIGH_SPEED_MIN, ST_SPEED_MAX, ST_BELOW_LOW_X0,
  stSpeedLog, stXOfSpeed,
} from '@/viz/gl/scenes/models/shearTest.model';

/* ---------------- 가짜 2D 컨텍스트 (좌표를 구조로 기록한다) ---------------- */

const CW = 320;
const CH = 200;

interface Ops {
  /** moveTo·lineTo 로 찍힌 모든 점 */
  points: Array<[number, number]>;
  /** beginPath 로 끊어 모은 경로별 점 목록 — 「어느 선인지」를 좌표만으로 특정하려면 필요하다 */
  paths: Array<Array<[number, number]>>;
  /** fillRect(x, y, w, h) */
  rects: Array<[number, number, number, number]>;
  /**
   * 🔴 2026-08-22 신설 — `rects[i]` 를 그릴 때의 `globalAlpha`(save/restore 스택 반영).
   * `waferMap` 은 **정상 칸과 불량 칸의 기하가 완전히 같고 농도만 다르다**(불량 = `WM_DIE_DIM_ALPHA`).
   * 좌표만 봐서는 불량 비율을 셀 수 없어 **그려진 값**을 하나 더 받아 적는다.
   * (소스 문자열을 보는 것이 아니라 캔버스에 실제로 들어간 수치다 — 부분문자열 검사가 아니다.)
   */
  rectAlpha: number[];
  /** 🔴 2026-08-22 신설 — arc(cx, cy, r). 판정 도형·마커가 `arc` 로만 그려져 좌표가 안 남았다. */
  arcs: Array<[number, number, number]>;
  /** addColorStop 의 색 문자열 */
  stops: string[];
  count: number;
}

function recorder(): { ops: Ops; ctx: CanvasRenderingContext2D } {
  const ops: Ops = { points: [], paths: [], rects: [], rectAlpha: [], arcs: [], stops: [], count: 0 };
  let cur: Array<[number, number]> | null = null;
  /** 현재 `globalAlpha` 와 save/restore 스택. 폴백이 `save → globalAlpha → fill → restore` 를 쓴다. */
  let alpha = 1;
  const alphaStack: number[] = [];
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined;
        /* 🔴 2026-08-22 — `createRadialGradient` 를 추가했다. `drawCrystalGrowth` 의 메니스커스
           헤일로가 이것을 쓰는데 스텁이 없어 `undefined.addColorStop` 으로 죽었다.
           **이것 자체가 `FbId` 누락의 흔적이다** — 이 파일이 그 씬을 한 번도 그린 적이 없었다. */
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return (): unknown => ({ addColorStop: (_o: number, col: string) => ops.stops.push(col) });
        }
        return (...args: unknown[]): void => {
          ops.count++;
          if (prop === 'save') alphaStack.push(alpha);
          if (prop === 'restore') {
            const back = alphaStack.pop();
            alpha = back === undefined ? 1 : back;
          }
          if (prop === 'arc' && typeof args[0] === 'number' && typeof args[1] === 'number' && typeof args[2] === 'number') {
            ops.arcs.push([args[0], args[1], args[2]]);
          }
          if (prop === 'beginPath') {
            cur = [];
            ops.paths.push(cur);
          }
          if ((prop === 'moveTo' || prop === 'lineTo') && typeof args[0] === 'number' && typeof args[1] === 'number') {
            ops.points.push([args[0], args[1]]);
            if (cur) cur.push([args[0], args[1]]);
          }
          if (prop === 'fillRect' && args.length === 4 && args.every((a) => typeof a === 'number')) {
            ops.rects.push(args as [number, number, number, number]);
            ops.rectAlpha.push(alpha);
          }
        };
      },
      set(_t, prop, value) {
        ops.count++;
        if (prop === 'globalAlpha' && typeof value === 'number') alpha = value;
        return true;
      },
    },
  );
  return { ops, ctx: proxy as unknown as CanvasRenderingContext2D };
}

/* 🔴 2026-08-22 — `crystalGrowth`·`aerialImage` 를 추가했다(DSN O-1 · 2회차 재요청).
   이 유니온에 없는 씬은 `render()` 를 통과할 수 없어 이 파일에서 **물리적으로 렌더되지 않는다** —
   즉 6종만 적혀 있던 동안 신규 2종은 결속 검사를 한 번도 받지 않았다. */
type FbId = 'plasma' | 'polishProfile' | 'aldCycle' | 'filmGrowth' | 'ionTrajectory' | 'stepCoverage'
  | 'crystalGrowth' | 'aerialImage'
  /* 🔴 2026-08-22 추가 — eds·packaging 신규 5종. 이 줄이 없으면 아래 어떤 케이스를 써도
     `render()` 를 통과하지 못해 **물리적으로 렌더되지 않는다**(= 결속 검사 0건). 같은 사고 3회차다. */
  | 'probeScrub' | 'waferMap' | 'packageThermal' | 'moistureSoak' | 'shearTest';

function render(id: FbId, params: Record<string, number>): Ops {
  const r = recorder();
  const canvas = {
    clientWidth: CW, clientHeight: CH, width: 0, height: 0,
    getContext: () => r.ctx,
  } as unknown as HTMLCanvasElement;
  const fb = createFallback2D(canvas, id);
  expect(fb, `${id}: 폴백 생성 실패`).not.toBeNull();
  // 생성 직후에도 한 번 그린다(빈 파라미터). 그 그림은 버리고 **파라미터가 실린 그림만** 본다.
  r.ops.points.length = 0;
  r.ops.paths.length = 0;
  r.ops.rects.length = 0;
  r.ops.rectAlpha.length = 0;
  r.ops.arcs.length = 0;
  r.ops.stops.length = 0;
  r.ops.count = 0;
  fb?.update(params);
  fb?.dispose();
  expect(r.ops.count, `${id}: 그림이 그려지지 않았다`).toBeGreaterThan(20);
  return r.ops;
}

/** UV 세로좌표 → 캔버스 세로좌표. 폴백의 `toY()` 와 같은 변환. */
const toY = (uv: number): number => (1 - uv) * CH;

/** 캔버스 세로좌표 y 를 찍은 점이 있는가(허용오차 0.05 px). */
function hasY(ops: Ops, y: number): boolean {
  return ops.points.some(([, py]) => Math.abs(py - y) < 0.05);
}

beforeEach(() => H.reset());

/* ══════════════════════════════════════════════════════════════════════════
 * (A) 폴백은 계산하지 않는다 — 모델이 돌려준 값을 **그대로 쓴다**
 * ════════════════════════════════════════════════════════════════════════ */

describe('폴백 ↔ 씬 정본 결속 — 폴백은 모델의 반환값을 소비한다', () => {
  it('plasma: 시스 경계선이 sheathThickness() 의 반환값 위에 정확히 놓인다', () => {
    const p = { power: 0.6, pressure: 0.3, bias: 0.7, flow: 0.5 };

    // 정본을 목으로 바꿔 **제품 어디에도 없는 값**을 돌려준다.
    H.override.sheathUv = 0.137;
    const ops = render('plasma', p);

    // 폴백이 자체 계산으로 되돌아가면 이 좌표가 나오지 않는다.
    const low = toY(plasmaModel.PLASMA_GEOMETRY.WAFER_Y) - 0.137 * CH;   // 하부 시스 경계
    const up = toY(plasmaModel.PLASMA_GEOMETRY.SHOWER_Y) + 0.137 * CH;   // 상부 시스 경계
    expect(hasY(ops, low), `하부 시스 경계 y=${low} 이 없다`).toBe(true);
    expect(hasY(ops, up), `상부 시스 경계 y=${up} 이 없다`).toBe(true);

    // 넘긴 인자도 그대로여야 한다(파라미터를 가공해 넘기면 두 경로가 갈린다)
    expect(H.calls.sheath).toContainEqual({ pressure: 0.3, power: 0.6, bias: 0.7 });
    expect(H.calls.glow).toContain(0.6);
  });

  it('plasma: 목의 반환값이 바뀌면 그림도 그만큼 움직인다(값을 부르고 버리지 않는다)', () => {
    const p = { power: 0.5, pressure: 0.4, bias: 0.35 };
    H.override.sheathUv = 0.05;
    const a = render('plasma', p);
    H.reset();
    H.override.sheathUv = 0.09;
    const b = render('plasma', p);

    const lowFor = (s: number): number => toY(plasmaModel.PLASMA_GEOMETRY.WAFER_Y) - s * CH;
    expect(hasY(a, lowFor(0.05))).toBe(true);
    expect(hasY(a, lowFor(0.09))).toBe(false);
    expect(hasY(b, lowFor(0.09))).toBe(true);
  });

  it('polishProfile: 표면 폴리라인이 polishSurface() 의 반환값 위에 놓인다', () => {
    H.override.surfaceUv = 0.371; // 제품 어디에도 없는 평탄 높이
    const ops = render('polishProfile', { pressure: 0.6, speed: 0.5, time: 1, slurry: 0.5 });

    const y = toY(0.371);
    const surfacePts = ops.points.filter(([, py]) => Math.abs(py - y) < 0.05);
    // 표면선 폴리라인은 4 px 간격 81 점 + 패드선(오프셋) — 표면선만 세도 충분히 많아야 한다
    expect(surfacePts.length, '표면선이 모델 반환값을 따르지 않는다').toBeGreaterThan(40);
    // 가로 위치도 정규화해 넘긴다(0~1). 픽셀을 그대로 넘기면 구역 함수가 어긋난다.
    expect(Math.min(...H.calls.surface)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...H.calls.surface)).toBeLessThanOrEqual(1);
  });

  it('aldCycle: 막 두께 사각형이 aldCycleModel().filmHeight 를 그대로 쓴다', () => {
    H.override.aldFilmHeight = 0.2431; // 제품 어디에도 없는 값
    const params = { cycles: 0.4, phase: 0.1, saturation: 0.85, temperature: 0.48 };
    const ops = render('aldCycle', params);

    const expectH = 0.2431 * CH;
    const filmRect = ops.rects.find(([, , rw, rh]) => Math.abs(rw - CW * 0.46) < 0.05 && Math.abs(rh - expectH) < 0.05);
    expect(filmRect, `막 두께 ${expectH}px 사각형이 없다`).toBeDefined();
    // 파라미터를 손대지 않고 통째로 넘긴다
    // (첫 호출은 생성 직후의 빈 파라미터 redraw 다 — update() 가 넘긴 마지막 호출을 본다)
    expect(H.calls.ald.at(-1)).toEqual(params);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * (B) 이번에 바로잡은 값이 폴백에서 다시 낡지 않는다 — 목 없이 제품 그대로 본다
 * ════════════════════════════════════════════════════════════════════════ */

describe('폴백 회귀 — 2026-08-21 에 갈려 있던 세 값', () => {
  it('aldCycle: 선택 파라미터 growth 가 폴백 그림을 움직인다(종전 폴백은 이 키를 몰랐다)', () => {
    // 온도축은 창 밖(80 °C ≈ 0.048)이라 온도창 계수는 하한 0.04 로 붕괴한다.
    // 그런데 상위 층이 실측 성장률 0.8182 를 `growth` 로 준다 — 종전 폴백은 이것을 무시하고
    // 0.0394 로 그렸다(정본의 1/21). 두 그림의 막 두께가 다르면 그 결함이 재발한 것이 아니다.
    const base = { cycles: 0.4, phase: 0, saturation: 0.85, temperature: 0.048 };
    const withGrowth = { ...base, growth: 0.8182 };

    const expectFilm = (p: Record<string, number>): number => aldModel.aldCycleModel(p).filmHeight * CH;
    const filmOf = (ops: Ops, want: number): boolean =>
      ops.rects.some(([, , rw, rh]) => Math.abs(rw - CW * 0.46) < 0.05 && Math.abs(rh - want) < 0.05);

    const a = render('aldCycle', base);
    H.reset();
    const b = render('aldCycle', withGrowth);

    expect(filmOf(a, expectFilm(base))).toBe(true);
    expect(filmOf(b, expectFilm(withGrowth))).toBe(true);
    // 20 배 이상 벌어진다 — 「키를 무시한다」면 두 값이 같아진다
    expect(expectFilm(withGrowth) / expectFilm(base)).toBeGreaterThan(20);
  });

  it('polishProfile: 평탄부 하강이 DEPTH_FLAT(0.20) 을 쓴다 — 종전 폴백의 0.10 이 아니다', () => {
    const params = { pressure: 0.3752, speed: 0.2785, time: 1, slurry: 0.5 };
    const r = polishModel.polishRemoval(params);
    const ops = render('polishProfile', params);

    const yNow = toY(polishModel.BASE_TOP - r * polishModel.DEPTH_FLAT);
    const yOld = toY(polishModel.BASE_TOP - r * (polishModel.DEPTH_FLAT / 2)); // 종전 사본
    expect(hasY(ops, yNow), '평탄부가 정본 깊이를 쓰지 않는다').toBe(true);
    expect(hasY(ops, yOld), '종전 사본의 절반 깊이가 아직 그려진다').toBe(false);
  });

  it('polishProfile: 표시 한계 DEPTH_MAX 에서 멈춘다(트렌치 바닥을 뚫지 않는다)', () => {
    // 최대 조건: removal 이 1 이면 디싱까지 더해 0.35 라 클램프가 없으면 바닥을 뚫는다
    const ops = render('polishProfile', { pressure: 1, speed: 1, time: 1, slurry: 0.5 });
    const floorY = toY(polishModel.BASE_TOP - polishModel.DEPTH_MAX);
    for (const [, py] of ops.points) {
      // 패드선은 표면 위(작은 y)로 올라가므로 아래쪽 한계만 본다
      expect(py, '표면이 표시 한계보다 아래로 내려갔다').toBeLessThanOrEqual(floorY + 0.05);
    }
  });

  it('plasma: 전력↑ → 시스가 얇아지고, 바이어스↑ → 두꺼워진다(폴백은 부호가 반대였고 bias 항이 없었다)', () => {
    /**
     * 시스 경계선은 챔버 좌우 폭(0.06w ~ 0.94w)을 가로지르는 **2점 수평선 두 개**뿐이다.
     * 이온 화살표는 세로선·3점 화살촉이라 이 조건에 걸리지 않는다. 좌표만으로 특정한다.
     */
    const sheathY = (ops: Ops): number => {
      const lines = ops.paths.filter(
        (pts) => pts.length === 2
          && Math.abs(pts[0]![0] - CW * 0.06) < 0.01
          && Math.abs(pts[1]![0] - CW * 0.94) < 0.01
          && Math.abs(pts[0]![1] - pts[1]![1]) < 1e-9,
      );
      expect(lines.length, '시스 경계선 2개를 찾지 못했다').toBe(2);
      return Math.max(...lines.map((pts) => pts[0]![1]));   // 아래쪽(하부 시스) 경계
    };
    const thickness = (p: Record<string, number>): number =>
      toY(plasmaModel.PLASMA_GEOMETRY.WAFER_Y) - sheathY(render('plasma', p));

    const lowPower = thickness({ power: 0, pressure: 0.4, bias: 0.35 });
    const hiPower = thickness({ power: 1, pressure: 0.4, bias: 0.35 });
    const lowBias = thickness({ power: 0.5, pressure: 0.4, bias: 0 });
    const hiBias = thickness({ power: 0.5, pressure: 0.4, bias: 1 });
    const lowPress = thickness({ power: 0.5, pressure: 0, bias: 0.35 });
    const hiPress = thickness({ power: 0.5, pressure: 1, bias: 0.35 });

    expect(hiPower / lowPower, '전력↑ 인데 시스가 얇아지지 않는다').toBeCloseTo(0.6, 2);
    expect(hiBias / lowBias, '바이어스가 시스를 움직이지 않는다').toBeCloseTo(2.129, 2);
    expect(hiPress / lowPress, '압력 방향이 다르다').toBeCloseTo(0.277, 2);
    // 정본 함수와 픽셀 단위까지 같은가
    expect(hiBias).toBeCloseTo(plasmaModel.sheathThickness({ power: 0.5, pressure: 0.4, bias: 1 }) * CH, 4);
  });

  it('plasma: 전력 하한에서도 챔버가 꺼지지 않는다(발광 하한 GLOW_FLOOR)', () => {
    const ops = render('plasma', { power: 0, pressure: 0.4, bias: 0.35, flow: 0.5 });
    // 벌크 발광 그라디언트의 알파가 0 이면 화면이 완전히 꺼진 것이다
    const alphas = ops.stops
      .map((s) => /rgba\([^)]*,\s*([0-9.]+)\)/.exec(s)?.[1])
      .filter((v): v is string => typeof v === 'string')
      .map(Number);
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.min(...alphas), '전력 0 에서 발광이 꺼졌다').toBeGreaterThan(0);
    expect(H.calls.glow).toContain(0);
    expect(plasmaModel.plasmaGlowGain(0)).toBeCloseTo(0.25, 6);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * (C) 번들 회귀 방지 — 모델 모듈이 씬 모듈을 역참조하면 셰이더가 폴백 청크로 되돌아온다
 * ════════════════════════════════════════════════════════════════════════ */

describe('번들 — 모델 모듈은 셰이더 쪽으로 되돌아가지 않는다', () => {
  /**
   * 🔴 이것은 **소스 부분문자열 검사가 아니다.** GLSL 내용이나 식을 글자로 보지 않는다.
   *    `check-layering.mjs` 와 같은 방식으로 **import 지정자(모듈 그래프)만** 본다.
   *    `models/*.model.ts` 가 `scenes/<씬>.ts` 를 import 하는 순간 셰이더 문자열이
   *    `fallback2d` 청크로 끌려와 코드분할(A9)이 깨지므로, 그 방향을 기계로 막는다.
   */
  it('scenes/models/** 가 셰이더를 가진 씬 모듈을 import 하지 않는다', () => {
    // 소스는 Vite 의 ?raw 글롭으로 읽는다(이 저장소에는 @types/node 가 없다).
    const mods = import.meta.glob('/src/viz/gl/scenes/models/*.ts', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>;
    const names = Object.keys(mods);
    expect(names.length, '모델 모듈이 하나도 없다').toBeGreaterThan(0);

    const specRe = /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g;
    for (const name of names) {
      const code = mods[name] ?? '';
      specRe.lastIndex = 0;
      const offenders: string[] = [];
      let m: RegExpExecArray | null = specRe.exec(code);
      while (m) {
        const spec = m[1] ?? '';
        // 씬 폴더의 형제 모듈(`../<이름>`)을 가리키면 셰이더가 딸려온다. `../common` 만 예외다.
        if (/^\.\.\/[A-Za-z][\w-]*$/.test(spec) && spec !== '../common') offenders.push(spec);
        m = specRe.exec(code);
      }
      expect(offenders, `${name}: 씬 모듈을 역참조한다`).toEqual([]);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * (D) 나머지 3종 — filmGrowth · ionTrajectory · stepCoverage
 * ════════════════════════════════════════════════════════════════════════ */

describe('폴백 ↔ 씬 정본 결속 — 나머지 3종', () => {
  it('filmGrowth: 막 상면과 두께 마커가 filmGrowthModel().filmTopMean 위에 놓인다', () => {
    H.override.filmTopMean = 0.4173;  // 제품 어디에도 없는 값
    // uniformity=1 → 좌우 편차 0 이라 막 상면이 한 줄로 평평해야 한다
    const ops = render('filmGrowth', { thickness: 0.6, roughness: 0.3, tint: 0.4, uniformity: 1 });
    const y = toY(0.4173);
    expect(hasY(ops, y), '두께 마커가 모델 값을 따르지 않는다').toBe(true);
    // 막 몸통(2 px 세로 기둥)의 윗변도 같은 값이어야 한다 — 마커만 맞고 몸통이 어긋나면 실패다
    const body = ops.rects.filter(([, ry, rw]) => Math.abs(rw - 2) < 1e-9 && Math.abs(ry - y) < 0.05);
    expect(body.length, '막 몸통이 모델 값을 따르지 않는다').toBeGreaterThan(100);
    expect(H.calls.film.at(-1)).toEqual({ thickness: 0.6, roughness: 0.3, tint: 0.4, uniformity: 1 });
  });

  it('filmGrowth: uniformity 가 그림을 움직인다(종전 폴백에는 이 항이 아예 없었다)', () => {
    const base = { thickness: 0.6, roughness: 0.0, tint: 0, uniformity: 1 };
    const uneven = { ...base, uniformity: 0.2 };
    // 균일도 1 이면 편차 0 → 막 상면이 한 줄로 평평하다. 낮추면 좌우로 벌어진다.
    const ys = (o: Ops): number[] => [...new Set(o.points.map(([, y]) => Math.round(y * 100) / 100))];
    const a = render('filmGrowth', base);
    H.reset();
    const b = render('filmGrowth', uneven);
    expect(filmModel.filmGrowthModel(base).lateralDevAmp).toBe(0);
    expect(filmModel.filmGrowthModel(uneven).lateralDevAmp).toBeGreaterThan(0);
    expect(ys(b).length, 'uniformity 를 낮췄는데 표면 높이가 하나뿐이다').toBeGreaterThan(ys(a).length);
  });

  it('ionTrajectory: R_p 표시선이 ionTrajectoryModel().rangePeak 위에 놓인다', () => {
    H.override.ionRangePeak = 0.2137;
    const ops = render('ionTrajectory', { energy: 0.7, dose: 0.5, tilt: 0.5, scatter: 0.2 });
    const surfaceY = toY(ionModel.SURFACE_Y);
    expect(hasY(ops, surfaceY + 0.2137 * CH), 'R_p 선이 모델 값을 따르지 않는다').toBe(true);
    expect(H.calls.ion.at(-1)).toEqual({ energy: 0.7, dose: 0.5, tilt: 0.5, scatter: 0.2 });
  });

  it('ionTrajectory: 프로파일 곡선이 ionConcentration() 의 반환값을 가로 위치로 쓴다', () => {
    H.override.ionConcentration = 0.5;   // 곡선을 곧은 세로선으로 만든다
    const ops = render('ionTrajectory', { energy: 0.5, dose: 0.6, tilt: 0.5, scatter: 0.3 });
    const wantX = ionModel.PANEL_R0 * CW + 0.5 * ionModel.PANEL_W * CW;
    const onLine = ops.points.filter(([px]) => Math.abs(px - wantX) < 0.05);
    expect(onLine.length, '프로파일 곡선이 모델 반환값을 따르지 않는다').toBeGreaterThan(80);
  });

  it('ionTrajectory: 깊이 축이 DEPTH_SPAN(0.46) 이다 — 종전 폴백의 0.58 이 아니다', () => {
    const params = { energy: 1, dose: 0.6, tilt: 0.5, scatter: 0.3 };
    const ops = render('ionTrajectory', params);
    const surfaceY = toY(ionModel.SURFACE_Y);
    const rp = ionModel.ionTrajectoryModel(params).rangePeak;
    expect(hasY(ops, surfaceY + rp * CH)).toBe(true);
    expect(hasY(ops, surfaceY + (0.58 * 0.75) * CH), '종전 사본의 26% 깊은 R_p 가 아직 그려진다').toBe(false);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * 🔴 2026-08-22 신설 — **신규 씬 2종**(`crystalGrowth`·`aerialImage`).
   *
   * 왜 지금 들어오나: 폴백 drawer 는 2026-08-21 에 들어왔는데 이 파일의 `FbId` 에는
   * 오르지 않아 **결속 검사가 0건**이었다(DSN O-1 · 2회차 재요청). `check-fallback-purity`
   * 의 `SCENE_DRAWERS` 에는 등재돼 있어 정적 게이트는 EXIT=0 이었다 —
   * 「초록불인데 비어 있다」의 실례다.
   *
   * ⚠️ **이 두 케이스가 막는 것과 못 막는 것을 혼동하지 마라.**
   *   막는 것   : **폴백이** 모델 반환값을 버리고 자체 계산으로 되돌아가는 것.
   *   못 막는 것: **GL 셰이더**가 모델값과 다르게 그리는 것. 이 파일은 GLSL 을 한 줄도
   *               실행하지 않는다(jsdom · WebGL 없음). 2026-08-22 의 GL 화살표 과길이
   *               (+5 px)는 폴백이 아니라 셰이더 결함이었으므로 **이 테스트가 있었어도
   *               잡히지 않았다.** 그 층은 아직 자동 게이트가 없다.
   * ════════════════════════════════════════════════════════════════════ */
  it('crystalGrowth: 융액 자유표면이 crystalGrowthModel().meltSurfaceV 위에 놓인다', () => {
    H.override.meltSurfaceV = 0.4831;   // 제품 어디에도 없는 값
    const params = { pullRate: 0.4, rotation: 0.5, meltTemp: 0.6, argonFlow: 0.3 };
    const ops = render('crystalGrowth', params);
    const y = toY(0.4831);
    const melt = ops.rects.filter(([, ry]) => Math.abs(ry - y) < 0.05);
    expect(melt.length, '융액 상면 사각형이 모델 값을 따르지 않는다').toBeGreaterThan(0);
    expect(H.calls.crystal.at(-1)).toEqual(params);
  });

  it('aerialImage: 스캔 화살표 막대가 aerialImageModel().scanLength 를 그대로 쓴다', () => {
    H.override.scanLength = 0.1723;     // 제품 어디에도 없는 값
    const params = { na: 0.5, defocus: 0.5, exposureDose: 0.35, resistThickness: 0.4, lineWidth: 0.5, fringeAmplitude: 0.6 };
    const ops = render('aerialImage', params);
    const wantX = (aerialModel_AXIS - 0.1723) * CW;
    const wantW = 0.1723 * CW;
    const bar = ops.rects.find(([rx, , rw]) => Math.abs(rx - wantX) < 0.05 && Math.abs(rw - wantW) < 0.05);
    expect(bar, `스캔 막대(x=${wantX}px · w=${wantW}px)가 없다 — 폴백이 모델의 scanLength 를 안 쓴다`).toBeDefined();
    expect(H.calls.aerial.at(-1)).toEqual(params);
  });

  it('aerialImage: 화살표 길이 × 노광량 E 가 일정하다(P-3g 의 모델측 전제)', () => {
    /* 🔴 이 단언은 **모델**이 「길이 × E = SCAN_LEN_COEF」를 지키는지만 본다.
       화면에 그려진 길이는 여기서 볼 수 없다(폴백 좌표는 아래 막대 케이스가, GL 은 브라우저 계측이 본다). */
    const base = { na: 0.5, defocus: 0.5, resistThickness: 0.4, lineWidth: 0.5, fringeAmplitude: 0.6 };
    const prod = [0, 0.25, 0.5, 0.75, 1].map((dose) => {
      const m = aerialModel.aerialImageModel({ ...base, exposureDose: dose });
      return m.scanLength * (10 + 70 * dose);   // E 앵커: SD §3-1 NORM_E [10, 80] mJ/cm²
    });
    for (const v of prod) expect(v).toBeCloseTo(prod[0] as number, 10);
  });

  it('stepCoverage: 게이지 막대 길이가 stepCoverageModel().wallCoverage 를 그대로 쓴다', () => {
    H.override.stepWallCoverage = 0.6317;
    const ops = render('stepCoverage', { aspectRatio: 0.5, directionality: 0.5, deposited: 0.45, pressure: 0.4 });
    const wantW = CW * 0.13 * 0.6317;
    const bar = ops.rects.find(([, ry, rw]) => Math.abs(ry - CH * 0.46) < 0.05 && Math.abs(rw - wantW) < 0.05);
    expect(bar, `측벽 게이지 막대 폭 ${wantW}px 이 없다`).toBeDefined();
    expect(H.calls.step.at(-1)).toEqual({ aspectRatio: 0.5, directionality: 0.5, deposited: 0.45, pressure: 0.4 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 🔴 2026-08-22 신설 — **eds · packaging 신규 5종**
 *   `probeScrub` · `waferMap` · `packageThermal` · `moistureSoak` · `shearTest`
 *
 * 왜 지금 들어오나: 이 다섯은 오늘 씬·모델·폴백 drawer 까지 배선이 끝났는데, 위 `FbId` 에 올리지
 * 않으면 `render()` 를 통과하지 못해 **이 파일에서 물리적으로 렌더되지 않는다.** 2026-08-21 의
 * `crystalGrowth`·`aerialImage` 가 정확히 그래서 결속 검사 0건이었다 — 같은 사고 3회차를 막는다.
 *
 * 구성은 위와 같다:
 *   (A) 결속 — 모델을 목으로 바꿔 **제품 어디에도 없는 값**을 돌려주게 하고, 폴백이 그린 좌표가
 *       그 값을 따라가는지 본다. 목 값을 바꾸면 그림도 그만큼 움직이는지까지 확인한다.
 *   (B) 화면 반응 — 목 없이 제품 그대로, 파라미터를 정의역 양끝으로 밀어 DSN 수용기준과 대조한다.
 *
 * ⚠️ 위 파일 머리 주석의 한계가 여기에도 그대로 적용된다 — 이 파일은 **GLSL 을 한 줄도 실행하지
 *    않는다.** 셰이더가 모델과 다르게 그리는 것은 여기서 잡히지 않는다.
 * ════════════════════════════════════════════════════════════════════════ */

/** UV 가로좌표 → 캔버스 가로좌표. */
const toX = (uv: number): number => uv * CW;
/** 좌표 비교 허용오차 [px]. `hasY()` 와 같은 0.05 px 다. */
const EPS_PX = 0.05;
const near = (a: number, b: number, eps: number = EPS_PX): boolean => Math.abs(a - b) <= eps;
/** 부동소수 잔차를 접어 집합 비교에 쓴다. */
const r9 = (v: number): number => Math.round(v * 1e9) / 1e9;

interface Seg { x0: number; y0: number; x1: number; y1: number }

/** `beginPath` 로 끊긴 경로 중 **2점짜리 직선**만. 폴리라인·닫힌 사각형은 걸리지 않는다. */
function segsOf(ops: Ops): Seg[] {
  const out: Seg[] = [];
  for (const pts of ops.paths) {
    if (pts.length !== 2) continue;
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) continue;
    out.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] });
  }
  return out;
}

/** 세로좌표 `y` 위의 수평 2점 선분. */
function hSegsAt(ops: Ops, y: number, eps: number = EPS_PX): Seg[] {
  return segsOf(ops).filter((s) => Math.abs(s.y0 - s.y1) < 1e-9 && Math.abs(s.y0 - y) <= eps);
}

/** `yA`~`yB` 를 정확히 잇는 세로 2점 선분(빗금은 대각선이라 걸리지 않는다). */
function vSegsSpanning(ops: Ops, yA: number, yB: number, eps: number = EPS_PX): Seg[] {
  const lo = Math.min(yA, yB);
  const hi = Math.max(yA, yB);
  return segsOf(ops).filter((s) => Math.abs(s.x0 - s.x1) < 1e-9
    && Math.abs(Math.min(s.y0, s.y1) - lo) <= eps
    && Math.abs(Math.max(s.y0, s.y1) - hi) <= eps);
}

interface Box { cx: number; cy: number; hx: number; hy: number }

/** 5점 닫힌 축정렬 사각형(테두리)만 중심·반변으로 되돌린다. */
function boxesOf(ops: Ops): Box[] {
  const out: Box[] = [];
  for (const pts of ops.paths) {
    if (pts.length !== 5) continue;
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const corners = pts.every(([x, y]) =>
      (Math.abs(x - x0) < 1e-9 || Math.abs(x - x1) < 1e-9)
      && (Math.abs(y - y0) < 1e-9 || Math.abs(y - y1) < 1e-9));
    if (!corners || x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2 });
  }
  return out;
}

/* ────────────────────────────── probeScrub ────────────────────────────── */

describe('폴백 ↔ 씬 정본 결속 — probeScrub', () => {
  const PROBE = { clearance: 0.6, odMargin: 0.7, force: 0.3, forceCeil: 0.64, overdrive: 0.85 };

  /** 패드 상면도에서 **마크 사각형**(개구부 규격선이 아닌 쪽)의 한 변(UV). */
  function markSideUv(ops: Ops): number {
    const centred = boxesOf(ops).filter((b) => near(b.cx, toX(PS_PAD_CX)) && near(b.cy, toY(PS_PAD_CY)));
    const marks = centred.filter((b) => !near(b.hx, PS_OPEN_HALF * CW));
    expect(marks.length, '마크 사각형을 좌표만으로 특정하지 못했다').toBe(1);
    return (2 * (marks[0] as Box).hx) / CW;
  }

  it('마크 사각형이 probeScrubModel().markHalf 를 그대로 쓴다', () => {
    H.override.psMarkHalf = 0.0913;   // 제품 어디에도 없는 값
    const ops = render('probeScrub', PROBE);

    const box = boxesOf(ops).filter((b) => near(b.cx, toX(PS_PAD_CX)) && near(b.cy, toY(PS_PAD_CY))
      && near(b.hx, 0.0913 * CW) && near(b.hy, 0.0913 * CH));
    expect(box.length, '마크 사각형이 모델의 markHalf 를 따르지 않는다').toBe(1);

    // 개구부(규격선)는 상수 `PS_OPEN_HALF` 라 목과 무관하게 제자리에 있어야 한다
    const spec = boxesOf(ops).filter((b) => near(b.hx, PS_OPEN_HALF * CW) && near(b.hy, PS_OPEN_HALF * CH));
    expect(spec.length, '규격 개구부까지 목을 따라갔다 — 상수여야 한다').toBe(1);

    // 파라미터를 가공하지 않고 통째로 넘긴다
    expect(H.calls.probe.at(-1)).toEqual(PROBE);
  });

  it('목의 markHalf 를 바꾸면 마크도 그만큼 움직인다(부르고 버리지 않는다)', () => {
    H.override.psMarkHalf = 0.0913;
    const a = render('probeScrub', PROBE);
    H.reset();
    H.override.psMarkHalf = 0.1471;
    const b = render('probeScrub', PROBE);
    const has = (o: Ops, hh: number): boolean =>
      boxesOf(o).some((x) => near(x.hx, hh * CW) && near(x.hy, hh * CH));
    expect(has(a, 0.0913)).toBe(true);
    expect(has(a, 0.1471)).toBe(false);
    expect(has(b, 0.1471)).toBe(true);
    expect(has(b, 0.0913)).toBe(false);
  });

  it('clearance 1 → 0 (= +25 → −15 µm) 에서 마크 한 변이 0.040 → 0.360 UV (9.0 배)', () => {
    const hi = markSideUv(render('probeScrub', { ...PROBE, clearance: 1 }));
    H.reset();
    const lo = markSideUv(render('probeScrub', { ...PROBE, clearance: 0 }));
    expect(hi).toBeCloseTo(0.040, 9);
    expect(lo).toBeCloseTo(0.360, 9);
    expect(lo / hi).toBeCloseTo(9.0, 9);
  });

  it('force 0 → 1 에서 힘 막대 길이가 0 → 0.360 UV', () => {
    /* 힘 축의 이 y·이 시작점을 쓰는 요소는 둘뿐이다 — **기준선(항상 축 끝까지)** 과 **힘 막대**.
       force = 0 이면 길이 0 막대를 그리지 않으므로 선분이 하나만 남는다. */
    const fY = toY(PS_FORCE_AXIS_Y);
    const barX0 = toX(PS_FORCE_AXIS_X0);
    const ends = (force: number): number[] => hSegsAt(render('probeScrub', { ...PROBE, force }), fY)
      .filter((s) => near(Math.min(s.x0, s.x1), barX0))
      .map((s) => (Math.max(s.x0, s.x1) - barX0) / CW)
      .sort((a, b) => a - b);

    const zero = ends(0);
    H.reset();
    const half = ends(0.5);
    H.reset();
    const full = ends(1);

    expect(zero.length, 'force = 0 인데 힘 막대가 그려졌다(0 g 막대는 없다)').toBe(1);
    expect(zero[0] as number).toBeCloseTo(PS_FORCE_AXIS_X1 - PS_FORCE_AXIS_X0, 9);  // 기준선뿐
    expect(half.length, 'force = 0.5 인데 막대가 없다').toBe(2);
    expect(half[0] as number).toBeCloseTo(0.180, 9);
    expect(full.length, 'force = 1 인데 막대가 없다').toBe(2);
    for (const e of full) expect(e).toBeCloseTo(0.360, 9);
  });

  it('overdrive 0 → 1 에서 OD 마커 x 가 0.0600 → 0.4200 UV', () => {
    const odY = toY(PS_OD_AXIS_Y);
    const band = PS_BAND_HALF * CH;
    const markerUv = (overdrive: number): number => {
      const v = vSegsSpanning(render('probeScrub', { ...PROBE, overdrive }), odY - band, odY + band);
      expect(v.length, `overdrive=${overdrive}: OD 마커 세로선을 특정하지 못했다`).toBe(1);
      return (v[0] as Seg).x0 / CW;
    };
    const lo = markerUv(0);
    H.reset();
    const mid = markerUv(0.5);
    H.reset();
    const hi = markerUv(1);
    /* 🔴 자릿수 6 인 이유(제품 실측) — `PS_OD_UV_PER_UM` 이 0.36/130 을 **끊어 적은 리터럴**
       0.00276923 이다. 그래서 축 오른쪽 끝이 0.42 가 아니라 0.41999990 이고, 중간값도
       0.23999995 로 온다(오차 1e−7 UV ≈ 3e−5 px — 화면에서는 보이지 않는다).
       명세의 0.0600 / 0.2400 / 0.4200 과는 소수 6자리까지 일치한다. */
    expect(lo).toBeCloseTo(0.0600, 6);
    expect(mid).toBeCloseTo(0.2400, 6);
    expect(hi).toBeCloseTo(0.4200, 6);
    expect(lo).toBeCloseTo(PS_OD_AXIS_X0, 12);      // 왼쪽 끝은 배치 상수 그대로다
    expect(hi).toBeCloseTo(PS_OD_AXIS_X1, 6);
  });
});

/* ────────────────────────────── waferMap ────────────────────────────── */

describe('폴백 ↔ 씬 정본 결속 — waferMap', () => {
  const WAFER = { rawYield: 0.7411, defectLevel: 0.31, dieAcross: 1 };

  /** 격자 칸 사각형만 골라 (정규화 반경, 불량 여부) 로 되돌린다. */
  function waferCells(ops: Ops): Array<{ r: number; defect: boolean }> {
    const n = wmAcross(1);
    const rPx = WM_WAFER_R_Y * CH;
    const cell = (2 * rPx) / n;
    const cx = toX(WM_WAFER_CX);
    const cy = toY(WM_WAFER_CY);
    const out: Array<{ r: number; defect: boolean }> = [];
    for (let i = 0; i < ops.rects.length; i++) {
      const rect = ops.rects[i];
      if (!rect) continue;
      const [rx, ry, rw, rh] = rect;
      if (!near(rw, cell, 1e-9) || !near(rh, cell, 1e-9)) continue;
      out.push({
        r: Math.hypot(rx + rw / 2 - cx, ry + rh / 2 - cy) / rPx,
        defect: near(ops.rectAlpha[i] ?? 1, WM_DIE_DIM_ALPHA, 1e-9),
      });
    }
    return out;
  }

  /** DL 게이지 기둥 사각형(가로 구간이 고정이라 좌표만으로 특정된다). */
  function gaugeRect(ops: Ops): [number, number, number, number] {
    const gx0 = toX(WM_GAUGE_X0);
    const gw = toX(WM_GAUGE_X1) - gx0;
    const found = ops.rects.filter(([rx, , rw]) => near(rx, gx0) && near(rw, gw));
    expect(found.length, 'DL 게이지 기둥을 특정하지 못했다').toBe(1);
    return found[0] as [number, number, number, number];
  }

  it('게이지 기둥과 판정 배지가 waferMapModel().gaugeTop 위에 놓인다', () => {
    H.override.wmGaugeTop = 0.6137;   // 제품 어디에도 없는 값
    const ops = render('waferMap', WAFER);
    const topY = toY(0.6137);

    expect(gaugeRect(ops)[1]).toBeCloseTo(topY, 9);
    // 배지는 **기둥 꼭대기에 올라탄다** — 두 요소가 같은 값을 함께 써야 한다
    const badge = ops.arcs.filter(([ax, ay, ar]) =>
      near(ax, toX(WM_BADGE_CX)) && near(ay, topY) && near(ar, WM_BADGE_R * CH));
    expect(badge.length, '판정 배지가 기둥 꼭대기를 따르지 않는다').toBe(1);
    expect(H.calls.wafer.at(-1)).toEqual(WAFER);
  });

  it('목의 gaugeTop 을 바꾸면 기둥도 그만큼 움직인다', () => {
    H.override.wmGaugeTop = 0.6137;
    const a = gaugeRect(render('waferMap', WAFER))[1];
    H.reset();
    H.override.wmGaugeTop = 0.3129;
    const b = gaugeRect(render('waferMap', WAFER))[1];
    expect(a).toBeCloseTo(toY(0.6137), 9);
    expect(b).toBeCloseTo(toY(0.3129), 9);
    expect(a).not.toBeCloseTo(b, 3);
  });

  it('DL 게이지 기둥 꼭대기 = 0.14 + defectLevel × 0.80', () => {
    for (const dl of [0, 0.25, 0.5, 0.75, 1]) {
      H.reset();
      const rect = gaugeRect(render('waferMap', { ...WAFER, defectLevel: dl }));
      expect(1 - rect[1] / CH, `defectLevel=${dl}`).toBeCloseTo(WM_GAUGE_Y0 + dl * WM_GAUGE_SPAN, 9);
    }
    expect(WM_GAUGE_Y0).toBeCloseTo(0.14, 12);
    expect(WM_GAUGE_SPAN).toBeCloseTo(0.80, 12);
  });

  it('rawYield 0.1043 → 0.9950 에서 불량 칸 비율이 약 89.6 % → 0.5~0.7 % 다(0칸이 되지 않는다)', () => {
    const tally = (rawYield: number): { total: number; defect: number } => {
      const cells = waferCells(render('waferMap', { ...WAFER, rawYield }));
      return { total: cells.length, defect: cells.filter((c) => c.defect).length };
    };
    const lo = tally(0.1043);
    H.reset();
    const hi = tally(0.9950);

    expect(lo.total, '격자 칸을 하나도 찾지 못했다').toBeGreaterThan(800);
    expect(hi.total, '수율이 칸 수를 바꾸면 안 된다').toBe(lo.total);
    expect((lo.defect / lo.total) * 100).toBeCloseTo(89.6, 0);
    const hiPct = (hi.defect / hi.total) * 100;
    expect(hiPct).toBeGreaterThanOrEqual(0.5);
    expect(hiPct).toBeLessThanOrEqual(0.7);
    expect(hi.defect, '최고 수율에서 불량 칸이 0 이 되면 「완벽한 웨이퍼」라는 거짓을 그린다').toBeGreaterThan(0);
  });

  it('🔴 회귀 방어 — 에지 링이 없다(불량 칸이 반경과 무관하게 균일하다)', () => {
    /* D₀ 는 **공간 균일**이고 「에지 링 전이」는 이미 정정된 물리 오류다(PLN 2026-08-20).
       반경 가중이 되살아나면 안쪽 절반과 바깥쪽 절반의 불량 비율이 갈린다.
       경계는 넓이를 반으로 가르는 반경 1/√2 다. */
    for (const rawYield of [0.1043, 0.5, 0.9950]) {
      H.reset();
      const cells = waferCells(render('waferMap', { ...WAFER, rawYield }));
      const inner = cells.filter((c) => c.r <= Math.SQRT1_2);
      const outer = cells.filter((c) => c.r > Math.SQRT1_2);
      expect(inner.length).toBeGreaterThan(100);
      expect(outer.length).toBeGreaterThan(100);
      const fi = inner.filter((c) => c.defect).length / inner.length;
      const fo = outer.filter((c) => c.defect).length / outer.length;
      expect(
        Math.abs(fi - fo) * 100,
        `rawYield=${rawYield}: 안쪽 ${(fi * 100).toFixed(1)} % vs 바깥쪽 ${(fo * 100).toFixed(1)} % — 반경 의존이 되살아났다`,
      ).toBeLessThanOrEqual(20);
    }
  });
});

/* ────────────────────────────── packageThermal ────────────────────────────── */

describe('폴백 ↔ 씬 정본 결속 — packageThermal', () => {
  const PKG = { rise: 0.4, recPower: 1 / 3, testPower: 0.1667, theta: 0.5 };

  /** ΔT 기둥 사각형(가로 구간 고정). */
  function colRect(ops: Ops): [number, number, number, number] {
    const px = toX(PT_TCOL_X0);
    const pw = toX(PT_TCOL_X1) - px;
    const found = ops.rects.filter(([rx, , rw]) => near(rx, px) && near(rw, pw));
    expect(found.length, 'ΔT 기둥을 특정하지 못했다').toBe(1);
    return found[0] as [number, number, number, number];
  }

  /** 현재 θ 위치 마커(반지름이 `PT_MARKER_R` 하나뿐이라 좌표만으로 특정된다)의 세로 UV. */
  function markerUv(ops: Ops): number[] {
    return [...new Set(ops.arcs
      .filter(([, , r]) => near(r, PT_MARKER_R * CH, 1e-9))
      .map(([, ay]) => r9(1 - ay / CH)))];
  }

  it('ΔT 기둥이 packageThermalModel().colTop 를 그대로 쓴다', () => {
    H.override.ptColTop = 0.8137;   // 제품 어디에도 없는 값
    const ops = render('packageThermal', PKG);
    const rect = colRect(ops);
    expect(rect[1]).toBeCloseTo(toY(0.8137), 9);
    expect(rect[3]).toBeCloseTo(toY(PT_TAXIS_Y0) - toY(0.8137), 9);
    expect(H.calls.pkg.at(-1)).toEqual(PKG);
  });

  it('목의 colTop 을 바꾸면 기둥도 그만큼 움직인다', () => {
    H.override.ptColTop = 0.8137;
    const a = colRect(render('packageThermal', PKG));
    H.reset();
    H.override.ptColTop = 0.5039;
    const b = colRect(render('packageThermal', PKG));
    expect(a[1]).toBeCloseTo(toY(0.8137), 9);
    expect(b[1]).toBeCloseTo(toY(0.5039), 9);
    expect(a[3]).toBeGreaterThan(b[3]);
  });

  it('rise 0.025 → 1.0 (= 7.5 → 300 °C) 에서 ΔT 기둥 높이가 0.018 → 0.720 UV (40.0 배)', () => {
    const heightUv = (rise: number): number => colRect(render('packageThermal', { ...PKG, rise }))[3] / CH;
    const lo = heightUv(0.025);
    H.reset();
    const hi = heightUv(1.0);
    expect(lo).toBeCloseTo(0.018, 9);
    expect(hi).toBeCloseTo(0.720, 9);
    expect(hi).toBeCloseTo(PT_RISE_SPAN, 12);
    expect(hi / lo).toBeCloseTo(40.0, 6);
  });

  it('계단선 y = 0.20 + recPower × 3/3 × 0.42 — 5단이 명세 수치와 일치한다', () => {
    const want: Array<[number, number]> = [[3, 0.620], [2, 0.480], [1, 0.340], [0.75, 0.305], [0.5, 0.270]];
    for (const [watt, y] of want) {
      H.reset();
      const uv = markerUv(render('packageThermal', { ...PKG, recPower: watt / PT_POWER_AXIS_MAX_W }));
      expect(uv.length, `${watt} W: 마커를 특정하지 못했다`).toBe(1);
      expect(uv[0] as number, `${watt} W`).toBeCloseTo(y, 6);
      expect(uv[0] as number).toBeCloseTo(ptYOfPower(watt), 9);
    }
  });

  it('🔴 회귀 방어 — θ 를 연속으로 훑어도 권장전력 계단이 보간되지 않는다', () => {
    /* 🔴 이산화의 자리는 **랩**(θ → 밴드 5단)이다. 그래서 θ 를 연속으로 밀면서 랩과 같은 방식으로
       밴드를 골라 넘기고, 화면의 마커가 **정해진 다섯 자리만** 밟는지 본다.
       동시에 계단 트레드 4단(가로 폭이 있는 것)이 어떤 θ 에서도 자리를 지키는지 확인한다 —
       트레드가 파라미터를 따라 움직이면 그것이 곧 「계단을 보간했다」는 증거다. */
    const stepUv = PT_POWER_BANDS.map((b) => r9(ptYOfPower(b.powerW)));
    /** 랩과 같은 귀속: θ ≥ thetaMin 을 만족하는 **마지막(= 가장 낮은 전력)** 밴드. */
    const bandPowerW = (thetaC: number): number => {
      let out = (PT_POWER_BANDS[0] as { powerW: number }).powerW;
      for (const b of PT_POWER_BANDS) if (thetaC >= b.thetaMin) out = b.powerW;
      return out;
    };

    const seen = new Set<number>();
    for (let i = 0; i <= 170; i++) {
      const theta = i / 170;
      const thetaC = PT_THETA_MIN + theta * (PT_THETA_MAX - PT_THETA_MIN);
      H.reset();
      const ops = render('packageThermal', {
        ...PKG, theta, recPower: bandPowerW(thetaC) / PT_POWER_AXIS_MAX_W,
      });
      const uv = markerUv(ops);
      expect(uv.length, `θ=${thetaC.toFixed(2)}: 마커를 특정하지 못했다`).toBe(1);
      const hit = stepUv.filter((y) => Math.abs(y - (uv[0] as number)) < 1e-9);
      expect(hit.length, `θ=${thetaC.toFixed(2)}: 마커가 계단 사이 ${uv[0]} 에 섰다(보간 흔적)`).toBe(1);
      seen.add(hit[0] as number);

      for (const st of PT_STEPS) {
        if (!(st.x1 > st.x0)) continue;   // 마지막 단(θ=100)은 폭이 0 — 점으로만 남는다
        const found = hSegsAt(ops, toY(st.y)).some((sg) =>
          near(Math.min(sg.x0, sg.x1), toX(st.x0)) && near(Math.max(sg.x0, sg.x1), toX(st.x1)));
        expect(found, `θ=${thetaC.toFixed(2)}: 계단 트레드 ${st.powerW} W 가 사라졌거나 움직였다`).toBe(true);
      }
    }
    expect(seen.size, '5단 전부를 밟지 않았다').toBe(PT_POWER_BANDS.length);

    // 라이저는 **인접 두 단 사이만** 잇는다 — 중간값이 끼어들면 이 세로선이 사라진다
    H.reset();
    const ops = render('packageThermal', PKG);
    for (const b of PT_BOUNDARIES) {
      const v = vSegsSpanning(ops, toY(b.yOpen), toY(b.yClosed));
      expect(v.some((sg) => near(sg.x0, toX(b.x))), `θ=${b.thetaC} 라이저가 없다`).toBe(true);
    }
  });
});

/* ────────────────────────────── moistureSoak ────────────────────────────── */

describe('폴백 ↔ 씬 정본 결속 — moistureSoak', () => {
  const SOAK = { floorLife: 72 / 192, soak: 96 / 192, exposure: 24 / 192, margin: 0.625 };

  /** 플로어 라이프 막대 사각형(행의 세로 구간이 고정이라 좌표만으로 특정된다). */
  function floorBar(ops: Ops): [number, number, number, number] {
    const x0 = toX(MS_TIME_X0);
    const top = toY(MS_ROW_FLOOR_Y1);
    const bh = toY(MS_ROW_FLOOR_Y0) - top;
    const found = ops.rects.filter(([rx, ry, , rh]) => near(rx, x0) && near(ry, top) && near(rh, bh));
    expect(found.length, '플로어 라이프 막대를 특정하지 못했다').toBe(1);
    return found[0] as [number, number, number, number];
  }

  it('막대와 실선 눈금이 moistureSoakModel().xFloorEnd 를 그대로 쓴다', () => {
    H.override.msFloorEnd = 0.7137;   // 제품 어디에도 없는 값
    const ops = render('moistureSoak', SOAK);
    const bar = floorBar(ops);
    expect((bar[0] + bar[2]) / CW, '막대 끝이 모델의 xFloorEnd 를 따르지 않는다').toBeCloseTo(0.7137, 9);

    const tick = vSegsSpanning(ops, toY(MS_ROW_FLOOR_Y0), toY(MS_ROW_FLOOR_Y1))
      .filter((sg) => near(sg.x0, toX(0.7137)));
    expect(tick.length, '실선 눈금이 막대 끝을 따르지 않는다').toBe(1);
    expect(H.calls.soak.at(-1)).toEqual(SOAK);
  });

  it('목의 xFloorEnd 를 바꾸면 막대도 그만큼 움직인다', () => {
    H.override.msFloorEnd = 0.7137;
    const a = floorBar(render('moistureSoak', SOAK));
    H.reset();
    H.override.msFloorEnd = 0.5231;
    const b = floorBar(render('moistureSoak', SOAK));
    expect((a[0] + a[2]) / CW).toBeCloseTo(0.7137, 9);
    expect((b[0] + b[2]) / CW).toBeCloseTo(0.5231, 9);
  });

  it('floorLife 4단의 막대 끝 x — 168 h ⇒ 0.8350 · 72 h ⇒ 0.4150 · 48 h ⇒ 0.3100 · 24 h ⇒ 0.2050', () => {
    const want: Array<[number, number]> = [[168, 0.8350], [72, 0.4150], [48, 0.3100], [24, 0.2050]];
    for (const [hours, x] of want) {
      H.reset();
      const bar = floorBar(render('moistureSoak', { ...SOAK, floorLife: hours / MS_TIME_AXIS_MAX_H }));
      expect((bar[0] + bar[2]) / CW, `${hours} h`).toBeCloseTo(x, 9);
    }
    // 이 4단은 표준(J-STD-020F Table 4)이 준 값이지 화면이 지어낸 값이 아니다
    expect([...MS_FLOOR_LIFE_STEPS_H].sort((a, b) => b - a)).toEqual([168, 72, 48, 24]);
  });

  it('불변식 — 치수선 길이 = |xOfHour(floorLife) − xOfHour(exposure)| 이고 부호가 margin 을 따른다', () => {
    const cases: Array<{ floorLifeH: number; exposureH: number; margin: number }> = [
      { floorLifeH: 168, exposureH: 24, margin: 0.875 },    // 여유 +
      { floorLifeH: 24, exposureH: 168, margin: 0.125 },    // 여유 −
      { floorLifeH: 96, exposureH: 96, margin: MS_MARGIN_ZERO },   // 여유 0 = 합격선
      { floorLifeH: 48, exposureH: 120, margin: 0.3125 },
    ];
    const y = toY(MS_ROW_MARGIN_Y);
    for (const cse of cases) {
      H.reset();
      const floorLife = cse.floorLifeH / MS_TIME_AXIS_MAX_H;
      const exposure = cse.exposureH / MS_TIME_AXIS_MAX_H;
      const ops = render('moistureSoak', { ...SOAK, floorLife, exposure, margin: cse.margin });

      const dim = hSegsAt(ops, y);
      expect(dim.length, `${JSON.stringify(cse)}: 여유 치수선을 특정하지 못했다`).toBe(1);
      const seg = dim[0] as Seg;
      expect(Math.abs(seg.x1 - seg.x0) / CW, '길이가 좌표에서 나오지 않는다')
        .toBeCloseTo(Math.abs(msXOfNorm(floorLife) - msXOfNorm(exposure)), 9);

      // 화살촉 — 3점 닫힌 삼각형. 밑변 두 점의 x 가 같고 꼭짓점이 치수선 위에 있다.
      const arrow = ops.paths.filter((pts) => pts.length === 3
        && near((pts[0] as [number, number])[1], y)
        && Math.abs((pts[1] as [number, number])[0] - (pts[2] as [number, number])[0]) < 1e-9);
      expect(arrow.length, '치수선 화살촉을 특정하지 못했다').toBe(1);
      const tri = arrow[0] as Array<[number, number]>;
      const dir = Math.sign((tri[0] as [number, number])[0] - (tri[1] as [number, number])[0]);
      expect(dir, `${JSON.stringify(cse)}: 화살표 방향이 margin 의 부호와 다르다`)
        .toBe(cse.margin >= MS_MARGIN_ZERO ? 1 : -1);
    }
  });

  it('🔴 회귀 방어 — 플로어 라이프가 이산 4단이고 보간되지 않는다', () => {
    /* 🔴 이 씬의 이산화는 **랩 슬라이더(MSL 3·4·5·5a)** 에 있다. 그래서 화면에서 볼 것은 둘이다:
       ① 유령 눈금 4자리가 **어떤 파라미터에서도** 자리를 지킨다(늘지도 옮기지도 않는다).
       ② legal 4단에서는 실선 눈금이 유령 자리에 정확히 겹쳐 눈금이 4개로 줄어든다 —
          사이에 서면 계단이 뭉개진 것이다. */
    const ghost = [...MS_FLOOR_GHOST_X].map(r9).sort((a, b) => a - b);
    const rowTicks = (ops: Ops): number[] =>
      [...new Set(vSegsSpanning(ops, toY(MS_ROW_FLOOR_Y0), toY(MS_ROW_FLOOR_Y1))
        .map((sg) => r9(sg.x0 / CW)))].sort((a, b) => a - b);

    for (let i = 0; i <= 40; i++) {
      H.reset();
      const ticks = rowTicks(render('moistureSoak', { ...SOAK, floorLife: i / 40 }));
      for (const gx of ghost) {
        expect(ticks.some((t) => Math.abs(t - gx) < 1e-9), `floorLife=${i / 40}: 유령 눈금 ${gx} 가 사라졌다`).toBe(true);
      }
      expect(ticks.length, '유령 4자리 + 실선 1자리보다 많은 눈금이 생겼다').toBeLessThanOrEqual(ghost.length + 1);
    }

    for (const hours of MS_FLOOR_LIFE_STEPS_H) {
      H.reset();
      const ticks = rowTicks(render('moistureSoak', { ...SOAK, floorLife: hours / MS_TIME_AXIS_MAX_H }));
      expect(ticks, `${hours} h: 실선 눈금이 계단 사이에 섰다`).toEqual(ghost);
    }
  });
});

/* ────────────────────────────── shearTest ────────────────────────────── */

describe('폴백 ↔ 씬 정본 결속 — shearTest', () => {
  const SHEAR = { required: 0.512, applied: 0.6, dieArea: 0.64, speedClass: 1 / 3, speedLog: stSpeedLog(0.5) };

  /** 요구력 막대 사각형(가로 구간 고정). */
  function forceBar(ops: Ops): [number, number, number, number] {
    const px = toX(ST_FORCE_BAR_X0);
    const pw = toX(ST_FORCE_BAR_X1) - px;
    const found = ops.rects.filter(([rx, , rw]) => near(rx, px) && near(rw, pw));
    expect(found.length, '요구력 막대를 특정하지 못했다').toBe(1);
    return found[0] as [number, number, number, number];
  }

  /** 다이 상면도 정사각형(패널 중심에 놓인 채움 사각형). */
  function dieSquare(ops: Ops): [number, number, number, number] {
    const cx = toX(ST_DIE_PANEL_CX);
    const cy = toY(ST_DIE_PANEL_CY);
    const found = ops.rects.filter(([rx, ry, rw, rh]) =>
      near(rx + rw / 2, cx) && near(ry + rh / 2, cy) && rw > 0 && rh > 0);
    expect(found.length, '다이 사각형을 특정하지 못했다').toBe(1);
    return found[0] as [number, number, number, number];
  }

  it('요구력 막대가 shearTestModel().barTopY 를 그대로 쓴다', () => {
    H.override.stBarTopY = 0.4137;   // 제품 어디에도 없는 값
    const ops = render('shearTest', SHEAR);
    const bar = forceBar(ops);
    expect(bar[1]).toBeCloseTo(toY(0.4137), 9);
    expect(bar[3]).toBeCloseTo(toY(ST_FORCE_BAR_Y0) - toY(0.4137), 9);
    // 막대 윗변 선(규격선)도 같은 값을 쓴다 — 채움만 맞고 테두리가 어긋나면 실패다
    const cap = hSegsAt(ops, toY(0.4137)).filter((sg) => near(Math.min(sg.x0, sg.x1), toX(ST_FORCE_BAR_X0)));
    expect(cap.length, '막대 윗변이 모델 값을 따르지 않는다').toBe(1);
    expect(H.calls.shear.at(-1)).toEqual(SHEAR);
  });

  it('목의 barTopY 를 바꾸면 막대도 그만큼 움직인다', () => {
    H.override.stBarTopY = 0.4137;
    const a = forceBar(render('shearTest', SHEAR));
    H.reset();
    H.override.stBarTopY = 0.6923;
    const b = forceBar(render('shearTest', SHEAR));
    expect(a[1]).toBeCloseTo(toY(0.4137), 9);
    expect(b[1]).toBeCloseTo(toY(0.6923), 9);
    expect(b[3]).toBeGreaterThan(a[3]);
  });

  it('🔴 dieArea a = 64 → 65 에서 요구력 막대가 0.2662 → 0.2600 으로 내려앉는다(실재하는 불연속)', () => {
    /* S43 FIGURE 2019-4 NOTE 1 — 면적이 커지는데 요구치는 **떨어진다.** 평활하면 표준을 왜곡한다. */
    const requiredOf = (a: number): number =>
      (a <= ST_AREA_KNEE_UNITS ? ST_SLOPE_KG_PER_UNIT * a : ST_PLATEAU_KG) / ST_SHEAR_AXIS_MAX_KG;
    const shot = (a: number): { barUv: number; sideUv: number } => {
      const ops = render('shearTest', {
        ...SHEAR, dieArea: a / ST_DIE_AREA_UNITS_MAX, required: requiredOf(a),
      });
      return { barUv: forceBar(ops)[3] / CH, sideUv: dieSquare(ops)[2] / CW };
    };
    const at64 = shot(64);
    H.reset();
    const at65 = shot(65);

    expect(at64.barUv).toBeCloseTo(0.2662, 4);
    expect(at65.barUv).toBeCloseTo(0.2600, 4);
    // 막대 높이는 `required × ST_FORCE_BAR_H` 다 — 화면이 정본 상수를 쓴다는 확인
    expect(at64.barUv).toBeCloseTo(requiredOf(64) * ST_FORCE_BAR_H, 9);
    expect(at65.barUv).toBeCloseTo(requiredOf(65) * ST_FORCE_BAR_H, 9);
    expect(at65.barUv, '요구치의 불연속이 평활해졌다').toBeLessThan(at64.barUv);
    // 면적은 오히려 커진다 — 「막대가 줄어든 건 다이가 작아져서」가 아님을 못박는다
    expect(at65.sideUv, '면적이 커지지 않았다').toBeGreaterThan(at64.sideUv);
    expect(at64.sideUv).toBeCloseTo(ST_DIE_SIDE_MAX * Math.sqrt(0.64), 9);
    expect(at65.sideUv).toBeCloseTo(ST_DIE_SIDE_MAX * Math.sqrt(0.65), 9);
  });

  it('속도축 마커 x = 0.58 + speedLog × 0.38', () => {
    const markerUv = (speedLog: number): number => {
      const v = vSegsSpanning(render('shearTest', { ...SHEAR, speedLog }),
        toY(ST_SPEED_AXIS_Y), toY(ST_SPEED_AXIS_Y + ST_BAND_H));
      expect(v.length, `speedLog=${speedLog}: 속도 마커를 특정하지 못했다`).toBe(1);
      return (v[0] as Seg).x0 / CW;
    };
    expect(ST_SPEED_AXIS_SPAN).toBeCloseTo(0.38, 12);
    for (const v of [ST_SPEED_MIN, ST_LOW_SPEED_MAX, ST_HIGH_SPEED_MIN, ST_SPEED_MAX]) {
      H.reset();
      const t = stSpeedLog(v);
      const x = markerUv(t);
      expect(x, `v=${v}`).toBeCloseTo(ST_SPEED_AXIS_X0 + t * ST_SPEED_AXIS_SPAN, 9);
      // 밴드 경계와 **같은 함수**를 타야 마커와 판정이 갈리지 않는다
      expect(x, `v=${v}: 마커가 밴드 경계와 어긋난다`).toBeCloseTo(stXOfSpeed(v), 9);
    }
    expect(markerUv(stSpeedLog(ST_SPEED_MIN))).toBeCloseTo(ST_SPEED_AXIS_X0, 12);
    expect(markerUv(stSpeedLog(ST_SPEED_MAX))).toBeCloseTo(ST_SPEED_AXIS_X1, 12);

    /* 🔴 DSN 명세는 「v=0.8 ⇒ speedLog 0.3010 · v=50 ⇒ 0.9031」이라고 적었다. 앞은 맞고 **뒤는
       산술 오류**다 — log10(50/0.1)/log10(100/0.1) = log10(500)/3 = 0.899657 이고, 0.9031 은
       3 × 0.30103 이다(3 으로 나누는 것을 빠뜨린 수). 랩·모델이 쓰는 식은 하나뿐이므로
       **제품이 맞다.** 제품 값을 단언하고 명세의 수는 DEV 보고로 올린다. */
    expect(stSpeedLog(ST_LOW_SPEED_MAX)).toBeCloseTo(0.3010, 4);
    expect(stSpeedLog(ST_HIGH_SPEED_MIN)).toBeCloseTo(0.899657, 6);
  });

  it('🔴 회귀 방어 — speedClass 를 연속으로 훑어도 이산 4단만 밟는다(보간 없음)', () => {
    /* `classIndex = round(speedClass × 3)`. 화면에서 그 색인의 유일한 기하 증거가 **강조 채움**이다:
       1 ⇒ 저속 A · 2 ⇒ 미규정 · 3 ⇒ 고속 B · 0 ⇒ 강조 없음(도달 불가).
       강조가 밴드 경계가 아닌 자리에 걸리거나 폭이 연속으로 자라면 보간이 들어온 것이다. */
    const bandY0 = toY(ST_SPEED_AXIS_Y);
    const bandY1 = toY(ST_SPEED_AXIS_Y + ST_BAND_H);
    const bands: Array<[number, number]> = [
      [stXOfSpeed(ST_SPEED_MIN), stXOfSpeed(ST_LOW_SPEED_MAX)],
      [stXOfSpeed(ST_LOW_SPEED_MAX), stXOfSpeed(ST_HIGH_SPEED_MIN)],
      [stXOfSpeed(ST_HIGH_SPEED_MIN), stXOfSpeed(ST_SPEED_MAX)],
    ];
    const seen = new Set<number>();

    for (let i = 0; i <= 120; i++) {
      const speedClass = i / 120;
      H.reset();
      const ops = render('shearTest', { ...SHEAR, speedClass });
      // 밴드 높이를 가진 채움 중 「도달 불가」 칸(축 왼쪽·항상 그린다)을 뺀 것이 강조다
      const fills = ops.rects.filter(([rx, ry, , rh]) =>
        near(ry, bandY1) && near(rh, bandY0 - bandY1) && !near(rx, toX(ST_BELOW_LOW_X0)));
      const want = Math.round(speedClass * ST_SHEAR_CLASS_MAX);
      seen.add(want);

      if (want === 0) {
        expect(fills.length, `speedClass=${speedClass}: class 0 인데 밴드가 강조됐다`).toBe(0);
      } else {
        expect(fills.length, `speedClass=${speedClass}: class ${want} 인데 강조 밴드가 하나가 아니다`).toBe(1);
        const band = bands[want - 1] as [number, number];
        const rect = fills[0] as [number, number, number, number];
        expect(rect[0] / CW, `class ${want} 강조 시작`).toBeCloseTo(band[0], 9);
        expect((rect[0] + rect[2]) / CW, `class ${want} 강조 끝`).toBeCloseTo(band[1], 9);
      }
    }
    expect([...seen].sort((a, b) => a - b), '4단을 전부 밟지 않았다').toEqual([0, 1, 2, 3]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 🔴 A14 — 비유한·범위 밖 파라미터에서도 **그려진 좌표가 전부 유한**하다.
 *
 * NaN 하나가 Canvas2D 에 들어가면 그 path 가 통째로 사라진다. 화면은 「조용히 비는」 형태로
 * 망가지므로 눈으로도, 스냅샷으로도 잘 안 잡힌다. 좌표를 전수로 훑는 이 게이트가 유일한 방어다.
 * ════════════════════════════════════════════════════════════════════════ */

describe('신규 5종 A14 — 비유한·범위 밖 값에서도 좌표가 전부 유한하다', () => {
  const HOSTILE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3, 7, -0.0001];
  const SCENES: Array<[FbId, readonly string[]]> = [
    ['probeScrub', ['clearance', 'odMargin', 'force', 'forceCeil', 'overdrive']],
    ['waferMap', ['rawYield', 'defectLevel', 'dieAcross']],
    ['packageThermal', ['rise', 'recPower', 'testPower', 'theta']],
    ['moistureSoak', ['floorLife', 'soak', 'exposure', 'margin']],
    ['shearTest', ['required', 'applied', 'dieArea', 'speedClass', 'speedLog']],
  ];

  /** `ops.points` · `ops.paths` · `ops.rects` · `ops.arcs` 전량에서 비유한 값을 모은다. */
  function nonFinite(ops: Ops): number[] {
    const out: number[] = [];
    const scan = (v: number): void => { if (!Number.isFinite(v)) out.push(v); };
    for (const [px, py] of ops.points) { scan(px); scan(py); }
    for (const path of ops.paths) for (const [px, py] of path) { scan(px); scan(py); }
    for (const rect of ops.rects) for (const v of rect) scan(v);
    for (const arc of ops.arcs) for (const v of arc) scan(v);
    return out;
  }

  for (const [id, keys] of SCENES) {
    it(`${id}: NaN·±∞·범위 밖 값을 넣어도 예외 없이 유한 좌표만 그린다`, () => {
      for (const bad of HOSTILE) {
        // ① 전 키 동시 오염
        H.reset();
        const all: Record<string, number> = {};
        for (const k of keys) all[k] = bad;
        let ops: Ops | null = null;
        expect(() => { ops = render(id, all); }, `${id}: 전 키 ${bad} 에서 예외가 났다`).not.toThrow();
        expect(nonFinite(ops as unknown as Ops), `${id}: 전 키 ${bad} 에서 비유한 좌표가 나갔다`).toEqual([]);

        // ② 키 하나씩만 오염(나머지는 정의역 안의 정상값)
        for (const k of keys) {
          H.reset();
          const one: Record<string, number> = {};
          for (const j of keys) one[j] = 0.4;
          one[k] = bad;
          let o2: Ops | null = null;
          expect(() => { o2 = render(id, one); }, `${id}: ${k}=${bad} 에서 예외가 났다`).not.toThrow();
          expect(nonFinite(o2 as unknown as Ops), `${id}: ${k}=${bad} 에서 비유한 좌표가 나갔다`).toEqual([]);
        }
      }
    });
  }
});
