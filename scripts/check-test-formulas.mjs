#!/usr/bin/env node
// check-test-formulas.mjs — 🔴 **구현을 그대로 베낀 테스트는 실패.**
//
// 왜: 「구현을 그대로 베낀 테스트는 아무것도 막지 못한다.」
// 기대값을 구현식으로 계산하면 구현이 틀려도 기대값이 같이 틀리므로 **항상 통과**한다.
// A14-2 「손계산 대조」의 전제가 바로 「종이에서 독립적으로 계산한 값」인데,
// 그 손계산이 사실은 구현식 복붙이면 A14-2 는 아무것도 검증하지 않는다.
//
// 🔴 골든 테스트(문헌 표 값을 손으로 적은 것)는 **정상**이다. 숫자 표는 연산자가 없어 조건 ①에서
//    떨어진다 — 실측에서 8개 골든 파일의 문헌 표 어느 것도 걸리지 않았다.
//    다만 골든 파일 안에 **구현식을 다시 적은 부분**이 있으면 그건 표가 아니므로 걸린다
//    (실제로 `oxidation.golden.test.ts:128` 이 그렇다 — 아래 「현행 위반」).
//
// 🔴 **부분문자열 검사를 쓰지 않는다.** `scripts/lib/tokens.mjs` 로 토큰화한 뒤
//    **정규화 토큰열의 n-gram 일치**로만 판정한다. 주석·문자열은 애초에 토큰 종류가 다르다.
//
// 사용:
//   node scripts/check-test-formulas.mjs            판정(위반이 있으면 exit 1)
//   node scripts/check-test-formulas.mjs --measure  임계별 적발 분포를 출력(항상 exit 0)
//   node scripts/check-test-formulas.mjs --root=<경로>  스캔 뿌리를 바꾼다(self-test 픽스처 전용)
//        (--root 아래의 `**/*.test.ts` 를 테스트로, 나머지 `.ts` 를 구현으로 본다)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, lineFinder, constDeclarations } from './lib/tokens.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const MEASURE = process.argv.includes('--measure');
const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='));

