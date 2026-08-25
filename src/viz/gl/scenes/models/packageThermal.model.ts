/**
 * `packageThermal`(패키지 열경로 단면 + ΔT 기둥 + θ→권장전력 계단) 씬의 **계산 정본**.
 * 🔴 GLSL 문자열 없음(`models/README.md`) — 셰이더는 `scenes/packageThermal.ts` 가 이 상수를 주입해 만든다.
 *
 * 쓰는 곳은 둘이다:
 *   · `scenes/packageThermal.ts` — 아래 상수를 `${glslFloat(...)}` 로 식 안에 직접 주입한다.
 *   · `gl/fallback2d.ts`         — Canvas2D 로 같은 그림을 그린다(WebGL2 미지원 경로).
 *
 * 좌표계는 **셰이더와 같은 UV(원점 좌하단 · y 위쪽이 + · 0~1)** 다. Canvas2D 는 세로가 뒤집혀 있어
 * 폴백이 `toY(uv, h) = (1 − uv) · h` 로 변환한다 — 변환은 폴백의 몫이고, 형상은 여기 하나다.
 *
 * 🔴 **여기 있는 숫자는 두 갈래다. 섞지 마라.**
 *   ① 화면 배치값(UV) — 무엇을 화면 어디에 그리는가. DSN 스레드 §P-2 정본.
 *   ② 축의 물리 정의역(ΔT 0~300 °C · P 0~3 W · θ 15~100 °C/W) — 정규화 0~1 을 눈금으로 되돌리는 데만 쓴다.
 *   물리 계산은 **하나도 없다.** 씬이 받는 값은 랩(`src/models/labs/packaging.ts`)이 이미
 *   `physics/packaging/thermal.ts` 로 계산해 0~1 로 정규화한 것이다(§3 계층 규칙).
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

/* ══════════════════ ① 화면 배치값 (UV · 원점 좌하단) ══════════════════ */

/** 기판(PCB) 상면 / 하면. */
export const PT_BOARD_TOP = 0.20;
export const PT_BOARD_BOT = 0.14;

/** 패키지 몸체 가로 / 상면. */
export const PT_PKG_X0 = 0.16;
export const PT_PKG_X1 = 0.46;
export const PT_PKG_TOP = 0.34;

/** 다이(접합부) 사각형. 열이 나는 자리이며 `rise` 가 채움색을 움직인다. */
export const PT_DIE_X0 = 0.24;
export const PT_DIE_X1 = 0.38;
export const PT_DIE_Y0 = 0.245;
export const PT_DIE_Y1 = 0.285;

/** 온도축 세로선 x 와 그 y 구간(= ΔT 0 → 300 °C). */
export const PT_TAXIS_X = 0.545;
export const PT_TAXIS_Y0 = 0.20;
export const PT_TAXIS_Y1 = 0.92;

/** ΔT 기둥 가로(폭 0.045). 오른쪽 끝이 온도축과 맞물린다. */
export const PT_TCOL_X0 = 0.500;
export const PT_TCOL_X1 = 0.545;

/** 권장전력 계단 가로(= θ 15 → 100) / 세로(= P 0 → 3 W). */
export const PT_PAXIS_X0 = 0.68;
export const PT_PAXIS_X1 = 0.96;
export const PT_PAXIS_Y0 = 0.20;
export const PT_PAXIS_Y1 = 0.62;

/**
 * 합격창 구간 확대 눈금(minor tick)의 **가로 폭**. 합격창 [0.248, 0.344] 은 축 전체(0.72)의
 * 13.3 % 밖에 안 되므로 좁은 구간의 판독을 돕는다.
 * 🔴 **축을 자르지 않는다** — 기본 조건 300 °C 가 축 꼭대기이고 「기본 조건이 합격창의 6 배 위에
 *    있다」가 이 칸의 교육 내용이다. 눈금만 붙인다.
 */
export const PT_MINOR_TICK_W = 0.10;

