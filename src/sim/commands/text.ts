/** Text commands: echo, printf, grep, wc, sort, uniq, cut, tr, sed, rev, tac, seq, nl, xargs, expr. */
import { hasPerm, R, X } from "../fs";
import { InStream } from "../types";
import { escapeRegex, joinPath, posixToJs, safeRegex, splitLines } from "../util";
import { opts } from "./files";
import { awk } from "./awk";
import type { CmdCtx, CommandFn } from "./types";

// ------------------------------------------------------------------ echo / printf

export function processEscapes(s: string): { text: string; stop: boolean } {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\" || i + 1 >= s.length) {
      out += c;
      continue;
    }
    const n = s[++i];
    switch (n) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "a": out += "\x07"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "v": out += "\v"; break;
      case "e": case "E": out += "\x1b"; break;
      case "\\": out += "\\"; break;
      case "c": return { text: out, stop: true };
      case "0": {
        let j = i + 1;
        let oct = "";
        while (j < s.length && oct.length < 3 && /[0-7]/.test(s[j])) oct += s[j++];
        out += String.fromCharCode(parseInt(oct || "0", 8));
        i = j - 1;
        break;
      }
      case "x": {
        const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 1));
        if (m) {
          out += String.fromCharCode(parseInt(m[0], 16));
          i += m[0].length;
        } else out += "\\x";
        break;
      }
      default:
        out += "\\" + n;
    }
  }
  return { text: out, stop: false };
}

const echo: CommandFn = (ctx) => {
  let i = 0;
  let nl = true;
  let esc = false;
  while (i < ctx.args.length && /^-[neE]+$/.test(ctx.args[i])) {
    for (const c of ctx.args[i].slice(1)) {
      if (c === "n") nl = false;
      if (c === "e") esc = true;
      if (c === "E") esc = false;
    }
    i++;
  }
  let s = ctx.args.slice(i).join(" ");
  if (esc) {
    const r = processEscapes(s);
    s = r.text;
    if (r.stop) {
      ctx.out(s);
      return 0;
    }
  }
  ctx.out(s + (nl ? "\n" : ""));
  return 0;
};

export function formatPrintf(fmt: string, args: string[], err: (s: string) => void): { out: string; code: number } {
  let out = "";
  let ai = 0;
  let code = 0;
  const num = (s: string | undefined, float = false): number => {
    if (s === undefined || s === "") return 0;
    if (/^'./.test(s) || /^"./.test(s)) return s.charCodeAt(1);
    const v = float ? parseFloat(s) : /^-?0x[0-9a-f]+$/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
    if (!Number.isFinite(v) || (!float && !/^\s*[-+]?(0x)?[0-9a-fA-F]+\s*$/.test(s))) {
      err(`printf: ${s}: invalid number\n`);
      code = 1;
      return Number.isFinite(v) ? v : 0;
    }
    return v;
  };
  const once = (): boolean => {
    let consumed = false;
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c === "\\") {
        const r = processEscapes(fmt.slice(i, i + 2 + (fmt[i + 1] === "0" ? 3 : fmt[i + 1] === "x" ? 2 : 0)));
        const m = /^\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|.)/.exec(fmt.slice(i));
        const seq = m ? m[0] : "\\";
        out += processEscapes(seq).text;
        void r;
        i += seq.length - 1;
        continue;
      }
      if (c !== "%") {
        out += c;
        continue;
      }
      const m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([sdiufFeEgGxXocb%q])/.exec(fmt.slice(i));
      if (!m) {
        out += c;
        continue;
      }
      i += m[0].length - 1;
      const [, flags, widthS, precS, conv] = m;
      if (conv === "%") {
        out += "%";
        continue;
      }
      let width = widthS === "*" ? num(args[ai++]) : widthS ? parseInt(widthS, 10) : 0;
      const prec = precS === "*" ? num(args[ai++]) : precS !== undefined ? parseInt(precS, 10) : undefined;
      const arg = args[ai++];
      if (arg !== undefined) consumed = true;
      let s: string;
      switch (conv) {
        case "s": s = arg ?? ""; if (prec !== undefined) s = s.slice(0, prec); break;
        case "q": s = /^[A-Za-z0-9_./-]*$/.test(arg ?? "") ? (arg ?? "''") : `'${(arg ?? "").replace(/'/g, "'\\''")}'`; break;
        case "b": s = processEscapes(arg ?? "").text; break;
        case "c": s = (arg ?? "").slice(0, 1); break;
        case "d": case "i": case "u": {
          const v = Math.trunc(num(arg));
          s = String(Math.abs(v));
          if (prec !== undefined) s = s.padStart(prec, "0");
          s = (v < 0 ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s;
          break;
        }
        case "x": case "X": case "o": {
          const v = Math.trunc(num(arg));
          s = (v >>> 0).toString(conv === "o" ? 8 : 16);
          if (conv === "X") s = s.toUpperCase();
          if (flags.includes("#") && v !== 0) s = (conv === "o" ? "0" : conv === "x" ? "0x" : "0X") + s;
          break;
        }
        case "e": case "E": {
          s = num(arg, true).toExponential(prec ?? 6).replace(/e([+-])(\d)$/, "e$10$2");
          if (conv === "E") s = s.toUpperCase();
          break;
        }
        case "g": case "G": s = String(Number(num(arg, true).toPrecision(prec || 6))); break;
        default: {
          const v = num(arg, true);
          s = v.toFixed(prec ?? 6);
          if (v >= 0 && flags.includes("+")) s = "+" + s;
        }
      }
      if (width < 0) {
        width = -width;
        s = s.padEnd(width);
      } else if (flags.includes("-")) s = s.padEnd(width);
      else if (flags.includes("0") && /[diufFeExXo]/.test(conv)) {
        const neg = s.startsWith("-") || s.startsWith("+");
        s = neg ? s[0] + s.slice(1).padStart(width - 1, "0") : s.padStart(width, "0");
      } else s = s.padStart(width);
      out += s;
    }
    return consumed;
  };
  do {
    const consumed = once();
    if (!consumed) break;
  } while (ai < args.length);
  return { out, code };
}

