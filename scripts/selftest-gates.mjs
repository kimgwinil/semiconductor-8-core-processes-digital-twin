#!/usr/bin/env node
/**
 * 🔴 게이트 자체 검증 — 「통과」가 위반이 없어서인지, 위반을 못 봐서인지는 픽스처로만 갈린다.
 *
 * 각 게이트에 **고의 위반**을 주입하고 종료코드 1 이 나오는지 확인한 뒤 원상 복구한다.
 * 실제로 이 방식이 A10 게이트의 무력화(`overflow-x: hidden` 클리핑)를 잡아냈다.
 *
 * 🔴 복구는 finally 로 보장한다. 중간에 죽어도 원본이 남지 않게 한다.
 *
 * 🔴 baseline 구분(2026-08-20 추가)
 *    게이트가 **주입과 무관하게 원래부터 FAIL** 이면
 *      ① 주입 케이스는 무조건 「탐지」로 보인다 → 거짓 탐지 성공
 *      ② 사후 확인에서 「복구 실패」로 오귀속된다
 *    그래서 **주입 전에 baseline 을 1회 측정**하고, 그 값과 비교해 판정한다.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, statSync, openSync, closeSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGateCoverage } from './lib/selftest-coverage.mjs';

/** 바이트 단위 동일성 확인용. 복구가 정말 되돌아갔는지 이걸로만 판정한다. */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* 🔴 복구 실패 등록부 — 하나라도 차면 **종료코드 2(계측기 오류)** 로 끝난다.
 *    「판정 실패(1)」와 반드시 갈라야 한다: 1 은 「제품이 위반했다」이고
 *    2 는 「계측기가 고장 나서 이번 실행의 PASS/FAIL 을 하나도 믿을 수 없다」이다. */
const RESTORE_FAILURES = [];
/** 지금 이 순간 주입돼 있는(=아직 복구 안 된) 스냅샷들. 비정상 종료 경로에서 되돌린다. */
const liveSnapshots = new Set();
/* 🔴 `qa-sweep` 의 **프레임 유효성 관문**을 단위로 잡기 위한 import.
 *    스윕 전체(브라우저 기동 + 24칸 × 슬라이더 × 8캡처, 5분 이상)를 돌려야만 검증되는 코드는
 *    사실상 검증되지 않는다 — 그래서 규칙을 `scripts/lib/frame.mjs` 로 빼고 여기서 단위로 친다. */
import { analyzePNG, frameGateProblem, makeBlankFramePNG, makeBusyFramePNG } from './lib/frame.mjs';
/* 🔴 A9 예산 정본. check-bundle.mjs 와 **같은 수를 두 번 쓰지 않기 위해** 여기서 가져온다.
 *    (종전에는 이 파일이 1048576 을 따로 들고 있었다 — check-constants R1·R3 위반.) */
import { JS_LIMIT } from './lib/bundle-budget.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(APP, 'src');
const DIST = join(APP, 'dist');

/* ══════════════ 🔴 배타 락 — **동시 실행 금지** (2026-08-21 신설) ══════════════
 *
 * ── 왜 생겼나: 가정이 아니라 실제로 트리를 오염시켰다 ──────────────────────────
 *   pid 69228 과 75645 가 겹쳐 돌면서 `withTempFile` 의 스냅샷이 **교차 오염**됐다.
 *   A 가 원본을 저장 → B 가 같은 파일을 주입본으로 덮음 → A 가 「원본」이라며
 *   **B 의 주입본을 복구**한다. 결과로 주입 픽스처 2건이 트리에 그대로 남았다:
 *     · `dist/assets/index-*.css` 에 `#root::after{inline-size:3000px}`
 *       → `check-overflow` 가 74경로 × 3해상도 **전부 실패**
 *     · `src/content/model-grades.json` 의 `eds.lab.s6.costPerGoodDie` 가
 *       **경향모델/synthetic → 문헌식/literature 로 조용히 승격**
 *       → 🔴 **A6-b 가 정확히 막으려던 그 일이 계측기 자신에 의해 일어났다.**
 *
 *   CEO 지시로 병렬 작업이 확대됐으므로 이것은 **반드시 재발한다.**
 *
 * ── 🔴 설계에서 중요한 것: 락 실패를 「판정 실패」로 보이게 하지 않는다 ────────
 *   종전 사고에서 오염은 **「복구 실패」로만 보였고 원인을 아무도 못 짚었다.**
 *   그래서 락을 못 잡으면 **종료코드 3**(판정 실패 1 · 계측기 오류 2 와 구분)으로 죽고,
 *   **누가 언제부터 돌고 있는지**를 명시적으로 찍는다.
 *
 * ── 🔴 종료코드 규약 (2026-08-22 개정) ──────────────────────────────────────
 *   0  전 케이스 탐지
 *   1  **판정 실패** — 주입했는데 못 잡은 게이트가 있다(제품/게이트의 문제)
 *   2  🔴 **계측기 오류** — 이번 실행의 PASS/FAIL 을 하나도 믿을 수 없다. 두 갈래다:
 *        ⓐ 복구 실패 — 주입본이 트리에 남았을 수 있다(`RESTORE_FAILURES`)
 *        ⓑ 필터 무효 — `SELFTEST_ONLY` 가 아무 픽스처에도 안 맞는다
 *      🔴 **ERROR 는 FAIL 보다 세다.** 계측기가 고장 난 상태에서 나온 초록은 초록이 아니다.
 *   3  배타 락 미획득(다른 selftest 가 실행 중) — **계측기 사정이지 결함이 아니다**
 *   ⚠️ 이 스크립트는 `verify.mjs` 에 편입되지 않는다(§W). 즉 위 코드를 **해석해 주는
 *      상위 표가 없다** — 사람이나 CI 가 직접 읽어야 한다. 2 를 0 처럼 넘기지 마라.
 */
const LOCK_PATH = join(APP, 'scripts', '.selftest.lock');

/** 그 pid 가 살아 있는가. EPERM 은 「살아 있는데 내 권한 밖」이라 살아 있는 것으로 센다. */
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // 'wx' = 이미 있으면 실패. 존재 확인과 생성 사이에 틈이 없다(원자적).
      const fd = openSync(LOCK_PATH, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }, null, 2));
      closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let held = null;
      try { held = JSON.parse(readFileSync(LOCK_PATH, 'utf8')); } catch { /* 깨진 락 파일 */ }
      if (held && Number.isInteger(held.pid) && held.pid !== process.pid && pidAlive(held.pid)) {
        console.error('\n🔴🔴 다른 selftest-gates 가 실행 중입니다 — 이 실행을 중단합니다.');
        console.error(`   실행 중인 프로세스: pid ${held.pid} · 시작 ${held.started}`);
        console.error('   🔴 이것은 **판정 실패가 아닙니다**(종료코드 3). 게이트가 깨진 것이 아닙니다.');
        console.error('   ─────────────────────────────────────────────────────────────');
        console.error('   왜 막는가: 이 스크립트는 실파일에 고의 위반을 주입했다가 되돌립니다.');
        console.error('   둘이 겹쳐 돌면 서로의 스냅샷을 덮어써 **주입본이 트리에 그대로 남습니다.**');
        console.error('   2026-08-21 에 실제로 일어났고, `model-grades.json` 의 등급이');
        console.error('   합성 → 문헌식으로 조용히 승격된 채 남았습니다.');
        console.error('   ─────────────────────────────────────────────────────────────');
        console.error(`   저 프로세스가 끝난 뒤 다시 실행하세요. 이미 죽은 프로세스라면 ${LOCK_PATH} 를 지우세요.\n`);
        process.exit(3);
      }
      // 주인이 죽은 락(비정상 종료로 남은 것) — 알리고 회수한다. 조용히 넘어가지 않는다.
      console.warn(`⚠️  주인 없는 락을 회수합니다(pid ${held?.pid ?? '미상'} 는 살아 있지 않습니다). 이전 실행이 비정상 종료했을 수 있으니 트리 상태를 확인하세요.`);
      rmSync(LOCK_PATH, { force: true });
    }
  }
  console.error('🔴 락 획득에 반복 실패했습니다. 경합이 계속되고 있습니다.');
  process.exit(3);
}

/** 내가 잡은 락만 푼다 — 남의 락을 지우면 락이 없는 것과 같아진다. */
function releaseLock() {
  try {
    const held = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    if (held.pid === process.pid) rmSync(LOCK_PATH, { force: true });
  } catch { /* 이미 없거나 남의 것 */ }
}

acquireLock();
// 🔴 어떤 경로로 죽어도 락을 남기지 않는다. 남은 락은 다음 사람을 영구히 막는다.
process.on('exit', releaseLock);
/* 🔴 비정상 종료에서도 **먼저 주입본을 되돌리고** 그 다음에 락을 푼다.
 *    순서가 중요하다 — 락을 먼저 풀면 다른 실행이 주입본이 남은 트리를 재기 시작한다.
 *    2026-08-21 사고가 정확히 이 경로였고, 그때는 이 복구가 아예 없었다. */
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restoreAllLiveSnapshots(`${sig} 수신`);
    releaseLock();
    process.exit(RESTORE_FAILURES.length ? 2 : 3);
  });
}
process.on('uncaughtException', (e) => {
  restoreAllLiveSnapshots('처리되지 않은 예외');
  releaseLock();
  console.error(e);
  process.exit(RESTORE_FAILURES.length ? 2 : 1);
});

/* ══════════════ 🔴 단위 픽스처 — qa-sweep 프레임 유효성 관문 ══════════════
 *
 * 사고(2026-08-20~21): `etch-lab-applied-s1-소스_파워_ICP_P_s-scene-{min,max}.png` 2장은
 * 씬 청크 404 로 캔버스가 **백지**인 채 캡처됐다. 스크린샷은 성공하고 PNG 도 멀쩡히
 * 디코딩된다 — 종전 계측기 입장에서는 「정상 측정」이었다. 빈 그림 둘의 히스토그램
 * 거리는 0 이고, 그건 「파라미터에 반응 안 함」과 수치상 구별되지 않는다.
 *
 * 관문 규칙: **무효 프레임이 하나라도 섞이면 그 판정은 `null`(판정 불가)** 이다.
 *            `true` 로도 `false` 로도 쓰지 않는다.
 *
 * ⚠️ **정직한 한계 고지 — 이것은 게이트 스크립트 실행이 아니라 단위 호출이다.**
 *    다른 케이스들처럼 `check-*.mjs` 를 자식 프로세스로 돌려 종료코드를 보지 않는다.
 *    `qa-sweep` 전체를 돌리는 것이 너무 무거워서(브라우저 기동 + 수 분), 대신 규칙 자체를
 *    `lib/frame.mjs` 의 `frameGateProblem` 으로 빼고 **qa-sweep 과 이 픽스처가 같은 함수를
 *    부르게** 만들었다. 규칙을 두 군데 적어 두면 한쪽만 고쳐지고 픽스처는 계속 통과한다.
 *    그래도 검증되지 않는 것: qa-sweep 의 **호출부 배선**(그 함수를 실제로 부르는지)과
 *    **렌더 대기 루프**. 그 둘은 이 픽스처가 잡지 못한다.
 */
const N_CAP = 4;
/** 프레임 묶음을 관문에 넣고 게이트처럼 종료코드를 흉내낸다. 문제가 잡히면 1, 통과면 0. */
function runFrameGate(minBufs, maxBufs) {
  const a = minBufs.map((b) => analyzePNG(b));
  const b = maxBufs.map((x) => analyzePNG(x));
  const pMin = frameGateProblem(a, 'min', N_CAP);
  const pMax = frameGateProblem(b, 'max', N_CAP);
  // 🔴 관문이 문제를 찾으면 그 슬라이더 판정은 null 이 된다 = 「위반을 잡았다」.
  return (pMin || pMax) ? 1 : 0;
}
const busy = (seed) => [...Array(N_CAP)].map((_, i) => makeBusyFramePNG(64, 48, seed + i));
const blank = () => [...Array(N_CAP)].map(() => makeBlankFramePNG());

/** 이 유사(pseudo) 게이트의 baseline 러너. `check-*.mjs` 가 아니므로 별도로 정의한다. */
const UNIT_GATE = 'qa-sweep-frame';
const UNIT_BASELINE = {
  /* 🔴 baseline = **정상 프레임만 넣으면 관문이 통과시킨다**(exit 0).
   *    이걸 안 재면 「전부 null 로 만드는 망가진 관문」도 주입 케이스를 통과시킨다. */
  [UNIT_GATE]: () => runFrameGate(busy(1), busy(100)),
};

/* 🔴 `--root` 를 쓰는 게이트의 baseline. **깨끗한 트리**에서 0 이 나오는지 먼저 잰다.
 *    이걸 안 재면 「무엇을 넣어도 실패하는 망가진 게이트」도 주입 케이스를 통과시킨다. */
let SCOPED_BASELINE = {};

