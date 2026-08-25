/**
 * 씬·폴백 공용 **모션 접근성 판독기**(`prefers-reduced-motion`).
 *
 * 🔴 왜 필요한가 — 움직임에 민감한 사용자(전정기능 장애·편두통·발작 이력)에게 자동 재생되는
 *    애니메이션은 **접근성 장벽**이다. OS 설정 `prefers-reduced-motion: reduce` 를 켠 사용자에게는
 *    움직임을 멈춘다.
 *
 * 🔴 **멈추되 정보를 지우지 않는다.** 감속 모드에서 씬은 `REDUCED_MOTION_TIME` 한 시각으로
 *    **고정 렌더**된다 — 그리기를 건너뛰는 것이 아니다. 그래서 움직이던 요소도 그 자리에
 *    그대로 남고, 파라미터·테마가 바뀌면 여전히 다시 그린다.
 *
 * 🔴 `REDUCED_MOTION_TIME = 0` 인 이유: 이 저장소의 애니메이션은 전부 위상(`fract(t·rate + off)`)
 *    이나 잡음 위상이라 **t 는 상태가 아니라 위상**이다. 어느 t 를 골라도 정보량이 같고,
 *    0 은 「루프가 아직 안 돈 상태」라 계측(테마 프로브·단위테스트)에서도 재현 가능한 유일한 값이다.
 *    🔴 마커 위상을 `k/N` 이 아니라 `(k+0.5)/N` 으로 흩는 씬이 있는 것은 이 때문이다 —
 *       t = 0 에서 어느 마커도 진폭 0 이 되지 않게 해서 **감속 모드에서 정보가 사라지지 않게** 한다.
 *
 * 🔴 이 파일은 아무것도 import 하지 않는다(순수). 모듈 최상위에서 document/window 를 만지지 않는다 —
 *    전부 함수 안에서 방어적으로 접근한다(`scenes/theme.ts` 와 같은 규율).
 */

/** 감속 모드에서 모든 씬이 그려지는 고정 시각 [s]. */
export const REDUCED_MOTION_TIME = 0;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 지금 감속 모드인가. 판독할 수 없는 환경(node·구형 브라우저)에서는 `false`(= 종전 동작). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * `prefers-reduced-motion` 이 바뀌면 콜백을 부른다. 해제 함수를 돌려준다.
 * 🔴 등록에 실패해도(구형 브라우저·테스트 환경) **던지지 않는다** — 씬이 죽는 것보다 낫다.
 *    (`scenes/theme.ts` 의 `onColorSchemeChange` 와 같은 구조다. 두 판독기는 보는 미디어 질의가
 *     다를 뿐이라 형태를 일부러 같게 뒀다.)
 */
export function onReducedMotionChange(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia(REDUCED_MOTION_QUERY);
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
    /* 등록 실패 — 감속 추종만 포기한다 */
  }
  return () => {};
}
