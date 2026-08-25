#!/usr/bin/env node
/**
 * 🔴 A5 스윕 증거 — 24칸 전수.
 *
 * 「파라미터를 바꾸면 내부 시각화가 실시간으로 바뀐다」를 **화면에서 실측**한다.
 * 코드가 24칸이어도 화면 증거가 없으면 A5 를 충족했다고 말할 수 없다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 2026-08-22 — **캔버스를 전부 본다.** 종전에는 첫 캔버스 하나만 봤다.
 *
 *   `page.$('canvas')` · `document.querySelector('.sceneBox__mode')` 로 **첫 캔버스만**
 *   재고 있었다. 그런데 `LabSpec.scenes[]`(씬 병치)를 쓰는 칸은 `div.lab__scenes` 안에
 *   `SceneCanvas` 를 나란히 그린다 — **두 번째 씬은 계측기에 아예 보이지 않았다.**
 *   실제 피해: `deposition/lab-advanced` 는 캔버스 2개인데, 두 번째 캔버스가 담당하는
 *   `rpNm`·`doseE14` 를 공식 스윕 표가 **「무변화」로 오보**했다(실제로는 8.7 % · 8.4 % 움직인다).
 *
 *   🔴 **합치지 않고 갈라 낸다.** 캔버스별로 문턱을 따로 내고 결과도 따로 찍는다.
 *      합치면 한쪽의 변화가 다른 쪽의 노이즈에 묻히고, 문턱도 시끄러운 쪽에 오염된다.
 *      슬라이더 단위 스칼라는 「어느 캔버스든 하나라도 움직였는가」 롤업으로 남긴다 —
 *      「전부 움직여야 true」로 하면 한쪽 씬만 반응하는 **정상 설계가 DEAD 로 오보**된다.
 *
 *   🔴 렌더 경로: **폴백이 기준**이다. 아래 `RENDER_PATH` 절 참조.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 2026-08-20 계측기 교체 — **SHA1 해시 비교를 폐기했다.**
 *
 *    이전 판은 슬라이더를 min→max 로 움직인 뒤 `<canvas>` element 스크린샷의 SHA1 을
 *    비교해 `sceneChanged` 를 판정했다. 그런데 **씬이 애니메이션이라 파라미터를 전혀
 *    건드리지 않아도 해시가 매 프레임 달라진다.** 대조군 실험(파라미터 고정, 0.5초 간격
 *    4회 캡처)에서 oxidation 은
 *      25434e4f8b → 1ecaf08623 → 3a5c93f8c6 → 0e3b647a46
 *    로 4회 모두 달랐고 etch·deposition·metal 도 같았다. 즉 이전의 `sceneChanged: true`
 *    는 **아무것도 증명하지 못했다.** 「고장을 정상으로 보는 계측기」였다.
 *
 *    교체한 척도 = **히스토그램 군내/군간 거리**.
 *      · 파라미터를 고정한 채 N회 캡처 → 군내(within) 거리 = 애니메이션 노이즈 바닥
 *      · 슬라이더 min 에서 N회 · max 에서 N회 → 군간(between) 거리
 *      · `between_mean > within_max × K` 이면 씬이 파라미터에 반응한 것이다.
 *      · 군내 분포를 못 구하면 `null`(판정 불가). **절대 true 로 쓰지 않는다.**
 *
 *    거리 정의는 §「히스토그램 거리」, 상수 K 의 근거는 §「판정 상수」를 보라.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 칸마다:
 *  1. 모든 슬라이더를 각각 min → max 로 움직이며 출력·씬을 측정
 *  2. **출력 수치가 실제로 바뀌었는지** 텍스트로 대조 (죽은 입력 검출)
 *  3. 씬이 있으면 **히스토그램 군내/군간 거리**로 대조 (해시 아님)
 *  4. 🔴 **A6-b 고지가 화면에 실제로 렌더되는지** 확인
 *  5. 🔴 씬 무변화(false)로 판정된 칸은 **before/after PNG 를 남기고 경로를 표에 찍는다**
 *     — 척도가 위음성일 수 있으므로 사람이 눈으로 볼 경로를 반드시 남긴다.
 *  6. 🔴 **캡처한 프레임이 백지가 아닌지 먼저 판정한다**(2026-08-21 신설).
 *     캡처 성공 ≠ 씬이 그려졌음. 무효 프레임이 섞이면 그 판정은 `null` 이다 — 없는 것을 재고
 *     「안 움직인다」고 말하지 않는다. 임계값은 126장 전수 실측으로 잡았다(§lib/frame.mjs).
 *  7. 🔴 **이전 실행의 PNG 를 먼저 격리한다**(2026-08-21 신설).
 *     증거 PNG 는 `sceneChanged !== true` 일 때만 쓰이므로, 지난 실행에서 false 였다가 이번에
 *     true 가 된 슬라이더의 옛 PNG 가 **덮이지 않고 남아 이번 증거인 척한다.** 실제로 그렇게 됐다.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
/* 🔴 PNG 디코더·히스토그램 거리·합성 자가검증·**프레임 유효성 판정**은 `scripts/lib/frame.mjs` 로
 *    옮겼다(2026-08-21). 옮긴 이유는 하나다 — 스윕 전체를 돌려야만 검증되는 코드는 사실상
 *    검증되지 않기 때문이다. 이제 `selftest-gates` 가 이 계측 함수들을 **단위로** 잡을 수 있다. */
import {
  HIST_BINS, decodePNG, histogram, histDist, withinMax, betweenMean,
  selfTestSynthetic, analyzeFrame, analyzePNG, frameGateProblem, FRAME_MIN_STD, FRAME_MIN_UNIQ,
} from './lib/frame.mjs';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJ = dirname(APP);
/**
 * 🔴 2026-08-20 실측 사고 — **스윕 도중 `dist` 가 재빌드되면 측정이 통째로 오염된다.**
 *
 * 실제로 일어났다: 18:42 빌드로 스윕을 시작했는데 21:33 에 다른 작업자가 재빌드했고,
 * 브라우저는 이미 옛 엔트리 청크를 물고 있어서 지연 로딩할 씬 청크를 옛 해시로 요청했다.
 *   `🔴 404 /assets/plasma-CRzQbwy3.js`   ← 재빌드로 사라진 청크
 * 씬이 로딩에 실패하니 etch 칸은 「씬이 파라미터에 반응하지 않는다」로 보였다. 실제로는
 * **씬 자체가 없었다.** 계측기가 아니라 피측정물이 도중에 바뀐 것이다.
 *
 * 그래서 `DIST_DIR` 로 **얼려둔 빌드 스냅샷**을 가리킬 수 있게 했다. 기본값은 종전대로
 * `app/dist` 라 다른 호출자에게는 변화가 없다. 여러 사람이 같은 저장소를 동시에 만질 때는
 * `cp -R dist <스냅샷>` 후 `DIST_DIR=<스냅샷>` 으로 돌려라.
 */
const DIST = process.env.DIST_DIR ?? join(APP, 'dist');
/* `OUT_DIR` — 증거·보고서를 다른 곳에 낸다. 기본값은 종전대로 `<PROJ>/qa/sweep`.
 * 🔴 두 판(폴백/WebGL, 또는 수정 전/후)을 **서로 덮어쓰지 않고** 대조할 때 쓴다. */
const OUT = process.env.OUT_DIR ?? join(PROJ, 'qa', 'sweep');
mkdirSync(OUT, { recursive: true });
const rel = (p) => relative(PROJ, p);

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ══════════════ 🔴 렌더 경로 — **폴백이 기준 경로다** (오케스트레이터 확정 · 2026-08-22) ══════════════
 *
 * 왜 WebGL 이 아니라 폴백인가:
 *   WebGL 씬은 rAF 로 계속 움직인다 → 「파라미터를 안 건드린 군」의 군내 거리(노이즈 바닥)가
 *   0 이 아니다 → 문턱 `max(within×K, DIST_FLOOR)` 이 올라가고 **약한 신호가 노이즈에 묻힌다.**
 *   폴백(Canvas2D)은 rAF 가 없어 정지 그림이라 군내 거리가 0.000 % 다.
 *
 * 🔴 실측 근거 — **WebGL 수치로 슬라이더 생사를 판정하면 오탐이 난다:**
 *   · `wafer/basic` V: WebGL 12.512 % 로 DEAD 판정 ↔ 폴백 3.685 % 정상  (최소 2건이 오탐이었다)
 *   · `deposition/lab-advanced` `annealTimeS`: 폴백 0.256 % 검출 ↔ WebGL 0.588 %(문턱 0.693 %) 묻힘
 *   → 폴백으로 판정하고, **WebGL 은 회귀 확인용**으로 따로 돌린다.
 *
 * 사용:
 *   node scripts/qa-sweep.mjs                 WebGL 경로(종전 기본값 · 회귀 확인용)
 *   node scripts/qa-sweep.mjs --fallback      🔵 **기준 경로**. Canvas2D 폴백을 강제한다
 *   QA_RENDER_PATH=fallback node scripts/qa-sweep.mjs   같은 뜻(환경변수)
 *
 * 🔴 기본값을 폴백으로 **바꾸지 않았다.** 이 도구의 출력은 여러 문서가 인용하고 있어서,
 *    같은 명령이 말없이 다른 경로를 재기 시작하면 과거 표와 비교가 불가능해진다.
 *    기준 경로를 쓰려면 플래그를 명시하라 — 어느 경로로 잰 표인지가 출력 머리에 박힌다.
 */
