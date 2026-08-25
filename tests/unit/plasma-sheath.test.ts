// 🔴 등급 리졸버 설치(부수효과). `@/models/labs/etch` 가 물리층 `endpointWavelength` 를
// 모듈 최상위에서 부르므로, 없으면 import 시점에 죽는다(2026-08-20 ALD 테스트와 같은 이유).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { PLASMA_GEOMETRY, plasmaGlowGain, sheathThickness } from '@/viz/gl/scenes/plasma';
import { ETCH_LABS } from '@/models/labs/etch';
import type { LabSpec } from '@/models/labs/spec';

/**
 * 🔴 씬 결함 ❌-3 · ❌-4 · ❌-5 회귀 — **식각 플라즈마 씬 3건**.
 *
 * ── 사고 내용 ─────────────────────────────────────────────────────────────
 * ❌-3  시스 두께의 **전력 항 부호가 반대**였다.
 *       `sheath() = mix(0.105, 0.028, uPressure) * mix(0.7, 1.35, uPower)`
 *       화면 근거 문구는 스스로 「소스전력↑ → 전자밀도 n_e↑」라고 말하는데,
 *       n_e↑ ⇒ 디바이 길이 λ_D ∝ n_e^(−½) ↓ ⇒ 시스는 **얇아져야** 한다.
 *       그런데 그림은 1.93 배 **두껍게** 그렸다(26.5 → 50 px).
 *       부수 결함: 랩 매핑이 `power = (P_s − 200)/1800` 이라 **유효 하한 200 W 에서
 *       uPower 가 정확히 0**, 셰이더 `glow = … * uPower * …` 때문에 발광이 완전히 0 이
 *       되어 **모델은 식각 중이라는데 화면은 꺼진 챔버**였다.
 * ❌-4  화면 근거가 「bias = P_b/500 → 시스 두께(차일드–랭뮤어)」라고 렌더되는데
 *       `sheath()` 에 **`uBias` 항이 아예 없었다.** P_b 0↔500 에서 시스 경계선이
 *       **같은 픽셀행(93/249)** 에 찍혔다 — 문구가 하지 않는 일을 주장하고 있었다.
 * ❌-5  심화(lab-advanced)가 **이온주입 전용 씬 `ionTrajectory`** 를 쓰고 있었다.
 *       깊이–농도 가우시안 + R_p 선은 「이온이 특정 깊이에 멈춰 농도 분포를 만든다」는
 *       물리이고, 식각 이온은 그렇게 멈추지 않는다(A11 · `spec.ts` §LabSceneBinding).
 *
 * ── 이 파일이 막는 것 ─────────────────────────────────────────────────────
 *  (A) 시스 두께 세 방향(압력·전력·바이어스)의 **부호가 다시 뒤집히는 것**.
 *  (B) `uBias` 항이 다시 사라져 바이어스가 그림을 못 움직이게 되는 것 —
 *      「존재한다」가 아니라 **몇 px 움직이는가**로 단언한다.
 *  (C) 랩 매핑이 구간 정규화로 돌아가 하한에서 챔버가 꺼지는 것.
 *  (D) `ionTrajectory`(또는 다른 대용 씬)가 etch 심화에 되붙는 것.
 *
 * 🔴 **부분문자열 검사를 쓰지 않는다.** GLSL 문자열도 `note` 문구도 `includes()` 로 보지
 *    않는다. 전부 **수치와 구조**로 본다. (셰이더 식은 테스트가 직접 부를 수 없으므로
 *    `plasma.ts` 가 같은 상수·같은 식을 TS 순수함수 `sheathThickness()` 로 내보내고,
 *    GLSL 은 그 상수를 템플릿 리터럴로 주입받는다. 여기서 검증하는 대상은 그 함수다.
 *    GLSL 문법·보간 잔재는 `tests/unit/viz-glsl.test.ts` 가 따로 본다.)
 */

/* ═════════════ 검증 설정 (제품 상수가 아니다) ═════════════ */

/**
 * 캔버스 세로 픽셀 **가정**. 실측이 아니라 가정임을 명시한다.
 * 결함 보고의 관측(시스 경계선이 93 / 249 행)에서 역산하면 H ≈ 364 다 —
 *   상부시스행 = (0.16 + s)·H · 하부시스행 = (0.78 − s)·H, 구식 s = 0.09738
 *   ⇒ (0.16+0.09738)·364 = 93.7 · (0.78−0.09738)·364 = 248.5
 * 그래서 **360 ~ 420 px 대역**을 가정하고, 가장 불리한 360 px 로 판정한다.
 */
