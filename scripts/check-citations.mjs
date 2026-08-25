#!/usr/bin/env node
/**
 * check-citations — **코드 주석이 인용한 명세 문구가 명세 「본문」에 살아 있는가**를 검사한다.
 *
 * 요구사항 정본: `projects/8대공정-001/17_check-citations_요구사항.md` (PLN · 2026-08-22) R-1 ~ R-7.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 표적은 「행번호가 밀린 것」이 아니라 「인용한 설계가 폐기된 것」이다
 * ══════════════════════════════════════════════════════════════════════════════
 *   `oxidation.ts` 는 명세 595 를 인용하며 「두께–시간 그래프의 곡선이 처음 20 nm 구간에서는
 *   직선(기울기 B/A)이다가 …」라고 적어 두었다. 그 설계는 **2026-08-21 DP-1 판정으로 삭제됐다.**
 *   행번호를 595 → 정정값으로 고쳐도 **인용은 여전히 죽어 있다.** 그래서 행번호가 아니라
 *   **인용문 자체**를 대조한다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 R-4 — 「명세 전문에서 완전 일치 검색」만 하면 **거짓 통과**가 난다
 * ══════════════════════════════════════════════════════════════════════════════
 *   **폐기 배너 자체가 폐기된 문구를 다시 적는다.** 실물:
 *     03_실습3단계명세.md:727
 *       `> 🔵 PLN 정정 2026-08-21 (DP-1 판정) — 「처음 20 nm 구간에서는 직선」을 삭제했다.`
 *   「처음 20 nm 구간에서는 직선」은 **명세 전체에서 이 한 곳에만 있다.** 단순 검색은
 *   「있다 → 통과」라고 답한다. **삭제 선언문을 존재 증거로 오독하는 것**이다.
 *   → 이것은 `check-gate-registration.mjs` 가 이미 겪은 함정과 같은 종류다(「편입하지 **않는다**」고
 *     적은 문장을 근거로 「편입됐다」고 오판). 부정문·폐기문 안의 문자열을 긍정 증거로 쓰면 안 된다.
 *
 *   ── 배제 경계를 어떻게 잡았는가 (🔴 근거 전문은 아래 「R-4 v2」 절에 있다) ─────
 *   요구사항 R-4 는 배제 대상 3종을 든다: ①`>` 인용 블록 ②`~~취소선~~` ③배너 표지 문구가 있는 블록.
 *   그런데 R-4 주의문이 **반대 방향 오류**를 경고한다 — 「`>` 면 무조건 폐기」로 단정하지 마라.
 *
 *   🔴 **실측(2026-08-22, 4,494행): `>` 로 시작하는 행이 754 행(16.8 %)이고 그중에 살아 있는 정본이 실재한다.**
 *      03:546~559 는 `>` 블록인데 살아 있는 정본이고, `wafer.ts:245` 가 인용하는
 *      「세로축 200 ± 3 mm 만 확대」는 **명세 전체에서 그 한 곳뿐**이다.
 *      **`>` 를 통째로 배제하면 살아 있는 인용이 거짓 실패로 잡힌다.**
 *
 *   → **①과 ③을 AND 로 걸되(v1), 배제 단위를 블록에서 S1 행 / S2 절 / S3 블록으로 쪼갰다(v2).**
 *     ②취소선은 위치와 무관하게 항상 제거한다(취소선은 그 자체가 철회 표시다).
 *     v1 → v2 로 배제가 **417 행(9.3 %) → 101 행(2.2 %)** 로 줄었다. 🔴 **줄어드는 것이 강화다** —
 *     배제가 좁아질수록 **검사하는 인용이 늘어난다.** 자세한 근거·반례·남은 구멍은 아래 R-4 v2 절.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 부분문자열 검사를 쓰지 않는 곳 / 쓰는 곳
 * ══════════════════════════════════════════════════════════════════════════════
 *   · **인용문의 추출**은 부분문자열이 아니다 — TypeScript 컴파일러 API 로 **주석 범위**를 뽑고,
 *     그 안에서 `「」` 를 **괄호 깊이**로 짝지어 뜯는다(중첩 인용이 실재한다:
 *     `oxidation.ts` 의 인용문 안에 `「선형 → 포물선 전이(x ≈ A)」` 캡션이 또 들어 있다).
 *     문자열 리터럴은 AST 상 주석이 아니므로 **학습자용 UI 문구의 「」는 애초에 후보가 아니다**(AC-R1).
 *   · **인용문과 명세의 대조**는 정규화 후 **완전 일치**다. 정규화는 양쪽에 똑같이 적용한다.
 *   · 🔴 `typescript` 는 이미 devDependency 다. 불러오지 못하면 **종료코드 2(계측기 고장)** 로 낸다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 판정 규칙
 * ══════════════════════════════════════════════════════════════════════════════
 *   R-1  **어느 문서인지 특정되는 표지**(`03_실습3단계명세` · `명세 <숫자>` · `명세 §` · `PLN 명세` 인접)
 *        **뒤에** 오는 `「…」` 만 검사 대상이다. 낱말 `명세`·`원문:` 만으로는 인정하지 않는다(오검출 4건 실측).
 *   R-2  인용문(생략부호로 나뉜 각 조각)을 명세 **본문**에서 완전 일치 검색.
 *        0건 → **FAIL** · 2건 이상 → **WARN(모호)** · 1건 → PASS
 *   R-3  조각의 실질 길이(한글·숫자·영문 글자 수)가 12 미만 → **WARN(짧음)**
 *   R-4  폐기 영역을 본문에서 제외한 뒤 검색한다(위 참조). 배제 영역은 전부 출력한다.
 *   R-5  행번호 인용(`명세 <숫자>`·`03:<숫자>`) 금지 패턴 — 도입기에는 WARN. 승격 조건은 아래 R5_* 참조.
 *   R-6  `PLN §…` 절 인용은 **이번엔 집계만** 한다(표제 서식이 통일되기 전에는 대조 기준이 없다).
 *   R-7  게이트 자체 규율 — 종료코드 분리 · UNDETERMINED 를 PASS 에 섞지 않음 · 픽스처 양방향.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 종료코드 — 집안 규약 { **0** 통과 · **1** 판정 실패 · **2** 계측기 고장 · **4** 판정 불가 }
 * ══════════════════════════════════════════════════════════════════════════════
 *   🔴 **우선순위: ERROR(2) > FAIL(1) > UNDETERMINED(4) > PASS(0).**
 *      「재지 못했다」를 「위반을 찾았다」로도 「깨끗하다」로도 옮기지 않는다.
 *   2 가 되는 경우: 명세·소스 없음 · `typescript` 미탑재 · 파일 파싱 실패 ·
 *                  **주석 안의 「 가 닫히지 않아 인용을 해석하지 못함**(= 그 자리를 재지 못한 것).
 *   4 가 되는 경우: 인용은 뽑았으나 정규화 후 대조할 글자가 남지 않음.
 *   🔴 3 은 쓰지 않는다 — `selftest-gates` 가 「다른 실행 중」으로 이미 쓴다.
 *   → verify.mjs §V 표에서 `CODES.LIVE_JUDGMENT`(0/1/2/4) 로 해석돼야 한다.
 *
 * 사용: node scripts/check-citations.mjs [--json]
 *       [--src <dir>] [--spec <file>] [--r5-baseline <n>] [--r5-ext-baseline <n>]  ← 🔴 픽스처 전용 주입구
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const PROJECT = path.resolve(APP, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

/* 🔴 `--src` / `--spec` / `--r5-baseline` 은 **픽스처 전용 주입구**다.
 *    위반 코드를 실제 `src/` 에 심으면 같은 트리를 동시에 고치는 다른 담당의 게이트 측정이
 *    오염된다(2026-08-21 실측 사고 · check-guard-naming.selftest.mjs 머리주석). */
const SRC_DIR = path.resolve(flag('--src') ?? path.join(APP, 'src'));
const SPEC_PATH = path.resolve(flag('--spec') ?? path.join(PROJECT, '03_실습3단계명세.md'));

