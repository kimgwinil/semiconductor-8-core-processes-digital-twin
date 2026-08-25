#!/usr/bin/env node
/**
 * 🔴 G-8 · check-grade-claim — **「코드는 합성이라 말하는데 원장은 문헌식」을 잡는다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 왜 생겼나 — 게이트를 통과하는 가장 쉬운 길이 「등급을 올리는 것」이었다
 * ══════════════════════════════════════════════════════════════════════════════
 *   `check-grades` 의 G3·G4·G6·G7 은 전부 **「`literature` 가 *아니면*」** 조건이다.
 *     · G3  `if (e.kind !== 'literature' && !e.notice)`      → literature 면 notice 요구가 사라진다
 *     · G4  `if (e.kind === 'synthetic')`                    → literature 면 검사 대상 밖
 *     · G6  `physics/**` 만 본다                              → `labs/**` 는 애초에 안 본다
 *     · G7  `if (!e || e.kind === 'literature') continue;`   → literature 는 건너뛴다
 *   → **등급을 `literature` 로 올려 놓으면 A6-b 검사를 통째로 빠져나간다.**
 *
 *   실물이 하나 들어 있었다(2026-08-22 PLN 교차검증 「신규-1」 · 본 게이트가 독립 재현):
 *     `eds.lab.s6.adProduct` — 코드의 `basis` 가 **「교육용 합성 — … 0.003/라인은 교육용
 *     설정값입니다」** 라고 자백하는데, 원장은 `kind: 'literature'` / `'문헌식'` 이다.
 *     같은 씬의 형제 4건(`waferTestMin`·`costPerGoodDie`·`repairedYield`·`defectLevelPpm`)은
 *     전부 `synthetic` + `notice` 다. `adProduct` 만 올라가 있고 `check-grades` 는 통과한다.
 *
 *   🔴 이것이 왜 최악인가: 「문헌 근거 있음」 배지는 이 제품에서 **가장 강한 주장**이다.
 *      학습자와 CEO가 「이 수는 문헌이 뒷받침한다」로 읽는다. 실제로는 교육용 설정값이다.
 *      D-008(교육용 값을 실측값처럼 보이게 함) 위반의 정확한 형태다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 무엇을 판정 축으로 삼았는가 — **문장 파싱이 아니라 구조 대조**
 * ══════════════════════════════════════════════════════════════════════════════
 *   지시: 「부분문자열 금지. `basis` 문장을 파싱하지 말고 **구조로 대조**하라.」
 *
 *   `basis` 는 자유 산문이 **아니다.** 유한한 **접두 토큰**으로 시작한다(아래 실측표).
 *   그래서 이 게이트는 문장을 읽지 않는다. **첫 ` — ` 앞의 토큰 하나**만 떼어
 *   `TOKEN_KIND` 표에 넣고, 표에 없으면 **그것도 실패**로 잡는다(B1).
 *   → 새 접두를 지어내 우회하는 길을 함께 막는다. 조용히 넘기면 그것이 다음 구멍이다.
 *
 *   ── 접두 토큰 실측 (AST · 2026-08-22 · `src/**\/*.ts(x)` 전수) ─────────────
 *     `quantity()` 호출 271건 = modelId 리터럴 270건 + 헬퍼 정의 1건
 *       basis 보유 87건 · basis 없음 184건(그 중 183건이 sourceId 보유)
 *       ┌─────────────────────────┬──────┬──────────────┐
 *       │ 접두 토큰               │ 호출 │ 고유 modelId │
 *       ├─────────────────────────┼──────┼──────────────┤
 *       │ '교육용 합성'           │  83  │      79      │
 *       │ '업계 운영 범위(A15-op)'│   4  │       4      │
 *       └─────────────────────────┴──────┴──────────────┘
 *     🔴 팀장이 30초 grep 으로 얻은 수(83 / 4)와 **호출 단위에서 일치**한다. 다만 원장은
 *        modelId 단위이므로 비교 단위는 **고유 modelId(79 / 4)** 다. 원장은 합성 78 —
 *        **79 대 78 의 차이 1건**이 상향 오분류다(83 대 78 이 아니다. 83 은 호출 수다).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 `basis` 접두인가 — `assumptions` 상수 참조와 견줘 본 실측 근거
 * ══════════════════════════════════════════════════════════════════════════════
 *   후보 ②는 `assumptions` 배열에 실린 상수 참조(`SYNTHETIC_NOTE` 등)였다. 실측 결과
 *   **`basis` 접두가 확실히 더 튼튼하다.** 근거 3가지:
 *
 *   1. **덮는 범위.** 비문헌 호출 87건 중 `basis` 는 **87/87(100 %)**. 상수 참조는
 *      `SYNTHETIC_ASSUMPTION` 18 + `SYNTHETIC_NOTE` 9 + `OPERATIONAL_ASSUMPTION` 10
 *      = 37 회(선언문 포함)로 **절반도 못 덮는다.**
 *   2. **정본이 하나인가.** `basis` 는 `contract.ts` 의 `QuantitySpec` **필드**다 — 정의가
 *      한 군데다. 반면 합성 표식 상수는 **파일마다 이름이 다르다**:
 *        `labs/photo.ts` → `SYNTHETIC_ASSUMPTION` · `labs/etch.ts` → `SYNTHETIC_ASSUMPTION`
 *        (같은 이름을 **각자 따로 선언**) · `labs/eds.ts` → `SYNTHETIC_NOTE`
 *      정본이 없으므로 **새 파일이 네 번째 이름을 지어내면 검사가 조용히 적용되지 않는다.**
 *      「미등록이면 FAIL」(B1)을 그쪽에는 걸 수가 없다 — 무엇이 등록 대상인지 정의할 수 없다.
 *   3. **화면에 실리는 것이 어느 쪽인가.** `quantity()` 는 `spec.basis` 를 `Quantity.basis`
 *      로 그대로 넘긴다. 학습자가 읽는 근거란이 곧 이 필드다.
 *
 *   → `assumptions` 상수는 **보조 신호로만** 쓴다(B9 · 경고). 판정 축으로 삼지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 방향 — 상향만 잡지 않는다. **양방향 전부 FAIL** 이다
 * ══════════════════════════════════════════════════════════════════════════════
 *   B2 상향(코드=합성/운영 · 원장=문헌)  ← 최우선. A6-b 3요건이 동시에 사라진다.
 *   B3 하향(코드=문헌 · 원장=합성/운영)  ← **함께 FAIL 로 잡는다.** 판단 근거:
 *        ① 불변식은 「코드의 근거 선언과 원장 `kind` 가 일치한다」이다. 어느 방향이든
 *           **둘 중 하나는 거짓말**이고, 어느 쪽이 거짓인지는 기계가 못 가른다.
 *        ② 하향은 **`sourceId` 가 조용히 사라지는** 형태다. `quantity()` 는
 *           `kind !== 'literature'` 이면 `sourceId` 를 잘라낸다 — 코드가 문헌 출처를
 *           달았는데 화면에서 증발한다. 「보고만」 하면 아무도 안 본다.
 *        ③ 현 트리 실측 **하향 0건**이다. 켜는 비용이 없고, 켜 두지 않으면
 *           **상향을 하향으로 위장**하는 대칭 구멍이 남는다.
 *      🔴 다만 **메시지는 방향별로 가른다.** 「무엇이 어긋났는가」와 「어느 쪽을 고쳐야
 *         하는가」는 다른 질문이고, 후자는 사람이 판단한다.
 *
 *   🔴 **임계(threshold)를 FAIL 조건에 두지 않았다(D-041).** 「N건 이하면 통과」류가
 *      하나도 없다. 임계가 있으면 사람이 그 임계를 튜닝해서 통과시킨다.
 *      건수는 **보고만** 하고, 판정은 언제나 「0건인가」다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙
 * ══════════════════════════════════════════════════════════════════════════════
 *   B1  `basis` 접두가 `TOKEN_KIND` 에 없다 → 실패 (새 접두로 우회 차단)
 *   B2  🔴 **상향** — 코드 claim ∈ {synthetic, operational} · 원장 `kind` = literature
 *   B3  **하향** — 코드 claim = literature · 원장 `kind` ∈ {synthetic, operational}
 *   B4  **종별 교차** — synthetic ↔ operational 이 어긋난다
 *   B5  `basis` 도 `sourceId` 도 없다 → **주장 자체가 없다.** 판정 불가를 통과로 세지 않는다
 *   B6  `basis` 와 `sourceId` 를 **둘 다** 달았다 → 모순 선언(계약상 배타)
 *   B7  같은 modelId 를 **서로 다른 claim 으로** 여러 곳에서 선언했다 → 원장 1행이 둘 다일 수 없다
 *   B8  원장에 있는데 `quantity()` 정의 지점을 못 찾았다 → **계측 사각지대.** 조용히 넘기지 않는다
 *   B9  (경고 · FAIL 아님) claim=synthetic/operational 인데 `assumptions` 에 합성 표식
 *       상수 참조가 없다 → 보조 신호 불일치. **판정하지 않는다**(위 근거 2 참조)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 계측의 한계 — 무엇을 못 보는가 (숨기지 않는다)
 * ══════════════════════════════════════════════════════════════════════════════
 *   L1. **헬퍼 경유 modelId 는 한 단계만 푼다.** `flag(v, 'packaging.lab.basic.metricName', 'S255', …)`
 *       처럼 `quantity()` 의 `modelId` 가 **감싸는 함수의 매개변수**면, 같은 파일 안의 호출부를
 *       찾아 실인자를 대입한다(1-hop). **2단 이상 전달·파일 간 전달·배열/객체 경유는 못 푼다.**
 *       못 풀면 B8 로 **드러낸다** — 통과시키지 않는다.
 *   L2. **`basis` 문장의 진위는 못 본다.** 「교육용 합성 — …」이라 적혀 있으면 합성이라고
 *       믿는다. 그 서술이 실제 계산과 맞는지는 사람이 읽어야 한다(PLN 축5).
 *   L3. **원장이 옳은지 코드가 옳은지 못 가른다.** 어긋났다는 것만 말한다. 어느 쪽을
 *       고칠지는 사람 몫이다 — 그래서 이 게이트는 아무것도 자동으로 고치지 않는다.
 *
 * 종료코드 (집안 규약): 0 통과 · 1 판정 실패(B1~B8) · 2 실행 오류(계측기 고장).
 *   → verify.mjs §V 표에서 `CODES.WITH_ERROR` 로 해석된다.
 *
 * 사용: node scripts/check-grade-claim.mjs [--json] [--root=<dir>] [--src <dir>] [--ledger <file>]
 *       `--root=` / `--src` / `--ledger` 는 🔴 **픽스처 전용 주입구**다. 실트리를 건드리지 않는다.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const flagArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
/* 🔴 `--root=<dir>` 는 **픽스처 전용 주입구**다(집안 관례 — check-direction·check-constants 와 같은 형태).
 *    이 게이트는 현행 트리에서 **사전 FAIL** 이다(실물 상향 1건이 들어 있다). 그래서 실파일 주입
 *    방식으로는 baseline≠0 이 되어 selftest 가 전 케이스를 SKIP 하고 **게이트가 영원히 미검증**된다.
 *    깨끗한 미니 트리로 뿌리를 갈아 끼워 「정상=0 · 위반=1」을 증명한다. 판정 코드 경로는 완전히 같다. */
