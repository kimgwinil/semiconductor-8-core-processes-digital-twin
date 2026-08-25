/**
 * 🔴 **R-DISP-1 — 표시·판정 일치 규칙** (PLN §27 판정 2026-08-22 · 수용기준 AC-N1~N10)
 *
 * 규칙 한 줄:
 *   「판정에 쓰인 실값과 화면에 찍히는 숫자·규격선·한계안내는 **같은 서식 함수 한 번**을 거치며,
 *    그 함수는 『반올림한 표시값을 표시된 규격선과 비교한 결과』가 『실값 판정』과 어긋나거나
 *    표시값이 부호를 잃으면, 자릿수를 **한 단계(+1)만** 올리고, 그래도 어긋나면
 *    부등호 표기(`＞ 35.0`·`＜ 0.0`)로 낸다.」
 *
 * 🔴 **이 파일은 각 수용기준마다 「변이 검사」를 짝으로 붙인다.**
 *    변이 검사 = 「규칙을 되돌리면 무엇이 실패하는가」를 **테스트 안에서 실제로 재현**한 것이다.
 *    각 AC 의 `— 변이` 테스트는 **옛 경로(`formatQuantity` 단독)를 그대로 호출해** 그것이
 *    실제로 거짓을 만들어 냈음을 고정한다. 누군가 `formatJudged` 를 `formatQuantity` 로
 *    되돌리면 짝이 되는 AC 테스트가 **바로 그 값에서** 깨진다.
 *
 * 🔴 **판정은 검사 대상이 아니다.** 합격/불합격은 종전대로 실값으로 내린다 —
 *    이 파일이 고정하는 것은 **학습자가 읽는 문자열**뿐이다.
 *
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { describe, expect, it } from 'vitest';
import '../../src/models/registry';
import { registerAllLabs, labSpec, registeredLabKeys } from '../../src/models/labs';
import {
  formatJudged,
  formatLimit,
  formatQuantity,
  inPassWindow,
  type JudgedDisplay,
  type PassWindow,
} from '@/lib/format';
import type { LabOutput } from '../../src/models/labs/spec';

registerAllLabs();

/**
 * 소스는 Vite 의 `?raw` 글롭으로 읽는다 — **이 저장소에는 `@types/node` 가 없다**
 * (`tests/unit/viz-fallback-parity.test.ts` 와 같은 관례). `node:fs` 를 쓰면 `tsc --noEmit` 이 깨진다.
 */
const RAW = import.meta.glob('/src/ui/sections/LabRunner.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const SRC = (path: string): string => {
  const code = RAW[path];
  if (code === undefined) throw new Error(`소스를 읽지 못했다: ${path} (읽힌 것: ${Object.keys(RAW).join(', ')})`);
  return code;
};

/** 화면이 실제로 내는 문자열. 🔴 부등호 문안은 사전에서 오므로 테스트가 사전 없이 조립한다. */
function shown(r: JudgedDisplay): string {
  if (r.kind === 'above') return `＞ ${r.limitText}`;
  if (r.kind === 'below') return `＜ ${r.limitText}`;
  return r.text;
}

/* ════════════════════════ AC-N1 — 세 경로가 같은 함수를 거친다 ════════════════════════ */

