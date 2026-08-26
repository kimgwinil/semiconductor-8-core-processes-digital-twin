import type { Quantity } from '../contract';
import type { SourceId } from '../sources.generated';
/* 🔴 계층: models → lib 는 허용된다(`check-layering` 은 models 의 react·ui·viz·DOM 참조만 막는다).
   합격창 부등호를 두 벌 두지 않으려고 여기서 끌어 쓴다 — 아래 `evaluate()` 주석 참조. */
import { inPassWindow } from '@/lib/format';

/**
 * 실습 명세 계약 — PLN `03_실습3단계명세.md` 를 **데이터로 옮긴 것**.
 *
 * 🔴 공정별 구현자는 이 타입만 채운다. UI 는 `src/ui/sections/LabRunner.tsx` 하나뿐이다.
 *    8명이 각자 화면을 만들면 판정·배지·피드백이 제각각이 된다.
 * 🔴 계층: 여기는 models 다. `src/viz` 를 import 하지 않는다 — 씬 id 는 그냥 문자열로 둔다.
 */

export type LabStage = 'lab-basic' | 'lab-applied' | 'lab-advanced';

/** 조작 파라미터 — PLN 명세 「2) 조작 파라미터」 표 그대로. */
export interface LabParam {
  id: string;
  ko: string;
  en: string;
  unit: string;
  /**
   * 🔴 `unit` 이 기호(`nm`·`°C`·`mTorr`)가 아니라 **한글 단어**(`사이클`·`개`)일 때만 채운다.
   *    기호 단위는 언어와 무관해 종전처럼 `unit` 하나로 족하다. 없으면 `unit` 을 그대로 쓴다.
   *    English 모드에서 안내 박스만 영역해 두고 이 필드를 놓쳐 슬라이더 단위가 한글로 남았던
   *    사고(2026-08-24)의 재발 방지 — `check-i18n` 은 `ko`/`en` 라벨만 보고 `unit` 은 보지 않는다.
   */
  unitEn?: string;
  min: number;
  max: number;
  step: number;
  /**
   * 🔴 **명시 값 목록** — `min + k·step` 등간격 격자로 **표현할 수 없는** 이산 파라미터 전용(선택).
   *
   * **왜 신설했는가(2026-08-24 실측).** `oxidation` 의 정본표 온도는
   * `TEMPS = [920, 1000, 1100]` 인데 간격이 **80 · 100 으로 다르다.** 등간격 `step` 으로는
   * 표현이 불가능하다. 그래서 선언이 `step: 90` 이었고 화면 격자는 **920 · 1010 · 1100** 이 됐다.
   * `nearestTemp()` 가 1010 을 1000 으로 조용히 스냅하므로 **화면은 1010 을 보이고 계산은 1000 으로 돌았다.**
   * (`initial: 1000` 자체가 그 격자 밖이라, 선언이 이미 스스로 모순을 말하고 있었다.)
   *
   * 🔴 **`min`·`max`·`step` 은 바꾸지 않았다.** 이 필드는 「화면이 내는 값」만 정본에 맞춘다.
   *    ⛔ **여기에 새 값을 지어 넣지 마라.** 이미 모델이 쓰는 상수를 `import` 해서 넘겨라 —
   *    숫자를 손으로 다시 적으면 두 벌이 갈라지고, 갈라지는 순간 이 필드는
   *    「지어낸 값을 권위 있게 보이는 장치」가 된다.
   *
   * **게이트 영향 없음(실측 근거).** `check-numeric` 등은 도달가능 집합을 `min + k·step` 으로 본다.
   * `oxidation` 은 모든 경로가 `nearestTemp()` 를 먼저 통과하므로
   * `compute({tempC:1010})` 과 `compute({tempC:1000})` 의 **출력이 완전히 같다**(팀장 실측 2026-08-24).
   * 즉 도달가능한 **출력 집합**은 변하지 않는다. 바뀌는 것은 **화면에 적히는 수가 참이 되는 것**뿐이다.
   */
  options?: number[];
  /** 기본값. 🔴 PLN 「죽은 판정 없음 확인」에 따라 보통 **불합격 상태**에서 시작한다. */
  initial: number;
  /** 범위의 근거(문헌). 있으면 슬라이더 옆에 배지로 노출된다. */
  sourceId?: SourceId;
  /**
   * 🔴 문헌 S번호가 아닌 근거. 시나리오 자체에서 유도했거나 장비 운전 한계인 경우.
   *    `sourceId` 또는 `basis` **둘 중 하나는 반드시 있어야 한다**(`check-labs.mjs` 강제).
   *    「범위를 지어내면 식을 지어낸 것과 같다」
   */
  basis?: string;
  note?: string;
}

