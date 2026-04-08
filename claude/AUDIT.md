# Skills + Infra Audit — 2026-04-08

Critical audit of `~/dotfiles/claude/` covering 19 skills, install.sh, settings.json, hooks, and the live `~/.claude/` drift. Methodology: 3 parallel reviewers (overlap, slop/bloat, infra) plus manual verification of every claim.

Each proposed change has **pros**, **cons**, and a **status**. Use this as a decision log when revisiting.

---

## 1. Shipped (CRITICAL + HIGH)

These were applied without further review on 2026-04-08.

### 1.1 Frontmatter for `handoff/SKILL.md` — DONE

`handoff` had no YAML frontmatter, so Claude Code's description-based loader could not trigger it. It also wasn't symlinked into `~/.claude/skills/` because `install.sh` hadn't been re-run since the directory was added.

- **Pros**: Skill becomes discoverable via "wrap up", "hand off" triggers. Zero behavioral risk — frontmatter is metadata only.
- **Cons**: None. Pure additive fix.

### 1.2 Frontmatter for `bad/SKILL.md` — DONE

`bad` was loading via H1-fallback (the description shown to Claude was the literal first line `# bad — Browser Agent Driver CLI Skill`). Functional but degraded — the loader couldn't see trigger phrases.

- **Pros**: Better trigger matching ("design audit", "webbench", "browser benchmark"). No content change to the 505-line body.
- **Cons**: None.

### 1.3 Move `rtk-rewrite.sh` into dotfiles — DONE

The hook lived only at `~/.claude/hooks/rtk-rewrite.sh` — untracked, would be lost on a fresh machine. Now in `dotfiles/claude/hooks/rtk-rewrite.sh`, symlinked back.

- **Pros**: Reproducible across machines. install.sh now picks it up automatically. The `.sha256` companion file was left in place (looks like state, not config).
- **Cons**: If the file was deliberately untracked for security reasons (it's not — it's a generic command rewriter), this would expose it. Reviewed — no secrets, safe.

### 1.4 Move `RTK.md` into dotfiles — DONE

CLAUDE.md references `@RTK.md` but the file lived only at `~/.claude/RTK.md`, untracked. install.sh now symlinks it explicitly (line 38 — `[ -f "$SCRIPT_DIR/RTK.md" ] && link ...`).

- **Pros**: The `@RTK.md` reference in CLAUDE.md will resolve on a fresh machine.
- **Cons**: One more file to maintain. RTK is a Drew-specific tool, so this couples the dotfiles repo to it — but that's the right coupling (CLAUDE.md already references it).

### 1.5 Reconcile `~/.claude/settings.json` from real file → symlink — DONE

`~/.claude/settings.json` was a **real file**, not a symlink, drifting from dotfiles. The live version had a `PreToolUse` rtk hook + `effortLevel: high` that dotfiles was missing. Both were missing the codex plugin.

Merged content into `dotfiles/claude/settings.json` and replaced the live file with a symlink. The dotfiles version uses the portable `~/.claude/hooks/rtk-rewrite.sh` path instead of the absolute `/Users/drew/.claude/...` path the live file had.

- **Pros**: Honors the user's own CLAUDE.md rule ("Never edit `~/.claude/settings.json` directly"). Future edits flow through dotfiles correctly. Portable across users.
- **Cons**: If something or someone (an installer, an IDE, Claude Code itself) overwrites `~/.claude/settings.json` with a real file again, the drift returns silently. **Mitigation**: install.sh prints LINK every time, so subsequent runs would catch it, but only if you re-run. Worth a periodic `ls -la ~/.claude/settings.json` check.

### 1.6 Rewrite `skills/README.md` — DONE

The README claimed 18 skills, listed **8 phantoms** (`improve`, `init-context`, `work-status`, `ai-conversation-extractor`, `layered-summary`, `repomix-analysis`, `session-stripper`, `tangle-branded-designer`) and **omitted 7 real ones** (`capture-decisions`, `converge`, `handoff`, `pursue`, `reflect`, `signal-distill`, `writing-profile`). Replaced the manual inventory with a pointer to `ls skills/` + `SKILL.md` frontmatter as the source of truth.

