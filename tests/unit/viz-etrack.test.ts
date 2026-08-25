/**
 * E트랙 신규 씬 2종(`stepCoverage` · `aldCycle`) 검증.
 *
 * 1) GLSL 정적 검사 — 기존 `viz-glsl.test.ts` 와 같은 규칙을 새 셰이더에도 건다.
 * 2) 씬 계약 — DOM 없는 환경에서 import·생성·update·draw·dispose 가 죽지 않는다.
 * 3) 🔴 **A12 방향성** — 씬이 셰이더에 넘기는 파생값 모델을 직접 검사한다.
 *    셰이더가 이 값들만 보고 그리므로, 여기서 방향이 맞으면 화면의 방향도 맞다.
 * 4) 🔴 **A5 파라미터 연동** — Canvas2D 폴백을 기록용 컨텍스트로 돌려
 *    파라미터가 다르면 드로잉 명령열이 반드시 달라지는 것을 확인한다.
 */
import { describe, expect, it } from 'vitest';

import {
  STEP_COVERAGE_FS,
  stepCoverageModel,
  createScene as createStepCoverage,
} from '@/viz/gl/scenes/stepCoverage';
import { ALD_CYCLE_FS, aldCycleModel, createScene as createAldCycle } from '@/viz/gl/scenes/aldCycle';
import { createFallback2D } from '@/viz/gl/fallback2d';
import { SCENE_IDS, isSceneId, loadScene } from '@/viz';

/* ---------------- 1. GLSL 정적 검사 ---------------- */

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function unbalanced(src: string): string | null {
  const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
  const open = new Set(['(', '{', '[']);
  const stack: string[] = [];
  for (const ch of src) {
    if (open.has(ch)) stack.push(ch);
    else if (ch in pairs) {
      const got = stack.pop();
      if (got !== pairs[ch]) return `'${ch}' 짝이 맞지 않음 (열린 것: ${got ?? '없음'})`;
    }
  }
  return stack.length === 0 ? null : `닫히지 않은 괄호 ${stack.length}개`;
}

