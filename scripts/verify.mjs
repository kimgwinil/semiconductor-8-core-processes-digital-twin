#!/usr/bin/env node
// verify.mjs — 품질 게이트 전체 순차 실행(§8).
// 순서: gen-sources → check-catalog → check-layering → check-sources → check-physics →
// check-guard-naming → check-labs → check-grades → check-wiring → check-chart-series → check-fallback-purity →
// check-passwindow →
// check-live-judgment → check-constants → check-scene-constants → check-glsl-compile → check-test-formulas →
// check-i18n → check-questions → check-coverage → check-ledger-parity → check-assets → check-a11 → check-direction → check-a12c →
// tsc --noEmit → vitest run → check-bundle(dist 있을 때만) →
// check-overflow(하드 게이트 — playwright-core + 시스템 Chrome) → check-collision(계측 전용) → check-a6b.
// --skip-build 로 tsc/vitest 를 건너뛴다(스크립트만 빠르게 확인할 때 사용).
//
// 종료코드는 아래 「§V 판정 상태와 종료코드」를 보라. **0/1 두 칸이 아니다.**

import { existsSync as fsExistsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pendingSummaryLine } from './lib/pending.mjs';
/* 🔴 「무엇이 픽스처인가」의 정본. 여기서 정규식을 다시 쓰지 않는다 —
 *    같은 판단을 두 곳이 따로 하다가 갈라진 것이 2026-08-22 오보의 원인이었다. */
import { isSelftestFixtureFile, fixtureTargetGate } from './lib/gate-classify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(APP_ROOT, 'dist');

const skipBuild = process.argv.includes('--skip-build');

