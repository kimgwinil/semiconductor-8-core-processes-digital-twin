// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { aldCycleModel } from '@/viz/gl/scenes/aldCycle';
import { DEPOSITION_LABS } from '@/models/labs/deposition';
import type { LabSpec } from '@/models/labs/spec';

/**
 * 🔴 A12 방향성 — **화면이 실제로 그리는 값**에서 본다.
 *
 * `deposition.direction.test.ts` 는 물리층(`depositionModel`)의 방향성을 본다. 그런데
 * 2026-08-21 결함 ❌-1 은 **물리층이 아니라 랩→씬 매핑에서** 났다. 물리층은 내내 옳았고
 * (창 안 GPC 평탄 · 창 아래 하락), 화면만 거꾸로 돌고 있었다. 물리층 방향성 규칙은
 * 그 사고를 하나도 잡지 못한다 — 씬 파라미터를 보지 않기 때문이다.
 *
 * 그래서 같은 두 명제를 **씬 모델 수준에서** 다시 단언한다:
 *   S1 (자기제한) 창(150–250 °C) 안에서 온도를 올려도 **계단 높이가 변하지 않는다**
 *   S2 (창 이탈)  창 아래로 내리면 **계단 높이가 낮아진다**
 *   S3 (온도 막대) 온도를 올리면 마커가 **오른쪽으로** 간다 — 반대로 가면 물리를 거꾸로 가르친다
 */

/* ---------------- 검증 설정 (제품 상수가 아니다) ---------------- */

/** ALD 창 안에서 슬라이더가 밟는 온도들(스텝 10 °C). */
const IN_WINDOW_C = [150, 160, 200, 240, 250] as const;
/** 창 아래 S186 측정점. 그 사이 온도는 랩이 최근접 측정점으로 스냅한다. */
const BELOW_WINDOW_C = [80, 100] as const;
/** 사이클 수는 고정한다 — 온도만 흔들어 계단 높이를 본다. */
const CYCLES = 200;

const basicLab = DEPOSITION_LABS.find((l) => l.stage === 'lab-basic') as LabSpec | undefined;

function sceneParamsFor(tempC: number): Record<string, number> {
  const spec = basicLab as LabSpec;
  const inputs = { cycles: CYCLES, tempC };
  const out = spec.compute(inputs);
  const nums: Record<string, number> = {};
  for (const [k, q] of Object.entries(out)) nums[k] = q.value;
  return spec.scene!.map(inputs, nums);
}

/** 화면의 계단 하나의 높이 = 사이클당 성장. 이 랩의 유일한 학습 요점이 여기에 걸려 있다. */
function stepHeightAt(tempC: number): number {
  return aldCycleModel(sceneParamsFor(tempC)).layerHeight;
}

describe('A12-ALD-S1 — 창 안에서 온도를 올려도 계단 높이가 변하지 않는다 (자기제한)', () => {
  it('150·160·200·240·250 °C 의 계단 높이가 비트 단위로 같다', () => {
    const heights = IN_WINDOW_C.map(stepHeightAt);
    for (const h of heights) expect(h).toBe(heights[0]);
  });

  it('계단 높이가 0 이 아니다 — 「같다」가 「둘 다 붕괴했다」로 통과하면 안 된다', () => {
    // 옛 결함은 전 온도에서 0.04 로 붕괴해 「같다」를 만족시켰다. 붕괴 자체를 배제한다.
    const m = aldCycleModel(sceneParamsFor(200));
    expect(m.gpc).toBeCloseTo(1, 6);
    expect(m.layerHeight).toBeGreaterThan(0);
    expect(m.filmHeight).toBeGreaterThan(0.1); // 화면 세로 10 % 이상 — 눈에 보인다
  });

  it('창 안에서는 tempFactor 도 평탄하다 (온도 막대가 창 안이라고 말한다)', () => {
    for (const t of IN_WINDOW_C) {
      expect(aldCycleModel(sceneParamsFor(t)).tempFactor, `${t} °C`).toBeCloseTo(1, 6);
    }
  });
});

describe('A12-ALD-S2 — 창 아래로 내리면 계단 높이가 낮아진다', () => {
  it.each(BELOW_WINDOW_C)('%i °C 의 계단이 창 안(200 °C)보다 낮다', (t) => {
    expect(stepHeightAt(t)).toBeLessThan(stepHeightAt(200));
  });

  it('낮아지는 비율이 S186 GPC 비와 같다 (80 °C → 0.9/1.1 · 100 °C → 1.0/1.1)', () => {
    const ref = stepHeightAt(200);
    expect(stepHeightAt(80) / ref).toBeCloseTo(0.9 / 1.1, 9);
    expect(stepHeightAt(100) / ref).toBeCloseTo(1.0 / 1.1, 9);
  });

  it('창 아래에서도 계단이 완전히 사라지지는 않는다 — GPC 는 0.9 Å 로 살아 있다', () => {
    expect(stepHeightAt(80) / stepHeightAt(200)).toBeGreaterThan(0.5);
  });
});

describe('A12-ALD-S3 — 온도 막대 마커가 온도와 같은 방향으로 움직인다', () => {
  it('80 → 250 °C 로 올리면 마커 위치가 단조 증가한다', () => {
    const temps = [...BELOW_WINDOW_C, ...IN_WINDOW_C];
    const markers = temps.map((t) => sceneParamsFor(t)['temperature'] as number);
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i], `${temps[i]} °C`).toBeGreaterThan(markers[i - 1] as number);
    }
  });

  it('🔴 창 밖 온도가 화면의 초록 창 안에 서지 않는다 (사고 당시 정확히 이게 뒤집혀 있었다)', () => {
    for (const t of BELOW_WINDOW_C) {
      expect(aldCycleModel(sceneParamsFor(t)).tempFactor, `${t} °C`).toBeLessThan(0.35);
    }
  });
});
