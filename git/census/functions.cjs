#!/usr/bin/env node
// Source declarations from TypeScript and Python ASTs, shared by the ratchets and census.
//
// A function is a declaration, method, arrow, function expression, constructor or accessor; its span is the lines from
// its first token to its last. It is named by declaration, by the variable or property it is assigned to, or by the
// call it is passed to. A class's size is its member count.
//
// Internal: functions.cjs <checkout> reads JSON [{file,text}] on stdin; prints
// {files, parsed, fns: [[span, path, name]], classes: [[members, path, name]], exports: [[line, column, path, name]]}
// over every source file outside tests (patterns.json), and exits 2 when no typescript package can be loaded or a file
// could not be read: a scan that read nothing is refused, never reported as 0.
"use strict";
const { spawnSync } = require("child_process");
const { readFileSync } = require("fs");
const os = require("os"), path = require("path");
const P = require("./patterns.json");
const SOURCE = new RegExp(P.functionSource), SKIP = new RegExp(P.skip);

function pythonSpans(items) {
  const run = spawnSync("python3", [path.join(__dirname, "python_functions.py")], {
    input: JSON.stringify(items), encoding: "utf8", maxBuffer: 1 << 30,
  });
  if (run.status !== 0) throw new Error(run.stderr || run.error || "Python parser failed");
  return JSON.parse(run.stdout);
}

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
  if (file.endsWith(".py")) return pythonSpans([{ file, text }])[0];
  const fns = [], classes = [], exports = [];
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
    // The compiler resolves each binding back to its declaration, including nested destructuring.
    if (ts.isIdentifier(n) && ts.isDeclarationName(n)) {
      const root = ts.getRootDeclaration(n.parent);
      const variable = ts.isVariableDeclaration(root);
      const statement = variable ? root.parent.parent : root;
      const supported = variable ? root.parent.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)
        : ts.isFunctionDeclaration(root) || ts.isClassDeclaration(root) || ts.isInterfaceDeclaration(root)
          || ts.isTypeAliasDeclaration(root) || ts.isEnumDeclaration(root);
      if (supported && statement.parent === sf && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        const position = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        exports.push({ name: n.text, line: position.line + 1, column: position.character + 1 });
      }
    }
    if (ts.isFunctionLikeDeclaration(n))
      fns.push({ key: keyOf(n), span: line(n.end) - line(n.getStart(sf)) + 1 });
    if (ts.isClassDeclaration(n)) classes.push({ name: n.name ? n.name.getText(sf) : "<anonymous>", members: n.members.length });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { fns, classes, exports };
}

// Private census subprocess: the owner supplies blobs once, including sparse checkout paths.
function main([checkout]) {
  const ts = loadTs([checkout]);
  const items = JSON.parse(readFileSync(0, "utf8"));
  if (!Array.isArray(items) || items.some((v) => typeof v.file !== "string" || typeof v.text !== "string"))
    throw new Error("functions.cjs: refused: expected file/text blobs");
  if (!ts && items.some(({ file }) => !file.endsWith(".py")))
    throw new Error("functions.cjs: refused: no typescript package (measured repo, ~/.local/share/dotfiles-node or NODE_PATH)");
  const fns = [], classes = [], exports = [];
  const python = items.filter(({ file }) => file.endsWith(".py"));
  const parsedPython = pythonSpans(python);
  const pythonByFile = new Map(python.map(({ file }, i) => [file, parsedPython[i]]));
  for (const { file: p, text } of items) {
    const found = pythonByFile.get(p) || functionSpans(ts, p, text);
    for (const f of found.fns) fns.push([f.span, p, f.key]);
    for (const c of found.classes) classes.push([c.members, p, c.name]);
    for (const declaration of found.exports || []) exports.push([declaration.line, declaration.column, p, declaration.name]);
  }
  fns.sort((a, b) => b[0] - a[0]);
  classes.sort((a, b) => b[0] - a[0]);
  process.stdout.write(JSON.stringify({ files: items.length, parsed: items.length, fns, classes, exports }));
  return 0;
}

module.exports = { loadTs, functionSpans, SOURCE, SKIP, LIMIT: P.functionLimit };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
