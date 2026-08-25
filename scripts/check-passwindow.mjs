#!/usr/bin/env node
// check-passwindow.mjs — 🔴 편측 합격창 게이트. 「물리적으로 불가능한 값이 합격하지 않는가」.
//
// 왜 이 게이트가 생겼나 (2026-08-21):
//   `wafer/lab-applied` 의 `diameterSigmaMm` 은 `role: 'judge'` 인데 합격창이 `pass: { max: 1 }`
//   **하나뿐**이었다. 편측 창은 **반대쪽이 무한히 열려 있다** — 그래서 표준편차
//   σ_D = −0.1 mm 가 `−0.1 ≤ 1` 을 만족해 **합격 판정**을 받고 「N개 중 M개 충족」에 계상됐다.
//   음수 표준편차는 존재할 수 없다. 표시 문제가 아니라 **판정 결함**이다.
//
//   🔴 A14 는 이것을 못 잡는다. A14 가 보는 것은 「NaN·Infinity·발산 0건」이고,
//      −0.1 은 **유한하다**. 「유한하지만 물리적으로 불가능한 값」은 아무도 보지 않았다.
//      23만 조합 스윕을 돌리고도 못 잡은 이유가 그것이다.
//
// 왜 정규식이 아니라 모듈을 실제로 불러오는가:
//   합격창(`pass`)과 정의역(`quantity()` 의 `validRange`)은 **다른 파일의 다른 상수**에서 오고,
//   `validRange` 는 계산식 안에서 만들어지는 경우도 있다(패키징의 여유 출력이 그렇다).
//   문자열로 세면 「선언했다고 적힌 것」을 셀 뿐 **실제로 닫혔는지**는 알 수 없다.
//   이 프로젝트에서 부분문자열 검사는 이미 6번 사고를 냈다. 그래서 vite 로 실제 모듈을 적재하고
//   `spec.outputs` · `spec.compute()` 를 **돌려서** 판정한다.
//
// 검사 (둘 다 치명):
//   W1 「열린 쪽 정의역 미선언」
//        role: 'judge' + 편측 창(min 또는 max 하나뿐) 인 출력은
//        **열린 쪽**이 유한한 `validRange` 경계로 닫혀 있어야 한다.
//        `pass: { max }` → 아래가 열림 → `validRange[0]` 이 닫아야 한다.
//        `pass: { min }` → 위가  열림 → `validRange[1]` 이 닫아야 한다.
//        ±Infinity 와 ±Number.MAX_VALUE 는 **닫은 것이 아니라 말하지 않은 것**으로 본다.
//
//   W2 「불가능한 합격 도달」
//        결정론 스윕에서 **물리층이 정의역 이탈(`q.outOfRange`)로 표시한 값**을
//        **판정이 합격으로 계상**하면 실패. W1 을 통과해도 여기서 걸릴 수 있다 —
//        wafer 의 σ_D 가 정확히 그 경우다(validRange 는 [0, 10] 로 옳게 선언돼 있는데도
//        `evaluate()` 가 그것을 보지 않아 −0.1 mm 가 합격으로 세어졌다).
//
//        🔴 W2 는 합격 여부를 **직접 다시 계산하지 않는다.** 화면이 실제로 쓰는 판정 함수
//           `evaluate()` 를 그대로 부른다. 게이트가 판정 규칙을 따로 베껴 두면 둘이 어긋나고,
//           그러면 게이트는 **자기가 상상한 앱**을 검사하게 된다. 그래서 진짜 판정관에게 묻는다.
//           덕분에 고칠 자리도 열려 있다 — 합격창을 닫든, `evaluate()` 가 정의역을 보게 하든,
//           **판정이 불가능한 값을 합격시키지 않게 되면** 이 게이트는 자동으로 초록이 된다.
//
// 🔴 이 게이트는 합격창의 숫자를 고치라고 요구하지 않는다. 합격창 이동은 PLN 대조 사항이다(D-041).
//    W2 가 걸리면 고칠 자리는 ① 물리층 정의역 ② `validRange` ③ (그래도 남으면) PLN 판정이다.

import { createServer } from 'vite';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
/* 🔴 스윕 공용 상수 정본. 종전에는 이 파일이 SWEEP_SEED·CORNER_PARAM_LIMIT 를 따로 들고 있었고,
 *    `check-live-judgment` 신설 때 그대로 복제되어 check-constants R1 2건이 났다(정본이 둘). */
