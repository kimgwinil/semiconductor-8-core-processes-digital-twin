#!/usr/bin/env node
/**
 * check-gate-registration 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *위반이 없어서*인지 *못 봐서*인지는
 *    픽스처 없이는 증명되지 않는다. 특히 이 게이트는 **주석에 속지 않는가**가 핵심이므로
 *    「주석에만 이름을 적은 verify」를 실제로 만들어 먹여 봐야 한다(ⓓ).
 * 🔴 **주입은 `scripts/`·`src/` 밖(`os.tmpdir()`)에서 한다.** 다른 담당이 같은 트리를
 *    동시 편집 중이라, 가짜 게이트 파일을 `scripts/` 에 만들면 그쪽 측정을 오염시킨다
 *    (2026-08-21 실측 사고). 파일은 매 실행마다 만들고 지우므로 저장소에 아무것도 남기지 않는다.
 *
 * 종료코드: 0 전부 기대대로 · 1 하나라도 어긋남 · 2 준비 실패.
 * 사용: node scripts/check-gate-registration.selftest.mjs
 */
import { mkdtempSync, writeFileSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-gate-registration.mjs');
const REAL_VERIFY = path.join(HERE, 'verify.mjs');
const SELF = 'check-gate-registration.mjs';

if (!existsSync(REAL_VERIFY)) {
  console.error('⚠️  준비 실패 — scripts/verify.mjs 가 없습니다.');
  process.exit(2);
}

/** 게이트를 돌리고 { code, json, out } 을 돌려준다. */
function run(args) {
  try {
    const out = execFileSync('node', [GATE, '--json', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out, json: JSON.parse(out) };
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    let json = null;
    try { json = JSON.parse(e.stdout ?? ''); } catch { /* 종료코드 2 경로는 JSON 이 아니다 */ }
    return { code: e.status ?? -1, out, json };
  }
}

/**
 * 임시 scripts 트리를 만든다.
 * 🔴 **실제 게이트 파일들의 「이름만」 빈 스텁으로 복제**한다 — 내용은 필요 없다.
 *    이 게이트는 파일 이름과 verify 의 step() 만 본다.
 * 🔴 자기 자신(`check-gate-registration.mjs`)도 **스텁에 포함한다.** 2026-08-22 00:16 에
 *    팀장이 verify.mjs 에 이 게이트를 등록했으므로, 자기 자신을 빼면 R5(유령 등록)가 뜬다.
 *    기준선은 「실제 트리를 그대로 복제하면 위반 0건」이어야 대조군으로 쓸 수 있다.
 */
function tree(extraFiles = {}, verifyBody = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gatereg-'));
  for (const name of readdirSync(HERE)) {
    if (!name.endsWith('.mjs')) continue;
    if (name === 'verify.mjs') continue;               // 아래에서 따로 깐다
    writeFileSync(path.join(dir, name), '');           // 이름만 있는 빈 스텁
  }
  if (verifyBody == null) copyFileSync(REAL_VERIFY, path.join(dir, 'verify.mjs'));
  else writeFileSync(path.join(dir, 'verify.mjs'), verifyBody);
  for (const [name, body] of Object.entries(extraFiles)) writeFileSync(path.join(dir, name), body);
  return dir;
}

const REAL_VERIFY_SRC = (await import('node:fs')).readFileSync(REAL_VERIFY, 'utf8');

const CASES = [];
const add = (id, desc, expect, fn) => CASES.push({ id, desc, expect, fn });

/* ─────────────────────────────────────────────────────────────────────────────
 * ⓐ 🔴 **자기 자신을 검사 대상에서 빼지 않았음을 증명한다.**
 *    실제 트리에서 verify 의 **등록 한 줄만 지운 사본**을 먹인다 → 자기 자신을 잡아야 한다.
 *
 *    ㄴ 왜 「현행 트리 그대로」가 아니라 사본인가: 2026-08-22 00:16 에 팀장이 verify.mjs 에
 *      이 게이트를 실제로 등록했다. 그 전(00:06~00:16)에는 현행 트리 그대로 돌려도
 *      자기 자신이 R1 으로 잡혔고 그 실측은 스레드 ③에 남겼다. 등록 뒤에는 그 상태를
 *      재현할 수 없으므로, **등록 줄만 제거한 사본**으로 같은 사실을 항구적으로 재현한다.
 * ───────────────────────────────────────────────────────────────────────────── */
add('ⓐ', '자기 자신도 검사 대상 — verify 에서 등록 줄만 지우면 자신을 잡는다', 'FAIL', () => {
  const body = REAL_VERIFY_SRC.split('\n')
    .filter((l) => !/^\s*step\(\s*['"]check-gate-registration['"]/.test(l))
    .join('\n');
  if (body === REAL_VERIFY_SRC) {
    return { code: -1, out: '', assert: false, note: '🔴 verify 에 check-gate-registration 등록 줄이 없습니다 — 케이스 전제가 깨졌습니다' };
  }
  const d = tree({}, body);
  const r = run(['--scripts-dir', d]);
  r.assert = r.json?.unregistered?.includes('check-gate-registration') === true;
  r.note = `미등록: [${(r.json?.unregistered ?? []).join(', ')}]`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓐ' 기준선 — **현행 트리 그대로** 위반 0건이어야 한다(팀장 등록 완료 후 상태). */
add("ⓐ'", '현행 트리(주입 없음) — 위반 0건', 'PASS', () => {
  const r = run([]);
  r.assert = (r.json?.errors?.length ?? -1) === 0;
  r.note = `게이트 ${r.json?.gates?.length}개 · step ${r.json?.steps?.length}건 · 위반 ${r.json?.errors?.length}건`;
  return r;
});

/* ⓐ'' tmp 대조군 — 실제 트리를 스텁으로 복제하면 위반 0건. 이후 케이스의 대조군이다. */
add("ⓐ''", 'tmp 대조군(실제 트리 스텁 복제 · verify 원본 복사) — 위반 0건', 'PASS', () => {
  const d = tree();
  const r = run(['--scripts-dir', d]);
  r.assert = (r.json?.errors?.length ?? -1) === 0;
  r.note = `게이트 ${r.json?.gates?.length}개 · step ${r.json?.steps?.length}건 · 위반 ${r.json?.errors?.length}건`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ⓑ 가짜 게이트 파일만 놓는다 → **검출돼야 한다**
 * ───────────────────────────────────────────────────────────────────────────── */
add('ⓑ', '가짜 check-zzz-fake.mjs 를 놓기만 함 → 미등록으로 검출', 'FAIL', () => {
  const d = tree({ 'check-zzz-fake.mjs': '// 가짜 게이트\n' });
  const r = run(['--scripts-dir', d]);
  r.assert = r.json?.unregistered?.length === 1 && r.json.unregistered[0] === 'check-zzz-fake';
  r.note = `미등록: [${(r.json?.unregistered ?? []).join(', ')}]`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ⓒ 그 가짜를 verify 의 **단계 목록(step 호출)** 에 넣으면 → 통과
 * ───────────────────────────────────────────────────────────────────────────── */
add('ⓒ', "가짜를 verify 에 step('check-zzz-fake', …) 로 실제 등록 → 통과", 'PASS', () => {
  const body = REAL_VERIFY_SRC.replace(
    "step('check-a6b', () => runNode('check-a6b.mjs'));",
    "step('check-a6b', () => runNode('check-a6b.mjs'));\nstep('check-zzz-fake', () => runNode('check-zzz-fake.mjs'));",
  );
  if (body === REAL_VERIFY_SRC) return { code: -1, out: '', assert: false, note: '🔴 삽입 지점(step check-a6b)을 못 찾음 — verify.mjs 가 바뀌었습니다' };
  const d = tree({ 'check-zzz-fake.mjs': '' }, body);
  const r = run(['--scripts-dir', d]);
  r.assert = (r.json?.errors?.length ?? -1) === 0 && r.json.steps.some((s) => s.name === 'check-zzz-fake');
  r.note = `위반 ${r.json?.errors?.length}건 · step 총 ${r.json?.steps?.length}건`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ⓓ 🔴 **부분문자열 함정** — 가짜 이름을 「주석·문자열·표」에만 적는다 → 여전히 검출돼야 한다.
 *    실제 verify.mjs 에 §V 종료코드 표·§W 절·머리주석이 있으므로 이 함정은 상상이 아니다.
 * ───────────────────────────────────────────────────────────────────────────── */
add('ⓓ', '가짜 이름을 주석·문자열·표에만 적음(코드 아님) → 여전히 검출', 'FAIL', () => {
  const trap = `
/* ── 🔴 함정 구역: 아래는 전부 **코드가 아니다** ──────────────────────────────
 * 순서: … → check-a6b → check-zzz-fake
 * ┌────────────────────┬──────────────┐
 * │ check-zzz-fake     │ 0 1          │
 * └────────────────────┴──────────────┘
 * 편입 예시:  step('check-zzz-fake', () => runNode('check-zzz-fake.mjs'));
 */
// step('check-zzz-fake', () => runNode('check-zzz-fake.mjs'));
const 함정_문자열 = "step('check-zzz-fake', () => runNode('check-zzz-fake.mjs'));";
const 함정_템플릿 = \`check-zzz-fake 는 이미 등록되어 있습니다\`;
console.log(함정_문자열.length + 함정_템플릿.length);
`;
  const d = tree({ 'check-zzz-fake.mjs': '' }, REAL_VERIFY_SRC + trap);
  const r = run(['--scripts-dir', d]);
  r.assert = r.json?.unregistered?.includes('check-zzz-fake') === true
    && !r.json.steps.some((s) => s.name === 'check-zzz-fake');
  r.note = `미등록: [${(r.json?.unregistered ?? []).join(', ')}] · step 목록에 zzz 포함 여부: `
    + `${r.json?.steps?.some((s) => s.name === 'check-zzz-fake')}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ⓔ 사유 없는 제외 등재 → R2 실패 (check-constants·check-guard-naming 의 R4 와 같은 규율)
 * ───────────────────────────────────────────────────────────────────────────── */
add('ⓔ', '사유 없는 제외 등재(reason 없음) → R2 실패', 'FAIL', () => {
  const d = tree({ 'check-zzz-fake.mjs': '' });
  const ex = path.join(d, 'exclude.json');
  writeFileSync(ex, JSON.stringify([{ name: 'check-zzz-fake', ref: 'verify.mjs §W' }]));
  const r = run(['--scripts-dir', d, '--exclude', ex]);
  r.assert = (r.json?.counts?.R2 ?? 0) >= 1;
  r.note = `R2 ${r.json?.counts?.R2} · 전체 위반 ${r.json?.errors?.length}건`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓕ 사유는 있으나 ref 가 **죽은 포인터**(존재하지 않는 §절) → R3 실패 */
add('ⓕ', '사유는 있으나 ref 가 없는 §절을 가리킴 → R3(죽은 포인터) 실패', 'FAIL', () => {
  const d = tree({ 'check-zzz-fake.mjs': '' });
  const ex = path.join(d, 'exclude.json');
  writeFileSync(ex, JSON.stringify([{
    name: 'check-zzz-fake', ref: 'verify.mjs §Q',
    reason: '이 게이트는 느려서 별도로 돌린다 — 사유 길이는 충분하지만 ref 가 죽었다.',
  }]));
  const r = run(['--scripts-dir', d, '--exclude', ex]);
  r.assert = (r.json?.counts?.R3 ?? 0) >= 1;
  r.note = `R3 ${r.json?.counts?.R3}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓖ ref 의 §절은 있지만 **그 절이 그 게이트를 말하지 않는다** → R3 실패
 *    (사유가 다른 절로 옮겨졌거나 지워진 경우. 「가리킴이 살아 있는가」를 재는 자리다.) */
add('ⓖ', 'ref 의 §절은 있으나 그 절이 해당 게이트를 언급하지 않음 → R3 실패', 'FAIL', () => {
  const d = tree({ 'check-zzz-fake.mjs': '' });
  const ex = path.join(d, 'exclude.json');
  writeFileSync(ex, JSON.stringify([{
    name: 'check-zzz-fake', ref: 'verify.mjs §V',
    reason: '§V 는 실재하는 절이지만 check-zzz-fake 를 한 글자도 말하지 않는다 — 무효여야 한다.',
  }]));
  const r = run(['--scripts-dir', d, '--exclude', ex]);
  r.assert = (r.json?.counts?.R3 ?? 0) >= 1;
  r.note = `R3 ${r.json?.counts?.R3}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓗ 고아 제외 — 제외에 적힌 게이트 파일이 실재하지 않는다 → R4 실패 */
add('ⓗ', '제외에 적힌 게이트 파일이 없음(고아 제외) → R4 실패', 'FAIL', () => {
  const d = tree();
  const ex = path.join(d, 'exclude.json');
  writeFileSync(ex, JSON.stringify([{
    name: 'check-사라진게이트', ref: 'verify.mjs §W',
    reason: '오래전에 지운 게이트인데 제외 목록에만 남아 있다 — 같은 이름이 부활하면 조용히 통과한다.',
  }]));
  const r = run(['--scripts-dir', d, '--exclude', ex]);
  r.assert = (r.json?.counts?.R4 ?? 0) >= 1;
  r.note = `R4 ${r.json?.counts?.R4}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓘ 유령 등록(역방향) — verify 가 없는 파일을 부른다 → R5 실패 */
add('ⓘ', "verify 가 없는 파일을 step('check-오타') 로 부름 → R5(유령 등록) 실패", 'FAIL', () => {
  const body = REAL_VERIFY_SRC + "\nstep('check-오타난이름', () => runNode('check-오타난이름.mjs'));\n";
  const d = tree({}, body);
  const r = run(['--scripts-dir', d]);
  r.assert = (r.json?.counts?.R5 ?? 0) >= 1;
  r.note = `R5 ${r.json?.counts?.R5}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓚ 🔴 이름표와 실행 대상 불일치 — R1 은 통과시키는 가장 지독한 형태 → R6 로 잡아야 한다.
 *    `step('check-zzz-fake', () => runNode('check-a6b.mjs'))` 는 이름이 목록에 있으므로 R1 은 조용하다.
 *    그런데 요약표에 'check-zzz-fake ✅' 로 찍히면서 그 게이트는 **한 번도 돌지 않는다.** */
add('ⓚ', "step('check-zzz-fake') 인데 실제로는 check-a6b.mjs 를 돌림 → R6 실패", 'FAIL', () => {
  const body = REAL_VERIFY_SRC
    + "\nstep('check-zzz-fake', () => runNode('check-a6b.mjs'));\n";
  const d = tree({ 'check-zzz-fake.mjs': '' }, body);
  const r = run(['--scripts-dir', d]);
  r.assert = (r.json?.counts?.R6 ?? 0) >= 1 && (r.json?.counts?.R1 ?? 0) === 0;
  r.note = `R6 ${r.json?.counts?.R6} · R1 ${r.json?.counts?.R1}(R1 은 이름만 보므로 0 인 것이 정상)`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ⓙ 계측기 고장 경로 — verify 파일이 없으면 **종료코드 2**(판정 실패 1 이 아니다) */
add('ⓙ', 'verify 파일이 없으면 종료코드 2(계측기 고장) — 1 로 위장하지 않는다', 'ERROR', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'gatereg-empty-'));
  const r = run(['--scripts-dir', d, '--verify', path.join(d, 'nope.mjs')]);
  r.assert = r.code === 2;
  r.note = `exit ${r.code}`;
  rmSync(d, { recursive: true, force: true });
  return r;
});

/* ═══════════════════════════ 실행 ═══════════════════════════ */
console.log('check-gate-registration 자체 검증 픽스처\n');
console.log('  ID  기대      실측      판정  케이스');
console.log('  ' + '─'.repeat(96));

let bad = 0;
for (const c of CASES) {
  const r = c.fn();
  const actual = r.code === 0 ? 'PASS' : r.code === 1 ? 'FAIL' : r.code === 2 ? 'ERROR' : `exit ${r.code}`;
  const ok = actual === c.expect && r.assert !== false;
  if (!ok) bad++;
  console.log(`  ${c.id.padEnd(3)} ${c.expect.padEnd(9)} ${actual.padEnd(9)} ${ok ? '✅' : '❌'}    ${c.desc}`);
  if (r.note) console.log(`       ↳ ${r.note}`);
  if (!ok) console.log('       ↳ 🔴 어긋남 — 출력:\n' + (r.out ?? '').split('\n').map((l) => '         ' + l).join('\n'));
}

console.log('  ' + '─'.repeat(96));
if (bad) {
  console.log(`\n❌ 픽스처 ${bad}/${CASES.length} 건이 기대와 어긋납니다 — 게이트를 고치세요.`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ 픽스처 ${CASES.length}/${CASES.length} 건 전부 기대대로 — 게이트가 미탐·오탐 없이 작동합니다.`);
}
