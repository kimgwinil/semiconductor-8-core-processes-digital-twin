#!/usr/bin/env node
/**
 * 씬 13종이 라이트/다크 테마를 **픽셀로** 따라가는지 1회성 측정 프로브.
 *
 * 🔴 게이트가 아니다. `verify.mjs` 에 등재하지 않는다 — 실물 확인용 계측기다.
 *
 * 방법: vite dev 서버를 띄우고 `scripts/fixtures/theme-probe.html` 을 시스템 Chrome 으로 연다.
 *   Playwright 의 `newContext({ colorScheme })` 로 `prefers-color-scheme` 을 강제하고,
 *   같은 페이지에서 13종 × {gl, 2d} 픽셀을 뽑아 라이트/다크를 대조한다.
 *
 * 자체 검증 2건:
 *   · 양성 대조 — 두 컨텍스트의 `matchMedia` · `body background` · `--viz-*` 가 실제로 다른가.
 *   · 음성 대조 — 같은 테마로 두 번 찍었을 때의 차이(= 노이즈 바닥).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.PROBE_OUT
  ?? '/private/tmp/claude-501/-Users-kimgwonil-Desktop-CJH--/f5c8dcd6-cb24-40bc-8f5d-4c30edd66a90/scratchpad/theme-diff.json';

const SCENE_IDS = ['filmGrowth', 'plasma', 'ionTrajectory', 'polishProfile', 'stepCoverage', 'aldCycle',
  'crystalGrowth', 'aerialImage', 'probeScrub', 'waferMap', 'packageThermal', 'moistureSoak', 'shearTest'];
SCENE_IDS.push('ingotSlicing');
const MODES = ['gl', '2d'];

/** 채널 최대 절대차가 이 값 이상이면 「눈에 띄게 다른 픽셀」로 센다. */
const DIFF_THRESHOLD = 8;

const GL_ARG_SETS = [
  { label: 'default', args: ['--no-sandbox'] },
  {
    label: 'swiftshader',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl'],
  },
];

function decode(px) { return Buffer.from(px, 'base64'); }

/** 두 RGBA 버퍼의 차이 지표. */
function diffMetrics(a, b) {
  if (a.length !== b.length) return { error: `크기 불일치 ${a.length} vs ${b.length}` };
  const n = a.length / 4;
  let sumAbs = 0, maxAbs = 0, diffPx = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      sumAbs += d;
      if (d > m) m = d;
    }
    if (m > maxAbs) maxAbs = m;
    if (m >= DIFF_THRESHOLD) diffPx++;
  }
  return {
    meanAbsDiff: sumAbs / (n * 3),
    diffPixelRatio: diffPx / n,
    maxAbsDiff: maxAbs,
  };
}

/** 알파>0 픽셀 비율과 (그 픽셀들의) 평균 밝기. 빈 캔버스와 「테마 미추종」을 가른다. */
function occupancy(buf) {
  const n = buf.length / 4;
  let nonEmpty = 0, lumSum = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] > 0) {
      nonEmpty++;
      lumSum += (buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722);
    }
  }
  return { nonEmptyRatio: nonEmpty / n, meanLuma: nonEmpty ? lumSum / nonEmpty : 0 };
}

const server = await createServer({
  root: APP,
  configFile: join(APP, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port: 0, host: '127.0.0.1' },
});
await server.listen();
const port = server.config.server.port || server.httpServer.address().port;
const URL_ = `http://127.0.0.1:${port}/scripts/fixtures/theme-probe.html`;
console.log(`vite dev  → ${URL_}`);

let browser = null;
let glArgLabel = null;

/** WebGL2 가 실제로 잡히는 인자 조합을 찾는다. */
for (const set of GL_ARG_SETS) {
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: set.args });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const ok = await pg.evaluate(() => {
    try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch { return false; }
  }).catch(() => false);
  await ctx.close();
  if (ok) { browser = b; glArgLabel = set.label; break; }
  await b.close();
  console.log(`  WebGL2 미획득 (args=${set.label}) → 다음 조합 시도`);
}
if (!browser) {
  console.log('  ⚠ 모든 인자 조합에서 WebGL2 미획득 — 2D 폴백만 측정한다.');
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: GL_ARG_SETS[0].args });
  glArgLabel = 'none(webgl2 unavailable)';
}
console.log(`chrome    → WebGL2 인자셋 = ${glArgLabel}`);

/** 한 컬러스킴 컨텍스트를 열어 13×2 를 한 바퀴(또는 두 바퀴) 훑는다. */
async function sweep(colorScheme, passes) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 600 },
    deviceScaleFactor: 1,
    colorScheme,
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`[console] ${m.text()}`); });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

  const themeInfo = await page.evaluate(() => window.__themeInfo());
  const result = [];
  for (let p = 0; p < passes; p++) {
    const pass = {};
    for (const id of SCENE_IDS) {
      for (const mode of MODES) {
        const r = await page.evaluate(([i, m]) => window.__probe(i, m), [id, mode]);
        pass[`${id}|${mode}`] = r.ok ? { ok: true, w: r.w, h: r.h, buf: decodeBuf(r.px) } : { ok: false, error: r.error };
      }
    }
    result.push(pass);
  }
  await ctx.close();
  return { themeInfo, passes: result, pageErrors };
}
// page.evaluate 결과는 node 쪽에서 디코딩한다(브라우저에는 Buffer 가 없다).
function decodeBuf(px) { return decode(px); }

const light = await sweep('light', 2);
const dark = await sweep('dark', 1);
await browser.close();
await server.close();