/* ═══════════════════ R-3 · 인용문 최소 길이 ═══════════════════
 * 🔴 12 는 **PLN 이 정한 운영 임계이지 측정값이 아니다**(요구사항 §5 U-2 — 미측정).
 *    오검출이 나면 조정하되, **조정 사유를 반드시 이 자리에 날짜와 함께 남긴다.**
 *    근거 없이 옮기면 D-041(기준을 결과에 맞춰 옮김)이다.
 * 조정 이력: (없음 — 2026-08-22 도입값 12 그대로) */
const MIN_EVIDENCE_CHARS = 12;

/* ═══════════════════ R-5 · 행번호 인용 금지 패턴의 승격 조건 ═══════════════════
 * 요구사항 R-5: 「1차 도입 시 경고, 15건 정리 후 실패로 승격. 🔴 승격 시점을 코드 주석에 날짜로 박아라.」
 *
 * 🔴 「나중에 올리자」가 안 올라가는 것을 막기 위해 **세 갈래 모두** 기계에 맡긴다:
 *   ① 건수가 0 이 되면 그 뒤로는 **1건만 생겨도 FAIL**(래칫 — 되돌아갈 수 없다)
 *   ② 건수가 도입 시점 기준선(15)을 **넘으면 즉시 FAIL**(악화 금지)
 *   ③ 아래 날짜가 지나면 **남아 있는 건수가 그대로 FAIL**  ← 이것이 「날짜로 박은 승격 시점」
 * 도입일 2026-08-22 · 승격일 2026-08-29 (정리 기간 7일). 날짜를 미루려면 PLN 판정을 받아라.
 *
 * 🔴 **기준선이 왜 15 가 아니라 18 인가 — 세는 규칙이 다르다. 결과에 맞춰 옮긴 것이 아니다(D-041).**
 *    PLN 실측표(요구사항 §1-1)는 `명세 <숫자>` **15** · `03:<숫자>` **1** 로 적었다.
 *    이 게이트는 **출현 횟수**를 세고, `fixed.ts` 가 문서명 뒤에 이어 붙인 `` `:2565` ``·`` `:3742` ``
 *    **2건**을 별개 행번호 인용으로 센다(PLN 표는 이 둘을 `03:<숫자>` 한 행에 묶었다).
 *    15 + 1 + 2 = **18** = 도입일(2026-08-22) 실측치. 래칫의 기준선은 「도입일 실측치」여야 성립한다.
 *    🔴 **이 수를 올리지 마라. 내리기만 한다.** 올려야 할 이유가 생기면 PLN 판정을 먼저 받아라. */
const R5_INTRODUCED_ON = '2026-08-22';
const R5_PROMOTE_TO_FAIL_ON = '2026-08-29';
const R5_BASELINE = Number(flag('--r5-baseline') ?? 18);
/* 🔴 확장 형태(E1·E2)의 **별도** 래칫 기준선. 2026-08-22 후속 도입일 실측치.
 *    원 기준선 18 을 올린 것이 **아니다** — 새로 세기 시작한 형태의 첫 실측치이며, 둘은 각각 래칫한다.
 *    🔴 이 수도 올리지 마라. 내리기만 한다. */
const R5_EXT_BASELINE = Number(flag('--r5-ext-baseline') ?? 11);

/* ═══════════════════ 실행 오류(종료코드 2) 경로 ═══════════════════ */
function bail(msg, hint) {
  console.error(`⚠️  check-citations 실행 오류 — ${msg}`);
  if (hint) console.error(`   ${hint}`);
  console.error('   🔴 이것은 「위반 없음」도 「위반 있음」도 아닙니다. 재지 못한 것입니다(종료코드 2).');
  process.exit(2);
}

if (!existsSync(SRC_DIR)) bail(`소스 디렉터리가 없습니다: ${SRC_DIR}`);
if (!existsSync(SPEC_PATH)) {
  bail(`명세 파일이 없습니다: ${SPEC_PATH}`,
    '대조 정본을 읽지 못하면 「인용이 죽었는지」와 「못 읽었는지」를 구분할 수 없습니다.');
}

