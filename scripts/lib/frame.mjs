#!/usr/bin/env node
/**
 * 🔴 프레임 계측 공용 모듈 — PNG 디코더 · 히스토그램 거리 · **프레임 유효성 판정**.
 *
 * 2026-08-21 분리. 종전에는 이 전부가 `scripts/qa-sweep.mjs` 안에 있었다. 분리한 이유는
 * 하나다 — **계측기를 계측기 밖에서 검증할 수 있게 하려고.** 스윕 전체를 돌려야만
 * 검증되는 코드는 사실상 검증되지 않는다(`selftest-gates` 가 분모에 못 넣는다).
 *
 * 이 파일을 쓰는 곳:
 *   · `scripts/qa-sweep.mjs`      — 실측 스윕
 *   · `scripts/selftest-gates.mjs` — 단위 픽스처(백지 프레임 → null 판정 확인)
 *
 * 🔴 새 패키지를 설치하지 않았다. 표준 라이브러리 `zlib` 만 쓴다.
 */
import { inflateSync, deflateSync } from 'node:zlib';

/** 채널당 히스토그램 bin 수. 32 = 8bit 값을 3비트 우시프트. 미세한 안티에일리어싱
 *  변동은 같은 bin 안에 흡수되고, 「밝기·색이 실제로 이동한 것」만 bin 을 넘는다. */
export const HIST_BINS = 32;

/* ══════════════════════════ PNG 디코더 (순수 JS) ══════════════════════════
 *
 * 🔴 브라우저 안에서 canvas 를 읽지 않는다. `preserveDrawingBuffer` 없이 WebGL 캔버스를
 *    `toDataURL`/`getImageData` 로 읽으면 **빈 이미지**가 나온다(이 프로젝트에서 이미 겪은
 *    사고다). element 스크린샷 PNG 버퍼를 받아 여기서 직접 디코딩한다.
 *
 * 🔴 새 패키지를 설치하지 않았다. 표준 라이브러리 `zlib.inflateSync` 만 쓴다.
 */

/** PNG 스펙 §9.4 Paeth predictor. 인코더 자가검증과 디코더가 **같은 함수를 공유**한다
 *  (두 쪽이 어긋날 여지를 없앤다 — 대신 진짜 독립 검증은 Chrome 스크린샷으로 한다). */
export function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * PNG → { width, height, rgb: Uint8Array(w*h*3) }
 * 알파가 있으면 **흰 배경 위에 합성**한다(결정적으로 만들기 위함).
 */
export function decodePNG(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('PNG 서명이 아니다');
  }
  let off = 8; let ihdr = null; let plte = null; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], color: data[9], comp: data[10], filter: data[11], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('IHDR 없음');
  if (ihdr.interlace !== 0) throw new Error('인터레이스 PNG 미지원 (Adam7)');
  if (ihdr.depth !== 8 && ihdr.depth !== 16) throw new Error(`비트깊이 ${ihdr.depth} 미지원`);
  const ch = CHANNELS[ihdr.color];
  if (!ch) throw new Error(`컬러타입 ${ihdr.color} 미지원`);
  if (ihdr.color === 3 && !plte) throw new Error('팔레트 이미지인데 PLTE 없음');

  const { width, height, depth } = ihdr;
  const bpp = Math.max(1, (depth * ch) >> 3);           // 필터 참조 거리(바이트)
  const stride = Math.ceil((width * ch * depth) / 8);   // 한 줄 바이트 수
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) {
    throw new Error(`IDAT 부족: ${raw.length} < ${(stride + 1) * height}`);
  }

  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const ft = raw[base];
    const cur = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, base + 1, base + 1 + stride);
    if (ft === 0) { /* None */ }
    else if (ft === 1) { for (let i = bpp; i < stride; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255; }
    else if (ft === 2) { for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 255; }
    else if (ft === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        cur[i] = (cur[i] + ((a + prev[i]) >> 1)) & 255;
      }
    } else if (ft === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const c = i >= bpp ? prev[i - bpp] : 0;
        cur[i] = (cur[i] + paeth(a, prev[i], c)) & 255;
      }
    } else throw new Error(`알 수 없는 스캔라인 필터 ${ft} (y=${y})`);
    prev = cur;
  }

  // → RGB
  const rgb = new Uint8Array(width * height * 3);
  const step = depth === 16 ? 2 : 1;   // 16bit 는 상위 바이트만 쓴다
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      let r; let g; let b; let a = 255;
      if (ihdr.color === 3) {
        const idx = out[row + x];
        r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      } else {
        const s = row + x * ch * step;
        if (ihdr.color === 0) { r = g = b = out[s]; }
        else if (ihdr.color === 4) { r = g = b = out[s]; a = out[s + step]; }
        else if (ihdr.color === 2) { r = out[s]; g = out[s + step]; b = out[s + 2 * step]; }
        else { r = out[s]; g = out[s + step]; b = out[s + 2 * step]; a = out[s + 3 * step]; }
      }
      if (a !== 255) { // 흰 배경 합성
        const t = a / 255;
        r = Math.round(r * t + 255 * (1 - t));
        g = Math.round(g * t + 255 * (1 - t));
        b = Math.round(b * t + 255 * (1 - t));
      }
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  }
  return { width, height, rgb, color: ihdr.color, depth };
}

