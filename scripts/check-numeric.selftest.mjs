#!/usr/bin/env node
/**
 * check-numeric.selftest.mjs — 🔴 **`check-numeric` 이 실제로 잡는지 증명한다.**
 *
 * CEO 지시(2026-08-22): 「일부러 `NaN` 을 흘리는 랩을 만들어 **잡히는지** 증명하라.
 *                        ⛔ 「있다고 세면서 안 돌리는」 장치 금지」
 *
 * 증명 방식 — **본체에 오염된 입력을 먹인다.** `scripts/lib/numeric-core.mjs` 는 `vite` 도
 * `src/**` 도 import 하지 않고 **주입받은 specs·deps 만** 보므로, 여기서 가짜 랩을 만들어
 * 결함을 하나씩 심고 각각이 잡히는 것을 확인할 수 있다. **실트리는 건드리지 않는다.**
 *
 * 🔴 규율(R-7c): **탐지와 오탐없음을 둘 다 갖는다.**
 *    합격만 나오는 게이트도 위반이고 불합격만 나오는 게이트도 위반이다.
 *    그래서 ⓪ 은 「깨끗한 랩에서 결함 0건」을, ①~⑤ 는 「심은 결함이 잡힌다」를 증명한다.
 *
 * 🔴 `deps` 는 **진짜 모듈**을 쓴다(가짜 `evaluate` 를 만들면 그 가짜를 검사하는 꼴이다).
 *    다만 ⑤ 는 판정기 자체의 경계 회귀를 재는 검사라, 그 자리에서만 **일부러 틀린 판정기**를 끼운다.
 *
 * 종료코드: 0 통과 · 1 증명 실패 · 2 픽스처 고장
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { runNumericChecks, NUMERIC_GRID, isStepReachable, stepAxisPoints } from './lib/numeric-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const GATE = join(HERE, 'check-numeric.mjs');

function fixtureBroken(msg) {
  console.error(`⚠️  check-numeric.selftest 픽스처 고장 — ${msg}`);
  process.exit(2);
}

/* 🔴 픽스처는 **작게** 돈다. 여기서 재는 것은 물리가 아니라 「탐지기가 켜지는가」다. */
NUMERIC_GRID.randomPoints = 40;
NUMERIC_GRID.axisPoints = 9;
NUMERIC_GRID.pairPoints = 3;

/* ───────────────────────── 진짜 deps 적재 ───────────────────────── */

