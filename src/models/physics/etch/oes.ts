import { quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * OES(발광분광) 엔드포인트 검출 파장 — **물리층. 합성 계수 0건.**
 * 원장 §3-4 「OES 엔드포인트 파장」. 공동 출처 **S168 · S172**.
 *
 * 🔴 **CO 선만 출처가 분해돼 있다.** 원장이 명시한다 —
 *    S172(1983, SiO₂ 문맥) = **483.5 nm**, S168(2021, SiC 문맥) = **482.5 nm**. 둘 다 실물 확인.
 *    **SiO₂ 문맥에서는 483.5 nm 를 채택**하고, SiC 문맥에서만 482.5 nm 를 쓴다.
 * ⚠️ 나머지 선은 원장이 두 출처를 **공동으로** 기재한다. 여기서는 목록의 정본인 S172 로 표기하되,
 *    **S172 는 OCR 열화본이라 원장이 근거 등급 B 로 두었다**는 사실을 `assumptions` 에 남긴다.
 * 🔴 파장은 「무엇을 보고 종료를 판정하는가」만 가르친다. **세기·기울기로 합격을 판정하지 않는다** —
 *    그 판정 기준은 원장에 없다.
 */

export type EndpointLineId =
  | 'SiF' | 'SiO2' | 'Si' | 'CO_in_SiO2' | 'CO_in_SiC'
  | 'Al' | 'F_703' | 'F_685' | 'F_712' | 'H';

interface EndpointLine {
  readonly wavelength: SourcedConst;
  /** 어떤 식각을 볼 때 쓰는 선인지. 화면 「근거」 패널에 그대로 나온다. */
  readonly context: string;
  /** 원장 근거 등급. S172(OCR 열화)는 B. */
  readonly grade: 'A' | 'B';
}

const OES_LINES: Record<EndpointLineId, EndpointLine> = {
  SiF: { wavelength: withSource(440.2, 'nm', 'S172'), context: 'SiF — Si 식각 부산물', grade: 'B' },
  SiO2: { wavelength: withSource(248.6, 'nm', 'S172'), context: 'SiO₂ 식각', grade: 'B' },
  Si: { wavelength: withSource(505.6, 'nm', 'S172'), context: 'Si 원자선', grade: 'B' },
  CO_in_SiO2: { wavelength: withSource(483.5, 'nm', 'S172'), context: 'CO — SiO₂ 식각 문맥', grade: 'B' },
  CO_in_SiC: { wavelength: withSource(482.5, 'nm', 'S168'), context: 'CO — SiC 비아 식각 문맥', grade: 'A' },
  Al: { wavelength: withSource(308.2, 'nm', 'S172'), context: 'Al 배선 식각', grade: 'B' },
  F_703: { wavelength: withSource(703.7, 'nm', 'S172'), context: 'F 원자선 (주선)', grade: 'B' },
  F_685: { wavelength: withSource(685.4, 'nm', 'S172'), context: 'F 원자선', grade: 'B' },
  F_712: { wavelength: withSource(712.8, 'nm', 'S172'), context: 'F 원자선', grade: 'B' },
  H: { wavelength: withSource(656.5, 'nm', 'S172'), context: 'H 원자선 (Hα)', grade: 'B' },
};

const ALL_NM = Object.values(OES_LINES).map((l) => l.wavelength.value);
/** 유효범위는 표에서 파생한다 — 출처 없는 리터럴을 만들지 않는다. */
export const OES_RANGE_NM: [number, number] = [Math.min(...ALL_NM), Math.max(...ALL_NM)];

export function endpointLineIds(): EndpointLineId[] {
  return Object.keys(OES_LINES) as EndpointLineId[];
}

/** 엔드포인트 감시 파장. */
export function endpointWavelength(line: EndpointLineId): Quantity {
  const entry = OES_LINES[line];
  return quantity(entry.wavelength.value, {
    modelId: 'etch.oes.endpointWavelength',
    unit: 'nm',
    sourceId: entry.wavelength.sourceId,
    validRange: OES_RANGE_NM,
    assumptions: [
      entry.context,
      entry.grade === 'B'
        ? '⚠️ 근거 등급 B — 출처가 OCR 열화본이라 원장이 재확인 대상으로 표시했다(S172)'
        : '근거 등급 A — 원문에서 직접 판독',
    ],
  });
}

/**
 * 🔴 CO 선은 문맥으로 갈린다. SiO₂ 식각이면 483.5 nm, SiC 식각이면 482.5 nm.
 *    이 함수가 그 분기를 한 곳에 모아 오용을 막는다.
 */
export function carbonMonoxideLine(material: 'SiO2' | 'SiC'): Quantity {
  return endpointWavelength(material === 'SiO2' ? 'CO_in_SiO2' : 'CO_in_SiC');
}
