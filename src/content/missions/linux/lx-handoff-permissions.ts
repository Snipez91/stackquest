import type { MissionInput } from "@/content/schema";

const F = "```";

const exportScript = `#!/bin/bash
# handoff-export.sh — nightly delivery export for the reporting job.
# Runs as marco from cron. Output: /srv/handoff/<YYYY-MM-DD>/deliveries.csv
# The reporting service (reportgen, group dispatch) must be able to read it.
# Delivery data includes consignee names: nobody outside dispatch may read it.

umask 077

DAY=\${1:-$(date +%F)}
OUT=/srv/handoff/$DAY
mkdir -p "$OUT"
echo "tracking_id,depot,consignee,status" > "$OUT/deliveries.csv"
echo "LMN40210001,BRS-2,Harbourside Foods,DELIVERED" >> "$OUT/deliveries.csv"
echo "LMN40210003,BRS-1,Oakfield Joinery,DELIVERED" >> "$OUT/deliveries.csv"
chgrp -R dispatch "$OUT"
echo "export complete: $OUT"
`;

const fixedScript = exportScript.replace("umask 077", "umask 027");

const reportLog = `2026-03-02 06:00:01 reportgen[3310]: building daily delivery report for 2026-03-01
2026-03-02 06:00:01 reportgen[3310]: ERROR open /srv/handoff/2026-03-01/deliveries.csv: permission denied
2026-03-02 06:00:01 reportgen[3310]: report NOT generated
2026-03-02 07:42:18 marco: ran chmod -R g+r /srv/handoff/2026-03-01 (ticket OPS-4471)
2026-03-02 08:00:01 reportgen[3502]: building daily delivery report for 2026-03-01
2026-03-02 08:00:01 reportgen[3502]: ERROR open /srv/handoff/2026-03-01/deliveries.csv: permission denied
2026-03-02 08:00:01 reportgen[3502]: report NOT generated
`;

const csv = "tracking_id,depot,consignee,status\nLMN40200001,BRS-1,Oakfield Joinery,DELIVERED\nLMN40200002,BRS-3,Avon Print Works,DELIVERED\n";

