---
name: reflect-last
description: Meta-analyze the session that just ended — run the trace analyzer on your own run to surface the pattern you can't see from inside it, then name the one systemic fix.
---

You just finished (or paused) a substantial piece of work. Turn the trace analyzer on YOURSELF to catch what's invisible from inside the session — churn, a fake baseline carried for hours, status-without-a-moved-number, a lever you shaved because it was easy instead of the one that dominated.

Run it, read it, act on it — don't just print the findings:

1. **Analyze this session's trace:**
   ```bash
   # Homebrew ships an unrelated `traces` viewer (v0.4.x, no `analyze`), and the zsh
   # node/npm functions loop on _nvm_load — probe for `analyze` and bypass both.
   unset -f node npm npx nvm 2>/dev/null
   export PATH=/Users/drew/.nvm/versions/node/v24.11.1/bin:$PATH
   if traces analyze --help >/dev/null 2>&1; then
     traces analyze --harness claude-code --last 1
   else
     npx --yes @tangle-network/traces@latest analyze --harness claude-code --last 1
   fi
   ```
   (Reads the Claude Code transcript on disk — zero instrumentation, no API cost for the deterministic pass. For a persistent install, run `curl -fsSL https://raw.githubusercontent.com/tangle-network/traces/main/install.sh | bash`. If Node/npm/network are unavailable, fall back to the repo's failure-mode analyst, or grep the session JSONL under `~/.claude/projects/*/` for tool-retry and re-measure loops.)

2. **Read the signal that matters, not the whole dump:** the corrective-to-positive ratio and its trigger pairs (what prose of yours drew a correction — usually status-without-a-number), stuck/duplicate loops, monotonic token growth, and any HIGH efficiency finding.

3. **Name the ONE systemic pattern**, not a list of symptoms — the root behavior that produced the corrections (e.g. "acted before the real path was measured", "reported a narrower-context number as production-true", "polled on a decision only the user could make"). Tie it to a concrete moment in the run.

4. **Decide the durable fix and DO it:** if the pattern is worth preventing forever, propose (and, when it's a dotfiles/AGENTS.md/skill change, write) the rule or tool that makes it automatic — then it's a doctrine, not a hope. If it's project-specific, write it to that project's memory / CLAUDE.md. A reflection that ends in a bullet list changes nothing; one that ends in a committed guardrail changes the next 100 sessions. When the fix is code in a repo you can reach, build it and open the PR in THIS session — an owner line saying "next PR" is the same deferred action the repeat-check keeps re-raising (the traces retry marker took 4 raises before a session finally built it).

Be blunt and specific — you're auditing yourself for the CEO, not writing a retrospective. One systemic finding, tied to evidence, ending in a shipped fix or a sharp recommendation.
