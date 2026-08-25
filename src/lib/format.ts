/**
 * 화면 수치 서식 — **정본**. 다른 곳에 서식 규칙을 다시 쓰지 마라.
 *
 * 🔴 2026-08-21 이전에는 서식기가 **2벌**이었다.
 *    `ui/widgets/SourceBadge.tsx#formatQuantity`(수치 배지)와
 *    `viz/chart/common.ts#formatTick`(축 눈금)이 각자 규칙을 들고 있었고,
 *    대표 값 격자 7,559점에서 **55.8 %** 가 서로 다른 문자열로 찍혔다.
 *    그중에는 눈에 띄지도 않는 결함이 섞여 있었다 —
 *    `formatTick(Infinity)` 이 `"NaNeInfinity"` 를 뱉었다(배지는 `—`).
 *
 * 🔴 그렇다고 **한 함수로 합치지 않는다.** 표시 맥락이 다르다.
 *    · 축 눈금은 **짧아야** 한다(가로로 겹치면 축이 무너진다) → 가수 1자리
 *    · 수치 배지는 **유효숫자가 중요**하다(24칸의 실습 결과값이다) → 가수 3자리
 *    합치면 24칸 숫자 표기가 흔들린다.
 *
 * 그래서 구조는 **정본 1 + 얇은 프리셋 2** 다.
 *    · `formatNumber(v, opts)` — 규칙의 정본. 분기는 여기에만 있다.
 *    · `formatQuantity` / `formatTick` — `opts` 만 다른 프리셋.
 *    공통 규칙(비유한값 표기 · 0 표기 · 지수 전환 임계 · 지수 표기 모양)은
 *    아래 상수/공유 분기 **한 곳**에만 있다. 프리셋이 건드리는 것은 자릿수뿐이다.
 */

/**
 * 🔴 유한하지 않은 값(NaN·±Infinity)의 표기 — **배지와 눈금이 공유한다.**
 *    갈라놓으면 같은 계산 실패가 화면 위치에 따라 다르게 보인다.
 */
export const NON_FINITE_LABEL = '—';

/** 0 의 표기. `-0` 도 여기로 들어와 `'0'` 이 된다(`String(-0)` 은 `'0'`). */
export const ZERO_LABEL = '0';

/**
 * 🔴 **불변식 Z (전역)** — 「반올림 결과가 0 인데 실값이 0 이 아니면 그 표기를 내보내지 않는다.
 *    `-0`·`-0.0`·`-0.00` 문자열은 **어떤 경로로도** 화면에 나오지 않는다.」 (PLN §27-4)
 *
 * 왜 필요했나 — 아래 `formatNumber` 는 `fixed` 분기가 `v === 0` 분기보다 **앞**에 있어서
 * `digits` 를 가진 모든 출력이 `toFixed` 로 직행한다. 그런데 `(-0.04).toFixed(1) === '-0.0'` 이고
 * `Number('-0.0') === -0` 이며 `-0 >= 0` 은 **참**이다. 즉 `pass: { min: 0 }` 인 여유 지표
 * 6칸에서 **음의 여유(불합격)가 화면에서 0(합격)으로 읽혔다.** 음의 영을 막는 처리는
 * 2026-08-22 이전 이 파일 전문에 **0건**이었다.
 *
 * 여기서 하는 일은 **문자열 층의 마지막 방어**다 — 부호만 떼어 `-0.0` 이 새어 나가지 않게 한다.
 * 「부호를 잃었으니 자릿수를 올린다」는 판단은 서식이 아니라 **판정 문맥**이 필요하므로
 * 아래 `formatJudged` 가 맡는다. 두 층은 역할이 다르다 —
 *   · 여기       : 어떤 호출부든 `-0.0` 문자열을 못 만든다(예외 없음)
 *   · formatJudged: 애초에 0 으로 반올림되지 않도록 표기 자체를 바꾼다
 */
function normalizeZero(s: string): string {
  return s.charCodeAt(0) === 45 /* '-' */ && Number(s) === 0 ? s.slice(1) : s;
}

/**
 * 🔴 지수 표기로 넘어가는 임계 — **공유 상수.** 배지와 눈금이 서로 다른 임계를 쓰면
 *    같은 값이 한쪽은 `12345.6`, 다른 쪽은 `1.2e4` 로 찍힌다.
 */
