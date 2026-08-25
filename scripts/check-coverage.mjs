#!/usr/bin/env node
/* check-coverage.mjs — 「8공정 × 9절 = 72칸이 실제로 차 있는가」를 잰다.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 왜 이 게이트가 생겼는가 (2026-08-22)
 *
 *   그날 게이트가 32개였다. 슬라이더가 물리적으로 옳은지, 숫자가 반올림에서
 *   뒤집히는지, 씬이 테마를 따라가는지 — 전부 쟀다.
 *   **그런데 그 옆의 이론 절이 통째로 비어 있는 것을 32개 중 하나도 못 봤다.**
 *   그 상태에서 「PENDING 0 · 출시 게이트 해제」가 CEO 께 올라갔다.
 *
 *   기존 게이트는 전부 **있는 것이 옳은가**를 묻는다. 없는 것에는 물을 대상이
 *   없으므로 조용히 통과한다. `check-questions` 조차 디렉터리가 통째로
 *   없으면 `exit 0` 이고, 파일 8개 중 3개만 있어도 있는 3개만 검사한다.
 *
 *   **없는 것을 못 보는 검사는 검사가 아니다.** 이 게이트는 그 반대로 짰다 —
 *   먼저 카탈로그에서 **있어야 할 칸 전부**를 만들고, 그 다음 각 칸을 채운다.
 *   원천이 없으면 그 자리가 🔴 로 남는다.
 *
 * ── 판정 3상태 ────────────────────────────────────────────────────────────
 *   🟢 채워짐   본문이 실재하고 최소 분량을 넘는다
 *   🔴 비어 있음 콘텐츠 0 또는 자리표시자만
 *   🟡 미달     있으나 기준 미달 (예: 문항 10개 요구인데 2개 / 2축 중 1축만)
 *
 * ── 검사 규칙 ─────────────────────────────────────────────────────────────
 *   C1  theory·overview   — `src/content/{lang}/{pid}.json` 의 산문 블록
 *   C2  equipment·principle — 2축: 장비 도해 라벨(DSN) + 산문 블록(PLN)
 *   C3  lab-basic/applied/advanced — 랩 스펙의 params·판정출력·피드백·상충
 *   C4  test              — A2 대조: 공정당 문항 10개 · stem·해설 실재
 *   C5  result            — 결과 화면의 재료(weakTopic·해설·목표) 실재
 *   C6  ko/en 별도 집계   — 한쪽만 있으면 그 칸을 「채워짐」으로 세지 않는다
 *
 * ── 🔴 차단 게이트다 ──────────────────────────────────────────────────────
 *   빈 칸(🔴) 또는 미달 칸(🟡)이 하나라도 있으면 **exit 1**.
 *   비차단으로 만들면 2026-08-22 와 같은 일이 또 난다.
 *   지금 대량 실패가 나는 것이 **정확한 상태**다. 줄이려고 기준을 낮추지 마라.
 *   기준값의 정본은 `scripts/lib/coverage-core.mjs` §1 이다.
 *
 * ── 종료코드 ──────────────────────────────────────────────────────────────
 *   0 전 칸 🟢 · 1 🔴 또는 🟡 존재 · 2 계측 실패(카탈로그/랩 모듈을 못 읽음)
 *   🔴 2 는 「재지 못했다」이지 「위반을 찾았다」가 아니다. 0 처럼 넘기지 마라.
 *
 * ── 사용법 ────────────────────────────────────────────────────────────────
 *   node scripts/check-coverage.mjs
 *   node scripts/check-coverage.mjs --json          마지막 줄에 요약 JSON
 *   node scripts/check-coverage.mjs --data=<파일>   데이터셋 통째 주입(픽스처)
 *   node scripts/check-coverage.mjs --root=<디렉터리> --labs=<파일>
 *                                                   fs 수집기까지 태우는 픽스처
 * ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  judgeAll, SECTION_IDS, LANGS, V, MARK, THRESHOLDS, BLIND_SPOTS,
} from './lib/coverage-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

const argOf = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const AS_JSON = process.argv.includes('--json');
const DATA_FILE = argOf('data');
const ROOT = argOf('root') ? path.resolve(argOf('root')) : APP_ROOT;
const LABS_FILE = argOf('labs');

/* ── 계측 실패 전용 경로 ───────────────────────────────────────────────────
 * 🔴 「0건 통과」와 「아무것도 못 봤다」는 다른 명제다. 수치를 내지 않고 멈춘다. */