const server = await createServer({
  root: APP,
  configFile: join(APP, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

let DEPS;
try {
  await server.ssrLoadModule('/src/models/registry.ts');
  const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');
  const contractMod = await server.ssrLoadModule('/src/models/contract.ts');
  const formatMod = await server.ssrLoadModule('/src/lib/format.ts');
  DEPS = {
    evaluate: specMod.evaluate,
    labSceneBindings: specMod.labSceneBindings,
    isOutOfRange: contractMod.isOutOfRange,
    OutOfLimitError: contractMod.OutOfLimitError,
    // 🔴 N3 는 화면이 실제로 쓰는 서식기로 잰다. `formatQuantity` 는 ③ 의 「옛 서식기」 재현용으로만 남긴다.
    formatJudged: formatMod.formatJudged,
    formatQuantity: formatMod.formatQuantity,
  };
  for (const [k, v] of Object.entries(DEPS)) if (typeof v !== 'function') fixtureBroken(`deps.${k} 를 적재하지 못했다 (${typeof v}).`);
} catch (e) {
  await server.close();
  fixtureBroken(`모듈 적재 실패: ${e?.name}: ${e?.message}`);
}

/* ───────────────────────── 가짜 랩 만들기 ───────────────────────── */

/** `quantity()` 를 흉내내되 **등급 원장을 타지 않는** 최소 형태. 검사기는 value·validRange·outOfRange 만 본다. */
const q = (value, validRange = [0, 100]) => ({
  modelId: 'selftest.fake', value, unit: '', grade: '경향모델', declaredGrade: '경향모델',
  kind: 'synthetic', l2Pending: true, validRange,
  outOfRange: DEPS.isOutOfRange(value, validRange[0], validRange[1], 'tolerant'),
  assumptions: [],
});

/**
 * 최소 랩 한 칸. `compute` 만 갈아 끼우면 결함을 심을 수 있다.
 * 🔴 파라미터를 2개로 둔다 — 완전조합 11²=121 점이라 픽스처가 순식간에 끝난다.
 */
function fakeSpec({ compute, outputs, scene, charts }) {
  return {
    processId: 'selftest', stage: 'lab-basic', objectiveId: 'selftest',
    titleKo: '자체검증', titleEn: 'selftest',
    params: [
      { id: 'a', ko: 'a', en: 'a', unit: '', min: 0, max: 10, step: 1, initial: 5, basis: 'selftest' },
      { id: 'b', ko: 'b', en: 'b', unit: '', min: -5, max: 5, step: 1, initial: 0, basis: 'selftest' },
    ],
    outputs, compute, scene, charts, feedback: [], tradeoffs: [],
  };
}

const OK_OUT = [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { min: 0, max: 100 }, digits: 2 }];
/** 깨끗한 계산 — 어떤 입력에서도 유한하고 합격창 안에 있다. */
const okCompute = (i) => ({ y: q(50 + i['b']) });

/* ───────────────────────── 케이스 표 ───────────────────────── */

const CASES = [];
const add = (id, desc, build, expect) => CASES.push({ id, desc, build, expect });

/** ⓪ 오탐 없음 — 깨끗한 랩에서 결함 0건. */
add('⓪', '깨끗한 랩 → 결함 0건 (오탐 없음)',
  () => ({ specs: [{ key: 'selftest/clean', spec: fakeSpec({ compute: okCompute, outputs: OK_OUT }) }] }),
  (f) => Object.keys(f).length === 0 ? null : `깨끗한 랩에서 ${Object.keys(f).join(', ')} 가 나왔다`);

/** ① 🔴 CEO 가 지목한 것 — 일부러 NaN 을 흘린다. */
add('①', '🔴 출력에 NaN 을 흘린다 → N1-nonfinite',
  () => ({ specs: [{ key: 'selftest/nan', spec: fakeSpec({ compute: (i) => ({ y: q(i['a'] > 7 ? Number.NaN : 50) }), outputs: OK_OUT }) }] }),
  (f) => f['N1-nonfinite']?.count > 0 ? null : 'NaN 출력을 잡지 못했다');

add('①b', '출력에 +Infinity 를 흘린다 → N1-nonfinite',
  () => ({ specs: [{ key: 'selftest/inf', spec: fakeSpec({ compute: () => ({ y: q(Number.POSITIVE_INFINITY) }), outputs: OK_OUT }) }] }),
  (f) => f['N1-nonfinite']?.count > 0 ? null : 'Infinity 출력을 잡지 못했다');

add('①c', '0 으로 나눠 Infinity 를 만든다(경계 표본이 정확히 0 을 밟는가) → N1-nonfinite',
  // b 의 범위가 0 을 품는다. 격자가 0 을 안 밟으면 이 케이스는 안 잡힌다 → 경계 표본의 존재 증명이기도 하다.
  () => ({ specs: [{ key: 'selftest/div0', spec: fakeSpec({ compute: (i) => ({ y: q(1 / i['b']) }), outputs: OK_OUT }) }] }),
  (f) => f['N1-nonfinite']?.count > 0 ? null : '0 으로 나누기를 잡지 못했다(경계 표본이 0 을 안 밟았을 수 있다)');

add('①d', '씬 매핑이 NaN 을 낸다 → N1-scene-nonfinite',
  () => ({ specs: [{ key: 'selftest/scene', spec: fakeSpec({
    compute: okCompute, outputs: OK_OUT,
    scene: { sceneId: 'fake', map: (i) => ({ t: i['a'] > 5 ? Number.NaN : 0.5 }) },
  }) }] }),
  (f) => f['N1-scene-nonfinite']?.count > 0 ? null : '씬 매핑의 NaN 을 잡지 못했다');

add('①e', '차트 좌표가 NaN 을 낸다 → N1-chart-nonfinite',
  () => ({ specs: [{ key: 'selftest/chart', spec: fakeSpec({
    compute: okCompute, outputs: OK_OUT,
    charts: [{ id: 'c', kind: 'line', ko: 'c', en: 'c', xKo: 'x', xEn: 'x', yKo: 'y', yEn: 'y',
      build: () => [{ id: 's', ko: 's', en: 's', points: [{ x: 0, y: 0 }, { x: 1, y: Number.NaN }] }] }],
  }) }] }),
  (f) => f['N1-chart-nonfinite']?.count > 0 ? null : '차트 좌표의 NaN 을 잡지 못했다');

add('①f', '한계선 안내가 서식 못 하는 한계값(∞)을 싣는다 → N1-limit-bound-unrenderable',
  () => ({ specs: [{ key: 'selftest/limit', spec: fakeSpec({
    compute: (i) => { if (i['a'] > 5) throw new DEPS.OutOfLimitError('a', i['a'], [0, Number.POSITIVE_INFINITY], 'µm'); return okCompute(i); },
    outputs: OK_OUT,
  }) }] }),
  (f) => f['N1-limit-bound-unrenderable']?.count > 0 ? null : '서식 불가 한계값을 잡지 못했다');

add('①g', 'compute 가 OutOfLimitError 가 아닌 예외를 던진다 → N1-compute-throw',
  () => ({ specs: [{ key: 'selftest/throw', spec: fakeSpec({
    compute: (i) => { if (i['a'] > 8) throw new TypeError('심은 예외'); return okCompute(i); }, outputs: OK_OUT,
  }) }] }),
  (f) => f['N1-compute-throw']?.count > 0 ? null : '계산 예외를 잡지 못했다');

/** ② 발산 — validRange 폭의 1e6 배를 넘긴다. */
add('②', '출력이 validRange 폭의 1e6 배를 넘어 발산 → N2-divergence',
  () => ({ specs: [{ key: 'selftest/div', spec: fakeSpec({ compute: () => ({ y: q(1e12, [0, 100]) }), outputs: OK_OUT }) }] }),
  (f) => f['N2-divergence']?.count > 0 ? null : '발산을 잡지 못했다');

add('②b', '🔴 오탐없음 — 정의역이 원래 큰 값(peakCm3 형)은 발산이 아니다',
  // 실측 회귀 방지: 절대 임계(1e15)를 쓰면 여기서 161,562건이 오탐으로 나왔었다.
  () => ({ specs: [{ key: 'selftest/bigok', spec: fakeSpec({
    compute: () => ({ y: q(4e18, [1e17, 1e21]) }),
    outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'display' }],
  }) }] }),
  (f) => !f['N2-divergence'] ? null : '큰 정의역의 정상값을 발산으로 오탐했다');

