/* coverage-core.mjs — 「절이 비었는가」 판정 엔진.
 *
 * 🔴 왜 이 파일이 따로 있는가:
 *    게이트 본체(`check-coverage.mjs`)는 **적재**를 하고 여기는 **판정**만 한다.
 *    판정이 본체 안에 있으면 형제 픽스처가 가짜 입력을 먹일 수 없다 —
 *    그러면 「탐지되는가」를 증명할 방법이 없고, 증명 없는 게이트를 또 하나 만드는 꼴이다.
 *    (`lib/numeric-core.mjs` 와 같은 이유·같은 설계.)
 *
 * 🔴 이 모듈은 `vite` 도 `src/**` 도 import 하지 않는다. 주입받은 데이터만 본다.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * §1. 기준값 — 여기가 정본이다. 게이트 본체·픽스처·보고서가 전부 여기를 읽는다.
 * ══════════════════════════════════════════════════════════════════════════ */

export const THRESHOLDS = {
  /** theory·overview — 산문 절. 「한 문단짜리 개요」를 채워짐으로 세지 않기 위한 하한. */
  PROSE_MIN_BLOCKS: 3,
  PROSE_MIN_CHARS: 300,
  /** equipment·principle — 도해가 절반을 지므로 산문 하한이 낮다. */
  EQUIP_PROSE_MIN_BLOCKS: 2,
  EQUIP_PROSE_MIN_CHARS: 150,
  /** 장비 도해 — 라벨이 0개면 그림만 있고 학습 정보가 없다. */
  EQUIP_MIN_LABELS: 1,
  /** 랩 — 조작할 것과 판정할 것이 없으면 실습이 아니다. */
  LAB_MIN_PARAMS: 1,
  LAB_MIN_JUDGE_OUTPUTS: 1,
  LAB_MIN_FEEDBACK: 1,
  LAB_MIN_TRADEOFFS: 1,
  /** 🔴 A2 — README §1 「테스트는 공정별 10문항」. 이 수의 정본은 명세이지 이 파일이 아니다. */
  TEST_REQUIRED_ITEMS: 10,
};

/** 카탈로그 `sectionOrder` 와 같은 순서. 게이트는 카탈로그를 읽어 이 목록을 대조한다. */
export const SECTION_IDS = [
  'theory', 'overview', 'equipment', 'principle',
  'lab-basic', 'lab-applied', 'lab-advanced',
  'test', 'result',
];

export const LANGS = ['ko', 'en'];

/** 판정 3상태. 🟡 는 「모른다」가 아니라 「있으나 기준 미달」이다. */
export const V = { FULL: 'FULL', SHORT: 'SHORT', EMPTY: 'EMPTY' };
export const MARK = { FULL: '🟢', SHORT: '🟡', EMPTY: '🔴' };

/* ══════════════════════════════════════════════════════════════════════════
 * §2. 자리표시자 판정
 *
 * 🔴 이 게이트가 태어난 이유가 여기 있다 — 「파일이 있다」는 「내용이 있다」가 아니다.
 *    빈 배열·빈 문자열·TODO·「준비 중」은 전부 **비어 있음**이다.
 * ══════════════════════════════════════════════════════════════════════════ */

/** 통째로 자리표시자인 문자열. 앞뒤 공백·마침표·괄호를 벗겨 비교한다. */
const PLACEHOLDER_WHOLE = [
  'todo', 'tbd', 'wip', 'fixme', 'xxx', 'placeholder', 'n/a', 'na', 'none',
  'lorem ipsum', 'lorem', 'dummy', 'sample', 'example', 'test', 'temp', 'tmp',
  '준비중', '작성중', '추후', '추후작성', '미정', '미작성', '내용없음', '공백',
  '여기에내용', '샘플', '예시', '임시', '보류',
];

/** 문장 어디에 있어도 자리표시자로 보는 표식. */
const PLACEHOLDER_MARKER = [
  /\bTODO\b/i, /\bTBD\b/i, /\bFIXME\b/i, /\bXXX\b/,
  /lorem\s+ipsum/i, /\bplaceholder\b/i,
  /준비\s*중/, /작성\s*중/, /추후\s*(작성|보완|추가)/, /내용\s*없음/,
  /여기에\s*(내용|본문|텍스트)/,
];

