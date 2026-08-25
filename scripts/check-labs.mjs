#!/usr/bin/env node
/**
 * 🔴 실습 명세 게이트 — `src/models/labs/**`.
 *
 * labs 의 숫자는 물리 계수가 아니라 **슬라이더 범위·합격창·단위환산·표시자릿수**다.
 * 그래서 매직넘버 축 대신 **「근거 선언이 있는가」** 축으로 검사한다. 게이트를 푼 것이 아니라 축을 바꾼 것이다.
 *
 * 검사:
 *  1. 모든 LabParam 에 `sourceId` 또는 `basis` 가 있다 (조작 범위의 근거)
 *  2. `role: 'judge'` 출력에는 `pass` 가 있다 (판정 없는 판정 항목 금지)
 *  3. spec 에 `objectiveId` 가 있다 (PLN 학습목표와 1:1)
 *  4. `scene.sceneId` **와 `scenes[].sceneId` 전부**가 viz 가 아는 씬이다 (억지 매핑·오타 차단)
 *  5. `compute` 반환 키가 `outputs[].id` 를 전부 덮는다
 *  6. `feedback[].when` 이 존재하고 tone 이 유효하다
 *  7. 🔴 차트의 `judgesOutputs` 가 실재하는 출력을 가리킨다 (PLN 427)
 *
 * ── 🔴 2026-08-22 · 「계약을 늘렸으면 그 필드를 읽는 게이트도 늘려라」 ──────────────
 * `LabSpec` 에 **`scenes?: LabSceneBinding[]`** 가 신설됐는데(씬 병치 · PLN §22-1 D-P5-1)
 * 검사 4번이 칸 구간의 **`sceneId:` 첫 매치 하나**만 보고 있었다.
 * → **`scenes[]` 에 오타 id 를 넣어도 빌드가 통과했다**(PLN 수용기준 AC-2 미충족).
 * 지금은 칸 구간의 **모든 `sceneId:` 리터럴**을 대조한다. 화면이 실제로 그리는 목록의 정본은
 * `src/models/labs/spec.ts` 의 `labSceneBindings()` 이며, 이 게이트는 그 함수가 이어 붙이는
 * 두 출처(`scenes[]` · `scene`)를 **소스 텍스트에서 같은 자로** 본다.
 * 🔴 새 씬 출처(필드)를 또 만들거든 **여기도 같이 늘려라.** 안 늘리면 그 필드는 오타 무방비다.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const LABS = join(APP, 'src', 'models', 'labs');
const VIZ_INDEX = join(APP, 'src', 'viz', 'index.ts');

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);

if (!existsSync(LABS)) {
  console.log('⚠️  src/models/labs 가 없습니다 — 미착수로 보고 통과시킵니다.');
  process.exit(0);
}

/** viz 가 아는 씬 id */
let sceneIds = [];
if (existsSync(VIZ_INDEX)) {
  const m = readFileSync(VIZ_INDEX, 'utf8').match(/export type SceneId\s*=\s*([^;]+);/);
  if (m) sceneIds = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const SKIP = new Set(['spec.ts', 'index.ts']);
const files = walk(LABS).filter((f) => !SKIP.has(f.split('/').pop()));

if (files.length === 0) {
  console.log('⚠️  실습 명세 파일이 아직 없습니다 — 미착수로 보고 통과시킵니다.');
  process.exit(0);
}

let specCount = 0;
let paramCount = 0;
let judgeCount = 0;
let sceneCount = 0;
let noSceneCount = 0;
/** 🔴 「씬이 붙은 칸」이 아니라 **실제로 그려지는 씬의 총 개수**. 병치 칸은 1칸이지만 2개다. */
let sceneBindingCount = 0;
const juxtaposed = [];
/** 🔴 항목 7 이 **실제로 몇 개를 봤는가**. 0 이면 「위반 0건」이 아니라 「아무것도 안 봤다」다. */
let judgesOutputsScanned = 0;

for (const file of files) {
  const rel = relative(APP, file);
  const src = readFileSync(file, 'utf8');

  // spec 블록을 processId 단위로 자른다(정규식 수준 — 설계서 §8과 같은 정적 검사 깊이)
  const specStarts = [...src.matchAll(/processId:\s*[A-Za-z_$][\w$]*|processId:\s*'[^']+'/g)];
  specCount += specStarts.length;

  for (const m of specStarts) {
    const seg = src.slice(m.index, findSpecEnd(src, m.index));
    const stageM = seg.match(/stage:\s*'(lab-[a-z]+)'/);
    const stage = stageM ? stageM[1] : '(stage 미상)';
    const where = `${rel} [${stage}]`;

    if (!/objectiveId:\s*'[^']+'/.test(seg)) {
      fail(`${where}: objectiveId 가 없습니다 — PLN 학습목표와 1:1 매핑이 필요합니다.`);
    }

    // 1. LabParam 근거
    // 🔴 `min:` 만으로는 출력 객체의 `pass: { min: …, max: … }` 를 파라미터로 오인한다(P8 보고).
    //    LabParam 고유 필드 **`step:` 과 `initial:` 을 둘 다** 요구하고, 출력 고유 필드 `role:` 이 있으면 제외한다.
    const params = [...seg.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?\bstep:\s*[-\d.]+[\s\S]*?\}/g)]
      .filter((m) => /\binitial:\s*[-\d.]+/.test(m[0]) && !/\brole:\s*'(judge|display)'/.test(m[0]));
    for (const p of params) {
      paramCount++;
      if (!/sourceId:\s*'S[\w-]+'/.test(p[0]) && !/basis:\s*'[^']+'/.test(p[0])) {
        fail(`${where}: 파라미터 '${p[1]}' 에 근거가 없습니다 — sourceId 또는 basis 를 다세요. 「범위를 지어내면 식을 지어낸 것과 같다」`);
      }
    }

    // 2. judge 출력에는 pass 가 있어야
    const outs = [...seg.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?role:\s*'(judge|display)'[^}]*?\}/gs)];
    for (const o of outs) {
      if (o[2] === 'judge') {
        judgeCount++;
        if (!/pass:\s*\{/.test(o[0])) {
          fail(`${where}: 출력 '${o[1]}' 이 judge 인데 pass 구간이 없습니다.`);
        }
      }
    }
    if (outs.length > 0 && judgeCountIn(outs) === 0) {
      fail(`${where}: judge 출력이 하나도 없습니다 — 합격/불합격을 가릴 수 없습니다.`);
    }

    // 4. 씬 id 유효성 — 🔴 `scene`(단수) **과** `scenes[]`(배열) 원소 전부.
    //    종전에는 `seg.match(...)` 로 **첫 매치 하나**만 봤다. 그래서 병치 칸의 두 번째 씬 이후는
    //    오타를 넣어도 통과했다. 지금은 `matchAll` 로 칸 구간의 모든 `sceneId:` 를 대조한다.
    //    (같은 id 를 두 곳에 적어도 `labSceneBindings()` 가 한 번만 그리므로 여기서도 한 번만 센다.)
    const sceneIdsInCell = [];
    for (const sm of seg.matchAll(/sceneId:\s*'([^']+)'/g)) {
      if (!sceneIdsInCell.includes(sm[1])) sceneIdsInCell.push(sm[1]);
    }
    if (sceneIdsInCell.length > 0) {
      sceneCount++;                                   // 「씬이 붙은 칸」의 수 — 종전과 같은 뜻
      sceneBindingCount += sceneIdsInCell.length;     // 실제로 그려지는 씬의 총 개수
      if (sceneIdsInCell.length > 1) {
        juxtaposed.push(`${where}: 씬 ${sceneIdsInCell.length}개 병치 — ${sceneIdsInCell.join(' · ')}`);
      }
      for (const id of sceneIdsInCell) {
        if (sceneIds.length > 0 && !sceneIds.includes(id)) {
          fail(`${where}: sceneId '${id}' 를 viz 가 모릅니다. 아는 씬: ${sceneIds.join(', ')}`);
        }
      }
    } else {
      noSceneCount++;
      warns.push(`${where}: 씬 미연결 — 화면에 「내부 시각화 준비 중」이 표시됩니다(정직한 상태).`);
    }

    // 5. compute 반환 키가 outputs 를 덮는가
    const outIds = outs.map((o) => o[1]);
    const computeM = seg.match(/compute\s*\([^)]*\)\s*\{([\s\S]*?)\n {4}\},/);
    if (computeM) {
      for (const id of outIds) {
        if (!new RegExp(`\\b${id}\\s*:`).test(computeM[1])) {
          fail(`${where}: compute 가 출력 '${id}' 를 반환하지 않습니다.`);
        }
      }
    }

    // 7. 🔴 차트가 「판정한다」고 선언한 출력이 실재하는가 (PLN 427 「판정은 이 차트에서 한다」)
    //    존재하지 않는 id 를 적으면 화면에 「판정은 이 차트에서 합니다」가 뜨는데
    //    정작 아무것도 안 가리킨다 — 학습자에게 거짓말이 된다.
    for (const jm of seg.matchAll(/judgesOutputs:\s*\[([^\]]*)\]/g)) {
      judgesOutputsScanned++;
      for (const idm of jm[1].matchAll(/'([^']+)'/g)) {
        if (!outIds.includes(idm[1])) {
          fail(`${where}: 차트가 judgesOutputs 로 '${idm[1]}' 를 가리키는데 그런 출력이 없습니다.`);
        }
      }
    }

    // 6. feedback tone
    for (const f of seg.matchAll(/tone:\s*'([^']+)'/g)) {
      if (!['stop', 'warn', 'hint'].includes(f[1])) {
        fail(`${where}: feedback tone '${f[1]}' 이 유효하지 않습니다(stop|warn|hint).`);
      }
    }
  }
}

