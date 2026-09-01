import type { LabChartBinding, LabParam, LabSceneBinding, LabSpec } from './spec';
import { quantity } from '../contract';
import { MM2_PER_CM2, PERCENT, SECONDS_PER_MINUTE } from '../physics/units';
import { WAFER_DIAMETER_CM } from './fixed';
import { EDS_PROCESS_ID } from '../physics/eds/rules';
import {
  ALPHA_DEFAULT, defectLevel, grossDiePerWafer, negativeBinomialYield,
  poissonApplicable, POISSON_AD_LIMIT, POISSON_AREA_LIMIT_CM2,
} from '../physics/eds/yieldModels';
import {
  contactForceCoefficient,
  nominalContactResistance, overdriveRangeMarginUm, probeContactForce, scrubMarkClearanceUm,
  OPERATIONAL_ASSUMPTION, OVERDRIVE_PRACTICE_RANGE_MIL, OVERDRIVE_PRACTICE_RANGE_UM,
  type NeedleMaterial,
} from '../physics/eds/probeOperations';
// 🔴 `1 mil = 25.4 µm` 의 정본은 물리층 EDS 단위 파일 하나다 — 여기서 다시 선언하지 않는다.
import { UM_PER_MIL } from '../physics/eds/units';

/**
 * P7 EDS(웨이퍼 테스트) 실습 3단계 — PLN `03_실습3단계명세.md` §P7 (S5·S6·S7) 배선.
 * 사슬: 슬라이더 → 물리층 → ①수치 ②합격/불합격 ③씬 ④오조작 피드백.
 * 🟢 **③씬 배선 완료(2026-08-22)** — 심화 칸에 `probeScrub`(침 끝–패드 µm) ＋ `waferMap`(웨이퍼 mm) **병치**.
 *    종전 「③씬은 없다」는 이 배선으로 해소됐다.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §0. 🔴 씬 없음 — `scene` 을 넣지 않는다
 * ════════════════════════════════════════════════════════════════════════════
 * DSN `12_시각화씬_공백보고.md` 기준 `eds` 대응 씬 **0 %**. 웨이퍼 맵·프로브 팁 단면·빈 색상
 * 범례는 기존 4개 씬(filmGrowth · plasma · ionTrajectory · polishProfile) 중 무엇과도 물리가
 * 다르다. 다른 공정 씬을 갖다 붙이지 않는다 — 하네스가 「내부 시각화 준비 중」을 정직하게 표시한다.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §1. 🔴 A15 / A15-op — 무엇을 물리층에서 가져왔고, 무엇을 여기 격리했나
 * ════════════════════════════════════════════════════════════════════════════
 * 오케스트레이터 승인(2026-08-20 · `10_P7_EDS_판정요청.md` §3)에 따라 출력을 두 부류로 나눈다.
 *
 * **A군 (수율·통계) — A15 그대로.** 전부 `physics/eds/**` 호출이다. 여기서 식을 쓰지 않는다.
 *   - 음이항 수율 `Y = (1+A·D₀/α)^(−α)`, α = 2 : `yieldModels.negativeBinomialYield` (S222 · S223)
 *   - 포아송 적용한계 `A ≤ 0.25 cm² 또는 A·D₀ < 1.0` : `yieldModels.poissonApplicable` (S220 §2·§5)
 *   - 웨이퍼당 다이 수 `N ≈ πd²/(4S) − πd/√(2S)` : `yieldModels.grossDiePerWafer` (S148)
 *   - 결함수준 `DL = 1 − Y^(1−T)` : `yieldModels.defectLevel` (S227)
 *
 * **B군 (운영 지표) — A15-op(op-2): 「범위 조회 · 기하 판정」.** 없는 식을 지어내지 않는다.
 *   - 오버드라이브 실무창 25–76 µm : `probeOperations.overdriveRangeMarginUm` (S229)
 *   - 접촉력 계수 g/mil OD        : `probeOperations.probeContactForce` (S229)
 *   - 접촉저항 공칭값 µΩ          : `probeOperations.nominalContactResistance` (S229)
 *   - 스크럽 마크 개구부 포함 여부 : `probeOperations.scrubMarkClearanceUm` (S229)
 *   이 네 함수는 `assumptions[0]` 에 `OPERATIONAL_ASSUMPTION`(「[운영규약] A15-op …」)을 싣는다.
 *   🔴 **그 표식을 지우거나 덮어쓰지 않는다** — 화면이 이것을 보고 물리식과 다른 배지를 단다.
 *   본 파일은 B군 출력을 **물리층 Quantity 그대로 반환**하므로 표식이 자동으로 보존된다.
 *
 * **등급 C(%GRR 10/30 % · Cpk 임계 1.33/1.67/2.00)는 판정에 쓰지 않았다**(op-3).
 *   S224(NIST)가 임계를 규정하지 않는다. 이 파일의 `judge` 출력 어디에도 그 숫자가 없다.
 *
 * **나머지 — PLN 「교육용 설정값」(D-008).** 문헌이 존재하지 않고 B군 조회 대상도 아닌 것
 *   (리던던시 이득 · 실효면적 오버헤드 · 가드밴드 언더킬/오버킬 · 다이당 테스트 시간 ·
 *    테스터 단가 · 니들 오염계수 · 병렬 누화)은 **`contract.ts` 의 `scoring` 층**에 해당한다.
 *   → 🔴 **물리층에 넣지 않고 이 파일 §3 에 격리**했다(`wafer.ts` 와 같은 처리).
 *      화면에서 등급 배지는 **등급 원장**(`src/content/model-grades.json`)의 `kind` 로 갈린다 —
 *    `literature` → `[문헌식]` + 「현업 검증(L2) 전」 고지, `synthetic` → `[경향모델]` + 합성 사유,
 *    `operational` → `[운영규약]`. 🔴 2026-08-20 이전에는 원장이 비어 **전 항목이 똑같이 `[경향모델]`**
 *    이었다(배지가 아무것도 가르지 못하던 결함). 그 서술로 되돌리지 마라.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §2. 🔴 기존 명세 판정값 3종 — 정정 결과
 * ════════════════════════════════════════════════════════════════════════════
 * | 기존 명세 | 정정 | 근거 |
 * |---|---|---|
 * | 스크럽 마크 **45.0 µm** 수치 규격 | **폐기.** `Dm < 60.0 µm`(개구부 포함 기하 판정) | S229 는 수치규격을 주지 않는다. 60 µm 는 이 시나리오 패드 60×60 µm 에서 PLN 이 유도한 값이다 |
 * | 오버드라이브 정답창 **90~105 µm** | **25~76 µm** (= 1–3 mil) | S229 실무범위. 기존 하한 90 이 문헌 상한 76 을 이미 넘었다 |
 * | 접촉저항 합격 **0.90 Ω** | **≤ 200 µΩ** (BeCu/Al 공칭) | S229 공칭 BeCu 100 µΩ(Au)/200 µΩ(Al) · W 250 µΩ. 기존 값과 3~4자릿수 차 |
 *
 * 🔴 이 정정의 파급 — **PLN 교육용식 `Rc = (0.30 + 45/OD)(1 + N_clean/20000)` [Ω] 과
 *    `Dm = 8 + 0.35·OD` [µm] 를 구현하지 않았다.** 두 식은 문헌에 없는 합성식이고, 물리층
 *    (`probeOperations.ts` 머리 주석)이 이미 같은 이유로 채택을 거부했다. 접촉저항 합격선을
 *    「문헌 공칭값으로 재설정」하라는 지시는 곧 **Ω 단위 응답식을 판정에서 뺀다**는 뜻이다.
 *    대신 S5·S7 의 접촉 판정은 **재질·패드 조회(µΩ)** 로, 마크 판정은 **개구부 포함 기하**로 옮겼다.
 *    → 스크럽 마크 장축은 계산 출력이 아니라 **패드 검사에서 읽는 실측 입력**으로 둔다.
 *      S229 의 요구조건 자체가 「측정된 마크가 개구부 안에 있는가」이므로 규격과 형태가 같다.
 *    → LO-P7-03 의 상충(OD↑ → 접촉 좋아짐 / 마크 커짐)은 **S229 가 실제로 주는 축**으로 유지했다:
 *      OD↑ → 접촉력↑(g/mil OD) · 실무창 이탈 위험↑, 재질 BeCu → 저항↓ 이지만 접촉력 계수↓.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §3. 🔴 포아송 → 음이항 전환과 그 부작용 — 비용 임계 재설정 스윕 근거
 * ════════════════════════════════════════════════════════════════════════════
 * **왜 전환하나.** 원 명세는 `A·D₀ ≤ 4` 구간까지 포아송 단독을 썼다. S220 §2·§5 의 적용한계는
 * `A ≤ 0.25 cm²` **또는** `A·D₀ < 1.0` 이다 — **한계의 4배를 초과**했다. 기본값 A = 200 mm²,
 * D₀ = 0.5 에서 이미 `A·D₀ = 1.00` 으로 경계이고, 슬라이더 최대 400 mm² 에서는 2.00 이다.
 *
 * **어떻게 전환했나 — `dieYield()` 자동전환을 쓰지 않고 음이항 단일 모델로 갔다.**
 *   `yieldModels.dieYield()` 는 한계 안이면 포아송, 밖이면 음이항으로 **자동 전환**한다. 그런데
 *   전환점에서 값이 **불연속으로 튄다**: A = 199 mm² → 포아송 0.3697, A = 201 mm² → 음이항 0.4430.
 *   즉 **다이 면적을 키웠는데 수율이 올라간다.** 기본값 200 mm² 가 바로 그 경계에 있어
 *   학습자가 A 를 200 → 195 로 내리면 수율이 0.4444 → 0.3789 로 **떨어지는** 장면을 본다.
 *   원래 부작용을 고치려다 더 나쁜 부작용(비단조·불연속)을 들여오는 것이므로 채택하지 않았다.
 *   → **전 구간 음이항 α = 2**(`negativeBinomialYield`, S222 식 12 · α 는 S223 ITRS 채택값)를 쓴다.
 *     이는 PLN 「공통 전제」의 `Y_raw = (1 + A·D₀/α)^(−α), α = 2` 와 **정확히 같다**.
 *   → **전환 사실은 출력에 명시한다**: 표시 출력 `adProduct`(A_eff·D₀)와 피드백 EDS6-F2/EDS7-F2 가
 *     「A·D₀ = {값} 이 포아송 적용한계 1.0 을 넘었다 → 음이항으로 계산한다」를 화면에 띄운다.
 *     한계 판정 자체는 물리층 `poissonApplicable()` 이 내린다(S220 §5).
 *
 * **부작용 — 비용 임계 120 원이 죽었다.** 음이항으로 수율이 오르며 기본값 비용이
 * 127.3 → **105.25 원**이 되어 임계 120 원을 **통과**한다. 「기본값에서 이미 합격」은 죽은 판정이다.
 *
 * **스윕 (`node` 격자 전수 · 2026-08-20 · DEV)**
 *   격자: T 0.500–0.999 step 0.001 (500) × A 10–400 mm² step 5 (79)
 *        × G 0–15 % step 1 (16) × R 0–16 step 1 (17) = **10,744,000 조합 전수**
 *   모델: §4 의 S6 계산식 그대로(음이항 α=2 · A_eff = A(1+0.003R) · DPW(S148) · DL(S227)).
 *   먼저 **DL ≤ 2000 ppm 이고 웨이퍼시간 ≤ 10.0 min** 인 조합만 남긴다 → **29,724 건**.
 *   그 29,724 건의 굿다이당 비용 분포:
 *     최저 **84.57 원** (T 0.993 · A 80 · G 7 · R 16) · p01 94.47 · p05 104.60 · p10 112.34
 *     p25 130.98 · 중앙값 165.95 · p75 218.68 · 최고 464.26 원
 *   임계 후보별 「3지표 동시합격」 조합 수:
 *     95원 → 339건 · 98원 → 610건 · **100원 → 833건** · 102원 → 1,091건 · 105원 → 1,556건
 *
 *   🔴 **고른 임계 = 100 원/개.** 이유 셋.
 *     ① **기본값이 확실히 불합격**한다 — 105.25 원으로 임계를 5.2 % 초과한다(경계 걸침이 아니다).
 *     ② **PLN 모범조합(T 0.996 · A 100 · G 8 · R 16)이 98.03 원으로 합격**한다(여유 2.0 %).
 *        명세가 제시한 정답이 그대로 정답이 되어야 문항·해설을 고치지 않아도 된다.
 *     ③ **합격 조합이 833건 실재**한다 — 도달 가능한 구간(A 80~110 mm² · R 14~16 · T 0.99대)이
 *        넓지 않아 「리던던시로 Y 를 올린 뒤 커버리지를 조정」이라는 학습 경로를 강제한다.
 *        DL·시간까지 만족하는 29,724 건 중 상위 2.8 % 로, 임계를 좁게 잡으라는 PLN 주문과 맞는다.
 *
 *   **검증 합격 조합(전부 3지표 동시 합격):**
 *     · T 0.996 · A 100 · G  8 · R 16 → DL 1,349 ppm · 8.64 min · **98.03 원** (PLN 모범조합)
 *     · T 0.993 · A  80 · G  7 · R 16 → DL 1,954 ppm · 9.94 min · **84.57 원** (최저비용)
 *     · T 0.992 · A  80 · G 12 · R 16 → DL 1,982 ppm · 9.77 min · **84.85 원**
 *     · T 0.993 · A  80 · G  8 · R 16 → DL 1,878 ppm · 9.94 min · **84.92 원**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §4. 죽은 판정 없음 — 3단계 전건
 * ════════════════════════════════════════════════════════════════════════════
 *  S5: 기본값(OD 100 · W · 마크 68 µm)에서 **판정 3개 전부 불합격**
 *      (여유 −24.0 µm · 250 µΩ · 여유 −4.0 µm) → (OD 50 · BeCu · 마크 40 µm)에서 전부 합격
 *      (여유 +25.0 µm · 200 µΩ · 여유 +10.0 µm).
 *  S6: 기본값(T 0.800 · A 200 · G 2 · R 0)에서 DL 151,207 ppm ✗ · 2.84 min ✓ · 105.25 원 ✗
 *      → 모범조합에서 1,349 ppm ✓ · 8.64 min ✓ · 98.03 원 ✓. (웨이퍼시간은 A 40·T 0.999 에서
 *      25.7 min 로 불합격에 도달하므로 양방향 살아 있다.)
 *  S7: 기본값(DS-1 니들오염 활성 · OD 130 · W · 마크 68 · T 0.800 · A 30 · D₀ 0.60 · G 5 ·
 *      R 4 · P 1 · 클리닝 미실행)에서 **판정 6개 전부 불합격**
 *      (여유 −54.0 µm · 여유 −4.0 µm · 875 µΩ · 31,863 ppm · Y_obs 0.0418 · 4.20 wph)
 *      → (클리닝 실행 · OD 50 · BeCu · 마크 40 · T 0.996 · A 100 · D₀ 0.30 · G 6 · R 16 · P 2)
 *      에서 **6개 전부 합격** (+25.0 µm · +10.0 µm · 200 µΩ · 1,123 ppm · 0.8063 · 11.28 wph).
 *
 *  S7 합격 조합 존재 확인(별도 스윕):
 *    · 프로브측(OD 20–150 step 5 × 재질 3 × 마크 10–90 step 1 × 클리닝 0/1 = 13,122) → **561 건 합격**
 *      (합격 조건: OD 25~76 µm · 마크 ≤ 60 µm · 클리닝 실행 + BeCu — 즉 세 축이 모두 맞아야 한다)
 *    · 수율측(프로브측을 모범값에 고정하고 T × A × D₀ × G × R × P = 214,880,000 전수)
 *      → **15,376,756 건 합격.** 수율측은 넉넉하고 **프로브측이 병목**이다 — 진단·복구가 먼저라는
 *      이 실습의 학습 순서(외란 DS-1 을 못 잡으면 뒤 지표를 아무리 만져도 통과 못 한다)와 일치한다.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §5. 🔴 명세에서 뺀 것 (사유 포함 · DEV 보고 항목)
 * ════════════════════════════════════════════════════════════════════════════
 *  1. **척 온도 T_chuck 와 검출 가중 w(−25→0.92 / 25→0.85 / 85→1.00 / 125→0.98).**
 *     문헌 근거가 없는 4점 표 + 선형 보간이고, 열팽창 보정 0.10 µm/°C 도 출처가 없다.
 *     A6 를 지키려면 S번호를 달아야 하는데 원장에 해당 항목이 없다 → 기능째로 뺐다(원장 규칙 10).
 *  2. **니들 클리닝 주기 N_clean 슬라이더와 `UPH = 60 − 12000/N_clean`.**
 *     Rc 응답식(§2)을 뺀 이상 N_clean 이 어느 출력에도 문헌 경로로 닿지 않는다. 오염은 S7 에서
 *     **외란 DS-1 의 유무(즉시 클리닝 버튼)** 로만 다룬다.
 *  3. **외란 DS-2(온도 드리프트) · DS-3(카드 틸트).** DS-2 는 1 에 종속되어 빠졌다. DS-3 은
 *     웨이퍼 좌·우 반달 클러스터를 보여야 하는데 **씬이 없어**(§0) 진단 단서가 화면에 나오지 않는다.
 *     단서 없이 진단을 요구하는 것은 찍기가 되므로 넣지 않았다. 씬 확보 후 되살린다.
 *  4. **빈(bin) 색상 범례 · 웨이퍼 맵.** 씬 부재(§0).
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 A6 — 모든 `LabParam` 에 `sourceId` 또는 `basis` 를 단다(`check-labs.mjs` 강제).
 *    원장에 S번호가 있는 범위에는 `sourceId` 를, 시나리오에서 유도했거나 PLN 교육용 설정값인
 *    범위에는 `basis` 로 유도 근거를 문장으로 남긴다. **근거 없는 범위에 가짜 S번호를 달지 않는다.**
 */
