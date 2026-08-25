// 🔴 등급 리졸버 설치(부수효과). 물리층·실습층 모듈을 배럴 없이 직접 import 하므로 명시한다.
import '@/models/registry';
import { describe, expect, it } from 'vitest';
import { OutOfLimitError } from '@/models/contract';
import { UM_PER_MIL } from '@/models/physics/eds/units';
import {
  OVERDRIVE_MIL_DOMAIN,
  OVERDRIVE_PRACTICE_RANGE_MIL,
  OVERDRIVE_PRACTICE_RANGE_UM,
  PRACTICE_WINDOW_PINNED_ASSUMPTION,
  contactForceCoefficient,
  probeContactForce,
} from '@/models/physics/eds/probeOperations';
import { EDS_FORCE_MAX_G, overdriveToMil } from '@/models/labs/eds';

/**
 * 🔴 **µm ↔ mil 환산 고정 테스트** (DEV 2026-08-22 · PLN 판정 이행).
 *
 * 무엇이 바뀌었나 — `overdriveToMil` 이 **두 정박점 선형보간**(25 µm→1 mil · 76 µm→3 mil,
 * 실효 **25.5 µm/mil**)에서 **정의 환산 `/25.4`** 로 바뀌었다.
 * 종전 식은 S229 가 인쇄한 두 표기를 「독립한 두 실측점」으로 오해하고 그 사이를 이었다.
 * 실제로는 **원문이 mil(1–3)** 이고 **25–76 µm 가 그것을 환산해 인쇄한 값**이므로
 * (`3 × 25.4 = 76.2` → 76 으로 절단), 그 직선의 기울기는 **인쇄 반올림 0.2 µm 를 물리로
 * 승격시킨 것**이었다. 단위 환산은 정의라 기울기가 하나뿐이다.
 *
 * 이 파일이 못박는 것 셋 —
 *  (a) `overdriveToMil(25.4 µm) === 1 mil` — 정의가 그대로 나온다(보간이면 1.0157… 이 나온다)
 *  (b) `probeContactForce` 가 **µm 실무창 하한 25 µm** 에서 정지하지 않는다
 *  (c) 조립한 `UM_PER_MIL` 이 십진 리터럴 `25.4` 와 **비트까지 같다**
 */
