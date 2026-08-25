/**
 * `check-numeric` 의 **검사 본체**. 🔴 여기에는 `vite` 도 `src/**` 도 import 하지 않는다.
 *
 * 왜 갈랐는가 — **자체검증 때문이다.** 게이트가 실제 모듈을 직접 붙들고 있으면
 * 「일부러 NaN 을 흘려서 잡히는지」를 증명할 방법이 없다(진짜 저장소를 더럽혀야 한다).
 * 그래서 이 파일은 **주입받은 것만** 본다:
 *   · `specs` — `{ key, spec }` 목록 (진짜 24칸이든, 자체검증의 오염된 가짜든)
 *   · `deps`  — `evaluate` · `isOutOfRange` · `formatJudged` · `OutOfLimitError` · `labSceneBindings`
 * `scripts/check-numeric.selftest.mjs` 가 **같은 함수**에 오염된 specs 를 먹여
 * 결함 5종이 각각 잡히는 것을 증명한다. 「있다고 세면서 안 돌리는 장치」를 만들지 않는다.
 *
 * 🔴 이 게이트는 **재기만 한다.** 물리값·수식·임계를 고치지 않는다(CEO 지시 2026-08-22).
 *    발견한 것은 `findings` 로 돌려주고, 차단 여부는 오케스트레이터가 정한다.
 */

// 🔴 스윕 상수는 **공용 정본**에서 받는다. 여기서 다시 선언하면 `check-constants` R1 이다.
import { SWEEP_SEED, CORNER_PARAM_LIMIT } from './sweep-constants.mjs';

/* ───────────────────────── 격자 예산 ─────────────────────────
 * 🔴 「전수」라고 쓰지 않는다. **몇 점을 쟀는지** 숫자로 남긴다.
 * 칸마다 파라미터가 2~10개다. 10개짜리를 파라미터당 11점으로 완전 조합하면
 * 11^10 ≈ 2.6×10^10 점이라 물리적으로 불가능하다. 그래서 다섯 층으로 나눈다.
 *
 * 🔴 객체 한 덩이로 두는 이유 — 개별 UPPER_SNAKE 스칼라로 흩으면 다른 게이트의 상수와
 *    이름·값이 우연히 겹쳐 `check-constants` R1/R3 의 오탐 소재가 된다.
 */
export const NUMERIC_GRID = {
  /** ① 완전 조합의 칸당 상한. 이 안에 들어가는 최대 해상도를 자동으로 고른다. */
  cartesianCap: 200_000,
  /** ② 1D 조밀 스윕 — 파라미터 하나를 min→max 로, 나머지는 initial. */
  axisPoints: 101,
  /** ③ 2D 쌍 스윕 — 모든 파라미터 쌍을 격자로. 상호작용 결함을 잡는다. */
  pairPoints: 11,
  /** ⑤ 격자 사이 — 시드 고정 난수. 격자점에만 없는 결함을 노린다. */
  randomPoints: 20_000,
  /**
   * ⑥ 슬라이더 격자 1D — 🔴 **학습자가 실제로 밟을 수 있는 점만.**
   *    ①~⑤ 는 `p.step` 을 **쓰지 않는다**(균등 분할·연속 난수). 그런데 화면은
   *    `<input type="range" min max step>` 이라 학습자는 `min + k·step` 밖의 값을 만들 수 없다.
   *    그래서 ①~⑤ 만으로 센 결함 수는 「계측기가 닿는 수」이지 「학습자가 닿는 수」가 아니다.
   */
  stepAxisPoints: 101,
  /** ⑦ 슬라이더 격자 2D — 쌍 스윕. 축당 격자점 상한(솎아도 전부 격자점이다). */
  stepPairPoints: 11,
};

/**
 * 슬라이더 격자 판정의 **상대** 허용오차.
 *
 * 왜 상대인가 — 격자값은 `min + k·step` 으로 **합성**된다. k 가 커지면 마지막 자리가 흔들리고
 * (0.1 을 30번 더한 값은 3 이 아니다), 이 저장소의 슬라이더는 10⁻³ ~ 10⁹ 크기대를 함께 쓴다.
 * 절대 허용오차 하나로는 그 폭을 덮지 못한다.
 *
 * 왜 1e-9 인가 — binary64 1 ULP(≈2.22e-16)의 약 4.5×10⁶ 배다. `min + k·step` 이 쌓는 반올림은
 * k 가 수천이어도 수십 ULP 수준이므로 **부동소수 잡음은 전부 흡수**한다. 반대로 이 저장소에서
 * 가장 잘게 썬 슬라이더도 `step/(max−min) ≳ 1e-4` 라, 진짜로 격자 밖인 값(최소 0.5·step 만큼 떨어진다)은
 * 이 문턱보다 다섯 자리 이상 멀다 — **잡음은 흡수하고 진짜 이탈은 통과시키지 않는다.**
 */
