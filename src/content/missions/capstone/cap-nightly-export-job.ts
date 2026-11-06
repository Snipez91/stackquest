import type { MissionInput } from "@/content/schema";

/**
 * Capstone: a Python automation job that works by hand but fails from cron.
 * Fault 1: the job reads an environment variable that the scheduled
 * environment never provides. Fault 2: the output directory is writable only
 * by the engineer who created it. Graded by running the wrapper's preflight as
 * the service account, exactly as the scheduler would.
 */

const wrapper = String.raw`#!/bin/bash
# run-delay-export.sh - started by cron as svc-export (see /etc/cron.d/delay-export).
# Loads settings, checks what delay_export.py needs, then runs it.
#   --preflight   run the checks only (no carrier API calls, no report written)

ENV_FILE=/etc/lumen/delay-export.env
if [ ! -r "$ENV_FILE" ]; then
  echo "preflight: $(id -un) cannot read $ENV_FILE" >&2
  exit 2
fi
. "$ENV_FILE"

# delay_export.py reads these with os.environ[...]: they must be exported,
# not just set, or the python3 child process never sees them.
for var in LUMEN_EXPORT_DIR CARRIER_API_URL; do
  if [ -z "$(printenv "$var")" ]; then
    echo "preflight: $var is not in the environment passed to python3" >&2
    exit 3
  fi
done

if [ ! -d "$LUMEN_EXPORT_DIR" ] || [ ! -w "$LUMEN_EXPORT_DIR" ]; then
  echo "preflight: $(id -un) cannot write to $LUMEN_EXPORT_DIR" >&2
  exit 4
fi
touch "$LUMEN_EXPORT_DIR/.last-preflight" || exit 4

echo "preflight ok: user=$(id -un) export_dir=$LUMEN_EXPORT_DIR api=$CARRIER_API_URL"
if [ "$1" = "--preflight" ]; then
  exit 0
fi
exec /usr/bin/python3 /opt/lumen/jobs/delay_export.py
`;

const envFile = String.raw`# /etc/lumen/delay-export.env - settings for the nightly delay export.
# Sourced by /opt/lumen/jobs/run-delay-export.sh. Keep secrets out of this file.
export EXPORT_DIR=/srv/exports/delays
export CARRIER_API_URL=https://carrier-gw.lumen.internal/v2
export EXPORT_DAYS=1
`;

const pyJob = String.raw`"""delay_export.py - nightly CSV of late shipments for the carrier-relations team.

v2.0 (2026-02-27): settings renamed with a LUMEN_ prefix to avoid clashes with
other jobs on the host. EXPORT_DIR -> LUMEN_EXPORT_DIR.
"""
import csv
import os
from datetime import date, timedelta
from pathlib import Path

import carrier_client

EXPORT_DIR = Path(os.environ["LUMEN_EXPORT_DIR"])      # required
API_URL = os.environ["CARRIER_API_URL"]                 # required
DAYS = int(os.environ.get("EXPORT_DAYS", "1"))          # optional


def main():
    since = date.today() - timedelta(days=DAYS)
    rows = carrier_client.late_shipments(API_URL, since=since)
    out = EXPORT_DIR / f"delays-{date.today():%Y-%m-%d}.csv"
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["tracking_id", "carrier", "promised", "delivered", "minutes_late"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
`;

const jobLog = String.raw`[2026-02-26 02:15:01] starting delay export (v1.9)
wrote 41 rows to /var/lib/lumen/exports/delays-2026-02-26.csv
[2026-02-28 02:15:01] starting delay export (v2.0)
Traceback (most recent call last):
  File "/opt/lumen/jobs/delay_export.py", line 13, in <module>
    EXPORT_DIR = Path(os.environ["LUMEN_EXPORT_DIR"])      # required
                      ~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^
  File "<frozen os>", line 714, in __getitem__
KeyError: 'LUMEN_EXPORT_DIR'
[2026-03-01 02:15:01] starting delay export (v2.0)
Traceback (most recent call last):
  File "/opt/lumen/jobs/delay_export.py", line 13, in <module>
    EXPORT_DIR = Path(os.environ["LUMEN_EXPORT_DIR"])      # required
                      ~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^
  File "<frozen os>", line 714, in __getitem__
KeyError: 'LUMEN_EXPORT_DIR'
[2026-03-02 02:15:01] starting delay export (v2.0)
Traceback (most recent call last):
  File "/opt/lumen/jobs/delay_export.py", line 13, in <module>
    EXPORT_DIR = Path(os.environ["LUMEN_EXPORT_DIR"])      # required
                      ~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^
  File "<frozen os>", line 714, in __getitem__
KeyError: 'LUMEN_EXPORT_DIR'
`;

