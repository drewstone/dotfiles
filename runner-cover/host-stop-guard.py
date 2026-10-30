#!/usr/bin/env python3
import json, os, re, select, shlex, subprocess, sys, tempfile, urllib.request
REASON = "This stops a serving fleet host while work is still running. Drain first: runner-drain.sh drain (drewstone/tangle-devops servers/beelink-wall/runner-drain.sh), then stop the host. The only wsl stop allowed here is a -Drill terminate of a scratch distro whose name ends in -drill."
FLEET = re.compile(r"(?i)^(?:beelink[12](?:-wsl)?|beelink\d+-wsl|drew-gtr-pro|desktop-18ir33v|100\.98\.195\.7|100\.127\.22\.51)$")
SCRATCH = re.compile(r"(?i)\bwsl(?:\.exe)?\s+(?:--terminate|-t)\s+\S*-drill(?:\s|$)")
HEREDOC = re.compile(r"(?s)(\b(?:cat|tee)\b[^\n]*<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?[^\n]*\n).*?\n\2(?=\n|$)")
SHELLS = {"bash", "sh", "zsh", "dash", "ash", "pwsh", "powershell", "cmd"}
SSH_VAL = {"-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"}
SKIP = {"exec", "nohup", "command", "do", "then", "else", "time"}
SAFE = {"check", "status", "undrain"}
LABELS = ("ci-deploy", "ci-release")
GROUPS = {12, 13, 14}
ADMIN = "import json,subprocess\nfor g in (12,13,14):\n page=1\n while page<=5:\n  raw=subprocess.check_output(['/home/drew/bin/gh-drew','api','orgs/tangle-network/actions/runner-groups/%s/runners?per_page=100&page=%s'%(g,page)])\n  rows=(json.loads(raw).get('runners') or [])\n  [print('%s\\t%s\\t%s\\t%s'%(g,r.get('name') or '',r.get('status') or '',','.join((l.get('name') or '') for l in (r.get('labels') or [])))) for r in rows]\n  if len(rows)<100: break\n  page+=1\n"
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
    if verb == "wsl": return re.match(r"(?i)\s*(--shutdown|--terminate|-t)\b", rest) is not None
    if verb in {"reboot", "poweroff", "halt", "shutdown", "restart-computer", "stop-computer"}: return True
    if verb == "systemctl": return re.match(r"(?i)\s*(?:--\S+\s+)*(?:reboot|poweroff|halt|kexec)\b", rest) is not None
    if verb == "init": return re.match(r"\s*[06]\b", rest) is not None
    if verb == "stop-service": return re.search(r"(?i)\bwslservice\b", rest) is not None
    return verb == "sc" and re.match(r"(?i)\s*stop\s+wslservice\b", rest) is not None
def argv_verb(command):
    parts = (command or "").split()
    for index, word in enumerate(parts):
        if word.rsplit("/", 1)[-1] not in {"bash", "sh"}:
            continue
        nxt = index + 1
        while nxt < len(parts) and parts[nxt].startswith("-"):
            nxt += 1
        return parts[nxt] if nxt < len(parts) else ""
    return ""
def runner_host(name):
    low = "-%s-" % (name or "").lower()
    for host in ("drew-gtr-pro", "beelink1", "beelink2"):
        if "-%s-" % host in low:
            return host
    return ""
def local_host():
    name = os.uname().nodename.split(".")[0].lower()
    return {"desktop-18ir33v": "beelink1", "beelink1": "beelink1", "beelink2": "beelink2", "drew-gtr-pro": "drew-gtr-pro"}.get(name, "")
def missing_cover(rows, this):
    missing = []
    for label in LABELS:
        present = [row for row in rows if int(row.get("group") or 0) in GROUPS and label in (row.get("labels") or [])]
        if not any(row.get("status") == "online" and runner_host(row.get("name")) != this for row in present):
            missing.append(label)
    return missing
def parse_rows(text):
    rows = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        group, name, status, labels = parts
        rows.append({"group": int(group), "name": name, "status": status, "labels": [item for item in labels.split(",") if item]})
    if not rows:
        raise RuntimeError("no runners")
    return rows
