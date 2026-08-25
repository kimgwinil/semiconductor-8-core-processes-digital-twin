import { activeTracks, processName, sectionsOf, trackName } from '@/content/catalog';
import { aggregate } from '@/lib/progress';
import { getLang, t } from '@/lib/i18n';
import { hrefFor } from '@/lib/router';
import { ProcessIcon } from '@/ui/icons/ProcessIcon';
import type { SectionId } from '@/content/types';

/**
 * 🔴 진도 절 수 표기 비활성 — CEO 지시 2026-08-24. **표시만 끈다. 데이터는 보존.**
 *
 * 끄는 것: 카드의 「0/9절」· 트랙의 「1/72절」· 상단의 「전체 진도 1/72절 (1%)」.
 * 보존하는 것: `lib/progress.ts` 집계·localStorage(`cjh.progress.v1`)·i18n 키
 *              (`hub.cardMeta`·`hub.trackMeta`·`hub.progress`)·사이드바 절 번호와 완료 체크.
 * 되살리는 법: 이 상수를 `true` 로 되돌린다. 그 한 줄뿐이다.
 */
const SHOW_PROGRESS_COUNTS = false;

export function Hub(): React.ReactElement {
  const lang = getLang();
  const tracks = activeTracks();
  const overall = aggregate({ kind: 'all' });

  return (
    <div className="hub">
      <section className="hub__intro">
        <h1>{t('hub.heading')}</h1>
        <p>{t('hub.lead')}</p>
        {SHOW_PROGRESS_COUNTS && (
          <p className="hub__progress">
            {t('hub.progress', { done: overall.done, total: overall.total, percent: overall.percent })}
          </p>
        )}
      </section>

      {tracks.map((track) => {
        const ts = aggregate({ kind: 'track', id: track.id });
        return (
          <section className="hub__track" key={track.id}>
            {/* 트랙이 1개일 때도 제목은 남긴다 — 2단계에서 트랙이 늘어나면 그대로 구분이 된다 */}
            <h2 className="hub__trackName">
              {trackName(track, lang)}
              {SHOW_PROGRESS_COUNTS && (
                <span className="hub__trackMeta">{t('hub.trackMeta', { done: ts.done, total: ts.total })}</span>
              )}
            </h2>
            <ul className="cards">
              {track.processes.map((pid) => {
                const ps = aggregate({ kind: 'process', id: pid });
                const first = sectionsOf(pid)[0] as SectionId | undefined;
                if (!first) return null;
                return (
                  <li className="card" key={pid}>
                    <a className="card__link" href={hrefFor({ kind: 'section', processId: pid, sectionId: first })}>
                      {/* 사이드바와 **같은 8종**을 쓴다(`ui/icons/ProcessIcon`). 카드에서는 크게 잡아
                          공정을 훑을 때 형태로 먼저 짚이게 한다 — 크기는 `.card__icon` 의 font-size 가 정한다.
                          장식이다: 바로 아래 `card__name` 이 공정명을 말하므로 `label` 을 주지 않는다. */}
                      <ProcessIcon processId={pid} className="card__icon" />
                      <span className="card__name">{processName(pid, lang)}</span>
                      {SHOW_PROGRESS_COUNTS && (
                        <>
                          <span className="card__meta">{t('hub.cardMeta', { done: ps.done, total: ps.total })}</span>
                          <span className="card__bar" aria-hidden="true">
                            <span className="card__barFill" style={{ inlineSize: `${ps.percent}%` }} />
                          </span>
                        </>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
