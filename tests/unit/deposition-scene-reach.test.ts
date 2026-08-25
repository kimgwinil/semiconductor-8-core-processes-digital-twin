// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import { DEPOSITION_LABS } from '@/models/labs/deposition';
import type { LabSpec } from '@/models/labs/spec';
import { ionTrajectoryModel } from '@/viz/gl/scenes/models/ionTrajectory.model';

/**
 * 🔴 **`ionTrajectory` 씬의 `scatter` 배선 회귀 방지** (2026-08-22 신설).
 *
 * 종전 상태: 랩이 `energy`·`dose` 두 키만 넘겼고 `scatter` 는 씬 기본값 **0.3 에 얼어 있었다.**
 * 씬의 `scatter` 는 깊이–농도 가우시안의 폭 σ 를 벌리는 **유일한** 파라미터인데
 * (`ionSigma(energy, scatter)` · `SCATTER_STRAGGLE_GAIN`), 랩은 같은 양(종방향 straggle)을
 * 슬라이더로 받고 어닐로 넓히면서 **화면에는 한 픽셀도 반영하지 못했다.**
 * 피드백 DEP-A5(「ΔR_p 가 크면 봉우리가 낮아진다」)·DEP-X1(「σ′ 가 커지면 접합이 뭉개진다」)이
 * 가르치는 것과 그림이 반대였다 — 2026-08-21 CMP 씬 결함 ❌-2 와 같은 종류다.
 *
 * 🔴 **부분문자열 검사를 쓰지 않는다.** 전부 실제 `compute()` → `scene.map()` → 씬 모델
 *    (`ionTrajectoryModel`) 경로를 태워 **수치로** 단언한다.
 */

/* ---------------- 검증 설정 (제품 상수가 아니다) ---------------- */

/** 슬라이더 정의역 — 랩 선언과 같은 수를 여기서 다시 박아 둔다(갈라지면 아래 §정의역 결속이 깨진다). */
const RP_MIN_NM = 50;
const RP_MAX_NM = 400;
const DELTA_RP_MIN_NM = 10;
const DELTA_RP_MAX_NM = 120;
/** 어닐 슬라이더 정의역(심화). */
const ANNEAL_TIME_MIN_S = 1;
const ANNEAL_TIME_MAX_S = 120;
const ANNEAL_TEMP_MIN_K = 1173;
const ANNEAL_TEMP_MAX_K = 1373;
/** 스윕 표본 수. */
const STEPS = 24;
/** 「얼어 있지 않다」의 최소 진폭 — 씬 σ 가 스윕 양끝에서 최소 이 배수만큼 벌어져야 한다. */
const MIN_SIGMA_SPREAD = 1.5;

function labOf(stage: string): LabSpec {
  const s = DEPOSITION_LABS.find((x) => x.stage === stage);
  expect(s, `deposition ${stage} 랩이 없다`).toBeDefined();
  return s as LabSpec;
}

const applied = labOf('lab-applied');
const advanced = labOf('lab-advanced');

/** 랩 출력 Quantity 를 순수 수치로 편다. */
function values(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(lab.compute(inputs))) out[k] = (v as { value: number }).value;
  return out;
}

/** 실제 배선(`lab.scene`)을 그대로 태워 씬 파라미터를 얻는다. */
function sceneParams(lab: LabSpec, inputs: Record<string, number>): Record<string, number> {
  const scene = lab.scene;
  expect(scene, '씬 배선이 없다').toBeDefined();
  expect(scene!.sceneId).toBe('ionTrajectory');
  return scene!.map(inputs, values(lab, inputs));
}

/** 씬 모델까지 태운다 — 화면이 실제로 쓰는 파생값이다. */
function sceneModel(lab: LabSpec, inputs: Record<string, number>) {
  return ionTrajectoryModel(sceneParams(lab, inputs));
}

function sweep(lo: number, hi: number, steps = STEPS): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps);
}

