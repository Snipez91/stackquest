/** Where each simulated binary "lives" (for `which`, `type`, and /usr/bin listings). */
const SBIN = ["useradd", "usermod", "userdel", "groupadd", "ufw", "dhclient", "ip", "ifconfig", "service", "chown"];
const BIN = [
  "ls", "cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "wc", "sort", "uniq", "cut", "tr", "awk", "sed",
  "echo", "printf", "touch", "mkdir", "rmdir", "rm", "cp", "mv", "ln", "chmod", "chgrp", "id", "whoami", "groups",
  "sudo", "su", "passwd", "ps", "kill", "pkill", "pgrep", "top", "env", "printenv", "which", "find", "stat", "file", "du", "df",
  "date", "uptime", "hostname", "uname", "systemctl", "journalctl", "ping", "traceroute", "tracepath", "nslookup", "dig", "host",
  "curl", "wget", "nc", "ss", "netstat", "ssh", "tee", "basename", "dirname", "realpath", "readlink", "seq", "sleep", "true", "false",
  "bash", "sh", "xargs", "tac", "rev", "nl", "getent", "free", "who", "test", "[", "expr", "gpasswd", "clear", "man", "pwd",
];

export const COMMAND_PATHS: Record<string, string> = Object.fromEntries([
  ...BIN.map((c) => [c, c === "bash" || c === "sh" ? `/usr/bin/${c}` : `/usr/bin/${c}`]),
  ...SBIN.map((c) => [c, `/usr/sbin/${c}`]),
]);
