/**
 * `aerialImage`(ArF 침지 노광 — 광축을 포함하는 수직 종단면 + 퓨필 인셋) 씬의 **계산 정본**.
 * 🔴 GLSL 문자열 없음(`models/README.md`).
 *
 * 쓰는 곳:
 *   · `scenes/aerialImage.ts` — 아래 값을 GLSL 리터럴로 **주입**한다.
 *   · ✅ `gl/fallback2d.ts` 의 `drawAerialImage` — **이 파일의 함수를 호출한다.** 식을 옮겨 적지 않는다(2026-08-22 등재).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 **정본은 `DSN-8대공정-001.SD.md` §3(3-0~3-7)이다.** 이 씬은 `photo` 3칸(기초·응용·심화)
 *    공용이고, 세 칸은 **완전히 같은 것**을 그린다 — 다른 것은 `photo.ts` 의 `map()` 이 아래 6키
 *    중 어느 것을 조작 입력에서, 어느 것을 상수로 넘기느냐뿐이다(SD §0 표 1). 이 모듈은 **자기가
 *    어느 칸에 붙었는지 모른다.**
 *
 * 🔴 **`SceneParams` 계약은 정확히 6키다** (SD §3-0·§3-1). 그 밖의 키를 읽지 않는다.
 *   `na` · `defocus` · `exposureDose` · `resistThickness` · `lineWidth` · `fringeAmplitude`
 *
 * 🔴 **물리층에서 받아 오는 값** — 씬이 계수를 지어내지 않는다.
 *    `models/physics/photo/rayleigh.ts` 의 `withSource` 상수를 그대로 받는다:
 *      · `N_WATER_193`       침지수 굴절률 @193 nm (S140) — 광 원뿔 반각 `sinθ = NA/n` 의 분모.
 *        🔴 SD §3-3 P-2 는 편의상 `n = 1.44` 리터럴을 쓰지만, 이 모듈은 **물리층 소스 1.436 을
 *        그대로 쓴다** — 지어낸 상수를 하나 줄이는 선택이고, SD 가 선언한 불변식
 *        `sinθ/NA = 0.69444 ± 2%` 오차 허용 안에 들어온다(실측 0.278 % 이내, 아래 검산 참조).
 *      · `K2_ARF_IMMERSION`  ArF 침지 k₂ = 0.745 (S149) — DOF 계수 143.785 = k₂ × λ 의 재료.
 *      · `ARF_LAMBDA`        193 nm (S140).
 *      · `NA_IMMERSION_MAX`  1.35 (S140·S149) — `na` 키 앵커 상한과 **자기 검산**(아래 참조).
 *
 * 🔴 **`na` 키 앵커는 SD 가 리터럴로 확정한 [0.60, 1.35]다** — 우리 물리층에 0.60 이라는 수는
 *    없지만, 이 씬 키의 정규화 구간 자체가 `DSN-8대공정-001.SD.md` §3-0·§3-1 이 정한 정본이고
 *    `photo.ts` 의 `map()` 이 **같은 리터럴**로 정방향 변환을 한다 — 두 끝이 어긋나면 그 순간
 *    거짓 NA 가 복원된다. 상한은 **물리 상수와 우연히 일치**한다: `0.60 + 0.75 = 1.35 =
 *    NA_IMMERSION_MAX.value` — 이 등식이 앵커가 살아 있다는 자기 검산이다.
 *    (이전 구현은 `[NA_DRY_MAX(0.93), NA_IMMERSION_MAX(1.35)]` 를 썼다 — SD 확정 전 버전이며
 *    `photo.ts` 의 정방향 변환과 앵커가 어긋나 있었다. 이번에 SD 리터럴로 교체했다.)
 *
 * 🔴 **세로 nm 자 · 가로 nm 자 — SD §3-2 표시 배율.**
 *    `M_z`(축방향) = 3.8889×10⁻⁴ v/nm — 앵커: 심화 상한 900 nm → 0.350 v.
 *    `M_x`(횡방향) = 5.0×10⁻⁴ u/nm — 앵커: 피치 120 nm → 0.060 u.
 *    이방 과장비 2.29:1 은 등방으로는 900 nm 가 프레임에 안 들어가기 때문(SD §3-2 승인 대상 P-Q2).
 *    DOF(초점 허용 띠)·ΔF(초점면 이동)·레지스트 두께가 **전부 같은 `M_z`** 를 쓰므로
 *    「DOF 100 nm 가 레지스트 300 nm 보다 얇다」가 화면에서 그대로 성립한다.
 *
 * 🔴 **레지스트 성장 방향 — SD 표와 다른 선택(알려진 이탈 1건, 기록 파일 참조).**
 *    SD §3-2 는 레지스트 **상면**(갭 쪽)을 고정하고 하면(웨이퍼 쪽)이 두께만큼 내려간다고 적었다
 *    (`웨이퍼 척 ... 레지스트가 두꺼워지면 아래로 밀려 프레임 밖으로`). 이 모듈은 대신
 *    **웨이퍼 상면(`SUBSTRATE_TOP`)을 고정**하고 레지스트가 위(갭 쪽)로 자라는 배치를 쓴다 —
 *    PX-11(세로 두께 증가) 자체는 동일하게 성립하고, 좌표계도 SD 는 좌상 원점(v 증가 = 아래)인데
 *    이 GLSL 은 좌하 원점(`vUv`, v 증가 = 위)이라 SD 표의 리터럴 v 를 그대로 옮기면 상하가
 *    뒤집힌다. 전면 좌표 재배치는 이번 작업 범위 밖으로 남겼다 — `threads/parts/씬-photo-
 *    aerialImage.md` 참조.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 좌표계: UV. 세로 0~1, **위가 +**.
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';
import { ARF_LAMBDA, K2_ARF_IMMERSION, NA_IMMERSION_MAX, N_WATER_193 } from '../../../../models/physics/photo/rayleigh';

/* ══════════ 물리층에서 받아 오는 값(화면 배치값 아님) ══════════ */

