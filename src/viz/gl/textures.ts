/**
 * 재질 알베도 텍스처 로더 · GLContext 수명 캐시.
 *
 * 🔴 설계서 §6-5 — 자산은 `public/assets/tex/{name}.webp` · 512×512 타일러블 · **알베도만**이다.
 *    「명암·음영을 굽지 않는다(셰이더가 조명한다)」가 확정 원칙이므로, 이 모듈은 **텍셀만** 넘기고
 *    조명·경계선·마스크는 씬 셰이더가 그대로 얹는다.
 * 🔴 이 파일도 동적 import 대상 경로에 있다. **모듈 최상위에서 document/window/Image 를 만지지 않는다.**
 *    (DOM 접근은 전부 함수 본문 안, 그것도 `typeof` 가드 뒤에서만 일어난다.)
 * 🔴 계층 규칙(§3) — src/viz/** 는 src/ui/** 를 import 하지 않는다. 여기서는 ./context 만 참조한다.
 *
 * ── 비동기 수명 ────────────────────────────────────────────────────────────
 * WebP 는 네트워크에서 온다. 도착 전 프레임도 정상적으로 그려져야 하므로
 * **1×1 플레이스홀더를 즉시 만들어 바인딩**하고, 이미지가 도착하면 **같은 WebGLTexture 객체에**
 * 덮어쓴다(핸들이 바뀌지 않으므로 씬은 재바인딩을 신경 쓸 필요가 없다).
 * 플레이스홀더 색은 그 텍스처의 **평균 알베도**다 — 그래서 도착 전에는 「무늬 없는 같은 재질」로
 * 보이고, 도착하면 무늬만 얹힌다. 로드가 실패해도 이 상태로 남는다(콘솔 경고 1회 + 씬은 계속 산다).
 */
import type { GLContext } from './context';

export type TextureName =
  | 'silicon-surface'
  | 'oxide'
  | 'photoresist'
  | 'metal'
  | 'slurry-pad';

/**
 * 각 텍스처의 **평균 알베도**(0~1, sRGB 바이트를 255 로 나눈 값).
 *
 * 🔴 이 값은 추정이 아니라 **납품 `.webp` 를 디코드해 실측**한 것이다(512×512 전 픽셀 평균).
 *    재현: `python3 -c "from PIL import Image; import numpy as np;
 *    print(np.asarray(Image.open('public/assets/tex/oxide.webp').convert('RGB')).reshape(-1,3).mean(0)/255)"`
 *
 * 쓰임 2가지 —
 *  ① 1×1 플레이스홀더 색 (도착 전 프레임이 같은 재질로 보이게)
 *  ② 셰이더에서 텍셀을 이 값으로 나눠 **평균 1.0 인 「무늬 배율」**을 뽑는 기준 (albedoDetail)
 *
 * 실측 결과 5종 모두 R·G·B 표준편차가 서로 같다 — 즉 자산은 「기저색 × 미세 명도 변화(±15 % 안팎)」
 * 구조다. §6-5 의 「알베도만」이 실제로 지켜졌다는 뜻이고, 그래서 ②가 성립한다.
 *
 * 🔴 명세 §5 의 기저 토큰과 대조: `silicon-surface`(`--xs-si` #3f4a5a) · `oxide`(`--xs-oxide` #a5b4fc) ·
 *    `photoresist`(`--xs-resist` #f0abfc) · `metal`(`--xs-metal-hi` #64748b) 는 실측과 일치한다.
 *    `slurry-pad` 만 토큰(`--xs-ceramic` #cbd5e1 = 0.796/0.835/0.882)보다 실측이 약 6 % 밝다 —
 *    **실측을 정본으로 쓴다**(나눗셈 기준이 어긋나면 무늬 배율의 평균이 1.0 이 아니게 된다).
 */
export const TEX_MEAN_ALBEDO: Readonly<Record<TextureName, readonly [number, number, number]>> = {
  'silicon-surface': [0.2445, 0.2876, 0.3536],
  oxide: [0.6439, 0.7027, 0.985],
  photoresist: [0.941, 0.6705, 0.9878],
  metal: [0.3903, 0.4531, 0.5433],
  'slurry-pad': [0.847, 0.8836, 0.933],
};

/** 평균 알베도를 GLSL `vec3(...)` 리터럴로 찍는다 — 씬마다 숫자를 손으로 옮겨 적지 않게. */
export function texMeanGLSL(name: TextureName): string {
  const c = TEX_MEAN_ALBEDO[name];
  return `vec3(${c[0].toFixed(4)}, ${c[1].toFixed(4)}, ${c[2].toFixed(4)})`;
}

