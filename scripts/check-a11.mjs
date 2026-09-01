#!/usr/bin/env node
/**
 * check-a11 — **A11(공정-이미지 정합성) 을 재는 유일한 게이트.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 필요한가 — 이 자리가 통째로 비어 있었다
 * ══════════════════════════════════════════════════════════════════════════════
 *   2026-09-01 실측: `app/scripts/**` 전체에 `A11`·`07_정합성원장` 문자열 **0 건**.
 *   A11 을 검사하는 게이트가 **없었다.**
 *
 *   `check-assets` 가 그 자리를 메우는 것처럼 보였지만 아니다. 그 게이트의 머리주석은
 *   스스로 **「A4·A8·§14-3·§14-4」** 라 적고 A11 을 주장하지 않는다. 실제로 보는 것은
 *   파일 존재 · 용량 상한 · `labels.json` 참조 무결성 · 라벨 ≥8 · `PROVENANCE.md` 6항목
 *   **존재** 까지다. **정합성 원장(`07_정합성원장.md`)을 한 번도 열지 않는다.**
 *   그래서 다음 두 가지가 통째로 사각지대였다:
 *     ① 원장에 **등재조차 되지 않은** 이미지가 출하 트리에 있는 것
 *     ② 원장이 **「반려」라 적어 둔** 자산이 그대로 출하 트리에 있는 것
 *
 *   🔴 그리고 `check-assets.mjs:28` 의 `hasFilledSection()` 은 「비어 있지 않은가」만 본다 —
 *      **제작자와 검수자가 같아도 통과한다.** 원장은 §1 열 정의에
 *      *"`검수자` · 🔴 **제작자와 달라야 한다.** 같으면 CI 실패"* 라 적어 두었는데
 *      그 「CI 실패」가 **어디에도 구현돼 있지 않았다.** 그 자리가 이 파일의 A11-3 이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A11 수용기준 원문 (`projects/8대공정-001/README.md`)
 * ══════════════════════════════════════════════════════════════════════════════
 *   「모든 이미지가 해당 공정의 해당 장비를 보여준다. 이미지 1건마다 **어느 공정·어느 장비·
 *     무엇을 보여주는가·근거 출처·검수자** 가 정합성 원장에 기록돼 있고, **제작자와 다른
 *     사람이 판정** 했다. 확인 방법: 정합성 원장 전수 대조」
 *
 *   ⚠️ **이 게이트가 재지 못하는 것 — 착각하지 마라(D-050 K-3).**
 *      「그림 내용이 실제로 그 공정의 그 장비인가」는 **사람의 눈**이 판정한다.
 *      이 게이트는 **「그 판정이 원장에 기록됐고, 독립된 사람이 했고, 합격인가」** 만 잰다.
 *      A11 전건 PASS 는 「그림이 맞다」가 아니라 **「장부가 성립한다」** 는 뜻이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙 (검사 ID)
 * ══════════════════════════════════════════════════════════════════════════════
 *   A11-1  **미등재** — 출하 트리(`app/public/assets/**`)의 이미지가 원장 어느 행에도 없다
 *   A11-2  **필수 필드** — 등재 행에 「공정·장비·무엇을 보여주는가·근거 출처·검수자」가
 *          **구조적으로**(열이 실재하고 그 칸이 자리표시자가 아님) 채워져 있는가
 *   A11-3  🔴 **제작자 ≠ 검수자** — 정규화 후 한 사람이라도 겹치면 실패.
 *          제작자·검수자 열 자체가 없으면 **「검사할 수 없다」= 실패**(못 쟀다를 통과로 세지 않는다)
 *   A11-4  **판정 상태** — 「합격」이 아닌 자산(조건부·반려·대기·해석불가)이 출하 트리에 있으면 실패
 *   A11-5  **유령 등재** — 원장에 적힌 파일이 디스크에 없다
 *   A11-6  **해석 불가 행** — 원장 행의 키를 파일·processId 어느 쪽으로도 읽지 못했다.
 *          🔴 조용히 넘기지 않는다. 「읽지 못한 것」은 「맞다」가 아니라 **「모른다」** 다
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 부분문자열 검사를 쓰지 않는다 (`09_물리층_구현규약.md` §7-3 — 「오늘 네 번 났다」)
 * ══════════════════════════════════════════════════════════════════════════════
 *   그 §7-3 사례 4번이 바로 `check-assets` 의 `text.includes('검수자')` 가 **8개 공정 전부를
 *   통과시킨 것** 이다. 그래서 이 게이트는 전부 **구조**로 읽는다:
 *     · 원장 → **Markdown 표 구조**(헤더 행 + 구분선 + 데이터 행)로 파싱한다.
 *       어느 표가 자산 원장인지는 **헤더 첫 칸이 `processId`·`파일` 이고 `검수자`·`판정` 열을
 *       동시에 가지는가** 로 판단한다(표 자체의 구조). 문장 안에 그 낱말이 나와도 걸리지 않는다.
 *     · 필드 존재 → **열 단위**. 헤더 셀 정규화 후 **접두 일치**(`장비(유형명)`→`장비`,
 *       `근거 출처 (유형·서지·FIG·부호)`→`근거 출처`). 본문 어딘가에 그 낱말이 있는지는 보지 않는다.
 *     · 🔴 **판정 상태** → **선두 토큰 앵커 매칭**. `합격` 을 `includes` 로 찾으면
 *       **「조건부 합격」과 「불합격」이 전부 합격이 된다**(§7-3 이 경고한 바로 그 함정).
 *       구분자(`—`·`(`·`·`) 앞의 **선두 토큰이 `합격` 으로 시작할 때만** 합격이다.
 *       `조건부 합격`·`불합격`·`반려` 는 선두가 다르므로 원리적으로 통과할 수 없다.
 *     · 확장자 → **전종**(png·jpg·jpeg·webp·svg·avif·gif). 🔴 한 종만 세면 D-050 K-4 위반이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 기준선(baseline) + 래칫 + 승격일 — `check-citations.mjs` R-5 의 선례를 따른다
 * ══════════════════════════════════════════════════════════════════════════════
 *   지금 이 게이트를 차단으로 켜면 **원장 미등재 30건이 즉시 실패**해 `verify` 가 빨간불이 된다.
 *   원장에 30건을 등재하는 일은 **DSN 소관**이고 이 게이트의 일이 아니다. 그래서:
 *     ① 검사 ID 마다 **도입일 실측치**를 기준선으로 박는다
 *     ② 실측치가 기준선을 **넘으면 즉시 FAIL**(악화 금지 래칫)
 *     ③ 0 이 되면 그 뒤로는 **1건만 생겨도 FAIL**(되돌아갈 수 없다 — ②에 포함된다)
 *     ④ 승격일이 지나면 **남아 있는 건수가 그대로 FAIL**
 *   🔴 **기준선은 「도입일 실측치」다. 넉넉하게 잡지 않는다**(D-041 — 기준을 결과에 맞춰 옮기지 마라).
 *      **내리기만 한다. 올리려면 DSN·PLN 판정을 먼저 받아라.**
 *
 *   🔴 **주입구를 처음부터 대칭으로 뚫는다.** `check-citations` 는 `--r5-baseline` 만 뚫고
 *      승격일·오늘 날짜는 뚫지 않아서, **승격일이 지나면 픽스처가 실트리 상태에 오염된다**
 *      (기준선 픽스처가 어느 날 갑자기 색이 바뀐다). 그래서 여기서는
 *      `--a11-baseline` · `--promote-on` · `--today` 를 **셋 다** 뚫는다.
 *      기본값은 운영값이고, 픽스처는 전부 주입해서 쓴다 — 실트리·실날짜에 의존하지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 종료코드 — 집안 규약 { 0 통과 · 1 판정 실패 · 2 계측기 오류 }
 * ══════════════════════════════════════════════════════════════════════════════
 *   🔴 3(selftest-gates 배타 락)·4(판정 불가)는 **쓰지 않는다.** A11-6「해석 불가 행」은
 *      종료코드 4 가 아니라 **자기 래칫을 가진 판정 항목**이다 — 원장 서식이 정리되면 0 이 된다.
 *   → verify.mjs §V 표에서 `CODES.WITH_ERROR` 로 해석돼야 한다.
 *
 * 사용: node scripts/check-a11.mjs [--json]
 *       [--ledger <file>] [--project-root <dir>] [--assets-dir <dir>]        ← 🔴 픽스처 전용
 *       [--a11-baseline <json>] [--promote-on <YYYY-MM-DD>] [--today <YYYY-MM-DD>]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

/* 🔴 픽스처 전용 주입구. 위반 데이터를 진짜 원장·`public/assets` 에 심으면 같은 트리를
 *    동시에 쓰는 다른 게이트(check-assets 등)와 다른 담당의 측정을 오염시킨다
 *    (check-citations.selftest.mjs·check-ledger-parity.selftest.mjs 머리주석과 같은 이유).
 *    기본값은 운영 경로이므로 이 플래그를 안 쓰는 호출부(verify.mjs)는 동작이 바뀌지 않는다. */
