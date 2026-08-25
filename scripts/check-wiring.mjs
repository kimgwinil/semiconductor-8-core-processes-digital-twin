#!/usr/bin/env node
/**
 * 🔴 배선 게이트 — 「선언했는데 아무도 호출하지 않는」 결함을 잡는다.
 *
 * 이 유형이 오늘 두 번 났고 둘 다 **테스트는 전부 통과하는데 화면에는 없었다**:
 *  ① `registerPhysics()` 를 아무도 호출하지 않아 방향성 규칙이 화면에 0건
 *  ② `registry.ts` 를 아무도 import 하지 않아 등급 리졸버가 미설치 →
 *     개발자용 기본 문자열(`SYNTHETIC_NOTICE_MISSING`)이 UI 배지로 샜다
 *
 * 검사:
 *  W1. `src/**` 의 `export function registerXxx()` 는 **자기 파일 밖에서 최소 1회 호출**돼야 한다
 *  W2. 전역 설치자(`__setXxx(...)`)를 호출하는 모듈은 **어딘가에서 import** 돼야 한다
 *      (import 되지 않으면 그 부수효과가 영원히 실행되지 않는다)
 *  W3. physics 모듈이 배럴에서 빠지지 않았는가
 *  W4. 🔴 배럴에서 재수출되는 **컴포넌트**는 JSX 호출부가 최소 1곳 있어야 한다
 *  W5. 🔴 **export 된 컴포넌트 전부**(배럴 여부 무관)는 자기 파일 밖 JSX 호출부가 최소 1곳 있어야 한다
 *      — W4 는 「배럴 전용」만 봐서, 산 컴포넌트와 **같은 파일**에 있는 死코드를 놓쳤다
 *      (2026-08-20 — `Overlay` 외 3종이 배럴에만 있어 전송되면서 아무 화면에도 안 떴다)
 *  W6. 🔴 **칸 단위 배선률** — W1~W5 는 「쓰이는가」만 본다. 「얼마나 쓰이는가」는 아무도 안 봤다
 *      (2026-08-21 — 차트 3종이 호출부 1곳으로 W4·W5 를 통과하는데, 실습 24칸 중 차트가 붙은
 *       칸은 4칸, 「판정은 이 차트에서 한다」선언은 **1건**뿐이었다. 배선률 17 % 인데 전부 초록)
 *
 * 사용:
 *   node scripts/check-wiring.mjs                판정(위반이 있으면 exit 1)
 *   node scripts/check-wiring.mjs --root=<경로>  🔴 **W6 만** 픽스처 트리에 대해 돌린다(self-test 전용)
 *                                                W1~W5 는 스캔 대상이 없어 0건이 된다
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve as pathResolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(APP, 'src');
/** 🔴 self-test 픽스처 전용. 주어지면 W1~W5 는 돌지 않고 W6 만 이 트리의 랩 모듈을 본다. */
const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='));
const SCOPED = ROOT_ARG ? pathResolve(APP, ROOT_ARG.slice('--root='.length)) : null;

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 주석·문자열 제거(줄 수 보존) — 설명문 속 단어를 호출로 오인하지 않기 위해. */
function strip(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += ' '; i++; } out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/* 🔴 스코프 실행에서는 정적 스캔(W1~W5)을 돌리지 않는다.
 *    픽스처 트리에는 컴포넌트도 배럴도 없어 검사할 것이 없고, W1~W5 는 이미 실파일 픽스처로 검증된다.
 *    (같은 이유로 check-constants 도 `--root` 에서는 썩음 판정을 끈다.) */
const files = SCOPED ? [] : walk(SRC);
const code = new Map();   // 주석·문자열 제거본 (호출 탐지용)
const rawSrc = new Map();  // 🔴 원문 (import 경로 탐지용 — 경로는 문자열 리터럴이라 strip 하면 사라진다)
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  rawSrc.set(f, raw);
  code.set(f, strip(raw));
}

const errors = [];
let w1 = 0; let w2 = 0; let w3 = 0;

// ---------- W1: register* 함수는 밖에서 호출돼야 한다 ----------
for (const [file, src] of code) {
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(register[A-Z]\w*)\s*\(/g)) {
    const name = m[1];
    w1++;
    let called = false;
    for (const [other, osrc] of code) {
      if (other === file) continue;
      if (new RegExp(`\\b${name}\\s*\\(`).test(osrc)) { called = true; break; }
    }
    if (!called) {
      errors.push(
        `[W1] ${relative(APP, file)}: '${name}()' 를 아무도 호출하지 않습니다. ` +
        `선언만 하고 배선하지 않으면 테스트는 통과해도 화면에는 나오지 않습니다.`,
      );
    }
  }
}

