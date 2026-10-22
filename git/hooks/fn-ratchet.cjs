#!/usr/bin/env node
// Refuse a commit that adds a function over LIMIT lines or grows one already over it.
//
// Drew, 2026-10-21, after the file splits: "where else is there god objects we didn't finish". The splits put every
// logic file under 1,000 lines, but god objects moved inside files: a 953-line function filled tangle-router's 999-line
// failover/dispatch.ts, and agent-container had 171 functions over 500 lines. loc-ratchet cannot see that.
//
// The rule, for staged TypeScript and JavaScript outside tests: no new function longer than LIMIT lines, and no
// function already longer than LIMIT may grow. A function moved to another file in the same commit is compared with
// its old self. Functions are named by declaration, by the variable or property they are assigned to, or by the call
// they are passed to. Parsing needs the typescript package: the repo's own, else the one git/install.sh puts in
// ~/.local/share/dotfiles-node; with neither, the hook says so and passes. Fixture repos set core.hooksPath=/dev/null.
"use strict";
const LIMIT = 300;
const { execFileSync } = require("child_process");
const os = require("os"), path = require("path");
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 30 });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const SRC = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP = /(\.d\.ts$|\.min\.js$|\.(test|spec)\.[^/]+$|(^|\/)(__tests__|tests?|e2e|fixtures|testdata|generated|vendor|node_modules|dist|build)\/)/;

function loadTs() {
  const root = git("rev-parse", "--show-toplevel").trim();
  for (const base of [root, path.join(os.homedir(), ".local/share/dotfiles-node")]) {
    try { return require(require.resolve("typescript", { paths: [base] })); } catch {}
  }
  return null;
}

function spans(ts, file, text) {
  const out = new Map();
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const keyOf = (n) => {
    if (n.name && n.name.getText) return n.name.getText(sf);
    const p = n.parent;
    if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name) return p.name.getText(sf);
    if (p && ts.isCallExpression(p)) return `<arg of ${p.expression.getText(sf).slice(0, 60)}>`;
    if (ts.isConstructorDeclaration(n)) return "constructor";
    return "<anonymous>";
  };
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) {
      const span = line(n.end) - line(n.getStart(sf)) + 1;
      const key = keyOf(n);
      out.set(key, Math.max(out.get(key) || 0, span));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function main() {
  if (tryGit("rev-parse", "-q", "--verify", "HEAD") === null) return 0;
  const parts = git("diff", "--cached", "--name-status", "-M", "-z").split("\0");
  const changed = [], before = [];
  for (let i = 0; i < parts.length && parts[i]; ) {
    const s = parts[i][0];
    if (s === "R" || s === "C") { before.push(parts[i + 1]); changed.push(parts[i + 2]); i += 3; }
    else { if (s !== "A") before.push(parts[i + 1]); if (s !== "D") changed.push(parts[i + 1]); i += 2; }
  }
  const after = changed.filter((p) => SRC.test(p) && !SKIP.test(p));
  if (!after.length) return 0;
  const ts = loadTs();
  if (!ts) { process.stderr.write("fn-ratchet: no typescript package found (repo or ~/.local/share/dotfiles-node); function sizes not checked.\n"); return 0; }
  const old = new Map();
  for (const p of before.filter((p) => SRC.test(p))) {
    const text = tryGit("show", `HEAD:${p}`);
    if (text !== null) for (const [k, v] of spans(ts, p, text)) old.set(k, Math.max(old.get(k) || 0, v));
  }
  const refused = [];
  for (const p of after) {
    const text = tryGit("show", `:${p}`);
    if (text === null) continue;
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
