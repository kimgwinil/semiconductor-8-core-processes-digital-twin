import { useDeferredValue, useMemo } from 'react';
import type { LabOutput, LabParam, LabSpec, LabVerdict } from '@/models/labs/spec';
import type { LabPassRanges, NudgeDirection, ParamPassRange } from '@/models/labs/passRange';
import { failDirections, labPassRanges, paramNudgeDirection } from '@/models/labs/passRange';
import type { Quantity } from '@/models/contract';
import { NON_FINITE_LABEL, formatLimit, formatQuantity } from '@/lib/format';
import { t } from '@/lib/i18n';
import '@/ui/styles/passrange.css';

/**
 * 🔴 **합격 구간 안내** — CEO 지시 2026-08-24:
 * 「조작하는 부분에서 **합격을 위한 가이드라인을 최소/최대로 구분하여 제공**하는 것도 방법임」
 *
 * 그 앞에 CEO 가 화면을 보고 물으신 것이 이 화면의 공백을 정확히 짚는다 —
 * 「불합격으로 보이는데 이것을 정상 범위에 들게 하려면 **어떤 조작**이 있어야 하는가?」
 * **학습자는 물어볼 사람이 없다. 화면이 답해야 한다.**
 *
 * ## 무엇을 그리는가
 *  ① 각 손잡이에 **합격 구간 띠 + 수치**(「합격 범위 30 ~ 34 mJ/cm²」)
 *  ② 구간이 없으면 **그 사실을 글자로** — ⛔ 빈 띠만 보이고 침묵하지 않는다(D-050)
 *  ③ 불합격이면 판정 출력마다 **어느 쪽으로 벗어났는가**
 *
 * ## 🔴 계산은 models 가 한다 — 여기서 물리를 다시 쓰지 않는다
 * 구간은 `@/models/labs/passRange` 가 **격자점마다 `spec.compute()` 를 실제로 다시 불러서**
 * 만든다(A15 — 보간·근사 금지). 이 파일은 그 결과를 **그리기만** 한다.
 *
 * ## 🔴 정답을 알려주지 않는다
 * 「노광량을 32로 하세요」는 학습이 아니다. 화면이 말하는 것은 **방향과 범위까지**다.
 * 범위 안에서 어디에 둘지, 그리고 다른 손잡이를 어떻게 맞출지는 학습자 몫이다.
 *
 * ## 🔴 성능 — 매 프레임 돌지 않는다
 * `useDeferredValue` 로 **드래그 중에는 낡은 결과를 그대로 두고** 손이 멎은 뒤 다시 계산한다.
 * 실측(2026-08-24 · 24칸 전수, Apple Silicon Node): 한 칸 전체 재계산이
 * **최악 5,541회 호출 / 18.9 ms**(`deposition/lab-advanced`), 24칸 합계 26,068회.
 * 그래서 **「합격 구간 보기」 토글**도 함께 둔다 — 끄면 호출 0회다.
 */

/* ---------------- 스윕 훅 ---------------- */

export interface PassRangeState {
  /** 토글이 꺼져 있으면 `null`. */
  ranges: LabPassRanges | null;
  /** 🔴 지금 화면의 띠가 **한 박자 뒤진** 상태인가(드래그 중). 화면이 그 사실을 말한다. */
  stale: boolean;
}

/**
 * 🔴 **드래그 중에는 스윕을 다시 돌리지 않는다.**
 *
 * `useDeferredValue` 는 급한 렌더에서는 **이전 입력**을 돌려주고, 손이 멎으면 낮은 우선순위로
 * 한 번 더 렌더한다. 그래서 슬라이더를 끄는 동안 아래 `useMemo` 의 키가 바뀌지 않고
 * `labPassRanges()` 가 돌지 않는다.
 *
 * ⛔ 타이머(`setTimeout` 디바운스)를 쓰지 않는다 — 시간을 손으로 정하면 빠른 기기에서는 굼뜨고
 *    느린 기기에서는 여전히 버벅인다. 스케줄러가 기기 사정을 안다.
 */