const rootArg = argv.find((a) => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : null;
const SRC = path.resolve(flagArg('--src') ?? (ROOT ? path.join(ROOT, 'src') : path.join(APP, 'src')));
const LEDGER = path.resolve(flagArg('--ledger') ?? path.join(SRC, 'content', 'model-grades.json'));

/* ═══════════════════ 🔴 접두 토큰 표 — 코드에서 실측해 확정했다 ═══════════════════
 * 여기에 없는 접두가 나오면 **B1 실패**다. 표를 넓혀 통과시키지 마라(D-041).
 * 새 접두를 정말 도입해야 한다면, 그 접두가 어느 `kind` 를 뜻하는지 먼저 정하고
 * **원장 쪽 값과 함께** 바꿔라. 한쪽만 바꾸면 이 게이트가 잡는다.
 */
const TOKEN_KIND = Object.freeze({
  '교육용 합성': 'synthetic',
  '업계 운영 범위(A15-op)': 'operational',
});
/** 접두 구분자. `basis` 는 `'<토큰> — <서술>'` 형태다. 구분자가 없으면 문자열 전체가 토큰이다. */
const TOKEN_SEP = ' — ';
/** `assumptions` 의 합성 표식 상수 이름들 — 🔴 **보조 신호(B9)** 전용. 판정 축이 아니다. */
const AUX_MARKERS = Object.freeze(['SYNTHETIC_NOTE', 'SYNTHETIC_ASSUMPTION', 'OPERATIONAL_ASSUMPTION']);

/* ═══════════════════ 실행 오류(종료코드 2) 경로 ═══════════════════ */
function bail(msg, hint) {
  console.error(`⚠️  check-grade-claim 실행 오류 — ${msg}`);
  if (hint) console.error(`   ${hint}`);
  console.error('   🔴 이것은 「위반 없음」도 「위반 있음」도 아닙니다. 재지 못한 것입니다(종료코드 2).');
  process.exit(2);
}

if (!existsSync(SRC)) bail(`소스 디렉터리가 없습니다: ${SRC}`);
if (!existsSync(LEDGER)) {
  bail(`등급 원장이 없습니다: ${LEDGER}`,
    '원장을 못 읽으면 「어긋났다」인지 「못 읽었다」인지 구분할 수 없습니다.');
}

let ts;
try {
  ts = createRequire(import.meta.url)('typescript');
} catch (e) {
  bail(`typescript 를 불러오지 못했습니다: ${e.message}`,
    '`npm i` 로 devDependency 를 설치하세요. 🔴 정규식으로 대체하지 마십시오 — 주석·템플릿에 속습니다.');
}

let ledgerDoc;
try { ledgerDoc = JSON.parse(readFileSync(LEDGER, 'utf8')); }
catch (e) { bail(`등급 원장 파싱 실패: ${e.message}`); }
const models = ledgerDoc?.models ?? {};
if (Object.keys(models).length === 0) bail('등급 원장의 models 가 비어 있습니다.');

/* ═══════════════════ AST 수집 ═══════════════════ */
function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const litText = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
const propName = (p) => {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return null;
};

/** 감싸는 함수 선언(함수·화살표·메서드)을 위로 찾아 올라간다. L1 의 1-hop 해석에 쓴다. */
function enclosingFunction(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
      || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) return n;
  }
  return null;
}