/** 비교용 정규화 — 공백·구두점·괄호·말줄임을 벗긴다. */
function norm(s) {
  return String(s ?? '')
    .replace(/[\s ]+/g, '')
    .replace(/^[[({<"'“”‘’]+|[\])}>"'“”‘’]+$/g, '')
    .replace(/[.。…·\-–—_*#:;!?]+$/g, '')
    .toLowerCase();
}

/**
 * 이 문자열이 「실질 내용 0」인가.
 * @returns {null | string} null = 실질 내용 있음 / 문자열 = 비어 있는 사유
 */
export function emptyReason(s) {
  const raw = String(s ?? '');
  if (raw.trim() === '') return '빈 문자열';
  const n = norm(raw);
  if (n === '') return '구두점만';
  if (PLACEHOLDER_WHOLE.includes(n)) return `자리표시자('${raw.trim()}')`;
  for (const re of PLACEHOLDER_MARKER) {
    if (re.test(raw)) return `자리표시자 표식(${re.source})`;
  }
  return null;
}

export function isEmptyText(s) { return emptyReason(s) !== null; }

/* ── 블록에서 사람이 읽는 글자만 뽑는다 ─────────────────────────────────── */

/** Block 1개의 표시 텍스트를 이어 붙인다(`src/content/types.ts` 의 7종). */
export function blockText(b) {
  if (b === null || typeof b !== 'object') return '';
  switch (b.type) {
    case 'p': return String(b.text ?? '');
    case 'h': return String(b.text ?? '');
    case 'note': return String(b.text ?? '');
    case 'formula': return `${b.latex ?? ''} ${b.caption ?? ''}`;
    case 'figure': return String(b.caption ?? '');
    case 'list': return (Array.isArray(b.items) ? b.items : []).join(' ');
    case 'table': return [
      ...(Array.isArray(b.head) ? b.head : []),
      ...(Array.isArray(b.rows) ? b.rows.flat() : []),
    ].join(' ');
    default: return '';
  }
}

/**
 * 블록 배열을 계량한다.
 * 🔴 `h`(제목)만 늘어놓은 「목차뿐인 절」을 채워짐으로 세지 않는다 —
 *    실질 블록은 제목을 뺀 것으로 센다.
 */
export function measureBlocks(blocks) {
  const arr = Array.isArray(blocks) ? blocks : [];
  let real = 0; let chars = 0; let placeholders = 0; let headings = 0;
  for (const b of arr) {
    const txt = blockText(b);
    if (b && b.type === 'h') { headings += 1; if (!isEmptyText(txt)) chars += txt.replace(/\s+/g, '').length; continue; }
    if (isEmptyText(txt)) { placeholders += 1; continue; }
    real += 1;
    chars += txt.replace(/\s+/g, '').length;
  }
  return { total: arr.length, real, headings, placeholders, chars };
}

/* ══════════════════════════════════════════════════════════════════════════
 * §3. 절별 판정기
 *
 * 각 판정기는 `{ verdict, detail }` 를 낸다. `detail` 은 사람이 읽는 한 줄이다.
 * 🔴 「왜 그렇게 판정했는지」를 detail 에 반드시 담는다 — 숫자 없는 판정은 재현되지 않는다.
 * ══════════════════════════════════════════════════════════════════════════ */

function proseVerdict(section, minBlocks, minChars, label) {
  if (section === undefined || section === null) {
    return { verdict: V.EMPTY, detail: `${label} 없음 — 콘텐츠 파일 또는 절 키 부재` };
  }
  const m = measureBlocks(section.blocks);
  if (m.total === 0) return { verdict: V.EMPTY, detail: `${label} blocks[] 길이 0` };
  if (m.real === 0) {
    return {
      verdict: V.EMPTY,
      detail: `${label} 실질 블록 0 (전체 ${m.total} = 제목 ${m.headings} + 자리표시자 ${m.placeholders})`,
    };
  }
  const titleBad = emptyReason(section.title);
  const short = [];
  if (m.real < minBlocks) short.push(`실질 블록 ${m.real} < ${minBlocks}`);
  if (m.chars < minChars) short.push(`본문 ${m.chars}자 < ${minChars}자`);
  if (m.placeholders > 0) short.push(`자리표시자 블록 ${m.placeholders}개`);
  if (titleBad) short.push(`제목 ${titleBad}`);
  if (short.length > 0) return { verdict: V.SHORT, detail: `${label} ${short.join(' · ')}` };
  return { verdict: V.FULL, detail: `${label} 블록 ${m.real}개 · ${m.chars}자` };
}

/** theory · overview — 산문 단일 축. */
export function judgeProse(sectionId, ctx) {
  const section = ctx.prose ? ctx.prose[sectionId] : undefined;
  return proseVerdict(section, THRESHOLDS.PROSE_MIN_BLOCKS, THRESHOLDS.PROSE_MIN_CHARS, '산문');
}

/**
 * equipment · principle — **2축**이다.
 *   축A(DSN) 장비 도해 라벨 · 축B(PLN) 산문 블록
 * 한쪽만 서면 🟡 다. 화면의 절반이 EmptySlot 이기 때문이다
 * (`EquipmentSection.tsx` — 도해쪽 EmptySlot owner=DSN, 패널쪽 owner=PLN).
 */
export function judgeEquip(sectionId, ctx) {
  const lang = ctx.lang;
  const fig = ctx.equipment;
  const axisA = [];
  let axisAok = false;
  if (!fig) {
    axisA.push('labels.json 없음');
  } else {
    const labels = Array.isArray(fig.labels) ? fig.labels : [];
    if (labels.length < THRESHOLDS.EQUIP_MIN_LABELS) {
      axisA.push(`라벨 ${labels.length}개 < ${THRESHOLDS.EQUIP_MIN_LABELS}`);
    } else {
      const badName = labels.filter((l) => isEmptyText(l?.[lang])).length;
      if (badName > 0) axisA.push(`${lang} 라벨명 공백 ${badName}/${labels.length}`);
      else axisAok = true;
    }
  }

  const b = proseVerdict(
    ctx.prose ? ctx.prose[sectionId] : undefined,
    THRESHOLDS.EQUIP_PROSE_MIN_BLOCKS, THRESHOLDS.EQUIP_PROSE_MIN_CHARS, '산문',
  );

  /* equipment 절만: 라벨을 눌렀을 때 뜨는 설명(`content.labels[descKey]`)도 산문 축이다. */
  const descNotes = [];
  if (sectionId === 'equipment' && fig && Array.isArray(fig.labels)) {
    const dict = (ctx.prose && ctx.prose.labels) || {};
    const missing = fig.labels
      .map((l) => l?.descKey)
      .filter((k) => typeof k === 'string' && k !== '')
      .filter((k) => isEmptyText(dict[k]));
    if (missing.length > 0) descNotes.push(`라벨 설명 공백 ${missing.length}/${fig.labels.length}`);
  }

  const axisBok = b.verdict === V.FULL && descNotes.length === 0;
  const bDetail = descNotes.length > 0 ? `${b.detail} · ${descNotes.join(' · ')}` : b.detail;

  if (!axisAok && !axisBok) {
    return { verdict: V.EMPTY, detail: `도해 ✗(${axisA.join(' · ') || '미상'}) · 산문 ✗(${bDetail})` };
  }
  if (axisAok && axisBok) {
    return { verdict: V.FULL, detail: `도해 ✓(라벨 ${fig.labels.length}) · ${bDetail}` };
  }
  if (axisAok) return { verdict: V.SHORT, detail: `도해 ✓(라벨 ${fig.labels.length}) · 산문 ✗(${bDetail})` };
  return { verdict: V.SHORT, detail: `도해 ✗(${axisA.join(' · ')}) · ${bDetail}` };
}

/**
 * lab-* — 랩 스펙의 **실질 내용**을 본다.
 * 🔴 `LabSection.tsx` 는 스펙의 **존재만** 보고 내용은 안 본다(L52).
 *    그래서 `params: []`, `outputs: []` 인 껍데기가 등록돼 있어도 화면은 정상으로 보인다.
 *    이 게이트가 그 구멍을 메운다.
 */
export function judgeLab(sectionId, ctx) {
  const lang = ctx.lang;
  const s = ctx.lab;
  if (!s) return { verdict: V.EMPTY, detail: `랩 스펙 미등록 (${ctx.processId}/${sectionId})` };

  const params = Array.isArray(s.params) ? s.params : [];
  const outputs = Array.isArray(s.outputs) ? s.outputs : [];
  const judge = outputs.filter((o) => o && o.role === 'judge');
  const feedback = Array.isArray(s.feedback) ? s.feedback : [];
  const tradeoffs = Array.isArray(s.tradeoffs) ? s.tradeoffs : [];

  const hard = [];
  if (params.length < THRESHOLDS.LAB_MIN_PARAMS) hard.push(`조작 파라미터 ${params.length}개`);
  if (judge.length < THRESHOLDS.LAB_MIN_JUDGE_OUTPUTS) hard.push(`판정 출력 ${judge.length}개(전체 출력 ${outputs.length})`);
  if (hard.length > 0) return { verdict: V.EMPTY, detail: `껍데기 스펙 — ${hard.join(' · ')}` };

  const soft = [];
  if (feedback.length < THRESHOLDS.LAB_MIN_FEEDBACK) soft.push(`피드백 ${feedback.length}개`);
  if (tradeoffs.length < THRESHOLDS.LAB_MIN_TRADEOFFS) soft.push(`상충 ${tradeoffs.length}개`);

  /* 언어별 — 이 언어의 표시 문자열이 실제로 있는가. ko 만 있고 en 이 없는 랩을 잡는다. */
  const titleKey = lang === 'en' ? 'titleEn' : 'titleKo';
  if (isEmptyText(s[titleKey])) soft.push(`${titleKey} ${emptyReason(s[titleKey])}`);
  const groups = [['파라미터', params], ['출력', outputs], ['피드백', feedback], ['상충', tradeoffs]];
  for (const [name, arr] of groups) {
    const bad = arr.filter((x) => isEmptyText(x?.[lang])).length;
    if (bad > 0) soft.push(`${name} ${lang} 공백 ${bad}/${arr.length}`);
  }

  const base = `파라미터 ${params.length} · 판정출력 ${judge.length}/${outputs.length} · 피드백 ${feedback.length} · 상충 ${tradeoffs.length}`;
  if (soft.length > 0) return { verdict: V.SHORT, detail: `${base} — ${soft.join(' · ')}` };
  return { verdict: V.FULL, detail: base };
}

/** test — A2 대조. 문항 수와 각 문항의 실질 내용. */
export function judgeTest(_sectionId, ctx) {
  const set = ctx.questions;
  if (!set) return { verdict: V.EMPTY, detail: '문항 파일 없음' };
  const items = Array.isArray(set.items) ? set.items : [];
  if (items.length === 0) return { verdict: V.EMPTY, detail: 'items[] 길이 0' };

  const emptyStem = items.filter((q) => isEmptyText(q?.stem)).length;
  if (emptyStem === items.length) {
    return { verdict: V.EMPTY, detail: `문항 ${items.length}개 전부 stem 공백/자리표시자` };
  }
  const short = [];
  const need = THRESHOLDS.TEST_REQUIRED_ITEMS;
  if (items.length < need) short.push(`문항 ${items.length}/${need} (A2 미달 ${need - items.length}개)`);
  if (emptyStem > 0) short.push(`stem 공백 ${emptyStem}개`);
  const emptyExp = items.filter((q) => isEmptyText(q?.explanation)).length;
  if (emptyExp > 0) short.push(`해설 공백 ${emptyExp}개`);
  const noChoice = items.filter((q) => q?.type === 'single' && (!Array.isArray(q.choices) || q.choices.length < 2)).length;
  if (noChoice > 0) short.push(`선택지 부족 ${noChoice}개`);
  if (short.length > 0) return { verdict: V.SHORT, detail: short.join(' · ') };
  return { verdict: V.FULL, detail: `문항 ${items.length}/${need}` };
}

/**
 * result — 공정별 정적 데이터 파일이 없는 절이다(`src/content/types.ts` 주석).
 * 화면에 실제로 나오는 것은 **문항의 `explanation` 과 `weakTopic`** 이므로 그것을 잰다.
 * 🔴 응시 기록(localStorage)은 런타임 축이라 정적으로 못 본다 — §「못 보는 것」에 적었다.
 */
export function judgeResult(_sectionId, ctx) {
  const set = ctx.questions;
  if (!set) return { verdict: V.EMPTY, detail: '원천(문항 파일) 없음 — 약점 진단·해설 근거 0' };
  const items = Array.isArray(set.items) ? set.items : [];
  if (items.length === 0) return { verdict: V.EMPTY, detail: '원천 items[] 길이 0' };

  const noWeak = items.filter((q) => isEmptyText(q?.weakTopic)).length;
  const noExp = items.filter((q) => isEmptyText(q?.explanation)).length;
  const noObj = items.filter((q) => isEmptyText(q?.objectiveId)).length;
  if (noWeak === items.length && noExp === items.length) {
    return { verdict: V.EMPTY, detail: `문항 ${items.length}개 전부 weakTopic·해설 공백 — 결과 화면이 빈다` };
  }
  const short = [];
  const need = THRESHOLDS.TEST_REQUIRED_ITEMS;
  if (items.length < need) short.push(`원천 문항 ${items.length}/${need}`);
  if (noWeak > 0) short.push(`weakTopic 공백 ${noWeak}개`);
  if (noExp > 0) short.push(`해설 공백 ${noExp}개`);
  if (noObj > 0) short.push(`objectiveId 공백 ${noObj}개`);
  if (short.length > 0) return { verdict: V.SHORT, detail: short.join(' · ') };
  return { verdict: V.FULL, detail: `약점 진단 원천 ${items.length}건 (weakTopic·해설·목표 전건 실재)` };
}

const JUDGES = {
  theory: judgeProse,
  overview: judgeProse,
  equipment: judgeEquip,
  principle: judgeEquip,
  'lab-basic': judgeLab,
  'lab-applied': judgeLab,
  'lab-advanced': judgeLab,
  test: judgeTest,
  result: judgeResult,
};

/** 절 1칸을 판정한다. 게이트·픽스처가 공유하는 유일한 입구. */
export function judgeSlot(sectionId, ctx) {
  const fn = JUDGES[sectionId];
  if (!fn) return { verdict: V.EMPTY, detail: `알 수 없는 절 '${sectionId}'` };
  return fn(sectionId, ctx);
}

/* ══════════════════════════════════════════════════════════════════════════
 * §4. 전수 판정
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} data
 *   data.processIds   string[]                     — 카탈로그 순서
 *   data.sectionIds   string[]                     — 카탈로그 sectionOrder
 *   data.prose        { [lang]: { [pid]: ProcessContent|null } }
 *   data.questions    { [lang]: { [pid]: QuestionSet|null } }
 *   data.equipment    { [pid]: EquipmentLabelFile|null }
 *   data.labs         { [`${pid}/${stage}`]: LabSpecLite|null }
 * @returns {{ slots: object[], byLang: object, roll: object[], summary: object }}
 */
export function judgeAll(data) {
  const processIds = data.processIds ?? [];
  const sectionIds = data.sectionIds ?? SECTION_IDS;
  const slots = [];

  for (const pid of processIds) {
    for (const sid of sectionIds) {
      for (const lang of LANGS) {
        const ctx = {
          lang,
          processId: pid,
          sectionId: sid,
          prose: data.prose?.[lang]?.[pid] ?? null,
          questions: data.questions?.[lang]?.[pid] ?? null,
          equipment: data.equipment?.[pid] ?? null,
          lab: data.labs?.[`${pid}/${sid}`] ?? null,
        };
        const { verdict, detail } = judgeSlot(sid, ctx);
        slots.push({ processId: pid, sectionId: sid, lang, verdict, detail });
      }
    }
  }

  /* 🔴 72칸 롤업 — 두 언어 중 **나쁜 쪽**을 취한다.
   *    한쪽만 채워진 칸을 「채워짐」으로 세면 이 게이트를 만든 이유가 사라진다. */
  const rank = { [V.EMPTY]: 0, [V.SHORT]: 1, [V.FULL]: 2 };
  const roll = [];
  for (const pid of processIds) {
    for (const sid of sectionIds) {
      const per = {};
      for (const lang of LANGS) {
        per[lang] = slots.find((s) => s.processId === pid && s.sectionId === sid && s.lang === lang);
      }
      const worst = LANGS.reduce(
        (acc, l) => (rank[per[l].verdict] < rank[acc] ? per[l].verdict : acc), V.FULL,
      );
      const split = per.ko.verdict !== per.en.verdict;
      roll.push({
        processId: pid, sectionId: sid, verdict: worst, split,
        ko: per.ko.verdict, en: per.en.verdict,
        detail: split ? `ko:${per.ko.detail} / en:${per.en.detail}` : per.ko.detail,
      });
    }
  }

  const count = (arr) => ({
    FULL: arr.filter((x) => x.verdict === V.FULL).length,
    SHORT: arr.filter((x) => x.verdict === V.SHORT).length,
    EMPTY: arr.filter((x) => x.verdict === V.EMPTY).length,
    total: arr.length,
  });

  const byLang = {};
  for (const lang of LANGS) byLang[lang] = count(slots.filter((s) => s.lang === lang));

  const rollCount = count(roll);
  const summary = {
    ...rollCount,
    /** 충족률 = 🟢 / 전체. 🟡 는 분자에 넣지 않는다 — 「대체로 찼다」는 없다. */
    ratio: rollCount.total === 0 ? 0 : rollCount.FULL / rollCount.total,
    splitLang: roll.filter((r) => r.split).length,
  };

  return { slots, byLang, roll, summary };
}

/** 「이 계측기가 못 보는 것」 — 게이트와 픽스처가 같은 문장을 쓰도록 여기에 둔다. */
export const BLIND_SPOTS = [
  '**「분량이 있다」는 「내용이 옳다」가 아니다.** 글자 수·블록 수로는 서술의 정확성·최신성·교육적 타당성을 못 본다. 틀린 설명 400자는 이 게이트에서 🟢 다.',
  '**표절·중복을 못 본다.** 여덟 공정에 같은 문단을 복사해 넣어도 전부 🟢 다.',
  '**언어 간 의미 일치를 못 본다.** en 필드에 한글을 그대로 넣거나 전혀 다른 문장을 넣어도, 비어 있지만 않으면 🟢 다.',
  '**출처의 진위를 못 본다.** `sourceId` 가 실재 문헌을 가리키는지는 `check-sources`·`check-citations` 소관이다.',
  '**런타임 축을 못 본다.** result 절의 실제 화면은 localStorage 응시 기록으로 그려진다. 여기서는 그 화면의 **재료**(문항의 weakTopic·해설)만 잰다.',
  '**씬(3D 시각화)의 유무를 절 판정에 넣지 않는다.** 설계상 씬 없는 랩이 허용된다(`lab.scene.pending`). 씬 배선은 `check-direction`·`check-wiring` 소관이다.',
  '**자리표시자 사전은 유한하다.** 여기 없는 말(예: 「나중에 채움」의 새로운 변형)로 채워두면 실질 내용으로 센다. 사전은 §2 에 있고, 새 변형을 보면 거기 추가하는 것이 옳다.',
  '**문항의 정답이 맞는지 못 본다.** 채점 규약·수치 정합은 `check-questions`·`check-numeric` 소관이다.',
];
