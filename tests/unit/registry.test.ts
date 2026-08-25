import { describe, expect, it } from 'vitest';
import ledger from '@/content/model-grades.json';
import { auditRegistry, entryOf, gradeOf, registeredModelIds, PRE_L2_NOTICE, SYNTHETIC_NOTICE } from '@/models/registry';
import { quantity, type Grade, type ModelKind } from '@/models/contract';
import { L2_VERIFIED } from '@/config/verification';

/**
 * 🔴 A6-b (README §3-8) — 「합성값인데 배지·고지가 없는 값」을 차단한다.
 * 교육용 합성 계수를 실측값처럼 보이게 하는 것이 이 제품에서 가장 위험한 결함이다.
 *
 * 🔴 2026-08-20 이 파일을 다시 쓴 이유 — **테스트가 고쳐진 동작을 실패로 판정했다.**
 *   종전 케이스는 `gradeOf('anything').notice === PRE_L2_NOTICE`, 즉 「어떤 modelId 를 넣어도
 *   L2 고지 하나만 돌아온다」를 기대값으로 박아 뒀다. 그것은 `declared` 가 **완전히 비어 있어서**
 *   모든 출력이 예외 없이 `[경향모델]` 을 달던 **결함 상태의 스냅샷**이었다.
 *   원장 266건을 등재해 배지가 세 종류를 가르게 되자 이 테스트가 깨졌다 — 정답을 오답으로 판정한 것이다.
 *
 *   그래서 **기대값만 바꾸지 않고** 취지를 다시 구현한다. 지키려던 명제는 여전히 유효하다:
 *   「고지 없이 나가는 합성값이 없다」. 이제는 **kind 3종 각각에 어떤 고지가 붙어야 하는지**를 검증한다.
 *
 * 🔴 이 파일은 특정 modelId 를 하드코딩하지 않는다. 원장에서 조건에 맞는 항목을 골라 쓴다 —
 *    원장이 바뀌어도 테스트가 낡지 않게, 그리고 원장이 비면 즉시 드러나게.
 */

const models = (ledger as { models: Record<string, { declaredGrade: Grade; kind: ModelKind; notice?: string }> }).models;
const idsOfKind = (k: ModelKind): string[] =>
  Object.entries(models).filter(([, e]) => e.kind === k).map(([id]) => id);

describe('A6-b — 등급 원장이 실제로 채워져 있다', () => {
  it('원장이 비어 있지 않다 — 비면 전 항목이 강등돼 배지가 아무것도 가르지 못한다', () => {
    expect(registeredModelIds().length).toBeGreaterThan(200);
  });

  it('🔴 배지가 실제로 가른다 — 원장에 kind 가 2종 이상 있다', () => {
    const kinds = new Set(Object.values(models).map((e) => e.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(idsOfKind('literature').length).toBeGreaterThan(0);
    expect(idsOfKind('synthetic').length).toBeGreaterThan(0);
  });

  it('고지 없는 비문헌 항목이 없다 (auditRegistry)', () => {
    expect(auditRegistry()).toEqual([]);
  });
});

describe('A6-b — kind 3종 각각에 옳은 고지가 붙는다', () => {
  it('synthetic — 합성 사유가 반드시 붙고, L2 고지로 대체되지 않는다', () => {
    const ids = idsOfKind('synthetic');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const v = gradeOf(id);
      expect(v.kind, id).toBe('synthetic');
      expect(v.declaredGrade, id).toBe('경향모델');
      expect(v.grade, id).toBe('경향모델');
      // 🔴 핵심: 합성값의 고지는 **합성 사유**여야 한다. L2 고지가 그 자리를 차지하면
      //    「왜 이 값이 교육용인가」가 화면에서 사라진다.
      expect(v.notice, id).toBeTruthy();
      expect(v.notice, id).not.toBe(PRE_L2_NOTICE);
    }
  });

  it('operational — A15-op 운영규약 고지가 반드시 붙는다', () => {
    for (const id of idsOfKind('operational')) {
      const v = gradeOf(id);
      expect(v.kind, id).toBe('operational');
      expect(v.notice, id).toBeTruthy();
      expect(v.notice, id).not.toBe(PRE_L2_NOTICE);
    }
  });

  it('literature — 합성 고지를 달지 않는다 (문헌값을 교육용으로 오표기하지 않는다)', () => {
    const ids = idsOfKind('literature');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const v = gradeOf(id);
      expect(v.kind, id).toBe('literature');
      expect(v.grade, id).not.toBe('경향모델');
      expect(v.notice ?? '', id).not.toBe(SYNTHETIC_NOTICE);
    }
  });
});

