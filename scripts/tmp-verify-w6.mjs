/** 임시 — W6 판정선언이 **화면에** 나오는지 실측. qa-shots.mjs 의 서버·브라우저 방식을 그대로 쓴다. */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(APP, 'dist');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.css':'text/css;charset=utf-8', '.json':'application/json;charset=utf-8', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = createServer((req,res)=>{const p=decodeURIComponent((req.url??'/').split('?')[0]);let f=join(DIST,p);
  try{if(!existsSync(f)||statSync(f).isDirectory())f=join(DIST,'index.html');}catch{f=join(DIST,'index.html');}
  try{res.writeHead(200,{'Content-Type':MIME[extname(f)]??'application/octet-stream'});res.end(readFileSync(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${server.address().port}`;
const targets=[['oxidation/lab-basic','thicknessNm'],['photo/lab-basic','cdNm'],['wafer/lab-applied','diameterSigmaMm'],['wafer/lab-advanced','(선언없음 예상)']];
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
const errs=[];
for(const [route,expectId] of targets){
  const page=await browser.newPage({viewport:{width:1440,height:1024}});
  page.on('console',m=>{if(m.type()==='error')errs.push(`${route}: ${m.text()}`);});
  page.on('pageerror',e=>errs.push(`${route}: ${e.message}`));
  await page.goto(`${BASE}/#/p/${route}`,{waitUntil:'networkidle'});
  await page.waitForTimeout(700);
  const found=await page.$$eval('.labChart__judges',ns=>ns.map(n=>({judges:n.getAttribute('data-judges'),text:n.textContent.trim()})));
  const figs=await page.$$eval('figure.labChart',ns=>ns.map(n=>n.getAttribute('data-chart-id')));
  const legend=await page.$$eval('figure.labChart text, figure.labChart .chartLegend, figure.labChart li',ns=>ns.map(n=>n.textContent.trim()).filter(t=>/현재|판정/.test(t)));
  console.log(`\n▶ ${route}  (기대 judges=${expectId})`);
  console.log(`   차트 figure: ${figs.length?figs.join(', '):'없음'}`);
  if(!found.length) console.log('   ❌ .labChart__judges 없음 — 화면에 판정 문구 안 나옴');
  found.forEach(f=>console.log(`   ✅ data-judges="${f.judges}"  텍스트: ${f.text}`));
  console.log(`   동작점/판정 관련 라벨: ${legend.length?JSON.stringify(legend):'없음'}`);
  await page.close();
}
await browser.close(); server.close();
console.log(`\n콘솔 에러 ${errs.length}건`); errs.slice(0,10).forEach(e=>console.log('  '+e));
