/**
 * A deliberately small simulated DOM for JavaScript missions. Learner code runs
 * in a Worker, which has no real DOM, so we provide the subset these missions
 * teach: elements, attributes, classList, dataset, textContent, value, events
 * with bubbling, and simple selectors (#id, .class, tag, [attr], [attr=value],
 * descendant combinator). `innerHTML` is parsed with the same tiny parser.
 * Layout, CSS and most browser APIs are not simulated; the UI says so.
 */

type Listener = (ev: SimEvent) => void;

export class SimEvent {
  type: string;
  target: SimElement | null = null;
  currentTarget: SimElement | null = null;
  bubbles: boolean;
  defaultPrevented = false;
  propagationStopped = false;
  key?: string;
  constructor(type: string, init: { bubbles?: boolean; key?: string } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.key = init.key;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
}

class ClassList {
  constructor(private el: SimElement) {}
  private get list() {
    return (this.el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }
  private set list(v: string[]) {
    this.el.setAttribute("class", v.join(" "));
  }
  add(...c: string[]) {
    this.list = [...new Set([...this.list, ...c])];
  }
  remove(...c: string[]) {
    this.list = this.list.filter((x) => !c.includes(x));
  }
  contains(c: string) {
    return this.list.includes(c);
  }
  toggle(c: string, force?: boolean) {
    const has = this.contains(c);
    const want = force ?? !has;
    if (want) this.add(c);
    else this.remove(c);
    return want;
  }
  toString() {
    return this.list.join(" ");
  }
}

export class SimElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: SimElement[] = [];
  parentElement: SimElement | null = null;
  private text = "";
  private listeners = new Map<string, Listener[]>();
  value = "";
  disabled = false;
  checked = false;
  hidden = false;
  readonly classList: ClassList;
  readonly dataset: Record<string, string>;
  readonly style: Record<string, string> = {};
  ownerDocument: SimDocument | null = null;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    this.classList = new ClassList(this);
    const self = this;
    this.dataset = new Proxy({} as Record<string, string>, {
      get(_t, k: string) {
        return self.getAttribute("data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())) ?? undefined;
      },
      set(_t, k: string, v: string) {
        self.setAttribute("data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()), String(v));
        return true;
      },
    });
  }

  get id() {
    return this.getAttribute("id") ?? "";
  }
  set id(v: string) {
    this.setAttribute("id", v);
  }
  get className() {
    return this.getAttribute("class") ?? "";
  }
  set className(v: string) {
    this.setAttribute("class", v);
  }
  getAttribute(n: string) {
    return this.attributes.has(n) ? this.attributes.get(n)! : null;
  }
  setAttribute(n: string, v: string) {
    this.attributes.set(n, String(v));
    if (n === "value") this.value = String(v);
    if (n === "disabled") this.disabled = true;
    if (n === "hidden") this.hidden = true;
  }
  removeAttribute(n: string) {
    this.attributes.delete(n);
    if (n === "disabled") this.disabled = false;
    if (n === "hidden") this.hidden = false;
  }
  hasAttribute(n: string) {
    return this.attributes.has(n);
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    for (const c of this.children) c.parentElement = null;
    this.children = [];
    this.text = String(v ?? "");
  }
  get innerText() {
    return this.textContent;
  }
  set innerText(v: string) {
    this.textContent = v;
  }
  set innerHTML(html: string) {
    this.textContent = "";
    for (const node of parseHtml(String(html), this.ownerDocument)) {
      if (typeof node === "string") this.text += node;
      else this.appendChild(node);
    }
  }
  get innerHTML() {
    return this.text + this.children.map((c) => c.outerHTML).join("");
  }
  get outerHTML(): string {
    const attrs = [...this.attributes].map(([k, v]) => ` ${k}="${v}"`).join("");
    const tag = this.tagName.toLowerCase();
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  appendChild<T extends SimElement>(child: T): T {
    child.remove();
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }
  append(...nodes: (SimElement | string)[]) {
    for (const n of nodes) {
      if (typeof n === "string") this.text += n;
      else this.appendChild(n);
    }
  }
  prepend(child: SimElement) {
    child.remove();
    child.parentElement = this;
    this.children.unshift(child);
  }
  removeChild(child: SimElement) {
    child.remove();
    return child;
  }
  replaceChildren(...nodes: (SimElement | string)[]) {
    this.textContent = "";
    this.append(...nodes);
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      this.parentElement = null;
    }
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get childElementCount() {
    return this.children.length;
  }
  closest(sel: string): SimElement | null {
    let el: SimElement | null = this;
    while (el) {
      if (matches(el, sel)) return el;
      el = el.parentElement;
    }
    return null;
  }
  matches(sel: string) {
    return matches(this, sel);
  }

  addEventListener(type: string, fn: Listener) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  listenerCount(type: string) {
    return (this.listeners.get(type) ?? []).length;
  }
  dispatchEvent(ev: SimEvent) {
    if (!ev.target) ev.target = this;
    let el: SimElement | null = this;
    while (el) {
      ev.currentTarget = el;
      for (const fn of [...(el.listeners.get(ev.type) ?? [])]) fn.call(el, ev);
      if (!ev.bubbles || ev.propagationStopped) break;
      el = el.parentElement;
    }
    return !ev.defaultPrevented;
  }
  click() {
    if (this.disabled) return;
    this.dispatchEvent(new SimEvent("click"));
  }

  querySelectorAll(sel: string): SimElement[] {
    const out: SimElement[] = [];
    const walk = (el: SimElement) => {
      for (const c of el.children) {
        if (sel.split(",").some((s) => matches(c, s.trim()))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel: string) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

function matchSimple(el: SimElement, sel: string): boolean {
  const re = /([#.]?[\w-]+|\[[^\]]+\])/g;
  const parts = sel.match(re) ?? [];
  if (!parts.length) return false;
  return parts.every((p) => {
    if (p.startsWith("#")) return el.id === p.slice(1);
    if (p.startsWith(".")) return el.classList.contains(p.slice(1));
    if (p.startsWith("[")) {
      const m = p.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
      if (!m) return false;
      return m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2];
    }
    return el.tagName === p.toUpperCase();
  });
}

function matches(el: SimElement, sel: string): boolean {
  const chain = sel.trim().split(/\s+/);
  if (!matchSimple(el, chain[chain.length - 1])) return false;
  let anc = el.parentElement;
  for (let i = chain.length - 2; i >= 0; i--) {
    while (anc && !matchSimple(anc, chain[i])) anc = anc.parentElement;
    if (!anc) return false;
    anc = anc.parentElement;
  }
  return true;
}

const VOID = new Set(["input", "br", "img", "hr", "meta", "link"]);

export function parseHtml(html: string, doc: SimDocument | null): (SimElement | string)[] {
  const root = new SimElement("root");
  root.ownerDocument = doc;
  const stack: SimElement[] = [root];
  const re = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) {
      const t = m[3].replace(/\s+/g, " ");
      if (t.trim()) top.append(decode(t.trim()));
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = new SimElement(tag);
    el.ownerDocument = doc;
    const attrRe = /([\w-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[2]))) {
      if (a[1] === "/") continue;
      el.setAttribute(a[1], decode(a[3] ?? a[4] ?? a[5] ?? ""));
    }
    top.appendChild(el);
    if (!VOID.has(tag) && !m[0].endsWith("/>")) stack.push(el);
  }
  const out: (SimElement | string)[] = [];
  const rootText = (root as unknown as { text: string }).text;
  if (rootText) out.push(rootText);
  for (const c of [...root.children]) {
    c.parentElement = null;
    out.push(c);
  }
  return out;
}

function decode(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export class SimDocument {
  body: SimElement;
  constructor(html = "") {
    this.body = new SimElement("body");
    this.body.ownerDocument = this;
    if (html) this.body.innerHTML = html;
  }
  createElement(tag: string) {
    const el = new SimElement(tag);
    el.ownerDocument = this;
    return el;
  }
  getElementById(id: string) {
    return this.body.querySelector(`#${id}`);
  }
  querySelector(sel: string) {
    return this.body.querySelector(sel);
  }
  querySelectorAll(sel: string) {
    return this.body.querySelectorAll(sel);
  }
  addEventListener(type: string, fn: Listener) {
    this.body.addEventListener(type, fn);
  }
}

/** Helpers exposed to tests as `dom`. */
export function domHelpers(document: SimDocument) {
  return {
    document,
    $: (sel: string) => document.querySelector(sel),
    $$: (sel: string) => document.querySelectorAll(sel),
    click(sel: string | SimElement) {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) throw new Error(`no element matches ${String(sel)}`);
      el.click();
    },
    type(sel: string, value: string) {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element matches ${sel}`);
      el.value = value;
      el.dispatchEvent(new SimEvent("input"));
    },
    submit(sel: string) {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element matches ${sel}`);
      return el.dispatchEvent(new SimEvent("submit"));
    },
    key(sel: string, key: string) {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element matches ${sel}`);
      el.dispatchEvent(new SimEvent("keydown", { key }));
    },
    text: (sel: string) => document.querySelector(sel)?.textContent.trim() ?? null,
    Event: SimEvent,
  };
}
