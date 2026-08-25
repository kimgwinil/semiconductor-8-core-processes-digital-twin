/**
 * `ionTrajectory`(이온 주입 궤적 + 깊이–농도 프로파일) 씬의 **계산 정본**.
 * 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/ionTrajectory.ts` — 배경 FS · 입자 VS · 프로파일 VS 세 셰이더에 리터럴로 주입한다.
 *   · `gl/fallback2d.ts`        — Canvas2D 로 같은 축·같은 봉우리를 그린다.
 *
 * 🔴 **재현되는 것은 형상이고, 개별 이온의 난수가 아니다.** GLSL 은 `hash11` 로, 폴백은 자체
 *    결정적 지터로 이온을 흩는다 — 점 하나하나의 위치까지 같게 만들 수는 없다(§ README 의
 *    「노이즈는 표현, 형상은 정본」 경계). 반드시 같아야 하는 것은 **축 배치 · R_p · σ ·
 *    틸트 각 · 스트래글 범위 · 농도 진폭**이며, 그 전부가 이 파일에 있다.
 *
 * 여기 나오는 숫자는 전부 화면 배치값이며 물리 상수가 아니다(설계서 §8).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ---------------- 화면 배치값 ---------------- */

/** 기판 표면의 화면 높이(UV, 위가 +). */
export const SURFACE_Y = 0.66;
/** 깊이 축의 화면 길이. 좌·우 패널이 같은 스케일을 쓴다. */
export const DEPTH_SPAN = 0.46;
/** 좌(단면) 패널 / 우(프로파일) 패널의 가로 범위. */
export const PANEL_L0 = 0.04;
export const PANEL_L1 = 0.62;
export const PANEL_R0 = 0.68;
export const PANEL_R1 = 0.97;
/** 프로파일 곡선이 가로로 뻗는 폭(농도 1.0 일 때). */
export const PANEL_W = 0.27;

/** 에너지 1.0 일 때 R_p 가 깊이 축의 몇 배인가. */
export const RANGE_FRAC = 0.75;
/** 이온별 비정 산포(스트래글) 배율 범위. */
export const STRAGGLE_LO = 0.55;
export const STRAGGLE_HI = 1.35;
/** 산란이 스트래글을 얼마나 더 벌리는가. */
export const SCATTER_STRAGGLE_GAIN = 0.6;
/** 입사 위치가 흩어지는 가로 범위(좌 패널). */
export const X0_BASE = 0.10;
export const X0_SPAN = 0.44;
/** 틸트 0→1 이 만드는 입사각(rad) 스윙. tilt=0.5 가 수직이다. */
export const TILT_SWING = 1.1;
/** 진행 거리에 비례하는 좌우 흐트러짐 계수. */
export const LATERAL_BASE = 0.25;
export const LATERAL_SCATTER = 1.2;

/** 프로파일 폭 σ = DEPTH_SPAN·(기본 + 산란항 + 에너지항). */
export const SIGMA_BASE = 0.055;
export const SIGMA_SCATTER = 0.10;
export const SIGMA_ENERGY = 0.05;
/** 농도 진폭 — 도즈 0 에서도 곡선이 보이도록 하한을 둔다. */
export const CONC_FLOOR = 0.18;
export const CONC_GAIN = 0.82;

/** 씬이 셰이더에 넘기는 파생값. */
export interface IonTrajectoryModel {
  /** 평균 투영 비정 R_p (깊이 축 단위, 0~DEPTH_SPAN) */
  rangePeak: number;
  /** 깊이-농도 가우시안의 폭 σ (깊이 축 단위) */
  sigma: number;
  /** 입사각(rad). tilt=0.5 에서 0 이다 */
  tiltAngle: number;
  /** 농도 곡선의 봉우리 높이 0~1 */
  peakConcentration: number;
  /** 스트래글 배율 하한·상한(산란 반영) */
  straggleLo: number;
  straggleHi: number;
  /** 좌우 흐트러짐 계수(진행 거리에 곱한다) */
  lateralGain: number;
}

/** 평균 투영 비정 R_p — 에너지에 비례한다. */
export function ionRangePeak(energy: number): number {
  return energy * DEPTH_SPAN * RANGE_FRAC;
}

/** 깊이-농도 가우시안의 폭 σ. 산란·에너지가 벌린다. */
export function ionSigma(energy: number, scatter: number): number {
  return DEPTH_SPAN * (SIGMA_BASE + SIGMA_SCATTER * scatter + SIGMA_ENERGY * energy);
}

/** 깊이(축 단위)에서의 농도 0~1. 프로파일 곡선의 정본이다. */
export function ionConcentration(depth: number, m: Pick<IonTrajectoryModel, 'rangePeak' | 'sigma' | 'peakConcentration'>): number {
  const z = (depth - m.rangePeak) / Math.max(m.sigma, 1e-4);
  return Math.exp(-0.5 * z * z) * m.peakConcentration;
}

export function ionTrajectoryModel(params: SceneParams): IonTrajectoryModel {
  const energy = pick(params, 'energy', 0.5);
  const dose = pick(params, 'dose', 0.6);
  const tilt = pick(params, 'tilt', 0.5);
  const scatter = pick(params, 'scatter', 0.3);
  const straggleScale = 1 + scatter * SCATTER_STRAGGLE_GAIN;
  return {
    rangePeak: ionRangePeak(energy),
    sigma: ionSigma(energy, scatter),
    tiltAngle: (tilt - 0.5) * TILT_SWING,
    peakConcentration: CONC_FLOOR + CONC_GAIN * dose,
    straggleLo: STRAGGLE_LO * straggleScale,
    straggleHi: STRAGGLE_HI * straggleScale,
    lateralGain: LATERAL_BASE + LATERAL_SCATTER * scatter,
  };
}
