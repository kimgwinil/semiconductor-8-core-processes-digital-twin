#!/usr/bin/env node
/**
 * check-translation — **영어·일본어 번역본이 한국어 정본과 같은 것을 말하는지** 검사한다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 필요한가 (2026-08-30 전수 실측)
 * ══════════════════════════════════════════════════════════════════════════════
 *   `check-i18n` 은 **UI 사전**(`src/locales/*.json`)의 키 집합만 본다.
 *   화면 글자의 대부분은 사전이 아니라 **콘텐츠 JSON**(`src/content/{ko,en,ja}/**`)에서 온다.
 *   그 자리에는 게이트가 하나도 없었고, 그래서 아래가 **배포된 채로 남아 있었다**:
 *
 *     · `1400 degC`      ← 한국어 정본은 `1400 °C`      (문항 29곳)
 *     · `theta-JA`       ← 한국어 정본은 `θJA`          (패키징 열저항 문항 전체)
 *     · `1.18e-29 m^3`   ← 한국어 정본은 `1.18×10⁻²⁹ m³`
 *     · `microohm*cm` · `ohm*m` · `+/-` · `<=` · `angstrom/cycle` · `sqrt(2)`
 *
 *   전부 **같은 종류의 사고**다 — 번역 원고가 과학 표기를 ASCII 로 눌러 담았고,
 *   한국어 학습자와 영어·일본어 학습자가 **다른 것을 읽는다.** 단위 기호가 무너지면
 *   그것은 번역 품질 문제가 아니라 **물리 표기의 오류**다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 판정의 기준은 「좋은 표기」가 아니라 **「한국어 정본이 그 자리에서 무엇을 썼는가」**
 * ══════════════════════════════════════════════════════════════════════════════
 *   ko 자신이 `x_ox² ~= B(t+τ)` 처럼 ASCII 근사기호를 쓴 자리가 실제로 있다
 *   (`ko/questions/oxidation.json` q02 해설). 그 자리의 번역이 `~=` 를 쓰는 것은 **옳다.**
 *   그래서 T5 는 절대 금지 목록이 아니라 **같은 경로의 ko 문자열과 대조**해서만 위반을 낸다.
 *   「집안 표기 규칙」을 새로 만들지 않는다 — 정본을 따라간다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙
 * ══════════════════════════════════════════════════════════════════════════════
 *   T1  구조 평행 — ko 에 있는 문자열 경로가 번역본에 그대로 있고 배열 길이·블록 type 이 같다
 *   T2  식별 필드 동일 — latex·src·sourceId·objectiveId·weakTopic·id·type·difficulty·level·tone
 *       은 번역 대상이 아니다. 정답(answer)의 수치·단위·허용오차도 언어와 무관하게 같아야 한다.
 *       🔴 여기가 갈라지면 같은 문항이 언어에 따라 다른 채점을 받는다.
 *   T3  빈 문자열 금지
 *   T4  한글 잔류 금지 — 번역본 산문에 한글이 남아 있으면 번역이 안 된 자리다.
 *       🔴 `answer.accept` 는 **예외**다. 단답형 정답 후보는 「학습자가 무엇을 쳐도 맞다고 볼
 *          것인가」의 목록이라 한국어 표기를 함께 받는 것이 옳다(ko/en/ja 공통 목록).
 *   T5  ASCII 대체표기 금지 — ko 가 기호를 쓴 자리에서 번역본만 ASCII 로 눌러 담은 경우
 *   T6  기호 보존 — ko 가 쓴 단위·물리 기호가 번역본에 하나도 없으면 위반
 *       (개수가 아니라 **존재**로 본다. 「0.8 Ω → 3.4 Ω」이 영어에서 「from 0.8 to 3.4 Ω」가
 *        되는 것은 자연스러운 산문이지 표기 손실이 아니다.)
 *   ℹ️  커버리지 — 번역 원고가 아직 없는 자리(문항 오답해설·실습 파라미터 라벨·장비 라벨)를
 *       **세어서 보고만 한다.** 🔴 없는 번역을 지어내는 것이 더 나쁘다(`content/types.ts` 규약).
 *
 * 종료코드 (집안 규약): 0 통과 · 1 판정 실패(T1~T6) · 2 실행 오류(파일을 못 읽음).
 *
 * 사용: node scripts/check-translation.mjs [--json] [--content <dir>]   ← --content 는 픽스처 전용
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const contentArg = argv.indexOf('--content');
const CONTENT = contentArg >= 0 ? path.resolve(argv[contentArg + 1]) : path.join(APP, 'src', 'content');

const SOURCE_LANG = 'ko';
const TARGET_LANGS = ['en', 'ja'];

/** 번역 대상이 아닌 필드 — 언어와 무관하게 같은 값이어야 한다(T2). */
const IDENTITY_KEYS = new Set([
  'latex', 'src', 'sourceId', 'objectiveId', 'weakTopic', 'id', 'processId',
  'type', 'difficulty', 'level', 'tone', 'ordered', 'choiceIndex',
]);