function judgeCountIn(outs) { return outs.filter((o) => o[2] === 'judge').length; }

function findSpecEnd(src, from) {
  const next = src.indexOf('processId:', from + 10);
  return next === -1 ? src.length : next;
}


// ---------- 7. 🔴 A6-b 는 **여기서 검사하지 않는다** ----------
// 종전에 이 자리에 정규식 검사가 있었다. 검증 비서가 변이를 넣어 실측한 결과:
//   · 렌더 블록 전체 삭제                                        → ✅ 적발
//   · `<ul className="qty__assumptions">` 목록만 삭제, 가드 유지  → 🔴 통과(못 봄)
//   · 렌더 삭제 + 주석에 `.assumptions` 한 마디만 남김            → 🔴 통과(주석을 안 벗겼다)
// 「소스에 문자열이 있다」와 「화면에 고지가 나온다」는 다른 명제라, 정적 검사로는 원리상 메울 수 없다.
// 🔴 A6-b 는 **`scripts/check-a6b.mjs`** 가 브라우저로 24칸을 실제 렌더해 DOM 으로 검사한다.
//    등급 원장 정합성은 `scripts/check-grades.mjs` 가 본다. 이 자리에 정규식을 되살리지 마라 —
//    통과했다는 착각만 만들고 진짜 검사를 밀어낸다.

