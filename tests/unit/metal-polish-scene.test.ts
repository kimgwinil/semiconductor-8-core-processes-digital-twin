// 🔴 등급 리졸버 설치(부수효과). 물리층 모듈을 배럴 없이 직접 import 하므로 여기서 명시한다 —
// 없으면 문헌값이 등급 미상으로 떨어져 sourceId 가 조용히 사라진다(2026-08-20).
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { METAL_LABS } from '@/models/labs/metal';
import type { LabSpec } from '@/models/labs/spec';

/**
 * 🔴 씬 결함 ❌-2 회귀 방지 — **CMP 씬에서 Preston 항이 상쇄되던 버그**(D-008 위반, 2026-08-21 수정).
 *
 * 종전 매핑은 `time = polishTimeMin / 사이클예산` 이었다. `polishTimeMin = 306 nm / MRR` 이고
 * `MRR ∝ P·V` 이므로, 씬의 `removal = pressure × speed × time` 에서 **P·V 가 정확히 상쇄**됐다.
 * 실측: 하중 24.76 kPa 고정으로 회전수를 80 → 200 rpm 까지 흔들어도 removal 이 **0.048998 로 불변**,
 * 전 구간 최댓값도 0.0549 뿐이라 화면 하강이 2 px 이하로 슬러리 스페클에 묻혔다.
 * 그런데 같은 랩의 피드백 **MT-B3 은 「Preston 식에서 하중과 상대속도는 대등하다」고 가르친다** —
 * 글과 그림이 반대였다. 이 파일은 그 상태로 되돌아가는 것을 막는다.
 *
 * 🔴 **부분문자열 검사를 쓰지 않는다.** 전부 실제 `compute()` → `scene.map()` 경로를 태워 수치로 단언한다.
 */

/** 스윕 구간·표본은 **검증 설정**이므로 이 파일이 소유한다(제품 상수가 아니다). */
const PRESSURE_MIN_KPA = 4;
const PRESSURE_MAX_KPA = 66;
const RPM_MIN = 10;
const RPM_MAX = 200;
/** 기본값 — 슬라이더 initial (S200 Table 2 문헌 조건). */
const PRESSURE_DEFAULT_KPA = 24.76;
const RPM_DEFAULT = 80;
/** Preston 등가성 상대오차 허용치. 두 경로 모두 같은 부동소수 곱셈이라 사실상 비트 동일해야 한다. */
const EQUIVALENCE_REL_EPS = 1e-9;

function labOf(stage: string): LabSpec {
  const s = METAL_LABS.find((x) => x.stage === stage);
  expect(s, `metal ${stage} 랩이 없다`).toBeDefined();
  return s as LabSpec;
}

const basic = labOf('lab-basic');

/** 씬 파라미터(0~1) 3키. 실제 UI 경로(LabRunner)와 같은 순서로 태운다. */
function sceneParams(pressureKPa: number, platenRpm: number): Record<string, number> {
  const inputs = { pressureKPa, platenRpm };
  const q = basic.compute(inputs);
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(q)) values[k] = (v as { value: number }).value;
  const scene = basic.scene;
  expect(scene, 'lab-basic 에 씬 바인딩이 없다').toBeDefined();
  return scene!.map(inputs, values);
}

/** 셰이더 `removal()` 과 같은 식 — `clamp(uPressure * uSpeed * uTimeP, 0, 1)`. */
function removal(pressureKPa: number, platenRpm: number): number {
  const p = sceneParams(pressureKPa, platenRpm);
  const v = (p['pressure'] as number) * (p['speed'] as number) * (p['time'] as number);
  return Math.min(1, Math.max(0, v));
}

describe('CMP 씬 매핑 — 세 랩이 같은 매핑을 쓴다', () => {
  it('기초·응용·심화가 동일한 map 함수를 공유한다', () => {
    const maps = METAL_LABS.map((l) => l.scene?.map);
    for (const m of maps) expect(m).toBeDefined();
    for (const m of maps) expect(m).toBe(maps[0]);
  });
  it('note 가 새 의미(사이클 예산 고정)를 설명한다 — 옛 문장(연마 소요시간)이 아니다', () => {
    const note = basic.scene?.note ?? '';
    expect(note.includes('표준 사이클 예산 135 s 전량으로 고정')).toBe(true);
    expect(note.includes('연마 소요시간 / 사이클 예산')).toBe(false);
  });
});

