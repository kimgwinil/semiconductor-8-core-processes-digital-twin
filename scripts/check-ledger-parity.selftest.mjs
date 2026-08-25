#!/usr/bin/env node
/**
 * check-ledger-parity 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *원장과 앱이 실제로 일치해서*인지
 *    *어긋난 것을 못 봐서*인지는 픽스처 없이는 증명되지 않는다(R-7c — 합격만 나오는 게이트도
 *    불합격만 나오는 게이트도 위반이다). 그래서 아래는 **통과 픽스처·불일치 픽스처·판정불가
 *    픽스처·계측기 오류 픽스처를 전부** 갖는다.
 *
 * 🔴 **주입은 `04_문항원장.md`/`src/content/ko/questions` 밖에서 한다.** 진짜 원장·문항을
 *    건드리면 동시에 그 트리를 쓰는 다른 게이트(check-questions 등)와 다른 담당의 측정을
 *    오염시킨다(check-citations.selftest.mjs 머리주석과 같은 이유). 그래서 게이트 쪽에
 *    `--ledger`/`--questions-dir` 주입구를 새로 냈다(기본값은 종전과 같은 진짜 경로이므로
 *    이 두 플래그를 안 쓰는 호출부(verify.mjs)는 동작이 바뀌지 않는다) — 픽스처는
 *    `scripts/fixtures/ledger-parity/**`.
 *
 * 사용: node scripts/check-ledger-parity.selftest.mjs
 * 종료코드: 0 전건 통과 · 1 픽스처 실패
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-ledger-parity.mjs');
const FX = path.join(HERE, 'fixtures', 'ledger-parity');

function run(ledger, questionsDir) {
  const args = [];
  if (ledger) args.push('--ledger', ledger);
  if (questionsDir) args.push('--questions-dir', questionsDir);
  try {
    const out = execFileSync('node', [GATE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
}
const fx = (...p) => path.join(FX, ...p);
const onPair = (dir) => run(fx(dir, 'ledger.md'), fx(dir, 'questions'));

const CASES = [];
/** expect: 기대 종료코드(0 통과 · 1 판정 실패 · 2 계측기 고장) · assert: 출력이 무엇을 말해야 하는가 */
const add = (id, desc, expect, fn, assert) => CASES.push({ id, desc, expect, fn, assert });

/* ══════════════════════════════════════════════════════════════════════════════
 * ⓐ 🔴 R-7c — 「합격만 나오는 게이트도 위반이다」. 전건 일치하는 원장·앱 쌍이 실제로
 *    PASS 로 나오는지부터 증명한다. 이게 없으면 아래 실패 픽스처들이 「원래 항상 실패하는
 *    게이트」를 잡아낸 것인지 구분할 수 없다.
 * ══════════════════════════════════════════════════════════════════════════════ */
add('ⓐ', '유형·난이도·LO·정답(단항+다항)이 전부 일치 → 통과', 0,
  () => onPair('pass'),
  (o) => /통과 — 원장과 앱의 유형·난이도·LO·정답이 전건 일치한다/.test(o) ? null : '전건 일치 픽스처가 통과하지 않았다');

/* ⓑ R1 — 양방향. 원장에만 있는 문항 · 앱에만 있는 문항을 한 쌍의 픽스처에서 동시에 잡는다. */
add('ⓑ', 'R1: 원장에만 있는 문항과 앱에만 있는 문항을 양방향으로 잡는다', 1,
  () => onPair('fail'),
  (o) => /R1 wafer-q05 \(원장 Q-P1-05\): 원장에 있는 문항이 앱에 없다/.test(o)
      && /R1 wafer-q03: 앱에 있는 문항이 원장에 없다/.test(o)
    ? null : 'R1 양방향 불일치가 둘 다 나오지 않았다');

/* ⓒ R2 — 유형 불일치. */
add('ⓒ', 'R2: 「유형」이 원장·앱에서 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R2 wafer-q07 \(원장 Q-P1-07\): 유형 — 원장 single ↔ 앱 numeric/.test(o)
    ? null : 'R2 유형 불일치가 나오지 않았다');

