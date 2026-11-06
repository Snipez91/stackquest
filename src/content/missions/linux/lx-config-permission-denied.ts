import type { MissionInput } from "@/content/schema";

const F = "```";

const plannerYml = `# route-planner configuration
listen: 0.0.0.0:8085
db_host: db-01.lumen.internal
db_user: planner
db_password: Rp-7f2e91c4
depots: [BRS-1, BRS-2, BRS-3]
`;

const hardeningLog = `2026-03-01 23:02:11 ansible[71021]: TASK [cis : 6.1 restrict configuration directories]
2026-03-01 23:02:12 ansible[71021]: changed: /etc/lumen  mode 0755 -> 0750, group root -> lumen-cfg
2026-03-01 23:02:12 ansible[71021]: NOTE: service accounts that read /etc/lumen must be members of lumen-cfg
2026-03-01 23:02:13 ansible[71021]: TASK [cis : 6.1 add service accounts to lumen-cfg]
2026-03-01 23:02:13 ansible[71021]: changed: user notify groups += lumen-cfg
2026-03-01 23:02:14 ansible[71021]: PLAY RECAP api-01 ok=41 changed=3 failed=0
2026-03-01 23:15:40 ops: rebooted api-01 for kernel 6.8.0-52
`;

const journal = [
  "Feb 28 06:00:03 api-01 systemd[1]: Starting route-planner.service - Lumen route planner...",
  "Feb 28 06:00:04 api-01 route-planner[1388]: loaded /etc/lumen/route-planner/planner.yml (3 depots)",
  "Feb 28 06:00:04 api-01 systemd[1]: Started route-planner.service - Lumen route planner.",
  "Mar 01 23:16:02 api-01 systemd[1]: Starting route-planner.service - Lumen route planner...",
  'Mar 01 23:16:02 api-01 route-planner[912]: open() "/etc/lumen/route-planner/planner.yml" failed (13: Permission denied)',
  "Mar 01 23:16:02 api-01 systemd[1]: route-planner.service: Main process exited, code=exited, status=1/FAILURE",
  "Mar 01 23:16:02 api-01 systemd[1]: route-planner.service: Failed with result 'exit-code'.",
  "Mar 01 23:16:02 api-01 systemd[1]: Failed to start route-planner.service - Lumen route planner.",
];

