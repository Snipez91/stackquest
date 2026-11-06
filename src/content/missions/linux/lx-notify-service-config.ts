import type { MissionInput } from "@/content/schema";

const F = "```";

const notifyConf = `# /etc/lumen/notify.conf — delivery notification service (lumen-notify)
# Format: key = value. Durations are whole seconds.
smtp_host = mail.lumen.internal
smtp_port = 587
sender = deliveries@lumen.test
queue_url = redis://127.0.0.1:6379/2
retry_interval = 30s
max_retries = 5
`;

const journal = [
  "Feb 27 17:58:40 api-01 systemd[1]: Stopping lumen-notify.service - Lumen delivery notifications...",
  "Feb 27 17:58:40 api-01 systemd[1]: lumen-notify.service: Deactivated successfully.",
  "Feb 27 17:58:40 api-01 systemd[1]: Stopped lumen-notify.service - Lumen delivery notifications.",
  "Feb 27 17:58:40 api-01 systemd[1]: Starting lumen-notify.service - Lumen delivery notifications...",
  "Feb 27 17:58:41 api-01 lumen-notify[48113]: notify.conf line 7: invalid value for 'retry_interval' (expected whole seconds, e.g. 30)",
  "Feb 27 17:58:41 api-01 systemd[1]: lumen-notify.service: Main process exited, code=exited, status=1/FAILURE",
  "Feb 27 17:58:41 api-01 systemd[1]: lumen-notify.service: Failed with result 'exit-code'.",
  "Feb 27 17:58:41 api-01 systemd[1]: Failed to start lumen-notify.service - Lumen delivery notifications.",
];

const changeNote = `Change log — api-01

2025-11-14  ops    installed lumen-notify 1.8 (started by hand for the pilot; TODO enable)
2026-02-27  marco  notify.conf: retry_interval 30 -> "30s" for readability; restarted lumen-notify
2026-03-05  ops    PLANNED: kernel patch + reboot (Thursday 22:00)
`;

