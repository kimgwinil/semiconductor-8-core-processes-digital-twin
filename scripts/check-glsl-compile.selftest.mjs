#!/usr/bin/env node
/**
 * check-glsl-compile 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *위반이 없어서*인지 *못 봐서*인지는
 *    픽스처 없이는 증명되지 않는다. 이 게이트는 특히 그렇다 —
 *    「18개 컴파일 성공」이라고 찍어도 실제로 컴파일을 하지 않았을 수 있다.
 *
 * 🔴 **주입은 `src/` 밖(임시 디렉터리)에서만 한다.** 다른 담당이 `src/` 를 동시 편집 중이라
 *    원본을 고쳤다 되돌리는 방식은 남의 편집을 지운다(2026-08-21 실측 사고).
 *    여기서는 `src/` 를 임시 디렉터리로 **복사**한 뒤 사본만 오염시키고,
 *    게이트의 `--src` 주입구로 그 사본을 겨눈다. 저장소에는 아무것도 남지 않는다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 이 픽스처의 핵심 — **정규식이 못 보는 것을 잡는가**
 * ══════════════════════════════════════════════════════════════════════════════
 *   이 게이트의 존재 이유는 `tests/unit/viz-glsl.test.ts` 가 **문자열 정규식만** 본다는 데 있다.
 *   그래서 각 오염마다 **두 계측기를 나란히 돌린다**:
 *     · GATE  = `check-glsl-compile.mjs --src <오염 사본>`
 *     · REGEX = 기존 `tests/unit/viz-glsl.test.ts` 를 **같은 오염 사본 위에서** 돌린 것
 *               (임시 vitest 설정으로 별칭 `@` 를 오염 사본으로 돌린다 — 실트리는 건드리지 않는다)
 *   의미론적 오염(⓸⓹⓺⓻)에서 **REGEX 는 통과하고 GATE 만 잡아야 한다.**
 *   그 칸이 곧 「이 게이트가 무엇을 새로 막는가」의 증거다.
 *
 * 종료코드: 0 전건 기대대로 · 1 하나라도 어긋남.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const GATE = path.join(HERE, 'check-glsl-compile.mjs');
const REAL_SRC = path.join(APP, 'src');
const REGEX_TEST = 'tests/unit/viz-glsl.test.ts';

/** 오염 사본을 만든다. 각 항목 `[상대경로, 찾을 문자열, 바꿀 문자열]` — 찾기 실패는 즉시 오류다. */
function corruptCopy(edits) {
  const dir = mkdtempSync(path.join(tmpdir(), 'glslsel-'));
  const src = path.join(dir, 'src');
  cpSync(REAL_SRC, src, { recursive: true });
  for (const [rel, find, replace] of edits) {
    const p = path.join(src, rel);
    const body = readFileSync(p, 'utf8');
    const n = body.split(find).length - 1;
    if (n !== 1) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`오염 앵커가 유일하지 않습니다(${n}건): ${rel} ← ${JSON.stringify(find.slice(0, 40))}`);
    }
    writeFileSync(p, body.replace(find, replace));
  }
  return { dir, src };
}

