/**
 * 「살아 있는 판정」 게이트 **주입 픽스처**.
 *
 * 🔴 왜 있는가: W6 게이트는 신설 이래 픽스처가 **0개**였다. 즉 「게이트가 실제로 잡는가」를
 *    아무도 증명하지 못했다. 이 게이트는 그 일을 반복하지 않는다.
 *
 * 🔴 무엇을 바꿔치기하는가 — **명세(데이터)뿐이다.**
 *    판정 함수 `evaluate()` 는 `src/models/labs/spec.ts` 의 **진짜 그것**을 그대로 쓰고,
 *    판정 규칙은 `scripts/lib/live-judgment.mjs` 의 **진짜 그것**을 그대로 쓴다.
 *    그래야 픽스처가 통과했을 때 「진짜 경로가 잡는다」고 말할 수 있다.
 *
 * 🔴 `src/**` 를 건드리지 않는다 — 2026-08-21 현재 다른 담당이 동시에 `src/` 를 편집 중이다.
 *
 * 사용: `node scripts/check-live-judgment.mjs --fixture=<이름>`
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ══════════ 🔴 경계 판정은 **제품 함수를 그대로 가져다 쓴다** (2026-08-22 전환) ══════════
 *
 * ── 무엇이 잘못돼 있었나 ──────────────────────────────────────────────────────
 *   이 자리에 제품 판정식의 **사본**이 있었다:
 *       outOfRange: !Number.isFinite(value) || value < validRange[0] || value > validRange[1]
 *   그런데 제품(`src/models/contract.ts`)은 그 뒤 **ULP 상대 여유**를 도입했다
 *   (`isOutOfRange` · `boundaryTolerance` · `BOUNDARY_EPSILON_MULTIPLE = 4`).
 *   사본은 따라가지 않았다. **두 자가 갈라졌다.**
 *
 *   실제로 갈리는 입력이 있었다(실측):
 *       isOutOfRange(220.00000000000003, 0, 220, 'tolerant')  제품 = false(봐준다)
 *       옛 사본 `value > hi`                                   = true(이탈)
 *   즉 픽스처는 제품이 **합격시키는 값을 불합격**으로 보고 있었다.
 *   🔴 **픽스처가 제품과 다른 규칙으로 판정하면 그 픽스처의 통과·실패는 무의미하다.**
 *      2026-08-21 에는 픽스처가 등급 원장을 **오염**시켰고, 이번엔 픽스처가 **다른 자**를 들었다.
 *      같은 병(「정본이 둘」)의 다른 자리다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 **같은 자리가 같은 날 두 번째로 갈렸다** — import 만으로는 절반만 풀린다
 * ══════════════════════════════════════════════════════════════════════════════
 *   오전에 사본을 없애고 제품 함수를 `import` 했다. **값의 동기화는 그것으로 풀렸다.**
 *   그런데 그날 오후 ULP 담당이 `isOutOfRange` 에 `strictness` 모드를 붙이면서
 *   **기본값을 `'exact'`** 로 두었고(안전한 쪽 — 실수로 엄격해지면 화면에 뜨지만
 *   실수로 여유를 얻으면 조용히 틀린 물리가 된다), 제품 `quantity()` 는 `'tolerant'` 를
 *   **명시**한다. 이 픽스처는 그 명시를 안 해서 **제품보다 엄격해졌다.**
 *
 *   🔴 **같은 함수를 import 해도 인자를 다르게 주면 다른 자가 된다.**
 *      `import` 가 푼 것은 「값의 동기화」이고, 남은 것은 **「호출 방식의 동기화」**였다.
 *
 *   그래서 모드를 **손으로 적지 않는다.** 아래 `OUTPUT_STRICTNESS` 가 `contract.ts` 의
 *   `quantity()` 본문을 **AST 로 읽어** 제품이 실제로 넘기는 모드를 그대로 가져온다.
 *   제품이 모드를 바꾸면 이 픽스처도 **자동으로 따라간다.** 못 읽으면 **던진다.**
 *
 * ── 왜 「동기화 검사」가 아니라 「사본 제거」인가 ────────────────────────────────
 *   동기화 검사를 걸면 **정본이 둘인 상태를 그대로 두고 감시만** 얹는 것이다. 갈라진 뒤에야
 *   알려 준다. 사본을 없애면 **애초에 갈라질 수 없다.** 그래서 1순위 지시대로 import 로 갔다.
 *   → 사본이 사라졌으므로 **동기화 검사는 만들지 않았다.** 지킬 두 번째 자가 없다.
 *
 * ── 왜 `await import()` 가 아니라 vite SSR 인가 ───────────────────────────────
 *   `contract.ts` 는 TypeScript 이고, Node 24 의 타입 스트리핑으로는 못 읽는다:
 *       "TypeScript parameter property is not supported in strip-only mode"
 *       (`OutOfLimitError` 생성자가 `readonly parameter: string` 형태를 쓴다)
 *   그래서 `check-live-judgment` 이 이미 쓰는 것과 **같은 방식**(vite SSR)으로 적재한다.
 *   비용은 vite 기동 1회(실측 ~0.4 s)이고, `--fixture` 모드에서만 치른다.
 *
 * 🔴 적재에 실패하면 **던진다.** 옛 식으로 조용히 되돌아가지 않는다 —
 *    그 되돌아감이 바로 이 파일이 방금 고친 결함이다. 계측기 고장은 크게 깨져야 한다.
 * 🔴 `src/models/contract.ts` 는 **읽기 전용**이다(ULP 담당 소관). 여기서는 부르기만 한다.
 */