export const EXP_THRESHOLD_HI = 1e5;
export const EXP_THRESHOLD_LO = 1e-3;

/** 가수를 「정수로 볼」 허용 오차. `2.0000000001e8` 을 `2e8` 로 적기 위한 값. */
const MANTISSA_INT_EPS = 1e-9;

/** 지수 표기 밖(일반 구간)의 반올림 방식. */
export type PlainRounding =
  /** 소수 `digits` 자리에서 반올림. 값의 절대 크기를 그대로 읽히게 한다. */
  | { readonly mode: 'decimals'; readonly digits: number }
  /** 유효숫자 `digits` 자리. 자릿수를 일정하게 눌러 라벨 길이를 잡는다. */
  | { readonly mode: 'significant'; readonly digits: number };

export interface NumberFormatOptions {
  /**
   * 고정 소수점 자릿수. 지정하면 지수 전환·반올림 규칙보다 **우선**한다.
   * (콘텐츠가 `digits` 를 준 출력은 이미 표기 자릿수를 정해 온 것이다.)
   * 🔴 단, 비유한값 처리보다는 뒤다 — `NaN.toFixed(2)` 는 `'NaN'` 이라 화면에 새어 나간다.
   */
  readonly fixed?: number;
  /** 지수 표기 가수의 소수 자릿수. */
  readonly expMantissaDigits: number;
  /** 가수가 정수에 가까우면 소수부를 뗀다(`1.0e8` → `1e8`). 눈금처럼 짧아야 하는 자리용. */
  readonly trimExpMantissa: boolean;
  /** 일반 구간 반올림. */
  readonly plain: PlainRounding;
}

/**
 * 값을 가수·지수로 가른다.
 *
 * 🔴 `Math.log10` 의 부동소수 오차와 가수 반올림 때문에 |가수| 가 10 이상이 되는 일이 있다.
 *    (옛 `formatTick` 은 `9.99e7` 을 `10.0e7` 로 적었다 — 지수 표기가 아니다.)
 *    그래서 반올림한 뒤 한 번 더 확인해 지수를 보정한다.
 */
function decompose(v: number, digits: number): { mant: number; exp: number } {
  let exp = Math.floor(Math.log10(Math.abs(v)));
  let mant = v / Math.pow(10, exp);
  if (Math.abs(Number(mant.toFixed(digits))) >= 10) {
    exp += 1;
    mant = v / Math.pow(10, exp);
  } else if (Math.abs(mant) < 1) {
    exp -= 1;
    mant = v / Math.pow(10, exp);
  }
  return { mant, exp };
}

/**
 * 🔴 지수 표기의 **모양은 여기 한 곳**에서만 정한다 — `<가수>e<지수>`.
 *    `Number.prototype.toExponential` 은 양의 지수에 `+` 를 붙여(`1.200e+8`)
 *    눈금 표기(`1.2e8`)와 어긋났다. 그래서 직접 조립한다. 프리셋이 정하는 것은 **자릿수뿐**이다.
 */
function formatExponential(v: number, digits: number, trim: boolean): string {
  const { mant, exp } = decompose(v, digits);
  const isInt = Math.abs(mant - Math.round(mant)) < MANTISSA_INT_EPS;
  const m = trim && isInt ? String(Math.round(mant)) : mant.toFixed(digits);
  return `${m}e${exp}`;
}

/** 지수 표기 밖의 값. 정수는 어느 방식에서도 그대로 적는다(`12345` 를 `12340` 으로 만들지 않는다). */
function formatPlain(v: number, plain: PlainRounding): string {
  if (Number.isInteger(v)) return String(v);
  if (plain.mode === 'decimals') {
    const f = Math.pow(10, plain.digits);
    return String(Math.round(v * f) / f);
  }
  return String(Number(v.toPrecision(plain.digits)));
}

/**
 * 화면 수치 서식의 **정본**. 분기는 전부 여기 있고, 프리셋은 `opts` 만 바꾼다.
 */
