#!/usr/bin/env node
// check-sources.mjs — A6. src/models/**/*.ts 의 (a) sourceId 리터럴이 전부
// 원장(SOURCE_IDS)에 있는지, (b) 매직넘버(출처 없는 상수)가 없는지 검사한다.
// 또한 콘텐츠 JSON(src/content/**/*.json, catalog.json 제외)의 formula/figure
// 블록에 sourceId 가 있는지 검사한다.
// 왜: 「근거 없는 수치는 제품에 넣지 않는다」(원장 규칙 1)를 CI 로 강제하는 유일한 지점.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');
const GEN_FILE = path.join(APP_ROOT, 'src/models/sources.generated.ts');

const INFRA_FILES = new Set(['sources.generated.ts', 'contract.ts', 'registry.ts', 'direction.ts']);

let hasError = false;
const errors = [];

/**
 * 🔴 「근거 미확정」을 뜻하는 예약 sourceId.
 * 주제가 가까운 출처를 갖다 붙이는 것보다 모른다고 적는 편이 옳으므로 실패시키지 않는다.
 * 다만 **조용히 통과시키지 않는다** — 몇 건이 남아 있는지 반드시 경고로 센다.
 */
const PENDING_SOURCE_ID = 'PENDING';
const pendingHits = [];
const pendingIds = new Set();

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
    if (st.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

// ---------- SOURCE_IDS 로드 (sources.generated.ts 를 텍스트로 파싱) ----------
if (!existsSync(GEN_FILE)) {
  console.error(`❌ ${path.relative(APP_ROOT, GEN_FILE)} 가 없습니다. 먼저 \`npm run gen:sources\` 를 실행하세요.`);
  process.exit(1);
}
const genText = readFileSync(GEN_FILE, 'utf8');
const idsMatch = genText.match(/export const SOURCE_IDS = \[([\s\S]*?)\] as const;/);
if (!idsMatch) {
  console.error('❌ sources.generated.ts 에서 SOURCE_IDS 를 파싱하지 못했습니다.');
  process.exit(1);
}
const SOURCE_IDS = new Set([...idsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

// ---------- 코드 파서: 주석/문자열 제거 (magic-number 용) 또는 주석만 제거 (sourceId 용) ----------
function scanCode(code, { keepStrings }) {
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

    if (c === '\'' || c === '"') {
      const quote = c;
      let literal = c;
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') {
          literal += code[i] + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        literal += code[i];
        i++;
      }
      if (i < n) {
        literal += code[i];
        i++;
      }
      out += keepStrings ? literal : literal.replace(/[^\n]/g, ' ');
      continue;
    }

    if (c === '`') {
      let depth = 0;
      let literal = c;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          literal += code[i] + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (depth === 0 && code[i] === '`') {
          literal += code[i];
          i++;
          break;
        }
        if (depth === 0 && code[i] === '$' && code[i + 1] === '{') {
          literal += '${';
          i += 2;
          depth = 1;
          continue;
        }
        if (depth > 0) {
          if (code[i] === '{') depth++;
          if (code[i] === '}') depth--;
          literal += code[i];
          i++;
          continue;
        }
        literal += code[i];
        i++;
      }
      out += keepStrings ? literal : literal.replace(/[^\n]/g, ' ');
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let k = 0; k < index; k++) {
    if (text[k] === '\n') line++;
  }
  return line;
}

// ---------- (a) sourceId 리터럴 검사 (모든 src/models/**/*.ts) ----------
const modelFiles = walk(path.join(SRC_DIR, 'models'), ['.ts', '.tsx']);

for (const file of modelFiles) {
  const rel = path.relative(APP_ROOT, file);
  const raw = readFileSync(file, 'utf8');
  const commentsStripped = scanCode(raw, { keepStrings: true }); // 주석만 제거, 문자열은 유지

  const idRegex = /(['"])(S\d+(?:-\d+)?)\1/g;
  let m;
  while ((m = idRegex.exec(commentsStripped))) {
    const id = m[2];
    if (!SOURCE_IDS.has(id)) {
      const line = lineOf(commentsStripped, m.index);
      const content = raw.split('\n')[line - 1]?.trim() ?? '';
      fail(`[sourceId] ${rel}:${line}: 원장에 없는 출처 '${id}' — ${content}`);
    }
  }
}

// ---------- (b) 매직넘버 검사 (인프라 파일 제외) ----------
const ALLOWED_NUMBERS = new Set([0, 1, 2, -1, 0.5, 100]);
const NUMBER_REGEX = /(?<![\w$.])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w$])/g;

for (const file of modelFiles) {
  const basename = path.basename(file);
  if (INFRA_FILES.has(basename)) continue;

  const rel = path.relative(APP_ROOT, file);
  // labs 는 매직넘버 축 대신 check-labs.mjs 축으로 검사한다
  // 🔴 접두 일치 함정: 'src/models/labs' 가 'src/models/labs-old' 에도 걸린다. **세그먼트**로 본다.
  const segs = rel.split(/[\\/\\\\]/);
  const isLab = segs[0] === 'src' && segs[1] === 'models' && segs[2] === 'labs';
  const raw = readFileSync(file, 'utf8');
  const stripped = scanCode(raw, { keepStrings: false }); // 주석 + 문자열 제거

  // withSource(<숫자>, ...) 의 첫 인자 위치는 면제한다.
  const exemptRanges = [];
  const withSourceRegex = /\bwithSource\s*\(\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let wm;
  while ((wm = withSourceRegex.exec(stripped))) {
    const argStart = wm.index + wm[0].length - wm[1].length;
    exemptRanges.push([argStart, argStart + wm[1].length]);
  }

  let nm;
  while ((nm = NUMBER_REGEX.exec(stripped))) {
    const start = nm.index;
    const end = start + nm[0].length;

    const inExempt = exemptRanges.some(([s, e]) => start >= s && end <= e);
    if (inExempt) continue;

    // 배열 인덱스 문맥: 직전 non-space 가 '[', 직후 non-space 가 ']'
    let before = start - 1;
    while (before >= 0 && /\s/.test(stripped[before])) before--;
    let after = end;
    while (after < stripped.length && /\s/.test(stripped[after])) after++;
    if (stripped[before] === '[' && stripped[after] === ']') continue;

    const value = Number(nm[1]);
    if (ALLOWED_NUMBERS.has(value)) continue;

    const line = lineOf(stripped, start);
    const content = raw.split('\n')[line - 1]?.trim() ?? '';
    if (isLab) continue; // labs 는 check-labs.mjs 가 다른 축으로 검사한다
    fail(`[magic-number] ${rel}:${line}: 출처 없는 상수 '${nm[1]}' — ${content}`);
  }
}

// ---------- 콘텐츠 JSON: formula/figure 블록의 sourceId 필수 + 값 검증 ----------
function walkJson(node, onNode) {
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, onNode);
  } else if (node && typeof node === 'object') {
    onNode(node);
    for (const v of Object.values(node)) walkJson(v, onNode);
  }
}

