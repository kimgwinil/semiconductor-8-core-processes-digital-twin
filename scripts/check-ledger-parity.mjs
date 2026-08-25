#!/usr/bin/env node
/**
 * check-ledger-parity — **원장(`04_문항원장.md`)과 앱 문항 JSON 이 어긋나면 실패한다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 필요한가 — 이 게이트가 없어서 놓친 것
 * ══════════════════════════════════════════════════════════════════════════════
 *   `metal-q08` 이 **Ea = 0.90 eV · 정답 4.4×10⁵ h** 로 실려 있었다.
 *   원장·`03`·`14_labs`·앱 자신의 물리층은 **전부 0.80** 이고, 회사 확정(PD-23 · 2026-08-20)도
 *   0.80 이 정본이다. **같은 앱 안에서 문항과 물리층이 서로 다른 상수를 가르쳤고,
 *   정답이 2.9 배 어긋난 채 학습자에게 나갔다.**
 *
 *   기존 게이트가 왜 못 잡았나:
 *     · `check-questions`  — 개수·id·형식만 본다. **값이 맞는지는 보지 않는다.**
 *     · `check-numeric`    — 앱 안에서의 수치 표기 규율이다. **원장과 대조하지 않는다.**
 *     · `check-citations`  — 출처 번호의 실재를 본다. **정답값과 무관하다.**
 *   ➡️ **원장을 정본으로 놓고 앱을 대조하는 축이 통째로 비어 있었다.** 그 자리가 이 파일이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙
 * ══════════════════════════════════════════════════════════════════════════════
 *   R1  원장의 문항 집합과 앱의 문항 집합이 다르다(한쪽에만 있는 문항) → 실패
 *   R2  `유형`(선택/단답/계산)이 다르다 → 실패
 *   R3  `난이도`(하/중/상)가 다르다 → 실패
 *   R4  `대응 LO` 가 다르다 → 실패
 *   R5  **정답이 다르다** → 실패
 *         · 선택형 — 원장의 ①②③④ ↔ 앱 `answer` 인덱스
 *         · 계산형 — 원장의 값·단위 ↔ 앱 `answer.value`/`answer.unit`
 *         · 단답형 — 원장 `허용 정답` 배열 ↔ 앱 `answer.accept` (정규화 후 집합 비교)
 *
 * 🔴 **판정 불가(UNDETERMINED)를 PASS 로 세지 않는다.**
 *   원장 서식이 공정마다 갈려 있어(「」 표기 · 굵게 표기 · 각주 혼입) 정답을 못 읽는 자리가 있다.
 *   그런 자리는 **조용히 넘기지 않고** 「판정 불가」로 따로 세어 함께 실패시킨다 —
 *   읽지 못한 것은 「맞다」가 아니라 **「모른다」**다. 원장 서식이 정리되면 저절로 줄어든다.
 *
 * 종료코드: 0 통과 · 1 판정 실패(불일치 또는 판정 불가) · 2 계측기 오류(원장/앱을 못 읽음)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(APP_ROOT, '..');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
/* 🔴 `--ledger` / `--questions-dir` 는 **픽스처 전용 주입구**다(check-citations.mjs 의
 *    `--src`/`--spec` 와 같은 이유). 위반 데이터를 진짜 원장·`src/content/ko/questions`에
 *    심으면 동시에 그 트리를 쓰는 다른 게이트·다른 담당의 측정을 오염시킨다. 기본값은
 *    지금까지와 완전히 같은 경로라 이 두 줄을 안 쓰는 모든 호출부(verify.mjs 포함)는
 *    동작이 바뀌지 않는다. */
const LEDGER = path.resolve(flag('--ledger') ?? path.join(PROJECT_ROOT, '04_문항원장.md'));
const KO_DIR = path.resolve(flag('--questions-dir') ?? path.join(APP_ROOT, 'src/content/ko/questions'));

/** 계측기 오류 — 판정 실패(1)로 위장하지 않는다. */
function instrumentFail(msg) {
  console.error(`🔴 계측기 오류: ${msg}`);
  process.exit(2);
}

if (!existsSync(LEDGER)) instrumentFail(`원장을 찾을 수 없다 — ${LEDGER}`);
if (!existsSync(KO_DIR)) instrumentFail(`앱 문항 디렉터리를 찾을 수 없다 — ${KO_DIR}`);

/* ─────────────────────────── 앱 쪽 읽기 ─────────────────────────── */

/**
 * 공정 번호(P#) ↔ processId 는 **하드코딩하지 않는다.**
 * 각 파일 첫 문항의 `objectiveId`(`LO-P#-01`)에서 뽑는다 — 공정이 늘어도 따라온다.
 */
