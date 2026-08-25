import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LabParam, LabSpec } from '@/models/labs/spec';
import { evaluate, isDiscreteParam, labSceneBindings, paramOptions } from '@/models/labs/spec';
import type { Quantity } from '@/models/contract';
import type { LimitCondition } from '@/models/contract';
import { OutOfLimitError } from '@/models/contract';
import { getLang, t } from '@/lib/i18n';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { SourceBadge, QuantityView, formatQuantity } from '@/ui/widgets/SourceBadge';
import { passBasisNode } from '@/ui/widgets/PassBasisBadge';
import { formatJudged, formatLimit, type JudgedDisplay } from '@/lib/format';
import { SwapIcon } from '@/ui/icons/SwapIcon';
import { LabCharts } from '@/ui/sections/LabCharts';
import { labGuide } from '@/ui/sections/labGuide';
import type { LabGuide } from '@/models/labs/spec';
import { LabScope } from '@/ui/sections/LabScope';
import { LabGauges } from '@/ui/sections/LabGauges';
/* 🔴 **합격 구간 안내**(CEO 지시 2026-08-24 「합격을 위한 가이드라인을 최소/최대로 구분하여 제공」).
   스윕 계산은 `@/models/labs/passRange` 가, 그리기는 `LabPassRange.tsx` 가 한다 — 여기서는 배선만 한다. */
import type { ParamPassRange } from '@/models/labs/passRange';
import {
  FailDirectionList,
  ParamNudgeHints,
  PassRangeBand,
  PassRangeFooter,
  PassRangeText,
  PassRangeToggle,
  passDataAttr,
  usePassRanges,
} from '@/ui/sections/LabPassRange';
/* 🔴 **타입 전용 import 다.** 컴파일 시 지워지므로 `@/viz` 가 초기 청크로 끌려오지 않는다
   (아래 씬 로딩은 종전대로 `await import('@/viz')` 동적 적재를 유지한다). */
import type { Fallback2D } from '@/viz';

/**
 * 🔴 출처·등급 표기 제거 — CEO 지시 2026-08-23·08-24. **표시만 끈다. 원문 데이터는 보존.**
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}


/**
 * 실습 하네스 — **공정×단계 24칸이 전부 이 한 컴포넌트를 쓴다.**
 * 사슬 4개를 전부 붙인다: ①수치 출력 ②합격/불합격 판정 ③씬 실시간 반영 ④오조작 피드백.
 *
 * 🔴 씬이 없는 공정은 ③만 「준비 중」으로 정직하게 표시한다.
 *    다른 공정 씬을 억지로 갖다 붙이지 않는다(DSN `12_시각화씬_공백보고.md`).
 * 🔴 A14 — 슬라이더 전 구간에서 NaN·발산을 화면에 내보내지 않는다.
 *    범위 밖은 `OutOfLimitError` 로 **정지**시키고 그 사실을 표시한다.
 */
