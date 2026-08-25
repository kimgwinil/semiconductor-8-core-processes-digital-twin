#!/usr/bin/env node
// check-live-judgment.mjs — 🔴 「살아 있는 판정」 게이트 (PLN 확정 정의 PD-52)
//
// ── PLN 확정 정의 (임의 변경 금지) ────────────────────────────────────────────
//   **살아 있는 판정 = 합격 조합도 있고 불합격 조합도 있는 판정.**
//   **합격 0 = 도달 불가 · 불합격 0 = 무의미. 둘 다 위반.**
//
// ── 왜 이 게이트가 생겼나 ─────────────────────────────────────────────────────
//   판정이 있다고 **선언**돼 있어도, 무엇을 움직여도 합격이면 그것은 판정이 아니다.
//   반대로 어떤 조합으로도 합격에 닿지 못하면 학습자는 영원히 통과하지 못한다.
//   기존 게이트 중 이것을 보는 것은 없었다 —
//     · `check-labs`      : 명세가 **형식적으로** 채워졌는가
//     · `check-passwindow`: 불가능한 값이 **합격하지 않는가**(W1·W2)
//   둘 다 「합격도 나오고 불합격도 나오는가」는 묻지 않는다. 그 자리를 이 게이트가 맡는다.
//
// ── FAIL 로 잡는 것은 셋뿐이다 ────────────────────────────────────────────────
//   LJ-1 존재성        판정 자체가 존재하는가
//   LJ-2 존재성(구조적) 합격창이 공집합이거나 선언된 정의역과 서로소인가
//   LJ-3 반증성        불합격이 나오는 조합이 존재하는가
//   LJ-4 동시성        합격과 불합격이 **같은 판정 안에** 둘 다 존재하는가
//
// 🔴 **발견 가능성(합격 비율 · 도달 스텝 수)은 FAIL 에 넣지 않는다. 수치 보고만 한다.**
//    임계를 FAIL 에 넣는 순간 사람이 고칠 대상은 판정이 아니라 **임계**가 된다.
//
// 🔴 **표본에서 합격이 0 이면 FAIL 이 아니라 `UNDETERMINED`.** 표본이 못 찾은 것과
//    도달 불가는 다르다. `UNDETERMINED` 는 **PASS 로 집계하지 않고** 별도로 센다.
//
// ── 🔴 표적 재표본 — 「셋 중 하나」로 남기지 않는다 (2026-08-22 신설) ─────────
//   종전에는 UNDETERMINED 가 나오면 ①도달불가·②격자엇갈림·③표본부족 을 나란히 늘어놓고
//   끝났다. **그러면 다음 사람이 처음부터 다시 잰다.** 이제 균등 표본이 합격을 하나도 못
//   찾은 칸에 한해 두 단계를 더 돈다:
//     A. **step 격자 위 표적 등반** — 찾으면 ③ 확정이고 UNDETERMINED 가 닫힌다(표본은 계상).
//     B. A 가 실패하면 **step 을 무시한 연속 완화 등반** — 여기서 찾으면 ② 확정(계상 안 함),
//        둘 다 실패하면 ① 후보로 굳고 **PLN 판정 대기**로 출력에 박는다.
//   🔴 이것은 판정을 무르게 하는 것이 **아니라 진단을 좁히는 것**이다. 종료코드 4 는 그대로다.
//   🔴 합격창·정의역·step·범위를 한 개도 바꾸지 않는다(D-041). 있는 합격창을 **찾아낼** 뿐이다.
//   🔴 UNDETERMINED 후보에만 돈다 — 나머지 칸은 타지 않으므로 게이트가 느려지지 않는다
//      (실측 2026-08-22: 24칸 전수 0.73–0.77s → 0.76–0.81s).
//
// 🔴 **R-0(입력 부재) 전용 검사를 따로 만들지 않았다.** 입력이 없으면 출력이 상수이고,
//    상수 판정은 항상 참(→LJ-3) 또는 항상 거짓(→LJ-4)이라 위 규칙에 자동으로 걸린다.
//    픽스처 ⓓ 가 그 증명이다.
//
// ── 종료코드 ──────────────────────────────────────────────────────────────────
//   0  PASS          FAIL 0 · UNDETERMINED 0 · ERROR 0 — 전부 살아 있는 판정
//   1  FAIL          죽은 판정을 찾았다 (LJ-1 · LJ-2 · LJ-3)
//   2  ERROR         🔴 **계측기가 자기 일을 못 했다.** 판정이 아니다.
//   4  UNDETERMINED  FAIL 0 인데 판정 불가가 남았다. 🔴 PASS 가 아니다.
//
//   우선순위: ERROR(2) > FAIL(1) > UNDETERMINED(4) > PASS(0)
//   🔴 ERROR 가 가장 세다 — 계측기가 고장 난 상태에서 낸 PASS/FAIL 숫자는 전부 신뢰할 수 없다.
//
// ── 🔴 판정 실패(1) 와 계측기 고장(2) 의 경계 ─────────────────────────────────
//   종전에는 이 둘이 섞여 있었다. **계측기가 고장 났는데 「위반을 찾았다」고 보고**하는 것은
//   이 프로젝트가 오늘 하루 싸운 병 그 자체다. 그래서 표로 못 박는다.
//
//   ┌─────────────────────────────────────────────┬──────────┬──────────────────────────┐
//   │ 상황                                        │ 종료코드 │ 왜                       │
//   ├─────────────────────────────────────────────┼──────────┼──────────────────────────┤
//   │ 판정 단위가 선언조차 안 됨 (LJ-1 정적)      │ 1 FAIL   │ 재지 않고도 아는 결함    │
//   │ 합격창 ∩ 정의역 = ∅ (LJ-2)                  │ 1 FAIL   │ 구조가 말해 주는 결함    │
//   │ 표본 전부 합격 (LJ-3 반증성)                │ 1 FAIL   │ 실제로 재서 나온 결함    │
//   │ 표본 전부 불합격 + 표적 등반도 실패 (LJ-4)  │ 4 UNDET  │ ①/② 로 좁혀 출력에 박음  │
//   ├─────────────────────────────────────────────┼──────────┼──────────────────────────┤
//   │ 모듈 적재 실패 (src 편집 중 등)             │ 2 ERROR  │ 아무것도 못 쟀다         │
//   │ 관측 0건 (전 표본 compute/evaluate 예외)    │ 2 ERROR  │ 아무것도 못 쟀다         │
//   │ 제품 호출부가 등기부와 어긋남               │ 2 ERROR  │ 제품과 다른 것을 재고 있다│
//   │ --only 가 0칸에 걸림 / 잘못된 인자          │ 2 ERROR  │ 게이트 오용              │
//   │ 실습 미착수 (labs/index.ts 없음)            │ 2 ERROR  │ 🔴 초록으로 내지 않는다  │
//   └─────────────────────────────────────────────┴──────────┴──────────────────────────┘
//
// ── 왜 정규식이 아니라 모듈을 실제로 불러오는가 ───────────────────────────────
//   합격 여부는 `spec.compute()` 를 돌려 봐야만 나온다. 그리고 판정 규칙을 게이트가
//   베껴 두면 게이트는 **자기가 상상한 앱**을 검사하게 된다. 그래서 vite 로 실제 모듈을
//   적재하고 화면이 쓰는 `evaluate()` 를 그대로 부른다(`LabRunner.tsx:50` 과 같은 호출).
//   🔴 `compute()` 가 돌려준 `Quantity` 를 **벗기지 않고 그대로** 넘긴다 — 벗기면
//      물리층의 `outOfRange` 가 판정에 닿기 전에 사라져 앱과 다른 것을 재게 된다.
//
// ── 픽스처 ────────────────────────────────────────────────────────────────────
//   `--fixture=<이름>` 으로 **명세만** 바꿔치기한다(판정 함수·판정 규칙은 진짜 그것).
//   목록: scripts/fixtures/live-judgment-fixtures.mjs
//
// ── 사용 ──────────────────────────────────────────────────────────────────────
//   node scripts/check-live-judgment.mjs                       판정(24칸 전수)
//   node scripts/check-live-judgment.mjs --fixture=<이름>       주입 픽스처 1건
//   node scripts/check-live-judgment.mjs --samples=<N>          표본 수만 바꾼다(진단)
//   node scripts/check-live-judgment.mjs --only=<labKey일부>    특정 칸만 본다(진단)
//   🔴 `--samples` · `--only` 는 **판정 규칙을 바꾸지 않는다.** UNDETERMINED 가 나왔을 때
//      「표본이 부족한가」를 되묻는 자리다. 표본을 늘려 합격을 찾았다면 고칠 곳은
//      **기본 표본 수**이지 합격창이 아니다(D-041).
//   ⚠️ 다만 2026-08-22 실측이 말해 준 것: **균등 표본을 늘리는 것은 답이 아니었다.**
//      `eds/lab-applied` 는 합격 격자점이 10,744,000 중 833(부피비 7.75e-5)인데, 현행 LCG 로는
//      20만 점을 뿌려도 0건이었다(같은 20만에서 mulberry32 23건 · Math.random 12건).
//      → **표본 수가 아니라 표본기의 격자 편향**이었다. 그래서 균등 표본을 늘리는 대신
//        **표적 재표본**(아래)을 붙였다. `--samples` 는 이제 진단 보조 수단이다.
//   🔴 `src/**` 를 건드리지 않는다 — 2026-08-21 현재 다른 담당이 동시에 편집 중이다.