/* ══════════════════════════ 판정 규칙 ══════════════════════════
 * E1 기대식 복붙   테스트의 **기대값 계산식**(`expect(...)` 인자 · 지역 변수 초기화식)을
 *                  정규화한 토큰열이, 구현(`src/models/**`)의 토큰열과 **연속 N토큰 이상** 일치한다
 *                  → 구현을 베꼈다. 구현이 틀리면 기대값도 같이 틀린다.
 * E2 화이트리스트  면제 항목은 사유 문자열이 있어야 하고, 위반이 사라지면 썩은 항목으로 실패한다.
 *
 * ── 정규화 ──────────────────────────────────────────────────────
 *   숫자 리터럴 → `N` · 문자열/템플릿/정규식 → `S` · 그 밖의 **식별자는 이름 그대로** 둔다. `;` 는 버린다.
 *   식별자까지 `ID` 로 뭉개는 「구조만 보기」도 만들어 실측 비교했다(`CHECK_TEST_FORMULAS_NORM=struct`).
 *
 * ── 추가 조건 두 가지(둘 다 실측으로 필요해서 붙였다) ────────────
 *   ① 일치 구간에 **연산자가 2개 이상** — 이름 나열(`import { a, b, c }`)·재수출 목록은 식이 아니다.
 *   ② 일치 구간에 **문장 키워드(if·for·return·const…)가 없을 것** — 있으면 기대식 복붙이 아니라
 *      테스트 헬퍼 중복이다. 실측: `passwindow-domain.test.ts:96` 의 min/max 훑기 루프가
 *      `labs/packaging.ts:198` 과 19토큰 일치했는데 **기대식이 아니라 헬퍼**였다. ②가 그것을 걷어낸다.
 *
 * ── 🔴 임계 근거 (2026-08-21 실측 · 지어내지 않았다) ─────────────
 *   대상: 테스트 **41파일** · 뽑아낸 기대식 후보 **1,564개** · 구현 **64파일**(`src/models/**`).
 *   `--measure` 로 N 을 6~20 훑은 실측치(무조건 / 연산자≥2 / +문장제외):
 *
 *     정규화 = ident(채택)          정규화 = struct(식별자 뭉갬)
 *       N= 6  396 →  39 →  38        N= 6  1309 → 104 → 104
 *       N= 8  203 →  20 →  19        N= 8   810 →  58 →  58
 *       N=10   80 →   4 →   3        N=10   507 →  23 →  23
 *       N=12   36 →   4 →   3        N=12   343 →  14 →  14
 *       N=14    8 →   2 →   1        N=14   169 →   6 →   6
 *       N=16    7 →   2 →   1        N=16    45 →   2 →   2
 *       N=20    2 →   1 →   1        N=20     9 →   2 →   2
 *
 *   · **struct 정규화는 기각했다.** 같은 임계에서 건수가 4~5배다(N=12: 14 vs 3). 식별자를 뭉개면
 *     `expect(f(x).value).toBeCloseTo(y, n)` 같은 **호출 껍데기**가 서로 일치해 버린다.
 *   · **N=8·10 에는 오탐이 실재한다.** 9토큰 구간을 눈으로 확인한 결과 —
 *       `Math . abs ( got - expected ) /` (테스트의 **허용오차 산술**이 `models/grading.ts:58` 의
 *       상대오차 헬퍼와 겹친다 · golden 3파일) · `/ ( N * N * N * N` (단위 거듭제곱 우연 일치).
 *     둘 다 「구현식 복붙」이 아니다.
 *   👉 **채택 임계 N = 12.** N=10 과 N=12 는 현재 스위트에서 **같은 3건**을 내지만, 바로 아래
 *      9토큰 구간에 위 오탐이 실재하므로 **경계에서 두 칸 떨어진 12** 를 골랐다.
 *
 * ── 현행 위반 3건 (2026-08-21 · 전건 원문 대조 · **오탐 0건**) ────
 *   ① `tests/unit/eds-a14.test.ts:130` ↔ `physics/eds/yieldModels.ts:156` — **20토큰**.
 *      `Math.pow((1 - Math.exp(-ad)) / ad, 2)` 가 글자 그대로 같다. 가장 순수한 복붙이다.
 *      (그 테스트 스스로 「식 자기정합만 고정한다」고 적어 두었다 — 정직하지만, 그래서 아무것도 못 막는다.)
 *   ② `tests/unit/deposition-a14.test.ts:98` ↔ `physics/deposition/implant.ts:63` — **13토큰**.
 *      `Φ/(√(2π)·ΔR_p)` 의 분모를 그대로 다시 적었다. 손으로 한 것은 단위 환산(0.063 µm → 6.3e-6 cm)뿐이고
 *      **식의 모양은 구현에서 왔다** — √2 가 빠져도 양쪽이 같이 틀린다.
 *   ③ `tests/golden/oxidation.golden.test.ts:128` ↔ `physics/oxidation/dealGrove.ts:109` — **12토큰**.
 *      「x_i 를 τ 에 이중 계상하면 값이 커진다」를 보이려고 Deal–Grove 식을 **변형해 다시 적었다.**
 *      의도는 정당하지만 구현식이 바뀌면 이 사본만 옛 식에 남는다. 🔴 **문헌 표 값을 적은 골든이 아니다**
 *      (같은 파일의 표 값 테스트들은 하나도 걸리지 않았다).
 *   👉 셋 다 「고쳐라」가 아니라 **「사람이 판정하라」**다. 정당한 사유가 있으면 ALLOW 에 사유와 함께 등재하라.
 *      🔴 임계를 낮추려면 위 표를 **다시 재고** 근거를 갱신하라. 숫자를 지어내지 마라.
 * ════════════════════════════════════════════════════════════ */

/** 채택 임계 — 연속 일치 토큰 수. 위 「임계 근거」 참조. 낮추려면 근거를 다시 재라. */
const NGRAM = 12;
/** 일치 구간에 **연산자가 최소 이만큼** 있어야 「식」으로 본다. 이름 나열·import 목록을 걸러낸다. */
const MIN_OPERATORS = 2;
/** 색인 씨앗 길이. NGRAM 보다 짧아야 확장으로 더 긴 일치를 찾을 수 있다. */
const SEED = 6;

