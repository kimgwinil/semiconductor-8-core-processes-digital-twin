#!/usr/bin/env node
/**
 * check-a12c — **A12-C 「조작 가능한 방향성 규칙」을 센다.**
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 2026-08-22 — 이 게이트는 **차단 게이트가 되었다.** (A12 채택)
 * ══════════════════════════════════════════════════════════════════════════════
 *   오케스트레이터 판정: **「A12 를 새 기준으로 채택한다.」**
 *   그때까지 이 파일 머리에는 「이 게이트는 차단하지 않는다 · exit 1 경로가 없다」가 적혀
 *   있었다. 그 문장은 **폐기됐다.** 아래가 현행 계약이다.
 *
 *   ── 차단 조건 (이것뿐이다) ──────────────────────────────────────────────
 *     L2 · 방향성 LO 커버리지 < 100 %                    → FAIL (exit 1)
 *     래칫 · 공정별 조작가능 수가 기준선 아래로 감소     → FAIL (exit 1)
 *     계측 실패 E1~E8                                    → ERROR (exit 2)
 *
 *   ⛔ **「공정당 N개 이상」 절대수 하한을 넣지 마라.** PLN §26B-12-3 이 폐기한 안이다
 *      (「어떤 균일 절대수도 근거가 없다. 숫자를 2로 바꾸든 1로 바꾸든 형태가 같다」).
 *      `목표 5`(§26B-12-4 L3)는 **비차단 표시 전용**이다 — AC-3: 「공정당 5 미달만으로는
 *      exit 1 이 발생하지 않는다」.
 *
 *   🔴 **채택해도 초록이 되지 않는다.** 현재 L2 = 13/24(54.2 %) 이므로 **여전히 불합격**이다.
 *      A12 채택은 **완화가 아니다.** 바뀐 것은 빨간불의 **이유**다:
 *        종전 기준 = 「3D 씬에 나타나는가」 → **씬 유무에 인질로 잡혀 있었다**
 *        새   기준 = 「학습자가 **만질 수 있는 노브**에 방향 보증이 있는가」
 *
 *   🔴 이 채택으로 **뒤집힌 종전 문서 조항** — 숨기지 않는다:
 *      · PLN §26D-4 **AC-D9**「`check-a12c.mjs` 는 여전히 차단하지 않는다 — 커버리지
 *        100 % 미만이어도 `exit 0`」  → **무효.** 채택 판정이 이것을 뒤집었다.
 *      · 명세 §10 **U-1**「래칫 채택 여부는 여전히 미채택」            → **채택됨.**
 *      나머지 계측 정의(§26C·§26D 판별식 · AC-C1~C13 · AC-D1~D8)는 **그대로 살아 있다.**
 *
 *   🔴 왜 두 게이트인가 — `check-direction.mjs` 는 **「화면 도달」**을 센다.
 *      이 게이트가 **「조작 가능」**을 센다. 둘은 다른 명제다. 섞지 마라.
 *      2026-08-22 부터 **A12 판정은 이 파일이 정본**이고, `check-direction` 의 V2
 *      (화면 도달 ≥5)는 **비차단 참고 출력으로 강등**됐다. V1·V3·V4·V5·M1~M5 는 그대로 차단한다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 정본 명세
 * ══════════════════════════════════════════════════════════════════════════════
 *   `threads/PLN→DEV_A12조작가능성_판정명세_8대공정-001.md` (A12-C)
 *
 *     ParamPool(p) = ⋃_{c ∈ 그 공정 랩 3칸} { q.id : q ∈ c.params }
 *     manipulable(R) := R.inputName ∈ ParamPool(R.processId)
 *
 *   세지 않는 것: `fixedConditions[]` · 모듈 상수 · `outputs[]` · 씬 · 테스트 스윕 입력.
 *
 *   🔴 C-1~C-4 — 비교는 **JS `===` 문자열 완전 일치**(`Set.prototype.has`).
 *      **대소문자 구분 · 트림/정규화/부분일치/단위접미사 무시 전부 금지 · 별칭표 금지.**
 *      그래서 이 파일에는 `toLowerCase(` · `includes(` · `startsWith(` · `replace(` ·
 *      `normalize(` 가 **한 건도 없다**(명세 AC-C8 이 grep 으로 검사하는 항목이다).
 *      판정 경로만이 아니라 **파일 전체**에서 안 쓴다 — 「판정 경로가 어디까지인가」를
 *      나중 사람이 다시 다투지 않게 하려는 것이다.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 왜 텍스트 파서가 아니라 **런타임 데이터**인가 (명세 §5-1)
 * ══════════════════════════════════════════════════════════════════════════════
 *   소스 표기 관례가 판정을 바꾸는 사고가 이미 났다(`const f = (a,b): T => ({…})` 반환타입
 *   주석 사고 · PLN 1차 파서에서 A12-CO 가 13 이 아니라 **5** 로 나온 사고).
 *   그래서 **실제 객체**를 읽는다 — vite 의 SSR 모듈 로더로 src 아래 TS 모듈을 그대로 import 한다.
 *   `vite` 는 이미 devDependency 다(새 의존성이 아니다).
 *
 *   덕분에 명세 §5-2 의 텍스트 파서 계약(T-1~T-6)과 자기검산 E6·AC-C13(`step:` 총수 112)은
 *   **해당 사항이 없다.** 중괄호 균형도 판별자도 필요 없다 — 객체를 직접 받기 때문이다.
 *   🔴 그 대신 **E1~E5 를 전부 건다.** 아래 §계측실패 참조.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 종료코드
 * ══════════════════════════════════════════════════════════════════════════════
 *   0  측정 성공 · 차단 조건 위반 없음
 *   1  **판정 실패** — L2 커버리지 < 100 % 또는 래칫 후퇴. 🔴 **수치는 그대로 출력한다**
 *      (계측은 성공했기 때문이다 — 「재 봤더니 미달」과 「못 쟀다」는 다른 명제다)
 *   2  계측 실패 E1~E8 · 모듈 로드 실패. 🔴 **이때 A12-C 수치를 출력하지 않는다.**
 *      고장 난 계측기의 숫자를 화면에 내보내는 것이 2026-08-22 오전에 고친 결함이다.
 *
 *   🔴 `--json` 도 **같은 종료코드를 낸다.** 출력 형식이 판정을 바꾸는 통로가 되면
 *      `--json` 이 곧 우회로가 된다. 형식은 형식이고 판정은 판정이다.
 *
 * 사용:
 *   node scripts/check-a12c.mjs [--json] [--root <앱디렉터리>]
 *     --root : `src/` 를 가진 디렉터리. 기본값은 이 스크립트의 앱 루트.
 *              🔴 셀프테스트가 **원본을 건드리지 않고** 오염 사본을 지정하는 통로다
 *              (다른 세션이 `src/**` 를 동시 편집 중이라 원본 변이는 금지다).
 *   ⛔ **판정을 끄는 플래그(`--no-block`·`--count-only` 등)를 만들지 마라.** 그것이 곧 완화다.
 */
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* 🔴 래칫 기준선의 **정본**. 여기에 수를 다시 적지 않는다 — 정본이 둘이면 하나는 낡는다.
 *    형제 픽스처(`check-a12c.selftest.mjs`)도 **같은 모듈**을 읽는다. */