describe('CMP 씬 — 하중·회전수가 화면 제거량에 살아 있다', () => {
  it('하중을 올리면 removal 이 오른다 (전 구간 단조 증가)', () => {
    const steps = 20;
    let prev = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const p = PRESSURE_MIN_KPA + ((PRESSURE_MAX_KPA - PRESSURE_MIN_KPA) * i) / steps;
      const r = removal(p, RPM_DEFAULT);
      expect(r, `P=${p} kPa 에서 removal 이 감소했다`).toBeGreaterThan(prev);
      prev = r;
    }
  });

  it('회전수를 올리면 removal 이 오른다 (종전 버그: 여기가 완전히 평평했다)', () => {
    const steps = 20;
    let prev = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const rpm = RPM_MIN + ((RPM_MAX - RPM_MIN) * i) / steps;
      const r = removal(PRESSURE_DEFAULT_KPA, rpm);
      expect(r, `${rpm} rpm 에서 removal 이 감소했다`).toBeGreaterThan(prev);
      prev = r;
    }
  });

  it('하중 하한 4 kPa 에서도 removal 이 0 이 아니다 (min-max 정규화 → 비율 정규화)', () => {
    // 종전 `(P−4)/(66−4)` 는 하한에서 pressure = 0 → removal = 0 이었다.
    // 4 kPa 에서도 연마는 된다. 0 으로 죽이면 화면이 물리를 거짓말한다.
    expect(removal(PRESSURE_MIN_KPA, RPM_DEFAULT)).toBeGreaterThan(0);
  });
});

describe('🔴 Preston 등가성 — 하중 2배와 회전수 2배가 화면에서 같다 (MT-B3 가 가르치는 것)', () => {
  const base = removal(PRESSURE_DEFAULT_KPA, RPM_DEFAULT);

  it('기준값이 유한하고 0 이 아니다', () => {
    expect(Number.isFinite(base)).toBe(true);
    expect(base).toBeGreaterThan(0);
  });

  it('하중 2배 ≡ 회전수 2배 (상대오차 1e-9 이내)', () => {
    const byLoad = removal(PRESSURE_DEFAULT_KPA * 2, RPM_DEFAULT);
    const bySpeed = removal(PRESSURE_DEFAULT_KPA, RPM_DEFAULT * 2);
    const rel = Math.abs(byLoad - bySpeed) / Math.max(byLoad, bySpeed);
    expect(rel, `하중 2배 ${byLoad} vs 회전수 2배 ${bySpeed}`).toBeLessThanOrEqual(EQUIVALENCE_REL_EPS);
  });

  it('둘 다 기준의 2배다 (removal ∝ P·V)', () => {
    expect(removal(PRESSURE_DEFAULT_KPA * 2, RPM_DEFAULT) / base).toBeCloseTo(2, 9);
    expect(removal(PRESSURE_DEFAULT_KPA, RPM_DEFAULT * 2) / base).toBeCloseTo(2, 9);
  });

  it('여러 배수에서도 등가성이 유지된다', () => {
    for (const k of [1.5, 2, 2.5]) {
      const byLoad = removal(PRESSURE_DEFAULT_KPA * k, RPM_DEFAULT);
      const bySpeed = removal(PRESSURE_DEFAULT_KPA, RPM_DEFAULT * k);
      const rel = Math.abs(byLoad - bySpeed) / Math.max(byLoad, bySpeed);
      expect(rel, `k=${k}: ${byLoad} vs ${bySpeed}`).toBeLessThanOrEqual(EQUIVALENCE_REL_EPS);
    }
  });
});

describe('🔴 회귀 방지 — removal 이 상수로 되돌아가지 않는다', () => {
  it('하중·회전수 격자 25조합이 23개의 서로 다른 removal 로 갈라진다', () => {
    // 종전 매핑에서는 P 만으로 결정돼 25조합이 **5값**으로 접혔고 회전수 축은 완전히 죽어 있었다.
    //
    // 🔴 25 가 아니라 **23** 이 정답이다 — `removal ∝ P·V ∝ P·rpm` 이므로 P·rpm 곱이 같은
    //    두 쌍 (4 kPa·200 rpm ≡ 10 kPa·80 rpm), (10 kPa·200 rpm ≡ 40 kPa·50 rpm) 은
    //    **Preston 등가라서 겹치는 것이 정상**이다. 겹침이 사라지면 등가성이 깨진 것이다.
    //    (부동소수 최하위비트 차이 때문에 `Set` 의 정확 비교로는 24 가 나온다 → 상대허용으로 묶는다.)
    const REL = 1e-12;
    const groups: number[] = [];
    for (const p of [4, 10, 24.76, 40, 66]) {
      for (const rpm of [10, 50, 80, 130, 200]) {
        const r = removal(p, rpm);
        if (!groups.some((g) => Math.abs(g - r) <= Math.max(g, r) * REL)) groups.push(r);
      }
    }
    expect(groups.length, `서로 다른 removal ${groups.length}개 (25조합)`).toBe(23);
  });

  it('겹치는 두 쌍은 P·rpm 곱이 같은 Preston 등가 조합이다', () => {
    const REL = 1e-12;
    for (const [a, b] of [
      [[4, 200], [10, 80]],
      [[10, 200], [40, 50]],
    ] as Array<[[number, number], [number, number]]>) {
      const ra = removal(a[0], a[1]);
      const rb = removal(b[0], b[1]);
      expect(Math.abs(ra - rb) / Math.max(ra, rb), `${a} ${ra} vs ${b} ${rb}`).toBeLessThanOrEqual(REL);
    }
  });

  it('회전수만 바꿔도 removal 이 반드시 변한다', () => {
    // 종전: 80 / 100 / 160 / 200 rpm 이 전부 0.048997727 로 동일했다.
    const vals = [80, 100, 160, 200].map((rpm) => removal(PRESSURE_DEFAULT_KPA, rpm));
    expect(new Set(vals).size).toBe(vals.length);
  });

  it('씬의 time 축은 polishTimeMin 과 무관하다 (역수 상쇄 경로 차단)', () => {
    // polishTimeMin 은 조건에 따라 58.5 min ~ 0.18 min 으로 300배 넘게 움직인다.
    const times = new Set<number>();
    const polishTimes = new Set<number>();
    for (const p of [4, 24.76, 66]) {
      for (const rpm of [10, 80, 200]) {
        times.add(sceneParams(p, rpm)['time'] as number);
        const q = basic.compute({ pressureKPa: p, platenRpm: rpm });
        polishTimes.add((q['polishTimeMin'] as { value: number }).value);
      }
    }
    expect(polishTimes.size, 'polishTimeMin 이 조건마다 달라야 이 검사가 의미를 갖는다').toBe(9);
    expect(times.size, 'time 축이 조건에 따라 흔들린다 = 역수 상쇄 경로가 살아 있다').toBe(1);
  });
});