describe('🔴 EDS mil 환산 — 1 mil = 25.4 µm (1959 국제 인치 정의)', () => {
  /* ---------------------------------------------------------------- (c) */
  it('(c) 조립한 UM_PER_MIL 이 십진 리터럴 25.4 와 비트까지 같다', () => {
    // 🔴 `Object.is` 로 본다 — `toBe` 도 SameValueZero 지만, 「비트 일치」가 판정 대상임을
    //    코드가 스스로 말하게 둔다(`si-definitions.test.ts` 와 같은 처리).
    expect(Object.is(UM_PER_MIL, 25.4)).toBe(true);
    // 조립식이 실제로 자릿수 그대로인지도 본다: (2·10 + 5)·10 + 4 = 254 → /10
    expect(UM_PER_MIL * 10).toBe(254);
    // 정의 관계식: 1 in = 25.4 mm · 1 mil = 10⁻³ in → 1 mil = 25.4 µm
    expect(UM_PER_MIL / 1000).toBe(0.0254);
  });

  it('🔴 25.4 는 제품 코드 안에서 이 한 곳에서만 나온다 — 매직넘버로 다시 적지 않는다', () => {
    // `labs/eds.ts` 도 `probeOperations.ts` 도 정본을 import 해서 쓴다. 값이 갈릴 자리가 없다.
    expect(OVERDRIVE_MIL_DOMAIN[0]).toBe(OVERDRIVE_PRACTICE_RANGE_UM[0] / UM_PER_MIL);
    expect(OVERDRIVE_MIL_DOMAIN[1]).toBe(OVERDRIVE_PRACTICE_RANGE_UM[1] / UM_PER_MIL);
  });

  /* ---------------------------------------------------------------- (a) */
  it('(a) overdriveToMil(25.4 µm) = 정확히 1 mil', () => {
    const { mil, pinned } = overdriveToMil(25.4);
    expect(mil).toBe(1);
    expect(pinned).toBe(false); // 25.4 µm 는 실무창 25~76 안이다 — 고정되지 않는다
  });

  it('(a-2) 🔴 폐기된 두 정박점 보간이면 여기서 1 이 나오지 않는다 — 되돌림 감지기', () => {
    const [loUm, hiUm] = OVERDRIVE_PRACTICE_RANGE_UM;
    const [loMil, hiMil] = OVERDRIVE_PRACTICE_RANGE_MIL;
    // 종전 식을 그대로 재현한다(실효 25.5 µm/mil).
    const twoAnchor = loMil + ((25.4 - loUm) / (hiUm - loUm)) * (hiMil - loMil);
    expect(twoAnchor).toBeCloseTo(1.0156862745098038, 12);
    expect(twoAnchor).not.toBe(1);
    // 기울기가 25.5 µm/mil 이었다 — 정의값 25.4 와 0.39 % 어긋난다.
    expect((hiUm - loUm) / (hiMil - loMil)).toBeCloseTo(25.5, 12);
  });

  it('(a-3) 환산은 실무창 두 끝을 정의대로 옮긴다', () => {
    expect(overdriveToMil(25).mil).toBe(25 / 25.4);
    expect(overdriveToMil(76).mil).toBe(76 / 25.4);
    // 🔴 76 µm 는 3 mil 이 **아니다** — 인쇄값 3 mil 은 76.2 µm 다.
    expect(overdriveToMil(76).mil).toBeCloseTo(2.9921259842519685, 12);
  });

  /* ---------------------------------------------------------------- (b) */
  it('(b) probeContactForce 가 µm 실무창 하한 25 µm 에서 정지하지 않는다', () => {
    const atLowerBound = overdriveToMil(OVERDRIVE_PRACTICE_RANGE_UM[0]);
    expect(atLowerBound.pinned).toBe(false);
    // 🔴 정의역이 리터럴 [1, 3] mil 이면 0.984 mil 이라 여기서 OutOfLimitError 가 났다.
    expect(() => probeContactForce({
      material: 'W', overdriveMil: atLowerBound.mil, bound: 'max',
    })).not.toThrow();
    expect(probeContactForce({ material: 'W', overdriveMil: atLowerBound.mil, bound: 'max' }).value)
      .toBeCloseTo(contactForceCoefficient('W').max * (25 / 25.4), 12);
  });

  it('(b-2) 실무창 상한 76 µm 에서도 정지하지 않고, 창 밖 mil 은 여전히 정지한다', () => {
    expect(() => probeContactForce({
      material: 'W', overdriveMil: overdriveToMil(76).mil, bound: 'max',
    })).not.toThrow();
    // 인쇄값 3 mil = 76.2 µm 는 µm 정본 상한 76 을 넘는다 → 정의역 밖이다.
    expect(() => probeContactForce({ material: 'W', overdriveMil: 3, bound: 'max' }))
      .toThrow(OutOfLimitError);
    expect(() => probeContactForce({ material: 'W', overdriveMil: 0.9, bound: 'max' }))
      .toThrow(OutOfLimitError);
  });

  /* ---------------------------------------------------------------- 클램프 고지 */
  it('🔴 실무창 밖은 경계로 고정되고, 고정됐다는 사실이 화면 assumptions 에 실린다', () => {
    for (const od of [0, 10, 24.9]) {
      const r = overdriveToMil(od);
      expect(r.pinned, `OD=${od}`).toBe(true);
      expect(r.mil, `OD=${od}`).toBe(25 / 25.4);
    }
    for (const od of [76.1, 100, 150]) {
      const r = overdriveToMil(od);
      expect(r.pinned, `OD=${od}`).toBe(true);
      expect(r.mil, `OD=${od}`).toBe(76 / 25.4);
    }
    const pinned = overdriveToMil(150);
    const q = probeContactForce({
      material: 'W', overdriveMil: pinned.mil, bound: 'max',
      pinnedToPracticeWindow: pinned.pinned,
    });
    expect(q.assumptions).toContain(PRACTICE_WINDOW_PINNED_ASSUMPTION);
    expect(PRACTICE_WINDOW_PINNED_ASSUMPTION).toBe('문헌 유효범위 밖 — 경계 고정');
  });

  it('🔴 실무창 **안**에서는 고지가 붙지 않는다 — 상시 고지는 정보가 아니다', () => {
    for (const od of [25, 40, 60, 76]) {
      const r = overdriveToMil(od);
      const q = probeContactForce({
        material: 'W', overdriveMil: r.mil, bound: 'max',
        pinnedToPracticeWindow: r.pinned,
      });
      expect(q.assumptions, `OD=${od}`).not.toContain(PRACTICE_WINDOW_PINNED_ASSUMPTION);
    }
  });

  /* ---------------------------------------------------------------- 게이지 축 */
  it('🔴 EDS_FORCE_MAX_G 는 7.5 g 그대로다 — 실도달 상한(7.480 g)으로 깎지 않는다', () => {
    expect(EDS_FORCE_MAX_G).toBe(7.5);
    // 문헌 조합값: 계수 상한 2.5 g/mil × **인쇄된** 실무창 상한 3 mil
    expect(EDS_FORCE_MAX_G).toBe(contactForceCoefficient('W').max * OVERDRIVE_PRACTICE_RANGE_MIL[1]);
    // 실도달 상한은 축의 99.74 % 다. 게이지가 1.00 에 닿지 않는 것이 기대된 결과다.
    const reached = contactForceCoefficient('W').max * (76 / 25.4);
    expect(reached / EDS_FORCE_MAX_G).toBeCloseTo(0.9973753280839894, 12);
    expect(reached).toBeLessThan(EDS_FORCE_MAX_G);
  });
});