import { SWEEP_SEED, CORNER_PARAM_LIMIT } from './lib/sweep-constants.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const LABS_INDEX = join(APP, 'src', 'models', 'labs', 'index.ts');

/** 「경계를 말하지 않았다」로 보는 값. 무한대와 부동소수 최대값. */
function isUndeclaredBound(b) {
  return !Number.isFinite(b) || Math.abs(b) >= Number.MAX_VALUE;
}

/**
 * 스윕 표본 수(랩당). 결정론 LCG 로 뽑으므로 매 실행 같은 조합을 본다(A14-1).
 * 🔴 **이 게이트 고유의 값이다 — 공용 정본으로 빼지 않았다.** 여기 4000 은
 *    「희귀 위반(불가능한 합격)을 찾는 탐색 예산」이라 줄이면 **탐지력이 직접 깎인다.**
 *    `check-live-judgment` 의 표본 수는 「관측 예산」이라 줄어도 판정이 보류될 뿐이다.
 *    이름이 같았을 뿐 개념이 달라 이름을 갈랐다(자세한 근거: `lib/sweep-constants.mjs` 말미).
 */
const SAMPLES_PER_LAB = 4000;

const errors = [];
const fail = (m) => errors.push(m);

if (!existsSync(LABS_INDEX)) {
  console.log('⚠️  src/models/labs/index.ts 가 없습니다 — 미착수로 보고 통과시킵니다.');
  process.exit(0);
}

