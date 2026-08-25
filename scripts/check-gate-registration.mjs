#!/usr/bin/env node
/**
 * check-gate-registration — **「등록 안 된 게이트」를 자동으로 드러낸다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 필요한가 (2026-08-21 하루에 **세 번** 났다)
 * ══════════════════════════════════════════════════════════════════════════════
 *   check-live-judgment   신설 · package.json 등재 · **verify 단계 목록에 없었음**
 *   check-chart-series    신설 · package.json 등재 · **verify 단계 목록에 없었음**
 *                         ← 만든 사람이 「등록 완료」라고 보고까지 했다
 *   check-guard-naming    신설 · package.json 3종 등재 · **verify 단계 목록에 없었음**
 *
 *   세 번 다 만든 사람이 「등록했다」고 **믿었다.** `package.json` 에 이름이 있으니
 *   등록된 것처럼 보이기 때문이다.
 *   🔴 **`package.json` 은 실행 경로가 아니라 이름표일 뿐이다.** `npm run <name>` 이 도는 것은
 *      「사람이 손으로 부를 수 있다」는 뜻이지 「verify 가 돈다」가 아니다.
 *   그래서 이 게이트는 **`package.json` 을 읽지 않는다.** 그것이 세 번 다 거짓 안심을 준 신호다.
 *   **`verify.mjs` 의 `step()` 호출만이 등록의 증거**다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 부분문자열 검사가 아니라 AST 파싱인가 — **함정이 실재한다**
 * ══════════════════════════════════════════════════════════════════════════════
 *   `verify.mjs` 에는 게이트 이름이 **코드 밖에** 잔뜩 적혀 있다:
 *     · 머리주석 파이프라인 나열(2~9행)
 *     · §V 「게이트별 종료코드 표」(64~94행) — 이 표에는 **`selftest-gates` 까지** 이름이 있다
 *     · §W 절 — 「`selftest-gates` 를 편입하지 **않는다**」고 적은 자리인데 이름은 나온다
 *   `includes('check-foo')` 로 판정하면 **주석에 이름만 적혀도 「등록됨」으로 오판**한다.
 *   `selftest-gates` 의 경우 「편입하지 않는다」고 쓴 문장을 근거로 「편입됐다」고 판정하는,
 *   정확히 거꾸로 된 오판이 난다.
 *   → 그래서 **TypeScript 컴파일러 API 로 AST 를 만들어** `step('<이름>', …)` **호출 형태만**
 *     구조적으로 뽑는다. 주석·문자열 리터럴은 AST 에 코드로 들어오지 않는다.
 *     `if (fsExistsSync(DIST_DIR))` 블록 안의 `check-bundle` 도 `forEachChild` 로 잡힌다.
 *   🔴 `typescript` 는 **이미 devDependency** 다(`npm run typecheck`). 새 의존성이 아니다.
 *      불러오지 못하면 **종료코드 2(계측기 고장)** 로 낸다 — 판정 실패(1)로 위장하지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 이 게이트는 **자기 자신도 검사한다**
 * ══════════════════════════════════════════════════════════════════════════════
 *   자신을 예외 처리하지 않는다. `verify.mjs` 에 등록되기 전에는
 *   **자기 자신을 R1 위반으로 잡는 것이 정상**이다. 그것이 이 게이트가 작동한다는 증거다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙
 * ══════════════════════════════════════════════════════════════════════════════
 *   R1  게이트 파일인데 `verify.mjs` 의 `step()` 목록에 없다 → **미등록**
 *   R2  제외 등재에 사유가 없거나 부실하다(20자 미만) → 실패
 *       (`check-constants` R4 · `check-guard-naming` R4 와 같은 규율 — 조용한 면제 금지)
 *   R3  제외 등재의 `ref` 가 **죽은 포인터**다 → 실패
 *       (`verify.mjs` 에 그 §절이 없거나, 그 절이 해당 게이트 이름을 말하지 않는다)
 *   R4  **고아 제외** — 제외 등재된 이름의 파일이 실재하지 않는다 → 실패
 *   R5  `step('check-*')` 인데 대응 파일 `scripts/check-*.mjs` 가 없다 → 오타·유령 등록
 *   R6  `step('A', () => runNode('B.mjs'))` — **이름표와 실제 실행 파일이 다르다** → 실패
 *       🔴 R1 은 이름만 보므로 이것을 통과시킨다. 요약표에는 A 가 초록으로 찍히지만 A 는 안 돈다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 제외 목록의 정본을 어디 두었는가 — 판정과 근거
 * ══════════════════════════════════════════════════════════════════════════════
 *   요구: 「§W 사유를 **손으로 복제하지 마라**. §W 를 가리키거나, 제외 목록을 정본으로 삼고
 *          verify.mjs 가 그것을 읽게 하라.」
 *
 *   판정: **「§W 를 가리킨다 + 그 가리킴이 살아 있는지 기계로 확인한다」.**
 *     · 후자(제외 목록이 정본 · verify 가 읽음)는 **`verify.mjs` 편집이 필요**한데
 *       그 파일은 팀장 단독 소유다. 이 담당은 할 수 없다.
 *     · 그래서 전자를 택하되 **죽은 포인터를 허용하지 않는다**(R3):
 *       `ref: 'verify.mjs §W'` 면 게이트가 실제로 verify.mjs 에서 그 §절을 찾고,
 *       그 절이 그 게이트 이름을 언급하는지 확인한다.
 *       §W 가 사라지거나 selftest-gates 를 더는 말하지 않으면 **제외가 무효가 되어 실패**한다.
 *     · 즉 **사유 문장은 §W 한 곳에만** 있고, 여기에는 한 줄 요약과 포인터만 둔다.
 *       「정본이 둘이면 하나는 낡는다」에 걸리지 않고, 낡으면 기계가 잡는다.
 *   🔴 `ref` 는 **필수**다. 「verify 에서 빼도 되는 이유」는 verify 자신이 문서로 갖고 있어야 한다.
 *      이 제약 때문에 이 담당은 `verify.mjs` 를 못 고치므로 **제외를 임의로 늘릴 수 없다.**
 *
 * 종료코드 (집안 규약): 0 통과 · 1 판정 실패(R1~R6) · 2 실행 오류.
 *   🔴 3(selftest-gates 배타 락)·4(check-live-judgment 판정 불가)는 **쓰지 않는다.**
 *   → verify.mjs §V 표에서는 `CODES.WITH_ERROR` 로 해석돼야 한다.
 *
 * 사용: node scripts/check-gate-registration.mjs [--json]
 *       [--scripts-dir <dir>] [--verify <file>] [--exclude <json>]   ← 🔴 픽스처 전용
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyScript } from './lib/gate-classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

/* 🔴 `--scripts-dir` / `--verify` / `--exclude` 는 **픽스처 전용 주입구**다.
 *    위반 트리를 실제 `scripts/` 에 만들면 같은 트리를 동시에 고치는 다른 담당의
 *    게이트 측정이 오염된다(2026-08-21 실측 사고). 픽스처는 os.tmpdir() 을 쓴다. */
