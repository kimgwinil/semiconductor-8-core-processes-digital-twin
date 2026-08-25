#!/usr/bin/env node
// check-constants.mjs — 🔴 **상수 정본이 둘 이상이면 실패.**
//
// 왜: §3-X 「우연히 같은 수」 상수 전수 스윕(2026-08-21)이 잠복 결함 10건을 냈고
// 그중 5건(A-3·A-4·A-5·A-9·A-11)이 전부 같은 병이다 — **같은 상수를 여러 파일이 각자 선언한다.**
// 값이 맞아서 아무도 안 본다. 한쪽만 고치면 나머지가 조용히 옛 값으로 남는다.
//   · A-11 labs 단위상수 8종이 파일 간 2개씩 중복 선언
//   · A-9  `MAX_DPR = 2` 가 WebGL 과 2D 폴백에 따로 (둘 다 export 안 함)
//   · A-5  번들 예산 `1048576` 이 게이트와 self-test 에 따로 → 예산을 올리면 self-test 가 위양성을 낸다
//   · A-3  볼츠만 상수가 5파일 · **값이 두 갈래**(8.617e-5 vs SI 정의값 8.617333262e-5)
//
// 🔴 **부분문자열 검사를 쓰지 않는다.** `scripts/lib/tokens.mjs` 의 토크나이저로
//    주석·문자열·템플릿 리터럴·정규식을 상태 추적해 걸러낸 뒤 **토큰으로만** 판정한다.
//    (§3-X 스윕이 쓴 것과 같은 전제다. 두 군데 적으면 한쪽만 고쳐지므로 lib 로 뺐다.)
//
// 사용:
//   node scripts/check-constants.mjs            판정(위반이 있으면 exit 1)
//   node scripts/check-constants.mjs --measure  규칙별 적발 건수만 출력(항상 exit 0)
//   node scripts/check-constants.mjs --root=<경로>  스캔 뿌리를 바꾼다(self-test 픽스처 전용)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, constDeclarations, isUpperSnake, evalNumeric, numValue, lineFinder } from './lib/tokens.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const MEASURE = process.argv.includes('--measure');
const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='));

/* ══════════════════════════ 판정 규칙 ══════════════════════════
 * R1 이름 중복      같은 UPPER_SNAKE 이름이 **2개 이상 파일**에서 각자 선언되고 값이 전부 같다
 *                   → 정본이 없다. 한 곳에서 export 하고 나머지는 import 하라.
 * R2 정본 갈림      같은 이름이 2개 이상 파일에서 선언됐는데 **값이 갈렸다**
 *                   → R1 보다 위험하다. 「통일」이 골든을 깰 수 있으므로 사람이 판정해야 한다.
 * R3 값 정본 없음   같은 **값**이 2개 이상 파일의 UPPER_SNAKE 상수에 박혔는데
 *                   **어느 쪽도 export 하지 않는다** → 이름을 바꿔 베낀 사본. 정본을 만들어라.
 * R4 화이트리스트   면제 항목은 **사유 문자열이 있어야** 하고, **실제로 위반이 있어야** 한다.
 *                   조용한 면제도, 썩은 면제도 금지다.
 * ════════════════════════════════════════════════════════════ */

/**
 * 🔴 **명시적 면제 목록.** 조용한 면제는 없다 — 항목마다 `rule` 과 `reason` 이 있어야 하고,
 *    `reason` 이 비어 있거나 너무 짧으면 **R4 로 실패**한다. 또 위반이 사라지면 항목이 썩으므로
 *    **stale 항목도 R4 로 실패**시킨다(면제가 조용히 쌓이는 것을 막는다).
 *
 * 형식: `'<상수 이름>': { rule: 'R1'|'R2', reason: '<왜 통일하면 안 되는가>' }`
 */
