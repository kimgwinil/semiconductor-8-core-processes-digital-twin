import { useEffect, useMemo, useState } from 'react';
import type { EquipmentLabelFile, EquipmentNote, ProcessContent, ProseSectionId } from '@/content/types';
import { loadLabels } from '@/content/loader';
import { getLang, t } from '@/lib/i18n';
import { Blocks } from '@/ui/widgets/Blocks';
import { EmptySlot } from '@/ui/widgets/EmptySlot';
import { realisticBackdropUrl } from '@/viz/realisticBackdrops';
import { EQUIPMENT_MOTION_ROUTES, EquipmentMotionOverlay } from '@/viz/equipment/EquipmentMotionOverlay';

interface Props { processId: string; sectionId: ProseSectionId; content: ProcessContent | null }

interface EquipmentPairFigure {
  src: string;
  title: string;
  detail: string;
}

const EQUIPMENT_PAIR_FIGURES: Record<string, Record<'ko' | 'en' | 'ja', EquipmentPairFigure[]>> = {
  deposition: {
    en: [
      { src: 'assets/simulator-realistic/deposition/ald-reactor-v2.jpg', title: 'Deposition tool — ALD reactor', detail: 'Precursor pulses enter the reaction chamber and form the film on the wafer.' },
      { src: 'assets/simulator-realistic/deposition/ion-implanter-v2.jpg', title: 'Ion implantation tool — beamline', detail: 'Ions travel from the source through mass analysis and acceleration to the tilted wafer.' },
    ],
    ko: [
      { src: 'assets/simulator-realistic/deposition/ald-reactor-v2.jpg', title: '증착 장비 — ALD 반응기', detail: '전구체가 반응 챔버에 교대로 주입되어 웨이퍼 위에 막을 형성합니다.' },
      { src: 'assets/simulator-realistic/deposition/ion-implanter-v2.jpg', title: '이온주입 장비 — 빔라인', detail: '이온원에서 생성된 이온이 질량 분석과 가속을 거쳐 기울여진 웨이퍼에 도달합니다.' },
    ],
    ja: [
      { src: 'assets/simulator-realistic/deposition/ald-reactor-v2.jpg', title: '成膜装置 — ALD反応器', detail: '前駆体を反応チャンバーへ交互に供給し、ウェーハ上に膜を形成します。' },
      { src: 'assets/simulator-realistic/deposition/ion-implanter-v2.jpg', title: 'イオン注入装置 — ビームライン', detail: 'イオン源で生成したイオンが質量分析と加速を経て、傾斜したウェーハへ到達します。' },
    ],
  },
};

const EQUIPMENT_LABELS_JA: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  wafer: {
    'heat-shield': '熱遮蔽板', 'quartz-crucible': '石英るつぼ', 'graphite-heater': '黒鉛ヒーター',
    'carbon-insulation': '炭素断熱材', 'exhaust-port': '下部排気口', 'seed-chuck': '種結晶チャック',
    'optical-gauge': '光学測定窓', neck: 'ダッシュネック', 'argon-flow': 'アルゴンパージ流',
    'crystal-body': '結晶本体／クラウン', meniscus: 'メニスカス', 'silicon-melt': 'シリコン融液表面',
    'graphite-susceptor': '黒鉛サセプタ', 'crucible-shaft': 'るつぼ回転軸',
  },
  oxidation: {
    'heat-insulating-jacket': '炉本体', 'multi-zone-heater': 'ゾーンヒーター', 'spike-thermocouple': 'スパイク熱電対',
    'quartz-outer-tube': '外管', 'quartz-inner-tube': '内管', 'gas-injector': 'ガスインジェクター',
    'gas-supply-line': 'ガス供給管', 'boat-elevator': 'ボートエレベーター', 'quartz-wafer-boat': '石英ウェーハボート',
    'wafer-stack': 'ウェーハスタック', 'profile-thermocouple': 'プロファイル熱電対',
    'heat-insulating-pedestal': '断熱台', 'exhaust-port': '排気口', 'manifold-flange': 'マニホールドフランジ',
  },
  photo: {
    'excimer-laser': 'ArFエキシマレーザー', 'beam-delivery': 'ビーム伝送系', illuminator: '照明光学系',
    'exposure-slit': '露光スリット', 'reticle-stage': 'レチクルステージ', reticle: 'レチクル（マスク）',
    pellicle: 'ペリクル', 'projection-lens': '投影レンズ', 'leveling-sensor': 'レベリングセンサー',
    'final-lens': '最終レンズ素子', 'immersion-hood': '液浸フード', 'water-gap': '超純水ギャップ',
    'second-stage': '第2ステージ', 'wafer-stage': 'ウェーハステージ', 'track-interface': 'スキャナー接続部',
    'hmds-prime': 'HMDS気相処理', 'spin-coater': 'スピンコーター', 'soft-bake': 'ソフトベーク用ホットプレート',
    'peb-plate': 'PEB用ホットプレート', 'chill-plate': '冷却プレート', developer: '現像モジュール',
  },
  etch: {
    'rf-source': 'RFソース電源', showerhead: 'シャワーヘッド', 'match-source': 'ソース整合回路',
    'bulk-plasma': 'バルクプラズマ（発光領域）', sheath: 'シース', 'backside-he': 'ヘリウム冷却溝',
    'match-bias': 'バイアス整合回路', 'rf-bias': 'RFバイアス電源', 'oes-viewport': 'OES観測窓',
    'ion-trajectory': 'イオン軌道', 'focus-ring': 'フォーカスリング', esc: '静電チャック',
    'pump-port': '排気ポート', 'turbo-pump': 'ターボ分子ポンプ',
  },
  deposition: {
    overhang: 'トレンチオーバーハング', void: 'ボイド', 'magnet-array': 'マグネトロン磁石配列',
    'cathode-power': 'DCカソード電源', 'backing-plate': 'バッキングプレート', 'erosion-track': 'エロージョントラック',
    'sputter-target': 'スパッタターゲット', 'plasma-torus': '高密度プラズマ', 'wafer-pedestal': 'ペデスタル電極',
    'vacuum-pump': '真空排気系', 'angle-corrector': '平行化磁石', 'beam-scanner': 'ビームスキャナー',
    'resolving-slit': '質量分離スリット', 'tilted-wafer': '7°傾斜ウェーハ', 'analyzer-magnet': '質量分析磁石',
    'accel-column': '加速／減速管', 'neutral-trap': '中性粒子トラップ', 'flood-gun': '電子フラッドガン',
    'extraction-electrode': '引出し電極', 'ion-source': 'アークイオン源',
  },
  metal: {
    'dc-power-supply': 'DC電源', 'spindle-rotation': '回転スピンドル', 'clamshell-holder': 'クラムシェルホルダー',
    'wafer-face-down': 'ウェーハ（フェースダウン）', 'contact-ring': 'コンタクトリング', 'plating-bath': '電解めっき槽',
    'field-shield': '電界整形シールド', 'anode-membrane': 'アノード隔膜', 'anode-cu': '可溶性銅アノード',
    'carrier-head': 'キャリアヘッド', 'slurry-arm': 'スラリー供給アーム', 'zone-chambers': 'ゾーン圧力室',
    'pad-conditioner': 'パッドコンディショナー', 'flexible-membrane': '柔軟膜',
    'wafer-face-down-cmp': 'ウェーハ（フェースダウン）', 'retaining-ring': 'リテーニングリング',
    'polishing-pad': '研磨パッド', platen: 'プラテン',
  },
  eds: {
    'test-head': 'テストヘッド', 'pogo-pin-unit': 'ポゴピンユニット', 'probe-card-pcb': 'プローブカードPCB',
    'space-transformer': 'スペーストランスフォーマー', 'upper-guide-plate': '上部ガイドプレート',
    'probe-needle': 'プローブニードル', 'lower-guide-plate': '下部ガイドプレート', 'wafer-chuck': 'ウェーハチャック',
    'scrub-mark': 'スクラブ痕', overdrive: 'オーバードライブ',
  },
  packaging: {
    'wire-clamp': 'ワイヤクランプ', 'ultrasonic-transducer': '超音波トランスデューサホーン', 'bond-head': 'ボンドヘッド',
    capillary: 'キャピラリ（ボンディングツール）', 'efo-electrode': 'EFOトーチ電極', 'die-bond-pad': 'ダイ／ボンドパッド',
    'heater-block': 'ヒーターブロック（ワークホルダー）', 'capillary-hole': 'キャピラリ穴（H）',
    'capillary-cone-angle': 'キャピラリ円すい角（CA）', 'capillary-face-angle': 'キャピラリ端面角（FA）',
    'capillary-tip-geometry': 'キャピラリ先端形状', 'free-air-ball': 'フリーエアボール（FAB）',
    'capillary-chamfer': '面取り径CD', 'ball-bond': 'ボールボンド（第1ボンド）', 'stitch-bond': 'ステッチ／ウェッジボンド',
  },
};