/* ══════════════════════════════════════════════════════════════════════════════
 * §V 판정 상태와 종료코드 (2026-08-21 — 오케스트레이터 확정 판정으로 신설)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────────────────────
 *   종전 `runNode()`/`runCmd()` 는 `return r.status === 0` 이었다.
 *   **자식의 종료코드 숫자가 그 자리에서 불리언으로 붕괴한다.**
 *   그래서 집안이 이미 쓰고 있던 세 가지 서로 다른 사실이 한 칸으로 뭉개졌다:
 *     · 1 = 위반을 **찾았다**(판정 실패)
 *     · 2 = 아무것도 **재지 못했다**(계측기 고장)
 *     · 4 = 재 봤는데 **모르겠다**(판정 불가 · `check-live-judgment` 규약)
 *   2 와 4 를 「판정 실패」로 보고하는 것은 **거짓 주장**이다. 반대로 0 으로 내보내면
 *   「초록이니 괜찮다」로 소비된다. 🔴 **둘 다 안 된다.** 그래서 칸을 나눴다.
 *
 * ── 상태 (표식은 check-live-judgment.mjs 의 것을 그대로 쓴다) ─────────────────
 *   ✅ PASS           통과
 *   ❌ FAIL           확정된 위반
 *   🟡 UNDETERMINED   판정 불가 — 🔴 **PASS 에 합산하지 않는다**
 *   ⚠️  ERROR          계측기 고장 — 아무것도 재지 못했다(판정 실패가 아니다)
 *   ⏭  SKIP           건너뜀 — 🔴 SKIP 은 PASS 가 아니다
 *
 * ── verify 자신의 종료코드 · 우선순위 FAIL > ERROR > UNDETERMINED ─────────────
 *   0   FAIL 0 · ERROR 0 · UNDETERMINED 0
 *   1   FAIL ≥ 1                          ← **최우선**
 *   2   FAIL 0 · ERROR ≥ 1                (집안 관례 2 = 실행 오류)
 *   4   FAIL 0 · ERROR 0 · UNDETERMINED ≥ 1
 *
 *   🔴 **왜 FAIL 이 이기는가.** FAIL 은 「확정된 사실」이고 나머지 둘은 「모른다」이다.
 *      확정된 위반이 하나라도 있으면 그것이 가장 강한 사실이므로 그것을 내보낸다.
 *      다만 🔴 **이겼다고 가리지는 않는다** — FAIL 이 있어도 🟡 줄과 ⚠️ 줄은 **항상 찍는다.**
 *      (`check-live-judgment.mjs:226~229` 도 같은 원칙을 쓴다. 집안 관례를 따랐다.)
 *   🔴 **3 은 쓰지 않는다.** `selftest-gates.mjs` 가 3 = 「다른 실행 중」(배타 락 미획득)로
 *      이미 쓰고 있다. 3 은 **계측기 사정**이고 4 는 **판정 상태**다. 섞으면 안 된다.
 *
 * ── 🔴 게이트별 종료코드 표 (2026-08-21 전수 실측 — 코드 숫자를 추측하지 마라) ──
 *   집안 공통 규약: 0 통과 · 1 판정 실패 · 2 실행 오류(계측기 고장)
 *                   3 배타 락 미획득(selftest-gates 전용) · 4 판정 불가(check-live-judgment 전용)
 *
 *   ┌────────────────────────┬──────────────┬─────────────────────────────────────┐
 *   │ 게이트                 │ 내보내는 코드│ 이 파일에서 쓰는 해석표             │
 *   ├────────────────────────┼──────────────┼─────────────────────────────────────┤
 *   │ gen-sources            │ 0 1          │ CODES.BINARY                        │
 *   │ check-catalog          │ 0 1          │ CODES.BINARY                        │
 *   │ check-layering         │ 0 1          │ CODES.BINARY                        │
 *   │ check-sources          │ 0 1          │ CODES.BINARY                        │
 *   │ check-gate-registration│ 0 1 2        │ CODES.WITH_ERROR                    │
 *   │ check-guard-naming     │ 0 1          │ CODES.BINARY                        │
 *   │ check-citations        │ 0 1 2 4      │ CODES.LIVE_JUDGMENT  ← 4 = 판정 불가 │
 *   │ check-physics          │ 1            │ CODES.BINARY                        │
 *   │ check-labs             │ 0 1          │ CODES.BINARY                        │
 *   │ check-grades           │ 1            │ CODES.BINARY                        │
 *   │ check-grade-claim      │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 계측기 고장  │
 *   │ check-wiring           │ 1            │ CODES.BINARY                        │
 *   │ check-chart-series     │ 1 2          │ CODES.WITH_ERROR  ← 2 = 실행 오류    │
 *   │ check-fallback-purity  │ 0 1          │ CODES.BINARY                        │
 *   │ check-passwindow       │ 0 1          │ CODES.BINARY                        │
 *   │ check-live-judgment    │ 0 1 2 4      │ CODES.LIVE_JUDGMENT  ← 4 = 판정 불가 │
 *   │ check-numeric          │ 0 2          │ CODES.WITH_ERROR  ← 2 = 계측기 고장  │
 *   │                        │              │ 🔴 2026-08-22 신설. **계측 전용** —   │
 *   │                        │              │    결함이 있어도 0 을 낸다(CEO 지시). │
 *   │                        │              │    1 은 `--strict` 일 때만 나오고     │
 *   │                        │              │    verify 는 무인자로 부른다.         │
 *   │ check-constants        │ 0 1          │ CODES.BINARY                        │
 *   │ check-scene-constants  │ 0 1          │ CODES.BINARY                        │
 *   │ check-glsl-compile     │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 계측기 고장  │
 *   │                        │              │ 🔴 Chrome 부재 = SKIP(0). 출력에      │
 *   │                        │              │    대문자 SKIP + 「0개」를 반드시 찍음│
 *   │ check-test-formulas    │ 0 1          │ CODES.BINARY                        │
 *   │ check-i18n             │ 0 1          │ CODES.BINARY                        │
 *   │ check-questions        │ 0 1          │ CODES.BINARY                        │
 *   │ check-coverage         │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 계측 실패    │
 *   │                        │              │ 🔴 2026-08-22 신설. **차단 게이트** — │
 *   │                        │              │    72칸(8공정×9절) 중 빈 칸·미달 칸이 │
 *   │                        │              │    하나라도 있으면 1. 2 = 카탈로그·랩 │
 *   │                        │              │    모듈을 못 읽음(「재지 못했다」).    │
 *   │ check-ledger-parity    │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 계측 실패    │
 *   │                        │              │ 🔴 2026-08-22 신설. **차단 게이트** — │
 *   │                        │              │    원장 04 의 유형·난이도·LO·정답과   │
 *   │                        │              │    앱 문항 JSON 이 어긋나면 1.        │
 *   │                        │              │    판정 불가도 1 이다(「모른다」는     │
 *   │                        │              │    「통과」가 아니다). 2 = 원장·문항   │
 *   │                        │              │    파일을 못 읽음.                    │
 *   │ check-assets           │ 0 1          │ CODES.BINARY                        │
 *   │ check-a11              │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 계측 실패    │
 *   │                        │              │ 🔴 2026-09-01 신설. A11(공정-이미지   │
 *   │                        │              │    정합성) 을 재는 유일한 게이트.     │
 *   │                        │              │    원장 07 과 출하 자산 트리를 대조.  │
 *   │                        │              │    1 = 검사 ID 별 기준선 초과(악화) 또는│
 *   │                        │              │    승격일 경과. 2 = 원장·자산 트리를  │
 *   │                        │              │    못 읽음 / 원장 서식이 바뀌어 자산  │
 *   │                        │              │    표를 못 찾음(「재지 못했다」).      │
 *   │                        │              │    🔴 3·4 는 쓰지 않는다.             │
 *   │ check-direction        │ 0 1 2        │ CODES.WITH_ERROR  ← 2 = 게이트 버그  │
 *   │                        │              │ 🔴 2026-08-22 — V2(A12 커버리지)는    │
 *   │                        │              │    비차단 강등. V1·V3~V5·M1~M5 차단.  │
 *   │ check-a12c             │ 0 1 2        │ CODES.WITH_ERROR                    │
 *   │                        │              │ 🔴 2026-08-22 **차단 게이트로 전환**  │
 *   │                        │              │    (A12 채택). 1 = L2 커버리지<100 %  │
 *   │                        │              │    또는 래칫 후퇴. 2 = 계측 실패      │
 *   │                        │              │    E1~E8. 종전 「차단 안 함」은 폐기.  │
 *   │ check-bundle           │ 0 1          │ CODES.BINARY                        │
 *   │ check-overflow         │ 1            │ CODES.BINARY                        │
 *   │ check-collision        │ 0 2          │ CODES.WITH_ERROR                    │
 *   │                        │              │ 🔴 2026-08-24 신설. **계측 전용** —   │
 *   │                        │              │    겹침이 있어도 0 을 낸다(CEO 지시). │
 *   │                        │              │    1 은 --strict/--ratchet 일 때만    │
 *   │                        │              │    나오고 verify 는 무인자로 부른다.  │
 *   │                        │              │    2 = 브라우저·dist 부재(못 쟀다).   │
 *   │ check-a6b              │ 1            │ CODES.BINARY                        │
 *   │ tsc --noEmit           │ 0 1 2 3 …    │ CODES.EXTERNAL ← 0 아니면 전부 FAIL │
 *   │ vitest run             │ 0 1          │ CODES.EXTERNAL                      │
 *   ├────────────────────────┼──────────────┼─────────────────────────────────────┤
 *   │ selftest-gates         │ 1 2 3        │ 🔴 **편입하지 않는다** — 아래 §W    │
 *   └────────────────────────┴──────────────┴─────────────────────────────────────┘
 *
 *   🔴 **표에 없는 코드가 나오면 FAIL 이 아니라 ERROR 로 센다.** 모르는 숫자를
 *      「위반을 찾았다」로 옮기는 것이 바로 이 파일이 고치려는 그 잘못이기 때문이다.
 *      대신 그 자리에서 경고를 찍어 표를 갱신하게 만든다.
 *   🔴 tsc 는 진단이 있을 때 1 뿐 아니라 **2 도 내보낸다**(TypeScript ExitStatus).
 *      그래서 외부 도구는 「0 아니면 FAIL」로 따로 다룬다 — 집안 규약이 적용되지 않는다.
 * ══════════════════════════════════════════════════════════════════════════════ */

const S = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNDET: 'UNDETERMINED',
  ERROR: 'ERROR',
  SKIP: 'SKIP',
};

const CODES = {
  /** 집안 기본형 — 0 통과 · 1 판정 실패. 그 밖의 코드는 표에 없으므로 ERROR. */
  BINARY: { 0: S.PASS, 1: S.FAIL },
  /** 2 = 실행 오류(게이트 버그·계측기 고장)를 함께 쓰는 게이트. */
  WITH_ERROR: { 0: S.PASS, 1: S.FAIL, 2: S.ERROR },
  /** 🔴 4상태형 — 4 = 판정 불가. PASS 가 아니고 FAIL 도 아니다.
   *  쓰는 게이트: `check-live-judgment` · `check-citations`(2026-08-22 편입 —
   *  인용을 뽑았으나 정규화 후 대조할 글자가 남지 않는 경우가 4 다). */
  LIVE_JUDGMENT: { 0: S.PASS, 1: S.FAIL, 2: S.ERROR, 4: S.UNDET },
  /** 외부 도구(tsc·vitest) — 집안 규약 밖이다. 0 이 아니면 전부 FAIL. */
  EXTERNAL: 'EXTERNAL',
};