/** ③ 왕복 — 표시 자릿수 반올림이 판정을 뒤집는다. */
add('③', '🔴 서식기가 판정을 뒤집는 문자열을 낸다 → N3-display-contradicts-verdict',
  // 내부 35.04 는 max 35 초과라 **불합격**인데, digits=1 이면 화면은 "35.0" → 합격처럼 읽힌다.
  // 🔴 여기서만 서식기를 **옛 것(formatQuantity 만)** 으로 갈아 끼운다 — ⑤ 가 판정기를 갈아 끼우는 것과 같은 이유다.
  //    진짜 `formatJudged` 는 이 케이스를 자릿수 +1 상향으로 **풀어 버려서**(③c 가 그것을 증명한다)
  //    탐지기가 켜지는지를 증명할 수 없다. 이 케이스가 재는 것은 「표시층이 퇴행하면 잡히는가」다.
  () => ({
    specs: [{ key: 'selftest/round', spec: fakeSpec({
      compute: () => ({ y: q(35.04, [0, 100]) }),
      outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { max: 35 }, digits: 1 }],
    }) }],
    depsOverride: {
      formatJudged: (v, o) => ({ kind: 'value', text: DEPS.formatQuantity(v, o?.digits), digits: o?.digits, escalated: false }),
    },
  }),
  (f) => f['N3-display-contradicts-verdict']?.count > 0 ? null : '표시 반올림의 판정 뒤집힘을 잡지 못했다');