const CANVAS_H_MIN_PX = 360;
const CANVAS_H_MAX_PX = 420;

/** 바이어스가 시스 경계선을 이만큼은 움직여야 육안으로 「움직였다」고 말할 수 있다. */
const MIN_VISIBLE_SWING_PX = 8;

/** 스윕 격자. 단조성은 「끝점 2개」가 아니라 구간 전체에서 본다. */
const SWEEP = Array.from({ length: 21 }, (_, i) => i / 20);

/** 씬 파라미터 기본값(`createScene()` 의 초기값과 같다). 1축 스윕의 배경. */
const SCENE_DEFAULT = { pressure: 0.4, power: 0.5, bias: 0.35 } as const;

/* ═════════════ 랩 접근 보조 ═════════════ */

function lab(stage: LabSpec['stage']): LabSpec {
  const spec = ETCH_LABS.find((l) => l.stage === stage);
  if (!spec) throw new Error(`etch ${stage} 명세가 없다`);
  return spec;
}

/** 응용 랩 슬라이더 기본값. PLN 명세 ②의 기본 조건 그대로다. */
const APPLIED_DEFAULT_INPUTS = { pressureMTorr: 30, sourceW: 1000, biasW: 50, timeS: 60 } as const;

/** 응용 랩 슬라이더 → 씬 파라미터 → 시스 두께(UV). 실제 배선을 통과시킨다. */
function appliedSheath(overrides: Record<string, number> = {}): number {
  const spec = lab('lab-applied');
  const mapped = spec.scene!.map({ ...APPLIED_DEFAULT_INPUTS, ...overrides }, {});
  return sheathThickness({
    pressure: mapped['pressure'] ?? 0,
    power: mapped['power'] ?? 0,
    bias: mapped['bias'] ?? 0,
  });
}

/* ═════════════ (A) 세 방향의 부호 ═════════════ */

describe('❌-3 · ❌-4 · 시스 두께의 방향 — s ∝ n_e^(−½) · V^(¾)', () => {
  it('압력↑ → 시스가 **얇아진다** (구간 전체에서 단조 감소)', () => {
    const vals = SWEEP.map((pressure) => sheathThickness({ ...SCENE_DEFAULT, pressure }));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeLessThan(vals[i - 1]!);
    }
  });

  it('🔴 전력↑ → 시스가 **얇아진다** (구간 전체에서 단조 감소) — 뒤집혀 있던 항', () => {
    const vals = SWEEP.map((power) => sheathThickness({ ...SCENE_DEFAULT, power }));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeLessThan(vals[i - 1]!);
    }
    // 구식은 전력 0→1 에서 1.93 배 **두꺼워졌다**. 방향이 반대였다는 사실 자체를 박아 둔다.
    const thin = sheathThickness({ ...SCENE_DEFAULT, power: 1 });
    const thick = sheathThickness({ ...SCENE_DEFAULT, power: 0 });
    expect(thin).toBeLessThan(thick);
  });

  it('🔴 바이어스↑ → 시스가 **두꺼워진다** (구간 전체에서 단조 증가) — 아예 없던 항', () => {
    const vals = SWEEP.map((bias) => sheathThickness({ ...SCENE_DEFAULT, bias }));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    }
  });
});

/* ═════════════ (A') 물리 척도의 지수가 유지되는가 ═════════════ */

