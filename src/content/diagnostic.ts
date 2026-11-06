import type { TrackId } from "./schema";

/**
 * Placement diagnostic: three short questions per track, ordered easy → harder.
 * Each includes an honest "I don't know yet" option so people don't guess.
 * 3/3 in a track lets the learner skip that track's beginner missions.
 */
export type DiagnosticQ = { id: string; track: Exclude<TrackId, "capstone">; prompt: string; code?: string; options: string[]; answer: number };

export const DIAGNOSTIC: DiagnosticQ[] = [
  { id: "py1", track: "python", prompt: "What does this print?", code: 'items = ["a", "b", "c"]\nprint(len(items[1:]))', options: ["1", "2", "3", "An error"], answer: 1 },
  { id: "py2", track: "python", prompt: "Which line safely reads a key that might be missing from dict `cfg`, defaulting to 30?", options: ['cfg["timeout"] or 30', 'cfg.get("timeout", 30)', 'cfg.timeout ?? 30', 'cfg["timeout", 30]'], answer: 1 },
  { id: "py3", track: "python", prompt: "A loop over log lines crashes on one malformed line with ValueError. What's the most targeted fix?", options: ["Wrap the whole script in try/except Exception: pass", "Catch ValueError around parsing that one line, record it, and continue", "Delete malformed lines from the log file by hand", "Use int() instead of float()"], answer: 1 },
  { id: "lx1", track: "linux", prompt: "You're in /var/log. Which command shows the last 20 lines of app.log?", options: ["head -20 app.log", "tail -n 20 app.log", "cat app.log | 20", "less -20 app.log"], answer: 1 },
  { id: "lx2", track: "linux", prompt: "A file has mode -rw-r----- owned by root:app. Can user `deploy` (not in group app) read it?", options: ["Yes, everyone can read it", "Only with execute permission", "No — 'other' has no permissions", "Yes, because the owner can read"], answer: 2 },
  { id: "lx3", track: "linux", prompt: "Which pipeline counts how many lines in access.log contain ' 500 '?", options: ["grep ' 500 ' access.log | wc -l", "wc -l access.log | grep 500", "cat access.log > grep 500", "count 500 access.log"], answer: 0 },
  { id: "js1", track: "javascript", prompt: "What is the value of `'5' + 3` in JavaScript?", options: ["8", '"53"', "NaN", "TypeError"], answer: 1 },
  { id: "js2", track: "javascript", prompt: "fetch() returns a response with status 500. What happens by default?", options: ["The promise rejects", "The promise resolves; response.ok is false", "fetch retries automatically", "An exception is thrown synchronously"], answer: 1 },
  { id: "js3", track: "javascript", prompt: "In what order are these logged?", code: "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');", options: ["A B C D", "A D C B", "A D B C", "A C D B"], answer: 1 },
  { id: "net1", track: "networking", prompt: "Which of these is a private IPv4 address?", options: ["8.8.8.8", "172.20.4.9", "100.64.300.1", "11.0.0.1"], answer: 1 },
  { id: "net2", track: "networking", prompt: "`ping 10.20.0.15` works but `ping api.lumen.internal` says 'unknown host'. Most likely layer at fault?", options: ["Physical cabling", "Routing", "Name resolution (DNS)", "The application's code"], answer: 2 },
  { id: "net3", track: "networking", prompt: "How many usable host addresses are in a /26 subnet?", options: ["64", "62", "30", "126"], answer: 1 },
];

export const DONT_KNOW = -1;
