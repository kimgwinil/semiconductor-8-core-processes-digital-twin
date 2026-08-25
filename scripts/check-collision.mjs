#!/usr/bin/env node
/**
 * check-collision — 🔴 **글자가 도형·이미지·다른 글자에 겹쳐 안 읽히는 자리를 센다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 왜 만들었나 (2026-08-24 · CEO 지적)
 * ══════════════════════════════════════════════════════════════════════════════
 *   「그래프 혹은 도형 등이 텍스트와 겹쳐 보이는 경우가 많은데 수정이 필요합니다」
 *   ── **사람 눈으로 잡으면 다음에 또 생긴다.** 그래서 계측기를 만든다.
 *
 *   `check-overflow`(A10)는 **가로로 넘쳤는가**만 본다. 넘치지 않고 **제자리에서 겹치는** 것은
 *   그 게이트의 사각지대였다. 이 게이트가 그 칸을 맡는다. 둘은 겹치지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 판정 등급 — 「겹쳤다」가 아니라 「못 읽는다」를 잡는다
 * ══════════════════════════════════════════════════════════════════════════════
 *   1순위  가림        글자 자리 5점 중 3점 이상을 **남의 요소가 위에서 막는다**
 *                      🔴 면적 교차로 재지 않는다. 글자가 도형 **위**에 있으면
 *                         정상 디자인(HUD·라벨 오버레이)이고 읽는 데 지장이 없다.
 *                         `elementFromPoint` 로 **z 순서**를 봐야 「가려짐」이 구분된다.
 *   2순위  글자↔글자   서로 다른 텍스트의 줄 상자가 교차 · 작은 쪽 면적의 15 % 이상
 *   3순위  스침        위 둘의 임계 미만(글자↔글자 15 % 미만 · 글자↔도형 6 % 이상)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 지금은 **계측 전용**이다 — 위반이 있어도 종료코드 0
 * ══════════════════════════════════════════════════════════════════════════════
 *   신설 시점에 대량 검출이 예상되므로 차단하지 않는다(CEO 지시 2026-08-24).
 *   실측을 보고 CEO 가 판정한 뒤 차단으로 올린다.
 *   차단으로 바꾸려면 `--strict` 를 붙여 부르면 된다(그때 1순위·2순위가 있으면 1).
 *   🔴 `--ratchet` 은 「지금보다 나빠지면 실패」다. 기준선 파일: `qa/collision-baseline.json`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 이 계측기가 **못 보는 것** (반드시 읽어라)
 * ══════════════════════════════════════════════════════════════════════════════
 *   ① **폰트 로딩 전 상태를 못 잰다.** `document.fonts.ready` 를 기다린 뒤 재므로,
 *      웹폰트가 늦게 와서 순간적으로 글자가 밀리는(FOUT) 구간의 겹침은 잡히지 않는다.
 *   ② **애니메이션 중간 프레임을 못 잰다.** 계측 직전 애니메이션·트랜지션 시간을 0 으로
 *      고정한다(끝 상태로 점프). 이동 중에만 겹치는 자리는 안 잡힌다.
 *   ③ **캔버스·WebGL 안에서 그린 글자를 못 잰다.** DOM 노드가 아니므로 존재 자체를 모른다.
 *      씬 안에 GL 로 새긴 라벨이 도형에 가려도 이 게이트는 침묵한다.
 *   ④ **가로로 잘려 화면 밖에 있는 글자의 1순위 판정을 못 한다.**
 *      `elementFromPoint` 는 보이는 영역만 답한다. 세로는 뷰포트를 내용 높이까지 늘려
 *      해결했지만(아래 ⑨) **가로는 늘리지 않는다** — 가로 넘침은 `check-overflow` 소관이다.
 *   ⑤ **상호작용 후 상태를 못 잰다.** 첫 렌더만 본다. 슬라이더를 움직이거나 탭을 바꾼 뒤
 *      생기는 겹침, 실행 결과가 나온 뒤의 차트 라벨 겹침은 범위 밖이다.
 *   ⑥ **색 대비를 못 잰다.** 「겹치지 않지만 배경과 같은 색이라 안 읽힌다」는 다른 문제다.
 *   ⑦ **줄 상자 기준이라 글리프 여백을 포함한다.** 실제 잉크보다 상자가 약간 크므로
 *      3순위(스침)에는 사람 눈에 안 보이는 것이 섞일 수 있다. 1·2순위는 임계로 걸렀다.
 *   ⑧ **한 브라우저(시스템 Chrome)만 본다.** Safari·Firefox 의 줄바꿈 차이는 못 본다.
 *   ⑨ **1순위는 「뷰포트를 내용 높이까지 늘린 상태」에서 잰다.** 이 앱은 window 가
 *      스크롤되지 않고 안쪽 패널이 스크롤하므로, 그러지 않으면 첫 화면만 재게 된다.
 *      대가로 **세로 길이에 반응하는 배치(100vh·height 미디어쿼리)의 겹침은 실제와
 *      다를 수 있다.** 2·3순위는 이 조작 없이 원래 뷰포트에서 잰다.
 *   ⑩ **`<img>`(png·webp) 안에 그려 넣은 글자를 못 잰다.** DOM 텍스트가 아니다.
 *      `equipment` 절의 사진형 자산이 여기 해당한다.
 *   ⑪ **경로별 첫 렌더의 기본 파라미터 상태만 본다**(⑤와 같은 뿌리).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 종료코드 (집안 규약)
 * ══════════════════════════════════════════════════════════════════════════════
 *   0  계측 완료 (기본 — 위반이 있어도 0)
 *   1  `--strict` 이고 1·2순위가 있다 / `--ratchet` 이고 기준선보다 나빠졌다
 *   2  **재지 못했다** — playwright-core 없음 · Chrome 없음 · 서버 기동 실패 · 카탈로그 없음
 *      🔴 2 를 1 로 위장하지 않는다. 「고장」과 「위반을 찾았다」는 다른 사실이다.
 *
 * 사용:
 *   node scripts/check-collision.mjs [--json] [--strict] [--ratchet]
 *        [--url <base>] [--routes <n>] [--widths 1400,1024,375]
 *        [--write-baseline]
 *   환경변수: PREVIEW_URL · CHROME_PATH
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import path from 'node:path';
import { PROBE_SRC, FREEZE_CSS } from './lib/collide-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const CATALOG = path.join(APP, 'src/content/catalog.json');
const DIST = path.join(APP, 'dist');
const BASELINE = path.join(APP, 'qa/collision-baseline.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };

const AS_JSON = has('--json');
const STRICT = has('--strict');
const RATCHET = has('--ratchet');
const WRITE_BASELINE = has('--write-baseline');
const ROUTE_LIMIT = val('--routes') ? Number(val('--routes')) : Infinity;
const WIDTHS = (val('--widths') ?? '1400,1024,375').split(',').map((s) => Number(s.trim()));

/* 🔴 CEO 지시: 최소 1400 · 1024 · 375. 좁은 화면에서 더 많이 겹친다. */
const HEIGHT_FOR = (w) => (w <= 480 ? 812 : w <= 1100 ? 768 : 900);

