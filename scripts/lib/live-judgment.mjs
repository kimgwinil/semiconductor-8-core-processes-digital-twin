/**
 * 「살아 있는 판정」 판정 규칙 — **정본은 여기 한 곳이다.**
 *
 * 🔴 왜 lib 로 빼는가: `scripts/lib/frame.mjs` 와 같은 이유다. 규칙을 게이트 본체와
 *    픽스처 양쪽에 적어 두면 **한쪽만 고쳐지고 픽스처는 계속 통과한다.** 게이트
 *    `check-live-judgment.mjs` 와 자체검증 `selftest-gates.mjs` 가 **같은 함수**를 부른다.
 *
 * ── PLN 확정 정의 (PD-52, 임의 변경 금지) ──────────────────────────────────────
 *   **살아 있는 판정 = 합격 조합도 있고 불합격 조합도 있는 판정.**
 *   **합격 0 = 도달 불가 · 불합격 0 = 무의미. 둘 다 위반.**
 *
 *   FAIL 로 잡는 것은 셋뿐이다:
 *     ① 존재성 — 판정 자체가 존재하는가
 *     ② 반증성 — 불합격이 나올 수 있는 조합이 존재하는가
 *     ③ 동시성 — 합격과 불합격이 **같은 판정 안에** 둘 다 존재하는가
 *
 * 🔴 **발견 가능성(합격 비율 · 도달 스텝 수)에 임계를 두지 않는다.** 수치는 보고만 한다.
 *    임계를 FAIL 에 넣는 순간 사람이 고칠 대상은 판정이 아니라 **임계**가 된다.
 *
 * 🔴 **표본에서 합격이 0 이면 FAIL 이 아니라 `UNDETERMINED` 다.**
 *    표본이 못 찾은 것과 도달 불가는 다르다. `UNDETERMINED` 를 PASS 로 집계하지 않는다.
 *    🔴 2026-08-22 추가 — 거기서 **멈추지도 않는다.** `focusedResample()` 이 ①도달불가 ·
 *    ②격자엇갈림 · ③표본부족 을 실제로 가른다. 자세한 근거는 그 함수 머리주석에 있다.
 *    (비대칭의 근거: 합격창은 **좁게 설계된 표적**이라 표본이 놓치는 일이 흔하다.
 *     반대로 불합격 영역은 합격창의 여집합이라 보통 훨씬 넓고, 스윕은 파라미터 격자의
 *     **모든 모서리 2^n 을 전수**로 포함한다 — 모든 극단에서까지 합격이면 선언된 범위 안에
 *     불합격 영역이 없다는 뜻이므로 「무의미한 판정」으로 단정할 수 있다.)
 *
 * 🔴 **R-0(입력 부재) 전용 검사를 만들지 않는다.** 입력이 없으면 출력이 상수이고,
 *    상수 판정은 항상 참(→ 반증성 위반) 또는 항상 거짓(→ 합격 0)이라 위 셋에 자동으로 걸린다.
 *    출력의 상수 여부는 **수치로 보고만** 한다(`constant` 필드).
 */

/* ══════════════ 판정 단위 ══════════════
 *
 * L1 = 출력 단위 판정 `(labKey, outputId)` — `role:'judge'` 이고 합격창이 있는 출력.
 * L2 = 랩 전체 판정 `labKey` — `LabVerdict.pass`(judge 출력이 **전부** 합격일 때만 true).
 *
 * L2 를 따로 두는 이유(동시성이 반증성과 다른 것을 잡는 지점):
 *   출력 A·B 가 각각 살아 있어도(각자 합격·불합격 둘 다 존재) A 와 B 가 상충해
 *   **동시 합격이 불가능**하면 랩 전체 판정은 영원히 불합격이다.
 *   L1 반증성만 보면 전부 통과하고, **L2 동시성이라야 잡힌다.**
 */

export const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNDETERMINED: 'UNDETERMINED',
  /**
   * 🔴 **계측기가 자기 일을 못 했다.** 판정 실패가 아니다.
   *
   * 왜 갈랐나(2026-08-22 팀장 판정): 종전에는 모듈 적재 실패·관측 0건을 `FAIL`(exit 1)로 냈다.
   * 그러면 **계측기가 고장 났는데 「위반을 찾았다」고 보고**하게 된다 — 이 프로젝트가
   * 오늘 하루 종일 싸운 병 그 자체다. ERROR 는 종료코드 **2** 로 나가고 ⚠️ 로 분류된다.
   */
  ERROR: 'ERROR',
});

/* 🔴 결정론 스윕 공용 상수는 **여기서 선언하지 않는다.** `check-passwindow.mjs` 와 같은 수를
 *    두 번 적어 check-constants R1 2건이 났다(2026-08-21). 정본은 `lib/sweep-constants.mjs` 다. */
export { SWEEP_SEED, CORNER_PARAM_LIMIT } from './sweep-constants.mjs';
import { SWEEP_SEED, CORNER_PARAM_LIMIT } from './sweep-constants.mjs';

/**
 * 랩당 무작위 표본 수 — **이 게이트 고유의 값이다.**
 *
 * 🔴 `check-passwindow.mjs` 의 `SAMPLES_PER_LAB = 4000` 과 **같은 개념이 아니다.**
 *    저쪽은 「희귀 위반을 찾는 탐색 예산」이라 줄이면 탐지력이 깎이고,
 *    이쪽은 「합격·불합격이 둘 다 나오는지 보는 관측 예산」이라 줄면 `UNDETERMINED` 가 늘 뿐이다.
 *    실측: 3,000 → 3,000,000 (1000배) 로 늘려도 이 게이트의 판정은 바뀌지 않았다.
 *    **판정을 가르는 임계가 아니라 운영 예산**이라는 뜻이다.
 *    그래서 통일하지 않고 이름을 갈랐다(check-constants R2 해소).
 */
export const LIVE_JUDGMENT_SAMPLES_PER_LAB = 3000;

/* ──────────────────────────────────────────────────────────────────────────────
 * ① 정적 규칙 — 표본과 무관하게 성립한다
 * ────────────────────────────────────────────────────────────────────────────── */

/** 이 출력이 **판정 단위**인가. `role:'judge'` + 합격창에 경계가 하나라도 있어야 한다. */
export function isJudgmentUnit(o) {
  if (o.role !== 'judge') return false;
  if (!o.pass) return false;
  return o.pass.min !== undefined || o.pass.max !== undefined;
}

/**
 * 이 `[lo,hi]` 로 정의역을 논할 수 있는가.
 *
 * 🔴 **무한 경계는 결함이 아니라 「그쪽에 경계가 없다」는 정당한 선언이다.** (2026-08-22 규명)
 *
 * 사고: 종전 LJ-2 는 `Number.isFinite(lo) && Number.isFinite(hi)` 를 통과 조건으로 썼다.
 * 그래서 `validRange: [Number.NEGATIVE_INFINITY, 25.5]` 같은 **편측 정의역 7건(전부 eds)** 을
 * 「못 읽은 것」으로 세어 LJ-2 실질 모수가 69/76 에 멈춰 있었다.
 * 앞선 조사는 이것을 「`validRange` 에 `null` 이 들어 있다」고 적었으나, `src/` 어디에도
 * `null` 리터럴은 없다 — **`JSON.stringify(-Infinity) === 'null'`** 이라 관측 도구가 그렇게
 * 찍었을 뿐이다. 제품(`contract.ts :: quantity()`)은 `value < lo || value > hi` 로 판정하므로
 * `lo = -∞` 를 **정확히 「아래쪽 무제한」으로** 다룬다. 즉 소스는 옳고 게이트가 틀렸다.
 *
 * 배제하는 것은 둘뿐이다:
 *   ① `NaN` — 무엇도 비교할 수 없다.
 *   ② `lo = +∞` 또는 `hi = -∞` — 구간 안에 **유한한 실수가 하나도 없다**(퇴화 선언).
 *      이때 「서로소」라고 단정하면 원인이 정의역 배치가 아니라 선언 오류인데 LJ-2 가
 *      엉뚱한 진단을 내놓게 된다. 그래서 FAIL 로 만들지 않고 **모수에서 뺀다.**
 *   (`lo > hi` 로 구간이 빈 경우도 같은 이유로 뺀다.)
 */