/** 출력 지표 — PLN 「3) 성공 조건」 표 그대로. */
export interface LabOutput {
  id: string;
  ko: string;
  en: string;
  /** 🔴 `judge` 만 합격/불합격을 가른다. `display` 는 표시만 하고 판정에 넣지 않는다. */
  role: 'judge' | 'display';
  /** 합격 구간. `judge` 면 필수. */
  pass?: { min?: number; max?: number };
  /**
   * 🔴 **판정용 정의역** — 이 지표가 **성립할 수 있는 값의 범위**. 합격창(`pass`)과 전혀 다른 것이다.
   *    합격창은 「잘 만들었는가」를 묻고, 정의역은 「이 값이 존재할 수 있는가」를 묻는다.
   *
   * 왜 여기에 또 적는가 — `quantity()` 의 `validRange` 가 이미 같은 것을 말하는데:
   *   `evaluate()` 는 **실값(number)만** 받는 경로가 있다(화면 하네스가 `Quantity` 를 벗겨서 넘긴다).
   *   실값에는 정의역이 딸려 오지 않으므로, 그 경로에서 정의역을 볼 곳은 **명세뿐**이다.
   *   2026-08-21 사고가 정확히 그 구멍이었다 — 물리층은 σ_D = −0.1 mm 를 `outOfRange` 로 표시했는데
   *   판정은 실값 −0.1 만 보고 「−0.1 ≤ 1 이니 합격」을 줬다.
   *
   * 🔴 **`quantity()` 의 `validRange` 와 같은 상수에서 파생시켜라.** 숫자를 손으로 두 번 적으면
   *    둘이 갈라지고, 갈라지는 순간 이 필드는 **거짓말을 고정하는 장치**가 된다.
   * 🔴 정의역이 입력에 따라 변하는 출력(패키징의 여유 출력 등)은 여기 고정 상수로 적지 말고
   *    `Quantity` 를 그대로 `evaluate()` 에 넘겨라 — 그러면 물리층의 `outOfRange` 가 정본이 된다.
   */
  domain?: [number, number];
  /** 소수점 자리수(표시용). */
  digits?: number;
  /**
   * 🔴 **표시 판정 모드** — R-DISP-1(PLN §27-3)의 손잡이. 기본 `'continuous'` 라 **안 적으면 종전과 같다.**
   *
   * 경계 근방에서 「반올림한 표시값이 규격선의 반대편에 놓이는」 모순이 생기면 서식기는
   * 자릿수를 **한 단계만** 올려 푼다(`src/lib/format.ts#formatJudged`). 그런데 그 상향이
   * **거짓말이 되는 출력**이 있다 —
   *
   * `'counted'` = 셈값·굵은 공칭값이라 **자릿수 상향을 금지**한다. 곧바로 부등호 표기로 간다.
   *   · `defectLevelPpm` — 통계 추정량. `1500.4 ppm` 은 0.1 ppm 분해능을 주장하게 된다
   *   · `contactResistanceUOhm` — S229 공칭값 자체가 100·200·250 의 굵은 값
   *   · `oisfDensity` — 결함 **개수** 밀도. `100.04 ea/cm²` 는 셈값에 없는 정밀도
   *   · `pitchNm` — 설계 피치. 0.1 nm 표기는 실측 분해능 밖
   *   · `floorLifeMarginH` — MSL 플로어 라이프가 시간 단위 정수 규격
   *   · 패키징 플래그 5종 — 값이 정확히 0·1 이라 발동하지 않는다. **명시적으로 못박아 둔다**
   *
   * 🔴 이 지정은 **교육적 판정**이지 문헌에서 도출한 것이 아니다(PLN 자진 신고 §27-9 ③).
   *    이견이 있으면 이 지정만 바꾸면 되고 규칙 본체는 영향받지 않는다.
   */
  displayMode?: 'continuous' | 'counted';
}