const SCRIPTS_DIR = path.resolve(flag('--scripts-dir') ?? HERE);
const VERIFY_PATH = path.resolve(flag('--verify') ?? path.join(SCRIPTS_DIR, 'verify.mjs'));
const IS_FIXTURE = argv.includes('--scripts-dir') || argv.includes('--verify') || argv.includes('--exclude');

/* ═══════════════════ 제외 목록 — 🔴 사유(R2)와 살아 있는 포인터(R3) 필수 ═══════════════════
 * 형식: { name, ref: 'verify.mjs §X', reason: '<한 줄 요약 — 전문은 ref 가 정본>' }
 * 🔴 넓히지 마라. 항목을 추가하려면 `verify.mjs` 에 §절로 사유를 먼저 적어야 한다(R3).
 */
let EXCLUDE = [
  {
    name: 'selftest-gates',
    ref: 'verify.mjs §W',
    reason:
      '배타 락 — verify 안에서 돌리면 종료코드 3(「다른 실행 중」)이 「제품이 위반했다」와 '
      + '같은 얼굴이 된다. 전문은 ref 가 가리키는 절이 정본이다(여기 복제하지 않는다).',
  },
];
const excludeArg = flag('--exclude');
if (excludeArg) EXCLUDE = JSON.parse(readFileSync(path.resolve(excludeArg), 'utf8'));

/* ═══════════════════ 무엇을 「게이트」로 세는가 ═══════════════════
 * 주 정의: `scripts/check-*.mjs` — 집안 명명 관례.
 * 보조:    KNOWN_EXTRA_GATES — 이름은 `check-` 가 아니지만 성질이 게이트인 것.
 *          🔴 이 목록에 없으면 애초에 스캔 대상이 아니어서 「제외했다」는 말 자체가 성립하지 않는다.
 * 제외:    *.selftest.mjs  — 🔴 **게이트를 시험하는 픽스처**이지 제품을 재는 게이트가 아니다.
 *                            `check-guard-naming.selftest.mjs` 는 이름만 보면 게이트처럼 보인다.
 *          tmp-* gen-* qa-* — 스크래치 · 생성기 · 수동 QA 도구. 판정하지 않는다.
 *          verify.mjs       — 게이트가 아니라 **게이트 실행기**.
 *          lib/ fixtures/   — 하위 디렉터리는 직접 실행 대상이 아니므로 스캔하지 않는다.
 */
