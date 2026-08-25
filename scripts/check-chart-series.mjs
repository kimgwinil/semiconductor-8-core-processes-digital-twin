#!/usr/bin/env node
// check-chart-series.mjs — 🔴 「차트는 계열을 조용히 버리지 않는다」 게이트.
//
// 왜 이 게이트가 생겼나 (2026-08-21 실측 사고):
//   세 차트가 전부 계열을 **3개까지만** 그리고 있었다. `LabCharts.tsx` 는
//   `[...series, ...refSeries]` 로 **규격선을 배열 끝**에 붙이므로, 상한은 언제나
//   **판정선부터** 먹었다. 제품 안의 차트 6개가 **전부** 4계열 이상이었고,
//   잘려 나간 계열 11개는 **하나도 빠짐없이 규격선·합격창**이었다.
//   「판정은 이 차트에서 합니다」 배지를 단 차트가 **합격창 없이** 그려졌다.
//
//   🔴 아무도 못 잡은 이유 — `check-wiring` W6-4 는 **바인딩 데이터**(`c.refLines`)만 본다.
//      선언이 옳은지는 보지만 **그것이 화면까지 도달하는지는 보지 않는다.**
//      실제로 W6-4 는 「refLines 가 합격창 경계와 정확히 일치한다」까지 확인하고 통과시켰다.
//      데이터 계약은 완벽했고, 렌더러가 그것을 조용히 버렸다.
//      그리고 `truncatedNote()` 는 경고하라고 만들어 뒀는데 **호출 0건**이었다.
//
//   🔴 전수 grep 도 못 잡았다 — 절단 6곳 중 1곳(`BarChart` 의 `nSeries`)은
//      `slice(0, 3)` 이 아니라 **`Math.min(3, …)`** 로 적혀 있었다. 상한은 여러 철자로 쓸 수 있다.
//
// 그래서 **철자가 아니라 결과**를 본다:
//   부분문자열 검사를 쓰지 않는다(이 프로젝트에서 부분문자열 검사는 이미 사고를 냈다 —
//   check-wiring 머리주석 참조). 차트 컴포넌트를 **실제로 렌더해서 세어 본다.**
//
// 검사 (둘 다 치명):
//   C1 「계열 유실」   각 차트 컴포넌트에 계열 N = 1..MAX_PROBE 개를 넣고 렌더해
//                      **그려진 표식 수가 N 과 함께 1씩 증가**하는지 본다.
//                      상수 장식(축선 등)이 섞여도 **증분**을 보므로 영향받지 않는다.
//                      어떤 N 에서 증분이 멈추면 = 거기가 상한이다 → 실패.
//   C2 「규격선 미도달」실제 등록된 실습 차트 바인딩마다
//                      `build()` 계열 수 + `refLines` 수 = **필요 계열 수**를 구하고,
//                      그 수만큼 렌더했을 때 전부 그려지는지 본다.
//                      C1 이 구조를, C2 가 **실제 데이터**를 지킨다.
//
// 종료코드: 0 통과 · 1 판정 실패 · 2 실행 오류(계측기 고장 — 판정 실패와 구분한다)
//
// 🔴 이 게이트는 **픽셀을 보지 않는다.** SSR 마크업의 표식 수를 센다.
//    CSS 로 숨기거나 화면 밖으로 밀어내는 유실은 못 잡는다 — 그것은 `check-overflow` 계열의 일이다.
//    여기가 막는 것은 **컴포넌트가 계열을 아예 그리지 않는 것** 하나다.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 🔴 `--chart-root=<APP 기준 경로>` 는 **픽스처 전용 주입구**다(2026-08-22 신설).
 *
 * 왜 필요한가: 이 게이트는 오늘까지 **자체검증 픽스처가 없는 마지막 게이트**였다
 * (`selftest-gates` 실측 — 「미검증 게이트: check-chart-series」). 픽스처가 없으면
 * 「통과」가 위반이 없어서인지 못 봐서인지 증명되지 않는다. 실제로 이 게이트를 만들 때
 * 표식을 잘못 세어 **상한이 살아 있는 트리에 ✅ 를 낸 오탐**이 있었다(PROBES.BarChart 주석).
 *
 * 🔴 주입을 **실트리(`src/viz/chart/**`)에 하지 않는다.** 2026-08-21 에 자체검증 픽스처가
 *    실파일을 건드렸다가 주입본이 남아 등급 원장이 오염됐다. 같은 경로를 반복하지 않는다.
 *    대신 차트 컴포넌트를 읽어 올 **디렉터리만** 갈아 끼운다. vite 뿌리는 APP 그대로라
 *    `node_modules`·`vite.config.ts` 해석이 실제와 완전히 같다.
 *
 * ⚠️ **정직한 한계:** 이 주입구는 **C1 만** 검증한다. C2 는 실제 등록된 실습 명세와
 *    등급 리졸버가 필요해 미니 트리로 재현할 수 없다 — 픽스처 모드에서는 **건너뛴다고 찍는다.**
 *    조용히 통과시키지 않는다.
 */
