/**
 * 🔴 재질 알베도 텍스처 로더(`src/viz/gl/textures.ts`) 단위 검증.
 *
 * 왜 필요한가: 2026-08-20, 텍스처 5종이 `dist/` 로는 나가는데 화면에서 **0회 로드**됐다.
 * 「배선했다」는 주장은 게이트 통과만으로는 증명되지 않는다 — 여기서는 **GL 호출 자체를 기록해**
 * 플레이스홀더 즉시 바인딩 · REPEAT 래핑 · 캐시 · 참조 해제 · **로드 실패 시 생존**을 못박는다.
 *
 * 🔴 vitest 환경이 `node` 라 DOM 이 없다. `Image` 는 이 파일에서 직접 스텁으로 심는다
 *    (그래서 「DOM 없는 환경」 경로와 「이미지 도착」 경로를 둘 다 돌릴 수 있다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLContext } from '@/viz/gl/context';
import { TEX_MEAN_ALBEDO, acquireTextures, texMeanGLSL } from '@/viz/gl/textures';
import { FILM_GROWTH_FS } from '@/viz/gl/scenes/filmGrowth';
import { ION_BG_FS } from '@/viz/gl/scenes/ionTrajectory';
import { STEP_COVERAGE_FS } from '@/viz/gl/scenes/stepCoverage';

/* ---------------- 가짜 WebGL2 ---------------- */

interface GLCall {
  fn: string;
  args: unknown[];
}

const GL_ENUM = {
  TEXTURE_2D: 0x0de1,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  REPEAT: 0x2901,
  LINEAR: 0x2601,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  TEXTURE0: 0x84c0,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
} as const;

function makeFakeGL(): { gl: WebGL2RenderingContext; calls: GLCall[]; created: object[] } {
  const calls: GLCall[] = [];
  const created: object[] = [];
  const rec =
    (fn: string) =>
    (...args: unknown[]): void => {
      calls.push({ fn, args });
    };
  const gl = {
    ...GL_ENUM,
    createTexture: () => {
      const t = { id: created.length };
      created.push(t);
      calls.push({ fn: 'createTexture', args: [] });
      return t;
    },
    deleteTexture: rec('deleteTexture'),
    bindTexture: rec('bindTexture'),
    activeTexture: rec('activeTexture'),
    texImage2D: rec('texImage2D'),
    texParameteri: rec('texParameteri'),
    generateMipmap: rec('generateMipmap'),
    pixelStorei: rec('pixelStorei'),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, created };
}

/** renderer 가 쓰는 GLContext 중 textures.ts 가 실제로 만지는 부분만 흉내낸다. */
function makeFakeCtx(): {
  ctx: GLContext;
  calls: GLCall[];
  created: object[];
  loseContext(): void;
  restoreContext(): void;
} {
  const { gl, calls, created } = makeFakeGL();
  const lostCbs = new Set<() => void>();
  const state = { lost: false };
  const ctx = {
    gl,
    get lost() {
      return state.lost;
    },
    onLost(cb: () => void) {
      lostCbs.add(cb);
      return () => lostCbs.delete(cb);
    },
  } as unknown as GLContext;
  return {
    ctx,
    calls,
    created,
    loseContext() {
      state.lost = true;
      for (const cb of lostCbs) cb();
    },
    // renderer 는 복구 시 lost 를 내리고 scene.init 을 **dispose 없이** 다시 부른다.
    restoreContext() {
      state.lost = false;
    },
  };
}

/* ---------------- Image 스텁 ---------------- */

interface StubImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

/** `outcome` 대로 비동기 응답하는 Image 스텁을 심고, 요청된 URL 을 모아 준다. */
function installImageStub(outcome: 'load' | 'error'): { urls: string[]; restore(): void } {
  const urls: string[] = [];
  const previous = (globalThis as { Image?: unknown }).Image;
  class FakeImage implements StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = '';
    get src(): string {
      return this.#src;
    }
    set src(v: string) {
      this.#src = v;
      urls.push(v);
      setTimeout(() => {
        if (outcome === 'load') this.onload?.();
        else this.onerror?.();
      }, 0);
    }
  }
  (globalThis as { Image?: unknown }).Image = FakeImage;
  return {
    urls,
    restore() {
      if (previous === undefined) delete (globalThis as { Image?: unknown }).Image;
      else (globalThis as { Image?: unknown }).Image = previous;
    },
  };
}