export function formatNumber(v: number, opts: NumberFormatOptions): string {
  // 🔴 비유한값이 가장 먼저다. `fixed` 가 있어도 `NaN.toFixed(2) === 'NaN'` 이 새어 나간다.
  if (!Number.isFinite(v)) return NON_FINITE_LABEL;
  // 🔴 불변식 Z — 나가는 문자열은 **전부** `normalizeZero` 를 거친다. 분기마다 따로 감싸면
  //    나중에 분기가 하나 늘 때 조용히 빠진다. 그래서 반환구를 하나로 좁혀 둔다.
  if (opts.fixed !== undefined) return normalizeZero(v.toFixed(opts.fixed));
  if (v === 0) return ZERO_LABEL;
  const a = Math.abs(v);
  if (a >= EXP_THRESHOLD_HI || a < EXP_THRESHOLD_LO) {
    return normalizeZero(formatExponential(v, opts.expMantissaDigits, opts.trimExpMantissa));
  }
  return normalizeZero(formatPlain(v, opts.plain));
}

/**
 * 수치 배지·실습 출력 프리셋.
 * 유효숫자를 지키는 쪽 — 가수 3자리, 일반 구간은 소수 3자리 반올림.
 */
export const QUANTITY_FORMAT: NumberFormatOptions = {
  expMantissaDigits: 3,
  trimExpMantissa: false,
  plain: { mode: 'decimals', digits: 3 },
};

/**
 * 축 눈금 프리셋.
 * 짧은 쪽 — 가수 1자리(정수면 소수부 제거), 일반 구간은 유효숫자 4자리.
 */
export const TICK_FORMAT: NumberFormatOptions = {
  expMantissaDigits: 1,
  trimExpMantissa: true,
  plain: { mode: 'significant', digits: 4 },
};

/**
 * 화면 표시용 수치 서식(수치 배지·실습 출력).
 * `digits` 를 주면 그 자릿수로 고정한다.
 */
export function formatQuantity(v: number, digits?: number): string {
  if (digits === undefined) return formatNumber(v, QUANTITY_FORMAT);
  return formatNumber(v, { ...QUANTITY_FORMAT, fixed: digits });
}

/** 축 눈금 라벨 서식. */
export function formatTick(v: number): string {
  return formatNumber(v, TICK_FORMAT);
}

/* ═══════════════════════ R-DISP-1 — 표시·판정 일치 ═══════════════════════
 *
 * 🔴 **규칙(PLN §27-1 판정 2026-08-22).**
 *   「판정에 쓰인 실값과 화면에 찍히는 숫자·규격선·한계안내는 **같은 서식 함수 한 번**을 거치며,
 *    그 함수는 『반올림한 표시값을 표시된 규격선과 비교한 결과』가 『실값 판정』과 어긋나거나
 *    표시값이 부호를 잃으면, 자릿수를 **한 단계(+1)만** 올리고, 그래도 어긋나면
 *    부등호 표기(`＞ 35.0`·`＜ 0.0`)로 낸다.」
 *
 * 🔴 **판정은 한 글자도 바뀌지 않는다.** 합격/불합격은 종전대로 `spec.ts#evaluate` 가
 *    **실값**으로 내린다. 여기서 바뀌는 것은 **학습자가 읽는 문자열**뿐이다.
 *    (「판정을 표시값 기준으로 바꾼다」는 오케스트레이터가 사전 배제했다 —
 *     그러면 「35.04 는 35 이하」를 가르치게 된다.)
 *
 * 🔴 **자릿수 기본값은 한 칸도 바꾸지 않았다.** judge 출력 76건 전수 대조에서 합격창 한계값이
 *    전부 자기 `digits` 자리에 정확히 표현된다(PLN §27-3). 문제는 자릿수 부족이 아니라
 *    **경계 처리 규칙의 부재**였다. 그래서 상향은 경계 근방에서만, 그것도 **+1 까지만** 한다.
 *
 * 🔴 **왜 문자열이 아니라 구조를 돌려주는가.** 부등호 문안은 i18n 사전에서 오는데,
 *    사전이 안 실린 문맥(게이트 `check-numeric` 의 vite SSR 적재)에서 `t()` 는 **키 문자열**을
 *    돌려준다. 문자열만 돌려주면 게이트가 `Number('lab.aboveLimit') = NaN` 을 보고
 *    「검사 대상 아님」으로 **조용히 건너뛴다** — 규칙을 넣어서 결함이 사라진 것인지
 *    측정을 못 하게 되어 사라진 것인지 구분할 수 없게 된다. 구조로 돌려주면 게이트가
 *    `kind` 를 보고 **해소 경로별로 세어** 보고할 수 있다.
 */

