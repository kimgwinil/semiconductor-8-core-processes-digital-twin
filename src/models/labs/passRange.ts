import type { LabOutput, LabParam, LabSpec, LabVerdict } from './spec';
import { evaluate, paramOptions } from './spec';
import type { Quantity } from '../contract';

/**
 * 🔴 **합격 구간 스윕** — 「이 손잡이를 어디에 두면 합격인가」를 **최소/최대로** 말한다.
 *
 * CEO 지시(2026-08-24): 「조작하는 부분에서 합격을 위한 가이드라인을 **최소/최대로 구분하여
 * 제공**하는 것도 방법임」. 그 앞의 실측된 공백이 이유다 —
 * `photo/lab-basic` 기본값(E 25 · ΔF +90)은 CD 58.26(규격 42~48) · SWA 72.23(규격 ≥82) 로
 * 불합격이고, 1,581 조합 중 합격은 **55개(3.5 %)** 뿐이다. 종전 화면은 「불합격」과 「규격 42~48」
 * 까지만 말했다. **어느 손잡이를 어느 쪽으로 움직일지는 말하지 않았다.**
 *
 * ## 무엇을 계산하는가
 * **다른 파라미터를 지금 값으로 고정한 채** 이 파라미터만 전 범위를 훑어,
 * `evaluate()` 가 **모든 판정 출력을 합격**으로 주는 값들의 구간을 돌려준다.
 *
 * ## 🔴 A15 — 보간·근사 금지
 * 격자점마다 **`spec.compute()` 를 실제로 다시 부른다.** 곡선 맞춤도, 이웃값 보간도 없다.
 * 그래서 화면이 「합격 범위 30~34」라고 적으면 학습자가 그 값에 손잡이를 두었을 때
 * **정말로 합격 판정이 나온다.** (`LabScope#runSweep` 과 같은 규율이다.)
 *
 * ## 🔴 A14 — NaN·발산·한계선 밖은 합격으로 세지 않는다
 * `compute()` 가 `OutOfLimitError` 를 던지는 격자점은 **막힌 점**으로 세고 합격에서 뺀다.
 * 비유한값·정의역 이탈은 `evaluate()` 가 이미 막는다 — 여기서 판정을 다시 쓰지 않는 이유다.
 * (판정을 두 벌 두면 갈라지고, 갈라지는 순간 이 모듈은 「합격이라고 거짓말하는 장치」가 된다.)
 *
 * ## 🔴 D-050 — 구간이 없으면 「없다」
 * 합격점이 하나도 없으면 **빈 배열**을 돌려준다. 화면은 그 사실을 글자로 말해야 한다
 * (「이 값만으로는 합격할 수 없습니다 — 다른 조건도 함께 바꿔야 합니다」).
 * ⛔ 빈 띠를 그려 놓고 침묵하면 「어딘가에 있는데 안 보이는 것」으로 읽힌다.
 *
 * **실측(2026-08-24 · 24칸 전수):** 초기값 상태에서 **112개 파라미터 중 104개**가 구간이 없다.
 * 이것은 결함이 아니라 설계다 — PLN 「죽은 판정 없음 확인」에 따라 초기값이 대개 불합격이고,
 * 손잡이 **하나만으로는** 거기서 빠져나올 수 없는 칸이 대부분이다. 그래서 이 모듈의 절반은
 * 「구간이 있다」를 말하는 것이고 나머지 절반은 **「하나만으로는 안 된다」를 말하는 것**이다.
 *
 * ## 🔴 계층
 * 여기는 models 다. `react`·`@/ui`·`@/viz`·DOM 을 참조하지 않는다.
 */

/**
 * 한 파라미터가 낼 수 있는 격자점 상한. 이 수를 넘으면 **격자를 솎고 `coarse` 를 세운다.**
 *
 * 🔴 **왜 이렇게 큰가(6,000).** 솎는 순간 「좁은 합격창을 통째로 건너뛰어 「없다」고 말할」
 *    위험이 생긴다 — 그것이 D-050 이 금지하는 바로 그 거짓이다. 실측상 24칸에서 가장 격자가
 *    촘촘한 파라미터가 **3,501점**(그다음이 3,101점)이라 이 상한에 닿는 칸이
 *    **오늘은 하나도 없다**(실측 2026-08-24 · 24칸 전수). 즉 현행 제품에서 이 값은
 *    「솎지 않는다」와 같은 뜻이고, 상한은 미래에 누가 `step` 을 극단으로 줄였을 때
 *    브라우저가 멈추지 않게 하는 **안전핀**으로만 존재한다.
 * 🔴 솎는 경우에는 `coarse` 가 참이 되고 **화면이 그 사실을 말해야 한다.**
 */