/** 매크로태스크 1회 — Image 스텁의 setTimeout 과 그 뒤 프로미스 체인을 흘려보낸다. */
const settle = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

function paramValue(calls: GLCall[], pname: number): unknown {
  const hit = calls.filter((c) => c.fn === 'texParameteri' && c.args[1] === pname).pop();
  return hit?.args[2];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('플레이스홀더 — 텍스처가 도착하기 전에도 씬이 그려진다', () => {
  it('acquire 즉시 1×1 텍스처가 만들어지고 평균 알베도 색이 올라간다', () => {
    const { ctx, calls, created } = makeFakeCtx();
    const set = acquireTextures(ctx, ['silicon-surface']);

    expect(created).toHaveLength(1);
    const upload = calls.find((c) => c.fn === 'texImage2D');
    expect(upload).toBeDefined();
    // (target, level, internalformat, width, height, border, format, type, pixels)
    expect(upload?.args[3]).toBe(1);
    expect(upload?.args[4]).toBe(1);
    const px = upload?.args[8] as Uint8Array;
    const [r, g, b] = TEX_MEAN_ALBEDO['silicon-surface'];
    expect(Array.from(px)).toEqual([
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
      255,
    ]);
    set.release();
  });

  it('타일러블 전제이므로 래핑은 REPEAT 다', () => {
    const { ctx, calls } = makeFakeCtx();
    const set = acquireTextures(ctx, ['metal']);
    expect(paramValue(calls, GL_ENUM.TEXTURE_WRAP_S)).toBe(GL_ENUM.REPEAT);
    expect(paramValue(calls, GL_ENUM.TEXTURE_WRAP_T)).toBe(GL_ENUM.REPEAT);
    set.release();
  });

  it('🔴 밉맵이 아직 없으므로 MIN_FILTER 는 LINEAR 다 — MIPMAP 필터면 incomplete 로 검게 나온다', () => {
    const { ctx, calls } = makeFakeCtx();
    const set = acquireTextures(ctx, ['oxide']);
    expect(paramValue(calls, GL_ENUM.TEXTURE_MIN_FILTER)).toBe(GL_ENUM.LINEAR);
    set.release();
  });
});

describe('비동기 로드', () => {
  it('base 를 붙여 assets/tex/{name}.webp 를 요청한다', async () => {
    const stub = installImageStub('error');
    try {
      const { ctx } = makeFakeCtx();
      const set = acquireTextures(ctx, ['silicon-surface', 'metal']);
      await settle();
      expect(stub.urls).toHaveLength(2);
      for (const url of stub.urls) {
        expect(url.endsWith('assets/tex/silicon-surface.webp') || url.endsWith('assets/tex/metal.webp')).toBe(true);
        expect(url.startsWith(import.meta.env?.BASE_URL ?? '/')).toBe(true);
      }
      set.release();
    } finally {
      stub.restore();
    }
  });

  it('도착하면 같은 텍스처 객체에 덮어쓰고 밉맵을 만든 뒤 MIN_FILTER 를 올린다', async () => {
    const stub = installImageStub('load');
    try {
      const { ctx, calls, created } = makeFakeCtx();
      const set = acquireTextures(ctx, ['metal']);
      await settle();

      expect(set.loadedCount).toBe(1);
      expect(created).toHaveLength(1); // 텍스처 객체는 새로 만들지 않는다(핸들 유지)
      expect(calls.filter((c) => c.fn === 'texImage2D')).toHaveLength(2); // 1×1 → 실제 이미지
      expect(calls.some((c) => c.fn === 'generateMipmap')).toBe(true);
      expect(paramValue(calls, GL_ENUM.TEXTURE_MIN_FILTER)).toBe(GL_ENUM.LINEAR_MIPMAP_LINEAR);
      // 좌표계 규약: 업로드 동안만 FLIP_Y 를 켜고 되돌린다
      const flips = calls.filter((c) => c.fn === 'pixelStorei' && c.args[0] === GL_ENUM.UNPACK_FLIP_Y_WEBGL);
      expect(flips.map((c) => c.args[1])).toEqual([true, false]);
      set.release();
    } finally {
      stub.restore();
    }
  });

  it('🔴 로드가 실패해도 씬은 죽지 않는다 — 플레이스홀더가 남고 경고만 1줄 나간다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = installImageStub('error');
    try {
      const { ctx, calls } = makeFakeCtx();
      const set = acquireTextures(ctx, ['photoresist']);
      await settle();

      expect(set.loadedCount).toBe(0);
      expect(set.errors).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(1);
      // 실제 이미지는 안 올라갔지만 1×1 은 그대로다 → bind 는 여전히 성공한다
      expect(calls.filter((c) => c.fn === 'texImage2D')).toHaveLength(1);
      expect(set.bind(0, 'photoresist')).toBe(true);
      set.release();
    } finally {
      stub.restore();
    }
  });

  it('DOM 이 없는 환경(Image 생성자 없음)에서도 던지지 않고 플레이스홀더로 산다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx } = makeFakeCtx();
    const set = acquireTextures(ctx, ['slurry-pad']);
    await settle();
    expect(set.loadedCount).toBe(0);
    expect(set.errors[0]).toContain('DOM 없는 환경');
    expect(warn).toHaveBeenCalledTimes(1);
    set.release();
  });
});