/** 합격창. `spec.ts#LabOutput['pass']` 와 같은 모양이되 이 층은 모델을 import 하지 않는다. */
export interface PassWindow {
  readonly min?: number;
  readonly max?: number;
}

/**
 * 표시 판정 모드.
 *  · `continuous` — 연속 물리량. 경계에서 자릿수 +1 상향을 허용한다.
 *  · `counted`    — 셈값·굵은 공칭값(ppm·개수밀도·설계 피치·플래그). 🔴 **자릿수 상향 금지** —
 *                   유효숫자가 없는 자리라 올리면 **정밀도를 과장한다.** 곧바로 부등호로 간다.
 */
export type DisplayMode = 'continuous' | 'counted';

/** `formatJudged` 의 결과. 🔴 문자열이 아니라 **구조**다(위 주석 참조). */
export type JudgedDisplay =
  /** 비유한값 — 종전대로 `—`. */
  | { readonly kind: 'nonFinite'; readonly text: string }
  /** 숫자 그대로. `escalated` 면 자릿수를 +1 올려 모순을 푼 것이다. */
  | { readonly kind: 'value'; readonly text: string; readonly digits: number; readonly escalated: boolean }
  /** 한계선 **위**. 어떤 자릿수로도 모순이 안 풀려 부등호로 냈다. */
  | { readonly kind: 'above'; readonly limit: number; readonly limitText: string }
  /** 한계선 **아래**. */
  | { readonly kind: 'below'; readonly limit: number; readonly limitText: string };

export interface JudgedFormatOptions {
  /** 표시 자릿수. judge 출력 76건은 전부 갖고 있다. 없으면 기본 서식으로 떨어진다. */
  readonly digits?: number;
  /** 합격창. `judge` 출력만 준다. `display` 출력은 주지 않는다(판정창이 없어 모순이 성립하지 않는다). */
  readonly pass?: PassWindow;
  /**
   * 🔴 **정의역** — `outOfRange` 배지가 갈리는 축이다(PLN §27-5 E-3).
   *    합격창과 **다른 것**이고, 이것을 빼면 「한계선 초과 배지」가 규칙 밖에 남는다.
   *    호출부는 명세의 `o.domain` 이 없으면 물리층 `q.validRange` 를 넣는다.
   */
  readonly domain?: readonly [number, number];
  /** 기본 `continuous`. */
  readonly mode?: DisplayMode;
}

/**
 * 합격창 비교. 🔴 `spec.ts#evaluate` 의 창 비교와 **같은 부등호**여야 한다
 * (`>= min` · `<= max`). 다르면 이 규칙이 「판정과 표시를 맞춘다」면서 자기 판정을 쓰게 된다.
 */
export function inPassWindow(pass: PassWindow | undefined, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (pass?.min !== undefined && v < pass.min) return false;
  if (pass?.max !== undefined && v > pass.max) return false;
  return true;
}

/** 정의역 안인가. 선언이 없으면 볼 것이 없다 — 종전대로 창만 본다. */
export function inDomain(domain: readonly [number, number] | undefined, v: number): boolean {
  if (!domain) return Number.isFinite(v);
  return Number.isFinite(v) && v >= domain[0] && v <= domain[1];
}

/** 「이 수는 화면이 합격으로 보여야 하는가」. 정의역 밖은 어떤 창도 통과하지 못한다. */
function displayVerdict(v: number, pass: PassWindow | undefined, domain: readonly [number, number] | undefined): boolean {
  return inDomain(domain, v) && inPassWindow(pass, v);
}

/**
 * 실값이 **실제로 넘어선** 경계를 찾는다. 부등호 표기의 한계선은 여기서 나온다.
 *
 * 🔴 순서가 중요하다 — 합격창을 먼저 본다. 정의역과 합격창을 둘 다 넘었으면 학습자에게
 *    더 가까운 이야기는 합격창 쪽이다(정의역 이탈은 `outOfRange` 배지가 따로 말한다).
 * 🔴 넘어선 경계가 **하나도 없는데** 여기 왔다면 그것은 「판정은 맞는데 부호를 잃은」 경우다.
 *    잃은 정보가 정확히 「0 의 어느 쪽인가」이므로 **0 을 한계선으로** 그 사실만 말한다.
 */
