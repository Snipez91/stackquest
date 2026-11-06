/**
 * A small but correct awk subset: patterns (regex, expressions, BEGIN/END),
 * print/printf, fields, NR/NF/FS/OFS, variables, associative arrays, if/for/while,
 * common built-in functions.
 */
import { posixToJs, safeRegex, splitLines } from "../util";
import { formatPrintf } from "./text";
import type { CommandFn } from "./types";

type Val = string | number;

type Ex =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "re"; re: RegExp }
  | { k: "var"; name: string }
  | { k: "field"; e: Ex }
  | { k: "idx"; name: string; e: Ex[] }
  | { k: "in"; key: Ex[]; arr: string }
  | { k: "bin"; op: string; a: Ex; b: Ex }
  | { k: "un"; op: string; a: Ex }
  | { k: "assign"; op: string; lv: Ex; e: Ex }
  | { k: "incdec"; op: string; pre: boolean; lv: Ex }
  | { k: "match"; neg: boolean; a: Ex; re: Ex }
  | { k: "cond"; c: Ex; a: Ex; b: Ex }
  | { k: "call"; name: string; args: Ex[]; arr?: string }
  | { k: "group"; e: Ex };

type St =
  | { k: "print"; args: Ex[] }
  | { k: "printf"; args: Ex[] }
  | { k: "expr"; e: Ex }
  | { k: "if"; c: Ex; a: St; b?: St }
  | { k: "while"; c: Ex; body: St }
  | { k: "for"; init?: St; c?: Ex; step?: St; body: St }
  | { k: "forin"; v: string; arr: string; body: St }
  | { k: "block"; body: St[] }
  | { k: "next" }
  | { k: "exit"; e?: Ex }
  | { k: "delete"; arr: string; e?: Ex[] }
  | { k: "break" }
  | { k: "continue" };

interface Rule {
  kind: "begin" | "end" | "main";
  pat?: Ex;
  pat2?: Ex;
  body?: St[];
  inRange?: boolean;
}

class AwkError extends Error {}
class NextSig {}
class ExitSig {
  constructor(public code: number) {}
}
class BrkSig {}
class ContSig {}

type Tok = { t: "num"; v: number } | { t: "str"; v: string } | { t: "re"; v: string } | { t: "name"; v: string } | { t: "op"; v: string } | { t: "nl" } | { t: "eof" };

const FUNCS = new Set(["length", "substr", "index", "split", "sub", "gsub", "toupper", "tolower", "int", "sprintf", "match", "sqrt", "log", "exp", "sin", "cos", "rand", "srand", "system", "getline", "close"]);
const KEYWORDS = new Set(["BEGIN", "END", "print", "printf", "if", "else", "while", "for", "in", "next", "exit", "delete", "break", "continue", "do", "function", "return", "getline"]);

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const regexAllowed = () => {
    const p = out[out.length - 1];
    if (!p || p.t === "nl") return true;
    if (p.t === "op") return ![")", "]", "++", "--", "$"].includes(p.v);
    if (p.t === "name") return KEYWORDS.has(p.v) && p.v !== "getline";
    return false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "\\" && src[i + 1] === "\n") {
      i += 2;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "\n" || c === ";") {
      out.push(c === "\n" ? { t: "nl" } : { t: "op", v: ";" });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c) && /[0-9]/.test(c === "." ? src[i + 1] ?? "" : c)) {
      const m = /^(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)/.exec(src.slice(i))!;
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "name", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          const n = src[++i];
          s += n === "n" ? "\n" : n === "t" ? "\t" : n === "\\" ? "\\" : n === '"' ? '"' : n === "/" ? "/" : "\\" + n;
          i++;
          continue;
        }
        s += src[i++];
      }
      if (src[i] !== '"') throw new AwkError("non-terminated string");
      i++;
      out.push({ t: "str", v: s });
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let s = "";
      i++;
      while (i < src.length && src[i] !== "/") {
        if (src[i] === "\\" && src[i + 1] === "/") {
          s += "/";
          i += 2;
          continue;
        }
        if (src[i] === "\\") {
          s += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (src[i] === "\n") throw new AwkError("non-terminated regular expression");
        s += src[i++];
      }
      i++;
      out.push({ t: "re", v: s });
      continue;
    }
    const ops = ["+=", "-=", "*=", "/=", "%=", "^=", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "!~", ">>", "**", "{", "}", "(", ")", "[", "]", ",", "+", "-", "*", "/", "%", "^", "!", "<", ">", "~", "?", ":", "=", "$", "|"];
    const op = ops.find((o) => src.startsWith(o, i));
    if (!op) throw new AwkError(`syntax error at source line 1: unexpected character '${c}'`);
    out.push({ t: "op", v: op === "**" ? "^" : op });
    i += op.length;
  }
  out.push({ t: "eof" });
  return out;
}