function functionNames(src: string): string[] {
  const re = /^\s*(?:float|int|vec2|vec3|vec4|mat2|mat3|mat4|bool|void)\s+([A-Za-z_]\w*)\s*\(/gm;
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(src);
  while (m) {
    const name = m[1];
    if (name) out.push(name);
    m = re.exec(src);
  }
  return out;
}

const SHADERS: Array<[string, string]> = [
  ['STEP_COVERAGE_FS', STEP_COVERAGE_FS],
  ['ALD_CYCLE_FS', ALD_CYCLE_FS],
];

describe('E트랙 셰이더 정적 검사', () => {
  for (const [name, src] of SHADERS) {
    describe(name, () => {
      const clean = stripComments(src);

      it('#version 300 es 가 첫 줄이다', () => {
        expect((src.split('\n').find((l) => l.trim().length > 0) ?? '').trim()).toBe('#version 300 es');
      });
      it('보간 잔재가 남아 있지 않다', () => {
        expect(src.includes('$' + '{')).toBe(false);
      });
      it('괄호가 균형을 이룬다', () => {
        expect(unbalanced(clean)).toBeNull();
      });
      it('void main() 이 정확히 1개다', () => {
        expect((clean.match(/\bvoid\s+main\s*\(/g) ?? []).length).toBe(1);
      });
      it('GLSL ES 1.00 잔재를 쓰지 않는다', () => {
        for (const legacy of ['gl_FragColor', 'texture2D(', 'varying ', 'attribute ']) {
          expect(clean.includes(legacy)).toBe(false);
        }
      });
      it('함수가 중복 정의되지 않는다', () => {
        const names = functionNames(clean).filter((n) => n !== 'main');
        expect(new Set(names).size).toBe(names.length);
      });
      it('정밀도 한정자와 out 변수를 선언한다', () => {
        expect(/precision\s+(lowp|mediump|highp)\s+float\s*;/.test(clean)).toBe(true);
        expect(/^\s*out\s+vec4\s+\w+\s*;/m.test(clean)).toBe(true);
      });
      it('선언한 uniform 을 전부 본문에서 쓴다(죽은 유니폼 금지)', () => {
        const decl = [...clean.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1] ?? '');
        for (const u of decl) {
          const uses = clean.split(u).length - 1;
          expect(uses, `${name}: ${u} 가 선언만 되고 쓰이지 않는다`).toBeGreaterThan(1);
        }
      });
    });
  }
});

/* ---------------- 2. 씬 계약 ---------------- */

describe('E트랙 씬 계약', () => {
  it('전역 document/window 없이 import 된다', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
  });

  for (const [id, factory] of [
    ['stepCoverage', createStepCoverage],
    ['aldCycle', createAldCycle],
  ] as const) {
    it(`${id}: createScene() 이 계약을 만족한다`, () => {
      const scene = factory();
      expect(scene.id).toBe(id);
      expect(scene.animated).toBe(true);
      expect(() => scene.draw(0)).not.toThrow(); // init 전 draw 는 조용히 무시
      expect(() =>
        scene.update({ aspectRatio: 0.9, directionality: 0.1, deposited: 1, pressure: 1, cycles: 1, phase: 0.99, saturation: 1, temperature: 0 }),
      ).not.toThrow();
      expect(() => scene.dispose()).not.toThrow();
    });
  }

  it('활성 배럴은 배선된 씬만 노출하고 실험용 씬은 직접 로드할 수 있다', async () => {
    expect(SCENE_IDS).not.toContain('stepCoverage');
    expect(SCENE_IDS).toContain('aldCycle');
    expect(isSceneId('stepCoverage')).toBe(false);
    expect(isSceneId('aldCycle')).toBe(true);
    expect((await loadScene('stepCoverage')).id).toBe('stepCoverage');
    expect((await loadScene('aldCycle')).id).toBe('aldCycle');
  });
});

/* ---------------- 3. A12 방향성 — stepCoverage ---------------- */

const SC_BASE = { aspectRatio: 0.5, directionality: 0.5, deposited: 0.5, pressure: 0.4 };
const sc = (over: Partial<typeof SC_BASE>): ReturnType<typeof stepCoverageModel> =>
  stepCoverageModel({ ...SC_BASE, ...over });