const results = []; // { name, status, code?, detail? }

/* 🔴 2026-08-21 — **`stdio: 'inherit'` 을 걷어냈다.**
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────────────────────────
 *   종전 두 함수는 자식 게이트에게 **verify 자신의 stdout 을 그대로 물려줬다.**
 *   그래서 **verify 를 어떻게 실행하느냐에 따라 결과가 갈렸다** — 터미널에 직접 띄우면
 *   자식의 stdout 이 TTY 이고, 파이프(`| tail`)나 파일로 넘기면 파이프다. 파이프 쪽에서는
 *   ①읽는 쪽이 먼저 끊으면 자식이 **EPIPE 로 죽어 status ≠ 0** 이 되고
 *   ②TTY 여부로 동작이 갈리는 도구(브라우저 게이트·색상 출력)가 다른 길을 탄다.
 *   실제로 **3회 실행에 3가지 결과**가 나왔다.
 *
 * 🔴 **이것이 최악인 이유:** 오늘의 모든 판단이 「`verify` 의 어느 게이트가 실패하는가」라는
 *   기준선 위에 서 있다. **기준선이 실행할 때마다 움직이면 「위반 30건」도 근거가 흔들린다.**
 *
 * ── 고친 방식 ───────────────────────────────────────────────────────────────────
 *   자식의 stdout/stderr 을 **항상 파이프로 고정**하고(부모의 stdio 와 무관해진다),
 *   받은 내용을 부모가 **다시 찍는다.** 이제 실행 방법이 달라도 자식이 보는 환경은 같다.
 *   `maxBuffer` 를 넉넉히 준다 — vitest 출력이 기본값(1 MB)을 넘는다.
 */
const CHILD_IO = {
  cwd: APP_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 64 * 1024 * 1024,
  encoding: 'utf8',
};

/** 자식 출력을 그대로 흘려보낸다(사람이 보는 내용은 종전과 같다). */
function echo(r) {
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
}

/**
 * 🔴 종료코드를 **상태로 옮기는 유일한 자리.** 여기 말고 어디서도 코드 숫자를 해석하지 않는다.
 * @param {{status:number|null, signal:string|null}} r  spawnSync 결과
 * @param {object|'EXTERNAL'} map  게이트별 해석표(위 §V 표)
 * @param {string} label 경고 문구에 쓸 이름
 * @returns {string} S.PASS | S.FAIL | S.UNDET | S.ERROR
 */
function classify(r, map, label) {
  // 🔴 시그널로 죽은 것(예: 메모리)과 판정 실패를 가른다 — 둘 다 0 이 아니지만 원인이 다르다.
  //    재지 못하고 죽은 것이므로 ERROR 다. 「위반을 찾았다」가 아니다.
  if (r.signal) {
    console.error(`   ⚠️  ${label} 가 시그널 ${r.signal} 로 종료했습니다(판정 실패가 아니라 비정상 종료입니다).`);
    return S.ERROR;
  }
  if (r.status === null || r.status === undefined) {
    console.error(`   ⚠️  ${label} 의 종료코드를 얻지 못했습니다(실행 자체가 성립하지 않았습니다).`);
    return S.ERROR;
  }
  if (map === CODES.EXTERNAL) return r.status === 0 ? S.PASS : S.FAIL;

  const mapped = map[r.status];
  if (mapped) return mapped;

  // 🔴 표에 없는 코드 — **FAIL 로 옮기지 않는다.** 모르는 숫자를 「위반을 찾았다」로
  //    바꿔 적는 것이 이 파일이 고치려는 바로 그 잘못이다. ERROR 로 세고 표를 갱신하게 한다.
  console.error(`   ⚠️  ${label} 가 표에 없는 종료코드 ${r.status} 를 냈습니다 — ERROR(계측기 고장)로 셉니다.`);
  console.error('      🔴 이 코드의 뜻을 확인하고 verify.mjs §V 「게이트별 종료코드 표」를 갱신하세요.');
  return S.ERROR;
}

function runNode(scriptRelPath, map = CODES.BINARY) {
  const full = path.join(__dirname, scriptRelPath);
  const r = spawnSync(process.execPath, [full], CHILD_IO);
  echo(r);
  return { status: classify(r, map, scriptRelPath), code: r.status };
}

function runCmd(cmd, args, map = CODES.EXTERNAL) {
  const r = spawnSync(cmd, args, { ...CHILD_IO, shell: process.platform === 'win32' });
  echo(r);
  return { status: classify(r, map, cmd), code: r.status };
}

function step(name, fn) {
  console.log(`\n▶ ${name}`);
  const { status, code } = fn();
  results.push({ name, status, code });
  return status;
}

function skip(name, reason) {
  console.log(`\n⏭  ${name} — 건너뜀 (${reason})`);
  results.push({ name, status: S.SKIP, detail: reason });
}

step('gen-sources', () => runNode('gen-sources.mjs'));
step('check-catalog', () => runNode('check-catalog.mjs'));
step('check-layering', () => runNode('check-layering.mjs'));
step('check-sources', () => runNode('check-sources.mjs'));
step('check-gate-registration', () => runNode('check-gate-registration.mjs', CODES.WITH_ERROR));  // 🔴 「등록 안 된 게이트」를 잡는다 — 2026-08-21 하루에 세 번 났다
                                                          //    (check-live-judgment · check-chart-series · check-guard-naming 이 전부 package.json 에만 있었다).
                                                          //    🔴 package.json 은 실행 경로가 아니라 이름표일 뿐이다. 이 게이트가 그 착시를 막는다.
step('check-guard-naming', () => runNode('check-guard-naming.mjs'));  // 🔴 범위선이 문헌 인용을 가장하는가 — check-sources 는 「S번호가 원장에 있는가」만 보고
                                                          //    「그 출처가 그 진술을 뒷받침하는가」는 원리적으로 못 본다. 그 바로 뒤에 세운다.
/* 🔴 2026-08-22 신설 편입 — 「코드 주석이 인용한 명세 문구가 아직 살아 있는가」(PLN 요구사항 17번).
 *   `check-guard-naming` 바로 뒤에 둔다. 같은 계열이다 — 저쪽은 **문헌 인용**이 진술을 뒷받침하는지,
 *   이쪽은 **명세 인용**이 아직 명세에 있는지를 본다. 둘 다 「인용이 정직한가」다.
 *   🔴 표적은 행번호가 밀린 것이 아니라 **인용한 설계가 폐기된 것**이다. 행번호를 고쳐도 안 고쳐진다.
 *   🔴 종료코드 2 = 계측기 고장(명세 파일 없음·파서 오류)이다. 판정 실패가 아니므로 WITH_ERROR 를 넘긴다. */
