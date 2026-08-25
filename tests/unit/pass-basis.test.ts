import { describe, expect, it } from 'vitest';
import { registerAllLabs } from '@/models/labs';
import { labSpec, registeredLabKeys, type LabSpec } from '@/models/labs/spec';
import { PASS_BASIS_LEDGER, passBasisKey, passBasisOf } from '@/models/passBasis';
import { SOURCE_IDS } from '@/models/sources.generated';

/**
 * 🔴 **합격창 근거 원장이 랩과 어긋나지 않는지 전수 대조한다.**
 *
 * 근거를 출력 선언부가 아니라 **별도 원장**에 둔 대가가 이것이다 — 키 오타나 출력 id 변경이
 * **조용한 누락**이 될 수 있다. 화면에는 「근거 미상」이 뜨는데 그것이 *사실*인지 *실수*인지
 * 구별되지 않는다. **그 구별을 여기서 만든다.** 실수는 테스트 실패로 나오고, 사실은 원장에
 * `unknown` 으로 **적혀 있다.**
 *
 * 🔴 이 테스트는 합격창 값을 검사하지 않는다(그것은 `check-passwindow` 소관). 검사하는 것은
 *    **「모든 합격창이 근거를 하나씩 가지고 있는가」**뿐이다.
 */

registerAllLabs();

/**
 * 표시 지점 세 곳의 **소스 원문**. 🔴 Vite 의 `?raw` 글롭으로 읽는다 —
 * 이 저장소에는 `@types/node` 가 없어 `node:fs` 를 쓸 수 없다
 * (`format-judged.test.ts` · `viz-fallback-parity.test.ts` 와 같은 관례).
 */