/**
 * 🔴 제작 고지(A13) 렌더 비활성 — CEO 지시 2026-08-23. **표시만 끈다. 데이터는 보존.**
 *
 * 끄는 것: 도해 아래 「제작 고지 · 주의 N건」 블록(리드문·주의 목록·참고 펼침) 과
 *          도해 위에 겹쳐 그리던 고지 배지(!1 · i2 …). 배지만 남기면 눌러도 읽을 본문이
 *          없으므로 둘은 한 몸으로 끈다.
 * 보존하는 것: `labels-ko-*.json` 의 `notes[]` 원본 · `EquipmentNote` 타입 ·
 *              `prepareNotes()`·`NoteList`·`NoteMarker` 구현 전부 · i18n `equip.notes.*` 키.
 *              라벨 클릭 설명 패널(`LabelDesc`)은 고지가 아니므로 손대지 않았다.
 * 되살리는 법: 이 상수를 `true` 로 되돌린다. 그 한 줄뿐이다.
 */
const SHOW_DIAGRAM_NOTICES = false;

/** 렌더용으로 정규화한 고지 — tone 이 확정되고 번호가 붙는다. */
interface PreparedNote extends EquipmentNote {
  tone: 'info' | 'warn';
  /** 도해 배지에 찍히는 번호(주의 → 참고 순) */
  n: number;
}

/**
 * 🔴 A13 — tone 이 없으면 'warn' 으로 취급한다. 안전한 쪽으로 기운다.
 *    「생략·과장」 고지가 「참고」로 강등되면 고지 체계를 만든 목적이 무너진다.
 */
function normalizeTone(note: EquipmentNote): 'info' | 'warn' {
  return note.tone === 'info' ? 'info' : 'warn';
}

/** 주의를 앞으로 모아 1..N 번호를 매긴다(Array#sort 는 안정 정렬이라 파일 순서가 보존된다). */
function prepareNotes(file: EquipmentLabelFile | null | undefined): PreparedNote[] {
  const raw = file?.notes ?? [];
  const toned = raw.map((note) => ({ ...note, tone: normalizeTone(note) }));
  const sorted = [...toned].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'warn' ? -1 : 1));
  return sorted.map((note, i) => ({ ...note, n: i + 1 }));
}

/**
 * A4 — 실제 장비 단면 이미지 + SVG 라벨 오버레이. 도식 아이콘으로 대체하지 않는다.
 * A13 — 도해가 실물과 다른 부분은 `notes[]` 로 화면에 고지한다. 파일에만 있으면 고지가 아니다.
 * 에셋이 아직 없어도 화면은 성립해야 한다(플레이스홀더 + 라벨 목록).
 */
