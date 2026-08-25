/**
 * WebGL2 컨텍스트 획득 · 셰이더/프로그램 캐시 · DPR 리사이즈 · 컨텍스트 로스트 처리.
 *
 * 🔴 설계서 §2 — three.js 등 3D 라이브러리를 쓰지 않는다. 런타임 의존성은 react·react-dom 2개뿐.
 * 🔴 이 파일 전체가 동적 import 대상이다. **모듈 최상위에서 document/window 를 만지지 않는다.**
 *    (DOM 접근은 전부 createGLContext() 이후, 함수 본문 안에서만 일어난다.)
 * 🔴 계층 규칙(§3) — src/viz/** 는 src/ui/** 를 import 하지 않는다. 이 파일은 아무것도 import 하지 않는다.
 */

/** 캔버스 실제 픽셀 크기와 CSS 크기. dpr 은 2로 캡한다(§L4 주변 성능 방어). */
export interface GLSize {
  /** 드로잉 버퍼 폭(px) = cssWidth * dpr */
  width: number;
  /** 드로잉 버퍼 높이(px) */
  height: number;
  /** 적용된 devicePixelRatio (최대 2) */
  dpr: number;
  cssWidth: number;
  cssHeight: number;
}

export interface GLContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  /** 현재 드로잉 버퍼 크기. syncSize() 가 갱신한다. */
  readonly size: Readonly<GLSize>;
  /** 컨텍스트 로스트 상태. true 인 동안 draw 를 호출하지 않는다. */
  readonly lost: boolean;

  /** 프로그램 캐시. 같은 key 면 컴파일·링크를 재사용한다. */
  program(key: string, vertexSrc: string, fragmentSrc: string): WebGLProgram;
  /** 유니폼 로케이션 캐시. 없으면 null(에러 아님 — 최적화로 제거됐을 수 있다). */
  uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null;
  /** 풀스크린 삼각형 VAO(프래그먼트 셰이더 중심 렌더용). location 0 = vec2 aPos. */
  fullscreenVAO(): WebGLVertexArrayObject;
  /** 풀스크린 삼각형 1회 draw. */
  drawFullscreen(): void;

  /** 크기가 바뀌었으면 캔버스 버퍼·viewport 를 갱신하고 true 를 반환한다. */
  syncSize(): boolean;
  /** 리사이즈 대기 플래그(ResizeObserver 가 세운다). */
  readonly sizeDirty: boolean;

  onLost(cb: () => void): () => void;
  onRestored(cb: () => void): () => void;

  dispose(): void;
}

/** 디바이스 픽셀비 상한 — 초고DPR 기기에서 픽셀 수가 폭증하는 것을 막는다.
 *  🔴 **정본은 여기다.** Canvas2D 폴백(`fallback2d.ts`)도 이 값을 import 해서 쓴다 —
 *  둘이 따로 들고 있으면 한쪽만 고쳐진다(§3-X A-9 · `check-constants` R1). */
export const MAX_DPR = 2;

/** 풀스크린 "삼각형"(사각형 2장보다 픽셀 셰이더 호출이 적다) — 클립 공간 좌표. */
const FULLSCREEN_TRI = new Float32Array([-1, -1, 3, -1, -1, 3]);

function shaderTypeName(type: number, gl: WebGL2RenderingContext): string {
  return type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
}

/** 컴파일 에러를 사람이 읽을 수 있게 만든다 — 줄번호를 붙여 원본과 함께 던진다. */
function numberedSource(src: string): string {
  return src
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')} | ${line}`)
    .join('\n');
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL2: createShader 실패 (컨텍스트 로스트 가능성)');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? '(로그 없음)';
    gl.deleteShader(sh);
    throw new Error(
      `GLSL ${shaderTypeName(type, gl)} 셰이더 컴파일 실패\n${log}\n--- 소스 ---\n${numberedSource(src)}`,
    );
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(v);
    gl.deleteShader(f);
    throw new Error('WebGL2: createProgram 실패');
  }
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  // 링크 후에는 셰이더 객체를 붙잡아 둘 필요가 없다.
  gl.detachShader(prog, v);
  gl.detachShader(prog, f);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? '(로그 없음)';
    gl.deleteProgram(prog);
    throw new Error(`GLSL 프로그램 링크 실패\n${log}`);
  }
  return prog;
}