/* 🔴 **지금은 비어 있다.** 그리고 비어 있는 것이 정상 상태다 — 면제는 예외이지 기본값이 아니다.
 *
 * ── 이력: R4 가 2026-08-22 에 **처음 발동**해 스스로 만료를 신고했다 ──────────────
 *   `BOLTZMANN_EV_PER_K` 면제 1건이 있었다. 사유는 「값 두 갈래는 의도된 것 —
 *   회사 규약값(S54, 8.617e-5)과 SI 정의값(8.617333262e-5) 중 어느 쪽으로 통일해도
 *   한쪽 골든이 깨진다」였다.
 *
 *   SI 표기 담당이 그 전제를 없앴다(2026-08-22 실측 확인):
 *     · `physics/constants.ts:43` 이 **유일한 정본** — `withSource(8.617e-5, 'eV/K', 'S54')`
 *     · `reliability.ts`·`diffusion.ts`·`wetEtch.ts` 는 전부 거기서 **import** 한다(선언 안 한다)
 *     · `pointDefect.ts:64` 는 SI 정의값을 `siDefinitions.ts` 에서 받아 **다른 이름**으로 쓴다
 *   → **한 이름에 두 정본**이라는 위반 자체가 사라졌다. 면제가 지킬 대상이 없어졌다.
 *
 *   🔴 **되살리지 않았다.** 썩은 면제를 살리려면 거짓 출처를 되돌려야 하는데, 그것은
 *      게이트를 통과시키려고 제품을 나쁘게 만드는 것이다(D-041).
 *   🔴 이것이 R4 설계(`:44` 주석 「면제가 조용히 쌓이는 것을 막는다」)가 **실제로 작동한 첫 사례**다.
 *      `check-gate-registration` 이 등록 전 자기 자신을 R1 으로 잡고, `selftest-gates` 가
 *      분모에 자기를 남기는 것과 같은 계열이다 — **면제도 스스로 만료를 신고한다.**
 */
const ALLOW = {};

/** R3 에서 무시할 자명한 값. 이 값들은 정본을 만들 대상이 아니다. */
const TRIVIAL_VALUES = new Set([0, 1, -1, 2, -2, 0.5, 3, 4]);

/**
 * 🔴 R3 의 **이름이 서로 다른** 값 중복까지 판정할 것인가. 기본은 아니다(계측만).
 *
 * 실측 근거(2026-08-21, 이 저장소): 이름이 다른 값 중복은 **34종**이 나왔고 전부 훑어 보면
 * `PASS_YIELD_MIN_PCT(92)` 과 `YIELD_ON_RECOVERY_PCT(92)`, `RENDER_POLL_MS(250)` 과 `TEMP_MIN_K(250)`
 * 처럼 **개념이 다른데 값만 같은 것**이 대부분이다 — §3-X 가 「우연히 같은 수」라고 이름 붙인
 * 바로 그 오탐 계열이다(사람이 판정한 값충돌 178건에서 실제 오류가 0건이었던 것과 같은 결과다).
 * 오탐이 쏟아지면 진짜를 못 가린다(check-fallback-purity 가 후보 2종을 계측으로만 남긴 것과 같은 판단).
 * 그래서 **판정은 「같은 이름 × export 정본 없음」에만 건다.** 이름이 다른 쪽은 `--measure` 에 건수로만 남긴다.
 * 켜고 싶으면 `CHECK_CONSTANTS_R3_CROSS_NAME=1`.
 */
const R3_CROSS_NAME = process.env.CHECK_CONSTANTS_R3_CROSS_NAME === '1';

/* ---------- 파일 수집 ---------- */
function walk(dir, exts) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

/* 🔴 뿌리가 둘이다. `src/**` 만 보면 A-5(번들 예산 1048576 이 check-bundle 과 selftest 에 따로)를
 *    **구조적으로 못 잡는다** — 게이트 스크립트도 「고치면 같이 갈리는 상수」를 들고 있다. */
const SCAN = ROOT_ARG
  ? [{ dir: pathResolve(APP, ROOT_ARG.slice('--root='.length)), exts: ['.ts', '.tsx', '.mjs'] }]
  : [
    { dir: join(APP, 'src'), exts: ['.ts', '.tsx'] },
    { dir: join(APP, 'scripts'), exts: ['.mjs'] },
  ];

