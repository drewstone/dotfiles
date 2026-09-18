# Ruleset selection

Use this when the project's scan configuration does not cover the requested language or risk.
Inspect current rules and their actual patterns before assuming a package name establishes coverage.

Start with the project's maintained rules and consult the [current Semgrep registry](https://semgrep.dev/explore) for additional coverage.
Select rules by the detected language, framework, and reachable boundary.
Keep overlapping rule packs only when they add useful coverage.
Validate selected rules with the installed CLI, retain the full validation result, and check its exit status directly.

Third-party sources can help when official rules leave a specific gap:

- [Trail of Bits](https://github.com/trailofbits/semgrep-rules) for additional audit patterns.
- [0xdea](https://github.com/0xdea/semgrep-rules) for low-level code patterns.
- [Decurity](https://github.com/Decurity/semgrep-smart-contracts) for smart-contract patterns.

Verify current language support, license, maintenance state, and relevant rules before selecting a source.
Record local rule paths and repository revisions so the scan can be reproduced.
Prepare a shared rule checkout once and keep it unchanged until every scan using it completes.
Rule counts and historical popularity are not evidence that a ruleset fits the target.