export const STEP_GRID_RELATIVE_EPS = 1e-9;

/**
 * 발산 판정 배수 — 선언된 `validRange` 폭의 몇 배를 넘으면 「발산」으로 볼 것인가.
 * 🔴 **절대 임계를 쓰지 않는다.** 시제품 실측(2026-08-22): 절대 1e15 로 걸었더니
 *    `deposition/lab-advanced` 의 `peakCm3`(주입 피크 농도 ≈ 4×10^18 cm⁻³)가 161,562건
 *    잡혔다. 그것은 발산이 아니라 **정상적인 물리량의 크기**다. 그래서 기준을
 *    「그 출력이 스스로 선언한 정의역」에 상대화한다.
 */
export const DIVERGENCE_FACTOR = 1e6;

/** 판정 경계 주변에서 훑을 ULP 폭. `contract.ts` 가 여유를 최대 8 ULP 로 못박고 있다. */
export const BOUNDARY_ULP_SPAN = 8;

/* ───────────────────────── 수치 도구 ───────────────────────── */

/**
 * 결정론적 난수. 🔴 `Math.random` 을 쓰지 않는다 — 재현되지 않으면 계측이 아니다.
 * LCG 식은 `check-passwindow`·`lib/live-judgment` 와 **같은 것**을 쓴다(시드도 공용 정본).
 * 스윕을 쓰는 게이트끼리 같은 조합을 보게 하는 것이 `SWEEP_SEED` 의 존재 이유다.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
}

const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/** IEEE754 다음 표현 가능한 수. `dir > 0` 이면 위쪽. 비유한값은 그대로 돌려준다. */
export function nextAfter(x, dir) {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return dir > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  F64[0] = x;
  U64[0] += dir > 0 === x > 0 ? 1n : -1n;
  return F64[0];
}

/** x 에서 k ULP 떨어진 값. */
export function stepUlp(x, k) {
  let v = x;
  for (let i = 0; i < Math.abs(k); i++) v = nextAfter(v, k > 0 ? 1 : -1);
  return v;
}

/** 🔴 격자 값을 [min, max] 로 **클램프**한다. `min + n·step` 는 끝자리가 흔들려 상한을 1 ULP 넘는다. */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 파라미터 축을 n 점으로. 양 끝은 **정확히** min·max 여야 한다(밀리면 경계를 안 잰 것이다). */
export function axisPoints(p, n) {
  if (n <= 1) return [p.initial];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = clamp(p.min + ((p.max - p.min) * i) / (n - 1), p.min, p.max);
  out[0] = p.min;
  out[n - 1] = p.max;
  return out;
}

/* ─────────────────── 슬라이더 격자(학습자 도달 가능 집합) ───────────────────
 * 🔴 화면의 입력기는 `<input type="range" min max step>` 하나뿐이다. 그것이 내는 값은
 *    `min + k·step` (k 는 0 이상 정수)이고, **`max` 를 넘는 k 는 브라우저가 내주지 않는다.**
 *    그래서 `max` 가 격자 위에 있지 않으면 학습자는 `max` 에 **닿을 수 없다.**
 *    (예: min=0 · max=10 · step=3 → 0·3·6·9 만 나온다. 10 은 못 만든다.)
 */

/** 이 파라미터에 격자가 있는가. step 이 없거나 0 이면 제약이 없다(연속으로 본다). */
function hasStepGrid(p) {
  return Number.isFinite(p.step) && p.step > 0
    && Number.isFinite(p.min) && Number.isFinite(p.max) && p.max > p.min;
}

/** 이 파라미터 크기대에서의 허용오차(절대값). 위 `STEP_GRID_RELATIVE_EPS` 주석 참조. */
function gridEps(p) {
  return Math.max(Math.abs(p.min), Math.abs(p.max), p.step) * STEP_GRID_RELATIVE_EPS;
}

/** 도달 가능한 마지막 배수 k. `+EPS` 는 `(max−min)/step` 이 3 대신 2.9999999996 으로 나오는 경우용. */
function lastStepIndex(p) {
  return Math.floor((p.max - p.min) / p.step + STEP_GRID_RELATIVE_EPS);
}

/** k 번째 격자값. 끝점이 `max` 와 사실상 같으면 **정확히 `max`** 로 스냅한다(합성 오차가 1 ULP 넘긴다). */
function stepValueAt(p, k) {
  const v = p.min + k * p.step;
  if (Math.abs(v - p.max) <= gridEps(p)) return p.max;
  return clamp(v, p.min, p.max);
}