const chartRootArg = process.argv.find((a) => a.startsWith('--chart-root='));
const CHART_DIR = chartRootArg ? chartRootArg.slice('--chart-root='.length) : '/src/viz/chart';
const IS_FIXTURE = Boolean(chartRootArg);

/** 몇 계열까지 넣어 보는가. 제품 최대(6계열)보다 넉넉히 잡는다. */
const MAX_PROBE = 8;

const errors = [];
const notes = [];

/** 문자열에서 겹치지 않게 세기. */
function count(hay, needle) {
  let n = 0;
  let i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j < 0) return n;
    n++;
    i = j + needle.length;
  }
}

/* ─────────────── 차트별 「N 계열짜리 props」 만들기 + 표식 세는 법 ─────────────── */

const PROBES = {
  LineChart: {
    props: (n) => ({
      series: Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        label: `SER_${i}`,
        points: [{ x: 0, y: i + 1 }, { x: 1, y: i + 2 }],
        dashed: i % 2 === 1,
      })),
      xLabel: 'x', yLabel: 'y', showLegend: true,
    }),
    // 계열은 <path> 로 그린다. 축·눈금은 <line>/<text> 라 섞이지 않지만,
    // 혹시 장식 path 가 생겨도 **증분**을 보므로 안전하다.
    marks: (html) => count(html, '<path'),
  },
  ProfileChart: {
    props: (n) => ({
      series: Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        label: `SER_${i}`,
        points: [{ depth: 0, value: i + 1 }, { depth: 1, value: i + 2 }],
        dashed: i % 2 === 1,
      })),
      depthLabel: 'd', valueLabel: 'v', showLegend: true,
    }),
    marks: (html) => count(html, '<path'),
  },
  BarChart: {
    props: (n) => ({
      // 그룹 1개 · 값 n 개 → 막대 n 개 + 범례 n 개.
      groups: [{ category: 'C', values: Array.from({ length: n }, (_, i) => i + 1) }],
      seriesLabels: Array.from({ length: n }, (_, i) => `SER_${i}`),
      yLabel: 'y',
    }),
    /* 🔴 **막대를 센다. 범례를 세면 안 된다.**
     *
     * 2026-08-21 — 이 게이트를 만들 때 처음에는 범례 라벨(`>SER_i<`)을 셌다.
     * 그런데 `BarChart` 의 상한은 **막대 쪽**(`nSeries = Math.min(3, …)`)에 있고
     * 범례는 별개 경로였다. 상한이 살아 있는 트리에 대고 돌렸는데 **게이트가 ✅ 를 냈다** —
     * 픽스처가 없었다면 이 오탐을 아무도 몰랐다. 「계측기를 먼저 의심한다」의 실례다.
     * **표식은 막을 대상과 같은 경로에서 세라.**
     *
     * 막대 `<rect>` 만 `<title>{범주}: {값}</title>` 을 품는다(범례 `<rect>` 에는 없다).
     * 그룹을 1개만 넣었으므로 `<title>` 수 = 그려진 막대 수 = 도달한 계열 수다. */
    marks: (html) => count(html, '<title>'),
  },
};