export const PASS_SWEEP_MAX_POINTS = 6000;

/** 부동소수 잔재(0.30000000000000004)를 걷어낸다. 값 자체는 바꾸지 않는다. */
function snapGrid(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(12)) : v;
}

/** 합격 구간 하나. 🔴 **격자 위의 실제 값**이다 — 학습자가 그 자리에 설 수 있다. */
export interface PassInterval {
  /** 구간의 최소값(합격). */
  min: number;
  /** 구간의 최대값(합격). */
  max: number;
  /** 이 구간 안의 격자점 수. `1` 이면 「점 하나뿐」이다. */
  count: number;
}

export interface ParamPassRange {
  paramId: string;
  /**
   * 합격 구간들. 🔴 **비어 있으면 「이 손잡이만으로는 합격할 수 없다」가 사실이다.**
   * 구간이 끊겨 여러 개면 **전부** 담는다 — 하나로 합치면 사이의 불합격 구간을 감춘 거짓이 된다.
   */
  intervals: PassInterval[];
  /** 훑은 격자점 수. */
  sampled: number;
  /** 합격 격자점 수. */
  passed: number;
  /** 🔴 계산이 막힌 격자점 수(한계선 초과·비유한). 합격에 세지 않는다(A14). */
  blocked: number;
  /** 🔴 격자를 솎았는가. 참이면 구간 경계가 **실제보다 성길 수 있다** — 화면이 고지해야 한다. */
  coarse: boolean;
}

/** 스윕 격자와 「솎았는가」. */
export interface SweepGrid {
  values: number[];
  coarse: boolean;
}

/**
 * 스윕 격자. 🔴 **학습자가 실제로 멈출 수 있는 값 위에만 점을 찍는다.**
 *
 *  ① `options` 가 있으면 **그것이 정본**이다 — 간격이 고르지 않은 이산 축(예: 920 · 1000 · 1100)이 그렇다.
 *     `step` 격자로 훑으면 모델이 실제로 받지 않는 x(1010)를 합격/불합격으로 판정하게 된다.
 *  ② 없으면 `min + i·step`. **누산(`v += step`)하지 않는다** — 부동소수 오차가 쌓여 격자를 벗어난다.
 */
export function passSweepGrid(p: LabParam, maxPoints: number = PASS_SWEEP_MAX_POINTS): SweepGrid {
  const opts = paramOptions(p);
  if (opts.length > 0 && p.options && p.options.length > 0) return { values: opts, coarse: false };

  const span = p.max - p.min;
  if (!Number.isFinite(span) || span <= 0) return { values: [p.min], coarse: false };
  if (!Number.isFinite(p.step) || p.step <= 0) return { values: [p.min, p.max], coarse: true };

  const nSteps = Math.max(1, Math.round(span / p.step));
  const stride = Math.max(1, Math.ceil((nSteps + 1) / maxPoints));
  const values: number[] = [];
  for (let i = 0; i <= nSteps; i += stride) values.push(snapGrid(p.min + i * p.step));
  const last = snapGrid(p.min + nSteps * p.step);
  if (values[values.length - 1] !== last) values.push(last);
  return { values, coarse: stride > 1 };
}

/**
 * 이 입력 조합에서 **판정이 전부 합격인가.**
 *
 * 🔴 판정을 여기서 다시 쓰지 않는다 — `evaluate()` 한 벌만 부른다.
 *    `Quantity` 를 **벗기지 않고 그대로** 넘기는 것이 핵심이다. 실값만 넘기면 물리층이
 *    계산해 둔 `outOfRange` 가 판정에 닿기 전에 사라진다(2026-08-21 σ_D = −0.1 mm 사고).
 *
 * @returns `true` 합격 · `false` 불합격 · `null` **계산이 막힘**(한계선 초과 등)
 */
function judgeAt(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  paramId: string,
  x: number,
): boolean | null {
  try {
    const q = spec.compute({ ...inputs, [paramId]: x });
    return evaluate(spec, q).pass;
  } catch {
    // 🔴 한계선 초과는 **정상 동작**이다(그 조건에서는 장비가 못 돈다). 합격이 아닐 뿐이다.
    //    그러나 「계산이 막혔다」와 「계산했더니 불합격이다」는 다른 사실이므로 구별해 올려보낸다.
    return null;
  }
}

/**
 * 한 파라미터의 합격 구간.
 *
 * 🔴 `inputs` 안의 **그 파라미터 자신의 값은 결과에 영향을 주지 않는다** — 매 격자점에서
 *    덮어쓰기 때문이다. 그래서 화면은 슬라이더를 끄는 동안 이 결과를 **다시 계산할 필요가 없다.**
 */