const printf: CommandFn = (ctx) => {
  let args = ctx.args;
  if (args[0] === "-v") return ctx.unsupported("printf: -v is not supported in this simulation (use var=$(printf ...))");
  if (args[0] === "--") args = args.slice(1);
  if (!args.length) {
    ctx.err("printf: usage: printf format [arguments]\n");
    return 2;
  }
  const r = formatPrintf(args[0], args.slice(1), ctx.err);
  ctx.out(r.out);
  return r.code;
};

// ------------------------------------------------------------------ grep

const grep: CommandFn = (ctx) => {
  const o = opts(ctx, {
    flags: "ivncrREoFlLwxhHqsP",
    withArg: "eABCm",
    long: { "ignore-case": "i", "invert-match": "v", "line-number": "n", count: "c", recursive: "r", "extended-regexp": "E", "only-matching": "o", "fixed-strings": "F", "files-with-matches": "l", "word-regexp": "w", "line-regexp": "x", quiet: "q", silent: "q", "no-filename": "h", "with-filename": "H", "regexp=": "e", "color=": "Z", colour: "Z", "color": "Z", "include=": "I", "max-count=": "m" },
  });
  if (!o) return 2;
  if (o.opts.A || o.opts.B || o.opts.C) return ctx.unsupported("grep: context options (-A/-B/-C) are not supported in this simulation");
  if (o.opts.P) return ctx.unsupported("grep: -P (Perl regex) is not supported in this simulation (try -E)");
  const extended = !!o.opts.E || ctx.name === "egrep";
  const fixed = !!o.opts.F || ctx.name === "fgrep";
  const operands = [...o.operands];
  const patterns = o.multi.e ? [...o.multi.e] : operands.length ? [operands.shift()!] : null;
  if (!patterns) {
    ctx.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n");
    return 2;
  }
  const srcs = patterns.flatMap((p) => p.split("\n")).map((p) => {
    let s = fixed ? escapeRegex(p) : posixToJs(p, extended);
    if (o.opts.w) s = `(?<![A-Za-z0-9_])(?:${s})(?![A-Za-z0-9_])`;
    if (o.opts.x) s = `^(?:${s})$`;
    return s;
  });
  const re = safeRegex(srcs.map((s) => `(?:${s})`).join("|"), o.opts.i ? "i" : "");
  const reG = safeRegex(srcs.map((s) => `(?:${s})`).join("|"), o.opts.i ? "gi" : "g");
  if (!re || !reG) {
    ctx.err("grep: Invalid regular expression\n");
    return 2;
  }
  const maxCount = o.opts.m !== undefined ? parseInt(o.opts.m as string, 10) : Infinity;
  const include = o.multi.I;
  const recursive = !!(o.opts.r || o.opts.R);
  let files: string[] = operands;
  if (!files.length) files = recursive ? ["."] : ["-"];
  const targets: { disp: string; content: string | null }[] = [];
  let code = 1;
  let hadError = false;
  for (const f of files) {
    if (f === "-") {
      targets.push({ disp: "(standard input)", content: ctx.io.stdin.readAll() });
      continue;
    }
    const r = ctx.fs.tryResolve(ctx.abs(f), ctx.cred, true);
    if (r && r.node.type === "dir") {
      if (!recursive) {
        ctx.err(`grep: ${f}: Is a directory\n`);
        hadError = true;
        continue;
      }
      const walk = (real: string, disp: string) => {
        const n = ctx.fs.nodes[real];
        if (n.type === "dir") {
          if (!hasPerm(n, ctx.cred, R) || !hasPerm(n, ctx.cred, X)) {
            if (!o.opts.s) ctx.err(`grep: ${disp}: Permission denied\n`);
            hadError = true;
            return;
          }
          for (const c of ctx.fs.children(real)) walk(joinPath(real, c), disp.replace(/\/$/, "") + "/" + c);
          return;
        }
        if (n.type !== "file") return;
        if (include && !include.some((g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$").test(disp.split("/").pop()!))) return;
        if (!hasPerm(n, ctx.cred, R)) {
          if (!o.opts.s) ctx.err(`grep: ${disp}: Permission denied\n`);
          hadError = true;
          return;
        }
        targets.push({ disp, content: n.content });
      };
      walk(r.path, f);
      continue;
    }
    try {
      targets.push({ disp: f, content: ctx.fs.readFile(ctx.abs(f), ctx.cred) });
    } catch (e) {
      if (!o.opts.s) ctx.fsErr(e, f, "grep");
      hadError = true;
    }
  }
  const showName = o.opts.H || (!o.opts.h && (targets.length > 1 || recursive || files.length > 1));
  for (const t of targets) {
    if (t.content === null) continue;
    const lines = splitLines(t.content);
    let count = 0;
    const prefix = showName ? `${t.disp}:` : "";
    for (let i = 0; i < lines.length && count < maxCount; i++) {
      const line = lines[i];
      const m = re.test(line);
      if (m === !o.opts.v) {
        count++;
        if (o.opts.q || o.opts.l || o.opts.L || o.opts.c) continue;
        const ln = o.opts.n ? `${i + 1}:` : "";
        if (o.opts.o && !o.opts.v) {
          reG.lastIndex = 0;
          for (const mm of line.matchAll(reG)) if (mm[0] !== "") ctx.out(`${prefix}${ln}${mm[0]}\n`);
        } else ctx.out(`${prefix}${ln}${line}\n`);
      }
    }
    if (count > 0) code = 0;
    if (o.opts.q) continue;
    if (o.opts.c) ctx.out(`${prefix}${count}\n`);
    if (o.opts.l && count > 0) ctx.out(`${t.disp}\n`);
    if (o.opts.L && count === 0) ctx.out(`${t.disp}\n`);
  }
  if (o.opts.q && code === 0) return 0;
  return hadError && code !== 0 ? 2 : hadError && !o.opts.q ? 2 : code;
};

// ------------------------------------------------------------------ wc / sort / uniq / cut / tr

const wc: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "lwcmL", long: { lines: "l", words: "w", bytes: "c", chars: "m" } });
  if (!o) return 2;
  let sel = (["l", "w", "c", "m", "L"] as const).filter((k) => o.opts[k]);
  if (!sel.length) sel = ["l", "w", "c"];
  const rows: { vals: number[]; name: string | null }[] = [];
  const count = (c: string): Record<string, number> => ({
    l: (c.match(/\n/g) ?? []).length,
    w: c.split(/\s+/).filter(Boolean).length,
    c: new TextEncoder().encode(c).length,
    m: c.length,
    L: Math.max(0, ...c.split("\n").map((x) => x.length)),
  });
  const code = readAll(ctx, o.operands, (name, c) => {
    const k = count(c);
    rows.push({ vals: sel.map((s) => k[s]), name: name === "-" ? null : name });
  });
  if (rows.length > 1) rows.push({ vals: sel.map((_s, i) => rows.reduce((a, r) => a + r.vals[i], 0)), name: "total" });
  const stdinOnly = rows.length === 1 && rows[0].name === null;
  const width = stdinOnly ? (sel.length === 1 ? 0 : 7) : Math.max(1, ...rows.flatMap((r) => r.vals.map((v) => String(v).length)));
  for (const r of rows) ctx.out(r.vals.map((v) => String(v).padStart(width)).join(" ") + (r.name !== null ? ` ${r.name}` : "") + "\n");
  return code;
};

