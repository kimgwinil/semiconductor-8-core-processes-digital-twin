#!/usr/bin/env node
/**
 * check-a11 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *원장과 자산이 실제로 정합해서*인지
 *    *어긋난 것을 못 봐서*인지는 픽스처 없이는 증명되지 않는다(R-7c — 합격만 나오는 게이트도
 *    **불합격만 나오는 게이트도** 위반이다). 그래서 아래는 **통과 방향(ⓐ)과 탐지 방향(ⓑ~ⓗ)을
 *    둘 다** 갖는다.
 *
 *    🔴 특히 **A11-3(제작자=검수자)·A11-5(유령 등재)는 실트리 실측이 0 건**이다.
 *    실측 0 이 「위반이 없다」인지 「검사가 안 돈다」인지 말할 수 있는 근거는 ⓓ·ⓕ 뿐이다.
 *
 * 🔴 **주입은 진짜 원장·진짜 `app/public/assets` 밖에서 한다.** 위반 데이터를 실트리에 심으면
 *    같은 트리를 동시에 쓰는 다른 게이트(`check-assets` 등)와 다른 담당의 측정을 오염시킨다
 *    (`check-citations.selftest.mjs`·`check-ledger-parity.selftest.mjs` 머리주석과 같은 이유).
 *    픽스처는 `scripts/fixtures/a11/**` 이며 **합성 원장 + 합성 자산 트리**를 통째로 갖는다.
 *
 * 🔴 **날짜·기준선을 전부 주입한다.** `--a11-baseline`·`--promote-on`·`--today` 를 항상 준다.
 *    이것이 없으면 **승격일이 지나는 순간 픽스처가 실날짜에 오염돼** 어느 날 갑자기 색이 바뀐다
 *    (check-citations 가 `--r5-baseline` 만 뚫어 두어 실제로 겪은 사고). 여기서는
 *    ⓝ·ⓞ 가 **승격 경로 자체를 날짜 주입으로** 시험하므로 실날짜에 의존하는 자리가 없다.
 *
 * 사용: node scripts/check-a11.selftest.mjs
 * 종료코드: 0 전건 통과 · 1 픽스처 실패
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-a11.mjs');
const FX = path.join(HERE, 'fixtures', 'a11');

const ZERO = '{}';   // 🔴 부분 주입이 아니라 **전 ID 0** — 실트리 기준선이 새어 들어오지 않는다.
const FAR = '2099-01-01';
const EARLY = '2026-01-01';

function run(args) {
  try {
    const out = execFileSync('node', [GATE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
}

/** 픽스처 한 벌을 돈다. `baseline`·`today`·`promoteOn` 은 항상 명시한다(주입 대칭). */
function onFx(dir, { baseline = ZERO, today = EARLY, promoteOn = FAR, json = true } = {}) {
  const root = path.join(FX, dir);
  const args = ['--project-root', root, '--ledger', path.join(root, 'ledger.md'),
    '--a11-baseline', baseline, '--today', today, '--promote-on', promoteOn];
  if (json) args.push('--json');
  return run(args);
}

/** `--json` 출력에서 검사 ID 별 실측 건수를 뽑는다. */
function counts(out) {
  const j = JSON.parse(out);
  const m = {};
  for (const c of j.checks) m[c.id] = c.count;
  return { m, j };
}

/** 🔴 기대 건수를 **전 ID 에 대해** 못박는다 — 한 검사가 옆 검사로 새면 그것도 실패다. */
function expectCounts(out, expected) {
  let m;
  try { ({ m } = counts(out)); } catch (e) { return `--json 출력을 읽지 못했다 — ${e.message}`; }
  const want = { 'A11-1': 0, 'A11-2': 0, 'A11-3': 0, 'A11-4': 0, 'A11-5': 0, 'A11-6': 0, ...expected };
  const bad = Object.keys(want).filter((k) => m[k] !== want[k]);
  if (bad.length > 0) return `건수 불일치 — ${bad.map((k) => `${k} 기대 ${want[k]} ↔ 실측 ${m[k]}`).join(' · ')}`;
  return null;
}

function hitsOf(out, id) {
  return JSON.parse(out).checks.find((c) => c.id === id)?.hits ?? [];
}