/**
 * 🔴 **고정 조건** — 학습자가 조작할 수 없지만 **결과를 정하는 값**. (PLN `03_실습3단계명세.md`)
 *
 * **왜 필드를 신설했는가.** 명세는 P3 포토 기초에 대해 「고정값(화면 우측 조건 카드에 상시 표시)」
 * 라고 **위치까지 규정**하고 7개(λ · NA · n · k1 · k2 · 레지스트 두께 T · 클리어 선량 E₀)를 나열했다. 그런데 `LabSpec` 에 고정조건을 담을 자리가 없어서, 구현은
 * 이 7개를 **출력값 아래 가정 목록**(`Quantity.assumptions`)에 흩어 넣었고 —
 * 2026-08-22 실측으로 **`n`·`k₂`·`T`·`E₀` 4개가 학습자에게 닿지 않았다.**
 * 가정 목록은 「이 수치가 어떤 전제로 나왔나」를 말하는 자리이지, 「이 실습의 조건이 무엇인가」를
 * 말하는 자리가 아니다. **자리가 없으면 값은 새어 나간다.**
 *
 * 🔴 **선택 필드다.** 안 쓰는 칸은 종전과 완전히 같은 DOM 을 낸다 — 23칸이 깨지지 않는다.
 * 🔴 **명세에 있는 것만 적는다.** 코드에 상수가 있다고 해서 명세가 고정 조건으로 선언하지 않은
 *    값을 여기 올리지 마라. 그 순간 이 카드는 「지어낸 조건을 권위 있게 보이는 장치」가 된다.
 */
export interface LabFixedCondition {
  id: string;
  /** 기호·이름. 예: `'개구수 NA'`. */
  ko: string;
  en: string;
  /**
   * 값. 🔴 **문자열이다** — 명세의 고정 조건에는 수가 아닌 것이 섞여 있다
   * (면방위 `⟨100⟩` · 분위기 `건식 O₂` · 프로브 카드 `캔틸레버형`).
   * 수치는 **명세가 적은 자릿수 그대로** 옮긴다. 여기서 반올림하면 본문과 화면이 갈라진다.
   */
  value: string;
  /** `value` 가 `⟨100⟩` 같은 기호가 아니라 한글 단어(`폴리실리콘`·`건식 O₂`)일 때만 채운다. */
  valueEn?: string;
  unit?: string;
  /** `unit` 이 한글 단어일 때만 채운다 — `LabParam.unitEn` 과 같은 이유. */
  unitEn?: string;
  /** 문헌 근거. */
  sourceId?: SourceId;
  /**
   * S번호가 아닌 근거(명세 설정값·교육용 조건 등).
   * 🔴 `sourceId` 또는 `basis` **둘 중 하나는 반드시 있어야 한다** — 파라미터 범위와 같은 규율이다.
   *    조건 카드는 학습자가 「이건 정해진 것」으로 읽는 자리다. 출처 없는 값이 거기 앉으면 안 된다.
   */
  basis?: string;
  note?: string;
}

export type FeedbackTone = 'stop' | 'warn' | 'hint';

/** 오조작 피드백 — PLN 「5) 오조작 시 피드백」 표 그대로. */
export interface LabFeedback {
  id: string;
  tone: FeedbackTone;
  ko: string;
  en: string;
  /** 트리거 조건. 입력·출력 실값을 받는다. */
  when(inputs: Readonly<Record<string, number>>, outputs: Readonly<Record<string, number>>): boolean;
}

/** 상충 관계 — PLN 「6) 상충 관계」. 화면에 그대로 노출한다(슬라이더 장난감 방지 규칙 1). */
export interface LabTradeoff { ko: string; en: string }

