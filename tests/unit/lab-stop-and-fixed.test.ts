/**
 * 🔴 회귀 게이트 — **정지 안내가 진짜 원인을 지목하는가** · **고정 조건이 학습자에게 닿는가.**
 *
 * 두 결함이 2026-08-22 PLN 판정으로 확정됐다. 둘 다 「동작은 맞으나 화면이 말하지 않는다」다.
 *
 * ① `metal/lab-advanced` — 정지 자체는 정상(안전 정지)인데 **안내가 엉뚱한 것을 지목했다.**
 *    진짜 원인은 「저유전율막 k < 2.6 **이면서** 하중 > 24.76 kPa」인 **결합 조건**인데
 *    화면은 `pressureKPa = 30 kPa` 하나만 찍었다 → **학습자가 압력만 되돌린다.**
 *    게다가 `OutOfLimitError.limit` 을 **들고 있었으면서 버렸다** — 「범위를 벗어났습니다」만
 *    말하고 「어디까지가 범위인가」를 말하지 않았다.
 *    PLN 명세: 「**「범위를 벗어났습니다」는 아무것도 가르치지 않는다. 왜 벗어났는지를 말해야 한다.**」
 *
 * ② `photo/lab-basic` — 명세 949행이 고정값 7개를 「**화면 우측 조건 카드에 상시 표시**」로
 *    위치까지 규정했는데, 구현은 출력값 아래 가정 목록이었고 **`n`·`k₂`·`T`·`E₀` 4개가
 *    학습자에게 닿지 않았다.** 원인은 `LabSpec` 에 고정조건 전용 필드가 없다는 것이었다.
 *
 * 🔴 이 파일은 **모델이 아니라 마크업**을 본다. 「고쳤다」가 아니라 「화면에 그 글자가 있다」를
 *    고정한다 — 종전 사고가 전부 「모델은 맞는데 화면이 안 받았다」였기 때문이다.
 * 🔴 `registry` import 는 반드시 `labs` 보다 **먼저**. 순서가 바뀌면 등급 리졸버 미설치로 던진다.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/models/registry';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerAllLabs, labSpec, registeredLabKeys } from '../../src/models/labs';
import type { LabSpec, LabStage } from '../../src/models/labs/spec';
import { OutOfLimitError } from '../../src/models/contract';
import { setLang } from '../../src/lib/i18n';
import { LabRunner } from '../../src/ui/sections/LabRunner';

beforeAll(async () => {
  registerAllLabs();
  await setLang('ko');
});

function must(processId: string, stage: LabStage): LabSpec {
  const s = labSpec(processId, stage);
  if (!s) throw new Error(`실습 명세 없음: ${processId}/${stage}`);
  return s;
}

/** 기본값에서 몇 개만 바꾼 입력 묶음. */
function inputsWith(spec: LabSpec, over: Record<string, number>): Record<string, number> {
  const base = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
  return { ...base, ...over };
}

/**
 * 🔴 화면을 **정지 상태로** 그린다.
 * `LabRunner` 는 초기 입력을 `param.initial` 에서만 읽으므로, 정지 조합을 초기값으로 갈아 끼운
 * 사본을 만들어 렌더한다. **`compute` 는 원본 그대로**라 실제 정지 경로를 그대로 탄다.
 */
function renderWithInitials(spec: LabSpec, over: Record<string, number>): string {
  const patched: LabSpec = {
    ...spec,
    params: spec.params.map((p) => (over[p.id] === undefined ? p : { ...p, initial: over[p.id] as number })),
  };
  return renderToStaticMarkup(createElement(LabRunner, { spec: patched }));
}

/* ══════════════════════════════════════════════════════════════════════════
 * ① metal/lab-advanced — 결합 조건 정지
 * ══════════════════════════════════════════════════════════════════════════ */

/** 정지를 만드는 조합. k 2.5(< 2.6) **이면서** 하중 30 kPa(> 24.76). */
const STOP_K = 2.5;
const STOP_PRESSURE_KPA = 30;

