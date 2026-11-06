/** Tokenizer + recursive-descent parser for a practical subset of bash. */
import type { Node, Redirect, Word, WordPart } from "./ast";

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public incomplete = false,
  ) {
    super(message);
  }
}

type Tok =
  | { t: "word"; w: Word; line: number }
  | { t: "op"; v: string; line: number }
  | { t: "redir"; r: Redirect; line: number }
  | { t: "arith"; src: string; line: number }
  | { t: "nl"; line: number }
  | { t: "eof"; line: number };

const OPS = ["&&", "||", ";;", "|", "&", ";", "(", ")"];
const META = new Set([" ", "\t", "\n", "|", "&", ";", "(", ")", "<", ">"]);
const RESERVED = new Set(["if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "{", "}", "!", "function"]);

/** Scan from i (just after an opening paren) to the matching close paren; returns index of the ')' */
function matchParen(src: string, i: number): number {
  let depth = 1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "'") {
      const e = src.indexOf("'", j + 1);
      if (e < 0) return -1;
      j = e;
      continue;
    }
    if (c === '"') {
      for (j++; j < src.length && src[j] !== '"'; j++) if (src[j] === "\\") j++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

class Lexer {
  i = 0;
  line = 1;
  toks: Tok[] = [];
  pendingHeredocs: { r: Redirect; delim: string; strip: boolean }[] = [];
  constructor(private src: string) {}

  err(msg: string, incomplete = false): never {
    throw new ParseError(msg, this.line, incomplete);
  }

  prevAllowsCommand(): boolean {
    const p = this.toks[this.toks.length - 1];
    if (!p) return true;
    if (p.t === "nl" || p.t === "op") return true;
    if (p.t === "word" && p.w.parts.length === 1 && p.w.parts[0].t === "lit" && !p.w.parts[0].q && ["do", "then", "else", "{", "!", "elif", "if", "while", "until"].includes(p.w.raw)) return true;
    return false;
  }

  run(): Tok[] {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === " " || c === "\t" || c === "\r") {
        this.i++;
        continue;
      }
      if (c === "\\" && s[this.i + 1] === "\n") {
        this.i += 2;
        this.line++;
        continue;
      }
      if (c === "#") {
        while (this.i < s.length && s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "\n") {
        this.toks.push({ t: "nl", line: this.line });
        this.i++;
        this.line++;
        if (this.pendingHeredocs.length) this.readHeredocs();
        continue;
      }
      if (s.startsWith("((", this.i) && this.prevAllowsCommand()) {
        const end = this.findArithEnd(this.i + 2);
        if (end >= 0) {
          this.toks.push({ t: "arith", src: s.slice(this.i + 2, end), line: this.line });
          this.i = end + 2;
          continue;
        }
      }
      // redirections
      const rm = /^(\d*)(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<)/.exec(s.slice(this.i, this.i + 8));
      if (rm && (rm[1] === "" || /^\d+$/.test(rm[1]))) {
        this.i += rm[0].length;
        this.readRedirect(rm[1] ? parseInt(rm[1], 10) : -1, rm[2]);
        continue;
      }
      const prevTok = this.toks[this.toks.length - 1];
      if (prevTok && prevTok.t === "word" && prevTok.w.raw === "=~") {
        this.toks.push({ t: "word", w: this.readWord(true), line: this.line });
        continue;
      }
      const op = OPS.find((o) => s.startsWith(o, this.i));
      if (op) {
        this.toks.push({ t: "op", v: op, line: this.line });
        this.i += op.length;
        continue;
      }
      const w = this.readWord();
      this.toks.push({ t: "word", w, line: this.line });
    }
    if (this.pendingHeredocs.length) this.readHeredocs();
    this.toks.push({ t: "eof", line: this.line });
    return this.toks;
  }

  findArithEnd(from: number): number {
    let depth = 0;
    for (let j = from; j < this.src.length; j++) {
      const c = this.src[j];
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) return this.src[j + 1] === ")" ? j : -1;
        depth--;
      } else if (c === "\n") return -1;
    }
    return -1;
  }

  readRedirect(fd: number, op: string): void {
    const s = this.src;
    while (s[this.i] === " " || s[this.i] === "\t") this.i++;
    let rop = op as Redirect["op"];
    if (op === ">|") rop = ">";
    if (op === "<<" || op === "<<-") {
      const w = this.readWord();
      const quoted = w.parts.some((p) => p.t === "lit" && p.q);
      const delim = w.parts.map((p) => (p.t === "lit" ? p.v : "")).join("");
      const r: Redirect = { fd: fd < 0 ? 0 : fd, op: "<<", target: null, heredoc: { body: "", quoted } };
      this.pendingHeredocs.push({ r, delim, strip: op === "<<-" });
      this.toks.push({ t: "redir", r, line: this.line });
      return;
    }
    if ((op === ">&" || op === "<&") && /[0-9-]/.test(s[this.i] ?? "")) {
      let j = this.i;
      while (/[0-9-]/.test(s[j] ?? "")) j++;
      const raw = s.slice(this.i, j);
      this.i = j;
      this.toks.push({ t: "redir", r: { fd: fd < 0 ? (op === ">&" ? 1 : 0) : fd, op: rop, target: { parts: [{ t: "lit", v: raw, q: false }], raw } }, line: this.line });
      return;
    }
    if (this.i >= s.length || META.has(s[this.i])) this.err(`syntax error near unexpected token \`${s[this.i] === "\n" || this.i >= s.length ? "newline" : s[this.i]}'`);
    const target = this.readWord();
    const defFd = op.startsWith("<") ? 0 : 1;
    if (op === ">&") rop = "&>"; // >& file  == &> file
    this.toks.push({ t: "redir", r: { fd: fd < 0 ? defFd : fd, op: rop, target }, line: this.line });
  }

  readHeredocs(): void {
    const s = this.src;
    for (const h of this.pendingHeredocs) {
      const lines: string[] = [];
      while (this.i < s.length) {
        let nl = s.indexOf("\n", this.i);
        if (nl < 0) nl = s.length;
        let line = s.slice(this.i, nl);
        this.i = nl + 1;
        this.line++;
        if (h.strip) line = line.replace(/^\t+/, "");
        if (line.replace(/\r$/, "") === h.delim) break;
        lines.push(line);
      }
      h.r.heredoc!.body = lines.length ? lines.join("\n") + "\n" : "";
    }
    this.pendingHeredocs = [];
  }

  readWord(regexMode = false): Word {
    const s = this.src;
    const start = this.i;
    const parts: WordPart[] = [];
    const lit = (v: string, q: boolean) => {
      const last = parts[parts.length - 1];
      if (last && last.t === "lit" && last.q === q) last.v += v;
      else parts.push({ t: "lit", v, q });
    };
    if (s[this.i] === "~") {
      let j = this.i + 1;
      while (j < s.length && /[A-Za-z0-9_.-]/.test(s[j])) j++;
      if (j >= s.length || s[j] === "/" || META.has(s[j])) {
        parts.push({ t: "tilde", user: s.slice(this.i + 1, j) });
        this.i = j;
      }
    }
    while (this.i < s.length) {
      const c = s[this.i];
      if (META.has(c) && !(regexMode && (c === "(" || c === ")" || c === "|"))) break;
      if (c === "\\") {
        if (s[this.i + 1] === "\n") {
          this.i += 2;
          this.line++;
          continue;
        }
        if (this.i + 1 < s.length) lit(s[this.i + 1], true);
        this.i += 2;
        continue;
      }
      if (c === "'") {
        const e = s.indexOf("'", this.i + 1);
        if (e < 0) this.err("unexpected EOF while looking for matching `''", true);
        lit(s.slice(this.i + 1, e), true);
        this.line += s.slice(this.i, e).split("\n").length - 1;
        this.i = e + 1;
        continue;
      }
      if (c === '"') {
        this.i++;
        this.readDq(parts, lit);
        continue;
      }
      if (c === "$") {
        this.readDollar(parts, lit, false);
        continue;
      }
      if (c === "`") {
        const e = s.indexOf("`", this.i + 1);
        if (e < 0) this.err("unexpected EOF while looking for matching ``'", true);
        parts.push({ t: "cmd", src: s.slice(this.i + 1, e), q: false });
        this.i = e + 1;
        continue;
      }
      lit(c, false);
      this.i++;
    }
    return { parts, raw: s.slice(start, this.i) };
  }

  readDq(parts: WordPart[], lit: (v: string, q: boolean) => void): void {
    const s = this.src;
    let any = false;
    while (true) {
      if (this.i >= s.length) this.err('unexpected EOF while looking for matching `"\'', true);
      const c = s[this.i];
      if (c === '"') {
        this.i++;
        break;
      }
      any = true;
      if (c === "\\") {
        const n = s[this.i + 1];
        if (n === "\n") {
          this.i += 2;
          continue;
        }
        if (n === "$" || n === "`" || n === '"' || n === "\\") {
          lit(n, true);
          this.i += 2;
          continue;
        }
        lit("\\", true);
        this.i++;
        continue;
      }
      if (c === "$") {
        this.readDollar(parts, lit, true);
        continue;
      }
      if (c === "`") {
        const e = s.indexOf("`", this.i + 1);
        if (e < 0) this.err("unexpected EOF while looking for matching ``'", true);
        parts.push({ t: "cmd", src: s.slice(this.i + 1, e), q: true });
        this.i = e + 1;
        continue;
      }
      if (c === "\n") this.line++;
      lit(c, true);
      this.i++;
    }
    if (!any) lit("", true);
  }

  readDollar(parts: WordPart[], lit: (v: string, q: boolean) => void, q: boolean): void {
    const s = this.src;
    const n = s[this.i + 1];
    if (n === "(" && s[this.i + 2] === "(") {
      const end = matchParen(s, this.i + 3);
      if (end >= 0 && s[end + 1] === ")") {
        parts.push({ t: "arith", src: s.slice(this.i + 3, end), q });
        this.i = end + 2;
        return;
      }
    }
    if (n === "(") {
      const end = matchParen(s, this.i + 2);
      if (end < 0) this.err("unexpected EOF while looking for matching `)'", true);
      parts.push({ t: "cmd", src: s.slice(this.i + 2, end), q });
      this.i = end + 1;
      return;
    }
    if (n === "{") {
      const end = s.indexOf("}", this.i + 2);
      if (end < 0) this.err("unexpected EOF while looking for matching `}'", true);
      const inner = s.slice(this.i + 2, end);
      this.i = end + 1;
      parts.push(parseBraceParam(inner, q));
      return;
    }
    if (n !== undefined && /[A-Za-z_]/.test(n)) {
      let j = this.i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      parts.push({ t: "param", name: s.slice(this.i + 1, j), q });
      this.i = j;
      return;
    }
    if (n !== undefined && /[0-9?#@*$!\-]/.test(n)) {
      parts.push({ t: "param", name: n, q });
      this.i += 2;
      return;
    }
    lit("$", q);
    this.i++;
  }
}

function parseBraceParam(inner: string, q: boolean): WordPart {
  if (inner.startsWith("#") && inner.length > 1) return { t: "param", name: inner.slice(1), op: "len", q };
  const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?#@*$!])([\s\S]*)$/.exec(inner);
  if (!m) return { t: "lit", v: "${" + inner + "}", q };
  const [, name, rest] = m;
  if (!rest) return { t: "param", name, q };
  if (/^(\^\^|,,|\^|,)$/.test(rest)) return { t: "param", name, op: rest, q };
  const om = /^(:-|:=|:\+|:\?|-|=|\+|\?|##|#|%%|%|\/\/|\/)([\s\S]*)$/.exec(rest);
  if (!om) return { t: "param", name, q };
  if (om[1] === "/" || om[1] === "//") {
    let k = 0;
    while (k < om[2].length && om[2][k] !== "/") k += om[2][k] === "\\" ? 2 : 1;
    return { t: "param", name, op: om[1], arg: parseWordString(om[2].slice(0, k)).parts, arg2: parseWordString(om[2].slice(k + 1)).parts, q };
  }
  return { t: "param", name, op: om[1], arg: parseWordString(om[2]).parts, q };
}

/** Parse a string as the contents of a word (used for ${x:-...} args). */
export function parseWordString(src: string): Word {
  const lx = new Lexer(src);
  const parts: WordPart[] = [];
  const lit = (v: string, q: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.t === "lit" && last.q === q) last.v += v;
    else parts.push({ t: "lit", v, q });
  };
  while (lx.i < src.length) {
    const c = src[lx.i];
    if (c === "$") lx.readDollar(parts, lit, false);
    else if (c === "'") {
      const e = src.indexOf("'", lx.i + 1);
      const end = e < 0 ? src.length : e;
      lit(src.slice(lx.i + 1, end), true);
      lx.i = end + 1;
    } else if (c === '"') {
      lx.i++;
      lx.readDq(parts, lit);
    } else if (c === "\\" && lx.i + 1 < src.length) {
      lit(src[lx.i + 1], true);
      lx.i += 2;
    } else {
      lit(c, false);
      lx.i++;
    }
  }
  return { parts, raw: src };
}

/** Parse heredoc body (unquoted delimiter): like double-quoted text without quote handling. */
export function parseHeredocBody(src: string): WordPart[] {
  const lx = new Lexer(src);
  const parts: WordPart[] = [];
  const lit = (v: string, q: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.t === "lit") last.v += v;
    else parts.push({ t: "lit", v, q });
  };
  while (lx.i < src.length) {
    const c = src[lx.i];
    if (c === "$") lx.readDollar(parts, lit, true);
    else if (c === "\\" && "$`\\".includes(src[lx.i + 1] ?? "")) {
      lit(src[lx.i + 1], true);
      lx.i += 2;
    } else if (c === "`") {
      const e = src.indexOf("`", lx.i + 1);
      if (e < 0) {
        lit(c, true);
        lx.i++;
      } else {
        parts.push({ t: "cmd", src: src.slice(lx.i + 1, e), q: true });
        lx.i = e + 1;
      }
    } else {
      lit(c, true);
      lx.i++;
    }
  }
  return parts;
}

