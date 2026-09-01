import type { LabChartBinding, LabSceneBinding, LabSpec } from './spec';
import { assertWithin, quantity } from '../contract';
import { PHOTO_PROCESS_ID } from '../physics/photo/rules';
import {
  ARF_LAMBDA,
  K1_PHYSICAL_FLOOR,
  K2_ARF_IMMERSION,
  NA_DRY_MAX,
  NA_IMMERSION_MAX,
  N_WATER_193,
  depthOfFocusArFImmersion,
  dofRatio,
  requiredK1,
  resolution,
} from '../physics/photo/rayleigh';

/**
 * P3 포토리소그래피 실습 3단계 — PLN `03_실습3단계명세.md` §P3 의 S5 기초·S6 심화·S7 응용 세 절 배선.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ① k₂ = 0.60 → **0.745** 로 고쳤다 (원장 §4-1 · S149, CC BY 4.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * PLN 명세는 세 단계 전부 고정값으로 `k₂ = 0.60` 을 적었다. **출처가 없는 값이다.**
 * 원장 §3-3·§4-1 이 확보한 유일한 k₂ 는 **ArF 침지 실험 추출값 0.745(S149)** 이고,
 * 원장 §4-1 은 「ArF 침지면 0.745 채택, 그 밖의 조건에서는 절대값을 내지 말고 비율만」까지
 * 결정을 끝내 뒀다. 그래서 이 파일은 계수를 직접 쓰지 않고
 * **`depthOfFocusArFImmersion()`(= K2_ARF_IMMERSION 0.745) 을 호출**한다.
 *
 * 그 결과 같은 NA 에서 DOF 가 **24.2 % 커진다.**
 *   NA 1.20 : k₂ 0.60 → 80.4167 nm  /  k₂ 0.745 → **99.8507 nm** (×1.2417)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ② 그래서 **합격창을 재설계했다** — 계수는 한 개도 건드리지 않았다
 * ═══════════════════════════════════════════════════════════════════════════
 * **스텝 수 계산 (응용 S6 · NA 슬라이더 step 0.01):**
 *   k₁λ = 0.35 × 193 = 67.55 nm · k₂λ = 0.745 × 193 = 143.785 nm
 *   ⓐ R ≤ 58.0  ⟹ NA ≥ 67.55 / 58 = 1.16466  ⟹ **NA ≥ 1.17**
 *   ⓑ DOF ≥ 80.0 (PLN 원안) ⟹ NA² ≤ 143.785 / 80 = 1.79731 ⟹ NA ≤ 1.34064 ⟹ **NA ≤ 1.34**
 *   → 합격 NA = 1.17 ~ 1.34 = **18 스텝.** PLN 이 설계한 4 스텝의 4.5 배다.
 *     (PLN 이 4 스텝을 얻은 것은 k₂ = 0.60 일 때 DOF ≥ 80 ⟹ NA ≤ 1.203 이었기 때문이다.)
 *     18 스텝이면 「NA 를 대충 올리기만 하면 통과」가 되어 **핵심 상충이 사라진다.**
 *   ⓒ 🔴 **DOF 합격선을 80 → 100.0 nm 로 올린다.**
 *     DOF ≥ 100 ⟹ NA² ≤ 1.43785 ⟹ NA ≤ 1.19910 ⟹ **NA ≤ 1.19**
 *     → 합격 NA = 1.17 / 1.18 / 1.19 = **3 스텝** (슬라이더 36 칸 중 3 칸).
 *   ⓓ 그리고 **판정 출력을 늘렸다**(brief 지시 「해상도+DOF 동시 판정」):
 *     - 기초(S5): PLN 은 SWA 를 「표시만」으로 뒀다 → **judge 로 승격**(SWA ≥ 82.0°).
 *       근거는 원장 §3-3 「공정윈도우 규격 — 측벽각 > 80°」(S141 Tutor 16 · S144 Tutor 10, 2건 일치).
 *       k₂ 가 커지면서 디포커스 벌점이 완화됐다(ΔF = ±90 에서 SWA 64.3° → 72.2°).
 *       SWA 를 판정에 넣지 않으면 **벽면각 46° 짜리 무너진 프로파일로도 CD 만 맞으면 합격**한다.
 *       합격 조합 비율: 155/1581(9.8 %) → **55/1581(3.5 %)** — 2.8 배 좁아졌다.
 *     - 심화(S7): R·DOF 를 judge 로 **추가**했다(PLN 은 CD·SWA·LER·OVL·Y·TP 6종).
 *       상충(NA↑ → R↑개선 / DOF↓악화)이 판정 자체에 들어간다.
 *
 * 🔴 **계수는 건드리지 않았다.** 바꾼 것은 `PASS_DOF_MIN_NM`(합격창) 과 SWA·R·DOF 의
 *    `role`(판정 구성)뿐이다. CD·SWA·LER·수율·스루풋 식의 계수는 PLN 명세 그대로다.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ③ 원장이 금지한 것을 뺐다 — 명세를 그대로 옮기지 않은 이유
 * ═══════════════════════════════════════════════════════════════════════════
 * | 뺀 것 | 근거 |
 * |---|---|
 * | **λ 4단 선택(EUV 13.5 / 248 / 365)** · **이머전 매질 n 토글** | 원장 §4-1 — k₂ 절대값은 **ArF 침지(λ=193, NA>1)** 에서만 성립한다. `depthOfFocusArFImmersion()` 이 그 밖에서는 **던진다.** DOF 가 CD·SWA·수율 판정의 분모이므로, 건식·EUV 구간을 슬라이더에 넣으면 실습 공간의 절반이 「계산 불가」가 된다. → **세 단계 모두 ArF 침지 고정.** 건식과의 대비는 `dofRatio()` 로 계산한 **「건식 실용 상한 NA 0.93 대비 DOF 비」를 display 출력으로 상시 노출**해 상수 없이 가르친다(원장 §4-1 ⓑ). |
 * | **오버레이 보정 OVLx/OVLy · \|OVL\| ≤ 4.0 판정** | 원장 **M-10** — 「오버레이 3σ 예산식·IRDS LWR/LER 목표값 미확보 → **오버레이·LER 실습을 만들지 않는다**」. A6 상 **합격 판정 기준값에는 S번호가 필수**인데 4.0 nm 에 출처가 없다. |
 * | **LER ≤ 4.5 판정** | 같은 M-10. LER 은 **display 로만** 남기고(경향모델 배지), 수율 감점항으로만 쓴다. |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ④ A15 에 대한 정직한 고지 — 이 파일은 물리층을 「전부」 호출하지 못한다
 * ═══════════════════════════════════════════════════════════════════════════
 * `src/models/physics/photo/rayleigh.ts` 는 **합성 계수 0건**이며 Rayleigh 4식만 갖는다.
 * PLN 이 설계한 CD·SWA·LER·수율·스루풋·붕괴확률 식은 **교육용 합성 모델**이라 물리층에
 * 넣으면 A15 위반이고 `check-physics` 가 막는다. 협업 경계상 `physics/**` 를 만들 수도
 * 고칠 수도 없으므로, **물리에서 가져올 수 있는 것은 전부 물리층에서 가져오고**
 * (`resolution` · `depthOfFocusArFImmersion` · `dofRatio` · `requiredK1` ·
 *  `ARF_LAMBDA` · `NA_DRY_MAX` · `NA_IMMERSION_MAX` · `K1_PHYSICAL_FLOOR` · `K2_ARF_IMMERSION`),
 * **합성 모델식만 스코어링 성격의 코드로 이 파일 안에 둔다**(etch.ts 선례와 동일).
 * 화면에는 `registry.ts` 가 「경향모델」 배지 + 「실측 장비 상수 아님」 고지를 상시 붙인다(A6-b).
 * ✅ **DEV 팀장 판정(2026-08-20) — 승격하지 않는다. 다시 묻지 마라.**
 *    근거: `projects/8대공정-001/09_물리층_구현규약.md` §7-1(오케스트레이터 판정).
 *    A6-b 의 목적 3가지가 이미 다른 수단으로 충족됐다 — ①물리층 합성 0건은 `check-physics` 가,
 *    ②학습자 고지는 `[경향모델]` 배지 + 고지 렌더가, ③기계 검사는 `check-grades`(등급 원장)와
 *    `check-a6b`(DOM 실측)가 강제한다. **디렉터리는 수단이었지 목적이 아니다.**
 *    `src/models/scoring/` 빈 디렉터리는 2026-08-20 제거했다 — 있으면 「예정된 층」으로 오해된다.
 *    남기는 규율 하나: `§합성모델` 블록은 **파일당 하나의 연속 블록**으로 유지한다(나중에 잘라 옮길 수 있게).
 *    게이트 대상은 아니다 — 배지가 강제되는 한 파일 내 위치는 표시 품질에 영향이 없다.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 ⑤ 씬 없음 — `scene` 을 넣지 않았다
 * ═══════════════════════════════════════════════════════════════════════════
 * DSN `12_시각화씬_공백보고.md`: `photo` 대응 씬 **0 %**(`aerialImage` 제안 상태).
 * 다른 공정 씬(filmGrowth·plasma·ionTrajectory·polishProfile)을 억지로 붙이지 않는다.
 * 하네스가 「내부 시각화 준비 중」을 정직하게 표시한다. 배선한 사슬은 **① 수치 · ② 판정 · ④ 피드백**.
 */

/* ══════════════════ 공통 고정 조건 ══════════════════ */

/** ArF 파장 193 nm — 물리층 상수(S140). 세 단계 전부 이 조건에서만 성립한다. */
const LAMBDA_NM = ARF_LAMBDA.value;

/**
 * k₁ = 0.35 — PLN 세 단계 공통 고정값.
 * 원장 §3-3: k₁ 실무 1.0(1975) → 0.288(ArF 침지 실측, S149) → 물리 하한 0.25(S140·S150).
 * 0.35 는 그 실무 구간 안이며, 물리 하한을 침범하지 않는다.
 */
const K1_FIXED = 0.35;

/** 레지스트 굴절률 n_r ≈ 1.70 — 원장 §3-3 「정재파 주기 λ/2n₂, n≈1.7」(S141 L47 s6). */
const RESIST_INDEX = 1.70;

/** 정재파 주기 P_sw = λ / (2·n_r) = 193 / 3.4 = 56.7647 nm (S141). */
const STANDING_WAVE_PERIOD_NM = LAMBDA_NM / (2 * RESIST_INDEX);
const STANDING_WAVE_HALF_NM = STANDING_WAVE_PERIOD_NM / 2; // 28.3824 nm

/** 레지스트 클리어 선량 E₀. PLN 고정 조건(교육용 설정). */
const CLEAR_DOSE_MJ = 12;

/** 목표 라인 CD. 45 nm 노드. */
const TARGET_CD_NM = 45;

/** 기판 반사율 R_s — BARC OFF / ON. PLN 고정 조건(교육용 설정). */
const REFLECTANCE_BARC_OFF = 0.35;
const REFLECTANCE_BARC_ON = 0.02;

/* ══════════════════ 합격창 상수 ══════════════════
 * 🔴 숫자 리터럴이 아니라 이름 있는 상수로 둔다.
 */

/**
 * CD 합격창 42.0 ~ 48.0 nm.
 * 원장 §3-3 「공정윈도우 규격 — CD ±10 %」(S141 Tutor 16 · S144 Tutor 10, **2건 일치**)
 * → 45 nm 의 ±10 % = 40.5 ~ 49.5 nm. **PLN 은 그보다 좁은 ±6.7 % 를 썼다** — 더 엄격하므로 채택.
 */
const PASS_CD_MIN_NM = 42.0;
const PASS_CD_MAX_NM = 48.0;

/**
 * 벽면각 합격선 82.0°.
 * 원장 §3-3 「공정윈도우 규격 — 측벽각 > 80°」(S141 · S144, 2건 일치)보다 엄격한 PLN 설계값.
 */
const PASS_SWA_MIN_DEG = 82.0;

/** 해상도 합격선 R ≤ 58.0 nm. PLN 학습 설계값(45 nm 노드 하프피치 목표). */
const PASS_RESOLUTION_MAX_NM = 58.0;

/**
 * 🔴 **재설계 지점.** 초점심도 합격선 **DOF ≥ 100.0 nm** (PLN 원안 80.0).
 * 사유·계산은 파일 상단 §② 참조. k₂ 0.745 에서 NA 합격창을 1.17~1.19 3 스텝으로 되돌린다.
 */
const PASS_DOF_MIN_NM = 100.0;

/** 수율·스루풋 합격선. PLN 학습 설계값(SCORE 층 · A6-b 경향모델). */
const PASS_YIELD_MIN_PCT = 92;
const PASS_THROUGHPUT_MIN_WPH = 120;

/* ══════════════════ 슬라이더 정의역 (A14 정지 경계) ══════════════════ */

const DOSE_RANGE_BASIC: [number, number] = [10, 60];
const DOSE_RANGE_ADV: [number, number] = [10, 80];
const FOCUS_RANGE_NM: [number, number] = [-150, 150];
/** 🔴 NA 하한 1.00 — `depthOfFocusArFImmersion()` 이 NA ≤ 1 에서 던진다(ArF 침지 조건). */
const NA_RANGE: [number, number] = [1.00, NA_IMMERSION_MAX.value];
const RESIST_RANGE_NM: [number, number] = [60, 900];
const PEB_RANGE_C: [number, number] = [90, 130];
const BARC_RANGE: [number, number] = [0, 1];

