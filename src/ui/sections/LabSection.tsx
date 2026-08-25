import { useEffect, useState } from 'react';
import type { SectionId } from '@/content/types';
import { t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { rulesOf } from '@/models/direction';
import type { DirectionRule } from '@/models/direction';
import { labSpec, type LabSpec, type LabStage } from '@/models/labs/spec';
import { LabRunner } from '@/ui/sections/LabRunner';

/**
 * 🔴 출처·등급 표기 제거 — CEO 지시 2026-08-23·08-24. **표시만 끈다. 원문 데이터는 보존.**
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}


interface Props { processId: string; sectionId: SectionId }

/**
 * 물리층 등록은 한 번만. 동적 import 라 초기 청크에 들어가지 않는다.
 *
 * 🔴 실패를 **캐시하지 않는다.** 종전에는 거부된 프라미스가 `registered` 에 그대로 남아
 *    이후 어떤 칸으로 이동해도 영원히 같은 실패를 돌려줬다 — 화면은 24칸 전부가
 *    「불러오는 중…」이었다(2026-08-21 DEV 실측 · DSN 계측기 함정 #1).
 */
let registered: Promise<void> | null = null;
function ensurePhysics(): Promise<void> {
  registered ??= (async () => {
    const [phys, labs] = await Promise.all([import('@/models/physics'), import('@/models/labs')]);
    phys.registerPhysics();
    labs.registerAllLabs();
  })().catch((e: unknown) => { registered = null; throw e; });
  return registered;
}

/**
 * 기초·응용·심화 실습 슬롯.
 *
 * 🔴 이 화면은 **거짓말을 하지 않는 것**이 첫째 요건이다.
 *  - 물리층이 없는 공정에 급조한 값을 넣지 않는다. 「구현되지 않았다」고 그대로 쓴다.
 *  - 물리층이 있으면 그 공정에 정의된 방향성 규칙(A12)을 근거 S번호와 함께 보여 준다.
 *    검증 장치가 곧 학습 콘텐츠다 — 「무엇을 올리면 무엇이 어떻게 움직여야 하는가」.
 */
export function LabSection({ processId, sectionId }: Props): React.ReactElement {
  const [rules, setRules] = useState<DirectionRule[] | null>(null);
  const [spec, setSpec] = useState<LabSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    void ensurePhysics().then(
      () => {
        if (!alive) return;
        setRules(rulesOf(processId));
        setSpec(labSpec(processId, sectionId as LabStage) ?? null);
      },
      // 🔴 적재 실패를 「불러오는 중…」으로 위장하지 않는다. 종전에는 이 거부가 아무 데도
      //    닿지 않아, 배선 사고가 **느린 로딩과 구분되지 않는 무한 스피너**로 보였다.
      //    계측하는 사람이 「전 칸 씬 미배선」으로 오독하기 딱 좋은 신호였다.
      (e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => { alive = false; };
  }, [processId, sectionId]);

  if (loadError !== null) {
    return (
      <div className="lab">
        <div className="notImpl" role="alert">
          <p className="notImpl__badge">{t('lab.load.errorBadge')}</p>
          <p className="notImpl__title">{t('lab.load.errorTitle')}</p>
          <p className="notImpl__body">{loadError}</p>
        </div>
      </div>
    );
  }

  if (rules === null) return <div className="loading">{t('app.loading')}</div>;

  // 🔴 실습 명세가 있으면 배선된 실습 화면을 띄운다. 방향성 규칙은 그 아래 근거로 남긴다.
  if (spec) {
    return (
      <>
        <LabRunner spec={spec} />
        {rules.length > 0 && <RulesPanel rules={rules} />}
      </>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="lab">
        <div className="notImpl" role="note">
          <p className="notImpl__badge">{t('lab.notImplemented.badge')}</p>
          <p className="notImpl__title">{t('lab.notImplemented.title')}</p>
          <p className="notImpl__body">{t('lab.notImplemented.body')}</p>
          {/* 🔴 「출처가 확인된 문헌식만 제품에 들어갑니다」— 출처·등급 고지라 함께 끈다
              (CEO 지시 2026-08-24). 문안은 `lab.notImplemented.why` 키에 보존. */}
          {SHOW_PROVENANCE && <p className="notImpl__why">{t('lab.notImplemented.why')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="lab">
      <div className="notImpl notImpl--partial" role="note">
        <p className="notImpl__badge">{t('lab.partial.badge')}</p>
        <p className="notImpl__title">{t('lab.partial.title', { section: t(`section.${sectionId}`) })}</p>
        <p className="notImpl__body">{t('lab.partial.body')}</p>
      </div>

      <RulesPanel rules={rules} />
    </div>
  );
}

function RulesPanel({ rules }: { rules: DirectionRule[] }): React.ReactElement {
  return (
    <section className="lab__rules">
      <h3>{t('lab.rulesHeading')}</h3>
      {/* 🔴 「각 항목 옆 번호는 서지 원장의 출처 번호입니다」— 번호를 끈 지금은 가리킬 대상이
          없어 그대로 두면 거짓 안내가 된다. 문안은 `lab.rulesLead` 키에 보존. */}
      {SHOW_PROVENANCE && <p className="lab__rulesLead">{t('lab.rulesLead')}</p>}
      <ul>
        {rules.map((r) => (
          <li key={r.id}>
            <span className="lab__ruleId">{r.id}</span>
            <span className="lab__ruleText">{say(r.statement)}</span>
            {/* 🔴 S번호 배지 비활성 — CEO 지시 2026-08-24. `r.sourceId` 데이터는 그대로다.
                🔴 이 자리는 `<SourceBadge>` 를 안 거치고 손으로 짠 **두 번째 배지 구현**이다.
                   그래서 컴포넌트를 꺼도 여기만 살아남는다 — 같은 상수로 따로 끈다. */}
            {SHOW_PROVENANCE && (
              <span className="srcBadge"><span className="srcBadge__id">{r.sourceId}</span></span>
            )}
            {/* 🔴 `lab__ruleNote` 도 제작자용이다 — 실측된 것이 「M-1: 이 규칙의 출처는 라이선스
                미확보다. 화면에 출처 배지를 달지 마라」처럼 **개발 지시문**이었다. 규칙 본문
                (`r.statement`)은 학습 내용이라 남기고, 주석만 끈다(CEO 지시 2026-08-24). */}
            {SHOW_PROVENANCE && r.note && <span className="lab__ruleNote">{say(r.note)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
