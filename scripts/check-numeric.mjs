#!/usr/bin/env node
/**
 * check-numeric.mjs — 🔴 **시뮬레이터의 입출력이 계산에 의하여 오차 없이 가동되는가.**
 * (CEO 지시 2026-08-22 원문: 「시뮬레이션의 입출력 값이 **계산에 의하여 오차 없이** 가동될 것」)
 *
 * 왜 생겼나 — **수치 정확성 전용 게이트가 없었다.** `scripts/` 전수에 nan·finite·numeric·accuracy
 * 계열 검사가 0건이었고, 산발적 vitest 로만 확인하고 있었다. 예전에 UI 24칸 격자 11,995 표본에서
 * 「비유한 출력 0건」을 확인한 적이 있으나 **그것은 1회 조사였지 상시 게이트가 아니었다.**
 *
 * 🔴 **이 게이트는 재기만 한다. 고치지 않는다.** 물리값·수식·임계에 손대지 않으며,
 *    결함을 찾아도 목록으로 내놓을 뿐이다(D-045 · CEO 판정 대기).
 * 🔴 **차단하지 않는다.** 결함이 있어도 종료코드 0 이다 — 실측을 보고 CEO 가 차단 여부를 정한다.
 *    `--strict` 를 주면 그때 exit 1 이 된다. `verify.mjs` 는 무인자로 부르므로 계측 모드다.
 *    종료코드 2 는 **게이트 자신이 못 돌았을 때**(계측 실패)만이다 — 「0건 통과」와 「아무것도
 *    못 봤다」는 다른 명제다.
 *
 * 검사 5종:
 *   N1 비유한값   전 24칸 격자 스윕에서 NaN·±Infinity 가 **화면 도달 경로**에 하나도 없을 것
 *                 (출력값 · evaluate 판정 · 씬 매핑 · 차트 좌표 · 정지 안내의 한계값)
 *   N2 경계·발산  각 슬라이더 min·max·0 근방에서 발산·0으로 나누기 없을 것
 *   N3 왕복 정확성 화면 서식기(`format.ts#formatJudged`)가 낸 문자열이 판정을 뒤집지 않을 것.
 *                 부등호 표기(`> 35`)·자릿수 +1 상향은 **모순이 아니다** — 다만 「표기로 해소」로 따로 센다.
 *   N4 단위 환산  왕복 환산이 유효자릿수 안에서 값을 복원할 것
 *   N5 판정 경계  합격 임계 **바로 위·아래**(±8 ULP)에서 판정이 일관될 것
 *
 * 🔴 **도달가능 / 계측전용 분리(AC-N9).** 화면 입력기는 `<input type="range" step>` 하나뿐이라
 *    학습자는 `min + k·step` 밖의 값을 만들 수 없다. 그런데 격자층 ①~⑤ 는 `step` 을 **쓰지 않아**
 *    (균등 분할·연속 난수) 학습자가 못 만드는 입력까지 센다. 그래서 ⑥ **슬라이더 격자층**을 더하고,
 *    모든 결함을 「도달가능 / 계측전용」으로 갈라 **나란히** 찍는다.
 *    🔴 가른 것은 **보고**뿐이다 — 총계는 깎지 않는다. 도달가능이 0건이어도 위반 건수는 총계 그대로다.
 *
 * TS 적재는 `check-passwindow.mjs` 의 정본 패턴을 그대로 따른다 —
 * vite `createServer` + `ssrLoadModule`, **`registry` 를 `labs` 보다 먼저.**
 *
 * 사용:
 *   node scripts/check-numeric.mjs            계측(항상 exit 0, 계측 실패만 2)
 *   node scripts/check-numeric.mjs --strict    결함이 있으면 exit 1
 *   node scripts/check-numeric.mjs --json      요약을 JSON 으로도 찍는다(자체검증용)
 */

