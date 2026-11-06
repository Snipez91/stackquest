/** Command registry, help groups and man summaries. */
import { FILE_COMMANDS } from "./files";
import { NETWORK_COMMANDS } from "./network";
import { SYSTEM_COMMANDS } from "./system";
import { TEXT_COMMANDS } from "./text";
import type { CommandFn } from "./types";

/** Implemented inside the interpreter. */
export const BUILTIN_NAMES = new Set([
  "cd", "pwd", "export", "unset", "local", "declare", "typeset", "readonly", "read", "exit", "logout", "return", "break", "continue",
  "source", ".", "eval", "shift", "set", "true", "false", ":", "type", "command", "history", "alias", "unalias", "umask", "exec",
  "wait", "jobs", "fg", "bg", "let", "test", "[", "sudo",
]);

export const HELP_GROUPS: [string, string[]][] = [
  ["Navigation & files", ["pwd", "cd", "ls", "cat", "less", "more", "head", "tail", "touch", "mkdir", "rmdir", "rm", "cp", "mv", "ln", "find", "stat", "file", "du", "df", "tee", "basename", "dirname", "realpath", "readlink"]],
  ["Permissions & users", ["chmod", "chown", "chgrp", "umask", "id", "whoami", "groups", "sudo", "su", "useradd", "usermod", "groupadd", "gpasswd", "userdel", "getent"]],
  ["Text processing", ["echo", "printf", "grep", "wc", "sort", "uniq", "cut", "tr", "awk", "sed", "rev", "tac", "nl", "seq", "xargs", "expr"]],
  ["Processes & services", ["ps", "kill", "pgrep", "pkill", "systemctl", "service", "journalctl"]],
  ["System info", ["date", "uptime", "hostname", "uname", "free", "who", "env", "printenv", "which", "type", "history", "clear"]],
  ["Networking", ["ip", "ifconfig", "ping", "traceroute", "nslookup", "dig", "host", "curl", "wget", "nc", "ss", "netstat", "dhclient", "ufw", "ssh"]],
  ["Shell", ["bash", "sh", "source", "export", "unset", "read", "test", "[", "[[", "if", "for", "while", "case", "function", "exit", "sleep", "true", "false"]],
];