/* 🔴 판정 자체는 **`scripts/lib/gate-classify.mjs` 가 정본**이다(2026-08-22 통합).
 *    종전에는 이 함수가 여기에만 있었고, `selftest-gates.mjs` 가 같은 판단을 정규식으로 따로 했다가
 *    `*.selftest.mjs` 를 게이트로 세어 커버리지 보고가 틀렸다. 정본이 둘이면 하나는 낡는다.
 *    🔴 규칙을 바꾸려면 정본 파일을 고쳐라. 여기에 다시 적지 마라. */

/* ═══════════════════ 실행 오류(종료코드 2) 경로 ═══════════════════ */
function bail(msg, hint) {
  console.error(`⚠️  check-gate-registration 실행 오류 — ${msg}`);
  if (hint) console.error(`   ${hint}`);
  console.error('   🔴 이것은 「위반 없음」도 「위반 있음」도 아닙니다. 재지 못한 것입니다(종료코드 2).');
  process.exit(2);
}

if (!existsSync(SCRIPTS_DIR)) bail(`스크립트 디렉터리가 없습니다: ${SCRIPTS_DIR}`);
if (!existsSync(VERIFY_PATH)) {
  bail(`verify 파일이 없습니다: ${VERIFY_PATH}`,
    '등록 정본을 읽지 못하면 「미등록」인지 「못 읽었는지」를 구분할 수 없습니다.');
}

let ts;
try {
  ts = createRequire(import.meta.url)('typescript');
} catch (e) {
  bail(`typescript 를 불러오지 못했습니다: ${e.message}`,
    '`npm i` 로 devDependency 를 설치하세요. 🔴 정규식으로 대체하지 마십시오 — 주석에 속습니다.');
}

/* ═══════════════════ verify.mjs 의 step() 호출을 **구조적으로** 뽑는다 ═══════════════════ */
const verifySrc = readFileSync(VERIFY_PATH, 'utf8');
let sf;
try {
  sf = ts.createSourceFile(path.basename(VERIFY_PATH), verifySrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
} catch (e) {
  bail(`verify 파싱 실패: ${e.message}`);
}

/** @type {{name:string, line:number, runs:string|null}[]} */
const steps = [];
/** 첫 인자가 문자열 리터럴이 아닌 `step()` — 이름을 알 수 없으므로 계측 한계로 보고한다. */
const dynamicSteps = [];

const litText = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);

/** step() 의 두 번째 인자 안에서 `runNode('<파일>')` 의 파일명을 찾는다(R6 용). */
function runNodeArg(node) {
  let found = null;
  (function dive(n) {
    if (found || !n) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'runNode') {
      const t = litText(n.arguments[0]);
      if (t) { found = t; return; }
    }
    n.forEachChild(dive);
  })(node);
  return found;
}

(function walk(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'step') {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const name = litText(node.arguments[0]);
    if (name != null) steps.push({ name, line, runs: node.arguments[1] ? runNodeArg(node.arguments[1]) : null });
    else dynamicSteps.push({ line, text: node.arguments[0] ? node.arguments[0].getText(sf).slice(0, 60) : '<인자 없음>' });
  }
  node.forEachChild(walk);
})(sf);

if (steps.length === 0) {
  bail('verify 에서 step() 호출을 하나도 찾지 못했습니다.',
    `파일: ${VERIFY_PATH} — step() 의 이름이나 형태가 바뀌었다면 이 게이트를 함께 고쳐야 합니다.`);
}

const registered = new Set(steps.map((s) => s.name));

/* ═══════════════════ §절 본문 추출 — R3 (죽은 포인터 금지) ═══════════════════
 * 절 머리글 형태: `  * §W <제목>` — 표 안의 상호참조(`… — 아래 §W`)는 머리글이 아니므로 걸리지 않는다.
 * 본문은 다음 §머리글까지, 또는 블록주석 종료 표식이 나오는 줄까지.
 */
const HEADING = /^\s*\*?\s*§([A-Z])\s+\S/;
function sectionBody(src, letter) {
  const lines = src.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING.exec(lines[i]);
    if (m && m[1] === letter) { start = i; break; }
  }
  if (start < 0) return null;
  const body = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const m = HEADING.exec(lines[i]);
    if (m && m[1] !== letter) break;
    body.push(lines[i]);
    if (lines[i].includes('*/')) break;
  }
  return body.join('\n');
}

