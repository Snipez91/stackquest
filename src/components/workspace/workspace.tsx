"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, ChevronLeft, CircleAlert, FileText, Lightbulb, MessagesSquare, Play, RotateCcw, ShieldCheck, TerminalSquare, X } from "lucide-react";
import type { PublicMission } from "@/lib/public-mission";
import { api, ApiError, uid } from "@/lib/client-api";
import { gradeQuestion, type Answer } from "@/lib/grading";
import type { Question } from "@/content/schema";
import { sandbox } from "@/sandbox/client";
import type { RunResult } from "@/sandbox/types";
import { Simulation } from "@/sim";
import type { SimEvent } from "@/sim/schema";
import { cn } from "@/lib/cn";
import { TierBadge, TrackPill } from "@/components/ui";
import { useChatDrawer } from "@/components/shell/app-shell";
import { QuestionCard, type ClientQuestion, type GradeView } from "@/components/questions/question-card";
import { CodeEditor } from "./code-editor";
import { Terminal, type TermLine } from "./terminal";

type AttemptView = {
  id: string;
  hintsUsed: number;
  practicalPassed: boolean;
  questionResults: Record<string, { correct: boolean; score: number; tries: number }>;
  failedChecks: number;
  draft: Record<string, unknown> | null;
  lastCheckResults: { id: string; pass: boolean; detail?: string }[];
};

type CheckView = { id: string; name: string; pass: boolean; detail?: string; feedback?: { what: string; why: string; next: string } };

type SaveState = "idle" | "saving" | "saved" | "error";

