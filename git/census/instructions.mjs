#!/usr/bin/env node
// census instructions: what the instruction text an agent loads costs, and how much of it repeats, conflicts, dangles
// or restates a hook. Deterministic and free: no model, network or dependency. HELP defines every measurement.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const HELP = `census instructions [--cwd DIR] [--home DIR] [--json] [--budget-tokens N] [--max-dup-share X]

Loaded set, as Claude Code loads it for --cwd (default $PWD) under --home (default $HOME): <home>/.claude/CLAUDE.md
and every CLAUDE.md, .claude/CLAUDE.md and CLAUDE.local.md from cwd up to /, each with recursive @includes resolved
from the including file; <home>/.claude/projects/<cwd, non-alphanumerics as ->/memory/MEMORY.md (first 200 lines);
the active directive (a rotation counts its largest variant, as a session carries one); the settings outputStyle;
and the skills catalog, one "name: description" line per user skill, user command and enabled plugin skill.
Linked set: files one relative markdown link or backticked relative path away (and each catalogued SKILL.md).

  load        lines, bytes and tokens per file; tokens = bytes / 4, an estimate rather than a tokenizer.
  rule        a sentence, list item or table row with never, always, only, must, should, do not, don't, cannot,
              avoid, prefer, keep, use, before or refuse, opening with No, or opening with an imperative verb.
  duplicate   sentences normalized (lowercase; code spans, link targets and punctuation dropped; numbers kept) with
              word 3-shingle Jaccard >= 0.5 (MinHash, 128 hashes in 32 LSH bands, exact Jaccard confirms) or TF-IDF
              cosine >= 0.6; clusters join duplicates transitively.
  dup share   loaded rule lines with a duplicate anywhere in loaded+linked, over all loaded rule lines.
  contradiction candidate   two rule lines, one loaded, with cosine >= 0.35 or a shared two-word phrase found in at
              most five sentences, and a polarity flip (never/no/not/don't/only/refuse against always/must/should or
              an imperative on the same verb, or on any verb at cosine >= 0.45), always against never on the same
              verb phrase, or different numbers before the same words. Candidates for a human, never verdicts.
  enforced    a loaded rule line sharing a hook's distinctive tokens (flags, its settings tool matcher, and words of
              its comments and strings found in at most two hooks): one flag or tool name, or three words. Hooks are
              <home>/.claude/hooks and the global git core.hooksPath.
  dangling    a link, backticked path, ~/ path, command (a code span of two or more words, or one after use, run,
              with, via or through) or [[memory]] name in the loaded set that does not resolve on this machine.
  move        drop: a loaded rule line with a duplicate in a linked file. move: a loaded rule line whose neighbours at
              cosine >= 0.35 mostly (over half, at least two) sit in one linked file.

Exit 0 measured; 1 when --budget-tokens or --max-dup-share is exceeded; 2 refused.`;

const STOP = new Set(("a an and any are as at be been but by can could do does each for from has have how i if in into " +
  "is it its may me more most my not of on one or our out so than that the their them then there these they this those " +
  "to too up us was we were what when where which while who why will with without would you your about after " +
  "before over per through under via within").split(" "));
const VERBS = new Set(("add answer ask avoid build call check choose cite commit confirm continue count create delete " +
  "deploy do drop encrypt ensure extend fetch find fix follow give keep land link list load log make mark measure merge " +
  "move name offset open pass pick prefer print prove push put read record refuse remove report resolve resume reuse run " +
  "say search send set ship spawn start state stop store switch tell test treat update use verify wait watch write").split(" "));
const TOPICLESS = new Set("never always only must should use keep make sure dont before after".split(" "));
const SUBJECT = /^(is|are|was|were|has|had|does|did|will|can|may|stays?|\w+ed)$/;
const GENERIC = new Set("use run do make keep be have get go set put take give add".split(" "));
const MODAL = /\b(never|always|only|must|should|do not|don't|cannot|can't|avoid|prefer|keep|use|before|refuse)\b|^no\b/i;
const NEG = /\b(?:never|not|no|don't|only|refuses?)\s+(?:to\s+|be\s+)?([a-z][\w-]*)(?:\s+(?:(?:a|an|the|any|[a-z]+'s)\s+)?([a-z][\w-]*))?/g;
const OBL = /\b(?:always|must|should)\s+(?:to\s+)?([a-z][\w-]*)(?:\s+(?:(?:a|an|the|any|[a-z]+'s)\s+)?([a-z][\w-]*))?/g;
const NUM = /(?<![\w.\/:#-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\w\/:-]|\.\d)/g;
const SPAN = /`([^`\n]+)`/g, LINK = /\]\(([^)\s]+)\)/g;

