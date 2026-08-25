import type { SourceId } from './sources.generated';

/**
 * 🔴 화면에 **출처 번호를 노출하면 안 되는** 출처.
 *
 * 원장이 「라이선스 불가 · 화면 사용 보류」로 판정한 문헌이 있다. 계산에 값을 쓰는 것과
 * **그 출처를 제품 화면에 표기하는 것은 별개**다. 하네스가 `sourceId` 를 무조건 배지로 렌더하면
 * 보류 판정이 무력화된다(P1 배선 중 발견).
 *
 * 여기 등재된 출처는 배지에서 **번호 대신 「출처 비공개(라이선스)」** 로 표시된다.
 * 값은 그대로 쓰되 **어디서 왔는지를 주장하지 않는다.**
 */
export interface HiddenSource {
  id: SourceId;
  /** 왜 가리는가 */
  reason: string;
  /** 무엇이 풀리면 공개되는가 */
  unblockedBy: string;
}

export const UI_HIDDEN_SOURCES: readonly HiddenSource[] = [
  {
    id: 'S107',
    reason: '라이선스 표기가 없는 강의자료다. 수치는 사실이라 계산에 쓸 수 있으나 표·출처를 화면에 노출할 수 없다(원장 M-1).',
    unblockedBy: '편석계수 k₀ 의 재인용 가능한 출처 확보(원장 N-2)',
  },
  {
    id: 'S183',
    reason: '© Prentice Hall 슬라이드이며 게시 자체가 비인가일 수 있다(원장 M-25 계열).',
    unblockedBy: '1차 문헌으로 인용처 교체',
  },
  {
    id: 'S184',
    reason: '© Prentice Hall 슬라이드이며 게시 자체가 비인가일 수 있다. S183 과 같은 시리즈다(원장 M-25 계열).',
    unblockedBy: '1차 문헌으로 인용처 교체',
  },
  {
    id: 'S185',
    reason: '표지에 「저자 동의 없는 인용 금지」가 명기돼 있다.',
    unblockedBy: '정식 출판본(ADNDT 31, 1984)으로 서지 교체',
  },
];

const HIDDEN = new Set<string>(UI_HIDDEN_SOURCES.map((x) => x.id));

export function isSourceHiddenInUi(sourceId: string): boolean {
  return HIDDEN.has(sourceId);
}

export function hiddenSourceReason(sourceId: string): string | undefined {
  return UI_HIDDEN_SOURCES.find((x) => x.id === sourceId)?.reason;
}
