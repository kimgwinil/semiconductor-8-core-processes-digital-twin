import type { LabSpec, LabSceneBinding, LabChartBinding, LabChartSeries } from './spec';
import { OutOfLimitError, quantity, type Quantity } from '../contract';
import {
  CU_PRESTON_KP,
  PRESSURE_RANGE_PA,
  VELOCITY_RANGE_MPS,
  R165_PRESSURE_KPA,
  R165_PLATEN_RPM,
  R165_CENTER_DISTANCE_MM,
  R165_MRR_NM_PER_MIN,
  relativeVelocity,
  removalRate,
  polishTime,
} from '../physics/metal/cmp';
import {
  CU_RHO0,
  CU_MEAN_FREE_PATH_NM,
  copperLineResistance,
  effectiveResistivityFSLine,
} from '../physics/metal/resistance';
import { K_SIO2, K_SICOH_MIN, normalizedRcDelay } from '../physics/metal/rcDelay';
import {
  BLACK_N_CU_MIN,
  BLACK_N_CU_MAX,
  BLECH_CU_TEMP_K,
  EM_ACTIVATION_ENERGY,
  blackAccelerationFactor,
  copperBlechCriticalProduct,
} from '../physics/metal/electromigration';
import { PA_PER_KPA } from '../physics/metal/units';
import { A_PER_MA } from '../physics/units';

/**
 * P6 금속배선·CMP 실습 명세 — PLN `03_실습3단계명세.md` §P6 기초(S5)·응용(S6)·심화(S7) 배선.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔴 0. 이 파일이 PLN 명세와 다른 이유 — **읽지 않고 수정하지 마라.**
 * ════════════════════════════════════════════════════════════════════════════
 * A15 는 `compute()` 에서 식을 새로 쓰는 것을 금지하고 `src/models/physics/metal/**` 호출만
 * 허용한다. 그런데 PLN 이 §P6 「공통 모델식」으로 제시한 것은 **전부 교육용 합성 모델**이고,
 * 물리층은 그중 상당수를 **원장 근거가 없다는 이유로 명시적으로 거부**하고 있다:
 *
 *  | PLN 모델식 | 물리층 상태 | 이 파일의 처리 |
 *  |---|---|---|
 *  | `R_bu = 1.00 + 0.12·C_sup + …` (바텀업 비) | ⛔ `electroplating.ts` — 「첨가제 3종의 바텀업 필 정량 모델은 원장에 없다 → 만들지 않는다」 | **미구현** |
 *  | `d_void = clamp(0,60, 34 − 26(R_bu−1))` | ⛔ 위와 동일(R_bu 가 없으면 성립 불가) | **미구현** |
 *  | `D_dish = 2.6·P_d^1.25·…` (디싱 절대 nm) | ⛔ `cmp.ts` — 「디싱·에로전의 절대 nm 허용치는 만들지 않는다(M-19)」 | **미구현** |
 *  | `E_ero`(에로전) | ⛔ DSN `12_시각화씬_공백보고.md` §4-3 — 「조사가 정의를 미확인으로 남겼다. 씬에 넣지 마라」 | **미구현** |
 *  | `N_sc`(스크래치) · `Y`(수율) · `TH`(처리량) | ⛔ 대응 물리 함수 없음 | **미구현** |
 *  | `W_Cu = W − 2·t_bar` (배리어 잠식) | ⛔ `resistance.ts` — 「배리어 두께 파라미터는 만들지 않는다(M-18)」 | **미구현**(W 를 그대로 씀) |
 *  | `ρ_eff = 1.70·(1 + 39/W_Cu)` | 🔴 형태가 다름 — 물리층은 **Fuchs–Sondheimer** `ρ₀(1 + (3/8)(1−p)λ/d)`, ρ₀ = 1.68×10⁻⁸ Ω·m, **λ = 40 nm**(S210) | **정본(FS) 사용** — §1⑥ |
 *  | `τ [ps] = 0.38·R·C·1e-3` (절대 지연) | ⛔ `rcDelay.ts` — 「절대 지연시간(초)을 내지 않는다. ε₀ 에 붙일 S번호가 원장에 없다」 | **비율(τ/τ_기준)로 판정** |
 *  | `MTTF [h] = 1.585·j^(−1.2)·exp(9284/T)` | ⛔ `electromigration.ts` — 「Black 식 MTTF 절대값을 내지 않는다(A6L-03). 계수 A 의 공개 실측값이 없다」 | **가속계수 AF 비율로 판정** |
 *
 * 🔴 **없는 식을 여기서 지어내지 않았다.** 지어냈다면 A15 위반이자 「교육용 합성 계수를 실측값처럼
 *    보이게 하는」 이 제품 최대의 결함(README §3-8)을 labs 층에 숨기는 일이 된다.
 *    대신 **PLN 이 가르치려던 상충 구조를 물리층이 실제로 가진 양으로 다시 세웠다**(§2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔴 1. P6 특별 제약 — 전부 지켰다
 * ════════════════════════════════════════════════════════════════════════════
 *  ① **Cu 표면확산 활성화에너지 정본 = 0.80 eV** — `EM_ACTIVATION_ENERGY.Cu.surface`(S201 Table 2.1).
 *     🔴 이견: P6 참고문헌 SP-61(Lienig)은 **0.90 eV** 를 든다. 둘 다 방어 가능한 범위지만
 *     **원장 S201 을 정본으로 한다**(오케스트레이터 판정 2026-08-20). 378 K 에서 지수항이
 *     `exp(0.10/kT)` 만큼 달라져 MTTF 가 일괄 0.0464배가 된다 — 그래서 절대 합격선이 무너졌고
 *     PLN 이 EM 판정을 **상대 목표**(≥ 2.5 × 기본값)로 옮겼다. 이 파일은 그 상대 목표를 그대로 쓴다.
 *  ② **MTTF 절대값을 화면에 내지 않는다**(A6L-03). 계수 A 는 AF 에서 약분되므로
 *     `emLifetimeRatio`(= MTTF(현재조건)/MTTF(기준조건)) 만 낸다. 비율 학습은 손실 없이 성립한다.
 *  ③ **Mayadas–Shatzkes 입계 산란 항은 물리층에 없다**(M-17). 화면 라벨은 **「표면 산란」**만 쓴다.
 *  ④ **디싱·에로전의 절대 nm 판정 금지**(M-19). 판정에 넣지 않고, 오조작 피드백에서 **경향만** 말한다.
 *  ⑤ **배리어 두께 파라미터를 만들지 않았다**(M-18).
 *  ⑥ 🔴 **λ = 39 nm 사용 금지는 2026-08-20 해제됐다** — 원장 §3-5 정정: S207(Gambino, IEEE CICC 2009) 본문이
 *     *"electron mean free path compared to Cu (15 nm versus 39 nm)"* 로 39 nm 를 담고 있고, S216 의 403 은
 *     페이월이 아니라 봇 차단이었다. **다만 300 K 정본은 여전히 40 nm(S210)** 이므로 이 파일은 물리층이
 *     쓰는 λ = 40 nm 를 그대로 따른다. 조건은 각 출력의 `assumptions` 에 명시했다.
 *  ⑦ ✅ **M-29 해소 (2026-08-21).** 물리층이 배선용 `effectiveResistivityFSLine`(S216 Eq.(8))을 갖췄고
 *     이 파일이 그것으로 갈아탔다. `k·λ = 4×단면적/둘레` 로 k 를 구해 **k > 4 → 0.375 · 0.5 < k ≤ 4 → 0.474**.
 *     🔴 **이 실습의 슬라이더 전 구간(W 20–200 nm · T 117 nm)이 k = 0.854 … 3.691 로 전부 0.474 구간**이다
 *     (k = 0.5 은 W = 10.9 nm, k = 4 는 W = 253 nm 라 어느 쪽도 슬라이더에 없다).
 *     결과: ρ_eff 가 **선폭에 의존**하게 됐고 W 60 nm 에서 1.8954 → 2.0816 µΩ·cm(+9.8 %),
 *     W 20 nm 에서 +37.8 % 올라갔다. **저항 판정이 실제로 이동한다 — §2(a) 참조.**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔴 2. 합격창을 옮겼다 — 사유와 재계산 근거
 * ════════════════════════════════════════════════════════════════════════════
 * (a) **배선 저항 275 Ω → (100 Ω) → 상대비 κ.**
 *     PLN 275 Ω 는 `ρ_eff = 1.70(1+39/W_Cu)` + 배리어 잠식 + 보이드 잠식으로 계산한 값이다.
 *     정본 FS(λ = 40 nm, ρ₀ = 1.68e-8, 두께 117 nm)로 재계산하면 슬라이더 전 구간(W 20–200 nm)에서
 *     W ≥ 30 nm 이면 이미 275 Ω 를 통과한다 → **죽은 판정.** 그래서 한때 `R ≤ 100 Ω` 으로 옮겼다.
 *
 *     🔴🔴 **그 100 Ω 은 원장 근거가 없는 역산값이었고**(→ `RESISTANCE_RATIO_PASS_MAX_*` 상수 주석),
 *     M-29(FS 배선식, S216 Eq.(8)) 수정으로 ρ_eff 가 선폭 의존이 되자 `R ≤ 100 Ω` 을 처음 만족하는
 *     폭이 **W = 86 nm** 로 올라가 집적도 상한 **W ≤ 85** 와 **정확히 1 nm 어긋났다** —
 *     응용(S6) 전수 스윕에서 **4판정 동시 합격 0건**. 실습이 통째로 죽었다.
 *
 *     ✅ **2026-08-21 PLN 확정 — 절대 Ω 를 버리고 상대비 κ 로 전환했다.**
 *       · 응용(S6) `R ≤ 0.75 × R_ref` · 심화(S7) `R ≤ 0.68 × R_ref`
 *       · `R_ref` = 기본 조합(W 60 nm · L 50 µm · 두께 117 nm)의 저항 = **148.2595 Ω**(`R_REFERENCE`)
 *       · 🔴 절대값 안 **100 Ω 과 105 Ω 은 둘 다 반려**됐다. 되돌리지 마라.
 *       · 🔴 **피치 상한 170 nm 는 절대값 그대로 유지**한다(학습자가 절대값으로 알아야 할 설계 규칙).
 *     실측 R(W) [Ω, L = 50 µm] / 비(R/R_ref): 77 → 112.27 / 0.7573 · 78 → 110.69 / 0.7466 ·
 *       80 → 107.65 / 0.7261 · 82 → 104.77 / 0.7067 · 85 → 100.73 / 0.6794 · 86 → 99.45 / 0.6708
 * (b) **RC 지연은 절대 ps 가 아니라 지연비로 판정한다 — 합격 상한은 PLN 확정값 `0.45` 다.**
 *     절대 ps 를 낼 수 없다(ε₀ 무출처). 기준 상태 = 기본 파라미터 조합.
 *     🔴 종전 `0.576` 은 PLN 자신의 두 값 `기본 1.077 ps` / `합격 0.62 ps` 의 비
 *        `0.62/1.077 = 0.5757` 을 반올림한 수였다 — **유래가 자백된 역산값**이지 판정 설계가 아니다.
 *        PLN 이 2026-08-21 에 **난이도 상수 `0.45` 를 직접 선언**했다. 유도식을 코드에서
 *        다시 계산하게 만들지 마라(그 순간 임계가 폐기된 두 수에 다시 묶인다).
 * (c) **EM 은 옮기지 않았다.** PLN 이 이미 상대 목표(**MTTF ≥ 2.5 × 기본값 = 3,673 h**)로 확정해 두었고,
 *     그것이 곧 가속계수 AF 이므로 물리층 `blackAccelerationFactor` 로 **그대로** 구현된다.
 *     🔴 화면에는 **배수만** 낸다(절대 h 금지, A6L-03). 대신 **「10년 기준 달성률」을 상시 표시**한다 —
 *     PLN 이 조건으로 제시한 기본값 MTTF 1,469 h 를 10년(8.76×10⁴ h)에 대어 **기본값 1.68 %** 가 나온다.
 *     「합격했는데도 10년 기준으로는 한참 모자라다」를 같은 화면에서 보게 하는 장치다(PLN 지시).
 * (d) **제거율 합격창은 PLN 이 아니라 원장에서 왔다.** S200 이 인쇄한 실측 제거율 대역
 *     **302.5–350.1 nm/min** 을 그대로 합격창으로 쓴다(A6 충족). PLN 의 `MRR = 70·P_d·…` 는
 *     합성식이라 쓰지 않는다.
 * (e) **잔류 Cu 게이트(`Cu_res == 0`)는 형태를 바꿔 살렸다.**
 *     `Cu_res = max(0, T_ob − MRR·t) > 0` ⟺ `polishTime(T_ob) > t` 이므로, 물리층
 *     `polishTime()` 이 사이클 예산(135 s = 2.25 min)을 넘는지로 **동치 판정**한다. 새 식이 아니다.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔴 3. 합격 조합 — 전수 스윕으로 확인한 실측값 (2026-08-21 M-29 반영 후 재산출)
 * ════════════════════════════════════════════════════════════════════════════
 *  · 기초  기본값(24.76 kPa · 80 rpm) → MRR 258.9 ❌ / **합격 예: 30.00 kPa · 80 rpm → 313.7 ✅**
 *          (또는 24.76 kPa · 100 rpm → 323.6 ✅ — 하중과 속도가 Preston 식에서 대등함을 보여준다)
 *  · 응용  기본값(24.76 kPa · 80 rpm · W 60) → MRR 258.9 ❌ · 저항비 1.000 ❌ (2/4 불합격 — 기본값은
 *          비의 분모 그 자체라 저항비가 정확히 1 이다)
 *          ✅ **해가 있다 — κ 전환 후 전수 스윕 실측(2026-08-21).**
 *          선폭 축 전수(W 20–200 nm, 181점): 저항비 ≤ 0.75 ∧ 피치 ≤ 170 을 동시에 만족하는 폭은
 *          **W = 78 … 85 nm 의 8점**뿐이다(77 nm 는 비 0.7573 로 탈락, 86 nm 는 비 0.6708 로 통과하나
 *          피치 172 nm 로 탈락). CMP 축 전수(하중 3 101 × 회전수 39 = 120 939): 합격 **6 089건**.
 *          두 축이 서로 독립임을 실측 확인 → **4판정 동시 합격 6 089 × 8 = 48 712 조합.**
 *          합격 예: 30.00 kPa · 80 rpm · W 80 nm → MRR 313.7 ✅ · 연마 0.976 min ✅ ·
 *                   저항비 0.726 ✅(R 107.65 Ω) · 피치 160 ✅
 *  · 심화  기본값 → MRR ❌ · 저항비 1.000 ❌ · 지연비 1.000 ❌ · 수명비 1.000 ❌ · Blech 2.123 ❌ (5/7 불합격)
 *          **합격 예(실측 재확인): 30.00 kPa · 80 rpm · W 85 nm · k 3.0 · L 45 µm · 378 K · 0.05 mA**
 *          → MRR 313.7 ✅ · 연마 0.976 min ✅ · 저항비 0.611 ✅(R 90.66 Ω) · 피치 170 ✅
 *            · 지연비 0.351 ✅ · 수명비 2.670 ✅ · Blech 0.843 ✅  (7/7)
 *          🔴 **전수 재측정 (2026-08-21 · RC 임계 0.576 → PLN 확정 0.45 반영).**
 *          CMP 축(하중 3 101 × 회전수 39 = 120 939)은 나머지와 독립이라 따로 센다 — 합격 **6 089건**.
 *          저항비 ≤ 0.68 ∧ 피치 ≤ 170 을 만족하는 (W, L) **289쌍**(변동 없음).
 *          🔴 **RC 판정이 이제 해 영역 안에서 결속한다** — 그 289쌍 × k 19점 = **5 491 조합 중
 *          RC 불합격 60건**(종전 0.576 에서는 1건뿐이었다). 창 안 지연비 최댓값 **0.4483**.
 *          EM(수명비·Blech)은 (W, L)과 결합하므로(j = I/(W·t) · Blech 는 j·L) 배선축과 **함께** 셌다:
 *          289쌍에 대해 Σ(RC 통과 k 수 × EM∧Blech 통과 (T, I) 수) = **1 533 866**.
 *          → **7판정 동시 합격 6 089 × 1 533 866 = 9 339 710 074 조합.**
 *          🔴 종전 기록 **8 233 454 566** 은 여기서 **재현되지 않았다.** 어떤 축 분해로 얻은
 *             수인지 기록이 없어 원인을 단정하지 않는다 — 위 수는 (W, L, k, T, I) 결합을 그대로
 *             훑어 센 실측이며, 재측정 방법은 이 주석 그대로다.
 */