describe('A12 · stepCoverage 방향성', () => {
  it('평탄면은 정규화 기준이다 — 커버리지 1 (= 그림자 없는 하늘 전체)', () => {
    // 깊이 0 측벽 커버리지 = 오버행/평탄면두께. 물리 정규화가 깨지면 여기서 터진다.
    const m = sc({});
    expect(m.overhang / m.tauField).toBeGreaterThan(0);
    expect(m.overhang / m.tauField).toBeLessThan(1);
    expect(m.wallCoverage).toBeLessThan(m.overhang / m.tauField); // 깊을수록 얇다
  });

  it('aspectRatio↑ → 트렌치가 좁아지고 측벽·바닥이 급격히 얇아진다', () => {
    const lo = sc({ aspectRatio: 0.05 });
    const hi = sc({ aspectRatio: 0.95 });
    expect(hi.halfWidth).toBeLessThan(lo.halfWidth);
    expect(hi.aspect).toBeGreaterThan(lo.aspect);
    expect(hi.wallCoverage).toBeLessThan(lo.wallCoverage * 0.5); // 「급격히」 — 절반 이하
    expect(hi.bottomCoverage).toBeLessThan(lo.bottomCoverage * 0.5);
  });

  it('directionality↑ → 각분포가 좁아지고 오버행이 완화된다(바닥 커버리지는 개선)', () => {
    const lo = sc({ aspectRatio: 0.8, directionality: 0 });
    const hi = sc({ aspectRatio: 0.8, directionality: 1 });
    expect(hi.srcExp).toBeGreaterThan(lo.srcExp);
    expect(hi.overhang).toBeLessThan(lo.overhang);
    expect(hi.pinch).toBeLessThanOrEqual(lo.pinch);
    expect(hi.bottomCoverage).toBeGreaterThan(lo.bottomCoverage);
  });

  it('pressure↑ → 도달 각도 분포가 넓어진다(직진성과 반대 방향)', () => {
    const lo = sc({ aspectRatio: 0.8, pressure: 0 });
    const hi = sc({ aspectRatio: 0.8, pressure: 1 });
    expect(hi.srcExp).toBeLessThan(lo.srcExp); // cos^m 의 m 이 작다 = 분포가 넓다
    expect(hi.overhang).toBeGreaterThan(lo.overhang);
    expect(hi.bottomCoverage).toBeLessThan(lo.bottomCoverage);
  });

  it('deposited↑ → 막이 두꺼워지고 오버행이 자라 유효 입구가 좁아진다', () => {
    const lo = sc({ aspectRatio: 0.9, directionality: 0.2, deposited: 0.1, pressure: 0.6 });
    const hi = sc({ aspectRatio: 0.9, directionality: 0.2, deposited: 1, pressure: 0.6 });
    expect(hi.tauField).toBeGreaterThan(lo.tauField);
    expect(hi.overhang).toBeGreaterThan(lo.overhang);
    expect(hi.hwEff).toBeLessThan(lo.hwEff);
    expect(hi.wallCoverage).toBeLessThan(lo.wallCoverage); // 자기 그림자가 스스로 심해진다
  });

  it('핀치오프는 「고종횡비 + 넓은 각분포 + 많은 증착」이 겹칠 때만 일어난다', () => {
    expect(sc({ aspectRatio: 1, directionality: 0, deposited: 1, pressure: 1 }).pinch).toBe(1);
    expect(sc({ aspectRatio: 0.05, directionality: 0, deposited: 1, pressure: 1 }).pinch).toBe(0); // 얕으면 안 닫힌다
    expect(sc({ aspectRatio: 1, directionality: 1, deposited: 1, pressure: 0 }).pinch).toBe(0); // 콜리메이션이 막는다
    expect(sc({ aspectRatio: 1, directionality: 0, deposited: 0.1, pressure: 1 }).pinch).toBe(0); // 덜 쌓으면 안 닫힌다
  });
});

/* ---------------- 3b. A12 방향성 — aldCycle ---------------- */

const AC_BASE = { cycles: 0.5, phase: 0.1, saturation: 0.8, temperature: 0.5 };
const ac = (over: Partial<typeof AC_BASE>): ReturnType<typeof aldCycleModel> =>
  aldCycleModel({ ...AC_BASE, ...over });

