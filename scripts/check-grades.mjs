#!/usr/bin/env node
/**
 * 🔴 A6-b 등급 원장 게이트 — `src/content/model-grades.json`.
 *
 * 왜 생겼나(2026-08-20 반려①): `registry.ts` 의 `declared` 가 **완전히 비어 있었다.**
 * 미등록 모델은 조용히 '경향모델' 로 떨어졌고, 그래서 문헌식 Rayleigh 도 Deal-Grove 도
 * 합성 스루풋 지수도 화면에서 **전부 같은 배지**를 달았다. 배지가 아무것도 가르지 못했다.
 * 「등급이 없어 전부 강등」은 고지가 아니라 결함이다. 그 결함을 다시 못 만들게 막는 게이트다.
 *
 * 🔴 판정 축은 **고지 문장이 아니라 구조 필드 `kind`** 다(오케스트레이터 판정 2026-08-20).
 *    종전처럼 「실제 장비 상수 아님」 문자열 사용 횟수로 세면 그 상수를 선언한 파일 밖에서는
 *    검사가 아예 돌지 않는다(비서 실측: 정확 문구는 24칸 중 3칸뿐).
 *
 * 검사:
 *  G1. `quantity()` 가 쓰는 modelId 가 **전부 원장에 등재**돼 있다 (미등재 0건)
 *  G2. 원장에 있는데 **아무도 안 쓰는 죽은 항목**이 없다
 *  G3. `kind` 가 'literature' | 'synthetic' 이고, `synthetic` 에는 `notice` 가 있다
 *  G4. `declaredGrade` 가 '검증식' | '문헌식' | '경향모델' 이고,
 *      `kind: 'synthetic'` 이면 `declaredGrade` 는 '경향모델' 이어야 한다(합성인데 문헌식 주장 금지)
 *  G5. L2 미통과(`L2_VERIFIED === false`)인데 '검증식' 을 선언한 항목이 없다 (D-011 과대주장 차단)
 *  G6. 🔴 `physics/**` 에서 나온 modelId 는 `kind: 'literature'` 여야 한다 (A15 — 물리층 합성 0건)
 *  G7. 🔴 `synthetic`·`operational` 이 **문헌 S번호를 빌려 달지 않는다** (출처 도용 차단)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(APP, 'src');
/* 🔴 `--ledger <파일>` 은 **픽스처 전용 주입구**다(2026-08-22 신설).
 *
 * 왜 생겼나: 자체검증 픽스처가 **실파일 `src/content/model-grades.json` 에 직접 주입**했다.
 * 2026-08-21 에 selftest 두 개가 겹쳐 돌면서 그 주입본이 복구되지 않고 트리에 남았고,
 * `eds.lab.s6.adProduct` 가 **합성 → 문헌식으로 조용히 승격된 채** 하루를 넘겼다.
 * 🔴 **A6-b 가 정확히 막으려던 그 일을 계측기 자신이 저질렀다.**
 * 그래서 원장 픽스처는 더 이상 실파일을 쓰지 않는다 — 주입본은 tmpdir 에 두고 이 인자로 가리킨다.
 * 실파일은 **읽기조차 하지 않는다.**
 */
const ledgerFlagIdx = process.argv.indexOf('--ledger');
const LEDGER = ledgerFlagIdx >= 0 && process.argv[ledgerFlagIdx + 1]
  ? resolve(process.argv[ledgerFlagIdx + 1])
  : join(SRC, 'content', 'model-grades.json');
const CATALOG = join(SRC, 'content', 'catalog.json');
const VERIFICATION = join(SRC, 'config', 'verification.ts');

const errors = [];
const fail = (m) => errors.push(m);

if (!existsSync(LEDGER)) {
  console.error(`❌ ${relative(APP, LEDGER)} 가 없습니다. 등급 원장이 없으면 A6-b 를 주장할 수 없습니다.`);
  process.exit(1);
}