const CASES = [];
/** expect: 기대 종료코드(0 통과 · 1 판정 실패 · 2 계측기 오류) · assert: 출력이 무엇을 말해야 하는가 */
const add = (id, desc, expect, fn, assert) => CASES.push({ id, desc, expect, fn, assert });

/* ══════════════════════════════════════════════════════════════════════════════
 * ⓐ 🔴 R-7c — 「불합격만 나오는 게이트도 위반이다」. 정합한 원장·자산 한 벌이 실제로
 *    **전 검사 0건 · 종료코드 0** 으로 나오는지부터 증명한다. 이게 없으면 아래 탐지 픽스처가
 *    「원래 항상 실패하는 게이트」를 잡아낸 것인지 구분할 수 없다.
 * ══════════════════════════════════════════════════════════════════════════════ */
add('ⓐ', '정상 트리 — 5필드 채움·제작자≠검수자·판정 합격·파일 실재 → 전 검사 0건, 통과', 0,
  () => onFx('pass'),
  (o) => expectCounts(o, {}));

add('ⓐ2', '🔴 자산 표 판별이 구조다 — 문장·비자산 표(§2 검수 항목·§4-A 이음매)를 표로 세지 않는다', 0,
  () => onFx('pass'),
  (o) => {
    const j = JSON.parse(o);
    if (j.assetTables.length !== 2) return `자산 원장 표를 2종으로 세야 하는데 ${j.assetTables.length}종을 셌다 (비자산 표가 섞였다)`;
    if (j.ledgerRows !== 2) return `등재 행을 2건으로 세야 하는데 ${j.ledgerRows}건을 셌다`;
    return null;
  });

/* ── ⓑ A11-1 미등재 · 🔴 확장자 전종(D-050 K-4) ────────────────────────────── */
add('ⓑ', 'A11-1: 원장에 없는 이미지를 잡는다 — 🔴 png·jpg·jpeg·webp·svg·avif·gif **7종 전부**', 1,
  () => onFx('unregistered'),
  (o) => {
    const c = expectCounts(o, { 'A11-1': 7 });
    if (c) return c;
    const hits = hitsOf(o, 'A11-1').join('\n');
    const miss = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif', 'gif'].filter((e) => !hits.includes(`orphan.${e} `));
    return miss.length > 0 ? `확장자 ${miss.join('·')} 를 훑지 않았다 — 한 종만 세면 D-050 K-4 위반이다` : null;
  });

add('ⓑ2', '🔴 이미지가 아닌 파일(labels.json·PROVENANCE.md)은 분모에 넣지 않는다', 1,
  () => onFx('unregistered'),
  (o) => {
    const j = JSON.parse(o);
    if (j.images !== 9) return `이미지를 9건(등재 2 + 고아 7)으로 세야 하는데 ${j.images}건을 셌다`;
    return /labels\.json|PROVENANCE/.test(JSON.stringify(j.checks)) ? '이미지가 아닌 파일이 위반으로 세어졌다' : null;
  });

/* ── ⓒ A11-2 필수 필드 — 열 부재 + 자리표시자 ──────────────────────────────── */
add('ⓒ', 'A11-2: 「장비」 **열 자체가 없는** 것을 잡는다 (본문에 낱말이 있어도 통과 못 한다)', 1,
  () => onFx('fields'),
  (o) => {
    const c = expectCounts(o, { 'A11-2': 3 });
    if (c) return c;
    return hitsOf(o, 'A11-2').some((h) => /「장비」 \*\*열 자체가 없다\*\*/.test(h)) ? null : '열 부재를 잡지 못했다';
  });

add('ⓒ2', '🔴 A11-2: 자리표시자(`(미정)`·`(검수 대기)`)를 「채워졌다」로 세지 않는다 — check-assets 의 구멍', 1,
  () => onFx('fields'),
  (o) => {
    const h = hitsOf(o, 'A11-2').join('\n');
    return /「근거 출처」 칸이 비었거나 자리표시자다: 「\(미정\)」/.test(h)
        && /「검수자」 칸이 비었거나 자리표시자다: 「\(검수 대기\)」/.test(h)
      ? null : '자리표시자 2건을 둘 다 잡지 못했다';
  });