let ts;
try {
  ts = createRequire(import.meta.url)('typescript');
} catch (e) {
  bail(`typescript 를 불러오지 못했습니다: ${e.message}`,
    '`npm i` 로 devDependency 를 설치하세요. 🔴 정규식으로 주석을 긁어내지 마십시오 — 문자열 리터럴에 속습니다.');
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 1. 명세 본문 만들기 — R-4 폐기 영역 배제
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 🔴 배너 표지 문구 — 요구사항 R-4 ③이 든 것 그대로. 늘리지 마라(늘리면 배제가 넓어져 거짓 실패가 는다). */
const BANNER_MARKERS = ['폐기', '삭제했다', '보류', '미검증', '정본이 아니다', '채택하지 않는다'];

let specRaw;
try {
  specRaw = readFileSync(SPEC_PATH, 'utf8');
} catch (e) {
  bail(`명세를 읽지 못했습니다: ${e.message}`);
}
const specLines = specRaw.split(/\r?\n/);
/* 파일 끝 개행이 만드는 빈 원소는 행이 아니다 — 행 수를 정확히 말하기 위해 뗀다. */
if (specLines.length && specLines[specLines.length - 1] === '') specLines.pop();

/** `~~취소선~~` 스팬 제거 — 위치와 무관하게 항상. 철회 표시 그 자체이기 때문이다. */
const STRIKE_RE = /~~([\s\S]*?)~~/g;
const strikeSpans = [];
const specLinesNoStrike = specLines.map((ln, i) => ln.replace(STRIKE_RE, (m) => {
  strikeSpans.push({ line: i + 1, text: m.length > 90 ? m.slice(0, 90) + '…' : m });
  return ' ';
}));

/** `>` 인용 블록을 최대 연속 구간으로 묶는다((다) 참조). */
function blockquoteBlocks(lines) {
  const blocks = [];
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const isQ = /^\s*>/.test(lines[i]);
    if (isQ && start < 0) start = i;
    if (!isQ && start >= 0) { blocks.push({ from: start, to: i - 1 }); start = -1; }
  }
  if (start >= 0) blocks.push({ from: start, to: lines.length - 1 });
  return blocks;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 R-4 v2 (2026-08-22 오케 판정으로 정밀화) — **배제 단위를 블록에서 3단계로 쪼갠다**
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── v1 이 무엇을 잘못했나 (실물 피해로 확인됨) ───────────────────────────────
 *   v1 = 「`>` 블록 **어딘가에** 배너 낱말이 있으면 **블록 전체** 배제」.
 *   그래서 `03:2633–2674`(P7 공통 상수 — **살아 있는 정본 42행**)이
 *   **L2664 표 한 칸**의 「폐기·대조용」 낱말 하나 때문에 통째로 죽었다.
 *     · `eds.ts:171` 「공통 상수(교육용 설정값)」의 **참뜻의 자리는 L2635 다.** 그 자리가 배제돼 있어
 *       **참뜻의 자리로는 영영 통과할 수 없었다** — 다른 두 곳(L3377·L4214)에 걸려 「모호」로 통과했다.
 *     · `fixed.ts:15`·`:16` 「웨이퍼 지름 D = 300 mm」는 L2636·L3813 **2곳**에 살아 있는데
 *       L2636 이 배제돼 「유일 1곳」으로 보이고, 게다가 **「배제영역 1곳 — 거짓 통과였다」는 거짓 경고**가 붙었다.
 *   🔴 **이 정밀화는 완화가 아니라 강화다.** 배제를 좁히면 **검사하는 인용이 늘어난다.**
 *      완화는 배제를 넓혀 검사에서 빼는 것이다.
 *
 * ── v2 배제 단위 (좁은 것부터) ───────────────────────────────────────────────
 *   S1 · **행**   — `>` 블록 안에서 배너 표지를 **가진 그 행**만.
 *                   (표 한 칸·문장 하나의 폐기 표시가 블록 전체를 죽이지 않는다.)
 *   S2 · **절**   — 표지를 가진 행이 **표제**(`> #`~`> ######`)면, 그 표제부터
 *                   **같거나 상위 수준의 다음 표제 직전**(없으면 블록 끝)까지.
 *                   근거: 표제는 자기 아래를 지배한다. `03:3050` 「### 아직 보류인 것 (별건)」이 실물.
 *   S3 · **블록** — 블록의 **첫 비어 있지 않은 행**에 표지가 있으면 블록 전체.
 *                   근거: **배너는 머리에서 자신을 선언한다.** 14개 블록 전수로 확인했다 —
 *                   진짜 폐기·보류 배너 4개(L727·L1598·L1941·L2823)는 **전부 첫 행이 선언문**이고,
 *                   살아 있는 정정·확정 블록 9개는 **첫 행에 표지가 없다.**
 *   🔴 S3 은 첫 행이 **표(`|`)이면 발동하지 않는다** — 표 행은 선언이 아니라 자료다.
 *
 * ── 배제 규모 실측 (같은 스냅샷 4,494행) ─────────────────────────────────────
 *   v1: 14 블록 · **417 행 (9.3 %)**  →  v2: **약 101 행 (2.2 %)**. 🔴 **줄어야 정상이다.**
 *
 * ── 🔴 v2 가 여전히 틀릴 수 있는 경우 (숨기지 않는다) ────────────────────────
 *   (라) **앞 블록이 뒤 블록을 지배하는 「앞서 선언」**을 못 본다.
 *        `03:1598–1632` 이 「R_p 표의 100 keV 이외 11개 열은 보류」라고 선언하지만
 *        정작 그 표는 **다른 블록** `03:1641–1650` 에 있다. v2 는 L1648 한 줄만 뺀다.
 *        같은 형태: `03:2112` 「아래부터가 폐기·대조용 본문이다」 — 지배 대상이 블록 **밖**이다.
 *        → 이 방향은 **거짓 통과**라 위험하다. **현 스냅샷에서 그 영역을 인용하는 코드는 0건**이지만
 *          (게이트가 매 실행 확인한다) 생기면 잡지 못한다. 블록 간 지배 관계는 기계로 못 읽었다.
 *   (마) 표지 낱말이 **살아 있는 문장 안에** 있으면 그 한 줄이 헛되이 빠진다(S1). 피해는 1행이다.
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 🔴 「보류 **해제**」는 보류 선언이 아니다 — 정확히 반대다.
 *  `03:642` 「# ✅ 보류 해제 — Deal–Grove 정본표로 전량 재산출 완료」가 낱말 「보류」 하나로
 *  46행짜리 **살아 있는 정본표**를 통째로 죽였다. 취소 표현만 좁게 무효화한다.
 *  🔴 이 목록을 늘리지 마라 — 늘릴수록 진짜 폐기를 놓친다. */
const BANNER_CANCELS = [/보류\s*(?:를|가)?\s*(?:해제|해소)/g];
function markersIn(line) {
  let t = line;
  for (const re of BANNER_CANCELS) { re.lastIndex = 0; t = t.replace(re, '⟪취소⟫'); }
  return BANNER_MARKERS.filter((m) => t.includes(m));
}

/** 인용 부호(`>`)를 벗긴 뒤의 줄 종류. S2·S3 판정에 쓴다. */
function lineKind(raw) {
  const b = raw.replace(/^\s*>\s?/, '');
  const h = b.match(/^(#{1,6})\s/);
  if (h) return { kind: 'H', level: h[1].length };
  if (/^\s*\|/.test(b)) return { kind: 'TABLE', level: 0 };
  if (/^\s*$/.test(b)) return { kind: 'BLANK', level: 0 };
  return { kind: 'TEXT', level: 0 };
}

const excludedLines = new Set();   // 0-based
const excludedRegions = [];        // AC-R4b — 전부 출력한다
const addRegion = (from, to, markers, scope, head) => {
  for (let i = from; i <= to; i++) excludedLines.add(i);
  excludedRegions.push({
    from: from + 1, to: to + 1, markers, scope,
    head: (head ?? specLinesNoStrike[from]).replace(/\s+/g, ' ').trim().slice(0, 96),
  });
};

for (const b of blockquoteBlocks(specLinesNoStrike)) {
  /* S3 — 첫 비어 있지 않은 행이 선언문인가 */
  let firstIdx = b.from;
  while (firstIdx <= b.to && lineKind(specLinesNoStrike[firstIdx]).kind === 'BLANK') firstIdx++;
  if (firstIdx > b.to) continue;
  const headMarkers = markersIn(specLinesNoStrike[firstIdx]);
  if (headMarkers.length && lineKind(specLinesNoStrike[firstIdx]).kind !== 'TABLE') {
    addRegion(b.from, b.to, headMarkers, 'S3 블록(머리행이 배너 선언)');
    continue;
  }
  /* S1 / S2 — 블록 안을 줄 단위로 훑는다 */
  for (let i = b.from; i <= b.to; i++) {
    const ms = markersIn(specLinesNoStrike[i]);
    if (!ms.length) continue;
    const lk = lineKind(specLinesNoStrike[i]);
    if (lk.kind === 'H') {
      let end = b.to;
      for (let j = i + 1; j <= b.to; j++) {
        const nk = lineKind(specLinesNoStrike[j]);
        if (nk.kind === 'H' && nk.level <= lk.level) { end = j - 1; break; }
      }
      addRegion(i, end, ms, `S2 절(표제 H${lk.level} 이 지배)`);
    } else {
      addRegion(i, i, ms, `S1 행(${lk.kind})`);
    }
  }
}

/** 정규화 — 🔴 명세 쪽과 인용문 쪽에 **똑같이** 적용한다. 한쪽만 하면 대조가 성립하지 않는다.
 *  · `**` 마크다운 강조 제거 (명세 본문은 강조를 쓰고 주석 인용은 안 쓰거나 위치가 다르다)
 *  · 백틱 제거 (같은 이유)
 *  · 모든 공백류(줄바꿈·NBSP 포함)를 한 칸으로 접기 — 주석 인용은 여러 줄에 걸쳐 있다 */
function norm(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '')
    .replace(/[\s ​  ]+/g, ' ')
    .trim();
}

const bodyIndex = [];   // 살아 있는 본문
const deadIndex = [];   // 배제된 영역 — 「폐기 영역 안에는 있었다」를 말하기 위해 남긴다
specLinesNoStrike.forEach((ln, i) => {
  const t = norm(ln);
  if (!t) return;
  (excludedLines.has(i) ? deadIndex : bodyIndex).push({ line: i + 1, text: t });
});

/** 🔴 실패한 인용이 **아주 죽었는지** 아니면 **글자 몇 개가 어긋났는지**를 사람이 즉시 알게 한다.
 *  본문에 존재하는 **가장 긴 앞부분**을 이분 탐색으로 찾아 그 자리를 보고한다.
 *  (판정에는 쓰지 않는다 — 진단 정보다. R-2 는 완전 일치 그대로다.) */
function longestLivePrefix(index, needle) {
  let lo = 0, hi = needle.length, best = 0, bestLine = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const probe = needle.slice(0, mid);
    const hit = mid > 0 && index.some((r) => r.text.includes(probe));
    if (hit) { best = mid; bestLine = index.find((r) => r.text.includes(probe))?.line ?? null; lo = mid + 1; }
    else hi = mid - 1;
  }
  return { len: best, text: needle.slice(0, best), line: bestLine };
}

function countIn(index, needle) {
  let n = 0; const hits = [];
  for (const row of index) {
    let i = 0, c = 0;
    while ((i = row.text.indexOf(needle, i)) >= 0) { c++; i += needle.length; }
    if (c) { n += c; hits.push({ line: row.line, count: c }); }
  }
  return { n, hits };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 2. 소스에서 **주석**을 구조적으로 뽑는다 (R-1)
 * ══════════════════════════════════════════════════════════════════════════════ */

function walkSrc(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSrc(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

let files;
try { files = walkSrc(SRC_DIR).sort(); } catch (e) { bail(`소스 트리를 읽지 못했습니다: ${e.message}`); }
if (files.length === 0) bail(`검사할 .ts/.tsx 파일이 없습니다: ${SRC_DIR}`, '0건 통과는 「위반 없음」이 아니라 「재지 못함」입니다.');

/** AST 를 걸어 주석 범위를 모은다. 🔴 정규식으로 긁지 않는다 — 문자열 리터럴 안의 `//` 에 속는다.
 *  JsxText 는 건너뛴다: JSX 본문의 `//` 는 주석이 아니지만 트리비아 스캐너는 주석으로 읽는다. */
function commentRanges(sf, text) {
  const seen = new Set(); const out = [];
  const push = (r) => { const k = `${r.pos}:${r.end}`; if (!seen.has(k)) { seen.add(k); out.push(r); } };
  (function visit(node) {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      const lead = ts.getLeadingCommentRanges(text, node.getFullStart());
      if (lead) lead.forEach(push);
      const trail = ts.getTrailingCommentRanges(text, node.getEnd());
      if (trail) trail.forEach(push);
    }
    node.forEachChild(visit);
  })(sf);
  out.sort((a, b) => a.pos - b.pos);

  /* 🔴 **잇달아 붙은 `//` 줄은 한 덩어리의 주석이다.** 파서는 줄마다 따로 돌려주는데,
   *    사람은 한 문단으로 쓴다. 실물: `wafer.ts:684~686` 이 「합격창의 / 정본은 refLines 다」를
   *    두 `//` 줄에 걸쳐 적었다. 따로 보면 첫 줄의 `「` 가 **닫히지 않은 것으로 보여** 해석 실패가 난다.
   *    → 사이에 **공백과 줄바꿈 하나만** 있는 연속 `//` 는 이어 붙인다. `/* *\/` 블록이 이미
   *      여러 줄을 한 덩어리로 다루는 것과 같은 취급이다. */
  const merged = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    const joinable = prev
      && prev.kind === ts.SyntaxKind.SingleLineCommentTrivia
      && r.kind === ts.SyntaxKind.SingleLineCommentTrivia
      && /^[ \t]*\r?\n[ \t]*$/.test(text.slice(prev.end, r.pos));
    if (joinable) { prev.end = r.end; prev.joined = (prev.joined ?? 1) + 1; }
    else merged.push({ ...r });
  }
  return merged;
}

/** 주석 구문(`//`·`/* *\/`·행머리 `*`)을 벗기고, **글자마다 원본 오프셋을 기억**한다.
 *  기억해 두어야 인용문이 몇 행에 있는지 정확히 말할 수 있다. */
function cleanComment(raw, base) {
  const chars = []; const map = [];
  const isBlock = raw.startsWith('/*');
  let i = isBlock ? 2 : 2;
  if (isBlock && raw[i] === '*') i++;
  const end = isBlock && raw.endsWith('*/') ? raw.length - 2 : raw.length;
  let atLineStart = false;
  while (i < end) {
    const c = raw[i];
    if (c === '\n' || c === '\r') {
      if (chars.length && chars[chars.length - 1] !== ' ') { chars.push(' '); map.push(base + i); }
      atLineStart = true; i++; continue;
    }
    if (atLineStart) {
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '*') { i++; if (raw[i] === ' ') i++; atLineStart = false; continue; }
      /* 이어 붙인 `//` 덩어리 — 둘째 줄부터의 `//` 도 주석 구문이므로 벗긴다. */
      if (!isBlock && c === '/' && raw[i + 1] === '/') { i += 2; if (raw[i] === ' ') i++; atLineStart = false; continue; }
      atLineStart = false;
    }
    chars.push(c); map.push(base + i); i++;
  }
  return { text: chars.join(''), map };
}

const OPEN = '「';  // 「
const CLOSE = '」'; // 」

/** 🔴 괄호 **깊이**로 짝짓는다. 중첩 인용이 실재하므로 첫 `」` 에서 끊으면 인용문이 잘린다. */
function bracketQuotes(text) {
  const found = []; let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === OPEN) { if (depth === 0) start = i; depth++; }
    else if (ch === CLOSE && depth > 0) { depth--; if (depth === 0) found.push({ start, end: i }); }
  }
  return { found, unbalanced: depth > 0 };
}

