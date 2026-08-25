/**
 * 🔴 **본문 산문에 인라인으로 박힌 S번호 인용을 화면에서만 지운다.**
 *
 * // CEO 지시 2026-08-24. 화면 표시만 비활성. 데이터·출처 사슬은 보존.
 * // 🔴 대외 배포·현업 검증(L2) 시점에는 되살려야 한다 (A6·D-011·D-013).
 *
 * ⛔ **원본 JSON(`src/content/**`)을 고치지 않는다.** 렌더 직전에 문자열만 변환한다.
 *    `SHOW_PROVENANCE` 를 `true` 로 되돌리면 원문이 그대로 다시 나온다.
 *
 * 배지(`SourceBadge`)는 컴포넌트를 끄면 사라지지만, 본문 문장 안의
 * 「정본 계수표(S120 Table I·II)의 …」 같은 인용은 **문자열이라 컴포넌트로 못 끈다.**
 * 그래서 여기서 규칙으로 지운다.
 *
 * 🔴 **문장이 깨지지 않게 두 갈래로 나눈다** — 그냥 토큰만 지우면 한국어가 부서진다.
 *   R1 괄호 인용   `…빠르다(S121 Table 4.4 실측 5점).` → `…빠르다.`
 *                  괄호 안이 **인용뿐**일 때만 괄호째 지운다.
 *   R2 괄호 혼재   `(융점 약 1685 K · S101)` → `(융점 약 1685 K)`
 *                  괄호 안에 실제 정보가 있으면 S번호 조각만 뽑아낸다.
 *   R3 문장 성분   `S166 이 70 ℃ 에서 잰 값…` → `문헌이 70 ℃ 에서 잰 값…`
 *                  주어·관형어로 쓰인 S번호는 지우면 조사만 남아 문장이 부서진다.
 *                  **「문헌」으로 갈아끼우고 조사를 받침에 맞춘다**(가→이, 는→은, 를→을, 와→과).
 *   R4 잔여        위 셋에 안 걸린 S번호는 토큰만 지우고 공백을 정리한다.
 *
 * 🔴 R3 는 **문장을 바꾸는 규칙**이다. 바꾼 문장 목록은 DEV 스레드에 남겼다 —
 *    문면 검수는 PLN 소관이지 이 함수의 소관이 아니다.
 */

/** 출처 코드 토큰. 서지 원장의 S번호는 2~3자리다(S53 ~ S269). */
const S_TOKEN = /S\d{2,3}/;

/** 인용 locator 로만 이루어진 괄호인지 — Table·Fig.·§·장절 번호·구분자·공백만 남는가. */
const LOCATOR_UNIT = '(?:S\\d{2,3}|Tables?|Tbl\\.?|Figs?\\.?|Figure|Eqs?\\.?|§+|pp?\\.?|Nn?os?\\.?|Ch\\.?|Sec\\.?|App\\.?|[0-9IVXivx]+(?:[.\\-][0-9A-Za-z]+)*|[A-Z]\\.[0-9]+|\u300c[^\u300d]*\u300d|\uc2e4\uce21|\uc804\ubb38|\uae30\uc900|[0-9]+\uc810|[0-9]+\uac74)';
const LOCATOR_ONLY = new RegExp(`^[\\s\u00b7,;\uc758]*(?:${LOCATOR_UNIT}[\\s\u00b7,;\uc758]*)+$`);

/** 받침 있는 말 뒤에 오는 조사로 정규화한다. 「문헌」은 받침(ㄴ)이 있다. */
const PARTICLE_AFTER_CONSONANT: Record<string, string> = {
  '가': '이', '이': '이',
  '는': '은', '은': '은',
  '를': '을', '을': '을',
  '와': '과', '과': '과',
  '의': '의', '도': '도', '만': '만', '에': '에', '에서': '에서',
  '으로': '으로', '로': '으로',
};

