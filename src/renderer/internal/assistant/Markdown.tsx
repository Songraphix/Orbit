import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { Block, Inline } from '@shared/markdown';
import type { AssistantSource } from '@shared/assistant';

/**
 * Draws a parsed Markdown answer (roadmap P3.1) as React elements — never as HTML — with each
 * citation as a small numbered chip: hover shows the quote, click shows it on the page.
 */
export function Markdown(props: {
  blocks: readonly Block[];
  sources: readonly AssistantSource[];
  onCite: (n: number) => void;
  onLink: (href: string) => void;
}) {
  return <>{props.blocks.map((block, i) => renderBlock(block, i, props))}</>;
}

type Props = Parameters<typeof Markdown>[0];

function renderBlock(block: Block, key: number, props: Props): ReactNode {
  switch (block.t) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
      return <Tag key={key}>{renderInlines(block.c, props)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{renderInlines(block.c, props)}</p>;
    case 'code':
      return (
        <pre key={key} data-lang={block.lang || undefined}>
          <code>{block.v}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote key={key}>{block.c.map((child, i) => renderBlock(child, i, props))}</blockquote>
      );
    case 'rule':
      return <hr key={key} />;
    case 'table':
      return (
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i}>{renderInlines(cell, props)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i}>{renderInlines(cell, props)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i}>{item.map((child, j) => renderBlock(child, j, props))}</li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
  }
}

function renderInlines(nodes: readonly Inline[], props: Props): ReactNode {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text':
        return <Fragment key={i}>{node.v}</Fragment>;
      case 'code':
        return <code key={i}>{node.v}</code>;
      case 'strong':
        return <strong key={i}>{renderInlines(node.c, props)}</strong>;
      case 'em':
        return <em key={i}>{renderInlines(node.c, props)}</em>;
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            onClick={(event) => {
              event.preventDefault();
              props.onLink(node.href);
            }}
          >
            {renderInlines(node.c, props)}
          </a>
        );
      case 'cite':
        return (
          <span key={i} className="cites">
            {node.n.map((n) => {
              const source = props.sources.find((s) => s.n === n);
              return (
                <button
                  key={n}
                  type="button"
                  className="cite"
                  title={source ? `${source.title}\n“${source.quote}”` : `Source ${n}`}
                  aria-label={`Source ${n}${source ? `: ${source.title}` : ''}`}
                  onClick={() => props.onCite(n)}
                  data-testid="assistant-cite"
                >
                  {n}
                </button>
              );
            })}
          </span>
        );
    }
  });
}