const cronFile = String.raw`# /etc/cron.d/delay-export - nightly late-shipment export
# m  h  dom mon dow  user        command
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
15   2  *   *   *    svc-export  /opt/lumen/jobs/run-delay-export.sh >> /var/log/lumen/delay-export.log 2>&1
`;

const marcoBashrc = String.raw`# ~/.bashrc (excerpt)
alias ll='ls -alF'
# testing delay_export v2.0 by hand - 2026-02-27
export LUMEN_EXPORT_DIR=/srv/exports/delays
export CARRIER_API_URL=https://carrier-gw.lumen.internal/v2
`;

const marcoNote = String.raw`Marco's notes - delay export v2.0 rollout

- Renamed EXPORT_DIR -> LUMEN_EXPORT_DIR in delay_export.py (other jobs use EXPORT_DIR too).
- New output location /srv/exports/delays (carrier team reads it over SFTP). Created it myself.
- Tested: ran ./run-delay-export.sh from my shell on api-01 -> "wrote 38 rows". Works!
- Added --preflight to the wrapper so we can test without calling the carrier API.
- TODO: update /etc/lumen/delay-export.env (ops owns that file)
`;

const fixedEnv = String.raw`# /etc/lumen/delay-export.env - settings for the nightly delay export.
# Sourced by /opt/lumen/jobs/run-delay-export.sh. Keep secrets out of this file.
export LUMEN_EXPORT_DIR=/srv/exports/delays
export CARRIER_API_URL=https://carrier-gw.lumen.internal/v2
export EXPORT_DAYS=1
`;

const preflight = "/opt/lumen/jobs/run-delay-export.sh --preflight";

