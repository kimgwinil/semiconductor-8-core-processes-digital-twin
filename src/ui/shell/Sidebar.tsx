import { processName, sectionsOf, allProcessIds } from '@/content/catalog';
import { getLang, t } from '@/lib/i18n';
import { hrefFor } from '@/lib/router';
import { stateOf } from '@/lib/progress';
import { CheckIcon } from '@/ui/icons/CheckIcon';
import { ProcessIcon } from '@/ui/icons/ProcessIcon';
import { ArrowIcon } from '@/ui/icons/ArrowIcon';
import type { Lang, SectionId } from '@/content/types';

interface Props { activeProcess?: string; activeSection?: SectionId }

export function Sidebar({ activeProcess, activeSection }: Props): React.ReactElement {
  const lang = getLang();
  const ids = allProcessIds();

  return (
    <nav className="side" aria-label={t('nav.sections')}>
      {/* 타이틀은 영문 고정 2줄 — 번역 대상이 아니다(CEO 지시 2026-08-22). */}
      <a className="side__brand" href={hrefFor({ kind: 'hub' })}>
        <span className="side__brandTop">SEMICONDUCTOR 8 CORE PROCESSES</span>
        <span className="side__brandSub">DIGITAL TWIN</span>
      </a>

      <ol className="side__procs">
        {ids.map((pid) => {
          const isActive = pid === activeProcess;
          const first = sectionsOf(pid)[0] as SectionId | undefined;
          if (!first) return null;
          const sections = isActive ? sectionsOf(pid) : [];
          return (
            <li key={pid}>
              <a
                className={`side__proc ${isActive ? 'is-active' : ''}`}
                href={hrefFor({ kind: 'section', processId: pid, sectionId: first })}
                aria-current={isActive ? 'true' : undefined}
              >
                {/* 장식이다 — 바로 옆 `side__procName` 이 공정명을 말한다. 그래서 `label` 을 주지 않는다
                    (`Icon.tsx` 가 `label` 없으면 `aria-hidden` 을 붙인다 — 종전 span 과 동작이 같다). */}
                <ProcessIcon processId={pid} className="side__procIcon" />
                <span className="side__procName">{processName(pid, lang)}</span>
              </a>
              {/* 선택한 공정의 절 목록 — 종전 Sidebar 의 절 이동 기능을 그대로 살린다 */}
              {isActive && (
                <ol className="side__list">
                  {sections.map((sid, i) => {
                    const st = stateOf(pid, sid);
                    return (
                      <li key={sid}>
                        <a
                          className={`side__item side__item--${st} ${sid === activeSection ? 'is-active' : ''}`}
                          href={hrefFor({ kind: 'section', processId: pid, sectionId: sid })}
                          aria-current={sid === activeSection ? 'page' : undefined}
                        >
                          <span className="side__num">
                            {i + 1}
                            {/* 완료 표시. 옆에는 절 번호뿐이라 이 아이콘이 뜻을 혼자 진다 → 이름을 준다. */}
                            {st === 'done' && <CheckIcon className="side__check" label={t('nav.sectionDone')} />}
                          </span>
                          <span className="side__label">{t(`section.${sid}`)}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>

      {/* 🔴 이전/다음 공정 이동 — `ArrowIcon` 이 원래 이 자리를 위해 만들어졌으나 배선이 안 돼
             `check-wiring` W5 에 걸려 있던 것을 여기서 잇는다. 스타일은 인라인이다
             (`src/ui/styles/index.css` 는 이 작업의 편집 범위 밖 — `.sr-only` 만 기존 클래스 재사용). */}
      {activeProcess && <ProcessStepNav activeProcess={activeProcess} ids={ids} lang={lang} />}

      <a className="side__home" href={hrefFor({ kind: 'hub' })}>{t('nav.allProcesses')}</a>
    </nav>
  );
}

function ProcessStepNav({ activeProcess, ids, lang }: {
  activeProcess: string;
  ids: string[];
  lang: Lang;
}): React.ReactElement | null {
  const idx = ids.indexOf(activeProcess);
  const prevId = idx > 0 ? ids[idx - 1] : undefined;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : undefined;
  if (!prevId && !nextId) return null;

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 12, color: 'var(--ink-2)', textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingBlock: 8 }}>
      {prevId
        ? (
          <a
            style={linkStyle}
            href={hrefFor({ kind: 'section', processId: prevId, sectionId: sectionsOf(prevId)[0] as SectionId })}
          >
            <ArrowIcon dir="prev" className="side__stepIcon" />
            <span className="sr-only">{t('nav.prevProcess')}</span>
            {processName(prevId, lang)}
          </a>
        )
        : <span />}
      {nextId && (
        <a
          style={linkStyle}
          href={hrefFor({ kind: 'section', processId: nextId, sectionId: sectionsOf(nextId)[0] as SectionId })}
        >
          {processName(nextId, lang)}
          <span className="sr-only">{t('nav.nextProcess')}</span>
          <ArrowIcon dir="next" className="side__stepIcon" />
        </a>
      )}
    </div>
  );
}