function readAll(ctx: CmdCtx, files: string[], each: (name: string, content: string) => void): number {
  let code = 0;
  if (!files.length) files = ["-"];
  for (const f of files) {
    if (f === "-") each("-", ctx.io.stdin.readAll());
    else {
      try {
        each(f, ctx.fs.readFile(ctx.abs(f), ctx.cred));
      } catch (e) {
        code = ctx.fsErr(e, f);
      }
    }
  }
  return code;
}

function collectLines(ctx: CmdCtx, files: string[]): { lines: string[]; code: number } {
  const lines: string[] = [];
  const code = readAll(ctx, files, (_n, c) => lines.push(...splitLines(c)));
  return { lines, code };
}

const sort: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "nrufbhVMsc", withArg: "kto", long: { "numeric-sort": "n", reverse: "r", unique: "u", "ignore-case": "f", "field-separator=": "t", "key=": "k", "human-numeric-sort": "h" } });
  if (!o) return 2;
  if (o.opts.M || o.opts.V || o.opts.c) return ctx.unsupported(`sort: option '-${o.opts.M ? "M" : o.opts.V ? "V" : "c"}' is not supported in this simulation`);
  const { lines, code } = collectLines(ctx, o.operands);
  const sep = o.opts.t as string | undefined;
  const keys = (o.multi.k ?? []).map((k) => {
    const m = /^(\d+)(?:\.\d+)?([a-z]*)(?:,(\d+)(?:\.\d+)?([a-z]*))?$/.exec(k);
    if (!m) return null;
    return { start: parseInt(m[1], 10), end: m[3] ? parseInt(m[3], 10) : undefined, n: (m[2] + (m[4] ?? "")).includes("n"), r: (m[2] + (m[4] ?? "")).includes("r"), h: (m[2] + (m[4] ?? "")).includes("h") };
  });
  if (keys.some((k) => k === null)) {
    ctx.err(`sort: invalid key specification\n`);
    return 2;
  }
  const fieldsOf = (l: string): string[] => (sep !== undefined ? l.split(sep) : l.trim().split(/\s+/));
  const keyOf = (l: string, k: { start: number; end?: number }): string => {
    const f = fieldsOf(l);
    const end = k.end ?? f.length;
    return f.slice(k.start - 1, end).join(sep ?? " ");
  };
  const human = (s: string): number => {
    const m = /^\s*(-?[\d.]+)\s*([KMGTP]?)/i.exec(s);
    if (!m) return 0;
    return parseFloat(m[1]) * Math.pow(1024, "KMGTP".indexOf(m[2].toUpperCase()) + 1 || 0 + (m[2] ? 0 : 0));
  };
  const numVal = (s: string): number => {
    const m = /^\s*(-?\d+(\.\d+)?)/.exec(s);
    return m ? parseFloat(m[1]) : 0;
  };
  const cmpStr = (a: string, b: string) => {
    if (o.opts.f) {
      a = a.toLowerCase();
      b = b.toLowerCase();
    }
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const cmpBy = (a: string, b: string, n: boolean, h: boolean): number => {
    if (h) return human(a) - human(b) || 0;
    if (n) return numVal(a) - numVal(b);
    return cmpStr(a, b);
  };
  const cmp = (a: string, b: string): number => {
    if (keys.length) {
      for (const k of keys) {
        const c = cmpBy(keyOf(a, k!), keyOf(b, k!), k!.n || !!o.opts.n, k!.h || !!o.opts.h);
        if (c !== 0) return k!.r ? -c : c;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const c = cmpBy(a, b, !!o.opts.n, !!o.opts.h);
    if (c !== 0) return c;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  let out = lines.map((l, i) => ({ l, i })).sort((x, y) => cmp(x.l, y.l) || x.i - y.i).map((x) => x.l);
  if (o.opts.r) out.reverse();
  if (o.opts.u) {
    const res: string[] = [];
    for (const l of out) {
      const prev = res[res.length - 1];
      if (prev === undefined || (keys.length || o.opts.n ? cmp(prev, l) !== 0 : o.opts.f ? prev.toLowerCase() !== l.toLowerCase() : prev !== l)) res.push(l);
    }
    out = res;
  }
  const text = out.map((l) => l + "\n").join("");
  if (o.opts.o) {
    try {
      ctx.fs.writeFile(ctx.abs(o.opts.o as string), text, ctx.cred, { umask: ctx.umask });
    } catch (e) {
      return ctx.fsErr(e, o.opts.o as string, "sort: open failed");
    }
  } else ctx.out(text);
  return code;
};

const uniq: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "cdui", withArg: "fs", long: { count: "c", repeated: "d", unique: "u", "ignore-case": "i" } });
  if (!o) return 2;
  if (o.opts.f || o.opts.s) return ctx.unsupported("uniq: -f/-s are not supported in this simulation");
  const { lines, code } = collectLines(ctx, o.operands.slice(0, 1));
  const groups: { l: string; n: number }[] = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && (o.opts.i ? last.l.toLowerCase() === l.toLowerCase() : last.l === l)) last.n++;
    else groups.push({ l, n: 1 });
  }
  let out = "";
  for (const g of groups) {
    if (o.opts.d && g.n < 2) continue;
    if (o.opts.u && g.n > 1) continue;
    out += (o.opts.c ? `${String(g.n).padStart(7)} ` : "") + g.l + "\n";
  }
  if (o.operands[1]) {
    try {
      ctx.fs.writeFile(ctx.abs(o.operands[1]), out, ctx.cred, { umask: ctx.umask });
    } catch (e) {
      return ctx.fsErr(e, o.operands[1]);
    }
  } else ctx.out(out);
  return code;
};