const contentDir = path.join(SRC_DIR, 'content');
const contentJsonFiles = walk(contentDir, ['.json']).filter(
  (f) => path.basename(f) !== 'catalog.json',
);

for (const file of contentJsonFiles) {
  const rel = path.relative(APP_ROOT, file);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`[content-json] ${rel}: JSON 파싱 실패 — ${e.message}`);
    continue;
  }

  walkJson(data, (node) => {
    if (node.type === 'formula' || node.type === 'figure') {
      const sid = node.sourceId;
      if (!sid || typeof sid !== 'string' || sid.trim() === '') {
        fail(`[content-json] ${rel}: type:"${node.type}" 블록에 sourceId 가 없습니다.`);
      } else if (sid === PENDING_SOURCE_ID) {
        // 🔴 식·그림은 화면에 수치를 직접 내므로 「근거 미확정」으로 넘길 수 없다(원장 규칙 1).
        fail(`[content-json] ${rel}: type:"${node.type}" 블록에는 '${PENDING_SOURCE_ID}' 를 쓸 수 없습니다.`);
      } else if (!SOURCE_IDS.has(sid)) {
        fail(`[content-json] ${rel}: 원장에 없는 출처 '${sid}' (type:"${node.type}")`);
      }
    } else if (typeof node.sourceId === 'string' && node.sourceId.trim() !== '') {
      if (node.sourceId === PENDING_SOURCE_ID) {
        const id = node.id ?? '(id 없음)';
        pendingHits.push(`${rel}: ${id}`);
        pendingIds.add(id);
      } else if (!SOURCE_IDS.has(node.sourceId)) {
        fail(`[content-json] ${rel}: 원장에 없는 출처 '${node.sourceId}'`);
      }
    }
  });
}

// ---------- 결과 ----------
// 🔴 PENDING 은 실패가 아니지만 **미해결 부채**다. 조용히 통과시키지 않고 항상 개수를 낸다.
if (pendingHits.length > 0) {
  console.warn(
    `\n⚠️  근거 미확정('${PENDING_SOURCE_ID}') ${pendingHits.length}건 (문항 ${pendingIds.size}개 × 언어) — 원장에서 뒷받침 문헌을 찾아 S번호로 교체해야 합니다.`,
  );
  for (const h of pendingHits) console.warn('  ' + h);
}

if (hasError) {
  console.error(`\n❌ check-sources 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-sources 통과 — models .ts ${modelFiles.length}개, 콘텐츠 JSON ${contentJsonFiles.length}개, SOURCE_IDS ${SOURCE_IDS.size}건`
  + `, 근거 미확정 ${pendingHits.length}건(문항 ${pendingIds.size}개)`,
);
process.exit(0);
