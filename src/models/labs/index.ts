// 🔴 등급 리졸버 설치(부수효과)는 **이 배럴의 첫 줄이어야 한다.** 아래 실습 모듈들은
//    모듈 평가 시점에 `quantity()` 를 부른다(예: `./etch` 의 `const SIF_LINE = endpointWavelength('SiF')`).
//    리졸버가 그때 없으면 배럴 전체가 던지고, 화면은 Suspense 가 안 풀려 「불러오는 중…」에서 영원히 멈춘다.
//
//    🔴 종전에는 이 import 가 `../physics/index.ts` 에만 있었다. 그런데 `ui/sections/LabSection.tsx` 는
//    physics 와 labs 를 `Promise.all` 로 **동시에** 부른다. 번들(rollup)은 두 그래프를 한 청크에
//    합치며 순서를 고정해 주지만, vite dev 의 무번들 ESM 은 두 그래프가 각자 네트워크로 내려와
//    **먼저 도착한 쪽이 먼저 평가된다.** 실측 결과 동일 조건 5회 중 2회에서 labs 가 이겨
//    `[wiring] grade resolver is not installed; cannot grade "etch.oes.endpointWavelength"` 로 죽었다
//    (2026-08-21 DEV 실측 · DSN 계측기 함정 #1 의 실체).
//    labs 그래프가 스스로 리졸버를 지고 다니게 하면 순서에 관계없이 성립한다.
import '../registry';
import { registerLabs } from './spec';
import { OXIDATION_LABS } from './oxidation';
import { WAFER_LABS } from './wafer';
import { DEPOSITION_LABS } from './deposition';
import { ETCH_LABS } from './etch';
import { EDS_LABS } from './eds';
import { PHOTO_LABS } from './photo';
import { PACKAGING_LABS } from './packaging';
import { METAL_LABS } from './metal';

/**
 * 실습 명세 배럴. 공정별 구현자는 여기에 **자기 줄만** 추가한다.
 * 🔴 공정 ID 리터럴을 이 파일에 쓰지 않는다(C1) — 각 모듈이 spec 안에 담아 온다.
 */
export function registerAllLabs(): void {
  registerLabs([...OXIDATION_LABS, ...DEPOSITION_LABS]);
  registerLabs([...ETCH_LABS]);
  registerLabs([...EDS_LABS]);
  registerLabs([...PHOTO_LABS]);
  registerLabs([...PACKAGING_LABS]);
  registerLabs([...METAL_LABS]);
  registerLabs([...WAFER_LABS]);
}

export * from './spec';
