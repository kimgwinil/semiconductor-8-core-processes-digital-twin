// 🔴 등급 리졸버 설치(부수효과)는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 미설치로 던진다.
import '@/models/registry';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllLabs, labSpec, evaluate } from '@/models/labs';
import type { LabParam } from '@/models/labs/spec';

/**
 * 🔴 회귀 게이트 — **`metal/lab-advanced` 의 RC 지연비 판정이 죽어 있지 않다.**
 *
 * 사고 경위(2026-08-21 조사). 종전 임계 `RC_RATIO_PASS_MAX = 0.576` 은 PLN 자신의 두 값
 * `기본 1.077 ps / 합격 0.62 ps` 의 비 **0.62/1.077 = 0.5757** 을 반올림해 얻은 수였다.
 * 그 유래 때문에 「실도달 최대가 0.5757 이라 임계 0.576 에 0.0003 못 미친다 →
 * 이 판정은 영원히 참이라 아무 일도 하지 않는 죽은 조건 아니냐」는 의심이 제기됐다.
 * 🔴 **그 의심은 사실이 아니었다**(0.5757 은 임계의 유래이지 도달 최댓값이 아니다). 다만 PLN 은
 *    「유래가 자백된 역산값」이라는 이유로 그 수를 폐기하고 **난이도 상수 `0.45` 를 확정**했다.
 *
 * 슬라이더 실제 격자(W 20–200/1 nm × k 2.2–4.0/0.1 × L 10–200/5 µm = **181 × 19 × 39
 * = 134 121 조합**) 전수 스윕 실측 — **임계 0.45 재측정(2026-08-21)**:
 *
 *   · 실도달 최소 **0.005524266** @ W 200 nm · k 2.2 · L 10 µm   (임계와 무관 · 불변)
 *   · 실도달 최대 **147.9409370** @ W  20 nm · k 4.0 · L 200 µm  (임계와 무관 · 불변)
 *   · 임계 초과(불합격) **101 690** 건 · 임계 이하(합격) **32 431** 건 → 격자 합격률 **24.18 %**
 *     (종전 0.576 에서는 96 737 / 37 384 · 27.87 % 였다. PLN 이 예고한 이동폭과 일치한다.)
 *   · 지연비는 CMP 축(하중·회전수)과 EM 축(온도·전류)에 **독립**이다 — 11 094 회 교차검사 어긋남 0건
 *
 * 즉 임계는 도달 구간 **한가운데**에 있고 판정은 양쪽으로 실제로 갈린다.
 *
 * 이 테스트가 고정하는 것:
 *  ① 합격 임계가 실도달 [최소, 최대] **안쪽**에 있다 — 정의역 밖으로 밀려나면 즉시 실패한다
 *  ② 임계 양쪽에 도달 조합이 **둘 다** 존재한다(한쪽이 0이면 죽은 판정이다)
 *  ③ 임계 위·아래·정확히 위에 서는 **대표 입력 3점**이 그 값을 그대로 낸다
 *
 * 🔴 임계값을 이 파일에 리터럴로 쓰지 않는다. **명세에서 읽는다** — 합격창 이동은 PLN 소관이고
 *    (D-041) 이 테스트는 창을 고정하는 것이 아니라 **창이 정의역 안에 있는지**를 고정한다.
 *    창이 옮겨져 정의역 밖으로 나가면 여기가 먼저 운다.
 *
 * ⚠️ 이 테스트가 말하지 **않는** 것: 「RC 판정이 다른 판정과 함께 실제로 합격을 가른다」.
 *    종전 기록: R ≤ 100 Ω(잠정) ∧ 피치 ≤ 170 nm 를 만족하는 5 377 조합 안에서는 지연비 최댓값이
 *    **0.5307** 이라 RC 판정이 한 번도 결속하지 않았고, κ 전환(저항비 ≤ 0.68) 후에도 289쌍 × k
 *    19점 = 5 491 조합 중 RC 불합격은 **단 1건**(W 85 · L 50 · k 4.0 → 0.578135)뿐이었다.
 *    🔴 **PLN 확정 임계 0.45 로 바꾼 뒤 재측정하면 사정이 달라진다** — 같은 5 491 조합 중
 *    RC 불합격 **60건**, 창 안 지연비 최댓값 **0.4483**(W 71 · k 3.7 · L 40).
 *    즉 RC 판정은 이제 **해 영역 안에서도 실제로 결속한다.** 임계에 딸린 사실이라 회귀로
 *    못 박지 않는다 — 기록으로만 남긴다(PLN 대조 사항).
 */

