// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(metal-polish-scene.test.ts 와 같은 이유).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { OXIDATION_LABS } from '@/models/labs/oxidation';
import type { LabSpec } from '@/models/labs/spec';
import {
  filmGrowthModel,
  FILM_MAX,
  ORIG_SURFACE,
  SI_CONSUMED_FRACTION,
} from '@/viz/gl/scenes/models/filmGrowth.model';

/**
 * 🔴 `oxidation`/lab-basic → `filmGrowth` 씬 배선 회귀 테스트.
 *
 * 지키는 것 (2026-08-22 배선 변경):
 *   기초 칸의 `scene.map` 이 씬에 넘기는 총 두께를 **랩 출력 `siConsumedNm` + `surfaceRiseNm` 의 합**
 *   으로 적는다. 씬 `filmGrowth` 가 받은 총 두께를 원표면(ORIG_SURFACE) 기준으로
 *   「아래로 파고든 몫 = 소모 Si」와 「위로 융기한 몫 = 표면 융기」로 갈라 그리고, 그 가름 상수가
 *   랩의 `siConsumedNm` 을 만드는 것과 **같은 S121 §4.1 의 0.44**(물리층 `SI_CONSUMPTION_RATIO`)라서다.
 *   → 그래서 **화면의 계면 하강량이 곧 랩의 `siConsumedNm`** 이다. 이 파일이 그것을 수치로 세운다.
 *
 * 🔴 부분문자열 검사를 쓰지 않는다. 전부 실제 `compute()` → `scene.map()` → `filmGrowthModel()`
 *    경로를 태워 수치로 단언한다.
 */

/** 스윕 구간·표본은 **검증 설정**이므로 이 파일이 소유한다(제품 상수가 아니다). */
const TIME_MIN_MIN = 10;   // 기초 칸 `timeMin` 슬라이더 하한
const TIME_MIN_MAX = 300;  // 상한
const TIME_STEPS = 24;
const TEMP_DEFAULT_C = 1000;
/** 항등식 x_Si + x_up ≡ x_ox 의 상대오차 허용치. 같은 부동소수 뺄셈의 역이라 사실상 비트 동일해야 한다. */
const IDENTITY_REL_EPS = 1e-12;

const basic = OXIDATION_LABS.find((l) => l.stage === 'lab-basic') as LabSpec;

/** 랩 출력을 UI 경로(LabRunner)와 같은 형태(숫자 맵)로 편다. */
function outputsOf(tempC: number, timeMin: number): Record<string, number> {
  const q = basic.compute({ tempC, timeMin });
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(q)) values[k] = (v as { value: number }).value;
  return values;
}

/** 실제 배선 경로: compute() → scene.map() → 씬 파라미터. */
function sceneParams(tempC: number, timeMin: number): Record<string, number> {
  const scene = basic.scene;
  expect(scene, 'oxidation/lab-basic 에 씬 바인딩이 없다').toBeDefined();
  return scene!.map({ tempC, timeMin }, outputsOf(tempC, timeMin));
}

/** 화면값: 씬 모델이 계산하는 계면 하강량·막 상면 융기량(UV). */
function screen(tempC: number, timeMin: number) {
  return filmGrowthModel(sceneParams(tempC, timeMin));
}

describe('oxidation/lab-basic → filmGrowth — 배선이 실제로 그 씬에 붙어 있다', () => {
  it('기초 칸이 filmGrowth 씬에 배선돼 있고, 넘기는 키가 씬이 읽는 키뿐이다', () => {
    expect(basic.scene?.sceneId).toBe('filmGrowth');
    const keys = Object.keys(sceneParams(TEMP_DEFAULT_C, 150)).sort();
    // 씬이 읽는 키는 thickness·roughness·tint·uniformity 넷이다. 그 밖의 키를 넘기면 V4 위반이다.
    for (const k of keys) expect(['thickness', 'roughness', 'tint', 'uniformity']).toContain(k);
    expect(keys).toEqual(['thickness', 'uniformity']);
  });
});

describe('oxidation/lab-basic — x_Si + x_up ≡ x_ox (매핑이 값을 바꾸지 않았다)', () => {
  it('전 시간 구간에서 소모 Si + 표면 융기 = 산화막 두께', () => {
    for (let i = 0; i <= TIME_STEPS; i++) {
      const timeMin = TIME_MIN_MIN + ((TIME_MIN_MAX - TIME_MIN_MIN) * i) / TIME_STEPS;
      const o = outputsOf(TEMP_DEFAULT_C, timeMin);
      const sum = (o['siConsumedNm'] as number) + (o['surfaceRiseNm'] as number);
      const x = o['thicknessNm'] as number;
      expect(Math.abs(sum - x) / x, `t=${timeMin} min 에서 항등식이 깨졌다`).toBeLessThan(IDENTITY_REL_EPS);
    }
  });

  it('씬에 넘어가는 thickness 가 종전 식(x_ox/300)과 같은 값이다 — 화면이 바뀌지 않았다', () => {
    for (const timeMin of [10, 60, 150, 300]) {
      const o = outputsOf(TEMP_DEFAULT_C, timeMin);
      const legacy = Math.min(1, Math.max(0, (o['thicknessNm'] as number) / 300));
      expect(sceneParams(TEMP_DEFAULT_C, timeMin)['thickness'] as number).toBeCloseTo(legacy, 12);
    }
  });
});