/** 한국어 정답 후보를 일부러 함께 싣는 자리 — T4 예외. */
const HANGUL_ALLOWED = /\.answer\.accept\[\d+\]$/;

const HANGUL = /[가-힣]/;

/**
 * T5 대조표 — `[정규식, 정본이 쓰는 기호, 사람이 읽을 이름]`.
 * ko 문자열이 **같은 정규식에 걸리지 않을 때만** 위반이다.
 */
const SURROGATES = [
  [/\bdegC\b/g, '°C', 'degC'],
  [/\+\/-/g, '±', '+/-'],
  [/<=/g, '≤', '<='],
  [/>=/g, '≥', '>='],
  [/~=/g, '≈', '~='],
  [/\bmicroohm\b/g, 'µΩ', 'microohm'],
  [/\bk?ohms?\b/g, 'Ω', 'ohm'],
  [/\bangstroms?\b/gi, 'Å', 'angstrom'],
  [/\bsqrt\b/g, '√', 'sqrt'],
  [/\btheta[-_]?\w*/g, 'θ', 'theta'],
  [/\bdelta[-_]?\w*/g, 'Δ', 'delta'],
  [/\bsigma\b/g, 'σ', 'sigma'],
  [/\blambda\b/g, 'λ', 'lambda'],
  [/\brho\b|\brho_/g, 'ρ', 'rho'],
  [/\btau\b/g, 'τ', 'tau'],
  [/\bomega\b/g, 'ω', 'omega'],
  [/\d\s*[eE][-+]?\d/g, '×10ⁿ', 'e-표기'],
];

/** T6 — ko 가 쓰면 번역본에도 있어야 하는 기호. `·`·`×`·`→`·`µ` 는 산문에서 자연스럽게 풀어 쓰이므로 뺀다. */
const SYMBOLS = ['°C', 'Ω', 'Å', '±', '≤', '≥', '≈', '√', 'θ', 'σ', 'λ', 'ρ', 'τ', 'ω', 'Δ'];

const failures = [];
const info = [];
let brokenInstrument = null;
const fail = (rule, where, msg) => failures.push({ rule, where, msg });