const appByPnum = new Map();   // '6' -> { processId, items: Map<'08', item> }
for (const file of readdirSync(KO_DIR).filter((f) => f.endsWith('.json'))) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(KO_DIR, file), 'utf8'));
  } catch (e) {
    instrumentFail(`${file} JSON 파싱 실패 — ${e.message}`);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) instrumentFail(`${file} 에 문항이 없다`);
  const m = /^LO-P(\d)-\d\d$/.exec(items[0].objectiveId ?? '');
  if (!m) instrumentFail(`${file} 첫 문항의 objectiveId 에서 공정 번호를 읽을 수 없다 — ${items[0].objectiveId}`);
  const byNum = new Map();
  for (const it of items) {
    const n = /-q(\d{2})$/.exec(it.id ?? '');
    if (!n) instrumentFail(`${file}: id '${it.id}' 에서 일련번호를 읽을 수 없다`);
    byNum.set(n[1], it);
  }
  appByPnum.set(m[1], { processId: data.processId ?? file.replace(/\.json$/, ''), items: byNum });
}

/* ─────────────────────────── 원장 쪽 읽기 ─────────────────────────── */

const ledgerText = readFileSync(LEDGER, 'utf8');

/** `#### Q-P6-08` 부터 다음 헤딩 직전까지를 한 문항 블록으로 자른다. */
function ledgerBlocks() {
  const out = [];
  const re = /^####\s+Q-P(\d)-(\d{2})\s*$/gm;
  const hits = [];
  let m;
  while ((m = re.exec(ledgerText)) !== null) hits.push({ p: m[1], n: m[2], start: m.index + m[0].length });
  for (let i = 0; i < hits.length; i++) {
    const rest = ledgerText.slice(hits[i].start);
    const nextHeading = /^#{2,4}\s/m.exec(rest);
    out.push({ ...hits[i], body: nextHeading ? rest.slice(0, nextHeading.index) : rest });
  }
  return out;
}

/** Markdown 장식을 벗긴다. 값 판독에만 쓴다 — 원장 파일은 건드리지 않는다. */
function plain(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '').replace(/🔴|⚠️|🆕|🟢/g, '').trim();
}

function field(body, label) {
  const re = new RegExp(`^\\s*-\\s*\\*\\*${label}:?\\*\\*\\s*(.*)$`, 'm');
  const m = re.exec(body);
  return m ? plain(m[1]) : null;
}

const TYPE_MAP = { '선택형': 'single', '단답형': 'short', '계산형': 'numeric' };
const DIFF_MAP = { '하': 'low', '중': 'mid', '상': 'high' };
const CIRCLED = { '①': 0, '②': 1, '③': 2, '④': 3, '⑤': 4 };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

/** `1.54 × 10⁵ h` · `78.9 nm` · `110 nm` · `1.95 h` → { value, unit } · 못 읽으면 null. */
function parseNumericAnswer(raw) {
  if (raw === null) return null;
  // 괄호 부기(약 153,700 시간 …)와 각주를 떼어 낸다. 첫 괄호 앞까지만 본다.
  let s = raw.split(/[(（]/)[0].trim();
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => SUP[c]);
  // `1.54 × 10^5` 형태
  let m = /^([+-]?[\d,]+(?:\.\d+)?)\s*[×x*]\s*10\^?([+-]?\d+)\s*(.*)$/.exec(s);
  if (m) {
    const v = Number(m[1].replace(/,/g, '')) * Math.pow(10, Number(m[2]));
    return { value: v, unit: cleanUnit(m[3]) };
  }
  m = /^([+-]?[\d,]+(?:\.\d+)?)\s*(.*)$/.exec(s);
  if (m) return { value: Number(m[1].replace(/,/g, '')), unit: cleanUnit(m[2]) };
  return null;
}

function cleanUnit(u) {
  const t = (u ?? '').trim().replace(/^[·、,]+/, '').trim();
  if (t === '' || /^(무차원|없음|dimensionless)$/i.test(t)) return null;
  // 단위 뒤에 붙은 서술을 자른다: `h 약 17.5년` → `h`
  return t.split(/\s+/)[0];
}