/* ══════════════════════════ 히스토그램 거리 ══════════════════════════
 *
 * 채널(R·G·B)별로 `HIST_BINS` 개 bin 히스토그램을 만들고 **화소 수로 나눠 정규화**한다.
 * → 각 채널 히스토그램의 합 = 1 이므로 캔버스 크기가 달라도 값이 안 휜다.
 *
 * 거리 = 3채널 L1 합 / 6.
 *   한 채널 L1 최댓값 = 2 (완전히 겹치지 않는 두 분포), 3채널이면 6.
 *   → 결과는 [0,1] 이고 「히스토그램 질량의 몇 %가 이동했나」로 읽힌다.
 */
const SHIFT = 8 - Math.log2(HIST_BINS);

export function histogram(rgb) {
  const h = new Float64Array(HIST_BINS * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    h[rgb[i] >> SHIFT] += 1;
    h[HIST_BINS + (rgb[i + 1] >> SHIFT)] += 1;
    h[2 * HIST_BINS + (rgb[i + 2] >> SHIFT)] += 1;
  }
  const n = rgb.length / 3;
  for (let i = 0; i < h.length; i++) h[i] /= n;
  return h;
}

export function histDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / 6;
}

/** 군내 최대 거리 (모든 쌍). 표본이 2개 미만이면 null. */
export function withinMax(hists) {
  if (!hists || hists.length < 2) return null;
  let m = 0;
  for (let i = 0; i < hists.length; i++) {
    for (let j = i + 1; j < hists.length; j++) m = Math.max(m, histDist(hists[i], hists[j]));
  }
  return m;
}

/** 군간 평균 거리 (교차 모든 쌍). */
export function betweenMean(a, b) {
  if (!a || !b || !a.length || !b.length) return null;
  let s = 0; let n = 0;
  for (const x of a) for (const y of b) { s += histDist(x, y); n++; }
  return s / n;
}
/* ══════════════════════ 디코더 자가검증 ① — 합성 PNG ══════════════════════
 *
 * 🔴 계측기를 먼저 계측한다. 알려진 색상의 작은 PNG 를 만들어 디코딩 결과를 대조한다.
 *    필터 0~4 를 **전부** 강제로 써서 스캔라인 역필터를 개별 검증한다.
 *
 * ⚠ 한계 고지: 인코더도 내가 썼으므로 predictor 식을 양쪽이 똑같이 틀리면 통과한다.
 *    그래서 **독립 검증(§자가검증 ②, Chrome 이 만든 PNG)** 을 반드시 함께 돌린다.
 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
/** 원본 스캔라인들을 지정한 필터 타입으로 인코딩한 PNG 를 만든다. */
export function encodePNG(width, height, ch, rows, filterType) {
  const stride = width * ch;
  const parts = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = rows[y];
    const f = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let pred = 0;
      if (filterType === 1) pred = a;
      else if (filterType === 2) pred = b;
      else if (filterType === 3) pred = (a + b) >> 1;
      else if (filterType === 4) pred = paeth(a, b, c);
      f[i] = (cur[i] - pred) & 255;
    }
    parts.push(Buffer.from([filterType]), f);
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(parts))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function selfTestSynthetic() {
  const results = [];
  const W = 7; const H = 5;
  for (const ch of [3, 4]) {
    // 알려진 패턴: 좌상 빨강 블록 / 우측 파랑 / 아래 초록 그라디언트
    const rows = [];
    const expect = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      const r = Buffer.alloc(W * ch);
      for (let x = 0; x < W; x++) {
        let R; let G; let B;
        if (y < 2 && x < 3) { R = 255; G = 0; B = 0; }
        else if (y < 2) { R = 0; G = 0; B = 255; }
        else { R = x * 37 % 256; G = 20 + y * 40; B = 128; }
        r[x * ch] = R; r[x * ch + 1] = G; r[x * ch + 2] = B;
        if (ch === 4) r[x * ch + 3] = 255;
        const o = (y * W + x) * 3;
        expect[o] = R; expect[o + 1] = G; expect[o + 2] = B;
      }
      rows.push(r);
    }
    for (let ft = 0; ft <= 4; ft++) {
      const png = encodePNG(W, H, ch, rows, ft);
      let ok = false; let detail = '';
      try {
        const d = decodePNG(png);
        if (d.width !== W || d.height !== H) detail = `크기 ${d.width}x${d.height}`;
        else {
          let bad = -1;
          for (let i = 0; i < expect.length; i++) if (d.rgb[i] !== expect[i]) { bad = i; break; }
          if (bad < 0) ok = true;
          else detail = `byte#${bad} ${d.rgb[bad]}≠${expect[bad]}`;
        }
      } catch (e) { detail = e.message; }
      results.push({ name: `합성 ${ch === 4 ? 'RGBA' : 'RGB'} · 필터${ft}`, ok, detail });
    }
  }
  return results;
}