/** 괄호 안이 인용 조각뿐인지 판정한다. */
function isCitationOnly(inner: string): boolean {
  if (!S_TOKEN.test(inner)) return false;
  const stripped = inner.replace(/S\d{2,3}/g, ' ');
  return LOCATOR_ONLY.test(stripped) || stripped.trim() === '';
}

/** 공백·구두점 뒷정리. 지운 자리가 어색하게 벌어지지 않게 한다. */
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)/g, '')            // 빈 괄호
    .replace(/[ \t]{2,}/g, ' ')         // 겹공백
    .replace(/\s+([.,;)])/g, '$1')      // 구두점 앞 공백
    .replace(/\(\s+/g, '(')             // 여는 괄호 뒤 공백
    .replace(/\s+·/g, ' ·')
    .replace(/·\s*\)/g, ')')            // 괄호 닫기 직전 매달린 구분자
    .replace(/\(\s*·\s*/g, '(')
    .trimEnd();
}

/**
 * 화면에 낼 산문에서 S번호 인용을 지운다.
 * `SHOW_PROVENANCE` 판정은 **호출부**가 한다 — 이 함수는 규칙만 안다(테스트 가능하게).
 */
/**
 * 🔴 등급·근거를 가리키는 **낱말** 자체도 지운다 — CEO 지시 2026-08-24.
 *    S번호와 달리 이쪽은 문장 한가운데 명사로 박혀 있어, 그냥 지우면 문장이 부서진다.
 *    **뜻이 통하는 중립어로 갈아끼우거나, 괄호 삽입구면 통째로 뺀다.**
 *    바꾼 문장은 DEV 스레드에 원문과 함께 남겼다 — 문면 검수는 PLN 소관이다.
 */
const PHRASE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // ① 괄호 삽입구 — 통째로 뺀다. 「…라고 하자(둘 다 교육용 설정값).」
  [/\s*\((?:둘 다|모두|셋 다|전부)?\s*교육용 설정값\)/g, ''],
  [/\s*\((?:둘 다|모두|셋 다|전부)?\s*교육용 합성(?:값)?\)/g, ''],
  // ①-b 사내 참조 삽입구 — 「(원장 §4-1)」·「(PLN §④3)」·「(DSN §4-4)」·「(A6L-03)」·「(§4.1.1)」.
  //      학습자가 열어 볼 수 없는 문서를 가리키는 말이라 화면에 있을 이유가 없다.
  [/\s*\((?:원장|서지|정본표|PLN|DSN|DEV|A6L?)[^)]{0,60}\)/g, ''],
  [/\s*\((?:출처|근거)[^)]{0,50}\)/g, ''],
  // 괄호 **끝**에 출처를 단 것도 같다 — 「(2광속 결상 한계 2개 독립 출처)」
  [/\s*\([^)]{0,50}(?:출처|근거|문헌)\)/g, ''],
  [/\s*\(§[^)]{0,30}\)/g, ''],
  [/\s*\((?:M-\d+|A6L-\d+|A1[0-9][^)]{0,20})\)/g, ''],
  // ①-c 꼬리에 붙은 출처 설명절 — 「열저항 θ — 출처 배지가 v 에 따라 … 로 바뀐다」
  [/\s*[—–-]\s*출처[^.\n]*/g, ''],
  // ② 규칙 머리의 등급 태그 — 「[운영규약 · A15-op] …」
  [/\[운영규약(?:\s*·[^\]]*)?\]\s*/g, ''],
  [/\[경향모델(?:\s*·[^\]]*)?\]\s*/g, ''],
  [/\[문헌식(?:\s*·[^\]]*)?\]\s*/g, ''],
  // ③ 문장 속 명사 — 중립어로 갈아끼운다(뜻은 지키고 등급 주장만 뺀다).
  [/교육용 설정값/g, '설정값'],
  [/교육용 합성값/g, '설정값'],
  [/교육용 합성/g, '설정'],
  [/문헌식/g, '문헌의 식'],
  [/경향모델/g, '학습용 모델'],
  [/\bS번호\b/g, '출처 표기'],
];

