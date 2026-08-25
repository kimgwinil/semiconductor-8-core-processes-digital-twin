import { describe, expect, it } from 'vitest';
import { registerAllLabs } from '@/models/labs';
import { evaluate, labSpec, registeredLabKeys } from '@/models/labs/spec';
import type { LabSpec } from '@/models/labs/spec';
import {
  PASS_SWEEP_MAX_POINTS,
  failDirections,
  labPassRanges,
  paramPassRange,
  passSweepGrid,
} from '@/models/labs/passRange';

/**
 * 🔴 **합격 구간 스윕의 수용기준.** (CEO 지시 2026-08-24 「합격을 위한 가이드라인을 최소/최대로」)
 *
 * 이 파일이 지키는 것은 하나다 — **화면이 「합격 범위 a~b」라고 적으면 그 값에서 정말로 합격이 나온다.**
 * 그래서 검사는 전부 「구간 안의 모든 격자점이 합격인가」와 「구간 밖의 격자점이 하나도 합격이 아닌가」로
 * 되어 있다. 구간을 만드는 코드와 검사하는 코드가 **같은 판정 함수(`evaluate`)를 쓰되 경로가 다르다** —
 * 구간은 `paramPassRange` 가, 검사는 여기서 직접 `spec.compute` → `evaluate` 로 돌린다.
 */

registerAllLabs();

/** 그 입력에서 판정이 전부 합격인가. 🔴 스윕과 **다른 경로**로 다시 판정한다. */
function passAt(spec: LabSpec, inputs: Record<string, number>): boolean {
  try { return evaluate(spec, spec.compute(inputs)).pass; } catch { return false; }
}

describe('passSweepGrid — 학습자가 실제로 멈출 수 있는 값 위에만 점을 찍는다', () => {
  it('options 가 있으면 그것이 정본이다 (oxidation 온도 920·1000·1100)', () => {
    const spec = labSpec('oxidation', 'lab-basic');
    expect(spec).toBeDefined();
    const p = spec!.params.find((x) => x.id === 'tempC');
    expect(p).toBeDefined();
    const g = passSweepGrid(p!);
    expect(g.values).toEqual([920, 1000, 1100]);
    expect(g.coarse).toBe(false);
    // 🔴 step 격자였다면 920·1010·1100 이 되어 **모델이 받지 않는 1010** 위에 판정이 찍힌다.
    expect(g.values).not.toContain(1010);
  });

  it('step 격자는 min + i·step 이다 (photo 노광량 10~60 step 1 → 51점)', () => {
    const spec = labSpec('photo', 'lab-basic')!;
    const p = spec.params.find((x) => x.id === 'doseMjCm2')!;
    const g = passSweepGrid(p);
    expect(g.values.length).toBe(51);
    expect(g.values[0]).toBe(10);
    expect(g.values[g.values.length - 1]).toBe(60);
    expect(g.coarse).toBe(false);
  });

  it('상한을 넘으면 솎고 coarse 를 세운다 — 조용히 솎지 않는다', () => {
    const spec = labSpec('photo', 'lab-basic')!;
    const p = spec.params.find((x) => x.id === 'doseMjCm2')!;
    const g = passSweepGrid(p, 10);
    expect(g.coarse).toBe(true);
    expect(g.values.length).toBeLessThanOrEqual(11);
    // 솎아도 **양 끝은 남는다** — 범위를 좁혀 말하지 않는다.
    expect(g.values[0]).toBe(10);
    expect(g.values[g.values.length - 1]).toBe(60);
  });

  it('현행 24칸에서 상한에 닿는 파라미터는 없다 (coarse 0건)', () => {
    let coarse = 0;
    for (const key of registeredLabKeys()) {
      const [pid, stage] = key.split('/');
      const spec = labSpec(pid!, stage as never)!;
      for (const p of spec.params) if (passSweepGrid(p, PASS_SWEEP_MAX_POINTS).coarse) coarse += 1;
    }
    expect(coarse).toBe(0);
  });
});