const PROCESS_ID = 'metal';

/* ── PLN 공통 고정 상수 (§P6 「공통 고정 상수」) ─────────────────────────────────
 * 🔴 이 값들은 물리 계수가 아니라 **문항이 제시하는 조건**이다(D-008). 슬라이더가 아니라 고정값이다. */

/** Cu 실효 두께 t_Cu = (트렌치 깊이 120 nm − 배리어 3 nm) = 117 nm. PLN 공통 상수. */
const LINE_THICKNESS_NM = 117;
/** 상하 ILD 두께 h = 120 nm. PLN 공통 상수 — 용량의 수직 성분 X_ox 로 쓴다. */
const ILD_THICKNESS_NM = 120;
/** 오버버든 두께 T_ob — PLN 응용 기본값 계산의 306 nm 를 문항 조건으로 고정. */
const OVERBURDEN_NM = 306;
/** CMP 총 연마 사이클 예산 135 s = 2.25 min (주연마 120 s + 오버폴리시 15 s). PLN 공통 상수. */
const CMP_CYCLE_BUDGET_MIN = 2.25;

/* ── 합격창 (§2 참조. 리터럴을 pass 안에 직접 쓰지 않는다 — check-labs 파서 규약) ── */

/** 제거율 합격 하한 = S200 이 인쇄한 실측 제거율(원장 R165). */
const MRR_PASS_MIN = R165_MRR_NM_PER_MIN.value;
/** 제거율 합격 상한 = S200 실측대의 상단 350.1 nm/min. 이 위는 오버폴리시 영역이다. */
const MRR_PASS_MAX = 350.1;
/** 잔류 Cu 게이트 동치 — 오버버든을 사이클 예산 안에 깎아내야 한다. */
const POLISH_TIME_PASS_MAX = CMP_CYCLE_BUDGET_MIN;
/**
 * 🔴 **배선 저항 판정은 절대 Ω 가 아니라 상대비 κ 로 한다** (PLN 확정 · 2026-08-21).
 *
 * ── 왜 절대값 100 Ω 을 버렸나 (되돌리려는 다음 사람이 먼저 읽을 것) ──────────────
 * 종전 임계 `RESISTANCE_PASS_MAX = 100` 은 **출처가 없는 수**였다. 인계기록
 * `14_labs_인계기록.md:1168` 이 그 유래를 스스로 자인한다 —
 *   「집적도 판정(2W ≤ 170 → W ≤ 85)과 **실제로 충돌하도록** R ≤ 100 Ω(= W ≥ 81 nm)로 이동」
 * 즉 물리에서 나온 값이 아니라 **판정을 만들려고 역산한 값**이다. 원장 S번호가 붙지 않는다.
 *
 * 그 대가는 실측으로 드러났다. M-29(FS 배선식, S216 Eq.(8)) 수정으로 ρ_eff 가 선폭 의존이 되자
 * `R ≤ 100 Ω` 을 처음 만족하는 폭이 **W = 86 nm** 로 올라가 집적도 상한 **W ≤ 85** 와
 * **정확히 1 nm 어긋났고**, 응용(S6) 전수 스윕 21.9 M 조합에서 **4판정 동시 합격 0건** —
 * 실습이 통째로 죽었다. 심화(S7)에서도 저항 판정이 병목이 되어 **RC 판정 초과 0건**,
 * 즉 RC 까지 함께 죽어 있었다.
 *
 * ── 왜 상대비 κ 인가 ────────────────────────────────────────────────────────
 *  ① 상대비는 **물리 보정이 분자·분모에 함께 들어가 약분된다.** M-17(입계 산란) 처럼 ρ_eff 모형이
 *     앞으로 바뀌어도 판정선이 통째로 무너지지 않는다. 절대 Ω 는 M-29 한 번에 무너졌다.
 *  ② 같은 파일에서 이미 RC(`rcDelayRatio`)·EM(`emLifetimeRatio`)은 상대비라 **살아 있고**,
 *     출처 없는 **절대 임계인 저항만 죽었다.** 축을 살아 있는 쪽에 맞춘다.
 *
 * 🔴 **절대 Ω 로 되돌리지 마라.** 「100 이 더 깔끔하다」는 이유로 돌아가면 위의 0건 상태가
 *    그대로 재발한다. κ 값(0.75 · 0.68)은 **PLN 확정치**이고, 합격창 이동은 PLN 소관이라
 *    이 파일에서 임의로 바꾸지 않는다(D-041).
 * 🔴 **피치 임계 170 nm 는 옮기지 않았다** — 학습자가 절대값으로 알아야 할 설계 규칙이다.
 * 🔴 **Ω 값은 화면에서 사라지지 않는다** — `lineResistanceOhm` 을 `role: 'display'` 로 남겼다.
 *    판정은 비로 하되 절대값을 같은 화면에서 함께 보게 하는 것은 EM 의 처리와 같다(§2(c) —
 *    「합격했는데도 10년 기준으로는 한참 모자라다」를 같은 화면에서 보게 한다).
 */
/** 응용(S6) 저항비 합격 상한 κ = 0.75 — `R ≤ 0.75 × R(기본 조합)`. PLN 확정. */
const RESISTANCE_RATIO_PASS_MAX_APPLIED = 0.75;
/** 심화(S7) 저항비 합격 상한 κ = 0.68 — 종전 100 Ω 과 실질 동일(난이도 보존). PLN 확정. */
const RESISTANCE_RATIO_PASS_MAX_ADVANCED = 0.68;
/** 집적도 — 배선 피치 상한 [nm]. PLN 심화 성공 조건 `2W ≤ 170` 그대로. */
const PITCH_PASS_MAX = 170;
/**
 * RC 지연비 합격 상한 — **PLN 확정 난이도 상수(2026-08-21)**. 직접 선언한다.
 * 🔴 `0.62/1.077` 을 코드에서 계산하게 만들지 마라 — 종전 `0.576` 이 그 비를 반올림한 수였고,
 *    PLN 이 「유래가 자백된 역산값」이라며 폐기했다. 창을 옮기는 것은 PLN 소관이다(D-041).
 */
const RC_RATIO_PASS_MAX = 0.45;
/** EM 수명비 합격 하한 — PLN 상대 목표 `MTTF ≥ 2.5 × MTTF(기본 조합)` 그대로. */
const EM_RATIO_PASS_MIN = 2.5;
/** Blech 불멸 여유 합격 상한 — `(j·l)/(j·l)_crit ≤ 1` 이면 EM 으로 끊기지 않는다(S206). */
const BLECH_MARGIN_PASS_MAX = 1;

/* ── 「10년 기준 달성률」 (PLN 지시 — 판정이 아니라 상시 표시) ────────────────────
 * 🔴 절대 MTTF 는 화면에 내지 않는다(A6L-03). 여기서 쓰는 두 숫자는 **PLN 이 문항 조건으로 제시한
 *    값**이다(D-008): 산업 기준 수명 10년 = 8.76×10⁴ h, 기본 파라미터 조합의 모델 MTTF 1,469 h.
 *    달성률 = 수명배수 × (1,469 / 87,600) 이므로 **기본값에서 정확히 1.68 %** 가 된다. */
const TEN_YEAR_HOURS = 87600;
const PLN_DEFAULT_MTTF_H = 1469;

/* ── 기준(reference) 상태 — 비율 판정의 분모. PLN 「기본 파라미터 조합」. ───────── */
const REF_WIDTH_NM = 60;
const REF_LENGTH_UM = 50;
/** 기준 유전율 = SiO₂ 4.0 (S208 Table 2). */
const REF_DIELECTRIC = K_SIO2.value;
/** 기준 사용 온도 378 K(105 ℃) — S206 §V-A 가 Cu 이중다마신에 쓴 온도. */
const REF_TEMP_K = BLECH_CU_TEMP_K.value;
/** 기준 배선 전류 0.080 mA — PLN 공통 상수(교육용 설정값). */
const REF_CURRENT_MA = 0.08;

/** Black 지수 n — S201 이 Cu 에 준 구간 1.1–1.3 의 중앙값. PLN 이 조건으로 제시한 1.2 와 일치한다. */
const BLACK_N_CU = (BLACK_N_CU_MIN.value + BLACK_N_CU_MAX.value) / 2;
/** 🔴 Cu 표면확산 활성화에너지 정본 0.80 eV (S201). 이견 0.90 eV(SP-61)는 채택하지 않는다 — 헤더 §1①. */
const EA_CU_SURFACE_EV = EM_ACTIVATION_ENERGY.Cu.surface.value;

/** nm² → cm² (1 nm² = 10⁻¹⁴ cm²). 십진 접두어의 정의값이지 물리 상수가 아니다. */
const CM2_PER_NM2 = 1e-14;
/* mA → A 는 `../physics/units.ts` 의 `A_PER_MA` 가 정본이다(`check-constants` R1). */
/** Ω·m → µΩ·cm (1 Ω·m = 10⁸ µΩ·cm). */
const UOHMCM_PER_OHMM = 1e8;
/**
 * `j[A/cm²] · l[µm]` → `A/µm`. l[cm] = l[µm]/10⁴ 로 A/cm 를 얻고, A/cm → A/µm 에서 다시 10⁻⁴ —
 * 합쳐서 10⁻⁸ 이다. `electromigration.ts` 의 `isImmortal` 이 쓰는 환산과 같다.
 */
const A_PER_UM_FROM_A_PER_CM2_UM = 1e-8;

/** 슬라이더 범위·기본값의 근거를 화면 배지로 남긴다. 값 자체는 PLN 교육용 설정값이다. */
const PRESSURE_MIN_KPA = PRESSURE_RANGE_PA[0] / PA_PER_KPA;
const PRESSURE_MAX_KPA = PRESSURE_RANGE_PA[1] / PA_PER_KPA;

/* ── 슬라이더 정의역 — 🔴 **차트의 스윕 축과 한 곳에서 묶는다** ────────────────
 * 값은 종전 파라미터 선언에 있던 리터럴 **그대로**다(구간을 옮기지 않았다).
 * 이름을 준 이유는 하나다: 차트가 같은 구간을 다시 숫자로 적으면 슬라이더를 옮겼을 때
 * **그림만 옛 구간에 남는다.** 파라미터와 차트가 같은 상수를 본다.
 * (하중·회전수 축은 물리층 상수 `PRESSURE_RANGE_PA`·`RPM_RANGE` 에서 이미 나오므로 새로 만들지 않았다.) */
/** 배선 폭 W 슬라이더 정의역 [nm] — 응용·심화 `lineWidthNm`. */
const WIDTH_SLIDER_RANGE_NM: [number, number] = [20, 200];
/** ILD 유전율 k 슬라이더 정의역 — 심화 `dielectricConstant`. 상한은 SiO₂ 정본값(S208). */
const DIELECTRIC_SLIDER_RANGE: [number, number] = [2.2, K_SIO2.value];
/** 배선 전류 I 슬라이더 정의역 [mA] — 심화 `lineCurrentMa`. */
const CURRENT_SLIDER_RANGE_MA: [number, number] = [0.03, 1];

/* ── CMP 계산 (물리층 호출만) ──────────────────────────────────────────────── */

interface CmpResult { velocityMps: Quantity; mrr: Quantity; polishMin: Quantity }

/**
 * 하중·회전수 → 상대속도 → Preston 제거율 → 오버버든 연마시간.
 * 🔴 `relativeVelocity` 는 플래튼과 헤드 회전수가 같을 때만 성립하므로 **슬라이더 하나가 둘 다** 돌린다.
 */
function cmp(pressureKPa: number, rpm: number): CmpResult {
  const velocityMps = relativeVelocity({
    platenRpm: rpm, headRpm: rpm, centerDistanceMm: R165_CENTER_DISTANCE_MM.value,
  });
  const mrr = removalRate({
    prestonCoefficient: CU_PRESTON_KP.value,
    pressurePa: pressureKPa * PA_PER_KPA,
    velocityMps: velocityMps.value,
  });
  const polishMin = polishTime({ targetRemovalNm: OVERBURDEN_NM, removalRateNmPerMin: mrr.value });
  return { velocityMps, mrr, polishMin };
}

/** 배선 단면적 [nm²]. 면적의 정의이지 모델이 아니다(배리어 잠식 미반영 — M-18). */
function crossSectionNm2(widthNm: number): number {
  return widthNm * LINE_THICKNESS_NM;
}

/** 전류밀도 `j = I/A` [A/cm²]. 정의식이다. */
function currentDensity(currentMa: number, widthNm: number): number {
  return (currentMa * A_PER_MA) / (crossSectionNm2(widthNm) * CM2_PER_NM2);
}

