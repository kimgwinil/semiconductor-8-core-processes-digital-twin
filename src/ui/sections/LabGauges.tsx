import type { LabSpec } from '@/models/labs/spec';
import type { Quantity } from '@/models/contract';
import { formatLimit, formatQuantity, inPassWindow } from '@/lib/format';
import { t } from '@/lib/i18n';
import { passBasisNode } from '@/ui/widgets/PassBasisBadge';
import '@/ui/styles/instruments.css';

function localizedLabel(lang: string, item: { ko: string; en: string; ja?: string }): string {
  return lang === 'ko' ? item.ko : lang === 'ja' ? (item.ja ?? item.en) : item.en;
}

/**
 * 🔴 **계측기 패널** — 판정 출력을 「게이지」로 보인다.
 *
 * CEO 지시(2026-08-22): 「**계측기 및 스코프**가 있어야 기본 시뮬레이터」.
 * 종전 화면의 판정은 **숫자 한 줄 + 「규격 ≥ 0.8」 글자**뿐이었다. 그러면 학습자는
 * 「합격이냐」는 알아도 **「얼마나 아슬아슬하냐」**를 모른다. 규격 하한 0.80 에서 값이 0.81 인 것과
 * 1.40 인 것이 화면에서 **같게** 보였다.
 *
 * ## 🔴 새 숫자를 만들지 않는다
 * 여기 나오는 값은 전부 `spec.compute()` 가 이미 낸 `Quantity` 다. 합격창은 `outputs[].pass` 그대로,
 * 한계선은 `outputs[].domain ?? q.validRange` 그대로다. **계산이 없다 — 배치만 있다.**
 * 그래서 게이지와 위 「출력 지표」 줄은 원리상 어긋날 수 없다.
 *
 * ## 눈금 범위는 어떻게 정하나 (🔴 이것만이 이 파일의 유일한 판단이다)
 * 게이지는 「자」다. 자의 **양 끝**을 정해야 눈금이 생기는데, 합격창은 편측인 경우가 많아
 * (24칸 중 18칸) 끝이 열려 있다. 그래서:
 *   ① 물리적 정의역(`domain`)이 양끝 유한하면 **그것을 쓴다** — 가장 정직하다.
 *   ② 아니면 합격창 경계와 **현재 값**을 모두 담는 최소 구간을 잡고 양쪽에 여유를 준다.
 * 🔴 ②는 **표시 범위일 뿐 물리가 아니다.** 그래서 게이지 양끝에 값을 **적지 않는다** —
 *    적으면 학습자가 「거기까지가 한계」로 읽는다. 적는 것은 **합격창 경계와 현재 값**뿐이다.
 *
 * ## 🔴 색만으로 구분하지 않는다
 * 합격/불합격은 ①글자(「합격」/「불합격」) ②기호(✓/✗) ③바늘 모양(속 채움/속 빔) 셋으로 함께 말한다.
 * 합격창 띠는 색 + **대각 해치 무늬**를 함께 쓴다(스코프 패널과 같은 규약).
 */

/** 게이지 뷰박스. 가로는 반응형(`width: 100%`)이고 내부 좌표만 고정이다. */
const GAUGE_VB_W = 320;
const GAUGE_VB_H = 34;
/** 눈금자 좌우 여백 — 바늘이 끝에 붙어도 잘리지 않을 만큼. */
const PAD = 10;
const TRACK_Y = 13;
const TRACK_H = 12;

