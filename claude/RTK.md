# RTK

RTK filters terminal output for supported command shapes.
The Claude hook chooses which commands it can rewrite safely.
Read [the hook](hooks/rtk-rewrite.sh) when changing that behavior; preserve its fidelity checks and raw-command fallbacks.

Use the installed command's help for current options:

```bash
rtk --help
rtk --version
rtk gain --help
```

Use `rtk gain` to inspect measured savings and `rtk proxy <command>` when raw output is needed.
Resolve the installed binary before diagnosing a name collision.
