#!/usr/bin/env node
// check-scene-constants.mjs — 🔴 **씬 셰이더(GLSL)가 상수를 손으로 적으면 실패.**
//
// 왜: §3-X 「스윕이 닫지 못한 사각지대 ③」이 이것이다 —
//   「CSS·GLSL 안의 숫자 — 토크나이저가 문자열로 처리해 제외. **WebGL 씬과 2D 폴백이 같은 형상
//     계수를 각자 갖고 있을 가능성**(A-9·§3-W-3 이 그 증상)」
// GLSL 소스는 TS 템플릿 리터럴 안에 있어서 §3-X 스윕의 **분모에 아예 안 들어갔다.**
// 이 게이트가 그 구멍만 판다. 셰이더 문자열을 **문자열이 아니라 소스로** 읽는다.
//
// 정상 형태는 이미 저장소에 있다:
//   · `src/viz/gl/textures.ts` 의 `texMeanGLSL(name)` — 실측 평균 알베도를 GLSL 리터럴로 **찍어 주입**
//   · `src/viz/gl/scenes/plasma.ts` 의 `glslFloat(SHEATH_BASE_UV)` — 모델 모듈 상수를 주입
// 이 게이트가 잡으려는 것은 그 반대, **손으로 적힌 숫자**다.
//
// 🔴 **부분문자열 검사를 쓰지 않는다.** `scripts/lib/tokens.mjs` 로 템플릿 리터럴을
//    「손으로 적은 chunk」와 「주입된 ${expr}」로 **쪼개서** 본다. 주입된 값은 애초에 판정 대상이 아니다.
//
// 사용:
//   node scripts/check-scene-constants.mjs            판정(위반이 있으면 exit 1)
//   node scripts/check-scene-constants.mjs --measure  규칙별 적발 건수만 출력(항상 exit 0)
//   node scripts/check-scene-constants.mjs --root=<경로>  스캔 뿌리를 바꾼다(self-test 픽스처 전용)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, basename, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, lineFinder, numValue, constDeclarations, isUpperSnake, evalNumeric } from './lib/tokens.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const MEASURE = process.argv.includes('--measure');
const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='));
const ROOT = ROOT_ARG ? pathResolve(APP, ROOT_ARG.slice('--root='.length)) : join(APP, 'src', 'viz');

/* ══════════════════════════ 판정 규칙 ══════════════════════════
 * 판정 대상은 **GLSL 안에서 이름을 붙여 선언한 상수**뿐이다 — `const float NAME = <값>;`.
 * 셰이더 식 안에 흩어진 배치·색 숫자(`vec3(0.62,0.66,0.72)`·`uTime*0.22`)는 **판정하지 않는다.**
 * 이름을 붙였다는 것이 「이건 상수다」라는 저자의 선언이고, 그 선언이 곧 「TS 에서 주입했어야 한다」다.
 *
 * B1 이름 충돌   GLSL 상수 이름이 **viz 안의 다른 곳**(다른 씬의 GLSL 상수 · 모델 모듈 · 폴백 ·
 *                같은 파일 TS)의 이름 붙은 상수와 **같다** → 같은 이름을 여러 곳이 각자 들고 있다.
 *                값이 같든 다르든 실패다(§3-X ③ 「씬과 폴백이 같은 형상 계수를 각자 갖고 있을 가능성」,
 *                A-10 「육안 구별 불가」). 실측: 4종이 걸리고 그중 3종은 **값까지 서로 다르다.**
 * B2 값 복제     GLSL 스칼라 상수(`const float`·`const int`)의 **손으로 적은 값**이
 *                이 씬이 import 하는 모델 모듈의 이름 붙은 상수 값과 같다 → 주입하지 않고 베꼈다.
 * B3 주입 0건    **이름 붙은 GLSL 상수를 선언해 놓고** `${}` 주입이 한 번도 없는 셰이더
 *                → 상수를 전부 손으로 적었다는 뜻이다.
 *                🔴 「void main 이 있으면 무조건」으로 잡았더니 3건이 나왔고 **전부 오탐**이었다
 *                (`FULLSCREEN_VS` 통과용 정점 셰이더 · `ION_PARTICLE_FS`/`ION_PROFILE_FS` 색만 칠하는
 *                조각 셰이더 — 주입할 상수가 애초에 없다). 조건에 「상수 선언이 있을 것」을 더해 좁혔다.
 *
 * 🔴 **규칙은 실측으로 좁혔다(규율 2 · check-fallback-purity 와 같은 방식).** 후보 두 가지를 먼저 계측했다:
 *   · 「GLSL 손글씨 숫자가 모델·폴백의 **아무 TS 숫자 리터럴**과 같으면 실패」 → **191건**.
 *     표본이 전부 배치·색이었다(`0.85`·`0.05`·`0.9` 가 폴백의 `globalAlpha`·여백과 우연히 같을 뿐).
 *     **채택하지 않았다.**
 *   · 「GLSL 손글씨 숫자가 import 한 모델 모듈의 **이름 붙은 상수** 값과 같으면 실패」 → **25건**.
 *     표본 6건을 원문 대조한 결과 **전부 오탐**이었다 — `bandMask(c.y, 0.0, 0.20)`(화살표 글리프)이
 *     `SUSCEPTOR_Y = 0.20` 과, `vec3(0.62,0.66,0.72)`(웨이퍼 색)이 `SHEATH_BIAS_FLOOR = 0.62` 와
 *     값만 같았다. §3-X 가 「우연히 같은 수」라고 부른 그 계열이다. **채택하지 않았다.**
 *   그래서 **판정 대상을 「GLSL 상수 선언」으로 좁혔다.** 오탐이 쏟아지면 진짜를 못 가린다.
 *
 * 🔴 허용 숫자: 0 · 1 · 2 · 0.5 뿐이다(`check-sources.mjs:186 ALLOWED_NUMBERS` 관례).
 *    **`100` 은 일부러 뺐다.** §3-X 「관찰」이 「100 이 유일하게 허용된 큰 리터럴이라 모든 환산이
 *    100 으로 조립된다 — 이 프로젝트에서 이 클래스가 반복 발생하는 뿌리다」라고 짚었다.
 *    GLSL 쪽에서는 그 뿌리를 처음부터 허용하지 않는다.
 * ════════════════════════════════════════════════════════════ */