function die(msg, code = 2) {
  console.error(`\n⚠️  check-collision 계측 불가 — ${msg}`);
  console.error('   (종료코드 2 = 「재지 못했다」. 「위반 0건」이 아니다.)');
  process.exit(code);
}

/* 🔴 부분 실행으로 기준선을 쓰면 래칫이 **거짓 초록**이 된다 —
 *    2경로만 잰 「0건」을 74경로의 기준선으로 삼으면 이후 어떤 회귀도 「기준선 유지」로 통과한다.
 *    2026-08-24 실제로 한 번 그렇게 썼다가 여기서 막았다. */
if (WRITE_BASELINE && (ROUTE_LIMIT !== Infinity || val('--widths'))) {
  die('--write-baseline 은 전수 실행에서만 허용됩니다 (--routes / --widths 와 함께 쓸 수 없습니다).');
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
];

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { die('playwright-core 를 불러오지 못했습니다 (npm i -D playwright-core).'); }

const executablePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) die('시스템 Chrome/Chromium 실행 파일을 찾지 못했습니다 (CHROME_PATH 로 지정).');

/* ── 라우트 ────────────────────────────────────────────────────────────────── */
if (!existsSync(CATALOG)) die(`${path.relative(APP, CATALOG)} 가 없습니다.`);
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const routes = [{ id: '허브', hash: '#/' }, { id: 'about', hash: '#/about' }];
for (const [pid, def] of Object.entries(catalog.processes ?? {})) {
  if (def.status !== 'active') continue;
  for (const sid of def.sections ?? []) routes.push({ id: `${pid}/${sid}`, hash: `#/p/${pid}/${sid}`, pid, sid });
}
const targetRoutes = routes.slice(0, ROUTE_LIMIT);

