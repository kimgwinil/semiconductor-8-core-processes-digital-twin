#!/usr/bin/env node
/**
 * 도해 잉크 범위 측정기 — `EquipmentSection.tsx` 의 `DRAWING_EXTENT` 표를 만드는 도구.
 *
 * 🔴 이것은 **게이트가 아니다.** 판정하지 않고 재기만 한다. `verify.mjs` 에 등록하지 않는다.
 *    (파일명이 `check-*` 가 아니므로 `check-gate-registration` 의 게이트 목록에도 들어가지 않는다.)
 *
 * 무엇을 재는가:
 *   `public/assets/equipment/<공정>/cross-section.webp` 안에서 **그림이 실제로 그려진 x 구간**.
 *   구도 규격(§6-2)이 라벨용으로 비워 둔 좌우 여백은 배경색 단색이므로 여기서 빠진다.
 *   렌더러는 이 구간을 기준으로 프레임을 잡는다 — 그래야 죽은 여백이 화면을 먹지 않는다.
 *
 * 방법:
 *   ① 배경색 = 좌상단 (0,0) 픽셀
 *   ② 어느 채널이든 배경과 12 이상 차이 나면 「잉크」
 *   ③ 한 열에 잉크가 3px 이상이면 그 열은 「그림이 있는 열」 (안티에일리어싱 잡음 배제)
 *   ④ 그런 열의 최소·최대가 결과다(양끝 포함)
 *   임계값 12·3 은 DSN `이미지/_figure_check.py` 계열 도구와 같은 계열의 값이며,
 *   webp 는 손실 압축이라 0 임계로는 배경 자체가 잉크로 잡힌다.
 *
 * 왜 Chrome 인가:
 *   Node 표준 라이브러리는 webp 를 디코드하지 못하고, 이 저장소는 이미지 디코더 의존성을 두지 않는다.
 *   `playwright-core` + 시스템 Chrome 은 다른 게이트(`check-overflow`·`check-collision`)가 이미 쓰는 경로다.
 *
 * 사용:
 *   node scripts/measure-drawing-extent.mjs           # 표 출력
 *   node scripts/measure-drawing-extent.mjs --json    # 기계 가공용
 *
 * 종료코드: 0 측정 완료 · 2 측정 불가(Chrome/자산 부재). **판정 실패(1)는 없다 — 판정을 하지 않는다.**
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const EQ = join(APP, 'public/assets/equipment');
const JSON_OUT = process.argv.includes('--json');

const INK_DELTA = 12;   // 배경 대비 채널 최대차가 이보다 크면 잉크
const MIN_COL_INK = 3;  // 한 열에 잉크가 이만큼은 있어야 「그림이 있는 열」

function die(msg) { console.error(`⚠️  측정 불가 — ${msg}`); process.exit(2); }

if (!existsSync(EQ)) die(`자산 디렉터리가 없습니다: ${EQ}`);

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { die('playwright-core 를 불러오지 못했습니다 (npm i).'); }

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
];
const executablePath = process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) die('Chrome 을 찾지 못했습니다. CHROME_PATH 로 지정하십시오.');

const pids = readdirSync(EQ, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(EQ, d.name, 'cross-section.webp')))
  .map((d) => d.name).sort();
if (pids.length === 0) die(`cross-section.webp 를 가진 공정이 없습니다: ${EQ}`);

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const rows = [];
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const pid of pids) {
    const buf = readFileSync(join(EQ, pid, 'cross-section.webp'));
    const dataUrl = `data:image/webp;base64,${buf.toString('base64')}`;
    const r = await page.evaluate(async ({ url, INK_DELTA, MIN_COL_INK }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode')); img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      const bg = [data[0], data[1], data[2]];
      let x0 = -1, x1 = -1, y0 = -1, y1 = -1;
      const rowInk = new Array(c.height).fill(0);
      for (let x = 0; x < c.width; x++) {
        let n = 0;
        for (let y = 0; y < c.height; y++) {
          const i = (y * c.width + x) * 4;
          const d = Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i+1] - bg[1]), Math.abs(data[i+2] - bg[2]));
          if (d > INK_DELTA) { n++; rowInk[y]++; }
        }
        if (n >= MIN_COL_INK) { if (x0 < 0) x0 = x; x1 = x; }
      }
      for (let y = 0; y < c.height; y++) if (rowInk[y] >= MIN_COL_INK) { if (y0 < 0) y0 = y; y1 = y; }
      return { w: c.width, h: c.height, bg, x0, x1, y0, y1 };
    }, { url: dataUrl, INK_DELTA, MIN_COL_INK });
    rows.push({ pid, ...r });
  }
} finally { await browser.close(); }

if (JSON_OUT) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }

console.log(`도해 잉크 범위 — 배경 대비 채널차 > ${INK_DELTA} · 열당 잉크 ${MIN_COL_INK}px 이상 (양끝 포함)\n`);
console.log('공정          캔버스     배경        x0    x1   폭   캔버스대비    y0    y1');
console.log('─'.repeat(78));
for (const r of rows) {
  const iw = r.x1 - r.x0 + 1;
  console.log(
    `${r.pid.padEnd(12)} ${String(r.w + '×' + r.h).padEnd(9)} ` +
    `rgb(${r.bg.join(',')})`.padEnd(16) +
    `${String(r.x0).padStart(4)} ${String(r.x1).padStart(5)} ${String(iw).padStart(5)} ` +
    `${(100 * iw / r.w).toFixed(1).padStart(8)}%  ${String(r.y0).padStart(4)} ${String(r.y1).padStart(5)}`,
  );
}
console.log('\n// EquipmentSection.tsx 의 DRAWING_EXTENT 에 붙여 넣을 형태');
for (const r of rows) console.log(`  ${r.pid}: [${r.x0}, ${r.x1}],`);
console.log('\n🔴 자산을 다시 그렸다면 위 표로 DRAWING_EXTENT 를 갱신하십시오. 갱신하지 않으면 프레임이 어긋납니다.');