/** 인덱스 접근이 `undefined` 를 섞지 않게 한 자리에서 확인한다(tsconfig `noUncheckedIndexedAccess`). */
function num(v: number | undefined): number {
  expect(v, '수치가 없다').toBeTypeOf('number');
  return v as number;
}
function first<T>(xs: readonly T[]): T {
  expect(xs.length, '스윕 표본이 비었다').toBeGreaterThan(0);
  return xs[0] as T;
}
function last<T>(xs: readonly T[]): T {
  expect(xs.length, '스윕 표본이 비었다').toBeGreaterThan(0);
  return xs[xs.length - 1] as T;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. 정의역 결속 — 정규화 분모가 슬라이더 상한과 같은 수여야 한다
 * ══════════════════════════════════════════════════════════════════════════ */
describe('ionTrajectory 매핑 — 정규화 분모가 슬라이더 정의역에 묶여 있다', () => {
  it('응용: R_p 를 상한까지 밀면 energy 가 정확히 1, ΔR_p 상한에서 scatter 가 정확히 1', () => {
    const p = sceneParams(applied, { rpNm: RP_MAX_NM, deltaRpNm: DELTA_RP_MAX_NM });
    expect(p['energy']).toBeCloseTo(1, 12);
    expect(p['scatter']).toBeCloseTo(1, 12);
  });

  it('응용: 슬라이더 선언의 max 와 매핑 분모가 같다(랩 선언에서 직접 읽는다)', () => {
    const rp = applied.params.find((x) => x.id === 'rpNm');
    const drp = applied.params.find((x) => x.id === 'deltaRpNm');
    expect(rp?.max).toBe(RP_MAX_NM);
    expect(drp?.max).toBe(DELTA_RP_MAX_NM);
    // 상한의 절반을 넣으면 정확히 0.5 여야 한다 — 비율 정규화이지 min-max 정규화가 아니다.
    const p = sceneParams(applied, { rpNm: RP_MAX_NM / 2, deltaRpNm: DELTA_RP_MAX_NM / 2 });
    expect(p['energy']).toBeCloseTo(0.5, 12);
    expect(p['scatter']).toBeCloseTo(0.5, 12);
  });

  it('씬이 읽지 않는 키를 넘기지 않는다(V4) — 키 집합이 {energy, dose, scatter} 다', () => {
    const readable = new Set(['energy', 'dose', 'tilt', 'scatter']);
    for (const lab of [applied, advanced]) {
      const keys = Object.keys(sceneParams(lab, {}));
      for (const k of keys) expect(readable.has(k), `씬이 읽지 않는 키 '${k}'`).toBe(true);
      expect(keys.sort()).toEqual(['dose', 'energy', 'scatter']);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. 응용(S6) — ΔR_p 슬라이더가 화면 프로파일 폭을 실제로 움직인다
 * ══════════════════════════════════════════════════════════════════════════ */
describe('응용 — ΔR_p 최소~최대 스윕에서 화면이 얼어 있지 않다', () => {
  const base = { rpNm: 100, doseE14: 1, beamCurrentMA: 1 };
  const models = sweep(DELTA_RP_MIN_NM, DELTA_RP_MAX_NM).map(
    (deltaRpNm) => ({ deltaRpNm, m: sceneModel(applied, { ...base, deltaRpNm }) }),
  );

  it('σ(프로파일 폭)가 전 구간 단조 증가한다', () => {
    let prev = -Infinity;
    for (const { deltaRpNm, m } of models) {
      expect(m.sigma, `ΔR_p=${deltaRpNm} nm 에서 σ 가 감소했다`).toBeGreaterThan(prev);
      prev = m.sigma;
    }
  });

  it('σ 가 양끝에서 충분히 벌어진다 — 상수로 얼어 있으면 여기서 잡힌다', () => {
    const lo = first(models).m.sigma;
    const hi = last(models).m.sigma;
    expect(hi / lo).toBeGreaterThan(MIN_SIGMA_SPREAD);
    // 종전 결함 상태(=씬 기본값 0.3 고정)의 σ 는 스윕 내내 이 한 값이었다.
    const frozen = ionTrajectoryModel({ energy: 100 / RP_MAX_NM, dose: 0.5 }).sigma;
    expect(lo).not.toBeCloseTo(frozen, 6);
    expect(hi).not.toBeCloseTo(frozen, 6);
  });

  it('이온별 비정 산포(straggleLo·straggleHi)와 좌우 흐트러짐도 함께 벌어진다', () => {
    let prevHi = -Infinity;
    let prevLat = -Infinity;
    for (const { m } of models) {
      expect(m.straggleHi).toBeGreaterThan(prevHi);
      expect(m.lateralGain).toBeGreaterThan(prevLat);
      prevHi = m.straggleHi;
      prevLat = m.lateralGain;
    }
    expect(last(models).m.straggleHi / first(models).m.straggleHi).toBeGreaterThan(1.4);
  });

  it('같은 도즈에서 ΔR_p 를 넓히면 봉우리는 낮아진다 — DEP-A5 와 그림이 같은 방향이다', () => {
    let prev = Infinity;
    for (const { deltaRpNm, m } of models) {
      expect(m.peakConcentration, `ΔR_p=${deltaRpNm} nm 에서 봉우리가 올라갔다`).toBeLessThan(prev);
      prev = m.peakConcentration;
    }
  });

  it('🔴 응용 칸은 σ′ 출력을 갖지 않는다 — 매핑이 조건 입력 ΔR_p 에서 읽어야 한다', () => {
    const out = values(applied, { ...base, deltaRpNm: 73.5 });
    expect(Object.keys(out)).not.toContain('straggleNm');
    const p = sceneParams(applied, { ...base, deltaRpNm: 73.5 });
    expect(p['scatter']).toBeCloseTo(73.5 / DELTA_RP_MAX_NM, 12);
  });

  it('R_p 스윕도 살아 있다 — 봉우리 깊이가 단조 증가한다', () => {
    let prev = -Infinity;
    for (const rpNm of sweep(RP_MIN_NM, RP_MAX_NM)) {
      const m = sceneModel(applied, { ...base, rpNm, deltaRpNm: 73.5 });
      expect(m.rangePeak, `R_p=${rpNm} nm 에서 봉우리 깊이가 감소했다`).toBeGreaterThan(prev);
      prev = m.rangePeak;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. 심화(S7) — 어닐이 화면 프로파일 폭에 실제로 나타난다
 * ══════════════════════════════════════════════════════════════════════════ */
describe('심화 — 어닐이 화면에 남는다 (scatter ← 출력 σ′)', () => {
  const base = {
    cycles: 220, tempC: 200, rpNm: 100, deltaRpNm: 30,
    doseE14: 2.5, beamCurrentMA: 1, annealTempK: ANNEAL_TEMP_MAX_K,
  };

  it('어닐 시간 1→120 s 스윕에서 σ′ · scatter · 화면 σ 가 함께 단조 증가한다', () => {
    let prevStraggle = -Infinity;
    let prevScatter = -Infinity;
    let prevSigma = -Infinity;
    for (const annealTimeS of sweep(ANNEAL_TIME_MIN_S, ANNEAL_TIME_MAX_S)) {
      const inputs = { ...base, annealTimeS };
      const out = values(advanced, inputs);
      const p = sceneParams(advanced, inputs);
      const m = ionTrajectoryModel(p);
      const straggleNm = num(out['straggleNm']);
      const scatter = num(p['scatter']);
      expect(straggleNm, `t_a=${annealTimeS} s 에서 σ′ 가 감소했다`).toBeGreaterThan(prevStraggle);
      expect(scatter, `t_a=${annealTimeS} s 에서 scatter 가 감소했다`).toBeGreaterThan(prevScatter);
      expect(m.sigma, `t_a=${annealTimeS} s 에서 화면 σ 가 감소했다`).toBeGreaterThan(prevSigma);
      prevStraggle = straggleNm;
      prevScatter = scatter;
      prevSigma = m.sigma;
    }
  });

  it('어닐 온도 1173→1373 K 스윕에서도 화면 σ 가 단조 증가한다', () => {
    let prev = -Infinity;
    for (const annealTempK of sweep(ANNEAL_TEMP_MIN_K, ANNEAL_TEMP_MAX_K)) {
      const m = sceneModel(advanced, { ...base, annealTempK, annealTimeS: 60 });
      expect(m.sigma, `T_a=${annealTempK} K 에서 화면 σ 가 감소했다`).toBeGreaterThan(prev);
      prev = m.sigma;
    }
  });

  it('🔴 scatter 는 조건 입력 ΔR_p 가 아니라 어닐 후 σ′ 를 읽는다 — 같은 ΔR_p 에서 값이 달라진다', () => {
    const cold = sceneParams(advanced, { ...base, annealTempK: ANNEAL_TEMP_MIN_K, annealTimeS: 1 });
    const hot = sceneParams(advanced, { ...base, annealTempK: ANNEAL_TEMP_MAX_K, annealTimeS: 120 });
    const coldScatter = num(cold['scatter']);
    const hotScatter = num(hot['scatter']);
    // ΔR_p 는 두 경우 모두 30 nm 로 같다. 조건 입력을 읽었다면 두 값이 같아야 한다.
    expect(coldScatter).not.toBeCloseTo(hotScatter, 6);
    expect(hotScatter).toBeGreaterThan(coldScatter);
    // 어닐 전 폭(= ΔR_p) 보다 반드시 넓다 — σ′ = √(ΔR_p² + 2Dt) 의 직접 귀결이다.
    expect(hotScatter).toBeGreaterThan(base.deltaRpNm / DELTA_RP_MAX_NM);
  });

  it('어닐이 봉우리를 낮추는 것과 옆으로 퍼뜨리는 것이 한 화면에 함께 나온다', () => {
    const short = sceneModel(advanced, { ...base, annealTimeS: ANNEAL_TIME_MIN_S });
    const long = sceneModel(advanced, { ...base, annealTimeS: ANNEAL_TIME_MAX_S });
    expect(long.sigma).toBeGreaterThan(short.sigma);
    expect(long.peakConcentration).toBeLessThan(short.peakConcentration);
  });
});
