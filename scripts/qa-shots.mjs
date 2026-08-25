#!/usr/bin/env node
/**
 * QA 스크린샷 — CEO 확인용. dist/ 를 임시 정적 서버로 띄우고 시스템 Chrome 으로 캡처한다.
 * 콘솔 에러도 함께 수집해 화면이 「보이기만」 하는지 「동작하는지」를 가른다.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(APP, 'dist');
const OUT = join(dirname(APP), 'qa');
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8',
  '.json':'application/json;charset=utf-8', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };

const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let f = join(DIST, p);
  try { if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html'); } catch { f = join(DIST, 'index.html'); }
  try { res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const catalog = JSON.parse(readFileSync(join(APP, 'src/content/catalog.json'), 'utf8'));
const pids = Object.entries(catalog.processes).filter(([, d]) => d.status === 'active').map(([k]) => k);

const shots = [
  { name: '00-hub', route: '#/', vp: [1440, 1024] },
  ...pids.map((p) => ({ name: `10-equipment-${p}`, route: `#/p/${p}/equipment`, vp: [1440, 1024] })),
  /* 🔴 2026-08-22 — **3단계를 전부 찍는다.** 종전에는 `lab-basic` 만 찍어서
   *    `lab-applied`·`lab-advanced` 는 스크린샷 증거가 한 장도 없었다.
   *    특히 캔버스가 2개인 `deposition/lab-advanced`(씬 병치)가 통째로 빠져 있었다.
   *    `qa-sweep.mjs` 의 `STAGES` 와 커버리지를 맞춘다. */
  ...pids.flatMap((p) => ['lab-basic', 'lab-applied', 'lab-advanced']
    .map((st) => ({ name: `20-lab-${p}-${st.slice(4)}`, route: `#/p/${p}/${st}`, vp: [1440, 1024] }))),
  { name: '30-test-oxidation', route: '#/p/oxidation/test', vp: [1440, 1024] },
  { name: '40-result-oxidation', route: '#/p/oxidation/result', vp: [1440, 1024] },
  { name: '50-mobile-hub', route: '#/', vp: [390, 844] },
  { name: '51-mobile-equipment', route: '#/p/oxidation/equipment', vp: [390, 844] },
  { name: '52-tablet-equipment', route: '#/p/photo/equipment', vp: [1024, 768] },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const errors = [];
const report = [];
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.vp[0], height: s.vp[1] }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${s.name}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${s.name}: [pageerror] ${e.message}`));
    await page.goto(`${BASE}/${s.route}`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    // 🔴 `html, body { overflow-x: hidden }` 이 걸려 있으면 Playwright fullPage 캡처가
    //    첫 뷰포트 이후를 흰 여백으로 남긴다(C트랙 발견). 캡처 동안만 클리핑을 푼다.
    await page.evaluate(() => {
      document.documentElement.style.overflowX = 'visible';
      document.body.style.overflowX = 'visible';
    });
    await page.waitForTimeout(80);
    const file = join(OUT, `${s.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.evaluate(() => {
      document.documentElement.style.overflowX = '';
      document.body.style.overflowX = '';
    });
    /* 🔴 캔버스는 **전부** 따로 남긴다. fullPage 한 장에 다 들어오기는 하지만,
     *    씬이 2개인 칸에서 「어느 캔버스가 백지인가」를 그 한 장으로는 가릴 수 없다.
     *    `qa-sweep` 과 달리 여기는 판정을 하지 않는다 — 눈으로 볼 증거를 남기는 것이 전부다. */
    const canvases = await page.$$('canvas');
    const canvasFiles = [];
    for (let i = 0; i < canvases.length; i++) {
      const cf = join(OUT, `${s.name}-canvas${i}.png`);
      try { await canvases[i].screenshot({ path: cf }); canvasFiles.push(`${s.name}-canvas${i}.png`); }
      catch (e) { errors.push(`${s.name}: 캔버스[${i}] 캡처 실패 — ${e.message}`); }
    }
    const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
    report.push({ name: s.name, route: s.route, vp: s.vp.join('×'), chars: text.length,
      canvasCount: canvases.length, canvasFiles });
    await ctx.close();
  }
} finally { await browser.close(); await new Promise((r) => server.close(r)); }

console.log(`캡처 ${report.length}장 → ${OUT}`);
for (const r of report) console.log(`  ${r.name.padEnd(26)} ${r.vp.padEnd(10)} ${r.route}`);
console.log(`\n콘솔 에러 ${errors.length}건`);
for (const e of errors.slice(0, 20)) console.log('  ' + e);
writeFileSync(join(OUT, 'console-errors.txt'), errors.join('\n') || '(없음)');