function crossedBound(
  v: number,
  pass: PassWindow | undefined,
  domain: readonly [number, number] | undefined,
): { dir: 'above' | 'below'; limit: number } {
  if (pass?.max !== undefined && v > pass.max) return { dir: 'above', limit: pass.max };
  if (pass?.min !== undefined && v < pass.min) return { dir: 'below', limit: pass.min };
  if (domain && v > domain[1]) return { dir: 'above', limit: domain[1] };
  if (domain && v < domain[0]) return { dir: 'below', limit: domain[0] };
  return v < 0 ? { dir: 'below', limit: 0 } : { dir: 'above', limit: 0 };
}

/**
 * 🔴 **규격선·한계안내의 서식.** 값 표기와 **같은 함수**를 거친다(AC-N1).
 *
 * 왜 따로 이름이 있나 — 종전에는 `i18n.t()` 가 `String(v)` 로 원시 number 를 그대로 보간했고,
 * 그래서 「규격 ≥ 0.8 / 값 0.8123」처럼 **규격선과 값의 자릿수가 다른 칸이 14곳 이상**이었다.
 * 규격선이 값보다 굵게 찍히면 학습자는 자기 값이 규격을 넘었는지 **눈으로 셀 수 없다.**
 */
export function formatLimit(v: number, digits?: number): string {
  return formatQuantity(v, digits);
}

/**
 * R-DISP-1 본체. **판정을 바꾸지 않고, 틀린 숫자를 화면에 못 내보낸다.**
 *
 * 순서:
 *  0) 비유한값은 종전대로 `—`
 *  1) `digits` 로 서식 → 되읽어 판정 → **실값 판정과 같고 부호도 안 잃었으면 그대로**
 *  2) `continuous` 면 `digits + 1` 로 한 번만 더 시도
 *  3) 그래도 안 되면 **부등호 표기** — 한계선은 그 출력의 `digits` 로 서식한다
 *
 * 🔴 **불변식 Z 는 부호를 가리지 않는다** — 「반올림 결과가 0 인데 실값이 0 이 아니면 그 표기를
 *    내보내지 않는다」이지 「음수일 때만」이 아니다(PLN §27-4 의사코드 `lostSign = n===0 && v!==0`).
 *    한때 `v < 0` 으로 좁혀 볼까 했으나, 그것은 PLN 규칙을 구현이 임의로 깎는 것이다.
 *    실측으로 그 폭이 감당 가능한지부터 봤다 — **24칸 초기값 전 출력에서 표기 변화 0건**
 *    (`tests/unit/format-judged.test.ts` AC-N8). 그래서 규칙 그대로 간다.
 *    대부분의 경우 자릿수 +1 로 풀리고(`0.004` → `"0.004"`), 부등호까지 가는 것은
 *    `digits + 1` 자리에서도 0 으로 반올림되는 **정말로 작은 값**뿐이다.
 */
export function formatJudged(v: number, opts: JudgedFormatOptions = {}): JudgedDisplay {
  if (!Number.isFinite(v)) return { kind: 'nonFinite', text: NON_FINITE_LABEL };

  const { digits, pass, domain, mode = 'continuous' } = opts;
  const verdictReal = displayVerdict(v, pass, domain);

  const attempt = (d: number | undefined): { text: string; ok: boolean } => {
    const text = formatQuantity(v, d);
    const back = Number(text);
    if (!Number.isFinite(back)) return { text, ok: true }; // 지수·특수 표기 — 되읽을 수 없으면 판단하지 않는다
    const lostSign = back === 0 && v !== 0;
    return { text, ok: displayVerdict(back, pass, domain) === verdictReal && !lostSign };
  };

  const first = attempt(digits);
  if (first.ok) return { kind: 'value', text: first.text, digits: digits ?? Number.NaN, escalated: false };

  // 🔴 `counted` 는 여기를 건너뛴다 — 셈값에 없는 자릿수를 만들어 내면 정밀도를 과장한다.
  if (mode === 'continuous' && digits !== undefined) {
    const second = attempt(digits + 1);
    if (second.ok) return { kind: 'value', text: second.text, digits: digits + 1, escalated: true };
  }

  const { dir, limit } = crossedBound(v, pass, domain);
  return { kind: dir, limit, limitText: formatLimit(limit, digits) };
}
