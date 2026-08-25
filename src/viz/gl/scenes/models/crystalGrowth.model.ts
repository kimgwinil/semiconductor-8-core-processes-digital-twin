/**
 * `crystalGrowth`(CZ 핫존 수직 종단면) 씬의 **계산 정본**. 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳:
 *   · `scenes/crystalGrowth.ts` — 아래 값을 GLSL 리터럴/유니폼으로 **주입**한다. 셰이더에 손으로 적은
 *     파생값 숫자는 없다(기하 배치 상수는 예외 — 아래 「기하 배치」 절 참조).
 *   · ✅ `gl/fallback2d.ts` 의 `drawCrystalGrowth` — **이 파일의 함수를 호출한다.** 식을 옮겨 적지 않는다(2026-08-22 등재).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 **2026-08-21 DSN S-D 확정명세로 전면 재작성.** `DSN-8대공정-001.SD.md` §2 가 정본이다.
 *
 * 이 씬의 **입력은 7키뿐**이고(`models/labs/wafer.ts` 의 `waferBasicSceneMap`·`waferAppliedSceneMap`·
 * `waferAdvancedSceneMap` 이 만든다), 전부
 * **물리량의 절대 앵커**를 갖는 0~1 값이다 — 랩 **출력**(diameterMm·vgRatio·oxygenE17 등)이 아니다.
 * 세 칸(basic·applied·advanced)이 **같은 앵커·같은 식**을 쓴다. 씬은 자기가 어느 칸에 붙었는지 모른다 —
 * 칸마다 다른 것은 「어떤 키가 조작되고 어떤 키가 상수로 고정되는가」뿐이다(그 판단은 wafer.ts 소관).
 *
 *   pullRate         0.2 → 3.0 mm/min  (D-1: 바디 폭 · D-2: 메니스커스 링 · D-3: 계면 볼록도 · D-10: 파셋 스크롤)
 *   thermalGradient  15  → 60  K/cm    (D-4: 등온선 간격·개수 · D-6: 열응력 표시)
 *   crystalRotation  5   → 30  rpm     (D-7: 등온선 좌우 비대칭 · D-8: 결정 회전 주기)
 *   crucibleRotation 2   → 20  rpm     (D-8: 도가니 회전 주기 · D-9: 내벽 미립 생성률)
 *   argonFlow        20  → 120 slm     (D-10: SiO 흄 알파 · 분말층 두께)
 *   chamberPressure  로그축(P/10, 밑수 76) (D-10: SiO 흄 알파)
 *   solidFraction    대응 lab 입력 없음 — 항상 0. **애니메이션하지 않는다**(DSN §2-5 #14).
 *
 * 🔴 **씬이 직접 되계산하는 것 — V–I 경계(D-5) 하나뿐이다.** ξ = 10·V/G 를 `pullRate`·`thermalGradient`
 *    두 키에서 다시 구한다. 판정창(ξ_lo·ξ_hi)은 **`models/labs/wafer.ts` 가 export 하는 `VG_PASS_MIN/MAX`
 *    를 그대로 가져다 쓴다** — DSN §2-3 D-5 가 "VG_PASS_MIN/MAX 그 자체다"라고 못박았다. 물리층
 *    `XI_CRIT_ADJUSTED_MIN/MAX`(S101)에서 유도된 값이며 여기서 다시 계산하지 않는다(정본은 하나).
 *    바디 폭(D-1)의 물리 계수(260·32·3.0e-4)도 마찬가지로 `wafer.ts` 가 export 하는
 *    `DIAMETER_INTERCEPT_MM`/`DIAMETER_SLOPE_MM_PER_MM_PER_MIN` 을 가져다 쓴다(A6-b 합성식 — 문헌식이
 *    아니다. `wafer.ts` 머리말 참조). 물리 앵커(뒤 4개 rpm/K·cm 구간)도 `wafer.ts` 의 `*_RANGE` 상수를
 *    그대로 가져다 쓴다 — **앵커가 두 파일에 따로 적히면 언젠가 갈린다**(이 파일들의 공통 원칙).
 *
 * 🔴 **그 밖의 파생값은 전부 이 파일의 「화면 배치값」이다** — DSN §2-3 D-1~D-10 공식 그대로이며,
 *    ①(물리층 유도)·②(화면 배치)·🟡(PLN 교육설정) 표시는 DSN 원문 표시를 그대로 옮겼다.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 **facet 대비를 pullRate 에 매지 않는다.** 이전 판은 `facetContrast ∝ (1 − pullRate)` 로 인상속도가
 *    오르면 성장 파셋이 옅어지다 사라지게 했는데, 이것이 그리는 그림은 **DSN §2-5 #7 「구조 손실(파셋
 *    소실 애니메이션) — 구현하지 마라」와 같다.** 그래서 대비는 상수로 고정하고, `pullRate` 는
 *    **스크롤 속도만**(D-10, WB-4) 바꾼다.
 * 🔴 **챔버 산란 헤이즈를 뺐다.** 이전 판은 `chamberPressure` 에 추가로 안개 효과를 걸었는데, DSN §2-3
 *    D-10 이 이 키에 명시한 효과는 **SiO 흄 알파 하나뿐**이다. 근거 없는 추가 시각 결합을 만들지 않는다(A15).
 *
 * 좌표계: UV. 세로 0~1, **위가 +**. 셰이더와 같다.
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';
import {
  DIAMETER_INTERCEPT_MM, DIAMETER_SLOPE_MM_PER_MM_PER_MIN,
  PULL_RANGE_ADV_MM_PER_MIN, GRADIENT_RANGE_K_PER_CM, CRYSTAL_RPM_RANGE, CRUCIBLE_RPM_RANGE,
  VG_PASS_MIN, VG_PASS_MAX,
} from '../../../../models/labs/wafer';

/* ══════════════ 기하 배치 (전부 화면 배치값 — `xs_wafer.svg` 실측, DSN §2-2 표 정본) ══════════════ */

