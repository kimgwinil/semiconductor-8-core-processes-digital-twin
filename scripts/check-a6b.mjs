#!/usr/bin/env node
/**
 * 🔴 A6-b 렌더 게이트 — **실제 DOM 을 본다.** (2026-08-20 반려③)
 *
 * 왜 생겼나. 종전 `check-labs` 의 A6-b 검사는 `LabRunner.tsx` 원문에 `.assumptions` 라는
 * 문자열이 있는지 보는 **정규식 한 줄**이었다. 검증 비서가 변이를 넣어 실측한 결과:
 *
 *   | 변이                                                     | 결과            |
 *   |----------------------------------------------------------|-----------------|
 *   | 렌더 블록 전체 삭제                                       | ✅ 적발          |
 *   | `<ul className="qty__assumptions">` 목록만 삭제, 가드 유지  | 🔴 통과 — 못 봄 |
 *   | 렌더 삭제 + 주석에 `.assumptions` 한 마디만 남김            | 🔴 통과 — 못 봄 |
 *
 * 소스에 문자열이 있다는 것과 **화면에 고지가 나온다**는 것은 다른 명제다.
 * 그래서 `check-overflow` 처럼 브라우저를 띄워 24칸을 실제로 렌더하고 DOM 을 읽는다.
 *
 * 🔴 판정 축은 **구조 속성 `data-kind`** 다(오케스트레이터 판정 2026-08-20).
 *    고지 **문장**은 공정별 맥락에 맞게 자유롭게 쓴다 — 획일 문구를 강요하면 맥락이 죽는다.
 *    비서 실측상 「실제 장비 상수 아님」 정확 문구는 24칸 중 3칸뿐이고 나머지는 의미상 동등한 다른 문장이다.
 *    자유 문장은 구조 위에 얹는다.
 *
 * 검사:
 *  R1. 배선된 칸의 모든 `.qty[data-model-id]` 가 `data-kind` 를 갖는다 (표식 누락 0건)
 *  R2. DOM 의 `data-kind` 가 **등급 원장과 일치**한다 (원장 → 런타임 → 화면 일관성)
 *  R3. `data-kind="synthetic"` 인 출력에는 **비어 있지 않은 합성 고지**가 실제로 보인다
 *  R4. L2 미통과(`data-l2-pending="true"`)인 문헌값에는 **L2 고지**가 실제로 보인다
 *  R5. 🔴 배지가 실제로 **가른다** — 전 화면에서 관찰된 `data-kind` 가 한 종류뿐이면 실패.
 *      「전부 같은 배지」는 구분 기능이 0 이므로 A6-b 미충족이다.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(APP, 'dist');
/* 🔴 `--ledger <파일>` 은 **픽스처 전용 주입구**다(2026-08-22 신설 — check-grades 와 같은 규약).
 *
 * R2(원장 → 런타임 → 화면 일관성) 픽스처는 「원장만 고치고 빌드를 안 한 상태」를 재현해야 한다.
 * 종전에는 그걸 **실파일 `src/content/model-grades.json` 에 주입**해서 만들었고,
 * 2026-08-21 에 그 주입본이 복구되지 않은 채 남아 `eds.lab.s6.adProduct` 가
 * **합성 → 문헌식으로 조용히 승격**됐다. 🔴 A6-b 가 막으려던 일을 A6-b 픽스처가 저질렀다.
 * 이제 주입본은 tmpdir 에 두고 이 인자로 가리킨다 — dist/ 는 실물 그대로 읽으므로
 * 「원장 ≠ 화면」이라는 불일치는 **똑같이** 재현되고, 실파일은 건드리지 않는다.
 */
const ledgerFlagIdx = process.argv.indexOf('--ledger');
const LEDGER = ledgerFlagIdx >= 0 && process.argv[ledgerFlagIdx + 1]
  ? resolve(process.argv[ledgerFlagIdx + 1])
  : join(APP, 'src', 'content', 'model-grades.json');
