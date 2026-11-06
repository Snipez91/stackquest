import type { MissionInput } from "@/content/schema";

const F = "```";

const syncScript = `#!/bin/bash
# eta-sync.sh v2 — pushes ETA updates from the route planner to the tracking DB.
# Environment:
#   TRACKING_DB_HOST  required
#   TRACKING_DB_PORT  optional, default 5432
#   ETA_REGION        required (v1 called this REGION; renamed in v2)
if [ -z "$TRACKING_DB_HOST" ]; then
  echo "eta-sync: TRACKING_DB_HOST is not set" >&2
  exit 78
fi
if [ -z "$ETA_REGION" ]; then
  echo "eta-sync: ETA_REGION is not set" >&2
  exit 78
fi
echo "eta-sync: connecting to $TRACKING_DB_HOST:\${TRACKING_DB_PORT:-5432} region=$ETA_REGION"
echo "eta-sync: pushed 128 ETA updates"
`;

const wrapper = `#!/bin/bash
# run-eta-sync — what cron runs every 15 minutes (as user etasync):
#   */15 * * * * etasync /opt/lumen/bin/run-eta-sync >> /var/log/lumen/eta-sync.log 2>&1
# Loads the settings file, then starts the sync as a separate process.
. /etc/lumen/eta-sync.env
bash /opt/lumen/bin/eta-sync.sh
`;

const envFile = `# eta-sync settings — loaded by /opt/lumen/bin/run-eta-sync
TRACKING_DB_HOST=db-01.lumen.internal
export TRACKING_DB_PORT=5432
export REGION=emea
`;

const fixedEnv = `# eta-sync settings — loaded by /opt/lumen/bin/run-eta-sync
export TRACKING_DB_HOST=db-01.lumen.internal
export TRACKING_DB_PORT=5432
export ETA_REGION=emea
`;

const cronLog = `2026-03-02 08:00:01 eta-sync: TRACKING_DB_HOST is not set
2026-03-02 08:15:01 eta-sync: TRACKING_DB_HOST is not set
2026-03-02 08:30:01 eta-sync: TRACKING_DB_HOST is not set
2026-03-02 08:45:01 eta-sync: TRACKING_DB_HOST is not set
2026-03-02 09:00:01 eta-sync: TRACKING_DB_HOST is not set
`;

const marcoNote = `Marco's notes (ops-ws), Fri:
- upgraded eta-sync to v2 (release notes: REGION renamed to ETA_REGION)
- tested by hand:
    $ export TRACKING_DB_HOST=db-01.lumen.internal ETA_REGION=emea
    $ bash /opt/lumen/bin/eta-sync.sh
    eta-sync: connecting to db-01.lumen.internal:5432 region=emea   <- works!
- cron uses /opt/lumen/bin/run-eta-sync + /etc/lumen/eta-sync.env (didn't touch those)
`;

