/**
 * 오차함수 계열 — **수학 특수함수**다. 물리 계수가 아니므로 S번호가 붙지 않는다.
 *
 * 🔴 근사 다항식(Abramowitz–Stegun 7.1.26 등)을 쓰지 않는다. 그 계수들은 출처가 필요한
 *    「맞춘 값」이기 때문이다. 대신 **닫힌 형태의 전개 2종**만 쓴다 — 계수가 전부 정수
 *    연산으로 생성되므로 출처 없는 상수가 하나도 들어가지 않는다.
 *
 *   ① 작은 z: erf(z) = (2/√π)·e^(−z²)·Σ_{n≥0} 2ⁿ·z^(2n+1)/(1·3·5···(2n+1))
 *      전 항이 양수라 상쇄오차가 없다(교대급수 테일러 전개는 z ≳ 3 에서 자릿수를 잃는다).
 *   ② 큰 z: erfc(z) = e^(−z²)/(√π·(z + (1/2)/(z + (2/2)/(z + (3/2)/(z + …)))))
 *      🔴 큰 z 에서 `1 − erf(z)` 를 쓰면 **상쇄로 유효자리를 잃는다**(erfc(4.5)≈2×10⁻¹⁰ 에서
 *      상대오차 6×10⁻⁷). 연분수는 그 구간에서 오히려 빨리 수렴해 전 자릿수를 지킨다.
 */

/** 급수 ↔ 연분수 전환점. 양쪽 모두 이 근방에서 정확하다. */
const CF_SWITCH = 2;

/** 연분수 항 수. z ≥ 2 에서는 20항 안에 수렴한다 — 100 은 여유값이다. */
const CF_TERMS = 100;

/** erf 포화점 — 배정밀도로 erf(6) = 1 − 2.2×10⁻¹⁷ = 1. 급수 중간항 오버플로 전에 닫는다. */
const Z_SATURATED = 2 + 2 + 2;

/** 급수 항 수 상한(안전장치). */
const MAX_TERMS = 100 * 100;

/** 수치 역함수를 신뢰할 수 있는 상한. erfc(10) ≈ 2×10⁻⁴⁵. */
const Z_MAX = 2 + 2 + 2 + 2 + 2;

export function erf(z: number): number {
  if (!Number.isFinite(z)) throw new Error('[erf] 유한한 입력만 받는다');
  if (z < 0) return -erf(-z);
  if (z === 0) return 0;
  if (z > Z_SATURATED) return 1;
  if (z >= CF_SWITCH) return 1 - erfcContinuedFraction(z);

  let term = z; // n = 0 항
  let sum = term;
  let n = 0;
  while (n < MAX_TERMS && term > sum * Number.EPSILON) {
    n++;
    term *= (2 * z * z) / (2 * n + 1);
    sum += term;
  }
  return (2 / Math.sqrt(Math.PI)) * Math.exp(-z * z) * sum;
}

function erfcContinuedFraction(z: number): number {
  let f = 0;
  for (let k = CF_TERMS; k >= 1; k--) f = k / 2 / (z + f);
  return Math.exp(-z * z) / (Math.sqrt(Math.PI) * (z + f));
}

export function erfc(z: number): number {
  if (!Number.isFinite(z)) throw new Error('[erfc] 유한한 입력만 받는다');
  if (z >= CF_SWITCH) return erfcContinuedFraction(z);
  return 1 - erf(z);
}

/**
 * erfc 의 역함수. erfc 는 단조 감소하므로 이분법으로 푼다(결정론 · 반복 100회 고정).
 * 🔴 y 가 erfc(Z_MAX) 보다 작으면 **거부한다.** 조용히 부정확한 답을 내놓지 않는다.
 */
export function erfcInv(y: number): number {
  if (!(y > 0 && y < 1)) {
    throw new Error(`[erfcInv] 정의역은 (0, 1) 이다. 받은 값: ${y}`);
  }
  const floor = erfc(Z_MAX);
  if (y < floor) {
    throw new Error(
      `[erfcInv] y = ${y} 는 수치 신뢰 하한 erfc(${Z_MAX}) = ${floor} 보다 작다. ` +
      '농도비가 이보다 작은 조건은 계산하지 않는다.',
    );
  }
  let lo = 0;
  let hi = Z_MAX;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (erfc(mid) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