export function usePassRanges(
  spec: LabSpec,
  inputs: Readonly<Record<string, number>>,
  enabled: boolean,
): PassRangeState {
  const deferred = useDeferredValue(inputs);
  const ranges = useMemo(
    () => (enabled ? labPassRanges(spec, deferred) : null),
    [spec, deferred, enabled],
  );
  return { ranges, stale: enabled && deferred !== inputs };
}

/* ---------------- 값 → 위치 ---------------- */

/**
 * 🔴 **손잡이 중심의 이동 구간에 맞춘다** — 트랙 폭이 아니라.
 *
 * `<input type="range">` 는 `appearance` 를 손대지 않은 네이티브 컨트롤이다. 실측(Chrome ·
 * 2026-08-24): 입력 요소에 UA 여백 **2 px**, 트랙 두께 **8 px**(입력 상자 안에서 세로 중앙),
 * 손잡이 **배치폭 16 px**. 그래서 손잡이 중심은 `min` 에서 왼쪽 끝 +8 px, `max` 에서
 * 오른쪽 끝 −8 px 에 선다 — **이동 구간은 트랙 폭 − 16 px** 이다.
 *
 * 트랙 폭(100 %)을 그대로 쓰면 **양 끝에서 8 px 씩 어긋난다.** 어긋난 만큼이 그대로 거짓말이 된다.
 *
 * 🔴 16 px 은 **Chrome 실측치**다. 브라우저·OS 가 다르면 손잡이 크기도 다르므로 띠가 몇 px
 *    밀릴 수 있다. 그래서 **정확한 수는 띠가 아니라 바로 아래 글자가 말한다** — 띠는 눈짐작용이다.
 */
const THUMB_PX = 16;

/** 0~1 로 정규화. 범위가 0 이면 왼쪽 끝에 둔다(나눗셈을 하지 않는다). */
function ratio(p: LabParam, v: number): number {
  const span = p.max - p.min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, (v - p.min) / span));
}

/** 손잡이 중심 좌표. `calc()` 는 **길이 × 순수 숫자** 곱을 허용한다 — 변수 곱이 아니다. */
function centerAt(r: number): string {
  return `calc(${THUMB_PX / 2}px + ${r} * (100% - ${THUMB_PX}px))`;
}

/* ---------------- 문구 ---------------- */

/** 합격 구간을 사람이 읽는 문자열로. 🔴 끊긴 구간은 **합치지 않고** 가운뎃점으로 잇는다. */
function intervalsText(range: ParamPassRange, param: LabParam, lang: string): string {
  const parts = range.intervals.map((iv) => (
    iv.min === iv.max
      ? formatQuantity(iv.min)
      : `${formatQuantity(iv.min)} ~ ${formatQuantity(iv.max)}`
  ));
  const paramUnit = lang === 'en' ? (param.unitEn ?? param.unit) : param.unit;
  const unit = paramUnit ? ` ${paramUnit}` : '';
  return `${parts.join(' · ')}${unit}`;
}

/**
 * 합격창을 **부등호 하나**로. 편측 규격을 `— ~ 48` 로 내면 값이 빠진 것처럼 읽힌다
 * (`LabRunner#specLabel` 과 같은 판단이다).
 */
function passWindowText(pass: LabOutput['pass'], digits?: number): string {
  const lo = pass?.min !== undefined ? formatLimit(pass.min, digits) : undefined;
  const hi = pass?.max !== undefined ? formatLimit(pass.max, digits) : undefined;
  if (lo !== undefined && hi !== undefined) return `${lo} ~ ${hi}`;
  if (hi !== undefined) return `≤ ${hi}`;
  if (lo !== undefined) return `≥ ${lo}`;
  return NON_FINITE_LABEL;
}

