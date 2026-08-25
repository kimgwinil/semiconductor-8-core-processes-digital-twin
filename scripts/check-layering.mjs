#!/usr/bin/env node
// check-layering.mjs — §3 계층 강제 + C3(공정 ID 분기 금지).
// 왜: F1(계산·UI·콘텐츠가 한 파일에 섞임) 재발 방지. models→ui/viz 역참조,
// viz→ui 참조, content 에 로직 파일이 섞이는 것을 기계로 막는다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');
const MODELS_DIR = path.join(SRC_DIR, 'models');
const VIZ_DIR = path.join(SRC_DIR, 'viz');
const UI_DIR = path.join(SRC_DIR, 'ui');
const CONTENT_DIR = path.join(SRC_DIR, 'content');

let hasError = false;
const errors = [];
function fail(msg) {
  hasError = true;
  errors.push(msg);
}

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

function stripCommentsAndStrings(code) {
  // 문자열 안의 import 흉내(주석 등) 오탐을 줄이려고 주석만 제거한다.
  // import 문 자체는 문자열 리터럴을 인자로 쓰므로 문자열은 남긴다.
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && code[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** import/require/동적 import 의 모듈 지정자를 전부 뽑는다. */
function extractSpecifiers(code) {
  const specs = [];
  const patterns = [
    /import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) specs.push(m[1]);
  }
  return specs;
}

/** 지정자를 파일 시스템 절대경로로 정규화한다(확장자 제거). '@/…' 는 src/ 로 매핑. */
function resolveSpecifier(fromFile, specifier) {
  let target;
  if (specifier.startsWith('@/')) {
    target = path.join(SRC_DIR, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    target = path.resolve(path.dirname(fromFile), specifier);
  } else {
    // 'react', 'react-dom', node: 내장 등 — 그대로 반환(패키지명 매칭용)
    return { kind: 'bare', value: specifier };
  }
  return { kind: 'path', value: target.replace(/\.(tsx?|jsx?)$/, '') };
}

function isUnder(targetPath, dirPath) {
  const rel = path.relative(dirPath, targetPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ---------- models/** : react·react-dom·ui·viz import 금지 + document/window 금지 ----------
const modelFiles = walk(MODELS_DIR, ['.ts', '.tsx']);
for (const file of modelFiles) {
  const rel = path.relative(APP_ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const stripped = stripCommentsAndStrings(raw);

  for (const spec of extractSpecifiers(stripped)) {
    if (spec === 'react' || spec === 'react-dom' || spec.startsWith('react/') || spec.startsWith('react-dom/')) {
      fail(`[layering] ${rel}: src/models 가 '${spec}' 를 import 합니다 (react 참조 금지).`);
      continue;
    }
    const resolved = resolveSpecifier(file, spec);
    if (resolved.kind !== 'path') continue;
    if (isUnder(resolved.value, UI_DIR)) {
      fail(`[layering] ${rel}: src/models 가 src/ui 를 import 합니다 ('${spec}').`);
    }
    if (isUnder(resolved.value, VIZ_DIR)) {
      fail(`[layering] ${rel}: src/models 가 src/viz 를 import 합니다 ('${spec}').`);
    }
  }

  // document / window 직접 참조 금지 (전역 식별자 사용)
  // 🔴 실제 DOM 사용 형태만 잡는다 — `window.` `document.` `window[` `typeof window`.
  //    설명문에 등장한 단어(예: 「ALD window」)를 위반으로 잡으면 검사기가 신뢰를 잃는다.
  // 🔴 마침표만으로는 부족하다 — 영문 산문의 "ALD window." 를 잡는다(P5 보고).
  //    실제 DOM 접근은 `window.foo` / `window[` 형태다. **점 뒤에 식별자가 와야** 한다.
  // 🔴 공백을 허용하면 영문 산문 "ALD window. it ..." 을 DOM 접근으로 오인한다(P5 보고).
  //    실제 코드는 `window.foo` 처럼 **공백 없이** 붙여 쓴다. 공백판은 산문으로 본다.
  const domRegex = /\b(document|window)\.[A-Za-z_$]|\b(document|window)\[|\btypeof\s+(document|window)\b/g;
  let dm;
  while ((dm = domRegex.exec(stripped))) {
    // 'ownerDocument', '.window' 같은 프로퍼티 접근은 앞이 '.' 이면 제외
    const before = stripped[dm.index - 1];
    if (before === '.') continue;
    let line = 1;
    for (let k = 0; k < dm.index; k++) if (stripped[k] === '\n') line++;
    fail(`[layering] ${rel}:${line}: src/models 에서 '${dm[1] ?? dm[2] ?? dm[3]}' 를 참조합니다(DOM 금지).`);
  }
}

// ---------- viz/** : ui import 금지 ----------
const vizFiles = walk(VIZ_DIR, ['.ts', '.tsx']);
for (const file of vizFiles) {
  const rel = path.relative(APP_ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const stripped = stripCommentsAndStrings(raw);

  for (const spec of extractSpecifiers(stripped)) {
    const resolved = resolveSpecifier(file, spec);
    if (resolved.kind !== 'path') continue;
    if (isUnder(resolved.value, UI_DIR)) {
      fail(`[layering] ${rel}: src/viz 가 src/ui 를 import 합니다 ('${spec}').`);
    }
  }
}

// ---------- content/** : loader.ts·catalog.ts·types.ts 외 .ts 로직 파일 금지 ----------
const ALLOWED_CONTENT_TS = new Set(['loader.ts', 'catalog.ts', 'types.ts']);
const contentTsFiles = walk(CONTENT_DIR, ['.ts', '.tsx']);
for (const file of contentTsFiles) {
  const rel = path.relative(APP_ROOT, file);
  if (!ALLOWED_CONTENT_TS.has(path.basename(file))) {
    fail(`[layering] ${rel}: src/content 에는 loader.ts·catalog.ts·types.ts 외 .ts 파일이 있으면 안 됩니다.`);
  }
}

// ---------- C3: processId === '...' / == '...' 분기 금지 (src/** 전체) ----------
const allSrcFiles = walk(SRC_DIR, ['.ts', '.tsx']);
const c3Regex = /\bprocessId\s*={2,3}\s*['"][^'"]+['"]/g;
for (const file of allSrcFiles) {
  const rel = path.relative(APP_ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const stripped = stripCommentsAndStrings(raw);
  let m;
  while ((m = c3Regex.exec(stripped))) {
    let line = 1;
    for (let k = 0; k < m.index; k++) if (stripped[k] === '\n') line++;
    const content = raw.split('\n')[line - 1]?.trim() ?? '';
    fail(`[C3] ${rel}:${line}: processId 문자열 분기 금지 — ${content}`);
  }
}

// ---------- 결과 ----------
if (hasError) {
  console.error(`\n❌ check-layering 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-layering 통과 — models ${modelFiles.length}개 · viz ${vizFiles.length}개 · content .ts ${contentTsFiles.length}개 · 전체 스캔 ${allSrcFiles.length}개`,
);
process.exit(0);
