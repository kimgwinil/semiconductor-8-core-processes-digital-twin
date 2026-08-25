/**
 * 🔴 회귀 게이트 — **부동소수점 반올림을 「성립하지 않는 값」이라 부르지 않는다.**
 *                  그리고 **그 대가로 진짜 이탈을 놓치지도 않는다.**
 *
 * 사고 경위(2026-08-22 DSN 실측). `etch/lab-advanced` 의 `residueIndex` 가
 * `validRange` 상한 **220** 에 대해 **220.00000000000003** 을 냈다. 초과폭은
 * 2.842170943040401e-14 — 220 에서의 **정확히 1 ULP** 다. 참값은 220 이고, 어긋난 원인은
 * 물리가 아니라 십진 리터럴이 binary64 로 파싱될 때의 반올림이다. 그런데 종전 판정
 * (`value > hi`)은 이것을 이탈로 보고 화면에 `lab.outOfRange`(「한계선 초과」)를 띄웠다.
 * **거짓말이다.**
 *
 * 🔴 이 파일이 지키는 것은 **두 방향이고, 둘 다 필요하다.**
 *   ① 반올림 수준의 초과는 봐준다 — 그래야 화면이 거짓말을 멈춘다.
 *   ② **그 폭 밖은 전부 잡는다** — 음의 선폭·음의 표준편차·의미 있는 상한 초과.
 *      ①만 지키는 완화는 개선이 아니라 **오늘 잡은 결함을 되돌리는 것**이다.
 *      그래서 「봐주는 폭이 정확히 어디서 끝나는가」를 ULP 단위로 못 박는다 —
 *      사람이 「얼마나 봐주는지」를 숫자로 말할 수 있어야 한다.
 *
 * 🔴 `validRange` 는 **손대지 않았다.** 고친 것은 **비교 방식**뿐이다. 어떤 경계가 틀렸다는
 *    판단은 이 파일의 소관이 아니다(별건).
 *
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import '@/models/registry';
import { registerAllLabs, labSpec } from '@/models/labs';
import type { LabSpec, LabStage } from '@/models/labs/spec';
import {
  BOUNDARY_EPSILON_MULTIPLE, boundaryTolerance, isOutOfRange, OutOfLimitError,
} from '@/models/contract';
import { scheilAxialConcentration, meltConcentrationFromSolid } from '@/models/physics/wafer/czochralski';
import { gpcAt } from '@/models/physics/deposition/ald';
import { kohEtchRate, anisotropyDegree } from '@/models/physics/etch/wetEtch';
import { rieLag } from '@/models/physics/etch/dryEtch';
import { defectLevel, defectDensityFromPoissonYield } from '@/models/physics/eds/yieldModels';

beforeAll(() => { registerAllLabs(); });

/* ───────────────────────────── 도구 ───────────────────────────── */

/**
 * `x` 에서 부동소수점 눈금(ULP)을 `n` 칸 움직인 값. ECMAScript 에 `nextafter` 가 없어서
 * 비트를 직접 센다. **양수에서만 쓴다** — 양의 유한수는 비트열이 값 순서와 같다.
 */
const bits = new DataView(new ArrayBuffer(8));
function stepUlp(x: number, n: number): number {
  bits.setFloat64(0, x);
  const raw = (BigInt(bits.getUint32(0)) << 32n) | BigInt(bits.getUint32(4));
  const moved = raw + BigInt(n);
  bits.setUint32(0, Number(moved >> 32n));
  bits.setUint32(4, Number(moved & 0xffffffffn));
  return bits.getFloat64(0);
}

/** `x` 한 칸의 크기. */
const ulpOf = (x: number): number => stepUlp(Math.abs(x), 1) - Math.abs(x);

/** 슬라이더 초기값 그대로의 입력 묶음. */
function defaults(spec: LabSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
}

/** 실습 출력의 **실제** `validRange` 를 살아 있는 계산에서 읽어 온다(명세를 베끼지 않는다). */
function liveRange(processId: string, stage: LabStage, outputId: string): [number, number] {
  const spec = labSpec(processId, stage);
  expect(spec, `${processId}/${stage} 실습이 없다`).toBeDefined();
  const qs = spec!.compute(defaults(spec!));
  const q = qs[outputId];
  expect(q, `${processId}/${stage} 의 ${outputId} 출력이 없다`).toBeDefined();
  return q!.validRange;
}