class AwkParser {
  p = 0;
  noGt = false;
  constructor(private toks: Tok[]) {}
  peek(o = 0): Tok {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)];
  }
  isOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.t === "op" && t.v === v;
  }
  isName(v: string): boolean {
    const t = this.peek();
    return t.t === "name" && t.v === v;
  }
  eat(v: string): void {
    if (!this.isOp(v)) throw new AwkError(`syntax error: expected '${v}'`);
    this.p++;
  }
  skipNl(): void {
    while (this.peek().t === "nl" || this.isOp(";")) this.p++;
  }
  skipNewlines(): void {
    while (this.peek().t === "nl") this.p++;
  }

  program(): Rule[] {
    const rules: Rule[] = [];
    this.skipNl();
    while (this.peek().t !== "eof") {
      if (this.isName("BEGIN") || this.isName("END")) {
        const kind = (this.toks[this.p++] as { v: string }).v === "BEGIN" ? "begin" : "end";
        this.skipNewlines();
        rules.push({ kind, body: this.block() });
      } else if (this.isName("function")) throw new AwkError("user-defined functions are not supported in this simulation");
      else {
        let pat: Ex | undefined;
        let pat2: Ex | undefined;
        if (!this.isOp("{")) {
          pat = this.expr();
          if (this.isOp(",")) {
            this.p++;
            pat2 = this.expr();
          }
        }
        const body = this.isOp("{") ? this.block() : undefined;
        rules.push({ kind: "main", pat, pat2, body });
      }
      this.skipNl();
    }
    return rules;
  }

  block(): St[] {
    this.eat("{");
    const body: St[] = [];
    this.skipNl();
    while (!this.isOp("}")) {
      if (this.peek().t === "eof") throw new AwkError("syntax error: unexpected end of program, missing '}'");
      body.push(this.stmt());
      this.skipNl();
    }
    this.p++;
    return body;
  }

  simpleOrBlock(): St {
    this.skipNewlines();
    if (this.isOp(";")) {
      this.p++;
      return { k: "block", body: [] };
    }
    return this.stmt();
  }

  stmt(): St {
    const t = this.peek();
    if (this.isOp("{")) return { k: "block", body: this.block() };
    if (t.t === "name") {
      switch (t.v) {
        case "print":
        case "printf": {
          this.p++;
          const args: Ex[] = [];
          const save = this.noGt;
          this.noGt = true;
          if (!this.endOfSimple()) {
            args.push(this.expr());
            while (this.isOp(",")) {
              this.p++;
              args.push(this.expr());
            }
          }
          this.noGt = save;
          if (this.isOp(">") || this.isOp(">>") || this.isOp("|")) throw new AwkError("output redirection inside awk is not supported in this simulation (redirect the awk command instead)");
          return t.v === "print" ? { k: "print", args } : { k: "printf", args };
        }
        case "if": {
          this.p++;
          this.eat("(");
          const c = this.expr();
          this.eat(")");
          const a = this.simpleOrBlock();
          const save = this.p;
          this.skipNl();
          if (this.isName("else")) {
            this.p++;
            return { k: "if", c, a, b: this.simpleOrBlock() };
          }
          this.p = save;
          return { k: "if", c, a };
        }
        case "while": {
          this.p++;
          this.eat("(");
          const c = this.expr();
          this.eat(")");
          return { k: "while", c, body: this.simpleOrBlock() };
        }
        case "for": {
          this.p++;
          this.eat("(");
          if (this.peek().t === "name" && this.peek(1).t === "name" && (this.peek(1) as { v: string }).v === "in" && this.peek(2).t === "name" && this.isOp(")", 3)) {
            const v = (this.toks[this.p] as { v: string }).v;
            const arr = (this.toks[this.p + 2] as { v: string }).v;
            this.p += 4;
            return { k: "forin", v, arr, body: this.simpleOrBlock() };
          }
          const init = this.isOp(";") ? undefined : { k: "expr" as const, e: this.expr() };
          this.eat(";");
          const c = this.isOp(";") ? undefined : this.expr();
          this.eat(";");
          const step = this.isOp(")") ? undefined : { k: "expr" as const, e: this.expr() };
          this.eat(")");
          return { k: "for", init, c, step, body: this.simpleOrBlock() };
        }
        case "next":
          this.p++;
          return { k: "next" };
        case "break":
          this.p++;
          return { k: "break" };
        case "continue":
          this.p++;
          return { k: "continue" };
        case "exit": {
          this.p++;
          return { k: "exit", e: this.endOfSimple() ? undefined : this.expr() };
        }
        case "delete": {
          this.p++;
          const n = this.toks[this.p++];
          if (n.t !== "name") throw new AwkError("syntax error in delete");
          if (this.isOp("[")) {
            this.p++;
            const e = this.exprList("]");
            return { k: "delete", arr: n.v, e };
          }
          return { k: "delete", arr: n.v };
        }
        case "getline":
        case "do":
        case "function":
        case "return":
          throw new AwkError(`'${t.v}' is not supported in this simulation's awk`);
      }
    }
    return { k: "expr", e: this.expr() };
  }

  endOfSimple(): boolean {
    const t = this.peek();
    return t.t === "nl" || t.t === "eof" || (t.t === "op" && (t.v === ";" || t.v === "}"));
  }

  exprList(close: string): Ex[] {
    const out = [this.expr()];
    while (this.isOp(",")) {
      this.p++;
      out.push(this.expr());
    }
    this.eat(close);
    return out;
  }

  expr(): Ex {
    return this.ternary();
  }

  ternary(): Ex {
    const c = this.or();
    if (this.isOp("?")) {
      this.p++;
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      return { k: "cond", c, a, b };
    }
    if (this.peek().t === "op" && ["=", "+=", "-=", "*=", "/=", "%=", "^="].includes((this.peek() as { v: string }).v) && (c.k === "var" || c.k === "field" || c.k === "idx")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      return { k: "assign", op, lv: c, e: this.ternary() };
    }
    return c;
  }
  or(): Ex {
    let a = this.and();
    while (this.isOp("||")) {
      this.p++;
      this.skipNewlines();
      a = { k: "bin", op: "||", a, b: this.and() };
    }
    return a;
  }
  and(): Ex {
    let a = this.inExpr();
    while (this.isOp("&&")) {
      this.p++;
      this.skipNewlines();
      a = { k: "bin", op: "&&", a, b: this.inExpr() };
    }
    return a;
  }
  inExpr(): Ex {
    const a = this.matchExpr();
    if (this.isName("in")) {
      this.p++;
      const n = this.toks[this.p++];
      if (n.t !== "name") throw new AwkError("syntax error after 'in'");
      return { k: "in", key: [a], arr: n.v };
    }
    return a;
  }
  matchExpr(): Ex {
    let a = this.cmp();
    while (this.isOp("~") || this.isOp("!~")) {
      const neg = (this.toks[this.p++] as { v: string }).v === "!~";
      a = { k: "match", neg, a, re: this.cmp() };
    }
    return a;
  }
  cmp(): Ex {
    const a = this.concat();
    const t = this.peek();
    if (t.t === "op" && ["<", "<=", ">", ">=", "==", "!="].includes(t.v) && !(this.noGt && t.v === ">")) {
      this.p++;
      return { k: "bin", op: t.v, a, b: this.concat() };
    }
    return a;
  }
  concat(): Ex {
    let a = this.additive();
    while (this.startsOperand()) a = { k: "bin", op: "cat", a, b: this.additive() };
    return a;
  }
  startsOperand(): boolean {
    const t = this.peek();
    if (t.t === "num" || t.t === "str" || t.t === "re") return true;
    if (t.t === "name") return !KEYWORDS.has(t.v);
    if (t.t === "op") return ["$", "(", "++", "--"].includes(t.v);
    return false;
  }
  additive(): Ex {
    let a = this.mul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.mul() };
    }
    return a;
  }
  mul(): Ex {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      a = { k: "bin", op, a, b: this.unary() };
    }
    return a;
  }
  unary(): Ex {
    if (this.isOp("!")) {
      this.p++;
      return { k: "un", op: "!", a: this.unary() };
    }
    if (this.isOp("-")) {
      this.p++;
      return { k: "un", op: "-", a: this.unary() };
    }
    if (this.isOp("+")) {
      this.p++;
      return { k: "un", op: "+", a: this.unary() };
    }
    return this.pow();
  }
  pow(): Ex {
    const a = this.postfix();
    if (this.isOp("^")) {
      this.p++;
      return { k: "bin", op: "^", a, b: this.unary() };
    }
    return a;
  }
  postfix(): Ex {
    if (this.isOp("++") || this.isOp("--")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      return { k: "incdec", op, pre: true, lv: this.primary() };
    }
    const e = this.primary();
    if ((this.isOp("++") || this.isOp("--")) && (e.k === "var" || e.k === "field" || e.k === "idx")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      return { k: "incdec", op, pre: false, lv: e };
    }
    return e;
  }
  primary(): Ex {
    const t = this.toks[this.p++];
    switch (t.t) {
      case "num": return { k: "num", v: t.v };
      case "str": return { k: "str", v: t.v };
      case "re": {
        const re = safeRegex(posixToJs(t.v, true));
        if (!re) throw new AwkError(`invalid regex /${t.v}/`);
        return { k: "re", re };
      }
      case "name": {
        if (FUNCS.has(t.v)) {
          if (["rand", "srand", "system", "getline", "close"].includes(t.v)) throw new AwkError(`${t.v}() is not supported in this simulation's awk`);
          if (!this.isOp("(")) {
            if (t.v === "length") return { k: "call", name: "length", args: [] };
            throw new AwkError(`syntax error: ${t.v} needs arguments`);
          }
          this.p++;
          const args: Ex[] = [];
          let arr: string | undefined;
          if (!this.isOp(")")) {
            const save = this.noGt;
            this.noGt = false;
            args.push(...this.exprList(")"));
            this.noGt = save;
          } else this.p++;
          if (t.v === "split" && args[1]?.k === "var") arr = (args[1] as { name: string }).name;
          return { k: "call", name: t.v, args, arr };
        }
        if (this.isOp("[")) {
          this.p++;
          return { k: "idx", name: t.v, e: this.exprList("]") };
        }
        return { k: "var", name: t.v };
      }
      case "op":
        if (t.v === "$") return { k: "field", e: this.postfixNoInc() };
        if (t.v === "(") {
          const save = this.noGt;
          this.noGt = false;
          const e = this.expr();
          if (this.isOp(",")) {
            const keys = [e];
            while (this.isOp(",")) {
              this.p++;
              keys.push(this.expr());
            }
            this.eat(")");
            this.noGt = save;
            if (this.isName("in")) {
              this.p++;
              const n = this.toks[this.p++] as { v: string };
              return { k: "in", key: keys, arr: n.v };
            }
            throw new AwkError("syntax error: unexpected ','");
          }
          this.eat(")");
          this.noGt = save;
          return { k: "group", e };
        }
    }
    throw new AwkError(`syntax error at source line 1 near '${"v" in t ? t.v : t.t}'`);
  }
  postfixNoInc(): Ex {
    if (this.isOp("(")) return this.primary();
    if (this.isOp("-")) {
      this.p++;
      return { k: "un", op: "-", a: this.primary() };
    }
    return this.primary();
  }
}

