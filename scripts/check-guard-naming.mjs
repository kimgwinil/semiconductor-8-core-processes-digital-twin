#!/usr/bin/env node
/**
 * check-guard-naming — **범위선에 거짓 출처가 붙는 것을 막는다.**
 *
 * 🔴 왜 필요한가 (2026-08-21 실측).
 *   `contract.ts` 의 `UiGuard` 타입은 **이미 만든 가드가 인용으로 세탁되는 것**은 막지만,
 *   **범위선을 애초에 `withSource` 로 쓰는 것은 못 막는다**(H1 구멍). 타입 시스템은 `1000` 이라는
 *   숫자가 「Faraday 상수」인지 「도금 셀 상한」인지 알 수 없기 때문이다.
 *   실제로 사람이 손으로 16건을 찾아 옮겼고, 그 뒤 **9건이 더** 남아 있는 것이 이 검사로 드러났다.
 *   사람의 분류에 의존하는 규율은 반드시 샌다 — 그래서 기계로 옮긴다.
 *
 * 🔴 **왜 정적 파싱인가 (런타임 적재의 원리적 한계).**
 *   집안 관례는 `check-passwindow`·`check-wiring` 처럼 vite 로 모듈을 적재해 런타임 값을 보는 것이다.
 *   그러나 실측 결과 범위형 `withSource` 선언 **103건 중 76건(74 %)이 비-export 모듈 지역 상수**라
 *   **모듈 밖에서 원리적으로 보이지 않는다.** 런타임만으로는 4분의 3을 놓친다.
 *   그래서 **정적 파싱을 주 축**으로 삼고, **export 된 것만 런타임으로 교차확인**해
 *   「정적 파싱이 거짓말하지 않았는가」를 검증한다(G0). 정적 방식의 한계는 아래 §한계 에 적었다.
 *
 * 규칙
 *   G0 (교차확인) export 된 심볼은 런타임 `cls` 가 정적 판정과 일치해야 한다. 불일치 = 파서 결함.
 *   G1 (차단)     이름이 범위선꼴 + `withSource` + 주석에 **자백 어휘** → 실패.
 *                 근거: 실측 교차표에서 「절·표 인용」과 「자백 어휘」는 **겹치는 건이 0** 이었다.
 *                 즉 자백 어휘는 오탐이 사실상 없는 신호다.
 *   G2 (기본 보고·`--strict` 로 차단)
 *                 이름이 범위선꼴 + `withSource` + 주석에 **절·표 수준 인용이 없음** → 분류 미완.
 *                 🔴 지금 차단하지 않는 이유는 §G2 를 보라. 통계와 목록만 낸다.
 *   R4 (차단)     ALLOW 면제는 **사유 필수**. 사유에 S번호와 절·표 표식이 모두 없으면 실패.
 *                 매칭되지 않는 낡은 ALLOW 항목도 실패(고아 면제 금지).
 *
 * 사용: node scripts/check-guard-naming.mjs [--strict] [--json] [--no-runtime]
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const AS_JSON = argv.includes('--json');
const NO_RUNTIME = argv.includes('--no-runtime');
/* 🔴 `--root` 는 **픽스처 전용**이다. 위반 코드를 `src/` 안에 넣으면 같은 트리를 동시에 고치는
 *    다른 담당의 게이트 측정이 오염된다(2026-08-21 실측 사고). 픽스처는 임시 디렉터리를 쓴다. */
const rootArg = argv.indexOf('--root');
const SCAN_ROOT = rootArg >= 0 && argv[rootArg + 1]
  ? path.resolve(argv[rootArg + 1])
  : path.join(APP, 'src/models/physics');
const IS_FIXTURE = rootArg >= 0;