/** 파생 스팬 — 손으로 다시 적지 않는다. */
export const PT_RISE_SPAN = PT_TAXIS_Y1 - PT_TAXIS_Y0;      // 0.72
export const PT_POWER_SPAN = PT_PAXIS_Y1 - PT_PAXIS_Y0;     // 0.42
export const PT_THETA_SPAN_X = PT_PAXIS_X1 - PT_PAXIS_X0;   // 0.28

/**
 * ΔT 참고선·합격창이 걸쳐 있는 가로 구간.
 * 🔴 DSN 정본은 참고선의 **세로 위치만** 규정했고 가로 범위는 말하지 않았다. 값을 지어내지 않고
 *    이미 있는 상수에서 유도한다 — 기둥 왼쪽 끝(`PT_TCOL_X0`)에서 시작해 온도축을 지나
 *    확대 눈금 폭(`PT_MINOR_TICK_W`)만큼 오른쪽으로 나간다. 축 오른쪽으로 나간 그 부분이 곧 눈금이다.
 */
export const PT_REF_X0 = PT_TCOL_X0;
export const PT_REF_X1 = PT_TAXIS_X + PT_MINOR_TICK_W;

/**
 * 단면(패키지·기판) 그림이 쓰는 가로 구간.
 * 🔴 기판의 세로(0.14~0.20)는 정본에 있으나 **가로 범위는 없다.** 지어내지 않고
 *    「온도축 왼쪽 전부」로 유도한다.
 */
export const PT_SECTION_X0 = 0;
export const PT_SECTION_X1 = PT_TAXIS_X;

/** 판정 도형(● / ▲)의 반지름과 중심 — 세로 단위(y-unit) 기준. 화면 배치값이다. */
export const PT_VERDICT_R = 0.020;
export const PT_VERDICT_GAP = 0.035;
export const PT_VERDICT_X = (PT_TCOL_X0 + PT_TCOL_X1) / 2;
export const PT_VERDICT_Y = PT_TAXIS_Y1 + PT_VERDICT_GAP;

/** 계단 경계의 채운 점(●)·빈 점(○) 반지름과 현재 위치 마커 반지름. 화면 배치값이다. */
export const PT_DOT_R = 0.012;
export const PT_MARKER_R = 0.016;

/**
 * 구조물(기판·패키지 몸체) 채움 불투명도. 판독의 1차인 ΔT 기둥·계단선을 가리지 않게 낮춘다.
 * 🔴 **배경을 칠하는 값이 아니다** — 두 사각형 안에서만 쓴다(전면 채움 금지).
 */
export const PT_BOARD_FILL_A = 0.55;
export const PT_PKG_FILL_A = 0.30;

/* ══════════════════ ② 축의 물리 정의역 ══════════════════ */

/** ΔT 축 상한 [°C] — 0.20 → 0.92 가 0 → 300 °C 다. */
export const PT_RISE_AXIS_MAX_C = 300;
/** 전력 축 상한 [W] — 0.20 → 0.62 가 0 → 3 W 다. */
export const PT_POWER_AXIS_MAX_W = 3;
/** θ 정의역 [°C/W] — 0.68 → 0.96 이 15 → 100 이다. */
export const PT_THETA_MIN = 15;
export const PT_THETA_MAX = 100;

/**
 * 합격창·참고선의 ΔT [°C].
 * 🔴 값의 **정본은 `src/models/physics/packaging/thermal.ts`**(JESD51-2A §5.5 · S247)이고
 *    여기는 화면이 되받는 사본이 아니라 **눈금 위치를 정하는 입력**이다.
 *    `src/viz/**` 는 `src/models/**` 를 import 하지 않는다(§3 계층 규칙)라서 값을 옮겨 적는다 —
 *    표준값이 바뀌면 양쪽을 같이 고쳐야 한다.
 */
export const PT_RISE_PASS_MIN_C = 20;
export const PT_RISE_PASS_MAX_C = 60;
export const PT_RISE_REF_C = 30;