/** 이 변경 **이전**의 판정. 완화만 했는지(엄격해지지 않았는지) 대조하는 데 쓴다. */
const strictOut = (v: number, lo: number, hi: number): boolean =>
  !Number.isFinite(v) || v < lo || v > hi;

/* ══════════════ ① 봐줘야 하는 것 — 반올림은 물리가 아니다 ══════════════ */

describe('① 반올림 수준의 초과는 이탈이 아니다', () => {
  it('DSN 이 실측한 220.00000000000003 은 220 을 정확히 1 ULP 넘는다', () => {
    const observed = 220.00000000000003;
    expect(observed, '이 리터럴이 220 과 구분되지 않는다 — 사고 재현이 불가능하다').toBeGreaterThan(220);
    expect(observed - 220).toBe(ulpOf(220));
    expect(stepUlp(220, 1)).toBe(observed);
  });

  it('그 값은 [0, 220] 에서 — 여유 모드로 — 이탈이 아니다', () => {
    expect(
      isOutOfRange(220.00000000000003, 0, 220, 'tolerant'),
      '1 ULP 반올림을 「성립하지 않는 값」이라 부르고 있다',
    ).toBe(false);
    // 🔴 그리고 **기본값은 엄격**이다. 같은 값이 정의역 관문에서는 잡힌다 — 의도된 비대칭이다.
    expect(isOutOfRange(220.00000000000003, 0, 220), '기본값이 여유 쪽으로 넘어갔다').toBe(true);
    expect(isOutOfRange(220.00000000000003, 0, 220, 'exact')).toBe(true);
  });

  it('🔴 살아 있는 실습이 실제로 그 값을 낸다 — etch/lab-advanced, OE=0 · f=40', () => {
    const spec = labSpec('etch', 'lab-advanced');
    expect(spec, 'etch/lab-advanced 실습이 없다').toBeDefined();
    if (!spec) return;

    // 오버에치를 최소로, 패시베이션 가스비를 최대로 — 잔사 지수가 상한에 닿는 자리.
    const q = spec.compute({ ...defaults(spec), overetchPct: 0, passivationPct: 40 })['residueIndex'];
    expect(q, 'residueIndex 출력이 없다').toBeDefined();
    if (!q) return;

    const hi = q.validRange[1];

    // 전제 — 이 값이 **정말로** 선언된 상한을 넘는가. 식이 고쳐져 초과가 사라졌다면
    // 이 회귀 테스트는 의미를 잃은 채 통과하면 안 된다. 그래서 전제를 단언으로 박는다.
    expect(q.value, `residueIndex 가 더는 상한 ${hi} 을 넘지 않는다 — 이 테스트를 재검토하라`)
      .toBeGreaterThan(hi);
    // 그런데 초과폭은 반올림 한 칸이다.
    expect((q.value - hi) / ulpOf(hi), '초과폭이 1 ULP 가 아니다 — 원인이 반올림이 아닐 수 있다').toBe(1);

    // 본체 — 그러므로 화면은 이것을 「한계선 초과」라고 말하면 안 된다.
    expect(q.outOfRange, `${q.value} 는 상한을 1 ULP 넘었을 뿐인데 이탈로 표시된다`).toBe(false);
  });
});

/* ══════════ ② 🔴 여전히 잡히는 것 — 봐주는 것은 반올림뿐이다 ══════════ */

