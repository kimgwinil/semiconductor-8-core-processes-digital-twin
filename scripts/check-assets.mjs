#!/usr/bin/env node
// check-assets.mjs — A4·A8·§14-3·§14-4. 공정별 장비 단면 이미지·라벨·출처대장
// 검사. 미제작(디렉터리 없음)은 경고만 내고 통과시킨다(A4는 제작 완료를 전제로
// 하지 않는다 — 아직 안 만든 공정까지 CI 로 막으면 개발이 멈춘다).
// 왜: F3(2 MB급 PNG 11장) 재발 방지 — 용량 상한·라벨 최소 개수·출처 기록을
// 기계로 강제한다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(APP_ROOT, 'src');
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const CATALOG_FILE = path.join(SRC_DIR, 'content/catalog.json');

const CROSS_SECTION_MAX = 184320; // ≤ 180 KB
const TEX_MAX = 40960; // ≤ 40 KB


/**
 * 🔴 제목 섹션이 존재하고 **그 아래에 실제 내용이 있는지** 확인한다.
 *    단순 `text.includes(키워드)` 는 「검수자: (미정)」이나 설명문 속 단어에도 통과한다.
 * @param {string} text  PROVENANCE.md 전문
 * @param {string} kw    필수 항목 키워드
 */
function hasFilledSection(text, kw) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^#{1,6}\s/.test(line)) continue;
    if (!line.includes(kw)) continue;
    // 다음 제목 전까지의 본문 중 의미 있는 줄이 있는가
    let body = 0;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,6}\s/.test(lines[j])) break;
      const t = lines[j].trim();
      if (t === '' || /^[-|\s]+$/.test(t)) continue;   // 빈 줄·표 구분선 제외
      if (/^\(?(미정|TBD|N\/A|없음)\)?$/i.test(t)) continue; // 자리표시자 제외
      body++;
    }
    if (body > 0) return true;
  }
  return false;
}

const PROVENANCE_REQUIRED = ['생성 엔진', '프롬프트', '참조', '상업', '제작자', '검수자'];

