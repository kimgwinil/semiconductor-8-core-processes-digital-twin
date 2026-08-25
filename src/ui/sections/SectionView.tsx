import { Suspense, lazy, useEffect, useState } from 'react';
import type { SectionId, ProcessContent, ProseSectionId } from '@/content/types';
import { getLang, t } from '@/lib/i18n';
import { loadContent } from '@/content/loader';
import { hrefFor } from '@/lib/router';
import { processName } from '@/content/catalog';
import { Blocks } from '@/ui/widgets/Blocks';
import { EmptySlot } from '@/ui/widgets/EmptySlot';

const EquipmentSection = lazy(async () => ({ default: (await import('./EquipmentSection')).EquipmentSection }));
const LabSection = lazy(async () => ({ default: (await import('./LabSection')).LabSection }));
const TestSection = lazy(async () => ({ default: (await import('./TestSection')).TestSection }));
const ResultSection = lazy(async () => ({ default: (await import('./ResultSection')).ResultSection }));

interface Props { processId: string; sectionId: SectionId }

/**
 * 🔴 `principle` 은 **산문 절이다. 도해를 그리지 않는다.** (2026-08-23 · CEO 지적)
 *
 *    종전에는 `equipment` 와 `principle` 이 **같은 `EquipmentSection`** 을 탔다.
 *    `loadLabels(processId)` 는 `sectionId` 를 받지 않으므로 두 절이 **같은 SVG 도해 ·
 *    같은 라벨 14개 · 같은 제작 고지 16건**을 그렸고, 화면 윗부분이 글자 하나까지
 *    똑같았다. 다른 것은 아래 산문뿐이라 **같은 페이지로 읽혔다.**
 *
 *    도해는 「장비 구조」가 진다 — 부위 이름을 가르치는 것이 그 절의 일이다.
 *    「동작 원리」의 본문은 **시간축**(무엇이 어떤 순서로 일어나는가)이므로 산문이 진다.
 *    부위 이름이 필요하면 장비 구조 절로 보낸다(아래 `FigureHint`).
 *
 *    ⛔ `principle` 을 EQUIP_SECTIONS 로 되돌리지 마라. 중복 화면이 그대로 돌아온다.
 */
const PROSE_SECTIONS: ProseSectionId[] = ['theory', 'overview', 'principle'];
const EQUIP_SECTIONS: ProseSectionId[] = ['equipment'];
const LAB_SECTIONS: SectionId[] = ['lab-basic', 'lab-applied', 'lab-advanced'];

function isProse(id: SectionId): id is ProseSectionId {
  return (PROSE_SECTIONS as SectionId[]).includes(id);
}
function isEquip(id: SectionId): id is ProseSectionId {
  return (EQUIP_SECTIONS as SectionId[]).includes(id);
}

export function SectionView({ processId, sectionId }: Props): React.ReactElement {
  const lang = getLang();
  const [content, setContent] = useState<ProcessContent | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setContent(undefined);
    void loadContent(lang, processId).then((c) => { if (alive) setContent(c); });
    return () => { alive = false; };
  }, [lang, processId]);

  const heading = `${processName(processId, lang)} · ${t(`section.${sectionId}`)}`;

  return (
    <article className="section">
      <header className="section__head">
        <h1 className="section__title">{heading}</h1>
        <p className="section__crumb">{t(`section.${sectionId}.lead`)}</p>
      </header>

      <Suspense fallback={<div className="loading">{t('app.loading')}</div>}>
        {isProse(sectionId) && (
          <>
            {sectionId === 'principle' && <FigureHint processId={processId} />}
            {content === undefined ? <div className="loading">{t('app.loading')}</div>
              : content === null || content[sectionId].blocks.length === 0
                ? <EmptySlot processId={processId} sectionId={sectionId} owner="PLN" />
                : <Blocks title={content[sectionId].title} blocks={content[sectionId].blocks} />}
          </>
        )}

        {isEquip(sectionId) && (
          <EquipmentSection processId={processId} sectionId={sectionId} content={content ?? null} />
        )}

        {LAB_SECTIONS.includes(sectionId) && (
          <LabSection processId={processId} sectionId={sectionId} />
        )}

        {sectionId === 'test' && <TestSection processId={processId} />}
        {sectionId === 'result' && <ResultSection processId={processId} />}
      </Suspense>
    </article>
  );
}

/**
 * 「동작 원리」에서 도해를 뺐으므로, 부위 이름이 궁금한 사람을 **장비 구조 절로 보낸다.**
 * 도해를 두 번 그리는 대신 한 줄로 잇는다.
 */
function FigureHint({ processId }: { processId: string }): React.ReactElement {
  return (
    <p
      className="section__figureHint"
      style={{
        margin: '0 0 14px', padding: '10px 12px', fontSize: 13,
        color: 'var(--ink-2)', background: 'var(--surface)',
        border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      }}
    >
      {t('principle.figureHint')}{' '}
      <a href={hrefFor({ kind: 'section', processId, sectionId: 'equipment' })}>
        {t('principle.figureLink')}
      </a>
    </p>
  );
}