function parseList(spec: string): ((i: number) => boolean) | null {
  const ranges: [number, number][] = [];
  for (const part of spec.split(",")) {
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m || (m[1] === "" && m[3] === "")) return null;
    const a = m[1] ? parseInt(m[1], 10) : 1;
    const b = m[2] ? (m[3] ? parseInt(m[3], 10) : Infinity) : a;
    if (a < 1) return null;
    ranges.push([a, b]);
  }
  return (i) => ranges.some(([a, b]) => i >= a && i <= b);
}

const cut: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "sn", withArg: "dfcb", long: { "delimiter=": "d", "fields=": "f", "characters=": "c", "bytes=": "b", "only-delimited": "s", "output-delimiter=": "O" } });
  if (!o) return 2;
  const delim = (o.opts.d as string) ?? "\t";
  if (o.opts.d !== undefined && delim.length !== 1) {
    ctx.err("cut: the delimiter must be a single character\n");
    return 1;
  }
  const spec = (o.opts.f ?? o.opts.c ?? o.opts.b) as string | undefined;
  if (!spec) {
    ctx.err("cut: you must specify a list of bytes, characters, or fields\n");
    return 1;
  }
  const sel = parseList(spec);
  if (!sel) {
    ctx.err(`cut: invalid field value '${spec}'\n`);
    return 1;
  }
  const outDelim = (o.opts.O as string) ?? delim;
  const { lines, code } = collectLines(ctx, o.operands);
  for (const l of lines) {
    if (o.opts.f) {
      if (!l.includes(delim)) {
        if (!o.opts.s) ctx.out(l + "\n");
        continue;
      }
      ctx.out(l.split(delim).filter((_f, i) => sel(i + 1)).join(outDelim) + "\n");
    } else ctx.out([...l].filter((_c, i) => sel(i + 1)).join("") + "\n");
  }
  return code;
};