- **Pros**: No more drift. Frontmatter is now the single canonical description.
- **Cons**: Loses the topic-grouping (Workflow / Analysis / Security / etc.) the old README had. If you wanted a curated landing page with categories, you now have to maintain it elsewhere — and it'll drift again.

### 1.7 Sync `PI_SKILLS` array — DONE

CLAUDE.md said `(reflect, capture-decisions, research)` but `install.sh:102` had `PI_SKILLS=(reflect)`. Updated install.sh to match the doc.

- **Pros**: Doc and code agree. Pi will sync the full set on next run (if `~/.pi/agent` exists; on this machine it doesn't, so no-op locally).
- **Cons**: `capture-decisions` and `research` will now be installed into Pi when you run install.sh on a Pi machine. If they're heavy or coding-specific, that may be wrong. **Verify**: read both skills before next Pi sync. The CLAUDE.md note says "only skills that work in conversation, not coding-specific ones" — so the burden is on those two skills to fit that description.

### 1.8 Add codex-plugin-cc — DONE

Added marketplace `openai-codex` (source: `github:openai/codex-plugin-cc`) and enabled `codex@openai-codex` in both files.

- **Pros**: `/codex:review`, `/codex:adversarial-review`, `/codex:rescue` available next session. Wraps your existing local Codex install — no new runtime.
- **Cons**: Counts against your Codex/ChatGPT quota. Adds a slash-command surface that overlaps with `code-review` and `critical-audit` (they'll need disambiguation in your head — Codex is "second opinion from a different model"; the local skills are "Claude reviewing itself in parallel"). Requires Node 18.18+ and either ChatGPT subscription or `OPENAI_API_KEY`.

---

## 2. Pending (MEDIUM)

These were flagged but not applied. Each has a real cost and a real benefit — your call.

### 2.1 `converge/SKILL.md:22` — progress file path

Currently writes `converge-progress.md` to project root. This pollutes every repo it touches with a file you have to gitignore.

- **Pros of fix (move to `.evolve/converge-progress.md`)**: No root pollution. Co-located with other evolve state. One less gitignore line per repo.
- **Cons of fix**: Breaks resume for any in-flight converge sessions (they'll look in the old path and not find it). Mitigation: have the resume protocol check both old and new paths for one transition period.
- **Recommendation**: Fix it. Make resume check both paths until you're confident no old progress files exist.

### 2.2 `bad/SKILL.md` — 505 lines is too long

The skill is half CLI cheatsheet, half auth-strategy decision trees. Most of it isn't read mid-flow. The reviewer also flagged `gpt-5.4` as the default model — that's not a real model name (GPT-5.1 exists, not 5.4). Worth checking.

- **Pros of trim (→ ~150 lines)**: Faster context load. Easier to find the actual command syntax. Forces a clean separation between "command reference" (in SKILL.md) and "playbooks" (in `references/`).
- **Cons of trim**: You lose the auth-strategy decision trees that may have been hard-won. Risk that the trim removes something you actually consult. Trimming is high-touch and easy to do wrong.
- **Recommendation**: Don't trim aggressively. Instead: (a) verify and fix `gpt-5.4`, (b) move auth strategy and any "how to think about this" sections into `bad/references/auth.md`, leaving SKILL.md as command reference. Net result is similar size but cleaner separation.

### 2.3 `evolve/SKILL.md` — 458 lines, 9 phases

Heavy stats theater (Benjamini-Hochberg FDR, ROI ranking framework, stratified verdict). Hardcodes `phony` as an example project.

- **Pros of trim (→ ~120 lines)**: Less context loaded every time evolve runs. Less chance the model gets lost in phase numbering.
- **Cons of trim**: This is your most-used improvement loop and you've put work into the statistical rigor. Trimming the FDR/ROI sections may regress the verdict quality on close experiments.
- **Recommendation**: **Don't trim**. The stats sections are load-bearing for verdict quality. Instead: (a) move stat methodology into `evolve/references/statistics.md` and reference it from the main SKILL.md; (b) replace the hardcoded `phony` example with a generic placeholder. This drops ~80 lines of SKILL.md without losing rigor.

### 2.4 `pursue/SKILL.md` — 290 lines

Aspirational language ("generational leaps", "pursue ships generations, evolve fine-tunes within them"). The reviewer flagged this as marketing copy.

- **Pros of trim**: Less performative language. Faster to read.
- **Cons of trim**: The "generational vs incremental" framing is the whole point — that's how you've decided pursue differs from evolve. Trimming the framing erases the distinction you're trying to keep.
- **Recommendation**: **Don't trim the framing.** It's the load-bearing part. If anything, sharpen the "When to use pursue vs evolve" section so the trigger collision in the descriptions becomes a clear handoff in practice.

### 2.5 `reflect/SKILL.md` — references infrastructure that may not exist

Reviewer claimed it references `Foreman`, `portfolio_status`, `dispatch_skill`, `POST /api/taste`. I haven't verified these. If they don't exist in this environment, the skill is silently broken when invoked.

- **Pros of audit + cleanup**: Skill actually works when run.
- **Cons**: If `Foreman` etc. exist on a machine other than this one (e.g., on a Pi or a different setup), removing them breaks the other environment.
- **Recommendation**: **Verify before touching**. Read `reflect/SKILL.md` end-to-end, grep for those tokens, and check whether they're actually invoked or just mentioned as background context. If they're invoked, decide whether to gate them behind an existence check or remove them.

---

## 3. Pending (LOW)

### 3.1 `commands/doc-sync.agent.md` — non-standard extension

Slash commands in Claude Code are `.md`. The `.agent.md` extension is unusual. May or may not be loaded as a slash command — depends on the loader.

- **Pros of rename (`doc-sync.md`)**: Standard extension, guaranteed to load as a slash command.
- **Cons of rename**: If `.agent.md` is intentional (e.g., it's actually an agent definition, not a slash command), renaming breaks it. The "agent" suffix suggests this is meta — possibly a sub-agent definition that's in the wrong directory.
- **Recommendation**: **Investigate first**. Read the file. If it's a slash command body, rename. If it's an agent definition, move to `agents/` (which doesn't exist yet — you'd create it). Don't just rename blindly.

### 3.2 `tools/` directory — undocumented in CLAUDE.md

`install.sh:69` symlinks `tools/*` into `~/bin/`, but the CLAUDE.md "Dotfiles" section doesn't mention this.

- **Pros of doc fix**: Future-you (and other agents) know `tools/` exists and that it goes to `~/bin/`.
- **Cons**: Trivial doc bloat in CLAUDE.md (which is loaded into every session).
- **Recommendation**: Add one line to the Dotfiles section of CLAUDE.md: `**Tools**: scripts in ~/dotfiles/claude/tools/ are symlinked into ~/bin/`. ~80 character cost, real benefit.

---

## 4. Rejected (consolidation)

The audit's biggest single proposal was collapsing the optimization cluster (`evolve` + `pursue` + `polish` + `research`) into one skill with `--mode` flags, and similar for `code-review` + `critical-audit` + `verify`. **Drew rejected this.**

### Why the auditor proposed it
- Trigger collisions: `evolve` and `polish` both claim "make this better"; `evolve` and `pursue` both claim "relentlessly optimize"; `pursue/SKILL.md` literally says it's "the orchestrator above /evolve".
- 19 skills is a lot. Claude struggles to disambiguate close descriptions.
- ~5 skills, 1 underlying job pattern.

### Why Drew rejected it
- The skills *are* slightly different: evolve = measure-driven, pursue = generational/architectural, polish = quality rubric, research = hypothesis-driven, converge = CI-specifically. Each has a deliberate niche.
- Collapsing them into a single skill with mode flags loses the at-a-glance distinction. Mode flags become the new trigger collision.
- The right fix is **disambiguation**, not consolidation.

### Alternative: disambiguation language inside each skill
For each of `evolve`, `pursue`, `polish`, `research`, `converge`, add a top-of-file "When to use this vs the others" section:

> Use `evolve` when the goal is measurable and you can run a local eval in <60s. Use `pursue` when evolve has plateaued and you need a generational/architectural leap. Use `polish` when correctness is fine and the gap is rubric-driven (quality, design, edge cases). Use `research` when the question is "which approach works" and the answer requires structured experiments. Use `converge` when the loop is remote (CI green).

- **Pros**: Preserves all 5 skills. Forces each to declare its niche explicitly. Improves trigger disambiguation without removing surface area. Reversible.
- **Cons**: Five copies of nearly the same disambiguation block (drift risk). Adds ~10 lines to each skill. Doesn't actually fix the trigger overlap in the description fields — Claude reads the description first and may still pick the wrong one.
- **Recommendation**: Worth doing if you find yourself getting the wrong skill triggered. Skip if the current routing already feels right.

Saved as memory: `feedback_skill_distinctions.md` — future audits won't propose consolidation.

---

## 5. False positives flagged by reviewers (for the record)

These were claimed by parallel reviewers but turned out to be wrong on verification. Documenting so the audit's credibility is calibrated.

### 5.1 "Wallet seed phrase in `bad/SKILL.md`" — FALSE
`bad/SKILL.md:207` contains the address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. The reviewer flagged this as a leaked credential. It's actually the well-known Anvil/Hardhat default test address (account[0] from the standard test mnemonic). It's in every Foundry/Hardhat tutorial. Public, not sensitive. **No action needed.**

### 5.2 "`doc-sync.agent.md` is duplicated in commands/ AND hooks/" — FALSE
Reviewer claimed install.sh symlinks the same file to both. Actual state: `dotfiles/claude/commands/` contains `doc-sync.agent.md`; `dotfiles/claude/hooks/` contains only `notify_done.sh`. No duplication. **No action needed.**

### 5.3 "`handoff` was symlinked but `install.sh` filtered it" — FALSE
Reviewer claimed install.sh has a filter that excluded handoff. Actually install.sh just hadn't been re-run since handoff was added. After re-running, it was symlinked normally. **Resolved by re-running install.sh.**

---

## 6. Summary table

| ID | Severity | Change | Status |
|---|---|---|---|
| 1.1 | CRITICAL | handoff frontmatter | DONE |
| 1.2 | CRITICAL | bad frontmatter | DONE |
| 1.3 | CRITICAL | rtk-rewrite.sh into dotfiles | DONE |
| 1.4 | CRITICAL | RTK.md into dotfiles | DONE |
| 1.5 | CRITICAL | settings.json drift reconciled | DONE |
| 1.6 | HIGH | README.md rewritten | DONE |
| 1.7 | HIGH | PI_SKILLS array synced | DONE |
| 1.8 | — | codex-plugin-cc added | DONE |
| 2.1 | MEDIUM | converge progress file path | PENDING — recommended |
| 2.2 | MEDIUM | bad/SKILL.md trim + verify gpt-5.4 | PENDING — partial recommended |
| 2.3 | MEDIUM | evolve/SKILL.md trim | PENDING — don't trim, move to references/ |
| 2.4 | MEDIUM | pursue/SKILL.md trim | PENDING — don't trim |
| 2.5 | MEDIUM | reflect/SKILL.md verify infra refs | PENDING — verify first |
| 3.1 | LOW | doc-sync.agent.md extension | PENDING — investigate first |
| 3.2 | LOW | document tools/ in CLAUDE.md | PENDING — quick fix |
| 4 | — | optimization cluster consolidation | REJECTED — saved as memory |
