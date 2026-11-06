/** Pure helpers: paths, time formatting, regex/glob translation, hashing. */

// ---------------------------------------------------------------- paths

export function normalizePath(p: string, cwd = "/"): string {
  const abs = p.startsWith("/") ? p : (cwd.endsWith("/") ? cwd : cwd + "/") + p;
  const out: string[] = [];
  for (const seg of abs.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

export function dirname(p: string): string {
  if (p === "/") return "/";
  const s = p.replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  if (i < 0) return ".";
  if (i === 0) return "/";
  return s.slice(0, i);
}

export function basename(p: string): string {
  if (p === "/") return "/";
  const s = p.replace(/\/+$/, "");
  return s.slice(s.lastIndexOf("/") + 1);
}

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? "/" + name : dir + "/" + name;
}

/** Display a path relative to home as ~ (for prompts). */
export function tildify(p: string, home: string): string {
  if (home && home !== "/" && (p === home || p.startsWith(home + "/"))) return "~" + p.slice(home.length);
  return p;
}

// ---------------------------------------------------------------- time

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseClock(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 1772442900;
}

function d(t: number): Date {
  return new Date(t * 1000);
}
const p2 = (n: number) => String(n).padStart(2, "0");

/** `ls -l` style: "Mar  2 09:15" or "Mar  2  2025" for old files. */
export function fmtLsDate(t: number, now: number): string {
  const x = d(t);
  const mon = MONTHS[x.getUTCMonth()];
  const day = String(x.getUTCDate()).padStart(2, " ");
  const old = now - t > 182 * 86400 || t - now > 3600;
  return `${mon} ${day} ${old ? " " + x.getUTCFullYear() : p2(x.getUTCHours()) + ":" + p2(x.getUTCMinutes())}`;
}

/** journal style: "Mar 02 09:15:03" */
export function fmtJournal(t: number): string {
  const x = d(t);
  return `${MONTHS[x.getUTCMonth()]} ${p2(x.getUTCDate())} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}`;
}

/** `date` default: "Mon Mar  2 09:15:00 UTC 2026" */
export function fmtDate(t: number): string {
  const x = d(t);
  return `${DAYS[x.getUTCDay()]} ${MONTHS[x.getUTCMonth()]} ${String(x.getUTCDate()).padStart(2, " ")} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())} UTC ${x.getUTCFullYear()}`;
}

/** "2026-03-02 09:15:00" */
export function fmtIso(t: number): string {
  const x = d(t);
  return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}`;
}

export function fmtSystemd(t: number): string {
  const x = d(t);
  return `${DAYS[x.getUTCDay()]} ${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())} UTC`;
}

export function hhmm(t: number): string {
  const x = d(t);
  return `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}`;
}

export function strftime(fmt: string, t: number): string {
  const x = d(t);
  const start = Date.UTC(x.getUTCFullYear(), 0, 1) / 1000;
  return fmt.replace(/%([a-zA-Z%])/g, (m, c: string) => {
    switch (c) {
      case "Y": return String(x.getUTCFullYear());
      case "y": return p2(x.getUTCFullYear() % 100);
      case "m": return p2(x.getUTCMonth() + 1);
      case "d": return p2(x.getUTCDate());
      case "e": return String(x.getUTCDate()).padStart(2, " ");
      case "H": return p2(x.getUTCHours());
      case "I": return p2(((x.getUTCHours() + 11) % 12) + 1);
      case "p": return x.getUTCHours() < 12 ? "AM" : "PM";
      case "M": return p2(x.getUTCMinutes());
      case "S": return p2(x.getUTCSeconds());
      case "F": return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`;
      case "T": return `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}`;
      case "R": return `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}`;
      case "D": return `${p2(x.getUTCMonth() + 1)}/${p2(x.getUTCDate())}/${p2(x.getUTCFullYear() % 100)}`;
      case "s": return String(t);
      case "a": return DAYS[x.getUTCDay()];
      case "A": return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][x.getUTCDay()];
      case "b": case "h": return MONTHS[x.getUTCMonth()];
      case "B": return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][x.getUTCMonth()];
      case "j": return String(Math.floor((t - start) / 86400) + 1).padStart(3, "0");
      case "u": return String(x.getUTCDay() || 7);
      case "w": return String(x.getUTCDay());
      case "Z": return "UTC";
      case "z": return "+0000";
      case "n": return "\n";
      case "t": return "\t";
      case "%": return "%";
      default: return m;
    }
  });
}

// ---------------------------------------------------------------- hashing