/** 그 파일 안에서 `name(...)` 형태의 호출을 전부 모은다(1-hop 해석용). */
function callsTo(sf, name) {
  const out = [];
  (function w(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) out.push(n);
    n.forEachChild(w);
  })(sf);
  return out;
}

/** @type {{modelId:string, file:string, line:number, basis:string|null, hasSourceId:boolean, aux:boolean, via:string|null}[]} */
const decls = [];
/** 이름을 정적으로 못 얻은 정의 지점 — 계측 한계를 드러내기 위해 따로 센다. */
const unresolved = [];
let callCount = 0;

for (const file of walk(SRC)) {
  const rel = path.relative(APP, file);
  const text = readFileSync(file, 'utf8');
  let sf;
  try {
    sf = ts.createSourceFile(path.basename(file), text, ts.ScriptTarget.Latest, true,
      /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  } catch (e) { bail(`${rel} 파싱 실패: ${e.message}`); }

  (function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'quantity') {
      callCount++;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const spec = node.arguments[1];
      if (!spec || !ts.isObjectLiteralExpression(spec)) {
        unresolved.push({ file: rel, line, why: 'spec 이 객체 리터럴이 아니다', text: spec ? spec.getText(sf).slice(0, 60) : '<인자 없음>' });
        node.forEachChild(visit);
        return;
      }
      let idNode = null; let basisNode = null; let hasSourceId = false; let aux = false;
      let spread = false;
      for (const p of spec.properties) {
        if (ts.isSpreadAssignment(p)) { spread = true; continue; }
        /* 🔴 축약 속성(`{ modelId, sourceId }`)을 반드시 함께 본다.
         *    `packaging.ts` 의 `flag()` 헬퍼가 **정확히 이 형태**다. 축약을 빠뜨리면
         *    헬퍼 경유 6건이 통째로 「정의 지점 없음」으로 새어 나간다(초판에서 실제로 그랬다). */
        const shorthand = ts.isShorthandPropertyAssignment(p);
        if (!ts.isPropertyAssignment(p) && !shorthand) continue;
        const k = propName(p);
        const init = shorthand ? p.name : p.initializer;   // 축약이면 값 노드가 곧 그 식별자다
        if (k === 'modelId') idNode = init;
        else if (k === 'basis') basisNode = init;
        else if (k === 'sourceId') hasSourceId = true;
        else if (k === 'assumptions') {
          const t = init.getText(sf);
          aux = AUX_MARKERS.some((m) => new RegExp(`(^|[^A-Za-z0-9_])${m}([^A-Za-z0-9_]|$)`).test(t));
        }
      }
      if (spread) {
        unresolved.push({ file: rel, line, why: 'spec 에 스프레드(...)가 있어 필드를 정적으로 확정할 수 없다', text: spec.getText(sf).slice(0, 60) });
        node.forEachChild(visit);
        return;
      }

      // basis 는 문자열 리터럴이어야 접두를 뗄 수 있다. 아니면 계측 한계로 드러낸다.
      let basis = null;
      if (basisNode) {
        basis = litText(basisNode);
        if (basis === null) {
          unresolved.push({ file: rel, line, why: 'basis 가 문자열 리터럴이 아니다(접두를 정적으로 뗄 수 없다)', text: basisNode.getText(sf).slice(0, 60) });
          node.forEachChild(visit);
          return;
        }
      }

      const push = (modelId, via) => decls.push({ modelId, file: rel, line, basis, hasSourceId, aux, via });

      const idLit = litText(idNode);
      if (idLit !== null) {
        push(idLit, null);
      } else if (idNode && ts.isIdentifier(idNode)) {
        /* 🔴 L1 — 1-hop 헬퍼 해석. `flag(v, 'a.b.c', 'S255', …)` 처럼 감싸는 함수의
         *    **매개변수**로 들어온 modelId 를 같은 파일의 호출부에서 실인자로 되돌린다. */
        const fn = enclosingFunction(idNode);
        const fnName = fn && fn.name && ts.isIdentifier(fn.name) ? fn.name.text : null;
        const pIdx = fn ? fn.parameters.findIndex((pp) => ts.isIdentifier(pp.name) && pp.name.text === idNode.text) : -1;
        let resolved = 0;
        if (fnName && pIdx >= 0) {
          for (const c of callsTo(sf, fnName)) {
            const a = c.arguments[pIdx];
            const v = litText(a);
            const cl = sf.getLineAndCharacterOfPosition(c.getStart(sf)).line + 1;
            if (v !== null) {
              decls.push({ modelId: v, file: rel, line: cl, basis, hasSourceId, aux, via: `${fnName}() 1-hop (정의 ${rel}:${line})` });
              resolved++;
            } else {
              unresolved.push({ file: rel, line: cl, why: `${fnName}() 의 modelId 인자가 문자열 리터럴이 아니다`, text: a ? a.getText(sf).slice(0, 60) : '<인자 없음>' });
            }
          }
        }
        if (resolved === 0) {
          unresolved.push({ file: rel, line, why: `modelId 가 식별자 '${idNode.text}' 인데 1-hop 으로 풀리지 않았다`, text: idNode.getText(sf) });
        }
      } else {
        unresolved.push({ file: rel, line, why: 'modelId 가 문자열 리터럴도 식별자도 아니다', text: idNode ? idNode.getText(sf).slice(0, 60) : '<없음>' });
      }
    }
    node.forEachChild(visit);
  })(sf);
}