import { createServer } from 'vite';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import {
  VERDICT, SWEEP_SEED, LIVE_JUDGMENT_SAMPLES_PER_LAB, CORNER_PARAM_LIMIT,
  LIVE_JUDGMENT_FOCUS_STARTS, LIVE_JUDGMENT_FOCUS_MAX_EVALS,
  analyzeLab, summarize, scanEvaluateCalls, measureStripDivergence, EXPECTED_EVALUATE_CALLERS,
} from './lib/live-judgment.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const LABS_INDEX = join(APP, 'src', 'models', 'labs', 'index.ts');
const SPEC_TS = '/src/models/labs/spec.ts';

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};

const fixtureName = arg('fixture');

/* 🔴 진단 인자 — **판정 규칙을 바꾸지 않는다.** 표본을 늘리거나 대상을 좁힐 뿐이다.
 *    `UNDETERMINED` 가 나왔을 때 「표본이 부족한가」를 되묻는 자리다(계측기를 먼저 의심하라).
 *    🔴 표본을 늘려 합격을 찾았다면 고칠 곳은 **기본 표본 수**이지 합격창이 아니다. */
const samplesArg = arg('samples');
const SAMPLES = samplesArg === null ? LIVE_JUDGMENT_SAMPLES_PER_LAB : Number(samplesArg);
if (!Number.isInteger(SAMPLES) || SAMPLES < 0) {
  console.error(`🔴 --samples 값이 정수가 아닙니다: ${samplesArg}`);
  process.exit(2);
}
/** 특정 칸만 본다. 부분문자열 일치(예: `--only=metal/lab-advanced`). 진단 전용. */
const ONLY = arg('only');