/** 중첩 구조를 dot/index 경로 → 값 으로 편다. 문자열만 담는다. */
function flattenStrings(node, prefix, out) {
  if (typeof node === 'string') { out.set(prefix, node); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => flattenStrings(v, `${prefix}[${i}]`, out)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flattenStrings(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

const leafKey = (p) => p.split('.').pop().replace(/\[\d+\]$/, '');

/** T1·T2 — 구조와 비번역 값의 대조. 문자열 내용은 여기서 보지 않는다. */
function compareShape(ko, tr, where, at = '') {
  if (Array.isArray(ko) || Array.isArray(tr)) {
    if (!Array.isArray(ko) || !Array.isArray(tr)) { fail('T1', where, `${at || '(root)'}: 한쪽만 배열이다`); return; }
    if (ko.length !== tr.length) { fail('T1', where, `${at}: 배열 길이가 다르다 — ko ${ko.length} · 번역 ${tr.length}`); return; }
    ko.forEach((v, i) => compareShape(v, tr[i], where, `${at}[${i}]`));
    return;
  }
  if (ko && typeof ko === 'object') {
    if (!tr || typeof tr !== 'object') { fail('T1', where, `${at}: 객체가 아니다`); return; }
    for (const k of Object.keys(ko)) {
      if (!(k in tr)) {
        // 🔴 오답해설(distractors)은 ko 전용 원고다 — 없는 것이 규약이고, 아래에서 개수만 센다.
        if (k === 'distractors') continue;
        fail('T1', where, `${at}.${k}: 번역본에 없다`);
        continue;
      }
      compareShape(ko[k], tr[k], where, `${at}.${k}`);
    }
    for (const k of Object.keys(tr)) {
      if (!(k in ko)) fail('T1', where, `${at}.${k}: ko 에 없는 키가 번역본에만 있다`);
    }
    return;
  }
  if (typeof ko === 'string') {
    if (typeof tr !== 'string') { fail('T1', where, `${at}: 문자열이 아니다`); return; }
    if (IDENTITY_KEYS.has(leafKey(at)) && ko !== tr) {
      fail('T2', where, `${at}: 번역 대상이 아닌 필드가 다르다 — ko "${ko}" · 번역 "${tr}"`);
    }
    return;
  }
  // 숫자·불리언·null — 정답 수치·허용오차가 여기 있다.
  if (typeof ko === 'number' && typeof tr === 'number') {
    if (ko !== tr) fail('T2', where, `${at}: 값이 다르다 — ko ${ko} · 번역 ${tr}`);
    return;
  }
  if (ko !== tr) fail('T2', where, `${at}: 값이 다르다 — ko ${JSON.stringify(ko)} · 번역 ${JSON.stringify(tr)}`);
}

/** T3~T6 — 문자열 대 문자열. */
function compareText(koMap, trMap, where) {
  for (const [p, tr] of trMap) {
    if (tr.trim() === '') { fail('T3', where, `${p}: 빈 문자열이다`); continue; }
    const ko = koMap.get(p);
    if (ko === undefined) continue; // T1 이 이미 잡았다.
    if (IDENTITY_KEYS.has(leafKey(p))) continue;

    if (HANGUL.test(tr) && !HANGUL_ALLOWED.test(p)) {
      fail('T4', where, `${p}: 번역본에 한글이 남아 있다 — "${excerpt(tr)}"`);
    }
    for (const [re, symbol, name] of SURROGATES) {
      re.lastIndex = 0; const hitTr = re.test(tr);
      re.lastIndex = 0; const hitKo = re.test(ko);
      if (hitTr && !hitKo) {
        fail('T5', where, `${p}: ko 는 ${symbol} 를 쓰는데 번역본은 ${name} 로 적었다 — "${excerpt(tr)}"`);
      }
    }
    for (const s of SYMBOLS) {
      if (ko.includes(s) && !tr.includes(s)) {
        fail('T6', where, `${p}: ko 의 ${s} 가 번역본에 없다 — ko "${excerpt(ko)}" · 번역 "${excerpt(tr)}"`);
      }
    }
  }
}

const excerpt = (s) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);

/** ko 디렉터리를 기준으로 대조할 파일 목록을 만든다. */
function contentFiles(dir) {
  const out = [];
  const koDir = path.join(dir, SOURCE_LANG);
  if (!existsSync(koDir)) return out;
  for (const entry of readdirSync(koDir)) {
    if (entry.endsWith('.json')) out.push(entry);
    else if (entry === 'questions' && existsSync(path.join(koDir, entry))) {
      for (const q of readdirSync(path.join(koDir, entry))) if (q.endsWith('.json')) out.push(`${entry}/${q}`);
    }
  }
  return out.sort();
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { brokenInstrument = `${p}: ${e.message}`; return null; }
}

/* ── 대조 실행 ─────────────────────────────────────────────────────────────── */

const roots = [CONTENT, path.join(CONTENT, 'lab-guide')].filter((d) => existsSync(path.join(d, SOURCE_LANG)));
if (roots.length === 0) {
  console.error(`⚠️  ${path.relative(APP, CONTENT)}/${SOURCE_LANG} 를 찾지 못했다 — 아무것도 재지 못했다.`);
  process.exit(2);
}

let comparedFiles = 0;
let comparedStrings = 0;
const missingDistractors = { en: 0, ja: 0 };
let koDistractors = 0;

for (const root of roots) {
  for (const file of contentFiles(root)) {
    const ko = readJson(path.join(root, SOURCE_LANG, file));
    if (ko === null) break;
    const koMap = new Map();
    flattenStrings(ko, '', koMap);
    for (const lang of TARGET_LANGS) {
      const p = path.join(root, lang, file);
      const where = path.relative(APP, p);
      if (!existsSync(p)) { fail('T1', where, '번역본 파일이 없다'); continue; }
      const tr = readJson(p);
      if (tr === null) break;
      const trMap = new Map();
      flattenStrings(tr, '', trMap);
      compareShape(ko, tr, where);
      compareText(koMap, trMap, where);
      comparedFiles++;
      comparedStrings += trMap.size;

      // ℹ️ 오답해설 커버리지 — 규약상 ko 전용이라 위반이 아니다. 세어서 보고만 한다.
      if (Array.isArray(ko.items)) {
        for (const [i, item] of ko.items.entries()) {
          if (!Array.isArray(item.distractors)) continue;
          if (lang === TARGET_LANGS[0]) koDistractors++;
          if (!Array.isArray(tr.items?.[i]?.distractors)) missingDistractors[lang]++;
        }
      }
    }
    if (brokenInstrument) break;
  }
  if (brokenInstrument) break;
}

if (brokenInstrument) {
  console.error(`⚠️  파일을 읽지 못했다 — ${brokenInstrument}`);
  process.exit(2);
}

if (koDistractors > 0) {
  for (const lang of TARGET_LANGS) {
    if (missingDistractors[lang] > 0) {
      info.push(`오답해설(distractors) 원고 없음 — ${lang}: ${missingDistractors[lang]}/${koDistractors} 문항 (ko 전용 규약 · content/types.ts)`);
    }
  }
}

/* ── ℹ️ 일본어 원고가 아직 없어 영문으로 내려가는 자리 ───────────────────────── */
if (CONTENT === path.join(APP, 'src', 'content')) {
  const labsDir = path.join(APP, 'src', 'models', 'labs');
  if (existsSync(labsDir)) {
    let koLabels = 0;
    for (const f of readdirSync(labsDir)) {
      if (!f.endsWith('.ts')) continue;
      koLabels += (readFileSync(path.join(labsDir, f), 'utf8').match(/\bko:\s*'/g) ?? []).length;
    }
    if (koLabels > 0) info.push(`실습 파라미터·출력 라벨에 ja 필드가 없다 — ${koLabels}개가 일본어 모드에서 영문으로 내려간다(LabParam.ko/en)`);
  }
  const eqDir = path.join(APP, 'public', 'assets', 'equipment');
  if (existsSync(eqDir)) {
    let noJa = 0;
    for (const d of readdirSync(eqDir)) {
      const p = path.join(eqDir, d, 'labels.json');
      if (!existsSync(p)) continue;
      const f = readJson(p);
      if (!f) continue;
      for (const l of [...(f.labels ?? []), ...(f.notes ?? [])]) if (l.ja === undefined) noJa++;
    }
    if (noJa > 0) info.push(`장비 도해 라벨·고지에 ja 필드가 없다 — ${noJa}개가 일본어 모드에서 영문으로 내려간다(EquipmentLabel.ko/en)`);
  }
}

/* ── 결과 ─────────────────────────────────────────────────────────────────── */

if (AS_JSON) {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    comparedFiles, comparedStrings,
    failures, info,
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

for (const line of info) console.log(`ℹ️  ${line}`);

if (failures.length > 0) {
  console.error(`\n❌ check-translation 실패 — 위반 ${failures.length}건`);
  const byRule = new Map();
  for (const f of failures) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }
  for (const [rule, list] of [...byRule.entries()].sort()) {
    console.error(`\n  ${rule} — ${list.length}건`);
    for (const f of list.slice(0, 20)) console.error(`    ${f.where} ${f.msg}`);
    if (list.length > 20) console.error(`    … 외 ${list.length - 20}건`);
  }
  process.exit(1);
}

console.log(`✅ check-translation 통과 — 번역본 ${comparedFiles}개 파일 · 문자열 ${comparedStrings}개를 ko 정본과 대조했다`);
process.exit(0);