const APP = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const isOutOfRange = await (async () => {
  let server;
  try {
    const { createServer } = await import('vite');
    server = await createServer({
      root: APP,
      configFile: join(APP, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'error',
    });
    const mod = await server.ssrLoadModule('/src/models/contract.ts');
    if (typeof mod.isOutOfRange !== 'function') {
      throw new Error('contract.ts 가 isOutOfRange 를 export 하지 않는다');
    }
    return mod.isOutOfRange;
  } catch (e) {
    throw new Error(
      '🔴 픽스처가 제품의 경계 판정 함수(src/models/contract.ts → isOutOfRange)를 적재하지 못했습니다: '
      + `${e.message}\n`
      + '   🔴 여기서 옛 비교식으로 되돌아가지 않습니다 — 픽스처가 제품과 다른 자를 들면\n'
      + '      그 픽스처의 통과·실패가 무의미해집니다(2026-08-22 규명). 계측기 고장으로 취급하세요.',
    );
  } finally {
    if (server) await server.close();
  }
})();

/* ══════════ 🔴 제품이 **어떤 모드로** 부르는지까지 제품에서 읽어 온다 ══════════
 *
 * `isOutOfRange(value, lo, hi, strictness)` 의 `strictness` 기본값은 `'exact'` 다.
 * 그런데 이 픽스처가 흉내 내는 것은 **`quantity()` 의 출력값 비교**이고, 거기서 제품은
 * `'tolerant'` 를 명시한다. 기본값에 맡기면 **픽스처가 제품보다 엄격해진다**(2026-08-22 실측).
 *
 * 🔴 그래서 `'tolerant'` 를 여기 적지 않는다 — 적으면 그것이 **세 번째 사본**이 된다.
 *    `contract.ts` 의 `quantity()` 본문에서 `isOutOfRange(...)` 호출을 AST 로 찾아
 *    **네 번째 인자를 그대로 읽는다.** 제품이 모드를 바꾸면 여기도 같이 바뀐다.
 *
 * ⚠️ **정직한 한계:** 이것은 「제품이 그 자리에서 그 함수를 그렇게 부른다」는 **구조에 기댄다.**
 *    `quantity()` 가 크게 리팩터링되면 못 찾을 수 있다. 그때는 **던진다** — 조용히
 *    기본값으로 떨어지지 않는다. 시끄럽게 깨지는 쪽이 조용히 갈라지는 쪽보다 낫다.
 */
const OUTPUT_STRICTNESS = (() => {
  const ts = createRequire(import.meta.url)('typescript');
  const file = join(APP, 'src', 'models', 'contract.ts');
  const sf = ts.createSourceFile('contract.ts', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lit = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  let mode = null;
  (function walk(n) {
    if (mode === null && ts.isFunctionDeclaration(n) && n.name && n.name.text === 'quantity') {
      (function dive(x) {
        if (mode !== null) return;
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === 'isOutOfRange') {
          mode = lit(x.arguments[3]);
          return;
        }
        x.forEachChild(dive);
      })(n);
    }
    n.forEachChild(walk);
  })(sf);
  if (mode !== 'exact' && mode !== 'tolerant') {
    throw new Error(
      '🔴 픽스처가 제품 `quantity()` 의 경계 판정 **모드**를 읽지 못했습니다'
      + ` (읽은 값: ${JSON.stringify(mode)}).\n`
      + '   src/models/contract.ts 의 quantity() 안에서 isOutOfRange(…, <모드>) 호출을 찾지 못했습니다.\n'
      + '   🔴 기본값으로 떨어지지 않습니다 — 기본값 \'exact\' 는 제품(\'tolerant\')과 달라\n'
      + '      픽스처가 조용히 제품보다 엄격해집니다(2026-08-22 실측). 계측기 고장으로 취급하세요.',
    );
  }
  return mode;
})();

/** `Quantity` 흉내. `evaluate()` 가 실제로 보는 필드는 `value` 와 `outOfRange` 뿐이다.
 *  🔴 `outOfRange` 는 **제품 함수**가 정한다. 여기에 비교식을 다시 적지 마라. */
const q = (value, validRange = [-1e9, 1e9]) => ({
  modelId: 'fixture.live-judgment',
  value,
  unit: '-',
  grade: '경향모델',
  declaredGrade: '경향모델',
  kind: 'synthetic',
  l2Pending: false,
  basis: '픽스처 전용 합성값',
  validRange,
  outOfRange: isOutOfRange(value, validRange[0], validRange[1], OUTPUT_STRICTNESS),
  assumptions: [],
});

/** x ∈ [0, 10], step 1, 기본값 0. 격자점 11개 · 모서리 2개. */
const X = {
  id: 'x', ko: '입력 x', en: 'input x', unit: '-',
  min: 0, max: 10, step: 1, initial: 0,
  basis: '픽스처 전용 — 문헌 근거 없음',
};

const base = (stage, titleKo, outputs, compute) => ({
  processId: 'fixture',
  stage,
  objectiveId: 'fixture-objective',
  titleKo,
  titleEn: titleKo,
  params: [X],
  outputs,
  compute,
  feedback: [],
  tradeoffs: [],
});

/* ══════════ ⓐ 정상 — 살아 있는 판정 ══════════
 * y = x, 합격창 [4, 6]. 격자 11점 중 3점 합격 · 8점 불합격.
 * 기대: L1 PASS · L2 PASS · 게이트 종료코드 0 */
export const alive = [
  base('lab-basic', '픽스처 ⓐ 살아 있는 판정', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 4, max: 6 }, digits: 2 },
  ], (i) => ({ y: q(i.x) })),
];

