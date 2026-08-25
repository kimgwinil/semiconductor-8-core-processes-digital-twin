// collide-probe.mjs — 🔴 **브라우저 안에서 도는 계측 코드의 정본.**
//
// 왜 별도 파일인가:
//   `check-collision.mjs`(본 게이트)와 `check-collision.selftest.mjs`(자체검증)가
//   **같은 계측 코드**를 써야 자체검증이 의미를 갖는다. 픽스처를 잡는 코드와 제품을 재는
//   코드가 다르면 「픽스처가 잡혔다」가 「제품도 잡힌다」를 보장하지 못한다.
//   그래서 페이지에 주입할 함수를 문자열로 한 곳에 두고 양쪽이 같은 것을 주입한다.
//
// 🔴 이 파일 안의 문자열은 **DOM 안에서 평가**된다. node API 를 쓰지 마라.
//
// ══════════════════════════════════════════════════════════════════════════════
// 🔴 v2 (2026-08-24) — v1 이 낸 **오검출 3종을 실측으로 확인하고** 고쳤다
// ══════════════════════════════════════════════════════════════════════════════
//   ① `span.choice__optText «920» ↔ input` 22건 — 접근성 라디오의 **투명 input** 이
//      라벨 위에 깔린 정상 패턴이다. 투명한 것은 아무것도 가리지 않는다.
//      → **가리는 쪽이 실제로 불투명한지** 본다(`opaqueBlocker`).
//   ② `tspan «가열로 본체» ↔ tspan «Furnace Body»` 119건 — **같은 `<text>` 안의
//      두 줄**(dy 로 내린 부제)이다. 줄 상자가 글리프 여백만큼 7~8 % 겹치는 것은 정상.
//      → 같은 `<text>` 조상을 공유하면 뺀다.
//   ③ `text «0.2» ↔ path` r=1.0 다수 — **path 의 bounding box 는 그 도형이 아니다.**
//      꺾은선 하나가 plot 전체를 덮는 상자를 갖는다. 이걸로 「겹쳤다」를 판정하면
//      차트마다 눈금 라벨 전부가 걸린다.
//      → 상자가 도형을 대표하는 것(`rect·circle·ellipse·image`)만 쓰고,
//        **칠(fill)이 있는 것**만, 그리고 **DOM 순서상 글자 뒤에 그려지는 것**만 센다.

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 페이지 안에서 실행될 계측 함수의 소스.
 * `page.evaluate(new Function('opts', PROBE_SRC), opts)` 로 쓴다.
 *
 * opts.mode
 *   'geometry'  기하 계산만 — 뷰포트와 무관하다. 문서 전체를 한 번에 잰다.
 *               → 2순위(글자↔글자) · 3순위(스침)
 *   'occlusion' `elementFromPoint` 로 z 순서를 본다 — **보이는 영역만** 답한다.
 *               → 1순위(가림). 호출자가 스크롤을 옮겨 가며 여러 번 불러야 전면을 덮는다.
 *
 * 반환: { texts, shapes, hits:[{sev,kind,a,b,area,ratio,x,y,w,h}] }
 *   좌표 x·y 는 **문서 절대좌표**(scrollX/Y 보정). 스크롤 단계 간 중복 제거에 쓴다.
 */