add('③c', '🔴 진짜 formatJudged 는 자릿수 +1 로 푼다 → N3 0건이되 「표기로 해소」로 센다',
  // 같은 입력(35.04 · digits 1 · max 35). `formatJudged` 는 "35.04" 로 올려 모순을 없앤다.
  // 🔴 「결함 0건」과 「표기를 바꿔 푼 것」이 **다른 명제**임을 게이트가 드러내는지 증명한다.
  () => ({ specs: [{ key: 'selftest/round-escalate', spec: fakeSpec({
    compute: () => ({ y: q(35.04, [0, 100]) }),
    outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { max: 35 }, digits: 1 }],
  }) }] }),
  (f, s) => {
    if (f['N3-display-contradicts-verdict']) return '자릿수 상향으로 해소된 것을 모순으로 오탐했다';
    if (!(s.n3ResolvedByExtraDigit > 0)) return '자릿수 상향을 세지 않았다 — 「0건」과 「표기로 해소」가 구분되지 않는다';
    return null;
  });

add('③d', '🔴 counted 는 자릿수를 못 올린다 → 부등호 표기로 해소되고 그 횟수가 남는다',
  // `mode: 'counted'` 는 셈값이라 자릿수 상향이 금지다 → `formatJudged` 가 `> 35` 로 간다.
  () => ({ specs: [{ key: 'selftest/round-ineq', spec: fakeSpec({
    compute: () => ({ y: q(35.04, [0, 100]) }),
    outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { max: 35 }, digits: 1, displayMode: 'counted' }],
  }) }] }),
  (f, s) => {
    if (f['N3-display-contradicts-verdict']) return '부등호 표기를 모순으로 오탐했다';
    if (!(s.n3ResolvedByInequality > 0)) return '부등호 전환을 세지 않았다 — 「0건」과 「표기로 해소」가 구분되지 않는다';
    return null;
  });

add('③b', '🔴 오탐없음 — 자릿수가 넉넉하면 뒤집히지 않는다',
  () => ({ specs: [{ key: 'selftest/round-ok', spec: fakeSpec({
    compute: () => ({ y: q(35.04, [0, 100]) }),
    outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { max: 35 }, digits: 4 }],
  }) }] }),
  (f) => !f['N3-display-contradicts-verdict'] ? null : '자릿수가 넉넉한데도 뒤집힘으로 오탐했다');

/** ④ 환산 — 일부러 손실을 심는다. */
add('④', '왕복 환산에 손실을 심는다(3자리 반올림) → N4-roundtrip-loss',
  () => ({
    specs: [],
    conversions: [{ name: 'lossy', forward: (x) => Math.round(x * 1000) / 1000, backward: (y) => y, samples: [1 / 3, 0.123456789], significantDigits: 12 }],
  }),
  (f) => f['N4-roundtrip-loss']?.count > 0 ? null : '환산 손실을 잡지 못했다');