export const MAN: Record<string, string> = {
  pwd: "pwd - print the current working directory.",
  cd: "cd [DIR] - change directory (needs x on DIR and every parent). 'cd -' returns to the previous directory, 'cd' goes home.",
  ls: "ls [-lahRdtrS1] [PATH...] - list directory contents. -l long format (mode, links, owner, group, size, mtime), -a include dotfiles, -h human sizes, -R recursive, -d the directory itself.",
  cat: "cat [-n] [FILE...] - concatenate files to stdout (reads stdin when no FILE or '-'). Needs r on the file and x on each parent directory.",
  less: "less FILE - page through a file (in this simulation it prints like cat).",
  more: "more FILE - page through a file (in this simulation it prints like cat).",
  head: "head [-n N | -N] [FILE...] - print the first N lines (default 10).",
  tail: "tail [-n N | -n +N | -N] [FILE...] - print the last N lines (default 10); +N starts at line N. -f is not simulated.",
  touch: "touch FILE... - create empty files or update their modification time.",
  mkdir: "mkdir [-p] [-m MODE] DIR... - create directories (-p creates parents, no error if existing). New dirs get 0777 & ~umask.",
  rmdir: "rmdir DIR... - remove empty directories.",
  rm: "rm [-rfv] FILE... - remove files (-r recursive, -f ignore missing). Removing an entry needs w+x on its parent directory.",
  cp: "cp [-rpav] SRC... DEST - copy files (-r for directories, -p/-a preserve mode and times).",
  mv: "mv [-fvn] SRC... DEST - move or rename files.",
  ln: "ln -s TARGET LINK - create a symbolic link (hard links are not simulated).",
  find: "find [PATH...] [-name GLOB] [-type f|d|l] [-perm MODE|-MODE|/MODE] [-user U] [-group G] [-maxdepth N] [-empty] [-exec CMD {} \\;] [-delete] [-print] - search a directory tree.",
  stat: "stat [-c FORMAT] FILE... - show inode details: size, mode, owner, timestamps. FORMAT supports %a %A %U %G %u %g %s %n %F %y.",
  file: "file FILE... - guess a file's type (text, script, directory, symlink...).",
  du: "du [-sh] [PATH...] - estimate disk usage.",
  df: "df [-h] - show filesystem usage (static values in this simulation).",
  tee: "tee [-a] FILE... - copy stdin to stdout and to files. Handy with sudo: 'echo x | sudo tee /etc/file'.",
  basename: "basename PATH [SUFFIX] - strip directory (and suffix) from a path.",
  dirname: "dirname PATH - strip the last component from a path.",
  realpath: "realpath PATH - print the resolved absolute path (follows symlinks).",
  readlink: "readlink [-f] LINK - print a symlink's target (-f: fully resolved path).",
  chmod: "chmod [-R] MODE FILE... - change permission bits. MODE is octal (640) or symbolic (u+x,g-w,o=r,a+r). Only the owner or root may chmod.",
  chown: "chown [-R] USER[:GROUP] FILE... - change owner and/or group (':GROUP' changes only the group). Only root may chown.",
  chgrp: "chgrp [-R] GROUP FILE... - change group; the owner may only switch to a group they belong to.",
  umask: "umask [MODE] - show or set the mask removed from new file (0666) and directory (0777) permissions.",
  id: "id [USER] - print user and group IDs.",
  whoami: "whoami - print the effective user name.",
  groups: "groups [USER] - print group memberships.",
  sudo: "sudo [-u USER] [-i|-s] COMMAND - run a command as root (or USER). Allowed for members of the 'sudo' or 'wheel' group; no password prompt here.",
  su: "su [-] [USER] [-c CMD] - switch user. Only works as root in this simulation (passwords are not simulated); use 'sudo -i' or 'sudo su - USER'.",
  useradd: "useradd [-m] [-s SHELL] [-G GROUPS] [-d HOME] USER - create a user (root only).",
  usermod: "usermod -aG GROUP USER - add USER to a supplementary group (-G without -a replaces the list); -s SHELL changes the shell. Root only.",
  groupadd: "groupadd GROUP - create a group (root only).",
  gpasswd: "gpasswd -a USER GROUP | -d USER GROUP - add/remove a group member (root only).",
  userdel: "userdel [-r] USER - delete a user (root only).",
  getent: "getent passwd|group|hosts [KEY...] - query the user, group and hosts databases (hosts uses /etc/hosts then DNS).",
  echo: "echo [-n] [-e] [ARG...] - print arguments. -n no newline, -e interpret escapes like \\n and \\t.",
  printf: "printf FORMAT [ARG...] - formatted output (%s %d %f %x %5.2f %-10s ...).",
  grep: "grep [-ivncrEFowlLqhH] [-e PATTERN] PATTERN [FILE...] - print lines matching a regex. -i ignore case, -v invert, -n line numbers, -c count, -r recursive, -E extended regex, -o only the match, -w whole words, -l file names only.",
  wc: "wc [-lwc] [FILE...] - count lines, words and bytes.",
  sort: "sort [-nrufh] [-k N[,M]] [-t SEP] [FILE...] - sort lines (-n numeric, -r reverse, -u unique, -k key field, -t field separator).",
  uniq: "uniq [-c] [-d] [-u] - collapse adjacent duplicate lines (sort first!). -c prefixes counts.",
  cut: "cut -d DELIM -f LIST | -c LIST [FILE...] - select fields or characters (LIST like 1,3 or 2-4).",
  tr: "tr [-d] [-s] SET1 [SET2] - translate, delete (-d) or squeeze (-s) characters. Sets support a-z and [:upper:] style classes.",
  awk: "awk [-F SEP] [-v VAR=VAL] 'PROGRAM' [FILE...] - pattern/action text processing: '{print $1, $3}', '$3 > 100', '/error/ {n++} END {print n}', NR, NF, arrays, printf.",
  sed: "sed [-n] [-E] [-i] 'SCRIPT' [FILE...] - stream editor: s/re/rep/g, /re/d, Np, N,Mp, -i edits in place.",
  rev: "rev - reverse each line.",
  tac: "tac - print lines in reverse order.",
  nl: "nl - number lines.",
  seq: "seq [FIRST [STEP]] LAST - print a sequence of numbers.",
  xargs: "xargs [-n N] [-I {}] CMD - build command lines from stdin.",
  expr: "expr ARG OP ARG - evaluate simple integer/string expressions (prefer $(( ... ))).",
  ps: "ps aux | ps -ef | ps -u USER | ps -p PID - list processes, including active services and their PIDs.",
  kill: "kill [-9|-15|-SIG] PID... - send a signal. Only root or the process owner may signal a process.",
  pgrep: "pgrep [-l] [-a] [-f] [-u USER] PATTERN - find process IDs by name.",
  pkill: "pkill [-SIG] [-f] [-u USER] PATTERN - signal processes by name.",
  systemctl: "systemctl status|start|stop|restart|reload|enable [--now]|disable|is-active|is-enabled|list-units [--all]|cat UNIT - control services. Changing state needs root (use sudo).",
  service: "service NAME start|stop|restart|status - legacy wrapper around systemctl.",
  journalctl: "journalctl [-u UNIT] [-n N] [-e] [-x] [--no-pager] - show service logs. Requires root or the 'adm'/'systemd-journal' group.",
  date: "date [+FORMAT] - print the (simulated, fixed) clock.",
  uptime: "uptime - show how long the system has been running.",
  hostname: "hostname [-I] - print the host name (-I: its IP addresses).",
  uname: "uname [-a] [-r] [-n] [-m] - print kernel/system information.",
  free: "free [-h] - show memory usage (static values).",
  who: "who - show logged-in users.",
  env: "env [VAR=VAL...] [CMD...] - print the environment, or run CMD with extra variables.",
  printenv: "printenv [VAR...] - print environment variables.",
  which: "which CMD... - show the path of a command.",
  type: "type NAME... - tell whether NAME is a builtin, function, keyword or file.",
  history: "history [N] | history -c - show (or clear) this session's command history.",
  clear: "clear - clear the terminal screen.",
  ip: "ip addr|a [show [dev X]] | ip link set dev X up|down | ip addr add|del CIDR dev X | ip route|r [get IP] | ip route add|del default via IP | ip route add CIDR via IP [dev X] - show and change interfaces and routes (changes need root).",
  ifconfig: "ifconfig [-a] [IFACE] - show interfaces (read-only here; use ip to change them).",
  ping: "ping [-c N] HOST - send ICMP echo requests (default 4 here). Resolves names via /etc/hosts then DNS.",
  traceroute: "traceroute [-n] HOST - show the routers on the path to HOST.",
  nslookup: "nslookup NAME [SERVER] - query DNS directly (ignores /etc/hosts).",
  dig: "dig [@SERVER] NAME [+short] | dig -x IP - query DNS directly (ignores /etc/hosts).",
  host: "host NAME [SERVER] - simple DNS lookup (ignores /etc/hosts).",
  curl: "curl [-I] [-v] [-s] [-o FILE] [-f] [-w FMT] URL - make an HTTP request to a simulated web service.",
  wget: "wget [-q] [-O FILE] URL - download a URL (-O - prints to stdout).",
  nc: "nc -z [-v] [-u] HOST PORT[-PORT] - check whether a TCP/UDP port is reachable.",
  ss: "ss -tlnp | -ulnp - list listening sockets (-p shows the owning process; other users' processes need root).",
  netstat: "netstat -tlnp | -ulnp - list listening sockets (legacy).",
  dhclient: "dhclient [-r] IFACE - request (or release) a DHCP lease: sets the address, default route and /etc/resolv.conf (root).",
  ufw: "ufw status [verbose|numbered] | enable | disable | allow|deny PORT[/PROTO] | allow from CIDR to any port N | delete RULE|N | default deny|allow incoming - manage the host firewall (root).",
  ssh: "ssh [-p PORT] [USER@]HOST [CMD] - log in to another lab host as the same user (if it exists there); 'exit' returns.",
  bash: "bash SCRIPT [ARGS...] | bash -c 'CMDS' - run a shell script (does not need x permission, only r).",
  sh: "sh SCRIPT [ARGS...] | sh -c 'CMDS' - run a shell script.",
  source: "source FILE (or . FILE) - run a file in the current shell (variables and cd persist).",
  export: "export VAR[=VALUE] - mark a variable for child processes (scripts, env).",
  unset: "unset VAR - remove a variable.",
  read: "read [-r] [-p PROMPT] VAR... - read a line from stdin into variables (use with < file or a pipe).",
  test: "test EXPR / [ EXPR ] - -f -d -e -r -w -x -s -z -n, = != -eq -ne -lt -gt -le -ge, ! -a -o.",
  "[": "[ EXPR ] - same as test.",
  "[[": "[[ EXPR ]] - bash conditional: && || ! == (glob) =~ (regex) and the test operators.",
  exit: "exit [N] - leave the current shell (returns from ssh/su sessions).",
  sleep: "sleep N - pause (instant in this simulation).",
  true: "true - do nothing, successfully.",
  false: "false - do nothing, unsuccessfully.",
  help: "help - list the commands this simulation supports.",
  man: "man CMD - a short summary of CMD in this simulation.",
};

