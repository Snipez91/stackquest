"use client";

import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

/**
 * CodeMirror editor with a plain <textarea> alternative (toggle in the
 * workspace) for screen-reader users or anyone who prefers it. In CodeMirror,
 * Tab indents; press Esc then Tab to move focus out of the editor.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly,
  plain,
  label,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  readOnly?: boolean;
  plain?: boolean;
  label: string;
  theme: "dark" | "light";
}) {
  const extensions = useMemo(() => {
    const ext = [EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": label })];
    if (language === "python") ext.push(python());
    if (language === "javascript" || language === "json") ext.push(javascript());
    return ext;
  }, [language, label]);

  if (plain) {
    return (
      <textarea
        aria-label={label}
        className="h-full min-h-[320px] w-full resize-none bg-code p-3 font-mono text-[13px] leading-relaxed text-text outline-none focus-visible:outline-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        onKeyDown={(e) => {
          // Insert 4 spaces on Tab without trapping focus when Shift is held.
          if (e.key === "Tab" && !e.shiftKey && !readOnly) {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const next = value.slice(0, s) + "    " + value.slice(el.selectionEnd);
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
          }
        }}
      />
    );
  }
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={theme === "dark" ? oneDark : "light"}
      readOnly={readOnly}
      editable={!readOnly}
      height="100%"
      className="h-full text-[13px]"
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false }}
    />
  );
}