import {
  A12C_BASELINE,
  A12C_BASELINE_MEASURED_AT,
  A12C_TARGET_PER_PROCESS,
} from './lib/a12c-baseline.mjs';

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function flag(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}
const JSON_OUT = process.argv.indexOf('--json') !== -1;
const ROOT = path.resolve(flag('--root') ?? APP);
const SRC = path.join(ROOT, 'src');

const STAGES = ['lab-basic', 'lab-applied', 'lab-advanced'];
/** 명세 §8 — 게이트 머리에 **그대로** 출력한다(O-6). 계측기가 자기 사각지대를 스스로 말한다. */
const BLIND_SPOTS = [
  'B-1 이름이 같아도 「같은 물리량」인지 모른다 — DirectionRule 에 단위 필드가 없다.',
  '    🔴 이름만 맞추면 수가 오르고 이 게이트는 그것을 막지 못한다. 이 구멍을 지우지 마라.',
  'B-2 그 파라미터가 화면에 실제 슬라이더로 그려지는지 보지 않는다(LabRunner 전제).',
  'B-3 슬라이더를 흔들면 출력이 그 방향으로 움직이는지 보지 않는다(tests/direction 소관).',
  'B-4 랩 compute() 가 그 값을 물리 함수에 실제로 넘기는지 보지 않는다(check-wiring 소관).',
  'B-5 「규칙이 있다」이지 **「그 규칙이 옳다」가 아니다** — 방향이 틀려도 커버로 센다.',
  'B-6 명목형 노브(예: concernIndex)는 방향 자체가 정의되지 않아 A12 가 검사할 수 없다(§26D-1 B-4).',
  'B-7 🔴 **기준선 0 인 공정에서 래칫은 아무것도 막지 못한다** — 0 아래로는 내려갈 수 없다.',
  '    그 공정을 잡는 것은 래칫이 아니라 **L2 커버리지 100 %** 조건뿐이다(PLN AC-5).',
];

