// OpenCode adapter for the Claude PreToolUse guard: it pipes each bash call to process_guard.py
// in Claude's payload shape and refuses the call on a deny. Every rule stays in process_guard.py.
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

const GUARD = join(homedir(), ".claude/hooks/process_guard.py")

export default async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== "bash") return
    const payload = { tool_name: "Bash", tool_input: { command: output.args.command }, cwd: output.args.workdir ?? directory }
    const run = spawnSync("python3", [GUARD], { input: JSON.stringify(payload), encoding: "utf8" })
    const decision = JSON.parse(run.stdout || "{}").hookSpecificOutput
    if (decision?.permissionDecision === "deny") throw new Error(decision.permissionDecisionReason)
  },
})