/* ══════════════════════ 프레임 유효성 판정 (2026-08-21 신설) ══════════════════════
 *
 * 🔴 사고 배경 — **계측기가 빈 그림을 재고 결론을 냈다.**
 *
 *    `qa/sweep/etch-lab-applied-s1-소스_파워_ICP_P_s-scene-{min,max}.png` 2장은
 *    캔버스가 **아무것도 안 그려진 상태**로 캡처된 것이다(씬 청크 404 → 씬 미로딩).
 *    스크린샷은 성공하고 PNG 도 멀쩡히 디코딩된다. 계측기 입장에서는 「정상 측정」이다.
 *    즉 **캡처 성공 ≠ 씬이 그려졌음**인데 종전 코드는 그 둘을 구분하지 않았다.
 *
 *    빈 프레임끼리 히스토그램 거리를 재면 0 이 나오고, 그건 「파라미터에 반응 안 함」과
 *    수치상 구별되지 않는다. **없는 것을 재고 「안 움직인다」고 말하는 것**이 최악이다.
 *
 * 규율 — 「군내 분포를 못 구하면 null, 절대 true 로 쓰지 않는다」와 **같은 규율**을
 *        무효 프레임에도 적용한다. 무효가 하나라도 섞이면 그 판정은 `null`(판정불가)이다.
 *        `true` 로도 `false` 로도 쓰지 않는다.
 *
 * ── 임계값 근거: 기존 `qa/sweep/` 126장 전수 실측 (2026-08-21) ──
 *
 *    눈대중으로 정하지 않았다. 126장을 전부 디코딩해 분포를 먼저 재고 나서 잡았다.
 *
 *      지표          백지 2장     정상 124장(최악값)     분리 배율
 *      ──────────────────────────────────────────────────────────
 *      std           3.0083       25.256  (최솟값)       8.4배
 *      고유색 수     6            612     (최솟값)       102배
 *      점유 bin 수   7            79      (최솟값)       11.3배
 *      최빈색 비중   99.521%      66.027% (최댓값)       —
 *
 *    정상 124장의 std 분포: 최소 25.26 / p05 26.26 / 중앙 38.93 / 최대 84.73
 *    정상 124장의 고유색 분포: 최소 612 / p05 665 / 중앙 2106 / 최대 6189
 *
 *    두 군 사이가 **한 자릿수 배율이 아니라 8~100배로 벌어져 있어** 임계를 어디에 두든
 *    같은 결론이 나온다. 그래서 양쪽에 넉넉히 여유를 준 자리를 골랐다:
 *
 *      · FRAME_MIN_STD  = 10.0 → 백지(3.01)의 3.3배 위 · 가장 조용한 정상(25.26)의 2.5배 아래
 *      · FRAME_MIN_UNIQ = 64   → 백지(6)의 10.7배 위   · 가장 단조로운 정상(612)의 9.6배 아래
 *
 * 🔴 왜 「최빈색 비중」과 「점유 bin 수」는 판정에 안 쓰는가 —
 *    분리력은 있지만 **판정 기준을 늘릴수록 정상 프레임을 잘못 무효 처리할 위험이 커진다.**
 *    std·고유색 둘만으로 이미 8배 이상 분리되므로 더 얹을 이유가 없다. 두 값은 계산해서
 *    **사유 문자열에 진단 정보로만 싣는다**(사람이 나중에 원인을 볼 수 있게).
 *
 * ⚠ 알려진 한계 — 이 판정이 잡는 것은 **「거의 균일한 화면」**이다.
 *    씬이 안 떴는데 로딩 스피너나 오류 일러스트가 그려지면 std·고유색이 중간값이 나와
 *    **유효로 통과한다.** 이 경우는 이 판정으로 못 잡는다. `sceneMode` 배지 검사와
 *    렌더 대기(§qa-sweep RENDER_WAIT)가 그쪽을 담당한다.
 */

