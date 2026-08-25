import { t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';

export function About(): React.ReactElement {
  return (
    <article className="prose">
      <h1>{t('about.heading')}</h1>
      <p>{t('about.cleanroom')}</p>
      {/* 🔴 출처·등급 고지 문단 비활성 — CEO 지시 2026-08-24. 문안(`about.*` 키)은 보존.
          `about.sources`(「모든 수치는 출처 번호를 가집니다」)는 배지를 끈 지금 화면과
          어긋나기까지 한다 — 남겨 두면 그 자체가 거짓 문구가 된다. */}
      {SHOW_PROVENANCE && <p>{t('about.sources')}</p>}
      {SHOW_PROVENANCE && <p>{t('about.verification')}</p>}
    </article>
  );
}