describe('② 진짜 이탈은 그대로 잡힌다', () => {
  it('음수 선폭 — photo/lab-advanced cdNm 은 아무리 작은 음수라도 이탈이다', () => {
    const [lo, hi] = liveRange('photo', 'lab-advanced', 'cdNm');
    expect(lo, 'cdNm 의 하한이 0 이 아니다 — 이 테스트의 전제가 깨졌다').toBe(0);

    // 게이트가 실제로 도달한 값(check-live-judgment 2026-08-22 실측: 최저 −16.9664 nm).
    // 🔴 **여유를 켠 채로** 잡혀야 한다 — 그게 강한 주장이다(엄격 모드는 당연히 잡는다).
    expect(isOutOfRange(-16.9664, lo, hi, 'tolerant'), '음의 선폭이 정상으로 판정된다').toBe(true);
    // 표현 가능한 **가장 작은** 음수까지 잡힌다 — 0 경계에는 여유가 0 이기 때문이다.
    expect(isOutOfRange(-Number.MIN_VALUE, lo, hi, 'tolerant'), '비정규수 크기의 음수를 봐주고 있다').toBe(true);
    expect(isOutOfRange(-1e-300, lo, hi, 'tolerant')).toBe(true);
  });

  it('음수 표준편차 — wafer/lab-applied diameterSigmaMm 도 같다', () => {
    const [lo, hi] = liveRange('wafer', 'lab-applied', 'diameterSigmaMm');
    expect(lo, 'σ_D 의 하한이 0 이 아니다 — 이 테스트의 전제가 깨졌다').toBe(0);

    expect(isOutOfRange(-1, lo, hi, 'tolerant'), '음의 표준편차가 정상으로 판정된다').toBe(true);
    expect(isOutOfRange(-0.1, lo, hi, 'tolerant'), '2026-08-21 에 잡은 σ_D = −0.1 이 되살아났다').toBe(true);
    expect(isOutOfRange(-Number.MIN_VALUE, lo, hi, 'tolerant')).toBe(true);
  });

  it('상한을 의미 있게 넘는 값 — 20 % 초과는 당연히 이탈이다', () => {
    const [lo, hi] = liveRange('etch', 'lab-advanced', 'residueIndex');
    expect(isOutOfRange(hi * 1.2, lo, hi, 'tolerant')).toBe(true);
    expect(isOutOfRange(hi + 1, lo, hi, 'tolerant')).toBe(true);
    // 표시 자릿수(digits: 2)로 구분되는 최소폭조차 봐주지 않는다.
    expect(isOutOfRange(hi + 0.005, lo, hi, 'tolerant'), '표시상 보이는 초과를 봐주고 있다').toBe(true);
  });

  it('🔴 경계 바로 바깥 — 봐주는 폭이 어디서 끝나는지 ULP 로 못 박는다', () => {
    const [lo, hi] = liveRange('etch', 'lab-advanced', 'residueIndex');
    expect(hi, '이 케이스는 상한 220 을 전제로 쓰였다').toBe(220);

    // 🔴 실측한 선(2026-08-22 DEV): **7 칸까지 봐주고 8 칸부터 잡는다.**
    //    산술상 여유는 6.875 ULP 인데(`tol/ulp` 아래에서 확인), `hi + tol` **합 자체가
    //    반올림**되어 정확히 7 ULP 지점에 놓인다. 그래서 7 칸은 「초과」가 아니라 「같음」이 되고,
    //    엄격 부등호(`>`)에서 통과한다. 짐작이 아니라 재서 적었다.
    const tol = boundaryTolerance(hi);
    expect(tol / ulpOf(hi), '여유의 ULP 환산이 달라졌다 — 아래 선을 다시 재라').toBe(6.875);
    expect(hi + tol, '합의 반올림 위치가 달라졌다').toBe(stepUlp(hi, 7));

    for (const n of [1, 2, 4, 6, 7]) {
      expect(isOutOfRange(stepUlp(hi, n), lo, hi, 'tolerant'), `${n} ULP 초과가 이탈로 잡힌다`).toBe(false);
      // 엄격 모드에서는 같은 값이 전부 잡힌다.
      expect(isOutOfRange(stepUlp(hi, n), lo, hi, 'exact')).toBe(true);
    }
    // 🔴 잡는 쪽 — 8 칸부터. **여기가 봐주는 폭의 끝이다.**
    for (const n of [8, 10, 20, 100]) {
      expect(isOutOfRange(stepUlp(hi, n), lo, hi, 'tolerant'), `${n} ULP 초과를 봐주고 있다`).toBe(true);
    }

    // 사람이 읽을 수 있게: 임계의 몇 배짜리 이탈이 잡히는가.
    expect((stepUlp(hi, 8) - hi) / tol, '8 ULP 이탈이 임계의 1 배를 넘지 않는다').toBeGreaterThan(1);
    expect((stepUlp(hi, 20) - hi) / tol, '20 ULP 이탈은 임계의 2 배를 넘어야 한다').toBeGreaterThan(2);

    // 🔴 봐주는 폭의 **절대 상한** — 어떤 경계에서도 8 ULP 를 넘지 않는다.
    //    `Number.EPSILON·|x|` 가 binade 안에서 1~2 ULP 이므로 4 배는 4~8 ULP 다.
    for (const b of [1, 10, 220, 400, 1e-9, 1e25]) {
      expect(boundaryTolerance(b) / ulpOf(b), `${b} 에서 여유가 4~8 ULP 를 벗어났다`)
        .toBeGreaterThanOrEqual(4);
      expect(boundaryTolerance(b) / ulpOf(b)).toBeLessThanOrEqual(8);
    }
  });

  it('🔴 완화만 했다 — 종전에 정상이던 값을 이탈로 바꾸지 않는다', () => {
    const probes = [-1e300, -1, -1e-300, 0, 1e-300, 0.5, 1, 219, 220, 221, 1e300];
    const ranges: Array<[number, number]> = [
      [0, 220], [0, 1], [0, 400], [-1, 1], [1, 5000],
      [0, Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY, 25.5],
      [0, Number.MAX_VALUE], [Number.MIN_VALUE, Number.MAX_VALUE],
    ];
    let checked = 0;
    for (const [lo, hi] of ranges) {
      for (const v of probes) {
        if (!strictOut(v, lo, hi)) {
          expect(isOutOfRange(v, lo, hi, 'tolerant'), `${v} ∈ [${lo}, ${hi}] 이던 값이 새로 이탈이 됐다`).toBe(false);
        }
        checked++;
      }
    }
    expect(checked, '대조를 하나도 못 했다').toBeGreaterThan(0);
  });
});