/** 프레임이 유효하려면 채널 표본 표준편차가 이 값 이상이어야 한다. 실측 근거는 위 표. */
export const FRAME_MIN_STD = 10.0;
/** 프레임이 유효하려면 고유 RGB 색이 이 개수 이상이어야 한다. 실측 근거는 위 표. */
export const FRAME_MIN_UNIQ = 64;

/* 고유색 카운트용 비트셋. 2^24 비트 = 2 MiB. 프레임마다 Set 을 새로 만들면 폴링 루프에서
 * 비용이 커지므로 한 번만 잡고 **더럽힌 워드만 되돌린다**(memset 없이 O(고유색)). */
const SEEN = new Uint32Array(1 << 19);   // 524288 워드 × 32비트 = 2^24 비트
const DIRTY = new Int32Array(1 << 16);

/**
 * 디코딩된 프레임의 통계와 **유효성**을 낸다.
 *
 * @param {{width:number,height:number,rgb:Uint8Array}} d  decodePNG 결과
 * @returns {{std:number,uniq:number,dominant:number,occupiedBins:number,
 *            valid:boolean,reason:string|null,px:number}}
 *          `valid=false` 면 `reason` 에 사람이 읽을 사유가 들어온다.
 */
export function analyzeFrame(d) {
  const { rgb, width, height } = d;
  const n = rgb.length;
  const px = width * height;
  if (px === 0 || n < 3) {
    return { std: 0, uniq: 0, dominant: 1, occupiedBins: 0, px, valid: false, reason: '화소 0개' };
  }

  // ① 채널 표본(R·G·B 를 한 모집단으로) 표준편차
  let s = 0; let s2 = 0;
  for (let i = 0; i < n; i++) { s += rgb[i]; s2 += rgb[i] * rgb[i]; }
  const mean = s / n;
  const std = Math.sqrt(Math.max(0, s2 / n - mean * mean));

  // ② 고유 RGB 색 수 + 최빈색 비중
  //    최빈색은 고유색이 적을 때만 정확히 세면 충분하다(백지 진단용). 많으면 세지 않는다.
  let uniq = 0; let ndirty = 0; let overflow = false;
  for (let i = 0; i < n; i += 3) {
    const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    const w = key >>> 5; const bit = 1 << (key & 31);
    if ((SEEN[w] & bit) === 0) {
      SEEN[w] |= bit;
      uniq++;
      if (ndirty < DIRTY.length) DIRTY[ndirty++] = w; else overflow = true;
    }
  }
  // 더럽힌 워드 되돌리기. 넘쳤으면(고유색 > 65536) 전체를 지운다 — 드물고, 그때는 어차피 유효다.
  if (overflow) SEEN.fill(0); else for (let i = 0; i < ndirty; i++) SEEN[DIRTY[i]] = 0;

  // 최빈색 비중은 고유색이 적을 때만 계산한다(진단용 · 비용 제한)
  let dominant = 0;
  if (uniq <= 256) {
    const cnt = new Map();
    for (let i = 0; i < n; i += 3) {
      const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
    }
    for (const v of cnt.values()) if (v > dominant) dominant = v;
    dominant /= px;
  }

  // ③ 점유 히스토그램 bin 수 (진단용)
  const h = histogram(rgb);
  let occupiedBins = 0;
  for (let i = 0; i < h.length; i++) if (h[i] > 0) occupiedBins++;

  const fails = [];
  if (std < FRAME_MIN_STD) fails.push(`std ${std.toFixed(3)} < ${FRAME_MIN_STD}`);
  if (uniq < FRAME_MIN_UNIQ) fails.push(`고유색 ${uniq} < ${FRAME_MIN_UNIQ}`);

  return {
    std, uniq, dominant, occupiedBins, px,
    valid: fails.length === 0,
    reason: fails.length === 0 ? null
      : `백지·비유효 프레임(${fails.join(' · ')} · 최빈색 ${(dominant * 100).toFixed(1)}% · 점유bin ${occupiedBins}/${HIST_BINS * 3})`,
  };
}