/** 계측 실패. 🔴 수치를 출력하지 않고 exit 2. */
function die(code, lines) {
  for (const l of lines) console.error(l);
  console.error('');
  console.error('🔴 계측 실패 — **이 실행의 A12-C 수치는 출력하지 않습니다.**');
  console.error(`   「${code}」는 「0건」이 아니라 「모른다」입니다. exit 2.`);
  process.exit(2);
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
/** 학습목표 id 꼴. `02_학습설계서.md` 가 정본이고 8공정 × 5개 = 40건이다. */
const LO_RE = /^LO-P[1-8]-0[1-5]$/;

/** 값이 있는 배열만 돌려준다(없으면 빈 배열). */
function arr(v) {
  return Array.isArray(v) ? v : [];
}

async function main() {
  /* ---------- PIDS — catalog.json 이 정본 ---------- */
  let pids;
  try {
    const catalog = JSON.parse(readFileSync(path.join(SRC, 'content/catalog.json'), 'utf8'));
    pids = Object.keys(catalog.processes);
  } catch (err) {
    die('catalog 로드 실패', [`🔴 catalog.json 을 읽지 못했습니다: ${String(err)}`]);
  }

  /* ---------- E8 — 래칫 기준선과 공정 목록이 어긋난다 ----------
     🔴 **FAIL 이 아니라 ERROR 다.** 기준선에 없는 공정은 「기준을 지켰다」도 「어겼다」도
        아니고 **비교 대상이 없다**. 공정을 늘리거나 줄이면 사람이 기준선을 의식적으로
        갱신해야 한다 — 조용히 0 으로 간주하면 새 공정이 래칫 밖으로 샌다. */
  {
    const basePids = new Set(Object.keys(A12C_BASELINE));
    const curPids = new Set(pids);
    const missing = pids.filter((p) => !basePids.has(p));       // 기준선에 없는 현행 공정
    const extra = [...basePids].filter((p) => !curPids.has(p)); // 현행에 없는 기준선 공정
    if (missing.length > 0 || extra.length > 0) {
      die('E8', [
        '🔴 E8 — 래칫 기준선과 catalog 의 공정 목록이 어긋납니다.',
        `   기준선에 없는 현행 공정: ${missing.length > 0 ? missing.join(', ') : '없음'}`,
        `   현행에 없는 기준선 공정: ${extra.length > 0 ? extra.join(', ') : '없음'}`,
        '   scripts/lib/a12c-baseline.mjs 를 의식적으로 갱신하십시오.',
        '   🔴 값을 **내려서** 맞추지 마십시오 — 그것은 완화입니다(D-041).',
      ]);
    }
  }

  /* ---------- 런타임 모듈 로드 ---------- */
  let server;
  let rules;
  let labSpec;
  try {
    server = await createServer({
      configFile: false,
      root: ROOT,
      appType: 'custom',
      server: { middlewareMode: true, hmr: false },
      resolve: { alias: { '@': SRC } },
      logLevel: 'error',
    });
    const physics = await server.ssrLoadModule('/src/models/physics/index.ts');
    const labs = await server.ssrLoadModule('/src/models/labs/index.ts');
    const direction = await server.ssrLoadModule('/src/models/direction.ts');
    const spec = await server.ssrLoadModule('/src/models/labs/spec.ts');
    /* 🔴 명세 §5-1 주의 — registerPhysics() 의 유일한 호출처가 LabSection.tsx 다.
       부르지 않으면 allRules() 는 빈 배열을 준다. 그 상태는 「0건」이 아니라 E1 이다. */
    physics.registerPhysics();
    labs.registerAllLabs();
    rules = direction.allRules();
    labSpec = spec.labSpec;
  } catch (err) {
    if (server) await server.close();
    die('모듈 로드 실패', ['🔴 런타임 모듈을 로드하지 못했습니다:', String(err)]);
  }

  /* ---------- E1 ---------- */
  if (!Array.isArray(rules) || rules.length === 0) {
    await server.close();
    die('E1', ['🔴 E1 — 규칙 로드 결과가 **0건**입니다.',
      '   registerPhysics() 가 실제로 등록했는지, direction.ts 모듈 인스턴스가 같은지 확인하십시오.']);
  }

  /* ---------- 칸 수집 · E2 · E5 ---------- */
  const cellsOf = new Map();
  for (const p of pids) {
    const cells = [];
    for (const st of STAGES) {
      const c = labSpec(p, st);
      if (c) cells.push({ stage: st, spec: c });
    }
    if (cells.length < STAGES.length) {
      await server.close();
      die('E2', [`🔴 E2 — 공정 '${p}' 의 랩 칸이 ${cells.length}칸입니다(3칸이어야 합니다).`]);
    }
    /* 🔴 E7(L2 신설) — 칸의 objectiveId 가 없거나 꼴이 다르면 L2 분모가 조용히 줄어든다.
       「LO 0건」과 「LO 를 못 읽었다」를 같은 칸에 넣지 않는다. */
    for (const c of cells) {
      if (typeof c.spec.objectiveId !== 'string' || !LO_RE.test(c.spec.objectiveId)) {
        await server.close();
        die('E7', [`🔴 E7 — '${p}' ${c.stage} 의 objectiveId 가 부적합합니다: ${JSON.stringify(c.spec.objectiveId)}`,
          '   L2 의 분모가 칸에서 나오므로, 이것을 놓치면 커버리지가 조용히 부풀거나 줄어듭니다.']);
      }
    }
    for (const c of cells) {
      if (arr(c.spec.params).length === 0) {
        await server.close();
        die('E5', [`🔴 E5 — '${p}' ${c.stage} 의 params 가 **빈 배열**입니다.`]);
      }
    }
    cellsOf.set(p, cells);
  }

  /* ---------- E3 · E4 ---------- */
  const pidSet = new Set(pids);
  for (const r of rules) {
    if (!pidSet.has(r.processId)) {
      await server.close();
      die('E3', [`🔴 E3 — 규칙 '${r.id}' 의 processId '${r.processId}' 가 PIDS 에 없습니다.`]);
    }
    if (typeof r.inputName !== 'string' || !NAME_RE.test(r.inputName)) {
      await server.close();
      die('E4', [`🔴 E4 — 규칙 '${r.id}' 의 inputName 이 부적합합니다: ${JSON.stringify(r.inputName)}`]);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     판정 — 🔴 **이 세 줄이 정본이다.** 명세 §2-1 에서 벗어나지 않는다.
     ══════════════════════════════════════════════════════════════════════════ */
  const poolOf = new Map();
  for (const p of pids) {
    poolOf.set(p, new Set(cellsOf.get(p).flatMap((c) => arr(c.spec.params).map((q) => q.id))));
  }
  const manipulable = (r) => poolOf.get(r.processId).has(r.inputName);   // Set.has === 완전 일치

  /* A12-CO(부가) — 같은 칸에서 원인도 만지고 출력도 보이는가. 고지 전용. */
  const manipulableObserved = (r) => cellsOf.get(r.processId).some((c) => {
    const ps = new Set(arr(c.spec.params).map((q) => q.id));
    if (!ps.has(r.inputName)) return false;
    const os = new Set(arr(c.spec.outputs).map((o) => o.id));
    return arr(r.expect).every((e) => os.has(e.output));
  });

  await server.close();

  /* ---------- 집계 ---------- */
  const report = [];
  let totalC = 0;
  let totalCO = 0;
  for (const p of pids) {
    const mine = rules.filter((r) => r.processId === p);
    const cells = cellsOf.get(p);
    const pool = poolOf.get(p);
    const fixedIds = new Set(cells.flatMap((c) => arr(c.spec.fixedConditions).map((f) => f.id)));
    const rows = mine.map((r) => {
      const ok = manipulable(r);
      let where = null;
      if (ok) {
        for (const c of cells) {
          const hit = arr(c.spec.params).find((q) => q.id === r.inputName);
          if (hit) { where = { stage: c.stage, q: hit }; break; }
        }
      }
      return {
        id: r.id,
        inputName: r.inputName,
        manipulable: ok,
        observed: manipulableObserved(r),
        outputs: arr(r.expect).map((e) => e.output),
        where,
        inFixed: fixedIds.has(r.inputName),
      };
    });
    const cCount = rows.filter((x) => x.manipulable).length;
    const coCount = rows.filter((x) => x.observed).length;
    totalC += cCount;
    totalCO += coCount;
    report.push({
      pid: p, declared: mine.length, c: cCount, co: coCount,
      poolIds: [...pool].sort(), fixedIds: [...fixedIds].sort(), rows,
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     L2 — **방향성 학습목표(LO) 커버리지**  (2026-08-22 신설 · 오케 추가 집행)
     ══════════════════════════════════════════════════════════════════════════
     🔴 정본 정의는 **PLN 이 판정했다. 이 게이트가 고르지 않는다.**
        `threads/PLN-8대공정-001.md` §26D · 판별식 C1∧C2.

        L2-CO(입력 기준) := LO L 이 「규칙이 있다」 :⟺
              ∃ R ∈ AllRules : R.processId === cell(L).processId
                             ∧ R.inputName ∈ Params(cell(L))

     🔴 왜 「입력 기준」인가 — PLN 이 세 정의를 재 봤고 결과가 갈렸다:
          입력만 13 · 입력+전출력 13 · 입력+**판정출력만** 9.
        판정출력(role:'judge')만 보는 정의를 쓰면 커버리지가 내려가는 게 아니라
        **보호해야 할 4칸이 보호 대상에서 사라진다**(§26D-1). 그래서 입력 기준이다.
        🔵 나머지 두 정의도 **함께 찍는다** — 고르는 것이 아니라 갈리는 지점을 드러내는 것이다.

     🔴 분모는 「방향성 LO 24건」이고, 그것은 곧 **LabSpec 칸 24개**다(칸 1개 = LO 1개).
        비방향성 16건(`-01`·`-02`)은 담당 칸이 아예 없다(N1 조작 없음) — 분모에 넣지 않는다.
     ══════════════════════════════════════════════════════════════════════════ */
  const loRows = [];
  for (const p of pids) {
    for (const c of cellsOf.get(p)) {
      const ps = new Set(arr(c.spec.params).map((q) => q.id));
      const osAll = new Set(arr(c.spec.outputs).map((o) => o.id));
      const osJudge = new Set(arr(c.spec.outputs).filter((o) => o.role === 'judge').map((o) => o.id));
      const mine = rules.filter((r) => r.processId === p);
      const hitIn = mine.filter((r) => ps.has(r.inputName));
      const hitAll = hitIn.filter((r) => arr(r.expect).every((e) => osAll.has(e.output)));
      const hitJudge = hitIn.filter((r) => arr(r.expect).every((e) => osJudge.has(e.output)));
      /* 노브 단위 — 이 칸의 슬라이더 하나하나가 규칙을 갖는가. */
      const knobs = arr(c.spec.params).map((q) => ({
        id: q.id,
        covered: mine.some((r) => r.inputName === q.id),
      }));
      loRows.push({
        lo: c.spec.objectiveId, pid: p, stage: c.stage,
        coveredIn: hitIn.length > 0, ruleIds: hitIn.map((r) => r.id),
        coveredAllOut: hitAll.length > 0, coveredJudgeOut: hitJudge.length > 0,
        knobs, knobTotal: knobs.length, knobCovered: knobs.filter((k) => k.covered).length,
      });
    }
  }
  const loTotal = loRows.length;
  const loCovered = loRows.filter((x) => x.coveredIn).length;
  const loCoveredAllOut = loRows.filter((x) => x.coveredAllOut).length;
  const loCoveredJudge = loRows.filter((x) => x.coveredJudgeOut).length;
  const knobTotal = loRows.reduce((a, x) => a + x.knobTotal, 0);
  const knobCovered = loRows.reduce((a, x) => a + x.knobCovered, 0);
  /* 역방향 — 어느 LO 에도 안 붙는 규칙. manipulable 이 아닌 규칙과 같은 집합이다. */
  const orphanRules = rules.filter((r) => !manipulable(r));
  const pct = (a, b) => (b === 0 ? '0.0' : ((a / b) * 100).toFixed(1));

  /* ══════════════════════════════════════════════════════════════════════════
     🔴 차단 판정 — **여기가 A12 채택의 실체다.** 두 조건뿐이다.
     ══════════════════════════════════════════════════════════════════════════
       ① L2  방향성 LO 커버리지 100 % 미만          (PLN §26B-12-4 L2 · AC-6)
       ② 래칫 공정별 조작가능 수 < 기준선            (PLN §26B-12-4 L1 · AC-2)
     ⛔ 「공정당 5」는 **여기 없다.** 절대수 하한은 §26B-12-3 이 폐기했다(AC-3).
     ══════════════════════════════════════════════════════════════════════════ */
  const ratchet = report.map((r) => ({
    pid: r.pid,
    now: r.c,
    base: A12C_BASELINE[r.pid],
    regressed: r.c < A12C_BASELINE[r.pid],
    /* 🔴 기준선 0 = 래칫 사각지대. 「지켰다」가 아니라 「잴 것이 없다」. */
    blind: A12C_BASELINE[r.pid] === 0,
  }));
  const ratchetFails = ratchet.filter((x) => x.regressed);
  const ratchetBlind = ratchet.filter((x) => x.blind);

  const l2ByProcess = pids.map((p) => {
    const rows = loRows.filter((x) => x.pid === p);
    const n = rows.filter((x) => x.coveredIn).length;
    return { pid: p, covered: n, total: rows.length, full: n === rows.length };
  });
  const l2Fails = l2ByProcess.filter((x) => !x.full);

  const blocking = [];
  for (const x of l2Fails) {
    blocking.push(`L2 공정 '${x.pid}': 방향성 LO 커버리지 ${x.covered}/${x.total} — **100 % 가 아니다.** `
      + `규칙 없는 칸: ${loRows.filter((y) => y.pid === x.pid && !y.coveredIn).map((y) => y.lo).join(', ')}`);
  }
  for (const x of ratchetFails) {
    blocking.push(`래칫 공정 '${x.pid}': 조작가능 ${x.now}건 < 기준선 ${x.base}건 — **후퇴다.** `
      + '기준선 파일을 내려서 통과시키지 말고 배선을 되돌리십시오(scripts/lib/a12c-baseline.mjs).');
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      totalC, totalCO, declared: rules.length, processes: report,
      l2: {
        total: loTotal, covered: loCovered,
        coveredAllOut: loCoveredAllOut, coveredJudgeOut: loCoveredJudge,
        uncovered: loRows.filter((x) => !x.coveredIn).map((x) => x.lo).sort(),
        knobTotal, knobCovered,
        orphanRules: orphanRules.length,
        rows: loRows,
        byProcess: l2ByProcess,
      },
      ratchet: {
        measuredAt: A12C_BASELINE_MEASURED_AT,
        rows: ratchet,
        regressed: ratchetFails.map((x) => x.pid),
        blindZeroBaseline: ratchetBlind.map((x) => x.pid),
      },
      targetPerProcess: A12C_TARGET_PER_PROCESS,   // 🔴 비차단 표시 전용
      blocking,
      verdict: blocking.length === 0 ? 'PASS' : 'FAIL',
    }, null, 2));
    /* 🔴 `--json` 도 같은 종료코드를 낸다. 형식이 판정을 바꾸면 그것이 우회로다. */
    process.exit(blocking.length === 0 ? 0 : 1);
  }

  /* ---------- 출력 (O-1 ~ O-6) ---------- */
  console.log('check-a12c — A12-C 「조작 가능한 방향성 규칙」 계수');
  console.log(`  소스: ${path.relative(APP, SRC) || 'src'}/   (런타임 데이터로 셉니다 — 텍스트 파서 아님)`);
  console.log('');
  console.log('  🔴 이 계측기가 **못 보는 것** (명세 §8 — 지우지 마십시오):');
  for (const b of BLIND_SPOTS) console.log(`     ${b}`);
  console.log('');
  console.log('  🔴 이 게이트는 **차단합니다**(2026-08-22 A12 채택). 차단 조건은 **둘뿐**입니다:');
  console.log('     ① L2 방향성 LO 커버리지 < 100 %          → FAIL');
  console.log('     ② 래칫 공정별 조작가능 수 < 기준선        → FAIL');
  console.log(`     ⛔ 「공정당 ${A12C_TARGET_PER_PROCESS}개 이상」 절대수 하한은 **차단 조건이 아닙니다** — PLN §26B-12-3 폐기안입니다.`);
  console.log(`        아래 「목표 ${A12C_TARGET_PER_PROCESS}」는 **비차단 표시 전용**입니다(AC-3).`);
  console.log(`  기준선: scripts/lib/a12c-baseline.mjs (실측 ${A12C_BASELINE_MEASURED_AT})`);
  console.log('');

  for (const row of report) {
    const b = A12C_BASELINE[row.pid];
    const flag = row.c < b ? '  🔴 **래칫 후퇴**' : (b === 0 ? '  🔴 기준선 0 = 미착수' : '');
    console.log(`[A12-C] ${row.pid.padEnd(11)} 선언 ${String(row.declared).padStart(2)} · 조작가능 ${row.c} · 기준선 ${b} · 목표 ${A12C_TARGET_PER_PROCESS}${flag}`);
    for (const x of row.rows) {
      if (!x.manipulable) continue;
      const q = x.where.q;
      const rng = `[${q.min}~${q.max} /${q.step}${q.unit ? ' ' + q.unit : ''}]`;
      console.log(`        ✔ ${x.id.padEnd(8)} ${x.inputName.padEnd(22)} ← ${x.where.stage.padEnd(12)} ${rng}   out: ${x.outputs.join(', ')}`);
    }
    for (const x of row.rows) {
      if (x.manipulable) continue;
      console.log(`        ✘ ${x.id.padEnd(8)} ${x.inputName.padEnd(22)} ← ${row.pid} params[] 에 없음`);
      if (x.inFixed) {
        console.log(`                                            🔴 **고정조건(fixedConditions)에 있음 — 보이지만 못 만진다**`);
      }
    }
    console.log(`          params[] = ${row.poolIds.join(', ')}`);
    if (row.fixedIds.length > 0) console.log(`          fixedConditions[] = ${row.fixedIds.join(', ')}`);
    console.log('');
  }

  console.log('───────────────────────────────────────────────');
  console.log(`  선언 ${rules.length}건 · **A12-C ${totalC}건** · A12-CO ${totalCO}건`);
  const per = report.map((r) => `${r.pid} ${r.c}`).join(' · ');
  console.log(`  공정별: ${per}`);
  if (totalC !== totalCO) {
    console.log('  ⚠️  WARN — A12-C 와 A12-CO 가 다릅니다. 「만질 수는 있는데 결과가 같은 칸에 안 나온다」는 뜻이고');
    console.log('           그것은 실재 배선 결함입니다. (차단은 하지 않습니다 — 고지 전용)');
  } else {
    console.log('  ✅ A12-C 와 A12-CO 가 같습니다(값·구성원).');
  }

  /* ---------- 래칫 ---------- */
  console.log('');
  console.log('═══════ 래칫 · 후퇴 금지 ═══════');
  console.log(`  기준선 정본: scripts/lib/a12c-baseline.mjs (실측 ${A12C_BASELINE_MEASURED_AT})`);
  console.log(`  ${ratchet.map((x) => `${x.pid} ${x.now}/${x.base}`).join(' · ')}   (현재/기준선)`);
  if (ratchetFails.length > 0) {
    for (const x of ratchetFails) {
      console.log(`  🔴 **후퇴** ${x.pid}: ${x.now} < 기준선 ${x.base}`);
    }
  } else {
    console.log('  ✅ 후퇴 없음 — 단, 아래 사각지대를 함께 읽으십시오.');
  }
  /* 🔴 **매 실행 명시한다.** PLN AC-5 가 지목한 이 안의 유일한 약점이다. */
  console.log('');
  console.log(`  🔴🔴 **기준선 0 = 미착수** (합격이 아닙니다): ${ratchetBlind.length > 0 ? ratchetBlind.map((x) => x.pid).join(' · ') : '없음'}`);
  if (ratchetBlind.length > 0) {
    console.log('     이 공정들에서 **래칫은 아무것도 막지 못합니다** — 0 아래로는 내려갈 수 없기 때문입니다.');
    console.log('     「0 을 유지하는 것」이 래칫상으로는 통과지만 그것은 합격이 아니라 **미착수**입니다.');
    console.log('     🔴 이 두 공정을 잡는 것은 래칫이 아니라 **아래 L2 커버리지 100 %** 조건뿐입니다(PLN AC-5).');
  }
  /* ---------- L2 출력 ---------- */
  console.log('');
  console.log('═══════ L2 · 방향성 학습목표(LO) 커버리지 ═══════');
  console.log('  정의: PLN §26D 판별식 — 정본은 **입력 기준**(L2-CO). 이 게이트가 고른 것이 아닙니다.');
  console.log('  분모: 방향성 LO 24건 = LabSpec 칸 24개. 비방향성 16건(-01·-02)은 담당 칸이 없어(N1) 제외.');
  console.log('');
  for (const p of pids) {
    const rows = loRows.filter((x) => x.pid === p);
    const n = rows.filter((x) => x.coveredIn).length;
    const wipe = n === 0 ? '   🔴 **공정 전멸**' : '';
    console.log(`  ${p.padEnd(11)} ${n}/${rows.length}${wipe}`);
    for (const x of rows) {
      const mark = x.coveredIn ? '✔' : '✘';
      const why = x.coveredIn
        ? `규칙 ${x.ruleIds.join(', ')}`
        : '🔴 **규칙 없음** — 이 칸의 어떤 슬라이더도 방향성 규칙을 갖지 않는다';
      console.log(`        ${mark} ${x.lo}  (${x.stage.padEnd(12)})  노브 ${x.knobCovered}/${x.knobTotal}  ${why}`);
    }
  }
  console.log('');
  console.log('  ───────────────────────────────────────────────');
  console.log(`  🔵 **LO 단위   ${loCovered}/${loTotal} (${pct(loCovered, loTotal)} %)**   ← 정본(입력 기준)`);
  console.log(`  🔴 **노브 단위 ${knobCovered}/${knobTotal} (${pct(knobCovered, knobTotal)} %)**  ← 같은 사실의 다른 해상도`);
  console.log('');
  console.log('  🔴🔴 **두 수를 반드시 함께 읽으십시오 — PLN 이 스스로 신고한 과대평가입니다.**');
  console.log('     「LO 단위는 보호 수준을 과대평가한다.」 LO 는 노브가 **하나라도** 규칙을 가지면 「커버」로 세어진다.');
  const worst = loRows
    .filter((x) => x.coveredIn && x.knobTotal > 0)
    .sort((a, b) => (a.knobCovered / a.knobTotal) - (b.knobCovered / b.knobTotal))[0];
  if (worst) {
    console.log(`     실례: ${worst.lo} 는 노브 ${worst.knobTotal}개 중 **${worst.knobCovered}개**만 규칙이 있는데 「커버」로 세어집니다.`);
  }
  console.log('');
  console.log(`  정의가 갈리는 지점(고지 전용 · 고르지 않습니다): 입력만 ${loCovered} · 입력+전출력 ${loCoveredAllOut} · 입력+판정출력만 ${loCoveredJudge}`);
  if (loCoveredJudge !== loCovered) {
    console.log(`     🔴 판정출력만 보는 정의를 쓰면 ${loCovered - loCoveredJudge}칸이 **보호 대상에서 사라집니다**(§26D-1). 그래서 입력 기준이 정본입니다.`);
  }
  const uncovered = loRows.filter((x) => !x.coveredIn).map((x) => x.lo);
  console.log('');
  console.log(`  🔴 규칙 없음 ${uncovered.length}건: ${uncovered.join(' · ')}`);
  const wiped = pids.filter((p) => loRows.filter((x) => x.pid === p).every((x) => !x.coveredIn));
  if (wiped.length > 0) console.log(`  🔴 공정 전멸 ${wiped.length}개: ${wiped.join(' · ')}`);
  console.log(`  🔴 역방향 — 규칙 ${rules.length}개 중 **${orphanRules.length}개(${pct(orphanRules.length, rules.length)} %)** 가 어느 LO 에도 붙지 않습니다.`);
  console.log('');
  console.log('  🔴 L2 가 못 보는 것(위 B-1~B-7 에 더해 다시 강조):');
  console.log('     B-5 「규칙이 있다」이지 **「그 규칙이 옳다」가 아니다** — 방향이 틀려도 커버로 센다.');
  console.log('     B-6 명목형 노브(예: concernIndex)는 방향 자체가 정의되지 않아 A12 가 검사할 수 없다(§26D-1 B-4).');

  /* ══════════════════════════════════════════════════════════════════════════
     최종 판정
     ══════════════════════════════════════════════════════════════════════════ */
  console.log('');
  console.log('═══════════════════════════════════════════════');
  if (blocking.length === 0) {
    console.log('✅ check-a12c 통과 — L2 커버리지 100 % · 래칫 후퇴 없음.');
    console.log('   🔴 통과는 **B-1~B-7 사각지대 안에서의 통과**입니다. 위 목록을 함께 읽으십시오.');
    process.exit(0);
  }
  console.error(`❌ check-a12c 실패 (${blocking.length}건) — 🔴 전건 목록`);
  for (const b of blocking) console.error(`  ${b}`);
  console.error('');
  console.error('  🔴 이 게이트는 2026-08-22 A12 채택으로 **차단 게이트가 되었습니다.**');
  console.error('     채택은 **완화가 아닙니다** — 채택 시점의 L2 는 13/24(54.2 %) 로 이미 불합격이었습니다.');
  console.error('     완화로 통과시키지 마십시오(D-041):');
  console.error('       ⛔ 기준선 파일의 수를 내리는 것          → 후퇴를 지우는 행위입니다');
  console.error('       ⛔ 판정을 끄는 플래그를 만드는 것        → 우회로입니다');
  console.error('       ⛔ inputName 을 params[] 이름에 맞추기만 하는 것 → B-1 그대로입니다(단위를 안 봅니다)');
  console.error('     유일한 해결은 **학습자가 만질 수 있는 노브에 방향성 규칙을 실제로 붙이는 것**입니다.');
  process.exit(1);
}

main().catch((err) => {
  console.error('🔴 예기치 못한 오류:', err);
  console.error('   계측 실패로 처리합니다. exit 2.');
  process.exit(2);
});