/**
 * 🔴 **슬라이더가 실제로 낼 수 있는 값만** 돌려준다. `axisPoints()` 와 달리 균등 분할이 아니다.
 * 격자점이 `cap` 보다 많으면 k 를 균등 간격으로 **솎는다** — 솎아도 남는 것은 전부 격자점이다.
 * (`axisPoints()` 처럼 min·max 를 강제로 끼워 넣지 않는다. 못 닿는 max 를 끼우면 거짓말이 된다.)
 */
export function stepAxisPoints(p, cap) {
  if (!hasStepGrid(p)) return [clamp(p.initial, p.min, p.max)];
  const kMax = lastStepIndex(p);
  if (cap <= 1 || kMax <= 0) return [stepValueAt(p, 0)];
  const n = kMax + 1;
  if (n <= cap) {
    const out = new Array(n);
    for (let k = 0; k < n; k++) out[k] = stepValueAt(p, k);
    return out;
  }
  const out = [];
  let prev = -1;
  for (let i = 0; i < cap; i++) {
    const k = Math.round((kMax * i) / (cap - 1));
    if (k === prev) continue;
    prev = k;
    out.push(stepValueAt(p, k));
  }
  return out;
}

/**
 * 값을 슬라이더 격자로 스냅한다. `initial` 이 격자 밖이면 브라우저도 그 값을 유지하지 못하므로,
 * 슬라이더 격자 층의 **배경값**은 반드시 이걸 통과시킨다(안 그러면 「도달 가능」층이 스스로 위반한다).
 */
export function snapToStepGrid(p, v) {
  if (!hasStepGrid(p) || !Number.isFinite(v)) return v;
  const kMax = lastStepIndex(p);
  let k = Math.round((v - p.min) / p.step);
  if (k < 0) k = 0;
  if (k > kMax) k = kMax;
  return stepValueAt(p, k);
}

/**
 * 🔴 **도달 가능성 판정기.** 이 입력 조합을 학습자가 슬라이더만으로 만들 수 있는가.
 * 모든 파라미터 값이 자기 격자(`min + k·step`, `k ≥ 0`, `≤ max`) 위에 있어야 참이다.
 *
 * 층과 무관하게 판정한다 — 난수층·코너층 표본이 우연히 격자점에 떨어졌다면 그것도 **도달 가능**이다.
 * 그것이 정직한 분류다(층 이름으로 가르면 같은 입력이 층에 따라 다르게 세어진다).
 */
export function isStepReachable(spec, inputs) {
  for (const p of spec.params) {
    const v = inputs[p.id];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) return false;
    if (!hasStepGrid(p)) continue;
    const eps = gridEps(p);
    if (v < p.min - eps || v > p.max + eps) return false;
    const k = Math.round((v - p.min) / p.step);
    if (k < 0) return false;
    // 🔴 재구성한 격자값과 비교한다. `v % step` 은 min 이 0 이 아니면 틀리고, 음수에서도 틀린다.
    if (Math.abs(p.min + k * p.step - v) > eps) return false;
  }
  return true;
}

/** 완전 조합 해상도 — `cartesianCap` 안에 들어가는 최대 격자. */
export function cartesianResolution(n, cap = NUMERIC_GRID.cartesianCap) {
  for (let r = 11; r >= 2; r--) if (Math.pow(r, n) <= cap) return r;
  return 2;
}

/* ───────────────────────── 표본 생성 ───────────────────────── */