/**
 * 🔴 **문장 통째로 빼야 하는 것** — 「이 값의 근거가 원장에 없다」류 면책 고지.
 *
 * 낱말만 지우면 「…의 가 없어 …하지 않습니다」처럼 부서지므로 **문장 단위로 뺀다.**
 * 판정 기준(CEO 2026-08-24): **제작자·검수자에게 하는 말이면 뺀다.**
 *   · 출처·근거·실측값이 「없다/미확보」라는 고지
 *   · 사내 문서(원장·명세)를 가리키는 문장
 *   · 코드 식별자(`windTunnel.flowQual` 등)를 노출하는 문장
 * 🟢 **공정 설명·조작 안내·현재 값·합격 여부는 이 규칙에 걸리지 않는다** — 위 낱말이 없기 때문이다.
 */
const DROP_SENTENCE: readonly RegExp[] = [
  /(?:출처|근거|정량치|정량 근거|실측값|공개 실측값)[^.]{0,40}(?:없|미확보|못 |미상)/,
  /(?:원장|서지 원장|정본표)[^.]{0,40}(?:없|있|정본|기준|따른)/,
  /물리층[^.]{0,60}(?:출처|근거|원장)/,
  // 코드 식별자를 학습자 화면에 노출하는 문장 — 「이 네 항목은 물리층 windTunnel.flowQual …」
  /물리층\s+[A-Za-z_$][\w$]*\.[A-Za-z_$]/,
];

/** 문장 단위로 잘라 면책 고지만 뺀다. 종결부호(`.`·`다.`·`니다.`)를 살려 이어 붙인다. */
function dropDisclosureSentences(text: string): string {
  if (!DROP_SENTENCE.some((re) => re.test(text))) return text;
  const parts = text.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => !DROP_SENTENCE.some((re) => re.test(s)));
  return kept.length > 0 ? kept.join(' ') : text;
}

export function redactProvenance(text: string): string {
  let out = dropDisclosureSentences(text);
  for (const [re, to] of PHRASE_RULES) out = out.replace(re, to);
  if (!S_TOKEN.test(out)) return out === text ? text : tidy(out);

  // R1·R2 — 괄호 안을 먼저 처리한다(중첩 없는 단순 괄호만 있다).
  out = out.replace(/(\s*)\(([^()]*)\)/g, (whole, lead: string, inner: string) => {
    if (!S_TOKEN.test(inner)) return whole;
    if (isCitationOnly(inner)) return '';                       // R1 괄호째 삭제
    const kept = inner                                          // R2 조각만 제거
      .replace(/\s*[·,]?\s*S\d{2,3}\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s·,]+|[\s·,]+$/g, '');
    return kept ? `${lead}(${kept})` : '';
  });

  // R3 — 문장 성분으로 쓰인 S번호는 「문헌」으로 갈아끼우고 조사를 맞춘다.
  out = out.replace(
    /S\d{2,3}(?:\s*[·,]\s*S\d{2,3})*\s*(으로|에서|의|가|이|는|은|를|을|와|과|도|만|에)(?=\s|$)/g,
    (_m, particle: string) => `문헌${PARTICLE_AFTER_CONSONANT[particle] ?? particle}`,
  );
  // R3-b — 조사 없이 locator 를 끌고 다니는 인용(`S101 Table 4 …`)도 「문헌」으로 갈아끼운다.
  //         토큰만 지우면 주어가 사라져 「무결함 창은 Table 4 … 기준」처럼 뜬금없어진다.
  out = out.replace(/S\d{2,3}(?=\s+(?:Tables?|Tbl\.?|Figs?\.?|Figure|Eqs?\.?|§|Sec\.?|Ch\.?)\b)/g, '문헌');

  // R4 — 남은 토큰은 지운다.
  out = out.replace(/\s*[·,]?\s*S\d{2,3}/g, '');

  return tidy(out);
}
