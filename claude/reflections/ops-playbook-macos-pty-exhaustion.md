# Ops playbook: macOS pty exhaustion

Reusable runbook. Save a future session an hour of debugging.

## Symptom

- New terminal windows (Warp, iTerm, Terminal.app) fail to open with `openpty failed: ENXIO: No such device or address`
- Existing tabs still work, but spawning new shells, `ssh`, or `node-pty` clients fails
- In extreme cases: `sudo` itself fails with `unable to allocate pty: Device not configured` (chicken-and-egg — the one command that would fix it needs a pty to run)

## Diagnose

```bash
sysctl kern.tty.ptmx_max              # hard limit (default 511 on macOS)
ls /dev/ttys* | wc -l                 # device nodes — monotonic, grows forever until reboot
lsof /dev/ptmx | wc -l                # ACTUAL fd holders (master side) — this is the real count
lsof /dev/ptmx | awk 'NR>1 {print $1, $2}' | sort | uniq -c | sort -rn | head
```

Key insight: `lsof /dev/ttys*` (slaves) undercounts and misleads. `/dev/ptmx` (masters) is the real accounting. If one process holds >50 ptys, it's leaking.

## Fix — raise the limit (no reboot needed)

```bash
# Escapes the sudo-needs-pty deadlock via GUI elevation (SecurityAgent, not sudo)
osascript -e 'do shell script "sysctl -w kern.tty.ptmx_max=999" with administrator privileges'
```

Kernel may reject 2048 with "Invalid argument" — the ceiling varies by macOS version. Start at 999 (commonly accepted), fall back in descending steps (895, 767, 639) if needed:

```bash
for n in 999 895 767 639; do
  osascript -e "do shell script \"sysctl -w kern.tty.ptmx_max=$n\" with administrator privileges" 2>&1 \
    | grep -q "Invalid" || { echo "WORKED at $n"; break; }
done
```

## Persist across reboots

```bash
osascript -e 'do shell script "echo kern.tty.ptmx_max=999 >> /etc/sysctl.conf" with administrator privileges'
```

## Prevent recurrence — enable TouchID-for-sudo

So next time sudo works without needing a pty for password entry:

```bash
osascript -e 'do shell script "sed -i \"\" \"2i\\\nauth       sufficient     pam_tid.so\\n\" /etc/pam.d/sudo" with administrator privileges'
```

## Free held ptys

After raising the limit, kill known leakers:

```bash
# Find top holders
lsof /dev/ptmx | awk 'NR>1 {print $2}' | sort | uniq -c | sort -rn | head

# Kill by PID (be careful — don't kill your current session)
kill -9 <PIDs>
```

## Common culprits

1. **node-pty leaks in long-lived services** — biggest offender. If a service holds IPty objects in a Map without releasing on natural pty exit, each pty that exits pins one fd forever. See: agent-dev-container PR #797.
2. **Zombie Claude Code CLI versions** — older `.claude-code-cli-X.Y.Z` processes sometimes linger. Check with `pgrep -f "claude-code\|2\.1\."`.
3. **SSH ControlMaster connections** — warp/tmux/iterm's ssh multiplex sockets hold ptys per session. Run `ssh -O stop <host>` to close.

## Why this keeps happening on macOS

macOS allocates `/dev/ttysNNN` monotonically and **does not recycle numbers** — once `ttys050` is used and released, the next pty becomes `ttys051`, not `ttys050` again. The device node count grows forever. The live count (`lsof /dev/ptmx`) is what the kernel checks against `kern.tty.ptmx_max`. This is BSD-legacy behavior.

## Related learning

Discovered during a blueprint-agent verticalbench sweep 2026-04-21. Root cause was an ADC sidecar leak (PR #797). Host hit ptmx_max=511 after 4 hours of bench activity. Reflection: `blueprint-agent/.evolve/reflections/2026-04-21-223725-gen34-publish-plus-adc-pty-leak.md`.
