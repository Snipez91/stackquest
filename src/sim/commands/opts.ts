/** GNU-style option parsing with honest reporting of unsupported options. */

export interface OptSpec {
  /** Boolean short flags, e.g. "lahRd". */
  flags?: string;
  /** Short flags taking a value, e.g. "nk". */
  withArg?: string;
  /** Long options: name -> short key (or own key). Suffix "=" means it takes a value. */
  long?: Record<string, string>;
  /** Accept -NUM (head/tail). Stored under "#". */
  numeric?: boolean;
  /** Stop option parsing at first operand (POSIX). */
  stopAtOperand?: boolean;
}

export interface Parsed {
  opts: Record<string, string | true>;
  multi: Record<string, string[]>;
  operands: string[];
}

export type ParseResult = ({ ok: true } & Parsed) | { ok: false; bad: string; missingArg?: boolean };

export function parseOpts(args: string[], spec: OptSpec): ParseResult {
  const opts: Record<string, string | true> = {};
  const multi: Record<string, string[]> = {};
  const operands: string[] = [];
  const set = (k: string, v: string | true) => {
    opts[k] = v;
    if (typeof v === "string") (multi[k] ??= []).push(v);
  };
  const flags = spec.flags ?? "";
  const withArg = spec.withArg ?? "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const long = spec.long ?? {};
      if (name + "=" in long) {
        const key = long[name + "="];
        const v = eq > 0 ? a.slice(eq + 1) : args[++i];
        if (v === undefined) return { ok: false, bad: a, missingArg: true };
        set(key, v);
        continue;
      }
      if (name in long && eq < 0) {
        set(long[name], true);
        continue;
      }
      return { ok: false, bad: a };
    }
    if (a.startsWith("-") && a.length > 1) {
      if (spec.numeric && /^-\d+$/.test(a)) {
        set("#", a.slice(1));
        continue;
      }
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (withArg.includes(c)) {
          const rest = a.slice(j + 1);
          const v = rest !== "" ? rest : args[++i];
          if (v === undefined) return { ok: false, bad: "-" + c, missingArg: true };
          set(c, v);
          break;
        }
        if (flags.includes(c)) {
          set(c, true);
          continue;
        }
        return { ok: false, bad: "-" + c };
      }
      continue;
    }
    operands.push(a);
    if (spec.stopAtOperand) {
      operands.push(...args.slice(i + 1));
      break;
    }
  }
  return { ok: true, opts, multi, operands };
}