const RENDER_PATH = (process.argv.includes('--fallback') || process.env.QA_RENDER_PATH === 'fallback')
  ? 'fallback' : 'webgl';
/** WebGL 컨텍스트 요청에 `null` 을 돌려줘 앱을 Canvas2D 폴백 경로로 강제 진입시킨다. */
const KILL_WEBGL = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
    return orig.call(this, type, ...rest);
  };
};

/* ══════════════════════════════ 판정 상수 ══════════════════════════════
 *
 * 🔴 여기 숫자를 바꾸면 24칸 판정이 통째로 바뀐다. 이유 없이 만지지 않는다.
 */

/** 한 군(group)당 캡처 수. 요구 하한 4.
 *  군내 거리는 N(N-1)/2 = 6쌍에서 나온다. 6쌍은 노이즈 「최댓값」 추정에는 적은 표본이라
 *  아래 K 로 여유를 준다. */
const N_CAPTURE = 4;

/** 캡처 간격(ms). 요구 하한 300. 애니메이션이 한 주기 안에서 충분히 다른 위상을
 *  밟도록 넉넉히 둔다. 너무 짧으면 노이즈 바닥을 과소평가해 위양성이 늘어난다. */
const CAPTURE_GAP_MS = 320;

/** 슬라이더를 움직인 뒤 렌더가 안정될 때까지 기다리는 시간(ms). */
const SETTLE_MS = 450;

/**
 * 🔴 판정 계수 K = 3.0.
 *
 * 판정식: `between_mean > within_max × K`
 *
 * 근거 —
 *  ① `within_max` 는 **표본 6쌍에서 얻은 최댓값**이다. 진짜 노이즈 상한의
 *     불편추정량이 아니라 **과소추정**이다(표본이 커질수록 최댓값은 커진다).
 *     그래서 관측 최댓값을 그대로 문턱으로 쓰면 위양성이 난다.
 *  ② 표본이 6쌍뿐이라 평균±kσ 같은 분포 가정 기반 문턱은 신뢰구간이 너무 넓다.
 *     따라서 분포를 가정하지 않고 **관측 최댓값에 곱셈 여유**를 주는 쪽을 택했다.
 *  ③ 3배는 「노이즈 상한을 3배 넘게 벗어났다」는 뜻으로, 이전 계측기가 프레임마다
 *     100% 위양성이었던 것과 정반대 방향으로 보수적이다.
 *
 * 🔴 K 를 크게 잡은 대가는 **위음성**이다(작은 국소 변화 — 예: 이온 화살표 점등 —
 *    가 노이즈에 묻힐 수 있다). 그래서 false 판정 칸은 **반드시 PNG 를 남기고
 *    「눈 확인 필요」 목록에 올린다.** 계측기를 안 믿는 것이 이 프로젝트의 규율이다.
 */
const K = 3.0;

/**
 * 절대 하한. 거리는 [0,1] 로 정규화돼 있고 「히스토그램 질량이 몇 % 이동했나」로 읽힌다.
 * 정지 씬이면 within_max 가 0 이 되어 K 판정이 무의미해지므로, 최소 0.05% 는
 * 움직여야 변화로 인정한다. 위음성을 만들지 않도록 일부러 아주 낮게 뒀다.
 */
const DIST_FLOOR = 0.0005;

/* ═══════════════════════ 렌더 완료 대기 (2026-08-21 신설) ═══════════════════════
 *
 * 🔴 왜 필요한가 — **캡처 성공이 「씬이 그려졌다」를 뜻하지 않는다.**
 *    씬은 지연 로딩 청크다. 청크가 아직 안 왔거나(느림) 404 로 못 오면(재빌드 사고)
 *    `<canvas>` 엘리먼트는 **존재하는데 비어 있다.** 스크린샷도 성공하고 PNG 도 멀쩡하다.
 *    종전 코드는 그 빈 화면을 그대로 재서 「씬이 파라미터에 반응 안 함」이라고 말했다.
 *
 * 대기 방법으로 무엇을 골랐나 — **캔버스 화소를 직접 폴링**한다(`analyzePNG`).
 *    후보였던 다른 둘을 버린 이유:
 *      · 네트워크 요청 완료 대기 → 요청이 **성공했는지**를 안 본다. 404 도 「완료」다.
 *        (실제 사고가 정확히 404 였다. 이 방식이었으면 또 놓친다.)
 *      · rAF N회 경과 대기 → 프레임이 흘렀다는 것과 **무엇이 그려졌다**는 건 무관하다.
 *    화소 폴링만이 「지금 화면에 실제로 뭔가 있다」를 직접 본다. 판정 함수를 캡처 때와
 *    **똑같이 재사용**하므로 대기 기준과 판정 기준이 어긋날 수 없다.
 *
 * 🔴 무한정 기다리지 않는다. 상한에 걸리면 **「대기 실패」로 기록하고 그 칸을 null 로 남긴다.**
 *    조용히 넘어가면 지금과 같은 사고가 반복된다.
 */
const RENDER_WAIT_MS = 8000;   // 상한. 넘으면 대기 실패로 기록한다(조용히 넘어가지 않는다).
const RENDER_POLL_MS = 250;    // 폴링 간격.

/* ═════════════════ 이전 실행 잔재 격리 (2026-08-21 신설) ═════════════════
 *
 * 🔴 2026-08-21 실측으로 드러난 **세 번째 계측기 결함**이다. 앞의 둘보다 위험하다.
 *
 *    `qa/sweep/` 는 한 번도 청소된 적이 없다. 그런데 증거 PNG 는 **`sceneChanged !== true`
 *    일 때만** 기록된다. 그래서 어떤 슬라이더가 지난 실행에서 false 였다가 이번에 true 가
 *    되면 **지난 실행의 PNG 가 덮이지 않고 그대로 남는다.** 파일명에는 실행 구분이 없다.
 *
 *    실제로 그렇게 됐다:
 *      · 21:33 중단된 실행이 남긴  `etch-lab-applied-s1-소스_파워_ICP_P_s-scene-{min,max}.png`
 *        — 씬 청크 404 로 캔버스가 백지인 상태에서 캡처된 2장(두 파일은 **바이트 동일**)
 *      · 21:37~21:42 실행은 같은 슬라이더를 `sceneChanged: true` 로 판정 → PNG 를 안 씀
 *      · 결과: 21:42 보고서 옆에 21:33 의 백지 2장이 **현재 증거인 척** 놓여 있었다
 *
 *    이 때문에 조사자가 「계측기가 백지 두 장을 비교해 무변화로 판정했다」고 읽었다.
 *    실제로는 그 2장은 이번 측정에 **들어간 적조차 없다.** 계측기가 오답을 낸 게 아니라
 *    **오독을 유발하는 증거를 방치**한 것이다 — 결론이 틀리는 건 마찬가지다.
 *
 * 🔴 지우지 않고 옮긴다. 지난 증거도 사고 기록이라 삭제하면 추적이 끊긴다.
 */
const STALE_DIR = join(OUT, '_stale');

function quarantineStale() {
  let moved = 0;
  if (!existsSync(OUT)) return moved;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith('.png')) continue;
    mkdirSync(STALE_DIR, { recursive: true });
    renameSync(join(OUT, f), join(STALE_DIR, `${stamp}__${f}`));
    moved++;
  }
  return moved;
}

/* ══════════════════ 디코더 자가검증 ② — Chrome 이 만든 PNG ══════════════════
 *
 * 🔴 여기가 **진짜 독립 검증**이다. 인코딩을 내가 안 했다. Chrome(libpng)이 적응형으로
 *    필터를 섞어 쓴 PNG 를 받아, **화면상 색이 무엇인지 우리가 미리 아는** 상태에서
 *    디코딩 결과를 대조한다. 역필터가 틀렸으면 그림이 깨져 색 대조가 실패한다.
 */