describe('시스 두께가 물리 척도의 지수를 따른다 (선형 mix 로 되돌아가지 않는다)', () => {
  /**
   * λ_D ∝ n_e^(−½) 이고 전력 0→1 에서 n_e 가 NE_MIN → 1 로 가므로,
   * 두께 비는 정확히 √(NE_MIN) 이어야 한다. 선형 `mix` 로 되돌리면 이 비가 깨진다.
   * NE_MIN = 0.36 → √0.36 = 0.60.
   */
  it('전력 항이 n_e^(−½) 척도다 — s(power=1)/s(power=0) = √(n_e,min)', () => {
    const ratio =
      sheathThickness({ ...SCENE_DEFAULT, power: 1 }) / sheathThickness({ ...SCENE_DEFAULT, power: 0 });
    expect(ratio).toBeCloseTo(0.6, 10);
    // 압력·바이어스를 어디에 두든 비는 같아야 한다(곱셈 분리 구조).
    const ratio2 =
      sheathThickness({ pressure: 0.9, power: 1, bias: 0.1 })
      / sheathThickness({ pressure: 0.9, power: 0, bias: 0.1 });
    expect(ratio2).toBeCloseTo(0.6, 10);
  });

  /**
   * 차일드–랭뮤어 s ∝ V^(¾). 바이어스 기여분을 0~1 로 정규화하면 b^0.75 곡선이어야 한다.
   * 선형이었다면 b 자신이 나온다 — 예: b=0.5 에서 0.5946 vs 0.5.
   */
  it('바이어스 항이 V^(¾) 척도다 — 정규화 기여분이 b^0.75 곡선', () => {
    const at = (bias: number) => sheathThickness({ ...SCENE_DEFAULT, bias });
    const lo = at(0);
    const span = at(1) - lo;
    expect(span).toBeGreaterThan(0);
    for (const b of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect((at(b) - lo) / span).toBeCloseTo(Math.pow(b, 0.75), 10);
    }
    // 선형이 아님을 명시적으로 못 박는다.
    expect((at(0.5) - lo) / span).toBeGreaterThan(0.55);
  });
});

/* ═════════════ (B) 바이어스가 화면을 실제로 몇 px 움직이는가 ═════════════ */

describe('❌-4 · 바이어스가 시스 경계선을 실제로 움직인다', () => {
  it(`P_b 0 → 500 W 에서 시스 두께가 ${MIN_VISIBLE_SWING_PX} px 이상 움직인다(캔버스 ${CANVAS_H_MIN_PX}~${CANVAS_H_MAX_PX} px 가정)`, () => {
    const s0 = appliedSheath({ biasW: 0 });
    const s1 = appliedSheath({ biasW: 500 });
    expect(s1).toBeGreaterThan(s0);
    // 가장 불리한 캔버스 높이로 판정한다.
    const swingPx = (s1 - s0) * CANVAS_H_MIN_PX;
    expect(swingPx).toBeGreaterThanOrEqual(MIN_VISIBLE_SWING_PX);
  });

  it('상·하 시스 경계선의 픽셀행이 P_b 0 ↔ 500 에서 서로 다르다 (93/249 고착 재발 방지)', () => {
    // 셰이더 기하: 하부 시스 uv.y = WAFER_Y + s · 상부 시스 uv.y = SHOWER_Y − s
    // 화면 행(위에서부터) = (1 − uv.y)·H
    const rowsAt = (biasW: number, h: number) => {
      const s = appliedSheath({ biasW });
      return {
        upper: Math.round((1 - (PLASMA_GEOMETRY.SHOWER_Y - s)) * h),
        lower: Math.round((1 - (PLASMA_GEOMETRY.WAFER_Y + s)) * h),
      };
    };
    for (const h of [CANVAS_H_MIN_PX, CANVAS_H_MAX_PX]) {
      const a = rowsAt(0, h);
      const b = rowsAt(500, h);
      expect(Math.abs(b.upper - a.upper)).toBeGreaterThanOrEqual(MIN_VISIBLE_SWING_PX);
      expect(Math.abs(b.lower - a.lower)).toBeGreaterThanOrEqual(MIN_VISIBLE_SWING_PX);
      // 바이어스가 커지면 시스가 두꺼워지므로 두 경계선은 서로 **가까워진다**.
      expect(b.lower - b.upper).toBeLessThan(a.lower - a.upper);
    }
  });

  it('압력·소스파워도 각각 화면을 움직인다 (응용 랩 실슬라이더 전 구간)', () => {
    expect(appliedSheath({ pressureMTorr: 300 })).toBeLessThan(appliedSheath({ pressureMTorr: 5 }));
    expect(appliedSheath({ sourceW: 2000 })).toBeLessThan(appliedSheath({ sourceW: 200 }));
    for (const [lo, hi, key] of [[5, 300, 'pressureMTorr'], [200, 2000, 'sourceW']] as const) {
      const swingPx = Math.abs(appliedSheath({ [key]: hi }) - appliedSheath({ [key]: lo })) * CANVAS_H_MIN_PX;
      expect(swingPx).toBeGreaterThanOrEqual(MIN_VISIBLE_SWING_PX);
    }
  });
});

/* ═════════════ (C) 수치 건전성 ═════════════ */