/** 무차원 RC 지연에 ρ_eff 를 곱한 상대 지연. ε₀ 는 여기서도 빠져 있다(rcDelay.ts 규율). */
function rcDelayFigure(widthNm: number, lengthUm: number, k: number): number {
  // 🔴 M-29: ρ_eff 가 선폭에 의존하므로 지연비에서 더 이상 약분되지 않는다. 폭을 넘긴다.
  const rho = effectiveResistivityFSLine({ widthNm, thicknessNm: LINE_THICKNESS_NM }).value;
  const norm = normalizedRcDelay({
    dielectricConstant: k,
    lengthM: lengthUm / 1e6,
    widthM: widthNm / 1e9,
    heightM: LINE_THICKNESS_NM / 1e9,
    // 수직 성분은 상하 ILD 두께, 측면 성분은 스페이스 S = W (PLN 공통 상수: 피치 = 2W).
    oxideThicknessM: ILD_THICKNESS_NM / 1e9,
    spacingM: widthNm / 1e9,
  }).value;
  return rho * norm;
}

const RC_REFERENCE = rcDelayFigure(REF_WIDTH_NM, REF_LENGTH_UM, REF_DIELECTRIC);
/**
 * 🔴 저항비 판정의 분모 — 기본 조합(W 60 nm · L 50 µm · T 117 nm)의 배선 저항 [Ω].
 * `RC_REFERENCE`·`EM_REFERENCE_J` 와 **같은 방식**이다: 같은 기준 상태를 같은 물리층 함수에 넣는다.
 * 물리층 상수(ρ₀ · λ · FS 계수)는 분자·분모에 함께 들어가 비에서 약분된다.
 */
const R_REFERENCE = copperLineResistance({
  lengthUm: REF_LENGTH_UM, widthNm: REF_WIDTH_NM, thicknessNm: LINE_THICKNESS_NM,
}).value;
const EM_REFERENCE_J = currentDensity(REF_CURRENT_MA, REF_WIDTH_NM);
const BLECH_CRIT_A_PER_UM = copperBlechCriticalProduct().value;

/**
 * 배선 저항비 `R / R(기본 조합)`. 새 식이 아니다 — 물리층이 낸 두 저항의 나눗셈이다.
 * 🔴 정의역 하한 0 은 **열어 두면 안 된다**. `pass: { max: κ }` 는 편측 창이라 아래가 열려 있고,
 *    저항비는 물리적으로 > 0 이므로 `validRange[0] = 0` 이 그 열린 쪽을 닫는다
 *    (check-passwindow W1 규약. `rcDelayRatio` 와 같은 처리다).
 */
function resistanceRatioQuantity(resistanceOhm: number): Quantity {
  return quantity(resistanceOhm / R_REFERENCE, {
    modelId: 'metal.lab.resistanceRatio', unit: '', sourceId: 'S205',
    validRange: [0, 1000],
    assumptions: [
      '🔴 절대 Ω 판정을 대체한 상대비다 — 종전 100 Ω 은 원장 근거가 없는 역산값이었다(상수 주석 참조)',
      '기준 = 기본 파라미터 조합 (W 60 nm · L 50 µm · 두께 117 nm)',
      'ρ₀ · λ · FS 계수는 분자·분모에 함께 들어가 약분된다 — 물리 모형이 바뀌어도 판정선이 무너지지 않는다',
      '🔴 절대 저항 R [Ω] 은 같은 화면에 표시 전용으로 함께 낸다 — 비만 보고 크기 감각을 잃지 않도록',
    ],
  });
}

/* ── 씬 ────────────────────────────────────────────────────────────────────
 * 🔴 DSN `12_시각화씬_공백보고.md` §4-3 이 확인한 4키 중 **3키만** 매핑한다.
 *    `slurry` 는 물리층에 슬러리 입력이 없다 — 억지로 상수를 넣지 않는다.
 * 🔴 Cu 상향식 충전(superfill) 씬은 존재하지 않는다. `polishProfile` 로 대용하지 않았다. */
/**
 * 🔴 씬의 시간축 — **표준 사이클 예산(135 s = 2.25 min)을 전부 소진한 상태**로 고정한다.
 *    화면 배치값이며 물리 상수가 아니다(S번호가 붙지 않는다).
 *
 * **`polishTimeMin` 을 쓰지 않는 이유.** 이 랩의 공정은 「엔드포인트까지 연마」라 **제거량이 고정
 * (오버버든 306 nm)이고 시간이 변수**다. 그래서 `polishTimeMin = 306 / MRR` 은 `MRR ∝ P·V` 의
 * **역수**이고, 씬의 `removal = pressure × speed × time` 에 넣으면 **P·V 가 정확히 상쇄된다.**
 * 2026-08-21 실측: 하중 24.76 kPa 고정으로 회전수를 80 → 100 → 160 → 200 rpm 으로 흔들어도
 * removal 이 **0.048998 로 한 자리도 변하지 않았고**, 전 구간 최댓값도 0.0549 에 그쳐 화면 하강이
 * 2 px 이하 — 슬러리 스페클(±6 px) 아래로 묻혔다. 피드백 **MT-B3 이 「Preston 식에서 하중과
 * 상대속도는 대등하다」고 가르치는데 그림에서는 회전수 항이 사라져 글과 그림이 반대**였다(D-008).
 *
 * 그래서 **씬이 보여줄 양을 다시 정의했다 — 「표준 사이클 예산 동안 제거되는 양」.**
 * 시간을 고정하면 `removal ∝ P·V` 가 되어 하중과 회전수가 대등하게 화면에 산다(하중 2배 ≡ 회전수 2배).
 * 과하게 올리면 표면이 트렌치 바닥까지 내려가 오버폴리시 → 디싱·에로전이 커지는 것이 그대로 보인다 —
 * 그것이 CMP 의 교육 요점이다. 판정·수치에는 종전대로 `polishTimeMin`(잔류 Cu 게이트)을 그대로 쓴다.
 */
const POLISH_SCENE_CYCLE_FRACTION = 1;

const POLISH_SCENE_NOTE =
  'pressure = 하중/66 kPa(S204 Table 2.6 상한) · speed = 상대속도/3.91 m/s(동) · '
  + 'time = 표준 사이클 예산 135 s 전량으로 고정(화면 배치값). '
  + '씬의 제거량은 「사이클 예산 동안 깎이는 양」이라 하중과 회전수가 Preston 식대로 대등하게 반영된다 — '
  + '연마 소요시간을 시간축에 쓰면 MRR 의 역수라 P·V 가 상쇄돼 화면에서 사라진다(2026-08-21 정정). '
  + 'slurry 는 물리층에 입력이 없어 매핑하지 않는다. 씬의 디싱·에로전 형상은 정성 표현이며 절대 nm 가 아니다(M-19).';

/**
 * 🔴 **A12 화면도달 조사 결과 (2026-08-22) — `removalRateNmPerMin` 은 이 씬에 이름으로 실을 수 없다.**
 *    다음 사람이 같은 길을 다시 파지 않도록 결론과 사유를 남긴다. **매핑은 바꾸지 않았다.**
 *
 * 게이트(`scripts/check-direction.mjs` V1)는 「규칙의 출력 Y 가 `scene.map` 본문에서 `out['Y']`
 * 로 읽히는가」를 본다. 이 공정의 8규칙 중 화면 도달을 노려 볼 수 있는 것은 CMP 두 건뿐이고
 * (MC-D5 `removalRateNmPerMin`+`polishTimeMin` · MC-D6 `removalRateNmPerMin`),
 * 나머지 6건(저항·ρ_eff·RC·EM·Blech·도금)은 **대응 씬 자체가 없다** — `polishProfile` 은 CMP 단면이다.
 * 없는 씬을 `polishProfile` 로 대용하지 않는다(파일 머리 「Cu 상향식 충전 씬은 존재하지 않는다」와 같은 규율).
 *
 * 그 CMP 두 건도 이을 자리가 없다:
 *  ① 씬이 읽는 4키의 쓰임은 고정돼 있다 — `pressure` 는 제거량 **과 패드 간극**(`padGap`),
 *     `speed` 는 제거량 **과 패드 무늬 이송속도**, `time` 은 제거량뿐, `slurry` 는 입자·스크래치다.
 *     `pressure`·`speed` 는 각자 다른 화면 역할을 이미 지고 있어 다른 양으로 바꿔 끼울 수 없다.
 *  ② 씬의 제거량은 `pressure × speed × time` 이고 Preston 은 `MRR = K_p·P·V` 다.
 *     즉 **`P/P_max × V/V_max` 가 이미 `MRR/MRR_max` 그 자체**다 — 화면은 이미 MRR 을 그리고 있고,
 *     여기에 `out['removalRateNmPerMin']` 을 끼우려면 K_p·P 를 약분시키는 분모를 지어내
 *     **같은 양을 두 낱말로 부르는** 식을 새로 써야 한다. 그것은 게이트 숫자를 올릴 뿐 화면은 그대로다.
 *  ③ 🔴 남은 자리 `time` 에 `polishTimeMin` 을 꽂는 것은 **금지된 되돌림**이다 —
 *     `polishTimeMin = 306/MRR` 이라 `removal` 에서 P·V 가 정확히 상쇄돼 화면이 얼어붙는다(D-008).
 *     `tests/unit/metal-polish-scene.test.ts` 가 그 회귀를 막는다. 위 상수 주석 참조.
 *
 * → **못 이었다. 이으려면 저항·RC·EM 을 그리는 씬이 새로 필요하다(`src/viz` 소관).**
 */
/**
 * 🔴 하중은 **비율 정규화(P / P_max)** 다. min-max 정규화 `(P−4)/(66−4)` 를 쓰면 하한 4 kPa 에서
 *    removal 이 0 이 되는데, 4 kPa 에서도 연마는 된다 — 화면이 물리를 거짓말하게 된다.
 *    속도도 같은 이유로 `V / V_max` 다(종전 유지).
 */
const polishSceneMap: LabSceneBinding['map'] = (i, out) => ({
  pressure: clamp01((i['pressureKPa'] ?? 0) / PRESSURE_MAX_KPA),
  speed: clamp01((out['velocityMps'] ?? 0) / VELOCITY_RANGE_MPS[1]),
  time: POLISH_SCENE_CYCLE_FRACTION,
});

/* ── 심화(S7) 한계선 ────────────────────────────────────────────────────────
 * 🔴 **왜 함수로 뺐나.** 조건 자체·문구·한계값은 종전 `compute()` 안에 있던 것 **그대로**다.
 *    옮긴 이유는 **심화 RC 차트가 같은 축을 훑기 때문**이다 — 차트는 유전율 k 를
 *    2.2 → 4.0 으로 훑는데, 하중이 24.76 kPa 를 넘어 있으면 k < 2.6 구간은 **계산이 정지하는
 *    구간**이다. 차트가 그 구간을 그리면 화면이 「거기서도 계산된다」고 거짓말한다.
 *    조건을 두 벌 적으면 언젠가 갈라지므로 `compute()` 와 차트가 **같은 함수 하나**를 부른다.
 * 🔴 **결합 조건이다 — 두 값을 다 싣는다.** 종전에는 `pressureKPa` 하나만 실었고
 *    이름 칸에 사유를 괄호로 덧붙여(`'pressureKPa (다공성 low-k 박리 한계)'`) 화면에
 *    변수명이 그대로 노출됐다. 그래서 학습자는 **압력만 되돌렸다** — 정지를 만든 나머지
 *    절반(k < 2.6)이 화면에 닿지 않았기 때문이다. 이제 걸린 값을 둘 다 싣고
 *    사유는 `reasonKo`/`reasonEn` 으로 분리한다. (`tests/unit/lab-stop-and-fixed.test.ts` 가 고정한다.)
 */