const read = (p) => { try { return statSync(p).isFile() ? readFileSync(p, "utf8") : null; } catch { return null; } };
const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const ls = (d) => { try { return readdirSync(d).sort().map((n) => join(d, n)); } catch { return []; } };
const json = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };
const stem = (w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tokensOf = (t) => Math.ceil(Buffer.byteLength(t) / 4);
const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);
const refuse = (why) => { console.error(`CENSUS REFUSED: ${why}`); process.exit(2); };

function options(argv) {
  const pwd = process.env.PWD && real(process.env.PWD) === real(process.cwd()) ? process.env.PWD : process.cwd();
  const o = { cwd: pwd, home: homedir(), json: false, budget: Infinity, maxDup: Infinity };
  const names = { "--cwd": "cwd", "--home": "home", "--budget-tokens": "budget", "--max-dup-share": "maxDup" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") { console.log(HELP); process.exit(0); }
    if (argv[i] === "--json") { o.json = true; continue; }
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const key = names[flag], value = inline ?? argv[++i];
    if (!key || value === undefined || value.startsWith("--")) refuse(`unknown option or missing value: ${flag}`);
    o[key] = key === "cwd" || key === "home" ? resolve(value) : Number(value);
    if (Number.isNaN(o[key])) refuse(`${flag} takes a number`);
  }
  return o;
}

function frontmatter(text) {
  const out = {}, m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
  const lines = m ? m[1].split("\n") : [];
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][-+]?$/.test(v)) for (v = ""; i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1]);) v += " " + lines[++i].trim();
    out[kv[1]] = v.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Claude Code's instruction load for one cwd, as files with their kind; the catalog keeps each line's SKILL.md. */
function loadedSet({ cwd, home }, notes) {
  const files = [], seen = new Set(), claude = join(home, ".claude");
  const add = (path, kind, text = read(path), extra = {}) => {
    const key = real(path) ?? path;
    if (text == null || seen.has(key)) return false;
    seen.add(key);
    files.push({ path, kind, text, loaded: true, ...extra });
    return true;
  };
  const withIncludes = (path, kind, depth = 0) => {
    if (!add(path, kind) || depth >= 5) return;
    const text = files.at(-1).text.replace(/```[\s\S]*?```/g, "").replace(SPAN, "");
    for (const [, ref] of text.matchAll(/(?:^|\s)@((?:~\/|\.{0,2}\/)?[\w.\/-]*\w)/g)) {
      const target = ref.startsWith("~/") ? join(home, ref.slice(2)) : resolve(dirname(path), ref);
      if (read(target) != null) withIncludes(target, "include", depth + 1);
    }
  };
  withIncludes(join(claude, "CLAUDE.md"), "user");
  for (let d = cwd; ; d = dirname(d)) {
    for (const name of ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]) withIncludes(join(d, name), "project");
    if (d === dirname(d)) break;
  }
  const memory = join(claude, "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"), "memory", "MEMORY.md");
  add(memory, "memory", read(memory)?.split("\n").slice(0, 200).join("\n"));
  const active = (read(join(claude, "directives/active")) ?? "").trim();
  const variants = active.replace(/^rotate:/, "").split(",").filter(Boolean).map((s) => join(claude, "directives/variants", `${s}.md`))
    .filter((p) => read(p) != null).sort((a, b) => read(b).length - read(a).length);
  if (variants[0]) add(variants[0], "directive");
  if (variants.length > 1) notes.push(`directive ${active}: one variant per session, counted the largest, ${basename(variants[0])}`);
  const settings = json(join(claude, "settings.json")) ?? {};
  const style = String(settings.outputStyle ?? "").toLowerCase();
  for (const p of ls(join(claude, "output-styles"))) if (style && (frontmatter(read(p)).name ?? basename(p, ".md")).toLowerCase() === style) add(p, "style");
  const installed = json(join(claude, "plugins/installed_plugins.json"))?.plugins ?? {};
  const roots = [[claude, ""], ...Object.entries(installed).filter(([id]) => settings.enabledPlugins?.[id])
    .flatMap(([id, installs]) => installs.map((i) => [i.installPath, `${id.split("@")[0]}:`]))];
  const entries = [];
  for (const [root, prefix] of roots) {
    const docs = [...ls(join(root, "skills")).map((d) => join(d, "SKILL.md")), ...(root === claude ? ls(join(root, "commands")).filter((p) => p.endsWith(".md")) : [])];
    for (const p of docs) {
      const meta = frontmatter(read(p));
      if (read(p) != null) entries.push([prefix + (meta.name ?? (basename(p) === "SKILL.md" ? basename(dirname(p)) : basename(p, ".md"))), meta.description ?? "", p]);
    }
  }
  if (entries.length) add("(skills catalog)", "catalog", entries.map(([name, d]) => `- ${name}: ${d}`).join("\n"), { refs: entries.map((e) => `${e.at(-1)}:description`), skills: entries.map((e) => e.at(-1)) });
  return { files, settings };
}