export function paramPassRange(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  param: LabParam,
  maxPoints: number = PASS_SWEEP_MAX_POINTS,
): ParamPassRange {
  const { values, coarse } = passSweepGrid(param, maxPoints);
  const intervals: PassInterval[] = [];
  let passed = 0;
  let blocked = 0;
  let open: PassInterval | null = null;

  for (const x of values) {
    const ok = judgeAt(spec, inputs, param.id, x);
    if (ok === null) blocked += 1;
    if (ok === true) {
      passed += 1;
      if (open === null) {
        open = { min: x, max: x, count: 1 };
        intervals.push(open);
      } else {
        open.max = x;
        open.count += 1;
      }
    } else {
      open = null;
    }
  }

  return { paramId: param.id, intervals, sampled: values.length, passed, blocked, coarse };
}

/** 한 칸(공정×단계) 전체의 합격 구간 + 실제로 부른 `compute()` 횟수. */
export interface LabPassRanges {
  byParam: Record<string, ParamPassRange>;
  /** 🔴 이번 계산에서 `spec.compute()` 를 부른 횟수. 화면이 그대로 고지한다(성능 실측치). */
  calls: number;
  /** 🔴 파라미터 **전부**가 구간이 없는가 — 「손잡이 하나로는 어느 것도 안 된다」. */
  allEmpty: boolean;
}

export function labPassRanges(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  maxPoints: number = PASS_SWEEP_MAX_POINTS,
): LabPassRanges {
  const byParam: Record<string, ParamPassRange> = {};
  let calls = 0;
  for (const p of spec.params) {
    const r = paramPassRange(spec, inputs, p, maxPoints);
    byParam[p.id] = r;
    calls += r.sampled;
  }
  const allEmpty = spec.params.length > 0
    && spec.params.every((p) => (byParam[p.id]?.intervals.length ?? 0) === 0);
  return { byParam, calls, allEmpty };
}

/* ---------------- 불합격 방향 ---------------- */

/**
 * 🔴 **어느 쪽으로 벗어났는가.** 판정 출력마다 방향을 말한다.
 *
 * ⛔ **정답 값을 알려주지 않는다.** 「노광량을 32로 하세요」는 학습이 아니다.
 *    이 타입이 담는 것은 **방향(위/아래)** 과 **이미 화면에 있는 규격창**까지다.
 */
export type FailDirection = 'above' | 'below' | 'outOfDomain';

export interface OutputFailInfo {
  outputId: string;
  direction: FailDirection;
}

/**
 * 판정 결과에서 불합격 출력의 방향을 뽑는다.
 *
 * 🔴 **판정을 다시 하지 않는다.** `evaluate()` 가 이미 내린 `pass === false` 만 받아
 *    「어느 쪽인가」를 붙인다. 여기서 부등호를 다시 쓰면 화면의 판정과 방향 안내가 갈라진다.
 * 🔴 `outOfDomain` 이 먼저다 — 성립할 수 없는 값에 「규격보다 큽니다」를 붙이면
 *    학습자는 규격 쪽을 보게 되지만 실제 문제는 그 값이 **존재할 수 없다**는 것이다.
 */
export function failDirections(
  spec: LabSpec,
  verdictOutputs: ReadonlyArray<{ id: string; value: number; pass: boolean | null; outOfDomain: boolean }>,
): OutputFailInfo[] {
  const out: OutputFailInfo[] = [];
  for (const row of verdictOutputs) {
    if (row.pass !== false) continue;
    if (row.outOfDomain || !Number.isFinite(row.value)) {
      out.push({ outputId: row.id, direction: 'outOfDomain' });
      continue;
    }
    const o = spec.outputs.find((x) => x.id === row.id);
    const pass = o?.pass;
    if (!pass) continue;
    if (pass.max !== undefined && row.value > pass.max) { out.push({ outputId: row.id, direction: 'above' }); continue; }
    if (pass.min !== undefined && row.value < pass.min) { out.push({ outputId: row.id, direction: 'below' }); continue; }
    /* 🔴 창 안인데 불합격이면 그것은 **판정과 창이 어긋난** 것이다. 방향을 지어내지 않고
          아무 줄도 내지 않는다 — 없는 방향을 그럴듯하게 적는 것이 D-050 이 금지하는 거짓이다. */
  }
  return out;
}

/* ---------------- 손잡이 방향(Nudge) ---------------- */

