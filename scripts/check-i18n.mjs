#!/usr/bin/env node
// check-i18n.mjs — F2. ko.json/en.json 키 집합 완전 일치 + 빈 문자열 금지 +
// 소스의 t('...') 리터럴 키가 사전에 있는지 검사한다.
// 왜: 참조 사이트는 렌더 후 DOM 치환 방식이라 번역 누락이 화면에서만 드러났다.
// 사전을 렌더 "입력"으로 삼는 설계(§2)의 무결성을 이 스크립트가 지킨다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');
const LOCALES_DIR = path.join(SRC_DIR, 'locales');
const KO_FILE = path.join(LOCALES_DIR, 'ko.json');
const EN_FILE = path.join(LOCALES_DIR, 'en.json');

if (!existsSync(KO_FILE) || !existsSync(EN_FILE)) {
  console.warn('⚠️  src/locales/ko.json 또는 en.json 이 없습니다. i18n 검사를 건너뜁니다.');
  process.exit(0);
}

let hasError = false;
const errors = [];
function fail(msg) {
  hasError = true;
  errors.push(msg);
}

/** 중첩 객체를 dot 경로로 평탄화한다. 이미 flat(dotted 키)이면 그대로 통과한다. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

const koRaw = JSON.parse(readFileSync(KO_FILE, 'utf8'));
const enRaw = JSON.parse(readFileSync(EN_FILE, 'utf8'));
const ko = flatten(koRaw);
const en = flatten(enRaw);

const koKeys = new Set(Object.keys(ko));
const enKeys = new Set(Object.keys(en));

const onlyInKo = [...koKeys].filter((k) => !enKeys.has(k));
const onlyInEn = [...enKeys].filter((k) => !koKeys.has(k));

if (onlyInKo.length > 0) fail(`ko 에만 있는 키: ${onlyInKo.join(', ')}`);
if (onlyInEn.length > 0) fail(`en 에만 있는 키: ${onlyInEn.join(', ')}`);

for (const [k, v] of Object.entries(ko)) {
  if (typeof v === 'string' && v.trim() === '') fail(`ko.json 의 '${k}' 값이 빈 문자열입니다.`);
}
for (const [k, v] of Object.entries(en)) {
  if (typeof v === 'string' && v.trim() === '') fail(`en.json 의 '${k}' 값이 빈 문자열입니다.`);
}

// ---------- 소스의 t('...') 키가 ko.json 에 있는지 ----------
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

const srcFiles = walk(SRC_DIR, ['.ts', '.tsx']);
// t( 앞에 단어문자(=import 의 t 같은 오탐)가 오면 제외한다.
const literalCallRegex = /(?<![\w$])t\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const templateOrVarCallRegex = /(?<![\w$])t\(\s*(`|[A-Za-z_$][\w$.]*)/g;

let excludedCount = 0;
const missingKeys = new Set();

for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8');

  let m;
  while ((m = literalCallRegex.exec(text))) {
    const key = m[2];
    if (!koKeys.has(key)) {
      missingKeys.add(`${path.relative(APP_ROOT, file)}: '${key}'`);
    }
  }

  const tm = [...text.matchAll(templateOrVarCallRegex)];
  excludedCount += tm.filter((x) => x[1] === '`').length;
}

if (missingKeys.size > 0) {
  fail(`소스의 t() 키가 ko.json 에 없음:\n    ${[...missingKeys].join('\n    ')}`);
}

console.log(`ℹ️  템플릿 리터럴/변수 보간 t() 호출 ${excludedCount}건은 정적 검사에서 제외했습니다.`);

// ---------- 결과 ----------
if (hasError) {
  console.error(`\n❌ check-i18n 실패`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(`✅ check-i18n 통과 — ko/en 키 ${koKeys.size}개, 스캔한 소스 ${srcFiles.length}개`);
process.exit(0);