export const lxHandoffPermissions: MissionInput = {
  slug: "lx-handoff-permissions",
  version: 1,
  track: "linux",
  tier: "beginner",
  order: 4,
  title: "The report job can see the folder but not the file",
  summary:
    "The report job gets 'permission denied' on files that look group-readable. Use the rwx model, x on directories and umask to fix today's files and future exports without opening them to everyone.",
  minutes: 30,
  assessmentTypes: ["configure-system", "explain-root-cause"],
  skills: ["lx.permissions"],
  appliesSkills: ["lx.navigation"],
  prerequisites: ["lx-top-error-sources"],
  brief: {
    from: "Sam Ortiz, Engineering manager",
    channel: "#ops",
    body: `Finance didn't get the daily delivery report again. The \`reportgen\` service on \`api-01\` logs "permission denied" on \`/srv/handoff/2026-03-01/deliveries.csv\` — see \`/var/log/reportgen.log\`. Marco ran \`chmod -R g+r\` on that folder this morning and it *still* fails, which nobody can explain.

Please, on \`api-01\`:

1. Make the existing exports (1 and 2 March) readable by \`reportgen\` (it is in the \`dispatch\` group).
2. Fix \`/opt/lumen/bin/handoff-export.sh\` so tomorrow's export is readable by the group too.

These files contain customer names, so **only \`dispatch\` members** may read them — no world-readable shortcuts — and \`reportgen\` only needs to read, not write. Then tell me in plain words why \`g+r\` wasn't enough.`,
  },
  objectives: [
    "Read ls -l mode strings and their octal equivalents (rwxr-x--- = 750)",
    "Explain what r, w and x mean on a directory, and why x is needed to reach a file inside it",
    "Change modes with chmod in octal and symbolic form, including capital X",
    "Predict the mode of new files and directories from a umask, and set an appropriate one",
  ],
  concept: {
    title: "Three classes, three bits — and what they mean on a directory",
    body: `Every file and directory has an owner, a group, and a mode: three sets of \`rwx\` bits for **user (owner), group, others**. The kernel picks **one** class — owner if you own it, else group if you're a member, else others — and checks only those bits.

${F}text
drwxr-x---  marco dispatch  2026-03-01/      = 750
-rw-r-----  marco dispatch  deliveries.csv   = 640   (r=4 w=2 x=1)
${F}

On a **file**, r = read content, w = change content, x = run it. On a **directory** the bits mean something different:

| Bit | On a directory it allows |
| --- | --- |
| r | listing the names inside (\`ls\`) |
| w | creating, renaming, deleting entries (needs x too) |
| x | *passing through* it to reach anything inside — open, cd, stat |

To open \`/srv/handoff/2026-03-01/deliveries.csv\` you need **x on every directory in the path** plus r on the file. \`r\` without \`x\` on a directory lets you see names but not open them.

\`chmod\` takes octal (\`chmod 640 f\`) or symbolic changes (\`chmod g+r f\`, \`chmod o= f\`). Capital \`X\` adds x **only to directories** (and already-executable files): \`chmod -R g+rX dir\`.

New files start from 666 and new directories from 777, minus the **umask**. \`umask 077\` gives 600/700 (owner only); \`umask 027\` gives 640/750 (group can read, others nothing).`,
  },
  workedExample: {
    title: "Worked example: the label printer can't load its templates",
    body: `The \`labeld\` service (group \`print\`) fails to open \`/srv/labels/v8/a6.tpl\`.

**1. Look at every level of the path, not just the file.**

${F}bash
ls -ld /srv /srv/labels /srv/labels/v8 /srv/labels/v8/a6.tpl
# drwxr-xr-x root  root  /srv
# drwxr-x--- root  print /srv/labels
# drwxr----- dev   print /srv/labels/v8        <- group has r but no x
# -rw-r----- dev   print /srv/labels/v8/a6.tpl
${F}

**2. Find the first level where the group's bits lack what's needed.** \`labeld\` falls under *group* for \`v8\` (it's in \`print\`) and has \`r--\`: it can list the templates but not open them.

**3. Fix with the least change.** Add x to the directory only; the files don't need it:

${F}bash
sudo chmod g+x /srv/labels/v8          # or: sudo chmod -R g+rX /srv/labels/v8
sudo -u labeld cat /srv/labels/v8/a6.tpl > /dev/null && echo ok
${F}

**4. Stop it recurring.** The template generator ran with \`umask 037\` (dirs 740, files 640). Changing it to \`umask 027\` makes new dirs 750 and files 640 — group can traverse and read, others get nothing.`,
  },
  simulationNote:
    "Permission checks are simulated the way the kernel does them: one class (owner, group or others) is chosen per user, and every parent directory needs x. sudo works without a password for the sudo group. The cron job does not run on its own; the checks run the export script as marco to see what tomorrow's files will look like. ACLs and SELinux are not simulated.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:05:00Z",
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "ops", uid: 1000, groups: ["sudo", "dispatch"], home: "/home/ops" },
            { name: "marco", uid: 1001, groups: ["dispatch"], home: "/home/marco" },
            { name: "reportgen", uid: 996, groups: ["dispatch"], home: "/var/lib/reportgen", shell: "/usr/sbin/nologin" },
            { name: "lena", uid: 1005, groups: [], home: "/home/lena" },
          ],
          files: [
            { path: "/srv/handoff", type: "dir", mode: "0750", owner: "marco", group: "dispatch" },
            { path: "/srv/handoff/2026-03-01", type: "dir", mode: "0740", owner: "marco", group: "dispatch" },
            { path: "/srv/handoff/2026-03-01/deliveries.csv", content: csv, mode: "0640", owner: "marco", group: "dispatch" },
            { path: "/srv/handoff/2026-03-02", type: "dir", mode: "0700", owner: "marco", group: "dispatch" },
            { path: "/srv/handoff/2026-03-02/deliveries.csv", content: csv.replace(/LMN4020/g, "LMN4021"), mode: "0600", owner: "marco", group: "dispatch" },
            { path: "/opt/lumen", type: "dir", mode: "0755" },
            { path: "/opt/lumen/bin", type: "dir", mode: "0755" },
            { path: "/opt/lumen/bin/handoff-export.sh", content: exportScript, mode: "0775", owner: "root", group: "dispatch" },
            { path: "/var/log/reportgen.log", content: reportLog, mode: "0644", owner: "reportgen", group: "dispatch" },
          ],
        },
      ],
      start: { host: "api-01", user: "ops" },
      editableFiles: ["/opt/lumen/bin/handoff-export.sh"],
    },
    checks: [
      {
        id: "reportgen-reads-existing",
        name: "reportgen can read both existing exports",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/srv/handoff/2026-03-01/deliveries.csv", user: "reportgen", access: "r", expect: true },
            { type: "access", path: "/srv/handoff/2026-03-02/deliveries.csv", user: "reportgen", access: "r", expect: true },
          ],
        },
        feedback: {
          what: "reportgen still cannot read /srv/handoff/2026-03-01/deliveries.csv or /srv/handoff/2026-03-02/deliveries.csv.",
          why: "reportgen is in group dispatch, so it needs group x on each directory in the path and group r on the file. The 1 March directory is rwxr----- (no group x) and the 2 March files are owner-only.",
          next: "Check each level with ls -ld /srv/handoff /srv/handoff/2026-03-0*; then add group read to files and group x to directories, e.g. sudo chmod -R g+rX /srv/handoff/2026-03-01 /srv/handoff/2026-03-02.",
        },
      },
      {
        id: "no-world-or-write",
        name: "Others cannot read the exports, and reportgen cannot modify them",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/srv/handoff/2026-03-01/deliveries.csv", user: "lena", access: "r", expect: false },
            { type: "access", path: "/srv/handoff/2026-03-02/deliveries.csv", user: "lena", access: "r", expect: false },
            { type: "access", path: "/srv/handoff/2026-03-01/deliveries.csv", user: "reportgen", access: "w", expect: false },
            { type: "access", path: "/srv/handoff/2026-03-02/deliveries.csv", user: "reportgen", access: "w", expect: false },
            { type: "mode_max", path: "/srv/handoff/2026-03-01", max: "0750" },
            { type: "mode_max", path: "/srv/handoff/2026-03-02", max: "0750" },
            { type: "mode_max", path: "/srv/handoff/2026-03-01/deliveries.csv", max: "0640" },
            { type: "mode_max", path: "/srv/handoff/2026-03-02/deliveries.csv", max: "0640" },
          ],
        },
        feedback: {
          what: "The exports are more open than needed: someone outside dispatch (lena) can read them, the group can write them, or a mode exceeds 750 for directories / 640 for files.",
          why: "These files contain customer names. Least privilege means the reporting service gets read access through its group and nobody else gets anything; chmod 777 or 755/644 'fixes' the error by leaking data.",
          next: "Use group bits only: directories 750 (rwxr-x---), files 640 (rw-r-----). For example sudo chmod 750 on the day directories and sudo chmod 640 on the CSV files, or chmod -R g+rX,g-w,o= on the day directories.",
        },
      },
      {
        id: "future-exports-readable",
        name: "Tomorrow's export is readable by reportgen and not by others",
        assert: {
          type: "all",
          of: [
            {
              type: "command_output",
              setup: ["sudo -u marco bash /opt/lumen/bin/handoff-export.sh 2026-03-03"],
              run: "sudo -u reportgen cat /srv/handoff/2026-03-03/deliveries.csv",
              pattern: "LMN40210001",
            },
            {
              type: "command_output",
              setup: ["sudo -u marco bash /opt/lumen/bin/handoff-export.sh 2026-03-03"],
              run: "sudo -u lena cat /srv/handoff/2026-03-03/deliveries.csv; echo rc=$?",
              pattern: "^rc=1$",
            },
          ],
        },
        feedback: {
          what: "After running handoff-export.sh as marco for 2026-03-03, reportgen cannot read the new file — or lena (outside dispatch) can.",
          why: "Fixing today's files by hand doesn't stop the job from creating owner-only files again tomorrow; making the umask too loose (002, 022) leaks the data to every user instead.",
          next: "Edit /opt/lumen/bin/handoff-export.sh: change umask 077 to umask 027 (new dirs 750, files 640). Test it yourself with sudo -u marco bash /opt/lumen/bin/handoff-export.sh 2026-03-09 and ls -l.",
        },
      },
    ],
    solution: [
      "cat /var/log/reportgen.log",
      "ls -ld /srv/handoff /srv/handoff/2026-03-01 /srv/handoff/2026-03-02",
      "sudo ls -l /srv/handoff/2026-03-01 /srv/handoff/2026-03-02",
      "sudo chmod 750 /srv/handoff/2026-03-01 /srv/handoff/2026-03-02",
      "sudo chmod 640 /srv/handoff/2026-03-01/deliveries.csv /srv/handoff/2026-03-02/deliveries.csv",
      { write: "/opt/lumen/bin/handoff-export.sh", content: fixedScript },
      "sudo -u marco bash /opt/lumen/bin/handoff-export.sh 2026-03-09",
      "ls -l /srv/handoff/2026-03-09",
      "sudo -u reportgen cat /srv/handoff/2026-03-01/deliveries.csv",
    ],
    wrongSolutions: [
      {
        label: "Makes everything world-writable with chmod -R 777",
        steps: ["sudo chmod -R 777 /srv/handoff", { write: "/opt/lumen/bin/handoff-export.sh", content: fixedScript }],
      },
      {
        label: "Adds g+r again but never adds x to the directories",
        steps: ["sudo chmod -R g+r /srv/handoff/2026-03-01 /srv/handoff/2026-03-02", { write: "/opt/lumen/bin/handoff-export.sh", content: fixedScript }],
      },
      {
        label: "Fixes the existing files but leaves umask 077 in the script",
        steps: ["sudo chmod -R g+rX /srv/handoff/2026-03-01 /srv/handoff/2026-03-02"],
      },
      {
        label: "Uses umask 022 and chmod 755/644, making the data world-readable",
        steps: [
          "sudo chmod 755 /srv/handoff /srv/handoff/2026-03-01 /srv/handoff/2026-03-02",
          "sudo chmod 644 /srv/handoff/2026-03-01/deliveries.csv /srv/handoff/2026-03-02/deliveries.csv",
          { write: "/opt/lumen/bin/handoff-export.sh", content: exportScript.replace("umask 077", "umask 022") },
        ],
      },
    ],
    starterCommands: ["cat /var/log/reportgen.log", "ls -ld /srv/handoff /srv/handoff/*", "id reportgen"],
  },
  successCriteria: [
    "reportgen can read the 1 and 2 March deliveries.csv files",
    "Nobody outside dispatch can read the exports, reportgen cannot write them, and modes are at most 750 (dirs) / 640 (files)",
    "Running the export script for a new day produces a file reportgen can read and others cannot",
  ],
  hints: [
    "Run `id reportgen` to see which class reportgen falls into, then `ls -ld` every level: `/srv/handoff`, the day directories, and (with sudo) the files. Read the *group* triplet at each level.",
    "For 1 March the file is already `rw-r-----`. Look at its directory: `rwxr-----`. Which bit does the group need on a directory to open something inside it?",
    "Today's directory and file are owner-only (700/600) because the script sets `umask 077`. Fix both days with group r on files and group x on directories — `chmod -R g+rX` does exactly that — without touching *others*.",
    "`sudo chmod 750 /srv/handoff/2026-03-0{1,2}` and `sudo chmod 640 /srv/handoff/2026-03-0{1,2}/deliveries.csv`, then change `umask 077` to `umask 027` in the script and test with `sudo -u marco bash /opt/lumen/bin/handoff-export.sh 2026-03-09`.",
  ],
  questions: [
    {
      id: "explain-g-plus-r",
      kind: "explain",
      prompt: "Explain to Sam, in plain words, why Marco's `chmod -R g+r` did not fix the 1 March export, and what did.",
      concepts: [
        { label: "Directories need x (execute/search) to reach files inside", anyOf: ["x on the directory", "execute", "search permission", "traverse", "pass through", "g+x", "+x", "x bit", "enter the directory"] },
        { label: "r on a directory only lists names", anyOf: ["list", "listing", "names", "see the files", "ls"] },
        { label: "Least privilege: group only, nothing for others", anyOf: ["others", "world", "777", "only the group", "group only", "dispatch", "least privilege", "not everyone"] },
      ],
      minConcepts: 2,
      explanation:
        "g+r gave the group permission to list the directory but not to enter it. Opening a file needs x on every directory in its path.",
      modelAnswer:
        "On a directory, r only lets you list the names inside; x is the permission to pass through it and open what's inside. Marco's g+r gave the dispatch group r on the directory but no x, so reportgen could see deliveries.csv but not open it. Adding group x to the directories (750) and group read to the files (640) fixed it, and the script now uses umask 027 so new exports get the same modes. Others still get nothing because the data contains customer names.",
    },
    {
      id: "predict-umask",
      kind: "mcq",
      prompt: "A script runs `umask 027` and then `mkdir out` and `touch out/report.csv`. What modes do they get?",
      options: ["out 750, report.csv 640", "out 755, report.csv 644", "out 027, report.csv 027", "out 750, report.csv 750"],
      answer: 0,
      explanation: "Directories start from 777 and files from 666; umask 027 removes w for the group and all bits for others: 777-027 = 750, 666 & ~027 = 640.",
    },
  ],
  debrief: {
    solution: `\`reportgen\` falls under the **group** class (\`dispatch\`). At each level of \`/srv/handoff/2026-03-01/deliveries.csv\` it needs group x on directories and group r on the file:

${F}text
drwxr-x---  /srv/handoff                  ok
drwxr-----  /srv/handoff/2026-03-01       group r but no x  <- blocks open()
-rw-r-----  .../deliveries.csv            ok
drwx------  /srv/handoff/2026-03-02       no group access at all (umask 077)
${F}

${F}bash
sudo chmod 750 /srv/handoff/2026-03-01 /srv/handoff/2026-03-02
sudo chmod 640 /srv/handoff/2026-03-0{1,2}/deliveries.csv
# handoff-export.sh: umask 077 -> umask 027
${F}

\`sudo chmod -R g+rX,o= ...\` is an equivalent fix. The grader checks access for reportgen and lena and the maximum modes, not which chmod syntax you used.`,
    commonMistakes: [
      "Adding r to the directory and expecting that to allow opening files — directories need x for that.",
      "chmod -R 777 (or 755/644): the error disappears and customer data becomes readable or writable by every account.",
      "Fixing today's files by hand but leaving umask 077 in the script, so the report fails again tomorrow.",
      "chmod -R g+x on everything, which marks data files as executable; capital X only affects directories.",
      "Checking only the file's own mode and never the parent directories.",
    ],
    realWorld:
      "namei -l /path/to/file prints the mode of every path component in one go and is the fastest way to find the blocking directory on a real server. For shared directories, teams also set the setgid bit (chmod g+s) so new files inherit the directory's group, and default ACLs (setfacl -d) when more than one group needs access. systemd units can set UMask= for services instead of relying on a line inside a script.",
  },
  review: [
    {
      id: "lx-dir-x-bit",
      skill: "lx.permissions",
      variants: [
        {
          id: "lx-dir-x-bit-a",
          kind: "mcq",
          prompt: "`/srv/data` is `drwxr--r-- root ops` and `/srv/data/a.txt` is `-rw-r--r--`. Can user `ana` (in group ops) run `cat /srv/data/a.txt`?",
          options: ["Yes, both are group-readable", "No, the directory lacks group x", "No, the file lacks group w", "Only with ls first"],
          answer: 1,
          explanation: "Opening a file needs x on its directory. r on the directory only lists names.",
        },
        {
          id: "lx-dir-x-bit-b",
          kind: "mcq",
          prompt: "`/srv/drop` is `drwx--x--- root ops`. What can a member of ops do with `/srv/drop/known-name.csv` (mode 640)?",
          options: [
            "Nothing at all",
            "List the directory but not read the file",
            "Read the file if they know its name, but not list the directory",
            "Read, list and delete files",
          ],
          answer: 2,
          explanation: "x without r on a directory lets you reach entries by exact name but not list them.",
        },
        {
          id: "lx-dir-x-bit-c",
          kind: "mcq",
          prompt: "Which single command lets the group open files in `/srv/labels/v8` (currently `drwxr-----`) without changing anything else?",
          options: ["chmod g+r /srv/labels/v8", "chmod g+x /srv/labels/v8", "chmod o+x /srv/labels/v8", "chmod 777 /srv/labels/v8"],
          answer: 1,
          explanation: "The group already has r; it lacks x, the permission to pass through the directory.",
        },
      ],
    },
    {
      id: "lx-octal-umask",
      skill: "lx.permissions",
      variants: [
        {
          id: "lx-octal-umask-a",
          kind: "short",
          prompt: "What octal mode is `rwxr-x---`?",
          accept: ["750", "0750"],
          explanation: "rwx = 4+2+1 = 7, r-x = 4+1 = 5, --- = 0.",
        },
        {
          id: "lx-octal-umask-b",
          kind: "short",
          prompt: "With `umask 027`, what mode does a newly created regular file get? Answer in octal.",
          accept: ["640", "0640"],
          explanation: "Files start from 666; removing 027 leaves 640 (rw-r-----).",
        },
        {
          id: "lx-octal-umask-c",
          kind: "short",
          prompt: "With `umask 077`, what mode does a new directory get? Answer in octal.",
          accept: ["700", "0700"],
          explanation: "Directories start from 777; removing 077 leaves 700 (owner only).",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `db-01`, nightly backups go to `/var/backups/tracker/` (`drwxr-x--- postgres backup`). The off-site sync agent runs as `rsyncer`, which is in group `backup`. New dump files are created `-rw------- postgres postgres` and the sync agent skips them with 'Permission denied'.",
    question: {
      id: "transfer-backup-perms",
      kind: "mcq",
      prompt: "What is the least-privilege fix that keeps working for future dumps?",
      options: [
        "chmod -R 777 /var/backups/tracker",
        "Add rsyncer to the postgres group and the sudo group",
        "Make the dump job create files with group backup and mode 640 (umask 027, chgrp backup or a setgid directory)",
        "Run the sync agent as root",
      ],
      answer: 2,
      explanation:
        "The directory already allows the backup group through. The files need group backup and group read, which a umask of 027 plus the right group (chgrp, or g+s on the directory) provides for every future dump.",
    },
  },
  refresher: {
    body: `\`ls -l\` shows three triplets: owner, group, others. A user gets exactly one of them. r=4, w=2, x=1, so \`rw-r-----\` is 640.

On a directory, **r** lists names, **x** lets you go through it to open anything inside, **w** lets you create or delete entries. To read \`/a/b/file\` you need x on \`/a\` and \`/a/b\`, and r on \`file\`.

New files get \`666 - umask\`, new directories \`777 - umask\`. \`umask 027\` = group can read and enter, others get nothing.`,
    practice: {
      id: "refresher-which-class",
      kind: "mcq",
      prompt: "File `-rw-r----- marco dispatch report.csv`. User `ana` is not marco and not in dispatch. Which permissions does she have on the file?",
      options: ["rw-", "r--", "---", "rw-r-----"],
      answer: 2,
      explanation: "ana is neither the owner nor in the group, so the 'others' triplet (---) applies.",
    },
  },
};
