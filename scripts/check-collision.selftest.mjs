#!/usr/bin/env node
/**
 * check-collision.selftest — 🔴 **계측기가 실제로 잡는지 증명한다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 왜 필요한가
 * ══════════════════════════════════════════════════════════════════════════════
 *   `check-collision` 이 「0건」이라고 말할 때, 그 0 이 **「겹침이 없다」인지
 *   「계측기가 안 도는 것」인지** 스스로는 구분하지 못한다. 그 둘을 구분하는 유일한
 *   방법은 **일부러 겹치게 만든 화면을 넣어 보고 잡히는지 확인하는 것**이다.
 *
 *   🔴 그리고 **잡히지 말아야 할 것이 안 잡히는지도** 함께 본다. 2026-08-24 v1 이
 *      정상 화면에서 오검출 1,431 건을 냈다 — 그때 「많이 잡히니 잘 도는구나」로 읽었으면
 *      팀이 멀쩡한 코드를 며칠 고쳤을 것이다. **음성 픽스처가 양성 픽스처만큼 중요하다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 픽스처 — 양성 5 · 음성 5
 * ══════════════════════════════════════════════════════════════════════════════
 *   P1  불투명 카드가 본문 글자 위를 덮는다              → 1순위 나와야 함
 *   P2  절대배치 글자 두 개가 크게 포개진다              → 2순위 나와야 함
 *   P3  SVG 눈금 라벨이 서로 파고든다(차트 축의 실제 형태) → 2순위 나와야 함
 *   P4  칠한 rect 가 글자 뒤에 그려져 일부를 덮는다       → 3순위 나와야 함
 *   P5  데이터 곡선이 범례 글자를 **관통**한다(후광 없음)  → 2순위 나와야 함 (R4)
 *   N1  접근성 라디오 — 'opacity:0' input 이 라벨 위      → 아무것도 안 나와야 함
 *   N2  같은 '<text>' 안의 제목 + 부제 tspan 두 줄        → 아무것도 안 나와야 함
 *   N3  차트 배경 rect **위에** 얹힌 라벨(정상 디자인)    → 아무것도 안 나와야 함
 *   N4  꺾은선 path 의 **상자만** 겹치는 눈금 라벨         → 아무것도 안 나와야 함
 *   N5  P5 와 같은 기하 + **후광이 있는 글자**             → 아무것도 안 나와야 함
 *       🔴 N5 가 R4 의 「고치면 꺼진다」를 증명한다. 없으면 R4 는 영원히 빨갛다.
 *
 * 🔴 픽스처는 **`scripts/` 트리를 건드리지 않는다.** 임시 디렉터리에 HTML 을 쓰고
 *    임시 서버로 띄운다. 제품 파일을 일부러 망가뜨리면 같은 트리를 재는 다른 게이트가
 *    오염된다(2026-08-21 실측 사고의 재발 방지).
 *
 * 종료코드: 0 전부 통과 · 1 픽스처 판정 실패 · 2 계측 불가(브라우저 없음 등)
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROBE_SRC, FREEZE_CSS } from './lib/collide-probe.mjs';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
];
function die(msg) {
  console.error(`\n⚠️  check-collision.selftest 계측 불가 — ${msg}`);
  console.error('   (종료코드 2 = 「재지 못했다」. 「픽스처가 통과했다」가 아니다.)');
  process.exit(2);
}

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { die('playwright-core 없음'); }
const executablePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) die('시스템 Chrome/Chromium 없음 (CHROME_PATH 로 지정)');

/* ══════════════ 픽스처 ══════════════ */
const BASE = `<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;font:16px/1.4 system-ui,sans-serif;background:#fff;color:#111}
  .case{position:relative;height:220px;border-bottom:1px solid #ddd;padding:10px}
</style>`;

