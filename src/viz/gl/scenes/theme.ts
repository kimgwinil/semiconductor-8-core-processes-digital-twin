/**
 * 씬·폴백 공용 **테마 색 판독기**.
 *
 * 🔴 왜 필요한가 — 두 가지 결함을 동시에 막는다.
 *   ① **색이 셰이더에 구워져 있으면 라이트 테마에서 안 바뀐다.** 기존 8종은 `vec3(0.85,0.55,0.30)`
 *      처럼 색을 GLSL 리터럴로 들고 있어 `prefers-color-scheme` 을 따라가지 못한다. 신설 씬 5종은
 *      **CSS 토큰(`--viz-*`)에서 읽어 유니폼으로 넣는다** — 정본은 `ui/styles/index.css` 하나다.
 *   ② **정적 씬(`animated: false`)은 테마가 바뀌어도 다시 그리지 않는다.** `renderer.ts` 의 루프가
 *      「파라미터 무변경 + 크기 무변경」이면 `draw()` 를 건너뛰기 때문이다. 그래서 씬이 스스로
 *      `onColorSchemeChange()` 를 걸고 자기 `draw()` 를 한 번 더 부른다.
 *
 * 🔴 이 파일은 아무것도 import 하지 않는다(순수). `src/ui/**` 를 참조하지 않는다(§3 계층 규칙).
 * 🔴 모듈 최상위에서 document/window 를 만지지 않는다 — 전부 함수 안에서 방어적으로 접근한다.
 */

/** 0~1 정규화 RGB. GLSL `vec3` 와 같은 표현이다. */
export type Rgb3 = readonly [number, number, number];

export interface VizPalette {
  /**
   * 페이지 바탕 — `--bg`.
   *
   * 🔴 **새 색이 아니다.** `ui/styles/index.css` 에 이미 있는 토큰이고, 값을 여기서 정하지 않는다.
   *    쓰는 자리는 하나뿐이다 — **씬이 전면을 불투명하게 덮을 때의 그 베이스**.
   *    (배경을 칠하지 않는 씬은 이 필드를 쓸 일이 없다. 알파 0 으로 두면 CSS 배경이 그대로 비친다.)
   *
   * 🔴 왜 필요했나 — 2026-08-22 픽셀 실측에서 GL 7종·2D 3종이 라이트↔다크 차이 **정확히 0** 이었다.
   *    원인이 둘이었는데 그중 하나가 이것이다: 그 씬들이 `vec3(0.05,0.06,0.10)` 처럼
   *    **`--bg` 의 다크값을 손으로 근사해 구워 두고** 전면을 알파 1.0 으로 덮고 있었다
   *    (7종 실측: 0-255 로 (13,15,23)~(23,26,34) · 다크 `--bg` 는 (18,21,26)).
   *    즉 저자의 의도는 처음부터 「페이지 바탕」이었고, 토큰을 안 읽었을 뿐이다.
   */
  readonly bg: Rgb3;
  /** 본문·축·치수선 — `--ink`(= `getComputedStyle(canvas).color`). */
  readonly ink: Rgb3;
  /** 규격선(합격창 경계) — `--viz-spec`. */
  readonly spec: Rgb3;
  /** 참고선(판정 아님) — `--viz-info`. */
  readonly info: Rgb3;
  /** 데이터 계열 6색 — `--viz-series-1` … `-6`. */
  readonly series: readonly Rgb3[];
}

/**
 * 🔴 판독 실패 시의 기본값 — **다크 테마 값**이다(`index.css` 의 `@media (prefers-color-scheme: dark)`).
 *    jsdom·node 테스트처럼 `getComputedStyle` 이 빈 문자열을 주는 환경에서만 쓰인다.
 *    값을 여기서 지어내지 않았다 — 전부 `ui/styles/index.css` 원문에서 옮긴 것이고,
 *    한쪽만 바뀌면 화면이 갈리므로 **CSS 가 정본이고 여기는 최후 방어선**이다.
 */
const VIZ_BG_DEFAULT_HEX = '#12151a';
const VIZ_INK_DEFAULT_HEX = '#e9edf3';
const VIZ_SPEC_DEFAULT_HEX = '#ff7b72';
const VIZ_INFO_DEFAULT_HEX = '#9aa7b8';
const VIZ_SERIES_DEFAULT_HEX: readonly string[] = [
  '#6aa6f0', '#3fd3ad', '#b28cf0', '#e0b64a', '#f07ab0', '#a3d34c',
];

/** CSS 색 문자열 → 0~1 RGB. `#rgb` · `#rrggbb` · `rgb()` · `rgba()` 를 받는다. */
export function parseCssRgb(text: string, fallback: Rgb3): Rgb3 {
  const s = text.trim();
  if (!s) return fallback;
  if (s.charCodeAt(0) === 35 /* '#' */) {
    const hex = s.slice(1);
    const expand = hex.length === 3
      ? hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2)
      : hex;
    if (expand.length < 6) return fallback;
    const r = parseInt(expand.slice(0, 2), 16);
    const g = parseInt(expand.slice(2, 4), 16);
    const b = parseInt(expand.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r / 255, g / 255, b / 255];
    return fallback;
  }
  const m = /rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    const parts = (m[1] ?? '').split(/[,/\s]+/).filter(Boolean).map(Number);
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [(r as number) / 255, (g as number) / 255, (b as number) / 255];
    }
  }
  return fallback;
}