step('check-citations', () => runNode('check-citations.mjs', CODES.LIVE_JUDGMENT));
step('check-physics', () => runNode('check-physics.mjs'));
step('check-labs', () => runNode('check-labs.mjs'));   // 실습 명세 근거 선언
step('check-grades', () => runNode('check-grades.mjs')); // 🔴 A6-b 등급 원장 — 미등재 modelId 0건
// 🔴 G-8 — check-grades 의 G3·G4·G6·G7 이 전부 「literature 가 *아니면*」 조건이라
//    **등급을 literature 로 올리면 A6-b 검사를 통째로 빠져나간다.** 그 구멍을 막는다.
//    코드의 `basis` 접두 토큰(유한 집합) ↔ 원장 `kind` 를 AST 로 3자 대조한다.
step('check-grade-claim', () => runNode('check-grade-claim.mjs', CODES.WITH_ERROR));
step('check-wiring', () => runNode('check-wiring.mjs')); // 🔴 선언했는데 아무도 호출 안 함   // 🔴 A14-1 결정론 · A15 물리층 순수성

/* 🔴 2026-08-21 편입 (오케스트레이터 판정 ①) — 「차트가 계열을 조용히 버리지 않는가」.
 *   `check-wiring` 바로 뒤에 둔다. W6-4 는 **바인딩 데이터**(`c.refLines`)가 옳은지만 보고
 *   **그것이 화면까지 도달하는지는 보지 않는다.** 실제로 W6-4 가 통과시킨 채로 규격선 11개가
 *   렌더러에서 잘려 나갔다. 선언(W6-4) 바로 다음에 도달(이 게이트)을 세워 둔다.
 *   🔴 종료코드 2 = 실행 오류(계측기 고장)를 낸다 — 판정 실패가 아니므로 WITH_ERROR 를 넘긴다.
 *   🔴 **「등록 안 된 게이트는 게이트가 아니다.」** 이 게이트는 픽스처로 증명됐는데도
 *      package.json 에만 있고 verify 단계에 없었다(2026-08-21 실측). 그래서 붙였다. */
step('check-chart-series', () => runNode('check-chart-series.mjs', CODES.WITH_ERROR));
step('check-fallback-purity', () => runNode('check-fallback-purity.mjs')); // 🔴 Canvas2D 폴백이 씬 물리를 복제하면 실패 — 정본이 둘이면 하나는 낡는다
step('check-passwindow', () => runNode('check-passwindow.mjs')); // 🔴 편측 합격창이 정의역 밖 값(음수 σ_D 등)을 합격으로 계상하면 실패

/* 🔴 2026-08-21 신설 편입 — 「살아 있는 판정」(PD-52).
 *   `check-passwindow` 바로 뒤에 둔다: passwindow 가 「불가능한 값이 합격하지 않는가」를 보고,
 *   이 게이트가 「합격 조합과 불합격 조합이 **둘 다** 있는가」를 본다. 같은 계열이다.
 *   🔴 **이 게이트만 종료코드 4(판정 불가)를 낸다.** CODES.LIVE_JUDGMENT 를 반드시 함께 넘긴다 —
 *      기본표(BINARY)로 두면 4 가 「표에 없는 코드」가 되어 ERROR 로 잘못 세어진다. */
step('check-live-judgment', () => runNode('check-live-judgment.mjs', CODES.LIVE_JUDGMENT));

/* 🔴 2026-08-22 신설 편입 — 「계산에 의하여 오차 없이」(CEO 지시).
 *   `check-live-judgment` 바로 뒤에 둔다. 같은 계열의 세 번째 층이다:
 *     passwindow      「불가능한 값이 합격하지 않는가」  — 판정의 **정의역**
 *     live-judgment   「합격·불합격이 둘 다 나오는가」    — 판정의 **생존**
 *     numeric         「그 값이 수치로 성립하는가」       — 판정에 들어가는 **수 자체**
 *   🔴 **지금은 차단하지 않는다.** 무인자 실행은 계측 모드라 결함이 있어도 0 을 낸다 —
 *      실측을 보고 CEO 가 차단 여부를 정한다(2026-08-22 지시: 「우선 계측만 하고 exit 1 은 넣지 마라」).
 *      차단으로 바꾸려면 `runNode('check-numeric.mjs')` 를 `--strict` 로 부르는 대신
 *      게이트 안의 STRICT 기본값을 뒤집는다. **2 는 계측기 고장**이므로 WITH_ERROR 를 넘긴다. */
step('check-numeric', () => runNode('check-numeric.mjs', CODES.WITH_ERROR));

step('check-constants', () => runNode('check-constants.mjs')); // 🔴 G-A 상수 중복 선언(§3-X A-5·A-9·A-11)
step('check-scene-constants', () => runNode('check-scene-constants.mjs')); // 🔴 G-B GLSL 상수를 주입 않고 손으로 적음(§3-X 사각지대 ③)
/* 🔴 2026-08-22 신설 편입 — **셰이더를 진짜 WebGL2 로 컴파일한다.**
 *   `check-scene-constants` 바로 뒤에 둔다. 같은 대상(GLSL)을 보되 층이 다르다 —
 *   저쪽은 「상수를 주입했는가」를 **소스로** 보고, 이쪽은 「그 소스가 컴파일되는가」를
 *   **실제 GPU 드라이버로** 본다.
 *   🔴 왜 필요한가: `tests/unit/viz-glsl.test.ts` 는 이름과 달리 **GLSL 을 한 줄도 컴파일하지 않는다**
 *      (전부 문자열 정규식이다). 그래서 존재하지 않는 함수 호출·타입 불일치·선언 안 된 식별자·
 *      VS/FS varying 불일치가 **어떤 게이트에도 걸리지 않았다.** 깨지면 화면은 통째로 검고
 *      verify 는 끝까지 초록이다. 픽스처가 그 네 종을 실측으로 증명한다
 *      (`check-glsl-compile.selftest.mjs` ⓸⓹⓺⓻ — 같은 오염에서 정규식 테스트는 158/158 통과했다).
 *   🔴 종료코드 2 = 계측기 고장(vite·Chrome 기동 실패)이다. 판정 실패가 아니므로 WITH_ERROR 를 넘긴다.
 *   🔴 Chrome 이 없으면 **SKIP(0)** 이다 — 단, 출력에 대문자 SKIP 과 「컴파일한 셰이더 0개」를
 *      반드시 찍는다. 그 문구가 곧 「이번 실행은 아무것도 보증하지 못했다」는 고지다. */