/** 이 값이 합격 구간 안인가. 이산 파라미터의 선택 버튼 표식에 쓴다. */
export function isPassValue(range: ParamPassRange | undefined, v: number): boolean {
  if (!range) return false;
  return range.intervals.some((iv) => v >= iv.min && v <= iv.max);
}

/**
 * 🔴 선택 버튼의 `data-pass` 속성값. **세 상태를 구분한다** — `'true'` · `'false'` · **없음**.
 *
 * 종전에는 `isPassValue()` 를 그대로 실어 **토글이 꺼진 상태에서도 `data-pass="false"`** 가
 * 붙었다. 그러면 「조사해 봤더니 이 선택지로는 안 된다」와 「아예 조사하지 않았다」가
 * 화면에서 같아진다 — 회색 표식을 다는 순간 그 자체가 거짓이 된다(D-050).
 * `range` 가 없으면 **속성 자체를 달지 않는다.**
 */
export function passDataAttr(range: ParamPassRange | undefined, v: number): 'true' | 'false' | undefined {
  if (!range) return undefined;
  return isPassValue(range, v) ? 'true' : 'false';
}

/* ---------------- 토글 ---------------- */

export function PassRangeToggle({ checked, onChange }: {
  checked: boolean;
  onChange(v: boolean): void;
}): React.ReactElement {
  return (
    <label className="prToggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{t('lab.passRange.toggle')}</span>
    </label>
  );
}

/* ---------------- 슬라이더 띠 ---------------- */

/**
 * 🔴 **손잡이 바로 아래의 「축 띠」.** 슬라이더 트랙과 **가로로 같은 좌표계**를 쓰는 별도 줄이다.
 *
 * ## 🔴 2026-08-24 재작업 — 왜 트랙 위 겹침을 그만두었나 (CEO 결함 신고)
 * 종전 구현은 네이티브 트랙(8 px) **위에** 8 px 띠를 겹쳐 그렸다. 브라우저 실측 결과
 * (`deposition/lab-basic` · 1440 px 라이트):
 *   · 합격 구간이 **있는** 칸의 띠 조각이 **8.48 × 8 px** — 432 px 트랙 위의 점 하나였다.
 *   · 합격 구간이 **없는** 칸은 이 컴포넌트가 `null` 을 돌려 **띠 자리 자체가 없었다.**
 *     화면에 남는 것은 11 px 회색 한 줄뿐 — 「기능이 안 켜졌다」와 눈으로 구분되지 않았다.
 * 두 문제의 뿌리가 하나다: **띠가 트랙에 종속돼 있었다.** 트랙 위에 겹치는 한 두께를 올리면
 * 손잡이(16 px)를 덮어 드래그가 안 보이고, 「없음」을 그리면 트랙 전체를 회색으로 덮어
 * 「전 구간 합격」으로 읽힌다.
 *
 * ⇒ 띠를 **자기 줄로 독립**시킨다. 손잡이를 가리지 않으므로 두껍게(18 px) 그릴 수 있고,
 *   **토글이 켜져 있으면 구간이 없어도 띠 자리가 남는다** — 그 자리가 회색 빗금 + 「합격 구간 없음」
 *   이라고 말한다. 그래서 세 상태가 눈으로 갈린다:
 *     ⓐ 토글 꺼짐 → **띠 줄 자체가 없다**
 *     ⓑ 구간 있음 → 축 틀 안에 **초록 빗금 구간 + 양 끝 기둥**
 *     ⓒ 구간 없음 → 축 틀 전체가 **회색 빗금** + 가운데 「합격 구간 없음」 표찰
 *
 * ## 🔴 가로 좌표계는 종전 그대로다 — 여기가 거짓말이 나는 자리다
 * 띠는 `.prTrackWrap`(격자)의 **둘째 행**이라 폭이 입력과 같고, `margin-inline-start: 2px`
 * 로 `<input>` 의 UA 여백을 그대로 흉내낸다(실측: 래퍼 x=976.59 · 입력 x=978.59, 폭 둘 다 432.39).
 * 구간 조각은 여전히 **손잡이 중심 이동 구간**(트랙 폭 − 16 px)에 맞춘다 — `centerAt()` 참조.
 *
 * 🔴 `pointer-events: none` — `.slider` 는 `<label>` 이다. 띠가 포인터를 받으면 드래그를 가로챈다.
 * 🔴 `aria-hidden` — 같은 사실을 바로 아래 `PassRangeText` 가 **글자로** 말한다. 두 번 읽히지 않게 한다.
 */