/* 🔴 인상축(회전축)의 가로 위치 `AXIS_X` 는 **`layout.model.ts` 가 정본**이다.
   `aerialImage.model.ts` 와 각자 선언해 `check-constants` R1 이 발화했다(2026-08-21).
   여기서 다시 선언하지 마라 — 쓰는 쪽이 `layout.model` 에서 직접 가져간다. */

/**
 * 융액 **자유표면**의 높이 — 🔴 `solidFraction` 이 움직이는 유일한 기하(D-11, 팀장 지시 2026-08-21).
 *
 * 정본 좌표(이미지 v, `xs_wafer.svg` viewBox 1600×900 실측):
 *   · `solidFraction = 0`(정지 기하 — 세 칸 모두 항상 이 값) → **자유표면 v = 0.622**
 *   · `solidFraction = 1`(융액이 전량 결정으로 바뀐 극단) → **도가니 내부 바닥 v = 0.744**(DSN §2-0)
 * 두 앵커 사이를 선형 보간한다 — 결정이 자랄수록(고화율↑) 융액 부피가 줄어 액면이 도가니 바닥 쪽으로
 * 내려간다는 CZ 공정의 실제 물리와 같은 방향이다. **세 칸 어디에도 `solidFraction` 을 조작하는 lab
 * 입력이 없어 값은 항상 0 이고, 그래서 화면은 항상 `MELT_SURFACE_V` 앵커로만 보인다** — 이는 게이트가
 * "이 키를 읽는가" 를 판정하는 문제이지 "지금 이 키가 화면을 바꾸는가" 를 판정하는 문제가 아니다
 * (§2-5 #14 — solidFraction 을 자체 타이머로 애니메이션하지 말라는 것과는 별개다. 이 키는 여전히
 * lab 입력이 생기기 전까지 정지해 있고, 그 정지값에서 정지 기하가 정확히 나오는지만 검증한다).
 *
 * 🔴 이미지 좌표는 **위가 0** 이고 UV 는 **아래가 0** 이므로 `1 − v` 로 뒤집어 쓴다.
 *    (뒤집는 것을 잊으면 융액이 잉곳 위로 올라온다 — 실제로 흔한 사고다.)
 * 🔴 `MELT_BOTTOM`(아래)과 다른 값이다 — `MELT_BOTTOM` 은 도가니·서셉터 조립체의 **고정** 하단
 *    가장자리(20종 상시 요소 표, 움직이지 않는다)이고, 여기 `CRUCIBLE_INNER_BOTTOM_V` 는 그 안쪽
 *    빈 공간(캐비티)의 바닥 — `solidFraction` 이 자유표면을 밀어 내려도 닿을 수 있는 하한이다.
 */
