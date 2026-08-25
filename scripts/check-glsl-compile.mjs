#!/usr/bin/env node
/**
 * check-glsl-compile — 🔴 **셰이더를 진짜 WebGL2 로 컴파일한다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 무엇이 구멍이었나 (2026-08-22 실측)
 * ══════════════════════════════════════════════════════════════════════════════
 *   `tests/unit/viz-glsl.test.ts` 는 이름이 「GLSL 셰이더 정적 검사」지만
 *   **GLSL 을 한 줄도 컴파일하지 않는다.** 하는 일은 전부 문자열 정규식이다:
 *     `#version` 첫 줄 · `${` 잔재 · `undefined|NaN|Infinity` 토큰 · 괄호 균형 ·
 *     `void main()` 1개 · GLSL ES 1.00 잔재 · 함수 이름 중복 · precision/out 선언.
 *   그래서 **문법적으로 멀쩡해 보이지만 컴파일되지 않는 셰이더**를 전부 통과시킨다:
 *     · 존재하지 않는 함수 호출          `fooBar(vUv)`
 *     · 타입 불일치                      `float x = vec3(1.0);`
 *     · 선언 안 된 식별자 참조            `uNope`
 *     · VS/FS 사이 varying 이름·타입 불일치 (링크 단계에서만 드러난다)
 *   `tests/unit/viz-fallback-parity.test.ts` 는 **Canvas2D 폴백만** 본다(모델 모듈을 목으로
 *   갈아끼워 폴백이 정본을 따라가는지). GL 셰이더는 시야에 아예 없다.
 *   `check-scene-constants` 는 GLSL 을 **소스로 파싱**하지만 상수 주입 여부만 본다.
 *   → 즉 **셰이더가 실제로 컴파일되는가를 보는 게이트가 하나도 없었다.**
 *     깨지면 화면은 통째로 검게 남고, verify 는 끝까지 초록이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 이 게이트가 하는 일
 * ══════════════════════════════════════════════════════════════════════════════
 *   1. `src/viz/gl/**\/*.ts` 를 vite dev 서버로 브라우저에 **그대로 import** 시킨다.
 *      (셰이더 문자열은 TS 모듈 안에 있고 `${glslFloat(...)}` 로 조립되므로,
 *       **런타임에 조립된 최종 문자열**을 봐야 의미가 있다. 소스를 읽어서는 못 본다.)
 *   2. 내보낸 문자열 중 **첫 줄이 `#version 300 es`** 인 것을 전부 셰이더로 본다.
 *      🔴 목록을 손으로 적지 않는다 — `viz-glsl.test.ts` 의 `CASES` 는 실제로 두 번
 *         뒤늦게 갱신됐다(2026-08-21 · 2026-08-22, 그 사이 신규 씬은 검사 0건이었다).
 *         **열거를 손으로 하면 반드시 낡는다.** 여기서는 발견이 자동이다.
 *   3. 시스템 Chrome 의 WebGL2 컨텍스트에서 `gl.compileShader` 로 **실제 컴파일**하고,
 *      `gl.linkProgram` 으로 **실제 링크**한다(FS 는 같은 모듈의 짝 VS, 없으면 `FULLSCREEN_VS`).
 *   4. 실패하면 `getShaderInfoLog`/`getProgramInfoLog` 를 **문제 줄 번호와 주변 원문**과 함께 낸다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 종료코드 정책 — **「아무것도 못 쟀다」를 「통과」로 위장하지 않는다**
 * ══════════════════════════════════════════════════════════════════════════════
 *   0  통과   — 컴파일 성공 개수 ≥ 1 이고 실패 0건.
 *   0  SKIP   — **Chrome 실행 파일이 없다.** 출력에 대문자 `SKIP` 과 사유를 반드시 찍는다.
 *               🔴 이때 이 게이트는 **아무것도 보증하지 않는다.** CI 에서 Chrome 을 깔면 사라진다.
 *   1  FAIL   — 컴파일/링크 실패가 1건 이상, **또는 Chrome 이 있는데 실제 컴파일 0개.**
 *               🔴 0개는 「위반 없음」이 아니라 「재지 못했는데 Chrome 은 있었다」이므로 실패다
 *                  (WebGL2 컨텍스트 획득 실패 · 셰이더 발견 0건 · 모듈 import 실패 전부 여기).
 *   2  ERROR  — 계측기 고장(vite 기동 실패 · 페이지 자체가 죽음 · 복사 실패).
 *               판정 실패(1)와 반드시 구분한다 — 이때의 수치는 전부 무효다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 src 를 임시 디렉터리로 **복사**해서 도는가
 * ══════════════════════════════════════════════════════════════════════════════
 *   ① 이 게이트는 저장소에 **아무것도 쓰지 않는다.** vite 는 root 에 index.html 과
 *      캐시를 요구하는데, 실트리 root 에 그것을 만들면 동시 편집자의 트리를 오염시킨다
 *      (2026-08-21 실측 사고 — selftest-gates 배타 락 주석 참조).
 *   ② 픽스처(`check-glsl-compile.selftest.mjs`)가 `--src` 로 **오염된 사본**을 주입할 수 있다.
 *      🔴 `src/` 원본을 고쳤다 되돌리는 방식은 금지다(동시 편집 중이면 되돌리기가 남의 편집을 지운다).
 *
 * 사용:
 *   node scripts/check-glsl-compile.mjs                판정
 *   node scripts/check-glsl-compile.mjs --src <dir>    🔴 픽스처 전용 주입구(기본 <app>/src)
 *   node scripts/check-glsl-compile.mjs --json         기계 판독용 출력
 *   CHROME_PATH=... 로 Chrome 경로를 바꾼다(qa-shots.mjs 와 같은 규약).
 */