if (!fixtureName && !existsSync(LABS_INDEX)) {
  /* 🔴 종전에는 exit 0(통과)였다. **미착수를 초록으로 내보내면 「괜찮다」로 소비된다** —
   *    게이트가 아무것도 재지 못한 것이지 판정이 살아 있는 것이 아니다. ERROR 로 낸다. */
  console.error('\n⚠️  check-live-judgment: src/models/labs/index.ts 가 없습니다 — **아무것도 재지 못했습니다.**');
  console.error('  🔴 이것은 통과가 아닙니다(종료코드 2 = ERROR). 실습 명세가 생긴 뒤 다시 실행하십시오.');
  process.exit(2);
}

let fixtureSpecs = null;
if (fixtureName) {
  const mod = await import('./fixtures/live-judgment-fixtures.mjs');
  fixtureSpecs = mod.FIXTURES[fixtureName];
  if (!fixtureSpecs) {
    console.error(`🔴 그런 픽스처가 없습니다: ${fixtureName}`);
    console.error(`   있는 것: ${Object.keys(mod.FIXTURES).join(', ')}`);
    process.exit(2);
  }
}

const server = await createServer({
  root: APP,
  configFile: join(APP, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const records = [];
/** 🔴 Quantity 경로 vs 실값 경로 판정 발산 — 호출자의 선택이 지는 무게를 수치로 낸다. */
let divergence = null;
/** 🔴 `evaluate()` 제품 호출부 전수(토큰 기반). 등기부와 어긋나면 ERROR(2). */
let callers = null;

/** `src/**` 의 `.ts`·`.tsx` 를 훑어 `evaluate(...)` 호출부를 토큰 위에서 모은다. */
function scanProductEvaluateCallers() {
  const SRC = join(APP, 'src');
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules') continue;
      const abs = join(dir, e);
      if (statSync(abs).isDirectory()) { walk(abs); continue; }
      if (!/\.tsx?$/.test(abs)) continue;
      const rel = relative(APP, abs);
      // 🔴 정의부 자신은 호출부가 아니다.
      if (rel === 'src/models/labs/spec.ts') continue;
      for (const c of scanEvaluateCalls(readFileSync(abs, 'utf8'))) {
        found.push({ file: rel, line: c.line, arg2: c.args[1] ?? '(인자 없음)', args: c.args });
      }
    }
  };
  walk(SRC);
  return found;
}

/* 🔴 적재 실패를 **판정처럼 보이게 하지 않는다** (2026-08-21 실측).
 *   측정 중 다른 담당이 `src/models/labs/photo.ts` 를 편집하고 있었고, 그 중간 상태에서
 *   `AERIAL_NOTE_COMMON is not defined` 로 배럴 전체가 던졌다. 종전 코드는 스택 트레이스를
 *   그대로 토해 냈다 — 「게이트가 깨졌나 / 코드가 깨졌나」를 읽는 사람이 구분할 수 없다.
 *   전제가 무너진 것이므로 **SKIP 이 아니라 ❌ + exit 1** 로 세운다(집안 관례: SKIP 은 PASS 가 아니다). */
let loadError = null;

try {
  let specs;
  let specMod;

  if (fixtureSpecs) {
    // 🔴 픽스처 모드에서도 판정 함수는 **진짜 그것**을 쓴다. 명세만 바꿔치기한다.
    //    `spec.ts` 는 런타임 의존이 없으므로(타입 import 뿐) 단독 적재가 성립한다.
    specMod = await server.ssrLoadModule(SPEC_TS);
    specs = fixtureSpecs;
  } else {
    // 🔴 순서 의존 — registry 를 labs 보다 **먼저** 적재해야 등급 리졸버가 설치된다.
    //    (`contract.ts` 는 리졸버가 없으면 조용히 넘어가지 않고 던진다.)
    await server.ssrLoadModule('/src/models/registry.ts');
    const labsMod = await server.ssrLoadModule('/src/models/labs/index.ts');
    labsMod.registerAllLabs();
    specMod = await server.ssrLoadModule(SPEC_TS);
    specs = specMod.registeredLabKeys()
      .map((k) => { const [p, s] = k.split('/'); return specMod.labSpec(p, s); })
      .filter(Boolean);
  }

  if (ONLY) {
    specs = specs.filter((sp) => `${sp.processId}/${sp.stage}`.includes(ONLY));
    if (specs.length === 0) throw new Error(`--only=${ONLY} 에 걸리는 실습 칸이 없습니다 — 아무것도 재지 못했습니다.`);
  }
  for (const spec of specs) records.push(analyzeLab(spec, specMod.evaluate, { samples: SAMPLES }));

  /* 🔴 호출자 규율 → 검사 (팀장 지시 (나)). 실트리에서만 의미가 있다. */
  if (!fixtureSpecs) {
    divergence = specs.map((sp) => ({
      labKey: `${sp.processId}/${sp.stage}`,
      ...measureStripDivergence(sp, specMod.evaluate, { samples: SAMPLES }),
    }));
    callers = scanProductEvaluateCallers();
  }
} catch (e) {
  loadError = e;
} finally {
  await server.close();
}

if (loadError) {
  console.error('\n❌ check-live-judgment: 판정 대상을 적재하지 못했습니다 — **판정을 내리지 않았습니다.**');
  console.error(`  ${loadError?.message ?? loadError}`);
  console.error('  🔴 이것은 「살아 있는 판정 위반」이 아닙니다(종료코드 2 = ERROR).');
  console.error('     모듈이 적재되지 않아 아무것도 재지 못한 상태입니다 —');
  console.error('     **계측기가 고장 났는데 「위반을 찾았다」고 보고하지 않기 위해** FAIL(1) 과 갈랐습니다.');
  console.error('  🔴 이 게이트를 SKIP 으로 넘기지 마십시오 — SKIP 은 PASS 가 아닙니다.');
  console.error('  흔한 원인: ① src/models/labs/** 가 편집 중이라 중간 상태다 ② registry 적재 순서가 깨졌다');
  console.error('             ③ 물리층이 던진다. 트리가 안정된 뒤 다시 실행하십시오.');
  process.exit(2);
}

/* ══════════════ 보고 ══════════════ */

const MARK = { [VERDICT.PASS]: '✅', [VERDICT.FAIL]: '❌', [VERDICT.UNDETERMINED]: '🟡', [VERDICT.ERROR]: '⚠️ ' };
const sum = summarize(records);

const scope = fixtureName ? `픽스처 ${fixtureName}` : `실습 ${records.length}칸`;
console.log(`\n▶ check-live-judgment — 「살아 있는 판정」 (${scope})`);
console.log(
  `  표본: 칸당 기본값 1 + 격자 모서리 2^n(n ≤ ${CORNER_PARAM_LIMIT}) + 무작위 ${SAMPLES} (시드 ${SWEEP_SEED}, 결정론)`
  + (SAMPLES !== LIVE_JUDGMENT_SAMPLES_PER_LAB ? ` 🔎 기본값 ${LIVE_JUDGMENT_SAMPLES_PER_LAB} 이 아닌 **진단 실행**입니다` : '')
  + (ONLY ? ` 🔎 --only=${ONLY} 로 좁힘 — 전수가 아닙니다` : ''),
);
console.log(
  `  + 합격을 하나도 못 찾은 칸에만 **표적 재표본**(격자 등반 시작점 ${LIVE_JUDGMENT_FOCUS_STARTS}개 · 평가 상한`
  + ` ${LIVE_JUDGMENT_FOCUS_MAX_EVALS}) — 🔴 합격창을 넓히는 것이 아니라 있는 합격창을 찾는 단계입니다(D-041).`,
);
console.log('  ──────────────────────────────────────────────────────────────────────');

for (const r of records) {
  const l2 = r.l2;
  const ratio = l2.passRatio === null ? '  —  ' : `${(l2.passRatio * 100).toFixed(2).padStart(6)}%`;
  const steps = l2.minPassSteps === null ? '—' : `${l2.minPassSteps}칸`;
  console.log(
    `  ${MARK[l2.verdict]} ${l2.verdict.padEnd(12)} ${r.labKey.padEnd(26)}`
    + ` 판정단위 ${String(r.unitCount).padStart(2)} · 합격 ${String(l2.passes).padStart(5)}/${String(l2.observed).padStart(5)} (${ratio})`
    + ` · 최소도달 ${steps}`
    + (r.computeThrows ? ` · compute예외 ${r.computeThrows}` : ''),
  );
  for (const u of r.l1) {
    const ur = u.passRatio === null ? '  —  ' : `${(u.passRatio * 100).toFixed(2).padStart(6)}%`;
    const us = u.minPassSteps === null ? '—' : `${u.minPassSteps}칸`;
    console.log(
      `       ${MARK[u.verdict]} ${u.verdict.padEnd(12)} ${u.id.split(' / ')[1].padEnd(24)}`
      + ` 합격 ${String(u.passes).padStart(5)}/${String(u.observed).padStart(5)} (${ur})`
      + ` · 최소도달 ${us}`
      + ` · 값 [${fmt(u.valueMin)}, ${fmt(u.valueMax)}]`
      + (u.constant ? ' 🔎상수(입력 무반응 의심 — 수치 보고, FAIL 아님)' : '')
      + (u.outOfDomain ? ` · 정의역이탈 ${u.outOfDomain}` : ''),
    );
  }
}

function fmt(v) {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : v.toFixed(4);
}

/* ══════ 🔴 표적 재표본 보고 — 「왜 균등 표본으로는 못 찾았는가」를 **수치로** 말한다 ══════
 *
 *   표본을 늘려 닫고 끝내면 다음 사람이 같은 자리에서 또 막힌다. 그래서 닫힌 칸도
 *   **얼마나 좁은 표적이었는지**를 남긴다. 🔴 발견 가능성은 FAIL 규칙이 아니다(수치 보고만). */
const focused = records.filter((r) => r.focus?.ran);
if (focused.length > 0) {
  console.log('  ──────────────────────────────────────────────────────────────────────');
  console.log('  🔎 표적 재표본 — **균등 표본이 합격을 하나도 못 찾은 칸에만** 돕니다(나머지 칸은 타지 않습니다).');
  console.log('     방법: 「미충족 판정 수」1순위 · 「합격창까지 정규화 잔여거리」2순위 목적함수로 **step 격자 위** 좌표하강.');
  console.log('     🔴 합격창·정의역·step·범위를 한 개도 바꾸지 않습니다 — 있는 합격창을 **찾아낼** 뿐입니다(D-041).');
  for (const r of focused) {
    const f = r.focus;
    /* 균등 표본 n 건에서 합격 0 건 → 합격 영역 부피비의 95% 상한 ≈ 3/n (「3의 법칙」). */
    const volBound = r.baseObserved > 0 ? 3 / r.baseObserved : null;
    if (f.gridFound) {
      console.log(
        `     🟢 ${r.labKey}: 균등 표본 ${r.baseObserved}건 합격 0건 → **격자 등반 ${f.gridEvals}회에서 합격 발견**`
        + ` (기본값에서 ${r.l2.minPassSteps}칸)`,
      );
      console.log(`        합격 조합 ${JSON.stringify(f.gridFound)}`);
      console.log(
        `        🔴 도달 불가가 아니라 **③ 표본 부족**이었습니다. 균등 표본 ${r.baseObserved}건이 합격 0건이었다는 것은`
        + ` 합격 영역 부피비가 대략 ${volBound.toExponential(2)} 이하라는 뜻입니다(3의 법칙, 95%).`,
      );
      console.log(
        '        🔴 **합격 영역이 그만큼 좁다는 사실 자체는 남습니다** — 학습자 발견 가능성 문제입니다.'
        + ' 이 게이트는 임계를 두지 않으므로 FAIL 로 세지 않고 수치로만 보고합니다. PLN 확인 권장.',
      );
    } else if (f.continuousFound) {
      console.log(
        `     🔴 ${r.labKey}: 격자 등반 ${f.gridEvals}회로도 못 찾았고, **step 을 무시한 연속값에서는 찾았습니다**`
        + ` (연속 등반 ${f.continuousEvals}회) → ② 격자 엇갈림.`,
      );
    } else {
      console.log(
        `     🔴 ${r.labKey}: 격자 등반 ${f.gridEvals}회 + 연속 완화 등반 ${f.continuousEvals}회로도 못 찾았습니다`
        + ` → ① 도달 불가 후보(PLN 판정 대기).`,
      );
    }
  }
}

/* ── 위반 사유를 모아 다시 찍는다 (표만 보고 원인을 되짚지 않게) ── */
const fails = [];
const undet = [];
const errs = [];
for (const r of records) {
  for (const u of [...r.l1, r.l2]) {
    const line = `[${u.code} ${u.rule}] ${u.id} (${u.label}): ${u.why}`;
    if (u.verdict === VERDICT.FAIL) fails.push(line);
    if (u.verdict === VERDICT.UNDETERMINED) undet.push(line);
    if (u.verdict === VERDICT.ERROR) errs.push(line);
  }
}

/* ══════ 🔴 호출자 규율 검사 — 게이트의 **측정 전제**가 성립하는가 ══════ */
if (callers) {
  const norm = (c) => `${c.file} :: evaluate(_, ${c.arg2})`;
  const got = callers.map(norm).sort();
  const want = EXPECTED_EVALUATE_CALLERS.map((c) => `${c.file} :: evaluate(_, ${c.arg2})`).sort();
  if (got.length !== want.length || got.some((g, i) => g !== want[i])) {
    errs.push(
      `[LJ-C 측정전제] evaluate() 제품 호출부가 등기부와 다릅니다 — 이 게이트는 Quantity 를 넘겨 쟀는데, `
      + `제품이 같은 것을 넘기는지 더 이상 보증할 수 없습니다.\n`
      + `      등기부: ${want.join(' · ') || '(없음)'}\n`
      + `      실제  : ${got.join(' · ') || '(없음)'}\n`
      + `      🔴 판정 실패가 아니라 ERROR 입니다. 호출부를 확인하고 lib/live-judgment.mjs 의 `
      + `EXPECTED_EVALUATE_CALLERS 를 갱신하십시오.`,
    );
  }
}

console.log('  ──────────────────────────────────────────────────────────────────────');
console.log(
  `  집계 · 랩 판정(L2) ${sum.labTotal}개: ✅${sum.lab.PASS} ❌${sum.lab.FAIL} 🟡${sum.lab.UNDETERMINED} ⚠️ ${sum.lab.ERROR}`
  + ` │ 출력 판정(L1) ${sum.outTotal}개: ✅${sum.out.PASS} ❌${sum.out.FAIL} 🟡${sum.out.UNDETERMINED} ⚠️ ${sum.out.ERROR}`,
);
console.log(
  '  🔴 🟡UNDETERMINED 는 PASS 로 세지 않습니다. 남았다면 해당 항목에 **표적 재표본이 가른 ①②③ 진단**이 붙어 있습니다'
  + ' — 「셋 중 하나」로 남기지 않습니다.',
);
console.log(
  `  LJ-2 실질 모수: **${sum.lj2RuntimeScope}/${sum.outTotal}** (물리층 validRange 를 얻은 판정 단위)`
  + ` · 그중 정의역이 입력에 따라 변해 구조적 단정 불가 ${sum.lj2VaryingScope}`
  + ` · 명세에 domain 을 선언한 것은 ${sum.lj2DeclaredDomain} 뿐입니다`,
);
console.log('  🔴 종전 LJ-2 는 명세 domain 만 봐서 모수가 ' + sum.lj2DeclaredDomain + ' 이었습니다 — evaluate() 는 Quantity 를 우선하는데 게이트만 다른 곳을 보고 있었습니다.');

/* 🔴 **모수 밖으로 밀려난 단위를 이름으로 찍는다** (2026-08-22).
 *   종전에는 「69/76」이라는 숫자만 나왔다. 어느 7개가 왜 빠졌는지 알아내려고 사람이 임시
 *   스크립트를 따로 짰고, 그것이 `JSON.stringify` 로 찍는 바람에 `-Infinity` 를 `null` 로 읽어
 *   **원인을 반대로 진단했다**(「src 의 타입 계약 위반」 → 실제로는 게이트의 유한성 필터).
 *   계측기가 「못 쟀다」고 말할 때는 **무엇을 왜 못 쟀는지 같이 말해야 한다.** */
if (sum.lj2OutOfScope && sum.lj2OutOfScope.length > 0) {
  console.log(`  🔴 LJ-2 모수 밖 ${sum.lj2OutOfScope.length}건 — 물리층 정의역을 쓸 수 없었던 판정 단위:`);
  for (const s of sum.lj2OutOfScope) {
    console.log(`       · ${s.unit}: ${s.reasons.length ? s.reasons.join(' / ') : '표본이 하나도 성립하지 않음'}`);
  }
}

if (divergence) {
  const dOut = divergence.reduce((n, d) => n + d.diffOutputs, 0);
  const dLab = divergence.reduce((n, d) => n + d.diffLabs, 0);
  const cmp = divergence.reduce((n, d) => n + d.compared, 0);
  console.log(
    `  호출자 발산: Quantity 경로 vs 실값 경로 — 표본 ${cmp}건에서 출력 판정 ${dOut}건 · 랩 판정 ${dLab}건이 갈립니다.`,
  );
  const first = divergence.find((d) => d.firstDiff)?.firstDiff;
  if (first) {
    console.log(
      `    예: ${first.id} 값 ${first.value} → Quantity 경로 ${first.quantityPath ? '합격' : '불합격'}`
      + ` · 실값 경로 ${first.numberPath ? '합격' : '불합격'}`,
    );
    console.log('    🔴 실값으로 벗겨 넘기면 이만큼이 조용히 뒤집힙니다. 제품 호출부가 Quantity 를 넘기는 것이 방어입니다.');
  } else {
    console.log('    두 경로의 판정이 완전히 같습니다(발산 0건).');
  }
  const callerLines = (callers ?? []).map((c) => `${c.file}:${c.line} evaluate(_, ${c.arg2})`);
  console.log(`  evaluate() 제품 호출부 ${callerLines.length}곳: ${callerLines.join(' · ') || '(없음)'}`);
}

/* 🔴 **ERROR 가 가장 세다.** 계측기가 고장 난 상태에서 낸 PASS/FAIL 숫자는 전부 신뢰할 수 없다.
 *    그래서 FAIL 보다 먼저 본다 — 「위반을 찾았다」고 말하기 전에 「제대로 쟀는가」를 답한다. */
if (errs.length > 0) {
  console.error(`\n⚠️  check-live-judgment ERROR (${errs.length}건) — 종료코드 2. **판정 실패가 아닙니다.**`);
  console.error('  🔴 게이트가 자기 일을 못 했습니다. 아래 숫자는 위반 목록이 아니라 고장 목록입니다.');
  for (const m of errs) console.error('  ' + m);
  if (fails.length > 0) {
    console.error(`\n  참고 — 함께 관측된 판정 실패 ${fails.length}건(계측이 불완전하므로 확정으로 읽지 마십시오):`);
    for (const m of fails) console.error('  ' + m);
  }
  if (!fixtureName) console.error(`  대상: ${relative(APP, LABS_INDEX)}`);
  process.exit(2);
}

if (fails.length > 0) {
  console.error(`\n❌ check-live-judgment 실패 (${fails.length}건) — 죽은 판정입니다.`);
  for (const m of fails) console.error('  ' + m);
  if (undet.length > 0) {
    console.error(`\n🟡 함께 확인하십시오 — 판정 불가 ${undet.length}건:`);
    for (const m of undet) console.error('  ' + m);
  }
  console.error('\n  🔴 고칠 자리: ① 물리층 응답식(입력에 반응하는가) ② 파라미터 범위 ③ (그래도 남으면) 합격창 — ③ 은 PLN 대조 사항입니다(D-041).');
  console.error('  🔴 이 게이트를 느슨하게 만들어 통과시키지 마십시오. 임계값이 없는 것이 설계입니다.');
  if (!fixtureName) console.error(`  대상: ${relative(APP, LABS_INDEX)}`);
  process.exit(1);
}

if (undet.length > 0) {
  console.error(`\n🟡 check-live-judgment 판정 불가 (${undet.length}건) — 종료코드 4. **통과가 아닙니다.**`);
  for (const m of undet) console.error('  ' + m);
  /* ── 🔴 「셋 중 하나」로 남기지 않는다 (2026-08-22, CEO 지시) ────────────────
   *   종전 문구는 ①②③ 을 나란히 늘어놓고 끝났다. 그러면 **다음 사람이 처음부터 다시 잰다.**
   *   이제 표적 재표본(격자 등반 + 연속 완화)이 ③ 과 ② 를 **실제로 배제하거나 지목**하고,
   *   그 결과가 위의 각 항목 문구에 이미 박혀 있다. 여기서는 남은 행동만 말한다.
   *   🔴 진단을 좁혔을 뿐 판정을 무르게 한 것이 아니다 — 종료코드는 그대로 4 다. */
  console.error('\n  🔴 위 각 항목에 **표적 재표본 결과가 이미 박혀 있습니다** — ①②③ 중 무엇인지 다시 재지 마십시오.');
  console.error('     · 「② 격자 엇갈림」이라 적혀 있으면 → 고칠 자리는 param.step · min · max 입니다(명세 소관, PLN 대조).');
  console.error('     · 「① 도달 불가 후보」라 적혀 있으면 → **PLN 판정 대기**입니다(D-041). 개발이 임의로 닫지 않습니다.');
  console.error('     · ③ 표본 부족은 표적 재표본이 자동으로 해소합니다 — 이 자리까지 왔다면 이미 배제된 것입니다.');
  console.error('  🔴 어느 쪽이든 **합격창·정의역을 넓혀서 닫지 마십시오.** 그것은 판정을 고치는 것이 아니라 없애는 것입니다.');
  console.error('  🔴 UNDETERMINED 는 PASS 가 아닙니다. 이 게이트를 SKIP 으로 넘기지 마십시오.');
  if (!fixtureName) console.error(`  대상: ${relative(APP, LABS_INDEX)}`);
  process.exit(4);
}

console.log(
  `\n✅ check-live-judgment 통과 — ${scope} · 랩 판정 ${sum.labTotal}개 · 출력 판정 ${sum.outTotal}개가`
  + ' 전부 **합격 조합과 불합격 조합을 둘 다** 가집니다(살아 있는 판정).',
);
if (!fixtureName) console.log(`   대상: ${relative(APP, LABS_INDEX)}`);
process.exit(0);
