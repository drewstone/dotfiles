#!/usr/bin/env node
// halo-extract — turn a Claude Code / Codex session JSONL into a compact
// "loop-profile": the signal-dense summary an analyst scores for loop-waste.
//
// Streams line-by-line so multi-hundred-MB transcripts cost ~constant memory.
// Format-tolerant: Claude (`message.content[]` blocks) and Codex (`payload`)
// are both recognized; unknown lines are skipped, never fatal.
//
// Usage:
//   node halo-extract.mjs <session.jsonl> [...more]      # one profile per file (JSONL to stdout)
//   node halo-extract.mjs --dir <dir> [--days N]         # all *.jsonl in dir, mtime within N days
//
// The profile is intentionally lossy: it keeps the shape of the loop (turns,
// tool histogram, wait-gaps, repeated commands, errors) and drops the content.
// Loop-waste lives in the shape, not the prose.

import { createReadStream, statSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { basename, join } from "node:path";

const WAIT_GAP_MS = 60_000; // gap between consecutive events that counts as "waiting"
const MAX_ACTIVE_GAP_MS = 30 * 60_000; // gaps longer than this = session idle/overnight, not in-loop waiting
const REPEAT_TOP_N = 8;

// First token of a shell command, normalized — the "stem" we count repeats by.
// `gh-drew run view 123` and `gh-drew run view 456` share a stem so polling shows up.
function commandStem(cmd) {
  if (!cmd || typeof cmd !== "string") return null;
  const cleaned = cmd.trim().replace(/\s+/g, " ");
  // Drop obvious volatile tails (ids, shas, timestamps) to cluster polls together.
  const head = cleaned
    .split("&&")[0]
    .split("|")[0]
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ")
    .replace(/\b[0-9a-f]{7,}\b/g, "<id>")
    .replace(/\b\d{3,}\b/g, "<n>");
  return head.slice(0, 80);
}

function isWaitCommand(cmd) {
  if (!cmd) return false;
  return /\b(sleep|until |while true|gh-?\w* run (view|list|watch)|pr (view|checks)|run view|workflow run|tail -f|Monitor|--watch)\b/i.test(
    cmd,
  );
}

function isDeployCiCommand(cmd) {
  if (!cmd) return false;
  return /\b(gh\b|gh-drew|workflow run|run view|run list|pr (view|checks|merge|create|review)|deploy\.yml|smoke|staging|deploy)\b/i.test(
    cmd,
  );
}

function parseTs(d) {
  const raw =
    d.timestamp ||
    d.ts ||
    (d.payload && (d.payload.timestamp || d.payload.ts)) ||
    null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

// Pull the interesting events out of one parsed JSONL line.
// Returns { kind, toolName?, isError?, command?, isUser?, isHook? } or null.
function classify(d) {
  const type = d.type || (d.payload && d.payload.type);

  // Claude: assistant/user message with content blocks
  const msg = d.message || (d.payload && d.payload.message) || null;
  const role =
    (msg && msg.role) || (d.payload && d.payload.role) || d.role || null;

  if (msg && Array.isArray(msg.content)) {
    const out = [];
    for (const b of msg.content) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "tool_use") {
        const cmd =
          b.name === "Bash" && b.input ? b.input.command : undefined;
        out.push({ kind: "tool", toolName: b.name, command: cmd });
      } else if (b.type === "tool_result") {
        out.push({ kind: "tool_result", isError: b.is_error === true });
      } else if (b.type === "text" && role === "user") {
        out.push({ kind: "user_text", text: b.text });
      }
    }
    if (out.length) return out;
    if (role === "user") return [{ kind: "user_text" }];
    return null;
  }

  // Claude plain user line (content is a string)
  if (type === "user" && role === "user") {
    const text = typeof msg?.content === "string" ? msg.content : undefined;
    return [{ kind: "user_text", text }];
  }

  // Codex: the real subtype lives on payload.type; top-level type is
  // response_item / event_msg. Shell runs are function_call name=exec_command
  // with arguments = JSON string {cmd, workdir}; user turns are
  // event_msg/user_message; tool failures surface as turn_aborted.
  const p = d.payload;
  if (p && typeof p === "object") {
    const pt = p.type;
    if (pt === "function_call") {
      const name = p.name || "fn";
      let command;
      if (/^(exec_command|shell|local_shell|container\.exec|bash)$/.test(name)) {
        try {
          const a = typeof p.arguments === "string" ? JSON.parse(p.arguments) : p.arguments;
          command =
            a?.cmd ??
            (Array.isArray(a?.command) ? a.command.join(" ") : a?.command);
        } catch {
          command = typeof p.arguments === "string" ? p.arguments : undefined;
        }
      }
      return [{ kind: "tool", toolName: name, command }];
    }
    if (pt === "custom_tool_call" || pt === "web_search_call") {
      return [{ kind: "tool", toolName: p.name || pt }];
    }
    if (pt === "user_message") {
      return [{ kind: "user_text", text: p.message ?? p.text }];
    }
    if (pt === "turn_aborted") {
      return [{ kind: "tool_result", isError: true }];
    }
  }

  return null;
}

// A user_text is a *real* turn only if it's not a harness/hook injection.
function isRealUserTurn(text) {
  if (text == null) return true; // string-less user line — count it
  if (typeof text !== "string") return true;
  const t = text.trimStart();
  return !(
    t.startsWith("<") || // <system-reminder>, <task-notification>, <local-command-...>
    t.startsWith("Caveat:") ||
    t.includes("interaction-directive") ||
    t.includes("[SYSTEM NOTIFICATION") ||
    t.includes("This is an automated background-task event")
  );
}