/* ══════════════════ 교육용 합성 모델 (SCORE 층 · A6-b)
 * 🔴 아래 계수는 전부 PLN `03_실습3단계명세.md` 의 값 그대로다. 실측 장비 상수가 아니다.
 * ══════════════════ */

/** PEB 산확산 길이 σ_D = 12 · exp((T_PEB − 110) / 12) nm. */
const SIGMA_D_AT_REF_NM = 12;
const PEB_REF_C = 110;
const PEB_DECADE_C = 12;
/** σ_D 정지선 — 확산길이가 피처에 근접해 패턴이 소실된다(T_PEB ≥ 122 °C). */
const SIGMA_D_STOP_NM = 30;
/** σ_D 부족선 — 화학증폭형 탈보호 반응 미완, LER 벌점. */
const SIGMA_D_UNDERPEB_NM = 5;

/** SWA = 88 − 18·(ΔF/DOF)² − 14·√R_s·(1 − min(1, σ_D/(P_sw/2))). */
const SWA_IDEAL_DEG = 88;
const SWA_DEFOCUS_COEF = 18;
const SWA_REFLECT_COEF = 14;

/** CD 항 계수. */
const CD_AERIAL_COEF = 0.78;        // CD ← 해상도 R
const CD_DOSE_SLOPE = 1.2;          // nm per (mJ/cm²)
const CD_DOSE_PIVOT_MJ = 32;        // CD = 0.78R 가 되는 기준 선량
const CD_DEFOCUS_COEF = 30;         // nm
const CD_DIFFUSION_COEF = 0.8;
const CD_DIFFUSION_KNEE_NM = 15;
/** 기초(S5) 전용 초점 2차항 6.0×10⁻⁴ nm/nm² — NA 1.20 고정이라 DOF 가 상수이기 때문. */
const CD_FOCUS_QUAD_BASIC = 6.0e-4;

/** LER 3σ = 4.5·√(25/E) (+3.0 if σ_D < 5). */
const LER_REF_NM = 4.5;
const LER_REF_DOSE_MJ = 25;
const LER_UNDERPEB_PENALTY_NM = 3.0;

/** 스루풋 TP = 12000/(48 + 0.85·E) × 0.92(이머전). */
const TP_NUMERATOR = 12000;
const TP_FIXED_OVERHEAD = 48;
const TP_DOSE_COEF = 0.85;
const TP_IMMERSION_FACTOR = 0.92;

/** 패턴 붕괴 P_col = min(1, 0.25·max(0, AR − 3.0)). */
const COLLAPSE_AR_KNEE = 3.0;
const COLLAPSE_SLOPE = 0.25;
/** 🔴 A14 — CD 가 0 에 가까울 때 AR 이 발산하지 않게 하는 **표시용 하한**. 물리가 아니다. */
const AR_DENOMINATOR_FLOOR_NM = 1;

/** 수율 Y 감점 계수. 🔴 오버레이 항(−3.0·max(0,|OVL|−4))은 원장 M-10 에 따라 뺐다. */
const YIELD_FULL_PCT = 100;
const YIELD_COLLAPSE_COEF = 45;
const YIELD_LER_COEF = 2.5;
const YIELD_SWA_COEF = 1.5;
const YIELD_CD_COEF = 2.0;
const CD_TOLERANCE_NM = 3;

/** 얇은 레지스트 경고선 — 후속 식각 마스크 두께 부족(하류 호환성). */
const RESIST_THIN_WARN_NM = 80;

/* ══════════════ 🔴 `aerialImage` 씬 배선 — 정본 `DSN-8대공정-001.SD.md` §3(3-0~3-7) ══════════════
 *
 * 씬은 **광축을 포함하는 수직 종단면 1개 + 퓨필 인셋 1개**다. `map()` 이 넘기는 계약은
 * **정확히 6키**다(SD §3-0·§3-1) — 이 밖의 키를 씬에 만들지 않는다:
 *   `na` · `defocus` · `exposureDose` · `resistThickness` · `lineWidth`(확장) · `fringeAmplitude`(확장)
 * 씬(`viz/gl/scenes/models/aerialImage.model.ts`)이 이 6키에서 광 원뿔·초점 허용 띠·측벽각·스캔
 * 화살표 길이·정재파 간격을 **SD §3-3 P-1~P-6 식으로 직접 계산**한다 — 랩 출력을 다시 읽지 않는다.
 * (🔴 이전 구현은 `sidewallAngle`·`focusBand`·`scanSpeed`·`standingWavePitch` 등 SD 확정 전의
 * 독자 키로 랩 출력을 그대로 이식했었다 — SD 최종 확정에 맞춰 6키 계약으로 다시 짰다. 상세 경위는
 * `threads/parts/씬-photo-aerialImage.md` 참조.)
 *
 * 🔴 **정규화 앵커 — 전부 SD 가 리터럴로 확정했다. 손으로 다른 구간을 골라 쓰지 않는다.**
 *   `na`             : `(NA − 0.60) / 0.75`            — 앵커 [0.60, 1.35]. 상한은 물리 상수
 *                       `NA_IMMERSION_MAX`(1.35)와 우연히 일치 — 앵커가 살아 있다는 자기 검산.
 *   `defocus`        : `(ΔF + 150) / 300`               — 0.5 가 ΔF = 0. **리터럴로 쓴다**(`norm()`
 *                       이 아니다 — lab 범위가 0 에 대칭이라 우연히 맞는 것뿐이라 앵커가 바뀌면 깨진다).
 *   `exposureDose`   : `(E − 10) / 70`                  — 🔴 **공통 앵커(칸 무관) E [10, 80]**.
 *                       칸마다 다른 구간을 쓰면 같은 E 값이 칸마다 다른 화면이 된다(SD §0-3 신규 적발).
 *   `resistThickness`: `(T − 60) / 840`                 — 앵커 [60, 900].
 *   `lineWidth`      : `(cdNm − 20) / 50`                — `FOCUS_CHART_CD_MIN/MAX_NM` 그 자체.
 *   `fringeAmplitude`: `barcOn ? √0.02/√0.35 : 1`        — BARC ON 0.2390 · OFF 1.0000.
 *
 * 🔴 **넘기지 않은 것 — 근거가 없어서다(SD §3-6).**
 *   · `medium`(건식/액침 토글) · `pupil`(퓨필 형상 4종) · `λ` 4단 전환 → **대응 lab 입력이 없다.**
 *     특히 퓨필 형상 ↔ k₁ 값의 정량 대응은 조사에 없다 — 형상별 k₁ 숫자를 붙이지 않는다.
 *   · `pebTempC` → **씬 키 없음.** PEB 는 노광 **후** 트랙 공정이라 같은 씬에 넣으면 공정 순서를
 *     왜곡한다(씬명세 §9-3 #2). 다만 PEB 가 움직인 CD 는 `lineWidth` 를 통해 화면에 나타난다.
 */

/** 0~1 로 자른다. 씬 매핑 전용(`etch.ts`·`wafer.ts` 와 같은 형식). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 슬라이더·출력 구간을 0~1 로. 씬 매핑 전용. */
function norm(v: number, range: [number, number]): number {
  return clamp01((v - range[0]) / (range[1] - range[0]));
}

/**
 * SD §3-1 `NORM_NA` — 앵커 [0.60, 1.35]. 리터럴(하한 0.60 은 물리층에 없는 SD 확정 상수).
 * 🔴 이름을 `aerialImage.model.ts` 의 export 상수(`NA_SCENE_MIN`·`NA_SCENE_SPAN`)와 **일부러 다르게**
 *    지었다 — labs 는 viz 를 import 할 수 없어(계층 규칙) 그쪽을 정본으로 삼아 가져올 수 없고,
 *    이름까지 같으면 `check-constants` R1(정본 둘)이 잡는다. 값은 SD 정본 한 곳(§3-1)에서 함께 유도된
 *    것이지 이 파일이 발명한 것이 아니다 — 두 파일 다 SD 리터럴을 그대로 옮겼을 뿐이다.
 */
const SCENE_NA_MIN = 0.60;
const SCENE_NA_SPAN = 0.75;
function normNa(naValue: number): number {
  return clamp01((naValue - SCENE_NA_MIN) / SCENE_NA_SPAN);
}

/** SD §3-1 `NORM_DF` — `(ΔF + 150)/300`. 0.5 가 ΔF = 0. 리터럴로 쓴다(§1-2 주 — `norm()` 아님). */
function normDefocus(focusOffsetNm: number): number {
  return clamp01((focusOffsetNm + 150) / 300);
}

/** SD §3-1 `NORM_E` — 🔴 공통 앵커(칸 무관) E [10, 80] mJ/cm². */
const DOSE_SCENE_RANGE: [number, number] = [10, 80];
function normDose(doseMjCm2: number): number {
  return norm(doseMjCm2, DOSE_SCENE_RANGE);
}

/** SD §3-1 `NORM_T` — 앵커 [60, 900] nm. */
function normResistThickness(thicknessNm: number): number {
  return norm(thicknessNm, RESIST_RANGE_NM);
}

/** SD §3-1 `NORM_CD` — `photo.ts` 자신의 `FOCUS_CHART_CD_MIN/MAX_NM` 그 자체. */
function normLineWidth(cdNm: number): number {
  return norm(cdNm, [FOCUS_CHART_CD_MIN_NM, FOCUS_CHART_CD_MAX_NM]);
}

/**
 * SD §3-1 `BARC_AMP` — `b ≥ 0.5 ? √0.02/√0.35 : 1`. 🔴 **씬은 √R_s 를 계산하지 않는다**(PLN 소관,
 * SD §3-6 #16) — `photo.ts` 가 여기서 계산해 완성된 배율만 `fringeAmplitude` 키로 넘긴다.
 */
const FRINGE_AMP_BARC_ON = Math.sqrt(REFLECTANCE_BARC_ON) / Math.sqrt(REFLECTANCE_BARC_OFF); // 0.2390
const FRINGE_AMP_BARC_OFF = 1.0;
function barcAmp(barcOn: number): number {
  return barcOn >= 0.5 ? FRINGE_AMP_BARC_ON : FRINGE_AMP_BARC_OFF;
}

/**
 * 기초(S5) — NA 1.20 · 레지스트 120 nm 고정. 조작은 노광량과 초점 둘뿐이다.
 * 🔴 이 칸의 주인공은 **라인 폭 · 측벽 기울기(씬이 SD P-3 로 계산) · 스캔 화살표 길이** 세 가지이고,
 *    노광량이 라인 폭과 화살표를 **동시에 반대로** 움직이는 것이 「도즈는 공짜가 아니다」의 그림이다.
 *    BARC 는 이 칸에서 ON 고정이라 정재파가 거의 안 보이는 것이 정답이다(SD §3-0 상수표).
 */
const photoBasicSceneMap: LabSceneBinding['map'] = (i, out) => ({
  na: normNa(BASIC_NA),                                              // 0.8000
  defocus: normDefocus(i['focusOffsetNm'] ?? 90),                    // initial +90 → 0.8000
  exposureDose: normDose(i['doseMjCm2'] ?? 25),                      // initial 25 → 0.2143
  resistThickness: normResistThickness(BASIC_RESIST_NM),             // 0.0714
  lineWidth: normLineWidth(out['cdNm'] ?? TARGET_CD_NM),
  fringeAmplitude: FRINGE_AMP_BARC_ON,                               // BARC ON 고정
});

/** 응용(S6) — NA 가 조작 대상이 된다. 원뿔 반각과 초점 허용 띠가 **제곱 대 1차**로 갈리는 칸이다. */
const photoAppliedSceneMap: LabSceneBinding['map'] = (i, out) => ({
  na: normNa(i['na'] ?? NA_RANGE[0]),
  defocus: normDefocus(i['focusOffsetNm'] ?? 0),
  exposureDose: normDose(i['doseMjCm2'] ?? 25),
  resistThickness: normResistThickness(APPLIED_RESIST_NM),           // 0.0714
  lineWidth: normLineWidth(out['cdNm'] ?? TARGET_CD_NM),
  fringeAmplitude: FRINGE_AMP_BARC_ON,                               // BARC ON 고정
});

/**
 * 심화(S7) — 레지스트 두께 · BARC 가 추가로 조작 대상이 된다.
 * 🔴 두께는 SD `NORM_T` 아핀 앵커([60,900])를 그대로 쓴다 — 정재파 간격은 씬 쪽에서
 *    **상수**(`SW_SPACING_V`, 파라미터 무관)로 고정되므로 두께 정규화 방식과 무관하게 안전하다
 *    (`aerialImage.model.ts` 참조 — 간격은 λ/(2·n_r) 로 파장·굴절률만의 함수, 둘 다 이 칸의
 *    파라미터가 아니다).
 */
const photoAdvancedSceneMap: LabSceneBinding['map'] = (i, out) => ({
  na: normNa(i['na'] ?? NA_RANGE[0]),
  defocus: normDefocus(i['focusOffsetNm'] ?? 0),
  exposureDose: normDose(i['doseMjCm2'] ?? 25),                      // 🔴 이 칸만 슬라이더 상한 80
  resistThickness: normResistThickness(i['resistThicknessNm'] ?? 300),
  lineWidth: normLineWidth(out['cdNm'] ?? TARGET_CD_NM),
  fringeAmplitude: barcAmp(i['barcOn'] ?? 0),                        // 기본 OFF → 1.0000
});

