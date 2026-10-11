#!/usr/bin/env python3
"""PreToolUse guard: a session runs at most three live Opus agents at a time.

On 2026-10-10/11 one operator session had 19 Opus agents live at its peak and was over
SOUL's "at most three large agents at a time" for 425 of 726 live minutes (59%); the
written rule was loaded the whole time. This hook makes the cap bite at launch.

It counts the session's live agents: transcripts under <session>/subagents/ (workflow
agents included) written within the last CC_AGENT_LIVE_SECS seconds (default 240), each
classified by the last model it recorded. An Agent or Workflow call is denied when it
would add an Opus agent beyond CC_OPUS_AGENT_CAP (default 3), or any agent beyond
CC_AGENT_TOTAL_CAP (default 8). An Agent call with model sonnet or haiku adds no Opus
agent. A Workflow call adds CC_WORKFLOW_WEIGHT Opus agents (default 3): its script runs
several agents at once, and on 2026-10-11 a workflow counted as one let 5 Opus agents run
against the cap of 3. With the defaults a workflow starts only when no Opus agent is live.

The session-level override CC_ALLOW_AGENT_OVERCAP=1 (set for the session, not on a
command) allows the call and says so. Fail-open by contract: unparsable input, an
unknown payload or an unreadable directory exits 0 with no output.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

MODEL = re.compile(rb'"model":\s*"([^"]+)"')


def last_model(path: Path) -> str:
    """The last real model a transcript recorded, read from its tail first."""
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            for span in (262_144, size):
                f.seek(max(0, size - span))
                found = [m.decode() for m in MODEL.findall(f.read()) if m != b"<synthetic>"]
                if found:
                    return found[-1]
                if span >= size:
                    break
    except OSError:
        pass
    return ""


def live_agents(subagents: Path, live_secs: float, now: float):
    opus = other = 0
    for path in subagents.rglob("agent-*.jsonl"):
        try:
            if now - path.stat().st_mtime > live_secs:
                continue
        except OSError:
            continue
        model = last_model(path)
        if "opus" in model or model == "":
            opus += 1
        else:
            other += 1
    return opus, other


def main() -> None:
    try:
        d = json.loads(sys.stdin.read())
    except Exception:
        return
    tool = d.get("tool_name")
    if tool not in ("Agent", "Workflow"):
        return
    transcript = d.get("transcript_path") or ""
    if not transcript:
        return
    # A subagent's transcript is <session>/subagents/...; the main one is <session>.jsonl.
    tpath = Path(transcript)
    session_dir = tpath.parent.parent if tpath.parent.name == "subagents" else tpath.with_suffix("")
    subagents = session_dir / "subagents"
    if not subagents.is_dir():
        return

    tin = d.get("tool_input") or {}
    model = str(tin.get("model") or "").lower()
    adds_opus = tool == "Workflow" or model in ("", "opus", "fable") or "opus" in model

    env = os.environ
    opus_cap = int(env.get("CC_OPUS_AGENT_CAP", "3"))
    total_cap = int(env.get("CC_AGENT_TOTAL_CAP", "8"))
    live_secs = float(env.get("CC_AGENT_LIVE_SECS", "240"))
    adds = int(env.get("CC_WORKFLOW_WEIGHT", "3")) if tool == "Workflow" else 1
    opus, other = live_agents(subagents, live_secs, float(env.get("CC_AGENT_NOW", time.time())))

    over = []
    if adds_opus and opus + adds > opus_cap:
        over.append(f"{opus} Opus agents are live and the cap is {opus_cap}" + (f" (a Workflow counts as {adds})" if tool == "Workflow" else ""))
    if opus + other + adds > total_cap:
        over.append(f"{opus + other} agents are live and the total cap is {total_cap}")
    if not over:
        return

    why = "; ".join(over)
    if env.get("CC_ALLOW_AGENT_OVERCAP") == "1":
        print(json.dumps({"systemMessage": f"agent-cap-guard: allowed over the cap by CC_ALLOW_AGENT_OVERCAP ({why})."}))
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"agent-cap-guard: {why}. SOUL's spend rule: at most three large agents at a time "
            "(2026-10-11: peak 19, over the cap 59% of live minutes). Let a running agent finish, "
            "run small work with model: sonnet, or give the work to a Disco play."
        ),
    }}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
