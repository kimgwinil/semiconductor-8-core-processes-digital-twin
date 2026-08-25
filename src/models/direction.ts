import type { SourceId } from './sources.generated';

/**
 * A12 — 시뮬레이션 방향성 검증(설계서 §13).
 * 골든값(R번호)이 「값이 맞는가」를 본다면, 이 규칙은 「움직이는 방향이 맞는가」를 본다.
 *
 * 🔴 여기(`src/models/**`)에는 **선언만** 둔다 — 규칙 문장·근거 S번호·상충 구조.
 *    스윕 구간(from/to/steps)과 기준값(baseline)은 **검증 설정**이지 제품 상수가 아니므로
 *    `tests/direction/**` 이 소유한다. 그래야 `check-sources` 의 매직넘버 차단이 의미를 유지한다.
 * 🔴 sourceId 가 없는 규칙은 CI 가 거부한다.
 */
export type Monotonicity = 'increasing' | 'decreasing' | 'non-monotonic' | 'flat';

export interface ExpectedTrend {
  output: string;
  trend: Monotonicity;
}

export interface DirectionRule {
  id: string;
  processId: string;
  /** 사람이 읽는 규칙 문장. 화면 「근거」 패널에 그대로 나온다 — 검증 장치가 곧 학습 콘텐츠다. */
  statement: string;
  /** 흔드는 입력의 이름. 구간은 테스트가 정한다. */
  inputName: string;
  /** 관찰하는 출력들. 2개 이상이면 상충 관계를 검사한다. */
  expect: ExpectedTrend[];
  sourceId: SourceId;
  /** lab: 현재 실습 노브→출력→장면 계약. 생략한 규칙은 참고 물리 규칙이다. */
  scope?: 'lab' | 'reference';
  note?: string;
}

export type DirectionModel = (inputs: Record<string, number>) => Record<string, number>;

const models = new Map<string, DirectionModel>();
const rules: DirectionRule[] = [];

export function registerDirectionModel(processId: string, fn: DirectionModel): void {
  models.set(processId, fn);
}

export function directionModel(processId: string): DirectionModel | undefined {
  return models.get(processId);
}

export function registerRules(list: DirectionRule[]): void {
  for (const r of list) if (!rules.some((x) => x.id === r.id)) rules.push(r);
}

export function allRules(): DirectionRule[] {
  return rules;
}

export function rulesOf(processId: string): DirectionRule[] {
  return rules.filter((r) => r.processId === processId);
}