/** 한 칸의 입력 표본을 층별로 만들어 콜백에 흘린다. 층 이름을 함께 넘긴다(어디서 잡혔는지 알아야 한다). */
export function forEachSample(spec, emit) {
  const ps = spec.params;
  const n = ps.length;
  const base = {};
  for (const p of ps) base[p.id] = p.initial;

  // ① 완전 조합 (해상도 적응)
  const R = cartesianResolution(n);
  const axes = ps.map((p) => axisPoints(p, R));
  const total = Math.pow(R, n);
  for (let i = 0; i < total; i++) {
    const inp = {};
    let rem = i;
    for (let d = 0; d < n; d++) {
      inp[ps[d].id] = axes[d][rem % R];
      rem = Math.floor(rem / R);
    }
    emit(inp, 'cartesian');
  }

  // ② 1D 조밀 축 스윕
  for (const p of ps) for (const v of axisPoints(p, NUMERIC_GRID.axisPoints)) emit({ ...base, [p.id]: v }, 'axis');

  // ③ 2D 쌍 스윕
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (const va of axisPoints(ps[a], NUMERIC_GRID.pairPoints)) {
        for (const vb of axisPoints(ps[b], NUMERIC_GRID.pairPoints)) {
          emit({ ...base, [ps[a].id]: va, [ps[b].id]: vb }, 'pair');
        }
      }
    }
  }

  // ④ 코너 전수 — 극단 조합은 빠짐없이 센다.
  if (n <= CORNER_PARAM_LIMIT) {
    for (let m = 0; m < 1 << n; m++) {
      const inp = {};
      for (let d = 0; d < n; d++) inp[ps[d].id] = (m >> d) & 1 ? ps[d].max : ps[d].min;
      emit(inp, 'corner');
    }
  }

  // ⑤ 격자 사이 — 시드 고정 난수. 🔴 격자점에만 없는 결함을 노린다.
  const rand = lcg(SWEEP_SEED + n);
  for (let i = 0; i < NUMERIC_GRID.randomPoints; i++) {
    const inp = {};
    for (const p of ps) inp[p.id] = clamp(p.min + (p.max - p.min) * rand(), p.min, p.max);
    emit(inp, 'random');
  }

  /* ⑥ 슬라이더 격자 — 🔴 **학습자가 실제로 밟을 수 있는 점만.**
   * ①~⑤ 는 `p.step` 을 쓰지 않아 학습자가 만들 수 없는 입력까지 센다. 이 층만은 전부 도달 가능하다.
   * 배경값도 `initial` 을 그대로 쓰지 않고 격자로 스냅한다 — 안 그러면 이 층 자체가 규칙을 깬다.
   */
  const stepBase = {};
  for (const p of ps) stepBase[p.id] = snapToStepGrid(p, p.initial);
  // 1D 조밀 스윕
  for (const p of ps) {
    for (const v of stepAxisPoints(p, NUMERIC_GRID.stepAxisPoints)) emit({ ...stepBase, [p.id]: v }, 'stepgrid');
  }
  // 2D 쌍 스윕
  for (let a = 0; a < n; a++) {
    const va = stepAxisPoints(ps[a], NUMERIC_GRID.stepPairPoints);
    for (let b = a + 1; b < n; b++) {
      const vb = stepAxisPoints(ps[b], NUMERIC_GRID.stepPairPoints);
      for (const x of va) for (const y of vb) emit({ ...stepBase, [ps[a].id]: x, [ps[b].id]: y }, 'stepgrid');
    }
  }
}

/**
 * 🔴 N2 전용 경계 표본. 각 슬라이더의 **min·max·0 근방**을 명시적으로 짚는다.
 * 스윕 격자는 0 을 정확히 밟는다는 보장이 없다 — 0 으로 나누기는 정확히 0 에서 터진다.
 */
export function boundarySamples(spec) {
  const ps = spec.params;
  const base = {};
  for (const p of ps) base[p.id] = p.initial;
  const out = [];
  for (const p of ps) {
    const cand = new Set([p.min, p.max, nextAfter(p.min, 1), nextAfter(p.max, -1), p.min + p.step, p.max - p.step]);
    // 0 근방 — 범위가 0 을 품거나 0 에 붙어 있으면 정확히 0 과 그 양옆을 짚는다.
    if (p.min <= 0 && 0 <= p.max) {
      cand.add(0);
      cand.add(nextAfter(0, 1));
      cand.add(nextAfter(0, -1));
    }
    for (const v of cand) {
      if (!Number.isFinite(v) || v < p.min || v > p.max) continue;
      out.push({ inputs: { ...base, [p.id]: v }, paramId: p.id, value: v });
    }
  }
  return out;
}

/* ───────────────────────── 판정 재현 ─────────────────────────
 * 🔴 `evaluate()` 를 **다시 구현하지 않는다** — 다시 쓰면 게이트가 자기 식을 검사하게 된다.
 *    합격창 비교만 따로 계산해 `evaluate()` 의 답과 **대조**하는 용도로만 쓴다.
 */

/** 합격창 단독 판정(정의역 무시). `spec.ts#evaluate` 의 창 비교와 **같은 부등호**여야 한다. */
export function inPassWindow(o, v) {
  if (!Number.isFinite(v)) return false;
  if (o.pass?.min !== undefined && v < o.pass.min) return false;
  if (o.pass?.max !== undefined && v > o.pass.max) return false;
  return true;
}

/**
 * 선언된 정의역 안인가. 선언이 없으면 볼 것이 없다.
 * 🔴 `domain` 을 **인자로 받는다.** 명세의 `o.domain` 은 24칸 통틀어 1개 출력에만 있고,
 *    나머지 75개는 물리층 `Quantity.validRange` 가 정본이다. 화면(`LabRunner.tsx#judgedText`)이
 *    `o.domain ?? q.validRange` 를 넘기므로 게이트도 같은 것을 넘겨야 **같은 서식기를 재는** 것이 된다.
 */
export function inOutputDomain(domain, v) {
  if (!domain) return Number.isFinite(v);
  return Number.isFinite(v) && v >= domain[0] && v <= domain[1];
}

/**
 * 「화면이 이 수를 합격으로 보여야 하는가」 — `format.ts#displayVerdict` 와 **같은 규칙**이어야 한다.
 * 🔴 정의역을 빼면 안 된다. `outOfRange` 배지가 갈리는 축이 정의역이라, 창만 보면
 *    「정의역 밖인데 창 안」인 값을 합격으로 오판한다(PLN §27-5 E-3).
 */