/* ═══════════════════ 게이트 전수 ═══════════════════ */
const entries = readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .sort();

const gates = [];
const nonGates = [];
for (const name of entries) {
  const c = classifyScript(name);
  if (c.gate) gates.push({ file: name, name: c.base, why: c.why });
  else if (name.endsWith('.mjs')) nonGates.push({ file: name, why: c.why });
}

const excludedNames = new Set(EXCLUDE.map((x) => x.name));
const errors = [];
const counts = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 };

/* ── R1: 게이트인데 step() 목록에 없다 ── */
const unregistered = [];
for (const g of gates) {
  if (registered.has(g.name)) continue;
  if (excludedNames.has(g.name)) continue;
  unregistered.push(g);
  counts.R1++;
  errors.push(
    `[R1] ${g.file} — **verify.mjs 의 step() 목록에 없습니다(미등록).**\n`
    + `        🔴 package.json 에 등재해도 등록이 아닙니다. verify.mjs 에 다음 한 줄을 넣으세요:\n`
    + `           step('${g.name}', () => runNode('${g.file}'));\n`
    + `        의도적으로 빼는 것이라면 verify.mjs 에 §절로 사유를 적고 이 파일의 EXCLUDE 에 ref 와 함께 등재하세요.`,
  );
}

/* ── R2·R3·R4: 제외 등재 위생 ── */
for (const x of EXCLUDE) {
  const nm = x?.name ?? '<이름 없음>';

  // R2 — 조용한 면제 금지
  if (!x?.reason || String(x.reason).trim().length < 20) {
    counts.R2++;
    errors.push(
      `[R2] 제외 '${nm}' 에 사유(reason)가 없거나 너무 짧습니다 — **조용한 면제는 금지**입니다.\n`
      + `        현재: ${JSON.stringify(x?.reason ?? null)}\n`
      + `        → 왜 verify 에서 빼야 하는지 적으세요(check-constants R4 · check-guard-naming R4 와 같은 규율).`,
    );
  }

  // R3 — 죽은 포인터 금지. 사유의 정본은 verify.mjs 의 §절이다.
  const ref = x?.ref ? String(x.ref) : '';
  const m = /§([A-Z])\b/.exec(ref);
  if (!m) {
    counts.R3++;
    errors.push(
      `[R3] 제외 '${nm}' 에 ref 가 없습니다(예: 'verify.mjs §W').\n`
      + `        🔴 「verify 에서 빼도 되는 이유」는 **verify 자신이 문서로 갖고 있어야** 합니다.\n`
      + `        사유 문장을 여기에 복제하지 마십시오 — 정본이 둘이면 하나는 낡습니다.`,
    );
  } else {
    const body = sectionBody(verifySrc, m[1]);
    if (body == null) {
      counts.R3++;
      errors.push(
        `[R3] 제외 '${nm}' 의 ref '${ref}' 가 **죽은 포인터**입니다 — ${path.basename(VERIFY_PATH)} 에 §${m[1]} 절이 없습니다.`,
      );
    } else if (!body.includes(nm)) {
      counts.R3++;
      errors.push(
        `[R3] 제외 '${nm}' 의 ref '${ref}' 는 존재하지만 **그 절이 '${nm}' 를 언급하지 않습니다.**\n`
        + `        사유가 그 자리에서 사라졌거나 다른 절로 옮겨졌습니다. 제외는 무효입니다.`,
      );
    }
  }

  // R4 — 고아 제외
  const knownGate = gates.some((g) => g.name === nm);
  if (!knownGate) {
    counts.R4++;
    errors.push(
      `[R4] 제외 '${nm}' — 대응하는 게이트 파일이 ${IS_FIXTURE ? SCRIPTS_DIR : 'scripts/'} 에 없습니다(고아 제외).\n`
      + `        지우세요. 남겨 두면 나중에 같은 이름의 게이트가 **조용히 통과**합니다.`,
    );
  }
}

/* ── R5: 유령 등록(역방향) — step 이 부르는 check-* 파일이 없다 ── */
const gateFiles = new Set(gates.map((g) => g.file));
for (const s of steps) {
  if (!s.name.startsWith('check-')) continue;   // tsc/vitest/gen-sources 는 대상 아님
  if (gateFiles.has(`${s.name}.mjs`)) continue;
  counts.R5++;
  errors.push(
    `[R5] ${path.basename(VERIFY_PATH)}:${s.line} step('${s.name}') — 대응 파일 ${s.name}.mjs 가 없습니다(유령 등록·오타).`,
  );
}

