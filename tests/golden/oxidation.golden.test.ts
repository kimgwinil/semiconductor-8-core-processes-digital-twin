// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import {
  coefficientsAt, oxideThickness, siliconConsumed, timeForThickness,
} from '@/models/physics/oxidation/dealGrove';

/**
 * T2 골든 테스트 — A7. 원장 `refs/공개출처_반도체전공정_서지목록.md` §1-2.
 * **문헌이 명시한 조건에서 문헌이 명시한 값을 재현하는가**만 본다.
 * 실패하면 병합 차단(규정 §3).
 */

describe('R111 — S120 Table I: 습식 640 Torr ⟨111⟩ 계수표', () => {
  const expected: Record<number, { A: number; B: number; BA: number; tau: number }> = {
    1200: { A: 0.05, B: 0.720, BA: 14.40, tau: 0 },
    1100: { A: 0.11, B: 0.510, BA: 4.64, tau: 0 },
    1000: { A: 0.226, B: 0.287, BA: 1.27, tau: 0 },
    920: { A: 0.50, B: 0.203, BA: 0.406, tau: 0 },
  };
  for (const [tempStr, e] of Object.entries(expected)) {
    it(`${tempStr} °C — A·B·(B/A)·τ 가 표와 일치한다 (±3 %)`, () => {
      const got = coefficientsAt(Number(tempStr), 'wet', '111');
      expect(got.A).toBeCloseTo(e.A, 6);
      expect(got.B).toBeCloseTo(e.B, 6);
      expect(got.tau).toBe(e.tau);
      // B/A 는 표가 별도로 인쇄한 값이다 — 나눗셈 결과가 그것과 3 % 안에 들어야 한다
      expect(Math.abs(got.B / got.A - e.BA) / e.BA).toBeLessThanOrEqual(0.03);
    });
  }
});

describe('R112 — S120 Table II: 건식 1 atm ⟨111⟩ 계수표', () => {
  const expected: Record<number, { A: number; B: number; BA: number; tau: number }> = {
    1200: { A: 0.040, B: 0.045, BA: 1.12, tau: 0.027 },
    1100: { A: 0.090, B: 0.027, BA: 0.30, tau: 0.076 },
    1000: { A: 0.165, B: 0.0117, BA: 0.071, tau: 0.37 },
    920: { A: 0.235, B: 0.0049, BA: 0.0208, tau: 1.40 },
    800: { A: 0.370, B: 0.0011, BA: 0.0030, tau: 9.0 },
  };
  for (const [tempStr, e] of Object.entries(expected)) {
    it(`${tempStr} °C — A·B·(B/A)·τ 가 표와 일치한다 (±3 %)`, () => {
      const got = coefficientsAt(Number(tempStr), 'dry', '111');
      expect(got.A).toBeCloseTo(e.A, 6);
      expect(got.B).toBeCloseTo(e.B, 6);
      expect(got.tau).toBeCloseTo(e.tau, 6);
      expect(Math.abs(got.B / got.A - e.BA) / e.BA).toBeLessThanOrEqual(0.03);
    });
  }
});

describe('R110 — S121 Example 4.1: 950 °C 습식 두께-시간 5점 (풀이된 예제)', () => {
  // 🔴 문헌이 A = 0.50 µm, B = 0.2 µm²/h, τ = 0 을 명시하고 그 조건에서 답을 인쇄했다.
  // 우리 계수표(920 °C: A=0.50, B=0.203)와 거의 같으나 **문헌 예제의 값을 그대로 입력**해 검증한다.
  const A = 0.50, B = 0.2, tau = 0;
  const solve = (t: number) => (A / 2) * (Math.sqrt(1 + (4 * B * (t + tau)) / (A * A)) - 1);
  const cases: Array<[number, number]> = [
    [0.11, 0.041], [0.30, 0.100], [0.40, 0.128], [0.50, 0.153], [0.60, 0.177],
  ];
  for (const [t, d] of cases) {
    it(`t = ${t} h → d = ${d} µm (±2 %)`, () => {
      expect(Math.abs(solve(t) - d) / d).toBeLessThanOrEqual(0.02);
    });
  }
});

describe('R113 — S121 Table 4.4: 면방위비는 선형항(B/A)에만 걸린다', () => {
  it('⟨111⟩ 의 B/A 가 ⟨100⟩ 보다 크다', () => {
    const c111 = coefficientsAt(1000, 'wet', '111');
    const c100 = coefficientsAt(1000, 'wet', '100');
    expect(c111.B / c111.A).toBeGreaterThan(c100.B / c100.A);
  });
  it('면방위비가 1.68 ± 0.05 다', () => {
    const c111 = coefficientsAt(1000, 'wet', '111');
    const c100 = coefficientsAt(1000, 'wet', '100');
    expect((c111.B / c111.A) / (c100.B / c100.A)).toBeCloseTo(1.68, 2);
  });
  it('🔴 포물선 계수 B 는 면방위와 무관하다', () => {
    expect(coefficientsAt(1000, 'wet', '111').B).toBe(coefficientsAt(1000, 'wet', '100').B);
  });
});

describe('Si 소모비 0.44 (S121 §4.1)', () => {
  it('산화막 1 µm 당 Si 0.44 µm 가 소모된다', () => {
    expect(siliconConsumed(1).value).toBeCloseTo(0.44, 10);
  });
});