const CATALOG = join(APP, 'src', 'content', 'catalog.json');
const DISPLAY_CONFIG = join(APP, 'src', 'config', 'provenance-display.ts');
const displaySource = readFileSync(DISPLAY_CONFIG, 'utf8');
const displayMatch = displaySource.match(/export\s+const\s+SHOW_PROVENANCE\s*=\s*(true|false)/);
if (!displayMatch) { console.error('❌ SHOW_PROVENANCE 표시 정책을 읽을 수 없습니다.'); process.exit(2); }
const showProvenance = displayMatch[1] === 'true';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
];

if (!existsSync(DIST)) {
  console.error('❌ dist/ 가 없습니다. A6-b 렌더 게이트는 빌드 산출물을 봅니다 — `npm run build` 후 다시 도세요.');
  console.error('   🔴 이 게이트를 SKIP 으로 넘기지 마십시오. SKIP 은 PASS 가 아닙니다.');
  process.exit(1);
}
if (!existsSync(LEDGER)) { console.error(`❌ ${LEDGER} 가 없습니다.`); process.exit(1); }

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('❌ playwright-core 를 찾지 못했습니다.'); process.exit(1); }

const executablePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error('❌ Chrome/Chromium 실행 파일을 찾지 못했습니다. CHROME_PATH 로 지정하세요.'); process.exit(1); }

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')).models ?? {};
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const pids = Object.entries(catalog.processes).filter(([, d]) => d.status === 'active').map(([k]) => k);
const STAGES = ['lab-basic', 'lab-applied', 'lab-advanced'];

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let f = join(DIST, p);
  try {
    if (!existsSync(f) || statSync(f).isDirectory()) {
      if (extname(p) !== '') { res.writeHead(404).end(); return; }
      f = join(DIST, 'index.html');
    }
  } catch { f = join(DIST, 'index.html'); }
  try { res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const errors = [];
const kindsSeen = new Set();
let panes = 0; let wired = 0; let outputs = 0; let synth = 0; let lit = 0; let op = 0;

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });

  for (const pid of pids) {
    for (const stage of STAGES) {
      panes++;
      const where = `${pid}/${stage}`;
      await page.evaluate((r) => { location.hash = r; }, `#/p/${pid}/${stage}`);
      await page.waitForFunction((r) => location.hash === r, `#/p/${pid}/${stage}`, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      const rows = await page.evaluate(() => [...document.querySelectorAll('.qty')].map((el) => {
        const badge = el.querySelector('.srcBadge');
        const synNote = el.querySelector('.srcBadge__notice--synthetic');
        const opNote = el.querySelector('.srcBadge__notice--operational');
        const l2Note = el.querySelector('.srcBadge__notice--l2');
        const vis = (n) => {
          if (!n) return null;
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return '';
          return (n.textContent ?? '').trim();
        };
        return {
          outputId: el.getAttribute('data-output-id'),
          modelId: el.getAttribute('data-model-id'),
          kind: el.getAttribute('data-kind'),
          l2Pending: el.getAttribute('data-l2-pending'),
          badgeKind: badge?.getAttribute('data-kind') ?? null,
          gradeText: (el.querySelector('.srcBadge__grade')?.textContent ?? '').trim(),
          synNote: vis(synNote),
          opNote: vis(opNote),
          l2Note: vis(l2Note),
        };
      }));

      const visibleProvenance = await page.evaluate(() => [...document.querySelectorAll(
        '.srcBadge, .passBasisBadge, .qty__assumptions, .fixedCard__basis, .fixedCard__note, .sceneBox__note',
      )].filter((el) => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0 && (el.textContent ?? '').trim();
      }).length);
      if (!showProvenance && visibleProvenance > 0) {
        errors.push(`[H1] ${where}: 표시 OFF인데 출처·등급·고지 요소 ${visibleProvenance}개가 화면에 남아 있습니다.`);
      }

      if (rows.length === 0) continue;   // 배선 전이거나 출력이 없는 칸
      wired++;

      for (const r of rows) {
        outputs++;
        // R1
        if (!r.modelId) { errors.push(`[R1] ${where}: 출력 '${r.outputId ?? '?'}' 에 data-model-id 가 없습니다.`); continue; }
        if (!r.kind) { errors.push(`[R1] ${where}: '${r.modelId}' 에 data-kind 표식이 없습니다 — 게이트가 검사할 근거가 없습니다.`); continue; }
        if (showProvenance && r.badgeKind !== r.kind) {
          errors.push(`[R1] ${where}: '${r.modelId}' 의 컨테이너 kind='${r.kind}' 와 배지 kind='${r.badgeKind}' 가 다릅니다.`);
        }
        kindsSeen.add(r.kind);
        if (r.kind === 'synthetic') synth++; else if (r.kind === 'operational') op++; else lit++;

        // R2 — 원장 대조
        const e = ledger[r.modelId];
        if (!e) {
          errors.push(`[R2] ${where}: 화면의 '${r.modelId}' 가 등급 원장에 없습니다.`);
        } else if (e.kind !== r.kind) {
          errors.push(`[R2] ${where}: '${r.modelId}' 원장 kind='${e.kind}' 인데 화면 kind='${r.kind}' 입니다.`);
        }

        // R3 — 합성 고지가 실제로 보이는가
        if (showProvenance && r.kind === 'synthetic' && !r.synNote) {
          errors.push(
            `[R3] ${where}: '${r.modelId}' 는 합성값인데 화면에 고지가 없습니다` +
            `${r.synNote === '' ? '(요소는 있으나 감춰져 있거나 비어 있음)' : ''}. ` +
            `합성 계수를 실측값처럼 보이게 하는 것이 이 제품에서 가장 위험한 결함입니다(A6-b).`,
          );
        }
        // R3b — 운영규약(A15-op) 고지가 실제로 보이는가.
        //       「물리식과 다른 배지를 단다」가 승인 조건이었다(10_P7_EDS_판정요청.md §3).
        if (showProvenance && r.kind === 'operational' && !r.opNote) {
          errors.push(`[R3] ${where}: '${r.modelId}' 는 운영규약(A15-op) 항목인데 화면에 그 고지가 없습니다.`);
        }
        // R4 — L2 미통과 문헌값의 고지
        if (showProvenance && r.kind !== 'synthetic' && r.l2Pending === 'true' && !r.l2Note) {
          errors.push(`[R4] ${where}: '${r.modelId}' 는 현업 검증(L2) 전인데 화면에 그 고지가 없습니다.`);
        }
        if (showProvenance && !r.gradeText) errors.push(`[R1] ${where}: '${r.modelId}' 에 등급 배지 문구가 비어 있습니다.`);
        if (!showProvenance && (r.badgeKind !== null || r.gradeText || r.synNote || r.opNote || r.l2Note)) {
          errors.push(`[H2] ${where}: '${r.modelId}' 의 출처·등급·고지 표시가 남아 있습니다.`);
        }
      }
    }
  }
  await ctx.close();
} finally { await browser.close(); await new Promise((r) => server.close(r)); }

