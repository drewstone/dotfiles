# Result filtering

Use this for `important only` output after retaining the original JSON and SARIF.
For `run all`, report and triage the complete selected scan without this filter.

The filter below retains security findings whose supplied confidence and impact are medium or high.
Missing metadata is retained for manual triage; it does not imply high confidence or impact.
Check the installed scanner and rules for their current metadata vocabulary before applying the filter.
If it differs, adapt the filter explicitly and record that policy.

Set `raw_json` and `filtered_json` to different files in this run's output directory.
Run the filter and inspect its exit status before reporting the result:

```bash
jq '
  def accepted($allowed):
    . == null or (type == "string" and (ascii_upcase as $v | $allowed | index($v) != null));
  .results |= map(select(
    (.extra.metadata.category | accepted(["SECURITY"])) and
    (.extra.metadata.confidence | accepted(["MEDIUM", "HIGH"])) and
    (.extra.metadata.impact | accepted(["MEDIUM", "HIGH"]))
  ))
' "$raw_json" > "$filtered_json"
```

Keep the scanner's errors, paths, and other metadata in the filtered document.
Count raw results, retained results, removed results, and retained findings with incomplete metadata.
Reconcile those counts and explain that removal by this filter is not a false-positive decision.

This command changes JSON only.
Label SARIF as unfiltered unless a separate, verified SARIF transformation was performed.
Keep raw output unchanged so later triage can revisit a filtering decision.