describe('시스 두께가 어떤 입력에서도 유한하다', () => {
  it('min·max·경계 전 격자에서 NaN·Infinity 0건이고 양수다', () => {
    const bad: string[] = [];
    for (const pressure of SWEEP) {
      for (const power of SWEEP) {
        for (const bias of SWEEP) {
          const s = sheathThickness({ pressure, power, bias });
          if (!Number.isFinite(s) || s <= 0) bad.push(`(${pressure}, ${power}, ${bias}) -> ${s}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('범위 밖·비정상 입력도 클램프되어 유한하다', () => {
    const weird = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 2, 1e9];
    for (const v of weird) {
      for (const key of ['pressure', 'power', 'bias'] as const) {
        const s = sheathThickness({ ...SCENE_DEFAULT, [key]: v });
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThan(0);
      }
    }
    expect(Number.isFinite(sheathThickness({ pressure: Number.NaN, power: Number.NaN, bias: Number.NaN }))).toBe(true);
  });

  /**
   * 시스는 챔버 안에 그려지는 층이다. 두 겹이 전극 사이 간극보다 두꺼워지면
   * 상·하 시스 경계선이 교차해 그림이 뒤집힌다(벌크 발광 영역이 음수 폭이 된다).
   */
  it('가장 두꺼운 조합에서도 시스 두 겹이 챔버 간극을 넘지 않는다', () => {
    const gap = PLASMA_GEOMETRY.SHOWER_Y - PLASMA_GEOMETRY.WAFER_Y;
    let max = 0;
    for (const pressure of [0, 1]) {
      for (const power of [0, 1]) {
        for (const bias of [0, 1]) max = Math.max(max, sheathThickness({ pressure, power, bias }));
      }
    }
    // 벌크가 완전히 사라지지 않도록 여유도 본다(셰이더의 smoothstep 전이 폭 0.06 × 2).
    expect(2 * max + 2 * 0.06).toBeLessThan(gap);
  });
});

/* ═════════════ (D) 발광 하한 — 꺼진 챔버 재발 방지 ═════════════ */

describe('❌-3 부수 · 전력 하한에서 챔버가 꺼지지 않는다', () => {
  it('발광 배율은 전력 0 에서도 0 이 아니다', () => {
    expect(plasmaGlowGain(0)).toBeGreaterThan(0);
    expect(plasmaGlowGain(Number.NaN)).toBeGreaterThan(0);
    expect(plasmaGlowGain(-5)).toBeGreaterThan(0);
  });

  it('발광 배율은 전력에 대해 단조 증가하고 1 을 넘지 않는다', () => {
    const vals = SWEEP.map(plasmaGlowGain);
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    expect(plasmaGlowGain(1)).toBeCloseTo(1, 10);
  });

  it('🔴 슬라이더 유효 하한 P_s = 200 W 에서도 씬 `power` 가 0 이 아니다 (구식 매핑 재발 방지)', () => {
    for (const stage of ['lab-basic', 'lab-applied'] as const) {
      const spec = lab(stage);
      const mapped = spec.scene!.map({ ...APPLIED_DEFAULT_INPUTS, sourceW: 200 }, {});
      expect(mapped['power']).toBeGreaterThan(0);
      expect(plasmaGlowGain(mapped['power']!)).toBeGreaterThan(0);
    }
    // 구식 `(P_s − 200)/1800` 이면 정확히 0 이었다. 비율 정규화 P_s/2000 인지 값으로 확인한다.
    const applied = lab('lab-applied');
    expect(applied.scene!.map({ ...APPLIED_DEFAULT_INPUTS, sourceW: 200 }, {})['power']).toBeCloseTo(0.1, 10);
    expect(applied.scene!.map({ ...APPLIED_DEFAULT_INPUTS, sourceW: 2000 }, {})['power']).toBeCloseTo(1, 10);
    expect(applied.scene!.map({ ...APPLIED_DEFAULT_INPUTS, sourceW: 1000 }, {})['power']).toBeCloseTo(0.5, 10);
  });
});

/* ═════════════ (E) ❌-5 — 씬 오용 재발 방지 ═════════════ */

describe('❌-5 · A11 — etch 심화에 다른 공정의 씬을 붙이지 않는다', () => {
  it('etch lab-advanced 에는 식각 전용 plasma 씬이 연결된다', () => {
    expect(lab('lab-advanced').scene?.sceneId).toBe('plasma');
  });

  it('etch 어느 단계도 `ionTrajectory` 를 쓰지 않는다 — 이온주입 전용 표현이다', () => {
    const used = ETCH_LABS.map((l) => l.scene?.sceneId).filter((v): v is string => typeof v === 'string');
    expect(used).not.toContain('ionTrajectory');
  });

  it('기초·응용·심화 모두 `plasma` 를 사용한다', () => {
    expect(lab('lab-basic').scene?.sceneId).toBe('plasma');
    expect(lab('lab-applied').scene?.sceneId).toBe('plasma');
    expect(lab('lab-advanced').scene?.sceneId).toBe('plasma');
  });

  /**
   * 🔴 씬을 뗀 대가를 명시적으로 센다. 24칸(8공정 × 3단계) 중 씬이 붙은 칸은
   * **12 → 11** 이 된다. 이 수가 다시 12 가 되면 누군가 대용 씬을 되붙인 것이다.
   */
  it('etch 의 씬 배선은 3칸 전부다', () => {
    const bound = ETCH_LABS.filter((l) => l.scene !== undefined);
    expect(ETCH_LABS.length).toBe(3);
    expect(bound.length).toBe(3);
  });
});

describe('etch 심화 — 4개 조작축이 plasma 씬을 움직인다', () => {
  const spec = lab('lab-advanced');
  const at = (overrides: Record<string, number>) => spec.scene!.map({
    pressureMTorr: 30, sourceW: 1000, biasW: 50, flowSccm: 100, ...overrides,
  }, {});

  it('압력·소스·바이어스·유량이 각각 독립 씬 파라미터로 변한다', () => {
    expect(at({ pressureMTorr: 300 })['pressure']).toBeGreaterThan(at({ pressureMTorr: 5 })['pressure']!);
    expect(at({ sourceW: 2000 })['power']).toBeGreaterThan(at({ sourceW: 200 })['power']!);
    expect(at({ biasW: 500 })['bias']).toBeGreaterThan(at({ biasW: 0 })['bias']!);
    expect(at({ flowSccm: 300 })['flow']).toBeGreaterThan(at({ flowSccm: 20 })['flow']!);
  });
});

/* ═════════════ (F) 근거 문구가 하는 말을 그림이 실제로 한다 ═════════════ */

describe('화면 근거가 주장하는 세 방향이 전부 그림에서 일어난다', () => {
  /**
   * ❌-4 의 본질은 「문구가 하지 않는 일을 주장했다」였다. 문구를 문자열로 검사하지 않고,
   * **문구가 약속한 세 방향이 실제 배선을 통과해 일어나는지**를 값으로 확인한다.
   */
  it('응용 랩: 압력↑ 얇아짐 · 소스파워↑ 얇아짐 · 바이어스↑ 두꺼워짐', () => {
    const sweepDir = (key: string, values: readonly number[]) =>
      values.map((v) => appliedSheath({ [key]: v }));

    const byPressure = sweepDir('pressureMTorr', [5, 30, 100, 200, 300]);
    for (let i = 1; i < byPressure.length; i++) expect(byPressure[i]!).toBeLessThan(byPressure[i - 1]!);

    const byPower = sweepDir('sourceW', [200, 500, 1000, 1500, 2000]);
    for (let i = 1; i < byPower.length; i++) expect(byPower[i]!).toBeLessThan(byPower[i - 1]!);

    const byBias = sweepDir('biasW', [0, 50, 150, 300, 500]);
    for (let i = 1; i < byBias.length; i++) expect(byBias[i]!).toBeGreaterThan(byBias[i - 1]!);
  });

  it('기초 랩: 압력·소스파워는 고정이고 바이어스만 그림을 움직인다(학습 의도)', () => {
    const spec = lab('lab-basic');
    const at = (biasW: number) => spec.scene!.map({ biasW }, {});
    expect(at(0)['pressure']).toBe(at(500)['pressure']);
    expect(at(0)['power']).toBe(at(500)['power']);
    const thin = sheathThickness({
      pressure: at(0)['pressure']!, power: at(0)['power']!, bias: at(0)['bias']!,
    });
    const thick = sheathThickness({
      pressure: at(500)['pressure']!, power: at(500)['power']!, bias: at(500)['bias']!,
    });
    expect(thick).toBeGreaterThan(thin);
    expect((thick - thin) * CANVAS_H_MIN_PX).toBeGreaterThanOrEqual(MIN_VISIBLE_SWING_PX);
  });
});