let hasError = false;
const warnings = [];
const errors = [];
function fail(msg) {
  hasError = true;
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

if (!existsSync(CATALOG_FILE)) {
  console.error(`❌ ${path.relative(APP_ROOT, CATALOG_FILE)} 가 없습니다.`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
const processIds = Object.keys(catalog.processes ?? {});

let checkedCount = 0;
let skippedCount = 0;
// 🔴 A13 — 장비 단면 「제작 고지」(notes[]) 집계
let noteTotal = 0;
let noteWarn = 0;
let noteInfo = 0;
const noteToneMissing = [];

for (const processId of processIds) {
  const dir = path.join(PUBLIC_DIR, 'assets/equipment', processId);
  if (!existsSync(dir)) {
    warn(`공정 '${processId}': ${path.relative(APP_ROOT, dir)} 없음 — 미제작(경고만).`);
    skippedCount++;
    continue;
  }
  checkedCount++;

  // cross-section.webp
  const imgPath = path.join(dir, 'cross-section.webp');
  if (!existsSync(imgPath)) {
    fail(`공정 '${processId}': cross-section.webp 가 없습니다.`);
  } else {
    const size = statSync(imgPath).size;
    if (size > CROSS_SECTION_MAX) {
      fail(`공정 '${processId}': cross-section.webp 용량 ${size} B > 상한 ${CROSS_SECTION_MAX} B.`);
    }
  }

  // labels.json
  const labelsPath = path.join(dir, 'labels.json');
  if (!existsSync(labelsPath)) {
    fail(`공정 '${processId}': labels.json 이 없습니다.`);
  } else {
    let labelsData;
    try {
      labelsData = JSON.parse(readFileSync(labelsPath, 'utf8'));
    } catch (e) {
      fail(`공정 '${processId}': labels.json 파싱 실패 — ${e.message}`);
      labelsData = null;
    }

    if (labelsData) {
      if (labelsData.processId !== processId) {
        fail(
          `공정 '${processId}': labels.json 의 processId('${labelsData.processId}') 가 디렉터리명과 다릅니다.`,
        );
      }

      const viewBox = labelsData.viewBox;
      const labels = Array.isArray(labelsData.labels) ? labelsData.labels : [];

      if (labels.length < 8) {
        fail(`공정 '${processId}': 라벨 개수 ${labels.length}개 (최소 8개 필요).`);
      }

      for (const label of labels) {
        for (const field of ['id', 'anchor', 'leaderEnd', 'side', 'ko', 'en', 'descKey']) {
          if (!(field in label)) {
            fail(`공정 '${processId}': 라벨 '${label.id ?? '?'}' 에 '${field}' 필드가 없습니다.`);
          }
        }
        if (Array.isArray(viewBox) && viewBox.length === 4) {
          const [vx, vy, vw, vh] = viewBox;
          for (const [key, point] of [
            ['anchor', label.anchor],
            ['leaderEnd', label.leaderEnd],
          ]) {
            if (Array.isArray(point) && point.length === 2) {
              const [x, y] = point;
              if (x < vx || x > vx + vw || y < vy || y > vy + vh) {
                fail(
                  `공정 '${processId}': 라벨 '${label.id}' 의 ${key} 좌표(${x},${y}) 가 viewBox 밖입니다.`,
                );
              }
            }
          }
        }
        if (label.side !== 'left' && label.side !== 'right') {
          fail(`공정 '${processId}': 라벨 '${label.id}' 의 side 가 'left'/'right' 가 아닙니다.`);
        }

        // §14-3: descKey 가 content/{lang}/{processId}.json 의 labels 사전에 실재하는지
        for (const lang of ['ko', 'en']) {
          const contentFile = path.join(SRC_DIR, `content/${lang}/${processId}.json`);
          if (!existsSync(contentFile)) continue;
          try {
            const content = JSON.parse(readFileSync(contentFile, 'utf8'));
            const descKeys = content.labels ?? {};
            if (label.descKey && !(label.descKey in descKeys)) {
              fail(
                `공정 '${processId}': 라벨 '${label.id}' 의 descKey '${label.descKey}' 가 content/${lang}/${processId}.json 의 labels 에 없습니다.`,
              );
            }
          } catch {
            // 콘텐츠 JSON 파싱 실패는 다른 검사(check-sources 등)에서 이미 다룬다.
          }
        }
      }

      // ---------- 🔴 A13: 제작 고지(notes[]) ----------
      // 왜: 「목을 1:6 으로 그렸지만 실제는 1:50」 같은 사실이 파일에만 있고 화면에 없으면
      //     학습자가 왜곡된 그림을 실물 비율로 배운다(D-008 정면 위반).
      if ('notes' in labelsData && !Array.isArray(labelsData.notes)) {
        fail(`공정 '${processId}': labels.json 의 notes 가 배열이 아닙니다.`);
      }
      const notes = Array.isArray(labelsData.notes) ? labelsData.notes : [];
      const noteIds = new Set();
      noteTotal += notes.length;

      for (const note of notes) {
        const nid = note?.id ?? '?';
        if (!note || typeof note !== 'object') {
          fail(`공정 '${processId}': notes 항목이 객체가 아닙니다.`);
          continue;
        }
        for (const field of ['id', 'anchor', 'leaderEnd', 'side', 'ko', 'en']) {
          if (!(field in note)) {
            fail(`공정 '${processId}': 고지 '${nid}' 에 '${field}' 필드가 없습니다.`);
          }
        }
        if (noteIds.has(nid)) {
          fail(`공정 '${processId}': 고지 id '${nid}' 가 중복입니다.`);
        }
        noteIds.add(nid);

        // (d) 번역 누락 — 한쪽 언어만 있으면 그 언어 학습자에게는 고지가 없는 것과 같다.
        for (const lang of ['ko', 'en']) {
          const v = note[lang];
          if (typeof v !== 'string' || v.trim() === '') {
            fail(`공정 '${processId}': 고지 '${nid}' 의 '${lang}' 문구가 비어 있습니다.`);
          }
        }

        // (b) 좌표가 viewBox 안인가
        if (Array.isArray(viewBox) && viewBox.length === 4) {
          const [vx, vy, vw, vh] = viewBox;
          for (const [key, point] of [
            ['anchor', note.anchor],
            ['leaderEnd', note.leaderEnd],
          ]) {
            if (!Array.isArray(point) || point.length !== 2
                || typeof point[0] !== 'number' || typeof point[1] !== 'number') {
              fail(`공정 '${processId}': 고지 '${nid}' 의 ${key} 가 [x, y] 숫자쌍이 아닙니다.`);
              continue;
            }
            const [x, y] = point;
            if (x < vx || x > vx + vw || y < vy || y > vy + vh) {
              fail(
                `공정 '${processId}': 고지 '${nid}' 의 ${key} 좌표(${x},${y}) 가 viewBox 밖입니다.`,
              );
            }
          }
        }

        if (note.side !== 'left' && note.side !== 'right') {
          fail(`공정 '${processId}': 고지 '${nid}' 의 side 가 'left'/'right' 가 아닙니다.`);
        }

        // (c) tone 누락은 경고. 렌더러는 안전한 쪽(warn)으로 올려 표시한다.
        if (note.tone === 'warn') noteWarn++;
        else if (note.tone === 'info') noteInfo++;
        else if (note.tone === undefined) noteToneMissing.push(`${processId}/${nid}`);
        else fail(`공정 '${processId}': 고지 '${nid}' 의 tone '${note.tone}' 은 'info'|'warn' 이 아닙니다.`);
      }
    }
  }

  // PROVENANCE.md
  const provPath = path.join(dir, 'PROVENANCE.md');
  if (!existsSync(provPath)) {
    fail(`공정 '${processId}': PROVENANCE.md 가 없습니다.`);
  } else {
    const text = readFileSync(provPath, 'utf8');
    if (text.trim() === '') {
      fail(`공정 '${processId}': PROVENANCE.md 가 비어 있습니다.`);
    } else {
      // 🔴 `text.includes(kw)` 는 「검수자: (미정)」도, 심지어 본문에 그 단어가 스쳐 지나가기만 해도
      //    통과시킨다. A8 게이트가 반쪽이 된다(부분문자열 함정).
      //    → **섹션이 제목으로 존재하고 그 아래에 실제 내용이 있는지**를 구조로 확인한다.
      const missing = PROVENANCE_REQUIRED.filter((kw) => !hasFilledSection(text, kw));
      if (missing.length > 0) {
        fail(
          `공정 '${processId}': PROVENANCE.md 에 필수 항목이 없거나 비어 있습니다 — ${missing.join(', ')}. ` +
          `제목(## …)으로 존재하고 그 아래에 실제 내용이 있어야 합니다.`,
        );
      }
    }
  }
}

// ---------- 🔴 A13(a): notes 가 「렌더 경로」에 실제로 연결됐는가 ----------
// 왜: 2026-08-20, labels.json 에 고지 95건이 쌓여 있는데 src/ 어디에도 'notes' 참조가
//     없었다. 데이터만 있고 화면에 없으면 고지가 아니다. 파일 존재 검사로는 못 잡는다.
function walkSrc(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkSrc(full, exts, out);
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

if (noteTotal > 0) {
  const typesFile = path.join(SRC_DIR, 'content/types.ts');
  if (!existsSync(typesFile)) {
    fail('src/content/types.ts 가 없습니다 — notes 타입 계약을 확인할 수 없습니다.');
  } else {
    const typesText = readFileSync(typesFile, 'utf8');
    if (!/(interface|type)\s+EquipmentNote\b/.test(typesText)) {
      fail("A13: src/content/types.ts 에 'EquipmentNote' 타입이 없습니다 — 고지 데이터에 계약이 없습니다.");
    }
    if (!/notes\??\s*:\s*EquipmentNote\s*\[\]/.test(typesText)) {
      fail("A13: src/content/types.ts 의 EquipmentLabelFile 에 'notes?: EquipmentNote[]' 가 없습니다.");
    }
  }

  const uiFiles = walkSrc(path.join(SRC_DIR, 'ui'), ['.ts', '.tsx']);
  // '.notes' 접근 또는 'notes' prop 전달이 있고, EquipmentNote 타입을 쓰는 렌더 파일
  const renderFiles = uiFiles.filter((f) => {
    const text = readFileSync(f, 'utf8');
    return /EquipmentNote\b/.test(text) && /\bnotes\b/.test(text);
  });
  if (renderFiles.length === 0) {
    fail(
      `A13: 고지 ${noteTotal}건이 labels.json 에 있으나 src/ui/ 어디에서도 렌더하지 않습니다. ` +
      "(EquipmentNote 타입을 import 하고 notes 를 읽는 파일이 필요합니다 — 파일에만 있는 고지는 고지가 아닙니다.)",
    );
  } else {
    // 렌더러가 tone 을 실제로 다루는지 — warn 취급 분기가 없으면 warn/info 구분이 화면에 없다.
    const handlesTone = renderFiles.some((f) => {
      const text = readFileSync(f, 'utf8');
      return /\btone\b/.test(text) && /'warn'/.test(text) && /'info'/.test(text);
    });
    if (!handlesTone) {
      fail(
        "A13: 고지 렌더 파일이 tone('info'|'warn')을 구분하지 않습니다. " +
        'warn 은 항상 눈에 띄게 노출돼야 합니다.',
      );
    }
  }
}

// tex 텍스처
const texDir = path.join(PUBLIC_DIR, 'assets/tex');
let texChecked = 0;
if (existsSync(texDir)) {
  for (const entry of readdirSync(texDir)) {
    if (!entry.endsWith('.webp')) continue;
    texChecked++;
    const full = path.join(texDir, entry);
    const size = statSync(full).size;
    if (size > TEX_MAX) {
      fail(`tex/${entry}: 용량 ${size} B > 상한 ${TEX_MAX} B.`);
    }
  }
} else {
  warn(`${path.relative(APP_ROOT, texDir)} 없음 — 미제작(경고만).`);
}

// (c) tone 누락 — 경고로 남긴다. 렌더러는 'warn' 으로 올려 표시한다(안전한 쪽).
if (noteToneMissing.length > 0) {
  warn(
    `A13: tone 이 없는 고지 ${noteToneMissing.length}건 — 렌더러가 'warn' 으로 올려 표시합니다. ` +
    `DSN 이 명시하는 것이 원칙입니다: ${noteToneMissing.join(', ')}`,
  );
}

// ---------- 🔴 A-USE: 출하되는데 **아무도 안 쓰는 자산** (파일 단위) ----------
// 2026-08-20. 앱이 3D 텍스처 5종(107 KB)을 **0회 로드**하고 있었다. `dist/` 로는 나간다.
// DSN 이 그 자산에 이음매 판정식·재인코딩·재현성 실증까지 공수를 썼는데 **화면에 안 쓰인다** —
// 그러면 그 작업 전체가 유령 작업이 된다. `Overlay.tsx`(배럴에만 있던 死컴포넌트)와 **같은 구조**다.
//
// 🔴 규율: **「살릴 거면 쓰는 곳을 만들고 아니면 지운다.」**
//    자산은 코드보다 더 조용히 죽는다 — 컴파일러도 린터도 안 잡는다. 그래서 게이트가 본다.
//
// 🔴 2026-08-21 강화 — 판정 단위를 **그룹 → 파일**로 내렸다.
//    종전에는 `srcBlob.includes('assets/<group>')` 하나로 그룹 전체를 통과시켰다. 그래서
//    tex 5종 중 3종만 배선돼도 그룹이 초록이 되고 **미배선 2종이 배선된 3종 뒤에 숨었다.**
//    「게이트 초록이 5종 배선을 뜻하지 않는」 상태를 통과시키면 그건 게이트 결함이다.
//
//    다만 파일명을 src 에서 **문자열로 찾는 방식은 쓰지 않는다.** 이 앱의 자산 URL 은 전부
//    런타임 조립이다(`${base}assets/tex/${name}.webp`, `${base}assets/equipment/${pid}/${image}`).
//    파일명 문자열 검색은 ①주석·타입 유니온 선언에도 걸려 통과시키고(느슨) ②리터럴 경로만
//    보면 21개 중 20개가 오탐이다(과함). 둘 다 틀렸다.
//    → **게이트가 조립 규칙 자체를 알게 하고, 「조립으로 도달 가능한 파일 집합」을 실제로 계산한다.**
//      판정은 그 집합과의 **정확 일치**다 — 부분문자열 검사가 아예 개입하지 않는다.
{
  const ASSETS = path.join(PUBLIC_DIR, 'assets');

  /**
   * 🔴 주석을 걷어낸 src 전문.
   *    종전 방식이 `tex/oxide.webp` 를 「참조됨」으로 본 유일한 근거는 textures.ts **주석 안의
   *    python 재현 명령**이었다. 주석은 코드가 아니다 — 앵커 탐지에 주석을 쓰면 안 된다.
   *    과하게 걷어내면 판정이 **엄격한 쪽**으로 틀리므로(거짓 통과가 아니라 거짓 실패) 안전하다.
   */
  function stripComments(text) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // `://`(URL)은 건드리지 않는다
  }

  let srcClean = '';
  {
    const stack = [SRC_DIR];
    while (stack.length) {
      const d = stack.pop();
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) { stack.push(fp); continue; }
        if (/\.(ts|tsx|css|html)$/.test(e.name)) srcClean += stripComments(readFileSync(fp, 'utf8')) + '\n';
        else if (/\.json$/.test(e.name)) srcClean += readFileSync(fp, 'utf8') + '\n'; // JSON 에는 주석이 없다
      }
    }
  }

  /**
   * 경로 리터럴이 **경로 경계까지 맞아떨어지는지** 본다. `includes` 를 쓰지 않는다.
   * 🔴 이 프로젝트에서 부분문자열 오판이 6번 났다. `metal.webp` 는 `metal`(공정 id)의 꼬리이고
   *    `assets/tex/metal.webp` 는 `assets/tex/metal.webp.bak` 의 머리다. 앞뒤 경계를 모두 막는다.
   */
  function hasPathLiteral(blob, p) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_.-])${esc}($|[^A-Za-z0-9_./-])`).test(blob);
  }

  /**
   * 🔴 tex — 런타임 조립 그룹.
   *    조립 규칙: `src/viz/gl/textures.ts` 의 `texUrl()` 이 `${base}assets/tex/${name}.webp` 를 만든다.
   *    `name` 은 씬이 `acquireTextures(ctx, ['a','b'])` 로 **명시한 것만** 슬롯이 생기고 로드된다.
   *    → 도달 가능 집합 = 모든 `acquireTextures(...)` 호출부의 문자열 리터럴 ∪ 매핑.
   *    타입 유니온 `TextureName` 이나 `TEX_MEAN_ALBEDO` 키에 이름이 **선언**돼 있는 것은
   *    로드가 아니다. 선언은 자산을 화면에 올리지 않는다.
   *
   * 🔴 **`tests/` 를 스캔 범위에 넣지 마라.** `tests/unit/gl-textures.test.ts` 는
   *    `acquireTextures(ctx, ['photoresist'])` · `['slurry-pad']` 를 실제로 부른다. 테스트 범위를
   *    포함하면 미배선 2종이 **또 숨는다** — 로더 단위 테스트는 자산을 학습자 화면에 올리지 않는다.
   *    A-USE 가 묻는 것은 「출하된 자산이 **제품 화면**에 쓰이는가」다. 그래서 범위는 `src/` 뿐이다.
   *
   * ⚠️ 한계: 이름이 문자열 리터럴로 적힌 호출부만 본다. `acquireTextures(gl, NAMES)` 처럼 상수
   *    배열을 넘기면 그 이름들을 놓친다 → **거짓 실패**(엄격한 쪽)로 기운다. 통과가 아니라 실패로
   *    기울므로 자산이 숨지는 않는다. 그런 호출부가 생기면 여기에 규칙을 보태라.
   */
  function resolveTex() {
    const problems = [];
    if (!/assets\/tex\//.test(srcClean)) {
      problems.push("A-USE[tex]: src/ 에서 'assets/tex/' 경로 조각을 찾지 못했습니다 — 조립 규칙이 바뀐 듯합니다. 게이트를 먼저 고치세요.");
    }
    if (!/\$\{[A-Za-z0-9_.]+\}\.webp/.test(srcClean)) {
      problems.push("A-USE[tex]: src/ 에서 '${name}.webp' 형태의 URL 조립을 찾지 못했습니다 — 조립 규칙이 바뀐 듯합니다.");
    }
    const names = new Set();
    let sites = 0;
    for (const m of srcClean.matchAll(/acquireTextures\s*\([^()]*?\[([^\]]*)\]/g)) {
      sites++;
      for (const s of m[1].matchAll(/'([^']+)'|"([^"]+)"|`([^`]+)`/g)) {
        names.add(s[1] ?? s[2] ?? s[3]);
      }
    }
    if (sites === 0) {
      problems.push('A-USE[tex]: acquireTextures(...) 호출부를 하나도 찾지 못했습니다 — 확보 API 가 개명됐거나 배선이 통째로 빠졌습니다.');
    }
    return { reachable: new Set([...names].map((n) => `tex/${n}.webp`)), problems };
  }

  /**
   * 🔴 equipment — 런타임 조립 그룹.
   *    조립 규칙 2개:
   *      ① `EquipmentSection.tsx`: `${base}assets/equipment/${file.processId}/${file.image}`
   *         → `image` 값은 **labels.json 안에 적혀 있다.** 그 값을 읽어 실제 파일명을 만든다.
   *      ② `content/loader.ts`: `${base}assets/equipment/${processId}/labels.json` (파일명 리터럴)
   *    `processId` 는 catalog.json 의 공정 목록에서만 온다 → 카탈로그에 없는 디렉터리는 도달 불가.
   */
  function resolveEquipment() {
    const problems = [];
    if (!/assets\/equipment\/\$\{[^}]+\}\/\$\{[^}]+\}/.test(srcClean)) {
      problems.push("A-USE[equipment]: src/ 에서 'assets/equipment/${pid}/${image}' 형태의 조립을 찾지 못했습니다 — 조립 규칙이 바뀐 듯합니다.");
    }
    if (!/assets\/equipment\/\$\{[^}]+\}\/labels\.json/.test(srcClean)) {
      problems.push("A-USE[equipment]: src/ 에서 'assets/equipment/${pid}/labels.json' 조립을 찾지 못했습니다 — 조립 규칙이 바뀐 듯합니다.");
    }
    const reachable = new Set();
    for (const pid of processIds) {
      const lp = path.join(ASSETS, 'equipment', pid, 'labels.json');
      if (!existsSync(lp)) continue;
      reachable.add(`equipment/${pid}/labels.json`);
      let img;
      try {
        img = JSON.parse(readFileSync(lp, 'utf8')).image;
      } catch {
        continue; // 파싱 실패는 위 labels.json 검사에서 이미 fail 로 잡혔다
      }
      if (typeof img !== 'string' || img === '') {
        problems.push(`A-USE[equipment]: '${pid}/labels.json' 에 image 파일명이 없습니다 — 화면이 무엇을 불러야 할지 정해지지 않습니다.`);
        continue;
      }
      if (img.includes('/') || img.includes('\\') || img.includes('..')) {
        problems.push(`A-USE[equipment]: '${pid}/labels.json' 의 image '${img}' 가 단순 파일명이 아닙니다(조립 규칙은 같은 디렉터리 안의 파일만 만듭니다).`);
        continue;
      }
      reachable.add(`equipment/${pid}/${img}`);
    }
    return { reachable, problems };
  }

  /**
   * simulator-realistic — manifest에 등록된 공정 기본 장비와 장면별 전용 장비만 출하한다.
   * URL은 realisticBackdrops.ts가 `assets/simulator-realistic/${file}`로 조립한다.
   */
  function resolveSimulatorRealistic() {
    const problems = [];
    const reachable = new Set();
    if (!/assets\/simulator-realistic\/\$\{[^}]+\}/.test(srcClean)) {
      problems.push("A-USE[simulator-realistic]: src/ 에서 'assets/simulator-realistic/${file}' URL 조립을 찾지 못했습니다.");
    }
    const manifestPath = path.join(SRC_DIR, 'viz/realisticBackdrops.json');
    if (!existsSync(manifestPath)) {
      problems.push('A-USE[simulator-realistic]: src/viz/realisticBackdrops.json 이 없습니다.');
      return { reachable, problems };
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const file of Object.values(manifest.backdrops ?? {})) {
        if (typeof file === 'string' && file !== '') reachable.add(`simulator-realistic/${file}`);
      }
      for (const profile of Object.values(manifest.profiles ?? {})) {
        if (profile && typeof profile === 'object' && typeof profile.asset === 'string' && profile.asset !== '') {
          reachable.add(`simulator-realistic/${profile.asset}`);
        }
        if (profile && typeof profile === 'object' && profile.stageAssets && typeof profile.stageAssets === 'object') {
          for (const file of Object.values(profile.stageAssets)) {
            if (typeof file === 'string' && file !== '') reachable.add(`simulator-realistic/${file}`);
          }
        }
      }
    } catch (error) {
      problems.push(`A-USE[simulator-realistic]: manifest 파싱 실패 — ${error.message}`);
    }
    return { reachable, problems };
  }

  /**
   * 기본(무규칙) 리졸버 — **엄격한 쪽**. 파일 하나하나가 `assets/<경로>` 리터럴로
   * src 에 적혀 있어야 도달로 본다(주석 제외·경로 경계 검사).
   *
   * 🔴 **새 자산 그룹이 생기면 어떻게 되는가**
   *    ASSET_RULES 에 없는 그룹은 자동으로 여기로 떨어진다. 런타임 조립을 쓰는 새 그룹이라면
   *    전 파일이 「미참조」로 걸려 **게이트가 빨간불이 된다.** 그때 조립 규칙을 ASSET_RULES 에
   *    등록하라 — 그것이 의도된 흐름이다.
   *    🔴 **기본값을 「통과」로 두면 안 된다.** 그러면 다음 자산이 조용히 빠져나간다.
   *       (2026-08-20 텍스처 5종 0회 로드가 정확히 그 구조였다.)
   */
  function resolveLiteral(groupFiles) {
    const reachable = new Set();
    for (const rel of groupFiles) {
      if (hasPathLiteral(srcClean, `assets/${rel}`)) reachable.add(rel);
    }
    return { reachable, problems: [] };
  }

  /** 🔴 조립 규칙을 게이트가 아는 그룹. 여기 없는 그룹 = 기본(엄격) 판정. */
  const ASSET_RULES = {
    tex: resolveTex,
    equipment: resolveEquipment,
    'simulator-realistic': resolveSimulatorRealistic,
  };

  if (existsSync(ASSETS)) {
    const census = [];
    for (const e of readdirSync(ASSETS, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const group = e.name;

      // 그룹 안의 출하 대상 파일(문서·점파일 제외)
      const files = [];
      const st = [path.join(ASSETS, group)];
      while (st.length) {
        const d = st.pop();
        for (const x of readdirSync(d, { withFileTypes: true })) {
          if (x.name.startsWith('.')) continue; // .DS_Store 등 — 자산이 아니다
          const fp = path.join(d, x.name);
          if (x.isDirectory()) st.push(fp);
          else if (!/\.(md|txt)$/i.test(x.name)) files.push(fp);
        }
      }
      if (files.length === 0) continue;

      const rels = files.map((f) => path.relative(ASSETS, f).split(path.sep).join('/'));
      const rule = ASSET_RULES[group];
      const { reachable, problems } = rule ? rule() : resolveLiteral(rels);
      for (const p of problems) fail(p);

      // ① 출하되는데 도달 불가 — 유령 자산
      const orphans = rels.filter((r) => !reachable.has(r));
      for (const r of orphans) {
        const bytes = statSync(path.join(ASSETS, r)).size;
        fail(
          `[A-USE] public/assets/${r} (${(bytes / 1024).toFixed(1)} KB) 를 src/ 어디에서도 ` +
          `불러오지 않습니다 — 빌드에는 실려 나가는데 화면에서는 **0회 로드**됩니다. ` +
          (rule
            ? `(${group} 조립 규칙으로 도달 가능한 파일에 이 이름이 없습니다.) `
            : `(${group} 은 조립 규칙이 등록되지 않아 리터럴 경로로 판정했습니다.) `) +
          `쓰는 곳을 만들거나(설계서 §6-5 등), 안 쓸 자산이면 격리하고 담당 팀에 통보하세요.`,
        );
      }

      // ② 반대 방향 — 조립이 가리키는데 파일이 없다(런타임 404)
      for (const r of reachable) {
        if (!existsSync(path.join(ASSETS, r))) {
          fail(`[A-USE] ${group} 조립 규칙이 public/assets/${r} 를 가리키는데 파일이 없습니다 — 런타임 404 입니다.`);
        }
      }

      census.push(
        `${group} ${rels.length - orphans.length}/${rels.length}` +
        `(${rule ? '조립규칙' : '리터럴·기본'})`,
      );
    }
    // 🔴 분모를 숨기지 않는다 — 통과했을 때도 「몇 개 중 몇 개」를 찍는다.
    console.log(`   A-USE 자산 도달성(파일 단위): ${census.join(' · ')}`);
  }
}

// ---------- 결과 ----------
if (warnings.length > 0) {
  console.warn(`⚠️  경고 ${warnings.length}건`);
  for (const w of warnings) console.warn('  ' + w);
}

if (hasError) {
  console.error(`\n❌ check-assets 실패 (${errors.length}건)`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(
  `✅ check-assets 통과 — 검사한 공정 ${checkedCount}개 (미제작 ${skippedCount}개), tex ${texChecked}개`,
);
console.log(
  `   A13 제작 고지 ${noteTotal}건 — warn ${noteWarn} · info ${noteInfo} · tone 없음 ${noteToneMissing.length}(warn 처리)`,
);
process.exit(0);