// R5 — 배지가 실제로 가르는가
if (showProvenance && kindsSeen.size < 2) {
  errors.push(
    `[R5] 24칸 전체에서 관찰된 data-kind 가 ${kindsSeen.size}종(${[...kindsSeen].join(',') || '없음'})뿐입니다. ` +
    `모든 출력이 같은 표식을 달면 학습자가 문헌값과 교육용 값을 구분할 수 없어 A6-b 의 목적이 0 이 됩니다.`,
  );
}

console.log(
  `A6-b 렌더 실측 — 칸 ${wired}/${panes} · 출력 ${outputs}개 (문헌 ${lit} · 합성 ${synth} · 운영규약 ${op}) · 관찰된 kind ${[...kindsSeen].join(', ') || '없음'}`,
);
if (errors.length > 0) {
  console.error(`\n❌ check-a6b 실패 (${errors.length}건)`);
  for (const e of errors.slice(0, 50)) console.error('  ' + e);
  if (errors.length > 50) console.error(`  … 외 ${errors.length - 50}건`);
  process.exit(1);
}
console.log(showProvenance
  ? '✅ check-a6b 통과 — 합성 고지가 화면까지 닿았고 배지가 실제로 갈랐습니다'
  : '✅ check-a6b 통과 — 표시 OFF 정책에 따라 출처·등급·합성·L2 고지가 24칸 화면에서 모두 제거됐습니다');
