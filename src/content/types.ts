/** 카탈로그·콘텐츠 데이터 계약. 공정 개수·ID 는 여기서 타입으로 고정하지 않는다(§11 C1). */

import type { SourceId } from '@/models/sources.generated';

export type SectionId =
  | 'theory' | 'overview' | 'equipment' | 'principle'
  | 'lab-basic' | 'lab-applied' | 'lab-advanced'
  | 'test' | 'result';

export type Lang = 'ko' | 'en';

export interface TrackDef {
  id: string;
  ko: string;
  en: string;
  order: number;
  processes: string[];
}

export interface ProcessDef {
  ko: string;
  en: string;
  order: number;
  status: 'active' | 'draft';
  sections: SectionId[];
}

export interface Catalog {
  schemaVersion: number;
  sectionOrder: SectionId[];
  tracks: TrackDef[];
  processes: Record<string, ProcessDef>;
}

/* ---------- 콘텐츠 블록 (PLN 계약 · 7종 고정) ---------- */

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 2 | 3 | 4; text: string }
  | { type: 'formula'; latex: string; sourceId: string; caption?: string }
  | { type: 'figure'; src: string; caption: string; sourceId: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'note'; tone: 'info' | 'warn'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] };

export interface ContentSection {
  title: string;
  blocks: Block[];
}

/** 콘텐츠(산문)를 가진 절만. lab-*·test·result 는 데이터가 아니라 화면 로직이다. */
export type ProseSectionId = Extract<SectionId, 'theory' | 'overview' | 'equipment' | 'principle'>;

export interface ProcessContent {
  processId: string;
  theory: ContentSection;
  overview: ContentSection;
  equipment: ContentSection;
  principle: ContentSection;
  /** 장비 라벨 id → 설명 문장 */
  labels: Record<string, string>;
}

/* ---------- 문항 (PLN 계약) ---------- */

export type Difficulty = 'high' | 'mid' | 'low';

/**
 * 계산형 정답 — PLN 채점 규약(§2-5).
 * 🔴 `unit: null` 은 **무차원**(선택비·이방성도 등)을 뜻한다.
 *    무차원 문항에 단위 일치 검사를 걸면 정답도 오답이 된다(PLN 요구 · 테스트 T-6).
 * `tolerance` 는 **상대 오차**다: |답 − 정답| / |정답| ≤ tolerance.
 */
export interface NumericAnswer {
  value: number;
  unit: string | null;
  tolerance: number;
}

/**
 * 🔴 계산형 정답의 **하위 항목 하나** — `(a)`·`(b)`·`(c)` 처럼 한 문제가 여러 값을 요구할 때 쓴다.
 *    `NumericAnswer` 와 필드는 같고 `label` 만 더 있다("a"·"b"·"c" 등 — 화면 입력란 라벨).
 */
export interface NumericAnswerPart extends NumericAnswer {
  label: string;
}

/**
 * 🔴 **다항 계산형 정답** — CEO 지시(2026-08-24 3차): 「채점은 문제 문항수에 따라 다 하는
 *    것이 기준」. 원장이 `(a)(b)(c)` 처럼 여러 값을 요구하면 **전부** 채점해야 하고, 대표값
 *    하나만 채점하고 나머지를 안 보면 정답을 알고도 오답이 되는 학습자가 생긴다
 *    (check-ledger-parity R6 · packaging-q08 실측).
 *    부분점수는 없다 — `NumericAnswer` 단항 문항과 같은 규약(문항당 1점), **전부** 맞아야 정답.
 */
export interface NumericMultiAnswer {
  parts: NumericAnswerPart[];
}

/** 단답형 정답 — 정규화 후 **완전 일치**만 정답. 부분 문자열 매칭 금지. */
export interface ShortAnswer {
  accept: string[];
}

export type QuestionType = 'single' | 'short' | 'numeric';