async function selfTestChrome(ctx) {
  const results = [];
  const page = await ctx.newPage();
  try {
    await page.setContent(`<body style="margin:0;background:#fff">
      <div id="half" style="width:200px;height:100px;
        background:linear-gradient(to right, rgb(255,0,0) 0 50%, rgb(0,0,255) 50% 100%)"></div>
      <div id="grad" style="width:256px;height:32px;
        background:linear-gradient(to right, rgb(0,0,0) 0, rgb(255,255,255) 100%)"></div>
      <div id="solid" style="width:64px;height:64px;background:rgb(17,238,85)"></div>
    </body>`);
    await page.waitForTimeout(200);

    // (a) 반반 색 블록 — 정확한 색값과 화소 수
    {
      const buf = await (await page.$('#half')).screenshot({ type: 'png' });
      const d = decodePNG(buf);
      const px = (x, y) => [d.rgb[(y * d.width + x) * 3], d.rgb[(y * d.width + x) * 3 + 1], d.rgb[(y * d.width + x) * 3 + 2]];
      let red = 0; let blue = 0;
      for (let i = 0; i < d.rgb.length; i += 3) {
        if (d.rgb[i] > 250 && d.rgb[i + 1] < 5 && d.rgb[i + 2] < 5) red++;
        if (d.rgb[i] < 5 && d.rgb[i + 1] < 5 && d.rgb[i + 2] > 250) blue++;
      }
      const total = d.width * d.height;
      const [lr, lg, lb] = px(10, 10); const [rr, rg, rb] = px(d.width - 10, 10);
      const ok = d.width === 200 && d.height === 100
        && lr === 255 && lg === 0 && lb === 0 && rr === 0 && rg === 0 && rb === 255
        && Math.abs(red - total / 2) <= total * 0.02 && Math.abs(blue - total / 2) <= total * 0.02;
      results.push({
        name: 'Chrome PNG · 반반 블록(적/청)', ok,
        detail: `${d.width}x${d.height} 컬러타입${d.color}/${d.depth}bit · 좌(${lr},${lg},${lb}) 우(${rr},${rg},${rb}) · 순적 ${red}px 순청 ${blue}px / ${total}px`,
      });
    }
    // (b) 흑→백 그라디언트 — 단조 증가와 양 끝값
    {
      const buf = await (await page.$('#grad')).screenshot({ type: 'png' });
      const d = decodePNG(buf);
      const row = 16; let mono = true; let prevV = -1;
      for (let x = 0; x < d.width; x++) {
        const v = d.rgb[(row * d.width + x) * 3];
        if (v < prevV - 1) { mono = false; break; }
        prevV = v;
      }
      const first = d.rgb[(row * d.width) * 3];
      const last = d.rgb[(row * d.width + d.width - 1) * 3];
      const ok = mono && first <= 4 && last >= 250;
      results.push({
        name: 'Chrome PNG · 흑→백 그라디언트', ok,
        detail: `${d.width}x${d.height} · 단조증가 ${mono} · 좌끝 ${first} 우끝 ${last}`,
      });
    }
    // (c) 단색 블록 — 히스토그램이 한 bin 에 몰리는지 + 거리 0
    {
      const buf = await (await page.$('#solid')).screenshot({ type: 'png' });
      const d = decodePNG(buf);
      const h = histogram(d.rgb);
      const selfD = histDist(h, h);
      let peak = 0; for (let i = 0; i < HIST_BINS; i++) peak = Math.max(peak, h[i]);
      const [r, g, b] = [d.rgb[0], d.rgb[1], d.rgb[2]];
      const ok = r === 17 && g === 238 && b === 85 && peak > 0.99 && selfD === 0;
      results.push({
        name: 'Chrome PNG · 단색 rgb(17,238,85) + 히스토그램', ok,
        detail: `화소(${r},${g},${b}) · 최대 bin 비중 ${peak.toFixed(4)} · 자기거리 ${selfD}`,
      });
    }
  } catch (e) {
    results.push({ name: 'Chrome PNG 검증', ok: false, detail: e.message });
  } finally { await page.close(); }
  return results;
}