add('④b', '🔴 오탐없음 — 무손실 환산(×1000 ÷1000)은 통과',
  () => ({
    specs: [],
    conversions: [{ name: 'clean', forward: (x) => x * 1000, backward: (y) => y / 1000, samples: [1, 2, 5, 0.1, 1e6], significantDigits: 12 }],
  }),
  (f) => !f['N4-roundtrip-loss'] ? null : '무손실 환산을 손실로 오탐했다');

/** ⑤ 판정 경계 — 판정기가 경계에서 어긋나면 잡는다. */
add('⑤', '🔴 판정기가 경계에서 부등호를 잘못 쓴다(>= 대신 >) → N5-boundary-inconsistent',
  () => ({
    specs: [{ key: 'selftest/edge', spec: fakeSpec({
      compute: okCompute, outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'judge', pass: { min: 10 }, digits: 2 }],
    }) }],
    // 🔴 여기서만 판정기를 갈아 끼운다 — 「경계에서 어긋나면 잡히는가」가 이 검사의 존재 이유다.
    depsOverride: {
      evaluate: (spec, outs) => ({
        pass: false,
        outputs: spec.outputs.map((o) => {
          const v = typeof outs[o.id] === 'number' ? outs[o.id] : outs[o.id]?.value;
          return { id: o.id, value: v, pass: o.pass ? v > o.pass.min : null, outOfDomain: false };
        }),
      }),
    },
  }),
  (f) => f['N5-boundary-inconsistent']?.count > 0 ? null : '경계 부등호 오류를 잡지 못했다');

add('⑤b', '🔴 tolerant 가 exact 보다 엄격해진다 → N5-tolerance-inverted',
  () => ({
    specs: [{ key: 'selftest/tol', spec: fakeSpec({
      compute: okCompute,
      outputs: [{ id: 'y', ko: 'y', en: 'y', role: 'display', domain: [0, 100] }],
    }) }],
    depsOverride: { isOutOfRange: (v, lo, hi, mode) => (mode === 'tolerant' ? v <= lo || v >= hi : v < lo || v > hi) },
  }),
  (f) => f['N5-tolerance-inverted']?.count > 0 ? null : 'tolerant/exact 역전을 잡지 못했다');

/* ───── ⑦ 도달가능 / 계측전용 분리(AC-N9) ─────
 * 🔴 화면 입력기는 `<input type="range" step=1>` 이라 학습자는 **정수만** 만들 수 있다.
 *    격자층 ①~⑤ 는 step 을 무시하므로 학습자가 못 만드는 입력에서도 결함을 센다.
 *    그 둘이 **실제로 갈리는지**를 여기서 증명한다(가르되 총계는 안 줄어드는 것까지).
 */
add('⑦', '🔴 격자점(정수 a=3)에서만 나는 결함 → 도달가능으로 센다',
  () => ({ specs: [{ key: 'selftest/reach', spec: fakeSpec({
    compute: (i) => ({ y: q(i['a'] === 3 ? Number.NaN : 50) }), outputs: OK_OUT,
  }) }] }),
  (f, s) => {
    const n = f['N1-nonfinite'];
    if (!(n?.count > 0)) return '격자점의 결함을 아예 못 잡았다';
    if (!(n.reachable > 0)) return `격자점(a=3)의 결함을 도달가능으로 세지 않았다 (도달가능 ${n.reachable})`;
    if (n.reachable + n.instrumentOnly !== n.count) return '도달가능+계측전용이 총계와 다르다 — 가르면서 건수를 잃었다';
    if (!(s.byLayer.stepgrid > 0)) return '슬라이더 격자층이 표본을 하나도 내지 않았다';
    return null;
  });

