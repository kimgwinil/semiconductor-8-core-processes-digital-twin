import type { SourceId } from './sources.generated';
import type { LabOutput, LabSpec } from './labs/spec';

/**
 * 🔴 **합격창 근거 원장** — 「이 값이 왜 합격선인가」를 화면이 말하게 하는 자리.
 *
 * ## 왜 생겼나 (CEO 지적 2026-08-24)
 * > 「계측기 — **판정지표도 임의 조정할 수 없고 그냥 조정되어 있는 것인가?**」
 *
 * 화면은 `규격 95 ~ 105 nm` 라는 **숫자만** 보였다. 어디서 온 값인지 한 글자도 없었다.
 * 수식·물리량에는 출처 배지(S번호)가 붙는데 **합격창에만 없었다.**
 *
 * 🔴 원인은 개별 부주의가 아니라 **구조**다. `LabParam`(슬라이더 범위)은
 * 「`sourceId` 또는 `basis` 둘 중 하나는 반드시 있어야 한다」를 `check-labs` 가 강제하는데,
 * `LabOutput.pass` 에는 **근거를 담을 자리 자체가 없었다**(`spec.ts` 의 `pass?: { min?; max? }`).
 * **파라미터 범위는 근거를 요구받고 합격창은 요구받지 않았다.**
 *
 * ## 🔴 왜 `LabOutput` 의 필드가 아니라 별도 원장인가 — 두 가지 이유
 *
 * **① 편집 충돌(2026-08-24 실측).** 이 작업과 동시에 다른 세션이 `models/labs/spec.ts` 를
 *    **쓰고 있었다**(`spec.ts` mtime 11:20 → 11:27, 내 작업 중에 두 번 갱신). 같은 파일을 양쪽에서
 *    고치면 한쪽이 조용히 사라지고, **사라진 줄 모르고 「붙였다」고 보고하면 그것이 거짓이 된다**(D-050).
 *    그래서 **`spec.ts` 를 한 글자도 건드리지 않는 쪽**을 골랐다.
 *
 * **② 이 표 자체가 산출물이다.** CEO 는 「근거 불명이 나오면 목록으로 보고하라」고 했다.
 *    근거가 76개 출력 선언부에 흩어져 있으면 **세는 것 자체가 다시 조사**가 된다.
 *    한 파일에 모아 두면 **읽는 것이 곧 감사**다.
 *
 * 🔴 흩어 두지 않은 대가로 **키 오타가 조용한 누락이 될 수 있다.** 그래서
 *    `tests/unit/pass-basis.test.ts` 가 **양방향 전수 대조**를 건다 —
 *    ⓐ 합격창을 가진 judge 출력에 항목이 빠지면 실패, ⓑ 실재하지 않는 키가 있어도 실패.
 *    드리프트가 침묵이 아니라 **테스트 실패**로 나온다.
 *
 * ## 🔴 분류 규칙 — 내가 정한 것이고, 지어내지 않았다
 *
 * 세 갈래는 **이 프로젝트가 이미 쓰던 어휘**(명세 §4-1(b)(c) 의 N-1~N-4b · 등급 A6 / A6 미충족 /
 * A6→상대전환 / A6-b)를 CEO 가 물은 세 갈래에 **사상(寫像)한 것**이다. 새 판정 축을 만들지 않았다.
 *
 * | 갈래 | 판별 | 명세 어휘 |
 * |---|---|---|
 * | `literature` ① | 합격창 경계값이 `withSource(…, 'S###')` 로 등재된 문헌값에서 **코드로 파생**된다 | `A6` |
 * | `educational` ② | ①이 아니고, 명세가 **「우리가 부여한 과제 목표·난이도 설정」**으로 분류했다 | `A6→상대전환`(N-4b) · `A6-b` |
 * | `unknown` ③ | ①②가 아니다. 명세가 **「A6 미충족 · 근거 미상」**이라 적었거나, 어느 기록에도 없다 | `A6 미충족` · 기록 없음 |
 *
 * 🔴 **①의 정본은 원장이 아니라 코드다.** 부록 분류원장(`03_실습3단계명세.md` §부록 2)은 낡을 수 있다 —
 *    실제로 P1 V/G(#13·#30)는 원장에 아직 `0.10 ~ 0.16 · A6 미충족` 으로 적혀 있으나 코드는
 *    2026-08-20 A6L-01 로 **S101 문헌 범위 0.085~0.150 으로 이설**됐다. 원장만 안 고쳐졌다.
 *    P7·P8 은 더 크게 갈렸다 — 원장이 `A6 미충족` 으로 남긴 판정(Tj 105 °C · Dm 45 µm · Rc 0.90 Ω)을
 *    DEV 가 **표준값으로 갈아끼워** S229·S247·S248·S249·S43 사슬을 만들었다. 원장만 옛 상태다.
 *    → **`withSource` 사슬이 실재하면 ①이다.** 원장이 뭐라 적었든.
 *
 * 🔴 **한 창의 성분 중 하나라도 ③이면 창 전체가 ③이다.**
 *    - `wafer/lab-basic` 직경 `198~202`: 중심 200 mm 는 「SEMI 표준인데 S번호 미확보」(원장 #1 A6 미충족),
 *      폭 ±2 는 과제 설정(#2). **한쪽이 근거 미상이면 창은 근거 미상이다** — 「교육용 설정값」이라고 적으면
 *      200 이 산업 기준이라는 주장이 소리 없이 통과한다.
 *    - `metal` 제거율 `302.5~350.1`: 하한 302.5 는 S200(`cmp.ts` `withSource`)인데 **상한 350.1 은
 *      맨 리터럴**이고 명세 스스로 「근거 미상」이라 적었다(`03_…:2023`). → 창은 ③.
 *
 * ⛔ **이 파일은 합격창 값을 바꾸지 않는다.** 표시만 붙인다. 값은 각 랩 파일의 소관이고
 *    창 이동은 PLN 대조 사항이다(D-041).
 * ⛔ **추정으로 S번호를 붙이지 않는다.** 「아마 S120 일 것」은 ③이다.
 */

