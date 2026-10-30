import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const hook = resolve("claude/hooks/host-stop-guard");

function decide(command) {
  const out = spawnSync("python3", [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  assert.equal(out.status, 0, out.stderr);
  if (!out.stdout.trim()) return null;
  return JSON.parse(out.stdout).hookSpecificOutput;
}

function denied(command) {
  const decision = decide(command);
  assert.equal(decision?.permissionDecision, "deny", command);
  assert.match(decision.permissionDecisionReason, /runner-drain\.sh drain/);
  assert.match(decision.permissionDecisionReason, /drewstone\/tangle-devops/);
}

test("denies wsl --shutdown aimed at a Beelink and allows uptime", () => {
  denied("ssh beelink2 'wsl --shutdown'");
  assert.equal(decide("ssh beelink2 uptime"), null);
});

test("denies fleet-host stops and allows the scratch-distro drill", () => {
  for (const command of [
    "ssh beelink1 'wsl --terminate Ubuntu-24.04'",
    "ssh beelink1-wsl 'sudo reboot'",
    "ssh beelink2-wsl 'systemctl poweroff'",
    "ssh drew-gtr-pro 'systemctl halt'",
    "ssh drew-gtr-pro 'systemctl kexec'",
    "ssh beelink2 'init 0'",
    "ssh beelink2 'init 6'",
    "ssh desktop-18ir33v 'Restart-Computer'",
    "ssh beelink2 'Stop-Computer -Force'",
    "ssh beelink2 'Stop-Service WslService'",
    "ssh beelink2 'sc stop WslService'",
    "ssh beelink2 'shutdown /s /t 0'",
    "ssh beelink2 'shutdown.exe /r /t 30'",
    "ssh -o BatchMode=yes drew@100.127.22.51 wsl.exe --shutdown",
    "ssh beelink2 'bash -lc \"sudo reboot\"'",
    "ssh beelink2 'wsl -e reboot'",
  ]) denied(command);
  for (const command of [
    "ssh beelink2 'wsl --terminate Ubuntu-24.04-drill'",
    "ssh beelink2 'wsl -t Ubuntu-24.04-drill'",
    "ssh beelink2 'wsl.exe --terminate Ubuntu-24.04-drill'",
    "ssh otherhost sudo reboot",
    "echo 'wsl --shutdown on beelink2'",
    "ssh beelink2 uptime",
  ]) assert.equal(decide(command), null, command);
});

test("denies a local stop when this machine is a serving fleet host", () => {
  const local = /^(?:beelink[12]|beelink\d+-wsl|drew-gtr-pro|desktop-18ir33v)$/i.test(hostname().split(".")[0]);
  const decision = decide("sudo reboot");
  if (local) denied("sudo reboot");
  else assert.equal(decision, null);
  assert.equal(decide("echo reboot"), null);
});

test("fails open on input it cannot parse and ignores other tools", () => {
  const bad = spawnSync("python3", [hook], { input: "not json", encoding: "utf8" });
  assert.equal(bad.status, 0, bad.stderr);
  assert.equal(bad.stdout.trim(), "");
  const other = spawnSync("python3", [hook], {
    input: JSON.stringify({ tool_name: "Read", tool_input: { command: "ssh beelink2 reboot" } }),
    encoding: "utf8",
  });
  assert.equal(other.status, 0);
  assert.equal(other.stdout.trim(), "");
});

test("settings route Bash through the guard and Codex install trusts it", () => {
  const settings = JSON.parse(readFileSync(resolve("claude/settings.json"), "utf8"));
  const entry = settings.hooks.PreToolUse.find((matcher) => matcher.matcher === "Bash");
  assert.ok(entry.hooks.some((item) => item.command.endsWith("/hooks/host-stop-guard")));
  const install = readFileSync(resolve("claude/install.sh"), "utf8");
  assert.match(install, /host-stop-guard/);
});