/** 단답형 `허용 정답:` 줄의 JSON 배열. */
function parseAcceptArray(body) {
  const m = /^\s*-\s*\*\*허용 정답:?\*\*\s*`?(\[[\s\S]*?\])`?\s*$/m.exec(body);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** 채점 정규화와 같은 규칙(§2-3)으로 비교한다 — 표기 차이를 불일치로 잡지 않기 위해. */
function normShort(s) {
  return String(s).trim().normalize('NFKC').replace(/\(.*?\)/g, '')
    .replace(/[\s\-–—·.,_/\\'"`~!?;:+*^]/g, '').toLowerCase();
}

/**
 * 단위 비교용 정규화.
 * 🔴 위첨자를 **양쪽 다** 편다 — 원장 `cm⁻³` 과 앱 `cm⁻³` 이 표기만 다를 뿐 같은 단위인데,
 *    한쪽만 펴면 게이트가 없는 불일치를 만들어 낸다(자체 검수에서 실제로 오탐이 났다).
 */
function normUnit(u) {
  if (u === null || u === undefined) return '';
  return String(u).trim()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => SUP[c])
    .replace(/\^/g, '')
    .replace(/\s/g, '')
    .normalize('NFKC')
    .toLowerCase();
}

/* ─────────────────────────── 대조 ─────────────────────────── */

const mismatches = [];
const undetermined = [];
let compared = 0;

const blocks = ledgerBlocks();
if (blocks.length === 0) instrumentFail('원장에서 `#### Q-P#-##` 문항 블록을 하나도 찾지 못했다');

const seenLedger = new Set();

for (const b of blocks) {
  const proc = appByPnum.get(b.p);
  if (!proc) { mismatches.push(`R1 원장 Q-P${b.p}-${b.n}: 앱에 P${b.p} 공정 파일이 없다`); continue; }
  const q = proc.items.get(b.n);
  const tag = `${proc.processId}-q${b.n} (원장 Q-P${b.p}-${b.n})`;
  seenLedger.add(`${b.p}/${b.n}`);
  if (!q) { mismatches.push(`R1 ${tag}: 원장에 있는 문항이 앱에 없다`); continue; }
  compared++;

  const type = TYPE_MAP[field(b.body, '유형') ?? ''];
  const diff = DIFF_MAP[field(b.body, '난이도') ?? ''];
  const loRaw = field(b.body, '대응 LO');
  const lo = loRaw ? (/LO-P\d-\d\d/.exec(loRaw)?.[0] ?? null) : null;

  if (!type) undetermined.push(`${tag}: 「유형」을 읽지 못했다`);
  else if (type !== q.type) mismatches.push(`R2 ${tag}: 유형 — 원장 ${type} ↔ 앱 ${q.type}`);

  if (!diff) undetermined.push(`${tag}: 「난이도」를 읽지 못했다`);
  else if (diff !== q.difficulty) mismatches.push(`R3 ${tag}: 난이도 — 원장 ${diff} ↔ 앱 ${q.difficulty}`);

  if (!lo) undetermined.push(`${tag}: 「대응 LO」를 읽지 못했다`);
  else if (lo !== q.objectiveId) mismatches.push(`R4 ${tag}: 대응 LO — 원장 ${lo} ↔ 앱 ${q.objectiveId}`);

  // ── R5 정답 ──
  const ansRaw = field(b.body, '정답');
  const effType = type ?? q.type;

  if (effType === 'single') {
    const c = ansRaw ? [...ansRaw].find((ch) => ch in CIRCLED) : undefined;
    if (c === undefined) undetermined.push(`${tag}: 선택형 정답(①②③④)을 읽지 못했다 — ${ansRaw ?? '(정답 줄 없음)'}`);
    else if (CIRCLED[c] !== q.answer) mismatches.push(`R5 ${tag}: 정답 — 원장 ${c}(=${CIRCLED[c]}) ↔ 앱 ${q.answer}`);
  } else if (effType === 'numeric') {
    // 🔴 원장이 `(a) … · (b) … · (c) …` 로 **여러 답**을 요구할 수 있다. 2026-08-24 3차부터
    //    앱도 `answer.parts`(다항, `NumericMultiAnswer`)로 전부 채점할 수 있다 —
    //    CEO 지시 「채점은 문제 문항수에 따라 다 하는 것이 기준」. 앱이 여전히 단항이면
    //    (구형 콘텐츠) R6 을 그대로 낸다 — 「묻는 것과 채점하는 것이 다르다」.
    const parts = ansRaw ? [...ansRaw.matchAll(/\(([a-c])\)\s*([^·|]+)/g)] : [];
    const appParts = (typeof q.answer === 'object' && q.answer !== null && Array.isArray(q.answer.parts))
      ? q.answer.parts
      : null;

    if (parts.length > 1) {
      if (!appParts) {
        mismatches.push(`R6 ${tag}: 원장은 답 ${parts.length}개(${parts.map((p) => p[1]).join('·')})를 요구하는데 앱은 1개만 채점한다 — 나머지를 적은 학습자는 정답을 알고도 오답이 된다`);
      } else if (appParts.length !== parts.length) {
        mismatches.push(`R6 ${tag}: 원장은 답 ${parts.length}개를 요구하는데 앱은 ${appParts.length}개만 채점한다`);
      } else {
        for (const [i, p] of parts.entries()) {
          const led = parseNumericAnswer(p[2]);
          const appPart = appParts[i];
          if (!led || !Number.isFinite(led.value)) {
            undetermined.push(`${tag}: (${p[1]}) 계산형 정답값을 읽지 못했다 — ${p[2]}`);
            continue;
          }
          if (!appPart || typeof appPart.value !== 'number') {
            mismatches.push(`R5 ${tag}: (${p[1]}) 앱 정답이 계산형 형태가 아니다`);
            continue;
          }
          const tol = typeof appPart.tolerance === 'number' ? appPart.tolerance : 0.01;
          const rel = led.value === 0 ? Math.abs(appPart.value) : Math.abs(appPart.value - led.value) / Math.abs(led.value);
          if (rel > tol) {
            mismatches.push(`R5 ${tag}: (${p[1]}) 정답값 — 원장 ${led.value} ↔ 앱 ${appPart.value} (상대차 ${(rel * 100).toFixed(1)} % > 허용 ${(tol * 100).toFixed(0)} %)`);
          }
          if (led.unit !== null && normUnit(led.unit) !== normUnit(appPart.unit)) {
            mismatches.push(`R5 ${tag}: (${p[1]}) 단위 — 원장 ${led.unit} ↔ 앱 ${appPart.unit}`);
          }
        }
      }
    } else {
      const led = parseNumericAnswer(ansRaw);
      if (!led || !Number.isFinite(led.value)) {
        undetermined.push(`${tag}: 계산형 정답값을 읽지 못했다 — ${ansRaw ?? '(정답 줄 없음)'}`);
      } else if (typeof q.answer !== 'object' || typeof q.answer.value !== 'number') {
        mismatches.push(`R5 ${tag}: 앱 정답이 계산형 형태가 아니다`);
      } else {
        // 원장이 유효숫자 3자리로 적는 자리가 있어 **원장 허용오차 안**이면 일치로 본다.
        const tol = typeof q.answer.tolerance === 'number' ? q.answer.tolerance : 0.01;
        const rel = led.value === 0 ? Math.abs(q.answer.value) : Math.abs(q.answer.value - led.value) / Math.abs(led.value);
        if (rel > tol) {
          mismatches.push(`R5 ${tag}: 정답값 — 원장 ${led.value} ↔ 앱 ${q.answer.value} (상대차 ${(rel * 100).toFixed(1)} % > 허용 ${(tol * 100).toFixed(0)} %)`);
        }
        if (led.unit !== null && normUnit(led.unit) !== normUnit(q.answer.unit)) {
          mismatches.push(`R5 ${tag}: 단위 — 원장 ${led.unit} ↔ 앱 ${q.answer.unit}`);
        }
      }
    }
  } else if (effType === 'short') {
    const arr = parseAcceptArray(b.body);
    if (!arr) {
      undetermined.push(`${tag}: 단답형 「허용 정답」 배열을 읽지 못했다`);
    } else if (typeof q.answer !== 'object' || !Array.isArray(q.answer.accept)) {
      mismatches.push(`R5 ${tag}: 앱 정답이 단답형 형태가 아니다`);
    } else {
      const L = new Set(arr.map(normShort));
      const A = new Set(q.answer.accept.map(normShort));
      const onlyL = [...L].filter((x) => !A.has(x));
      const onlyA = [...A].filter((x) => !L.has(x));
      if (onlyL.length > 0 || onlyA.length > 0) {
        mismatches.push(`R5 ${tag}: 허용 정답 집합이 다르다 — 원장에만 [${onlyL.join(', ')}] · 앱에만 [${onlyA.join(', ')}]`);
      }
    }
  }
}

// 앱에만 있고 원장에 없는 문항
for (const [pnum, proc] of appByPnum) {
  for (const n of proc.items.keys()) {
    if (!seenLedger.has(`${pnum}/${n}`)) mismatches.push(`R1 ${proc.processId}-q${n}: 앱에 있는 문항이 원장에 없다`);
  }
}

/* ─────────────────────────── 보고 ─────────────────────────── */

console.log(`원장 문항 ${blocks.length}건 · 대조 ${compared}건 · 앱 공정 ${appByPnum.size}종`);

if (mismatches.length > 0) {
  console.error(`\n❌ 원장↔앱 불일치 ${mismatches.length}건`);
  for (const m of mismatches) console.error('  · ' + m);
}
if (undetermined.length > 0) {
  console.error(`\n🟡 판정 불가 ${undetermined.length}건 — 원장 서식을 읽지 못한 자리다. **「통과」가 아니라 「모른다」다.**`);
  for (const u of undetermined) console.error('  · ' + u);
}

if (mismatches.length === 0 && undetermined.length === 0) {
  console.log('✅ check-ledger-parity 통과 — 원장과 앱의 유형·난이도·LO·정답이 전건 일치한다.');
  process.exit(0);
}
process.exit(1);
