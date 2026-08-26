import { useEffect, useState } from 'react';
import { getLang, setLang, t, LANGS } from '@/lib/i18n';
import { hrefFor } from '@/lib/router';
import { showTrackSelector } from '@/content/catalog';

/** 실제 현재 시각, 초 단위 갱신. 언마운트 시 반드시 clear 한다. */
function Clock(): React.ReactElement {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => { setNow(new Date()); }, 1000);
    return () => { window.clearInterval(id); };
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <time className="hdr__clock" dateTime={now.toISOString()}>{`${hh}:${mm}:${ss}`}</time>
  );
}

export function Header(): React.ReactElement {
  const lang = getLang();
  return (
    <header className="hdr">
      <nav className="hdr__nav">
        {/* 트랙이 1개면 선택기를 숨긴다(설계서 §11 C4) */}
        {showTrackSelector() && <span className="hdr__hint">{t('nav.trackHint')}</span>}
        <a className="hdr__link" href={hrefFor({ kind: 'hub' })}>{t('nav.allProcesses')}</a>
        <a className="hdr__link" href={hrefFor({ kind: 'about' })}>{t('nav.about')}</a>
        <label className="hdr__lang">
          <span className="sr-only">{t('nav.language')}</span>
          <select
            value={lang}
            onChange={(e) => { void setLang(e.target.value as (typeof LANGS)[number]); }}
          >
            {LANGS.map((l) => <option key={l} value={l}>{l === 'ko' ? '한국어' : l === 'ja' ? '日本語' : 'English'}</option>)}
          </select>
        </label>
      </nav>
      <div className="hdr__meta">
        <Clock />
        <span className="hdr__by">Design by gikim</span>
      </div>
    </header>
  );
}