export function displayVerdict(o, v, domain) {
  return inOutputDomain(domain === undefined ? o.domain : domain, v) && inPassWindow(o, v);
}

/* ───────────────────────── 검사 본체 ───────────────────────── */

/**
 * 검사를 전부 돌린다.
 *
 * @param {object} arg
 * @param {Array<{key:string, spec:object}>} arg.specs 검사 대상 칸
 * @param {object} arg.deps { evaluate, isOutOfRange, formatJudged, OutOfLimitError, labSceneBindings }
 * @param {Array}  [arg.conversions] N4 왕복 환산 대상
 * @param {number} [arg.exampleCap] 결함 종류별 예시 보관 개수
 */
export function runNumericChecks({ specs, deps, conversions = [], exampleCap = 8 }) {
  const { evaluate, isOutOfRange, formatJudged, OutOfLimitError, labSceneBindings } = deps;
  // 🔴 없는 채로 돌면 N3 가 조용히 0건이 된다 — 「0건 통과」와 「안 쟀다」를 섞지 않는다.
  if (typeof formatJudged !== 'function') {
    throw new TypeError('deps.formatJudged 가 없다 — N3 는 src/lib/format.ts#formatJudged 로만 잰다.');
  }

  const stats = {
    cells: specs.length,
    params: 0,
    outputs: 0,
    judgeOutputs: 0,
    samples: 0,
    byLayer: { cartesian: 0, axis: 0, pair: 0, corner: 0, random: 0, stepgrid: 0, boundary: 0 },
    perCell: {},
    outOfLimit: 0,
    outOfRange: 0,
    n1Values: 0,
    n3Checked: 0,
    n3Direction: { screenPassInternalFail: 0, screenFailInternalPass: 0 },
    /** 🔴 N3 를 **도달가능/계측전용**으로 가른다. 총계를 줄이는 것이 아니라 **함께** 적는다. */
    n3Reachable: 0,
    n3InstrumentOnly: 0,
    /** 표기를 바꿔 모순을 푼 횟수. 「결함 0건」과 「부등호로 바꿔 푼 것」은 다른 명제다. */
    n3ResolvedByInequality: 0,
    n3ResolvedByExtraDigit: 0,
    /**
     * 🔴 **되읽을 수 없어 판정을 못 한 표시 문자열** 수(지수·특수 표기 등 `Number(text)` 가 NaN).
     *    「모순 0건」에 섞어 넣으면 「안 쟀다」가 「통과」로 둔갑한다. 그래서 따로 센다.
     */
    n3TextUnparseable: 0,
    /** 도달 가능성 계수 — 전체 표본 중 학습자가 슬라이더로 만들 수 있는 것이 몇 개인가. */
    reachableSamples: 0,
    instrumentOnlySamples: 0,
    n4Checked: 0,
    n4MaxRelError: {},
    n5Checked: 0,
  };
  const findings = {};
  /**
   * 지금 재고 있는 표본이 **학습자 손에 닿는가.** `note()` 가 이걸 읽어 결함을 두 갈래로 센다.
   * `null` = 슬라이더 표본이 아니다(N4 환산·N5 ULP 주입은 입력 조합이 아예 없다).
   */
  let sampleReachable = null;
  /** 🔴 지점을 **집합이 아니라 계수기**로 센다. 「34곳」만 알면 어디를 고칠지 못 정한다. */
  const note = (kind, site, detail) => {
    const f = (findings[kind] ??= { count: 0, reachable: 0, instrumentOnly: 0, noSample: 0, sites: new Map(), examples: [] });
    f.count++;
    // 🔴 **총계는 절대 줄지 않는다.** 도달가능/계측전용은 같은 건수를 두 갈래로 **나눠 적는** 것뿐이다.
    if (sampleReachable === true) f.reachable++;
    else {
      f.instrumentOnly++;
      if (sampleReachable === null) f.noSample++;
    }
    f.sites.set(site, (f.sites.get(site) ?? 0) + 1);
    if (f.examples.length < exampleCap) {
      const tag = sampleReachable === true ? '도달가능' : sampleReachable === false ? '계측전용' : '표본밖';
      f.examples.push(`[${tag}] ${site} — ${detail}`);
    }
  };

  for (const { key, spec } of specs) {
    stats.params += spec.params.length;
    stats.outputs += spec.outputs.length;
    stats.judgeOutputs += spec.outputs.filter((o) => o.role === 'judge' && o.pass).length;
    stats.perCell[key] = 0;

    const probe = (inputs, layer) => {
      stats.samples++;
      stats.byLayer[layer] = (stats.byLayer[layer] ?? 0) + 1;
      stats.perCell[key]++;
      // 🔴 층 이름이 아니라 **값**으로 판정한다 — 난수점이 우연히 격자에 떨어졌으면 그것도 도달 가능이다.
      sampleReachable = isStepReachable(spec, inputs);
      if (sampleReachable) stats.reachableSamples++;
      else stats.instrumentOnlySamples++;

      let out;
      try {
        out = spec.compute(inputs);
      } catch (e) {
        // 🔴 한계선 초과는 **설계된 동작**이다(규정 §4-1). 결함이 아니다.
        //    다만 그 안내 문구가 화면에 그대로 나가므로 **한계값의 유한성은 본다.**
        if (OutOfLimitError && e instanceof OutOfLimitError) {
          stats.outOfLimit++;
          for (const c of e.conditions ?? []) {
            for (const [i, b] of (c.limit ?? []).entries()) {
              if (!Number.isFinite(b) || Math.abs(b) === Number.MAX_VALUE || Math.abs(b) === Number.MIN_VALUE) {
                note(
                  'N1-limit-bound-unrenderable',
                  `${key}/${c.parameter}`,
                  `limit[${i}] = ${b} — 정지 안내가 이 값을 서식 없이 그대로 찍는다 `
                  + `(LabRunner.tsx#conditionText 는 lo·hi 를 formatQuantity 에 넣지 않는다) | ${JSON.stringify(inputs)}`,
                );
              }
            }
          }
          return;
        }
        note('N1-compute-throw', key, `${e?.name}: ${String(e?.message).slice(0, 140)} | ${JSON.stringify(inputs)}`);
        return;
      }

      const vals = {};
      for (const o of spec.outputs) {
        const q = out[o.id];
        if (q === undefined) {
          note('N1-output-missing', `${key}/${o.id}`, `compute() 가 이 출력을 돌려주지 않았다 | ${JSON.stringify(inputs)}`);
          continue;
        }
        const v = typeof q === 'number' ? q : q.value;
        vals[o.id] = v;
        stats.n1Values++;

        /* ── N1 비유한값 ── */
        if (!Number.isFinite(v)) {
          note('N1-nonfinite', `${key}/${o.id}`, `value = ${v} | ${JSON.stringify(inputs)}`);
          continue;
        }
        if (q && q.outOfRange) stats.outOfRange++;

        /* ── N2 발산 ── 선언된 정의역 폭의 DIVERGENCE_FACTOR 배를 넘으면 폭발로 본다. */
        const vr = q && q.validRange;
        if (Array.isArray(vr) && Number.isFinite(vr[0]) && Number.isFinite(vr[1])) {
          const width = Math.abs(vr[1] - vr[0]) || Math.max(Math.abs(vr[0]), Math.abs(vr[1]), 1);
          const slack = width * DIVERGENCE_FACTOR;
          if (v > vr[1] + slack || v < vr[0] - slack) {
            note('N2-divergence', `${key}/${o.id}`, `value = ${v}, validRange = [${vr[0]}, ${vr[1]}] | ${JSON.stringify(inputs)}`);
          }
        }

        /* ── N3 왕복 정확성 ──
         * 화면 배지는 **실값**으로 판정한다(`LabRunner.tsx:73`). 그래서 배지 자체는 뒤집히지 않는다.
         * 뒤집히는 것은 **학습자가 읽는 숫자**다 — 표시 자릿수로 반올림한 값이 합격창의 반대편에
         * 놓이면 화면은 「규격 ≤ X 인데 내 값도 X 인데 불합격」을 보여준다. 그것을 여기서 센다.
         */
        if (o.role === 'judge' && o.pass) {
          stats.n3Checked++;
          // 🔴 **화면이 실제로 쓰는 서식기**로 잰다(`formatQuantity` 가 아니다). 게이트가 화면과
          //    다른 서식기를 재면, 화면이 고쳐졌는지 망가졌는지 둘 다 알 수 없다.
          /* 🔴 **`domain` 은 화면과 똑같이 만든다** — `LabRunner.tsx#judgedText` 는
           *    `o.domain ?? q.validRange` 를 넘긴다. 여기서 `o.domain` 만 넘기면 명세가
           *    `domain` 을 선언하지 않은 출력(24칸 통틀어 75/76)에서 **게이트가 화면과 다른
           *    서식기를 재게 된다.** 그러면 「0건」이 화면의 0건이 아니다. */
          const domain = o.domain ?? (q && q.validRange);
          const shown = formatJudged(v, { digits: o.digits, pass: o.pass, domain, mode: o.displayMode });
          if (shown.kind === 'above' || shown.kind === 'below') {
            // 🔴 **모순이 아니다** — 문자열이 한계선의 참인 쪽을 말하고 있다("> 35" 는 거짓이 아니다).
            //    다만 「결함 0건」과 「표기를 바꿔 푼 것」은 다른 명제라서 **따로 센다.**
            stats.n3ResolvedByInequality++;
          } else if (shown.kind === 'value') {
            if (shown.escalated) stats.n3ResolvedByExtraDigit++;
            const back = Number(shown.text);
            if (!Number.isFinite(back)) stats.n3TextUnparseable++;
            else {
              const rawPass = displayVerdict(o, v, domain);
              const shownPass = displayVerdict(o, back, domain);
              if (rawPass !== shownPass) {
                // 🔴 방향을 갈라 센다. **「화면 합격 · 내부 불합격」이 훨씬 나쁘다** —
                //    학습자가 자기 값이 맞았다고 믿는다. 반대는 억울할 뿐 오해는 아니다.
                stats.n3Direction[shownPass ? 'screenPassInternalFail' : 'screenFailInternalPass']++;
                if (sampleReachable === true) stats.n3Reachable++;
                else stats.n3InstrumentOnly++;
                note(
                  'N3-display-contradicts-verdict',
                  `${key}/${o.id}`,
                  `내부 ${v} → ${rawPass ? '합격' : '불합격'} · 화면 "${shown.text}" → ${shownPass ? '합격' : '불합격'} `
                  + `(digits=${shown.digits}, escalated=${shown.escalated}, pass=${JSON.stringify(o.pass)}`
                  + `${o.domain ? `, domain=${JSON.stringify(o.domain)}` : ''}) | ${JSON.stringify(inputs)}`,
                );
              }
            }
          }
        }
      }

      /* ── 판정 경로가 던지지 않는가 ── */
      let verdict;
      try {
        verdict = evaluate(spec, out);
      } catch (e) {
        note('N1-evaluate-throw', key, `${e?.name}: ${String(e?.message).slice(0, 140)}`);
      }
      if (verdict) {
        for (const row of verdict.outputs) {
          if (!Number.isFinite(row.value) && !findings['N1-nonfinite']?.sites.has(`${key}/${row.id}`)) {
            note('N1-verdict-nonfinite', `${key}/${row.id}`, `evaluate() 가 ${row.value} 를 실어 보냈다 | ${JSON.stringify(inputs)}`);
          }
        }
      }

      /* ── 씬 매핑 경로 (화면 도달) ── */
      if (labSceneBindings) {
        for (const b of labSceneBindings(spec)) {
          try {
            for (const [k, v] of Object.entries(b.map(inputs, vals))) {
              if (!Number.isFinite(v)) note('N1-scene-nonfinite', `${key}/scene:${b.sceneId}/${k}`, `= ${v} | ${JSON.stringify(inputs)}`);
            }
          } catch (e) {
            note('N1-scene-throw', `${key}/scene:${b.sceneId}`, `${e?.name}: ${String(e?.message).slice(0, 140)}`);
          }
        }
      }

      /* ── 차트 경로 (화면 도달) ── */
      for (const c of spec.charts ?? []) {
        try {
          for (const s of c.build(inputs, vals)) {
            for (const pt of s.points) {
              if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
                note('N1-chart-nonfinite', `${key}/chart:${c.id}/${s.id}`, `(${pt.x}, ${pt.y}) | ${JSON.stringify(inputs)}`);
              }
            }
          }
        } catch (e) {
          note('N1-chart-throw', `${key}/chart:${c.id}`, `${e?.name}: ${String(e?.message).slice(0, 140)}`);
        }
      }
    };

    /* ── 격자 스윕 ── */
    forEachSample(spec, probe);
    /* ── N2 명시 경계 표본 ── */
    for (const b of boundarySamples(spec)) probe(b.inputs, 'boundary');

    /* 🔴 여기부터는 **슬라이더 표본이 아니다** — 출력값을 판정기에 직접 주입한다.
     *    도달 가능성을 물을 대상이 없으므로 `null` 로 돌린다(「도달 불가」라고 단정하지 않는다). */
    sampleReachable = null;

    /* ── N5 판정 경계 ── 합격 임계 **바로 위·아래**에서 판정이 일관되는가. */
    for (const o of spec.outputs) {
      if (o.role !== 'judge' || !o.pass) continue;
      for (const side of ['min', 'max']) {
        const T = o.pass[side];
        if (T === undefined || !Number.isFinite(T)) continue;
        for (let k = -BOUNDARY_ULP_SPAN; k <= BOUNDARY_ULP_SPAN; k++) {
          const v = stepUlp(T, k);
          stats.n5Checked++;
          const inDomain = !o.domain || (v >= o.domain[0] && v <= o.domain[1]);
          const expected = inDomain && inPassWindow(o, v);
          const got = evaluate(spec, { [o.id]: v }).outputs.find((r) => r.id === o.id)?.pass;
          if (got !== expected) {
            note('N5-boundary-inconsistent', `${key}/${o.id}`, `pass.${side} = ${T}, ${k >= 0 ? '+' : ''}${k} ULP → ${v}: 기대 ${expected} · 실제 ${got}`);
          }
        }
      }
    }

    /* ── N5-b `isOutOfRange` 모드 정합 ── tolerant 가 exact 보다 엄격해지면 안 된다. */
    for (const o of spec.outputs) {
      if (!o.domain) continue;
      for (const bound of o.domain) {
        for (let k = -BOUNDARY_ULP_SPAN; k <= BOUNDARY_ULP_SPAN; k++) {
          const v = stepUlp(bound, k);
          stats.n5Checked++;
          if (isOutOfRange(v, o.domain[0], o.domain[1], 'tolerant') && !isOutOfRange(v, o.domain[0], o.domain[1], 'exact')) {
            note('N5-tolerance-inverted', `${key}/${o.id}`, `${v} 가 tolerant 에서만 이탈로 잡힌다 (domain=[${o.domain[0]}, ${o.domain[1]}], ${k} ULP)`);
          }
        }
      }
    }
  }

  /* ── N4 단위 환산 무손실 ── 🔴 슬라이더 입력이 아니다(상수 짝의 왕복이다) → 표본밖. */
  sampleReachable = null;
  for (const conv of conversions) {
    const tol = Math.pow(10, -(conv.significantDigits ?? 12));
    for (const x of conv.samples) {
      stats.n4Checked++;
      let back;
      try {
        back = conv.backward(conv.forward(x));
      } catch (e) {
        note('N4-roundtrip-throw', conv.name, `x = ${x}: ${e?.name}: ${String(e?.message).slice(0, 120)}`);
        continue;
      }
      if (!Number.isFinite(back)) {
        note('N4-roundtrip-nonfinite', conv.name, `x = ${x} → ${back}`);
        continue;
      }
      const rel = x === 0 ? Math.abs(back) : Math.abs((back - x) / x);
      // 🔴 통과·실패만 내지 않고 **실측 최대 상대오차를 남긴다.** 「0건」만 적으면
      //    여유가 얼마나 남았는지 다음 사람이 모른다.
      stats.n4MaxRelError[conv.name] = Math.max(stats.n4MaxRelError[conv.name] ?? 0, rel);
      if (rel > tol) {
        note('N4-roundtrip-loss', conv.name, `x = ${x} → ${back} (상대오차 ${rel.toExponential(3)} > 1e-${conv.significantDigits ?? 12})`);
      }
    }
  }

  return { stats, findings };
}