/* ── ⓓ 🔴 A11-3 제작자 ≠ 검수자 — 실트리 실측 0 건인 검사의 탐지 방향 증명 ──── */
add('ⓓ', '🔴 A11-3: 제작자와 검수자가 같으면 잡는다 (원장 §1 이 「같으면 CI 실패」라 적고도 미구현이던 자리)', 1,
  () => onFx('same-person'),
  (o) => expectCounts(o, { 'A11-3': 2 }));

add('ⓓ2', '🔴 A11-3: 공백·대소문자·경칭 차이를 정규화한다 — `DSN 팀장` ≡ `dsn`', 1,
  () => onFx('same-person'),
  (o) => hitsOf(o, 'A11-3').some((h) => /제작자와 검수자가 같다: dsn .*제작자 「DSN 팀장」 · 검수자 「dsn」/.test(h))
    ? null : '경칭·대소문자 정규화가 안 됐다 — 글자 그대로 비교하면 통과해 버린다');

add('ⓓ3', '🔴 A11-3: 검수 **계보 전원**과 대조한다 — `V6 → P2` 안에 제작자 `P2` 가 섞이면 잡는다', 1,
  () => onFx('same-person'),
  (o) => hitsOf(o, 'A11-3').some((h) => /제작자와 검수자가 같다: p2 .*검수자 「V6 → P2」/.test(h))
    ? null : '계보 중간의 제작자 혼입을 놓쳤다 — 「최종 검수자만 다르면 된다」로 빠져나간다');

/* ── ⓔ A11-4 판정 상태 — 🔴 부분문자열 함정 (§7-3 사례 4번과 같은 뿌리) ─────── */
add('ⓔ', '🔴 A11-4: 「조건부 합격」·「반려」는 잡고 「합격」은 통과시킨다 — 정확히 2건', 1,
  () => onFx('rejected'),
  (o) => {
    const c = expectCounts(o, { 'A11-4': 2 });
    if (c) return `${c} (3건이면 합격 행까지 잡은 것 · 1건이면 「조건부 합격」이 새어 나간 것)`;
    const h = hitsOf(o, 'A11-4').join('\n');
    if (!/판정 「조건부」/.test(h)) return '「조건부 합격」을 합격으로 통과시켰다 — includes(\'합격\') 함정에 걸렸다';
    if (!/판정 「반려」/.test(h)) return '「반려로 하향」을 잡지 못했다';
    if (/gamma/.test(h)) return '판정 「합격」인 행까지 잡았다(과탐)';
    return null;
  });

/* ── ⓕ A11-5 유령 등재 — 실트리 실측 0 건인 검사의 탐지 방향 증명 ──────────── */
add('ⓕ', 'A11-5: 원장에 있는데 파일이 없으면 잡는다 (파일 경로형·processId형 양쪽)', 1,
  () => onFx('ghost'),
  (o) => {
    const c = expectCounts(o, { 'A11-5': 2 });
    if (c) return `${c} — 🔴 없는 파일을 A11-4 로도 세면 이중계상이다`;
    const h = hitsOf(o, 'A11-5').join('\n');
    return /equipment\/epsilon\/cross-section\.webp/.test(h) && /tex\/delta\.webp/.test(h)
      ? null : 'processId형·파일형 유령 중 한쪽을 놓쳤다';
  });

/* ── ⓖ A11-6 해석 불가 행 — 「모른다」를 「맞다」로 세지 않는다 ─────────────── */
add('ⓖ', 'A11-6: 첫 칸이 파일명도 processId 도 아닌 행(「나머지 7종」)과 셀 수가 깨진 행을 잡는다', 1,
  () => onFx('unreadable'),
  (o) => {
    const c = expectCounts(o, { 'A11-6': 2 });
    if (c) return c;
    const h = hitsOf(o, 'A11-6').join('\n');
    return /첫 칸에서 파일명·processId 를 읽지 못했다: 「나머지 7종」/.test(h) && /셀 수\(9\)가 헤더\(11\)와 다르다/.test(h)
      ? null : '두 형태 중 한쪽을 놓쳤다';
  });