function expandSet(s: string): string[] {
  const classes: Record<string, string> = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    digit: "0123456789",
    space: " \t\n\r\f\v",
    blank: " \t",
    alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    alnum: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    punct: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  };
  const out: string[] = [];
  const chars = processEscapes(s.replace(/\\\\/g, "\\\\")).text;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "[" && chars[i + 1] === ":") {
      const end = chars.indexOf(":]", i);
      if (end > 0) {
        out.push(...(classes[chars.slice(i + 2, end)] ?? ""));
        i = end + 1;
        continue;
      }
    }
    if (chars[i + 1] === "-" && i + 2 < chars.length) {
      const a = chars.charCodeAt(i);
      const b = chars.charCodeAt(i + 2);
      for (let c = a; c <= b; c++) out.push(String.fromCharCode(c));
      i += 2;
      continue;
    }
    out.push(chars[i]);
  }
  return out;
}

const tr: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "dscC", long: { delete: "d", "squeeze-repeats": "s", complement: "c" } });
  if (!o) return 2;
  if (o.opts.c || o.opts.C) return ctx.unsupported("tr: -c (complement) is not supported in this simulation");
  const [s1, s2] = o.operands;
  if (s1 === undefined || (!o.opts.d && !o.opts.s && s2 === undefined)) {
    ctx.err(s1 === undefined ? "tr: missing operand\n" : `tr: missing operand after '${s1}'\n`);
    return 1;
  }
  const a = expandSet(s1);
  const b = s2 !== undefined ? expandSet(s2) : [];
  const input = ctx.io.stdin.readAll();
  let out = "";
  const setA = new Set(a);
  const squeezeSet = new Set(o.opts.d ? b : b.length ? b : a);
  let prev = "";
  for (const ch of input) {
    let c: string | null = ch;
    if (o.opts.d) {
      if (setA.has(ch)) c = null;
    } else if (b.length) {
      const idx = a.lastIndexOf(ch);
      if (idx >= 0) c = b[Math.min(idx, b.length - 1)];
    }
    if (c === null) continue;
    if (o.opts.s && c === prev && squeezeSet.has(c)) continue;
    out += c;
    prev = c;
  }
  ctx.out(out);
  return 0;
};

// ------------------------------------------------------------------ sed

interface SedAddr {
  t: "line" | "last" | "re";
  n?: number;
  re?: RegExp;
}
interface SedCmd {
  a1?: SedAddr;
  a2?: SedAddr;
  neg: boolean;
  cmd: string;
  re?: RegExp;
  rep?: string;
  global?: boolean;
  print?: boolean;
  nth?: number;
  text?: string;
  inRange?: boolean;
}

