import { describe, expect, it } from "vitest";
import { Simulation, gradeEvents, evaluateAssertion, type SimEvent } from "../../src/sim";
import { netScenario, webScenario } from "./fixtures";

const LINES = [
  "cd /tmp",
  "mkdir work && cd work",
  "echo hello > a.txt",
  "for i in 1 2 3; do echo line$i >> a.txt; done",
  "sudo chmod -R o+rX /etc/app",
  "sudo chmod 777 /var/log/app",
  "sudo systemctl start app",
  "cat a.txt | wc -l",
];

describe("snapshot / determinism", () => {
  it("roundtrips through JSON and continues identically", () => {
    const a = new Simulation(webScenario());
    for (const l of LINES.slice(0, 4)) a.exec(l);
    const snap = a.snapshot();
    const json = JSON.stringify(snap);
    const b = Simulation.fromSnapshot(JSON.parse(json));
    expect(b.cwd).toBe("/tmp/work");
    expect(b.prompt()).toBe(a.prompt());
    const outsA = LINES.slice(4).map((l) => a.exec(l));
    const outsB = LINES.slice(4).map((l) => b.exec(l));
    expect(outsB).toEqual(outsA);
    expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
  });

  it("two runs of the same events produce identical output and state", () => {
    const run = () => {
      const s = new Simulation(netScenario());
      const outs = ["ping -c 3 10.0.2.80", "date", "ls -l /etc", "ps aux", "echo $RANDOM $RANDOM", "ip addr"].map((l) => s.exec(l));
      return { outs, snap: JSON.stringify(s.snapshot()) };
    };
    expect(run()).toEqual(run());
  });

  it("clock advances one second per command", () => {
    const s = new Simulation(webScenario());
    expect(s.exec("date").stdout).toBe("Mon Mar  2 09:15:01 UTC 2026\n");
    expect(s.exec("date +%T").stdout).toBe("09:15:02\n");
  });

  it("clone is independent", () => {
    const a = new Simulation(webScenario());
    const b = a.clone();
    b.exec("touch x");
    expect(a.exec("ls x").exitCode).toBe(2);
    expect(b.exec("ls x").exitCode).toBe(0);
  });
});

describe("gradeEvents", () => {
  const checks = [
    { id: "svc", assert: { type: "service_state" as const, service: "app", state: "active" as const } },
    { id: "file", assert: { type: "file_matches" as const, path: "/tmp/work/a.txt", pattern: "^line3$" } },
    { id: "lines", assert: { type: "command_output" as const, run: "wc -l < /tmp/work/a.txt", pattern: "^4$", expectExit: 0 } },
    { id: "hist", assert: { type: "history_matches" as const, pattern: "systemctl\\s+start" } },
    { id: "mode", assert: { type: "mode_max" as const, path: "/var/log/app", max: "0755" } },
    { id: "combo", assert: { type: "all" as const, of: [{ type: "file_exists" as const, path: "/tmp/work" }, { type: "not" as const, of: { type: "file_exists" as const, path: "/tmp/nope" } }] } },
  ];

  it("replays the event log and grades final state", () => {
    const events: SimEvent[] = LINES.map((line) => ({ t: "cmd", line }));
    const { results, finalSim } = gradeEvents(webScenario(), events, checks);
    expect(results.map((r) => [r.id, r.pass])).toEqual([
      ["svc", true],
      ["file", true],
      ["lines", true],
      ["hist", true],
      ["mode", false],
      ["combo", true],
    ]);
    expect(results.find((r) => r.id === "mode")!.detail).toBe("web-01: /var/log/app has mode 0777 (exceeds 0755 by 0022)");
    expect(finalSim.cwd).toBe("/tmp/work");
  });

  it("empty event log fails checks; command_output does not mutate final state", () => {
    const { results, finalSim } = gradeEvents(webScenario(), [], checks);
    expect(results.filter((r) => r.pass).map((r) => r.id)).toEqual(["mode"]);
    const snap = JSON.stringify(finalSim.snapshot());
    evaluateAssertion(finalSim, { type: "command_output", run: "touch /tmp/side-effect", pattern: "", setup: ["cd /tmp"] });
    expect(JSON.stringify(finalSim.snapshot())).toBe(snap);
  });

  it("handles write and reset events", () => {
    const events: SimEvent[] = [
      { t: "cmd", line: "touch junk" },
      { t: "reset" },
      { t: "write", path: "/home/dev/fixed.conf", content: "ok=1\n" },
      { t: "write", path: "/etc/blocked.conf", content: "nope\n" },
    ];
    const { results } = gradeEvents(webScenario(), events, [
      { id: "junk", assert: { type: "file_absent", path: "/home/dev/junk" } },
      { id: "fixed", assert: { type: "file_matches", path: "/home/dev/fixed.conf", pattern: "ok=1" } },
      { id: "blocked", assert: { type: "file_absent", path: "/etc/blocked.conf" } },
    ]);
    expect(results.every((r) => r.pass)).toBe(true);
  });
});