export function Workspace({ mission, attempt: initial, theme, previouslyCompleted, raceId }: { mission: PublicMission; attempt: AttemptView; theme: "dark" | "light"; previouslyCompleted: boolean; raceId?: string }) {
  const router = useRouter();
  const { openChat } = useChatDrawer();
  const ws = mission.workspace;
  const [attempt, setAttempt] = useState(initial);
  const [hints, setHints] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [leftTab, setLeftTab] = useState<"brief" | "concept" | "example" | "criteria">("brief");
  const [mobileTab, setMobileTab] = useState<"brief" | "work" | "questions">("brief");
  const [checks, setChecks] = useState<CheckView[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [grades, setGrades] = useState<Record<string, GradeView>>(() =>
    Object.fromEntries(Object.entries(initial.questionResults ?? {}).map(([k, v]) => [k, { correct: v.correct, tries: v.tries }])),
  );
  const [refresher, setRefresher] = useState<{ body: string; practice: Question } | null>(null);
  const [practiceGrade, setPracticeGrade] = useState<GradeView | null>(null);
  const [solution, setSolution] = useState<{ explanation: string; files?: Record<string, string>; commands?: string[] } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    try {
      setPlain(localStorage.getItem("sq-plain-editor") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Re-fetch hints already opened in this attempt so a reload doesn't hide them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const got: string[] = [];
      for (let i = 0; i < initial.hintsUsed; i++) {
        const r = await api<{ hint: string }>(`/api/attempts/${initial.id}/hint`, { body: { index: i } }).catch(() => null);
        if (r) got.push(r.hint);
      }
      if (!cancelled) setHints(got);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id, initial.hintsUsed]);

  // ------------------------------------------------------------ draft autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback(
    (draft: Record<string, unknown>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(() => {
        api(`/api/attempts/${attempt.id}/draft`, { body: { draft } })
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, 1200);
    },
    [attempt.id],
  );

  // ------------------------------------------------------------ code state
  const starterFiles = useMemo(() => (ws.kind === "python" || ws.kind === "javascript" ? Object.fromEntries(ws.files.map((f) => [f.path, f.content])) : {}), [ws]);
  const [files, setFiles] = useState<Record<string, string>>(() => {
    const d = initial.draft as { files?: Record<string, string> } | null;
    return { ...starterFiles, ...(d?.files ?? {}) };
  });
  const [activeFile, setActiveFile] = useState(ws.kind === "python" || ws.kind === "javascript" ? ws.entry : ws.kind === "evidence" ? ws.files[0].path : "");
  const [output, setOutput] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<"run" | "test" | null>(null);
  const [pyState, setPyState] = useState(ws.kind === "python" ? sandbox().pythonState : "ready");

  useEffect(() => {
    if (ws.kind !== "python") return;
    const off = sandbox().onStatus((s) => setPyState(s.state));
    void sandbox().warmPython();
    return () => {
      off();
    };
  }, [ws.kind]);

  // ------------------------------------------------------------ shell state
  const simRef = useRef<Simulation | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [lines, setLines] = useState<TermLine[]>([]);
  const [shellTab, setShellTab] = useState<"terminal" | string>("terminal");
  const [editorText, setEditorText] = useState<Record<string, string>>({});
  const [, force] = useState(0);

  useEffect(() => {
    if (ws.kind !== "shell") return;
    const sim = new Simulation(ws.scenario);
    const saved = ((initial.draft as { events?: SimEvent[] } | null)?.events ?? []).filter((e) => e.t !== "reset");
    const restored: TermLine[] = [];
    for (const e of saved) {
      if (e.t === "cmd") {
        const p = sim.prompt();
        const r = sim.exec(e.line);
        if (r.clear) restored.length = 0;
        else {
          restored.push({ kind: "cmd", text: e.line, prompt: p });
          if (r.stdout) restored.push({ kind: "out", text: r.stdout.replace(/\n$/, "") });
          if (r.stderr) restored.push({ kind: "err", text: r.stderr.replace(/\n$/, ""), unsupported: r.unsupported });
        }
      } else if (e.t === "write") {
        sim.writeFile(e.path, e.content); // best-effort; the server replays authoritatively
      }
    }
    if (saved.length) restored.push({ kind: "info", text: `Restored your previous session (${saved.length} step${saved.length === 1 ? "" : "s"}).` });
    simRef.current = sim;
    setEvents(saved);
    setLines(restored);
    setEditorText(Object.fromEntries(ws.scenario.editableFiles?.map((p) => [p, sim.readFile(p) ?? ""]) ?? []));
    force((n) => n + 1);
  }, [ws, initial.draft]);

  const pushEvent = (e: SimEvent) => {
    setEvents((prev) => {
      const next = [...prev, e].slice(-600);
      queueSave({ events: next });
      return next;
    });
  };

  const resetWorkspace = () => {
    if (!confirm("Reset the workspace to its starting state? Your changes in this attempt will be discarded (hints stay revealed).")) return;
    setChecks(null);
    setOutput(null);
    if (ws.kind === "shell") {
      simRef.current = new Simulation(ws.scenario);
      setEvents([]);
      setLines([{ kind: "info", text: "Lab reset to its starting state." }]);
      setEditorText(Object.fromEntries(ws.scenario.editableFiles?.map((p) => [p, simRef.current!.readFile(p) ?? ""]) ?? []));
      setShellTab("terminal");
      queueSave({ events: [] });
    } else if (ws.kind === "python" || ws.kind === "javascript") {
      setFiles(starterFiles);
      queueSave({ files: starterFiles });
      if (ws.kind === "python") void sandbox().reset();
    }
  };

  // ------------------------------------------------------------ actions
  const showHint = async () => {
    setHintBusy(true);
    try {
      const r = await api<{ hint: string; hintsUsed: number }>(`/api/attempts/${attempt.id}/hint`, { body: { index: hints.length } });
      setHints((h) => [...h, r.hint]);
      setAttempt((a) => ({ ...a, hintsUsed: r.hintsUsed }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the hint.");
    } finally {
      setHintBusy(false);
    }
  };

  const runCode = async (mode: "run" | "test") => {
    if (ws.kind !== "python" && ws.kind !== "javascript") return;
    setRunning(mode);
    setError(null);
    const result = await sandbox().run({
      id: uid(),
      lang: ws.kind,
      mode,
      files,
      entry: ws.entry,
      tests: mode === "test" ? ws.tests.map((t) => ({ id: t.id, code: t.code })) : [],
      timeoutMs: ws.timeoutMs,
      exports: ws.exports,
      html: ws.html,
    });
    setOutput(result);
    setRunning(null);
    if (mode === "test") await submitPractical({ kind: "code", files, results: result.tests });
  };

  const submitPractical = async (payload: unknown) => {
    setChecking(true);
    try {
      const r = await api<{ passed: boolean; checks: CheckView[]; failedChecks: number }>(`/api/attempts/${attempt.id}/practical`, { body: { payload, idempotencyKey: uid() } });
      setChecks(r.checks);
      setAttempt((a) => ({ ...a, practicalPassed: a.practicalPassed || r.passed, failedChecks: r.failedChecks }));
      if (r.passed) setMobileTab("questions");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't check your work.");
    } finally {
      setChecking(false);
    }
  };

  const checkShell = () => submitPractical({ kind: "shell", events });

  const answer = async (qid: string, a: Answer) => {
    try {
      const r = await api<GradeView>(`/api/attempts/${attempt.id}/answer`, { body: { questionId: qid, answer: a } });
      setGrades((g) => ({ ...g, [qid]: { ...r, correct: r.correct || !!g[qid]?.correct } }));
      setAttempt((at) => ({ ...at, questionResults: { ...at.questionResults, [qid]: { correct: r.correct || !!at.questionResults[qid]?.correct, score: r.score ?? 0, tries: r.tries ?? 1 } } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't check that answer.");
    }
  };

  const openRefresher = async () => {
    try {
      const r = await api<{ refresher: { body: string; practice: Question } }>(`/api/attempts/${attempt.id}/refresher`, { body: {} });
      setRefresher(r.refresher);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the refresher.");
    }
  };

  const openSolution = async () => {
    if (!confirm("See the full solution? You can still finish the mission; it will count as completed with support.")) return;
    try {
      setSolution(await api(`/api/attempts/${attempt.id}/solution`, { body: {} }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the solution.");
    }
  };

  const questionsDone = mission.questions.every((q) => {
    const r = attempt.questionResults[q.id];
    return ws.kind === "evidence" ? r?.correct : r && (r.correct || r.tries >= 2);
  });
  const practicalDone = ws.kind === "evidence" || attempt.practicalPassed;
  const canFinish = practicalDone && questionsDone;

  const finish = async () => {
    setFinishing(true);
    try {
      await api(`/api/attempts/${attempt.id}/complete`, { body: {} });
      router.push(`/missions/${mission.slug}/debrief?attempt=${attempt.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't finish the mission.");
      setFinishing(false);
    }
  };

  const struggling = attempt.failedChecks >= 2 || Object.values(attempt.questionResults).some((r) => !r.correct && r.tries >= 2);

  // ------------------------------------------------------------ render pieces
  const left = (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Mission information" className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2">
        {(
          [
            ["brief", "Brief"],
            ["concept", "Concept"],
            ...(mission.workedExample ? [["example", "Worked example"]] : []),
            ["criteria", "Success criteria"],
          ] as [typeof leftTab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={leftTab === k}
            onClick={() => setLeftTab(k)}
            className={cn("shrink-0 rounded-t-md border-b-2 px-2.5 py-1.5 text-sm", leftTab === k ? "border-primary text-text" : "border-transparent text-muted hover:text-text")}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4">
        {leftTab === "brief" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs text-faint">
                <span className="font-mono">{mission.brief.channel}</span> · from <span className="text-muted">{mission.brief.from}</span>
              </p>
              <div className="prose-sq mt-1.5" dangerouslySetInnerHTML={{ __html: mission.brief.html }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">You&apos;ll be able to</h3>
              <ul className="mt-1.5 space-y-1 text-sm text-muted">
                {mission.objectives.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span aria-hidden className="text-primary">▸</span>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
            {mission.appliesSkills.length > 0 && (
              <p className="text-xs text-faint">Uses earlier skills without re-teaching them: {mission.appliesSkills.map((s) => s.name).join(", ")}.</p>
            )}
            {mission.simulationNote && (
              <div className="rounded-lg border border-net/30 bg-net/5 p-3 text-xs text-muted">
                <p className="mb-0.5 font-semibold text-text">What&apos;s simulated here</p>
                {mission.simulationNote}
              </div>
            )}
            <button className="btn-secondary text-xs" onClick={() => setLeftTab("concept")}>
              <BookOpen size={14} aria-hidden /> Read the concept
            </button>
          </div>
        )}
        {leftTab === "concept" && (
          <div>
            <h3 className="mb-1 font-semibold">{mission.concept.title}</h3>
            <div className="prose-sq" dangerouslySetInnerHTML={{ __html: mission.concept.html }} />
          </div>
        )}
        {leftTab === "example" && mission.workedExample && (
          <div>
            <h3 className="mb-1 font-semibold">{mission.workedExample.title}</h3>
            <div className="prose-sq" dangerouslySetInnerHTML={{ __html: mission.workedExample.html }} />
          </div>
        )}
        {leftTab === "criteria" && (
          <ul className="space-y-2 text-sm">
            {mission.successCriteria.map((c) => (
              <li key={c} className="flex gap-2">
                <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
      <HintPanel hints={hints} total={mission.hintCount} onShow={showHint} busy={hintBusy} />
    </div>
  );

  const checksPanel = checks && (
    <section aria-label="Check results" className="space-y-2">
      <p className={cn("flex items-center gap-1.5 text-sm font-semibold", checks.every((c) => c.pass) ? "text-success" : "text-warning")}>
        {checks.every((c) => c.pass) ? <Check size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
        {checks.filter((c) => c.pass).length} of {checks.length} checks passed
      </p>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className={cn("rounded-lg border p-2.5 text-sm", c.pass ? "border-success/30" : "border-warning/40 bg-warning/5")}>
            <p className="flex items-start gap-1.5">
              {c.pass ? <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-success" /> : <X size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />}
              <span>
                <span className="sr-only">{c.pass ? "Passed: " : "Failed: "}</span>
                {c.name}
              </span>
            </p>
            {!c.pass && c.feedback && (
              <dl className="mt-1.5 space-y-1 pl-5 text-[13px]">
                <div>
                  <dt className="inline font-semibold">What happened: </dt>
                  <dd className="inline text-muted">{c.feedback.what}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Why it matters: </dt>
                  <dd className="inline text-muted">{c.feedback.why}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Try next: </dt>
                  <dd className="inline text-muted">{c.feedback.next}</dd>
                </div>
                {c.detail && c.detail !== "passed" && <p className="font-mono text-[12px] text-faint">{c.detail}</p>}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  let workArea: React.ReactNode = null;
  if (ws.kind === "python" || ws.kind === "javascript") {
    const file = ws.files.find((f) => f.path === activeFile);
    workArea = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5" role="tablist" aria-label="Files">
          {ws.files.map((f) => (
            <button
              key={f.path}
              role="tab"
              aria-selected={activeFile === f.path}
              onClick={() => setActiveFile(f.path)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs", activeFile === f.path ? "bg-surface-3 text-text" : "text-muted hover:text-text")}
            >
              <FileText size={13} aria-hidden />
              {f.path}
              {!f.editable && <span className="text-[10px] text-faint">read-only</span>}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pl-2">
            <label className="flex items-center gap-1 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={plain}
                onChange={(e) => {
                  setPlain(e.target.checked);
                  try {
                    localStorage.setItem("sq-plain-editor", e.target.checked ? "1" : "0");
                  } catch {
                    /* ignore */
                  }
                }}
              />
              Plain editor
            </label>
          </div>
        </div>
        <div className="min-h-[280px] flex-1 overflow-hidden">
          <CodeEditor
            key={activeFile + (plain ? "-plain" : "")}
            value={files[activeFile] ?? ""}
            onChange={(v) => {
              if (!file?.editable) return;
              setFiles((f) => {
                const next = { ...f, [activeFile]: v };
                queueSave({ files: Object.fromEntries(ws.files.filter((x) => x.editable).map((x) => [x.path, next[x.path]])) });
                return next;
              });
            }}
            language={activeFile.endsWith(".py") ? "python" : activeFile.endsWith(".js") || activeFile.endsWith(".json") ? "javascript" : "text"}
            readOnly={!file?.editable}
            plain={plain}
            label={`${activeFile}${file?.editable ? "" : " (read-only)"}`}
            theme={theme}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-2">
          <button className="btn-secondary" onClick={() => void runCode("run")} disabled={!!running || (ws.kind === "python" && pyState === "error")}>
            <Play size={15} aria-hidden /> {running === "run" ? "Running…" : "Run"}
          </button>
          <button className="btn-primary" onClick={() => void runCode("test")} disabled={!!running || checking}>
            <ShieldCheck size={15} aria-hidden /> {running === "test" || checking ? "Checking…" : "Check my work"}
          </button>
          {ws.kind === "python" && pyState !== "ready" && (
            <span className="text-xs text-muted" role="status">
              {pyState === "loading" ? "Loading Python (first time takes a few seconds)…" : pyState === "error" ? "Python failed to load. Check your connection and reload." : "Python starts on first run."}
            </span>
          )}
          <span className="ml-auto text-[11px] text-faint">Time limit {ws.timeoutMs / 1000}s · runs in an isolated sandbox</span>
        </div>
        <div className="max-h-[42%] min-h-[120px] overflow-y-auto border-t border-border bg-code p-3">
          <OutputView result={output} />
          {checksPanel && <div className="mt-3">{checksPanel}</div>}
          {!output && !checks && <p className="text-xs text-faint">Run prints your program&apos;s output. Check my work runs the mission checks{ws.tests.some((t) => t.hidden) ? " (including hidden edge cases)" : ""}.</p>}
        </div>
      </div>
    );
  } else if (ws.kind === "shell" && simRef.current) {
    const editable = ws.scenario.editableFiles ?? [];
    workArea = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5" role="tablist" aria-label="Lab views">
          <button role="tab" aria-selected={shellTab === "terminal"} onClick={() => setShellTab("terminal")} className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs", shellTab === "terminal" ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
            <TerminalSquare size={13} aria-hidden /> Terminal
          </button>
          {editable.map((p) => (
            <button key={p} role="tab" aria-selected={shellTab === p} onClick={() => setShellTab(p)} className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs", shellTab === p ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
              <FileText size={13} aria-hidden /> {p}
            </button>
          ))}
          <span className="ml-auto shrink-0 pl-2 text-[11px] text-faint">Simulated lab · {ws.scenario.hosts.length} host{ws.scenario.hosts.length === 1 ? "" : "s"}</span>
        </div>
        <div className="min-h-[300px] flex-1 overflow-hidden">
          {shellTab === "terminal" ? (
            <Terminal sim={simRef.current} lines={lines} setLines={setLines} onCommand={(line) => pushEvent({ t: "cmd", line })} starterCommands={ws.starterCommands} />
          ) : (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <CodeEditor value={editorText[shellTab] ?? ""} onChange={(v) => setEditorText((t) => ({ ...t, [shellTab]: v }))} language={shellTab.endsWith(".py") ? "python" : "text"} plain={plain} label={`Editing ${shellTab}`} theme={theme} />
              </div>
              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const r = simRef.current!.writeFile(shellTab, editorText[shellTab] ?? "");
                    if (!r.ok) {
                      setError(`Couldn't save: ${r.error ?? "unknown error"}`);
                      return;
                    }
                    pushEvent({ t: "write", path: shellTab, content: editorText[shellTab] ?? "" });
                    setLines((l) => [...l, { kind: "info", text: `Saved ${shellTab}` }]);
                    setShellTab("terminal");
                  }}
                >
                  Save file
                </button>
                <span className="text-xs text-faint">Saving writes the file into the simulated host as your user.</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-2">
          <button className="btn-primary" onClick={() => void checkShell()} disabled={checking}>
            <ShieldCheck size={15} aria-hidden /> {checking ? "Checking…" : "Check my work"}
          </button>
          <span className="text-[11px] text-faint">The server replays your {events.length} step{events.length === 1 ? "" : "s"} in a fresh copy of the lab to grade it.</span>
        </div>
        {checksPanel && <div className="max-h-[40%] overflow-y-auto border-t border-border bg-code p-3">{checksPanel}</div>}
      </div>
    );
  } else if (ws.kind === "evidence") {
    const f = ws.files.find((x) => x.path === activeFile) ?? ws.files[0];
    workArea = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5" role="tablist" aria-label="Evidence files">
          {ws.files.map((x) => (
            <button key={x.path} role="tab" aria-selected={f.path === x.path} onClick={() => setActiveFile(x.path)} className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs", f.path === x.path ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
              <FileText size={13} aria-hidden /> {x.path}
            </button>
          ))}
        </div>
        <pre tabIndex={0} aria-label={`Contents of ${f.path}`} className="min-h-[300px] flex-1 overflow-auto bg-code p-3 font-mono text-[12.5px] leading-relaxed">
          {f.content}
        </pre>
        <p className="border-t border-border bg-surface px-3 py-2 text-xs text-faint">Read-only evidence. Answer the investigation questions to complete this mission.</p>
      </div>
    );
  }

  const questions = (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Mission questions</h2>
        <span className="text-xs text-muted">
          {mission.questions.filter((q) => attempt.questionResults[q.id]?.correct).length}/{mission.questions.length} correct
        </span>
      </div>
      {!practicalDone && <p className="text-xs text-faint">You can answer these any time; many are easier after the hands-on part.</p>}
      {mission.questions.map((q, i) => (
        <div key={q.id} className="card p-4">
          <QuestionCard q={q as ClientQuestion} promptHtml={q.promptHtml} label={`Question ${i + 1}`} grade={grades[q.id]} onSubmit={(a) => answer(q.id, a)} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-0px)] min-h-0 flex-col max-md:h-auto">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2.5">
        <Link href={`/paths/${mission.track}`} className="btn-ghost -ml-2 px-2 py-1" aria-label="Back to learning path">
          <ChevronLeft size={18} aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold">{mission.title}</h1>
          <div className="mt-0.5 flex items-center gap-1.5">
            <TrackPill track={mission.track} />
            <TierBadge tier={mission.tier} />
            <span className="text-xs text-faint">~{mission.minutes} min</span>
          </div>
        </div>
        <ol className="mx-auto hidden items-center gap-2 text-xs lg:flex" aria-label="Mission progress">
          <Step done={practicalDone} label={ws.kind === "evidence" ? "Investigate" : "Hands-on checks"} />
          <span aria-hidden className="text-faint">→</span>
          <Step done={questionsDone} label="Questions" />
          <span aria-hidden className="text-faint">→</span>
          <Step done={false} label="Debrief" />
        </ol>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[11px] text-faint sm:inline" role="status" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : saveState === "error" ? "Draft not saved — will retry on next change" : ""}
          </span>
          {ws.kind !== "evidence" && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={resetWorkspace} title="Reset workspace">
              <RotateCcw size={14} aria-hidden /> <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openChat({ missionSlug: mission.slug })}>
            <MessagesSquare size={14} aria-hidden /> <span className="hidden sm:inline">Discuss</span>
          </button>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={!canFinish || finishing} onClick={() => void finish()} title={canFinish ? "" : "Pass the checks and answer the questions to finish"}>
            {finishing ? "Finishing…" : "Finish mission"}
          </button>
        </div>
      </div>

      {(previouslyCompleted || raceId) && (
        <div className="border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-muted">
          {raceId ? "Race mode: your time runs from when you joined. Racing is optional and doesn't affect mastery." : "You've completed this mission before. This run is practice — mission XP isn't awarded again, though an independent solve can upgrade earlier supported credit."}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-2 border-b border-danger/40 bg-danger/10 px-4 py-1.5 text-sm">
          {error}
          <button className="text-xs underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Struggle support */}
      {struggling && !refresher && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/8 px-4 py-2 text-sm">
          <Lightbulb size={16} aria-hidden className="text-primary" />
          <span>Stuck? A short refresher and a simpler practice question can help before you try again.</span>
          <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void openRefresher()}>
            Open refresher
          </button>
          {attempt.failedChecks >= 3 && !solution && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void openSolution()}>
              Show solution
            </button>
          )}
        </div>
      )}
      {refresher && (
        <div className="border-b border-border bg-surface-2 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Refresher</h2>
              <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setRefresher(null)}>
                Close
              </button>
            </div>
            <p className="text-sm whitespace-pre-wrap text-muted">{refresher.body}</p>
            <div className="mt-3 card p-3">
              <QuestionCard
                q={{ ...(refresher.practice as unknown as ClientQuestion) }}
                label="Simpler practice"
                grade={practiceGrade}
                onSubmit={(a) => {
                  const g = gradeQuestion(refresher.practice, a);
                  setPracticeGrade({ ...g, explanation: refresher.practice.explanation });
                }}
              />
            </div>
          </div>
        </div>
      )}
      {solution && (
        <div className="max-h-72 overflow-y-auto border-b border-border bg-surface-2 px-4 py-3 text-sm">
          <h2 className="mb-1 font-semibold">Solution walkthrough</h2>
          <p className="whitespace-pre-wrap text-muted">{solution.explanation}</p>
          {solution.commands && <pre className="mt-2 rounded border border-border bg-code p-2 font-mono text-xs">{solution.commands.join("\n")}</pre>}
          {solution.files &&
            Object.entries(solution.files).map(([p, c]) => (
              <details key={p} className="mt-2">
                <summary className="cursor-pointer font-mono text-xs">{p}</summary>
                <pre className="mt-1 overflow-x-auto rounded border border-border bg-code p-2 font-mono text-xs">{c}</pre>
              </details>
            ))}
        </div>
      )}

      {/* Mobile tabs */}
      <div role="tablist" aria-label="Workspace sections" className="flex border-b border-border md:hidden">
        {(["brief", "work", "questions"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)} className={cn("flex-1 py-2 text-sm capitalize", mobileTab === t ? "border-b-2 border-primary text-text" : "text-muted")}>
            {t === "work" ? (ws.kind === "evidence" ? "Evidence" : "Workspace") : t}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(300px,380px)_1fr] xl:grid-cols-[minmax(320px,400px)_1fr_minmax(320px,400px)]">
        <aside className={cn("min-h-0 border-r border-border bg-surface max-md:min-h-[60vh]", mobileTab !== "brief" && "max-md:hidden")}>{left}</aside>
        <section aria-label="Workspace" className={cn("min-h-0 min-w-0", mobileTab !== "work" && "max-md:hidden")}>
          {workArea}
          <div className="hidden overflow-y-auto border-t border-border md:block xl:hidden">{questions}</div>
        </section>
        <aside aria-label="Questions" className={cn("min-h-0 overflow-y-auto border-l border-border md:hidden xl:block", mobileTab === "questions" && "max-md:block")}>
          {questions}
          {canFinish && (
            <div className="p-4 pt-0">
              <button className="btn-primary w-full" onClick={() => void finish()} disabled={finishing}>
                {finishing ? "Finishing…" : "Finish mission and see the debrief"}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5", done ? "border-success/50 text-success" : "border-border text-muted")}>
      {done ? <Check size={12} aria-hidden /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
      <span className="sr-only">{done ? " (done)" : " (not done yet)"}</span>
    </li>
  );
}

function HintPanel({ hints, total, onShow, busy }: { hints: string[]; total: number; onShow: () => void; busy: boolean }) {
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Lightbulb size={15} aria-hidden className="text-js" /> Hints
          <span className="font-normal text-faint">
            {hints.length}/{total}
          </span>
        </h3>
        {hints.length < total && (
          <button className="btn-secondary px-2 py-1 text-xs" onClick={onShow} disabled={busy}>
            {busy ? "Loading…" : hints.length ? "Next hint" : "Show a hint"}
          </button>
        )}
      </div>
      {hints.length === 0 && <p className="mt-1 text-xs text-faint">Hints get more specific as you go. Using two or more marks this run &quot;with support&quot; — it still counts as progress.</p>}
      <ol className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {hints.map((h, i) => (
          <li key={i} className="rounded-md bg-surface-2 p-2 text-[13px]">
            <span className="mr-1 font-semibold text-faint">{i + 1}.</span>
            <span className="whitespace-pre-wrap">{h}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OutputView({ result }: { result: RunResult | null }) {
  if (!result) return null;
  return (
    <div className="font-mono text-[12.5px]" role="status" aria-live="polite">
      <p className={cn("mb-1 text-[11px] uppercase tracking-wide", result.status === "ok" ? "text-faint" : "text-warning")}>
        {result.status === "ok" ? `Finished in ${result.durationMs} ms` : result.status === "timeout" ? "Stopped: time limit" : result.status === "error" ? "Error" : "Runtime crashed"}
      </p>
      {result.stdout && <pre className="whitespace-pre-wrap text-text/90">{result.stdout}</pre>}
      {result.stderr && <pre className="mt-1 whitespace-pre-wrap text-danger">{result.stderr}</pre>}
      {!result.stdout && !result.stderr && result.status === "ok" && <p className="text-faint">(no output)</p>}
    </div>
  );
}