export const PROBE_SRC = String.raw`
const OPT = Object.assign({
  mode: 'geometry',
  minArea: 4,        // px^2 — 이보다 작은 교차는 반올림 오차로 본다
  severeRatio: 0.15, // 작은 쪽 면적 대비 이 비율 이상이면 2순위, 미만이면 3순위
  grazeRatio: 0.20,  // 글자↔도형은 이 비율 이상만 3순위로 센다(글리프 여백 노이즈 차단)
  occludeHits: 3,    // 5점 중 몇 점이 남의 **불투명** 요소에 막히면 「가려졌다」
}, opts || {});

const SVGNS = 'http://www.w3.org/2000/svg';
const SX = window.scrollX, SY = window.scrollY;

/* ── 0. 잴 수 없는 것을 먼저 걸러낸다 ────────────────────────────────────────
 * 🔴 여기서 무엇을 빼는지가 이 계측기의 신뢰도를 정한다. 빼는 이유를 전부 적는다. */
function invisible(el) {
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return true;
  if (parseFloat(cs.opacity) < 0.05) return true;                 // 사실상 안 보임
  // 스크린리더 전용 유틸(.sr-only 류) — 1px 로 접어 두고 **의도적으로** 자른다
  if (cs.position === 'absolute' && cs.clip !== 'auto' && cs.clip !== '') return true;
  if (cs.clipPath && cs.clipPath.indexOf('inset(50%') >= 0) return true;
  return false;
}
function chainInvisible(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    if (invisible(n)) return true;
  }
  return false;
}
/** 조상까지 곱한 실효 불투명도. 0.5 미만이면 「가린다」고 말할 수 없다. */
function effOpacity(el) {
  let o = 1;
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const v = parseFloat(getComputedStyle(n).opacity);
    if (!isNaN(v)) o *= v;
    if (o < 0.05) break;
  }
  return o;
}
/* 🔴 **가릴 수 있는 것만 「가림」으로 센다.**
 * 배경이 투명한 요소는 위에 있어도 뒤 글자를 지우지 않는다.
 * 접근성 패턴의 'opacity:0' 라디오 input 이 정확히 그 경우였다(v1 오검출 22건). */
function opaqueBlocker(el) {
  if (!el || !el.tagName) return false;
  if (effOpacity(el) < 0.5) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'img' || tag === 'canvas' || tag === 'video') return true;
  const cs = getComputedStyle(el);
  if (el.namespaceURI === SVGNS) {
    const f = cs.fill;
    return !!f && f !== 'none' && f !== 'transparent' && !/,\s*0\)\s*$/.test(f);
  }
  const bg = cs.backgroundColor;
  const hasBg = !!bg && bg !== 'transparent' && !/,\s*0\)\s*$/.test(bg);
  const hasImg = !!cs.backgroundImage && cs.backgroundImage !== 'none';
  return hasBg || hasImg;
}
function sel(el) {
  if (!el || !el.tagName) return '?';
  let cls = '';
  const c = el.getAttribute && el.getAttribute('class');
  if (c && typeof c === 'string') cls = '.' + c.trim().split(/\s+/).slice(0, 3).join('.');
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
}
function snip(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > 34 ? s.slice(0, 34) + '…' : s;
}

/* ── 1. 텍스트 상자 수집 ─────────────────────────────────────────────────────
 * 🔴 요소의 boundingRect 를 쓰면 안 된다 — 블록 요소는 글자가 짧아도 상자가 폭 전체다.
 *    그러면 「겹쳤다」가 대량 오검출된다. Range 로 **글자가 실제로 칠해진 줄 상자**를 잰다.
 *    SVG '<text>'/'<tspan>' 은 요소 상자가 이미 글자에 밀착하므로 그대로 쓴다. */
const texts = [];
(function collectTexts() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const t = p.tagName.toLowerCase();
      if (t === 'script' || t === 'style' || t === 'title' || t === 'desc') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (chainInvisible(p)) continue;
    const cs = getComputedStyle(p);
    if (cs.color === 'transparent' || /,\s*0\)\s*$/.test(cs.color)) continue;
    const isSvg = p.namespaceURI === SVGNS;
    /* 🔴 같은 '<text>' 안의 두 줄(부제 tspan)은 서로 겹친 것이 아니다 — 한 덩어리다.
     *    이 키가 같으면 뒤에서 쌍을 만들지 않는다(v1 오검출 119건의 원인). */
    const block = isSvg ? (p.closest && p.closest('text')) || p : null;
    let rects;
    if (isSvg) {
      rects = [p.getBoundingClientRect()];
    } else {
      const range = document.createRange();
      range.selectNodeContents(n);
      rects = Array.prototype.slice.call(range.getClientRects());
    }
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      texts.push({
        el: p, block, svg: isSvg, text: snip(n.nodeValue),
        vx: r.left, vy: r.top,                       // 뷰포트 좌표(1순위 표본 찍기용)
        x: r.left + SX, y: r.top + SY, w: r.width, h: r.height,
        r: r.right + SX, b: r.bottom + SY,
      });
    }
  }
})();

/* ── 2. 시각요소 수집 — 🔴 **상자가 도형을 대표하는 것만** ────────────────────
 * 'path'·'polyline'·'line'·'polygon' 은 bounding box 가 실제 잉크와 전혀 다르다.
 * 꺾은선 하나의 상자가 plot 전체를 덮으므로, 그것으로 겹침을 판정하면 차트의
 * 눈금 라벨이 통째로 걸린다(v1 오검출 1,290건 중 대부분). 그래서 뺀다.
 * 남기는 것: rect · circle · ellipse · image · img — 상자 = 도형인 것들. */
const shapes = [];
(function collectShapes() {
  const q = 'rect, circle, ellipse, image, img';
  for (const el of document.querySelectorAll(q)) {
    if (chainInvisible(el)) continue;
    if (!opaqueBlocker(el)) continue;      // 칠이 없으면 못 가린다
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    shapes.push({ el, x: r.left + SX, y: r.top + SY, w: r.width, h: r.height, r: r.right + SX, b: r.bottom + SY });
  }
})();

/* ── 3. 교차 계산 ────────────────────────────────────────────────────────── */
function inter(a, b) {
  const x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  return x * y;
}
function related(a, b) { return a === b || a.contains(b) || b.contains(a); }
/** b 가 DOM 순서상 a 뒤에 있는가 = (같은 쌓임 맥락이라면) b 가 a 위에 그려진다. */
function paintsAfter(a, b) {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const hits = [];
const seen = Object.create(null);
function push(h) {
  const k = h.sev + '|' + h.a + '|' + h.b + '|' + Math.round(h.x) + '|' + Math.round(h.y);
  if (seen[k]) return;
  seen[k] = 1;
  hits.push(h);
}

if (OPT.mode === 'occlusion') {
  /* 1순위 — **가려져서 못 읽는다.**
   * 🔴 「겹쳤다」와 「가려졌다」는 다르다. 글자가 도형 **위**에 있으면 정상(HUD·라벨)이다.
   *    면적이 아니라 'elementFromPoint' 로 **맨 위에 무엇이 있는지** 본다.
   * 🔴 이 판정은 **보이는 영역에서만** 가능하다. 호출자가 스크롤을 옮겨 가며 반복 호출한다. */
  const VW = document.documentElement.clientWidth;
  const VH = document.documentElement.clientHeight;
  for (const t of texts) {
    if (t.vy + t.h < 0 || t.vy > VH) continue;      // 지금 화면 밖 — 이번 단계에서 못 잰다
    const cx = t.vx + t.w / 2, cy = t.vy + t.h / 2;
    const pts = [
      [cx, cy],
      [t.vx + t.w * 0.15, cy], [t.vx + t.w * 0.85, cy],
      [cx, t.vy + t.h * 0.25], [cx, t.vy + t.h * 0.75],
    ];
    let bad = 0, sampled = 0, who = null;
    for (const p of pts) {
      const px = p[0], py = p[1];
      if (px < 0 || py < 0 || px > VW || py > VH) continue;
      sampled++;
      const top = document.elementFromPoint(px, py);
      if (!top || related(top, t.el)) continue;
      if (!opaqueBlocker(top)) continue;            // 투명한 것은 가리지 않는다
      bad++; if (!who) who = top;
    }
    if (sampled === 5 && bad >= OPT.occludeHits && who) {
      push({
        sev: 1, kind: '가림',
        a: sel(t.el) + ' «' + t.text + '»', b: sel(who),
        area: Math.round(t.w * t.h), ratio: bad / 5,
        x: t.x, y: t.y, w: Math.round(t.w), h: Math.round(t.h),
      });
    }
  }
} else {
  /* 2·3순위 — **텍스트끼리 겹친다.** 부모·자식과 같은 '<text>' 덩어리는 뺀다. */
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const A = texts[i], B = texts[j];
      if (A.r <= B.x || B.r <= A.x || A.b <= B.y || B.b <= A.y) continue;
      if (related(A.el, B.el)) continue;
      if (A.block && A.block === B.block) continue;     // 같은 <text> 안의 두 줄
      const ia = inter(A, B);
      if (ia < OPT.minArea) continue;
      const ratio = ia / Math.min(A.w * A.h, B.w * B.h);
      push({
        sev: ratio >= OPT.severeRatio ? 2 : 3, kind: '글자↔글자',
        a: sel(A.el) + ' «' + A.text + '»', b: sel(B.el) + ' «' + B.text + '»',
        area: Math.round(ia), ratio: Math.round(ratio * 100) / 100,
        x: Math.max(A.x, B.x), y: Math.max(A.y, B.y),
        w: Math.round(Math.min(A.r, B.r) - Math.max(A.x, B.x)),
        h: Math.round(Math.min(A.b, B.b) - Math.max(A.y, B.y)),
      });
    }
  }
  /* 3순위 — **글자 위에 칠한 도형이 얹힌다.**
   * 🔴 DOM 순서상 글자보다 **뒤**에 있는 것만 센다. 앞에 있으면 글자가 위에 그려져 읽힌다
   *    (차트 배경 rect · 합격창 띠 위의 라벨이 정확히 그 경우다 — 정상 디자인이다). */
  for (const t of texts) {
    for (const s of shapes) {
      if (related(s.el, t.el)) continue;
      if (!paintsAfter(t.el, s.el)) continue;
      const ia = inter(t, s);
      if (ia < OPT.minArea) continue;
      const ratio = ia / (t.w * t.h);
      if (ratio < OPT.grazeRatio) continue;
      push({
        sev: 3, kind: '글자↔도형',
        a: sel(t.el) + ' «' + t.text + '»', b: sel(s.el),
        area: Math.round(ia), ratio: Math.round(ratio * 100) / 100,
        x: Math.max(t.x, s.x), y: Math.max(t.y, s.y),
        w: Math.round(Math.min(t.r, s.r) - Math.max(t.x, s.x)),
        h: Math.round(Math.min(t.b, s.b) - Math.max(t.y, s.y)),
      });
    }
  }
}


/* ── 4. 🔴 R4 「선이 글자를 관통한다」 ────────────────────────────────────────
 * **2026-08-24 — 이 규칙이 없어서 CEO 가 본 것을 기계가 못 봤다.**
 *
 * 무엇을 놓쳤나: 범례와 「합격창」 라벨은 **플롯 영역 안**에 배경 없이 놓인다.
 *   그 자리를 데이터 곡선·규격 파선·해칭이 지나가면 **글자를 그대로 관통**한다.
 *   · 상자 교차로는 못 잡는다 — path 의 bounding box 는 plot 전체라 의미가 없다.
 *   · z 순서로도 못 잡는다 — 글자가 선보다 **위**에 그려지므로 elementFromPoint 는
 *     글자를 돌려준다. 「가려지지 않았다」는 맞지만 **읽기 어렵다**는 사실은 남는다.
 *
 * 어떻게 재나: 'SVGGeometryElement.isPointInStroke()' 로 **선의 실제 잉크**를 묻는다.
 *   글자 상자 안 격자점을 그 도형의 사용자 좌표계로 변환해 하나씩 물어본다.
 *   상자가 아니라 **획 자체**를 재므로 꺾은선이든 파선이든 정확하다.
 *
 * 🔴 **후광이 있으면 세지 않는다.** 'paint-order: stroke' + 배경색 stroke 로 글리프에
 *    배경 띠를 두르면 선이 지나가도 글자 모양이 살아난다(common.ts LABEL_HALO).
 *    즉 이 규칙은 **고치면 스스로 꺼진다** — 그래서 지표로 쓸 수 있다.
 */
if (OPT.mode === 'geometry') {
  const MAXQ = 400;   // 도형 후보 상한 — 한 화면에서 폭주하지 않게
  for (const t of texts) {
    if (!t.svg) continue;
    const svgRoot = t.el.ownerSVGElement;
    if (!svgRoot || !svgRoot.createSVGPoint) continue;
    const cs = getComputedStyle(t.el);
    const po = cs.paintOrder || '';
    const hasHalo = po.indexOf('stroke') >= 0 && !!cs.stroke && cs.stroke !== 'none'
      && parseFloat(cs.strokeWidth || '0') > 0.5;
    if (hasHalo) continue;                       // 후광이 지켜 준다

    // 글리프 상자 안 격자점(가장자리는 살짝 안쪽으로 — 글리프 여백을 피한다)
    const pts = [];
    for (const fx of [0.18, 0.35, 0.5, 0.65, 0.82]) {
      for (const fy of [0.35, 0.5, 0.65]) {
        pts.push([t.vx + t.w * fx, t.vy + t.h * fy]);
      }
    }
    const geoms = svgRoot.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect');
    let n = 0;
    for (const g of geoms) {
      if (++n > MAXQ) break;
      if (g === t.el || related(g, t.el)) continue;
      if (typeof g.isPointInStroke !== 'function') continue;
      const gcs = getComputedStyle(g);
      if (!gcs.stroke || gcs.stroke === 'none' || /,\s*0\)\s*$/.test(gcs.stroke)) continue;
      if (parseFloat(gcs.strokeOpacity || '1') < 0.25) continue;
      const gb = g.getBoundingClientRect();      // 싼 선검사 — 상자가 안 닿으면 획도 안 닿는다
      if (gb.right < t.vx || gb.left > t.vx + t.w || gb.bottom < t.vy || gb.top > t.vy + t.h) continue;
      const ctm = g.getScreenCTM();
      if (!ctm) continue;                         // <defs> 안의 pattern 등 — 화면에 없다
      const inv = ctm.inverse();
      let hit = 0;
      for (const pt of pts) {
        const sp = svgRoot.createSVGPoint();
        sp.x = pt[0]; sp.y = pt[1];
        const lp = sp.matrixTransform(inv);
        try { if (g.isPointInStroke(lp)) hit++; } catch (e) { /* 좌표계 없음 */ }
      }
      if (hit > 0) {
        push({
          sev: 2, kind: '선↔글자',
          a: sel(t.el) + ' «' + t.text + '»',
          b: sel(g) + ' (획이 글리프를 관통)',
          area: hit, ratio: Math.round((hit / pts.length) * 100) / 100,
          x: t.x, y: t.y, w: Math.round(t.w), h: Math.round(t.h),
        });
        break;                                    // 글자 하나당 1건이면 충분하다
      }
    }
  }
}

return { texts: texts.length, shapes: shapes.length, hits };
`;

/** 폰트·애니메이션 때문에 계측이 흔들리지 않게 페이지를 고정한다. */
export const FREEZE_CSS = `*,*::before,*::after{
  animation-duration:0s !important; animation-delay:0s !important;
  animation-iteration-count:1 !important;
  transition-duration:0s !important; transition-delay:0s !important;
}`;