import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { runNumericChecks, formatFindings, NUMERIC_GRID, BOUNDARY_ULP_SPAN, DIVERGENCE_FACTOR } from './lib/numeric-core.mjs';
import { SWEEP_SEED, CORNER_PARAM_LIMIT } from './lib/sweep-constants.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const LABS_INDEX = join(APP, 'src', 'models', 'labs', 'index.ts');
const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');
/**
 * 🔴 난수층 표본 수 축소 — **자체검증 픽스처 전용**이다. 무인자 실행은 정본 예산을 쓴다.
 *    픽스처가 이 게이트를 **끝에서 끝까지** 한 번 돌려 봐야 하는데(vite 적재·실제 24칸 포함),
 *    정본 예산으로는 그때마다 30초가 더 든다. 정확성이 아니라 **비용**만 줄이는 손잡이다.
 */
const RANDOM_ARG = process.argv.find((a) => a.startsWith('--random='));
if (RANDOM_ARG) {
  const n = Number(RANDOM_ARG.slice('--random='.length));
  if (!Number.isInteger(n) || n < 0) {
    console.error(`⚠️  --random 값이 음이 아닌 정수가 아니다: ${RANDOM_ARG}`);
    process.exit(2);
  }
  NUMERIC_GRID.randomPoints = n;
}

/** 🔴 계측 실패는 「통과」가 아니다. 수치 없이 2 로 죽는다. */
function instrumentFailed(msg) {
  console.error(`⚠️  check-numeric 계측 실패 — ${msg}`);
  console.error('   「0건 통과」와 「아무것도 못 봤다」는 다른 명제다. 수치를 내지 않고 멈춘다.');
  process.exit(2);
}

if (!existsSync(LABS_INDEX)) {
  console.log('⚠️  src/models/labs/index.ts 가 없습니다 — 미착수로 보고 통과시킵니다.');
  process.exit(0);
}

console.log('check-numeric — 「입출력이 계산에 의하여 오차 없이 가동되는가」를 잽니다');

