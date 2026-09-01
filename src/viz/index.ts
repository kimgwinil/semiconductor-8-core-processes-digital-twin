/**
 * viz 배럴 — 시각화 계층 공개 API.
 *
 * 🔴 씬 4종은 **정적으로 import 하지 않는다.** `loadScene(id)` 안의 동적 import 로만 들어오므로
 *    각 씬이 별도 청크가 되고 초기 청크에 들어가지 않는다(설계서 §4 코드분할 경계 · F4).
 * 🔴 계층 규칙(§3): src/viz/** 는 src/ui/** 를 import 하지 않는다.
 *
 * 참고: 차트·오버레이는 React 컴포넌트다. 초기 청크를 더 얇게 하려면 ui 쪽에서
 * `@/viz/chart/LineChart` 처럼 하위 경로로 직접 import 하면 된다.
 */
import type { Scene } from './gl/renderer';

export type SceneId = 'filmGrowth' | 'plasma' | 'ionTrajectory' | 'polishProfile' | 'stepCoverage' | 'aldCycle'
  | 'crystalGrowth' | 'ingotSlicing' | 'aerialImage'
  | 'probeScrub' | 'waferMap' | 'packageThermal' | 'moistureSoak' | 'shearTest';

/* 🔴 2026-08-22 신설 5종 — **eds·packaging 은 8공정 중 화면이 하나도 없는 유일한 2공정이었다.**
   학습자가 숫자만 봤다. 게이트 점수가 아니라 그것이 이 5종을 만든 이유다(DSN 세션6 §E'·§P).
     eds/lab-advanced   : `probeScrub`(침 끝–패드 µm) ＋ `waferMap`(웨이퍼–다이 mm) **병치**
     packaging/lab-basic: `packageThermal` · applied: `moistureSoak` · advanced: `shearTest`
   ✅ 5종 전부 Canvas2D 폴백 drawer 를 갖는다 — 이제 13종 전부다.

   🔴🔴 **이 주석은 배열 「밖」에 있어야 한다.** `scripts/check-direction.mjs` 의 `SCENE_IDS` 파서는
   배열 본문에서 `'…'` 를 훑는데, 배열 **안**에 여러 줄 블록주석(슬래시-별표 형식)이 있으면 주석 속 백틱 문자열까지
   씬 이름으로 읽혀 목록이 깨진다 — 실측에서 신설 5종이 전부 `sceneImplemented=false` 로 잡혀
   **V5 오탐 5건 + eds·packaging V1 「읽는 출력 없음」이라는 거짓 보고**가 났다.
   배열 안에는 `//` 줄주석만 쓴다. */
export const SCENE_IDS: readonly SceneId[] = [
  'filmGrowth',
  'plasma',
  'ionTrajectory',
  'polishProfile',
  // stepCoverage 는 트렌치 형상 입력을 가진 실습이 생길 때까지 실험용 로더로만 보존한다.
  'aldCycle',
  // 🔴 2026-08-21 신설 — wafer 3칸 · photo 3칸(DSN 요구명세 §1-A·§1-B).
  //    ✅ Canvas2D 폴백도 등재 완료(2026-08-22) — 8종 전부 폴백 drawer 를 갖는다.
  'crystalGrowth',
  'ingotSlicing',
  'aerialImage',
  // 2026-08-22 신설 5종 — 사유는 배열 바로 위 주석 참조.
  'probeScrub',
  'waferMap',
  'packageThermal',
  'moistureSoak',
  'shearTest',
];

export function isSceneId(v: string): v is SceneId {
  return (SCENE_IDS as readonly string[]).includes(v);
}

/** 씬 모듈은 `createScene(): Scene` 하나만 내보낸다. */
interface SceneModule {
  createScene(): Scene;
}

