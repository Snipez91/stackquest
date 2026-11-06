import type { Skill } from "@/content/schema";

export const pythonSkills: Skill[] = [
  {
    id: "py.variables",
    track: "python",
    name: "Variables and assignment",
    description: "Bind names to values, rebind them deliberately, and use accumulator variables to build up a result.",
  },
  {
    id: "py.types",
    track: "python",
    name: "Types and conversion",
    description: "Recognise str, int, float, bool and None, and convert text input into the type the calculation needs.",
  },
  {
    id: "py.control-flow",
    track: "python",
    name: "Control flow",
    description: "Use if/elif/else and boolean logic so each input follows exactly one correct branch, including at boundaries.",
  },
  {
    id: "py.functions",
    track: "python",
    name: "Functions",
    description: "Write functions with parameters, defaults and return values, and tell returning a value apart from printing one.",
  },
  {
    id: "py.collections",
    track: "python",
    name: "Collections",
    description: "Choose between lists, dicts, sets and tuples, and avoid surprises from shared references and mutation.",
  },
  {
    id: "py.strings",
    track: "python",
    name: "Strings and formatting",
    description: "Clean and normalise text with string methods and produce aligned, precise output with f-strings.",
  },
  {
    id: "py.iteration",
    track: "python",
    name: "Iteration and comprehensions",
    description: "Loop over data with for, enumerate and zip, and express filters and transforms as comprehensions.",
  },
  {
    id: "py.files",
    track: "python",
    name: "Reading files",
    description: "Open text files safely with a context manager and read CSV data with the csv module instead of splitting by hand.",
  },
  {
    id: "py.exceptions",
    track: "python",
    name: "Exceptions",
    description: "Raise and catch specific exceptions so bad records are handled and reported while real bugs still surface.",
  },
  {
    id: "py.modules",
    track: "python",
    name: "Modules and imports",
    description: "Split code into importable modules, guard script-only code with __name__, and understand how imports are resolved.",
  },
  {
    id: "py.testing",
    track: "python",
    name: "Testing",
    description: "Write assert-based tests that pin down edge cases, and judge a test suite by whether it catches broken code.",
  },
  {
    id: "py.json-apis",
    track: "python",
    name: "JSON API payloads",
    description: "Parse JSON responses into dicts and lists, handle missing keys and error statuses, and fail loudly on malformed bodies.",
  },
  {
    id: "py.debugging",
    track: "python",
    name: "Debugging from tracebacks",
    description: "Read a traceback from the bottom up, locate the failing line and its caller, and fix the cause rather than the symptom.",
  },
  {
    id: "py.automation",
    track: "python",
    name: "Practical automation",
    description: "Combine several input files into a deduplicated, aggregated report that is safe to run repeatedly.",
  },
];