const server = await createServer({
  root: APP,
  configFile: join(APP, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

let specCount = 0;
let outputCount = 0;
let judgeCount = 0;
let oneSidedCount = 0;
let bothSidedCount = 0;
let displayCount = 0;
let computeThrows = 0;

try {
  // 🔴 순서 의존 — registry 를 labs 보다 **먼저** 적재해야 등급 리졸버가 설치된다.
  //    (`contract.ts` 는 리졸버가 없으면 조용히 넘어가지 않고 던진다.)
  await server.ssrLoadModule('/src/models/registry.ts');
  const labsMod = await server.ssrLoadModule('/src/models/labs/index.ts');
  labsMod.registerAllLabs();
  const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');

  let seed = SWEEP_SEED;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;

  for (const key of specMod.registeredLabKeys()) {
    const [processId, stage] = key.split('/');
    const spec = specMod.labSpec(processId, stage);
    if (!spec) continue;
    specCount++;

    /** 이 랩에서 감시할 편측 판정 출력. */
    const watched = [];

    for (const o of spec.outputs) {
      outputCount++;
      if (o.role !== 'judge') { displayCount++; continue; }
      judgeCount++;
      const hasMin = !!o.pass && o.pass.min !== undefined;
      const hasMax = !!o.pass && o.pass.max !== undefined;
      if (hasMin && hasMax) { bothSidedCount++; continue; }
      if (!hasMin && !hasMax) continue;   // `pass` 자체가 없는 판정은 check-labs 2번이 잡는다
      oneSidedCount++;
      watched.push({ output: o, openSide: hasMax ? 'low' : 'high' });
    }

    if (watched.length === 0) continue;

    // ── W1 · W2 를 위해 compute 를 한 번 돌려 validRange 를 읽는다 ────────────────
    const initial = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
    let baseline;
    try {
      baseline = spec.compute(initial);
    } catch (e) {
      fail(`[W0] ${key}: 기본값에서 compute() 가 던집니다 — ${e?.message ?? e}`);
      continue;
    }

    for (const w of watched) {
      const q = baseline[w.output.id];
      if (!q) {
        fail(`[W0] ${key} / ${w.output.id}: compute() 가 이 출력을 돌려주지 않습니다.`);
        continue;
      }
      const [lo, hi] = q.validRange;
      const openBound = w.openSide === 'low' ? lo : hi;
      w.validRange = q.validRange;
      if (isUndeclaredBound(openBound)) {
        const side = w.openSide === 'low' ? '아래' : '위';
        const windowText = JSON.stringify(w.output.pass);
        fail(
          `[W1] ${key} / ${w.output.id} (${w.output.ko}): 합격창 ${windowText} 는 편측이라 **${side}쪽이 열려 있는데** `
          + `정의역도 열려 있습니다 — validRange = [${lo}, ${hi}]. `
          + `열린 쪽을 유한한 경계로 닫으십시오(물리층 정의역이 1순위, quantity() 의 validRange 가 2순위). `
          + `🔴 합격창의 숫자를 바꾸는 것은 이 게이트가 요구하는 답이 아닙니다(D-041).`,
        );
      }
    }

    // ── W2 결정론 스윕 ─────────────────────────────────────────────────────────
    const watchedIds = new Set(watched.map((w) => w.output.id));
    const hits = new Map();   // outputId → { count, first }
    const visit = (inputs) => {
      let qs;
      try { qs = spec.compute(inputs); } catch { computeThrows++; return; }
      // 🔴 화면이 쓰는 판정 함수를 그대로 부른다. 규칙을 여기서 다시 쓰지 않는다.
      const verdict = specMod.evaluate(spec, Object.fromEntries(
        Object.entries(qs).map(([id, q]) => [id, q.value]),
      ));
      for (const row of verdict.outputs) {
        if (row.pass !== true || !watchedIds.has(row.id)) continue;
        const q = qs[row.id];
        if (!q || !q.outOfRange) continue;
        // 판정은 합격, 물리층은 「성립할 수 없는 값」. 둘이 동시에 참이면 안 된다.
        const w = watched.find((x) => x.output.id === row.id);
        const e = hits.get(row.id) ?? {
          count: 0,
          first: { v: q.value, inputs: { ...inputs }, validRange: q.validRange, ko: w.output.ko, pass: w.output.pass },
        };
        e.count++;
        hits.set(row.id, e);
      }
    };

    const ps = spec.params;
    if (ps.length <= CORNER_PARAM_LIMIT) {
      for (let m = 0; m < (1 << ps.length); m++) {
        visit(Object.fromEntries(ps.map((p, i) => [p.id, ((m >> i) & 1) ? p.max : p.min])));
      }
    }
    for (let n = 0; n < SAMPLES_PER_LAB; n++) {
      visit(Object.fromEntries(ps.map((p) => {
        const steps = Math.max(1, Math.round((p.max - p.min) / p.step));
        // 🔴 격자 값을 [min, max] 로 **클램프**한다. `min + n·step` 는 끝자리가 흔들려
        //    0.2 + 28×0.1 = 3.0000000000000004 처럼 상한을 1 ULP 넘는다. 실제 슬라이더는
        //    상한으로 잘라 주므로 클램프하지 않으면 **UI 에 없는 입력**으로 게이트가 실패한다.
        const raw = p.min + Math.round(rnd() * steps) * p.step;
        return [p.id, Math.min(p.max, Math.max(p.min, raw))];
      })));
    }

    for (const [id, e] of hits) {
      fail(
        `[W2] ${key} / ${id} (${e.first.ko}): 편측 합격창 ${JSON.stringify(e.first.pass)} 가 `
        + `**정의역 [${e.first.validRange[0]}, ${e.first.validRange[1]}] 를 벗어난 값을 합격으로 계상**합니다 — ${e.count}건 도달. `
        + `예: 값 ${e.first.v} · 입력 ${JSON.stringify(e.first.inputs)}. `
        + `물리층은 이 값을 outOfRange 로 표시했는데 evaluate() 가 합격을 줬습니다. `
        + `고칠 자리: ① 물리층 정의역 ② quantity() 의 validRange ③ (그래도 남으면) 합격창 — ③ 은 PLN 대조 사항입니다(D-041).`,
      );
    }
  }
} finally {
  await server.close();
}

if (errors.length > 0) {
  console.error(`\n❌ check-passwindow 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  console.error(
    `\n  분류: 판정출력 ${judgeCount}개 중 편측 ${oneSidedCount} · 양측 ${bothSidedCount} · 표시전용 ${displayCount}`,
  );
  process.exit(1);
}

console.log(
  `✅ check-passwindow 통과 — 실습 ${specCount}칸 · 출력 ${outputCount}개`
  + ` (판정 ${judgeCount} = 편측 ${oneSidedCount} + 양측 ${bothSidedCount} · 표시전용 ${displayCount})`
  + ` · 편측 ${oneSidedCount}건 전부 열린 쪽 정의역 선언됨`
  + ` · 스윕 ${SAMPLES_PER_LAB}표본/칸(시드 ${SWEEP_SEED})에서 불가능한 합격 0건`
  + (computeThrows ? ` · compute 예외 ${computeThrows}회(스윕 표본 한정)` : ''),
);
console.log(`   대상: ${relative(APP, LABS_INDEX)}`);
process.exit(0);
