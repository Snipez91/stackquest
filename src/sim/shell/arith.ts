/** Integer arithmetic for $(( )) and (( )). */

export class ArithError extends Error {}

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const OPS = ["**=", "<<=", ">>=", "&&", "||", "==", "!=", "<=", ">=", "<<", ">>", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "+", "-", "*", "/", "%", "<", ">", "!", "~", "(", ")", "?", ":", "=", ",", "&", "|", "^"];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9a-fA-Fx]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const v = raw.startsWith("0x") ? parseInt(raw, 16) : raw.length > 1 && raw.startsWith("0") ? parseInt(raw, 8) : parseInt(raw, 10);
      if (!Number.isFinite(v)) throw new ArithError(`${raw}: value too great for base`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(c === "$" ? i + 1 : i, j) });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ArithError(`syntax error: invalid arithmetic operator (error token is "${src.slice(i)}")`);
    out.push({ t: "op", v: op });
    i += op.length;
  }
  return out;
}

export function evalArith(src: string, get: (name: string) => string | undefined, set: (name: string, v: string) => void): number {
  const toks = lex(src);
  let p = 0;
  const peek = (): Tok | undefined => toks[p];
  const opv = (): string => { const t = toks[p]; return t && t.t === "op" ? t.v : ""; };
  const isOp = (v: string) => opv() === v;
  const varVal = (name: string, depth = 0): number => {
    const s = (get(name) ?? "").trim();
    if (s === "") return 0;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (depth < 5 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return varVal(s, depth + 1);
    if (depth < 5) return evalArith(s, get, set);
    return 0;
  };
  const trunc = (n: number) => (n < 0 ? Math.ceil(n) : Math.floor(n)) | 0;

  function primary(): number {
    const t = toks[p++];
    if (!t) throw new ArithError("syntax error: operand expected");
    if (t.t === "num") return t.v;
    if (t.t === "id") {
      if (isOp("++") || isOp("--")) {
        const op = opv();
        p++;
        const v = varVal(t.v);
        set(t.v, String(op === "++" ? v + 1 : v - 1));
        return v;
      }
      const assignOps = ["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>="];
      if (peek()?.t === "op" && assignOps.includes(opv())) {
        const op = opv();
        p++;
        const rhs = assignment();
        const cur = varVal(t.v);
        let v = rhs;
        if (op === "+=") v = cur + rhs;
        else if (op === "-=") v = cur - rhs;
        else if (op === "*=") v = cur * rhs;
        else if (op === "/=") {
          if (rhs === 0) throw new ArithError("division by 0 (error token is \"0\")");
          v = trunc(cur / rhs);
        } else if (op === "%=") v = cur % rhs;
        set(t.v, String(v));
        return v;
      }
      return varVal(t.v);
    }
    if (t.v === "(") {
      const v = comma();
      if (!isOp(")")) throw new ArithError("syntax error: `)' expected");
      p++;
      return v;
    }
    if (t.v === "-") return -unary();
    if (t.v === "+") return unary();
    if (t.v === "!") return unary() ? 0 : 1;
    if (t.v === "~") return ~unary();
    if (t.v === "++" || t.v === "--") {
      const id = toks[p++];
      if (!id || id.t !== "id") throw new ArithError("syntax error: operand expected");
      const v = varVal(id.v) + (t.v === "++" ? 1 : -1);
      set(id.v, String(v));
      return v;
    }
    throw new ArithError(`syntax error: operand expected (error token is "${t.v}")`);
  }
  function unary(): number {
    return primary();
  }
  function power(): number {
    const b = unary();
    if (isOp("**")) {
      p++;
      return Math.pow(b, power());
    }
    return b;
  }
  function binLevel(next: () => number, ops: string[], f: (op: string, a: number, b: number) => number): () => number {
    return () => {
      let a = next();
      while (peek()?.t === "op" && ops.includes(opv())) {
        const op = opv();
        p++;
        a = f(op, a, next());
      }
      return a;
    };
  }
  const mul = binLevel(power, ["*", "/", "%"], (op, a, b) => {
    if ((op === "/" || op === "%") && b === 0) throw new ArithError('division by 0 (error token is "0")');
    return op === "*" ? a * b : op === "/" ? trunc(a / b) : a % b;
  });
  const add = binLevel(mul, ["+", "-"], (op, a, b) => (op === "+" ? a + b : a - b));
  const shift = binLevel(add, ["<<", ">>"], (op, a, b) => (op === "<<" ? a << b : a >> b));
  const rel = binLevel(shift, ["<", ">", "<=", ">="], (op, a, b) => +(op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b));
  const eq = binLevel(rel, ["==", "!="], (op, a, b) => +(op === "==" ? a === b : a !== b));
  const band = binLevel(eq, ["&"], (_o, a, b) => a & b);
  const bxor = binLevel(band, ["^"], (_o, a, b) => a ^ b);
  const bor = binLevel(bxor, ["|"], (_o, a, b) => a | b);
  const land = binLevel(bor, ["&&"], (_o, a, b) => +(!!a && !!b));
  const lor = binLevel(land, ["||"], (_o, a, b) => +(!!a || !!b));
  function ternary(): number {
    const c = lor();
    if (isOp("?")) {
      p++;
      const a = assignment();
      if (!isOp(":")) throw new ArithError("syntax error: `:' expected");
      p++;
      const b = assignment();
      return c ? a : b;
    }
    return c;
  }
  function assignment(): number {
    return ternary();
  }
  function comma(): number {
    let v = assignment();
    while (isOp(",")) {
      p++;
      v = assignment();
    }
    return v;
  }
  if (!toks.length) return 0;
  const v = comma();
  if (p < toks.length) throw new ArithError(`syntax error in expression (error token is "${toks.slice(p).map((t) => String(t.v)).join(" ")}")`);
  return v;
}