export function createGLContext(
  canvas: HTMLCanvasElement,
  attrs?: WebGLContextAttributes,
): GLContext | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      ...attrs,
    }) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null; // → 상위가 Canvas2D 폴백으로 내려간다(설계서 §10 L4)

  const g = gl;
  const programs = new Map<string, WebGLProgram>();
  const uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  const lostCbs = new Set<() => void>();
  const restoredCbs = new Set<() => void>();

  const size: GLSize = { width: 0, height: 0, dpr: 1, cssWidth: 0, cssHeight: 0 };
  const state = { lost: false, dirty: true, disposed: false };

  let vao: WebGLVertexArrayObject | null = null;
  let vbo: WebGLBuffer | null = null;

  const onContextLost = (e: Event): void => {
    e.preventDefault(); // preventDefault 를 해야 복구 이벤트가 온다
    state.lost = true;
    programs.clear(); // GPU 자원은 이미 무효다. 참조만 버린다
    vao = null;
    vbo = null;
    for (const cb of lostCbs) cb();
  };

  const onContextRestored = (): void => {
    state.lost = false;
    state.dirty = true;
    for (const cb of restoredCbs) cb();
  };

  canvas.addEventListener('webglcontextlost', onContextLost as EventListener, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  // --- DPR 대응 리사이즈. ResizeObserver 가 없으면 window.resize 로 내려간다 ---
  let ro: ResizeObserver | null = null;
  let winHandler: (() => void) | null = null;
  const markDirty = (): void => {
    state.dirty = true;
  };
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(markDirty);
    ro.observe(canvas);
  } else if (typeof window !== 'undefined') {
    winHandler = markDirty;
    window.addEventListener('resize', winHandler);
  }

  function syncSize(): boolean {
    if (state.disposed) return false;
    const dpr = Math.min(
      typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
      MAX_DPR,
    );
    const cssW = canvas.clientWidth || canvas.width || 1;
    const cssH = canvas.clientHeight || canvas.height || 1;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    state.dirty = false;
    if (w === size.width && h === size.height) return false;
    canvas.width = w;
    canvas.height = h;
    size.width = w;
    size.height = h;
    size.dpr = dpr;
    size.cssWidth = cssW;
    size.cssHeight = cssH;
    g.viewport(0, 0, w, h);
    return true;
  }

  function program(key: string, vertexSrc: string, fragmentSrc: string): WebGLProgram {
    const hit = programs.get(key);
    if (hit) return hit;
    const prog = linkProgram(g, vertexSrc, fragmentSrc);
    programs.set(key, prog);
    return prog;
  }

  function uniform(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let table = uniforms.get(prog);
    if (!table) {
      table = new Map<string, WebGLUniformLocation | null>();
      uniforms.set(prog, table);
    }
    if (table.has(name)) return table.get(name) ?? null;
    const loc = g.getUniformLocation(prog, name);
    table.set(name, loc);
    return loc;
  }

  function fullscreenVAO(): WebGLVertexArrayObject {
    if (vao) return vao;
    const created = g.createVertexArray();
    if (!created) throw new Error('WebGL2: createVertexArray 실패');
    const buf = g.createBuffer();
    if (!buf) throw new Error('WebGL2: createBuffer 실패');
    g.bindVertexArray(created);
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, FULLSCREEN_TRI, g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.bindVertexArray(null);
    vao = created;
    vbo = buf;
    return created;
  }

  function drawFullscreen(): void {
    g.bindVertexArray(fullscreenVAO());
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.bindVertexArray(null);
  }

  function dispose(): void {
    if (state.disposed) return;
    state.disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    if (ro) ro.disconnect();
    if (winHandler && typeof window !== 'undefined') window.removeEventListener('resize', winHandler);
    if (!state.lost) {
      for (const p of programs.values()) g.deleteProgram(p);
      if (vao) g.deleteVertexArray(vao);
      if (vbo) g.deleteBuffer(vbo);
    }
    programs.clear();
    lostCbs.clear();
    restoredCbs.clear();
    vao = null;
    vbo = null;
  }

  const ctx: GLContext = {
    canvas,
    gl: g,
    size,
    get lost() {
      return state.lost;
    },
    get sizeDirty() {
      return state.dirty;
    },
    program,
    uniform,
    fullscreenVAO,
    drawFullscreen,
    syncSize,
    onLost(cb) {
      lostCbs.add(cb);
      return () => lostCbs.delete(cb);
    },
    onRestored(cb) {
      restoredCbs.add(cb);
      return () => restoredCbs.delete(cb);
    },
    dispose,
  };

  syncSize();
  return ctx;
}

/** WebGL2 지원 여부만 저비용으로 물어본다(폴백 분기용). DOM 접근은 함수 안에서만. */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}
