/**
 * rAF 루프 · 씬 수명 관리.
 * 🔴 모듈 최상위에서 document/window 를 만지지 않는다(동적 import 대상).
 */
import { createGLContext, type GLContext } from './context';
import { onColorSchemeChange } from './scenes/theme';
import { REDUCED_MOTION_TIME, onReducedMotionChange, prefersReducedMotion } from './scenes/motion';
import { applyRealisticBackdrop } from '../realisticBackdrops';

/** 정규화 파라미터(0~1). 물리값 → 정규화 변환은 상위(ui/models)가 한다 — §3 계층 규칙. */
export type SceneParams = Readonly<Record<string, number>>;

export interface Scene {
  readonly id: string;
  /**
   * 시간에 따라 그림이 스스로 변하는가.
   * false(기본) 면 파라미터가 그대로일 때 프레임을 건너뛴다.
   */
  readonly animated?: boolean;
  init(gl: GLContext): void;
  update(params: SceneParams): void;
  /** t = 초 단위 경과 시간 */
  draw(t: number): void;
  dispose(): void;
}

export interface LoopHandle {
  /** WebGL2 컨텍스트를 얻어 루프가 실제로 돌고 있는가. false 면 Canvas2D 폴백으로 내려간다. */
  readonly ok: boolean;
  /** 다음 프레임 1장을 강제로 그린다(테마 전환 등 외부 사유). */
  requestRedraw(): void;
  stop(): void;
}

export interface LoopOptions {
  /** 실습 단계별 카메라·진단 합성 구분. */
  stage?: string;
  /** 초기화·드로우 중 예외를 상위에 알린다. 던지지 않고 루프를 멈춘다. */
  onError?(err: unknown): void;
  /** 컨텍스트 로스트/복구 알림 */
  onContextChange?(lost: boolean): void;
}

function sameParams(a: SceneParams | null, b: SceneParams): boolean {
  if (!a) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * 캔버스에 씬을 붙이고 rAF 루프를 시작한다.
 * - 탭이 숨겨지면(document.hidden) 루프를 세운다.
 * - 정적 씬 + 파라미터 무변경 + 크기 무변경이면 draw 를 건너뛴다.
 * - 🔴 `prefers-reduced-motion: reduce` 면 **능동 씬도 정적 씬처럼 다룬다**(`scenes/motion.ts`).
 *   시각은 `REDUCED_MOTION_TIME` 에 고정하고 프레임을 건너뛴다 — 그림은 그대로 남는다.
 */
export function startLoop(
  canvas: HTMLCanvasElement,
  scene: Scene,
  getParams: () => SceneParams,
  options?: LoopOptions,
): LoopHandle {
  applyRealisticBackdrop(canvas, scene.id, options?.stage);
  const ctx = createGLContext(canvas);
  if (!ctx) {
    // WebGL2 미지원 — 설계서 §10 L4. 상위가 Canvas2D 폴백으로 내려간다.
    return { ok: false, requestRedraw: () => {}, stop: () => {} };
  }
  return runLoop(ctx, scene, getParams, options);
}

/** ctx 가 확정된 뒤의 본체. 호이스팅된 함수 선언 안에서도 ctx 가 non-null 로 유지된다. */
function runLoop(
  ctx: GLContext,
  scene: Scene,
  getParams: () => SceneParams,
  options?: LoopOptions,
): LoopHandle {
  let raf = 0;
  let stopped = false;
  let start = 0;
  let lastParams: SceneParams | null = null;
  let forceRedraw = true;
  let contextLost = false;
  /**
   * 🔴 감속 모드. 능동 씬을 정적 씬처럼 다루고 시각을 고정한다.
   *    설정이 도중에 바뀌면 `onReducedMotionChange` 가 갱신하고 한 장 다시 그린다.
   */
  let reduced = prefersReducedMotion();

  const fail = (err: unknown): void => {
    stop();
    if (options?.onError) options.onError(err);
    else if (typeof console !== 'undefined') console.error('[viz] scene error', err);
  };

  const offLost = ctx.onLost(() => {
    contextLost = true;
    options?.onContextChange?.(true);
  });
  const offRestored = ctx.onRestored(() => {
    contextLost = false;
    forceRedraw = true;
    try {
      scene.init(ctx); // 프로그램/버퍼를 다시 만든다(캐시는 로스트 시 비워졌다)
      if (lastParams) scene.update(lastParams);
    } catch (err) {
      fail(err);
      return;
    }
    options?.onContextChange?.(false);
  });

  /**
   * 🔴 **테마 리스너를 루프가 직접 건다.** 종전에는 정적 씬만 자기 안에서 `onColorSchemeChange` 를
   *    걸었고, 능동 씬은 「어차피 매 프레임 그린다」에 기대고 있었다. 감속 모드가 들어오면서
   *    **능동 씬도 프레임을 건너뛰게 되므로** 그 가정이 깨진다 — 여기서 한 번 더 막는다.
   *    (정적 씬은 자기 리스너와 겹쳐 한 장을 두 번 그리지만, 테마 전환 때 한 번뿐이라 무해하다.)
   */
  const offScheme = onColorSchemeChange(() => {
    forceRedraw = true;
  });
  const offMotion = onReducedMotionChange(() => {
    reduced = prefersReducedMotion();
    forceRedraw = true;
    // 감속이 풀렸는데 루프가 서 있으면 깨운다(정지 중에는 rAF 가 계속 돌지만 draw 만 건너뛴다).
    if (!raf && !stopped && !(typeof document !== 'undefined' && document.hidden)) {
      raf = requestAnimationFrame(frame);
    }
  });

  const onVisibility = (): void => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    } else if (!raf) {
      forceRedraw = true;
      raf = requestAnimationFrame(frame);
    }
  };

  function frame(now: number): void {
    raf = 0;
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) return; // visibilitychange 가 깨운다
    raf = requestAnimationFrame(frame);
    if (contextLost || ctx.lost) return;

    if (start === 0) start = now;
    // 🔴 감속 모드에서는 시각을 고정한다 — 그림은 남고 움직임만 선다.
    const t = reduced ? REDUCED_MOTION_TIME : (now - start) / 1000;

    let dirty = forceRedraw;
    if (ctx.sizeDirty && ctx.syncSize()) dirty = true;

    const params = getParams();
    if (!sameParams(lastParams, params)) {
      lastParams = { ...params };
      try {
        scene.update(lastParams);
      } catch (err) {
        fail(err);
        return;
      }
      dirty = true;
    }

    // 정적 씬(또는 감속 모드의 능동 씬) · 무변경 → 프레임 스킵
    if (!dirty && (!scene.animated || reduced)) return;
    forceRedraw = false;
    try {
      scene.draw(t);
    } catch (err) {
      fail(err);
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    offLost();
    offRestored();
    offScheme();
    offMotion();
    try {
      scene.dispose();
    } catch {
      /* dispose 실패는 삼킨다 — 이미 정리 경로다 */
    }
    ctx.dispose();
  }

  try {
    ctx.syncSize();
    scene.init(ctx);
  } catch (err) {
    fail(err);
    return { ok: false, requestRedraw: () => {}, stop: () => {} };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }
  raf = requestAnimationFrame(frame);

  return {
    ok: true,
    requestRedraw() {
      forceRedraw = true;
    },
    stop,
  };
}

export type { GLContext };