export const lxEtaSyncEnv: MissionInput = {
  slug: "lx-eta-sync-env",
  version: 1,
  track: "linux",
  tier: "intermediate",
  order: 4,
  title: "It works in my terminal but not from cron",
  summary:
    "A sync job sees no database host when cron runs it, though it works by hand. Tell shell variables from exported environment variables, fix a renamed variable, and persist settings where the job reads them.",
  minutes: 25,
  assessmentTypes: ["repair-code", "investigate-logs", "explain-root-cause"],
  skills: ["lx.environment"],
  appliesSkills: ["lx.processes", "lx.file-ops"],
  prerequisites: ["lx-deploy-group-access"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#route-planning",
    body: `Help — dispatch says ETAs on the tracking page haven't moved since Friday. I upgraded \`eta-sync\` to v2 on \`ops-ws\` on Friday and tested it by hand, and it worked (see \`/home/marco/NOTES.txt\`). But every cron run since then logs \`TRACKING_DB_HOST is not set\` (\`/var/log/lumen/eta-sync.log\`).

Cron runs \`/opt/lumen/bin/run-eta-sync\` as the \`etasync\` user, which loads \`/etc/lumen/eta-sync.env\` and then runs the script. You're in the \`lumen\` group, so you can edit the env file (it's open in the editor).

Please fix it so a **fresh** run of \`run-eta-sync\` — not one in a shell where you've already exported things — connects to \`db-01.lumen.internal:5432\` in region \`emea\`. Please don't edit the vendor scripts in \`/opt/lumen/bin\`.`,
  },
  objectives: [
    "Explain the difference between a shell variable and an exported environment variable",
    "Predict which variables a child process (a script started with bash) inherits",
    "Use env, printenv and echo to inspect what a process will see",
    "Persist settings in the file the job actually reads, rather than in an interactive shell or ~/.bashrc",
  ],
  concept: {
    title: "Variables live in a process; only exported ones are inherited",
    body: `Every process has its own **environment**: a list of \`NAME=value\` strings it received when it started. A shell also has **shell variables** that exist only inside that shell.

${F}bash
DB=db-01              # shell variable: visible here, NOT passed to children
export DB=db-01       # environment variable: copied into every child process
bash other.sh         # child: sees exported variables only
${F}

Inheritance is a **copy at start-up**, one way: a child can't change its parent's variables, and changes in your terminal don't reach processes started elsewhere.

\`source FILE\` (or \`. FILE\`) runs FILE **inside the current shell**, so its assignments land in the current shell — exported only if the file says \`export\`. A wrapper that sources an env file and then runs \`bash script.sh\` passes on only the exported names.

Where to persist settings depends on **who starts the process**:

| Started by | Reads |
| --- | --- |
| your interactive bash | \`~/.bashrc\` (and \`~/.profile\` at login) |
| cron | its own minimal environment — *not* your \`.bashrc\` |
| systemd | the unit's \`Environment=\` / \`EnvironmentFile=\` |
| a wrapper script | whatever file it sources |

"It works in my terminal" usually means your shell has a variable the real runner never sees. Inspect with \`printenv NAME\` (exported only) vs \`echo $NAME\` (shell or exported).`,
  },
  workedExample: {
    title: "Worked example: the label printer can't find its printer",
    body: `\`print-labels.sh\` uses \`$LABEL_PRINTER\`. Aiko's systemd timer runs \`/opt/labels/run.sh\`, which does \`. /etc/labels.env\` and then \`bash print-labels.sh\`. It fails with *LABEL_PRINTER is not set*, but works in Aiko's terminal.

**1. Reproduce in a clean shell, not your own.**

${F}bash
bash /opt/labels/run.sh          # a fresh bash: nothing inherited from your exports
# print-labels: LABEL_PRINTER is not set
${F}

**2. Look at what the env file actually does.**

${F}bash
cat /etc/labels.env
# LABEL_PRINTER=zebra-brs-2       <- assigned, never exported
bash -c '. /etc/labels.env; echo "shell=$LABEL_PRINTER"; printenv LABEL_PRINTER || echo "not exported"'
# shell=zebra-brs-2
# not exported
${F}

**3. Fix the file the runner reads, then re-test fresh.**

${F}bash
sudo sed -i 's/^LABEL_PRINTER=/export LABEL_PRINTER=/' /etc/labels.env
bash /opt/labels/run.sh          # printed to zebra-brs-2
${F}

Putting \`export LABEL_PRINTER=...\` in Aiko's \`~/.bashrc\` would only have made *her terminal* work — exactly the situation we started from.`,
  },
  simulationNote:
    "Shell and environment variables, export, source and child processes are simulated faithfully: a script run with bash receives only exported variables. cron itself does not run in the lab; the checks start a brand-new session (no variables from your terminal) and run the wrapper the way cron would. The simulated login shell does not read ~/.bashrc automatically, and neither does cron on a real server.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:10:00Z",
      hosts: [
        {
          name: "ops-ws",
          users: [
            { name: "ops", uid: 1000, groups: ["lumen"], home: "/home/ops" },
            { name: "marco", uid: 1001, groups: ["lumen"], home: "/home/marco" },
            { name: "etasync", uid: 990, groups: ["lumen"], home: "/var/lib/etasync", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/opt/lumen", type: "dir", mode: "0755" },
            { path: "/opt/lumen/bin", type: "dir", mode: "0755" },
            { path: "/opt/lumen/bin/eta-sync.sh", content: syncScript, mode: "0755" },
            { path: "/opt/lumen/bin/run-eta-sync", content: wrapper, mode: "0755" },
            { path: "/etc/lumen", type: "dir", mode: "0755" },
            { path: "/etc/lumen/eta-sync.env", content: envFile, mode: "0664", owner: "root", group: "lumen" },
            { path: "/var/log/lumen", type: "dir", mode: "0775", owner: "root", group: "lumen" },
            { path: "/var/log/lumen/eta-sync.log", content: cronLog, mode: "0664", owner: "etasync", group: "lumen" },
            { path: "/home/marco/NOTES.txt", content: marcoNote, owner: "marco", group: "marco" },
            { path: "/home/ops/.bashrc", content: "# ~/.bashrc: executed by bash for interactive shells\nalias ll='ls -l'\n", owner: "ops", group: "ops" },
          ],
        },
      ],
      start: { host: "ops-ws", user: "ops" },
      editableFiles: ["/etc/lumen/eta-sync.env"],
    },
    checks: [
      {
        id: "fresh-run-connects",
        name: "A fresh run of run-eta-sync as etasync connects with the right settings",
        assert: {
          type: "command_output",
          user: "etasync",
          cwd: "/",
          run: "bash /opt/lumen/bin/run-eta-sync",
          pattern: "^eta-sync: connecting to db-01\\.lumen\\.internal:5432 region=emea$",
          expectExit: 0,
        },
        feedback: {
          what: "Started in a brand-new session as etasync (like cron), bash /opt/lumen/bin/run-eta-sync does not print 'connecting to db-01.lumen.internal:5432 region=emea' and exit 0.",
          why: "Cron has none of the variables you exported in your terminal or put in ~/.bashrc. The script only sees what the wrapper's env file exports, and v2 reads ETA_REGION, not REGION.",
          next: "Reproduce it yourself with bash /opt/lumen/bin/run-eta-sync in a shell where you haven't exported anything. Then make /etc/lumen/eta-sync.env export TRACKING_DB_HOST and ETA_REGION.",
        },
      },
      {
        id: "env-file-exports",
        name: "Sourcing the env file exports TRACKING_DB_HOST and ETA_REGION",
        assert: {
          type: "command_output",
          user: "etasync",
          cwd: "/",
          run: "bash -c '. /etc/lumen/eta-sync.env; printenv TRACKING_DB_HOST; printenv ETA_REGION; printenv TRACKING_DB_PORT'",
          pattern: "^db-01\\.lumen\\.internal\\nemea\\n5432$",
        },
        feedback: {
          what: "After sourcing /etc/lumen/eta-sync.env, printenv does not show TRACKING_DB_HOST=db-01.lumen.internal, ETA_REGION=emea and TRACKING_DB_PORT=5432.",
          why: "printenv lists only exported variables — the ones a child process receives. A plain NAME=value line in a sourced file stays a shell variable.",
          next: "Write each line as export NAME=value in the env file (keep TRACKING_DB_PORT), and rename REGION to ETA_REGION.",
        },
      },
    ],
    solution: [
      "tail -n 3 /var/log/lumen/eta-sync.log",
      "cat /home/marco/NOTES.txt",
      "cat /opt/lumen/bin/run-eta-sync /etc/lumen/eta-sync.env",
      "bash /opt/lumen/bin/run-eta-sync",
      "bash -c '. /etc/lumen/eta-sync.env; echo \"shell: $TRACKING_DB_HOST\"; printenv TRACKING_DB_HOST || echo \"not exported\"'",
      { write: "/etc/lumen/eta-sync.env", content: fixedEnv },
      "bash /opt/lumen/bin/run-eta-sync",
    ],
    wrongSolutions: [
      {
        label: "Exports the variables in the current terminal only",
        steps: ["export TRACKING_DB_HOST=db-01.lumen.internal ETA_REGION=emea", "bash /opt/lumen/bin/run-eta-sync"],
      },
      {
        label: "Adds the exports to ~/.bashrc, which cron never reads",
        steps: [
          "echo 'export TRACKING_DB_HOST=db-01.lumen.internal' >> ~/.bashrc",
          "echo 'export ETA_REGION=emea' >> ~/.bashrc",
          "source ~/.bashrc",
          "bash /opt/lumen/bin/run-eta-sync",
        ],
      },
      {
        label: "Renames REGION but leaves TRACKING_DB_HOST unexported",
        steps: [{ write: "/etc/lumen/eta-sync.env", content: envFile.replace("export REGION=emea", "export ETA_REGION=emea") }],
      },
      {
        label: "Exports the host but sets ETA_REGION without export",
        steps: [
          {
            write: "/etc/lumen/eta-sync.env",
            content: "TRACKING_DB_HOST=db-01.lumen.internal\nexport TRACKING_DB_HOST\nexport TRACKING_DB_PORT=5432\nETA_REGION=emea\n",
          },
        ],
      },
    ],
    starterCommands: ["tail -n 3 /var/log/lumen/eta-sync.log", "cat /opt/lumen/bin/run-eta-sync", "cat /etc/lumen/eta-sync.env"],
  },
  successCriteria: [
    "A fresh run of run-eta-sync as etasync prints 'connecting to db-01.lumen.internal:5432 region=emea' and exits 0",
    "Sourcing /etc/lumen/eta-sync.env exports TRACKING_DB_HOST, ETA_REGION and TRACKING_DB_PORT",
  ],
  hints: [
    "Compare how Marco tested (`NOTES.txt`) with how cron runs it (the comment at the top of `run-eta-sync`). Which variables did Marco's shell have that cron's doesn't?",
    "Reproduce the cron failure: `bash /opt/lumen/bin/run-eta-sync` in a shell where you haven't exported anything. Then read `/etc/lumen/eta-sync.env` line by line: which lines say `export`?",
    "`bash -c '. /etc/lumen/eta-sync.env; echo $TRACKING_DB_HOST; printenv TRACKING_DB_HOST'` shows the difference: the shell has the value, but it isn't exported to the child script. There's a second problem waiting behind the first — read the header of `eta-sync.sh`.",
    "In the editor, make the file `export TRACKING_DB_HOST=db-01.lumen.internal`, `export TRACKING_DB_PORT=5432`, `export ETA_REGION=emea`, save, and re-run `bash /opt/lumen/bin/run-eta-sync`.",
  ],
  questions: [
    {
      id: "predict-child-env",
      kind: "mcq",
      prompt: "What does the last command print?",
      code: "A=one\nexport B=two\nbash -c 'echo \"A=$A B=$B\"'",
      codeLanguage: "bash",
      options: ["A=one B=two", "A= B=two", "A=one B=", "A= B="],
      answer: 1,
      explanation:
        "bash -c starts a child process. It inherits exported variables (B) but not plain shell variables (A). The single quotes stop the parent shell from expanding $A itself.",
    },
    {
      id: "explain-works-for-me",
      kind: "explain",
      prompt: "Explain to Marco why his manual test worked but cron kept failing, and why adding the exports to his ~/.bashrc wouldn't have fixed it.",
      concepts: [
        { label: "His shell had exported the variables; cron's environment did not", anyOf: ["his shell", "his terminal", "interactive", "already exported", "exported them", "manual test", "by hand"] },
        { label: "Plain assignment in the env file is not exported to the child script", anyOf: ["not exported", "without export", "no export", "export keyword", "shell variable", "child process", "inherit"] },
        { label: "cron does not read ~/.bashrc", anyOf: ["bashrc", "cron does not", "cron doesn't", "not read", "doesn't read", "interactive shells only", "own environment", "minimal environment"] },
        { label: "Renamed variable REGION -> ETA_REGION", anyOf: ["eta_region", "renamed", "region"] },
      ],
      minConcepts: 3,
      explanation:
        "Variables are inherited only if exported, and only from the process that starts the job. Cron starts the wrapper with its own minimal environment, so the env file must export everything.",
      modelAnswer:
        "Marco had already exported TRACKING_DB_HOST and ETA_REGION in his interactive terminal, so the script inherited them when he ran it by hand. Cron starts run-eta-sync with its own minimal environment, and the env file assigned TRACKING_DB_HOST without export, so it stayed a shell variable and the child script never inherited it. The file also still set REGION, which v2 renamed to ETA_REGION. Cron does not read ~/.bashrc, which only runs for interactive shells, so the fix belongs in /etc/lumen/eta-sync.env with export on each line.",
    },
  ],
  debrief: {
    solution: `Two problems stacked on top of each other:

1. \`TRACKING_DB_HOST=...\` in the sourced env file creates a **shell variable** in the wrapper; \`bash eta-sync.sh\` is a child process and inherits only **exported** variables.
2. v2 reads \`ETA_REGION\`; the file still set \`REGION\`.

${F}bash
# /etc/lumen/eta-sync.env
export TRACKING_DB_HOST=db-01.lumen.internal
export TRACKING_DB_PORT=5432
export ETA_REGION=emea
${F}

\`NAME=value\` followed by \`export NAME\` is equivalent. Marco's test passed because his terminal had both variables exported — a different process tree from cron's. The decisive test is always a **fresh** run through the same entry point the scheduler uses.`,
    commonMistakes: [
      "Exporting the variables in your own terminal and re-testing there, which proves nothing about cron.",
      "Adding exports to ~/.bashrc: only interactive bash shells read it; cron and systemd don't.",
      "Fixing only the first error (export) and stopping before the ETA_REGION rename shows up.",
      "Editing the vendor script to read REGION, which the next upgrade silently reverts.",
      "Checking with echo $NAME, which also shows unexported shell variables; printenv NAME shows what children get.",
    ],
    realWorld:
      "systemd services take variables from Environment= lines or an EnvironmentFile= (plain NAME=value, no export keyword needed, because systemd puts every line in the environment). Containers get them from the image or orchestrator (docker run -e, Kubernetes env/envFrom). For cron, many teams wrap jobs in a script that sources a settings file exactly like run-eta-sync. Secrets should go in files readable only by the job's user, not world-readable env files.",
  },
  review: [
    {
      id: "lx-export-inheritance",
      skill: "lx.environment",
      variants: [
        {
          id: "lx-export-inheritance-a",
          kind: "mcq",
          prompt: "A sourced settings file contains `API_URL=http://api-01:8081` (no export). The wrapper then runs `python3 job.py`, which reads `os.environ[\"API_URL\"]`. What happens?",
          options: ["job.py gets the URL", "job.py raises KeyError: the variable wasn't exported", "Python reads it from the file itself", "The wrapper fails to source the file"],
          answer: 1,
          explanation: "Only exported variables are copied into a child process's environment.",
        },
        {
          id: "lx-export-inheritance-b",
          kind: "short",
          prompt: "What does this print?",
          code: "export ZONE=brs\nbash -c 'ZONE=lds'\necho $ZONE",
          codeLanguage: "bash",
          accept: ["brs"],
          explanation: "A child process gets a copy of the environment; changing it in the child never affects the parent.",
        },
        {
          id: "lx-export-inheritance-c",
          kind: "short",
          prompt: "What does this print?",
          code: "DEPOT=BRS-2\nbash -c 'echo \"[$DEPOT]\"'",
          codeLanguage: "bash",
          accept: ["[]"],
          explanation: "DEPOT is a shell variable (not exported), so the child bash sees it as empty.",
        },
      ],
    },
    {
      id: "lx-where-to-persist",
      skill: "lx.environment",
      variants: [
        {
          id: "lx-where-to-persist-a",
          kind: "mcq",
          prompt: "A systemd service needs `LOG_LEVEL=debug`. Where should it go?",
          options: ["~/.bashrc of the service user", "/etc/profile", "Environment= or EnvironmentFile= in the unit", "export LOG_LEVEL=debug in your terminal"],
          answer: 2,
          explanation: "systemd starts services with the environment defined in the unit, not from any shell startup file.",
        },
        {
          id: "lx-where-to-persist-b",
          kind: "mcq",
          prompt: "You want `EDITOR=vim` in every interactive terminal you open on ops-ws. Where do you put `export EDITOR=vim`?",
          options: ["/etc/lumen/eta-sync.env", "~/.bashrc", "/etc/hostname", "A cron job"],
          answer: 1,
          explanation: "~/.bashrc runs for each interactive bash shell, so it's the right place for personal interactive settings.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `api-01`, the `label-render` service is a systemd unit. Aiko added `export RENDER_DPI=300` to `/home/labelsvc/.bashrc` and restarted the service, but the logs still say `RENDER_DPI not set, defaulting to 150`.",
    question: {
      id: "transfer-systemd-env",
      kind: "mcq",
      prompt: "Why didn't it work, and what is the fix?",
      options: [
        "She forgot to source .bashrc; run source ~/.bashrc and restart",
        "systemd doesn't read .bashrc; add Environment=RENDER_DPI=300 (or an EnvironmentFile=) to the unit, daemon-reload, restart",
        "Variables can't be set for services",
        "She needs export -f",
      ],
      answer: 1,
      explanation:
        "The service's environment comes from systemd, which never runs interactive shell startup files. Set it in the unit, reload units, restart.",
    },
  },
  refresher: {
    body: `\`NAME=value\` sets a **shell variable**: only the current shell sees it. \`export NAME=value\` makes it an **environment variable**: every process started from this shell gets a copy.

Children never change their parent's variables. \`source file\` runs the file in the current shell, so \`export\` lines in it matter. Your \`~/.bashrc\` only runs for your interactive shells — cron and systemd don't read it — so settings for a job belong in the file the job's runner loads.`,
    practice: {
      id: "refresher-printenv",
      kind: "mcq",
      prompt: "You run `COLOR=blue` and then `printenv COLOR`. What happens?",
      options: ["It prints blue", "It prints nothing (COLOR is not exported)", "It prints COLOR=blue", "It errors: no such command"],
      answer: 1,
      explanation: "printenv shows only exported (environment) variables; echo $COLOR would print blue.",
    },
  },
};
