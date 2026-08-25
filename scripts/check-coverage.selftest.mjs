#!/usr/bin/env node
/* check-coverage.selftest.mjs — `check-coverage` 가 실제로 무엇을 잡는지 증명한다.
 *
 * 🔴 규율(R-7c): **탐지와 오탐없음을 둘 다 갖는다.**
 *    합격만 나오는 게이트도 위반이고 불합격만 나오는 게이트도 위반이다.
 *    ⓪ 은 「깨끗한 데이터에서 72칸 전부 🟢」를, ①~⑨ 는 「심은 공백이 잡힌다」를 증명한다.
 *
 * 🔴 이 픽스처가 존재하는 직접적 이유:
 *    2026-08-22 에 「있다고 세면서 안 돌리는」 장치로 두 번 데었다.
 *    그래서 여기는 **게이트 실행파일 자체를 자식 프로세스로 돌리는 케이스(⑧⑨)** 를 갖는다.
 *
 * 🔴 실트리를 건드리지 않는다. 전부 `os.tmpdir()` 안에서 논다
 *    (그래야 `verify.mjs` §X 의 「픽스처는 실트리를 오염시키지 않는다」가 성립한다).
 *
 * 종료코드: 0 통과 · 1 증명 실패 · 2 픽스처 고장
 */

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeAll, judgeSlot, emptyReason, V, THRESHOLDS } from './lib/coverage-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(__dirname, 'check-coverage.mjs');

function fixtureBroken(msg) {
  console.error(`\n⚠️  check-coverage.selftest 픽스처 고장 — ${msg}`);
  console.error('   증명하지 못했습니다. 「통과」가 아닙니다(종료코드 2).');
  process.exit(2);
}

/* ══════════════════════════════════════════════════════════════════════════
 * §1. 깨끗한 데이터셋 — 모든 칸이 🟢 여야 한다.
 *     🔴 여기가 🟢 를 못 내면 그 뒤의 「탐지했다」는 전부 의미가 없다
 *        (무엇을 넣어도 빨간 게이트는 탐지기가 아니다).
 * ══════════════════════════════════════════════════════════════════════════ */

const PIDS = ['alpha', 'beta'];
const SECTIONS = [
  'theory', 'overview', 'equipment', 'principle',
  'lab-basic', 'lab-applied', 'lab-advanced', 'test', 'result',
];
const LONG = '실제 본문이라고 가정하는 문장이다. '.repeat(12);   // 공백 제외 ≈ 200자
const MID = '장비 패널에 들어가는 설명 문장이다. '.repeat(8);

function goodProse() {
  return {
    title: '제목',
    blocks: [
      { type: 'h', level: 2, text: '소제목' },
      { type: 'p', text: LONG },
      { type: 'p', text: LONG },
      { type: 'list', ordered: false, items: ['항목 하나', '항목 둘', '항목 셋'] },
    ],
  };
}
function goodEquipProse() {
  return {
    title: '장비 제목',
    blocks: [
      { type: 'p', text: MID },
      { type: 'p', text: MID },
    ],
  };
}
function goodContent() {
  return {
    processId: 'x',
    theory: goodProse(),
    overview: goodProse(),
    equipment: goodEquipProse(),
    principle: goodEquipProse(),
    labels: { 'lbl.a': '가열 코일 설명', 'lbl.b': '배기 포트 설명' },
  };
}
function goodLabels() {
  return {
    processId: 'x',
    image: 'x.svg',
    viewBox: [0, 0, 100, 100],
    labels: [
      { id: 'a', ko: '가열 코일', en: 'Heater coil', descKey: 'lbl.a', anchor: [0, 0], leaderEnd: [1, 1], side: 'left' },
      { id: 'b', ko: '배기 포트', en: 'Exhaust port', descKey: 'lbl.b', anchor: [0, 0], leaderEnd: [1, 1], side: 'right' },
    ],
  };
}
function goodLab(tag) {
  return {
    titleKo: `${tag} 실습`, titleEn: `${tag} lab`, objectiveId: 'LO-X-01',
    params: [
      { id: 'p1', ko: '온도', en: 'Temperature' },
      { id: 'p2', ko: '시간', en: 'Time' },
    ],
    outputs: [
      { id: 'o1', ko: '두께', en: 'Thickness', role: 'judge' },
      { id: 'o2', ko: '속도', en: 'Rate', role: 'display' },
    ],
    feedback: [{ id: 'f1', ko: '너무 높습니다', en: 'Too high', tone: 'warn' }],
    tradeoffs: [{ ko: '속도와 균일도는 상충한다', en: 'Rate trades against uniformity' }],
  };
}
function goodQuestions(pid, n = THRESHOLDS.TEST_REQUIRED_ITEMS) {
  return {
    processId: pid,
    items: Array.from({ length: n }, (_, i) => ({
      id: `${pid}-q${String(i + 1).padStart(2, '0')}`,
      type: 'single', difficulty: 'mid', objectiveId: 'LO-X-01',
      stem: `${i + 1}번 문항의 발문이다.`,
      choices: ['보기 가', '보기 나', '보기 다', '보기 라'],
      answer: 0,
      explanation: '이 보기가 정답인 이유를 설명한다.',
      sourceId: 'S001', weakTopic: `주제-${i + 1}`,
    })),
  };
}

