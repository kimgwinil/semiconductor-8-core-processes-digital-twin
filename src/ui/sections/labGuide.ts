import type { Lang } from '@/content/types';
import type { LabGuide, LabStage } from '@/models/labs/spec';

/**
 * 🔴 **실습 칸 안내문 로더** — PLN 납품 JSON(`src/content/lab-guide/<lang>/<processId>.json`)을
 *    읽어 `lang`×`processId`×`stage` 로 찾아 준다.
 *
 * 🔴 2026-08-24 4차 — **`ko`/`en` 하위 폴더로 분리했다.** 종전에는 `lang` 을 아예 받지 않고
 *    `lab-guide/<processId>.json` 하나만 읽어, 화면 언어를 English 로 바꿔도 이 안내문(파란
 *    박스)만 한국어로 남아 있었다(직접 브라우저로 확인 — 2026-08-24 · 자동 게이트는 이 칸을
 *    "충족"으로 오판했다. `check-coverage` 는 랩 칸의 판정·조작 요소만 보고 안내문 텍스트
 *    자체의 언어는 검사하지 않는다). 다른 콘텐츠(`src/content/{ko,en}/<processId>.json`)와
 *    같은 폴더 관례로 맞췄다.
 *
 * 왜 이 모양인가:
 *  · **문구를 코드에 옮겨 적지 않는다.** JSON 을 그대로 import 하므로 문자열이 한 글자도 바뀌지
 *    않는다(PLN A-3). 문구 수정은 PLN 이 JSON 을 고쳐서 한다 — DEV 가 손보지 않는다.
 *  · **공정 ID 를 코드에 나열하지 않는다.** `import.meta.glob` 으로 디렉터리를 통째로 읽고
 *    파일명에서 키를 만든다. 공정이 늘어도 이 파일은 그대로다(카탈로그 복제 금지 C1).
 *  · 파일이 없거나 모양이 다르면 **`undefined` 를 돌려준다.** 화면은 안내 영역을 그리지 않고
 *    종전과 같은 DOM 을 낸다(PLN A-2). 급조한 문구로 빈자리를 메우지 않는다.
 */
const modules: Record<string, unknown> = import.meta.glob('../../content/lab-guide/*/*.json', {
  eager: true,
});

/** 모듈 경로에서 `<lang>`·`<processId>` 를 뽑는다 — `…/lab-guide/en/oxidation.json` → `en`·`oxidation`. */
function langAndProcessIdOf(modulePath: string): { lang: string; processId: string } {
  const parts = modulePath.split('/');
  const processId = (parts.at(-1) ?? '').replace(/\.json$/, '');
  const lang = parts.at(-2) ?? '';
  return { lang, processId };
}

/** 🔴 셋 다 문자열일 때만 안내문으로 인정한다. 하나라도 없으면 그 칸은 안내 없음이다. */
function isLabGuide(v: unknown): v is LabGuide {
  if (typeof v !== 'object' || v === null) return false;
  const rec: Record<string, unknown> = { ...v };
  return typeof rec['intro'] === 'string'
    && typeof rec['goal'] === 'string'
    && typeof rec['passHint'] === 'string';
}

/** `{ [lang]: { [processId]: { [stage]: LabGuide } } }` 로 한 번만 펼친다. */
const table: Map<string, Map<string, Map<string, LabGuide>>> = (() => {
  const out = new Map<string, Map<string, Map<string, LabGuide>>>();
  for (const [modulePath, mod] of Object.entries(modules)) {
    if (typeof mod !== 'object' || mod === null) continue;
    const wrapper: Record<string, unknown> = { ...mod };
    const body = wrapper['default'];
    if (typeof body !== 'object' || body === null) continue;
    const stages = new Map<string, LabGuide>();
    for (const [stage, guide] of Object.entries({ ...body })) {
      if (isLabGuide(guide)) stages.set(stage, guide);
    }
    if (stages.size === 0) continue;
    const { lang, processId } = langAndProcessIdOf(modulePath);
    if (!out.has(lang)) out.set(lang, new Map());
    out.get(lang)!.set(processId, stages);
  }
  return out;
})();

/** 이 칸의 안내문. 없으면 `undefined` — 화면은 안내 영역을 그리지 않는다. */
export function labGuide(processId: string, stage: LabStage, lang: Lang): LabGuide | undefined {
  return table.get(lang)?.get(processId)?.get(stage)
    ?? (lang === 'ja' ? table.get('en')?.get(processId)?.get(stage) : undefined);
}