console.log(`실습 명세 ${specCount}건 · 파라미터 ${paramCount}개 · 판정출력 ${judgeCount}개 · 씬연결 ${sceneCount}건 · 씬미연결 ${noSceneCount}건 · 씬바인딩 ${sceneBindingCount}개`);
for (const j of juxtaposed) console.log('  ▣ ' + j);

/* ── 🔴 계측 한계를 「0건」으로 삼키지 않는다 (2026-08-22) ──────────────────────
 * 항목 7(judgesOutputs 실재)은 **칸 구간 안에서만** 찾는다. 구간은 `processId:` 부터
 * 다음 `processId:` 까지다. 그런데 실제 랩 파일은 차트 객체를 **모듈 최상단 const 로,
 * 첫 `processId:` 보다 위에** 선언한다(oxidation 232행 ↔ 첫 processId 448행 등).
 * → 이 검사는 **24칸 전부에서 0회 반복한다.** 그런데도 로그는 「✅ 통과」로 보였다.
 *
 * 🔴 주입 실측(2026-08-22): `judgesOutputs` 에 존재하지 않는 출력 id 를 넣었더니
 *    `check-labs` 는 **exit 0** 이었고 `check-wiring` W6-5 가 exit 1 로 잡았다.
 *    즉 **진짜 강제는 `check-wiring` W6-3/4/5/7 (런타임 객체 검사)에 있다.**
 *
 * 여기서 정규식을 되살리지 않는다 — 구간을 넓히면 차트의 `refLine.tone`('spec'|'info')이
 * 항목 6 의 feedback tone 검사('stop'|'warn'|'hint')에 걸려 **오탐으로 실패**한다.
 * 같은 이름이 두 계약에서 뜻이 다른데 정규식은 그것을 구분하지 못한다.
 * 대신 **모수를 드러낸다.** 「0건 통과」와 「아무것도 못 봤다」는 다른 명제다. */
if (judgesOutputsScanned === 0) {
  console.log('  ⚠️  항목 7(차트 judgesOutputs 실재)이 **본 대상 0건** — 이 게이트의 통과는 그 항목을 증명하지 않는다(계측 한계).');
  console.log('      사유: 차트는 모듈 최상단 const 라 칸 구간(processId~processId) 밖이다. 정본 강제는 scripts/check-wiring.mjs W6-5 (런타임 객체 검사).');
} else {
  console.log(`  · 항목 7 검사한 judgesOutputs 선언 ${judgesOutputsScanned}건`);
}

for (const w of warns) console.log('  ⚠️  ' + w);

if (errors.length > 0) {
  console.error(`\n❌ check-labs 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('✅ check-labs 통과');
