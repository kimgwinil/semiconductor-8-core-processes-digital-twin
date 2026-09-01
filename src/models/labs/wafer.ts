import type { LabChartBinding, LabParam, LabSceneBinding, LabSpec } from './spec';
import { quantity } from '../contract';
import { MINUTES_PER_HOUR, MM2_PER_CM2, MM_PER_CM, PERCENT } from '../physics/units';
import { WAFER_PROCESS_ID } from '../physics/wafer/rules';
import {
  maxPullRate,
  meltConcentrationFromSolid,
  scheilAxialConcentration,
} from '../physics/wafer/czochralski';
import { voronkovRatio, XI_CRIT_ADJUSTED_MAX, XI_CRIT_ADJUSTED_MIN } from '../physics/wafer/pointDefect';
import { resistivityFromDensity } from '../physics/wafer/resistivity';

/**
 * P1 웨이퍼(단결정 성장) 실습 3단계 — PLN `03_실습3단계명세.md` §P1 (S5·S6·S7) 배선.
 * 사슬: 슬라이더 → 물리층 → ①수치 ②판정 ④피드백. **③씬은 없다**(아래 참조).
 *
 * 🔴 **씬 없음.** DSN `12_시각화씬_공백보고.md` — `wafer` 대응 씬 0 %. 결정 성장의 V-I 경계는
 *    `filmGrowth.uniformity` 와 물리가 달라 DSN 이 매핑을 기각했다. 그래서 `scene` 을 넣지 않는다.
 *    하네스가 「내부 시각화 준비 중」을 정직하게 표시한다. 다른 공정 씬을 갖다 붙이지 않는다.
 *
 * 🔴 **A15 — 여기서 문헌식을 새로 쓰지 않는다.** 물리층 호출:
 *    - V/G 비   : `pointDefect.voronkovRatio` (S101)
 *    - 저항률   : `resistivity.resistivityFromDensity` (S100)
 *    - 인상속도 한계선 : `czochralski.maxPullRate` (S106)
 *
 * 🔴 **A6-b — 교육용 합성 계수는 물리층이 아니라 이 파일에 둔다.** 아래 §합성모델 참조.
 *    물리층(`physics/wafer/czochralski.ts`)은 「D = 260 − 32·V 는 지어낸 합성식이며 이 코드베이스에
 *    존재하지 않는다」고 명시한다. 그 판단을 존중해 **합성식은 물리층에 넣지 않고 여기에 격리**했다.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 🔴 **PLN 명세에서 옮긴 것 · 뺀 것 (전건 · 사유 포함)**
 *
 * 1. **[뺐다] S7 도펀트 선택 + 축방향 저항률 편차 Δρ 판정.**
 *    Δρ = [1 − (1−0.85)^(1−k_eff)]×100 은 **편석계수 k₀ 없이는 계산되지 않는다.**
 *    원장 §4-2 **M-1**: 「편석계수 k₀ 표 — 유일 출처 S107 이 라이선스 불가 →
 *    재인용 가능한 출처로 교체 전까지 **화면 사용 보류**」. 물리층도 같은 이유로 k₀ 표를 담지 않고
 *    `SEGREGATION_SOURCE_HIDDEN_IN_UI = true` 로 「S107 을 화면에 노출하지 말라」고 선언한다.
 *    그런데 하네스(`LabRunner`)는 출력의 `sourceId` 를 **무조건 배지로 렌더한다** — 즉 Scheil 기반
 *    출력을 내는 순간 화면에 S107 이 뜬다. 규칙을 어기지 않고 이 판정을 낼 방법이 현재 계약에 없다.
 *    → **기능 자체를 뺐다**(원장 규칙 10 「계수를 확보하지 못하면 그 값을 쓰는 화면 기능을 뺀다」,
 *      M-4 선례). 원장 N-2(k₀ 재인용 출처 확보)가 끝나면 되살린다. **DEV 보고 항목.**
 *    같은 이유로 S5 의 「용융액 초기 농도 C0 → k_eff → 저항률」 경로도 k₀ 를 지나므로,
 *    파라미터를 **결정 상단 도펀트 농도 N_top** 으로 바꿨다(아래 3).
 *
 * 2. 🔴 **[옮겼다] V/G 합격창 0.10~0.16 → 0.085~0.150 mm²/(min·K)** (DEV 팀장 지시 2026-08-20 · A6L-01).
 *    PLN 상한 0.16 과 명세의 외란 B 복구 정답 0.156 이 **원장 S101 Table 4 「adj.」 범위
 *    (ξ_crit 0.85~1.50×10⁻³ cm²/(min·K) = 0.085~0.150 mm²/(min·K))를 벗어난다.**
 *    문헌 계수는 건드리지 않고 창을 문헌 범위로 옮겼다. 창의 두 끝은 숫자로 쓰지 않고
 *    물리층의 `XI_CRIT_ADJUSTED_MIN/MAX`(withSource, S101)에서 파생시킨다. §합성모델 위 주석 참조.
 *    재산출: (V,G) = (0.6, 45) → 0.133 으로 **새 창 안에 그대로 있다**(S6·S7 합격 조합 불변).
 *    나머지 합격창은 PLN 명세 그대로이며 정본 계수로 재계산해도 전부 도달 가능했다.
 *    - S5 직경 198~202 mm : V = 1.9 에서 199.2 mm (스텝 0.1 격자의 유일한 합격점)
 *    - S6 O_i 5.0~8.0 · σ_D ≤ 1.0 : (V,G,ω_c,ω_cr) = (0.6, 45, 22, 6) 에서 전부 합격
 *    - S7 Y ≥ 80 · O_i · R ≥ 0.55 : (0.6, 45, 22, 6, 60, 20) 에서 전부 합격
 *
 * 3. **[바꿨다] S5 파라미터 C0(용융액 초기 농도) → N_top(결정 상단 도펀트 농도).**
 *    이유는 1 과 같다(k₀ 경유 금지). 화면 학습 내용(농도 ↑ → 저항률 ↓, 목표 밴드 8~12 Ω·cm)은
 *    그대로 유지되며, 저항률은 **PLN 의 단순식 1/(q·k_eff·C0·μ_p) 대신 S100 문헌식**으로 낸다.
 *    검산: N_top = 3.0×10¹⁵ → ρ = 4.51 Ω·cm(PLN 의 μ_p = 470 고정 근사는 5.21). **문헌식이 정본이다.**
 *
 * 4. **[바꿨다] S5 「공정 한계선」 V > 2.5 mm/min → 물리층 V_max(직경) 로 대체.**
 *    PLN 근거는 SP-P1-02(12.7~15 cm/h)인데 **우리 원장에 없는 출처**다. 원장 §3-1 은
 *    「⌀12 cm 에서 20–30 cm/h · V_max ∝ r^(−1/2)」(S106)를 싣는다. 그래서 한계선을
 *    `maxPullRate(현재 직경, 하한띠)` 로 계산한다. 결과 임계는 V ≈ 2.8 mm/min(2.5 가 아니다).
 *    🔴 **문헌이 20–30 cm/h 라는 「띠」를 주므로 하한(20)을 임계로 쓴다** — 좁혀 잡는 쪽이 안전하다.
 *
 * 5. **[바꿨다] S7 의 시간축(외란 t = 40:00 / 70:00)을 「레시피 내성」으로 옮겼다.**
 *    하네스는 슬라이더 상태만 있고 시간이 없다. 외란을 흉내내는 가짜 슬라이더를 만드는 대신,
 *    **현재 레시피가 외란 2종을 견디는가**로 수율 Y 를 판정한다(§합성모델 Y 참조).
 *    PLN 이 제시한 해(V=0.6, G=45, ω_c=22, ω_cr=6, Q_Ar=60, P_ch=20)가 Y = 92 % 로 합격하도록
 *    맞췄다 — 즉 **명세의 정답이 그대로 정답이다.**
 *
 * 6. 🔴 **[미해결 · DEV 보고] 합성 출력의 `sourceId`.** `quantity()` 는 `sourceId` 를 필수로 받고
 *    `withSynthetic()` 은 원장에 **`경향모델` 등급으로 등재된 S번호**를 요구하는데, 원장에 그런 항목이
 *    **한 건도 없다**(§2-1 전건이 문헌 출처다). 그래서 합성 응답식의 출력에는 **그 값이 속한 공정의
 *    참조 문헌 S106 을 달고, `assumptions` 에 「계수는 문헌값이 아니다」를 명시**했다.
 *    등급 배지는 **등급 원장**(`src/content/model-grades.json`)의 `kind` 로 갈린다 —
 *    `literature` → `[문헌식]` + 「현업 검증(L2) 전」 고지, `synthetic` → `[경향모델]` + 합성 사유,
 *    `operational` → `[운영규약]`. 🔴 2026-08-20 이전에는 원장이 비어 **전 항목이 똑같이 `[경향모델]`**
 *    이었다(배지가 아무것도 가르지 못하던 결함). 그 서술로 되돌리지 마라.
 *    항구 해법은 **원장에 교육용 합성 항목을 채번**하거나 `Quantity.sourceId` 를 선택 필드로 여는 것이다.
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * 🔴 A6 — 원장에 S번호가 없는 슬라이더 범위는 `basis`(근거 문장)로 근거를 남긴다.
 *    `spec.ts` 의 `LabParam` 에 아직 `basis` 필드가 없어(= `check-labs.mjs` 가 요구하는 두 경로 중
 *    하나가 타입에 없다. **DEV 보고 항목**) 여기서 확장 타입으로 얹는다. UI 는 `sourceId` 만 읽으므로
 *    **없는 출처가 배지로 나가는 일은 없다** — 근거 없는 범위에 가짜 S번호를 다는 것보다 이쪽이 옳다.
 */
type WaferParam = LabParam & { basis?: string };
const params = (list: WaferParam[]): LabParam[] => list;

/* ════════════════════ 단위 환산 (A15 — 환산만 한다) ════════════════════ */

/*
 * 🔴 단위 환산은 **여기서 선언하지 않는다** — `../physics/units.ts` 가 정본이고 위에서 import 한다
 * (`check-constants` R1). 이 파일이 쓰는 것과 쓰는 이유 —
 *   · `MM_PER_CM`  mm/min → cm/min. 물리층 `voronkovRatio` 는 cm/min 을 받는다.
 *   · `MINUTES_PER_HOUR`  cm/h → mm/min. 물리층 `maxPullRate` 는 cm/h 로 낸다.
 *   · `MM2_PER_CM2`  ξ [cm²/(min·K)] → V/G 비 [mm²/(min·K)]. 1 cm² = 100 mm² 이므로 100 배다.
 *     PLN 의 `10·V/G`(V 는 mm/min, G 는 K/cm)와 항등이다 — 검산: V=0.6, G=45 →
 *     ξ = 0.06/45 = 1.333×10⁻³ cm²/(min·K) → ×100 = 0.1333 = 10×0.6/45. ✅
 *   · `PERCENT`  백분율 환산(배수 100).
 *
 * 🔴 **`PERCENT` 자리에 `MM2_PER_CM2` 를 재사용하지 마라.**
 * 2026-08-20 인계 조사에서 적발: 백분율 자리에 면적 환산 상수 `MM2_PER_CM2`(mm²/cm²)가 쓰이고 있었다.
 * 값은 둘 다 100 이라 결과는 맞았지만 **단위 의미가 틀렸고**, 누가 `MM2_PER_CM2` 를 손대면
 * 수율·불량률이 조용히 깨진다. 이름이 거짓말을 하는 상수는 언젠가 사고를 낸다.
 */


/* ════════════════════ §합성모델 — 교육용 합성 계수 (A6-b) ════════════════════
 * 아래 계수는 **전부 PLN `03_실습3단계명세.md` §P1 의 교육용 설정값**이다. 문헌값이 아니다.
 * 물리층에 넣으면 A15 위반이라 여기(labs)에 격리한다. 화면에는 `경향모델` 배지와 고지가 붙는다.
 */

/** S5 직경 응답 `D = 260 − 32·V` (PLN §P1 S5 판정식). 🔴 합성식 — 문헌식이 아니다. */
// 🔴 export — `scenes/models/crystalGrowth.model.ts` D-1 이 같은 식을 재사용한다(정본 하나).
export const DIAMETER_INTERCEPT_MM = 260;
export const DIAMETER_SLOPE_MM_PER_MM_PER_MIN = 32;

/* ══════════ 슬라이더 구간의 정본 ══════════
 * 🔴 종전에는 `min: 15, max: 60` 처럼 각 칸의 params 에 숫자로만 있었다. 씬 배선이 같은 구간을
 *    다시 적으면 정본이 둘이 되고, 한쪽만 고치면 화면이 조용히 어긋난다 — 그래서 이름을 붙여
 *    **params 와 씬 매핑이 같은 상수를 본다.**
 */
const PULL_RANGE_MM_PER_MIN: [number, number] = [0.5, 3];
/**
 * 🔴 심화만 하한 0.2 · 스텝 0.02 다(외란 B 복구 해가 격자 위에 있어야 한다).
 * export — DSN 요구명세 §1-2 가 이 구간을 **씬 `pullRate` 의 공통 앵커**로도 채택했다(§0-2 개정).
 * 기초·응용은 슬라이더 자체가 [0.5,3] 만 내지만, 앵커를 [0.2,3] 으로 잡아야 심화 확장 구간에서
 * 바디 폭이 clamp 되어 얼어붙지 않는다. 세 칸이 **같은 상수**를 봐야 한다 — `crystalGrowth.model.ts` 도
 * 이 값을 그대로 import 한다.
 */
export const PULL_RANGE_ADV_MM_PER_MIN: [number, number] = [0.2, 3];
export const GRADIENT_RANGE_K_PER_CM: [number, number] = [15, 60];
export const CRYSTAL_RPM_RANGE: [number, number] = [5, 30];
export const CRUCIBLE_RPM_RANGE: [number, number] = [2, 20];
export const ARGON_RANGE_SLM: [number, number] = [20, 120];
export const PRESSURE_RANGE_TORR: [number, number] = [10, 760];
/** 공칭(초기)값 — 조작 대상이 아닌 칸에서 씬에 상수로 넘길 때 쓴다. */
const PULL_NOMINAL_MM_PER_MIN = 1.5;
const GRADIENT_NOMINAL_K_PER_CM = 25;
const CRYSTAL_RPM_NOMINAL = 18;
const CRUCIBLE_RPM_NOMINAL = 12;