/**
 * 씬 연결. **없으면 「내부 시각화 준비 중」을 정직하게 표시**한다.
 * 🔴 다른 공정 씬을 억지로 갖다 붙이지 않는다(DSN `12_시각화씬_공백보고.md` 판단 존중).
 */
export interface LabSceneBinding {
  /**
   * 🔴 유효 목록의 **정본은 `src/viz/index.ts` 의 `SceneId`** 다. 여기 열거하지 마라 —
   *    2026-08-20 에 이 주석이 4종만 적고 있어 실제로 쓰이는 `aldCycle` 이 빠진 것처럼 보였다.
   *    `check-labs` 가 viz 의 목록과 대조한다.
   */
  sceneId: string;
  /** 물리 실값 → 씬 정규화 파라미터(0~1). 매핑 근거를 note 에 남긴다. */
  map(inputs: Readonly<Record<string, number>>, outputs: Readonly<Record<string, number>>): Record<string, number>;
  /** 어떤 키를 왜 그렇게 매핑했는지. 화면 「근거」에 노출된다. */
  note?: string;
}

/* ---------------- 차트 패널 (PLN 03_실습3단계명세.md 426·476·595·809) ---------------- */

/**
 * 🔴 차트는 「보조 그림」이 아니라 **판정 경로**다.
 *
 * PLN 명세 427행: **「판정은 이 차트에서 한다.」** P1 웨이퍼 심화의 직경 편차 σ_D 는
 * 허용치가 1 mm 도 안 되어 잉곳 단면 씬에서는 **±0.34 px(서브픽셀)** 로 보이지 않는다.
 * 그래서 오케스트레이터 판정으로 **GL 씬에서 빼고 「확대 차트」로 이관**했다(431·489행에도 박혀 있다).
 * 차트를 빼면 그 판정이 갈 곳이 없어진다 — 2026-08-20 에 실제로 배럴에서 빠져 있었다.
 *
 * 🔴 계층: 여기는 models 다. `src/viz` 를 import 하지 않는다 —
 *    차트 종류는 문자열, 데이터는 원시값으로 넘기고 UI 가 컴포넌트에 꽂는다.
 */
export type LabChartKind = 'line' | 'profile' | 'bar';

export interface LabChartSeries {
  id: string;
  ko: string;
  en: string;
  points: Array<{ x: number; y: number }>;
  /** 규격선·참조선처럼 점선으로 그릴 계열. */
  dashed?: boolean;
}

/** 수평 기준선 — 규격 하한/상한. PLN 476행 「규격 하한선(수평 빨간 파선)」. */
export interface LabChartRefLine {
  value: number;
  ko: string;
  en: string;
  tone?: 'spec' | 'info';
}

export interface LabChartBinding {
  id: string;
  kind: LabChartKind;
  /** 패널 제목. */
  ko: string;
  en: string;
  /**
   * 🔴 이 차트가 **판정을 보여주는** 출력 id 들. 비어 있지 않으면 화면에
   *    「판정은 이 차트에서 합니다」를 명시한다(PLN 427). `check-labs` 가 id 실재를 검사한다.
   */
  judgesOutputs?: string[];
  /** PLN 이 문구까지 지정한 캡션이 있으면 그대로 옮긴다. */
  captionKo?: string;
  captionEn?: string;
  xKo: string; xEn: string; xUnit?: string; xUnitEn?: string;
  yKo: string; yEn: string; yUnit?: string; yUnitEn?: string;
  /** 🔴 확대 축. PLN 426 「세로축 200 ± 3 mm 만 확대」처럼 **판정이 보이게** 하는 핵심 값. */
  yDomain?: [number, number];
  xDomain?: [number, number];
  refLines?: LabChartRefLine[];
  /** 입력·출력 실값에서 계열을 만든다. 🔴 여기서 물리식을 새로 쓰지 마라. */
  build(inputs: Readonly<Record<string, number>>, outputs: Readonly<Record<string, number>>): LabChartSeries[];
  /** 왜 이 축·이 확대인지. 화면 「근거」에 노출된다. */
  note?: string;
  /** 영문 화면용 설명. 없으면 한국어 note를 영문 화면에 노출하지 않는다. */
  noteEn?: string;
}