import { chromium } from 'playwright-core';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const KEEP = argv.includes('--keep');
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const SRC = path.resolve(flag('--src') ?? path.join(APP, 'src'));
const IS_FIXTURE = argv.includes('--src');

/* qa-shots.mjs 와 **같은 경로 규약**을 쓴다(두 곳이 다른 규약을 쓰면 하나는 낡는다). */
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const log = (...a) => { if (!AS_JSON) console.log(...a); };

function bail(msg, hint) {
  console.error(`⚠️  check-glsl-compile 실행 오류 — ${msg}`);
  if (hint) console.error(`   ${hint}`);
  console.error('   🔴 이것은 「위반 없음」도 「위반 있음」도 아닙니다. 재지 못한 것입니다(종료코드 2).');
  process.exit(2);
}

if (!existsSync(SRC)) bail(`소스 디렉터리가 없습니다: ${SRC}`);

/* ═══════════════ ① Chrome 부재 — SKIP(0). 단, 침묵하지 않는다 ═══════════════ */
if (!existsSync(CHROME)) {
  console.log('check-glsl-compile — 셰이더를 진짜 WebGL2 로 컴파일합니다');
  console.log('');
  console.log('🟡 SKIP — 시스템 Chrome 을 찾지 못했습니다.');
  console.log(`   찾은 경로: ${CHROME}`);
  console.log('   CHROME_PATH 환경변수로 지정하거나 Google Chrome 을 설치하세요.');
  console.log('   🔴 **컴파일한 셰이더 0개 — 이 게이트는 이번 실행에서 아무것도 보증하지 못했습니다.**');
  console.log('      SKIP 은 PASS 가 아닙니다. 종료코드는 0 이지만 셰이더는 한 줄도 검사되지 않았습니다.');
  if (AS_JSON) console.log(JSON.stringify({ skip: true, reason: 'chrome-missing', chrome: CHROME, compiled: 0 }));
  process.exit(0);
}

/* ═══════════════ ② 작업 사본 — 저장소에 아무것도 쓰지 않는다 ═══════════════ */
const WORK = mkdtempSync(path.join(tmpdir(), 'glslc-'));
const cleanup = () => { if (!KEEP) { try { rmSync(WORK, { recursive: true, force: true }); } catch { /* 무시 */ } } };

try {
  cpSync(SRC, path.join(WORK, 'src'), { recursive: true });
} catch (e) {
  cleanup();
  bail(`소스 복사 실패: ${e.message}`, `원본 ${SRC} → 작업본 ${path.join(WORK, 'src')}`);
}