/** 합성 응답식 `D = 260 − 32·V` 가 기초 칸 슬라이더 구간에서 만드는 직경의 **정의역**. */
const DIAMETER_DOMAIN_MM: [number, number] = [
  DIAMETER_INTERCEPT_MM - DIAMETER_SLOPE_MM_PER_MM_PER_MIN * PULL_RANGE_MM_PER_MIN[1],
  DIAMETER_INTERCEPT_MM - DIAMETER_SLOPE_MM_PER_MM_PER_MIN * PULL_RANGE_MM_PER_MIN[0],
];
/** S5 합격창 (PLN: 200 ± 2 mm). */
const DIAMETER_PASS_MIN_MM = 198;
const DIAMETER_PASS_MAX_MM = 202;
/** S5 참고 목표 저항률 밴드 (PLN: 표시만, 판정 제외). */
const RESISTIVITY_REF_MIN = 8;
const RESISTIVITY_REF_MAX = 12;
/** S5 처리량 경고선 (PLN: V < 0.7 이 지속되면 경고). */
const LOW_THROUGHPUT_MM_PER_MIN = 0.7;

/**
 * 🔴 **V/G 합격창 — 합격창을 옮겼다 (DEV 팀장 지시 2026-08-20 · A6L-01).**
 *  - PLN 명세: 0.10 ~ 0.16 mm²/(min·K)
 *  - 원장 S101 Table 4 「adj.」: ξ_crit = 0.85 ~ 1.50 ×10⁻³ cm²/(min·K) → **0.085 ~ 0.150 mm²/(min·K)**
 *  → **명세 상한 0.16(과 명세의 외란 B 복구 정답 0.156)은 문헌 범위를 벗어난다.** 문헌 계수를 건드리지 않고
 *    **합격창을 문헌 범위로 옮겼다.** 창은 여기서 숫자로 쓰지 않고 **물리층의 `withSource` 상수에서 파생**시킨다
 *    (A6L-01 — V/G 임계는 A6-b 합성값으로 내릴 수 없는 고정 항목이다).
 *  - 재산출한 합격 조합: S6·S7 모두 (V, G) = (0.6, 45) → 0.133 으로 **새 창 안에 그대로 들어간다.**
 *    외란 B 복구 해는 0.288 → **0.27 mm/min 이하**(G = 18 K/cm 에서 0.150 상한), 스텝 0.02 격자에서 **0.26**.
 */
const VG_DISPLAY_DIGITS = 3;
/** 부동소수 잔차(0.08499999999999999)가 화면 규격 표기에 그대로 나가지 않도록 표시 자릿수로 정리한다. */
const vgWindow = (xi: number): number => Number((xi * MM2_PER_CM2).toFixed(VG_DISPLAY_DIGITS));
// 🔴 export — DSN §2-3 D-5 의 ξ_lo/ξ_hi 가 「VG_PASS_MIN/MAX 그 자체」라고 못박았다.
//    씬 모델(`crystalGrowth.model.ts`)이 V–I 경계를 재계산할 때 이 값을 그대로 가져다 쓴다.
export const VG_PASS_MIN = vgWindow(XI_CRIT_ADJUSTED_MIN.value);
export const VG_PASS_MAX = vgWindow(XI_CRIT_ADJUSTED_MAX.value);
/**
 * 폭증/과잉 피드백 임계 (PLN §P1 S6 오조작 표).
 * 🔴 PLN 의 격자간 과잉 경보선 0.06 은 **S6 조작 범위에서 도달 불가**다(최소 V/G = 10×0.5/60 = 0.083).
 *    죽은 피드백이 되므로 **문헌 정의 그대로 「창 아래 = 격자간 과잉」**(S101 §3.2.1: ξ < ξ_crit 이면
 *    interstitial-rich)으로 바꿔 합격창 하한을 경보선으로 쓴다. 스윕에서 발화를 확인했다.
 */
const VG_VACANCY_ALARM = 0.3;
const VG_INTERSTITIAL_ALARM = VG_PASS_MIN;

/** 산소 응답 `O_i = A + 0.45·ω_cr + 0.10·ω_c − 0.010·(Q_Ar−40) + 0.004·(P_ch−30)` [×10¹⁷ cm⁻³]. */
const OXYGEN_BASE_E17 = 2.0;
const OXYGEN_PER_CRUCIBLE_RPM = 0.45;
const OXYGEN_PER_CRYSTAL_RPM = 0.1;
const OXYGEN_PER_ARGON_SLM = 0.01;
const OXYGEN_ARGON_REF_SLM = 40;
const OXYGEN_PER_TORR = 0.004;
const OXYGEN_PRESSURE_REF_TORR = 30;
const OXYGEN_PASS_MIN_E17 = 5;
const OXYGEN_PASS_MAX_E17 = 8;
/** O_i 응답식의 **정의역**. `quantity()` 의 validRange 와 씬 매핑이 같은 상수를 본다. */
const OXYGEN_DOMAIN_E17: [number, number] = [0, 20];

/** 직경 편차 `σ_D = 3.6 − 0.12·ω_c − 0.05·ω_cr + 0.5·(V − 0.5)` [mm] (+ S7 은 Ar 항 추가). */
const SIGMA_BASE_MM = 3.6;
const SIGMA_PER_CRYSTAL_RPM = 0.12;
const SIGMA_PER_CRUCIBLE_RPM = 0.05;
const SIGMA_PER_PULL_RATE = 0.5;
const SIGMA_PULL_REF_MM_PER_MIN = 0.5;
const SIGMA_PER_ARGON_SLM = 0.005;
const SIGMA_PASS_MAX_MM = 1;

/**
 * 🔴 **σ_D 의 정의역** — 이 응답식이 「성립하는」 값의 범위. 합격창(≤ 1 mm)과 다른 것이다.
 *
 * 하한이 **0 인 이유는 근사식의 사정이 아니라 σ 의 정의**다. σ_D 는 직경의 표준편차이고
 * 표준편차는 제곱합의 양의 제곱근이므로 **음수가 될 수 없다.** 문헌을 찾아 정할 여지가 없는 값이다.
 *
 * 위 응답식은 공칭점 부근에서 세운 **선형 근사**다(PLN §P1 S6 — 교육용 합성식이며 문헌식이 아니다).
 * 선형식이므로 회전수를 끝까지 올리고 인상속도를 끝까지 내리면
 * `0.12·ω_c + 0.05·ω_cr > 3.6 + 0.5·(V − 0.5) + 0.005·(Q_Ar − 40)` 구간에서 **음수로 샌다** —
 * 예: (V, ω_c, ω_cr) = (0.5, 30, 2) → **−0.1 mm**. 이것은 근사식이 **유효 구간을 벗어났다**는 뜻이지
 * 편차가 실제로 음수라는 뜻이 아니다.
 *
 * 🔴 **음수를 0 으로 자르지 않는다.** 자르면 증상만 사라지고 「유효 구간을 벗어났다」는 사실이 지워진다 —
 *    학습자는 불가능한 레시피를 σ_D = 0 mm 라는 **완벽한 값**으로 받게 된다. 대신 정의역을 선언해
 *    `quantity()` 가 `outOfRange` 로 표시하고, 판정이 그 표시를 읽어 **합격을 주지 않게** 한다.
 * 🔴 **던지지도 않는다.** 같은 `compute()` 가 수율·산소·V/G 를 함께 내는데, σ_D 가 표시 전용인
 *    심화 칸(S7)에서까지 계산 전체가 정지해 버린다. 이탈은 그 출력 하나에만 물린다.
 *
 * 상한 10 mm 는 ⌀200 mm 잉곳에서 편차 10 mm(=5 %)면 이미 결정이 아니라는 뜻의 보수적 상한이다.
 *
 * 🔴 이 상수 하나를 `quantity()` 의 `validRange` 와 판정 명세의 `domain` **양쪽에 쓴다.**
 *    숫자를 두 번 적으면 둘이 갈라지고, 갈라지면 판정이 다시 거짓말을 시작한다.
 */
const SIGMA_DOMAIN_MM: [number, number] = [0, 10];

/* ══════════════ 🔴 직경 편차 확대 차트 (PLN 명세 §P1 웨이퍼 심화) ══════════════
 * 오케스트레이터 판정으로 **GL 씬에서 σ_D 를 빼고 차트로 이관**한 건이다.
 * 이유: 200 mm 잉곳에서 σ_D = ±0.71 mm 는 단면 씬에서 **±0.34 px(서브픽셀)** 이라 관찰 불가다.
 * 세로축을 200 ± 3 mm 로 확대하면 **1 mm = 40 px → 0.71 mm 가 28 px** 로 또렷해진다.
 * 🔴 PLN 명세 **「판정은 이 차트에서 한다.」** 씬은 직경의 절대 크기 변화만 보여준다.
 *
 * 🔴 지어내지 않은 것: 모델은 길이방향 직경 **프로파일**을 만들지 않는다. σ_D 는 편차 한 값이다.
 *    그래서 길이축을 따라 **포락선**(200 ± σ_D)과 공칭선만 그린다. 없는 프로파일을 그리지 않는다.
 */
const DIAMETER_NOMINAL_MM = 200;
const DIAMETER_ZOOM_HALF_MM = 3;      // PLN 명세 「세로축 200 ± 3 mm 만 확대」
const INGOT_G_START = 0;
const INGOT_G_END = 1;

function diameterZoomChart(judged: boolean): LabChartBinding {
  const span = [
    { x: INGOT_G_START, y: DIAMETER_NOMINAL_MM },
    { x: INGOT_G_END, y: DIAMETER_NOMINAL_MM },
  ];
  return {
    id: 'wafer.diameterZoom',
    kind: 'line',
    ko: '직경 편차 확대 차트',
    en: 'Diameter deviation (zoomed)',
    ...(judged ? { judgesOutputs: ['diameterSigmaMm'] } : {}),
    xKo: '잉곳 고화율 g', xEn: 'Ingot solidified fraction g',
    yKo: '직경', yEn: 'Diameter', yUnit: 'mm',
    yDomain: [DIAMETER_NOMINAL_MM - DIAMETER_ZOOM_HALF_MM, DIAMETER_NOMINAL_MM + DIAMETER_ZOOM_HALF_MM],
    xDomain: [INGOT_G_START, INGOT_G_END],
    refLines: [
      { value: DIAMETER_NOMINAL_MM + SIGMA_PASS_MAX_MM, ko: '규격 상한 (+1 mm)', en: 'Spec upper (+1 mm)', tone: 'spec' },
      { value: DIAMETER_NOMINAL_MM - SIGMA_PASS_MAX_MM, ko: '규격 하한 (−1 mm)', en: 'Spec lower (−1 mm)', tone: 'spec' },
    ],
    captionKo: '200 mm 잉곳의 직경 편차 허용치는 1 mm 도 안 됩니다 — 잉곳을 통째로 보면 보이지도 않는 차이를 실시간 피드백으로 잡아냅니다.',
    captionEn: 'A 200 mm ingot tolerates well under 1 mm of diameter deviation — a difference invisible at full-ingot scale, caught here by real-time feedback.',
    note: '세로축을 200 ± 3 mm 로 확대했습니다. 모델은 길이방향 직경 프로파일을 산출하지 않으므로, 편차 σ_D 의 포락선만 그립니다.',
    build: (_inputs, outputs) => {
      const sigma = outputs['diameterSigmaMm'] ?? 0;
      return [
        { id: 'upper', ko: '직경 +σ_D', en: 'Diameter +σ_D',
          points: span.map((pt) => ({ x: pt.x, y: DIAMETER_NOMINAL_MM + sigma })) },
        { id: 'lower', ko: '직경 −σ_D', en: 'Diameter −σ_D',
          points: span.map((pt) => ({ x: pt.x, y: DIAMETER_NOMINAL_MM - sigma })) },
        { id: 'nominal', ko: '공칭 200 mm', en: 'Nominal 200 mm', points: span, dashed: true },
      ];
    },
  };
}

/* ══════════ 🔴 축방향 저항률 프로파일 차트 (PLN 명세 §P1 웨이퍼 심화) ══════════
 * PLN 명세 「도펀트를 인(P) → 붕소(B)로 바꾸면 … 규격 하한선(수평 빨간 파선, 상단값의 70 %)과의
 *            교차점이 **g = 0.48 에서 g = 0.91 로** 이동한다.」
 * Δρ 불합격으로 종료하려 하면 — PLN 명세 「저항률 프로파일 그래프에 규격 하한 교차점 g = 0.48 강조」.
 *
 * 🔴 **식을 새로 쓰지 않았다.** 곡선의 모든 점은 물리층 호출 2개의 합성이다:
 *    ① `czochralski.scheilAxialConcentration` — C_s(g) = k₀·C₀·(1−g)^(k₀−1) (Scheil)
 *    ② `resistivity.resistivityFromDensity`   — S100 Thurber 문헌식(ρ↔N)
 *    시작 융액 농도 C₀ 도 물리층 `meltConcentrationFromSolid` 로 역산한다.
 *    labs 가 하는 것은 **g 를 훑고 ρ(0) 으로 나누는 정규화**뿐이다.
 *
 * 🔴 **차트는 슬라이더에 반응하지 않는다 — 고정 대조 그림이다.** 사유:
 *    이 실습에는 도펀트 선택 파라미터가 **없다**(파일 상단 「뺐다 1」 — 편석계수 표 출처 S107 이
 *    라이선스 불가라 M-1 이 화면 사용을 막았고, `sourceId` 를 달고 나가는 출력은 만들 수 없다).
 *    차트 계약(`LabChartBinding`)에는 `sourceId` 가 없어 **S107 이 화면에 뜨지 않으므로**,
 *    「판정 출력」이 아니라 **비교 그림**으로는 M-1 을 어기지 않고 실을 수 있다.
 *    → 그래서 `judgesOutputs` 를 달지 않는다. 판정하는 Δρ 출력이 이 실습에 존재하지 않는다.
 *
 * 🔴 k_eff 값의 출처: **PLN 명세 §P1 S7 의 SP-P1-02 명시값**(k_eff(P) = 0.45 · k_eff(B) = 0.85)이며
 *    우리 원장의 S번호가 아니다. 라이선스 불가 문헌의 k₀ 표를 옮겨 온 것이 **아니다.**
 *
 * 🔴 상단 농도는 S5 기초의 기본값(3.0×10¹⁵ cm⁻³)을 그대로 쓴다. 세로축을 ρ(g)/ρ(0) 으로
 *    정규화하므로 이 값은 곡선 모양에만 (이동도 비선형성을 통해) 아주 약하게 관여한다.
 */
const KEFF_PHOSPHORUS = 0.45;
const KEFF_BORON = 0.85;
/** 규격 하한선 — PLN 명세 「규격 하한선(수평 빨간 파선, 상단값의 70 %)」. */
const RESISTIVITY_SPEC_FLOOR_RATIO = 0.7;
/** 붕소 교차점 g = 0.91 이 축 안에 들어와야 하므로 0.85(사용 구간)보다 넓게 훑는다. */
const PROFILE_G_MAX = 0.95;
const PROFILE_G_STEPS = 190;
/** S5 기초의 기본 상단 도펀트 농도. 정규화 축이라 절대값은 축에 남지 않는다. */
const PROFILE_TOP_DENSITY_CM3 = 3e15;