if (callCount === 0) {
  bail('src 에서 quantity() 호출을 하나도 찾지 못했습니다.',
    `대상: ${SRC} — 계약 함수 이름이 바뀌었다면 이 게이트를 함께 고쳐야 합니다.`);
}

/* ═══════════════════ 코드가 주장하는 kind 를 정한다 ═══════════════════ */
const errors = [];
const counts = { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0, B6: 0, B7: 0, B8: 0 };
const warnings = [];
const fail = (code, msg) => { counts[code]++; errors.push(`[${code}] ${msg}`); };

/** 한 정의 지점의 claim. 못 정하면 null 을 돌려주고 그 자리에서 실패를 낸다. */
function claimOf(d) {
  const where = `${d.file}:${d.line}${d.via ? ` (${d.via})` : ''}`;
  if (d.basis !== null && d.hasSourceId) {
    fail('B6', `${where} · '${d.modelId}' 가 basis 와 sourceId 를 **둘 다** 달았습니다 — 계약상 배타입니다`
      + `(contract.ts: sourceId 는 문헌값 전용, 합성·운영은 basis). 어느 주장이 참인지 기계가 가를 수 없습니다.`);
    return null;
  }
  if (d.basis !== null) {
    const token = d.basis.includes(TOKEN_SEP) ? d.basis.slice(0, d.basis.indexOf(TOKEN_SEP)).trim() : d.basis.trim();
    const kind = TOKEN_KIND[token];
    if (!kind) {
      fail('B1', `${where} · '${d.modelId}' 의 basis 접두 ${JSON.stringify(token)} 가 등록된 토큰이 아닙니다.\n`
        + `        등록 토큰: ${Object.keys(TOKEN_KIND).map((t) => JSON.stringify(t)).join(' · ')}\n`
        + `        🔴 표를 넓혀 통과시키지 마십시오(D-041). 새 접두를 도입하려면 그것이 어느 kind 를 뜻하는지\n`
        + `           먼저 정하고 **원장 값과 함께** 바꾸세요. 모르는 접두를 조용히 넘기면 그것이 다음 우회로입니다.`);
      return null;
    }
    return kind;
  }
  if (d.hasSourceId) return 'literature';
  fail('B5', `${where} · '${d.modelId}' 에 basis 도 sourceId 도 없습니다 — **근거 주장 자체가 없습니다.**\n`
    + `        판정할 것이 없는 상태를 「통과」로 세지 않습니다. 문헌값이면 sourceId 를, 합성·운영이면 basis 를 다세요.`);
  return null;
}