const params = (list: LabParam[]): LabParam[] => list;

/* ═══════════════ §합성모델 — 교육용 설정값 (A6-b · scoring 층) ═══════════════
 * 아래 계수는 전부 PLN `03_실습3단계명세.md` §P7 머리말의 「공통 상수(교육용 설정값)」 목록이다.
 * 문헌값이 아니며 실제 팹의 값과 다르다(D-008). 물리층에 넣으면 A15 위반이라 여기 격리한다.
 * 화면에는 `경향모델` 배지와 「실측값으로 신뢰하지 마십시오」 고지가 함께 나간다.
 */

/* 웨이퍼 지름 300 mm 는 P5 증착과 공유하는 고정 조건이라 `./fixed` 가 정본이다(DPW 수식은 S148 물리층). */
/** S5·S6 고정 결함밀도 [ea/cm²]. S7 은 슬라이더로 연다. */
const DEFECT_DENSITY_PER_CM2 = 0.5;
/** 웨이퍼당 로딩·정렬·언로딩 오버헤드 [s]. */
const WAFER_OVERHEAD_S = 60;
/** 테스터 시간당 운영 단가 [원/h]. */
const TESTER_KRW_PER_HOUR = 300000;
/** 시간 환산 — 초/시. 초/분은 `../physics/units.ts` 의 `SECONDS_PER_MINUTE` 가 정본이다. */
const SECONDS_PER_HOUR = 3600;
/** 🔴 처리량의 **구조적 상한** [웨이퍼/h] — 지어낸 값이 아니라 유도값이다.
 *  웨이퍼당 시간 = (다이 테스트 시간 합) / 병렬수 + 오버헤드 이고 앞항은 항상 0 이상이므로
 *  웨이퍼당 시간은 오버헤드 아래로 내려갈 수 없다 → 처리량 ≤ 3600 / 오버헤드.
 *  `throughputWph` 의 합격창이 `{ min }` 편측이라 **열린 쪽(위)** 을 정의역이 닫아야 한다. */
const THROUGHPUT_CEILING_WPH = SECONDS_PER_HOUR / WAFER_OVERHEAD_S;
const PPM = 1e6;

/** 다이당 테스트 시간 `t_die = 0.20·(1 + 0.5·ln(1/(1−T)))` [s]. */
const TDIE_BASE_S = 0.20;
const TDIE_LOG_WEIGHT = 0.5;
/** 가드밴드 언더킬 `UK(ppm) = 3000·exp(−0.35·G)`. */
const UNDERKILL_BASE_PPM = 3000;
const UNDERKILL_DECAY_PER_PCT = 0.35;
/** 가드밴드 오버킬 `OK(비율) = 0.004·G` — 버려지는 양품 비율. */
const OVERKILL_PER_PCT = 0.004;
/** 리던던시 리페어 이득 `min(0.02·R, 0.32)` — 불량 다이의 최대 32 %까지 살린다. */
const REPAIR_PER_LINE = 0.02;
const REPAIR_CAP = 0.32;
/** 여분 라인의 실효 다이 면적 오버헤드 `A_eff = A·(1 + 0.003·R)` (R=16 → +4.8 %). */
const AREA_OVERHEAD_PER_LINE = 0.003;
/*
 * 🔴 `MM2_PER_CM2`(mm²→cm²)와 `PERCENT`(배수 100)는 **여기서 선언하지 않는다** —
 * `../physics/units.ts` 가 정본이고 위에서 import 한다(`check-constants` R1).
 *
 * 🔴 **`PERCENT` 자리에 `MM2_PER_CM2` 를 재사용하지 마라.**
 * 2026-08-20 인계 조사에서 적발: 백분율 자리에 면적 환산 상수 `MM2_PER_CM2`(mm²/cm²)가 쓰이고 있었다.
 * 값은 둘 다 100 이라 결과는 맞았지만 **단위 의미가 틀렸고**, 누가 `MM2_PER_CM2` 를 손대면
 * 수율·불량률이 조용히 깨진다. 이름이 거짓말을 하는 상수는 언젠가 사고를 낸다.
 */


/** 🔴 S7 외란 DS-1 — 니들 오염(Al 잔재 누적) 시 접촉저항 배수. */
const CONTAMINATION_FACTOR = 3.5;
/** 🔴 즉시 클리닝 ⓐ 의 웨이퍼당 오버헤드 [s].
 *  PLN 은 ⓐ 에 오버헤드를 적지 않았다(ⓑ +30 s · ⓒ +45 s 만). 공짜 버튼은 죽은 입력이 되므로
 *  ⓑ 와 같은 +30 s 를 적용하고 **교육용 설정값임을 여기 명시**한다. */
const CLEAN_OVERHEAD_S = 30;
/** 가짜 불량률 `F_false = min(0.95, 0.6·max(0, R_c/R_spec − 1) + 0.002·(P−1))`.
 *  PLN 원식은 Ω 단위 Rc 를 썼다(§2 에서 폐기). **공칭 대비 배수**로 옮겨 같은 거동을 유지한다. */
const FALSE_FAIL_CAP = 0.95;
const FALSE_FAIL_PER_RATIO = 0.6;
const FALSE_FAIL_PER_PARALLEL = 0.002;

/** 이 파일의 합성 계수가 문헌값이 아님을 출력마다 붙이는 고지. */
const SYNTHETIC_NOTE =
  '🔴 이 출력의 계수(다이당 테스트 시간·오버헤드·테스터 단가·가드밴드·리던던시)는 문헌값이 아니라 '
  + 'PLN 교육용 설정값이다(D-008). 문헌에서 온 것은 수율(S222·S223)·다이 수(S148)·결함수준(S227)뿐이다.';

/* ═══════════════ §B군 조회 상수 — 전부 물리층에서 읽어 온다 ═══════════════ */

/** 니들 재질 3택. 슬라이더 정수 인덱스 → S229 등재 재질. */
const NEEDLE_MATERIALS: readonly NeedleMaterial[] = ['W', 'W-Re', 'BeCu'];
/** 시나리오 고정 조건 — Al 패드(웨이퍼 프로빙 표준). */
const PAD_METAL = 'Al' as const;

/**
 * 🔴 접촉저항 합격선 = **문헌 공칭값 자체**를 읽어 쓴다. 숫자를 여기 적지 않는다.
 * `nominalContactResistance({BeCu, Al})` = 200 µΩ (S229). W·W-Re 는 250 µΩ 이라 불합격이 된다.
 * 「0.90 Ω」을 대신하는 정정값이며, 학습자에게는 **문항 조건**으로 제시된다(op-3 와 같은 처리).
 */
const CONTACT_SPEC_UOHM = nominalContactResistance({ material: 'BeCu', pad: PAD_METAL }).value;

const [OD_LO_UM, OD_HI_UM] = OVERDRIVE_PRACTICE_RANGE_UM;
/**
 * 🔴 **인쇄된 mil 상한(3 mil)** 이다. 정의역이 아니라 **게이지 축**으로만 쓴다
 * (`EDS_FORCE_MAX_G` = 2.5 g/mil × 3 mil = 7.5 g). 입력 검사는 물리층이
 * `OVERDRIVE_MIL_DOMAIN`(µm 정본에서 파생)으로 따로 한다.
 * 하한 `OD_LO_MIL` 은 이제 쓰이는 곳이 없어 꺼내지 않는다 — 종전의 두 정박점 보간이 쓰던 값이다.
 */
const [, OD_HI_MIL] = OVERDRIVE_PRACTICE_RANGE_MIL;

/**
 * 패시베이션 개구부 [µm]. 🔴 **없는 규격 45 µm 를 대신하는 값이다.**
 * S229 는 수치규격을 주지 않고 「최대 오버드라이브에서 개구부 내」라는 기하 조건만 준다.
 * 이 시나리오의 패드가 **60 × 60 µm** 이므로 개구부 변이 60 µm 다 — 지어낸 숫자가 아니라
 * 시나리오 자신의 치수다(PLN 확정 2026-08-20). 판정은 `Dm < 60.0` 과 정확히 같아진다.
 */
const PASSIVATION_OPENING_UM = 60;

/* ═══════════════ 차트 축 · 스윕 ═══════════════ */

/** 🔴 커버리지 슬라이더 범위. **차트 스윕이 슬라이더와 같은 구간을 훑도록** 상수 하나로 묶는다 —
 *  두 곳에 숫자를 적으면 슬라이더를 넓힐 때 차트만 옛 구간에 남는다. S6·S7 두 칸이 같은 범위다. */
const COVERAGE_RANGE: readonly [number, number] = [0.500, 0.999];
/** 커버리지 스윕 표본수. 곡선이 T → 1 부근에서 급강하하므로 60 구간이면 꺾임이 보인다. */
const COVERAGE_CHART_STEPS = 60;
/**
 * 🔴 DL 차트 세로축 상한 = **합격 임계의 2배**. 확대하지 않으면 판정이 보이지 않는다 —
 *  DL 도달 범위는 S6 에서 50.6 ~ 503,000 ppm 이라 합격선 2,000 ppm 이 축 바닥 0.4 % 에 붙는다
 *  (PLN 차트 판정 `threads/parts/차트-P7-eds.md` §1). 임계의 2배로 잡으면 합격선이 정확히
 *  세로 한가운데에 서고, 위쪽 절반이 「얼마나 못 미치는가」를 보여준다.
 *  🔴 합격 임계 자체는 여기서 건드리지 않는다(D-041 · PLN 소관) — 임계에서 **파생**만 시킨다.
 */
const DL_CHART_Y_MAX_FACTOR = 2;

/* ═══════════════ 합격창 ═══════════════ */

/** S6 — PLN 명세 그대로. */
const S6_DL_MAX_PPM = 2000;
const S6_WAFER_TIME_MAX_MIN = 10.0;
/** 🔴 S6 비용 임계 — §3 스윕으로 **120 → 100 원/개** 재설정. provisional 해소. */
const S6_COST_MAX_KRW = 100;

/** S7 — PLN 명세 그대로. */
const S7_DL_MAX_PPM = 1500;
const S7_OBSERVED_YIELD_MIN = 0.800;
const S7_THROUGHPUT_MIN_WPH = 8.0;