/* ── ⓗ~ⓙ 래칫 · 승격일 — 🔴 날짜를 주입해서 시험한다(실날짜에 의존하지 않는다) ── */
add('ⓗ', '래칫: 실측이 기준선과 같으면 WARN 이고 **통과**한다 (도입기 — 악화만 막는다)', 0,
  () => onFx('unregistered', { baseline: '{"A11-1":7}' }),
  (o) => {
    const { j } = counts(o);
    const c = j.checks.find((x) => x.id === 'A11-1');
    return c.verdict === 'WARN' ? null : `기준선 이내인데 판정이 ${c.verdict} 다`;
  });

add('ⓗ2', '🔴 도입기 통과는 「A11 충족」이 아니다 — 사람이 읽는 출력이 그렇게 말해야 한다', 0,
  () => onFx('unregistered', { baseline: '{"A11-1":7}', json: false }),
  (o) => /통과 — 악화 0건/.test(o) && /그러나 \*\*A11 충족이 아니다\*\*/.test(o)
    ? null : '「통과」가 「A11 충족」으로 읽히는 출력이다');

add('ⓘ', '🔴 래칫: 실측이 기준선을 1건이라도 넘으면 FAIL (악화 금지)', 1,
  () => onFx('unregistered', { baseline: '{"A11-1":6}' }),
  (o) => {
    const c = JSON.parse(o).checks.find((x) => x.id === 'A11-1');
    return c.verdict === 'FAIL' && /악화 금지 래칫/.test(c.why) ? null : `악화가 FAIL 로 안 잡혔다 — ${c.verdict}`;
  });

add('ⓘ2', '🔴 래칫: 기준선 0 이 된 검사는 1건만 생겨도 FAIL (되돌아갈 수 없다)', 1,
  () => onFx('unregistered', { baseline: ZERO }),
  (o) => {
    const c = JSON.parse(o).checks.find((x) => x.id === 'A11-1');
    return c.verdict === 'FAIL' ? null : '기준선 0 에서 7건이 났는데 FAIL 이 아니다';
  });

add('ⓙ', '🔴 승격일: 날짜가 지나면 기준선 이내여도 FAIL — **날짜를 주입해서** 시험한다', 1,
  () => onFx('unregistered', { baseline: '{"A11-1":7}', today: '2099-01-02', promoteOn: '2099-01-01' }),
  (o) => {
    const c = JSON.parse(o).checks.find((x) => x.id === 'A11-1');
    return c.verdict === 'FAIL' && /승격일 2099-01-01 이 지났다/.test(c.why) ? null : `승격 경로가 안 탔다 — ${c.verdict}`;
  });

add('ⓙ2', '🔴 승격일 직전은 아직 WARN — 승격 판정이 「>=」 경계에서 정확한가', 0,
  () => onFx('unregistered', { baseline: '{"A11-1":7}', today: '2098-12-31', promoteOn: '2099-01-01' }),
  (o) => JSON.parse(o).checks.find((x) => x.id === 'A11-1').verdict === 'WARN'
    ? null : '승격일 하루 전인데 벌써 FAIL 이다');

/* ── ⓚ~ⓠ 🔴 계측기 오류(2)를 판정 실패(1)로 위장하지 않는다 ─────────────────── */
const bad = (args) => run(args);

add('ⓚ', '원장 파일이 없으면 종료코드 2 (판정 실패 1 로 위장하지 않는다)', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', '/nonexistent/__no_ledger__.md', '--a11-baseline', ZERO]),
  (o) => /계측기 오류: 정합성 원장을 찾을 수 없다/.test(o) ? null : '계측기 오류 문구가 없다');

add('ⓛ', '출하 자산 디렉터리가 없으면 종료코드 2 (「이미지 0건」으로 통과시키지 않는다)', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', path.join(FX, 'pass', 'ledger.md'),
    '--assets-dir', '/nonexistent/__no_assets__', '--a11-baseline', ZERO]),
  (o) => /계측기 오류: 출하 자산 디렉터리를 찾을 수 없다/.test(o) ? null : '계측기 오류 문구가 없다');