/* ══════════════════════════════ 정적 서버 ══════════════════════════════ */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let f = join(DIST, p);
  const hasExt = extname(p) !== '';
  try {
    if (!existsSync(f) || statSync(f).isDirectory()) {
      // 🔴 확장자가 있는 요청(자산)은 index.html 로 폴백하지 않는다.
      //    폴백하면 없는 JS 청크가 text/html 로 돌아와 MIME 오류로만 보이고 원인이 숨는다.
      if (hasExt) { console.error(`  🔴 404 ${p}`); res.writeHead(404).end(); return; }
      f = join(DIST, 'index.html');
    }
  } catch { f = join(DIST, 'index.html'); }
  try { res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const catalog = JSON.parse(readFileSync(join(APP, 'src/content/catalog.json'), 'utf8'));
const pids = Object.entries(catalog.processes).filter(([, d]) => d.status === 'active').map(([k]) => k);
const STAGES = ['lab-basic', 'lab-applied', 'lab-advanced'];

/* 🔴 측정 전에 지난 실행의 PNG 를 격리한다. 안 하면 이번 실행이 안 쓴 파일이 이번 증거인 척 남는다. */
const staleMoved = quarantineStale();
if (staleMoved) console.log(`■ 이전 실행 잔재 ${staleMoved}장을 ${rel(STALE_DIR)} 로 격리했다 (지우지 않았다)`);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const rows = [];
const consoleErrors = [];
const decodeErrors = [];
/** 🔴 무효(백지) 프레임을 만난 자리. 요약에서 **반드시** 출력한다 — 조용히 넘어가면 사고가 반복된다. */
const invalidFrames = [];
/** 🔴 렌더 대기 상한을 넘긴 자리. 여기 걸린 칸의 씬 판정은 무조건 null 이다. */
const renderWaitFailures = [];
let selfTests = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });

  /* ── 0. 계측기 검증 먼저 ── */
  selfTests = [...selfTestSynthetic(), ...(await selfTestChrome(ctx))];
  const stFail = selfTests.filter((t) => !t.ok);
  console.log('\n■ PNG 디코더 자가검증');
  for (const t of selfTests) console.log(`  ${t.ok ? '✅' : '🔴'} ${t.name}${t.detail ? ` — ${t.detail}` : ''}`);
  if (stFail.length) {
    console.error(`\n🔴 디코더 검증 ${stFail.length}건 실패 — 스윕을 중단한다. 계측기를 못 믿는 상태로 측정하지 않는다.`);
    await ctx.close(); await browser.close(); await new Promise((r) => server.close(r));
    process.exit(1);
  }

  /* 🔴 폴백 강제는 **페이지 생성 전**에 걸어야 한다 — `getContext` 는 첫 렌더에서 이미 불린다.
   *    자가검증(selfTestChrome)은 이 위에서 이미 끝났으므로 영향받지 않는다. */
  if (RENDER_PATH === 'fallback') await ctx.addInitScript(KILL_WEBGL);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });

  /**
   * 🔴 캔버스에 **실제로 뭔가 그려질 때까지** 기다린다. 상한 `RENDER_WAIT_MS`.
   *
   * 반환 `{ ok, waitedMs, reason, buf }`. `ok=false` 면 호출부는 그 칸을 **null(판정불가)**
   * 로 남겨야 한다. 🔴 여기서 조용히 true 를 돌려주면 백지를 재는 사고가 그대로 재현된다.
   */
  const waitForSceneRender = async (tag, ci = 0) => {
    const t0 = Date.now();
    let last = ci === 0 ? '캔버스 없음' : `캔버스[${ci}] 없음`;   // NC=1 은 종전 문구 그대로
    while (Date.now() - t0 < RENDER_WAIT_MS) {
      /* 🔴 `page.$('canvas')` 는 **첫 캔버스**만 잡는다. 씬 병치 칸(캔버스 2개)에서는
       *    두 번째 씬이 백지여도 첫 캔버스가 유효해지는 순간 대기를 통과해 버렸다.
       *    이제 **재려는 캔버스 그 자체**가 그려질 때까지 기다린다. */
      const el = (await page.$$('canvas'))[ci];
      if (el) {
        try {
          const buf = await el.screenshot({ type: 'png' });
          const a = analyzePNG(buf);
          if (a.valid) return { ok: true, waitedMs: Date.now() - t0, reason: null, buf };
          last = a.reason;
        } catch (e) { last = `스크린샷 실패: ${e.message}`; }
      }
      await page.waitForTimeout(RENDER_POLL_MS);
    }
    const waitedMs = Date.now() - t0;
    const reason = `대기 실패(${RENDER_WAIT_MS}ms 상한 초과) — 마지막 상태: ${last}`;
    renderWaitFailures.push(`${tag} — ${reason}`);
    return { ok: false, waitedMs, reason, buf: null };
  };

  /**
   * 캔버스를 N회 캡처해 히스토그램 군을 만든다. 실패하면 null.
   *
   * 🔴 2026-08-21 — **프레임 유효성 판정을 캡처 시점에 건다.**
   *    종전에는 「스크린샷이 성공하고 PNG 가 디코딩되면 유효한 측정」으로 취급했다.
   *    씬이 안 뜬 백지도 그 조건을 통과한다. 이제 무효 프레임은 히스토그램에 넣지 않고
   *    `invalid[]` 에 사유와 함께 쌓는다. 호출부는 **무효가 하나라도 있으면 null** 로 간다.
   *
   *    무효 프레임도 `sampleBuf` 로 한 장 남긴다 — 사람이 「무엇이 찍혔길래 무효인가」를
   *    눈으로 볼 경로가 없으면 다음 사람이 또 추측으로 원인을 지어낸다.
   */
  const captureGroup = async (tag, ci = 0) => {
    const hists = []; const invalid = []; const stats = [];
    let firstBuf = null; let lastBuf = null; let sampleBuf = null; let size = null;

    // ① 그려질 때까지 먼저 기다린다. 상한에 걸리면 캡처를 시도조차 하지 않고 사유를 들고 나온다.
    const w = await waitForSceneRender(tag, ci);
    if (!w.ok) return { hists: [], invalid: [w.reason], stats: [], firstBuf: null, lastBuf: null,
      sampleBuf: null, size: null, n: 0, waitFailed: true, waitedMs: w.waitedMs, canvasIndex: ci };

    for (let i = 0; i < N_CAPTURE; i++) {
      if (i > 0) await page.waitForTimeout(CAPTURE_GAP_MS);
      const el = (await page.$$('canvas'))[ci];
      if (!el) return null;
      let buf;
      try { buf = await el.screenshot({ type: 'png' }); }
      catch (e) { decodeErrors.push(`${tag} 스크린샷 실패: ${e.message}`); continue; }
      let d;
      try { d = decodePNG(buf); }
      catch (e) { decodeErrors.push(`${tag} 디코드 실패: ${e.message}`); invalid.push(`디코드 실패: ${e.message}`); continue; }

      const a = analyzeFrame(d);
      size = `${d.width}x${d.height}`;
      stats.push({ std: +a.std.toFixed(3), uniq: a.uniq, valid: a.valid });
      if (!a.valid) {
        invalid.push(`캡처#${i}: ${a.reason}`);
        invalidFrames.push(`${tag} 캡처#${i} — ${a.reason}`);
        if (!sampleBuf) sampleBuf = buf;       // 눈으로 볼 표본 1장
        continue;                               // 🔴 히스토그램에 넣지 않는다
      }
      hists.push(histogram(d.rgb));
      if (!firstBuf) firstBuf = buf;
      lastBuf = buf;
    }
    return { hists, invalid, stats, firstBuf, lastBuf, sampleBuf, size,
      n: hists.length, waitFailed: false, waitedMs: w.waitedMs, canvasIndex: ci };
  };

  /**
   * 군이 판정에 쓸 수 있는 상태인가. 쓸 수 없으면 사유 문자열, 쓸 수 있으면 null.
   * 🔴 무효 프레임 규칙 자체는 `lib/frame.mjs` 의 `frameGateProblem` 에 있다.
   *    `selftest-gates` 의 단위 픽스처가 **바로 그 함수**를 부른다 — 규칙을 두 군데
   *    적어 두면 한쪽만 고쳐지고 픽스처는 계속 통과하기 때문이다.
   */
  const groupProblem = (g, which) => {
    if (!g) return `${which} 군 확보 실패(캔버스 없음)`;
    if (g.waitFailed) return `${which} ${g.invalid[0]}`;
    // 캡처 단계에서 이미 유효/무효를 갈라놨다. 관문이 볼 수 있게 분석 형태로 복원한다.
    const analyses = [
      ...g.invalid.map((reason) => ({ valid: false, reason })),
      ...g.hists.map(() => ({ valid: true, reason: null })),
    ];
    return frameGateProblem(analyses, which, N_CAPTURE);
  };

  const probe = async () => page.evaluate(() => {
    const outs = [...document.querySelectorAll('.qty')].map((el) => {
      const label = el.querySelector('.qty__label')?.textContent ?? '';
      const v = el.querySelector('.qty__value')?.textContent ?? '';
      return `${label}=${v}`;
    });
    const verdict = document.querySelector('.verdict')?.textContent ?? '';
    /* 🔴 캔버스는 **여러 개일 수 있다.** `LabSpec.scenes[]`(씬 병치)를 쓰는 칸은
     *    `div.lab__scenes` 안에 `SceneCanvas` 를 나란히 그린다(`LabRunner.tsx`).
     *    종전에는 `querySelector('canvas')` 로 **첫 캔버스만** 봐서, 두 번째 씬은
     *    무엇을 하든 계측기에 아예 보이지 않았다 = 공식 표가 「무변화」로 오보했다. */
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases[0] ?? null;
    /* 🔴 렌더러 모드를 반드시 같이 읽는다.
     *    「씬이 안 바뀐다」와 「씬이 애초에 안 떴다」는 전혀 다른 사실인데, 캔버스 엘리먼트는
     *    둘 다 존재해서 구분이 안 된다. 2026-08-20 에 실제로 당했다 — 재빌드로 씬 청크가
     *    404 나서 로딩 실패했는데, 표에는 그냥 「무변화」로 찍혔다.
     *    배지 **텍스트는 번역되므로** 클래스명(`sceneBox__mode--<mode>`)에서 뽑는다.
     *    값: webgl | fallback | error (초기값은 아직 로딩 중). */
    const modeOf = (el) => ([...el.classList].find((c) => c.startsWith('sceneBox__mode--'))?.slice(16) ?? '(클래스없음)');
    const sceneModes = [...document.querySelectorAll('.sceneBox__mode')].map(modeOf);
    const sceneNotes = [...document.querySelectorAll('.sceneBox__note')].map((el) => (el.textContent ?? '').slice(0, 60));
    return {
      outs, verdict, hasCanvas: canvas !== null,
      /** 🔴 「씬이 몇 개 그려지는가」. 0/1/N 을 구분해야 병치 칸을 셀 수 있다. */
      canvasCount: canvases.length,
      sceneModes, sceneNotes,
      /** 종전 스칼라 — 첫 캔버스의 모드. 표 폭과 과거 판독을 유지하려고 남긴다. */
      sceneMode: sceneModes[0] ?? null,
      juxtaposed: document.querySelectorAll('.lab__scenes').length,
      assumptionCount: document.querySelectorAll('.qty__assumptions li').length,
      sliders: document.querySelectorAll('input[type="range"]').length,
    };
  });

  const sliderMeta = async () => page.evaluate(() => [...document.querySelectorAll('input[type="range"]')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? '(무명)', min: el.min, max: el.max, value: el.value })));

  const setSlider = async (idx, target) => page.evaluate((w) => {
    const els = [...document.querySelectorAll('input[type="range"]')];
    const el = els[w.idx];
    if (!el) return null;
    const v = w.target === 'min' ? el.min : w.target === 'max' ? el.max : String(w.target);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { label: el.getAttribute('aria-label') ?? '(무명)', value: v };
  }, { idx, target });

  for (const pid of pids) {
    for (const stage of STAGES) {
      const route = `#/p/${pid}/${stage}`;
      const name = `${pid}-${stage}`;
      process.stderr.write(`  … ${name}\n`);
      await page.evaluate((r) => { location.hash = r; }, route);
      await page.waitForFunction((r) => location.hash === r, route, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);

      const base = await probe();
      if (base.sliders === 0) {
        rows.push({ name, wired: false, note: '슬라이더 없음 — 배선 안 됨', hasCanvas: base.hasCanvas });
        continue;
      }
      const metas = await sliderMeta();

      /* 🔴 이 칸의 캔버스 수. **여기부터 모든 계측이 캔버스 축을 갖는다.** */
      const nCanvas = base.canvasCount;
      const CI = Array.from({ length: nCanvas }, (_, i) => i);
      /* 🔴 **캔버스 1개인 칸(23칸)은 수정 전과 완전히 같은 것을 내보내야 한다.**
       *    계측기를 고치면 보통 과거 데이터가 죽는다. 그것을 막으려면 파일명뿐 아니라
       *    **사유 문자열·태그까지** NC=1 에서 종전 문구 그대로여야 한다 — 사유 문자열은
       *    `frameProblem` 을 타고 표와 JSON 에 그대로 실린다. */
      const cTag = (ci) => (nCanvas > 1 ? `-c${ci}` : '');
      /** 군 이름표. NC=1 이면 종전 문구(`min`·`max`·`대조군`) 그대로. */
      const cLab = (base, ci) => (nCanvas > 1 ? `${base}[c${ci}]` : base);
      /** 렌더 대기 태그. NC=1 이면 종전 태그 그대로. */
      const cTagName = (base, ci) => (nCanvas > 1 ? `${base}/c${ci}` : base);

      /* ── 대조군: 파라미터를 **전혀 건드리지 않은** 상태에서 군내 거리 — **캔버스마다** ── */
      const controls = [];
      for (const ci of CI) {
        const g = await captureGroup(cTagName(`${name}/대조군`, ci), ci);
        const problem = groupProblem(g, cLab('대조군', ci));
        controls.push(problem ? { canvasIndex: ci, within: null, n: g?.n ?? 0, size: g?.size ?? null, problem }
          : { canvasIndex: ci, within: withinMax(g.hists), n: g.n, size: g.size, problem: null });
        // 🔴 무효 프레임이면 그 표본을 남긴다 — 「무엇이 찍혔길래 무효인가」를 볼 경로.
        if (g?.firstBuf) writeFileSync(join(OUT, `${name}${cTag(ci)}-control.png`), g.firstBuf);
        else if (g?.sampleBuf) writeFileSync(join(OUT, `${name}${cTag(ci)}-control-INVALID.png`), g.sampleBuf);
      }
      /** 종전 스칼라 — 첫 캔버스의 대조군. 표와 JSON 의 기존 키를 유지한다. */
      const control = controls[0] ?? null;

      /* ── 슬라이더 전수: 출력 변화 + 씬 군간 거리 ── */
      const perSlider = [];
      for (let idx = 0; idx < metas.length; idx++) {
        const m = metas[idx];
        const lo = await setSlider(idx, 'min');
        await page.waitForTimeout(SETTLE_MS);
        const before = await probe();
        /* 🔴 **캔버스를 전부 캡처한다.** 슬라이더를 한 번 min 으로 놓은 상태에서 모든 캔버스를
         *    찍어야 같은 조건의 비교가 된다 — 캔버스마다 슬라이더를 다시 놓으면 조건이 어긋난다. */
        const gMin = [];
        for (const ci of CI) gMin.push(await captureGroup(cTagName(`${name}/s${idx}/min`, ci), ci));

        const hi = await setSlider(idx, 'max');
        await page.waitForTimeout(SETTLE_MS);
        const after = await probe();
        const gMax = [];
        for (const ci of CI) gMax.push(await captureGroup(cTagName(`${name}/s${idx}/max`, ci), ci));

        // 원래 값으로 되돌린다 — 다음 슬라이더가 같은 기준선에서 시험되도록.
        await setSlider(idx, m.value);
        await page.waitForTimeout(200);

        /* 🔴 무효 프레임이 섞였으면 **거리를 계산하지 않는다.**
         *    계산해 두면 누군가 그 숫자를 쓴다. 아예 null 로 둔다. */
        const perCanvas = CI.map((ci) => {
          const pMin = groupProblem(gMin[ci], cLab('min', ci));
          const pMax = groupProblem(gMax[ci], cLab('max', ci));
          const fp = [pMin, pMax].filter(Boolean).join(' / ') || null;
          return {
            canvasIndex: ci,
            sceneMode: before.sceneModes[ci] ?? null,
            withinMin: pMin ? null : withinMax(gMin[ci].hists),
            withinMax: pMax ? null : withinMax(gMax[ci].hists),
            between: fp ? null : betweenMean(gMin[ci].hists, gMax[ci].hists),
            frameProblem: fp,
            waitedMs: [gMin[ci]?.waitedMs, gMax[ci]?.waitedMs].filter((v) => typeof v === 'number'),
            frameStats: { min: gMin[ci]?.stats ?? [], max: gMax[ci]?.stats ?? [] },
            minBuf: gMin[ci]?.firstBuf ?? gMin[ci]?.sampleBuf ?? null,
            maxBuf: gMax[ci]?.firstBuf ?? gMax[ci]?.sampleBuf ?? null,
            size: gMin[ci]?.size ?? gMax[ci]?.size ?? null,
          };
        });

        /* 🔴 슬라이더 단위 스칼라는 **캔버스들의 롤업**이다 — 「어느 캔버스든 하나라도 움직였는가」.
         *    합치는 방향이 반대(평균·첫 캔버스)면 한쪽의 변화가 다른 쪽 정지 그림에 묻힌다. */
        const num = (v) => (typeof v === 'number' ? v : null);
        const maxOf = (vals) => { const f = vals.filter((v) => typeof v === 'number'); return f.length ? Math.max(...f) : null; };
        perSlider.push({
          idx, label: m.label, range: `${lo?.value} → ${hi?.value}`,
          outsChanged: JSON.stringify(before.outs) !== JSON.stringify(after.outs),
          verdictChanged: before.verdict !== after.verdict,
          withinMin: num(perCanvas[0]?.withinMin), withinMax: num(perCanvas[0]?.withinMax),
          /** 종전 스칼라 `between` — 🔴 「가장 크게 움직인 캔버스」의 값이다(첫 캔버스가 아니다). */
          between: maxOf(perCanvas.map((c) => c.between)),
          frameProblem: perCanvas.map((c) => c.frameProblem).filter(Boolean).join(' / ') || null,
          waitedMs: perCanvas.flatMap((c) => c.waitedMs),
          frameStats: perCanvas[0]?.frameStats ?? { min: [], max: [] },
          size: perCanvas.find((c) => c.size)?.size ?? null,
          perCanvas,
        });
      }

      /* ── 칸 단위 노이즈 바닥 = 이 칸에서 관측한 모든 「파라미터 고정 군」의 최댓값 ──
       *    슬라이더별로 다른 문턱을 쓰면 어떤 슬라이더는 운 좋게 조용한 군을 뽑아
       *    문턱이 낮아진다. 칸 전체에서 가장 시끄러웠던 군을 기준으로 삼는다. */
      /* 🔴 무효 프레임이 섞인 군의 within 은 위에서 이미 null 이므로 여기서 자동으로 빠진다.
       *    (백지 군의 within 은 0 에 가까워 문턱을 왜곡한다 — 표본에 들이면 안 된다.) */
      /* 🔴 **문턱은 캔버스마다 따로 낸다.** 합치면 시끄러운 캔버스(예: rAF 도는 WebGL 씬)의
       *    노이즈가 조용한 캔버스의 문턱까지 끌어올려, **한쪽의 진짜 변화가 다른 쪽 노이즈에 묻힌다.**
       *    실측: `deposition/lab-advanced` 의 `annealTimeS` 는 폴백 0.256 % 로 검출되지만
       *    WebGL 에서는 문턱 0.693 % 에 묻힌다 — 축을 합치면 이 구분이 사라진다. */
      const withinOf = (ci) => [controls[ci]?.within, ...perSlider.flatMap((s) => [s.perCanvas[ci]?.withinMin, s.perCanvas[ci]?.withinMax])]
        .filter((v) => typeof v === 'number');
      const canvasWithinMax = CI.map((ci) => { const w = withinOf(ci); return w.length ? Math.max(...w) : null; });
      /** 종전 스칼라 — 칸 전체 노이즈 바닥(캔버스 축의 최댓값). 요약표가 계속 쓴다. */
      const cellWithinMax = canvasWithinMax.filter((v) => typeof v === 'number').length
        ? Math.max(...canvasWithinMax.filter((v) => typeof v === 'number')) : null;

      for (const s of perSlider) {
        for (const c of s.perCanvas) {
          const wm = canvasWithinMax[c.canvasIndex];
          /* 🔴 2026-08-21 — 무효 프레임이 하나라도 섞였으면 **true 로도 false 로도 쓰지 않는다.**
           *    「군내 분포를 못 구하면 null」과 같은 규율을 무효 프레임에 적용한 것이다.
           *    빈 그림 둘을 비교해 「무변화」라고 말하느니 「판정 불가」라고 말한다. */
          if (c.frameProblem) { c.sceneChanged = null; c.why = `판정불가 · ${c.frameProblem}`; continue; }
          if (wm === null || c.between === null) { c.sceneChanged = null; c.why = '군내분포 확보 실패'; continue; }
          c.threshold = Math.max(wm * K, DIST_FLOOR);
          c.sceneChanged = c.between > c.threshold;
          c.why = c.sceneChanged ? `${c.between.toExponential(3)} > ${c.threshold.toExponential(3)}`
            : `${c.between.toExponential(3)} ≤ ${c.threshold.toExponential(3)}`;
        }
        if (!base.hasCanvas) { s.sceneChanged = null; s.why = '씬없음'; continue; }
        /* 슬라이더 판정 = **캔버스 롤업.** 하나라도 확실히 움직였으면 true,
         * 전부 판정불가면 null, 그 밖은 false. 🔴 「전부 움직여야 true」로 하면
         * 병치 칸에서 한쪽 씬만 반응하는 정상 설계가 전부 DEAD 로 오보된다. */
        const ch = s.perCanvas.map((c) => c.sceneChanged);
        s.sceneChanged = ch.some((v) => v === true) ? true : (ch.every((v) => v === null) ? null : false);
        s.threshold = s.perCanvas.find((c) => c.sceneChanged === true)?.threshold
          ?? s.perCanvas.map((c) => c.threshold).find((v) => typeof v === 'number') ?? undefined;
        s.why = nCanvas > 1
          ? s.perCanvas.map((c) => `c${c.canvasIndex}: ${c.why}`).join(' | ')
          : (s.perCanvas[0]?.why ?? '군내분포 확보 실패');
      }

      /* ── 증거 PNG ──
       * 🔴 위음성 대비. false / 판정불가 로 나온 슬라이더는 **반드시** 캔버스 before/after 를
       *    남긴다. 사람이 눈으로 열어 확인할 유일한 경로다. */
      const evidence = [];
      for (const s of perSlider) {
        if (!base.hasCanvas) continue;
        if (s.sceneChanged === true) continue;   // true 는 이미 수치가 증거다
        const safe = String(s.label).replace(/[^0-9A-Za-z가-힣]+/g, '_').slice(0, 24) || `s${s.idx}`;
        /* 🔴 무효 프레임 표본은 **파일명에 INVALID 를 박는다.** 정상 증거와 섞여 놓이면
         *    다음 사람이 그걸 정상 캡처로 읽고 엉뚱한 결론을 낸다(2026-08-21 실제 사고). */
        /* 🔴 **캔버스마다 따로 남긴다.** 파일명에 캔버스 인덱스를 안 박으면 두 캔버스가
         *    서로를 덮어써서, 남은 한 장이 「그 슬라이더의 증거」인 척한다. */
        for (const c of s.perCanvas) {
          if (c.sceneChanged === true) continue;   // true 는 이미 수치가 증거다
          const tag = c.frameProblem ? '-INVALID' : '';
          if (c.minBuf) {
            const p = join(OUT, `${name}-s${s.idx}${cTag(c.canvasIndex)}-${safe}-scene-min${tag}.png`);
            writeFileSync(p, c.minBuf); c.pathMin = rel(p);
          }
          if (c.maxBuf) {
            const p = join(OUT, `${name}-s${s.idx}${cTag(c.canvasIndex)}-${safe}-scene-max${tag}.png`);
            writeFileSync(p, c.maxBuf); c.pathMax = rel(p);
          }
          if (c.pathMin || c.pathMax) {
            evidence.push(`${s.label}${nCanvas > 1 ? ` [c${c.canvasIndex}]` : ''}: ${c.pathMin ?? '-'} | ${c.pathMax ?? '-'}`);
          }
        }
        // 종전 스칼라 — 첫 캔버스의 경로. 기존 판독기가 계속 읽는다.
        s.pathMin = s.perCanvas[0]?.pathMin; s.pathMax = s.perCanvas[0]?.pathMax;
      }
      for (const s of perSlider) for (const c of s.perCanvas) { c.minBuf = null; c.maxBuf = null; }

      /* ── 전체 화면 before/after (출력을 실제로 바꾼 슬라이더 기준) ── */
      const used = perSlider.find((s) => s.outsChanged) ?? perSlider[0];
      await setSlider(used.idx, 'min');
      await page.waitForTimeout(SETTLE_MS);
      const pgBefore = join(OUT, `${name}-before.png`);
      await page.screenshot({ path: pgBefore });
      await setSlider(used.idx, 'max');
      await page.waitForTimeout(SETTLE_MS);
      const pgAfter = join(OUT, `${name}-after.png`);
      await page.screenshot({ path: pgAfter });
      const post = await probe();

      const sceneWired = perSlider.filter((s) => s.sceneChanged === true).length;
      const sceneUndecided = perSlider.filter((s) => s.sceneChanged === null).length;
      const bestBetween = perSlider.reduce((a, s) => (typeof s.between === 'number' && (a === null || s.between > a) ? s.between : a), null);

      let cellScene;
      if (!base.hasCanvas) cellScene = null;
      else if (sceneWired > 0) cellScene = true;
      else if (sceneUndecided === perSlider.length) cellScene = null;
      else cellScene = false;

      /* 🔴 캔버스별 롤업 — **합치지 않고 갈라서 내보낸다.** 합치면 한쪽 변화가 다른 쪽 노이즈에 묻힌다. */
      const perCanvasCell = CI.map((ci) => {
        const ch = perSlider.map((s) => s.perCanvas[ci]?.sceneChanged);
        const wired = ch.filter((v) => v === true).length;
        const undecided = ch.filter((v) => v === null).length;
        return {
          canvasIndex: ci,
          sceneMode: base.sceneModes[ci] ?? null,
          sceneModeEnd: post.sceneModes[ci] ?? null,
          note: base.sceneNotes[ci] ?? null,
          size: perSlider.map((s) => s.perCanvas[ci]?.size).find(Boolean) ?? controls[ci]?.size ?? null,
          controlWithin: controls[ci]?.within ?? null,
          controlProblem: controls[ci]?.problem ?? null,
          withinMax: canvasWithinMax[ci],
          threshold: canvasWithinMax[ci] === null ? null : Math.max(canvasWithinMax[ci] * K, DIST_FLOOR),
          betweenMean: perSlider.reduce((a, s) => { const v = s.perCanvas[ci]?.between; return typeof v === 'number' && (a === null || v > a) ? v : a; }, null),
          sceneWired: wired, sceneUndecided: undecided,
          sceneChanged: wired > 0 ? true : (undecided === perSlider.length ? null : false),
          sliders: perSlider.map((s) => ({
            idx: s.idx, label: s.label,
            between: s.perCanvas[ci]?.between ?? null,
            threshold: s.perCanvas[ci]?.threshold ?? null,
            sceneChanged: s.perCanvas[ci]?.sceneChanged ?? null,
            why: s.perCanvas[ci]?.why ?? null,
            pathMin: s.perCanvas[ci]?.pathMin ?? null,
            pathMax: s.perCanvas[ci]?.pathMax ?? null,
          })),
        };
      });

      rows.push({
        name, wired: true, hasCanvas: base.hasCanvas,
        renderPath: RENDER_PATH,
        canvasCount: nCanvas, juxtaposed: base.juxtaposed > 0,
        sceneModes: base.sceneModes, sceneModesEnd: post.sceneModes,
        perCanvas: perCanvasCell,
        controls,
        canvasWithinMax,
        sceneMode: base.sceneMode, sceneModeEnd: post.sceneMode,
        param: used.label, range: used.range, sliderIndex: used.idx,
        sliders: metas.length,
        outsChanged: perSlider.some((s) => s.outsChanged),
        verdictChanged: perSlider.some((s) => s.verdictChanged),
        controlWithin: control?.within ?? null,
        controlProblem: control?.problem ?? null,
        frameProblems: perSlider.filter((s) => s.frameProblem).map((s) => `#${s.idx} ${s.label}: ${s.frameProblem}`),
        withinMax: cellWithinMax, betweenMean: bestBetween,
        threshold: cellWithinMax === null ? null : Math.max(cellWithinMax * K, DIST_FLOOR),
        sceneChanged: cellScene, sceneWired, sceneUndecided,
        canvasSize: perSlider.find((s) => s.size)?.size ?? control?.size ?? null,
        assumptions: post.assumptionCount,
        pageBefore: rel(pgBefore), pageAfter: rel(pgAfter),
        evidence,
        perSlider: perSlider.map(({ minBuf, maxBuf, ...r }) => r),   // perCanvas 의 버퍼는 위에서 이미 비웠다
      });
    }
  }
  await ctx.close();
} finally { await browser.close(); await new Promise((r) => server.close(r)); }

