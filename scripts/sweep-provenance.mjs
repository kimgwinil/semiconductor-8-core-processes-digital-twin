// 🔴 72화면(8공정×9절) + 허브 + about 전수 스윕 — 제작자용 문구 잔존 카운트.
// 사용: node scripts/sweep-provenance.mjs [label]
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5174';
const LABEL = process.argv[2] ?? '(unlabeled)';
const PROCS = ['wafer', 'oxidation', 'photo', 'etch', 'deposition', 'metal', 'eds', 'packaging'];
const SECS = ['overview', 'theory', 'principle', 'equipment', 'lab-basic', 'lab-applied', 'lab-advanced', 'test', 'result'];

// 🔴 「학습자가 아니라 제작자에게 하는 말」을 찾는 패턴.
const PATTERNS = [
  ['S번호',            /S\d{2,3}/g],
  ['등급어',            /경향모델|문헌식|검증식|운영규약/g],
  ['출처·근거',         /출처|근거 미상|서지|원장/g],
  ['교육용·학습용',      /교육용|학습용/g],
  ['합성',              /합성/g],
  ['면책(…아닙니다)',   /실제[^.]{0,20}(?:아닙니다|아니라|아니다)|조정된 값|장비 상수가 아/g],
  ['미확인·검증전',      /미확인|현업 검증|검증 전|확인 중|비공개/g],
  ['제작지시어',         /명세|규약|정본표|정합성|고지|PLN|DSN|DEV/g],
  ['오해교정',           /오해하기 쉽|읽기 쉽|외우기 쉽|생각하기 쉽|떠올리기 쉽|보이기 쉽|흔한 오해|흔한 오판|가장 잦은 오답|가장 흔한 실수/g],
];

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();

const routes = [['#/', 'hub'], ['#/about', 'about']];
for (const p of PROCS) for (const s of SECS) routes.push([`#/p/${p}/${s}`, `${p}/${s}`]);

const totals = new Map(PATTERNS.map(([n]) => [n, 0]));
const perRoute = [];

for (const [hash, name] of routes) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const txt = await page.evaluate(() => {
    // 화면에 실제로 보이는 글자만 — SVG <text> 포함.
    const parts = [document.body.innerText];
    for (const t of document.querySelectorAll('svg text')) parts.push(t.textContent ?? '');
    return parts.join('\n');
  });
  const row = { name, hits: {} };
  for (const [n, re] of PATTERNS) {
    re.lastIndex = 0;
    const m = txt.match(re) ?? [];
    if (m.length) { row.hits[n] = m.length; totals.set(n, totals.get(n) + m.length); }
  }
  if (Object.keys(row.hits).length) perRoute.push(row);
}

console.log(`\n########## SWEEP [${LABEL}] · routes=${routes.length} (hub + about + 8×9=72)`);
console.log('패턴                     건수');
console.log('------------------------------');
for (const [n] of PATTERNS) console.log(`${n.padEnd(22)} ${String(totals.get(n)).padStart(6)}`);
console.log('------------------------------');
console.log(`합계 ${[...totals.values()].reduce((a, b) => a + b, 0)}  ·  적발 화면 ${perRoute.length}/${routes.length}`);
if (perRoute.length) {
  console.log('\n-- 잔존 화면 --');
  for (const r of perRoute.slice(0, 40)) {
    console.log(`  ${r.name.padEnd(24)} ${Object.entries(r.hits).map(([k, v]) => `${k}:${v}`).join(' · ')}`);
  }
}
await browser.close();
