#!/usr/bin/env node
/**
 * selftest-gates 자체 검증 픽스처 — **자기 사각지대를 메운다.**
 *
 * 🔴 왜 지금까지 없었는가. `selftest-gates.mjs` 본체는 배타 락 · 실제 `src/`·`scripts/` 스냅샷
 *    주입/복구 · 자식 프로세스 실행을 낀 상태 기계라, 그 안에서 픽스처를 돌리면 실제 트리를
 *    건드리게 되고 동시 편집·배타 락과 충돌한다(머리주석 §W). 그래서 스크립트 자신은
 *    「자기 사각지대」로 남겨져 있었다 — **2026-08-22 실제로 그 사각지대에서 분모 오염 결함이
 *    나왔고, 사람이 신고할 때까지 스스로 못 봤다**(`selftest-gates.mjs` L1513~L1547 참조).
 *
 * 🔴 이 픽스처가 여는 길: 커버리지 **계산**(어떤 파일이 게이트인가 · 픽스처가 덮는가 ·
 *    미검증인가)을 `lib/selftest-coverage.mjs` 의 순수 함수로 뺐다. 그 함수는 **합성
 *    파일명 배열만 받으므로**, 실제 파일시스템·락·자식 프로세스 없이 시험할 수 있다 —
 *    아래는 전부 인메모리 호출이고 `src/`·`scripts/` 무접촉이다.
 *
 * 🔴 **AC-1 (분모 오염 회귀 · 2026-08-22 사고의 재발 방지).**
 *    그날의 결함은 `/^check-.+\.mjs$/` 가 `check-citations.selftest.mjs` 를 게이트로도 세어
 *    분모(allGates)와 분자(uncovered 판정)를 동시에 틀리게 만든 것이었다. 지금은 `classifyScript`
 *    정본을 쓰므로 재발하지 않아야 한다 — 그 사실을 이 픽스처가 고정한다(ⓐⓑ).
 *
 * 사용: node scripts/selftest-gates.selftest.mjs
 * 종료코드: 0 전건 통과 · 1 픽스처 실패
 */
import { computeGateCoverage } from './lib/selftest-coverage.mjs';

const CASES = [];
const add = (id, desc, fn) => CASES.push({ id, desc, fn });

/* ══════════════════════════════════════════════════════════════════════════════
 * ⓐ 🔴🔴 AC-1 핵심 — `.selftest.mjs` 파일이 **자기 자신을 게이트로 이중 계산**하지 않는다.
 *    2026-08-22 사고 그대로: `check-citations.mjs` + `check-citations.selftest.mjs` 가
 *    함께 있을 때 분모(allGates)에 `check-citations` **하나만** 들어가야 한다 —
 *    `check-citations.selftest` 라는 유령 게이트가 생기면 이 픽스처가 실패한다.
 * ══════════════════════════════════════════════════════════════════════════════ */
add('ⓐ', 'AC-1: check-X.mjs + check-X.selftest.mjs 동시 존재 → allGates 에는 check-X 하나만', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-citations.mjs', 'check-citations.selftest.mjs'],
    inlineFixtureGates: [],
    unitGate: '__unit__',
    subGates: [],
  });
  if (r.allGates.includes('check-citations.selftest')) return '유령 게이트 「check-citations.selftest」 가 분모에 들어갔다 — 2026-08-22 사고 재발';
  if (!r.allGates.includes('check-citations')) return 'check-citations 자체가 분모에서 빠졌다';
  if (r.allGates.length !== 2) return `allGates 길이가 2(check-citations + __unit__)가 아니라 ${r.allGates.length}`;
  return null;
});

/* ⓑ AC-1 의 다른 절반 — 그 `.selftest.mjs` 는 **형제 픽스처로 인정**되어 커버리지에 잡혀야 한다. */
add('ⓑ', 'AC-1: check-X.selftest.mjs 는 check-X 의 형제 픽스처로 인정된다(미검증 아님)', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-citations.mjs', 'check-citations.selftest.mjs'],
    inlineFixtureGates: [],
    unitGate: '__unit__',
    subGates: [],
  });
  if (r.uncovered.includes('check-citations')) return 'check-citations 이 미검증으로 잘못 찍혔다 — 형제 픽스처를 못 봤다';
  if (!r.externalFixtures.some((x) => x.file === 'check-citations.selftest.mjs' && x.gate === 'check-citations')) {
    return 'externalFixtures 에 그 짝이 실리지 않았다';
  }
  return null;
});

/* ⓒ 인라인 픽스처만 있고 형제 파일이 없는 게이트도 커버리지로 인정된다. */
add('ⓒ', '인라인 cases[] 만 있어도(형제 파일 없이) 미검증에서 빠진다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-a.mjs', 'check-b.mjs'],
    inlineFixtureGates: ['check-a'],
    unitGate: '__unit__',
    subGates: [],
  });
  if (r.uncovered.includes('check-a')) return 'check-a 가 인라인 픽스처를 갖고도 미검증으로 찍혔다';
  if (!r.uncovered.includes('check-b')) return 'check-b(픽스처 없음)가 미검증으로 안 찍혔다 — 반대쪽 오탐';
  return null;
});