/* ══════════════════════════════ 보고 ══════════════════════════════ */
const pad = (s, n) => {
  const str = String(s);
  // 한글은 폭 2로 세어 열을 맞춘다
  let w = 0; for (const c of str) w += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(c) ? 2 : 1;
  return str + ' '.repeat(Math.max(1, n - w));
};
const num = (v) => (typeof v === 'number' ? v.toExponential(3) : '—');
/** 🔴 「씬없음(캔버스 자체가 없다)」과 「판정불가(캔버스는 있는데 군내 분포를 못 구했다)」는
 *  전혀 다른 사실이다. 한 글자로 뭉뚱그리면 다음 사람이 또 오독한다. */
const mark = (v, hasCanvas) => (hasCanvas === false ? '씬없음' : v === null ? '판정불가' : v ? '✅' : '❌');

console.log(`\n■ 척도 — RGB 채널별 ${HIST_BINS}bin 히스토그램 L1 거리(정규화 [0,1]) · 군당 ${N_CAPTURE}캡처 · 간격 ${CAPTURE_GAP_MS}ms`);
console.log(`  판정식: between_mean > max(within_max × K, ${DIST_FLOOR})  ·  K = ${K}`);
console.log(`  프레임 유효성: std ≥ ${FRAME_MIN_STD} **그리고** 고유색 ≥ ${FRAME_MIN_UNIQ}`);
console.log(`    · 126장 실측 근거 — 백지 std 3.008/고유색 6 ↔ 정상 최악 std 25.256/고유색 612 (8.4배·102배 분리)`);
console.log(`    · 🔴 무효 프레임이 하나라도 섞인 판정은 true 로도 false 로도 쓰지 않는다 → null`);
console.log(`  렌더 대기: 캔버스 화소가 유효해질 때까지 최대 ${RENDER_WAIT_MS}ms (${RENDER_POLL_MS}ms 간격) · 상한 초과 시 대기 실패로 기록하고 null`);
/* 🔴 어떤 빌드를 쟀는지 남긴다. 도중 재빌드 사고(§DIST) 이후 필수 기록이 됐다. */
const BUILD_ID = (() => {
  try {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] ?? '(엔트리 못 찾음)';
    return `${DIST} · 엔트리 ${entry} · mtime ${statSync(join(DIST, 'index.html')).mtime.toISOString()}`;
  } catch (e) { return `${DIST} · 빌드 식별 실패: ${e.message}`; }
})();
console.log(`\n■ 측정 대상 빌드 — ${BUILD_ID}`);
/* 🔴 어느 렌더 경로로 쟀는지 **표 머리에 박는다.** 안 박으면 폴백 표와 WebGL 표가 섞여
 *    「같은 칸인데 수치가 다르다」로 읽힌다(둘은 자가 다른 것이지 어느 한쪽이 틀린 게 아니다). */
