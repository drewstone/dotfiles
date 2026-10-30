#!/usr/bin/env python3
"""PreToolUse(Bash): deny a stop aimed at beelink1, beelink2, their -wsl aliases, desktop-18ir33v or drew-gtr-pro.

Drain first with runner-drain.sh drain (drewstone/tangle-devops servers/beelink-wall/runner-drain.sh), then stop.
A -Drill terminate of a scratch distro (name ending in -drill) stays allowed. Fail-open when the payload is not JSON.
"""
import json, os, re, sys

REASON = (
    "This stops a serving fleet host while work is still running. "
    "Drain first: runner-drain.sh drain (drewstone/tangle-devops servers/beelink-wall/runner-drain.sh), then stop the host. "
    "The only wsl stop allowed here is a -Drill terminate of a scratch distro whose name ends in -drill.")
FLEET = re.compile(r"(?i)^(?:beelink[12](?:-wsl)?|beelink\d+-wsl|drew-gtr-pro|desktop-18ir33v|100\.98\.195\.7|100\.127\.22\.51)$")
SCRATCH = re.compile(r"(?i)\bwsl(?:\.exe)?\s+(?:--terminate|-t)\s+\S*-drill\b")
HEREDOC = re.compile(r"(?s)(\b(?:cat|tee)\b[^\n]*<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?[^\n]*\n).*?\n\2(?=\n|$)")
SHELLS = {"bash", "sh", "zsh", "dash", "ash", "pwsh", "powershell", "cmd"}
SSH_VAL = {"-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"}
SKIP = {"exec", "nohup", "command", "do", "then", "else", "time"}


def fleet(dest):
    host = (dest or "").rsplit("@", 1)[-1].strip("[]")
    return FLEET.fullmatch(host.split(":", 1)[0] if host.count(":") == 1 else host) is not None


def words(text):
    out, i, n = [], 0, len(text)
    while i < n:
        while i < n and text[i] in " \t":
            i += 1
        if i >= n or text[i] in "\n;&|()" or text.startswith(("&&", "||"), i):
            break
        if text[i] in "'\"":
            j = text.find(text[i], i + 1)
            out.append(text[i + 1:] if j < 0 else text[i + 1:j])
            i = n if j < 0 else j + 1
            continue
        j = i
        while j < n and text[j] not in " \t\n;&|'\"()" and not text.startswith(("&&", "||"), j):
            j += 1
        if j == i:
            break
        out.append(text[i:j])
        i = j
    return out


def segments(cmd):
    parts, buf, quote, i = [], [], None, 0
    while i < len(cmd):
        c = cmd[i]
        if quote:
            buf.append(c)
            quote = None if c == quote else quote
            i += 1
            continue
        if c in "'\"":
            quote = c
            buf.append(c)
            i += 1
            continue
        if cmd.startswith(("&&", "||"), i) or c in ";|&\n":
            parts.append("".join(buf))
            buf = []
            i += 2 if cmd.startswith(("&&", "||"), i) else 1
            continue
        buf.append(c)
        i += 1
    parts.append("".join(buf))
    return [part for part in parts if part.strip()]


def command_head(segment):
    tokens, i = words(segment), 0
    while i < len(tokens):
        low = tokens[i].rsplit("/", 1)[-1].lower().removesuffix(".exe")
        if low == "sudo":
            i += 1
            while i < len(tokens) and tokens[i].startswith("-"):
                if tokens[i] in {"-u", "-g", "-C", "-D", "-h", "-p", "-R", "-T", "-U"} or tokens[i].startswith(("--user", "--group")):
                    i += "=" not in tokens[i]
                i += 1
            continue
        if low in SKIP:
            i += 1
            continue
        if low == "timeout":
            i += 2
            continue
        if low == "nice":
            i += 3 if i + 1 < len(tokens) and tokens[i + 1] in {"-n", "--adjustment"} else 1
            continue
        if low == "env":
            i += 1
            while i < len(tokens) and "=" in tokens[i] and not tokens[i].startswith("-"):
                i += 1
            continue
        return low, tokens[i + 1:]
    return "", []