def as_drew(argv, data):
    if os.geteuid() == 0:
        tool = "runuser" if os.path.exists("/usr/sbin/runuser") or os.path.exists("/bin/runuser") else "sudo"
        argv = [tool, "-u", "drew", "--", *argv] if tool == "runuser" else ["sudo", "-n", "-u", "drew", *argv]
    return subprocess.run(argv, input=data, capture_output=True, timeout=40)
def admin_runners():
    attempts = [["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "drew-gtr-pro", "python3", "-"]]
    if os.path.exists("/home/drew/bin/gh-drew"):
        attempts.insert(0, ["python3", "-"])
    for argv in attempts:
        try:
            run = as_drew(argv, ADMIN.encode())
        except (OSError, subprocess.TimeoutExpired):
            continue
        if run.returncode == 0 and run.stdout.strip():
            return parse_rows(run.stdout.decode("utf-8", "replace"))
    raise RuntimeError("admin path failed")
def http_runners(token):
    rows = []
    for group in (12, 13, 14):
        for page in range(1, 6):
            req = urllib.request.Request("https://api.github.com/orgs/tangle-network/actions/runner-groups/%s/runners?per_page=100&page=%s" % (group, page), headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "host-stop-guard"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                chunk = json.load(resp).get("runners") or []
            rows += [{"group": group, "name": row.get("name") or "", "status": row.get("status") or "", "labels": [item.get("name") for item in (row.get("labels") or []) if isinstance(item, dict) and item.get("name")]} for row in chunk]
            if len(chunk) < 100:
                break
    if not rows:
        raise RuntimeError("no runners")
    return rows
def read_token():
    try:
        token = open("/etc/host-stop/runners.read", encoding="utf-8").read().strip()
    except OSError:
        return ""
    if token.startswith("github_pat_") and len(token) >= 20 and not any(ch.isspace() for ch in token):
        return token
    return ""
def fetch_runners():
    raw = os.environ.get("HOST_STOP_RUNNERS_JSON")
    if raw:
        data = json.loads(raw)
        if not isinstance(data, list) or not data:
            raise RuntimeError("empty fixture")
        return data
    if os.geteuid() != 0:
        raise RuntimeError("not root")
    token = read_token()
    return http_runners(token) if token else admin_runners()
def stops_only_in_drain(body):
    rest = re.sub(r"(?ms)^\s*drain\).*?(?=^\s*(?:undrain|status|check|\*)\)|^\s*esac\b)", "", body or "")
    return "runner-drain.sh" in (body or "") and re.search(r"(?m)^\s*drain\)", body or "") is not None and re.search(r"(?i)\bsystemctl\s+stop\b", rest) is None
def host_stop(command, payload, parent):
    cmd, body = command or "", payload or ""
    if argv_verb(cmd) in SAFE and stops_only_in_drain(body):
        return 0, False
    hit = re.search(r"(?i)(?:^|[\s/'\"])wsl-drill\.ps1\b", cmd) or (re.search(r"(?i)(?:^|[\s/'\"])runner-drain\.sh\b", cmd) and re.search(r"(?i)(^|\s)drain(\s|$)", cmd)) or (re.search(r"(?i)\bsystemctl\s+stop\b", body) and "actions.runner" in body)
    if not hit:
        return 0, False
    try: rows = fetch_runners()
    except Exception:
        sys.stderr.write("This drain or stop is refused: GitHub runner status unreachable.\n"); return 125, False
    this = (os.environ.get("HOST_STOP_HOST") or local_host()).lower()
    if not this:
        sys.stderr.write("This drain or stop is refused: this host is not a known fleet host.\n"); return 125, False
    missing = missing_cover(rows, this)
    if missing:
        sys.stderr.write("This drain or stop is refused: %s would have no online runner on another host. Production labels ci-deploy and ci-release must stay covered in runner groups 12, 13 and 14.\n" % ", ".join(missing)); return 125, False
    return 0, True
def install_credential():
    if os.geteuid() != 0:
        sys.stderr.write("host-stop credential install must run as root\n"); return 2
    token = sys.stdin.read().strip()
    if not token.startswith("github_pat_") or len(token) < 20 or any(ch.isspace() for ch in token):
        sys.stderr.write("credential must be a read-only runners token\n"); return 2
    os.makedirs("/etc/host-stop", mode=0o755, exist_ok=True)
    fd = os.open("/etc/host-stop/runners.read", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o400)
    os.write(fd, (token + "\n").encode()); os.close(fd); os.chmod("/etc/host-stop/runners.read", 0o400); os.chown("/etc/host-stop/runners.read", 0, 0)
    return 0
def read_stdin_burst():
    buf, fd = bytearray(), 0
    while len(buf) <= 1_000_000 and select.select([fd], [], [], 0.5 if buf else 1.0)[0]:
        chunk = os.read(fd, 65536)
        if not chunk:
            return bytes(buf), True
        buf += chunk
    return bytes(buf), False
def resume_stdin(payload, eof, real, args):
    if eof:
        fd, name = tempfile.mkstemp(prefix="host-stop-"); os.write(fd, payload); os.close(fd); src = os.open(name, os.O_RDONLY); os.dup2(src, 0); os.close(src); os.unlink(name); os.execv(real, [real, *args])
    reader, writer = os.pipe()
    if os.fork() == 0:
        os.close(reader)
        try:
            payload and os.write(writer, payload)
            while True:
                chunk = os.read(0, 65536)
                if not chunk: break
                os.write(writer, chunk)
        except OSError: pass
        os.close(writer); os._exit(0)
    os.close(writer); os.dup2(reader, 0); os.close(reader); os.execv(real, [real, *args])
def bash_wrap():
    me, args, mode, script = os.path.realpath(sys.argv[0]), sys.argv[1:], "", None
    real = next((p for p in ("/usr/bin/bash", "/bin/bash") if os.access(p, os.X_OK) and os.path.realpath(p) != me), "")
    if not real:
        return 127
    for i, arg in enumerate(args):
        if arg == "-s" or (len(arg) > 1 and arg[0] == "-" and arg[1] != "-" and "s" in arg):
            mode = mode or "s"
        if re.fullmatch(r"-l*c", arg) and i + 1 < len(args):
            script, mode = args[i + 1], "c"
        elif len(arg) > 2 and arg.startswith("-c"):
            script, mode = arg[2:], "c"
    if not mode:
        os.execv(real, [real, *args])
    eof, raw, payload = True, b"", script
    if mode != "c":
        raw, eof = read_stdin_burst()
        if eof and len(raw) > 1_000_000:
            return 125
        payload = raw.decode("utf-8", "replace")
    try: parent = open(f"/proc/{os.getppid()}/cmdline", "rb").read().replace(b"\0", b" ").decode("utf-8", "replace")
    except OSError: parent = ""
    code, allowed = host_stop(" ".join(sys.argv), payload, parent)
    if code:
        return code
    if allowed and os.environ.get("HOST_STOP_DRY_RUN"):
        sys.stdout.write("allowed\n"); return 0
    if mode == "s":
        resume_stdin(raw, eof, real, args)
    os.execv(real, [real, *args])
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
            guest = " ".join(tokens[tokens.index("--") + 1:]) if "--" in tokens else " ".join(tokens[tokens.index("-e") + 1:]) if "-e" in tokens else ""
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
    cmd = shlex.join(raw) if isinstance(raw, list) else raw
    if cmd and walk(cmd, fleet(os.uname().nodename.split(".")[0])):
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": REASON}}))
if __name__ == "__main__":
    if os.path.basename(sys.argv[0]) == "bash":
        raise SystemExit(bash_wrap())
    if len(sys.argv) > 1 and sys.argv[1] == "--install-credential":
        raise SystemExit(install_credential())
    if len(sys.argv) > 1 and sys.argv[1] == "--host":
        code, allowed = host_stop(os.environ.get("HOST_STOP_COMMAND", ""), sys.stdin.read(1_000_001), os.environ.get("HOST_STOP_PARENT", ""))
        if not code and allowed and os.environ.get("HOST_STOP_DRY_RUN"):
            sys.stdout.write("allowed\n")
        raise SystemExit(code)
    main()
