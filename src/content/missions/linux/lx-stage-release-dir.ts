import type { MissionInput } from "@/content/schema";

const F = "```";

const liveConfig = `# tracker.yml — production settings (web-01)
listen: 0.0.0.0:8081
db_host: db-01.lumen.internal
api_key: lmn_live_7f3c2a91e0
log_dir: /var/log/tracker
`;

const exampleConfig = `# tracker.yml.example — copy to conf/tracker.yml and fill in
listen: 127.0.0.1:8081
db_host: localhost
api_key: CHANGE_ME
log_dir: /tmp/tracker
`;

const bin = (v: string) => `#!/bin/bash
# tracker launcher (stub for the lab)
if [ "$1" = "--version" ]; then
  echo "tracker ${v}"
  exit 0
fi
echo "tracker ${v}: starting with $(dirname "$0")/../conf/tracker.yml"
`;

const releaseNotes = `Release checklist — tracker (web-01)

Layout of every release under /srv/releases/tracker-X.Y.Z/:
  bin/tracker          the launcher (must stay executable)
  static/              web assets: index.html, app.js, styles.css (no *.tmp build leftovers)
  conf/tracker.yml     the LIVE config, carried over from the current release
                       (never the .example — it has placeholder credentials)

Go-live: point /srv/releases/current at the new release directory.
Keep the previous release directory untouched for rollback.
`;

