import { Marked } from "marked";

/**
 * Markdown for *curriculum content* (trusted, authored in this repo). Raw HTML in
 * the source is escaped rather than rendered, as defence in depth. User-generated
 * text (chat) never goes through this — see src/components/chat/format.tsx.
 */
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(token) {
      return escapeHtml(token.text);
    },
    link({ href, text }) {
      const safe = /^(https?:|\/|#)/.test(href) ? href : "#";
      const external = /^https?:/.test(safe);
      return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noreferrer noopener"' : ""}>${text}</a>`;
    },
  },
});

export function renderMarkdown(src: string): string {
  return marked.parse(src, { async: false }) as string;
}