/** CSS 변수 하나를 읽는다. 실패하면 빈 문자열. */
function cssVar(style: CSSStyleDeclaration | null, name: string): string {
  if (!style) return '';
  try {
    return style.getPropertyValue(name) ?? '';
  } catch {
    return '';
  }
}

function computedOf(canvas: HTMLCanvasElement | null): CSSStyleDeclaration | null {
  if (!canvas) return null;
  try {
    return typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null;
  } catch {
    return null;
  }
}

/**
 * 캔버스에 적용된 실제 CSS 토큰을 읽어 팔레트를 만든다.
 * 🔴 **매 draw 마다 부른다.** 캐시하면 테마 전환 뒤 옛 색이 남는다 —
 *    호출 비용은 정적 씬에서 프레임당 한 번도 아니다(파라미터가 바뀔 때만 그린다).
 */
export function readVizPalette(canvas: HTMLCanvasElement | null): VizPalette {
  const style = computedOf(canvas);
  const inkDefault = parseCssRgb(VIZ_INK_DEFAULT_HEX, [1, 1, 1]);
  let inkText = '';
  try {
    inkText = style ? style.color : '';
  } catch {
    inkText = '';
  }
  return {
    bg: parseCssRgb(cssVar(style, '--bg'), parseCssRgb(VIZ_BG_DEFAULT_HEX, [0, 0, 0])),
    ink: parseCssRgb(inkText, inkDefault),
    spec: parseCssRgb(cssVar(style, '--viz-spec'), parseCssRgb(VIZ_SPEC_DEFAULT_HEX, inkDefault)),
    info: parseCssRgb(cssVar(style, '--viz-info'), parseCssRgb(VIZ_INFO_DEFAULT_HEX, inkDefault)),
    series: VIZ_SERIES_DEFAULT_HEX.map((hex, i) =>
      parseCssRgb(cssVar(style, `--viz-series-${i + 1}`), parseCssRgb(hex, inkDefault))),
  };
}

/**
 * `prefers-color-scheme` 이 바뀌면 콜백을 부른다. 해제 함수를 돌려준다.
 * 🔴 등록에 실패해도(구형 브라우저·테스트 환경) **던지지 않는다** — 씬이 죽는 것보다 낫다.
 */
export function onColorSchemeChange(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  const handler = (): void => cb();
  try {
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => {
        try { mq.removeEventListener('change', handler); } catch { /* 해제 실패는 삼킨다 */ }
      };
    }
    // 구형 Safari 경로
    const legacy = mq as unknown as { addListener?(h: () => void): void; removeListener?(h: () => void): void };
    if (typeof legacy.addListener === 'function') {
      legacy.addListener(handler);
      return () => {
        try { legacy.removeListener?.(handler); } catch { /* 해제 실패는 삼킨다 */ }
      };
    }
  } catch {
    /* 등록 실패 — 테마 추종만 포기한다 */
  }
  return () => {};
}

/* ---------------- Canvas2D 폴백용 선종 정본 ---------------- */
/**
 * 🔴 `viz/chart/common.ts` 의 `SPEC_DASH '11 4 2 4'` · `INFO_DASH '2 5'` · `DATA_DASH '6 5'` 를
 *    Canvas2D `setLineDash()` 배열로 옮긴 것이다. **값의 정본은 저쪽 문자열**이고 여기는 표기만 바꾼다
 *    (SVG 는 문자열, Canvas2D 는 배열이라 형이 다르다 — 이름을 달리해 `check-constants` R1 을 피한다).
 * 🔴 색만으로 구분하지 않는다(브랜드가이드 §3.1 원칙 2) — 규격선·참고선·데이터선의 **선종이 다르다**.
 */
export const VIZ2D_SPEC_DASH: readonly number[] = [11, 4, 2, 4];
export const VIZ2D_INFO_DASH: readonly number[] = [2, 5];
export const VIZ2D_DATA_DASH: readonly number[] = [6, 5];
export const VIZ2D_SPEC_WIDTH = 2.4;
export const VIZ2D_INFO_WIDTH = 1.8;
export const VIZ2D_DATA_WIDTH = 2.2;

/** 0~1 RGB → CSS 색 문자열. 폴백 drawer 가 유니폼 대신 이걸 쓴다. */
export function cssOf(v: Rgb3, alpha = 1): string {
  const q = (i: number): number => Math.round(Math.min(1, Math.max(0, v[i] ?? 0)) * 255);
  return alpha >= 1 ? `rgb(${q(0)},${q(1)},${q(2)})` : `rgba(${q(0)},${q(1)},${q(2)},${alpha})`;
}