const server = await createServer({
  root: APP,
  configFile: join(APP, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

let result;
let conversionMeta = [];
try {
  // 🔴 적재 순서 의존 — `registry` 를 `labs` 보다 **먼저**. 리졸버가 없으면 `contract.ts` 가 던진다.
  await server.ssrLoadModule('/src/models/registry.ts');
  const labsMod = await server.ssrLoadModule('/src/models/labs/index.ts');
  labsMod.registerAllLabs();
  const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');
  const contractMod = await server.ssrLoadModule('/src/models/contract.ts');
  const formatMod = await server.ssrLoadModule('/src/lib/format.ts');
  const unitsMod = await server.ssrLoadModule('/src/models/physics/units.ts');
  const metalUnitsMod = await server.ssrLoadModule('/src/models/physics/metal/units.ts');
  const siMod = await server.ssrLoadModule('/src/models/physics/siDefinitions.ts');

  const keys = specMod.registeredLabKeys();
  if (!keys.length) instrumentFailed('등록된 실습 칸이 0개다 — registerAllLabs() 가 안 돌았다.');

  const specs = [];
  for (const key of keys) {
    const [processId, stage] = key.split('/');
    const spec = specMod.labSpec(processId, stage);
    if (!spec) instrumentFailed(`labSpec("${processId}", "${stage}") 가 undefined 다 — 레지스트리가 깨졌다.`);
    specs.push({ key, spec });
  }

  /* ───── N4 왕복 환산 대상 ─────
   * 🔴 저장소에 **단위 환산 「함수」는 사실상 없다** — 전부 상수를 곱/나누는 인라인 식이다.
   *    그래서 함수 짝이 아니라 **상수 짝(`*k` ↔ `/k`)** 으로 잰다. 그리고 **두 순서를 모두** 잰다:
   *    실측(2026-08-22) 결과 `x/1000 → *1000` 은 20만 점 전부 정확히 복원되는데
   *    `x*1000 → /1000` 은 4,401회 어긋났다. **곱·나눗셈 순서가 결과를 바꾼다.**
   */
  const U = unitsMod;
  const M = metalUnitsMod;
  const MUL_CONSTS = [
    ['NM_PER_UM (µm↔nm)', U.NM_PER_UM],
    ['ANGSTROM_PER_NM (nm↔Å)', U.ANGSTROM_PER_NM],
    ['MM_PER_CM (cm↔mm)', U.MM_PER_CM],
    ['MM2_PER_CM2 (cm²↔mm²)', U.MM2_PER_CM2],
    ['CM3_PER_M3 (m³↔cm³)', U.CM3_PER_M3],
    ['SECONDS_PER_MINUTE (min↔s)', U.SECONDS_PER_MINUTE],
    ['MINUTES_PER_HOUR (h↔min)', U.MINUTES_PER_HOUR],
    ['A_PER_MA (mA↔A)', U.A_PER_MA],
    ['PERCENT (비율↔%)', U.PERCENT],
    ['NM_PER_M (m↔nm)', M.NM_PER_M],
    ['UM_PER_M (m↔µm)', M.UM_PER_M],
    ['MM_PER_M (m↔mm)', M.MM_PER_M],
    ['CM_PER_M (m↔cm)', M.CM_PER_M],
    ['PA_PER_KPA (kPa↔Pa)', M.PA_PER_KPA],
    ['PA_PER_MPA (MPa↔Pa)', M.PA_PER_MPA],
    ['RAD_PER_REV (rev↔rad)', M.RAD_PER_REV],
  ];
  for (const [name, k] of MUL_CONSTS) {
    if (typeof k !== 'number' || !Number.isFinite(k)) instrumentFailed(`환산 상수 ${name} 를 읽지 못했다 (= ${k}).`);
  }

  // 표본 — 실습이 실제로 다루는 크기대(10⁻⁶ ~ 10⁹)를 로그 균등으로 훑고, 정수·소수 대표값을 더한다.
  const convSamples = [];
  for (let e = -6; e <= 9; e++) for (let m = 1; m < 10; m++) convSamples.push(m * Math.pow(10, e));
  convSamples.push(0.1, 0.2, 0.3, 1 / 3, 2.51e-3, 273.15, 1273.15, 1.35, 0.28, 193);

  const conversions = [];
  for (const [name, k] of MUL_CONSTS) {
    // 🔴 두 순서를 모두 잰다. 「곱하고 나누기」와 「나누고 곱하기」는 다른 연산이다.
    conversions.push({ name: `${name} ×then÷`, forward: (x) => x * k, backward: (y) => y / k, samples: convSamples, significantDigits: 12 });
    conversions.push({ name: `${name} ÷then×`, forward: (x) => x / k, backward: (y) => y * k, samples: convSamples, significantDigits: 12 });
  }
  // 🔴 **덧셈 환산은 성격이 다르다**(가림/cancellation). 유일한 덧셈 환산인 °C↔K 를 따로 잰다.
  //    역방향(K→°C) 코드는 저장소에 **없다** — 그래서 이것은 「코드의 왕복」이 아니라
  //    「환산이 원리적으로 복원되는가」를 재는 합성 왕복이다. 그 사실을 이름에 적어 둔다.
  const K0 = siMod.KELVIN_AT_ZERO_CELSIUS?.value ?? siMod.KELVIN_AT_ZERO_CELSIUS;
  if (typeof K0 !== 'number' || !Number.isFinite(K0)) instrumentFailed(`KELVIN_AT_ZERO_CELSIUS 를 읽지 못했다 (= ${K0}).`);
  const wetEtchTemps = [];
  for (let t = 20; t <= 120; t += 0.25) wetEtchTemps.push(t);
  conversions.push({
    name: `KELVIN_AT_ZERO_CELSIUS (°C→K→°C · 습식식각 실사용역 20~120 °C · 합성왕복)`,
    forward: (t) => t + K0, backward: (k) => k - K0, samples: wetEtchTemps, significantDigits: 12,
  });
  conversionMeta = [{ K0, mulCount: MUL_CONSTS.length, convSamples: convSamples.length, wetEtch: wetEtchTemps.length }];

  result = runNumericChecks({
    specs,
    conversions,
    deps: {
      evaluate: specMod.evaluate,
      labSceneBindings: specMod.labSceneBindings,
      isOutOfRange: contractMod.isOutOfRange,
      OutOfLimitError: contractMod.OutOfLimitError,
      // 🔴 N3 는 **화면이 실제로 쓰는 서식기**로 잰다. `formatQuantity` 는 그 아래층이라
      //    그것만 재면 `formatJudged` 가 부등호·자릿수 상향으로 푼 것을 게이트가 못 본다.
      formatJudged: formatMod.formatJudged,
    },
  });
} catch (e) {
  await server.close();
  instrumentFailed(`${e?.name}: ${e?.message}\n${e?.stack ?? ''}`);
} finally {
  await server.close();
}

/* ───────────────────────── 보고 ───────────────────────── */

const { stats, findings } = result;
const L = stats.byLayer;
console.log(
  `  대상: ${relative(APP, LABS_INDEX)} — 실습 ${stats.cells}칸 · 슬라이더 ${stats.params}개 · 출력 ${stats.outputs}개`
  + ` (판정 ${stats.judgeOutputs}개)`,
);
console.log(
  `  격자: **${stats.samples.toLocaleString()} 표본** = 완전조합 ${L.cartesian.toLocaleString()}`
  + ` + 1D축 ${L.axis.toLocaleString()}(파라미터당 ${NUMERIC_GRID.axisPoints}점)`
  + ` + 2D쌍 ${L.pair.toLocaleString()}(${NUMERIC_GRID.pairPoints}×${NUMERIC_GRID.pairPoints})`
  + ` + 코너전수 ${L.corner.toLocaleString()}(2^n, n≤${CORNER_PARAM_LIMIT})`
  + ` + 격자사이난수 ${L.random.toLocaleString()}(칸당 ${NUMERIC_GRID.randomPoints.toLocaleString()}, 시드 ${SWEEP_SEED})`
  + ` + **슬라이더격자 ${L.stepgrid.toLocaleString()}**(1D ${NUMERIC_GRID.stepAxisPoints}점 · 2D ${NUMERIC_GRID.stepPairPoints}×${NUMERIC_GRID.stepPairPoints}, 전부 min+k·step)`
  + ` + 경계표본 ${L.boundary.toLocaleString()}`,
);
// 🔴 **표본이 곧 학습자 도달이 아니다.** 층이 아니라 값으로 판정한 실측을 남긴다.
console.log(
  `  학습자 도달 가능 표본: ${stats.reachableSamples.toLocaleString()} / ${stats.samples.toLocaleString()}`
  + ` (${((stats.reachableSamples / Math.max(stats.samples, 1)) * 100).toFixed(1)}%)`
  + ` — 나머지 ${stats.instrumentOnlySamples.toLocaleString()}점은 슬라이더로 만들 수 없는 격자 사이 값이다(계측전용).`,
);
console.log(
  `  검사한 값: 출력 ${stats.n1Values.toLocaleString()}개(N1) · N3 왕복 ${stats.n3Checked.toLocaleString()}회`
  + ` · N4 환산 ${stats.n4Checked.toLocaleString()}회 · N5 경계 ${stats.n5Checked.toLocaleString()}회(±${BOUNDARY_ULP_SPAN} ULP)`,
);
console.log(
  `  설계된 정지: 한계선 초과(OutOfLimitError) ${stats.outOfLimit.toLocaleString()}회`
  + ` · 정의역 이탈 표시(outOfRange) ${stats.outOfRange.toLocaleString()}회 — **둘 다 결함이 아니다**`,
);
console.log(`  발산 기준: 출력이 스스로 선언한 validRange 폭의 ${DIVERGENCE_FACTOR.toExponential(0)}배 (절대 임계를 쓰지 않는다)`);

// 🔴 N4 는 「0건」만 적지 않는다 — **여유가 얼마나 남았는지**를 남긴다.
const relErrs = Object.entries(stats.n4MaxRelError).sort((a, b) => b[1] - a[1]);
if (relErrs.length) {
  const [worstName, worstRel] = relErrs[0];
  console.log(`  N4 실측 최대 상대오차: ${worstRel.toExponential(3)} (${worstName}) — 허용 1e-12 · binary64 1 ULP ≈ 2.22e-16`);
}
const d = stats.n3Direction;
if (d.screenPassInternalFail || d.screenFailInternalPass) {
  console.log(
    `  N3 방향: 🔴 화면합격·내부불합격 ${d.screenPassInternalFail.toLocaleString()}건`
    + ` · 화면불합격·내부합격 ${d.screenFailInternalPass.toLocaleString()}건`,
  );
}
/* 🔴 N3 는 **항상** 두 수를 나란히 찍는다(0건이어도). 「가려서 줄인 것」이 아님을 드러내려면
 *    총계·도달가능·계측전용이 같은 줄에 있어야 한다. */
const n3Total = stats.n3Reachable + stats.n3InstrumentOnly;
console.log(
  `  N3 도달가능성: 총 ${n3Total.toLocaleString()}건`
  + ` (도달가능 ${stats.n3Reachable.toLocaleString()}건 · 계측전용 ${stats.n3InstrumentOnly.toLocaleString()}건)`
  + ` — 🔴 가른 것은 보고뿐이다. **도달가능이 0건이어도 규칙은 그대로 적용된다**(총계가 곧 위반 수다).`,
);
console.log(
  `  N3 표기로 해소: 부등호 전환 ${stats.n3ResolvedByInequality.toLocaleString()}회`
  + ` · 자릿수 +1 상향 ${stats.n3ResolvedByExtraDigit.toLocaleString()}회 (검사 ${stats.n3Checked.toLocaleString()}회 중)`
  + ` — 🔴 「결함 0건」과 「표기를 바꿔 푼 것」은 **다른 명제다.** 이 수가 크면 화면 문자열이 그만큼 부등호·상향 표기다.`,
);
console.log(
  `  N3 판정 못 한 표시 문자열: ${stats.n3TextUnparseable.toLocaleString()}회 — 되읽을 수 없는 표기(지수·특수 문자)라 대조를 못 했다.`
  + ` 🔴 이것은 「통과」가 아니라 **미계측**이다.`,
);

const total = Object.values(findings).reduce((a, f) => a + f.count, 0);
if (total === 0) {
  console.log(`\n✅ check-numeric — 결함 0건 (표본 ${stats.samples.toLocaleString()}점)`);
} else {
  console.log(`\n🔴 check-numeric — **결함 ${total.toLocaleString()}건 · 종류 ${Object.keys(findings).length}종**`);
  for (const line of formatFindings(findings)) console.log(line);
  console.log('\n  🔴 고치지 않았습니다 — 이 게이트는 재기만 합니다(CEO 지시 2026-08-22 · D-045).');
}

console.log('\n  ── 🔴 이 계측기가 못 보는 것 ──');
for (const line of [
  '① **격자 사이 값** — 완전조합은 칸당 최대 11점 해상도이고 10개짜리 칸은 3점(min·mid·max)뿐이다.',
  '   난수 20,000점/칸이 사이를 메우지만 **연속체를 덮지는 못한다.** 좁은 구간의 특이점은 지나칠 수 있다.',
  '   (다만 **학습자 도달 가능 집합은 연속체가 아니다** — ⑥ 슬라이더 격자층이 min+k·step 만 훑는다.',
  '   ①~⑤ 에서만 잡히는 결함은 「계측전용」으로 갈라 찍는다.)',
  '①b **슬라이더 격자층도 전수는 아니다** — 축당 101점·쌍당 11×11 로 솎는다. step 이 잘아 격자점이',
  '   101개를 넘는 슬라이더(예: 0~100 · step 0.1 → 1,001점)는 **10점 중 1점만** 밟는다. 그리고',
  '   3개 이상 슬라이더를 동시에 움직인 조합은 안 본다(1D·2D 까지만). **도달가능 0건 ≠ 학습자에게 안전**이다.',
  '①c **슬라이더 밖 입력 경로** — 키보드 방향키·`<input type=number>`·URL 복원·저장된 프리셋이',
  '   step 밖의 값을 넣을 수 있는지는 안 본다. 도달 가능성 판정은 `range` 의 step 규칙만 전제한다.',
  '② **애니메이션 중간 프레임** — `compute()` 의 한 시점만 잰다. GL 씬이 시간축으로 보간하는 중간값',
  '   (`renderer.ts` 의 rAF 루프)은 이 게이트를 지나간다. 씬은 `map()` 출력만 검사했다.',
  '③ **부동소수 누적오차** — 단발 계산만 잰다. 같은 값을 반복 갱신하며 쌓이는 드리프트는 대상 밖이다',
  '   (결정론 자체는 `tests/unit/a14-accuracy.test.ts` 의 200회 반복이 따로 고정한다).',
  '④ **실제 DOM 픽셀** — 값이 화면 「경로」에 닿는 것까지만 본다. 브라우저가 그 문자열·SVG 를 어떻게',
  '   그리는지는 안 본다. `check-overflow`·`check-a6b`(playwright)가 보는 영역이다.',
  '⑤ **판정 임계값이 옳은가** — 임계가 **일관되게** 적용되는지만 본다. 그 숫자가 맞는지는 PLN 소관이다(D-041).',
  '⑥ **역함수가 없는 환산** — `overdriveToMil`(클램프로 정보 소실) · Ω·m→µΩ·cm · rad→° · nm²→cm² ·',
  '   m⁻³→cm⁻³ 는 **왕복이 원리적으로 불가능**해 N4 대상이 아니다. Torr·mTorr·sccm·slm 은 SI 환산 자체가 없다.',
  '⑦b **되읽을 수 없는 표시 문자열** — 지수·특수 표기(`4.0×10¹⁸`)는 `Number(text)` 가 NaN 이라',
  '   N3 대조를 못 한다. 위 「판정 못 한 표시 문자열」 수가 그 건수다 — **미계측이지 통과가 아니다.**',
  '⑧ **LCG 난수의 저품질 하위비트** — 저장소 공용 시드 규약을 따르느라 LCG 를 쓴다. 고차원 격자에서',
  '   난수점이 초평면에 몰리는 성질이 있어, 난수층의 실효 커버리지는 표본 수보다 낮다.',
]) console.log('  ' + line);

if (AS_JSON) {
  console.log('\n' + JSON.stringify({
    samples: stats.samples, cells: stats.cells, params: stats.params, outputs: stats.outputs,
    byLayer: stats.byLayer,
    reachableSamples: stats.reachableSamples, instrumentOnlySamples: stats.instrumentOnlySamples,
    n3Total: n3Total, n3Reachable: stats.n3Reachable, n3InstrumentOnly: stats.n3InstrumentOnly,
    n3ResolvedByInequality: stats.n3ResolvedByInequality, n3ResolvedByExtraDigit: stats.n3ResolvedByExtraDigit,
    n3TextUnparseable: stats.n3TextUnparseable,
    findings: Object.fromEntries(Object.entries(findings).map(([k, f]) => [k, f.count])),
    findingsReach: Object.fromEntries(Object.entries(findings).map(([k, f]) => [k, { reachable: f.reachable, instrumentOnly: f.instrumentOnly }])),
    total, conversionMeta,
  }));
}

if (STRICT && total > 0) {
  console.error(`\n❌ check-numeric 실패 (--strict · 결함 ${total.toLocaleString()}건)`);
  process.exit(1);
}
process.exit(0);