function parseSed(script: string, extended: boolean): SedCmd[] | string {
  const cmds: SedCmd[] = [];
  let i = 0;
  const s = script;
  const readDelim = (d: string): string => {
    let out = "";
    while (i < s.length && s[i] !== d) {
      if (s[i] === "\\" && i + 1 < s.length) {
        if (s[i + 1] === d) out += d === "/" ? "\\/" : d;
        else if (s[i + 1] === "n") out += "\n";
        else out += s[i] + s[i + 1];
        i += 2;
        continue;
      }
      out += s[i++];
    }
    if (s[i] !== d) throw new Error(`unterminated \`s' command`);
    i++;
    return out;
  };
  const mkRe = (src: string, flags: string): RegExp => {
    const re = safeRegex(posixToJs(src, extended), flags);
    if (!re) throw new Error("invalid regular expression");
    return re;
  };
  const readAddr = (): SedAddr | undefined => {
    if (/[0-9]/.test(s[i] ?? "")) {
      let j = i;
      while (/[0-9]/.test(s[j] ?? "")) j++;
      const n = parseInt(s.slice(i, j), 10);
      i = j;
      return { t: "line", n };
    }
    if (s[i] === "$") {
      i++;
      return { t: "last" };
    }
    if (s[i] === "/" || s[i] === "\\") {
      const d = s[i] === "\\" ? s[++i] : "/";
      i++;
      const src = readDelim(d);
      let fl = "";
      if (s[i] === "I") {
        fl = "i";
        i++;
      }
      return { t: "re", re: mkRe(src, fl) };
    }
    return undefined;
  };
  try {
    while (i < s.length) {
      while (i < s.length && /[\s;]/.test(s[i])) i++;
      if (i >= s.length) break;
      const c: SedCmd = { neg: false, cmd: "" };
      c.a1 = readAddr();
      if (c.a1 && s[i] === ",") {
        i++;
        c.a2 = readAddr();
        if (!c.a2) return "unexpected `,'";
      }
      while (s[i] === " ") i++;
      if (s[i] === "!") {
        c.neg = true;
        i++;
      }
      const cmd = s[i++];
      c.cmd = cmd;
      if (cmd === "s") {
        const d = s[i++];
        const pat = readDelim(d);
        const rep = readDelim(d);
        let fl = "";
        while (i < s.length && /[gpiI0-9]/.test(s[i])) {
          const f = s[i++];
          if (f === "g") c.global = true;
          else if (f === "p") c.print = true;
          else if (f === "i" || f === "I") fl += "i";
          else c.nth = parseInt(f, 10);
        }
        c.re = mkRe(pat, fl + "g");
        c.rep = rep;
      } else if (cmd === "p" || cmd === "d" || cmd === "q" || cmd === "=") {
        /* no args */
      } else if (cmd === "a" || cmd === "i" || cmd === "c") {
        while (s[i] === " " || s[i] === "\\") i++;
        let j = i;
        while (j < s.length && s[j] !== "\n" && s[j] !== ";") j++;
        c.text = s.slice(i, j);
        i = j;
      } else if (cmd === "y") {
        return "the y command is not supported in this simulation";
      } else if (cmd === "{" || cmd === "}" || cmd === "n" || cmd === "N" || cmd === "h" || cmd === "H" || cmd === "g" || cmd === "G" || cmd === "x" || cmd === "w" || cmd === "r") {
        return `the '${cmd}' command is not supported in this simulation`;
      } else return `unknown command: \`${cmd ?? ""}'`;
      cmds.push(c);
    }
  } catch (e) {
    return (e as Error).message;
  }
  return cmds;
}

function sedReplace(line: string, c: SedCmd): { out: string; did: boolean } {
  let count = 0;
  let did = false;
  const re = c.re!;
  re.lastIndex = 0;
  const out = line.replace(re, (...m: unknown[]) => {
    count++;
    const groups = m.slice(0, -2).filter((x) => typeof x === "string" || x === undefined) as (string | undefined)[];
    const take = c.nth ? count === c.nth || (c.global && count >= c.nth) : c.global || count === 1;
    if (!take) return groups[0] ?? "";
    did = true;
    let r = "";
    const rep = c.rep!;
    for (let i = 0; i < rep.length; i++) {
      const ch = rep[i];
      if (ch === "\\" && i + 1 < rep.length) {
        const n = rep[++i];
        if (/[0-9]/.test(n)) r += groups[parseInt(n, 10)] ?? "";
        else if (n === "n") r += "\n";
        else if (n === "t") r += "\t";
        else r += n;
      } else if (ch === "&") r += groups[0] ?? "";
      else r += ch;
    }
    return r;
  });
  return { out, did };
}