/* ⓓ 🔴 픽스처가 정말 하나도 없으면(인라인도 형제도) 반드시 uncovered 에 뜬다 —
 *    「미검증 0」을 조용히 못 내게 하는 핵심 케이스. */
add('ⓓ', '인라인·형제 픽스처가 둘 다 없으면 반드시 uncovered 에 뜬다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-lonely.mjs'],
    inlineFixtureGates: [],
    unitGate: '__unit__',
    subGates: [],
  });
  if (!r.uncovered.includes('check-lonely')) return 'check-lonely 가 미검증으로 찍히지 않았다 — 「미검증 0」거짓 보고 위험';
  return null;
});

/* ⓔ `verify.mjs`(게이트 실행기)는 게이트로 세지 않는다 — classifyScript 정본을 그대로 통과시킨다. */
add('ⓔ', 'verify.mjs 는 게이트로 세지 않는다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-a.mjs', 'verify.mjs'],
    inlineFixtureGates: ['check-a'],
    unitGate: '__unit__',
    subGates: [],
  });
  if (r.allGates.includes('verify')) return 'verify.mjs 가 게이트로 세어졌다';
  return null;
});

/* ⓕ tmp-/gen-/qa- 접두 스크래치·생성기·수동 QA 도구는 게이트로 세지 않는다. */
add('ⓕ', 'tmp-/gen-/qa- 접두 파일은 게이트로 세지 않는다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-a.mjs', 'tmp-verify-w6.mjs', 'gen-sources.mjs', 'qa-sweep.mjs'],
    inlineFixtureGates: ['check-a'],
    unitGate: '__unit__',
    subGates: [],
  });
  for (const bad of ['tmp-verify-w6', 'gen-sources', 'qa-sweep']) {
    if (r.allGates.includes(bad)) return `${bad} 가 게이트로 세어졌다`;
  }
  return null;
});

/* ⓖ 짝 게이트 파일이 없는(고아) 형제 픽스처는 externalFixtures 에서 조용히 빠진다 —
 *    고아 픽스처를 커버리지로 세면 「검증됐다」는 거짓 보고가 된다. */
add('ⓖ', '고아 픽스처(check-X.mjs 없이 check-X.selftest.mjs 만 있음)는 커버리지로 안 세어진다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-orphan.selftest.mjs'],
    inlineFixtureGates: [],
    unitGate: '__unit__',
    subGates: [],
  });
  if (r.externalFixtures.length !== 0) return `고아 픽스처가 externalFixtures 에 실렸다: ${JSON.stringify(r.externalFixtures)}`;
  if (r.allFixtureGates.includes('check-orphan')) return 'check-orphan 이 존재하지 않는데 커버 게이트로 세어졌다';
  return null;
});

/* ⓗ unitGate·subGates — 파일명 스캔에 안 잡히는 논리적 게이트도 분모에 들어간다
 *    (`qa-sweep-frame`·`check-wiring-W6` 가 실제로 이런 경우다). */
add('ⓗ', 'unitGate·subGates 는 파일이 없어도 분모(allGates)에 들어간다', () => {
  const r = computeGateCoverage({
    scriptFiles: ['check-a.mjs'],
    inlineFixtureGates: ['check-a', 'qa-sweep-frame', 'check-wiring-W6'],
    unitGate: 'qa-sweep-frame',
    subGates: ['check-wiring-W6'],
  });
  if (!r.allGates.includes('qa-sweep-frame')) return 'unitGate 가 분모에 없다';
  if (!r.allGates.includes('check-wiring-W6')) return 'subGate 가 분모에 없다';
  if (r.uncovered.length !== 0) return `unitGate/subGate 모두 인라인 픽스처가 있는데도 uncovered 에 남았다: ${r.uncovered}`;
  return null;
});

let pass = 0;
console.log('selftest-gates 자체 검증 — `lib/selftest-coverage.mjs` 순수 함수를 합성 입력으로 단위시험(실제 트리 무접촉)\n');
console.log('  ID  판정  설명');
for (const c of CASES) {
  let why;
  try { why = c.fn(); } catch (e) { why = `예외: ${e.message}`; }
  const ok = why === null || why === undefined;
  if (ok) pass++;
  console.log(`  ${c.id}  ${ok ? '✅' : '❌'}   ${c.desc}`);
  if (!ok) console.log(`        └ ${why}`);
}
console.log(`\n  ${pass}/${CASES.length} 통과`);
if (pass !== CASES.length) {
  console.log('\n❌ 픽스처 실패 — 커버리지 계산이 기대대로 동작하지 않습니다.');
  process.exitCode = 1;
} else {
  console.log('\n✅ 픽스처 전건 통과 — 분모 오염 회귀(ⓐⓑ, 2026-08-22 사고급)·미검증 탐지(ⓒⓓ)·');
  console.log('   실행기/스크래치 제외(ⓔⓕ)·고아 픽스처 배제(ⓖ)·논리적 게이트(ⓗ)가 모두 증명됐습니다.');
}
