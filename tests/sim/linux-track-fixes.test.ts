import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/sim";
import { webScenario } from "./fixtures";

/** Regression tests for simulator fixes made while writing the Linux track. */
describe("linux track sim fixes", () => {
  it("cp -r DIR/. EXISTING/ copies the contents into EXISTING itself (GNU behaviour)", () => {
    const s = new Simulation(webScenario());
    s.exec("mkdir -p ~/build/static ~/rel/static && touch ~/build/static/index.html");
    expect(s.exec("cp -r ~/build/static/. ~/rel/static/").exitCode).toBe(0);
    expect(s.exec("find ~/rel").stdout).toBe("/home/dev/rel\n/home/dev/rel/static\n/home/dev/rel/static/index.html\n");
    // without the trailing /. an existing destination still receives a nested copy
    s.exec("cp -r ~/build/static ~/rel/static");
    expect(s.exec("ls ~/rel/static").stdout).toContain("static");
  });

  it("new entries in a setgid directory inherit its group, and subdirectories inherit the bit", () => {
    const s = new Simulation(webScenario());
    s.exec("sudo mkdir /srv/team && sudo chgrp sudo /srv/team && sudo chmod 2775 /srv/team");
    s.exec("touch /srv/team/a && mkdir /srv/team/sub && touch /srv/team/sub/b");
    expect(s.exec("stat -c '%A %G %n' /srv/team/a /srv/team/sub /srv/team/sub/b").stdout).toBe(
      "-rw-r--r-- sudo /srv/team/a\ndrwxr-sr-x sudo /srv/team/sub\n-rw-r--r-- sudo /srv/team/sub/b\n",
    );
    // a normal directory still uses the creator's primary group
    expect(s.exec("touch /tmp/c && stat -c '%G' /tmp/c").stdout).toBe("dev\n");
  });

  it("pkill -u USER works without a pattern", () => {
    const sc = webScenario();
    sc.hosts[0].processes = [
      { pid: 4001, user: "intern", command: "sleep 1000" },
      { pid: 4002, user: "intern", command: "python3 scratch.py" },
      { pid: 4003, user: "dev", command: "python3 keep.py" },
    ];
    const s = new Simulation(sc);
    expect(s.exec("sudo pkill -u intern").exitCode).toBe(0);
    expect(s.exec("pgrep -a python3").stdout).toBe("4003 python3 keep.py\n");
  });
});
