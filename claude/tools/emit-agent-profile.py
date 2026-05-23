#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Emit an AgentProfile JSON from Claude dotfiles.")
    parser.add_argument("--source", required=True, help="Path to dotfiles/claude source directory")
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument("--name", required=True, help="Profile name")
    parser.add_argument("--description", default="", help="Profile description")
    parser.add_argument("--skills", default="", help="Comma-separated skill names. Empty means all skills in source.")
    parser.add_argument("--include-prompt", action="store_true", help="Include CLAUDE.md as prompt.systemPrompt")
    parser.add_argument("--permission", action="append", default=[], help="Permission entry like Bash=allow")
    return parser.parse_args()


def main():
    args = parse_args()
    source = Path(args.source).expanduser().resolve()
    out = Path(args.out).expanduser().resolve()
    skills_dir = source / "skills"
    if args.skills.strip():
        skills = [skill.strip() for skill in args.skills.split(",") if skill.strip()]
    else:
        skills = sorted(
            entry.name
            for entry in skills_dir.iterdir()
            if entry.is_dir() and (entry / "SKILL.md").exists()
        ) if skills_dir.exists() else []

    permissions = {}
    for item in args.permission:
        if "=" not in item:
            raise SystemExit(f"invalid --permission {item!r}; expected KEY=VALUE")
        key, value = item.split("=", 1)
        permissions[key] = value

    profile = {
        "name": args.name,
        "description": args.description,
        "skills": skills,
    }
    if permissions:
        profile["permissions"] = permissions
    if args.include_prompt:
        prompt_path = source / "CLAUDE.md"
        if prompt_path.exists():
            profile["prompt"] = {"systemPrompt": prompt_path.read_text().strip()}

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(profile, indent=2) + "\n")


if __name__ == "__main__":
    main()
