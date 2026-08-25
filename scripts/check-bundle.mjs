#!/usr/bin/env node
// check-bundle.mjs — A9. 초기 청크(엔트리 + 정적 import 그래프) raw 바이트 합이
// 1,048,576 B 를 넘지 않는지 검사한다.
// 왜: F4(초기 JS 1.98 MB 단일 청크) 재발 방지. Vite manifest 가 있으면 정적
// import 그래프를 정확히 따라가고, 없으면 index.html 의 module/modulepreload
// 태그로 근사한다.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 🔴 A9 예산은 `lib/bundle-budget.mjs` 가 정본이다 — selftest-gates 의 초과 픽스처와 같은 수를
//    두 곳에 박지 않기 위한 것이다(check-constants R1·R3). 값 자체는 종전과 동일한 1048576 B.
import { JS_LIMIT } from './lib/bundle-budget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(APP_ROOT, 'dist');
const MANIFEST_FILE = path.join(DIST_DIR, '.vite/manifest.json');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

if (!existsSync(DIST_DIR)) {
  console.error(`❌ ${path.relative(APP_ROOT, DIST_DIR)} 가 없습니다. 먼저 빌드하세요 (\`npm run build\`).`);
  process.exit(1);
}

function fileSize(relToDist) {
  const full = path.join(DIST_DIR, relToDist);
  if (!existsSync(full)) return 0;
  return statSync(full).size;
}

function walkAll(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkAll(full));
    else out.push(full);
  }
  return out;
}

let initialJsFiles = new Set(); // dist 상대경로
let cssFiles = new Set();

if (existsSync(MANIFEST_FILE)) {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));

  // 엔트리(isEntry:true) 에서 시작해 정적 import 그래프(imports)만 따라간다.
  // dynamicImports 는 코드분할 경계이므로 초기 청크에 넣지 않는다.
  const entries = Object.entries(manifest).filter(([, v]) => v.isEntry);

  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    if (chunk.file) initialJsFiles.add(chunk.file);
    for (const cssFile of chunk.css ?? []) cssFiles.add(cssFile);
    for (const importKey of chunk.imports ?? []) visit(importKey);
    // assets(imgs 등)는 A9 초기 JS 계산 대상이 아니다.
  }

  for (const [key] of entries) visit(key);
} else if (existsSync(INDEX_FILE)) {
  console.warn('⚠️  .vite/manifest.json 이 없어 index.html 의 module/modulepreload 태그로 근사합니다.');
  const html = readFileSync(INDEX_FILE, 'utf8');

  const scriptRegex = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/g;
  const preloadRegex = /<link[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["'][^>]*>/g;
  const cssLinkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g;

  let m;
  while ((m = scriptRegex.exec(html))) initialJsFiles.add(m[1]);
  while ((m = preloadRegex.exec(html))) initialJsFiles.add(m[1]);
  while ((m = cssLinkRegex.exec(html))) cssFiles.add(m[1]);
} else {
  console.error('❌ dist/.vite/manifest.json 도 dist/index.html 도 없습니다. 빌드 산출물을 확인하세요.');
  process.exit(1);
}

function toRel(p) {
  // manifest 의 file 은 이미 dist 상대경로. index.html 의 src/href 는 base 를
  // 포함한 절대경로(/assets/...)일 수 있으므로 base 를 벗겨낸다.
  return p.replace(/^\//, '');
}

let jsTotal = 0;
const jsDetail = [];
for (const f of initialJsFiles) {
  const rel = toRel(f);
  const size = fileSize(rel);
  jsTotal += size;
  jsDetail.push([rel, size]);
}

let cssTotal = 0;
for (const f of cssFiles) {
  cssTotal += fileSize(toRel(f));
}

const distFiles = walkAll(DIST_DIR);
const distTotal = distFiles.reduce((n, f) => n + statSync(f).size, 0);

console.log('--- 초기 청크(정적 import 그래프) ---');
for (const [rel, size] of jsDetail.sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rel}: ${size.toLocaleString()} B`);
}
console.log(
  `초기 JS 합계 ${jsTotal.toLocaleString()} B / 상한 ${JS_LIMIT.toLocaleString()} B`,
);
console.log(`CSS 합계(참고) ${cssTotal.toLocaleString()} B`);
console.log(`dist 전체 크기(참고) ${distTotal.toLocaleString()} B (${distFiles.length}개 파일)`);

if (jsTotal > JS_LIMIT) {
  console.error(`\n❌ check-bundle 실패 — 초기 JS 합계가 상한을 ${(jsTotal - JS_LIMIT).toLocaleString()} B 초과했습니다.`);
  process.exit(1);
}

console.log('\n✅ check-bundle 통과');
process.exit(0);