/** Where a relative reference in a loaded file can point: beside the path as loaded, beside its real file, at that
 *  file's repository root, or at the cwd. */
const TOPS = new Map();
function candidates(file, ref, { cwd, home }) {
  if (ref.startsWith("~/")) return [join(home, ref.slice(2))];
  if (isAbsolute(ref)) return [ref];
  const dirs = [dirname(file.path), dirname(real(file.path) ?? file.path), cwd];
  if (!TOPS.has(dirs[1])) TOPS.set(dirs[1], spawnSync("git", ["-C", dirs[1], "rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout?.trim());
  return [...new Set([...dirs, TOPS.get(dirs[1]) || cwd])].map((d) => resolve(d, ref));
}

function linkedSet(loaded, opts) {
  const out = [], seen = new Set(loaded.map((f) => real(f.path) ?? f.path));
  for (const f of loaded) {
    const refs = [...f.text.matchAll(LINK)].map((m) => m[1].split("#")[0]).filter((r) => r && !/^[a-z]+:/i.test(r));
    refs.push(...[...f.text.matchAll(SPAN)].map((m) => m[1]).filter((r) => /^[\w.~\/-]+\.(md|txt)$/.test(r)));
    for (const ref of refs.concat(f.skills ?? [])) {
      const target = candidates(f, ref, opts).find((p) => read(p) != null);
      const key = target && real(target);
      if (key && !seen.has(key) && /\.(md|txt)$/.test(target)) { seen.add(key); out.push({ path: target, kind: "linked", text: read(target), loaded: false }); }
    }
  }
  return out;
}

const normalize = (t) => t.replace(SPAN, " ").replace(/\]\([^)]*\)|\[\[[^\]]*\]\]/g, "]").replace(/https?:\/\/\S+/g, " ").toLowerCase()
  .replace(/(\d),(\d)/g, "$1$2").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Sentences, list items and table rows outside code fences and front matter, with their rule flag. */
