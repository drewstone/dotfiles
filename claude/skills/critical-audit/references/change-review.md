# Change review against standards and spec

Derived from mattpocock/skills code-review (MIT).

For a branch, PR or work since a fixed point, confirm the point resolves and `git diff <base>...HEAD` is non-empty, then report two axes separately:

- **Standards**: the repository's documented conventions, cited by file and rule, plus code smells (unclear names, duplicated logic, feature envy, primitive obsession, shotgun surgery, speculative abstraction, pass-through wrappers) as judgment calls a documented standard overrides. Skip what tooling enforces.
- **Spec**: the originating issue or spec, found from commit references, a supplied path or a matching spec file, quoted for each finding: requirements missing or partial, behavior nobody asked for, and requirements implemented wrongly. With no spec, say so and review standards only.
