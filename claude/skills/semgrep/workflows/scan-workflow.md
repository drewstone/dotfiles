# Semgrep scan workflow

## 1. Resolve the target and output directory

Use the target and authority already provided in this session.
Keep scan files in the requested output directory or create an unused `static_analysis_semgrep_<n>` directory within the project.
Create `raw/` and `results/` beneath it before execution.
Pass absolute paths to scanner tasks.

Confirm `semgrep --version` succeeds.
Inspect available Pro configuration when cross-file analysis is relevant.
A failed Pro probe needs its error recorded; it does not establish that only the OSS engine is available.
Use `--metrics=off` for scanner and validation commands.

Use `rg --files` or an available file-discovery tool to identify languages and framework manifests within the target.
Record exclusions and relevant file counts.

## 2. Select scan mode and rulesets

Use the requested scan mode.
For an unspecified security audit, use `important only`; use `run all` when the user requests broader coverage.
[Scan modes](../references/scan-modes.md) defines the flags and filters.

Inspect existing project configuration before selecting rules from [the ruleset catalog](../references/rulesets.md).
Select rulesets for the detected languages, frameworks, and requested risks.
Validate selected rulesets and record unavailable coverage.

## 3. Record the scan plan

Record the target, output directory, engine, mode, exact rulesets, exclusions, and expected parallel tasks.
Proceed within the authority already granted for this session.
Ask only when the plan needs authority beyond the requested scan, such as an unapproved source upload or paid service.
A local scan request does not need a second approval for routine rule selection.

Write the final ruleset identifiers and local paths to `$OUTPUT_DIR/rulesets.txt`.
For cloned rule repositories, also record their revisions.
Prepare shared rule clones once under `$OUTPUT_DIR/repos/` and pass their local configuration paths to workers.
Keep those clones until all scans that use them have completed.

## 4. Execute the scans

Use the [scanner task template](../references/scanner-task-prompt.md) with the available execution or delegation tools.
Split work only when it improves reliability or completion time.
Assign each task distinct output filenames.
Use the current concurrency limits; a named scanner subagent is optional.

Record every command's exit status and output paths.
A missing or failed scan remains incomplete even when other scans succeed.
Resolve failures or report their exact coverage limits before combining results.
Keep raw results unchanged.

## 5. Merge, inspect, and report

Use [the SARIF merge script](../scripts/merge_sarif.py) after the selected scans finish.
Resolve its path relative to this skill's directory:

```bash
python3 "$SKILL_DIR/scripts/merge_sarif.py" "$OUTPUT_DIR/raw" "$OUTPUT_DIR/results/results.sarif"
```

For `important only`, apply the JSON filters in [scan modes](../references/scan-modes.md).
Deliver the `*-important.json` files as filtered results and label the merged SARIF as unfiltered.
The JSON filter does not change SARIF files.
Preserve the raw results and report counts separately for each artifact.

Parse the resulting SARIF and confirm it contains the expected completed scans.
Triage findings against the actual source before calling them defects.
Report commands, rulesets, engine, files scanned, exclusions, failures, finding counts, confirmed defects, false positives, and artifact paths.
Reconcile severity and category counts against their corresponding totals.

After every worker finishes, remove only rule clones created for this run.
Retain the raw results and rule revision record.