function runGate(script, args = []) {
  try {
    execFileSync(process.execPath, [join(APP, 'scripts', script), ...args], { cwd: APP, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

/* ══════════════ 🔴 스코프 픽스처 — `--root=` 로 뿌리를 갈아 끼운다 ══════════════
 *
 * 왜 필요한가: `check-constants` 와 `check-test-formulas` 는 **저장소 현행 상태에서 이미 FAIL** 이다
 * (§3-X A-11 의 중복 상수 8종이 실재하고, 기대식 복붙도 실재한다). 이 스크립트는 baseline 이
 * 0 이 아닌 게이트의 주입 케이스를 **SKIP** 으로 처리하므로 — 그 판단은 옳다, 이미 실패 중인
 * 게이트는 무엇을 주입해도 「탐지」로 보인다 — 그대로 두면 **새 게이트 3종이 영원히 검증되지 않는다.**
 *
 * 그래서 세 게이트에 `--root=<경로>` 를 두고, 픽스처 전용 임시 트리를 갈아 끼운다.
 *   · baseline = **깨끗한** 트리(위반 0) → exit 0 이어야 한다
 *   · 주입     = **더러운** 트리(고의 위반 1건) → exit 1 이어야 한다
 *
 * ⚠️ **정직한 한계 고지.** 이것은 게이트를 자식 프로세스로 실제 실행하고 종료코드를 보는,
 *    다른 케이스와 같은 방식이다. 다만 **기본 뿌리 결정 로직**(`src/**` · `scripts/**` 를 고르는 부분)만은
 *    이 픽스처가 검증하지 않는다. 판정 규칙 자체는 같은 코드 경로를 그대로 탄다.
 *    `src/**` 를 건드리지 않는다는 이점도 있다 — 동시에 다른 담당 3인이 작업 중이다(2026-08-21).
 */
const FIXTURE_ROOT = join(APP, 'scripts', '.selftest-fixtures');
let fixtureSeq = 0;

/** 임시 트리를 만들어 게이트를 `--root` 로 돌리고, **finally 로 통째로 지운다.** */
function withFixtureRoot(files, script) {
  const dir = join(FIXTURE_ROOT, `t${process.pid}-${fixtureSeq++}`);
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return runGate(script, [`--root=${dir}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    // 다른 픽스처가 동시에 쓰고 있지 않으면 뿌리 디렉터리도 지운다(빈 디렉터리를 남기지 않는다).
    try { if (readdirSync(FIXTURE_ROOT).length === 0) rmSync(FIXTURE_ROOT, { recursive: true, force: true }); } catch { /* 이미 없다 */ }
  }
}

/** 🔴 W6 스코프 픽스처 생성기. 기본은 **깨끗한 트리**(위반 0)이고, 옵션으로 한 군데만 더럽힌다.
 *    `aScene:false` → a 칸의 씬을 떼어 **차트 0 · 씬 0** 을 만든다.
 *    `aPass` → a 칸 판정 출력의 합격창 모양을 고른다. **W6-6 의 판정 축이 바로 이것이다**(2026-08-22 정정):
 *        `'twoSided'`(기본) `{min:1, max:9}` — 양측 창. 화면이 0이면 **W6-6 위반이어야 한다**
 *        `'oneSided'`       `{min:1}`        — 단측 문턱. 화면이 0이어도 **위반이 아니어야 한다**
 *        `'singlePoint'`    `{min:1, max:1}` — 단일점 플래그. 화면이 0이어도 **위반이 아니어야 한다**
 *      🔴 뒤 둘은 수치 패널 + 판정 배너(`src/ui/sections/LabRunner.tsx:150-181`)로 읽히기 때문이다.
 *    `bResponds:false` → b 칸 차트가 입력을 무시하게 해 **W6-7**(현재 값 미표시)을 만든다.
 *    한 번에 하나만 더럽힌다 — 두 개를 겹치면 어느 규칙이 잡았는지 알 수 없다. */
function w6Fixture({ aScene = true, aPass = 'twoSided', bResponds = true } = {}) {
  const pts = bResponds
    ? 'points: [{ x: i.p1, y: 0 }, { x: i.p1, y: 1 }]'   // 현재 입력을 그린다
    : 'points: [{ x: 1, y: 0 }, { x: 1, y: 1 }]';        // 입력을 무시한다(고정)
  const PASS_SHAPES = {
    twoSided: '{ min: 1, max: 9 }',
    oneSided: '{ min: 1 }',
    singlePoint: '{ min: 1, max: 1 }',
  };
  // 🔴 오타로 조용히 기본값으로 떨어지면 음성 케이스가 양성 픽스처를 돌리게 된다 — 던진다.
  if (!(aPass in PASS_SHAPES)) throw new Error(`w6Fixture: 모르는 aPass '${aPass}'`);
  const aPassLiteral = PASS_SHAPES[aPass];
  return `import { registerLabs } from '/src/models/labs/spec';
const mk = (processId: string, stage: string, extra: any): any => ({
  processId, stage, objectiveId: 'X', titleKo: 't', titleEn: 't',
  params: [{ id: 'p1', ko: 'p', en: 'p', min: 0, max: 10, step: 1, initial: 5 }],
  outputs: [{ id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: { min: 1, max: 9 } }],
  compute: (i: any) => ({ y: { value: i.p1, unit: 'nm' } }),
  charts: [],
  ...extra,
});
export function registerAllLabs(): void {
  registerLabs([
    mk('a', 'lab-basic', {
      outputs: [{ id: 'y', ko: '출력 y', en: 'y', role: 'judge', pass: ${aPassLiteral} }],
      ${aScene ? "scene: { sceneId: 'someScene' }," : ''}
    }),
    mk('b', 'lab-basic', {
      scene: { sceneId: 's2' },
      charts: [{
        id: 'b.chart', kind: 'line', ko: 'c', en: 'c',
        xKo: 'x', xEn: 'x', yKo: 'y', yEn: 'y', yUnit: 'nm',
        judgesOutputs: ['y'],
        build: (i: any) => [{ id: 'op', ko: 'op', en: 'op', ${pts} }],
      }],
    }),
  ]);
}
`;
}

/**
 * 실파일의 한 조각을 바꿔치기했다가 되돌린다(복구는 withTempFile 의 finally).
 * 🔴 `from` 이 파일에 없으면 **던진다** — 코드가 바뀌어 픽스처가 헛돌면 조용히 통과하는 대신 크게 깨진다.
 */
function withSourcePatch(rel, from, to, script) {
  const abs = join(APP, rel);
  const raw = readFileSync(abs, 'utf8');
  if (!raw.includes(from)) throw new Error(`${rel}: 픽스처 앵커를 찾지 못했다 — ${JSON.stringify(from.slice(0, 60))}`);
  return withTempFile(rel, raw.replace(from, to), () => runGate(script));
}

/** 임시 파일을 만들었다가 반드시 지운다. */
function withTempFile(relPath, content, fn) {
  const abs = join(APP, relPath);
  // 🔴 우리가 만든 디렉터리를 기억했다가 되돌린다.
  //    파일만 지우고 빈 디렉터리를 남기면 다른 게이트가 그걸 보고 실패한다(실제로 겪었다).
  const created = [];
  let d = dirname(abs);
  while (!existsSync(d) && d.startsWith(SRC)) { created.push(d); d = dirname(d); }
  mkdirSync(dirname(abs), { recursive: true });
  const existed = existsSync(abs);
  const prev = existed ? readFileSync(abs) : null;
  // 🔴 비정상 종료 경로(SIGINT·SIGTERM·예외)에서도 되돌릴 수 있도록 등록해 둔다.
  //    2026-08-21 사고는 정확히 이 경로였다 — finally 가 돌지 못하면 주입본이 트리에 남는다.
  const snap = { abs, relPath, prev, existed, created };
  liveSnapshots.add(snap);
  try {
    writeFileSync(abs, content);
    return fn();
  } finally {
    restoreSnapshot(snap);
    liveSnapshots.delete(snap);
  }
}

/**
 * 🔴 스냅샷 하나를 되돌리고 **되돌아갔는지 바이트로 확인한다.**
 *
 * 종전에는 되돌리기만 하고 확인하지 않았다. 그래서 2026-08-21 의 교차 오염이
 * **조용히** 남았다 — 아무도 비명을 듣지 못했고, `eds.lab.s6.adProduct` 가
 * 합성 → 문헌식으로 승격된 채 하루를 넘겼다.
 * 이제 복구가 실패하면 `RESTORE_FAILURES` 에 쌓이고 **종료코드 2(계측기 오류)** 로 끝난다.
 * 🔴 ERROR 는 FAIL 보다 세다 — 계측기가 고장 난 상태에서는 PASS 도 FAIL 도 믿을 수 없다.
 */
function restoreSnapshot(snap) {
  const { abs, relPath, prev, existed, created } = snap;
  try {
    if (existed && prev !== null) {
      writeFileSync(abs, prev);
      // 🔴 되쓴 것으로 끝내지 않는다. **읽어서 원본과 바이트로 대조**한다.
      const now = readFileSync(abs);
      if (sha256(now) !== sha256(prev)) {
        RESTORE_FAILURES.push(
          `${relPath} — 복구 후 내용이 원본과 다릅니다 (원본 ${sha256(prev).slice(0, 12)}… / 현재 ${sha256(now).slice(0, 12)}…)`,
        );
      }
    } else {
      rmSync(abs, { force: true });
      if (existsSync(abs)) RESTORE_FAILURES.push(`${relPath} — 임시 파일이 지워지지 않았습니다.`);
    }
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    RESTORE_FAILURES.push(`${relPath} — 복구 중 예외: ${e.message}`);
  }
}

/** 🔴 비정상 종료 경로에서 남아 있는 스냅샷을 전부 되돌린다. 조용히 죽지 않는다. */
function restoreAllLiveSnapshots(why) {
  if (liveSnapshots.size === 0) return;
  console.error(`\n🔴 ${why} — 주입 중이던 파일 ${liveSnapshots.size}건을 복구합니다:`);
  for (const snap of [...liveSnapshots]) {
    console.error(`   · ${snap.relPath}`);
    restoreSnapshot(snap);
    liveSnapshots.delete(snap);
  }
  if (RESTORE_FAILURES.length) {
    console.error('🔴🔴 그 중 복구에 실패한 것이 있습니다 — 트리 상태를 즉시 확인하세요:');
    for (const f of RESTORE_FAILURES) console.error(`   ${f}`);
  }
}

/**
 * labels.json 의 첫 고지를 고의로 망가뜨렸다가 되돌린다.
 * 🔴 public/ 의 실데이터를 건드리므로 복구는 withTempFile 의 finally 에 맡긴다.
 */
function withNoteMutation(processId, mutate) {
  const rel = `public/assets/equipment/${processId}/labels.json`;
  const data = JSON.parse(readFileSync(join(APP, rel), 'utf8'));
  if (!Array.isArray(data.notes) || data.notes.length === 0) {
    throw new Error(`${rel}: notes 가 없어 픽스처를 만들 수 없다`);
  }
  mutate(data.notes[0]);
  return withTempFile(rel, JSON.stringify(data, null, 2), () => runGate('check-assets.mjs'));
}


/* ══════════════ 🔴 등급 원장 픽스처 — **실파일을 쓰지 않는다** (2026-08-22 전환) ══════════════
 *
 * ── 종전 방식이 실제로 결함을 만들었다 ────────────────────────────────────────
 *   종전에는 `withTempFile(LEDGER_REL, …)` 로 **실파일 `src/content/model-grades.json` 에
 *   직접 주입**했다. 2026-08-21 에 selftest 두 개가 겹쳐 돌면서 그 주입본이 복구되지 않았고,
 *   원장이 오염된 채 남았다. 배타 락은 **동시 실행**만 막고, 비정상 종료로 남은 주입본은 못 막는다.
 *
 *   🔴 그리고 그 흔적이 하나 더 있었다(2026-08-22 G-8 이 잡았다):
 *      `eds.lab.s6.adProduct` 가 **합성 → 문헌식으로 승격된 채** 하루를 넘겼다.
 *      키 순서상 `adProduct`(49) 가 `costPerGoodDie`(50) 보다 앞이라 **먼저 오염됐고**,
 *      나중에 표적이 50 으로 밀리면서 **50 만 복구되고 49 는 아무도 몰랐다.**
 *      → **A6-b 가 막으려던 바로 그 일을 A6-b 픽스처가 저질렀다.**
 *
 * ── 그래서 어떻게 바꿨나 ──────────────────────────────────────────────────────
 *   주입본을 **os.tmpdir() 에 쓰고** 게이트에 `--ledger <경로>` 로 가리킨다.
 *   `check-grades` · `check-a6b` 양쪽에 그 주입구를 뚫었다.
 *   🔴 실파일은 **읽기 전용으로만** 만진다(원본을 읽어 복제할 뿐 쓰지 않는다).
 *   `src/**` 전체와 `dist/**` 는 실물 그대로이므로 **판정 코드 경로는 완전히 같다** —
 *   G1(코드가 쓰는 modelId 대조)·G2(죽은 항목)·R2(화면 대조)가 전부 종전대로 돈다.
 *
 * ⚠️ **정직한 한계:** 게이트의 **기본 원장 경로 결정 로직**(인자가 없을 때 `src/content/…` 를
 *    고르는 부분)은 이 픽스처가 검증하지 않는다. 판정 규칙 자체는 같은 코드를 그대로 탄다.
 */
const LEDGER_REL = 'src/content/model-grades.json';
let ledgerFixtureSeq = 0;

/**
 * @param mutate  원장 문서를 고치는 콜백. 🔴 **필드 병합**으로 고쳐라 — §merge 주석 참조.
 * @param gate    돌릴 게이트 파일명
 */
function withLedgerMutation(mutate, gate = 'check-grades.mjs') {
  const doc = JSON.parse(readFileSync(join(APP, LEDGER_REL), 'utf8'));   // 🔴 읽기만 한다
  const ids = Object.keys(doc.models);
  if (ids.length === 0) throw new Error(`${LEDGER_REL}: models 가 비어 픽스처를 만들 수 없다`);
  mutate(doc, ids);
  const dir = mkdtempSync(join(tmpdir(), `cjh-ledger-${process.pid}-${ledgerFixtureSeq++}-`));
  const file = join(dir, 'model-grades.json');
  try {
    writeFileSync(file, JSON.stringify(doc, null, 2));
    return runGate(gate, ['--ledger', file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* 🔴 §merge — **주입은 교체가 아니라 병합이다.**
 *
 *   doc.models[id] = { declaredGrade: '문헌식', kind: 'literature' };            ❌ 통째 교체
 *   doc.models[id] = { ...doc.models[id], declaredGrade: '문헌식', kind: 'literature' };  ✅ 병합
 *
 * 통째 교체는 **주입하지 않은 필드까지 지운다.** 2026-08-21 오염본에서 `notice` 가
 * 사라진 것이 정확히 그 때문이다. 픽스처는 「한 가지만 틀린 상태」를 만들어야 하는데,
 * 교체는 여러 가지를 동시에 틀리게 만들어 **어느 규칙이 잡았는지도 흐린다.**
 * 그래서 이 헬퍼를 쓴다 — 콜백에서 `doc.models[id] = {...}` 를 직접 쓰지 마라.
 */
function mergeEntry(doc, id, patch) {
  const before = doc.models[id];
  if (!before) throw new Error(`등급 원장에 '${id}' 가 없어 병합할 수 없다`);
  doc.models[id] = { ...before, ...patch };
  return id;
}
/** 원장에서 조건에 맞는 첫 modelId. 없으면 픽스처를 만들 수 없으므로 던진다. */
function firstIdWhere(doc, pred, what) {
  const hit = Object.keys(doc.models).find((id) => pred(id, doc.models[id]));
  if (!hit) throw new Error(`등급 원장에 ${what} 항목이 없어 픽스처를 만들 수 없다`);
  return hit;
}

// ---------- dist 픽스처 보조 ----------
// 🔴 check-bundle · check-overflow 는 **src 가 아니라 dist/ 실산출물**을 본다.
//    (check-overflow 는 dist/ 를 정적 서버로 띄운다 — src/ui/styles 를 고쳐도 리빌드 전에는 반영되지 않는다.)
//    그래서 픽스처도 dist/ 를 임시 조작할 수밖에 없다. 복구는 withTempFile 의 finally 가 **바이트 단위로** 보장한다.
function distInitialAssets() {
  const indexHtml = join(DIST, 'index.html');
  if (!existsSync(indexHtml)) throw new Error('dist/index.html 이 없다 — 먼저 빌드하라');
  const html = readFileSync(indexHtml, 'utf8');
  const js = [];
  const css = [];
  for (const m of html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)) js.push(m[1].replace(/^\//, ''));
  for (const m of html.matchAll(/<link[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)) js.push(m[1].replace(/^\//, ''));
  for (const m of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)) css.push(m[1].replace(/^\//, ''));
  return { js, css };
}

/** dist 의 초기 청크 JS 에 더미 바이트를 덧붙여 A9 상한(1 MiB) 초과를 재현한다. */
function withBundleBloat() {
  const { js } = distInitialAssets();
  if (js.length === 0) throw new Error('dist/index.html 에서 초기 JS 를 찾지 못했다');
  const total = js.reduce((n, f) => n + (existsSync(join(DIST, f)) ? statSync(join(DIST, f)).size : 0), 0);
  const need = JS_LIMIT - total + 4096;          // 상한을 확실히 넘기도록 여유 4 KiB
  const target = js[0];
  const prev = readFileSync(join(DIST, target));
  // 🔴 더미는 **주석**으로 넣는다. 만에 하나 복구 전에 누가 열어도 JS 가 깨지지 않게.
  const pad = Buffer.from(`\n/*${'A'.repeat(Math.max(need, 1))}*/\n`);
  return withTempFile(join('dist', target), Buffer.concat([prev, pad]), () => runGate('check-bundle.mjs'));
}

/** dist 의 초기 CSS 끝에 규칙을 덧붙여 실제 브라우저에서 가로 넘침을 만든다. */
function withCssInjection(cssText, gate = 'check-overflow.mjs') {
  const { css } = distInitialAssets();
  if (css.length === 0) throw new Error('dist/index.html 에서 초기 CSS 를 찾지 못했다');
  const target = css[0];
  const prev = readFileSync(join(DIST, target));
  return withTempFile(join('dist', target), Buffer.concat([prev, Buffer.from(`\n${cssText}\n`)]),
    () => runGate(gate));
}

// #root 안에 3000px 짜리 가상요소를 만들어 확실하게 넘치게 한다(구조에 의존하지 않는다).
const OVERFLOW_RULE = "#root::after{content:'';display:block;inline-size:3000px;block-size:4px;background:#f00}";

/* ══════════════ 🔴 A12 방향성 게이트 픽스처 트리 ══════════════
 *
 * `check-direction` 은 2026-08-21 강화 이후 **저장소 현행 상태에서 FAIL** 이다
 * (규칙 65개 전부가 화면에 도달하지 않는다 — 그것이 A12 의 실제 상태다).
 * 그래서 실파일 주입 방식으로는 baseline≠0 → 전 케이스 SKIP 이 되어 **게이트가 영원히 미검증**된다.
 * `--root` 스코프 픽스처로 옮긴다: 깨끗한 미니 트리에서 exit 0, 고의 위반 트리에서 exit 1.
 *
 * 트리 배치는 저장소와 같다 — 판정 코드 경로가 완전히 같다. 뿌리만 갈아 끼운다.
 *   src/content/catalog.json · src/models/sources.generated.ts
 *   src/models/physics/st/rules.ts · src/models/labs/st.ts
 *   src/viz/index.ts · src/viz/gl/scenes/stScene.ts
 */
function directionRule(n, outputs = [`y${n}`], id = `ST-${n}`, sourceId = 'S1') {
  const exp = outputs.map((o) => `{ output: '${o}', trend: 'increasing' }`).join(', ');
  return `  { id: '${id}', processId: 'st', statement: 's${n}', inputName: 'x', `
    + `expect: [${exp}]${sourceId === null ? '' : `, sourceId: '${sourceId}'`}, scope: 'lab' },\n`;
}

/**
 * 깨끗한 A12 트리. `o` 로 부분 교체한다.
 *  o.rules       : rules.ts 본문(기본 = 도달 가능한 규칙 5개)
 *  o.mapKeys     : lab-basic 의 scene.map 이 만드는 `키: out['Y']` 쌍
 *  o.scenePicks  : 씬이 실제로 읽는 파라미터 키
 *  o.sceneIds    : SCENE_IDS 목록
 *  o.extraScenes : 추가로 구현만 해 두는 씬 파일(배선 없음 → 유령 씬)
 */
function directionTree(o = {}) {
  const rulesBody = o.rules ?? [1, 2, 3, 4, 5].map((n) => directionRule(n)).join('');
  const mapKeys = o.mapKeys ?? { a: 'y1', b: 'y2', c: 'y3', d: 'y4', e: 'y5' };
  const scenePicks = o.scenePicks ?? ['a', 'b', 'c', 'd', 'e'];
  const sceneIds = o.sceneIds ?? ['stScene'];
  const mapText = Object.entries(mapKeys).map(([k, y]) => `${k}: out['${y}']`).join(', ');
  const cell = (stage) => '  {\n'
    + '    processId: PROCESS_ID,\n'
    + `    stage: '${stage}',\n`
    + `    scene: { sceneId: 'stScene', map: (i, out) => ({ ${stage === 'lab-basic' ? mapText : "a: out['y1']"} }) },\n`
    + '  },\n';
  const files = {
    'src/content/catalog.json': JSON.stringify({ processes: { st: { status: 'active' } } }),
    'src/models/sources.generated.ts': "export const SOURCE_IDS = ['S1'] as const;\n",
    'src/models/labs/st.ts': "const PROCESS_ID = 'st';\nexport const ST_LABS = [\n"
      + cell('lab-basic') + cell('lab-applied') + cell('lab-advanced') + '];\n',
    'src/viz/index.ts': `export const SCENE_IDS = [${sceneIds.map((s) => `'${s}'`).join(', ')}];\n`,
    'src/viz/gl/scenes/stScene.ts': 'export function stSceneModel(params) {\n  return '
      + scenePicks.map((k) => `pick(params, '${k}', 0)`).join(' + ') + ';\n}\n',
  };
  if (rulesBody !== '') {
    files['src/models/physics/st/rules.ts'] = "import type { DirectionRule } from '../../direction';\n"
      + `export const ST_RULES: DirectionRule[] = [\n${rulesBody}];\n`;
  }
  for (const s of o.extraScenes ?? []) {
    files[`src/viz/gl/scenes/${s}.ts`] = "export function m(params) { return pick(params, 'a', 0); }\n";
  }
  return files;
}
const directionGate = (o) => withFixtureRoot(directionTree(o), 'check-direction.mjs');

/* ══════════════ 🔴 G-8 등급 상향 게이트 픽스처 트리 (check-grade-claim) ══════════════
 *
 * 깨끗한 트리 = 코드의 근거 선언과 원장 `kind` 가 **세 항목 모두 일치**한다.
 *   lit → sourceId 보유 · 원장 literature
 *   syn → basis 접두 '교육용 합성' · 원장 synthetic + notice
 *   op  → basis 접두 '업계 운영 범위(A15-op)' · 원장 operational + notice
 * 🔴 접두 문자열은 **실제 코드에서 AST 로 실측한 것과 같은 토큰**을 쓴다. 여기서 다른 토큰을
 *    쓰면 baseline 이 B1 으로 실패하고, 그 실패가 「게이트가 깨졌다」로 오독된다.
 *
 * @param o.ledger      원장 항목 부분 교체 { lit|syn|op: <엔트리> }
 * @param o.ledgerExtra 원장에만 있고 코드에 없는 항목(B8)
 * @param o.synBasis    syn 의 basis 문자열. `null` 이면 basis 를 아예 뺀다(B5)
 * @param o.synSourceId syn 에 sourceId 를 함께 단다(B6)
 */
function gradeClaimTree(o = {}) {
  const L = {
    'st.lab.lit': { declaredGrade: '문헌식', kind: 'literature' },
    'st.lab.syn': { declaredGrade: '경향모델', kind: 'synthetic', notice: '실제 장비 상수가 아닙니다(자체검증 픽스처).' },
    'st.lab.op': { declaredGrade: '경향모델', kind: 'operational', notice: '업계 운영 범위입니다(자체검증 픽스처).' },
  };
  if (o.ledger?.lit) L['st.lab.lit'] = o.ledger.lit;
  if (o.ledger?.syn) L['st.lab.syn'] = o.ledger.syn;
  if (o.ledger?.op) L['st.lab.op'] = o.ledger.op;
  Object.assign(L, o.ledgerExtra ?? {});

  const synBasis = o.synBasis === undefined ? '교육용 합성 — 계수 0.5 는 교육용 설정값입니다.' : o.synBasis;
  const synFields = [
    synBasis === null ? null : `basis: ${JSON.stringify(synBasis)}`,
    o.synSourceId ? `sourceId: '${o.synSourceId}'` : null,
  ].filter(Boolean).join(', ');

  return {
    'src/content/model-grades.json': JSON.stringify({ models: L }, null, 2),
    'src/models/labs/st.ts': "import { quantity } from '../contract';\n"
      + 'export function computeSt(x: number) {\n'
      + '  return {\n'
      + "    a: quantity(x, { modelId: 'st.lab.lit', unit: 'nm', sourceId: 'S1', validRange: [0, 1] }),\n"
      + `    b: quantity(x, { modelId: 'st.lab.syn', unit: 'nm', ${synFields}${synFields ? ', ' : ''}validRange: [0, 1] }),\n`
      + "    c: quantity(x, { modelId: 'st.lab.op', unit: 'nm', "
      + "basis: '업계 운영 범위(A15-op) — 프로브 오버드라이브 실무 범위', validRange: [0, 1] }),\n"
      + (o.dupSyn
        ? "    d: quantity(x, { modelId: 'st.lab.syn', unit: 'nm', "
          + "basis: '업계 운영 범위(A15-op) — 같은 modelId 를 다른 근거로 두 번 선언', validRange: [0, 1] }),\n"
        : '')
      + '  };\n'
      + '}\n',
  };
}
const gradeClaimGate = (o) => withFixtureRoot(gradeClaimTree(o), 'check-grade-claim.mjs');

/* ══════════════ 🔴 차트 계열 게이트 픽스처 트리 (check-chart-series) ══════════════
 *
 * 2026-08-22 까지 **자체검증 픽스처가 없는 마지막 게이트**였다. 오늘 세운
 * 「등록과 픽스처는 같은 작업으로 묶는다」 규율보다 먼저 만들어진 것이라 비어 있었다.
 *
 * 🔴 실트리(`src/viz/chart/**`)에 주입하지 않는다 — `--chart-root=` 로 **읽어 올 디렉터리만**
 *    갈아 끼운다. vite 뿌리는 APP 그대로라 `node_modules` 해석이 실제와 같다.
 *
 * 표식 세는 법은 게이트의 `PROBES` 와 맞춘다(거기가 정본이다):
 *   LineChart · ProfileChart → `<path` 개수     BarChart → `<title>` 개수
 * 🔴 픽스처가 표식을 다르게 그리면 baseline 이 깨지고, 그 실패가 「게이트가 고장났다」로 오독된다.
 *
 * @param o.lineCap  LineChart 가 그리는 계열 상한. null 이면 무제한(정상)
 * @param o.barCap   BarChart 상한. 🔴 `Math.min` **철자**로 적는다 — 2026-08-21 전수 grep 이
 *                   `slice(0,3)` 만 찾다가 놓친 바로 그 형태다. 상한은 여러 철자로 쓸 수 있다.
 * @param o.broken   컴포넌트가 렌더 중 던지게 한다 → **계측기 고장(종료코드 2)** 경로 검증
 */
function chartSeriesTree(o = {}) {
  const lineBody = (kind) => {
    const cap = o.lineCap == null ? 'series' : `series.slice(0, ${o.lineCap})`;
    return 'export function ' + kind + '({ series }: any) {\n'
      + (o.broken === kind ? "  throw new Error('자체검증 주입 — 컴포넌트가 던진다');\n" : '')
      + '  return (\n'
      + '    <svg>\n'
      + `      {${cap}.map((s: any) => (\n`
      + '        <path key={s.id} d="M0 0 L1 1" />\n'
      + '      ))}\n'
      + '    </svg>\n'
      + '  );\n'
      + '}\n';
  };
  /* 🔴 막대는 `<title>` 을 품고 범례는 안 품는다 — 게이트가 막대 쪽에서 센다.
   *    상한을 **막대 경로에만** 걸어야 2026-08-21 의 실제 사고 형태와 같아진다. */
  const barBody = () => {
    const cap = o.barCap == null ? 'values.length' : `Math.min(${o.barCap}, values.length)`;
    return 'export function BarChart({ groups, seriesLabels }: any) {\n'
      + '  const values = groups[0].values;\n'
      + `  const n = ${cap};\n`
      + '  return (\n'
      + '    <svg>\n'
      + '      {Array.from({ length: n }).map((_, i) => (\n'
      + '        <rect key={i}><title>{`C: ${values[i]}`}</title></rect>\n'
      + '      ))}\n'
      + '      {seriesLabels.map((l: string) => <text key={l}>{l}</text>)}\n'
      + '    </svg>\n'
      + '  );\n'
      + '}\n';
  };
  return {
    'LineChart.tsx': lineBody('LineChart'),
    'ProfileChart.tsx': lineBody('ProfileChart'),
    'BarChart.tsx': barBody(),
  };
}

/** 🔴 `--chart-root=` 는 **APP 기준 경로**여야 한다(vite 뿌리가 APP 이다). */
function chartSeriesGate(o) {
  const dir = join(FIXTURE_ROOT, `chart-${process.pid}-${fixtureSeq++}`);
  try {
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(chartSeriesTree(o))) writeFileSync(join(dir, name), body);
    const rel = `/${dir.slice(APP.length + 1)}`;
    return runGate('check-chart-series.mjs', [`--chart-root=${rel}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    try { if (readdirSync(FIXTURE_ROOT).length === 0) rmSync(FIXTURE_ROOT, { recursive: true, force: true }); } catch { /* 이미 없다 */ }
  }
}

const cases = [
  {
    gate: 'check-sources', name: '매직넘버',
    run: () => withTempFile('src/models/physics/__selftest/magic.ts',
      "export const bad = 3.14159;\n", () => runGate('check-sources.mjs')),
  },
  {
    gate: 'check-sources', name: '원장에 없는 S번호',
    run: () => withTempFile('src/models/physics/__selftest/badsrc.ts',
      "import { withSource } from '../../contract';\nexport const x = withSource(1, '', 'S99999' as never);\n",
      () => runGate('check-sources.mjs')),
  },
  {
    gate: 'check-physics', name: '물리층 합성 계수(A15)',
    run: () => withTempFile('src/models/physics/__selftest/synth.ts',
      "import { withSynthetic } from '../../contract';\nexport const y = withSynthetic(1, '', 'S120', '');\n",
      () => runGate('check-physics.mjs')),
  },
  {
    gate: 'check-physics', name: '비결정 소스(A14-1)',
    run: () => withTempFile('src/models/physics/__selftest/rand.ts',
      "export function f() { return Math.random(); }\n", () => runGate('check-physics.mjs')),
  },
  {
    gate: 'check-catalog', name: '공정 ID 하드코딩(C1)',
    run: () => withTempFile('src/models/__selftest/hardcode.ts',
      "export const L = ['wafer', 'oxidation', 'photo'];\n", () => runGate('check-catalog.mjs')),
  },
  {
    gate: 'check-layering', name: 'models → react 역참조',
    run: () => withTempFile('src/models/__selftest/leak.ts',
      "import { useState } from 'react';\nexport const u = useState;\n", () => runGate('check-layering.mjs')),
  },
  /* ---------- 🔴 A12 방향성 게이트 (스코프 픽스처 · 판정 규칙 하나에 주입 하나) ---------- */
  {
    gate: 'check-direction', name: 'M1 sourceId 없는 방향성 규칙',
    run: () => directionGate({
      rules: directionRule(1, ['y1'], 'ST-1', null) + [2, 3, 4, 5].map((n) => directionRule(n)).join(''),
    }),
  },
  {
    gate: 'check-direction', name: 'M1 원장에 없는 sourceId',
    run: () => directionGate({
      rules: directionRule(1, ['y1'], 'ST-1', 'S99999') + [2, 3, 4, 5].map((n) => directionRule(n)).join(''),
    }),
  },
  {
    /* B-1 봉쇄 — 종전에는 `src/models/physics/<pid>/` 가 없으면 **경고만** 내고 통과했다.
       디렉터리를 옮기는 것만으로 게이트를 끌 수 있었다(DSN SC §6-1 PROBE A 로 재현). */
    gate: 'check-direction', name: 'M2 공정 규칙 5개 미만 (물리층 미구현 면제가 살아 있는가)',
    run: () => directionGate({ rules: [1, 2, 3, 4].map((n) => directionRule(n)).join('') }),
  },
  {
    /* B-2 봉쇄 — 종전에는 규칙 0건이면 무조건 exit 0 이었다. 원장 전멸 시 게이트가 침묵했다. */
    gate: 'check-direction', name: 'M3 규칙 0건 (원장 전멸을 통과시키는가)',
    run: () => directionGate({ rules: '' }),
  },
  {
    /* B-9 봉쇄 — 같은 id 를 5개 넣어도 5개로 세던 문제. */
    gate: 'check-direction', name: 'M4 규칙 id 중복',
    run: () => directionGate({
      rules: [1, 2, 3, 4, 5].map((n) => directionRule(n, [`y${n}`], 'ST-DUP')).join(''),
    }),
  },
  {
    /* B-8 봉쇄 — expect[] 의 **내용**을 안 보던 문제. 같은 출력 반복도 개수만 부풀린다. */
    gate: 'check-direction', name: 'M5 한 규칙 안에서 같은 output 중복',
    run: () => directionGate({
      rules: directionRule(1, ['y1', 'y1']) + [2, 3, 4, 5].map((n) => directionRule(n)).join(''),
    }),
  },
  {
    /* 🔴 B-5 봉쇄 — **이 게이트의 존재 이유.** 규칙의 Y 가 화면으로 가는 통로를 끊는다.
       종전 게이트는 `src/viz/**` 를 스캔조차 하지 않아 이 주입을 절대 못 봤다. */
    /* 🔴 2026-08-22 — V2 는 비차단으로 강등됐다(A12 판정이 `check-a12c` 로 이관).
       그래도 이 주입은 여전히 탐지된다 — **V1 이 규칙 단위로 같은 사실을 차단**하기 때문이다.
       강등으로 잃은 차단 상태가 0 개라는 것을 이 케이스가 실행으로 보인다. */
    gate: 'check-direction', name: 'V1 규칙의 출력 Y 가 씬 map 에서 끊김 (화면 미도달) — V2 강등 후 V1 단독 탐지',
    run: () => directionGate({ mapKeys: { a: 'y1', b: 'y2', c: 'y3', d: 'y4' } }),
  },
  {
    /* B-7 봉쇄 — `stepCoverage` 실사례. 구현·테스트가 끝났는데 어느 칸에도 안 붙은 씬. */
    gate: 'check-direction', name: 'V3 유령 씬 (구현됐는데 랩 배선 0건)',
    run: () => directionGate({ sceneIds: ['stScene', 'ghostScene'], extraScenes: ['ghostScene'] }),
  },
  {
    /* 랩이 넘기는데 씬이 안 읽는 키 = 화면에 도달하지 않는 값. 2026-08-21 ❌-1 이 이 유형이었다. */
    gate: 'check-direction', name: 'V4 죽은 씬 파라미터 (씬이 읽지 않는 키를 넘김)',
    run: () => directionGate({ scenePicks: ['a', 'b', 'c', 'd'] }),
  },
  {
    gate: 'check-direction', name: 'V5 SCENE_IDS 에 있는데 씬 구현 파일이 없음',
    run: () => directionGate({ sceneIds: ['stScene', 'missingScene'] }),
  },
  {
    gate: 'check-i18n', name: 'ko/en 키 불일치',
    run: () => {
      const p = 'src/locales/en.json';
      const cur = JSON.parse(readFileSync(join(APP, p), 'utf8'));
      const k = Object.keys(cur)[0];
      delete cur[k];
      return withTempFile(p, JSON.stringify(cur, null, 2), () => runGate('check-i18n.mjs'));
    },
  },
  // ---------- 🔴 A13 제작 고지(notes[]) ----------
  {
    gate: 'check-assets', name: 'notes 가 렌더 경로에 연결되지 않음',
    run: () => {
      // 데이터에 고지 95건이 있는데 화면이 읽지 않는 상태를 재현한다(2026-08-20 실제 사고).
      const rel = 'src/ui/sections/EquipmentSection.tsx';
      const stripped = readFileSync(join(APP, rel), 'utf8')
        .replace(/EquipmentNote/g, 'Removed')
        .replace(/notes/gi, 'removed');
      return withTempFile(rel, stripped, () => runGate('check-assets.mjs'));
    },
  },
  {
    // 🔴 출하되는데 아무도 안 쓰는 자산(2026-08-20 텍스처 5종 0회 로드 사고).
    //    **새 자산 그룹**을 통째로 심는다 → 조립 규칙이 등록되지 않은 그룹은
    //    기본(엄격) 판정으로 떨어져야 한다. 「새 그룹은 조용히 통과」면 이 케이스가 미탐지가 된다.
    //    ⚠️ `check-assets` 가 **사전 FAIL** 이면 baseline 로직이 SKIP 으로 표기한다
    //       (거짓 탐지 성공을 세지 않으려고). 2026-08-21 A-USE 를 파일 단위로 조인 뒤
    //       photoresist·slurry-pad 미배선 때문에 다시 사전 FAIL 이 되었다 —
    //       그 2종이 배선되거나 격리되면 자동으로 정식 탐지로 승격된다.
    gate: 'check-assets', name: 'A-USE 참조 0건인 **새 자산 그룹**(기본 판정이 엄격한가)',
    run: () => withTempFile('public/assets/__selftest/ghost.webp', 'x',
      () => runGate('check-assets.mjs')),
  },
  {
    /* 🔴 2026-08-21 추가 — **파일 단위 규칙 자체**의 탐지력을 독립적으로 증명한다.
     *    위 케이스는 「그룹 전체가 미참조」다. 종전의 그룹 단위 게이트도 그건 잡았다.
     *    종전 게이트가 **못 잡은 것**은 이쪽이다: 이미 참조되는 그룹(tex — 3종 배선됨) 안에
     *    미참조 파일이 1개 섞여 있는 상태. 그룹 단위면 배선된 3종 뒤에 숨어 초록으로 통과한다.
     *    이 픽스처가 exit 1 을 못 내면 **A-USE 는 다시 그룹 단위로 퇴화한 것이다.** */
    gate: 'check-assets', name: 'A-USE 참조되는 그룹 안에 숨은 미참조 파일 1개(파일 단위)',
    run: () => withTempFile('public/assets/tex/__selftest-ghost.webp', 'x',
      () => runGate('check-assets.mjs')),
  },
  {
    /* 🔴 조립 규칙 앵커 소실 — 게이트가 「조립 규칙을 안다」는 것은 **규칙이 바뀌면 안다**는 뜻이다.
     *    `textures.ts` 주석이 경고하는 그대로, 경로 문자열을 쪼개면 게이트가 조립 규칙을 못 본다.
     *    그때 조용히 통과하거나 전 파일을 유령으로 몰지 않고 **앵커 소실을 지목**해야 한다. */
    gate: 'check-assets', name: 'A-USE 조립 규칙 앵커 소실(자산 경로 문자열을 쪼갬)',
    run: () => {
      const rel = 'src/viz/gl/textures.ts';
      const cur = readFileSync(join(APP, rel), 'utf8');
      const split = cur.replace("const TEX_DIR = 'assets/tex/';", "const TEX_DIR = 'assets/' + 'tex/';");
      if (split === cur) throw new Error(`${rel}: TEX_DIR 선언을 찾지 못해 픽스처를 만들 수 없다`);
      return withTempFile(rel, split, () => runGate('check-assets.mjs'));
    },
  },
  {
    gate: 'check-assets', name: '고지 좌표가 viewBox 밖',
    run: () => withNoteMutation('wafer', (note) => { note.anchor = [99999, -40]; }),
  },
  {
    gate: 'check-assets', name: '고지 en 문구 비어 있음',
    run: () => withNoteMutation('wafer', (note) => { note.en = '   '; }),
  },
  {
    gate: 'check-assets', name: "고지 tone 이 'info'|'warn' 이 아님",
    run: () => withNoteMutation('wafer', (note) => { note.tone = 'caution'; }),
  },
  {
    gate: 'check-questions', name: '문항 수 부족·id 형식 위반',
    run: () => withTempFile('src/content/ko/questions/oxidation.json',
      JSON.stringify({ processId: 'oxidation', items: [{ id: 'bad', type: 'single', difficulty: 'mid',
        objectiveId: '', stem: 's', choices: ['a', 'b'], answer: 0, explanation: '', sourceId: 'S120', weakTopic: '' }] }),
      () => runGate('check-questions.mjs')),
  },
  /* ---------- 🔴 배선 W6 — 칸 단위 배선률 (2026-08-21 신설) ----------
   *
   * 🔴 **왜 지금 생겼나 — W6 은 어제 신설된 뒤 오늘까지 픽스처가 하나도 없었다.**
   *   `check-wiring` 은 W1~W5 케이스로 「덮은 게이트」에 세어졌기 때문에 요약에는
   *   **미검증 0** 으로 나왔지만, **W6 의 판정 규칙은 한 번도 검증된 적이 없었다.**
   *   게이트 단위로만 세면 이런 구멍이 보이지 않는다 — 이 저장소가 반복해 온
   *   「값이 맞아서 아무도 안 보는 결함」의 또 다른 판본이다.
   *
   *   `check-wiring` 은 W6 신설 당시 실트리에서 FAIL 이었다(W6-6 이 10칸을 세웠다).
   *   그 상태에서는 실트리 주입이 전부 SKIP 된다. 그래서 **스코프 픽스처**로 검증한다.
   *   🔴 2026-08-22 W6-6 정정(양측 창만 판정) 이후 실트리 W6-6 은 **0칸**이라 `check-wiring` 은 통과하지만,
   *      스코프 픽스처 방식은 그대로 둔다 — 실트리 상태에 판정 검증이 매달리면 언제든 다시 눈이 먼다.
   *   픽스처 `labs.ts` 는 실 레지스트리(`src/models/labs/spec.ts` 의 `registerLabs`)에
   *   가짜 칸을 등록하므로 **판정 코드 경로는 실제와 같다.**
   */
  /* 🔴 게이트 이름을 `check-wiring-W6` 로 **따로 둔다.** 왜 그러는지가 중요하다:
   *   `check-wiring` 이 실트리에서 FAIL 이면(W6 신설 당시 W6-6 10칸이 그랬다) 그 게이트의 주입
   *   케이스는 전부 SKIP 된다 — **그 판단은 옳다.** 여기서 `check-wiring` 의 baseline 을
   *   스코프로 바꿔치기하면 SKIP 은 사라지지만, **실트리에서 도는 W1~W5 주입이
   *   「무엇을 넣어도 실패」 상태에서 「탐지」로 찍힌다 — 거짓 초록이다.**
   *   그래서 스코프로 검증되는 W6 만 별도 게이트로 세고, W1~W5 의 SKIP 은 **가리지 않고 남긴다.** */
  /* 🔴 2026-08-22 — W6-6 판정 축이 「판정 출력이 있는가」에서 **「양측 창(min≠max)인가」** 로 정정됐다.
   *   정정은 **완화가 될 수 있다.** 그래서 픽스처를 양성 하나로 두지 않고 **양성 1 · 음성 2** 로 짠다:
   *     ㉠ 양측 창 + 화면 없음  → **반드시 잡혀야 한다.** 이게 안 잡히면 이 개정은 그냥 완화다
   *     ㉡ 단측 문턱 + 화면 없음 → **잡히면 안 된다**(수치+배너로 충족)
   *     ㉢ 단일점 플래그 + 화면 없음 → **잡히면 안 된다**(같은 이유)
   *   음성 케이스는 `expectCode: 0` 으로 「종료코드 0 이어야 통과」를 명시한다 —
   *   기본 판정(`code !== 0` 이면 탐지)을 그대로 쓰면 음성 케이스가 뒤집혀 세어진다. */
  {
    gate: 'check-wiring-W6', name: '㉠ W6-6 **양측 창**(min≠max) 인데 차트 0 · 씬 미연결 → 잡아야 한다',
    run: () => withFixtureRoot({ 'labs.ts': w6Fixture({ aScene: false, aPass: 'twoSided' }) }, 'check-wiring.mjs'),
  },
  {
    gate: 'check-wiring-W6', name: '㉡ W6-6 **단측 문턱**만 + 차트 0 · 씬 미연결 → 잡으면 안 된다(수치+배너로 충족)',
    run: () => withFixtureRoot({ 'labs.ts': w6Fixture({ aScene: false, aPass: 'oneSided' }) }, 'check-wiring.mjs'),
    expectCode: 0,
  },
  {
    gate: 'check-wiring-W6', name: '㉢ W6-6 **단일점 플래그**(min=max)만 + 차트 0 · 씬 미연결 → 잡으면 안 된다',
    run: () => withFixtureRoot({ 'labs.ts': w6Fixture({ aScene: false, aPass: 'singlePoint' }) }, 'check-wiring.mjs'),
    expectCode: 0,
  },
  {
    gate: 'check-wiring-W6', name: 'W6-7 판정 차트가 입력에 반응하지 않음(현재 값을 못 보여줌)',
    run: () => withFixtureRoot({ 'labs.ts': w6Fixture({ bResponds: false }) }, 'check-wiring.mjs'),
  },
  // ---------- 🔴 배선(W1·W2·W3) ----------
  {
    gate: 'check-wiring', name: 'W1 register* 를 아무도 호출하지 않음',
    run: () => withTempFile('src/models/__selftest/w1Orphan.ts',
      '// 픽스처: 선언만 하고 배선하지 않은 등록자\n' +
      'export function registerSelftestOrphan(): void { /* noop */ }\n',
      () => runGate('check-wiring.mjs')),
  },
  {
    gate: 'check-wiring', name: 'W2 전역 설치자를 부르는데 아무도 import 안 함',
    run: () => withTempFile('src/models/__selftest/w2Installer.ts',
      '// 픽스처: 전역 설치자를 호출하지만 이 모듈을 아무도 import 하지 않는다\n' +
      'declare const __setSelftestProbe: (n: number) => void;\n' +
      '__setSelftestProbe(1);\n',
      () => runGate('check-wiring.mjs')),
  },
  {
    // 🔴 2026-08-20 실사고 재현: 배럴에만 있고 JSX 호출부가 0곳인 컴포넌트.
    //    W1·W2·W3 셋 다 이걸 못 잡아 `Overlay` 외 3종이 사용자에게 전송되면서 아무 화면에도 안 떴다.
    gate: 'check-wiring', name: 'W4 배럴에만 있고 JSX 호출부가 0곳인 컴포넌트',
    run: () => withTempFile('src/viz/__selftest/index.ts',
      "export { GhostWidget } from './GhostWidget';\n",
      () => runGate('check-wiring.mjs')),
  },
  {
    gate: 'check-wiring', name: 'W3 physics 배럴에도 없고 형제도 안 쓰는 죽은 모듈',
    run: () => withTempFile('src/models/physics/wafer/selftestDeadModule.ts',
      '// 픽스처: 배럴 미등록 + 형제 미사용 = 죽은 모듈\n' +
      'export const selftestDeadValue = 1;\n',
      () => runGate('check-wiring.mjs')),
  },
  // ---------- 🔴 A9 번들 상한 ----------
  {
    gate: 'check-bundle', name: '초기 JS 가 1 MiB 상한 초과',
    run: () => withBundleBloat(),
  },
  // ---------- 🔴 A10 가로 넘침 ----------
  {
    gate: 'check-overflow', name: '가로로 넘치는 요소(클리핑 없음)',
    run: () => withCssInjection(OVERFLOW_RULE),
  },
  {
    gate: 'check-overflow', name: '넘침 + html,body { overflow-x: hidden }',
    run: () => withCssInjection(`html,body{overflow-x:hidden}${OVERFLOW_RULE}`),
  },
  {
    // 🔴 종전 **알려진 사각지대**였다 — 게이트가 html·body 의 클리핑만 풀어서
    //    클리핑이 **내부 컨테이너**에 걸리면 넘침이 그 안에서 잘려 못 잡았다.
    //    2026-08-20 `check-overflow` 에 내부 컨테이너 검사를 넣어 **닫았다.**
    //    (닫기 전 실측으로 잘리는 자리를 먼저 조사했다 → `span.sr-only` 뿐이었고 그건 의도된 유틸이라 제외한다.)
    gate: 'check-overflow', name: '넘침 + 내부 컨테이너 overflow-x:hidden',
    run: () => withCssInjection(`#root{overflow-x:hidden}${OVERFLOW_RULE}`),
  },
  // ---------- 🔴 실습 명세 (check-labs) ----------
  // 🔴 check-labs 의 A6-b 검사는 2026-08-20 에 **떼어냈다**(정규식으로는 원리상 못 잡는다).
  //    남은 6검사(근거 선언·judge pass·objectiveId·sceneId·compute 키·feedback tone)에는
  //    픽스처가 하나도 없었다 — 「13/13 통과」의 분모에 안 들어가 있던 게이트다.
  {
    gate: 'check-labs', name: '파라미터에 근거(sourceId·basis) 가 없음',
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  objectiveId: 'LO-SELFTEST',\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5 }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge', pass: { min: 0, max: 1 } }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  {
    gate: 'check-labs', name: 'viz 가 모르는 sceneId',
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  objectiveId: 'LO-SELFTEST',\n" +
      "  scene: { sceneId: '__selftest_no_such_scene__' },\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5, basis: '자체검증' }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge', pass: { min: 0, max: 1 } }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  {
    gate: 'check-labs', name: 'judge 출력에 pass 구간이 없음',
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  objectiveId: 'LO-SELFTEST',\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5, basis: '자체검증' }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge' }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  {
    gate: 'check-labs', name: 'objectiveId 누락(PLN 학습목표 미연결)',
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5, basis: '자체검증' }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge', pass: { min: 0, max: 1 } }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  {
    // 🔴 차트가 「판정은 이 차트에서 합니다」를 띄우면서 실재하지 않는 출력을 가리키는 상태.
    //    화면에는 판정 문구가 뜨는데 정작 아무것도 안 가리킨다 — 학습자에게 거짓말이 된다.
    gate: 'check-labs', name: '차트 judgesOutputs 가 없는 출력을 가리킴',
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  objectiveId: 'LO-SELFTEST',\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5, basis: '자체검증' }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge', pass: { min: 0, max: 1 } }],\n" +
      "  charts: [{ id: 'c1', kind: 'line', judgesOutputs: ['selftestNoSuchOutput'] }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  {
    gate: 'check-labs', name: "feedback tone 이 stop|warn|hint 가 아님",
    run: () => withTempFile('src/models/labs/__selftest.ts',
      "export const SELFTEST = {\n" +
      "  processId: 'oxidation',\n" +
      "  stage: 'lab-basic',\n" +
      "  objectiveId: 'LO-SELFTEST',\n" +
      "  params: [{ id: 'selftestParam', min: 0, max: 1, step: 0.1, initial: 0.5, basis: '자체검증' }],\n" +
      "  outputs: [{ id: 'selftestOut', role: 'judge', pass: { min: 0, max: 1 } }],\n" +
      "  feedback: [{ id: 'f1', when: 'x', tone: 'panic' }],\n" +
      "};\n",
      () => runGate('check-labs.mjs')),
  },
  // ---------- 🔴 A6-b 등급 원장 (check-grades) ----------
  {
    gate: 'check-grades', name: 'G1 원장에 없는 modelId 를 코드가 씀',
    // 🔴 `modelId:` 형태가 아니라 **헬퍼 인자**로 넘긴다. 종전 수집기가 이 형태를 통째로 놓쳐
    //    packaging 의 flag() 6건이 샜다. 픽스처도 새는 쪽 형태로 만들어야 의미가 있다.
    run: () => withTempFile('src/models/__probe/unregistered.ts',
      "export const probe = ['oxidation.probe.unregisteredSelftest'];\n",
      () => runGate('check-grades.mjs')),
  },
  {
    gate: 'check-grades', name: 'G2 아무도 안 쓰는 죽은 원장 항목',
    run: () => withLedgerMutation((doc) => {
      doc.models['oxidation.probe.deadSelftestEntry'] = { declaredGrade: '문헌식', kind: 'literature' };
    }),
  },
  {
    gate: 'check-grades', name: 'G3 합성값인데 고지(notice) 가 없음',
    run: () => withLedgerMutation((doc) => {
      const id = firstIdWhere(doc, (_, e) => e.kind === 'synthetic', 'kind=synthetic');
      delete doc.models[id].notice;
    }),
  },
  {
    gate: 'check-grades', name: 'G4 합성값을 문헌식으로 등재',
    run: () => withLedgerMutation((doc) => {
      const id = firstIdWhere(doc, (_, e) => e.kind === 'synthetic', 'kind=synthetic');
      doc.models[id].declaredGrade = '문헌식';
    }),
  },
  {
    gate: 'check-grades', name: 'G5 L2 미통과인데 검증식 주장',
    run: () => withLedgerMutation((doc) => {
      const id = firstIdWhere(doc, (_, e) => e.kind === 'literature', 'kind=literature');
      doc.models[id].declaredGrade = '검증식';
    }),
  },
  {
    gate: 'check-grades', name: 'G6 물리층 modelId 를 합성으로 등재(A15)',
    run: () => withLedgerMutation((doc) => {
      const id = firstIdWhere(doc, (i, e) => !i.includes('.lab.') && e.kind === 'literature', 'physics 문헌식');
      // 🔴 병합이다(§merge). 통째 교체하면 문헌 항목이 갖고 있던 notice(M-1 라이선스 고지 등)까지
      //    함께 지워져 **G3 도 동시에 걸린다** — 어느 규칙이 잡았는지 흐려진다.
      mergeEntry(doc, id, { declaredGrade: '경향모델', kind: 'synthetic', notice: '자체검증 주입' });
    }),
  },
  // ---------- 🔴 A6-b 화면 렌더 (check-a6b) ----------
  {
    // 검증 비서가 실측으로 잡은 변이 그 자체다 — 「요소는 있는데 화면에 안 보이는」 상태.
    // 종전 정규식 검사는 소스에 문자열이 남아 있어 이 변이를 통과시켰다.
    gate: 'check-a6b', name: '합성 고지를 CSS 로 감춤(요소는 존재)',
    run: () => withCssInjection('.srcBadge__notice--synthetic{display:none}', 'check-a6b.mjs'),
  },
  {
    // 원장만 고치고 빌드를 안 한 상태를 재현한다 — 원장 → 런타임 → 화면 일관성(R2) 검사.
    gate: 'check-a6b', name: '원장 kind 와 화면 data-kind 불일치',
    run: () => withLedgerMutation((doc) => {
      const id = firstIdWhere(doc, (i, e) => i.includes('.lab.') && e.kind === 'synthetic', 'labs 합성');
      /* 🔴🔴 **이 한 줄이 2026-08-21 오염의 원본이다.** 종전에는 통째 교체였고,
       *    복구되지 않은 채 남으면서 `eds.lab.s6.adProduct` 의 `notice` 까지 함께 지워졌다.
       *    이제 ① 병합이라 `notice` 가 살아남고 ② tmpdir 원장에만 쓰므로 실파일에 남을 수 없다. */
      mergeEntry(doc, id, { declaredGrade: '문헌식', kind: 'literature' });
    }, 'check-a6b.mjs'),
  },
  {
    /* 🔴 2026-08-21 W5 — W4 의 사각지대. W4 는 「**배럴 재수출** 컴포넌트」만 보므로,
     *    산 컴포넌트와 **같은 파일**에서 export 되는 死코드를 구조적으로 못 잡는다.
     *    실사고: `SourceBadge.tsx` 의 `QuantityView` — 주석은 「실습 화면은 이 컴포넌트만
     *    쓴다」인데 JSX 호출부가 0곳이었다(같은 유형으로 이미 4종을 격리한 뒤의 5번째다).
     *    픽스처는 **배럴을 거치지 않는** 형태로 만든다 — W4 가 통과시키고 W5 만 잡아야 의미가 있다. */
    gate: 'check-wiring', name: 'W5 배럴을 안 거치고 export 됐는데 JSX 호출부가 0곳인 컴포넌트',
    run: () => withTempFile('src/ui/__selftest/GhostPanel.tsx',
      '// 픽스처: export 는 되는데 아무도 <GhostPanel> 로 쓰지 않는다.\n' +
      'export function GhostPanel(): React.ReactElement {\n' +
      '  return <div className="ghost" />;\n' +
      '}\n',
      () => runGate('check-wiring.mjs')),
  },
  // ---------- 🔴 qa-sweep 프레임 유효성 관문 (단위 픽스처) ----------
  {
    // 사고 그 자체의 재현: min·max 양쪽이 전부 백지. 종전 계측기는 이걸 거리 0 → 「무변화」로 읽었다.
    gate: UNIT_GATE, name: '백지 프레임 쌍(min·max 전부) → 판정불가(null) 로 떨어지는가',
    run: () => runFrameGate(blank(), blank()),
  },
  {
    // 🔴 더 어려운 쪽. 4장 중 3장은 멀쩡하고 1장만 백지다. 「대부분 정상이니 괜찮다」로
    //    넘어가면 오염된 히스토그램으로 판정하게 된다. 하나라도 섞이면 null 이어야 한다.
    gate: UNIT_GATE, name: '정상 3장 + 백지 1장 혼입 → 판정불가(null) 로 떨어지는가',
    run: () => runFrameGate(busy(1), [...busy(100).slice(0, 3), makeBlankFramePNG()]),
  },
  {
    // 캡처가 1장만 성공한 경우. 군내 분포를 못 만드는데 종전 규율대로 null 이어야 한다.
    gate: UNIT_GATE, name: '유효 프레임 1장뿐 → 판정불가(null) 로 떨어지는가',
    run: () => runFrameGate(busy(1), [makeBusyFramePNG(64, 48, 7)]),
  },

  // ---------- 🔴 상수 정본 (check-constants · --root 스코프 픽스처) ----------
  {
    // §3-X A-11 그 자체: 같은 단위 상수를 두 파일이 각자 선언한다. 값이 같아서 아무도 안 본다.
    gate: 'check-constants', name: 'R1 같은 이름 상수를 2개 파일이 각자 선언',
    run: () => withFixtureRoot({
      'a.ts': 'const NM_PER_UM_SELFTEST = 1000;\nexport const useA = NM_PER_UM_SELFTEST * 2;\n',
      'b.ts': 'const NM_PER_UM_SELFTEST = 1000;\nexport const useB = NM_PER_UM_SELFTEST * 3;\n',
    }, 'check-constants.mjs'),
  },
  {
    // §3-X A-3(볼츠만) 형태: 같은 이름인데 **값이 갈렸다.** 래퍼 호출 안의 첫 인자가 값인 관례를 탄다.
    gate: 'check-constants', name: 'R2 같은 이름인데 값이 갈림(래퍼 호출 형태)',
    run: () => withFixtureRoot({
      'a.ts': "export const SELFTEST_BOLTZ = withSource(8.617e-5, 'eV/K', 'S54');\n",
      'b.ts': "export const SELFTEST_BOLTZ = withSource(8.617333262e-5, 'eV/K', 'S101');\n",
    }, 'check-constants.mjs'),
  },
  {
    /* 🔴 §3-X 사각지대 ① 「조립식 상수」를 실제로 푸는지 본다.
       한쪽은 `TEN*(2+2+2)`, 다른 쪽은 `60`. **상수 폴딩이 없으면 앞쪽이 「값 미상」으로 빠져
       중복이 안 잡힌다** — 이 픽스처가 DETECT 되지 않으면 폴딩이 죽은 것이다. */
    gate: 'check-constants', name: 'R1 조립식(TEN*(2+2+2))과 리터럴 60 이 같은 이름으로 중복',
    run: () => withFixtureRoot({
      'a.ts': 'const TEN_SELFTEST = 2 * 2 * 2 + 2;\n'
        + 'const SECONDS_PER_MIN_SELFTEST = TEN_SELFTEST * (2 + 2 + 2);\n'
        + 'export const useA = SECONDS_PER_MIN_SELFTEST;\n',
      'b.ts': 'const SECONDS_PER_MIN_SELFTEST = 60;\nexport const useB = SECONDS_PER_MIN_SELFTEST;\n',
    }, 'check-constants.mjs'),
  },

  // ---------- 🔴 씬 상수 주입 (check-scene-constants · --root 스코프 픽스처) ----------
  {
    // GLSL 이 TS 상수와 **같은 이름**을 자기 손으로 선언한다 — 정본이 둘이 된다.
    gate: 'check-scene-constants', name: 'B1 GLSL 상수 이름이 TS 상수와 충돌',
    run: () => withFixtureRoot({
      'models/thing.model.ts': 'export const WAFER_TOP_UV = 0.34;\n',
      'scene.ts': "import { WAFER_TOP_UV } from './models/thing.model';\n"
        + 'function glslFloat(v: number): string { return Number.isInteger(v) ? v.toFixed(1) : String(v); }\n'
        + 'export const SCENE_FS = `#version 300 es\n'
        + 'precision highp float;\n'
        + 'out vec4 fragColor;\n'
        + 'const float WAFER_TOP_UV = 0.34;\n'
        + 'const float OTHER = ${glslFloat(WAFER_TOP_UV)};\n'
        + 'void main() { fragColor = vec4(WAFER_TOP_UV, OTHER, 0.0, 1.0); }\n'
        + '`;\n',
    }, 'check-scene-constants.mjs'),
  },
  {
    // 이름은 다른데 **값이 같다** — import 한 모델 모듈의 상수를 주입하지 않고 베꼈다.
    gate: 'check-scene-constants', name: 'B2 GLSL 상수 값이 import 한 모델 상수와 같음',
    run: () => withFixtureRoot({
      'models/thing.model.ts': 'export const SPUTTER_YIELD_REF = 3.7;\n',
      'scene.ts': "import { SPUTTER_YIELD_REF } from './models/thing.model';\n"
        + 'function glslFloat(v: number): string { return Number.isInteger(v) ? v.toFixed(1) : String(v); }\n'
        + 'export const SCENE_FS = `#version 300 es\n'
        + 'precision highp float;\n'
        + 'out vec4 fragColor;\n'
        + 'const float YIELD_REF = 3.7;\n'
        + 'const float OTHER = ${glslFloat(SPUTTER_YIELD_REF)};\n'
        + 'void main() { fragColor = vec4(YIELD_REF, OTHER, 0.0, 1.0); }\n'
        + '`;\n',
    }, 'check-scene-constants.mjs'),
  },
  {
    // 상수를 이름 붙여 선언해 놓고 주입은 0회 — 전부 손으로 적었다.
    gate: 'check-scene-constants', name: 'B3 GLSL 상수 선언은 있는데 ${} 주입이 0회',
    run: () => withFixtureRoot({
      'models/thing.model.ts': 'export const UNRELATED_UV = 0.11;\n',
      'scene.ts': 'export const SCENE_FS = `#version 300 es\n'
        + 'precision highp float;\n'
        + 'out vec4 fragColor;\n'
        + 'const float PANEL_X_SELFTEST = 0.428;\n'
        + 'void main() { fragColor = vec4(PANEL_X_SELFTEST, 0.0, 0.0, 1.0); }\n'
        + '`;\n',
    }, 'check-scene-constants.mjs'),
  },

  // ---------- 🔴 테스트 수식 복붙 (check-test-formulas · --root 스코프 픽스처) ----------
  {
    // 기대 변수 초기화식이 구현식 그대로다. 구현이 틀리면 기대값도 같이 틀린다.
    gate: 'check-test-formulas', name: 'E1 기대 변수(const hand)가 구현식을 그대로 베낌',
    run: () => withFixtureRoot({
      'impl.ts': 'export function murphyYield(ad: number): number {\n'
        + '  return Math.pow((1 - Math.exp(-ad)) / ad, 2);\n}\n',
      'copy.test.ts': "import { murphyYield } from './impl';\n"
        + "it('베낀 기대값', () => {\n  const ad = 1.5;\n"
        + '  const hand = Math.pow((1 - Math.exp(-ad)) / ad, 2);\n'
        + '  expect(murphyYield(ad)).toBeCloseTo(hand, 12);\n});\n',
    }, 'check-test-formulas.mjs'),
  },
  {
    /* 🔴 vitest 에서 기대값이 실제로 사는 자리는 **matcher 인자**다.
       `expect()` 인자만 보는 수집기는 이 형태를 통째로 놓친다. */
    gate: 'check-test-formulas', name: 'E1 matcher 인자(.toBeCloseTo)에 구현식을 그대로 적음',
    run: () => withFixtureRoot({
      'impl.ts': 'export function fickDepth(dCoef: number, timeS: number, eaEv: number, kT: number): number {\n'
        + '  return 2 * Math.sqrt(dCoef * timeS) * Math.exp(-eaEv / kT);\n}\n',
      'copy.test.ts': "import { fickDepth } from './impl';\n"
        + "it('베낀 기대값', () => {\n  const dCoef = 3; const timeS = 4; const eaEv = 0.8; const kT = 0.1;\n"
        + '  expect(fickDepth(dCoef, timeS, eaEv, kT))\n'
        + '    .toBeCloseTo(2 * Math.sqrt(dCoef * timeS) * Math.exp(-eaEv / kT), 9);\n});\n',
    }, 'check-test-formulas.mjs'),
  },

  // ---------- 🔴 살아 있는 판정 (check-live-judgment · --fixture 명세 교체 픽스처) ----------
  /* 🔴 왜 이 게이트에 픽스처를 다는가: **W6 게이트가 신설 이래 픽스처 0개**였다.
   *    즉 「게이트가 실제로 잡는가」를 아무도 증명하지 못했다. 그 일을 반복하지 않는다.
   *
   * 🔴 **종료코드까지 맞는지 본다.** 집안 기본 판정은 `code !== 0` = 탐지인데, 이 게이트는
   *    1(죽은 판정)과 4(판정 불가)를 **의도적으로 가른다.** 4 가 나와야 할 자리에 1 이 나오면
   *    「없는 결함을 있다고 말한 것」이라 탐지가 아니다. 그래서 기대 코드와 대조한 뒤,
   *    일치하면 1(탐지), 어긋나면 0(미탐지)으로 돌려준다 — 어긋난 실측치는 화면에 찍는다. */
  ...[
    { name: 'LJ-3 반증성 — 합격창이 정의역을 다 덮어 **전부 합격**(무의미한 판정)', fx: 'allPass', want: 1 },
    { name: 'LJ-1 존재성 — 판정 출력이 하나도 없다(display 전용)', fx: 'noJudge', want: 1 },
    { name: 'LJ-2 존재성 — 합격창이 **선언된 정의역과 서로소**(구조적 도달 불가)', fx: 'allFailStructural', want: 1 },
    { name: 'LJ-3 반증성 — **입력 부재(R-0)**: compute 가 입력을 안 읽어 출력이 상수', fx: 'constantOutput', want: 1 },
    { name: 'LJ-4 동시성 — 표본이 합격을 못 찾음 → **UNDETERMINED(4)**. FAIL 로 세면 안 된다', fx: 'allFailSample', want: 4 },
    { name: 'LJ-4 동시성 — L1 은 전부 살아 있는데 **L2 가 죽어 있다**(상충)', fx: 'mutualExclusive', want: 4 },
    /* 🔴 2026-08-22 팀장 지시 (가) — LJ-2 를 `evaluate()` 와 **같은 경로**(Quantity.validRange)로 옮긴 건.
     *    ⓖ 와 ⓘ 는 **완전히 같은 결함**인데 정의역을 말해 주는 곳이 있느냐로 갈린다:
     *      ⓖ 물리층이 validRange 를 준다  → **FAIL(1)** ← 새로 얻은 탐지력
     *      ⓘ 아무도 정의역을 말하지 않는다 → UNDETERMINED(4) ← 종전 게이트가 서 있던 자리
     *    이 둘을 나란히 두는 것이 「무엇이 좋아졌는지」의 증거다. */
    { name: 'LJ-2 런타임 — 명세 domain 없이 **물리층 validRange** 로 구조적 도달불가를 잡는다', fx: 'runtimeDomainClosed', want: 1 },
    { name: 'LJ-2 한계 — 정의역을 아무도 말하지 않으면 FAIL 이 아니라 UNDETERMINED(4)', fx: 'runtimeDomainAbsent', want: 4 },
    /* 🔴 **과잉적발 방지 대조군.** 정의역이 입력에 따라 변하면 구조적 단정을 하면 안 된다.
     *    여기서 FAIL 이 나오면 새 규칙이 거짓말을 하고 있다는 뜻이다. 기대는 **통과(0)** 다. */
    { name: 'LJ-2 대조군 — 정의역이 변동하면 단정하지 않는다(과잉적발 방지, 기대 통과)', fx: 'runtimeDomainVarying', want: 0 },
    /* 🔴 2026-08-22 — **픽스처가 제품과 같은 자를 들고 있는가**를 지키는 회귀 방지 픽스처.
     *    이 픽스처 파일은 제품 경계 판정식의 **사본**을 들고 있었고, 제품이 ULP 상대 여유로
     *    옮겨간 뒤에도 따라가지 않아 **두 자가 갈라져 있었다.** 사본을 없애고(제품 함수 import)
     *    갈림을 감지하는 표본을 하나 심었다.
     *    실측: 사본을 되돌리면 이 픽스처만 exit 0 → 4 로 갈린다(나머지 11건은 안 움직인다).
     *    🔴 여기서 4 가 나오면 「픽스처가 제품과 다른 규칙으로 판정하고 있다」는 뜻이다. */
    { name: '🔴 경계 1 ULP — 픽스처가 제품 판정식(isOutOfRange)을 그대로 쓰는가', fx: 'ulpBoundary', want: 0 },
  ].map(({ name, fx, want }) => ({
    gate: 'check-live-judgment',
    name: `${name} [기대 exit ${want}]`,
    run: () => {
      const code = runGate('check-live-judgment.mjs', [`--fixture=${fx}`]);
      if (code === want) return 1;                    // 기대대로 잡았다 → 탐지
      console.log(`     ↳ 🔴 --fixture=${fx}: 기대 exit ${want} · 실측 exit ${code}`);
      return 0;                                       // 코드가 어긋나면 탐지로 세지 않는다
    },
  })),

  // ---------- 🔴 폴백 순수성 (check-fallback-purity · src 실파일 주입 → finally 원복) ----------
  {
    /* R1 — 모델 모듈 import 경로가 끊기면 폴백은 그 씬의 파생값을 **자기가 계산하고 있다**는 뜻이다.
       실사고 형태: 사본 복귀(2026-08-21 이전 폴백이 시스 두께 식을 따로 들고 전력 부호가 반대였다). */
    gate: 'check-fallback-purity', name: 'R1 폴백이 모델 모듈을 한 번도 부르지 않음(import 경로 절단)',
    run: () => withSourcePatch('src/viz/gl/fallback2d.ts',
      "from './scenes/models/plasma.model'", "from './scenes/models/__selftestGone.model'",
      'check-fallback-purity.mjs'),
  },
  {
    // R2 — 감쇠·포화·정규화(지수·로그)를 폴백이 직접 부른다. 그리기에는 필요 없는 물리다.
    gate: 'check-fallback-purity', name: 'R2 폴백 draw 함수가 Math.exp() 를 직접 호출',
    run: () => withSourcePatch('src/viz/gl/fallback2d.ts',
      '  const glow = plasmaGlowGain(power);',
      '  const glow = plasmaGlowGain(power) * Math.exp(-0.0);',
      'check-fallback-purity.mjs'),
  },
  {
    // R3 — 정규화 파라미터를 거듭제곱의 인자로 넣는다(지수 관계 = 물리).
    gate: 'check-fallback-purity', name: 'R3 정규화 파라미터를 Math.pow() 인자로 직접 넣음',
    run: () => withSourcePatch('src/viz/gl/fallback2d.ts',
      "  const bias = pick(p, 'bias', 0.35);",
      "  const bias = pick(p, 'bias', 0.35);\n  const shapedSelftest = Math.pow(power, 0.75);",
      'check-fallback-purity.mjs'),
  },
  {
    // R5 — 표에 없는 새 draw 함수. 등재를 빼먹으면 그 씬은 검사에서 **조용히 빠진다.**
    gate: 'check-fallback-purity', name: 'R5 SCENE_DRAWERS 표에 없는 draw 함수 추가',
    run: () => {
      const rel = 'src/viz/gl/fallback2d.ts';
      const raw = readFileSync(join(APP, rel), 'utf8');
      return withTempFile(rel,
        raw + '\nfunction drawSelftestGhostScene(g: CanvasRenderingContext2D): void {\n  g.save();\n  g.restore();\n}\n',
        () => runGate('check-fallback-purity.mjs'));
    },
  },

  // ---------- 🔴 편측 합격창 (check-passwindow · src 실파일 주입 → finally 원복) ----------
  {
    /* W1 — 판정 출력의 합격창을 **편측**으로 만든다. 열린 쪽(위)의 정의역은
       `NON_NEGATIVE = [0, MAX_VALUE]` 라 **말하지 않은 것**이다 → 무한히 열린 합격.
       (실측으로 고른 대상: `packaging/lab-basic` 의 riseC 만 이 조건에 해당한다.) */
    gate: 'check-passwindow', name: 'W1 편측 합격창인데 열린 쪽 정의역이 미선언',
    run: () => withSourcePatch('src/models/labs/packaging.ts',
      "role: 'judge', pass: { min: MIN_RECOMMENDED_RISE_C.value, max: TYPICAL_RISE_MAX_C.value }, digits: 1,",
      "role: 'judge', pass: { min: MIN_RECOMMENDED_RISE_C.value }, digits: 1,",
      'check-passwindow.mjs'),
  },
  {
    /* W2 — 판정에서 **정의역 관문을 도로 뺀다.** 2026-08-21 이전 상태 그대로다:
       물리층이 outOfRange 로 표시한 값에 evaluate() 가 합격을 준다(σ_D = −0.1 mm 사고).
       🔴 복구는 withTempFile 의 finally 가 바이트 단위로 보장한다 — 이 파일이 깨진 채 남으면
          24칸 판정이 전부 무너진다. */
    gate: 'check-passwindow', name: 'W2 evaluate() 에서 정의역 관문(!outOfDomain)을 제거',
    run: () => withSourcePatch('src/models/labs/spec.ts',
      '      && !outOfDomain                              // 🔴 성립할 수 없는 값은 합격을 받을 수 없다\n',
      '',
      'check-passwindow.mjs'),
  },
  /* ---------- 🔴 G-8 등급 상향 (check-grade-claim · 스코프 픽스처 · 판정 규칙 하나에 주입 하나) ----------
   *
   * 🔴 왜 실파일이 아니라 스코프 픽스처인가 — **두 가지 이유가 겹친다.**
   *   ① `check-grade-claim` 은 저장소 현행 상태에서 **사전 FAIL** 이다(실물 상향 1건:
   *      `eds.lab.s6.adProduct`). baseline≠0 이면 이 스크립트가 전 케이스를 SKIP 하므로
   *      **게이트가 영원히 미검증**된다(`check-direction`·`check-constants` 와 같은 문제·같은 해법).
   *   ② 🔴 실파일 주입 대상이 하필 `src/content/model-grades.json` 이다. 2026-08-21 에
   *      **바로 그 파일이** 픽스처 교차 오염으로 `synthetic → literature` 로 승격된 채 남았다
   *      (위 배타 락 주석 참조). 게다가 지금 PLN 이 그 원장을 검증 중이라 한 순간이라도
   *      바뀌면 **남의 측정이 오염된다.** 그래서 `--root=` 로 뿌리를 갈아 끼운다 —
   *      이 6건은 `src/` 를 **한 바이트도** 건드리지 않는다.
   */
  {
    gate: 'check-grade-claim', name: '🔴 B2 등급 상향 — 코드는 합성인데 원장이 문헌식',
    run: () => gradeClaimGate({ ledger: { syn: { declaredGrade: '문헌식', kind: 'literature' } } }),
  },
  {
    gate: 'check-grade-claim', name: 'B3 등급 하향 — 코드는 문헌인데 원장이 합성',
    run: () => gradeClaimGate({ ledger: { lit: { declaredGrade: '경향모델', kind: 'synthetic', notice: '자체검증 주입' } } }),
  },
  {
    gate: 'check-grade-claim', name: 'B1 등록되지 않은 basis 접두로 우회',
    // 🔴 이 케이스가 핵심이다. 접두 표를 「모르면 통과」로 두면 새 접두를 지어내 우회할 수 있고,
    //    그러면 게이트를 만들면서 새 우회로를 열어 준 셈이 된다.
    run: () => gradeClaimGate({ synBasis: '문헌 근거 있음 — 자체검증용 미등록 접두' }),
  },
  {
    gate: 'check-grade-claim', name: 'B5 basis 도 sourceId 도 없음(근거 주장 자체가 없음)',
    run: () => gradeClaimGate({ synBasis: null }),
  },
  {
    gate: 'check-grade-claim', name: 'B6 basis 와 sourceId 를 둘 다 선언(계약상 배타)',
    run: () => gradeClaimGate({ synSourceId: 'S1' }),
  },
  {
    gate: 'check-grade-claim', name: 'B8 원장에 있는데 정의 지점이 없음(계측 사각지대)',
    run: () => gradeClaimGate({ ledgerExtra: { 'st.lab.ghost': { declaredGrade: '문헌식', kind: 'literature' } } }),
  },
  {
    gate: 'check-grade-claim', name: 'B4 종별 교차 — 코드는 합성인데 원장이 운영규약',
    run: () => gradeClaimGate({ ledger: { syn: { declaredGrade: '경향모델', kind: 'operational', notice: '자체검증 주입' } } }),
  },
  {
    gate: 'check-grade-claim', name: 'B7 같은 modelId 를 서로 다른 근거로 선언',
    run: () => gradeClaimGate({ dupSyn: true }),
  },
  /* ---------- 🔴 차트 계열 유실 (check-chart-series · 스코프 픽스처) ---------- */
  {
    gate: 'check-chart-series', name: 'C1 LineChart 가 계열을 3개로 자름(slice 철자)',
    run: () => chartSeriesGate({ lineCap: 3 }),
  },
  {
    /* 🔴 **이 케이스가 핵심이다.** 2026-08-21 전수 grep 은 `slice(0, 3)` 만 찾다가
     *    `Math.min(3, …)` 로 적힌 절단 1곳을 놓쳤다. 상한은 여러 철자로 쓸 수 있고,
     *    이 게이트가 철자가 아니라 **결과**를 보는 이유가 그것이다. 그 성질을 픽스처로 못박는다. */
    gate: 'check-chart-series', name: 'C1 BarChart 가 계열을 3개로 자름(Math.min 철자 — grep 이 놓친 형태)',
    run: () => chartSeriesGate({ barCap: 3 }),
  },
  {
    /* 🔴 계측기 고장(2)과 판정 실패(1)를 가르는 경로. 컴포넌트가 던지면 **2** 여야 한다.
     *    2 를 1 로 내면 「위반을 찾았다」로 위장되고, 그것이 이 집안이 가장 싫어하는 오류다. */
    gate: 'check-chart-series', name: '계측기 고장 — 컴포넌트가 던지면 종료코드 2(판정 실패 아님)',
    run: () => chartSeriesGate({ broken: 'LineChart' }),
    expectCode: 2,
  },
  /* ---------- 🔴 명세 인용이 죽었는가 (check-citations · 스코프 픽스처) ----------
   * 🔴 **여기 있는 것은 「탐지 방향」뿐이다.** 이 틀은 「주입하면 죽는가」만 세므로
   *    **통과해야 하는 픽스처**(살아 있는 `>` 블록·오검출 0건·모호 경고·보존 항등식 등)는
   *    `scripts/check-citations.selftest.mjs` 에 있다(양방향 20종). 둘을 함께 봐야 완전하다.
   * 🔴 픽스처 본체는 `scripts/fixtures/citations/**` 이고 대조 정본은 **진짜 03_실습3단계명세.md** 다.
   *    가짜 명세로 대신하면 「폐기 배너가 폐기 문구를 다시 적는다」는 실물 함정이 재현되지 않는다. */
  {
    /* 🔴🔴 **이 게이트가 존재하는 이유 그 자체.** 「처음 20 nm 구간에서는 직선」은 명세에 **실재**하지만
     *    실재하는 곳이 **삭제 선언 배너(03:727) 안뿐**이다. 「명세 전문에서 완전 일치 검색」만 하는
     *    구현은 이것을 **통과**시킨다(거짓 통과). 폐기 영역을 먼저 뺀 구현만 실패로 잡는다. */
    gate: 'check-citations', name: 'AC-R4 폐기 배너 안에만 있는 문구를 인용(거짓 통과 함정)',
    run: () => citationsGate('dead'), expectCode: 1,
  },
  {
    /* 🔴 배제를 **블록 → 행**으로 좁힌 뒤에도 R-4 본래 기능이 살아 있는가.
     *    03:2664 는 살아 있는 블록(2633–2674) 안의 **폐기 표 행 한 칸**이다. */
    gate: 'check-citations', name: '살아 있는 블록 안의 폐기 표 행(03:2664)은 여전히 배제된다(S1)',
    run: () => citationsGate('deprow'), expectCode: 1,
  },
  {
    /* 🔴 표제(`### 아직 보류인 것`)는 **자기 아래를 지배**한다. 표제만 빼고 본문을 남기면 거짓 통과다. */
    gate: 'check-citations', name: '표제가 지배하는 절 전체가 배제된다(S2 · 03:3050–3052)',
    run: () => citationsGate('depsection'), expectCode: 1,
  },
  {
    /* 🔴 `…` 는 저자가 잘라낸 자리다. 이어 붙여 대조하면 살아 있는 인용까지 거짓 실패한다.
     *    조각마다 대조해야 **앞은 살아 있고 뒤가 죽은** 인용을 정확히 잡는다. */
    gate: 'check-citations', name: '생략부호로 나뉜 인용 — 뒤 조각이 죽으면 잡는다',
    run: () => citationsGate('ellipsis'), expectCode: 1,
  },
  {
    /* 🔴 인용문 안에 또 `「」` 가 있다(실물: oxidation.ts). 첫 `」` 에서 끊으면 인용문이 잘려 오판한다. */
    gate: 'check-citations', name: '중첩 인용을 깊이 짝짓기로 통째 추출한다',
    run: () => citationsGate('nested'), expectCode: 1,
  },
  {
    /* 🔴 계측기 고장(2)과 판정 실패(1)를 가르는 경로. **명세를 못 읽은 것**은 「인용이 죽었다」가 아니다.
     *    2 를 1 로 내면 「위반을 찾았다」로 위장된다 — `expectCode` 가 그 위장을 막는다. */
    gate: 'check-citations', name: '계측기 고장 — 명세 파일이 없으면 종료코드 2(판정 실패 아님)',
    run: () => runGate('check-citations.mjs', ['--spec', '/nonexistent/__no_such_spec__.md']),
    expectCode: 2,
  },
];

/* 🔴 스코프 baseline — **깨끗한 트리**에서 0 이 나오는지 먼저 잰다.
 *    깨끗한 트리는 「위반이 없는 정상 형태」여야 한다. 그래야 주입 케이스의 exit 1 이 의미를 갖는다. */
/* 🔴 check-citations 스코프 픽스처 — `--src` 로 소스 트리만 갈아 끼운다.
 *    명세(`--spec`)는 **진짜 03_실습3단계명세.md 그대로** 둔다. 그것이 이 게이트 증명의 전제다. */
function citationsGate(dir) {
  return runGate('check-citations.mjs', ['--src', join(APP, 'scripts', 'fixtures', 'citations', dir)]);
}

SCOPED_BASELINE = {
  /* 🔴 실트리(`src/`)를 baseline 으로 쓰지 않는다 — 죽은 인용이 하나라도 생기면 exit 1 이 되어
     아래 주입 6건이 **전부 SKIP** 으로 조용히 사라진다. 깨끗한 픽스처(`live`)를 baseline 으로 둔다.
     `live` 는 「`>` 블록 안의 살아 있는 정본을 인용」하는 트리이므로 **정상 형태**다. */
  'check-citations': () => citationsGate('live'),
  /* 정상 형태 = 규칙 5개의 출력이 **전부 씬 map 을 거쳐 씬이 읽는 파라미터로** 들어간다.
     🔴 이 baseline 이 0 이 아니면 「무엇을 넣어도 실패하는 게이트」라는 뜻이고,
        그러면 아래 주입 케이스 10건은 전부 거짓 탐지가 된다. */
  'check-direction': () => directionGate(),
  /* 정상 형태 = 판정 출력이 있는 칸마다 **씬이든 차트든 판정을 볼 화면이 하나는 있고**,
     판정 차트는 **입력에 반응한다.** 이 baseline 이 0 이 아니면 W6-6·W6-7 주입은 거짓 탐지가 된다. */
  'check-wiring-W6': () => withFixtureRoot({ 'labs.ts': w6Fixture({}) }, 'check-wiring.mjs'),
  'check-constants': () => withFixtureRoot({
    'a.ts': 'export const SELFTEST_CLEAN_ONLY_HERE = 987654;\n',
    'b.ts': "import { SELFTEST_CLEAN_ONLY_HERE } from './a';\nexport const useB = SELFTEST_CLEAN_ONLY_HERE * 2;\n",
  }, 'check-constants.mjs'),
  /* 정상 형태 = 상수를 `${glslFloat(X)}` 로 **주입**한다. 주입된 선언은 chunk 가 `${` 에서 끊기므로
     「손으로 적은 상수 선언」으로 잡히지 않는다 — 그것이 이 게이트의 통과 조건이다. */
  'check-scene-constants': () => withFixtureRoot({
    'models/thing.model.ts': 'export const WAFER_TOP_UV = 0.34;\n',
    'scene.ts': "import { WAFER_TOP_UV } from './models/thing.model';\n"
      + 'function glslFloat(v: number): string { return Number.isInteger(v) ? v.toFixed(1) : String(v); }\n'
      + 'export const SCENE_FS = `#version 300 es\n'
      + 'precision highp float;\n'
      + 'out vec4 fragColor;\n'
      + 'const float WAFER_TOP = ${glslFloat(WAFER_TOP_UV)};\n'
      + 'void main() { fragColor = vec4(WAFER_TOP, 0.0, 0.0, 1.0); }\n'
      + '`;\n',
  }, 'check-scene-constants.mjs'),
  /* 정상 형태 = 골든 테스트. **문헌 표 값을 손으로 적었을 뿐** 구현식은 어디에도 없다.
     🔴 이 baseline 이 0 이 아니면 「골든을 오탐으로 잡는다」는 뜻이다 — 그 자체가 결함 신호다. */
  'check-test-formulas': () => withFixtureRoot({
    'impl.ts': 'export function murphyYield(ad: number): number {\n'
      + '  return Math.pow((1 - Math.exp(-ad)) / ad, 2);\n}\n',
    'golden.test.ts': "import { murphyYield } from './impl';\n"
      + 'const TABLE: Array<[number, number]> = [[0.5, 0.7869], [1.0, 0.6321], [1.5, 0.5320]];\n'
      + "it('문헌 표와 일치한다', () => {\n"
      + '  for (const [ad, y] of TABLE) expect(murphyYield(ad)).toBeCloseTo(y, 3);\n});\n',
  }, 'check-test-formulas.mjs'),
  /* 🔴 「살아 있는 판정」 baseline = **정상 픽스처 ⓐ**(합격 조합도 불합격 조합도 있는 판정).
     실트리 24칸은 `UNDETERMINED` 2건 때문에 종료코드 4 라 baseline 으로 쓸 수 없다 —
     그대로 두면 주입 케이스가 전부 SKIP 되어 **이 게이트가 영원히 검증되지 않는다**
     (`check-constants` · `check-test-formulas` 가 --root 로 푼 것과 같은 문제·같은 해법).
     🔴 픽스처는 **명세(데이터)만** 갈아 끼운다 — 판정 함수 `evaluate()` 와 판정 규칙은
     실제 코드 그대로다. 그래서 `src/**` 를 건드리지 않는다(동시 편집 중이라 특히 중요하다). */
  'check-live-judgment': () => runGate('check-live-judgment.mjs', ['--fixture=alive']),
  /* 🔴 정상 형태 = 코드의 근거 선언(basis 접두 / sourceId)과 원장 `kind` 가 **세 항목 모두 일치**한다.
     이 baseline 이 0 이 아니면 아래 8건은 전부 거짓 탐지다.
     🔴 실트리는 사전 FAIL 이다(실물 상향 1건 `eds.lab.s6.adProduct`) — 그래서 뿌리를 갈아 끼운다.
        그리고 `src/content/model-grades.json` 은 지금 PLN 이 검증 중이므로 **건드리지 않는다.** */
  'check-grade-claim': () => gradeClaimGate(),
  /* 정상 형태 = 상한이 없다. 계열 N 개를 넣으면 표식 N 개가 그려진다.
     🔴 이 baseline 이 0 이 아니면 아래 3건은 전부 거짓 탐지다. */
  'check-chart-series': () => chartSeriesGate(),
};

// ---------- 0. baseline: 주입 전 각 게이트의 원래 상태 ----------
/* 🔴 `SELFTEST_ONLY=<게이트명>` 으로 한 게이트만 돌릴 수 있다(개발 중 확인용).
 *    필터를 켜면 **분모가 줄어든다.** 그걸 숨기면 이 스크립트의 존재 이유가 없어지므로
 *    배너로 크게 찍고, 종료 요약에도 「전체 검증이 아니다」를 남긴다. 기본값은 전체 실행이다. */
const ONLY = process.env.SELFTEST_ONLY ?? null;
if (ONLY) {
  console.log(`🔴🔴 필터 실행: SELFTEST_ONLY=${ONLY} — **전체 검증이 아니다.** 마감 판정에 쓰지 마라.\n`);
}
const allCases = cases;
const activeCases = ONLY ? cases.filter((c) => c.gate === ONLY) : cases;
if (ONLY && activeCases.length === 0) {
  console.error(`🔴 SELFTEST_ONLY=${ONLY} 에 해당하는 픽스처가 없다. 게이트명을 확인하라.`);
  process.exit(2);
}
const fixtureGates = [...new Set(activeCases.map((c) => c.gate))];
/* 🔴 `qa-sweep` 은 `check-*.mjs` 가 아니라 **계측기**다. 그래서 파일명 스캔에 안 잡힌다.
 *    하지만 픽스처가 있으면 분모에 들어가야 한다 — 안 넣으면 「덮은 게이트 N/M」이
 *    실제보다 좋아 보이고(분자만 늘고), 안 넣은 채 픽스처만 늘리면 M < N 이 되어 표가 깨진다. */
/* 🔴 **하위 판정군(sub-gate)** — 한 게이트 파일 안의 특정 규칙군을 따로 세는 이름.
 *    `check-wiring-W6` 은 `check-wiring.mjs` 안의 W6 계열을 **스코프 픽스처로** 검증한다.
 *    실트리에서 `check-wiring` 이 이미 FAIL 이라 W1~W5 주입이 전부 SKIP 되는데,
 *    그 SKIP 을 가리지 않으면서 W6 은 검증하려면 이름을 갈라야 했다(위 케이스 주석 참조).
 *    🔴 **파일명 스캔에 안 잡히므로 여기 적지 않으면 분모에서 빠져 「21/20」처럼 표가 깨진다**
 *    — 바로 위 주석이 예고한 그 증상이다. 하위 판정군을 늘리면 **여기에도 반드시 추가하라.** */
const SUB_GATES = ['check-wiring-W6'];

/* ══════════ 🔴 이 요약이 **자기 자신에 대해 거짓말을 했다** (2026-08-22 수정) ══════════
 *
 * 발견: `check-citations` 담당이 「요약이 내 게이트를 **미검증(픽스처 없음)** 으로 찍는데
 *       픽스처가 13종 있다」고 신고했다. `check-guard-naming`(11종)·
 *       `check-gate-registration`(13종)도 같았다 — **최근에 만든 3개 게이트 공통.**
 *
 * 🔴 오늘 하루 쫓은 것은 「검증됐다는 보고가 거짓」이었는데 이건 **정반대 방향**이다.
 *    믿으면 ① 이미 있는 픽스처를 또 만들거나 ② 실제보다 **나쁜 상태로 인계**한다.
 *
 * ── 원인은 둘이었다. 가설(명명 규칙)은 맞았지만 그것 하나가 아니었다 ──────────────
 *
 *  ① **분모 오염** — `/^check-.+\.mjs$/` 가 `check-citations.selftest.mjs` **도** 물었다
 *     (`.+` 가 `citations.selftest` 를 먹는다). 그래서 픽스처 파일 3개가 **게이트로** 세어져
 *     분모가 27 → 30 으로 불었고, 그 셋은 당연히 픽스처가 없으니 **「미검증」에 또 찍혔다.**
 *     🔴 즉 하나의 오류가 분모와 분자를 **동시에** 틀리게 만들었다.
 *     `check-gate-registration.mjs` 는 같은 것을 `classifyScript()` 로 정확히 걸러낸다 —
 *     그쪽 규약을 여기로 가져온다(정본이 둘이면 하나는 낡는다).
 *
 *  ② **픽스처 소재를 한 곳만 봤다** — 이 스크립트는 픽스처가 **자기 안 `cases[]` 에만**
 *     있다고 가정했다. 최근 3개 게이트는 픽스처를 **별도 파일 `check-<이름>.selftest.mjs`**
 *     에 둔다(그쪽이 tmpdir 주입이라 더 안전하다 — 오늘 우리가 배운 그 이유다).
 *     그 형태를 아예 못 봤다.
 *
 * ── 어떻게 고쳤나 ────────────────────────────────────────────────────────────────
 *   · 분모에서 `*.selftest.mjs` 를 뺀다(①).
 *   · 픽스처 소재를 **두 곳** 본다: 인라인 `cases[]` + 형제 파일 `check-X.selftest.mjs`(②).
 *   · 🔴 **찾았다고 말만 하지 않고 실제로 돌린다.** 「픽스처가 있다」와 「픽스처가 통과한다」는
 *     다른 명제다. 돌리지 않고 초록으로 세는 것이 바로 오늘 하루 쫓은 그 병이다.
 *
 * ── 🔴 이 게이트의 **자기 사각지대** (숨기지 않는다) ───────────────────────────────
 *   이 스크립트는 **자기 자신(`selftest-gates.mjs`)에 대한 픽스처를 갖지 않는다.**
 *   그래서 위 결함을 **스스로 못 봤고, 사람이 신고해서야 알았다.**
 *   `check-gate-registration` 은 자기 예외를 두지 않아 등록 전 자기 자신을 R1 으로 잡았다 —
 *   그 설계를 여기서는 아직 못 따라갔다. 요약 하단에 이 한계를 매번 찍는다.
 */
/* 🔴 **판정 정본은 `scripts/lib/gate-classify.mjs` 다**(2026-08-22 통합).
 *    종전에 이 자리에 있던 `/^check-.+\.mjs$/` 가 바로 위 주석이 말하는 그 오류다.
 *    같은 판단을 `check-gate-registration.mjs` 가 이미 옳게 하고 있었고, 이쪽만 낡았다.
 *    🔴 **정규식을 여기 다시 적지 마라.** 규칙을 바꾸려면 정본 파일을 고쳐라 —
 *       그래야 양쪽이 같이 바뀐다. 주의로 막은 것은 안 지켜지지만 구조로 막은 것은 지켜진다. */
const scriptFiles = readdirSync(join(APP, 'scripts'));

/* 🔴 `selftest-gates`(자기 자신)도 정본이 게이트로 센다(`KNOWN_EXTRA_GATES`). **빼지 않는다.**
 *    빼면 자기 사각지대가 분모에서 사라져 「미검증 0」처럼 보인다 — 오늘 고친 그 오보와 같은 종류다.
 *    `check-gate-registration` 이 등록 전 자기 자신을 R1 으로 잡는 것과 같은 규율이다. */
/* 🔴 계산 자체는 `lib/selftest-coverage.mjs` 의 순수 함수로 뺐다(2026-08-25) — 실제 파일시스템·
 *    락 없이 `selftest-gates.selftest.mjs` 가 합성 파일명 목록만으로 이 계산을 단위시험할 수
 *    있게 하기 위해서다. 여기서는 실제 `scriptFiles` 로 부르기만 한다 — 값은 종전과 같다. */
const { allGates, externalFixtures: EXTERNAL_FIXTURES, allFixtureGates, uncovered, orphanFixtureFiles } =
  computeGateCoverage({ scriptFiles, inlineFixtureGates: allCases.map((c) => c.gate), unitGate: UNIT_GATE, subGates: SUB_GATES });

console.log('게이트 자체 검증 — 고의 위반을 주입해 실제로 잡는지 확인한다\n');
console.log(`baseline 측정(주입 전 원래 상태) — 픽스처 보유 ${fixtureGates.length}종${ONLY ? ' (필터됨)' : ''}:`);
const baseline = new Map();
for (const g of fixtureGates) {
  const custom = UNIT_BASELINE[g] ?? SCOPED_BASELINE[g] ?? null;
  const code = custom ? custom() : runGate(`${g}.mjs`);
  baseline.set(g, code);
  console.log(`  ${code === 0 ? '✅' : '⚠️ '} ${g.padEnd(18)} baseline exit ${code}${code === 0 ? '' : ' ← 사전 FAIL(주입과 무관)'}`);
}

// ---------- 1. 주입 ----------
console.log('\n주입 케이스:');
const rows = [];
let allOk = true;
for (const c of activeCases) {
  const base = baseline.get(c.gate);
  if (base !== 0) {
    // 🔴 이미 실패 중인 게이트는 무엇을 주입해도 「탐지」로 보인다. 탐지 성공으로 세지 않는다.
    rows.push({ ...c, status: 'SKIP' });
    console.log(`  ⏭  ${c.gate.padEnd(18)} ${c.name}  ← SKIP(사전 FAIL)`);
    continue;
  }
  const code = c.run();
  /* 🔴 `expectCode` — **어떤 코드로 죽었는지까지** 본다.
   *    기본 판정은 「0 이 아니면 탐지」다. 그런데 계측기 고장(2)을 판정 실패(1)로 내보내는
   *    결함은 그 기본 판정을 **통과해 버린다** — 「위반을 찾았다」로 위장되는데도 초록이 뜬다.
   *    그 구분이 중요한 케이스는 기대 코드를 명시하고, 다르면 미탐지로 센다. */
  const caught = c.expectCode != null ? code === c.expectCode : code !== 0;
  if (c.expectCode != null && code !== c.expectCode) {
    console.log(`     ↳ 기대 종료코드 ${c.expectCode} · 실제 ${code}`);
  }
  if (c.knownGap) {
    if (caught) {
      rows.push({ ...c, status: 'DETECT' });
      console.log(`  🎉 ${c.gate.padEnd(18)} ${c.name}  ← 사각지대가 해소되었다(knownGap 해제 검토)`);
    } else {
      rows.push({ ...c, status: 'GAP' });
      console.log(`  ⚠️  ${c.gate.padEnd(18)} ${c.name}  ← 못 잡는다(알려진 사각지대, allOk 미반영)`);
    }
    continue;
  }
  rows.push({ ...c, status: caught ? 'DETECT' : 'MISS' });
  if (!caught) allOk = false;
  console.log(`  ${caught ? '✅' : '❌'} ${c.gate.padEnd(18)} ${c.name}${caught ? '' : '  ← 위반을 잡지 못했다'}`);
}

// ---------- 2. 주입 해제 후 baseline 과 대조 ----------
// 🔴 예전에는 「원래부터 FAIL」인 게이트까지 「복구 실패」로 찍었다(check-assets 실사고).
//    baseline 과 같으면 복구는 정상이다.
console.log('\n주입 해제 후 baseline 대조:');
for (const g of fixtureGates) {
  const base = baseline.get(g);
  const customAfter = UNIT_BASELINE[g] ?? SCOPED_BASELINE[g] ?? null;
  const after = customAfter ? customAfter() : runGate(`${g}.mjs`);
  if (base === 0 && after === 0) {
    // 단위 픽스처는 파일을 건드리지 않으므로 「복구」가 아니라 「재현성」 확인이다. 문구를 구분한다.
    const what = UNIT_BASELINE[g] ? '단위 픽스처 — 파일 미변경, baseline 재현'
      : (SCOPED_BASELINE[g] ? '스코프 픽스처 — src 미변경, 깨끗한 트리 baseline 재현' : '복구 정상');
    console.log(`  ✅ ${g.padEnd(18)} ${what} (baseline 0 → 0)`);
  } else if (base !== 0 && after === base) {
    console.log(`  ⚠️  ${g.padEnd(18)} 사전 FAIL(주입 무관) — baseline ${base} → ${after}, 복구는 정상`);
  } else {
    console.log(`  ❌ ${g.padEnd(18)} 진짜 복구 실패 — baseline ${base} → ${after}, 잔재 확인 필요`);
    allOk = false;
  }
}

/* ---------- 2-b. 🔴 형제 픽스처 파일을 **실제로 돌린다** ----------
 * 「픽스처가 있다」는 커버리지가 아니다. 「픽스처가 돌아서 통과한다」가 커버리지다.
 * 종전 요약은 이 셋을 아예 못 봐서 「미검증」으로 찍었다 — 실제보다 나쁜 쪽 거짓말이었다.
 * 🔴 셋 다 tmpdir 주입이거나 읽기 전용이라 실트리를 건드리지 않는다(2026-08-22 확인).
 * ⚠️ 한계: 이 셋은 `cases[]` 와 **모양이 다르다**(주입 1건 → 종료코드 1 이 아니라,
 *    자체적으로 여러 픽스처를 돌려 전건 통과면 0). 그래서 탐지 분모에 섞지 않고 따로 센다.
 */
const externalResults = [];
if (!ONLY) {
  console.log('\n형제 픽스처 파일 실행 (별도 파일에 픽스처를 둔 게이트):');
  for (const x of EXTERNAL_FIXTURES) {
    const code = runGate(x.file);
    externalResults.push({ ...x, code });
    console.log(`  ${code === 0 ? '✅' : '❌'} ${x.gate.padEnd(24)} ${x.file} → exit ${code}`);
  }
  if (EXTERNAL_FIXTURES.length === 0) console.log('  (없음)');
} else {
  console.log(`\n형제 픽스처 파일: 필터 실행이라 건너뛴다 (${EXTERNAL_FIXTURES.map((x) => x.gate).join(' · ') || '없음'}).`);
}

// ---------- 3. 요약 — 분모를 숨기지 않는다 ----------
const detect = rows.filter((r) => r.status === 'DETECT').length;
const miss = rows.filter((r) => r.status === 'MISS').length;
const skip = rows.filter((r) => r.status === 'SKIP').length;
const gap = rows.filter((r) => r.status === 'GAP').length;
const ran = detect + miss;

console.log('\n=========== 자체 검증 요약 ===========');
console.log(`  주입 케이스 ${rows.length}건 = 탐지 ${detect} · 미탐지 ${miss} · SKIP(사전 FAIL) ${skip} · 알려진 사각지대 ${gap}`);
console.log(`  ${detect}/${ran} 탐지  (분모 = 실제로 실행된 주입 케이스)`);
/* 🔴 덮은 게이트는 **두 소재를 합쳐** 센다. 인라인만 세면 형제 파일에 픽스처를 둔 게이트가
 *    「미검증」으로 찍힌다 — 2026-08-22 에 실제로 그랬다(위 §분모 오염 주석). */
const coveredNow = [...new Set([...fixtureGates, ...externalResults.map((x) => x.gate)])].sort();
console.log(`  덮은 게이트 ${coveredNow.length}/${allGates.length}종: ${coveredNow.join(' · ')}`);
console.log(`     └ 인라인 픽스처 ${fixtureGates.length}종 + 형제 파일 픽스처 ${externalResults.length}종`
  + `${externalResults.length ? ` (${externalResults.map((x) => `${x.gate}:exit ${x.code}`).join(' · ')})` : ''}`);
if (ONLY) {
  console.log(`  🔴 필터 실행이었다 — 전체 픽스처 ${allCases.length}건 중 ${activeCases.length}건만 돌렸다. 이 결과로 마감 판정을 하지 마라.`);
  console.log(`     🔴 형제 파일 픽스처 ${EXTERNAL_FIXTURES.length}종도 돌리지 않았다 — 「덮은 게이트」 수를 마감에 쓰지 마라.`);
}
/* 🔴 **「픽스처가 없다」와 「픽스처를 못 찾았다」는 다른 상태다.**
 *   · 없다      → 사람이 만들어야 한다(아래 목록)
 *   · 못 찾았다 → **이 스크립트가 고장 난 것**이다. 종료코드 2 로 보낸다(계측기 오류). */
if (uncovered.length > 0) {
  console.log(`  🔴 미검증 게이트 ${uncovered.length}종 — **픽스처가 실재하지 않는다**(사람이 만들어야 한다): ${uncovered.join(' · ')}`);
  console.log('     ← 이 게이트들의 「통과」는 위반이 없어서인지 못 봐서인지 아직 증명되지 않았다.');
  console.log(`     확인 방법: 인라인 cases[] 에도 없고 scripts/<이름>.selftest.mjs 도 없다.`);
} else {
  console.log('  ✅ 미검증 게이트 없음 — 모든 게이트에 픽스처가 있다(인라인 또는 형제 파일).');
}
if (orphanFixtureFiles.length > 0) {
  console.log(`  🔴🔴 계측기 결함 — 픽스처 파일은 있는데 대응 게이트가 분모에 없다 ${orphanFixtureFiles.length}건:`);
  for (const x of orphanFixtureFiles) console.log(`     · ${x.file} → '${x.gate}' 가 게이트 목록에 없다`);
  console.log('     ← 「픽스처 없음」이 아니라 **이 스크립트의 게이트 열거가 틀린 것**이다. 종료코드 2.');
}
/* 🔴 자기 사각지대 — 매번 찍는다. 2026-08-22 에 이 스크립트가 자기 결함을 스스로 못 봤다. */
console.log('  ⚠️  자기 사각지대: 이 스크립트 자신(selftest-gates.mjs)에는 픽스처가 없다 —');
console.log('     위 수치가 틀려도 **스스로 알아채지 못한다.** 2026-08-22 에 실제로 그랬다(픽스처 3종을 「없음」으로 찍었다).');
if (gap > 0) {
  console.log(`  🔴 알려진 사각지대 ${gap}건:`);
  for (const r of rows.filter((x) => x.status === 'GAP')) console.log(`     - ${r.gate}: ${r.name}`);
}
console.log('=====================================');

/* 🔴🔴 복구 실패는 **판정보다 먼저** 결론을 낸다 — 종료코드 2(계측기 오류).
 *
 * 왜 판정(0/1)보다 세게 다루는가: 주입본이 트리에 남았다는 것은 이번 실행의
 * **PASS 도 FAIL 도 오염된 트리 위에서 나왔다**는 뜻이다. 무엇 하나 믿을 수 없다.
 * 2026-08-21 사고는 이 비명이 없어서 **조용히** 남았고, 그 결과 등급 원장이
 * 합성 → 문헌식으로 승격된 채 하루를 넘겼다. 다시는 조용히 넘어가지 않는다. */
/* 🔴 계측기 오류는 **같은 계층**으로 모은다 — 복구 실패든 게이트 열거 오류든,
 *    「이번 실행의 수치를 믿을 수 없다」는 결론이 같기 때문이다(ERROR > FAIL). */
if (orphanFixtureFiles.length > 0) {
  console.error('\n🔴🔴🔴 계측기 오류 — 픽스처 파일을 게이트에 연결하지 못했습니다 (종료코드 2)');
  for (const x of orphanFixtureFiles) console.error(`   · ${x.file} → '${x.gate}'`);
  console.error('   🔴 「미검증」이 아닙니다. **이 스크립트의 게이트 열거가 틀렸습니다.** 커버리지 수치를 쓰지 마십시오.');
  process.exit(2);
}

/* 형제 파일 픽스처가 실패했다면 그것은 **판정 실패**다(계측기 고장이 아니다).
 * 그 게이트의 「통과」가 증명되지 않았다는 뜻이므로 초록으로 끝내지 않는다. */
const externalFailed = externalResults.filter((x) => x.code !== 0);
if (externalFailed.length > 0 && RESTORE_FAILURES.length === 0) {
  console.error(`\n❌ 형제 파일 픽스처 실패 ${externalFailed.length}건 — 그 게이트는 검증되지 않았습니다:`);
  for (const x of externalFailed) console.error(`   · ${x.file} → exit ${x.code}`);
}

if (RESTORE_FAILURES.length > 0) {
  console.error('\n🔴🔴🔴 복구 실패 — 주입본이 트리에 남았을 수 있습니다 (종료코드 2 · 계측기 오류)');
  for (const f of RESTORE_FAILURES) console.error(`   · ${f}`);
  console.error('   ─────────────────────────────────────────────────────────────');
  console.error('   🔴 이번 실행의 탐지/미탐지 결과는 **전부 신뢰할 수 없습니다.** 판정 실패(1)가 아닙니다.');
  console.error('   위 파일들을 원상 확인한 뒤 다시 실행하세요.');
  process.exit(2);
}

const finalOk = allOk && externalFailed.length === 0;
console.log(`\n${finalOk ? '✅' : '❌'} 자체 검증 ${detect}/${ran} 탐지`
  + `${externalResults.length ? ` · 형제 파일 픽스처 ${externalResults.length - externalFailed.length}/${externalResults.length} 통과` : ''}`);
process.exit(finalOk ? 0 : 1);
