#!/usr/bin/env python3
"""PreToolUse guard on the session's live agents.

Live agents are transcripts under <session>/subagents/ (workflow agents included) written in the
last CC_AGENT_LIVE_SECS seconds (default 240) whose turn has not ended, classed by last model.
Agent and Workflow calls are denied past CC_OPUS_AGENT_CAP Opus agents (default 6) or
CC_AGENT_TOTAL_CAP agents (default 12); a Workflow counts CC_WORKFLOW_WEIGHT (default 3).
CC_ALLOW_AGENT_OVERCAP=1 for the session allows the call and says so.

SendMessage to an unfinished workflow agent is denied: it starts a second copy writing the same tree.
Fail-open: bad input exits 0 silently.
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


def finished(path: Path) -> bool:
    """True when the agent's turn ended: an end_turn reply, or a workflow agent's StructuredOutput result (toolEndsTurn)."""
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            f.seek(max(0, size - 262_144))
            lines = f.read().splitlines()
    except OSError:
        return False
    for line in reversed(lines):
        if b'"toolEndsTurn":true' in line or b'"type":"assistant"' in line:
            return b'"toolEndsTurn":true' in line or b'"stop_reason":"end_turn"' in line
    return False


def live_agents(subagents: Path, live_secs: float, now: float):
    opus = other = 0
    for path in subagents.rglob("agent-*.jsonl"):
        try:
            if now - path.stat().st_mtime > live_secs or finished(path):
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
    if tool not in ("Agent", "Workflow", "SendMessage"):
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
    if tool == "SendMessage":
        target = str(tin.get("to") or "").split(" [")[0].strip()
        if re.fullmatch(r"a[0-9a-f]+", target) and any(
                not finished(p) for p in subagents.glob(f"workflows/*/agent-{target}.jsonl")):
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                "permissionDecisionReason": "agent-cap-guard: a running Workflow owns this agent; SendMessage would "
                "start a second copy writing the same tree. Wait for its result, or stop the workflow and resume "
                "it with an edited script."}}))
        return
    model = str(tin.get("model") or "").lower()
    adds_opus = tool == "Workflow" or model in ("", "opus", "fable") or "opus" in model

    env = os.environ
    opus_cap = int(env.get("CC_OPUS_AGENT_CAP", "6"))
    total_cap = int(env.get("CC_AGENT_TOTAL_CAP", "12"))
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
            f"agent-cap-guard: {why}. End your turn: the harness notifies "
            "you as each agent finishes, and this launch passes once one has. Or run small work with "
            "model: sonnet."
        ),
    }}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