async function main() {
  const { createServer } = await import('vite');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');

  const server = await createServer({
    root: APP,
    configFile: join(APP, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    if (IS_FIXTURE) {
      console.log(`🔬 픽스처 모드 — 차트 컴포넌트를 ${CHART_DIR} 에서 읽습니다(실트리 아님).\n`);
    }
    const mods = {
      LineChart: (await server.ssrLoadModule(`${CHART_DIR}/LineChart.tsx`)).LineChart,
      ProfileChart: (await server.ssrLoadModule(`${CHART_DIR}/ProfileChart.tsx`)).ProfileChart,
      BarChart: (await server.ssrLoadModule(`${CHART_DIR}/BarChart.tsx`)).BarChart,
    };

    /* ───────────────────── C1 계열 유실 ───────────────────── */
    console.log('C1 「계열 유실」 — 계열을 N 개 넣으면 N 개가 그려지는가');
    const rendered = {};
    for (const [name, probe] of Object.entries(PROBES)) {
      const from = probe.from ?? 1;
      const counts = [];
      for (let n = from; n <= MAX_PROBE; n++) {
        const html = renderToStaticMarkup(createElement(mods[name], probe.props(n)));
        counts.push({ n, marks: probe.marks(html) });
      }
      rendered[name] = counts;

      const base = counts[0];
      const bad = counts.find((c) => c.marks - base.marks !== c.n - base.n);
      const shown = counts.map((c) => `${c.n}→${c.marks}`).join(' ');
      if (bad) {
        errors.push(
          `[C1] ${name}: 계열을 ${bad.n} 개 넣었는데 표식이 ${bad.marks} 개다 `
          + `(${base.n} 개일 때 ${base.marks} 개였으므로 ${base.marks + (bad.n - base.n)} 개여야 한다). `
          + `**계열이 조용히 버려지고 있다.** 측정 전체: ${shown}`,
        );
        console.log(`  ${name.padEnd(13)} ❌  ${shown}`);
      } else {
        console.log(`  ${name.padEnd(13)} ✅  ${shown}  (증분 1 유지 · 상한 없음)`);
      }
    }

    /* ───────────────────── C2 규격선 미도달 ───────────────────── */
    if (IS_FIXTURE) {
      /* 🔴 건너뛴다고 **찍는다.** 조용히 넘어가면 픽스처가 C2 까지 검증한 것처럼 보인다. */
      console.log('\nC2 「규격선 미도달」 — ⏭ 픽스처 모드라 건너뜁니다.');
      console.log('   실제 등록된 실습 명세와 등급 리졸버가 필요해 미니 트리로 재현할 수 없습니다.');
      console.log('   🔴 즉 이 실행은 **C1 만** 검증했습니다. C2 는 실트리 실행으로만 검증됩니다.');
      return;
    }
    console.log('\nC2 「규격선 미도달」 — 실제 등록된 차트가 요구하는 계열 수가 전부 그려지는가');
    // 🔴 순서 의존 — registry 를 labs 보다 먼저 적재해야 등급 리졸버가 설치된다
    //    (check-wiring · check-passwindow 와 같은 규율).
    await server.ssrLoadModule('/src/models/registry.ts');
    const labsMod = await server.ssrLoadModule('/src/models/labs/index.ts');
    labsMod.registerAllLabs();
    const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');

    const KIND_TO_COMPONENT = { line: 'LineChart', profile: 'ProfileChart', bar: 'BarChart' };
    let charted = 0;

    for (const key of specMod.registeredLabKeys()) {
      const [processId, stage] = key.split('/');
      const spec = specMod.labSpec(processId, stage);
      if (!spec) continue;
      const charts = spec.charts ?? [];
      if (charts.length === 0) continue;

      const inputs = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      let outputs = {};
      try {
        const q = spec.compute(inputs);
        outputs = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.value]));
      } catch (e) {
        notes.push(`${key}: compute() 가 던져 출력값 없이 build() 를 호출한다 (${e.message}). W6-5 소관이라 여기서는 판정하지 않는다.`);
      }

      for (const c of charts) {
        charted++;
        const componentName = KIND_TO_COMPONENT[c.kind];
        if (!componentName) {
          errors.push(`[C2] ${key} / '${c.id}': 알 수 없는 kind '${c.kind}' — 이 게이트가 대응 컴포넌트를 모른다. 게이트를 갱신하라.`);
          continue;
        }
        let dataSeries;
        try {
          dataSeries = c.build(inputs, outputs).length;
        } catch (e) {
          notes.push(`${key} / '${c.id}': build() 가 던졌다 (${e.message}). W6-5 소관.`);
          continue;
        }
        // 🔴 LabCharts.tsx 가 `[...series, ...refSeries]` 로 합쳐 넘긴다. 규격선이 **뒤**에 온다.
        //    bar 는 refLines 를 계열로 합치지 않는다(LabCharts 는 groups 만 넘긴다).
        const refs = c.kind === 'bar' ? 0 : (c.refLines ?? []).length;
        const need = dataSeries + refs;

        const probe = PROBES[componentName];
        const html = renderToStaticMarkup(createElement(mods[componentName], probe.props(need)));
        const got = probe.marks(html);
        const judges = (c.judgesOutputs ?? []).length > 0;

        if (got < need) {
          errors.push(
            `[C2] ${key} / 차트 '${c.id}'${judges ? ' (판정 차트)' : ''}: 필요 계열 ${need} 개`
            + `(데이터 ${dataSeries} + 규격선 ${refs})인데 **${got} 개만 그려진다 — ${need - got} 개 유실.** `
            + `규격선은 배열 끝에 붙으므로 **판정선부터 사라진다.**`,
          );
          console.log(`  ${key} / ${c.id}  ❌  필요 ${need} · 도달 ${got}`);
        } else {
          console.log(`  ${key} / ${c.id}  ✅  필요 ${need}(데이터 ${dataSeries} + 규격선 ${refs}) · 도달 ${got}${judges ? ' · 판정 차트' : ''}`);
        }
      }
    }
    console.log(`\n  실습 칸 ${specMod.registeredLabKeys().length} 개 중 차트 보유 칸의 차트 ${charted} 개를 검사했다.`);
  } finally {
    await server.close();
  }
}

try {
  await main();
} catch (e) {
  console.error('🔴 게이트 실행 오류 — **판정 실패가 아니다**(종료코드 2). 계측기가 고장났다:');
  console.error(e?.stack ?? e);
  process.exit(2);
}

if (notes.length > 0) {
  console.log('\n참고(판정 아님):');
  for (const n of notes) console.log(`  · ${n}`);
}

if (errors.length > 0) {
  console.error(`\n🔴 차트 계열 게이트 실패 — ${errors.length}건`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log('\n✅ check-chart-series 통과 — 차트가 계열을 버리지 않는다.');