/* ⓓ R3 — 난이도 불일치. */
add('ⓓ', 'R3: 「난이도」가 원장·앱에서 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R3 wafer-q01 \(원장 Q-P1-01\): 난이도 — 원장 low ↔ 앱 mid/.test(o)
    ? null : 'R3 난이도 불일치가 나오지 않았다');

/* ⓔ R4 — 대응 LO 불일치. */
add('ⓔ', 'R4: 「대응 LO」가 원장·앱에서 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R4 wafer-q07 \(원장 Q-P1-07\): 대응 LO — 원장 LO-P1-07 ↔ 앱 LO-P1-99/.test(o)
    ? null : 'R4 LO 불일치가 나오지 않았다');

/* ⓕ R5 선택형 — 원장 ①②③④ ↔ 앱 인덱스. */
add('ⓕ', 'R5(선택형): 원장 ②(=1)와 앱 인덱스 2가 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R5 wafer-q01 \(원장 Q-P1-01\): 정답 — 원장 ②\(=1\) ↔ 앱 2/.test(o)
    ? null : 'R5 선택형 정답 불일치가 나오지 않았다');

/* ⓖ R5 계산형 — 값이 허용오차 밖으로 다르면 잡는다. */
add('ⓖ', 'R5(계산형): 정답값이 허용오차를 넘게 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R5 wafer-q02 \(원장 Q-P1-02\): 정답값 — 원장 78\.9 ↔ 앱 90/.test(o)
    ? null : 'R5 계산형 정답값 불일치가 나오지 않았다');

/* ⓗ R5 계산형 — 단위가 다르면(값은 같아도) 잡는다. */
add('ⓗ', 'R5(계산형): 값이 같아도 단위가 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R5 wafer-q09 \(원장 Q-P1-09\): 단위 — 원장 h ↔ 앱 min/.test(o)
    ? null : 'R5 계산형 단위 불일치가 나오지 않았다');

/* ⓘ R5 단답형 — 허용 정답 집합이 다르면 잡는다. */
add('ⓘ', 'R5(단답형): 「허용 정답」 집합이 원장·앱에서 다르면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R5 wafer-q08 \(원장 Q-P1-08\): 허용 정답 집합이 다르다 — 원장에만 \[alpha, beta\] · 앱에만 \[gamma\]/.test(o)
    ? null : 'R5 단답형 허용 정답 불일치가 나오지 않았다');

/* ⓙ 🔴🔴 R6 — 원장이 다항(a·b·c…)인데 앱이 단항으로만 채점하면 잡는다.
 *    CEO 지시(「채점은 문제 문항수에 따라 다 하는 것이 기준」)의 핵심 수용기준이다.
 *    이 픽스처가 통과로 뒤집히면 게이트가 그 지시를 다시 잃은 것이다. */
add('ⓙ', '🔴🔴 R6: 원장이 다항 정답을 요구하는데 앱이 1개만 채점하면 잡는다', 1,
  () => onPair('fail'),
  (o) => /R6 wafer-q06 \(원장 Q-P1-06\): 원장은 답 2개\(a·b\)를 요구하는데 앱은 1개만 채점한다/.test(o)
    ? null : 'R6 다항 미채점이 나오지 않았다');

/* ⓚ 판정 불가 — 원장 서식을 못 읽는 자리는 「통과」가 아니라 「모른다」다. 조용히 넘기지 않는다. */
add('ⓚ', '판정 불가: 「유형」줄이 없으면 통과가 아니라 판정 불가로 세고 실패시킨다', 1,
  () => onPair('undetermined'),
  (o) => /판정 불가 1건/.test(o) && /「유형」을 읽지 못했다/.test(o)
      && /「통과」가 아니라 「모른다」다/.test(o)
    ? null : '판정 불가가 세어지지 않았거나 「모른다」 고지가 빠졌다');