function help(): CommandFn {
  return (ctx) => {
    if (ctx.args[0]) return man()({ ...ctx, name: "man" });
    let out = "StackQuest Linux simulator — supported commands:\n\n";
    for (const [g, cmds] of HELP_GROUPS) out += `${g}:\n  ${cmds.join("  ")}\n\n`;
    out += "Shell features: pipes |, && || ;, redirects > >> 2> 2>&1 < <<EOF, quotes, $VAR ${VAR:-x} $(cmd) $((math)), globs * ?,\n";
    out += "if/elif/else, for, while/until, case, functions, local, read. Type 'man CMD' for details.\n";
    out += "Anything else reports 'command not supported in this simulation'.\n";
    ctx.out(out);
    return 0;
  };
}

function man(): CommandFn {
  return (ctx) => {
    const name = ctx.args.filter((a) => !/^\d$/.test(a))[0];
    if (!name) {
      ctx.err("What manual page do you want?\nFor example, try 'man man'.\n");
      return 1;
    }
    const m = MAN[name];
    if (!m) {
      if (COMMANDS[name] || BUILTIN_NAMES.has(name)) {
        ctx.out(`${name} - supported in this simulation (no summary available).\n`);
        return 0;
      }
      ctx.err(`No manual entry for ${name}\n(${name} is not supported in this simulation; try 'help')\n`);
      return 16;
    }
    ctx.out(m + "\n");
    return 0;
  };
}

export const COMMANDS: Record<string, CommandFn> = {
  ...FILE_COMMANDS,
  ...TEXT_COMMANDS,
  ...SYSTEM_COMMANDS,
  ...NETWORK_COMMANDS,
  help: help(),
  man: man(),
};
