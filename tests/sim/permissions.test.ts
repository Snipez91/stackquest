import { describe, expect, it } from "vitest";
import { Simulation, evaluateAssertion } from "../../src/sim";
import { webScenario } from "./fixtures";

function sim() {
  return new Simulation(webScenario());
}

describe("permissions", () => {
  it("owner/group/other bits are honoured", () => {
    const s = sim();
    expect(s.exec("cat ~/secret.txt").stdout).toBe("s3cret\n");
    s.exec("sudo su - intern");
    expect(s.currentUser).toBe("intern");
    const r = s.exec("cat /home/dev/secret.txt");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe("cat: /home/dev/secret.txt: Permission denied\n");
    expect(s.exec("cat /home/dev/notes.txt").stdout).toBe("remember the milk\n");
  });

  it("requires x on every parent directory to reach a file", () => {
    const s = sim();
    // /etc/app is 0750 root:root, file is 0640: dev cannot traverse
    const r = s.exec("cat /etc/app/app.conf");
    expect(r.stderr).toContain("Permission denied");
    s.exec("sudo chmod o+r /etc/app/app.conf");
    expect(s.exec("cat /etc/app/app.conf").exitCode).toBe(1); // still blocked by the directory
    s.exec("sudo chmod o+x /etc/app");
    expect(s.exec("cat /etc/app/app.conf").stdout).toContain("listen=8080");
    // directory r without x: can list names but not open files
    s.exec("sudo chmod 0754 /etc/app");
    expect(s.exec("ls /etc/app").stdout).toContain("app.conf");
    expect(s.exec("cat /etc/app/app.conf").exitCode).toBe(1);
    expect(s.exec("cd /etc/app").stderr).toBe("bash: cd: /etc/app: Permission denied\n");
  });

  it("access assertion explains the failing directory", () => {
    const s = sim();
    const r = evaluateAssertion(s, { type: "access", path: "/etc/app/app.conf", user: "appsvc", access: "r", expect: true });
    expect(r.pass).toBe(false);
    expect(r.detail).toBe("web-01: /etc/app/app.conf is not readable by appsvc (directory /etc/app lacks o+x for appsvc)");
  });

  it("creating and deleting entries needs w+x on the parent; sticky /tmp protects others' files", () => {
    const s = sim();
    expect(s.exec("touch /etc/new.conf").stderr).toBe("touch: cannot touch '/etc/new.conf': Permission denied\n");
    expect(s.exec("rm /var/log/access.log").stderr).toBe("rm: cannot remove '/var/log/access.log': Permission denied\n");
    s.exec("touch /tmp/mine");
    s.exec("sudo su - intern");
    expect(s.exec("rm /tmp/mine").stderr).toBe("rm: cannot remove '/tmp/mine': Operation not permitted\n");
  });

  it("group membership grants access (shared dir for sudo group)", () => {
    const s = sim();
    expect(s.exec("cat /srv/shared/plan.md").stdout).toBe("plan\n");
    expect(s.exec("echo more >> /srv/shared/plan.md").exitCode).toBe(0);
    s.exec("sudo su - intern");
    expect(s.exec("ls /srv/shared").stderr).toContain("Permission denied");
  });

  it("new files get 0644 / dirs 0755 via umask 022, and umask can change", () => {
    const s = sim();
    s.exec("touch a.txt; mkdir d");
    const out = s.exec("ls -l").stdout;
    expect(out).toMatch(/-rw-r--r-- 1 dev dev\s+0 Mar  2 09:15 a\.txt/);
    expect(out).toMatch(/drwxr-xr-x 2 dev dev 4096 Mar  2 09:15 d/);
    s.exec("umask 077; touch private");
    expect(s.exec("stat -c '%a %U:%G' private").stdout).toBe("600 dev:dev\n");
  });

  it("chmod octal and symbolic, only by owner or root", () => {
    const s = sim();
    s.exec("touch f");
    s.exec("chmod 750 f");
    expect(s.exec("stat -c %A f").stdout).toBe("-rwxr-x---\n");
    s.exec("chmod u-x,g+w,o=r f");
    expect(s.exec("stat -c %a f").stdout).toBe("674\n");
    s.exec("chmod a+x f");
    expect(s.exec("stat -c %a f").stdout).toBe("775\n");
    expect(s.exec("chmod 777 /etc/hostname").stderr).toBe("chmod: changing permissions of '/etc/hostname': Operation not permitted\n");
  });

  it("chown is root-only; sudo chown changes owner and group", () => {
    const s = sim();
    s.exec("touch f");
    expect(s.exec("chown intern f").stderr).toBe("chown: changing ownership of 'f': Operation not permitted\n");
    expect(s.exec("sudo chown intern:sudo f").exitCode).toBe(0);
    expect(s.exec("stat -c '%U %G' f").stdout).toBe("intern sudo\n");
    expect(s.exec("sudo chown nobody f").stderr).toBe("chown: invalid user: 'nobody'\n");
    expect(evaluateAssertion(s, { type: "owner", path: "/home/dev/f", owner: "intern", group: "sudo" }).pass).toBe(true);
  });

  it("execute requires x even for scripts; root needs some x bit", () => {
    const s = sim();
    s.writeFile("hello.sh", "#!/bin/bash\necho hi\n");
    expect(s.exec("./hello.sh").stderr).toBe("bash: ./hello.sh: Permission denied\n");
    expect(s.exec("sudo ./hello.sh").exitCode).toBe(126);
    expect(s.exec("bash hello.sh").stdout).toBe("hi\n");
    s.exec("chmod +x hello.sh");
    expect(s.exec("./hello.sh").stdout).toBe("hi\n");
  });

  it("editor writes respect permissions", () => {
    const s = sim();
    expect(s.writeFile("/etc/hostname", "pwned\n")).toEqual({ ok: false, error: "/etc/hostname: Permission denied" });
    expect(s.writeFile("todo.txt", "x\n")).toEqual({ ok: true });
    expect(s.readFile("todo.txt")).toBe("x\n");
    expect(s.readFile("/etc/app/app.conf")).toBeNull();
  });

  it("sudo is refused for users outside sudo/wheel", () => {
    const s = sim();
    s.exec("sudo su - intern");
    const r = s.exec("sudo cat /etc/app/app.conf");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBe("intern is not in the sudoers file.  This incident will be reported.\n");
    expect(s.exec("exit").stdout).toBe("logout\n");
    expect(s.currentUser).toBe("dev");
  });

  it("usermod -aG grants group access", () => {
    const s = sim();
    s.exec("sudo usermod -aG sudo intern");
    expect(s.exec("id intern").stdout).toBe("uid=1002(intern) gid=1002(intern) groups=1002(intern),1003(sudo)\n");
    expect(evaluateAssertion(s, { type: "user_in_group", user: "intern", group: "sudo", expect: true }).pass).toBe(true);
    expect(evaluateAssertion(s, { type: "access", path: "/srv/shared/plan.md", user: "intern", access: "w", expect: true }).pass).toBe(true);
  });
});
