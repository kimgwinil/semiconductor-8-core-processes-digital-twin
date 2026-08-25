#!/usr/bin/env node
/**
 * check-a12c 형제 픽스처 — **게이트가 실제로 탐지하는지 증명한다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 필요한가
 * ══════════════════════════════════════════════════════════════════════════════
 *   「있다고 세면서 안 돌리는 장치」가 이 프로젝트에서 반복해 난 사고다.
 *   그래서 수가 **움직여야 할 때 움직이는지**를 변이로 증명한다(명세 AC-C3 · AC-C4 · AC-C7).
 *
 *   🔴 2026-08-22 A12 채택으로 게이트가 **차단 게이트**가 되었다. 그래서 이 픽스처가
 *      지는 짐이 하나 늘었다 — **차단 조건이 실제로 차단하는지**도 증명해야 한다:
 *        Ⓡ0 기준선 파일이 PLN 실측값과 일치한다(**기준선을 몰래 내리는 것을 잡는다**)
 *        Ⓡ1 조작가능 수가 기준선 아래로 내려가면 래칫이 걸린다(PLN AC-2)
 *        Ⓡ2 기준선과 공정 목록이 어긋나면 **FAIL 이 아니라 ERROR**(E8)
 *      🔴 그리고 **깨끗한 사본의 정상 종료코드가 0 이 아니다** — 아래 `CLEAN_EXIT` 참조.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 변이는 **사본에만** 한다 — 원본을 건드리지 않는다
 * ══════════════════════════════════════════════════════════════════════════════
 *   개발팀 두 세션이 `src/**` 를 동시 편집 중이다. 2026-08-22 오전에 「백업본이 남의 변이를
 *   담은 채 찍혀 복구할 때 그 변이를 되살린」 사고가 이미 났다.
 *   그래서 이 픽스처는 `src` 를 tmpdir 로 **복사**하고 게이트에 `--root` 로 그 사본을 준다.
 *   🔴 **원본 `src/` 는 한 바이트도 쓰지 않는다.** 실행 후 원본 해시를 대조해 그것을 증명한다.
 *
 * 종료코드: 0 전건 통과 · 1 픽스처 실패 · 2 픽스처 자체 고장
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { A12C_BASELINE } from './lib/a12c-baseline.mjs';

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GATE = path.join(APP, 'scripts', 'check-a12c.mjs');
const SRC = path.join(APP, 'src');

/** 원본 무결성 증명용 — 실행 전/후 해시. */
function treeHash(dir) {
  const out = execFileSync('/usr/bin/find', [dir, '-type', 'f', '-name', '*.ts'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  const h = createHash('sha256');
  for (const f of out) h.update(f).update(readFileSync(f));
  return h.digest('hex');
}

/** stdout 이 JSON 이면 파싱하고, 아니면 null. 🔴 **종료코드와 무관하게** 시도한다 —
 *  2026-08-22 A12 채택으로 게이트는 판정 실패 시 **exit 1 이면서 수치는 그대로 출력**한다.
 *  「재 봤더니 미달」과 「못 쟀다」는 다른 명제이기 때문이다. 종전 구현은 exit≠0 이면
 *  무조건 `json: null` 이라 채택 후 모든 측정 단언이 조용히 무너졌을 자리다. */
function tryJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/** 게이트를 사본 위에서 돌린다. { code, json, stdout, stderr } */
function runGate(root, wantJson = true) {
  const args = [GATE, '--root', root];
  if (wantJson) args.push('--json');
  try {
    const stdout = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '', json: wantJson ? tryJson(stdout) : null };
  } catch (err) {
    const stdout = String(err.stdout ?? '');
    return {
      code: typeof err.status === 'number' ? err.status : -1,
      stdout,
      stderr: String(err.stderr ?? ''),
      json: wantJson ? tryJson(stdout) : null,
    };
  }
}

/** src 사본을 만든다. */
function freshCopy() {
  const dir = mkdtempSync(path.join(tmpdir(), 'a12c-'));
  cpSync(SRC, path.join(dir, 'src'), { recursive: true });
  return dir;
}

/** 파일을 치환하고 **실제로 바뀌었는지 확인**한다. 안 바뀌면 픽스처 고장(exit 2). */
function mutate(root, rel, from, to, expectAtLeast = 1) {
  const f = path.join(root, rel);
  if (!existsSync(f)) fixtureBroken(`변이 대상 파일이 없다: ${rel}`);
  const before = readFileSync(f, 'utf8');
  const n = before.split(from).length - 1;
  if (n < expectAtLeast) fixtureBroken(`변이 앵커를 못 찾았다(${n}건 < ${expectAtLeast}): ${rel} ← ${from}`);
  const after = before.split(from).join(to);
  if (after === before) fixtureBroken(`변이가 적용되지 않았다: ${rel}`);
  writeFileSync(f, after);
  return n;
}

function fixtureBroken(msg) {
  console.error(`\n🔴🔴 픽스처 자체 고장 — ${msg}`);
  console.error('   이 실행의 탐지·미탐지 결과는 전부 신뢰할 수 없습니다. exit 2.');
  process.exit(2);
}

/** 🔴 PLN §26C-8 실측 기대값. **여기 리터럴로 둔다 — 기준선 모듈에서 유도하지 않는다.**
 *  유도하면 「기준선을 내리면 기대값도 함께 내려가서 ⓵ 이 조용히 통과」하는 구멍이 생긴다.
 *  두 곳에 같은 수를 두는 대신, **Ⓡ0 이 둘의 일치를 기계로 검사**한다. */
const EXPECT_CLEAN = { wafer: 1, oxidation: 1, photo: 4, etch: 1, deposition: 3, metal: 3, eds: 3, packaging: 4 };
/** L2 기대값 — PLN §26D 정본. 🔴 이 수가 안 나오면 판정을 바꾸지 말고 보고한다. */
const EXPECT_L2 = { total: 24, covered: 24, knobTotal: 112, knobCovered: 35, orphanRules: 52 };

/* ══════════════════════════════════════════════════════════════════════════════
 * 🔴 2026-08-22 A12 채택 — **깨끗한 사본의 정상 종료코드는 0 이 아니라 1 이다.**
 * ══════════════════════════════════════════════════════════════════════════════
 *   게이트가 차단 게이트가 되었고, 차단 조건 ① L2 커버리지 100 % 를 현행 트리가
 *   충족하지 못한다(13/24 = 54.2 %). 그러므로 **오염 없는 사본에서도 exit 1** 이다.
 *   ⛔ 이 상수를 0 으로 되돌려 「초록」을 만들지 마라. 그것은 픽스처를 고치는 것이 아니라
 *      **게이트를 끄는 것**이다. 0 이 되는 유일한 길은 L2 를 실제로 100 % 로 만드는 것이다.
 *   🔵 그날이 오면 이 상수를 0 으로 바꾸고, ⓵ 이하의 단언은 그대로 통과해야 한다.
 * ══════════════════════════════════════════════════════════════════════════════ */
const CLEAN_EXIT = 0;
const results = [];
function record(id, desc, want, got, ok) {
  results.push({ id, desc, want, got, ok });
  console.log(`  ${id} ${desc}`);
  console.log(`        기대 ${want}  ·  실측 ${got}   ${ok ? '✅' : '❌'}`);
}

function perProcess(json) {
  const o = {};
  for (const p of json.processes) o[p.pid] = p.c;
  return o;
}

const hashBefore = treeHash(SRC);
const temps = [];
console.log('check-a12c 형제 픽스처 — 변이 탐지 증명 (사본에만 변이 · 원본 무접촉)\n');

try {
  /* ─── ⓵ 오염 없는 사본 = 기준값 재현 ─────────────────────────────── */
  {
    const root = freshCopy(); temps.push(root);
    const r = runGate(root);
    if (r.code !== CLEAN_EXIT || !r.json) fixtureBroken(`깨끗한 사본의 종료코드가 ${CLEAN_EXIT} 이 아니다(exit ${r.code}) ${r.stderr}`);
    const per = perProcess(r.json);
    const ok = r.json.totalC === 20 && JSON.stringify(per) === JSON.stringify(EXPECT_CLEAN);
    record('⓵', '오염 없는 사본 — PLN 기대값 재현 (AC-C1)',
      `계 20 · ${JSON.stringify(EXPECT_CLEAN)}`, `계 ${r.json.totalC} · ${JSON.stringify(per)}`, ok);
    const l2 = r.json.l2;
    const got = { total: l2.total, covered: l2.covered, knobTotal: l2.knobTotal, knobCovered: l2.knobCovered, orphanRules: l2.orphanRules };
    record('⓵-L2', 'L2 — 실습 방향성 보강값 재현 (LO 24/24 · 노브 35/112 · 고아규칙 52)',
      JSON.stringify(EXPECT_L2), JSON.stringify(got), JSON.stringify(got) === JSON.stringify(EXPECT_L2));
    const EXPECT_UNCOVERED = [];
    record('⓵-L2b', '규칙 없음 0건 — 전 실습 LO가 덮인다',
      EXPECT_UNCOVERED.join(','), l2.uncovered.join(','),
      JSON.stringify(l2.uncovered) === JSON.stringify(EXPECT_UNCOVERED));
  }

  /* ─── Ⓡ0 🔴 **기준선 파일 무결성** — 몰래 내리는 것을 잡는다 ─────────
     래칫의 힘은 전적으로 기준선 파일에서 나온다. 그 파일을 내리면 후퇴가 **후퇴로 보이지
     않게** 된다. 그것을 막는 장치가 이것 하나뿐이므로 지우지 마라.
     🔴 기준선을 **올리는 것**(개선 반영)은 여기서 잡힌다 — 그때는 EXPECT_CLEAN 도 함께
        올라가야 하고, 그 둘을 같이 올리게 강제하는 것이 이 케이스의 목적이다. */
  {
    const ok = JSON.stringify(A12C_BASELINE) === JSON.stringify(EXPECT_CLEAN);
    record('Ⓡ0', '🔴 래칫 기준선 파일 = PLN 실측값 (기준선을 몰래 내리면 여기서 걸린다)',
      JSON.stringify(EXPECT_CLEAN), JSON.stringify(A12C_BASELINE), ok);
  }

  /* ─── ⓶ AC-C3 변이(+) : WF-D1.inputName → chamberTorr ⇒ wafer 0→1 ── */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/wafer/rules.ts', "inputName: 'pullRateCmPerMin'", "inputName: 'chamberTorr'");
    const r = runGate(root);
    const per = r.json ? perProcess(r.json) : null;
    const ok = r.code === CLEAN_EXIT && per && per.wafer === 2 && r.json.totalC === 21;
    record('⓶', '🔴 변이(+) WF-D1.inputName → chamberTorr (wafer lab-advanced 실재 슬라이더)',
      'wafer 1→2 · 계 20→21', per ? `wafer ${per.wafer} · 계 ${r.json.totalC}` : `exit ${r.code}`, ok);
  }

  /* ─── ⓷ AC-C4 변이(−) : photo 파라미터 id na → naX ⇒ photo 3→0 ───── */
  {
    const root = freshCopy(); temps.push(root);
    const n = mutate(root, 'src/models/labs/photo.ts', "id: 'na',", "id: 'naX',", 3);
    const r = runGate(root);
    const per = r.json ? perProcess(r.json) : null;
    const ok = r.code === 1 && per && per.photo === 1 && r.json.totalC === 17;
    record('⓷', `🔴 변이(−) photo params id 'na' → 'naX' (${n}칸) — na 를 쓰는 규칙이 정확히 3건`,
      'photo 4→1 · 계 20→17', per ? `photo ${per.photo} · 계 ${r.json.totalC}` : `exit ${r.code}`, ok);

    /* ─── Ⓡ1 🔴 **래칫이 실제로 걸린다** (PLN AC-2) ────────────────────
       같은 변이가 photo 를 3→0 으로 떨어뜨렸다. 기준선은 3 이므로 **후퇴**다.
       🔴 이 단언이 없으면 「래칫을 넣었다」는 주장이 실행으로 증명되지 않는다.
       음성 대조는 위 ⓶(wafer 0→1, 상향)이 맡는다 — 상향은 후퇴가 아니다. */
    const reg = r.json ? r.json.ratchet.regressed : null;
    const okR = r.code === 1 && reg && JSON.stringify(reg) === JSON.stringify(['photo'])
      && r.json.blocking.filter((b) => b.split('래칫').length - 1 > 0).length === 1;
    record('Ⓡ1', '🔴 래칫 양성 — photo 3→0 은 기준선 3 아래이므로 후퇴로 잡힌다 (AC-2)',
      "regressed=['photo'] · 래칫 차단 1건",
      reg ? `regressed=${JSON.stringify(reg)} · 래칫 차단 ${r.json.blocking.filter((b) => b.split('래칫').length - 1 > 0).length}건` : `exit ${r.code}`, okR);
  }

  /* ─── Ⓡ1n 🔴 래칫 음성 대조 — 상향은 후퇴가 아니다 ─────────────────
     ⓶ 과 같은 변이(wafer 0→1). 수가 **올라도** 래칫이 걸리면 개선할 때마다 빨간불이 되어
     아무도 개선하지 않게 된다. 「한 방향으로만 조인다」가 래칫의 정의다. */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/wafer/rules.ts', "inputName: 'pullRateCmPerMin'", "inputName: 'chamberTorr'");
    const r = runGate(root);
    const reg = r.json ? r.json.ratchet.regressed : null;
    const ok = reg !== null && reg.length === 0;
    record('Ⓡ1n', '🔴 래칫 음성 — wafer 0→1 상향은 후퇴가 아니다(빈 목록)',
      'regressed=[]', reg ? `regressed=${JSON.stringify(reg)}` : `exit ${r.code}`, ok);
  }

  /* ─── ⓸ 🔴 음성 대조 : fixedConditions 는 세지 않는다 ──────────────
     `EDS-D6 alpha` 를 **고정조건 id 로** 만들어 준다. 게이트가 fixedConditions 를 세면
     eds 가 3→4 로 오르고, 안 세면 3 그대로다. 「보이지만 못 만지는 값」을 세지 않는다는
     명세의 핵심 절반이 여기서 증명된다. */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/labs/eds.ts', "id: 'chuckTempC',", "id: 'alpha',");
    const r = runGate(root);
    const per = r.json ? perProcess(r.json) : null;
    const row = r.json ? r.json.processes.find((p) => p.pid === 'eds').rows.find((x) => x.id === 'EDS-D6') : null;
    const ok = r.code === CLEAN_EXIT && per && per.eds === 3 && row && row.manipulable === false && row.inFixed === true;
    record('⓸', '🔴 음성 대조 — 고정조건 id 를 alpha 로 만들어도 EDS-D6 는 조작가능이 아니다',
      'eds 3 유지 · EDS-D6 manipulable=false · inFixed=true',
      per ? `eds ${per.eds} · manipulable=${row && row.manipulable} · inFixed=${row && row.inFixed}` : `exit ${r.code}`, ok);
  }

  /* ─── ⓹ 🔴 음성 대조 2 : outputs[] 는 세지 않는다 ────────────────── */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/labs/packaging.ts', "id: 'floorLifeH',", "id: 'powerW',");
    const r = runGate(root);
    const per = r.json ? perProcess(r.json) : null;
    const row = r.json ? r.json.processes.find((p) => p.pid === 'packaging').rows.find((x) => x.id === 'PKG-D1') : null;
    const ok = r.code === CLEAN_EXIT && per && row && row.manipulable === false;
    record('⓹', '🔴 음성 대조 — outputs[] id 를 powerW 로 만들어도 PKG-D1 은 조작가능이 아니다',
      'PKG-D1 manipulable=false', per ? `manipulable=${row && row.manipulable} · packaging ${per.packaging}` : `exit ${r.code}`, ok);
  }

  /* ═══ L2 (방향성 LO 커버리지) 변이 검사 — 2026-08-22 신설 ═══════════
     🔴 L2 는 **차단하지 않는 수치**라서 조용히 굳으면 아무도 모른다.
        「움직여야 할 때 움직이는가 · 움직이면 안 될 때 가만있는가」를 둘 다 본다. */

  /* ─── Ⓛ1 양성: 방향성 LO 하나에서 규칙 연결을 끊으면 13→12 ────────
     `DEP-D11` 은 `LO-P5-05` **하나만** 커버한다(deposition 1/3). 그래서 이 규칙 하나를
     끊으면 정확히 LO 1건만 빠진다 — 여러 LO 를 덮는 규칙을 쓰면 감소폭이 1이 아니게 된다. */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/packaging/rules.ts', "inputName: 'testPowerW'", "inputName: 'testPowerWxx'");
    const r = runGate(root);
    const l2 = r.json && r.json.l2;
    const ok = r.code === 1 && l2 && l2.covered === 23 && l2.uncovered.length === 1
      && l2.uncovered.indexOf('LO-P8-03') !== -1;
    record('Ⓛ1', '🔴 양성 — PKG-D11 규칙 연결을 끊으면 LO-P8-03 이 빠진다',
      'L2 24→23 · 규칙없음 0→1 · LO-P8-03 포함',
      l2 ? `L2 ${l2.covered} · 규칙없음 ${l2.uncovered.length} · LO-P8-03 ${l2.uncovered.indexOf('LO-P8-03') !== -1 ? '포함' : '없음'}` : `exit ${r.code}`, ok);
  }

  /* ─── Ⓛ2 음성: **비방향성 LO** 를 건드려도 L2 는 움직이지 않는다 ────
     문항(`src/content/**`)의 `objectiveId` 를 비방향성 `LO-P2-01` → 미커버 방향성 `LO-P1-03` 으로
     바꾼다. L2 의 분모·분자는 **LabSpec 칸에서만** 나오므로 문항은 한 톨도 새어 들어오면 안 된다.
     🔴 여기서 14 가 나오면 문항이 커버리지를 부풀리고 있다는 뜻이다. */
  {
    const root = freshCopy(); temps.push(root);
    const n = mutate(root, 'src/content/ko/questions/oxidation.json', '"LO-P2-01"', '"LO-P1-03"');
    const r = runGate(root);
    const l2 = r.json && r.json.l2;
    const ok = r.code === CLEAN_EXIT && l2 && l2.covered === 24 && l2.total === 24 && l2.knobCovered === 35;
    record('Ⓛ2', `🔴 음성 — 문항 ${n}건의 objectiveId 를 비방향성→방향성으로 바꿔도 L2 불변`,
      'L2 24/24 유지 · 노브 35 유지',
      l2 ? `L2 ${l2.covered}/${l2.total} · 노브 ${l2.knobCovered}` : `exit ${r.code}`, ok);
  }

  /* ─── Ⓛ3 음성2: 비방향성 LO 는 **분모에 들어오지 않는다** ──────────
     칸이 없는 `-01`·`-02` 16건이 분모에 새면 24 가 아니라 40 이 된다. */
  {
    const root = freshCopy(); temps.push(root);
    const r = runGate(root);
    const l2 = r.json && r.json.l2;
    const ok = r.code === CLEAN_EXIT && l2 && l2.total === 24;
    record('Ⓛ3', '음성2 — 분모가 24(방향성)이지 40(전체 LO)이 아니다',
      'total 24', l2 ? `total ${l2.total}` : `exit ${r.code}`, ok);
  }

  /* ─── Ⓛ4 E7: 칸의 objectiveId 가 깨지면 exit 2 ────────────────────
     L2 분모가 칸에서 나오므로, 이것을 놓치면 커버리지가 **조용히** 부풀거나 줄어든다. */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/labs/oxidation.ts', "objectiveId: 'LO-P2-03',", "objectiveId: 'LO-XX-99',");
    const r = runGate(root, false);
    const ok = r.code === 2 && r.stderr.split('E7').length - 1 > 0;
    record('Ⓛ4', 'E7 칸 objectiveId 파손 — exit 2 (분모가 조용히 줄지 않게)', 'exit 2 · E7 고지', `exit ${r.code}`, ok);
  }

  /* ─── Ⓡ2 E8 : 기준선과 공정 목록이 어긋나면 **FAIL 이 아니라 ERROR** ──
     공정을 늘리거나 이름을 바꾸면 기준선에 그 공정이 없다. 그때 조용히 0 으로 간주하면
     **새 공정이 래칫 밖으로 샌다.** 「기준을 어겼다」가 아니라 「비교 대상이 없다」이므로
     exit 1 이 아니라 exit 2 다 — 이 집안의 「0건과 모른다는 다른 명제」 규율 그대로다. */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/content/catalog.json', '"wafer"', '"waferZ"');
    const r = runGate(root, false);
    const ok = r.code === 2 && r.stderr.split('E8').length - 1 > 0;
    record('Ⓡ2', '🔴 E8 기준선↔공정목록 불일치 — exit 2 (FAIL 로 위장하지 않는다)',
      'exit 2 · E8 고지', `exit ${r.code}${r.stderr.split('E8').length - 1 > 0 ? ' · E8 고지' : ' · E8 없음'}`, ok);
  }

  /* ─── ⓺ AC-C7 : 규칙 0건 ⇒ exit 2 이고 **수치를 내지 않는다** ────── */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/index.ts', 'registerRules([', 'if (globalThis.__never) registerRules([');
    const r = runGate(root, false);
    const noNumbers = r.stdout.split('A12-C').length - 1 === 0;
    const said = r.stderr.split('E1').length - 1 > 0;
    const ok = r.code === 2 && noNumbers && said;
    record('⓺', '🔴 E1 규칙 0건 — exit 2 이며 수치를 출력하지 않는다 (AC-C7)',
      'exit 2 · A12-C 수치 0회 출력 · E1 고지', `exit ${r.code} · 수치출력 ${noNumbers ? '없음' : '있음'} · E1 ${said ? '고지' : '없음'}`, ok);
  }

  /* ─── ⓻ E3 : processId 가 PIDS 에 없다 ⇒ exit 2 ──────────────────── */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/wafer/rules.ts', "processId: 'wafer',", "processId: 'waferX',", 1);
    const r = runGate(root, false);
    const ok = r.code === 2 && r.stderr.split('E3').length - 1 > 0;
    record('⓻', 'E3 알 수 없는 processId — exit 2', 'exit 2 · E3 고지', `exit ${r.code}`, ok);
  }

  /* ─── ⓼ E4 : inputName 이 이름 규칙에 안 맞는다 ⇒ exit 2 ─────────── */
  {
    const root = freshCopy(); temps.push(root);
    mutate(root, 'src/models/physics/wafer/rules.ts', "inputName: 'pullRateCmPerMin'", "inputName: '12 bad name'");
    const r = runGate(root, false);
    const ok = r.code === 2 && r.stderr.split('E4').length - 1 > 0;
    record('⓼', 'E4 부적합한 inputName — exit 2 (파서가 잘못 읽었다는 신호)', 'exit 2 · E4 고지', `exit ${r.code}`, ok);
  }

  /* ─── ⓽ AC-C8 : 판정 경로에 관대 비교 함수가 0건 ───────────────────
     🔴 **주석을 걷어낸 코드만 본다.** 게이트 머리주석은 「이 함수들을 쓰지 않는다」고
        금지 목록을 **이름 그대로 적어 두고** 있어서, 원문을 그대로 grep 하면 그 설명이
        위반으로 오진된다. 같은 함정을 `tests/unit/viz-glsl.test.ts` 가 이미 밟았고
        거기서도 `stripComments` 로 갈랐다(같은 규율을 여기서도 쓴다).
        🔵 이 픽스처를 처음 돌렸을 때 실제로 이 오진이 났고, 그래서 이 절이 있다. */
  /* 🔴 2026-08-22 — 게이트가 `lib/a12c-baseline.mjs` 를 import 하게 됐다. 그 모듈도
     **게이트의 코드**이므로 함께 본다. 안 그러면 「관대 비교를 import 한 모듈로 옮기면
     AC-C8 을 피할 수 있다」는 구멍이 그대로 열린다. */
  const GATE_SOURCES = [GATE, path.join(APP, 'scripts', 'lib', 'a12c-baseline.mjs')];
  {
    const stripComments = (raw) => raw
      .split(/\/\*[\s\S]*?\*\//).join('')                      // 블록 주석 제거
      .split('\n').map((l) => l.split('//')[0]).join('\n');    // 줄 주석 제거
    const banned = ['toLowerCase(', 'includes(', 'startsWith(', 'replace(', 'normalize('];
    const hits = [];
    for (const f of GATE_SOURCES) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const b of banned) if (code.split(b).length - 1 > 0) hits.push(`${path.basename(f)}:${b}`);
    }
    const ok = hits.length === 0;
    record('⓽', `🔴 AC-C8 — 게이트 **코드**(주석 제외, ${GATE_SOURCES.length}파일)에 관대 비교 0건`,
      '0건', hits.length === 0 ? '0건' : hits.join(', '), ok);
  }

  /* ─── ⓾ AC-C9 : 별칭표가 없다 ────────────────────────────────────── */
  {
    const banned = ['ALIASES', 'aliasMap', 'SYNONYM', 'synonyms'];
    const hits = [];
    for (const f of GATE_SOURCES) {
      const src = readFileSync(f, 'utf8');
      for (const b of banned) if (src.split(b).length - 1 > 0) hits.push(`${path.basename(f)}:${b}`);
    }
    const ok = hits.length === 0;
    record('⓾', `AC-C9 — 별칭 매핑 자료구조 0건 (${GATE_SOURCES.length}파일)`, '0건', hits.length === 0 ? '0건' : hits.join(', '), ok);
  }
} finally {
  for (const d of temps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 정리 실패는 삼킨다 */ } }
}

/* ─── 원본 무접촉 증명 ─────────────────────────────────────────────── */
const hashAfter = treeHash(SRC);
const untouched = hashBefore === hashAfter;
console.log('');
console.log(`  🔴 원본 src/ 무접촉 확인: ${untouched ? '✅ 해시 동일 — 한 바이트도 쓰지 않았습니다' : '❌ 원본이 바뀌었습니다'}`);
if (!untouched) fixtureBroken('원본 src/ 가 변경됐다 — 즉시 확인이 필요하다');

const passed = results.filter((r) => r.ok).length;
console.log('');
console.log(`  ${passed}/${results.length} 통과`);
if (passed !== results.length) {
  console.log('');
  console.log('❌ 픽스처 실패 — 게이트가 기대대로 동작하지 않습니다.');
  process.exit(1);
}
console.log('');
console.log('✅ 픽스처 전건 통과 — 변이(+)로 수가 오르고 변이(−)로 내려가며,');
console.log('   고정조건·출력은 세지 않고, 계측 실패는 수치 없이 exit 2 로 납니다.');
process.exit(0);