// ---------- W2: 전역 설치자를 호출하는 모듈은 import 돼야 한다 ----------
for (const [file, src] of code) {
  const installer = src.match(/__set[A-Z]\w*\s*\(/);
  if (!installer) continue;
  // 설치자를 "정의"만 하는 파일(예: contract.ts 의 export function __setX)은 제외
  if (new RegExp(`export\\s+function\\s+${installer[0].replace(/\s*\($/, '')}`).test(src)) continue;
  w2++;
  const stem = basename(file).replace(/\.tsx?$/, '');
  let imported = false;
  for (const [other, osrc] of rawSrc) {
    if (other === file) continue;
    if (new RegExp(`from\\s+['"][^'"]*\\b${stem}['"]|import\\s+['"][^'"]*\\b${stem}['"]`).test(osrc)) { imported = true; break; }
  }
  if (!imported) {
    errors.push(
      `[W2] ${relative(APP, file)}: 전역 설치자(${installer[0].slice(0, -1)})를 호출하는데 이 모듈을 아무도 import 하지 않습니다. ` +
      `부수효과가 실행되지 않아 기본값이 화면으로 샙니다.`,
    );
  }
}


// ---------- W3: physics 모듈이 배럴에서 빠지지 않았는가 ----------
// 🔴 오늘 `registerPhysics()` 미호출·registry 미import 가 났다. 배럴 누락도 같은 계열이다 —
//    동작에는 무관해 보여도 「선언했는데 아무도 안 쓰는」 상태가 조용히 쌓인다.
{
  const barrel = join(SRC, 'models', 'physics', 'index.ts');
  if (existsSync(barrel)) {
    const bsrc = readFileSync(barrel, 'utf8');
    for (const f of files) {
      const rel = relative(APP, f).replace(/\\/g, '/');
      const m = rel.match(/^src\/models\/physics\/([^/]+)\/([^/]+)\.ts$/);
      if (!m) continue;
      const [, proc, mod] = m;
      if (mod === 'rules' || mod === 'index') continue;      // 규칙·배럴은 별도 경로로 등록된다
      const src = rawSrc.get(f) ?? '';
      if (!/^export\s/m.test(src)) continue;                  // 내보내는 게 없으면 대상 아님
      w3++;
      // 🔴 배럴에 있으면 공개 API, 없어도 형제 모듈이 쓰면 내부 헬퍼다. 둘 다 아니면 **죽은 모듈**이다.
      //    내부 헬퍼(units·specialFunctions 류)까지 배럴을 강제하면 export * 이름 충돌이 난다 —
      //    실제로 그래서 이 규칙을 고쳤다.
      // 🔴 접두 일치 함정: `./wafer/probe` 가 `./wafer/probeExtra` 에도 걸린다.
      //    경로 뒤에 **따옴표가 오는지**까지 확인해 경계를 준다.
      const inBarrel = new RegExp(`\\./${proc}/${mod}['\"]`).test(bsrc);
      if (inBarrel) continue;
      let usedBySibling = false;
      for (const [other, osrc] of rawSrc) {
        if (other === f) continue;
        if (new RegExp(`from\\s+['"][^'"]*/${mod}['"]`).test(osrc)) { usedBySibling = true; break; }
      }
      if (!usedBySibling) {
        errors.push(
          `[W3] ${rel}: physics 배럴에도 없고 아무도 import 하지 않습니다 — 죽은 모듈입니다. ` +
          `공개 API 면 배럴에 넣고, 내부 헬퍼면 형제 모듈이 쓰게 하세요.`,
        );
      }
    }
  }
}

// ---------- W4: 배럴에서 재수출되는 컴포넌트는 **JSX 호출부**가 있어야 한다 ----------
// 🔴 2026-08-20 실사고. `viz/index.ts` 가 `Overlay` 를 재수출하는데 **JSX 호출부가 0곳**이었다.
//    W3 는 physics 배럴만 보고, W1·W2 는 함수·설치자만 본다 — 셋 다 이걸 못 잡았다.
//    「배럴에 있으니 공개 API」라는 W3 의 면제 논리가 여기서는 **정확히 반대로** 작동했다:
//    배럴에만 있으면 트리셰이킹이 걸리지 않아 **사용자에게 전송되면서 아무 화면에도 안 뜬다.**
//    실측 결과 Overlay 외에 차트 3종도 같은 상태였다(계 4종).
//
//    🔴 부분문자열 금지(§7-3): `<Name` 뒤에 **경계 문자**(공백·`/`·`>`·줄바꿈)가 오는지까지 본다.
//       그러지 않으면 `<Line` 이 `<LineChart` 에 걸린다.
let w4 = 0;
{
  const barrels = [...rawSrc.keys()].filter((f) => /(^|[\\/])index\.ts$/.test(f));
  for (const barrel of barrels) {
    const bsrc = rawSrc.get(barrel) ?? '';
    for (const m of bsrc.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
      // `export type { … }` 은 값이 아니므로 대상이 아니다.
      if (/export\s*type\s*\{/.test(m[0])) continue;
      for (const rawName of m[1].split(',')) {
        const name = rawName.trim().split(/\s+as\s+/).pop()?.trim();
        if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;   // PascalCase = 컴포넌트로 본다
        w4++;
        const re = new RegExp(`<${name}(?=[\\s/>\n])`);
        let used = false;
        /* 🔴 2026-08-21 — `rawSrc` 가 아니라 **`code`(주석·문자열 제거본)** 를 본다.
         *    종전에는 원문을 봐서 주석 속 `<Overlay />` 나 문자열 리터럴 하나만 있어도
         *    「호출부 있음」으로 통과했다. 실측하니 오늘자 판정 변화는 0건이었지만
         *    (배럴 재수출 컴포넌트 3개 전수 대조) 언제든 터질 잠재 구멍이라 닫는다. */
        for (const [other, osrc] of code) {
          if (other === barrel) continue;
          if (re.test(osrc)) { used = true; break; }
        }
        if (!used) {
          errors.push(
            `[W4] ${relative(APP, barrel)}: 컴포넌트 '${name}' 를 재수출하는데 **JSX 호출부가 0곳**입니다. ` +
            `배럴에만 있으면 트리셰이킹이 걸리지 않아 사용자에게 전송되면서 아무 화면에도 뜨지 않습니다. ` +
            `쓰는 곳을 만들거나, 배럴에서 빼고 파일을 옮기세요.`,
          );
        }
      }
    }
  }
}

// ---------- W5: export 된 컴포넌트는 **파일 위치와 무관하게** JSX 호출부가 있어야 한다 ----------
/* 🔴 2026-08-21 — W4 의 사각지대를 닫는다.
 *
 *    W4 는 「**배럴에서 재수출되는** 컴포넌트」만 본다. 그래서 이런 게 빠져나간다:
 *      `src/ui/widgets/SourceBadge.tsx` 가 `SourceBadge` 와 `QuantityView` 를 **같이** export 하고,
 *      그 파일은 `SourceBadge` 때문에 import 된다 → 「배럴 전용」이 아니라서 W4 의 그물 밖이다.
 *      `QuantityView` 는 주석에 「실습 화면은 이 컴포넌트만 쓴다」고 적혀 있는데 호출부가 0곳이다.
 *      **주석이 거짓말을 하고 있었고, 게이트는 그걸 확인해 주지 않았다.**
 *
 *    이 프로젝트는 「호출부 0 컴포넌트」 유형으로 이미 4종을 격리했다. W5 가 잡은 게 5·6번째다.
 *
 * ── 🔴 강화 전 전수 실측 (규율 2 — 몇 건이 걸리는지 모른 채 조이지 않는다) ──
 *    `src` 아래 모든 `.tsx` 에서 export 된 컴포넌트 **24개** 전수 대조 결과:
 *      · 정상(자기 파일 밖 JSX 호출부 ≥1) ....... 22개
 *      · 🔴 호출부 0곳 ......................... 2개
 *          - `SwapIcon`     (src/ui/icons/SwapIcon.tsx)      ← LabRunner 가 **import 만** 하고 안 쓴다
 *          - `QuantityView` (src/ui/widgets/SourceBadge.tsx) ← 아무도 import 조차 안 한다
 *      · 테스트/스토리에서만 사용 ................ 0개
 *    오탐 0건이었다(둘 다 육안으로 死코드임을 확인했다).
 *
 * 🔴 부분문자열 금지(§7-3): `<Name` 뒤가 **식별자 문자가 아님**을 확인한다.
 *    그러지 않으면 `<Icon` 이 `<IconProps`·`<IconButton` 에 걸린다. 이 프로젝트가 5번 당한 사고다.
 * 🔴 탐지는 `code`(주석·문자열 제거본)로 한다. 주석 속 예시 코드는 호출부가 아니다.
 * 🔴 자기 파일 안의 사용은 호출부로 세지 않는다 — 그래야 「자기들끼리만 쓰는 死코드」가 잡힌다.
 * 🔴 테스트·스토리 파일에서만 쓰이는 것도 호출부 0 으로 센다(제품에서는 死코드다). 따로 표시한다.
 */
const isTestFile = (f) => /(^|[\/])tests[\/]/.test(f) || /\.(test|spec|stories)\.[jt]sx?$/.test(f);
let w5 = 0;
{
  /* 컴포넌트 판정: `.tsx` 에서 **함수 형태로** export 된 PascalCase.
   * 함수 형태로 좁힌 이유 — `export const SomeTable = { … }` 같은 PascalCase 객체 상수를
   * 컴포넌트로 오인하지 않기 위해서다. 실측 24건 전부 실제 컴포넌트였다(오탐 0). */
  const declRes = [
    /^\s*export\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/,
    /^\s*export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/,
    /^\s*export\s+const\s+([A-Z][A-Za-z0-9]*)\s*(?::[^=]+)?=\s*(?:\(|function)/,
  ];
  for (const [file, src] of code) {
    if (!file.endsWith('.tsx') || isTestFile(file)) continue;
    src.split('\n').forEach((ln, i) => {
      for (const re of declRes) {
        const m = ln.match(re);
        if (!m) continue;
        const name = m[1];
        w5++;
        const use = new RegExp(`<${name}(?![A-Za-z0-9_$])`);
        const callers = [];
        for (const [other, osrc] of code) {
          if (other === file) continue;              // 자기 파일 사용은 안 센다
          if (use.test(osrc)) callers.push(other);
        }
        const product = callers.filter((c) => !isTestFile(c));
        if (product.length === 0) {
          const onlyTests = callers.length > 0;
          errors.push(
            `[W5] ${relative(APP, file)}:${i + 1}: 컴포넌트 '${name}' 의 **JSX 호출부가 0곳**입니다` +
            `${onlyTests ? ` (테스트에서만 사용: ${callers.map((c) => relative(APP, c)).join(', ')} — 제품에서는 死코드입니다)` : ''}. ` +
            `자기 파일 밖 어디에서도 <${name}> 로 쓰이지 않습니다. ` +
            `쓰는 곳을 만들거나 파일째 지우세요. (import 만 되어 있고 렌더되지 않는 것도 여기 걸립니다)`,
          );
        }
        break;   // 한 줄에서 한 선언만
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════
 * W6 — 🔴 **칸 단위 배선률.** 「쓰이는가」 다음 층인 「얼마나 쓰이는가」를 본다.
 * ══════════════════════════════════════════════════════════════════════════════════
 *
 * ── 왜 필요한가 (2026-08-21 실측) ────────────────────────────────────────────────
 *   차트 3종(`LineChart`·`BarChart`·`ProfileChart`)은 호출부가 `src/ui/sections/LabCharts.tsx`
 *   **1곳** 있다. 그래서 W4·W5 가 초록이다. 그런데 실습 24칸 중
 *     · 차트가 붙은 칸 ................ 4칸 (figure 5개)
 *     · `judgesOutputs` 선언 .......... **1건** (wafer/lab-applied 의 σ_D)
 *     · 나머지 20칸 ................... 차트 0
 *   PLN `03_실습3단계명세.md` 427행은 **「판정은 이 차트에서 한다」**고 정했는데,
 *   판정 경로 선언이 1건이면 **배선률 4 %** 다. 그런데 모든 게이트가 초록이었다.
 *   이 저장소가 반복해 온 「값이 맞아서 아무도 안 보는 결함」의 새 판본이다.
 *
 * ── 🔴 게이트가 하지 않는 것 ─────────────────────────────────────────────────────
 *   **「몇 칸에 차트가 있어야 하는가」를 이 게이트가 정하지 않는다.** 그건 교육 설계라
 *   PLN 소관이고 목록이 아직 오지 않았다. 그래서 W6 은 전부 **「명세가 요구했는데 비어 있는」**
 *   형태로만 판정한다 — 저장소가 스스로 한 말과 저장소의 실제 상태를 대조한다.
 *
 * ── 🔴 왜 정규식이 아니라 모듈을 실제로 적재하는가 ───────────────────────────────
 *   `charts` 는 `build()` 안에서 만들어지고 `judgesOutputs` 는 다른 파일의 상수를 참조한다.
 *   문자열로 세면 「선언했다고 적힌 것」을 셀 뿐 **실제로 무엇이 배선됐는지**는 알 수 없다.
 *   이 프로젝트에서 부분문자열 검사는 이미 6번 사고를 냈다. `check-passwindow.mjs` 와 같은 방식으로
 *   vite 로 `registerAllLabs()` 를 돌려 **살아 있는 spec 객체**를 보고 판정한다.
 *
 * ── 판정 규칙 ────────────────────────────────────────────────────────────────────
 *   W6-1 「요구표 미충족」  아래 REQUIRED 표가 (칸, 출력) 을 요구했는데
 *                          그 칸의 어느 차트도 그 출력을 `judgesOutputs` 로 선언하지 않았다.
 *   W6-2 「요구표 썩음」    표가 없는 칸 / 없는 출력 / `role !== 'judge'` 인 출력을 가리킨다.
 *                          (표가 조용히 썩으면 다음 위반이 통과한다 — check-constants R4 와 같은 규율)
 *   W6-3 「판정 선언 0인 칸」차트를 가진 칸인데 그 칸 전체의 `judgesOutputs` 총합이 0.
 *                          PLN 427 · `spec.ts` 주석이 **「차트는 보조 그림이 아니라 판정 경로다」**라고
 *                          못 박았다. 선언이 0이면 화면에 「판정은 이 차트에서 합니다」가 뜨지 않아
 *                          (LabCharts.tsx 는 `judged.length > 0` 일 때만 그린다) 학습자에게 장식이 된다.
 *   W6-4 「합격창을 그려 놓고 선언은 안 함」
 *                          차트의 `refLines` 가 어떤 판정 출력의 **합격창 경계값 전부와 정확히 일치**하는데
 *                          그 출력이 이 칸 어디에서도 선언되지 않았다. 값이 일치한다는 것은
 *                          **그 차트가 이미 그 판정을 그리고 있다**는 증거다 — 선언만 빠진 것이다.
 *                          🔴 근사 비교가 아니라 상대오차 1e-12 의 사실상 정확 일치로만 본다.
 *   W6-5 「빈 판정 차트」   `judgesOutputs` 를 선언한 차트인데 기본 파라미터에서 `build()` 가
 *                          던지거나 점을 0개 돌려준다 — 화면에는 빈 그림이 뜬다.
 *
 * ── 🔴 PLN 목록이 도착하면 여기만 채운다 ─────────────────────────────────────────
 *   `REQUIRED` 에 `'<processId>/<stage>': { outputs: ['<출력 id>', …], why: '<근거 행 번호>' }` 를 추가한다.
 *   코드는 한 줄도 고치지 않는다. 표에 넣는 순간 그 칸은 W6-1 로 강제되고,
 *   표가 실재하지 않는 것을 가리키면 W6-2 가 표 자체를 깨뜨린다.
 */

/* 🔴 요구표 — **PLN 이 「판정은 이 차트에서 한다」고 명시한 (칸, 출력)** 만 적는다.
 *    지금 한 줄뿐인 이유: 나머지는 PLN 목록이 오지 않았다. 게이트가 지어내지 않는다. */
const REQUIRED = {
  /* PLN 03_실습3단계명세.md 426·427·431·489행 — 허용치 1 mm 미만이라 잉곳 단면 씬에서 ±0.34 px
     (서브픽셀)로 보이지 않아 **GL 씬에서 빼고 확대 차트로 이관**한 판정. `src/models/labs/spec.ts`
     의 차트 절 주석과 `src/ui/sections/LabCharts.tsx` 머리주석이 같은 행을 인용한다. */
  'wafer/lab-applied': { outputs: ['diameterSigmaMm'], why: 'PLN 03_실습3단계명세.md 426·427·431·489 — σ_D 는 씬에서 서브픽셀이라 확대 차트로 이관됨' },
};

/* 🔴 W6-8 합격창 가시성 임계 — **PLN 판정 대기(J-2)라 일부러 비워 둔다.**
 *
 *   PLN 이 wafer σ_D 확대 차트에 요구한 기준은 「1 mm = 40 px → 0.71 mm 가 28 px」였다.
 *   그런데 그 28 px 이 **모든 차트에 적용되는 일반 기준인지**는 PLN 이 아직 정하지 않았다.
 *   🔴 **여기에 숫자를 지어 넣으면 그 순간 게이트가 교육 설계를 대신 결정한 것이 된다**(D-041).
 *   그래서 값이 `null` 인 동안 W6-8 은 **위반을 세우지 않고 실측치만 참고로 출력**한다.
 *
 *   **PLN 판정이 오면 여기 숫자 하나만 꽂으면 된다. 코드는 고치지 않는다.**
 *   예: 플롯 세로의 8 % 이상을 합격창이 차지해야 한다면  →  0.08
 */
const VISIBILITY_MIN_FRACTION = null;

/** 스코프 실행에서는 픽스처 트리의 `required-charts.json` 을 표로 쓴다(없으면 빈 표). */
function requirementTable() {
  if (!SCOPED) return REQUIRED;
  const p = join(SCOPED, 'required-charts.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

/** vite 가 이해하는 뿌리 상대 경로로 바꾼다(APP 이 뿌리다). */
const viteSpec = (abs) => '/' + relative(APP, abs).split(sep).join('/');

/** 사실상 정확 일치. 부동소수 끝자리만 봐준다. */
const sameNumber = (a, b) => a === b || (Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)));

const LABS_INDEX = SCOPED ? join(SCOPED, 'labs.ts') : join(SRC, 'models', 'labs', 'index.ts');
let w6Labs = 0; let w6Charts = 0; let w6Figures = 0; let w6Decls = 0; let w6Required = 0;
let w6Skipped = null;
const w6Inventory = [];
/** 🔴 위반은 아니지만 다음 사람이 봐야 하는 관찰. 판정에 넣지 않는다(exit code 에 영향 없음). */
const w6Notes = [];
/** 합격창 가시성 실측 — W6-8. 임계가 정해지면 그때 판정으로 승격된다. */
const w6Visibility = [];

/** `compute()` 가 돌려준 Quantity 에서 단위를 꺼낸다. 없으면 null. */
function unitOf(quantities, id) {
  const q = quantities?.[id];
  if (!q || typeof q !== 'object') return null;
  return typeof q.unit === 'string' && q.unit.length > 0 ? q.unit : null;
}

if (!existsSync(LABS_INDEX)) {
  w6Skipped = `${relative(APP, LABS_INDEX)} 이 없습니다 — 미착수로 보고 W6 을 건너뜁니다.`;
} else {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: APP,
    configFile: join(APP, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    // 🔴 순서 의존 — registry 를 labs 보다 **먼저** 적재해야 등급 리졸버가 설치된다(check-passwindow 와 동일).
    await server.ssrLoadModule('/src/models/registry.ts');
    const labsMod = await server.ssrLoadModule(viteSpec(LABS_INDEX));
    labsMod.registerAllLabs();
    const specMod = await server.ssrLoadModule('/src/models/labs/spec.ts');

    const table = requirementTable();
    const seenKeys = new Set();

    for (const key of specMod.registeredLabKeys()) {
      const [processId, stage] = key.split('/');
      const spec = specMod.labSpec(processId, stage);
      if (!spec) continue;
      seenKeys.add(key);
      w6Labs++;

      const charts = spec.charts ?? [];
      const judges = spec.outputs.filter((o) => o.role === 'judge');
      /** 🔴 W6-6 의 판정 대상 — **양측 판정창**(`min`·`max` 둘 다 유한 & `min ≠ max`).
       *  단측 문턱(한쪽만)과 단일점 플래그(`min = max`)는 여기에 들어오지 않는다. 근거는 W6-6 주석. */
      const twoSided = judges.filter((o) => Number.isFinite(o.pass?.min) && Number.isFinite(o.pass?.max)
        && o.pass.min !== o.pass.max);
      /* 🔴 기본 입력에서의 Quantity 를 **칸마다 한 번만** 계산해 W6-4(단위 대조)·W6-7 에서 함께 쓴다.
         단위는 `LabOutput` 에 없고 `compute()` 의 Quantity 에만 있다. 실패해도 판정을 멈추지 않는다 —
         여기서 던지는 것은 W6-5 가 따로 세운다. */
      const baseInputs = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
      let quantities = null;
      try { quantities = spec.compute(baseInputs); } catch { quantities = null; }
      const baseValues = quantities
        ? Object.fromEntries(Object.entries(quantities).map(([id, q]) => [id, q?.value]))
        : null;
      /** 이 칸에서 **어떤 차트든** 판정한다고 선언한 출력 id. */
      const declared = new Set();
      for (const c of charts) for (const id of c.judgesOutputs ?? []) declared.add(id);
      if (charts.length > 0) w6Charts++;
      w6Figures += charts.length;
      w6Decls += declared.size;
      w6Inventory.push({ key, judges: judges.length, twoSided: twoSided.length, charts: charts.length, declared: declared.size, scene: spec.scene?.sceneId ?? null });

      // ── W6-2 요구표 썩음 ───────────────────────────────────────────────────────
      const req = table[key];
      if (req) {
        w6Required += (req.outputs ?? []).length;
        for (const id of req.outputs ?? []) {
          const out = spec.outputs.find((o) => o.id === id);
          if (!out) {
            errors.push(`[W6-2] 요구표가 ${key} 의 출력 '${id}' 를 가리키는데 그런 출력이 없습니다 — **표가 썩었습니다.** 표를 고치거나 출력을 만드세요.`);
            continue;
          }
          if (out.role !== 'judge') {
            errors.push(`[W6-2] 요구표가 ${key} / '${id}' 를 판정 차트로 요구하는데 이 출력은 role='${out.role}' 입니다 — 판정하지 않는 출력을 「판정은 이 차트에서 한다」로 선언할 수 없습니다.`);
            continue;
          }
          // ── W6-1 요구표 미충족 ─────────────────────────────────────────────
          if (!declared.has(id)) {
            errors.push(
              `[W6-1] ${key} / '${id}' (${out.ko}): 명세가 **판정 차트를 요구**하는데 이 칸의 어느 차트도 `
              + `judgesOutputs 로 선언하지 않았습니다 (차트 ${charts.length}개 · 선언 ${declared.size}건). `
              + `근거: ${req.why ?? '(요구표에 근거 미기재)'}`,
            );
          }
        }
      }

      // ── W6-5 선언된 출력의 실재·역할 ────────────────────────────────────────
      for (const c of charts) {
        for (const id of c.judgesOutputs ?? []) {
          const out = spec.outputs.find((o) => o.id === id);
          if (!out) {
            errors.push(`[W6-5] ${key} / 차트 '${c.id}': judgesOutputs 가 '${id}' 를 가리키는데 그런 출력이 없습니다.`);
          } else if (out.role !== 'judge') {
            errors.push(`[W6-5] ${key} / 차트 '${c.id}': judgesOutputs 가 '${id}' 를 가리키는데 role='${out.role}' 입니다 — 판정하지 않는 값을 판정 경로로 표시하고 있습니다.`);
          }
        }
      }

      // ══ W6-6 🔴 **판정 시각 경로가 0인 칸** (2026-08-21 신설) ═══════════════════
      //
      // ── 왜 생겼나 ──────────────────────────────────────────────────────────────
      //   아래 `if (charts.length === 0) continue;` 때문에 **차트가 0개인 칸은 W6-3~W6-5 를
      //   전부 건너뛴다.** 그 결과 「차트가 있고 선언이 없는 칸」은 빨간불인데
      //   **「차트가 아예 없는 칸」은 조용했다** — 더 나쁜 상태가 더 안전해 보이는 역설이다.
      //   실제로 `photo/lab-applied` 는 차트 0개인데 명세(현재 954행)가 그 칸의 판정 근거를
      //   차트에 맡기고 있었고, W6 은 그것을 **구조적으로 볼 수 없었다.**
      //   🔴 잡힌 위반은 고치면 되지만 **안 보이는 위반은 영원히 남는다.**
      //
      // ── 무엇을 세우는가 — 🔴 **아래 문단은 종전(2026-08-21) 판정이다. 다음 절에서 정정됐다** ──
      //   「이 칸에 차트가 **몇 개** 있어야 하는가」는 교육 설계라 **PLN 소관이고 이 게이트는
      //   정하지 않는다.** W6-6 이 세우는 것은 그보다 훨씬 약하고 **사실로만 이루어진 바닥**이다:
      //     **합격/불합격을 가르는 출력이 있는데, 학습자가 그 판정을 볼 화면이 하나도 없다**
      //     (차트 0개 **그리고** 씬 미연결).
      //   이건 「차트가 필요하다」는 주장이 아니라 「판정을 보여줄 무언가가 0개」라는 관찰이다.
      //   그래서 PLN 목록 없이도 세울 수 있고, 세워도 급조 차트를 강요하지 않는다
      //   — 씬을 붙여도 해소된다.
      //
      // ── 🔴 2026-08-22 정정 — 종전 판정문은 **사실이 아니었다** ────────────────────
      //   종전 메시지는 「학습자가 볼 화면이 하나도 없습니다」라고 단정했다. 원본을 읽으면 거짓이다:
      //     `src/ui/sections/LabRunner.tsx:150-157` 판정 배너(`verdict--pass/fail` + 합격 개수)
      //     `src/ui/sections/LabRunner.tsx:159-181` 수치 출력 + `specNote`(합격구간 라벨) + `specFail`
      //   이 둘은 **차트도 씬도 없어도 항상 렌더된다.** 즉 없는 것은 **씬**뿐이고,
      //   합격/불합격 자체는 배너와 수치 패널로 이미 보인다.
      //
      //   그러면 무엇이 진짜로 안 보이는가. **양측 판정창**이다.
      //     `pass: {min, max}` 이고 `min ≠ max` 인 출력은 「위로도 아래로도 벗어나면 탈락」이다.
      //     이건 값 하나로는 못 읽는다 — **곡선이 창 안에 어떻게 놓였는지**를 봐야 배운다.
      //     (대조군: `src/models/labs/oxidation.ts:466,587` 이 그런 양측 창이다 —
      //      🔴 인계받은 근거는 `src/models/physics/oxidation.ts` 로 적혀 있었으나 **그 파일은 없다**.
      //         `physics/oxidation` 은 디렉터리다. 행번호는 맞고 경로만 틀렸다. 2026-08-22 실측 정정.)
      //   반대로 **단측 문턱**(`{min}` 또는 `{max}` 한쪽만)과 **단일점 플래그**(`min = max`)는
      //     「이 수보다 크냐/작냐」·「맞냐 틀리냐」라서 **수치 + 배너로 그대로 읽힌다.**
      //     여기에 차트를 강요하면 급조 차트만 늘어난다.
      //
      //   🔴 그래서 판정은 **`LabSpec.outputs[].pass` 의 값**만 읽는다.
      //      명세에 「이 칸은 차트가 필요 없다」고 문장을 적어 빠져나가는 경로는 만들지 않는다
      //      — 선언이 아니라 값이 판정한다.
      //
      //   개정 시점 실측(2026-08-22, 전 24칸): 양측 창 + 화면 없음 **0칸** ·
      //   단측/단일점만 + 화면 없음 **2칸**(`eds/lab-basic` · `packaging/lab-applied`) · 화면 있음 22칸.
      if (twoSided.length > 0 && charts.length === 0 && !spec.scene?.sceneId) {
        errors.push(
          `[W6-6] ${key}: **양측 판정창(min ≠ max)** 을 가진 출력이 ${twoSided.length}개`
          + `(${twoSided.map((o) => `${o.id} [${o.pass.min}, ${o.pass.max}]`).join(', ')}) 인데 `
          + `**차트 0개 · 씬 미연결**입니다 — 위로도 아래로도 벗어나면 탈락하는 창인데 `
          + `학습자가 그 곡선이 창 안 어디에 놓였는지 볼 차트도 씬도 없습니다. `
          + `(수치 패널과 판정 배너는 LabRunner 가 항상 그리므로 합격/불합격 자체는 보입니다 — `
          + `모자란 것은 **양측 창을 읽을 그림**입니다.) 차트를 붙이거나 씬을 연결해야 해소됩니다 `
          + `(어느 쪽인지는 PLN 교육 설계 소관 — 이 게이트는 「양측 창인데 그림이 0개」라는 사실만 세웁니다).`,
        );
      }

      if (charts.length === 0) continue;

      // ── W6-3 차트는 있는데 판정 선언이 0 ────────────────────────────────────
      if (declared.size === 0) {
        errors.push(
          `[W6-3] ${key}: 차트가 ${charts.length}개(${charts.map((c) => c.id).join(', ')}) 있는데 `
          + `**judgesOutputs 선언이 0건**입니다. 이 칸의 판정 출력 ${judges.length}개(${judges.map((o) => o.id).join(', ') || '없음'}) 중 `
          + `어느 것도 「판정은 이 차트에서 합니다」로 표시되지 않아, LabCharts.tsx 가 그 문구를 그리지 않습니다 — `
          + `학습자에게는 장식으로 보입니다. PLN 427: 「판정은 이 차트에서 한다.」`,
        );
      }

      // ── W6-4 합격창 경계를 refLine 으로 그려 놓고 선언은 안 했다 ────────────
      // 🔴 2026-08-21 강화 — 종전 W6-4 는 **숫자만** 봤다. 그래서 두 구멍이 있었다(독립 검증 R-1·R-2):
      //   R-1 「축 단위를 대조하지 않는다」 — nm 축 차트의 기준선 48 과 °C 출력의 합격창 48 이
      //        **서로 다른 물리량인데** 숫자가 같다는 이유로 「이 차트가 그 판정을 그린다」고 단정했다.
      //   R-2 「단측 창이면 논거가 무너진다」 — `pass:{max:170}` 처럼 경계가 하나뿐이면
      //        `bounds.every(...)` 가 **숫자 하나 일치**로 성립한다. 우연히 같을 확률이 너무 높다.
      // → 이제 **단위가 일치할 때만** W6-4 를 세운다. 단위를 모르면(둘 중 하나라도 미상) 세우지 않는다.
      //   단측 창은 **양측 창일 때보다 강한 증거**(단위 일치)를 요구한다.
      for (const c of charts) {
        const refs = (c.refLines ?? []).map((r) => r.value).filter((v) => Number.isFinite(v));
        if (refs.length === 0) continue;
        for (const o of judges) {
          if (declared.has(o.id)) continue;
          const bounds = [o.pass?.min, o.pass?.max].filter((v) => Number.isFinite(v));
          if (bounds.length === 0) continue;
          if (!bounds.every((b) => refs.some((r) => sameNumber(r, b)))) continue;
          // 🔴 R-1 — 세로축 단위와 출력 단위가 같은가. 단위는 `compute()` 가 돌려주는 Quantity 에만 있다
          //    (`LabOutput` 에는 unit 필드가 없다). 하나라도 모르면 **증거 불충분으로 보고 넘어간다.**
          const outUnit = unitOf(quantities, o.id);
          const axisUnit = c.yUnit ?? null;
          if (!outUnit || !axisUnit) {
            w6Notes.push(`${key} / '${c.id}' × '${o.id}': 기준선이 합격창과 일치하지만 단위를 확인할 수 없어(축 ${axisUnit ?? '미상'} · 출력 ${outUnit ?? '미상'}) W6-4 를 세우지 않았습니다.`);
            continue;
          }
          if (outUnit !== axisUnit) continue;  // 다른 물리량이다 — 숫자 일치는 우연이다
          errors.push(
            `[W6-4] ${key} / 차트 '${c.id}': 기준선 [${refs.join(', ')}] 이 판정 출력 '${o.id}' (${o.ko}) 의 `
            + `합격창 ${JSON.stringify(o.pass)} 경계와 **정확히 일치**합니다 — 이 차트는 이미 그 판정을 그리고 있는데 `
            + `judgesOutputs 에 '${o.id}' 가 없습니다. 선언만 빠졌습니다(그리는 코드는 그대로 두고 한 줄 추가하면 됩니다).`,
          );
        }
      }

      // ── W6-5b 판정 차트인데 빈 그림 ─────────────────────────────────────────
      const judging = charts.filter((c) => (c.judgesOutputs ?? []).length > 0);
      if (judging.length > 0) {
        const inputs = Object.fromEntries(spec.params.map((p) => [p.id, p.initial]));
        let values = null;
        try {
          values = Object.fromEntries(Object.entries(spec.compute(inputs)).map(([id, q]) => [id, q.value]));
        } catch (e) {
          errors.push(`[W6-5] ${key}: 기본값에서 compute() 가 던집니다 — ${e?.message ?? e}`);
        }
        if (values) {
          for (const c of judging) {
            let series = null;
            try { series = c.build(inputs, values); } catch (e) {
              errors.push(`[W6-5] ${key} / 차트 '${c.id}': 판정 차트인데 기본값에서 build() 가 던집니다 — ${e?.message ?? e}`);
              continue;
            }
            const pts = (series ?? []).reduce((n, s) => n + (s.points?.length ?? 0), 0);
            if (pts === 0) {
              errors.push(
                `[W6-5] ${key} / 차트 '${c.id}': 「판정은 이 차트에서 한다」고 선언했는데 기본값에서 `
                + `계열 ${series?.length ?? 0}개 · 점 0개입니다 — 화면에는 빈 그림이 뜹니다.`,
              );
            }
          }
        }
      }

      /* ══ W6-7 🔴 **판정 차트가 학습자의 「현재 값」을 보여주지 않는다** (2026-08-21 신설) ══
       *
       * ── 왜 생겼나 ────────────────────────────────────────────────────────────────
       *   `oxidation.thicknessTime` 은 합격창 95·105 nm 를 규격선으로 그려 놓고
       *   **곡선은 시간 전 구간의 일반 성장곡선**이었다. 즉 학습자가 슬라이더를 아무리 움직여도
       *   **「지금 내 값이 창 안인가」를 그림에서 읽을 수 없었다.** 그 상태로 「판정은 이 차트에서
       *   합니다」 배지를 달면 **화면이 뒷받침하지 못하는 주장**이 된다.
       *
       * ── 왜 이름(`operating`)으로 안 세고 **실제로 흔들어 보는가** ────────────────
       *   `wafer.diameterZoom` 은 `operating` 이라는 계열이 없지만 `upper`/`lower` 계열 자체가
       *   현재 σ_D 를 그린다. **이름 규약으로 세면 이런 칸을 거짓 위반으로 잡는다.**
       *   그래서 **동적 판정**한다: 그 판정 출력을 실제로 움직이는 파라미터를 찾아 흔든 뒤
       *   **차트 계열이 하나도 안 변하면** 그 차트는 현재 상태를 안 보여주는 것이다.
       *   (이 저장소 규율 — 부분문자열·이름 검사는 이미 6번 사고를 냈다.)
       */
      if (judging.length > 0 && baseValues) {
        const shape = (ss) => JSON.stringify((ss ?? []).map((x) => ({ id: x.id, points: x.points })));
        for (const c of judging) {
          let baseShape = null;
          try { baseShape = shape(c.build(baseInputs, baseValues)); } catch { continue; }
          for (const id of c.judgesOutputs ?? []) {
            if (!Number.isFinite(baseValues[id])) continue;
            /* 🔴 판정 규칙 — **그 출력을 움직이는 파라미터는 전부** 차트를 흔들어야 한다.
             *   종전 초안은 「하나라도 흔들리면 통과」였는데 **주입 시험에서 안 잡혔다**:
             *   산화 차트는 `tempC` 로는 곡선이 바뀌지만 정작 학습자가 쓰는 `timeMin` 으로는
             *   아무것도 안 변했다. 「하나라도」로 세면 그 구멍이 그대로 통과한다. */
            let deadParam = null; let movableCount = 0;
            for (const prm of spec.params) {
              // 파라미터를 정의역 반대쪽 끝으로 던진다 — 가장 큰 변화를 준다.
              const alt = { ...baseInputs };
              alt[prm.id] = sameNumber(baseInputs[prm.id], prm.max) ? prm.min : prm.max;
              let av = null;
              try { av = Object.fromEntries(Object.entries(spec.compute(alt)).map(([k, q]) => [k, q?.value])); } catch { continue; }
              // 이 파라미터가 **그 판정 출력**을 실제로 움직이는가.
              if (!Number.isFinite(av[id]) || sameNumber(av[id], baseValues[id])) continue;
              movableCount++;
              let altShape = null;
              try { altShape = shape(c.build(alt, av)); } catch { continue; }
              if (altShape === baseShape && !deadParam) deadParam = prm.id;
            }
            if (movableCount > 0 && deadParam) {
              const movable = deadParam;
              errors.push(
                `[W6-7] ${key} / 차트 '${c.id}': '${id}' 를 「판정은 이 차트에서 합니다」로 선언했는데, `
                + `'${movable}' 를 정의역 끝까지 흔들어 ${id} 값이 바뀌어도 **차트 계열이 전혀 변하지 않습니다** `
                + `— 학습자는 자기 현재 값이 합격창 안인지 이 그림에서 읽을 수 없습니다. `
                + `현재 동작점 계열을 추가하세요(photo 의 'operating' · wafer 의 'upper'/'lower' 가 그 예입니다).`,
              );
            }
          }
        }
      }

      /* ══ W6-8 합격창 가시성 — 🔴 **지금은 위반을 세우지 않는다**(PLN 판정 J-2 대기) ══
       *   합격창이 세로축에서 차지하는 비율을 실측만 해 둔다. PLN 이 기준을 정하면
       *   위 `VISIBILITY_MIN_FRACTION` 에 **숫자 하나만 꽂으면** 그때부터 판정이 된다.
       *   🔴 여기서 임계를 지어내면 게이트가 교육 설계를 대신 정하는 것이 된다(D-041).
       */
      for (const c of judging) {
        const yd = c.yDomain;
        if (!yd || !Number.isFinite(yd[0]) || !Number.isFinite(yd[1])) continue;
        const span = Math.abs(yd[1] - yd[0]);
        if (!(span > 0)) continue;
        for (const id of c.judgesOutputs ?? []) {
          const o = spec.outputs.find((x) => x.id === id);
          const lo = o?.pass?.min; const hi = o?.pass?.max;
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
          const frac = Math.abs(hi - lo) / span;
          w6Visibility.push({ key, chart: c.id, id, frac });
          if (VISIBILITY_MIN_FRACTION != null && frac < VISIBILITY_MIN_FRACTION) {
            errors.push(
              `[W6-8] ${key} / 차트 '${c.id}': '${id}' 의 합격창이 세로축의 `
              + `**${(frac * 100).toFixed(1)} %** 밖에 차지하지 않습니다(기준 ${(VISIBILITY_MIN_FRACTION * 100).toFixed(1)} %) `
              + `— 판정한다고 선언했지만 화면에서 창을 분간하기 어렵습니다. 축을 확대하세요.`,
            );
          }
        }
      }
    }

    // 표가 실재하지 않는 칸을 가리키는 경우(W6-2 의 나머지 절반).
    for (const key of Object.keys(table)) {
      if (!seenKeys.has(key)) {
        errors.push(`[W6-2] 요구표가 '${key}' 를 가리키는데 등록된 실습 칸이 아닙니다 — **표가 썩었습니다.** registeredLabKeys() 에 없습니다.`);
      }
    }
  } finally {
    await server.close();
  }
}

/* ---------- 출력 ---------- */
if (SCOPED) console.log(`🔎 스코프 실행(self-test 픽스처) — 뿌리 ${relative(APP, SCOPED)} · W1~W5 는 돌지 않습니다`);
console.log(`배선 검사 — register* ${w1}개 · 전역 설치자 ${w2}개 · physics 배럴 ${w3}개 · 배럴 컴포넌트 ${w4}개 · export 컴포넌트 ${w5}개 · 스캔 ${files.length}개`);
if (w6Skipped) {
  console.log(`⚠️  W6 건너뜀 — ${w6Skipped}`);
} else {
  console.log(
    `칸 단위 배선률(W6) — 칸 ${w6Labs} · 차트 배선 ${w6Charts}칸(figure ${w6Figures}개) · 판정선언 ${w6Decls}건 `
    + `· 요구표 ${w6Required}건 · 차트 없는 칸 ${w6Labs - w6Charts}`,
  );
  if (!SCOPED) {
    // 🔴 2026-08-22 정정 — 「화면 없음」을 두 부류로 갈라 찍는다.
    //    양측 창(min≠max)을 가진 칸만 W6-6 위반이다. 단측/단일점만 있는 칸은
    //    수치 패널 + 판정 배너(LabRunner.tsx:150-181)로 충족이라 위반이 아니다.
    const empty = w6Inventory.filter((r) => r.charts === 0 && !r.scene);
    const emptyTwoSided = empty.filter((r) => r.twoSided > 0);
    const emptyOneSided = empty.filter((r) => r.twoSided === 0);
    console.log(`   ㄴ 차트 0 · 씬 미연결 ${empty.length}칸 중 — 양측 창 보유 ${emptyTwoSided.length}칸 → **W6-6 위반으로 계상**`
      + `${emptyTwoSided.length ? `: ${emptyTwoSided.map((r) => r.key).join(', ')}` : ''}`);
    console.log(`   ㄴ 그 나머지 ${emptyOneSided.length}칸은 단측 문턱/단일점 플래그뿐이라 수치+배너로 충족(위반 아님)`
      + `${emptyOneSided.length ? `: ${emptyOneSided.map((r) => r.key).join(', ')}` : ''}`);
    if (w6Visibility.length) {
      console.log('   ㄴ 합격창 가시성 실측(W6-8 · 🔴 임계 미정이라 판정 안 함 — PLN J-2 대기):');
      for (const v of w6Visibility.sort((a, b) => a.frac - b.frac)) {
        console.log(`        ${(v.frac * 100).toFixed(1).padStart(5)} %  ${v.key} / ${v.chart} / ${v.id}`);
      }
    }
    for (const n of w6Notes) console.log(`   ㄴ 참고(판정 아님): ${n}`);
    console.log('   ㄴ 🔴 「몇 칸에 차트가 있어야 하는가」는 PLN 소관입니다. 목록이 오면 check-wiring.mjs 의 REQUIRED 표만 채우세요.');
  }
}
if (errors.length > 0) {
  console.error(`\n❌ check-wiring 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('✅ check-wiring 통과');