/**
 * 수를 **있는 그대로** 적는다.
 *
 * 🔴 **`JSON.stringify` 를 쓰지 않는다.** `JSON.stringify(-Infinity) === 'null'` 이라
 *    무한 경계를 `null` 로 찍는다. 2026-08-22 조사가 「validRange 에 null 이 들어 있다」고
 *    잘못 결론 낸 원인이 정확히 이것이다 — **계측기의 출력 형식이 원인 진단을 뒤집었다.**
 */
export function numText(v) {
  if (typeof v !== 'number') return `${typeof v}:${String(v)}`;
  if (Number.isNaN(v)) return 'NaN';
  if (v === Number.POSITIVE_INFINITY) return '+Infinity';
  if (v === Number.NEGATIVE_INFINITY) return '-Infinity';
  return String(v);
}

export function isUsableDomain(lo, hi) {
  if (typeof lo !== 'number' || typeof hi !== 'number') return false;
  if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
  if (lo > hi) return false;
  if (lo === Number.POSITIVE_INFINITY || hi === Number.NEGATIVE_INFINITY) return false;
  return true;
}

/**
 * 합격창과 구간 `[lo,hi]` 가 **서로소**인가 — 「이 구간의 어떤 값도 합격할 수 없다」.
 * 🔴 정적 경로(명세 `o.domain`)와 런타임 경로(`Quantity.validRange`)가 **같은 함수**를 쓴다.
 *    규칙을 두 군데 적으면 한쪽만 고쳐지고 픽스처는 계속 통과한다.
 *
 * ── 🔴 무한 경계에서 판정이 어떻게 되는가 (수식) ──────────────────────────────
 *   판정 대상은 **유한 실수**뿐이다(`evaluate()` 가 `Number.isFinite(v)` 를 먼저 건다).
 *     정의역  D = { x ∈ ℝ : lo ≤ x ≤ hi }
 *     합격창  P = { x ∈ ℝ : (min 없음 ∨ x ≥ min) ∧ (max 없음 ∨ x ≤ max) }   (min·max 는 유한)
 *
 *   P ∩ D = ∅  ⟺  (min 있음 ∧ min > hi)  ∨  (max 있음 ∧ max < lo)
 *
 *   여기에 무한을 대입하면 **추가 분기 없이** 옳은 답이 나온다:
 *     · hi = +∞ → `min > +∞` 는 항상 거짓. 위로 열린 정의역은 어떤 유한 min 에도 닿는다. ✔
 *     · lo = −∞ → `max < −∞` 는 항상 거짓. 아래로 열린 정의역은 어떤 유한 max 에도 닿는다. ✔
 *     · [−∞, +∞] → 둘 다 거짓 = 절대 서로소가 아니다. D = ℝ 이므로 옳다. ✔
 *   그래서 유한성 검사를 **지운다.** 그것은 수식이 요구한 것이 아니라 계측기가 덧붙인 것이었다.
 *
 *   실제 7건에 대입하면(전부 서로소 아님 = LJ-2 위반 없음, 다만 이제 **모수에 들어온다**):
 *     overdriveMarginUm  P={x≥0},   D=(−∞, 25.5] → 0 > 25.5 거짓 → 교집합 [0, 25.5] ≠ ∅
 *     contactResistance  P={x≤200}, D=[0, +∞)    → 200 < 0 거짓 → 교집합 [0, 200] ≠ ∅
 */
export function windowDisjointFrom(pass, lo, hi) {
  if (!pass || !isUsableDomain(lo, hi)) return false;
  const { min, max } = pass;
  if (min !== undefined && min > hi) return true;   // 합격창이 구간 **위**에 있다
  if (max !== undefined && max < lo) return true;   // 합격창이 구간 **아래**에 있다
  return false;
}

/**
 * 정적 존재성 검사(LJ-1 · LJ-2). 표본을 돌리기 전에 확정되는 FAIL 만 돌려준다.
 *
 * LJ-1  존재성        — 랩에 판정 단위가 0개 / judge 인데 합격창이 없거나 비어 있음
 * LJ-2  구조적 도달불가 — 합격창이 공집합이거나 **선언된 정의역과 서로소**
 *
 * 🔴 LJ-2 는 명세가 **선언한** `domain` 만 본다. 실행 중 `Quantity.validRange` 는
 *    입력에 따라 변할 수 있어(패키징의 여유 출력) 한 표본으로 「구조적」이라 단정할 수 없다.
 *    그 경우는 표본 규칙(합격 0 → UNDETERMINED)으로 흘려보낸다.
 */
export function staticProblems(spec) {
  const out = [];
  const labKey = `${spec.processId}/${spec.stage}`;

  const units = spec.outputs.filter(isJudgmentUnit);

  // LJ-1a — 랩에 판정이 아예 없다. `evaluate()` 는 이때 **항상 false** 를 돌려준다
  //          (`judged.length > 0 && …`) — 판정이 아니라 상수 거짓이다.
  if (units.length === 0) {
    out.push({
      code: 'LJ-1',
      rule: '존재성',
      unit: labKey,
      level: 'L2',
      // 🔴 `message` 는 **단위 이름을 앞에 붙이지 않는다.** 보고하는 쪽이 `단위 (이름): ` 를
      //    이미 찍는다 — 여기서 또 붙이면 같은 키가 두 번 나온다(2026-08-21 픽스처 실측으로 발견).
      message:
        `판정 단위가 0개입니다 — role:'judge' 이고 합격창(min·max 중 하나 이상)이 있는 출력이 없습니다. `
        + `evaluate() 는 이 상태에서 무엇을 넣어도 pass:false 를 돌려줍니다(판정이 아니라 상수 거짓).`,
    });
  }

  for (const o of spec.outputs) {
    // LJ-1b — judge 라고 선언해 놓고 판정을 만들지 않는다.
    if (o.role === 'judge' && !isJudgmentUnit(o)) {
      out.push({
        code: 'LJ-1',
        rule: '존재성',
        unit: `${labKey} / ${o.id}`,
        level: 'L1',
        message:
          `role:'judge' 인데 합격창이 없습니다 (pass = ${JSON.stringify(o.pass)}). `
          + `evaluate() 는 이 출력에 pass:null 을 줍니다 — 판정이 존재하지 않습니다.`,
      });
      continue;
    }
    if (!isJudgmentUnit(o)) continue;

    const { min, max } = o.pass;

    // LJ-2a — 합격창 자체가 공집합
    if (min !== undefined && max !== undefined && min > max) {
      out.push({
        code: 'LJ-2',
        rule: '존재성(구조적 도달불가)',
        unit: `${labKey} / ${o.id}`,
        level: 'L1',
        message: `합격창이 공집합입니다 — pass.min ${min} > pass.max ${max}. 어떤 값도 합격할 수 없습니다.`,
      });
      continue;
    }

    // LJ-2b — 합격창과 **선언된 정의역**이 서로소
    const d = o.domain;
    // 🔴 유한성이 아니라 `isUsableDomain` 을 쓴다 — 런타임 경로와 **같은 문턱**이어야 한다.
    //    편측 정의역(`[-∞, hi]` · `[lo, +∞]`)은 제품이 정상으로 다루므로 게이트도 받아야 한다.
    if (Array.isArray(d) && d.length === 2 && isUsableDomain(d[0], d[1])) {
      if (windowDisjointFrom(o.pass, d[0], d[1])) {
        out.push({
          code: 'LJ-2',
          rule: '존재성(구조적 도달불가)',
          unit: `${labKey} / ${o.id}`,
          level: 'L1',
          message:
            `합격창 ${JSON.stringify(o.pass)} 가 선언된 정의역 [${d[0]}, ${d[1]}] 와 **서로소**입니다 — `
            + `성립 가능한 값 중 합격이 하나도 없습니다. `
            + `표본이 아니라 **구조로** 도달 불가이므로 UNDETERMINED 가 아니라 FAIL 입니다.`,
        });
      }
    }
  }

  return out;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ② 표본 — 결정론 스윕
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * 이 랩에서 볼 입력 조합을 만든다. 순서·개수가 매 실행 같아야 한다.
 *   ⓐ 기본값 1점 — 화면이 처음 보여 주는 상태다. 반드시 본다.
 *   ⓑ 격자 모서리 2^n 전수(n ≤ CORNER_PARAM_LIMIT) — 극단은 여기서 나온다.
 *   ⓒ LCG 무작위 격자점 SAMPLES_PER_LAB 개.
 *
 * 🔴 격자 값을 [min, max] 로 **클램프**한다. `min + n·step` 은 끝자리가 흔들려
 *    상한을 1 ULP 넘는 일이 있고(0.2 + 28×0.1 = 3.0000000000000004), 실제 슬라이더는
 *    상한으로 잘라 주므로 클램프하지 않으면 **UI 에 없는 입력**을 재게 된다.
 */
export function* sampleInputs(params, { seed = SWEEP_SEED, samples = LIVE_JUDGMENT_SAMPLES_PER_LAB, cornerLimit = CORNER_PARAM_LIMIT } = {}) {
  const ps = params;
  yield { kind: 'initial', inputs: Object.fromEntries(ps.map((p) => [p.id, p.initial])) };

  if (ps.length > 0 && ps.length <= cornerLimit) {
    for (let m = 0; m < (1 << ps.length); m++) {
      yield {
        kind: 'corner',
        inputs: Object.fromEntries(ps.map((p, i) => [p.id, ((m >> i) & 1) ? p.max : p.min])),
      };
    }
  }

  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let n = 0; n < samples; n++) {
    yield {
      kind: 'random',
      inputs: Object.fromEntries(ps.map((p) => {
        const steps = Math.max(1, Math.round((p.max - p.min) / p.step));
        const raw = p.min + Math.round(rnd() * steps) * p.step;
        return [p.id, Math.min(p.max, Math.max(p.min, raw))];
      })),
    };
  }
}