const LAB = { processId: 'metal', stage: 'lab-advanced' } as const;
/** 지연비를 정하는 세 축. 나머지 네 축과는 독립임을 조사에서 확인했다. */
const RC_AXES = ['lineWidthNm', 'dielectricConstant', 'lineLengthUm'] as const;

/** 슬라이더 격자를 min·max·step 그대로 펼친다. 임의 범위를 쓰지 않는다. */
function axis(p: LabParam): number[] {
  const n = Math.round((p.max - p.min) / p.step);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Number((p.min + i * p.step).toFixed(10)));
  return out;
}

beforeAll(() => {
  registerAllLabs();
});

describe('metal/lab-advanced — RC 지연비 합격창이 정의역 안에 있다', () => {
  it('슬라이더 격자 전수 스윕에서 임계 양쪽이 모두 도달된다', () => {
    const spec = labSpec(LAB.processId, LAB.stage);
    expect(spec, `${LAB.processId}/${LAB.stage} 명세가 없다`).toBeDefined();
    if (!spec) return;

    const out = spec.outputs.find((o) => o.id === 'rcDelayRatio');
    expect(out, 'rcDelayRatio 출력이 사라졌다').toBeDefined();
    expect(out?.role, 'rcDelayRatio 가 judge 가 아니면 이 게이트의 전제가 무너진다').toBe('judge');
    const threshold = out?.pass?.max;
    expect(threshold, 'rcDelayRatio 의 합격 상한이 선언되어 있지 않다').toBeTypeOf('number');
    if (typeof threshold !== 'number') return;

    const byId = new Map(spec.params.map((p) => [p.id, p]));
    const grids = RC_AXES.map((id) => {
      const p = byId.get(id);
      expect(p, `파라미터 ${id} 가 없다`).toBeDefined();
      return axis(p as LabParam);
    });
    const base = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));

    let n = 0, above = 0, below = 0, thrown = 0;
    let lo = Number.POSITIVE_INFINITY, hi = Number.NEGATIVE_INFINITY;
    for (const w of grids[0] as number[]) {
      for (const k of grids[1] as number[]) {
        for (const l of grids[2] as number[]) {
          const inputs = { ...base, lineWidthNm: w, dielectricConstant: k, lineLengthUm: l };
          let v: number;
          try { v = spec.compute(inputs)['rcDelayRatio']?.value ?? Number.NaN; } catch { thrown++; continue; }
          expect(Number.isFinite(v), `W=${w} k=${k} L=${l} → ${v}`).toBe(true);
          n++;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          if (v > threshold) above++; else below++;
        }
      }
    }

    // 분모를 고정한다 — 격자가 조용히 비면 아래 단언이 빈 통과를 한다.
    expect(n, '스윕된 조합이 0이다').toBe(
      (grids[0] as number[]).length * (grids[1] as number[]).length * (grids[2] as number[]).length,
    );
    expect(thrown, `정의역 안인데 ${thrown} 건이 던졌다`).toBe(0);

    // ① 임계가 실도달 구간 **안쪽**에 있다 — 위나 아래로 밀려나면 판정이 죽는다.
    expect(lo, `실도달 최소 ${lo} 가 임계 ${threshold} 아래로 내려가지 못한다 → 영원히 불합격`)
      .toBeLessThan(threshold);
    expect(hi, `실도달 최대 ${hi} 가 임계 ${threshold} 를 넘지 못한다 → 영원히 합격(죽은 판정)`)
      .toBeGreaterThan(threshold);

    // ② 양쪽에 실제 조합이 있다.
    expect(above, '임계를 넘는 조합이 하나도 없다 — 죽은 판정이다').toBeGreaterThan(0);
    expect(below, '임계 이하로 내려오는 조합이 하나도 없다 — 도달 불가 판정이다').toBeGreaterThan(0);
    // 🔴 134 121 조합 전수라 기본 5 s 예산을 넘긴다 — 단독 실행 1.5 s, 전체 병렬 실행에서 6 s.
    //    판정 임계가 아니라 **테스트 러너 예산**이다(D-041 무관).
  }, 60_000);

  it('임계 위·아래에 서는 대표 입력들이 실측값을 그대로 낸다', () => {
    const spec = labSpec(LAB.processId, LAB.stage);
    if (!spec) return;
    const base = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
    const ratio = (widthNm: number, k: number, lengthUm: number): number => spec.compute({
      ...base, lineWidthNm: widthNm, dielectricConstant: k, lineLengthUm: lengthUm,
    })['rcDelayRatio']?.value ?? Number.NaN;

    // 기준 조합(= 슬라이더 기본값). 비의 분모 그 자체이므로 정확히 1 이고 **불합격**이다.
    expect(ratio(60, 4.0, 50)).toBeCloseTo(1, 12);

    /* 🔴 임계(PLN 확정 0.45) **양쪽에 실제로 서는 슬라이더 격자점 한 쌍.**
     *   W 를 기준폭 60 nm 로 두면 ρ_eff 가 분자·분모에서 약분되어 지연비가 (k/4)·(L/50)² 이 되므로
     *   손으로 검산할 수 있다. 두 점은 k 한 칸(0.5) 차이뿐이고 그 사이에 임계가 있다. */
    expect(ratio(60, 2.5, 40)).toBeCloseTo(0.40, 12);   // (2.5/4)×0.64 = 0.400 → 임계 아래 = 합격
    expect(ratio(60, 3.0, 40)).toBeCloseTo(0.48, 12);   // (3.0/4)×0.64 = 0.480 → 임계 위  = 불합격
    // 종전 임계(0.576)의 경계점이던 조합. 임계가 옮겨져 이제 **불합격 쪽**이다 — 값 자체는 그대로다.
    expect(ratio(60, 3.6, 40)).toBeCloseTo(0.576, 12);

    // metal.ts 헤더 §3 이 심화 합격 예로 든 조합의 배선 부분.
    expect(ratio(85, 3.0, 45)).toBeCloseTo(0.351217284470662, 12);

    // 도달 양 끝(전수 스윕 실측).
    expect(ratio(200, 2.2, 10)).toBeCloseTo(0.0055242662496230634, 15);
    expect(ratio(20, 4.0, 200)).toBeCloseTo(147.94093703041412, 8);
  });

  /* 🔴 임계값을 리터럴로 쓰지 않는다 — **명세에서 읽는다.** 창을 옮기는 것은 PLN 소관이라
   *    (D-041) 이 테스트는 창의 위치가 아니라 **경계 비교가 포함(`v <= max`)인지**를 고정한다.
   *    종전에는 임계와 정확히 같은 값을 내는 격자점(W 60 · k 3.6 · L 40 → 0.576)이 있어 그것으로
   *    쟀지만, 확정 임계 0.45 를 정확히 내는 격자점은 없다. 그래서 임계 자체를 넣어 잰다. */
  it('임계와 정확히 같은 값은 rcDelayRatio 칸에서 합격으로 계상된다(경계 포함 비교)', () => {
    const spec = labSpec(LAB.processId, LAB.stage);
    if (!spec) return;
    const threshold = spec.outputs.find((o) => o.id === 'rcDelayRatio')?.pass?.max;
    expect(threshold, 'rcDelayRatio 의 합격 상한이 선언되어 있지 않다').toBeTypeOf('number');
    if (typeof threshold !== 'number') return;

    const base = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
    const q = spec.compute(base);
    const vals = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.value]));

    const at = evaluate(spec, { ...vals, rcDelayRatio: threshold }).outputs
      .find((o) => o.id === 'rcDelayRatio');
    expect(at?.pass, `지연비가 임계 ${threshold} 와 같은데 합격으로 계상되지 않았다`).toBe(true);

    // 바로 위는 불합격이어야 한다 — 「경계 포함」이 「상한 무시」로 새지 않았다는 확인.
    const above = evaluate(spec, { ...vals, rcDelayRatio: threshold * (1 + 1e-9) }).outputs
      .find((o) => o.id === 'rcDelayRatio');
    expect(above?.pass, `임계 ${threshold} 를 넘겼는데 합격으로 계상됐다`).toBe(false);
  });

  it('임계를 사이에 둔 슬라이더 격자점 두 점이 evaluate() 에서 실제로 갈린다', () => {
    const spec = labSpec(LAB.processId, LAB.stage);
    if (!spec) return;
    const base = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
    const verdict = (k: number): boolean | null => {
      const q = spec.compute({ ...base, lineWidthNm: 60, dielectricConstant: k, lineLengthUm: 40 });
      const vals = Object.fromEntries(Object.entries(q).map(([id, v]) => [id, v.value]));
      return evaluate(spec, vals).outputs.find((o) => o.id === 'rcDelayRatio')?.pass ?? null;
    };
    expect(verdict(2.5), 'k 2.5 (지연비 0.400) 이 합격으로 계상되지 않았다').toBe(true);
    expect(verdict(3.0), 'k 3.0 (지연비 0.480) 이 불합격으로 계상되지 않았다').toBe(false);
  });
});