const FIXTURES = {
  /* ── 양성 ─────────────────────────────────────────────────────────────── */
  'P1-가림': {
    expect: { sev: 1, min: 1 },
    html: `<div class="case">
      <p id="under" style="position:absolute;top:40px;left:20px;width:300px">
        이 문장은 카드에 완전히 덮여 읽을 수 없습니다 실측용 문장입니다</p>
      <div style="position:absolute;top:34px;left:10px;width:340px;height:60px;background:#0a3d62"></div>
    </div>`,
  },
  'P2-글자끼리': {
    expect: { sev: 2, min: 1 },
    html: `<div class="case">
      <span style="position:absolute;top:60px;left:40px;font-size:20px">겹치는앞쪽문장</span>
      <span style="position:absolute;top:64px;left:44px;font-size:20px">겹치는뒤쪽문장</span>
    </div>`,
  },
  'P3-축라벨끼리': {
    expect: { sev: 2, min: 1 },
    /* 차트 x축 눈금이 촘촘해 라벨이 서로 파고드는 실제 형태 */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <text x="40" y="80" font-size="13" text-anchor="middle">1.0e+16</text>
      <text x="70" y="80" font-size="13" text-anchor="middle">2.0e+16</text>
      <text x="100" y="80" font-size="13" text-anchor="middle">3.0e+16</text>
    </svg></div>`,
  },
  'P4-도형이덮음': {
    expect: { sev: 3, min: 1 },
    /* rect 가 글자 **뒤에** 오므로 글자 위에 그려진다 */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <text x="30" y="60" font-size="14">가려지는 라벨</text>
      <rect x="20" y="44" width="90" height="22" fill="#c0392b"></rect>
    </svg></div>`,
  },

  'P5-선이글자관통': {
    expect: { sev: 2, min: 1 },
    /* 🔴 이 화면이 CEO 가 본 것이다 — 범례가 플롯 안에 있고 데이터 곡선이 글자를 관통한다.
       상자 교차로도 z 순서로도 못 잡힌다(글자가 선보다 위에 그려진다). R4 가 잡아야 한다. */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <path d="M10 90 L350 30" fill="none" stroke="#2980b9" stroke-width="3"></path>
      <text x="60" y="70" font-size="13">규격 하한 (-1 mm)</text>
    </svg></div>`,
  },

  /* ── 음성 ─────────────────────────────────────────────────────────────── */
  'N1-투명라디오': {
    expect: { none: true },
    html: `<div class="case">
      <label style="position:relative;display:inline-block;padding:8px 14px;border:1px solid #999">
        <input type="radio" name="t" style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0">
        <span class="choice__optText">1000</span>
      </label>
    </div>`,
  },
  'N2-부제tspan': {
    expect: { none: true },
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <text x="30" y="50" font-size="13"><tspan x="30">가열로 본체</tspan><tspan class="lbl__text--sub" x="30" dy="13" font-size="11">Furnace Body</tspan></text>
    </svg></div>`,
  },
  'N3-배경위라벨': {
    expect: { none: true },
    /* rect 가 글자 **앞에** 오므로 글자가 위에 그려진다 — 합격창 띠 라벨의 정상 형태 */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <rect x="20" y="40" width="200" height="40" fill="#d5f5e3"></rect>
      <text x="26" y="62" font-size="12">합격창</text>
    </svg></div>`,
  },
  'N5-후광이지켜준다': {
    expect: { none: true },
    /* 🔴 P5 와 **똑같은 기하**인데 글자에 배경색 후광(paint-order + stroke)이 있다.
       고치면 규칙이 스스로 꺼진다는 것을 증명한다 — 이것이 없으면 R4 는 영원히 빨갛다. */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <path d="M10 90 L350 30" fill="none" stroke="#2980b9" stroke-width="3"></path>
      <text x="60" y="70" font-size="13"
            style="paint-order:stroke;stroke:#ffffff;stroke-width:3;stroke-linejoin:round">규격 하한 (-1 mm)</text>
    </svg></div>`,
  },

  'N4-꺾은선상자만겹침': {
    expect: { none: true },
    /* 🔴 path 의 bounding box 는 plot 전체(x 20~330 · y 20~100)를 덮지만 **실제 잉크는 얇은 선**이다.
       두 라벨은 그 상자 안에 있으나 **획이 글리프를 지나지 않는다** → 아무것도 나오면 안 된다.
       (획이 실제로 지나가는 경우는 P5 가 맡는다.) */
    html: `<div class="case"><svg width="360" height="120" viewBox="0 0 360 120">
      <path d="M20 100 L120 20 L220 90 L330 30" fill="none" stroke="#2980b9" stroke-width="2"></path>
      <text x="160" y="35" font-size="12">0.2</text>
      <text x="250" y="40" font-size="12">0.4</text>
    </svg></div>`,
  },
};

/* ══════════════ 실행 ══════════════ */
const dir = mkdtempSync(path.join(tmpdir(), 'collide-selftest-'));
/* 🔴 파일명은 ASCII 로 고정한다 — 한글 이름을 URL 로 만들면 이중 인코딩으로 404 가 난다. */
const slug = (name) => name.split('-')[0].toLowerCase();
for (const [name, f] of Object.entries(FIXTURES)) {
  writeFileSync(path.join(dir, `${slug(name)}.html`), BASE + f.html);
}
const server = createServer((req, res) => {
  const file = path.join(dir, decodeURIComponent((req.url ?? '/').replace(/^\//, '')));
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  let body;
  try { body = readFileSync(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const probe = new Function('opts', PROBE_SRC);
const rows = [];
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();

  for (const [name, f] of Object.entries(FIXTURES)) {
    await page.goto(`${base}/${slug(name)}.html`, { waitUntil: 'load' });
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    const geo = await page.evaluate(probe, { mode: 'geometry' });
    const occ = await page.evaluate(probe, { mode: 'occlusion' });
    const hits = [...geo.hits, ...occ.hits];
    const bySev = { 1: 0, 2: 0, 3: 0 };
    for (const h of hits) bySev[h.sev]++;

    let ok, why;
    if (f.expect.none) {
      ok = hits.length === 0;
      why = ok ? '겹침 0건' : `오검출 ${hits.length}건 — ${hits.slice(0, 2).map((h) => `[${h.sev}] ${h.a} ↔ ${h.b}`).join(' | ')}`;
    } else {
      const got = bySev[f.expect.sev];
      ok = got >= f.expect.min;
      why = ok ? `${f.expect.sev}순위 ${got}건 검출` : `${f.expect.sev}순위 ${f.expect.min}건 이상을 기대했으나 ${got}건 (전체 ${hits.length}건: ${JSON.stringify(bySev)})`;
    }
    rows.push({ name, ok, why, texts: geo.texts, shapes: geo.shapes });
  }
} catch (e) {
  if (browser) await browser.close().catch(() => {});
  server.close();
  die(e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}

console.log('\n═══ check-collision 자체검증 ═══');
console.log(`픽스처 디렉터리: ${dir}`);
for (const r of rows) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name.padEnd(16)} ${r.why}`);
}
const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n❌ 자체검증 실패 ${failed.length}/${rows.length} — 계측기를 믿을 수 없습니다.`);
  console.error('   🔴 이 상태에서 나온 「겹침 0건」은 「겹침이 없다」가 아니라 「못 잰다」입니다.');
  process.exit(1);
}
const pos = rows.filter((r) => !FIXTURES[r.name].expect.none).length;
console.log(`\n✅ 자체검증 통과 ${rows.length}/${rows.length} — 일부러 겹치게 만든 ${pos}종을 잡고, 정상 ${rows.length - pos}종을 잡지 않았습니다.`);
process.exit(0);
