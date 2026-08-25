import { describe, expect, it } from 'vitest';
import { UI_HIDDEN_SOURCES, isSourceHiddenInUi, hiddenSourceReason } from '@/models/source-visibility';
import { SOURCE_IDS } from '@/models/sources.generated';

/**
 * 🔴 원장이 「라이선스 불가 · 화면 사용 보류」로 판정한 출처가 배지로 새는 것을 막는다.
 * 계산에 값을 쓰는 것과 화면에 출처를 표기하는 것은 별개다.
 */
describe('화면 비노출 출처', () => {
  it('목록이 비어 있지 않다', () => expect(UI_HIDDEN_SOURCES.length).toBeGreaterThan(0));

  it('모든 항목이 실재하는 S번호다', () => {
    for (const h of UI_HIDDEN_SOURCES) {
      expect(SOURCE_IDS as readonly string[], `${h.id} 가 원장에 없다`).toContain(h.id);
    }
  });

  it('모든 항목에 사유와 해제 조건이 적혀 있다', () => {
    for (const h of UI_HIDDEN_SOURCES) {
      expect(h.reason.length, `${h.id} reason`).toBeGreaterThan(20);
      expect(h.unblockedBy.length, `${h.id} unblockedBy`).toBeGreaterThan(5);
    }
  });

  it('S107(편석계수 · 라이선스 불가)이 가려진다', () => {
    expect(isSourceHiddenInUi('S107')).toBe(true);
    expect(hiddenSourceReason('S107')).toContain('라이선스');
  });

  it('일반 출처는 가려지지 않는다', () => {
    expect(isSourceHiddenInUi('S120')).toBe(false);
    expect(isSourceHiddenInUi('S100')).toBe(false);
  });
});
