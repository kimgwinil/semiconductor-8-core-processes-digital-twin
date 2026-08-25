/**
 * 🔴 **`selftest-gates.mjs` 의 커버리지 계산 — 순수 함수로 뺐다(2026-08-25).**
 *
 * 왜 뺐는가: `selftest-gates.mjs` 본체는 배타 락·실제 파일 스냅샷 주입/복구·명령 실행을
 * 낀 상태 기계라서, 그 안에 갇힌 순수 계산(어떤 파일이 게이트인가·픽스처가 덮는가·미검증인가)을
 * 실제 파일시스템·락 없이 시험할 수가 없었다 — `selftest-gates.selftest.mjs`(이 파일들의
 * 형제 픽스처)가 합성 파일명 목록만으로 돌 수 있어야 진짜 단위시험이 된다.
 *
 * 🔴 **이 파일은 계산만 한다.** `readdirSync`·`execFileSync`·락 파일을 이 안에 들이지 마라 —
 *    들이는 순간 다시 「실제 트리 없이는 시험 못 하는」 원래 문제로 돌아간다.
 *
 * `selftest-gates.mjs` 는 이 함수를 실제 `readdirSync(scripts/)` 결과로 호출해 쓴다 —
 * 동작은 이 파일을 빼내기 전과 완전히 같다(순수 리팩터, 판정 변경 아님).
 */
import { classifyScript, fixtureTargetGate } from './gate-classify.mjs';

/**
 * @param {object} args
 * @param {string[]} args.scriptFiles - `scripts/` 디렉터리의 파일명 전체(경로 아님, 그냥 이름).
 * @param {string[]} args.inlineFixtureGates - `cases[]`(인라인 픽스처)가 실제로 돌리는 게이트
 *   이름 목록(필터 여부와 무관하게 **전체** — `selftest-gates.mjs` 의 `allCases`, `activeCases` 아님).
 * @param {string} args.unitGate - 파일명 스캔에 안 잡히는 단위 게이트(`qa-sweep-frame`).
 * @param {string[]} args.subGates - 파일명 스캔에 안 잡히는 하위 판정군(`check-wiring-W6`).
 * @returns {{
 *   allGates: string[],
 *   externalFixtures: {file: string, gate: string}[],
 *   allFixtureGates: string[],
 *   uncovered: string[],
 *   orphanFixtureFiles: {file: string, gate: string}[],
 * }}
 */
export function computeGateCoverage({ scriptFiles, inlineFixtureGates, unitGate, subGates }) {
  const allGates = [
    ...scriptFiles.map((f) => classifyScript(f)).filter((c) => c.gate).map((c) => c.base),
    unitGate,
    ...subGates,
  ].sort();

  /* 형제 픽스처 파일 → 그 게이트. 대응 게이트 파일이 실재할 때만 인정한다
   * (고아 픽스처를 커버리지로 세지 않는다). */
  const externalFixtures = scriptFiles
    .map((f) => ({ file: f, gate: fixtureTargetGate(f) }))
    .filter((x) => x.gate !== null)
    .filter((x) => scriptFiles.includes(`${x.gate}.mjs`))
    .sort((a, b) => a.gate.localeCompare(b.gate));

  const allFixtureGates = [...new Set([
    ...inlineFixtureGates,
    ...externalFixtures.map((x) => x.gate),
  ])];
  const uncovered = allGates.filter((g) => !allFixtureGates.includes(g));

  /* 픽스처 파일은 실재하는데(이름으로는 짝 게이트 파일도 있는데) classifyScript() 가 그 파일을
   * 게이트로 안 봤다 — 「픽스처 없음」과 다른, 이 스크립트 자신의 분류 결함이다. */
  const orphanFixtureFiles = externalFixtures.filter((x) => !allGates.includes(x.gate));

  return { allGates, externalFixtures, allFixtureGates, uncovered, orphanFixtureFiles };
}
