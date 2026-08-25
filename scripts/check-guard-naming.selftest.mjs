#!/usr/bin/env node
/**
 * check-guard-naming 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *위반이 없어서*인지 *못 봐서*인지는
 *    픽스처 없이는 증명되지 않는다. 이 프로젝트에서 픽스처가 게이트 오탐·미탐을 여러 번 잡았다.
 * 🔴 **주입은 `src/` 밖(임시 디렉터리)에서 한다.** 다른 담당이 `src/` 를 동시 편집 중이라
 *    위반 코드를 `src/` 에 넣으면 그쪽 게이트 측정을 오염시킨다(2026-08-21 실측 사고).
 *    파일은 매 실행마다 만들고 지우므로 저장소에 아무것도 남기지 않는다.
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-guard-naming.mjs');

function run(args) {
  try {
    const out = execFileSync('node', [GATE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
}

/** 임시 트리를 만들고 파일을 깐다. */
function tree(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'guardfix-'));
  for (const [name, body] of Object.entries(files)) {
    const p = path.join(dir, name);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

const CASES = [];
const add = (id, desc, expect, fn) => CASES.push({ id, desc, expect, fn });

/* ⓐ 깨끗한 트리 — 가드는 uiGuard, 인용은 withSource + 절·표 명시 → 통과해야 한다 */
add('ⓐ', '깨끗한 트리(가드=uiGuard · 인용=withSource+절인용)', 'PASS', () => {
  const d = tree({ 'clean.ts': `
/** 도금 셀 전류 상한 — 문헌 근거가 아니라 슬라이더가 넘어가지 못하게 그은 선이다. */
const PLATING_CURRENT_MAX_A = uiGuard(100 * TEN, 'A', '도금 셀 정류기의 상식적 상한');
/** CMP 압력 유효구간 — S204 Table 2.6 이 4–66 kPa 로 진술한다. */
const PRESSURE_MAX_KPA = withSource(66, 'kPa', 'S204');
` });
  const r = run(['--root', d, '--no-runtime']); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓑ 자백형 거짓 인용 주입 → G1 으로 실패해야 한다 */
add('ⓑ', "withSource(1000,'A','S212') 를 PLATING_CURRENT_MAX_A 이름으로 주입", 'FAIL', () => {
  const d = tree({ 'inject.ts': `
/** 도금 셀 전류 상한 — 도금 셀 상식. UI 안전장치. */
const PLATING_CURRENT_MAX_A = withSource(1000, 'A', 'S212');
` });
  const r = run(['--root', d, '--no-runtime']); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓒ 정당한 인용은 오탐되지 않아야 한다 */
add('ⓒ', '정당한 인용(FARADAY_CONSTANT · CF_INFINITE)이 오탐되지 않는다', 'PASS', () => {
  const d = tree({ 'cite.ts': `
/** Faraday 상수 — NIST CODATA 2022, 정확값. S212. */
export const FARADAY_CONSTANT = withSource(96485.33212, 'C/mol', 'S212');
/** 무한 시료 보정계수 = 4.5324 (= π/ln 2). S203 Table 1 · 원장 R169. */
export const CF_INFINITE = withSource(4.5324, '', 'S203');
` });
  const r = run(['--root', d, '--no-runtime']); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓓ 사유 없는 면제 → R4 로 실패해야 한다 */
add('ⓓ', '사유 없는 ALLOW 면제 등재', 'FAIL', () => {
  const d = tree({ 'inject.ts': `
/** 출력 상한 — UI 안전장치. */
const NORM_DELAY_MAX = withSource(1e30, '', 'S205');
` });
  const a = path.join(d, 'allow.json');
  writeFileSync(a, JSON.stringify([{ file: 'inject.ts', symbol: 'NORM_DELAY_MAX', reason: '' }]));
  const r = run(['--root', d, '--no-runtime', '--allow', a]); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓔ 사유가 **제대로 있는** 면제 → 통과해야 한다 (면제 경로가 실제로 동작하는가) */
add('ⓔ', '사유(S번호+절·표)를 갖춘 ALLOW 면제는 통과시킨다', 'PASS', () => {
  const d = tree({ 'inject.ts': `
/** 압력 상한 — 장비 상식. UI 안전장치. */
const PRESSURE_MAX_KPA = withSource(66, 'kPa', 'S204');
` });
  const a = path.join(d, 'allow.json');
  writeFileSync(a, JSON.stringify([{ file: 'inject.ts', symbol: 'PRESSURE_MAX_KPA', reason: 'S204 Table 2.6 이 4–66 kPa 로 진술한다' }]));
  const r = run(['--root', d, '--no-runtime', '--allow', a]); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓕ 고아 면제(매칭 선언 없음) → R4 로 실패해야 한다 */
add('ⓕ', '매칭되는 선언이 없는 낡은 ALLOW(고아 면제)', 'FAIL', () => {
  const d = tree({ 'clean.ts': `const X_MAX = uiGuard(1, 'A', '이유');\n` });
  const a = path.join(d, 'allow.json');
  writeFileSync(a, JSON.stringify([{ file: 'gone.ts', symbol: 'DELETED_MAX', reason: 'S204 Table 2.6' }]));
  const r = run(['--root', d, '--no-runtime', '--allow', a]); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓖ 🔴 부분문자열 함정 회귀 — `..._PER_MIN`(분당)의 MIN 은 최소값이 아니다 */
add('ⓖ', '부분문자열 함정: R165_MRR_NM_PER_MIN(분당 단위)을 범위선으로 오탐하지 않는다', 'PASS', () => {
  const d = tree({ 'unit.ts': `
/** R165 실측 제거율. */
export const R165_MRR_NM_PER_MIN = withSource(302.5, 'nm/min', 'S200');
/** 최소 신뢰수준. */
const MINIMUM_CONFIDENCE = withSource(60, '%', 'S54');
` });
  const r = run(['--root', d, '--no-runtime']); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓗ --strict 에서는 분류 미완(절·표 인용 없음)도 차단해야 한다 */
add('ⓗ', '--strict: 절·표 인용 없는 범위형 withSource 는 차단', 'FAIL', () => {
  const d = tree({ 'vague.ts': `
/** 압력 유효구간. */
const PRESSURE_MAX_KPA = withSource(66, 'kPa', 'S204');
` });
  const r = run(['--root', d, '--no-runtime', '--strict']); rmSync(d, { recursive: true, force: true }); return r;
});

/* ⓘ 🔴 **회귀 고정** — 사람이 손으로 찾아낸 28건(1차 6 · 2차 10 · 선행 12)을
 *     이름꼴 규칙이 **전부** 잡는지. 하나라도 놓치면 규칙이 약해진 것이다. */
add('ⓘ', '손으로 찾은 28건을 이름꼴 규칙이 전부 포착 + 반례 6종 오탐 없음', 'PASS', async () => {
  const { rangeSegments } = await import('./check-guard-naming.mjs');
  const CAUGHT = [
    'EA_MIN_EV','EA_MAX_EV','AF_MAX','JL_MAX_A_PER_UM','THICKNESS_MIN_NM','THICKNESS_MAX_NM',
    'SIGMA_CRIT_MAX_MPA','CURRENT_DENSITY_MAX','TEMP_MIN_K','TEMP_MAX_K','WIDTH_MIN_NM','WIDTH_MAX_NM',
    'LENGTH_MIN_UM','LENGTH_MAX_UM','RESISTIVITY_MAX','RESISTANCE_MAX_OHM',
    'PLATING_CURRENT_MAX_A','TIME_MAX_S','MOLAR_MASS_MIN','MOLAR_MASS_MAX','VALENCE_MAX','MASS_MAX_G',
    'PROBE_CURRENT_MIN_A','PROBE_CURRENT_MAX_A','VOLTAGE_MAX_V','SHEET_MAX','V_OVER_I_MAX','SPACING_MAX_CM',
  ];
  const NOT = ['R165_MRR_NM_PER_MIN','FARADAY_CONSTANT','CF_INFINITE','MINIMUM_CONFIDENCE','ELEMENTARY_CHARGE','CU_RHO0'];
  const missed = CAUGHT.filter((n) => rangeSegments(n).length === 0);
  const over = NOT.filter((n) => rangeSegments(n).length > 0);
  const bad = [...missed.map((n) => 'MISS ' + n), ...over.map((n) => 'OVER ' + n)];
  return { code: bad.length ? 1 : 0, out: bad.join(' | ') };
});

/* ⓙ 🔴 **회귀 고정 — 짝 선언 doc 공유.** 이 결함으로 실제 4건을 놓쳤다(2026-08-21).
 *     주석은 MIN 쪽에만 붙고 MAX 는 같은 주석의 지배를 받는다. 형제 선언에서 멈추면 절반을 놓친다. */
add('ⓙ', '짝 선언(주석은 MIN 쪽에만) 에서 MAX 도 잡는다 — 실제로 4건 놓쳤던 결함', 'FAIL', () => {
  const d = tree({ 'pair.ts': `
/** 회전수 유효범위 — S202·S200 이 실제로 돌린 35–80 rpm 에 여유를 준 UI 안전장치다. */
const RPM_MIN = withSource(0, 'rpm', 'S202');
const RPM_MAX = withSource(200, 'rpm', 'S202');
` });
  const r = run(['--root', d, '--no-runtime']);
  rmSync(d, { recursive: true, force: true });
  // MIN·MAX **둘 다** 잡혀야 한다. 하나만 잡히면 결함이 남은 것이다.
  const both = /RPM_MIN/.test(r.out) && /RPM_MAX/.test(r.out);
  return { code: r.code !== 0 && both ? 1 : 0, out: both ? r.out : 'MAX 를 놓쳤다(짝 상속 미동작): ' + r.out };
});

/* ⓚ 🔴 **회귀 고정 — 절·표를 인용해도 그 인용이 범위를 뒷받침하지 않으면 자백이 이긴다.**
 *     `MRR_MAX_NM_PER_MIN` 은 Table B.5·2.6 을 인용하면서 「범위 안에 들도록 잡았다」고 적었다.
 *     인용만 보고 통과시키면 놓친다 — 자백 검사를 인용 검사보다 **먼저** 해야 한다. */
add('ⓚ', "절·표 인용이 있어도 「잡았다」류 자백이 있으면 잡는다", 'FAIL', () => {
  const d = tree({ 'cited-but-guard.ts': `
/**
 * MRR 출력 유효범위 상한. S200 실측대를 훨씬 넘어서지만,
 * Table B.5 의 최대 계수에 Table 2.6 의 최대 하중·속도를 곱한 값이
 * 전부 범위 안에 들도록 잡았다.
 */
const MRR_MAX_NM_PER_MIN = withSource(10000, 'nm/min', 'S200');
` });
  const r = run(['--root', d, '--no-runtime']); rmSync(d, { recursive: true, force: true }); return r;
});

let pass = 0;
console.log('check-guard-naming 자체 검증 — 주입은 전부 임시 디렉터리(src/ 밖)에서 한다\n');
console.log('  ID  기대    실측    판정  설명');
for (const c of CASES) {
  const r = await c.fn();
  const actual = r.code === 0 ? 'PASS' : 'FAIL';
  const ok = actual === c.expect;
  if (ok) pass++;
  console.log(`  ${c.id}  ${c.expect.padEnd(6)}  ${actual.padEnd(6)}  ${ok ? '✅' : '❌'}   ${c.desc}`);
  if (!ok) console.log(`        └ 출력: ${r.out.split('\n').filter((l) => l.includes('[G') || l.includes('[R4')).slice(0, 2).join(' | ') || r.out.slice(0, 200)}`);
}
console.log(`\n  ${pass}/${CASES.length} 통과`);
if (pass !== CASES.length) { console.log('\n❌ 픽스처 실패 — 게이트가 기대대로 동작하지 않습니다.'); process.exit(1); }
console.log('✅ 픽스처 전건 통과 — 게이트의 탐지·오탐없음·면제경로가 모두 증명됐습니다.');