const PROJECT = path.resolve(flag('--project-root') ?? path.resolve(APP, '..'));
const LEDGER = path.resolve(flag('--ledger') ?? path.join(PROJECT, '07_정합성원장.md'));
const ASSETS_DIR = path.resolve(flag('--assets-dir') ?? path.join(PROJECT, 'app/public/assets'));

/* ═══════════════════ 기준선 · 래칫 · 승격일 ═══════════════════
 * 🔴 아래 수는 **2026-09-01 도입일 실측치**다. 측정 명령:
 *      node scripts/check-a11.mjs --a11-baseline '{}'   (기준선 0 으로 두고 실측 건수를 읽는다)
 *    🔴 이 수를 올리지 마라. 내리기만 한다.
 *
 *  A11-1 미등재 10 — 🔴 **2026-09-01 하향(30 → 10).** 래칫은 「악화 금지」이므로 **좋아진 만큼 내려야**
 *        다음 역행을 잡는다(내리기만 한다 — 올리지 않는다).
 *        도입일 실측 30 = 출하 트리 이미지 43건(png 11·jpg 19·webp 13·svg/avif/gif/jpeg 0) 중
 *        원장 등재 13건(§3 단면도해 8 + §4 텍스처 5). 43 − 13 = 30.
 *        같은 날 DSN(`threads/DSN-8대공정-001.md` §S8-7)이 30건을 전건 판정(합격 21·반려 7·보류 2)했고,
 *        **합격 중 20건**을 원장 **§5-1** 에 등재했다(실행: DEV 하위). 30 − 20 = **10**.
 *        🔴 남은 10 = 반려 7 + 보류 2 + `viz/wafer/multi-wire-saw-4d-bg.png` 1.
 *           마지막 1건은 DSN 판정이 「합격」이나 **출처 불명(PROVENANCE 부재)으로 LEG/CEO 확인 대기**라
 *           의도적으로 등재하지 않았다. 나머지 9건은 **등재하면 A11-4 가 악화**하므로 시정이 먼저다.
 *        🔴 등재는 **DSN 소관**이다(이 게이트는 세기만 한다).
 *  A11-2 필수 필드 13 — §4 텍스처 5행 × (`공정`·`장비` **열 자체가 없음**) = 10,
 *        §5 외관 래스터 1행 × (`무엇을 보여주는가`·`근거 출처` **열 없음** + `검수자`=「(검수 대기)」) = 3.
 *        🔴 원장 §1 이 정한 서식이 §4·§5 표에는 **적용돼 있지 않다.** 서식 확장은 DSN 소관이다.
 *  A11-4 판정 상태 13 — 단면 도해 8건(원장 §3-0-2-A 가 스스로 「합격 0 · 조건부 3 · 반려 5」라 적음)
 *        + 텍스처 5건(전부 「재검수 대기」). §7 도 「🔴 A11 은 미충족이다」라 적었다.
 *        🔴 외관 래스터(`이미지/단면도해/ext_f01_cz.webp`)는 **출하 트리 밖**이라 세지 않는다.
 *  A11-3 0 · A11-5 0 — **탐지 방향은 픽스처가 증명한다**(check-a11.selftest.mjs ⓒ·ⓓ·ⓕ).
 *        실측 0 이 「검사가 안 돈다」가 아님을 픽스처 없이는 말할 수 없다(R-7c).
 *  A11-6 해석 불가 1 — §5 의 「나머지 7종」 행(파일명이 아니라 자리표시자).
 */