/* ── 서버 ──────────────────────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
};
let server = null;
let baseUrl = val('--url') ?? process.env.PREVIEW_URL ?? null;
if (!baseUrl) {
  if (!existsSync(DIST)) die('dist/ 가 없고 --url/PREVIEW_URL 도 없습니다.');
  server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(DIST, urlPath);
    try { if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); }
    catch { file = path.join(DIST, 'index.html'); }
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

/* ── 계측 ──────────────────────────────────────────────────────────────────── */
const probe = new Function('opts', PROBE_SRC);
/** 한 화면 안에서 같은 겹침을 두 번 세지 않게 하는 키(스크롤 단계마다 다시 잰다). */
const keyOf = (h) => `${h.sev}|${h.a}|${h.b}|${Math.round(h.x)}|${Math.round(h.y)}`;
const findings = [];      // { width, route, sev, kind, a, b, area, ratio, w, h }
let measured = 0;
let browser;
let crashed = null;

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  for (const width of WIDTHS) {
    const height = HEIGHT_FOR(width);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });

    for (const route of targetRoutes) {
      await page.evaluate((h) => { location.hash = h; }, route.hash);
      await page.waitForFunction((h) => location.hash === h, route.hash, { timeout: 8000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      // 🔴 폰트가 오기 전에 재면 글자 폭이 달라 겹침 판정이 뒤집힌다.
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
      await page.waitForTimeout(120);   // 레이아웃 안정화(리사이즈 옵저버 등)

      /* ── ① 기하 계측 — 뷰포트와 무관. 문서 전체를 한 번에 잰다(2·3순위). ── */
      const local = new Map();
      try {
        const geo = await page.evaluate(probe, { mode: 'geometry' });
        for (const h of geo.hits) local.set(keyOf(h), h);
      } catch (e) { crashed = `${route.id} @${width}px geometry — ${e.message}`; continue; }

      /* ── ② 가림 계측 — 🔴 `elementFromPoint` 는 **보이는 영역만** 답한다. ──
       *
       * 🔴 2026-08-24 실측: 이 앱은 **window 가 스크롤되지 않는다.**
       *    `document.documentElement.scrollHeight` 가 뷰포트 높이와 정확히 같다(1400px→900,
       *    375px→812). 셸이 100vh 이고 **안쪽 패널이 따로 스크롤**하기 때문이다.
       *    그래서 `window.scrollTo()` 로 단계를 밟는 방식은 **아무 데도 가지 않았고**,
       *    첫 화면만 재고 「1순위 0건」이라 말하게 된다. 그것이 첫 실측이 48 → 22 로
       *    흔들린 진짜 이유였다.
       *
       * 고친 방식: **뷰포트 높이를 내용 전체 높이로 늘린다.** 안쪽 패널이 더는 넘치지
       *    않으므로 페이지 전면이 한 번에 보이고, `elementFromPoint` 가 전부 답한다.
       *    스크롤 단계가 없어져 **결과가 결정론적**이 된다.
       *    🔴 대가: 세로 길이에 반응하는 레이아웃(100vh 배치·height 미디어쿼리)은 이때
       *       모습이 달라질 수 있다. 겹침은 대부분 가로 방향이라 감수한다 — 머리주석
       *       「못 보는 것」 ⑨ 에 적었다. */
      try {
        const need = await page.evaluate(() => {
          let extra = 0;
          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            if (!/(auto|scroll)/.test(cs.overflowY)) continue;
            const d = el.scrollHeight - el.clientHeight;
            if (d > extra) extra = d;
          }
          const docExtra = document.documentElement.scrollHeight - document.documentElement.clientHeight;
          return Math.max(extra, docExtra);
        });
        const tallH = Math.min(height + need + 40, 16000);
        if (tallH > height) {
          await page.setViewportSize({ width, height: tallH });
          await page.waitForTimeout(150);
          await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        }
        const occ = await page.evaluate(probe, { mode: 'occlusion' });
        for (const h of occ.hits) local.set(keyOf(h), h);
        if (tallH > height) {
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(80);
        }
      } catch (e) { crashed = `${route.id} @${width}px occlusion — ${e.message}`; }

      measured++;
      for (const h of local.values()) findings.push({ width, route: route.id, ...h });
    }
    if (!AS_JSON) console.log(`  ${width}px: ${targetRoutes.length}개 경로 계측 완료`);
    await ctx.close();
  }
} catch (e) {
  crashed = e.message;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((r) => server.close(r));
}