const sed: CommandFn = (ctx) => {
  const args = ctx.args.map((a) => (/^-i.+/.test(a) && !a.startsWith("-in") ? "-i" : a));
  const o = opts(ctx, { flags: "nEris", withArg: "ef", long: { quiet: "n", silent: "n", "in-place": "i", "regexp-extended": "E", "expression=": "e" } }, args);
  if (!o) return 2;
  if (o.opts.f) return ctx.unsupported("sed: -f scriptfile is not supported in this simulation");
  const operands = [...o.operands];
  const scripts = o.multi.e ?? (operands.length ? [operands.shift()!] : []);
  if (!scripts.length) {
    ctx.err("Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n");
    return 1;
  }
  const parsed = parseSed(scripts.join("\n"), !!(o.opts.E || o.opts.r));
  if (typeof parsed === "string") {
    if (parsed.includes("not supported")) return ctx.unsupported(`sed: ${parsed}`, 1);
    ctx.err(`sed: -e expression #1, char 0: ${parsed}\n`);
    return 1;
  }
  const run = (text: string): string => {
    const lines = splitLines(text);
    const out: string[] = [];
    for (const c of parsed) c.inRange = false;
    const matches = (a: SedAddr, ln: number, line: string, last: boolean) =>
      a.t === "line" ? ln === a.n : a.t === "last" ? last : a.re!.test(line);
    for (let idx = 0; idx < lines.length; idx++) {
      let line = lines[idx];
      const ln = idx + 1;
      const last = idx === lines.length - 1;
      let deleted = false;
      let quit = false;
      const extraAfter: string[] = [];
      for (const c of parsed) {
        let sel = true;
        if (c.a1) {
          if (c.a2) {
            if (c.inRange) {
              sel = true;
              if (c.a2.t === "line" ? ln >= c.a2.n! : matches(c.a2, ln, line, last)) c.inRange = false;
            } else if (matches(c.a1, ln, line, last)) {
              sel = true;
              c.inRange = !(c.a2.t === "line" && c.a2.n! <= ln);
            } else sel = false;
          } else sel = matches(c.a1, ln, line, last);
        }
        if (c.neg) sel = !sel;
        if (!sel) continue;
        if (c.re) c.re.lastIndex = 0;
        switch (c.cmd) {
          case "s": {
            const r = sedReplace(line, c);
            line = r.out;
            if (r.did && c.print) out.push(line);
            break;
          }
          case "p": out.push(line); break;
          case "d": deleted = true; break;
          case "q": quit = true; break;
          case "=": out.push(String(ln)); break;
          case "a": extraAfter.push(c.text ?? ""); break;
          case "i": out.push(c.text ?? ""); break;
          case "c": out.push(c.text ?? ""); deleted = true; break;
        }
        if (deleted || quit) break;
      }
      if (!deleted && !o.opts.n) out.push(line);
      out.push(...extraAfter);
      if (quit) break;
    }
    return out.map((l) => l + "\n").join("");
  };
  if (o.opts.i) {
    if (!operands.length) {
      ctx.err("sed: no input files\n");
      return 1;
    }
    let code = 0;
    for (const f of operands) {
      try {
        const p = ctx.abs(f);
        const content = ctx.fs.readFile(p, ctx.cred);
        // sed -i writes a temp file in the same directory and renames it: needs w on the directory
        const dir = p.replace(/\/[^/]*$/, "") || "/";
        const dn = ctx.fs.resolve(dir, ctx.cred, true);
        if (!hasPerm(dn.node, ctx.cred, 2)) {
          ctx.err(`sed: couldn't open temporary file ${dir}/sedXXXXXX: Permission denied\n`);
          code = 4;
          continue;
        }
        const r = ctx.fs.resolve(p, null, true);
        r.node.content = run(content);
        r.node.mtime = ctx.core.now();
      } catch (e) {
        ctx.fsErr(e, f, "sed: can't read");
        code = 2;
      }
    }
    return code;
  }
  let code = 0;
  let input = "";
  if (!operands.length) input = ctx.io.stdin.readAll();
  for (const f of operands) {
    if (f === "-") {
      input += ctx.io.stdin.readAll();
      continue;
    }
    try {
      input += ctx.fs.readFile(ctx.abs(f), ctx.cred);
    } catch (e) {
      ctx.fsErr(e, f, "sed: can't read");
      code = 2;
    }
  }
  ctx.out(run(input));
  return code;
};

// ------------------------------------------------------------------ small utilities

const rev: CommandFn = (ctx) => {
  const { lines, code } = collectLines(ctx, ctx.args);
  for (const l of lines) ctx.out([...l].reverse().join("") + "\n");
  return code;
};

const tac: CommandFn = (ctx) => {
  const { lines, code } = collectLines(ctx, ctx.args);
  for (const l of lines.reverse()) ctx.out(l + "\n");
  return code;
};

