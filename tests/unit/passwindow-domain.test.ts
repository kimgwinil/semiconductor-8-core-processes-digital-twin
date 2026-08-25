/**
 * 🔴 회귀 게이트 — **편측 합격창의 열린 쪽이 정의역으로 닫혀 있는가.**
 *
 * 사고 경위(2026-08-21). `wafer/lab-applied` 의 `diameterSigmaMm` 은 `role: 'judge'` 인데
 * 합격창이 `pass: { max: 1 }` **하나뿐**이었다. 편측 창은 반대쪽이 무한히 열려 있어서
 * 표준편차 **σ_D = −0.1 mm** 가 `−0.1 ≤ 1` 을 만족해 **합격**을 받고 「N개 중 M개 충족」에 계상됐다.
 * 음수 표준편차는 존재할 수 없다 — 표시 문제가 아니라 **판정 결함**이다.
 *
 * A14 는 이것을 못 잡는다. A14 가 보는 것은 「NaN·Infinity·발산 0건」이고 −0.1 은 **유한**하다.
 * 「유한하지만 물리적으로 불가능한 값」은 아무도 보지 않았다.
 *
 * 이 테스트가 고정하는 것:
 *  ① 편측 판정 창의 **열린 쪽**은 유한한 `validRange` 경계로 닫혀 있다
 *     (±Infinity·±Number.MAX_VALUE 는 「닫았다」가 아니라 「말하지 않았다」로 본다).
 *  ② 2026-08-21 에 닫은 3건이 **실제 도달 범위를 전부 품는다** — 정당한 값을 정의역 밖으로
 *     밀어내면 반대 방향의 거짓말이 된다.
 *  ③ 음수 σ 가 도달 가능한 동안에는 **반드시 `outOfRange` 로 표시된다**(조건부 불변식).
 *
 * 전수 스윕과 「불가능한 합격」 판정은 `scripts/check-passwindow.mjs` 가 맡는다. 여기는 단위 고정만 한다.
 *
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/models/registry';
import { registerAllLabs, labSpec, registeredLabKeys } from '../../src/models/labs';
import { evaluate } from '../../src/models/labs/spec';
import type { LabOutput, LabStage } from '../../src/models/labs/spec';
import type { Quantity } from '../../src/models/contract';

/** 「경계를 말하지 않았다」로 보는 값. `check-passwindow.mjs` 와 같은 정의를 쓴다. */
function isUndeclaredBound(b: number): boolean {
  return !Number.isFinite(b) || Math.abs(b) >= Number.MAX_VALUE;
}

type OpenSide = 'low' | 'high';

function openSideOf(o: LabOutput): OpenSide | null {
  if (o.role !== 'judge' || !o.pass) return null;
  const hasMin = o.pass.min !== undefined;
  const hasMax = o.pass.max !== undefined;
  if (hasMin === hasMax) return null;      // 양측이거나 창이 없음 — 이 테스트 대상이 아니다
  return hasMax ? 'low' : 'high';          // max 만 있으면 아래가, min 만 있으면 위가 열린다
}

beforeAll(() => {
  registerAllLabs();
});

describe('편측 합격창 — 열린 쪽 정의역 선언', () => {
  it('role=judge 인 편측 창은 전부 열린 쪽이 유한한 validRange 로 닫혀 있다', () => {
    const open: string[] = [];
    let oneSided = 0;

    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/') as [string, LabStage];
      const spec = labSpec(processId, stage);
      expect(spec, key).toBeDefined();
      if (!spec) continue;

      const values = spec.compute(
        Object.fromEntries(spec.params.map((p) => [p.id, p.initial])),
      );

      for (const o of spec.outputs) {
        const side = openSideOf(o);
        if (!side) continue;
        oneSided++;
        const q = values[o.id];
        expect(q, `${key} / ${o.id}: compute() 가 이 출력을 돌려주지 않는다`).toBeDefined();
        if (!q) continue;
        const bound = side === 'low' ? q.validRange[0] : q.validRange[1];
        if (isUndeclaredBound(bound)) {
          open.push(
            `${key} / ${o.id}: 합격창 ${JSON.stringify(o.pass)} 의 ${side === 'low' ? '아래' : '위'}쪽이 열려 있는데 `
            + `validRange = [${q.validRange[0]}, ${q.validRange[1]}] 도 열려 있다`,
          );
        }
      }
    }

    // 편측 창이 하나도 없으면 이 테스트가 조용히 빈 통과를 한다 — 분모를 고정한다.
    expect(oneSided).toBeGreaterThan(0);
    expect(open, `열린 쪽 정의역 미선언 ${open.length}건:\n  ${open.join('\n  ')}`).toEqual([]);
  });
});

