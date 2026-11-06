import type { Skill } from "@/content/schema";

export const javascriptSkills: Skill[] = [
  {
    id: "js.variables",
    track: "javascript",
    name: "Variables and declarations",
    description: "Choose const or let deliberately, understand reassignment versus mutation, and read errors such as \"Assignment to constant variable\".",
  },
  {
    id: "js.types",
    track: "javascript",
    name: "Types, coercion and equality",
    description: "Recognise string versus number values, convert explicitly with Number(), detect NaN, and explain why === is preferred over ==.",
  },
  {
    id: "js.functions",
    track: "javascript",
    name: "Functions",
    description: "Write functions that take parameters (with defaults), return values instead of logging them, and stay pure so the same input always gives the same output.",
  },
  {
    id: "js.arrays",
    track: "javascript",
    name: "Array transformations",
    description: "Use filter, map and reduce to transform lists, give reduce an initial value, and avoid mutating inputs with in-place methods like sort.",
  },
  {
    id: "js.objects",
    track: "javascript",
    name: "Objects and data shaping",
    description: "Reshape API records with destructuring, optional chaining and nullish coalescing, and copy objects with spread instead of mutating them.",
  },
  {
    id: "js.scope",
    track: "javascript",
    name: "Scope and closures",
    description: "Explain block versus function scope, use closures to keep private per-instance state, and fix the var-in-a-loop capture bug.",
  },
  {
    id: "js.dom-events",
    track: "javascript",
    name: "DOM and events",
    description: "Read and update the DOM safely, handle form submit with preventDefault, and use event delegation for lists that are re-rendered.",
  },
  {
    id: "js.async",
    track: "javascript",
    name: "Asynchrony and the event loop",
    description: "Predict the order of synchronous code, promise callbacks (microtasks) and timers (macrotasks), and return promises instead of reading values too early.",
  },
  {
    id: "js.promises",
    track: "javascript",
    name: "Promises and combinators",
    description: "Run independent work concurrently, and choose between Promise.all (all-or-nothing) and Promise.allSettled (partial results).",
  },
  {
    id: "js.fetch",
    track: "javascript",
    name: "HTTP with fetch",
    description: "Send GET and JSON POST requests with fetch, check response.ok and status before parsing, and map HTTP statuses to return values or errors.",
  },
  {
    id: "js.error-handling",
    track: "javascript",
    name: "Error handling",
    description: "Use try/catch/finally around async work, define custom error classes that carry context, and leave the UI in a consistent state on failure.",
  },
  {
    id: "js.testing",
    track: "javascript",
    name: "Testing behaviour",
    description: "Turn a specification into test cases with correct expectations, including boundaries and error cases, so that broken implementations are caught.",
  },
  {
    id: "js.debugging",
    track: "javascript",
    name: "Debugging from evidence",
    description: "Read a stack trace to find the failing line and call path, reproduce with the failing input, and fix the root cause rather than hiding the error.",
  },
];