type ProfileDopant = 'phosphorus' | 'boron';

/** ρ(g)/ρ(0) 프로파일 — 🔴 물리층 호출 + 나눗셈만. 캐시는 순수 계산 결과라 결정론을 깨지 않는다. */
const profileCache = new Map<ProfileDopant, Array<{ x: number; y: number }>>();

function axialResistivityRatio(dopant: ProfileDopant, kEff: number): Array<{ x: number; y: number }> {
  const cached = profileCache.get(dopant);
  if (cached) return cached;
  // 🔴 물리층 호출 — 시드단(g = 0) 농도에서 융액 초기 농도를 역산한다.
  const meltCm3 = meltConcentrationFromSolid({
    k0: kEff, solidConcentrationCm3: PROFILE_TOP_DENSITY_CM3, solidFraction: 0,
  }).value;
  const rhoTop = resistivityFromDensity({ dopant, densityCm3: PROFILE_TOP_DENSITY_CM3 }).value;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= PROFILE_G_STEPS; i++) {
    const g = (i / PROFILE_G_STEPS) * PROFILE_G_MAX;
    // 🔴 물리층 호출 ① Scheil → ② S100 문헌식.
    const nCm3 = scheilAxialConcentration({
      k0: kEff, meltConcentrationCm3: meltCm3, solidFraction: g,
    }).value;
    pts.push({ x: g, y: resistivityFromDensity({ dopant, densityCm3: nCm3 }).value / rhoTop });
  }
  profileCache.set(dopant, pts);
  return pts;
}

const AXIAL_PROFILE_USE_LIMIT_G = 0.85;

function axialResistivityChart(): LabChartBinding {
  return {
    id: 'wafer.axialResistivity',
    kind: 'line',
    ko: '잉곳 축방향 저항률 프로파일 (도펀트 비교)',
    en: 'Axial resistivity profile along the ingot (dopant comparison)',
    xKo: '잉곳 고화율 g', xEn: 'Ingot solidified fraction g',
    yKo: '상단 대비 저항률 ρ(g)/ρ(0)', yEn: 'Resistivity relative to the seed end ρ(g)/ρ(0)',
    xDomain: [0, PROFILE_G_MAX],
    // 🔴 규격 하한선 0.70 과 두 교차점이 모두 축 안에 들어오도록 잡았다.
    yDomain: [0, 1.05],
    refLines: [
      {
        value: RESISTIVITY_SPEC_FLOOR_RATIO,
        ko: '규격 하한선 (상단값의 70 %)', en: 'Spec floor (70 % of the seed-end value)',
        tone: 'spec',
      },
    ],
    captionKo: 'k₀ < 1 이라 잉곳 꼬리로 갈수록 도펀트가 쌓이고 저항률이 내려갑니다. 편석계수가 작은 인(P)은 규격 하한선을 g ≈ 0.50 에서 이미 통과하고, 큰 붕소(B)는 g ≈ 0.91 까지 버팁니다 — 같은 잉곳에서 쓸 수 있는 길이가 도펀트 선택 하나로 두 배 가까이 달라집니다.',
    captionEn: 'With k₀ < 1 the tail of the ingot keeps enriching, so resistivity falls along the axis. Phosphorus, with the smaller segregation coefficient, crosses the spec floor at g ≈ 0.50, while boron holds out to g ≈ 0.91 — the dopant choice alone nearly doubles the usable ingot length.',
    note: '세로축은 시드단 값으로 정규화했습니다(두 도펀트의 절대 저항률이 달라 하나의 규격선으로 비교할 수 없기 때문입니다). 곡선은 Scheil 축방향 편석식과 문헌 저항률식(S100)을 물리층에서 호출해 그린 것이며, 이 실습에는 도펀트 선택 슬라이더가 없으므로 차트는 슬라이더에 반응하지 않는 고정 대조 그림입니다. 유효 편석계수 0.45·0.85 는 PLN 실습 명세(SP-P1-02)의 값입니다. 교차점이 명세의 0.48 이 아니라 0.50 인 것은, 명세가 ρ ∝ 1/N 을 가정한 반면 여기서는 이동도의 농도 의존까지 담은 문헌식을 그대로 쓰기 때문입니다(붕소 쪽은 0.91 로 일치합니다).',
    build: () => [
      {
        id: 'phosphorus',
        ko: `인(P) · k_eff = ${KEFF_PHOSPHORUS}`,
        en: `Phosphorus · k_eff = ${KEFF_PHOSPHORUS}`,
        points: axialResistivityRatio('phosphorus', KEFF_PHOSPHORUS),
      },
      {
        id: 'boron',
        ko: `붕소(B) · k_eff = ${KEFF_BORON}`,
        en: `Boron · k_eff = ${KEFF_BORON}`,
        points: axialResistivityRatio('boron', KEFF_BORON),
      },
      {
        id: 'useLimit',
        ko: `사용 구간 끝 g = ${AXIAL_PROFILE_USE_LIMIT_G}`,
        en: `End of the usable section g = ${AXIAL_PROFILE_USE_LIMIT_G}`,
        points: [
          { x: AXIAL_PROFILE_USE_LIMIT_G, y: 0 },
          { x: AXIAL_PROFILE_USE_LIMIT_G, y: 1.05 },
        ],
        dashed: true,
      },
    ],
  };
}

/** 열응력 지수 `τ = 0.04·G` (표시만). 참고 상한 2.0 · 오조작 경고선 G > 55 K/cm. */
const STRESS_PER_GRADIENT = 0.04;
const STRESS_REF_MAX = 2;
const GRADIENT_ALARM_K_PER_CM = 55;

/**
 * S7 수율 모델 (PLN §P1 S7 을 시간축 없는 하네스로 옮긴 것 — 위 5 참조).
 *  - 외란 B(온도구배 붕괴 G → 18 K/cm): 붕괴 순간 V/G 비가 0.5 를 넘으면 습관선이 즉시 소실돼
 *    대응 여유(8초)가 없다 → `V ≥ 0.5·18/10 = 0.9 mm/min` 인 레시피는 구조 손실.
 *  - 외란 A(도가니 침식, 상수항 2.0 → 5.0): 복구 조작(ω_cr↓·Q_Ar↑·P_ch↓)을 **범위 끝까지** 써도
 *    O_i 가 8.0 이하로 돌아오지 못하면 대응 실패 → 결정 회전 ω_c 가 과하면 여기서 걸린다.
 *  - 성공 시 Y = 92 %, 실패 시 Y = 100·g_fail. g_fail 은 외란 B 시각(70 min)까지 굳은 분율
 *    = V·70/300 (바디 목표 길이 300 mm). V 최대 3.0 에서도 70 % 라 **구조 손실은 항상 불합격**이다.
 */
const DISTURBANCE_A_CONSTANT_E17 = 5;
const DISTURBANCE_B_GRADIENT_K_PER_CM = 18;
const STRUCTURE_LOSS_VG = 0.5;
const YIELD_ON_RECOVERY_PCT = 92;
const YIELD_PASS_MIN_PCT = 80;
const DISTURBANCE_B_TIME_MIN = 70;
const INGOT_BODY_TARGET_MM = 300;
const THROUGHPUT_PASS_MIN_MM_PER_MIN = 0.55;
const PRESSURE_LIMIT_TORR = 500;
const ARGON_MIN_SAFE_SLM = 40;

/** 0~1 로 자른다. 씬 매핑 전용(`etch.ts` 와 같은 형식). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 슬라이더·출력 구간을 0~1 로. 씬 매핑 전용. */
function norm(v: number, range: [number, number]): number {
  return clamp01((v - range[0]) / (range[1] - range[0]));
}

function num(inputs: Readonly<Record<string, number>>, id: string, fallback: number): number {
  const v = inputs[id];
  return Number.isFinite(v) ? (v as number) : fallback;
}

/** 산소 응답 — S6(Ar·압력 없음)와 S7 이 같은 식을 쓴다. S6 은 기준값을 넣어 항이 0 이 된다. */
function oxygenE17(a: {
  constantE17: number; crucibleRpm: number; crystalRpm: number; argonSlm: number; pressureTorr: number;
}): number {
  return a.constantE17
    + OXYGEN_PER_CRUCIBLE_RPM * a.crucibleRpm
    + OXYGEN_PER_CRYSTAL_RPM * a.crystalRpm
    - OXYGEN_PER_ARGON_SLM * (a.argonSlm - OXYGEN_ARGON_REF_SLM)
    + OXYGEN_PER_TORR * (a.pressureTorr - OXYGEN_PRESSURE_REF_TORR);
}

/** 직경 편차 응답 — S7 만 Ar 항을 더한다(PLN §P1 S7 상충 관계). */
function sigmaDiameterMm(a: {
  crystalRpm: number; crucibleRpm: number; pullRateMmPerMin: number; argonSlm: number;
}): number {
  return SIGMA_BASE_MM
    - SIGMA_PER_CRYSTAL_RPM * a.crystalRpm
    - SIGMA_PER_CRUCIBLE_RPM * a.crucibleRpm
    + SIGMA_PER_PULL_RATE * (a.pullRateMmPerMin - SIGMA_PULL_REF_MM_PER_MIN)
    + SIGMA_PER_ARGON_SLM * (a.argonSlm - OXYGEN_ARGON_REF_SLM);
}

/** V/G 비 [mm²/(min·K)] — 🔴 물리층 호출 + 단위 환산만. */
function vgRatio(pullRateMmPerMin: number, gradientKPerCm: number): number {
  return voronkovRatio({
    pullRateCmPerMin: pullRateMmPerMin / MM_PER_CM,
    gradientKPerCm,
  }).value * MM2_PER_CM2;
}

/* ══════════════ 🔴 `crystalGrowth` 씬 배선 (DSN 확정명세 `DSN-8대공정-001.SD.md` §2) ══════════════
 *
 * 🔴 **2026-08-21 DSN S-D 가 배선을 다시 확정했다 — 이전 판(출력 기반)을 폐기하고 대체한다.**
 *    이전 판은 `diameterMm`·`vgRatio`·`oxygenE17`·`thermalStressIndex` 같은 **랩 출력**을 정규화해
 *    넘겼다. DSN 확정명세 §2-1 은 이것을 명시적으로 금지한다 — **"outputs 는 쓰지 않는다. 이 씬의
 *    7키는 전부 입력에서 직접 나온다"**(V–I 경계만 예외로 씬 안에서 ξ 를 되계산한다). 이유는 칸간 정합:
 *    기초는 G·회전수가 이 랩의 출력 계산 경로에 아예 없어(응답식이 그 입력을 받지 않는다) 출력 기반으로는
 *    상수를 만들 수 없었다.
 *
 * 씬 키는 **7개**이고 세 칸이 전부 같은 물리 앵커(아래)를 쓴다 — **씬은 자기가 basic/applied/advanced
 * 어느 칸에 붙었는지 모른다.** 칸마다 다른 것은 「어떤 키가 조작 대상이고 어떤 키가 상수인가」뿐이다:
 *
 *   | 키                 | 물리 앵커(0→1)              | basic  | applied | advanced |
 *   |--------------------|------------------------------|--------|---------|----------|
 *   | pullRate           | 0.2 → 3.0 mm/min (§0-2 개정)  | 조작   | 조작    | 조작     |
 *   | thermalGradient    | 15 → 60 K/cm                  | 0.2222 | 조작    | 조작     |
 *   | crystalRotation    | 5 → 30 rpm                    | 0.5200 | 조작    | 조작     |
 *   | crucibleRotation   | 2 → 20 rpm                    | 0.5556 | 조작    | 조작     |
 *   | argonFlow          | 20 → 120 slm                  | 0.2000 | 0.2000  | 조작     |
 *   | chamberPressure    | log10(P/10)/log10(76) (로그축)| 0.2537 | 0.2537  | 조작     |
 *   | solidFraction      | 대응 입력 없음                | 0      | 0       | 0        |
 *
 * 🔴 **상수로 넘기는 키의 사유 (`etch.ts` 406~415행 선례 그대로 note 에 적는다):**
 *   · `thermalGradient`(basic) — G 는 기초의 조작 대상이 아니다. 25 K/cm(`gradientKPerCm.initial`)를
 *     고정해 **등온선이 안 움직이는 것**을 그대로 보여준다.
 *   · `crystalRotation`(basic) · `crucibleRotation`(basic) — 같은 이유. 18/12 rpm 은 각 파라미터의 initial.
 *   · `argonFlow`(basic·applied) — Ar 은 심화에서만 조작한다. 40 slm(`argonSlm.initial`)은 물리층
 *     `OXYGEN_ARGON_REF_SLM` 과 같은 값이라 O_i 응답식에서 그 항이 0 이 되는 기준점이기도 하다.
 *   · `chamberPressure`(basic·applied) — 같은 이유. 30 torr(`chamberTorr.initial`)은 물리층
 *     `OXYGEN_PRESSURE_REF_TORR` 과 같다.
 *   · `solidFraction`(전 칸) — **세 칸 어디에도 대응 lab 입력·출력이 없다**(DSN §2-0). 0 = 바디 성장
 *     개시이며 정지 기하(자유표면 v0.622)와 일치한다. 자체 타이머로 애니메이션하지 않는다(§2-5 #14).
 *
 * 🔴 **로그축 — `chamberPressure` 를 선형으로 넘기면 판정 불가 키가 된다(DSN §1-2 주).**
 *    10~760 torr 를 선형 정규화하면 실 운전대역(11~37 torr)이 0~0.036 에 뭉개져 죽은 슬라이더가 된다.
 *    로그축은 **계수를 발명하는 것이 아니라 축을 고르는 일**이고(진공공학은 압력을 decade 로 읽는다),
 *    이 키의 앵커가 원래 「정성」이므로 A15 위반이 아니다.
 *
 * 🔴 **씬이 직접 되계산하는 것 — V–I 경계 하나뿐.** 씬 모델(`crystalGrowth.model.ts`)이 `pullRate`·
 *    `thermalGradient` 두 키에서 ξ = 10·V/G 를 다시 구하고, 판정창(ξ_lo=0.085·ξ_hi=0.150)은 이 파일이
 *    export 하는 `VG_PASS_MIN`/`VG_PASS_MAX`(= 물리층 `XI_CRIT_ADJUSTED_MIN/MAX`, S101)를 그대로 쓴다
 *    — 창 값을 씬에 다시 적지 않는다. 바디 폭(D-1)·계면 볼록도(D-3)·등온선 간격(D-4)·회전 주기(D-8)·
 *    미립 생성률(D-9)·SiO 흄/분말층(D-10)도 전부 씬 모델이 이 7키에서 직접 유도한다(공식은 DSN §2-3).
 *
 * 🔴 **넘기지 않은 것 — 근거가 없어서다.**
 *   · `topDopantE15` → **씬 키 없음.** 도펀트는 ppb 수준이라 눈에 보이지 않는다 — 그래서 색이 아니라
 *     **저항률**로 잰다(조사 A §F-5, 씬명세 §2-2 기각③). 기초 칸의 이 슬라이더는 화면을 바꾸지 않는다.
 *   · `chamberTorr` 의 **비단조 반전** → 반전 위치가 미확인이다. 임의값을 박으면 그 순간 A15 위반이므로
 *     **반전을 그리지 않는다** — 씬 모델은 흄 알파를 단조 증가로만 구현하고 `DirectionRule` 을
 *     `non-monotonic` 으로 선언해 어긋남의 사유를 남긴다(DSN §2-3 D-10).
 *   · `σ_D` → 200 mm 잉곳에서 ±0.34 px(서브픽셀)이라 씬에서 관찰 불가. `wafer.diameterZoom` 이 판정한다.
 */