describe('A12 · aldCycle 방향성', () => {
  it('🔴 두께는 사이클 수에 정확히 선형이다 — ALD 학습의 전부', () => {
    // 🔴 격자를 0.1 로 두지 않는다 — 주기에 맞아떨어지는 격자는 반올림 오차를 우연히
    //    소거해 위반을 통과시킨다(계측 규칙 M-2). 소수 스텝 37 점으로 어긋나게 밟는다.
    const N = 37;
    const heights: number[] = [];
    let layer = 0;
    for (let i = 0; i <= N; i++) {
      const m = ac({ cycles: i / N });
      heights.push(m.filmHeight);
      layer = m.layerHeight;
      expect(m.reacted).toBe(0); // phase 0.1 = 전구체 A 단계 → 진행 중 층 없음
      // 🔴 두께는 **연속**이다. 정수 층으로 끊으면 「더 돌렸는데 얇아진다」가 돌아온다(D-5b).
      expect(m.filmHeight).toBeCloseTo(m.cyclesShown * layer, 12);
    }
    // 🔴 절편 0 — 0 사이클이면 막이 없다
    expect(heights[0]).toBe(0);
    // 🔴 증분이 **항상 같다**(정수배가 아니라 상수). 단조는 그 결과로 따라온다
    const step0 = (heights[1] ?? 0) - (heights[0] ?? 0);
    expect(step0).toBeGreaterThan(0);
    for (let i = 1; i < heights.length; i++) {
      const d = (heights[i] ?? 0) - (heights[i - 1] ?? 0);
      expect(d, `구간 ${i - 1}→${i}`).toBeGreaterThan(0);
      expect(d).toBeCloseTo(step0, 12);
    }
    // 🔴 배가쌍이 정확히 2.000
    for (const i of [4, 7, 11, 18]) {
      expect((heights[i * 2] ?? 0) / (heights[i] ?? 0), `배가쌍 ${i}→${i * 2}`).toBeCloseTo(2, 12);
    }
  });

  it('🔴 두께가 phase(4단계 애니메이션)에 좌우되지 않는다 — D-5b 톱니 회귀 방지', () => {
    const ref = ac({ phase: 0 }).filmHeight;
    for (const phase of [0, 0.1, 0.26, 0.5, 0.76, 0.99]) {
      expect(ac({ phase }).filmHeight, `phase=${phase}`).toBe(ref);
    }
  });

  it('phase 는 이산 4구간(전구체 A → 퍼지 → 전구체 B → 퍼지)을 한 바퀴 돈다', () => {
    expect(ac({ phase: 0.1 }).stage).toBe(0);
    expect(ac({ phase: 0.35 }).stage).toBe(1);
    expect(ac({ phase: 0.6 }).stage).toBe(2);
    expect(ac({ phase: 0.85 }).stage).toBe(3);
    // A 도징에는 A 만, B 도징에는 B 만 있고, 퍼지에서 빠진다
    expect(ac({ phase: 0.1 }).gasA).toBe(1);
    expect(ac({ phase: 0.1 }).gasB).toBe(0);
    expect(ac({ phase: 0.6 }).gasB).toBe(1);
    expect(ac({ phase: 0.6 }).gasA).toBe(0);
    expect(ac({ phase: 0.49 }).gasA).toBeLessThan(ac({ phase: 0.26 }).gasA); // 퍼지 진행
    expect(ac({ phase: 0.99 }).gasB).toBeLessThan(ac({ phase: 0.76 }).gasB);
    // 한 바퀴 돌면 층 하나가 완성된다
    expect(ac({ phase: 0.1 }).reacted).toBe(0);
    expect(ac({ phase: 0.99 }).reacted).toBe(1);
  });

  it('🔴 자기제한: A 도징 중 흡착은 포화 상한을 절대 넘지 않는다', () => {
    const cov = ac({ saturation: 0.8 }).satCoverage;
    for (const local of [0.05, 0.3, 0.6, 0.9, 0.99]) {
      const m = ac({ phase: local / 4 });
      expect(m.adsorbed).toBeLessThanOrEqual(cov + 1e-12);
    }
    expect(ac({ phase: 0.24 }).adsorbed).toBeGreaterThan(ac({ phase: 0.02 }).adsorbed);
  });

  it('saturation↑ → 층 두께가 늘지만 포화 후에는 더 넣어도 안 는다', () => {
    const g = (s: number): number => ac({ saturation: s }).layerHeight;
    expect(g(0.4)).toBeGreaterThan(g(0));
    expect(g(1)).toBeGreaterThan(g(0.4));
    const earlyGain = g(0.4) - g(0);
    const lateGain = g(1) - g(0.6);
    expect(lateGain).toBeLessThan(earlyGain * 0.1); // 포화 = 후반 증가가 거의 없다
  });

  it('temperature 는 창 안에서 최대이고 양쪽으로 이탈하면 성장률이 붕괴한다', () => {
    const mid = ac({ temperature: 0.5 }).tempFactor;
    const cold = ac({ temperature: 0 }).tempFactor;
    const hot = ac({ temperature: 1 }).tempFactor;
    expect(mid).toBeGreaterThan(0.99);
    expect(cold).toBeLessThan(mid * 0.1);
    expect(hot).toBeLessThan(mid * 0.1);
    // 성장률 붕괴는 계단 높이(=층 두께)로 그대로 나타난다
    expect(ac({ temperature: 0 }).layerHeight).toBeLessThan(ac({ temperature: 0.5 }).layerHeight * 0.1);
    expect(ac({ temperature: 1 }).filmHeight).toBeLessThan(ac({ temperature: 0.5 }).filmHeight * 0.1);
  });
});

