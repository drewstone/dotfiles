# Combining scan results

Use this when the requested coverage needs multiple scanner invocations.

Assign each scan a target, rule configuration, checked engine, exclusions, and distinct JSON, SARIF, and log paths.
Split only where doing so preserves the required cross-file and cross-language analysis.
Prepare shared rules once, and keep them unchanged until all scans finish.

Collect every command's exit status, scanner errors, skipped paths, and output files.
A successful merge does not establish that any scanner completed successfully.
Resolve failures or record their exact coverage limits before reporting the combined results.

When SARIF files must be combined, use [the merge script](../scripts/merge_sarif.py):

```bash
python3 <skill-directory>/scripts/merge_sarif.py <raw-directory> <results-directory>/results.sarif
```

The script preserves separate SARIF runs, including zero-result scans, rule indexes, invocation status, and run-specific paths.
It rejects malformed or unsupported input instead of publishing a partial merge.
It does not deduplicate findings: combining run tables would require remapping their internal references.

Compare the output's run and finding counts with the input files and inspect failed invocation status.
Keep raw artifacts for each scan.
Deduplicate confirmed issues during triage using their rule, location, data flow, and actual failure scenario, while retaining pointers to each raw occurrence.
If filtering is requested, apply [result filtering](result-filtering.md) to the JSON and keep its counts separate from unfiltered SARIF.
