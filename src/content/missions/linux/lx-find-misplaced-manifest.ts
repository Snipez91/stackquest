import type { MissionInput } from "@/content/schema";

const F = "```";

const header = "record_type,tracking_id,consignee,depot,pieces,weight_kg";

const realManifest = `${header}
SHIP,LMN40210001,Harbourside Foods,BRS-2,4,38.5
SHIP,LMN40210002,Kestrel Pharmacy,BRS-2,1,2.2
SHIP,LMN40210003,Oakfield Joinery,BRS-1,7,141.0
SHIP,LMN40210004,Moor Lane Garage,BRS-1,2,19.8
SHIP,LMN40210005,Northgate Library,BRS-3,3,24.0
SHIP,LMN40210006,Avon Print Works,BRS-3,5,62.7
TRAILER,6
`;

const partialManifest = `${header}
SHIP,LMN40210001,Harbourside Foods,BRS-2,4,38.5
SHIP,LMN40210002,Kestrel Pharmacy,BRS-2,1,2.2
`;

const exportLog = `2026-03-01 23:30:02 export[20114]: starting carrier manifest export (config /etc/lumen/export.conf)
2026-03-01 23:30:03 export[20114]: wrote manifest-2026-03-01.csv (9 records)
2026-03-01 23:30:03 export[20114]: done
2026-03-02 01:00:01 export[20981]: starting carrier manifest export (config /etc/lumen/export.conf)
2026-03-02 01:00:01 export[20981]: staging in /var/tmp/lumen-export
2026-03-02 01:00:02 export[20981]: ERROR: connection to db-01.lumen.internal:5432 lost after 2 records; aborting
2026-03-02 02:00:01 export[21377]: starting carrier manifest export (config /etc/lumen/export.conf)
2026-03-02 02:00:02 export[21377]: wrote manifest-2026-03-02.csv (6 records)
2026-03-02 02:00:02 export[21377]: done
`;

const exportConf = `# Carrier manifest export (runs from cron as lumen-export)
# output_dir is where the carrier's SFTP account (sftp-carrier) collects files.
db_host = db-01.lumen.internal
staging_dir = /var/tmp/lumen-export
output_dir = /srv/exports/archive/2026/03
`;