const A11_INTRODUCED_ON = '2026-09-01';
const A11_PROMOTE_ON = flag('--promote-on') ?? '2026-10-01';
const DEFAULT_BASELINE = {
  'A11-1': 10,
  'A11-2': 13,
  'A11-3': 0,
  'A11-4': 13,
  'A11-5': 0,
  'A11-6': 1,
};

const CHECK_IDS = ['A11-1', 'A11-2', 'A11-3', 'A11-4', 'A11-5', 'A11-6'];
const CHECK_TITLE = {
  'A11-1': '미등재 — 출하 트리 이미지가 원장에 없다',
  'A11-2': '필수 필드 — 공정·장비·무엇을 보여주는가·근거 출처·검수자',
  'A11-3': '🔴 제작자 ≠ 검수자 (독립 판정)',
  'A11-4': '판정 상태 — 「합격」이 아닌 자산이 출하 트리에 있다',
  'A11-5': '유령 등재 — 원장에 있는데 파일이 없다',
  'A11-6': '해석 불가 행 — 「모른다」를 「맞다」로 세지 않는다',
};

/* ═══════════════════ 계측기 오류(종료코드 2) 경로 ═══════════════════ */
function bail(msg, hint) {
  console.error(`🔴 계측기 오류: ${msg}`);
  if (hint) console.error(`   ${hint}`);
  console.error('   🔴 이것은 「위반 없음」도 「위반 있음」도 아닙니다. 재지 못한 것입니다(종료코드 2).');
  process.exit(2);
}

