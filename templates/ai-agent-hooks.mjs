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
          group: "sequential",
          required: true,
          timeoutSec: 900,
          audit: {
            runner: "codex-review",
            model: "gpt-5.4",
            reasoningEffort: "high",
            failOnSeverities: ["high", "critical"],
            prompt:
              "Review this change before it is pushed. Focus on correctness, regressions, security issues, missing tests, and production-readiness gaps. Return concise findings only. If there are no findings, say 'No findings'."
          }
        }
      ]
    }
  }
};