export function PassRangeBand({ param, range, value }: {
  param: LabParam;
  range: ParamPassRange | undefined;
  value: number;
}): React.ReactElement | null {
  /* 🔴 `range` 자체가 없을 때만 아무것도 그리지 않는다 = **토글이 꺼진 상태**뿐이다.
        ⛔ 종전처럼 `intervals.length === 0` 에서도 `null` 을 돌리면 「껐다」와 「없다」가 같아진다. */
  if (!range) return null;
  const empty = range.intervals.length === 0;
  return (
    /* 🔴 **파라미터 id 를 DOM 에 심지 않는다.** `data-pr-param={param.id}` 로 넣었다가
       `tests/unit/lab-stop-and-fixed.test.ts` ⓔ「변수명이 화면에 새지 않는다」를 깼다
       (2026-08-24 · 내가 넣고 내가 잡았다). 규칙이 옳다 — `pressureKPa` 는 학습자의 말이 아니다.
       QA 조회는 `.slider .prBand` 처럼 **구조**로 한다. */
    <span
      className={empty ? 'prBand prBand--none' : 'prBand'}
      data-pr-empty={empty ? 'true' : 'false'}
      aria-hidden="true"
    >
      {range.intervals.map((iv) => {
        const a = ratio(param, iv.min);
        const b = ratio(param, iv.max);
        return (
          <span
            key={`${iv.min}-${iv.max}`}
            className="prBand__seg"
            style={{
              insetInlineStart: centerAt(a),
              inlineSize: `calc(${Math.max(0, b - a)} * (100% - ${THUMB_PX}px))`,
            }}
          />
        );
      })}
      {/* 🔴 구간이 없으면 **그 자리에 글자로** 말한다. 빈 틀만 두고 침묵하지 않는다(D-050).
             아래 `PassRangeText` 가 「왜 없는가」를 이어서 말하므로 여기는 **짧은 표찰**이다. */}
      {empty && <span className="prBand__noneTag">{t('lab.passRange.noneBand')}</span>}
      {/* 현재 값 — 구간 조각 **뒤**에 그린다(DOM 순서). 손잡이가 축 어디에 있는지 띠 안에서도 보이게.
          🔴 구간이 없을 때도 그린다 — 「지금 여기 있고, 이 축 어디에도 합격이 없다」가 한 그림이 된다. */}
      <span className="prBand__now" style={{ insetInlineStart: centerAt(ratio(param, value)) }} />
    </span>
  );
}

/* ---------------- 슬라이더·선택 버튼 공용 문구 ---------------- */

/**
 * 「합격 범위 …」 한 줄. 🔴 **구간이 없으면 없다고 말한다.**
 *
 * 실측(2026-08-24 · 24칸 전수): 초기값 상태에서 **112개 파라미터 중 104개**가 구간이 없다.
 * 그것이 결함이 아니라 이 실습들의 설계다 — 초기값이 불합격에서 시작하고(PLN 「죽은 판정 없음」)
 * 손잡이 **하나만으로는** 거기서 빠져나올 수 없는 칸이 대부분이다. 그래서 이 줄은
 * 「구간을 알려주는 자리」인 만큼이나 **「하나로는 안 된다」를 알려주는 자리**다.
 */