const files = [];
for (const s of SCAN) if (existsSync(s.dir)) files.push(...walk(s.dir, s.exts));
files.sort();

/**
 * 🔴 **숫자 상수만 본다.** 이 게이트는 §3-X 「우연히 같은 수」의 재발 방지기다.
 *    문자열·배열·객체·경로 계산(`join(APP,'src')`)까지 이름 중복으로 잡으면 **오탐이 쏟아진다**
 *    (실측: 필터 없이 R1 28종 · R2 19종 중 절반 이상이 스크립트의 `APP`·`DIST`·`LANGS`·`MIME` 류였다).
 *
 * 판정 세 단계 —
 *  ① 배열 `[a, b]` · 객체 `{…}` · 화살표 함수 · 템플릿 조립은 **스칼라 상수가 아니다** → 제외.
 *     🔴 이 걸러내기가 없으면 `NON_NEGATIVE = [0, Number.POSITIVE_INFINITY]` 을 「값 0 인 상수」로
 *     읽어 7파일 중복이라고 **거짓 보고**한다(2026-08-21 실측으로 잡아 고쳤다).
 *  ② 리터럴·산술·같은 파일 상수로 **완전 평가**되면 그 값(`exact: true`). `TEN * (2+2+2)` → 60.
 *  ③ 래퍼 호출 `withSource(8.617e-5, 'eV/K', 'S54')` 처럼 **첫 인자가 곧 값**인 관례면 그 값(`exact: false`).
 *     🔴 「숫자 리터럴이 하나뿐이면 그게 값」이라는 느슨한 규칙은 쓰지 않는다 —
 *     `PRESSURE_RANGE_PA[1] / PA_PER_KPA` 를 「값 1」로 읽어 역시 거짓 보고를 냈다.
 *  그 밖은 `null`(모른다). **모른다고 말하는 것이 값을 지어내는 것보다 낫다.**
 *
 * @returns {{value:number, exact:boolean}|null}
 */
function numericConstantValue(init, resolve) {
  if (!init || init.length === 0) return null;
  const first = init[0];
  if (first.type === 'punct' && (first.value === '[' || first.value === '{')) return null;
  if (init.some((t) => t.type === 'tpl')) return null;
  if (init.some((t) => t.type === 'punct' && t.value === '=>')) return null;
  if (init.some((t) => t.type === 'ident' && (t.value === 'function' || t.value === 'new'))) return null;

  const exactVal = evalNumeric(init, resolve, 0);
  if (exactVal !== null) return { value: exactVal, exact: true };

  if (first.type === 'ident' && init[1] && init[1].value === '(') {
    let k = 2;
    let sign = 1;
    if (init[k] && init[k].type === 'punct' && (init[k].value === '-' || init[k].value === '+')) {
      if (init[k].value === '-') sign = -1;
      k++;
    }
    const numTok = init[k];
    const after = init[k + 1];
    if (numTok && numTok.type === 'num' && after && after.type === 'punct' && (after.value === ',' || after.value === ')')) {
      const v = numValue(numTok) * sign;
      if (Number.isFinite(v)) return { value: v, exact: false };
    }
  }
  return null;
}

/* ---------- 선언 수집 ---------- */
let skippedNonNumeric = 0;
/** @type {Array<{name:string, file:string, line:number, exported:boolean, value:number|null, text:string}>} */
const decls = [];
let declTotal = 0;

