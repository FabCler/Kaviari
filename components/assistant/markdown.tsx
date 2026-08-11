import * as React from "react";

/**
 * Tiny markdown renderer for assistant replies — bold, inline code,
 * bullet/numbered lists and simple headings. No dependencies.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** and `code` spans.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      nodes.push(
        <code
          key={`${keyPrefix}-${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else if (part) {
      nodes.push(<React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>);
    }
  });
  return nodes;
}

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;
const HEADING_RE = /^#{1,4}\s+/;

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1.5 space-y-1 pl-4">
        {list.map((item, i) => (
          <li key={i} className="list-disc marker:text-gold-deep">
            {renderInline(item, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (BULLET_RE.test(line)) {
      list.push(line.replace(BULLET_RE, ""));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (HEADING_RE.test(line)) {
      blocks.push(
        <p key={`h-${key++}`} className="mt-2 mb-1 font-semibold">
          {renderInline(line.replace(HEADING_RE, ""), `h-${key}`)}
        </p>
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-1.5 first:mt-0 last:mb-0">
          {renderInline(line, `p-${key}`)}
        </p>
      );
    }
  }
  flushList();

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}