/**
 * 결측 기본값(정규화 0~1).
 * 🔴 **0.5 를 쓰지 않는다(A15).** 없는 값을 축 한가운데(=150 °C)로 그리면 학습자가 그것을
 *    「측정된 중간 조건」으로 읽는다. `rise`·`theta` 는 0(축 바닥), 전력 둘은 표의 최저단이다.
 */
export const PT_RISE_DEFAULT = 0;
export const PT_THETA_DEFAULT = 0;
/** = 0.5 W / 3 W. 권장전력표의 최저단이며 `recPower`·`testPower` 두 키의 결측값이다. */
export const PT_POWER_DEFAULT = 0.1667;

/* ══════════════════ ③ 열류 표시 — P_H = dQ/dt 의 표현 ══════════════════
 *
 * 🔴 **무엇의 시간 발전인가 — 정상상태 열류 P_H 다.**
 *    이 씬의 열 모델은 JESD51-2A 식 (1) `ΔT = θ·P` **정상상태 하나뿐**이고,
 *    시상수 τ·열용량 C_th·과도 열임피던스 Z_θ(t) 는 `physics/packaging/thermal.ts` 에 **없다**.
 *    그래서 **「전력 인가 후 ΔT 가 상승하는 과도곡선」은 그리지 않는다** — 그리려면 τ 를 지어내야 한다.
 *
 * 🔴 그런데 **정상상태에서도 열은 흐른다.** 정상상태의 정의는 `∂T/∂t = 0`(온도장이 시간 불변)이지
 *    열류가 0 이라는 뜻이 아니다. 열류가 0 이면 그것은 열평형이고 ΔT = 0 이 된다.
 *    이 모델에서 열류의 크기는 **정확히 P_H [W] = [J/s]** 이며, 그 값은 이미 `testPower` 키로
 *    씬에 들어와 있다(`thermal.ts` 가 `powerW > 0` 을 강제한다).
 *
 * 🔴 그래서 애니메이션은 **하나만** 한다: 다이(접합부)에서 나와 패키지 몸체 위쪽과 기판 아래쪽으로
 *    빠져나가는 **열류 마커의 통과율을 P_H 에 비례**시킨다. 「속도」를 지어낸 것이 아니라
 *    **초당 통과 횟수 ∝ P_H** 라는 관계를 화면에 옮긴 것이다 — 전력을 2 배로 하면 통과율도 2 배다.
 *
 * ⛔ **여기서 물리 상수를 만들지 않았다.** 아래 `PT_FLUX_LAPS_PER_S_PER_W` 는 열용량도 에너지 양자도
 *    아니고, 「1 W 당 초당 몇 번 지나가 보이게 할 것인가」라는 **표시 이득**이다 —
 *    `ptYOfRise()` 가 °C 를 UV 로 바꾸는 배율과 같은 종류의 수다(축 눈금 배율).
 */

/** 열류 마커가 지나는 세로선의 x — 다이 한가운데. 새 좌표가 아니라 다이 상수에서 유도한다. */
export const PT_FLUX_X = (PT_DIE_X0 + PT_DIE_X1) / 2;

/** 몸체·기판 **밖으로** 나가 사라지는 구간(주위로의 방출). 경로 끝을 구조물 표면에 딱 붙이지 않는다. */
export const PT_FLUX_EXIT = 0.03;

/** 위쪽 가지 — 다이 상면 → 패키지 상면 바깥. */
export const PT_FLUX_UP_Y0 = PT_DIE_Y1;
export const PT_FLUX_UP_Y1 = PT_PKG_TOP + PT_FLUX_EXIT;
/** 아래쪽 가지 — 다이 하면 → 기판 하면 바깥. θ_JA 는 두 경로를 묶은 지표다. */
export const PT_FLUX_DN_Y0 = PT_DIE_Y0;
export const PT_FLUX_DN_Y1 = PT_BOARD_BOT - PT_FLUX_EXIT;

/** 가지당 마커 수. */
export const PT_FLUX_MARKS = 3;

