// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { oxideThickness, timeForThickness, siliconConsumed, DG_TEMPERATURES } from '@/models/physics/oxidation/dealGrove';
import { resolution, dofRatio, requiredK1, depthOfFocusArFImmersion } from '@/models/physics/photo/rayleigh';
import { OutOfLimitError, type Quantity } from '@/models/contract';

/**
 * 🔴 A14 — 계산 정확성 (CEO 지시 2026-08-20 · README §3-9). 예외 없다.
 *  1. 결정론   — 동일 입력 → 항상 동일 출력
 *  2. 수치 정확성 — 손계산 대조 (골든 테스트가 담당. 여기서는 대표 3점 추가 고정)
 *  3. 경계 안정성 — 전 파라미터 min·max·경계에서 NaN·Infinity·발산 0건
 *  4. 단위 일관성 — 모든 Quantity 가 단위를 갖고, 차원이 맞는다
 */

const PHOTO_OK = { lambdaNm: 193, na: 1.35, k1: 0.28 };

describe('A14-1 결정론 — 동일 입력은 항상 동일 출력', () => {
  it('산화 두께를 200회 반복해도 비트 단위로 같다', () => {
    const first = oxideThickness({ tempC: 1000, timeH: 2, ambient: 'wet', orientation: '111' }).value;
    for (let i = 0; i < 200; i++) {
      expect(oxideThickness({ tempC: 1000, timeH: 2, ambient: 'wet', orientation: '111' }).value).toBe(first);
    }
  });
  it('해상도를 200회 반복해도 비트 단위로 같다', () => {
    const first = resolution(PHOTO_OK).value;
    for (let i = 0; i < 200; i++) expect(resolution(PHOTO_OK).value).toBe(first);
  });
  it('시각을 바꿔도(=호출 시점이 달라도) 값이 변하지 않는다', async () => {
    const a = resolution(PHOTO_OK).value;
    await new Promise((r) => setTimeout(r, 20));
    expect(resolution(PHOTO_OK).value).toBe(a);
  });
});

describe('A14-2 수치 정확성 — 손계산 대조 대표 3점', () => {
  it('1000 °C 습식 1 h ⟨111⟩: x = (A/2)(√(1+4B t/A²)−1), A=0.226 B=0.287', () => {
    const A = 0.226, B = 0.287, t = 1;
    const hand = (A / 2) * (Math.sqrt(1 + (4 * B * t) / (A * A)) - 1);
    expect(oxideThickness({ tempC: 1000, timeH: 1, ambient: 'wet', orientation: '111' }).value)
      .toBeCloseTo(hand, 12);
  });
  it('λ193 NA1.35 k₁0.28 → 0.28×193/1.35', () => {
    expect(resolution(PHOTO_OK).value).toBeCloseTo((0.28 * 193) / 1.35, 12);
  });
  it('DOF 비율 0.33→0.55 NA = (0.33/0.55)²', () => {
    expect(dofRatio({ naFrom: 0.33, naTo: 0.55 }).value).toBeCloseTo((0.33 / 0.55) ** 2, 12);
  });
});

function assertFinite(q: Quantity, label: string): void {
  expect(Number.isFinite(q.value), `${label} → ${q.value}`).toBe(true);
  expect(Number.isNaN(q.value), `${label} is NaN`).toBe(false);
}