/**
 * 🔴 **실습 칸 안내문** — PLN 납품(`threads/parts/content/_DEV납품_lab안내/<processId>.json`,
 *    앱 안 사본은 `src/content/lab-guide/<processId>.json`).
 *
 *    슬라이더만 보고 「무엇을 왜 하는지」를 모르는 문제를 메우는 3줄이다. 셋 다 필수이며
 *    **문구는 PLN 소유다** — DEV 가 손보지 않는다(수정이 필요하면 PLN 에 반려).
 *    선택 필드라 안 실린 칸은 안내 영역 DOM 을 아예 만들지 않는다(종전 DOM 그대로).
 */
export interface LabGuide {
  /** ① 무엇을 하는 실습인가 — 1~2문장. */
  intro: string;
  /** ② 무엇을 움직이고 무엇을 보는가 — 조작 파라미터 → 판정 출력 연결. */
  goal: string;
  /** ③ 합격 조건 — judge 출력의 pass 창을 학습자 말로. */
  passHint: string;
}

export interface LabSpec {
  processId: string;
  stage: LabStage;
  /**
   * 🔴 안내문을 **명세에 직접 실을 때** 쓰는 자리(선택). 비워 두면 화면이
   *    `src/content/lab-guide/<processId>.json` 에서 `stage` 키로 찾아 쓴다.
   *    둘 다 없으면 안내 영역을 그리지 않는다.
   */
  guide?: LabGuide;
  objectiveId: string;
  titleKo: string;
  titleEn: string;
  params: LabParam[];
  /**
   * 🔴 **고정 조건 카드.** 조작할 수 없지만 결과를 정하는 값들 — 명세가 「고정값」·「고정 조건」으로
   *    선언한 것만 옮긴다. 없으면 카드를 그리지 않는다(종전 23칸과 같은 DOM).
   */
  fixedConditions?: LabFixedCondition[];
  outputs: LabOutput[];
  /**
   * 물리층 호출. 🔴 **여기서 식을 새로 쓰지 마라** — `src/models/physics/**` 를 호출한다.
   * 반환 키는 `outputs[].id` 와 일치해야 한다(UI 가 검사한다).
   */
  compute(inputs: Readonly<Record<string, number>>): Record<string, Quantity>;
  /**
   * 씬 **1개**. 24칸 중 23칸이 이것만 쓴다. 🔴 **폐기 예정 필드가 아니다** — 아래 `scenes` 참조.
   */
  scene?: LabSceneBinding;
  /**
   * 🔴 **씬 병치** — 한 칸에 씬을 **2개 이상** 나란히 그린다. (PLN §22-1 요구사항 D-P5-1 · 2026-08-22)
   *
   * **왜 배열을 「추가」했고 `scene` 을 배열로 「바꾸지」 않았는가.**
   * `scene?: LabSceneBinding` 를 `LabSceneBinding | LabSceneBinding[]` 로 넓히거나 배열로 갈아치우면
   * 나머지 23칸의 선언을 전부 고쳐야 하고, 그보다 나쁜 것은 **`src/models` 밖의 읽는 쪽이 조용히 깨진다**:
   *   · `scripts/check-wiring.mjs` W6-6 이 `spec.scene?.sceneId` 를 **런타임 객체로** 읽는다
   *     (없으면 「판정을 볼 화면 0개」로 오탐한다).
   *   · `scripts/check-direction.mjs` 는 `/\bscene:\s*\{/` **소스 텍스트**로 칸을 센다
   *     (`scene:` 뒤가 `{` 가 아니면 그 칸을 「씬 미배선」으로 잘못 센다).
   *   · `scripts/check-labs.mjs` 는 칸 구간에서 `sceneId:` **첫 매치 하나**만 검사한다.
   * 이 셋은 `scripts/**` 라 이 작업의 편집 범위 밖이다. 그래서 **기존 필드·기존 리터럴 모양을 건드리지 않는 쪽**을 골랐다.
   *
   * 🔴 **`scene` 과 배타가 아니라 「앞에 덧붙이는」 관계다.** 그리는 순서는
   *    **`scenes` 먼저, 그 다음 `scene`** 이다(`labSceneBindings()`). 그래서 병치를 쓰는 칸은
   *    **`scene` 을 종전 모양 그대로 두고** 왼쪽에 세울 씬만 여기 적으면 된다.
   *    → 매핑을 두 벌 적지 않으므로 **두 벌이 갈라지는 사고 자체가 생기지 않는다.**
   *    `scenes` 에 `scene` 과 같은 `sceneId` 를 또 적어도 안전하다 — 아래 함수가 한 번만 그린다.
   *
   * 화면이 실제로 무엇을 그리는지는 **`labSceneBindings()` 하나가 정한다.** UI 가 `scene`·`scenes`
   * 를 각자 해석하면 칸마다 다르게 그려진다.
   */
  scenes?: LabSceneBinding[];
  /** 🔴 차트 패널. 씬과 **별개 항목**이다 — A5(내부 시각화)를 채우는 것이 아니라 판정 경로를 만든다. */
  charts?: LabChartBinding[];
  feedback: LabFeedback[];
  tradeoffs: LabTradeoff[];
}

