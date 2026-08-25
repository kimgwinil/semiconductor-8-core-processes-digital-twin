import { getLang, t } from '@/lib/i18n';
import { isSourceHiddenInUi } from '@/models/source-visibility';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { passBasisOf, type PassBasis } from '@/models/passBasis';
import type { LabOutput, LabSpec } from '@/models/labs/spec';

/**
 * 🔴 **합격창 근거 배지** — 「이 값이 왜 합격선인가」를 합격창 옆에 한 덩어리로 붙인다.
 *
 * ## 왜 컴포넌트 하나인가
 * 합격창은 화면 **세 곳**에 나온다 — 수치 출력의 규격 라벨(`QuantityView` 의 `qty__spec`) ·
 * 계측기 눈금(`LabGauges` 의 `gauge__spec`) · 스코프 합격 띠 범례(`LabScope` 의 `scope__legend`).
 * CEO 지시가 못박은 것이 이것이다 — **「세 곳이 같은 근거를 말해야 한다. 한 곳만 붙이면 다른
 * 곳에서 여전히 출처 없는 숫자가 보인다.」** 세 곳이 각자 문구를 만들면 반드시 갈라진다.
 * 그래서 **문구를 만드는 곳도, 그리는 곳도 여기 하나**다. 근거 자체는 `models/labs/passBasis`
 * 원장 하나가 정하므로, **세 곳이 다른 말을 하는 것이 구조적으로 불가능하다.**
 * (`tests/unit/pass-basis.test.ts` 가 세 곳이 같은 함수를 부르는지 실제로 검사한다.)
 *
 * ## 🔴 왜 `.srcBadge` 클래스를 빌려 쓰고 새 CSS 를 만들지 않았나
 * ① 기존 배지와 **같아 보여야** 학습자가 새 기호를 배우지 않는다.
 * ② 2026-08-24 당시 `ui/styles/index.css` · `instruments.css` 를 **다른 세션이 쓰고 있었다.**
 *    같은 파일을 양쪽에서 고치면 한쪽이 조용히 사라진다 — 그래서 CSS 를 한 줄도 건드리지 않았다.
 *
 * ## 🔴 `check-a6b` 를 깨뜨리지 않는 배치 규약 (지키지 않으면 24칸 전부 빨개진다)
 * `check-a6b` 는 `.qty` 안에서 **`querySelector('.srcBadge')` — 문서 순서 첫 배지**를 잡아
 * `data-kind` 를 읽는다. 이 배지에는 `data-kind` 가 없다(모델 등급이 아니라 창 근거이므로 **없는 것이 옳다**).
 * → **반드시 모델 등급 배지(`<SourceBadge>` 전체 모드) 뒤에 놓는다.** 앞에 놓으면 게이트가
 *    이 배지를 모델 배지로 오인해 `badgeKind = null` 로 읽고 R1 이 전 출력에서 실패한다.
 *    구분용으로 `data-pass-basis` 를 새긴다 — 게이트가 나중에 둘을 갈라 볼 수 있게.
 *
 * ⛔ **이 배지는 합격창 값을 바꾸지 않는다.** 읽어서 보일 뿐이다.
 */
function PassBasisBadge({ basis }: { basis: PassBasis }): React.ReactElement {
  const { kind, sourceId } = basis;

  // 🔴 라이선스상 번호를 낼 수 없는 출처는 번호를 가린다. 값은 쓰되 출처를 주장하지 않는다
  //    (`SourceBadge` 와 같은 규약 — 여기서 규칙을 다시 쓰지 않고 같은 판정 함수를 부른다).
  const hidden = kind === 'literature' && sourceId !== undefined && isSourceHiddenInUi(sourceId);

  // 🔴 세 갈래가 화면에서 **서로 다르게 읽혀야** 한다. 「교육용 설정값」과 「근거 미상」을
  //    같은 문구로 뭉뚱그리면, 「우리가 정한 목표」와 「출처를 못 댄 값」이 구별되지 않는다.
  const idLabel = kind === 'literature'
    ? (hidden ? t('passBasis.hidden') : (sourceId ?? t('passBasis.unknown')))
    : kind === 'educational' ? t('passBasis.educational') : t('passBasis.unknown');

  // 번호가 아닌 문구가 들어온 자리는 이탤릭·점선(기존 `--hidden` 규약 그대로).
  const idClass = kind === 'literature' && !hidden ? '' : ' srcBadge__id--hidden';

  // 🔴 근거 서술은 사전 키가 아니라 **원장 데이터**에 실려 온다(항목마다 다른 문장이라 키로 못 쪼갠다).
  //    랩 명세가 `ko`/`en` 을 나란히 들고 다니는 것과 같은 관례다(`LabOutput.ko`/`.en`).
  const note = getLang() === 'en' ? (basis.en ?? basis.ko) : (basis.ko ?? basis.en);
  const title = note !== undefined
    ? t('passBasis.titleWithNote', { what: idLabel, note })
    : t('passBasis.title', { what: idLabel });

  return (
    <span
      className="srcBadge"
      data-pass-basis={kind}
      data-pass-basis-source={kind === 'literature' && !hidden ? (sourceId ?? '') : ''}
      title={title}
    >
      <span className="srcBadge__grade srcBadge__grade--op">{t('passBasis.label')}</span>
      <span className={`srcBadge__id${idClass}`}>{idLabel}</span>
    </span>
  );
}

/**
 * 🔴 **세 표시 지점이 부르는 유일한 입구.**
 *
 * `LabRunner`(규격 라벨) · `LabGauges`(계측기 눈금) · `LabScope`(합격 띠 범례)가 **전부 이 함수**를
 * 부른다. 각자 `PASS_BASIS_LEDGER` 를 뒤지거나 배지를 직접 짜면, 한 곳을 고칠 때 나머지가 남아
 * **같은 합격창이 자리마다 다른 근거를 말하게 된다.** 이 프로젝트는 그 사고를 이미 겪었다 —
 * `QuantityView` 가 죽어 있는 동안 `LabRunner` 가 같은 마크업을 손으로 다시 짜면서
 * `q.outOfRange` 를 통째로 빠뜨렸다(2026-08-21).
 *
 * 판정 대상이 아닌 출력에는 `null` 을 돌려준다 — 합격창이 없는 자리에 근거 배지를 달면
 * **없는 기준선이 있는 것처럼 보인다.**
 */
export function passBasisNode(spec: LabSpec, output: LabOutput): React.ReactElement | null {
  // 🔴 합격창 근거 배지 표시 비활성 — CEO 지시 2026-08-24. **한 곳에서 끈다.**
  //    `LabRunner`(규격 라벨)·`LabGauges`(계측기 눈금)·`LabScope`(합격 띠 범례) 세 곳이
  //    전부 이 함수를 부르므로 여기 한 줄이면 셋이 동시에 꺼진다. 세 파일을 각각 고치지 마라.
  //    `PASS_BASIS_LEDGER`·`passBasisOf()`·이 컴포넌트는 **그대로 살아 있다**.
  if (!SHOW_PROVENANCE) return null;
  const basis = passBasisOf(spec, output);
  if (!basis) return null;
  return <PassBasisBadge basis={basis} />;
}
