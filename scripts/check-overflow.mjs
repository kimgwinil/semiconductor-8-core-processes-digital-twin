#!/usr/bin/env node
// check-overflow.mjs — 🔴 A10. 3해상도(1440×1024·1024×768·390×844)에서
// 카탈로그의 모든 라우트(#/ · #/about · 공정×절 전수)가 가로 스크롤을 만들지 않는지 확인한다.
//
// 🔴 SKIP 은 PASS 가 아니다. 게이트가 건너뛰어지면 누가 CSS 를 건드려도 회귀를 못 막는다.
//    그래서 playwright-core(브라우저 번들 없음) + **시스템에 이미 있는 Chrome** 으로 실제 PASS 를 만든다.
//    브라우저 바이너리를 새로 내려받지 않는다.
// dist/ 가 있으면 정적 서버를 직접 띄우므로 별도 preview 실행이 필요 없다.
//
// 🔴 계측 시 `overflow-x: hidden` 을 일시 해제한다. 그러지 않으면 넘친 내용이 잘려
//    scrollWidth 가 항상 clientWidth 와 같아지고, 게이트가 무엇이든 통과시킨다.
// 🔴 2026-08-20 — html·body 만 풀면 **내부 컨테이너 클리핑**을 놓친다(사각지대였다).
//    이제 overflow-x:hidden|clip 인 요소가 자기 내용을 잘라내는지도 함께 잰다.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const CATALOG_FILE = path.join(APP_ROOT, 'src/content/catalog.json');
const DIST = path.join(APP_ROOT, 'dist');

const VIEWPORTS = [
  { width: 1440, height: 1024, label: '1440×1024' },
  { width: 1024, height: 768, label: '1024×768' },
  { width: 390, height: 844, label: '390×844' },
];

// 시스템에 이미 설치된 Chrome 계열 실행 파일 후보
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function fail(msg) { console.error(msg); }

// ---------- 1. playwright-core ----------
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('=========================================================');
  console.error('❌ playwright-core 를 찾지 못했습니다. A10 게이트를 돌릴 수 없습니다.');
  console.error('   설치: npm i -D playwright-core   (브라우저 바이너리는 내려받지 않습니다)');
  console.error('=========================================================');
  process.exit(1);
}

// ---------- 2. 브라우저 실행 파일 ----------
const executablePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('❌ 시스템에서 Chrome/Chromium 실행 파일을 찾지 못했습니다.');
  console.error('   CHROME_PATH 환경변수로 직접 지정할 수 있습니다.');
  process.exit(1);
}

// ---------- 3. 라우트 ----------
if (!existsSync(CATALOG_FILE)) {
  console.error(`❌ ${path.relative(APP_ROOT, CATALOG_FILE)} 가 없습니다.`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
const routes = ['#/', '#/about'];
for (const [pid, def] of Object.entries(catalog.processes ?? {})) {
  if (def.status !== 'active') continue;
  for (const sid of def.sections ?? []) routes.push(`#/p/${pid}/${sid}`);
}

// ---------- 4. 정적 서버 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

let server = null;
let baseUrl = process.env.PREVIEW_URL ?? null;

if (!baseUrl) {
  if (!existsSync(DIST)) {
    console.error('❌ dist/ 가 없습니다. 먼저 `npm run build` 를 실행하거나 PREVIEW_URL 을 지정하세요.');
    process.exit(1);
  }
  server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(DIST, urlPath);
    try {
      if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    } catch { file = path.join(DIST, 'index.html'); }
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`정적 서버 기동: ${baseUrl} (dist/)`);
}

// ---------- 5. 계측 ----------
const violations = [];
let checked = 0;
let browser;

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });

    for (const route of routes) {
      await page.evaluate((r) => { location.hash = r; }, route);
      // 해시 라우팅 + React.lazy 청크 로드를 기다린다
      await page.waitForFunction((r) => location.hash === r, route, { timeout: 5000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const body = document.body;
        // 🔴 `html, body { overflow-x: hidden }` 가 걸려 있으면 넘친 내용이 **잘려서**
        //    scrollWidth 가 절대 clientWidth 를 넘지 않는다 → 가로 스크롤은 없지만
        //    「내용이 안 넘친다」는 증명이 되지 않는다. 계측 동안만 클리핑을 풀고 잰다.
        const prevDe = de.style.overflowX;
        const prevBody = body.style.overflowX;
        de.style.overflowX = 'visible';
        body.style.overflowX = 'visible';
        void de.offsetWidth; // 강제 리플로우

        const cw = de.clientWidth;
        const sw = de.scrollWidth;

        // 넘친 원인 요소를 찾아 준다 — 실패 메시지가 쓸모 있으려면 필요하다.
        const offenders = [];
        if (sw > cw + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.right > cw + 1) {
              const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
              offenders.push(`${el.tagName.toLowerCase()}${cls} right=${Math.round(r.right)}`);
              if (offenders.length >= 3) break;
            }
          }
        }

        // ---------- 🔴 내부 컨테이너 클리핑 (2026-08-20 신설) ----------
        // 종전에는 html·body 의 클리핑만 풀었다. 그래서 클리핑이 **내부 컨테이너**에 걸려 있으면
        // 넘친 내용이 그 안에서 잘려 documentElement.scrollWidth 가 자라지 않고 **게이트가 통과시켰다.**
        // 「가로 스크롤이 없다」와 「내용이 안 잘린다」는 다른 명제다 — A10 이 지키려는 건 후자다.
        //
        // overflow-x 가 auto|scroll 인 요소는 **사용자가 스크롤할 수 있으므로 정당**하다. 제외한다.
        // 스크린리더 전용 유틸(.sr-only 류)은 1px 로 접어 두고 의도적으로 자르는 것이라 제외한다.
        const clipped = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') continue;
          if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;   // 시각적으로 숨긴 유틸
          const d = el.scrollWidth - el.clientWidth;
          if (d > 2) {
            const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            clipped.push(`${el.tagName.toLowerCase()}${cls} 잘린폭 ${d}px`);
            if (clipped.length >= 3) break;
          }
        }

        de.style.overflowX = prevDe;
        body.style.overflowX = prevBody;
        return { sw, cw, offenders, clipped };
      });
      checked++;
      if (m.sw > m.cw + 1) {
        const who = m.offenders.length ? ` ← ${m.offenders.join(' | ')}` : '';
        violations.push(`${vp.label}  ${route}  scrollWidth ${m.sw} > clientWidth ${m.cw} (초과 ${m.sw - m.cw}px)${who}`);
      }
      // 🔴 내부 컨테이너가 내용을 잘라내고 있으면 가로 스크롤이 없어도 A10 위반이다.
      if (m.clipped && m.clipped.length > 0) {
        violations.push(`${vp.label}  ${route}  내부 컨테이너가 내용을 잘라냄 ← ${m.clipped.join(' | ')}`);
      }
    }
    console.log(`  ${vp.label}: ${routes.length}개 경로 검사 완료`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

// ---------- 6. 결과 ----------
console.log(`총 ${checked}회 계측 (${VIEWPORTS.length}해상도 × ${routes.length}경로)`);
console.log(`브라우저: ${executablePath}`);

if (violations.length > 0) {
  fail(`\n❌ check-overflow 실패 (${violations.length}건) — A10 위반`);
  for (const v of violations) fail('  ' + v);
  process.exit(1);
}
console.log('✅ check-overflow 통과 — 3해상도 전 경로 가로 스크롤 0건 (A10)');