let BASELINE = { ...DEFAULT_BASELINE };
const baselineArg = flag('--a11-baseline');
if (baselineArg !== null) {
  let parsed;
  try { parsed = JSON.parse(baselineArg); } catch (e) {
    bail(`--a11-baseline 을 JSON 으로 읽지 못했다 — ${e.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    bail('--a11-baseline 은 { "A11-1": 30, … } 형태의 객체여야 한다');
  }
  for (const k of Object.keys(parsed)) {
    if (!CHECK_IDS.includes(k)) bail(`--a11-baseline 에 모르는 검사 ID 가 있다 — ${k}`);
    if (!Number.isInteger(parsed[k]) || parsed[k] < 0) bail(`--a11-baseline['${k}'] 는 0 이상의 정수여야 한다`);
  }
  // 🔴 주입한 키만 갈아 끼우는 것이 아니라 **주입 객체를 정본으로 삼는다.**
  //    부분 주입이면 나머지가 운영 기준선으로 남아 픽스처가 실트리 상태에 오염된다.
  BASELINE = {};
  for (const id of CHECK_IDS) BASELINE[id] = parsed[id] ?? 0;
}

/* 🔴 날짜는 **로컬(KST)** 로 잡는다 — UTC 로 잡으면 KST 오전에 하루 전으로 읽힌다.
 *    `--today` 는 픽스처가 승격 경로를 **날짜에 의존하지 않고** 시험하기 위한 주입구다. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = flag('--today') ?? localToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) bail(`--today 형식이 YYYY-MM-DD 가 아니다 — ${TODAY}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(A11_PROMOTE_ON)) bail(`--promote-on 형식이 YYYY-MM-DD 가 아니다 — ${A11_PROMOTE_ON}`);

if (!existsSync(LEDGER)) {
  bail(`정합성 원장을 찾을 수 없다 — ${LEDGER}`,
    '대조 정본을 읽지 못하면 「등재됐는지」와 「못 읽었는지」를 구분할 수 없다.');
}
if (!existsSync(ASSETS_DIR)) {
  bail(`출하 자산 디렉터리를 찾을 수 없다 — ${ASSETS_DIR}`,
    '검사 대상이 0건인 것과 디렉터리가 없는 것은 다르다.');
}

/* ═══════════════════ 정규화 ═══════════════════ */

/** 🔴 `→`(U+2192)는 **지우지 않는다** — 검수자 계보(`V1b → RV → RV2-A`)를 쪼개는 구분자다. */
const DECOR = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23E9}-\u{23FA}\u{25A0}-\u{25FF}\u{2B1B}-\u{2B1C}]/gu;