function assertPorousLowKLoadAllowed(k: number, pressureKPa: number): void {
  // S208 Table 2 가 k < 2.6 을 다공성으로 분류하고, S200 이 실제로 돌린 하중은 24.76 kPa 다.
  // 없는 데이터를 외삽하는 대신 계산을 멈춘다(PLN 「low-k 박리 — 캐리어 헤드 비상 정지」).
  if (k < K_SICOH_MIN.value && pressureKPa > R165_PRESSURE_KPA.value) {
    throw new OutOfLimitError(
      'dielectricConstant', k,
      // k 는 「2.6 이상이어야 한다」가 조건이다. 상한은 슬라이더 정의역(SiO₂ 4.0).
      [K_SICOH_MIN.value, K_SIO2.value], '',
      [{
        parameter: 'pressureKPa',
        given: pressureKPa,
        limit: [PRESSURE_MIN_KPA, R165_PRESSURE_KPA.value],
        unit: 'kPa',
      }],
      '다공성 low-k(k < 2.6) 위에서 S200 문헌 조건 24.76 kPa 를 넘는 CMP 하중을 걸 근거가 원장에 없습니다 — 막이 박리됩니다. 🔴 두 값이 **함께** 걸렸습니다. k 를 2.6 이상으로 올리거나 하중을 24.76 kPa 이하로 내리면 계산이 다시 시작됩니다.',
      'There is no ledger basis for a CMP load above the S200 literature condition of 24.76 kPa on a porous low-k film (k < 2.6) — the film delaminates. Both values are implicated: raise k to 2.6 or above, or lower the load to 24.76 kPa or below, and the calculation resumes.',
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 🔴 차트 — 「판정은 이 차트에서 한다」 (PLN 명세 427 · `spec.ts` 차트 절)
 * ══════════════════════════════════════════════════════════════════════════
 * 이 파일의 판정은 **전부 비율**(저항비 κ · RC 지연비 · EM 수명비)이라, 숫자 한 칸만 보면
 * 「지금 값이 창 밖이다」는 알아도 **어느 쪽으로 얼마나 움직여야 들어오는지**를 알 수 없다.
 * §3 의 전수 스윕이 말해 주듯 해 영역은 **선폭 8점(78–85 nm)** 처럼 극도로 좁다 —
 * 슬라이더를 눈감고 흔들어 찾을 폭이 아니다. 차트가 그 축을 통째로 보여준다.
 *
 * 🔴 **규율 — 여기서 물리식을 새로 쓰지 않았다.** 각 차트의 `build()` 는 같은 칸의 `compute()`
 *    가 부르는 **바로 그 함수**를 축 위에서 다시 부른다(`cmp` · `copperLineResistance` +
 *    `resistanceRatioQuantity` · `blackAccelerationFactor` · `rcDelayFigure`). 보간·근사·
 *    「차트용 간이식」은 한 줄도 없다. 규격선도 숫자를 다시 적지 않고 판정 상수를 그대로 쓴다.
 *
 * 🔴 **세로축을 고정하지 않는다(`yDomain` 미지정).** 오케스트레이터 판정이 아니라 이 파일의
 *    사정이다 — 세로축을 고정하면 **동작점이 화면 밖으로 나가는 조합이 실제로 생긴다**
 *    (회전수 200 rpm · 하중 66 kPa 에서 MRR 은 기본 회전수 상한의 2.5배다). 판정 차트가
 *    「내 현재 값」을 잃으면 배지가 화면이 뒷받침하지 못하는 주장이 된다(check-wiring W6-7 의 취지).
 *    가로축은 **슬라이더 정의역으로 고정**한다 — 축이 매 프레임 흔들리면 비교가 안 된다.
 */

/** 스윕 표본 수. 40~60 사이의 값이면 곡률이 뭉개지지 않으면서 프레임당 비용이 붙지 않는다.
 *  🔴 이름에 공정을 박은 이유: `deposition.ts` 가 같은 뜻으로 `CHART_SAMPLES = 50` 을 쓰고 있어
 *     이름이 같으면 `check-constants` R2(정본 갈림)에 걸린다. 표본 수는 칸마다 다를 수 있는
 *     **화면 배치값**이라 통일 대상이 아니다 — 그래서 값을 맞추는 대신 이름을 갈랐다. */
const METAL_CHART_SAMPLES = 48;

/**
 * 가로축을 등간격으로 훑으며 **물리층에서 y 를 다시 구한다.**
 * 🔴 던지는 점은 **그리지 않는다** — 한계선(다공성 low-k)·물리층 정의역 밖은 계산이 없는 곳이고,
 *    거기에 선을 이어 놓으면 화면이 「계산된다」고 말하게 된다. 계열은 그 자리에서 끊긴다.
 * 🔴 유한하지 않은 값도 버린다(NaN·Infinity 를 계열에 넣지 않는다).
 */
function sweepAxis(range: [number, number], f: (x: number) => number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= METAL_CHART_SAMPLES; i++) {
    const x = range[0] + ((range[1] - range[0]) * i) / METAL_CHART_SAMPLES;
    let y: number;
    try {
      y = f(x);
    } catch {
      continue;
    }
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}

/**
 * **현재 동작점** — 가로축 현재값에서 판정값까지 세운 세로 파선.
 * oxidation `operating` · photo · wafer 와 같은 관례다. 🔴 세로 위치는 `compute()` 가 이미 낸
 * 판정값 그대로이며, 여기서 다시 계산하지 않는다(값이 두 벌로 갈라질 자리를 만들지 않는다).
 */
function operatingSeries(x: number, y: number, ko: string, en: string): LabChartSeries[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
  return [{ id: 'operating', ko, en, points: [{ x, y: 0 }, { x, y }], dashed: true }];
}

/** 출력값을 쓰되, 없으면(예: 한계선에 걸려 `compute()` 가 던진 경우) 동작점을 그리지 않는다. */
function outputValue(outputs: Readonly<Record<string, number>>, id: string): number {
  const v = outputs[id];
  return Number.isFinite(v) ? (v as number) : Number.NaN;
}

/**
 * 🔴 **제거율–하중 곡선** (기초 S5 · 응용 S6). 판정 = `removalRateNmPerMin`.
 *
 * 왜 하중 축인가: 기본값(24.76 kPa · 80 rpm)이 **불합격**(258.9 nm/min)으로 시작하는 칸이다(§3).
 * 학습자가 가장 먼저 손대는 축이 하중이고, 합격 대역 302.5–350.1 nm/min 은 **폭 47.6** 짜리
 * 좁은 띠라 숫자만 보고는 「얼마나 더」를 모른다. 곡선 위에서 두 파선 사이를 지나는 하중 구간이
 * 그대로 답이 된다. 회전수를 바꾸면 **곡선 자체가 기울어져** Preston 식에서 하중과 속도가
 * 대등하다는 것(MT-B3)이 글이 아니라 그림으로 나온다.
 */
function mrrLoadChart(): LabChartBinding {
  return {
    id: 'metal.mrrLoad',
    kind: 'line',
    ko: '제거율–하중 곡선 (Preston)',
    en: 'Removal rate vs. down force (Preston)',
    judgesOutputs: ['removalRateNmPerMin'],
    xKo: 'CMP 하중압력 P', xEn: 'CMP down force', xUnit: 'kPa',
    yKo: '제거율 MRR', yEn: 'Removal rate', yUnit: 'nm/min',
    xDomain: [PRESSURE_MIN_KPA, PRESSURE_MAX_KPA],
    refLines: [
      { value: MRR_PASS_MAX, ko: `실측 대역 상단 ${MRR_PASS_MAX} nm/min`, en: `Measured band upper ${MRR_PASS_MAX} nm/min`, tone: 'spec' },
      { value: MRR_PASS_MIN, ko: `실측 대역 하단 ${MRR_PASS_MIN} nm/min (S200)`, en: `Measured band lower ${MRR_PASS_MIN} nm/min (S200)`, tone: 'spec' },
    ],
    captionKo: '두 파선 사이가 합격 대역입니다 — 세로 파선이 지금 하중입니다.',
    captionEn: 'The pass band lies between the two dashed lines; the vertical dashed line marks your current load.',
    note: '가로축(하중 4–66 kPa, S204 Table 2.6)을 **지금 회전수 그대로** 물리층 Preston 식으로 다시 계산한 곡선입니다 — '
      + '차트 전용 간이식이 아니라 판정에 쓰는 `removalRate()` 를 그대로 부릅니다. '
      + '회전수를 올리면 곡선이 가팔라져 같은 대역을 더 낮은 하중에서 지납니다(하중과 속도는 Preston 식에서 대등합니다). '
      + '🔴 세로축을 고정하지 않은 이유: 고속·고하중 조합에서 제거율이 기본 회전수 상한의 두 배를 넘어 '
      + '축을 고정하면 **현재 동작점이 화면 밖으로 나갑니다.**',
    build: (inputs, outputs) => {
      const rpm = inputs['platenRpm'] ?? R165_PLATEN_RPM.value;
      const pressureKPa = inputs['pressureKPa'] ?? R165_PRESSURE_KPA.value;
      // 🔴 물리층 호출 — 같은 칸 compute() 가 부르는 `cmp()`(relativeVelocity → removalRate) 그대로.
      const curve = sweepAxis([PRESSURE_MIN_KPA, PRESSURE_MAX_KPA], (p) => cmp(p, rpm).mrr.value);
      return [
        { id: 'preston', ko: `${rpm} rpm 에서의 제거율`, en: `Removal rate at ${rpm} rpm`, points: curve },
        ...operatingSeries(
          pressureKPa, outputValue(outputs, 'removalRateNmPerMin'),
          '현재 하중·제거율', 'Current load and removal rate',
        ),
      ];
    },
  };
}

/**
 * 🔴 **저항비–선폭 곡선** (응용 S6 · 심화 S7). 판정 = `resistanceRatio`.
 *
 * 왜 선폭 축인가: 이 실습 최대의 상충이 **하나의 축 위에서** 벌어지기 때문이다 —
 * 폭을 넓히면 저항비가 내려가지만(합격 방향) 피치 2W 가 상한 170 nm 를 넘는다(불합격 방향).
 * 그래서 저항 곡선과 **집적도 상한 세로선**(W = 85 nm)을 한 그림에 세운다:
 * 합격은 「세로선 왼쪽 ∧ 가로 파선 아래」인 구간뿐이고, §3 이 전수로 센 **W 78–85 nm 8점**이
 * 바로 그 구간이다. 두 판정이 반대로 당긴다는 것을 문장이 아니라 교차점으로 읽는다.
 *
 * @param passRatioMax 그 단계의 합격 상한 κ. 판정에 쓰는 상수를 그대로 받는다(숫자를 다시 적지 않는다).
 */
function resistanceWidthChart(passRatioMax: number): LabChartBinding {
  return {
    id: 'metal.resistanceWidth',
    kind: 'line',
    ko: '배선 저항비–선폭 곡선',
    en: 'Line resistance ratio vs. line width',
    judgesOutputs: ['resistanceRatio'],
    xKo: '배선 폭 W', xEn: 'Line width', xUnit: 'nm',
    yKo: '저항비 R / R(기본 조합)', yEn: 'Resistance ratio vs. default',
    xDomain: WIDTH_SLIDER_RANGE_NM,
    refLines: [
      { value: passRatioMax, ko: `저항비 합격 상한 κ = ${passRatioMax}`, en: `Resistance-ratio pass limit κ = ${passRatioMax}`, tone: 'spec' },
    ],
    captionKo: `합격은 「세로선 왼쪽(피치 ≤ ${PITCH_PASS_MAX} nm) ∧ 가로 파선 아래(κ ≤ ${passRatioMax})」인 구간뿐입니다.`,
    captionEn: `You pass only left of the vertical line (pitch ≤ ${PITCH_PASS_MAX} nm) and below the dashed line (κ ≤ ${passRatioMax}).`,
    note: '가로축(선폭 20–200 nm) 전 구간을 **지금 배선 길이 그대로** 물리층 `copperLineResistance()`(FS 배선식 S216 Eq.(8) → R = ρ_eff·L/(W·T)) '
      + '로 다시 계산하고, 판정에 쓰는 같은 함수로 기준 조합 저항으로 나눈 값입니다. '
      + '곡선이 1/W 보다 가파른 것은 폭을 좁히면 단면적이 줄 뿐 아니라 표면 산란으로 ρ_eff 자체가 오르기 때문입니다(M-29). '
      + `세로 파선은 집적도 상한 — 피치 = 2W 이므로 ${PITCH_PASS_MAX} nm 는 곧 W = ${PITCH_PASS_MAX / 2} nm 입니다.`,
    build: (inputs, outputs) => {
      const lengthUm = inputs['lineLengthUm'] ?? REF_LENGTH_UM;
      const widthNm = inputs['lineWidthNm'] ?? REF_WIDTH_NM;
      // 🔴 물리층 호출 + 같은 칸이 쓰는 비율 함수 그대로. 새 식이 아니다.
      const curve = sweepAxis(WIDTH_SLIDER_RANGE_NM, (w) => resistanceRatioQuantity(
        copperLineResistance({ lengthUm, widthNm: w, thicknessNm: LINE_THICKNESS_NM }).value,
      ).value);
      const series: LabChartSeries[] = [
        { id: 'ratio', ko: `길이 ${lengthUm} µm 에서의 저항비`, en: `Resistance ratio at L = ${lengthUm} µm`, points: curve },
      ];
      if (curve.length > 0) {
        // 🔴 집적도 상한은 **세로선**이다(가로 규격선이 아니다) — 피치는 세로축 양이 아니라 W 의 함수라
        //    `refLines`(수평선)로는 그릴 수 없다. 세로 범위는 곡선이 실제로 지나간 구간 그대로다.
        const ys = curve.map((p) => p.y);
        series.push({
          id: 'pitchLimit',
          ko: `집적도 상한 W = ${PITCH_PASS_MAX / 2} nm (피치 ${PITCH_PASS_MAX} nm)`,
          en: `Density limit W = ${PITCH_PASS_MAX / 2} nm (pitch ${PITCH_PASS_MAX} nm)`,
          points: [
            { x: PITCH_PASS_MAX / 2, y: Math.min(...ys) },
            { x: PITCH_PASS_MAX / 2, y: Math.max(...ys) },
          ],
          dashed: true,
        });
      }
      series.push(...operatingSeries(
        widthNm, outputValue(outputs, 'resistanceRatio'),
        '현재 선폭·저항비', 'Current width and resistance ratio',
      ));
      return series;
    },
  };
}

/**
 * 🔴 **EM 수명비–배선 전류 곡선** (심화 S7). 판정 = `emLifetimeRatio`.
 *
 * 왜 전류 축인가: Black 식에서 수명은 전류밀도의 **−n 승**(n = 1.2)이라 전류를 조금만 내려도
 * 수명배수가 급격히 올라간다 — 그런데 화면 숫자 한 칸으로는 그 급함이 보이지 않는다.
 * 세로축이 배수(무차원)라 **절대 MTTF 를 내지 않는다는 규율(A6L-03)을 지키면서** 판정선
 * 2.5배를 그릴 수 있는 유일한 축이기도 하다. 선폭·온도를 바꾸면 곡선이 통째로 오르내려
 * 「온도가 전류밀도보다 가파른 인자」(MT-X7)가 두 곡선의 간격으로 나타난다.
 */
function emCurrentChart(): LabChartBinding {
  return {
    id: 'metal.emCurrent',
    kind: 'line',
    ko: 'EM 수명비–배선 전류 곡선 (Black)',
    en: 'EM lifetime ratio vs. line current (Black)',
    judgesOutputs: ['emLifetimeRatio'],
    xKo: '배선 전류 I', xEn: 'Line current', xUnit: 'mA',
    yKo: 'EM 수명비 MTTF / MTTF(기본 조합)', yEn: 'EM lifetime ratio vs. default',
    xDomain: CURRENT_SLIDER_RANGE_MA,
    refLines: [
      { value: EM_RATIO_PASS_MIN, ko: `EM 수명비 합격 하한 ${EM_RATIO_PASS_MIN} 배`, en: `EM lifetime pass floor ${EM_RATIO_PASS_MIN}×`, tone: 'spec' },
    ],
    captionKo: '가로 파선 위가 합격입니다 — 세로 파선이 지금 전류입니다.',
    captionEn: 'You pass above the dashed line; the vertical dashed line marks your current.',
    note: '가로축(전류 0.03–1.0 mA) 전 구간을 **지금 선폭·온도 그대로** 물리층 `blackAccelerationFactor()` 로 다시 계산한 곡선입니다 '
      + '(전류밀도는 j = I/(W·117 nm), 기준은 기본 조합의 j). '
      + '🔴 세로축은 **배수**입니다 — Black 식의 계수 A 는 공개 실측값이 없어 절대 MTTF 를 내지 않으며(A6L-03), A 는 비에서 약분됩니다. '
      + '선폭을 좁히면 같은 전류에서도 j 가 올라 곡선 전체가 내려가고, 동작 온도를 올리면 곡선이 통째로 주저앉습니다.',
    build: (inputs, outputs) => {
      const widthNm = inputs['lineWidthNm'] ?? REF_WIDTH_NM;
      const tempK = inputs['operatingTempK'] ?? REF_TEMP_K;
      const currentMa = inputs['lineCurrentMa'] ?? REF_CURRENT_MA;
      // 🔴 물리층 호출 — 같은 칸 compute() 의 인자 구성 그대로. 전류만 축을 따라 바꾼다.
      const curve = sweepAxis(CURRENT_SLIDER_RANGE_MA, (i) => blackAccelerationFactor({
        currentDensity1: EM_REFERENCE_J,
        currentDensity2: currentDensity(i, widthNm),
        temperature1K: REF_TEMP_K,
        temperature2K: tempK,
        exponentN: BLACK_N_CU,
        activationEnergyEv: EA_CU_SURFACE_EV,
      }).value);
      return [
        {
          id: 'lifetime',
          ko: `선폭 ${widthNm} nm · ${tempK} K 에서의 수명배수`,
          en: `Lifetime ratio at W = ${widthNm} nm, ${tempK} K`,
          points: curve,
        },
        ...operatingSeries(
          currentMa, outputValue(outputs, 'emLifetimeRatio'),
          '현재 전류·수명비', 'Current and lifetime ratio',
        ),
      ];
    },
  };
}

/**
 * 🔴 **RC 지연비–유전율 곡선** (심화 S7). 판정 = `rcDelayRatio`.
 *
 * 왜 유전율 축인가: RC 판정은 §3 재측정에서 **해 영역 안에서 결속하는**(창 안 지연비 최댓값
 * 0.4483, 임계 0.45) 판정이라 여유가 거의 없다. 그리고 k 를 내리는 것이 유일한 직접 수단인데
 * **k < 2.6 에서는 하중 조건에 따라 계산이 정지한다** — 그 정지가 이 차트에서 **선이 끊기는
 * 모습**으로 나타난다(하중이 24.76 kPa 를 넘어 있으면 곡선이 k = 2.6 에서 시작한다).
 * 「낮은 k 로 도망가려다 CMP 가 막힌다」는 이 칸 최대의 상충(MT-X4)이 그림 한 장이 된다.
 */
function rcDielectricChart(): LabChartBinding {
  return {
    id: 'metal.rcDielectric',
    kind: 'line',
    ko: 'RC 지연비–유전율 곡선',
    en: 'RC delay ratio vs. dielectric constant',
    judgesOutputs: ['rcDelayRatio'],
    xKo: 'ILD 유전율 k', xEn: 'ILD dielectric constant',
    yKo: 'RC 지연비 τ / τ(기본 조합)', yEn: 'RC delay ratio vs. default',
    xDomain: DIELECTRIC_SLIDER_RANGE,
    refLines: [
      { value: RC_RATIO_PASS_MAX, ko: `RC 지연비 합격 상한 ${RC_RATIO_PASS_MAX}`, en: `RC delay ratio pass limit ${RC_RATIO_PASS_MAX}`, tone: 'spec' },
    ],
    captionKo: '가로 파선 아래가 합격입니다. 🔴 하중이 24.76 kPa 를 넘으면 곡선이 k = 2.6 에서 끊깁니다 — 그 왼쪽은 계산이 정지하는 구간입니다.',
    captionEn: 'You pass below the dashed line. Above a 24.76 kPa load the curve stops at k = 2.6 — left of it the run halts.',
    note: '가로축(유전율 2.2–4.0, S208 Table 2)을 **지금 선폭·길이 그대로** 물리층 `normalizedRcDelay()` × `effectiveResistivityFSLine()` 로 '
      + '다시 계산해 기준 조합으로 나눈 값입니다 — 판정에 쓰는 `rcDelayFigure()` 를 그대로 부릅니다. '
      + '🔴 절대 지연(ps)이 아닙니다: ε₀ 에 붙일 원장 S번호가 없어 비율로만 냅니다. '
      + '🔴 **끊긴 구간은 빈 곳이 아니라 정지 구간입니다** — 다공성 low-k(k < 2.6) 위에 문헌 조건(24.76 kPa)을 넘는 하중을 걸 근거가 원장에 없어 '
      + '`compute()` 가 같은 조건에서 계산을 멈춥니다. 차트는 없는 값을 이어 그리지 않습니다.',
    build: (inputs, outputs) => {
      const widthNm = inputs['lineWidthNm'] ?? REF_WIDTH_NM;
      const lengthUm = inputs['lineLengthUm'] ?? REF_LENGTH_UM;
      const pressureKPa = inputs['pressureKPa'] ?? R165_PRESSURE_KPA.value;
      const k = inputs['dielectricConstant'] ?? REF_DIELECTRIC;
      const curve = sweepAxis(DIELECTRIC_SLIDER_RANGE, (kx) => {
        // 🔴 `compute()` 와 **같은 한계선 함수**다. 던지면 sweepAxis 가 그 점을 버린다 → 선이 끊긴다.
        assertPorousLowKLoadAllowed(kx, pressureKPa);
        // 🔴 물리층 호출 — 판정과 같은 `rcDelayFigure()` / 같은 기준 `RC_REFERENCE`.
        return rcDelayFigure(widthNm, lengthUm, kx) / RC_REFERENCE;
      });
      return [
        {
          id: 'delay',
          ko: `선폭 ${widthNm} nm · 길이 ${lengthUm} µm 에서의 지연비`,
          en: `Delay ratio at W = ${widthNm} nm, L = ${lengthUm} µm`,
          points: curve,
        },
        ...operatingSeries(
          k, outputValue(outputs, 'rcDelayRatio'),
          '현재 유전율·지연비', 'Current k and delay ratio',
        ),
      ];
    },
  };
}

export const METAL_LABS: LabSpec[] = [
  /* ══════════════════════════════════════════════════════════════════════
   * 기초 (S5) — LO-P6-03
   * ══════════════════════════════════════════════════════════════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P6-03',
    titleKo: '하중과 회전수로 CMP 제거율을 맞춘다',
    titleEn: 'Hit the CMP removal rate with load and platen speed',
    params: [
      {
        id: 'pressureKPa', ko: 'CMP 하중압력', en: 'CMP down force', unit: 'kPa',
        min: 4, max: 66, step: 0.02, initial: R165_PRESSURE_KPA.value, sourceId: 'S204',
        note: '유효범위 4–66 kPa 는 S204 Table 2.6. 기본값 24.76 kPa 는 S200 Table 2 의 문헌 조건이다(본문 27.46 kPa 는 원장이 오타로 판정).',
      },
      {
        id: 'platenRpm', ko: '정반·헤드 회전수', en: 'Platen / head speed', unit: 'rpm',
        min: 10, max: 200, step: 5, initial: R165_PLATEN_RPM.value, sourceId: 'S202',
        note: '슬라이더 하나가 플래튼과 헤드를 함께 돌린다 — 두 회전수가 같아야 V = ω·d 가 성립한다(S200). 헤드-패드 중심거리 130 mm 고정.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §P6 공통 「공통 고정 상수 (P4·P5에서 넘어온 입력으로 제시)」 표.
     *   명세가 세 단계 공통으로 선언한 8개다: W · t_tr · t_bar · h · L · ρ₀ · λ · I.
     *   조작 파라미터는 하중·회전수 둘뿐이라 **8개 전부 슬라이더와 겹치지 않는다.**
     *
     * 🔴 **ρ₀ 와 λ 는 명세가 적은 수와 이 파일이 쓰는 수가 다르다 — 계산이 쓰는 쪽을 싣는다.**
     *    명세: ρ₀ = 1.70 µΩ·cm · λ = 39 nm(S207). 물리층 정본: ρ₀ = 1.68 µΩ·cm · λ = 40 nm(S210).
     *    파일 머리 §1⑥ 이 「300 K 정본은 여전히 40 nm(S210) 이므로 이 파일은 물리층이 쓰는
     *    λ = 40 nm 를 그대로 따른다」로 이미 확정한 사항이다. **조건 카드가 계산과 다른 수를
     *    말하면 카드가 거짓말이 된다** — photo.ts 가 명세의 n = 1.44 대신 출처 있는 1.436 을
     *    올린 것과 같은 처리이며, 어긋남은 note 에 그 자리에서 밝힌다.
     *
     * 🔴 **PLN 이 §S5 도금 실습의 고정 조건으로 적은 3개(C_acc 25 ppm · C_lev 3 ppm ·
     *    T_bath 25 ℃, 명세)는 싣지 않았다.** 이 칸은 도금이 아니라 **CMP 제거율**
     *    실습이다 — 파일 머리 §0 표대로 도금 모델(R_bu · d_void)은 물리층이 원장 근거 없음으로
     *    거부해 **미구현**이고, 그래서 조작 파라미터도 하중·회전수다. 도금욕 첨가제 농도를
     *    「이 실습의 조건」으로 카드에 올리면 존재하지 않는 조작 대상을 조건인 양 제시하게 된다.
     *    도금 실습이 구현되면 그때 그 칸에 싣는다. */
    fixedConditions: [
      {
        id: 'trenchWidthNm', ko: '트렌치 폭 W', en: 'Trench width',
        value: String(REF_WIDTH_NM), unit: 'nm',
        basis: 'PLN 명세 공통 고정 상수 표 — 「60 nm (심화에서만 가변 20~200 nm)」. 이 파일은 응용·심화에서 슬라이더로 열고, 기초는 고정한다.',
        note: '스페이스 S = W 로 연동되므로 피치는 2W = 120 nm 다.',
      },
      {
        /* 🔴 상수가 없다 — 이 파일이 쓰는 것은 **Cu 실효 두께** `LINE_THICKNESS_NM`(= 120 − 3 = 117)
           하나이고, 그 두 조각(트렌치 깊이 120 · 배리어 3)은 M-18(배리어 두께 파라미터를
           만들지 않는다)에 따라 각각 이름을 갖지 않는다. 리터럴을 쓰되 사유를 남긴다. */
        id: 'trenchDepthNm', ko: '트렌치 깊이 t_tr', en: 'Trench depth',
        value: '120', unit: 'nm',
        basis: 'PLN 명세 공통 고정 상수 표 — 「전 단계 고정」.',
        note: `Cu 실효 두께 t_Cu = 120 − 3 = ${LINE_THICKNESS_NM} nm 로만 계산에 들어간다(배리어 상면은 CMP 로 제거된다).`,
      },
      {
        id: 'barrierThicknessNm', ko: '배리어(TaN/Ta) 두께 t_bar', en: 'Barrier (TaN/Ta) thickness',
        value: '3', unit: 'nm',
        basis: 'PLN 명세 공통 고정 상수 표 — 측벽·바닥 컨포멀, 상면은 CMP 로 제거.',
        note: `🔴 두께 방향으로만 반영한다(t_Cu = ${LINE_THICKNESS_NM} nm). 폭 방향 잠식 W_Cu = W − 2·t_bar 는 정량 근거 미확보로 **반영하지 않았다**(M-18) — 저항이 실제보다 낙관적으로 나온다.`,
      },
      {
        id: 'ildThicknessNm', ko: '상하 ILD 두께 h', en: 'Inter-layer dielectric thickness',
        value: String(ILD_THICKNESS_NM), unit: 'nm',
        basis: 'PLN 명세 공통 고정 상수 표 — 용량 계산용.',
        note: 'RC 지연의 수직 성분에만 쓰인다 — RC 판정은 심화(§S7) 전용이라 이 단계 계산에는 들어가지 않는다.',
      },
      {
        id: 'lineLengthUm', ko: '평가 배선 길이 L', en: 'Evaluated line length',
        value: String(REF_LENGTH_UM), unit: 'µm',
        basis: 'PLN 명세 공통 고정 상수 표 — 켈빈 구조 기준. 심화(§S7)에서 슬라이더로 열린다.',
      },
      {
        id: 'bulkResistivity', ko: 'Cu 벌크 저항률 ρ₀', en: 'Cu bulk resistivity ρ₀',
        value: (CU_RHO0.value * UOHMCM_PER_OHMM).toFixed(2), unit: 'µΩ·cm', sourceId: 'S210',
        note: '🔴 PLN 명세는 「1.70 µΩ·cm(널리 합의된 1.68~1.72 중 대표값)」로 적었다. 이 파일의 계산은 원장 정본 S210 의 1.68 µΩ·cm 를 쓰므로 카드도 그 값을 표시한다.',
      },
      {
        id: 'meanFreePath', ko: '전자 평균자유행로 λ (Cu)', en: 'Electron mean free path λ (Cu)',
        value: String(CU_MEAN_FREE_PATH_NM.value), unit: 'nm', sourceId: 'S210',
        note: '🔴 PLN 명세는 39 nm(S207 Gambino)로 적었다. 파일 머리 §1⑥ 확정대로 **300 K 정본인 40 nm(S210)** 를 쓴다 — 표면 산란 보정(Fuchs–Sondheimer)이 이 λ 로 계산되므로 카드가 39 를 말하면 화면과 계산이 갈라진다.',
      },
      {
        id: 'lineCurrentMa', ko: '배선 전류 I', en: 'Line current',
        value: REF_CURRENT_MA.toFixed(3), unit: 'mA',
        basis: 'PLN 명세 공통 고정 상수 표 — 「0.080 mA (EM 판정용, 심화)」 교육용 설정값. 심화(§S7)에서 슬라이더로 열린다.',
        note: 'EM 판정 전용이라 이 단계 계산에는 들어가지 않는다.',
      },
    ],
    outputs: [
      { id: 'removalRateNmPerMin', ko: '제거율 MRR', en: 'Removal rate', role: 'judge',
        pass: { min: MRR_PASS_MIN, max: MRR_PASS_MAX }, digits: 1 },
      { id: 'velocityMps', ko: '패드–웨이퍼 상대속도 V', en: 'Relative velocity', role: 'display', digits: 3 },
      { id: 'polishTimeMin', ko: '오버버든 306 nm 연마 시간', en: 'Time to clear 306 nm overburden', role: 'display', digits: 3 },
    ],
    compute(inputs) {
      const pressureKPa = inputs['pressureKPa'] ?? R165_PRESSURE_KPA.value;
      const rpm = inputs['platenRpm'] ?? R165_PLATEN_RPM.value;
      const r = cmp(pressureKPa, rpm);
      return {
        removalRateNmPerMin: r.mrr,
        velocityMps: r.velocityMps,
        polishTimeMin: r.polishMin,
      };
    },
    scene: { sceneId: 'polishProfile', map: polishSceneMap, note: POLISH_SCENE_NOTE },
    // 🔴 판정 경로 — 기본값이 대역 아래(258.9 nm/min)에서 시작하는 칸이라, 「얼마나 더 올려야
    //    합격 대역에 드는가」를 하중 축 위에서 읽게 한다. 판정 = removalRateNmPerMin.
    charts: [mrrLoadChart()],
    feedback: [
      {
        id: 'MT-B1', tone: 'hint',
        ko: '제거율이 S200 실측 대역 아래입니다. 정본 Preston 계수 1.6×10⁻¹³ m²/N 으로는 문헌 조건(24.76 kPa · 80 rpm)에서 258.9 nm/min 밖에 나오지 않습니다 — 논문이 역산한 1.87×10⁻¹³ 과의 차이입니다. 하중이나 회전수로 메우세요.',
        en: 'Removal rate is below the band S200 actually measured. With the canonical Preston coefficient 1.6e-13 m²/N the paper\'s own condition (24.76 kPa, 80 rpm) yields only 258.9 nm/min — the gap against the 1.87e-13 back-calculated in the paper. Close it with load or speed.',
        when: (_i, o) => (o['removalRateNmPerMin'] ?? 0) < MRR_PASS_MIN,
      },
      {
        id: 'MT-B2', tone: 'warn',
        ko: '대역 상단을 넘었습니다. 오버폴리시 구간이 길어져 배선 상면이 접시처럼 파입니다(디싱). 🔴 디싱의 절대 깊이는 원장에 정량치가 없어 수치로 판정하지 않습니다 — 경향만 배웁니다.',
        en: 'Above the measured band. The over-polish window stretches and the line tops dish out. Absolute dishing depth is not quantified in the ledger, so it is taught as a trend, not judged as a number.',
        when: (_i, o) => (o['removalRateNmPerMin'] ?? 0) > MRR_PASS_MAX,
      },
      {
        id: 'MT-B3', tone: 'warn',
        ko: '하중 편중입니다. Preston 식에서 하중과 상대속도는 대등하므로 같은 제거율을 회전수로도 만들 수 있습니다. 하중 쪽으로 몰면 스크래치와 low-k 층 박리 위험이 커집니다.',
        en: 'Load-heavy setting. In Preston\'s law load and relative velocity are interchangeable — the same rate is reachable with platen speed. Pushing load raises scratching and low-k delamination risk.',
        when: (i) => (i['pressureKPa'] ?? 0) >= 50,
      },
      {
        id: 'MT-B4', tone: 'warn',
        ko: '고속 편중입니다. 회전수를 계속 올리면 슬러리가 원심력으로 패드 밖으로 밀려 나가, 실제 장비에서는 식대로 제거율이 오르지 않습니다.',
        en: 'Speed-heavy setting. Past a point the slurry is flung off the pad and the real tool stops following the equation.',
        when: (i) => (i['platenRpm'] ?? 0) >= 160,
      },
      {
        id: 'MT-B5', tone: 'stop',
        ko: '🔴 연마 미달 — 오버버든 306 nm 를 사이클 예산 135 s 안에 제거하지 못했습니다. 배선 사이에 Cu 가 남아 인접 배선이 단락됩니다.',
        en: 'Polish shortfall — the 306 nm overburden is not cleared within the 135 s cycle. Residual Cu bridges adjacent lines.',
        when: (_i, o) => (o['polishTimeMin'] ?? 0) > POLISH_TIME_PASS_MAX,
      },
    ],
    tradeoffs: [
      {
        ko: '하중↑ → 제거율↑·연마시간↓(좋음) / 대역 상단을 넘으면 오버폴리시로 디싱·스크래치가 늘고 low-k 층이 박리된다(나쁨). 24.76 → 35 kPa 에서 MRR 258.9 → 365.9 nm/min.',
        en: 'More load raises removal rate and shortens polish time (good) but overshooting the band brings dishing, scratching and low-k delamination (bad). 24.76 → 35 kPa moves MRR 258.9 → 365.9 nm/min.',
      },
      {
        ko: '회전수↑ → 제거율↑(좋음) / 슬러리가 원심력으로 이탈해 균일도가 무너진다(나쁨). 80 → 120 rpm 에서 MRR 258.9 → 388.3 nm/min.',
        en: 'Higher platen speed raises removal rate (good) but flings slurry off the pad and wrecks uniformity (bad). 80 → 120 rpm moves MRR 258.9 → 388.3 nm/min.',
      },
      {
        ko: 'Preston 식에서 하중과 속도는 곱으로만 들어간다 — **어느 쪽으로 올려도 같은 제거율**이 나온다. 어느 쪽을 쓸지는 제거율이 아니라 결함이 정한다.',
        en: 'Preston\'s law only sees the product of load and velocity — either knob reaches the same rate. Which one you use is decided by defects, not by rate.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════════
   * 응용 (S6) — LO-P6-04
   * ══════════════════════════════════════════════════════════════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P6-04',
    titleKo: '깎는 것과 배선 저항을 동시에 맞춘다',
    titleEn: 'Balance the polish against the line resistance',
    params: [
      {
        id: 'pressureKPa', ko: 'CMP 하중압력', en: 'CMP down force', unit: 'kPa',
        min: 4, max: 66, step: 0.02, initial: R165_PRESSURE_KPA.value, sourceId: 'S204',
        note: '유효범위 S204 Table 2.6 · 기본값은 S200 Table 2 문헌 조건.',
      },
      {
        id: 'platenRpm', ko: '정반·헤드 회전수', en: 'Platen / head speed', unit: 'rpm',
        min: 10, max: 200, step: 5, initial: R165_PLATEN_RPM.value, sourceId: 'S202',
        note: '플래튼 = 헤드 (V = ω·d 성립 조건, S200). 중심거리 130 mm 고정.',
      },
      {
        id: 'lineWidthNm', ko: '배선 폭 W', en: 'Line width', unit: 'nm',
        min: WIDTH_SLIDER_RANGE_NM[0], max: WIDTH_SLIDER_RANGE_NM[1], step: 1, initial: REF_WIDTH_NM, sourceId: 'S205',
        note: '스페이스 S = W (피치 = 2W) · 배선 두께 117 nm · 길이 50 µm 고정. 배리어 잠식은 정량치 미확보로 반영하지 않는다(M-18).',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세 §S6 조작 파라미터 표의 *(고정)*.
     *   그중 **2개만 남았다.** 나머지는 이 파일에서 조작 가능하거나 미구현이다:
     *     · *(고정) 정반 회전 v = 60 rpm* → **제외.** `platenRpm` 슬라이더로 열려 있다(기본 80 rpm).
     *       조작 가능한 값을 「정해진 것」으로 카드에 올리면 학습자가 그 축을 손대지 않는다.
     *     · *(고정) 배선 폭 W = 60 nm* → **제외.** `lineWidthNm` 슬라이더로 열려 있다.
     *       같은 행의 **low-k k = 3.0 은 이 단계에 슬라이더가 없어** 고정 조건으로 남는다.
     *     · *(고정) 평탄제 농도 C_lev = 3 ppm* → **제외.** 도금 모델이 미구현이라(파일 머리 §0)
     *       이 칸에 도금욕 첨가제를 조작·판정하는 경로가 없다. 기초 칸의 도금 3종과 같은 사유다. */
    fixedConditions: [
      {
        id: 'slurryFlowMlPerMin', ko: '슬러리 유량 Q', en: 'Slurry flow rate',
        value: '200', unit: 'mL/min',
        basis: 'PLN 명세 §S6 표의 *(고정)* 행(교육용 설정). 🔴 상수가 없다 — 물리층 CMP(Preston 식)에 슬러리 유량 입력 자체가 없어 계산에 들어가지 않기 때문이다.',
        note: '씬에도 매핑하지 않는다(`POLISH_SCENE_NOTE` — 「slurry 는 물리층에 입력이 없어 매핑하지 않는다」). 유량이 제거율·스크래치에 미치는 정량 관계는 원장에 없다.',
      },
      {
        /* 🔴 상수가 없다 — 이 값을 담을 만한 `REF_DIELECTRIC` 은 **4.0(SiO₂, S208)** 이라 다른 수다.
           REF_DIELECTRIC 은 RC 지연비의 **기준 조합**(심화 슬라이더 기본값)이고, 여기 3.0 은
           PLN 이 §S6 에서 선언한 **고정 조건**이다. 값이 다르므로 끌어오면 카드가 명세와 갈라진다.
           🔴 **명세와 구현의 어긋남을 여기서 임의로 봉합하지 않는다** — 합격창·기본값 이동은
           PLN 소관(D-041)이라 사실만 note 에 적어 둔다. */
        id: 'dielectricConstant', ko: 'low-k ILD 유전율 k', en: 'low-k ILD dielectric constant',
        value: '3.0',
        basis: 'PLN 명세 §S6 표의 *(고정)* 행 — 「배선 폭 / low-k k값 W / k = 60 nm / 3.0」 중 k. 같은 행의 W 는 이 파일에서 슬라이더로 열려 있어 고정 조건이 아니다.',
        note: `🔴 S208 Table 2 에 3.0 인 재료는 없다(SiCOH 2.6–2.7 · FSG 3.5 · SiO₂ 4.0) — PLN 교육용 설정값이라 S번호를 붙이지 않았다. 이 단계 계산에는 들어가지 않는다(RC 판정은 심화 §S7 전용). 심화의 유전율 슬라이더 기본값은 RC 기준 조합인 SiO₂ ${REF_DIELECTRIC.toFixed(1)} 이라 이 3.0 과 다르다.`,
      },
    ],
    outputs: [
      { id: 'removalRateNmPerMin', ko: '제거율 MRR', en: 'Removal rate', role: 'judge',
        pass: { min: MRR_PASS_MIN, max: MRR_PASS_MAX }, digits: 1 },
      { id: 'polishTimeMin', ko: '오버버든 연마 시간 (잔류 Cu 게이트)', en: 'Overburden clear time (residual-Cu gate)', role: 'judge',
        pass: { max: POLISH_TIME_PASS_MAX }, digits: 3 },
      { id: 'resistanceRatio', ko: '배선 저항비 R / R(기본 조합)', en: 'Line resistance ratio vs default', role: 'judge',
        pass: { max: RESISTANCE_RATIO_PASS_MAX_APPLIED }, digits: 3 },
      { id: 'lineResistanceOhm', ko: '배선 저항 R (L = 50 µm)', en: 'Line resistance', role: 'display', digits: 1 },
      /* 🔴 `counted` — **설계 피치**다. 0.1 nm 표기는 실측 분해능 밖이라 자릿수 상향이
         정밀도를 과장한다. 경계에서는 부등호 표기로 간다(R-DISP-1 · PLN §27-3). */
      { id: 'pitchNm', ko: '배선 피치 2W (집적도)', en: 'Line pitch (density)', role: 'judge',
        pass: { max: PITCH_PASS_MAX }, digits: 0, displayMode: 'counted' },
      { id: 'effectiveResistivityUOhmCm', ko: '실효 저항률 ρ_eff (표면 산란)', en: 'Effective resistivity (surface scattering)', role: 'display', digits: 4 },
      { id: 'velocityMps', ko: '패드–웨이퍼 상대속도 V', en: 'Relative velocity', role: 'display', digits: 3 },
    ],
    compute(inputs) {
      const pressureKPa = inputs['pressureKPa'] ?? R165_PRESSURE_KPA.value;
      const rpm = inputs['platenRpm'] ?? R165_PLATEN_RPM.value;
      const widthNm = inputs['lineWidthNm'] ?? REF_WIDTH_NM;
      const r = cmp(pressureKPa, rpm);
      const rho = effectiveResistivityFSLine({ widthNm, thicknessNm: LINE_THICKNESS_NM });
      const resistance = copperLineResistance({
        lengthUm: REF_LENGTH_UM, widthNm, thicknessNm: LINE_THICKNESS_NM,
      });
      return {
        removalRateNmPerMin: r.mrr,
        polishTimeMin: r.polishMin,
        resistanceRatio: resistanceRatioQuantity(resistance.value),
        lineResistanceOhm: resistance,
        pitchNm: quantity(2 * widthNm, {
          modelId: 'metal.lab.pitchNm', unit: 'nm', sourceId: 'S205',
          validRange: [0, 1000],
          assumptions: ['피치 = W + S, 스페이스 S = W (PLN 공통 상수) — 정의이지 모델이 아니다'],
        }),
        effectiveResistivityUOhmCm: quantity(rho.value * UOHMCM_PER_OHMM, {
          modelId: 'metal.lab.effectiveResistivity', unit: 'µΩ·cm', sourceId: 'S210',
          validRange: [0, 100],
          assumptions: [
            'Fuchs–Sondheimer 표면 산란만 — 입계 산란(Mayadas–Shatzkes)은 물리층 미구현. 라벨에 「입계」를 쓰지 않는다',
            'λ = 40 nm (300 K 정본, S210). 39 nm(S207·S216)도 인용 가능하지만 300 K 정본이 아니라 쓰지 않았다',
            '🔴 선폭과 두께가 함께 정한다 — 특성길이 = 4×단면적/둘레 (S216 Eq.(8), M-29 해소)',
            'FS 계수는 k 로 갈린다. 이 실습의 슬라이더 전 구간(k 0.854–3.691)은 0.474 구간이다',
          ],
        }),
        velocityMps: r.velocityMps,
      };
    },
    scene: { sceneId: 'polishProfile', map: polishSceneMap, note: POLISH_SCENE_NOTE },
    // 🔴 판정 경로 2개 — 이 칸의 4판정은 **연마 축과 배선 축**으로 갈리고 서로 독립이다(§3 실측).
    //    축마다 그림을 하나씩 준다. 판정 = removalRateNmPerMin · resistanceRatio.
    charts: [mrrLoadChart(), resistanceWidthChart(RESISTANCE_RATIO_PASS_MAX_APPLIED)],
    feedback: [
      {
        id: 'MT-A1', tone: 'stop',
        ko: '🔴 배선 간 Cu 단락 — 오버버든 306 nm 를 사이클 예산 135 s 안에 제거하지 못했습니다. 하중이나 회전수를 올리세요.',
        en: 'Residual-Cu short — the 306 nm overburden is not cleared within the 135 s cycle. Raise load or platen speed.',
        when: (_i, o) => (o['polishTimeMin'] ?? 0) > POLISH_TIME_PASS_MAX,
      },
      {
        id: 'MT-A2', tone: 'warn',
        // 🔴 2026-08-21: 여기 적혀 있던 「합격 구간은 W 81–85 nm」를 **뺐다.** M-29 수정 후 그 구간은
        //    사실이 아니었다. κ 전환 후 실측한 새 구간은 **W 78–85 nm 8점**이다(§3) — 다만 구간의
        //    숫자를 학습자 문구에 되살릴지는 PLN 대조 사항이라 여기서는 상충 구조만 말한다.
        ko: '배선 저항 초과입니다. 두께는 117 nm 로 고정이므로 단면적을 늘리는 길은 폭뿐입니다 — 그런데 폭을 늘리면 피치가 벌어져 집적도 판정이 깨집니다. 게다가 폭을 좁히면 표면 산란까지 세져 ρ_eff 자체가 올라갑니다.',
        en: 'Line resistance is over spec. Thickness is fixed at 117 nm, so the only way to grow the cross-section is width — which widens the pitch and breaks the density judgement. Worse, narrowing the line also raises ρ_eff itself through surface scattering.',
        when: (_i, o) => (o['resistanceRatio'] ?? 0) > RESISTANCE_RATIO_PASS_MAX_APPLIED,
      },
      {
        id: 'MT-A3', tone: 'warn',
        ko: '집적도 초과입니다. 피치가 170 nm 를 넘었습니다 — 저항을 낮추려고 폭을 넓힌 대가입니다.',
        en: 'Density violated: pitch exceeds 170 nm — the price of widening the line to cut resistance.',
        when: (_i, o) => (o['pitchNm'] ?? 0) > PITCH_PASS_MAX,
      },
      {
        id: 'MT-A4', tone: 'hint',
        ko: '제거율이 S200 실측 대역을 벗어났습니다. 아래로 벗어나면 잔류 Cu, 위로 벗어나면 오버폴리시입니다 — 두 방향 모두 불합격입니다.',
        en: 'Removal rate is outside the band S200 measured. Below it leaves residual Cu; above it over-polishes. Both fail.',
        when: (_i, o) => {
          const v = o['removalRateNmPerMin'] ?? 0;
          return v < MRR_PASS_MIN || v > MRR_PASS_MAX;
        },
      },
      {
        id: 'MT-A5', tone: 'hint',
        // 🔴 2026-08-21 M-29: 종전 문구는 「ρ_eff 는 두께로만 정해진다 · R 은 정확히 1/W」였다.
        //    물리층이 무한폭 박막식을 배선에 쓰고 있었기 때문에 맞았던 말이고, 지금은 틀린 말이다.
        ko: 'ρ_eff 는 배선 **단면 전체**가 정합니다(표면 산란). S216 Eq.(8) 의 특성길이는 4×단면적/둘레라, 폭을 좁히면 단면적이 줄 뿐 아니라 ρ_eff 자체가 올라갑니다 — 그래서 R 은 1/W 보다 **빠르게** 커집니다. W 85 → 20 nm 에서 ρ_eff 는 2.0035 → 2.6124 µΩ·cm 로 30 % 오릅니다. 🔴 입계 산란 항은 구현되어 있지 않습니다(M-17).',
        en: 'ρ_eff is set by the whole cross-section, not just thickness: the S216 Eq.(8) characteristic length is 4·area/perimeter, so narrowing the line shrinks the area AND raises ρ_eff itself — R therefore grows faster than 1/W. From W 85 to 20 nm, ρ_eff rises 2.0035 → 2.6124 µΩ·cm (+30 %). Grain-boundary scattering is not implemented (M-17).',
        when: () => true,
      },
    ],
    tradeoffs: [
      {
        ko: '🔴 배선 폭↑ → 단면적↑·표면 산란↓ → 저항↓(좋음) / 피치↑ → 집적도 판정 실패(나쁨). W 60 → 85 nm 에서 R 148.3 → 100.7 Ω, 피치 120 → 170 nm. **두 판정이 정확히 반대로 움직여 해가 극도로 좁아진다.**',
        en: 'Wider line lowers resistance twice over — bigger area and weaker surface scattering (good) — but widens pitch and fails density (bad). W 60 → 85 nm moves R 148.3 → 100.7 Ω while pitch goes 120 → 170 nm; the two judgements pull apart and squeeze the solution to almost nothing.',
      },
      {
        ko: '하중·회전수↑ → 잔류 Cu 게이트 통과가 쉬워진다(좋음) / 제거율이 S200 실측 대역 위로 나가면 오버폴리시로 불합격(나쁨).',
        en: 'More load or speed clears the residual-Cu gate more easily (good) but pushing removal rate above the measured band over-polishes and fails (bad).',
      },
      {
        ko: '연마 쪽과 배선 쪽은 서로 독립해 보이지만 하나의 합격을 나눠 갖는다 — 어느 한쪽만 맞추면 전체가 불합격이다.',
        en: 'The polish side and the wiring side look independent but share one verdict — satisfying only one still fails the run.',
      },
    ],
  },

  /* ══════════════════════════════════════════════════════════════════════
   * 심화 (S7) — LO-P6-05
   * ══════════════════════════════════════════════════════════════════════ */
  {
    processId: PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P6-05',
    titleKo: '저항·RC 지연·EM 수명·집적도를 동시에 회복시킨다',
    titleEn: 'Recover resistance, RC delay, EM lifetime and density together',
    params: [
      {
        id: 'pressureKPa', ko: 'CMP 하중압력', en: 'CMP down force', unit: 'kPa',
        min: 4, max: 66, step: 0.02, initial: R165_PRESSURE_KPA.value, sourceId: 'S204',
        note: '유효범위 S204 Table 2.6. 🔴 다공성 low-k(k < 2.6)에서는 S200 문헌 조건 24.76 kPa 를 넘길 근거가 없어 계산이 정지한다.',
      },
      {
        id: 'platenRpm', ko: '정반·헤드 회전수', en: 'Platen / head speed', unit: 'rpm',
        min: 10, max: 200, step: 5, initial: R165_PLATEN_RPM.value, sourceId: 'S202',
        note: '플래튼 = 헤드 (S200). 중심거리 130 mm 고정.',
      },
      {
        id: 'lineWidthNm', ko: '배선 폭 W', en: 'Line width', unit: 'nm',
        min: WIDTH_SLIDER_RANGE_NM[0], max: WIDTH_SLIDER_RANGE_NM[1], step: 1, initial: REF_WIDTH_NM, sourceId: 'S205',
        note: '스페이스 S = W · 두께 117 nm 고정. 저항·RC·EM·집적도 네 판정에 동시에 걸린다.',
      },
      {
        id: 'dielectricConstant', ko: 'ILD 유전율 k', en: 'ILD dielectric constant', unit: '',
        min: DIELECTRIC_SLIDER_RANGE[0], max: DIELECTRIC_SLIDER_RANGE[1], step: 0.1, initial: REF_DIELECTRIC, sourceId: 'S208',
        note: 'SiO₂ 4.0 · FSG 3.5 · SiCOH 2.6–2.7 · 다공성 low-k 2.6 미만 (S208 Table 2). 2.6 미만은 다공성이라 CMP 하중이 제한된다.',
      },
      {
        id: 'lineLengthUm', ko: '평가 배선 길이 L', en: 'Evaluated line length', unit: 'µm',
        min: 10, max: 200, step: 5, initial: REF_LENGTH_UM, sourceId: 'S205',
        note: '켈빈 구조 기준 50 µm 가 PLN 공통 상수. Blech 불멸 조건이 j·l 로 길이에 걸린다(S206).',
      },
      {
        id: 'operatingTempK', ko: '배선 동작 온도', en: 'Operating temperature', unit: 'K',
        min: 300, max: 400, step: 2, initial: REF_TEMP_K, sourceId: 'S206',
        note: '기본 378 K(105 ℃)는 S206 §V-A 의 Cu 이중다마신 조건. PLN 외란 3(핫스팟 승온)은 388 K 로 올린다.',
      },
      {
        id: 'lineCurrentMa', ko: '배선 전류 I', en: 'Line current', unit: 'mA',
        min: CURRENT_SLIDER_RANGE_MA[0], max: CURRENT_SLIDER_RANGE_MA[1], step: 0.01, initial: REF_CURRENT_MA, sourceId: 'S201',
        note: '기본 0.080 mA 는 PLN 공통 상수(교육용 설정값). 하한은 전류밀도가 S201 §2.1 의 EM 발현 하한 10⁴ A/cm² 아래로 내려가지 않도록 잡았다.',
      },
    ],
    /* 🔴 **고정 조건 카드** — PLN 명세가 이 단계에 대해 선언한 것은 4개다:
     *   「스페이스 S = W 로 연동(피치 = 2W). 배선 길이 L = 50 µm, 배선 전류 I = 0.080 mA,
     *     사용 온도 T = 378 K(105 ℃) 고정 — 외란 3에서만 388 K(115 ℃)로 바뀐다.」
     *
     * 🔴 **그중 3개(L · I · T)를 뺐다 — 이 파일에서 셋 다 슬라이더로 열려 있다**
     *    (`lineLengthUm` · `lineCurrentMa` · `operatingTempK`). 명세는 외란 3(핫스팟 승온)을
     *    시나리오 이벤트로 두었지만 순수 함수 하네스에 시간축 이벤트 주입 경로가 없어
     *    온도를 입력으로 열었고(같은 사유로 L·I 도 열려 있다), **조작 가능한 값은 고정 조건이 아니다.**
     *    카드에 「T = 378 K 고정」이라고 적으면 바로 옆 슬라이더가 그것을 반증한다.
     *
     * 🔴 남는 것은 **스페이스–피치 연동 하나**다. 이것은 수가 아니라 **관계**이고, 판정 출력
     *    `pitchNm`(= 2W, 상한 170 nm)이 왜 배선 폭만으로 정해지는지를 설명하는 자리다. */
    fixedConditions: [
      {
        id: 'spacePitchRule', ko: '스페이스 S / 피치', en: 'Space S / pitch',
        value: 'S = W (피치 = 2W)', valueEn: 'S = W (pitch = 2W)',
        basis: 'PLN 명세 §S7 — 「스페이스 S = W 로 연동(피치 = 2W)」. 명세 공통 고정 상수 표의 트렌치 폭 비고와 같은 규칙이다.',
        note: `🔴 스페이스는 조작 대상이 아니라 배선 폭 W 에 묶여 있다 — 그래서 집적도 판정이 W 하나로 정해진다(피치 2W ≤ ${PITCH_PASS_MAX} nm ⟺ W ≤ ${PITCH_PASS_MAX / 2} nm). 저항을 낮추려고 W 를 넓히면 같은 손으로 피치가 밀린다.`,
      },
    ],
    outputs: [
      { id: 'removalRateNmPerMin', ko: '제거율 MRR', en: 'Removal rate', role: 'judge',
        pass: { min: MRR_PASS_MIN, max: MRR_PASS_MAX }, digits: 1 },
      { id: 'polishTimeMin', ko: '오버버든 연마 시간 (잔류 Cu 게이트)', en: 'Overburden clear time (residual-Cu gate)', role: 'judge',
        pass: { max: POLISH_TIME_PASS_MAX }, digits: 3 },
      { id: 'resistanceRatio', ko: '배선 저항비 R / R(기본 조합)', en: 'Line resistance ratio vs default', role: 'judge',
        pass: { max: RESISTANCE_RATIO_PASS_MAX_ADVANCED }, digits: 3 },
      { id: 'lineResistanceOhm', ko: '배선 저항 R', en: 'Line resistance', role: 'display', digits: 1 },
      /* 🔴 `counted` — **설계 피치**다. 0.1 nm 표기는 실측 분해능 밖이라 자릿수 상향이
         정밀도를 과장한다. 경계에서는 부등호 표기로 간다(R-DISP-1 · PLN §27-3). */
      { id: 'pitchNm', ko: '배선 피치 2W (집적도)', en: 'Line pitch (density)', role: 'judge',
        pass: { max: PITCH_PASS_MAX }, digits: 0, displayMode: 'counted' },
      { id: 'rcDelayRatio', ko: 'RC 지연비 τ / τ(기본 조합)', en: 'RC delay ratio vs default', role: 'judge',
        pass: { max: RC_RATIO_PASS_MAX }, digits: 3 },
      { id: 'emLifetimeRatio', ko: 'EM 수명비 MTTF / MTTF(기본 조합)', en: 'EM lifetime ratio vs default', role: 'judge',
        pass: { min: EM_RATIO_PASS_MIN }, digits: 3 },
      { id: 'blechMargin', ko: 'Blech 여유 (j·l) / (j·l)_crit', en: 'Blech margin', role: 'judge',
        pass: { max: BLECH_MARGIN_PASS_MAX }, digits: 3 },
      { id: 'tenYearAttainmentPercent', ko: '10년 기준 달성률', en: 'Attainment vs the 10-year bar', role: 'display', digits: 2 },
      { id: 'currentDensityAPerCm2', ko: '전류밀도 j', en: 'Current density', role: 'display', digits: 0 },
      { id: 'effectiveResistivityUOhmCm', ko: '실효 저항률 ρ_eff (표면 산란)', en: 'Effective resistivity (surface scattering)', role: 'display', digits: 4 },
      { id: 'velocityMps', ko: '패드–웨이퍼 상대속도 V', en: 'Relative velocity', role: 'display', digits: 3 },
    ],
    compute(inputs) {
      const pressureKPa = inputs['pressureKPa'] ?? R165_PRESSURE_KPA.value;
      const rpm = inputs['platenRpm'] ?? R165_PLATEN_RPM.value;
      const widthNm = inputs['lineWidthNm'] ?? REF_WIDTH_NM;
      const k = inputs['dielectricConstant'] ?? REF_DIELECTRIC;
      const lengthUm = inputs['lineLengthUm'] ?? REF_LENGTH_UM;
      const tempK = inputs['operatingTempK'] ?? REF_TEMP_K;
      const currentMa = inputs['lineCurrentMa'] ?? REF_CURRENT_MA;

      // 🔴 공정 한계선 — 다공성 low-k 위에서 문헌 조건을 넘는 하중을 걸 근거가 원장에 없다.
      //    조건·문구·한계값은 `assertPorousLowKLoadAllowed()` 에 있다(위 정의부 주석 참조).
      //    🔴 **함수 하나로 둔 이유는 심화 RC 차트가 같은 축을 훑기 때문**이다 — 조건을 두 벌
      //    적으면 화면과 계산이 갈라진다. 여기서 조건을 다시 쓰지 마라.
      assertPorousLowKLoadAllowed(k, pressureKPa);

      const r = cmp(pressureKPa, rpm);
      const rho = effectiveResistivityFSLine({ widthNm, thicknessNm: LINE_THICKNESS_NM });
      const j = currentDensity(currentMa, widthNm);
      const blechProductAPerUm = j * lengthUm * A_PER_UM_FROM_A_PER_CM2_UM;
      const emRatio = blackAccelerationFactor({
        currentDensity1: EM_REFERENCE_J,
        currentDensity2: j,
        temperature1K: REF_TEMP_K,
        temperature2K: tempK,
        exponentN: BLACK_N_CU,
        activationEnergyEv: EA_CU_SURFACE_EV,
      });

      const resistance = copperLineResistance({
        lengthUm, widthNm, thicknessNm: LINE_THICKNESS_NM,
      });

      return {
        removalRateNmPerMin: r.mrr,
        polishTimeMin: r.polishMin,
        resistanceRatio: resistanceRatioQuantity(resistance.value),
        lineResistanceOhm: resistance,
        pitchNm: quantity(2 * widthNm, {
          modelId: 'metal.lab.pitchNm', unit: 'nm', sourceId: 'S205',
          validRange: [0, 1000],
          assumptions: ['피치 = W + S, 스페이스 S = W (PLN 공통 상수)'],
        }),
        rcDelayRatio: quantity(rcDelayFigure(widthNm, lengthUm, k) / RC_REFERENCE, {
          modelId: 'metal.lab.rcDelayRatio', unit: '', sourceId: 'S205',
          validRange: [0, 1000],
          assumptions: [
            '🔴 절대 지연(ps) 아님 — ε₀ 에 붙일 S번호가 원장에 없다. ρ 와 ε₀ 를 분리한 비율이다',
            '기준 = 기본 파라미터 조합 (W 60 nm · k 4.0 · L 50 µm)',
            'τ = 0.89·R·C, 프린지 보정 K_I ≈ 2 (S205 Eq.(1)–(5))',
          ],
        }),
        emLifetimeRatio: emRatio,
        tenYearAttainmentPercent: quantity(
          emRatio.value * (PLN_DEFAULT_MTTF_H / TEN_YEAR_HOURS) * 100,
          {
            modelId: 'metal.lab.tenYearAttainment', unit: '%', basis: "교육용 합성 — 기준 MTTF 1,469 h 와 10년 기준선 87,600 h 는 학습용 조건값이며 실측 수명이 아닙니다.",
            validRange: [0, 1000],
            assumptions: [
              '🔴 절대 MTTF 를 표시하지 않는다(A6L-03) — 이 값은 수명배수 × (1,469 h / 8.76×10⁴ h) 이다',
              '기준 수명 10년(8.76×10⁴ h)과 기본 조합 MTTF 1,469 h 는 PLN 이 조건으로 제시한 교육용 값(D-008)',
              '단일 Cu 배선이 10년에 못 미치는 것은 설계 결함이 아니라 설계 규칙이 J_max 를 제한하는 이유다',
            ],
          },
        ),
        blechMargin: quantity(blechProductAPerUm / BLECH_CRIT_A_PER_UM, {
          modelId: 'metal.lab.blechMargin', unit: '', sourceId: 'S206',
          validRange: [0, 1000],
          assumptions: [
            '불멸 조건 Δσ < 2σ_crit → (j·l)_crit = 0.268 A/µm (S206 §V-C 식 (7))',
            '단일 세그먼트 Cu 이중다마신',
          ],
        }),
        currentDensityAPerCm2: quantity(j, {
          modelId: 'metal.lab.currentDensity', unit: 'A/cm²', sourceId: 'S201',
          validRange: [0, 1e8],
          assumptions: ['j = I/A, A = W × 117 nm (배리어 잠식 미반영 — M-18)'],
        }),
        effectiveResistivityUOhmCm: quantity(rho.value * UOHMCM_PER_OHMM, {
          modelId: 'metal.lab.effectiveResistivity', unit: 'µΩ·cm', sourceId: 'S210',
          validRange: [0, 100],
          assumptions: [
            'Fuchs–Sondheimer 표면 산란만 — 입계 산란(Mayadas–Shatzkes)은 물리층 미구현. 라벨에 「입계」를 쓰지 않는다',
            'λ = 40 nm (300 K 정본, S210). 39 nm(S207·S216)는 인용 가능하나 정본이 아니다',
            '🔴 선폭과 두께가 함께 정한다 — 특성길이 = 4×단면적/둘레 (S216 Eq.(8), M-29 해소)',
          ],
        }),
        velocityMps: r.velocityMps,
      };
    },
    scene: { sceneId: 'polishProfile', map: polishSceneMap, note: POLISH_SCENE_NOTE },
    /* 🔴 판정 경로 3개 — 7판정 중 **비율 판정 3종**을 각자의 지배 축 위에 세운다
     *    (저항비 ← 선폭 · 수명비 ← 전류 · 지연비 ← 유전율). 나머지 4판정은 여기에 얹지 않았다:
     *      · `pitchNm` 은 세로축 양이 아니라 W 의 함수라 저항비 차트에 **세로선**으로 들어가 있다.
     *      · `blechMargin` 은 j·l 곱이라 전용 축이 없다 — 전류 축(EM 차트)과 길이 축이 함께 정한다.
     *        한 축에 그리면 나머지 절반이 고정된 것처럼 보이므로 **지어내지 않고 비웠다.**
     *      · CMP 2판정(MRR·연마시간)은 기초·응용에서 하중 축으로 이미 가르친 뒤라 심화에서는
     *        판정만 남기고 그림을 늘리지 않았다. */
    charts: [
      resistanceWidthChart(RESISTANCE_RATIO_PASS_MAX_ADVANCED),
      rcDielectricChart(),
      emCurrentChart(),
    ],
    feedback: [
      {
        id: 'MT-X0', tone: 'hint',
        ko: '🔴 EM 수명은 **배율**로만 표시합니다. Black 식의 계수 A 는 공정·구조 의존이라 공개 실측값이 없어(A6L-03) 절대 MTTF 를 내지 않습니다 — A 는 배율에서 약분되므로 학습은 온전합니다. 활성화에너지는 원장 정본 0.80 eV(Cu 표면확산, S201)를 씁니다. 참고문헌 SP-61 은 0.90 eV 를 들지만 원장을 정본으로 삼았습니다. 🔴 옆의 「10년 기준 달성률」을 함께 보십시오 — **단일 배선으로 10년을 만들 수 없습니다. 그래서 설계 규칙이 J_max 를 제한합니다.**',
        en: 'EM lifetime is shown only as a ratio. Black\'s prefactor A has no published measured value (A6L-03), so no absolute MTTF is produced — A cancels in the ratio, so the lesson survives intact. Activation energy is the ledger value 0.80 eV (Cu surface diffusion, S201); reference SP-61 argues 0.90 eV but the ledger governs. Read it next to the ten-year attainment figure: a single line cannot reach ten years — that is why design rules cap J_max.',
        when: () => true,
      },
      {
        id: 'MT-X1', tone: 'stop',
        ko: '🔴 배선 간 Cu 단락 — 오버버든 306 nm 가 사이클 예산 135 s 안에 제거되지 않았습니다. 종점 신호가 뜨지 않습니다.',
        en: 'Residual-Cu short — the 306 nm overburden is not cleared within the 135 s cycle; the endpoint signal never fires.',
        when: (_i, o) => (o['polishTimeMin'] ?? 0) > POLISH_TIME_PASS_MAX,
      },
      {
        id: 'MT-X2', tone: 'warn',
        ko: 'EM 수명비가 목표(기본 조합의 2.5배)에 미달합니다. 배선 폭을 넓히거나(=집적도와 상충), 전류를 줄이거나, 동작 온도를 낮추세요. 🔴 단일 Cu 배선으로 10년(8.76×10⁴ h)을 만들 수는 없습니다 — 실제 칩이 버티는 것은 설계 규칙이 J_max 를 제한하고 듀티 사이클이 낮기 때문입니다.',
        en: 'EM lifetime ratio is below the 2.5× target. Widen the line (conflicts with density), cut the current, or lower the temperature. A single Cu line cannot reach a ten-year lifetime here — real chips survive because design rules cap J_max and duty cycles are low.',
        when: (_i, o) => (o['emLifetimeRatio'] ?? 0) < EM_RATIO_PASS_MIN,
      },
      {
        id: 'MT-X3', tone: 'warn',
        ko: 'Blech 불멸 조건을 넘었습니다 — j·l 이 임계곱 0.268 A/µm(S206) 을 초과했습니다. 세그먼트를 짧게 하거나 단면적을 키우면 역응력이 전자풍력을 상쇄해 EM 으로 끊기지 않습니다.',
        en: 'Blech immortality is lost — j·l exceeds the critical product 0.268 A/µm (S206). Shorten the segment or grow the cross-section so back-stress cancels the electron wind.',
        when: (_i, o) => (o['blechMargin'] ?? 0) > BLECH_MARGIN_PASS_MAX,
      },
      {
        id: 'MT-X4', tone: 'warn',
        ko: 'RC 지연비가 목표를 넘었습니다. k값을 낮추면 용량이 줄지만(SiO₂ 4.0 → SiCOH 2.6), 2.6 미만은 다공성이라 CMP 하중을 24.76 kPa 이상 걸 근거가 없어 계산이 멈춥니다 — 그때는 회전수로 깎아야 합니다.',
        en: 'RC delay ratio is over target. Lowering k cuts capacitance (SiO₂ 4.0 → SiCOH 2.6), but below 2.6 the film is porous and there is no basis for loads above 24.76 kPa — the run stops, and you must polish with platen speed instead.',
        when: (_i, o) => (o['rcDelayRatio'] ?? 0) > RC_RATIO_PASS_MAX,
      },
      {
        id: 'MT-X5', tone: 'hint',
        ko: '집적도 칸만 초록이고 저항·RC·EM 이 함께 빨강이면, 배선 폭을 줄여 얻은 집적도를 세 곳에서 되갚고 있는 것입니다. 이 실습 최대의 상충 그림입니다.',
        en: 'When only the density box is green while resistance, RC and EM are all red, you are paying for the narrow line in three places at once — the headline trade-off of this lab.',
        when: (_i, o) => (o['pitchNm'] ?? 0) <= PITCH_PASS_MAX
          && ((o['resistanceRatio'] ?? 0) > RESISTANCE_RATIO_PASS_MAX_ADVANCED
            || (o['rcDelayRatio'] ?? 0) > RC_RATIO_PASS_MAX
            || (o['emLifetimeRatio'] ?? 0) < EM_RATIO_PASS_MIN),
      },
      {
        id: 'MT-X6', tone: 'hint',
        ko: '길이를 늘리면 저항·RC 지연·Blech 여유가 **함께** 나빠집니다. 반대로 세그먼트를 짧게 자르는 것이 EM 대책이 된다는 것이 Blech 조건의 실무적 의미입니다.',
        en: 'Longer lines worsen resistance, RC delay and the Blech margin together. Conversely, cutting the segment short is itself an EM countermeasure — that is what the Blech condition means in practice.',
        when: (i) => (i['lineLengthUm'] ?? 0) > REF_LENGTH_UM,
      },
      {
        id: 'MT-X7', tone: 'warn',
        ko: '동작 온도를 올렸습니다. 표면확산 활성화에너지 0.80 eV 기준으로 378 → 388 K 만 올려도 EM 수명이 약 53 %로 떨어집니다(PLN 외란 3 「핫스팟 승온」). 온도는 전류밀도보다 훨씬 가파른 인자입니다.',
        en: 'You raised the operating temperature. With Ea = 0.80 eV, going 378 → 388 K alone drops EM lifetime to about 53 % (PLN disturbance 3, "hot-spot heating"). Temperature is a far steeper lever than current density.',
        when: (i) => (i['operatingTempK'] ?? 0) > REF_TEMP_K,
      },
    ],
    tradeoffs: [
      {
        // 🔴 2026-08-21: R 값은 M-29 반영 후 실측값으로 바꿨다(L = 50 µm 기준).
        //    전류밀도 배수도 바로잡았다 — j = I/(W·T) 이므로 W 85 → 40 이면 정확히 85/40 = 2.125배다.
        //    종전의 「1.7배」는 어느 조합에서도 나오지 않는 수였다.
        ko: '🔴 배선 폭↓ → 집적도(피치)↑(좋음) / 저항↑·RC 지연↑·전류밀도↑ → EM 수명↓·Blech 여유↓(전부 나쁨). W 85 → 40 nm 에서 R 100.7 → 236.6 Ω(2.35배 — 단면적만 보면 2.13배인데 ρ_eff 가 같이 올라 더 커진다), 전류밀도 2.13배. **한 인자가 판정 네 개를 반대로 끌어당긴다.**',
        en: 'Narrowing the line improves pitch (good) but raises resistance, RC delay and current density, cutting EM lifetime and the Blech margin (all bad). W 85 → 40 nm moves R 100.7 → 236.6 Ω — a factor 2.35, more than the 2.13 you would get from area alone, because ρ_eff climbs too — and raises j by 2.13×. One knob pulls four judgements apart.',
      },
      {
        ko: '🔴 유전율 k↓ → 용량↓ → RC 지연↓(좋음) / k 2.6 미만은 다공성이라 기계 강도가 낮아 CMP 하중을 문헌 조건(24.76 kPa) 위로 올릴 근거가 없다 → 하중 대신 회전수로 깎아야 한다(나쁨).',
        en: 'Lower k cuts capacitance and RC delay (good), but below 2.6 the film is porous and there is no basis for loads above the literature condition 24.76 kPa — you must polish with speed instead of load (bad).',
      },
      {
        ko: '배선 전류↓ → EM 수명↑·Blech 여유↑(좋음) / 실제 회로에서 전류는 구동 능력이다 — 줄이면 그만큼 느려진다(이 모델에는 없는 대가).',
        en: 'Less current improves EM lifetime and the Blech margin (good), but in a real circuit current is drive strength — cutting it costs speed (a price this model does not show).',
      },
      {
        ko: '동작 온도↓ → EM 수명↑(좋음) / 온도는 설계자가 고르는 값이 아니라 인접 블록의 자기발열이 정하는 값이다. 0.80 eV 에서 10 K 상승이 수명을 약 절반으로 만든다.',
        en: 'Lower temperature improves EM lifetime (good), but temperature is set by neighbouring self-heating, not chosen by the designer. At 0.80 eV a 10 K rise roughly halves the lifetime.',
      },
      {
        ko: 'CMP 하중·회전수↑ → 잔류 Cu 게이트 통과(좋음) / S200 실측 대역 위로 나가면 오버폴리시(나쁨). 🔴 디싱·에로전의 절대 깊이는 원장에 정량치가 없어 판정하지 않는다(M-19) — 방향만 배운다.',
        en: 'More load or speed clears the residual-Cu gate (good) but overshooting the measured band over-polishes (bad). Absolute dishing and erosion depths are not quantified in the ledger (M-19), so only the direction is taught.',
      },
    ],
  },
];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