/** 마커 반폭(가로 UV) · 반높이(세로 UV). 화면 배치값이다. */
export const PT_FLUX_HALF_W = 0.020;
export const PT_FLUX_HALF_H = 0.005;

/**
 * 🔴 **표시 이득** — 마커의 초당 통과 횟수 [1/s] = 이 값 × P_H [W]. 물리 상수가 아니다.
 *    P 정의역이 0.5~3 W 이므로 통과 주기는 8 s(0.5 W) ~ 1.33 s(3 W) 가 된다.
 */
export const PT_FLUX_LAPS_PER_S_PER_W = 0.25;

/**
 * 열류 마커의 초당 통과 횟수 [1/s]. **씬(GLSL 유니폼)과 폴백이 둘 다 이 함수를 부른다** —
 * 비례관계의 정본이 하나다.
 */
export function ptFluxLapsPerSecond(testPowerW: number): number {
  const p = Number.isFinite(testPowerW) ? Math.max(0, testPowerW) : 0;
  return PT_FLUX_LAPS_PER_S_PER_W * p;
}

/**
 * 마커 `k`(0-based)의 위상 0~1. `t` 초에서 `y = mix(y0, y1, phase)` 자리에 선다.
 * 🔴 **오프셋이 `(k + 0.5) / N` 인 이유**: `t = 0`(감속 모드의 고정 시각 · `scenes/motion.ts`)에서
 *    어느 마커도 진폭 0 이 되지 않게 한다 — 움직임을 멈춰도 **정보가 사라지지 않아야** 한다.
 */
export function ptFluxPhase(k: number, t: number, lapsPerSecond: number): number {
  const off = (k + 0.5) / PT_FLUX_MARKS;
  const raw = (Number.isFinite(t) ? t : 0) * (Number.isFinite(lapsPerSecond) ? lapsPerSecond : 0) + off;
  return raw - Math.floor(raw);
}

/**
 * 마커 진폭(0~1). 위상 양 끝에서 0 이라 나타나고 사라지는 자리가 튀지 않는다.
 * 🔴 물리량이 아니라 **가시성 창**이다. GLSL 과 폴백이 같은 식을 쓰도록 여기 둔다.
 */
export function ptFluxAmplitude(phase: number): number {
  const p = Number.isFinite(phase) ? phase : 0;
  return 4 * p * (1 - p);
}

/* ══════════════════ 변환식 — 셋뿐이다 ══════════════════ */

/** ΔT [°C] → 세로 UV. */
export function ptYOfRise(riseC: number): number {
  return PT_TAXIS_Y0 + (riseC / PT_RISE_AXIS_MAX_C) * PT_RISE_SPAN;
}

/** θ [°C/W] → 가로 UV. */
export function ptXOfTheta(thetaCPerW: number): number {
  return PT_PAXIS_X0 + ((thetaCPerW - PT_THETA_MIN) / (PT_THETA_MAX - PT_THETA_MIN)) * PT_THETA_SPAN_X;
}

/** P [W] → 세로 UV. */
export function ptYOfPower(powerW: number): number {
  return PT_PAXIS_Y0 + (powerW / PT_POWER_AXIS_MAX_W) * PT_POWER_SPAN;
}

/* ══════════════════ 권장전력 계단 (이산 5단) ══════════════════ */

/**
 * θ_JA 밴드별 권장 측정 전력 [W]. **θ 오름차순**이며 각 항의 `thetaMin` 은 **포함 하한**이다.
 *
 * 🔴 **정본은 `src/models/physics/packaging/thermal.ts` 의 `POWER_BANDS`**(JESD51-2A §5.5 Table 2 ·
 *    골든값 R201)다. 그쪽은 `θ ≥ thetaMin` 을 내림차순으로 훑어 **경계값을 낮은 전력 쪽으로 귀속**시킨다.
 *    계층 규칙(§3)상 `src/viz/**` 가 `src/models/**` 를 import 할 수 없어 표를 옮겨 적었고,
 *    **귀속 방향까지 같게** 뒀다(θ=20 → 2 W · θ=30 → 1 W · θ=60 → 0.75 W · θ=100 → 0.5 W).
 *
 * 🔴 **보간 금지.** 이산 5단 {0.5, 0.75, 1, 2, 3} W 를 부드럽게 이으면 표준을 왜곡한다.
 *    대신 5단을 **항상 전부 그려 둔다** — 다음 눈금이 어디인지 보이면 계단의 점프가
 *    「얼어붙음(결함)」이 아니라 정보로 읽힌다.
 */