/**
 * 보고용 — findings 를 사람이 읽는 줄로.
 * 🔴 **지점 목록을 전부 찍는다.** 「지점 34곳」만 적으면 어디를 고칠지 정할 수 없다.
 * 🔴 **총계를 먼저 적고 그 다음에 가른다.** 도달가능/계측전용은 총계를 깎는 장치가 아니다 —
 *    A + B = 총 N 이 항상 성립한다. 「도달가능 0건」이어도 규칙 위반 N건은 그대로 N건이다.
 */
export function formatFindings(findings, indent = '  ', siteListCap = 60) {
  const lines = [];
  if (Object.keys(findings).length) {
    lines.push(
      `${indent}※ 도달가능 = 슬라이더(min+k·step)만으로 학습자가 만들 수 있는 입력에서 잡힌 건.`
      + ` 계측전용 = 격자 사이 값 등 학습자가 못 만드는 입력(그중 「표본밖」은 입력 조합 자체가 없는 N4 환산·N5 ULP 주입).`,
    );
    lines.push(`${indent}※ 🔴 가른 것은 **보고**뿐이다 — 총계는 깎지 않는다. 도달가능이 0건이어도 규칙 위반은 총계만큼 그대로다.`);
  }
  for (const [kind, f] of Object.entries(findings)) {
    const split = `(도달가능 ${(f.reachable ?? 0).toLocaleString()}건 · 계측전용 ${(f.instrumentOnly ?? 0).toLocaleString()}건`
      + (f.noSample ? ` — 그중 표본밖 ${f.noSample.toLocaleString()}건` : '')
      + ')';
    lines.push(`${indent}✗ ${kind} — 총 ${f.count.toLocaleString()}건 ${split} · 지점 ${f.sites.size}곳`);
    for (const ex of f.examples) lines.push(`${indent}    예: ${ex}`);
    if (f.count > f.examples.length) lines.push(`${indent}    … 예시 외 ${(f.count - f.examples.length).toLocaleString()}건`);
    const sorted = [...f.sites.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`${indent}    ── 지점별 건수 ──`);
    for (const [site, n] of sorted.slice(0, siteListCap)) lines.push(`${indent}      ${site} · ${n.toLocaleString()}건`);
    if (sorted.length > siteListCap) lines.push(`${indent}      … 외 ${sorted.length - siteListCap}곳`);
  }
  return lines;
}
