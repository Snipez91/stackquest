"use client";

import { useState, type ReactNode } from "react";

/**
 * Chat formatting → React elements. User text is never interpreted as HTML;
 * every piece becomes a text node or a known element, so there is nothing to
 * sanitise. Supported: ```fenced code```, `inline code`, **bold**, _italic_,
 * ||spoilers||, @mentions, and http(s) links.
 */

export function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <span className="rounded bg-surface-3 px-1">{children}</span>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded bg-surface-3 px-1.5 text-xs text-muted underline decoration-dotted hover:text-text"
      aria-label="Spoiler hidden. Activate to reveal."
    >
      spoiler — reveal
    </button>
  );
}

function inline(text: string, keyBase: string, myHandle?: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\|\|[\s\S]+?\|\||`[^`\n]+`|\*\*[^*\n]+\*\*|(?<![\w])_[^_\n]+_(?![\w])|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|(?<![\w@])@[a-z0-9]{2,24}\b)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("||")) out.push(<Spoiler key={key}>{inline(tok.slice(2, -2), key, myHandle)}</Spoiler>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("_")) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("@")) {
      const me = myHandle && tok.slice(1).toLowerCase() === myHandle.toLowerCase();
      out.push(
        <span key={key} className={me ? "rounded bg-warning/20 px-0.5 font-medium text-text" : "font-medium text-primary"}>
          {tok}
        </span>,
      );
    } else
      out.push(
        <a key={key} href={tok} target="_blank" rel="noreferrer noopener nofollow" className="text-primary underline underline-offset-2 break-all">
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function FormattedMessage({ body, myHandle }: { body: string; myHandle?: string }) {
  const parts: ReactNode[] = [];
  const fence = /```([\w-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = fence.exec(body))) {
    if (m.index > last) parts.push(<span key={`t${i}`} className="whitespace-pre-wrap">{inline(body.slice(last, m.index), `t${i}`, myHandle)}</span>);
    parts.push(
      <pre key={`c${i}`} className="my-1.5 max-h-80 overflow-auto rounded-md border border-border bg-code p-2.5 font-mono text-[12.5px] leading-snug">
        {m[1] && <span className="mb-1 block text-[10px] uppercase tracking-wide text-faint">{m[1]}</span>}
        <code>{m[2].replace(/\n$/, "")}</code>
      </pre>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < body.length) parts.push(<span key="tail" className="whitespace-pre-wrap">{inline(body.slice(last), "tail", myHandle)}</span>);
  return <div className="text-sm leading-relaxed break-words">{parts}</div>;
}