/** 침지수 굴절률 @193 nm — `sinθ = NA/n` 의 분모. S140. */
export const IMMERSION_INDEX = N_WATER_193.value;

/** DOF 계수 — SD §3-3 P-1: `143.785 = K2_ARF_IMMERSION(0.745, S149) × λ(193 nm, S140)`. */
export const DOF_COEF_NM = K2_ARF_IMMERSION.value * ARF_LAMBDA.value;

/* ══════════ SD §3-0·§3-1 확정 앵커 — 씬 `na` 키 ══════════ */

/** 씬 `na` 키 0 지점. SD 리터럴. `photo.ts` 의 `map()` 정방향 변환과 반드시 같은 값이어야 한다. */
export const NA_SCENE_MIN = 0.60;
/** 씬 `na` 키의 전체 폭(NA 단위). */
export const NA_SCENE_SPAN = 0.75;
/** 씬 `na` 키 1 지점. 🔴 물리 상수와 우연히 일치 — 앵커가 살아 있다는 자기 검산(주석 위 참조). */
export const NA_SCENE_MAX = NA_SCENE_MIN + NA_SCENE_SPAN;

/* ══════════ SD §3-2 표시 배율 ══════════ */

/** 세로 nm 자 — 앵커: 900 nm(심화 레지스트 두께 상한) → 0.350 v. */
export const M_Z_V_PER_NM = 0.350 / 900;
/** 가로 nm 자 — 앵커: 피치 120 nm → 0.060 u. */
export const M_X_U_PER_NM = 0.060 / 120;

/** 레지스트 라인 피치(SD §1-B: 피치 120 nm · 라인 45 · 스페이스 75). */
export const PITCH_NM = 120;
export const PITCH_UV = PITCH_NM * M_X_U_PER_NM; // = 0.060
export const LINE_COUNT = 3;

/**
 * 정재파 주기 P_sw = λ/(2·n_r) — SD §3-3 P-6. `n_r ≈ 1.70` 은 `photo.ts` 의
 * `STANDING_WAVE_PERIOD_NM` 과 **같은 출처(S141 「정재파 주기 λ/2n₂, n≈1.7」)의 같은 값**이다.
 * 🔴 지어낸 계수가 아니다 — `rayleigh.ts` 가 레지스트 굴절률을 내보내지 않아 여기서 문헌값을
 *    다시 적었을 뿐이다(계층 규칙상 이 폴더는 `models/labs/*` 를 import 하지 않는다 — README).
 */
const RESIST_INDEX_S141 = 1.70;
export const STANDING_WAVE_PERIOD_NM = ARF_LAMBDA.value / (2 * RESIST_INDEX_S141); // 56.7647 nm

/**
 * 측벽 정재파 줄무늬 간격(v) — **상수. 전 파라미터 구간에서 불변**(SD §3-3 P-6 🔴).
 * 파장·레지스트 굴절률만의 함수이고 둘 다 이 씬의 파라미터가 아니므로, `resistThickness` 가
 * 바뀌어도 이 값은 바뀌지 않는다 — 그래서 uniform 이 아니라 **모듈 상수**로 둔다(구조로 강제).
 */
export const SW_SPACING_V = STANDING_WAVE_PERIOD_NM * M_Z_V_PER_NM; // = 0.022075