export const MELT_SURFACE_V = 0.622;
export const CRUCIBLE_INNER_BOTTOM_V = 0.744;

/** 넥 반폭 · 넥/숄더/바디 경계 높이. */
export const NECK_HALF = 0.013;
export const NECK_TOP = 0.895;
export const SHOULDER_TOP = 0.775;
/** 시드척(잉곳 위 금속 척)의 아래 끝과 반폭. */
export const CHUCK_BOTTOM = 0.935;
export const CHUCK_HALF = 0.034;

/** 석영 도가니 · 흑연 서셉터 · 융액 바닥. */
export const CRUCIBLE_HALF = 0.285;
export const CRUCIBLE_WALL = 0.028;
export const SUSCEPTOR_WALL = 0.026;
export const MELT_BOTTOM = 0.108;

/** 미앤더 히터(좌·우) 띠와 바닥 히터. 🔴 주황~백열색은 **히터에만** 쓴다(조사 A §F-5). */
export const HEATER_INNER = 0.345;
export const HEATER_OUTER = 0.398;
export const HEATER_TOP = 0.470;
export const HEATER_BOTTOM = 0.090;
export const BOTTOM_HEATER_TOP = 0.072;
export const BOTTOM_HEATER_BOTTOM = 0.040;
export const BOTTOM_HEATER_HALF = 0.320;
/** 히터 미앤더의 세로 주기(굽이 수를 정하는 화면값). */
export const HEATER_MEANDER_FREQ = 46.0;

/** 단열재 띠(히터 바깥). */
export const INSULATION_OUTER = 0.462;

/** 열차폐(융액 위 원뿔형 차폐) — 안쪽/바깥 반폭과 높이. */
export const SHIELD_INNER_HALF = 0.150;
export const SHIELD_OUTER_HALF = 0.250;
export const SHIELD_BOTTOM = 0.415;
export const SHIELD_TOP = 0.560;

/** 뷰포트(냉벽) 창 — 오른쪽 챔버벽. 응축 분말층이 여기 쌓인다. */
export const VIEWPORT_X = 0.474;
export const VIEWPORT_Y0 = 0.640;
export const VIEWPORT_Y1 = 0.790;

/** 회전 원호 화살표 2개의 반경 · 중심 높이. */
export const CRYSTAL_ARC_RADIUS = 0.150;
export const CRYSTAL_ARC_Y = 0.700;
export const CRUCIBLE_ARC_RADIUS = 0.185;
export const CRUCIBLE_ARC_Y = 0.245;

/** 도가니 내벽에서 올라오는 미립 표시 — 최대 슬롯 수와 점 크기(화면 배치값). */
export const PARTICLE_SLOTS = 12;
export const PARTICLE_RISE_MIN = 0.05;
export const PARTICLE_RISE_MAX = 0.20;
export const PARTICLE_SIZE = 0.0048;

/** 아르곤 유선 — 최소·최대 가닥 수와 하강 속도(화면 배치값. DSN §2-2 「아르곤 유선 개수·속도」). */
export const ARGON_LINES_MIN = 3.0;
export const ARGON_LINES_MAX = 11.0;
export const ARGON_SPEED_MIN = 0.06;
export const ARGON_SPEED_MAX = 0.34;

/** SiO 흄 스트림이 체류하는 높이 밴드(자유표면 위, UV). */
export const FUME_SPAN = 0.150;

/** 잉곳 상승 애니메이션 — 성장 파셋(습관선) 줄무늬의 세로 주기와 대비(대비는 상수 — 위 머리말 참조). */
export const FACET_FREQ = 58.0;
export const FACET_CONTRAST = 0.13;