/**
 * 🔴 **이 칸이 실제로 그리는 씬 목록.** 화면·테스트·조사 스크립트는 **전부 이것만 본다** —
 *    `spec.scene` 과 `spec.scenes` 를 각자 해석하면 칸마다 다르게 그려진다.
 *
 * 규칙은 둘뿐이다:
 *   ① **순서는 `scenes` 먼저, 그 다음 `scene`.** 병치 칸은 왼쪽에 세울 씬만 `scenes` 에 적고
 *      기존 `scene` 은 손대지 않는다 — 매핑이 두 벌로 갈라지지 않는다.
 *   ② **같은 `sceneId` 는 한 번만 그린다.** `scenes` 에 `scene` 과 같은 씬을 또 적어도 안전하다.
 *      (하나의 칸이 같은 씬을 두 번 그려야 할 이유는 없다. 그런 선언은 실수다.)
 *
 * 하위호환 — **`scenes` 를 안 쓰는 23칸에서 이 함수는 종전과 완전히 같은 것을 돌려준다:**
 *   · `scene` 만 있는 17칸 → `[spec.scene]` (원소 1개, **같은 객체 그대로**)
 *   · 씬이 없는 7칸 → `[]` → 화면은 종전대로 「내부 시각화 준비 중」
 */
export function labSceneBindings(spec: LabSpec): readonly LabSceneBinding[] {
  const list: LabSceneBinding[] = [];
  const seen = new Set<string>();
  for (const b of spec.scenes ?? []) {
    if (seen.has(b.sceneId)) continue;
    seen.add(b.sceneId);
    list.push(b);
  }
  if (spec.scene && !seen.has(spec.scene.sceneId)) list.push(spec.scene);
  return list;
}

/* ---------------- 조작 파라미터의 「선택지 수」 ---------------- */

/**
 * 🔴 **연속으로 보이는 것이 연속이 아니면 그 자체가 화면의 거짓말이다.**
 *
 * 사고(2026-08-24 · CEO 지적): 산화 「산화 온도」는 `min 920 · max 1100 · step 90` 이라
 * 학습자가 고를 수 있는 값이 **920 · 1000 · 1100 세 개뿐**이다. 물리가 그렇다 —
 * Deal-Grove 계수표에 그 세 온도만 있고 사이 값은 보간하면 지어내는 것이 된다(A15).
 * 그런데 화면은 그것을 **`<input type="range">` 슬라이더**로 그렸다. 손잡이를 끌어도
 * 거의 안 움직이니 CEO 는 「온도를 바꿀 수 없다」로 읽었다. **물리는 맞고 화면이 틀렸다.**
 *
 * 그래서 「이 파라미터가 실제로 낼 수 있는 값이 몇 개인가」를 **models 에서 한 번만 계산**한다.
 * UI 가 각자 `(max-min)/step+1` 을 다시 쓰면 두 벌이 갈라진다.
 *
 * ⛔ **이 함수는 `min`·`max`·`step` 을 바꾸지 않는다.** 그 셋은 물리 제약이고 여기서 읽기만 한다.
 */