/** 면제. `'<테스트 파일 basename>:<행>': { reason }` */
const ALLOW = {};

const OPERATORS = new Set(['+', '-', '*', '/', '%', '**', '<', '>', '<=', '>=', '===', '!==', '==', '!=', '?', '&&', '||', '??']);

/** 일치 구간에 이 키워드가 있으면 **식이 아니라 문장**이다 — 기대식 복붙이 아니라 헬퍼 중복이다. */
const STATEMENT_KEYWORDS = new Set(['if', 'for', 'while', 'do', 'switch', 'case', 'return', 'const', 'let', 'var', 'function', 'class', 'try', 'catch', 'throw', 'break', 'continue', 'import', 'export']);

/** 정규화 방식. 'ident'(채택) = 식별자 이름을 살린다 · 'struct' = 전부 ID 로 뭉갠다(계측 비교용). */
const NORM = process.env.CHECK_TEST_FORMULAS_NORM === 'struct' ? 'struct' : 'ident';

/* ---------- 파일 수집 ---------- */
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

let testFiles = [];
let implFiles = [];
if (ROOT_ARG) {
  const root = pathResolve(APP, ROOT_ARG.slice('--root='.length));
  const all = existsSync(root) ? walk(root) : [];
  testFiles = all.filter((f) => f.endsWith('.test.ts')).sort();
  implFiles = all.filter((f) => !f.endsWith('.test.ts')).sort();
} else {
  testFiles = walk(join(APP, 'tests')).filter((f) => f.endsWith('.test.ts')).sort();
  // 🔴 지시서는 `src/physics/**`·`src/models/**` 라고 적었지만 이 저장소의 실제 배치는
  //    `src/models/physics/**` 다(물리층이 models 안에 있다). 그래서 `src/models/**` 하나로 덮는다.
  implFiles = walk(join(APP, 'src', 'models')).sort();
}