describe('두께 ↔ 시간 왕복 일관성 (T1)', () => {
  it('oxideThickness 와 timeForThickness 가 서로의 역함수다', () => {
    const t = 2.5;
    const x = oxideThickness({ tempC: 1000, timeH: t, ambient: 'wet', orientation: '111' }).value;
    const back = timeForThickness({ targetUm: x, tempC: 1000, ambient: 'wet', orientation: '111' }).value;
    expect(back).toBeCloseTo(t, 6);
  });
});

describe('🔴 원장에 없는 온도는 보간하지 않고 거부한다 (원장 규칙 1)', () => {
  it('950 °C 건식은 표에 없으므로 던진다', () => {
    expect(() => coefficientsAt(950, 'dry', '111')).toThrow(/no measured coefficients/);
  });
  it('τ 를 x_i 로 재계산하지 않는다 — 표의 τ 를 그대로 쓴다', () => {
    // x_i = 230 Å = 0.023 µm 로 역산하면 1100 °C 에서 0.096 h 가 나오지만 표는 0.076 h 다.
    const { A, B, tau } = coefficientsAt(1100, 'dry', '111');
    const xi = 0.023;
    const recomputed = (xi * xi + A * xi) / B;
    expect(tau).toBe(0.076);
    expect(Math.abs(recomputed - tau) / tau).toBeGreaterThan(0.2); // 실제로 어긋난다는 사실을 고정
  });
});

describe('R117 — 🔴 팀 간 수치 불일치를 고정한다 (원장 §1-2b)', () => {
  // 1000 °C · 건식 · 90 min. τ = 0.37 h 를 그대로 쓰고 x_i 를 따로 더하지 않는다.
  const t = 1.5;
  it('⟨111⟩ = 86.9 nm (±0.5 %)', () => {
    const nm = oxideThickness({ tempC: 1000, timeH: t, ambient: 'dry', orientation: '111' }).value * 1000;
    expect(Math.abs(nm - 86.9) / 86.9).toBeLessThanOrEqual(0.005);
  });
  it('⟨100⟩ = 64.1 nm (±0.5 %) — 이것이 정답이다', () => {
    const nm = oxideThickness({ tempC: 1000, timeH: t, ambient: 'dry', orientation: '100' }).value * 1000;
    expect(Math.abs(nm - 64.1) / 64.1).toBeLessThanOrEqual(0.005);
  });
  it('🔴 x_i 를 τ 에 더하면 이중 계상이 되어 값이 커진다 (PLN 101 nm 의 원인)', () => {
    // 🔴 기대값을 「식」이 아니라 「수」로 둔다 (E1 · check-test-formulas).
    //    예전에는 이 자리에서 Deal–Grove 식을 변형해 다시 적었다 → 구현이 바뀌면 이 사본만 옛 식에 남고,
    //    구현이 틀려도 기대값이 같이 틀려 아무것도 막지 못했다. **틀린 식**의 반례이므로 대응하는
    //    문헌 표 값은 존재할 수 없다 → 손계산 리터럴로 고정한다.
    //
    //    손계산 (2026-08-22 · 구현 코드를 보지 않고 원논문 식 13 에서 직접 계산):
    //      1000 °C · dry · ⟨100⟩ · t = 1.5 h · x_i = 230 Å = 0.023 µm
    //      A_100 = A_111 × (B/A 면방위비) = 0.165 × 1.68 = 0.2772 µm · B = 0.0117 µm²/h · τ = 0.37 h
    //      x_i 를 τ 에 이중 계상하면 τ' = τ + (x_i² + A·x_i)/B
    //                                    = 0.37 + (0.000529 + 0.0063756)/0.0117 = 0.9601368 h
    //      x = (A/2)·[√(1 + 4B(t+τ')/A²) − 1] = 0.0804743 µm = **80.474 nm**
    //    같은 조건의 정상해는 0.0641041 µm = 64.104 nm 로, 바로 위 R117 골든 64.1 nm 와 일치한다
    //    → 계수 재구성이 옳다는 검산이다. 그래서 아래에서 정상해도 함께 못박는다.
    //
    //    ⚠️ 이 테스트 제목의 「PLN 101 nm 의 원인」은 이 식으로 **재현되지 않는다**(80.5 nm 가 나온다).
    //       101 nm 가 어디서 왔는지는 미상이다 — 지어내지 않고 그대로 남긴다.
    //       (스레드 `DEV-8대공정-001.md` §4-A-6-② 참조)
    const correct = oxideThickness({ tempC: 1000, timeH: t, ambient: 'dry', orientation: '100' }).value;
    const DOUBLE_COUNTED_UM = 0.0804743; // 손계산 리터럴 — 구현에서 온 수가 아니다
    expect(DOUBLE_COUNTED_UM).toBeGreaterThan(correct);
    expect(correct * 1000).toBeCloseTo(64.104, 2); // 정상해를 수로 못박아 부등식이 껍데기가 되지 않게 한다
  });
  it('면방위 보정을 빠뜨리면 ⟨111⟩ 값이 나온다 (오케스트레이터 87 nm 의 원인)', () => {
    const o111 = oxideThickness({ tempC: 1000, timeH: t, ambient: 'dry', orientation: '111' }).value;
    const o100 = oxideThickness({ tempC: 1000, timeH: t, ambient: 'dry', orientation: '100' }).value;
    expect(o111 / o100).toBeGreaterThan(1.3);
  });
});