/** modelId -> { claim, sites[] } */
const byId = new Map();
for (const d of decls) {
  const claim = claimOf(d);
  if (claim === null) continue;
  if (!byId.has(d.modelId)) byId.set(d.modelId, { claims: new Map(), sites: [] });
  const rec = byId.get(d.modelId);
  rec.sites.push({ ...d, claim });
  if (!rec.claims.has(claim)) rec.claims.set(claim, []);
  rec.claims.get(claim).push(`${d.file}:${d.line}`);
}

/* ── B7: 같은 modelId 를 서로 다른 claim 으로 선언 ── */
for (const [id, rec] of byId) {
  if (rec.claims.size <= 1) continue;
  fail('B7', `'${id}' 를 **서로 다른 근거로** 선언했습니다 — 원장 1행이 둘 다일 수 없습니다.\n`
    + [...rec.claims].map(([k, sites]) => `        · ${k}: ${sites.join(', ')}`).join('\n'));
}

/* ── B2·B3·B4: 원장과의 3자 대조 ── */
const KIND_KO = { literature: '문헌식', synthetic: '합성', operational: '운영규약' };
const mismatches = { up: [], down: [], cross: [] };
for (const [id, rec] of byId) {
  if (rec.claims.size > 1) continue;              // B7 로 이미 잡았다. 중복 계상하지 않는다.
  const claim = [...rec.claims.keys()][0];
  const entry = models[id];
  if (!entry) continue;                            // 미등재는 check-grades G1 의 소관이다(중복 계상 금지)
  const kind = entry.kind;
  if (claim === kind) continue;
  const sites = [...new Set(rec.sites.map((s) => `${s.file}:${s.line}`))].join(', ');
  const head = `'${id}' — 코드는 **${KIND_KO[claim] ?? claim}**, 원장은 **${KIND_KO[kind] ?? kind} / ${entry.declaredGrade}**`;
  const basisLine = rec.sites[0].basis !== null ? `\n        basis: ${JSON.stringify(rec.sites[0].basis)}` : '';
  if (claim !== 'literature' && kind === 'literature') {
    mismatches.up.push(id);
    fail('B2', `🔴 **등급 상향** — ${head}\n`
      + `        사용처: ${sites}${basisLine}\n`
      + `        🔴 코드의 근거란이 스스로 「${KIND_KO[claim]}」이라고 말하는 값에 원장이 **문헌 배지**를 달았습니다.\n`
      + `           literature 로 올라가면 check-grades 의 G3(notice 필수)·G4(경향모델 강제)·G7(S번호 도용)이\n`
      + `           **동시에 검사 대상 밖**이 됩니다 — 게이트를 통과하는 가장 쉬운 길이 「등급을 올리는 것」입니다.\n`
      + `           A6-b 3요건(원장 경향모델 등재 · 화면 [경향모델] 배지 · 상시 고지)이 셋 다 사라집니다(D-008).\n`
      + `        → 원장을 고칠지 basis 를 고칠지는 **사람이 판단**합니다. 이 게이트는 아무것도 자동으로 고치지 않습니다.`);
  } else if (claim === 'literature' && kind !== 'literature') {
    mismatches.down.push(id);
    fail('B3', `**등급 하향** — ${head}\n`
      + `        사용처: ${sites}\n`
      + `        코드는 sourceId(문헌 출처)를 달았는데 원장이 ${KIND_KO[kind]} 입니다. quantity() 는 kind !== 'literature'\n`
      + `        이면 sourceId 를 **잘라냅니다** — 코드가 단 출처가 화면에서 조용히 사라집니다.\n`
      + `        상향(B2)의 거울상이므로 함께 막습니다. 한쪽만 막으면 위장 경로가 남습니다.`);
  } else {
    mismatches.cross.push(id);
    fail('B4', `**종별 교차** — ${head}\n        사용처: ${sites}${basisLine}`);
  }
}