describe('캐시와 해제 — GLContext 수명 동안 공유하고 마지막 참조에서만 지운다', () => {
  it('같은 컨텍스트에서 같은 텍스처는 한 번만 올린다', () => {
    const { ctx, created } = makeFakeCtx();
    const a = acquireTextures(ctx, ['silicon-surface', 'metal']);
    const b = acquireTextures(ctx, ['silicon-surface']);
    expect(created).toHaveLength(2); // silicon-surface 는 재사용
    a.release();
    b.release();
  });

  it('참조가 남아 있으면 deleteTexture 를 부르지 않는다', () => {
    const { ctx, calls } = makeFakeCtx();
    const a = acquireTextures(ctx, ['silicon-surface']);
    const b = acquireTextures(ctx, ['silicon-surface']);
    a.release();
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(0);
    b.release();
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(1);
  });

  it('release 를 두 번 불러도 두 번 지우지 않는다', () => {
    const { ctx, calls } = makeFakeCtx();
    const set = acquireTextures(ctx, ['oxide']);
    set.release();
    set.release();
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(1);
  });

  it('컨텍스트가 다르면 캐시를 공유하지 않는다', () => {
    const one = makeFakeCtx();
    const two = makeFakeCtx();
    const a = acquireTextures(one.ctx, ['metal']);
    const b = acquireTextures(two.ctx, ['metal']);
    expect(one.created).toHaveLength(1);
    expect(two.created).toHaveLength(1);
    a.release();
    b.release();
  });
});

describe('컨텍스트 로스트', () => {
  it('로스트 후에는 bind 가 죽은 핸들을 걸지 않고, deleteTexture 도 부르지 않는다', () => {
    const { ctx, calls, loseContext } = makeFakeCtx();
    const set = acquireTextures(ctx, ['silicon-surface']);
    loseContext();
    expect(set.bind(0, 'silicon-surface')).toBe(false);
    set.release();
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(0);
  });

  it('🔴 로스트→복구 뒤 init 이 다시 불려도 옛 핸들이 새 슬롯을 지우지 않는다', () => {
    // 이 테스트가 실제 결함을 잡았다: 옛 TextureSet 이 **이름만** 들고 있으면
    // release 가 복구 후 새로 만들어진 슬롯의 참조를 깎아 화면에서 텍스처가 사라진다.
    const { ctx, calls, created, loseContext, restoreContext } = makeFakeCtx();
    const first = acquireTextures(ctx, ['metal']);
    loseContext();
    restoreContext();
    const second = acquireTextures(ctx, ['metal']); // renderer 가 다시 부르는 scene.init
    expect(created).toHaveLength(2); // 로스트로 버려진 슬롯 + 새 슬롯

    expect(first.bind(0, 'metal')).toBe(false); // 옛 핸들은 죽은 슬롯을 걸지 않는다
    first.release(); // 옛 핸들의 해제는 새 슬롯을 건드리면 안 된다
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(0);

    expect(second.bind(0, 'metal')).toBe(true);
    second.release();
    expect(calls.filter((c) => c.fn === 'deleteTexture')).toHaveLength(1);
  });
});