function runGate(src, env = {}) {
  try {
    const out = execFileSync('node', [GATE, '--src', src], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

/**
 * 기존 정규식 테스트를 **오염 사본 위에서** 돌린다.
 * 🔴 임시 vitest 설정으로 별칭 `@` 만 갈아끼운다. 실트리의 `vite.config.ts` 도 `src/` 도 건드리지 않는다.
 */
function runRegexTest(src) {
  const cfg = path.join(path.dirname(src), 'vitest.selftest.config.js');
  writeFileSync(cfg,
    `export default {\n  root: ${JSON.stringify(APP)},\n`
    + `  resolve: { alias: { '@': ${JSON.stringify(src)} } },\n`
    + `  test: { environment: 'node', include: [${JSON.stringify(REGEX_TEST)}] },\n};\n`);
  try {
    const out = execFileSync('npx', ['vitest', 'run', '--config', cfg],
      { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const CASES = [];
/**
 * @param id     표시용 번호
 * @param desc   설명
 * @param gate   'PASS' | 'FAIL'  — 이 게이트의 기대 판정
 * @param regex  'PASS' | 'FAIL' | null — 기존 정규식 테스트의 기대 판정(null 이면 돌리지 않음)
 * @param edits  오염 편집 목록
 */
const add = (id, desc, gate, regex, edits) => CASES.push({ id, desc, gate, regex, edits });

/* 앵커. 모두 실트리에서 **유일**함을 확인했다(유일하지 않으면 corruptCopy 가 즉시 오류를 낸다). */
const STEP = 'viz/gl/scenes/stepCoverage.ts';
const ION = 'viz/gl/scenes/ionTrajectory.ts';
const MAIN = 'void main() {';
const inject = (body) => [[STEP, MAIN, `${MAIN}\n${body}`]];

/* ─── ⓵ 오염 없음 — 게이트가 실트리 사본을 통과시키는가(오탐 없음) ─────────────── */
add('⓵', '오염 없는 사본 — 18개 전부 실제 컴파일·링크', 'PASS', 'PASS', []);

/* ─── ⓶⓷ 정규식도 잡는 오염 — 두 계측기가 같은 답을 내는지 확인(대조군) ────────── */
add('⓶', '괄호 제거 (main 의 여는 중괄호를 지운다)', 'FAIL', 'FAIL',
  [[STEP, MAIN, 'void main() ']]);
add('⓷', 'undefined 주입 (보간 실패 잔재)', 'FAIL', 'FAIL',
  inject('  float injectedBad = undefined;\n  if (injectedBad > 1e9) discard;'));

/* ─── ⓸~⓻ 🔴 **의미론적 오염 — 정규식은 통과하고 이 게이트만 잡아야 한다** ─────────
 *      네 건 모두 `${` 없음 · 괄호 균형 · void main 1개 · 레거시 없음 · precision/out 있음 ·
 *      함수 이름 중복 없음 · undefined/NaN/Infinity 없음 — 즉 정규식 검사를 **전부** 만족한다.
 *      그런데 컴파일러는 거부한다. 이 네 칸이 이 게이트의 존재 이유다. */
add('⓸', '🔴 존재하지 않는 함수 호출  fooBar(vUv)', 'FAIL', 'PASS',
  inject('  float injectedBad = fooBar(vUv);\n  if (injectedBad > 1e9) discard;'));
add('⓹', '🔴 타입 불일치  float x = vec3(1.0);', 'FAIL', 'PASS',
  inject('  float injectedBad = vec3(1.0);\n  if (injectedBad > 1e9) discard;'));
add('⓺', '🔴 선언 안 된 식별자 참조  uNopeUniform', 'FAIL', 'PASS',
  inject('  float injectedBad = uNopeUniform;\n  if (injectedBad > 1e9) discard;'));
/* 🔴 링크 단계 — 두 셰이더는 **각자 멀쩡히 컴파일된다.** 소스를 아무리 정규식으로 훑어도
 *    VS 의 out 과 FS 의 in 이 어긋난 것은 보이지 않는다. gl.linkProgram 만이 안다. */
add('⓻', '🔴 VS/FS varying 이름 불일치 (컴파일은 되고 **링크만** 깨진다)', 'FAIL', 'PASS',
  [[ION, 'out float vConc;', 'out float vConcRenamed;'],
    [ION, '  vConc = conc;', '  vConcRenamed = conc;']]);

/* ─── ⓼ 🔴 「0개」를 조용히 통과시키지 않는가 ──────────────────────────────────── */
add('⓼', '🔴 셰이더 발견 0개(gl 디렉터리 제거) — **조용한 통과 금지**', 'FAIL', null, 'DROP_GL');

/* 🔴 대조 계측기가 사라졌으면 **조용히 넘어가지 않는다.** REGEX 칸이 이 픽스처의 핵심 증거이고,
 *    파일이 없으면 vitest 가 「대상 없음」으로 죽어 「정규식도 잡았다」처럼 읽히는 오보가 난다. */
if (!existsSync(path.join(APP, REGEX_TEST))) {
  console.error(`⚠️  대조 계측기 파일이 없습니다: ${REGEX_TEST}`);
  console.error('   이 픽스처의 REGEX 칸(정규식 사각지대 증명)은 그 파일을 전제로 합니다.');
  console.error('   파일이 옮겨졌다면 이 픽스처의 REGEX_TEST 상수를 함께 고치십시오.');
  process.exit(1);
}

console.log('check-glsl-compile 자체 검증 — 주입은 전부 임시 디렉터리(src/ 밖)에서 한다\n');
console.log(`  대조 계측기: ${REGEX_TEST} (같은 오염 사본 위에서 별칭만 갈아끼워 실행)\n`);
console.log('  ID   GATE기대  GATE실측  REGEX기대  REGEX실측  판정  설명');

let pass = 0;
const detail = [];
for (const c of CASES) {
  let dir = null;
  let gateRes;
  let regexRes = null;
  try {
    if (c.edits === 'DROP_GL') {
      dir = mkdtempSync(path.join(tmpdir(), 'glslsel-'));
      cpSync(REAL_SRC, path.join(dir, 'src'), { recursive: true });
      rmSync(path.join(dir, 'src', 'viz', 'gl'), { recursive: true, force: true });
    } else {
      ({ dir } = corruptCopy(c.edits));
    }
    const src = path.join(dir, 'src');
    gateRes = runGate(src);
    if (c.regex) regexRes = runRegexTest(src);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }

  const gateActual = gateRes.code === 0 ? 'PASS' : 'FAIL';
  const regexActual = regexRes ? (regexRes.code === 0 ? 'PASS' : 'FAIL') : '—';
  const ok = gateActual === c.gate && (!c.regex || regexActual === c.regex);
  if (ok) pass++;
  console.log(`  ${c.id}   ${c.gate.padEnd(8)}  ${gateActual.padEnd(8)}  `
    + `${(c.regex ?? '—').padEnd(9)}  ${regexActual.padEnd(9)}  ${ok ? '✅' : '❌'}   ${c.desc}`);
  const evidence = gateRes.out.split('\n')
    .filter((l) => /ERROR:|링크 실패는|실제 컴파일|컴파일 실패|check-glsl-compile (실패|통과)|아무것도 보증/.test(l))
    .slice(0, 6).map((l) => '        ' + l.trim());
  detail.push(`  ${c.id} ${c.desc}\n${evidence.join('\n') || '        (증거 줄 없음)'}`);
  if (!ok) console.log(`        └ GATE exit ${gateRes.code}${regexRes ? ` · REGEX exit ${regexRes.code}` : ''}`);
}

/* ─── ⓽ SKIP 경로 — Chrome 이 없을 때 **조용히 통과하지 않는가** ────────────────
 * 🔴 종료코드는 0(SKIP 허용)이지만 출력에 대문자 SKIP 과 「0개」 문구가 **반드시** 있어야 한다.
 *    그 문구가 없으면 SKIP 이 PASS 로 읽힌다 — 이 게이트가 가장 조용히 무력화되는 경로다. */
{
  const dir = mkdtempSync(path.join(tmpdir(), 'glslsel-'));
  cpSync(REAL_SRC, path.join(dir, 'src'), { recursive: true });
  const r = runGate(path.join(dir, 'src'), { CHROME_PATH: path.join(dir, '없는-크롬') });
  rmSync(dir, { recursive: true, force: true });
  const hasSkip = /\bSKIP\b/.test(r.out);
  const hasZero = /컴파일한 셰이더 0개/.test(r.out);
  const ok = r.code === 0 && hasSkip && hasZero;
  if (ok) pass++;
  CASES.push({ id: '⓽' });
  console.log(`  ⓽   SKIP(0)  ${r.code === 0 ? 'exit 0 ' : `exit ${r.code}`}  `
    + `${'—'.padEnd(9)}  ${'—'.padEnd(9)}  ${ok ? '✅' : '❌'}   `
    + `🔴 Chrome 부재 → exit 0 이되 출력에 대문자 SKIP(${hasSkip ? '있음' : '없음'}) + 「0개」 문구(${hasZero ? '있음' : '없음'})`);
  detail.push(`  ⓽ Chrome 부재 SKIP 경로\n${r.out.split('\n').filter((l) => l.trim()).slice(2, 8).map((l) => '        ' + l.trim()).join('\n')}`);
}

console.log('\n─── 게이트 출력 증거 ───');
for (const d of detail) console.log(d);

console.log(`\n  ${pass}/${CASES.length} 통과`);
if (!existsSync(GATE)) { console.log('❌ 게이트 파일이 없습니다.'); process.exit(1); }
if (pass !== CASES.length) {
  console.log('\n❌ 픽스처 실패 — 게이트가 기대대로 동작하지 않습니다.');
  process.exit(1);
}
console.log('✅ 픽스처 전건 통과 — 실제 컴파일·링크 탐지, 정규식 사각지대 4종 포착, 0개 조용한 통과 금지,');
console.log('   Chrome 부재 SKIP 의 명시적 고지가 모두 증명됐습니다.');
