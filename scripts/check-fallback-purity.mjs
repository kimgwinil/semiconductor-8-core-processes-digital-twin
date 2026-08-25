#!/usr/bin/env node
// check-fallback-purity.mjs — 🔴 **폴백 경로에 물리 계산이 있으면 실패.**
// 왜: `src/viz/gl/fallback2d.ts` 는 WebGL2 미지원 기기가 실제로 타는 제품 경로인데
// (LabRunner → viz.createFallback2D, 설계서 §15 L4), 씬 모듈을 static import 하면 셰이더
// 문자열이 청크로 끌려오므로(A9) 종전에는 **계산식을 손으로 다시 적고 있었다.** 정본이 둘이 되어
// 2026-08-21 실측에서 최대 23.06 배까지 갈려 있었다(ALD 100 °C 사이클당 성장 0.0394 vs 0.9091).
// 해법은 셰이더 없는 순수 모듈 `src/viz/gl/scenes/models/*.model.ts` 를 정본으로 두고
// **씬과 폴백이 둘 다 그것을 import** 하는 것이다. 이 검사기가 그 구조를 기계로 지킨다.
//
// 🔴 **부분문자열 검사를 쓰지 않는다.** 소스를 `includes('...')` 로 훑지 않는다.
//    주석·문자열을 먼저 제거한 뒤 **토큰과 구조**(함수 본문 · 식별자 · 수 리터럴 값)로만 판정한다.
//
// 축은 `check-layering.mjs` 와 같다 — src 를 걸어 규칙 위반을 모아 한 번에 보고하고 exit 1.
//
// 사용:
//   node scripts/check-fallback-purity.mjs            판정(위반이 있으면 exit 1)
//   node scripts/check-fallback-purity.mjs --measure  규칙별 적발 건수만 출력(항상 exit 0)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const FALLBACK = path.join(APP_ROOT, 'src/viz/gl/fallback2d.ts');
const MEASURE = process.argv.includes('--measure');

/** 폴백의 씬별 draw 함수 ↔ 그 씬의 모델 모듈. 씬이 늘면 여기에 한 줄 추가한다. */
const SCENE_DRAWERS = {
  drawFilmGrowth: 'filmGrowth.model.ts',
  drawPlasma: 'plasma.model.ts',
  drawIonTrajectory: 'ionTrajectory.model.ts',
  drawPolishProfile: 'polishProfile.model.ts',
  drawStepCoverage: 'stepCoverage.model.ts',
  drawAldCycle: 'aldCycle.model.ts',
  // 2026-08-21 신설 — wafer 3칸 · photo 3칸이 폴백에서 그려지게 한 drawer 2종.
  drawCrystalGrowth: 'crystalGrowth.model.ts',
  drawIngotSlicing: 'ingotSlicing.model.ts',
  drawAerialImage: 'aerialImage.model.ts',
  // 2026-08-22 신설 — eds 2칸 병치 + packaging 3칸. 화면이 0개였던 두 공정을 닫는다.
  drawProbeScrub: 'probeScrub.model.ts',
  drawWaferMap: 'waferMap.model.ts',
  drawPackageThermal: 'packageThermal.model.ts',
  drawMoistureSoak: 'moistureSoak.model.ts',
  drawShearTest: 'shearTest.model.ts',
};

const errors = [];
const fail = (msg) => errors.push(msg);

