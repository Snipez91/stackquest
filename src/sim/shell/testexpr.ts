/** `test` / `[` / `[[` expression evaluation. */
import { globMatch, safeRegex } from "../util";

export type FileTest = (op: string, path: string) => boolean;

export class TestError extends Error {}

const UNARY_FILE = new Set(["-e", "-f", "-d", "-r", "-w", "-x", "-s", "-L", "-h", "-O", "-G", "-p", "-S", "-b", "-c", "-u", "-g", "-k"]);
const BIN_INT = new Set(["-eq", "-ne", "-lt", "-gt", "-le", "-ge"]);

function int(s: string, cmd: string): number {
  if (!/^\s*-?\d+\s*$/.test(s)) throw new TestError(`${cmd}: ${s}: integer expression expected`);
  return parseInt(s, 10);
}

function cmpInt(op: string, a: number, b: number): boolean {
  switch (op) {
    case "-eq": return a === b;
    case "-ne": return a !== b;
    case "-lt": return a < b;
    case "-gt": return a > b;
    case "-le": return a <= b;
    default: return a >= b;
  }
}

/** POSIX test. Returns exit code 0/1, or throws TestError (exit 2). */
export function evalTest(args: string[], ft: FileTest, cmd = "test"): number {
  let p = 0;
  const peek = () => args[p];

  function primary(): boolean {
    const a = args[p];
    if (a === undefined) throw new TestError(`${cmd}: argument expected`);
    if (a === "!" && args.length - p > 1) {
      p++;
      return !primary();
    }
    if (a === "(" ) {
      p++;
      const v = orExpr();
      if (args[p] !== ")") throw new TestError(`${cmd}: \`)' expected`);
      p++;
      return v;
    }
    // binary?
    const op = args[p + 1];
    if (op !== undefined && ["=", "==", "!=", "<", ">", ...BIN_INT, "-nt", "-ot", "-ef"].includes(op) && args[p + 2] !== undefined) {
      const l = a;
      const r = args[p + 2];
      p += 3;
      if (op === "=" || op === "==") return l === r;
      if (op === "!=") return l !== r;
      if (op === "<") return l < r;
      if (op === ">") return l > r;
      if (BIN_INT.has(op)) return cmpInt(op, int(l, cmd), int(r, cmd));
      return false;
    }
    if (UNARY_FILE.has(a) && args[p + 1] !== undefined) {
      p += 2;
      return ft(a, args[p - 1]);
    }
    if ((a === "-z" || a === "-n") && args[p + 1] !== undefined) {
      p += 2;
      return a === "-z" ? args[p - 1] === "" : args[p - 1] !== "";
    }
    p++;
    return a !== "";
  }
  function andExpr(): boolean {
    let v = primary();
    while (peek() === "-a") {
      p++;
      const r = primary();
      v = v && r;
    }
    return v;
  }
  function orExpr(): boolean {
    let v = andExpr();
    while (peek() === "-o") {
      p++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  }
  if (args.length === 0) return 1;
  const v = orExpr();
  if (p < args.length) throw new TestError(`${cmd}: too many arguments`);
  return v ? 0 : 1;
}

export interface DTok {
  s: string;
  pat: string;
  quoted: boolean;
}

/** [[ ... ]] with && || ! ( ) and pattern / regex matching. */
export function evalDbracket(toks: DTok[], ft: FileTest, setMatch: (m: string[]) => void): number {
  let p = 0;
  const peek = () => toks[p]?.s;
  const isOpTok = (i: number, v: string) => toks[i] && !toks[i].quoted && toks[i].s === v;
  function primary(): boolean {
    const t = toks[p];
    if (!t) throw new TestError("syntax error in conditional expression");
    if (isOpTok(p, "!")) {
      p++;
      return !primary();
    }
    if (isOpTok(p, "(")) {
      p++;
      const v = orExpr();
      if (!isOpTok(p, ")")) throw new TestError("syntax error in conditional expression: expected `)'");
      p++;
      return v;
    }
    const op = toks[p + 1];
    if (op && !op.quoted && ["==", "=", "!=", "=~", "<", ">", ...BIN_INT].includes(op.s) && toks[p + 2]) {
      const l = t.s;
      const r = toks[p + 2];
      p += 3;
      switch (op.s) {
        case "==": case "=": return globMatch(r.pat, l);
        case "!=": return !globMatch(r.pat, l);
        case "=~": {
          const re = safeRegex(r.s);
          if (!re) throw new TestError("invalid regular expression");
          const m = re.exec(l);
          if (m) setMatch([...m].map((x) => x ?? ""));
          return !!m;
        }
        case "<": return l < r.s;
        case ">": return l > r.s;
        default: return cmpInt(op.s, int(l, "[["), int(r.s, "[["));
      }
    }
    if (!t.quoted && UNARY_FILE.has(t.s) && toks[p + 1]) {
      p += 2;
      return ft(t.s, toks[p - 1].s);
    }
    if (!t.quoted && (t.s === "-z" || t.s === "-n") && toks[p + 1]) {
      p += 2;
      return t.s === "-z" ? toks[p - 1].s === "" : toks[p - 1].s !== "";
    }
    p++;
    return t.s !== "";
  }
  function andExpr(): boolean {
    let v = primary();
    while (peek() === "&&") {
      p++;
      const r = primary();
      v = v && r;
    }
    return v;
  }
  function orExpr(): boolean {
    let v = andExpr();
    while (peek() === "||") {
      p++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  }
  const v = orExpr();
  if (p < toks.length) throw new TestError(`syntax error in conditional expression near \`${toks[p].s}'`);
  return v ? 0 : 1;
}