function instrumentFailed(msg, extra = []) {
  console.error(`\n⚠️  check-coverage 계측 실패 — ${msg}`);
  for (const e of extra) console.error(`   ${e}`);
  console.error('   🔴 이 실행의 판정은 전부 신뢰할 수 없습니다(종료코드 2 ≠ 1).');
  process.exit(2);
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════════════
 * §A. 수집 — 「있어야 할 칸」을 먼저 만들고, 없는 원천은 null 로 남긴다.
 *      🔴 여기서 파일 부재를 조용히 건너뛰면 이 게이트가 존재할 이유가 사라진다.
 * ══════════════════════════════════════════════════════════════════════════ */

function collectCatalog() {
  const file = path.join(ROOT, 'src/content/catalog.json');
  if (!existsSync(file)) instrumentFailed(`catalog.json 없음: ${file}`);
  const cat = readJson(file);
  if (!cat) instrumentFailed('catalog.json 파싱 실패');
  const processIds = Object.keys(cat.processes ?? {})
    .sort((a, b) => (cat.processes[a].order ?? 0) - (cat.processes[b].order ?? 0));
  if (processIds.length === 0) instrumentFailed('catalog.processes 가 비어 있습니다');
  const sectionIds = Array.isArray(cat.sectionOrder) && cat.sectionOrder.length > 0
    ? cat.sectionOrder : SECTION_IDS;
  return { cat, processIds, sectionIds };
}

function collectFiles(processIds) {
  const prose = {}; const questions = {}; const equipment = {};
  for (const lang of LANGS) {
    prose[lang] = {}; questions[lang] = {};
    for (const pid of processIds) {
      const pf = path.join(ROOT, `src/content/${lang}/${pid}.json`);
      prose[lang][pid] = existsSync(pf) ? readJson(pf) : null;
      const qf = path.join(ROOT, `src/content/${lang}/questions/${pid}.json`);
      questions[lang][pid] = existsSync(qf) ? readJson(qf) : null;
    }
  }
  for (const pid of processIds) {
    const ef = path.join(ROOT, `public/assets/equipment/${pid}/labels.json`);
    equipment[pid] = existsSync(ef) ? readJson(ef) : null;
  }
  return { prose, questions, equipment };
}

/** 랩 스펙에서 판정에 필요한 것만 뽑는다(함수·클로저는 직렬화하지 않는다). */
function liteSpec(s) {
  if (!s) return null;
  const pick = (arr, keys) => (Array.isArray(arr) ? arr : []).map((x) => {
    const o = {};
    for (const k of keys) o[k] = x?.[k];
    return o;
  });
  return {
    titleKo: s.titleKo, titleEn: s.titleEn, objectiveId: s.objectiveId,
    params: pick(s.params, ['id', 'ko', 'en']),
    outputs: pick(s.outputs, ['id', 'ko', 'en', 'role']),
    feedback: pick(s.feedback, ['id', 'ko', 'en', 'tone']),
    tradeoffs: pick(s.tradeoffs, ['ko', 'en']),
  };
}

const LAB_STAGES = ['lab-basic', 'lab-applied', 'lab-advanced'];

/**
 * 랩은 TS 모듈이므로 vite SSR 로 적재한다(`check-a12c.mjs`·`check-passwindow.mjs` 와 같은 방식).
 * 🔴 `registry` 부수효과 → `physics.registerPhysics()` → `labs.registerAllLabs()` 순서가 필수다.
 *    빠뜨리면 레지스트리가 빈 채로 「24칸 전부 미등록」이라는 **거짓 판정**이 나온다.
 *    그래서 등록 결과가 0이면 판정이 아니라 **계측 실패(2)** 로 낸다.
 */
async function collectLabs(processIds) {
  if (LABS_FILE) {
    const injected = readJson(path.resolve(LABS_FILE));
    if (!injected) instrumentFailed(`--labs 파일을 읽지 못했습니다: ${LABS_FILE}`);
    return injected;
  }
  let server = null;
  try {
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: false,
      root: ROOT,
      appType: 'custom',
      server: { middlewareMode: true, hmr: false },
      resolve: { alias: { '@': path.join(ROOT, 'src') } },
      logLevel: 'error',
    });
    const physics = await server.ssrLoadModule('/src/models/physics/index.ts');
    const labs = await server.ssrLoadModule('/src/models/labs/index.ts');
    const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');
    physics.registerPhysics();
    labs.registerAllLabs();

    const keys = typeof specMod.registeredLabKeys === 'function' ? specMod.registeredLabKeys() : null;
    if (Array.isArray(keys) && keys.length === 0) {
      await server.close();
      instrumentFailed('랩 레지스트리가 0건입니다',
        ['registerAllLabs() 가 실제로 등록했는지 확인하십시오. 0건은 「랩이 없다」가 아니라 계측 실패입니다.']);
    }

    const out = {};
    for (const pid of processIds) {
      for (const stage of LAB_STAGES) {
        out[`${pid}/${stage}`] = liteSpec(specMod.labSpec(pid, stage));
      }
    }
    await server.close();
    return out;
  } catch (err) {
    if (server) { try { await server.close(); } catch { /* 이미 닫힘 */ } }
    instrumentFailed('랩 모듈 적재 실패', [String(err)]);
    return {};
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * §B. 보고
 * ══════════════════════════════════════════════════════════════════════════ */

const SHORT_HEAD = {
  theory: 'theo', overview: 'over', equipment: 'equi', principle: 'prin',
  'lab-basic': 'L-기초', 'lab-applied': 'L-응용', 'lab-advanced': 'L-심화',
  test: 'test', result: 'resu',
};

/** 한글·이모지는 터미널에서 폭 2다. 1로 세면 표가 한 칸씩 어긋난다. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u;
function pad(s, n) {
  const w = [...String(s)].reduce((a, c) => a + (WIDE.test(c) ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
}

function printMatrix(processIds, sectionIds, roll) {
  console.log('\n  ── 공정 × 절 매트릭스 (ko·en 중 **나쁜 쪽**) ──');
  console.log(`  ${pad('공정', 12)}${sectionIds.map((s) => pad(SHORT_HEAD[s] ?? s, 8)).join('')}🟢/${sectionIds.length}`);
  for (const pid of processIds) {
    const row = sectionIds.map((sid) => {
      const r = roll.find((x) => x.processId === pid && x.sectionId === sid);
      const m = MARK[r?.verdict ?? V.EMPTY];
      return pad(r?.split ? `${m}*` : m, 8);
    }).join('');
    const full = sectionIds.filter((sid) => roll.find((x) => x.processId === pid && x.sectionId === sid)?.verdict === V.FULL).length;
    console.log(`  ${pad(pid, 12)}${row}${full}`);
  }
  console.log('  * = ko 와 en 판정이 다른 칸');
}

function printA2(processIds, data) {
  console.log(`\n  ── A2 대조 · 공정별 문항 수 (요구 ${THRESHOLDS.TEST_REQUIRED_ITEMS}) ──`);
  console.log(`  ${pad('공정', 12)}${pad('ko', 6)}${pad('en', 6)}판정`);
  for (const pid of processIds) {
    const n = (lang) => {
      const s = data.questions?.[lang]?.[pid];
      return s === null || s === undefined ? '—' : String((s.items ?? []).length);
    };
    const ko = n('ko'); const en = n('en');
    const need = THRESHOLDS.TEST_REQUIRED_ITEMS;
    const ok = (v) => v !== '—' && Number(v) >= need;
    const mark = ok(ko) && ok(en) ? `${MARK.FULL} 충족`
      : (ko === '—' && en === '—') ? `${MARK.EMPTY} 원천 없음`
        : `${MARK.SHORT} 미달`;
    console.log(`  ${pad(pid, 12)}${pad(ko, 6)}${pad(en, 6)}${mark}`);
  }
}

function printList(title, rows) {
  if (rows.length === 0) return;
  console.log(`\n  ── ${title} (${rows.length}칸) ──`);
  for (const r of rows) {
    console.log(`  ${pad(`${r.processId}/${r.sectionId}`, 26)}${r.detail}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * §C. 본체
 * ══════════════════════════════════════════════════════════════════════════ */

async function main() {
  console.log('check-coverage — 「8공정 × 9절 = 72칸이 실제로 차 있는가」를 잽니다');
  console.log('  🔴 이 게이트만이 「없는 것」을 봅니다. 다른 게이트는 있는 것이 옳은지만 봅니다.');

  let data;
  if (DATA_FILE) {
    data = readJson(path.resolve(DATA_FILE));
    if (!data) instrumentFailed(`--data 파일을 읽지 못했습니다: ${DATA_FILE}`);
    if (!Array.isArray(data.processIds) || data.processIds.length === 0) {
      instrumentFailed('--data 에 processIds 가 없습니다');
    }
    data.sectionIds = data.sectionIds ?? SECTION_IDS;
  } else {
    const { processIds, sectionIds } = collectCatalog();
    const files = collectFiles(processIds);
    const labs = await collectLabs(processIds);
    data = { processIds, sectionIds, ...files, labs };
  }

  const { slots, byLang, roll, summary } = judgeAll(data);

  const pct = (summary.ratio * 100).toFixed(1);
  console.log(`\n  🔵 **전체 충족률 ${summary.FULL}/${summary.total} = ${pct} %**  (🟢${summary.FULL} 🟡${summary.SHORT} 🔴${summary.EMPTY})`);

  printMatrix(data.processIds, data.sectionIds, roll);

  console.log(`\n  ── 언어별 집계 (측정 ${slots.length}건 = ${summary.total}칸 × ${LANGS.length}언어) ──`);
  for (const lang of LANGS) {
    const c = byLang[lang];
    const p = c.total === 0 ? '0.0' : ((c.FULL / c.total) * 100).toFixed(1);
    console.log(`  ${pad(lang, 6)}🟢${c.FULL} 🟡${c.SHORT} 🔴${c.EMPTY}  → ${p} %`);
  }
  console.log(`  ko/en 판정이 갈린 칸: ${summary.splitLang}칸`
    + (summary.splitLang === 0 ? '' : ' 🔴 한쪽만 채워진 칸은 채워짐으로 세지 않았습니다'));

  printA2(data.processIds, data);

  const empties = roll.filter((r) => r.verdict === V.EMPTY);
  const shorts = roll.filter((r) => r.verdict === V.SHORT);
  printList('🔴 비어 있음', empties);
  printList('🟡 미달', shorts);

  console.log('\n  ── 🔴 이 계측기가 못 보는 것 ──');
  for (const b of BLIND_SPOTS) console.log(`  · ${b}`);

  const failing = empties.length > 0 || shorts.length > 0;
  if (failing) {
    /* 🔴 실패 문구는 stderr 로 낸다 — stdout 의 **마지막 줄**은 언제나 --json 요약이어야 한다.
     *    (형제 픽스처 ⑪⑫⑭ 가 그 마지막 줄을 파싱해 게이트 배선을 증명한다.) */
    console.error(`\n❌ check-coverage 실패 — ${summary.total}칸 중 🔴${empties.length} · 🟡${shorts.length} (충족 ${summary.FULL}칸 · ${pct} %)`);
    console.error('   🔴 이 수가 지금 제품의 정확한 상태입니다. 기준을 낮춰 줄이지 마십시오.');
    console.error('   담당: 산문(theory·overview·equipment·principle) = 기획팀(PLN) · 도해 = 디자인팀(DSN) · 랩/문항 = 개발팀(DEV)');
  } else {
    console.log(`\n✅ check-coverage 통과 — ${summary.total}칸 전부 🟢 (측정 ${slots.length}건 · ko/en 갈림 0)`);
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      gate: 'check-coverage',
      total: summary.total, full: summary.FULL, short: summary.SHORT, empty: summary.EMPTY,
      ratio: Number(summary.ratio.toFixed(4)), splitLang: summary.splitLang,
      byLang, measurements: slots.length,
    }));
  }

  process.exitCode = failing ? 1 : 0;
}

main().catch((err) => { instrumentFailed('게이트 자체가 예외로 중단', [String(err?.stack ?? err)]); });