describe('2026-08-21 에 닫은 정의역이 도달 범위를 품는가', () => {
  /** 슬라이더 격자를 결정론으로 훑어 해당 출력의 도달 [최소, 최대] 를 낸다. */
  function reach(processId: string, stage: LabStage, outputId: string, samples = 3000): [number, number] {
    const spec = labSpec(processId, stage);
    if (!spec) throw new Error(`실습 ${processId}/${stage} 가 없다`);
    let seed = 20260821;                       // 🔴 Math.random 금지(A14-1) — 고정 시드 LCG
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    const visit = (inputs: Record<string, number>): void => {
      let v: number;
      try { v = spec.compute(inputs)[outputId]?.value ?? Number.NaN; } catch { return; }
      if (!Number.isFinite(v)) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    };
    const ps = spec.params;
    for (let m = 0; m < (1 << ps.length); m++) {
      visit(Object.fromEntries(ps.map((p, i) => [p.id, ((m >> i) & 1) ? p.max : p.min])));
    }
    for (let n = 0; n < samples; n++) {
      visit(Object.fromEntries(ps.map((p) => {
        const steps = Math.max(1, Math.round((p.max - p.min) / p.step));
        return [p.id, p.min + Math.round(rnd() * steps) * p.step];
      })));
    }
    return [lo, hi];
  }

  function declared(processId: string, stage: LabStage, outputId: string): [number, number] {
    const spec = labSpec(processId, stage);
    if (!spec) throw new Error(`실습 ${processId}/${stage} 가 없다`);
    const q = spec.compute(Object.fromEntries(spec.params.map((p) => [p.id, p.initial])))[outputId];
    if (!q) throw new Error(`출력 ${outputId} 가 없다`);
    return q.validRange;
  }

  const cases: Array<[string, LabStage, string]> = [
    ['packaging', 'lab-applied', 'floorLifeMarginH'],
    ['packaging', 'lab-advanced', 'dieShearMarginKg'],
    ['eds', 'lab-advanced', 'throughputWph'],
  ];

  for (const [processId, stage, outputId] of cases) {
    it(`${processId}/${stage} / ${outputId} — 정의역이 유한하고 도달 범위를 품는다`, () => {
      const [lo, hi] = declared(processId, stage, outputId);
      expect(isUndeclaredBound(lo), `아래 경계가 미선언: ${lo}`).toBe(false);
      expect(isUndeclaredBound(hi), `위 경계가 미선언: ${hi}`).toBe(false);

      const [rlo, rhi] = reach(processId, stage, outputId);
      expect(rlo).toBeLessThanOrEqual(rhi);          // 도달값이 하나라도 있었다
      expect(rlo, `도달 최소 ${rlo} 가 정의역 하한 ${lo} 아래다`).toBeGreaterThanOrEqual(lo);
      expect(rhi, `도달 최대 ${rhi} 가 정의역 상한 ${hi} 위다`).toBeLessThanOrEqual(hi);
    });
  }
});