function looksNumeric(s: string): boolean {
  return /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)\s*$/.test(s);
}
function toNum(v: Val): number {
  if (typeof v === "number") return v;
  const m = /^\s*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)/.exec(v);
  return m ? parseFloat(m[0]) : 0;
}
function toStr(v: Val): string {
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(6)));
}
function truthy(v: Val, strnum: boolean): boolean {
  if (typeof v === "number") return v !== 0;
  if (strnum && looksNumeric(v)) return toNum(v) !== 0;
  return v !== "";
}

export const awk: CommandFn = (ctx) => {
  const args = ctx.args;
  let fs: string | null = null;
  const assigns: [string, string][] = [];
  let i = 0;
  let progSrc: string | null = null;
  while (i < args.length) {
    const a = args[i];
    if (a === "-F") fs = args[++i] ?? " ";
    else if (a.startsWith("-F")) fs = a.slice(2);
    else if (a === "-v") {
      const kv = args[++i] ?? "";
      const eq = kv.indexOf("=");
      assigns.push([kv.slice(0, eq), kv.slice(eq + 1)]);
    } else if (a === "-f") return ctx.unsupported("awk: -f progfile is not supported in this simulation");
    else if (a === "--") {
      i++;
      break;
    } else if (a.startsWith("-") && a.length > 1) return ctx.unsupported(`awk: option '${a}' is not supported in this simulation`);
    else break;
    i++;
  }
  progSrc = args[i++] ?? null;
  if (progSrc === null) {
    ctx.err("usage: awk [-F fs][-v var=value] 'prog' [file ...]\n");
    return 2;
  }
  const files = args.slice(i);
  let rules: Rule[];
  try {
    rules = new AwkParser(lex(progSrc)).program();
  } catch (e) {
    if (e instanceof AwkError) {
      if (e.message.includes("not supported")) return ctx.unsupported(`awk: ${e.message}`);
      ctx.err(`awk: ${e.message}\n source line number 1\n`);
      return 2;
    }
    throw e;
  }

  const vars: Record<string, Val> = { NR: 0, NF: 0, FNR: 0, FS: fs === "t" ? "\t" : fs ?? " ", OFS: " ", ORS: "\n", SUBSEP: "\x1c", FILENAME: "", RSTART: 0, RLENGTH: -1 };
  const arrays: Record<string, Map<string, Val>> = {};
  for (const [k, v] of assigns) vars[k] = v;
  let fields: string[] = [""];
  let out = "";
  let steps = 0;
  const tick = () => {
    if (++steps > 200000) throw new AwkError("program exceeded execution limit");
  };

  const splitRec = (rec: string): string[] => {
    const f = toStr(vars.FS);
    if (f === " ") return rec.trim() === "" ? [] : rec.trim().split(/[ \t\n]+/);
    if (rec === "") return [];
    if (f.length === 1 && f !== "\\") return rec.split(f);
    const re = safeRegex(posixToJs(f, true));
    return re ? rec.split(re) : rec.split(f);
  };
  const setRecord = (rec: string) => {
    fields = [rec, ...splitRec(rec)];
    vars.NF = fields.length - 1;
  };
  const rebuild = () => {
    fields[0] = fields.slice(1).join(toStr(vars.OFS));
  };
  const arr = (name: string) => (arrays[name] ??= new Map());
  const key = (es: Ex[]) => es.map((e) => toStr(ev(e))).join(toStr(vars.SUBSEP));

  const getLv = (lv: Ex): Val => {
    if (lv.k === "var") return lv.name === "NF" ? fields.length - 1 : (vars[lv.name] ?? "");
    if (lv.k === "field") {
      const n = Math.trunc(toNum(ev(lv.e)));
      return fields[n] ?? "";
    }
    if (lv.k === "idx") return arr(lv.name).get(key(lv.e)) ?? "";
    return "";
  };
  const setLv = (lv: Ex, v: Val) => {
    if (lv.k === "var") {
      if (arrays[lv.name]) throw new AwkError(`can't assign to ${lv.name}; it's an array name.`);
      vars[lv.name] = v;
      if (lv.name === "NF") {
        const n = Math.trunc(toNum(v));
        fields = fields.slice(0, n + 1);
        while (fields.length < n + 1) fields.push("");
        rebuild();
      }
    } else if (lv.k === "field") {
      const n = Math.trunc(toNum(ev(lv.e)));
      if (n === 0) setRecord(toStr(v));
      else {
        while (fields.length <= n) fields.push("");
        fields[n] = toStr(v);
        vars.NF = fields.length - 1;
        rebuild();
      }
    } else if (lv.k === "idx") arr(lv.name).set(key(lv.e), v);
  };
  const isStrnum = (e: Ex): boolean => e.k === "field" || (e.k === "var" && typeof vars[e.name] === "string" && assigns.some(([k]) => k === e.name)) || e.k === "idx";

  const ev = (e: Ex): Val => {
    tick();
    switch (e.k) {
      case "num": return e.v;
      case "str": return e.v;
      case "re": return e.re.test(fields[0]) ? 1 : 0;
      case "group": return ev(e.e);
      case "var":
        if (e.name === "NF") return fields.length - 1;
        if (arrays[e.name]) throw new AwkError(`can't use array ${e.name} in scalar context`);
        return vars[e.name] ?? "";
      case "field":
      case "idx":
        return getLv(e);
      case "in": return arr(e.arr).has(key(e.key)) ? 1 : 0;
      case "assign": {
        let v = ev(e.e);
        if (e.op !== "=") {
          const cur = toNum(getLv(e.lv));
          const r = toNum(v);
          switch (e.op) {
            case "+=": v = cur + r; break;
            case "-=": v = cur - r; break;
            case "*=": v = cur * r; break;
            case "/=": if (r === 0) throw new AwkError("division by zero in /="); v = cur / r; break;
            case "%=": v = cur % r; break;
            case "^=": v = Math.pow(cur, r); break;
          }
        }
        setLv(e.lv, v);
        return v;
      }
      case "incdec": {
        const cur = toNum(getLv(e.lv));
        const nv = e.op === "++" ? cur + 1 : cur - 1;
        setLv(e.lv, nv);
        return e.pre ? nv : cur;
      }
      case "cond": return truthy(ev(e.c), isStrnum(e.c)) ? ev(e.a) : ev(e.b);
      case "un": {
        if (e.op === "!") return truthy(ev(e.a), isStrnum(e.a)) ? 0 : 1;
        if (e.op === "-") return -toNum(ev(e.a));
        return toNum(ev(e.a));
      }
      case "match": {
        const s = toStr(ev(e.a));
        const re = e.re.k === "re" ? e.re.re : safeRegex(posixToJs(toStr(ev(e.re)), true));
        if (!re) throw new AwkError("invalid regex");
        return re.test(s) !== e.neg ? 1 : 0;
      }
      case "bin": {
        if (e.op === "&&") return truthy(ev(e.a), isStrnum(e.a)) && truthy(ev(e.b), isStrnum(e.b)) ? 1 : 0;
        if (e.op === "||") return truthy(ev(e.a), isStrnum(e.a)) || truthy(ev(e.b), isStrnum(e.b)) ? 1 : 0;
        const a = ev(e.a);
        const b = ev(e.b);
        switch (e.op) {
          case "cat": return toStr(a) + toStr(b);
          case "+": return toNum(a) + toNum(b);
          case "-": return toNum(a) - toNum(b);
          case "*": return toNum(a) * toNum(b);
          case "/": if (toNum(b) === 0) throw new AwkError("division by zero"); return toNum(a) / toNum(b);
          case "%": if (toNum(b) === 0) throw new AwkError("division by zero in %"); return toNum(a) % toNum(b);
          case "^": return Math.pow(toNum(a), toNum(b));
        }
        const numA = typeof a === "number" || (isStrnum(e.a) && looksNumeric(a));
        const numB = typeof b === "number" || (isStrnum(e.b) && looksNumeric(b));
        let c: number;
        if (numA && numB) c = toNum(a) - toNum(b);
        else {
          const sa = toStr(a);
          const sb = toStr(b);
          c = sa < sb ? -1 : sa > sb ? 1 : 0;
        }
        switch (e.op) {
          case "<": return c < 0 ? 1 : 0;
          case "<=": return c <= 0 ? 1 : 0;
          case ">": return c > 0 ? 1 : 0;
          case ">=": return c >= 0 ? 1 : 0;
          case "==": return c === 0 ? 1 : 0;
          default: return c !== 0 ? 1 : 0;
        }
      }
      case "call": {
        const A = e.args;
        switch (e.name) {
          case "length": return A.length ? (A[0].k === "var" && arrays[(A[0] as { name: string }).name] ? arrays[(A[0] as { name: string }).name].size : toStr(ev(A[0])).length) : fields[0].length;
          case "substr": {
            const s = toStr(ev(A[0]));
            const st = Math.round(toNum(ev(A[1])));
            const len = A[2] ? Math.round(toNum(ev(A[2]))) : Infinity;
            const from = Math.max(1, st);
            const to = len === Infinity ? s.length + 1 : st + len;
            return s.slice(from - 1, Math.max(from - 1, to - 1));
          }
          case "index": return toStr(ev(A[0])).indexOf(toStr(ev(A[1]))) + 1;
          case "toupper": return toStr(ev(A[0])).toUpperCase();
          case "tolower": return toStr(ev(A[0])).toLowerCase();
          case "int": return Math.trunc(toNum(ev(A[0])));
          case "sqrt": return Math.sqrt(toNum(ev(A[0])));
          case "log": return Math.log(toNum(ev(A[0])));
          case "exp": return Math.exp(toNum(ev(A[0])));
          case "sin": return Math.sin(toNum(ev(A[0])));
          case "cos": return Math.cos(toNum(ev(A[0])));
          case "sprintf": return formatPrintf(toStr(ev(A[0])), A.slice(1).map((x) => toStr(ev(x))), () => {}).out;
          case "split": {
            const s = toStr(ev(A[0]));
            const name = e.arr!;
            delete vars[name];
            const m = new Map<string, Val>();
            arrays[name] = m;
            const sep = A[2] ? (A[2].k === "re" ? A[2].re : toStr(ev(A[2]))) : toStr(vars.FS);
            const parts = s === "" ? [] : sep === " " ? s.trim().split(/\s+/) : typeof sep === "string" && sep.length === 1 ? s.split(sep) : s.split(typeof sep === "string" ? (safeRegex(posixToJs(sep, true)) ?? sep) : sep);
            parts.forEach((p, idx) => m.set(String(idx + 1), p));
            return parts.length;
          }
          case "sub":
          case "gsub": {
            const re0 = A[0].k === "re" ? A[0].re : safeRegex(posixToJs(toStr(ev(A[0])), true));
            if (!re0) throw new AwkError("invalid regex");
            const re = new RegExp(re0.source, e.name === "gsub" ? "g" : "");
            const lv: Ex = A[2] ?? { k: "field", e: { k: "num", v: 0 } };
            const rep = toStr(ev(A[1]));
            let n = 0;
            const res = toStr(getLv(lv)).replace(re, (m) => {
              n++;
              return rep.replace(/\\&/g, "\x00").replace(/&/g, m).replace(/\x00/g, "&");
            });
            if (n) setLv(lv, res);
            return n;
          }
          case "match": {
            const re = A[1].k === "re" ? A[1].re : safeRegex(posixToJs(toStr(ev(A[1])), true));
            const m = re ? re.exec(toStr(ev(A[0]))) : null;
            vars.RSTART = m ? m.index + 1 : 0;
            vars.RLENGTH = m ? m[0].length : -1;
            return vars.RSTART;
          }
        }
        throw new AwkError(`function ${e.name} not supported`);
      }
    }
  };

  const exec = (s: St): void => {
    tick();
    switch (s.k) {
      case "print": {
        const parts = s.args.length ? s.args.map((a) => {
          const v = ev(a);
          return typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)))) : v;
        }) : [fields[0]];
        out += parts.join(toStr(vars.OFS)) + toStr(vars.ORS);
        break;
      }
      case "printf": {
        if (!s.args.length) throw new AwkError("printf: no format");
        const fa = s.args.length === 1 && s.args[0].k === "group" ? [s.args[0]] : s.args;
        out += formatPrintf(toStr(ev(fa[0])), fa.slice(1).map((x) => toStr(ev(x))), () => {}).out;
        break;
      }
      case "expr": ev(s.e); break;
      case "block": for (const x of s.body) exec(x); break;
      case "if": if (truthy(ev(s.c), isStrnum(s.c))) exec(s.a); else if (s.b) exec(s.b); break;
      case "while":
        while (truthy(ev(s.c), isStrnum(s.c))) {
          try {
            exec(s.body);
          } catch (e) {
            if (e instanceof BrkSig) break;
            if (e instanceof ContSig) continue;
            throw e;
          }
        }
        break;
      case "for":
        if (s.init) exec(s.init);
        while (!s.c || truthy(ev(s.c), isStrnum(s.c))) {
          try {
            exec(s.body);
          } catch (e) {
            if (e instanceof BrkSig) break;
            if (!(e instanceof ContSig)) throw e;
          }
          if (s.step) exec(s.step);
        }
        break;
      case "forin":
        for (const k of [...arr(s.arr).keys()]) {
          vars[s.v] = k;
          try {
            exec(s.body);
          } catch (e) {
            if (e instanceof BrkSig) break;
            if (!(e instanceof ContSig)) throw e;
          }
        }
        break;
      case "next": throw new NextSig();
      case "exit": throw new ExitSig(s.e ? Math.trunc(toNum(ev(s.e))) : 0);
      case "break": throw new BrkSig();
      case "continue": throw new ContSig();
      case "delete":
        if (s.e) arr(s.arr).delete(key(s.e));
        else arr(s.arr).clear();
        break;
    }
  };

  let code = 0;
  let exitCode: number | null = null;
  const runBody = (body: St[]) => {
    for (const s of body) exec(s);
  };
  try {
    try {
      for (const r of rules) if (r.kind === "begin") runBody(r.body ?? []);
      const mains = rules.filter((r) => r.kind === "main");
      const hasMainOrEnd = mains.length > 0 || rules.some((r) => r.kind === "end");
      if (hasMainOrEnd) {
        const inputs: { name: string; content: string }[] = [];
        if (!files.length) inputs.push({ name: "", content: ctx.io.stdin.readAll() });
        for (const f of files) {
          const eq = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(f);
          if (eq) {
            inputs.push({ name: "\0assign", content: f });
            continue;
          }
          if (f === "-") {
            inputs.push({ name: "-", content: ctx.io.stdin.readAll() });
            continue;
          }
          try {
            inputs.push({ name: f, content: ctx.fs.readFile(ctx.abs(f), ctx.cred) });
          } catch (e) {
            ctx.err(`awk: cannot open "${f}" (${e instanceof Error && "errno" in e && (e as { errno: string }).errno === "EACCES" ? "Permission denied" : "No such file or directory"})\n`);
            code = 2;
          }
        }
        for (const inp of inputs) {
          if (inp.name === "\0assign") {
            const [k, ...v] = inp.content.split("=");
            vars[k] = v.join("=");
            continue;
          }
          vars.FILENAME = inp.name;
          vars.FNR = 0;
          for (const line of splitLines(inp.content)) {
            vars.NR = toNum(vars.NR) + 1;
            vars.FNR = toNum(vars.FNR) + 1;
            setRecord(line);
            try {
              for (const r of mains) {
                let sel: boolean;
                if (!r.pat) sel = true;
                else if (r.pat2) {
                  if (r.inRange) {
                    sel = true;
                    if (truthy(ev(r.pat2), isStrnum(r.pat2))) r.inRange = false;
                  } else if (truthy(ev(r.pat), isStrnum(r.pat))) {
                    sel = true;
                    r.inRange = !truthy(ev(r.pat2), isStrnum(r.pat2));
                  } else sel = false;
                } else sel = truthy(ev(r.pat), isStrnum(r.pat));
                if (!sel) continue;
                if (r.body) runBody(r.body);
                else out += fields[0] + toStr(vars.ORS);
              }
            } catch (e) {
              if (!(e instanceof NextSig)) throw e;
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof ExitSig) exitCode = e.code;
      else throw e;
    }
    for (const r of rules) if (r.kind === "end") {
      try {
        runBody(r.body ?? []);
      } catch (e) {
        if (e instanceof ExitSig) {
          exitCode = e.code;
          break;
        }
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof AwkError) {
      ctx.out(out);
      ctx.err(`awk: ${e.message}\n`);
      return 2;
    }
    if (e instanceof NextSig) {
      /* next in BEGIN: ignore */
    } else throw e;
  }
  ctx.out(out);
  return exitCode ?? code;
};
