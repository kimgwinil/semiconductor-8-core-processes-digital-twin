import { Suspense, lazy, useEffect, useMemo, useSyncExternalStore } from 'react';
import { parseHash, subscribeRoute, type Route } from '@/lib/router';
import { getLang, subscribeLang, t } from '@/lib/i18n';
import { processName } from '@/content/catalog';
import { Header } from '@/ui/shell/Header';
import { Sidebar } from '@/ui/shell/Sidebar';
import { Hub } from '@/ui/shell/Hub';
import { mark } from '@/lib/progress';

const SectionView = lazy(async () => ({ default: (await import('@/ui/sections/SectionView')).SectionView }));
const About = lazy(async () => ({ default: (await import('@/ui/shell/About')).About }));

function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribeRoute,
    () => location.hash,
    () => '#/',
  );
  return useMemo(() => parseHash(hash), [hash]);
}

function useLang(): string {
  return useSyncExternalStore(subscribeLang, getLang, () => 'ko');
}

export function App(): React.ReactElement {
  const route = useRoute();
  const lang = useLang();

  useEffect(() => {
    if (route.kind === 'section') {
      mark(route.processId, route.sectionId, 'visited');
      document.title = `${processName(route.processId, getLang())} · ${t('app.title')}`;
    } else {
      document.title = t('app.title');
    }
    document.documentElement.lang = getLang();
  }, [route, lang]);

  return (
    <div className="app">
      {/* 좌: 타이틀 + 공정 8개(+ 선택 공정의 절). 우: 상단바 + 내용 */}
      <Sidebar
        activeProcess={route.kind === 'section' ? route.processId : undefined}
        activeSection={route.kind === 'section' ? route.sectionId : undefined}
      />
      <div className="app__col">
        <Header />
        <div className="app__body">
          <main className="app__main" id="main">
            <Suspense fallback={<div className="loading">{t('app.loading')}</div>}>
              {route.kind === 'hub' && <Hub />}
              {route.kind === 'about' && <About />}
              {route.kind === 'section' && (
                <SectionView key={`${route.processId}/${route.sectionId}`} processId={route.processId} sectionId={route.sectionId} />
              )}
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