const nl: CommandFn = (ctx) => {
  const o = opts(ctx, { withArg: "bws" });
  if (!o) return 2;
  const all = o.opts.b === "a";
  const { lines, code } = collectLines(ctx, o.operands);
  let n = 0;
  for (const l of lines) ctx.out(l === "" && !all ? "\n" : `${String(++n).padStart(6)}\t${l}\n`);
  return code;
};

const seq: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "w", withArg: "sf" });
  if (!o) return 2;
  const nums = o.operands.map(Number);
  if (!nums.length || nums.some((x) => !Number.isFinite(x))) {
    ctx.err(nums.length ? `seq: invalid floating point argument: '${o.operands.find((x) => !Number.isFinite(Number(x)))}'\n` : "seq: missing operand\n");
    return 1;
  }
  const [first, inc, last] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums;
  if (inc === 0) {
    ctx.err("seq: invalid Zero increment value: '0'\n");
    return 1;
  }
  const sep = (o.opts.s as string) ?? "\n";
  const out: string[] = [];
  const width = o.opts.w ? String(Math.max(Math.abs(first), Math.abs(last))).length : 0;
  for (let v = first; inc > 0 ? v <= last : v >= last; v += inc) {
    if (out.length > 100000) break;
    out.push(width ? String(v).padStart(width, "0") : String(Math.round(v * 1e9) / 1e9));
  }
  ctx.out(out.length ? out.join(sep) + "\n" : "");
  return 0;
};

const xargs: CommandFn = (ctx) => {
  const o = opts(ctx, { flags: "rt0", withArg: "nIL", stopAtOperand: true });
  if (!o) return 2;
  const input = ctx.io.stdin.readAll();
  const items = o.opts["0"] ? input.split("\0").filter(Boolean) : o.opts.I || o.opts.L ? splitLines(input).filter((l) => l.trim() !== "") : input.split(/\s+/).filter(Boolean);
  const cmd = o.operands.length ? o.operands : ["echo"];
  if (!items.length && o.opts.r) return 0;
  let code = 0;
  const runOne = (argv: string[]) => {
    if (o.opts.t) ctx.err(argv.join(" ") + "\n");
    const c = ctx.shell.runArgv(argv, { ...ctx.io, stdin: InStream.empty() }, ctx.cred);
    if (c !== 0) code = c === 127 ? 127 : 123;
  };
  if (o.opts.I) {
    const rep = o.opts.I as string;
    for (const it of items) runOne(cmd.map((a) => a.split(rep).join(it)));
  } else {
    const n = o.opts.n ? parseInt(o.opts.n as string, 10) : o.opts.L ? parseInt(o.opts.L as string, 10) : items.length || 1;
    if (!items.length) runOne(cmd);
    for (let i = 0; i < items.length; i += n) runOne([...cmd, ...items.slice(i, i + n)]);
  }
  return code;
};

const expr: CommandFn = (ctx) => {
  const a = ctx.args;
  const isInt = (s: string) => /^-?\d+$/.test(s);
  const emit = (v: string | number) => {
    ctx.out(v + "\n");
    return v === 0 || v === "0" || v === "" ? 1 : 0;
  };
  if (a.length === 1) return emit(a[0]);
  if (a[0] === "length" && a.length === 2) return emit(a[1].length);
  if (a.length === 3) {
    const [l, op, r] = a;
    if (["+", "-", "*", "/", "%"].includes(op)) {
      if (!isInt(l) || !isInt(r)) {
        ctx.err("expr: non-integer argument\n");
        return 2;
      }
      const x = parseInt(l, 10);
      const y = parseInt(r, 10);
      if ((op === "/" || op === "%") && y === 0) {
        ctx.err("expr: division by zero\n");
        return 2;
      }
      return emit(op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : op === "/" ? Math.trunc(x / y) : x % y);
    }
    if (["=", "!=", "<", ">", "<=", ">="].includes(op)) {
      const both = isInt(l) && isInt(r);
      const x: string | number = both ? parseInt(l, 10) : l;
      const y: string | number = both ? parseInt(r, 10) : r;
      const res = op === "=" ? x === y : op === "!=" ? x !== y : op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
      return emit(res ? 1 : 0);
    }
    if (op === ":") {
      const re = safeRegex("^" + posixToJs(r, false));
      const m = re?.exec(l);
      return emit(m ? (m[1] ?? String(m[0].length)) : 0);
    }
  }
  return ctx.unsupported("expr: this expression form is not supported in this simulation (try $(( ... )))", 2);
};

export const TEXT_COMMANDS: Record<string, CommandFn> = {
  echo,
  printf,
  grep,
  egrep: grep,
  fgrep: grep,
  wc,
  sort,
  uniq,
  cut,
  tr,
  sed,
  awk,
  rev,
  tac,
  nl,
  seq,
  xargs,
  expr,
};