/** 기본값에서 이 조합까지 **슬라이더를 몇 칸 움직여야 하는가**(맨해튼 거리). 수치 보고 전용. */
function stepDistance(params, inputs) {
  let d = 0;
  for (const p of params) {
    const v = inputs[p.id];
    if (!Number.isFinite(v) || !Number.isFinite(p.step) || p.step === 0) continue;
    d += Math.round(Math.abs(v - p.initial) / p.step);
  }
  return d;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ③ 분류 — 셋뿐인 FAIL 규칙
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * 관측된 합격·불합격 수로 한 판정 단위를 분류한다. **여기에 임계값은 없다.**
 *
 *   합격>0 && 불합격>0 → PASS            (살아 있는 판정)
 *   불합격==0(합격>0)  → FAIL  LJ-3 반증성 (무엇을 해도 합격 = 무의미)
 *   합격==0(불합격>0)  → UNDETERMINED LJ-4 동시성 미확정 (표본이 합격을 못 찾음)
 *   관측==0            → FAIL  LJ-1 존재성 (판정이 만들어지지 않음)
 */
export function classify({ passes, fails }) {
  const observed = passes + fails;
  if (observed === 0) {
    /* 🔴 **FAIL 이 아니라 ERROR 다.** 표본 전체에서 판정이 한 번도 만들어지지 않았다면
     *    「죽은 판정을 찾았다」가 아니라 **아무것도 재지 못했다**는 뜻이다.
     *    판정이 선언조차 안 된 경우(진짜 존재성 위반)는 `staticProblems()` 의 LJ-1 이
     *    표본을 돌리기 전에 이미 잡는다 — 그쪽이 FAIL, 이쪽이 ERROR 다. */
    return {
      verdict: VERDICT.ERROR, code: 'LJ-E', rule: '계측 실패',
      why: '표본 전체에서 판정이 한 번도 만들어지지 않았습니다(compute()/evaluate() 예외 등) — 게이트가 아무것도 재지 못했습니다.',
    };
  }
  if (fails === 0) {
    return { verdict: VERDICT.FAIL, code: 'LJ-3', rule: '반증성', why: `표본 ${observed}건이 **전부 합격**입니다 — 불합격이 나오는 조합이 없으면 판정이 아무것도 가르지 않습니다.` };
  }
  if (passes === 0) {
    /* 🔴 L2(랩 전체 판정)는 이 문구를 **덮어쓴다** — `analyzeLab` 의 표적 재표본이 ①②③ 을 갈라
     *    구체적 진단을 박아 넣는다. 여기 남는 것은 **L1(출력 단위 판정)** 뿐이다.
     *    L1 에 표적 재표본을 돌리지 않는 이유: 그 단계의 목적함수는 「judge 출력 **전부**를 동시에
     *    합격시키는 조합」을 겨냥한다. 단위 하나만 보는 탐색은 다른 단위를 망가뜨리며 올라가므로
     *    L2 진단과 결론이 어긋난다. 🔴 **정직한 한계다** — 같은 랩의 L2 항목을 함께 보라. */
    return {
      verdict: VERDICT.UNDETERMINED, code: 'LJ-4', rule: '동시성',
      why: `표본 ${observed}건이 **전부 불합격**입니다 — 도달 불가인지 표본이 못 찾은 것인지 이 게이트는 구분하지 못합니다. `
        + `PASS 로 집계하지 않습니다. `
        + `🔴 출력 단위(L1)에는 표적 재표본을 돌리지 않습니다(그 단계는 랩 전체 판정의 **동시** 합격을 겨냥합니다) — `
        + `같은 랩의 L2 항목에 붙은 ①②③ 진단을 함께 보십시오.`,
    };
  }
  return { verdict: VERDICT.PASS, code: null, rule: '동시성', why: null };
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ④ 랩 1개 분석
 * ────────────────────────────────────────────────────────────────────────────── */

function newStat(id, level, label) {
  return {
    id, level, label,
    passes: 0, fails: 0,
    outOfDomain: 0,
    valueMin: Number.POSITIVE_INFINITY,
    valueMax: Number.NEGATIVE_INFINITY,
    firstPass: null, firstFail: null,
    minPassSteps: null,
    /* 🔴 런타임 정의역 추적 — LJ-2 가 `evaluate()` 와 **같은 경로**로 정의역을 얻게 하는 자리.
     *    `evaluate()` 는 Quantity 를 받으면 물리층의 `outOfRange`/`validRange` 를 정본으로 쓴다.
     *    종전 LJ-2 는 명세의 `o.domain` 만 봐서 **제품이 76개를 닫는데 게이트는 1개만 보고 있었다.** */
    vrSeen: 0,          // validRange 를 읽은 표본 수
    vrConst: null,      // 전 표본 동일하면 그 [lo,hi], 하나라도 다르면 false
    vrDisjointAll: true, // 관측된 validRange 가 **전부** 합격창과 서로소인가
    /* 🔴 **모수에 못 들어온 이유를 이름과 함께 남긴다** (2026-08-22).
     *    종전에는 「69/76」이라는 **숫자만** 찍혔다. 어느 7개가 왜 빠졌는지 알아내려고
     *    사람이 임시 스크립트를 따로 짜야 했고, 그 스크립트가 `JSON.stringify` 로 찍는 바람에
     *    `-Infinity` 를 `null` 로 읽어 **원인을 반대로 진단했다.**
     *    계측기가 「못 쟀다」고 말할 때는 **무엇을 왜 못 쟀는지 같이 말해야 한다.** */
    vrReject: new Map(), // 배제 사유 표기 → 관측 횟수
  };
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ④-a 🔴 표적 재표본 — `UNDETERMINED` 를 **①②③ 으로 가르는** 단계 (2026-08-22 신설)
 *
 * ── 왜 필요했나 ───────────────────────────────────────────────────────────────
 *   종전 게이트는 「표본 전부 불합격」을 만나면 ①도달불가 · ②격자엇갈림 · ③표본부족 을
 *   **구분하지 못한 채** UNDETERMINED 로 남겼다. 그러면 다음 사람이 처음부터 다시 잰다.
 *   실제로 `sweep-constants.mjs` 에는 「3,000 → 3,000,000 으로 늘려도 안 바뀐다」는
 *   관측만 적혀 있고 **원인 진단이 없어서**, 그 수치가 「도달 불가인 모양이다」로 읽혔다.
 *
 * ── 🔴 실측이 말해 준 것 (2026-08-22) ─────────────────────────────────────────
 *   합격 영역이 **없는 것이 아니라 극히 좁았다.**
 *     · `eds/lab-applied`   격자 전수 10,744,000 점 중 합격 **833 점** = 7.75e-5 (1/12,898)
 *     · `metal/lab-advanced` 균등 200만 점 추정 부피비 **1.91e-4**
 *   3,000 점 균등 표본의 기대 합격은 각각 0.23건 · 0.5건이다. **못 찾는 것이 정상이다.**
 *   더구나 `eds` 는 표본을 20만으로 늘려도 현행 LCG 로는 0건이었다(같은 20만에서
 *   mulberry32 는 23건, Math.random 은 12건) — 4차원 격자에서 LCG 점이 초평면에 몰려
 *   **부피비 7.75e-5 영역을 계통적으로 비껴간다.** 표본 수가 아니라 표본기의 문제였다.
 *
 * ── 그래서 무엇을 하는가 ──────────────────────────────────────────────────────
 *   균등 표본을 더 뿌리지 않는다(그것이 안 되는 것을 위에서 쟀다). 대신 **좁은 표적을 겨눈다** —
 *   「미충족 판정 개수」를 1순위, 「합격창까지의 정규화 잔여거리」를 2순위로 하는 목적함수를
 *   두고 **step 격자 위에서** 좌표하강(hill-climb)한다. 실측 추가 평가는 39회 · 10회였다.
 *
 * 🔴 **합격창·정의역·step·범위를 한 개도 바꾸지 않는다(D-041).** 이 단계가 하는 일은
 *    「합격창을 넓히는 것」이 아니라 **「이미 있는 합격창을 찾아내는 것」**뿐이다.
 * 🔴 **UNDETERMINED 후보에만 돈다.** 나머지 22칸은 한 번도 타지 않으므로 게이트가 느려지지 않는다.
 * 🔴 **결정론이다.** 시작점은 균등 스윕(고정 시드)의 상위 K개를 정렬해 고르고, 이동은 고정 오프셋이다.
 * ────────────────────────────────────────────────────────────────────────────── */

/** 표적 등반의 시작점 수 — 균등 스윕 표본을 목적함수로 정렬한 상위 K개. */
export const LIVE_JUDGMENT_FOCUS_STARTS = 200;
/** 표적 등반의 평가 상한(안전판). 실측 필요량은 39회·10회였다 — 여유를 크게 둔다. */
export const LIVE_JUDGMENT_FOCUS_MAX_EVALS = 60000;
/** 한 파라미터를 한 번에 몇 칸 움직여 보는가. 좁은 골짜기와 먼 분지를 함께 본다. */
const FOCUS_OFFSETS = Object.freeze([1, -1, 4, -4, 16, -16, 64, -64, 256, -256]);
/** 한 시작점에서 좌표하강을 몇 바퀴까지 도는가. */
const FOCUS_MAX_ROUNDS = 400;
/** 🔴 ② 판별 전용 — step 을 무시한 **연속 완화**에서 한 파라미터 범위를 몇 등분하는가. */
const FOCUS_CONTINUOUS_DIVISIONS = 10000;

/**
 * 값이 합격창에서 얼마나 벗어났는가 — **크기에 무관하게 비교되도록 정규화**한다.
 * 합격이면 0. 🔴 이 수는 **판정에 쓰이지 않는다.** 등반의 방향을 정하는 데만 쓴다.
 */
function windowShortfall(pass, value) {
  if (!pass) return 0;
  if (!Number.isFinite(value)) return 1;
  const scale = Math.max(1e-12, Math.abs(pass.min ?? 0), Math.abs(pass.max ?? 0), Math.abs(value));
  let d = 0;
  if (pass.min !== undefined && pass.min !== null && value < pass.min) d = (pass.min - value) / scale;
  if (pass.max !== undefined && pass.max !== null && value > pass.max) d = Math.max(d, (value - pass.max) / scale);
  return d;
}

/** 판정 결과 하나를 등반 목적함수로 환산한다. 1순위 = 미충족 판정 수, 2순위 = 잔여거리 합. */
function focusObjective(unitOutputs, verdict) {
  const byId = new Map(verdict.outputs.map((r) => [r.id, r]));
  let bad = 0;
  let dist = 0;
  for (const o of unitOutputs) {
    const r = byId.get(o.id);
    if (!r || r.pass !== true) bad++;
    dist += windowShortfall(o.pass, r?.value);
  }
  return { bad, dist };
}

/** 파라미터의 step 격자 — 값 ↔ 격자 첨자 변환. `sampleInputs` 와 같은 클램프 규약을 쓴다. */
function gridOf(p) {
  const n = Math.max(1, Math.round((p.max - p.min) / p.step));
  return {
    n,
    at: (k) => Math.min(p.max, Math.max(p.min, p.min + k * p.step)),
    idx: (v) => Math.round((v - p.min) / p.step),
  };
}

/**
 * 표적 등반 1회. `probe(inputs)` 는 `{ok, bad, dist, pass}` 를 돌려주는 계측기다.
 * @returns {{found:object|null, evals:number, best:{inputs:object,bad:number,dist:number}|null}}
 */
function climb(params, starts, probe, budget, move) {
  let evals = 0;
  let best = null;
  for (const s0 of starts) {
    let cur = { ...s0.inputs };
    let curS = probe(cur); evals++;
    if (curS.ok && curS.pass) return { found: cur, evals, best: { inputs: cur, bad: 0, dist: 0 } };
    if (curS.ok && (!best || curS.bad < best.bad || (curS.bad === best.bad && curS.dist < best.dist))) {
      best = { inputs: { ...cur }, bad: curS.bad, dist: curS.dist };
    }
    for (let round = 0; round < FOCUS_MAX_ROUNDS; round++) {
      let improved = false;
      for (const p of params) {
        for (const cand of move(p, cur)) {
          if (evals >= budget) return { found: null, evals, best };
          const cs = probe(cand); evals++;
          if (!cs.ok) continue;
          if (cs.pass) return { found: cand, evals, best: { inputs: cand, bad: 0, dist: 0 } };
          if (!best || cs.bad < best.bad || (cs.bad === best.bad && cs.dist < best.dist)) {
            best = { inputs: { ...cand }, bad: cs.bad, dist: cs.dist };
          }
          if (cs.bad < curS.bad || (cs.bad === curS.bad && cs.dist < curS.dist - 1e-15)) {
            cur = cand; curS = cs; improved = true;
          }
        }
      }
      if (!improved) break;
    }
    if (evals >= budget) break;
  }
  return { found: null, evals, best };
}

/**
 * 「표본 전부 불합격」인 랩 하나를 표적 탐색해 ①②③ 을 가른다.
 *
 * 🔴 **격자 단계(A)의 표본은 통계에 계상된다** — 슬라이더로 실제 만들 수 있는 입력이므로
 *    진짜 표본이다. **연속 단계(B)는 계상하지 않는다** — step 격자에 없는 값이라
 *    「학습자가 만들 수 있는 조합」이 아니다. 계상하면 게이트가 앱에 없는 입력으로 PASS 를 낸다.
 */
function focusedResample(spec, unitOutputs, observe, evaluate, starts) {
  const params = spec.params;
  if (params.length === 0) return { ran: false };
  const G = new Map(params.map((p) => [p.id, gridOf(p)]));

  /* ── 단계 A: step 격자 위 등반. 여기서 나온 표본은 **진짜 표본**이라 계상한다. ── */
  const probeGrid = (inputs) => {
    const { ok, verdict } = observe(inputs);
    if (!ok) return { ok: false };
    return { ok: true, ...focusObjective(unitOutputs, verdict), pass: verdict.pass === true };
  };
  const moveGrid = function* (p, cur) {
    const g = G.get(p.id);
    const k0 = g.idx(cur[p.id]);
    for (const d of FOCUS_OFFSETS) {
      const k = k0 + d;
      if (k < 0 || k > g.n) continue;
      yield { ...cur, [p.id]: g.at(k) };
    }
  };
  const A = climb(params, starts, probeGrid, LIVE_JUDGMENT_FOCUS_MAX_EVALS, moveGrid);
  if (A.found) {
    return { ran: true, gridEvals: A.evals, gridFound: A.found, best: A.best, continuousEvals: 0, continuousFound: null };
  }

  /* ── 단계 B: step 을 무시한 **연속 완화** 등반. ②(격자 엇갈림) 판별 전용.
   *    🔴 통계에 계상하지 않는다. 결과는 진단 문구에만 쓴다. ── */
  const probeCont = (inputs) => {
    let verdict;
    try {
      verdict = evaluate(spec, spec.compute(inputs));
    } catch {
      return { ok: false };
    }
    return { ok: true, ...focusObjective(unitOutputs, verdict), pass: verdict.pass === true };
  };
  const moveCont = function* (p, cur) {
    const span = (p.max - p.min) / FOCUS_CONTINUOUS_DIVISIONS;
    for (const d of FOCUS_OFFSETS) {
      const v = Math.min(p.max, Math.max(p.min, cur[p.id] + d * span));
      if (v === cur[p.id]) continue;
      yield { ...cur, [p.id]: v };
    }
  };
  const B = climb(params, starts, probeCont, LIVE_JUDGMENT_FOCUS_MAX_EVALS, moveCont);

  return {
    ran: true,
    gridEvals: A.evals, gridFound: null, best: A.best,
    continuousEvals: B.evals, continuousFound: B.found,
  };
}

/**
 * 랩 하나를 스윕해 L1·L2 판정 단위의 살아 있음을 잰다.
 *
 * 🔴 `evaluate` 는 **화면이 쓰는 그 함수**(`src/models/labs/spec.ts`)를 그대로 받는다.
 *    게이트가 판정 규칙을 베껴 두면 게이트는 **자기가 상상한 앱**을 검사하게 된다.
 * 🔴 `compute()` 가 돌려준 **`Quantity` 를 벗기지 않고 그대로** 넘긴다 —
 *    `LabRunner.tsx:50` 이 그렇게 부른다. 실값으로 벗기면 물리층의 `outOfRange` 가
 *    판정에 닿기 전에 사라져 **앱과 다른 것**을 재게 된다.
 */
export function analyzeLab(spec, evaluate, opts = {}) {
  const labKey = `${spec.processId}/${spec.stage}`;
  const statics = staticProblems(spec);

  const unitOutputs = spec.outputs.filter(isJudgmentUnit);
  /** 스윕 루프에서 출력 id → 명세를 O(1) 로 되찾기 위한 색인. */
  const specOutById = new Map(unitOutputs.map((o) => [o.id, o]));
  const l1 = new Map(unitOutputs.map((o) => [o.id, newStat(`${labKey} / ${o.id}`, 'L1', o.ko ?? o.id)]));
  const l2 = newStat(labKey, 'L2', spec.titleKo ?? labKey);

  let sampleCount = 0;
  let computeThrows = 0;
  let evaluateThrows = 0;

  /* 🔴 표적 재표본의 **시작점 후보** — 균등 스윕에서 목적함수가 좋았던 상위 K개를 모은다.
   *    상한을 둔 삽입 정렬이라 메모리·시간이 표본 수에 비례해 늘지 않는다.
   *    UNDETERMINED 가 안 나면 통째로 버려진다(그때는 아무 비용도 아니다). */
  const startPool = [];
  const pushStart = (inputs, bad, dist) => {
    if (startPool.length >= LIVE_JUDGMENT_FOCUS_STARTS) {
      const worst = startPool[startPool.length - 1];
      if (bad > worst.bad || (bad === worst.bad && dist >= worst.dist)) return;
      startPool.pop();
    }
    let i = startPool.length;
    while (i > 0 && (startPool[i - 1].bad > bad || (startPool[i - 1].bad === bad && startPool[i - 1].dist > dist))) i--;
    startPool.splice(i, 0, { inputs: { ...inputs }, bad, dist });
  };

  /**
   * 입력 조합 하나를 **앱과 같은 경로**로 재고 통계에 반영한다.
   *
   * 🔴 루프 본문에서 함수로 뺀 이유는 하나뿐이다 — 아래 「표적 재표본」이 **같은 계측**을
   *    써야 하기 때문이다. 계측을 두 벌 적으면 한쪽만 고쳐지고 숫자가 갈린다(집안 병).
   * @returns {{ok:boolean, verdict:any}} `ok:false` 면 예외로 관측이 성립하지 않은 것.
   */
  function observe(inputs) {
    sampleCount++;
    let qs;
    try {
      qs = spec.compute(inputs);
    } catch {
      computeThrows++;
      return { ok: false, verdict: null };
    }
    let verdict;
    try {
      // 🔴 Quantity 를 그대로 넘긴다(앱 경로와 동일).
      verdict = evaluate(spec, qs);
    } catch {
      evaluateThrows++;
      return { ok: false, verdict: null };
    }

    for (const row of verdict.outputs) {
      const st = l1.get(row.id);
      if (!st || row.pass === null || row.pass === undefined) continue;
      if (Number.isFinite(row.value)) {
        if (row.value < st.valueMin) st.valueMin = row.value;
        if (row.value > st.valueMax) st.valueMax = row.value;
      }
      if (row.outOfDomain) st.outOfDomain++;

      /* 🔴 **런타임 정의역 수집** — `evaluate()` 가 정본으로 삼는 바로 그 값이다.
       *    이미 손에 있는 `qs[row.id]` 를 안 보고 있었을 뿐, 새 데이터가 필요 없다. */
      const vr = qs[row.id]?.validRange;
      /* 🔴 **유한성으로 거르지 않는다** (2026-08-22). 종전 `Number.isFinite(vr[0]) && …` 는
       *    편측 정의역 7건(전부 eds — `[-∞, 25.5]` · `[0, +∞]` 꼴)을 「못 읽은 것」으로 세어
       *    LJ-2 실질 모수를 69/76 에 묶어 두고 있었다. `null` 이 들어 있던 것이 아니라
       *    관측 도구의 `JSON.stringify` 가 `-Infinity` 를 `null` 로 찍었을 뿐이다.
       *    `isUsableDomain` 의 수식 근거는 `windowDisjointFrom` 머리주석에 있다. */
      if (!(Array.isArray(vr) && vr.length === 2 && isUsableDomain(vr[0], vr[1]))) {
        const why = !Array.isArray(vr)
          ? `물리층이 validRange 를 주지 않음 (${vr === undefined ? 'undefined' : typeof vr})`
          : vr.length !== 2
            ? `validRange 의 길이가 2 가 아님 (${vr.length})`
            : `쓸 수 없는 정의역 [${numText(vr[0])}, ${numText(vr[1])}]`;
        st.vrReject.set(why, (st.vrReject.get(why) ?? 0) + 1);
      }
      if (Array.isArray(vr) && vr.length === 2 && isUsableDomain(vr[0], vr[1])) {
        st.vrSeen++;
        if (st.vrConst === null) st.vrConst = [vr[0], vr[1]];
        else if (st.vrConst !== false && (st.vrConst[0] !== vr[0] || st.vrConst[1] !== vr[1])) {
          st.vrConst = false;      // 입력에 따라 변하는 정의역 — 구조적 단정 불가
        }
        if (!windowDisjointFrom(specOutById.get(row.id)?.pass, vr[0], vr[1])) st.vrDisjointAll = false;
      }
      if (row.pass === true) {
        st.passes++;
        if (!st.firstPass) st.firstPass = { inputs: { ...inputs }, value: row.value };
        const d = stepDistance(spec.params, inputs);
        if (st.minPassSteps === null || d < st.minPassSteps) st.minPassSteps = d;
      } else {
        st.fails++;
        if (!st.firstFail) st.firstFail = { inputs: { ...inputs }, value: row.value };
      }
    }

    if (verdict.pass === true) {
      l2.passes++;
      if (!l2.firstPass) l2.firstPass = { inputs: { ...inputs }, value: null };
      const d = stepDistance(spec.params, inputs);
      if (l2.minPassSteps === null || d < l2.minPassSteps) l2.minPassSteps = d;
    } else {
      l2.fails++;
      if (!l2.firstFail) l2.firstFail = { inputs: { ...inputs }, value: null };
    }
    if (unitOutputs.length > 0) {
      const { bad, dist } = focusObjective(unitOutputs, verdict);
      pushStart(inputs, bad, dist);
    }
    return { ok: true, verdict };
  }

  for (const { inputs } of sampleInputs(spec.params, opts)) observe(inputs);

  /** 균등 스윕만으로 얻은 수 — 표적 재표본이 붙기 **전** 값을 남겨 둔다(보고용). */
  const baseSamples = sampleCount;
  const baseObserved = l2.passes + l2.fails;

  /* ══════════ 🔴 표적 재표본 — `UNDETERMINED` 후보에만, 그때만 돈다 ══════════
   *   나머지 칸은 이 아래로 한 번도 내려오지 않는다. 그래서 게이트 전체가 느려지지 않는다. */
  const focus = (l2.passes === 0 && l2.fails > 0 && unitOutputs.length > 0)
    ? focusedResample(spec, unitOutputs, observe, evaluate, startPool)
    : null;

  /* ══════════ 🔴 LJ-2 **런타임 경로** — `evaluate()` 와 같은 곳에서 정의역을 얻는다 ══════════
   *
   * ── 왜 필요했나 (2026-08-22 팀장 판정) ─────────────────────────────────────────
   *   `evaluate()` 는 정의역을 두 곳에서 본다:
   *     ① `Quantity` 를 받으면 **물리층의 `outOfRange`/`validRange` 가 정본**
   *     ② 실값만 받으면 명세의 `o.domain`
   *   그런데 종전 LJ-2 는 **② 만** 봤다. 명세에 `domain` 을 선언한 판정 출력은 76개 중 **단 1개**라
   *   **제품은 76개를 닫고 있는데 게이트는 1개만 보고 있었다.**
   *
   * ── 🔴 해법의 방향 ────────────────────────────────────────────────────────────
   *   75개 명세에 `domain` 을 손으로 적는 것이 아니다. 그건 `validRange` 를 75곳에 복제하는 것이고,
   *   `LabOutput.domain` 주석이 **명시적으로 금지**한 행위다(「숫자를 손으로 두 번 적으면 갈라지고,
   *   갈라지는 순간 이 필드는 거짓말을 고정하는 장치가 된다」). 상수를 한 개도 복제하지 않고
   *   **게이트가 이미 손에 쥔 `compute()` 결과를 보게** 하는 것이 맞다.
   *
   * ── 🔴 무엇을 「구조적」으로 인정하는가 ────────────────────────────────────────
   *   `validRange` 가 **전 표본에서 동일**할 때만 구조적 단정을 한다. 그때 그 구간은 입력과 무관한
   *   상수이므로 「합격창 ∩ 정의역 = ∅」은 표본이 아니라 **구조**의 진술이 된다.
   *   `validRange` 가 입력에 따라 **변하면**(패키징의 여유 출력 등) 단정하지 않는다 —
   *   관측 못 한 입력이 구간을 열 수 있다. 그 경우는 표본 규칙(LJ-4)에 맡기고 힌트만 남긴다.
   */
  for (const st of l1.values()) {
    if (st.vrSeen === 0) continue;                       // 물리층 정의역을 못 얻은 단위
    if (st.vrConst === null || st.vrConst === false) continue; // 못 읽었거나 입력에 따라 변한다
    if (!st.vrDisjointAll) continue;                     // 합격 가능한 구간이 한 번이라도 있었다
    const o = specOutById.get(st.id.split(' / ')[1]);
    if (!o) continue;
    statics.push({
      code: 'LJ-2', rule: '존재성(구조적 도달불가)', unit: st.id, level: 'L1', source: 'runtime',
      message:
        `합격창 ${JSON.stringify(o.pass)} 가 **물리층 정의역 [${st.vrConst[0]}, ${st.vrConst[1]}] 와 서로소**입니다 `
        + `— 성립 가능한 값 중 합격이 하나도 없습니다. `
        + `이 정의역은 표본 ${st.vrSeen}건 전부에서 동일했으므로(입력에 따라 변하지 않음) `
        + `표본이 아니라 **구조로** 도달 불가입니다. `
        + `🔴 출처는 명세의 domain 이 아니라 compute() 가 돌려준 Quantity.validRange 입니다 — `
        + `evaluate() 가 정본으로 삼는 바로 그 값입니다.`,
    });
  }

  /** LJ-2 런타임 경로가 **실제로 볼 수 있었던** 판정 단위 수(= 이 규칙의 실질 모수). */
  const lj2RuntimeScope = [...l1.values()].filter((st) => st.vrSeen > 0).length;
  /** 그중 정의역이 입력에 따라 변해 구조적 단정을 못 한 수(수치 보고용). */
  const lj2VaryingScope = [...l1.values()].filter((st) => st.vrConst === false).length;
  /** 🔴 모수에 **못 들어온** 단위를 이유와 함께 이름으로 남긴다. 숫자만 찍으면 아무도 못 찾는다. */
  const lj2OutOfScope = [...l1.values()]
    .filter((st) => st.vrSeen === 0)
    .map((st) => ({
      unit: st.id,
      reasons: [...st.vrReject.entries()].map(([why, n]) => `${why} (표본 ${n}건)`),
    }));

  /** 정적 FAIL 이 이미 붙은 단위는 표본 분류로 덮어쓰지 않는다(구조가 표본보다 강하다). */
  const staticByUnit = new Map();
  for (const p of statics) {
    if (!staticByUnit.has(p.unit)) staticByUnit.set(p.unit, p);
  }

  /* 🔴 LJ-2 는 **L2 로 전파된다.** `LabVerdict.pass` 는 judge 출력이 **전부** 합격일 때만 true 이므로,
   *    판정 출력 하나가 구조적으로 도달 불가이면 **랩 전체 판정도 구조적으로 도달 불가**다.
   *    이것은 추정이 아니라 `evaluate()` 의 정의에서 따라 나오는 결론이라 표본과 무관하다.
   *    전파하지 않으면 L2 가 `UNDETERMINED`(표본 못 찾음)로 보여 **원인이 흐려진다**
   *    — 2026-08-21 픽스처 `allFailStructural` 실측에서 실제로 그렇게 보였다. */
  if (!staticByUnit.has(labKey)) {
    const culprit = statics.find((p) => p.code === 'LJ-2' && p.level === 'L1');
    if (culprit) {
      staticByUnit.set(labKey, {
        code: 'LJ-2',
        rule: '존재성(구조적 도달불가)',
        unit: labKey,
        level: 'L2',
        message:
          `판정 출력 ${culprit.unit.split(' / ')[1]} 가 구조적으로 도달 불가라 **랩 전체 판정도 도달 불가**입니다 `
          + `(evaluate() 는 judge 출력이 전부 합격일 때만 pass:true 를 줍니다). 원인: ${culprit.message}`,
      });
    }
  }

  const decorate = (st) => {
    const s = staticByUnit.get(st.id);
    const cls = s
      ? { verdict: VERDICT.FAIL, code: s.code, rule: s.rule, why: s.message }
      : classify(st);
    const observed = st.passes + st.fails;
    return {
      ...st,
      ...cls,
      observed,
      passRatio: observed > 0 ? st.passes / observed : null,
      // 🔴 수치 보고 전용 — 「상수 출력」 의심 신호. FAIL 규칙에 넣지 않는다(R-0 별도 검사 금지).
      constant: st.valueMin === st.valueMax && Number.isFinite(st.valueMin),
    };
  };

  const l2Decorated = decorate(l2);

  /* ══════ 🔴 UNDETERMINED 가 남았으면 **셋 중 하나** 로 두지 않는다 ══════
   *   CEO 지시(2026-08-22): 「못 닫으면 **왜 못 닫는지**를 게이트 출력에 박고 종료」.
   *   종전 문구는 ①②③ 을 나란히 늘어놓고 끝났다 — 다음 사람이 처음부터 다시 재게 만든다.
   *   🔴 이것은 판정을 무르게 하는 것이 **아니라 진단을 좁히는 것**이다. 종료코드 4 는 그대로다. */
  if (l2Decorated.verdict === VERDICT.UNDETERMINED && focus?.ran) {
    const bestTxt = focus.best
      ? `최선 근접 = 미충족 판정 ${focus.best.bad}개 · 잔여거리 ${focus.best.dist.toExponential(3)} `
        + `(입력 ${JSON.stringify(focus.best.inputs)})`
      : '최선 근접을 얻지 못했습니다';
    if (focus.continuousFound) {
      l2Decorated.code = 'LJ-4';
      l2Decorated.rule = '동시성(② 격자 엇갈림 후보)';
      l2Decorated.why =
        `균등 표본 ${baseObserved}건 + **표적 등반 ${focus.gridEvals}회(step 격자 위)** 가 전부 불합격입니다. `
        + `그런데 step 을 무시한 **연속 완화**에서는 합격 조합이 나옵니다: ${JSON.stringify(focus.continuousFound)} `
        + `(연속 등반 ${focus.continuousEvals}회). `
        + `🔴 ③ 표본 부족은 배제됐습니다(표적 최적화로도 격자 위에서는 못 찾았습니다). `
        + `🔴 ① 도달 불가도 아닙니다(연속값에서는 닿습니다). `
        + `→ **② 합격창이 슬라이더 step 격자와 엇갈립니다.** 학습자는 슬라이더로 이 랩을 통과할 수 없습니다. `
        + `고칠 자리는 param.step · min · max 이며 **명세 소관입니다(PLN 대조, D-041)** — 합격창을 넓히지 마십시오. `
        + `${bestTxt}.`;
    } else {
      l2Decorated.code = 'LJ-4';
      l2Decorated.rule = '동시성(① 도달 불가 후보)';
      l2Decorated.why =
        `균등 표본 ${baseObserved}건 + **표적 등반 ${focus.gridEvals}회(step 격자)** `
        + `+ **연속 완화 등반 ${focus.continuousEvals}회** 가 전부 불합격입니다. `
        + `🔴 ③ 표본 부족은 배제됐습니다 — 균등 표본이 아니라 목적함수 최적화로 찾았는데도 없습니다. `
        + `🔴 ② 격자 엇갈림도 배제됐습니다 — step 을 무시한 연속값에서도 합격이 없습니다. `
        + `→ 남은 것은 **① 도달 불가**입니다. **PLN 판정 대기(D-041).** `
        + `🔴 합격창·정의역을 넓혀서 닫지 마십시오. 그것은 판정을 없애는 것입니다. `
        + `${bestTxt}.`;
    }
  }

  return {
    labKey,
    titleKo: spec.titleKo ?? labKey,
    paramCount: spec.params.length,
    outputCount: spec.outputs.length,
    unitCount: unitOutputs.length,
    sampleCount,
    /** 🔴 표적 재표본이 붙기 **전** 균등 스윕만의 수 — 「좁은 표적」을 수치로 말하는 자리. */
    baseSamples,
    baseObserved,
    /** 표적 재표본 기록(안 돌았으면 `null`). @see focusedResample */
    focus,
    computeThrows,
    evaluateThrows,
    statics,
    /** 🔴 LJ-2 실질 모수 — 명세 `domain` 선언 수가 아니라 **런타임 정의역을 얻은 판정 단위 수**. */
    lj2RuntimeScope,
    lj2VaryingScope,
    lj2OutOfScope,
    lj2DeclaredDomain: unitOutputs.filter((o) => Array.isArray(o.domain)).length,
    l1: [...l1.values()].map(decorate),
    l2: l2Decorated,
  };
}

/** 여러 랩의 분석 결과를 합산한다. `UNDETERMINED` · `ERROR` 는 **PASS 로 세지 않는다.** */
export function summarize(records) {
  const z = () => ({ PASS: 0, FAIL: 0, UNDETERMINED: 0, ERROR: 0 });
  const lab = z();
  const out = z();
  for (const r of records) {
    lab[r.l2.verdict]++;
    for (const u of r.l1) out[u.verdict]++;
  }
  return {
    lab, out,
    labTotal: records.length,
    outTotal: records.reduce((n, r) => n + r.l1.length, 0),
    /* 🔴 LJ-2 의 **실질 모수**. 종전에는 명세 `domain` 선언 수(전체 76 중 1)가 곧 모수였다.
     *    런타임 경로가 생기면서 「물리층 정의역을 얻은 판정 단위 수」로 바뀐다. */
    lj2RuntimeScope: records.reduce((n, r) => n + r.lj2RuntimeScope, 0),
    lj2VaryingScope: records.reduce((n, r) => n + r.lj2VaryingScope, 0),
    /** 🔴 모수 밖으로 밀려난 판정 단위 전수 — **숫자가 아니라 이름으로** 보고한다. */
    lj2OutOfScope: records.flatMap((r) => r.lj2OutOfScope ?? []),
    lj2DeclaredDomain: records.reduce((n, r) => n + r.lj2DeclaredDomain, 0),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴 호출자 규율 → **검사** (2026-08-22 팀장 지시 (나))
 *
 * `evaluate()` 는 `Quantity` 를 받으면 물리층의 `outOfRange` 를 정본으로 쓰고, 실값(number)만
 * 받으면 명세의 `domain` 만 본다. 제품 호출부가 실값으로 벗겨 넘기는 순간 **판정 출력 76개 중
 * 75개의 정의역 방어가 통째로 사라진다.** 종전에는 그것이 「호출자 규율」이었다 — 지키자는 약속.
 * 약속은 검사가 아니다.
 *
 * 🔴 **부분문자열로 때우지 않는다**(집안 규율). `scripts/lib/tokens.mjs` 의 토크나이저로
 *    주석·문자열·템플릿을 걸러낸 **토큰 위에서** 호출부를 찾는다.
 *    (오늘 실례가 나왔다 — 차트 절단 6곳 중 1곳이 `slice` 가 아니라 `Math.min` 이라 grep 에 안 걸렸다.)
 * ══════════════════════════════════════════════════════════════════════════════ */

import { tokenize, lineFinder } from './tokens.mjs';

/**
 * `evaluate(...)` 호출부를 토큰 위에서 전수 열거한다.
 * @returns {Array<{line:number, args:string[]}>} 인자별 원문 텍스트(공백 정규화)
 */
export function scanEvaluateCalls(code) {
  const toks = tokenize(code);
  const lineOf = lineFinder(code);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    /* 🔴 토큰 타입은 `ident` 다. 종전에 `'name'` 으로 적어 **호출부를 0곳으로 셌다**
     *    (2026-08-22 실측으로 발견 — 게이트가 ERROR(2) 를 내 준 덕에 조용히 넘어가지 않았다).
     *    「0곳을 찾았다」와 「찾는 법을 몰랐다」는 다르다. 등기부 대조가 그 둘을 갈라 줬다. */
    if (t.type !== 'ident' || t.value !== 'evaluate') continue;
    const open = toks[i + 1];
    if (!open || open.type !== 'punct' || open.value !== '(') continue;
    // 🔴 선언(`function evaluate(`)·import 는 호출이 아니다. 직전 토큰으로 가른다.
    const prev = toks[i - 1];
    if (prev && prev.type === 'ident' && prev.value === 'function') continue;   // 정의부
    // `import { evaluate } from …` 은 다음 토큰이 '(' 가 아니라 위 검사에서 이미 걸러진다.

    // 괄호 균형을 맞춰 인자 토큰을 모은다.
    let depth = 0;
    const args = [];
    let cur = [];
    let j = i + 1;
    for (; j < toks.length; j++) {
      const x = toks[j];
      if (x.type === 'punct' && '([{'.includes(x.value)) { depth++; if (depth === 1) continue; }
      if (x.type === 'punct' && ')]}'.includes(x.value)) {
        depth--;
        if (depth === 0) { if (cur.length) args.push(cur); break; }
      }
      if (depth === 1 && x.type === 'punct' && x.value === ',') { args.push(cur); cur = []; continue; }
      cur.push(x);
    }
    out.push({
      line: lineOf(t.start),
      args: args.map((a) => a.map((x) => x.value).join('').trim()),
    });
    i = j;
  }
  return out;
}

/**
 * 🔴 **알려진 호출부 등기부.** 이 게이트의 측정 전제다 —
 *    「제품은 `Quantity` 를 넘긴다. 그래서 나도 `Quantity` 를 넘겨 잰다.」
 *
 * 여기와 실제가 어긋나면 **판정 실패가 아니라 ERROR(2)** 다. 게이트가 제품과 다른 것을
 * 재고 있다는 뜻이므로, 그 상태에서 낸 PASS/FAIL 숫자는 전부 신뢰할 수 없다.
 *
 * 🔴 정직한 한계: 이것은 **변경 감지기**이지 정당성 판정기가 아니다. 두 번째 인자가 실제로
 *    `Quantity` 를 담는지는 이름만으로 알 수 없다 — 그래서 **런타임 발산 측정**(아래
 *    `measureStripDivergence`)을 함께 돌려 「이 선택이 실제로 판정을 가르는가」를 수치로 낸다.
 *    호출부가 새로 생기거나 인자가 바뀌면 사람이 확인하라는 것이 이 등기부의 역할이다.
 */
export const EXPECTED_EVALUATE_CALLERS = Object.freeze([
  Object.freeze({ file: 'src/ui/sections/LabRunner.tsx', arg2: 'computed.q' }),
  /* 🔴 2026-08-24 신설 — **합격 구간 스윕**(`src/models/labs/passRange.ts`, CEO 지시
     「합격을 위한 가이드라인을 최소/최대로 구분하여 제공」). 격자점마다 `spec.compute()` 를
     실제로 다시 부르고 그 결과로 「이 손잡이의 합격 구간」을 만든다.

     🔴 **이 게이트의 측정 전제를 그대로 지킨다** — 넘기는 것은 `spec.compute()` 가 돌려준
        `Quantity` 맵 그대로다(실값으로 벗기지 않는다). 벗기면 물리층의 `outOfRange` 가
        판정에 닿기 전에 사라져, **성립할 수 없는 조건이 「합격 구간」으로 화면에 그려진다** —
        2026-08-21 σ_D = −0.1 mm 사고와 같은 구멍이 학습 안내 쪽에 생기는 것이다.
     🔴 등기부에 올리는 것은 「확인했다」는 서명이지 면제가 아니다. 인자 이름이 바뀌면
        여기도 함께 바뀌어야 하고, 그때 사람이 다시 확인하게 된다. */
  Object.freeze({ file: 'src/models/labs/passRange.ts', arg2: 'q' }),
  /* 🔴 2026-08-24 3차 신설 — **손잡이 방향 안내**(`paramNudgeDirection`, 스레드 재개 지점 ②
     앞 절반). 같은 파일에 `evaluate(spec, q)` 호출부가 **하나 더** 생겼다 — `failDistanceAt()`
     이 손잡이를 인접 격자점으로 옮긴 뒤 그 지점의 판정을 얻는 자리다. 등기부는 (file, arg2)
     **다중집합**으로 대조하므로, 같은 파일·같은 인자 이름이라도 실제 호출부 개수만큼 항목을
     늘려야 한다 — 하나만 두면 게이트가 「호출부가 등기부와 다르다」로 ERROR(2) 를 낸다
     (2026-08-24 실측 — 이 항목을 추가하기 전까지 정확히 이 ERROR 가 났다).
     🔴 이 호출도 위와 같은 전제를 지킨다 — `spec.compute()` 가 돌려준 `Quantity` 맵을
        벗기지 않고 그대로 넘긴다. */
  Object.freeze({ file: 'src/models/labs/passRange.ts', arg2: 'q' }),
]);

/**
 * 🔴 **런타임 발산 측정** — `Quantity` 를 그대로 넘겼을 때와 실값으로 벗겨 넘겼을 때
 *    판정이 몇 건이나 갈리는가. 갈리는 건수가 곧 **호출자의 선택이 지는 무게**다.
 *    (`LabRunner.tsx` 주석은 「차이 0줄」을 기록하고 있다 — 그 주장을 여기서 매번 다시 잰다.)
 */
export function measureStripDivergence(spec, evaluate, opts = {}) {
  let compared = 0; let diffOutputs = 0; let diffLabs = 0; let firstDiff = null;
  for (const { inputs } of sampleInputs(spec.params, opts)) {
    let qs;
    try { qs = spec.compute(inputs); } catch { continue; }
    const stripped = Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, q?.value]));
    let a; let b;
    try { a = evaluate(spec, qs); b = evaluate(spec, stripped); } catch { continue; }
    compared++;
    if (a.pass !== b.pass) diffLabs++;
    for (let k = 0; k < a.outputs.length; k++) {
      if (a.outputs[k].pass !== b.outputs[k].pass) {
        diffOutputs++;
        if (!firstDiff) {
          firstDiff = {
            id: a.outputs[k].id,
            quantityPath: a.outputs[k].pass,
            numberPath: b.outputs[k].pass,
            value: a.outputs[k].value,
            inputs: { ...inputs },
          };
        }
      }
    }
  }
  return { compared, diffOutputs, diffLabs, firstDiff };
}