/** Small deterministic string hash (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- modes

export function modeString(type: "file" | "dir" | "symlink", mode: number): string {
  const t = type === "dir" ? "d" : type === "symlink" ? "l" : "-";
  const bits = "rwxrwxrwx";
  let s = "";
  for (let i = 0; i < 9; i++) s += mode & (1 << (8 - i)) ? bits[i] : "-";
  const a = s.split("");
  if (mode & 0o4000) a[2] = a[2] === "x" ? "s" : "S";
  if (mode & 0o2000) a[5] = a[5] === "x" ? "s" : "S";
  if (mode & 0o1000) a[8] = a[8] === "x" ? "t" : "T";
  return t + a.join("");
}

export function octal(mode: number, width = 4): string {
  return (mode & 0o7777).toString(8).padStart(width, "0");
}

// ---------------------------------------------------------------- regex

const POSIX_CLASSES: Record<string, string> = {
  alpha: "a-zA-Z",
  digit: "0-9",
  alnum: "a-zA-Z0-9",
  upper: "A-Z",
  lower: "a-z",
  space: " \\t\\n\\r\\f\\v",
  blank: " \\t",
  punct: "!-\\/:-@\\[-`{-~",
  xdigit: "0-9A-Fa-f",
  word: "\\w",
  cntrl: "\\x00-\\x1f",
  print: " -~",
  graph: "!-~",
};

/** Translate a bracket expression starting at p[i]==='['. Returns [jsText, nextIndex]. */
function translateBracket(p: string, i: number): [string, number] {
  let j = i + 1;
  let out = "[";
  if (p[j] === "^" || p[j] === "!") {
    out += "^";
    j++;
  }
  if (p[j] === "]") {
    out += "\\]";
    j++;
  }
  while (j < p.length && p[j] !== "]") {
    if (p[j] === "[" && p[j + 1] === ":") {
      const end = p.indexOf(":]", j + 2);
      if (end > 0) {
        const name = p.slice(j + 2, end);
        out += POSIX_CLASSES[name] ?? "";
        j = end + 2;
        continue;
      }
    }
    const c = p[j];
    if (c === "\\" || c === "[" ) out += "\\" + c;
    else out += c;
    j++;
  }
  if (j >= p.length) return ["\\[", i + 1];
  return [out + "]", j + 1];
}

/** POSIX basic/extended regex -> JS regex source. */
export function posixToJs(p: string, extended: boolean): string {
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "[") {
      const [t, n] = translateBracket(p, i);
      out += t;
      i = n - 1;
      continue;
    }
    if (c === "\\" && i + 1 < p.length) {
      const n = p[++i];
      if (n === "<" || n === ">") out += "\\b";
      else if (!extended && "(){}|+?".includes(n)) out += n;
      else if ("wWsSbBdD".includes(n)) out += "\\" + n;
      else if (/[0-9]/.test(n)) out += "\\" + n;
      else out += "\\" + n.replace(/[a-zA-Z]/, (m) => m);
      continue;
    }
    if (!extended && "(){}|+?".includes(c)) {
      out += "\\" + c;
      continue;
    }
    if (c === "*" && (out === "" || out.endsWith("(") || out === "^")) {
      out += "\\*";
      continue;
    }
    if (extended && c === "{" && !/^\{\d+(,\d*)?\}/.test(p.slice(i))) {
      out += "\\{";
      continue;
    }
    if (c === "/") {
      out += "\\/";
      continue;
    }
    out += c;
  }
  return out;
}

export function safeRegex(src: string, flags = ""): RegExp | null {
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
}

// ---------------------------------------------------------------- globs

/** Does the (backslash-escaped) pattern contain unescaped glob metachars? */
export function hasGlob(p: string): boolean {
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "\\") {
      i++;
      continue;
    }
    if (p[i] === "*" || p[i] === "?") return true;
    if (p[i] === "[" && p.indexOf("]", i + 2) > 0) return true;
  }
  return false;
}

/** Glob pattern (backslash escapes allowed) -> anchored JS regex source. */
export function globToRegexSrc(p: string, pathname: boolean): string {
  let out = "";
  const any = pathname ? "[^/]" : "[\\s\\S]";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) {
      out += escapeRegex(p[++i]);
    } else if (c === "*") out += any + "*";
    else if (c === "?") out += any;
    else if (c === "[") {
      const end = p.indexOf("]", i + 2);
      if (end < 0) out += "\\[";
      else {
        const [t, n] = translateBracket(p, i);
        out += t;
        i = n - 1;
      }
    } else out += escapeRegex(c);
  }
  return out;
}

export function globMatch(pattern: string, s: string, pathname = false): boolean {
  const re = safeRegex("^" + globToRegexSrc(pattern, pathname) + "$");
  return re ? re.test(s) : pattern === s;
}

/** Remove backslash escapes from a glob pattern (for unmatched globs). */
export function unescapeGlob(p: string): string {
  return p.replace(/\\(.)/g, "$1");
}

export function escapeGlob(s: string): string {
  return s.replace(/[*?[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------- misc

export function humanSize(n: number): string {
  if (n < 1024) return String(n);
  const units = ["K", "M", "G", "T"];
  let v = n;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  if (v < 10) return (Math.ceil(v * 10) / 10).toFixed(1) + units[u];
  return Math.ceil(v) + units[u];
}

export function splitLines(s: string): string[] {
  if (s === "") return [];
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function joinLines(lines: string[]): string {
  return lines.length ? lines.join("\n") + "\n" : "";
}

export function isIdent(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}