add('⑦b', '🔴 격자 사이(비정수 a)에서만 나는 결함 → 도달가능 0 · 계측전용 >0 (총계는 그대로)',
  // step=1 이라 학습자는 정수만 만든다. 비정수에서만 터지는 결함은 **학습자에게 도달하지 않는다** —
  // 그래도 총계에서 빼지 않는다. 두 수를 나란히 적을 뿐이다.
  // 🔴 `Number.isInteger` 를 쓰지 않는다 — 경계 표본의 `nextAfter(10,-1)`(=9.999999999999998)는
  //    정수가 아니지만 **격자점과 1 ULP 차이**라 도달 가능으로 세는 것이 맞다(허용오차의 존재 이유).
  //    격자에서 **의미 있게** 떨어진 값(0.01 이상)에서만 결함이 나게 심는다.
  () => ({ specs: [{ key: 'selftest/unreach', spec: fakeSpec({
    compute: (i) => ({ y: q(Math.abs(i['a'] - Math.round(i['a'])) > 0.01 ? Number.NaN : 50) }), outputs: OK_OUT,
  }) }] }),
  (f) => {
    const n = f['N1-nonfinite'];
    if (!(n?.count > 0)) return '격자 사이의 결함을 아예 못 잡았다';
    if (n.reachable !== 0) return `격자 사이 결함을 도달가능으로 오분류했다 (${n.reachable}건)`;
    if (!(n.instrumentOnly > 0)) return '계측전용으로도 세지 않았다 — 가르면서 건수를 잃었다';
    if (n.reachable + n.instrumentOnly !== n.count) return '도달가능+계측전용이 총계와 다르다';
    return null;
  });

/* ───────────────────────── 실행 ───────────────────────── */

console.log('check-numeric.selftest — 심은 결함이 실제로 잡히는지 증명합니다');
console.log(`  방식: lib/numeric-core.mjs 에 **오염된 가짜 랩**을 주입 (실트리 무접촉)`);
console.log(`  deps: 진짜 evaluate·isOutOfRange·formatJudged·OutOfLimitError`
  + ` (⑤·⑤b 만 판정기를, ③ 만 서식기를 일부러 교체)\n`);

let failed = 0;
for (const c of CASES) {
  let f;
  let st;
  try {
    const built = c.build();
    const r = runNumericChecks({
      specs: built.specs,
      conversions: built.conversions ?? [],
      deps: { ...DEPS, ...(built.depsOverride ?? {}) },
    });
    f = r.findings;
    st = r.stats;
  } catch (e) {
    await server.close();
    fixtureBroken(`케이스 ${c.id} 실행 중 예외: ${e?.name}: ${e?.message}\n${e?.stack}`);
  }
  const problem = c.expect(f, st);
  const kinds = Object.keys(f);
  if (problem) {
    failed++;
    console.log(`  ❌ ${c.id} ${c.desc}`);
    console.log(`       ${problem} · 실제 적발: [${kinds.join(', ') || '없음'}]`);
  } else {
    console.log(`  ✅ ${c.id} ${c.desc}${kinds.length ? ` · 적발: [${kinds.join(', ')}]` : ''}`);
  }
}

await server.close();

/* ───── ⑦c 도달 가능성 판정기 자체 — 진짜 `<input type="range">` 의 규칙을 재현하는가 ─────
 * 🔴 `min=0 max=10 step=3` 슬라이더는 0·3·6·9 만 낸다. **10 에는 못 닿는다.**
 *    이 규칙을 틀리면 「도달가능」 수치가 통째로 거짓이 되므로 별도로 못 박는다.
 */