describe('A14-3 경계 안정성 — 전 파라미터 스윕에서 NaN·Infinity 0건', () => {
  it('산화: 표에 있는 전 온도 × 시간 0~1000 h 를 61점 스윕', () => {
    let n = 0;
    for (const ambient of ['wet', 'dry'] as const) {
      for (const tempC of DG_TEMPERATURES[ambient]) {
        for (const orientation of ['111', '100'] as const) {
          for (let i = 0; i <= 60; i++) {
            const timeH = (1000 * i) / 60;
            const q = oxideThickness({ tempC, timeH, ambient, orientation });
            assertFinite(q, `ox ${ambient} ${tempC}°C ${timeH}h ⟨${orientation}⟩`);
            expect(q.value).toBeGreaterThanOrEqual(0);
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('산화: t = 0 에서도 발산하지 않는다 (건식은 τ 때문에 0보다 크다)', () => {
    expect(oxideThickness({ tempC: 1000, timeH: 0, ambient: 'wet', orientation: '111' }).value).toBe(0);
    expect(oxideThickness({ tempC: 1000, timeH: 0, ambient: 'dry', orientation: '111' }).value).toBeGreaterThan(0);
  });

  it('포토: λ·NA·k₁ 3중 격자 스윕 (13.5~436 nm × 0.1~1.35 × 0.25~1.5)', () => {
    let n = 0;
    for (let li = 0; li <= 12; li++) {
      const lambdaNm = 13.5 + ((436 - 13.5) * li) / 12;
      for (let ni = 0; ni <= 12; ni++) {
        const na = 0.1 + ((1.35 - 0.1) * ni) / 12;
        for (let ki = 0; ki <= 12; ki++) {
          const k1 = 0.25 + ((1.5 - 0.25) * ki) / 12;
          const q = resolution({ lambdaNm, na, k1 });
          assertFinite(q, `res λ${lambdaNm} NA${na} k1${k1}`);
          expect(q.value).toBeGreaterThan(0);
          n++;
        }
      }
    }
    expect(n).toBe(13 * 13 * 13);
  });

  it('포토: DOF 비율은 NA 격자 전역에서 유한하고 양수다', () => {
    // 유효범위 [0.1, 1.35] 안에서만 스윕한다 — 밖은 assertWithin 이 막는 것이 정상이다
    for (let a = 0; a <= 20; a++) {
      for (let b = 0; b <= 20; b++) {
        const q = dofRatio({ naFrom: 0.1 + (1.25 * a) / 20, naTo: 0.1 + (1.25 * b) / 20 });
        assertFinite(q, `dofRatio ${a}/${b}`);
        expect(q.value).toBeGreaterThan(0);
      }
    }
  });

  it('범위 밖 입력은 NaN 을 내지 않고 OutOfLimitError 로 정지한다 (규정 §4-1(2))', () => {
    expect(() => oxideThickness({ tempC: 300, timeH: 1, ambient: 'wet', orientation: '111' }))
      .toThrow(OutOfLimitError);
    expect(() => resolution({ lambdaNm: 193, na: 5, k1: 0.3 })).toThrow(OutOfLimitError);
    expect(() => resolution({ lambdaNm: 193, na: 1.35, k1: 0.1 })).toThrow(OutOfLimitError);
  });

  it('NaN 입력을 흘려보내지 않는다', () => {
    expect(() => oxideThickness({ tempC: Number.NaN, timeH: 1, ambient: 'wet', orientation: '111' }))
      .toThrow(OutOfLimitError);
    expect(() => resolution({ lambdaNm: 193, na: Number.NaN, k1: 0.3 })).toThrow(OutOfLimitError);
  });
});

describe('A14-4 단위 일관성', () => {
  const samples: Array<[string, Quantity, string]> = [
    ['산화 두께', oxideThickness({ tempC: 1000, timeH: 1, ambient: 'wet', orientation: '111' }), 'µm'],
    ['산화 시간', timeForThickness({ targetUm: 0.5, tempC: 1000, ambient: 'wet', orientation: '111' }), 'h'],
    ['Si 소모', siliconConsumed(0.5), 'µm'],
    ['해상도', resolution(PHOTO_OK), 'nm'],
    ['DOF', depthOfFocusArFImmersion({ lambdaNm: 193, na: 1.35 }), 'nm'],
  ];
  for (const [name, q, unit] of samples) {
    it(`${name} 의 단위가 ${unit} 다`, () => expect(q.unit).toBe(unit));
  }

  it('무차원 출력은 빈 문자열 단위를 명시한다 (undefined 가 아니다)', () => {
    expect(dofRatio({ naFrom: 1, naTo: 1 }).unit).toBe('');
    expect(requiredK1({ targetCdNm: 40, lambdaNm: 193, na: 1.35 }).unit).toBe('');
  });

  it('차원 검사 — 시간 단위를 2배로 넣으면 두께가 단조 증가한다', () => {
    const a = oxideThickness({ tempC: 1000, timeH: 1, ambient: 'wet', orientation: '111' }).value;
    const b = oxideThickness({ tempC: 1000, timeH: 2, ambient: 'wet', orientation: '111' }).value;
    expect(b).toBeGreaterThan(a);
  });

  it('포물선 영역에서 두께는 √t 에 비례한다 (차원 정합)', () => {
    // t ≫ A²/4B 에서 x ≈ √(Bt) 이므로 t 를 4배 하면 x 는 약 2배가 된다
    const x1 = oxideThickness({ tempC: 1200, timeH: 100, ambient: 'wet', orientation: '111' }).value;
    const x4 = oxideThickness({ tempC: 1200, timeH: 400, ambient: 'wet', orientation: '111' }).value;
    expect(x4 / x1).toBeGreaterThan(1.9);
    expect(x4 / x1).toBeLessThan(2.05);
  });

  it('문헌값에는 sourceId 가 있고, 합성값에는 없다 (A6 정제)', () => {
    // 🔴 「모든 Quantity 에 sourceId」가 아니다 — 합성값에는 출처가 **없는 것이 사실**이다.
    //    빌린 S번호를 달게 하던 종전 규칙이 83개 출력의 출처 도용을 낳았다(오케스트레이터 판정 2026-08-20).
    for (const [, q] of samples) {
      if (q.kind === 'literature') expect(q.sourceId ?? '').not.toBe('');
      else expect(q.sourceId).toBeUndefined();
    }
  });
});
