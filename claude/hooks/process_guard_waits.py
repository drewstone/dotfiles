"""Process-guard rules for waiting: a sleep that cannot end, a gate whose end wakes no one, a wait on PR CI, and a subagent
watching in-session; and the warnings for a wait loop that loses its own output (process_guard.py's docstring)."""
import re

from secret_scan import guard_config

GATES = set(guard_config("process_guard", {}).get("gates", []))  # long-running gate commands


def rule_tail_sleep(cmd):
    """`tail -f /dev/null` as a command is a sleep that can hang and leaks a process per poll."""
    if cmd.prog != "tail" or "/dev/null" not in cmd.argv[1:]:
        return None
    if not any(a in ("-f", "-F", "--follow") or a.startswith("--follow=") for a in cmd.argv[1:]):
        return None
    return ("tail-sleep", "tail -f /dev/null as a sleep",
            "`tail -f /dev/null` never exits, so `read -t N < <(tail -f /dev/null)` is a sleep that can outlive its timeout and "
            "leaves a tail behind on every poll; CC_ALLOW_TAIL_SLEEP=1 on the tail command runs it anyway. Wait in a loop bounded "
            "by a deadline and check the watched thing's conclusion: `end=$(($(date +%s)+600)); until <check> || "
            "[ $(date +%s) -ge $end ]; do sleep 10; done`.", "CC_ALLOW_TAIL_SLEEP")


_QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")
_LONE_AMP = re.compile(r"(?<![&>|<])&(?![&>])")


def rule_detached_gate(cmd, payload):
    """A gate command backgrounded with `&` in a foreground call: nothing wakes the caller at its end."""
    if cmd.prog not in GATES or (payload.get("tool_input") or {}).get("run_in_background"):
        return None
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not _LONE_AMP.search(_QUOTED.sub("", command)):
        return None
    bare = command.strip()  # the same command without its one trailing `&`, when that is the only one
    last = len(_LONE_AMP.findall(_QUOTED.sub("", bare))) == 1 and bare.endswith("&") and not bare.endswith(("&&", ">&", "|&"))
    instead = bare[:-1].rstrip() if last else f"{cmd.prog} <its arguments>"
    return ("detached-gate", f"{cmd.prog} backgrounded with &",
            f"`{cmd.prog} ... &` in a foreground call starts the gate but nothing wakes you when it ends; CC_ALLOW_DETACHED_GATE=1 "
            f"on the {cmd.prog} command runs it anyway. Run it as its own Bash call with run_in_background: true, which notifies "
            f"you at its exit: `{instead}`.", "CC_ALLOW_DETACHED_GATE")


def rule_ci_wait(cmds, events, gh, positionals, merge_gh):
    """gh is the gh-or-wrapper regex and positionals process_guard's gh argument reader."""
    polls = []  # per command reading PR checks: whether it is `gh pr checks --watch`
    for c in cmds:
        pos = positionals(c.argv[1:])[:2] if gh.match(c.prog) else []
        if pos == ["pr", "checks"] or pos == ["pr", "view"] and "statusCheckRollup" in " ".join(c.argv):
            polls.append(pos[1] == "checks" and "--watch" in c.argv)
    if not any(polls) and not (polls and ("loop",) in events and any(c.prog == "sleep" for c in cmds)):
        return None
    return ("ci-wait", "a wait on PR CI",
            "Waiting on PR CI is refused: the repo's gate runs before a deploy, never before a merge, and a red is fixed forward. "
            "A deploy, release or publish run is delivery: `gh run watch <id> --exit-status`. Merge now and keep working: "
            f"`{merge_gh} pr merge <number> --squash --auto`.", None)


def subagent(payload):
    """A subagent's call carries its agent id, and its transcript lives under <session>/subagents/."""
    return bool(payload.get("agent_id")) or "/subagents/" in (payload.get("transcript_path") or "")


def rule_subagent_monitor(payload):
    if payload.get("tool_name") != "Monitor" or not subagent(payload):
        return None
    return ("subagent-monitor", "Monitor in a subagent",
            "Subagents never watch in-session: each Monitor event wakes you and re-reads your context. For a wait past 10 "
            "minutes, end your turn with your report and name the log to read. Run the wait as one foreground Bash call (its "
            "timeout is 10 minutes): `until grep -q '^exit=' <log>; do sleep 15; done; tail -40 <log>`.", None)


def foreground(payload):
    """A subagent's background Bash call, rerun in the foreground at the 10-minute cap (a longer call the harness moves to
    the background itself); the 10-19..26 refusals of these were 346 waits on the subagent's own logs, retried in the foreground."""
    inp = payload.get("tool_input") or {}
    if payload.get("tool_name") not in (None, "Bash") or not inp.get("run_in_background") or not subagent(payload):
        return None
    return {**{k: v for k, v in inp.items() if k != "run_in_background"}, "timeout": 600000}


LOOP_BODY = re.compile(r"\b(?:for|while|until)\b[^\n;]*(?:;|\n)\s*do\b(.*?)\bdone\b", re.S | re.I)
SLEEP_N = re.compile(r"\bsleep\s+[0-9.]+")


def wait_notes(command, tool_input):
    """Warnings for a sleep loop: one polling `npm view` (blind when npm is off PATH) or one whose body prints nothing, which
    a kill at the call's timeout returns empty (silent loops lost all output 29 of 30 times, printing ones 13 of 36)."""
    bodies = [b for b in LOOP_BODY.findall(command) if SLEEP_N.search(b)] if "sleep" in command else []
    if any(re.search(r"\bnpm\s+(?:view|info|show)\b", b) for b in bodies):
        return ["npm-view watcher: this sleep loop polls `npm view`. In lanes npm is often not on PATH, and the loop then reads "
                "every poll as 'not published yet' (three blind waits of 33-55 min). Poll the registry instead: curl -fsS "
                "https://registry.npmjs.org/<scope>%2F<name>/<version>, treat 404 as not yet and any other failure as an error."]
    if tool_input.get("run_in_background") or re.search(r"(?:&?>>?\s*(?!&|/dev/null)\S+)|(?:\|\s*tee\b)", command):
        return []
    if any(not re.search(r"\b(?:echo|printf|tee|cat)\b", b) for b in bodies):
        return ["HALO silent-wait: this loop sleeps but never writes to stdout inside the loop body. If the call passes its "
                "timeout the harness kills it and returns only what was already printed, which here is nothing. Echo the state "
                "each iteration, or set run_in_background:true and let the completion notification wake you."]
    return []