/* ─────────────────────── 면제 목록 (R4: 사유 필수) ───────────────────────
 * 🔴 **비어 있는 채로 시작한다.** 정당한 범위 인용은 면제를 등재하는 대신
 *    **주석에 절·표를 적으면** G2 를 자연히 통과한다(자기문서화 — 별도 목록이 썩지 않는다).
 *    ALLOW 는 주석에 절을 적을 수 없는 예외에만 쓴다.
 * 형식: { file: 'metal/cmp.ts', symbol: 'X_MAX', reason: 'S204 Table 2.6 이 4–66 kPa 로 진술' }
 */
let ALLOW = [];
/* 🔴 `--allow <json>` 도 **픽스처 전용**이다. R4(사유 필수·고아 면제 금지)를 실제 게이트 파일을
 *    고치지 않고 검증하기 위한 주입구다. 실제 운영에서는 위 배열이 정본이다. */
const allowArg = argv.indexOf('--allow');
if (allowArg >= 0 && argv[allowArg + 1]) {
  ALLOW = JSON.parse(readFileSync(path.resolve(argv[allowArg + 1]), 'utf8'));
}

/* ─────────────────────── 이름꼴 판별 ───────────────────────
 * 🔴 **부분문자열로 판단하지 않는다.** 집안 규율(부분문자열 검사가 이미 6번 사고를 냈다)에 따라
 *    이름을 `_` 로 쪼갠 **세그먼트 완전일치**로 본다. `MINIMUM_X` 의 "MIN" 같은 우발 일치를 막는다.
 * 🔴 예외: `..._PER_MIN`(= 분당, nm/min) 의 MIN 은 **시간 단위**이지 최소값이 아니다.
 *    실물 반례가 있다: `R165_MRR_NM_PER_MIN = withSource(302.5, 'nm/min', 'S200')` 은
 *    범위선이 아니라 **측정 점값**이다. PER 바로 뒤의 MIN 은 단위로 보고 건너뛴다.
 */
const RANGE_WORDS = new Set(['MIN', 'MAX', 'LIMIT', 'CAP', 'RANGE']);
export function rangeSegments(symbol) {
  const segs = symbol.split('_');
  const hits = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i].toUpperCase();
    if (!RANGE_WORDS.has(s)) continue;
    if (s === 'MIN' && i > 0 && segs[i - 1].toUpperCase() === 'PER') continue; // 분당 단위
    hits.push(s);
  }
  return hits;
}

