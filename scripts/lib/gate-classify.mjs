/**
 * 🔴 **「무엇이 게이트인가」의 정본.** 이 판단은 여기 한 곳에만 있다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 왜 공용 모듈로 뺐나 (2026-08-22)
 * ══════════════════════════════════════════════════════════════════════════════
 * 같은 판단을 **두 곳이 따로** 하고 있었고, 한쪽만 낡았다.
 *
 *   `check-gate-registration.mjs` — `classifyScript()` 로 **정확히** 걸러냈다.
 *   `selftest-gates.mjs`          — `/^check-.+\.mjs$/` 정규식으로 **틀리게** 걸렀다.
 *                                   `.+` 가 `citations.selftest` 를 먹어
 *                                   `check-citations.selftest.mjs` **까지 게이트로** 셌다.
 *
 * 결과(2026-08-22 실측): `selftest-gates` 의 분모가 27 → 30 으로 부풀고,
 * 그렇게 끼어든 픽스처 파일 3개는 당연히 자기 픽스처가 없으니 **「미검증」에도 찍혔다.**
 * 🔴 **하나의 정규식 오류가 분모와 분자를 동시에 틀리게 만들어 오보가 두 배로 부풀었다** —
 *    「미검증 7종」이라고 보고했지만 실제로는 1종이었다.
 * 🔴 그 방향이 특히 나빴다: **실제보다 나쁜 쪽 거짓말**이라
 *    ① 이미 있는 픽스처를 또 만들게 하고 ② 실제보다 나쁜 상태로 인계하게 한다.
 *
 * 「양쪽이 같은 규칙을 쓰도록 주의한다」로는 못 막는다 — 이미 그렇게 두었다가 갈라졌다.
 * **정본을 하나로 만들어 구조로 막는다.** 규칙을 바꾸려면 이 파일을 고쳐야 하고,
 * 그러면 양쪽이 자동으로 같이 바뀐다.
 *
 * ⚠️ 쓰는 쪽이 다르게 세야 하는 것이 있으면 **여기 규칙을 비틀지 말고** 자기 쪽에서 더하라
 *    (예: `selftest-gates` 의 `UNIT_GATE`·`SUB_GATES` 는 파일이 아니라 논리적 판정군이다).
 */

/** 이름은 `check-` 가 아니지만 성질이 게이트인 것. 여기 없으면 애초에 스캔 대상이 아니다. */
export const KNOWN_EXTRA_GATES = ['selftest-gates'];
/** 스크래치 · 생성기 · 수동 QA 도구. 판정하지 않는다. */
export const NON_GATE_PREFIX = ['tmp-', 'gen-', 'qa-'];

/**
 * 🔴 픽스처 파일인가. `check-citations.selftest.mjs` 는 **이름만 보면 게이트처럼 보인다** —
 *    그 착시가 정확히 위 사고의 원인이었다. 판정을 문자열 조작에 맡기지 말고 이 함수를 써라.
 */
export function isSelftestFixtureFile(fileName) {
  return fileName.endsWith('.selftest.mjs');
}

/**
 * 픽스처 파일이 시험하는 게이트 이름. 픽스처가 아니면 `null`.
 * `check-citations.selftest.mjs` → `'check-citations'`
 * 🔴 이름만으로 유추한 값이다. **대응 게이트 파일이 실재하는지는 부르는 쪽이 확인해야 한다**
 *    (고아 픽스처를 커버리지로 세면 「검증됐다」는 거짓 보고가 된다).
 */
export function fixtureTargetGate(fileName) {
  return isSelftestFixtureFile(fileName) ? fileName.slice(0, -'.selftest.mjs'.length) : null;
}

/**
 * 스크립트 파일 하나를 분류한다.
 * @returns {{gate: boolean, base?: string, why: string}}
 *   `gate: true` 면 `base` 가 게이트 이름(확장자 없음)이다. `why` 는 사람이 읽는 사유다.
 *
 * 제외 대상과 사유:
 *   `*.selftest.mjs` — 🔴 **게이트를 시험하는 픽스처**이지 제품을 재는 게이트가 아니다
 *   `verify.mjs`     — 게이트가 아니라 **게이트 실행기**
 *   `tmp-` `gen-` `qa-` — 스크래치 · 생성기 · 수동 QA 도구
 *   `lib/` `fixtures/`  — 하위 디렉터리는 직접 실행 대상이 아니므로 애초에 스캔하지 않는다
 *                          (디렉터리 순회는 부르는 쪽 책임이다)
 */
export function classifyScript(fileName) {
  if (!fileName.endsWith('.mjs')) return { gate: false, why: '.mjs 아님' };
  const base = fileName.slice(0, -'.mjs'.length);
  if (isSelftestFixtureFile(fileName)) return { gate: false, why: '게이트 자체 검증 픽스처' };
  if (base === 'verify') return { gate: false, why: '게이트 실행기' };
  if (NON_GATE_PREFIX.some((p) => base.startsWith(p))) return { gate: false, why: '스크래치·생성기·수동 QA' };
  if (KNOWN_EXTRA_GATES.includes(base)) return { gate: true, base, why: 'KNOWN_EXTRA_GATES' };
  if (base.startsWith('check-')) return { gate: true, base, why: 'check-* 명명 관례' };
  return { gate: false, why: '게이트 명명 아님' };
}