for (const abs of files) {
  const rel = relative(APP, abs);
  const src = readFileSync(abs, 'utf8');
  const toks = tokenize(src);
  const lineAt = lineFinder(src);
  const all = constDeclarations(toks);
  declTotal += all.length;

  // 파일 안의 상수를 이름 → 초기화식 토큰으로 모아 **조립식을 재귀로 푼다**(사각지대 ① 부분 해소).
  const scope = new Map();
  for (const d of all) if (!scope.has(d.name)) scope.set(d.name, d.init);
  const memo = new Map();
  const resolve = (name, depth) => {
    if (memo.has(name)) return memo.get(name);
    if (!scope.has(name)) return null;
    memo.set(name, null);                  // 순환 방지: 먼저 null 로 박아 둔다
    const v = evalNumeric(scope.get(name), resolve, depth);
    memo.set(name, v);
    return v;
  };

  for (const d of all) {
    if (!isUpperSnake(d.name)) continue;
    const v = numericConstantValue(d.init, resolve);
    if (v === null) { skippedNonNumeric++; continue; }
    decls.push({
      name: d.name,
      file: rel,
      line: lineAt(d.nameTok.start),
      exported: d.exported,
      value: v.value,
      exact: v.exact,
      text: d.init.map((t) => t.value).join(' ').replace(/\s+/g, ' ').trim().slice(0, 60),
    });
  }
}

/* ---------- 판정 ---------- */
const errors = [];
const counts = { R1: 0, R2: 0, R3: 0, R4: 0 };
const usedAllow = new Set();

const byName = new Map();
for (const d of decls) {
  if (!byName.has(d.name)) byName.set(d.name, []);
  byName.get(d.name).push(d);
}

const r1Names = [];
const r2Names = [];

for (const [name, list] of [...byName].sort()) {
  const fileSet = new Set(list.map((d) => d.file));
  if (fileSet.size < 2) continue;

  const sigs = new Set(list.map((d) => String(d.value)));
  const forked = sigs.size > 1;
  const rule = forked ? 'R2' : 'R1';
  const where = list.map((d) => `${d.file}:${d.line}${d.exported ? ' (export)' : ''} = ${d.text} → ${d.value}`);

  const allow = ALLOW[name];
  if (allow) {
    usedAllow.add(name);
    if (allow.rule !== rule) {
      errors.push(`[R4] 면제 '${name}' 는 ${allow.rule} 로 등재됐는데 실제 판정은 ${rule} 입니다 — 면제 사유를 다시 쓰세요.`);
      counts.R4++;
    }
    continue;
  }

  if (forked) {
    counts.R2++;
    r2Names.push(name);
    errors.push(
      `[R2] 상수 '${name}' 의 **값이 갈렸습니다**(${fileSet.size}개 파일):\n`
      + where.map((w) => `        · ${w}`).join('\n')
      + '\n        → 어느 쪽이 정본인지 사람이 판정해야 합니다. 함부로 통일하면 골든이 깨질 수 있습니다'
      + `(§3-X A-3 사례). 의도된 갈림이면 check-constants.mjs 의 ALLOW 에 사유와 함께 등재하세요.`,
    );
  } else {
    counts.R1++;
    r1Names.push(name);
    errors.push(
      `[R1] 상수 '${name}' 가 ${fileSet.size}개 파일에서 각자 선언됩니다:\n`
      + where.map((w) => `        · ${w}`).join('\n')
      + '\n        → 한 곳에서 export 하고 나머지는 import 하세요.',
    );
  }
}

/* R3 — 같은 값이 여러 파일에 박혔는데 **어디에도 export 정본이 없다.** */
const byValue = new Map();
for (const d of decls) {
  if (d.value === null || TRIVIAL_VALUES.has(d.value)) continue;
  const k = String(d.value);
  if (!byValue.has(k)) byValue.set(k, []);
  byValue.get(k).push(d);
}
const r3Values = [];
const r3CrossName = [];
for (const [v, list] of [...byValue].sort()) {
  const fileSet = new Set(list.map((d) => d.file));
  if (fileSet.size < 2) continue;
  if (list.some((d) => d.exported)) continue;     // 정본이 있다 — R1 이 이름 중복은 따로 잡는다
  if (new Set(list.map((d) => d.name)).size > 1 && !R3_CROSS_NAME) {
    r3CrossName.push(`${v}: ${list.map((d) => `${d.name}@${d.file}:${d.line}`).join(' · ')}`);
    continue;
  }
  counts.R3++;
  r3Values.push(v);
  errors.push(
    `[R3] 값 ${v} 가 ${fileSet.size}개 파일의 상수에 박혔는데 **어느 쪽도 export 하지 않습니다**:\n`
    + list.map((d) => `        · ${d.file}:${d.line} ${d.name} = ${d.text}`).join('\n')
    + '\n        → 한쪽을 export 정본으로 올리고 나머지는 import 하세요(정본이 없으면 한쪽만 고쳐집니다).',
  );
}