export interface PtPowerBand {
  /** 포함 하한 θ [°C/W]. */
  readonly thetaMin: number;
  readonly powerW: number;
}
export const PT_POWER_BANDS: readonly PtPowerBand[] = [
  { thetaMin: 15, powerW: 3 },
  { thetaMin: 20, powerW: 2 },
  { thetaMin: 30, powerW: 1 },
  { thetaMin: 60, powerW: 0.75 },
  { thetaMin: PT_THETA_MAX, powerW: 0.5 },
];

/** 계단 한 단(트레드). `x0`→`x1` 은 그 밴드가 차지하는 가로 구간이고 `y` 는 그 전력의 세로 위치다. */
export interface PtStep {
  readonly powerW: number;
  readonly thetaMin: number;
  readonly thetaMax: number;
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
}

/**
 * 5단 전부. 마지막 단(θ = 100 → 0.5 W)은 **가로 폭이 0**이다 —
 * 축 오른쪽 끝이 곧 정의역의 끝(θ = 100)이라 트레드가 점 하나로 줄어든다.
 * 그래서 그 단은 경계의 **채운 점(●)** 과 세로 라이저로만 보인다. 없는 폭을 지어내 늘리지 않았다.
 */
export const PT_STEPS: readonly PtStep[] = PT_POWER_BANDS.map((band, i) => {
  const next = PT_POWER_BANDS[i + 1];
  const thetaMax = next ? next.thetaMin : PT_THETA_MAX;
  return {
    powerW: band.powerW,
    thetaMin: band.thetaMin,
    thetaMax,
    x0: ptXOfTheta(band.thetaMin),
    x1: ptXOfTheta(thetaMax),
    y: ptYOfPower(band.powerW),
  };
});

/**
 * 계단 경계 4개(θ = 20 · 30 · 60 · 100).
 * `yClosed` = 경계값을 **갖는** 쪽(오른쪽·낮은 전력) → 채운 점 ●
 * `yOpen`   = 경계값을 **안 갖는** 쪽(왼쪽·높은 전력) → 빈 점 ○(테두리만)
 * 🔴 이게 없으면 학습자가 경계값의 귀속을 못 읽는다.
 */
export interface PtBoundary {
  readonly thetaC: number;
  readonly x: number;
  readonly yClosed: number;
  readonly yOpen: number;
}
export const PT_BOUNDARIES: readonly PtBoundary[] = PT_POWER_BANDS.slice(1).map((band, i) => {
  const prev = PT_POWER_BANDS[i] as PtPowerBand;
  return {
    thetaC: band.thetaMin,
    x: ptXOfTheta(band.thetaMin),
    yClosed: ptYOfPower(band.powerW),
    yOpen: ptYOfPower(prev.powerW),
  };
});

/** 정의역 왼쪽 끝(θ = 15)도 **포함**이다 — 채운 점 하나를 찍는다. */
export const PT_DOMAIN_START_X = ptXOfTheta(PT_THETA_MIN);
export const PT_DOMAIN_START_Y = ptYOfPower(PT_POWER_BANDS[0]?.powerW ?? 0);

/* ══════════════════ 씬 모델 ══════════════════ */

