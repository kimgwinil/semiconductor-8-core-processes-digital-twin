#!/usr/bin/env node
/**
 * check-direction.mjs — **A12 방향성 게이트**(§13-5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 2026-08-21 강화 — 이 게이트는 **화면을 보지 않는 화면 검사기**였다.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 종전 판정: `src/models/**` 에서 `DirectionRule` 객체를 정규식으로 세어
 *            ① sourceId 원장 대조 ② 공정별 ≥5 만 보았다.
 *            `src/viz/**` 도, `src/models/labs/**` 의 씬 배선도 **스캔 대상이 아니었다.**
 *            그래서 「물리층에 식이 있으면 통과」였고 A12 가 8/8 로 보였다.
 *
 * 🔴 오케스트레이터 확정 판정(뒤집지 않는다):
 *      **A12 는 「화면의 Y」가 정본이다.** 물리층에 식이 있다는 것과
 *      **화면이 그것을 보여준다**는 것은 다르다. 해석을 물리층 쪽으로 넓혀
 *      「8/8 통과」로 만드는 것이 D-041 위반이다.
 *
 * 근거 실측: `threads/DSN-8대공정-001.SC.md`(A12 실측) · `threads/DSN-8대공정-001.md` §S-1-1~§S-1-11.
 *   · 실습 24칸 중 **씬이 붙은 칸 11칸** (oxidation 3 · etch 2 · deposition 3 · metal 3)
 *   · wafer · photo · eds · packaging **4개 공정 12칸은 씬 자체가 없다**
 *   · `stepCoverage` 는 구현·테스트가 끝났는데 **어느 칸에도 배선되지 않은 유령 씬**
 *   · 종전 게이트 사각지대 B-1~B-12 (SC §6) — 그중 B-1·B-2·B-5·B-7·B-8·B-9·B-12 를 여기서 막는다
 *
 * ── 스캔 대상 ──────────────────────────────────────────────────────────────
 *   ① `src/models/**`            DirectionRule 선언(무엇을 약속했는가)
 *   ② `src/models/labs/**`       실습 24칸 · 씬 배선 · `scene.map()` (약속이 화면으로 가는 통로)
 *   ③ `src/viz/**`               🔴 **신규.** SceneId 원장 · 씬 구현 파일 · 씬이 실제로 읽는 파라미터
 *   ④ `tests/**`                 참고 계수용(비차단) — 씬을 구동하는 A12 표식 테스트
 *
 * ── 판정 ───────────────────────────────────────────────────────────────────
 *  [M] 모델층
 *   M1 모든 규칙에 `sourceId` 가 있고 원장(`sources.generated.ts`)에 실재한다
 *   M2 활성 공정마다 선언 규칙 ≥5   🔴 **물리층 미구현 면제를 삭제했다**(B-1)
 *   M3 규칙 0건이어도 통과시키지 않는다 🔴 (B-2 — 종전에는 무조건 exit 0)
 *   M4 규칙 `id` 중복 금지 (B-9)
 *   M5 `expect[]` 가 비었거나 한 규칙 안에서 같은 `output` 이 중복 금지 (B-8)
 *
 *  [V] 화면층 — 🔴 여기가 A12 정본이다
 *   V1 **규칙의 출력 Y 마다 화면 도달 경로가 있어야 한다.**
 *      경로 = 그 공정의 씬 배선 칸의 `scene.map(inputs, out)` 이 `out['Y']` 를 읽고,
 *             그 map 이 만든 파라미터를 **배선된 씬이 실제로 소비**한다(`pick(params,'k')`/`params['k']`).
 *      🔴 이름이 다르면 도달이 아니다. 물리층 출력명과 랩 출력명이 다른 것은
 *         **화면에 안 보인다는 뜻이 아니라, 안 보인다는 것을 아무도 증명하지 않았다는 뜻**이다.
 *         증명 책임은 게이트가 아니라 배선에 있다.
 *   V2 공정별 화면 도달 규칙 ≥5 — 🔴 **2026-08-22 비차단 참고 출력으로 강등**
 *      A12 판정은 `scripts/check-a12c.mjs` 로 이관됐다(오케스트레이터 확정). 이유·무손실 증명은
 *      본문 「V2」 절 주석 참조. **V1·V3·V4·V5·M1~M5 는 그대로 차단한다 — 아무것도 약화하지 않았다.**
 *   V3 유령 씬 금지 — `SCENE_IDS` 에 있고 구현됐는데 랩 배선 0건 (B-7)
 *   V4 죽은 씬 파라미터 금지 — 랩이 넘기는 키를 씬이 읽지 않는다
 *   V5 `SCENE_IDS` 의 씬 구현 파일이 실재한다
 *
 *  [P] 잠정(PROVISIONAL) — **비차단 고지**. 아래 「계측 지점」 절 참조.
 *
 * ── 🔴 계측 지점의 알려진 약점 (DSN 지적 · 잠정) ────────────────────────────
 *   현행 A12 계측은 `tests/direction/runner.ts` 가 스윕 구간을 등간격으로 훑으며
 *   **연속 차분의 부호만** 본다(`sign(y[i]-y[i-1])`). 크기·배수 관계는 보지 않는다.
 *   그래서 **「ALD 사이클 100 → 200 에서 두께가 1.8 배」** 같은 위반을 **못 본다** —
 *   자기제한 반응이면 정확히 **2 배**여야 하는데, 1.8 배도 「증가」이므로 통과한다.
 *   계측 지점 0.25 / 0.5 / 1.0 처럼 **경계·배수 관계를 짚지 않는 지점 설계**가 같은 약점을 공유한다.
 *
 *   🔴 **이 게이트가 지금 하는 것은 「탐지」가 아니라 「고지」다.** 아래 P1 이
 *      비례·선형·배수를 주장하는 규칙을 열거하되 **차단하지 않는다.**
 *      `Monotonicity` 어휘('increasing'/'decreasing'/'flat'/'non-monotonic')에는
 *      배수를 표현할 자리가 없어서, 진짜 해결은 **어휘와 계측 지점 설계를 함께 바꾸는 것**이다.
 *   🔴 **DSN 이 계측 지점 개선안을 별도로 만들고 있다. 아래 P1 의 판정 기준은 「잠정」이며
 *      DSN 안이 나오면 그쪽이 정본이다.** 여기서 지어낸 기준을 정본으로 굳히지 마라.
 *
 * ── 🔴 2026-08-22 강화 ① — **`scenes[]`(씬 병치)를 센다** ────────────────────
 *   `LabSpec` 에 `scenes?: LabSceneBinding[]` 가 신설됐는데(PLN §22-1 D-P5-1) 이 게이트는
 *   `/\bscene:\s*\{/` **하나만** 보고 있었다. 그래서 병치 칸의 두 번째 이후 씬은
 *   **화면에 실제로 그려지는데도 「도달 경로」 집계에 1건도 안 잡혔다.**
 *   → 개선이 게이트에 보이지 않는다. 「출력이 동일」이 「달라진 게 없다」와 같은 뜻이 아니게 된다.
 *   지금은 `labSceneBindings()` 와 **같은 규칙**으로 칸의 씬 목록을 만든다:
 *     ① `scenes[]` 먼저, 그 다음 `scene`   ② 같은 `sceneId` 는 한 번만.
 *   🔴 계약에 씬 출처를 또 만들거든 `collectBindings()` 도 같이 늘려라.
 *
 * ── 🔴 2026-08-22 강화 ② — **「해석 실패」를 「0건」과 구분한다** ──────────────
 *   이 게이트는 **소스 텍스트 파서**다. 그래서 코드 표기 관례가 취향이 아니라 **계약**이다.
 *   실측 사고(씬 병치 담당이 직접 밟고 되돌림):
 *     `const f = (a, b): T => ({…})` 처럼 **반환타입 주석을 `)` 와 `=>` 사이**에 붙이면
 *     `mapFns` 수집 정규식이 실패해 그 map 이 **도달 목록에서 통째로 사라졌고**,
 *     V1 문구 63건이 한꺼번에 바뀌었다. `tsc`·`vitest` 로는 안 잡힌다.
 *   종전 코드는 이때 `outKeys = []` 로 두고 **조용히 「읽는 출력 0건」** 이라고 보고했다.
 *   🔴 「0건」과 「모른다」는 다른 명제다. 지금은 해석 실패를 **계측기 오류로 분리**한다.
 *
 *   판정 계층은 이 저장소의 선례(`scripts/check-live-judgment.mjs` 의
 *   `LIVE_JUDGMENT = {0:PASS, 1:FAIL, 2:ERROR, 4:UNDET}`)를 그대로 따른다 —
 *   **ERROR(2) 가 FAIL(1) 보다 세다.** 계측기가 고장 난 상태의 PASS/FAIL 은 신뢰할 수 없기 때문이다.
 *   그래서 해석 실패는 **FAIL 목록에 넣지 않고 exit 2 로 즉시 끊는다.** 바로 위 `processId`
 *   해석 실패가 이미 같은 방식(exit 2)을 쓰고 있다 — 같은 자리에 같은 관례로 붙였다.
 *
 * ── 사용 ───────────────────────────────────────────────────────────────────
 *   node scripts/check-direction.mjs                판정(위반이 있으면 exit 1 · 계측 실패면 exit 2)
 *   node scripts/check-direction.mjs --root=<경로>  스캔 뿌리를 바꾼다(self-test 픽스처 전용)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

/* 🔴 `--root` 는 self-test 픽스처 전용이다. 픽스처 트리는 이 저장소와 **같은 배치**를 갖는다:
 *      <root>/src/content/catalog.json
 *      <root>/src/models/**            (physics/<pid>/rules.ts · labs/<pid>.ts)
 *      <root>/src/viz/index.ts         (SCENE_IDS)
 *      <root>/src/viz/gl/scenes/<id>.ts
 *    판정 규칙은 실행 경로가 완전히 같다 — 뿌리만 갈아 끼운다. */