/* ⓛ~ⓠ 🔴 계측기 오류(2)를 판정 실패(1)로 위장하지 않는다 — check-citations R-7d 와 같은 규율. */
add('ⓛ', '원장 파일이 없으면 종료코드 2(계측기 오류)', 2,
  () => run('/nonexistent/__no_ledger__.md', fx('pass', 'questions')),
  (o) => /계측기 오류: 원장을 찾을 수 없다/.test(o) ? null : '계측기 오류 문구가 없다');

add('ⓜ', '앱 문항 디렉터리가 없으면 종료코드 2', 2,
  () => run(fx('pass', 'ledger.md'), '/nonexistent/__no_dir__'),
  (o) => /계측기 오류: 앱 문항 디렉터리를 찾을 수 없다/.test(o) ? null : '계측기 오류 문구가 없다');

add('ⓝ', '앱 문항 JSON 이 파싱되지 않으면 종료코드 2', 2,
  () => run(fx('pass', 'ledger.md'), fx('instrument-bad-json', 'questions')),
  (o) => /계측기 오류: wafer\.json JSON 파싱 실패/.test(o) ? null : 'JSON 파싱 실패 문구가 없다');

add('ⓞ', '앱 문항 파일에 items 가 비어 있으면 종료코드 2', 2,
  () => run(fx('pass', 'ledger.md'), fx('instrument-empty-items', 'questions')),
  (o) => /계측기 오류: wafer\.json 에 문항이 없다/.test(o) ? null : '빈 items 고지가 없다');

add('ⓟ', 'objectiveId 에서 공정 번호를 못 읽으면 종료코드 2', 2,
  () => run(fx('pass', 'ledger.md'), fx('instrument-bad-objective', 'questions')),
  (o) => /계측기 오류: wafer\.json 첫 문항의 objectiveId 에서 공정 번호를 읽을 수 없다/.test(o) ? null : '공정 번호 오류 고지가 없다');

add('ⓠ', 'id 에서 일련번호를 못 읽으면 종료코드 2', 2,
  () => run(fx('pass', 'ledger.md'), fx('instrument-bad-id', 'questions')),
  (o) => /계측기 오류: wafer\.json: id 'wafer-not-numbered' 에서 일련번호를 읽을 수 없다/.test(o) ? null : '일련번호 오류 고지가 없다');

add('ⓡ', '원장에서 `#### Q-P#-##` 블록을 하나도 못 찾으면 종료코드 2', 2,
  () => run(fx('instrument-no-blocks', 'ledger.md'), fx('pass', 'questions')),
  (o) => /계측기 오류: 원장에서 `#### Q-P#-##` 문항 블록을 하나도 찾지 못했다/.test(o) ? null : '블록 0건 고지가 없다');

let pass = 0;
console.log('check-ledger-parity 자체 검증 — 픽스처는 `scripts/fixtures/ledger-parity/**`(진짜 원장·문항 무접촉)\n');
console.log('  ID  기대  실측  판정  설명');
for (const c of CASES) {
  const r = await c.fn();
  const why = r.code === c.expect ? (c.assert ? c.assert(r.out) : null) : `종료코드가 ${c.expect} 가 아니라 ${r.code}`;
  const ok = why === null;
  if (ok) pass++;
  console.log(`  ${c.id}  ${String(c.expect).padEnd(4)}  ${String(r.code).padEnd(4)}  ${ok ? '✅' : '❌'}   ${c.desc}`);
  if (!ok) {
    console.log(`        └ ${why}`);
    console.log(`        └ 출력 발췌: ${r.out.split('\n').filter((l) => /❌|🟡|계측기 오류|✅|·/.test(l)).slice(0, 5).join(' | ').slice(0, 400)}`);
  }
}
console.log(`\n  ${pass}/${CASES.length} 통과`);
if (pass !== CASES.length) {
  console.log('\n❌ 픽스처 실패 — 게이트가 기대대로 동작하지 않습니다.');
  process.exitCode = 1;
} else {
  console.log('\n✅ 픽스처 전건 통과 — 통과 경로(ⓐ)·R1~R6 전건 탐지(ⓑ~ⓙ)·판정불가 분리(ⓚ)·');
  console.log('   계측기 오류 7종 분리(ⓛ~ⓡ)가 모두 증명됐습니다.');
}
