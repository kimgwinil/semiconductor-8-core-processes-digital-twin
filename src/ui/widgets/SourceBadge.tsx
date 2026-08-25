import { getLang, t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { formatQuantity } from '@/lib/format';
import { isSourceHiddenInUi } from '@/models/source-visibility';
import { PENDING_SOURCE_ID } from '@/content/types';
import type { ModelKind, Quantity } from '@/models/contract';

/**
 * 🔴 근거를 아직 확정하지 못한 항목(`sourceId === 'PENDING'`).
 *
 * 「출처 비공개」(라이선스로 번호만 가림)와는 **다른 상태**다.
 * 비공개는 값의 출처가 있으나 표기할 수 없는 것이고, 이쪽은 **뒷받침하는 문헌이 아직 없다**는 뜻이다.
 * 주제가 가까운 출처를 갖다 붙이면 배지가 거짓말을 하므로, 화면에도 「출처 확인 중」이라고 그대로 적는다.
 */
function isSourcePending(sourceId: string): boolean {
  return sourceId === PENDING_SOURCE_ID;
}

/**
 * 규정 §5 게이트 2-1 — 모든 수치·식 옆에 분류 배지를 노출한다.
 * 🔴 A6-b — `경향모델` 등급이면 **배지만으로 끝내지 않고 고지 문장까지** 화면에 낸다(README §3-8).
 *    배지·고지 없는 합성 계수는 S번호 없는 값과 똑같이 취급한다.
 */
export function SourceBadge({ sourceId, grade, notice, kind, l2Pending, compact }: {
  /** 🔴 없을 수 있다. 합성값·운영규약에는 문헌 출처가 **없는 것이 사실**이다. */
  sourceId?: string;
  grade?: Quantity['grade'];
  notice?: string;
  /**
   * 🔴 A6-b 기계 검사 필드. DOM 에 `data-kind` 로 그대로 새긴다 —
   * 게이트가 자유 문장을 세지 않고 이 속성으로 검사한다(오케스트레이터 판정 2026-08-20).
   */
  kind?: ModelKind;
  /** 현업 검증(L2) 전 상태. DOM 에 `data-l2-pending` 으로 새긴다. */
  l2Pending?: boolean;
  /** 파라미터 범위 근거처럼 **출처만** 보이면 되는 자리. 등급·고지를 달지 않는다. */
  compact?: boolean;
}): React.ReactElement | null {
  // 🔴 표시만 끈다 — CEO 지시 2026-08-23·08-24. 데이터(`sourceId`·`grade`·`kind`·`notice`)는
  //    그대로 흘러 들어오고, 여기서 **그리지 않을 뿐**이다. `SHOW_PROVENANCE` 한 줄로 되살아난다.
  if (!SHOW_PROVENANCE) return null;
  // 🔴 라이선스상 화면에 번호를 낼 수 없는 출처는 번호를 가린다. 값은 쓰되 출처를 주장하지 않는다.
  const hidden = sourceId ? isSourceHiddenInUi(sourceId) : false;
  // 🔴 근거 미확정은 가까운 출처로 때우지 않는다. 「출처 확인 중」이라고 그대로 적는다.
  const pending = sourceId ? isSourcePending(sourceId) : false;
  // 🔴 합성값·운영규약은 **문헌 출처가 없다.** 빌린 S번호를 띄우지 않고, 빈칸으로도 두지 않는다 —
  //    빈칸은 「아직 안 채운 것」으로 보이지만 **없다는 사실 자체가 정보**다(오케스트레이터 판정 2026-08-20).
  //    🔴 `PENDING`(문헌이 있는데 못 찾음, 조달 대상)과 **다른 상태**다. 같은 표에 세지 마라.
  const noSource = kind !== undefined && kind !== 'literature';
  const idLabel = noSource
    ? (kind === 'operational' ? t('srcBadge.noSourceOperational') : t('srcBadge.noSourceSynthetic'))
    : pending ? t('srcBadge.pending') : hidden ? t('srcBadge.hidden') : (sourceId ?? t('srcBadge.pending'));
  const titleLabel = pending
    ? t('srcBadge.pendingTitle')
    : hidden
      ? t('srcBadge.hiddenTitle')
      : null;
  // `--hidden` 은 「번호가 아닌 문구가 들어왔다」는 표시(이탤릭·점선 테두리)라 두 상태가 공유한다.
  // `--pending` 은 나중에 따로 색을 줄 수 있도록 함께 붙여 둔다.
  const idClass = noSource
    ? 'srcBadge__id--hidden srcBadge__id--noSource'
    : pending ? 'srcBadge__id--hidden srcBadge__id--pending'
      : hidden ? 'srcBadge__id--hidden' : '';

  if (compact) {
    return (
      <span className="srcBadge" title={titleLabel ?? t('srcBadge.rangeTitle', { sourceId: sourceId ?? '—' })}>
        <span className={`srcBadge__id ${idClass}`}>{idLabel}</span>
      </span>
    );
  }
  const g = grade ?? '경향모델';
  // 🔴 kind 를 안 받은 옛 호출부는 안전한 쪽(합성)으로 본다. 문헌식이라고 낙관하지 않는다.
  const k: ModelKind = kind ?? (g === '경향모델' ? 'synthetic' : 'literature');
  // 🔴 배지 문구는 **kind 가 먼저** 정한다. 운영규약(A15-op)은 물리식과 다른 배지를 달아야 한다는
  //    승인 조건이 있어서, 등급 문자열로만 그리면 그 조건을 못 지킨다.
  const label = k === 'operational'
    ? t('grade.operational')
    : g === '검증식' ? t('grade.verified')
      : g === '문헌식' ? t('grade.literature')
        : t('grade.trend');
  // 🔴 고지는 **두 줄**이다. 모델 고유 고지와 L2 고지를 합치면 어느 쪽이 빠졌는지 화면에서도
  //    게이트에서도 구분할 수 없다. 종전에 합성 고지가 통째로 사라진 것을 못 본 이유가 이것이다.
  const ownNotice = notice ?? (k === 'synthetic' ? t('grade.syntheticNotice') : null);
  const badgeMod = k === 'synthetic' ? 'trend' : k === 'operational' ? 'op' : 'ok';
  return (
    <span
      className="srcBadge"
      data-kind={k}
      data-grade={g}
      data-l2-pending={l2Pending ? 'true' : 'false'}
      data-source-id={noSource ? '' : (sourceId ?? '')}
      data-no-source={noSource ? 'true' : 'false'}
      title={titleLabel ?? t('srcBadge.title', { sourceId: sourceId ?? '—', grade: label })}
    >
      <span className={`srcBadge__grade srcBadge__grade--${badgeMod}`}>{label}</span>
      <span className={`srcBadge__id ${idClass}`}>{idLabel}</span>
      {ownNotice && (
        <span className={`srcBadge__notice srcBadge__notice--${k}`}>{ownNotice}</span>
      )}
      {l2Pending && (
        <span className="srcBadge__notice srcBadge__notice--l2">{t('grade.preL2Notice')}</span>
      )}
    </span>
  );
}

/**
 * 값 + 단위 + 배지 + 고지 + 경고를 한 덩어리로 낸다. **`.qty` 마크업의 정본은 여기 하나다.**
 *
 * 🔴 2026-08-21 까지 이 컴포넌트는 호출부가 0곳인 死컴포넌트였고, 그 사이
 *    `LabRunner` 가 같은 마크업을 손으로 다시 짰다. 그러면서 **`q.outOfRange` 를 빠뜨렸다** —
 *    물리층 `validRange` 이탈(음수 선폭·음수 표준편차)이 화면에 한 글자도 안 나왔다.
 *    옳은 코드가 있는데 아무도 부르지 않은 것이 결함의 원인이었다. **다시 갈라놓지 마라.**
 *
 * 🔴 `data-*` 속성은 장식이 아니다. `scripts/check-a6b.mjs`(R1·R2·R3·R4)와 `qa-sweep` 이
 *    실제로 읽는다 — 지우면 게이트가 깨진다.
 */
export function QuantityView({ q, label, outputId, valueText, specNote, specBasis, roleNote, specFail }: {
  q: Quantity;
  label: string;
  /** 게이트가 읽는 출력 식별자(`data-output-id`). 실습 화면은 반드시 넘긴다. */
  outputId?: string;
  /** 표시용으로 이미 반올림한 값. 없으면 기본 서식(`formatQuantity`)을 쓴다. */
  valueText?: string;
  /** 합격창 표기(`규격 ≤ 58`). 판정 대상일 때만. */
  specNote?: string;
  /**
   * 🔴 **합격창 근거 배지**(`<PassBasisBadge>`). 「95 ~ 105 nm」가 **어디서 온 값인가**를 말한다.
   *
   * CEO 지적(2026-08-24): 수식·물리량에는 출처 배지가 붙는데 **합격창에만 없었다.**
   * 위 `<SourceBadge>` 는 **모델(계산식)의 등급**이고 이것은 **판정선의 근거**다 — 서로 다른 명제이며,
   * 같은 줄에 둘이 나란히 서는 것이 정상이다. 예: 「문헌식 S141」 모델이 낸 값을 「근거 · 교육용 설정값」
   * 창으로 재는 칸이 실재한다(포토 해상도).
   *
   * 🔴 **`specNote` 바로 뒤에 그린다 — 위 `<SourceBadge>` 앞으로 옮기지 마라.**
   *    `check-a6b` 가 `.qty` 안 **첫 `.srcBadge`** 의 `data-kind` 를 읽는다. 이 배지에는 `data-kind` 가
   *    없으므로(창 근거는 모델 등급이 아니다) 앞에 서면 R1 이 24칸 전부에서 실패한다.
   */
  specBasis?: React.ReactNode;
  /** `표시만 · 판정 제외` 처럼 판정에서 빠진 이유. */
  roleNote?: string;
  /** 합격창 미달. 🔴 물리 유효범위 이탈(`q.outOfRange`)과 **다른 명제**다. */
  specFail?: boolean;
}): React.ReactElement {
  // 🔴 두 상태를 가른다.
  //  · q.outOfRange — 물리층 `validRange` 이탈. **성립할 수 없는 값**(음수 길이 등)
  //  · specFail     — 합격창 미달. 값 자체는 성립한다
  //  둘 다면 물리 쪽을 먼저 낸다. 음수 선폭이 「규격 밖」으로만 읽히면 학습자가 잘못 배운다.
  const flagged = q.outOfRange || specFail === true;
  return (
    <div
      className={`qty ${flagged ? 'is-outOfRange' : ''} ${q.outOfRange ? 'is-outOfLimit' : ''}`.trimEnd()}
      data-output-id={outputId}
      data-model-id={q.modelId}
      data-kind={q.kind}
      data-l2-pending={q.l2Pending ? 'true' : 'false'}
      data-out-of-range={q.outOfRange ? 'true' : 'false'}
      data-spec-fail={specFail === true ? 'true' : 'false'}
    >
      {/* 🔴 라벨 문자열 자체에 S번호가 박힌 칸이 있다(packaging 열저항 — 「출처 배지가 v 에 따라
          S247 ↔ S255 로 바뀐다」). 배지를 꺼도 라벨은 남으므로 여기서 함께 거른다. */}
      <span className="qty__label">{SHOW_PROVENANCE ? label : redactProvenance(label)}</span>
      <span className="qty__value">{valueText ?? formatQuantity(q.value)}</span>
      <span className="qty__unit">{getLang() === 'en' ? (q.unitEn ?? q.unit) : q.unit}</span>
      <SourceBadge sourceId={q.sourceId} grade={q.grade} notice={q.notice} kind={q.kind} l2Pending={q.l2Pending} />
      {specNote !== undefined && (
        // 🔴 배지를 `qty__spec` **안**에 넣는다. `.qty` 는 flex-wrap 이라 밖에 두면 좁은 화면에서
        //    규격 라벨과 근거 배지가 서로 다른 줄로 갈라져 「어느 숫자의 근거인지」가 끊긴다.
        <span className="qty__spec">
          {specNote}
          {specBasis}
        </span>
      )}
      {roleNote !== undefined && <span className="qty__display">{roleNote}</span>}
      {q.outOfRange
        ? <span className="qty__warn qty__warn--limit">{t('lab.outOfRange')}</span>
        : specFail === true && <span className="qty__warn">{t('lab.outOfSpec')}</span>}
      {/* 🔴 A6-b — 합성 계수 고지는 `assumptions` 에 실려 온다.
          여기서 렌더하지 않으면 「실제 장비 상수 아님」이 화면에 영영 안 나온다(실제로 그랬다). */}
      {SHOW_PROVENANCE && q.assumptions.length > 0 && (
        <ul className="qty__assumptions">
          {q.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * 화면 표시용 수치 서식 — 본체는 **`@/lib/format` 하나뿐**이다.
 *
 * 🔴 여기 있던 본체는 2026-08-21 에 `src/lib/format.ts` 로 올렸다. 축 눈금 서식기
 *    (`viz/chart/common.ts#formatTick`)와 **규칙이 두 벌로 갈라져** 같은 값이 자리마다
 *    다르게 찍히고 있었기 때문이다(격자 7,559점에서 55.8 % 불일치).
 *    **여기에 다시 로직을 적지 마라.** 규칙을 바꿀 일이 있으면 `@/lib/format` 을 고친다.
 *    호출부 호환을 위해 이름만 다시 내보낸다.
 */
export { formatQuantity };