/* ---------------- 양성 대조 ---------------- */
console.log('\n=== 양성 대조: colorScheme 이 실제로 페이지에 먹었는가 ===');
const posKeys = ['prefersDark', 'bodyBg', 'bodyColor', 'canvasColor', 'vizSpec', 'vizInfo', 'vizSeries1', 'dpr'];
for (const k of posKeys) {
  const l = String(light.themeInfo[k]);
  const d = String(dark.themeInfo[k]);
  console.log(`  ${k.padEnd(12)} light=${l.padEnd(22)} dark=${d.padEnd(22)} ${l === d ? '⚠ 같음' : 'OK 다름'}`);
}
const positiveOk = String(light.themeInfo.prefersDark) !== String(dark.themeInfo.prefersDark)
  && String(light.themeInfo.bodyBg) !== String(dark.themeInfo.bodyBg);
console.log(`  판정: ${positiveOk ? '✅ 두 컨텍스트가 실제로 다른 테마다' : '❌ 테마 강제 실패 — 아래 측정 전부 무의미'}`);

/* ---------------- 본 측정 + 음성 대조 ---------------- */
const rows = [];
for (const id of SCENE_IDS) {
  for (const mode of MODES) {
    const key = `${id}|${mode}`;
    const L = light.passes[0][key];
    const L2 = light.passes[1][key];
    const D = dark.passes[0][key];
    const row = { sceneId: id, mode };
    if (!L.ok || !D.ok) {
      row.error = L.ok ? `dark: ${D.error}` : `light: ${L.error}`;
      rows.push(row);
      continue;
    }
    Object.assign(row, diffMetrics(L.buf, D.buf));
    const oL = occupancy(L.buf);
    const oD = occupancy(D.buf);
    row.nonEmptyRatioLight = oL.nonEmptyRatio;
    row.nonEmptyRatioDark = oD.nonEmptyRatio;
    row.meanLumaLight = oL.meanLuma;
    row.meanLumaDark = oD.meanLuma;
    const noise = L2.ok ? diffMetrics(L.buf, L2.buf) : { error: L2.error };
    row.noiseMeanAbsDiff = noise.meanAbsDiff ?? null;
    row.noiseMaxAbsDiff = noise.maxAbsDiff ?? null;
    row.noiseDiffPixelRatio = noise.diffPixelRatio ?? null;
    rows.push(row);
  }
}

const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—');
for (const mode of MODES) {
  console.log(`\n=== ${mode === 'gl' ? 'WebGL2' : 'Canvas2D 폴백'} — light vs dark (320×200, dpr=1) ===`);
  console.log('  sceneId          meanAbsDiff  diffPxRatio  maxAbsDiff  nonEmpty(L/D)      luma(L/D)        noiseMean');
  for (const r of rows.filter((x) => x.mode === mode)) {
    if (r.error) { console.log(`  ${r.sceneId.padEnd(16)} ERROR: ${r.error}`); continue; }
    console.log(`  ${r.sceneId.padEnd(16)} ${f(r.meanAbsDiff).padStart(11)}  ${f(r.diffPixelRatio).padStart(11)}  `
      + `${String(r.maxAbsDiff).padStart(10)}  ${(f(r.nonEmptyRatioLight, 2) + '/' + f(r.nonEmptyRatioDark, 2)).padStart(17)}  `
      + `${(f(r.meanLumaLight, 1) + '/' + f(r.meanLumaDark, 1)).padStart(15)}  ${f(r.noiseMeanAbsDiff).padStart(9)}`);
  }
}

console.log('\n=== 음성 대조: 같은 테마(light) 두 번 캡처 — 노이즈 바닥 ===');
const noises = rows.filter((r) => typeof r.noiseMeanAbsDiff === 'number');
console.log(`  최대 noiseMeanAbsDiff = ${f(Math.max(...noises.map((r) => r.noiseMeanAbsDiff)), 6)}`);
console.log(`  최대 noiseMaxAbsDiff  = ${Math.max(...noises.map((r) => r.noiseMaxAbsDiff))}`);
const noisy = noises.filter((r) => r.noiseMeanAbsDiff > 0);
console.log(`  0 이 아닌 항목 ${noisy.length}건${noisy.length ? ': ' + noisy.map((r) => `${r.sceneId}|${r.mode}=${f(r.noiseMeanAbsDiff, 4)}`).join(', ') : ''}`);

console.log('\n=== 차이가 없다시피 한 항목 (meanAbsDiff <= 노이즈 바닥) ===');
const floor = Math.max(0, ...noises.map((r) => r.noiseMeanAbsDiff));
for (const r of rows) {
  if (r.error || typeof r.meanAbsDiff !== 'number') continue;
  if (r.meanAbsDiff <= Math.max(floor, 1e-9)) {
    const empty = r.nonEmptyRatioLight === 0 && r.nonEmptyRatioDark === 0;
    console.log(`  ${r.sceneId}|${r.mode}  meanAbsDiff=${f(r.meanAbsDiff, 6)}  ${empty ? '← 빈 캔버스(alpha=0)' : '← 그림은 있으나 테마 무반응'}`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  canvas: { cssWidth: 320, cssHeight: 200, deviceScaleFactor: 1 },
  diffThreshold: DIFF_THRESHOLD,
  chromeArgSet: glArgLabel,
  params: null,
  positiveControl: { light: light.themeInfo, dark: dark.themeInfo, ok: positiveOk },
  pageErrors: { light: light.pageErrors, dark: dark.pageErrors },
  rows,
}, null, 2));
console.log(`\nJSON → ${OUT}`);
if (light.pageErrors.length || dark.pageErrors.length) {
  console.log(`\n페이지 에러 light=${light.pageErrors.length}건 dark=${dark.pageErrors.length}건`);
  for (const e of [...light.pageErrors, ...dark.pageErrors].slice(0, 15)) console.log('  ' + e);
}
