#!/usr/bin/env node
// halo-report — triage layer over the rolling HALO profile log.
//
// Reads ~/.claude/halo/profiles.jsonl (or a path arg), scores each session's
// loop-waste, and prints a ranked table + which sessions clear the threshold
// that warrants the (expensive) LLM trace-analyst. This is the cheap gate that
// keeps deep analysis affordable: profile everything, analyze only the worst.
//
// Usage:
//   node halo-report.mjs [profiles.jsonl] [--flagged] [--days N]
//   --flagged  print only sessions that warrant the analyst (+ a ready brief)
//   --days N   only consider profiles whose session is within N days (by file mtime is unknown here; uses durationMin presence as a liveness proxy — N filters nothing unless set)

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_LOG = join(homedir(), ".claude", "halo", "profiles.jsonl");

// Loop-waste flags. Each returns a reason string when tripped, else null.
// Thresholds are deliberately conservative — a flagged session is worth tokens.
const FLAGS = [
  (p) =>
    (p.deployCiShare ?? 0) >= 0.4 && p.bashCommands >= 50
      ? `deploy/CI ${Math.round(p.deployCiShare * 100)}% of ${p.bashCommands} shell cmds`
      : null,
  (p) => {
    const polls = (p.topRepeatedCommands || [])
      .filter((c) => /run view|run list|pr (view|checks)|gh /.test(c.stem))
      .reduce((n, c) => n + c.n, 0);
    return polls >= 100 ? `${polls} hand CI-polls (use a watcher)` : null;
  },
  (p) =>
    p.toolCalls && p.toolErrors / p.toolCalls >= 0.08
      ? `tool-error rate ${Math.round((p.toolErrors / p.toolCalls) * 100)}%`
      : null,
  // Waiting only flags when it is deploy-driven — raw capped-gap time alone is
  // dominated by think-time/tool-latency and fires on every long session, so
  // gate it on a meaningful deploy/CI share to keep it discriminating.
  (p) =>
    (p.activeWaitMin ?? 0) >= 180 && (p.deployCiShare ?? 0) >= 0.3
      ? `${Math.round((p.activeWaitMin ?? 0) / 60)}h waiting + ${Math.round((p.deployCiShare ?? 0) * 100)}% deploy/CI (deploy-gated loop)`
      : null,
];

function wasteScore(p) {
  // 0..1-ish severity, for ranking. Weighted toward the dominant proven waste.
  return (
    (p.deployCiShare ?? 0) * 2 +
    Math.min((p.activeWaitMin ?? 0) / 240, 1) +
    Math.min((p.toolErrors ?? 0) / 150, 1) * 0.5 +
    ((p.waitCommands ?? 0) / Math.max(p.bashCommands ?? 1, 1)) * 1
  );
}

function analystBrief(p) {
  return `Trace-analyst brief for ${p.file} (${p.agent}, ${p.durationMin}min, ${p.toolCalls} tool calls):
Flagged for: ${p.flags.join("; ")}.
Read the transcript (sample, don't load whole). Classify loop-waste into:
act-before-measure, goal-drift, long-feedback-loop, hand-polling, context-thrash,
tool-friction, premature-victory. For each: cost estimate, 1-2 quoted examples,
a specific durable fix (CLAUDE.md rule / hook / tool). End with the biggest lever.`;
}

function main() {
  const args = process.argv.slice(2);
  const flaggedOnly = args.includes("--flagged");
  const path = args.find((a) => !a.startsWith("--")) || DEFAULT_LOG;
  if (!existsSync(path)) {
    process.stderr.write(`no HALO profile log at ${path}\n`);
    process.exit(0);
  }
  const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    // substantive sessions only — drop tiny subagent transcripts
    .filter((p) => (p.realUserTurns || 0) >= 2 || (p.bashCommands || 0) >= 20);

  for (const p of rows) {
    p.flags = FLAGS.map((f) => f(p)).filter(Boolean);
    p.score = wasteScore(p);
  }
  rows.sort((a, b) => b.score - a.score);
  const flagged = rows.filter((p) => p.flags.length);

  if (flaggedOnly) {
    for (const p of flagged) process.stdout.write(analystBrief(p) + "\n\n");
    return;
  }

  process.stdout.write(
    `HALO triage — ${rows.length} substantive sessions, ${flagged.length} warrant the analyst\n\n`,
  );
  for (const p of rows) {
    const mark = p.flags.length ? "⚑" : " ";
    process.stdout.write(
      `${mark} ${p.score.toFixed(2)}  ${p.agent.padEnd(6)} ${(p.file || "").slice(0, 22).padEnd(22)} ` +
        `turns=${p.realUserTurns} tools=${p.toolCalls} deploy/ci=${Math.round((p.deployCiShare ?? 0) * 100)}% ` +
        `wait=${p.activeWaitMin ?? 0}m err=${p.toolErrors}\n`,
    );
    for (const f of p.flags) process.stdout.write(`     ⚑ ${f}\n`);
  }
  if (flagged.length)
    process.stdout.write(
      `\nRun \`halo-report --flagged\` to emit analyst briefs for the ${flagged.length} flagged.\n`,
    );
}

main();