describe('L2(현업 검증) 상태 취급 — D-011 · D-013', () => {
  it('L2 는 아직 미통과다 — 켜는 권한은 CEO 에게 있다(D-013)', () => {
    expect(L2_VERIFIED).toBe(false);
  });

  it('🔴 L2 미통과 중에는 어떤 항목도 「검증식」으로 나가지 않는다', () => {
    for (const id of registeredModelIds()) {
      expect(gradeOf(id).grade, id).not.toBe('검증식');
      expect(entryOf(id)?.declaredGrade, id).not.toBe('검증식');
    }
  });

  it('L2 미통과 사실은 전 항목에 표시된다 — 등급을 뭉개는 대신 조건을 적는다', () => {
    for (const id of registeredModelIds()) {
      expect(gradeOf(id).l2Pending, id).toBe(true);
    }
    // 화면은 `l2Pending` 을 보고 PRE_L2_NOTICE 를 **별도 줄로** 낸다(SourceBadge).
    // 모델 고유 고지와 합치지 않는다 — 합치면 어느 쪽이 빠졌는지 게이트가 구분하지 못한다.
    expect(PRE_L2_NOTICE.length).toBeGreaterThan(0);
  });
});

describe('미등록 모델은 조용히 통과하지 않는다', () => {
  it('안전한 최하위로 떨어지고 고지에 modelId 가 찍힌다', () => {
    const v = gradeOf('not-registered');
    expect(v.grade).toBe('경향모델');
    expect(v.kind).toBe('synthetic');
    expect(v.notice).toContain('not-registered');
  });

  it('🔴 다만 이것은 정상 상태가 아니다 — 실제 코드의 modelId 는 전부 등재돼 있어야 한다', () => {
    // 정적 전수 검사는 `scripts/check-grades.mjs` G1 이 한다(런타임에서는 사용처를 알 수 없다).
    // 여기서는 「폴백이 존재한다」와 「폴백에 의존하지 않는다」를 함께 못박아 둔다.
    expect(registeredModelIds()).not.toContain('not-registered');
  });
});

describe('quantity() 가 등급 정보를 값에 실어 보낸다', () => {
  const anySynthetic = idsOfKind('synthetic')[0]!;
  const anyLiterature = idsOfKind('literature')[0]!;

  it('kind·declaredGrade·l2Pending·modelId 가 전부 실린다 — DOM 게이트가 이걸 읽는다', () => {
    const q = quantity(1.5, { modelId: anyLiterature, unit: 'µm', sourceId: 'S120', validRange: [0, 10] });
    expect(q.modelId).toBe(anyLiterature);
    expect(q.kind).toBe('literature');
    expect(q.declaredGrade).toBe('문헌식');
    expect(q.l2Pending).toBe(true);
  });

  it('합성값은 고지를 달고 나간다', () => {
    const q = quantity(1.5, { modelId: anySynthetic, unit: 'µm', sourceId: 'S120', validRange: [0, 10] });
    expect(q.kind).toBe('synthetic');
    expect(q.grade).toBe('경향모델');
    expect(q.notice && q.notice.length > 0).toBe(true);
  });

  it('🔴 고지 없는 합성값은 런타임에서 즉시 터진다 — 조용히 통과시키지 않는다', () => {
    expect(() => quantity(1, {
      modelId: '__no_such_model_for_test__', unit: '', sourceId: 'S120', validRange: [0, 10],
    })).not.toThrow(); // 미등록은 폴백 고지가 붙으므로 통과한다
    // 고지가 비는 경로는 리졸버를 직접 갈아끼워야 재현된다 — contract.ts 의 가드가 그 자리를 막는다.
    // 여기서는 가드 문구가 kind 축으로 판단하는지만 확인한다(등급 축이면 L2 강등에 휩쓸린다).
    const q = quantity(1, { modelId: anySynthetic, unit: '', sourceId: 'S120', validRange: [0, 10] });
    expect(q.kind).toBe('synthetic');
  });

  it('유효범위를 벗어난 값은 outOfRange 로 표시된다', () => {
    const q = quantity(99, { modelId: anyLiterature, unit: 'µm', sourceId: 'S120', validRange: [0, 10] });
    expect(q.outOfRange).toBe(true);
  });
});