/* ═══════════════ 공용 계산 — 물리층 호출 + 교육용 설정값 조립 ═══════════════ */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * µm → mil. 🔴 **`1 mil = 25.4 µm`(1959 국제 인치 정의) 하나로 환산한다.**
 *
 * 🔴 **종전의 두 정박점 보간을 폐기했다**(DEV 정정 2026-08-22 · PLN 판정 근거).
 *    종전 식은 (25 µm → 1 mil)·(76 µm → 3 mil)을 직선으로 이어 **실효 25.5 µm/mil** 을 썼다.
 *    그런데 S229 의 원문 표기는 **mil(1–3)** 이고 **25–76 µm 는 그것을 환산해 인쇄한 값**이다
 *    (`3 × 25.4 = 76.2` 를 정수로 끊은 것이 76). 즉 두 정박점은 **서로 독립한 두 실측점이 아니라
 *    같은 한 진술의 두 인쇄**이고, 그 둘을 잇는 직선은 **인쇄 반올림(0.2 µm)을 기울기로 만든 것**이다.
 *    단위 환산은 정의라 기울기가 하나뿐인데, 그 하나를 반올림 오차로 0.4 % 비틀고 있었다.
 *
 * 🔴 실무창 밖은 S229 **계수(g/mil)의 유효범위 밖**이므로 경계로 고정한다 — 외삽하지 않는다.
 *    고정 여부를 `pinned` 로 함께 돌려주는 것은 화면 때문이다: 접촉력은 `display` 출력이라
 *    고정된 숫자가 실측처럼 읽힌다. 고정됐을 때만 `assumptions` 에 고지 한 줄이 붙는다.
 *
 * 🔴 **export 하는 이유는 테스트가 환산을 직접 못박기 위해서다**(`tests/unit/eds-mil-conversion.test.ts`).
 *    화면·다른 랩이 쓰라고 연 것이 아니다 — `1 mil = 25.4 µm` 의 정본은 `physics/eds/units.ts` 다.
 */
export function overdriveToMil(overdriveUm: number): { mil: number; pinned: boolean } {
  const inRange = clamp(overdriveUm, OD_LO_UM, OD_HI_UM);
  return { mil: inRange / UM_PER_MIL, pinned: inRange !== overdriveUm };
}

/** `probeContactForce` 인자 조립 — 환산값과 「경계 고정됨」 신고를 함께 넘긴다. */
const odMil = (overdriveUm: number): { overdriveMil: number; pinnedToPracticeWindow: boolean } => {
  const { mil, pinned } = overdriveToMil(overdriveUm);
  return { overdriveMil: mil, pinnedToPracticeWindow: pinned };
};

const needleOf = (index: number): NeedleMaterial =>
  NEEDLE_MATERIALS[clamp(Math.round(index), 0, NEEDLE_MATERIALS.length - 1)] as NeedleMaterial;

/** 실효 다이 면적 [cm²] — 여분 라인이 먹는 면적을 되먹인다(PLN 정정 2026-08-20). */
const effectiveAreaCm2 = (dieAreaMm2: number, redundancy: number): number =>
  (dieAreaMm2 * (1 + AREA_OVERHEAD_PER_LINE * redundancy)) / MM2_PER_CM2;

/** 리페어 반영 수율. 원 수율은 **물리층 음이항**에서 온다. */
const repaired = (rawYield: number, redundancy: number): number =>
  rawYield + (1 - rawYield) * Math.min(REPAIR_PER_LINE * redundancy, REPAIR_CAP);

/** 다이당 테스트 시간 [s]. */
const tDieSeconds = (coverage: number): number =>
  TDIE_BASE_S * (1 + TDIE_LOG_WEIGHT * Math.log(1 / (1 - coverage)));

const underkillPpm = (guardbandPct: number): number =>
  UNDERKILL_BASE_PPM * Math.exp(-UNDERKILL_DECAY_PER_PCT * guardbandPct);

const overkillFraction = (guardbandPct: number): number => OVERKILL_PER_PCT * guardbandPct;

/** 스크럽 마크 여유 [µm]. 개구부가 정사각형이라 장축이 구속 조건이다 —
 *  단축을 별도 입력으로 두지 않고 장축과 같게(보수적으로) 넣어도 판정 결과가 **동일**하다. */
function scrubClearance(markLengthUm: number) {
  return scrubMarkClearanceUm({
    markLengthUm,
    markWidthUm: markLengthUm,
    offsetXUm: 0,
    offsetYUm: 0,
    openingWidthUm: PASSIVATION_OPENING_UM,
    openingHeightUm: PASSIVATION_OPENING_UM,
  });
}

/* ═══════════════ 차트·판정 공용 함수 ═══════════════
 * 🔴 `LabChartBinding.build()` 계약: 「여기서 물리식을 새로 쓰지 마라」(`spec.ts`).
 *    그래서 차트가 그리는 곡선과 `compute()` 가 판정하는 값은 **아래 함수 하나**에서 나온다.
 *    두 벌로 적으면 갈라지고, 갈라지는 순간 차트는 「판정을 보여준다」고 거짓말을 하게 된다.
 */

/** 출하 결함 수준 [ppm] — 물리층 DL(S227) + 교육용 가드밴드 언더킬. S6·S7 공용(D₀ 만 다르다). */
function shippedDefectLevelPpm(a: {
  coverage: number; dieAreaMm2: number; defectDensityPerCm2: number;
  guardbandPct: number; redundancy: number;
}): number {
  const areaCm2 = effectiveAreaCm2(a.dieAreaMm2, a.redundancy);
  const raw = negativeBinomialYield({ areaCm2, defectDensityPerCm2: a.defectDensityPerCm2 }); // S222 · α=2(S223)
  const y = repaired(raw.value, a.redundancy);
  const dl = defectLevel({ dieYield: y, coverage: a.coverage }); // S227
  return dl.value * PPM + underkillPpm(a.guardbandPct);
}

/** S6 웨이퍼 1장 테스트 시간 [s]. 비용도 이 값에서 나오므로 `compute()` 가 그대로 쓴다. */
function s6WaferSeconds(coverage: number, dieAreaMm2: number, redundancy: number): number {
  const areaCm2 = effectiveAreaCm2(dieAreaMm2, redundancy);
  const gross = grossDiePerWafer({ diameterCm: WAFER_DIAMETER_CM, dieAreaCm2: areaCm2 }); // S148
  return gross.value * tDieSeconds(coverage) + WAFER_OVERHEAD_S;
}