export interface PackageThermalModel {
  /* --- 랩이 넘긴 정규화값(0~1) --- */
  readonly rise: number;
  readonly recPower: number;
  readonly testPower: number;
  readonly theta: number;
  /* --- 눈금으로 되돌린 값 --- */
  readonly riseC: number;
  readonly thetaCPerW: number;
  readonly recPowerW: number;
  readonly testPowerW: number;
  /* --- 화면 좌표(UV) --- */
  /** ΔT 기둥 높이 = `rise × 0.72`. */
  readonly colHeight: number;
  /** ΔT 기둥 윗면. */
  readonly colTop: number;
  /** 다이 채움색 보간 계수(`c.dim` → `c.spec`). 색은 **보조 채널** — 판독의 1차는 기둥 높이다. */
  readonly dieHeat: number;
  /** 계단선의 현재 세로 위치. */
  readonly stepY: number;
  /** 시험전력 수평 파선의 세로 위치. */
  readonly testY: number;
  /** 현재 θ 의 가로 위치. */
  readonly markerX: number;
  /**
   * 열류 마커의 초당 통과 횟수 [1/s] = 표시이득 × P_H.
   * 🔴 **이 씬에서 시간에 의존하는 유일한 양**이며, 그 의존의 근거는 P_H = dQ/dt 다(위 §③).
   */
  readonly fluxLapsPerSecond: number;
  /* --- 합격창 --- */
  readonly passLoY: number;
  readonly passHiY: number;
  readonly refY: number;
  /** ΔT 가 [20, 60] °C 안인가. true → ● · false → ▲. */
  readonly risePass: boolean;
}

/**
 * 씬이 받는 **정확히 4키**. 랩(`src/models/labs/packaging.ts`)이 아래 map 으로 넘긴다:
 *   `rise      = o['riseC'] / 300`
 *   `recPower  = o['recommendedPowerW'] / 3`
 *   `testPower = i['testPowerW'] / 3`
 *   `theta     = (i['thetaCPerW'] − 15) / 85`
 *
 * 🔴 `P = NaN/∞` 는 랩이 **예외를 던져** 씬까지 오지 않는다 — 여기서 방어하지 않는다.
 *    `θ = NaN/±∞` 는 랩의 `clampTheta` 가 15 로 흡수한다. 그래도 `pick()` 이 비유한값을
 *    기본값으로 되돌리므로 화면에 NaN 좌표가 나갈 일은 없다.
 */
export function packageThermalModel(params: SceneParams): PackageThermalModel {
  const rise = pick(params, 'rise', PT_RISE_DEFAULT);
  const recPower = pick(params, 'recPower', PT_POWER_DEFAULT);
  const testPower = pick(params, 'testPower', PT_POWER_DEFAULT);
  const theta = pick(params, 'theta', PT_THETA_DEFAULT);

  const riseC = rise * PT_RISE_AXIS_MAX_C;
  const recPowerW = recPower * PT_POWER_AXIS_MAX_W;
  const testPowerW = testPower * PT_POWER_AXIS_MAX_W;
  const thetaCPerW = PT_THETA_MIN + theta * (PT_THETA_MAX - PT_THETA_MIN);

  return {
    rise,
    recPower,
    testPower,
    theta,
    riseC,
    thetaCPerW,
    recPowerW,
    testPowerW,
    // 🔴 `rise` 는 `pick()` 이 이미 0~1 로 clamp 했다 — 기둥이 축(0.72)을 넘지 않는다.
    colHeight: rise * PT_RISE_SPAN,
    colTop: PT_TAXIS_Y0 + rise * PT_RISE_SPAN,
    dieHeat: rise,
    stepY: ptYOfPower(recPowerW),
    testY: ptYOfPower(testPowerW),
    markerX: PT_PAXIS_X0 + theta * PT_THETA_SPAN_X,
    fluxLapsPerSecond: ptFluxLapsPerSecond(testPowerW),
    passLoY: ptYOfRise(PT_RISE_PASS_MIN_C),
    passHiY: ptYOfRise(PT_RISE_PASS_MAX_C),
    refY: ptYOfRise(PT_RISE_REF_C),
    risePass: riseC >= PT_RISE_PASS_MIN_C && riseC <= PT_RISE_PASS_MAX_C,
  };
}