/* ══════════════════ 순수 함수 ══════════════════ */

function sigmaDiffusionNm(pebTempC: number): number {
  return SIGMA_D_AT_REF_NM * Math.exp((pebTempC - PEB_REF_C) / PEB_DECADE_C);
}

/** 정재파 평활 잔여율 — σ_D 가 P_sw/2 에 닿으면 0(완전 평활). */
function standingWaveResidual(sigmaD: number): number {
  return 1 - Math.min(1, sigmaD / STANDING_WAVE_HALF_NM);
}

function sidewallAngleDeg(focusNm: number, dofNm: number, reflectance: number, sigmaD: number): number {
  const defocus = focusNm / dofNm;
  return SWA_IDEAL_DEG
    - SWA_DEFOCUS_COEF * defocus * defocus
    - SWA_REFLECT_COEF * Math.sqrt(reflectance) * standingWaveResidual(sigmaD);
}

/**
 * 기초(S5) 라인 CD — PLN §S5 판정식 `CD = 45 − 1.2·(E − 32) + 6.0×10⁻⁴·ΔF²`.
 * 🔴 `compute()` 와 초점 응답 차트가 **같은 함수 하나**를 쓴다. 차트가 식을 다시 쓰면
 *    화면의 곡선과 판정값이 조용히 어긋난다 — 그것이 「차트가 장식이 되는」 경로다.
 */
function basicCdNm(doseMj: number, focusNm: number): number {
  return TARGET_CD_NM
    - CD_DOSE_SLOPE * (doseMj - CD_DOSE_PIVOT_MJ)
    + CD_FOCUS_QUAD_BASIC * focusNm * focusNm;
}

function throughputWph(doseMj: number): number {
  return (TP_NUMERATOR / (TP_FIXED_OVERHEAD + TP_DOSE_COEF * doseMj)) * TP_IMMERSION_FACTOR;
}

function lineEdgeRoughnessNm(doseMj: number, sigmaD: number): number {
  const base = LER_REF_NM * Math.sqrt(LER_REF_DOSE_MJ / doseMj);
  return sigmaD < SIGMA_D_UNDERPEB_NM ? base + LER_UNDERPEB_PENALTY_NM : base;
}

function collapseProbability(aspectRatio: number): number {
  return Math.min(1, COLLAPSE_SLOPE * Math.max(0, aspectRatio - COLLAPSE_AR_KNEE));
}

function clampPercent(v: number): number {
  return Math.min(YIELD_FULL_PCT, Math.max(0, v));
}

/** 공통 가정 문구 — 화면 「근거」에 노출된다. */
const ARF_ASSUMPTION = `ArF 침지 고정 (λ = ${LAMBDA_NM} nm · 초순수) · k₁ = ${K1_FIXED}`;
const K2_ASSUMPTION = `DOF 는 k₂ = ${K2_ARF_IMMERSION.value} (S149, ArF 침지 실험 추출) — 조건 한정, 다른 파장·건식 전용 불가`;
const SYNTHETIC_ASSUMPTION = '교육용 합성 모델 — 실제 장비 상수 아님';

/* ══════════════════════════════════════════════════════════════════════════
 * 기초 (S5) — LO-P3-03 「노광량으로 라인 CD 를 맞춘다」
 *
 * 고정: NA = 1.20(침지) · T_resist = 120 nm · BARC ON(R_s 0.02) · T_PEB = 110 °C(σ_D 12 nm)
 *   DOF = 0.745 × 193 / 1.44 = **99.8507 nm** (k₂ 0.60 이었다면 80.4167 nm)
 *   R   = 0.35 × 193 / 1.20 = **56.2917 nm**
 *   SWA 반사항 = 14 × √0.02 × (1 − 12/28.3824) = 1.9799 × 0.57720 = **1.1428°** (상수)
 *
 * 🔴 검산 (2026-08-20 · DEV):
 *   기본값 E = 25 · ΔF = +90
 *     CD  = 45 − 1.2×(25−32) + 6.0e−4 × 8100 = 45 + 8.4 + 4.86 = **58.26 nm ✗** (42~48)
 *     SWA = 88 − 18×(90/99.8507)² − 1.1428 = 88 − 14.6269 − 1.1428 = **72.23° ✗** (≥82)
 *     → **judge 2개 전부 불합격.** 죽은 판정 아님.
 *   🟢 합격 조합 (전수 확인, 55개 / 1581 = 3.5 %) 중 대표 3종:
 *     (a) E = 32 · ΔF =   0 → CD 45.00 ✅ · SWA 86.86 ✅ · TP 146.8 wph
 *     (b) E = 31 · ΔF = +40 → CD 47.16 ✅ · SWA 83.97 ✅ · TP 148.49 wph
 *     (c) E = 34 · ΔF = −30 → CD 43.14 ✅ · SWA 85.23 ✅ · TP 143.56 wph
 *   🔴 SWA 를 judge 로 올린 효과: ΔF 합격 구간이 31칸 → **11칸**(|ΔF| ≤ 51.86 nm)으로 잘린다.
 *      (18×(ΔF/99.8507)² ≤ 88 − 82 − 1.1428 = 4.8572 ⟹ |ΔF| ≤ 0.51947 × 99.8507 = 51.86)
 * ══════════════════════════════════════════════════════════════════════════ */

const BASIC_NA = 1.20;
const BASIC_RESIST_NM = 120;
const BASIC_PEB_C = 110;

/* ══════════ 🔴 기초(S5) 초점 응답 차트 (PLN 명세 §P3 포토 기초) ══════════
 * PLN 명세 「… 화면에는 초점–노광 매트릭스(Bossung) 미니 차트가 **아래로 볼록한 U 자**로
 *   그려지고, 현재 위치가 U 자 위에서 노란 점으로 표시된다.」 (같은 절 §4 의 마지막 항목)
 *
 * ⛔ **같은 절이 화면 좌측에 지정한 PLN 명세 「공중상 강도 프로파일 그래프」는 그리지 않았다 — 지어내지 않으려고 뺐다.**
 *    그 절이 요구하는 값(피크 0.95 · 바닥 0.08 · 대비 0.845 → 0.638 · NILS 3.4 → 2.3 ·
 *    임계 절단선 0.42 → 0.33)은 **강도 I(x) 모델이 있어야 나오는 값**인데,
 *    `src/models/physics/photo/` 에는 Rayleigh 4식(R · DOF · DOF비 · 역산 k₁)뿐이고
 *    공중상 강도식은 **코드베이스 어디에도 없다.** 협업 경계상 `physics/**` 를 만들 수도 없다.
 *    2광속 간섭식을 여기서 새로 쓰면 **A15 위반**(없는 프로파일을 위해 식을 지어냄)이므로
 *    그리지 않고 **DEV 보고 항목으로 남긴다.** 되살리려면 물리층에 공중상 강도식 +
 *    원장 S번호가 먼저 있어야 한다.
 *    → 대신 **같은 절이 지정한 Bossung 미니 차트**를 구현한다. 이쪽은 새 식이 필요 없다 —
 *      `compute()` 가 쓰는 CD 함수 하나를 ΔF 로 훑기만 하면 된다.
 *
 * 🔴 ~~`judgesOutputs` 를 달지 않는다. 「판정은 이 차트에서 한다」는 명세의 P1 σ_D 절에만 있는~~
 *    ~~문장이고, 명세가 이 차트에 그렇게 못박은 문장은 P3 S6 의 Bossung 등고선 쪽이다.~~
 *    ~~여기서는 규격선만 긋는다 — 없는 권한을 화면에 적지 않는다.~~
 *
 * 🔴🔴 **2026-08-21 정정(개발팀장) — `judgesOutputs: ['cdNm']` 을 단다.**
 *    위 주석의 **명세 독해는 맞다**: 「판정은 이 차트에서 한다」는 정본
 *    `03_실습3단계명세.md` 의 **P1 웨이퍼 심화 σ_D 확대 차트 절**에 박힌 문장이었고
 *    일반 규약이 아니었다. 그러나 **결론이 틀렸다** — `judgesOutputs` 는 「명세가 권한을 주었는가」가
 *    아니라 **「이 차트가 판정을 보여주는가」라는 사실 선언**이다(`spec.ts` 정의 원문:
 *    「이 차트가 **판정을 보여주는** 출력 id 들」).
 *    🔴 **2026-09-01 재측정 — 「정확히 1회」는 2026-08-21 시점의 실측이고 지금은 3곳이다.**
 *       `check-citations` 가 세었다: P1 σ_D 확대 차트 절 외에 **판정 출력 합격 조건 표 1곳**과
 *       **차트·씬을 붙였으면 그 문장을 적으라는 규약 1곳**이 명세에 추가돼 있다.
 *       ⚠️ 그러므로 위 「일반 규약이 아니다」는 지금은 그대로 읽으면 안 된다 — 아래 결론
 *       (`judgesOutputs` 를 단다)에는 영향이 없으나, **재판정은 PLN·팀장 몫이다.**
 *    🔴 결정적 사실: **photo.ts 에는 `sceneId` 가 하나도 없다**(전수 grep 0건).
 *      즉 기초(S5) 칸에서 학습자가 CD 규격창 42~48 nm 를 볼 수 있는 화면은 **이 차트가 유일**하다.
 *      규격선을 그려 놓고 「판정한다」를 안 적으면 **없는 권한을 감추는 것이 아니라 있는 판정을 숨기는 것**이다.
 *    🔴 과대주장 아님: 이 칸의 판정 출력은 2개(`cdNm`·`swaDeg`)인데 **`cdNm` 만 선언**한다.
 *      화면 문구 `lab.chartJudges` = 「🔴 판정은 이 차트에서 합니다 — {items}」 의 items 는
 *      선언한 출력명뿐이라 「라인 CD」만 표시된다. 벽면각(SWA)은 이 차트가 그리지 않으므로 선언하지 않는다.
 */
const FOCUS_CHART_STEPS = 60;
/** 세로 범위 — 아래 끝은 라인 소실 정지선(20 nm), 위 끝은 브리징 경고선(65 nm) 바깥이다. */
const FOCUS_CHART_CD_MIN_NM = 20;
const FOCUS_CHART_CD_MAX_NM = 70;
/** 브리징 경고선 — 피드백 PH-B3 과 같은 값. */
const BRIDGING_CD_NM = 65;