/* ── B8: 원장에 있는데 정의 지점을 못 찾았다 (계측 사각지대) ── */
for (const id of Object.keys(models)) {
  if (byId.has(id)) continue;
  fail('B8', `원장의 '${id}' 에 대응하는 quantity() 정의 지점을 찾지 못했습니다 — **이 항목은 재지 못했습니다.**\n`
    + `        헬퍼를 2단 이상 거치거나 변수/배열을 경유하면 1-hop 해석이 풀지 못합니다(머리주석 L1).\n`
    + `        🔴 「못 봤다」를 「통과」로 세지 않습니다. modelId 를 호출부에 문자열 리터럴로 두거나 게이트를 넓히세요.`);
}

/* ── B9: 보조 신호(경고만) ── */
for (const [id, rec] of byId) {
  if (rec.claims.size > 1) continue;
  const claim = [...rec.claims.keys()][0];
  if (claim === 'literature') continue;
  if (rec.sites.some((s) => s.aux)) continue;
  warnings.push(id);
}

/* ═══════════════════ 출력 ═══════════════════ */
const tokenTally = new Map();
for (const d of decls) {
  if (d.basis === null) continue;
  const t = d.basis.includes(TOKEN_SEP) ? d.basis.slice(0, d.basis.indexOf(TOKEN_SEP)).trim() : d.basis.trim();
  if (!tokenTally.has(t)) tokenTally.set(t, new Set());
  tokenTally.get(t).add(d.modelId);
}
const ledgerTally = { literature: 0, synthetic: 0, operational: 0, other: 0 };
for (const e of Object.values(models)) {
  if (e && ledgerTally[e.kind] !== undefined) ledgerTally[e.kind]++; else ledgerTally.other++;
}
const claimTally = { literature: 0, synthetic: 0, operational: 0 };
for (const rec of byId.values()) {
  if (rec.claims.size !== 1) continue;
  claimTally[[...rec.claims.keys()][0]]++;
}

