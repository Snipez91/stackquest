import { describe, expect, it } from "vitest";
import { Simulation, MAX_STDOUT } from "../../src/sim";
import { webScenario } from "./fixtures";

function sim() {
  return new Simulation(webScenario());
}
const out = (s: Simulation, l: string) => s.exec(l).stdout;

describe("shell language", () => {
  it("prompt, cwd, history", () => {
    const s = sim();
    expect(s.prompt()).toBe("dev@web-01:~$");
    s.exec("cd /var/log");
    expect(s.prompt()).toBe("dev@web-01:/var/log$");
    expect(s.cwd).toBe("/var/log");
    s.exec("cd -");
    expect(s.cwd).toBe("/home/dev");
    expect(s.history).toEqual(["cd /var/log", "cd -"]);
    expect(out(s, "history")).toBe("    1  cd /var/log\n    2  cd -\n    3  history\n");
  });

  it("log pipeline: grep | awk | sort | uniq -c | sort -rn | head", () => {
    const s = sim();
    expect(out(s, "grep -c ' 500 ' /var/log/access.log")).toBe("2\n");
    expect(out(s, "awk '{print $1}' /var/log/access.log | sort | uniq -c | sort -rn | head -n 2")).toBe("      3 10.0.0.5\n      2 10.0.0.7\n");
    expect(out(s, "cut -d' ' -f1 /var/log/access.log | sort -u")).toBe("10.0.0.5\n10.0.0.7\n10.0.0.9\n");
    expect(out(s, "awk '$8 >= 500 {print $1, $6}' /var/log/access.log")).toBe("10.0.0.7 /login\n10.0.0.5 /api\n");
    expect(out(s, "awk '{bytes[$1] += $9} END {for (ip in bytes) print ip, bytes[ip]}' /var/log/access.log | sort")).toBe("10.0.0.5 1600\n10.0.0.7 640\n10.0.0.9 256\n");
    expect(out(s, "awk -F'\"' '{print $2}' /var/log/access.log | awk '{print $2}' | sort | uniq -c | sort -k1,1nr -k2 | head -1")).toBe("      2 /\n");
    expect(out(s, "grep -o 'GET /[a-z]*' /var/log/access.log | wc -l")).toBe("5\n");
    expect(out(s, "grep -v GET /var/log/access.log | wc -l")).toBe("1\n");
    expect(out(s, "grep -iE 'admin|api' -n /var/log/access.log | cut -d: -f1 | tr '\\n' ' '")).toBe("4 5 ");
    expect(out(s, "sed -n '2p' /var/log/access.log | awk '{print NR, NF}'")).toBe("1 9\n");
    expect(out(s, "awk 'NR==1' /var/log/access.log | tr a-z A-Z | cut -c1-8")).toBe("10.0.0.5\n");
    expect(out(s, "wc -l < /var/log/access.log")).toBe("6\n");
    expect(out(s, "wc -l /var/log/access.log")).toBe("6 /var/log/access.log\n");
  });

  it("redirection: > >> 2> 2>&1 < and /dev/null", () => {
    const s = sim();
    s.exec("echo one > f.txt; echo two >> f.txt");
    expect(out(s, "cat f.txt")).toBe("one\ntwo\n");
    const r = s.exec("cat nope 2> err.txt");
    expect(r.stderr).toBe("");
    expect(out(s, "cat err.txt")).toBe("cat: nope: No such file or directory\n");
    s.exec("ls f.txt nope > both.txt 2>&1");
    expect(out(s, "cat both.txt")).toBe("ls: cannot access 'nope': No such file or directory\nf.txt\n");
    expect(s.exec("cat nope 2>/dev/null").stderr).toBe("");
    expect(out(s, "sort < f.txt")).toBe("one\ntwo\n");
    expect(s.exec("echo x > /etc/forbidden").stderr).toBe("bash: /etc/forbidden: Permission denied\n");
    expect(out(s, "echo hi | sudo tee /etc/motd >/dev/null; cat /etc/motd")).toBe("hi\n");
    s.exec("cat > note.txt <<EOF\nuser=$USER\nliteral\nEOF");
    expect(out(s, "cat note.txt")).toBe("user=dev\nliteral\n");
  });

  it("quoting, escapes, variables, command substitution, globs", () => {
    const s = sim();
    expect(out(s, "X='a  b'; echo $X; echo \"$X\"")).toBe("a b\na  b\n");
    expect(out(s, "echo 'single $HOME' \"double $HOME\" \\$HOME")).toBe("single $HOME double /home/dev $HOME\n");
    expect(out(s, "export GREETING=hi; bash -c 'echo $GREETING'")).toBe("hi\n");
    expect(out(s, "LOCALONLY=1; bash -c 'echo [$LOCALONLY]'")).toBe("[]\n");
    expect(out(s, "echo ${MISSING:-default} ${#HOME}")).toBe("default 9\n");
    expect(out(s, "f=report.tar.gz; echo ${f%.gz} ${f%%.*} ${f#*.}")).toBe("report.tar report tar.gz\n");
    expect(out(s, "echo \"files: $(ls ~ | wc -l)\"")).toBe("files: 2\n");
    expect(out(s, "false; echo $?; true && echo yes || echo no")).toBe("1\nyes\n");
    s.exec("touch a.log b.log c.txt");
    expect(out(s, "echo *.log")).toBe("a.log b.log\n");
    expect(out(s, "echo ?.txt")).toBe("c.txt\n");
    expect(out(s, "echo '*.log'")).toBe("*.log\n");
    expect(out(s, "echo *.none")).toBe("*.none\n");
    expect(out(s, "echo /var/log/*.log")).toBe("/var/log/access.log\n");
    expect(out(s, "echo -e 'a\\tb'; echo -n x; echo")).toBe("a\tb\nx\n");
    expect(out(s, "printf '%s=%03d\\n' a 7 b 42")).toBe("a=007\nb=042\n");
    expect(out(s, "echo $(( 7 / 2 )) $(( 2 ** 10 ))")).toBe("3 1024\n");
    expect(out(s, "echo hi # a comment")).toBe("hi\n");
  });

  it("scripts with arguments, loops, if, case, functions, read", () => {
    const s = sim();
    s.writeFile(
      "check.sh",
      [
        "#!/bin/bash",
        "# usage: check.sh NAME...",
        'echo "script: $0 args: $# first: $1"',
        "count=0",
        'for name in "$@"; do',
        '  if [ -f "$name" ]; then',
        '    echo "$name exists"',
        '  elif [ -d "$name" ]; then',
        '    echo "$name is a dir"',
        "  else",
        '    echo "$name missing"',
        "  fi",
        "  count=$((count + 1))",
        "done",
        'echo "checked $count"',
        "greet() { local who=$1; echo \"hello $who\"; }",
        "greet world",
        'case "$1" in',
        "  *.txt) echo text ;;",
        "  /*) echo absolute ;;",
        "  *) echo other ;;",
        "esac",
        "n=0",
        "while read -r line; do n=$((n+1)); done < /var/log/access.log",
        'echo "lines=$n"',
        "i=0; while [ $i -lt 3 ]; do i=$((i+1)); done; echo i=$i",
        "exit 3",
      ].join("\n") + "\n",
    );
    s.exec("chmod u+x check.sh");
    const r = s.exec("./check.sh notes.txt /tmp 'no such'");
    expect(r.stdout).toBe(
      "script: ./check.sh args: 3 first: notes.txt\nnotes.txt exists\n/tmp is a dir\nno such missing\nchecked 3\nhello world\ntext\nlines=6\ni=3\n",
    );
    expect(r.exitCode).toBe(3);
    expect(out(s, "echo $?")).toBe("3\n");
    // variables set inside the script do not leak
    expect(out(s, "echo [$count]")).toBe("[]\n");
    expect(out(s, "sh check.sh /etc/hostname | head -2")).toBe("script: check.sh args: 1 first: /etc/hostname\n/etc/hostname exists\n");
  });

  it("scripts: bad interpreter, CRLF shebang, unsupported interpreter", () => {
    const s = sim();
    s.writeFile("crlf.sh", "#!/bin/bash\r\necho hi\r\n");
    s.writeFile("py.sh", "#!/usr/bin/python3\nprint('x')\n");
    s.exec("chmod +x crlf.sh py.sh");
    expect(s.exec("./crlf.sh").stderr).toBe("bash: ./crlf.sh: /bin/bash\r: bad interpreter: No such file or directory\n");
    const r = s.exec("./py.sh");
    expect(r.unsupported).toBe(true);
  });

  it("caps runaway loops with an execution limit", () => {
    const s = sim();
    const r = s.exec("while true; do :; done");
    expect(r.stderr).toContain("script exceeded execution limit");
    expect(r.exitCode).toBe(124);
    s.writeFile("loop.sh", "#!/bin/bash\nwhile true; do echo spam; done\n");
    const r2 = s.exec("bash loop.sh");
    expect(r2.stderr).toContain("script exceeded execution limit");
    expect(r2.stdout.length).toBeLessThanOrEqual(MAX_STDOUT + 100);
    // the shell keeps working afterwards
    expect(out(s, "echo still alive")).toBe("still alive\n");
  });

  it("caps huge output", () => {
    const s = sim();
    const r = s.exec("seq 1 20000");
    expect(r.stdout.length).toBeLessThan(MAX_STDOUT + 100);
    expect(r.stdout).toContain("[output truncated");
  });

  it("is honest about unsupported commands and flags", () => {
    const s = sim();
    const r = s.exec("docker ps");
    expect(r).toEqual({ stdout: "", stderr: "docker: command not supported in this simulation (try 'help')\n", exitCode: 127, unsupported: true });
    const f = s.exec("ls -Z");
    expect(f.unsupported).toBe(true);
    expect(f.stderr).toContain("ls: option '-Z' is not supported in this simulation");
    expect(s.exec("tail -f /var/log/access.log").unsupported).toBe(true);
    expect(s.exec("vim notes.txt").unsupported).toBe(true);
    expect(s.exec("echo ok").unsupported).toBeUndefined();
    expect(out(s, "help")).toContain("Networking:");
    expect(out(s, "man chmod")).toContain("chmod [-R] MODE FILE");
    expect(s.exec("clear").clear).toBe(true);
  });

  it("tab completion for commands and paths", () => {
    const s = sim();
    expect(s.complete("sys")).toEqual(["systemctl"]);
    expect(s.complete("cat no")).toEqual(["notes.txt"]);
    expect(s.complete("ls /var/l")).toEqual(["/var/lib/", "/var/log/"]);
    expect(s.complete("cat /var/log/acc")).toEqual(["/var/log/access.log"]);
    expect(s.complete("ls | gr")).toEqual(["grep", "groupadd", "groups"]);
    expect(s.complete("cat /etc/app/")).toEqual([]); // not listable by dev
  });

  it("brace expansion and [[ =~ ]]", () => {
    const s = sim();
    expect(out(s, "echo {a,b}{1,2} x{1..3}")).toBe("a1 a2 b1 b2 x1 x2 x3\n");
    s.exec("mkdir -p p/{src,docs} && cp notes.txt{,.bak}");
    expect(out(s, "ls p | cat; ls notes* | cat")).toBe("docs\nsrc\nnotes.txt\nnotes.txt.bak\n");
    expect(out(s, "[[ 'v12' =~ ^v([0-9]+)$ ]] && echo match")).toBe("match\n");
  });

  it("syntax errors are reported like bash", () => {
    const s = sim();
    expect(s.exec("if true; then echo x").stderr).toBe("bash: syntax error: unexpected end of file\n");
    expect(s.exec("echo a |").exitCode).toBe(2);
    expect(s.exec("fi").stderr).toBe("bash: syntax error near unexpected token `fi'\n");
  });

  it("file utilities: ls flags, cp/mv/rm, find, ln, head/tail, sed -i", () => {
    const s = sim();
    s.exec("mkdir -p proj/src/lib && touch proj/src/main.c proj/src/lib/util.c proj/README");
    expect(out(s, "find proj -name '*.c' | sort")).toBe("proj/src/lib/util.c\nproj/src/main.c\n");
    expect(out(s, "find proj -type d")).toBe("proj\nproj/src\nproj/src/lib\n");
    expect(out(s, "ls -R proj")).toBe("proj:\nREADME  src\n\nproj/src:\nlib  main.c\n\nproj/src/lib:\nutil.c\n");
    s.exec("cp -r proj backup && mv backup/README backup/README.md && rm -r backup/src");
    expect(out(s, "ls backup")).toBe("README.md\n");
    expect(s.exec("rm backup").stderr).toBe("rm: cannot remove 'backup': Is a directory\n");
    s.exec("ln -s /var/log/access.log access");
    expect(out(s, "head -n 1 access | cut -d' ' -f1")).toBe("10.0.0.5\n");
    expect(out(s, "ls -l access")).toMatch(/^lrwxrwxrwx 1 dev dev 19 Mar  2 09:15 access -> \/var\/log\/access.log\n$/);
    expect(out(s, "tail -n 2 /var/log/access.log | head -1 | awk '{print $6}'")).toBe("/api\n");
    s.exec("printf 'a=1\\nb=2\\n' > cfg; sed -i 's/b=2/b=3/' cfg");
    expect(out(s, "cat cfg")).toBe("a=1\nb=3\n");
    expect(out(s, "sed '/a=/d' cfg")).toBe("b=3\n");
    expect(out(s, "ls -a ~ | head -3")).toBe(".\n..\naccess\n");
    expect(out(s, "ls -ld /tmp")).toMatch(/^drwxrwxrwt 2 root root 4096 /);
    expect(out(s, "du -sh /var/log/access.log")).toBe("4.0K\t/var/log/access.log\n");
  });
});