/**
 * 🔴 챔버 압력 → 씬 키 (DSN §1-2 · §2-0). `log10(P/10) / log10(P_max/P_min)` — 로그 밑수를
 * 하드코딩하지 않고 **`PRESSURE_RANGE_TORR` 그 자체에서 유도**한다(정본이 둘이면 갈린다는 이 파일의
 * 원칙을 압력 앵커에도 적용한 것). 검산: P=30 → log10(3)/log10(76) = 0.4771/1.8808 = **0.2537**.
 */
const chamberPressureScene = (torr: number): number =>
  clamp01(
    Math.log10(Math.max(torr, PRESSURE_RANGE_TORR[0]) / PRESSURE_RANGE_TORR[0])
    / Math.log10(PRESSURE_RANGE_TORR[1] / PRESSURE_RANGE_TORR[0]),
  );

const CRYSTAL_GROWTH_NOTE_COMMON =
  '씬 7키는 전부 이 칸의 **입력**에서 직접 나온다(outputs 는 쓰지 않는다 — DSN §2-1). '
  + 'V–I 경계 세로선만 예외로, 씬 모델이 pullRate·thermalGradient 두 키에서 ξ = 10·V/G 를 스스로 '
  + '되계산한다(판정창은 이 파일의 VG_PASS_MIN/MAX = 물리층 XI_CRIT_ADJUSTED_MIN/MAX, S101). '
  + '🔴 chamberPressure 는 로그축이다 — 선형이면 실 운전대역이 슬라이더 하단에 뭉개져 죽은 키가 된다. '
  + '🔴 도펀트 농도는 씬 키가 없다 — ppb 수준이라 눈에 보이지 않는다(그래서 저항률로 잰다, 조사 A §F-5). '
  + '🔴 σ_D 는 씬에서 서브픽셀이라 확대 차트가 판정한다. '
  + '🔴 융액은 흰빛이고 주황은 히터에만 쓴다(조사 A §F-5 정정). '
  + '🔴 챔버 압력의 비단조 반전은 위치 미확인이라 그리지 않았다 — 씬 모델은 단조로 구현하고 '
  + 'DirectionRule 은 non-monotonic 으로 선언한다(DSN §2-3 D-10, 구현과 선언의 어긋남은 의도된 것이다).';

/**
 * 기초(S5) — 조작 대상은 인상속도 하나다.
 * 온도구배·회전수·Ar·압력은 **공칭값을 상수로 넘긴다** — 「이 단계에서는 저것들이 안 변한다」를
 * 화면이 그대로 보여주는 것이 학습 의도다(`etch.ts` lab-basic 이 압력·소스파워를 상수로 넘긴 선례).
 * 🔴 pullRate 앵커는 세 칸 공통(`PULL_RANGE_ADV_MM_PER_MIN` = 0.2~3.0)이다 — 기초 슬라이더 자체는
 * 0.5~3 만 내지만, 앵커를 심화 하한(0.2)에 맞추지 않으면 세 칸이 같은 V 에 대해 다른 화면을 그린다.
 */
const waferBasicSceneMap: LabSceneBinding['map'] = (i, out) => ({
  pullRate: norm(out['throughputMmPerMin'] ?? i['pullRateMmPerMin'] ?? PULL_NOMINAL_MM_PER_MIN, PULL_RANGE_ADV_MM_PER_MIN),
  thermalGradient: norm(GRADIENT_NOMINAL_K_PER_CM, GRADIENT_RANGE_K_PER_CM), // 0.2222 — G 는 기초의 조작 대상이 아니다
  crystalRotation: norm(CRYSTAL_RPM_NOMINAL, CRYSTAL_RPM_RANGE), // 0.5200
  crucibleRotation: norm(CRUCIBLE_RPM_NOMINAL, CRUCIBLE_RPM_RANGE), // 0.5556
  argonFlow: norm(OXYGEN_ARGON_REF_SLM, ARGON_RANGE_SLM), // 0.2000 — Ar 은 심화에서만 조작
  chamberPressure: chamberPressureScene(OXYGEN_PRESSURE_REF_TORR), // 0.2537(log) — 압력도 심화 전용
  solidFraction: 0, // 대응 입력 없음(DSN §2-0) — 애니메이션하지 않는다
});

/**
 * 응용(S6) — 1군 4키(V·G·ω_c·ω_cr)가 lab 파라미터와 1:1 로 맞는 **이 씬의 기준 칸**이다.
 * Ar·압력은 이 칸의 조작 대상이 아니라 기준값 고정이다 — O_i 응답식에서 두 항이 0 이 되는 그 값과 같다.
 */
const waferAppliedSceneMap: LabSceneBinding['map'] = (i, out) => ({
  pullRate: norm(out['throughputMmPerMin'] ?? i['pullRateMmPerMin'] ?? PULL_NOMINAL_MM_PER_MIN, PULL_RANGE_ADV_MM_PER_MIN),
  thermalGradient: norm(i['gradientKPerCm'] ?? GRADIENT_NOMINAL_K_PER_CM, GRADIENT_RANGE_K_PER_CM),
  crystalRotation: norm(i['crystalRpm'] ?? CRYSTAL_RPM_NOMINAL, CRYSTAL_RPM_RANGE),
  crucibleRotation: norm(i['crucibleRpm'] ?? CRUCIBLE_RPM_NOMINAL, CRUCIBLE_RPM_RANGE),
  argonFlow: norm(OXYGEN_ARGON_REF_SLM, ARGON_RANGE_SLM), // 0.2000 — Ar 은 심화 전용
  chamberPressure: chamberPressureScene(OXYGEN_PRESSURE_REF_TORR), // 0.2537(log)
  solidFraction: 0,
});

/**
 * 심화(S7) — 응용 4키 + Ar 유량 + 챔버 압력, 전부 이 칸의 입력에서 직접 온다.
 * 🔴 인상속도 앵커는 세 칸 공통(`PULL_RANGE_ADV_MM_PER_MIN`)이라 기초·응용과 같은 상수를 그대로 쓴다
 *    — 이 칸만 슬라이더 자체의 min·step 이 다를 뿐(0.2 · 0.02), 씬에 넘기는 정규화 식은 동일하다.
 */
const waferAdvancedSceneMap: LabSceneBinding['map'] = (i, out) => ({
  pullRate: norm(out['throughputMmPerMin'] ?? i['pullRateMmPerMin'] ?? PULL_NOMINAL_MM_PER_MIN, PULL_RANGE_ADV_MM_PER_MIN),
  thermalGradient: norm(i['gradientKPerCm'] ?? GRADIENT_NOMINAL_K_PER_CM, GRADIENT_RANGE_K_PER_CM),
  crystalRotation: norm(i['crystalRpm'] ?? CRYSTAL_RPM_NOMINAL, CRYSTAL_RPM_RANGE),
  crucibleRotation: norm(i['crucibleRpm'] ?? CRUCIBLE_RPM_NOMINAL, CRUCIBLE_RPM_RANGE),
  argonFlow: norm(i['argonSlm'] ?? OXYGEN_ARGON_REF_SLM, ARGON_RANGE_SLM),
  chamberPressure: chamberPressureScene(i['chamberTorr'] ?? OXYGEN_PRESSURE_REF_TORR),
  solidFraction: 0,
});

/**
 * 성장 완료 잉곳을 후속 다중 와이어 슬라이싱 장면으로 인계한다.
 * 성장 처리량을 와이어 이송속도로 재해석하지 않는다. 장면은 현재 잉곳의 직경·편차·수율만 읽고,
 * 와이어 속도·장력·kerf·TTV는 별도 물리모델이 마련될 때까지 고정된 공정 동작으로 보인다.
 */
const waferSlicingBasicSceneMap: LabSceneBinding['map'] = (_i, out) => ({
  diameter: norm(out['diameterMm'] ?? DIAMETER_NOMINAL_MM, DIAMETER_DOMAIN_MM),
  deviation: 0,
  quality: clamp01(1 - Math.abs((out['diameterMm'] ?? DIAMETER_NOMINAL_MM) - DIAMETER_NOMINAL_MM) / 50),
});

const waferSlicingAppliedSceneMap: LabSceneBinding['map'] = (_i, out) => ({
  diameter: norm(DIAMETER_NOMINAL_MM, DIAMETER_DOMAIN_MM),
  deviation: norm(out['diameterSigmaMm'] ?? 0, SIGMA_DOMAIN_MM),
  quality: clamp01(1 - (out['diameterSigmaMm'] ?? 0) / SIGMA_DOMAIN_MM[1]),
});

const waferSlicingAdvancedSceneMap: LabSceneBinding['map'] = (_i, out) => ({
  diameter: norm(DIAMETER_NOMINAL_MM, DIAMETER_DOMAIN_MM),
  deviation: norm(out['diameterSigmaMm'] ?? 0, SIGMA_DOMAIN_MM),
  quality: clamp01((out['yieldPercent'] ?? 0) / PERCENT),
});

const WAFER_SLICING_SCENE_NOTE = '성장 완료 잉곳이 다중 와이어 웹을 통과해 얇은 웨이퍼로 분리되는 후속 공정 인계 장면입니다. '
  + '현재 성장 실습의 직경·직경편차·수율만 장면에 연결합니다. 성장 처리량을 와이어 절입속도로 바꾸어 읽지 않으며, '
  + '와이어 속도·장력·kerf·TTV는 별도 문헌 기반 물리모델이 없으므로 고정 동작으로 표시합니다.';

/** 기초(S5) CZ 성장 씬 설명. 🔴 `scenes[0]` 과 `scene` 두 곳이 같은 문장을 써야 해서 상수로 뺐다
 *  (2026-09-01 PLN §27-5 B안 — 순서 교환). 문장을 두 벌 적으면 갈라진다. */
const WAFER_BASIC_GROWTH_NOTE = '기초에서 조작 대상은 pullRate 하나다 — 바디 폭·메니스커스 링 2개(같은 방향·같은 크기)· '
  + '계면 볼록도·성장 파셋 스크롤 속도가 여기 반응한다. '
  + 'thermalGradient(0.2222=G 25 K/cm)·crystalRotation(0.5200=18 rpm)·crucibleRotation(0.5556=12 rpm)· '
  + 'argonFlow(0.2000=40 slm)·chamberPressure(0.2537=30 torr)는 전부 각 파라미터의 initial 값을 상수로 넘긴다 '
  + '— 「이 단계에서는 저것들이 안 변한다」를 화면이 그대로 보여주는 것이 학습 의도다. '
  + '🔴 V–I 경계선은 G=25 고정 때문에 ξ=10V/25 가 이 칸의 실제 슬라이더 구간 V 0.5~3.0 전체에서 '
  + '0.2~1.2 로 ξ_hi(0.150) 를 항상 넘는다(DSN §2-3 D-5) — 경계선이 바디 외곽선과 항상 겹쳐 소멸 '
  + '상태다(영구히 안 보인다, 결함 아님). 🔴 씬 앵커 자체는 V 0.2 까지 열려 있어 ξ 가 0.08 까지 내려가고 '
  + '거기서는 경계선이 축으로 모여 다시 나타나지만, **기초 슬라이더는 V 0.5 아래로 못 내려가 이 구간에 '
  + '닿지 않는다.** '
  + '🔴 도펀트 농도 슬라이더는 화면을 바꾸지 않는다 — 씬 키가 없다(의도된 결과, 위 공통 사유 참조). '
  + CRYSTAL_GROWTH_NOTE_COMMON;