/* ══════════ ⓑ 전부 합격 — 반증성 위반 ══════════
 * 합격창이 정의역 전체를 덮는다. 무엇을 움직여도 합격 = 판정이 아무것도 가르지 않는다.
 * 기대: L1 FAIL(LJ-3) · L2 FAIL(LJ-3) · 게이트 종료코드 1 */
export const allPass = [
  base('lab-basic', '픽스처 ⓑ 전부 합격', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: -1000, max: 1000 }, digits: 2 },
  ], (i) => ({ y: q(i.x) })),
];

/* ══════════ ⓒ-1 전부 불합격 (표본 기준) ══════════
 * 합격창 [9.5, 9.6] 은 step 1 격자(정수)와 **엇갈려** 있어 표본이 합격을 하나도 못 찾는다.
 * 그러나 「도달 불가」임을 **정적으로 증명할 수는 없다** — 정의역 선언이 없고,
 * 합격창은 파라미터 범위 [0,10] 안에 있다.
 * 🔴 그래서 FAIL 이 아니라 `UNDETERMINED` 다. 기대: 게이트 종료코드 4 */
export const allFailSample = [
  base('lab-basic', '픽스처 ⓒ-1 전부 불합격(표본)', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 9.5, max: 9.6 }, digits: 2 },
  ], (i) => ({ y: q(i.x) })),
];