describe('paramPassRange — photo/lab-basic 검산 (CEO 지정 3건)', () => {
  const spec = labSpec('photo', 'lab-basic')!;

  it('기본값 E=25 · ΔF=+90 은 CD 58.26 · SWA 72.23 으로 불합격이다', () => {
    const q = spec.compute({ doseMjCm2: 25, focusOffsetNm: 90 });
    expect(q['cdNm']!.value).toBeCloseTo(58.26, 2);
    expect(q['swaDeg']!.value).toBeCloseTo(72.233, 2);
    expect(evaluate(spec, q).pass).toBe(false);
  });

  it('E=32·ΔF=0 / E=31·ΔF=+40 / E=34·ΔF=−30 은 합격이다', () => {
    expect(passAt(spec, { doseMjCm2: 32, focusOffsetNm: 0 })).toBe(true);
    expect(passAt(spec, { doseMjCm2: 31, focusOffsetNm: 40 })).toBe(true);
    expect(passAt(spec, { doseMjCm2: 34, focusOffsetNm: -30 })).toBe(true);
  });

  it('1,581 조합 중 합격은 55개(3.5 %)다', () => {
    let total = 0; let pass = 0;
    for (let e = 10; e <= 60; e += 1) {
      for (let f = -150; f <= 150; f += 10) {
        total += 1;
        if (passAt(spec, { doseMjCm2: e, focusOffsetNm: f })) pass += 1;
      }
    }
    expect(total).toBe(1581);
    expect(pass).toBe(55);
  });

  it('ΔF=0 고정에서 노광량 합격 구간은 30~34 이고, 실제 합격 조합과 정확히 일치한다', () => {
    const inputs = { doseMjCm2: 25, focusOffsetNm: 0 };
    const p = spec.params.find((x) => x.id === 'doseMjCm2')!;
    const r = paramPassRange(spec, inputs, p);
    expect(r.intervals).toEqual([{ min: 30, max: 34, count: 5 }]);
    // 🔴 구간 안은 전부 합격, 밖은 전부 불합격 — 브루트포스로 대조한다.
    for (let e = 10; e <= 60; e += 1) {
      const inside = e >= 30 && e <= 34;
      expect(passAt(spec, { doseMjCm2: e, focusOffsetNm: 0 })).toBe(inside);
    }
    expect(r.blocked).toBe(0);
    expect(r.sampled).toBe(51);
  });

  it('CEO 검산 3건이 각각 자기 구간 안에 들어 있다', () => {
    const dose = spec.params.find((x) => x.id === 'doseMjCm2')!;
    const inWin = (v: number, iv: Array<{ min: number; max: number }>) =>
      iv.some((i) => v >= i.min && v <= i.max);
    expect(inWin(32, paramPassRange(spec, { doseMjCm2: 0, focusOffsetNm: 0 }, dose).intervals)).toBe(true);
    expect(inWin(31, paramPassRange(spec, { doseMjCm2: 0, focusOffsetNm: 40 }, dose).intervals)).toBe(true);
    expect(inWin(34, paramPassRange(spec, { doseMjCm2: 0, focusOffsetNm: -30 }, dose).intervals)).toBe(true);
  });

  it('기본값에서는 두 손잡이 **어느 것도** 혼자서는 합격을 만들 수 없다 — 그것이 사실이다', () => {
    const r = labPassRanges(spec, { doseMjCm2: 25, focusOffsetNm: 90 });
    expect(r.byParam['doseMjCm2']!.intervals).toEqual([]);
    expect(r.byParam['focusOffsetNm']!.intervals).toEqual([]);
    expect(r.allEmpty).toBe(true);
  });
});

describe('paramPassRange — 끊긴 구간은 합치지 않는다', () => {
  it('photo/lab-applied 초점은 합격 구간이 둘로 끊긴다 (−60~−50 · 50~60)', () => {
    const spec = labSpec('photo', 'lab-applied')!;
    const inputs = { na: 1.18, doseMjCm2: 38, focusOffsetNm: 0 };
    const p = spec.params.find((x) => x.id === 'focusOffsetNm')!;
    const r = paramPassRange(spec, inputs, p);
    expect(r.intervals.length).toBe(2);
    expect(r.intervals[0]!.min).toBe(-60);
    expect(r.intervals[0]!.max).toBe(-50);
    expect(r.intervals[1]!.min).toBe(50);
    expect(r.intervals[1]!.max).toBe(60);
    // 🔴 사이(ΔF = 0)는 불합격이다. 하나로 합쳤다면 여기서 거짓말이 된다.
    expect(passAt(spec, { ...inputs, focusOffsetNm: 0 })).toBe(false);
  });

  it('이산 파라미터(3택)에서도 구간이 나온다 — oxidation 온도', () => {
    const spec = labSpec('oxidation', 'lab-basic')!;
    const p = spec.params.find((x) => x.id === 'tempC')!;
    const r = paramPassRange(spec, { tempC: 920, timeMin: 52 }, p);
    expect(r.sampled).toBe(3);
    expect(r.intervals).toEqual([{ min: 1100, max: 1100, count: 1 }]);
    expect(passAt(spec, { tempC: 1100, timeMin: 52 })).toBe(true);
    expect(passAt(spec, { tempC: 1000, timeMin: 52 })).toBe(false);
    expect(passAt(spec, { tempC: 920, timeMin: 52 })).toBe(false);
  });
});