/**
 * 씬 셰이더가 공유하는 알베도 헬퍼.
 *
 * 자산에는 **색조가 아니라 무늬**가 들어 있다(위 TEX_MEAN_ALBEDO 주석 참조). 평균색으로 나누면
 * 평균 1.0 인 순수 무늬 배율이 남고, 재질의 색·명암·조명은 §6-5 대로 셰이더가 준다.
 * 그래서 텍스처가 씬의 색 설계(예: filmGrowth 의 uTint 로 산화막↔금속막 구분)를 덮어쓰지 않는다.
 */
export const ALBEDO_GLSL = `
vec3 albedoDetail(vec3 texel, vec3 meanAlbedo) {
  return texel / max(meanAlbedo, vec3(1e-3));
}
`;

/**
 * 🔴 자산 디렉터리. A-USE 게이트(check-assets)가 `src/**` 에서 이 경로 세그먼트를 찾아
 *    「출하되는데 아무도 안 쓰는 자산」을 판정한다. 문자열을 쪼개면 게이트가 못 본다.
 */
const TEX_DIR = 'assets/tex/';

/** GitHub Pages 배포에서 base 가 바뀐다 — 장비 이미지(`EquipmentSection`·`content/loader`)와 같은 방식. */
function texUrl(name: TextureName): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `${base}${TEX_DIR}${name}.webp`;
}

interface Slot {
  readonly name: TextureName;
  readonly texture: WebGLTexture;
  /** 이 슬롯을 쥐고 있는 TextureSet 수. 0 이 되면 GPU 자원을 해제한다. */
  refs: number;
  /** 실제 WebP 가 올라왔는가(진단용). false 면 1×1 플레이스홀더 상태다. */
  loaded: boolean;
  /** 로드 실패 사유. 실패해도 texture 는 플레이스홀더로 계속 유효하다. */
  error: string | null;
}

interface ContextCache {
  readonly slots: Map<TextureName, Slot>;
  /** 컨텍스트 로스트 구독 해제 */
  offLost: () => void;
}

/**
 * GLContext 수명 캐시. 같은 컨텍스트에서 같은 텍스처를 두 번 올리지 않는다.
 * WeakMap 이라 컨텍스트가 버려지면 항목도 따라 사라진다(캐시가 컨텍스트를 붙잡지 않는다).
 */
const CACHES = new WeakMap<GLContext, ContextCache>();

function cacheFor(ctx: GLContext): ContextCache {
  const hit = CACHES.get(ctx);
  if (hit) return hit;
  const cache: ContextCache = { slots: new Map(), offLost: () => {} };
  // 컨텍스트가 날아가면 GPU 텍스처는 이미 무효다. deleteTexture 를 부르면 안 되고, 참조만 버린다.
  // 이후 renderer 가 scene.init 을 다시 부르면 여기서 새 슬롯이 만들어진다(재로드).
  cache.offLost = ctx.onLost(() => {
    cache.slots.clear();
  });
  CACHES.set(ctx, cache);
  return cache;
}

/** 1×1 플레이스홀더 텍스처를 만든다. 밉맵이 아직 없으므로 MIN_FILTER 는 LINEAR 여야 한다. */
function createSlot(ctx: GLContext, name: TextureName): Slot {
  const gl = ctx.gl;
  const texture = gl.createTexture();
  if (!texture) throw new Error(`textures: createTexture 실패 (${name})`);
  const [r, g, b] = TEX_MEAN_ALBEDO[name];
  const px = new Uint8Array([
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255),
    255,
  ]);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // 자산은 타일러블이 전제다(§6-5) → REPEAT. 512×512 POT 이라 WebGL1 제약에도 안전하다.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // 🔴 1×1 단계에서 MIPMAP 필터를 걸면 밉 체인이 없어 텍스처가 incomplete → 검게 그려진다.
  //    실제 이미지가 올라오고 generateMipmap 을 한 뒤에 LINEAR_MIPMAP_LINEAR 로 올린다.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { name, texture, refs: 0, loaded: false, error: null };
}

/** WebP 1장을 읽는다. DOM 이 없는 환경(테스트·워커)에서는 조용히 거절한다 — 씬은 플레이스홀더로 산다. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image 생성자가 없다(DOM 없는 환경) — 플레이스홀더를 유지한다'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`텍스처 로드 실패: ${url}`));
    img.src = url;
  });
}

/** 도착한 이미지를 **같은 텍스처 객체에** 덮어쓰고 밉맵을 만든다. */
function upload(ctx: GLContext, slot: Slot, img: TexImageSource): void {
  const gl = ctx.gl;
  gl.bindTexture(gl.TEXTURE_2D, slot.texture);
  // vUv 는 아래가 0 인 좌표계다(common.ts FULLSCREEN_VS). 이미지 원점은 좌상단이라 뒤집어 맞춘다.
  // 타일러블 자산이라 육안 차이는 없지만, 좌표계 규약을 코드에 남겨 둔다.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function startLoad(ctx: GLContext, cache: ContextCache, slot: Slot): void {
  loadImage(texUrl(slot.name)).then(
    (img) => {
      // 그 사이에 컨텍스트가 날아갔거나 슬롯이 버려졌으면 올리지 않는다.
      if (ctx.lost) return;
      if (cache.slots.get(slot.name) !== slot) return;
      try {
        upload(ctx, slot, img);
        slot.loaded = true;
        slot.error = null;
      } catch (err) {
        slot.error = err instanceof Error ? err.message : String(err);
        warnOnce(slot);
      }
    },
    (err: unknown) => {
      slot.error = err instanceof Error ? err.message : String(err);
      warnOnce(slot);
    },
  );
}