/** 갈래 셋. 화면 배지와 1:1 이다. */
export type PassBasisKind = 'literature' | 'educational' | 'unknown';

export interface PassBasis {
  kind: PassBasisKind;
  /** 🔴 `literature` 일 때만 있다. 나머지 둘은 **없는 것이 사실**이다(`Quantity.sourceId` 와 같은 규율). */
  sourceId?: SourceId;
  /** 호버/툴팁에 뜨는 한 줄 근거. 🔴 `educational`·`unknown` 은 **반드시** 채운다. */
  ko?: string;
  en?: string;
}

/** 원장 키. `<processId>/<stage>#<outputId>`. */
export function passBasisKey(processId: string, stage: string, outputId: string): string {
  return `${processId}/${stage}#${outputId}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 원장 본문 — judge + 합격창을 가진 출력 **76개 전건**.
 * 실측 열거(2026-08-24): 랩 24칸 · judge 이면서 `pass.min`/`pass.max` 중 하나라도 있는 출력 76개.
 * ═══════════════════════════════════════════════════════════════════════════ */

const EDU = (ko: string, en: string): PassBasis => ({ kind: 'educational', ko, en });
const LIT = (sourceId: SourceId, ko: string, en: string): PassBasis => ({ kind: 'literature', sourceId, ko, en });
const UNK = (ko: string, en: string): PassBasis => ({ kind: 'unknown', ko, en });

export const PASS_BASIS_LEDGER: Readonly<Record<string, PassBasis>> = {
  /* ─── P1 웨이퍼 ─────────────────────────────────────────────────────── */
  // 🔴 중심 200 mm 는 원장 #1 이 「SEMI 표준인데 S번호를 못 붙였다(A6 미충족)」로 남긴 값이다.
  //    폭 ±2 는 #2 가 「출처를 댈 수 없다」고 자인했다. 두 성분 중 하나가 ③이면 창은 ③.
  'wafer/lab-basic#diameterMm': UNK(
    '중심 200 mm 는 SEMI 표준 직경이라 하나 S번호 미확보(원장 #1 · A6 미충족) · 허용폭 ±2 mm 는 출처 없음(#2)',
    'Center 200 mm is claimed as a SEMI standard diameter but no source ID was secured (ledger #1); the ±2 mm width has no stated source (#2).',
  ),
  'wafer/lab-applied#vgRatio': LIT('S101',
    'S101 Table 4 「adj.」 열의 ξ_crit 최소~최대(0.85~1.50×10⁻³)를 환산한 창. 🔴 문헌이 「이 구간이 합격」이라 명시한 것은 아니고, 12개 파라미터 세트에 걸친 범위를 합격창으로 해석한 것은 이 실습이다',
    'Converted from the min–max of ξ_crit in S101 Table 4 (“adj.” column, 0.85–1.50×10⁻³). The literature does not declare this range a pass window; reading it as one is this lab’s interpretation.',
  ),
  // 🔴 원장 #15 「CZ Si 의 통상 산소 농도는 문헌에 명시된 값이다 → 우리가 정한 목표가 아니다」 · A6 미충족.
  'wafer/lab-applied#oxygenE17': UNK(
    '원장 #15 — 문헌에 있어야 할 값인데 S번호를 못 댔다(A6 미충족). 조달 미완',
    'Ledger #15 — a value that should come from literature, but no source ID was found (A6 unmet). Procurement incomplete.',
  ),
  'wafer/lab-applied#diameterSigmaMm': EDU(
    '원장 #18 — 1.0 mm 의 출처 없음. 이 실습이 부여한 과제 목표(N-4b)',
    'Ledger #18 — the 1.0 mm figure has no source; it is a task target set by this lab (N-4b).',
  ),
  'wafer/lab-advanced#yieldPercent': EDU(
    '원장 #27 — 80 %는 외란 대응 학습을 위한 과제 목표(N-4b)',
    'Ledger #27 — 80 % is a task target for the disturbance-response exercise (N-4b).',
  ),
  'wafer/lab-advanced#vgRatio': LIT('S101',
    'S101 Table 4 「adj.」 열의 ξ_crit 최소~최대(0.85~1.50×10⁻³)를 환산한 창. 응용 칸과 같은 상수를 본다',
    'Converted from the min–max of ξ_crit in S101 Table 4 (“adj.”, 0.85–1.50×10⁻³). Shares the same constants as the applied stage.',
  ),
  'wafer/lab-advanced#oxygenE17': UNK(
    '원장 #31(#15 재게) — 문헌값이어야 하는데 S번호 미확보(A6 미충족)',
    'Ledger #31 (repeat of #15) — should be a literature value, but no source ID (A6 unmet).',
  ),
  'wafer/lab-advanced#throughputMmPerMin': EDU(
    '원장 #39 — 처리량 과제 목표(N-4b)',
    'Ledger #39 — throughput task target (N-4b).',
  ),

  /* ─── P2 산화 ───────────────────────────────────────────────────────── */
  'oxidation/lab-basic#thicknessNm': EDU(
    '원장 #47 — 100 nm 는 과제 목표(N-4b). 문헌 판정선이 아니다',
    'Ledger #47 — 100 nm is a task target (N-4b), not a literature pass line.',
  ),
  'oxidation/lab-applied#thicknessNm': EDU(
    '원장 #57 — 필드 산화막 400 nm 는 과제 목표(N-4b)',
    'Ledger #57 — 400 nm field oxide is a task target (N-4b).',
  ),
  'oxidation/lab-applied#spreadPct': EDU(
    '원장 #58 — 균일도 규격은 제품 의존. 이 실습이 정한 값(N-4b)',
    'Ledger #58 — uniformity spec is product-dependent; the figure is set by this lab (N-4b).',
  ),
  'oxidation/lab-applied#throughputWph': EDU(
    '원장 #62 — 배치 처리량 과제 목표(N-4b)',
    'Ledger #62 — batch throughput task target (N-4b).',
  ),
  'oxidation/lab-advanced#thicknessNm': EDU(
    '원장 #69 — 과제 목표(N-4b). 응용(380~420)보다 좁은 것은 심화 난이도 설정',
    'Ledger #69 — task target (N-4b). Narrower than the applied stage (380–420) as a difficulty setting.',
  ),
  'oxidation/lab-advanced#spreadPct': EDU(
    '원장 #70 — 과제 목표(N-4b). 절대값은 응용과 같으나 기준 σ 가 달라 근거 행이 별개다',
    'Ledger #70 — task target (N-4b). Same absolute value as the applied stage but a different baseline σ, hence a separate ledger row.',
  ),
  // 🔴 명세의 원 판정은 `E_bd ≥ 8.0 MV/cm`(원장 #71 · A6 미충족)였다. 절대 전계는 라이선스 문제로
  //    화면에서 뺐고(`oxidation.ts` 머리주석 · 원장 M-36), 상대 지수 0.90 으로 갈았다.
  //    **문헌 판정선이 아님을 코드가 스스로 밝힌 값**이므로 ②다. 다만 「진짜 파괴 전계 합격선」은 여전히 미해결.
  'oxidation/lab-advanced#breakdownIndex': EDU(
    '문헌 판정선이 아니라 이 실습이 제시하는 조건(건식·청정·1000 °C = 1.00 기준의 상대 지수). 🔴 원 판정 `E_bd ≥ 8.0 MV/cm`(원장 #71)은 A6 미충족으로 남아 있고, 절대 전계는 라이선스 문제로 화면에서 뺐다(원장 M-36)',
    'Not a literature pass line but a condition this lab proposes (relative index with dry/clean/1000 °C = 1.00). The original criterion E_bd ≥ 8.0 MV/cm (ledger #71) remains A6-unmet, and absolute field strength was removed from the screen for licensing reasons (ledger M-36).',
  ),
  'oxidation/lab-advanced#oisfDensity': EDU(
    '원장 #74 — 결함 밀도 과제 목표(N-4b)',
    'Ledger #74 — defect density task target (N-4b).',
  ),
  'oxidation/lab-advanced#throughputWph': EDU(
    '원장 #77 — 처리량 과제 목표(N-4b)',
    'Ledger #77 — throughput task target (N-4b).',
  ),

  /* ─── P3 포토 ───────────────────────────────────────────────────────── */
  // 🔴 원장 §3-3 은 「CD ±10 %」(S141·S144 2건 일치)를 준다 → 45 nm 의 ±10 % = 40.5~49.5.
  //    코드는 그보다 **좁은** 42~48 을 쓴다. 문헌값을 쓴 것이 아니라 문헌보다 좁힌 것이므로 ①이 아니다.
  'photo/lab-basic#cdNm': EDU(
    '원장 #89 — 45 nm 는 노드 명칭이자 과제 목표(N-4b). 문헌 공정윈도우는 CD ±10 %(=40.5~49.5 nm)이고 이 창은 그보다 좁은 ±6.7 %',
    'Ledger #89 — 45 nm is both a node name and a task target (N-4b). The literature process window is CD ±10 % (40.5–49.5 nm); this window is tighter at ±6.7 %.',
  ),
  'photo/lab-basic#swaDeg': EDU(
    '원장 #119 — 82° 의 출처 없음(N-4b). 문헌 기준선은 「측벽각 > 80°」이고 82 는 그보다 엄격한 설계값',
    'Ledger #119 — the 82° figure has no source (N-4b). The literature baseline is “sidewall angle > 80°”; 82 is a stricter design choice.',
  ),
  'photo/lab-applied#resolutionNm': EDU(
    '원장 #104 — 58 nm 는 과제 목표(45 nm 라인 + 여유 · N-4b)',
    'Ledger #104 — 58 nm is a task target (45 nm line plus margin, N-4b).',
  ),
  // 🔴 원장 #106 은 `DOF ≥ 80.0 nm` 로 적혀 있고 코드는 100 이다. 100 은 NA 합격폭을 3칸으로
  //    좁히려는 DEV 재설계(`photo.ts` 주석)다. 갈래는 어느 쪽이든 N-4b(②)로 같다.
  'photo/lab-applied#dofNm': EDU(
    '원장 #106 — 과제 목표(N-4b). 🔴 원장 표기는 ≥ 80 nm 이고 코드는 100 nm 다 — NA 합격폭을 3칸으로 좁히려는 난이도 재설계',
    'Ledger #106 — task target (N-4b). The ledger states ≥ 80 nm while the code uses 100 nm, a difficulty redesign narrowing the passing NA range to three steps.',
  ),
  'photo/lab-applied#cdNm': EDU(
    '원장 #108(#89 와 동일) — 과제 목표(N-4b). 문헌 공정윈도우 CD ±10 % 보다 좁다',
    'Ledger #108 (same as #89) — task target (N-4b), tighter than the literature CD ±10 % window.',
  ),
  'photo/lab-advanced#resolutionNm': EDU(
    '원장 #104 계 — 과제 목표(N-4b). 심화에서 판정으로 올린 것은 DEV 판단',
    'Per ledger #104 — task target (N-4b). Promoting it to a judged output in the advanced stage was a DEV decision.',
  ),
  'photo/lab-advanced#dofNm': EDU(
    '원장 #106 계 — 과제 목표(N-4b). 심화에서 판정으로 올린 것은 DEV 판단',
    'Per ledger #106 — task target (N-4b). Promoting it to a judged output in the advanced stage was a DEV decision.',
  ),
  'photo/lab-advanced#cdNm': EDU(
    '원장 #117(#89) — 과제 목표(N-4b)',
    'Ledger #117 (= #89) — task target (N-4b).',
  ),
  'photo/lab-advanced#swaDeg': EDU(
    '원장 #119 — 82° 의 출처 없음(N-4b). 문헌 기준선 「> 80°」보다 엄격한 설계값',
    'Ledger #119 — the 82° figure has no source (N-4b); stricter than the literature “> 80°” baseline.',
  ),
  'photo/lab-advanced#yieldPct': EDU(
    '원장 #123 — 수율 과제 목표(N-4b)',
    'Ledger #123 — yield task target (N-4b).',
  ),
  'photo/lab-advanced#throughputWph': EDU(
    '원장 #125 — 스루풋 과제 목표(N-4b)',
    'Ledger #125 — throughput task target (N-4b).',
  ),

  /* ─── P4 식각 ───────────────────────────────────────────────────────── */
  'etch/lab-basic#depthNm': EDU(
    '원장 #142 — 목표 깊이 300 nm ±5 %(N-4b)',
    'Ledger #142 — target depth 300 nm ±5 % (N-4b).',
  ),
  'etch/lab-applied#depthNm': EDU(
    '원장 #157 — 목표 깊이 400 nm ±5 %(N-4b)',
    'Ledger #157 — target depth 400 nm ±5 % (N-4b).',
  ),
  'etch/lab-applied#anisotropy': EDU(
    '원장 #158 — 측벽각 86° 는 제품 의존(N-4b). 문헌 실측 사이드월 각도는 다른 값이다',
    'Ledger #158 — the 86° sidewall angle is product-dependent (N-4b); measured sidewall angles in the literature differ.',
  ),
  'etch/lab-applied#selectivityPR': EDU(
    '원장 #159 — 과제 목표(N-4b). 문헌 실측 선택비(22)와 다른 값이다',
    'Ledger #159 — task target (N-4b); differs from the measured selectivity in the literature (22).',
  ),
  'etch/lab-advanced#anisotropy': EDU(
    '원장 #165 — 과제 목표(N-4b). 응용(0.930)보다 엄격한 심화 난이도 설정',
    'Ledger #165 — task target (N-4b); stricter than the applied stage (0.930) as an advanced-difficulty setting.',
  ),
  'etch/lab-advanced#underlayerLossNm': EDU(
    '원장 #166 — 하부막 10 nm 의 절반이라는 설계 선택(N-4b)',
    'Ledger #166 — a design choice of half the 10 nm underlayer (N-4b).',
  ),
  'etch/lab-advanced#residueIndex': EDU(
    '원장 #167 — 무차원 합성 지수의 과제 목표(N-4b)',
    'Ledger #167 — task target on a dimensionless synthetic index (N-4b).',
  ),
  'etch/lab-advanced#throughputWph': EDU(
    '원장 #168 — 사이클 300 초 이내 = 시간당 12 장(N-4b)',
    'Ledger #168 — a cycle within 300 s, i.e. 12 wafers per hour (N-4b).',
  ),
  'etch/lab-advanced#yieldPct': EDU(
    '원장 #169 — 수율 과제 목표(N-4b)',
    'Ledger #169 — yield task target (N-4b).',
  ),

  /* ─── P5 증착·이온주입 ──────────────────────────────────────────────── */
  'deposition/lab-basic#thicknessNm': EDU(
    '원장 #183 — 목표 두께 24 nm ±1(N-4b)',
    'Ledger #183 — target thickness 24 nm ±1 (N-4b).',
  ),
  'deposition/lab-applied#junctionDeepNm': EDU(
    '원장 #194 — 목표 접합 깊이 200 nm ±20(N-4b)',
    'Ledger #194 — target junction depth 200 nm ±20 (N-4b).',
  ),
  'deposition/lab-applied#implantTimeS': EDU(
    '원장 #196 의 처리량 목표 60 wafer/h 를 시간으로 환산한 선(오버헤드 25 s 고정 · N-4b)',
    'Derived from the 60 wafer/h throughput target in ledger #196, converted to time with a fixed 25 s overhead (N-4b).',
  ),
  'deposition/lab-advanced#filmThicknessNm': EDU(
    '원장 #183 과 같은 상수를 심화가 공유한다 — 목표 두께 24 nm ±1(N-4b). 🔴 심화용 별도 등재 행은 원장에 없다',
    'The advanced stage shares the same constant as ledger #183 — target thickness 24 nm ±1 (N-4b). No separate advanced-stage row exists in the ledger.',
  ),
  'deposition/lab-advanced#junctionDeepNm': EDU(
    '원장 #217(#194) — 목표 접합 깊이 200 nm ±20(N-4b)',
    'Ledger #217 (= #194) — target junction depth 200 nm ±20 (N-4b).',
  ),
  // 🔴 이 창은 DEV 가 심화에 신설한 것이고, 원장 부록에 대응 행이 없다. PLN 승인 기록도 못 찾았다.
  'deposition/lab-advanced#straggleNm': UNK(
    '🔴 40 nm 의 유래를 말하는 기록이 코드·명세·부록 원장·스레드 어디에도 없다. DEV 가 심화에 신설한 판정선이며 N-4a·N-4b 어느 쪽으로도 분류된 적이 없다',
    'No record anywhere in the code, spec, appendix ledger, or threads explains where 40 nm comes from. It is a pass line DEV added for the advanced stage and has never been classified as N-4a or N-4b.',
  ),
  'deposition/lab-advanced#implantTimeS': EDU(
    '원장 #196 계열의 처리량 목표를 시간으로 환산한 선(N-4b)',
    'Derived from the throughput target in the ledger #196 family, converted to time (N-4b).',
  ),

  /* ─── P6 금속배선 ───────────────────────────────────────────────────── */
  // 🔴 하한 302.5 는 S200(`physics/metal/cmp.ts` 의 `withSource`)인데 **상한 350.1 은 맨 리터럴**이고
  //    명세 스스로 「근거 미상」(D-041)이라 적었다. 성분 하나가 ③이므로 창은 ③.
  'metal/lab-basic#removalRateNmPerMin': UNK(
    '🔴 하한 302.5 nm/min 은 S200 등재값이지만 **상한 350.1 은 근거 미상**이다 — 명세가 스스로 「`withSource` 가 없다 · 근거 미상(D-041)」이라 적었다. 한쪽이 근거 미상이므로 창 전체를 근거 미상으로 표기한다',
    'The lower bound 302.5 nm/min is a registered S200 value, but the upper bound 350.1 has no basis — the spec itself notes it lacks withSource and is “basis unknown” (D-041). Since one bound is unsourced, the whole window is marked unknown.',
  ),
  'metal/lab-applied#removalRateNmPerMin': UNK(
    '🔴 하한 302.5 nm/min 은 S200 등재값이지만 상한 350.1 은 근거 미상이다(명세 자인). 기초 칸과 같은 상수',
    'The lower bound 302.5 nm/min is a registered S200 value, but the upper bound 350.1 has no basis (acknowledged in the spec). Same constants as the basic stage.',
  ),
  'metal/lab-advanced#removalRateNmPerMin': UNK(
    '🔴 하한 302.5 nm/min 은 S200 등재값이지만 상한 350.1 은 근거 미상이다(명세 자인). 기초 칸과 같은 상수',
    'The lower bound 302.5 nm/min is a registered S200 value, but the upper bound 350.1 has no basis (acknowledged in the spec). Same constants as the basic stage.',
  ),
  'metal/lab-applied#polishTimeMin': EDU(
    'CMP 사이클 예산 135 s = 2.25 min(주연마 120 + 오버폴리시 15). 문항이 제시하는 조건(A6-b)',
    'CMP cycle budget of 135 s = 2.25 min (120 s main polish + 15 s overpolish) — a condition given by the exercise (A6-b).',
  ),
  'metal/lab-advanced#polishTimeMin': EDU(
    'CMP 사이클 예산 135 s = 2.25 min(주연마 120 + 오버폴리시 15). 문항이 제시하는 조건(A6-b)',
    'CMP cycle budget of 135 s = 2.25 min (120 s main polish + 15 s overpolish) — a condition given by the exercise (A6-b).',
  ),
  'metal/lab-applied#resistanceRatio': EDU(
    '상대 목표 전환(명세 §4-1(c)) — 기본 조합 대비 저항 25 % 저감. 배율 0.75 는 난이도 설정(A6-b)',
    'Relative-target conversion (spec §4-1(c)) — a 25 % resistance reduction versus the default combination. The 0.75 factor is a difficulty setting (A6-b).',
  ),
  'metal/lab-advanced#resistanceRatio': EDU(
    '상대 목표 전환 — 기본 조합 대비 저항 32 % 저감. 심화는 길이 슬라이더가 있어 더 낮출 수 있다(A6-b)',
    'Relative-target conversion — a 32 % resistance reduction versus the default combination. The advanced stage adds a length slider allowing further reduction (A6-b).',
  ),
  // 🔴 부록 원장 #280 은 `A6→상대전환` 으로 적었으나, **더 최신인 P6 정합표**(2026-08-21)가
  //    「A6 미충족 · 「근거 미상」(D-041)」로 갱신했다. 최신 판단을 따른다.
  'metal/lab-applied#pitchNm': UNK(
    '🔴 명세 P6 정합표가 「A6 미충족 · 근거 미상(D-041)」이라 적었다 — 노드 피치는 로드맵 값이나 참조 문헌이 다른 노드만 다뤄 근거를 대지 못한다고 자인했다. S번호 조달 미완',
    'The P6 reconciliation table in the spec records this as “A6 unmet · basis unknown (D-041)” — node pitch is a roadmap value, but the referenced source covers a different node, so no basis could be given. Source procurement is incomplete.',
  ),
  'metal/lab-advanced#pitchNm': UNK(
    '🔴 명세 P6 정합표가 「A6 미충족 · 근거 미상(D-041)」이라 적었다. 응용 칸과 같은 상수',
    'The P6 reconciliation table in the spec records this as “A6 unmet · basis unknown (D-041)”. Same constant as the applied stage.',
  ),
  'metal/lab-advanced#rcDelayRatio': EDU(
    '상대 목표 전환 — 기본 조합 대비 RC 지연 55 % 저감. 배율 0.45 는 난이도 설정(A6-b)',
    'Relative-target conversion — a 55 % RC-delay reduction versus the default combination. The 0.45 factor is a difficulty setting (A6-b).',
  ),
  'metal/lab-advanced#emLifetimeRatio': EDU(
    '상대 목표 전환 — 기본 조합 대비 EM 수명 2.5 배. 배율 2.5 는 난이도 설정이라 S번호가 필요 없다(A6-b)',
    'Relative-target conversion — 2.5× the EM lifetime of the default combination. The 2.5 factor is a difficulty setting, so no source ID is required (A6-b).',
  ),
  'metal/lab-advanced#blechMargin': LIT('S206',
    'Blech 임계곱 — 불멸(immortality) 조건 Δσ < 2σ_crit 에서 유도한 (j·l)_crit. 명세 등급 A6',
    'Blech threshold product — (j·l)_crit derived from the immortality condition Δσ < 2σ_crit. Spec grade A6.',
  ),

  /* ─── P7 EDS ────────────────────────────────────────────────────────── */
  // 🔴 P7·P8 은 부록 원장(#297·#298·#299·#307…)이 **낡았다.** DEV 가 「존재하지 않는 규격」
  //    (Rc ≤ 0.90 Ω · Dm ≤ 45 µm)을 걷어내고 S229 실무 구간으로 갈아끼웠다. 코드 사슬을 정본으로 본다.
  'eds/lab-basic#overdriveMarginUm': LIT('S229',
    'S229 실무 오버드라이브 구간 25~76 µm 의 양끝까지 남은 여유. 두 경계 모두 물리층에 `withSource` 로 등재돼 있다',
    'Margin to both ends of the S229 practical overdrive range of 25–76 µm; both bounds are registered in the physics layer via withSource.',
  ),
  'eds/lab-basic#contactResistanceUOhm': LIT('S229',
    'S229 가 인쇄한 BeCu–Al 접촉저항 공칭값 200 µΩ. 코드가 그 상수를 직접 읽는다',
    'The nominal BeCu–Al contact resistance of 200 µΩ printed in S229; the code reads that constant directly.',
  ),
  'eds/lab-basic#scrubClearanceUm': LIT('S229',
    'S229 의 기하 조건 「최대 오버드라이브에서 스크럽 마크가 패시베이션 개구부 안」. 🔴 S229 는 수치 규격을 주지 않으며, 비교 대상 개구부 60 µm 는 이 시나리오의 패드 치수다',
    'The S229 geometric condition that the scrub mark stays inside the passivation opening at maximum overdrive. S229 gives no numeric spec; the 60 µm opening compared against is this scenario’s own pad dimension.',
  ),
  'eds/lab-applied#defectLevelPpm': UNK(
    '🔴 명세가 「판정값 2000 ppm 의 S번호를 대지 못한다 — 근거 미상(D-041)」이라 적었다(A6 미충족). 상대 전환 대상으로만 남아 있다',
    'The spec states plainly that no source ID could be given for the 2000 ppm criterion — basis unknown (D-041, A6 unmet). It remains only a candidate for relative-target conversion.',
  ),
  'eds/lab-applied#waferTestMin': UNK(
    '🔴 명세가 「동상 — 근거 미상」이라 적었다(A6 미충족). 상대 전환 대상',
    'The spec records the same finding — basis unknown (A6 unmet). A candidate for relative-target conversion.',
  ),
  // 🔴 명세는 상대 목표(≤ 0.95 × 기본 조합 비용)로 확정했는데 코드는 절대 100 원을 쓴다.
  //    현재는 0.95 × 105.247 = 99.98 이라 값이 사실상 같아 증상이 안 보인다. 갈래는 ② 로 같다.
  'eds/lab-applied#costPerGoodDie': EDU(
    '상대 목표 전환 — 기본 조합 대비 5 % 절감(A6-b · 배율 0.95 는 난이도 설정). 🔴 명세는 상대 목표로 확정했으나 코드는 절대 100 원을 쓴다(현재 0.95 × 105.247 = 99.98 로 값이 거의 같다)',
    'Relative-target conversion — a 5 % saving versus the default combination (A6-b; the 0.95 factor is a difficulty setting). The spec settled on a relative target, but the code still uses an absolute 100 KRW (currently 0.95 × 105.247 = 99.98, so the values nearly coincide).',
  ),
  'eds/lab-advanced#overdriveMarginUm': LIT('S229',
    'S229 실무 오버드라이브 구간 25~76 µm 의 양끝까지 남은 여유. 명세 등급 A6',
    'Margin to both ends of the S229 practical overdrive range of 25–76 µm. Spec grade A6.',
  ),
  'eds/lab-advanced#scrubClearanceUm': LIT('S229',
    'S229 의 기하 조건 「최대 오버드라이브에서 스크럽 마크가 패시베이션 개구부 안」. 개구부 60 µm 는 시나리오 패드 치수다',
    'The S229 geometric condition that the scrub mark stays inside the passivation opening at maximum overdrive; the 60 µm opening is this scenario’s pad dimension.',
  ),
  'eds/lab-advanced#contactResistanceUOhm': LIT('S229',
    'S229 가 인쇄한 BeCu–Al 접촉저항 공칭값 200 µΩ. 명세 등급 A6',
    'The nominal BeCu–Al contact resistance of 200 µΩ printed in S229. Spec grade A6.',
  ),
  'eds/lab-advanced#defectLevelPpm': UNK(
    '🔴 명세가 「근거 미상」이라 적었다(A6 미충족). 상대 전환 대상',
    'The spec records this as basis unknown (A6 unmet). A candidate for relative-target conversion.',
  ),
  'eds/lab-advanced#observedYield': UNK(
    '🔴 명세가 「근거 미상」이라 적었다(A6 미충족)',
    'The spec records this as basis unknown (A6 unmet).',
  ),
  'eds/lab-advanced#throughputWph': UNK(
    '🔴 명세가 「근거 미상」이라 적었다(A6 미충족)',
    'The spec records this as basis unknown (A6 unmet).',
  ),

  /* ─── P8 패키징 ─────────────────────────────────────────────────────── */
  // 🔴 부록 원장은 P8 을 Tj ≤ 105 °C · 워피지 · 코플래너리티로 적고 상당수를 A6 미충족으로 남겼다.
  //    그 판정들은 「어느 표준에도 없다」는 이유로 구현에서 빠졌고(원장 M-26), 대신 실재하는
  //    JEDEC·MIL 표준 판정으로 갈렸다. 그래서 P8 판정 8건이 전부 문헌 사슬을 갖는다.
  'packaging/lab-basic#riseC': LIT('S247',
    'S247 이 인쇄한 최소 권장 상승폭 20 °C 와 통상 상한 60 °C. 🔴 표준은 이를 **시험 설계 지침**으로 적었고 「합격선」이라고 말하지 않는다 — 두 진술을 창으로 묶은 것은 이 실습의 판단이다',
    'The minimum recommended rise of 20 °C and typical upper bound of 60 °C printed in S247. The standard presents these as test-design guidance, not as a pass line; combining them into a window is this lab’s decision.',
  ),
  'packaging/lab-basic#tunnelVelocityOk': LIT('S255',
    'S255 §4.1 — 풍동 유속은 10 m/s 미만이어야 한다(엄격부등호). 물리층에 `withSource` 로 등재',
    'S255 §4.1 — wind-tunnel velocity must be below 10 m/s (strict inequality); registered in the physics layer via withSource.',
  ),
  'packaging/lab-basic#velocityMeasurementOk': LIT('S255',
    'S255 §4.5.1 — 유속은 소자 상류에서 측정한다. 측정 위치 적합성 판정',
    'S255 §4.5.1 — velocity is measured upstream of the device; this judges the adequacy of the measurement location.',
  ),
  'packaging/lab-applied#floorLifeMarginH': LIT('S248',
    'S248 Table 4 의 MSL 등급별 플로어 라이프에서 노출시간을 뺀 잔여. 요구치가 표준 표에 등재돼 있다',
    'Floor life by MSL class from S248 Table 4 minus the exposure time; the requirement comes from the standard’s table.',
  ),
  'packaging/lab-applied#acceleratedSoakOk': LIT('S248',
    'S248 Table 4 NOTE — 60 °C/60 %RH 가속 소킹의 적용 가능 조건. 활성화 에너지까지 표준값이다',
    'S248 Table 4 NOTE — the conditions under which 60 °C/60 %RH accelerated soak may be applied; even the activation energies are standard values.',
  ),
  'packaging/lab-advanced#speedMatchesConcern': LIT('S249',
    'S249 §4.7.1 · Table 4.1 — 관심사(계면 취성 vs 벌크 연성)별 전단속도 조건 A/B 대응',
    'S249 §4.7.1 and Table 4.1 — matching shear speed conditions A/B to the concern (interfacial brittle vs bulk ductile).',
  ),
  'packaging/lab-advanced#elapsedWithinWindow': LIT('S249',
    'S249 §4.12 — 리플로우 후 경과시간 권장 창(최소 1 h · SnPb 4 h · 무연 24 h). 🔴 표준은 이를 시험 재현 조건으로 적었다',
    'S249 §4.12 — the recommended post-reflow elapsed-time window (minimum 1 h; SnPb 4 h; lead-free 24 h). The standard presents this as a test-reproducibility condition.',
  ),
  'packaging/lab-advanced#dieShearMarginKg': LIT('S43',
    '인가력에서 S43 의 다이 전단 요구치를 뺀 여유. 요구치(면적당 0.04 kg · 소면적 하한 · 대면적 평탄부 2.5 kg)가 표준에 등재돼 있다',
    'Applied force minus the die-shear requirement from S43; the requirement (0.04 kg per unit area, small-area floor, 2.5 kg large-area plateau) is registered in the standard.',
  ),
};

/* ---------------- 조회 ---------------- */

/**
 * 이 출력의 합격창 근거. 🔴 **원장에 없으면 「근거 미상」을 돌려준다 — 빈칸을 돌려주지 않는다.**
 *
 * 빈칸은 「아직 안 채운 것」으로 보이지만, 화면에서는 **종전과 똑같이 「출처 없는 숫자」**가 된다.
 * 그것이 CEO 가 지적한 바로 그 상태다. **모르면 「모른다」고 적는다**(D-050 K-6).
 */
export function passBasisOf(spec: LabSpec, output: LabOutput): PassBasis | null {
  // 판정하지 않는 출력에는 합격창이 없다 — 근거를 물을 대상 자체가 아니다.
  if (output.role !== 'judge' || !output.pass) return null;
  if (output.pass.min === undefined && output.pass.max === undefined) return null;
  return PASS_BASIS_LEDGER[passBasisKey(spec.processId, spec.stage, output.id)]
    ?? { kind: 'unknown' };
}