/* ══════════ 🔴 V/G 무결함 창 차트 — **판정 차트다** (PLN PD-41-2 · PD-42 확정) ══════════
 *
 * ── 왜 새로 만들었나 ────────────────────────────────────────────────────────────
 *   S7 심화의 기존 두 차트는 **판정을 그리지 않는다.** `wafer.diameterZoom` 이 그리는 σ_D 는
 *   이 칸에서 `role:'display'` 이고(S7 성공조건에 σ_D 가 없다), `wafer.axialResistivity` 가
 *   그리던 Δρ 판정은 M-1(S107 라이선스 불가)로 **기능째 삭제**되어 그릴 판정 자체가 없다.
 *   🔴 그래서 σ_D 를 판정으로 승격하는 길(PLN ⓐ안)은 **반려됐다** — display 를 `judgesOutputs`
 *      에 올리면 「판정하지 않는 값을 판정 경로로 표시」(W6-5)가 된다.
 *   → PLN 이 지정한 답은 **판정 출력 `vgRatio` 를 그리는 차트를 새로 만드는 것**이다.
 *
 * ── 왜 이 판정에 그림이 필요한가 (PLN 근거 2가지) ────────────────────────────────
 *   ① **창이 극단적으로 좁다.** 무결함 창 폭 0.065 는 조작으로 도달 가능한 V/G 폭
 *      1.9667(V 0.2~3.0 · G 15~60 → 0.0333~2.0)의 **3.3 %** 다. 세로축을 0~0.30 으로
 *      확대하지 않으면 합격선이 한 점으로 뭉개진다.
 *   ② **V/G 는 두 파라미터의 비다.** 숫자 하나로는 「창 밖이다」까지만 알고 **어느 방향으로
 *      움직여야 창 안이면서 처리량도 지키는지**를 못 본다. 피드백 `WF-X-VG` 가 이미
 *      「V 와 G 를 함께 올려라」라고 2차원 탐색을 지시하는데 그 말을 보여 주는 화면이 없었다.
 *   ③ 이 칸에는 **GL 씬이 없다**(`crystalGrowth` 미구현). 판정의 시각 경로가 숫자 하나뿐이었다.
 *
 * 🔴 **식을 새로 쓰지 않았다.** 곡선의 모든 점은 같은 파일의 `vgRatio()` 호출이고, 그것은
 *    물리층 `voronkovRatio`(S101) + 단위 환산일 뿐이다. `compute()` 가 판정에 쓰는 함수와
 *    **같은 함수 하나**로 그린다(`diameterZoomChart` 가 보여 준 관례와 같다).
 * 🔴 **규격선 0.085·0.150 을 리터럴로 적지 않았다** — `VG_PASS_MIN/MAX` 는 물리층의
 *    `XI_CRIT_ADJUSTED_MIN/MAX`(withSource, S101)에서 파생된다. 합격창과 정본이 하나다.
 * 🔴 **세로축은 고정이다**(PD-43 확대 판정차트 규약). 현재 V/G 가 0.30 을 넘으면 동작점이
 *    축 위로 벗어나는데, 축을 자동으로 늘리면 합격창이 다시 뭉개진다. 대신 「현재 V 곡선」이
 *    화면 위에서 내려오는 모습으로 방향을 읽게 한다.
 *    (축 밖 화살표 배지는 `src/viz` 차트 컴포넌트 몫이라 여기서 하지 않는다.)
 *
 * ── 🔴 합격창의 **정본은 `refLines` 다.** 사각형 계열은 2026-08-22 에 지웠다. 되살리지 마라 ──
 *   종전: 같은 `VG_PASS_MIN/MAX` 가 화면에 **두 번** 나왔다. `refLines` 의 규격선 2개와,
 *   `build()` 안의 `passWindow` 계열(네 꼭짓점으로 그린 합격창 **사각형**)이다.
 *
 *   **왜 둘이었나 — 보험이었다.** 당시 `LineChart`·`BarChart`·`ProfileChart` 가 계열을 3개까지만
 *   그렸고(`slice(0, 3)` 5곳 + `BarChart` 의 `Math.min(3, …)` 1곳), `LabCharts.tsx` 는
 *   `[...series, ...refSeries]` 로 **규격선을 배열 끝**에 붙인다. 즉 상한은 언제나 **판정선부터**
 *   먹었다. 그래서 「기준선 계열이 잘려도 창은 남게」 사각형을 데이터 계열 쪽에 하나 더 둔 것이다.
 *
 *   🔴 **전제가 둘 다 사라졌다(2026-08-22 실측):**
 *     ㄱ 3계열 상한이 2026-08-21 에 **6곳 전부** 제거됐다(`viz/chart/common.ts` 의 「다시 넣지 마라」
 *       주석 참조). 절단 철자 전수 grep(`slice(0, 3)` · `Math.min(3` · `MAX_SERIES` · `length > 3`)
 *       에서 차트 코드 적중 **0건** — 남은 것은 그 사건을 기록한 주석뿐이다.
 *     ㄴ `tone: 'spec'` 이 실제 렌더까지 닿는다. `LabCharts.tsx` 가 `refLines` 를 계열로 실어
 *       보내면서 `tone` 을 붙이고(없으면 `'spec'` 으로 본다), `LineChart` 가 `styledSeries()` 로
 *       전용 색(`TONE_COLORS.spec`)·전용 파선(`SPEC_DASH`)·`data-series-tone` 을 준다.
 *       잘릴 걱정도, 데이터 계열과 섞여 보일 걱정도 없어졌다.
 *
 *   **왜 사각형을 지우고 `refLines` 를 남겼나 — 정보가 사라지지 않는 쪽이 `refLines` 다:**
 *     ① 🔴 **게이트가 보는 쪽이 `refLines` 다.** `check-wiring` W6-4 는 `c.refLines` 의 값을 판정
 *        출력의 합격창 경계와 대조하고, `check-chart-series` C2 는 `(c.refLines ?? []).length` 를
 *        필요 계열 수에 더한다. 사각형은 게이트에게 그냥 **데이터 계열 하나**일 뿐 합격창이 아니다.
 *        `refLines` 를 지웠다면 게이트가 눈이 멀었을 것이다.
 *     ② 사각형에는 `tone` 이 없어 **데이터 팔레트 순번을 훔친다** — 2026-08-21 색 충돌의 원인이
 *        정확히 이것이었다. 규격선은 팔레트를 쓰지 않아야 한다.
 *     ③ 사각형의 좌우 변은 x 정의역 양 끝(15·60 K/cm)에 딱 붙어 축 테두리와 겹쳐 보였다. 실제로
 *        눈에 남는 것은 수평 두 변뿐이었고, 그것은 `refLines` 가 그리는 선 두 개와 같은 그림이다.
 *
 *   🔴 **지운 쪽의 정보는 옮겨 두었다.** 사각형의 범례 문구에만 있던 **수치**
 *      (`무결함 창 0.085 ~ 0.150`)를 아래 `refLines` 의 `ko`/`en` 으로 이관했다. 종전 규격선
 *      라벨은 「상한」·「하한」이라고만 해서 화면에 숫자가 없었다. 라벨에서 수치를 다시 빼지 마라.
 */
/** 가로축 = G 슬라이더 정의역. S6·S7 의 `gradientKPerCm` min/max 와 같은 창이다. */
const VG_CHART_G_MIN_K_PER_CM = 15;
const VG_CHART_G_MAX_K_PER_CM = 60;
/** G 슬라이더 스텝(1 K/cm)과 같은 간격으로 훑는다 — 학습자가 밟을 수 있는 점만 그린다. */
const VG_CHART_G_STEP_K_PER_CM = 1;
/** 🔴 확대 세로축 상한. 도달 상한 2.0 까지 그리면 창(폭 0.065)이 다시 한 점이 된다. */
const VG_CHART_Y_MAX = 0.3;

function vgWindowChart(): LabChartBinding {
  const gAxis: number[] = [];
  for (let g = VG_CHART_G_MIN_K_PER_CM; g <= VG_CHART_G_MAX_K_PER_CM; g += VG_CHART_G_STEP_K_PER_CM) {
    gAxis.push(g);
  }
  return {
    id: 'wafer.vgWindow',
    kind: 'line',
    ko: 'V/G 무결함 창',
    en: 'V/G defect-free window',
    // 🔴 이 칸에서 유일하게 판정을 그리는 차트다. 화면에 「판정은 이 차트에서 합니다」가 뜬다.
    judgesOutputs: ['vgRatio'],
    xKo: '축방향 온도구배 G', xEn: 'Axial temperature gradient G', xUnit: 'K/cm',
    yKo: 'V/G 비', yEn: 'V/G ratio', yUnit: 'mm²/(min·K)',
    xDomain: [VG_CHART_G_MIN_K_PER_CM, VG_CHART_G_MAX_K_PER_CM],
    yDomain: [0, VG_CHART_Y_MAX],
    // 🔴 **합격창의 정본은 여기다**(머리주석 참조). 사각형 계열을 지운 대신 라벨에 수치를 실었다 —
    //    숫자를 리터럴로 적지 않는다는 이 파일의 관례는 그대로다(`VG_PASS_*` 에서 포맷만 한다).
    refLines: [
      { value: VG_PASS_MAX, ko: `무결함 창 상한 ${VG_PASS_MAX.toFixed(VG_DISPLAY_DIGITS)}`, en: `Defect-free window upper ${VG_PASS_MAX.toFixed(VG_DISPLAY_DIGITS)}`, tone: 'spec' },
      { value: VG_PASS_MIN, ko: `무결함 창 하한 ${VG_PASS_MIN.toFixed(VG_DISPLAY_DIGITS)}`, en: `Defect-free window lower ${VG_PASS_MIN.toFixed(VG_DISPLAY_DIGITS)}`, tone: 'spec' },
    ],
    captionKo: '무결함 창의 폭 0.065 는 조작으로 도달할 수 있는 V/G 범위의 3 % 밖에 안 됩니다 — 세로축을 0 ~ 0.30 으로 확대해야 합격선이 보입니다. 곡선 위에서 인상속도를 올리면 처리량이 오르지만 점이 창 위로 밀려납니다. 온도구배를 함께 올려 되돌리십시오.',
    captionEn: 'The defect-free window is only 0.065 wide — about 3 % of the V/G range the sliders can reach, so the vertical axis has to be zoomed to 0–0.30 before the pass band is even visible. Raising the pull rate along the curve buys throughput but pushes the operating point above the window; raise the temperature gradient with it to come back down.',
    note: '곡선은 현재 인상속도 V 를 고정한 채 온도구배 G 만 슬라이더 격자(1 K/cm)로 훑은 것이며, compute() 가 판정에 쓰는 V/G 함수와 같은 함수 하나로 그립니다. 세로 점선은 현재 조작점(G, V/G)입니다. 규격선 두 개는 문헌 임계 ξ_crit(S101 Table 4 「adj.」)에서 그대로 환산한 값이며, 세로축은 0 ~ 0.30 으로 고정했습니다 — 현재 V/G 가 이보다 크면 동작점이 축 위로 벗어납니다(축을 늘리면 합격창이 다시 뭉개지기 때문에 늘리지 않습니다).',
    build: (inputs, outputs) => {
      const v = inputs['pullRateMmPerMin'] ?? 0;
      const g = inputs['gradientKPerCm'] ?? VG_CHART_G_MIN_K_PER_CM;
      const vg = outputs['vgRatio'] ?? vgRatio(v, g);
      // 🔴 여기서 합격창을 **다시 그리지 않는다.** 정본은 위 `refLines` 다(머리주석 「합격창의
      //    정본은 refLines 다」 참조). 종전의 `passWindow` 사각형 계열은 3계열 상한 시절의
      //    보험이었고, 상한이 사라지고 `tone:'spec'` 이 들어오면서 순수한 중복이 됐다.
      return [
        {
          id: 'vCurve',
          ko: `현재 인상속도 V = ${v} mm/min`,
          en: `Current pull rate V = ${v} mm/min`,
          // 🔴 물리층 호출뿐이다 — 새 식 0개.
          points: gAxis.map((gx) => ({ x: gx, y: vgRatio(v, gx) })),
        },
        {
          id: 'operating',
          ko: '현재 조작점 (G, V/G)',
          en: 'Current operating point (G, V/G)',
          points: [{ x: g, y: 0 }, { x: g, y: vg }],
          dashed: true,
        },
      ];
    },
  };
}

/* ════════════════════ 실습 3단계 ════════════════════ */