const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='));
const ROOT = ROOT_ARG ? path.resolve(APP_ROOT, ROOT_ARG.slice('--root='.length)) : APP_ROOT;
const SCOPED = Boolean(ROOT_ARG);

const SRC_DIR = path.join(ROOT, 'src');
const MODELS_DIR = path.join(SRC_DIR, 'models');
const LABS_DIR = path.join(MODELS_DIR, 'labs');
const VIZ_DIR = path.join(SRC_DIR, 'viz');
const SCENES_DIR = path.join(VIZ_DIR, 'gl', 'scenes');
const SCENE_MODELS_DIR = path.join(SCENES_DIR, 'models');
const VIZ_INDEX = path.join(VIZ_DIR, 'index.ts');
const CATALOG_FILE = path.join(SRC_DIR, 'content/catalog.json');
const GEN_FILE = path.join(MODELS_DIR, 'sources.generated.ts');
const TESTS_DIR = path.join(ROOT, 'tests');

const errors = [];
const fail = (msg) => errors.push(msg);
const rel = (p) => path.relative(ROOT, p);

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (text[k] === '\n') line++;
  return line;
}

/** `{` 또는 `(` 에서 시작해 짝이 맞는 지점까지의 구간을 돌려준다. 문자열·주석은 무시하지 않는다(정적 근사). */
function balanced(text, openIndex, open = '{', close = '}') {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return text.slice(openIndex);
}

/** 객체 리터럴 본문에서 **깊이 1 의 키**만 뽑는다. */
function topLevelKeys(objText) {
  const keys = [];
  let depth = 0;
  let atKeyPos = true;
  for (let i = 0; i < objText.length; i++) {
    const c = objText[i];
    if (c === '{' || c === '(' || c === '[') { depth++; if (depth === 1) atKeyPos = true; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; continue; }
    if (depth !== 1) continue;
    if (c === ',') { atKeyPos = true; continue; }
    if (!atKeyPos) continue;
    /* 🔴 2026-08-21 — **주석은 「키 자리」를 소비하지 않는다.** 종전에는 `/` 가 비공백이라
       아래 `else if` 가 `atKeyPos` 를 꺼 버렸고, 그러면 다음 `,` 까지 키를 찾지 않아
       **주석 바로 뒤 키를 통째로 잃었다.** 앞머리 주석뿐 아니라 **중간 주석도** 같다:
         `{ // c \n a: 1, b: 2 }`  → 종전 ['b']      · 현재 ['a','b']
         `{ a: 1, \n // c \n b: 2 }` → 종전 ['a']      · 현재 ['a','b']
       실측 영향(같은 트리 연속 실행): 위반 **73건 → 75건**. 잃은 키 때문에
       `deposition` 의 `scene.map` 이 읽는 출력이 `[peakCm3]` 로만 보고돼 **`gpcAngstrom` 이 빠졌고**,
       `wafer` 의 `solidFraction` V4 위반 **2건이 아예 안 보였다.**
       🔴 즉 이 수정은 **완화가 아니라 강화다** — 숨어 있던 위반이 드러난다. */
    if (c === '/' && objText[i + 1] === '/') { const e = objText.indexOf('\n', i); i = e < 0 ? objText.length : e; continue; }
    if (c === '/' && objText[i + 1] === '*') { const e = objText.indexOf('*/', i); i = e < 0 ? objText.length : e + 1; continue; }
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(objText.slice(i));
    if (m) { keys.push(m[1]); i += m[0].length - 1; atKeyPos = false; }
    else if (!/\s/.test(c)) atKeyPos = false;
  }
  return keys;
}

