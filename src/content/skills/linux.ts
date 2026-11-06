import type { Skill } from "@/content/schema";

export const linuxSkills: Skill[] = [
  {
    id: "lx.navigation",
    track: "linux",
    name: "Filesystem navigation and layout",
    description:
      "Move around with cd, pwd and ls, read absolute and relative paths, and know where things live on a Linux server (/etc, /var/log, /srv, /opt, /home, /tmp).",
  },
  {
    id: "lx.find-search",
    track: "linux",
    name: "Finding files and content",
    description:
      "Locate files by name, type, owner and permission with find, and search inside files with grep -r, then confirm a hit before acting on it.",
  },
  {
    id: "lx.file-ops",
    track: "linux",
    name: "File operations",
    description:
      "Create, copy, move, link and remove files and directories with mkdir, cp, mv, ln and rm, including the trailing-directory and symlink behaviours that catch people out.",
  },
  {
    id: "lx.pipes",
    track: "linux",
    name: "Pipes and redirection",
    description:
      "Chain small programs with |, send stdout and stderr to files with >, >> and 2>, and build a pipeline one stage at a time.",
  },
  {
    id: "lx.text-processing",
    track: "linux",
    name: "Text processing",
    description:
      "Filter, slice, count and rank log lines with grep, cut, awk, sort and uniq, matching on the right field rather than anywhere in the line.",
  },
  {
    id: "lx.permissions",
    track: "linux",
    name: "Permission model",
    description:
      "Read rwx bits for owner, group and others, set them in octal or symbolic form, understand what r, w and x mean on a directory, and control defaults with umask.",
  },
  {
    id: "lx.users-groups",
    track: "linux",
    name: "Users and groups",
    description:
      "Inspect identities with id and getent, create accounts, and grant access by group membership (usermod -aG) with least privilege instead of sudo or world-writable modes.",
  },
  {
    id: "lx.processes",
    track: "linux",
    name: "Processes and signals",
    description:
      "Find processes with ps, pgrep and ss, identify the right PID and owner, and stop them with the right signal without collateral damage.",
  },
  {
    id: "lx.environment",
    track: "linux",
    name: "Environment variables",
    description:
      "Tell shell variables from exported environment variables, see what a child process inherits, and persist settings in ~/.bashrc or an env file.",
  },
  {
    id: "lx.logs",
    track: "linux",
    name: "Logs and the journal",
    description:
      "Read journalctl and /var/log files, correlate timestamps across sources, and reconstruct what happened in which order during an incident.",
  },
  {
    id: "lx.services",
    track: "linux",
    name: "systemd services",
    description:
      "Start, stop, restart and enable units with systemctl, read systemctl status, and know the difference between running now and starting at boot.",
  },
  {
    id: "lx.scripting",
    track: "linux",
    name: "Shell scripting",
    description:
      "Write bash scripts that take arguments, loop over \"$@\", branch with tests, quote variables, and report success or failure through exit codes.",
  },
  {
    id: "lx.troubleshooting",
    track: "linux",
    name: "Systematic troubleshooting",
    description:
      "Go from symptom to evidence to root cause: read the error, form one hypothesis, test it, fix the smallest thing, and verify — repeating when there is more than one cause.",
  },
];