export function PassRangeText({ param, range, stale, lang }: {
  param: LabParam;
  range: ParamPassRange | undefined;
  stale: boolean;
  lang: string;
}): React.ReactElement | null {
  if (!range) return null;
  const empty = range.intervals.length === 0;
  return (
    /* 🔴 `data-pr-empty` 는 **참/거짓**이라 파라미터 id 를 싣지 않는다 — 위 `PassRangeBand` 주석 참조. */
    <span
      className={empty ? 'prText prText--none' : 'prText'}
      data-pr-empty={empty ? 'true' : 'false'}
      data-pr-stale={stale ? 'true' : 'false'}
    >
      {empty
        ? t('lab.passRange.none')
        : t('lab.passRange.value', { range: intervalsText(range, param, lang) })}
      {/* 🔴 솎아서 쟀으면 그 사실을 그 자리에서 말한다. 조용히 성긴 구간을 내지 않는다. */}
      {range.coarse && <> {t('lab.passRange.coarse')}</>}
      {/* 🔴 한계선 밖이라 합격에서 뺀 격자점이 있으면 말한다 — 「없다」와 「못 쟀다」는 다르다. */}
      {range.blocked > 0 && <> {t('lab.passRange.blocked', { n: range.blocked })}</>}
      {/* 드래그 중 계산 상태는 문장에 덧붙이지 않는다. 긴 문장이 나타났다
          사라지면 줄바꿈이 바뀌어 슬라이더 드래그 중 패널 전체가 떨린다.
          시각 상태는 CSS 상태 표시자로, 보조기기 안내는 별도 sr-only로 유지한다. */}
      {stale && <span className="srOnly"> {t('lab.passRange.working')}</span>}
    </span>
  );
}

/* ---------------- 패널 꼬리말 ---------------- */

/**
 * 조작 패널 맨 아래. 🔴 **띠가 무엇인지**와 **얼마를 계산했는지**를 말한다.
 *
 * 전부가 「구간 없음」이면 손잡이마다 같은 문장이 N번 반복되므로, 그때는 **한 줄로 모아서**
 * 「둘 이상을 함께 바꿔야 한다」를 말한다(각 손잡이 줄은 그대로 두되 이 줄이 이유를 준다).
 */
export function PassRangeFooter({ ranges }: { ranges: LabPassRanges | null }): React.ReactElement | null {
  if (!ranges) return null;
  return (
    <div className="prFoot">
      {ranges.allEmpty && <p className="prFoot__none">{t('lab.passRange.noneAll')}</p>}
      <p>{t('lab.passRange.lead')}</p>
      <p>{t('lab.passRange.cost', { n: ranges.calls })}</p>
    </div>
  );
}

/* ---------------- 불합격 방향 ---------------- */

/**
 * 🔴 **어느 쪽으로 벗어났는가.** 「불합격」과 「규격 42 ~ 48」만으로는 학습자가
 *    자기 값이 위인지 아래인지 매번 눈으로 대조해야 한다. 그 대조를 화면이 한다.
 *
 * ⛔ **어디로 가야 하는지는 말하지 않는다** — 방향과 규격창까지다.
 * 🔴 판정을 여기서 다시 하지 않는다. `evaluate()` 가 이미 내린 결과(`verdict.outputs`)에
 *    방향만 붙인다(`failDirections`). 다시 하면 화면 두 곳이 다른 말을 하게 된다.
 */