// ------------------------------------------------------------------ parser

function isReserved(t: Tok, word?: string): boolean {
  if (t.t !== "word") return false;
  const w = t.w;
  if (w.parts.length !== 1 || w.parts[0].t !== "lit" || w.parts[0].q) return false;
  return word ? w.raw === word : RESERVED.has(w.raw);
}

class Parser {
  p = 0;
  constructor(private toks: Tok[]) {}

  peek(o = 0): Tok {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)];
  }
  next(): Tok {
    return this.toks[this.p++];
  }
  tokText(t: Tok): string {
    if (t.t === "word") return t.w.raw;
    if (t.t === "op") return t.v;
    if (t.t === "nl") return "newline";
    if (t.t === "eof") return "end of file";
    if (t.t === "arith") return "((";
    return t.r.op;
  }
  fail(t: Tok): never {
    if (t.t === "eof") throw new ParseError("syntax error: unexpected end of file", t.line, true);
    throw new ParseError(`syntax error near unexpected token \`${this.tokText(t)}'`, t.line);
  }
  skipNl(): void {
    while (this.peek().t === "nl") this.p++;
  }
  expectWord(word: string): void {
    this.skipNl();
    const t = this.next();
    if (!isReserved(t, word)) this.fail(t);
  }

  parseProgram(): Node {
    const n = this.parseList([]);
    const t = this.peek();
    if (t.t !== "eof") this.fail(t);
    return n;
  }

  /** Parse a command list until one of the terminator reserved words (or ')' / ';;' / eof). */
  parseList(terms: string[]): Node {
    const items: Node[] = [];
    while (true) {
      while (this.peek().t === "nl" || (this.peek().t === "op" && (this.peek() as { v: string }).v === ";" && items.length)) this.p++;
      const t = this.peek();
      if (t.t === "eof") break;
      if (t.t === "op" && (t.v === ")" || t.v === ";;")) break;
      if (terms.some((w) => isReserved(t, w))) break;
      let node = this.parseAndOr();
      const sep = this.peek();
      if (sep.t === "op" && sep.v === "&") {
        this.p++;
        node = { k: "background", body: node };
      } else if (sep.t === "op" && sep.v === ";") this.p++;
      else if (sep.t === "nl") this.p++;
      else if (sep.t !== "eof" && !(sep.t === "op" && (sep.v === ")" || sep.v === ";;")) && !terms.some((w) => isReserved(sep, w))) this.fail(sep);
      items.push(node);
    }
    return items.length === 1 ? items[0] : { k: "list", items };
  }

  parseAndOr(): Node {
    const first = this.parsePipeline();
    const rest: { op: "&&" | "||"; node: Node }[] = [];
    while (true) {
      const t = this.peek();
      if (t.t === "op" && (t.v === "&&" || t.v === "||")) {
        this.p++;
        this.skipNl();
        rest.push({ op: t.v, node: this.parsePipeline() });
      } else break;
    }
    return rest.length ? { k: "andor", first, rest } : first;
  }

  parsePipeline(): Node {
    let negate = false;
    if (isReserved(this.peek(), "!")) {
      this.p++;
      negate = true;
    }
    const cmds = [this.parseCommand()];
    while (true) {
      const t = this.peek();
      if (t.t === "op" && t.v === "|") {
        this.p++;
        this.skipNl();
        cmds.push(this.parseCommand());
      } else break;
    }
    return cmds.length === 1 && !negate ? cmds[0] : { k: "pipeline", cmds, negate };
  }

  parseRedirs(): Redirect[] {
    const out: Redirect[] = [];
    while (this.peek().t === "redir") out.push((this.next() as { r: Redirect }).r);
    return out;
  }

  parseCommand(): Node {
    const t = this.peek();
    if (t.t === "arith") {
      this.p++;
      return { k: "arith", src: t.src, redirs: this.parseRedirs() };
    }
    if (t.t === "op" && t.v === "(") {
      this.p++;
      const body = this.parseList([]);
      const c = this.next();
      if (!(c.t === "op" && c.v === ")")) this.fail(c);
      return { k: "subshell", body, redirs: this.parseRedirs() };
    }
    if (t.t === "word" && isReserved(t)) {
      switch (t.w.raw) {
        case "if": return this.parseIf();
        case "for": return this.parseFor();
        case "while": case "until": return this.parseWhile();
        case "case": return this.parseCase();
        case "{": {
          this.p++;
          const body = this.parseList(["}"]);
          this.expectWord("}");
          return { k: "group", body, redirs: this.parseRedirs() };
        }
        case "function": {
          this.p++;
          const nt = this.next();
          if (nt.t !== "word") this.fail(nt);
          const name = nt.w.raw.replace(/\(\)$/, "");
          if (this.peek().t === "op" && (this.peek() as { v: string }).v === "(") {
            this.p++;
            const c = this.next();
            if (!(c.t === "op" && c.v === ")")) this.fail(c);
          }
          this.skipNl();
          return { k: "func", name, body: this.parseCommand() };
        }
        default:
          this.fail(t);
      }
    }
    // function definition: name ( )
    if (t.t === "word" && this.peek(1).t === "op" && (this.peek(1) as { v: string }).v === "(" && this.peek(2).t === "op" && (this.peek(2) as { v: string }).v === ")") {
      this.p += 3;
      this.skipNl();
      return { k: "func", name: t.w.raw, body: this.parseCommand() };
    }
    return this.parseSimple();
  }

  parseSimple(): Node {
    const assigns: { name: string; value: Word; append: boolean }[] = [];
    const words: Word[] = [];
    const redirs: Redirect[] = [];
    const line = this.peek().line;
    // [[ ... ]]
    const first = this.peek();
    if (first.t === "word" && first.w.raw === "[[") {
      this.p++;
      const ws: Word[] = [];
      while (true) {
        const t = this.next();
        if (t.t === "eof" || t.t === "nl") this.fail(t);
        if (t.t === "word" && t.w.raw === "]]") break;
        if (t.t === "word") ws.push(t.w);
        else if (t.t === "op") ws.push({ parts: [{ t: "lit", v: t.v, q: false }], raw: t.v });
        else if (t.t === "redir" && (t.r.op === "<" || t.r.op === ">") && t.r.target) {
          ws.push({ parts: [{ t: "lit", v: t.r.op, q: false }], raw: t.r.op });
          ws.push(t.r.target);
        } else this.fail(t);
      }
      return { k: "dbracket", words: ws, redirs: this.parseRedirs() };
    }
    while (true) {
      const t = this.peek();
      if (t.t === "redir") {
        redirs.push(t.r);
        this.p++;
        continue;
      }
      if (t.t !== "word") break;
      if (words.length === 0) {
        const p0 = t.w.parts[0];
        if (p0 && p0.t === "lit" && !p0.q) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/.exec(p0.v);
          if (m) {
            const restParts: WordPart[] = [];
            const restLit = p0.v.slice(m[0].length);
            if (restLit) restParts.push({ t: "lit", v: restLit, q: false });
            restParts.push(...t.w.parts.slice(1));
            assigns.push({ name: m[1], append: m[2] === "+", value: { parts: restParts, raw: t.w.raw.slice(m[0].length) } });
            this.p++;
            continue;
          }
        }
        if (isReserved(t) && t.w.raw !== "{" && t.w.raw !== "}" && t.w.raw !== "!" && assigns.length === 0 && redirs.length === 0) this.fail(t);
      }
      words.push(t.w);
      this.p++;
    }
    if (!words.length && !assigns.length && !redirs.length) this.fail(this.peek());
    return { k: "simple", assigns, words, redirs, line };
  }

  parseIf(): Node {
    this.p++; // if
    const clauses: { cond: Node; body: Node }[] = [];
    const cond = this.parseList(["then"]);
    this.expectWord("then");
    const body = this.parseList(["elif", "else", "fi"]);
    clauses.push({ cond, body });
    let els: Node | null = null;
    while (true) {
      this.skipNl();
      const t = this.next();
      if (isReserved(t, "elif")) {
        const c = this.parseList(["then"]);
        this.expectWord("then");
        clauses.push({ cond: c, body: this.parseList(["elif", "else", "fi"]) });
      } else if (isReserved(t, "else")) {
        els = this.parseList(["fi"]);
        this.expectWord("fi");
        break;
      } else if (isReserved(t, "fi")) break;
      else this.fail(t);
    }
    return { k: "if", clauses, else: els, redirs: this.parseRedirs() };
  }

  parseFor(): Node {
    this.p++;
    const nt = this.next();
    if (nt.t !== "word") this.fail(nt);
    let items: Word[] | null = null;
    while (this.peek().t === "nl") this.p++;
    if (isReserved(this.peek(), "in")) {
      this.p++;
      items = [];
      while (this.peek().t === "word" && !isReserved(this.peek(), "do")) items.push((this.next() as { w: Word }).w);
    }
    const sep = this.peek();
    if ((sep.t === "op" && sep.v === ";") || sep.t === "nl") this.p++;
    this.expectWord("do");
    const body = this.parseList(["done"]);
    this.expectWord("done");
    return { k: "for", var: nt.w.raw, items, body, redirs: this.parseRedirs() };
  }

  parseWhile(): Node {
    const until = (this.next() as { w: Word }).w.raw === "until";
    const cond = this.parseList(["do"]);
    this.expectWord("do");
    const body = this.parseList(["done"]);
    this.expectWord("done");
    return { k: "while", until, cond, body, redirs: this.parseRedirs() };
  }

  parseCase(): Node {
    this.p++;
    const wt = this.next();
    if (wt.t !== "word") this.fail(wt);
    this.skipNl();
    this.expectWord("in");
    const items: { patterns: Word[]; body: Node | null }[] = [];
    while (true) {
      this.skipNl();
      if (isReserved(this.peek(), "esac")) {
        this.p++;
        break;
      }
      if (this.peek().t === "op" && (this.peek() as { v: string }).v === "(") this.p++;
      const patterns: Word[] = [];
      while (true) {
        const t = this.next();
        if (t.t !== "word") this.fail(t);
        patterns.push(t.w);
        const s = this.next();
        if (s.t === "op" && s.v === "|") continue;
        if (s.t === "op" && s.v === ")") break;
        this.fail(s);
      }
      this.skipNl();
      let body: Node | null = null;
      const pk = this.peek();
      if (!(pk.t === "op" && pk.v === ";;") && !isReserved(pk, "esac")) body = this.parseList(["esac"]);
      const e = this.peek();
      if (e.t === "op" && e.v === ";;") this.p++;
      items.push({ patterns, body });
    }
    return { k: "case", word: wt.w, items, redirs: this.parseRedirs() };
  }
}

export function parse(src: string): Node {
  const toks = new Lexer(src).run();
  return new Parser(toks).parseProgram();
}
