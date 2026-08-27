import { useEffect, useMemo, useState } from 'react';
import type { EquipmentLabelFile, EquipmentNote, ProcessContent, ProseSectionId } from '@/content/types';
import { loadLabels } from '@/content/loader';
import { getLang, t } from '@/lib/i18n';
import { Blocks } from '@/ui/widgets/Blocks';
import { EmptySlot } from '@/ui/widgets/EmptySlot';
import { realisticBackdropUrl } from '@/viz/realisticBackdrops';
import { EquipmentMotionOverlay } from '@/viz/equipment/EquipmentMotionOverlay';

interface Props { processId: string; sectionId: ProseSectionId; content: ProcessContent | null }

interface EquipmentPairFigure {
  src: string;
  title: string;
  detail: string;
}

const EQUIPMENT_PAIR_FIGURES: Record<string, Record<'ko' | 'en', EquipmentPairFigure[]>> = {
  deposition: {
    en: [
      { src: 'assets/simulator-realistic/deposition/ald-reactor-v2.jpg', title: 'Deposition tool — ALD reactor', detail: 'Precursor pulses enter the reaction chamber and form the film on the wafer.' },
      { src: 'assets/simulator-realistic/deposition/ion-implanter-v2.jpg', title: 'Ion implantation tool — beamline', detail: 'Ions travel from the source through mass analysis and acceleration to the tilted wafer.' },
    ],
    ko: [
      { src: 'assets/simulator-realistic/deposition/ald-reactor-v2.jpg', title: '증착 장비 — ALD 반응기', detail: '전구체가 반응 챔버에 교대로 주입되어 웨이퍼 위에 막을 형성합니다.' },
      { src: 'assets/simulator-realistic/deposition/ion-implanter-v2.jpg', title: '이온주입 장비 — 빔라인', detail: '이온원에서 생성된 이온이 질량 분석과 가속을 거쳐 기울여진 웨이퍼에 도달합니다.' },
    ],
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
    const figures = pair[lang === 'ko' ? 'ko' : 'en'];
    return (
      <div className="equipmentRealisticPair" aria-label={lang !== 'ko' ? 'Deposition and ion implantation equipment' : '증착과 이온주입 장비'}>
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
  return lang !== 'ko' ? l.en : l.ko;
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

  // 참고(info)는 접혀 있는 동안 배지도 숨긴다 — 본문 없는 배지는 읽는 사람을 혼란스럽게 한다.
  // 🔴 SHOW_DIAGRAM_NOTICES=false 이면 배지도 전부 숨긴다(CEO 지시 2026-08-23). 데이터는 그대로다.
  const shownNotes = SHOW_DIAGRAM_NOTICES ? (showInfo ? notes : notes.filter((n) => n.tone === 'warn')) : [];

  return (
    <figure className="fig">
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
          <EquipmentMotionOverlay processId={file.processId} labels={file.labels} />
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
            const name = lang !== 'ko' ? l.en : l.ko;
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