/* ---------------- 4. A5 — 폴백 Canvas2D 가 파라미터에 반응한다 ---------------- */

interface Recorder {
  log: string[];
  ctx: CanvasRenderingContext2D;
}

/** 드로잉 명령을 전부 문자열로 기록하는 가짜 2D 컨텍스트. */
function recorder(): Recorder {
  const log: string[] = [];
  const fmt = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 1e4) / 1e4) : String(v));
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'createLinearGradient') {
          return (...a: number[]): unknown => {
            log.push(`grad(${a.map(fmt).join(',')})`);
            return { addColorStop: (o: number, col: string) => log.push(`stop(${fmt(o)},${col})`) };
          };
        }
        return (...args: unknown[]): void => {
          log.push(`${prop}(${args.map(fmt).join(',')})`);
        };
      },
      set(_t, prop, v) {
        if (typeof prop === 'string') log.push(`${prop}=${fmt(v)}`);
        return true;
      },
    },
  );
  return { log, ctx: proxy as unknown as CanvasRenderingContext2D };
}

function fakeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    clientWidth: 320,
    clientHeight: 200,
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

/** 같은 명령열이면 같은 해시. 파라미터가 바뀌었는데 해시가 같으면 그림이 안 바뀐 것이다. */
function hash(log: string[]): string {
  let h = 5381;
  const s = log.join('|');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}:${s.length}`;
}

function renderFallback(id: 'stepCoverage' | 'aldCycle', params: Record<string, number>): string {
  const r = recorder();
  const fb = createFallback2D(fakeCanvas(r.ctx), id);
  expect(fb).not.toBeNull();
  fb?.update(params);
  fb?.dispose();
  expect(r.log.length).toBeGreaterThan(20);
  return hash(r.log);
}

describe('A5 · 폴백 2D 가 파라미터에 반응한다', () => {
  it('stepCoverage: 키 4개가 각각 그림을 바꾼다', () => {
    const base = { aspectRatio: 0.4, directionality: 0.5, deposited: 0.5, pressure: 0.4 };
    const h0 = renderFallback('stepCoverage', base);
    expect(renderFallback('stepCoverage', base)).toBe(h0); // 결정적
    for (const key of ['aspectRatio', 'directionality', 'deposited', 'pressure'] as const) {
      const changed = renderFallback('stepCoverage', { ...base, [key]: 0.9 });
      expect(changed, `${key} 를 바꿨는데 그림이 그대로다`).not.toBe(h0);
    }
  });

  it('aldCycle: 키 4개가 각각 그림을 바꾼다', () => {
    const base = { cycles: 0.4, phase: 0.1, saturation: 0.6, temperature: 0.5 };
    const h0 = renderFallback('aldCycle', base);
    expect(renderFallback('aldCycle', base)).toBe(h0);
    for (const [key, v] of [['cycles', 0.9], ['phase', 0.6], ['saturation', 0.95], ['temperature', 0.95]] as const) {
      const changed = renderFallback('aldCycle', { ...base, [key]: v });
      expect(changed, `${key} 를 바꿨는데 그림이 그대로다`).not.toBe(h0);
    }
  });
});