/* 브라우저에서 도는 수확기. 🔴 셰이더 목록을 **손으로 열거하지 않는다** — glob 로 발견한다. */
writeFileSync(path.join(WORK, 'harness.js'), String.raw`
const mods = import.meta.glob('./src/viz/gl/**/*.ts', { eager: true });

/**
 * 셰이더 판정 — 첫 줄이 '#version 300 es' **이고** void main() 을 가진 것.
 * 🔴 main() 조건이 필요한 이유: FRAG_HEAD 같은 **머리말 조각**도 '#version 300 es' 로 시작한다.
 *    조각은 그 자체로는 컴파일 대상이 아니다(합쳐진 뒤에야 셰이더가 된다).
 *    조각을 셰이더로 세면 "Missing main()" 오탐이 나고, 그 오탐이 진짜를 가린다.
 */
function isShader(v) {
  if (typeof v !== 'string') return false;
  const first = v.split('\n').find((l) => l.trim().length > 0) ?? '';
  if (first.trim() !== '#version 300 es') return false;
  return /\bvoid\s+main\s*\(/.test(v);
}

const found = [];
const seen = new Set();
for (const [file, mod] of Object.entries(mods)) {
  for (const [name, val] of Object.entries(mod ?? {})) {
    if (!isShader(val)) continue;
    const key = name + ' ' + val;
    if (seen.has(key)) continue;      // 재수출(re-export)로 같은 것이 두 번 잡히는 경우
    seen.add(key);
    found.push({
      name,
      file: file.replace(/^\.\//, ''),
      // 정점 셰이더는 gl_Position 에 쓴다. 조각 셰이더에는 그 심볼이 없다.
      stage: val.includes('gl_Position') ? 'vert' : 'frag',
      src: val,
    });
  }
}
found.sort((a, b) => (a.file + a.name).localeCompare(b.file + b.name));

const canvas = document.createElement('canvas');
canvas.width = 64; canvas.height = 64;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) {
  window.__GLSL_RESULT = { fatal: 'WebGL2 컨텍스트를 얻지 못했습니다', shaders: [], programs: [] };
} else {
  const byName = new Map(found.map((s) => [s.name, s]));
  const compiled = new Map();   // name → WebGLShader (성공한 것만)
  const shaders = [];

  for (const s of found) {
    const sh = gl.createShader(s.stage === 'vert' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
    gl.shaderSource(sh, s.src);
    gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) === true;
    const infoLog = (gl.getShaderInfoLog(sh) || '').trim();
    if (ok) compiled.set(s.name, sh); else gl.deleteShader(sh);
    shaders.push({ name: s.name, file: s.file, stage: s.stage, ok, infoLog, src: ok ? null : s.src });
  }

  /* ── 링크 짝짓기 ─────────────────────────────────────────────────────────
   * 🔴 이름꼴로 자동 결정한다: XXX_FS 의 짝은 같은 이름의 XXX_VS, 없으면 FULLSCREEN_VS.
   *    (ION_PARTICLE_FS↔ION_PARTICLE_VS · ION_PROFILE_FS↔ION_PROFILE_VS 가 여기 해당한다.)
   *    손으로 짝 표를 적으면 씬이 늘 때 낡는다 — 그것이 CASES 가 두 번 낡은 이유다. */
  const programs = [];
  for (const s of found) {
    if (s.stage !== 'frag') continue;
    const pairName = s.name.replace(/_FS$/, '_VS');
    const vsName = (pairName !== s.name && byName.has(pairName)) ? pairName : 'FULLSCREEN_VS';
    const vs = compiled.get(vsName);
    const fs = compiled.get(s.name);
    if (!vs || !fs) {
      programs.push({ fs: s.name, vs: vsName, ok: false, skipped: true,
        infoLog: '짝 셰이더가 컴파일에 실패해 링크를 시도할 수 없습니다' });
      continue;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    const ok = gl.getProgramParameter(prog, gl.LINK_STATUS) === true;
    programs.push({ fs: s.name, vs: vsName, ok, skipped: false, infoLog: (gl.getProgramInfoLog(prog) || '').trim() });
    gl.deleteProgram(prog);
  }

  window.__GLSL_RESULT = {
    fatal: null,
    renderer: gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shaders,
    programs,
  };
}
`);