describe('oxidation/lab-basic — 랩의 소모 Si 가 화면의 계면 하강량으로 살아 있다', () => {
  it('화면 계면 하강량 = siConsumedNm × (FILM_MAX/300) — 두 경로가 같은 수를 낸다', () => {
    for (const timeMin of [10, 60, 150, 300]) {
      const o = outputsOf(TEMP_DEFAULT_C, timeMin);
      const m = screen(TEMP_DEFAULT_C, timeMin);
      // 씬은 총 두께의 SI_CONSUMED_FRACTION 만큼을 원표면 아래로 내린다.
      // 랩의 siConsumedNm 도 같은 0.44 로 만들어졌으므로, 화면값은 랩값의 순수 축척 변환이어야 한다.
      expect(m.siConsumed).toBeCloseTo((o['siConsumedNm'] as number) * (FILM_MAX / 300), 12);
      expect(m.surfaceRise).toBeCloseTo((o['surfaceRiseNm'] as number) * (FILM_MAX / 300), 12);
      // 계면은 원표면 아래, 막 상면은 원표면 위다(그림이 반대말을 하지 않는다).
      expect(m.subTop).toBeLessThan(ORIG_SURFACE);
      expect(m.filmTopMean).toBeGreaterThan(ORIG_SURFACE);
      expect(ORIG_SURFACE - m.subTop).toBeCloseTo(m.siConsumed, 12);
    }
  });

  it('씬이 쓰는 소모비가 랩과 같은 0.44 다 — 화면과 숫자가 같은 뿌리에서 나온다', () => {
    const o = outputsOf(TEMP_DEFAULT_C, 150);
    const ratio = (o['siConsumedNm'] as number) / (o['thicknessNm'] as number);
    expect(ratio).toBeCloseTo(SI_CONSUMED_FRACTION, 12);
  });

  // 🔴 OX-D5 「산화막이 두꺼워질수록 소모 Si 도 늘어난다」가 **화면에서** 성립하는가.
  it('시간 슬라이더 10 → 300 min 전 구간에서 화면 계면 하강량이 단조 증가한다', () => {
    let prev = -Infinity;
    for (let i = 0; i <= TIME_STEPS; i++) {
      const timeMin = TIME_MIN_MIN + ((TIME_MIN_MAX - TIME_MIN_MIN) * i) / TIME_STEPS;
      const m = screen(TEMP_DEFAULT_C, timeMin);
      expect(m.siConsumed, `t=${timeMin} min 에서 계면 하강량이 감소했다`).toBeGreaterThan(prev);
      prev = m.siConsumed;
    }
  });

  // 🔴 「상수로 얼어 있지 않은가」 — 슬라이더 최소~최대에서 화면이 실제로 움직여야 한다.
  it('슬라이더 최소↔최대에서 계면·막 상면이 눈에 보이게 움직인다(상수로 얼지 않았다)', () => {
    const lo = screen(TEMP_DEFAULT_C, TIME_MIN_MIN);
    const hi = screen(TEMP_DEFAULT_C, TIME_MIN_MAX);
    // 실측(1000 °C 건식 ⟨100⟩): t=10 min → x_ox 21.05 nm · t=300 min → 147.83 nm.
    expect(hi.siConsumed - lo.siConsumed).toBeGreaterThan(0.05);   // UV 0.05 = 캔버스 높이의 5 %
    expect(hi.filmTopMean - lo.filmTopMean).toBeGreaterThan(0.06);
    expect(hi.thickness / Math.max(lo.thickness, 1e-9)).toBeGreaterThan(5);
  });

  // 🔴 OX-D1 회귀 — 온도를 올리면 화면의 계면 하강량도 커진다(같은 시간).
  it('온도 920 → 1000 → 1100 °C 에서 화면 계면 하강량이 단조 증가한다', () => {
    const at = (t: number) => screen(t, 150).siConsumed;
    expect(at(1000)).toBeGreaterThan(at(920));
    expect(at(1100)).toBeGreaterThan(at(1000));
  });
});