/* 「우리가 그은 선」 자백 어휘 — 코드가 스스로 근거를 부정하는 표현. */
const CONFESS = /UI\s*안전장치|여유를\s*준|여유를\s*둔|여유폭|장비\s*상식|셀\s*상식|상식적|상식\s*범위|상식\s*구간|표시\s*상한|물리적\s*한계가\s*아니다|물리\s*한계가\s*아니다|문헌\s*근거\s*없음|문헌값이\s*아니라|문헌이\s*정한|진술이\s*아니다|실용\s*상한|깨지지\s*않게|운전\s*상한|운전\s*한계|들도록\s*\*?\*?잡았다|잡았다/;
/* 절·표 수준 인용 표식 — 이게 있으면 「어느 문헌의 어디가 그 범위를 말하는가」가 적힌 것이다. */
const CITE = /§|Table\s*\d|Tab\.|Eq\.|Eq\s*\(|식\s*\(|Fig\.|p\.\s*\d|표\s*\d|절\s*\d/;

const DECL = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*?)?=\s*(withSource|uiGuard)\s*\(/;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** 선언 바로 위의 doc 주석을 모은다(빈 줄은 건너뛰고, 주석이 아닌 줄을 만나면 멈춘다). */
function docAbove(lines, i) {
  const buf = [];
  let shared = false;
  for (let j = i - 1; j >= 0 && j > i - 14; j--) {
    const t = lines[j].trim();
    if (t === '') { if (buf.length) break; continue; }
    if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('*/')) { buf.unshift(t); continue; }
    /* 🔴 **짝 선언은 doc 주석을 공유한다.** 실측(2026-08-21):
     *   `const RPM_MIN = withSource(...);`
     *   `const RPM_MAX = withSource(...);`   ← 이 줄 위에는 주석이 없다
     * 주석은 MIN 쪽에만 붙고 MAX 는 같은 주석의 지배를 받는다. 형제 선언에서 멈추면
     * **짝의 절반을 통째로 놓친다**(이 결함으로 DIM_MAX_M·RPM_MAX·CENTER_DISTANCE_MAX_MM 를 놓쳤다).
     * 그래서 형제 「범위형 선언」 줄은 건너뛰고 계속 위로 올라간다. */
    if (buf.length === 0 && DECL.test(lines[j])) { shared = true; continue; }
    break;
  }
  return { doc: buf.join(' '), shared };
}

/* 🔴 직접 실행일 때만 검사를 돌린다. import 하면 순수 함수(`rangeSegments` 등)만 노출된다 —
 *    그래야 픽스처가 이름꼴 규칙을 **게이트를 실행하지 않고** 단위 검증할 수 있다. */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!IS_MAIN) { /* 라이브러리로 쓰임 */ } else {

const findings = [];   // 차단 대상
const backlog = [];    // G2 보고 대상
const inventory = [];  // 전수 목록

const files = existsSync(SCAN_ROOT) ? await walk(SCAN_ROOT) : [];
for (const abs of files) {
  const rel = path.relative(SCAN_ROOT, abs);
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = DECL.exec(lines[i]);
    if (!m) continue;
    const [, symbol, kind] = m;
    const hits = rangeSegments(symbol);
    if (hits.length === 0) continue;
    const { doc, shared } = docAbove(lines, i);
    const rec = {
      file: rel, line: i + 1, symbol, kind, words: hits,
      exported: /^\s*export\s/.test(lines[i]),
      confess: CONFESS.test(doc), cite: CITE.test(doc), docShared: shared, doc: doc.slice(0, 160),
    };
    inventory.push(rec);
    if (kind !== 'withSource') continue;
    const allowed = ALLOW.find((a) => a.file === rel && a.symbol === symbol);
    if (allowed) { rec.allowed = true; continue; }
    if (rec.confess) {
      findings.push({ rule: 'G1', ...rec });
    } else if (!rec.cite) {
      backlog.push({ rule: 'G2', ...rec });
    }
  }
}

/* ── R4: 면제는 사유 필수 · 고아 면제 금지 ── */
const r4 = [];
for (const a of ALLOW) {
  if (!a.reason || !/S\d+/.test(a.reason) || !CITE.test(a.reason)) {
    r4.push(`[R4] ALLOW ${a.file}:${a.symbol} — 사유에 **S번호와 절·표 표식이 모두** 있어야 합니다. 현재: ${JSON.stringify(a.reason ?? null)}`);
  }
  if (!inventory.some((r) => r.file === a.file && r.symbol === a.symbol)) {
    r4.push(`[R4] ALLOW ${a.file}:${a.symbol} — 매칭되는 선언이 없습니다(고아 면제). 지우세요.`);
  }
}

/* ── G0: export 된 것만 런타임으로 교차확인 ── */
const g0 = [];
let runtimeChecked = 0;
if (!NO_RUNTIME && !IS_FIXTURE && inventory.some((r) => r.exported)) {
  try {
    const { createServer } = await import('vite');
    const server = await createServer({
      root: APP, configFile: path.join(APP, 'vite.config.ts'),
      server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
    });
    try {
      await server.ssrLoadModule('/src/models/registry.ts').catch(() => {});
      const byFile = new Map();
      for (const r of inventory.filter((x) => x.exported)) {
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file).push(r);
      }
      for (const [rel, recs] of byFile) {
        let mod;
        try { mod = await server.ssrLoadModule('/src/models/physics/' + rel.split(path.sep).join('/')); }
        catch { continue; }
        for (const r of recs) {
          const v = mod[r.symbol];
          if (!v || typeof v !== 'object' || !('cls' in v)) continue;
          runtimeChecked++;
          const expected = r.kind === 'uiGuard' ? 'UI안전장치' : '문헌계수';
          if (v.cls !== expected) {
            g0.push(`[G0] ${r.file}:${r.line} ${r.symbol} — 정적 판정 '${r.kind}'(→cls '${expected}') 인데 런타임 cls 는 '${v.cls}' 입니다. **파서 결함이거나 별칭 우회입니다.**`);
          }
        }
      }
    } finally { await server.close(); }
  } catch (e) {
    g0.push(`[G0] 런타임 교차확인을 하지 못했습니다: ${e.message}`);
  }
}

