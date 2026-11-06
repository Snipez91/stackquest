/** Shell AST. Plain JSON objects so function definitions can be snapshotted. */

export type WordPart =
  | { t: "lit"; v: string; q: boolean }
  | { t: "param"; name: string; op?: string; arg?: WordPart[]; arg2?: WordPart[]; q: boolean }
  | { t: "cmd"; src: string; q: boolean }
  | { t: "arith"; src: string; q: boolean }
  | { t: "tilde"; user: string };

export interface Word {
  parts: WordPart[];
  raw: string;
}

export interface Redirect {
  fd: number;
  op: ">" | ">>" | "<" | ">&" | "<&" | "&>" | "&>>" | "<<" | "<<<";
  target: Word | null;
  /** For <<: the body and whether the delimiter was quoted (no expansion). */
  heredoc?: { body: string; quoted: boolean };
}

export type Node =
  | { k: "simple"; assigns: { name: string; value: Word; append: boolean }[]; words: Word[]; redirs: Redirect[]; line: number }
  | { k: "pipeline"; cmds: Node[]; negate: boolean }
  | { k: "andor"; first: Node; rest: { op: "&&" | "||"; node: Node }[] }
  | { k: "list"; items: Node[] }
  | { k: "if"; clauses: { cond: Node; body: Node }[]; else: Node | null; redirs: Redirect[] }
  | { k: "for"; var: string; items: Word[] | null; body: Node; redirs: Redirect[] }
  | { k: "while"; until: boolean; cond: Node; body: Node; redirs: Redirect[] }
  | { k: "case"; word: Word; items: { patterns: Word[]; body: Node | null }[]; redirs: Redirect[] }
  | { k: "func"; name: string; body: Node }
  | { k: "group"; body: Node; redirs: Redirect[] }
  | { k: "subshell"; body: Node; redirs: Redirect[] }
  | { k: "arith"; src: string; redirs: Redirect[] }
  | { k: "dbracket"; words: Word[]; redirs: Redirect[] }
  | { k: "background"; body: Node };
