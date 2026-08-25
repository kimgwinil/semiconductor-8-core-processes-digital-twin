import { describe, expect, it } from 'vitest';
import {
  SI_DEFINITION_LABEL, describeSiDefinition, siDefinition, uiGuard, withSource,
} from '../../src/models/contract';
import {
  BOLTZMANN_SI_EV_PER_K, KELVIN_AT_ZERO_CELSIUS,
} from '../../src/models/physics/siDefinitions';
import { BOLTZMANN_AS_PRINTED, BOLTZMANN_USED_EV_PER_K } from '../../src/models/physics/wafer/pointDefect';
import '../../src/models/registry';

/** IEEE-754 binary64 비트열(16진). 「비트까지 같다」를 눈으로 대조할 수 있게 문자열로 만든다. */
function bits(x: number): string {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, x);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 🔴 이 파일의 존재 이유 — **조립식이 십진 표기와 어긋나면 아무도 못 본다.**
 *
 * `physics/siDefinitions.ts` 는 `check-sources` 의 허용 리터럴(0·1·2·−1·0.5·100)로만 값을 조립한다.
 * 게이트를 넓히지 않으려고 그렇게 한 것인데, 그 대가로 **사람이 값을 한눈에 못 읽는다.**
 * 그래서 여기서 **십진 리터럴과 직접 비교**해 조립을 못박는다.
 * (테스트 파일은 `src/models/**` 가 아니므로 십진 리터럴을 그대로 쓸 수 있다.)
 *
 * 이 테스트가 깨지면 **조립식이 틀린 것**이지 십진 표기를 고칠 일이 아니다.
 */
describe('SI 정의상수 — 조립값이 십진 표기와 비트까지 같은가', () => {
  it('볼츠만 k = 8.617333262e-5 eV/K (조립 = 십진, 비트 일치)', () => {
    expect(BOLTZMANN_SI_EV_PER_K.value).toBe(8.617333262e-5);
    expect(bits(BOLTZMANN_SI_EV_PER_K.value)).toBe(bits(8.617333262e-5));
    expect(BOLTZMANN_SI_EV_PER_K.unit).toBe('eV/K');
  });

  it('켈빈 영점 273.15 K (조립 = 십진, 비트 일치)', () => {
    expect(KELVIN_AT_ZERO_CELSIUS.value).toBe(273.15);
    expect(bits(KELVIN_AT_ZERO_CELSIUS.value)).toBe(bits(273.15));
    expect(KELVIN_AT_ZERO_CELSIUS.unit).toBe('K');
  });

  it('🔴 pointDefect 가 실제로 쓰는 k 가 정정 전후로 바뀌지 않았다', () => {
    // 정정 전에는 `withSource(8.617333262e-5, 'eV/K', 'S101')` 였다. **값만 그대로 이어야 한다.**
    expect(BOLTZMANN_USED_EV_PER_K).toBe(8.617333262e-5);
    expect(bits(BOLTZMANN_USED_EV_PER_K)).toBe(bits(8.617333262e-5));
  });
});

describe('SI 정의상수 — 세 개념이 섞이지 않는가', () => {
  it('🔴 SI 정의값 · 원논문 인쇄값 · 회사 규약값은 서로 다른 값이며 통일하지 않는다', () => {
    // ① SI 정의값(출처 없음 — 정의다)
    expect(BOLTZMANN_SI_EV_PER_K.cls).toBe('SI정의');
    expect(BOLTZMANN_SI_EV_PER_K.value).toBe(8.617333262e-5);
    // ② 원논문 S101 이 §3.2.1 에 인쇄한 반올림값 — **정당한 문헌 인용이라 withSource 로 남는다**
    expect(BOLTZMANN_AS_PRINTED.cls).toBe('문헌계수');
    expect(BOLTZMANN_AS_PRINTED.sourceId).toBe('S101');
    expect(BOLTZMANN_AS_PRINTED.value).toBe(8.617e-5);
    // ①과 ②는 다른 수다. 이 차이가 C^eq 를 0.137 % 흔들어 원장 허용오차 ±0.1 % 를 깬다.
    expect(BOLTZMANN_SI_EV_PER_K.value).not.toBe(BOLTZMANN_AS_PRINTED.value);
  });

  it('🔴 SiDefinition 은 S번호를 실을 수 없다 — 구조적 배타', () => {
    // `cls` 가 '문헌계수'|'합성계수'|'UI안전장치' 와 겹치지 않는다.
    const lit = withSource(1, '', 'S101');
    const guard = uiGuard(1, '', '테스트용 범위선');
    expect(new Set([BOLTZMANN_SI_EV_PER_K.cls, lit.cls, guard.cls]).size).toBe(3);
    // sourceId 는 타입이 never 이며 런타임에도 실리지 않는다.
    expect(BOLTZMANN_SI_EV_PER_K.sourceId).toBeUndefined();
    expect(KELVIN_AT_ZERO_CELSIUS.sourceId).toBeUndefined();
  });

  it('🔴 definition 이 비면 던진다 — 정의를 안 밝힌 「정의값」은 매직넘버와 구별되지 않는다', () => {
    expect(() => siDefinition(1, '', '')).toThrow(/definition is required/);
  });

  it('표기 문구 정본은 하나뿐이고 UI 안전장치 문구와 다르다', () => {
    expect(describeSiDefinition(KELVIN_AT_ZERO_CELSIUS)).toBe(
      `${SI_DEFINITION_LABEL} · ${KELVIN_AT_ZERO_CELSIUS.definition}`,
    );
    // 🔴 「출처 없음 — UI 안전장치」와 같은 칸에 넣지 않는다. 뜻이 정반대다.
    expect(SI_DEFINITION_LABEL).not.toContain('출처 없음');
  });
});
