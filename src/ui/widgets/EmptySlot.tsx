import { t } from '@/lib/i18n';
import type { SectionId } from '@/content/types';

/**
 * 빈 슬롯. A1(8×9=72칸이 전부 존재)을 만족시키되, **비어 있음을 숨기지 않는다.**
 * 무엇이 없고 누가 채우는지를 화면에 밝힌다.
 */
export function EmptySlot({ processId, sectionId, owner }: { processId: string; sectionId: SectionId; owner: 'PLN' | 'DSN' | 'DEV' }): React.ReactElement {
  return (
    <div className="empty" role="note">
      <p className="empty__title">{t('empty.title')}</p>
      <p className="empty__body">{t('empty.body', { owner })}</p>
      <code className="empty__path">{`content/{lang}/${processId}.json → ${sectionId}`}</code>
    </div>
  );
}