console.log(`■ 렌더 경로 — ${RENDER_PATH === 'fallback'
  ? '🔵 fallback (Canvas2D 강제 · **기준 경로**) — rAF 가 없어 노이즈 바닥 ≈ 0 이라 약한 신호가 묻히지 않는다'
  : 'webgl (기본값 · **회귀 확인용**) — rAF 애니메이션이 노이즈 바닥을 올려 약한 신호를 묻는다. 🔴 이 수치로 슬라이더 생사를 단정하지 마라(실측 오탐 2건). 기준 판정은 `--fallback` 으로 다시 돌려라'}`);
/* 캔버스가 2개 이상인 칸을 **먼저** 고지한다 — 이 도구가 종전에 첫 캔버스만 봐서 오보하던 자리다. */
const multiCanvasRows = rows.filter((r) => (r.canvasCount ?? 0) > 1);
if (multiCanvasRows.length) {
  console.log(`■ 씬 병치 칸 ${multiCanvasRows.length}건 — 캔버스별로 갈라 잰다(합치면 한쪽 변화가 다른 쪽 노이즈에 묻힌다)`);
  for (const r of multiCanvasRows) console.log(`   · ${r.name} — 캔버스 ${r.canvasCount}개 · 렌더모드 [${(r.sceneModes ?? []).join(', ')}]`);
}