const SITE_SOURCES = import.meta.glob('/src/ui/sections/Lab{Runner,Gauges,Scope}.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** 판정 대상이면서 실제로 창이 있는 출력만 근거를 물을 대상이다. */
function judgedWindows(): Array<{ spec: LabSpec; outputId: string; key: string }> {
  const rows: Array<{ spec: LabSpec; outputId: string; key: string }> = [];
  for (const k of registeredLabKeys()) {
    const [processId, stage] = k.split('/');
    const spec = labSpec(processId as string, stage as never);
    if (!spec) continue;
    for (const o of spec.outputs) {
      if (o.role !== 'judge' || !o.pass) continue;
      if (o.pass.min === undefined && o.pass.max === undefined) continue;
      rows.push({ spec, outputId: o.id, key: passBasisKey(spec.processId, spec.stage, o.id) });
    }
  }
  return rows;
}

describe('합격창 근거 원장', () => {
  it('합격창을 가진 judge 출력이 하나도 빠짐없이 원장에 등재돼 있다', () => {
    const missing = judgedWindows().filter((r) => PASS_BASIS_LEDGER[r.key] === undefined);
    // 🔴 빠진 것이 있으면 **어느 것인지** 말한다. 「N건 누락」만 나오면 다음 사람이 다시 센다.
    expect(missing.map((m) => m.key)).toEqual([]);
  });

  it('원장에 랩에 없는 유령 항목이 없다 (출력 id 가 바뀌면 여기서 잡힌다)', () => {
    const live = new Set(judgedWindows().map((r) => r.key));
    const ghosts = Object.keys(PASS_BASIS_LEDGER).filter((k) => !live.has(k));
    expect(ghosts).toEqual([]);
  });

  it('literature 는 실재하는 S번호를 갖고, 나머지 둘은 S번호를 갖지 않는다', () => {
    const ids = new Set<string>(SOURCE_IDS);
    const bad: string[] = [];
    for (const [key, b] of Object.entries(PASS_BASIS_LEDGER)) {
      if (b.kind === 'literature') {
        // 🔴 문헌 갈래인데 번호가 없거나 원장에 없는 번호면 **배지가 거짓말을 한다.**
        if (b.sourceId === undefined || !ids.has(b.sourceId)) bad.push(`${key}: literature 인데 S번호 ${b.sourceId ?? '없음'}`);
      } else if (b.sourceId !== undefined) {
        // 🔴 합성·미상에 S번호를 빌려 달면 「S번호가 있다 = 문헌에 있다」가 무너진다(contract.ts 와 같은 규율).
        bad.push(`${key}: ${b.kind} 인데 S번호 ${b.sourceId} 를 달고 있다`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('educational · unknown 은 근거 서술(ko·en)이 비어 있지 않다', () => {
    // 🔴 문헌 갈래는 S번호가 그 자체로 근거지만, 나머지 둘은 **문장이 없으면 화면이 아무 말도 못 한다.**
    const bad = Object.entries(PASS_BASIS_LEDGER)
      .filter(([, b]) => b.kind !== 'literature')
      .filter(([, b]) => !b.ko?.trim() || !b.en?.trim())
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('판정하지 않는 출력에는 근거를 붙이지 않는다 (없는 기준선을 있는 것처럼 보이지 않게)', () => {
    for (const k of registeredLabKeys()) {
      const [processId, stage] = k.split('/');
      const spec = labSpec(processId as string, stage as never);
      if (!spec) continue;
      for (const o of spec.outputs) {
        const hasWindow = Boolean(o.pass) && (o.pass?.min !== undefined || o.pass?.max !== undefined);
        if (o.role === 'display' || !hasWindow) {
          expect(passBasisOf(spec, o), `${k}#${o.id}`).toBeNull();
        }
      }
    }
  });

  it('원장에 없는 창은 빈칸이 아니라 「근거 미상」으로 떨어진다', () => {
    // 🔴 기본값이 `null`/`undefined` 면 화면은 종전과 똑같이 **출처 없는 숫자**를 보인다.
    //    그것이 CEO 가 지적한 상태다. 기본값은 반드시 「모른다」여야 한다(D-050 K-6).
    const fake = {
      processId: '__nonexistent__', stage: 'lab-basic',
      outputs: [], compute: () => ({}),
    } as unknown as LabSpec;
    const out = { id: 'x', ko: 'x', en: 'x', role: 'judge' as const, pass: { max: 1 } };
    expect(passBasisOf(fake, out)).toEqual({ kind: 'unknown' });
  });
});

describe('세 표시 지점이 같은 근거를 말한다', () => {
  /**
   * 🔴 CEO 지시가 못박은 조건이다 — 「세 곳이 같은 근거를 말해야 한다. 한 곳만 붙이면 다른 곳에서
   *    여전히 출처 없는 숫자가 보인다.」 문구를 비교하는 대신 **셋이 같은 입구를 부르는지**를 본다.
   *    문구 비교는 렌더 환경이 필요해 깨지기 쉽고, 「같은 함수를 부른다」가 더 강한 명제다 —
   *    갈라지려야 갈라질 수 없기 때문이다.
   */
  const SITES = [
    '/src/ui/sections/LabRunner.tsx', // 수치 출력의 규격 라벨
    '/src/ui/sections/LabGauges.tsx', // 계측기 눈금
    '/src/ui/sections/LabScope.tsx',  // 스코프 합격 띠 범례
  ];

  it('세 파일을 실제로 읽었다 (글롭이 조용히 0개를 잡으면 아래 검사가 전부 무의미해진다)', () => {
    expect(Object.keys(SITE_SOURCES).sort()).toEqual([...SITES].sort());
  });

  it.each(SITES)('%s 가 passBasisNode 를 부른다', (rel) => {
    const src = SITE_SOURCES[rel] ?? '';
    expect(src).toContain("from '@/ui/widgets/PassBasisBadge'");
    expect(src).toContain('passBasisNode(');
  });

  it('세 곳 말고 다른 곳에서 원장을 직접 뒤지지 않는다', () => {
    // 원장을 각자 읽기 시작하면 배지가 자리마다 달라진다. 입구는 `passBasisNode` 하나다.
    for (const rel of SITES) expect(SITE_SOURCES[rel] ?? '').not.toContain('PASS_BASIS_LEDGER');
  });
});