/* ── 출력 ── */
if (AS_JSON) {
  console.log(JSON.stringify({ inventory, findings, backlog, r4, g0, runtimeChecked }, null, 2));
}
const blocking = [...g0, ...r4,
  ...findings.map((f) => `[G1] ${f.file}:${f.line}: '${f.symbol}' 은 범위선 이름꼴(${f.words.join('·')})인데 withSource 로 선언됐고, **주석이 스스로 UI 안전장치임을 자백**합니다.\n        주석: ${f.doc}\n        → uiGuard(값, 단위, '왜 이 선인가') 로 옮기세요. 값은 한 자리도 바꾸지 마세요.`),
  ...(STRICT ? backlog.map((f) => `[G2] ${f.file}:${f.line}: '${f.symbol}' — 범위선 이름꼴인데 주석에 **어느 문헌의 어느 절·표가 이 범위를 진술하는지**가 없습니다.\n        → 문헌이 진술하면 절·표를 주석에 적고, 아니면 uiGuard 로 옮기세요.`) : []),
];

if (!AS_JSON) {
  console.log('check-guard-naming — 범위선 이름꼴에 붙은 거짓 출처를 막습니다');
  console.log(`  스캔: ${IS_FIXTURE ? SCAN_ROOT : 'src/models/physics/**'} · 범위형 선언 ${inventory.length}건 (withSource ${inventory.filter(r=>r.kind==='withSource').length} / uiGuard ${inventory.filter(r=>r.kind==='uiGuard').length})`);
  console.log(`  런타임 교차확인(G0): export ${inventory.filter(r=>r.exported).length}건 중 ${runtimeChecked}건 확인 · 비-export ${inventory.filter(r=>!r.exported).length}건은 원리적으로 불가`);
  if (!STRICT) {
    console.log(`\n  [G2·비차단] 분류 미완 ${backlog.length}건 — 주석에 절·표 인용이 없는 범위형 withSource.`);
    console.log('     ← 「통과」가 아니라 **아직 사람이 분류하지 않았다**는 뜻입니다. --strict 로 목록을 봅니다.');
  }
}

if (blocking.length) {
  if (!AS_JSON) console.log(`\n❌ check-guard-naming 실패 (${blocking.length}건)`);
  if (!AS_JSON) for (const b of blocking) console.log('  ' + b);
  if (!AS_JSON) console.log('\n  고치는 법: 범위선은 `uiGuard(값, 단위, 이유)` 로 옮기고, 문헌이 실제로 진술하는');
  if (!AS_JSON) console.log('  범위라면 **주석에 절·표를 명시**하세요(예: 「S204 Table 2.6 이 4–66 kPa 로 진술」).');
  if (!AS_JSON) console.log('  🔴 게이트를 완화해 통과시키지 마세요(D-041). 값은 한 자리도 바꾸지 마세요.');
  /* 🔴 `process.exit()` 는 **버퍼에 남은 stdout 을 잘라먹는다**(--json 출력이 실제로 잘렸다).
   *    `exitCode` 만 세팅하면 이벤트 루프가 비면서 정상 flush 된다. */
  process.exitCode = 1;
} else {
  if (!AS_JSON) console.log(`\n✅ check-guard-naming 통과 — 자백형 거짓 인용 0건${STRICT ? ' · 분류 미완 0건' : ` (분류 미완 ${backlog.length}건은 비차단)`}`);

}

} // ── IS_MAIN