/** 등온선 최대 가닥 수(GLSL 루프 상한 — 컴파일타임 상수). 실제 개수는 D-4 식이 정한다(≤ 이 값). */
export const ISOTHERM_COUNT_MAX = 5;

/* ══════════════ D-1~D-10 계수 (DSN §2-3 확정명세 그대로) ══════════════ */

/** D-1 ① `pullRate` → 바디 폭. `SCALE_D` = 도해 실측 「바디 폭 96 px ↔ 200 mm」의 환산(과장 아님 — 실척). */
const SCALE_D_U_PER_MM = 3.0e-4;

/** D-2 ② 메니스커스 링 지름 = 바디 폭의 10 %(배치값). */
const MENISCUS_DIAMETER_RATIO = 0.10;

/** D-3 🟡 계면 볼록도(PLN 교육설정 — 방향 근거는 조사 A 에 없다). pullRate=0 에서 바디 폭 대비 35.1 %. */
const SAGITTA_RATIO_AT_ZERO = 0.351;
/** 가로(u)↔세로(v) 배율 보정. 캔버스가 16:9 라서 필요하다. */
const CANVAS_ASPECT = 16 / 9;

/** D-4 ① 등온선 간격 상수(u·K/cm) — PLN 델타 #2(20 px→11 px, G 25→45)와 자체 정합하는 앵커. */
const ISOTHERM_SPACING_CONST = 0.5556;
/** D-4 등온선 개수 계수 — 「바디 상단(v 0.489)을 넘는 선은 그리지 않는다」에서 나온 값. */
const ISOTHERM_COUNT_COEF = 0.133;

/** D-6 ② 열응력 해칭 불투명도 = 0.10 + 0.55·thermalGradient(배치값). */
const STRESS_SHADE_BASE = 0.10;
const STRESS_SHADE_SLOPE = 0.55;

/** D-7 🟡 계면 등온선 좌우 비대칭(정성 · 조사 A §G 미확인 #3). ρ = 8.0% − 7.5%·crystalRotation. */
const ISOTHERM_ASYM_BASE = 0.08;
const ISOTHERM_ASYM_SLOPE = 0.075;

/** D-9 ② 도가니 내벽 미립 생성률의 화면 상한(개/초 상당) — 앵커 상한(ω_cr=20)에서 슬롯이 꽉 찬다. */
const PARTICLE_GEN_RATE_MAX_RPM = CRUCIBLE_RPM_RANGE[1];

/** D-10 ② SiO 흄 알파 계수. 🔴 chamberPressure 의 비단조 반전은 위치 미확인이라 그리지 않는다(A15) —
 *  여기 구현은 단조이고, `DirectionRule` 은 `non-monotonic` 으로 씬 카탈로그에 선언한다(어긋남은 의도). */
const FUME_ALPHA_BASE = 0.55;
const FUME_ARGON_COEF = 0.75;
const FUME_PRESSURE_BASE = 0.50;
const FUME_PRESSURE_SLOPE = 0.50;
/** D-10 ② 뷰포트·냉벽 응축 분말층 두께 상한(UV, = 캔버스 높이의 0.90 %). */
const POWDER_MAX_V = 0.0090;
/** D-10 ② 파셋 줄무늬 스크롤 속도 계수(v/s per mm/min). `EXAGG_PULL=2000` 이 이미 녹아 있다 —
 *  검산: 1.5 mm/min · 0.01 = 0.015 v/s = 13.5 px/s @900(DSN §2-2 EXAGG_PULL 표와 일치). */
const PULL_ANIM_COEF = 0.01;

/* ══════════════ 재료색 (화면 배치값) ══════════════
 * 🔴 **실리콘 융액은 주황이 아니다.** 1,414 °C 이상 융액은 흰빛에 가깝고 표면은 거울처럼 반사한다.
 *    주황~백열(`MELT_HEATER_*`)은 **히터에만** 쓴다(조사 A §F-5 정정).
 */
export type Rgb = readonly [number, number, number];

