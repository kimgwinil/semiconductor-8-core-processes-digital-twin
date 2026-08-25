#!/usr/bin/env node
// check-questions.mjs — A2. 공정당 10문항 · id 전역 유일 · weakTopic/objectiveId/
// explanation 비어있지 않음 · stem 중복 없음 · single 문항 choices/answer 유효성 ·
// ko/en id 집합 일치.
// 왜: weakTopic 이 비면 §7-3 약점 진단이 죽고, id 형식이 어긋나면 결과 화면
// 딥링크가 깨진다.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');

const LANGS = ['ko', 'en'];

let hasError = false;
const errors = [];
function fail(msg) {
  hasError = true;
  errors.push(msg);
}

const dirs = LANGS.map((lang) => path.join(SRC_DIR, `content/${lang}/questions`));
const anyExists = dirs.some((d) => existsSync(d));

if (!anyExists) {
  console.warn('⚠️  src/content/{ko,en}/questions 디렉터리가 없습니다. 문항 검사를 건너뜁니다.');
  process.exit(0);
}

function normalizeStem(s) {
  return s.replace(/\s+/g, ' ').trim();
}

const perLang = {};

for (const lang of LANGS) {
  const dir = path.join(SRC_DIR, `content/${lang}/questions`);
  const idsAllProcess = new Set();
  const stemsAllProcess = new Map(); // normalized stem -> [processId, id]
  const langIds = new Set();

  if (!existsSync(dir)) {
    fail(`src/content/${lang}/questions 디렉터리가 없습니다(다른 언어에는 있음).`);
    perLang[lang] = new Set();
    continue;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const full = path.join(dir, file);
    const rel = path.relative(APP_ROOT, full);
    let data;
    try {
      data = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      fail(`${rel}: JSON 파싱 실패 — ${e.message}`);
      continue;
    }

    const processId = data.processId;
    const items = Array.isArray(data.items) ? data.items : [];

    if (items.length !== 10) {
      fail(`${rel}: 문항 수가 ${items.length}개입니다(정확히 10문항이어야 함).`);
    }

    for (const item of items) {
      const idPattern = new RegExp(`^${processId}-q\\d{2}$`);
      if (!idPattern.test(item.id ?? '')) {
        fail(`${rel}: id '${item.id}' 가 '{processId}-q##' 형식이 아닙니다.`);
      }

      if (idsAllProcess.has(item.id)) {
        fail(`${rel}: id '${item.id}' 가 전역에서 중복됩니다.`);
      } else {
        idsAllProcess.add(item.id);
      }
      langIds.add(item.id);

      for (const field of ['weakTopic', 'objectiveId', 'explanation']) {
        const v = item[field];
        if (typeof v !== 'string' || v.trim() === '') {
          fail(`${rel}: '${item.id}' 의 '${field}' 가 비어 있습니다.`);
        }
      }

      const normStem = normalizeStem(item.stem ?? '');
      if (stemsAllProcess.has(normStem)) {
        const prev = stemsAllProcess.get(normStem);
        fail(`${rel}: stem 중복 — '${item.id}' 와 '${prev}' 가 같은 문장입니다.`);
      } else {
        stemsAllProcess.set(normStem, item.id);
      }

      if (item.type === 'single') {
        const choices = item.choices;
        if (!Array.isArray(choices) || choices.length < 2) {
          fail(`${rel}: '${item.id}' type:single 인데 choices 길이가 2 미만입니다.`);
        }
        const answer = item.answer;
        if (
          typeof answer !== 'number' ||
          !Array.isArray(choices) ||
          answer < 0 ||
          answer >= choices.length
        ) {
          fail(`${rel}: '${item.id}' answer(${answer}) 가 choices 의 유효 인덱스가 아닙니다.`);
        }
      }
    }
  }

  perLang[lang] = langIds;
}

// ko/en id 집합 일치
if (perLang.ko && perLang.en) {
  const onlyKo = [...perLang.ko].filter((id) => !perLang.en.has(id));
  const onlyEn = [...perLang.en].filter((id) => !perLang.ko.has(id));
  if (onlyKo.length > 0) fail(`ko 에만 있는 문항 id: ${onlyKo.join(', ')}`);
  if (onlyEn.length > 0) fail(`en 에만 있는 문항 id: ${onlyEn.join(', ')}`);
}

// ---------- 결과 ----------
if (hasError) {
  console.error(`\n❌ check-questions 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-questions 통과 — ko 문항 ${perLang.ko?.size ?? 0}개, en 문항 ${perLang.en?.size ?? 0}개`,
);
process.exit(0);