export const lxFindMisplacedManifest: MissionInput = {
  slug: "lx-find-misplaced-manifest",
  version: 1,
  track: "linux",
  tier: "beginner",
  order: 1,
  title: "The carrier manifest that never reached the outbox",
  summary:
    "Tonight's carrier manifest was written, but not where the carrier collects it. Navigate the server, find the right copy among look-alikes, deliver it, and fix the export setting.",
  minutes: 20,
  assessmentTypes: ["configure-system", "interpret-output"],
  skills: ["lx.navigation", "lx.find-search"],
  appliesSkills: [],
  prerequisites: [],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#ops",
    body: `Morning. The Bristol carrier says they found no manifest for 2 March in our outbox, so 6 consignments are sitting on the dock.

The export job on \`api-01\` claims it wrote \`manifest-2026-03-02.csv\` at 02:00 (see \`/var/log/lumen/export.log\`), but it is not in \`/srv/exports/outbox\`. Marco edited \`/etc/lumen/export.conf\` yesterday, so I suspect it went somewhere else.

Please:

1. Find the **complete** manifest for 2 March and put a copy in \`/srv/exports/outbox/\` under the same name. A complete manifest ends with a \`TRAILER\` line.
2. Fix \`output_dir\` in \`/etc/lumen/export.conf\` so tomorrow's run lands in the outbox.

Leave the original where you find it — finance audits that folder.`,
  },
  objectives: [
    "Use pwd, cd and ls with absolute and relative paths to explore an unfamiliar server",
    "Explain what the main top-level directories (/etc, /var, /srv, /tmp, /home) are for",
    "Search a directory tree by file name with find",
    "Verify a found file's content before acting on it, instead of trusting the name",
  ],
  concept: {
    title: "One tree, absolute paths, and conventions about where things live",
    body: `Linux has a single directory tree that starts at \`/\`. Every file has an **absolute path** from the root (\`/srv/exports/outbox\`) and can also be reached by a **relative path** from your current directory (\`pwd\` shows it). \`..\` means "parent", \`.\` means "here", \`~\` means your home.

The layout follows conventions (the Filesystem Hierarchy Standard), so you can guess where to look:

| Path | Holds |
| --- | --- |
| \`/etc\` | configuration (text files you can read) |
| \`/var/log\` | logs; \`/var/tmp\` temp files that survive reboots |
| \`/srv\`, \`/opt\` | data served by this host, add-on software |
| \`/home/NAME\` | users' files; \`/tmp\` scratch space |

When you don't know the directory, **search instead of guessing**:

${F}bash
find /srv /var/tmp -name 'manifest-*.csv'      # by name (quote the glob!)
find /srv -type d -name outbox                  # only directories
${F}

\`find\` walks every directory under the starting points and prints each match's path. A name is not proof, though: a crashed job can leave a file with the right name and the wrong content. Check with \`ls -l\` (size, time), \`wc -l\` and \`tail\` before you act.`,
  },
  workedExample: {
    title: "Worked example: which invoice-batch.csv did the billing job send?",
    body: `Billing reports that \`invoice-batch.csv\` is "missing" on \`db-01\`.

**1. Get your bearings.**

${F}bash
pwd                      # /home/ops
ls /srv                  # billing  backups
ls -l /srv/billing       # inbox  sent   (no batch in inbox)
${F}

**2. Search by name across the likely trees.** Quote the pattern so the shell passes it to \`find\` unexpanded; send "Permission denied" noise to \`/dev/null\`.

${F}bash
find /srv /var/tmp /tmp -name 'invoice-batch*.csv' 2>/dev/null
# /srv/backups/2026-02/invoice-batch.csv
# /var/tmp/billing/invoice-batch.csv
${F}

**3. Compare the candidates before trusting either.**

${F}bash
ls -l /srv/backups/2026-02/invoice-batch.csv /var/tmp/billing/invoice-batch.csv
wc -l /srv/backups/2026-02/invoice-batch.csv /var/tmp/billing/invoice-batch.csv
tail -n 1 /var/tmp/billing/invoice-batch.csv
${F}

The \`/var/tmp\` copy is 3 lines with no end-of-file marker: a staging file from a failed run. The backup copy is complete, so that is the one to restore — with \`cp\`, keeping the original in place.`,
  },
  simulationNote:
    "You are on a simulated Ubuntu server. Files, ownership and permissions behave like a real system, so find, ls, cat, tail, wc and cp work as usual and their results depend on what you have changed. The cron job itself does not run; only its log and config exist. Paths, find options and the habit of verifying content transfer directly to real servers.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T08:40:00Z",
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "ops", uid: 1000, groups: ["exports"], home: "/home/ops" },
            { name: "marco", uid: 1001, groups: ["exports"], home: "/home/marco" },
            { name: "lumen-export", uid: 990, groups: ["exports"], home: "/var/lib/lumen-export", shell: "/usr/sbin/nologin" },
            { name: "sftp-carrier", uid: 991, groups: ["exports"], home: "/srv/exports", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/srv/exports", type: "dir", mode: "0755", owner: "root", group: "exports" },
            { path: "/srv/exports/outbox", type: "dir", mode: "2775", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/outbox/README", content: "Carrier SFTP pickup. Files are collected at 06:00 and 10:00 and moved to ../sent.\n", owner: "root", group: "exports" },
            { path: "/srv/exports/sent", type: "dir", mode: "2775", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/sent/manifest-2026-02-28.csv", content: `${header}\nSHIP,LMN40190001,Harbourside Foods,BRS-2,2,12.0\nTRAILER,1\n`, owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/sent/manifest-2026-03-01.csv", content: `${header}\nSHIP,LMN40200001,Oakfield Joinery,BRS-1,3,55.0\nSHIP,LMN40200002,Avon Print Works,BRS-3,1,8.5\nTRAILER,2\n`, owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive", type: "dir", mode: "0755", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive/2026", type: "dir", mode: "0755", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive/2026/02", type: "dir", mode: "0755", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive/2026/02/manifest-2026-02-28.csv", content: `${header}\nSHIP,LMN40190001,Harbourside Foods,BRS-2,2,12.0\nTRAILER,1\n`, owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive/2026/03", type: "dir", mode: "0755", owner: "lumen-export", group: "exports" },
            { path: "/srv/exports/archive/2026/03/manifest-2026-03-02.csv", content: realManifest, owner: "lumen-export", group: "exports" },
            { path: "/var/tmp/lumen-export", type: "dir", mode: "0755", owner: "lumen-export", group: "exports" },
            { path: "/var/tmp/lumen-export/manifest-2026-03-02.csv", content: partialManifest, owner: "lumen-export", group: "exports" },
            { path: "/var/log/lumen", type: "dir", mode: "0755", owner: "root", group: "root" },
            { path: "/var/log/lumen/export.log", content: exportLog, owner: "lumen-export", group: "exports" },
            { path: "/etc/lumen", type: "dir", mode: "0755", owner: "root", group: "root" },
            { path: "/etc/lumen/export.conf", content: exportConf, mode: "0664", owner: "root", group: "exports" },
            { path: "/home/ops/notes.txt", content: "on-call: carrier pickup is 06:00 and 10:00 from /srv/exports/outbox\n", owner: "ops", group: "ops" },
          ],
        },
      ],
      start: { host: "api-01", user: "ops" },
      editableFiles: ["/etc/lumen/export.conf"],
    },
    checks: [
      {
        id: "outbox-complete-manifest",
        name: "The outbox holds the complete 2 March manifest",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/srv/exports/outbox/manifest-2026-03-02.csv", pattern: "^TRAILER,6$" },
            { type: "file_matches", path: "/srv/exports/outbox/manifest-2026-03-02.csv", pattern: "^SHIP,LMN40210006," },
          ],
        },
        feedback: {
          what: "/srv/exports/outbox/manifest-2026-03-02.csv is missing, or it does not contain all 6 shipments and the TRAILER,6 line.",
          why: "The carrier only loads consignments listed in the file. A partial file from the aborted 01:00 run would leave 4 consignments on the dock and look as if it had been delivered.",
          next: "Run find /srv /var/tmp -name 'manifest-2026-03-02.csv', then compare the candidates with wc -l and tail -n 1. Copy the one ending in TRAILER,6 into /srv/exports/outbox/.",
        },
      },
      {
        id: "carrier-can-read",
        name: "The carrier's pickup account can read the delivered file",
        assert: { type: "access", path: "/srv/exports/outbox/manifest-2026-03-02.csv", user: "sftp-carrier", access: "r", expect: true },
        feedback: {
          what: "The sftp-carrier account cannot read the manifest in the outbox (or the file is not there).",
          why: "Delivering a file the collector cannot open is the same as not delivering it.",
          next: "Use a plain cp into the outbox and check the result with ls -l /srv/exports/outbox. A normal copy is readable by others.",
        },
      },
      {
        id: "original-kept",
        name: "The archived original is still in place",
        assert: { type: "file_matches", path: "/srv/exports/archive/2026/03/manifest-2026-03-02.csv", pattern: "^TRAILER,6$" },
        feedback: {
          what: "The manifest is no longer in /srv/exports/archive/2026/03/.",
          why: "Priya asked for a copy: finance audits the archive, so the original must stay where the job wrote it.",
          next: "Use cp (copy) rather than mv (move). Reset the lab if you need the original back.",
        },
      },
      {
        id: "config-points-at-outbox",
        name: "export.conf sends future manifests to the outbox",
        assert: { type: "file_matches", path: "/etc/lumen/export.conf", pattern: "^\\s*output_dir\\s*=\\s*/srv/exports/outbox/?\\s*$" },
        feedback: {
          what: "output_dir in /etc/lumen/export.conf is not /srv/exports/outbox.",
          why: "Without this, tomorrow's 02:00 run writes to the archive again and the carrier misses another night.",
          next: "Open /etc/lumen/export.conf in the editor (or use sed) and set the line to: output_dir = /srv/exports/outbox",
        },
      },
    ],
    solution: [
      "cat /var/log/lumen/export.log",
      "find /srv /var/tmp -name 'manifest-2026-03-02.csv'",
      "wc -l /srv/exports/archive/2026/03/manifest-2026-03-02.csv /var/tmp/lumen-export/manifest-2026-03-02.csv",
      "tail -n 1 /srv/exports/archive/2026/03/manifest-2026-03-02.csv",
      "cp /srv/exports/archive/2026/03/manifest-2026-03-02.csv /srv/exports/outbox/",
      "ls -l /srv/exports/outbox",
      { write: "/etc/lumen/export.conf", content: exportConf.replace("output_dir = /srv/exports/archive/2026/03", "output_dir = /srv/exports/outbox") },
    ],
    wrongSolutions: [
      {
        label: "Copies the first match, the partial staging file from the aborted run",
        steps: [
          "cp /var/tmp/lumen-export/manifest-2026-03-02.csv /srv/exports/outbox/",
          "sed -i 's|^output_dir = .*|output_dir = /srv/exports/outbox|' /etc/lumen/export.conf",
        ],
      },
      {
        label: "Delivers the right file but leaves the config pointing at the archive",
        steps: ["cp /srv/exports/archive/2026/03/manifest-2026-03-02.csv /srv/exports/outbox/"],
      },
      {
        label: "Copies to /srv/exports instead of the outbox",
        steps: [
          "cd /srv/exports/archive/2026/03",
          "cp manifest-2026-03-02.csv ../../..",
          "sed -i 's|^output_dir = .*|output_dir = /srv/exports/outbox|' /etc/lumen/export.conf",
        ],
      },
    ],
    starterCommands: ["pwd", "ls -l /srv/exports", "cat /var/log/lumen/export.log", "find /srv -name 'manifest-*'"],
  },
  successCriteria: [
    "/srv/exports/outbox/manifest-2026-03-02.csv contains all 6 shipments and ends with TRAILER,6",
    "The sftp-carrier account can read the delivered file",
    "The original stays in the archive directory",
    "output_dir in /etc/lumen/export.conf is /srv/exports/outbox",
  ],
  hints: [
    "Start from the evidence: `cat /var/log/lumen/export.log` and `cat /etc/lumen/export.conf`. The log tells you the file name; the config tells you where the job was told to write.",
    "You don't have to trust the config either. `find /srv /var/tmp -name 'manifest-2026-03-02.csv'` lists every file with that name. How many are there?",
    "Two files share the name. Compare them: `wc -l` on both, and `tail -n 1` on each. Which one ends with `TRAILER,6`? The other was staged by the 01:00 run that lost its database connection.",
    "Copy the complete one with `cp /srv/exports/archive/2026/03/manifest-2026-03-02.csv /srv/exports/outbox/`, then change the `output_dir =` line in `/etc/lumen/export.conf` to `/srv/exports/outbox` (editor, or `sed -i 's|^output_dir = .*|output_dir = /srv/exports/outbox|' /etc/lumen/export.conf`).",
  ],
  questions: [
    {
      id: "where-was-it",
      kind: "short",
      prompt: "What is the absolute path of the directory where the complete 2 March manifest was written?",
      accept: ["/srv/exports/archive/2026/03", "/srv/exports/archive/2026/03/"],
      acceptPatterns: ["^/srv/exports/archive/2026/03/?(manifest-2026-03-02\\.csv)?$"],
      placeholder: "/...",
      explanation:
        "The job used output_dir = /srv/exports/archive/2026/03 from Marco's edit. The look-alike in /var/tmp/lumen-export is the partial staging file from the 01:00 run that aborted after 2 records.",
    },
    {
      id: "predict-relative-path",
      kind: "mcq",
      prompt: "You run these commands. Which directory does the last `pwd` print?",
      code: "cd /srv/exports/archive/2026/03\ncd ../../..\ncd outbox\npwd",
      codeLanguage: "bash",
      options: ["/srv/exports/outbox", "/srv/exports/archive/outbox", "/srv/outbox", "/outbox"],
      answer: 0,
      explanation:
        "Each .. goes up one level: 03 -> 2026 -> archive -> exports. From /srv/exports, the relative path outbox is /srv/exports/outbox.",
    },
    {
      id: "explain-verify",
      kind: "explain",
      prompt: "find returned two files called manifest-2026-03-02.csv. Explain to Sam how you decided which one to deliver, and why the name alone was not enough.",
      concepts: [
        { label: "Same name, different content (partial or incomplete copy)", anyOf: ["partial", "incomplete", "truncated", "aborted", "failed run", "only 2", "2 records", "staging", "half"] },
        { label: "Checked the content (trailer, line count, size)", anyOf: ["trailer", "wc", "line count", "lines", "tail", "size", "content", "6 records", "six"] },
        { label: "Name or location alone does not prove it is correct", anyOf: ["name alone", "same name", "names match", "not enough", "can't trust", "cannot trust", "don't trust", "verify", "check"] },
      ],
      minConcepts: 2,
      explanation:
        "Two jobs wrote the same file name: the 01:00 run staged a partial file before it aborted, the 02:00 run wrote the full file to the wrong directory. Only the content (line count, TRAILER,6) tells them apart.",
      modelAnswer:
        "Both files have the same name, so the name was not enough. The copy in /var/tmp/lumen-export was the staging file from the 01:00 run that aborted after 2 records, so it is partial. I checked the content with wc -l and tail: the archive copy has all 6 shipment lines and ends with the TRAILER,6 line, so that is the complete manifest and the one I copied to the outbox.",
    },
  ],
  debrief: {
    solution: `The log gave the file name and the config gave the (wrong) directory, but \`find\` is what proved there were **two** candidates:

${F}bash
find /srv /var/tmp -name 'manifest-2026-03-02.csv'
# /srv/exports/archive/2026/03/manifest-2026-03-02.csv   8 lines, ends TRAILER,6
# /var/tmp/lumen-export/manifest-2026-03-02.csv          3 lines, no trailer
cp /srv/exports/archive/2026/03/manifest-2026-03-02.csv /srv/exports/outbox/
${F}

Then \`output_dir = /srv/exports/outbox\` in \`/etc/lumen/export.conf\` fixes the cause, not only tonight's symptom. \`cp\` keeps the audit copy in the archive; \`mv\` would have removed it (and fails anyway here, because \`ops\` cannot write to the archive directory).`,
    commonMistakes: [
      "Copying the first find result without checking its content, delivering the partial staging file.",
      "Fixing tonight's delivery but not the config, so the same thing happens at 02:00 tomorrow.",
      "Using mv instead of cp and removing the copy finance audits.",
      "Writing an unquoted glob (find / -name manifest-*.csv), which the shell may expand in the current directory before find sees it.",
      "Mixing up relative and absolute paths, so the copy lands in /srv/exports instead of the outbox.",
    ],
    realWorld:
      "On real servers, find is often combined with -mtime, -newer or -size to narrow results, and locate/plocate offers a faster (but possibly stale) index. Many teams also make export jobs write to a temporary name and rename it only when complete (write to .tmp, then mv), so a half-written file never carries the final name — the problem the staging copy illustrates here.",
  },
  review: [
    {
      id: "lx-fhs-where",
      skill: "lx.navigation",
      variants: [
        {
          id: "lx-fhs-where-a",
          kind: "mcq",
          prompt: "A service on web-01 is misbehaving and you want its configuration file. Which directory do you check first?",
          options: ["/etc", "/var/log", "/tmp", "/home"],
          answer: 0,
          explanation: "/etc holds host configuration by convention; /var/log holds logs.",
        },
        {
          id: "lx-fhs-where-b",
          kind: "mcq",
          prompt: "You need yesterday's log output from the nginx web server. Where does it most likely live?",
          options: ["/etc/nginx", "/var/log/nginx", "/srv/nginx", "/opt/nginx/bin"],
          answer: 1,
          explanation: "Variable data such as logs goes under /var; logs specifically under /var/log.",
        },
        {
          id: "lx-fhs-where-c",
          kind: "mcq",
          prompt: "Which directory is shared scratch space that any user can write to and that may be cleared at reboot?",
          options: ["/srv", "/var/log", "/tmp", "/etc"],
          answer: 2,
          explanation: "/tmp is world-writable (with the sticky bit) scratch space and is often cleared on reboot.",
        },
      ],
    },
    {
      id: "lx-relative-paths",
      skill: "lx.navigation",
      variants: [
        {
          id: "lx-relative-paths-a",
          kind: "short",
          prompt: "Your current directory is `/var/log/nginx`. What absolute path does `../lumen/export.log` refer to?",
          accept: ["/var/log/lumen/export.log"],
          explanation: ".. from /var/log/nginx is /var/log, so the path is /var/log/lumen/export.log.",
        },
        {
          id: "lx-relative-paths-b",
          kind: "short",
          prompt: "Your current directory is `/srv/exports/outbox`. What absolute path does `../../backups` refer to?",
          accept: ["/srv/backups", "/srv/backups/"],
          explanation: "Two levels up from /srv/exports/outbox is /srv; then backups.",
        },
      ],
    },
    {
      id: "lx-find-by-name",
      skill: "lx.find-search",
      variants: [
        {
          id: "lx-find-by-name-a",
          kind: "short",
          prompt: "Write a command that lists every file named `route-plan.json` anywhere under `/srv`.",
          accept: ["find /srv -name route-plan.json", "find /srv -name 'route-plan.json'", "find /srv -type f -name route-plan.json"],
          acceptPatterns: ["^find\\s+/srv/?\\s+(-type\\s+f\\s+)?-i?name\\s+['\"]?route-plan\\.json['\"]?(\\s+-type\\s+f)?(\\s+2>\\s*/dev/null)?$"],
          explanation: "find START -name PATTERN walks the whole tree below START. Quoting the name is a good habit.",
        },
        {
          id: "lx-find-by-name-b",
          kind: "short",
          prompt: "Write a command that lists every directory (not file) named `outbox` under `/srv`.",
          accept: ["find /srv -type d -name outbox", "find /srv -name outbox -type d"],
          acceptPatterns: ["^find\\s+/srv/?\\s+(-type\\s+d\\s+-i?name\\s+['\"]?outbox['\"]?|-i?name\\s+['\"]?outbox['\"]?\\s+-type\\s+d)(\\s+2>\\s*/dev/null)?$"],
          explanation: "-type d restricts matches to directories; -name outbox matches the last path component.",
        },
        {
          id: "lx-find-by-name-c",
          kind: "short",
          prompt: "Write a command that lists every `.csv` file under `/var/tmp`. Quote the pattern.",
          accept: ["find /var/tmp -name '*.csv'", "find /var/tmp -type f -name '*.csv'", "find /var/tmp -name \"*.csv\""],
          acceptPatterns: ["^find\\s+/var/tmp/?\\s+(-type\\s+f\\s+)?-i?name\\s+(['\"])\\*\\.csv\\2(\\s+-type\\s+f)?(\\s+2>\\s*/dev/null)?$"],
          explanation: "Quote *.csv so the shell passes the glob to find instead of expanding it in your current directory.",
        },
      ],
    },
    {
      id: "lx-verify-candidate",
      skill: "lx.find-search",
      variants: [
        {
          id: "lx-verify-candidate-a",
          kind: "mcq",
          prompt: "find returns two `backup.sql` files: 4 KB from 01:12 and 380 MB from 01:47. The backup job's log says it was retried after a failure. What do you do?",
          options: [
            "Restore the first result find printed",
            "Inspect both (size, time, last lines) and use the complete one from the successful retry",
            "Restore the smaller one because it is faster",
            "Delete both and wait for tonight's run",
          ],
          answer: 1,
          explanation: "A failed attempt can leave a file with the right name. Verify content before you act on a search result.",
        },
        {
          id: "lx-verify-candidate-b",
          kind: "mcq",
          prompt: "Which command best shows whether `/var/tmp/export/batch.csv` was fully written, given complete files end with an `EOF,<count>` line?",
          options: ["ls /var/tmp/export", "tail -n 1 /var/tmp/export/batch.csv", "pwd", "find /var/tmp -name batch.csv"],
          answer: 1,
          explanation: "tail -n 1 prints the last line, so you can see whether the end marker is present.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko says the dispatch dashboard on `web-01` is serving an old logo. The deploy notes say the new file is `logo-2026.svg`, and nginx serves from `/srv/www/dispatch/`. Nobody knows where the deploy script put the new file.",
    question: {
      id: "transfer-find-logo",
      kind: "short",
      prompt: "Write one command that searches `/srv` and `/tmp` for that file by name, hiding permission errors.",
      accept: ["find /srv /tmp -name logo-2026.svg 2>/dev/null", "find /srv /tmp -name 'logo-2026.svg' 2>/dev/null"],
      acceptPatterns: ["^find\\s+(/srv/?\\s+/tmp/?|/tmp/?\\s+/srv/?)\\s+(-type\\s+f\\s+)?-i?name\\s+['\"]?logo-2026\\.svg['\"]?(\\s+-type\\s+f)?\\s+2>\\s*/dev/null$"],
      explanation: "find accepts several starting points. 2>/dev/null discards the 'Permission denied' messages on stderr while keeping matches on stdout.",
    },
  },
  refresher: {
    body: `Every file has one **absolute path** from \`/\`, like \`/srv/exports/outbox/file.csv\`. \`pwd\` prints where you are; \`cd DIR\` moves you; \`..\` is the parent directory.

Config lives in \`/etc\`, logs in \`/var/log\`, served data in \`/srv\`, scratch files in \`/tmp\` and \`/var/tmp\`.

When you don't know where a file is, ask the filesystem: \`find /srv -name 'name.csv'\`. Then check what you found (\`ls -l\`, \`wc -l\`, \`tail\`) — two files can share a name.`,
    practice: {
      id: "refresher-pwd-after-cd",
      kind: "mcq",
      prompt: "You are in `/home/ops`. You run `cd /var/log` and then `cd ..`. What does `pwd` print?",
      options: ["/home", "/var", "/var/log/..", "/"],
      answer: 1,
      explanation: "cd /var/log is absolute; .. then moves to its parent, /var.",
    },
  },
};
