"""Process-guard rules for waiting: a sleep that cannot end and a gate whose end wakes no one."""
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
            "`tail -f /dev/null` never exits, so `read -t N < <(tail -f /dev/null)` is a sleep that can outlive "
            "its timeout and leaves a tail behind on every poll. Wait with `sleep N` inside a loop bounded by a "
            "`date +%s` deadline, and check the watched thing's conclusion before exiting. To run it anyway, "
            "put CC_ALLOW_TAIL_SLEEP=1 on the tail command itself.", "CC_ALLOW_TAIL_SLEEP")


_QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")
_LONE_AMP = re.compile(r"(?<![&>|<])&(?![&>])")


def rule_detached_gate(cmd, payload):
    """A gate command backgrounded with `&` in a foreground call: nothing wakes the caller at its end."""
    if cmd.prog not in GATES or (payload.get("tool_input") or {}).get("run_in_background"):
        return None
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not _LONE_AMP.search(_QUOTED.sub("", command)):
        return None
    return ("detached-gate", f"{cmd.prog} backgrounded with &",
            f"`{cmd.prog} ... &` in a foreground call starts the gate but nothing wakes you when it ends. Run the gate "
            "itself with run_in_background (the harness notifies you at its exit) and drop the `&`. To run it "
            f"anyway, put CC_ALLOW_DETACHED_GATE=1 on the {cmd.prog} command.", "CC_ALLOW_DETACHED_GATE")