/** 실패는 씬을 죽이지 않는다. 조용히 넘어가면 원인을 못 찾으므로 경고 1줄은 남긴다. */
function warnOnce(slot: Slot): void {
  if (typeof console === 'undefined') return;
  console.warn(
    `[viz] 텍스처 '${slot.name}' 를 쓰지 못했다 — 평균 알베도 플레이스홀더로 계속 그린다. ` +
      `사유: ${slot.error ?? '(미상)'}`,
  );
}

/**
 * 씬이 쥐는 텍스처 묶음.
 *
 * 🔴 자기가 확보한 **슬롯 객체 자체**를 기억하고, 쓸 때마다 캐시의 현재 슬롯과 **동일성**을 확인한다.
 *    이름만 들고 있으면 컨텍스트 로스트 뒤 새로 만들어진 슬롯을 옛 핸들이 건드린다 —
 *    실제로 단위 테스트가 그 결함을 잡았다(옛 핸들의 release 가 새 슬롯을 지웠다).
 */
export interface TextureSet {
  /**
   * 텍스처 유닛에 바인딩한다. 샘플러 유니폼에는 같은 `unit` 번호를 `uniform1i` 로 넣어야 한다.
   * @returns 실제로 바인딩했는가(컨텍스트 로스트 직후에는 false).
   */
  bind(unit: number, name: TextureName): boolean;
  /** 실제 WebP 가 올라온 텍스처 수(진단·테스트용). 도착 전에는 0 이다. */
  readonly loadedCount: number;
  /** 마지막 로드 실패 사유들(진단용). 실패해도 씬은 계속 그려진다. */
  readonly errors: readonly string[];
  /** 참조를 놓는다. 마지막 참조가 놓이면 GPU 텍스처를 해제한다. 두 번 불러도 안전하다. */
  release(): void;
}

/**
 * 텍스처를 확보한다. 같은 GLContext 안에서는 이미 올라온 것을 재사용한다.
 *
 * 🔴 renderer 는 컨텍스트 복구 시 `scene.init` 을 **dispose 없이 다시** 부른다.
 *    그때는 로스트 훅이 캐시를 이미 비웠으므로 참조 수가 새지 않는다(새 슬롯 · refs 1 부터 시작).
 */
export function acquireTextures(ctx: GLContext, names: readonly TextureName[]): TextureSet {
  const cache = cacheFor(ctx);
  const held = new Map<TextureName, Slot>();

  for (const name of names) {
    if (held.has(name)) continue; // 같은 이름을 두 번 넘겨도 참조는 1이다
    let slot = cache.slots.get(name);
    if (!slot) {
      slot = createSlot(ctx, name);
      cache.slots.set(name, slot);
      startLoad(ctx, cache, slot);
    }
    slot.refs++;
    held.set(name, slot);
  }

  let released = false;

  /** 아직 캐시의 현재 슬롯인 것만. 로스트로 갈아치워진 옛 슬롯은 제외된다. */
  const liveSlots = (): Slot[] => {
    const out: Slot[] = [];
    for (const [name, slot] of held) {
      if (cache.slots.get(name) === slot) out.push(slot);
    }
    return out;
  };

  return {
    bind(unit, name) {
      if (released || ctx.lost) return false;
      const slot = held.get(name);
      if (!slot || cache.slots.get(name) !== slot) return false; // 확보 안 했거나 갈아치워진 슬롯
      const gl = ctx.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      return true;
    },
    get loadedCount() {
      return liveSlots().filter((s) => s.loaded).length;
    },
    get errors() {
      return liveSlots()
        .map((s) => s.error)
        .filter((e): e is string => e !== null);
    },
    release() {
      if (released) return;
      released = true;
      for (const [name, slot] of held) {
        // 로스트로 캐시에서 빠졌거나 다른 슬롯으로 갈아치워졌으면 내 소관이 아니다.
        if (cache.slots.get(name) !== slot) continue;
        slot.refs--;
        if (slot.refs > 0) continue;
        cache.slots.delete(name);
        // 로스트 상태에서 deleteTexture 를 부르는 것은 무의미하다(자원이 이미 없다).
        if (!ctx.lost) ctx.gl.deleteTexture(slot.texture);
      }
      held.clear();
      if (cache.slots.size === 0) {
        cache.offLost();
        CACHES.delete(ctx);
      }
    },
  };
}