export function EquipmentSection({ processId, sectionId, content }: Props): React.ReactElement {
  const lang = getLang();
  const [labels, setLabels] = useState<EquipmentLabelFile | null | undefined>(undefined);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [activeNote, setActiveNote] = useState<string | undefined>(undefined);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let alive = true;
    setLabels(undefined);
    setActive(undefined);
    setActiveNote(undefined);
    setShowInfo(false);
    void loadLabels(processId).then((l) => { if (alive) setLabels(l); });
    return () => { alive = false; };
  }, [processId]);

  const notes = useMemo(() => prepareNotes(labels), [labels]);

  // 🔴 tone 누락은 조용히 넘기지 않는다 — warn 으로 올려 표시하되 개발자에게 알린다.
  useEffect(() => {
    if (!import.meta.env?.DEV || !labels) return;
    const missing = (labels.notes ?? []).filter((n) => n.tone !== 'info' && n.tone !== 'warn');
    if (missing.length > 0) {
      console.warn(
        `[equip] '${labels.processId}': tone 없는 고지 ${missing.length}건 → 'warn' 으로 표시합니다: ` +
        missing.map((n) => n.id).join(', '),
      );
    }
  }, [labels]);

  const section = content ? content[sectionId] : null;

  return (
    <div className="equip">
      <div className="equip__viz">
        {labels === undefined && <div className="loading">{t('app.loading')}</div>}
        {labels === null && <EmptySlot processId={processId} sectionId={sectionId} owner="DSN" />}
        {labels && (
          <>
            <RealisticEquipmentFigure processId={processId} lang={lang} />
            <LabelledFigure
              file={labels} lang={lang} active={active} onSelect={setActive}
              notes={notes} showInfo={showInfo} activeNote={activeNote} onSelectNote={setActiveNote}
            />
          </>
        )}
        {/*
          🔴 설명 패널은 **도해 바로 아래**다. 제작 고지 목록보다 위여야 한다.

          종전에는 `.equip__panel` 안, 제작 고지(최대 16건) **다음**에 있었다. 실측하면
          라벨을 눌렀을 때 패널이 `top: 851px` 에 생기는데 뷰포트는 `397px` 였다 —
          **누른 결과가 화면 밖**이라, 누른 사람에게는 도해만 그대로이고 아무 일도
          일어나지 않은 것처럼 보였다. 배선은 살아 있었고 보이지가 않았을 뿐이다.

          `scrollIntoView` 로 끌어오는 방법을 먼저 시도했으나 현재 셸에서 뷰포트가
          움직이지 않았다(실측 `moved: false`). **위치를 옮겨 스크롤 자체를 없앴다.**
        */}
        {labels && active && (
          <LabelDesc
            name={labelName(labels, active, lang)}
            text={content?.labels?.[activeDescKey(labels, active)]}
          />
        )}
        {SHOW_DIAGRAM_NOTICES && labels && notes.length > 0 && (
          <NoteList
            notes={notes} lang={lang} showInfo={showInfo} onToggleInfo={() => setShowInfo((v) => !v)}
            activeNote={activeNote} onSelectNote={setActiveNote}
          />
        )}
      </div>

      <div className="equip__panel">
        {section && section.blocks.length > 0
          ? <Blocks title={section.title} blocks={section.blocks} />
          : <EmptySlot processId={processId} sectionId={sectionId} owner="PLN" />}
      </div>
    </div>
  );
}

