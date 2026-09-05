# Vite+ integration

Read the installed Vite+ configuration types or current project documentation before editing its configuration shape.
Merge the anti-slop registration into the existing `lint.jsPlugins` configuration and enable the bundled rules under `lint.rules`.
Preserve unrelated plugins, rules, and settings.

Exclude the copied plugin and generated or installed agent assets from both `lint.ignorePatterns` and `fmt.ignorePatterns`.
A lint exclusion alone does not prevent the combined check from reformatting those files.
Identify paths from the actual repository and preserve existing exclusions.

Run the repository's full Vite+ check command and inspect its diff afterward.
Report source findings separately from installation failures; resolve source findings when migration or cleanup is in scope.