function profileSession(file) {
  return new Promise((resolve) => {
    const prof = {
      file: basename(file),
      bytes: statSync(file).size,
      startTs: null,
      endTs: null,
      events: 0,
      realUserTurns: 0,
      toolCalls: 0,
      tools: {}, // name -> count
      bashCommands: 0,
      deployCiCommands: 0,
      waitCommands: 0,
      toolErrors: 0,
      // gaps between consecutive events: total (raw) vs active (capped at
      // MAX_ACTIVE_GAP_MS so overnight/abandoned spans don't masquerade as
      // in-loop waiting). activeMs is the trustworthy "time spent waiting on
      // a feedback loop" number.
      waitGaps: { count: 0, totalMs: 0, activeMs: 0, maxMs: 0 },
      repeats: {}, // command stem -> count
      cwd: null,
      sessionId: null,
      agent: file.includes(".codex/") ? "codex" : "claude",
    };
    let lastTs = null;
    const rl = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (!line) return;
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        return;
      }
      if (!prof.cwd) prof.cwd = d.cwd || d.payload?.cwd || null;
      if (!prof.sessionId)
        prof.sessionId = d.sessionId || d.payload?.id || null;

      const ts = parseTs(d);
      if (ts) {
        if (prof.startTs == null) prof.startTs = ts;
        prof.endTs = ts;
        if (lastTs != null) {
          const gap = ts - lastTs;
          if (gap >= WAIT_GAP_MS) {
            prof.waitGaps.count++;
            prof.waitGaps.totalMs += gap;
            prof.waitGaps.activeMs += Math.min(gap, MAX_ACTIVE_GAP_MS);
            if (gap > prof.waitGaps.maxMs) prof.waitGaps.maxMs = gap;
          }
        }
        lastTs = ts;
      }

      const events = classify(d);
      if (!events) return;
      for (const e of events) {
        prof.events++;
        if (e.kind === "user_text") {
          if (isRealUserTurn(e.text)) prof.realUserTurns++;
        } else if (e.kind === "tool") {
          prof.toolCalls++;
          prof.tools[e.toolName] = (prof.tools[e.toolName] || 0) + 1;
          // A shell command is any tool that carries a command string —
          // Claude `Bash` or Codex `exec_command`. Detect by payload, not name.
          if (e.command != null) {
            prof.bashCommands++;
            if (isDeployCiCommand(e.command)) prof.deployCiCommands++;
            if (isWaitCommand(e.command)) prof.waitCommands++;
            const stem = commandStem(e.command);
            if (stem) prof.repeats[stem] = (prof.repeats[stem] || 0) + 1;
          }
        } else if (e.kind === "tool_result" && e.isError) {
          prof.toolErrors++;
        }
      }
    });
    rl.on("close", () => {
      // Derive the loop-waste-relevant summaries.
      const durMin =
        prof.startTs && prof.endTs
          ? Math.round((prof.endTs - prof.startTs) / 60000)
          : null;
      const topRepeats = Object.entries(prof.repeats)
        .filter(([, n]) => n >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, REPEAT_TOP_N)
        .map(([stem, n]) => ({ stem, n }));
      const topTools = Object.entries(prof.tools)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, n]) => ({ name, n }));
      resolve({
        file: prof.file,
        agent: prof.agent,
        sessionId: prof.sessionId,
        cwd: prof.cwd,
        bytesMB: +(prof.bytes / 1e6).toFixed(1),
        durationMin: durMin,
        realUserTurns: prof.realUserTurns,
        toolCalls: prof.toolCalls,
        bashCommands: prof.bashCommands,
        deployCiCommands: prof.deployCiCommands,
        waitCommands: prof.waitCommands,
        toolErrors: prof.toolErrors,
        activeWaitMin: Math.round(prof.waitGaps.activeMs / 60000),
        idleWaitMin: Math.round(prof.waitGaps.totalMs / 60000),
        idleWaitMaxMin: Math.round(prof.waitGaps.maxMs / 60000),
        idleWaitCount: prof.waitGaps.count,
        // loop-waste ratios — the analyst reads these first
        toolsPerTurn: prof.realUserTurns
          ? +(prof.toolCalls / prof.realUserTurns).toFixed(1)
          : null,
        deployCiShare: prof.bashCommands
          ? +(prof.deployCiCommands / prof.bashCommands).toFixed(2)
          : null,
        topRepeatedCommands: topRepeats,
        topTools,
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args[0] === "--dir") {
    const dir = args[1];
    const daysIdx = args.indexOf("--days");
    const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 7;
    const cutoff = Date.now() - days * 86400_000;
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f))
      .filter((f) => {
        try {
          return statSync(f).mtimeMs >= cutoff;
        } catch {
          return false;
        }
      });
  } else {
    files = args.filter((a) => !a.startsWith("--"));
  }
  if (!files.length) {
    process.stderr.write(
      "usage: halo-extract <session.jsonl>... | --dir <dir> [--days N]\n",
    );
    process.exit(2);
  }
  for (const f of files) {
    try {
      const p = await profileSession(f);
      process.stdout.write(JSON.stringify(p) + "\n");
    } catch (err) {
      process.stderr.write(`skip ${f}: ${err.message}\n`);
    }
  }
}

main();