describe('A14 — 씬 파라미터 경계 스윕에서 NaN·Infinity 0건', () => {
  it('슬라이더 전 구간 격자에서 3키가 모두 유한하고 0~1 안에 있다', () => {
    const bad: string[] = [];
    const steps = 12;
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; b <= steps; b++) {
        const p = PRESSURE_MIN_KPA + ((PRESSURE_MAX_KPA - PRESSURE_MIN_KPA) * a) / steps;
        const rpm = RPM_MIN + ((RPM_MAX - RPM_MIN) * b) / steps;
        const params = sceneParams(p, rpm);
        for (const key of ['pressure', 'speed', 'time']) {
          const v = params[key];
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
            bad.push(`${key}@(${p.toFixed(2)} kPa, ${rpm} rpm) = ${String(v)}`);
          }
        }
        const r = removal(p, rpm);
        if (!Number.isFinite(r) || r < 0 || r > 1) bad.push(`removal@(${p}, ${rpm}) = ${r}`);
      }
    }
    expect(bad, `범위 이탈 ${bad.length}건: ${bad.slice(0, 5).join(' / ')}`).toHaveLength(0);
  });

  it('네 모서리(최소·최대 조합)에서도 유한하다', () => {
    for (const [p, rpm] of [
      [PRESSURE_MIN_KPA, RPM_MIN], [PRESSURE_MIN_KPA, RPM_MAX],
      [PRESSURE_MAX_KPA, RPM_MIN], [PRESSURE_MAX_KPA, RPM_MAX],
    ] as Array<[number, number]>) {
      const r = removal(p, rpm);
      expect(Number.isFinite(r), `(${p} kPa, ${rpm} rpm) → ${r}`).toBe(true);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe('화면 진폭 — 기본 조건의 표면 하강이 슬러리 스페클 위로 올라온다', () => {
  /**
   * 셰이더 깊이 상수(`polishProfile.ts`): 전면 0.20 · 디싱 +0.15 · 에로전 +0.09 (세로 0~1 정규화).
   * 🔴 **가정** — 캔버스 세로 픽셀을 400 px 로 잡았다. 실제 캔버스는 360~420 px 사이에서 움직인다.
   *    슬러리 스페클 노이즈는 ±6 px 로 관측됐다(팀장 측정, 2026-08-21).
   */
  const CANVAS_H_PX = 400;
  const DEPTH_FLAT = 0.20;
  const SPECKLE_PX = 6;

  it('기본 조건(24.76 kPa · 80 rpm)의 전면 하강이 스페클(6 px) 보다 크다', () => {
    const dropPx = removal(PRESSURE_DEFAULT_KPA, RPM_DEFAULT) * DEPTH_FLAT * CANVAS_H_PX;
    expect(dropPx, `전면 하강 ${dropPx.toFixed(2)} px`).toBeGreaterThan(SPECKLE_PX);
  });

  it('최대 조건에서도 평탄부가 트렌치 바닥(0.18)을 넘어 파이지 않는다', () => {
    // BASE_TOP 0.52 − TRENCH_BOT 0.34 = 0.18. 평탄부가 여기를 넘으면 웨이퍼 적층이 무너진다.
    const drop = removal(PRESSURE_MAX_KPA, RPM_MAX) * DEPTH_FLAT;
    expect(drop, `최대 조건 평탄부 하강 ${drop.toFixed(4)}`).toBeLessThan(0.18);
  });
});