export const mission: MissionInput = {
  slug: "cap-nightly-export-job",
  version: 1,
  track: "capstone",
  tier: "intermediate",
  order: 1,
  title: "The export that only works when Marco runs it",
  summary:
    "A nightly Python export has crashed three nights running, yet works from Marco's shell. Fix the scheduled environment and the output directory so the job runs as its service account.",
  minutes: 30,
  assessmentTypes: ["investigate-logs", "configure-system", "interpret-output"],
  skills: ["lx.environment", "py.automation"],
  appliesSkills: ["lx.permissions", "lx.scripting", "lx.logs", "py.exceptions"],
  prerequisites: ["py-log-crash", "lx-eta-sync-env"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#data-pipelines",
    body: `The carrier-relations team says the nightly late-shipments CSV hasn't appeared since Friday. Odd, because I tested v2.0 of \`delay_export.py\` on api-01 before release and it worked: I ran the wrapper by hand and it wrote 38 rows.

Cron runs it at 02:15 as \`svc-export\`. The log is at \`/var/log/lumen/delay-export.log\` and my rollout notes are in \`/home/marco/rollout-notes.txt\`. I added a \`--preflight\` flag to the wrapper so you can test without calling the carrier API.

Could you make it work **the way cron runs it**, not the way I run it? Please don't open up the export directory to everyone. The carrier team pulls files from it, and I still need to read them.`,
  },
  objectives: [
    "Explain why a script that works in an interactive shell fails under a scheduler (different user, different environment)",
    "Connect a Python KeyError on os.environ to the shell environment its parent process passed down",
    "Reproduce a scheduled job exactly as the scheduler runs it, as the service account",
    "Grant a service account write access to an output directory without making it world-writable",
  ],
  concept: {
    title: "A scheduled job is a different user with a different environment",
    body: `When cron (or a systemd timer, or a CI runner) starts a job, three things are usually different from your terminal:

1. **The user.** The job runs as \`svc-export\`, not as you. Your file permissions, group memberships and home directory do not apply.
2. **The environment.** cron does not read your \`~/.bashrc\`. The job only sees variables that cron sets, plus whatever its wrapper exports.
3. **The working directory and PATH**, which are minimal.

Python reads its environment from the process that started it. \`os.environ["X"]\` raises \`KeyError\` if the parent did not **export** \`X\`. In a shell, a plain assignment stays inside that shell; \`export\` copies the variable into the environment of every child process:

\`\`\`bash
X=1;        python3 -c 'import os; print(os.environ.get("X"))'   # None
export X=1; python3 -c 'import os; print(os.environ.get("X"))'   # 1
\`\`\`

So "it works when I run it" often means your shell supplied something the scheduled job never gets. The reliable test is to **reproduce the scheduler's conditions**: run as the job's user (\`sudo -u svc-export ...\`) with only the environment the job itself sets up. Fix problems where the job's own configuration lives, not in your personal shell profile.`,
  },
  workedExample: {
    title: "Worked example: the backup script that failed only at night",
    body: `A different job: \`/opt/backup/run.sh\` uploads a database dump. It works when Dev runs it, but fails every night under cron as \`svc-backup\`.

**1. Read the job's own log, not your terminal.** It says:

\`\`\`text
KeyError: 'BACKUP_BUCKET'
\`\`\`

**2. Ask where the variable comes from.** \`grep -r BACKUP_BUCKET /etc/backup/ ~/.bashrc\` shows it only in Dev's \`~/.bashrc\`. cron never reads that file.

**3. Put it where the job reads its settings,** exported so the Python child sees it:

\`\`\`bash
echo 'export BACKUP_BUCKET=lab-backups' | sudo tee -a /etc/backup/backup.env
\`\`\`

**4. Reproduce as the service account.** \`sudo -u svc-backup /opt/backup/run.sh --dry-run\` now fails with \`cannot write to /var/backups/db\`. That directory was created by Dev, so it is \`dev:dev 0755\`.

**5. Fix ownership narrowly.** \`sudo chown svc-backup:svc-backup /var/backups/db\` (not \`chmod 777\`). Re-run the dry run as \`svc-backup\`: it succeeds.

Notice the second fault only appeared after the first was fixed, and only when testing as the real user.`,
  },
  simulationNote:
    "cron itself is not simulated, so nothing runs at 02:15. The grader does what cron would do: it runs `/opt/lumen/jobs/run-delay-export.sh --preflight` as svc-export with no personal profile loaded. Python cannot execute in this lab, so the wrapper's preflight checks exactly what delay_export.py needs (exported variables and a writable directory). Running the wrapper without `--preflight` reaches the `python3` line and stops there. `set -a` is accepted but ignored by this simulator, so use `export` explicitly.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T10:05:00Z",
      start: { host: "api-01", user: "oncall", cwd: "/home/oncall" },
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "oncall", uid: 1000, groups: ["sudo", "adm"], home: "/home/oncall" },
            { name: "marco", uid: 1001, groups: ["developers"], home: "/home/marco" },
            { name: "svc-export", uid: 996, groups: [], home: "/nonexistent", shell: "/usr/sbin/nologin" },
          ],
          groups: [
            { name: "oncall", gid: 1000 },
            { name: "marco", gid: 1001 },
            { name: "sudo", gid: 27 },
            { name: "adm", gid: 4 },
            { name: "developers", gid: 1500 },
            { name: "svc-export", gid: 996 },
          ],
          interfaces: [{ name: "lo", address: "127.0.0.1/8" }, { name: "eth0", address: "10.20.1.20/16" }],
          files: [
            { path: "/home/oncall", type: "dir", owner: "oncall", group: "oncall", mode: "0755" },
            { path: "/home/marco", type: "dir", owner: "marco", group: "marco", mode: "0755" },
            { path: "/home/marco/.bashrc", content: marcoBashrc, owner: "marco", group: "marco", mode: "0644" },
            { path: "/home/marco/rollout-notes.txt", content: marcoNote, owner: "marco", group: "marco", mode: "0644" },
            { path: "/etc/cron.d/delay-export", content: cronFile, mode: "0644" },
            { path: "/etc/lumen", type: "dir", mode: "0755" },
            { path: "/etc/lumen/delay-export.env", content: envFile, mode: "0640", owner: "root", group: "svc-export" },
            { path: "/opt/lumen/jobs", type: "dir", mode: "0755" },
            { path: "/opt/lumen/jobs/run-delay-export.sh", content: wrapper, mode: "0755" },
            { path: "/opt/lumen/jobs/delay_export.py", content: pyJob, mode: "0644" },
            { path: "/var/log/lumen", type: "dir", mode: "0775", owner: "root", group: "svc-export" },
            { path: "/var/log/lumen/delay-export.log", content: jobLog, mode: "0644", owner: "svc-export", group: "svc-export" },
            { path: "/srv/exports", type: "dir", mode: "0755" },
            { path: "/srv/exports/delays", type: "dir", mode: "0755", owner: "marco", group: "marco" },
            { path: "/srv/exports/delays/delays-2026-02-27.csv", content: "tracking_id,carrier,promised,delivered,minutes_late\nLMN30044120,NorthStar,2026-02-26T19:30Z,2026-02-27T01:30Z,360\n", mode: "0644", owner: "marco", group: "marco" },
          ],
        },
      ],
    },
    checks: [
      {
        id: "preflight-as-service-account",
        name: "The wrapper's preflight passes when run as svc-export",
        assert: {
          type: "command_output",
          host: "api-01",
          user: "svc-export",
          cwd: "/",
          run: preflight,
          pattern: "^preflight ok: user=svc-export export_dir=/srv/exports/delays ",
          expectExit: 0,
        },
        feedback: {
          what: "Running `/opt/lumen/jobs/run-delay-export.sh --preflight` as svc-export (as cron does) does not print `preflight ok` with export_dir=/srv/exports/delays.",
          why: "This is the job's real execution context. If it fails here, it fails at 02:15, however well it works from your shell.",
          next: "Run it yourself the same way: `sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight`. Read which check it stops at (exit 3 = environment, exit 4 = directory) and fix that layer.",
        },
      },
      {
        id: "service-can-write",
        name: "svc-export can write to the export directory",
        assert: { type: "access", host: "api-01", path: "/srv/exports/delays", user: "svc-export", access: "w", expect: true },
        feedback: {
          what: "svc-export still cannot create files in /srv/exports/delays.",
          why: "The directory was created by Marco while testing, so only marco can write to it. The job runs as svc-export and would fail with PermissionError when it opens the CSV.",
          next: "Check `ls -ld /srv/exports/delays`. Give the service account ownership (or a group with write permission) on that directory.",
        },
      },
      {
        id: "dir-not-world-writable",
        name: "The export directory is not world-writable",
        assert: { type: "mode_max", host: "api-01", path: "/srv/exports/delays", max: "2775" },
        feedback: {
          what: "/srv/exports/delays is writable by every user on the host.",
          why: "Files in this directory are pulled by an external team. If anyone can write there, anyone can plant or replace a report.",
          next: "Use ownership instead of `chmod 777`: for example `sudo chown svc-export:svc-export /srv/exports/delays` with mode 755, or a shared group with 2775.",
        },
      },
      {
        id: "marco-can-still-read",
        name: "Marco can still list and read the exports",
        assert: {
          type: "all",
          of: [
            { type: "access", host: "api-01", path: "/srv/exports/delays", user: "marco", access: "r", expect: true },
            { type: "access", host: "api-01", path: "/srv/exports/delays", user: "marco", access: "x", expect: true },
          ],
        },
        feedback: {
          what: "marco can no longer list or enter /srv/exports/delays.",
          why: "The brief asks to keep the reports readable for the engineers who check them. Locking the directory to the service account alone breaks that workflow.",
          next: "Keep read and execute for group or others on the directory (for example mode 755 or 2775).",
        },
      },
    ],
    solution: [
      "tail -n 8 /var/log/lumen/delay-export.log",
      "cat /etc/cron.d/delay-export",
      "cat /home/marco/rollout-notes.txt",
      "sudo cat /etc/lumen/delay-export.env",
      "grep -rn LUMEN_EXPORT_DIR /opt/lumen/jobs /home/marco/.bashrc",
      "sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight",
      "sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env",
      "sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight",
      "ls -ld /srv/exports/delays",
      "sudo chown svc-export:svc-export /srv/exports/delays",
      "sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight",
      "ls -la /srv/exports/delays",
    ],
    wrongSolutions: [
      {
        label: "Makes the export directory world-writable",
        steps: [
          "sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env",
          "sudo chmod 777 /srv/exports/delays",
        ],
      },
      {
        label: "Adds the variable without `export`, so python3 never sees it",
        steps: [
          "echo 'LUMEN_EXPORT_DIR=/srv/exports/delays' | sudo tee -a /etc/lumen/delay-export.env",
          "sudo chown svc-export:svc-export /srv/exports/delays",
        ],
      },
      {
        label: "Fixes the environment only; the directory still belongs to marco",
        steps: ["sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env"],
      },
      {
        label: "Locks the directory to the service account (mode 700)",
        steps: [
          "sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env",
          "sudo chown svc-export:svc-export /srv/exports/delays",
          "sudo chmod 700 /srv/exports/delays",
        ],
      },
    ],
    starterCommands: [
      "tail -n 8 /var/log/lumen/delay-export.log",
      "cat /etc/cron.d/delay-export",
      "cat /home/marco/rollout-notes.txt",
      "sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight",
    ],
  },
  successCriteria: [
    "Running the wrapper's preflight as svc-export prints `preflight ok` for /srv/exports/delays",
    "svc-export can create files in /srv/exports/delays",
    "The export directory is not world-writable",
    "marco can still list and read the reports",
  ],
  hints: [
    "Start with the job's own log, not your terminal. Which line of delay_export.py fails, and which Python exception does it raise?",
    "`KeyError: 'LUMEN_EXPORT_DIR'` means the variable was not in the environment python3 inherited. Where does the scheduled job get its environment from, and where did Marco's manual test get it from? Compare `/etc/lumen/delay-export.env` with `/home/marco/.bashrc`.",
    "Reproduce cron's conditions: `sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight`. Exit 3 means a variable is missing from the exported environment. After you fix that, run it again: exit 4 means a different problem.",
    "Rename the setting in the env file so it reads `export LUMEN_EXPORT_DIR=/srv/exports/delays` (for example `sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env`). Then look at `ls -ld /srv/exports/delays`: who owns it, and who does the job run as? Change the owner rather than the mode.",
  ],
  questions: [
    {
      id: "why-manual-run-worked",
      kind: "mcq",
      prompt: "Why did Marco's manual test write 38 rows while every cron run crashed with KeyError?",
      options: [
        "cron uses a different Python version that does not support os.environ",
        "Marco's interactive shell had LUMEN_EXPORT_DIR exported from his ~/.bashrc and he could write to his own directory; cron runs as svc-export without his profile",
        "The carrier API only answers during office hours",
        "cron runs scripts with `sh` instead of `bash`, which ignores the env file",
      ],
      answer: 1,
      explanation:
        "The manual run inherited Marco's environment (his ~/.bashrc exports the new name) and his permissions (he owns /srv/exports/delays). The cron run has neither, so it hits both faults.",
    },
    {
      id: "export-keyword",
      kind: "short",
      prompt:
        "A wrapper script contains `REPORT_DIR=/srv/reports` on one line and `python3 report.py` on the next. report.py reads `os.environ[\"REPORT_DIR\"]` and raises KeyError. Which single shell keyword, placed before the assignment, fixes this?",
      accept: ["export"],
      explanation:
        "A plain assignment creates a shell variable that child processes do not inherit. `export REPORT_DIR=/srv/reports` puts it in the environment passed to python3.",
    },
    {
      id: "predict-preflight-exit",
      kind: "mcq",
      prompt:
        "You have fixed the env file but not the directory. You run `sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight`. What do you expect?",
      code: "drwxr-xr-x 2 marco marco 4096 Feb 27 16:02 /srv/exports/delays",
      codeLanguage: "text",
      options: [
        "`preflight ok`, because svc-export can list the directory",
        "`preflight: svc-export cannot write to /srv/exports/delays` with exit 4",
        "`preflight: LUMEN_EXPORT_DIR is not in the environment` with exit 3",
        "KeyError: 'LUMEN_EXPORT_DIR'",
      ],
      answer: 1,
      explanation:
        "The environment check now passes, so the script reaches the directory test. svc-export falls under \"others\" (r-x), which has no write permission, so `[ -w ... ]` fails and the script exits 4.",
    },
  ],
  debrief: {
    solution: `The job failed for two reasons that Marco's manual test could not reveal.

**1. Environment.** v2.0 of \`delay_export.py\` reads \`os.environ["LUMEN_EXPORT_DIR"]\`, but \`/etc/lumen/delay-export.env\`, the file the cron wrapper sources, still exported the old name \`EXPORT_DIR\`. Marco's \`~/.bashrc\` exported the new name, so his test worked. Fix it where the job reads its settings, keeping \`export\`:

\`\`\`bash
sudo sed -i 's/^export EXPORT_DIR=/export LUMEN_EXPORT_DIR=/' /etc/lumen/delay-export.env
\`\`\`

**2. Permissions.** The preflight then stopped at exit 4: \`/srv/exports/delays\` was \`marco:marco 0755\` because Marco created it. Give the job's user ownership; the default 755 keeps it readable for Marco and the carrier team:

\`\`\`bash
sudo chown svc-export:svc-export /srv/exports/delays
sudo -u svc-export /opt/lumen/jobs/run-delay-export.sh --preflight
# preflight ok: user=svc-export export_dir=/srv/exports/delays api=...
\`\`\`

(A shared group with \`chmod 2775\` is an equally good design if several accounts must write there.)`,
    commonMistakes: [
      "Testing the job from your own shell and concluding it works. Always reproduce as the scheduled user (`sudo -u svc-export ...`).",
      "Adding `LUMEN_EXPORT_DIR=...` without `export`: the wrapper's shell sees it, but python3 does not.",
      "Putting the variable in a personal ~/.bashrc or in root's profile. cron reads neither.",
      "Running `chmod 777` on the export directory so that \"anyone can write\", which includes anyone who wants to tamper with reports.",
      "Stopping after the KeyError is gone without re-running: the permission fault only shows up afterwards.",
    ],
    realWorld:
      "\"Works on my machine\" for scheduled jobs almost always comes down to user, environment, working directory or PATH. Good practice: keep a job's settings in one file owned by operations, make the wrapper validate them up front (as this preflight does) so failures are explicit instead of a Python traceback, and alert when the expected output file does not appear. That last check would have caught this on the first night instead of the third.",
  },
  review: [
    {
      id: "cap-cron-environment",
      skill: "py.automation",
      variants: [
        {
          id: "cap-cron-environment-a",
          kind: "mcq",
          prompt:
            "A Python job reads `os.environ[\"S3_BUCKET\"]`. It works when you run it, but under cron it raises `KeyError: 'S3_BUCKET'`. `grep S3_BUCKET` finds the variable only in your `~/.profile`. What is the right fix?",
          options: [
            "Catch the KeyError and continue with an empty bucket name",
            "Export S3_BUCKET in the configuration file the job's wrapper loads (or in the cron entry), not in your profile",
            "Run the cron job as your own user so it picks up your profile",
            "Reinstall Python on the host",
          ],
          answer: 1,
          explanation:
            "cron does not read personal profiles. The job's own configuration must provide and export the variable. Swallowing the KeyError just hides the failure.",
        },
        {
          id: "cap-cron-environment-b",
          kind: "mcq",
          prompt:
            "`sync_rates.py` uses `os.environ[\"RATES_URL\"]`. Dev's terminal test succeeds; the systemd timer run fails with KeyError. Which command best reproduces the timer's conditions before you change anything?",
          options: [
            "`python3 sync_rates.py` in Dev's terminal again",
            "`sudo -u svc-rates env -i /opt/rates/run.sh` (the service user, with an empty environment)",
            "`sudo su -` and then run the script as root",
            "`echo $RATES_URL` in Dev's terminal",
          ],
          answer: 1,
          explanation:
            "Running as the service user with a clean environment shows what the scheduled run really gets. Root or Dev's shell would inherit variables the timer does not.",
        },
      ],
    },
    {
      id: "cap-service-output-dir",
      skill: "lx.permissions",
      variants: [
        {
          id: "cap-service-output-dir-a",
          kind: "mcq",
          prompt:
            "`ls -ld /srv/reports` shows `drwxr-xr-x dev dev`. A job running as `svc-report` must write there, and Dev must still read the files. Which change is best?",
          options: [
            "`sudo chmod 777 /srv/reports`",
            "`sudo chown svc-report:svc-report /srv/reports` (keeping mode 755)",
            "`sudo chmod 700 /srv/reports`",
            "Run the job as root",
          ],
          answer: 1,
          explanation:
            "Owning the directory gives svc-report write access; 755 still lets everyone else, including Dev, list and read it. 777 lets anyone tamper; 700 locks Dev out; root is excessive privilege.",
        },
        {
          id: "cap-service-output-dir-b",
          kind: "mcq",
          prompt:
            "`/var/exports/manifests` is `drwxr-xr-x aiko aiko`. The `svc-manifest` user gets `Permission denied` creating files. Which statement is correct?",
          options: [
            "svc-manifest falls under \"others\", which has r-x but not w, so it cannot create files",
            "svc-manifest needs execute permission on each file it creates",
            "The directory needs the sticky bit for any user to write",
            "Only root can ever create files in /var",
          ],
          answer: 0,
          explanation:
            "Creating a file needs write (and execute) permission on the directory. svc-manifest is neither the owner nor in group aiko, so the \"others\" bits (r-x) apply.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko schedules a Node.js script, `build-sitemap.js`, with a systemd timer that runs as `svc-web`. It reads `process.env.SITEMAP_OUT`. It works from her terminal. The timer's journal shows `TypeError [ERR_INVALID_ARG_TYPE]: The \"path\" argument must be of type string. Received undefined`.",
    question: {
      id: "transfer-node-env",
      kind: "mcq",
      prompt: "What is the most likely cause, and what is the first check?",
      options: [
        "A Node.js bug; upgrade Node",
        "SITEMAP_OUT exists in Aiko's shell but not in the timer's environment; check the unit's Environment=/EnvironmentFile= settings and run the script as svc-web",
        "The sitemap is too large for the disk",
        "The timer is firing at the wrong time",
      ],
      answer: 1,
      explanation:
        "`process.env.SITEMAP_OUT` is undefined in the scheduled run. It is the same failure as Python's KeyError: the scheduler's environment is not your shell's. Provide the variable in the unit's configuration and reproduce as svc-web.",
    },
  },
  refresher: {
    body: `A scheduled job runs as **its own user** with **its own environment**. It does not get your \`~/.bashrc\`, your exported variables or your permissions.

Programs read variables from the environment their parent passed down. In a shell, \`NAME=value\` stays in that shell; \`export NAME=value\` passes it to child processes such as \`python3\`. If Python raises \`KeyError\` on \`os.environ[...]\`, the parent never exported that name.

To test a job honestly, run it the way the scheduler does: \`sudo -u <service-user> /path/to/wrapper\`.`,
    practice: {
      id: "refresher-export-child",
      kind: "mcq",
      prompt: "What does the second line print?",
      code: "$ CITY=Lyon\n$ bash -c 'echo \"city=$CITY\"'",
      codeLanguage: "bash",
      options: ["city=Lyon", "city=", "An error: CITY is not defined", "city=$CITY"],
      answer: 1,
      explanation:
        "CITY was assigned but not exported, so the child bash process does not inherit it and prints an empty value. `export CITY=Lyon` would make it print city=Lyon.",
    },
  },
};