/** 융액(실리콘) — `--xs-melt-si` / 하이라이트 `--xs-melt-si-hi`. */
export const COLOR_MELT_SI: Rgb = [0.80, 0.83, 0.87];
export const COLOR_MELT_SI_HI: Rgb = [0.96, 0.97, 1.0];
/** 히터(주황~백열) — `--xs-melt`. 융액에 쓰지 않는다. */
export const COLOR_HEATER: Rgb = [0.96, 0.55, 0.20];
export const COLOR_HEATER_HOT: Rgb = [1.0, 0.86, 0.58];
/** 결정(잉곳) — 회색 실리콘. 판정색을 섞지 않는다(씬명세 §6-4). */
export const COLOR_CRYSTAL: Rgb = [0.46, 0.49, 0.545];
/** 석영 도가니(반투명 유백) · 흑연 서셉터 · 단열재 · 챔버벽. */
export const COLOR_QUARTZ: Rgb = [0.68, 0.72, 0.76];
export const COLOR_GRAPHITE: Rgb = [0.20, 0.21, 0.235];
export const COLOR_INSULATION: Rgb = [0.30, 0.28, 0.26];
export const COLOR_CHAMBER: Rgb = [0.085, 0.10, 0.135];
/** 열차폐 · 시드척(금속). */
export const COLOR_SHIELD: Rgb = [0.28, 0.30, 0.34];
export const COLOR_CHUCK: Rgb = [0.52, 0.55, 0.60];
/** 아르곤 유선 · SiO 흄 · 응축 분말 · 등온선 · V–I 경계선 · 미립. */
export const COLOR_ARGON: Rgb = [0.55, 0.78, 0.92];
export const COLOR_FUME: Rgb = [0.72, 0.74, 0.70];
export const COLOR_POWDER: Rgb = [0.80, 0.81, 0.78];
export const COLOR_ISOTHERM: Rgb = [0.72, 0.80, 0.95];
export const COLOR_VI_LINE: Rgb = [0.60, 0.86, 0.84];
/** 🔴 도가니 침식 미립 — **갈색·반점 형태 금지**(조사 A 근거 0건). 무채색 점으로만 그린다. */
export const COLOR_PARTICLE: Rgb = [0.78, 0.80, 0.82];
/** 메니스커스 링 — 프레임 최고휘도. */
export const COLOR_MENISCUS: Rgb = [1.0, 0.99, 0.94];

/* ══════════════ 파생값 ══════════════ */

