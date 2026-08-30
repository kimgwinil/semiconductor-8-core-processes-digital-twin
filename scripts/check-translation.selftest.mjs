#!/usr/bin/env node
/**
 * check-translation 자체 검증 픽스처.
 *
 * 🔴 **왜 필요한가.** 게이트가 「통과」했을 때 그것이 *위반이 없어서*인지 *못 봐서*인지는
 *    픽스처 없이는 증명되지 않는다. **합격만 나오는 게이트도 위반이고 불합격만 나오는 게이트도 위반**이다(R-7c).
 *    그래서 아래는 **통과해야 하는 픽스처와 실패해야 하는 픽스처를 둘 다** 갖는다.
 *
 * 🔴 **가장 중요한 픽스처는 ⓖ 다.** 이 게이트의 판정 기준은 「좋은 표기」가 아니라
 *    **「한국어 정본이 그 자리에서 무엇을 썼는가」**다. ko 자신이 `x^2 ~= B(t+tau)` 처럼
 *    ASCII 를 쓴 자리(실제로 `ko/questions/oxidation.json` q02 해설이 그렇다)에서 번역본이
 *    ASCII 를 쓰는 것은 **옳다.** ⓖ 가 빨개지면 게이트가 정본을 무시하고 자기 취향을
 *    강요하기 시작했다는 뜻이다.
 *
 * 🔴 **주입은 `src/` 밖에서 한다.** `--content` 로 `scripts/fixtures/translation/**` 를 가리키므로
 *    실트리를 읽지도 건드리지도 않는다(다른 담당의 게이트 측정을 오염시키지 않는다).
 *
 * 사용: node scripts/check-translation.selftest.mjs
 * 종료코드: 0 전건 통과 · 1 픽스처 실패
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-translation.mjs');
const FX = path.join(HERE, 'fixtures', 'translation');

function run(dir) {
  const args = [GATE, '--json', '--content', path.join(FX, dir)];
  try {
    const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

/** expect: 기대 종료코드(0 통과 · 1 판정 실패 · 2 계측기 고장) · rules: 그 실행이 짚어야 하는 규칙들 */
const CASES = [
  ['ⓐ', 'pass', '정상 번역본 — 위반이 없어야 한다', 0, []],
  ['ⓑ', 't1-shape', '번역본에서 블록 하나가 빠졌다', 1, ['T1']],
  ['ⓒ', 't2-identity', '번역 대상이 아닌 sourceId 가 갈라졌다', 1, ['T2']],
  ['ⓓ', 't3-empty', '번역본 값이 빈 문자열이다', 1, ['T3']],
  ['ⓔ', 't4-hangul', '번역본에 한글이 남았다', 1, ['T4']],
  ['ⓕ', 't5-surrogate', 'ko 의 °C·µΩ·cm·≤ 를 ASCII 로 눌러 담았다', 1, ['T5']],
  ['ⓖ', 't5-ko-ascii-ok', '🔴 ko 자신이 ASCII 를 쓴 자리 — 번역본도 ASCII 가 옳다', 0, []],
  ['ⓗ', 't6-symbol', 'ko 의 ± 가 번역본에서 통째로 사라졌다', 1, ['T6']],
  ['ⓘ', 't1-missing-file', '번역본 파일 자체가 없다', 1, ['T1']],
];

let failed = 0;
for (const [mark, dir, desc, expect, rules] of CASES) {
  const r = run(dir);
  const problems = [];
  if (r.code !== expect) problems.push(`종료코드 ${r.code}(기대 ${expect})`);
  let parsed = null;
  try { parsed = JSON.parse(r.out); } catch { problems.push('JSON 출력을 파싱하지 못했다'); }
  if (parsed) {
    const seen = new Set(parsed.failures.map((f) => f.rule));
    for (const rule of rules) if (!seen.has(rule)) problems.push(`${rule} 위반을 짚지 못했다(짚은 것: ${[...seen].join(',') || '없음'})`);
    if (expect === 0 && parsed.failures.length > 0) {
      problems.push(`위반이 없어야 하는데 ${parsed.failures.length}건을 냈다 — ${parsed.failures[0].msg}`);
    }
  }
  if (problems.length === 0) {
    console.log(`  ✅ ${mark} ${dir} — ${desc}`);
  } else {
    failed++;
    console.error(`  ❌ ${mark} ${dir} — ${desc}`);
    for (const p of problems) console.error(`       ${p}`);
  }
}

if (failed > 0) {
  console.error(`\n❌ check-translation.selftest 실패 — ${failed}/${CASES.length} 건`);
  process.exit(1);
}
console.log(`\n✅ check-translation.selftest 통과 — ${CASES.length}건 전건`);
process.exit(0);