export const lxConfigPermissionDenied: MissionInput = {
  slug: "lx-config-permission-denied",
  version: 1,
  track: "linux",
  tier: "advanced",
  order: 2,
  title: "Find why a Linux service cannot read its configuration file",
  summary:
    "After a hardening run, the route planner gets 'Permission denied' on a config file whose mode looks fine. Walk the path as the service user, find the blocking directory, fix it without exposing secrets.",
  minutes: 35,
  assessmentTypes: ["configure-system", "investigate-logs", "explain-root-cause"],
  skills: ["lx.troubleshooting"],
  appliesSkills: ["lx.permissions", "lx.users-groups", "lx.services", "lx.logs"],
  prerequisites: ["lx-incident-timeline"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `\`route-planner\` on \`api-01\` didn't come back after last night's kernel reboot, so dispatch is building today's Bristol routes by hand.

The journal says \`Permission denied\` on \`/etc/lumen/route-planner/planner.yml\`. Marco swears nobody touched that file, and \`ls -l\` on it does look right. The only change yesterday was the CIS hardening run (\`/var/log/lumen/hardening.log\`).

Please find the actual cause and fix it properly:

- the planner must start and be able to **read** its config (not write it),
- that file contains the database password, so **no one else** may read it — and the same goes for the other services' files in \`/etc/lumen\`,
- no \`chmod 777\`, no running it as root, no adding \`planner\` to \`sudo\`.

Then write me two sentences on the root cause for the change review.`,
  },
  objectives: [
    "Work from symptom to evidence: status, journal, then the filesystem as the service user",
    "Check access along the whole path, not just the final file",
    "Choose a least-privilege fix that matches the intended security policy",
    "Verify the fix by restarting the service and re-testing access for the right and wrong users",
  ],
  concept: {
    title: "Troubleshoot from the error outward, as the process sees it",
    body: `A systematic loop beats trying fixes:

1. **Observe the symptom precisely.** \`systemctl status\` and \`journalctl -u\` give the failing syscall, the path and the errno: \`open() ... (13: Permission denied)\`.
2. **Reproduce it as the same identity.** The service runs as \`User=planner\` with planner's groups. \`sudo -u planner cat FILE\` fails the same way; your own shell (or root) may not.
3. **Narrow down.** \`EACCES\` on \`open()\` means *some* check on the path failed: x on **every** directory from \`/\` down, then r on the file. Check each level and ask "which class (owner/group/others) does planner fall into here, and does it have the bit?"

${F}bash
sudo -u planner ls /etc/lumen           # fails here? then /etc/lumen blocks traversal
ls -ld /etc /etc/lumen /etc/lumen/route-planner /etc/lumen/route-planner/planner.yml
id planner
${F}

4. **Find what changed** (here, a hardening log) so the fix matches the *intended* policy instead of undoing it.
5. **Fix the smallest thing, then verify both directions**: the service starts *and* users who shouldn't read secrets still can't.

\`chmod 777\` on the file makes the error go away only if the directories already allow traversal — and never respects the policy.`,
  },
  workedExample: {
    title: "Worked example: the metrics agent can't read its TLS key",
    body: `\`metrics-agent\` (User=prometheus) on \`web-01\` fails: \`open("/etc/ssl/lumen/metrics.key"): Permission denied\`. The key is \`-rw-r----- root ssl-cert\`.

**1. Reproduce as the service user.**

${F}bash
sudo -u prometheus cat /etc/ssl/lumen/metrics.key > /dev/null
# cat: /etc/ssl/lumen/metrics.key: Permission denied
${F}

**2. Walk the path.**

${F}bash
ls -ld /etc/ssl /etc/ssl/lumen /etc/ssl/lumen/metrics.key
# drwxr-xr-x root root     /etc/ssl
# drwx--x--- root ssl-cert /etc/ssl/lumen
# -rw-r----- root ssl-cert /etc/ssl/lumen/metrics.key
id prometheus
# uid=993(prometheus) gid=993(prometheus) groups=993(prometheus)
${F}

prometheus falls under *others* for \`/etc/ssl/lumen\` (\`---\`) and for the key (\`---\`). The design is clearly "members of ssl-cert may read keys".

**3. Fix to the design, not around it.**

${F}bash
sudo usermod -aG ssl-cert prometheus
sudo systemctl restart metrics-agent
sudo -u prometheus cat /etc/ssl/lumen/metrics.key > /dev/null && echo readable
sudo -u nobody cat /etc/ssl/lumen/metrics.key     # still Permission denied: good
${F}

\`chmod o+r\` on the key would also "work" — and publish the private key to every account on the host.`,
  },
  simulationNote:
    "The service's start-up is simulated: systemd checks, as the service's user and groups, that it can read its config and write its state directory, and logs the same open() error a real daemon would. sudo -u lets you run commands as the service user. Group changes take effect at the next service start, as on a real system. namei is not available; use ls -ld on each path component.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T07:40:00Z",
      hosts: [
        {
          name: "api-01",
          groups: [
            { name: "sudo", gid: 27 },
            { name: "lumen-cfg", gid: 2010 },
          ],
          users: [
            { name: "ops", uid: 1000, groups: ["sudo", "adm"], home: "/home/ops" },
            { name: "lena", uid: 1005, groups: [], home: "/home/lena" },
            { name: "planner", uid: 992, groups: [], home: "/var/lib/route-planner", shell: "/usr/sbin/nologin" },
            { name: "notify", uid: 997, groups: ["lumen-cfg"], home: "/var/lib/notify", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/etc/lumen", type: "dir", mode: "0750", owner: "root", group: "lumen-cfg" },
            { path: "/etc/lumen/route-planner", type: "dir", mode: "0750", owner: "root", group: "planner" },
            { path: "/etc/lumen/route-planner/planner.yml", content: plannerYml, mode: "0640", owner: "root", group: "planner" },
            { path: "/etc/lumen/notify", type: "dir", mode: "0750", owner: "root", group: "notify" },
            { path: "/etc/lumen/notify/notify.conf", content: "smtp_host = mail.lumen.internal\nsmtp_password = Nt-19ab77\n", mode: "0640", owner: "root", group: "notify" },
            { path: "/var/lib/route-planner", type: "dir", mode: "0750", owner: "planner", group: "planner" },
            { path: "/var/lib/notify", type: "dir", mode: "0750", owner: "notify", group: "notify" },
            { path: "/var/log/lumen", type: "dir", mode: "0755" },
            { path: "/var/log/lumen/hardening.log", content: hardeningLog },
          ],
          services: [
            {
              name: "route-planner",
              description: "Lumen route planner",
              execUser: "planner",
              command: "/opt/lumen/bin/route-planner --config /etc/lumen/route-planner/planner.yml",
              state: "failed",
              enabled: true,
              requiresReadable: ["/etc/lumen/route-planner/planner.yml"],
              requiresWritable: ["/var/lib/route-planner"],
              listens: [{ port: 8085, proto: "tcp" }],
              http: [{ path: "/health", status: 200, body: "ok: 3 depots loaded\n" }],
              kind: "http",
              journal,
            },
            {
              name: "lumen-notify",
              description: "Lumen delivery notifications",
              execUser: "notify",
              command: "/opt/lumen/bin/lumen-notify --config /etc/lumen/notify/notify.conf",
              state: "active",
              enabled: true,
              requiresReadable: ["/etc/lumen/notify/notify.conf"],
              requiresWritable: ["/var/lib/notify"],
            },
          ],
          interfaces: [{ name: "eth0", address: "10.20.1.20/24" }],
        },
      ],
      segments: [{ name: "srv", cidr: "10.20.1.0/24" }],
      start: { host: "api-01", user: "ops" },
    },
    checks: [
      {
        id: "planner-running",
        name: "route-planner is active and healthy",
        assert: {
          type: "all",
          of: [
            { type: "service_state", service: "route-planner", state: "active" },
            { type: "http_status", from: "api-01", url: "http://127.0.0.1:8085/health", status: 200 },
          ],
        },
        feedback: {
          what: "route-planner is not active (or /health on port 8085 does not answer).",
          why: "Until it runs, dispatch plans Bristol routes by hand. The service will keep failing with the same open() error until planner can reach the file through every directory.",
          next: "Reproduce it with sudo -u planner cat /etc/lumen/route-planner/planner.yml, then check each level with ls -ld /etc/lumen /etc/lumen/route-planner. After a fix, sudo systemctl restart route-planner.",
        },
      },
      {
        id: "planner-reads-not-writes",
        name: "planner can read its config but not modify it",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/etc/lumen/route-planner/planner.yml", user: "planner", access: "r", expect: true },
            { type: "access", path: "/etc/lumen/route-planner/planner.yml", user: "planner", access: "w", expect: false },
            { type: "user_in_group", user: "planner", group: "sudo", expect: false },
            { type: "user_in_group", user: "planner", group: "root", expect: false },
          ],
        },
        feedback: {
          what: "planner cannot read planner.yml, or it can now write it, or it was added to sudo/root.",
          why: "A service that can rewrite its own config (or act as root) turns any bug in it into a way to change its behaviour or the host. It only needs read access.",
          next: "Keep the file root-owned with group planner and mode 640. Give planner traversal of /etc/lumen the way the hardening log intends, instead of changing the file's owner.",
        },
      },
      {
        id: "secrets-protected",
        name: "Other users still cannot read the services' secrets, and notify still can",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/etc/lumen/route-planner/planner.yml", user: "lena", access: "r", expect: false },
            { type: "access", path: "/etc/lumen/notify/notify.conf", user: "lena", access: "r", expect: false },
            { type: "access", path: "/etc/lumen/notify/notify.conf", user: "notify", access: "r", expect: true },
            { type: "access", path: "/etc/lumen/notify/notify.conf", user: "planner", access: "r", expect: false },
            { type: "mode_max", path: "/etc/lumen/route-planner/planner.yml", max: "0640" },
            { type: "mode_max", path: "/etc/lumen", max: "0755" },
            { type: "not", of: { type: "access", path: "/etc/lumen", user: "lena", access: "w", expect: true } },
          ],
        },
        feedback: {
          what: "The fix exposed something: lena (an ordinary user) can read planner.yml or notify.conf, planner can read notify's secrets, notify lost access to its own config, or a mode is wider than needed (file above 640, /etc/lumen above 755 or writable by others).",
          why: "Both files contain passwords. Recursive chmod/chgrp across /etc/lumen fixes one service by breaking the isolation — or the access — of the others.",
          next: "Reset the lab if needed and make one targeted change: either give planner the group the hardening policy expects (sudo usermod -aG lumen-cfg planner) or allow traversal only (sudo chmod o+x /etc/lumen). Leave the file and the other services' directories alone.",
        },
      },
    ],
    solution: [
      "systemctl status route-planner",
      "journalctl -u route-planner -n 8 --no-pager",
      "ls -l /etc/lumen/route-planner/planner.yml",
      "sudo -u planner cat /etc/lumen/route-planner/planner.yml",
      "ls -ld /etc /etc/lumen /etc/lumen/route-planner",
      "id planner",
      "sudo -u planner ls /etc/lumen",
      "cat /var/log/lumen/hardening.log",
      "sudo usermod -aG lumen-cfg planner",
      "sudo -u planner cat /etc/lumen/route-planner/planner.yml",
      "sudo systemctl restart route-planner",
      "systemctl status route-planner",
      "curl -s http://127.0.0.1:8085/health",
      "sudo -u lena cat /etc/lumen/route-planner/planner.yml",
    ],
    wrongSolutions: [
      {
        label: "chmod 777 on the config file (the directory still blocks, and the secret is world-readable)",
        steps: ["sudo chmod 777 /etc/lumen/route-planner/planner.yml", "sudo systemctl restart route-planner"],
      },
      {
        label: "chmod -R 755 /etc/lumen (starts, but every secret becomes world-readable)",
        steps: ["sudo chmod -R 755 /etc/lumen", "sudo systemctl restart route-planner"],
      },
      {
        label: "chgrp -R planner /etc/lumen (starts, but notify loses its config and planner can read notify's secret)",
        steps: ["sudo chgrp -R planner /etc/lumen", "sudo systemctl restart route-planner"],
      },
      {
        label: "Makes planner own its config and opens /etc/lumen to traversal",
        steps: ["sudo chown planner:planner /etc/lumen/route-planner/planner.yml", "sudo chmod o+x /etc/lumen", "sudo systemctl restart route-planner"],
      },
      {
        label: "Restarts the service without changing anything",
        steps: ["sudo systemctl restart route-planner"],
      },
    ],
    starterCommands: ["systemctl status route-planner", "journalctl -u route-planner -n 8", "ls -l /etc/lumen/route-planner/planner.yml", "id planner"],
  },
  successCriteria: [
    "route-planner is active and /health on port 8085 returns 200",
    "planner can read planner.yml but cannot write it, and is not in sudo or root",
    "lena cannot read either service's secrets, notify can still read its own config, and no mode is wider than needed",
  ],
  hints: [
    "Reproduce the failure as the service's identity, not yours: `sudo -u planner cat /etc/lumen/route-planner/planner.yml`. Same error?",
    "The file's own mode is fine for group planner. `open()` also needs x on every directory above it. Run `ls -ld /etc/lumen /etc/lumen/route-planner` and `id planner`: which class does planner fall into at each level?",
    "`/etc/lumen` is `drwxr-x--- root lumen-cfg`. planner isn't in lumen-cfg, so it falls under *others* (`---`) and can't pass through. `/var/log/lumen/hardening.log` says how the change was meant to be used.",
    "Follow the policy: `sudo usermod -aG lumen-cfg planner`, then `sudo systemctl restart route-planner`. (Allowing traversal only, `sudo chmod o+x /etc/lumen`, also passes.) Verify with `sudo -u planner cat ...`, `curl -s http://127.0.0.1:8085/health`, and that `sudo -u lena cat ...` is still denied.",
  ],
  questions: [
    {
      id: "which-component",
      kind: "short",
      prompt: "Which path component was blocking planner from opening its config?",
      accept: ["/etc/lumen", "/etc/lumen/"],
      acceptPatterns: ["^/etc/lumen/?$"],
      placeholder: "/...",
      explanation:
        "/etc/lumen became drwxr-x--- root lumen-cfg in the hardening run. planner is not in lumen-cfg, so as 'others' it has no x and cannot traverse into route-planner/.",
    },
    {
      id: "explain-root-cause",
      kind: "explain",
      prompt: "Write Priya's two sentences for the change review: the root cause, and why your fix is the right one.",
      concepts: [
        { label: "Hardening changed /etc/lumen to 750 with group lumen-cfg", anyOf: ["hardening", "cis", "ansible", "0750", "750", "lumen-cfg"] },
        { label: "Directory traversal (x) blocked, not the file's own mode", anyOf: ["traverse", "traversal", "x bit", "execute", "search permission", "directory", "parent directory", "path"] },
        { label: "planner wasn't added to the group (only notify was)", anyOf: ["not a member", "wasn't added", "was not added", "not in lumen-cfg", "missing from", "only notify", "forgot", "never added", "usermod"] },
        { label: "Fix keeps secrets private / least privilege", anyOf: ["least privilege", "secret", "password", "not world", "others still", "no one else", "only planner", "777"] },
      ],
      minConcepts: 3,
      explanation:
        "The root cause is a policy change that wasn't completed for every service, observed as a missing x on a parent directory.",
      modelAnswer:
        "The CIS hardening run changed /etc/lumen to 0750 with group lumen-cfg and added notify to that group, but planner was never added, so as 'others' it lost the x permission to traverse the directory and open() on planner.yml failed even though the file's own mode was correct. I added planner to lumen-cfg as the hardening policy intends and restarted the service; the file stays 640 root:planner, so the database password is still readable only by planner and root — least privilege, no 777.",
    },
    {
      id: "predict-sudo-u",
      kind: "mcq",
      prompt: "Before any fix, you run `cat /etc/lumen/route-planner/planner.yml` as `ops` (in sudo and adm, not lumen-cfg) **without** sudo. What happens?",
      options: ["It prints the file", "Permission denied, the same failure planner sees", "No such file or directory", "It prompts for a password"],
      answer: 1,
      explanation:
        "ops is also 'others' for /etc/lumen, so it fails the same way. That's why reproducing as the right identity (sudo -u planner) matters: sudo cat as root would succeed and hide the problem.",
    },
  ],
  debrief: {
    solution: `${F}text
journalctl:  open() "/etc/lumen/route-planner/planner.yml" failed (13: Permission denied)
ls -ld:      drwxr-x---  root lumen-cfg  /etc/lumen          <- planner is "others": no x
             drwxr-x---  root planner    /etc/lumen/route-planner
             -rw-r-----  root planner    planner.yml           <- looks fine, isn't the problem
hardening:   /etc/lumen 0755 -> 0750 group lumen-cfg; "service accounts must be in lumen-cfg"; only notify added
${F}

${F}bash
sudo usermod -aG lumen-cfg planner
sudo systemctl restart route-planner
sudo -u planner cat /etc/lumen/route-planner/planner.yml >/dev/null && echo ok
sudo -u lena cat /etc/lumen/route-planner/planner.yml     # still denied
${F}

\`sudo chmod o+x /etc/lumen\` (0751) also passes: it allows traversal only, and each service's subdirectory still keeps outsiders out. It partly undoes the hardening, though, so the group fix is the better answer for the change review. The checks accept both because both are safe; they reject 777, recursive chmod/chgrp, ownership changes and sudo.`,
    commonMistakes: [
      "Testing as root (sudo cat) and concluding the file is readable, because root bypasses permission checks.",
      "Looking only at the file's mode; the blocking bit was on a parent directory.",
      "chmod 777 on the file: the directory still blocks, and the password becomes world-readable.",
      "chmod -R or chgrp -R across /etc/lumen, which fixes one service while exposing or breaking the others.",
      "chown planner on the config, which lets the service rewrite its own configuration.",
      "Fixing permissions but not restarting, then reporting it still down (or restarting without re-checking access).",
    ],
    realWorld:
      "On a real host, namei -l /etc/lumen/route-planner/planner.yml shows every component's owner and mode in one command, and sudo -u planner test -r FILE && echo ok is a quick probe. Beyond Unix modes, check ACLs (getfacl), SELinux/AppArmor denials (ausearch -m avc, journalctl -t audit) and systemd sandboxing (ProtectSystem=, ReadOnlyPaths=), all of which also surface as EACCES. Hardening changes should ship with a test that starts every affected service.",
  },
  review: [
    {
      id: "lx-reproduce-as-service-user",
      skill: "lx.troubleshooting",
      variants: [
        {
          id: "lx-reproduce-as-service-user-a",
          kind: "short",
          prompt: "The `label-render` service runs as user `labels` and logs `Permission denied` on `/srv/labels/v8/a6.tpl`. Write the command that reproduces the read as that user.",
          accept: ["sudo -u labels cat /srv/labels/v8/a6.tpl", "sudo -u labels head /srv/labels/v8/a6.tpl", "sudo -u labels test -r /srv/labels/v8/a6.tpl"],
          acceptPatterns: ["^sudo\\s+-u\\s+labels\\s+(cat|head|less|test\\s+-r|stat)\\s+/srv/labels/v8/a6\\.tpl(\\s*>\\s*/dev/null)?$"],
          explanation: "sudo -u USER runs the command with that user's identity and groups, so it hits the same permission checks as the service.",
        },
        {
          id: "lx-reproduce-as-service-user-b",
          kind: "mcq",
          prompt: "A service running as `www-data` can't read a file. You run `sudo cat FILE` and it works. What have you learned?",
          options: [
            "The file is readable by www-data",
            "Very little: root bypasses permission checks, so test with sudo -u www-data",
            "The service has a bug",
            "SELinux is disabled",
          ],
          answer: 1,
          explanation: "Root ignores mode bits for reading. Reproduce with the service's identity.",
        },
      ],
    },
    {
      id: "lx-path-walk",
      skill: "lx.troubleshooting",
      variants: [
        {
          id: "lx-path-walk-a",
          kind: "mcq",
          prompt: "`/opt/app` is `drwx------ root root`, `/opt/app/conf` is `drwxr-xr-x root app`, `/opt/app/conf/app.ini` is `-rw-r--r-- root app`. User `app` (in group app) gets Permission denied opening app.ini. Which component blocks it?",
          options: ["/opt", "/opt/app", "/opt/app/conf", "app.ini"],
          answer: 1,
          explanation: "app falls under 'others' for /opt/app (root:root), which has ---: no x to pass through.",
        },
        {
          id: "lx-path-walk-b",
          kind: "order",
          prompt: "Order a systematic approach to a service's 'Permission denied' on a config file.",
          items: [
            "Read the exact error, path and errno in journalctl -u",
            "Reproduce it with sudo -u SERVICE_USER",
            "Check every path component with ls -ld and id SERVICE_USER",
            "Find what changed recently (logs, change records)",
            "Apply the smallest least-privilege fix",
            "Restart and verify access for the service and denial for others",
          ],
          explanation: "Evidence first, reproduce with the right identity, narrow down along the path, fix to intent, verify both directions.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `web-01`, after a migration, nginx (User=www-data) logs `open() \"/srv/www/dispatch/index.html\" failed (13: Permission denied)`. `ls -ld /srv /srv/www /srv/www/dispatch` shows `drwxr-xr-x root root`, `drwxr-x--- deploy deploy`, `drwxr-xr-x deploy deploy`. index.html is `-rw-r--r-- deploy deploy`. `id www-data` shows only group www-data.",
    question: {
      id: "transfer-nginx-docroot",
      kind: "mcq",
      prompt: "Which fix is both effective and least privilege?",
      options: [
        "sudo chmod 777 /srv/www/dispatch/index.html",
        "sudo chmod o+x /srv/www (traversal only), then reload nginx",
        "sudo usermod -aG sudo www-data",
        "Run nginx workers as root",
      ],
      answer: 1,
      explanation:
        "/srv/www (750 deploy:deploy) blocks www-data, which falls under others. Adding o+x allows passing through without listing it; the public files below are already world-readable. Adding www-data to the deploy group would also work but grants write-adjacent access to deploy-owned content.",
    },
  },
  refresher: {
    body: `"Permission denied" on \`open()\` means a check failed **somewhere on the path**: every directory from \`/\` needs x for the process's class, and the file needs r.

Work it in order: read the exact error in \`journalctl -u UNIT\`; reproduce it with \`sudo -u SERVICE_USER cat FILE\` (root would succeed and mislead you); run \`ls -ld\` on each component and \`id SERVICE_USER\` to see which class applies at each level; fix the first blocking level in the way the policy intends; restart and re-test, including that other users are still denied.`,
    practice: {
      id: "refresher-root-bypass",
      kind: "mcq",
      prompt: "Why is `sudo -u planner cat FILE` a better test than `sudo cat FILE` when debugging the planner service?",
      options: [
        "It's faster",
        "It runs with planner's user and groups, so it hits the same permission checks as the service",
        "sudo cat can't read config files",
        "It changes the file's owner",
      ],
      answer: 1,
      explanation: "Root bypasses read permission checks; only the service's identity reproduces the failure.",
    },
  },
};