/* ══════════ ⓒ-2 전부 불합격 (구조적 도달 불가) ══════════
 * 합격창 [100, ∞) 이 **선언된 정의역 [0, 10]** 과 서로소다. 표본을 돌리지 않고도
 * 「성립 가능한 값 중 합격이 하나도 없다」가 증명된다.
 * 🔴 그래서 UNDETERMINED 가 아니라 **FAIL(LJ-2)** 이다. 기대: 게이트 종료코드 1 */
export const allFailStructural = [
  base('lab-basic', '픽스처 ⓒ-2 전부 불합격(구조적)', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 100 }, domain: [0, 10], digits: 2 },
  ], (i) => ({ y: q(i.x, [0, 10]) })),
];

/* ══════════ ⓓ 입력 부재(R-0) — 출력이 상수 ══════════
 * compute 가 입력을 **읽지 않는다.** 출력이 항상 5 이고 합격창 [4,6] 안이므로 전부 합격.
 * 🔴 R-0 전용 검사를 따로 만들지 않아도 **반증성(LJ-3)** 이 잡는다는 증명.
 * 기대: L1 FAIL(LJ-3) · L2 FAIL(LJ-3) · 게이트 종료코드 1 */
export const constantOutput = [
  base('lab-basic', '픽스처 ⓓ 입력 부재(상수 출력)', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 4, max: 6 }, digits: 2 },
  ], () => ({ y: q(5) })),
];

/* ══════════ ⓓ' 입력 부재 — 상수가 합격창 **밖** ══════════
 * 같은 R-0 인데 상수 7 이 합격창 [4,6] 밖이라 전부 불합격이 된다.
 * 🔴 정직한 한계 고지용 픽스처다. 표본만으로는 「도달 불가한 상수」와
 *    「좁아서 못 찾은 합격창」을 구분할 수 없으므로 `UNDETERMINED` 가 나온다.
 *    (구조적 증명이 가능한 경우에만 ⓒ-2 처럼 FAIL 이 된다.)
 * 기대: L1 UNDETERMINED · L2 UNDETERMINED · 게이트 종료코드 4 */
export const constantOutputOutside = [
  base('lab-basic', "픽스처 ⓓ' 입력 부재(상수가 창 밖)", [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 4, max: 6 }, digits: 2 },
  ], () => ({ y: q(7) })),
];

/* ══════════ ⓔ 판정 부재 — 존재성 위반 ══════════
 * 출력이 `role:'display'` 뿐이다. `evaluate()` 는 `judged.length > 0` 조건 때문에
 * 무엇을 넣어도 pass:false 를 돌려준다 — 판정이 아니라 상수 거짓이다.
 * 기대: L2 FAIL(LJ-1) · 게이트 종료코드 1 */
export const noJudge = [
  base('lab-basic', '픽스처 ⓔ 판정 부재', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'display', digits: 2 },
  ], (i) => ({ y: q(i.x) })),
];

/* ══════════ ⓕ 동시성 — L1 은 전부 살아 있는데 L2 가 죽어 있다 ══════════
 * a = x (합격 x ≥ 8) · b = 10 − x (합격 x ≤ 2). 둘 다 개별로는 합격·불합격이 다 나온다.
 * 그러나 **동시 합격이 불가능**하므로 랩 전체 판정은 영원히 불합격이다.
 * 🔴 L1 반증성만 보면 전부 통과한다 — **L2 동시성이라야 잡힌다.** 이 픽스처가 그 증명이다.
 * 기대: L1 두 개 다 PASS · L2 UNDETERMINED · 게이트 종료코드 4 */