/** GLSL 에서 판정하지 않는 자명한 값. 🔴 100 은 여기 없다(위 주석 참조). */
const ALLOWED_NUMBERS = new Set([0, 1, 2, 0.5]);

/**
 * 🔴 명시적 면제. 항목마다 `reason` 이 있어야 하고(B4 위생), 위반이 사라지면 썩은 항목으로 실패한다.
 * 형식: `'<파일 basename>:<값>': { rule, reason }`
 */
const ALLOW = {};

/* ---------- 파일 수집 ---------- */
function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** GLSL 로 보이는 템플릿인가 — **내용의 문법 표지**로 판정한다(파일명·변수명에 기대지 않는다). */
const GLSL_MARK = /(^|\n)\s*(?:precision\s+(?:highp|mediump|lowp)|uniform\s+\w+|varying\s+\w+|attribute\s+\w+|out\s+vec4|in\s+vec[234]|void\s+main\s*\(|const\s+(?:float|int|vec[234])\s)/;

/** GLSL 주석과 전처리기 지시자를 지운다(길이를 보존해 위치를 유지한다). */
function stripGlslNoise(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let atLineStart = true;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && text[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : ' '; i++; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (atLineStart && c === '#') { while (i < n && text[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === ' ' || c === '\t') { out += c; i++; continue; }
    atLineStart = c === '\n';
    out += c; i++;
  }
  return out;
}

/** GLSL 숫자 리터럴. 앞뒤가 식별자 문자면 잡지 않는다(`texture2D`·`vec3` 의 숫자를 배제). */
const GLSL_NUM = /(?<![A-Za-z0-9_.])(\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)(?![A-Za-z0-9_.])/g;

/** GLSL 상수 선언 — `const float NAME = <초기화식>;` (행 머리에서만 잡는다). */
const GLSL_CONST_DECL = /(?:^|\n)[ \t]*const[ \t]+(float|int|bool|vec2|vec3|vec4|mat2|mat3|mat4)[ \t]+([A-Za-z_]\w*)[ \t]*=([^;]*);/g;

const files = existsSync(ROOT) ? walk(ROOT).sort() : [];

/* ---------- 수집 ---------- */
/** 파일별: 이름 붙은 숫자 상수 (UPPER_SNAKE). 값 → [{name, line}] */
const namedConsts = new Map();   // rel → Map(값문자열 → [{name, line}])
/** 씬별 GLSL 손글씨 리터럴(계측 전용) */
const glslLits = [];             // {file, line, value, raw}
/** 씬별 GLSL 상수 선언(판정 대상) */
const glslDecls = [];            // {file, line, type, name, init, nums, scalar}
/** 파일별 import 한 모델 모듈(상대경로 basename) */
const modelImports = new Map();  // rel → Set(모델 파일 rel)
let glslTemplates = 0;
let injections = 0;
const b3 = [];

for (const abs of files) {
  const rel = relative(APP, abs);
  const src = readFileSync(abs, 'utf8');
  const lineAt = lineFinder(src);
  const toks = tokenize(src);

  /* ① 이름 붙은 숫자 상수 */
  const scope = new Map();
  const all = constDeclarations(toks);
  for (const d of all) if (!scope.has(d.name)) scope.set(d.name, d.init);
  const memo = new Map();
  const resolve = (name, depth) => {
    if (memo.has(name)) return memo.get(name);
    if (!scope.has(name)) return null;
    memo.set(name, null);
    const v = evalNumeric(scope.get(name), resolve, depth);
    memo.set(name, v);
    return v;
  };
  const byVal = new Map();
  for (const d of all) {
    if (!isUpperSnake(d.name)) continue;
    // 🔴 객체·배열·함수는 스칼라 상수가 아니다. 첫 토큰으로 걸러낸다.
    const first = d.init[0];
    if (!first) continue;
    if (first.type === 'punct' && (first.value === '[' || first.value === '{')) continue;
    const v = evalNumeric(d.init, resolve, 0);
    if (v === null || !Number.isFinite(v)) continue;
    const k = String(v);
    if (!byVal.has(k)) byVal.set(k, []);
    byVal.get(k).push({ name: d.name, line: lineAt(d.nameTok.start) });
  }
  // 객체 리터럴 안의 이름 붙은 필드(`export const PLASMA_GEOMETRY = { WAFER_Y: 0.34, ... }`)도 상수다.
  for (let i = 0; i < toks.length - 2; i++) {
    const a = toks[i]; const b = toks[i + 1]; const c = toks[i + 2];
    if (a.type !== 'ident' || !isUpperSnake(a.value)) continue;
    if (!(b.type === 'punct' && b.value === ':')) continue;
    let k = i + 2; let sign = 1;
    if (c.type === 'punct' && (c.value === '-' || c.value === '+')) { if (c.value === '-') sign = -1; k++; }
    const numTok = toks[k];
    if (!numTok || numTok.type !== 'num') continue;
    const v = numValue(numTok) * sign;
    if (!Number.isFinite(v)) continue;
    const key = String(v);
    if (!byVal.has(key)) byVal.set(key, []);
    byVal.get(key).push({ name: a.value, line: lineAt(a.start) });
  }
  namedConsts.set(rel, byVal);

  /* ② 모델 모듈 import */
  const mods = new Set();
  for (const m of src.matchAll(/from\s*'([^']*models\/[\w.]+)'/g)) {
    const base = basename(m[1]);
    mods.add(base.endsWith('.ts') ? base : `${base}.ts`);
  }
  modelImports.set(rel, mods);

  /* ③ GLSL 손글씨 리터럴 */
  for (const t of toks) {
    if (t.type !== 'tpl') continue;
    const whole = t.parts.filter((p) => p.kind === 'chunk').map((p) => p.text).join('\n');
    if (!GLSL_MARK.test(whole)) continue;
    glslTemplates++;
    const nInject = t.parts.filter((p) => p.kind === 'expr').length;
    injections += nInject;
    // 🔴 B3 판정은 아래 「상수 선언이 있는가」까지 본 뒤에 한다. 여기서는 후보만 담아 둔다.
    const tplStartLine = lineAt(t.start);
    const declsBefore = glslDecls.length;

    for (const p of t.parts) {
      if (p.kind !== 'chunk') continue;
      const clean = stripGlslNoise(p.text);
      // 계측용 — 손글씨 숫자 전체(판정에는 쓰지 않는다. 위 「실측으로 좁혔다」 참조).
      for (const m of clean.matchAll(GLSL_NUM)) {
        const v = Number(m[1]);
        if (Number.isFinite(v)) glslLits.push({ file: rel, line: lineAt(p.start + m.index), value: v, raw: m[1] });
      }
      // 판정용 — **이름 붙은 GLSL 상수 선언**만.
      for (const m of clean.matchAll(GLSL_CONST_DECL)) {
        const initText = m[3];
        const nums = [...initText.matchAll(GLSL_NUM)].map((x) => Number(x[1])).filter(Number.isFinite);
        glslDecls.push({
          file: rel,
          line: lineAt(p.start + m.index + 1),
          type: m[1],
          name: m[2],
          init: initText.trim(),
          nums,
          scalar: m[1] === 'float' || m[1] === 'int',
        });
      }
    }
    // 상수를 이름 붙여 선언해 놓고 주입은 0회 — 전부 손으로 적었다는 뜻이다.
    if (nInject === 0 && glslDecls.length > declsBefore) b3.push(`${rel}:${tplStartLine}`);
  }
}

/* ---------- 판정 ---------- */
const errors = [];
const counts = { B1: 0, B2: 0, B3: 0, B4: 0 };
const usedAllow = new Set();

/** 이 씬이 대조해야 할 TS 파일 목록 — import 한 모델 모듈 · Canvas2D 폴백 · 자기 자신. */
function peersOf(rel) {
  const out = [];
  const mods = modelImports.get(rel) ?? new Set();
  for (const other of namedConsts.keys()) {
    if (other === rel) { out.push({ rel: other, why: '같은 파일' }); continue; }
    if (mods.has(basename(other))) { out.push({ rel: other, why: 'import 한 모델 모듈' }); continue; }
    if (/fallback2d\.ts$/.test(other)) out.push({ rel: other, why: 'Canvas2D 폴백' });
  }
  return out;
}

/* B1 용 전역 이름 索引 — viz 안의 **TS 이름 붙은 상수 + 모든 씬의 GLSL 상수**를 한 표에 넣는다.
   씬끼리의 충돌(`SUBSTRATE_COLOR` 3파일 · 값 전부 다름)이 실제로 여기서 잡힌다. */
const nameIndex = new Map();
for (const [rel, byVal] of namedConsts) {
  for (const arr of byVal.values()) {
    for (const c of arr) {
      if (!nameIndex.has(c.name)) nameIndex.set(c.name, []);
      nameIndex.get(c.name).push({ rel, line: c.line, kind: 'TS' });
    }
  }
}
for (const g of glslDecls) {
  if (!nameIndex.has(g.name)) nameIndex.set(g.name, []);
  nameIndex.get(g.name).push({ rel: g.file, line: g.line, kind: 'GLSL', init: g.init });
}

let scalarDecls = 0;
for (const g of glslDecls) {
  if (g.scalar) scalarDecls++;
  const peers = peersOf(g.file);
  const allowKey = `${basename(g.file)}:${g.name}`;

  /* B1 — 이름 충돌 */
  const nameHits = (nameIndex.get(g.name) ?? [])
    .filter((c) => !(c.rel === g.file && c.line === g.line))
    .map((c) => `[${c.kind}] ${c.rel}:${c.line}${c.init ? ` = ${c.init}` : ''}`);
  if (nameHits.length > 0) {
    if (ALLOW[allowKey]) { usedAllow.add(allowKey); } else {
      counts.B1++;
      errors.push(
        `[B1] ${g.file}:${g.line} GLSL 상수 '${g.name}' 와 **같은 이름의 상수**가 viz 안 다른 곳에 있습니다:\n`
        + nameHits.slice(0, 4).map((h) => `        · ${h}`).join('\n')
        + '\n        → 같은 이름을 여러 곳이 각자 들고 있습니다. TS 를 정본으로 두고 `${glslFloat(X)}` 로 주입하세요'
        + '(값까지 다르면 어느 화면이 맞는지 아무도 모릅니다 — §3-X A-10 「육안 구별 불가」).',
      );
    }
    continue;                                   // 같은 선언을 B2 로 두 번 보고하지 않는다
  }

  /* B2 — 스칼라 상수의 손글씨 값이 import 한 모델 모듈의 이름 붙은 상수와 같다 */
  if (!g.scalar) continue;
  if (g.nums.length !== 1) continue;            // `A * B` 같은 조립식은 값이 하나가 아니다
  const v = g.nums[0];
  if (ALLOWED_NUMBERS.has(v)) continue;
  const valHits = [];
  for (const p of peers) {
    if (p.why !== 'import 한 모델 모듈') continue;
    for (const c of namedConsts.get(p.rel)?.get(String(v)) ?? []) valHits.push(`${p.rel}:${c.line} ${c.name} = ${v}`);
  }
  if (valHits.length === 0) continue;
  if (ALLOW[allowKey]) { usedAllow.add(allowKey); continue; }
  counts.B2++;
  errors.push(
    `[B2] ${g.file}:${g.line} GLSL 상수 '${g.name} = ${g.init}' 의 값이 **import 한 모델 모듈의 상수**와 같습니다:\n`
    + valHits.slice(0, 4).map((h) => `        · ${h}`).join('\n')
    + '\n        → 주입되지 않고 복제됐습니다. `${glslFloat(그 상수)}` 로 찍어 넣으세요'
    + '(정상 형태: src/viz/gl/textures.ts 의 texMeanGLSL · scenes/plasma.ts 의 glslFloat).',
  );
}

for (const where of b3) {
  counts.B3++;
  errors.push(`[B3] ${where} GLSL 상수를 선언해 놓고 \${} 주입이 한 번도 없습니다 — 전부 손으로 적었다는 뜻입니다.`);
}

/* B4 — 면제 위생. 사유 없는 면제도, 썩은 면제도 금지다. */
for (const [key, entry] of Object.entries(ALLOW)) {
  const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
  if (reason.length < 30) {
    errors.push(`[B4] 면제 '${key}' 에 사유(reason)가 없거나 너무 짧습니다 — 조용한 면제는 금지입니다.`);
    counts.B4++;
  } else if (!usedAllow.has(key) && !ROOT_ARG) {
    // 🔴 `--root` 스코프 실행(self-test 픽스처)에서는 썩음 판정을 하지 않는다.
    errors.push(`[B4] 면제 '${key}' 가 썩었습니다 — 지금은 위반이 아닙니다. ALLOW 에서 지우세요.`);
    counts.B4++;
  }
}

/* ---------- 출력 ---------- */
if (MEASURE) {
  console.log('■ check-scene-constants — 계측 모드(판정하지 않음)');
  console.log(`  스캔 파일 ${files.length}개 · GLSL 템플릿 ${glslTemplates}개 · 주입(\${}) ${injections}회`);
  console.log(`  GLSL 손글씨 숫자 리터럴 ${glslLits.length}개(서로 다른 값 ${new Set(glslLits.map((g) => g.value)).size}) · 비교 대상 「이름 붙은 상수」 ${[...namedConsts.values()].reduce((n, m) => n + [...m.values()].reduce((k, a) => k + a.length, 0), 0)}개`);
  console.log(`  GLSL 상수 선언 ${glslDecls.length}개(그중 스칼라 ${scalarDecls}개) ← **판정 대상**`);
  console.log(`  B1 이름 충돌          : ${counts.B1} 건`);
  console.log(`  B2 값 복제            : ${counts.B2} 건`);
  console.log(`  B3 주입 0건 템플릿    : ${counts.B3} 건`);
  console.log(`  B4 화이트리스트 위생  : ${counts.B4} 건`);
  for (const e of errors) console.log('     ! ' + e.split('\n')[0]);
  process.exit(0);
}

if (files.length === 0) {
  console.error(`❌ check-scene-constants: 스캔 대상이 없습니다 — ${relative(APP, ROOT)}`);
  process.exit(1);
}

if (errors.length) {
  console.error(`\n❌ check-scene-constants 실패 (${errors.length}건) — 셰이더가 상수를 손으로 들고 있습니다`);
  console.error(`   B1 이름충돌 ${counts.B1} · B2 값복제 ${counts.B2} · B3 주입0 ${counts.B3} · B4 화이트리스트 ${counts.B4}\n`);
  for (const e of errors) console.error('  ' + e);
  console.error('\n  고치는 법: 값을 모델 모듈(scenes/models/*.model.ts)에서 export 하고, 씬은 `${glslFloat(X)}` 로 GLSL 리터럴을 찍어 주입하세요.');
  process.exit(1);
}

console.log(
  `✅ check-scene-constants 통과 — 파일 ${files.length}개 · GLSL 템플릿 ${glslTemplates}개 · 주입 ${injections}회 · 손글씨 숫자 ${glslLits.length}개 · 판정 규칙 B1·B2·B3·B4`,
);
process.exit(0);