/**
 * 🔴 근거를 아직 찾지 못한 문항의 `sourceId`.
 *
 * 「주제가 가장 가까운 등록 출처」를 갖다 붙이면 화면의 출처 번호가 **거짓**이 된다 —
 * 학습자가 배지를 눌러 원문을 찾으면 그 문항과 무관한 문헌이 나온다.
 * 어느 S번호도 그 문항을 뒷받침하지 못하면 **모른다고 표시하는 것이 옳다.**
 * 배지는 번호 대신 「출처 확인 중」으로 뜨고, `check-sources.mjs` 가 개수를 경고로 센다.
 */
export const PENDING_SOURCE_ID = 'PENDING';
export type PendingSourceId = typeof PENDING_SOURCE_ID;

/**
 * 오답 사유 — 원장 `04_문항원장.md` 의 「오답 해설」을 그대로 옮긴 것.
 *
 * 🔴 **왜 `explanation` 과 따로 두는가.** `explanation` 은 「정답이 왜 정답인가」다.
 * 학습자가 틀렸을 때 필요한 것은 그것이 아니라 **「내가 고른 그것이 왜 틀렸는가」** 다.
 * 원장은 보기마다 그 답을 갖고 있었는데 앱에는 실리지 않아, 결과 화면이 「오답」이라고만
 * 말하고 끝났다. A3(문항별 해설 + 약점 진단)의 절반이 비어 있던 자리다.
 */
export interface DistractorNote {
  /** 선택형: 그 오답 보기의 0-기준 인덱스. 단답·계산형에는 없다. */
  choiceIndex?: number;
  /** 단답·계산형: 원장이 든 대표 오답 표기(예: `RTA`). 선택형에는 없다. */
  label?: string;
  /** 원장 「오답 해설」 원문. 요약하지 않는다. */
  text: string;
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  objectiveId: string;
  stem: string;
  choices?: string[];
  answer: number | ShortAnswer | NumericAnswer | NumericMultiAnswer;
  explanation: string;
  /**
   * 원장의 「오답 해설」. 🔴 **ko 전용이다.**
   * 원장이 한국어로만 쓰였고 en 원고가 없다 — 없는 번역을 지어내지 않는다.
   * en 원고가 들어오면 `src/content/en/questions/*.json` 에 같은 필드로 채우면 화면이 따라온다.
   */
  distractors?: DistractorNote[];
  /** 원장의 S번호, 또는 근거 미확정을 뜻하는 `'PENDING'`. */
  sourceId: SourceId | PendingSourceId;
  weakTopic: string;
}

export interface QuestionSet {
  processId: string;
  items: QuestionItem[];
}

/* ---------- 장비 라벨 (DSN 계약 · §6-3) ---------- */

export interface EquipmentLabel {
  id: string;
  anchor: [number, number];
  leaderEnd: [number, number];
  side: 'left' | 'right';
  ko: string;
  en: string;
  descKey: string;
}

/**
 * 장비 단면 「제작 고지」(A13) — 도해가 실물과 다르게 그려진 부분·미확인 사항을 밝힌다.
 * 라벨과 형상이 같은 「위치가 있는 콜아웃」이지만, `descKey` 대신 `tone` 을 갖는다.
 *
 * 🔴 `tone` 이 없으면 렌더러는 **'warn' 으로 취급**한다(안전한 쪽).
 *    「생략·과장」 고지가 「참고」로 강등되면 고지 체계를 만든 목적이 무너진다.
 */
export interface EquipmentNote {
  id: string;
  anchor: [number, number];
  leaderEnd: [number, number];
  side: 'left' | 'right';
  ko: string;
  en: string;
  tone?: 'info' | 'warn';
}

export interface EquipmentLabelFile {
  processId: string;
  image: string;
  viewBox: [number, number, number, number];
  labels: EquipmentLabel[];
  /** 제작 고지(A13). 없을 수 있다 — 있으면 반드시 화면에 나와야 한다. */
  notes?: EquipmentNote[];
  /** DSN 이 권고한 고지 텍스트 최대 폭(사용자 좌표). 렌더러 참고값. */
  noteMaxWidth?: number;
}
