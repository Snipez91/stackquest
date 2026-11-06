import type { MissionInput } from "@/content/schema";

const F = "```";

const policy = `Access policy — web-01 (owner: Priya Raman, SRE)

Group      Grants                                        Who
---------  --------------------------------------------  ------------------------------
deploy     write to /srv/releases (stage + switch)       backend engineers, contractors
dispatch   read dispatch data in /srv/dispatch           Lumen employees on dispatch work
sudo       full root via sudo                            SRE on-call only (Priya, ops)

Rules:
- Grant access by group membership. Never chmod shared directories to 777.
- Adding a group must not remove the user's existing groups.
- Contractors: own account with a home directory and /bin/bash, deploy group only.
`;

export const lxDeployGroupAccess: MissionInput = {
  slug: "lx-deploy-group-access",
  version: 1,
  track: "linux",
  tier: "intermediate",
  order: 1,
  title: "Give the new engineers deploy access, and nothing more",
  summary:
    "A new engineer can't stage releases and a contractor needs an account. Grant both access through group membership with usermod -aG and useradd, without sudo, 777 or wiping existing groups.",
  minutes: 25,
  assessmentTypes: ["configure-system", "interpret-output"],
  skills: ["lx.users-groups"],
  appliesSkills: ["lx.permissions"],
  prerequisites: ["lx-handoff-permissions"],
  brief: {
    from: "Priya Raman, SRE lead",
    channel: "#access-requests",
    body: `Two requests for \`web-01\`, please:

1. **Nadia Petrov** joined Marco's team on Monday. Her deploy fails with \`mkdir: cannot create directory '/srv/releases/tracker-2.4.2': Permission denied\`. She already has an account (\`nadia\`) and needs to keep her dispatch data access.
2. **Tomasz Wilk** is a contractor helping with the 2.5 release. He needs an account \`tomasz\` that can stage releases. Follow the contractor rule in \`/etc/lumen/access-policy.txt\`.

Last time someone "fixed" this by adding people to \`sudo\` and the time before by \`chmod 777 /srv/releases\`. Neither is acceptable: least privilege, by group, per the policy.`,
  },
  objectives: [
    "Inspect identities and memberships with id, groups and getent",
    "Explain how a process's user and group list decide which permission class applies",
    "Add a supplementary group with usermod -aG without removing existing groups",
    "Create an account with a home directory, shell and specific groups using useradd",
  ],
  concept: {
    title: "Access is decided by who you are and which groups you carry",
    body: `Every process runs with a **user ID** and a **list of group IDs**: one primary group plus supplementary groups. When it touches a file, the kernel compares those IDs with the file's owner and group to pick the permission class (owner, group, or others).

So the clean way to let someone write \`/srv/releases\` (\`drwxrwsr-x root deploy\`) is to put them in \`deploy\`. Changing the directory's mode to 777 instead gives *every* account — including compromised service accounts — write access; adding them to \`sudo\` gives them root on the whole host.

${F}bash
id nadia                       # uid, primary gid, supplementary groups
getent group deploy            # deploy:x:2001:marco
sudo usermod -aG deploy nadia  # -a = append. Without -a, -G REPLACES the list!
sudo useradd -m -s /bin/bash -G deploy tomasz   # -m creates /home/tomasz
${F}

The trap is \`usermod -G deploy nadia\`: it sets her supplementary groups to *exactly* \`deploy\`, silently removing \`dispatch\`.

Group lists are read **at login**. On a real server Nadia must log out and in again (or run \`newgrp deploy\`) before her shell carries the new group. The \`s\` in \`drwxrwsr-x\` is the **setgid** bit: files created inside get the directory's group (\`deploy\`) instead of the creator's primary group, so teammates can keep working on each other's files.`,
  },
  workedExample: {
    title: "Worked example: letting the on-call analyst read the journal",
    body: `Aisha (\`aisha\`) is joining the on-call rota and needs to read system logs with \`journalctl\`, which requires the \`adm\` or \`systemd-journal\` group.

**1. Inspect first.**

${F}bash
id aisha
# uid=1007(aisha) gid=1007(aisha) groups=1007(aisha),2002(dispatch)
getent group adm
# adm:x:4:syslog,priya
${F}

**2. Append the group; don't replace the list.**

${F}bash
sudo usermod -aG adm aisha
id aisha
# ... groups=1007(aisha),2002(dispatch),4(adm)
${F}

Had we run \`usermod -G adm aisha\`, \`dispatch\` would be gone and she'd lose access to dispatch data.

**3. Don't over-grant.** \`sudo journalctl\` would also work if she were in \`sudo\`, but that hands her root for every command. \`adm\` grants exactly "read logs".

**4. Tell her to log in again** so new sessions pick up the group.`,
  },
  simulationNote:
    "Accounts live in the simulated /etc/passwd and /etc/group, which useradd, usermod, gpasswd and getent read and update. Unlike a real system, new group memberships apply to the simulated user immediately; on a real server the user must start a new login session (or use newgrp). Passwords are not simulated, so you don't need passwd for the new account.",
  workspace: {
    kind: "shell",
    scenario: {
      clock: "2026-03-02T10:30:00Z",
      hosts: [
        {
          name: "web-01",
          groups: [
            { name: "sudo", gid: 27 },
            { name: "deploy", gid: 2001 },
            { name: "dispatch", gid: 2002 },
          ],
          users: [
            { name: "ops", uid: 1000, groups: ["sudo", "deploy"], home: "/home/ops" },
            { name: "priya", uid: 1001, groups: ["sudo", "deploy", "dispatch"], home: "/home/priya" },
            { name: "marco", uid: 1002, groups: ["deploy", "dispatch"], home: "/home/marco" },
            { name: "nadia", uid: 1006, groups: ["dispatch"], home: "/home/nadia" },
            { name: "lena", uid: 1005, groups: [], home: "/home/lena" },
          ],
          files: [
            { path: "/etc/lumen", type: "dir", mode: "0755" },
            { path: "/etc/lumen/access-policy.txt", content: policy },
            { path: "/srv/releases", type: "dir", mode: "2775", owner: "root", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1", type: "dir", mode: "2775", owner: "marco", group: "deploy" },
            { path: "/srv/releases/tracker-2.4.1/VERSION", content: "2.4.1\n", mode: "0664", owner: "marco", group: "deploy" },
            { path: "/srv/releases/current", type: "symlink", target: "/srv/releases/tracker-2.4.1", owner: "marco", group: "deploy" },
            { path: "/srv/dispatch", type: "dir", mode: "0750", owner: "root", group: "dispatch" },
            { path: "/srv/dispatch/routes-2026-03-02.json", content: "{\"routes\": 42}\n", mode: "0640", owner: "root", group: "dispatch" },
            { path: "/home/nadia/deploy.log", content: "$ mkdir /srv/releases/tracker-2.4.2\nmkdir: cannot create directory '/srv/releases/tracker-2.4.2': Permission denied\n", owner: "nadia", group: "nadia" },
          ],
        },
      ],
      start: { host: "web-01", user: "ops" },
    },
    checks: [
      {
        id: "nadia-can-deploy",
        name: "nadia can create release directories and still reads dispatch data",
        assert: {
          type: "all",
          of: [
            { type: "access", path: "/srv/releases", user: "nadia", access: "w", expect: true },
            { type: "access", path: "/srv/dispatch/routes-2026-03-02.json", user: "nadia", access: "r", expect: true },
          ],
        },
        feedback: {
          what: "nadia cannot write to /srv/releases, or she has lost read access to /srv/dispatch.",
          why: "/srv/releases is group-writable for deploy; nadia only gets that through membership. If her dispatch group was removed, she can deploy but no longer do her normal work.",
          next: "Append the group: sudo usermod -aG deploy nadia, then check id nadia shows both dispatch and deploy. If dispatch is gone, add it back with sudo usermod -aG dispatch nadia.",
        },
      },
      {
        id: "tomasz-account",
        name: "tomasz exists with a home directory, bash, and deploy access",
        assert: {
          type: "all",
          of: [
            { type: "command_output", run: "getent passwd tomasz", pattern: "^tomasz:[^:]*:\\d+:\\d+:[^:]*:/home/tomasz:/bin/bash$" },
            { type: "owner", path: "/home/tomasz", owner: "tomasz" },
            { type: "user_in_group", user: "tomasz", group: "deploy", expect: true },
            { type: "access", path: "/srv/releases/tracker-2.4.1", user: "tomasz", access: "w", expect: true },
          ],
        },
        feedback: {
          what: "The tomasz account is missing, has no home directory owned by him, does not use /bin/bash, or is not in deploy.",
          why: "The contractor rule needs a personal account (not a shared login) that can stage releases. Without -m there is no home for his SSH key and shell history; without -s /bin/bash he gets /bin/sh.",
          next: "Create it in one go: sudo useradd -m -s /bin/bash -G deploy tomasz. If it already exists, fix it with sudo usermod -s /bin/bash -aG deploy tomasz and create the home with sudo mkdir /home/tomasz && sudo chown tomasz:tomasz /home/tomasz.",
        },
      },
      {
        id: "least-privilege",
        name: "No sudo, no extra groups, no world-writable releases",
        assert: {
          type: "all",
          of: [
            { type: "user_in_group", user: "nadia", group: "sudo", expect: false },
            { type: "user_in_group", user: "tomasz", group: "sudo", expect: false },
            { type: "user_in_group", user: "tomasz", group: "dispatch", expect: false },
            { type: "mode_max", path: "/srv/releases", max: "2775" },
            { type: "access", path: "/srv/releases", user: "lena", access: "w", expect: false },
          ],
        },
        feedback: {
          what: "Someone got more than the policy allows: nadia or tomasz is in sudo, tomasz is in dispatch, or /srv/releases is writable by everyone (lena can write to it).",
          why: "sudo is root on the whole host, dispatch exposes customer data to a contractor, and a world-writable release directory lets any compromised account replace the code that runs.",
          next: "Remove extra memberships with sudo gpasswd -d USER GROUP, and restore the directory with sudo chmod 2775 /srv/releases.",
        },
      },
    ],
    solution: [
      "cat /etc/lumen/access-policy.txt",
      "ls -ld /srv/releases",
      "id nadia",
      "getent group deploy",
      "sudo usermod -aG deploy nadia",
      "id nadia",
      "sudo useradd -m -s /bin/bash -G deploy tomasz",
      "id tomasz",
      "getent passwd tomasz",
    ],
    wrongSolutions: [
      {
        label: "usermod -G without -a, wiping nadia's dispatch membership",
        steps: ["sudo usermod -G deploy nadia", "sudo useradd -m -s /bin/bash -G deploy tomasz"],
      },
      {
        label: "Adds both to sudo",
        steps: ["sudo usermod -aG sudo nadia", "sudo useradd -m -s /bin/bash -G sudo,deploy tomasz"],
      },
      {
        label: "chmod 777 on the releases directory and a bare useradd",
        steps: ["sudo chmod 777 /srv/releases", "sudo useradd tomasz"],
      },
      {
        label: "Gives the contractor the same groups as staff",
        steps: ["sudo usermod -aG deploy nadia", "sudo useradd -m -s /bin/bash -G deploy,dispatch tomasz"],
      },
    ],
    starterCommands: ["cat /etc/lumen/access-policy.txt", "id nadia", "ls -ld /srv/releases", "getent group deploy"],
  },
  successCriteria: [
    "nadia can write to /srv/releases and still read /srv/dispatch",
    "tomasz has a personal account with /home/tomasz, /bin/bash and the deploy group",
    "Neither is in sudo, tomasz is not in dispatch, and /srv/releases is not writable by other users",
  ],
  hints: [
    "Compare `ls -ld /srv/releases` with `id nadia`. Which class does nadia fall into for that directory today, and which group would put her in the class that has w?",
    "`getent group deploy` lists the current members. The policy grants release access through that group — not through sudo, not through the directory mode.",
    "Use `usermod -aG` (append). Plain `-G` replaces the supplementary group list, and nadia would lose `dispatch`. Verify with `id nadia` afterwards.",
    "For the contractor: `sudo useradd -m -s /bin/bash -G deploy tomasz`, then `id tomasz` and `getent passwd tomasz` to check home and shell.",
  ],
  questions: [
    {
      id: "predict-usermod-g",
      kind: "mcq",
      prompt: "`id nadia` shows `groups=1006(nadia),2002(dispatch)`. What does it show after `sudo usermod -G deploy nadia`?",
      options: [
        "groups=1006(nadia),2002(dispatch),2001(deploy)",
        "groups=1006(nadia),2001(deploy)",
        "groups=2001(deploy)",
        "usermod refuses without -a",
      ],
      answer: 1,
      explanation:
        "-G sets the supplementary list to exactly what you give it. The primary group (nadia) stays; dispatch is removed. -aG appends instead.",
    },
    {
      id: "interpret-relogin",
      kind: "mcq",
      prompt: "On a real server, Nadia stays logged in while you run `usermod -aG deploy nadia`. In her existing shell, `mkdir /srv/releases/x` still fails. Why?",
      options: [
        "usermod needs a reboot",
        "Her running shell got its group list at login; she needs a new login (or newgrp deploy)",
        "The setgid bit blocks new members",
        "She also needs to be in sudo",
      ],
      answer: 1,
      explanation:
        "A process's supplementary groups are fixed when it starts. New sessions pick up the change; existing ones don't.",
    },
    {
      id: "explain-least-privilege",
      kind: "explain",
      prompt: "Sam asks why you didn't just add Nadia to sudo, since that would have fixed it in one command. Explain.",
      concepts: [
        { label: "sudo grants root over the whole system", anyOf: ["root", "everything", "whole host", "whole system", "any command", "all commands", "full access", "entire"] },
        { label: "The deploy group grants exactly the access needed", anyOf: ["deploy group", "group membership", "only what", "just what", "exactly", "needed", "least privilege", "minimum"] },
        { label: "Risk: mistakes or compromise have a larger blast radius", anyOf: ["risk", "mistake", "accident", "compromise", "attacker", "blast radius", "damage", "audit"] },
      ],
      minConcepts: 2,
      explanation:
        "Least privilege: the deploy group grants write access to /srv/releases and nothing else, so mistakes and compromised credentials can do far less damage.",
      modelAnswer:
        "sudo would give Nadia root over the whole host, so any mistake or a compromised laptop could change anything on web-01. She only needs to write to /srv/releases, and the deploy group grants exactly that, which is least privilege. I appended deploy with usermod -aG so she kept her dispatch access.",
    },
  ],
  debrief: {
    solution: `${F}bash
id nadia                          # nadia, dispatch -> falls under "others" on /srv/releases (r-x)
sudo usermod -aG deploy nadia     # now group class: rwx
sudo useradd -m -s /bin/bash -G deploy tomasz
id nadia; id tomasz; getent passwd tomasz
${F}

\`gpasswd -a nadia deploy\` is equivalent to \`usermod -aG deploy nadia\`, and the grader accepts either — it checks memberships and access, not the command. The directory was never the problem: \`drwxrwsr-x root deploy\` is already correct, and the setgid \`s\` keeps every release file in the \`deploy\` group whoever creates it.`,
    commonMistakes: [
      "usermod -G deploy nadia without -a, which removes her other supplementary groups.",
      "Adding users to sudo to fix a single directory's access.",
      "chmod 777 /srv/releases, which lets every account — including service accounts — replace deployed code.",
      "useradd without -m (no home directory) or without -s /bin/bash (the default here is /bin/sh).",
      "Forgetting that existing sessions keep their old group list until the user logs in again.",
    ],
    realWorld:
      "On larger fleets users and groups come from a directory (LDAP, FreeIPA, Active Directory via SSSD) or configuration management (Ansible's user module), so you would change the group in one place rather than per host — but the model is identical. Audit trails matter: group changes should go through a ticket, and getent group deploy is how you review who has access.",
  },
  review: [
    {
      id: "lx-usermod-append",
      skill: "lx.users-groups",
      variants: [
        {
          id: "lx-usermod-append-a",
          kind: "short",
          prompt: "Write the command that adds user `aisha` to the supplementary group `adm` while keeping her existing groups.",
          accept: ["sudo usermod -aG adm aisha", "usermod -aG adm aisha", "sudo gpasswd -a aisha adm", "gpasswd -a aisha adm"],
          acceptPatterns: ["^(sudo\\s+)?usermod\\s+(-aG|-a\\s+-G|-Ga|--append\\s+--groups)\\s+adm\\s+aisha$", "^(sudo\\s+)?gpasswd\\s+-a\\s+aisha\\s+adm$"],
          explanation: "-a appends; -G alone would replace her supplementary groups with just adm.",
        },
        {
          id: "lx-usermod-append-b",
          kind: "short",
          prompt: "Write the command that adds user `ci-runner` to the `docker` group without removing its other groups.",
          accept: ["sudo usermod -aG docker ci-runner", "usermod -aG docker ci-runner", "sudo gpasswd -a ci-runner docker"],
          acceptPatterns: ["^(sudo\\s+)?usermod\\s+(-aG|-a\\s+-G|-Ga|--append\\s+--groups)\\s+docker\\s+ci-runner$", "^(sudo\\s+)?gpasswd\\s+-a\\s+ci-runner\\s+docker$"],
          explanation: "usermod -aG GROUP USER (or gpasswd -a USER GROUP) appends a supplementary group.",
        },
      ],
    },
    {
      id: "lx-which-class-groups",
      skill: "lx.users-groups",
      variants: [
        {
          id: "lx-which-class-groups-a",
          kind: "mcq",
          prompt: "`/srv/releases` is `drwxrwsr-x root deploy`. `id dmitri` shows `groups=1010(dmitri),2002(dispatch)`. Can dmitri create a directory in /srv/releases?",
          options: ["Yes, others have r-x", "No: he falls under others (r-x), which lacks w", "Yes, because of the setgid bit", "Only if he is the owner"],
          answer: 1,
          explanation: "He is neither root (the owner) nor in deploy, so the others triplet r-x applies: no w.",
        },
        {
          id: "lx-which-class-groups-b",
          kind: "mcq",
          prompt: "`/var/log/app` is `drwxr-x--- syslog adm`. `id bea` shows `groups=1011(bea),4(adm)`. What can bea do?",
          options: ["Nothing", "List and read files the adm group can read, but not create files", "Create and delete files", "Only cd into it"],
          answer: 1,
          explanation: "bea is in adm, so the group triplet r-x applies: list and enter, no w to create.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "On `db-01`, the analytics team wants Marco to read the nightly CSV exports in `/var/lib/exports` (`drwxr-x--- postgres analytics`, files `-rw-r----- postgres analytics`). Marco's groups are `marco deploy dispatch`.",
    question: {
      id: "transfer-analytics-access",
      kind: "mcq",
      prompt: "What is the least-privilege change?",
      options: [
        "sudo chmod -R o+r /var/lib/exports",
        "sudo usermod -G analytics marco",
        "sudo usermod -aG analytics marco (then Marco logs in again)",
        "sudo usermod -aG sudo marco",
      ],
      answer: 2,
      explanation:
        "The group already has exactly the needed access. Append the group (keeping deploy and dispatch) and start a new session. o+r exposes the data to everyone; -G without -a drops his other groups; sudo is root.",
    },
  },
  refresher: {
    body: `A process carries a user and a list of groups. For each file, the kernel checks: are you the owner? Else, is the file's group in your list? Else you're "others".

To grant access, add the user to the file's group: \`sudo usermod -aG GROUP USER\` — the \`-a\` matters, because \`-G\` alone *replaces* the list. Check with \`id USER\`. Create accounts with \`sudo useradd -m -s /bin/bash -G GROUP USER\`. The user needs a fresh login before existing shells see the new group.`,
    practice: {
      id: "refresher-id-output",
      kind: "mcq",
      prompt: "`id ana` prints `uid=1012(ana) gid=1012(ana) groups=1012(ana),2001(deploy)`. Which statement is true?",
      options: ["ana is in sudo", "ana's primary group is deploy", "ana is a member of deploy", "ana has no supplementary groups"],
      answer: 2,
      explanation: "Her primary group is ana (gid=), and deploy is a supplementary group.",
    },
  },
};