/* R4 — 썩은 면제. 위반이 사라졌는데 목록에 남아 있으면 다음 사람이 「검사 중」이라고 오해한다. */
for (const [name, entry] of Object.entries(ALLOW)) {
  const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
  if (reason.length < 30) {
    errors.push(`[R4] 면제 '${name}' 에 사유(reason)가 없거나 너무 짧습니다 — **조용한 면제는 금지**입니다. 왜 통일하면 안 되는지 적으세요.`);
    counts.R4++;
    continue;
  }
  // 🔴 `--root` 스코프 실행(self-test 픽스처)에서는 썩음 판정을 하지 않는다 —
  //    면제는 **실제 저장소**를 두고 쓴 것이라 남의 트리에서는 당연히 안 걸린다.
  if (!usedAllow.has(name) && !ROOT_ARG) {
    errors.push(`[R4] 면제 '${name}' 가 썩었습니다 — 지금은 위반이 아닙니다. ALLOW 에서 지우세요(남겨 두면 다음 위반이 조용히 통과합니다).`);
    counts.R4++;
  }
}

/* ---------- 출력 ---------- */
if (MEASURE) {
  console.log('■ check-constants — 계측 모드(판정하지 않음)');
  console.log(`  스캔 파일 ${files.length}개 · const 선언 ${declTotal}개 · UPPER_SNAKE 중 **숫자 상수** ${decls.length}개(이름 ${byName.size}종) · 숫자 아님으로 제외 ${skippedNonNumeric}개`);
  console.log(`  R1 이름 중복(값 동일)  : ${counts.R1} 종 ${r1Names.join(' · ')}`);
  console.log(`  R2 정본 갈림(값 상이)  : ${counts.R2} 종 ${r2Names.join(' · ')}`);
  console.log(`  R3 값 정본 없음        : ${counts.R3} 종 ${r3Values.join(' · ')}`);
  console.log(`  R4 화이트리스트 위생   : ${counts.R4} 건`);
  console.log(`  면제 등재 ${Object.keys(ALLOW).length}건 · 그중 실제 적용 ${usedAllow.size}건`);
  console.log(`  (판정 안 함) 이름이 다른 값 중복 : ${r3CrossName.length} 종`);
  for (const d of r3CrossName) console.log(`     · ${d}`);
  process.exit(0);
}

if (errors.length) {
  console.error(`\n❌ check-constants 실패 (${errors.length}건) — 상수 정본이 둘 이상입니다`);
  console.error(`   R1 이름중복 ${counts.R1} · R2 정본갈림 ${counts.R2} · R3 값정본없음 ${counts.R3} · R4 화이트리스트 ${counts.R4}\n`);
  for (const e of errors) console.error('  ' + e);
  console.error('\n  고치는 법: 정본 한 곳(예: src/models/physics/<공정>/units.ts)에서 export 하고 나머지는 import 하세요.');
  console.error('  통일하면 안 되는 값이라면 check-constants.mjs 의 ALLOW 에 **사유와 함께** 등재하세요 — 사유 없는 면제는 R4 로 실패합니다.');
  process.exit(1);
}

console.log(
  `✅ check-constants 통과 — 파일 ${files.length}개 · UPPER_SNAKE 상수 선언 ${decls.length}개(이름 ${byName.size}종) · 판정 규칙 R1·R2·R3·R4 · 명시 면제 ${Object.keys(ALLOW).length}건`,
);
process.exit(0);
