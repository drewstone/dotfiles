#!/usr/bin/env node
// Function and class sizes from the TypeScript AST: the one counter fn-ratchet and the census share.
//
// A function is a declaration, method, arrow, function expression, constructor or accessor; its span is the lines from
// its first token to its last. It is named by declaration, by the variable or property it is assigned to, or by the
// call it is passed to. A class's size is its member count.
//
// Usage: functions.cjs <checkout> <tree-ish>   prints {files, parsed, fns: [[span, path, name]], classes: [[members, path, name]]}
// over every source file outside tests (patterns.json), and exits 2 when no typescript package can be loaded or a file
// could not be read: a scan that read nothing is refused, never reported as 0.
"use strict";
const { spawnSync } = require("child_process");
const os = require("os"), path = require("path");
const P = require("./patterns.json");
const SOURCE = new RegExp(P.source), SKIP = new RegExp(P.skip);

/** The typescript compiler API from the first root that has one: the measured repo, the dotfiles copy that
 *  git/install.sh puts in ~/.local/share/dotfiles-node, then each NODE_PATH entry. TypeScript 7 publishes no
 *  JavaScript compiler API, so a root on it falls through to the next. */
function loadTs(roots) {
  const nodePath = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
  for (const base of [...roots, path.join(os.homedir(), ".local/share/dotfiles-node"), ...nodePath]) {
    try {
      const ts = require(require.resolve("typescript", { paths: [base] }));
      if (typeof ts.createSourceFile === "function" && ts.ScriptTarget) return ts;
    } catch {}
  }
  return null;
}

function functionSpans(ts, file, text) {
  const fns = [], classes = [];
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
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)
      || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n))
      fns.push({ key: keyOf(n), span: line(n.end) - line(n.getStart(sf)) + 1 });
    if (ts.isClassDeclaration(n)) classes.push({ name: n.name ? n.name.getText(sf) : "<anonymous>", members: n.members.length });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { fns, classes };
}

/** Every blob of `paths` at `tree`, read in one `git cat-file --batch`. */
function readBlobs(checkout, tree, paths) {
  const run = spawnSync("git", ["-C", checkout, "cat-file", "--batch"], { input: paths.map((p) => `${tree}:${p}\n`).join(""), maxBuffer: 2 ** 31 });
  if (run.status !== 0) throw new Error(`git cat-file failed: ${run.stderr}`);
  const out = new Map();
  let i = 0;
  for (const p of paths) {
    const nl = run.stdout.indexOf(10, i);
    const header = run.stdout.subarray(i, nl).toString().split(" ");
    i = nl + 1;
    if (header[1] !== "blob") continue;
    const n = Number(header[2]);
    out.set(p, run.stdout.subarray(i, i + n).toString("utf8"));
    i += n + 1;
  }
  return out;
}

function main([checkout, tree]) {
  if (!checkout || !tree) { process.stderr.write("usage: functions.cjs <checkout> <tree-ish>\n"); return 2; }
  const ts = loadTs([checkout]);
  if (!ts) { process.stderr.write("functions.cjs: refused: no typescript package (measured repo, ~/.local/share/dotfiles-node or NODE_PATH)\n"); return 2; }
  const ls = spawnSync("git", ["-C", checkout, "ls-tree", "-r", "-z", "--full-tree", "--name-only", tree], { encoding: "utf8", maxBuffer: 1 << 30 });
  if (ls.status !== 0) { process.stderr.write(`functions.cjs: refused: ${ls.stderr}`); return 2; }
  const paths = ls.stdout.split("\0").filter((p) => SOURCE.test(p) && !SKIP.test(p));
  const blobs = readBlobs(checkout, tree, paths);
  if (blobs.size !== paths.length) { process.stderr.write(`functions.cjs: refused: read ${blobs.size} of ${paths.length} source files\n`); return 2; }
  const fns = [], classes = [];
  for (const [p, text] of blobs) {
    const found = functionSpans(ts, p, text);
    for (const f of found.fns) fns.push([f.span, p, f.key]);
    for (const c of found.classes) classes.push([c.members, p, c.name]);
  }
  fns.sort((a, b) => b[0] - a[0]);
  classes.sort((a, b) => b[0] - a[0]);
  process.stdout.write(JSON.stringify({ files: paths.length, parsed: blobs.size, fns, classes }));
  return 0;
}

module.exports = { loadTs, functionSpans, SOURCE, SKIP, LIMIT: P.functionLimit };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