/**
 * SWA_scr 계수 — SD §3-3 P-3. `photo.ts` 의 `SWA_IDEAL_DEG`(88)·`SWA_DEFOCUS_COEF`(18) 와
 * **같은 값**이다(SD: "계수를 발명하지 않았다"). 🔴 이 씬의 측벽각은 랩 게이지 `swaDeg` 와
 * 다르게 그린다 — 씬은 σ_D 를 모르므로 반사 항을 넣지 않는다(SD 명시).
 * 🔴 이름을 `photo.ts` 와 **일부러 다르게**(`SCENE_` 접두) 지었다 — labs 는 viz 를 import 할 수
 *    없어 그쪽을 정본으로 가져올 수 없고, 이름까지 같으면 `check-constants` R1/R3(정본 둘)이
 *    잡는다. 두 파일 다 SD §3-3 P-3 리터럴을 그대로 옮겼을 뿐 이 파일이 계수를 발명한 것이 아니다.
 */
const SCENE_SWA_IDEAL_DEG = 88;
const SCENE_SWA_DEFOCUS_COEF = 18;
const SCENE_SWA_MIN_DEG = 30;

/** 스캔 화살표 길이 계수 — SD §3-3 P-4. 3.00 은 화면 배치값(물리 계수 아님, UI 미표기). */
const SCAN_LEN_COEF = 3.00;
/** 노광량 앵커 — SD §3-1 NORM_E. 공통(칸 무관) 10 → 80 mJ/cm². */
const DOSE_MIN_MJ = 10;
const DOSE_SPAN_MJ = 70;

/** CD 앵커 — `photo.ts` `FOCUS_CHART_CD_MIN/MAX_NM` 그 자체(SD §3-3 P-5). */
const CD_MIN_NM = 20;
const CD_SPAN_NM = 50;

/** 레지스트 두께 앵커 — SD §3-1 NORM_T. */
const RESIST_T_MIN_NM = 60;
const RESIST_T_SPAN_NM = 840;

/** 초점 오프셋 전체 폭(nm) — SD §3-1 NORM_DF: `(ΔF + 150)/300`. */
const DEFOCUS_SPAN_NM = 300;

/* ══════════ 기하 배치 (전부 화면 배치값) ══════════ */

/* 🔴 광축의 가로 위치 `AXIS_X` 는 **`layout.model.ts` 가 정본**이다(2026-08-21 · check-constants R1).
   여기서 다시 선언하지 마라. */

/** 웨이퍼(기판) 상면 = 레지스트 하면. 고정 기준점(위 머리말 「레지스트 성장 방향」 참조). */
export const SUBSTRATE_TOP = 0.195;

/** 최종 렌즈면(볼록 하면)과 배럴. */
export const LENS_BOTTOM = 0.610;
export const LENS_TOP = 0.905;
export const LENS_SAG = 0.052;
export const BARREL_HALF = 0.330;

/**
 * 🔴 **국소 갭** — 액침을 「수조」로 그리면 안 된다(조사 §F-3 3대 오답의 하나).
 *    물이 채우는 것은 최종 렌즈면 바로 아래의 이 폭뿐이다.
 */
export const GAP_HALF = 0.205;
/** 물 공급·회수 노즐과 기체 실(갭 바깥쪽). */
export const NOZZLE_HALF_IN = 0.215;
export const NOZZLE_HALF_OUT = 0.262;
export const GAS_SEAL_OUT = 0.300;

/** 슬릿 스캔 화살표(좌향 1개 — SD §3-2 요소 12) — v 위치·굵기. */
export const SCAN_ARROW_Y = 0.955;
export const SCAN_BAR = 0.006;

/* ══════════════════════════════════════════════════════════════════════════
 * 🔴 **화살촉(갈매기꼴) 기하 — 2026-08-22 여기로 승격했다. 여기가 정본이다.**
 *
 * 승격 전에는 **GL 씬(`scenes/aerialImage.ts`)과 Canvas2D 폴백(`gl/fallback2d.ts`)이
 * 같은 형상 계수를 각자 들고 있었다.** 그것이 §3-X 「사각지대 ③」이 지목한 바로 그 형태이고,
 * 실제로 2026-08-22 에 GL 만 원형 글로우로 그려 **화면 길이가 모델보다 +5 px** 길어졌다.
 * 한쪽만 고치면 다시 갈린다 — 그래서 셰이더 문자열이 없는 이 순수 모듈로 올렸다.
 *
 * 🔴 **값은 한 자리도 바꾸지 않았다.** 승격 전 `scenes/aerialImage.ts` 의 모듈 지역 상수와
 *    같은 수이며, 승격 전후 렌더 화소가 SHA-256 까지 동일함을 확인했다(3해상도 × 3파라미터 조합).
 *
 * 🔴 **아직 폴백은 이 상수를 소비하지 않는다.** `fallback2d.ts` 는 2026-08-22 현재 다른 담당의
 *    편집 중이라 손대지 못했고, 그 파일 안에 `Math.max(6, 0.020 * h)` · `tip * 0.7` ·
 *    `lineWidth 2` 가 **리터럴로 남아 있다.** 폴백이 여기를 import 하도록 바꿔야 승격이 끝난다.
 *    (팀장 보고 완료 · `threads/parts/GL결함-화살표·테마.md` §9-3)
 * ════════════════════════════════════════════════════════════════════════ */
