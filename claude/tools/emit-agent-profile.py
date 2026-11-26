#!/usr/bin/env -S python3 -S
"""Emit the default claude-code AgentProfile, every resource a GitHub ref pinned to one pushed commit.

Its name is PROFILE_NAME in the private layer's claude/config/emit-agent-profile.env, default dotfiles-default.
A version promoted in the local learned store keeps its mounted skills on each new base (see learned_version)."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPOSITORY = "drewstone/dotfiles"
CONFIG = Path(os.environ.get("DOTFILES_PRIVATE") or Path.home() / ".local/share/dotfiles-private") / "claude/config/emit-agent-profile.env"
NAME = next((line[13:].strip().strip("'\"") for line in (CONFIG.read_text().splitlines() if CONFIG.is_file() else [])
             if line.startswith("PROFILE_NAME=")), "dotfiles-default")
# Skills that need no Mac, fleet host or local CLI; each mounts with its sibling files.
SKILLS = ["be-ambitious", "codebase-design", "converge", "critical-audit", "diagnose", "evolve", "finalize",
          "harden", "reflect", "simplify", "tdd", "verify", "writing-for-agents"]
HOOKS = ["secret_scan.py", "process_guard.py"]  # wired as settings.json wires them; process_guard's rule modules mount beside it
PERMISSIONS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"]

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--out", required=True, help="Output JSON path")
parser.add_argument("--ref", default="origin/main", help="Pushed dotfiles commit the resources pin to")
parser.add_argument("--learned", help="Learned store whose promoted version to carry; default ~/.config/agent-profiles/learned/<name>")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
git = lambda *argv: subprocess.run(["git", "-C", str(repo), *argv], check=True, capture_output=True, text=True).stdout
sha = git("rev-parse", f"{args.ref}^{{commit}}").strip()
show = lambda path: git("show", f"{sha}:claude/{path}").strip()
ref = lambda path, **extra: {"kind": "github", "repository": REPOSITORY, "path": f"claude/{path}", "ref": sha, **extra}

# CLAUDE.md pulls AGENTS.md and RTK.md in with @-lines; Claude Code expands them, a profile cannot. An @~/ line is the host's private overlay.
claude = show("CLAUDE.md").splitlines()
included = [show(line[1:].strip()) for line in claude if line.startswith("@") and not line.startswith("@~/")]
instructions = [*included, "\n".join(line for line in claude if not line.startswith("@")).strip()]

files, skills = [], []
for skill in SKILLS:
    for path in git("ls-tree", "-r", "--name-only", sha, f"claude/skills/{skill}").split():
        rel = path.removeprefix("claude/")
        (skills.append(ref(rel, name=skill)) if rel.endswith(f"{skill}/SKILL.md")
         else files.append({"path": f".claude/{rel}", "resource": ref(rel)}))
files += [{"path": f".claude/{rel}", "resource": ref(rel), "executable": True} for rel in (path.removeprefix("claude/") for path in
          git("ls-tree", "--name-only", sha, "claude/hooks/").split()) if rel[6:] in HOOKS or rel.startswith("hooks/process_guard_")]

settings = json.loads(show("settings.json"))
hooks = {}
for event, group, hook in ((e, g, h) for e, gs in settings["hooks"].items() for g in gs for h in g["hooks"]):
    if (name := hook["command"].removeprefix("$HOME/.claude/hooks/")) in HOOKS:
        hooks.setdefault(event, []).append({"command": f"$CLAUDE_PROJECT_DIR/.claude/hooks/{name}", "matcher": group.get("matcher", "*"),
                                            **({"timeoutMs": hook["timeout"] * 1000} if "timeout" in hook else {})})

profile = {
    "name": NAME,
    "description": f"Claude Code defaults from {REPOSITORY}@{sha[:12]}.",
    "harness": "claude-code",
    "model": {"provider": "anthropic", "default": settings["model"], "reasoningEffort": settings["effortLevel"],
              "metadata": {"credentialSource": "subscription"}},
    "prompt": {"instructions": instructions},
    "permissions": {tool: "allow" for tool in PERMISSIONS},
    "resources": {"skills": skills, "files": files, "failOnError": True},
    "hooks": hooks,
}


def learned_version(store):
    """The version on top of the store's history and its mounted skills, or None.

    versions.jsonl is append-only: a `promoted` record names its profile file and version, and a
    `rolled back` record undoes the promotion before it. A promoted profile's mounted skills are its
    inline skills with a record in extensions[<name>].resourceProvenance; each must still hash to it.
    """
    history = store / "versions.jsonl"
    stack = []
    for line in history.read_text().splitlines() if history.is_file() else []:
        record = json.loads(line) if line.strip() else {}
        if record.get("action") == "promoted":
            stack.append(record)
        elif record.get("action") == "rolled back" and stack:
            stack.pop()
    if not stack:
        return None
    top = stack[-1]
    learned = json.loads(Path(top["profile"]).read_text())
    inline = {skill.get("name"): skill for skill in learned.get("resources", {}).get("skills", []) if skill.get("kind") == "inline"}
    mounted = []
    for record in learned.get("extensions", {}).get(NAME, {}).get("resourceProvenance", []):
        skill = inline.get(record.get("name"))
        if skill is None or hashlib.sha256(skill["content"].encode()).hexdigest() != record.get("sha256"):
            raise ValueError(f"{top['profile']}: inline skill {record.get('name')} does not hash to its provenance record")
        mounted.append((skill, record))
    return top["version"], mounted


store = Path(args.learned).expanduser() if args.learned else Path.home() / ".config/agent-profiles/learned" / NAME
try:
    learned = learned_version(store)
except (OSError, ValueError, KeyError) as error:
    # The base is always safe to emit; a damaged learned store must not stop an install.
    print(f"emit-agent-profile: emitting the base without the learned version: {error}", file=sys.stderr)
    learned = None
if learned is not None:
    version, mounted = learned
    names = {skill.get("name") for skill in skills}
    carried = [(skill, record) for skill, record in mounted if skill["name"] not in names]
    for skill, _ in mounted:
        if skill["name"] in names:
            print(f"emit-agent-profile: {version} skill {skill['name']} is now in the base; the base copy is kept", file=sys.stderr)
    profile["version"] = version
    profile["resources"]["skills"] += [skill for skill, _ in carried]
    if carried:
        profile["extensions"] = {NAME: {"resourceProvenance": [record for _, record in carried]}}

Path(args.out).expanduser().write_text(json.dumps(profile, indent=2) + "\n")
