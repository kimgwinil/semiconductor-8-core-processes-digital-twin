#!/usr/bin/env node
// check-catalog.mjs — §11-1. catalog.json 스키마 검증 + C1(공정 ID 리터럴 산재 금지).
// 왜: 공정 개수·ID 는 카탈로그가 유일한 정본이어야 후공정 2단계가 "카탈로그 1행
// 추가"만으로 끝난다(§11-2). 소스에 리터럴이 박히면 그 전제가 깨진다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');
const CATALOG_FILE = path.join(SRC_DIR, 'content/catalog.json');

let hasError = false;
const errors = [];
function fail(msg) {
  hasError = true;
  errors.push(msg);
}

if (!existsSync(CATALOG_FILE)) {
  console.error(`❌ ${path.relative(APP_ROOT, CATALOG_FILE)} 가 없습니다.`);
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
} catch (e) {
  console.error(`❌ catalog.json 파싱 실패: ${e.message}`);
  process.exit(1);
}

const sectionOrder = Array.isArray(catalog.sectionOrder) ? catalog.sectionOrder : [];
const sectionOrderSet = new Set(sectionOrder);
const processes = catalog.processes ?? {};
const processIds = Object.keys(processes);
const tracks = Array.isArray(catalog.tracks) ? catalog.tracks : [];

// ---------- 스키마 검증 ----------

// tracks[].processes 의 모든 ID 가 processes 에 존재
for (const track of tracks) {
  for (const pid of track.processes ?? []) {
    if (!(pid in processes)) {
      fail(`트랙 '${track.id}' 가 존재하지 않는 공정 ID '${pid}' 를 참조합니다.`);
    }
  }
}

// order 중복 없음 — 트랙 order 는 트랙끼리, 공정 order 는 공정끼리 유일해야 한다.
const trackOrders = tracks.map((t) => t.order);
const dupTrackOrders = trackOrders.filter((o, i) => trackOrders.indexOf(o) !== i);
if (dupTrackOrders.length > 0) {
  fail(`트랙 order 중복: ${[...new Set(dupTrackOrders)].join(', ')}`);
}

const processOrders = processIds.map((pid) => processes[pid].order);
const dupProcessOrders = processOrders.filter((o, i) => processOrders.indexOf(o) !== i);
if (dupProcessOrders.length > 0) {
  fail(`공정 order 중복: ${[...new Set(dupProcessOrders)].join(', ')}`);
}

// sections 가 sectionOrder 의 부분집합
for (const pid of processIds) {
  const sections = processes[pid].sections ?? [];
  for (const s of sections) {
    if (!sectionOrderSet.has(s)) {
      fail(`공정 '${pid}' 의 절 '${s}' 가 sectionOrder 에 없습니다.`);
    }
  }
}

// ---------- C1: 소스에 공정 ID 문자열 리터럴이 3개 이상 박히면 위반 ----------
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

const EXCLUDED_C1 = new Set([path.join(SRC_DIR, 'content/catalog.ts')]);
const tsFiles = walk(SRC_DIR, ['.ts', '.tsx']).filter((f) => !EXCLUDED_C1.has(f));

if (processIds.length > 0) {
  const escaped = processIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const idAlt = escaped.join('|');
  const literalRegex = new RegExp(`(['"\`])(${idAlt})\\1`, 'g');

  for (const file of tsFiles) {
    const rel = path.relative(APP_ROOT, file);
    const text = readFileSync(file, 'utf8');
    const matches = [...text.matchAll(literalRegex)];
    // 🔴 「서로 다른」 공정 ID 가 3종 이상 나올 때만 위반이다.
    //    같은 ID 가 여러 번 나오는 것은 공정별 모듈(예: physics/oxidation/rules.ts 의 processId 태그)이며
    //    카탈로그를 코드에 복제한 것이 아니다. 총 등장 횟수로 세면 정상 모듈이 걸린다.
    const distinct = [...new Set(matches.map((m) => m[2]))];
    if (distinct.length >= 3) {
      fail(
        `[C1] ${rel}: 서로 다른 카탈로그 공정 ID 가 ${distinct.length}종 등장합니다 (${distinct.join(', ')}). 카탈로그를 순회하도록 고치세요.`,
      );
    }
  }
}

// ---------- 결과 ----------
if (hasError) {
  console.error(`\n❌ check-catalog 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-catalog 통과 — 트랙 ${tracks.length}개, 공정 ${processIds.length}개, 절 ${sectionOrder.length}종, 스캔한 .ts(x) ${tsFiles.length}개`,
);
process.exit(0);