/* ═══════════════════ R-1 · 무엇을 「명세 인용」으로 인정하는가 ═══════════════════
 *
 * 요구사항 R-1 은 표지를 `명세`·`03_실습3단계명세`·`PLN 명세`·`원문:` 로 든다.
 * 🔴 **낱말 `명세` 와 `원문:` 를 그대로 쓰면 오검출이 난다 — 실측으로 4건 확인했다**
 *    (AC-R1 은 오검출 0건을 요구한다). 실물:
 *      · `deposition.ts:22`  「PLN **명세**에서 뺀 것과 그 사유 — 전부 「구현할 물리가 없어서」다」
 *          → 「」 안은 **글쓴이 자신의 말**이지 명세 인용이 아니다.
 *      · `etch.ts:43`        「사유는 심화 **명세** 안 §「씬 없음」 주석에 적어 뒀다」
 *          → 여기서 「명세」는 **이 코드 안의 다른 주석 블록**을 가리킨다.
 *      · `photo.ts:445`      「(`spec.ts` 정의 **원문:** 「이 차트가 판정을 보여주는 출력 id 들」)」
 *          → 인용 원본이 `spec.ts` 다. `03` 이 아니다.
 *      · `polishProfile.model.ts:41` 「`이미지/씬「명세」/scene_stepCoverage.md` §5 …: 「…」」
 *          → `명세` 가 **다른 문서 이름의 일부**다.
 *
 * → 그래서 표지를 **「어느 문서를 가리키는지 특정되는 형태」로만** 인정한다:
 *     ① 문서명 자체(`03_실습3단계명세`)          ② `명세 <숫자>` / `명세 <숫자>행`
 *     ③ `명세 §`(공백만 사이에 둔 형태)          ④ `PLN 명세` **바로 뒤**에 「 가 오는 형태
 *     ⑤ 같은 주석에서 ①이 이미 나온 뒤의 `` `:<숫자>` `` 연속 표기(`fixed.ts` 형식)
 *
 * 🔴 **이 좁힘의 대가를 숨기지 않는다.** 낱말 `명세` 만 있고 위 형태가 아닌 인용은
 *    **검사되지 않는다**(예: `photo.ts:441` 「위 주석의 명세 독해는 맞다: 「판정은 이 차트에서 한다」…」).
 *    → 그런 건은 아래 「표지처럼 보이나 형태가 아님」 목록에 **전건 출력**한다. 조용히 버리지 않는다.
 */