/* ── R6: 이름표와 실제 실행 파일의 **불일치** ──
 * 🔴 R1 은 「이름이 목록에 있는가」만 본다. 그래서 다음이 R1 을 통과한다:
 *      step('check-gate-registration', () => runNode('check-chart-series.mjs'));
 *    이름은 등록됐는데 **실제로 도는 것은 딴 게이트**다. 요약표에는 초록으로 찍힌다 —
 *    이 게이트가 막으려는 「등록한 줄 알았다」의 가장 지독한 형태다. 그래서 함께 잡는다. */
for (const s of steps) {
  if (!s.runs) continue;                        // runCmd(tsc/vitest) 등 — 대상 아님
  const runsBase = s.runs.replace(/\.mjs$/, '');
  if (runsBase === s.name) continue;
  counts.R6++;
  errors.push(
    `[R6] ${path.basename(VERIFY_PATH)}:${s.line} step('${s.name}') 인데 실제로 도는 파일은 '${s.runs}' 입니다(이름표와 실행 대상 불일치).\n`
    + `        🔴 요약표에는 '${s.name}' 이 초록으로 찍히지만 그 게이트는 **한 번도 돌지 않습니다.**`,
  );
}

/* ═══════════════════ 출력 ═══════════════════ */
const summary = {
  scriptsDir: SCRIPTS_DIR,
  verify: VERIFY_PATH,
  mjsFiles: entries.filter((e) => e.endsWith('.mjs')).length,
  gates: gates.map((g) => g.name),
  nonGates,
  steps,
  dynamicSteps,
  excluded: EXCLUDE,
  unregistered: unregistered.map((g) => g.name),
  counts,
  errors,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('check-gate-registration — 「등록 안 된 게이트」를 잡습니다');
  console.log(`  스캔: ${IS_FIXTURE ? SCRIPTS_DIR : 'scripts/*.mjs'} · .mjs ${summary.mjsFiles}개 → **게이트 ${gates.length}개**`);
  console.log(`  등록 정본: ${IS_FIXTURE ? VERIFY_PATH : 'scripts/verify.mjs'} 의 step() 호출 ${steps.length}건 (AST 파싱 · typescript ${ts.version})`);
  console.log(`  🔴 package.json 은 읽지 않습니다 — 이름표일 뿐 실행 경로가 아닙니다.`);
  console.log(`  게이트 아님으로 걸러낸 .mjs ${nonGates.length}개: ${nonGates.map((n) => `${n.file}(${n.why})`).join(' · ') || '없음'}`);
  console.log(`  명시 제외 ${EXCLUDE.length}건: ${EXCLUDE.map((x) => `${x.name} → ${x.ref}`).join(' · ') || '없음'}`);
  if (dynamicSteps.length) {
    console.log(`  ⚠️  이름이 문자열 리터럴이 아닌 step() ${dynamicSteps.length}건 — 정적으로 이름을 알 수 없습니다:`);
    for (const d of dynamicSteps) console.log(`     ${path.basename(VERIFY_PATH)}:${d.line}  step(${d.text}…)`);
  }
}

if (errors.length) {
  if (!AS_JSON) {
    console.log(`\n❌ check-gate-registration 실패 (${errors.length}건)`);
    for (const e of errors) console.log('  ' + e);
    console.log(`\n  집계 · R1 미등록 ${counts.R1} · R2 사유없는제외 ${counts.R2} · R3 죽은포인터 ${counts.R3}`
      + ` · R4 고아제외 ${counts.R4} · R5 유령등록 ${counts.R5} · R6 이름표불일치 ${counts.R6}`);
    console.log('  🔴 제외 목록을 넓혀 통과시키지 마십시오(D-041). 게이트는 **등록해야** 게이트입니다.');
  }
  /* 🔴 `process.exit()` 는 버퍼에 남은 stdout 을 잘라먹는다(집안 실측 — check-guard-naming 주석 참조).
   *    `exitCode` 만 세팅하면 이벤트 루프가 비면서 정상 flush 된다. */
  process.exitCode = 1;
} else if (!AS_JSON) {
  console.log(`\n✅ check-gate-registration 통과 — 게이트 ${gates.length}개 중 미등록 0건`
    + ` (등록 ${gates.length - EXCLUDE.filter((x) => gates.some((g) => g.name === x.name)).length}`
    + ` · 명시 제외 ${EXCLUDE.length})`);
}