export function LabGauges({ spec, q, lang }: {
  spec: LabSpec;
  q: Record<string, Quantity>;
  lang: string;
}): React.ReactElement | null {
  /* 🔴 **판정 출력만** 게이지로 만든다. `display` 출력은 합격창이 없어 「자」의 눈금이 서지 않는다 —
     억지로 그리면 없는 기준선을 있는 것처럼 보이게 한다. */
  const rows = spec.outputs
    .filter((o) => o.role === 'judge' && o.pass && (o.pass.min !== undefined || o.pass.max !== undefined))
    .map((o) => ({ o, quantity: q[o.id] }))
    .filter((r): r is { o: typeof r.o; quantity: Quantity } => Boolean(r.quantity));

  if (rows.length === 0) return null;

  return (
    <section className="gauges">
      <h3>{t('lab.gauges')}</h3>
      <p className="gauges__lead">{t('lab.gaugesLead')}</p>
      <div className="gauges__list">
        {rows.map(({ o, quantity }) => (
          <Gauge key={o.id} spec={spec} output={o} q={quantity} lang={lang} />
        ))}
      </div>
    </section>
  );
}

function Gauge({ spec, output, q, lang }: {
  /** 🔴 합격창 근거 조회에 쓴다(`passBasisNode`). 게이지가 새 숫자를 만드는 데는 쓰지 않는다. */
  spec: LabSpec;
  output: LabSpec['outputs'][number];
  q: Quantity;
  lang: string;
}): React.ReactElement {
  const pass = output.pass;
  const scale = gaugeScale(pass, q.value, output.domain ?? q.validRange);
  const ok = pass ? inPassWindow(pass, q.value) : null;
  const name = localizedLabel(lang, output);

  const px = (v: number): number => {
    const span = scale[1] - scale[0];
    if (!Number.isFinite(span) || span === 0) return PAD + (GAUGE_VB_W - 2 * PAD) / 2;
    const r = (v - scale[0]) / span;
    return PAD + Math.min(1, Math.max(0, r)) * (GAUGE_VB_W - 2 * PAD);
  };

  // 합격창의 화면상 좌우 끝. 편측이면 눈금자 끝까지 채운다 — 「그쪽은 열려 있다」가 사실이다.
  const bx0 = px(pass?.min !== undefined && Number.isFinite(pass.min) ? pass.min : scale[0]);
  const bx1 = px(pass?.max !== undefined && Number.isFinite(pass.max) ? pass.max : scale[1]);
  const needleX = px(q.value);
  // 🔴 값이 표시 범위를 넘어갔는가. 넘었으면 바늘을 끝에 붙이고 **화살표**로 「밖」임을 말한다.
  const under = q.value < scale[0];
  const over = q.value > scale[1];

  return (
    <figure
      className={`gauge${ok === false ? ' gauge--fail' : ''}`}
      data-gauge-output={output.id}
      data-gauge-pass={ok === null ? '' : String(ok)}
    >
      <figcaption className="gauge__head">
        <span className="gauge__name">{name}</span>
        <span className="gauge__value">
          {formatQuantity(q.value, output.digits)} <em>{lang !== 'ko' ? (q.unitEn ?? q.unit) : q.unit}</em>
        </span>
        {/* 🔴 기호 + 글자. 색이 안 보여도 판정이 읽힌다. */}
        {ok !== null && (
          <span className={`gauge__flag gauge__flag--${ok ? 'ok' : 'bad'}`}>
            {ok ? '✓' : '✗'} {ok ? t('lab.pass') : t('lab.fail')}
          </span>
        )}
      </figcaption>

      <svg
        className="gauge__svg"
        viewBox={`0 0 ${GAUGE_VB_W} ${GAUGE_VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('lab.gaugeAria', {
          name,
          value: `${formatQuantity(q.value, output.digits)} ${lang !== 'ko' ? (q.unitEn ?? q.unit) : q.unit}`,
          spec: windowText(pass, output.digits),
          verdict: ok === null ? '' : (ok ? t('lab.pass') : t('lab.fail')),
        })}
      >
        <defs>
          <pattern id={`gaugeHatch-${output.id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ok, #1a7f4b)" strokeWidth="1.3" opacity="0.4" />
          </pattern>
        </defs>

        {/* 눈금자 바탕 */}
        <rect
          x={PAD} y={TRACK_Y} width={GAUGE_VB_W - 2 * PAD} height={TRACK_H}
          rx={3} fill="var(--surface-2, #eef1f5)" stroke="var(--line, #d8dde5)" strokeWidth={1}
        />
        {/* 합격창 — 면 + 해치 + 테두리 */}
        <rect
          x={Math.min(bx0, bx1)} y={TRACK_Y} width={Math.abs(bx1 - bx0)} height={TRACK_H}
          rx={2} fill={`url(#gaugeHatch-${output.id})`}
          stroke="var(--ok, #1a7f4b)" strokeWidth={1} strokeOpacity={0.6}
        />
        {/* 합격창 경계 — 굵은 세로 눈금. 🔴 **편측이면 있는 쪽만 긋는다.** */}
        {pass?.min !== undefined && Number.isFinite(pass.min) && (
          <line x1={bx0} y1={TRACK_Y - 3} x2={bx0} y2={TRACK_Y + TRACK_H + 3} stroke="var(--viz-spec, #c0261c)" strokeWidth={2} />
        )}
        {pass?.max !== undefined && Number.isFinite(pass.max) && (
          <line x1={bx1} y1={TRACK_Y - 3} x2={bx1} y2={TRACK_Y + TRACK_H + 3} stroke="var(--viz-spec, #c0261c)" strokeWidth={2} />
        )}

        {/* 바늘 — 합격이면 속을 채우고 불합격이면 비운다(색 없이도 갈린다). */}
        <g>
          <line
            x1={needleX} y1={TRACK_Y - 6} x2={needleX} y2={TRACK_Y + TRACK_H + 6}
            stroke="var(--surface, #ffffff)" strokeWidth={4}
          />
          <line
            x1={needleX} y1={TRACK_Y - 6} x2={needleX} y2={TRACK_Y + TRACK_H + 6}
            stroke="currentColor" strokeWidth={2}
          />
          <path
            d={under
              ? `M${needleX},${TRACK_Y - 8} L${needleX + 9},${TRACK_Y - 2} L${needleX},${TRACK_Y - 2} Z`
              : over
                ? `M${needleX},${TRACK_Y - 8} L${needleX - 9},${TRACK_Y - 2} L${needleX},${TRACK_Y - 2} Z`
                : `M${needleX - 5},${TRACK_Y - 8} L${needleX + 5},${TRACK_Y - 8} L${needleX},${TRACK_Y - 1} Z`}
            fill={ok === false ? 'none' : 'currentColor'}
            stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round"
          />
        </g>
      </svg>

      <p className="gauge__scaleRow">
        <span className="gauge__spec">{windowText(pass, output.digits)}</span>
        {/* 🔴 합격창 근거 — 「이 눈금의 초록 띠가 왜 거기 있는가」. 계측기만 붙이면 위 수치 출력에서
            여전히 출처 없는 숫자가 보이므로, 세 곳이 **같은 함수**(`passBasisNode`)를 부른다. */}
        {passBasisNode(spec, output)}
        {(under || over) && <span className="gauge__outside">{t('lab.gaugeOutside')}</span>}
      </p>
    </figure>
  );
}

/**
 * 합격창 표기. 🔴 `LabRunner` 의 `specLabel` 과 **같은 서식기**(`formatLimit`)를 쓴다 —
 * 게이지와 출력 줄의 규격선 자릿수가 갈리면 학습자가 두 화면을 대조할 수 없다.
 */
function windowText(pass: { min?: number; max?: number } | undefined, digits?: number): string {
  if (!pass) return '';
  const lo = pass.min !== undefined ? formatLimit(pass.min, digits) : undefined;
  const hi = pass.max !== undefined ? formatLimit(pass.max, digits) : undefined;
  if (lo !== undefined && hi !== undefined) return t('lab.specRange', { lo, hi });
  if (hi !== undefined) return t('lab.specMax', { hi });
  if (lo !== undefined) return t('lab.specMin', { lo });
  return '';
}

/**
 * 게이지 눈금 양끝을 정한다.
 *
 * 🔴 **이 함수가 내는 값은 「표시 범위」이지 물리량이 아니다.** 그래서 화면에 숫자로 적지 않는다.
 *    적는 순간 학습자는 그것을 장비 한계로 읽는다. 적는 것은 **합격창 경계와 현재 값**뿐이다.
 *
 * 🔴 **정의역을 자의 양끝으로 쓰지 않는다 — 2026-08-22 브라우저 실측으로 뒤집은 규칙이다.**
 *    처음에는 「물리적 정의역(`domain ?? validRange`)이 양끝 유한하면 그것을 쓴다, 가장 정직하다」로
 *    짰다. 화면에서 **정확히 그것 때문에 계측기가 못 쓰게 됐다** — `metal/lab-advanced` 의
 *    제거율 MRR 은 합격창이 302.5 ~ 350.1 nm/min 인데 물리 정의역이 그보다 **수십 배 넓어**,
 *    합격창이 눈금자에서 **1 px 미만의 실선**이 되고 바늘은 왼쪽 끝에 붙었다. 7개 게이지 중
 *    합격창이 보이는 것은 편측 규격 2개뿐이었다. 「현재값·합격창·한계가 한눈에」가 목적인데
 *    **셋 중 둘이 안 보였다.**
 *
 *    「정직함」의 방향을 잘못 잡았다. 계측기의 눈금은 **판정을 읽는 자**이지 물리량의 전 범위를
 *    보여주는 자가 아니다. 자동차 계기판이 0 ~ 광속을 그리지 않는 것과 같다.
 *
 * 그래서 지금 규칙:
 *  ① **합격창 경계 ∪ 현재 값**을 담는 최소 구간을 잡고 양쪽에 40 % 여유. 합격창이 항상 보인다.
 *  ② 정의역이 유한하면 거기까지만 **자른다**(넘어서 그리지 않는다). 늘리는 데는 쓰지 않는다.
 *  ③ 구간이 0폭(값·경계가 한 점) → 값의 크기에 비례한 폭. 0 이면 ±1.
 *
 * 🔴 값이 이 범위 밖이면(정의역 이탈 등) 바늘을 끝에 붙이고 **화살촉 + 「눈금 범위 밖」 글자**로
 *    그 사실을 말한다. 조용히 끝에 붙이면 「끝에 딱 맞다」로 읽힌다.
 */
function gaugeScale(
  pass: { min?: number; max?: number } | undefined,
  value: number,
  domain: readonly [number, number] | undefined,
): [number, number] {
  const marks: number[] = [];
  if (pass?.min !== undefined && Number.isFinite(pass.min)) marks.push(pass.min);
  if (pass?.max !== undefined && Number.isFinite(pass.max)) marks.push(pass.max);
  if (Number.isFinite(value)) marks.push(value);
  if (marks.length === 0) return [0, 1];

  let lo = Math.min(...marks);
  let hi = Math.max(...marks);
  let span = hi - lo;
  if (!(span > 0)) {
    // ③ 한 점으로 뭉쳤다 — 값의 크기에 비례한 폭. 0 이면 ±1.
    span = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 1;
    lo -= span / 2;
    hi += span / 2;
  }
  const pad = (hi - lo) * 0.4;
  let s0 = lo - pad;
  let s1 = hi + pad;

  // ② 정의역으로 **자르기만** 한다. 🔴 자른 뒤에도 합격창 경계가 잘리지 않게 지킨다 —
  //    잘리면 학습자가 「합격창이 저기서 끝난다」로 읽는다(거짓이다).
  if (domain && Number.isFinite(domain[0]) && domain[0] > s0) s0 = Math.min(domain[0], lo);
  if (domain && Number.isFinite(domain[1]) && domain[1] < s1) s1 = Math.max(domain[1], hi);
  if (!(s1 > s0)) return [lo, hi > lo ? hi : lo + 1];
  return [s0, s1];
}