writeFileSync(path.join(WORK, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>glsl-compile-gate</title>'
  + '<script type="module" src="/harness.js"></script>\n');

/* ═══════════════ ③ vite dev 서버 ═══════════════ */
let server = null;
let browser = null;
let exitCode = 0;

try {
  const { createServer } = await import('vite');
  /* 🔴 `configFile: false` — 실 vite.config.ts 를 읽지 않는다.
   *    저 파일은 react 플러그인을 붙이고 alias 를 실 src 로 고정한다. 둘 다 여기서는 해롭다
   *    (픽스처가 주입한 사본이 아니라 원본을 보게 된다 = 픽스처가 무력화된다). */
  server = await createServer({
    configFile: false,
    root: WORK,
    logLevel: 'silent',
    resolve: { alias: { '@': path.join(WORK, 'src') } },
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [WORK] } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const addr = server.httpServer.address();
  const BASE = `http://127.0.0.1:${addr.port}`;

  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`[console] ${m.text()}`); });

  await page.goto(BASE, { waitUntil: 'load' });
  let result = null;
  try {
    await page.waitForFunction(() => window.__GLSL_RESULT !== undefined, null, { timeout: 30_000 });
    result = await page.evaluate(() => window.__GLSL_RESULT);
  } catch {
    result = null;
  }

  log('check-glsl-compile — 셰이더를 **진짜 WebGL2 로 컴파일**합니다');
  log(`  소스: ${IS_FIXTURE ? SRC : 'src/'}${IS_FIXTURE ? '  (🔴 픽스처 주입)' : ''}`);
  log(`  Chrome: ${CHROME}`);

  /* ── 페이지가 결과를 못 만든 경우 ── */
  if (result == null) {
    log('');
    log('❌ check-glsl-compile 실패 — **실제 컴파일 0개**');
    log('   🔴 「컴파일한 셰이더 0개 — 이 게이트는 이번 실행에서 아무것도 보증하지 못했습니다.」');
    log('   Chrome 은 있었는데 결과를 얻지 못했습니다. 모듈 import 가 죽었을 가능성이 큽니다:');
    for (const e of pageErrors.slice(0, 12)) log(`     · ${e}`);
    if (pageErrors.length === 0) log('     · (페이지 오류 없음 — 하니스가 30초 안에 끝나지 못했습니다)');
    if (AS_JSON) console.log(JSON.stringify({ compiled: 0, fatal: 'no-result', pageErrors }, null, 2));
    exitCode = 1;
  } else {
    const shaders = result.shaders ?? [];
    const programs = result.programs ?? [];
    const okShaders = shaders.filter((s) => s.ok);
    const badShaders = shaders.filter((s) => !s.ok);
    const badPrograms = programs.filter((p) => !p.ok && !p.skipped);
    const skippedPrograms = programs.filter((p) => p.skipped);

    log(`  WebGL2: ${result.version ?? '(없음)'} · ${result.renderer ?? '(없음)'}`);
    log('');
    /* 🔴 「N개 검사」가 아니라 **「N개 실제 컴파일 성공」**으로 적는다. */
    log(`  🔵 **실제 컴파일 성공 ${okShaders.length}개** / 발견 ${shaders.length}개`
      + `  ·  실제 링크 성공 ${programs.filter((p) => p.ok).length}개 / 시도 ${programs.length}개`);
    if (!AS_JSON) {
      for (const s of shaders) {
        log(`     ${s.ok ? '✅' : '❌'} ${s.stage === 'vert' ? 'VS' : 'FS'} ${s.name.padEnd(22)} ${s.file}`);
      }
      for (const p of programs.filter((x) => !x.ok)) {
        log(`     ${p.skipped ? '⏭ ' : '❌'} LINK ${p.vs} + ${p.fs}`);
      }
    }

    if (result.fatal) {
      log('');
      log(`❌ check-glsl-compile 실패 — ${result.fatal}`);
      log('   🔴 **컴파일한 셰이더 0개 — 이 게이트는 이번 실행에서 아무것도 보증하지 못했습니다.**');
      log('      Chrome 은 있었으므로 SKIP 이 아니라 실패입니다.');
      exitCode = 1;
    } else if (okShaders.length === 0) {
      log('');
      log('❌ check-glsl-compile 실패 — **실제 컴파일 0개**');
      log('   🔴 「컴파일한 셰이더 0개 — 이 게이트는 이번 실행에서 아무것도 보증하지 못했습니다.」');
      log(`      셰이더를 ${shaders.length}개 발견했고 그중 성공이 0개입니다. 아래 원문을 보십시오.`);
      exitCode = 1;
    }

    if (badShaders.length || badPrograms.length) {
      log('');
      log(`❌ check-glsl-compile 실패 — 컴파일 ${badShaders.length}건 · 링크 ${badPrograms.length}건`);
      for (const s of badShaders) log(reportShader(s));
      for (const p of badPrograms) {
        log(`\n  ── LINK ${p.vs} + ${p.fs} ────────────────────────────────`);
        log(`     ${p.infoLog.split('\n').join('\n     ') || '(infoLog 비어 있음)'}`);
        log('     🔴 링크 실패는 **정규식 검사가 원리적으로 못 보는 것**입니다 —');
        log('        VS 의 out 과 FS 의 in 이 이름·타입에서 어긋나면 여기서만 드러납니다.');
      }
      if (skippedPrograms.length) {
        log(`\n  ⏭  링크 시도 못 함 ${skippedPrograms.length}건 (짝 셰이더 컴파일 실패): `
          + skippedPrograms.map((p) => `${p.vs}+${p.fs}`).join(' · '));
      }
      log('\n  🔴 `tests/unit/viz-glsl.test.ts` 는 정규식만 봅니다. 위 오류는 그 테스트를 통과합니다.');
      exitCode = 1;
    } else if (exitCode === 0) {
      log('');
      log(`✅ check-glsl-compile 통과 — **실제 컴파일 성공 ${okShaders.length}개 · 실제 링크 성공 ${programs.length}개**`
        + ' (컴파일 실패 0 · 링크 실패 0)');
    }

    if (pageErrors.length) {
      log(`\n  ⚠️  페이지 오류 ${pageErrors.length}건(판정에는 쓰지 않음): ${pageErrors.slice(0, 5).join(' | ')}`);
    }
    if (AS_JSON) {
      console.log(JSON.stringify({
        compiled: okShaders.length, found: shaders.length,
        linked: programs.filter((p) => p.ok).length, linkTried: programs.length,
        shaders: shaders.map(({ src, ...r }) => r), programs, pageErrors,
      }, null, 2));
    }
  }
} catch (e) {
  cleanup();
  bail(`계측기 고장: ${e && e.message ? e.message : String(e)}`,
    'vite 기동 또는 Chrome 기동에 실패했습니다. 판정 실패(1)가 아니라 재지 못한 것입니다.');
} finally {
  try { if (browser) await browser.close(); } catch { /* 무시 */ }
  try { if (server) await server.close(); } catch { /* 무시 */ }
  cleanup();
}