/** 화살촉 길이 — 화면 **높이** 대비 비율. 가로는 화면비로 환산해 등방으로 쓴다. */
export const SCAN_TIP_LEN_V = 0.020;
/** 화살촉 최소 길이(px). 작은 캔버스에서 촉이 사라지지 않게 거는 하한. */
export const SCAN_TIP_MIN_PX = 6;
/** 촉이 벌어지는 비율 — 촉 세로 반폭 = 촉 길이 × 이 값. */
export const SCAN_TIP_FLARE = 0.7;
/**
 * 촉 획의 **반폭**(px). 🔴 **반폭이다 — 획 폭이 아니다.**
 * Canvas2D 폴백은 `lineWidth = 2 * SCAN_TIP_STROKE_HALF_PX` 로 써야 한다.
 */
export const SCAN_TIP_STROKE_HALF_PX = 1;

/** 퓨필 정면 인셋(좌상단) — 바깥 원이 NA 상한, 채워진 원이 현재 NA 다. */
export const PUPIL_CX = 0.145;
export const PUPIL_CY = 0.845;
export const PUPIL_R = 0.082;

/** 측벽 정재파 줄무늬의 대비 기준값 — `fringeAmplitude` 키(0.2390~1.0)로 곱해 쓴다. */
export const SW_CONTRAST_BASE = 0.30;

/** 디포커스가 만드는 가장자리 흐림의 최대 폭. 🔴 SD 에 형상 근거가 명시된 값은 아니다(보조 연출). */
export const EDGE_BLUR_MAX = 0.016;

/** 물 순환 화살표의 속도(화면값). */
export const WATER_FLOW_SPEED = 0.42;

/* ══════════ 재료색 (화면 배치값) ══════════ */
export type Rgb = readonly [number, number, number];

export const COLOR_BG: Rgb = [0.075, 0.085, 0.115];
export const COLOR_BARREL: Rgb = [0.22, 0.235, 0.275];
export const COLOR_LENS: Rgb = [0.62, 0.74, 0.86];
export const COLOR_WATER: Rgb = [0.30, 0.58, 0.78];
export const COLOR_NOZZLE: Rgb = [0.34, 0.36, 0.40];
export const COLOR_GAS: Rgb = [0.20, 0.24, 0.30];
export const COLOR_SUBSTRATE: Rgb = [0.26, 0.285, 0.335];
export const COLOR_RESIST: Rgb = [0.72, 0.62, 0.34];
export const COLOR_LIGHT: Rgb = [0.55, 0.72, 1.0];
export const COLOR_BAND: Rgb = [0.40, 0.92, 0.86];
export const COLOR_MARK: Rgb = [0.86, 0.89, 0.96];

/* ══════════ 파생값 ══════════ */

export interface AerialImageModel {
  /** 되살린 **실제 NA**. 씬이 `asin(NA/n)` 으로 광 원뿔 반각을 만든다. */
  naValue: number;
  /** 레지스트 층 높이(UV) — `T_nm × M_z`(SD §3-3 P-6). */
  resistHeight: number;
  /** 레지스트 라인의 **바닥 반폭**(UV) = `CD_nm × M_x / 2`(SD §3-3 P-5). */
  lineHalf: number;
  /** 측벽각(라디안) — SD §3-3 P-3 `SWA_scr` 식으로 씬이 직접 계산한다(랩 출력이 아니다). */
  sidewallRad: number;
  /** 상단 모서리 라운딩 비율 = `1 − SWA_scr/88`(SD §3-3 P-3). 0 이면 완전 사다리꼴. */
  cornerRoundFrac: number;
  /** 초점면 높이(UV). defocus 0.5 가 ΔF = 0. */
  focusPlaneY: number;
  /** 초점 허용 띠의 **반두께**(UV) = `DOF_nm × M_z / 2`(SD §3-3 P-1). */
  focusBandHalf: number;
  /** 디포커스 크기 0~1 (|defocus − 0.5| × 2). 가장자리 흐림 세기에 쓴다(보조 연출). */
  defocusMag: number;
  /** 슬릿 스캔 화살표 길이(UV) = `3.00 / E_mJ`(SD §3-3 P-4). */
  scanLength: number;
  /** 정재파 대비 배율 — `fringeAmplitude` 키를 그대로 전달(0.2390 BARC ON · 1.0000 OFF). */
  fringeAmp: number;
}