def ssh_target(tokens):
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token == "--":
            i += 1
            break
        if token.startswith("-") and token != "-":
            short = token[:2]
            if token in SSH_VAL or (len(token) == 2 and token in SSH_VAL):
                i += 2
                continue
            if not token.startswith("--") and len(token) > 2 and short in SSH_VAL:
                i += 1
                continue
            i += 1
            continue
        break
    return (tokens[i], tokens[i + 1:]) if i < len(tokens) else ("", [])


def is_stop(verb, rest):
    if verb == "wsl" and re.match(r"(?i)\s*(--shutdown|--terminate|-t)\b", rest):
        return True
    if verb in {"reboot", "poweroff", "halt", "shutdown"}:
        return True
    if verb == "systemctl" and re.match(r"(?i)\s*(?:--\S+\s+)*(?:reboot|poweroff|halt|kexec)\b", rest):
        return True
    if verb == "init" and re.match(r"\s*[06]\b", rest):
        return True
    if verb in {"restart-computer", "stop-computer"}:
        return True
    if verb == "stop-service" and re.search(r"(?i)\bwslservice\b", rest):
        return True
    return verb == "sc" and re.match(r"(?i)\s*stop\s+wslservice\b", rest) is not None


def shell_script(verb, tokens):
    if verb not in SHELLS:
        return None
    for index, token in enumerate(tokens):
        if token in {"-c", "/c", "-Command"} or re.fullmatch(r"-l*c", token):
            return tokens[index + 1] if index + 1 < len(tokens) else None
        if token.startswith("-c") and len(token) > 2:
            return token[2:]
    return None


def substitutions(cmd):
    found, index = [], 0
    while (start := cmd.find("$(", index)) >= 0:
        depth, end = 1, start + 2
        while end < len(cmd) and depth:
            depth += (cmd[end] == "(") - (cmd[end] == ")")
            end += 1
        inner = cmd[start + 2:end - 1]
        if inner:
            found.append(inner)
        index = end
    return found


def walk(cmd, here, depth=0):
    if depth > 6 or not cmd.strip():
        return False
    cmd = SCRATCH.sub("true", HEREDOC.sub(r"\1", cmd))
    for segment in segments(cmd):
        verb, tokens = command_head(segment)
        if not verb:
            continue
        if verb == "ssh":
            dest, remote = ssh_target(tokens)
            if fleet(dest) and walk(" ".join(remote), True, depth + 1):
                return True
            continue
        script = shell_script(verb, tokens)
        if script and walk(script, here, depth + 1):
            return True
        if verb == "eval" and walk(" ".join(tokens), here, depth + 1):
            return True
        if verb == "wsl" and not is_stop(verb, " ".join(tokens)):
            guest = ""
            if "--" in tokens:
                guest = " ".join(tokens[tokens.index("--") + 1:])
            elif "-e" in tokens:
                guest = " ".join(tokens[tokens.index("-e") + 1:])
            if guest and walk(guest, here, depth + 1):
                return True
        if here and is_stop(verb, " ".join(tokens)):
            return True
    return any(walk(inner, here, depth + 1) for inner in substitutions(cmd))


def main():
    try:
        payload = json.loads(sys.stdin.read() or "")
    except Exception:
        return
    if (payload.get("tool_name") or "Bash") not in {"Bash", "bash", "shell", "Shell", "exec"}:
        return
    raw = ((payload.get("tool_input") or payload.get("input") or {}).get("command")) or ""
    cmd = " ".join(raw) if isinstance(raw, list) else raw
    if cmd and walk(cmd, fleet(os.uname().nodename.split(".")[0])):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": REASON}}))


if __name__ == "__main__":
    main()
