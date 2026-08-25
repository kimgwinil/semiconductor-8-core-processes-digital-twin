/**
 * `aldCycle` 씬의 **계산 정본**. 🔴 여기에는 GLSL 문자열이 없다(`models/README.md`).
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/aldCycle.ts` — 유니폼을 채우고, 아래 상수를 GLSL 리터럴로 주입한다.
 *   · `gl/fallback2d.ts`   — Canvas2D 로 같은 값을 그린다(WebGL2 미지원 경로).
 * 두 경로가 갈리지 않는 유일한 이유가 「식이 여기 하나뿐」이라는 것이다.
 *
 * 여기 나오는 숫자는 전부 화면 배치값이며 물리 상수가 아니다(설계서 §8).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ---------------- 화면 배치값 ---------------- */

/** 그래프 가로축에 담는 최대 사이클 수. 축이 고정이라 기울기 변화가 눈에 띈다. */
export const CYCLE_MAX = 24;
/** 사이클당 이상적(포화·온도창 안) 층 두께 — 화면 단위. */
export const LAYER_MAX = 0.4 / CYCLE_MAX;
/** 흡착 포화 곡선 1−exp(−k·노출)의 k. 포화가 눈에 보이게 일찍 평탄해지는 형상 계수다. */
export const SAT_K = 5;
/** 펄스 안에서 흡착이 포화에 이르는 속도(형상 계수). */
export const PULSE_K = 4;

/**
 * 온도축의 이탈대→창 전이 구간. **화면 배치값이지 온도값이 아니다**(U-8: 온도 숫자를 넣지 않는다).
 * 저온쪽은 0.16 에서 오르기 시작해 0.30 에서 창에 들어가고, 고온쪽은 0.66 에서 나가 0.80 에서 완전 이탈이다.
 */
export const TEMP_RAMP_LO: readonly [number, number] = [0.16, 0.3];
export const TEMP_RAMP_HI: readonly [number, number] = [0.66, 0.8];

/**
 * 🔴 **평탄 창** — 이 구간 안에서만 `tempFactor` 가 1 이다.
 *    상위 층(랩)이 자기 온도 범위를 온도축에 얹을 때 **반드시 이 창에 맞춰야** 한다.
 *    계층 규칙상 `src/models` 는 `src/viz` 를 import 할 수 없으므로(check-layering),
 *    랩은 같은 값을 자기 상수로 들고 있고 **테스트가 양쪽을 import 해 일치를 단언**한다
 *    (`tests/unit/ald-scene-mapping.test.ts`). 여기를 고치면 그 테스트가 먼저 깨진다.
 *    화면 배치값이지 물리 상수가 아니다.
 */
export const ALD_TEMP_WINDOW = { lo: TEMP_RAMP_LO[1], hi: TEMP_RAMP_HI[0] } as const;

/** 온도창 이탈 시 남는 성장률 하한. 완전히 0 으로 만들면 계단이 사라져 「무엇이 무너졌는지」가 안 보인다. */
export const TEMP_FLOOR = 0.04;

/** 씬이 셰이더에 넘기는 파생값. 방향성 테스트(A12)가 이 함수를 직접 검사한다. */
export interface AldCycleModel {
  /**
   * 🔴 **사이클 축 위의 연속 위치 0~CYCLE_MAX. 막 두께의 정본이다.**
   *
   * 자기제한 반응이라 두께는 사이클 수에 **정확히 선형**이다(물리층 `deposition/ald.ts`
   * `aldThicknessAngstrom`: t = GPC × N). 그래서 두께에는 **반올림을 걸지 않는다** —
   * 반올림은 「몇 겹의 경계선을 그리는가」에만 걸리고(`cycleCount`), 막 상단은 연속이다.
   *
   * 🔴 2026-08-21 D-5b: 종전에는 두께 자체를 정수 층으로 끊고(`1 + floor(·)`) 거기에
   *    4단계 애니메이션의 `reacted`(0 또는 1)를 더했다. 상위 층이 `phase` 를 `cycles` 에서
   *    파생시키고 있었으므로 그 톱니가 두께에 그대로 실려, **사이클을 올렸는데 막이 얇아지는
   *    구간이 4곳**(190→200 −10.00 % 등) 생겼다. 사이클 축과 사이클 내부 시간축은 다른 축이다.
   */
  cyclesShown: number;
  /** 경계선을 그릴 **완료된** 층 수 0~CYCLE_MAX (정수). 두께가 아니라 그리기용이다. */
  cycleCount: number;
  /** 진행 중인 맨 위 층의 완성도 0~1 = `cyclesShown − cycleCount`. 막 상단이 여기까지 올라와 있다. */
  partialLayer: number;
  /** 4단계 중 현재 단계 0=전구체A 1=퍼지 2=전구체B 3=퍼지 */
  stage: number;
  /** 현재 단계 안에서의 진행도 0~1 */
  local: number;
  /** 노출량이 만든 흡착 포화 상한 0~1 */
  satCoverage: number;
  /**
   * 온도창 계수 0~1 — 온도축 위치가 창 안이면 1, 이탈하면 하한 `TEMP_FLOOR` 까지 붕괴.
   * 🔴 **온도 막대(마커의 색 구간)의 근거값이다.** 성장률과는 별개다 —
   *    상위 층이 `growth` 를 주면 `gpc` 는 이 값을 쓰지 않는다.
   */
  tempFactor: number;
  /**
   * 사이클당 성장(이상값 대비) 0~1. **계단 높이를 정하는 값이다.**
   * - `growth` 파라미터가 오면 그 값(clamp01) 그대로. 성장률을 아는 것은 물리를 가진 상위 층이다.
   * - 없으면 씬이 `satCoverage × tempFactor` 로 자체 산출한다(씬 단독 사용 하위호환).
   */
  gpc: number;
  /** 한 사이클이 쌓는 층의 화면 두께 */
  layerHeight: number;
  /** 지금 표면에 붙어 있는 전구체 A 의 자리 점유율 0~1 */
  adsorbed: number;
  /**
   * 4단계 중 **전구체 B 반응 단계의 진행도** 0~1 — 흡착 자리의 색이 A→B 로 넘어가는 양이다.
   * 🔴 **두께에 더하지 않는다.** 사이클 내부의 시간축이지 사이클 축이 아니다(위 `cyclesShown`).
   */
  reacted: number;
  /** 기상 전구체 A 밀도 0~1 */
  gasA: number;
  /** 기상 전구체 B 밀도 0~1 */
  gasB: number;
  /** 반응 부산물 밀도 0~1 */
  byproduct: number;
  /**
   * 총 막 두께(화면 단위) = `cyclesShown × layerHeight`.
   * 🔴 사이클 축에 **정확히 선형**이고 **절편이 0**이다 — 0 사이클이면 막이 없다.
   *    이것이 ALD 학습의 전부라서 여기에 어떤 계단·톱니도 얹지 않는다.
   */
  filmHeight: number;
}