describe('바인딩과 GLSL 리터럴', () => {
  it('요청한 유닛으로 activeTexture · bindTexture 한다', () => {
    const { ctx, calls } = makeFakeCtx();
    const set = acquireTextures(ctx, ['oxide']);
    calls.length = 0;
    expect(set.bind(2, 'oxide')).toBe(true);
    expect(calls[0]).toEqual({ fn: 'activeTexture', args: [GL_ENUM.TEXTURE0 + 2] });
    expect(calls[1]?.fn).toBe('bindTexture');
    set.release();
  });

  it('확보하지 않은 이름은 바인딩하지 않는다', () => {
    const { ctx } = makeFakeCtx();
    const set = acquireTextures(ctx, ['oxide']);
    expect(set.bind(0, 'slurry-pad')).toBe(false);
    set.release();
  });

  it('texMeanGLSL 은 셰이더가 그대로 쓸 수 있는 vec3 리터럴을 낸다', () => {
    expect(texMeanGLSL('silicon-surface')).toBe('vec3(0.2445, 0.2876, 0.3536)');
    // 평균 알베도로 나누면 무늬 배율의 평균이 1.0 이 된다 — 이 전제가 albedoDetail 의 근거다.
    for (const name of Object.keys(TEX_MEAN_ALBEDO) as (keyof typeof TEX_MEAN_ALBEDO)[]) {
      for (const c of TEX_MEAN_ALBEDO[name]) {
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ---------------- 씬 셰이더 구조 검증 ---------------- */

/**
 * 🔴 GLSL 은 브라우저 없이 컴파일할 수 없다. 그래서 **컴파일 대신 구조**를 못박는다.
 *    이 프로젝트가 겪은 결함이 정확히 「선언은 했는데 쓰는 곳이 없다」이므로,
 *    **선언된 샘플러가 실제로 샘플링되는지**를 기계로 확인한다.
 *
 * 🔴 부분문자열 검사 금지 — `uniform sampler2D <이름>;` 선언을 정규식으로 **파싱**해서
 *    이름 목록을 뽑고, 그 이름으로 `texture(<이름>,` 호출을 찾는다(경계 문자까지 본다).
 */
const SCENE_SHADERS: ReadonlyArray<{ id: string; src: string; samplers: readonly string[] }> = [
  { id: 'filmGrowth', src: FILM_GROWTH_FS, samplers: ['uSubstrateTex', 'uOxideTex', 'uMetalTex'] },
  { id: 'ionTrajectory(bg)', src: ION_BG_FS, samplers: ['uSubstrateTex'] },
  { id: 'stepCoverage', src: STEP_COVERAGE_FS, samplers: ['uSubstrateTex', 'uFilmTex'] },
];

function declaredSamplers(src: string): string[] {
  return [...src.matchAll(/uniform\s+sampler2D\s+([A-Za-z_]\w*)\s*;/g)].map((m) => m[1] as string);
}

describe('씬 셰이더 — 샘플러가 선언만 되고 안 쓰이는 일이 없어야 한다', () => {
  for (const scene of SCENE_SHADERS) {
    it(`${scene.id}: 선언된 샘플러가 기대 목록과 정확히 같다`, () => {
      expect(declaredSamplers(scene.src).sort()).toEqual([...scene.samplers].sort());
    });

    it(`${scene.id}: 선언된 샘플러를 전부 texture() 로 실제 샘플링한다`, () => {
      for (const name of declaredSamplers(scene.src)) {
        const used = new RegExp(`texture\\s*\\(\\s*${name}\\s*,`).test(scene.src);
        expect(used, `${scene.id}: '${name}' 가 선언만 되고 샘플링되지 않는다`).toBe(true);
      }
    });

    it(`${scene.id}: albedoDetail 을 쓰면 정의가 함께 들어 있다`, () => {
      if (!/\balbedoDetail\s*\(/.test(scene.src)) return;
      expect(/vec3\s+albedoDetail\s*\(\s*vec3\s+\w+\s*,\s*vec3\s+\w+\s*\)/.test(scene.src)).toBe(true);
    });

    it(`${scene.id}: 평균 알베도 상수가 리터럴로 박혀 있고 중괄호가 맞는다`, () => {
      expect(scene.src).toContain(texMeanGLSL('silicon-surface'));
      const open = (scene.src.match(/\{/g) ?? []).length;
      const close = (scene.src.match(/\}/g) ?? []).length;
      expect(open).toBe(close);
    });

    it(`${scene.id}: #version 300 es 는 맨 앞에 딱 한 번만 나온다`, () => {
      expect(scene.src.startsWith('#version 300 es\n')).toBe(true);
      expect((scene.src.match(/#version/g) ?? []).length).toBe(1);
    });
  }
});