step('check-glsl-compile', () => runNode('check-glsl-compile.mjs', CODES.WITH_ERROR));
step('check-test-formulas', () => runNode('check-test-formulas.mjs')); // 🔴 G-E 테스트가 구현식을 복붙(구현을 베낀 테스트는 아무것도 막지 못한다)
step('check-i18n', () => runNode('check-i18n.mjs'));
step('check-questions', () => runNode('check-questions.mjs'));
/* 🔴 **「없는 것」을 보는 유일한 게이트.** (2026-08-22 신설 · 차단)
 *   `check-questions` 바로 뒤에 둔다 — 둘은 같은 문항 파일을 보되 **묻는 것이 정반대**다:
 *     · check-questions : 「**있는** 문항이 규약에 맞는가」 (디렉터리가 통째로 없으면 exit 0 이다)
 *     · check-coverage  : 「그 자리에 **있어야 할 것이 있는가**」 (없으면 그 자리가 🔴 로 남는다)
 *   이 게이트가 없던 2026-08-22, 게이트 32개 중 어느 것도 이론 절이 통째로 빈 것을 못 봤고
 *   그 상태로 「출시 게이트 해제」가 CEO 께 올라갔다. 그 사고를 막는 자리다.
 *   🔴 지금 대량 실패한다. 그것이 제품의 정확한 상태다 — 기준을 낮춰 초록으로 만들지 마라.
 *   🔴 2 = 계측 실패(카탈로그·랩 모듈 적재 실패)다. 판정 실패가 아니므로 WITH_ERROR 를 넘긴다. */
step('check-coverage', () => runNode('check-coverage.mjs', CODES.WITH_ERROR));
/* 🔴 **원장을 정본으로 놓고 앱을 대조하는 유일한 게이트.** (2026-08-22 신설 · 차단)
 *   `check-questions`·`check-coverage` 와 같은 문항 파일을 보되 **묻는 것이 또 다르다**:
 *     · check-questions     : 「있는 문항이 **규약**에 맞는가」 (개수·id·형식)
 *     · check-coverage      : 「그 자리에 **있어야 할 것이 있는가**」
 *     · check-ledger-parity : 「앱이 실은 값이 **원장과 같은가**」 ← 여기
 *   이 축이 비어 있어서 `metal-q08` 이 Ea = 0.90 eV · 정답 4.4×10⁵ h 로 실려 나갔다.
 *   원장·`03`·`14_labs`·앱 물리층은 전부 0.80 이었고 회사 확정(PD-23)도 0.80 이었다 —
 *   **같은 앱 안에서 문항과 물리층이 다른 상수를 가르쳤는데 게이트 32개 중 어느 것도 못 봤다.**
 *   🔴 2 = 계측 실패(원장·문항 파일 적재 실패)다. 판정 실패가 아니므로 WITH_ERROR 를 넘긴다. */
step('check-ledger-parity', () => runNode('check-ledger-parity.mjs', CODES.WITH_ERROR));
step('check-assets', () => runNode('check-assets.mjs'));
/* 🔴 **A11(공정-이미지 정합성)을 재는 유일한 게이트.** (2026-09-01 신설)
 *   `check-assets` 바로 뒤에 둔다. 같은 자산을 보되 **묻는 것이 다르다**:
 *     · check-assets : 「그 파일이 **있고 규격에 맞는가**」(용량·라벨 ≥8·PROVENANCE 항목 존재)
 *                      — 스스로 머리주석에 **「A4·A8·§14-3·§14-4」** 라 적었고 A11 을 주장하지 않는다.
 *                        **정합성 원장(`07_정합성원장.md`)을 열지 않는다.**
 *     · check-a11    : 「그 이미지가 **원장에 등재됐고 · 독립된 사람이 판정했고 · 합격인가**」 ← 여기
 *   이 축이 비어 있어서 다음 둘이 통째로 사각지대였다:
 *     ① 원장에 **등재조차 되지 않은** 이미지 30건이 출하 트리에 있는 것
 *     ② 원장이 **「반려」라 적어 둔** 자산 8건이 그대로 출하 트리에 있는 것
 *   그리고 원장 §1 이 *"제작자와 검수자가 같으면 CI 실패"* 라 적어 둔 규칙이
 *   **어디에도 구현돼 있지 않았다**(`check-assets.mjs:28` 의 `hasFilledSection()` 은 공백만 본다).
 *
 *   🔴 **도입기에는 기준선 래칫으로 돈다** — 실측치를 기준선으로 박아 **악화만** 막는다.
 *      기준선 정본은 `check-a11.mjs` 의 `DEFAULT_BASELINE`(도입일 2026-09-01 실측치).
 *      원장 등재·판정은 **DSN 소관**이며 이 게이트는 세기만 한다.
 *      🔴 **기준선을 올려 초록으로 만들지 마라**(D-041 — 기준을 결과에 맞춰 옮김).
 *   🔴 2 = 계측 실패(원장·자산 트리 적재 실패, 원장 서식 변경)다. 판정 실패가 아니므로
 *      WITH_ERROR 를 넘긴다. */
step('check-a11', () => runNode('check-a11.mjs', CODES.WITH_ERROR));
// 🔴 check-direction 은 2 = 「게이트 버그」(활성 공정 해석 실패)를 낸다 — 판정 실패가 아니다.
step('check-direction', () => runNode('check-direction.mjs', CODES.WITH_ERROR));
/* 🔴 **A12 판정의 정본 게이트.** (2026-08-22 신설 → 같은 날 차단 게이트로 전환)
 *   `check-direction` 바로 뒤에 둔다. 같은 규칙 원장을 보되 **묻는 것이 다르다**:
 *     · check-direction : 「그 규칙이 **화면에 도달**하는가」(V1 — V2 는 비차단 강등)
 *     · check-a12c      : 「학습자가 그 **원인을 만질 수 있는가**」(inputName ∈ ParamPool)
 *   🔴 **오케스트레이터 확정 판정: 「A12 를 새 기준으로 채택한다.」**
 *      그래서 이 게이트는 이제 **차단한다.** 차단 조건은 둘뿐이다:
 *        ① L2 방향성 LO 커버리지 < 100 %              → exit 1
 *        ② 래칫 공정별 조작가능 수 < 기준선            → exit 1
 *      계측 실패 E1~E8 은 exit 2. 기준선 정본: `scripts/lib/a12c-baseline.mjs`
 *   ⛔ **「공정당 N개 이상」 절대수 하한은 차단 조건이 아니다** — PLN §26B-12-3 폐기안이다.
 *      「목표 5」는 비차단 표시 전용(AC-3).
 *   🔴 **채택은 완화가 아니다.** 채택 시점의 L2 는 13/24(54.2 %) 로 이미 불합격이었다.
 *      바뀐 것은 빨간불의 **이유**다 — 「3D 씬에 나타나는가」(씬 유무에 인질) 에서
 *      「학습자가 **만질 수 있는 노브**에 방향 보증이 있는가」로.
 *   🔴 **실패 게이트가 2종인 것이 정상이다**(`check-direction` + `check-a12c`). 줄이려 하지 마라 —
 *      둘은 다른 명제를 재고, 어느 하나가 초록이어도 다른 하나의 결함은 그대로 실재한다.
 *   🔴 이 계측기의 사각지대 B-1(「이름이 같아도 같은 물리량인지 모른다」)은 매 실행 머리에 출력된다.
 *      **이름만 맞추면 수가 오르고 이 게이트는 그것을 막지 못한다.** 그 고지를 지우지 마라. */