/* ══════════════════ ③ 0 경계 — 여기가 가장 중요하다 ══════════════════ */

describe('③ 0 경계는 엄격하다 — 여유가 0 이다', () => {
  it('0 과 −0 은 여유를 받지 않는다', () => {
    expect(boundaryTolerance(0)).toBe(0);
    expect(boundaryTolerance(-0)).toBe(0);
  });

  it('하한이 0 이면 크기와 무관하게 모든 음수가 이탈이다', () => {
    for (const v of [-Number.MIN_VALUE, -1e-300, -1e-16, -1e-9, -0.1, -1, -16.9664, -1e300]) {
      expect(isOutOfRange(v, 0, 400, 'tolerant'), `${v} 가 하한 0 을 통과했다`).toBe(true);
    }
    // 경계 자체와 그 안쪽은 정상이다 — 반대 방향으로 거짓말하지 않는다.
    expect(isOutOfRange(0, 0, 400, 'tolerant')).toBe(false);
    expect(isOutOfRange(-0, 0, 400, 'tolerant')).toBe(false);
    expect(isOutOfRange(Number.MIN_VALUE, 0, 400, 'tolerant')).toBe(false);
  });

  it('상한이 0 인 경우도 같다', () => {
    expect(isOutOfRange(Number.MIN_VALUE, -10, 0, 'tolerant'), '상한 0 을 넘은 최소 양수를 봐주고 있다').toBe(true);
    expect(isOutOfRange(0, -10, 0, 'tolerant')).toBe(false);
  });

  it('🔴 실측 기록 — `max(|value|, |bound|)` 형이 음수를 봐준다는 말은 사실이 아니다', () => {
    // 2026-08-22 DEV. 「max 를 쓰면 lo=0 에서 음수 이탈을 봐준다」는 통설을 실제로 재보았다.
    // 조건은 `v < 0 − K·|v|`, 즉 `|v| > K·|v|` 이고 K < 1 이므로 **음수는 전부 잡힌다.**
    // 우리가 |bound| 를 쓰는 이유는 판정이 갈려서가 아니라 **봐주는 폭이 명세의 성질이어야**
    // 하기 때문이다. 근거를 틀리게 적어 두지 않으려고 이 사실을 테스트로 남긴다.
    const K = BOUNDARY_EPSILON_MULTIPLE * Number.EPSILON;
    expect(K, 'K 가 1 이상이면 위 논증이 무너진다').toBeLessThan(1);

    const maxForm = (v: number, lo: number, hi: number): boolean => {
      const tol = (b: number): number => {
        const s = Math.max(Math.abs(v), Math.abs(b));
        return Number.isFinite(s) ? K * s : 0;
      };
      return !Number.isFinite(v) || v < lo - tol(lo) || v > hi + tol(hi);
    };
    for (const v of [-Number.MIN_VALUE, -1e-300, -1, -16.9664, -1e300]) {
      expect(maxForm(v, 0, 400), `max 형이 ${v} 를 봐준다면 통설이 맞는 것이다`).toBe(true);
      expect(isOutOfRange(v, 0, 400, 'tolerant')).toBe(true);
    }
  });
});