/* ---------- 주석·문자열 제거(길이를 보존해 위치를 유지한다) ---------- */
function strip(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && code[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { out += code[i] === '\n' ? '\n' : ' '; i++; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += ' '; i++;
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { out += '  '; i += 2; continue; }
        out += code[i] === '\n' ? '\n' : ' '; i++;
      }
      if (i < n) { out += ' '; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** 주석만 지운다(문자열은 남긴다 — import 지정자를 읽어야 한다). */
function stripComments(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && code[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { out += code[i] === '\n' ? '\n' : ' '; i++; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const lineOf = (src, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (src[k] === '\n') l++; return l; };

/** `function name(` 부터 중괄호 균형으로 본문을 잘라낸다. */
function functionBodies(src) {
  const out = new Map();
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = src.indexOf('{', re.lastIndex);
    if (i < 0) continue;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    out.set(m[1], { body: src.slice(i, j + 1), start: i });
  }
  return out;
}

/* ---------- 폴백이 모델에서 가져온 식별자 ---------- */
function modelImports(src) {
  const byModule = new Map(); // 모델 파일명 → Set(로컬 식별자)
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(\.\/scenes\/models\/[\w.]+)'/g;
  let m;
  while ((m = re.exec(src))) {
    const file = path.basename(m[2]) + (m[2].endsWith('.ts') ? '' : '.ts');
    const names = new Set();
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
    if (!byModule.has(file)) byModule.set(file, new Set());
    for (const n of names) byModule.get(file).add(n);
  }
  return byModule;
}

/* ---------- 검사 ---------- */
if (!existsSync(FALLBACK)) {
  console.error('❌ check-fallback-purity: 폴백 파일을 찾지 못했습니다 — ' + path.relative(APP_ROOT, FALLBACK));
  process.exit(1);
}
const raw = readFileSync(FALLBACK, 'utf8');
const src = strip(raw);
const bodies = functionBodies(src);
const imports = modelImports(stripComments(raw));

const counts = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0 };
const r4Detail = [];
const r2Detail = [];

/**
 * 🔴 **규칙은 실측으로 좁혔다(규율 2).** 후보 4가지를 먼저 계측한 결과:
 *   · 「모델 상수와 **같은 값**의 리터럴이 폴백에 있으면 실패」 → 15건 전부 오탐이었다.
 *     0.5 · 0.04 · 0.6 같은 배치 수가 우연히 모델 상수와 값이 같을 뿐이다
 *     (`pick(p,'power',0.5)` 의 기본값, `w*0.04` 여백, `globalAlpha=0.55`).
 *     **채택하지 않았다** — 오탐이 쏟아지면 진짜를 못 가린다.
 *   · 「정규화 파라미터가 산술 피연산자로 쓰이면 실패」 → 7건 전부 오탐이었다
 *     (선 굵기 `1+2*bias`, 입자 개수 `10+dose*50`, 축 마커 위치 `px0+temperature*(px1-px0)`).
 *     **계측(R4)으로만 남겼다.**
 * 남은 규칙(R1·R2·R3·R5)은 **현재 코드에서 0건**이고, 실제 결함(사본 복귀)에는 물린다.
 */
const DECAY_FNS = ['exp', 'log', 'log10', 'log2', 'expm1', 'log1p'];

/* R5 — 폴백의 모든 씬 draw 함수가 이 표에 등재돼 있어야 한다.
   등재를 빼먹으면 새 씬이 검사를 조용히 통과한다. */
for (const name of bodies.keys()) {
  if (!/^draw[A-Z]/.test(name)) continue;
  if (!(name in SCENE_DRAWERS)) {
    fail(`[R5] ${name}() 가 SCENE_DRAWERS 표에 없습니다 — 대응 모델 모듈을 등재하세요(등재하지 않으면 검사에서 빠집니다).`);
    counts.R5++;
  }
}

for (const [drawer, modelFile] of Object.entries(SCENE_DRAWERS)) {
  const fn = bodies.get(drawer);
  if (!fn) { fail(`[R1] ${drawer}() 가 없습니다 — SCENE_DRAWERS 표를 갱신하세요.`); counts.R1++; continue; }
  const names = imports.get(modelFile) ?? new Set();
  const picked = [...fn.body.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*pick\s*\(/g)].map((x) => x[1]);

  /* R1 — 대응 모델 모듈의 식별자를 최소 1회 **호출**한다.
     호출이 하나도 없으면 그 씬의 파생값을 폴백이 스스로 만들고 있다는 뜻이다. */
  let called = 0;
  for (const n of names) {
    called += (fn.body.match(new RegExp(`(?<![\\w$])${n}\\s*\\(`, 'g')) ?? []).length;
  }
  if (called === 0) {
    fail(`[R1] ${drawer}(): ${modelFile} 의 함수를 한 번도 부르지 않습니다 — 파생값을 자체 계산하고 있습니다.`);
    counts.R1++;
  }

  /* R2 — 지수·로그를 폴백에서 직접 부르지 않는다.
     포화(1−exp(−k·x)) · 감쇠 · 정규화는 전부 물리 파생값이고, 그리기에는 필요 없다.
     ALD 의 satCoverage, 이온 프로파일의 가우시안이 정확히 이 형태로 복제돼 있었다. */
  for (const f of DECAY_FNS) {
    for (const mm of fn.body.matchAll(new RegExp(`Math\\.${f}\\s*\\(`, 'g'))) {
      const line = lineOf(src, fn.start + mm.index);
      fail(`[R2] ${path.relative(APP_ROOT, FALLBACK)}:${line}: ${drawer}() 이 Math.${f}() 를 직접 부릅니다 — 감쇠·포화·정규화는 ${modelFile} 의 몫입니다.`);
      counts.R2++;
      r2Detail.push(`${drawer}(): Math.${f}`);
    }
  }

  /* R3 — 정규화 파라미터를 거듭제곱·지수의 인자로 넣지 않는다.
     시스 두께 s ∝ n_e^(−1/2)·V^(3/4) 처럼 **지수 관계가 물리**다. 그리기는 이런 형태를 쓰지 않는다.
     (그리기에 남은 pow 는 `Math.pow(cos φ, m.srcExp)` 처럼 **모델이 돌려준 값**을 쓴다.) */
  for (const mm of fn.body.matchAll(/Math\.(pow|exp)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    for (const n of picked) {
      if (!new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(mm[2])) continue;
      const line = lineOf(src, fn.start + mm.index);
      fail(`[R3] ${path.relative(APP_ROOT, FALLBACK)}:${line}: ${drawer}() 이 정규화 파라미터 '${n}' 를 Math.${mm[1]}() 에 직접 넣습니다 — 지수 관계는 ${modelFile} 의 몫입니다.`);
      counts.R3++;
    }
  }

  /* R4(계측 전용) — 정규화 파라미터가 산술 피연산자로 쓰이는가.
     선 굵기·개수·마커 위치 같은 **그리기**도 여기 걸리므로 판정하지 않고 건수만 센다.
     갑자기 늘면 사람이 들여다볼 신호로 쓴다. */
  for (const n of picked) {
    const re = new RegExp(`(?<![\\w$])${n}\\s*[*/+\\-]|[*/+\\-]\\s*${n}(?![\\w$])`, 'g');
    const hits = (fn.body.match(re) ?? []).length;
    if (hits) { counts.R4 += hits; r4Detail.push(`${drawer}(): ${n} × ${hits}`); }
  }
}

if (MEASURE) {
  console.log('■ check-fallback-purity — 계측 모드(판정하지 않음)');
  console.log(`  R1 모델 호출 없음              : ${counts.R1} 건`);
  console.log(`  R2 지수·로그 직접 호출          : ${counts.R2} 건`);
  console.log(`  R3 파라미터 → pow/exp 인자      : ${counts.R3} 건`);
  console.log(`  R5 미등재 draw 함수            : ${counts.R5} 건`);
  console.log(`  R4 파라미터 직접 산술(판정 안 함): ${counts.R4} 건`);
  for (const d of r4Detail) console.log(`     · ${d}`);
  for (const d of r2Detail) console.log(`     · ${d}`);
  for (const e of errors) console.log('     ! ' + e);
  process.exit(0);
}

if (errors.length) {
  console.error(`\n❌ check-fallback-purity 실패 (${errors.length}건) — 폴백이 물리를 다시 계산하고 있습니다`);
  for (const e of errors) console.error('  ' + e);
  console.error('\n  고치는 법: 식을 src/viz/gl/scenes/models/<씬>.model.ts 로 옮기고, 씬과 폴백이 둘 다 그것을 import 하세요.');
  process.exit(1);
}

console.log(
  `✅ check-fallback-purity 통과 — 씬 draw ${Object.keys(SCENE_DRAWERS).length}개 · 모델 모듈 ${imports.size}개 · 판정 규칙 R1·R2·R3·R5`,
);
process.exit(0);