step('check-a12c', () => runNode('check-a12c.mjs', CODES.WITH_ERROR));

if (skipBuild) {
  skip('tsc --noEmit', '--skip-build');
  skip('vitest run', '--skip-build');
} else {
  step('tsc --noEmit', () => runCmd('npx', ['tsc', '--noEmit']));
  step('vitest run', () => runCmd('npx', ['vitest', 'run']));
}

if (fsExistsSync(DIST_DIR)) {
  step('check-bundle', () => runNode('check-bundle.mjs'));
} else {
  skip('check-bundle', 'dist/ 없음 — 빌드 후 재실행하세요');
}

// 🔴 A10 은 **하드 게이트**다. SKIP 은 PASS 가 아니다 —
//    건너뛰면 누가 CSS 를 건드려도 회귀를 막지 못한다.
//    playwright-core(브라우저 번들 없음) + 시스템 Chrome 으로 실제로 돌린다.
step('check-overflow', () => runNode('check-overflow.mjs'));

/* 🔴 check-collision — **계측 전용 게이트**(2026-08-24 CEO 지시로 신설).
 *   CEO 지적: 「그래프 혹은 도형 등이 텍스트와 겹쳐 보이는 경우가 많다」.
 *   `check-overflow`(A10) 는 **가로로 넘쳤는가**만 본다. 넘치지 않고 **제자리에서 겹치는** 것은
 *   그 게이트의 사각지대였다. 이 게이트가 그 칸을 맡는다 — 둘은 겹치지 않는다.
 *
 *   🔴 **차단하지 않는다.** 무인자로 부르면 위반이 있어도 0 을 낸다(CEO: 「우선 계측만 하고
 *      exit 1 은 넣지 마라 — 실측을 보고 내가 판정한다」). 차단으로 올리려면 `--strict`
 *      또는 `--ratchet` 을 붙여 부르도록 이 줄을 고친다.
 *   🔴 2 = 「재지 못했다」(Chrome·dist 부재 등)이며 **판정 실패가 아니다** → CODES.WITH_ERROR.
 *   🔴 dist/ 를 띄워 잰다. **src 를 고쳐도 리빌드 전에는 반영되지 않는다**(check-overflow 와 같다). */
step('check-collision', () => runNode('check-collision.mjs', CODES.WITH_ERROR));

// 🔴 A6-b 도 하드 게이트다. 「소스에 문자열이 있다」가 아니라 **화면에 고지가 나온다**를 잰다.
//    dist/ 가 없으면 실패한다 — SKIP 은 PASS 가 아니다.
step('check-a6b', () => runNode('check-a6b.mjs'));

/* ══════════════════════════════════════════════════════════════════════════════
 * §X 형제 픽스처 파일(`scripts/*.selftest.mjs`)을 **verify 안에서 직접 돌린다**
 *     (2026-08-22 신설 — 「있다고 세면서 안 도는」 구멍을 구조로 막는다)
 * ══════════════════════════════════════════════════════════════════════════════
 *  🔴 **무엇이 구멍이었나.**
 *    `scripts/lib/gate-classify.mjs` 는 `*.selftest.mjs` 를 **「그 게이트에는 픽스처가 있다」의
 *    근거로 센다.** 그런데 그 실행은 `selftest-gates.mjs` 안에만 있었고,
 *    `selftest-gates` 는 **배타 락 때문에 verify 에 편입되지 않는다**(아래 §W).
 *    결과: `npm run verify` 만 돌리는 사람에게는
 *      **「픽스처가 있다」는 세어지는데 「픽스처가 통과한다」는 한 번도 재지지 않는다.**
 *    실제로 2026-08-22 `check-citations.selftest.mjs` 가 **20건 중 6건 실패** 중이었는데
 *    verify 는 그동안 내내 초록이었다. **계측기가 자기가 못 보는 것을 말하지 않은 것이다.**
 *
 *  🔴 **왜 §W 와 충돌하지 않나.** 여기서 도는 것은 `selftest-gates.mjs` 가 **아니다.**
 *    형제 픽스처 파일 3종은 `scripts/.selftest.lock` 을 **잡지도 보지도 않고**(2026-08-22 확인:
 *    세 파일 어디에도 `.lock` 참조가 없다), 주입은 `os.tmpdir()` 이거나
 *    `scripts/fixtures/**` 읽기 전용이라 **실트리를 건드리지 않는다.**
 *    즉 §W 가 편입을 막은 사유(락 미획득 = 종료코드 3 = 「남이 쓰는 중」이 판정으로 둔갑)는
 *    여기에 **성립하지 않는다.** §W 는 그대로 살아 있다 — `selftest-gates` 는 여전히 편입 밖이다.
 *
 *  🔴 **왜 「목록을 따로 적기」가 아니라 「열거해서 돌리기」인가.**
 *    목록을 손으로 적으면 다음 픽스처가 생겼을 때 또 갈라진다 —
 *    **주의로 막은 것은 안 지켜지고 구조로 막은 것은 지켜진다.**
 *    여기서는 **세는 규칙(`isSelftestFixtureFile`)과 도는 목록이 같은 한 줄**이다.
 *    그래서 「세었는데 안 돈다」가 **원리적으로 성립할 수 없다.**
 *
 *  종료코드 해석: 0 통과 · 1 픽스처 실패(판정 실패) · 그 밖 = ERROR(계측기 고장).
 *  고아 픽스처(대응 게이트 파일이 없다)는 **FAIL 이 아니라 ERROR** 다 —
 *  「픽스처가 틀렸다」가 아니라 「연결이 틀렸다」이므로 수치를 믿을 수 없다(selftest-gates 와 같은 규율).
 * ══════════════════════════════════════════════════════════════════════════════ */