/**
 * 🔴 이 수 **이하**면 화면이 슬라이더 대신 **선택 버튼**으로 그린다.
 *    6개 이상은 종전대로 슬라이더다 — 기준선을 흔들지 않는다.
 *    (교육적 판정이지 문헌에서 도출한 값이 아니다. 이견이 있으면 이 수만 바꾸면 된다.)
 */
export const DISCRETE_PARAM_MAX_OPTIONS = 5;

/** `min + k·step` 격자에서 벗어나지 않았는지 볼 때 쓰는 허용 오차(부동소수 잔재용). */
const GRID_EPS = 1e-6;

/** 부동소수 잔재(0.30000000000000004)를 걷어낸다. 값 자체는 바꾸지 않는다. */
function snapGrid(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(12)) : v;
}

/**
 * 이 파라미터가 낼 수 있는 값의 **개수** = `(max − min) / step + 1`.
 *
 * 🔴 격자가 딱 떨어지지 않으면(`(max−min)/step` 이 정수가 아니면) **`Infinity` 를 돌려준다.**
 *    「몇 개인지 말할 수 없다」와 「많다」를 같은 자리에 두는 것이 안전하다 — 그 경우 화면은
 *    종전대로 슬라이더를 그린다. 셀 수 없는 것을 버튼 N개로 그리면 그것이 새 거짓말이다.
 */
export function paramOptionCount(p: LabParam): number {
  // 🔴 명시 목록이 있으면 **그것이 정본이다.** `step` 격자보다 우선한다.
  if (p.options && p.options.length > 0) return p.options.length;
  const span = p.max - p.min;
  if (!Number.isFinite(span) || span < 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(p.step) || p.step <= 0) return Number.POSITIVE_INFINITY;
  if (span === 0) return 1;
  const k = span / p.step;
  if (Math.abs(k - Math.round(k)) > GRID_EPS) return Number.POSITIVE_INFINITY;
  return Math.round(k) + 1;
}

/** 선택지가 `DISCRETE_PARAM_MAX_OPTIONS` 개 이하인가 — 화면이 버튼으로 그릴 대상인가. */
export function isDiscreteParam(p: LabParam): boolean {
  return paramOptionCount(p) <= DISCRETE_PARAM_MAX_OPTIONS;
}

/**
 * 실제 선택지 값 목록. 🔴 **`min + i·step` 으로 만든다** — 누산(`v += step`)하면
 * 부동소수 오차가 쌓여 격자에서 벗어난다(`LabScope#sweepGrid` 와 같은 규율).
 * 선택지가 셀 수 없으면 빈 배열을 돌려준다.
 */
export function paramOptions(p: LabParam): number[] {
  if (p.options && p.options.length > 0) return [...p.options];
  const n = paramOptionCount(p);
  if (!Number.isFinite(n)) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(snapGrid(p.min + i * p.step));
  return out;
}

/* ---------------- 레지스트리 ---------------- */

const specs = new Map<string, LabSpec>();

const key = (processId: string, stage: LabStage): string => `${processId}/${stage}`;

export function registerLabs(list: LabSpec[]): void {
  for (const s of list) specs.set(key(s.processId, s.stage), s);
}

export function labSpec(processId: string, stage: LabStage): LabSpec | undefined {
  return specs.get(key(processId, stage));
}

export function registeredLabKeys(): string[] {
  return [...specs.keys()].sort();
}

/* ---------------- 판정 ---------------- */

export interface OutputVerdict {
  id: string;
  value: number;
  pass: boolean | null; // null = display 전용
  /**
   * 🔴 이 값이 **정의역 밖**인가 — 「성립할 수 없는 값」이라는 뜻이다.
   * 참이면 `pass` 는 절대 `true` 가 되지 않는다. 화면이 불합격 사유를 구분해 쓸 수 있도록 내보낸다.
   */
  outOfDomain: boolean;
}

export interface LabVerdict {
  /** judge 출력이 **전부** 합격일 때만 true. */
  pass: boolean;
  outputs: OutputVerdict[];
}