/**
 * 🔴 **이 손잡이는 어느 쪽인가.** 스레드 재개 지점 ②(2026-08-24 15:55 오케스트레이터 판정)
 * 의 앞 절반이다 — 「함께 바꿔야 열리는 조합」(③)보다 먼저, **손잡이 하나만 한 칸 옆으로
 * 옮겼을 때 지금 불합격인 출력들에 가까워지는가**를 본다.
 *
 * ⛔ **값을 알려주지 않는다.** `lab.failLead`·`FailDirection` 과 같은 원칙이다 — 방향만.
 *    (CEO 확인 2026-08-24: 정확한 부족량을 보여주는 안은 기각하고 방향만 유지하기로 함.)
 */
export type NudgeDirection = 'up' | 'down';

/** 판정창까지의 거리(창 안이면 0). 🔴 방향 판단에만 쓰고 화면에 내지 않는다 — 위 원칙 참조. */
function distanceToWindow(pass: LabOutput['pass'], v: number): number {
  if (!pass) return 0;
  if (pass.max !== undefined && v > pass.max) return v - pass.max;
  if (pass.min !== undefined && v < pass.min) return pass.min - v;
  return 0;
}

/**
 * 한 격자점에서, 지금 불합격인 출력들과의 거리 합.
 * 🔴 판정을 다시 쓰지 않는다 — `evaluate()` 한 벌만 부른다(위 `judgeAt` 과 같은 규율,
 *    같은 등기부 항목을 쓴다 — `scripts/lib/live-judgment.mjs` `arg2: 'q'`).
 * 계산이 막히거나(A14) 정의역을 벗어나면 `null` — 「그 방향은 판단하지 않는다」.
 */
function failDistanceAt(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  paramId: string,
  x: number,
  failingIds: readonly string[],
): number | null {
  let q: Record<string, Quantity>;
  try {
    q = spec.compute({ ...inputs, [paramId]: x });
  } catch {
    return null;
  }
  const v = evaluate(spec, q);
  let sum = 0;
  for (const id of failingIds) {
    const row = v.outputs.find((r) => r.id === id);
    const o = spec.outputs.find((out) => out.id === id);
    if (!row || !o?.pass || row.outOfDomain || !Number.isFinite(row.value)) return null;
    sum += distanceToWindow(o.pass, row.value);
  }
  return sum;
}

/**
 * 이 파라미터를 인접 격자점으로 옮기면 지금 불합격인 출력 **전부**에 가까워지는 쪽.
 *
 * 🔴 인접점은 `passSweepGrid()` 가 낸 **같은 격자**를 쓴다 — 이산 파라미터(예: 산화 온도
 *    920·1000·1100)에 `step` 산술을 쓰면 존재하지 않는 값을 만든다(2026-08-24 `nearestTemp`
 *    사고와 같은 함정, `LabParam.options` 문서 참조).
 * 🔴 **출력끼리 방향이 갈리면 안내하지 않는다.** 하나는 좋아지고 하나는 나빠지면 `null` —
 *    그럴듯한 절반의 진실보다 침묵이 낫다(D-050).
 * 🔴 이미 전부 합격이면(`failingIds.length === 0`) `null` — 안내할 것이 없다.
 */
export function paramNudgeDirection(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  param: LabParam,
  verdict: LabVerdict,
): NudgeDirection | null {
  const failingIds = verdict.outputs.filter((r) => r.pass === false).map((r) => r.id);
  if (failingIds.length === 0) return null;

  const base = inputs[param.id];
  if (base === undefined || !Number.isFinite(base)) return null;

  const { values: grid } = passSweepGrid(param);
  if (grid.length < 2) return null;

  let idx = grid.indexOf(base);
  if (idx === -1) {
    idx = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < grid.length; i += 1) {
      const gv = grid[i];
      if (gv === undefined) continue;
      const d = Math.abs(gv - base);
      if (d < bestDelta) { bestDelta = d; idx = i; }
    }
  }
  const down = idx > 0 ? grid[idx - 1] : undefined;
  const up = idx < grid.length - 1 ? grid[idx + 1] : undefined;

  const baseDist = failingIds.reduce((sum, id) => {
    const row = verdict.outputs.find((r) => r.id === id);
    const o = spec.outputs.find((out) => out.id === id);
    if (!row || !o?.pass) return sum;
    return sum + distanceToWindow(o.pass, row.value);
  }, 0);

  const upDist = up !== undefined ? failDistanceAt(spec, inputs, param.id, up, failingIds) : null;
  const downDist = down !== undefined ? failDistanceAt(spec, inputs, param.id, down, failingIds) : null;
  const upHelps = upDist !== null && upDist < baseDist;
  const downHelps = downDist !== null && downDist < baseDist;

  if (upHelps && !downHelps) return 'up';
  if (downHelps && !upHelps) return 'down';
  return null;
}