function runSelftestFixtures() {
  const files = readdirSync(__dirname).filter(isSelftestFixtureFile).sort();
  if (files.length === 0) {
    // 🔴 0 건은 「통과」가 아니라 「셀 것이 없다」다. 그래도 세는 쪽도 0 이므로 갈라짐은 없다.
    console.log('  픽스처 파일 0 개 — 셀 것도 돌릴 것도 없습니다(세는 쪽과 도는 쪽이 같습니다).');
    return { status: S.PASS, code: 0 };
  }
  console.log(`  형제 픽스처 파일 ${files.length} 개를 **전건 실행**합니다: ${files.join(' · ')}`);

  const orphans = files.filter((f) => !fsExistsSync(path.join(__dirname, `${fixtureTargetGate(f)}.mjs`)));
  const failed = [];
  const errored = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], CHILD_IO);
    echo(r);
    if (r.signal || r.status === null || r.status === undefined) { errored.push(`${f}(비정상 종료)`); continue; }
    if (r.status === 0) continue;
    if (r.status === 1) failed.push(f);
    else errored.push(`${f}(exit ${r.status})`);
  }

  // 🔴 이름으로 적는다. 개수는 픽스처가 늘면 조용히 변한다.
  if (orphans.length) {
    console.error(`  ⚠️  고아 픽스처 ${orphans.length}종 — 대응 게이트 파일이 없습니다: ${orphans.join(' · ')}`);
    console.error('     🔴 「픽스처 실패」가 아니라 **연결이 틀린 것**입니다. 커버리지 수치를 쓰지 마십시오.');
  }
  if (failed.length) console.error(`  ❌ 픽스처 실패: ${failed.join(' · ')}  ← 그 게이트의 「통과」는 아직 증명되지 않았습니다`);
  if (errored.length) console.error(`  ⚠️  픽스처 계측기 오류: ${errored.join(' · ')}`);
  if (!orphans.length && !failed.length && !errored.length) {
    console.log(`  ✅ 형제 픽스처 ${files.length}/${files.length} 통과 — 「있다고 센 것」이 전부 실제로 돌았습니다.`);
  }

  if (orphans.length || errored.length) return { status: S.ERROR, code: 2 };
  if (failed.length) return { status: S.FAIL, code: 1 };
  return { status: S.PASS, code: 0 };
}
step('selftest-fixtures', () => runSelftestFixtures());

/* ══════════════════════════════════════════════════════════════════════════════
 * §W `selftest-gates` 는 **의도적으로 편입하지 않는다** (오케스트레이터 판정 ① · 2026-08-21)
 * ══════════════════════════════════════════════════════════════════════════════
 *   🔴 **다시 넣지 마십시오. 빠뜨린 것이 아닙니다.**
 *
 *   이유는 **배타 락**이다. `selftest-gates.mjs` 는 `scripts/.selftest.lock` 으로 동시 실행을
 *   막고, 락을 못 잡으면 **종료코드 3 = 「다른 실행 중」**으로 죽는다(그 파일 48~106행).
 *   3 은 **계측기 사정**이지 판정이 아니다. 이것을 verify 안에서 돌리면
 *   **누가 옆에서 selftest 를 돌리고 있다는 이유만으로 verify 가 실패**한다 —
 *   즉 「제품이 위반했다」와 「지금 남이 쓰고 있다」가 같은 얼굴이 된다.
 *   락을 넣은 이유가 정확히 그것이므로, 편입은 락의 취지를 되돌리는 일이 된다.
 *
 *   🔴 **그렇다고 침묵하지도 않는다 — 편입도 침묵도 아닌 제3의 길이다.**
 *   verify 마지막에 「별도 실행 필요」 안내를 **조건 없이 항상** 찍는다(아래 SELFTEST_NOTICE).
 *   침묵하면 다음 사람은 「verify 가 초록이니 전부 봤다」고 믿는다.
 *   **모르는 것을 괜찮은 것으로 넣지 않는다** — 이 파일 전체를 관통하는 규율과 같다.
 *
 *   실행법: npm run selftest:gates   (0 통과 · 1 판정 실패 · 2 계측기 오류 · 3 다른 실행 중)
 *   🔴 **2 는 「위반을 찾았다」가 아니다.** 복구 실패·픽스처 연결 실패처럼 계측기가 고장 난 상태이고,
 *      그때의 탐지·미탐지 수치는 전부 무효다. ERROR 는 FAIL 보다 세다.
 * ══════════════════════════════════════════════════════════════════════════════ */
const SELFTEST_NOTICE =
  'ℹ️  `selftest-gates` 는 **별도 실행 필요 — 이 verify 에 포함되지 않음**'
  + ' (배타 락 때문 · `npm run selftest:gates` · 사유는 verify.mjs §W)\n'
  /* 🔴 종료코드 해석을 **읽는 자리에** 적는다(2026-08-22 추가).
   *    편입 제외라 위 §V 해석표가 이 게이트에는 적용되지 않는다. 즉 **2 를 ERROR 로 옮겨 주는
   *    기계가 아예 없고**, 사람이나 CI 가 직접 읽어야 한다. 코드로 못 막으면 최소한 적어 둔다.
   *    2026-08-21 오염 사고가 조용히 지나간 것이 정확히 「아무도 안 읽었다」였다. */
  + '   🔴 종료코드 2 = **계측기 오류**(복구 실패·픽스처 연결 실패 등).\n'
  + '      그 실행의 탐지·미탐지 결과는 **전부 신뢰할 수 없습니다** — 판정 실패(1)와 다릅니다.\n'
  + '      0 통과 · 1 판정 실패 · 2 계측기 오류 · 3 다른 실행 중. **2 를 0 처럼 넘기지 마십시오.**\n'
  /* 🔴 2026-08-22 — 이 안내가 「픽스처는 전부 verify 밖」으로 읽히던 것을 끊는다.
   *    형제 픽스처 파일은 이제 verify 안에서 전건 돈다(§X). 밖에 남은 것은 **주입 케이스뿐**이다. */
  + '   ℹ️  단, `scripts/*.selftest.mjs` **형제 픽스처는 위 `selftest-fixtures` 단계에서 전건 실행됩니다**(§X).\n'
  + '      verify 밖에 남은 것은 `selftest-gates` 의 **주입 케이스**뿐입니다.';

