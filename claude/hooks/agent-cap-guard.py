#!/usr/bin/env python3
"""PreToolUse guard on the session's live agents.

Live agents are transcripts under <session>/subagents/ (workflow agents included) written in the
last CC_AGENT_LIVE_SECS seconds (default 240) whose turn has not ended, classed by last model.
Agent and Workflow calls are denied past CC_OPUS_AGENT_CAP Opus agents (default 6) or
CC_AGENT_TOTAL_CAP agents (default 12); a Workflow counts CC_WORKFLOW_WEIGHT (default 3).
CC_ALLOW_AGENT_OVERCAP=1 for the session allows the call and says so. A subagent's denial tells it to do the unit
itself; the lead's lists the live agents with their models, ages and tasks.

SendMessage to an unfinished workflow agent is denied: it starts a second copy writing the same tree.
Fail-open: bad input exits 0 silently.
"""
import calendar
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
    """(minutes since its first line, id, last model, task) per live agent; the task is its meta file's description."""
    live = []
    for path in subagents.rglob("agent-*.jsonl"):
        try:
            if now - path.stat().st_mtime > live_secs or finished(path):
                continue
        except OSError:
            continue
        try:
            with path.open("rb") as f:
                start = calendar.timegm(time.strptime(json.loads(f.readline())["timestamp"][:19], "%Y-%m-%dT%H:%M:%S"))
        except (OSError, ValueError, KeyError, TypeError):
            start = now
        try:
            task = json.loads(path.with_suffix(".meta.json").read_text()).get("description") or ""
        except (OSError, ValueError, AttributeError):
            task = ""
        live.append((int((now - start) // 60), path.stem.removeprefix("agent-"), last_model(path), task))
    return sorted(live, reverse=True)


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
    # A subagent's transcript is <session>/subagents/[workflows/<run>/]agent-<id>.jsonl; the main one is <session>.jsonl.
    tpath = Path(transcript)
    caller_is_agent = "subagents" in tpath.parts[:-1] or bool(d.get("agent_id"))
    session_dir = Path(*tpath.parts[:tpath.parts.index("subagents")]) if "subagents" in tpath.parts[:-1] else tpath.with_suffix("")
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
    live = live_agents(subagents, live_secs, float(env.get("CC_AGENT_NOW", time.time())))
    opus = sum(1 for _, _, m, _ in live if "opus" in m or m == "")
    other = len(live) - opus

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
        "permissionDecisionReason": f"agent-cap-guard: {why}. " + (
            "The seats are the lead's, and a subagent's launch waits on none of them: do this unit yourself, in this turn, "
            "with the tools you have." if caller_is_agent else
            "Live: " + "; ".join(f"{i} {m or 'unknown model'} {age} min" + (f" ({t[:60]})" if t else "") for age, i, m, t in live[:12])
            + ". End your turn: the harness notifies you as each agent finishes, and this launch passes once one has. Or do "
            "the unit yourself, or run small work with model: sonnet."),
    }}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
