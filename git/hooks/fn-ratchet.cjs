#!/usr/bin/env node
// Refuse a commit that adds a function over LIMIT lines or grows one already over it.
//
// The rule, for staged TypeScript, JavaScript and Python outside tests: no new function longer than LIMIT lines, and no
// function already longer than LIMIT may grow. A function moved to another file in the same commit is compared with
// its old self. Functions are named by declaration, by the variable or property they are assigned to, or by the call
// they are passed to (git/census/functions.cjs). Parsing needs the typescript package: the repo's own, else the one
// git/install.sh puts in ~/.local/share/dotfiles-node; with neither, the hook says so and passes.
"use strict";
const { execFileSync } = require("child_process");
// The census owns the function counter and the source classification, so this hook and the census count alike.
const { loadTs, functionSpans, SOURCE, SKIP, LIMIT } = require("../census/functions.cjs");
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 30 });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

/** Each function name's longest span in a file: a name defined twice is compared by its longest copy. */
function spans(ts, file, text) {
  const out = new Map();
  for (const { key, span } of functionSpans(ts, file, text).fns) out.set(key, Math.max(out.get(key) || 0, span));
  return out;
}

function main() {
  if (tryGit("rev-parse", "-q", "--verify", "HEAD") === null) return 0;
  const parts = git("diff", "--cached", "--raw", "-M", "-z").split("\0");
  const changed = [], before = [];
  for (let i = 0; i < parts.length && parts[i]; ) {
    const [oldMode, newMode, , , status] = parts[i].slice(1).split(" ");
    const renamed = "RC".includes(status[0]);
    if (!["000000", "160000"].includes(oldMode)) before.push(parts[i + 1]);
    if (!["000000", "160000"].includes(newMode)) changed.push(parts[i + (renamed ? 2 : 1)]);
    i += renamed ? 3 : 2;
  }
  let after = changed.filter((p) => SOURCE.test(p) && !SKIP.test(p));
  if (!after.length) return 0;
  const ts = loadTs([git("rev-parse", "--show-toplevel").trim()]);
  if (!ts) {
    if (after.some((p) => !p.endsWith(".py"))) process.stderr.write("fn-ratchet: no typescript package found; JavaScript/TypeScript sizes not checked.\n");
    after = after.filter((p) => p.endsWith(".py"));
  }
  // A merge is compared with every parent: a function the incoming branch already grew is not this commit's growth.
  const mergeHeads = (tryGit("rev-parse", "-q", "--verify", "MERGE_HEAD") || "").split("\n").filter(Boolean);
  const bases = [["HEAD", before], ...mergeHeads.map((h) => [h, after])];
  const old = new Map();
  for (const [ref, paths] of bases) for (const p of paths.filter((p) => SOURCE.test(p) && !SKIP.test(p) && (ts || p.endsWith(".py")))) {
    const text = ref !== "HEAD" && tryGit("cat-file", "-t", `${ref}:${p}`) !== "blob\n" ? null : tryGit("show", `${ref}:${p}`);
    // An unparseable baseline grants no size exemption; staged source must still parse below.
    try { if (text !== null) for (const [k, v] of spans(ts, p, text)) old.set(k, Math.max(old.get(k) || 0, v)); } catch {}
  }
  const refused = [];
  for (const p of after) {
    const text = git("show", `:${p}`);
    for (const [k, v] of spans(ts, p, text)) {
      if (v <= LIMIT) continue;
      const was = old.get(k);
      if (was === undefined || v > was) refused.push(`  ${p}: ${k} is ${v} lines (${was === undefined ? "new" : `was ${was}`})`);
    }
  }
  if (!refused.length) return 0;
  process.stderr.write(`fn-ratchet: refusing commit: a function may not end above ${LIMIT} lines unless it already was and does not grow.\n${refused.slice(0, 30).join("\n")}\n`);
  process.stderr.write("  Give each responsibility inside it a named function, so the original reads as a short list of steps.\n");
  return 1;
}
process.exit(main());