export const mutualExclusive = [
  base('lab-basic', '픽스처 ⓕ 상충(L2 동시성)', [
    { id: 'a', ko: '출력 a', en: 'a', role: 'judge', pass: { min: 8 }, digits: 2 },
    { id: 'b', ko: '출력 b', en: 'b', role: 'judge', pass: { min: 8 }, digits: 2 },
  ], (i) => ({ a: q(i.x), b: q(10 - i.x) })),
];


/* ══════════ ⓖ 🔴 런타임 정의역 — **명세에 `domain` 이 없는데** 물리층이 닫는다 ══════════
 *
 * 이것이 2026-08-22 팀장 지시 (가) 의 증명 픽스처다.
 *
 * `y = x` 이고 합격창은 `{min: 50}` 인데, 물리층이 돌려주는 `Quantity.validRange` 는 `[0, 10]` 이다.
 * 즉 **성립 가능한 값 중 합격이 하나도 없다** — 구조적 도달 불가다.
 * 🔴 그런데 명세에는 `domain` 선언이 **없다.** 실제 24칸이 정확히 이 상태다(76개 중 75개).
 *
 *   · **종전 게이트**(명세 `o.domain` 만 봄) → LJ-2 를 못 잡고 `UNDETERMINED`(4) 로 넘긴다.
 *   · **새 게이트**(`compute()` 가 돌려준 `validRange` 를 봄) → **FAIL(1)** 로 잡는다.
 *
 * 기대: L1 FAIL(LJ-2 런타임) · L2 FAIL(전파) · 게이트 종료코드 1 */
export const runtimeDomainClosed = [
  base('lab-basic', 'ⓖ 런타임 정의역(명세 domain 없음)', [
    // 🔴 domain 선언이 **없다** — 일부러 없다. 그것이 이 픽스처의 요점이다.
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 50 }, digits: 2 },
  ], (i) => ({ y: q(i.x, [0, 10]) })),
];

/* ══════════ ⓗ 🔴 정의역이 **입력에 따라 변하면** 구조적 단정을 하지 않는다 ══════════
 *
 * ⓖ 와 같은 모양인데 `validRange` 의 상한이 입력에 따라 움직인다(`[0, x*20]`).
 * x = 10 이면 `[0, 200]` 이라 합격창 `{min: 50}` 과 겹친다 — 관측 못 한 입력이 구간을 열 수 있으므로
 * 「구조적 도달 불가」라고 단정하면 **거짓말**이 된다.
 * 🔴 이 픽스처는 새 규칙이 **과잉 적발하지 않는지**를 지킨다. 실제로 합격도 나오므로 PASS 여야 한다.
 *
 * 기대: L1 PASS · L2 PASS · 게이트 종료코드 0 */
export const runtimeDomainVarying = [
  base('lab-basic', 'ⓗ 런타임 정의역이 입력에 따라 변함', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 5 }, digits: 2 },
  ], (i) => ({ y: q(i.x, [0, Math.max(1, i.x * 20)]) })),
];

/* ══════════ ⓘ 🔴 **종전 게이트의 눈**을 재현한다 — 정의역이 어디에도 없을 때 ══════════
 *
 * ⓖ 와 **완전히 같은 결함**(합격창 {min:50}, 실제 값은 0~10)인데, 물리층이 `validRange` 를
 * 돌려주지 않는다. 명세에도 `domain` 이 없다. 즉 **정의역을 말해 주는 곳이 하나도 없다.**
 *
 * 🔴 이것이 「종전 게이트 = 명세 domain 만 봄」이 24칸에서 처해 있던 상태다.
 *    같은 결함인데 ⓖ 는 **FAIL(1)**, ⓘ 는 **UNDETERMINED(4)** 가 된다 —
 *    그 차이가 곧 팀장 지시 (가) 로 얻은 탐지력이다.
 *
 * 🔴 그리고 이것이 이 게이트의 **정직한 한계**다. 정의역을 아무도 말하지 않으면
 *    구조적 도달 불가를 증명할 수 없고, 그때는 FAIL 이 아니라 UNDETERMINED 가 옳다.
 *
 * 기대: L1 UNDETERMINED · L2 UNDETERMINED · 게이트 종료코드 4 */