export function LabRunner({ spec }: { spec: LabSpec }): React.ReactElement {
  const lang = getLang();
  const [inputs, setInputs] = useState<Record<string, number>>(
    () => Object.fromEntries(spec.params.map((p) => [p.id, p.initial])),
  );

  // 🔴 계산은 순수 함수다. 예외(한계선 초과)를 화면 밖으로 던지지 않는다.
  //
  // 🔴 2026-08-22 — **정지 안내가 엉뚱한 것을 지목하고 있었다.**
  //    `metal/lab-advanced` 의 정지는 「k < 2.6 **이면서** 하중 > 24.76 kPa」인 결합 조건인데
  //    화면은 `pressureKPa = 30 kPa` 하나만 찍었다. 학습자는 압력만 되돌린다 —
  //    그리고 k 를 2.5 로 둔 채 압력을 아무리 내려도 「왜 아까는 됐는데」가 설명되지 않는다.
  //    게다가 `e.limit` 을 **들고 있었는데도 버렸다**. 「범위를 벗어났습니다」만 말하고
  //    「어디까지가 범위인가」를 말하지 않았다. PLN 명세: 「왜 벗어났는지를 말해야 한다」.
  //    그래서 이제 **조건 전부를 구조로** 받는다(`OutOfLimitError.conditions`).
  const computed = useMemo((): {
    q: Record<string, Quantity> | null;
    stop: StopInfo | null;
  } => {
    try {
      return { q: spec.compute(inputs), stop: null };
    } catch (e) {
      if (e instanceof OutOfLimitError) {
        return {
          q: null,
          stop: {
            conditions: e.conditions,
            reason: lang === 'en' ? e.reasonEn : e.reasonKo,
          },
        };
      }
      return {
        q: null,
        stop: { conditions: [], reason: e instanceof Error ? e.message : String(e) },
      };
    }
  }, [spec, inputs, lang]);

  const values = useMemo(
    () => Object.fromEntries(Object.entries(computed.q ?? {}).map(([k, v]) => [k, v.value])),
    [computed.q],
  );

  // 🔴 `values`(실값)가 아니라 `computed.q`(Quantity)를 그대로 넘긴다 — 2026-08-21 팀장 판정.
  //    실값으로 넘기면 물리층이 계산해 둔 `outOfRange` 가 판정에 닿기 전에 벗겨진다.
  //    그 구멍으로 σ_D = −0.1 mm 가 `−0.1 ≤ 1` 을 만족해 **합격**을 받았다(check-passwindow W2).
  //    Quantity 를 넘기면 **입력에 따라 변하는 정의역까지** 물리층 판단이 정본이 되고,
  //    명세에 `domain` 을 선언하지 않은 나머지 편측 출력 49개도 함께 닫힌다.
  //    🔴 순수 방어다 — 실값 경로와 판정 195,808줄을 대조해 **차이 0줄**을 확인하고 넣었다.
  const verdict = useMemo(
    () => (computed.q ? evaluate(spec, computed.q) : null),
    [spec, computed.q],
  );

  const fired = useMemo(
    () => (computed.q ? spec.feedback.filter((f) => safeWhen(f.when, inputs, values)) : []),
    [spec, computed.q, inputs, values],
  );

  /* 🔴 **스코프의 가로축을 정하는 상태.** 「학습자가 마지막으로 만진 슬라이더」다.
     CEO 지시의 핵심(「외부 조정값에 의하여 어떻게 내부에서 동작하는지」)이 이 한 값에 달려 있다 —
     이게 없으면 스코프는 그냥 「첫 번째 파라미터 고정 차트」가 되어 `charts:` 와 다를 게 없어진다.
     🔴 `onChange` 만으로는 부족하다. 슬라이더를 **잡기만 하고 아직 안 움직인** 순간에도
     학습자의 주의는 이미 그 손잡이에 가 있다. `pointerdown`·`focus` 에서도 축을 옮긴다. */
  const [activeParamId, setActiveParamId] = useState<string | null>(null);

  /* 🔴 **합격 구간 보기.** 기본 켜짐 — CEO 지시의 요지가 「학습자는 물어볼 사람이 없으니
     화면이 답해야 한다」이므로, 켜 두어야 답이 화면에 있다. 끄면 스윕 호출이 **0회**가 된다.
     실측(2026-08-24 · 24칸 전수): 한 칸 전체 재계산 최악 **5,541회 호출 / 18.9 ms**
     (`deposition/lab-advanced`). 드래그 중에는 `useDeferredValue` 가 재계산을 미룬다. */
  const [showPassRange, setShowPassRange] = useState(true);
  const passRanges = usePassRanges(spec, inputs, showPassRange);
  /** 스코프 세로축 지표. 파라미터가 바뀌어도 유지한다(같은 지표를 여러 손잡이로 보는 게 학습 동선이다). */
  const [scopeOutputId, setScopeOutputId] = useState<string | null>(null);

  const set = useCallback((id: string, v: number) => {
    setActiveParamId(id);
    setInputs((prev) => ({ ...prev, [id]: v }));
  }, []);

  const reset = useCallback(() => {
    setInputs(Object.fromEntries(spec.params.map((p) => [p.id, p.initial])));
  }, [spec]);

  /* 🔴 **이 칸이 그리는 씬 목록.** `spec.scene`·`spec.scenes` 를 여기서 각자 해석하지 않는다 —
   *    해석은 `labSceneBindings()` 한 곳에만 있다(models 소관). 23칸은 원소 1개가 나온다. */
  const scenes = useMemo(() => labSceneBindings(spec), [spec]);
  /* 씬이 정확히 1개인 칸(23칸). 🔴 `scenes[0]` 을 JSX 안에서 첨자로 읽으면
     `noUncheckedIndexedAccess` 가 `undefined` 가능성을 세운다 — 여기서 한 번만 좁힌다. */
  const soleScene = scenes.length === 1 ? scenes[0] : undefined;

  /* 🔴 **실습 칸 안내문**(PLN 납품). 명세가 직접 들고 있으면 그것을, 없으면 콘텐츠 파일에서 찾는다.
     둘 다 없으면 `undefined` — 아래에서 **DOM 자체를 만들지 않는다**(PLN A-2, 기존 칸 회귀 0). */
  const guide = useMemo(
    () => spec.guide ?? labGuide(spec.processId, spec.stage, lang),
    [spec, lang],
  );

  return (
    <div className="lab">
      {/* 🔴 슬라이더보다 **위**다 — 조작하기 전에 읽는 자리(PLN 요구사항). `.lab` 이 flex column 이라
          격자 앞에 그대로 얹으면 되고, 나머지 레이아웃은 건드리지 않는다.
          🔴 스타일은 인라인이다 — `src/ui/styles/index.css` 는 이 작업의 편집 범위 밖이다. */}
      {guide && <GuidePanel guide={guide} />}
      <div className="lab__grid">
        {/* ③ 씬 */}
        <section className="lab__viz">
          {/* 🔴 씬이 1개인 칸(23칸)은 **종전과 완전히 같은 DOM** 을 낸다 — 감싸는 요소를 새로
              끼우지 않는다. 그렇게 해야 「씬 병치를 넣었더니 나머지 23칸 레이아웃이 흔들렸다」가
              구조적으로 불가능해진다(PLN AC-1). 병치 칸만 `lab__scenes` 격자를 쓴다.

              🔴 `SceneCanvas` 를 **여러 번 쓰는 것**이 핵심이다. 그 안의 `canvasRef`·`paramsRef`·
              `fallbackRef`·`mode`·`paramsSig` 는 전부 **인스턴스마다 따로** 생긴다. 하나의
              `useRef` 를 둘이 공유하면 뒤에 적재된 폴백이 앞의 것을 덮어써서 한쪽이 얼어붙는데,
              컴포넌트를 나누면 그 사고가 **일어날 수 없다**(2026-08-21 폴백 배선 사고 재발 방지).
              `key` 를 `sceneId` 로 주어 칸을 옮겨 다녀도 두 인스턴스가 뒤섞이지 않게 한다. */}
          {scenes.length === 0
            ? <div className="lab__noScene" role="note">
                <p className="notImpl__badge">{t('lab.scene.pendingBadge')}</p>
                <p className="notImpl__body">{t('lab.scene.pending')}</p>
              </div>
            : soleScene
              ? <SceneCanvas
                  sceneId={soleScene.sceneId}
                  stage={spec.stage}
                  params={computed.q ? soleScene.map(inputs, values) : {}}
                  note={soleScene.note}
                />
              : <div className="lab__scenes">
                  {scenes.map((s) => (
                    <SceneCanvas
                      key={s.sceneId}
                      sceneId={s.sceneId}
                      stage={spec.stage}
                      params={computed.q ? s.map(inputs, values) : {}}
                      note={s.note}
                    />
                  ))}
                </div>}
        </section>

        {/* 조작 파라미터 */}
        <section className="lab__panel">
          <div className="lab__panelHead">
            <h3>{t('lab.controls')}</h3>
            {/* 🔴 토글은 초기값 버튼 **옆**이다 — 조작 패널의 손잡이는 한 줄에 모은다. */}
            <PassRangeToggle checked={showPassRange} onChange={setShowPassRange} />
            <button className="btn btn--sm" type="button" onClick={reset}>{t('lab.reset')}</button>
          </div>
          {spec.params.map((p) => (
            isDiscreteParam(p)
              ? (
                <ChoiceParam
                  key={p.id}
                  spec={spec}
                  param={p}
                  value={inputs[p.id] ?? p.initial}
                  lang={lang}
                  range={passRanges.ranges?.byParam[p.id]}
                  stale={passRanges.stale}
                  onPick={(v) => { setActiveParamId(p.id); set(p.id, v); }}
                  onFocus={() => setActiveParamId(p.id)}
                />
              )
              : (
                <label className="slider" key={p.id}>
                  <span className="slider__name">
                    {lang === 'en' ? p.en : p.ko}
                    {p.sourceId && <SourceBadge sourceId={p.sourceId} compact />}
                  </span>
                  {/* 🔴 입력을 래퍼로 감싼다 — `<input>` 에는 자식을 넣을 수 없어 띠를 트랙 위에
                      겹칠 자리가 없다. 래퍼는 `display: grid` 라 **감싸기 전과 같은 20 px 행**이
                      나온다(블록으로 감싸면 줄상자가 생겨 높이가 늘어난다). */}
                  <span className="prTrackWrap">
                    <input
                      type="range"
                      min={p.min} max={p.max} step={p.step}
                      value={inputs[p.id] ?? p.initial}
                      onChange={(e) => set(p.id, Number(e.target.value))}
                      onPointerDown={() => setActiveParamId(p.id)}
                      onFocus={() => setActiveParamId(p.id)}
                      aria-label={lang === 'en' ? p.en : p.ko}
                    />
                    <PassRangeBand
                      param={p}
                      range={passRanges.ranges?.byParam[p.id]}
                      value={inputs[p.id] ?? p.initial}
                    />
                  </span>
                  <span className="slider__value">
                    {formatQuantity(inputs[p.id] ?? p.initial)} <em>{lang === 'en' ? (p.unitEn ?? p.unit) : p.unit}</em>
                  </span>
                  <span className="slider__range">{p.min} – {p.max}</span>
                  <PassRangeText
                    param={p}
                    range={passRanges.ranges?.byParam[p.id]}
                    stale={passRanges.stale}
                    lang={lang}
                  />
                </label>
              )
          ))}
          {/* 🔴 띠가 무엇인지 · 몇 번 계산했는지 · 「하나로는 안 된다」를 여기서 한 번만 말한다. */}
          <PassRangeFooter ranges={passRanges.ranges} />

          {/* 🔴 **고정 조건 카드** — 명세가 「화면 **우측** 조건 카드에 **상시** 표시」로
              위치까지 규정한 자리다. 그래서 조작 패널(우측 열) 안, 슬라이더 **바로 아래**에 둔다.
              「상시」다 — 정지 상태에서도 사라지지 않는다(`computed` 에 걸지 않는다).
              🔴 고정 조건이 없는 칸은 이 블록 자체가 안 나온다 — 종전 DOM 그대로다. */}
          {spec.fixedConditions && spec.fixedConditions.length > 0 && (
            <div className="fixedCard">
              <h4 className="fixedCard__head">{t('lab.fixed')}</h4>
              <p className="fixedCard__lead">{t('lab.fixedLead')}</p>
              <dl className="fixedCard__list">
                {spec.fixedConditions.map((f) => {
                  const fUnit = lang === 'en' ? (f.unitEn ?? f.unit) : f.unit;
                  const fValue = lang === 'en' ? (f.valueEn ?? f.value) : f.value;
                  return (
                  <div className="fixedCard__row" key={f.id}>
                    <dt>
                      {lang === 'en' ? f.en : f.ko}
                      {f.sourceId && <SourceBadge sourceId={f.sourceId} compact />}
                    </dt>
                    <dd>
                      {fValue}{fUnit ? <em> {fUnit}</em> : null}
                    </dd>
                    {/* 🔴 S번호가 없는 값은 **왜 그 값인지**를 그 자리에서 말한다.
                        조건 카드는 학습자가 「정해진 것」으로 읽는 자리라 침묵이 곧 권위가 된다. */}
                    {/* 🔴 `f.basis` 는 「교육용 합성 — …」 형태의 근거 문장이라 함께 끈다
                        (CEO 지시 2026-08-24). 데이터는 랩 명세에 그대로 남아 있다. */}
                    {SHOW_PROVENANCE && !f.sourceId && f.basis && <p className="fixedCard__basis">{f.basis}</p>}
                    {/* 🔴 `fixedCard__note` 는 **제작자에게 하는 말**이다 — 실측 9건 전부가
                        「PLN 명세는 …로 적었다」·「원장 정본은 …」처럼 원고·원장 대조 기록이었다.
                        학습자는 열어 볼 수 없는 문서를 가리키므로 통째로 끈다(CEO 지시 2026-08-24).
                        데이터(`f.note`)는 랩 명세에 그대로 있다. */}
                    {SHOW_PROVENANCE && f.note && <p className="fixedCard__note">{say(f.note)}</p>}
                  </div>
                  );
                })}
              </dl>
            </div>
          )}
        </section>
      </div>

      {/* ② 판정 */}
      {computed.stop !== null && (
        <div className="verdict verdict--stop" role="alert">
          <strong>{t('lab.limitExceeded')}</strong>
          {/* 🔴 **어느 입력이 · 지금 얼마이고 · 한계는 얼마인가.** 셋을 다 적는다.
              결합 조건이면 여기 줄이 2개 이상 나온다 — 그게 이 목록이 있는 이유다. */}
          {computed.stop.conditions.length > 0 && (
            <ul className="verdict__causes">
              {computed.stop.conditions.map((c) => (
                <li key={c.parameter}>{conditionText(c, spec, lang)}</li>
              ))}
            </ul>
          )}
          {computed.stop.reason && <span>{computed.stop.reason}</span>}
          {/* 🔴 출력이 통째로 사라지는 것을 **말없이** 사라지게 두지 않는다.
              값을 지어내지 않는 것과, 왜 값이 없는지 말하지 않는 것은 다른 문제다. */}
          <span>{t('lab.limitOutputsWithheld')}</span>
        </div>
      )}
      {verdict && (
        <div className={`verdict ${verdict.pass ? 'verdict--pass' : 'verdict--fail'}`} role="status">
          <strong>{verdict.pass ? t('lab.pass') : t('lab.fail')}</strong>
          <span>{t('lab.judgeCount', {
            ok: verdict.outputs.filter((o) => o.pass === true).length,
            total: verdict.outputs.filter((o) => o.pass !== null).length,
          })}</span>
        </div>
      )}
      {/* 🔴 **어느 쪽으로 벗어났는가.** 「불합격 · 2개 중 0개 충족」만으로는 학습자가 자기 값이
             규격 위인지 아래인지 매번 눈으로 대조해야 한다. 그 대조를 화면이 대신한다.
             ⛔ 맞는 값은 말하지 않는다 — 방향과 규격창까지다. */}
      {verdict && !verdict.pass && computed.q && (
        <FailDirectionList spec={spec} verdict={verdict} q={computed.q} lang={lang} />
      )}
      {/* 🔴 **이 손잡이는 어느 쪽인가**(재개 지점 ② 앞 절반). `paramNudgeDirection` 은 손잡이당
             최대 2회 추가 계산이라(파라미터 4~6개 → 8~12회) `usePassRanges` 의 수천 회 스윕과
             비교가 안 되게 싸다 — `useDeferredValue` 없이 매 렌더 그대로 계산한다. */}
      {verdict && !verdict.pass && (
        <ParamNudgeHints spec={spec} inputs={inputs} verdict={verdict} lang={lang} />
      )}

      {/* ① 수치 출력 */}
      {computed.q && (
        <section className="lab__outputs">
          <h3>{t('lab.outputs')}</h3>
          {spec.outputs.map((o) => {
            const q = computed.q?.[o.id];
            const row = verdict?.outputs.find((r) => r.id === o.id);
            if (!q) return null;
            // 🔴 마크업은 `QuantityView` 하나로 낸다. 여기서 손으로 다시 짜면
            //    2026-08-21 처럼 `q.outOfRange` 를 빠뜨린 채 오래 살아남는다.
            return (
              <QuantityView
                key={o.id}
                q={q}
                outputId={o.id}
                label={lang === 'en' ? o.en : o.ko}
                valueText={judgedText(q, o)}
                specNote={o.role === 'judge' && o.pass ? specLabel(o.pass, o.digits) : undefined}
                /* 🔴 합격창 근거 — 세 표시 지점(여기 · 계측기 · 스코프 범례)이 **같은 함수**를 부른다.
                      각자 판단하면 같은 창이 자리마다 다른 근거를 말하게 된다. */
                specBasis={passBasisNode(spec, o)}
                roleNote={o.role === 'display' ? t('lab.displayOnly') : undefined}
                specFail={row?.pass === false}
              />
            );
          })}
        </section>
      )}

      {/* ⑥ 🔴 계측기 패널 — 판정 출력의 「자」. 새 숫자를 만들지 않고 `computed.q` 를 다르게 보인다. */}
      {computed.q && <LabGauges spec={spec} q={computed.q} lang={lang} />}

      {/* ⑦ 🔴 스코프 패널 — 「지금 만지는 손잡이」를 가로축으로 놓고 판정 출력을 그린다.
             `charts:` 는 명세가 정한 **고정 축**이라 학습자가 다른 슬라이더를 잡으면 그 손잡이가
             그림에서 사라진다. 스코프는 반대로 손잡이를 따라간다 — 둘 다 있어야 한다.
             🔴 정지 상태(`computed.q === null`)에서는 그리지 않는다. 마커의 y 가 없는데
             곡선만 그리면 「내가 지금 어디 있는지」를 못 보여준다 — 스코프의 뜻이 사라진다. */}
      {computed.q && (
        <LabScope
          spec={spec}
          inputs={inputs}
          activeParamId={activeParamId}
          q={computed.q}
          outputId={scopeOutputId}
          onSelectOutput={setScopeOutputId}
          lang={lang}
        />
      )}

      {/* ⑤ 🔴 차트 패널 — 씬과 **별개**다. PLN 427: 「판정은 이 차트에서 한다」
             씬에서 서브픽셀이라 안 보이는 판정(예: P1 σ_D ±0.71 mm = ±0.34 px)이 여기 산다. */}
      {computed.q && spec.charts && spec.charts.length > 0 && (
        <LabCharts charts={spec.charts} spec={spec} inputs={inputs} q={computed.q} lang={lang} />
      )}

      {/* ④ 오조작 피드백 */}
      {fired.length > 0 && (
        <section className="lab__feedback">
          {fired.map((f) => (
            <p className={`fb fb--${f.tone}`} key={f.id} role={f.tone === 'stop' ? 'alert' : 'status'}>
              {say(lang === 'en' ? f.en : f.ko)}
            </p>
          ))}
        </section>
      )}

      {/* 상충 관계 — 슬라이더 장난감 방지 */}
      {spec.tradeoffs.length > 0 && (
        <section className="lab__tradeoff">
          <h3>{t('lab.tradeoff')}</h3>
          <ul>
            {spec.tradeoffs.map((x, i) => (
              <li key={i}>
                {/* 상충 표식. 종전 `⇄` 글리프를 인라인 SVG 로 바꿨다(설계서 §6-6).
                    흐름 밖(`position: absolute`)이라 폭 기여가 0 이다. */}
                <SwapIcon className="lab__tradeoffIcon" />
                {say(lang === 'en' ? x.en : x.ko)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * 정지 상태. 🔴 **문자열 하나가 아니라 구조다.** 문자열로 접어 두면 화면이 한계 숫자를
 * 되살릴 방법이 없고, 결합 조건의 두 번째 값을 실을 자리도 없다 — 종전이 정확히 그랬다.
 */
interface StopInfo {
  conditions: readonly LimitCondition[];
  /** 왜 막혔는가. 없으면 표시하지 않는다(23칸의 단일 조건 정지가 그렇다). */
  reason?: string;
}

/* ---------------- 선택지 파라미터(≤5) ---------------- */

/**
 * 🔴 **연속으로 보이는 것이 연속이 아니면 그 자체가 화면의 거짓말이다.**
 *
 * 사고(2026-08-24 · CEO 지적 「산화에서 산화 온도를 변화 줄 수 없는데 그것이 맞는지?」):
 * 산화 온도는 `920 · 1000 · 1100` **3택**이다. Deal-Grove 계수표에 그 세 온도만 있어
 * 사이 값은 보간하면 지어내는 것이 된다(A15). **3택인 것은 옳다.**
 * 틀린 것은 그것을 **슬라이더로 그린 것**이다 — 끌어도 거의 안 움직이니
 * 「바꿀 수 없다」로 읽힌다.
 *
 * 그래서 선택지가 **5개 이하**인 파라미터는 세그먼트 버튼으로 그린다.
 * ⛔ **`min`·`max`·`step`·값은 하나도 바꾸지 않았다.** 물리 제약이다.
 *    이 컴포넌트는 `paramOptions()` 가 준 **같은 격자**를 그대로 늘어놓기만 한다.
 *
 * ## 왜 `<input type="radio">` 인가 — 버튼 N개 + 키보드 직접 구현이 아니라
 * 라디오 그룹은 **방향키 이동·Home/End·탭 진입/이탈이 브라우저 기본 동작**이다.
 * `<button>` 으로 만들면 그 전부를 손으로 다시 짜야 하고, 짜다 빠뜨리면 접근성이 조용히 죽는다.
 * 시각적 세그먼트 모양은 CSS 로만 만든다(`.choice`) — 동작은 표준 그대로 둔다.
 *
 * 🔴 `name` 은 **공정·단계·파라미터**로 짓는다. 한 화면에 두 칸이 동시에 그려져도
 *    라디오 그룹이 섞이지 않는다.
 */
function ChoiceParam({ spec, param, value, lang, range, stale, onPick, onFocus }: {
  spec: LabSpec;
  param: LabParam;
  value: number;
  lang: string;
  /** 🔴 합격 구간. 버튼 자체에 표식을 달고, 같은 사실을 아래 `PassRangeText` 가 글자로 되풀이한다. */
  range: ParamPassRange | undefined;
  stale: boolean;
  onPick(v: number): void;
  onFocus(): void;
}): React.ReactElement {
  const opts = paramOptions(param);
  const name = `${spec.processId}-${spec.stage}-${param.id}`;
  const label = lang === 'en' ? param.en : param.ko;
  return (
    <fieldset className="choice" data-param={param.id} data-options={opts.length}>
      <legend className="choice__name">
        {label}
        {param.sourceId && <SourceBadge sourceId={param.sourceId} compact />}
      </legend>
      <div className="choice__opts">
        {opts.map((v) => (
          /* 🔴 이산 파라미터에는 띠를 그리지 않는다 — 「연속으로 보이는 것이 연속이 아니면
             그 자체가 거짓말」이라는 이유로 슬라이더를 버튼으로 바꿔 놓고, 그 위에 다시
             연속 띠를 얹으면 같은 거짓말을 되살리는 것이다. **고를 수 있는 칸 자체에 표시한다.** */
          <label className="choice__opt" key={v} data-selected={v === value} data-pass={passDataAttr(range, v)}>
            <input
              type="radio"
              name={name}
              value={v}
              checked={v === value}
              onChange={() => onPick(v)}
              onFocus={onFocus}
            />
            <span className="choice__optText">{formatQuantity(v)}</span>
          </label>
        ))}
      </div>
      <span className="choice__value">
        {formatQuantity(value)} <em>{lang === 'en' ? (param.unitEn ?? param.unit) : param.unit}</em>
      </span>
      {/* 🔴 「몇 개뿐인가」를 글자로도 못박는다. 버튼을 세지 않아도 읽힌다. */}
      <span className="choice__count">{t('lab.choiceCount', { n: opts.length })}</span>
      <PassRangeText param={param} range={range} stale={stale} lang={lang} />
    </fieldset>
  );
}

/**
 * 정지 조건 한 줄 — 「**어느 입력**이 · **지금 얼마**이고 · **한계는 얼마**인가」.
 *
 * 🔴 `parameter` 는 명세의 파라미터 id 다. 화면에는 사람이 읽는 이름을 낸다 —
 *    `pressureKPa` 가 아니라 「CMP 하중압력」이다. 명세에 없는 id(물리층 내부 관문에서
 *    올라온 이름)면 지어내지 않고 그 id 를 그대로 보인다.
 */
function conditionText(c: LimitCondition, spec: LabSpec, lang: string): string {
  const p = spec.params.find((x) => x.id === c.parameter);
  const label = p ? (lang === 'en' ? p.en : p.ko) : c.parameter;
  const unit = c.unit ? ` ${c.unit}` : '';
  const [lo, hi] = c.limit;
  // 어느 쪽으로 넘었는지에 따라 **넘은 쪽 한계만** 적는다. 양쪽을 다 적으면
  // 「2.6 ~ 4.0 인데 나는 2.5 다」를 학습자가 스스로 대조해야 한다.
  // 🔴 ③ 정지 안내 — 한계값을 **서식 없이 찍고 있었다**(DEV 세션9 ⑤2 잠복결함 · PLN AC-N1).
  //    `t()` 는 `String(v)` 로 보간하므로 `±Infinity` 는 `"Infinity"` 로, 긴 소수는 17자리로
  //    그대로 새어 나갔다. 값 표기와 **같은 서식**을 거치게 한다(`—` · 지수 표기까지 공유).
  const loText = formatLimit(lo);
  const hiText = formatLimit(hi);
  const limitText = !Number.isFinite(c.given)
    ? t('lab.limitBetween', { lo: loText, hi: hiText, unit })
    : c.given < lo
      ? t('lab.limitAtLeast', { lo: loText, unit })
      : t('lab.limitAtMost', { hi: hiText, unit });
  return t('lab.limitCause', {
    name: label,
    given: `${formatLimit(c.given)}${unit}`,
    limit: limitText,
  });
}

/** 피드백 조건식이 던져도 화면을 죽이지 않는다. */
function safeWhen(
  fn: LabSpec['feedback'][number]['when'],
  i: Readonly<Record<string, number>>,
  o: Readonly<Record<string, number>>,
): boolean {
  try { return fn(i, o); } catch { return false; }
}

/**
 * 합격창 표기.
 *
 * 🔴 편측 규격(한쪽만 있는 창)을 `규격 — ~ 58` 로 내면 **값이 빠진 것처럼 읽힌다.**
 *    학습자가 「규격이 비어 있다」고 오해한다. 한쪽만 있으면 부등호 하나로 적는다.
 *    실측: 24칸 중 **18칸 · 출력 50행**이 편측이다(양쪽 다 있는 창은 종전 표기를 유지한다).
 */
function specLabel(pass: { min?: number; max?: number }, digits?: number): string {
  const { min, max } = pass;
  // 🔴 **원시 number 를 그대로 보간하지 않는다.** `t()` 는 `String(v)` 로 넣기 때문에
  //    종전에는 「규격 ≥ 0.8 / 값 0.8123」, 「규격 ≤ 1 / 값 0.842」처럼 **규격선과 값의
  //    자릿수가 다른 칸이 14곳 이상**이었다(PLN 실측). 규격선이 값보다 굵게 찍히면 학습자는
  //    자기 값이 규격을 넘었는지 눈으로 셀 수 없다. 값·규격선·정지안내가 **같은 서식**을 거쳐야
  //    R-DISP-1 이 성립한다(AC-N1).
  const lo = min !== undefined ? formatLimit(min, digits) : undefined;
  const hi = max !== undefined ? formatLimit(max, digits) : undefined;
  if (lo !== undefined && hi !== undefined) return t('lab.specRange', { lo, hi });
  if (hi !== undefined) return t('lab.specMax', { hi });
  if (lo !== undefined) return t('lab.specMin', { lo });
  // 🔴 양쪽 다 없는 판정 창은 `check-labs` 가 막는다. 여기 오면 그것 자체가 사실이므로
  //    지어내지 않고 빈 창임을 그대로 보인다.
  return t('lab.specRange', { lo: '—', hi: '—' });
}

/**
 * ① 값 표기 — **R-DISP-1 경로.** 판정에 쓰인 실값과 화면 숫자가 어긋나지 않게 한다.
 *
 * 🔴 `domain` 을 반드시 함께 넘긴다. 넘기지 않으면 「한계선 초과(`outOfRange`) 배지」가
 *    규칙 밖에 남아, 정의역 경계에서 반올림 때문에 배지와 숫자가 서로 다른 말을 한다
 *    (PLN §27-5 E-3 — 「구현 시 누락 금지」). 명세가 `domain` 을 선언하지 않은 출력은
 *    물리층이 들고 있는 `validRange` 가 정본이다.
 * 🔴 `pass` 는 `judge` 출력에만 넘긴다. `display` 출력은 판정창이 없어 모순 자체가 성립하지
 *    않으므로 **불변식 Z 만** 걸린다(E-2) — 그것은 `formatQuantity` 안에 이미 들어 있다.
 */
function judgedText(q: Quantity, o: LabSpec['outputs'][number]): string {
  return renderJudged(formatJudged(q.value, {
    digits: o.digits,
    pass: o.role === 'judge' ? o.pass : undefined,
    domain: o.domain ?? q.validRange,
    mode: o.displayMode,
  }));
}

/**
 * 구조를 화면 문자열로. 🔴 **서식과 문안을 갈라 둔 이유** — `formatJudged` 가 문자열을 바로
 * 돌려주면 사전이 안 실린 문맥(게이트의 vite SSR 적재)에서 `t()` 가 키 문자열을 내고,
 * 게이트는 그것을 「숫자가 아니니 검사 대상 아님」으로 **조용히 건너뛴다.** 그러면 결함이
 * 사라진 것인지 계측을 못 하게 된 것인지 구분할 수 없다. 그래서 서식기는 구조를 내고,
 * 문안은 화면인 여기서만 붙인다.
 */
function renderJudged(r: JudgedDisplay): string {
  switch (r.kind) {
    case 'above': return t('lab.aboveLimit', { lim: r.limitText });
    case 'below': return t('lab.belowLimit', { lim: r.limitText });
    default: return r.text;
  }
}

/* ---------------- 씬 캔버스 ---------------- */

function SceneCanvas({ sceneId, stage, params, note }: {
  sceneId: string; stage: string; params: Record<string, number>; note?: string;
}): React.ReactElement {
  const lang = getLang();
  const slicingTitle = lang === 'en' ? 'Multi-wire slicing 4D' : '다중 와이어 슬라이싱 4D';
  const slicingParts = lang === 'en'
    ? ['① Single-crystal silicon ingot', '② Parallel wire web', '③ Cutting interface', '④ Sliced wafers and transfer rail']
    : ['① 단결정 실리콘 잉곳', '② 평행 다중 와이어 웹', '③ 절단 계면', '④ 절단 웨이퍼·이송 레일'];
  const slicingStage = lang === 'en'
    ? (stage === 'lab-basic' ? 'The ingot diameter follows the basic-lab result.'
      : stage === 'lab-applied' ? 'Diameter deviation changes wafer wobble and the good-wafer fraction.'
        : 'The advanced-lab yield changes the proportion of normal and warning wafers.')
    : (stage === 'lab-basic' ? '기초 실습의 결정 직경 결과가 잉곳과 웨이퍼 크기에 반영됩니다.'
      : stage === 'lab-applied' ? '직경 편차가 웨이퍼 흔들림과 정상 웨이퍼 비율에 반영됩니다.'
        : '심화 실습의 수율이 정상·경고 웨이퍼 비율에 반영됩니다.');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [mode, setMode] = useState<'loading' | 'webgl' | 'fallback' | 'error'>('loading');

  /* 🔴🔴 2026-08-21 — **폴백 경로에서 슬라이더가 화면을 전혀 안 바꾸고 있었다(11칸 · 0.000 %).**
   *
   * 원인은 `fallback2d.ts` 의 그리기 코드가 아니라 **여기 배선**이었다:
   *   · WebGL 은 `startLoop(canvas, scene, () => paramsRef.current, …)` 로 **게터 클로저**를 넘긴다.
   *     rAF 루프가 **매 프레임 최신 값을 당겨 읽으므로** 조작이 즉시 반영된다.
   *   · 폴백에는 **루프가 없다.** 아래 적재 effect 안에서 `fb.update()` 를 **딱 한 번** 부르고,
   *     그 effect 의 의존성은 `[sceneId]` 다 → **마운트 시점 스냅샷 하나로 얼어붙었다.**
   *
   * 🔴 값이 틀린 것이 아니라 **값을 다시 안 읽은 것**이다. 그래서 같은 화면에서
   *    **숫자 출력은 정상 갱신됐다** — 그 대비가 원인을 폴백 드로어에서 배선으로 좁혀 준 결정적 증거다.
   * 🔴 `check-fallback-purity` 는 **통과(EXIT 0)** 였다. 그 게이트는 **값의 출처**만 보고
   *    화면 반영은 보지 않는다 — 정적 검사로는 원리상 못 잡는다.
   * 🔴 WebGL2 미지원 기기에서는 실습 시뮬레이터가 **통째로 죽어 있었다.**
   *    A5 의 「24칸」은 사실상 **WebGL 경로 한정** 집계였다.
   *
   * 그래서 폴백에도 **값이 바뀔 때마다 다시 그리는 경로**를 만든다.
   *
   * 🔴 2026-08-22 보강 — 「폴백은 정지 그림이라 rAF 루프를 안 돌린다」고 적혀 있었으나,
   *    **시간 항이 실재하는 씬이 생기면서 그 전제가 반만 참이 되었다.** 지금은 폴백이
   *    `fallback2d.ts` 안에서 **능동 씬에 한해** 스스로 rAF 를 돌린다
   *    (`FALLBACK_ANIMATED` · `prefers-reduced-motion` 이면 돌리지 않는다).
   *    여기 배선은 그대로다 — 아래 effect 는 여전히 **값이 바뀔 때** 다시 그리는 몫만 진다. */
  const fallbackRef = useRef<Fallback2D | null>(null);

  /* 🔴 `params` 는 부모가 `spec.scene.map(...)` 으로 **매 렌더 새 객체**를 만든다.
   *    객체 동일성으로 의존성을 걸면 관계없는 렌더마다 다시 그린다. **값**으로 서명을 만들어
   *    실제로 숫자가 바뀔 때만 다시 그린다. 키 순서에 흔들리지 않게 정렬한다. */
  const paramsSig = useMemo(
    () => Object.keys(params).sort().map((k) => `${k}:${params[k]}`).join('|'),
    [params],
  );

  useEffect(() => {
    /* 🔴 폴백일 때만 의미가 있다. WebGL 경로는 rAF 가 이미 당겨 읽는다.
       적재가 비동기라 `fallbackRef` 는 나중에 채워진다 — `mode` 를 의존성에 넣어
       폴백으로 전환된 직후에도 한 번 그리게 한다. */
    fallbackRef.current?.update(paramsRef.current);
  }, [paramsSig, mode]);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | null = null;

    void (async () => {
      const viz = await import('@/viz');
      const canvas = canvasRef.current;
      if (!canvas || disposed) return;
      if (!viz.isSceneId(sceneId)) { setMode('error'); return; }

      try {
        const scene = await viz.loadScene(sceneId);
        if (disposed) return;
        const handle = viz.startLoop(canvas, scene, () => paramsRef.current, {
          stage,
          onError: () => setMode('error'),
        });
        if (handle.ok) {
          stop = () => { handle.stop(); scene.dispose(); };
          setMode('webgl');
          return;
        }
        // WebGL2 미지원 → Canvas2D 폴백(설계서 §15 L4)
        const fb = viz.createFallback2D(canvas, sceneId as never, stage);
        if (fb) {
          fb.update(paramsRef.current);
          fallbackRef.current = fb;          // 🔴 값이 바뀔 때 다시 그릴 수 있게 붙잡아 둔다
          stop = () => { fallbackRef.current = null; fb.dispose(); };
          setMode('fallback');
        } else {
          setMode('error');
        }
      } catch { setMode('error'); }
    })();

    return () => { disposed = true; if (stop) stop(); };
  }, [sceneId, stage]);

  return (
    <figure className={`sceneBox${sceneId === 'ingotSlicing' ? ' sceneBox--slicing' : ''}`} aria-label={sceneId === 'ingotSlicing' ? slicingTitle : undefined}>
      {sceneId === 'ingotSlicing' && (
        <div className="sceneBox__titlebar">
          <strong>{slicingTitle}</strong>
          <span>{lang === 'en' ? 'Ingot → wafer' : '잉곳 → 웨이퍼'}</span>
        </div>
      )}
      <canvas ref={canvasRef} className="sceneBox__canvas" aria-label={sceneId === 'ingotSlicing' ? slicingTitle : undefined} />
      <figcaption>
        <span className={`sceneBox__mode sceneBox__mode--${mode}`}>{t(`lab.scene.${mode}`)}</span>
        {sceneId === 'ingotSlicing' && (
          <div className="sceneBox__processLegend">
            <ol>{slicingParts.map((part) => <li key={part}>{part}</li>)}</ol>
            <p>{slicingStage}</p>
          </div>
        )}
        {/* 🔴 `sceneBox__note` 는 **씬 키 매핑 명세**다 — 실측 7건 전부가
            「energy ← R_p/400 nm · dose ← …(DSN §4-4)」처럼 개발자가 개발자에게 적은 배선표였고
            코드 식별자까지 그대로 노출됐다. 학습 내용이 아니므로 통째로 끈다(CEO 지시 2026-08-24).
            데이터는 랩 명세에 그대로 있다. */}
        {SHOW_PROVENANCE && note && <span className="sceneBox__note">{say(note)}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * 🔴 **실습 칸 안내문 패널** — 슬라이더 **위**, 조작하기 전에 읽는 자리(PLN 요구사항).
 *
 *  · `intro`·`goal`·`passHint` **셋 다 펼쳐 놓는다.** 접어 두면 조작 전에 읽지 않는다.
 *  · 문구는 PLN 소유다 — **여기서 문자열을 가공하지 않는다.** 자르기·말줄임·번역·오탈자 교정 없이
 *    받은 문자열 그대로 그린다(PLN A-3).
 *  · 🔴 새 번역 키를 만들지 않는다. 라벨 문구를 붙이면 `src/locales/**`(다른 세션 소유)를 건드려야 하고,
 *    안내문 자체가 이미 완결된 문장 3개다. 그래서 **세 문장만** 세워 놓고 서열은 굵기·바탕으로 준다.
 *  · 🔴 스타일이 인라인인 이유 — `src/ui/styles/index.css` 가 이 작업의 편집 범위 밖이다.
 *    색은 전부 토큰(`--surface`·`--line`·`--accent`·`--ink`)이라 라이트/다크가 함께 따라온다.
 */
function GuidePanel({ guide }: { guide: LabGuide }): React.ReactElement {
  return (
    <section
      className="labGuide"
      role="note"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderInlineStart: '4px solid var(--accent)',
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
      }}
    >
      <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>{guide.intro}</p>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>{guide.goal}</p>
      <p
        style={{
          margin: 0,
          color: 'var(--ink)',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '8px 10px',
        }}
      >
        {guide.passHint}
      </p>
    </section>
  );
}