const P_ODD = { id: 'x', min: 0, max: 10, step: 3, initial: 0 };
const P_TENTH = { id: 'x', min: 0.1, max: 1.1, step: 0.1, initial: 0.1 };   // 0.1 누적 — 부동소수 함정
const SPEC_ODD = { params: [P_ODD] };
const SPEC_TENTH = { params: [P_TENTH] };
const REACH_ASSERTS = [
  ['격자점 0·3·6·9 는 도달 가능', [0, 3, 6, 9].every((v) => isStepReachable(SPEC_ODD, { x: v }))],
  ['🔴 max=10 은 step 배수가 아니라 **도달 불가**', !isStepReachable(SPEC_ODD, { x: 10 })],
  ['격자 사이 4·5 는 도달 불가', ![4, 5].some((v) => isStepReachable(SPEC_ODD, { x: v }))],
  ['stepAxisPoints 가 0·3·6·9 만 낸다(10 을 끼워 넣지 않는다)',
    JSON.stringify(stepAxisPoints(P_ODD, 101)) === JSON.stringify([0, 3, 6, 9])],
  ['🔴 0.1 을 7번 더한 값(0.7999…)도 도달 가능으로 본다 — 허용오차가 부동소수 잡음을 흡수한다',
    isStepReachable(SPEC_TENTH, { x: 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 })],
  ['0.1 격자에서 0.15 는 도달 불가(허용오차가 진짜 이탈까지 삼키지 않는다)',
    !isStepReachable(SPEC_TENTH, { x: 0.15 })],
  ['stepAxisPoints 가 상한(cap)을 넘지 않는다', stepAxisPoints(P_TENTH, 3).length <= 3],
];
console.log('\n  ⑦c 도달 가능성 판정기 — `<input type="range">` 의 step 규칙을 재현하는가');
for (const [desc, ok] of REACH_ASSERTS) {
  if (ok) console.log(`  ✅ ⑦c ${desc}`);
  else { failed++; console.log(`  ❌ ⑦c ${desc}`); }
}

/* ───── ⑥ 끝에서 끝까지 — 게이트 자체를 진짜 24칸에 한 번 돌린다 ─────
 * 🔴 본체만 시험하면 「vite 적재·실제 spec 배선·보고 경로」가 증명되지 않는다.
 *    난수층만 줄여(--random) 같은 파이프라인을 그대로 태운다.
 */
console.log('\n  ⑥ 끝에서 끝까지 — 게이트를 실제 24칸에 돌린다 (--random=30 · 비용만 줄인다)');
let e2e;
try {
  const out = execFileSync('node', [GATE, '--json', '--random=30'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const last = out.trim().split('\n').at(-1);
  e2e = JSON.parse(last);
} catch (e) {
  failed++;
  console.log(`  ❌ ⑥ 게이트 실행 실패 — exit ${e?.status}: ${String(e?.stderr ?? e?.message).slice(0, 300)}`);
}
if (e2e) {
  const problems = [];
  if (e2e.cells !== 24) problems.push(`칸이 24개가 아니다 (${e2e.cells})`);
  if (!(e2e.samples > 300_000)) problems.push(`표본이 너무 적다 (${e2e.samples})`);
  if (!(e2e.params > 0 && e2e.outputs > 0)) problems.push('슬라이더·출력을 못 셌다');
  if (problems.length) {
    failed++;
    console.log(`  ❌ ⑥ ${problems.join(' · ')}`);
  } else {
    console.log(`  ✅ ⑥ 실측 ${e2e.cells}칸 · 표본 ${e2e.samples.toLocaleString()} · 슬라이더 ${e2e.params} · 출력 ${e2e.outputs}`
      + ` · 적발 ${Object.keys(e2e.findings).length}종 ${e2e.total.toLocaleString()}건`);
  }
}

const total = CASES.length + REACH_ASSERTS.length + 1;
if (failed) {
  console.error(`\n❌ check-numeric.selftest 실패 — ${total}건 중 ${failed}건이 증명되지 않았다`);
  process.exit(1);
}
console.log(`\n✅ check-numeric.selftest 통과 — ${total}건 전부 증명됨`
  + ` (탐지 ${CASES.filter((c) => !c.desc.includes('오탐없음') && c.id !== '⓪').length}건 · 오탐없음 ${CASES.filter((c) => c.desc.includes('오탐없음') || c.id === '⓪').length}건`
  + ` · 도달가능성 판정기 ${REACH_ASSERTS.length}건 · 끝에서 끝까지 1건)`);
process.exit(0);