/** PNG 버퍼 하나를 바로 판정한다. 디코딩 실패도 「무효」로 본다(예외를 삼키지 않고 사유로 남긴다). */
export function analyzePNG(buf) {
  try {
    return analyzeFrame(decodePNG(buf));
  } catch (e) {
    return { std: 0, uniq: 0, dominant: 1, occupiedBins: 0, px: 0, valid: false, reason: `디코드 실패: ${e.message}` };
  }
}

/* ══════════════════════ 군(group) 유효성 관문 ══════════════════════
 *
 * 🔴 여기가 「빈 그림을 재고 결론을 내지 않는다」 규율이 **실제로 집행되는 한 곳**이다.
 *    `qa-sweep` 의 `groupProblem` 이 이 함수에 위임하고, `selftest-gates` 의 단위 픽스처가
 *    **같은 함수**를 부른다. 규칙을 두 군데 적어 두면 한쪽만 고쳐지고 픽스처는 계속
 *    통과한다 — 이 프로젝트가 이미 여러 번 당한 실패 방식이다.
 */

/**
 * 한 군의 프레임 분석 결과들을 보고, 그 군을 판정에 써도 되는지 답한다.
 *
 * @param {Array<{valid:boolean,reason:string|null}>} analyses  `analyzeFrame`/`analyzePNG` 결과들
 * @param {string} which     사유 문자열 앞에 붙일 군 이름 ('min' | 'max' | '대조군' …)
 * @param {number} nCapture  군당 목표 캡처 수(사유 문구에만 쓴다)
 * @returns {string|null}  쓸 수 없으면 **사유 문자열**, 쓸 수 있으면 `null`.
 *
 * 🔴 반환이 문자열이면 호출부는 그 판정을 **`null`(판정 불가)** 로 남겨야 한다.
 *    `true` 로도 `false` 로도 쓰지 않는다.
 */
export function frameGateProblem(analyses, which = '군', nCapture = 4) {
  if (!Array.isArray(analyses) || analyses.length === 0) {
    return `${which} 프레임 0장 — 캡처 자체가 안 됐다`;
  }
  const bad = analyses.filter((a) => !a || !a.valid);
  if (bad.length) {
    return `${which} 무효 프레임 ${bad.length}/${analyses.length}장 — ${bad[0]?.reason ?? '사유 미상'}`;
  }
  if (analyses.length < 2) {
    return `${which} 유효 프레임 ${analyses.length}장(2장 미만) — 군내 분포를 못 만든다`;
  }
  if (analyses.length < nCapture) {
    // 🔴 부족하지만 2장 이상이면 측정은 가능하다. 막지 않되 사실은 남긴다(호출부가 로그로 쓴다).
    return null;
  }
  return null;
}

/**
 * 픽스처용 — **완전 백지 프레임 PNG** 를 만든다.
 *
 * 🔴 실제 사고 프레임을 그대로 재현한다: `qa/sweep/etch-lab-applied-s1-…-scene-{min,max}.png`
 *    는 99.52% 가 rgb(238,241,245)(빈 씬 박스 배경)였다. 기본값을 그 색으로 둔 이유다.
 *    「전 화소 동일」이 아니라 **실측한 진짜 백지**를 넣어야 픽스처가 현실을 시험한다.
 */
export function makeBlankFramePNG(width = 64, height = 48, rgbColor = [238, 241, 245]) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const r = Buffer.alloc(width * 3);
    for (let x = 0; x < width; x++) { r[x * 3] = rgbColor[0]; r[x * 3 + 1] = rgbColor[1]; r[x * 3 + 2] = rgbColor[2]; }
    rows.push(r);
  }
  return encodePNG(width, height, 3, rows, 0);
}

/**
 * 픽스처용 — **내용이 있는 정상 프레임 PNG** 를 만든다(대조군).
 * 🔴 백지가 null 이 되는 것만 보면 「전부 null 로 만들어도 통과」한다. 정상 프레임이
 *    유효로 통과하는 것까지 같이 봐야 관문이 살아 있다는 증명이 된다.
 */
export function makeBusyFramePNG(width = 64, height = 48, seed = 1) {
  const rows = [];
  let v = seed >>> 0;
  for (let y = 0; y < height; y++) {
    const r = Buffer.alloc(width * 3);
    for (let x = 0; x < width; x++) {
      v = (v * 1664525 + 1013904223) >>> 0;      // LCG — 결정적이다(A14-1 비결정 소스 금지)
      r[x * 3] = v & 255; r[x * 3 + 1] = (v >>> 8) & 255; r[x * 3 + 2] = (v >>> 16) & 255;
    }
    rows.push(r);
  }
  return encodePNG(width, height, 3, rows, 0);
}