export interface CrystalGrowthModel {
  /** 잉곳 바디 반폭(UV). D-1. */
  bodyHalf: number;
  /** 융액 자유표면 높이(UV). D-11 — `solidFraction` 에서 유도. 0 이면 항상 `MELT_SURFACE_V` 값. */
  meltSurfaceV: number;
  /** 메니스커스 링 반경(UV) — 바디 폭의 10 %(지름) 의 절반. D-2. */
  meniscusRadius: number;
  /** 고액계면이 융액 쪽으로 파고드는 깊이(UV). 0 이면 평탄. D-3. */
  convexDepth: number;
  /** 등온선 간격(UV) — `= ISOTHERM_SPACING_CONST / G`. D-4. */
  isothermSpacing: number;
  /** 등온선 실제 가닥 수(1 ≤ n ≤ ISOTHERM_COUNT_MAX). D-4. */
  isothermCount: number;
  /** 계면 등온선의 좌우 비대칭 진폭(셰이더 내부 규약 — `2·isothermSpacing·isothermAsym` = Δv). D-7. */
  isothermAsym: number;
  /** V–I 경계 세로선의 반경(결정 반폭 대비 비율, 0~1). 0 이면 두 가닥이 축에서 만난다. D-5. */
  viRadius: number;
  /** 시드(결정) 회전 각속도 — 실제 회전 주기 그대로(rev/s). 부호 +. D-8. */
  crystalOmega: number;
  /** 도가니 회전 각속도 — 실제 회전 주기 그대로(rev/s). 🔴 부호가 결정과 **항상 반대**다. D-8. */
  crucibleOmega: number;
  /** 도가니 내벽 미립의 활성 슬롯 수(0~PARTICLE_SLOTS)와 상승 속도. D-9. */
  particleCount: number;
  particleRise: number;
  /** 아르곤 유선 가닥 수와 하강 속도(화면 배치값, 방향만 근거). */
  argonLines: number;
  argonSpeed: number;
  /** SiO 흄 농도(밴드 평균 알파). D-10. */
  fumeDensity: number;
  /** 뷰포트·냉벽 응축 분말층 두께(UV). D-10. */
  powderThickness: number;
  /** 성장 파셋(습관선) 줄무늬의 대비(상수)와 이동 속도(D-10). */
  facetContrast: number;
  pullAnimSpeed: number;
  /** 결정 표면 열응력 표시 농도. D-6. */
  stressShade: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 앵커 [lo,hi] 로 0~1 을 물리값으로 되돌린다 — `wafer.ts` 의 `norm()` 의 역함수. */
const unlerpRange = (t: number, range: readonly [number, number]): number => lerp(range[0], range[1], t);

export function crystalGrowthModel(params: SceneParams): CrystalGrowthModel {
  // 🔴 7키 전부 이미 0~1 로 정규화되어 들어온다(`wafer.ts` 가 물리 앵커로 정규화해 넘긴다).
  const pullRate = pick(params, 'pullRate', 0.4643); // 기본값 ≈ V 1.5 mm/min
  const thermalGradient = pick(params, 'thermalGradient', 0.2222); // 기본값 = G 25 K/cm
  const crystalRotation = pick(params, 'crystalRotation', 0.52); // 기본값 = ω_c 18 rpm
  const crucibleRotation = pick(params, 'crucibleRotation', 0.5556); // 기본값 = ω_cr 12 rpm
  const argonFlow = pick(params, 'argonFlow', 0.2); // 기본값 = Q_Ar 40 slm
  const chamberPressure = pick(params, 'chamberPressure', 0.2537); // 기본값 = P_ch 30 torr(log)
  // 🔴 solidFraction: 대응 lab 입력이 없어 세 칸 모두 항상 0 이다(map() 은 리터럴 0 을 넘긴다).
  //    그래도 실제로 읽어 자유표면 높이(D-11, 아래)를 유도한다 — 「넘기는데 안 읽는 키」를 만들지 않는다.
  const solidFraction = pick(params, 'solidFraction', 0);

  /* ── D-11: solidFraction → 융액 자유표면 높이 (신설 — 팀장 지시 2026-08-21) ──
   * 이미지 v 로 0.622(g=0) → 0.744(g=1) 선형 보간 후 UV 로 뒤집는다. g 는 항상 0 이라 오늘의 화면은
   * 항상 meltSurfaceV = 1 − 0.622 = 0.378 이지만, 이 값을 실제로 쓰는 것은 씬 쪽(크루서블 밴드·
   * 잉곳 놓임·메니스커스 링·흄 밴드가 전부 이 필드를 uMeltSurface 유니폼으로 받는다)이다. */
  const meltSurfaceImageV = lerp(MELT_SURFACE_V, CRUCIBLE_INNER_BOTTOM_V, solidFraction);
  const meltSurfaceV = 1 - meltSurfaceImageV;

  /* ── D-1: pullRate → 결정 바디 폭 ① ── */
  const vMmPerMin = unlerpRange(pullRate, PULL_RANGE_ADV_MM_PER_MIN);
  const diameterMm = DIAMETER_INTERCEPT_MM - DIAMETER_SLOPE_MM_PER_MM_PER_MIN * vMmPerMin;
  const bodyWidthU = diameterMm * SCALE_D_U_PER_MM;
  const bodyHalf = bodyWidthU / 2;

  /* ── D-2: 메니스커스 링 반경 — 지름이 바디 폭의 10 %(배치값) ── */
  const meniscusRadius = (MENISCUS_DIAMETER_RATIO * bodyWidthU) / 2;

  /* ── D-3: 계면 볼록도(sagitta) 🟡 PLN 교육설정 ── */
  const sagittaRatio = SAGITTA_RATIO_AT_ZERO * (1 - pullRate);
  const convexDepth = sagittaRatio * bodyWidthU * CANVAS_ASPECT;

  /* ── D-4: thermalGradient → 등온선 간격·개수 ① ── */
  const gradientKPerCm = unlerpRange(thermalGradient, GRADIENT_RANGE_K_PER_CM);
  const isothermSpacing = ISOTHERM_SPACING_CONST / gradientKPerCm;
  const isothermCount = Math.min(
    ISOTHERM_COUNT_MAX,
    Math.max(0, Math.floor((ISOTHERM_COUNT_COEF * gradientKPerCm) / ISOTHERM_SPACING_CONST)),
  );

  /* ── D-5: pullRate·thermalGradient → V–I 경계 ① (씬이 직접 되계산 — outputs 를 받지 않는다) ── */
  const xi = (10 * vMmPerMin) / gradientKPerCm;
  const viRadius = clamp01((xi - VG_PASS_MIN) / (VG_PASS_MAX - VG_PASS_MIN));

  /* ── D-6: thermalGradient → 열응력 표시 ② (명도만 — 판정색 금지) ── */
  const stressShade = STRESS_SHADE_BASE + STRESS_SHADE_SLOPE * thermalGradient;

  /* ── D-7: crystalRotation → 계면 등온선 좌우 비대칭 ② 🟡 정성 ──
   * ρ(바디 폭 대비) = 8.0% − 7.5%·crystalRotation. Δv = ρ·bodyWidth·(16/9).
   * 셰이더는 `base = interfaceY + isoSpacing·isoAsym·(x−axis)/bodyHalf` 로 등온선 다발을 기울이므로
   * 에지(x = ±bodyHalf)에서의 높이차가 `2·isoSpacing·isoAsym` 이 되도록 역산한다. */
  const asymRho = ISOTHERM_ASYM_BASE - ISOTHERM_ASYM_SLOPE * crystalRotation;
  const isothermDeltaV = asymRho * bodyWidthU * CANVAS_ASPECT;
  const isothermAsym = isothermDeltaV / (2 * Math.max(isothermSpacing, 1e-4));

  /* ── D-8: crystalRotation·crucibleRotation → 회전 표시 ① (배율 1.0 — 실제 회전 주기 그대로) ──
   * 부호: 결정 = +(시계), 도가니 = −(반시계). 부호곱은 전 구간에서 < 0 이어야 한다(§F-7). */
  const crystalRpm = unlerpRange(crystalRotation, CRYSTAL_RPM_RANGE);
  const crucibleRpm = unlerpRange(crucibleRotation, CRUCIBLE_RPM_RANGE);
  const crystalOmega = crystalRpm / 60; // rev/s = 1/period(60/rpm)
  const crucibleOmega = -(crucibleRpm / 60);

  /* ── D-9: crucibleRotation → 도가니 내벽 미립 생성률 ② (배치값) ── */
  const particleCount = PARTICLE_SLOTS * clamp01(crucibleRpm / PARTICLE_GEN_RATE_MAX_RPM);
  const particleRise = lerp(PARTICLE_RISE_MIN, PARTICLE_RISE_MAX, crucibleRotation);

  /* ── D-10: argonFlow·chamberPressure → SiO 흄·분말층·파셋 스크롤 ② ── */
  const fumeDensity = FUME_ALPHA_BASE * (1 - FUME_ARGON_COEF * argonFlow)
    * (FUME_PRESSURE_BASE + FUME_PRESSURE_SLOPE * chamberPressure);
  const powderThickness = POWDER_MAX_V * (1 - argonFlow);
  const pullAnimSpeed = PULL_ANIM_COEF * vMmPerMin;

  return {
    bodyHalf,
    meltSurfaceV,
    meniscusRadius,
    convexDepth,
    isothermSpacing,
    isothermCount,
    isothermAsym,
    viRadius,
    crystalOmega,
    crucibleOmega,
    particleCount,
    particleRise,
    argonLines: lerp(ARGON_LINES_MIN, ARGON_LINES_MAX, argonFlow),
    argonSpeed: lerp(ARGON_SPEED_MIN, ARGON_SPEED_MAX, argonFlow),
    fumeDensity,
    powderThickness,
    // 🔴 대비는 pullRate 에 매지 않는다 — 「구조 손실」로 읽히는 것을 막는다(위 머리말 참조).
    facetContrast: FACET_CONTRAST,
    pullAnimSpeed,
    stressShade,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
