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

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const isEditable = (target: EventTarget | null): boolean =>
      target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    const preventUnlessEditable = (event: Event): void => {
      if (!isEditable(event.target)) event.preventDefault();
    };
    const preventAssetDrag = (event: DragEvent): void => {
      if (event.target instanceof Element && event.target.closest('img, svg, canvas')) event.preventDefault();
    };
    const preventCaptureShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      const devtools = command && event.shiftKey && ['c', 'i', 'j'].includes(key);
      if ((!isEditable(event.target) && command && ['c', 's', 'u'].includes(key)) || devtools || event.key === 'F12') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.documentElement.classList.add('copy-protected');
    document.addEventListener('contextmenu', preventUnlessEditable);
    document.addEventListener('copy', preventUnlessEditable);
    document.addEventListener('cut', preventUnlessEditable);
    document.addEventListener('dragstart', preventAssetDrag);
    document.addEventListener('keydown', preventCaptureShortcut, true);
    return () => {
      document.documentElement.classList.remove('copy-protected');
      document.removeEventListener('contextmenu', preventUnlessEditable);
      document.removeEventListener('copy', preventUnlessEditable);
      document.removeEventListener('cut', preventUnlessEditable);
      document.removeEventListener('dragstart', preventAssetDrag);
      document.removeEventListener('keydown', preventCaptureShortcut, true);
    };
  }, []);

  const copyright = lang === 'ko'
    ? '© 2026 GIKIM · 무단 복제·재배포 금지'
    : lang === 'ja'
      ? '© 2026 GIKIM · 無断複製・再配布禁止'
      : '© 2026 GIKIM · Unauthorized copying and redistribution prohibited';

  return (
    <div className="app">
      {import.meta.env.PROD && <div className="copyShieldWatermark" aria-hidden="true">{copyright}</div>}
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