export const lxStageReleaseDir: MissionInput = {
  slug: "lx-stage-release-dir",
  version: 1,
  track: "linux",
  tier: "beginner",
  order: 2,
  title: "Stage tracker 2.4.1 without breaking the rollback",
  summary:
    "Assemble a release directory from build output with mkdir, cp and mv, carry over the live config, leave out build leftovers, and switch the current symlink so rollback stays one command away.",
  minutes: 25,
  assessmentTypes: ["configure-system", "order-steps"],
  skills: ["lx.file-ops"],
  appliesSkills: ["lx.navigation"],
  prerequisites: ["lx-find-misplaced-manifest"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#deploys",
    body: `Hi — I'm stuck in a meeting and tracker 2.4.1 needs to go out on \`web-01\` before the 10:00 dispatch wave.

The build output is in \`~/build/tracker-2.4.1/\` (your home on web-01). I already ran \`mkdir -p /srv/releases/tracker-2.4.1/{bin,conf,static}\`, but nothing is in there yet.

Please stage it following \`/srv/releases/RELEASE.txt\`: launcher in \`bin/\`, web assets in \`static/\` (the build leaves \`*.tmp\` files around, don't ship those), and **the live \`tracker.yml\` from 2.4.0**, not the example. Then point \`/srv/releases/current\` at 2.4.1.

Don't touch \`tracker-2.4.0\`: if 2.4.1 misbehaves, rollback is just moving \`current\` back.`,
  },
  objectives: [
    "Create directory trees with mkdir -p",
    "Copy files and directory contents with cp and cp -r, and predict where the copy lands when the destination already exists",
    "Rename and move files with mv",
    "Repoint a symbolic link to a directory with ln -sfn and verify it with readlink",
  ],
  concept: {
    title: "Paths decide what cp, mv and ln actually do",
    body: `The same command does different things depending on whether the **destination already exists and is a directory**:

| Command | \`DEST\` missing | \`DEST\` is an existing directory |
| --- | --- | --- |
| \`cp file DEST\` | creates file \`DEST\` | creates \`DEST/file\` |
| \`cp -r dir DEST\` | creates \`DEST\` as a copy of \`dir\` | creates \`DEST/dir\` (nested!) |
| \`mv a DEST\` | renames \`a\` to \`DEST\` | moves \`a\` into \`DEST/\` |

To copy a directory's **contents** into a directory that already exists, copy \`dir/.\` or \`dir/*\`: \`cp -r build/static/. release/static/\`. (\`*\` skips dotfiles and lets you filter; \`.\` copies everything.)

\`cp\` leaves the source in place; \`mv\` removes it. \`cp -p\` (or \`-a\`) also preserves mode and timestamps.

A **symbolic link** is a tiny file containing a path. \`current -> /srv/releases/tracker-2.4.0\` lets every script use \`/srv/releases/current/...\` while the real directory changes. Repointing it has a trap: \`ln -sf NEW current\` *follows* the existing link because it points at a directory, and creates the new link **inside** the old release. Use \`-n\` (treat the link itself as the destination):

${F}bash
ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current
readlink -f /srv/releases/current     # verify
${F}`,
  },
  workedExample: {
    title: "Worked example: publishing a new label template set",
    body: `The label printer service reads \`/srv/labels/active\`, a symlink to \`/srv/labels/v7\`. The new templates are in \`~/out/v8/\` (\`templates/\`, \`fonts/\`, \`render.log\`, \`templates/a6.tmp\`).

**1. Create the target layout.**

${F}bash
mkdir -p /srv/labels/v8/templates /srv/labels/v8/fonts
${F}

**2. Copy contents, not the directory itself.** \`templates/\` already exists in v8, so copying the directory would nest it:

${F}bash
cp -r ~/out/v8/templates/. /srv/labels/v8/templates/
cp -r ~/out/v8/fonts/. /srv/labels/v8/fonts/
rm /srv/labels/v8/templates/a6.tmp      # build leftover
ls -R /srv/labels/v8                     # check before going live
${F}

**3. Switch the link atomically, and verify.**

${F}bash
ln -sfn /srv/labels/v8 /srv/labels/active
readlink -f /srv/labels/active           # /srv/labels/v8
${F}

\`v7\` is untouched, so rollback is \`ln -sfn /srv/labels/v7 /srv/labels/active\`.`,
  },
  simulationNote:
    "The filesystem is simulated, including permissions, symlinks and the cp/mv destination rules described here. The launcher is a small bash stub so you can run it to test the release; nothing actually serves traffic. GNU coreutils on a real server behave the same way for every command used in this mission.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:20:00Z",
      hosts: [
        {
          name: "web-01",
          users: [
            { name: "ops", uid: 1000, groups: ["deploy"], home: "/home/ops" },
            { name: "marco", uid: 1001, groups: ["deploy"], home: "/home/marco" },
            { name: "tracker", uid: 995, groups: [], home: "/srv/releases", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/home/ops/build/tracker-2.4.1", type: "dir", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/tracker", content: bin("2.4.1"), mode: "0755", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static", type: "dir", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static/index.html", content: "<!doctype html><title>Lumen tracker</title><script src=\"app.js\"></script>\n", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static/app.js", content: "/* tracker 2.4.1 */\nconsole.log('tracker ui 2.4.1');\n", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static/styles.css", content: "body{font-family:sans-serif}\n", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static/app.js.tmp", content: "/* partial bundle */\n", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/static/styles.css.tmp", content: "/* partial */\n", owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/tracker.yml.example", content: exampleConfig, owner: "ops", group: "ops" },
            { path: "/home/ops/build/tracker-2.4.1/build.log", content: "bundling static/ ... ok\nlinking tracker ... ok\nbuild 2.4.1 complete\n", owner: "ops", group: "ops" },
            { path: "/srv/releases", type: "dir", mode: "2775", owner: "root", group: "deploy" },
            { path: "/srv/releases/RELEASE.txt", content: releaseNotes, owner: "root", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/bin", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/bin/tracker", content: bin("2.4.0"), mode: "0775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/static", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/static/index.html", content: "<!doctype html><title>Lumen tracker</title>\n", mode: "0664", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/static/app.js", content: "console.log('tracker ui 2.4.0');\n", mode: "0664", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/conf", type: "dir", mode: "2770", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.0/conf/tracker.yml", content: liveConfig, mode: "0660", owner: "marco", group: "deploy" },
            { path: "/srv/releases/current", type: "symlink", target: "/srv/releases/tracker-2.4.0", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1/bin", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1/conf", type: "dir", mode: "2770", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1/static", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
          ],
        },
      ],
      start: { host: "web-01", user: "ops" },
    },
    checks: [
      {
        id: "layout",
        name: "bin/ and static/ hold the 2.4.1 files at the right depth",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/srv/releases/tracker-2.4.1/bin/tracker", pattern: "tracker 2\\.4\\.1" },
            { type: "file_exists", path: "/srv/releases/tracker-2.4.1/static/index.html" },
            { type: "file_matches", path: "/srv/releases/tracker-2.4.1/static/app.js", pattern: "2\\.4\\.1" },
            { type: "file_exists", path: "/srv/releases/tracker-2.4.1/static/styles.css" },
            { type: "file_absent", path: "/srv/releases/tracker-2.4.1/static/static" },
          ],
        },
        feedback: {
          what: "The 2.4.1 release does not have bin/tracker plus static/index.html, static/app.js and static/styles.css directly inside static/ (or there is a nested static/static).",
          why: "nginx serves /srv/releases/current/static/index.html. Files one level too deep, or missing, mean a blank dashboard for every dispatcher.",
          next: "Run find /srv/releases/tracker-2.4.1 to see the real layout. static/ already existed, so cp -r .../static .../static nests it; copy the contents with cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/ instead.",
        },
      },
      {
        id: "no-tmp-files",
        name: "No *.tmp build leftovers shipped",
        assert: { type: "command_output", run: "find /srv/releases/tracker-2.4.1 -name '*.tmp' | wc -l", pattern: "^\\s*0\\s*$" },
        feedback: {
          what: "find /srv/releases/tracker-2.4.1 -name '*.tmp' still lists files.",
          why: "Partial bundles in a release get served and cached by browsers; they are also how stale code sneaks into the next rollback.",
          next: "Delete them from the release with rm (find /srv/releases/tracker-2.4.1 -name '*.tmp' shows which), or copy only the files you need.",
        },
      },
      {
        id: "live-config",
        name: "conf/tracker.yml is the live configuration",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/srv/releases/tracker-2.4.1/conf/tracker.yml", pattern: "^db_host: db-01\\.lumen\\.internal$" },
            { type: "file_not_matches", path: "/srv/releases/tracker-2.4.1/conf/tracker.yml", pattern: "CHANGE_ME" },
          ],
        },
        feedback: {
          what: "/srv/releases/tracker-2.4.1/conf/tracker.yml is missing, or it is the example file with placeholder values.",
          why: "With the example config the tracker connects to localhost with the key CHANGE_ME: every request fails as soon as current is switched.",
          next: "Copy the live file: cp /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/",
        },
      },
      {
        id: "current-runs-241",
        name: "current points at 2.4.1 and its launcher runs",
        assert: {
          type: "all",
          of: [
            { type: "command_output", run: "readlink -f /srv/releases/current", pattern: "^/srv/releases/tracker-2\\.4\\.1/?$" },
            { type: "command_output", run: "/srv/releases/current/bin/tracker --version", pattern: "^tracker 2\\.4\\.1$", expectExit: 0 },
          ],
        },
        feedback: {
          what: "/srv/releases/current does not resolve to /srv/releases/tracker-2.4.1, or /srv/releases/current/bin/tracker --version does not run.",
          why: "Everything (nginx, the systemd unit) refers to current. If the link still points at 2.4.0, or the launcher lost its execute bit, the release never went live.",
          next: "Use ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current (the -n matters) and check with readlink -f. ls -l bin/tracker should show x bits; cp keeps them.",
        },
      },
      {
        id: "rollback-intact",
        name: "tracker-2.4.0 is untouched for rollback",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/srv/releases/tracker-2.4.0/bin/tracker", pattern: "tracker 2\\.4\\.0" },
            { type: "file_exists", path: "/srv/releases/tracker-2.4.0/conf/tracker.yml" },
            { type: "file_absent", path: "/srv/releases/tracker-2.4.0/tracker-2.4.1" },
          ],
        },
        feedback: {
          what: "The 2.4.0 release was changed: files are missing, or a stray tracker-2.4.1 link was created inside it.",
          why: "Rollback is only one command if the previous release is exactly as it was.",
          next: "Don't mv files out of 2.4.0 — use cp. A stray link inside 2.4.0 comes from ln -sf without -n; remove it with rm /srv/releases/tracker-2.4.0/tracker-2.4.1.",
        },
      },
    ],
    solution: [
      "cat /srv/releases/RELEASE.txt",
      "ls -l ~/build/tracker-2.4.1 ~/build/tracker-2.4.1/static",
      "cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/",
      "cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/",
      "rm /srv/releases/tracker-2.4.1/static/*.tmp",
      "cp /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/",
      "find /srv/releases/tracker-2.4.1",
      "ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current",
      "readlink -f /srv/releases/current",
      "/srv/releases/current/bin/tracker --version",
    ],
    wrongSolutions: [
      {
        label: "Copies static/ into the existing static/ directory, nesting it",
        steps: [
          "cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/",
          "cp -r ~/build/tracker-2.4.1/static /srv/releases/tracker-2.4.1/static",
          "cp /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/",
          "ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current",
        ],
      },
      {
        label: "Ships the example config",
        steps: [
          "cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/",
          "cp ~/build/tracker-2.4.1/static/*.html ~/build/tracker-2.4.1/static/*.js ~/build/tracker-2.4.1/static/*.css /srv/releases/tracker-2.4.1/static/",
          "cp ~/build/tracker-2.4.1/tracker.yml.example /srv/releases/tracker-2.4.1/conf/tracker.yml",
          "ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current",
        ],
      },
      {
        label: "Repoints the link with ln -sf (no -n), creating a link inside 2.4.0",
        steps: [
          "cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/",
          "cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/",
          "rm /srv/releases/tracker-2.4.1/static/*.tmp",
          "cp /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/",
          "ln -sf /srv/releases/tracker-2.4.1 /srv/releases/current",
        ],
      },
      {
        label: "Moves the config out of 2.4.0 and ships the tmp files",
        steps: [
          "cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/",
          "cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/",
          "mv /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/",
          "ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current",
        ],
      },
    ],
    starterCommands: ["cat /srv/releases/RELEASE.txt", "ls -l /srv/releases", "ls -lR ~/build/tracker-2.4.1"],
  },
  successCriteria: [
    "bin/tracker, static/index.html, static/app.js and static/styles.css are in place, with no nested static/static",
    "The release contains no *.tmp files",
    "conf/tracker.yml is the live 2.4.0 configuration, not the example",
    "/srv/releases/current resolves to tracker-2.4.1 and its launcher runs",
    "tracker-2.4.0 is unchanged",
  ],
  hints: [
    "Read `/srv/releases/RELEASE.txt` and compare `ls -lR ~/build/tracker-2.4.1` with `ls -lR /srv/releases/tracker-2.4.0`. Which build files go where?",
    "The `bin`, `conf` and `static` directories already exist in 2.4.1. Check the concept table: what does `cp -r SRC_DIR EXISTING_DIR` create?",
    "Copy the *contents* of static with `cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/`, then remove `*.tmp` from the release. The live config comes from `/srv/releases/tracker-2.4.0/conf/tracker.yml` — copy, don't move.",
    "Go live with `ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current`, then verify with `readlink -f /srv/releases/current` and `/srv/releases/current/bin/tracker --version`. Without `-n`, ln follows the old link into 2.4.0.",
  ],
  questions: [
    {
      id: "predict-cp-nesting",
      kind: "mcq",
      prompt: "`/srv/releases/tracker-2.4.1/static/` already exists and is empty. Where does `index.html` end up after this command?",
      code: "cp -r ~/build/tracker-2.4.1/static /srv/releases/tracker-2.4.1/static",
      codeLanguage: "bash",
      options: [
        "/srv/releases/tracker-2.4.1/static/index.html",
        "/srv/releases/tracker-2.4.1/static/static/index.html",
        "cp refuses because the destination exists",
        "/srv/releases/tracker-2.4.1/index.html",
      ],
      answer: 1,
      explanation:
        "When the destination is an existing directory, cp -r puts a copy of the source directory inside it. Copy static/. (the contents) to avoid nesting.",
    },
    {
      id: "order-release",
      kind: "order",
      prompt: "Put the go-live steps in a safe order.",
      items: [
        "Create the release directories with mkdir -p",
        "Copy the launcher and the contents of static/ into the release",
        "Copy the live tracker.yml from the current release",
        "Inspect the release with find and run its launcher",
        "Repoint current with ln -sfn",
        "Verify with readlink -f current",
      ],
      explanation:
        "Build and check the new directory completely before switching the link. The switch is the only step users notice, and it is instantly reversible because the old release is untouched.",
    },
  ],
  debrief: {
    solution: `${F}bash
cp ~/build/tracker-2.4.1/tracker /srv/releases/tracker-2.4.1/bin/
cp -r ~/build/tracker-2.4.1/static/. /srv/releases/tracker-2.4.1/static/
rm /srv/releases/tracker-2.4.1/static/*.tmp
cp /srv/releases/tracker-2.4.0/conf/tracker.yml /srv/releases/tracker-2.4.1/conf/
find /srv/releases/tracker-2.4.1                       # check before go-live
ln -sfn /srv/releases/tracker-2.4.1 /srv/releases/current
readlink -f /srv/releases/current && /srv/releases/current/bin/tracker --version
${F}

Equivalent approaches pass too: copying \`static/*.html static/*.js static/*.css\` individually, or removing \`static/\` and copying the directory with \`cp -r\` so it is *created*. The grader looks at the result, not the commands.`,
    commonMistakes: [
      "cp -r static into an existing static/ directory, producing static/static and a blank dashboard.",
      "Using ln -sf without -n: the old link is followed and a new link appears inside tracker-2.4.0 while current still points at 2.4.0.",
      "Shipping tracker.yml.example because it was in the build directory.",
      "Using mv to take the config out of 2.4.0, which silently breaks the rollback release.",
      "Forgetting to verify: readlink -f and running the launcher take seconds and catch every mistake above.",
    ],
    realWorld:
      "This releases/ + current symlink layout is what Capistrano, Deployer and many in-house deploy scripts use, because switching a symlink is near-instant and rollback is trivial. In production, scripts usually create the new link under a temporary name and rename it over current (mv -T), which is atomic. rsync -a SRC/ DEST/ is a common alternative to cp -r with the same trailing-slash subtlety.",
  },
  review: [
    {
      id: "lx-cp-into-existing",
      skill: "lx.file-ops",
      variants: [
        {
          id: "lx-cp-into-existing-a",
          kind: "mcq",
          prompt: "`/srv/labels/v8/fonts/` exists. Where does `cp -r ~/out/fonts /srv/labels/v8/fonts` put `ocr-b.ttf`?",
          options: ["/srv/labels/v8/fonts/ocr-b.ttf", "/srv/labels/v8/fonts/fonts/ocr-b.ttf", "/srv/labels/v8/ocr-b.ttf", "Nowhere: cp fails"],
          answer: 1,
          explanation: "An existing destination directory receives a copy of the source directory inside it: fonts/fonts/.",
        },
        {
          id: "lx-cp-into-existing-b",
          kind: "mcq",
          prompt: "`/backup/conf` does not exist yet. Where does `cp -r /etc/lumen /backup/conf` put `export.conf`?",
          options: ["/backup/conf/lumen/export.conf", "/backup/conf/export.conf", "/backup/export.conf", "Nowhere: cp fails"],
          answer: 1,
          explanation: "A missing destination is created as the copy itself, so the contents of /etc/lumen land directly in /backup/conf.",
        },
        {
          id: "lx-cp-into-existing-c",
          kind: "short",
          prompt: "Write a command that copies the *contents* of `~/out/fonts` into the existing directory `/srv/labels/v8/fonts`.",
          accept: ["cp -r ~/out/fonts/. /srv/labels/v8/fonts/", "cp -r ~/out/fonts/* /srv/labels/v8/fonts/", "cp -a ~/out/fonts/. /srv/labels/v8/fonts/"],
          acceptPatterns: ["^cp\\s+-(r|R|a|rp|pr|av|rv)\\s+~/out/fonts/(\\.|\\*)\\s+/srv/labels/v8/fonts/?$"],
          explanation: "fonts/. (or fonts/*) names the contents, so they land directly in the destination.",
        },
      ],
    },
    {
      id: "lx-symlink-switch",
      skill: "lx.file-ops",
      variants: [
        {
          id: "lx-symlink-switch-a",
          kind: "short",
          prompt: "`/srv/labels/active` is a symlink to `/srv/labels/v7`. Write the command that makes it point at `/srv/labels/v8`.",
          accept: ["ln -sfn /srv/labels/v8 /srv/labels/active", "ln -nsf /srv/labels/v8 /srv/labels/active", "ln -snf /srv/labels/v8 /srv/labels/active"],
          acceptPatterns: ["^ln\\s+-(?=[sfnT]*s)(?=[sfnT]*f)(?=[sfnT]*[nT])[sfnT]+\\s+/srv/labels/v8/?\\s+/srv/labels/active$"],
          explanation: "-s symbolic, -f replace the existing link, -n don't follow the existing link into the old directory.",
        },
        {
          id: "lx-symlink-switch-b",
          kind: "mcq",
          prompt: "`current -> tracker-2.4.0` (a directory). After `ln -sf /srv/releases/tracker-2.4.1 current`, what is true?",
          options: [
            "current points at tracker-2.4.1",
            "current still points at 2.4.0, and tracker-2.4.0/tracker-2.4.1 is a new link",
            "current is deleted",
            "tracker-2.4.0 is replaced by 2.4.1",
          ],
          answer: 1,
          explanation: "Without -n, ln dereferences the existing link to a directory and creates the new link inside that directory.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev is moving the DNS zone files on `dns-01` to a new layout. `/etc/bind/zones` already exists (empty). The current zone files are in `/var/lib/bind-old/zones/` and must stay there until the migration is verified.",
    question: {
      id: "transfer-copy-zones",
      kind: "mcq",
      prompt: "Which command puts the zone files directly in `/etc/bind/zones/` and keeps the originals?",
      options: [
        "mv /var/lib/bind-old/zones /etc/bind/zones",
        "cp -r /var/lib/bind-old/zones /etc/bind/zones",
        "cp -r /var/lib/bind-old/zones/. /etc/bind/zones/",
        "ln -s /var/lib/bind-old/zones /etc/bind/zones",
      ],
      answer: 2,
      explanation:
        "cp keeps the originals; zones/. copies the contents into the existing directory. cp -r zones zones would create /etc/bind/zones/zones, mv removes the originals, and ln -s would create a link inside the existing directory.",
    },
  },
  refresher: {
    body: `\`cp SRC DEST\` copies and keeps \`SRC\`; \`mv SRC DEST\` moves (or renames). If \`DEST\` is an **existing directory**, both put \`SRC\` *inside* it — so \`cp -r static release/static\` creates \`release/static/static\` when \`release/static\` already exists. Copy the contents with \`static/.\`.

\`mkdir -p a/b/c\` creates the whole path and doesn't complain if it exists. A symlink is a pointer to a path; change one that points at a directory with \`ln -sfn NEW LINK\` and check it with \`readlink -f LINK\`.`,
    practice: {
      id: "refresher-mv-rename",
      kind: "mcq",
      prompt: "In a directory that contains `report.csv` and no `old/` directory, what does `mv report.csv old` do?",
      options: ["Moves report.csv into a new directory old/", "Renames report.csv to a file called old", "Fails: old does not exist", "Copies report.csv to old"],
      answer: 1,
      explanation: "When the destination does not exist, mv renames the source to that name.",
    },
  },
};
