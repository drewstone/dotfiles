# Scanner task prompt

Use this template with an available execution or delegation tool.
The workflow owner supplies the selected rulesets and prepares any shared rule clones.
Each worker receives distinct output filenames and reads shared rules without changing them.

## Task inputs

- Target: an absolute source directory.
- Category: the assigned language or package.
- Engine: the checked OSS or Pro selection.
- Mode: `run-all` or `important-only`.
- Rulesets: exact registry identifiers or prepared local configuration paths.
- Output: assigned JSON and SARIF filenames under the run's `raw/` directory.

## Execution

Run each supplied ruleset with the selected engine and mode:

```bash
semgrep [PRO_FLAG] --metrics=off [SEVERITY_FLAGS] [INCLUDE_FLAGS] \
  --config "$RULESET" --json -o "$JSON_OUTPUT" \
  --sarif-output="$SARIF_OUTPUT" "$TARGET"
```

`PRO_FLAG` is `--pro` only when the owner selected Pro.
Use the mode flags from [scan modes](scan-modes.md).
Add language filters only to language-specific rulesets.
Cross-language rulesets must retain their intended coverage.

Execute through a tool that returns each command's exit status.
When running commands in parallel, collect every status before reporting completion.
Do not substitute a successful merge for a failed scan.

Return the commands, exit statuses, output paths, scanned-file counts, and failures.
Keep findings unchanged for the owner to filter and triage.
Leave shared rule clones in place for other workers; the owner removes them after all scans finish.