/** 'struct' 정규화에서도 이름을 살리는 수학 표면 — 식의 모양이 여기 담긴다. */
const MATH_SURFACE = new Set(['Math', 'abs', 'sqrt', 'cbrt', 'pow', 'exp', 'log', 'log2', 'log10', 'log1p', 'expm1',
  'min', 'max', 'floor', 'ceil', 'round', 'sign', 'hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'PI', 'E']);

/* ---------- 정규화 ---------- */
/** 식별자 이름을 살린 정규화(채택). 구조만 보는 변형은 위 「임계 근거」에서 기각됐다. */
function normalize(toks) {
  const out = [];
  for (const t of toks) {
    if (t.type === 'num') { out.push({ v: 'N', tok: t }); continue; }
    if (t.type === 'str' || t.type === 'tpl' || t.type === 'regex') { out.push({ v: 'S', tok: t }); continue; }
    if (t.type === 'punct') {
      if (t.value === ';') continue;
      out.push({ v: t.value, tok: t });
      continue;
    }
    if (t.type === 'ident') {
      out.push({ v: NORM === 'struct' && !MATH_SURFACE.has(t.value) ? 'ID' : t.value, tok: t });
      continue;
    }
  }
  return out;
}

/* ---------- 구현 색인 ---------- */
const implIndex = new Map();      // 씨앗 문자열 → [{file, arr, pos}]
const implArrays = [];
for (const abs of implFiles) {
  const rel = relative(APP, abs);
  const src = readFileSync(abs, 'utf8');
  const lineAt = lineFinder(src);
  const arr = normalize(tokenize(src));
  const entry = { rel, arr, lineAt };
  implArrays.push(entry);
  for (let i = 0; i + SEED <= arr.length; i++) {
    const key = arr.slice(i, i + SEED).map((x) => x.v).join(' ');
    if (!implIndex.has(key)) implIndex.set(key, []);
    implIndex.get(key).push({ entry, pos: i });
  }
}

/* ---------- 테스트 기대식 추출 ---------- */
/** @type {Array<{file:string, line:number, kind:string, arr:Array<object>}>} */
const candidates = [];
for (const abs of testFiles) {
  const rel = relative(APP, abs);
  const src = readFileSync(abs, 'utf8');
  const lineAt = lineFinder(src);
  const toks = tokenize(src);

  // ① expect( ... ) 의 인자
  for (let i = 0; i < toks.length - 1; i++) {
    if (!(toks[i].type === 'ident' && toks[i].value === 'expect')) continue;
    if (!(toks[i + 1].type === 'punct' && toks[i + 1].value === '(')) continue;
    let depth = 0;
    let j = i + 1;
    for (; j < toks.length; j++) {
      const p = toks[j];
      if (p.type !== 'punct') continue;
      if ('([{'.includes(p.value)) depth++;
      else if (')]}'.includes(p.value)) { depth--; if (depth === 0) break; }
    }
    const inner = toks.slice(i + 2, j);
    if (inner.length >= SEED) candidates.push({ file: rel, line: lineAt(toks[i].start), kind: 'expect 인자', arr: normalize(inner) });

    /* 🔴 vitest 에서 **기대값은 matcher 의 인자**다 — `expect(got).toBeCloseTo(<기대식>, n)`.
       expect() 인자만 보면 정작 기대식을 놓친다. `.not`·`.resolves` 체인도 타고 넘어간다. */
    let k = j + 1;
    while (k + 2 < toks.length && toks[k].type === 'punct' && toks[k].value === '.' && toks[k + 1].type === 'ident') {
      const matcher = toks[k + 1].value;
      if (!(toks[k + 2].type === 'punct' && toks[k + 2].value === '(')) { k += 2; continue; }
      let d2 = 0;
      let m2 = k + 2;
      for (; m2 < toks.length; m2++) {
        const p2 = toks[m2];
        if (p2.type !== 'punct') continue;
        if ('([{'.includes(p2.value)) d2++;
        else if (')]}'.includes(p2.value)) { d2--; if (d2 === 0) break; }
      }
      const arg = toks.slice(k + 3, m2);
      if (arg.length >= SEED) candidates.push({ file: rel, line: lineAt(toks[k + 1].start), kind: `matcher 인자 .${matcher}()`, arr: normalize(arg) });
      k = m2 + 1;
      break;
    }
    i = j;
  }

  // ② 기대 변수 초기화식(const/let). 골든 표(숫자 나열)는 연산자가 없어 어차피 걸리지 않는다.
  for (const d of constDeclarations(toks)) {
    if (d.init.length < SEED) continue;
    candidates.push({ file: rel, line: lineAt(d.nameTok.start), kind: `초기화식 ${d.name}`, arr: normalize(d.init) });
  }
}

/* ---------- 일치 계산 ---------- */
/** 후보와 구현 사이의 **가장 긴 연속 일치**를 찾는다. 씨앗 색인 → 앞뒤 확장. */
function bestMatch(cand) {
  let best = null;
  const a = cand.arr;
  for (let i = 0; i + SEED <= a.length; i++) {
    const key = a.slice(i, i + SEED).map((x) => x.v).join(' ');
    for (const { entry, pos } of implIndex.get(key) ?? []) {
      const b = entry.arr;
      let s = 0;
      while (i - s - 1 >= 0 && pos - s - 1 >= 0 && a[i - s - 1].v === b[pos - s - 1].v) s++;
      let e = SEED;
      while (i + e < a.length && pos + e < b.length && a[i + e].v === b[pos + e].v) e++;
      const len = s + e;
      if (!best || len > best.len) {
        const run = a.slice(i - s, i + e);
        best = {
          len,
          run,
          implFile: entry.rel,
          implLine: entry.lineAt(b[pos - s].tok.start),
          ops: run.filter((x) => OPERATORS.has(x.v)).length,
          stmt: run.some((x) => STATEMENT_KEYWORDS.has(x.v)),
        };
      }
    }
  }
  return best;
}

const matched = [];
for (const c of candidates) {
  const m = bestMatch(c);
  if (m) matched.push({ ...c, m });
}

/* ---------- 판정 ---------- */
const errors = [];
const counts = { E1: 0, E2: 0 };
const usedAllow = new Set();
const seen = new Set();

for (const c of matched) {
  if (c.m.len < NGRAM) continue;
  if (c.m.ops < MIN_OPERATORS) continue;        // 이름 나열·import 목록은 식이 아니다
  if (c.m.stmt) continue;                       // 문장(if·return·const…)이 섞였으면 기대식이 아니다
  const key = `${c.file}:${c.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (ALLOW[key]) { usedAllow.add(key); continue; }
  counts.E1++;
  errors.push(
    `[E1] ${c.file}:${c.line} (${c.kind}) 의 기대식이 구현과 **연속 ${c.m.len}토큰** 일치합니다`
    + ` (연산자 ${c.m.ops}개):\n`
    + `        · 구현: ${c.m.implFile}:${c.m.implLine}\n`
    + `        · 일치 토큰열: ${c.m.run.map((x) => x.v).join(' ').slice(0, 160)}\n`
    + '        → 구현을 베낀 기대값은 구현이 틀려도 같이 틀립니다. 문헌 표 값이나 손으로 푼 수를 적으세요.',
  );
}

for (const [key, entry] of Object.entries(ALLOW)) {
  const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
  if (reason.length < 30) {
    errors.push(`[E2] 면제 '${key}' 에 사유(reason)가 없거나 너무 짧습니다 — 조용한 면제는 금지입니다.`);
    counts.E2++;
  } else if (!usedAllow.has(key) && !ROOT_ARG) {
    // 🔴 `--root` 스코프 실행(self-test 픽스처)에서는 썩음 판정을 하지 않는다.
    errors.push(`[E2] 면제 '${key}' 가 썩었습니다 — 지금은 위반이 아닙니다. ALLOW 에서 지우세요.`);
    counts.E2++;
  }
}

/* ---------- 출력 ---------- */
if (MEASURE) {
  console.log('■ check-test-formulas — 계측 모드(판정하지 않음)');
  console.log(`  테스트 ${testFiles.length}파일 · 기대식 후보 ${candidates.length}개 · 구현 ${implFiles.length}파일`);
  console.log('  임계별 적발 건수(연산자 조건 적용 전 → 적용 후):');
  console.log(`  정규화 = ${NORM}${NORM === 'struct' ? ' (계측 비교용 — 채택된 방식이 아니다)' : ' (채택)'}`);
  console.log('    N   무조건  연산자≥2  +문장제외');
  for (const n of [6, 8, 10, 12, 14, 16, 18, 20]) {
    const raw = matched.filter((c) => c.m.len >= n);
    const ops = raw.filter((c) => c.m.ops >= MIN_OPERATORS);
    const kept = ops.filter((c) => !c.m.stmt);
    console.log(`    ${String(n).padStart(2)} ${String(raw.length).padStart(6)} ${String(ops.length).padStart(8)} ${String(kept.length).padStart(9)}`);
  }
  console.log(`\n  채택 임계 N=${NGRAM} · 연산자 ≥ ${MIN_OPERATORS} → ${counts.E1} 건`);
  const top = matched.filter((c) => c.m.ops >= MIN_OPERATORS && !c.m.stmt).sort((a, b) => b.m.len - a.m.len).slice(0, 25);
  for (const c of top) {
    console.log(`     · ${String(c.m.len).padStart(3)}토큰(op ${c.m.ops}) ${c.file}:${c.line} ↔ ${c.m.implFile}:${c.m.implLine}`);
    console.log(`         ${c.m.run.map((x) => x.v).join(' ').slice(0, 150)}`);
  }
  process.exit(0);
}

if (testFiles.length === 0 || implFiles.length === 0) {
  console.error(`❌ check-test-formulas: 스캔 대상이 없습니다 — 테스트 ${testFiles.length}개 · 구현 ${implFiles.length}개`);
  process.exit(1);
}

if (errors.length) {
  console.error(`\n❌ check-test-formulas 실패 (${errors.length}건) — 테스트가 구현식을 베꼈습니다`);
  console.error(`   E1 기대식 복붙 ${counts.E1} · E2 화이트리스트 ${counts.E2} (임계 N=${NGRAM} · 연산자 ≥ ${MIN_OPERATORS})\n`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-test-formulas 통과 — 테스트 ${testFiles.length}파일 · 기대식 ${candidates.length}개 · 구현 ${implFiles.length}파일 · `
  + `임계 연속 ${NGRAM}토큰(연산자 ≥ ${MIN_OPERATORS}) · 판정 규칙 E1·E2`,
);
process.exit(0);
