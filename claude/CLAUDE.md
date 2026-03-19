
## Work Style Defaults

- **Quality bar**: Senior staff engineer (L7/L8) standard. Be extremely critical. Zero tolerance for slop, overengineering, or bloat.
- **Completeness**: Complete tasks fully. Don't present partial solutions. Run tests. Verify everything works before saying "done."
- **Succinctness**: Keep implementations focused and minimal. Fewer lines changed is better. Match existing codebase style exactly.
- **Parallelism**: For audit, review, and research tasks, use parallel subagents by default. Don't serialize what can be parallelized.
- **Self-improvement**: After completing significant work, self-assess quality. If below 9/10, identify gaps and continue without being asked.
- **No hand-holding**: Don't ask for confirmation on routine decisions. Make the right call and move forward. Only ask when genuinely ambiguous.

## Screenshots / Clipboard Images

When the user says "check the latest screenshot", "look at $IMG", or similar — read the file at:
```
/home/drew/.tmux/clipboard/images/latest.png
```
This is automatically synced from the user's macOS clipboard via the clipboard-bridge plugin. It always contains the most recent screenshot or copied image.

## Git Commits

- **Never add Co-Authored-By lines** to commits unless the user explicitly asks for co-authorship. No co-authorship is the default.

## Deployment Debugging

- **If a third-party deploy is broken and you lack dashboard access, pivot to infrastructure you control.** Don't retry/wait on opaque build hooks — check what credentials are available (`~/.openclaw/workspace/.secrets/`) and use them.
- **Build hooks that "succeed" only mean the HTTP POST worked.** The actual build is async. If you can't check build logs, you can't debug — switch providers.

## Integration Test Fixes (Orchestrator + Sidecar)

When integration tests fail with sidecar startup issues:

1. **Container security settings (production defaults are correct):**
   - `noNewPrivileges: true` (sidecar runs as non-root, no setuid needed)
   - `capabilities.drop: ["ALL"]` with `capabilities.add: ["SYS_PTRACE"]`
   - If sidecar entrypoint fails with exit 255, check AppArmor/Docker installation (use Docker CE, not Snap)

2. **Don't override container command** when sidecar is enabled - let the sidecar entrypoint run

3. **SessionGateway requires `getProductAuthInfo`** in tests:
   ```typescript
   new SessionGateway(orchestrator, {
     pathPrefix: "/session",
     getProductAuthInfo: async (id) => ({
       product_id: id,
       secrets: { current: { secret: "test-secret", created_at: Date.now() } },
       status: "active" as const,
     }),
   });
   ```

4. **Run integration tests with:** `VITEST_INTEGRATION=1 RUN_DRIVER_COMPLIANCE_TESTS=true RUN_DOCKER_INTEGRATION_TESTS=true`