/** 씬 팩토리를 동적 import 로 가져온다. 씬 인스턴스를 바로 원하면 loadScene 을 쓴다. */
export async function loadSceneFactory(id: SceneId): Promise<() => Scene> {
  let mod: SceneModule;
  switch (id) {
    case 'filmGrowth':
      mod = await import('./gl/scenes/filmGrowth');
      break;
    case 'plasma':
      mod = await import('./gl/scenes/plasma');
      break;
    case 'ionTrajectory':
      mod = await import('./gl/scenes/ionTrajectory');
      break;
    case 'polishProfile':
      mod = await import('./gl/scenes/polishProfile');
      break;
    case 'stepCoverage':
      mod = await import('./gl/scenes/stepCoverage');
      break;
    case 'aldCycle':
      mod = await import('./gl/scenes/aldCycle');
      break;
    case 'crystalGrowth':
      mod = await import('./gl/scenes/crystalGrowth');
      break;
    case 'ingotSlicing':
      mod = await import('./gl/scenes/ingotSlicing');
      break;
    case 'aerialImage':
      mod = await import('./gl/scenes/aerialImage');
      break;
    case 'probeScrub':
      mod = await import('./gl/scenes/probeScrub');
      break;
    case 'waferMap':
      mod = await import('./gl/scenes/waferMap');
      break;
    case 'packageThermal':
      mod = await import('./gl/scenes/packageThermal');
      break;
    case 'moistureSoak':
      mod = await import('./gl/scenes/moistureSoak');
      break;
    case 'shearTest':
      mod = await import('./gl/scenes/shearTest');
      break;
    default: {
      const never: never = id;
      throw new Error(`unknown sceneId: ${String(never)}`);
    }
  }
  return mod.createScene;
}

/** 씬 인스턴스 1개를 만들어 돌려준다(동적 import). */
export async function loadScene(id: SceneId): Promise<Scene> {
  const factory = await loadSceneFactory(id);
  return factory();
}

/* ---- GL 런타임 ---- */
export { createGLContext, isWebGL2Available } from './gl/context';
export type { GLContext, GLSize } from './gl/context';
export { startLoop } from './gl/renderer';
export type { Scene, SceneParams, LoopHandle, LoopOptions } from './gl/renderer';

/* ---- Canvas2D 폴백 (설계서 §10 L4) ---- */
export { createFallback2D } from './gl/fallback2d';
export type { Fallback2D, FallbackSceneId } from './gl/fallback2d';

/* ---- 자체 SVG 차트 3종 ---- */
/* 🔴 2026-08-20 되살렸다. PLN 명세가 차트를 **판정 경로**로 지정하고 있다 —
   `03_실습3단계명세.md` 「「직경 편차 확대 차트」를 별도 패널로 신설」 · **「판정은 이 차트에서 한다」**.
   P1 웨이퍼 심화의 σ_D(±0.71 mm)는 씬에서 **±0.34 px(서브픽셀)** 이라 관찰 불가라서 차트로 이관된 건이다.
   차트를 빼면 그 판정이 갈 곳이 없다.
   🔴 되살리면서 **먼저 쓰는 곳을 만들었다**(LabRunner 차트 패널). 배럴에만 되돌리면 W4 에 다시 걸린다. */
export { LineChart } from './chart/LineChart';
export type { LineChartProps, LineSeries, XYPoint } from './chart/LineChart';
export { BarChart } from './chart/BarChart';
export type { BarChartProps, BarGroup } from './chart/BarChart';
export { ProfileChart } from './chart/ProfileChart';
export type { ProfileChartProps, ProfileSeries, ProfilePoint } from './chart/ProfileChart';
/* 🔴 2026-08-20 — `Overlay` 를 배럴에서 뺐다(차트 3종은 배선 후 복귀).
   JSX 호출부가 **전 코드베이스에서 0곳**이었다(실측). 배럴에만 있으면 셰이킹이 안 걸려
   사용자에게 전송되면서 **아무 화면에도 안 뜬다.** 파일은 지우지 않고 옮겨 두었다
   (이 저장소에는 git 이 없어 삭제가 복구 불가다):
     `projects/8대공정-001/_보류_미배선컴포넌트/`
   🔴 되살리려면 **먼저 쓰는 곳을 만들고** 옮겨 와라. 배럴에만 되돌리면 같은 사달이 난다.
   `check-wiring` W4 가 이 패턴을 막는다. */
export { SERIES_COLORS, niceTicks, formatTick } from './chart/common';