/* ══════════════ 🔴 「무엇을 재고 있는지」 확인도 캔버스마다 한다 ══════════════
 *
 * 🔴 값을 재는 곳만 고치고 **「무엇을 재고 있는지 확인하는 곳」을 안 고치면,
 *    틀린 경로에서 잰 값에 초록불이 붙는다.** 캔버스[1]이 WebGL 로 떠 있는데
 *    「폴백을 재고 있다」고 믿는 상태가 정확히 그것이다.
 *    그래서 요청한 경로와 **각 캔버스의 실제 배지**를 전수 대조해 표 머리에 박는다. */
{
  const want = RENDER_PATH === 'fallback' ? 'fallback' : 'webgl';
  const seen = new Map();
  let checked = 0; let mismatch = 0;
  for (const r of rows) {
    for (const m of (r.sceneModes ?? [])) {
      checked++; seen.set(m, (seen.get(m) ?? 0) + 1);
      if (m !== want) mismatch++;
    }
  }
  const dist = [...seen.entries()].map(([m, n]) => `${m} ${n}`).join(' · ') || '없음';
  console.log(`■ 경로 자기점검 — 요청 '${want}' · 확인한 **캔버스** ${checked}개(칸이 아니라 캔버스다) · 실제 배지 분포: ${dist}`);
  console.log(mismatch === 0
    ? `  ✅ 전 캔버스가 요청 경로와 일치한다.`
    : `  🔴 요청과 다른 캔버스 ${mismatch}개 — 아래 「렌더러가 ${want} 이 아닌…」 목록을 보라. 그 칸의 수치는 요청 경로의 수치가 아니다.`);
}

/* 🔴 면적 %(히스토그램 거리)는 **얇은 선에서 해상도 의존적**이다 — 변화 화소는 선 길이에 선형,
 *    분모는 변의 제곱. 그래서 **캔버스 크기를 밝히지 않은 임계는 다른 해상도로 이식할 수 없다.** */
console.log(`■ 해상도 조건 — 뷰포트 1440×1024 · deviceScaleFactor 1 (dpr 1) · 화소 차분 임계 없음(히스토그램 L1 거리만 쓴다)`);
{
  const sizes = new Map();
  for (const r of rows) for (const c of (r.perCanvas ?? [])) if (c.size) sizes.set(c.size, (sizes.get(c.size) ?? 0) + 1);
  const list = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(' · ');
  console.log(`  캔버스 크기 분포(크기×개수): ${list || '없음'}  ← 🔴 이 표의 % 값은 이 크기에서만 유효하다`);
}
console.log(`\nA5 스윕 실측 — ${rows.length}칸 · 캡처 ${rel(OUT)}\n`);

console.log(
  `${pad('칸', 26)}${pad('슬라', 6)}${pad('사용 파라미터', 24)}${pad('출력', 6)}${pad('판정', 6)}` +
  `${pad('within_max', 12)}${pad('between_mean', 14)}${pad('씬변화', 10)}증거 PNG`,
);
let wired = 0; let live = 0; const dead = []; const eyeCheck = [];
let sceneCells = 0; let sceneOkCells = 0; let sliderTotal = 0; let sliderSceneWired = 0;
let sliderInSceneCells = 0; const noCanvasCells = [];

for (const r of rows) {
  if (!r.wired) { console.log(`${pad(r.name, 26)}${r.note}`); dead.push(r.name); continue; }
  wired++;
  if (r.outsChanged) live++; else dead.push(`${r.name}(출력 무변화)`);
  sliderTotal += r.sliders;
  sliderSceneWired += r.sceneWired;
  if (r.hasCanvas) { sceneCells++; sliderInSceneCells += r.sliders; if (r.sceneChanged === true) sceneOkCells++; }
  else noCanvasCells.push(r.name);
  const png = (r.sceneChanged === true || !r.hasCanvas) ? '—' : (r.evidence[0]?.split(': ')[1] ?? `${r.pageBefore} | ${r.pageAfter}`);
  console.log(
    `${pad(r.name, 26)}${pad(r.sliders, 6)}${pad(String(r.param).slice(0, 20), 24)}` +
    `${pad(r.outsChanged ? '✅' : '❌', 6)}${pad(r.verdictChanged ? '✅' : '—', 6)}` +
    `${pad(num(r.withinMax), 12)}${pad(num(r.betweenMean), 14)}${pad(mark(r.sceneChanged, r.hasCanvas), 10)}${png}`,
  );
  if (r.hasCanvas && r.sceneChanged !== true) {
    /* 🔴 「판정불가」의 사유를 뭉뚱그리지 않는다. 군내분포 실패와 백지 프레임은 원인이 전혀 다르고,
     *    뭉뚱그리면 다음 사람이 엉뚱한 데를 고친다(이 파일이 이미 두 번 겪은 실패 방식이다). */
    const why = r.sceneChanged !== null ? '척도상 무변화'
      : r.frameProblems?.length ? `판정불가(무효 프레임) — ${r.frameProblems[0]}`
        : '판정불가(군내분포 실패)';
    eyeCheck.push({ name: r.name, why: `${why} · 렌더러 ${r.sceneMode}`, evidence: r.evidence, page: `${r.pageBefore} | ${r.pageAfter}` });
  }
}

console.log(`\n■ 대조군 (파라미터 고정 · 군내 최대 거리) — 애니메이션 노이즈 바닥`);
console.log(`${pad('칸', 26)}${pad('렌더러', 10)}${pad('캔버스', 12)}${pad('대조군 within', 14)}${pad('칸 within_max', 14)}문턱(×K)`);
for (const r of rows) {
  if (!r.wired || !r.hasCanvas) continue;
  console.log(`${pad(r.name, 26)}${pad(r.sceneMode ?? '—', 10)}${pad(r.canvasSize ?? '—', 12)}${pad(num(r.controlWithin), 14)}${pad(num(r.withinMax), 14)}${num(r.threshold)}`);
}

/* 🔴 렌더러가 죽어 있으면 「씬이 파라미터에 반응하지 않는다」는 판정은 무의미하다.
 *    씬이 안 뜬 것이지 안 움직인 게 아니다. 둘을 뭉뚱그리면 엉뚱한 데를 고치게 된다. */
/* 🔴 기대 모드는 **렌더 경로에 따라 다르다.** `--fallback` 으로 돌리면 fallback 이 정상이므로
 *    `webgl` 을 기대값으로 박아 두면 24칸 전부가 거짓 경고로 뜬다.
 * 🔴 캔버스 **전부**를 본다 — 종전에는 첫 캔버스의 모드만 봐서, 병치 칸의 두 번째 씬이
 *    `error` 로 떠 있어도 표에 나타나지 않았다. */
const EXPECT_MODE = RENDER_PATH === 'fallback' ? 'fallback' : 'webgl';
const badMode = rows.filter((r) => r.wired && r.hasCanvas
  && (r.sceneModes ?? [r.sceneMode]).some((m) => m !== EXPECT_MODE));
if (badMode.length) {
  console.log(`\n🔴 렌더러가 ${EXPECT_MODE} 이 아닌 캔버스를 가진 칸 ${badMode.length}건 — 이 칸의 씬 판정은 「안 움직인다」가 아니라 「씬이 제대로 안 떴다」일 수 있다`);
  for (const r of badMode) console.log(`   · ${r.name} — 시작 [${(r.sceneModes ?? []).join(', ')}] / 종료 [${(r.sceneModesEnd ?? []).join(', ')}]`);
}