/** 실사 절개 사진을 먼저 보여 주고, 아래 정밀 도면은 부품명과 흐름을 읽는 보조층으로 둔다. */
function RealisticEquipmentFigure({ processId, lang }: {
  processId: string; lang: string;
}): React.ReactElement | null {
  const pair = EQUIPMENT_PAIR_FIGURES[processId];
  if (pair) {
    const base = import.meta.env?.BASE_URL ?? '/';
    const language: 'ko' | 'en' | 'ja' = lang === 'ko' || lang === 'ja' ? lang : 'en';
    const figures = pair[language];
    return (
      <div className="equipmentRealisticPair" aria-label={lang === 'ko' ? '증착과 이온주입 장비' : lang === 'ja' ? '成膜・イオン注入装置' : 'Deposition and ion implantation equipment'}>
        {figures.map((figure) => (
          <figure className="fig equipmentRealistic equipmentRealistic--split" key={figure.title}>
            <h3 className="equipmentRealistic__title">{figure.title}</h3>
            <div className="equipmentRealistic__image">
              <img src={`${base}${figure.src}`} alt={figure.title} loading="eager" decoding="async" />
            </div>
            <figcaption className="equipmentRealistic__caption">{figure.detail}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  const src = realisticBackdropUrl(processId);
  if (!src) return null;
  const caption = lang === 'ko'
    ? '실사풍 교육용 시각화 — 정확한 부품 위치와 내부 흐름은 아래 정밀 도면을 기준으로 확인하세요.'
    : lang === 'ja'
      ? 'フォトリアルな教育用可視化 — 正確な部品位置と内部の流れは、下のラベル付き技術図を基準に確認してください。'
      : 'Photorealistic training visualization — use the labelled engineering diagram below for exact component locations and internal flow.';
  return (
    <figure className="fig equipmentRealistic">
      <div className="equipmentRealistic__layout">
        <div className="equipmentRealistic__image">
          <img
            src={src} alt={caption} loading="eager" decoding="async"
            style={{ inlineSize: '100%', blockSize: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(110deg, transparent 15%, rgba(92,210,255,.14) 48%, transparent 62%), radial-gradient(circle at 50% 55%, transparent 35%, rgba(1,7,16,.38) 100%)',
              boxShadow: 'inset 0 0 35px rgba(2,10,22,.55)',
            }}
          />
        </div>
      </div>
      <figcaption className="equipmentRealistic__caption">{caption}</figcaption>
    </figure>
  );
}

/**
 * 라벨 설명 패널.
 *
 * 🔴 **설명 문장이 없어도 패널은 뜬다.** 종전에는 `content.labels[key]` 가 있을 때만 렌더해서,
 *    콘텐츠 JSON 이 아직 없는 공정에서는 라벨을 눌러도 화면이 **아무 반응도 하지 않았다.**
 *    도해 캡션은 「라벨을 누르면 설명이 나옵니다」라고 약속하고 있었다 — 화면이 거짓말을 한 셈이다.
 *    문장이 없으면 **없다고 말한다.** 있는 척하지 않고, 반응 자체를 죽이지도 않는다.
 */
function LabelDesc({ name, text }: { name: string; text?: string }): React.ReactElement {
  return (
    <aside className="equip__desc">
      <h3>{name}</h3>
      {text
        ? <p>{text}</p>
        : <p className="equip__desc__pending">{t('equip.desc.pending')}</p>}
    </aside>
  );
}

function activeDescKey(file: EquipmentLabelFile | null | undefined, id: string): string {
  return file?.labels.find((l) => l.id === id)?.descKey ?? '';
}
function labelName(file: EquipmentLabelFile | null | undefined, id: string, lang: string): string {
  const l = file?.labels.find((x) => x.id === id);
  if (!l) return id;
  if (lang === 'ko') return l.ko;
  if (lang === 'ja') return EQUIPMENT_LABELS_JA[file?.processId ?? '']?.[id] ?? l.en;
  return l.en;
}
function noteText(note: EquipmentNote, lang: string): string {
  return lang !== 'ko' ? note.en : note.ko;
}

/**
 * 좌표 규약(설계서 §6-2): 이미지 픽셀 좌표 = SVG 사용자 좌표.
 * 이미지와 SVG 를 겹치고 둘 다 width:100%; height:auto 로 둔다 → 축소돼도 라벨이 어긋나지 않는다.
 */
function LabelledFigure({ file, lang, active, onSelect, notes, showInfo, activeNote, onSelectNote }: {
  file: EquipmentLabelFile; lang: string; active?: string; onSelect(id: string): void;
  notes: PreparedNote[]; showInfo: boolean; activeNote?: string; onSelectNote(id: string): void;
}): React.ReactElement {
  const [imgOk, setImgOk] = useState(true);
  const base = import.meta.env?.BASE_URL ?? '/';
  const src = `${base}assets/equipment/${file.processId}/${file.image}`;
  const [, , w, h] = file.viewBox;

  // 🔴 라벨 텍스트는 이미지 밖(여백)에 놓인다. viewBox 를 이미지 폭으로만 잡으면 텍스트가 잘린다.
  //    좌우에 여백을 두고, 이미지는 그 안의 원래 자리(0..w)에 정확히 놓아 좌표 정합을 유지한다.
  const GUTTER = Math.round(w * 0.24);
  // 라벨 글자와 이미지 가장자리 사이 간격. 리더선은 여기서 멈추고 글자는 여기서 바깥으로 자란다.
  const TEXT_PAD = 16;
  const vbW = w + GUTTER * 2;
  const imgLeftPct = (GUTTER / vbW) * 100;
  const imgWidthPct = (w / vbW) * 100;
  const routes = EQUIPMENT_MOTION_ROUTES[file.processId] ?? [];
  const [activeRouteId, setActiveRouteId] = useState(routes[0]?.id ?? '');
  const activeRoute = routes.find((route) => route.id === activeRouteId) ?? routes[0];
  const motionTitle = equipment4dTitle(file.processId, lang);
  const beginnerGuide = activeRoute ? equipmentBeginnerGuide(file.processId, activeRoute.id, lang) : null;

  // 참고(info)는 접혀 있는 동안 배지도 숨긴다 — 본문 없는 배지는 읽는 사람을 혼란스럽게 한다.
  // 🔴 SHOW_DIAGRAM_NOTICES=false 이면 배지도 전부 숨긴다(CEO 지시 2026-08-23). 데이터는 그대로다.
  const shownNotes = SHOW_DIAGRAM_NOTICES ? (showInfo ? notes : notes.filter((n) => n.tone === 'warn')) : [];

  return (
    <figure className="fig">
      {routes.length > 0 && (
        <div className="equipment4d__header">
          <div>
            <strong>{motionTitle}</strong>
            <span>{lang === 'ko' ? '실시간 내부 흐름' : lang === 'ja' ? 'リアルタイム内部フロー' : 'Live internal flow'}</span>
          </div>
          <p className="equipment4d__beginnerLead">
            {lang === 'ko' ? '아래 단계 하나를 누르면 해당 흐름과 움직임만 표시됩니다.' : lang === 'ja' ? '下の段階を一つ選ぶと、その流れと動きだけを表示します。' : 'Select one step below to show only that flow and motion.'}
          </p>
          <ol>
            {routes.map((route, index) => (
              <li data-tone={route.tone} data-selected={route.id === activeRouteId ? 'true' : 'false'} key={route.id}>
                <button type="button" onClick={() => setActiveRouteId(route.id)} aria-pressed={route.id === activeRouteId}>
                  <b>{index + 1}</b>
                  <span>{lang === 'ko' ? route.labelKo : lang === 'ja' ? (route.labelJa ?? route.labelEn) : route.labelEn}</span>
                </button>
              </li>
            ))}
          </ol>
          {beginnerGuide && (
            <div className="equipment4d__guide" role="status">
              <strong>{beginnerGuide.title}</strong>
              <span><b>{beginnerGuide.pathLabel}</b> {beginnerGuide.path}</span>
              <span><b>{beginnerGuide.whyLabel}</b> {beginnerGuide.why}</span>
            </div>
          )}
        </div>
      )}
      <div className="fig__stack" style={{ aspectRatio: `${vbW} / ${h}` }}>
        {imgOk
          ? <img
              className="fig__img" src={src} alt="" loading="lazy" decoding="async"
              style={{ insetInlineStart: `${imgLeftPct}%`, inlineSize: `${imgWidthPct}%` }}
              onError={() => setImgOk(false)}
            />
          : <div
              className="fig__placeholder" aria-hidden="true"
              style={{ insetInlineStart: `${imgLeftPct}%`, inlineSize: `${imgWidthPct}%` }}
            />}
        <svg
          className="fig__svg"
          viewBox={`${-GUTTER} 0 ${vbW} ${h}`}
          role="group"
          aria-label={t('equip.overlay')}
        >
          <EquipmentMotionOverlay processId={file.processId} labels={file.labels} activeRouteId={activeRouteId} />
          {file.labels.map((l) => {
            const [ax, ay] = l.anchor;
            const [lx, ly] = l.leaderEnd;
            const on = l.id === active;
            // 🔴 리더선이 라벨 글자를 관통하지 않게 한다 (2026-08-20 · 실측 126/126 라벨 전건 결함).
            //
            //    종전: 텍스트를 **여백 바깥끝**(tx = -GUTTER+12)에 앵커하고 anchor='start' 로 두어
            //          글자가 **이미지 쪽으로** 자랐다. 리더선의 수평 구간은 이미지 안에서 tx 까지
            //          달리므로 **글자 위를 그대로 지나갔다.**
            //          `.lbl__text` 의 halo(`paint-order: stroke`)가 **글자 윤곽 아래에서만** 선을 지워서
            //          **낱말 사이 공백마다 선이 다시 드러났다** — `Ultrasonic-Transducer-Horn` 처럼 보였다.
            //          halo 는 증상을 가렸을 뿐 원인이 아니다.
            //
            //    지금: 텍스트를 **이미지 가장자리**에 앵커하고 anchor 를 뒤집어 글자가 **여백 바깥쪽으로**
            //          자라게 한다. 리더선 수평 구간은 글자가 시작되는 지점에서 **멈춘다**(관통 0).
            //          덤으로 폭이 넘칠 때 넘치는 방향이 **이미지 위 → 여백 바깥**으로 바뀐다.
            //          이미지를 덮는 것보다 여백을 넘는 쪽이 낫다(A4 「부위 라벨이 장비를 가리지 않는다」).
            const tx = l.side === 'left' ? -TEXT_PAD : w + TEXT_PAD;
            const name = labelName(file, l.id, lang);
            const [head, tail] = splitLabel(name);
            return (
              <g
                key={l.id}
                className={`lbl ${on ? 'is-active' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={name}
                onClick={() => onSelect(l.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l.id); } }}
              >
                <polyline
                  points={`${ax},${ay} ${lx},${ly} ${tx},${ly}`}
                  className="lbl__leader"
                  fill="none"
                />
                <circle cx={ax} cy={ay} r={8} className="lbl__dot" />
                <text
                  x={tx} y={ly}
                  textAnchor={l.side === 'left' ? 'end' : 'start'}
                  className="lbl__text"
                >
                  <tspan x={tx} dy={tail ? '-0.35em' : '0.35em'}>{head}</tspan>
                  {tail && <tspan x={tx} dy="1.15em" className="lbl__text--sub">{tail}</tspan>}
                </text>
              </g>
            );
          })}

          {/* 🔴 A13 제작 고지 — 부위 이름(라벨)과 섞이지 않도록 번호 배지로 그린다. */}
          {shownNotes.length > 0 && (
            <g aria-label={t('equip.notes.overlay')} role="group">
              {shownNotes.map((note) => (
                <NoteMarker
                  key={note.id} note={note} lang={lang}
                  on={note.id === activeNote} onSelect={onSelectNote}
                />
              ))}
            </g>
          )}
        </svg>
      </div>
      <figcaption>{t('equip.caption', { count: file.labels.length })}</figcaption>
    </figure>
  );
}

const NOTE_COLOR = { warn: 'var(--bad)', info: 'var(--ink-2)' } as const;

/** 고지 배지 — anchor 에 점, leaderEnd 에 번호 배지. 리더선은 점선이라 라벨선과 구분된다. */
function NoteMarker({ note, lang, on, onSelect }: {
  note: PreparedNote; lang: string; on: boolean; onSelect(id: string): void;
}): React.ReactElement {
  const [ax, ay] = note.anchor;
  const [bx, by] = note.leaderEnd;
  const color = NOTE_COLOR[note.tone];
  const toneLabel = note.tone === 'warn' ? t('equip.notes.warnLabel') : t('equip.notes.infoLabel');
  const sameSpot = Math.abs(ax - bx) < 1 && Math.abs(ay - by) < 1;
  return (
    <g
      className="equipNote__marker"
      tabIndex={0}
      role="button"
      aria-label={`${toneLabel} ${t('equip.notes.item', { n: note.n })}: ${noteText(note, lang)}`}
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(note.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(note.id); } }}
    >
      {!sameSpot && (
        <>
          <polyline
            points={`${ax},${ay} ${bx},${by}`}
            fill="none" stroke={color} strokeWidth={on ? 4 : 2} strokeDasharray="10 8"
          />
          <circle cx={ax} cy={ay} r={6} fill="none" stroke={color} strokeWidth={3} />
        </>
      )}
      <circle cx={bx} cy={by} r={on ? 21 : 17} fill={color} stroke="var(--bg)" strokeWidth={3} />
      {note.tone === 'warn' && (
        <circle cx={bx} cy={by} r={on ? 26 : 22} fill="none" stroke={color} strokeWidth={2} opacity={0.55} />
      )}
      {/* 🔴 배지 글자색은 **테마를 따라야 한다.** 종전 `fill="#ffffff"` 고정이었는데, 배지 배경
          (`--bad`·`--ink-2`)은 테마를 따르므로 다크에서 배경만 밝아지고 글자는 흰색으로 남았다.
          DEV 실측(WCAG 2.x 상대휘도): 흰 글자 기준 다크 warn **2.61:1** · info **2.27:1** — 4.5:1 미달.
          `--accent-ink`(라이트 #ffffff · 다크 #0d1117)로 바꾸면 라이트 6.54/6.85 · 다크 7.24/8.34 로
          네 조합 전부 4.5:1 을 넘긴다. 라이트에서는 값이 #ffffff 라 **보이는 결과가 종전과 같다.**
          윗줄 `stroke="var(--bg)"` 이 같은 파일에서 이미 쓰는 방식이다(인라인 SVG 는 CSS 변수를 받는다). */}
      <text
        x={bx} y={by} textAnchor="middle" dominantBaseline="central"
        fill="var(--accent-ink)" fontSize={22} fontWeight={700} style={{ pointerEvents: 'none' }}
      >
        {note.tone === 'warn' ? '!' : 'i'}
        {note.n}
      </text>
    </g>
  );
}

/**
 * 고지 본문 목록. 고지 문장은 최대 550자에 이르러 SVG 텍스트로는 읽을 수 없다 —
 * 위치는 도해의 배지가, 내용은 이 목록이 담당한다.
 * 🔴 warn 은 언제나 펼쳐져 있다. info 만 접힌다.
 */
function NoteList({ notes, lang, showInfo, onToggleInfo, activeNote, onSelectNote }: {
  notes: PreparedNote[]; lang: string; showInfo: boolean; onToggleInfo(): void;
  activeNote?: string; onSelectNote(id: string): void;
}): React.ReactElement {
  const warns = notes.filter((n) => n.tone === 'warn');
  const infos = notes.filter((n) => n.tone === 'info');
  return (
    <section
      className="equipNotes"
      style={{
        marginBlockStart: 14, padding: 14, background: 'var(--surface)',
        border: '1px solid var(--line)', borderRadius: 'var(--radius)',
        display: 'flex', flexDirection: 'column', gap: 10, minInlineSize: 0, overflowWrap: 'anywhere',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 16 }}>{t('equip.notes.title')}</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('equip.notes.warnCount', { count: warns.length })}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t('equip.notes.lead')}</p>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
        {warns.length === 0 && (
          <li className="note" style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t('equip.notes.noWarn')}</li>
        )}
        {warns.map((n) => (
          <NoteRow key={n.id} note={n} lang={lang} on={n.id === activeNote} onSelect={onSelectNote} />
        ))}
      </ul>

      {infos.length > 0 && (
        <>
          <div>
            <button
              type="button" className="btn btn--sm" onClick={onToggleInfo} aria-expanded={showInfo}
            >
              {showInfo
                ? t('equip.notes.infoHide', { count: infos.length })
                : t('equip.notes.infoShow', { count: infos.length })}
            </button>
          </div>
          {showInfo && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
              {infos.map((n) => (
                <NoteRow key={n.id} note={n} lang={lang} on={n.id === activeNote} onSelect={onSelectNote} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function NoteRow({ note, lang, on, onSelect }: {
  note: PreparedNote; lang: string; on: boolean; onSelect(id: string): void;
}): React.ReactElement {
  const warn = note.tone === 'warn';
  return (
    <li
      className={`note ${warn ? 'note--warn' : ''}`}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
        borderInlineStartWidth: on ? 6 : 3, borderInlineStartStyle: 'solid',
        borderInlineStartColor: warn ? 'var(--warn-line)' : 'var(--accent)',
      }}
      onClick={() => onSelect(note.id)}
    >
      <span
        aria-hidden="true"
        style={{
          flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minInlineSize: 30, blockSize: 22, paddingInline: 6, borderRadius: 999,
          /* 🔴 `color` 는 배경과 짝지어 테마를 따른다 — 307행과 같은 이유·같은 실측값이다.
             종전 `#ffffff` 고정은 다크에서 warn 2.61:1 · info 2.27:1 로 4.5:1 에 못 미쳤다.
             이 배지는 12px bold 라 WCAG 「큰 글자」(18.66px bold) 완화가 적용되지 않는다. */
          background: warn ? 'var(--bad)' : 'var(--ink-2)', color: 'var(--accent-ink)',
          fontSize: 12, fontWeight: 700, marginBlockStart: 2,
        }}
      >
        {warn ? '!' : 'i'}{note.n}
      </span>
      <span style={{ minInlineSize: 0, fontSize: 14 }}>
        <strong style={{ color: warn ? 'var(--bad)' : 'var(--ink-2)', marginInlineEnd: 6, fontSize: 12 }}>
          {warn ? t('equip.notes.warnLabel') : t('equip.notes.infoLabel')}
        </strong>
        {noteText(note, lang)}
      </span>
    </li>
  );
}

/** 「한글(English)」 형태를 두 줄로 나눈다. 한 줄로 두면 여백을 넘어 잘린다. */
function splitLabel(name: string): [string, string | null] {
  const m = /^(.*?)\s*[(（](.+)[)）]\s*$/.exec(name);
  if (m && m[1] && m[2]) return [m[1], m[2]];
  return [name, null];
}

function equipment4dTitle(processId: string, lang: string): string {
  const titles: Record<string, readonly [string, string, string]> = {
    wafer: ['CZ 인상 장비 4D 정밀 도면', 'CZ puller 4D engineering diagram', 'CZ引上げ装置 4D精密図'],
    oxidation: ['산화 확산로 4D 정밀 도면', 'Oxidation furnace 4D engineering diagram', '酸化拡散炉 4D精密図'],
    photo: ['포토리소그래피 장비 4D 정밀 도면', 'Photolithography tool 4D engineering diagram', 'フォトリソグラフィ装置 4D精密図'],
    etch: ['플라즈마 식각 장비 4D 정밀 도면', 'Plasma etcher 4D engineering diagram', 'プラズマエッチング装置 4D精密図'],
    deposition: ['증착·이온주입 장비 4D 정밀 도면', 'Deposition and ion implant 4D engineering diagram', '成膜・イオン注入装置 4D精密図'],
    metal: ['구리 배선·CMP 장비 4D 정밀 도면', 'Copper interconnect and CMP 4D engineering diagram', '銅配線・CMP装置 4D精密図'],
    eds: ['EDS 프로버 4D 정밀 도면', 'EDS wafer prober 4D engineering diagram', 'EDSウェーハプローバ 4D精密図'],
    packaging: ['와이어 본딩 장비 4D 정밀 도면', 'Wire bonder 4D engineering diagram', 'ワイヤボンダ 4D精密図'],
  };
  const title = titles[processId] ?? titles.wafer!;
  return lang === 'ko' ? title[0] : lang === 'ja' ? title[2] : title[1];
}

function equipmentBeginnerGuide(processId: string, id: string, lang: string): {
  title: string; pathLabel: string; path: string; whyLabel: string; why: string;
} {
  const guides: Record<string, Record<'ko' | 'en' | 'ja', { title: string; path: string; why: string }>> = {
    'wafer.argon': {
      ko: { title: '1단계 · 챔버 안을 깨끗하게 유지합니다', path: '위쪽 유입구 → 결정 표면 → 아래쪽 배기구', why: '아르곤이 불순물과 SiO 증기를 밖으로 운반합니다.' },
      en: { title: 'Step 1 · Keep the chamber clean', path: 'Top inlet → crystal surface → lower exhaust', why: 'Argon carries impurities and SiO vapour out of the chamber.' },
      ja: { title: '第1段階 · チャンバー内部を清浄に保つ', path: '上部入口 → 結晶表面 → 下部排気口', why: 'アルゴンが不純物とSiO蒸気を外へ運びます。' },
    },
    'wafer.pull': {
      ko: { title: '2단계 · 액체 실리콘을 단결정으로 성장시킵니다', path: '실리콘 융액 → 메니스커스 → 결정 바디 → 시드 척', why: '시드 척이 천천히 올라가면서 원통형 단결정 잉곳이 자랍니다.' },
      en: { title: 'Step 2 · Grow liquid silicon into a single crystal', path: 'Silicon melt → meniscus → crystal body → seed chuck', why: 'The rising seed chuck grows the cylindrical single-crystal ingot.' },
      ja: { title: '第2段階 · 液体シリコンを単結晶へ成長させる', path: 'シリコン融液 → メニスカス → 結晶本体 → シードチャック', why: 'シードチャックがゆっくり上昇し、円柱状の単結晶が成長します。' },
    },
    'wafer.thermal': {
      ko: { title: '3단계 · 실리콘을 녹이고 성장 계면의 온도를 유지합니다', path: '흑연 히터 → 서셉터 → 석영 도가니 → 융액', why: '열이 너무 많거나 적으면 결정 직경과 결함 분포가 흔들립니다.' },
      en: { title: 'Step 3 · Melt silicon and hold the interface temperature', path: 'Graphite heater → susceptor → quartz crucible → melt', why: 'Too much or too little heat changes crystal diameter and defects.' },
      ja: { title: '第3段階 · シリコンを溶かし界面温度を保つ', path: '黒鉛ヒーター → サセプタ → 石英るつぼ → 融液', why: '熱量の過不足で結晶径と欠陥分布が変化します。' },
    },
    'wafer.crucible': {
      ko: { title: '4단계 · 도가니를 돌리고 높이를 맞춥니다', path: '회전·승강축 → 서셉터 → 석영 도가니', why: '융액을 고르게 섞고, 실리콘이 줄어도 액면 높이를 일정하게 유지합니다.' },
      en: { title: 'Step 4 · Rotate and lift the crucible', path: 'Rotation/lift shaft → susceptor → quartz crucible', why: 'This mixes the melt and keeps its surface height constant as silicon is consumed.' },
      ja: { title: '第4段階 · るつぼを回転・昇降させる', path: '回転・昇降軸 → サセプタ → 石英るつぼ', why: '融液を均一に混ぜ、消費後も液面高さを一定に保ちます。' },
    },
    'oxidation.oxidant': {
      ko: { title: '1단계 · 산화제를 웨이퍼 표면까지 보냅니다', path: '가스 공급관 → 주입기 → 웨이퍼 적재부 → 배기구', why: '산화제가 웨이퍼 표면에서 반응해야 균일한 산화막이 성장합니다.' },
      en: { title: 'Step 1 · Deliver oxidant to the wafer surface', path: 'Gas line → injector → wafer stack → exhaust', why: 'Uniform oxide grows when oxidant reaches and reacts at every wafer surface.' },
      ja: { title: '第1段階 · 酸化剤をウェーハ表面へ送る', path: 'ガス供給管 → インジェクター → ウェーハスタック → 排気口', why: '酸化剤が各ウェーハ表面で反応すると均一な酸化膜が成長します。' },
    },
    'oxidation.thermal': {
      ko: { title: '2단계 · 노 내부 온도를 고르게 맞춥니다', path: '다중 존 히터 → 온도 센서 → 웨이퍼 영역', why: '온도 차이가 생기면 웨이퍼마다 산화막 두께가 달라집니다.' },
      en: { title: 'Step 2 · Equalize furnace temperature', path: 'Multi-zone heater → temperature sensors → wafer zone', why: 'Temperature differences create wafer-to-wafer oxide thickness variation.' },
      ja: { title: '第2段階 · 炉内温度を均一にする', path: '多ゾーンヒーター → 温度センサー → ウェーハ領域', why: '温度差があるとウェーハごとに酸化膜厚が変わります。' },
    },
    'photo.optical': {
      ko: { title: '1단계 · 회로 무늬를 빛으로 축소 전사합니다', path: '엑시머 레이저 → 레티클 → 투영 렌즈 → 웨이퍼', why: '레티클의 회로 패턴을 감광막 위에 정확히 인쇄합니다.' },
      en: { title: 'Step 1 · Project the circuit pattern with light', path: 'Excimer laser → reticle → projection lens → wafer', why: 'The reticle pattern is accurately printed onto photoresist.' },
      ja: { title: '第1段階 · 回路パターンを光で縮小転写する', path: 'エキシマレーザー → レチクル → 投影レンズ → ウェーハ', why: 'レチクルの回路パターンをレジスト上へ正確に転写します。' },
    },
    'photo.track': {
      ko: { title: '2단계 · 감광막을 만들고 현상합니다', path: 'HMDS → 스핀 코팅 → 베이크 → 냉각 → 현상', why: '노광 전후의 감광막 상태를 안정시켜 회로 모양을 남깁니다.' },
      en: { title: 'Step 2 · Form and develop photoresist', path: 'HMDS → spin coat → bake → chill → develop', why: 'These steps stabilize resist before and after exposure and reveal the pattern.' },
      ja: { title: '第2段階 · レジストを形成して現像する', path: 'HMDS → スピン塗布 → ベーク → 冷却 → 現像', why: '露光前後のレジストを安定させ回路形状を残します。' },
    },
    'etch.plasma': {
      ko: { title: '1단계 · 플라즈마 이온으로 노출된 막을 제거합니다', path: '샤워헤드 → 플라즈마 → 시스 → 웨이퍼', why: '전기장으로 가속된 이온이 원하는 영역을 방향성 있게 깎습니다.' },
      en: { title: 'Step 1 · Remove exposed film with plasma ions', path: 'Showerhead → plasma → sheath → wafer', why: 'Electric-field-accelerated ions etch selected areas directionally.' },
      ja: { title: '第1段階 · プラズマイオンで露出膜を除去する', path: 'シャワーヘッド → プラズマ → シース → ウェーハ', why: '電界で加速されたイオンが選択領域を方向性よく削ります。' },
    },
    'etch.exhaust': {
      ko: { title: '2단계 · 식각 부산물을 챔버 밖으로 뺍니다', path: '플라즈마 반응부 → 펌프 포트 → 터보 펌프', why: '부산물이 남으면 재부착되어 오염과 식각 불균일을 만듭니다.' },
      en: { title: 'Step 2 · Remove etch by-products', path: 'Plasma reaction zone → pump port → turbo pump', why: 'Residual products can redeposit and cause contamination or non-uniform etching.' },
      ja: { title: '第2段階 · エッチング副生成物を排出する', path: 'プラズマ反応部 → ポンプポート → ターボポンプ', why: '副生成物が残ると再付着し、汚染や不均一を生じます。' },
    },
    'deposition.sputter': {
      ko: { title: '1단계 · 타깃 원자를 웨이퍼 위에 쌓습니다', path: '스퍼터 타깃 → 플라즈마 → 웨이퍼 받침대', why: '떨어져 나온 금속 원자가 웨이퍼에 도달해 얇은 막을 만듭니다.' },
      en: { title: 'Step 1 · Deposit target atoms onto the wafer', path: 'Sputter target → plasma → wafer pedestal', why: 'Ejected target atoms reach the wafer and form a thin film.' },
      ja: { title: '第1段階 · ターゲット原子をウェーハへ堆積する', path: 'スパッタターゲット → プラズマ → ウェーハ台', why: '放出された原子がウェーハへ到達し薄膜を形成します。' },
    },
    'deposition.implant': {
      ko: { title: '2단계 · 원하는 이온만 골라 웨이퍼에 넣습니다', path: '이온원 → 분석 자석 → 가속관 → 빔 스캐너 → 웨이퍼', why: '불순물 종류와 에너지를 제어해 전기적 특성을 만듭니다.' },
      en: { title: 'Step 2 · Select and implant the required ions', path: 'Ion source → analyzer magnet → accelerator → scanner → wafer', why: 'Ion species and energy set the wafer electrical properties.' },
      ja: { title: '第2段階 · 必要なイオンを選別して注入する', path: 'イオン源 → 分析磁石 → 加速管 → スキャナー → ウェーハ', why: 'イオン種とエネルギーを制御して電気特性を作ります。' },
    },
    'metal.plating': {
      ko: { title: '1단계 · 배선 홈을 구리로 채웁니다', path: '직류 전원 → 구리 양극 → 도금액 → 웨이퍼', why: '구리 이온이 환원되어 비아와 트렌치 안을 채웁니다.' },
      en: { title: 'Step 1 · Fill interconnect features with copper', path: 'DC supply → copper anode → plating bath → wafer', why: 'Copper ions are reduced to fill vias and trenches.' },
      ja: { title: '第1段階 · 配線溝を銅で埋める', path: '直流電源 → 銅アノード → めっき液 → ウェーハ', why: '銅イオンが還元されビアとトレンチを埋めます。' },
    },
    'metal.cmp': {
      ko: { title: '2단계 · 표면의 여분 구리를 평탄하게 제거합니다', path: '슬러리 암 → 웨이퍼 → 연마 패드 → 컨디셔너', why: '배선 홈 안의 구리만 남기고 다음 층을 만들 평면을 확보합니다.' },
      en: { title: 'Step 2 · Planarize excess surface copper', path: 'Slurry arm → wafer → polishing pad → conditioner', why: 'Only copper in features remains, producing a flat surface for the next layer.' },
      ja: { title: '第2段階 · 表面の余分な銅を平坦除去する', path: 'スラリーアーム → ウェーハ → 研磨パッド → コンディショナー', why: '配線溝内の銅だけを残し次層用の平面を作ります。' },
    },
    'eds.signal': {
      ko: { title: '1단계 · 칩에 시험 신호를 보내고 응답을 읽습니다', path: '테스트 헤드 → 포고핀 → 프로브 카드 → 니들 → 웨이퍼', why: '각 칩이 설계대로 전기적으로 동작하는지 판정합니다.' },
      en: { title: 'Step 1 · Send test signals and read the response', path: 'Test head → pogo pins → probe card → needle → wafer', why: 'This determines whether each die operates electrically as designed.' },
      ja: { title: '第1段階 · 試験信号を送り応答を読む', path: 'テストヘッド → ポゴピン → プローブカード → ニードル → ウェーハ', why: '各チップが設計どおり電気動作するか判定します。' },
    },
    'eds.contact': {
      ko: { title: '2단계 · 프로브 니들이 패드와 안정적으로 접촉합니다', path: '프로브 니들 → 오버드라이브 → 스크럽 마크', why: '표면 산화막을 긁어내 낮은 접촉저항을 확보합니다.' },
      en: { title: 'Step 2 · Make stable needle-to-pad contact', path: 'Probe needle → overdrive → scrub mark', why: 'Scrubbing breaks surface oxide and lowers contact resistance.' },
      ja: { title: '第2段階 · ニードルをパッドへ安定接触させる', path: 'プローブニードル → オーバードライブ → スクラブ痕', why: '表面酸化膜を破り接触抵抗を下げます。' },
    },
    'packaging.bond': {
      ko: { title: '1단계 · 칩 패드와 기판을 와이어로 연결합니다', path: '볼 형성 → 칩 패드 본드 → 와이어 루프 → 스티치 본드', why: '칩의 전기 신호가 패키지 단자로 이동할 길을 만듭니다.' },
      en: { title: 'Step 1 · Connect die pads to the substrate', path: 'Ball formation → die-pad bond → wire loop → stitch bond', why: 'This creates the electrical path from the die to package terminals.' },
      ja: { title: '第1段階 · チップパッドと基板をワイヤ接続する', path: 'ボール形成 → パッド接合 → ワイヤループ → ステッチ接合', why: 'チップ信号がパッケージ端子へ進む経路を作ります。' },
    },
    'packaging.wire': {
      ko: { title: '2단계 · 와이어를 공급하며 초음파로 접합합니다', path: '와이어 클램프 → 초음파 변환기 → 캐필러리 → 본드 패드', why: '압력·열·초음파 에너지로 금속 사이의 접합을 만듭니다.' },
      en: { title: 'Step 2 · Feed wire and bond it ultrasonically', path: 'Wire clamp → ultrasonic transducer → capillary → bond pad', why: 'Pressure, heat and ultrasonic energy create the metal bond.' },
      ja: { title: '第2段階 · ワイヤを供給し超音波接合する', path: 'ワイヤクランプ → 超音波変換器 → キャピラリ → ボンドパッド', why: '圧力・熱・超音波エネルギーで金属接合を作ります。' },
    },
  };
  const language: 'ko' | 'en' | 'ja' = lang === 'ko' || lang === 'ja' ? lang : 'en';
  const guide = guides[`${processId}.${id}`]?.[language] ?? guides['wafer.argon']![language];
  return {
    ...guide,
    pathLabel: language === 'ko' ? '보는 순서:' : language === 'ja' ? '見る順序：' : 'Follow:',
    whyLabel: language === 'ko' ? '왜 필요한가:' : language === 'ja' ? '必要な理由：' : 'Why:',
  };
}