const CITE_RULES = [
  { id: '문서명', re: /03_실습3단계명세/ },
  { id: '명세+행번호', re: /명세\s*\d+\s*행?/ },
  { id: '명세+절', re: /명세\s*§/ },
];
/** 인접형 — 표지와 「 사이에 강조기호·공백만 허용한다(`PLN 명세 「…」`). */
const CITE_ADJACENT = [{ id: 'PLN 명세(인접)', re: /PLN\s*명세\s*[*`\s]*$/ }];
/** 연속 표기 — 같은 주석에 ①이 이미 나온 뒤의 `` `:2565` `` 꼴. */
const CITE_CONT = /`\s*:\s*\d+\s*`\s*[*`\s]*$/;
/** 나열 이어받기 — `「기초 (S5)」·「응용 (S6)」` 처럼 구분기호만 사이에 둔 나열은 앞 인용의 표지를 잇는다. */
const LIST_SEPARATOR_ONLY = /^[\s·,、/|*`()]*$/;
/** 「표지처럼 보이는」 낱말 — 형태 불일치로 뺀 것을 사각지대에 올리기 위한 판별용. */
const LOOKS_LIKE_MARKER = /명세|원문:|03_/;
/** 표지와 여는 「 사이에 허용하는 거리(글자 수). 실측 최대는 `명세 494: Δρ 불합격으로 종료하려 하면 ` = **24**. */
const MARKER_WINDOW = 40;
/* 🔴🔴 **「조용히 검사에서 빠지는 것」을 막는다.**
 *    표지와 여는 「 사이에 말이 끼어 `MARKER_WINDOW` 를 넘으면 그 인용은 검사되지 않는다.
 *    창을 좁히면 **검사 인용이 23 → 22 로 줄고 아무 경고도 안 났다**(2026-08-22 실측).
 *    → 사각지대 **판별용 창은 더 넓게** 잡아서, 창 밖의 표지도 「표지처럼 보이나 형태가 아님」 목록에
 *      **반드시 뜨게** 한다. 판정 창(40)과 경보 창(140)을 분리한 이유가 이것이다.
 *    🔴 이 둘을 같은 값으로 되돌리지 마라 — 되돌리면 창 밖 인용이 「표지 없음」에 섞여 보이지 않게 된다. */
const NEAR_MARKER_WINDOW = 140;

/** 실질 길이 — 한글·숫자·영문 글자만 센다(공백·기호는 우연 일치에 기여하지 않는다). */
const evidenceLen = (s) => (s.match(/[가-힣0-9A-Za-z]/g) || []).length;

/* R-5 · R-6 패턴 */
const R5_LINEREF = /명세\s*\d+\s*행?/g;
const R5_DOCREF = /(?:03_실습3단계명세\.md|(?<![0-9A-Za-z])03)\s*:\s*\d+/g;
const R5_CONTREF = /`\s*:\s*\d+\s*`/g;   // fixed.ts 의 `` `:2565` `` 꼴 연속 표기 — 문서 인용이 이미 있는 주석에서만 센다

/* ═══════════════ R-5 확장 형태 (2026-08-22 후속 — 오케 지적으로 신설) ═══════════════
 * 🔴 **원 패턴 3종이 못 잡는 행번호 인용이 실재한다.** 발견 경위: 명세가 +71~+130행 밀렸는데
 *    `viz/chart/common.ts:19` 의 「476행」이 **R-5 어디에도 안 걸려** 손으로 챙겨야 했다.
 *    형태: `` PLN `03_실습3단계명세.md` 476행 「…」 `` — 숫자가 **낱말 `명세` 가 아니라 문서명 뒤**에 온다.
 *
 * 🔴 **원 래칫(R5_BASELINE=18)에 합치지 않는다.** 세는 규칙이 달라졌으므로 **기준선을 따로 둔다.**
 *    원 기준선 18 을 올리는 것은 D-041(기준을 결과에 맞춰 옮김)이 되고,
 *    확장분을 원 기준선에 욱여넣으면 원 래칫이 즉시 오발한다. **두 래칫을 나란히 돌린다.**
 * E1 문서명 뒤의 행번호(들) — `…명세.md` 476행` · `(PLN 03_…명세.md 426·476·595·809)`
 * E2 `PLN <숫자>` 꼴 — `PLN 476행` · `PLN 426 「…」` · `(PLN 427)`
 *    🔴 날짜(`PLN 2026-08-21`)와 문서명 앞머리(`PLN 03_…`)를 부정예측으로 막았다. */
const R5_EXT = [
  { kind: 'E1 문서명 뒤 <숫자>', re: /(?:03_실습3단계명세(?:\.md)?)`?\s*(\d+(?:\s*[·,]\s*\d+)*)\s*행?/g },
  /* 🔴 E2 의 알려진 오검출 — `PLN 275 Ω`(저항값)·`PLN 302 ✅`(두께값)처럼 **PLN 이 제시한 수치**를
   *    가리키는 표기가 실재한다. 뒤에 단위가 붙는 것은 막았지만 `PLN 302 ✅` 는 막지 못했다.
   *    → 게이트가 그 한계를 **출력에 적어 사람이 거른다**. 조용히 세지 않는다. */
  { kind: 'E2 PLN <숫자>', re: /PLN\s*(\d{1,4})(?![\d\-.\/_])(?!\s*(?:Ω|nm|µm|um|mm|cm|kV|mV|V|nA|mA|A|°C|K|%|min|ms|rpm|slm|torr|ppm|원|개|배|회)(?![A-Za-z]))\s*행?/g },
];
const R6_SECTION = /PLN\s*§/g;

const citations = [];     // 검사 대상으로 인정한 인용
const skippedQuotes = [];  // 🔴 사각지대 — 표지 없는 「」. 숨기지 않는다
const r5Hits = [];
const r5ExtHits = [];   // 확장 형태 — 원 래칫과 **분리해서** 센다
let r6Comment = 0, r6String = 0;
const r6Files = new Map();
const bump6 = (rel, n, where) => {
  const cur = r6Files.get(rel) ?? { comment: 0, string: 0 };
  cur[where] += n; r6Files.set(rel, cur);
};
const parseErrors = [];
const readErrors = [];   // 🔴 해석 실패 — ERROR(2). 「0건 통과」와 절대 섞지 않는다
let commentCount = 0;

for (const file of files) {
  const rel = path.relative(APP, file);
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { parseErrors.push({ rel, why: `읽기 실패: ${e.message}` }); continue; }
  let sf;
  try {
    sf = ts.createSourceFile(path.basename(file), text, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  } catch (e) { parseErrors.push({ rel, why: `파싱 실패: ${e.message}` }); continue; }

  const lineOf = (off) => sf.getLineAndCharacterOfPosition(off).line + 1;

  for (const r of commentRanges(sf, text)) {
    commentCount++;
    const raw = text.slice(r.pos, r.end);
    const { text: ct, map } = cleanComment(raw, r.pos);

    /* R-5 — 행번호 인용 */
    const r5MarkBefore = r5Hits.length;   // 이 주석에서 담기 시작하는 지점
    let docRefSeen = false;
    for (const [re, kind] of [[R5_LINEREF, '명세 <숫자>'], [R5_DOCREF, '03:<숫자>']]) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(ct)) !== null) {
        if (kind === '03:<숫자>') docRefSeen = true;
        r5Hits.push({ rel, line: lineOf(map[m.index] ?? r.pos), kind, text: m[0], ctx: ct.slice(Math.max(0, m.index - 24), m.index + m[0].length + 30).trim(), span: [m.index, m.index + m[0].length] });
      }
    }
    if (docRefSeen) {
      R5_CONTREF.lastIndex = 0; let m;
      while ((m = R5_CONTREF.exec(ct)) !== null) {
        r5Hits.push({ rel, line: lineOf(map[m.index] ?? r.pos), kind: '`:<숫자>` 연속표기', text: m[0], ctx: ct.slice(Math.max(0, m.index - 24), m.index + m[0].length + 30).trim(), span: [m.index, m.index + m[0].length] });
      }
    }
    /* R-5 확장 — 원 히트와 **겹치면 버린다**(같은 자리를 두 번 세지 않는다).
     * 🔴 `span` 은 **이 주석 안의 상대 오프셋**이다. 파일 전체의 히트와 비교하면
     *    다른 주석의 같은 숫자 위치와 헛되이 겹쳐 **멀쩡한 히트가 사라진다**(2026-08-22 실측 결함).
     *    그래서 **이 주석에서 방금 담은 것만** 비교 대상으로 삼는다. */
    const taken = r5Hits.slice(r5MarkBefore).map((h) => h.span);
    for (const { kind, re } of R5_EXT) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(ct)) !== null) {
        const a = m.index, b = m.index + m[0].length;
        if (taken.some(([x, y]) => a < y && b > x)) continue;
        r5ExtHits.push({ rel, line: lineOf(map[a] ?? r.pos), kind, text: m[0].replace(/\s+/g, ' '),
          ctx: ct.slice(Math.max(0, a - 26), b + 26).trim(), span: [a, b] });
      }
    }

    /* R-6 — PLN §… (주석 쪽) */
    R6_SECTION.lastIndex = 0;
    const r6 = ct.match(R6_SECTION);
    if (r6) { r6Comment += r6.length; bump6(rel, r6.length, 'comment'); }

    /* R-1 — 인용 추출 */
    const { found, unbalanced } = bracketQuotes(ct);
    if (unbalanced) {
      /* 🔴 **인용을 「못 읽은 것」은 「0건 통과」가 아니다.** 계측기가 그 자리를 재지 못한 것이므로
       *    해석 실패(ERROR)로 따로 센다. 통과 건수에도 위반 건수에도 넣지 않는다. */
      readErrors.push({ rel, line: lineOf(r.pos), why: '「 가 닫히지 않아 인용을 해석할 수 없다', text: ct.slice(0, 70).trim() });
    }
    let prevEnd = -1;
    let prevMarker = null;
    let docRefInComment = false;
    for (const q of found) {
      const gap = prevEnd >= 0 ? ct.slice(prevEnd + 1, q.start) : null;
      const winFrom = Math.max(prevEnd + 1, q.start - MARKER_WINDOW);
      const win = ct.slice(winFrom, q.start);
      let marker = CITE_RULES.find((m) => m.re.test(win))?.id
        ?? CITE_ADJACENT.find((m) => m.re.test(win))?.id
        ?? null;
      /* ⑤ 연속 표기 — 같은 주석에서 문서명 인용이 이미 나온 뒤에만 인정한다. */
      if (!marker && docRefInComment && CITE_CONT.test(win)) marker = '연속표기 `:<숫자>`';
      /* 나열 이어받기 — 구분기호만 사이에 두고 이어진 「」는 앞 인용의 표지를 잇는다. */
      if (!marker && prevMarker && gap !== null && LIST_SEPARATOR_ONLY.test(gap)) marker = prevMarker.replace(/\(나열\)$/, '') + '(나열)';
      if (marker && /문서명/.test(marker)) docRefInComment = true;
      const inner = ct.slice(q.start + 1, q.end);
      const line = lineOf(map[q.start] ?? r.pos);
      prevMarker = marker;
      if (!marker) {
        /* 🔴 판정 창(40)이 아니라 **경보 창(140)** 으로 본다 — 창 밖 표지를 조용히 흘리지 않기 위해. */
        const nearWin = ct.slice(Math.max(prevEnd + 1, q.start - NEAR_MARKER_WINDOW), q.start);
        const near = LOOKS_LIKE_MARKER.test(nearWin);
        skippedQuotes.push({
          rel, line, near,
          why: near ? '🔴 표지처럼 보이나 R-1 형태가 아니다' : '인용 표지 없음(R-1 대상 아님)',
          /* 🔴 서러게이트 쌍(🔴 등)을 가운데서 자르면 깨진 글자가 찍힌다 — 코드포인트 단위로 자른다. */
          text: inner.slice(0, 60),
          /* `win` 은 고정 길이로 잘린 창이라 앞머리에 **짝 잃은 서러게이트**가 남을 수 있다(🔴 등).
           * 판정에는 무해하지만 화면에 깨진 글자로 찍히므로 표시 직전에 뗀다. */
          /* 경보 대상은 **표지가 보이도록** 넓은 창을 보여 준다(왜 형태가 아닌지 사람이 판단해야 하므로). */
          win: [...(near ? nearWin : win).trim().replace(/^[\uD800-\uDFFF](?![\uDC00-\uDFFF])/, '')].slice(near ? -70 : -44).join(''),
        });
      } else {
        /* 주석 자체가 취소선 처리됐는지 — 판정하되 사실을 표시한다(코드 쪽 취소선은 배제하지 않는다). */
        const struck = /~~/.test(ct.slice(Math.max(0, q.start - 200), q.start)) && /~~/.test(ct.slice(q.end, q.end + 200));
        citations.push({ rel, line, marker, quote: inner, struck });
      }
      prevEnd = q.end;
    }
  }

  /* R-6 (문자열 리터럴 쪽) — 🔴 PLN 실측 26 건과 이 게이트의 수를 **대조 가능하게** 만들기 위해 따로 센다.
   *    PLN 은 파일 전체 grep 으로 26 을 얻었고, 이 게이트는 주석만 본다. 둘을 합쳐야 26 이 된다.
   *    (화면에 나가는 `PLN §…` 는 학습자에게 사내 절 번호를 노출하는 별개 문제이며 이 게이트 소관이 아니다.) */
  (function scanStrings(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
      || node.kind === ts.SyntaxKind.JsxText) {
      const t = node.text ?? '';
      R6_SECTION.lastIndex = 0;
      const m = t.match(R6_SECTION);
      if (m) { r6String += m.length; bump6(rel, m.length, 'string'); }
    }
    node.forEachChild(scanStrings);
  })(sf);
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 3. 판정 (R-2 · R-3)
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 🔴 생략부호는 **저자가 잘라낸 자리**다. 이어 붙은 문자열이 명세에 그대로 있을 리 없으므로
 *  조각마다 따로 대조한다. 이 결정이 없으면 `wafer.ts:285` 같은 살아 있는 인용이 전부 거짓 실패한다. */
const ELLIPSIS = /…|\.{3,}/;

const results = [];
for (const c of citations) {
  const whole = norm(c.quote);
  const segs = whole.split(ELLIPSIS).map((s) => norm(s)).filter((s) => s.length > 0);
  const r = { ...c, whole, segments: [], status: 'PASS', notes: [] };

  if (segs.length === 0) {
    r.status = 'UNDETERMINED';
    r.notes.push('정규화 후 남는 글자가 없다(생략부호뿐이거나 공백뿐)');
    results.push(r); continue;
  }
  if (whole.includes('「') || whole.includes('」')) r.notes.push('중첩 인용 포함 — 깊이 짝짓기로 통째 추출했다');

  for (const s of segs) {
    const live = countIn(bodyIndex, s);
    const dead = countIn(deadIndex, s);
    const len = evidenceLen(s);
    const seg = { text: s, len, live: live.n, liveHits: live.hits, dead: dead.n, deadHits: dead.hits };
    if (live.n === 0) {
      r.status = 'FAIL';
      seg.verdict = dead.n > 0 ? 'DEAD_IN_BANNER' : 'MISSING';
      seg.nearest = longestLivePrefix(bodyIndex, s);
    } else if (live.n >= 2) {
      seg.verdict = 'AMBIGUOUS';
      if (r.status === 'PASS') r.status = 'WARN';
    } else {
      seg.verdict = 'UNIQUE';
    }
    if (len < MIN_EVIDENCE_CHARS) {
      seg.short = true;
      if (r.status === 'PASS') r.status = 'WARN';
    }
    r.segments.push(seg);
  }
  results.push(r);
}

/* 🔴 「」 후보 보존 항등식 — **검사 대상 수가 조용히 줄어드는 것**을 막는다.
 *    후보 총계 = 검사한 인용 + 표지형태불일치 + 표지없음.  어긋나면 어딘가에서 조용히 샜다는 뜻이다. */
const candidateTotal = citations.length + skippedQuotes.length;

const fails = results.filter((r) => r.status === 'FAIL');
const warns = results.filter((r) => r.status === 'WARN');
const undet = results.filter((r) => r.status === 'UNDETERMINED');
const passes = results.filter((r) => r.status === 'PASS');

/* R-5 승격 판정. 🔴 날짜는 **로컬(KST)** 로 잡는다 — UTC 로 잡으면 KST 오전에 하루 전으로 읽힌다. */
const _d = new Date();
const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
let r5Verdict = 'WARN', r5Why = `도입기 경고 — 승격일 ${R5_PROMOTE_TO_FAIL_ON} 까지 정리한다`;
if (r5Hits.length > R5_BASELINE) { r5Verdict = 'FAIL'; r5Why = `도입 기준선 ${R5_BASELINE} 건을 넘었다(악화 금지 래칫)`; }
else if (r5Hits.length > 0 && today >= R5_PROMOTE_TO_FAIL_ON) { r5Verdict = 'FAIL'; r5Why = `승격일 ${R5_PROMOTE_TO_FAIL_ON} 이 지났다`; }
else if (r5Hits.length === 0) { r5Verdict = 'PASS'; r5Why = '0건 — 이후 1건이라도 생기면 래칫으로 FAIL 이 된다'; }

/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴 판정 계층 — 집안 규약 { 0 PASS · 1 FAIL · 2 ERROR · 4 UNDETERMINED }
 *    **우선순위: ERROR > FAIL > UNDETERMINED > PASS.**
 *    🔴 ERROR 가 가장 세다 — 「재지 못했다」를 「위반을 찾았다」로도 「깨끗하다」로도 옮기면 안 된다.
 *    재지 못한 자리가 하나라도 있으면 이 실행의 결론 자체가 부분적이기 때문이다.
 *    (verify.mjs 는 자기 **집계**에서 FAIL 을 앞세우지만, 그것은 여러 게이트를 한 줄로 줄일 때의 규칙이고
 *     게이트 **자신**의 한 판정에서는 「못 쟀다」가 「봤더니 깨끗하다」를 이긴다.)
 * ══════════════════════════════════════════════════════════════════════════════ */
/* R-5 확장 래칫 — 원 래칫과 같은 규칙을 **별도 기준선**으로 돌린다. */
let r5ExtVerdict = 'WARN', r5ExtWhy = `도입기 경고 — 승격일 ${R5_PROMOTE_TO_FAIL_ON} 까지 정리한다`;
if (r5ExtHits.length > R5_EXT_BASELINE) { r5ExtVerdict = 'FAIL'; r5ExtWhy = `확장 기준선 ${R5_EXT_BASELINE} 건을 넘었다(악화 금지 래칫)`; }
else if (r5ExtHits.length > 0 && today >= R5_PROMOTE_TO_FAIL_ON) { r5ExtVerdict = 'FAIL'; r5ExtWhy = `승격일 ${R5_PROMOTE_TO_FAIL_ON} 이 지났다`; }
else if (r5ExtHits.length === 0) { r5ExtVerdict = 'PASS'; r5ExtWhy = '0건 — 이후 1건이라도 생기면 래칫으로 FAIL 이 된다'; }

/** 🔴 **행번호가 낡았는가** — 인용문에 적힌 행번호가 지금 명세의 몇 행을 가리키는지 그대로 보여 준다.
 *  판정하지 않는다(진단). 「고치지 말고 목록만 남겨라」는 지시에 따라 **사실만 낸다**. */
function refLinePeek(text) {
  /* 🔴 문서명 `03_실습3단계명세.md` 안의 `03`·`3` 은 행번호가 아니다 — 먼저 뗀다. */
  const t = text.replace(/03_실습3단계명세(?:\.md)?/g, ' ');
  const nums = [...new Set((t.match(/\d+/g) ?? []).map(Number))].filter((n) => n >= 1 && n <= specLines.length);
  return nums.map((n) => ({ n, at: (specLines[n - 1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 62) }));
}

const hasError = readErrors.length > 0 || parseErrors.length > 0;
const hasFail = fails.length > 0 || r5Verdict === 'FAIL' || r5ExtVerdict === 'FAIL';
const hasUndet = undet.length > 0;
const EXIT = hasError ? 2 : hasFail ? 1 : hasUndet ? 4 : 0;
const failed = hasFail;

/* ══════════════════════════════════════════════════════════════════════════════
 * 4. 출력 — 🔴 「통과」가 「위반이 없어서」인지 「못 봐서」인지 구분되게 낸다
 * ══════════════════════════════════════════════════════════════════════════════ */
if (AS_JSON) {
  console.log(JSON.stringify({
    spec: path.relative(PROJECT, SPEC_PATH), src: path.relative(APP, SRC_DIR),
    specLines: specLines.length, excludedLineCount: excludedLines.size, excludedRegions, strikeSpans,
    files: files.length, comments: commentCount,
    citations: results, skipped: skippedQuotes, parseErrors, readErrors, candidateTotal,
    r5: { verdict: r5Verdict, why: r5Why, baseline: R5_BASELINE, introduced: R5_INTRODUCED_ON, promoteOn: R5_PROMOTE_TO_FAIL_ON,
          hits: r5Hits.map((h) => ({ ...h, refs: refLinePeek(h.text) })) },
    r5ext: { verdict: r5ExtVerdict, why: r5ExtWhy, baseline: R5_EXT_BASELINE,
             hits: r5ExtHits.map((h) => ({ ...h, refs: refLinePeek(h.text) })) },
    r6: { comment: r6Comment, string: r6String, total: r6Comment + r6String, files: [...r6Files] },
    summary: { PASS: passes.length, WARN: warns.length, FAIL: fails.length, UNDETERMINED: undet.length },
    exitCode: EXIT,
  }, null, 2));
  process.exitCode = EXIT;
} else {
  const L = (s = '') => console.log(s);
  L('check-citations — 코드 주석의 명세 인용이 「살아 있는 본문」에 있는가');
  L(`  명세: ${path.relative(PROJECT, SPEC_PATH)} (${specLines.length} 행)`);
  L(`  소스: ${path.relative(APP, SRC_DIR)} — 파일 ${files.length} · 주석 ${commentCount} 개`);
  L();

  /* ── AC-R4b — 배제한 영역을 전부 낸다 ─────────────────────────────────────── */
  L('▌R-4 · 명세에서 **배제한 폐기 영역** (🔴 조용히 뺀 것이 없어야 한다)');
  L(`  배제 규칙: 「\`>\` 인용 블록」 **AND** 「배너 표지(${BANNER_MARKERS.join('·')})」 — 단위는 S1 행 / S2 절 / S3 블록`);
  L('  🔴 `>` 만으로는 배제하지 않는다 — 03:546~559 처럼 살아 있는 정본이 `>` 블록에 있다.');
  L('  🔴 표지 낱말 하나로 블록을 통째 죽이지 않는다 — 머리행이 선언문일 때만 블록 전체다(S3).');
  L(`  배제 영역 ${excludedRegions.length} 개 · 배제 행 ${excludedLines.size} / ${specLines.length} (${(excludedLines.size / specLines.length * 100).toFixed(1)} %)`);
  for (const e of excludedRegions) L(`    · L${e.from}–${e.to} [${e.scope}] [${e.markers.join(',')}] ${e.head}`);
  L(`  취소선 제거 ${strikeSpans.length} 곳${strikeSpans.length ? ': ' + strikeSpans.map((s) => 'L' + s.line).join(' ') : ''}`);
  L();

  /* ── R-1/R-2/R-3 ──────────────────────────────────────────────────────────── */
  const nearMiss = skippedQuotes.filter((q) => q.near);
  const plain = skippedQuotes.filter((q) => !q.near);
  const nearMissCount = nearMiss.length; const plainCount = plain.length;
  L('▌R-1~R-3 · 인용문 대조');
  /* 🔴🔴 **검사 대상 수를 숨기지 않는다.** 「조용히 줄어드는 것」이 이 저장소가 하루 종일 쫓은 병이다.
   *    후보 총계와 세 갈래의 합이 어긋나면 어딘가에서 샌 것이므로 그 자리에서 경보를 낸다. */
  const sumParts = results.length + nearMissCount + plainCount;
  L(`  🔴 **「」 후보 총계 ${candidateTotal} 건 = 검사 ${results.length} + 표지형태불일치 ${nearMissCount} + 표지없음 ${plainCount}**`);
  if (sumParts !== candidateTotal) L(`  ❌❌ 보존 항등식이 깨졌다(합 ${sumParts} ≠ ${candidateTotal}) — 후보가 조용히 샜다. 게이트 결함이다.`);
  L(`  검사한 인용 ${results.length} 건 — ✅확정통과 ${passes.length} · ⚠️경고 ${warns.length} · ❌실패 ${fails.length} · 🟡판정불가 ${undet.length}`);
  L(`  🔴 경고·판정불가는 통과 건수에 넣지 않았다(R-7e). 해석 실패 ${readErrors.length + parseErrors.length} 건은 **통과에도 위반에도 넣지 않았다**(ERROR).`);
  L();
  const seg1 = (s) => (s.length > 78 ? s.slice(0, 78) + '…' : s);
  for (const r of results) {
    if (r.status === 'PASS') continue;
    const icon = r.status === 'FAIL' ? '❌' : r.status === 'WARN' ? '⚠️ ' : '🟡';
    L(`  ${icon} ${r.rel}:${r.line}  [표지 ${r.marker}]${r.struck ? ' (주석이 취소선 처리됨)' : ''}`);
    for (const n of r.notes) L(`       └ ${n}`);
    for (const s of r.segments) {
      const tag = { UNIQUE: '유일 1곳', AMBIGUOUS: `모호 ${s.live}곳`, MISSING: '🔴 명세에 없다', DEAD_IN_BANNER: '🔴🔴 폐기 영역 안에만 있다' }[s.verdict];
      const where = s.liveHits.length ? ` @L${s.liveHits.map((h) => h.line).join(',')}` : '';
      const dead = s.dead ? `  (배제영역 ${s.dead}곳 @L${s.deadHits.map((h) => h.line).join(',')} — 🔴 이것이 없었다면 거짓 통과였다)` : '';
      L(`       · ${tag}${where}${s.short ? ` [짧음 ${s.len}<${MIN_EVIDENCE_CHARS}자]` : ''}${dead}`);
      L(`         「${seg1(s.text)}」`);
      if (s.nearest) {
        const pct = s.text.length ? Math.round(s.nearest.len / s.text.length * 100) : 0;
        L(s.nearest.len === 0
          ? '         └ 본문에 겹치는 앞부분이 전혀 없다 — 문구 전체가 사라진 인용이다'
          : `         └ 본문에서 살아 있는 최장 앞부분 ${s.nearest.len}/${s.text.length}자(${pct} %) @L${s.nearest.line}: 「${seg1(s.nearest.text)}」`);
      }
    }
  }
  if (passes.length) {
    L(`  ✅ 확정 통과 ${passes.length} 건 (유일·${MIN_EVIDENCE_CHARS}자 이상):`);
    for (const r of passes) L(`     · ${r.rel}:${r.line}  「${seg1(r.segments[0].text)}」${r.segments.length > 1 ? ` 외 ${r.segments.length - 1} 조각` : ''}`);
  }
  L();

  /* ── 🔴 사각지대 ──────────────────────────────────────────────────────────── */
  L('▌사각지대 — 🔴 「못 본 것」을 숨기지 않는다');
  L(`  · 🔴 **표지처럼 보이나 R-1 형태가 아니어서 검사하지 않은 「」 ${nearMiss.length} 건 — 전건 나열한다**`);
  L('       (표지를 「어느 문서인지 특정되는 형태」로 좁힌 대가다. 머리주석 R-1 절 참조.)');
  for (const s of nearMiss) L(`      ${s.rel}:${s.line} 앞말「…${s.win}」→ 인용「${seg1(s.text)}」`);
  L(`  · 표지가 전혀 없어 지나친 「」 ${plain.length} 건 (R-1 AC: 학습자용 UI 문구 오검출 0건을 위해 의도적으로 뺀다)`);
  for (const s of plain.slice(0, 6)) L(`      ${s.rel}:${s.line} 「${seg1(s.text)}」`);
  if (plain.length > 6) L(`      … 외 ${plain.length - 6} 건 (--json 으로 전건)`);
  L('  · 🔴 **문자열 리터럴은 이 게이트가 보지 않는다.** 화면에 나가는 행번호(요구사항 §4 AC-0)는');
  L('       주석 안의 행번호(R-5)와 급이 다른 제품 결함이며 **별도 규칙 소관**이다(PLN 명시).');
  L('  · 🔴 명세를 **행 단위**로 대조한다. 인용문이 명세에서 두 줄에 걸쳐 있으면 못 잡는다(현 스냅샷에는 없다).');
  L(`  · 🔴 배제 규칙이 살아 있는 블록을 통째로 뺄 수 있다 — 위 배제 목록을 사람이 검토해야 한다(요구사항 §5 U-3 미집계).`);
  L(`  · ⚠️  **해석 실패(ERROR) ${readErrors.length + parseErrors.length} 건** — 🔴 이것은 「0건 통과」가 아니라 **그 자리를 재지 못한 것**이다.`);
  for (const p of parseErrors) L(`      ${p.rel} — ${p.why}`);
  for (const p of readErrors) L(`      ${p.rel}:${p.line} — ${p.why}  「${seg1(p.text)}」`);
  L();

  /* ── R-5 ──────────────────────────────────────────────────────────────────── */
  const r5icon = r5Verdict === 'FAIL' ? '❌' : r5Verdict === 'PASS' ? '✅' : '⚠️ ';
  L(`▌R-5 · 행번호 인용 금지 패턴 — ${r5icon} ${r5Verdict} (${r5Why})`);
  const byKind = new Map();
  for (const h of r5Hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
  L(`  ${r5Hits.length} 건 / 기준선 ${R5_BASELINE} · 도입 ${R5_INTRODUCED_ON} · 승격 ${R5_PROMOTE_TO_FAIL_ON} · 오늘 ${today}`);
  L(`  형태별: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  L('  (PLN 실측표 §1-1 은 `명세 <숫자>` 15 · `03:<숫자>` 1 로 적었다. 연속표기 2건을 따로 세어 18 이다.)');
  const showHit = (h) => {
    L(`    · ${h.rel}:${h.line} [${h.kind}] ${seg1(h.ctx)}`);
    for (const rf of refLinePeek(h.text)) L(`        └ 그 번호가 지금 가리키는 곳 — 03:${rf.n} 「${rf.at}」`);
  };
  for (const h of r5Hits) showHit(h);
  L();
  const extIcon = r5ExtVerdict === 'FAIL' ? '❌' : r5ExtVerdict === 'PASS' ? '✅' : '⚠️ ';
  L(`▌R-5 확장 · 원 패턴이 못 잡던 형태 — ${extIcon} ${r5ExtVerdict} (${r5ExtWhy})`);
  L(`  ${r5ExtHits.length} 건 / 확장 기준선 ${R5_EXT_BASELINE} — 🔴 원 기준선 ${R5_BASELINE} 을 올린 것이 아니라 **따로 세는 형태**다.`);
  L('  발견 경위: `viz/chart/common.ts:19` 의 「476행」이 원 패턴 어디에도 안 걸려 손으로 챙겨야 했다.');
  L('  🔴 **E2 의 알려진 오검출**: `PLN <숫자>` 는 행번호가 아니라 **PLN 이 제시한 수치**일 수 있다.');
  L('     단위가 붙은 것(`PLN 275 Ω`)은 막았으나 `oxidation.ts` 의 `PLN 302 ✅`(두께값)는 못 막았다 — 사람이 걸러라.');
  for (const h of r5ExtHits) showHit(h);
  L();

  /* ── R-6 ──────────────────────────────────────────────────────────────────── */
  L(`▌R-6 · \`PLN §…\` 절 인용 — ⚠️  경고만 · 합계 ${r6Comment + r6String} 건 (주석 ${r6Comment} · 문자열 리터럴 ${r6String})`);
  for (const [f, n] of [...r6Files].sort()) L(`    · ${f} — 주석 ${n.comment} · 문자열 ${n.string}`);
  L('  🔴 문자열 리터럴 쪽은 **화면에 나가는 절 번호**다. 이 게이트가 판정하지 않는다(별건).');
  L('  🔴 표제 서식 통일(§재개-L4) 완료 후 R-6 을 실패로 승격한다.');
  L('     지금 대조하지 않는 이유: `03` 의 실제 표제(`### 기초 (S5) — …`)와 주석 표기(`PLN §P1 S5` 등)가');
  L('     사람마다 달라 **대조 기준 자체가 없다**(요구사항 §5 U-1 UNDETERMINED).');
  L();

  if (EXIT === 2) {
    L(`⚠️  check-citations **해석 실패(종료코드 2)** — ${readErrors.length + parseErrors.length} 곳을 재지 못했다.`);
    L(`   🔴 「위반 없음」도 「위반 있음」도 아니다. 재지 못한 자리가 있으므로 이 실행의 결론은 부분적이다.`);
    L(`   (참고: 그와 별개로 확정된 죽은 인용 ${fails.length} 건 · R-5 ${r5Verdict})`);
  } else if (EXIT === 1) {
    L(`❌ check-citations 실패 — 죽은 인용 ${fails.length} 건${r5Verdict === 'FAIL' ? ` · R-5 ${r5Why}` : ''}${r5ExtVerdict === 'FAIL' ? ` · R-5 확장 ${r5ExtWhy}` : ''}`);
  } else if (EXIT === 4) {
    L(`🟡 check-citations 판정 불가(종료코드 4) — ${undet.length} 건을 판정하지 못했다. **통과가 아니다.**`);
  } else {
    L(`✅ check-citations 통과 — 죽은 인용 0 건 · 해석 실패 0 건 (확정통과 ${passes.length} · 경고 ${warns.length} 는 통과에 넣지 않았다)`);
  }
  /* 🔴 `process.exit()` 는 버퍼에 남은 stdout 을 잘라먹는다(집안 실측). exitCode 만 세운다. */
  process.exitCode = EXIT;
}