describe('① metal/lab-advanced 정지 — 결합 조건을 둘 다 지목하고 한계값을 보인다', () => {
  it('기본값에서는 정지하지 않는다 — 이 정지는 학습자가 만들어야 도달한다', () => {
    const spec = must('metal', 'lab-advanced');
    expect(() => spec.compute(inputsWith(spec, {}))).not.toThrow();
  });

  it('k 만 낮추거나 하중만 올려서는 정지하지 않는다 (결합 조건이라는 사실 자체)', () => {
    const spec = must('metal', 'lab-advanced');
    expect(() => spec.compute(inputsWith(spec, { dielectricConstant: STOP_K }))).not.toThrow();
    expect(() => spec.compute(inputsWith(spec, { pressureKPa: STOP_PRESSURE_KPA }))).not.toThrow();
  });

  it('모델이 던지는 오류가 조건 2건을 한계값과 함께 싣는다', () => {
    const spec = must('metal', 'lab-advanced');
    let err: unknown;
    try {
      spec.compute(inputsWith(spec, { dielectricConstant: STOP_K, pressureKPa: STOP_PRESSURE_KPA }));
    } catch (e) { err = e; }

    expect(err).toBeInstanceOf(OutOfLimitError);
    const e = err as OutOfLimitError;

    // 🔴 **2건이다.** 1건이면 화면이 원인의 절반만 말한다 — 그것이 이 결함이었다.
    expect(e.conditions).toHaveLength(2);

    const byId = Object.fromEntries(e.conditions.map((c) => [c.parameter, c]));
    expect(Object.keys(byId).sort()).toEqual(['dielectricConstant', 'pressureKPa']);

    expect(byId['dielectricConstant']?.given).toBe(STOP_K);
    expect(byId['dielectricConstant']?.limit[0]).toBe(2.6);       // 「한계 2.6 · 현재 2.5」
    expect(byId['pressureKPa']?.given).toBe(STOP_PRESSURE_KPA);
    expect(byId['pressureKPa']?.limit[1]).toBeCloseTo(24.76, 2);
    expect(byId['pressureKPa']?.unit).toBe('kPa');

    // 🔴 파라미터 이름 칸에 사유를 괄호로 덧붙이지 않는다 — 화면이 명세의 이름을 못 찾게 된다.
    for (const c of e.conditions) expect(c.parameter).toMatch(/^[A-Za-z][\w]*$/);
  });

  it('화면이 두 원인을 **사람이 읽는 이름**으로, 한계 숫자와 함께 낸다', () => {
    const spec = must('metal', 'lab-advanced');
    const html = renderWithInitials(spec, {
      dielectricConstant: STOP_K, pressureKPa: STOP_PRESSURE_KPA,
    });

    expect(html).toContain('verdict--stop');
    expect(html).toContain('role="alert"');

    // ⓐ 진짜 원인(저유전율막)이 화면에 있다 — 종전에는 **없었다**
    expect(html).toContain('ILD 유전율 k');
    // ⓑ 압력도 함께 있다 (결합 조건이므로 둘 다)
    expect(html).toContain('CMP 하중압력');
    // ⓒ 한계 숫자를 버리지 않는다
    expect(html).toContain('한계 2.6 이상');
    expect(html).toContain('한계 24.76 kPa 이하');
    // ⓓ 현재값도 함께 — 「한계 2.6 · 현재 2.5」
    expect(html).toContain('현재 2.5');
    expect(html).toContain('현재 30 kPa');
    // ⓔ 변수명이 화면에 새지 않는다
    expect(html).not.toContain('pressureKPa');
    expect(html).not.toContain('dielectricConstant');
    // ⓕ 출력이 왜 비었는지 말한다 (말없이 사라지지 않는다)
    expect(html).toContain('출력 지표·판정·차트를 계산하지 않습니다');
  });

  it('정지가 풀리면 정지 배너가 사라지고 출력이 돌아온다', () => {
    const spec = must('metal', 'lab-advanced');
    const html = renderWithInitials(spec, {});
    expect(html).not.toContain('verdict--stop');
    expect(html).toContain('출력 지표');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ② photo/lab-basic — 고정 조건 카드
 * ══════════════════════════════════════════════════════════════════════════ */

/** PLN `03_실습3단계명세.md` 949행이 나열한 7개. 순서까지 명세를 따른다. */
const PHOTO_BASIC_FIXED: Array<[string, string]> = [
  ['lambda', '<dd>193<em> nm</em></dd>'],
  ['na', '<dd>1.20</dd>'],
  ['immersionIndex', '<dd>1.436</dd>'],
  ['k1', '<dd>0.35</dd>'],
  ['k2', '<dd>0.745</dd>'],
  ['resistThickness', '<dd>120<em> nm</em></dd>'],
  ['clearDose', '<dd>12<em> mJ/cm²</em></dd>'],
];

describe('② photo/lab-basic 고정 조건 — 명세 949행 7개가 전부 화면에 있다', () => {
  it('명세가 나열한 7개를 순서대로 선언한다', () => {
    const spec = must('photo', 'lab-basic');
    expect(spec.fixedConditions?.map((f) => f.id)).toEqual(PHOTO_BASIC_FIXED.map(([id]) => id));
  });

  it('7개 값이 조작 패널(우측 열) 안 조건 카드에 실제로 그려진다', () => {
    const spec = must('photo', 'lab-basic');
    const html = renderToStaticMarkup(createElement(LabRunner, { spec }));

    expect(html).toContain('class="fixedCard"');
    // 🔴 카드는 **조작 패널 안**에 있다 — 명세가 「화면 우측」으로 위치를 규정했다.
    const panelStart = html.indexOf('class="lab__panel"');
    expect(panelStart).toBeGreaterThan(-1);
    expect(html.indexOf('class="fixedCard"')).toBeGreaterThan(panelStart);

    for (const [id, dd] of PHOTO_BASIC_FIXED) {
      expect(html, `고정 조건 '${id}' 의 값이 화면에 없습니다`).toContain(dd);
    }
    // 종전에 닿지 않던 4개의 이름도 확인한다
    expect(html).toContain('침지수 굴절률 n');
    expect(html).toContain('초점심도 계수 k₂');
    expect(html).toContain('레지스트 두께 T');
    expect(html).toContain('레지스트 클리어 선량 E₀');
  });

  it('정지 상태에서도 조건 카드는 남는다 — 명세가 「상시 표시」로 규정했다', () => {
    const spec = must('photo', 'lab-basic');
    // 노광량 정의역(10~60) 밖 → `assertWithin` 정지
    const html = renderWithInitials(spec, { doseMjCm2: 5 });
    expect(html).toContain('verdict--stop');
    expect(html).toContain('class="fixedCard"');
    expect(html).toContain('<dd>0.745</dd>');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ③ 파급 — 선택 필드다. 안 쓰는 칸이 깨지지 않는다.
 * ══════════════════════════════════════════════════════════════════════════ */

describe('③ 고정 조건은 선택 필드 — 안 쓰는 칸의 DOM 이 변하지 않는다', () => {
  it('선언이 없는 칸에는 조건 카드 DOM 자체가 없다', () => {
    let checked = 0;
    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/') as [string, LabStage];
      const spec = must(processId, stage);
      if (spec.fixedConditions && spec.fixedConditions.length > 0) continue;
      const html = renderToStaticMarkup(createElement(LabRunner, { spec }));
      expect(html, `${key}: 선언이 없는데 조건 카드가 그려졌습니다`).not.toContain('fixedCard');
      checked++;
    }
    // 🔴 0 이면 「위반 0건」이 아니라 「아무것도 안 봤다」다.
    expect(checked).toBeGreaterThan(0);
  });

  it('선언한 고정 조건은 전부 근거(sourceId 또는 basis)를 가진다', () => {
    let checked = 0;
    for (const key of registeredLabKeys()) {
      const [processId, stage] = key.split('/') as [string, LabStage];
      for (const f of must(processId, stage).fixedConditions ?? []) {
        expect(
          Boolean(f.sourceId) || Boolean(f.basis),
          `${key}: 고정 조건 '${f.id}' 에 근거가 없습니다 — 조건 카드는 학습자가 「정해진 것」으로 읽는 자리입니다`,
        ).toBe(true);
        expect(f.value.trim().length, `${key}: 고정 조건 '${f.id}' 의 값이 비었습니다`).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