const summary = {
  src: SRC, ledger: LEDGER,
  quantityCalls: callCount, declSites: decls.length,
  uniqueModelIds: byId.size, ledgerEntries: Object.keys(models).length,
  tokens: Object.fromEntries([...tokenTally].map(([k, v]) => [k, v.size])),
  claimTally, ledgerTally,
  mismatches, counts, unresolved, errors, warnings,
};

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('check-grade-claim — 🔴 「코드는 합성이라 말하는데 원장은 문헌식」을 잡습니다 (G-8)');
  console.log(`  스캔: ${path.relative(APP, SRC)}/**/*.ts(x) · quantity() 호출 ${callCount}건 → 정의 지점 ${decls.length}건 · 고유 modelId ${byId.size}개`);
  console.log(`  원장: ${path.relative(APP, LEDGER)} · 등재 ${Object.keys(models).length}건`
    + ` (문헌 ${ledgerTally.literature} · 합성 ${ledgerTally.synthetic} · 운영규약 ${ledgerTally.operational}`
    + `${ledgerTally.other ? ` · 기타 ${ledgerTally.other}` : ''}) · AST 파싱 typescript ${ts.version}`);
  console.log('  basis 접두 토큰 실측(고유 modelId 기준):');
  for (const [t, ids] of [...tokenTally].sort((a, b) => b[1].size - a[1].size)) {
    console.log(`     ${String(ids.size).padStart(4)}  ${JSON.stringify(t)} → ${TOKEN_KIND[t] ?? '🔴 미등록'}`);
  }
  console.log(`  코드 claim: 문헌 ${claimTally.literature} · 합성 ${claimTally.synthetic} · 운영규약 ${claimTally.operational}`);
  console.log(`  🔴 문장을 파싱하지 않습니다 — 첫 ${JSON.stringify(TOKEN_SEP)} 앞의 **토큰 하나**만 유한 표와 대조합니다.`);
  if (unresolved.length) {
    console.log(`  ⚠️  정적으로 풀지 못한 정의 지점 ${unresolved.length}건 (계측 한계 — 머리주석 L1):`);
    for (const u of unresolved) console.log(`     ${u.file}:${u.line}  ${u.why} — ${u.text}`);
  }
  /* 🔴 B9 는 **판정하지 않는다.** 그런데 이 수 자체가 「왜 basis 를 축으로 골랐는가」의 증거다:
   *    합성·운영 claim 중 상당수가 보조 상수를 아예 안 달고 있다. 저쪽을 판정 축으로 삼았다면
   *    그 전부가 오탐이 되거나, 오탐을 피하려고 검사를 느슨하게 만들었을 것이다. */
  const synCount = claimTally.synthetic + claimTally.operational;
  console.log(`  [B9 · 경고만 · 판정 아님] 합성·운영 claim ${synCount}개 중 ${warnings.length}개가`
    + ` assumptions 에 보조 표식 상수(${AUX_MARKERS.join('·')})를 달지 않았습니다.`);
  console.log(`     🔴 그래서 보조 상수를 **판정 축으로 쓰지 않았습니다** — 상수 이름이 파일마다 달라`
    + ` 정본이 없고(머리주석 근거 2), 판정 축으로 삼으면 이 ${warnings.length}건이 전부 오탐이 됩니다.`);
  console.log(`     대상 modelId 전수는 --json 의 warnings 배열에 있습니다.`);
}

if (errors.length) {
  if (!AS_JSON) {
    console.log(`\n❌ check-grade-claim 실패 (${errors.length}건)`);
    for (const e of errors) console.log('  ' + e);
    console.log(`\n  집계 · B1 미등록접두 ${counts.B1} · 🔴 B2 상향 ${counts.B2} · B3 하향 ${counts.B3} · B4 종별교차 ${counts.B4}`
      + ` · B5 근거없음 ${counts.B5} · B6 모순선언 ${counts.B6} · B7 claim충돌 ${counts.B7} · B8 사각지대 ${counts.B8}`);
    console.log('  🔴 건수는 보고일 뿐 판정 기준이 아닙니다. 판정은 언제나 「0건인가」입니다 — 임계를 만들지 마십시오(D-041).');
  }
  /* 🔴 process.exit() 는 버퍼에 남은 stdout 을 잘라먹는다(집안 실측 — check-gate-registration 주석 참조). */
  process.exitCode = 1;
} else if (!AS_JSON) {
  console.log(`\n✅ check-grade-claim 통과 — 코드 근거 선언 ↔ 원장 kind 불일치 0건`
    + ` (고유 modelId ${byId.size}개 · 원장 ${Object.keys(models).length}건 전건 대조)`);
}