/**
 * 인자 목록을 **깊이 0 의 쉼표**로만 쪼갠다. `<>` · `()` · `[]` · `{}` 안의 쉼표는 세지 않는다.
 * 🔴 제네릭 타입 주석(`Readonly<Record<string, number>>`)이 인자 이름을 깨뜨리는 것을 막는다.
 */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of text) {
    if (c === '<' || c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === '>' || c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * 배열 리터럴 텍스트(`[ {...}, {...} ]`)에서 **깊이 1 의 객체 리터럴**만 잘라 낸다.
 * 중첩된 `{}`(map 본문·note 안의 중괄호)에 속지 않도록 짝을 세어 자른다.
 */
function topLevelObjects(arrText) {
  const out = [];
  let depth = 0;
  let objStart = -1;
  for (let i = 0; i < arrText.length; i++) {
    const c = arrText[i];
    if (c === '{' || c === '(' || c === '[') { if (depth === 1 && c === '{' && objStart < 0) objStart = i; depth++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 1 && objStart >= 0 && c === '}') { out.push(arrText.slice(objStart, i + 1)); objStart = -1; }
      continue;
    }
  }
  return out;
}

/**
 * 씬 바인딩 객체 하나(`{ sceneId, map, note }`)를 해석한다.
 *
 * 🔴 **해석 실패를 「0건」으로 삼키지 않는다.** `map:` 키가 있는데 본문을 못 읽었으면
 *    `parseFail` 에 사유를 담아 돌려준다. 부르는 쪽이 그것을 **계측기 오류(exit 2)** 로 올린다.
 *    여기서 `outKeys: []` 를 그냥 돌려주면 「이 씬은 출력을 하나도 안 읽는다」는 **거짓 사실**이
 *    판정에 그대로 들어간다 — 게이트가 조용히 눈이 먼 상태다.
 */
function parseBinding(objText, mapFns, source) {
  const b = { sceneId: null, source, outKeys: [], paramKeys: [], mapWhere: null, parseFail: null };

  const sid = objText.match(/\bsceneId:\s*['"]([^'"]+)['"]/);
  if (sid) b.sceneId = sid[1];
  else { b.parseFail = `${source}: sceneId 리터럴을 읽지 못했다`; return b; }

  const hasMapKey = /\bmap\s*:/.test(objText);
  if (!hasMapKey) { b.parseFail = `${source} '${b.sceneId}': map 키가 없다(LabSceneBinding 은 map 이 필수다)`; return b; }

  // map 본문 — 인라인 화살표이거나 파일 스코프 함수 참조다.
  let mapParams = null;
  let mapBody = null;
  const inline = objText.match(/\bmap:\s*\(([^)]*)\)\s*(?::[^=;{]+)?=>\s*\(/);
  const byRef = objText.match(/\bmap:\s*([A-Za-z_$][\w$]*)\s*[,}]/);
  if (inline) {
    const bodyStart = objText.indexOf('{', inline.index + inline[0].length - 1);
    if (bodyStart >= 0) { mapParams = inline[1]; mapBody = balanced(objText, bodyStart); b.mapWhere = '인라인'; }
  } else if (byRef) {
    if (!mapFns.has(byRef[1])) {
      b.parseFail = `${source} '${b.sceneId}': map 이 참조하는 '${byRef[1]}' 의 본문을 파일에서 찾지 못했다`
        + " — 저장소 관례는 `const 이름: LabSceneBinding['map'] = (i, out) => ({…})` 다";
      return b;
    }
    const fn = mapFns.get(byRef[1]);
    mapParams = fn.params; mapBody = fn.body; b.mapWhere = `${byRef[1]}()`;
  }

  if (!mapBody) {
    b.parseFail = `${source} '${b.sceneId}': map 본문을 해석하지 못했다`
      + ' — 인라인 화살표(`(i, out) => ({…})`)도, 파일 스코프 함수 참조도 아니다';
    return b;
  }

  /* 두 번째 인자(출력)의 이름을 찾아 `<name>['Y']` 만 출력 참조로 센다.
   * 🔴 인자를 `,` 로 그냥 쪼개면 **제네릭 타입 안의 쉼표에 걸려 이름이 깨진다** —
   *    `(inputs: Readonly<Record<string, number>>, out: …)` 를 쪼개면 두 번째 조각이
   *    `number>>` 가 되고, 그 이름으로 본문을 뒤지니 **출력 참조가 0건으로 보인다.**
   *    2026-08-22 주입 실측에서 이 경로로 `gpcAngstrom` 이 도달 목록에서 사라졌다. */
  const argNames = splitTopLevel(mapParams ?? '').map((s) => s.replace(/:[\s\S]*$/, '').trim());
  if (argNames.length >= 2) {
    const outArg = argNames[1];
    if (!/^[A-Za-z_$][\w$]*$/.test(outArg)) {
      b.parseFail = `${source} '${b.sceneId}': map 의 두 번째 인자 이름을 읽지 못했다(해석 결과 '${outArg}')`
        + ' — 이 상태의 「읽는 출력 0건」은 사실이 아니라 계측 실패다';
      return b;
    }
    if (!/^_\w*$/.test(outArg)) {
      const re = new RegExp(`\\b${outArg.replace(/[$]/g, '\\$')}\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g');
      b.outKeys = [...new Set([...mapBody.matchAll(re)].map((m) => m[1]))];
    }
  }
  /* 🔴 인자가 1개 이하이면 **출력을 읽을 수 없는 map** 이다 — 이것은 진짜 「0건」이다.
   *    (`map(inputs, outputs)` 계약에서 두 번째를 안 받았다는 선언이므로 계측 실패가 아니다.) */
  b.paramKeys = topLevelKeys(mapBody);
  return b;
}

/**
 * 칸 구간에서 **화면이 실제로 그리는 씬 목록**을 만든다.
 * 🔴 규칙은 `src/models/labs/spec.ts` 의 `labSceneBindings()` 와 **같아야 한다**:
 *    ① `scenes[]` 먼저, 그 다음 `scene`  ② 같은 `sceneId` 는 한 번만.
 *    두 곳이 갈라지면 게이트가 화면과 다른 것을 재게 된다.
 */
function collectBindings(region, mapFns) {
  const list = [];
  const seen = new Set();

  const scenesMatch = region.match(/\bscenes:\s*\[/);
  if (scenesMatch) {
    const arrText = balanced(region, region.indexOf('[', scenesMatch.index), '[', ']');
    const objs = topLevelObjects(arrText);
    if (objs.length === 0) {
      list.push({ sceneId: null, source: 'scenes[]', outKeys: [], paramKeys: [], mapWhere: null,
        parseFail: 'scenes[] 를 찾았으나 원소 객체를 하나도 잘라 내지 못했다' });
    }
    objs.forEach((o, i) => {
      const b = parseBinding(o, mapFns, `scenes[${i}]`);
      if (b.sceneId && seen.has(b.sceneId)) return; // labSceneBindings() 와 같은 중복 제거
      if (b.sceneId) seen.add(b.sceneId);
      list.push(b);
    });
  }

  const sceneMatch = region.match(/\bscene:\s*\{/);
  if (sceneMatch) {
    const objText = balanced(region, region.indexOf('{', sceneMatch.index));
    const b = parseBinding(objText, mapFns, 'scene');
    if (!(b.sceneId && seen.has(b.sceneId))) list.push(b);
  }

  /* 🔴 **키는 있는데 모양이 다른 경우를 「씬 없음」으로 삼키지 않는다.**
   *    `scene: SOME_CONST` 나 `scenes: someArray` 처럼 인라인 리터럴이 아니면 위 두 정규식이
   *    모두 빗나가고, 이 칸은 조용히 **「씬 미배선」** 으로 집계된다 — 화면에는 씬이 그려지는데도.
   *    (`labSceneBindings()` 는 런타임 객체를 보므로 그런 선언도 정상 동작한다. 즉 게이트만 눈이 먼다.) */
  if (/\bscenes\s*:/.test(region) && !scenesMatch) {
    list.push({ sceneId: null, source: 'scenes', outKeys: [], paramKeys: [], mapWhere: null,
      parseFail: '`scenes:` 키가 있는데 배열 리터럴(`scenes: [`)이 아니다 — 이 칸의 「씬 미배선」은 사실이 아니라 계측 실패다' });
  }
  if (/\bscene\s*:/.test(region) && !sceneMatch) {
    list.push({ sceneId: null, source: 'scene', outKeys: [], paramKeys: [], mapWhere: null,
      parseFail: '`scene:` 키가 있는데 객체 리터럴(`scene: {`)이 아니다 — 이 칸의 「씬 미배선」은 사실이 아니라 계측 실패다' });
  }
  return list;
}

// ══════════════════════════════════════════════════════════════════════════
// 0. 원장 — 활성 공정 · S번호
// ══════════════════════════════════════════════════════════════════════════
if (!existsSync(CATALOG_FILE)) {
  console.error(`❌ ${rel(CATALOG_FILE)} 가 없습니다.`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
const activeProcessIds = Object.entries(catalog.processes ?? {})
  .filter(([, def]) => def.status === 'active')
  .map(([id]) => id);

let SOURCE_IDS = new Set();
let hasLedger = false;
if (existsSync(GEN_FILE)) {
  const genText = readFileSync(GEN_FILE, 'utf8');
  const idsMatch = genText.match(/export const SOURCE_IDS = \[([\s\S]*?)\] as const;/);
  if (idsMatch) {
    SOURCE_IDS = new Set([...idsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    hasLedger = true;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 1. [M] 모델층 — DirectionRule 선언 수집
// ══════════════════════════════════════════════════════════════════════════
const modelFiles = walk(MODELS_DIR, ['.ts', '.tsx']);
const rules = []; // { file, line, ruleId, processId, sourceId, outputs[] }

for (const file of modelFiles) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');
  if (!text.includes('DirectionRule')) continue;
  const idMatches = [...text.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)];
  if (idMatches.length === 0) continue;

  for (let i = 0; i < idMatches.length; i++) {
    const start = idMatches[i].index;
    const end = i + 1 < idMatches.length ? idMatches[i + 1].index : text.length;
    const segment = text.slice(start, end);

    const processIdMatch = segment.match(/\bprocessId:\s*['"]([^'"]+)['"]/);
    if (!processIdMatch) continue;
    // DirectionRule 고유 필드(inputName · expect)가 함께 있어야 규칙으로 센다.
    if (!/\binputName:\s*['"]/.test(segment) || !/\bexpect:\s*\[/.test(segment)) continue;

    const sourceIdMatch = segment.match(/\bsourceId:\s*['"]([^'"]+)['"]/);
    const scopeMatch = segment.match(/\bscope:\s*['"]([^'"]+)['"]/);
    const statementMatch = segment.match(/\bstatement:\s*['"`]([\s\S]*?)['"`],\n/);
    const expectStart = segment.indexOf('expect:');
    const expectText = expectStart >= 0
      ? balanced(segment, segment.indexOf('[', expectStart), '[', ']')
      : '';
    const outputs = [...expectText.matchAll(/\boutput:\s*['"]([^'"]+)['"]\s*,\s*trend:\s*['"]([^'"]+)['"]/g)]
      .map((m) => ({ output: m[1], trend: m[2] }));

    rules.push({
      file: r,
      line: lineOf(text, start),
      ruleId: idMatches[i][1],
      processId: processIdMatch[1],
      sourceId: sourceIdMatch ? sourceIdMatch[1] : undefined,
      scope: scopeMatch ? scopeMatch[1] : 'reference',
      statement: statementMatch ? statementMatch[1] : '',
      outputs,
    });
  }
}

// ---- M3. 규칙 0건도 통과시키지 않는다 (B-2 봉쇄) ----
// 🔴 종전에는 여기서 무조건 exit 0 이었다. 「원장 전멸 = 무결」이 되는 구멍이었다.
if (rules.length === 0) {
  fail('M3 DirectionRule 이 0건이다. 활성 공정이 있는데 방향성 규칙 원장이 비어 있으면 A12 는 미충족이다.');
}

// ---- M1. sourceId ----
for (const r of rules) {
  if (!r.sourceId) {
    fail(`M1 ${r.file}:${r.line}: 규칙 '${r.ruleId}' 에 sourceId 가 없습니다.`);
  } else if (hasLedger && !SOURCE_IDS.has(r.sourceId)) {
    fail(`M1 ${r.file}:${r.line}: 규칙 '${r.ruleId}' 의 sourceId '${r.sourceId}' 가 원장에 없습니다.`);
  }
}

// ---- M4. id 중복 (B-9) ----
const seenIds = new Map();
for (const r of rules) {
  const prev = seenIds.get(r.ruleId);
  if (prev) fail(`M4 ${r.file}:${r.line}: 규칙 id '${r.ruleId}' 가 중복이다(먼저 ${prev}). 중복 id 는 개수만 부풀린다.`);
  else seenIds.set(r.ruleId, `${r.file}:${r.line}`);
}

// ---- M5. expect 내용 (B-8) ----
for (const r of rules) {
  if (r.outputs.length === 0) {
    fail(`M5 ${r.file}:${r.line}: 규칙 '${r.ruleId}' 의 expect[] 가 비었다. 관찰할 출력이 없으면 규칙이 아니다.`);
    continue;
  }
  const seen = new Set();
  for (const e of r.outputs) {
    if (seen.has(e.output)) {
      fail(`M5 ${r.file}:${r.line}: 규칙 '${r.ruleId}' 이 같은 출력 '${e.output}' 을 여러 번 선언했다.`);
    }
    seen.add(e.output);
  }
}

// ---- M2. 공정별 선언 규칙 ≥5 — 🔴 물리층 미구현 면제 삭제 (B-1 봉쇄) ----
const MIN_RULES = 5;
const declaredByProcess = new Map();
for (const r of rules) declaredByProcess.set(r.processId, (declaredByProcess.get(r.processId) ?? 0) + 1);

for (const pid of activeProcessIds) {
  const count = declaredByProcess.get(pid) ?? 0;
  if (count < MIN_RULES) {
    // 🔴 종전에는 `src/models/physics/<pid>/` 디렉터리가 없으면 경고만 냈다.
    //    디렉터리를 옮기는 것만으로 게이트를 끌 수 있었다(DSN SC §6-1 PROBE A 로 재현됨).
    fail(`M2 공정 '${pid}': 선언된 방향성 규칙 ${count}개 (최소 ${MIN_RULES}개). 미구현도 미충족이다 — 면제하지 않는다.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2. [V] 화면층 — src/viz/** · src/models/labs/** 실측
// ══════════════════════════════════════════════════════════════════════════

// ---- 2-1. viz 원장: SCENE_IDS ----
let sceneIds = [];
if (existsSync(VIZ_INDEX)) {
  const vizText = readFileSync(VIZ_INDEX, 'utf8');
  const m = vizText.match(/export const SCENE_IDS[^=]*=\s*\[([\s\S]*?)\]/);
  if (m) sceneIds = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  else {
    const t = vizText.match(/export type SceneId\s*=\s*([^;]+);/);
    if (t) sceneIds = [...t[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
}

/** 씬이 실제로 읽는 파라미터 키. 씬 파일 + 그 씬의 계산 정본(models/<id>.model.ts) 을 본다. */
function sceneConsumedParams(sceneId) {
  const keys = new Set();
  const files = [
    path.join(SCENES_DIR, `${sceneId}.ts`),
    path.join(SCENE_MODELS_DIR, `${sceneId}.model.ts`),
  ].filter((f) => existsSync(f));
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/\bpick\(\s*[A-Za-z_$][\w$]*\s*,\s*['"]([^'"]+)['"]/g)) keys.add(m[1]);
    for (const m of t.matchAll(/\bparams\s*\[\s*['"]([^'"]+)['"]\s*\]/g)) keys.add(m[1]);
  }
  return { keys, files: files.map(rel) };
}

// ---- V5. SCENE_IDS 의 씬 구현 파일이 실재하는가 ----
const sceneImplemented = new Set();
for (const id of sceneIds) {
  if (existsSync(path.join(SCENES_DIR, `${id}.ts`))) sceneImplemented.add(id);
  else fail(`V5 씬 '${id}' 가 SCENE_IDS 에 있는데 ${rel(path.join(SCENES_DIR, `${id}.ts`))} 가 없다.`);
}

// ---- 2-2. 실습 칸(공정×단계) 과 씬 배선 수집 ----
const labFiles = walk(LABS_DIR, ['.ts']).filter((f) => !/\/(spec|index)\.ts$/.test(f));
const cells = []; // { file, line, processId, stage, sceneId, mapText, outKeys[], paramKeys[] }

/* 🔴 `processId: ETCH_PROCESS_ID` 처럼 **다른 파일에서 import 한 상수**를 쓰는 랩이 5종이다
 *    (`src/models/physics/<pid>/rules.ts` 가 `export const XXX_PROCESS_ID` 를 낸다).
 *    파일 안에서만 상수를 찾으면 wafer·photo·etch·eds·packaging 5공정의 칸이 통째로 안 잡힌다
 *    — 실제로 첫 실행에서 그랬다. 게이트가 「공정에 칸이 0개」라고 거짓말하면 A12 판정 전체가 무너진다. */
const globalConsts = new Map();
for (const f of modelFiles) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\b(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/g)) {
    if (!globalConsts.has(m[1])) globalConsts.set(m[1], m[2]);
  }
}

for (const file of labFiles) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');

  // 상수 해석표 — 파일 스코프가 전역보다 우선한다.
  const consts = new Map(globalConsts);
  for (const m of text.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/g)) {
    consts.set(m[1], m[2]);
  }
  /* 파일 스코프 map 함수(`const polishSceneMap = (i, out) => ({...})`) 해석표.
   * 🔴 `)` 와 `=>` 사이의 **반환타입 주석**(`(a, b): T => (…)`)까지 받아 준다.
   *    이 한 글자를 못 읽어 2026-08-22 에 map 하나가 통째로 사라진 적이 있다.
   *    저장소 관례는 `const 이름: LabSceneBinding['map'] = (i, out) => ({…})` 지만,
   *    **관례를 어긴 표기를 「0건」으로 삼키지 않는 것**이 파서의 책임이다. */
  const mapFns = new Map();
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\(([^)]*)\)\s*(?::[^=;{]+)?=>\s*\(/g)) {
    const bodyStart = text.indexOf('{', m.index + m[0].length - 1);
    if (bodyStart < 0) continue;
    mapFns.set(m[1], { params: m[2], body: balanced(text, bodyStart) });
  }

  const cellHeads = [...text.matchAll(/\bprocessId:\s*([A-Za-z_$][\w$]*|['"][^'"]+['"])\s*,\s*\n\s*stage:\s*['"]([^'"]+)['"]/g)];
  for (let i = 0; i < cellHeads.length; i++) {
    const h = cellHeads[i];
    const start = h.index;
    const end = i + 1 < cellHeads.length ? cellHeads[i + 1].index : text.length;
    const region = text.slice(start, end);

    const rawPid = h[1];
    const processId = /^['"]/.test(rawPid) ? rawPid.slice(1, -1) : (consts.get(rawPid) ?? rawPid);
    const stage = h[2];

    const cell = {
      file: r, line: lineOf(text, start), processId, stage,
      /** 🔴 이 칸이 실제로 그리는 씬 목록. `labSceneBindings()` 와 같은 규칙으로 만든다. */
      bindings: collectBindings(region, mapFns),
    };
    /* 종전 필드는 **집계 코드가 읽던 이름 그대로** 남긴다 — 다만 뜻이 「첫 씬」이 아니라
     * 「이 칸에 씬이 붙었는가」다. 배열을 봐야 하는 판정은 전부 `cell.bindings` 를 쓴다. */
    cell.sceneId = cell.bindings[0]?.sceneId ?? null;
    cells.push(cell);
  }
}

/* 🔴 계측기 자체 점검 — 칸의 processId 를 해석하지 못했으면 **게이트 버그**다.
 *    해석 실패를 그대로 두면 「그 공정은 칸이 0개」로 보이고, A12 판정이 조용히 거짓이 된다. */
for (const c of cells) {
  if (!activeProcessIds.includes(c.processId)) {
    console.error(`🔴 게이트 버그: ${c.file}:${c.line} 의 processId '${c.processId}' 를 활성 공정으로 해석하지 못했다.`);
    console.error('   상수 해석표를 고쳐라. 이 상태의 A12 판정은 신뢰할 수 없다.');
    process.exit(2);
  }
}

/* 🔴 계측기 자체 점검 ② — **씬 바인딩 해석 실패는 「0건」이 아니라 「모른다」다.**
 *    이것을 그냥 두면 `outKeys = []` 가 「이 씬은 출력을 하나도 안 읽는다」라는 **사실 주장**으로
 *    판정에 들어가고, V1 문구가 통째로 바뀌면서도 아무도 이유를 모른다(2026-08-22 실측 사고).
 *    판정 계층은 `LIVE_JUDGMENT = {0:PASS, 1:FAIL, 2:ERROR, 4:UNDET}` 을 따른다 —
 *    **ERROR 가 FAIL 보다 세다.** 계측기가 고장 난 상태의 PASS/FAIL 은 신뢰할 수 없으므로,
 *    위반 목록(FAIL)에 섞지 않고 여기서 **exit 2 로 끊는다.** */
const bindingParseFailures = [];
for (const c of cells) {
  for (const b of c.bindings) {
    if (b.parseFail) bindingParseFailures.push(`${c.file}:${c.line} (${c.processId}/${c.stage}) ${b.parseFail}`);
  }
}
if (bindingParseFailures.length > 0) {
  console.error(`🔴 계측기 오류(ERROR) — 씬 배선 ${bindingParseFailures.length}건을 **해석하지 못했다**.`);
  console.error('   이것은 「도달 0건」이 아니라 「모른다」다. 이 상태의 V1·V2·V4 판정은 신뢰할 수 없다.');
  for (const m of bindingParseFailures) console.error(`   - ${m}`);
  console.error('');
  console.error('   🔴 이 게이트는 소스 텍스트 파서다. 그래서 코드 표기 관례가 취향이 아니라 **계약**이다.');
  console.error("      map 을 파일 스코프로 뽑을 때는 `const 이름: LabSceneBinding['map'] = (i, out) => ({…})` 를 쓴다.");
  console.error('      반환타입 주석을 `) : T =>` 자리에 붙이면 계측이 눈이 먼다(tsc·vitest 로는 안 잡힌다).');
  process.exit(2);
}

/** 씬이 하나라도 붙은 칸. 🔴 「첫 씬」이 아니라 **바인딩 목록 전체**가 기준이다. */
const wiredCells = cells.filter((c) => c.bindings.length > 0);
const wiredSceneIds = new Set(wiredCells.flatMap((c) => c.bindings.map((b) => b.sceneId)));
/** 칸을 씬 단위로 펼친 것 — V4·V1 은 **바인딩마다** 따로 봐야 한다(합치면 한쪽이 다른 쪽에 묻힌다). */
const wiredBindings = wiredCells.flatMap((c) => c.bindings.map((b) => ({ cell: c, b })));
/** 칸 표기 — 병치 칸은 씬을 전부 드러낸다. 「무엇이 붙어 있는지」를 숨기면 진단이 안 된다. */
const cellSceneLabel = (c) => c.bindings.map((b) => b.sceneId).join('+');

// ---- V3. 유령 씬 — 구현됐는데 어느 칸에도 배선 안 됨 (B-7) ----
for (const id of sceneIds) {
  if (!sceneImplemented.has(id)) continue;
  if (!wiredSceneIds.has(id)) {
    fail(`V3 유령 씬 '${id}': 구현돼 있는데 실습 어느 칸에도 배선되지 않았다 — 학습자가 볼 수 없는 화면이다. (${rel(path.join(SCENES_DIR, `${id}.ts`))})`);
  }
}

// ---- V4. 죽은 씬 파라미터 — 랩이 넘기는 키를 씬이 읽지 않는다 ----
const consumedCache = new Map();
function consumedOf(sceneId) {
  if (!consumedCache.has(sceneId)) consumedCache.set(sceneId, sceneConsumedParams(sceneId));
  return consumedCache.get(sceneId);
}
/* 🔴 **바인딩마다** 본다. 칸 단위로 합치면 병치 칸에서 한쪽 씬의 죽은 파라미터가
 *    다른 쪽 씬이 읽는 키에 가려져 사라진다. */
for (const { cell: c, b } of wiredBindings) {
  if (!sceneImplemented.has(b.sceneId)) continue;
  const { keys } = consumedOf(b.sceneId);
  if (keys.size === 0) continue; // 소비 지점을 한 곳도 못 찾으면 계측기 쪽 문제다 — 단정하지 않는다
  for (const k of b.paramKeys) {
    if (!keys.has(k)) {
      fail(`V4 ${c.file}:${c.line} (${c.processId}/${c.stage} · ${b.source}): 씬 '${b.sceneId}' 에 파라미터 '${k}' 를 넘기는데 씬이 그 키를 읽지 않는다 = 화면에 도달하지 않는 값이다.`);
    }
  }
}

// ---- V1. 규칙 출력 Y 의 화면 도달 ----
/** 공정별: 씬 배선 칸에서 `out['Y']` 로 읽히고, 그 map 의 파라미터가 씬에 소비되는 Y 들. */
/* 🔴 **바인딩 단위로 센다.** 병치 칸의 두 번째 씬이 읽는 출력도 화면에 실제로 그려지므로
 *    도달 경로다. 종전에는 `scene`(단수) 하나만 봐서 그 개선이 집계에 **1건도 안 잡혔다**. */
const reachableByProcess = new Map();
for (const { cell: c, b } of wiredBindings) {
  if (!sceneImplemented.has(b.sceneId)) continue;
  const { keys } = consumedOf(b.sceneId);
  const live = b.paramKeys.some((k) => keys.has(k));
  if (!live) continue; // map 결과가 씬에 하나도 닿지 않으면 이 바인딩을 통한 도달은 없다
  const set = reachableByProcess.get(c.processId) ?? new Map();
  for (const y of b.outKeys) set.set(y, `${c.file}:${c.line} → ${b.sceneId}`);
  reachableByProcess.set(c.processId, set);
}

const screenOkByProcess = new Map();
const v1Violations = [];
const labRules = rules.filter((r) => r.scope === 'lab');
for (const r of labRules) {
  const reach = reachableByProcess.get(r.processId) ?? new Map();
  const missing = r.outputs.filter((e) => !reach.has(e.output)).map((e) => e.output);
  if (missing.length === 0) {
    screenOkByProcess.set(r.processId, (screenOkByProcess.get(r.processId) ?? 0) + 1);
  } else {
    const sceneCells = wiredCells.filter((c) => c.processId === r.processId);
    const why = sceneCells.length === 0
      ? '이 공정은 씬이 붙은 칸이 0칸이다'
      : `씬 배선 칸(${sceneCells.map((c) => `${c.stage}:${cellSceneLabel(c)}`).join(' · ')})의 scene.map 이 읽는 출력은 [${[...reach.keys()].join(', ') || '없음'}] 뿐이다`;
    v1Violations.push(`V1 ${r.file}:${r.line} 규칙 '${r.ruleId}'(${r.processId}): 출력 [${missing.join(', ')}] 이 화면에 도달하지 않는다 — ${why}.`);
  }
}
for (const v of v1Violations) fail(v);

// ══════════════════════════════════════════════════════════════════════════
// ---- V2. 공정별 화면 도달 규칙 ≥5 — 🔴 **비차단 참고 출력으로 강등**(2026-08-22)
// ══════════════════════════════════════════════════════════════════════════
/* 🔴 오케스트레이터 확정 판정(2026-08-22): **A12 를 새 기준으로 채택하고, A12 판정을
 *    `check-a12c.mjs` 로 옮긴다.** 그래서 V2 는 여기서 `fail()` 하지 않는다.
 *
 *    ── 왜 옮겼나 ────────────────────────────────────────────────────────────
 *      V2 의 자는 「그 규칙의 출력 Y 가 **3D 씬에 나타나는가**」였다. 그래서 판정이
 *      **씬 유무에 인질로 잡혀 있었다** — 씬을 안 그린 공정은 배선을 아무리 고쳐도
 *      영원히 0 이고, 씬을 하나 붙이면 학습 가치와 무관하게 수가 뛴다.
 *      새 기준(A12)은 **「학습자가 만질 수 있는 노브에 방향 보증이 있는가」**를 본다.
 *
 *    ── ⛔ 이것은 완화가 아니다 ──────────────────────────────────────────────
 *      ① 새 게이트 `check-a12c` 는 **채택 직후에도 빨간불**이다(L2 13/24 = 54.2 %).
 *      ② 🔴 **V2 의 차단력은 이 파일 안에서 M2 ∧ V1 에 완전히 포함된다.**
 *         증명: V2 가 걸린다 ⟺ screenOk(p) < MIN_RULES.
 *               M2 가 통과했다면 declared(p) ≥ MIN_RULES > screenOk(p) 이므로
 *               그 공정에는 **출력이 화면에 도달하지 않는 규칙이 반드시 1건 이상 있고**,
 *               그 규칙이 V1 을 건다. M2 가 통과하지 못했다면 M2 자신이 차단한다.
 *               ∴ **V2 만 걸리고 M2·V1 은 안 걸리는 상태는 존재하지 않는다.**
 *         → 강등으로 **잃는 차단 상태가 0 개**다. 실측도 같다(강등 전 56건 = V1 49 + V2 6 + V3 1,
 *           강등 후 50건, 빨간불이 켜진 공정 집합은 6개로 **동일**).
 *      ③ V1·V3·V4·V5·M1~M5 는 **그대로 차단한다.** 이 파일에서 지운 것은 V2 의 `fail()` 뿐이다.
 *
 *    ⛔ 여기를 「이제 안 세도 된다」로 읽지 마라. **수는 계속 센다** — 아래 표에 그대로 찍힌다.
 *       차단만 `check-a12c` 로 옮겼다. 두 게이트가 각각 빨간불인 것이 **정상 상태**다. */
const a12Pass = [];
const v2Shortfall = [];
for (const pid of activeProcessIds) {
  const n = screenOkByProcess.get(pid) ?? 0;
  if (n >= MIN_RULES) a12Pass.push(pid);
  else {
    const cellsOf = cells.filter((c) => c.processId === pid);
    const wired = cellsOf.filter((c) => c.bindings.length > 0).length;
    v2Shortfall.push(`V2 공정 '${pid}': 화면 도달 방향성 규칙 ${n}개 (참고 기준 ${MIN_RULES}개). 실습 ${cellsOf.length}칸 중 씬 배선 ${wired}칸.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2-3. [참고·비차단] 씬을 실제로 구동하는 A12 표식 테스트 — DSN 실측과 대조용
// ══════════════════════════════════════════════════════════════════════════
/* 🔴 **판정에 쓰지 않는다.** V2 는 「규칙의 Y 가 화면에 도달하는가」를 구조로 본다.
 *    DSN(SC §3)은 다른 자로 쟀다 — 「씬을 구동하며 방향을 단언하는 테스트」 14건 → deposition 만 ≥5 → 1/8.
 *    두 수가 다른 것은 자가 다르기 때문이지 어느 한쪽이 틀려서가 아니다. 둘 다 보여 준다.
 *    이 계수를 **차단 판정에 쓰면 안 되는 이유**: `describe('A12…')` 라고 적기만 하면 늘어난다.
 *    표식은 사람이 붙이는 것이라 게이트의 자로 쓰기에 부적합하다. 참고선으로만 둔다. */
const a12TestByProcess = new Map();
if (existsSync(TESTS_DIR)) {
  for (const f of walk(TESTS_DIR, ['.test.ts'])) {
    const t = readFileSync(f, 'utf8');
    const imported = [...t.matchAll(/from\s+['"][^'"]*\/viz\/gl\/scenes\/([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]);
    const wired = [...new Set(imported)].filter((s) => wiredSceneIds.has(s));
    if (wired.length === 0) continue;
    const marks = [...t.matchAll(/\bdescribe\s*\(\s*['"`](A12\b[^'"`]*)/g)].length;
    if (marks === 0) continue;
    const pids = [...new Set(wiredCells.filter((c) => c.bindings.some((b) => wired.includes(b.sceneId))).map((c) => c.processId))];
    for (const pid of pids) a12TestByProcess.set(pid, (a12TestByProcess.get(pid) ?? 0) + marks);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3. [P] 잠정(PROVISIONAL) 고지 — 🔴 차단하지 않는다
// ══════════════════════════════════════════════════════════════════════════
// 🔴 이 절의 기준은 **내가 지어낸 잠정 기준**이다. DSN 이 계측 지점 개선안을 별도로 만들고 있으며,
//    그 안이 나오면 그쪽이 정본이다. 여기 수치를 근거로 규칙을 고치지 마라.
const RATIO_WORDS = /선형|비례|정비례|배로|배가|배씩|배다|× ?\d|\d+ ?배/;
const provisional = [];
for (const r of rules) {
  if (!RATIO_WORDS.test(r.statement)) continue;
  const trends = r.outputs.map((e) => e.trend);
  if (trends.every((t) => t === 'flat')) continue;
  provisional.push(`${r.file}:${r.line} '${r.ruleId}' — [${r.outputs.map((e) => `${e.output}:${e.trend}`).join(', ')}]`);
}

// ══════════════════════════════════════════════════════════════════════════
// 4. 결과 — 🔴 분모를 숨기지 않는다 (B-12)
// ══════════════════════════════════════════════════════════════════════════
const totalCells = cells.length;
const wiredCount = wiredCells.length;

console.log('A12 방향성 게이트 — 🔴 정본은 「화면의 Y」다 (모델층 통과는 A12 충족이 아니다)');
console.log(`  스캔: src/models/** · src/models/labs/** · src/viz/**${existsSync(TESTS_DIR) ? ' · tests/**(참고)' : ''}${SCOPED ? `  [--root=${ROOT}]` : ''}`);
/* 🔴 「칸 수」와 「씬 수」를 갈라 찍는다. 병치 칸은 1칸이지만 화면에는 2개가 그려진다 —
 *    한 숫자로 합치면 병치가 늘어나도 표가 안 움직여 **개선이 계측되지 않는다.** */
const bindingCount = wiredCells.reduce((n, c) => n + c.bindings.length, 0);
console.log(`  선언 규칙 ${rules.length}개 · 활성 공정 ${activeProcessIds.length}종 · 실습 ${totalCells}칸 중 씬 배선 ${wiredCount}칸(씬 ${bindingCount}개) · 구현 씬 ${sceneImplemented.size}종`);
const juxtaposedCells = wiredCells.filter((c) => c.bindings.length > 1);
if (juxtaposedCells.length > 0) {
  console.log(`  ▣ 씬 병치 칸 ${juxtaposedCells.length}건: ${juxtaposedCells.map((c) => `${c.processId}/${c.stage} [${cellSceneLabel(c)}]`).join(' · ')}`);
}
console.log('');
console.log('  공정         선언   화면도달   씬배선칸   A12(화면)');
for (const pid of activeProcessIds) {
  const dec = declaredByProcess.get(pid) ?? 0;
  const scr = screenOkByProcess.get(pid) ?? 0;
  const cellsOf = cells.filter((c) => c.processId === pid);
  const wired = cellsOf.filter((c) => c.bindings.length > 0).length;
  const ok = scr >= MIN_RULES;
  console.log(`  ${pid.padEnd(12)} ${String(dec).padStart(3)}   ${String(scr).padStart(6)}   ${String(wired).padStart(4)}/${cellsOf.length}칸    ${ok ? '✅' : '❌'}`);
}
console.log(`  → 화면 도달 ≥${MIN_RULES} 충족 ${a12Pass.length}/${activeProcessIds.length} 공정${a12Pass.length ? `: ${a12Pass.join(', ')}` : ''}`);
/* 🔴 강등 고지 — **이 게이트는 더 이상 A12 를 판정하지 않는다.** 다음 사람이 이 표를
 *    「A12 판정」으로 읽으면 안 된다. 어디로 갔는지 매 실행 말한다. */
console.log('');
console.log(`  ⛔ [V2 · 비차단] 위 ${MIN_RULES}개 기준은 **차단하지 않는다**(2026-08-22 강등). 참고 수치다.`);
console.log('     🔴 **A12 판정의 정본은 `scripts/check-a12c.mjs` 다** — 「화면에 나타나는가」가 아니라');
console.log('        「학습자가 **만질 수 있는 노브**에 방향 보증이 있는가」를 본다. 그쪽을 보라.');
if (v2Shortfall.length > 0) {
  console.log(`     참고 미달 ${v2Shortfall.length}건:`);
  for (const s of v2Shortfall) console.log(`       - ${s}`);
  console.log('     🔴 이 줄이 초록이 아니라고 이 게이트가 통과/실패하지 않는다.');
  console.log('        단, **V1 이 같은 사실을 규칙 단위로 차단한다** — V2 강등으로 잃은 차단력은 없다.');
}
if (a12TestByProcess.size > 0) {
  const line = [...a12TestByProcess.entries()].map(([p, n]) => `${p} ${n}`).join(' · ');
  console.log(`  [참고·비차단] 씬을 구동하는 A12 표식 describe: ${line}`);
  console.log('     ← DSN(SC §3)의 자는 이쪽이다(테스트 기준 1/8). 위 판정의 자는 「규칙의 Y 가 화면에 도달하는가」다.');
  console.log('       표식은 사람이 붙이는 것이라 차단 판정에 쓰지 않는다.');
}

if (provisional.length > 0) {
  console.log('');
  console.log(`⚠️  [잠정·비차단] 계측 지점이 못 보는 것 — 비례·배수를 주장하는데 추세 어휘만 선언한 규칙 ${provisional.length}건`);
  console.log('    현행 계측은 연속 차분의 **부호만** 본다. 「ALD 사이클 100→200 이 1.8배」(정답 2배)는 「증가」라서 통과한다.');
  console.log('    🔴 이 목록의 판정 기준은 **잠정**이다. DSN 이 계측 지점 개선안을 만들고 있으며 그쪽이 정본이다.');
  for (const p of provisional) console.log(`      - ${p}`);
}

if (errors.length > 0) {
  console.error(`\n❌ check-direction 실패 (${errors.length}건) — 🔴 전건 목록`);
  for (const e of errors) console.error('  ' + e);
  console.error('\n  🔴 이 게이트는 강화되었다(2026-08-21). 「물리층에 식이 있다」는 A12 충족이 아니다.');
  console.error('     완화로 통과시키지 마라(D-041) — 화면에 도달시키는 것이 유일한 해결이다.');
  process.exit(1);
}

console.log(`\n✅ check-direction 통과 — 선언 ${rules.length}개 · 활성 공정 ${activeProcessIds.length}종 전부 **화면 기준** 커버리지 충족`);
process.exit(0);