/** Markdown 장식·이모지를 벗긴다. 판독에만 쓴다 — 원장 파일은 건드리지 않는다. */
function plain(s) {
  return String(s ?? '')
    .replace(/\*\*/g, '')
    .replace(/~~/g, '')
    .replace(/`/g, '')
    .replace(DECOR, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 열 이름 비교용 — 공백까지 지운다(`근거 출처` ↔ `근거출처`). */
function normHeader(s) {
  return plain(s).replace(/\s/g, '');
}

/** 🔴 자리표시자 — 「비어 있지 않다」가 「채워졌다」가 아니다(check-assets 의 구멍). */
const PLACEHOLDER = /^[(（]?\s*(미정|미상|TBD|N\/A|NA|없음|해당없음|추후|편성\s*예정|검수\s*대기|재검수\s*대기|판정\s*대기|-+|—+|·|\?+)\s*[)）]?$/i;
function isFilled(cellRaw) {
  const v = plain(cellRaw);
  if (v === '') return false;
  if (PLACEHOLDER.test(v)) return false;
  return true;
}

/* ═══════════════════ 원장 파싱 — 표 구조로 읽는다 ═══════════════════ */

/** `|` 로 셀을 쪼갠다. `\|` 는 셀 구분자가 아니다. */
function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (t[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += t[i];
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const isTableLine = (l) => /^\s*\|/.test(l);
const isSeparator = (l) => /^\s*\|[\s:|-]+\|?\s*$/.test(l) && /-/.test(l);

/**
 * 원장에서 표를 전부 뽑는다.
 * @returns {{heading:string, headingLine:number, preamble:string, header:string[], rows:{cells:string[],line:number}[], startLine:number}[]}
 */
function parseTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let heading = '(문서 머리)';
  let headingLine = 0;
  let preambleFrom = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) { heading = lines[i].trim(); headingLine = i + 1; preambleFrom = i + 1; continue; }
    if (!isTableLine(lines[i]) || !isSeparator(lines[i + 1] ?? '')) continue;

    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isTableLine(lines[j]); j++) {
      if (isSeparator(lines[j])) continue;
      rows.push({ cells: splitRow(lines[j]), line: j + 1 });
    }
    tables.push({
      heading, headingLine,
      preamble: lines.slice(preambleFrom, i).join('\n'),
      header, rows, startLine: i + 1,
    });
    i = j - 1;
  }
  return tables;
}

/**
 * 🔴 **자산 원장 표인가** — 표 자체의 구조로 판단한다(문장 안의 낱말에 걸리지 않는다).
 *    조건: 헤더 첫 칸이 `processId` 또는 `파일` **이고** `검수자`·`판정` 열을 **둘 다** 가진다.
 *    · §3-0 「A11 검수 계보」 표(첫 칸 processId, `판정` 열 없음) → 제외 ✅
 *    · §4-A 이음매 판정식 표(첫 칸 `텍스처`, `검수자` 열 없음)   → 제외 ✅
 *    · §7 집계 표(첫 칸 `항목`)                                  → 제외 ✅
 */
function isAssetTable(header) {
  const h = header.map(normHeader);
  if (h.length === 0) return false;
  const first = h[0];
  if (first !== 'processId' && first !== '파일') return false;
  const has = (k) => h.some((c) => c.startsWith(k));
  return has('검수자') && has('판정');
}

/** 열 인덱스 — 정규화 후 **접두 일치**. `장비(유형명)`→`장비`, `근거 출처 (…)`→`근거출처`. */
function colIndex(header, key) {
  const k = normHeader(key);
  const h = header.map(normHeader);
  const i = h.findIndex((c) => c.startsWith(k));
  return i >= 0 ? i : null;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif', 'gif'];
const IMAGE_EXT_RE = new RegExp(`\\.(${IMAGE_EXTS.join('|')})$`, 'i');

/** 표 앞머리(preamble)에서 선언된 경로 접두를 찾는다. 예: 경로 `app/public/assets/tex/` */
function declaredPrefix(preamble) {
  const m = /`([^`\s]+\/)`/.exec(preamble);
  return m ? m[1] : null;
}

/**
 * 행의 첫 칸에서 **자산 키**를 뽑는다.
 * @returns {{kind:'file', rel:string}[] | {kind:'process', id:string}[] | null}  못 읽으면 null(A11-6)
 */
function resolveKeys(firstCellRaw, prefix) {
  const spans = [...String(firstCellRaw).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const candidates = spans.length > 0 ? spans : [plain(firstCellRaw)];
  const out = [];
  for (const c of candidates) {
    if (IMAGE_EXT_RE.test(c)) {
      out.push({ kind: 'file', rel: c.includes('/') ? c : (prefix ? prefix + c : null), raw: c });
      continue;
    }
    if (/^[a-z][a-z0-9_-]*$/.test(c)) out.push({ kind: 'process', id: c, raw: c });
  }
  return out.length > 0 ? out : null;
}

/** processId → 출하 경로. 근거: 원장 §1 「파일 경로가 곧 이 값이다」 ·
 *  「트랙 B는 `app/public/assets/equipment/{후공정 processId}/` 로 같은 구조를 쓴다」. */
const processAssetRel = (id) => `app/public/assets/equipment/${id}/cross-section.webp`;

/* ═══════════════════ 사람 이름 정규화 (A11-3) ═══════════════════ */

/** 계보(`V1b → RV → RV2-A`) · 병기(`P5·P5b`)를 사람 단위로 쪼갠다. */
function splitPeople(cellRaw) {
  return plain(cellRaw)
    .split(/→|->|·|、|,|\/|\+|;/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** 🔴 공백·대소문자·경칭·괄호 부기를 지운다. `DSN 팀장` ↔ `dsn`. */
function normPerson(s) {
  let v = plain(s)
    .replace(/[(（][^)）]*[)）]/g, '')
    .replace(/[「」『』【】\[\]<>]/g, '')
    .trim();
  v = v.replace(/\s*(팀장|팀원|조장|검수조|제작조|담당|선임|책임|씨|님)\s*$/g, '').trim();
  return v.replace(/\s/g, '').toLowerCase();
}

/** 사람 이름으로 셀 수 없는 토큰(자리표시자·설명문)은 비교에서 뺀다. */
function peopleSet(cellRaw) {
  const out = new Set();
  for (const tok of splitPeople(cellRaw)) {
    if (PLACEHOLDER.test(plain(tok))) continue;
    const n = normPerson(tok);
    if (n === '') continue;
    out.add(n);
  }
  return out;
}

/* ═══════════════════ 판정 상태 (A11-4) ═══════════════════ */

/**
 * 🔴 **선두 토큰 앵커 매칭.** `includes('합격')` 은 「조건부 합격」·「불합격」까지 통과시킨다
 *    (`09_물리층_구현규약.md` §7-3 이 경고한 함정). 구분자 앞의 선두 토큰만 본다.
 * @returns {{head:string, pass:boolean, label:string}}
 */
function readVerdict(cellRaw) {
  const v = plain(cellRaw);
  const head = v.split(/[—–\-(（·:：,、]/)[0].trim();
  let label;
  if (/^반려/.test(head)) label = '반려';
  else if (/^불합격/.test(head)) label = '불합격';
  else if (/^조건부/.test(head)) label = '조건부';
  else if (/^합격(\s|$)/.test(head)) label = '합격';
  else if (head === '') label = '(빈 칸)';
  else label = `미판정/해석불가(${head})`;
  return { head, pass: label === '합격', label };
}

/* ═══════════════════ 출하 트리 훑기 — 확장자 전종 ═══════════════════ */

function walkImages(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch (e) {
      bail(`자산 디렉터리를 읽지 못했다 — ${cur}: ${e.message}`);
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!e.isFile()) continue;
      if (IMAGE_EXT_RE.test(e.name)) out.push(full);
    }
  }
  return out.sort();
}

/* ═══════════════════ 대조 ═══════════════════ */

const ledgerText = readFileSync(LEDGER, 'utf8');
const tables = parseTables(ledgerText);
const assetTables = tables.filter((t) => isAssetTable(t.header));
if (assetTables.length === 0) {
  bail('원장에서 자산 원장 표를 하나도 찾지 못했다 (헤더 첫 칸 `processId`·`파일` + `검수자`·`판정` 열)',
    '원장 서식이 바뀌었을 수 있다. 서식이 바뀌면 이 게이트를 함께 고쳐라 — 조용히 0건으로 통과시키지 않는다.');
}

const hits = {};
for (const id of CHECK_IDS) hits[id] = [];

/** rel(프로젝트 루트 기준 POSIX 경로) → 등재 행 */
const registered = new Map();
let rowCount = 0;

for (const t of assetTables) {
  const prefix = declaredPrefix(t.preamble);
  const idx = {
    공정: colIndex(t.header, '공정'),
    장비: colIndex(t.header, '장비'),
    무엇: colIndex(t.header, '무엇을 보여주는가'),
    근거: colIndex(t.header, '근거 출처'),
    제작자: colIndex(t.header, '제작자'),
    검수자: colIndex(t.header, '검수자'),
    판정: colIndex(t.header, '판정'),
  };
  const where = `${t.heading} (원장 ${t.startLine}행 표)`;

  for (const row of t.rows) {
    if (row.cells.length !== t.header.length) {
      hits['A11-6'].push(`${LEDGER_REL()}:${row.line} — 셀 수(${row.cells.length})가 헤더(${t.header.length})와 다르다 · ${where}`);
      continue;
    }
    const keys = resolveKeys(row.cells[0], prefix);
    if (keys === null) {
      hits['A11-6'].push(`${LEDGER_REL()}:${row.line} — 첫 칸에서 파일명·processId 를 읽지 못했다: 「${plain(row.cells[0]).slice(0, 40)}」 · ${where}`);
      continue;
    }
    rowCount++;

    /* ── 등재 경로 확정 + A11-5 유령 등재 ── */
    const rels = [];
    for (const k of keys) {
      if (k.kind === 'process') { rels.push(processAssetRel(k.id)); continue; }
      if (k.rel === null) {
        hits['A11-6'].push(`${LEDGER_REL()}:${row.line} — 파일 「${k.raw}」의 경로를 정할 수 없다(표 앞머리에 경로 선언이 없다) · ${where}`);
        continue;
      }
      rels.push(k.rel);
    }
    for (const rel of rels) {
      registered.set(rel, { row, table: t, where });
      if (!existsSync(path.join(PROJECT, rel))) {
        hits['A11-5'].push(`${rel} — 원장 ${LEDGER_REL()}:${row.line} 에 등재됐으나 디스크에 없다 · ${where}`);
      }
    }
    const tag = rels.length > 0 ? rels.map((r) => path.basename(path.dirname(r)) + '/' + path.basename(r)).join(', ') : plain(row.cells[0]).slice(0, 24);

    /* ── A11-2 필수 필드 ── */
    for (const [label, key] of [['공정', '공정'], ['장비', '장비'], ['무엇을 보여주는가', '무엇'], ['근거 출처', '근거'], ['검수자', '검수자']]) {
      const i = idx[key];
      if (i === null) {
        hits['A11-2'].push(`${tag} — 「${label}」 **열 자체가 없다** · ${where}`);
        continue;
      }
      if (!isFilled(row.cells[i])) {
        hits['A11-2'].push(`${tag} — 「${label}」 칸이 비었거나 자리표시자다: 「${plain(row.cells[i]).slice(0, 24)}」 · ${LEDGER_REL()}:${row.line}`);
      }
    }

    /* ── A11-3 제작자 ≠ 검수자 ── */
    if (idx.제작자 === null || idx.검수자 === null) {
      hits['A11-3'].push(`${tag} — 「${idx.제작자 === null ? '제작자' : '검수자'}」 열이 없어 독립성을 **검사할 수 없다** · ${where}`);
    } else {
      const makers = peopleSet(row.cells[idx.제작자]);
      const reviewers = peopleSet(row.cells[idx.검수자]);
      const both = [...makers].filter((m) => reviewers.has(m));
      if (both.length > 0) {
        hits['A11-3'].push(`${tag} — 🔴 제작자와 검수자가 같다: ${both.join(', ')} (제작자 「${plain(row.cells[idx.제작자])}」 · 검수자 「${plain(row.cells[idx.검수자])}」) · ${LEDGER_REL()}:${row.line}`);
      }
    }

    /* ── A11-4 판정 상태 — 🔴 출하 트리에 실재하는 자산만 센다 ── */
    const shipped = rels.filter((rel) => existsSync(path.join(PROJECT, rel)) && isUnderAssets(rel));
    if (shipped.length > 0) {
      if (idx.판정 === null) {
        hits['A11-4'].push(`${tag} — 「판정」 열이 없다 · ${where}`);
      } else {
        const v = readVerdict(row.cells[idx.판정]);
        if (!v.pass) {
          for (const rel of shipped) {
            hits['A11-4'].push(`${rel} — 판정 「${v.label}」 (합격이 아닌데 출하 트리에 있다) · ${LEDGER_REL()}:${row.line}`);
          }
        }
      }
    }
  }
}

function LEDGER_REL() { return path.relative(PROJECT, LEDGER) || path.basename(LEDGER); }
function isUnderAssets(rel) {
  const abs = path.resolve(PROJECT, rel);
  const r = path.relative(ASSETS_DIR, abs);
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
}

/* ── A11-1 미등재 ── */
const images = walkImages(ASSETS_DIR);
const byExt = {};
for (const abs of images) {
  const ext = path.extname(abs).slice(1).toLowerCase();
  byExt[ext] = (byExt[ext] ?? 0) + 1;
  const rel = path.relative(PROJECT, abs).split(path.sep).join('/');
  if (!registered.has(rel)) hits['A11-1'].push(`${rel} — 원장 어느 행에도 등재돼 있지 않다`);
}

/* ═══════════════════ 판정 — 래칫 + 승격일 ═══════════════════ */

const verdicts = {};
let anyFail = false;
for (const id of CHECK_IDS) {
  const n = hits[id].length;
  const base = BASELINE[id] ?? 0;
  let verdict, why;
  if (n > base) { verdict = 'FAIL'; why = `기준선 ${base} 건을 넘었다(악화 금지 래칫) — 실측 ${n} 건`; }
  else if (n > 0 && TODAY >= A11_PROMOTE_ON) { verdict = 'FAIL'; why = `승격일 ${A11_PROMOTE_ON} 이 지났다 — 남은 ${n} 건이 그대로 실패다`; }
  else if (n === 0) { verdict = 'PASS'; why = '0건 — 이후 1건이라도 생기면 래칫으로 FAIL 이 된다'; }
  else { verdict = 'WARN'; why = `도입기 경고 — 기준선 ${base} 이내(${n}건). 승격일 ${A11_PROMOTE_ON} 까지 정리한다`; }
  verdicts[id] = { verdict, why, count: n, baseline: base };
  if (verdict === 'FAIL') anyFail = true;
}

const EXIT = anyFail ? 1 : 0;

/* ═══════════════════ 출력 ═══════════════════ */

if (AS_JSON) {
  console.log(JSON.stringify({
    ledger: LEDGER_REL(),
    assetsDir: path.relative(PROJECT, ASSETS_DIR),
    introducedOn: A11_INTRODUCED_ON, promoteOn: A11_PROMOTE_ON, today: TODAY,
    assetTables: assetTables.map((t) => ({ heading: t.heading, startLine: t.startLine, rows: t.rows.length })),
    ledgerRows: rowCount, registeredPaths: [...registered.keys()].sort(),
    images: images.length, imagesByExt: byExt,
    checks: CHECK_IDS.map((id) => ({ id, title: CHECK_TITLE[id], ...verdicts[id], hits: hits[id] })),
    exitCode: EXIT,
  }, null, 2));
  process.exitCode = EXIT;
} else {
  const L = (s = '') => console.log(s);
  L('check-a11 — 공정-이미지 정합성 (원장 전수 대조)');
  L(`  원장: ${LEDGER_REL()} — 자산 원장 표 ${assetTables.length}종 · 등재 행 ${rowCount}건 · 등재 경로 ${registered.size}건`);
  for (const t of assetTables) L(`        · ${t.heading} (${t.startLine}행 · ${t.rows.length}행)`);
  L(`  출하 트리: ${path.relative(PROJECT, ASSETS_DIR)} — 이미지 ${images.length}건 ` +
    `(${IMAGE_EXTS.map((e) => `${e} ${byExt[e] ?? 0}`).join(' · ')})`);
  L(`  도입 ${A11_INTRODUCED_ON} · 승격 ${A11_PROMOTE_ON} · 오늘 ${TODAY}`);
  L();
  L('  ID      실측  기준선  판정   내용');
  for (const id of CHECK_IDS) {
    const v = verdicts[id];
    const mark = v.verdict === 'PASS' ? '✅' : v.verdict === 'WARN' ? '🟡' : '❌';
    L(`  ${id.padEnd(7)} ${String(v.count).padEnd(5)} ${String(v.baseline).padEnd(6)} ${mark} ${v.verdict.padEnd(4)} ${CHECK_TITLE[id]}`);
  }
  L();
  for (const id of CHECK_IDS) {
    const v = verdicts[id];
    if (v.count === 0) continue;
    L(`  ── ${id} · ${CHECK_TITLE[id]} — ${v.count} 건 / 기준선 ${v.baseline} · ${v.verdict}: ${v.why}`);
    for (const h of hits[id].slice(0, 40)) L(`     · ${h}`);
    if (hits[id].length > 40) L(`     … 그리고 ${hits[id].length - 40} 건 더 (--json 으로 전건을 본다)`);
    L();
  }
  L('  🔴 이 게이트가 재지 못하는 것: 「그림 내용이 실제로 그 공정의 그 장비인가」는 사람이 판정한다.');
  L('     여기서 재는 것은 **그 판정이 원장에 기록됐고 · 독립된 사람이 했고 · 합격인가** 뿐이다.');
  L();
  if (EXIT === 1) {
    const bad = CHECK_IDS.filter((id) => verdicts[id].verdict === 'FAIL');
    L(`❌ check-a11 실패 — ${bad.join(' · ')} 가 기준선을 넘었거나 승격일이 지났다.`);
    L('   🔴 기준선을 올려 통과시키지 마라(D-041). 원장 등재·판정은 DSN 소관이다.');
  } else {
    const warn = CHECK_IDS.filter((id) => verdicts[id].verdict === 'WARN');
    L(`✅ check-a11 통과 — 악화 0건.` +
      (warn.length > 0
        ? ` 🔴 그러나 **A11 충족이 아니다** — 도입기 경고 ${warn.join(' · ')} 가 남아 있다(${warn.map((id) => `${id} ${verdicts[id].count}건`).join(' · ')}).`
        : ' 전 검사 0건.'));
    if (warn.length > 0) L(`   승격일 ${A11_PROMOTE_ON} 이 지나면 남은 건수가 그대로 FAIL 이 된다.`);
  }
  /* 🔴 `process.exit()` 는 버퍼에 남은 stdout 을 잘라먹는다(집안 실측). exitCode 만 세운다. */
  process.exitCode = EXIT;
}
