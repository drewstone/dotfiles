#!/usr/bin/env -S python3 -S
"""Emit the drew-default claude-code AgentProfile, every resource a GitHub ref pinned to one pushed commit."""
import argparse
import json
import subprocess
from pathlib import Path

REPOSITORY = "drewstone/dotfiles"
# Skills that need no Mac, fleet host or local CLI; each mounts with its sibling files.
SKILLS = ["be-ambitious", "codebase-design", "converge", "critical-audit", "diagnose", "evolve", "finalize",
          "ground-truth", "grilling", "harden", "hypothesize", "reflect", "simplify", "tdd", "verify", "writing-for-agents"]
HOOKS = ["secret_scan.py", "process_guard.py", "git-push-preflight.sh", "ci-wait-guard.sh", "poll-guard.sh", "scan-guard.sh"]
PERMISSIONS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"]

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--out", required=True, help="Output JSON path")
parser.add_argument("--ref", default="origin/main", help="Pushed dotfiles commit the resources pin to")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
git = lambda *argv: subprocess.run(["git", "-C", str(repo), *argv], check=True, capture_output=True, text=True).stdout
sha = git("rev-parse", f"{args.ref}^{{commit}}").strip()
show = lambda path: git("show", f"{sha}:claude/{path}").strip()
ref = lambda path, **extra: {"kind": "github", "repository": REPOSITORY, "path": f"claude/{path}", "ref": sha, **extra}

# CLAUDE.md pulls AGENTS.md and RTK.md in with @-lines; Claude Code expands them, a profile cannot.
claude = show("CLAUDE.md").splitlines()
included = [show(line[1:].strip()) for line in claude if line.startswith("@")]
instructions = [*included, "\n".join(line for line in claude if not line.startswith("@")).strip()]

files, skills = [], []
for skill in SKILLS:
    for path in git("ls-tree", "-r", "--name-only", sha, f"claude/skills/{skill}").split():
        rel = path.removeprefix("claude/")
        (skills.append(ref(rel, name=skill)) if rel.endswith(f"{skill}/SKILL.md")
         else files.append({"path": f".claude/{rel}", "resource": ref(rel)}))
files += [{"path": f".claude/hooks/{hook}", "resource": ref(f"hooks/{hook}"), "executable": True} for hook in HOOKS]

settings = json.loads(show("settings.json"))
hooks = {}
for event, group, hook in ((e, g, h) for e, gs in settings["hooks"].items() for g in gs for h in g["hooks"]):
    if (name := hook["command"].removeprefix("$HOME/.claude/hooks/")) in HOOKS:
        hooks.setdefault(event, []).append({"command": f"$CLAUDE_PROJECT_DIR/.claude/hooks/{name}", "matcher": group.get("matcher", "*"),
                                            **({"timeoutMs": hook["timeout"] * 1000} if "timeout" in hook else {})})

profile = {
    "name": "drew-default",
    "description": f"Drew's Claude Code defaults from {REPOSITORY}@{sha[:12]}.",
    "harness": "claude-code",
    "model": {"provider": "anthropic", "default": settings["model"], "reasoningEffort": settings["effortLevel"],
              "metadata": {"credentialSource": "subscription"}},
    "prompt": {"instructions": instructions},
    "permissions": {tool: "allow" for tool in PERMISSIONS},
    "resources": {"skills": skills, "files": files, "failOnError": True},
    "hooks": hooks,
}
Path(args.out).expanduser().write_text(json.dumps(profile, indent=2) + "\n")