function focusResponseChart(): LabChartBinding {
  return {
    id: 'photo.basic.focusResponse',
    kind: 'line',
    ko: '초점 응답 곡선 (Bossung)',
    en: 'Focus response curve (Bossung)',
    // 🔴 2026-08-21 — CD 규격창 42~48 nm 를 그리는 유일한 화면(이 칸에 씬이 없다). 위 정정 주석 참조.
    //    벽면각 swaDeg 는 이 차트가 그리지 않으므로 선언하지 않는다.
    judgesOutputs: ['cdNm'],
    xKo: '초점 오프셋 ΔF', xEn: 'Focus offset', xUnit: 'nm',
    yKo: '라인 CD', yEn: 'Line CD', yUnit: 'nm',
    xDomain: [FOCUS_RANGE_NM[0], FOCUS_RANGE_NM[1]],
    // 🔴 규격창 42~48 nm 가 세로 50 nm 폭 안에서 12 % 를 차지하도록 잡았다 —
    //    창을 보이게 하려고 좁히고, 정지선(20)·브리징선(65)까지는 담는 절충이다.
    yDomain: [FOCUS_CHART_CD_MIN_NM, FOCUS_CHART_CD_MAX_NM],
    refLines: [
      { value: BRIDGING_CD_NM, ko: '브리징 임박 65 nm', en: 'Bridging imminent 65 nm', tone: 'info' },
      { value: PASS_CD_MAX_NM, ko: '규격 상한 48.0 nm', en: 'Spec upper 48.0 nm', tone: 'spec' },
      { value: PASS_CD_MIN_NM, ko: '규격 하한 42.0 nm', en: 'Spec lower 42.0 nm', tone: 'spec' },
    ],
    captionKo: '초점을 0 에서 밀면 CD 는 ΔF² 로 굵어집니다 — 아래로 볼록한 U 자입니다. 노광량은 이 U 자를 통째로 위아래로 옮길 뿐이라, 초점이 나간 상태에서는 노광량만으로 규격창 안에 U 자의 바닥을 넣을 수 없습니다. 게다가 이 단계는 벽면각도 함께 판정하므로 초점으로 CD 를 벌충하는 편법은 통하지 않습니다.',
    captionEn: 'Push focus away from zero and CD grows as ΔF² — a U opening upward. Dose only slides the whole U up or down, so once focus is off you cannot land the bottom of the U inside the spec window with dose alone. And since this stage also judges sidewall angle, trading focus for CD does not work.',
    note: '곡선은 현재 노광량에서 초점만 −150 ~ +150 nm 로 훑은 것이며, `compute()` 가 판정에 쓰는 CD 함수와 같은 함수 하나로 그립니다. 세로 점선은 현재 초점 위치입니다. 함께 볼 만한 공중상 강도 프로파일 I(x)(빛이 마스크를 지나 웨이퍼 면에 맺히는 밝기 분포)은 그리지 않았습니다 — 그 강도 모델이 이 시뮬레이터의 물리층에 없기 때문이며, 없는 식을 지어내지 않기 위해서입니다.',
    build: (inputs, outputs) => {
      const dose = inputs['doseMjCm2'] ?? 25;
      const focus = inputs['focusOffsetNm'] ?? 90;
      const curve: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= FOCUS_CHART_STEPS; i++) {
        const f = FOCUS_RANGE_NM[0] + (i / FOCUS_CHART_STEPS) * (FOCUS_RANGE_NM[1] - FOCUS_RANGE_NM[0]);
        // 🔴 식을 새로 쓰지 않는다 — 판정이 쓰는 바로 그 함수다.
        curve.push({ x: f, y: basicCdNm(dose, f) });
      }
      return [
        {
          id: 'bossung',
          ko: `CD(ΔF) · E = ${dose} mJ/cm²`,
          en: `CD(ΔF) at E = ${dose} mJ/cm²`,
          points: curve,
        },
        {
          id: 'operating',
          ko: '현재 초점 위치',
          en: 'Current focus setting',
          points: [
            { x: focus, y: FOCUS_CHART_CD_MIN_NM },
            { x: focus, y: outputs['cdNm'] ?? basicCdNm(dose, focus) },
          ],
          dashed: true,
        },
      ];
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 응용 (S6) — LO-P3-04 「NA 로 해상도를 얻고 초점심도를 잃는다」
 *
 * 고정: 침지 ON · T_resist = 120 nm · BARC ON · T_PEB = 110 °C
 *
 * 🔴 검산:
 *   기본값 NA = 1.00 · E = 25 · ΔF = 0
 *     R   = 67.55 / 1.00 = **67.55 nm ✗** (≤58)
 *     DOF = 143.785 / 1.00 = **143.79 nm ✅** (≥100)
 *     CD  = 0.78 × 67.55 + 1.2 × (32−25) + 0 = 52.689 + 8.4 = **61.09 nm ✗** (42~48)
 *     → judge 3개 중 **2개 불합격.** 죽은 판정 아님.
 *   🟢 합격 조합 대표 3종 (합격 NA 는 1.17 / 1.18 / 1.19 **3칸뿐**):
 *     (a) NA = 1.17 · E = 32 · ΔF =   0 → R 57.74 ✅ · DOF 105.04 ✅ · CD 45.03 ✅
 *     (b) NA = 1.19 · E = 31 · ΔF =   0 → R 56.76 ✅ · DOF 101.54 ✅ · CD 45.48 ✅
 *     (c) NA = 1.18 · E = 33 · ΔF = +20 → R 57.25 ✅ · DOF 103.26 ✅ · CD 44.58 ✅
 *   ✗ NA = 1.16 → R 58.23 ✗ / NA = 1.20 → DOF 99.85 ✗ — 양쪽 벽이 1칸 밖에 서 있다.
 * ══════════════════════════════════════════════════════════════════════════ */

const APPLIED_RESIST_NM = 120;
const APPLIED_PEB_C = 110;

/* ══════════════════════════════════════════════════════════════════════════
 * 심화 (S7) — LO-P3-05 「6지표를 동시에 지킨다」
 *
 * 조작 6개: NA · E · ΔF · 레지스트 두께 T · PEB 온도 · BARC
 * 판정 6개: R · DOF · CD · SWA · 수율 Y · 스루풋 TP  🔴 R·DOF 를 judge 로 **추가**했다.
 *
 * 🔴 검산:
 *   기본값 NA 1.00 · E 25 · ΔF 0 · T 300 · T_PEB 110 · BARC OFF
 *     R 67.55 ✗ / DOF 143.79 ✅ / σ_D 12.00 / P_sw 56.76
 *     SWA = 88 − 0 − 14×√0.35×(1 − 12/28.3824) = 88 − 8.2825 × 0.57720 = **83.22° ✅**
 *     CD  = 0.78×67.55 + 8.4 + 0 + 0 = **61.09 nm ✗**
 *     AR  = 300/61.09 = 4.911 → P_col = 0.25×1.911 = 0.4777
 *     LER = 4.5×√(25/25) = 4.50 (표시 전용)
 *     Y   = 100 − 45×0.4777 − 0 − 0 − 2.0×(16.089−3) = 100 − 21.50 − 26.18 = **52.32 % ✗**
 *     TP  = 12000/(48+21.25) × 0.92 = **159.42 wph ✅**
 *     → judge 6개 중 **3개 불합격**(R·CD·Y). 죽은 판정 아님.
 *   🟢 합격 조합 대표 2종 — **6지표 전부 합격**:
 *     (a) NA 1.17 · E 32 · ΔF 0 · T 120 · T_PEB 110 · BARC ON
 *         R 57.74 ✅ · DOF 105.04 ✅ · CD 45.03 ✅ · SWA 86.86 ✅ · AR 2.665(P_col 0)
 *         · LER 3.98 · Y 100.0 ✅ · TP 146.81 ✅
 *     (b) NA 1.19 · E 31 · ΔF 0 · T 130 · T_PEB 112 · BARC ON
 *         R 56.76 ✅ · DOF 101.54 ✅ · σ_D 14.18 · CD 45.48 ✅ · SWA 87.01 ✅
 *         · AR 2.859(P_col 0) · LER 4.04 · Y 100.0 ✅ · TP 148.49 ✅
 *   🔴 죽은 입력 0개 — 각 입력이 **최소 2개 판정 출력에 상반 방향**으로 작용한다:
 *     NA   → R 개선(1/NA) / DOF 악화(1/NA²)
 *     E    → CD 축소·LER 개선 / TP 저하 (TP ≥ 120 ⟹ **E ≤ 51 mJ/cm²** 가 실질 상한)
 *     ΔF   → CD 증가 / SWA 저하 (BARC ON 이면 |ΔF| ≤ 54.6, OFF 면 |ΔF| ≤ 27.3 에서 SWA 82° 붕괴)
 *     T    → 식각 내성 개선 / AR·P_col 악화 (CD 45 기준 T ≤ 135 nm)
 *     PEB  → 정재파 평활(SWA 개선) / σ_D>15 에서 CD 부풀음, σ_D<5 에서 LER +3
 *     BARC → SWA 개선(반사항 4.78° → 1.14°) / 공정 단계 1개 추가
 * ══════════════════════════════════════════════════════════════════════════ */

export const PHOTO_LABS: LabSpec[] = [
  {
    processId: PHOTO_PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P3-03',
    titleKo: '노광량과 초점으로 라인 CD 맞추기',
    titleEn: 'Hit the target line CD with dose and focus',
    params: [
      {
        id: 'doseMjCm2', ko: '노광량 E', en: 'Exposure dose', unit: 'mJ/cm²',
        min: DOSE_RANGE_BASIC[0], max: DOSE_RANGE_BASIC[1], step: 1, initial: 25, sourceId: 'S145',
        note: '레지스트 노광 파라미터 근거 S145(Dill 실측). 10~60 mJ/cm² 구간은 PLN §S5 학습 설정이며 클리어 선량 E₀ = 12 를 포함한다.',
      },
      {
        id: 'focusOffsetNm', ko: '초점 오프셋 ΔF', en: 'Focus offset', unit: 'nm',
        min: FOCUS_RANGE_NM[0], max: FOCUS_RANGE_NM[1], step: 10, initial: 90, sourceId: 'S140',
        note: 'DOF = 99.85 nm(NA 1.20 · k₂ 0.745, S149) 대비 ±1.5 배까지 밀어 보는 구간. 초점 여유의 물리는 S140 Rayleigh.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P3 기초(S5) 는 「고정값(화면 우측 조건 카드에 상시 표시)」
     *   이라고 **위치까지 규정**하고 7개를 나열했다:
     *   λ 193 nm · NA 1.20 · n 1.44(이머전 ON) · k1 0.35 · k2 0.745(원장 S149) ·
     *   레지스트 두께 T 120 nm · 레지스트 클리어 선량 E₀ 12 mJ/cm².
     *
     * 🔴 **7개 전부**를 적는다. 종전에는 이 7개가 갈 자리가 `LabSpec` 에 없어서 출력값 아래
     *    가정 목록에 흩어 넣었고, 그 결과 **n · k₂ · T · E₀ 4개가 학습자에게 닿지 않았다**
     *    (2026-08-22 실측). 가정 목록은 「이 수치의 전제」를 말하는 자리이지 「이 실습의 조건」을
     *    말하는 자리가 아니다.
     * 🔴 **값은 전부 이미 있는 상수에서 끌어온다.** 손으로 다시 적으면 계산과 카드가 갈라진다. */
    fixedConditions: [
      {
        id: 'lambda', ko: '노광 파장 λ', en: 'Exposure wavelength λ',
        value: String(LAMBDA_NM), unit: 'nm', sourceId: 'S140',
        note: 'ArF 엑시머. 세 단계 전부 이 파장에서만 성립한다.',
      },
      {
        id: 'na', ko: '개구수 NA', en: 'Numerical aperture NA',
        value: BASIC_NA.toFixed(2), basis: 'PLN 명세 §S5 고정값 — 기초 단계는 NA 를 조작하지 않는다. NA 를 움직이는 것은 응용(§S6)의 학습 내용이다.',
      },
      {
        /* 🔴 명세는 `n = 1.44` 로 적었지만 **원장이 확보한 값은 S140 의 1.436** 이다.
           지어낸 1.44 를 화면에 올리는 대신 출처 있는 1.436 을 올리고, 명세가 반올림해
           적었다는 사실을 그 자리에서 밝힌다. 값을 만들어 내지 않는 쪽을 택했다. */
        id: 'immersionIndex', ko: '침지수 굴절률 n (이머전 ON)', en: 'Immersion index n (immersion ON)',
        value: String(N_WATER_193.value), sourceId: 'S140',
        note: '초순수 @193 nm. PLN 명세는 1.44 로 반올림해 적었고, 화면은 원장 정본 1.436 을 표시한다.',
      },
      {
        id: 'k1', ko: '해상도 계수 k₁', en: 'Resolution factor k₁',
        value: String(K1_FIXED), basis: `PLN 세 단계 공통 고정값. 원장 §3-3 의 실무 구간 안이며 물리 하한 ${K1_PHYSICAL_FLOOR.value}(S140·S150)을 침범하지 않는다.`,
      },
      {
        id: 'k2', ko: '초점심도 계수 k₂', en: 'Depth-of-focus factor k₂',
        value: String(K2_ARF_IMMERSION.value), sourceId: 'S149',
        note: '🔴 ArF 침지 실험 추출값 — 다른 파장·건식 렌즈로 옮겨 쓸 수 없다(원장 §4-1).',
      },
      {
        id: 'resistThickness', ko: '레지스트 두께 T', en: 'Resist thickness T',
        value: String(BASIC_RESIST_NM), unit: 'nm', basis: 'PLN 명세 §S5 고정값(교육용 설정). 두께를 움직이는 것은 심화(§S7)의 학습 내용이다.',
      },
      {
        id: 'clearDose', ko: '레지스트 클리어 선량 E₀', en: 'Resist clearing dose E₀',
        value: String(CLEAR_DOSE_MJ), unit: 'mJ/cm²', basis: 'PLN 명세 §S5 고정값(교육용 설정) — 원장에 문헌 출처가 없다. 노광량이 이 값 이하이면 레지스트가 열리지 않는다는 정지 피드백(PH-B1)의 기준선이다.',
      },
    ],
    outputs: [
      { id: 'cdNm', ko: '라인 CD', en: 'Line CD', role: 'judge',
        pass: { min: PASS_CD_MIN_NM, max: PASS_CD_MAX_NM }, digits: 2 },
      { id: 'swaDeg', ko: '벽면각 SWA', en: 'Sidewall angle', role: 'judge',
        pass: { min: PASS_SWA_MIN_DEG }, digits: 2 },
      { id: 'dofNm', ko: '초점심도 DOF', en: 'Depth of focus', role: 'display', digits: 2 },
      { id: 'resolutionNm', ko: '해상도 R', en: 'Resolution', role: 'display', digits: 2 },
      { id: 'throughputWph', ko: '스루풋 TP', en: 'Throughput', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const dose = inputs['doseMjCm2'] ?? 25;
      const focus = inputs['focusOffsetNm'] ?? 90;
      // 🔴 A14 — 정의역 밖은 계산하지 않고 정지시킨다.
      assertWithin('doseMjCm2', dose, DOSE_RANGE_BASIC, 'mJ/cm²');
      assertWithin('focusOffsetNm', focus, FOCUS_RANGE_NM, 'nm');

      // 물리층 호출 — 식을 새로 쓰지 않는다.
      const r = resolution({ lambdaNm: LAMBDA_NM, na: BASIC_NA, k1: K1_FIXED });
      const dof = depthOfFocusArFImmersion({ lambdaNm: LAMBDA_NM, na: BASIC_NA });

      const sigmaD = sigmaDiffusionNm(BASIC_PEB_C);
      const cd = basicCdNm(dose, focus);
      const swa = sidewallAngleDeg(focus, dof.value, REFLECTANCE_BARC_ON, sigmaD);

      return {
        cdNm: quantity(cd, {
          modelId: 'photo.lab.basic.cdNm', unit: 'nm', basis: "교육용 합성 — 선량 기울기 1.2 nm/(mJ/cm²)·초점 2차항 6.0e-4 는 학습용으로 설계된 CD 응답 계수입니다.",
          validRange: [0, 400],
          assumptions: [SYNTHETIC_ASSUMPTION, ARF_ASSUMPTION, `NA = ${BASIC_NA} 고정 · 레지스트 ${BASIC_RESIST_NM} nm · BARC ON`],
        }),
        swaDeg: quantity(swa, {
          modelId: 'photo.lab.basic.swaDeg', unit: '°', basis: "교육용 합성 — 이상각 88°·디포커스 18·반사 14 는 학습용 벽면각 합성식의 계수입니다.",
          validRange: [0, 90],
          assumptions: [SYNTHETIC_ASSUMPTION, '합격선 82° 는 원장 §3-3 「측벽각 > 80°」(S141·S144 2건 일치)보다 엄격', K2_ASSUMPTION],
        }),
        dofNm: quantity(dof.value, {
          modelId: 'photo.lab.basic.dofNm', unit: 'nm', sourceId: 'S149',
          validRange: [1, 5000],
          assumptions: [K2_ASSUMPTION, `NA = ${BASIC_NA} 고정`],
        }),
        resolutionNm: quantity(r.value, {
          modelId: 'photo.lab.basic.resolutionNm', unit: 'nm', sourceId: 'S140',
          validRange: [1, 5000],
          assumptions: ['R = k₁·λ/NA (S140)', ARF_ASSUMPTION],
        }),
        throughputWph: quantity(throughputWph(dose), {
          modelId: 'photo.lab.basic.throughputWph', unit: 'wph', basis: "교육용 합성 — 12000/(48+0.85·E)×0.92 는 학습용 스캐너 스루풋 모형입니다.",
          validRange: [0, 1000],
          assumptions: [SYNTHETIC_ASSUMPTION, '이머전 계수 0.92'],
        }),
      };
    },
    charts: [focusResponseChart()],   // 🔴 PLN 816 — 아래로 볼록한 U 자 + 현재 위치 표시
    scene: {
      sceneId: 'aerialImage',
      map: photoBasicSceneMap,
      note: '조작 2키: exposureDose ← doseMjCm2 · defocus ← focusOffsetNm(SD §3-1 NORM_E·NORM_DF). '
        + '🔴 노광량을 올리면 라인이 가늘어지는(lineWidth↓) **동시에** 스캔 화살표가 짧아진다(SD P-4 길이=3.00/E_mJ) — '
        + '「도즈는 공짜가 아니다」를 그림 하나로 보이는 자리다. 하나만 움직이면 상충 표현이 죽은 것이다. '
        + '상수 3키: na = 0.8000(NA 1.20 BASIC_NA 고정 — 기초는 NA 가 조작 대상이 아니라 원뿔 반각·초점 허용 띠가 '
        + '안 변하는 것이 학습 의도) · resistThickness = 0.0714(BASIC_RESIST_NM 120 nm 고정) · '
        + 'fringeAmplitude = 0.2390(BARC ON 고정 — 정재파가 거의 안 보이는 것이 이 칸의 정답, 심화에서 OFF 로 4.18배 살아난다). '
        + '연동 1키: lineWidth ← cdNm(SD NORM_CD). '
        + '측벽각·초점 허용 띠·스캔 길이·정재파 간격은 씬(`aerialImage.model.ts`)이 SD §3-3 P-1~P-6 식으로 '
        + '직접 계산한다 — 랩 출력을 다시 읽지 않는다.',
    },
    feedback: [
      {
        id: 'PH-B1', tone: 'stop',
        ko: '노광량이 클리어 선량 E₀ = 12 mJ/cm² 미만입니다. 현상해도 레지스트가 열리지 않으므로 아래 CD·벽면각 수치는 의미가 없습니다. 13 mJ/cm² 이상으로 올리십시오.',
        en: 'Dose is below the clear dose E₀ = 12 mJ/cm². The resist never opens, so the CD and sidewall values below are meaningless. Raise the dose above 13 mJ/cm².',
        when: (i) => (i['doseMjCm2'] ?? 25) <= CLEAR_DOSE_MJ,
      },
      {
        id: 'PH-B2', tone: 'stop',
        ko: '공정 한계선 초과 — 라인 소실(line pinching). 양성 레지스트에서 노광량 과다는 라인을 깎아냅니다. 노광량을 낮추십시오.',
        en: 'Process limit exceeded — line pinching. In a positive resist, over-exposure eats the line away. Lower the dose.',
        when: (_i, o) => (o['cdNm'] ?? TARGET_CD_NM) < 20,
      },
      {
        id: 'PH-B3', tone: 'warn',
        ko: '인접 라인 브리징 임박 — 피치 120 nm 에서 스페이스가 25 nm 미만입니다. 노광량을 올리거나 초점 오프셋을 0 쪽으로 되돌리십시오.',
        en: 'Bridging imminent — at a 120 nm pitch the space has dropped below 25 nm. Raise the dose or bring the focus offset back toward zero.',
        when: (_i, o) => (o['cdNm'] ?? TARGET_CD_NM) > 65,
      },
      {
        id: 'PH-B4', tone: 'warn',
        ko: '초점 이탈로 벽면각이 82° 아래로 떨어졌습니다. 이 프로파일은 후속 식각에서 마스크 역할을 못 합니다. DOF 가 99.85 nm 이므로 |ΔF| 는 약 52 nm 안쪽이어야 합니다.',
        en: 'Defocus has pushed the sidewall angle below 82°. This profile cannot serve as an etch mask. With DOF = 99.85 nm, |ΔF| must stay within about 52 nm.',
        when: (_i, o) => (o['swaDeg'] ?? SWA_IDEAL_DEG) < PASS_SWA_MIN_DEG,
      },
      {
        id: 'PH-B5', tone: 'hint',
        ko: 'CD 는 규격 안인데 벽면각이 규격 밖입니다. 초점 오프셋만으로 라인을 굵게 만드는 것은 대가가 있습니다 — ΔF 를 0 쪽으로 되돌리고 CD 는 노광량으로 다시 맞추십시오.',
        en: 'CD is in spec but the sidewall angle is not. Thickening the line with focus alone has a price — return ΔF toward zero and re-tune CD with the dose instead.',
        when: (_i, o) => {
          const cd = o['cdNm'] ?? 0;
          return cd >= PASS_CD_MIN_NM && cd <= PASS_CD_MAX_NM && (o['swaDeg'] ?? SWA_IDEAL_DEG) < PASS_SWA_MIN_DEG;
        },
      },
      {
        id: 'PH-B6', tone: 'hint',
        ko: 'CD 가 목표보다 큽니다. 양성 레지스트에서 라인을 가늘게 하려면 노광량은 어느 쪽입니까? (올리면 CD 는 줄고 스루풋은 함께 떨어집니다.)',
        en: 'CD is above target. In a positive resist, which way does the dose go to thin the line? (Up — and throughput falls with it.)',
        when: (_i, o) => (o['cdNm'] ?? 0) > PASS_CD_MAX_NM && (o['cdNm'] ?? 0) <= 65,
      },
    ],
    tradeoffs: [
      {
        ko: 'E ↑ → 라인 CD 가 줄어 목표에 다가간다(좋음) / 스루풋이 떨어진다(나쁨). E 25 → 32 에서 CD 53.4 → 45.0 nm, TP 159 → 147 wph — CD 8 nm 를 깎는 대가로 시간당 12 장을 잃는다.',
        en: 'Higher dose thins the line toward target (good) but costs throughput (bad). E 25 → 32 moves CD 53.4 → 45.0 nm while throughput falls 159 → 147 wph.',
      },
      {
        ko: '|ΔF| ↑ → 라인이 굵어져 CD 를 키울 수는 있다 / 벽면각 SWA 가 무너진다(나쁨). ΔF 0 → ±90 nm 에서 SWA 86.9° → 72.2°. 이 단계에서는 SWA 도 판정한다 — 초점으로 CD 를 맞추는 편법이 통하지 않는다.',
        en: 'A larger focus offset can widen the line, but the sidewall collapses: ΔF 0 → ±90 nm drops SWA 86.9° → 72.2°. This stage judges SWA too, so trading focus for CD does not work.',
      },
      {
        ko: '초점심도 DOF = 99.85 nm 는 k₂ = 0.745(S149, ArF 침지 실험 추출)로 계산한 값이다. 출처가 없는 범용 k₂ 는 존재하지 않으므로 다른 파장·건식에는 이 숫자를 옮겨 쓸 수 없다(원장 §4-1).',
        en: 'The 99.85 nm depth of focus comes from k₂ = 0.745, an ArF-immersion experimental value (S149). No universal k₂ exists, so this number cannot be carried to other wavelengths or to dry lenses.',
      },
    ],
  },

  {
    processId: PHOTO_PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P3-04',
    titleKo: 'NA 로 해상도를 얻고 초점심도를 잃는다',
    titleEn: 'Buy resolution with NA, pay for it in depth of focus',
    params: [
      {
        id: 'na', ko: '개구수 NA', en: 'Numerical aperture', unit: '',
        min: NA_RANGE[0], max: NA_RANGE[1], step: 0.01, initial: 1.00, sourceId: 'S140',
        note: '상한 1.35 는 초순수 ArF 침지 실용 상한(원장 §3-3, S140·S149). 하한 1.00 은 k₂ = 0.745 가 ArF 침지(NA>1)에서만 성립하기 때문이다 — 건식 실용 상한 0.93 구간은 DOF 절대값을 낼 수 없다(원장 §4-1).',
      },
      {
        id: 'doseMjCm2', ko: '노광량 E', en: 'Exposure dose', unit: 'mJ/cm²',
        min: DOSE_RANGE_BASIC[0], max: DOSE_RANGE_BASIC[1], step: 1, initial: 25, sourceId: 'S145',
        note: '레지스트 노광 파라미터 근거 S145(Dill 실측). 구간은 PLN §S6 학습 설정.',
      },
      {
        id: 'focusOffsetNm', ko: '초점 오프셋 ΔF', en: 'Focus offset', unit: 'nm',
        min: FOCUS_RANGE_NM[0], max: FOCUS_RANGE_NM[1], step: 10, initial: 0, sourceId: 'S140',
        note: '초점 벌점은 (ΔF/DOF)² 로 들어가므로 NA 를 올릴수록 같은 ΔF 가 크게 벌점을 받는다(S140).',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P3 응용(S6) 의 「고정값」 5개:
     *   λ 193 nm · k1 0.35 · k2 0.745 · 레지스트 두께 T 120 nm · E₀ 12 mJ/cm².
     * 🔴 기초(§S5)와 달리 **NA·n 이 목록에서 빠졌다** — NA 가 조작 파라미터로 승격했기 때문이다.
     *    명세가 뺀 것을 화면이 되살리지 않는다. 「명세에 있는 것만」이 이 카드의 규율이다. */
    fixedConditions: [
      {
        id: 'lambda', ko: '노광 파장 λ', en: 'Exposure wavelength λ',
        value: String(LAMBDA_NM), unit: 'nm', sourceId: 'S140',
        note: 'ArF 엑시머 고정. NA 만 움직여 해상도–초점심도 상충을 보는 것이 이 단계의 학습 의도다.',
      },
      {
        id: 'k1', ko: '해상도 계수 k₁', en: 'Resolution factor k₁',
        value: String(K1_FIXED), basis: `PLN 세 단계 공통 고정값. 물리 하한 ${K1_PHYSICAL_FLOOR.value}(S140·S150)을 침범하지 않는다.`,
      },
      {
        id: 'k2', ko: '초점심도 계수 k₂', en: 'Depth-of-focus factor k₂',
        value: String(K2_ARF_IMMERSION.value), sourceId: 'S149',
        note: '🔴 ArF 침지 실험 추출값 — 건식(NA ≤ 1) 구간으로 옮겨 쓸 수 없어 NA 하한이 1.00 이다(원장 §4-1).',
      },
      {
        id: 'resistThickness', ko: '레지스트 두께 T', en: 'Resist thickness T',
        value: String(APPLIED_RESIST_NM), unit: 'nm', basis: 'PLN 명세 §S6 고정값(교육용 설정). 두께를 움직이는 것은 심화(§S7)의 학습 내용이다.',
      },
      {
        id: 'clearDose', ko: '레지스트 클리어 선량 E₀', en: 'Resist clearing dose E₀',
        value: String(CLEAR_DOSE_MJ), unit: 'mJ/cm²', basis: 'PLN 명세 §S6 고정값(교육용 설정) — 원장에 문헌 출처가 없다.',
      },
    ],
    outputs: [
      { id: 'resolutionNm', ko: '해상도 R', en: 'Resolution', role: 'judge',
        pass: { max: PASS_RESOLUTION_MAX_NM }, digits: 2 },
      { id: 'dofNm', ko: '초점심도 DOF', en: 'Depth of focus', role: 'judge',
        pass: { min: PASS_DOF_MIN_NM }, digits: 2 },
      { id: 'cdNm', ko: '라인 CD', en: 'Line CD', role: 'judge',
        pass: { min: PASS_CD_MIN_NM, max: PASS_CD_MAX_NM }, digits: 2 },
      { id: 'dofVsDryLimit', ko: '건식 상한(NA 0.93) 대비 DOF 비', en: 'DOF vs dry limit (NA 0.93)', role: 'display', digits: 3 },
      { id: 'requiredK1For45nm', ko: '45 nm 를 그리는 데 필요한 k₁', en: 'k₁ required for 45 nm', role: 'display', digits: 3 },
      { id: 'lerNm', ko: 'LER 3σ', en: 'LER 3σ', role: 'display', digits: 2 },
      { id: 'throughputWph', ko: '스루풋 TP', en: 'Throughput', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const na = inputs['na'] ?? NA_RANGE[0];
      const dose = inputs['doseMjCm2'] ?? 25;
      const focus = inputs['focusOffsetNm'] ?? 0;
      assertWithin('na', na, NA_RANGE, '');
      assertWithin('doseMjCm2', dose, DOSE_RANGE_BASIC, 'mJ/cm²');
      assertWithin('focusOffsetNm', focus, FOCUS_RANGE_NM, 'nm');

      const r = resolution({ lambdaNm: LAMBDA_NM, na, k1: K1_FIXED });
      const dof = depthOfFocusArFImmersion({ lambdaNm: LAMBDA_NM, na });
      // 🔴 k₂ 없이 성립하는 비교 — 건식 실용 상한 대비 DOF 배율(원장 §4-1 ⓑ).
      const vsDry = dofRatio({ naFrom: NA_DRY_MAX.value, naTo: na });
      const needK1 = requiredK1({ targetCdNm: TARGET_CD_NM, lambdaNm: LAMBDA_NM, na });

      const sigmaD = sigmaDiffusionNm(APPLIED_PEB_C);
      const defocus = focus / dof.value;
      const cd = CD_AERIAL_COEF * r.value
        + CD_DOSE_SLOPE * (CD_DOSE_PIVOT_MJ - dose)
        + CD_DEFOCUS_COEF * defocus * defocus;

      return {
        resolutionNm: quantity(r.value, {
          modelId: 'photo.lab.applied.resolutionNm', unit: 'nm', sourceId: 'S140',
          validRange: [1, 5000],
          assumptions: ['R = k₁·λ/NA (S140)', ARF_ASSUMPTION],
        }),
        dofNm: quantity(dof.value, {
          modelId: 'photo.lab.applied.dofNm', unit: 'nm', sourceId: 'S149',
          validRange: [1, 5000],
          assumptions: [K2_ASSUMPTION, '합격선 100 nm 는 k₂ 0.745 반영 후 재설계값(파일 상단 §② 참조)'],
        }),
        cdNm: quantity(cd, {
          modelId: 'photo.lab.applied.cdNm', unit: 'nm', basis: "교육용 합성 — 공중상 계수 0.78·선량 기울기 1.2·디포커스 30 은 학습용 CD 응답 계수입니다.",
          validRange: [0, 400],
          assumptions: [SYNTHETIC_ASSUMPTION, ARF_ASSUMPTION, `레지스트 ${APPLIED_RESIST_NM} nm · BARC ON · T_PEB ${APPLIED_PEB_C} °C`],
        }),
        dofVsDryLimit: quantity(vsDry.value, {
          modelId: 'photo.lab.applied.dofVsDryLimit', unit: '', sourceId: 'S143',
          validRange: [0, 1000],
          assumptions: ['DOF ∝ 1/NA² 이므로 k₂ 가 약분된다 — 출처 없는 상수 없이 성립(원장 §4-1)', `기준 NA = ${NA_DRY_MAX.value}(건식 실용 상한, S140)`],
        }),
        requiredK1For45nm: quantity(needK1.value, {
          modelId: 'photo.lab.applied.requiredK1For45nm', unit: '', sourceId: 'S140',
          validRange: [K1_PHYSICAL_FLOOR.value, 1.5],
          assumptions: [`목표 CD ${TARGET_CD_NM} nm`, `2광속 결상 물리 하한 k₁ = ${K1_PHYSICAL_FLOOR.value} (S140 · S150 2개 독립 출처)`],
        }),
        lerNm: quantity(lineEdgeRoughnessNm(dose, sigmaD), {
          modelId: 'photo.lab.applied.lerNm', unit: 'nm', basis: "교육용 합성 — LER 기준 4.5 nm·PEB 부족 벌점 3.0 nm 는 학습용 값이며 IRDS 목표값 미확보(M-10)로 판정에 쓰지 않습니다.",
          validRange: [0, 50],
          assumptions: [SYNTHETIC_ASSUMPTION, '🔴 판정하지 않는다 — 원장 M-10(IRDS LER 목표값 미확보)'],
        }),
        throughputWph: quantity(throughputWph(dose), {
          modelId: 'photo.lab.applied.throughputWph', unit: 'wph', basis: "교육용 합성 — 12000/(48+0.85·E)×0.92 는 학습용 스캐너 스루풋 모형입니다.",
          validRange: [0, 1000],
          assumptions: [SYNTHETIC_ASSUMPTION, '이머전 계수 0.92'],
        }),
      };
    },
    scene: {
      sceneId: 'aerialImage',
      map: photoAppliedSceneMap,
      note: '조작 3키: na ← na · defocus ← focusOffsetNm · exposureDose ← doseMjCm2(SD §3-1 NORM_NA·NORM_DF·NORM_E). '
        + 'NA 가 조작 대상이 되는 칸이다 — 씬이 NA 를 되살려 광 원뿔 반각은 1차로 벌리고(sinθ=NA/n) '
        + '초점 허용 띠는 `143.785/NA²`(SD P-1)로 **제곱으로 얇게** 그린다. NA 1.00 → 1.35 에서 '
        + '띠 두께비 (1.00/1.35)² = 0.549 배 — 이 대비가 이 씬의 교육 내용 전부다. '
        + '상수 2키: resistThickness = 0.0714(APPLIED_RESIST_NM 120 nm 고정) · '
        + 'fringeAmplitude = 0.2390(BARC ON 고정, 기초와 같은 사유). '
        + '연동 1키: lineWidth ← cdNm. '
        + '🔴 건식/액침 토글에 대응하는 lab 파라미터가 없다(NA 하한 1.00 으로 ArF 침지가 고정 조건이다) — '
        + '국소 갭은 **항상 채워진 상태**로 그리고 잠금 경계 연출도 만들지 않는다. '
        + '측벽각은 이 칸도 씬이 defocus 하나로 SD P-3 식(SWA_scr)을 계산한다 — 랩 게이지 swaDeg 와 다르게 그린다.',
    },
    feedback: [
      {
        id: 'PH-A1', tone: 'stop',
        ko: '노광량이 클리어 선량 E₀ = 12 mJ/cm² 미만입니다. 레지스트가 열리지 않습니다.',
        en: 'Dose is below the clear dose E₀ = 12 mJ/cm². The resist never opens.',
        when: (i) => (i['doseMjCm2'] ?? 25) <= CLEAR_DOSE_MJ,
      },
      {
        id: 'PH-A2', tone: 'hint',
        ko: '해상도는 확보했으나 초점심도가 부족합니다. R 은 NA 에 반비례하지만 DOF 는 NA 의 제곱에 반비례합니다 — NA 를 한두 칸 낮추십시오.',
        en: 'Resolution is met but depth of focus is short. R scales as 1/NA while DOF scales as 1/NA² — back the NA off a step or two.',
        when: (_i, o) => (o['resolutionNm'] ?? 999) <= PASS_RESOLUTION_MAX_NM && (o['dofNm'] ?? 0) < PASS_DOF_MIN_NM,
      },
      {
        id: 'PH-A3', tone: 'hint',
        ko: '초점 여유는 충분하지만 목표 피치를 해상하지 못합니다. NA 를 올리십시오 — 다만 올린 만큼 DOF 를 제곱으로 잃습니다.',
        en: 'Focus budget is ample but the target pitch is not resolved. Raise NA — but you lose DOF as the square of what you gain.',
        when: (_i, o) => (o['dofNm'] ?? 0) >= PASS_DOF_MIN_NM && (o['resolutionNm'] ?? 0) > PASS_RESOLUTION_MAX_NM,
      },
      {
        id: 'PH-A4', tone: 'hint',
        ko: 'NA 는 맞았습니다. 남은 것은 노광량으로 CD 를 42~48 nm 안에 넣는 일입니다 — 초점 오프셋이 0 이 아니면 (ΔF/DOF)² 만큼 라인이 굵어집니다.',
        en: 'NA is in the window. What remains is to bring CD into 42–48 nm with the dose — any focus offset thickens the line by (ΔF/DOF)².',
        when: (_i, o) => {
          const cd = o['cdNm'] ?? 0;
          return (o['resolutionNm'] ?? 999) <= PASS_RESOLUTION_MAX_NM
            && (o['dofNm'] ?? 0) >= PASS_DOF_MIN_NM
            && (cd < PASS_CD_MIN_NM || cd > PASS_CD_MAX_NM);
        },
      },
      {
        id: 'PH-A5', tone: 'warn',
        ko: '목표 CD 45 nm 를 지금 NA 로 그리려면 k₁ 이 물리 하한 0.25 아래여야 합니다(2광속 결상 한계, S140·S150 2개 독립 출처). 어떤 레시피로도 불가능한 영역입니다 — NA 를 1.08 이상으로 올리십시오.',
        en: 'Printing the 45 nm target at this NA would require k₁ below the physical floor of 0.25 (two-beam imaging limit, S140 and S150). No recipe can do it — raise NA above 1.08.',
        when: (_i, o) => (o['requiredK1For45nm'] ?? 1) < K1_PHYSICAL_FLOOR.value,
      },
      {
        id: 'PH-A6', tone: 'warn',
        ko: 'NA 1.35 는 초순수 이머전의 실용 상한입니다(S140·S149). 이 근처에서는 초점 오차 1 nm 가 저NA 대비 몇 배로 벌점을 받습니다.',
        en: 'NA 1.35 is the practical limit for water immersion (S140, S149). Near it, a 1 nm focus error costs several times what it does at low NA.',
        when: (i) => (i['na'] ?? 1) >= 1.30,
      },
      {
        id: 'PH-A7', tone: 'hint',
        ko: '이 실습은 ArF 침지 렌즈 전용입니다. 건식 렌즈 실용 상한 NA 0.93 에서는 R = 72.63 nm 로 58 nm 목표를 애초에 해상할 수 없습니다 — 「건식 상한 대비 DOF 비」가 이머전으로 무엇을 잃는지 보여 줍니다.',
        en: 'This lab is immersion-only. At the dry practical limit of NA 0.93 the resolution is 72.63 nm, so the 58 nm target is unreachable — the "DOF vs dry limit" readout shows what immersion costs you.',
        when: (i) => (i['na'] ?? 1) < 1.05,
      },
    ],
    tradeoffs: [
      {
        ko: '🔴 핵심 상충 — NA ↑ → R 개선(∝1/NA) / DOF 악화(∝1/NA²). NA 1.00 → 1.35 에서 R 은 67.55 → 50.04 nm 로 25.9 % 개선되지만 DOF 는 143.79 → 78.87 nm 로 45.1 % 잃는다. 두 판정이 서로 반대 방향으로 벽을 세우므로 합격 NA 는 1.17 ~ 1.19 세 칸뿐이다.',
        en: 'The core trade-off — raising NA improves R as 1/NA but ruins DOF as 1/NA². From NA 1.00 to 1.35, R improves 67.55 → 50.04 nm (−25.9 %) while DOF falls 143.79 → 78.87 nm (−45.1 %). The two limits pinch the passing NA down to just 1.17–1.19.',
      },
      {
        ko: 'E ↑ → CD 축소·LER 개선 / 스루풋 저하. E 25 → 40 에서 LER 4.50 → 3.56 nm, TP 159 → 135 wph.',
        en: 'Higher dose shrinks CD and improves LER but lowers throughput: E 25 → 40 moves LER 4.50 → 3.56 nm and throughput 159 → 135 wph.',
      },
      {
        ko: '|ΔF| ↑ → CD 증가(악화) — 그리고 고NA 일수록 같은 초점 오차의 벌점이 커진다. ΔF = +60 nm 는 NA 1.17(DOF 105.0)에서 CD 를 9.8 nm 밀지만 NA 1.00(DOF 143.8)에서는 5.2 nm 밖에 밀지 않는다.',
        en: 'Focus error thickens the line, and the penalty grows with NA. A +60 nm offset adds 9.8 nm of CD at NA 1.17 (DOF 105.0) but only 5.2 nm at NA 1.00 (DOF 143.8).',
      },
      {
        ko: '이머전은 공짜가 아니다 — NA 상한이 0.93 → 1.35 로 열리는 대신 스루풋이 8 % 깎이고(계수 0.92) 물 결함(워터마크·기포) 위험이 생긴다.',
        en: 'Immersion is not free — the NA ceiling opens from 0.93 to 1.35 but throughput drops 8 % (factor 0.92) and water defects such as watermarks and bubbles appear.',
      },
    ],
  },

  {
    processId: PHOTO_PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P3-05',
    titleKo: '여섯 지표를 동시에 지킨다 — 해상도·초점심도·CD·벽면각·수율·스루풋',
    titleEn: 'Hold six metrics at once — resolution, DOF, CD, sidewall, yield, throughput',
    params: [
      {
        id: 'na', ko: '개구수 NA', en: 'Numerical aperture', unit: '',
        min: NA_RANGE[0], max: NA_RANGE[1], step: 0.01, initial: 1.00, sourceId: 'S140',
        note: '1.00 ~ 1.35 (ArF 침지). 하한 근거는 원장 §4-1, 상한 근거는 §3-3(S140·S149).',
      },
      {
        id: 'doseMjCm2', ko: '노광량 E', en: 'Exposure dose', unit: 'mJ/cm²',
        min: DOSE_RANGE_ADV[0], max: DOSE_RANGE_ADV[1], step: 1, initial: 25, sourceId: 'S145',
        note: '심화는 80 mJ/cm² 까지 연다. 다만 스루풋 판정(TP ≥ 120)이 E ≤ 51 을 실질 상한으로 만든다.',
      },
      {
        id: 'focusOffsetNm', ko: '초점 오프셋 ΔF', en: 'Focus offset', unit: 'nm',
        min: FOCUS_RANGE_NM[0], max: FOCUS_RANGE_NM[1], step: 5, initial: 0, sourceId: 'S140',
        note: 'CD·SWA 두 판정에 (ΔF/DOF)² 로 동시에 들어간다(S140).',
      },
      {
        id: 'resistThicknessNm', ko: '레지스트 두께 T', en: 'Resist thickness', unit: 'nm',
        min: RESIST_RANGE_NM[0], max: RESIST_RANGE_NM[1], step: 10, initial: 300, sourceId: 'S141',
        note: '레지스트 공정 파라미터 근거 S141(Mack). 60 ~ 900 nm 구간은 PLN §S7 학습 설정이며 종횡비 붕괴(AR > 3)를 관찰하기 위한 범위다.',
      },
      {
        id: 'pebTempC', ko: 'PEB 온도 T_PEB', en: 'PEB temperature', unit: '°C',
        min: PEB_RANGE_C[0], max: PEB_RANGE_C[1], step: 1, initial: 110, sourceId: 'S141',
        note: '산확산 길이 σ_D 를 만든다. 확산길이 FWHM 정의는 원장 §3-3(S141 · Tutor 54). 🔴 σ_D 절대값 판정은 하지 않는다(원장 M-11).',
      },
      {
        id: 'barcOn', ko: '하부 반사방지막 BARC (0 = OFF · 1 = ON)', en: 'Bottom ARC (0 = off, 1 = on)', unit: '',
        min: BARC_RANGE[0], max: BARC_RANGE[1], step: 1, initial: 0, sourceId: 'S141',
        note: '정재파 주기 λ/2n_r 와 반사 억제는 원장 §3-3(S141 L47 s6). 반사율 0.35 → 0.02 는 PLN 교육용 설정.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P3 심화(S7) 의 「고정값」 5개:
     *   k1 0.35 · k2 0.745(원장 S149) · 레지스트 굴절률 n_r 1.70 · E₀ 12 mJ/cm² ·
     *   기판 반사율 R_s 0.35(BARC OFF) / 0.02(BARC ON).
     * 🔴 명세 목록에 λ 는 없다 — 지어내 채우지 않는다. 레지스트 두께 T 는 이 단계에서
     *    **조작 슬라이더**(`resistThicknessNm`)라 고정 조건이 아니다.
     * 🔴 R_s 는 값이 둘이다. BARC 슬라이더가 **어느 쪽을 고르는가**가 이 칸의 학습 내용이므로
     *    한쪽을 지우지 않고 둘 다 적는다. */
    fixedConditions: [
      {
        id: 'k1', ko: '해상도 계수 k₁', en: 'Resolution factor k₁',
        value: String(K1_FIXED), basis: `PLN 세 단계 공통 고정값. 물리 하한 ${K1_PHYSICAL_FLOOR.value}(S140·S150)을 침범하지 않는다.`,
      },
      {
        id: 'k2', ko: '초점심도 계수 k₂', en: 'Depth-of-focus factor k₂',
        value: String(K2_ARF_IMMERSION.value), sourceId: 'S149',
        note: '🔴 ArF 침지 실험 추출값 — 다른 파장·건식 렌즈로 옮겨 쓸 수 없다(원장 §4-1).',
      },
      {
        id: 'resistIndex', ko: '레지스트 굴절률 n_r', en: 'Resist refractive index n_r',
        value: String(RESIST_INDEX), sourceId: 'S141',
        note: `정재파 주기 P_sw = λ/(2·n_r) = ${STANDING_WAVE_PERIOD_NM.toFixed(2)} nm 를 정한다(원장 §3-3, S141 L47 s6).`,
      },
      {
        id: 'clearDose', ko: '레지스트 클리어 선량 E₀', en: 'Resist clearing dose E₀',
        value: String(CLEAR_DOSE_MJ), unit: 'mJ/cm²', basis: 'PLN 명세 §S7 고정값(교육용 설정) — 원장에 문헌 출처가 없다.',
      },
      {
        id: 'substrateReflectance', ko: '기판 반사율 R_s', en: 'Substrate reflectance R_s',
        value: `${REFLECTANCE_BARC_OFF} (BARC OFF) / ${REFLECTANCE_BARC_ON} (BARC ON)`,
        basis: 'PLN 명세 §S7 고정값(교육용 설정) — 두 값 중 어느 쪽이 쓰이는지는 BARC 슬라이더가 정한다.',
      },
    ],
    outputs: [
      { id: 'resolutionNm', ko: '해상도 R', en: 'Resolution', role: 'judge',
        pass: { max: PASS_RESOLUTION_MAX_NM }, digits: 2 },
      { id: 'dofNm', ko: '초점심도 DOF', en: 'Depth of focus', role: 'judge',
        pass: { min: PASS_DOF_MIN_NM }, digits: 2 },
      { id: 'cdNm', ko: '라인 CD', en: 'Line CD', role: 'judge',
        pass: { min: PASS_CD_MIN_NM, max: PASS_CD_MAX_NM }, digits: 2 },
      { id: 'swaDeg', ko: '벽면각 SWA', en: 'Sidewall angle', role: 'judge',
        pass: { min: PASS_SWA_MIN_DEG }, digits: 2 },
      { id: 'yieldPct', ko: '수율 Y', en: 'Yield', role: 'judge',
        pass: { min: PASS_YIELD_MIN_PCT }, digits: 1 },
      { id: 'throughputWph', ko: '스루풋 TP', en: 'Throughput', role: 'judge',
        pass: { min: PASS_THROUGHPUT_MIN_WPH }, digits: 1 },
      { id: 'sigmaDiffusionNm', ko: 'PEB 산확산 길이 σ_D', en: 'PEB acid diffusion length', role: 'display', digits: 2 },
      { id: 'aspectRatio', ko: '종횡비 AR', en: 'Aspect ratio', role: 'display', digits: 3 },
      { id: 'collapseProbability', ko: '패턴 붕괴 확률 P_col', en: 'Pattern collapse probability', role: 'display', digits: 3 },
      { id: 'lerNm', ko: 'LER 3σ', en: 'LER 3σ', role: 'display', digits: 2 },
      { id: 'standingWaveCount', ko: '정재파 줄무늬 개수 N_sw', en: 'Standing-wave fringe count', role: 'display', digits: 1 },
    ],
    compute(inputs) {
      const na = inputs['na'] ?? NA_RANGE[0];
      const dose = inputs['doseMjCm2'] ?? 25;
      const focus = inputs['focusOffsetNm'] ?? 0;
      const thickness = inputs['resistThicknessNm'] ?? 300;
      const pebC = inputs['pebTempC'] ?? PEB_REF_C;
      const barc = inputs['barcOn'] ?? 0;
      assertWithin('na', na, NA_RANGE, '');
      assertWithin('doseMjCm2', dose, DOSE_RANGE_ADV, 'mJ/cm²');
      assertWithin('focusOffsetNm', focus, FOCUS_RANGE_NM, 'nm');
      assertWithin('resistThicknessNm', thickness, RESIST_RANGE_NM, 'nm');
      assertWithin('pebTempC', pebC, PEB_RANGE_C, '°C');
      assertWithin('barcOn', barc, BARC_RANGE, '');

      const r = resolution({ lambdaNm: LAMBDA_NM, na, k1: K1_FIXED });
      const dof = depthOfFocusArFImmersion({ lambdaNm: LAMBDA_NM, na });

      const reflectance = barc >= 0.5 ? REFLECTANCE_BARC_ON : REFLECTANCE_BARC_OFF;
      const sigmaD = sigmaDiffusionNm(pebC);
      const defocus = focus / dof.value;

      const cd = CD_AERIAL_COEF * r.value
        + CD_DOSE_SLOPE * (CD_DOSE_PIVOT_MJ - dose)
        + CD_DEFOCUS_COEF * defocus * defocus
        + CD_DIFFUSION_COEF * Math.max(0, sigmaD - CD_DIFFUSION_KNEE_NM);
      const swa = sidewallAngleDeg(focus, dof.value, reflectance, sigmaD);
      const ler = lineEdgeRoughnessNm(dose, sigmaD);
      // 🔴 A14 — CD 가 0 근처일 때 AR 이 발산하지 않게 표시용 하한을 둔다.
      const aspect = thickness / Math.max(cd, AR_DENOMINATOR_FLOOR_NM);
      const pCol = collapseProbability(aspect);
      const tp = throughputWph(dose);
      const yieldPct = clampPercent(
        YIELD_FULL_PCT
        - YIELD_COLLAPSE_COEF * pCol
        - YIELD_LER_COEF * Math.max(0, ler - LER_REF_NM)
        - YIELD_SWA_COEF * Math.max(0, PASS_SWA_MIN_DEG - swa)
        - YIELD_CD_COEF * Math.max(0, Math.abs(cd - TARGET_CD_NM) - CD_TOLERANCE_NM),
      );

      const scoreAssumptions = [SYNTHETIC_ASSUMPTION, ARF_ASSUMPTION, '오버레이·LER 판정은 원장 M-10 에 따라 제외'];

      return {
        resolutionNm: quantity(r.value, {
          modelId: 'photo.lab.advanced.resolutionNm', unit: 'nm', sourceId: 'S140',
          validRange: [1, 5000],
          assumptions: ['R = k₁·λ/NA (S140)', ARF_ASSUMPTION],
        }),
        dofNm: quantity(dof.value, {
          modelId: 'photo.lab.advanced.dofNm', unit: 'nm', sourceId: 'S149',
          validRange: [1, 5000],
          assumptions: [K2_ASSUMPTION, '합격선 100 nm 는 k₂ 0.745 반영 후 재설계값(파일 상단 §② 참조)'],
        }),
        cdNm: quantity(cd, {
          modelId: 'photo.lab.advanced.cdNm', unit: 'nm', basis: "교육용 합성 — 공중상·선량·디포커스·확산 부풀음 계수는 모두 학습용 CD 응답 계수입니다.",
          validRange: [0, 400],
          assumptions: scoreAssumptions,
        }),
        swaDeg: quantity(swa, {
          modelId: 'photo.lab.advanced.swaDeg', unit: '°', basis: "교육용 합성 — 이상각 88°·디포커스 18·반사 14 는 학습용 벽면각 합성식의 계수입니다.",
          validRange: [0, 90],
          assumptions: [SYNTHETIC_ASSUMPTION, '합격선 82° 는 원장 §3-3 「측벽각 > 80°」(S141·S144 2건 일치)보다 엄격', K2_ASSUMPTION],
        }),
        yieldPct: quantity(yieldPct, {
          modelId: 'photo.lab.advanced.yieldPct', unit: '%', basis: "교육용 합성 — 붕괴 45·LER 2.5·SWA 1.5·CD 2.0 감점은 학습용 수율 스코어링이며 실제 수율이 아닙니다.",
          validRange: [0, 100],
          assumptions: scoreAssumptions,
        }),
        throughputWph: quantity(tp, {
          modelId: 'photo.lab.advanced.throughputWph', unit: 'wph', basis: "교육용 합성 — 12000/(48+0.85·E)×0.92 는 학습용 스캐너 스루풋 모형입니다.",
          validRange: [0, 1000],
          assumptions: [SYNTHETIC_ASSUMPTION, '이머전 계수 0.92 · 오버레이 정렬 시간 항은 M-10 에 따라 제외'],
        }),
        sigmaDiffusionNm: quantity(sigmaD, {
          modelId: 'photo.lab.advanced.sigmaDiffusionNm', unit: 'nm', basis: "교육용 합성 — σ_D = 12·exp((T−110)/12) 은 학습용 PEB 산확산 모형이며 절대값으로 합격을 가르지 않습니다(M-11).",
          validRange: [0, 200],
          assumptions: [SYNTHETIC_ASSUMPTION, '🔴 절대값으로 합격/불합격을 가르지 않는다(원장 M-11)'],
        }),
        aspectRatio: quantity(aspect, {
          modelId: 'photo.lab.advanced.aspectRatio', unit: '', basis: "교육용 합성 — AR = T/CD 의 분모 CD 가 학습용 합성 응답값이며 발산 방지용 하한 1 nm 도 물리가 아닙니다.",
          validRange: [0, 1000],
          assumptions: [SYNTHETIC_ASSUMPTION, 'AR = T / CD'],
        }),
        collapseProbability: quantity(pCol, {
          modelId: 'photo.lab.advanced.collapseProbability', unit: '', basis: "교육용 합성 — AR 3.0 무릎·기울기 0.25 는 학습용 값이며 실제 붕괴 임계는 레지스트·린스액 표면장력에 따라 달라집니다.",
          validRange: [0, 1],
          assumptions: [SYNTHETIC_ASSUMPTION, '실제 붕괴 임계는 레지스트·린스액 표면장력에 따라 달라진다'],
        }),
        lerNm: quantity(ler, {
          modelId: 'photo.lab.advanced.lerNm', unit: 'nm', basis: "교육용 합성 — LER 기준 4.5 nm·PEB 부족 벌점 3.0 nm 는 학습용 값이며 수율 감점항으로만 씁니다(M-10).",
          validRange: [0, 50],
          assumptions: [SYNTHETIC_ASSUMPTION, '🔴 판정하지 않는다 — 원장 M-10. 수율 감점항으로만 쓴다'],
        }),
        standingWaveCount: quantity(thickness / STANDING_WAVE_PERIOD_NM, {
          modelId: 'photo.lab.advanced.standingWaveCount', unit: '', basis: "교육용 합성 — 정재파 주기 λ/2n 은 문헌식이나 레지스트 굴절률 1.70 이 근사값이라 출처 확정 전까지 합성으로 둡니다.",
          validRange: [0, 200],
          assumptions: [`정재파 주기 P_sw = λ/(2·n_r) = ${STANDING_WAVE_PERIOD_NM.toFixed(2)} nm (S141 L47 s6, n_r ≈ ${RESIST_INDEX})`],
        }),
      };
    },
    scene: {
      sceneId: 'aerialImage',
      map: photoAdvancedSceneMap,
      note: '조작 4키: na · defocus · exposureDose(🔴 이 칸만 랩 슬라이더 상한 80 — NORM_E 는 3칸 공통 [10,80] '
        + '이므로 그대로 통과) · resistThickness ← resistThicknessNm(SD NORM_T, 아핀 [60,900]). '
        + '연동 2키: lineWidth ← cdNm · fringeAmplitude ← barcOn(SD BARC_AMP — 0 이면 1.0000, 1 이면 0.2390). '
        + '🔴 정재파 줄무늬 **간격은 씬 쪽 상수**(`SW_SPACING_V` = P_sw×M_z, resistThickness 와 무관 — '
        + `P_sw = λ/(2·n_r) = ${STANDING_WAVE_PERIOD_NM.toFixed(2)} nm, S141 n_r≈${RESIST_INDEX})다. `
        + '두께가 늘면 정재파 **개수만** 늘고 간격은 절대 안 변한다 — R5 가 구조로 지켜진다(uniform 이 아니라 상수라 '
        + '실수로도 두께에 종속시킬 수 없다). 대비는 fringeAmplitude 로만 조절된다(BARC OFF 가 ON 보다 4.18배 진하다). '
        + '🔴 PEB 온도는 씬 키가 없다(노광 후 공정, §9-3 #2) — PEB 가 움직인 CD 는 lineWidth 로만 화면에 나타난다. '
        + '측벽각은 defocus 하나로 SD P-3 식(SWA_scr)을 씬이 계산한다 — 랩 게이지 swaDeg 와 다르게 그린다.',
    },
    feedback: [
      {
        id: 'PH-C1', tone: 'stop',
        ko: '공정 한계선 초과 — PEB 산 확산 과다(σ_D ≥ 30 nm). 확산길이가 피처 크기에 근접해 패턴이 소실됩니다. PEB 온도를 121 °C 이하로 내리십시오.',
        en: 'Process limit exceeded — excessive PEB acid diffusion (σ_D ≥ 30 nm). The diffusion length approaches the feature size and the pattern is lost. Bring PEB below 121 °C.',
        when: (_i, o) => (o['sigmaDiffusionNm'] ?? 0) >= SIGMA_D_STOP_NM,
      },
      {
        id: 'PH-C2', tone: 'stop',
        ko: '노광량이 클리어 선량 E₀ = 12 mJ/cm² 미만입니다. 레지스트가 열리지 않습니다.',
        en: 'Dose is below the clear dose E₀ = 12 mJ/cm². The resist never opens.',
        when: (i) => (i['doseMjCm2'] ?? 25) <= CLEAR_DOSE_MJ,
      },
      {
        id: 'PH-C3', tone: 'stop',
        ko: '공정 한계선 초과 — 라인 소실(line pinching). 노광량을 낮추십시오.',
        en: 'Process limit exceeded — line pinching. Lower the dose.',
        when: (_i, o) => (o['cdNm'] ?? TARGET_CD_NM) < 20,
      },
      {
        id: 'PH-C4', tone: 'warn',
        ko: 'PEB 부족 — 화학증폭형 레지스트의 탈보호 반응이 덜 진행됐습니다(σ_D < 5 nm). LER 이 3 nm 악화되고, BARC 가 꺼져 있으면 정재파가 벽면각을 무너뜨립니다. PEB 온도를 100 ~ 112 °C 로 올리십시오.',
        en: 'Under-baked — the chemically amplified deprotection has not run far enough (σ_D < 5 nm). LER worsens by 3 nm, and with BARC off the standing wave wrecks the sidewall. Raise PEB to 100–112 °C.',
        when: (_i, o) => (o['sigmaDiffusionNm'] ?? 12) < SIGMA_D_UNDERPEB_NM,
      },
      {
        id: 'PH-C5', tone: 'warn',
        ko: '정재파가 평활화되지 않았습니다 — 확산길이 σ_D 가 정재파 주기의 절반(28.38 nm)보다 작은데 BARC 가 꺼져 있습니다. BARC 를 켜십시오(반사율 0.35 → 0.02, 벽면각 벌점 4.78° → 1.14°).',
        en: 'The standing wave is not smoothed — σ_D is below half the standing-wave period (28.38 nm) and BARC is off. Turn BARC on: reflectance 0.35 → 0.02 drops the sidewall penalty from 4.78° to 1.14°.',
        when: (i, o) => (i['barcOn'] ?? 0) < 0.5 && (o['sigmaDiffusionNm'] ?? 12) < STANDING_WAVE_HALF_NM,
      },
      {
        id: 'PH-C6', tone: 'warn',
        ko: '종횡비가 3.0 을 넘었습니다 — 린스·건조 중 패턴 붕괴 위험 구간입니다. 레지스트 두께를 낮추거나 CD 를 키우십시오. CD 45 nm 기준 정답 구간은 T = 80 ~ 135 nm 입니다.',
        en: 'Aspect ratio has passed 3.0 — the rinse-and-dry collapse regime. Thin the resist or widen the CD. At CD 45 nm the safe band is T = 80–135 nm.',
        when: (_i, o) => (o['aspectRatio'] ?? 0) > COLLAPSE_AR_KNEE,
      },
      {
        id: 'PH-C7', tone: 'warn',
        ko: '레지스트가 너무 얇습니다(80 nm 미만). 후속 식각에서 마스크가 먼저 소모됩니다 — 하류 공정 호환성 경고입니다.',
        en: 'The resist is thinner than 80 nm. The mask will be consumed before the etch finishes — a downstream compatibility warning.',
        when: (i) => (i['resistThicknessNm'] ?? 300) < RESIST_THIN_WARN_NM,
      },
      {
        id: 'PH-C8', tone: 'hint',
        ko: 'LER 을 낮추려고 선량을 올리면 스루풋 규격에서 떨어집니다. TP ≥ 120 wph 는 12000/(48 + 0.85·E) × 0.92 ≥ 120, 즉 E ≤ 51 mJ/cm² 를 요구합니다.',
        en: 'Pushing the dose up to fight LER breaks the throughput spec. TP ≥ 120 wph means 12000/(48 + 0.85E) × 0.92 ≥ 120, i.e. E ≤ 51 mJ/cm².',
        when: (_i, o) => (o['throughputWph'] ?? 999) < PASS_THROUGHPUT_MIN_WPH,
      },
      {
        id: 'PH-C9', tone: 'hint',
        ko: 'CD 와 벽면각은 규격 안인데 수율이 낮습니다. 남은 감점원은 종횡비뿐입니다 — 레지스트 두께를 보십시오.',
        en: 'CD and sidewall are in spec but the yield is not. The only penalty left is aspect ratio — look at the resist thickness.',
        when: (_i, o) => {
          const cd = o['cdNm'] ?? 0;
          return (o['yieldPct'] ?? 100) < PASS_YIELD_MIN_PCT
            && cd >= PASS_CD_MIN_NM && cd <= PASS_CD_MAX_NM
            && (o['swaDeg'] ?? 0) >= PASS_SWA_MIN_DEG;
        },
      },
      {
        id: 'PH-C10', tone: 'hint',
        ko: '해상도와 초점심도가 동시에 걸리는 NA 는 1.17 ~ 1.19 세 칸뿐입니다. R ≤ 58 은 NA ≥ 1.17 을, DOF ≥ 100 은 NA ≤ 1.19 를 요구합니다.',
        en: 'Only three NA settings satisfy both limits: 1.17, 1.18 and 1.19. R ≤ 58 needs NA ≥ 1.17 while DOF ≥ 100 needs NA ≤ 1.19.',
        when: (_i, o) => (o['resolutionNm'] ?? 0) > PASS_RESOLUTION_MAX_NM || (o['dofNm'] ?? 999) < PASS_DOF_MIN_NM,
      },
      {
        id: 'PH-C11', tone: 'warn',
        ko: 'PEB 과다 — 확산길이가 15 nm 를 넘어 라인이 부풀고 모서리가 둥글어집니다. CD 항에 0.8 × (σ_D − 15) nm 가 더해집니다.',
        en: 'Over-baked — the diffusion length exceeds 15 nm, so the line swells and the corners round off. The CD picks up 0.8 × (σ_D − 15) nm.',
        when: (_i, o) => {
          const s = o['sigmaDiffusionNm'] ?? 12;
          return s > CD_DIFFUSION_KNEE_NM && s < SIGMA_D_STOP_NM;
        },
      },
    ],
    tradeoffs: [
      {
        ko: '🔴 핵심 상충 — NA ↑ → R 개선(∝1/NA) / DOF 악화(∝1/NA²). 심화에서는 둘 다 판정한다. 그리고 DOF 가 줄면 같은 ΔF 의 CD·SWA 벌점이 (1/DOF)² 로 커진다 — ΔF = 70 nm 의 CD 벌점은 NA 1.00(DOF 143.8)에서 7.1 nm, NA 1.19(DOF 101.5)에서 14.3 nm, NA 1.35(DOF 78.9)에서 23.6 nm.',
        en: 'The core trade-off — NA improves R as 1/NA but ruins DOF as 1/NA², and both are judged here. A shrinking DOF also magnifies every focus error: a 70 nm offset costs 7.1 nm of CD at NA 1.00, 14.3 nm at NA 1.19 and 23.6 nm at NA 1.35.',
      },
      {
        ko: 'E ↑ → CD 축소·LER 개선 / 스루풋 저하. E 25 → 50 에서 LER 4.50 → 3.18 nm 지만 TP 159.4 → 122.0 wph. E 55 면 TP 116.5 wph 로 불합격이다 — LER 을 좋게 하려다 스루풋을 잃는다.',
        en: 'Higher dose shrinks CD and improves LER but costs throughput: E 25 → 50 moves LER 4.50 → 3.18 nm and TP 159.4 → 122.0 wph. At E 55 throughput falls to 116.5 wph and fails.',
      },
      {
        ko: 'T_PEB ↑ → 정재파 평활로 벽면각 개선 / σ_D > 15 nm 부터 CD 부풀음(0.8 × (σ_D−15)), σ_D ≥ 30 nm 에서 패턴 소실. T_PEB 110 → 118 °C 면 σ_D 12.0 → 23.4 nm, CD +6.7 nm.',
        en: 'A hotter PEB smooths the standing wave and improves the sidewall, but past σ_D = 15 nm the line swells by 0.8 × (σ_D − 15), and at σ_D ≥ 30 nm the pattern is lost. PEB 110 → 118 °C moves σ_D 12.0 → 23.4 nm and CD by +6.7 nm.',
      },
      {
        ko: '레지스트 두께 T ↑ → 후속 식각 내성 개선 / 종횡비 붕괴 위험 악화. CD 45 nm 고정 시 T 120 → AR 2.67(P_col 0) / T 180 → AR 4.00(수율 −11.3 %p) / T 300 → AR 6.67(수율 −41.3 %p).',
        en: 'A thicker resist survives the etch better but courts collapse. At CD 45 nm: T 120 gives AR 2.67 (no collapse), T 180 gives AR 4.00 (−11.3 %p yield) and T 300 gives AR 6.67 (−41.3 %p).',
      },
      {
        ko: 'BARC ON → 정재파·반사 노칭 억제로 벽면각 벌점이 4.78° → 1.14° 로 준다(초점 여유가 |ΔF| 27 nm → 55 nm 로 2배). 대신 도포·식각 공정 단계가 1개 늘어 원가·시간이 든다.',
        en: 'Turning BARC on suppresses standing waves and reflective notching, cutting the sidewall penalty from 4.78° to 1.14° and doubling the usable focus range from about 27 nm to 55 nm — at the cost of one extra coat-and-etch step.',
      },
      {
        ko: '🔴 이 실습에서 뺀 것 — λ 선택(EUV 포함)·이머전 토글은 k₂ 절대값이 ArF 침지에서만 성립하기 때문에(원장 §4-1), 오버레이 보정과 LER 판정은 출처 미확보 때문에(원장 M-10) 넣지 않았다. LER 은 표시와 수율 감점항으로만 남는다.',
        en: 'What this lab deliberately omits: wavelength choice (including EUV) and the immersion toggle, because the absolute k₂ only holds for ArF immersion; and overlay correction and LER pass/fail, because no sourced target exists. LER remains as a readout and a yield penalty only.',
      },
    ],
  },
];