// ---------- 요약 표 ----------
const BADGE = {
  [S.PASS]: '✅ PASS',
  [S.FAIL]: '❌ FAIL',
  [S.UNDET]: '🟡 UNDETERMINED',
  [S.ERROR]: '⚠️  ERROR',
  [S.SKIP]: '⏭  SKIP',
};

console.log('\n\n=========== verify 결과 요약 ===========');
const nameWidth = Math.max(...results.map((r) => r.name.length), 10);
for (const r of results) {
  const detail = r.detail ? ` (${r.detail})` : '';
  // 🔴 0 이 아닌 종료코드는 **숫자를 그대로 보여 준다.** 상태만 적으면 다음 사람이
  //    「2 였나 4 였나」를 되짚을 방법이 없다(그 되짚기가 오늘 이 작업을 낳았다).
  const raw = r.status !== S.SKIP && r.code !== 0 && r.code != null ? ` [exit ${r.code}]` : '';
  console.log(`  ${r.name.padEnd(nameWidth)}  ${BADGE[r.status]}${raw}${detail}`);
}

const names = (st) => results.filter((r) => r.status === st).map((r) => r.name);
const passed = names(S.PASS);
const failed = names(S.FAIL);
const undetermined = names(S.UNDET);
const errored = names(S.ERROR);
const skipped = names(S.SKIP);

console.log('  ' + '─'.repeat(nameWidth + 12));
// 🔴 집계 — **UNDETERMINED 를 PASS 에 합산하지 않는다.** 네 칸을 따로 센다.
//    (check-live-judgment.mjs:218~221 의 집계 줄과 같은 형식·같은 원칙이다.)
console.log(
  `  집계 · 게이트 ${results.length}개: ✅${passed.length} ❌${failed.length}`
  + ` 🟡${undetermined.length} ⚠️ ${errored.length} ⏭${skipped.length}`,
);
console.log('  🔴 🟡UNDETERMINED 는 PASS 로 세지 않습니다 — 「모른다」이지 「통과」가 아닙니다.');
// 🔴 오케스트레이터 판정 3 조건② — 잔여 PENDING 건수를 **요약에 항상** 출력한다.
//    게이트를 WARN 으로 완화했으므로, 숫자를 눈앞에 두지 않으면 그대로 잊힌다.
console.log('  ' + pendingSummaryLine(APP_ROOT));
console.log('=========================================\n');

/* 🔴 **인계 규약(2026-08-21 확정) — 「개수」가 아니라 「게이트 이름」으로 적는다.**
 *
 *   「4 FAIL 이 정상」처럼 **개수로 인계하면 조용히 틀린다** — 게이트가 하나 늘거나
 *   실행 환경이 바뀌면 숫자가 움직이는데, 인계받은 사람은 그것을 알 길이 없다.
 *   **이름은 변하지 않는다.** 그래서 실패한 게이트 이름을 **마지막 줄에 항상 찍는다.**
 *   다음 사람은 이 줄을 그대로 스레드에 옮겨 적으면 된다.
 *
 *   🔴 2026-08-21 확장 — **세 줄을 전부, 항상 찍는다.** FAIL 이 있어도 🟡·⚠️ 줄을 가리지 않는다.
 *      가리면 「FAIL 만 고치면 끝」으로 읽히고 판정 불가가 조용히 사라진다.
 *      🔴 UNDETERMINED 도 **개수가 아니라 이름으로** 적는다 — 같은 이유다. */
if (skipped.length) console.log(`건너뛴 게이트: ${skipped.join(' · ')}`);
console.log(failed.length
  ? `🔴 실패 게이트(${failed.length}종): ${failed.join(' · ')}`
  : '✅ 실패 게이트: 없음');
console.log(errored.length
  ? `⚠️  계측기 오류 게이트(${errored.length}종): ${errored.join(' · ')}  ← 판정 실패가 아니라 **재지 못한** 것입니다`
  : '✅ 계측기 오류 게이트: 없음');
console.log(undetermined.length
  ? `🟡 판정 불가(${undetermined.length}종): ${undetermined.join(' · ')}  ← **통과가 아닙니다.** PASS 로 세지 마십시오`
  : '✅ 판정 불가: 없음');
console.log('   ㄴ 🔴 인계할 때 **개수가 아니라 위 이름**을 적으세요. 개수는 게이트가 늘면 조용히 변합니다.');
// 🔴 **조건 없이 항상 찍는다.** 종료코드가 0 이든 1 이든 2 든 4 든 똑같이 나온다 —
//    「verify 가 초록이니 전부 봤다」는 오해를 막는 것이 이 줄의 유일한 목적이다(§W).
console.log(SELFTEST_NOTICE);

/* ── 종료코드 (§V) — 우선순위 FAIL(1) > ERROR(2) > UNDETERMINED(4) ── */
if (failed.length) {
  console.error('❌ verify 실패 — 위 표에서 FAIL 항목을 확인하세요.');
  if (undetermined.length || errored.length) {
    console.error('   🔴 FAIL 이 우선이라 종료코드는 1 입니다. 그러나 위 🟡/⚠️ 줄도 **함께 남은 일**입니다.');
  }
  process.exit(1);
}

if (errored.length) {
  console.error('⚠️  verify 판정 미완 — 계측기가 고장 나 재지 못한 게이트가 있습니다(종료코드 2).');
  console.error('   🔴 이것은 「위반 없음」이 아닙니다. 게이트를 고친 뒤 다시 재십시오.');
  if (undetermined.length) console.error('   🔴 판정 불가(🟡)도 함께 남아 있습니다 — 위 줄을 보십시오.');
  process.exit(2);
}

if (undetermined.length) {
  // 🔴 여기가 이 파일의 핵심이다. **0 으로 내보내지 마라.**
  //    0 이면 「초록이니 괜찮다」로 소비되고, 1 이면 「위반을 찾았다」는 거짓 주장이 된다.
  console.error('🟡 verify 판정 불가 — 위반은 못 찾았지만 **판정하지 못한 게이트가 있습니다**(종료코드 4).');
  console.error('   🔴 「전부 통과」가 아닙니다. 위 🟡 줄의 게이트 이름을 그대로 인계하십시오.');
  process.exit(4);
}

// 🔴 이 문구는 **FAIL 0 · ERROR 0 · UNDETERMINED 0** 일 때만 찍힌다.
//    판정 불가가 하나라도 있으면 「전부 통과」라고 말하지 않는다.
console.log('✅ verify 전체 통과');
process.exit(0);