function segment(files) {
  const units = [];
  files.forEach((file) => {
    let fence = false, heading = "";
    const lines = file.text.split("\n"), front = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
    lines.forEach((raw, i) => {
      if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
      if (!fence && /^#+\s/.test(raw)) heading = raw;
      if (fence || i <= front || /^\s*(```|~~~|#|\|?\s*:?-{3,})/.test(raw) || !raw.trim()) return;
      const body = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim();
      const table = body.startsWith("|"), parts = table ? [body] : body.split(/(?<=[.!?])\s+(?=[A-Z`"(\[])|;\s+(?=\[)/);
      for (const text of parts) {
        const norm = normalize(text), words = norm.split(" ").filter(Boolean);
        if (!words.length) continue;
        const [opener, next = ""] = table ? [] : text.toLowerCase().split(/\s+/);
        const imperative = VERBS.has(opener) && !SUBJECT.test(next);
        units.push({ file, ref: file.refs?.[i] ?? `${file.path}:${i + 1}`, text, norm, words, imperative,
          banned: /\b(never|don't|do not|avoid)\b/i.test(heading), loaded: file.loaded, rule: file.kind !== "catalog" && (MODAL.test(text) || imperative || MODAL.test(heading)) });
      }
    });
  });
  return units;
}

const mix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };
const SEEDS = Array.from({ length: 128 }, (_, k) => mix(k + 0x9e3779b9));

/** Near-duplicate pairs (one side loaded) by MinHash-LSH with exact Jaccard >= 0.5 over word 3-shingles. */
function minhashPairs(units) {
  const buckets = new Map(), pairs = new Map();
  units.forEach((u, id) => {
    u.shingles = new Set(u.words.slice(2).map((w, i) => fnv(`${u.words[i]} ${u.words[i + 1]} ${w}`)));
    if (u.shingles.size < 3) return;
    const sig = SEEDS.map((seed) => { let m = 0xffffffff; for (const s of u.shingles) m = Math.min(m, mix(s ^ seed)); return m; });
    for (let b = 0; b < 32; b++) { const key = `${b}:${sig.slice(b * 4, b * 4 + 4).join(",")}`; push(buckets, key, id); }
  });
  for (const ids of buckets.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const [a, b] = [units[ids[i]], units[ids[j]]], key = `${ids[i]}-${ids[j]}`;
    if (pairs.has(key) || !(a.loaded || b.loaded) || a.norm === b.norm && a.ref === b.ref) continue;
    let shared = 0;
    for (const s of a.shingles) shared += b.shingles.has(s);
    const jaccard = shared / (a.shingles.size + b.shingles.size - shared);
    if (jaccard >= 0.5) pairs.set(key, [ids[i], ids[j], +jaccard.toFixed(3)]);
  }
  return [...pairs.values()];
}

const cosine = (a, b) => { let s = 0; for (const [t, w] of a) s += w * (b.get(t) ?? 0); return s; };
const words = (vec) => [...vec.keys()].filter((t) => !/^\d+$/.test(t));
const pointsAt = (u, v) => [...u.text.matchAll(/\]\(([^)#\s]+)|\[\[([^\]]+)\]\]/g)].some((m) => basename(m[1] ?? `${m[2]}.md`) === basename(v.file.path));

/** TF-IDF vectors over content words, and every loaded unit's neighbours at cosine >= 0.35 through an inverted index
 *  of terms found in at most 2% of sentences (pairs sharing only common terms are never that close). Returns the
 *  vectorizer, so other text is weighted by the same corpus. */
function tfidf(units) {
  const df = new Map(), postings = new Map(), N = units.length;
  const termsOf = (norm) => norm.split(" ").filter((w) => w.length > 1 && !STOP.has(w) && !TOPICLESS.has(w)).map(stem);
  const vector = (terms) => {
    const vec = new Map();
    terms.forEach((t) => vec.set(t, (vec.get(t) ?? 0) + Math.log(N / (df.get(t) ?? 1))));
    const norm = Math.hypot(...vec.values()) || 1;
    vec.forEach((w, t) => vec.set(t, w / norm));
    return vec;
  };
  units.forEach((u) => { u.terms = termsOf(u.norm); new Set(u.terms).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)); });
  units.forEach((u, id) => {
    u.vec = vector(u.terms);
    if (u.vec.size >= 3) for (const t of u.vec.keys()) if (df.get(t) <= Math.max(20, N * 0.02)) push(postings, t, id);
  });
  units.forEach((u, id) => {
    u.near = [];
    if (!u.loaded || u.vec.size < 3) return;
    const seen = new Set([id]);
    for (const t of u.vec.keys()) for (const other of postings.get(t) ?? []) {
      if (seen.has(other)) continue;
      seen.add(other);
      const c = cosine(u.vec, units[other].vec);
      if (c >= 0.35 && !pointsAt(u, units[other]) && !pointsAt(units[other], u)) u.near.push([other, +c.toFixed(3)]);
    }
  });
  return (text) => vector(termsOf(normalize(text)));
}

/** Clusters over MinHash and TF-IDF duplicate edges; a pointer and the file it points at are never duplicates. */
function duplication(units, minhash) {
  const parent = units.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = new Map(minhash.filter(([a, b]) => !pointsAt(units[a], units[b]) && !pointsAt(units[b], units[a])).map(([a, b, j]) => [`${a}-${b}`, [a, b, `jaccard ${j}`]]));
  const byMinhash = edges.size;
  units.forEach((u, a) => u.near.forEach(([b, c]) => c >= 0.6 && !edges.has(`${Math.min(a, b)}-${Math.max(a, b)}`) && edges.set(`${Math.min(a, b)}-${Math.max(a, b)}`, [a, b, `cosine ${c}`])));
  const partners = new Map();
  for (const [a, b, how] of edges.values()) {
    parent[find(a)] = find(b);
    for (const [x, y] of [[a, b], [b, a]]) push(partners, x, [y, how]);
  }
  const groups = new Map();
  for (const id of partners.keys()) push(groups, find(id), id);
  const rules = units.map((u, id) => [u, id]).filter(([u]) => u.loaded && u.rule), dup = rules.filter(([, id]) => partners.has(id));
  const clusters = [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0])
    .map((ids) => ids.sort((a, b) => a - b).map((id) => ({ ref: units[id].ref, text: units[id].text })));
  return { partners, minhash_pairs: byMinhash, tfidf_pairs: edges.size - byMinhash,
    rules: rules.length, rules_with_duplicate: dup.length, share: rules.length ? +(dup.length / rules.length).toFixed(4) : 0, clusters };
}

function polarity({ text, imperative, banned }) {
  const t = text.replace(/`/g, "").toLowerCase(), keys = (re) => [...t.matchAll(re)].filter((m) => !STOP.has(m[1]))
    .map((m) => (GENERIC.has(m[1]) && m[2] && !STOP.has(m[2]) ? `${m[1]} ${m[2]}` : m[1]));
  const opener = /^[|\s]*([a-z]+)\s+(?:(?:a|an|the|any|[a-z]+'s)\s+)?([a-z][\w-]*)?/.exec(t);
  const obl = keys(OBL), neg = keys(NEG), verb = opener && (GENERIC.has(opener[1]) && opener[2] ? `${opener[1]} ${opener[2]}` : opener[1]);
  if (opener && (imperative || banned)) (banned ? neg : obl).push(verb);
  return { neg, obl, never: [...t.matchAll(/\bnever\s+([a-z]+\s+[a-z]+)/g)].map((m) => m[1]), always: [...t.matchAll(/\balways\s+([a-z]+\s+[a-z]+)/g)].map((m) => m[1]) };
}

function numbers(text) {
  return [...text.matchAll(NUM)].filter((m) => !/^(19|20)\d\d$/.test(m[1]) && !/\b(rules?|steps?|pr|issue|v)\s*$/i.test(text.slice(0, m.index)))
    .map((m) => ({ n: m[1].replace(/,/g, ""), words: new Set((text.slice(m.index + m[0].length).split(/[;:,.()|]/)[0].toLowerCase().match(/[a-z][a-z-]*/g) ?? [])
      .filter((w) => !STOP.has(w)).slice(0, 2).map(stem)) }));
}

/** Rule pairs, one loaded, that are topically close and flip polarity, oppose always/never, or disagree on a number. */
function contradictions(units) {
  const rare = new Map(), out = [], seen = new Set();
  units.forEach((u, id) => { u.bigrams = new Set(u.terms.slice(1).map((t, i) => `${u.terms[i]} ${t}`)); if (u.rule) u.bigrams.forEach((b) => push(rare, b, id)); });
  units.forEach((u, a) => {
    if (!u.loaded || !u.rule) return;
    const close = new Map(u.near.filter(([b]) => units[b].rule));
    u.bigrams.forEach((g) => { const ids = rare.get(g); if (ids.length <= 5) ids.forEach((b) => b !== a && !close.has(b) && close.set(b, `"${g}"`)); });
    for (const [b, why] of close) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`, v = units[b];
      if (seen.has(key) || u.norm === v.norm) continue;
      seen.add(key);
      const [p, q] = [polarity(u), polarity(v)], reasons = [];
      for (const [x, y] of [[p, q], [q, p]]) {
        const phrase = x.never.find((k) => y.always.includes(k));
        if (phrase) reasons.push(`always/never "${phrase}"`);
        const verb = !phrase && x.neg.find((k) => y.obl.includes(k));
        if (verb) reasons.push(`polarity flip on "${verb}"`);
        else if (!phrase && x.neg.length && y.obl.length && why >= 0.45) reasons.push(`prohibition "${x.neg[0]}" against obligation "${y.obl[0]}" on one topic`);
      }
      for (const m of numbers(u.text)) for (const n of numbers(v.text)) {
        const same = [...m.words].filter((w) => n.words.has(w));
        if (m.n !== n.n && same.some((w) => w.length >= 4)) reasons.push(`number ${m.n} vs ${n.n} on "${same.join(" ")}"`);
      }
      if (reasons.length) out.push({ reasons: [...new Set(reasons)], closeness: typeof why === "number" ? `cosine ${why}` : `shared ${why}`,
        cosine: typeof why === "number" ? why : 0, a: { ref: u.ref, text: u.text }, b: { ref: v.ref, text: v.text } });
    }
  });
  return out.sort((x, y) => y.cosine - x.cosine);
}

/** Loaded rule lines a hook restates: one of its strong tokens (a flag in its header or messages, its own name, the
 *  tool its PreToolUse matcher names) found in at most two hooks, or a clause of the line close to a sentence or line
 *  of the hook's comments, docstrings or messages: cosine >= 0.5 sharing two words, or >= 0.4 sharing three, numbers aside. */
function enforced(units, { home }, settings, vectorize) {
  const dirs = [join(home, ".claude/hooks")], FLAG = /(?<![\w-])--[a-z][a-z0-9-]{2,}/g;
  const git = spawnSync("git", ["config", "--global", "--path", "--get", "core.hooksPath"], { encoding: "utf8", env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") } });
  if (git.stdout?.trim()) dirs.push(git.stdout.trim());
  const tools = new Map();
  for (const { matcher = "", hooks = [] } of settings.hooks?.PreToolUse ?? []) for (const h of hooks) {
    const name = basename(String(h.command ?? "").split(/\s/)[0]);
    for (const tool of matcher.split("|").filter((t) => /^[A-Z][A-Za-z]+$/.test(t) && t !== "Bash")) (tools.get(name) ?? tools.set(name, new Set()).get(name)).add(tool);
  }
  const hooks = dirs.flatMap(ls).filter((p) => !/\.(pyc|md)$/.test(p) && read(p) != null).map((p) => {
    const src = read(p), name = basename(p);
    const header = [...src.matchAll(/^[ \t]*(?:#(?!!)|\/\/) ?([^\n]*)|"""([\s\S]*?)"""/gm)].map((m) => m[1] ?? m[2]).join("\n");
    const prose = `${header}\n\n${[...src.matchAll(/"([^"\n]{30,})"|'([^'\n]{30,})'|<<-?\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\3/g)].map((m) => m[1] ?? m[2] ?? m[4]).join("\n\n")}`;
    const sentences = prose.split(/(?<=[.!?])\s+|\n/).map((t) => t.trim()).filter((t) => t.split(" ").length >= 2);
    const strong = new Set([...prose.matchAll(FLAG)].map((m) => m[0]).filter((f) => !/^--(help|version|json|verbose|quiet)$/.test(f)));
    strong.add(name.replace(/\.\w+$/, "")); tools.get(name)?.forEach((t) => strong.add(t));
    return { hook: `${basename(dirname(p))}/${name}`, strong, sentences: sentences.map((text) => ({ text, vec: vectorize(text) })).filter((x) => words(x.vec).length >= 4) };
  });
  const df = new Map();
  hooks.forEach((h) => h.strong.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const out = [];
  for (const u of units.filter((x) => x.loaded && x.rule)) {
    const tokens = new Set([...u.text.toLowerCase().matchAll(/[a-z][\w-]*[a-z0-9]/g), ...u.text.matchAll(FLAG), ...u.text.matchAll(/\b[A-Z][A-Za-z]+(?= tool\b)|(?<=`)[A-Z][A-Za-z]+(?=`)/g)].map((m) => m[0]));
    const clauses = [...u.text.split(/[;:|]\s*|\s+—\s+/), ...u.text.split(/[;:|,]\s*|\s+—\s+/)].map(vectorize).filter((c) => words(c).length >= 2);
    for (const h of hooks) {
      const strong = [...h.strong].filter((t) => df.get(t) <= 2 && tokens.has(t));
      const best = clauses.flatMap((c) => h.sentences.map((s) => [cosine(c, s.vec), s.text, words(c).filter((t) => s.vec.has(t)).length]))
        .filter(([c, , shared]) => c >= 0.5 && shared >= 2 || c >= 0.4 && shared >= 3).sort((a, b) => b[0] - a[0])[0];
      if (strong.length || best) out.push({ ref: u.ref, hook: h.hook, by: strong.length ? strong.join(", ") : `cosine ${best[0].toFixed(2)}: ${best[1]}`, text: u.text });
    }
  }
  return { hooks: hooks.length, lines: out };
}

/** Links, paths, commands and [[memory]] names in the loaded set that do not resolve on this machine. */
function dangling(loaded, opts) {
  const out = [], commands = new Map();
  const memory = join(opts.home, ".claude/projects", opts.cwd.replace(/[^A-Za-z0-9]/g, "-"), "memory");
  for (const f of loaded) f.text.split("\n").forEach((line, i) => {
    const ref = f.refs?.[i] ?? `${f.path}:${i + 1}`, miss = (kind, target) => out.push({ ref, kind, target });
    const exists = (r) => candidates(f, r, opts).some((p) => real(p));
    for (const [, l] of line.matchAll(LINK)) { const t = l.split("#")[0]; if (t && !/^[a-z]+:/i.test(t) && !exists(t)) miss("link", t); }
    for (const [, m] of line.matchAll(/\[\[([^\]]+)\]\]/g)) if (!real(join(memory, `${m}.md`))) miss("memory", m);
    const spans = [...line.matchAll(SPAN)];
    for (const [, s] of spans) if (/^[\w.~\/-]+$/.test(s) && /^[~.\/]|\/.*\/|\.(md|sh|py|mjs|cjs|js|json|ya?ml|toml|html)$/.test(s) && !/^\/[a-z]+$/.test(s) && !exists(s)) miss("path", s);
    for (const [, p] of line.replace(SPAN, "").matchAll(/(?:^|[\s(])(~\/[\w.\/-]*[\w\/])/g)) if (!exists(p)) miss("path", p);
    for (const m of spans) {
      const cmd = /^([a-z][\w.-]*)\s+(?:--?\w|[a-z][\w|-]*(?:\s|$)|<)/.exec(m[1])?.[1] ??
        (/\b(use|run|with|via|through)\s+$/i.test(line.slice(0, m.index)) && /^[a-z][\w.-]*$/.test(m[1]) ? m[1] : null);
      if (cmd && !STOP.has(cmd)) push(commands, cmd, ref);
    }
  });
  const names = [...commands.keys()];
  const run = spawnSync("sh", ["-c", 'for c do command -v -- "$c" >/dev/null 2>&1 || printf "%s\\n" "$c"; done', "sh", ...names], { encoding: "utf8" });
  for (const cmd of (run.stdout ?? "").split("\n").filter(Boolean)) for (const ref of commands.get(cmd)) out.push({ ref, kind: "command", target: cmd });
  return out;
}

function moves(units, dup) {
  const drop = [], move = [];
  units.forEach((u, id) => {
    if (!u.loaded || !u.rule) return;
    const copy = (dup.partners.get(id) ?? []).find(([other]) => !units[other].loaded);
    if (copy) return drop.push({ ref: u.ref, copy: units[copy[0]].ref, by: copy[1], text: u.text });
    const files = new Map();
    u.near.forEach(([other]) => files.set(units[other].file, (files.get(units[other].file) ?? 0) + 1));
    const [file, n] = [...files].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (file && !file.loaded && n >= 2 && n > u.near.length / 2) move.push({ ref: u.ref, to: file.path, neighbours: `${n}/${u.near.length}`, text: u.text });
  });
  return { drop, move };
}

function measure(opts) {
  const started = Date.now(), notes = [];
  const { files: loaded, settings } = loadedSet(opts, notes);
  if (!loaded.length) refuse(`no instruction file loads for ${opts.cwd} under ${opts.home}`);
  const linked = linkedSet(loaded, opts), units = segment([...loaded, ...linked]);
  const minhash = minhashPairs(units);
  const vectorize = tfidf(units);
  const dup = duplication(units, minhash);
  const size = (fs) => ({ files: fs.length, lines: fs.reduce((s, f) => s + f.text.split("\n").length, 0), bytes: fs.reduce((s, f) => s + Buffer.byteLength(f.text), 0), tokens: fs.reduce((s, f) => s + tokensOf(f.text), 0) });
  const totals = { loaded: { ...size(loaded), rules: dup.rules }, linked: size(linked) };
  const perFile = loaded.map((f) => ({ path: f.path, kind: f.kind, lines: f.text.split("\n").length, bytes: Buffer.byteLength(f.text), tokens: tokensOf(f.text),
    share: +(tokensOf(f.text) / totals.loaded.tokens).toFixed(4), rules: units.filter((u) => u.file === f && u.rule).length }));
  const { partners, ...duplicationRecord } = dup;
  return { cwd: opts.cwd, home: opts.home, notes, totals, files: perFile, linked: linked.map((f) => f.path), duplication: duplicationRecord,
    contradictions: contradictions(units), enforced: enforced(units, opts, settings, vectorize), dangling: dangling(loaded, opts), move: moves(units, dup), ms: Date.now() - started };
}

function report(r) {
  const short = (t, n = 110) => (t.length > n ? `${t.slice(0, n - 1)}…` : t), home = (p) => p.replace(r.home, "~");
  const top = (title, list, row, n = 10) => [`\n${title}: ${list.length}${list.length > n ? ` (top ${n}; --json for all)` : ""}`, ...list.slice(0, n).map(row)];
  const l = r.totals.loaded, k = r.totals.linked, d = r.duplication;
  console.log([`census instructions  cwd ${r.cwd}  (tokens = bytes/4)`, ...r.notes.map((n) => `note: ${n}`),
    `\nLOAD  loaded ${l.files} files, ${l.lines} lines, ${l.bytes} bytes, ${l.tokens} tokens, ${l.rules} rule lines; linked ${k.files} files, ${k.lines} lines, ${k.tokens} tokens`,
    "  tokens  share  lines  rules  kind       path",
    ...r.files.map((f) => `  ${String(f.tokens).padStart(6)}  ${(f.share * 100).toFixed(1).padStart(4)}%  ${String(f.lines).padStart(5)}  ${String(f.rules).padStart(5)}  ${f.kind.padEnd(9)}  ${home(f.path)}`),
    `\nDUPLICATION  share ${(d.share * 100).toFixed(1)}% = ${d.rules_with_duplicate}/${d.rules} loaded rule lines have a near-duplicate; ${d.minhash_pairs} MinHash pairs, ${d.tfidf_pairs} TF-IDF pairs, ${d.clusters.length} clusters`,
    ...top("clusters", d.clusters, (c) => `  [${c.length}] ${c.map((m) => home(m.ref)).join("  ")}\n        ${short(c[0].text)}`),
    ...top("CONTRADICTION CANDIDATES (for a human to judge, not verdicts)", r.contradictions, (c) => `  ${c.reasons.join("; ")} (${c.closeness})\n    ${home(c.a.ref)}: ${short(c.a.text)}\n    ${home(c.b.ref)}: ${short(c.b.text)}`),
    ...top(`ENFORCED BY HOOK (${r.enforced.hooks} hooks read)`, r.enforced.lines, (e) => `  ${home(e.ref)}  ${e.hook} [${short(e.by, 90)}]\n    ${short(e.text)}`, 20),
    ...top("DANGLING", r.dangling, (x) => `  ${home(x.ref)}  ${x.kind} ${x.target}`, 40),
    ...top("MOVE: drop (a linked doc already has it)", r.move.drop, (x) => `  ${home(x.ref)} = ${home(x.copy)} (${x.by})\n    ${short(x.text)}`),
    ...top("MOVE: move (its topic lives in one linked doc)", r.move.move, (x) => `  ${home(x.ref)} -> ${home(x.to)} (${x.neighbours} neighbours)\n    ${short(x.text)}`),
    `\nmeasured in ${r.ms} ms`].join("\n"));
}

const opts = options(process.argv.slice(2));
const result = measure(opts);
if (opts.json) console.log(JSON.stringify(result, null, 1)); else report(result);
const over = [result.totals.loaded.tokens > opts.budget && `loaded tokens ${result.totals.loaded.tokens} exceed --budget-tokens ${opts.budget}`,
  result.duplication.share > opts.maxDup && `duplication share ${result.duplication.share} exceeds --max-dup-share ${opts.maxDup}`].filter(Boolean);
over.forEach((why) => console.error(`census instructions: ${why}`));
process.exit(over.length ? 1 : 0);