export function FailDirectionList({ spec, verdict, q, lang }: {
  spec: LabSpec;
  verdict: LabVerdict;
  q: Record<string, Quantity>;
  lang: string;
}): React.ReactElement | null {
  const rows = useMemo(() => failDirections(spec, verdict.outputs), [spec, verdict]);
  if (rows.length === 0) return null;
  return (
    <section className="failDir" role="note">
      <h4 className="failDir__head">{t('lab.failHead')}</h4>
      <ul className="failDir__list">
        {rows.map((r) => {
          const o = spec.outputs.find((x) => x.id === r.outputId);
          if (!o) return null;
          const quantity = q[r.outputId];
          const name = lang === 'en' ? o.en : o.ko;
          const unit = quantity?.unit ? ` ${quantity.unit}` : '';
          // 🔴 값 서식은 출력 지표와 **같은 자릿수**를 쓴다. 규격선이 값보다 굵거나 가늘게
          //    찍히면 학습자가 넘었는지를 눈으로 셀 수 없다(R-DISP-1 과 같은 이유).
          const valueText = `${formatLimit(quantity?.value ?? Number.NaN, o.digits)}${unit}`;
          if (r.direction === 'outOfDomain') {
            return (
              <li className="failDir__row" data-fail-dir="outOfDomain" key={r.outputId}>
                {t('lab.failDomain', { name, value: valueText })}
              </li>
            );
          }
          const specText = `${passWindowText(o.pass, o.digits)}${unit}`;
          return (
            <li className="failDir__row" data-fail-dir={r.direction} key={r.outputId}>
              {r.direction === 'above'
                ? t('lab.failAbove', { name, value: valueText, spec: specText })
                : t('lab.failBelow', { name, value: valueText, spec: specText })}
            </li>
          );
        })}
      </ul>
      <p className="failDir__lead">{t('lab.failLead')}</p>
    </section>
  );
}

/* ---------------- 손잡이 방향(Nudge) ---------------- */

/**
 * 🔴 **이 손잡이는 어느 쪽입니까.** 스레드 재개 지점 ②의 앞 절반 — 「함께 바꿔야 열리는
 * 조합」(③, 이번 범위 밖)보다 먼저, **손잡이 하나만 옮겼을 때 지금 불합격인 출력들에
 * 가까워지는가**를 말한다. 계산은 `@/models/labs/passRange#paramNudgeDirection` 가 한다.
 *
 * ⛔ **정확한 부족량을 말하지 않는다.** `FailDirectionList`·`lab.failLead` 와 같은 원칙이다.
 *    (CEO 확인 2026-08-24 — 부족량 숫자 표시안은 기각, 방향만 유지.)
 * 🔴 방향을 낼 수 없는 손잡이(출력끼리 방향이 갈리거나, 계산이 막히거나, 움직여도
 *    가까워지지 않는 경우)는 **목록에서 빠진다** — 침묵이 틀린 안내보다 낫다.
 * 🔴 전부가 이미 합격이면(`verdict.pass`) 이 절 자체가 안 나온다.
 */
export function ParamNudgeHints({ spec, inputs, verdict, lang }: {
  spec: LabSpec;
  inputs: Readonly<Record<string, number>>;
  verdict: LabVerdict;
  lang: string;
}): React.ReactElement | null {
  const hints = useMemo(() => {
    const rows: { param: LabParam; direction: NudgeDirection }[] = [];
    for (const p of spec.params) {
      const dir = paramNudgeDirection(spec, inputs, p, verdict);
      if (dir) rows.push({ param: p, direction: dir });
    }
    return rows;
  }, [spec, inputs, verdict]);

  if (verdict.pass) return null;

  return (
    <section className="nudgeDir" role="note">
      <h4 className="nudgeDir__head">{t('lab.nudge.head')}</h4>
      {hints.length === 0
        ? <p className="nudgeDir__none">{t('lab.nudge.noneAll')}</p>
        : (
          <ul className="nudgeDir__list">
            {hints.map(({ param, direction }) => {
              const name = lang === 'en' ? param.en : param.ko;
              return (
                <li className="nudgeDir__row" data-nudge-dir={direction} key={param.id}>
                  {direction === 'up'
                    ? t('lab.nudge.up', { name })
                    : t('lab.nudge.down', { name })}
                </li>
              );
            })}
          </ul>
        )}
      <p className="nudgeDir__lead">{t('lab.nudge.lead')}</p>
    </section>
  );
}