describe('AC-N1 — 값·규격선·정지안내 3경로가 같은 서식 함수를 거친다', () => {
  const runner = SRC('/src/ui/sections/LabRunner.tsx');

  it('`specLabel` 이 `pass.min`·`pass.max` 를 원시 number 로 보간하지 않는다', () => {
    // 종전: `t('lab.specMin', { lo: min })` — `t()` 가 `String(v)` 로 넣어 값과 자릿수가 갈렸다.
    const body = runner.slice(runner.indexOf('function specLabel'));
    const specLabelBody = body.slice(0, body.indexOf('\n}\n') + 3);
    expect(specLabelBody).toContain('formatLimit(');
    // 🔴 서식을 거치지 않은 raw 보간이 남아 있으면 실패한다.
    expect(specLabelBody).not.toMatch(/\{\s*lo:\s*min\b/);
    expect(specLabelBody).not.toMatch(/\{\s*hi:\s*max\b/);
  });

  it('정지 안내(`conditionText`)가 한계값을 서식 없이 찍지 않는다', () => {
    const body = runner.slice(runner.indexOf('function conditionText'));
    const fnBody = body.slice(0, body.indexOf('\n}\n') + 3);
    expect(fnBody).toContain('formatLimit(lo)');
    expect(fnBody).toContain('formatLimit(hi)');
    // 종전 결함: `t('lab.limitAtLeast', { lo, unit })` — 구조분해한 raw number 를 그대로 보간.
    expect(fnBody).not.toMatch(/\{\s*lo\s*,\s*unit\s*\}/);
    expect(fnBody).not.toMatch(/\{\s*hi\s*,\s*unit\s*\}/);
  });

  it('값 표기가 `formatJudged` 를 거친다', () => {
    expect(runner).toContain('formatJudged(q.value, {');
    // 🔴 `domain` 누락 금지(PLN §27-5 E-3) — 빠지면 `outOfRange` 배지가 규칙 밖에 남는다.
    expect(runner).toMatch(/domain:\s*o\.domain\s*\?\?\s*q\.validRange/);
  });

  it('변이 — 규격선과 값이 다른 서식을 쓰면 자릿수가 갈린다(종전 실측 재현)', () => {
    // 「규격 ≥ 0.8 / 값 0.8123」 — 규격선이 값보다 굵게 찍혀 학습자가 대소를 눈으로 셀 수 없었다.
    expect(String(0.8)).toBe('0.8');                 // 종전 경로(`String(min)`)
    expect(formatQuantity(0.8123, 4)).toBe('0.8123'); // 값 경로
    // 규칙 적용 후: 규격선도 같은 digits 로 간다.
    expect(formatLimit(0.8, 4)).toBe('0.8000');
  });
});

/* ════════════════════════ AC-N3 — 불변식 Z ════════════════════════ */

describe('AC-N3 — 불변식 Z · `-0`·`-0.0`·`-0.00` 이 어떤 경로로도 나오지 않는다', () => {
  it('픽스처: v = −1e-9, digits = 1 → `-0.0` 이 아니다', () => {
    const r = formatJudged(-1e-9, { digits: 1, pass: { min: 0 } });
    expect(shown(r)).not.toBe('-0.0');
    expect(shown(r)).toBe('＜ 0.0');
  });

  it('`formatQuantity` 자체도 음의 영 문자열을 못 만든다(전역 불변식)', () => {
    for (const digits of [0, 1, 2, 3, 4]) {
      for (const v of [-1e-9, -1e-30, -0, -0.0000001]) {
        const s = formatQuantity(v, digits);
        expect(s.startsWith('-') && Number(s) === 0).toBe(false);
      }
    }
    expect(formatQuantity(-0.04, 1)).toBe('0.0');
    expect(formatQuantity(-0.004, 2)).toBe('0.00');
  });

  it('변이 — 규칙 이전의 `toFixed` 직행은 실제로 `-0.0` 을 만들었다', () => {
    // 🔴 이것이 결함의 정체다. `Number('-0.0') === -0` 이고 `-0 >= 0` 은 **참**이라
    //    `pass: { min: 0 }` 인 여유 지표 6칸에서 **불합격이 합격으로 읽혔다.**
    expect((-0.04).toFixed(1)).toBe('-0.0');
    expect(Number((-0.04).toFixed(1))).toBe(-0);
    expect(inPassWindow({ min: 0 }, Number((-0.04).toFixed(1)))).toBe(true);   // 화면 = 합격
    expect(inPassWindow({ min: 0 }, -0.04)).toBe(false);                       // 실값 = 불합격
    // 규칙 적용 후에는 그 모순이 화면에 도달하지 못한다.
    expect(shown(formatJudged(-0.04, { digits: 1, pass: { min: 0 } }))).toBe('-0.04');
  });

  it('실제 24칸 전 출력에서 음의 영 문자열이 0건', () => {
    const offenders: string[] = [];
    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/');
      const spec = labSpec(processId!, stage as never);
      if (!spec) continue;
      for (const o of spec.outputs) {
        for (const v of [-1e-9, -0.04, -0.004, -0.4, -0]) {
          const s = shown(formatJudged(v, {
            digits: o.digits,
            pass: o.role === 'judge' ? o.pass : undefined,
            mode: o.displayMode,
          }));
          if (/(^|\s)-0(\.0*)?$/.test(s)) offenders.push(`${key}/${o.id} v=${v} → "${s}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ════════════════════════ AC-N4 / AC-N5 — 재현예 ════════════════════════ */

describe('AC-N4 — deposition/lab-applied/implantTimeS 가 `35.04` 를 낸다', () => {
  const spec = labSpec('deposition', 'lab-applied')!;
  const o = spec.outputs.find((x) => x.id === 'implantTimeS')!;
  const inputs = { rpNm: 100, deltaRpNm: 73.5, doseE14: 3.094, beamCurrentMA: 1 };
  const q = spec.compute(inputs)['implantTimeS']!;

  it('실값은 합격창 밖이다 (max 35)', () => {
    expect(o.pass).toEqual({ max: 35 });
    expect(q.value).toBeGreaterThan(35);
    expect(inPassWindow(o.pass, q.value)).toBe(false);
  });

  it('화면은 `35.04` — 불합격으로 읽힌다', () => {
    expect(shown(formatJudged(q.value, { digits: o.digits, pass: o.pass, mode: o.displayMode })))
      .toBe('35.04');
  });

  it('변이 — 규칙을 되돌리면(`formatQuantity` 단독) 화면이 `35.0`, 즉 합격으로 읽힌다', () => {
    const old = formatQuantity(q.value, o.digits);
    expect(old).toBe('35.0');
    expect(inPassWindow(o.pass, Number(old))).toBe(true);   // 🔴 화면 합격
    expect(inPassWindow(o.pass, q.value)).toBe(false);      // 🔴 내부 불합격
  });
});

describe('AC-N5 — eds/lab-advanced/overdriveMarginUm 이 −0.0153 에서 `-0.02` 를 낸다', () => {
  const o = labSpec('eds', 'lab-advanced')!.outputs.find((x) => x.id === 'overdriveMarginUm')!;

  it('digits 1 · pass.min 0 인 것을 먼저 고정한다', () => {
    expect(o.digits).toBe(1);
    expect(o.pass).toEqual({ min: 0 });
  });

  it('화면은 `-0.02`', () => {
    expect(shown(formatJudged(-0.0153, { digits: o.digits, pass: o.pass, mode: o.displayMode })))
      .toBe('-0.02');
  });

  it('변이 — 되돌리면 `0.0`(부호 소실 → 합격으로 읽힘)', () => {
    expect((-0.0153).toFixed(1)).toBe('-0.0');
    expect(inPassWindow(o.pass, Number((-0.0153).toFixed(1)))).toBe(true);
    expect(inPassWindow(o.pass, -0.0153)).toBe(false);
  });
});

/* ════════════════════════ AC-N6 — 부등호 표기 · 자릿수 상한 ════════════════════════ */

describe('AC-N6 — +1 로도 안 풀리면 부등호. 자릿수는 digits+1 을 절대 넘지 않는다', () => {
  it('max 35 에 35.000001 → `＞ 35.0`', () => {
    const r = formatJudged(35.000001, { digits: 1, pass: { max: 35 } });
    expect(r.kind).toBe('above');
    expect(shown(r)).toBe('＞ 35.0');
  });

  it('한계선은 그 출력의 digits 로 서식한다', () => {
    expect(shown(formatJudged(0.9300001, { digits: 4, pass: { max: 0.93 } }))).toBe('＞ 0.9300');
    expect(shown(formatJudged(-1e-12, { digits: 2, pass: { min: 0 } }))).toBe('＜ 0.00');
  });

  it('🔴 어떤 입력에서도 표기 자릿수가 digits+1 을 넘지 않는다', () => {
    const digitsList = [0, 1, 2, 3, 4];
    const values = [
      35.000001, 34.9999999, -1e-12, 1e-12, 0.9300000001, 0.0000004,
      -0.0000004, 349.99999999, 350.0000001, 0.08499999999,
    ];
    for (const digits of digitsList) {
      for (const v of values) {
        for (const pass of [{ max: 35 }, { min: 0 }, { min: 0, max: 1 }] as PassWindow[]) {
          const r = formatJudged(v, { digits, pass });
          if (r.kind !== 'value') continue;
          expect(r.digits).toBeLessThanOrEqual(digits + 1);
          const frac = r.text.includes('.') ? r.text.split('.')[1]!.length : 0;
          // 지수 표기는 자릿수 규약이 다르다(가수 3자리) — 소수 표기만 센다.
          if (!/e/i.test(r.text)) expect(frac).toBeLessThanOrEqual(digits + 1);
        }
      }
    }
  });

  it('변이 — 자릿수를 무한 상향하면 정밀도를 과장한다(배제된 대안 ①)', () => {
    // 자릿수를 올려도 경계는 **다시 생긴다.** 35.0399 를 2자리로 고쳐도 35.004 가 남는다.
    expect(formatQuantity(35.004, 2)).toBe('35.00');            // 여전히 합격으로 읽힌다
    expect(inPassWindow({ max: 35 }, Number('35.00'))).toBe(true);
    // 규칙은 자릿수가 아니라 **표기 방식**을 바꿔 그 되풀이를 끊는다.
    expect(shown(formatJudged(35.004, { digits: 2, pass: { max: 35 } }))).toBe('35.004');
    expect(shown(formatJudged(35.00004, { digits: 2, pass: { max: 35 } }))).toBe('＞ 35.00');
  });
});

/* ════════════════════════ AC-N7 — counted 는 자릿수를 올리지 않는다 ════════════════════════ */

describe('AC-N7 — `counted` 9종은 자릿수가 절대 늘지 않는다', () => {
  /** PLN §27-3 지정. 🔴 여기 목록이 곧 명세다 — 명세와 어긋나면 이 테스트가 먼저 깨진다. */
  const COUNTED: ReadonlyArray<readonly [string, string]> = [
    ['eds/lab-applied', 'defectLevelPpm'],
    ['eds/lab-advanced', 'defectLevelPpm'],
    ['eds/lab-basic', 'contactResistanceUOhm'],
    ['eds/lab-advanced', 'contactResistanceUOhm'],
    ['oxidation/lab-advanced', 'oisfDensity'],
    ['metal/lab-applied', 'pitchNm'],
    ['metal/lab-advanced', 'pitchNm'],
    ['packaging/lab-applied', 'floorLifeMarginH'],
    ['packaging/lab-applied', 'acceleratedSoakOk'],
    ['packaging/lab-basic', 'tunnelVelocityOk'],
    ['packaging/lab-basic', 'velocityMeasurementOk'],
    ['packaging/lab-advanced', 'speedMatchesConcern'],
    ['packaging/lab-advanced', 'elapsedWithinWindow'],
  ];

  it('지정한 출력이 전부 `displayMode: "counted"` 로 표시돼 있다', () => {
    const missing: string[] = [];
    for (const [key, id] of COUNTED) {
      const [processId, stage] = key.split('/');
      const o = labSpec(processId!, stage as never)?.outputs.find((x) => x.id === id);
      if (!o) { missing.push(`${key}/${id} — 출력이 없다`); continue; }
      if (o.displayMode !== 'counted') missing.push(`${key}/${id} — displayMode=${String(o.displayMode)}`);
    }
    expect(missing).toEqual([]);
  });

  it('`counted` 는 경계에서 자릿수 대신 부등호로 간다', () => {
    // 1500.4 ppm 을 0.1 ppm 자리까지 적으면 없는 분해능을 주장하게 된다.
    const r = formatJudged(1500.4, { digits: 0, pass: { max: 1500 }, mode: 'counted' });
    expect(r.kind).toBe('above');
    expect(shown(r)).toBe('＞ 1500');
    // 같은 값이 `continuous` 였다면 자릿수를 한 칸 올려 풀었을 것이다.
    expect(shown(formatJudged(1500.4, { digits: 0, pass: { max: 1500 }, mode: 'continuous' })))
      .toBe('1500.4');
  });

  it('`counted` 는 부호 소실에서도 자릿수를 올리지 않는다', () => {
    expect(shown(formatJudged(-0.4, { digits: 0, pass: { min: 0 }, mode: 'counted' }))).toBe('＜ 0');
    expect(shown(formatJudged(-0.4, { digits: 0, pass: { min: 0 }, mode: 'continuous' }))).toBe('-0.4');
  });

  it('플래그 5종은 값이 0·1 이라 규칙이 발동하지 않는다', () => {
    for (const v of [0, 1]) {
      const r = formatJudged(v, { digits: 0, pass: { min: 1, max: 1 }, mode: 'counted' });
      expect(r.kind).toBe('value');
      expect((r as { text: string }).text).toBe(String(v));
    }
  });
});

/* ════════════════════════ AC-N8 — 경계에서 먼 값은 종전과 동일 ════════════════════════ */

describe('AC-N8 — 24칸 초기값 표기가 종전과 문자열 단위로 동일하다', () => {
  it('전 24칸 초기 조건의 모든 출력 표기가 옛 서식과 한 글자도 다르지 않다', () => {
    const diffs: string[] = [];
    let checked = 0;
    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/');
      const spec = labSpec(processId!, stage as never);
      if (!spec) continue;
      const inputs = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      let out: Record<string, { value: number; validRange?: readonly [number, number] }>;
      try { out = spec.compute(inputs) as never; } catch { continue; } // 한계선 정지는 설계된 동작
      for (const o of spec.outputs as LabOutput[]) {
        const q = out[o.id];
        if (!q) continue;
        checked++;
        const before = formatQuantity(q.value, o.digits);
        const after = shown(formatJudged(q.value, {
          digits: o.digits,
          pass: o.role === 'judge' ? o.pass : undefined,
          domain: o.domain ?? q.validRange,
          mode: o.displayMode,
        }));
        if (before !== after) diffs.push(`${key}/${o.id}: "${before}" → "${after}" (실값 ${q.value})`);
      }
    }
    expect(checked).toBeGreaterThan(100);   // 계측이 실제로 돌았는지부터 확인한다
    expect(diffs).toEqual([]);
  });
});

/* ════════════════════════ 규칙의 사정거리 — 미적용 영역 ════════════════════════ */

describe('E-2 · E-3 — 사정거리 밖은 밖인 채로 고정한다', () => {
  it('E-2 `display` 출력에는 합격창을 넣지 않는다 — 모순이 성립하지 않는다', () => {
    // 판정창이 없으므로 「표시가 판정을 뒤집는다」는 명제 자체가 없다. 표기는 종전 그대로다.
    expect(shown(formatJudged(12.3456, { digits: 2 }))).toBe('12.35');
    expect(shown(formatJudged(0.842, { digits: 3 }))).toBe('0.842');
  });

  it('E-2 하지만 불변식 Z 는 `display` 에도 걸린다 — 0 아닌 값을 0 으로 찍지 않는다', () => {
    // 🔴 Z 는 부호를 가리지 않는다(PLN §27-4 의사코드 `n === 0 && v !== 0`).
    expect(shown(formatJudged(-1e-9, { digits: 2 }))).not.toBe('-0.00');
    expect(shown(formatJudged(-1e-9, { digits: 2 }))).toBe('＜ 0.00');
    // 대부분은 자릿수 +1 로 풀린다 — 부등호까지 가는 것은 digits+1 에서도 0 인 값뿐이다.
    expect(shown(formatJudged(-0.004, { digits: 2 }))).toBe('-0.004');
    expect(shown(formatJudged(0.004, { digits: 2 }))).toBe('0.004');
  });

  it('E-3 `outOfRange` 배지는 `domain` 을 넣어 같은 규칙으로 덮는다', () => {
    // 정의역 [0, 10] 의 위쪽을 아주 조금 벗어난 값. 2자리로 반올림하면 「정의역 안」으로 읽힌다.
    expect(shown(formatJudged(10.004, { digits: 2, domain: [0, 10] }))).toBe('10.004');
    // 🔴 `domain` 을 빼면(= 구현에서 누락하면) 그 이탈이 화면에서 사라진다. 이것이 E-3 의 위험이다.
    expect(shown(formatJudged(10.004, { digits: 2 }))).toBe('10.00');
  });
});