export const runtimeDomainAbsent = [
  base('lab-basic', 'ⓘ 정의역이 어디에도 없음(종전 게이트의 눈)', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 50 }, digits: 2 },
  ], (i) => {
    const raw = q(i.x, [0, 10]);
    delete raw.validRange;       // 🔴 물리층이 정의역을 말해 주지 않는 상태
    raw.outOfRange = false;
    return { y: raw };
  }),
];

/* ══════════ ⓙ 🔴 **경계 ULP** — 픽스처가 제품과 같은 자를 들고 있는지 지킨다 ══════════
 *
 * 이것이 2026-08-22 「픽스처 안의 정본이 둘」 규명의 **회귀 방지 픽스처**다.
 *
 * `x = 10` 일 때만 값이 `220.00000000000003` — 상한 220 보다 **정확히 1 ULP** 위다.
 * 나머지 격자점은 `22·x` 로 한참 아래다. 합격창은 `{min: 200}` 이라 x = 10 에서만 합격한다.
 *
 *   · **제품 함수**(`isOutOfRange`, ULP 상대 여유 4·EPSILON·|bound| ≈ 6.875 ULP)
 *     → 1 ULP 초과는 **범위 안**이다 → x = 10 이 합격 → 합격·불합격이 둘 다 나옴 → **exit 0**
 *   · **옛 사본**(`value > validRange[1]`)
 *     → 1 ULP 초과를 **이탈**로 본다 → x = 10 도 불합격 → 전부 불합격 → **exit 4**
 *
 * 🔴 즉 이 픽스처가 **0 이 아닌 값을 내면 픽스처가 제품과 다른 자를 들었다는 뜻이다.**
 *    다른 픽스처들은 전부 정수 격자·정수 경계라 이 갈림을 못 본다 — 그래서 이것이 필요하다.
 *    (실측: 전환 전후로 나머지 11건의 종료코드는 하나도 안 움직였다. 이 픽스처만 갈린다.)
 *
 * 🔴 `220.00000000000003` 을 손으로 적지 않는다. `nextUp(220)` 을 **계산해서** 얻는다 —
 *    손으로 적은 상수는 「정말 1 ULP 인가」를 아무도 다시 확인하지 않는다.
 *
 * 기대: L1 PASS · L2 PASS · 게이트 종료코드 0 */
const HI = 220;
/** 220 바로 위 배정밀도 수(= 220 + 1 ULP). 비트 조작으로 정확히 구한다. */
const oneUlpAbove = (x) => {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  buf.setBigUint64(0, buf.getBigUint64(0) + 1n);
  return buf.getFloat64(0);
};
const HI_PLUS_1ULP = oneUlpAbove(HI);

export const ulpBoundary = [
  base('lab-basic', 'ⓙ 경계 1 ULP — 제품 판정식과 같은 자를 쓰는가', [
    { id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 200 }, digits: 2 },
  ], (i) => ({ y: q(i.x === 10 ? HI_PLUS_1ULP : i.x * 22, [0, HI]) })),
];

export const FIXTURES = {
  alive,
  allPass,
  allFailSample,
  allFailStructural,
  constantOutput,
  constantOutputOutside,
  noJudge,
  mutualExclusive,
  runtimeDomainClosed,
  runtimeDomainVarying,
  runtimeDomainAbsent,
  ulpBoundary,
};

/** 각 픽스처의 **기대 종료코드**. 게이트가 아니라 픽스처가 소유한다(기대→실측 대조용). */
export const EXPECTED_EXIT = {
  alive: 0,
  allPass: 1,
  allFailSample: 4,
  allFailStructural: 1,
  constantOutput: 1,
  constantOutputOutside: 4,
  noJudge: 1,
  mutualExclusive: 4,
  runtimeDomainClosed: 1,
  runtimeDomainVarying: 0,
  runtimeDomainAbsent: 4,
  ulpBoundary: 0,
};