describe('음수 표준편차 — 도달 가능하면 반드시 outOfRange 다', () => {
  it('wafer/lab-applied 의 σ_D 가 음수로 나오면 outOfRange 가 참이다', () => {
    const spec = labSpec('wafer', 'lab-applied');
    expect(spec).toBeDefined();
    if (!spec) return;

    // 보고된 조합 그대로 — 회전수를 끝까지 올리고 인상속도를 끝까지 내린 자리.
    const q = spec.compute({
      pullRateMmPerMin: 0.5, gradientKPerCm: 15, crystalRpm: 30, crucibleRpm: 2,
    })['diameterSigmaMm'];
    expect(q).toBeDefined();
    if (!q) return;

    // 🔴 조건부 불변식 — 식이 고쳐져 음수가 사라지면 앞 조건이 거짓이 되어 자연히 통과한다.
    //    음수가 남아 있는 동안에는 **반드시 정의역 이탈로 표시돼야** 한다.
    if (q.value < 0) {
      expect(q.validRange[0], '표준편차의 정의역 하한은 0 이상이어야 한다').toBeGreaterThanOrEqual(0);
      expect(q.outOfRange, `σ_D = ${q.value} 인데 outOfRange 가 거짓이다`).toBe(true);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴 회귀 방지 — **정의역 밖의 값은 합격을 받을 수 없다** (2026-08-21 결함의 본체)
 *
 * 앞의 describe 들이 고정한 것은 「정의역이 선언돼 있는가」였다. 그것은 선언돼 있었다.
 * **판정(`evaluate()`)이 그 선언을 읽지 않은 것**이 결함이었다 — 물리층은 σ_D = −0.1 mm 를
 * 이미 `outOfRange` 로 표시하고 있었는데 판정은 실값 −0.1 만 보고 「−0.1 ≤ 1 이니 합격」을 줬다.
 *
 * 🔴 여기에 물리 수식을 복붙하지 않는다. 구현을 베낀 기대값은 구현이 틀려도 같이 틀린다.
 *    기대는 **성질**로만 적는다 — 「음수 σ 는 합격 불가」 · 「outOfRange 는 합격 불가」.
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 화면 하네스(`LabRunner`)가 하는 것과 같은 벗기기 — 판정에 **실값만** 넘긴다. */
function values(qs: Record<string, Quantity>): Record<string, number> {
  return Object.fromEntries(Object.entries(qs).map(([id, q]) => [id, q.value]));
}

describe('정의역 밖의 값은 합격을 받을 수 없다', () => {
  /** 게이트가 보고한 재현 입력 그대로. 회전수를 끝까지 올리고 인상속도를 끝까지 내린 자리. */
  const REPORTED = {
    pullRateMmPerMin: 0.5, gradientKPerCm: 15, crystalRpm: 30, crucibleRpm: 2,
  } as const;

  it('wafer/lab-applied — 보고된 입력이 σ_D 합격도 칸 합격도 받지 못한다', () => {
    const spec = labSpec('wafer', 'lab-applied');
    expect(spec).toBeDefined();
    if (!spec) return;

    const qs = spec.compute({ ...REPORTED });
    const sigma = qs['diameterSigmaMm'];
    expect(sigma, 'σ_D 출력이 없다').toBeDefined();
    if (!sigma) return;

    // 전제 — 이 입력에서 응답식이 정의역 밖으로 샌다는 사실 자체가 아직 살아 있는가.
    // 🔴 식이 고쳐져 이탈이 사라지면 이 테스트는 **의미를 잃은 채 통과하면 안 된다.**
    //    그래서 전제를 단언으로 박는다 — 이탈이 사라졌다면 이 파일을 다시 쓸 때다.
    expect(sigma.outOfRange, 'σ_D 가 더는 정의역을 벗어나지 않는다 — 이 회귀 테스트를 재검토하라').toBe(true);

    // 🔴 본체 — 화면과 **같은 경로**(실값만 넘김)로 판정해도 합격이 아니어야 한다.
    const verdict = evaluate(spec, values(qs));
    const row = verdict.outputs.find((r) => r.id === 'diameterSigmaMm');
    expect(row, 'σ_D 판정행이 없다').toBeDefined();
    expect(row?.pass, `σ_D = ${sigma.value} 는 정의역 밖인데 합격을 받았다`).toBe(false);
    expect(row?.outOfDomain).toBe(true);
    expect(verdict.pass, '정의역 밖의 σ_D 를 품은 조합이 칸 합격을 받았다').toBe(false);
  });

  it('표준편차가 음수면 — 어떤 입력이든 — 합격을 받지 못한다', () => {
    const spec = labSpec('wafer', 'lab-applied');
    expect(spec).toBeDefined();
    if (!spec) return;

    // 슬라이더 격자를 결정론으로 훑어 **음수 σ 가 나온 자리를 전부** 모은다(A14-1 — Math.random 금지).
    let seed = 20260821;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    let negatives = 0;
    for (let n = 0; n < 4000; n++) {
      const inputs = Object.fromEntries(spec.params.map((p) => {
        const steps = Math.max(1, Math.round((p.max - p.min) / p.step));
        const raw = p.min + Math.round(rnd() * steps) * p.step;
        return [p.id, Math.min(p.max, Math.max(p.min, raw))];
      }));
      let qs: Record<string, Quantity>;
      try { qs = spec.compute(inputs); } catch { continue; }
      const sigma = qs['diameterSigmaMm'];
      if (!sigma || !(sigma.value < 0)) continue;
      negatives++;
      const row = evaluate(spec, values(qs)).outputs.find((r) => r.id === 'diameterSigmaMm');
      expect(
        row?.pass,
        `σ_D = ${sigma.value} (입력 ${JSON.stringify(inputs)}) — 음수 표준편차가 합격을 받았다`,
      ).toBe(false);
    }
    expect(negatives, '음수 σ 가 한 번도 안 나왔다 — 스윕이 결함 구간을 못 밟았다').toBeGreaterThan(0);
  });

  it('판정 공통 경로 — 물리층이 outOfRange 로 표시하면 어느 칸의 어느 판정 출력도 합격하지 못한다', () => {
    let checked = 0;

    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/') as [string, LabStage];
      const spec = labSpec(processId, stage);
      if (!spec) continue;

      const base = spec.compute(Object.fromEntries(spec.params.map((p) => [p.id, p.initial])));

      for (const o of spec.outputs) {
        if (o.role !== 'judge' || !o.pass) continue;
        const q = base[o.id];
        if (!q) continue;

        // 🔴 물리층이 「성립할 수 없다」고 표시한 Quantity 를 그대로 넘긴다.
        //    값은 **합격창 한가운데**로 둔다 — 합격창으로는 거를 수 없는 값이어야
        //    「판정이 정의역을 읽는가」만 시험하는 것이 된다.
        const inWindow = o.pass.min !== undefined && o.pass.max !== undefined
          ? (o.pass.min + o.pass.max) / 2
          : (o.pass.max ?? o.pass.min) as number;
        const flagged: Quantity = { ...q, value: inWindow, outOfRange: true };

        const row = evaluate(spec, { ...base, [o.id]: flagged })
          .outputs.find((r) => r.id === o.id);
        expect(
          row?.pass,
          `${key} / ${o.id}: outOfRange 인데 합격을 받았다 (값 ${inWindow}, 창 ${JSON.stringify(o.pass)})`,
        ).toBe(false);
        expect(row?.outOfDomain).toBe(true);
        checked++;
      }
    }

    // 판정 출력이 하나도 없으면 이 테스트가 조용히 빈 통과를 한다 — 분모를 고정한다.
    expect(checked, '판정 출력을 하나도 못 봤다').toBeGreaterThan(0);
  });

  it('과잉 교정 방지 — 정상 범위의 값은 여전히 합격한다', () => {
    const spec = labSpec('wafer', 'lab-applied');
    expect(spec).toBeDefined();
    if (!spec) return;

    // 인계기록이 「S6 전 항목 합격」으로 못박은 조합(wafer.ts 머리주석 2번).
    const qs = spec.compute({
      pullRateMmPerMin: 0.6, gradientKPerCm: 45, crystalRpm: 22, crucibleRpm: 6,
    });
    const sigma = qs['diameterSigmaMm'];
    expect(sigma?.outOfRange, '정상 조합이 정의역 밖으로 밀려났다').toBe(false);

    const verdict = evaluate(spec, values(qs));
    expect(verdict.pass, '정당한 합격 조합까지 불합격이 됐다 — 정의역을 너무 좁게 잡았다').toBe(true);
  });
});
