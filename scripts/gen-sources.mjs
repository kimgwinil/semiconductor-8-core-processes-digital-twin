#!/usr/bin/env node
// gen-sources.mjs — refs/의 두 서지 원장(전공정·후공정)을 파싱해
// src/models/sources.generated.ts 를 기계 생성한다.
// 왜: sourceId·골든값(R번호)의 유일한 정본은 원장이다. 손으로 추가하면 CI로
// 못 잡는 유령 출처가 생긴다(설계서 §9-1). 원장의 마크다운 표 "첫 칼럼"만 본다 —
// 본문 산문에 등장하는 S/R 번호는 표가 아니므로 잡지 않는다.
// 실패 조건: 두 원장에 같은 S번호(또는 R번호)가 동시에 등장하면 종료코드 1.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REFS_DIR = path.resolve(__dirname, '../../../../refs');

const FRONTEND_LEDGER = path.join(REFS_DIR, '공개출처_반도체전공정_서지목록.md');
const BACKEND_LEDGER = path.join(REFS_DIR, '공개출처_반도체후공정_서지목록.md');
const OUT_FILE = path.join(APP_ROOT, 'src/models/sources.generated.ts');

/** 마크다운 표의 "첫 칼럼"에서만 S번호·R번호를 추출한다. 산문은 보지 않는다. */
function parseLedger(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const sources = new Set();
  const goldens = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    // 구분선 행(|---|---|, |:--|--:| 등)은 건너뛴다.
    if (/^\|[\s|:-]+\|$/.test(line)) continue;

    const cells = line.split('|');
    // line 이 '|' 로 시작하므로 cells[0] 은 빈 문자열, cells[1] 이 실제 첫 칸.
    const firstCell = cells[1] ?? '';

    // 장식(**, ⭐, ⟳, 🆕, ❌, ⛔, ⚠️, ⏸ 등)이 붙어 있어도 S\d+(-\d+)? / R\d+ 토큰만 뽑는다.
    const sMatch = firstCell.match(/\bS\d+(?:-\d+)?\b/);
    if (sMatch) sources.add(sMatch[0]);

    const rMatch = firstCell.match(/\bR\d+\b/);
    if (rMatch) goldens.add(rMatch[0]);
  }

  return { sources, goldens };
}

function naturalKey(id) {
  // 'S9', 'S9-2', 'S100' 을 숫자 크기 순으로 정렬하기 위한 키.
  const m = id.match(/^([A-Z]+)(\d+)(?:-(\d+))?$/);
  if (!m) return [id, 0, 0];
  return [m[1], Number(m[2]), m[3] ? Number(m[3]) : 0];
}

function sortIds(set) {
  return [...set].sort((a, b) => {
    const ka = naturalKey(a);
    const kb = naturalKey(b);
    if (ka[0] !== kb[0]) return ka[0] < kb[0] ? -1 : 1;
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] - kb[2];
  });
}

let frontend = { sources: new Set(), goldens: new Set() };
let backend = { sources: new Set(), goldens: new Set() };
let frontendMissing = false;
let backendMissing = false;

if (existsSync(BACKEND_LEDGER)) {
  backend = parseLedger(BACKEND_LEDGER);
} else {
  backendMissing = true;
  console.warn(`⚠️  후공정 원장을 찾지 못했습니다: ${BACKEND_LEDGER}`);
}

if (existsSync(FRONTEND_LEDGER)) {
  frontend = parseLedger(FRONTEND_LEDGER);
} else {
  frontendMissing = true;
  console.warn(`⚠️  전공정 원장을 찾지 못했습니다(경고만, 실패 아님): ${FRONTEND_LEDGER}`);
  console.warn('   → 후공정 원장만으로 sources.generated.ts 를 생성합니다.');
}

if (backendMissing && frontendMissing) {
  console.error('❌ 두 원장을 모두 찾지 못했습니다. 생성을 중단합니다.');
  process.exit(1);
}

// 🔴 채번 충돌 검사 — 두 원장에 같은 S번호(또는 R번호)가 있으면 실패.
const sourceOverlap = [...frontend.sources].filter((id) => backend.sources.has(id));
const goldenOverlap = [...frontend.goldens].filter((id) => backend.goldens.has(id));

if (sourceOverlap.length > 0 || goldenOverlap.length > 0) {
  console.error('❌ 전공정·후공정 원장에 번호 충돌이 있습니다.');
  if (sourceOverlap.length > 0) {
    console.error(`   겹친 S번호: ${sortIds(new Set(sourceOverlap)).join(', ')}`);
  }
  if (goldenOverlap.length > 0) {
    console.error(`   겹친 R번호: ${sortIds(new Set(goldenOverlap)).join(', ')}`);
  }
  process.exit(1);
}

const allSources = sortIds(new Set([...backend.sources, ...frontend.sources]));
const allGoldens = sortIds(new Set([...backend.goldens, ...frontend.goldens]));
const backendSources = sortIds(backend.sources);
const frontendSources = sortIds(frontend.sources);

function tsArray(ids) {
  return `[${ids.map((id) => `'${id}'`).join(', ')}]`;
}

const output = `// 자동 생성 — 손으로 고치지 마라. \`npm run gen:sources\` 로 재생성한다.
// 원본: refs/공개출처_반도체전공정_서지목록.md · refs/공개출처_반도체후공정_서지목록.md
export const SOURCE_IDS = ${tsArray(allSources)} as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export const GOLDEN_IDS = ${tsArray(allGoldens)} as const;
export type GoldenId = (typeof GOLDEN_IDS)[number];
export const SOURCE_LEDGERS = { backend: ${tsArray(backendSources)}, frontend: ${tsArray(frontendSources)} } as const;
`;

let shouldWrite = true;
if (existsSync(OUT_FILE)) {
  const existing = readFileSync(OUT_FILE, 'utf8');
  if (existing === output) shouldWrite = false;
}

if (shouldWrite) {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, output, 'utf8');
  console.log(`✅ 생성됨: ${path.relative(APP_ROOT, OUT_FILE)}`);
} else {
  console.log('ℹ️  내용이 같아 다시 쓰지 않았습니다.');
}

console.log(
  `후공정 S ${backend.sources.size}건 R ${backend.goldens.size}건 / ` +
    `전공정 S ${frontend.sources.size}건 R ${frontend.goldens.size}건 ` +
    `(전체 유일 S ${allSources.length}건 · R ${allGoldens.length}건)`,
);

process.exit(0);