export const WAFER_LABS: LabSpec[] = [
  /* ───────────────── S5 기초 — 인상속도로 직경 맞추기 ─────────────────
   * 죽은 판정 없음: 기본값 V = 1.5 → D = 212.0 mm **불합격**.
   * 🔴 합격 조합: **V = 1.9 mm/min → D = 199.2 mm 합격**(스텝 0.1 격자에서 유일한 합격점.
   *    연속값 합격창은 V = 1.8125 ~ 1.9375). N_top 은 판정에 들어가지 않는다.
   *    참고 밴드까지 맞추려면 N_top = 1.3~1.4 (×10¹⁵) 에서 ρ = 8~12 Ω·cm 에 든다.
   */
  {
    processId: WAFER_PROCESS_ID,
    stage: 'lab-basic',
    objectiveId: 'LO-P1-03',
    titleKo: '인상속도로 결정 직경 맞추기',
    titleEn: 'Hit the target crystal diameter with pull rate',
    params: params([
      {
        id: 'pullRateMmPerMin', ko: '인상속도 V', en: 'Pull rate V', ja: '引き上げ速度 V', unit: 'mm/min',
        min: PULL_RANGE_MM_PER_MIN[0], max: PULL_RANGE_MM_PER_MIN[1], step: 0.1, initial: PULL_NOMINAL_MM_PER_MIN, sourceId: 'S106',
        note: '상한 3.0 mm/min 은 ⌀20 cm 에서의 문헌 V_max 띠(2.58~3.87 mm/min = 20~30 cm/h·r^(−1/2), S106 §A.1·Fig.3) 안에 있다.',
      },
      {
        id: 'topDopantE15', ko: '결정 상단 도펀트 농도(붕소)', en: 'Top dopant density (boron)', ja: '結晶上部のドーパント濃度（ホウ素）', unit: '×10¹⁵ cm⁻³',
        min: 0.5, max: 10, step: 0.1, initial: 3, sourceId: 'S100',
        note: 'S100 붕소 피팅 유효구간(ρ 0.00085~100 Ω·cm ⇒ N ≳ 1.3×10¹⁴ cm⁻³) 안쪽으로 잡았다. 전 구간에서 역산이 수렴한다.',
      },
    ]),
    outputs: [
      { id: 'diameterMm', ko: '결정 직경 D', en: 'Crystal diameter', ja: '結晶直径 D', role: 'judge',
        pass: { min: DIAMETER_PASS_MIN_MM, max: DIAMETER_PASS_MAX_MM }, digits: 1 },
      { id: 'throughputMmPerMin', ko: '처리량 R', en: 'Throughput', ja: 'スループット R', role: 'display', digits: 2 },
      { id: 'topResistivityOhmCm', ko: '상단 저항률 ρ_T', en: 'Top resistivity', ja: '上部抵抗率 ρ_T', role: 'display', digits: 2 },
      { id: 'pullRateLimitMmPerMin', ko: '이 직경의 문헌 최대 인상속도', en: 'Literature max pull rate at this diameter', ja: 'この直径における文献上の最大引き上げ速度', role: 'display', digits: 2 },
    ],
    compute(inputs) {
      const v = num(inputs, 'pullRateMmPerMin', 1.5);
      const nTop = num(inputs, 'topDopantE15', 3);

      // 🔴 합성 응답식(A6-b). 물리층이 거부한 식이라 물리층을 부르지 않는다 — 파일 상단 §합성모델 참조.
      const diameterMm = DIAMETER_INTERCEPT_MM - DIAMETER_SLOPE_MM_PER_MM_PER_MIN * v;

      // 🔴 물리층 호출 — 저항률(S100)·인상속도 한계선(S106).
      const rho = resistivityFromDensity({ dopant: 'boron', densityCm3: nTop * 1e15 });
      const vMax = maxPullRate({ diameterCm: diameterMm / MM_PER_CM, bound: 'low' });

      return {
        diameterMm: quantity(diameterMm, {
          modelId: 'wafer.lab.diameterMm', unit: 'mm', basis: "교육용 합성 — D = 260 − 32·V 는 학습용 합성 응답식이며 S106 은 「인상속도↑ → 직경↓」 방향의 근거일 뿐 계수의 출처가 아닙니다.",
          validRange: DIAMETER_DOMAIN_MM,
          assumptions: [
            '🔴 교육용 합성 응답식 D = 260 − 32·V (PLN §P1 S5). 계수는 문헌값이 아니다',
            'S106 은 「인상속도를 올리면 직경이 준다」는 방향의 근거일 뿐 계수의 출처가 아니다',
          ],
        }),
        throughputMmPerMin: quantity(v, {
          modelId: 'wafer.lab.throughput', unit: 'mm/min', basis: "교육용 합성 — 처리량을 인상속도 그 자체(mm/min)로 두는 것은 학습용 정의이며 문헌이 준 지표가 아닙니다.",
          validRange: [0, 3],
          assumptions: ['처리량은 인상속도 그 자체다(길이 기준). 단위 환산 없음'],
        }),
        topResistivityOhmCm: quantity(rho.value, {
          modelId: 'wafer.lab.topResistivity', unit: 'Ω·cm', sourceId: 'S100',
          validRange: rho.validRange,
          assumptions: [...rho.assumptions, '결정 상단(시드단) 값. 축방향 편석은 이 단계에서 다루지 않는다'],
        }),
        pullRateLimitMmPerMin: quantity((vMax.value * MM_PER_CM) / MINUTES_PER_HOUR, {
          modelId: 'wafer.lab.pullRateLimit', unit: 'mm/min', basis: "교육용 합성 — V_max ∝ r^(−1/2)(S106)는 문헌식이나 대입되는 직경이 학습용 합성 응답식 D = 260 − 32·V 의 출력입니다.",
          validRange: [0, 10],
          assumptions: [...vMax.assumptions, '문헌 띠(20~30 cm/h)의 하한을 한계선으로 쓴다 — 좁혀 잡는 쪽이 안전하다'],
        }),
      };
    },
    /* 🔴 2026-09-01 — **PLN §27-5 B안(순서 교환) 채택.** 오케스트레이터 판정(CEO 승인 하).
     *
     * 무엇이 문제였나: `labSceneBindings()`(`spec.ts:346`)는 **`scenes[]` 를 먼저, `scene` 을 뒤에**
     * 놓는다. 그래서 `ingotSlicing`(후속 단계 인계 장면)이 **첫 칸**을 차지해 제목바·배경 PNG·
     * 번호 마커를 독점했고, 정작 이 칸의 학습 대상인 **CZ 인상(`crystalGrowth`)이 뒤로 밀렸다**
     * (PLN §27-2 관찰). 명세에 이 배선을 지시한 문장은 검색 44건 대조에서 **0건**이다(§27-5 ①).
     *
     * 🔴 **삭제가 아니라 순서 교환이다.** D-045 3단 확인에서 ②(다른 공정도 씬 병치를 쓴다 —
     *    `eds.ts:1221`·`deposition.ts:1171`)와 ③(`wafer.ts:586-590` 주석이 인계 의도를 명시)이
     *    걸렸으므로 **「고쳐라」가 아니라 「판정하라」** 였고, 판정 결과가 B(가장 싼 반증 실험)다.
     *    슬라이싱 장면은 **그대로 남는다** — 학습 순서만 CZ → 슬라이싱으로 바로잡는다.
     *
     * 구현: 두 씬을 `scenes[]` 에 **원하는 순서로** 넣는다. `scene` 은 지우지 않는다 —
     * `labSceneBindings` 가 `seen` 집합으로 중복을 걸러 `crystalGrowth` 를 두 번 그리지 않고,
     * `spec.scene` 을 읽는 다른 경로(게이트 포함)가 종전대로 동작한다. */
    scenes: [
      { sceneId: 'crystalGrowth', map: waferBasicSceneMap, note: WAFER_BASIC_GROWTH_NOTE },
      { sceneId: 'ingotSlicing', map: waferSlicingBasicSceneMap, note: WAFER_SLICING_SCENE_NOTE },
    ],
    scene: {
      sceneId: 'crystalGrowth',
      map: waferBasicSceneMap,
      note: WAFER_BASIC_GROWTH_NOTE,
    },
    feedback: [
      {
        id: 'WF-B-STOP', tone: 'stop',
        ko: '공정 한계선 초과 — 이 직경에서 문헌이 보고한 최대 인상속도(S106: ⌀12 cm 20 cm/h · V_max ∝ r^(−1/2))를 넘었습니다. 계면이 잠열을 버리지 못해 성장이 끊깁니다.',
        en: 'Process limit exceeded — beyond the literature maximum pull rate at this diameter (S106: 20 cm/h at ⌀12 cm, V_max ∝ r^(−1/2)). The interface cannot reject the latent heat and growth breaks down.',
        when: (i, o) => (i['pullRateMmPerMin'] ?? 0) > (o['pullRateLimitMmPerMin'] ?? Infinity),
      },
      {
        id: 'WF-B-LOWV', tone: 'warn',
        ko: '직경은 커지지만 시간당 생산량이 목표의 절반 이하입니다. 상충을 확인하세요.',
        en: 'The diameter grows, but throughput falls below half the target. Check the trade-off.',
        when: (i) => (i['pullRateMmPerMin'] ?? 0) < LOW_THROUGHPUT_MM_PER_MIN,
      },
      {
        id: 'WF-B-BIG', tone: 'hint',
        ko: '직경이 목표보다 큽니다. 인상속도를 올리면 직경이 줄어듭니다 — 0.1씩 올려 보세요.',
        en: 'The diameter is above target. Raising the pull rate shrinks it — try +0.1 steps.',
        when: (_i, o) => (o['diameterMm'] ?? 0) > DIAMETER_PASS_MAX_MM,
      },
      {
        id: 'WF-B-SMALL', tone: 'hint',
        ko: '직경이 목표보다 작습니다. 인상속도를 내리면 직경이 커집니다 — 0.1씩 내려 보세요.',
        en: 'The diameter is below target. Lowering the pull rate grows it — try −0.1 steps.',
        when: (_i, o) => (o['diameterMm'] ?? Infinity) < DIAMETER_PASS_MIN_MM,
      },
      {
        id: 'WF-B-RHO', tone: 'hint',
        ko: '저항률은 이번 단계의 판정 항목이 아니지만, 응용 단계에서는 규격 항목이 됩니다. 도펀트 농도를 조정해 8~12 Ω·cm 밴드에 넣어 보세요.',
        en: 'Resistivity is not judged in this stage, but it becomes a spec item later. Adjust the dopant density into the 8–12 Ω·cm band.',
        when: (_i, o) => (o['topResistivityOhmCm'] ?? 0) < RESISTIVITY_REF_MIN
          || (o['topResistivityOhmCm'] ?? 0) > RESISTIVITY_REF_MAX,
      },
    ],
    tradeoffs: [
      {
        ko: 'V↑ → 처리량 R↑(좋음) / 직경 D↓·V/G↑(나쁨). 수치: V 1.5 → 1.9 이면 R 은 +26.7 %, D 는 212.0 → 199.2 mm(−6.0 %).',
        en: 'Higher V raises throughput (good) but shrinks the diameter and raises V/G (bad). V 1.5 → 1.9 gives +26.7 % throughput and 212.0 → 199.2 mm (−6.0 %).',
      },
      {
        ko: '도펀트 농도↑ → 저저항 규격은 쉬워지지만(좋음) / 저항률이 규격 하한에 먼저 닿아 쓸 수 있는 잉곳 길이가 줄어든다(나쁨). k₀ < 1 이라 꼬리로 갈수록 농도가 쌓인다.',
        en: 'More dopant makes low-resistivity specs easier (good) but the axial profile hits the spec floor sooner, shortening the usable ingot (bad) — with k₀ < 1 the tail keeps enriching.',
      },
      {
        ko: '인상속도에는 문헌 상한이 있다 — 직경이 굵을수록 잠열을 빼기 어려워 V_max 가 r^(−1/2) 로 떨어진다(S106). 처리량을 속도로만 올릴 수는 없다.',
        en: 'Pull rate has a literature ceiling: thicker crystals reject latent heat worse, so V_max falls as r^(−1/2) (S106). Throughput cannot be bought with speed alone.',
      },
    ],
  },

  /* ───────────────── S6 응용 — V/G·산소·직경편차 동시 맞추기 ─────────────────
   * 죽은 판정 없음: 기본값(V=1.5, G=25, ω_c=18, ω_cr=12) → V/G 0.60 · O_i 9.2 · σ_D 1.34 **3개 전부 불합격**.
   * 🔴 합격 조합: **V = 0.6 · G = 45 · ω_c = 22 · ω_cr = 6 → 0.133 / 6.9 / 0.71 3개 전부 합격**(τ = 1.80).
   */
  {
    processId: WAFER_PROCESS_ID,
    stage: 'lab-applied',
    objectiveId: 'LO-P1-04',
    titleKo: 'V/G·산소·직경편차 동시 맞추기',
    titleEn: 'Satisfy V/G, oxygen and diameter deviation at once',
    params: params([
      {
        id: 'pullRateMmPerMin', ko: '인상속도 V', en: 'Pull rate V', ja: '引き上げ速度 V', unit: 'mm/min',
        min: PULL_RANGE_MM_PER_MIN[0], max: PULL_RANGE_MM_PER_MIN[1], step: 0.1, initial: PULL_NOMINAL_MM_PER_MIN, sourceId: 'S106',
        note: 'S5 와 같은 창. ⌀20 cm 문헌 V_max 띠 안쪽이다(S106 §A.1).',
      },
      {
        id: 'gradientKPerCm', ko: '고액계면 축방향 온도구배 G', en: 'Axial temperature gradient G', ja: '固液界面の軸方向温度勾配 G', unit: 'K/cm',
        min: GRADIENT_RANGE_K_PER_CM[0], max: GRADIENT_RANGE_K_PER_CM[1], step: 1, initial: GRADIENT_NOMINAL_K_PER_CM, sourceId: 'S101',
        note: 'G 자체의 문헌 상·하한은 원장에 없다(§3-1 · pointDefect.ts 도 양수성만 검사한다). 이 창은 V 범위(0.5~3.0 mm/min)에서 ξ = V/G 가 S101 Table 4 의 임계 창을 가로지르도록 역산한 것이다 — 지어낸 것이 아니라 S101 에서 파생시킨 것이다.',
      },
      {
        id: 'crystalRpm', ko: '결정(시드) 회전수 ω_c', en: 'Crystal (seed) rotation', ja: '結晶（シード）回転数 ω_c', unit: 'rpm',
        min: CRYSTAL_RPM_RANGE[0], max: CRYSTAL_RPM_RANGE[1], step: 1, initial: CRYSTAL_RPM_NOMINAL,
        basis: '공칭 시드 18 rpm 은 PLN 명세(SP-P1-02)의 값이나 우리 원장에 그 출처가 없다. 회전수 범위를 뒷받침하는 S번호가 없으므로 가짜 배지를 달지 않고 교육용 설정임을 여기 남긴다(원장 규칙 10 — 화면에는 경향모델 배지와 미검증 고지가 나간다).',
      },
      {
        id: 'crucibleRpm', ko: '도가니 회전수 ω_cr(역방향·절댓값)', en: 'Crucible rotation (counter, abs)', ja: 'るつぼ回転数 ω_cr（逆回転・絶対値）', unit: 'rpm',
        min: CRUCIBLE_RPM_RANGE[0], max: CRUCIBLE_RPM_RANGE[1], step: 1, initial: CRUCIBLE_RPM_NOMINAL,
        basis: '공칭 도가니 12 rpm 도 같은 사정이다 — PLN 명세(SP-P1-02) 값이고 우리 원장에 출처가 없다. 교육용 설정.',
      },
    ]),
    outputs: [
      { id: 'vgRatio', ko: 'V/G 비', en: 'V/G ratio', role: 'judge',
        pass: { min: VG_PASS_MIN, max: VG_PASS_MAX }, digits: 3 },
      { id: 'oxygenE17', ko: '격자간 산소 농도 O_i', en: 'Interstitial oxygen', role: 'judge',
        pass: { min: OXYGEN_PASS_MIN_E17, max: OXYGEN_PASS_MAX_E17 }, digits: 2 },
      { id: 'diameterSigmaMm', ko: '직경 편차 σ_D', en: 'Diameter deviation', role: 'judge',
        // 🔴 편측 창(max 만 있음)이라 아래쪽이 무한히 열려 있다. 정의역이 그 아래를 닫는다 —
        //    이것이 없으면 σ_D = −0.1 mm 가 「−0.1 ≤ 1」 로 합격한다(2026-08-21 사고).
        pass: { max: SIGMA_PASS_MAX_MM }, domain: SIGMA_DOMAIN_MM, digits: 2 },
      { id: 'thermalStressIndex', ko: '열응력 지수 τ', en: 'Thermal stress index', role: 'display', digits: 2 },
      { id: 'throughputMmPerMin', ko: '처리량 R', en: 'Throughput', role: 'display', digits: 2 },
    ],
    compute(inputs) {
      const v = num(inputs, 'pullRateMmPerMin', 1.5);
      const g = num(inputs, 'gradientKPerCm', 25);
      const wc = num(inputs, 'crystalRpm', 18);
      const wcr = num(inputs, 'crucibleRpm', 12);

      // 🔴 물리층 호출 — ξ = v/G (S101). 여기서 하는 것은 cm² → mm² 환산뿐이다.
      const vg = vgRatio(v, g);
      const oxygen = oxygenE17({
        constantE17: OXYGEN_BASE_E17, crucibleRpm: wcr, crystalRpm: wc,
        argonSlm: OXYGEN_ARGON_REF_SLM, pressureTorr: OXYGEN_PRESSURE_REF_TORR,
      });
      const sigma = sigmaDiameterMm({
        crystalRpm: wc, crucibleRpm: wcr, pullRateMmPerMin: v, argonSlm: OXYGEN_ARGON_REF_SLM,
      });

      return {
        vgRatio: quantity(vg, {
          modelId: 'wafer.lab.vgRatio', unit: 'mm²/(min·K)', sourceId: 'S101',
          validRange: [0, MM2_PER_CM2 * 2 * 2.51e-3],
          assumptions: [
            'ξ = v/G (S101 §3.2.1). 표시 단위만 cm²/(min·K) → mm²/(min·K) 로 100배 환산했다',
            '합격창 0.085~0.150 은 S101 Table 4 「adj.」의 ξ_crit 범위(0.85~1.50×10⁻³ cm²/(min·K)) 그 자체다 — 물리층 withSource 상수에서 파생시켰다',
          ],
        }),
        oxygenE17: quantity(oxygen, {
          modelId: 'wafer.lab.oxygen', unit: '×10¹⁷ cm⁻³', basis: "교육용 합성 — 도가니 회전 1 rpm 당 +0.45×10¹⁷ 등은 학습용 계수이며 실제 산소 혼입은 도가니 용해·용융액 대류·SiO 증발의 연성 해석으로 결정됩니다.",
          validRange: OXYGEN_DOMAIN_E17,
          assumptions: [
            '🔴 교육용 합성 응답식(PLN §P1 S6). 도가니 회전 1 rpm 당 +0.45×10¹⁷ 등 계수는 문헌값이 아니다',
            '실제 산소 혼입은 석영 도가니 용해·용융액 대류·SiO 증발의 연성 해석으로 결정된다',
          ],
        }),
        diameterSigmaMm: quantity(sigma, {
          modelId: 'wafer.lab.diameterSigma', unit: 'mm', basis: "교육용 합성 — 직경 편차 응답식의 계수(회전수·인상속도·Ar 항)는 전부 학습용 설계값입니다.",
          validRange: SIGMA_DOMAIN_MM,
          assumptions: ['🔴 교육용 합성 응답식(PLN §P1 S6). 계수는 문헌값이 아니다'],
        }),
        thermalStressIndex: quantity(STRESS_PER_GRADIENT * g, {
          modelId: 'wafer.lab.thermalStress', unit: '상대값', unitEn: 'relative', basis: "교육용 합성 — τ = 0.04·G 는 학습용 상대 지수이며 응력 단위(MPa)가 아닙니다.",
          validRange: [0, 10],
          assumptions: ['🔴 교육용 합성 지수 τ = 0.04·G (PLN §P1 S6). 응력 단위(MPa)가 아니다'],
        }),
        throughputMmPerMin: quantity(v, {
          modelId: 'wafer.lab.throughput', unit: 'mm/min', basis: "교육용 합성 — 처리량을 인상속도 그 자체(mm/min)로 두는 것은 학습용 정의이며 문헌이 준 지표가 아닙니다.",
          validRange: [0, 3],
          assumptions: ['처리량은 인상속도 그 자체다(길이 기준)'],
        }),
      };
    },
    charts: [diameterZoomChart(true)],   // 🔴 PLN 427 — σ_D 판정은 이 차트에서 한다
    scenes: [{ sceneId: 'ingotSlicing', map: waferSlicingAppliedSceneMap, note: WAFER_SLICING_SCENE_NOTE }],
    scene: {
      sceneId: 'crystalGrowth',
      map: waferAppliedSceneMap,
      note: '응용은 V·G·ω_c·ω_cr 4개가 씬 4키와 1:1 로 맞는 **이 씬의 기준 칸**이다 — 바디 폭·계면 볼록도·'
        + '파셋 스크롤 ← pullRate(기초와 같은 반응), 등온선 간격·개수 ← G(∝ 1/G), V–I 경계 ← 씬이 V·G 에서 '
        + '되계산한 ξ, 계면 등온선의 좌우 비대칭 ← ω_c, 회전 화살표 주기·도가니 내벽 미립 생성률 ← ω_cr. '
        + '회전 화살표 2개는 부호가 항상 반대다(§F-7, 실제 회전 주기 그대로 — 배율 1.0). '
        + 'Ar·압력은 O_i 응답식의 기준값(40 slm · 30 torr, 물리층 OXYGEN_ARGON_REF_SLM/OXYGEN_PRESSURE_REF_TORR '
        + '와 같은 값)으로 고정해 넘긴다 — 이 칸의 조작 대상이 아니다. '
        + CRYSTAL_GROWTH_NOTE_COMMON,
    },
    feedback: [
      {
        id: 'WF-A-VACANCY', tone: 'warn',
        ko: '공공 과잉 영역입니다. V/G 가 임계 창보다 큽니다 — 인상속도를 내리거나 온도구배를 키우세요.',
        en: 'Vacancy-rich regime: V/G sits above the critical band — lower the pull rate or raise the gradient.',
        when: (_i, o) => (o['vgRatio'] ?? 0) > VG_VACANCY_ALARM,
      },
      {
        id: 'WF-A-INTERSTITIAL', tone: 'warn',
        ko: '격자간 실리콘 과잉 영역입니다. V/G 가 임계 창보다 작습니다 — 인상속도를 올리거나 온도구배를 줄이세요.',
        en: 'Interstitial-rich regime: V/G sits below the critical band — raise the pull rate or lower the gradient.',
        when: (_i, o) => (o['vgRatio'] ?? Infinity) < VG_INTERSTITIAL_ALARM,
      },
      {
        id: 'WF-A-STRESS', tone: 'warn',
        ko: '열응력 지수가 참고 상한 2.0 을 넘었습니다. 슬립 라인 발생 위험 구간이니 G 를 50 이하로 내리세요.',
        en: 'The thermal stress index exceeds the reference limit of 2.0 — slip-line risk. Bring G below 50.',
        when: (i, o) => (i['gradientKPerCm'] ?? 0) > GRADIENT_ALARM_K_PER_CM
          || (o['thermalStressIndex'] ?? 0) > STRESS_REF_MAX,
      },
      {
        id: 'WF-A-O2HIGH', tone: 'hint',
        ko: '산소 혼입 과다입니다. 도가니 회전 1 rpm 당 O_i 가 0.45×10¹⁷ cm⁻³ 변합니다 — ω_cr 를 내리세요.',
        en: 'Too much oxygen. Each crucible rpm shifts O_i by 0.45×10¹⁷ cm⁻³ — lower ω_cr.',
        when: (_i, o) => (o['oxygenE17'] ?? 0) > OXYGEN_PASS_MAX_E17,
      },
      {
        id: 'WF-A-O2LOW', tone: 'hint',
        ko: '산소가 지나치게 낮으면 내부 게터링 능력과 기계적 강도가 떨어집니다. ω_cr 나 ω_c 를 소폭 올리세요.',
        en: 'Too little oxygen weakens internal gettering and mechanical strength. Nudge ω_cr or ω_c up.',
        when: (_i, o) => (o['oxygenE17'] ?? Infinity) < OXYGEN_PASS_MIN_E17,
      },
      {
        id: 'WF-A-SIGMA', tone: 'hint',
        ko: '직경 편차가 규격을 넘었습니다. 도가니 회전은 편차를 줄이지만 산소를 올립니다 — 같은 개선폭당 산소 대가는 결정 회전이 도가니 회전의 약 1/10.8 이니, 편차는 ω_c 로 잡고 ω_cr 는 낮추세요.',
        en: 'Diameter deviation is out of spec. Crucible rotation cuts deviation but adds oxygen — per unit of improvement, crystal rotation costs about 1/10.8 as much oxygen, so fix deviation with ω_c and keep ω_cr low.',
        when: (_i, o) => (o['diameterSigmaMm'] ?? 0) > SIGMA_PASS_MAX_MM,
      },
    ],
    tradeoffs: [
      {
        ko: 'ω_cr↑ → σ_D↓(좋음, 1 rpm 당 −0.05 mm) / O_i↑(나쁨, 1 rpm 당 +0.45×10¹⁷ cm⁻³).',
        en: 'Higher crucible rpm cuts diameter deviation (−0.05 mm/rpm, good) but raises oxygen (+0.45×10¹⁷ cm⁻³/rpm, bad).',
      },
      {
        ko: 'ω_c↑ → σ_D↓(좋음, 1 rpm 당 −0.12 mm) / O_i↑(나쁨, 1 rpm 당 +0.10×10¹⁷ cm⁻³). 같은 편차 개선폭당 산소 대가는 ω_c 가 ω_cr 의 (0.10/0.12)÷(0.45/0.05) = 0.0926 ≒ 1/10.8 배다 — **편차는 결정 회전으로 잡고 도가니 회전은 낮추는 것이 지배 전략**이다.',
        en: 'Higher crystal rpm cuts deviation (−0.12 mm/rpm, good) but raises oxygen (+0.10×10¹⁷ cm⁻³/rpm, bad). Per unit of improvement it costs (0.10/0.12)÷(0.45/0.05) = 0.0926 ≈ 1/10.8 of the crucible-rotation oxygen penalty — fix deviation with the crystal, keep the crucible slow.',
      },
      {
        ko: 'V↑ → R↑(좋음) / V/G↑ 및 σ_D↑(나쁨, 1 mm/min 당 +0.5 mm).',
        en: 'Higher V raises throughput (good) but raises V/G and deviation (+0.5 mm per mm/min, bad).',
      },
      {
        ko: 'G↑ → V/G↓ 로 무결함 창 쪽으로 간다(좋음) / 열응력 지수 τ↑(나쁨, 1 K/cm 당 +0.04).',
        en: 'Higher G pushes V/G toward the defect-free window (good) but raises thermal stress (+0.04 per K/cm, bad).',
      },
    ],
  },

  /* ───────────────── S7 심화 — 외란 2종 아래에서 무전위 수율 지키기 ─────────────────
   * 죽은 판정 없음: 기본값(V=1.5, G=25, ω_c=18, ω_cr=12, Q_Ar=40, P_ch=30)
   *   → V/G 0.60 불합격 · O_i 9.2 불합격 · Y 35 % 불합격 · R 1.5 합격 = **4개 중 3개 불합격**.
   * 🔴 합격 조합: **V = 0.6 · G = 45 · ω_c = 22 · ω_cr = 6 · Q_Ar = 60 · P_ch = 20**
   *   → V/G 0.133 ✅ · O_i 6.66 ✅ · R 0.6 ✅ · Y 92 % ✅ (외란 B 여유 V < 0.9,
   *     외란 A 복구 후 도달 O_i = 5.02 + 0.1×22 = 7.22 ≤ 8.0) = **4개 전부 합격**.
   *   PLN 명세가 제시한 해와 같은 조합이다.
   */
  {
    processId: WAFER_PROCESS_ID,
    stage: 'lab-advanced',
    objectiveId: 'LO-P1-05',
    titleKo: '외란 2종 아래에서 무전위 수율 지키기',
    titleEn: 'Protect dislocation-free yield under two disturbances',
    params: params([
      {
        id: 'pullRateMmPerMin', ko: '인상속도 V', en: 'Pull rate V', ja: '引き上げ速度 V', unit: 'mm/min',
        min: PULL_RANGE_ADV_MM_PER_MIN[0], max: PULL_RANGE_ADV_MM_PER_MIN[1], step: 0.02, initial: PULL_NOMINAL_MM_PER_MIN, sourceId: 'S106',
        note: '스텝 0.02 — 외란 B(G → 18 K/cm) 복구 해가 격자 위에 있어야 한다. 새 상한 0.150 기준 V ≤ 0.27 mm/min, 격자에서 0.26 (PLN 의 0.28 은 옛 상한 0.16 기준이라 문헌 밖이다).',
      },
      {
        id: 'gradientKPerCm', ko: '고액계면 축방향 온도구배 G', en: 'Axial temperature gradient G', unit: 'K/cm',
        min: GRADIENT_RANGE_K_PER_CM[0], max: GRADIENT_RANGE_K_PER_CM[1], step: 1, initial: GRADIENT_NOMINAL_K_PER_CM, sourceId: 'S101',
        note: 'S6 와 같은 창. G 의 문헌 상·하한이 없어 ξ 창(S101 Table 4)에서 역산한 범위다.',
      },
      {
        id: 'crystalRpm', ko: '결정(시드) 회전수 ω_c', en: 'Crystal (seed) rotation', unit: 'rpm',
        min: CRYSTAL_RPM_RANGE[0], max: CRYSTAL_RPM_RANGE[1], step: 1, initial: CRYSTAL_RPM_NOMINAL,
        basis: 'PLN 명세(SP-P1-02)의 공칭 18 rpm. 우리 원장에 출처가 없어 교육용 설정으로 둔다.',
      },
      {
        id: 'crucibleRpm', ko: '도가니 회전수 ω_cr(역방향·절댓값)', en: 'Crucible rotation (counter, abs)', unit: 'rpm',
        min: CRUCIBLE_RPM_RANGE[0], max: CRUCIBLE_RPM_RANGE[1], step: 1, initial: CRUCIBLE_RPM_NOMINAL,
        basis: 'PLN 명세(SP-P1-02)의 공칭 12 rpm. 우리 원장에 출처가 없어 교육용 설정으로 둔다.',
      },
      {
        id: 'argonSlm', ko: 'Ar 유량 Q_Ar', en: 'Argon flow', unit: 'slm',
        min: ARGON_RANGE_SLM[0], max: ARGON_RANGE_SLM[1], step: 5, initial: OXYGEN_ARGON_REF_SLM,
        basis: '교육용 설정(PLN §P1 S7 — 원문도 「출처 미확보」로 표시). SiO 배출량의 대리 변수로만 쓴다.',
      },
      {
        id: 'chamberTorr', ko: '챔버 압력 P_ch', en: 'Chamber pressure', unit: 'torr',
        min: PRESSURE_RANGE_TORR[0], max: PRESSURE_RANGE_TORR[1], step: 5, initial: OXYGEN_PRESSURE_REF_TORR,
        basis: '교육용 설정(PLN §P1 S7 — 원문도 「출처 미확보」). 상한 760 torr 는 상압이며, 500 torr 이상은 본 모델의 유효 범위 밖임을 피드백으로 고지한다.',
      },
    ]),
    outputs: [
      { id: 'yieldPercent', ko: '무전위 길이 수율 Y', en: 'Dislocation-free length yield', role: 'judge',
        pass: { min: YIELD_PASS_MIN_PCT }, digits: 1 },
      { id: 'vgRatio', ko: 'V/G 비', en: 'V/G ratio', role: 'judge',
        pass: { min: VG_PASS_MIN, max: VG_PASS_MAX }, digits: 3 },
      { id: 'oxygenE17', ko: '격자간 산소 농도 O_i', en: 'Interstitial oxygen', role: 'judge',
        pass: { min: OXYGEN_PASS_MIN_E17, max: OXYGEN_PASS_MAX_E17 }, digits: 2 },
      { id: 'throughputMmPerMin', ko: '평균 처리량 R', en: 'Average throughput', role: 'judge',
        pass: { min: THROUGHPUT_PASS_MIN_MM_PER_MIN }, digits: 2 },
      { id: 'oxygenAfterRecoveryE17', ko: '외란 A 복구 후 도달 O_i', en: 'O_i reachable after disturbance A recovery', role: 'display', digits: 2 },
      { id: 'structureLossPullRateMmPerMin', ko: '외란 B 즉시 구조손실 인상속도', en: 'Pull rate causing instant structure loss under disturbance B', role: 'display', digits: 2 },
      { id: 'diameterSigmaMm', ko: '직경 편차 σ_D', en: 'Diameter deviation', role: 'display', digits: 2 },
    ],
    compute(inputs) {
      const v = num(inputs, 'pullRateMmPerMin', 1.5);
      const g = num(inputs, 'gradientKPerCm', 25);
      const wc = num(inputs, 'crystalRpm', 18);
      const wcr = num(inputs, 'crucibleRpm', 12);
      const ar = num(inputs, 'argonSlm', 40);
      const torr = num(inputs, 'chamberTorr', 30);

      // 🔴 물리층 호출 — ξ = v/G (S101).
      const vg = vgRatio(v, g);
      const oxygen = oxygenE17({
        constantE17: OXYGEN_BASE_E17, crucibleRpm: wcr, crystalRpm: wc, argonSlm: ar, pressureTorr: torr,
      });

      // 외란 B — 구배가 18 K/cm 로 붕괴하는 순간 V/G 가 즉시 구조손실 임계(0.5)를 넘는가.
      const lossPullRate = (STRUCTURE_LOSS_VG * DISTURBANCE_B_GRADIENT_K_PER_CM) / MM2_PER_CM2 * MM_PER_CM;
      const survivesB = v < lossPullRate;

      // 외란 A — 복구 조작(ω_cr 최소·Q_Ar 최대·P_ch 최소)을 끝까지 써도 O_i 가 합격 밴드로 돌아오는가.
      const oxygenRecovered = oxygenE17({
        constantE17: DISTURBANCE_A_CONSTANT_E17, crucibleRpm: 2, crystalRpm: wc,
        argonSlm: 120, pressureTorr: 10,
      });
      const survivesA = oxygenRecovered <= OXYGEN_PASS_MAX_E17;

      const gFail = (v * DISTURBANCE_B_TIME_MIN) / INGOT_BODY_TARGET_MM;
      const yieldPct = survivesA && survivesB
        ? YIELD_ON_RECOVERY_PCT
        : Math.min(gFail, 1) * PERCENT;

      return {
        yieldPercent: quantity(yieldPct, {
          modelId: 'wafer.lab.yield', unit: '%', basis: "교육용 합성 — 외란 2종 생존 여부로 92 % / 100·g_fail 을 주는 학습용 수율 스코어링입니다.",
          validRange: [0, 100],
          assumptions: [
            '🔴 교육용 합성 수율 모델(PLN §P1 S7). 하네스에 시간축이 없어 「현재 레시피가 외란 2종을 견디는가」로 옮겼다',
            `외란 B: 구배 붕괴(G → ${DISTURBANCE_B_GRADIENT_K_PER_CM} K/cm) 시 V/G 가 ${STRUCTURE_LOSS_VG} 를 넘으면 대응 여유 없이 구조 손실`,
            `외란 A: 도가니 침식으로 상수항이 ${DISTURBANCE_A_CONSTANT_E17}×10¹⁷ 로 뛴 뒤, 복구 조작을 끝까지 써도 O_i 가 밴드로 못 돌아오면 실패`,
            '실패 시 Y = 100·g_fail, g_fail = V·70 min / 바디 300 mm — 최대 70 % 라 구조 손실은 항상 불합격이다',
          ],
        }),
        vgRatio: quantity(vg, {
          modelId: 'wafer.lab.vgRatio', unit: 'mm²/(min·K)', sourceId: 'S101',
          validRange: [0, MM2_PER_CM2 * 2 * 2.51e-3],
          assumptions: [
            'ξ = v/G (S101 §3.2.1). cm²/(min·K) → mm²/(min·K) 환산만 했다',
            '합격창 0.085~0.150 = S101 Table 4 「adj.」 ξ_crit 범위(0.85~1.50×10⁻³ cm²/(min·K)) 그 자체다',
          ],
        }),
        oxygenE17: quantity(oxygen, {
          modelId: 'wafer.lab.oxygen', unit: '×10¹⁷ cm⁻³', basis: "교육용 합성 — 도가니 회전 1 rpm 당 +0.45×10¹⁷ 등은 학습용 계수이며 실제 산소 혼입은 도가니 용해·용융액 대류·SiO 증발의 연성 해석으로 결정됩니다.",
          validRange: OXYGEN_DOMAIN_E17,
          assumptions: [
            '🔴 교육용 합성 응답식(PLN §P1 S7). Ar 1 slm 당 −0.010×10¹⁷, 1 torr 당 +0.004×10¹⁷ 등 계수는 문헌값이 아니다',
            '평상시 상수항 2.0×10¹⁷ 기준. 외란 A 발생 시 5.0 으로 뛴다',
          ],
        }),
        throughputMmPerMin: quantity(v, {
          modelId: 'wafer.lab.throughput', unit: 'mm/min', basis: "교육용 합성 — 처리량을 인상속도 그 자체(mm/min)로 두는 것은 학습용 정의이며 문헌이 준 지표가 아닙니다.",
          validRange: [0, 3],
          assumptions: ['성장 구간 시간가중 평균. 시간축이 없으므로 설정값 그대로다'],
        }),
        oxygenAfterRecoveryE17: quantity(oxygenRecovered, {
          modelId: 'wafer.lab.oxygenRecovered', unit: '×10¹⁷ cm⁻³', basis: "교육용 합성 — 외란 A 중 복구 조작을 범위 끝까지 썼을 때의 도달 산소값으로 학습용 합성 응답식의 산출입니다.",
          validRange: [0, 20],
          assumptions: [
            '🔴 교육용 합성 모델. 외란 A 중 복구 조작(ω_cr 2 rpm · Q_Ar 120 slm · P_ch 10 torr)을 끝까지 썼을 때 도달하는 O_i',
            '결정 회전 ω_c 가 높으면 여기서 8.0 을 못 내려간다 — 그것이 외란 A 대응 실패다',
          ],
        }),
        structureLossPullRateMmPerMin: quantity(lossPullRate, {
          modelId: 'wafer.lab.structureLossPullRate', unit: 'mm/min', basis: "교육용 합성 — 붕괴 구배 18 K/cm·구조손실 임계 V/G 0.5 는 학습용으로 설정한 값입니다.",
          validRange: [0, 3],
          assumptions: ['🔴 교육용 합성 임계. 붕괴 구배 18 K/cm 에서 V/G 비가 0.5 가 되는 인상속도다'],
        }),
        diameterSigmaMm: quantity(sigmaDiameterMm({
          crystalRpm: wc, crucibleRpm: wcr, pullRateMmPerMin: v, argonSlm: ar,
        }), {
          modelId: 'wafer.lab.diameterSigma', unit: 'mm', basis: "교육용 합성 — 직경 편차 응답식의 계수(회전수·인상속도·Ar 항)는 전부 학습용 설계값입니다.",
          validRange: SIGMA_DOMAIN_MM,
          assumptions: ['🔴 교육용 합성 응답식. S7 은 Ar 유량 항(1 slm 당 +0.005 mm)이 더해진다'],
        }),
      };
    },
    // 심화에서 σ_D 는 display — 판정은 피드백이 한다. 저항률 프로파일은 PLN 명세 §P1 심화의 학습 그림이다.
    /* 🔴 PLN PD-41-2 · PD-42 확정 — 앞의 두 차트는 **도해**(판정 선언 없음)이고,
     *    이 칸의 판정을 그리는 것은 `wafer.vgWindow` 하나다. 사유는 각 차트 머리주석 참조:
     *    diameterZoom = σ_D 가 이 칸에서 display · axialResistivity = Δρ 판정이 M-1 로 삭제됨. */
    charts: [diameterZoomChart(false), axialResistivityChart(), vgWindowChart()],
    scenes: [{ sceneId: 'ingotSlicing', map: waferSlicingAdvancedSceneMap, note: WAFER_SLICING_SCENE_NOTE }],
    scene: {
      sceneId: 'crystalGrowth',
      map: waferAdvancedSceneMap,
      note: '심화는 응용 4키에 argonFlow(Q_Ar)·chamberPressure(P_ch, 로그축)가 더해진다 — 아르곤 유선 '
        + '가닥 수·하강 속도는 Q_Ar 이 직접 그리고, SiO 흄 알파·뷰포트 응축 분말층 두께는 씬 모델이 '
        + 'argonFlow·chamberPressure 두 키로 직접 계산한다(DSN §2-3 D-10 — 출력 O_i 를 거치지 않는다). '
        + '🔴 인상속도 정규화 구간(0.2~3.0)은 세 칸 공통 앵커이고, 이 칸만 슬라이더 자체의 min·step이 다르다'
        + '(0.2 · 0.02) — 씬에 넘기는 정규화식은 기초·응용과 동일하다. '
        + '🔴 챔버 압력의 비단조 반전은 **그리지 않았다** — 반전 위치가 미확인이라 임의로 박으면 A15 위반이다. '
        + '🔴 외란 2종(도가니 침식·구배 붕괴)은 파라미터가 아니라 출력이라 씬 키로 만들 수 없다. '
        + CRYSTAL_GROWTH_NOTE_COMMON,
    },
    feedback: [
      {
        id: 'WF-X-BFAIL', tone: 'stop',
        ko: '이 인상속도로는 외란 B(온도구배 붕괴)를 견디지 못합니다. G 가 18 K/cm 로 떨어지는 순간 V/G 가 0.5 를 넘어 습관선이 즉시 사라지고, 그 지점 위쪽 잉곳은 전량 손실됩니다. V 를 0.9 mm/min 아래로 두세요.',
        en: 'This pull rate cannot survive disturbance B. When G collapses to 18 K/cm the V/G ratio exceeds 0.5, habit lines vanish at once and the ingot above that point is lost. Keep V below 0.9 mm/min.',
        when: (i, o) => (i['pullRateMmPerMin'] ?? 0) >= (o['structureLossPullRateMmPerMin'] ?? Infinity),
      },
      {
        id: 'WF-X-AFAIL', tone: 'warn',
        ko: '외란 A(도가니 침식)가 오면 복구 조작을 끝까지 써도 산소가 합격 밴드로 돌아오지 않습니다. 결정 회전이 너무 높습니다 — ω_c 를 내려 복구 여력을 남기세요.',
        en: 'If disturbance A hits, oxygen will not return to the pass band even with the full recovery action. Crystal rotation is too high — lower ω_c to keep recovery headroom.',
        when: (_i, o) => (o['oxygenAfterRecoveryE17'] ?? 0) > OXYGEN_PASS_MAX_E17,
      },
      {
        id: 'WF-X-O2', tone: 'hint',
        ko: '산소 혼입 과다입니다. 도가니 회전을 내리고(1 rpm 당 −0.45×10¹⁷) Ar 유량을 올리고(1 slm 당 −0.010×10¹⁷) 챔버 압력을 낮추세요(1 torr 당 −0.004×10¹⁷).',
        en: 'Oxygen is too high. Lower crucible rotation (−0.45×10¹⁷ per rpm), raise argon flow (−0.010×10¹⁷ per slm) and drop chamber pressure (−0.004×10¹⁷ per torr).',
        when: (_i, o) => (o['oxygenE17'] ?? 0) > OXYGEN_PASS_MAX_E17,
      },
      {
        id: 'WF-X-SIGMA', tone: 'hint',
        ko: '대류를 줄이면 산소는 잡히지만 직경 편차가 커집니다. 결정 회전으로 벌충하세요 — ω_c 1 rpm 이 σ_D 를 0.12 mm 줄입니다.',
        en: 'Cutting convection tames oxygen but widens diameter deviation. Compensate with crystal rotation — each ω_c rpm removes 0.12 mm of σ_D.',
        when: (_i, o) => (o['diameterSigmaMm'] ?? 0) > SIGMA_PASS_MAX_MM,
      },
      {
        id: 'WF-X-ARGON', tone: 'warn',
        ko: 'SiO 배출이 막혀 챔버 내 석출물이 용융액으로 떨어집니다. Ar 유량을 40 slm 이상으로 되돌리세요.',
        en: 'SiO exhaust is choked and deposits fall back into the melt. Restore argon flow to at least 40 slm.',
        when: (i) => (i['argonSlm'] ?? Infinity) < ARGON_MIN_SAFE_SLM,
      },
      {
        id: 'WF-X-PRESSURE', tone: 'stop',
        ko: '공정 한계선 초과 — 상압 부근에서는 SiO 배출과 열전달 조건이 본 모델의 유효 범위를 벗어납니다. 챔버 압력을 100 torr 이하로 내리세요.',
        en: 'Process limit exceeded — near atmospheric pressure the SiO exhaust and heat-transfer assumptions of this model no longer hold. Bring the chamber below 100 torr.',
        when: (i) => (i['chamberTorr'] ?? 0) > PRESSURE_LIMIT_TORR,
      },
      {
        id: 'WF-X-VG', tone: 'hint',
        ko: 'V/G 가 무결함 창(0.085~0.150, S101 Table 4 조정 ξ_crit 범위) 밖입니다. 창보다 크면 공공 과잉, 작으면 격자간 과잉입니다 — V 와 G 를 같은 방향으로 함께 움직여 창 안에서 처리량을 확보하세요.',
        en: 'V/G is outside the defect-free window (0.085–0.150, the adjusted ξ_crit range of S101 Table 4): above it means vacancy-rich, below it interstitial-rich. Move V and G together to stay inside the window while keeping throughput.',
        when: (_i, o) => (o['vgRatio'] ?? 0) > VG_PASS_MAX || (o['vgRatio'] ?? Infinity) < VG_PASS_MIN,
      },
    ],
    tradeoffs: [
      {
        ko: 'Q_Ar↑ → O_i↓(좋음, 1 slm 당 −0.010×10¹⁷) / 용융액 표면 냉각·요동으로 σ_D↑(나쁨, 1 slm 당 +0.005 mm).',
        en: 'More argon lowers oxygen (−0.010×10¹⁷ per slm, good) but chills and ripples the melt surface, widening σ_D (+0.005 mm per slm, bad).',
      },
      {
        ko: 'P_ch↑ → 실리콘 증발 손실↓(좋음) / SiO 배출이 나빠져 O_i↑(나쁨, 1 torr 당 +0.004×10¹⁷).',
        en: 'Higher chamber pressure cuts silicon evaporation loss (good) but throttles SiO exhaust, raising oxygen (+0.004×10¹⁷ per torr, bad).',
      },
      {
        ko: 'V↑ → R↑(좋음) / V/G↑ 그리고 외란 B 가 왔을 때 구조 손실까지의 여유시간↓(나쁨). V ≥ 0.9 mm/min 이면 여유가 0 이다.',
        en: 'Higher V raises throughput (good) but raises V/G and shortens the reaction window under disturbance B (bad) — at V ≥ 0.9 mm/min there is none.',
      },
      {
        ko: 'G↑ → V/G↓ 로 무결함 창 쪽으로(좋음) / 열응력↑ 로 슬립 라인 위험↑(나쁨).',
        en: 'Higher G pushes V/G toward the defect-free window (good) but raises thermal stress and slip-line risk (bad).',
      },
      {
        ko: 'ω_c↑ → σ_D↓(좋음) / O_i↑ 이며 외란 A 복구 여력까지 깎는다(나쁨) — 복구 후 도달 O_i = 5.02 + 0.10·ω_c 이므로 ω_c ≥ 30 이면 외란 A 를 못 넘긴다.',
        en: 'Higher crystal rpm cuts deviation (good) but adds oxygen and eats the disturbance-A recovery margin (bad): the post-recovery floor is 5.02 + 0.10·ω_c, so ω_c ≥ 30 makes A unrecoverable.',
      },
    ],
  },
];
