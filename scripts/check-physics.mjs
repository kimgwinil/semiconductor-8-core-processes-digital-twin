#!/usr/bin/env node
/**
 * 🔴 A14-1 (결정론) · A15 (물리 출력 100 % 문헌식) 정적 게이트.
 * CEO 지시 2026-08-20 — "입력에 대한 출력 값이 정확하게 계산되어 나와야 합니다"(README §3-9).
 *
 *  1. `src/models/physics/**` 에 `withSynthetic(` 이 있으면 A15 위반 → 차단.
 *  2. `src/models/**` 전체에 비결정 소스(Math.random·Date.now·new Date·performance.now)가 있으면 A14-1 위반 → 차단.
 *  3. `src/models/scoring/**` 의 `withSynthetic(` 은 notice 인자가 비어 있으면 A6-b 위반 → 차단.
 *  4. 물리층 파일이 스코어링층을 import 하면 층 역전 → 차단.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const MODELS = join(APP, 'src', 'models');

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

/** 주석과 문자열 리터럴을 지운 코드 본문. 주석 속 단어를 위반으로 잡지 않기 위해서다. */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += ' '; i++; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}


/**
 * 🔴 주석만 제거하고 문자열은 남긴다.
 *    A6-b 검사는 `withSynthetic(...)` 의 **4번째 인자(고지 문자열)** 를 봐야 하므로 문자열을 지울 수 없다.
 *    그런데 원문 그대로 훑으면 **주석에 적힌 `withSynthetic()`** 을 위반으로 잡는다(실제로 겪었다).
 */
function stripCommentsOnly(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i] ?? ''; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const NONDETERMINISTIC = [
  ['Math.random', /\bMath\s*\.\s*random\s*\(/],
  ['Date.now', /\bDate\s*\.\s*now\s*\(/],
  ['new Date', /\bnew\s+Date\s*\(/],
  ['performance.now', /\bperformance\s*\.\s*now\s*\(/],
  ['crypto.getRandomValues', /\bcrypto\s*\.\s*getRandomValues\s*\(/],
];

const violations = [];
const files = walk(MODELS);
let physicsFiles = 0;
let scoringFiles = 0;

for (const file of files) {
  const rel = relative(APP, file);
  const raw = readFileSync(file, 'utf8');
  const code = stripCommentsAndStrings(raw);
  const lines = code.split('\n');
  // 🔴 세그먼트 단위로 본다 — 'physics-experimental' 같은 이웃 디렉터리에 걸리지 않게.
  const segs = rel.split(/[\\/\\\\]/);
  const isPhysics = segs[0] === 'src' && segs[1] === 'models' && segs[2] === 'physics';
  const isScoring = segs[0] === 'src' && segs[1] === 'models' && segs[2] === 'scoring';
  if (isPhysics) physicsFiles++;
  if (isScoring) scoringFiles++;

  lines.forEach((line, idx) => {
    const ln = idx + 1;

    // 1. A15 — 물리층에 합성 계수 금지
    if (isPhysics && /\bwithSynthetic\s*\(/.test(line)) {
      violations.push(`[A15] ${rel}:${ln} 물리층에 합성 계수(withSynthetic)가 있다. 문헌식·문헌계수만 허용된다.`);
    }

    // 2. A14-1 — 비결정 소스 금지
    for (const [name, re] of NONDETERMINISTIC) {
      if (re.test(line)) {
        violations.push(`[A14-1] ${rel}:${ln} 계산 경로에 비결정 소스 ${name} 이 있다. 동일 입력 → 동일 출력이 깨진다.`);
      }
    }

    // 4. 층 역전 — 물리층이 스코어링층을 import 하면 안 된다
    if (isPhysics && /\bfrom\s+['"]?[^'"\n]*scoring/.test(line) && /import/.test(line)) {
      violations.push(`[A15] ${rel}:${ln} 물리층이 스코어링층을 import 한다. 의존 방향이 뒤집혔다.`);
    }
  });

  // 3. A6-b — withSynthetic 의 notice 인자가 비어 있는지 (원문에서 확인해야 문자열이 보인다)
  const synth = stripCommentsOnly(raw).matchAll(/withSynthetic\s*\(([^)]*)\)/g);
  for (const m of synth) {
    const args = m[1].split(',');
    const notice = (args[3] ?? '').trim();
    if (!notice || notice === "''" || notice === '""' || notice === '``') {
      violations.push(`[A6-b] ${rel} withSynthetic 에 고지(notice)가 비어 있다: ${m[0].slice(0, 80)}`);
    }
  }
}

console.log(`검사 대상: models .ts ${files.length}개 (물리층 ${physicsFiles} · 스코어링층 ${scoringFiles})`);

if (physicsFiles === 0) {
  console.log('⚠️  물리층 파일이 없다. 모델 구현 전 단계로 보고 통과시킨다.');
}

if (violations.length > 0) {
  console.error(`\n❌ ${violations.length}건 위반\n`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('✅ A14-1(결정론) · A15(물리층 순수성) 통과');
