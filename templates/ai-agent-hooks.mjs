export default {
  artifactsDir: ".git/ai-agent-hooks/runs",
  hooks: {
    "pre-commit": {
      checks: [
        { id: "merge-conflict-markers", builtin: "merge-conflict-markers", required: true },
        { id: "suspicious-secrets", builtin: "suspicious-secrets", required: true }
      ]
    },
    "pre-push": {
      checks: [
        { id: "merge-conflict-markers", builtin: "merge-conflict-markers", required: true },
        { id: "suspicious-secrets", builtin: "suspicious-secrets", required: true },
        {
          id: "codex-review",
          group: "ensemble",
          required: false,
          timeoutSec: 900,
          audit: {
            runner: "codex-review",
            skipIfMissing: true,
            prompt:
              "Review this change before it is pushed. Focus on correctness, regressions, security issues, missing tests, and production-readiness gaps. Return concise findings only. If there are no findings, say 'No findings'."
          }
        },
        {
          id: "claude-review",
          group: "ensemble",
          required: false,
          timeoutSec: 900,
          audit: {
            runner: "claude",
            skipIfMissing: true,
            prompt:
              "Review this change before it is pushed. Focus on correctness, regressions, security issues, missing tests, and production-readiness gaps. Return concise findings only. If there are no findings, say 'No findings'."
          }
        }
      ]
    }
  }
};