if (measured === 0) die(`한 화면도 계측하지 못했습니다${crashed ? ' — ' + crashed : ''}.`);

/* 🔴 **부분 계측의 「0건」은 「겹침이 없다」가 아니다.** (2026-08-24 실측으로 배웠다)
 *    12폭 스윕 도중 개발 서버가 죽어 888화면 중 **592화면만** 재고도, 요약은 「0건」이라고
 *    적었다. `partial` 필드에는 사유가 남아 있었지만 **사람이 보는 줄에는 안 나왔다.**
 *    그 상태로 보고했으면 D-050 위반이다. 그래서 **못 잰 화면이 하나라도 있으면 ERROR(2)** 로 낸다.
 *    「덜 쟀다」와 「깨끗하다」는 절대로 같은 얼굴을 하면 안 된다. */
const EXPECTED = targetRoutes.length * WIDTHS.length;
if (measured < EXPECTED) {
  console.error('');
  console.error(`⚠️  부분 계측 — ${EXPECTED}화면 중 ${measured}화면만 쟀습니다(${EXPECTED - measured}화면 누락).`);
  if (crashed) console.error(`   마지막 사유: ${crashed}`);
  console.error('   🔴 이 실행의 「겹침 N건」은 **전수 결과가 아닙니다.** 수치로 인용하지 마십시오.');
  console.error('   (종료코드 2 = 「재지 못했다」)');
  if (AS_JSON) console.log(JSON.stringify({ summary: { measuredScreens: measured, expected: EXPECTED, partial: crashed }, findings: [] }, null, 2));
  process.exit(2);
}

/* ── 집계 ──────────────────────────────────────────────────────────────────── */
const bySev = { 1: 0, 2: 0, 3: 0 };
for (const f of findings) bySev[f.sev]++;
const byWidth = {};
for (const w of WIDTHS) byWidth[w] = { 1: 0, 2: 0, 3: 0, total: 0 };
for (const f of findings) { byWidth[f.width][f.sev]++; byWidth[f.width].total++; }

/* 라우트별 상위 목록 — 어디를 먼저 고칠지 정하는 데 쓴다 */
const byRoute = new Map();
for (const f of findings) {
  const k = f.route;
  if (!byRoute.has(k)) byRoute.set(k, { 1: 0, 2: 0, 3: 0, total: 0 });
  const o = byRoute.get(k); o[f.sev]++; o.total++;
}

const summary = {
  measuredScreens: measured,
  widths: WIDTHS,
  routes: targetRoutes.length,
  total: findings.length,
  sev1: bySev[1], sev2: bySev[2], sev3: bySev[3],
  byWidth,
  partial: crashed,
};

