import type { Block } from '@/content/types';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { SourceBadge } from '@/ui/widgets/SourceBadge';
import { SHOW_PROVENANCE } from '@/config/provenance-display';
import { redactProvenance } from '@/lib/redact-provenance';
import { SHOW_MISCONCEPTION_NOTES, isMisconceptionNote } from '@/config/misconception-notes';

/**
 * 🔴 본문 산문에 **인라인으로 박힌 S번호 인용**을 화면에서만 지운다 — CEO 지시 2026-08-24.
 *
 * 배지는 `SourceBadge` 를 끄면 사라지지만, 「정본 계수표(S120 Table I·II)의 …」처럼
 * **문장 안에 들어간 인용은 문자열이라 컴포넌트로 못 끈다.** 그래서 렌더 직전에 거른다.
 * ⛔ `src/content/**` 원문은 고치지 않는다. 상수를 되돌리면 원문이 그대로 다시 나온다.
 */
function say(text: string): string {
  return SHOW_PROVENANCE ? text : redactProvenance(text);
}

/** PLN 이 넣는 7종 블록만 렌더한다. 알 수 없는 타입은 조용히 버리지 않고 dev 에서 경고한다. */
export function Blocks({ title, blocks }: { title: string; blocks: Block[] }): React.ReactElement {
  return (
    <div className="prose">
      <h2>{title}</h2>
      {blocks.map((b, i) => <BlockView key={i} block={b} />)}
    </div>
  );
}

function BlockView({ block }: { block: Block }): React.ReactElement | null {
  switch (block.type) {
    case 'p': return <p>{say(block.text)}</p>;
    case 'h': {
      const H = `h${block.level}` as 'h2' | 'h3' | 'h4';
      return <H>{say(block.text)}</H>;
    }
    case 'list': return block.ordered
      ? <ol>{block.items.map((it, i) => <li key={i}>{say(it)}</li>)}</ol>
      : <ul>{block.items.map((it, i) => <li key={i}>{say(it)}</li>)}</ul>;
    case 'note': {
      // 🔴 오해 교정 note 비활성 — CEO 지시 2026-08-24. **원고는 그대로다.**
      //    타입이 아니라 문면으로 가른다 — 도해 범위 안내·실습 안내·공정 설명 note 는 남긴다.
      if (!SHOW_MISCONCEPTION_NOTES && isMisconceptionNote(block.text)) return null;
      return <aside className={`note note--${block.tone}`}>{say(block.text)}</aside>;
    }
    case 'table': return (
      <div className="tableWrap">
        <table>
          <thead><tr>{block.head.map((h, i) => <th key={i}>{say(h)}</th>)}</tr></thead>
          <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{say(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    case 'formula': return (
      <figure className="formula">
        <LatexFormula latex={block.latex} />
        {block.caption && <figcaption>{say(block.caption)}</figcaption>}
        <SourceBadge sourceId={block.sourceId} />
      </figure>
    );
    case 'figure': return (
      <figure className="figure">
        <img src={block.src} alt={say(block.caption)} loading="lazy" decoding="async" />
        <figcaption>{say(block.caption)} <SourceBadge sourceId={block.sourceId} /></figcaption>
      </figure>
    );
    default: {
      if (import.meta.env?.DEV) console.warn('[content] unknown block type', block);
      return null;
    }
  }
}

/** 콘텐츠 원장의 LaTeX를 학습자용 수식으로 표시한다. 잘못된 식은 원문을 숨기지 않고 대체 표시한다. */
function LatexFormula({ latex }: { latex: string }): React.ReactElement {
  try {
    return (
      <div
        className="formula__math"
        role="math"
        aria-label={latex}
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(latex, {
            displayMode: true,
            throwOnError: true,
            strict: 'warn',
          }),
        }}
      />
    );
  } catch {
    return <code className="formula__fallback">{latex}</code>;
  }
}