/** 주석만 제거한다. 문자열 리터럴은 남긴다 — modelId 자체가 문자열이다. */
function stripComments(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

// ---------- 사용처 수집 ----------
const PHYSICS_SEG = `${sep}models${sep}physics${sep}`;   // 🔴 부분문자열이 아니라 경로 **세그먼트**로 판단한다(§7-3)
// 🔴 `modelId: '...'` 만 찾으면 **헬퍼에 인자로 넘기는 modelId 를 통째로 놓친다.**
//    실제로 packaging 의 `flag(value, 'packaging.lab.basic.metricName', …)` 6건이 그렇게 샜다.
//    그래서 **카탈로그의 활성 공정 ID 로 시작하는 점표기 문자열 리터럴**을 전부 수집한다.
//    카탈로그에서 읽으므로 공정 ID 를 코드에 리터럴로 늘어놓지 않는다(설계서 §11 C1).
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const activePids = Object.entries(catalog.processes)
  .filter(([, d]) => d.status === 'active').map(([k]) => k);
const ID_RE = new RegExp(`'((?:${activePids.join('|')})\\.[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)'`, 'g');

const used = new Map();          // modelId -> [파일…]
const physicsIds = new Set();
for (const f of walk(SRC)) {
  const src = stripComments(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(ID_RE)) {
    const id = m[1];
    // 🔴 차트 바인딩의 `id:` 는 modelId 가 아니다. 점표기가 같아 걸리므로 **키 이름으로** 가른다.
    //    `modelId:` 는 제외 대상이 아니다 — 키가 정확히 `id` 일 때만 건너뛴다.
    const before = src.slice(Math.max(0, m.index - 24), m.index);
    if (/(^|[^A-Za-z0-9_])id\s*:\s*$/.test(before)) continue;
    // 🔴 같은 「차트 id, modelId 아님」 예외의 다른 모양이다 — `xxxChart(id: string)` 처럼
    //    함수 안에서 `id` 로 되접히는(shorthand) 값을 **호출부에서 위치 인자로 직접** 넘기는 경우
    //    (실측: `implantTimeCurrentChart('deposition.implantTimeCurrent')`, 2026-08-25). 그 값이
    //    함수 안에서 `return { id, … }` 로 그대로 접히는 것을 `deposition.ts` 에서 확인했다 — 위
    //    `id:` 예외와 같은 사실을, 호출부가 아니라 정의부에서 봐야 알 수 있는 것뿐이다. 이 저장소의
    //    모든 차트 바인딩 생성 함수는 `xxxChart(...)` 로 짓는 관례이므로(다른 13개 전부 확인,
    //    2026-08-25) 함수명으로 가른다 — 새 차트 헬퍼가 이 관례를 따르면 자동으로 함께 제외된다.
    if (/[A-Za-z0-9_]*Chart\(\s*$/.test(before)) continue;
    if (!used.has(id)) used.set(id, []);
    used.get(id).push(relative(APP, f));
    if (f.includes(PHYSICS_SEG)) physicsIds.add(id);
  }
}

// ---------- 원장 읽기 ----------
let ledger;
try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')); }
catch (e) { console.error(`❌ model-grades.json 파싱 실패: ${e.message}`); process.exit(1); }
const models = ledger.models ?? {};

const GRADES = new Set(['검증식', '문헌식', '경향모델']);
const KINDS = new Set(['literature', 'synthetic', 'operational']);

const l2Verified = existsSync(VERIFICATION)
  && /export\s+const\s+L2_VERIFIED\s*=\s*true\b/.test(readFileSync(VERIFICATION, 'utf8'));

// ---------- G1 미등재 ----------
for (const [id, files] of used) {
  if (!(id in models)) {
    fail(`[G1] modelId '${id}' 가 등급 원장에 없습니다 — 화면에서 조용히 '경향모델' 로 떨어집니다. ` +
      `사용처: ${[...new Set(files)].join(', ')}`);
  }
}

// ---------- G2 죽은 항목 ----------
for (const id of Object.keys(models)) {
  if (!used.has(id)) {
    fail(`[G2] 등급 원장의 '${id}' 를 아무도 쓰지 않습니다 — 지우거나 사용처를 배선하세요.`);
  }
}

// ---------- G3~G6 ----------
let lit = 0; let syn = 0; let op = 0;
for (const [id, e] of Object.entries(models)) {
  if (!e || typeof e !== 'object') { fail(`[G3] '${id}' 항목이 객체가 아닙니다.`); continue; }
  if (!KINDS.has(e.kind)) {
    fail(`[G3] '${id}' 의 kind 가 '${e.kind}' 입니다 — literature|synthetic|operational.`);
    continue;
  }
  if (!GRADES.has(e.declaredGrade)) {
    fail(`[G4] '${id}' 의 declaredGrade 가 '${e.declaredGrade}' 입니다 — 검증식|문헌식|경향모델.`);
    continue;
  }
  if (e.kind !== 'literature' && (!e.notice || !String(e.notice).trim())) {
    fail(`[G3] '${id}' 는 kind=${e.kind} 인데 notice 가 없습니다. 고지 없이 내보낼 수 없습니다(A6-b).`);
  }
  if (e.kind === 'synthetic') {
    syn++;
    if (e.declaredGrade !== '경향모델') {
      fail(`[G4] '${id}' 는 kind=synthetic 인데 declaredGrade 가 '${e.declaredGrade}' 입니다 — 합성값은 '경향모델' 로만 등재합니다.`);
    }
  } else if (e.kind === 'operational') {
    op++;
  } else {
    lit++;
  }
  if (!l2Verified && e.declaredGrade === '검증식') {
    fail(`[G5] '${id}' 가 '검증식' 으로 등재됐는데 L2_VERIFIED=false 입니다 — 현업 검증 전에 「검증됨」을 주장할 수 없습니다(D-011).`);
  }
  // G6 — 물리층에 합성값은 0건이어야 한다. `operational` 은 A15-op 승인 구역이라 예외다.
  if (physicsIds.has(id) && e.kind === 'synthetic') {
    fail(`[G6] '${id}' 는 src/models/physics/** 에서 나오는데 kind='synthetic' 입니다 — 물리층 합성 계수 0건(A15) 위반.`);
  }
}

// ---------- G7: 🔴 합성값·운영규약이 **문헌 S번호를 빌려 달지 않는다** ----------
// 오케스트레이터 판정(2026-08-20): 합성값에 S번호를 **채번하지 않는다.**
//   S번호 원장은 「공개 문헌」 원장이다. 지어낸 값에 채번하면
//   **「S번호가 있다 = 문헌에 있다」가 무너지고** A6·A15·클린룸이 동시에 무너진다.
//   그래서 `Quantity.sourceId` 를 선택 필드로 열었다 — 합성값에는 출처가 **없는 것이 사실**이다.
//
// 종전에 8개 파일 83개 출력이 그 공정의 문헌 S번호를 빌려 달고 있었다
// (wafer→S106, oxidation→S120/S121, photo→S141/S144 …). 개별 부주의가 아니라
// **필수 필드가 거짓말을 강요한 결과**였다. 필드를 열었으니 이제 빌린 번호를 지운다.
//
// 🔴 `PENDING`(문헌이 있는데 못 찾음 · 조달 대상)과 **다른 상태**다. 같은 표에 세지 마라.
{
  const offenders = [];
  for (const f of walk(SRC)) {
    const src = stripComments(readFileSync(f, 'utf8'));
    // `modelId:` 를 찾은 뒤 그것을 감싸는 객체 리터럴의 끝까지만 본다(브레이스 깊이 추적).
    for (const m of src.matchAll(/modelId:\s*'([^']+)'/g)) {
      const id = m[1];
      const e = models[id];
      if (!e || e.kind === 'literature') continue;
      // 감싸는 `{` 를 뒤로 찾아 올라간다
      let open = src.lastIndexOf('{', m.index);
      if (open < 0) continue;
      let depth = 0; let end = open;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const obj = src.slice(open, end + 1);
      const sid = obj.match(/sourceId:\s*'(S\d+)'/);
      if (sid) {
        offenders.push(`[G7] ${relative(APP, f)}: '${id}' 는 kind=${e.kind} 인데 문헌 S번호 '${sid[1]}' 를 달고 있습니다 — ` +
          `합성값·운영규약에는 출처가 없습니다. sourceId 를 지우고 basis 로 근거를 서술하세요.`);
      }
    }
  }
  for (const o of offenders) fail(o);
}

console.log(
  `등급 원장 — 사용 modelId ${used.size}개 · 등재 ${Object.keys(models).length}개 ` +
  `(문헌 ${lit} · 합성 ${syn} · 운영규약 ${op}) · physics 출처 ${physicsIds.size}개 · L2_VERIFIED=${l2Verified}`,
);

if (errors.length > 0) {
  console.error(`\n❌ check-grades 실패 (${errors.length}건)`);
  for (const e of errors.slice(0, 60)) console.error('  ' + e);
  if (errors.length > 60) console.error(`  … 외 ${errors.length - 60}건`);
  process.exit(1);
}
console.log('✅ check-grades 통과');