if (AS_JSON) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  console.log('');
  console.log('═══ check-collision 실측 ═══');
  console.log(`브라우저: ${executablePath}`);
  console.log(`대상: ${targetRoutes.length}경로 × ${WIDTHS.length}폭 = ${measured}화면 계측`);
  if (crashed) console.log(`⚠️  일부 화면 계측 실패: ${crashed}`);
  console.log('');
  console.log('폭별 건수');
  console.log('  폭     1순위(가림)  2순위(글자↔글자)  3순위(스침)   합계');
  for (const w of WIDTHS) {
    const b = byWidth[w];
    console.log(`  ${String(w).padStart(5)}px  ${String(b[1]).padStart(9)}  ${String(b[2]).padStart(16)}  ${String(b[3]).padStart(10)}  ${String(b.total).padStart(6)}`);
  }
  console.log(`  합계    ${String(bySev[1]).padStart(9)}  ${String(bySev[2]).padStart(16)}  ${String(bySev[3]).padStart(10)}  ${String(findings.length).padStart(6)}`);

  const severe = findings.filter((f) => f.sev <= 2);
  if (severe.length) {
    console.log('');
    console.log(`1·2순위 상세 (${severe.length}건 중 상위 60건)`);
    for (const f of severe.slice(0, 60)) {
      console.log(`  [${f.sev}] ${String(f.width).padStart(4)}px ${f.route.padEnd(22)} ${f.kind}  ${f.a}  ↔  ${f.b}  (${f.w}×${f.h}px, 비율 ${f.ratio})`);
    }
  }
  const hot = [...byRoute.entries()].filter(([, v]) => v[1] + v[2] > 0).sort((a, b) => (b[1][1] + b[1][2]) - (a[1][1] + a[1][2])).slice(0, 20);
  if (hot.length) {
    console.log('');
    console.log('1·2순위가 많은 경로 상위 20');
    for (const [r, v] of hot) console.log(`  ${r.padEnd(24)} 1순위 ${v[1]}  2순위 ${v[2]}  3순위 ${v[3]}`);
  }
  console.log('');
  console.log('🔴 이 계측기가 **못 보는 것** — 「0건」을 「문제 없음」으로 읽지 마십시오:');
  console.log('   ① 폰트 로딩 전 상태  ② 애니메이션 중간 프레임  ③ 캔버스/WebGL 내부 글자');
  console.log('   ④ 가로로 잘려 나간 글자(= check-overflow 소관)  ⑤ 슬라이더·탭 조작 후 상태');
  console.log('   ⑥ 색 대비  ⑦ 글리프 여백만큼의 미세 스침  ⑧ Chrome 외 브라우저');
  console.log('   ⑨ 세로 길이에 반응하는 배치(1순위는 뷰포트를 늘려 잰다)  ⑩ <img> 안에 그린 글자');
  console.log('   ⑪ 경로별 기본 파라미터 상태만 본다');
  console.log('   (파일 머리주석 「못 보는 것」 절이 정본이다.)');
}

if (WRITE_BASELINE) {
  mkdirSync(path.dirname(BASELINE), { recursive: true });
  /* 🔴 **무엇을 재서 나온 수인지 함께 적는다.** dist/ 를 잰 기준선과 개발 서버(현행 src)를 잰
   *    기준선은 서로 다른 것이며, 빌드가 낡으면 두 수가 갈린다. 출처가 없으면 다음 사람이
   *    「0건」만 보고 「제품이 깨끗하다」로 읽는다. */
  writeFileSync(BASELINE, JSON.stringify({
    recordedAt: new Date().toISOString(),
    source: baseUrl === null ? 'dist/' : (val('--url') ? `--url ${val('--url')}` : 'PREVIEW_URL'),
    servedFrom: server ? 'dist/ (내장 정적 서버)' : baseUrl,
    summary,
  }, null, 2) + '\n');
  if (!AS_JSON) console.log(`\n기준선 기록: ${path.relative(APP, BASELINE)}`);
}

/* ── 판정 ──────────────────────────────────────────────────────────────────── */
if (RATCHET) {
  if (!existsSync(BASELINE)) die(`--ratchet 인데 기준선 ${path.relative(APP, BASELINE)} 이 없습니다.`);
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')).summary;
  const worse = [];
  if (bySev[1] > base.sev1) worse.push(`1순위 ${base.sev1} → ${bySev[1]}`);
  if (bySev[2] > base.sev2) worse.push(`2순위 ${base.sev2} → ${bySev[2]}`);
  if (worse.length) {
    console.error(`\n❌ check-collision 래칫 후퇴 — ${worse.join(' · ')}`);
    process.exit(1);
  }
  if (!AS_JSON) console.log(`\n✅ 래칫 유지 (기준선 1순위 ${base.sev1} · 2순위 ${base.sev2})`);
}

if (STRICT && bySev[1] + bySev[2] > 0) {
  console.error(`\n❌ check-collision 실패 — 1순위 ${bySev[1]}건 · 2순위 ${bySev[2]}건 (--strict)`);
  process.exit(1);
}

/* 🔴 `--json` 일 때 이 줄을 찍으면 JSON 뒤에 글자가 붙어 파싱이 깨진다(2026-08-24 실측). */
if (!AS_JSON) console.log(`\n📏 check-collision 계측 완료 — 1순위 ${bySev[1]} · 2순위 ${bySev[2]} · 3순위 ${bySev[3]} (계측 전용, 차단하지 않음)`);
process.exit(0);