/* ═══════════════════ ④ ±Infinity · NaN ═══════════════════ */

describe('④ ±Infinity 경계와 NaN 에서 깨지지 않는다', () => {
  it('무한 경계는 여유 0 — 산술을 아예 하지 않는다', () => {
    expect(boundaryTolerance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(boundaryTolerance(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(boundaryTolerance(Number.NaN)).toBe(0);
  });

  it('편측 정의역이 정상 동작한다 — [−Infinity, 25.5]', () => {
    const lo = Number.NEGATIVE_INFINITY;
    expect(isOutOfRange(-1e300, lo, 25.5, 'tolerant'), '아래가 열린 정의역에서 큰 음수가 막혔다').toBe(false);
    expect(isOutOfRange(25.5, lo, 25.5, 'tolerant')).toBe(false);
    expect(isOutOfRange(30, lo, 25.5, 'tolerant'), '열린 쪽이 아닌 상한을 넘었는데 통과했다').toBe(true);
  });

  it('편측 정의역이 정상 동작한다 — [0, +Infinity]', () => {
    const hi = Number.POSITIVE_INFINITY;
    expect(isOutOfRange(1e300, 0, hi, 'tolerant')).toBe(false);
    expect(isOutOfRange(-1e-300, 0, hi, 'tolerant'), '위가 열린 정의역에서 음수를 봐줬다').toBe(true);
    // 발산은 「정의역 안에 착지」가 아니다 — 상한이 무한이어도 이탈이다.
    expect(isOutOfRange(Number.POSITIVE_INFINITY, 0, hi, 'tolerant'), '발산한 계산이 정상으로 판정된다').toBe(true);
  });

  it('NaN 값은 이탈이다 — 봐주면 깨진 계산이 정상으로 표시된다', () => {
    expect(isOutOfRange(Number.NaN, 0, 1, 'tolerant')).toBe(true);
    expect(isOutOfRange(Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it('🔴 NaN 경계도 이탈이다 — 종전에는 무엇이든 통과시켰다', () => {
    // `v < NaN` 도 `v > NaN` 도 false 라, 망가진 명세가 조용히 「전부 정상」이 됐다.
    expect(isOutOfRange(1e300, Number.NaN, 10, 'tolerant')).toBe(true);
    expect(isOutOfRange(5, 0, Number.NaN, 'tolerant')).toBe(true);
  });

  it('실습 24칸의 모든 출력에서 여유 계산이 NaN 을 만들지 않는다', () => {
    let checked = 0;
    for (const key of ['etch', 'photo', 'wafer', 'eds', 'metal', 'oxidation', 'deposition', 'packaging']) {
      for (const stage of ['lab-basic', 'lab-applied', 'lab-advanced'] as LabStage[]) {
        const spec = labSpec(key, stage);
        if (!spec) continue;
        const qs = spec.compute(defaults(spec));
        for (const [id, q] of Object.entries(qs)) {
          const [lo, hi] = q.validRange;
          const loEdge = lo - boundaryTolerance(lo);
          const hiEdge = hi + boundaryTolerance(hi);
          expect(Number.isNaN(loEdge), `${key}/${stage} ${id}: 하한 여유가 NaN 이다`).toBe(false);
          expect(Number.isNaN(hiEdge), `${key}/${stage} ${id}: 상한 여유가 NaN 이다`).toBe(false);
          // 여유는 경계를 **넓히기만** 한다 — 좁히면 정상값을 이탈로 만든다.
          expect(loEdge <= lo, `${key}/${stage} ${id}: 하한이 되레 좁아졌다`).toBe(true);
          expect(hiEdge >= hi, `${key}/${stage} ${id}: 상한이 되레 좁아졌다`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked, '출력을 하나도 못 봤다').toBeGreaterThan(100);
  });
});

/* ═══════════ ⑤ 상수의 근거가 코드와 어긋나지 않는다 ═══════════ */

describe('⑤ 임계는 감사 가능한 숫자다', () => {
  it('배수는 4 다 — 상쇄 없는 연산 8 회(8u) 분량', () => {
    expect(BOUNDARY_EPSILON_MULTIPLE).toBe(4);
    // 이 상수 1 단위 = Number.EPSILON = 2u. 따라서 4 단위 = 8u.
    expect(BOUNDARY_EPSILON_MULTIPLE * Number.EPSILON).toBe(8 * (Number.EPSILON / 2));
  });

  it('경계마다 봐주는 폭을 숫자로 말할 수 있다', () => {
    // [0, 220] 이 봐주는 폭은 들어온 값과 **무관하게** 이 하나로 고정이다.
    expect(boundaryTolerance(220)).toBe(1.9539925233402755e-13);
    expect(boundaryTolerance(0)).toBe(0);
  });

  it('폭은 경계의 크기에 비례한다 — 34 자릿수를 하나의 규칙으로 덮는다', () => {
    // 막 두께 규모부터 이온 총수 규모까지, 상대폭은 같다.
    for (const b of [1e-9, 1, 220, 400, 1e8, 1e25]) {
      expect(boundaryTolerance(b) / b).toBeCloseTo(BOUNDARY_EPSILON_MULTIPLE * Number.EPSILON, 30);
      // 그리고 언제나 1 ULP 이상이다 — 아니면 반올림 한 칸조차 못 봐준다.
      expect(boundaryTolerance(b), `${b} 에서 여유가 1 ULP 미만이다`).toBeGreaterThanOrEqual(ulpOf(b));
    }
  });
});

/* ══════ ⑥ 🔴 두 용도를 가른다 — 여유는 연속 경계에만, 정의역 관문은 엄격 ══════ */

/**
 * 사고 경위(2026-08-22 오후). ULP 여유가 `assertWithin` 까지 흘러가 **정의역 관문을 뚫었다.**
 * `physics/wafer/czochralski.ts:94` 의 `assertWithin('k0', …, [1e-6, 1])` 이 대표 사례다:
 * Scheil 식 `C_s = k₀·C₀·(1−X)^(k₀−1)` 에서 **k₀ = 1 은 지수의 부호 전환점**이라,
 * 1 ULP 만 넘어도 `validRange` 가 **뒤집힌다**(hi < lo). 그런데 값은 유한하므로
 * A14(NaN·Infinity 검사)도 못 잡는다 — **전부 초록인 채로 틀린다.**
 *
 * 🔴 여기서 지키는 것: **k₀ = 1(정확히)은 정당한 값이라 계속 통과해야 하고,
 *    k₀ = 1 + 1 ULP 는 반드시 차단되어야 한다.** 둘 다 못 박는다.
 */
describe('⑥ 정의역 관문은 엄격하다 — 「식의 모양이 바뀌는 경계」', () => {
  const scheil = (k0: number) =>
    scheilAxialConcentration({ k0, meltConcentrationCm3: 1e17, solidFraction: 0.5 });

  it('🔴 k₀ = 1 (정확히) 은 정당한 값이다 — 계속 통과해야 한다', () => {
    const q = scheil(1);
    const [lo, hi] = q.validRange;
    expect(hi).toBeGreaterThanOrEqual(lo);          // 뒤집히지 않는다
    expect(hi - lo).toBe(0);                         // k₀=1 은 편석 없음 → 폭 0 이 정상이다
    expect(q.outOfRange, 'k₀=1 의 정당한 출력이 이탈로 표시된다').toBe(false);
  });

  it('🔴 k₀ = 1 + 1 ULP 는 차단된다 — 여유가 관문을 뚫지 못한다', () => {
    expect(() => scheil(stepUlp(1, 1))).toThrow(OutOfLimitError);
  });

  it('🔴 1 ULP 부터 5 ULP 까지 전부 차단된다 — 여유 폭(4 ULP)을 넘어서 막는다', () => {
    // 여유를 켰다면 경계 1 에서 폭이 정확히 4 ULP 라 1~4 ULP 가 통과했다(실측).
    expect(boundaryTolerance(1) / ulpOf(1), '경계 1 에서의 여유 폭이 달라졌다').toBe(4);
    for (const n of [1, 2, 3, 4, 5, 8]) {
      expect(() => scheil(stepUlp(1, n)), `k₀ = 1 + ${n} ULP 가 관문을 통과했다`)
        .toThrow(OutOfLimitError);
    }
  });

  it('k₀ 가 눈에 띄게 1 을 넘으면 당연히 차단된다', () => {
    for (const k0 of [1.0000001, 1.5, 2]) {
      expect(() => scheil(k0)).toThrow(OutOfLimitError);
    }
  });

  it('정상 정의역 안의 k₀ 는 영향을 받지 않는다', () => {
    for (const k0 of [1e-6, 0.001, 0.35, 0.8, 0.9999999]) {
      const q = scheil(k0);
      expect(Number.isFinite(q.value), `k₀ = ${k0} 가 유한한 값을 내지 못했다`).toBe(true);
      expect(q.validRange[1], `k₀ = ${k0} 에서 validRange 가 뒤집혔다`)
        .toBeGreaterThanOrEqual(q.validRange[0]);
    }
  });

  it('🔴 두 모드가 실제로 다르게 답한다 — 인자가 살아 있는지 확인', () => {
    // 같은 입력, 모드만 다름.
    expect(isOutOfRange(stepUlp(1, 2), 0, 1, 'tolerant')).toBe(false);
    expect(isOutOfRange(stepUlp(1, 2), 0, 1, 'exact')).toBe(true);
    // 🔴 기본값은 엄격 쪽이다 — 「안전한 쪽이 기본」.
    expect(isOutOfRange(stepUlp(1, 2), 0, 1), '기본값이 여유로 바뀌었다').toBe(true);
  });

  it('🔴 여유 모드에서도 「식의 모양이 바뀌는 경계」는 여전히 위험하다는 사실을 남긴다', () => {
    // 이 단정은 설계 근거의 기록이다: 여유를 관문에 켜면 아래가 통과한다.
    // 그래서 `assertWithin` 은 인자를 열지 않았고 기본값도 엄격이다.
    const k0 = stepUlp(1, 1);
    expect(isOutOfRange(k0, 1e-6, 1, 'tolerant'), '여유 모드가 k₀=1+1ULP 를 잡아 버리면 이 근거가 무의미해진다').toBe(false);
    expect(isOutOfRange(k0, 1e-6, 1, 'exact')).toBe(true);
    // 그리고 그 값이 통과했을 때 실제로 무슨 일이 벌어지는가 — 지수 부호가 뒤집힌다.
    expect(k0 - 1, 'k₀−1 이 0 이 아니게 된다 = 지수가 살아난다').toBeGreaterThan(0);
    expect(Math.pow(1 - 0.99, k0 - 1), '(1−X)^(k₀−1) 이 1 보다 작아져 상한이 하한 아래로 간다')
      .toBeLessThan(1);
  });
});

/* ══ ⑦ 🔴 여유가 뚫었던 정의역 관문 전수 — 되돌아오면 여기서 잡힌다 ══ */

/**
 * 2026-08-22, `assertWithin` 이 ULP 여유를 쓰던 동안 **아래 6 개 관문이 전부 열려 있었다.**
 * `k₀` 하나가 아니었다 — 하위 조사에서 전수로 찾아 **직접 실측해 확인한 목록**이다.
 * 기본값을 `'exact'` 로 돌려 전부 닫혔다. 이 테스트는 **그것이 다시 열리면 실패한다.**
 *
 * 🔴 공통 성질: 여섯 곳 모두 **상한이 0 이 아닌 값**이라 상대 여유가 붙었다.
 *    (`0` 과 `Number.MIN_VALUE` 경계는 `boundaryTolerance` 가 늘 0 을 주므로 애초에 영향이 없었다.)
 */
describe('⑦ 여유가 뚫었던 정의역 관문 8 곳이 전부 닫혀 있다', () => {
  const cases: Array<{ ko: string; at: number; run: (v: number) => unknown }> = [
    {
      ko: 'czochralski scheilAxialConcentration — k₀ 상한 1 (지수 k₀−1 의 부호 전환점)',
      at: 1,
      run: (k0) => scheilAxialConcentration({ k0, meltConcentrationCm3: 1e17, solidFraction: 0.5 }),
    },
    {
      ko: 'czochralski meltConcentrationFromSolid — k₀ 상한 1 (같은 지수, 게다가 제수)',
      at: 1,
      run: (k0) => meltConcentrationFromSolid({ k0, solidConcentrationCm3: 1e17, solidFraction: 0.5 }),
    },
    {
      ko: 'ald gpcAt — tempC 상한 250 (측정 최고점. 넘으면 창 평탄값으로 조용히 외삽했다)',
      at: 250,
      run: (tempC) => gpcAt(tempC),
    },
    {
      ko: 'wetEtch kohEtchRate — wt% 상한 50 (표 끝. 넘으면 보간 분기를 벗어나 폴백으로 샜다)',
      at: 50,
      run: (wtPercent) => kohEtchRate({ wtPercent, orientation: '100' }),
    },
    {
      ko: 'dryEtch rieLag — narrowDepth 상한 = wideDepth (넘으면 lag 이 음수가 된다)',
      at: 10,
      run: (narrowDepthUm) => rieLag({ wideDepthUm: 10, narrowDepthUm }),
    },
    {
      ko: 'wetEtch anisotropyDegree — lateralRate 상한 = verticalRate (넘으면 A 가 음수)',
      at: 2,
      run: (lateralRate) => anisotropyDegree({ verticalRate: 2, lateralRate }),
    },
    {
      // 🔴 `k₀` 와 **구조가 똑같다** — 파라미터가 지수 안에 있고 경계에서 지수가 0 이 된다.
      //    넘으면 `DL = 1 − Y^(1−T)` 이 **음의 확률**이 된다(실측 −2.22e-16).
      ko: 'eds defectLevel — coverage 상한 1 (지수 1−T 의 부호 전환점 · k₀ 의 쌍둥이)',
      at: 1,
      run: (coverage) => defectLevel({ dieYield: 0.5, coverage }),
    },
    {
      // `log(1) = 0` 이 출력 부호의 경계다. 넘으면 **음의 결함밀도**가 나온다.
      ko: 'eds defectDensityFromPoissonYield — dieYield 상한 1 (log(1)=0 부호 경계)',
      at: 1,
      run: (dieYield) => defectDensityFromPoissonYield({ dieYield, areaCm2: 2 }),
    },
  ];

  it.each(cases)('경계값 자체는 통과한다 — $ko', ({ at, run }) => {
    // 🔴 정당한 값을 막으면 반대 방향의 거짓말이다. 경계 위는 정의역 안이다.
    expect(() => run(at)).not.toThrow();
  });

  it.each(cases)('경계 + 1 ULP 는 차단된다 — $ko', ({ at, run }) => {
    expect(() => run(stepUlp(at, 1))).toThrow(OutOfLimitError);
  });

  it.each(cases)('여유 폭(4 ULP) 안쪽도 전부 차단된다 — $ko', ({ at, run }) => {
    // 여유가 켜져 있었다면 1~4 ULP 가 통과했다. 그 구간이 이 테스트의 핵심이다.
    for (const n of [2, 3, 4]) {
      expect(() => run(stepUlp(at, n)), `+${n} ULP 가 관문을 통과했다`).toThrow(OutOfLimitError);
    }
  });
});