export const lxNotifyServiceConfig: MissionInput = {
  slug: "lx-notify-service-config",
  version: 1,
  track: "linux",
  tier: "intermediate",
  order: 2,
  title: "Delivery notifications are down, and won't survive a reboot",
  summary:
    "A systemd service failed after a config edit and was never enabled at boot. Read systemctl status and the journal, fix the config error with sed, start the service and enable it.",
  minutes: 25,
  assessmentTypes: ["configure-system", "interpret-output", "investigate-logs"],
  skills: ["lx.services"],
  appliesSkills: ["lx.text-processing", "lx.permissions"],
  prerequisites: ["lx-handoff-permissions"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#incidents",
    body: `Customers in Bristol stopped getting "your parcel is out for delivery" emails on Friday evening. The sender is \`lumen-notify\` on \`api-01\`.

According to the change log in \`/var/log/lumen/changes.txt\`, Marco tweaked \`/etc/lumen/notify.conf\` on Friday and restarted it. Also, I'm fairly sure nobody ever enabled the unit, so even if it were running it wouldn't come back after Thursday's patch reboot.

Please get \`lumen-notify\` **running now** and **starting at boot**. Keep the retry behaviour as Marco intended: 30 seconds between retries. Use \`sudo\` — the config is root-owned.`,
  },
  objectives: [
    "Read systemctl status: loaded/enabled state, active state and the recent log lines",
    "Use journalctl -u to find the service's own error message",
    "Edit a root-owned config file safely with sudo sed -i and verify the change",
    "Distinguish starting a unit now (start/restart) from starting it at boot (enable)",
  ],
  concept: {
    title: "systemd: units, two independent states, and the journal",
    body: `systemd manages long-running programs as **units** (\`lumen-notify.service\`). A unit has two independent properties:

| Property | Question it answers | Change it with |
| --- | --- | --- |
| **active state** | Is it running *right now*? (\`active\`, \`inactive\`, \`failed\`) | \`systemctl start / stop / restart\` |
| **enabled state** | Will it start *at boot*? (\`enabled\`, \`disabled\`) | \`systemctl enable / disable\` |

\`enable\` creates a symlink in \`multi-user.target.wants/\`; it does not start anything. \`enable --now\` does both. A unit can be running but disabled (it will vanish at the next reboot) or enabled but failed.

\`systemctl status UNIT\` shows both states plus the last few log lines:

${F}text
× lumen-notify.service - Lumen delivery notifications
     Loaded: loaded (/lib/systemd/system/lumen-notify.service; disabled; ...)
     Active: failed (Result: exit-code) since ...
${F}

When a service exits, its stderr goes to the **journal**. \`journalctl -u UNIT\` shows that unit's history; the line from the program itself (not from \`systemd[1]\`) usually says exactly what is wrong. systemd only reports *that* it failed.

A config fix is: read the error → change the one value → \`grep\` to verify → \`restart\` → \`status\` again.`,
  },
  workedExample: {
    title: "Worked example: the label printer daemon after an upgrade",
    body: `\`labeld\` on \`ops-ws\` is down after a package upgrade.

**1. Status first.**

${F}bash
systemctl status labeld
# Loaded: loaded (...; enabled; ...)    <- will start at boot
# Active: failed (Result: exit-code)    <- but crashed now
${F}

**2. Find the program's own message in the journal.**

${F}bash
sudo journalctl -u labeld -n 20 --no-pager
# labeld[2210]: /etc/labeld.conf: unknown key 'dpi_mode' (did you mean 'dpi'?)
${F}

**3. Fix exactly that, as root, and verify.**

${F}bash
grep -n dpi /etc/labeld.conf
sudo sed -i 's/^dpi_mode = /dpi = /' /etc/labeld.conf
grep -n dpi /etc/labeld.conf
${F}

**4. Restart and confirm both states.**

${F}bash
sudo systemctl restart labeld
systemctl is-active labeld     # active
systemctl is-enabled labeld    # enabled
${F}

It was already enabled, so no \`enable\` was needed this time. Always check both.`,
  },
  simulationNote:
    "systemctl and journalctl are simulated: starting a unit checks its user, the files it must read, and its config rules, then writes realistic journal lines. Enabling a unit records that it starts at boot (there is no actual reboot here). journalctl supports -u, -n, -e, -x and --no-pager but not --since or -f. On a real host you might also run the program's own config check (e.g. nginx -t) before restarting.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T09:30:00Z",
      hosts: [
        {
          name: "api-01",
          users: [
            { name: "ops", uid: 1000, groups: ["sudo"], home: "/home/ops" },
            { name: "notify", uid: 997, groups: [], home: "/var/lib/notify", shell: "/usr/sbin/nologin" },
          ],
          files: [
            { path: "/etc/lumen", type: "dir", mode: "0755" },
            { path: "/etc/lumen/notify.conf", content: notifyConf, mode: "0640", owner: "root", group: "notify" },
            { path: "/var/log/lumen", type: "dir", mode: "0755" },
            { path: "/var/log/lumen/changes.txt", content: changeNote },
            { path: "/var/lib/notify", type: "dir", mode: "0750", owner: "notify", group: "notify" },
          ],
          services: [
            {
              name: "lumen-notify",
              description: "Lumen delivery notifications",
              execUser: "notify",
              command: "/opt/lumen/bin/lumen-notify --config /etc/lumen/notify.conf",
              state: "failed",
              enabled: false,
              requiresReadable: ["/etc/lumen/notify.conf"],
              requiresWritable: ["/var/lib/notify"],
              configChecks: [
                { path: "/etc/lumen/notify.conf", pattern: "^smtp_host\\s*=\\s*\\S+", error: "notify.conf: required key 'smtp_host' is missing" },
                { path: "/etc/lumen/notify.conf", pattern: "^retry_interval\\s*=\\s*\\d+\\s*$", error: "notify.conf line 7: invalid value for 'retry_interval' (expected whole seconds, e.g. 30)" },
              ],
              journal,
            },
            {
              name: "lumen-queue",
              description: "Lumen job queue",
              execUser: "root",
              command: "/usr/bin/redis-server /etc/redis/lumen-queue.conf",
              state: "active",
              enabled: true,
              listens: [{ port: 6379, proto: "tcp" }],
            },
          ],
        },
      ],
      start: { host: "api-01", user: "ops" },
    },
    checks: [
      {
        id: "notify-active",
        name: "lumen-notify is running",
        assert: { type: "service_state", service: "lumen-notify", state: "active" },
        feedback: {
          what: "lumen-notify is not active.",
          why: "While it is down, no delivery notifications go out; customers miss their delivery windows and call the depot.",
          next: "sudo journalctl -u lumen-notify -n 10 shows the program's own error. Fix that line in /etc/lumen/notify.conf, then sudo systemctl restart lumen-notify and check systemctl status lumen-notify.",
        },
      },
      {
        id: "notify-enabled",
        name: "lumen-notify starts at boot",
        assert: { type: "service_enabled", service: "lumen-notify", enabled: true },
        feedback: {
          what: "lumen-notify is disabled: it will not start after Thursday's reboot.",
          why: "start/restart only affect the running system. Without enable, the next reboot silently takes notifications down again.",
          next: "sudo systemctl enable lumen-notify (or enable --now), then systemctl is-enabled lumen-notify.",
        },
      },
      {
        id: "retry-30-seconds",
        name: "retry_interval is 30 seconds and the rest of the config is intact",
        assert: {
          type: "all",
          of: [
            { type: "file_matches", path: "/etc/lumen/notify.conf", pattern: "^retry_interval\\s*=\\s*30\\s*$" },
            { type: "file_matches", path: "/etc/lumen/notify.conf", pattern: "^smtp_port\\s*=\\s*587\\s*$" },
            { type: "file_matches", path: "/etc/lumen/notify.conf", pattern: "^max_retries\\s*=\\s*5\\s*$" },
          ],
        },
        feedback: {
          what: "/etc/lumen/notify.conf does not have retry_interval = 30, or other settings (smtp_port, max_retries) were changed or lost.",
          why: "Marco's intent was a 30-second retry. Rewriting the whole file, or changing other values, alters behaviour nobody asked to change.",
          next: "Change only that value: sudo sed -i 's/^retry_interval = 30s$/retry_interval = 30/' /etc/lumen/notify.conf, then sudo grep -n retry /etc/lumen/notify.conf.",
        },
      },
    ],
    solution: [
      "systemctl status lumen-notify",
      "sudo journalctl -u lumen-notify -n 10 --no-pager",
      "sudo grep -n retry_interval /etc/lumen/notify.conf",
      "sudo sed -i 's/^retry_interval = 30s$/retry_interval = 30/' /etc/lumen/notify.conf",
      "sudo grep -n retry_interval /etc/lumen/notify.conf",
      "sudo systemctl restart lumen-notify",
      "sudo systemctl enable lumen-notify",
      "systemctl status lumen-notify",
    ],
    wrongSolutions: [
      {
        label: "Enables the unit without fixing the config",
        steps: ["sudo systemctl enable --now lumen-notify"],
      },
      {
        label: "Fixes the config and restarts, but never enables it",
        steps: ["sudo sed -i 's/^retry_interval = 30s$/retry_interval = 30/' /etc/lumen/notify.conf", "sudo systemctl restart lumen-notify"],
      },
      {
        label: "Deletes the retry_interval line instead of fixing it",
        steps: ["sudo sed -i '/^retry_interval/d' /etc/lumen/notify.conf", "sudo systemctl enable --now lumen-notify"],
      },
      {
        label: "Overwrites the whole config with just the two keys from the error",
        steps: [
          "printf 'smtp_host = mail.lumen.internal\\nretry_interval = 30\\n' | sudo tee /etc/lumen/notify.conf",
          "sudo systemctl enable --now lumen-notify",
        ],
      },
    ],
    starterCommands: ["systemctl status lumen-notify", "sudo journalctl -u lumen-notify -n 10", "cat /var/log/lumen/changes.txt"],
  },
  successCriteria: [
    "lumen-notify is active",
    "lumen-notify is enabled so it starts at boot",
    "retry_interval is 30 (whole seconds) and the other settings are unchanged",
  ],
  hints: [
    "`systemctl status lumen-notify` answers two questions: the word after the unit file path on the `Loaded:` line (enabled/disabled) and the `Active:` line. Write both down.",
    "systemd's own lines only say it failed. `sudo journalctl -u lumen-notify -n 10` contains a line from `lumen-notify[...]` itself: which key and which line number?",
    "The program wants whole seconds. Look at line 7 with `sudo grep -n retry /etc/lumen/notify.conf` and change only that value with `sudo sed -i 's/^retry_interval = 30s$/retry_interval = 30/' /etc/lumen/notify.conf`.",
    "Then `sudo systemctl restart lumen-notify` and `sudo systemctl enable lumen-notify` (or `enable --now` in one step), and confirm with `systemctl is-active lumen-notify` and `systemctl is-enabled lumen-notify`.",
  ],
  questions: [
    {
      id: "interpret-status",
      kind: "mcq",
      prompt: "What does this status tell you?",
      code: "● lumen-queue.service - Lumen job queue\n     Loaded: loaded (/lib/systemd/system/lumen-queue.service; disabled; preset: enabled)\n     Active: active (running) since Mon 2026-03-02 08:15:00 UTC; 1h 15min ago",
      codeLanguage: "text",
      options: [
        "It is running and will start at boot",
        "It is running now but will not start after a reboot",
        "It is stopped but will start at boot",
        "It failed and is disabled",
      ],
      answer: 1,
      explanation: "Active: active (running) is the current state; 'disabled' on the Loaded line means no boot-time start. The two are independent.",
    },
    {
      id: "order-config-fix",
      kind: "order",
      prompt: "Order the steps for fixing a service that fails on a config error.",
      items: [
        "systemctl status UNIT to see the active and enabled states",
        "journalctl -u UNIT to read the program's own error message",
        "Change only the offending value with sudo sed -i (or an editor)",
        "grep the file to verify the change",
        "sudo systemctl restart UNIT",
        "Check status again, and enable the unit if it must start at boot",
      ],
      explanation: "Diagnose from evidence, make one change, verify it, apply it, then confirm — including the boot-time state.",
    },
    {
      id: "predict-enable",
      kind: "mcq",
      prompt: "A unit is `inactive` and `disabled`. You run `sudo systemctl enable lumen-notify` only. What is its state now?",
      options: ["active and enabled", "inactive and enabled", "active and disabled", "failed and enabled"],
      answer: 1,
      explanation: "enable only arranges for it to start at boot. Use start (or enable --now) to start it now.",
    },
  ],
  debrief: {
    solution: `Two separate problems, found with two commands:

${F}bash
systemctl status lumen-notify                 # Loaded: ...; disabled  |  Active: failed
sudo journalctl -u lumen-notify -n 10         # notify.conf line 7: invalid value for 'retry_interval'
sudo sed -i 's/^retry_interval = 30s$/retry_interval = 30/' /etc/lumen/notify.conf
sudo systemctl restart lumen-notify           # now active
sudo systemctl enable lumen-notify            # now starts at boot
${F}

\`sudo systemctl enable --now lumen-notify\` after the config fix does both in one step, and fixing the file with \`sudo tee\` or an editor is equally valid — the checks look at the service states and the resulting config.`,
    commonMistakes: [
      "Running enable and assuming the service is now running (enable affects boot only).",
      "Restarting repeatedly without reading the journal; the error does not change until the config does.",
      "Deleting or commenting out the failing key, which removes the setting instead of fixing it.",
      "Rewriting the whole file with echo/tee and dropping unrelated settings such as smtp_port.",
      "Editing with sed but not verifying with grep, then restarting with a typo still in place.",
    ],
    realWorld:
      "On real hosts, prefer tools that validate before you restart: nginx -t, sshd -t, named-checkconf, or the service's --check flag, so a bad config never takes a running service down. Configuration management (Ansible, Puppet) usually manages both the file and 'enabled: true' together, which prevents the 'started by hand during a pilot and never enabled' failure seen here.",
  },
  review: [
    {
      id: "lx-start-vs-enable",
      skill: "lx.services",
      variants: [
        {
          id: "lx-start-vs-enable-a",
          kind: "short",
          prompt: "Write one command that starts `labeld` now **and** makes it start at boot.",
          accept: ["sudo systemctl enable --now labeld", "systemctl enable --now labeld", "sudo systemctl enable --now labeld.service"],
          acceptPatterns: ["^(sudo\\s+)?systemctl\\s+enable\\s+--now\\s+labeld(\\.service)?$", "^(sudo\\s+)?systemctl\\s+--now\\s+enable\\s+labeld(\\.service)?$"],
          explanation: "enable --now = enable (boot) + start (now).",
        },
        {
          id: "lx-start-vs-enable-b",
          kind: "mcq",
          prompt: "After `sudo systemctl start lumen-queue`, `systemctl is-enabled lumen-queue` prints `disabled`. What happens at the next reboot?",
          options: ["It starts, because it was started", "It does not start", "It starts in failed state", "systemd asks whether to start it"],
          answer: 1,
          explanation: "start affects only the current boot. Only enable makes it start at boot.",
        },
        {
          id: "lx-start-vs-enable-c",
          kind: "mcq",
          prompt: "Which command shows only whether `sshd` is running right now, printing a single word?",
          options: ["systemctl is-enabled sshd", "systemctl is-active sshd", "systemctl cat sshd", "systemctl enable sshd"],
          answer: 1,
          explanation: "is-active prints active/inactive/failed; is-enabled prints enabled/disabled.",
        },
      ],
    },
    {
      id: "lx-journal-for-unit",
      skill: "lx.services",
      variants: [
        {
          id: "lx-journal-for-unit-a",
          kind: "short",
          prompt: "Write the command that shows the last 20 journal lines for the unit `route-planner`.",
          accept: ["sudo journalctl -u route-planner -n 20", "journalctl -u route-planner -n 20", "sudo journalctl -n 20 -u route-planner"],
          acceptPatterns: ["^(sudo\\s+)?journalctl\\s+(-u\\s*route-planner(\\.service)?\\s+-n\\s*20|-n\\s*20\\s+-u\\s*route-planner(\\.service)?)(\\s+--no-pager)?$"],
          explanation: "-u selects the unit, -n limits to the most recent N lines.",
        },
        {
          id: "lx-journal-for-unit-b",
          kind: "mcq",
          prompt: "In the journal for a failed unit, which line most likely tells you *why* it failed?",
          options: [
            "systemd[1]: Failed to start lumen-notify.service",
            "systemd[1]: lumen-notify.service: Main process exited, code=exited, status=1/FAILURE",
            "lumen-notify[48113]: notify.conf line 7: invalid value for 'retry_interval'",
            "systemd[1]: Starting lumen-notify.service...",
          ],
          answer: 2,
          explanation: "systemd reports that the process exited; the program's own line (name[pid]) says why.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `dns-01`, Dev changed a zone setting and restarted `named`. `systemctl status named` shows `Loaded: ...; enabled` and `Active: failed (Result: exit-code)`. The journal contains `named[901]: /etc/bind/named.conf.options:14: missing ';' before '}'`.",
    question: {
      id: "transfer-named-fix",
      kind: "mcq",
      prompt: "What should Dev do?",
      options: [
        "sudo systemctl enable named, because it is not enabled",
        "Add the missing ';' at line 14, check it (named-checkconf), then sudo systemctl restart named",
        "Reboot dns-01 so named starts cleanly",
        "Restart named until it comes up",
      ],
      answer: 1,
      explanation:
        "It is already enabled; the failure is the config syntax the journal points at. Fix that line, validate, restart, and check status. A reboot would hit the same error.",
    },
  },
  refresher: {
    body: `A systemd unit has two separate states. **Active** — is it running now? Change it with \`systemctl start | stop | restart\`. **Enabled** — will it start at boot? Change it with \`systemctl enable | disable\`. \`enable --now\` does both.

\`systemctl status UNIT\` shows both, and \`journalctl -u UNIT\` shows its log. Look for the line written by the program itself, e.g. \`lumen-notify[123]: ...\`: that is the reason it failed. Changes need root, so use \`sudo\`.`,
    practice: {
      id: "refresher-enable-meaning",
      kind: "mcq",
      prompt: "What does `systemctl enable` change?",
      options: ["Whether the unit is running now", "Whether the unit starts at boot", "The unit's config file", "The unit's log level"],
      answer: 1,
      explanation: "enable affects boot-time start only.",
    },
  },
};