/**
 * 판정 입력값. **실값이거나 물리층이 돌려준 `Quantity`** 다.
 * 🔴 `Quantity` 를 그대로 넘기는 쪽이 정확하다 — 입력에 따라 변하는 정의역까지 물리층 판단으로 걸러진다.
 */
export type OutputValue = number | Quantity;

/** `Quantity` 로 넘어온 값인가. 🔴 `null` 을 `Quantity` 로 오인하지 않는다(`typeof null === 'object'`). */
function asQuantity(raw: OutputValue | undefined): Quantity | null {
  return raw !== null && typeof raw === 'object' ? raw : null;
}

function readValue(raw: OutputValue | undefined): number {
  if (typeof raw === 'number') return raw;
  return asQuantity(raw)?.value ?? Number.NaN;
}

/**
 * 「이 값이 성립할 수 있는가」. 두 곳을 본다 — **둘 중 하나라도 이탈이면 이탈이다.**
 *  ① `Quantity` 를 받았으면 **물리층이 스스로 내린 판단(`outOfRange`)이 정본**이다.
 *     정의역이 입력에 따라 변하는 출력까지 여기서 정확히 걸러진다.
 *  ② 실값만 받았으면 명세가 선언한 `domain` 으로 본다. 선언이 없으면 볼 것이 없다 —
 *     그 경우 이 함수는 거짓을 돌려주고, 판정은 종전대로 합격창만 본다.
 */
function isOutOfDomain(o: LabOutput, raw: OutputValue | undefined, v: number): boolean {
  if (asQuantity(raw)?.outOfRange === true) return true;
  const d = o.domain;
  if (!d) return false;
  return !Number.isFinite(v) || v < d[0] || v > d[1];
}

/**
 * 합격 판정.
 *
 * 🔴 **정의역 밖의 값은 어떤 합격창도 통과하지 못한다.** (2026-08-21 회귀 방지)
 *
 * 사고: `wafer/lab-applied` 의 σ_D 는 합격창이 `{ max: 1 }` **하나뿐**이라 아래쪽이 무한히 열려 있었다.
 * 그래서 **표준편차 −0.1 mm** 가 `−0.1 ≤ 1` 을 만족해 합격으로 계상됐다 — 물리층이 그 값을 이미
 * `outOfRange` 로 표시하고 있었는데도. 판정이 **실값만 받고 물리층의 판단을 버렸기 때문**이다.
 * 학습자가 **존재할 수 없는 조건으로 최고점을 받는** 결함이었다.
 *
 * 그래서 판정을 세 관문으로 나눈다: **유한한가 → 성립하는가 → 합격창 안인가.**
 * 가운데 관문이 없던 것이 결함의 전부다. 합격창의 숫자는 여기서 건드리지 않는다(D-041 · PLN 소관).
 */
export function evaluate(spec: LabSpec, outputs: Readonly<Record<string, OutputValue>>): LabVerdict {
  const rows: OutputVerdict[] = spec.outputs.map((o) => {
    const raw = outputs[o.id];
    const v = readValue(raw);
    const outOfDomain = isOutOfDomain(o, raw, v);
    if (o.role === 'display' || !o.pass) return { id: o.id, value: v, pass: null, outOfDomain };
    // 🔴 창 비교를 여기서 다시 쓰지 않는다. `formatJudged`(R-DISP-1)가 「표시값을 이 판정에
    //    넣으면 답이 같은가」를 묻는 함수이므로, **부등호가 갈리면 그 질문 자체가 무의미해진다.**
    //    그래서 창 비교는 `@/lib/format#inPassWindow` 한 벌만 둔다.
    const ok = Number.isFinite(v)
      && !outOfDomain                              // 🔴 성립할 수 없는 값은 합격을 받을 수 없다
      && inPassWindow(o.pass, v);
    return { id: o.id, value: v, pass: ok, outOfDomain };
  });
  const judged = rows.filter((r) => r.pass !== null);
  return { pass: judged.length > 0 && judged.every((r) => r.pass === true), outputs: rows };
}