describe('A14 — 계산이 막힌 격자점은 합격으로 세지 않는다', () => {
  it('24칸 전수: 구간 안의 모든 격자점이 실제로 합격이다', () => {
    let checkedIntervals = 0;
    let checkedPoints = 0;
    for (const key of registeredLabKeys()) {
      const [pid, stage] = key.split('/');
      const spec = labSpec(pid!, stage as never)!;
      const init = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      for (const p of spec.params) {
        const r = paramPassRange(spec, init, p);
        for (const iv of r.intervals) {
          checkedIntervals += 1;
          for (const x of passSweepGrid(p).values) {
            if (x < iv.min || x > iv.max) continue;
            checkedPoints += 1;
            expect(passAt(spec, { ...init, [p.id]: x })).toBe(true);
          }
        }
      }
    }
    // 🔴 「검사할 것이 하나도 없었다」를 통과로 세지 않는다.
    expect(checkedIntervals).toBeGreaterThan(0);
    expect(checkedPoints).toBeGreaterThan(0);
  });

  it('24칸 전수: 구간 밖에는 합격 격자점이 하나도 없다', () => {
    for (const key of registeredLabKeys()) {
      const [pid, stage] = key.split('/');
      const spec = labSpec(pid!, stage as never)!;
      const init = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      for (const p of spec.params) {
        const r = paramPassRange(spec, init, p);
        for (const x of passSweepGrid(p).values) {
          const inside = r.intervals.some((iv) => x >= iv.min && x <= iv.max);
          if (inside) continue;
          expect(passAt(spec, { ...init, [p.id]: x })).toBe(false);
        }
      }
    }
  });

  it('합격 격자점 수의 합 = 구간들의 점 수 합 (막힌 점은 어디에도 안 들어간다)', () => {
    const spec = labSpec('metal', 'lab-advanced')!;
    const init = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
    for (const p of spec.params) {
      const r = paramPassRange(spec, init, p);
      const sum = r.intervals.reduce((a, iv) => a + iv.count, 0);
      expect(sum).toBe(r.passed);
      expect(r.passed + r.blocked).toBeLessThanOrEqual(r.sampled);
    }
  });
});

describe('labPassRanges — 성능 실측치를 지어내지 않는다', () => {
  it('calls 는 실제로 훑은 격자점 수의 합이다', () => {
    const spec = labSpec('photo', 'lab-basic')!;
    const r = labPassRanges(spec, { doseMjCm2: 25, focusOffsetNm: 90 });
    // 노광량 51점 + 초점 31점
    expect(r.calls).toBe(51 + 31);
    expect(r.byParam['doseMjCm2']!.sampled).toBe(51);
    expect(r.byParam['focusOffsetNm']!.sampled).toBe(31);
  });

  it('24칸 전수 합계가 26,068 회다 (기준선 — 늘어나면 화면 비용이 늘어난 것이다)', () => {
    let calls = 0;
    for (const key of registeredLabKeys()) {
      const [pid, stage] = key.split('/');
      const spec = labSpec(pid!, stage as never)!;
      const init = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      calls += labPassRanges(spec, init).calls;
    }
    expect(calls).toBe(26068);
  });
});

describe('failDirections — 방향만 말하고 정답은 말하지 않는다', () => {
  const spec = labSpec('photo', 'lab-basic')!;

  it('기본값에서 CD 는 위로, SWA 는 아래로 벗어났다', () => {
    const v = evaluate(spec, spec.compute({ doseMjCm2: 25, focusOffsetNm: 90 }));
    const d = failDirections(spec, v.outputs);
    expect(d).toEqual([
      { outputId: 'cdNm', direction: 'above' },
      { outputId: 'swaDeg', direction: 'below' },
    ]);
  });

  it('합격 상태에서는 방향 줄이 하나도 없다', () => {
    const v = evaluate(spec, spec.compute({ doseMjCm2: 32, focusOffsetNm: 0 }));
    expect(v.pass).toBe(true);
    expect(failDirections(spec, v.outputs)).toEqual([]);
  });

  it('display 출력은 방향을 말하지 않는다 (판정 대상이 아니다)', () => {
    const v = evaluate(spec, spec.compute({ doseMjCm2: 25, focusOffsetNm: 90 }));
    const ids = failDirections(spec, v.outputs).map((x) => x.outputId);
    expect(ids).not.toContain('dofNm');
    expect(ids).not.toContain('resolutionNm');
    expect(ids).not.toContain('throughputWph');
  });

  it('정의역 밖이면 규격 방향보다 먼저 그 사실을 말한다', () => {
    const d = failDirections(spec, [
      { id: 'cdNm', value: 1e9, pass: false, outOfDomain: true },
    ]);
    expect(d).toEqual([{ outputId: 'cdNm', direction: 'outOfDomain' }]);
  });
});