/* ── 🔴 씬 병치 칸: 캔버스별 상세 — **합치지 않고 갈라 내보낸다** ── */
for (const r of multiCanvasRows) {
  if (!r.wired || !r.hasCanvas) continue;
  console.log(`\n■ 캔버스별 상세 — ${r.name} (캔버스 ${r.canvasCount}개)`);
  for (const c of r.perCanvas) {
    console.log(`  캔버스[${c.canvasIndex}] 모드 ${c.sceneMode ?? '—'} · 크기 ${c.size ?? '—'} · 대조군 within ${num(c.controlWithin)} · 문턱 ${num(c.threshold)}`);
    if (c.note) console.log(`    근거: ${c.note}…`);
  }
  console.log(`  ${pad('슬라이더', 26)}${r.perCanvas.map((c) => pad(`캔버스[${c.canvasIndex}]`, 28)).join('')}`);
  for (let i = 0; i < r.perSlider.length; i++) {
    const cells = r.perCanvas.map((c) => {
      const s = c.sliders[i];
      if (!s) return pad('—', 28);
      if (s.sceneChanged === null) return pad(`판정불가(${String(s.why ?? '').slice(0, 12)})`, 28);
      return pad(`${s.sceneChanged ? '✅' : '❌'} ${num(s.between)} / ${num(s.threshold)}`, 28);
    }).join('');
    console.log(`  ${pad(String(r.perSlider[i].label).slice(0, 22), 26)}${cells}`);
  }
  const reach = r.perSlider.filter((s) => s.sceneChanged === true).length;
  console.log(`  ➜ 도달률(어느 캔버스든 하나라도 움직인 슬라이더): ${reach}/${r.perSlider.length}`);
  for (const c of r.perCanvas) {
    console.log(`     · 캔버스[${c.canvasIndex}] 단독: ${c.sceneWired}/${r.perSlider.length}${c.sceneUndecided ? ` (판정불가 ${c.sceneUndecided})` : ''}`);
  }
}

console.log(`\n■ 슬라이더 전수 상세`);
console.log(`${pad('칸', 26)}${pad('#', 4)}${pad('파라미터', 24)}${pad('범위', 16)}${pad('출력', 6)}${pad('within(min/max)', 24)}${pad('between', 12)}${pad('씬', 10)}${pad('판정근거', 30)}눈 확인용 PNG(min|max)`);
for (const r of rows) {
  if (!r.wired) continue;
  for (const s of r.perSlider) {
    console.log(
      `${pad(r.name, 26)}${pad(s.idx, 4)}${pad(String(s.label).slice(0, 20), 24)}${pad(s.range, 16)}` +
      `${pad(s.outsChanged ? '✅' : '❌', 6)}${pad(`${num(s.withinMin)}/${num(s.withinMax)}`, 24)}` +
      `${pad(num(s.between), 12)}${pad(mark(s.sceneChanged, r.hasCanvas), 10)}${pad(s.why ?? '', 30)}` +
      `${s.pathMin ? `${s.pathMin} | ${s.pathMax ?? '-'}` : '—'}`,
    );
  }
}

console.log(`\n■ 요약`);
console.log(`  배선된 칸 ${wired}/${rows.length} · 출력이 실제로 변한 칸 ${live}/${wired}`);
console.log(`  씬(캔버스) 있는 칸 ${sceneCells}/${wired} · 그중 슬라이더가 씬을 움직인 칸 ${sceneOkCells}`);
console.log(`  씬에 걸린 슬라이더 ${sliderSceneWired} / 씬 있는 칸의 슬라이더 ${sliderInSceneCells} (전체 슬라이더 ${sliderTotal})`);
  if (noCanvasCells.length) console.log(`  ⚪ 캔버스(씬) 자체가 없는 칸 ${noCanvasCells.length}: ${noCanvasCells.join(', ')}  ← 「씬이 안 바뀐다」가 아니라 「씬이 없다」다. 이 판정은 A5 씬 요건과 별건이다.`);
const sceneDead = rows.filter((r) => r.wired && r.hasCanvas && r.sceneChanged !== true).map((r) => r.name);
if (sceneDead.length) console.log(`  🔴 씬은 있는데 어떤 슬라이더도 씬을 못 움직인 칸(${sceneDead.length}): ${sceneDead.join(', ')}`);
if (dead.length) console.log(`  🔴 출력 확인 필요: ${dead.join(', ')}`);
console.log(`  콘솔 에러 ${consoleErrors.length}건 · 캡처/디코드 실패 ${decodeErrors.length}건`);
if (decodeErrors.length) for (const e of decodeErrors.slice(0, 20)) console.log(`     ${e}`);

/* 🔴 여기를 조용히 두면 사고가 그대로 반복된다. 무효 프레임과 대기 실패는 **반드시** 찍는다. */
console.log(`\n■ 프레임 유효성 (백지·비유효 프레임 검출)`);
if (invalidFrames.length === 0 && renderWaitFailures.length === 0) {
  console.log(`  ✅ 무효 프레임 0건 · 렌더 대기 실패 0건 — 측정에 들어간 프레임은 전부 유효했다.`);
} else {
  console.log(`  🔴 무효(백지) 프레임 ${invalidFrames.length}건 · 렌더 대기 실패 ${renderWaitFailures.length}건`);
  console.log(`     ← 이 프레임이 섞인 슬라이더 판정은 전부 null(판정불가)로 처리했다. true/false 로 쓰지 않았다.`);
  for (const e of renderWaitFailures) console.log(`     [대기실패] ${e}`);
  for (const e of invalidFrames.slice(0, 40)) console.log(`     [무효] ${e}`);
  if (invalidFrames.length > 40) console.log(`     … 외 ${invalidFrames.length - 40}건`);
  const affected = rows.filter((r) => r.frameProblems?.length);
  if (affected.length) {
    console.log(`  🔴 영향받은 칸 ${affected.length}:`);
    for (const r of affected) for (const line of r.frameProblems) console.log(`     · ${r.name} ${line}`);
  }
}

console.log(`\n🔴 눈 확인 필요 — 척도가 「무변화」로 봤지만 위음성일 수 있는 칸 ${eyeCheck.length}건`);
console.log(`   (척도를 못 믿어서가 아니라, 국소 점등처럼 히스토그램에 거의 안 잡히는 변화가 실재하기 때문이다)`);
for (const e of eyeCheck) {
  console.log(`   · ${e.name} — ${e.why}`);
  for (const ev of e.evidence) console.log(`       ${ev}`);
  if (!e.evidence.length) console.log(`       ${e.page}`);
}

/* 🔴 칸 단위로는 ✅ 여도, 그 칸 안에서 씬을 못 움직인 슬라이더는 개별로 위음성일 수 있다.
 *    (실측 확인: etch-lab-basic 의 이온 화살표는 눈으로는 바뀌는데 척도가 못 잡는다 — 아래 참조) */
const sliderEye = [];
for (const r of rows) {
  if (!r.wired || !r.hasCanvas) continue;
  for (const s of r.perSlider) {
    if (s.sceneChanged === true) continue;
    sliderEye.push(`   · ${r.name} #${s.idx} ${s.label} — ${s.why ?? ''}\n       ${s.pathMin ?? '-'} | ${s.pathMax ?? '-'}`);
  }
}
console.log(`\n🔴 눈 확인 필요 (슬라이더 단위) — 씬 있는 칸에서 척도가 「무변화」로 본 슬라이더 ${sliderEye.length}건`);
for (const line of sliderEye) console.log(line);

writeFileSync(join(OUT, 'sweep-report.json'), JSON.stringify({
  /** 🔴 스키마 2 — `rows[].perCanvas` 신설(2026-08-22). 판독기는 이 값으로 갈라 읽어라. */
  schema: 2,
  build: BUILD_ID,
  /** 🔴 어느 렌더 경로로 잰 표인가. `fallback` 이 기준, `webgl` 은 회귀 확인용이다. */
  renderPath: RENDER_PATH,
  measure: {
    kind: 'rgb-histogram-L1',
    bins: HIST_BINS, capturesPerGroup: N_CAPTURE, captureGapMs: CAPTURE_GAP_MS,
    K, distFloor: DIST_FLOOR,
    /** 🔴 캔버스를 전부 잰다. 문턱도 **캔버스마다 따로** 낸다. */
    canvasScope: 'all',
    thresholdScope: 'per-canvas',
    rollup: '슬라이더 판정 = 어느 캔버스든 하나라도 변했으면 true · 전부 판정불가면 null · 그 밖은 false',
    rule: 'sceneChanged = between_mean > max(within_max * K, DIST_FLOOR); within 미확보 시 null',
    frameValidity: {
      minStd: FRAME_MIN_STD, minUniqueColors: FRAME_MIN_UNIQ,
      basis: 'qa/sweep 126장 전수 실측(2026-08-21): 백지 std 3.008/고유색 6 vs 정상 최악 std 25.256/고유색 612',
      rule: '무효 프레임이 하나라도 섞인 슬라이더 판정은 null. true 로도 false 로도 쓰지 않는다.',
    },
    renderWait: { maxMs: RENDER_WAIT_MS, pollMs: RENDER_POLL_MS,
      method: '캔버스 화소 폴링(analyzePNG 재사용) · 상한 초과 시 대기 실패 기록 후 null' },
  },
  staleQuarantined: staleMoved,
  selfTests, rows, consoleErrors, decodeErrors, invalidFrames, renderWaitFailures,
}, null, 2));
console.log(`\n보고 JSON: ${rel(join(OUT, 'sweep-report.json'))}`);