export function aerialImageModel(params: SceneParams): AerialImageModel {
  // 🔴 기본값은 photo/lab-basic 의 초기 조건과 같다(SD §3-1 검산 지점: NA 1.20 → na 0.8000,
  //    ΔF +90 → defocus 0.8000, E 25 → exposureDose 0.2143, T 120 → resistThickness 0.0714).
  const na = pick(params, 'na', 0.8000);
  const defocus = pick(params, 'defocus', 0.8000);
  const exposureDose = pick(params, 'exposureDose', 0.2143);
  const resistThickness = pick(params, 'resistThickness', 0.0714);
  const lineWidth = pick(params, 'lineWidth', 0.5);
  const fringeAmplitude = pick(params, 'fringeAmplitude', 0.2390);

  /* ── P-1·P-2. na → 실제 NA → DOF 띠 두께 · 원뿔(반각은 셰이더가 sinθ = NA/n 으로 계산) ── */
  const naValue = NA_SCENE_MIN + NA_SCENE_SPAN * na;
  const dofNm = DOF_COEF_NM / (naValue * naValue);
  const bandFullV = dofNm * M_Z_V_PER_NM;

  /* ── P-6. resistThickness → T_nm → 레지스트 높이(정재파 간격은 SW_SPACING_V 로 고정) ── */
  const tNm = RESIST_T_MIN_NM + RESIST_T_SPAN_NM * resistThickness;
  const resistHeight = tNm * M_Z_V_PER_NM;

  /* ── P-3. defocus → ΔF_nm → 초점면 이동 · SWA_scr ──
   * 부호 규약(SD): +ΔF → 초점면이 레지스트 "안쪽(아래)". 이 모듈은 웨이퍼 쪽(SUBSTRATE_TOP)이
   * 낮은 v, 갭/렌즈 쪽이 높은 v 이므로 "아래(웨이퍼 쪽)" = v 감소 → 부호를 반전해 뺀다.
   */
  const deltaFNm = DEFOCUS_SPAN_NM * (defocus - 0.5);
  const focusShiftV = deltaFNm * M_Z_V_PER_NM;
  const focusPlaneY = SUBSTRATE_TOP + resistHeight / 2 - focusShiftV;

  const defocusRatio = dofNm > 0 ? deltaFNm / dofNm : 0;
  const swaDeg = Math.max(SCENE_SWA_MIN_DEG, SCENE_SWA_IDEAL_DEG - SCENE_SWA_DEFOCUS_COEF * defocusRatio * defocusRatio);

  /* ── P-4. exposureDose → E_mJ → 스캔 화살표 길이 ── */
  const eMj = DOSE_MIN_MJ + DOSE_SPAN_MJ * exposureDose;
  const scanLength = eMj > 0 ? SCAN_LEN_COEF / eMj : SCAN_LEN_COEF;

  /* ── P-5. lineWidth → CD_nm → 라인 반폭 ── */
  const cdNm = CD_MIN_NM + CD_SPAN_NM * lineWidth;
  const lineHalf = (cdNm * M_X_U_PER_NM) / 2;

  return {
    naValue,
    resistHeight,
    lineHalf,
    sidewallRad: (swaDeg * Math.PI) / 180,
    cornerRoundFrac: Math.max(0, 1 - swaDeg / SCENE_SWA_IDEAL_DEG),
    focusPlaneY,
    focusBandHalf: bandFullV / 2,
    defocusMag: Math.min(1, Math.abs(defocus - 0.5) * 2),
    scanLength,
    fringeAmp: fringeAmplitude,
  };
}

/** 🔴 자기 검산 — `na` 앵커 상한이 물리 상수와 어긋나면 이 씬은 조용히 잘못된 NA 를 그린다. */
if (Math.abs(NA_SCENE_MAX - NA_IMMERSION_MAX.value) > 1e-9) {
  throw new Error(
    `[aerialImage.model] na 앵커 상한(${NA_SCENE_MAX})이 NA_IMMERSION_MAX(${NA_IMMERSION_MAX.value})와 어긋난다.`,
  );
}