add('ⓜ', '🔴 원장 서식이 바뀌어 자산 표를 하나도 못 찾으면 종료코드 2 — 조용한 0건 통과 금지', 2,
  () => onFx('instrument-no-table'),
  (o) => /계측기 오류: 원장에서 자산 원장 표를 하나도 찾지 못했다/.test(o) ? null : '자산 표 0종 고지가 없다');

add('ⓝ', '--a11-baseline 이 JSON 이 아니면 종료코드 2', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', path.join(FX, 'pass', 'ledger.md'), '--a11-baseline', 'not-json']),
  (o) => /계측기 오류: --a11-baseline 을 JSON 으로 읽지 못했다/.test(o) ? null : 'JSON 파싱 오류 고지가 없다');

add('ⓞ', '🔴 --a11-baseline 에 모르는 검사 ID 가 있으면 종료코드 2 (오타가 조용히 기준선 0 이 되지 않게)', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', path.join(FX, 'pass', 'ledger.md'), '--a11-baseline', '{"A11-9":1}']),
  (o) => /계측기 오류: --a11-baseline 에 모르는 검사 ID 가 있다 — A11-9/.test(o) ? null : '모르는 ID 고지가 없다');

add('ⓟ', '--today 형식이 YYYY-MM-DD 가 아니면 종료코드 2', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', path.join(FX, 'pass', 'ledger.md'), '--a11-baseline', ZERO, '--today', '20260101']),
  (o) => /계측기 오류: --today 형식이/.test(o) ? null : '날짜 형식 고지가 없다');

add('ⓠ', '--promote-on 형식이 YYYY-MM-DD 가 아니면 종료코드 2', 2,
  () => bad(['--project-root', path.join(FX, 'pass'), '--ledger', path.join(FX, 'pass', 'ledger.md'), '--a11-baseline', ZERO, '--promote-on', '내일']),
  (o) => /계측기 오류: --promote-on 형식이/.test(o) ? null : '날짜 형식 고지가 없다');

/* ── ⓡ 🔴 실트리 무접촉 — 픽스처가 진짜 원장·진짜 자산을 건드리지 않았다 ───── */
add('ⓡ', '🔴 픽스처는 실트리를 건드리지 않는다 — 무인자 실행이 여전히 운영 기준선으로 통과한다', 0,
  () => run([]),
  (o) => /check-a11 통과/.test(o) ? null : '실트리 무인자 실행이 통과하지 않는다(픽스처가 실트리를 오염시켰거나 기준선이 어긋났다)');

let pass = 0;
console.log('check-a11 자체 검증 — 픽스처는 `scripts/fixtures/a11/**`(합성 원장 + 합성 자산 트리 · 실트리 무접촉)\n');
console.log('  ID   기대  실측  판정  설명');
for (const c of CASES) {
  const r = await c.fn();
  const why = r.code === c.expect ? (c.assert ? c.assert(r.out) : null) : `종료코드가 ${c.expect} 가 아니라 ${r.code}`;
  const ok = why === null;
  if (ok) pass++;
  console.log(`  ${c.id.padEnd(4)} ${String(c.expect).padEnd(4)}  ${String(r.code).padEnd(4)}  ${ok ? '✅' : '❌'}   ${c.desc}`);
  if (!ok) {
    console.log(`        └ ${why}`);
    console.log(`        └ 출력 발췌: ${r.out.split('\n').filter((l) => /❌|🟡|계측기 오류|✅|A11-/.test(l)).slice(0, 6).join(' | ').slice(0, 500)}`);
  }
}
console.log(`\n  ${pass}/${CASES.length} 통과`);
if (pass !== CASES.length) {
  console.log('\n❌ 픽스처 실패 — 게이트가 기대대로 동작하지 않습니다.');
  process.exitCode = 1;
} else {
  console.log('\n✅ 픽스처 전건 통과 — 통과 방향(ⓐ·ⓐ2)·A11-1~A11-6 전건 탐지(ⓑ~ⓖ)·');
  console.log('   래칫/승격 경계(ⓗ~ⓙ2 · 🔴 날짜 주입)·계측기 오류 7종 분리(ⓚ~ⓠ)·실트리 무접촉(ⓡ)이 모두 증명됐습니다.');
}