/** GLSL `smoothstep` 과 같은 정의. */
export function smooth(a: number, b: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/**
 * 온도창: 창 안(`ALD_TEMP_WINDOW`)은 1, 양쪽으로 이탈하면 `TEMP_FLOOR` 까지 붕괴.
 * 경계 위치는 화면 배치값이지 온도값이 아니다.
 * 🔴 export 하는 이유: 랩의 온도축 매핑이 이 창에 정확히 얹히는지 테스트가 직접 부른다.
 */
export function temperatureWindow(t: number): number {
  return TEMP_FLOOR + (1 - TEMP_FLOOR) * temperatureWindowShape(t);
}

/**
 * 온도창의 **모양만** 0~1 로 — 하한(`TEMP_FLOOR`)을 얹기 전 값이다.
 * 온도 막대(창 3구간의 색)가 쓰는 값이고, 셰이더 `tempBar()` 의 `win` 과 같은 양이다.
 * 🔴 폴백이 이 함수를 부르기 때문에 두 경로의 막대 색이 갈라지지 않는다.
 */
export function temperatureWindowShape(t: number): number {
  const lo = smooth(TEMP_RAMP_LO[0], TEMP_RAMP_LO[1], t);
  const hi = 1 - smooth(TEMP_RAMP_HI[0], TEMP_RAMP_HI[1], t);
  return lo * hi;
}

/** 정규화 파라미터(필수 4개 + 선택 `growth`) → 셰이더 유니폼으로 쓸 파생값. */
export function aldCycleModel(params: SceneParams): AldCycleModel {
  const cycles = pick(params, 'cycles', 0.4);
  const phase = Math.min(pick(params, 'phase', 0.1), 0.999999);
  const saturation = pick(params, 'saturation', 0.7);
  const temperature = pick(params, 'temperature', 0.5);

  // 🔴 사이클 축은 0 에서 시작한다. `1 + floor(·)` 로 쓰면 절편이 한 층 생겨
  //    「0 사이클에 이미 막이 있다」가 되고(D-5b N-3), 스팬을 CYCLE_MAX−1 로 잡으면
  //    축 만재점이 CYCLE_MAX 에 닿지 않는다. 반올림은 아래 `cycleCount` 에만 건다.
  const cyclesShown = Math.min(1, Math.max(0, cycles)) * CYCLE_MAX;
  const cycleCount = Math.floor(cyclesShown + 1e-6);
  const partialLayer = Math.min(1, Math.max(0, cyclesShown - cycleCount));
  const stage = Math.floor(phase * 4);
  const local = phase * 4 - stage;

  const satCoverage = 1 - Math.exp(-SAT_K * saturation);
  const tempFactor = temperatureWindow(temperature);

  // 🔴 성장률의 정본은 상위 층이다. `growth` 가 오면 그것을 쓰고, 없을 때만 씬이 대신 만든다.
  //    (씬이 온도축 위치로 성장률을 역산하면 단위계가 다른 두 양이 섞인다 — 결함 ❌-1.)
  const growthRaw = params['growth'];
  const gpc = typeof growthRaw === 'number' && Number.isFinite(growthRaw)
    ? Math.min(1, Math.max(0, growthRaw))
    : satCoverage * tempFactor;
  const layerHeight = LAYER_MAX * gpc;

  // 4단계: 전구체 A 도징 → 퍼지 → 전구체 B 도징(반응) → 퍼지
  let adsorbed = 0;
  let reacted = 0;
  let gasA = 0;
  let gasB = 0;
  let byproduct = 0;
  if (stage === 0) {
    adsorbed = satCoverage * (1 - Math.exp(-PULSE_K * local)); // 자기제한: 상한이 satCoverage
    gasA = 1;
  } else if (stage === 1) {
    adsorbed = satCoverage;
    gasA = 1 - local;
  } else if (stage === 2) {
    adsorbed = satCoverage * (1 - local); // 반응으로 소모된다
    reacted = local;
    gasB = 1;
    byproduct = local;
  } else {
    reacted = 1;
    gasB = 1 - local;
    byproduct = 1 - local;
  }

  return {
    cyclesShown,
    cycleCount,
    partialLayer,
    stage,
    local,
    satCoverage,
    tempFactor,
    gpc,
    layerHeight,
    adsorbed,
    reacted,
    gasA,
    gasB,
    byproduct,
    filmHeight: cyclesShown * layerHeight,
  };
}