/** 컴파일 실패 1건을 **줄 번호와 주변 원문**과 함께 낸다. */
function reportShader(s) {
  const out = [];
  out.push(`\n  ── ${s.stage === 'vert' ? 'VS' : 'FS'} ${s.name}  (${s.file}) ──────────────────`);
  const info = s.infoLog || '(infoLog 비어 있음)';
  for (const l of info.split('\n')) if (l.trim()) out.push(`     ${l.trim()}`);
  /* GLSL infoLog 의 위치 표기는 `ERROR: <string>:<line>: ...` 이다. 그 줄을 원문에서 짚어 준다. */
  const lines = (s.src ?? '').split('\n');
  const nums = [...new Set([...info.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+)/g)].map((m) => Number(m[1])))];
  for (const n of nums.slice(0, 6)) {
    out.push(`     ┄ 원문 ${n}행 부근 ┄`);
    for (let i = Math.max(1, n - 2); i <= Math.min(lines.length, n + 2); i++) {
      out.push(`     ${String(i).padStart(4)}${i === n ? ' ▶' : '  '} ${lines[i - 1]}`);
    }
  }
  if (nums.length === 0) out.push('     (infoLog 에 줄 번호가 없어 원문을 짚지 못했습니다)');
  return out.join('\n');
}

process.exitCode = exitCode;
