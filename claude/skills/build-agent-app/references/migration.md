# Migrate existing product infrastructure

Read the existing production entrypoint, dependency imports, and tests before selecting replacements.
Use the current package architecture map to locate the supported replacement and its runnable example.

| Existing concern | Action |
|---|---|
| Behavior already owned by a shared package | Adopt the package and remove the local implementation |
| Product policy, permissions, or storage | Retain it at a typed boundary |
| External contract still used by consumers | Preserve and test the observable behavior |
| Unreachable or unrelated code | Confirm callers and remove it |

Migrate a coherent concern while keeping the product runnable.
Route every caller to the new path before removing the old one.
Keep adapters that enforce product policy or identity mapping; remove adapters that only rename an API.

Prove dependency resolution, production imports, absence of old callers, and the complete user flow after the change.
When upgrading a dependency, run the affected integration tests against the actual installed package.
Record a compatibility exception only when a real consumer requires it; avoid parallel implementations as a precaution.