/** 완전히 채워진 데이터셋을 만든다. mutate(d) 로 한 군데만 망가뜨려 쓴다. */
function dataset(mutate) {
  const d = {
    processIds: [...PIDS],
    sectionIds: [...SECTIONS],
    prose: { ko: {}, en: {} },
    questions: { ko: {}, en: {} },
    equipment: {},
    labs: {},
  };
  for (const pid of PIDS) {
    for (const lang of ['ko', 'en']) {
      d.prose[lang][pid] = goodContent();
      d.questions[lang][pid] = goodQuestions(pid);
    }
    d.equipment[pid] = goodLabels();
    for (const st of ['lab-basic', 'lab-applied', 'lab-advanced']) {
      d.labs[`${pid}/${st}`] = goodLab(st);
    }
  }
  if (mutate) mutate(d);
  return d;
}

/* ══════════════════════════════════════════════════════════════════════════
 * §2. 케이스
 * ══════════════════════════════════════════════════════════════════════════ */

const results = [];
function check(name, ok, got) {
  results.push({ name, ok, got });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : `  → 실측: ${got}`}`);
}

/** 특정 칸의 롤업 판정을 뽑는다. */
function verdictOf(d, pid, sid) {
  const { roll } = judgeAll(d);
  const r = roll.find((x) => x.processId === pid && x.sectionId === sid);
  return r ?? fixtureBroken(`칸을 찾지 못함: ${pid}/${sid}`);
}

console.log('check-coverage.selftest — 「이 게이트가 없는 것을 실제로 보는가」를 증명합니다\n');

/* ── ⓪ 음성(오탐 없음) ─────────────────────────────────────────────────── */
{
  const { summary, roll } = judgeAll(dataset());
  const bad = roll.filter((r) => r.verdict !== V.FULL);
  check(
    `⓪ 음성 — 깨끗한 데이터 ${summary.total}칸 전부 🟢 (오탐 0)`,
    bad.length === 0 && summary.FULL === summary.total,
    bad.length === 0 ? `충족 ${summary.FULL}/${summary.total}`
      : bad.map((b) => `${b.processId}/${b.sectionId}=${b.verdict}(${b.detail})`).join(' | '),
  );
}

/* ── ① 양성: 산문 절을 통째로 비운다 ──────────────────────────────────── */
{
  const r = verdictOf(dataset((d) => { d.prose.ko.alpha.theory.blocks = []; }), 'alpha', 'theory');
  check('① 양성 — theory blocks[] 를 빈 배열로 → 🔴', r.verdict === V.EMPTY, `${r.verdict} (${r.detail})`);
}

/* ── ② 양성: 콘텐츠 파일 자체가 없다 ──────────────────────────────────── */
{
  const d = dataset((x) => { x.prose.ko.beta = null; x.prose.en.beta = null; });
  const r = verdictOf(d, 'beta', 'overview');
  check('② 양성 — 콘텐츠 파일 부재 → 🔴', r.verdict === V.EMPTY, `${r.verdict} (${r.detail})`);
}

/* ── ③ 양성: 자리표시자만 있는 칸 ─────────────────────────────────────── */
{
  const cases = [
    ['TODO', [{ type: 'p', text: 'TODO' }, { type: 'p', text: 'TBD' }]],
    ['준비 중', [{ type: 'p', text: '준비 중' }, { type: 'p', text: '작성 중입니다' }]],
    ['lorem ipsum', [{ type: 'p', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor.' }]],
    ['빈 문자열', [{ type: 'p', text: '' }, { type: 'p', text: '   ' }]],
    ['제목만', [{ type: 'h', level: 2, text: '개요' }, { type: 'h', level: 3, text: '원리' }]],
  ];
  for (const [label, blocks] of cases) {
    const r = verdictOf(dataset((d) => { d.prose.ko.alpha.overview.blocks = blocks; d.prose.en.alpha.overview.blocks = blocks; }), 'alpha', 'overview');
    check(`③ 양성 — 자리표시자만(${label}) → 🔴 (🟡 아님)`, r.verdict === V.EMPTY, `${r.verdict} (${r.detail})`);
  }
}

/* ── ④ 양성: 분량 미달은 🟡 이지 🔴 도 🟢 도 아니다 ───────────────────── */
{
  const r = verdictOf(dataset((d) => {
    const one = { title: '제목', blocks: [{ type: 'p', text: '한 문장뿐이다.' }] };
    d.prose.ko.alpha.theory = one; d.prose.en.alpha.theory = one;
  }), 'alpha', 'theory');
  check('④ 양성 — 실질 블록 1개·짧은 본문 → 🟡', r.verdict === V.SHORT, `${r.verdict} (${r.detail})`);
}

/* ── ⑤ 양성: ko 만 있고 en 이 비었다 → 채워짐으로 세지 않는다 ─────────── */
{
  const d = dataset((x) => { x.prose.en.alpha.theory.blocks = []; });
  const r = verdictOf(d, 'alpha', 'theory');
  const { summary } = judgeAll(d);
  check('⑤ 양성 — en 만 공백 → 롤업 🔴 + split 표시', r.verdict === V.EMPTY && r.split === true && summary.splitLang === 1,
    `${r.verdict} split=${r.split} splitLang=${summary.splitLang}`);
  check('⑤-b 음성 — 그때 ko 는 🟢 로 남는다', r.ko === V.FULL, `ko=${r.ko}`);
}

/* ── ⑥ 양성: A2 미달 — 문항 10개 요구인데 2개 ─────────────────────────── */
{
  const d = dataset((x) => {
    for (const lang of ['ko', 'en']) x.questions[lang].alpha = goodQuestions('alpha', 2);
  });
  const t = verdictOf(d, 'alpha', 'test');
  const res = verdictOf(d, 'alpha', 'result');
  check('⑥ 양성 — 문항 2/10 → test 🟡', t.verdict === V.SHORT && /2\/10/.test(t.detail), `${t.verdict} (${t.detail})`);
  check('⑥-b 양성 — 그 여파로 result 도 🟡', res.verdict === V.SHORT, `${res.verdict} (${res.detail})`);
}
{
  const d = dataset((x) => { x.questions.ko.beta = null; x.questions.en.beta = null; });
  check('⑥-c 양성 — 문항 파일 부재 → test 🔴 · result 🔴',
    verdictOf(d, 'beta', 'test').verdict === V.EMPTY && verdictOf(d, 'beta', 'result').verdict === V.EMPTY,
    `${verdictOf(d, 'beta', 'test').verdict}/${verdictOf(d, 'beta', 'result').verdict}`);
}

/* ── ⑦ 양성: 껍데기 랩 스펙 — 등록은 돼 있는데 내용이 없다 ────────────── */
{
  const shell = { titleKo: '랩', titleEn: 'Lab', objectiveId: 'LO', params: [], outputs: [], feedback: [], tradeoffs: [] };
  const r = verdictOf(dataset((d) => { d.labs['alpha/lab-basic'] = shell; }), 'alpha', 'lab-basic');
  check('⑦ 양성 — 껍데기 랩(params 0 · 판정출력 0) → 🔴', r.verdict === V.EMPTY, `${r.verdict} (${r.detail})`);

  const noJudge = { ...goodLab('x'), outputs: [{ id: 'o', ko: '값', en: 'v', role: 'display' }] };
  const r2 = verdictOf(dataset((d) => { d.labs['alpha/lab-applied'] = noJudge; }), 'alpha', 'lab-applied');
  check('⑦-b 양성 — 판정 출력만 0 → 🔴', r2.verdict === V.EMPTY, `${r2.verdict} (${r2.detail})`);

  const noEn = { ...goodLab('x'), params: [{ id: 'p', ko: '온도', en: '' }, { id: 'q', ko: '시간', en: 'Time' }] };
  const r3 = verdictOf(dataset((d) => { d.labs['alpha/lab-advanced'] = noEn; }), 'alpha', 'lab-advanced');
  check('⑦-c 양성 — 랩 파라미터의 en 만 공백 → 🟡 + split', r3.verdict === V.SHORT && r3.split === true, `${r3.verdict} split=${r3.split}`);

  const r4 = verdictOf(dataset((d) => { delete d.labs['beta/lab-basic']; }), 'beta', 'lab-basic');
  check('⑦-d 양성 — 랩 미등록 → 🔴', r4.verdict === V.EMPTY, `${r4.verdict} (${r4.detail})`);
}

/* ── ⑧ 양성: equipment 2축 — 한쪽만 서면 🟡, 둘 다 없으면 🔴 ──────────── */
{
  const onlyFig = verdictOf(dataset((d) => {
    for (const l of ['ko', 'en']) { d.prose[l].alpha.equipment.blocks = []; d.prose[l].alpha.labels = {}; }
  }), 'alpha', 'equipment');
  check('⑧ 양성 — 도해만 있고 산문 0 → 🟡', onlyFig.verdict === V.SHORT, `${onlyFig.verdict} (${onlyFig.detail})`);

  const neither = verdictOf(dataset((d) => {
    d.equipment.alpha = null;
    for (const l of ['ko', 'en']) { d.prose[l].alpha.principle.blocks = []; }
  }), 'alpha', 'principle');
  check('⑧-b 양성 — 도해도 산문도 0 → 🔴', neither.verdict === V.EMPTY, `${neither.verdict} (${neither.detail})`);

  const noDesc = verdictOf(dataset((d) => {
    for (const l of ['ko', 'en']) d.prose[l].beta.labels = { 'lbl.a': 'TODO', 'lbl.b': '' };
  }), 'beta', 'equipment');
  check('⑧-c 양성 — 라벨 설명이 자리표시자/공백 → 🟡', noDesc.verdict === V.SHORT && /라벨 설명 공백 2\/2/.test(noDesc.detail),
    `${noDesc.verdict} (${noDesc.detail})`);
}

/* ── ⑨ 자리표시자 사전 자체의 음성 검사 ───────────────────────────────── */
{
  const shouldFlag = ['TODO', 'tbd', '  준비 중  ', '작성 중', 'Lorem ipsum', 'N/A', '(placeholder)', '…', '', '   ', '추후 보완'];
  const shouldNot = ['산화막은 실리콘 표면에서 자란다.', 'Thermal oxidation grows SiO2.', '온도 1000 °C', '3.14', 'CMP'];
  const missA = shouldFlag.filter((s) => emptyReason(s) === null);
  const missB = shouldNot.filter((s) => emptyReason(s) !== null);
  check(`⑨ 양성 — 자리표시자 ${shouldFlag.length}종 전부 탐지`, missA.length === 0, `미탐: ${JSON.stringify(missA)}`);
  check(`⑨-b 음성 — 정상 문장 ${shouldNot.length}종 오탐 0`, missB.length === 0, `오탐: ${JSON.stringify(missB)}`);
}

/* ── ⑩ 절 판정기 전수 배선 — 9절 모두 실제 판정기를 갖는가 ───────────── */
{
  const unwired = SECTIONS.filter((sid) => /알 수 없는 절/.test(judgeSlot(sid, { lang: 'ko', processId: 'x', sectionId: sid }).detail));
  check(`⑩ 배선 — 9절 전부 판정기 존재`, unwired.length === 0, `미배선: ${unwired.join(', ')}`);
}

/* ══════════════════════════════════════════════════════════════════════════
 * §3. 끝에서 끝까지 — 게이트 실행파일 자체를 돌린다.
 *     🔴 본체 함수만 시험하면 「보고·종료코드·플래그 배선」이 증명되지 않는다.
 * ══════════════════════════════════════════════════════════════════════════ */

let tmp = null;
try {
  tmp = mkdtempSync(path.join(tmpdir(), 'cov-selftest-'));

  const runGate = (args) => {
    try {
      const out = execFileSync('node', [GATE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status ?? -1, out: e.stdout ?? '' };
    }
  };
  const lastJson = (out) => {
    const line = out.trim().split('\n').at(-1);
    try { return JSON.parse(line); } catch { return null; }
  };

  /* ⑪ 깨끗한 데이터셋 → exit 0 */
  const cleanFile = path.join(tmp, 'clean.json');
  writeFileSync(cleanFile, JSON.stringify(dataset()));
  const clean = runGate([`--data=${cleanFile}`, '--json']);
  const cj = lastJson(clean.out);
  check('⑪ E2E 음성 — 깨끗한 데이터셋에서 exit 0 · empty 0 · short 0',
    clean.code === 0 && cj !== null && cj.empty === 0 && cj.short === 0 && cj.ratio === 1,
    `code=${clean.code} json=${JSON.stringify(cj)}`);

  /* ⑫ 한 칸만 비움 → exit 1 이고 그 칸이 지목된다 */
  const dirtyFile = path.join(tmp, 'dirty.json');
  writeFileSync(dirtyFile, JSON.stringify(dataset((d) => {
    for (const l of ['ko', 'en']) d.prose[l].alpha.theory.blocks = [];
  })));
  const dirty = runGate([`--data=${dirtyFile}`, '--json']);
  const dj = lastJson(dirty.out);
  check('⑫ E2E 양성 — 한 칸만 비워도 **exit 1** (차단 게이트)',
    dirty.code === 1 && dj !== null && dj.empty === 1,
    `code=${dirty.code} json=${JSON.stringify(dj)}`);
  check('⑫-b E2E — 보고에 비어 있는 칸 이름이 찍힌다',
    /alpha\/theory/.test(dirty.out) && /🔴 비어 있음/.test(dirty.out),
    '보고에 alpha/theory 가 없음');
  check('⑫-c E2E — 「못 보는 것」 절이 항상 출력된다',
    /이 계측기가 못 보는 것/.test(dirty.out) && /「분량이 있다」는 「내용이 옳다」가 아니다/.test(dirty.out),
    '사각지대 절 누락');

  /* ⑬ 계측 실패는 1 이 아니라 2 다 */
  const missing = runGate([`--data=${path.join(tmp, 'nope.json')}`]);
  check('⑬ E2E — 데이터를 못 읽으면 **exit 2**(계측 실패 ≠ 판정 실패)', missing.code === 2, `code=${missing.code}`);

  const emptyCat = path.join(tmp, 'nopid.json');
  writeFileSync(emptyCat, JSON.stringify({ processIds: [] }));
  const noPid = runGate([`--data=${emptyCat}`]);
  check('⑬-b E2E — 공정 목록이 0이면 「72칸 전부 통과」가 아니라 exit 2', noPid.code === 2, `code=${noPid.code}`);

  /* ⑭ fs 수집기까지 태운다 — --root 로 가짜 트리를 읽힌다 */
  const root = path.join(tmp, 'approot');
  mkdirSync(path.join(root, 'src/content/ko/questions'), { recursive: true });
  mkdirSync(path.join(root, 'src/content/en/questions'), { recursive: true });
  mkdirSync(path.join(root, 'public/assets/equipment/alpha'), { recursive: true });
  writeFileSync(path.join(root, 'src/content/catalog.json'), JSON.stringify({
    schemaVersion: 1, sectionOrder: SECTIONS, tracks: [],
    processes: { alpha: { ko: 'ㄱ', en: 'A', order: 1, status: 'active', sections: SECTIONS } },
  }));
  for (const lang of ['ko', 'en']) {
    writeFileSync(path.join(root, `src/content/${lang}/alpha.json`), JSON.stringify(goodContent()));
    writeFileSync(path.join(root, `src/content/${lang}/questions/alpha.json`), JSON.stringify(goodQuestions('alpha')));
  }
  writeFileSync(path.join(root, 'public/assets/equipment/alpha/labels.json'), JSON.stringify(goodLabels()));
  const labsFile = path.join(tmp, 'labs.json');
  writeFileSync(labsFile, JSON.stringify({
    'alpha/lab-basic': goodLab('기초'),
    'alpha/lab-applied': goodLab('응용'),
    'alpha/lab-advanced': goodLab('심화'),
  }));
  const fsRun = runGate([`--root=${root}`, `--labs=${labsFile}`, '--json']);
  const fj = lastJson(fsRun.out);
  check('⑭ E2E 음성 — fs 수집기 경로(--root)로도 9칸 전부 🟢 · exit 0',
    fsRun.code === 0 && fj !== null && fj.total === 9 && fj.full === 9,
    `code=${fsRun.code} json=${JSON.stringify(fj)}`);

  /* ⑭-b 그 트리에서 파일 하나를 지우면 잡는가 — 「파일 부재」가 이 게이트의 존재 이유다 */
  rmSync(path.join(root, 'src/content/ko/alpha.json'));
  const fsRun2 = runGate([`--root=${root}`, `--labs=${labsFile}`, '--json']);
  const fj2 = lastJson(fsRun2.out);
  check('⑭-b E2E 양성 — ko 콘텐츠 파일을 지우면 exit 1 · 🔴 2칸(theory·overview)',
    fsRun2.code === 1 && fj2 !== null && fj2.empty === 2 && fj2.splitLang >= 2,
    `code=${fsRun2.code} json=${JSON.stringify(fj2)}`);

  rmSync(path.join(root, 'src/content/ko/questions/alpha.json'));
  rmSync(path.join(root, 'src/content/en/questions/alpha.json'));
  const fsRun3 = runGate([`--root=${root}`, `--labs=${labsFile}`, '--json']);
  const fj3 = lastJson(fsRun3.out);
  check('⑭-c E2E 양성 — 문항 파일을 전부 지우면 test·result 가 🔴 로 추가된다',
    fsRun3.code === 1 && fj3 !== null && fj3.empty === 4,
    `code=${fsRun3.code} json=${JSON.stringify(fj3)}`);
} catch (e) {
  fixtureBroken(String(e?.stack ?? e));
} finally {
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 정리 실패는 판정에 영향 없음 */ } }
}

/* ══════════════════════════════════════════════════════════════════════════
 * §4. 결말
 * ══════════════════════════════════════════════════════════════════════════ */

const failed = results.filter((r) => !r.ok);
console.log('\n  ── 🔴 이 픽스처가 증명하지 못하는 것 ──');
console.log('  · **실제 랩 모듈의 vite 적재 경로**는 증명하지 않는다(⑭ 는 `--labs` 주입이다).');
console.log('    그 경로는 게이트를 실트리에서 한 번 돌려야 확인된다 — `npm run check:coverage`.');
console.log('  · **기준값이 옳은지**는 증명하지 않는다. 300자·10문항이 교육적으로 맞는 선인지는 기획팀 판단이다.');

if (failed.length > 0) {
  console.error(`\n❌ check-coverage.selftest 실패 — ${results.length}건 중 ${failed.length}건이 증명되지 않았다`);
  for (const f of failed) console.error(`   · ${f.name} → ${f.got}`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ check-coverage.selftest 통과 — ${results.length}건 전부 증명됨 (양성·음성·자리표시자·E2E 포함)`);
  process.exitCode = 0;
}