/** 커버리지 스윕 격자 — 슬라이더와 같은 구간을 훑는다. */
function coverageGrid(): number[] {
  const out: number[] = [];
  for (let i = 0; i <= COVERAGE_CHART_STEPS; i++) {
    out.push(COVERAGE_RANGE[0] + (i / COVERAGE_CHART_STEPS) * (COVERAGE_RANGE[1] - COVERAGE_RANGE[0]));
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════ 차트 팩터리 (2026-08-22 · W6-6 해소) ═══════════════
 * 🔴 **차트 리터럴을 `LabSpec` 객체 안에 직접 쓰지 않는다.** 저장소 관례이자 게이트 요건이다 —
 *    `check-labs.mjs` 항목 6 은 칸 구간의 `tone:` 을 **feedback tone** 으로 읽는데
 *    `LabChartRefLine.tone` 은 `'spec' | 'info'` 라 구간 안에 있으면 **오탐으로 실패**한다
 *    (그 파일 200–212행이 이 함정을 명시해 두었다). `photo.ts`·`oxidation.ts`·`wafer.ts` 가
 *    전부 모듈 수준 팩터리 함수로 빼 둔 이유가 이것이다. 2026-08-22 실측으로 재확인했다.
 */

function edsAppliedCharts(): LabChartBinding[] {
  return [
      {
        id: 'eds.s6.defectLevelCoverage',
        kind: 'line',
        ko: '커버리지 스윕 — 출하 결함 수준 (합격창 확대)',
        en: 'Coverage sweep — shipped defect level (spec window zoomed)',
        judgesOutputs: ['defectLevelPpm'],
        xKo: '테스트 커버리지 T', xEn: 'Test coverage',
        yKo: '출하 결함 수준 DL_total', yEn: 'Shipped defect level', yUnit: 'ppm',
        xDomain: [COVERAGE_RANGE[0], COVERAGE_RANGE[1]],
        yDomain: [0, DL_CHART_Y_MAX_FACTOR * S6_DL_MAX_PPM],
        refLines: [
          { value: S6_DL_MAX_PPM, ko: '합격 상한 2,000 ppm', en: 'Spec upper 2,000 ppm', tone: 'spec' },
        ],
        captionKo: '커버리지를 올려도 결함 수준은 거의 내려오지 않다가 T 가 1 에 가까워지는 마지막 구간에서 절벽처럼 떨어집니다. 세로축은 합격선의 2배(4,000 ppm)까지만 확대했습니다 — 실제 도달 범위는 50 ~ 503,000 ppm 이라 확대하지 않으면 합격선이 축 바닥 0.4 % 에 붙어 합격·불합격이 눈으로 구분되지 않습니다. 화면 위로 잘려 나간 구간은 「합격선의 두 배보다도 나쁘다」는 뜻입니다.',
        captionEn: 'Raising coverage barely moves the defect level until T approaches 1, where it falls off a cliff. The vertical axis is zoomed to twice the spec line (4,000 ppm): the real reachable range is 50 to 503,000 ppm, so without the zoom the spec line sits at 0.4 % of the axis and pass/fail cannot be told apart. Anything clipped above the frame is worse than twice the spec.',
        note: '곡선은 현재 다이 면적 A · 가드밴드 G · 리던던시 R 을 고정한 채 커버리지만 슬라이더 구간 전체로 훑은 것이며, `compute()` 가 판정에 쓰는 함수(`shippedDefectLevelPpm`)와 **같은 함수 하나**로 그립니다. 세로 점선은 현재 커버리지 위치입니다. 세로축 상한은 합격 임계에서 파생한 값(2배)이며 임계 자체는 건드리지 않았습니다(D-041).',
        build: (inputs, outputs) => {
          const coverage = inputs['coverage'] ?? 0.800;
          const dieAreaMm2 = inputs['dieAreaMm2'] ?? 200;
          const guardbandPct = inputs['guardbandPct'] ?? 0;
          const redundancy = inputs['redundancy'] ?? 0;
          const at = (t: number): number => shippedDefectLevelPpm({
            coverage: t, dieAreaMm2, defectDensityPerCm2: DEFECT_DENSITY_PER_CM2, guardbandPct, redundancy,
          });
          return [
            {
              id: 'dlCurve',
              ko: `DL(T) · A = ${dieAreaMm2} mm² · G = ${guardbandPct} % · R = ${redundancy}`,
              en: `DL(T) at A = ${dieAreaMm2} mm², G = ${guardbandPct} %, R = ${redundancy}`,
              points: coverageGrid().map((t) => ({ x: t, y: at(t) })),
            },
            {
              id: 'operating',
              ko: '현재 커버리지',
              en: 'Current coverage',
              points: [{ x: coverage, y: 0 }, { x: coverage, y: outputs['defectLevelPpm'] ?? at(coverage) }],
              dashed: true,
            },
          ];
        },
      },
      {
        id: 'eds.s6.waferTimeCoverage',
        kind: 'line',
        ko: '커버리지 스윕 — 웨이퍼 1장 테스트 시간 (같은 가로축)',
        en: 'Coverage sweep — test time per wafer (same x-axis)',
        judgesOutputs: ['waferTestMin'],
        xKo: '테스트 커버리지 T', xEn: 'Test coverage',
        yKo: '웨이퍼 1장 테스트 시간', yEn: 'Test time per wafer', yUnit: 'min',
        xDomain: [COVERAGE_RANGE[0], COVERAGE_RANGE[1]],
        refLines: [
          { value: S6_WAFER_TIME_MAX_MIN, ko: '합격 상한 10.0 min', en: 'Spec upper 10.0 min', tone: 'spec' },
        ],
        captionKo: '위 결함 차트와 가로축이 같습니다 — 두 그림을 위아래로 겹쳐 보면 상충이 그대로 보입니다. 결함을 합격선 아래로 끌어내리는 커버리지 구간이 곧 테스트 시간을 합격선 위로 밀어 올리는 구간입니다. 다이당 테스트 시간이 ln(1/(1−T)) 로 늘기 때문입니다.',
        captionEn: 'This panel shares its x-axis with the defect chart above — stack the two and the trade-off is immediate. The coverage band that drags defects below their spec line is the same band that pushes test time above its own, because per-die test time grows as ln(1/(1-T)).',
        note: '🔴 세로축을 고정 확대하지 않았습니다. 도달 시간은 다이 면적에 따라 1.6 ~ 103 min 로 60배 넘게 변해 어떤 고정 축을 잡아도 다른 면적에서 곡선이 화면 밖으로 나갑니다. 대신 합격선 10.0 min 을 규격선으로 함께 넘겨 축이 자동으로 그 선을 포함하도록 했습니다. 곡선은 `compute()` 가 판정에 쓰는 `s6WaferSeconds()` 와 같은 함수입니다.',
        build: (inputs, outputs) => {
          const coverage = inputs['coverage'] ?? 0.800;
          const dieAreaMm2 = inputs['dieAreaMm2'] ?? 200;
          const redundancy = inputs['redundancy'] ?? 0;
          const at = (t: number): number => s6WaferSeconds(t, dieAreaMm2, redundancy) / SECONDS_PER_MINUTE;
          return [
            {
              id: 'timeCurve',
              ko: `테스트 시간(T) · A = ${dieAreaMm2} mm² · R = ${redundancy}`,
              en: `Test time(T) at A = ${dieAreaMm2} mm², R = ${redundancy}`,
              points: coverageGrid().map((t) => ({ x: t, y: at(t) })),
            },
            {
              id: 'operating',
              ko: '현재 커버리지',
              en: 'Current coverage',
              points: [{ x: coverage, y: 0 }, { x: coverage, y: outputs['waferTestMin'] ?? at(coverage) }],
              dashed: true,
            },
          ];
        },
      },
  ];
}

/* ═══════════════ 씬 배선 (2026-08-22 신설 · DSN 세션6 §E'-1 ~ §E'-3) ═══════════════
 *
 * 🔴 **왜 만들었는가 — 게이트 점수가 아니다.** `eds` 는 8공정 중 **화면이 하나도 없는 두 공정**
 *    중 하나였다(다른 하나는 `packaging`). 학습자가 숫자만 봤다. `contactForceG`·`scrubClearanceUm`·
 *    `overdriveMarginUm`·`rawYield` 는 차트도 씬도 없이 **숫자로만** 나왔다.
 *
 * 🔴 **씬 2개를 병치한다**(`deposition/lab-advanced` 선례). 한 씬에 뷰 하나라는 규율 때문이다 —
 *    왼쪽 `probeScrub` 은 **침 끝–패드(µm)** 척도, 오른쪽 `waferMap` 은 **웨이퍼–다이(mm)** 척도다.
 *    `이미지/씬명세/scene_probeScrub.md` §2-B 가 웨이퍼 맵을 그 씬에서 기각하며 **별도 씬**을
 *    지목했고, 이 배선이 그 판정을 집행한다.
 *
 * 🔴 **정규화 상수는 전부 이 파일에 이미 있는 값에서 파생한다.** 리터럴로 적지 않는다.
 *    계층 규칙상 `src/models` 는 `src/viz` 를 import 할 수 없어서(check-layering) 씬 모델의
 *    `PS_*`/`WM_*` 상수를 직접 가져오지 못한다. **갈라지면 조용히 낡으므로**
 *    `tests/unit/eds-scene-mapping.test.ts` 가 양쪽을 import 해 일치를 단언한다
 *    (`deposition.ts` 의 `ALD_SCENE_TEMP_WINDOW` 와 같은 관례).
 */

/** 스크럽 마크 장축 슬라이더 정의역 [µm] — 심화 칸 `markLengthUm` 의 min/max. */
export const EDS_MARK_LENGTH_RANGE_UM: readonly [number, number] = [10, 90];
/** 오버드라이브 슬라이더 정의역 [µm] — 심화 칸 `overdriveUm` 의 min/max. */
export const EDS_OD_SLIDER_RANGE_UM: readonly [number, number] = [20, 150];

/**
 * `scrubClearanceUm` 의 도달 구간 [µm].
 * 개구부가 60 µm 정사각형이고 오프셋 0 · `markWidth = markLength` 라 네 변 여유가 전부 같다
 * → 여유 = 개구부반변 − 마크반변 = 30 − L/2. L 정의역 [10, 90] 을 넣으면 [−15, +25] 다.
 */
export const EDS_CLEARANCE_MIN_UM = PASSIVATION_OPENING_UM / 2 - EDS_MARK_LENGTH_RANGE_UM[1] / 2;
export const EDS_CLEARANCE_MAX_UM = PASSIVATION_OPENING_UM / 2 - EDS_MARK_LENGTH_RANGE_UM[0] / 2;

/**
 * `overdriveMarginUm` 의 도달 구간 [µm]. margin = min(OD − 25, 76 − OD) 이므로
 * 최솟값은 OD 상한(150)에서 76 − 150 = −74, 최댓값은 실무창 절반폭 (76 − 25)/2 = +25.5 다
 * (= `overdriveRangeMarginUm().validRange[1]`).
 */
export const EDS_OD_MARGIN_MIN_UM = OD_HI_UM - EDS_OD_SLIDER_RANGE_UM[1];
export const EDS_OD_MARGIN_MAX_UM = (OD_HI_UM - OD_LO_UM) / 2;

/** `contactForceG` 의 상한 [g] = W 계수 상한 2.5 g/mil × 실무창 상한 3 mil (S229). */
export const EDS_FORCE_MAX_G = contactForceCoefficient('W').max * OD_HI_MIL;

/**
 * DL 게이지의 로그 축 [ppm]. 상한은 `defectLevelPpm` 의 정의역 상한(1e6 = `PPM`),
 * 하한 10 은 실도달 최소 19.298 ppm **바로 아래 decade** 다 — 축이 실측을 자르지 않는다.
 */
export const EDS_DL_MIN_PPM = 10;
export const EDS_DL_MAX_PPM = PPM;
export const EDS_DL_DECADES = Math.log10(EDS_DL_MAX_PPM / EDS_DL_MIN_PPM);

/** 웨이퍼 격자 한 변 칸 수 상한 — 씬 배치값(`waferMap` 의 `WM_CELLS_MAX` 와 같아야 한다). */
export const EDS_WAFER_CELLS_MAX = 34;

const clamp01 = (v: number): number => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/**
 * 🔴 **부호 있는 양 전용 정규화** — `(v − lo)/(hi − lo)`.
 * `deposition.ts` 의 「절편을 만들지 마라」 관례는 **0 이 물리적 원점**인 양(0 사이클 → 막 없음)에
 * 대한 것이다. 여유 두 종은 **0 이 합격선**이고 음수가 실재하므로, 원점을 옮기지 않으면
 * 불합격 영역을 아예 그릴 수 없다. 0 이 화면의 어디에 오는지는 아래 테스트가 못박는다:
 *   clearance 0 µm → 0.37500 (= 15/40) · odMargin 0 µm → 0.74372 (= 74/99.5)
 */
const unitFromSigned = (v: number, lo: number, hi: number): number => clamp01((v - lo) / (hi - lo));

/**
 * 왼쪽 씬 `probeScrub` — 침 끝–패드(µm) 척도.
 * 🔴 **지정 3출력을 `out` 에서 읽는다.** 씬 안에서 파생하면 랩의 계산과 화면이 두 벌이 되고,
 *    갈라지는 순간 화면이 판정과 다른 말을 한다(이온주입 산란폭 결함과 같은 구조).
 */
const probeScrubMap: LabSceneBinding['map'] = (i, out) => ({
  clearance: unitFromSigned(out['scrubClearanceUm'] ?? 0, EDS_CLEARANCE_MIN_UM, EDS_CLEARANCE_MAX_UM),
  odMargin: unitFromSigned(out['overdriveMarginUm'] ?? 0, EDS_OD_MARGIN_MIN_UM, EDS_OD_MARGIN_MAX_UM),
  force: clamp01((out['contactForceG'] ?? 0) / EDS_FORCE_MAX_G),
  forceCeil: clamp01(
    (contactForceCoefficient(needleOf(i['needleMaterialIndex'] ?? 0)).max * OD_HI_MIL) / EDS_FORCE_MAX_G,
  ),
  overdrive: clamp01(
    ((i['overdriveUm'] ?? EDS_OD_SLIDER_RANGE_UM[0]) - EDS_OD_SLIDER_RANGE_UM[0])
      / (EDS_OD_SLIDER_RANGE_UM[1] - EDS_OD_SLIDER_RANGE_UM[0]),
  ),
});

const PROBE_SCRUB_NOTE =
  '왼쪽은 프로브 침과 본드 패드입니다. 바깥 사각형이 패시베이션 개구부 60 × 60 µm 이고 안쪽 사각형이 '
  + '스크럽 마크입니다 — 마크가 개구부를 넘으면 여유가 음수입니다(S229 는 수치규격이 아니라 「개구부 내」라는 '
  + '기하 조건만 줍니다). 가운데 가로축은 오버드라이브이고 굵은 구간이 실무창 25–76 µm 입니다. '
  + '🔴 빗금 구간에서는 접촉력이 문헌 계수의 유효범위를 벗어나 경계값으로 고정됩니다 — 값이 멈춘 것이 아니라 '
  + '표가 거기까지만 있습니다. 아래 가로축은 접촉력이고 짧은 눈금이 현재 니들 재질의 상한입니다. '
  + '🔴 니들이 휘는 모습은 그리지 않습니다 — 캔틸레버 강성(N/m)이 문헌에도 코드에도 없어 힘을 변위로 바꿀 수 없습니다.';

/**
 * 오른쪽 씬 `waferMap` — 웨이퍼–다이(mm) 척도.
 * 🔴 첫 인자를 `_i` 로 둔다. 이 씬은 **입력을 전혀 안 읽는다** — 전부 출력에서 온다.
 */
const waferMapMap: LabSceneBinding['map'] = (_i, out) => ({
  rawYield: clamp01(out['rawYield'] ?? 0),
  defectLevel: clamp01(
    (Math.log10(clamp(out['defectLevelPpm'] ?? EDS_DL_MIN_PPM, EDS_DL_MIN_PPM, EDS_DL_MAX_PPM))
      - Math.log10(EDS_DL_MIN_PPM)) / EDS_DL_DECADES,
  ),
  dieAcross: clamp01(Math.sqrt((4 * (out['grossDie'] ?? 0)) / Math.PI) / EDS_WAFER_CELLS_MAX),
});

const WAFER_MAP_NOTE =
  '오른쪽 격자에서 어두운 칸이 불량이고 그 비율이 원 수율입니다. 칸 하나가 다이 하나는 아닙니다 — '
  + '다이 수가 최대 6,857개라 격자를 성기게 그립니다. 🔴 불량 칸의 자리는 물리 예측이 아니라 고정 해시로 '
  + '흩뿌린 것입니다. 결함 밀도 D₀ 는 공간적으로 균일해서 올려도 에지 링이 생기지 않고 전면 산포가 짙어질 '
  + '뿐입니다(PLN 정정 2026-08-20 — 종전 명세의 「에지 링 전이」는 물리 오류였습니다). '
  + '오른쪽 세로 게이지는 출하 결함 수준이고 로그 눈금이며, 파선이 합격 상한 1,500 ppm 입니다.';

function edsAdvancedCharts(): LabChartBinding[] {
  return [
      {
        id: 'eds.s7.defectLevelCoverage',
        kind: 'line',
        ko: '커버리지 스윕 — 출하 결함 수준 (합격창 확대)',
        en: 'Coverage sweep — shipped defect level (spec window zoomed)',
        judgesOutputs: ['defectLevelPpm'],
        xKo: '테스트 커버리지 T', xEn: 'Test coverage',
        yKo: '출하 결함 수준 DL_total', yEn: 'Shipped defect level', yUnit: 'ppm',
        xDomain: [COVERAGE_RANGE[0], COVERAGE_RANGE[1]],
        yDomain: [0, DL_CHART_Y_MAX_FACTOR * S7_DL_MAX_PPM],
        refLines: [
          { value: S7_DL_MAX_PPM, ko: '합격 상한 1,500 ppm', en: 'Spec upper 1,500 ppm', tone: 'spec' },
        ],
        captionKo: '심화의 결함 합격선은 1,500 ppm 으로 응용(2,000)보다 좁습니다. 세로축은 그 합격선의 2배까지만 확대했습니다 — 실제 도달 범위가 19 ~ 669,667 ppm 이라 확대하지 않으면 합격선이 축 바닥 0.2 % 에 붙습니다. 결함 밀도 D₀ 를 올리면 곡선 전체가 위로 들려 어떤 커버리지로도 합격선에 닿지 못하는 구간이 생깁니다 — 커버리지로 라인 청정도를 대신할 수 없다는 뜻입니다.',
        captionEn: 'The advanced stage tightens the defect spec to 1,500 ppm, below the applied stage 2,000. The vertical axis is zoomed to twice that line: the reachable range is 19 to 669,667 ppm, so without the zoom the spec line sits at 0.2 % of the axis. Raising the defect density D0 lifts the whole curve until no coverage reaches the line — coverage cannot substitute for line cleanliness.',
        note: '곡선은 현재 A · D₀ · G · R 을 고정한 채 커버리지만 훑은 것이며, `compute()` 가 판정에 쓰는 `shippedDefectLevelPpm()` 과 같은 함수입니다. 세로 점선은 현재 커버리지입니다. 세로축 상한은 합격 임계에서 파생(2배)했고 임계 자체는 건드리지 않았습니다(D-041).',
        build: (inputs, outputs) => {
          const coverage = inputs['coverage'] ?? 0.800;
          const dieAreaMm2 = inputs['dieAreaMm2'] ?? 30;
          const defectDensityPerCm2 = inputs['defectDensity'] ?? 0.60;
          const guardbandPct = inputs['guardbandPct'] ?? 0;
          const redundancy = inputs['redundancy'] ?? 0;
          const at = (t: number): number => shippedDefectLevelPpm({
            coverage: t, dieAreaMm2, defectDensityPerCm2, guardbandPct, redundancy,
          });
          return [
            {
              id: 'dlCurve',
              ko: `DL(T) · A = ${dieAreaMm2} mm² · D₀ = ${defectDensityPerCm2} ea/cm² · G = ${guardbandPct} % · R = ${redundancy}`,
              en: `DL(T) at A = ${dieAreaMm2} mm², D0 = ${defectDensityPerCm2} ea/cm2, G = ${guardbandPct} %, R = ${redundancy}`,
              points: coverageGrid().map((t) => ({ x: t, y: at(t) })),
            },
            {
              id: 'operating',
              ko: '현재 커버리지',
              en: 'Current coverage',
              points: [{ x: coverage, y: 0 }, { x: coverage, y: outputs['defectLevelPpm'] ?? at(coverage) }],
              dashed: true,
            },
          ];
        },
      },
  ];
}

export const EDS_LABS: LabSpec[] = [
  /* ─────────────────────────── 【기초】 S5 ─────────────────────────── */
  {
    processId: EDS_PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P7-03',
    titleKo: '오버드라이브·니들 재질과 프로브 접촉',
    titleEn: 'Overdrive, needle material, and probe contact',
    params: params([
      {
        id: 'overdriveUm', ko: '오버드라이브 OD', en: 'Overdrive', unit: 'µm',
        min: 10, max: 150, step: 1, initial: 100, sourceId: 'S229',
        basis: 'S229 실무범위 1–3 mil = 25–76 µm 를 **양쪽으로 감싸도록** 넓게 열었다. 범위 안·밖을 모두 만들 수 있어야 「실무창 이탈」 판정이 산다. 🔴 기존 명세의 정답창 90~105 µm 는 하한부터 문헌 상한 76 µm 밖이었다(폐기).',
      },
      {
        id: 'needleMaterialIndex', ko: '니들 재질', en: 'Needle material',
        unit: '0=W · 1=W-Re · 2=BeCu',
        min: 0, max: 2, step: 1, initial: 0, sourceId: 'S229',
        basis: 'S229 에 접촉력 계수와 접촉저항 공칭값이 함께 등재된 재질 3종. 등재 밖 재질은 보간하지 않는다(물리층이 거부한다).',
      },
      {
        id: 'markLengthUm', ko: '측정된 스크럽 마크 장축 Dm', en: 'Measured scrub mark length', unit: 'µm',
        min: 10, max: 90, step: 1, initial: 68,
        basis: '패드 검사 이미지에서 읽는 **실측 입력**이다(S229 의 요구조건 자체가 「측정된 마크가 개구부 안에 있는가」이므로 계산 출력이 아니다). 범위는 판정 기준인 패시베이션 개구부 60 µm 를 양쪽으로 감싸도록 10~90 µm 로 잡았다. 🔴 개구부 60 µm 는 이 시나리오의 패드 치수 60×60 µm 에서 유도한 값이며, 기존 명세의 「규격 45 µm」는 S229 에 존재하지 않아 폐기했다.',
      },
    ]),
    /* 🔴 **고정 조건** — PLN 명세 §P7 기초(S5) 「고정 조건(표시만, 조작 불가)」.
     *    · **니들 재질 · 오버드라이브 · 마크 장축** 은 이 칸의 슬라이더다 — 고정 조건이 아니다.
     *    · **패드 금속 Al**(`PAD_METAL`)은 접촉저항 조회값을 실제로 가르지만 **명세가 고정 조건으로
     *      선언하지 않았다.** 코드에 상수가 있다는 이유로 배지에 올리지 않는다(spec.ts 머리 규칙).
     *    · §P7 공통 상수(웨이퍼 지름·오버헤드·테스터 단가)는 이 칸에 닿는 출력이 없어 넣지 않았다 —
     *      이 칸은 프로브 접촉만 다루고 수율·시간·비용을 계산하지 않는다.
     */
    fixedConditions: [
      {
        id: 'chuckTempC', ko: '척 온도', en: 'Chuck temperature',
        value: '25', unit: '°C',
        basis: 'PLN 명세 고정 조건 — 상온 규격 테스트만 다룬다. 🔴 조건 표시 전용이며 계산에 들어가지 않는다: 명세의 온도별 검출 가중 w 표(−25/25/85/125 °C)는 문헌 근거가 없어 기능째로 뺐다(파일 머리 §5-1).',
      },
      {
        id: 'probeCardType', ko: '프로브 카드', en: 'Probe card',
        value: '캔틸레버형 (cantilever)', valueEn: 'Cantilever',
        basis: 'PLN 명세 고정 조건. 🔴 수가 아닌 조건이다. S229 의 접촉력 계수·접촉저항 공칭값은 **니들 재질**로 갈리고(그래서 재질이 슬라이더다) 카드 형식은 이 시나리오에서 고정이다.',
      },
      {
        id: 'padSizeUm', ko: '패드 크기', en: 'Pad size',
        value: `${PASSIVATION_OPENING_UM} × ${PASSIVATION_OPENING_UM}`, unit: 'µm',
        basis: 'PLN 명세 고정 조건. 🔴 스크럽 마크 판정의 기준선인 패시베이션 개구부가 **바로 이 치수에서 나온다** — S229 는 수치규격을 주지 않고 「최대 오버드라이브에서 마크가 개구부 안에 있을 것」이라는 기하 조건만 주기 때문이다(폐기된 「규격 45 µm」의 대체).',
      },
    ],
    outputs: [
      { id: 'overdriveMarginUm', ko: '실무 오버드라이브 창 여유', en: 'Practice overdrive margin',
        role: 'judge', pass: { min: 0 }, digits: 1 },
      { id: 'contactResistanceUOhm', ko: '접촉저항 공칭값', en: 'Nominal contact resistance',
        /* 🔴 `counted` — S229 공칭값 자체가 100·200·250 의 **굵은 값**이다.
           0.1 µΩ 자리를 만들어 내면 문헌에 없는 정밀도를 주장한다(PLN §27-3). */
        role: 'judge', pass: { max: CONTACT_SPEC_UOHM }, digits: 0, displayMode: 'counted' },
      { id: 'scrubClearanceUm', ko: '패시베이션 개구부 여유', en: 'Passivation opening clearance',
        role: 'judge', pass: { min: 0 }, digits: 1 },
      { id: 'contactForceG', ko: '프로브 접촉력(상한)', en: 'Probe contact force (upper bound)',
        role: 'display', digits: 2 },
    ],
    compute(inputs) {
      const overdriveUm = inputs['overdriveUm'] ?? 0;
      const material = needleOf(inputs['needleMaterialIndex'] ?? 0);
      const markLengthUm = inputs['markLengthUm'] ?? 0;

      // 🔴 B군 — 물리층 Quantity 를 **그대로** 돌려준다. assumptions[0] 의 A15-op 표식이 보존된다.
      return {
        overdriveMarginUm: overdriveRangeMarginUm(overdriveUm),
        contactResistanceUOhm: nominalContactResistance({ material, pad: PAD_METAL }),
        scrubClearanceUm: scrubClearance(markLengthUm),
        contactForceG: probeContactForce({
          material, ...odMil(overdriveUm), bound: 'max',
        }),
      };
    },
    scene: { sceneId: 'probeScrub', map: probeScrubMap, note: PROBE_SCRUB_NOTE },
    feedback: [
      {
        id: 'EDS5-F1', tone: 'stop',
        ko: '공정 한계선 초과 — 오버드라이브가 실무범위 25~76 µm(1~3 mil, S229)를 넘었습니다. 니들 좌굴·패드 관통 위험이 있습니다. 76 µm 이하로 내리시오.',
        en: 'Limit exceeded — overdrive is above the 25–76 µm (1–3 mil) practice range (S229). Risk of needle buckling and pad punch-through. Lower it below 76 µm.',
        when: (i) => (i['overdriveUm'] ?? 0) > OD_HI_UM,
      },
      {
        id: 'EDS5-F2', tone: 'warn',
        ko: '접촉 불충분 — 오버드라이브가 실무범위 하한 25 µm 아래입니다. 니들이 Al 패드의 자연산화막을 뚫지 못해 가짜 파라메트릭 불량이 발생합니다. 25 µm 이상으로 올리시오.',
        en: 'Insufficient contact — overdrive is below the 25 µm practice minimum. The needle cannot break through the native oxide on the Al pad, producing false parametric failures. Raise it above 25 µm.',
        when: (i) => (i['overdriveUm'] ?? 0) < OD_LO_UM,
      },
      {
        id: 'EDS5-F3', tone: 'warn',
        ko: '프로브 마크가 패시베이션 개구부(60 µm)를 벗어났습니다 — 후속 본딩 접합 불량 위험이 있습니다. 오버드라이브를 낮춰 마크를 줄이시오. ⚠️ 이 판정에는 「규격 45 µm」 같은 수치 규격이 없습니다. S229 는 「최대 오버드라이브에서 마크가 개구부 안에 있을 것」이라는 기하 조건만 규정합니다.',
        en: 'The probe mark has left the 60 µm passivation opening — risk of subsequent bonding failure. Lower the overdrive to shrink the mark. Note: there is no numeric 45 µm spec; S229 only requires the mark to stay inside the opening at maximum overdrive.',
        when: (_i, o) => (o['scrubClearanceUm'] ?? 0) < 0,
      },
      {
        id: 'EDS5-F4', tone: 'hint',
        ko: '접촉저항 공칭값이 조건(200 µΩ 이하)을 넘었습니다. S229 공칭값은 재질·패드로 정해집니다 — W·W-Re 는 250 µΩ, BeCu 는 Al 패드에서 200 µΩ, Au 패드에서 100 µΩ 입니다. 이 값은 계산식이 아니라 조회값입니다.',
        en: 'Nominal contact resistance exceeds the given 200 µΩ condition. S229 fixes it by material and pad: W and W-Re are 250 µΩ, BeCu is 200 µΩ on Al and 100 µΩ on Au. This is a lookup, not a formula.',
        when: (_i, o) => (o['contactResistanceUOhm'] ?? 0) > CONTACT_SPEC_UOHM,
      },
      {
        id: 'EDS5-F5', tone: 'hint',
        ko: 'BeCu 로 바꾸면 접촉저항은 내려가지만 접촉력 계수가 0.5~1.6 g/mil 로 W 의 1.0~2.5 g/mil 보다 낮습니다. 같은 오버드라이브에서 니들이 패드를 누르는 힘이 줄어드는 것이 대가입니다.',
        en: 'Switching to BeCu lowers contact resistance, but its force coefficient (0.5–1.6 g/mil) is below tungsten (1.0–2.5 g/mil). At the same overdrive the needle presses the pad with less force — that is the trade.',
        when: (i) => needleOf(i['needleMaterialIndex'] ?? 0) === 'BeCu',
      },
    ],
    tradeoffs: [
      {
        ko: '오버드라이브↑ → 접촉력이 비례해 커져 산화막 관통에 유리(좋음) / 스크럽 마크가 커져 패시베이션 개구부 여유가 줄고(나쁨), 76 µm 를 넘으면 실무창 자체를 벗어난다. 실무창 여유는 단조가 아니다 — 너무 작아도, 너무 커도 음수가 된다.',
        en: 'Higher overdrive scales contact force up, helping break the native oxide (good), but grows the scrub mark toward the passivation edge (bad) and leaves the 25–76 µm practice window above 76 µm. The window margin is non-monotonic — too little and too much both fail.',
      },
      {
        ko: '니들 재질 BeCu → 접촉저항 공칭 200 µΩ(Al 패드)로 W·W-Re 의 250 µΩ 보다 낮다(좋음) / 접촉력 계수가 0.5~1.6 g/mil 로 W 의 1.0~2.5 g/mil 보다 낮아 같은 OD 에서 누르는 힘을 잃는다(나쁨).',
        en: 'BeCu needles give a 200 µΩ nominal contact resistance on Al pads versus 250 µΩ for W/W-Re (good), but their 0.5–1.6 g/mil force coefficient is lower than tungsten’s 1.0–2.5 g/mil, so the same overdrive delivers less force (bad).',
      },
      {
        ko: '마크를 줄이려고 오버드라이브를 내리면 접촉력이 함께 줄어 접촉이 불안정해진다 — 두 조건을 동시에 만족하는 구간을 찾아야 한다.',
        en: 'Lowering overdrive to shrink the mark also lowers contact force and destabilises the contact — you must find the band that satisfies both at once.',
      },
    ],
  },

  /* ─────────────────────────── 【응용】 S6 ─────────────────────────── */
  {
    processId: EDS_PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P7-04',
    titleKo: '커버리지·수율·비용 3중 상충',
    titleEn: 'Coverage, yield, and cost: a three-way trade-off',
    params: params([
      {
        id: 'coverage', ko: '테스트 커버리지 T', en: 'Test coverage', unit: '',
        min: COVERAGE_RANGE[0], max: COVERAGE_RANGE[1], step: 0.001, initial: 0.800, sourceId: 'S227',
        basis: '커버리지는 테스트 패턴 생성 결과인 **입력값**이지 계산되는 물리량이 아니다(원장 §3-6 B6 · 물리층 defectLevel() 도 같은 주석을 단다). 범위는 PLN 교육용 설정값이며, 상한 0.999 는 t_die 가 발산하지 않는 선이다.',
      },
      {
        id: 'dieAreaMm2', ko: '다이 면적 A', en: 'Die area', unit: 'mm²',
        min: 10, max: 400, step: 5, initial: 200, sourceId: 'S220',
        basis: '🔴 이 범위는 **포아송 적용한계(A ≤ 0.25 cm² 또는 A·D₀ < 1.0 · S220 §2·§5)를 슬라이더가 가로지르도록** 잡은 것이다. D₀ = 0.5 에서 A·D₀ = 1.0 이 되는 지점이 A = 200 mm² 이고, 10~400 mm² 는 그 앞뒤를 모두 지난다 — 한계 안과 밖을 눈으로 보게 하는 것이 이 실습의 핵심이다.',
      },
      {
        id: 'guardbandPct', ko: '판정 가드밴드 G', en: 'Judgement guardband', unit: '%',
        min: 0, max: 15, step: 1, initial: 2,
        basis: 'PLN 교육용 설정값(§P7 S6). 언더킬·오버킬 응답식과 함께 이 파일 §합성모델에 격리했다 — 문헌식이 아니다. 🔴 등급 C 인 %GRR·Cpk 임계는 여기에 쓰지 않았다(A15-op op-3).',
      },
      {
        id: 'redundancy', ko: '리던던시 여분 라인 R', en: 'Redundant lines', unit: '개', unitEn: 'ea',
        min: 0, max: 16, step: 1, initial: 0,
        basis: 'PLN 교육용 설정값(§P7 S6). 상한 16 은 리페어 이득 상한 min(0.02R, 0.32) 이 포화하는 점(R = 16)과 일치한다. 🔴 PLN 정정 2026-08-20 에 따라 실효 면적 오버헤드 A_eff = A(1+0.003R) 를 되먹여 「올리면 무조건 이득」인 죽은 입력을 없앴다.',
      },
    ]),
    /* 🔴 **고정 조건** — PLN 명세 §P7 응용(S6) 「고정 조건(표시만)」 ＋ §P7 공통 상수().
     *    🔴 **뺀 것과 사유**
     *    · **오버드라이브 100 µm(합격 고정)** — 뺐다. 이 구현에서 100 µm 는 **불합격**이다 —
     *      S229 실무창이 25~76 µm 이고(기초 칸이 그것을 판정한다) 기초의 기본값 100 µm 가 바로
     *      「창 밖에서 출발」하는 값이다. 「100 µm(합격 고정)」을 배지에 올리면 옆 칸의 판정과 모순된다.
     *      (명세의 옛 정답창 90~105 µm 는 하한부터 문헌 상한 76 µm 밖이라 폐기됐다 — 파일 머리 §2.)
     */
    fixedConditions: [
      {
        id: 'defectDensityPerCm2', ko: '결함 밀도 D₀', en: 'Defect density D₀',
        value: DEFECT_DENSITY_PER_CM2.toFixed(2), unit: 'ea/cm²',
        basis: 'PLN 명세 고정 조건(교육용 설정값 · D-008). S5·S6 은 고정이고 심화 S7 에서만 슬라이더로 연다. 🔴 A·D₀ 가 포아송 적용한계 1.0 을 넘는 지점(A = 200 mm²)을 정하는 값이라, 이 칸의 학습 요점 자체가 여기에 걸려 있다.',
      },
      {
        id: 'chuckTempC', ko: '척 온도', en: 'Chuck temperature',
        value: '25', unit: '°C',
        basis: 'PLN 명세 고정 조건 — 상온 규격 테스트만. 명세가 스스로 「w = 1.00 → T_eff = T」라 적었듯 온도는 결과를 바꾸지 않는다(온도 가중 표는 문헌 근거 부재로 미구현 · 파일 머리 §5-1).',
      },
      {
        /* 🔴 이름 있는 상수가 없다. 이 칸에는 **병렬 분할 자체가 없어** 코드에 P 가 등장하지 않는다
           (웨이퍼 시간 = 다이 시간 합 + 오버헤드). P 는 심화 S7 에서만 슬라이더로 열린다. */
        id: 'parallelSites', ko: '병렬 측정수 P', en: 'Parallel test sites P',
        value: '1', unit: '개', unitEn: 'ea',
        basis: 'PLN 명세 고정 조건 — 이 칸의 웨이퍼 테스트 시간은 병렬 분할 없이 계산한다. 병렬화의 이득·대가(누화)는 심화 S7 의 학습 내용이다.',
      },
      {
        id: 'waferDiameterCm', ko: '웨이퍼 지름 D', en: 'Wafer diameter D',
        value: String(WAFER_DIAMETER_CM), unit: 'cm',
        basis: 'PLN 명세 §P7 공통 상수 「웨이퍼 지름 D = 300 mm」. 웨이퍼당 총 다이 수 DPW(S148)의 입력이며, 정본은 `labs/fixed.ts` 의 `WAFER_DIAMETER_CM`(P5 증착과 공유).',
      },
      {
        id: 'waferOverheadS', ko: '웨이퍼당 로딩·정렬·언로딩 오버헤드', en: 'Load / align / unload overhead per wafer',
        value: String(WAFER_OVERHEAD_S), unit: 's',
        basis: 'PLN 명세 §P7 공통 상수 — **명세가 스스로 「교육용 설정값」이라 밝힌 값**이다(D-008). 웨이퍼 1장 테스트 시간과 굿다이당 비용에 그대로 더해지므로 두 판정을 직접 움직인다.',
      },
      {
        id: 'testerRateKrwPerHour', ko: '테스터 시간당 운영 단가', en: 'Tester operating rate',
        value: String(TESTER_KRW_PER_HOUR), unit: '원/h', unitEn: 'KRW/h',
        basis: 'PLN 명세 §P7 공통 상수 — **교육용 설정값**이다(D-008 · 실제 단가는 회사·제품마다 다르다). 굿다이당 비용 판정의 분자다.',
      },
    ],
    outputs: [
      { id: 'defectLevelPpm', ko: '출하 결함 수준 DL_total', en: 'Shipped defect level',
        /* 🔴 `counted` — 통계 추정량이다. 경계에서 자릿수를 올리면 `1500.4 ppm` 이 되는데
           그것은 0.1 ppm 분해능을 주장하는 것이다. 상향 대신 부등호로 간다(PLN §27-3). */
        role: 'judge', pass: { max: S6_DL_MAX_PPM }, digits: 0, displayMode: 'counted' },
      { id: 'waferTestMin', ko: '웨이퍼 1장 테스트 시간', en: 'Test time per wafer',
        role: 'judge', pass: { max: S6_WAFER_TIME_MAX_MIN }, digits: 2 },
      { id: 'costPerGoodDie', ko: '굿다이당 테스트 비용', en: 'Test cost per good die',
        role: 'judge', pass: { max: S6_COST_MAX_KRW }, digits: 1 },
      { id: 'rawYield', ko: '수율 Y_raw (음이항 α=2)', en: 'Raw yield (negative binomial, α=2)',
        role: 'display', digits: 4 },
      { id: 'repairedYield', ko: '리페어 반영 수율 Y', en: 'Yield after repair', role: 'display', digits: 4 },
      { id: 'grossDie', ko: '웨이퍼당 총 다이 수 N', en: 'Gross die per wafer', role: 'display', digits: 0 },
      { id: 'adProduct', ko: '실효 A·D₀ (포아송 적용한계 1.0)', en: 'Effective A·D₀ (Poisson limit 1.0)',
        role: 'display', digits: 3 },
    ],
    compute(inputs) {
      const coverage = inputs['coverage'] ?? 0;
      const dieAreaMm2 = inputs['dieAreaMm2'] ?? 0;
      const guardbandPct = inputs['guardbandPct'] ?? 0;
      const redundancy = inputs['redundancy'] ?? 0;

      const areaCm2 = effectiveAreaCm2(dieAreaMm2, redundancy);
      const d0 = DEFECT_DENSITY_PER_CM2;

      // ── A군: 전부 물리층이다 ──────────────────────────────────────────
      const raw = negativeBinomialYield({ areaCm2, defectDensityPerCm2: d0 }); // S222 · α=2(S223)
      const gross = grossDiePerWafer({ diameterCm: WAFER_DIAMETER_CM, dieAreaCm2: areaCm2 }); // S148
      const y = repaired(raw.value, redundancy);

      // ── scoring: PLN 교육용 설정값 ────────────────────────────────────
      // 🔴 차트가 그리는 곡선과 **같은 함수**다(위 §차트·판정 공용 함수).
      const waferSeconds = s6WaferSeconds(coverage, dieAreaMm2, redundancy);
      const goodDie = gross.value * y * (1 - overkillFraction(guardbandPct));
      const cost = ((waferSeconds / SECONDS_PER_HOUR) * TESTER_KRW_PER_HOUR) / goodDie;
      const adProduct = areaCm2 * d0;
      const poissonOk = poissonApplicable(areaCm2, d0);

      const modelNote = poissonOk
        ? `A·D₀ = ${adProduct.toPrecision(3)} — 포아송 적용한계(S220 §5) 안이지만, 전 구간 연속성을 위해 음이항 α = ${ALPHA_DEFAULT.value} 로 통일해 계산한다(α → ∞ 에서 포아송에 수렴).`
        : `🔴 A·D₀ = ${adProduct.toPrecision(3)} 가 포아송 적용한계 ${POISSON_AD_LIMIT.value} 를 넘었고 A = ${areaCm2.toPrecision(3)} cm² 도 ${POISSON_AREA_LIMIT_CM2.value} cm² 를 넘는다 — 포아송은 이 구간에서 수율을 과소평가한다. 음이항 α = ${ALPHA_DEFAULT.value}(S223) 로 계산한다.`;

      return {
        defectLevelPpm: quantity(shippedDefectLevelPpm({
          coverage, dieAreaMm2, defectDensityPerCm2: d0, guardbandPct, redundancy,
        }), {
          modelId: 'eds.lab.s6.defectLevelPpm', unit: 'ppm', basis: "교육용 합성 — 문헌식 DL=1−Y^(1−T)(S227)에 교육용 가드밴드 언더킬 3000·exp(−0.35·G) ppm 을 더한 값입니다.",
          validRange: [0, PPM],
          assumptions: [
            'DL_cov = 1 − Y^(1−T) 는 물리층(S227). 여기에 가드밴드 언더킬 UK = 3000·exp(−0.35·G) [ppm] 을 더한다.',
            SYNTHETIC_NOTE,
            modelNote,
          ],
        }),
        waferTestMin: quantity(waferSeconds / SECONDS_PER_MINUTE, {
          modelId: 'eds.lab.s6.waferTestMin', unit: 'min', basis: "교육용 합성 — 다이당 테스트 시간 t_die 와 웨이퍼 오버헤드 60 s 는 교육용 설정값입니다.",
          validRange: [0, Number.POSITIVE_INFINITY],
          assumptions: ['웨이퍼당 다이 수 N 은 물리층(S148). t_die 와 오버헤드 60 s 는 교육용 설정값이다.', SYNTHETIC_NOTE],
        }),
        costPerGoodDie: quantity(cost, {
          modelId: 'eds.lab.s6.costPerGoodDie', unit: '원/개', unitEn: 'KRW/good die', basis: "교육용 합성 — 테스터 단가 300,000원/h·가드밴드 오버킬 0.004/%G 를 쓴 학습용 원가 모형입니다.",
          validRange: [0, Number.POSITIVE_INFINITY],
          assumptions: [
            '🔴 합격 임계 100 원/개는 음이항 전환 뒤 격자 전수 스윕(10,744,000 조합)으로 재설정한 값이다 — 파일 머리 §3 참조. 기존 120 원은 기본값이 이미 합격해 죽은 판정이었다.',
            SYNTHETIC_NOTE,
          ],
        }),
        rawYield: raw,
        repairedYield: quantity(y, {
          modelId: 'eds.lab.s6.repairedYield', unit: '', basis: "교육용 합성 — 음이항 수율(S222·S223)에 교육용 리페어 이득 min(0.02·R, 0.32)를 덧씌운 값입니다.", validRange: [0, 1],
          assumptions: ['Y_raw 는 물리층 음이항(S222 · α=2 S223). 리페어 이득 min(0.02·R, 0.32) 은 교육용 설정값이다.', SYNTHETIC_NOTE],
        }),
        grossDie: gross,
        adProduct: quantity(adProduct, {
          modelId: 'eds.lab.s6.adProduct', unit: '', basis: "교육용 합성 — A·D₀ 는 문헌량이나 실효면적 A_eff = A(1+0.003·R)의 0.003/라인은 교육용 설정값입니다.",
          validRange: [0, Number.POSITIVE_INFINITY],
          assumptions: [`포아송 적용한계는 A ≤ ${POISSON_AREA_LIMIT_CM2.value} cm² 또는 A·D₀ < ${POISSON_AD_LIMIT.value} (S220 §2·§5).`, modelNote],
        }),
      };
    },
    /* ── 차트 (W6-6 해소 · PLN `threads/parts/차트-P7-eds.md` §1 「필요 — 1개」) ──
     * 🔴 **PLN 판정과 계약이 부딪힌 지점 하나를 여기 적어 둔다.**
     *   PLN 은 차트 **1개**에 `judgesOutputs: ['defectLevelPpm', 'waferTestMin']` 을 지정했다.
     *   그러나 `LabChartBinding` 은 **세로축이 1개**다(`yKo/yEn/yUnit/yDomain` 각 1개).
     *   ppm 축에 「웨이퍼 테스트 시간(min) 도 이 차트에서 판정합니다」를 달면 **화면이 뒷받침하지
     *   못하는 주장**이 된다(W6-4 의 R-1 이 막으려는 바로 그 실수).
     *   → **판정 대상은 PLN 이 정한 그대로 두고**, x 축(커버리지 T)을 공유하는 패널 **2개로 나눴다.**
     *     선언도 확대도 줄이지 않았다 — 오히려 시간 판정이 화면을 갖게 된다.
     */
    charts: edsAppliedCharts(),
    scene: { sceneId: 'waferMap', map: waferMapMap, note: WAFER_MAP_NOTE },
    feedback: [
      {
        id: 'EDS6-F1', tone: 'warn',
        ko: '커버리지를 끝까지 올리면 출하 불량은 줄지만 테스트 시간과 비용이 목표를 넘습니다. T 를 0.990~0.997 구간에서 재탐색하시오.',
        en: 'Pushing coverage to the limit cuts escapes but blows past the time and cost targets. Re-search T in the 0.990–0.997 band.',
        when: (i, o) => (i['coverage'] ?? 0) >= 0.998 && (o['waferTestMin'] ?? 0) > S6_WAFER_TIME_MAX_MIN,
      },
      {
        id: 'EDS6-F2', tone: 'warn',
        ko: '다이 면적이 커져 실효 A·D₀ 가 포아송 적용한계 1.0 을 넘었습니다 — 이 구간에서 포아송은 수율을 과소평가하므로 음이항 Y = (1 + A·D₀/2)⁻² 로 계산됩니다(S220 §5 · S223). 수율 표시값을 확인하고 A 를 줄이시오.',
        en: 'Effective A·D₀ has crossed the Poisson validity limit of 1.0 — Poisson underestimates yield here, so the negative binomial Y = (1 + A·D₀/2)^-2 is used instead (S220 §5, S223). Check the yield readout and reduce A.',
        when: (_i, o) => (o['adProduct'] ?? 0) >= POISSON_AD_LIMIT.value,
      },
      {
        id: 'EDS6-F3', tone: 'warn',
        ko: '다이가 작아 수율은 좋지만 프로빙 횟수가 폭증해 웨이퍼 테스트 시간이 목표를 넘었습니다. A 를 60 mm² 이상으로 올리거나 커버리지를 낮추시오.',
        en: 'Small dies yield well but the probe count explodes and wafer test time has passed the target. Raise A above 60 mm² or lower the coverage.',
        when: (i, o) => (i['dieAreaMm2'] ?? 0) <= 30 && (o['waferTestMin'] ?? 0) > S6_WAFER_TIME_MAX_MIN,
      },
      {
        id: 'EDS6-F4', tone: 'warn',
        ko: '가드밴드 과다 — 양품을 버리고 있습니다. G 1 %당 굿다이가 0.4 %씩 줄어 굿다이당 비용이 올라갑니다. G 를 6~9 % 구간으로 되돌리시오.',
        en: 'Guardband too wide — you are discarding good units. Each 1 % of G removes 0.4 % of good dies and raises cost per good die. Return G to the 6–9 % band.',
        when: (i) => (i['guardbandPct'] ?? 0) >= 13,
      },
      {
        id: 'EDS6-F5', tone: 'warn',
        ko: '가드밴드 0 % — 측정 오차가 그대로 유출로 이어집니다(언더킬 3,000 ppm). G 를 최소 5 % 이상으로 올리시오.',
        en: 'Guardband at 0 % — measurement error escapes directly to the customer (3,000 ppm underkill). Raise G to at least 5 %.',
        when: (i) => (i['guardbandPct'] ?? 0) === 0,
      },
      {
        id: 'EDS6-F6', tone: 'hint',
        ko: '세 지표는 동시에 좋아지지 않습니다. 리던던시로 Y 를 먼저 올린 뒤 커버리지를 조정해 보시오. 다만 여분 라인은 실효 다이 면적을 0.3 %/라인씩 먹으므로 「무조건 최대」가 답은 아닙니다.',
        en: 'The three metrics do not improve together. Raise Y with redundancy first, then tune coverage — but each redundant line costs 0.3 % of effective die area, so "always maximum" is not the answer.',
        when: (_i, o) => (o['defectLevelPpm'] ?? 0) > S6_DL_MAX_PPM && (o['costPerGoodDie'] ?? 0) > S6_COST_MAX_KRW,
      },
      {
        id: 'EDS6-F7', tone: 'hint',
        ko: '굿다이당 비용만 남았습니다. 비용은 (웨이퍼 시간 × 테스터 단가) ÷ 굿다이 수입니다 — 커버리지를 조금 낮춰 시간을 줄이거나, 면적을 80~110 mm² 로 옮겨 굿다이 수를 늘리는 두 길이 있습니다.',
        en: 'Only cost per good die remains. Cost is (wafer time × tester rate) ÷ good dies — either trim coverage to cut time, or move the area into 80–110 mm² to raise the good-die count.',
        when: (_i, o) => (o['defectLevelPpm'] ?? 0) <= S6_DL_MAX_PPM
          && (o['waferTestMin'] ?? 0) <= S6_WAFER_TIME_MAX_MIN
          && (o['costPerGoodDie'] ?? 0) > S6_COST_MAX_KRW,
      },
    ],
    tradeoffs: [
      {
        ko: '커버리지 T↑ → 출하 결함수준 DL 급감(좋음) / 다이당 테스트 시간이 늘어 웨이퍼 시간·비용 증가(나쁨). 기본값 대비 T 0.800 → 0.996 에서 DL 은 149,720 → 1,166 ppm 으로 떨어지지만 웨이퍼 시간은 2.84 → 8.64 min 이 된다.',
        en: 'Higher coverage T collapses the shipped defect level (good) but stretches per-die test time, raising wafer time and cost (bad). From T 0.800 to 0.996 the DL falls 149,720 → 1,166 ppm while wafer time grows 2.84 → 8.64 min.',
      },
      {
        ko: '다이 면적 A↑ → 웨이퍼당 프로빙 횟수가 줄어 테스트 시간 단축(좋음) / 수율이 음이항으로 감소하고 웨이퍼당 다이 수도 줄어 굿다이당 비용이 오른다(나쁨). 두 손해가 겹친다.',
        en: 'Larger dies mean fewer probe touchdowns and shorter test time (good), but the negative-binomial yield falls and the die count per wafer falls too, so cost per good die climbs (bad) — two losses at once.',
      },
      {
        ko: '가드밴드 G↑ → 언더킬(불량 유출)이 지수적으로 감소(좋음) / 오버킬로 양품을 1 %당 0.4 %씩 버려 굿다이가 줄고 비용이 오른다(나쁨).',
        en: 'A wider guardband cuts underkill exponentially (good) but overkills good product at 0.4 % per 1 %, shrinking the good-die count and raising cost (bad).',
      },
      {
        ko: '리던던시 R↑ → 리페어로 수율 Y 상승, DL·비용 동시 개선(좋음) / 여분 라인이 실효 다이 면적을 0.3 %/라인 먹어 수율 원값과 웨이퍼당 다이 수를 함께 깎는다(나쁨). 최적점이 존재하므로 최대가 늘 답은 아니다.',
        en: 'More redundancy repairs dies, lifting Y and improving both DL and cost (good), but each line eats 0.3 % of effective die area, cutting raw yield and gross die count (bad). An optimum exists — the maximum is not always right.',
      },
    ],
  },

  /* ─────────────────────────── 【심화】 S7 ─────────────────────────── */
  {
    processId: EDS_PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P7-05',
    titleKo: '외란 DS-1(니들 오염) 진단과 복구',
    titleEn: 'Diagnosing and recovering from disturbance DS-1 (needle contamination)',
    params: params([
      {
        // 🔴 ko 의 원문자 「ⓐ」 를 en 과 같은 `(a)` 로 맞춘다(2026-08-21).
        //    원문자는 폰트에 따라 두부(□)로 떨어지고 슬라이더 라벨은 폭이 가장 좁은 자리다.
        id: 'needleCleanAction', ko: '(a) 니들 즉시 클리닝 실행 (0 = 미실행 · 1 = 실행)',
        en: '(a) Run immediate needle clean (0 = not run · 1 = run)',
        unit: '',
        min: 0, max: 1, step: 1, initial: 0,
        basis: '복구 액션 버튼을 0/1 슬라이더로 옮겼다(하네스에 버튼 계약이 없다). 🔴 외란 DS-1(누적 터치 3,000회 초과 시 Al 잔재 누적)이 **처음부터 활성**이며, 실행하면 오염계수가 1.0 으로 리셋된다. 오염계수 3.5 와 클리닝 오버헤드 +30 s 는 PLN 교육용 설정값이다(PLN 은 ⓐ 의 오버헤드를 적지 않았으나, 공짜 버튼은 죽은 입력이 되므로 ⓑ 와 같은 +30 s 를 적용했다).',
      },
      {
        id: 'overdriveUm', ko: '오버드라이브 OD', en: 'Overdrive', unit: 'µm',
        min: 20, max: 150, step: 5, initial: 130, sourceId: 'S229',
        basis: 'S5 와 같은 근거 — S229 실무범위 25~76 µm 를 감싸는 폭. 기본값 130 µm 는 실무창 밖(불합격)에서 출발한다.',
      },
      {
        id: 'needleMaterialIndex', ko: '니들 재질', en: 'Needle material',
        unit: '0=W · 1=W-Re · 2=BeCu',
        min: 0, max: 2, step: 1, initial: 0, sourceId: 'S229',
        basis: 'S229 등재 재질 3종. 접촉저항 공칭값과 접촉력 계수가 함께 정해진다.',
      },
      {
        id: 'markLengthUm', ko: '측정된 스크럽 마크 장축 Dm', en: 'Measured scrub mark length', unit: 'µm',
        min: 10, max: 90, step: 1, initial: 68,
        basis: 'S5 와 같은 근거 — 패드 검사 실측 입력. 판정은 패시베이션 개구부 60 µm 포함 여부(S229 기하 조건)다.',
      },
      {
        id: 'coverage', ko: '테스트 커버리지 T', en: 'Test coverage', unit: '',
        min: COVERAGE_RANGE[0], max: COVERAGE_RANGE[1], step: 0.001, initial: 0.800, sourceId: 'S227',
        basis: 'S6 와 같은 근거 — 커버리지는 계산 결과가 아니라 입력값이다(원장 §3-6 B6).',
      },
      {
        id: 'dieAreaMm2', ko: '다이 면적 A', en: 'Die area', unit: 'mm²',
        min: 10, max: 400, step: 5, initial: 30, sourceId: 'S220',
        basis: 'S6 와 같은 근거 — 포아송 적용한계(S220 §5)를 가로지르는 범위. S7 은 D₀ 도 열려 있어 한계 교차점이 D₀ 에 따라 움직인다.',
      },
      {
        id: 'defectDensity', ko: '결함 밀도 D₀ (라인 청정도)', en: 'Defect density (line cleanliness)',
        unit: 'ea/cm²',
        min: 0.05, max: 1.00, step: 0.05, initial: 0.60, sourceId: 'S220',
        basis: 'PLN 교육용 설정 범위. 🔴 D₀ 는 **공간적으로 균일한 랜덤 결함 밀도**이므로 올려도 에지 링이 생기지 않고 전면 산포가 짙어질 뿐이다(PLN 정정 2026-08-20 — 원문의 「에지 링 전이」는 물리 오류였다). 반경 가중 항은 씬이 없어 구현하지 않았다.',
      },
      {
        id: 'guardbandPct', ko: '판정 가드밴드 G', en: 'Judgement guardband', unit: '%',
        min: 0, max: 15, step: 1, initial: 5,
        basis: 'S6 와 같은 근거 — PLN 교육용 설정값. 등급 C(%GRR·Cpk 임계)는 판정에 쓰지 않았다.',
      },
      {
        id: 'redundancy', ko: '리던던시 여분 라인 R', en: 'Redundant lines', unit: '개', unitEn: 'ea',
        min: 0, max: 16, step: 1, initial: 4,
        basis: 'S6 와 같은 근거 — 리페어 이득이 R = 16 에서 포화한다. 실효 면적 오버헤드가 되먹임된다.',
      },
      {
        id: 'parallelSites', ko: '병렬 측정수 P', en: 'Parallel test sites', unit: '개', unitEn: 'ea',
        min: 1, max: 16, step: 1, initial: 1,
        basis: 'PLN 교육용 설정 범위. 처리량은 P 배로 오르지만 누화로 가짜 불량률이 0.2 %p/사이트씩 오른다 — 두 방향이 맞붙는다.',
      },
    ]),
    /* 🔴 **고정 조건** — 이 칸은 명세가 고정 조건을 **따로 선언하지 않는다.** §P7 「공통 상수(교육용 설정값)」 절만
     *    상속하고, 그중에서도 **이 칸의 출력에 실제로 닿는 둘**만 올린다.
     *    · **테스터 시간당 단가 300,000 원/h** — 뺐다. 이 칸에는 비용 출력이 없다(판정 6개: 실무창 여유 ·
     *      개구부 여유 · 접촉저항 · 결함수준 · 관측 수율 · 처리량). 닿는 곳 없는 값을 배지에 올리지 않는다.
     *    · **결함 밀도 D₀ · 병렬 측정수 P** — 이 칸에서는 **슬라이더**다(S6 의 고정 조건이 여기서 열린다).
     */
    fixedConditions: [
      {
        id: 'waferDiameterCm', ko: '웨이퍼 지름 D', en: 'Wafer diameter D',
        value: String(WAFER_DIAMETER_CM), unit: 'cm',
        basis: 'PLN 명세 §P7 공통 상수 「웨이퍼 지름 D = 300 mm」. 웨이퍼당 총 다이 수 DPW(S148)의 입력이고, DPW 가 처리량·관측 수율 판정으로 이어진다.',
      },
      {
        id: 'waferOverheadS', ko: '웨이퍼당 로딩·정렬·언로딩 오버헤드', en: 'Load / align / unload overhead per wafer',
        value: String(WAFER_OVERHEAD_S), unit: 's',
        basis: 'PLN 명세 §P7 공통 상수 — 교육용 설정값(D-008). 🔴 처리량 판정의 **구조적 상한**(3600/60 = 60 웨이퍼/h)이 이 값에서 나온다. 니들 클리닝을 실행하면 여기에 +30 s 가 더 붙는다(그 30 s 도 교육용 설정값이다).',
      },
    ],
    outputs: [
      { id: 'overdriveMarginUm', ko: '실무 오버드라이브 창 여유', en: 'Practice overdrive margin',
        role: 'judge', pass: { min: 0 }, digits: 1 },
      { id: 'scrubClearanceUm', ko: '패시베이션 개구부 여유', en: 'Passivation opening clearance',
        role: 'judge', pass: { min: 0 }, digits: 1 },
      { id: 'contactResistanceUOhm', ko: '접촉저항(오염 반영)', en: 'Contact resistance (with contamination)',
        /* 🔴 `counted` — S229 공칭값 자체가 100·200·250 의 **굵은 값**이다.
           0.1 µΩ 자리를 만들어 내면 문헌에 없는 정밀도를 주장한다(PLN §27-3). */
        role: 'judge', pass: { max: CONTACT_SPEC_UOHM }, digits: 0, displayMode: 'counted' },
      { id: 'defectLevelPpm', ko: '출하 결함 수준 DL_total', en: 'Shipped defect level',
        /* 🔴 `counted` — 위와 같은 이유(통계 추정량). */
        role: 'judge', pass: { max: S7_DL_MAX_PPM }, digits: 0, displayMode: 'counted' },
      { id: 'observedYield', ko: '관측 수율 Y_obs', en: 'Observed yield',
        role: 'judge', pass: { min: S7_OBSERVED_YIELD_MIN }, digits: 4 },
      { id: 'throughputWph', ko: '웨이퍼 처리량', en: 'Wafer throughput',
        role: 'judge', pass: { min: S7_THROUGHPUT_MIN_WPH }, digits: 2 },
      { id: 'falseFailPct', ko: '가짜 불량률 F_false', en: 'False-fail rate', role: 'display', digits: 2 },
      { id: 'rawYield', ko: '수율 Y_raw (음이항 α=2)', en: 'Raw yield (negative binomial, α=2)',
        role: 'display', digits: 4 },
      { id: 'grossDie', ko: '웨이퍼당 총 다이 수 N', en: 'Gross die per wafer', role: 'display', digits: 0 },
      { id: 'contactForceG', ko: '프로브 접촉력(상한)', en: 'Probe contact force (upper bound)',
        role: 'display', digits: 2 },
    ],
    compute(inputs) {
      const cleaned = (inputs['needleCleanAction'] ?? 0) >= 1;
      const overdriveUm = inputs['overdriveUm'] ?? 0;
      const material = needleOf(inputs['needleMaterialIndex'] ?? 0);
      const markLengthUm = inputs['markLengthUm'] ?? 0;
      const coverage = inputs['coverage'] ?? 0;
      const dieAreaMm2 = inputs['dieAreaMm2'] ?? 0;
      const d0 = inputs['defectDensity'] ?? 0;
      const guardbandPct = inputs['guardbandPct'] ?? 0;
      const redundancy = inputs['redundancy'] ?? 0;
      const parallel = Math.max(inputs['parallelSites'] ?? 1, 1);

      // ── B군: 물리층 조회·기하 판정 ────────────────────────────────────
      const margin = overdriveRangeMarginUm(overdriveUm);
      const clearance = scrubClearance(markLengthUm);
      const nominal = nominalContactResistance({ material, pad: PAD_METAL });
      const force = probeContactForce({
        material, ...odMil(overdriveUm), bound: 'max',
      });
      // 🔴 외란 DS-1 — 문헌 공칭값에 교육용 오염계수를 곱한다. 공칭값 자체는 물리층에서 왔다.
      const contamination = cleaned ? 1 : CONTAMINATION_FACTOR;
      const rc = nominal.value * contamination;

      // ── A군: 물리층 ─────────────────────────────────────────────────
      const areaCm2 = effectiveAreaCm2(dieAreaMm2, redundancy);
      const raw = negativeBinomialYield({ areaCm2, defectDensityPerCm2: d0 }); // S222 · α=2(S223)
      const gross = grossDiePerWafer({ diameterCm: WAFER_DIAMETER_CM, dieAreaCm2: areaCm2 }); // S148
      const y = repaired(raw.value, redundancy);

      // ── scoring: PLN 교육용 설정값 ────────────────────────────────────
      const falseFail = Math.min(
        FALSE_FAIL_CAP,
        FALSE_FAIL_PER_RATIO * Math.max(0, rc / CONTACT_SPEC_UOHM - 1)
          + FALSE_FAIL_PER_PARALLEL * (parallel - 1),
      );
      const observed = y * (1 - falseFail) * (1 - overkillFraction(guardbandPct));
      const waferSeconds = (gross.value * tDieSeconds(coverage)) / parallel
        + WAFER_OVERHEAD_S + (cleaned ? CLEAN_OVERHEAD_S : 0);
      const adProduct = areaCm2 * d0;
      const poissonOk = poissonApplicable(areaCm2, d0);
      const modelNote = poissonOk
        ? `A·D₀ = ${adProduct.toPrecision(3)} — 포아송 적용한계 안. 전 구간 연속성을 위해 음이항 α = ${ALPHA_DEFAULT.value} 로 통일한다.`
        : `🔴 A·D₀ = ${adProduct.toPrecision(3)} 가 포아송 적용한계 ${POISSON_AD_LIMIT.value} 를 넘었다 — 음이항 α = ${ALPHA_DEFAULT.value}(S223) 로 계산한다. S220 §5`;

      return {
        overdriveMarginUm: margin,
        scrubClearanceUm: clearance,
        contactResistanceUOhm: quantity(rc, {
          modelId: 'eds.lab.s7.contactResistanceUOhm', unit: 'µΩ', basis: "교육용 합성 — S229 공칭 접촉저항(조회값)에 교육용 니들오염 배수 3.5 를 곱한 값입니다.",
          validRange: [0, Number.POSITIVE_INFINITY],
          assumptions: [
            OPERATIONAL_ASSUMPTION,
            `공칭값 ${nominal.value} µΩ (${material} / ${PAD_METAL} 패드, S229) — 계산식이 아니라 조회값이다.`,
            cleaned
              ? '외란 DS-1 복구 완료 — 오염계수 1.0.'
              : `🔴 외란 DS-1(니들 오염) 활성 — 교육용 오염계수 ${CONTAMINATION_FACTOR} 배를 곱했다. 이 배수는 문헌값이 아니라 PLN 교육용 설정값이다.`,
          ],
        }),
        defectLevelPpm: quantity(shippedDefectLevelPpm({
          coverage, dieAreaMm2, defectDensityPerCm2: d0, guardbandPct, redundancy,
        }), {
          modelId: 'eds.lab.s7.defectLevelPpm', unit: 'ppm', basis: "교육용 합성 — 문헌식 DL=1−Y^(1−T)(S227)에 교육용 가드밴드 언더킬 3000·exp(−0.35·G) ppm 을 더한 값입니다.",
          validRange: [0, PPM],
          assumptions: ['DL_cov = 1 − Y^(1−T) 는 물리층(S227). 언더킬 UK = 3000·exp(−0.35·G) 는 교육용 설정값이다.', SYNTHETIC_NOTE, modelNote],
        }),
        observedYield: quantity(observed, {
          modelId: 'eds.lab.s7.observedYield', unit: '', basis: "교육용 합성 — 리페어·가짜불량률·오버킬 등 교육용 설정값을 곱한 학습용 관측수율입니다.", validRange: [0, 1],
          assumptions: [
            'Y 는 물리층 음이항(S222 · α=2 S223) + 리페어 이득. 가짜 불량률과 오버킬은 교육용 설정값이다.',
            '🔴 가짜 불량은 다이 결함이 아니라 **접촉 문제**다 — 다른 카드로 재측정하면 대부분 굿으로 나온다.',
            SYNTHETIC_NOTE,
          ],
        }),
        throughputWph: quantity(SECONDS_PER_HOUR / waferSeconds, {
          modelId: 'eds.lab.s7.throughputWph', unit: '웨이퍼/h', unitEn: 'wafer/h', basis: "교육용 합성 — t_die·웨이퍼 오버헤드 60 s·클리닝 오버헤드 30 s 가 모두 교육용 설정값입니다.",
          // 🔴 편측 합격창(min: 8) 의 열린 쪽은 **위**다. 종전 상한은 +Infinity 였다 —
          //    그러면 아무리 큰 처리량도 「성립하는 값」이 되어 정의역이 아무것도 막지 못한다.
          //    웨이퍼당 시간은 다이 테스트 시간이 0 이어도 오버헤드 아래로 내려갈 수 없으므로
          //    처리량의 구조적 상한은 3600 / (웨이퍼 오버헤드) 다. 지어낸 값이 아니라 유도값이다.
          validRange: [0, THROUGHPUT_CEILING_WPH],
          assumptions: [
            '웨이퍼당 다이 수 N 은 물리층(S148). t_die·오버헤드·클리닝 오버헤드는 교육용 설정값이다.',
            `🔴 정의역 상한 ${THROUGHPUT_CEILING_WPH} 웨이퍼/h = ${SECONDS_PER_HOUR} s / 웨이퍼 오버헤드 ${WAFER_OVERHEAD_S} s — 다이 테스트 시간이 0 이어도 넘을 수 없다`,
            SYNTHETIC_NOTE,
          ],
        }),
        falseFailPct: quantity(falseFail * PERCENT, {
          modelId: 'eds.lab.s7.falseFailPct', unit: '%', basis: "교육용 합성 — F = min(0.95, 0.6·max(0, Rc/Rspec−1)+0.002·(P−1)) 는 문헌식이 아닌 교육용 응답식입니다.",
          validRange: [0, PERCENT],
          assumptions: [
            OPERATIONAL_ASSUMPTION,
            '접촉저항이 공칭값의 몇 배인지와 병렬 누화로 정한다 — PLN 교육용 설정값이며 문헌식이 아니다.',
            SYNTHETIC_NOTE,
          ],
        }),
        rawYield: raw,
        grossDie: gross,
        contactForceG: force,
      };
    },
    /* ── 차트 (W6-6 해소 · PLN `threads/parts/차트-P7-eds.md` §1) ──
     * PLN 판정은 **2개**였다: ① DL 확대 판정 차트 ② 가드밴드 언더킬↔오버킬 **설명 도해**.
     * 🔴 **①만 넣었다. ②는 넣지 못했다 — 사유를 숨기지 않고 여기 적는다.**
     *   ② 는 UK(ppm)와 OK(%)를 한 그림에 얹으라는 요구인데 `LabChartBinding` 은 세로축이 1개다.
     *   같은 축(ppm)으로 환산하면 OK 는 G 1 % 당 4,000 ppm 씩 올라 G = 0.75 % 에서 이미 UK 의
     *   출발점 3,000 ppm 을 넘어선다 — UK 의 지수 감쇠가 바닥에 눌려 **도해가 가르치려던 것이 안 보인다.**
     *   축을 둘로 쪼개려면 계약(`LabChartBinding`)을 늘려야 하고, 그것은 이 작업의 범위가 아니다.
     *   → **계약 확장 별건으로 등재**한다. ② 없이도 W6-6 은 ① 로 해소되며,
     *     ② 를 억지로 얹어 「판정 없는 장식」을 만드는 것보다 안 만드는 쪽이 낫다(PLN J3 취지).
     */
    /* ── 씬 병치 (2026-08-22 신설) ──
     * 🔴 선언 방식: `scene` 에 오른쪽 씬을 두고 왼쪽 씬만 `scenes` 에 적는다.
     *    `labSceneBindings()` 가 `scenes` → `scene` 순으로 이어 붙여 [probeScrub, waferMap] 이 된다.
     *    이렇게 하면 `scene` 을 런타임·소스텍스트로 읽는 `scripts/**` 게이트 3종이 그대로 동작한다
     *    (`deposition/lab-advanced` 와 같은 관례). */
    scenes: [
      { sceneId: 'probeScrub', map: probeScrubMap, note: PROBE_SCRUB_NOTE },
    ],
    scene: {
      sceneId: 'waferMap',
      map: waferMapMap,
      note: WAFER_MAP_NOTE,
    },
    charts: edsAdvancedCharts(),
    feedback: [
      {
        id: 'EDS7-F1', tone: 'stop',
        ko: '🔴 외란 DS-1 진단 — 접촉저항이 공칭값의 3.5배입니다. 인덱싱 진행 방향을 따라 파라메트릭 불량이 띠 모양으로 번지고, 다른 카드로 재측정하면 대부분 굿으로 나옵니다. 이것은 다이 결함이 아니라, 니들에 Al 잔재가 쌓인 접촉 문제입니다. (a) 니들 즉시 클리닝을 실행하시오. 이 상태에서 측정한 데이터는 폐기 대상입니다.',
        en: 'Disturbance DS-1 — contact resistance is 3.5x the nominal. Parametric failures spread as a band along the indexing direction, and a different card mostly reads good. This is a contact problem from aluminium residue on the needles, not a die defect. Run (a) immediate needle clean; data taken in this state must be discarded.',
        when: (i) => (i['needleCleanAction'] ?? 0) < 1,
      },
      {
        id: 'EDS7-F2', tone: 'warn',
        ko: '실효 A·D₀ 가 포아송 적용한계 1.0 을 넘었습니다 — 음이항 Y = (1 + A·D₀/2)⁻² 로 계산됩니다(S220 §5 · S223). 다이 면적이나 결함 밀도를 줄이시오.',
        en: 'Effective A·D₀ has crossed the Poisson validity limit of 1.0 — the negative binomial Y = (1 + A·D₀/2)^-2 is used (S220 §5, S223). Reduce die area or defect density.',
        when: (i) => effectiveAreaCm2(i['dieAreaMm2'] ?? 0, i['redundancy'] ?? 0) * (i['defectDensity'] ?? 0)
          >= POISSON_AD_LIMIT.value,
      },
      {
        id: 'EDS7-F3', tone: 'stop',
        ko: '공정 한계선 초과 — 오버드라이브가 실무범위 25~76 µm(S229)를 넘었습니다. 니들 좌굴 위험이 있고, 마크가 패시베이션 개구부를 벗어나기 쉽습니다. OD 를 76 µm 이하로 내리시오.',
        en: 'Limit exceeded — overdrive is above the 25–76 µm practice range (S229). Needle buckling is a risk and the mark easily leaves the passivation opening. Lower OD below 76 µm.',
        when: (i) => (i['overdriveUm'] ?? 0) > OD_HI_UM,
      },
      {
        id: 'EDS7-F4', tone: 'warn',
        ko: '프로브 마크가 패시베이션 개구부(60 µm)를 벗어났습니다. 오버드라이브를 낮춰 마크를 줄이시오. 임시로 OD 를 올려 접촉을 살리려 하면 마크가 개구부를 더 크게 벗어납니다.',
        en: 'The probe mark has left the 60 µm passivation opening. Lower the overdrive to shrink it — raising OD as a stopgap to rescue contact only pushes the mark further outside.',
        when: (_i, o) => (o['scrubClearanceUm'] ?? 0) < 0,
      },
      {
        id: 'EDS7-F5', tone: 'warn',
        ko: '병렬 측정수 과다 — 동시 측정 누화로 파라메트릭 정밀도가 떨어져 가짜 불량률이 올라갔습니다. 처리량은 벌었지만 관측 수율을 잃고 있습니다. P 를 2~4 로 낮추시오.',
        en: 'Too many parallel sites — crosstalk degrades parametric precision and the false-fail rate has risen. You bought throughput and lost observed yield. Drop P to 2–4.',
        when: (i, o) => (i['parallelSites'] ?? 1) >= 6 && (o['falseFailPct'] ?? 0) > 0.5,
      },
      {
        id: 'EDS7-F6', tone: 'warn',
        ko: '가드밴드 과다 — 언더킬은 줄었지만 오버킬로 양품을 버려 관측 수율이 0.800 아래로 내려갔습니다. G 를 6~9 % 로 되돌리시오.',
        en: 'Guardband too wide — underkill is down but overkill has pushed observed yield below 0.800. Return G to 6–9 %.',
        when: (i, o) => (i['guardbandPct'] ?? 0) >= 12 && (o['observedYield'] ?? 0) < S7_OBSERVED_YIELD_MIN,
      },
      {
        id: 'EDS7-F7', tone: 'hint',
        ko: '패턴의 모양(띠·산포)과 어느 신호가 함께 움직였는지를 대조하시오. 접촉 저항이 함께 뛰었다면 접촉 문제, 결함 밀도만 올랐다면 라인 청정도 문제입니다. D₀ 를 올리면 웨이퍼 전면에 고르게 불량이 늘 뿐 고리(에지 링)는 생기지 않습니다 — 에지 링은 가장자리 고유 원인(회전 도포·플라즈마 분포·핸들링)에서 옵니다.',
        en: 'Match the pattern shape against which signal moved with it. If contact resistance jumped too, it is a contact problem; if only defect density rose, it is line cleanliness. Raising D0 adds uniformly distributed failures across the wafer — it never creates an edge ring, which comes from edge-specific causes such as spin coating, plasma distribution, or handling.',
        when: (i, o) => (i['needleCleanAction'] ?? 0) >= 1 && (o['defectLevelPpm'] ?? 0) > S7_DL_MAX_PPM,
      },
      {
        id: 'EDS7-F8', tone: 'hint',
        ko: '처리량이 목표 아래입니다. 병렬 측정수를 올리면 웨이퍼 시간이 그만큼 나뉘지만 누화로 가짜 불량이 늘고, 다이 면적을 키우면 프로빙 횟수가 줄지만 수율이 떨어집니다. 두 길의 대가를 비교하시오.',
        en: 'Throughput is below target. More parallel sites divide the wafer time but add crosstalk false-fails; larger dies cut the touchdown count but lower yield. Weigh the two costs.',
        when: (_i, o) => (o['throughputWph'] ?? 0) < S7_THROUGHPUT_MIN_WPH,
      },
    ],
    tradeoffs: [
      {
        // 🔴 슬라이더 라벨이 `(a)` 이므로 이 상충 설명의 상호참조도 `(a)` 로 맞춘다(2026-08-21).
        ko: '(a) 니들 즉시 클리닝 → 접촉저항이 공칭값으로 복귀해 가짜 불량률이 사라진다(좋음) / 웨이퍼당 오버헤드가 +30 s 늘어 처리량이 떨어진다(나쁨).',
        en: 'Running the immediate needle clean restores nominal contact resistance and clears the false-fail rate (good) but adds 30 s of per-wafer overhead, cutting throughput (bad).',
      },
      {
        ko: '오버드라이브↑ → 접촉력이 커져 접촉이 안정된다(좋음) / 마크가 커져 패시베이션 개구부 여유가 줄고 76 µm 를 넘으면 실무창을 벗어난다(나쁨).',
        en: 'Higher overdrive stabilises contact through greater force (good) but grows the mark toward the passivation edge and leaves the practice window above 76 µm (bad).',
      },
      {
        ko: '커버리지 T↑ → 출하 결함수준 급감(좋음) / 다이당 테스트 시간이 늘어 처리량 감소(나쁨).',
        en: 'Higher coverage collapses the shipped defect level (good) but stretches per-die test time and cuts throughput (bad).',
      },
      {
        ko: '병렬 측정수 P↑ → 웨이퍼 시간이 P 로 나뉘어 처리량이 배수로 오른다(좋음) / 동시 측정 누화로 가짜 불량률이 사이트당 0.2 %p 올라 관측 수율이 떨어진다(나쁨).',
        en: 'More parallel sites divide wafer time and multiply throughput (good) but crosstalk adds 0.2 %p of false-fails per site, lowering observed yield (bad).',
      },
      {
        ko: '다이 면적 A↑ · 결함 밀도 D₀↑ → 프로빙 횟수가 줄어 처리량은 오르지만(좋음) 수율이 음이항으로 떨어지고 결함수준이 올라간다(나쁨). A·D₀ 가 1.0 을 넘으면 포아송으로는 계산할 수 없다.',
        en: 'Larger dies and higher defect density cut touchdown counts and raise throughput (good) but lower the negative-binomial yield and raise the defect level (bad). Past A·D0 = 1.0 the Poisson model no longer applies.',
      },
      {
        ko: '가드밴드 G↑ → 언더킬(불량 유출)이 지수적으로 감소(좋음) / 오버킬로 관측 수율이 1 %당 0.4 %씩 깎인다(나쁨).',
        en: 'A wider guardband cuts escapes exponentially (good) but overkill shaves 0.4 % off observed yield per 1 % (bad).',
      },
    ],
  },
];
