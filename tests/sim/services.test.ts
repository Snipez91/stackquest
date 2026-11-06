import { describe, expect, it } from "vitest";
import { Simulation, evaluateAssertion } from "../../src/sim";
import { webScenario } from "./fixtures";

describe("services", () => {
  it("needs root to start", () => {
    const s = new Simulation(webScenario());
    const r = s.exec("systemctl start app");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Interactive authentication required");
  });

  it("fails with a specific journal line until permissions are fixed", () => {
    const s = new Simulation(webScenario());
    const r = s.exec("sudo systemctl start app");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('See "systemctl status app.service" and "journalctl -xeu app.service" for details.');
    expect(s.exec("systemctl is-active app").stdout).toBe("failed\n");
    const status = s.exec("systemctl status app");
    expect(status.exitCode).toBe(3);
    expect(status.stdout).toContain("× app.service - Demo application server");
    expect(status.stdout).toContain("Active: failed (Result: exit-code)");
    const log = s.exec("sudo journalctl -u app --no-pager").stdout;
    expect(log).toMatch(/web-01 app\[\d+\]: open\(\) "\/etc\/app\/app\.conf" failed \(13: Permission denied\)/);
    expect(evaluateAssertion(s, { type: "service_state", service: "app", state: "active" })).toEqual({
      pass: false,
      detail: 'web-01: app is failed (app[1000]: open() "/etc/app/app.conf" failed (13: Permission denied))',
    });

    // fix: let the app group read the config through the directory
    s.exec("sudo chgrp appsvc /etc/app /etc/app/app.conf");
    s.exec("sudo chmod 750 /etc/app && sudo chmod 640 /etc/app/app.conf");
    const r2 = s.exec("sudo systemctl start app");
    // still fails: log dir not writable
    expect(r2.exitCode).toBe(1);
    expect(s.exec("sudo journalctl -u app -n 5").stdout).toContain('open() "/var/log/app" failed (13: Permission denied)');
    s.exec("sudo chown appsvc /var/log/app");
    expect(s.exec("sudo systemctl restart app").exitCode).toBe(0);
    expect(s.exec("systemctl is-active app").stdout).toBe("active\n");
    expect(evaluateAssertion(s, { type: "service_state", service: "app", state: "active" }).pass).toBe(true);
    expect(s.exec("ps aux | grep -c '[/]usr/bin/app'").stdout).toBe("1\n");
    expect(s.exec("sudo ss -tlnp | grep 8080").stdout).toMatch(/users:\(\("app",pid=\d+/);
    expect(s.exec("curl -s http://localhost:8080/health").stdout).toBe("healthy\n");
    expect(evaluateAssertion(s, { type: "http_status", from: "web-01", url: "http://127.0.0.1:8080/nope", status: 404 }).pass).toBe(true);
    expect(evaluateAssertion(s, { type: "process_running", pattern: "/usr/bin/app", expect: true }).pass).toBe(true);
  });

  it("config checks report the scenario's error string", () => {
    const s = new Simulation(webScenario());
    s.exec("sudo chmod -R o+rX /etc/app; sudo chmod 777 /var/log/app");
    s.exec("sudo sed -i 's/listen=8080/listen=eighty/' /etc/app/app.conf");
    expect(s.exec("sudo systemctl start app").exitCode).toBe(1);
    expect(s.exec("sudo journalctl -u app -n 4").stdout).toContain("app[");
    expect(s.exec("sudo journalctl -u app").stdout).toContain("config error: 'listen' must be a port number");
    s.exec("echo 'listen=8080' | sudo tee /etc/app/app.conf");
    expect(s.exec("sudo systemctl start app").exitCode).toBe(0);
  });

  it("port conflicts, enable/disable, stop, kill", () => {
    const sc = webScenario();
    sc.hosts[0].processes = [{ pid: 4321, user: "dev", command: "python3 -m http.server 8080", listens: [{ port: 8080, proto: "tcp" }] }];
    const s = new Simulation(sc);
    s.exec("sudo chmod -R o+rX /etc/app; sudo chmod 777 /var/log/app");
    expect(s.exec("sudo systemctl start app").exitCode).toBe(1);
    expect(s.exec("sudo journalctl -u app").stdout).toContain("bind() to 0.0.0.0:8080 failed (98: Address already in use)");
    expect(s.exec("pgrep -f http.server").stdout).toBe("4321\n");
    expect(s.exec("kill 4321").exitCode).toBe(0);
    expect(s.exec("sudo systemctl enable --now app").stderr).toContain("Created symlink");
    expect(evaluateAssertion(s, { type: "service_enabled", service: "app", enabled: true }).pass).toBe(true);
    const pid = s.exec("systemctl status app | grep 'Main PID' | awk '{print $3}'").stdout.trim();
    expect(s.exec(`kill ${pid}`).stderr).toBe(`bash: kill: (${pid}) - Operation not permitted\n`);
    expect(s.exec(`sudo kill -9 ${pid}`).exitCode).toBe(0);
    expect(s.exec("systemctl is-active app").stdout).toBe("failed\n");
    s.exec("sudo systemctl start app && sudo systemctl stop app");
    expect(s.exec("systemctl is-active app").stdout).toBe("inactive\n");
    expect(s.exec("systemctl list-units --type=service --all").stdout).toContain("app.service");
    expect(s.exec("sudo systemctl start nope").stderr).toBe("Failed to start nope.service: Unit nope.service not found.\n");
  });

  it("journalctl needs privileges", () => {
    const s = new Simulation(webScenario());
    expect(s.exec("journalctl -u app").stdout).toContain("You are currently not seeing messages");
  });
});
