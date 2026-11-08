"""Process-guard rule prod-d1-read: no unbounded read against a production Cloudflare D1 database.

A statement that reads about 240k rows within a second overloads D1 ("D1 DB is overloaded. Too many resources
consumed within a 10 second window"), and D1 then refuses every query for 7-16 s: on 2026-11-07 a GROUP BY over
one table read 473k rows and failed 37 production requests. The SQL is judged statically, with no network at hook
time: a SELECT needs a final LIMIT of at most MAX_ROWS rows (offset included), and an aggregate, GROUP BY, ORDER BY
or DISTINCT also needs a WHERE equality on an id key (`id` or `*_id` against a literal or a parameter, or IN (...)).
EXPLAIN, PRAGMA and writes pass (production writes go through deploy). SQL the guard cannot read is refused.
Production: `wrangler d1 execute --remote` through any wrapper, unless the database name or --env names staging,
dev, test or preview; and every call to the D1 API's /query or /raw: from curl, wget or httpie, or from an
interpreter (-c, a heredoc, or an ad-hoc script process_guard reads) whose code names that path or an SDK's
`.d1.database.query(`, with the SQL in its arguments, body or code. The owner can allow it for a session with CC_ALLOW_D1_SCAN=1 (logged).
"""
import json
import os
import re

MAX_ROWS = 1000
D1_API = re.compile(r"/d1/database/[^/\s\"']+/(?:query|raw)\b|\.d1\.database\.(?:query|raw)\(")
NON_PROD = re.compile(r"(?:^|[-_.])(?:staging|stage|dev|test|preview)(?:$|[-_.])", re.I)
INTERPRETERS = re.compile(r"^(?:python[0-9.]*|node|bun|deno|tsx|ruby|perl)$")
SQL_START = re.compile(r"^\s*(?:SELECT|WITH|VALUES|EXPLAIN|PRAGMA|INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b", re.I)
WHOLE = re.compile(r"\b(?:count|sum|avg|min|max|total|group_concat)\s*\(|\bGROUP\s+BY\b|\bORDER\s+BY\s+(?!(?:\w+\.)?(?:rowid|id)\b)|\bDISTINCT\b", re.I)
KEYED = re.compile(r"\bWHERE\b.*?\b(?:id|\w+_id)\s*(?:=\s*(?:\?|:\w|''|\d)|IN\s*\(\s*(?:\?|:\w|''|\d))", re.I | re.S)
LIMIT = re.compile(r"\bLIMIT\s+(\d+)(?:\s*,\s*(\d+)|\s+OFFSET\s+(\d+))?\s*$", re.I)
VALUE_OPTS = {"--command", "--file", "--env", "-e", "--config", "-c", "--persist-to"}


def heavy(stmt):
    """Why one SQL statement reads too much, or None."""
    flat = re.sub(r"'(?:[^']|'')*'", "''", re.sub(r"--[^\n]*|/\*.*?\*/", " ", stmt, flags=re.S)).strip()
    if not re.match(r"(?:SELECT|WITH|VALUES)\b", flat, re.I):
        return None
    whole = WHOLE.search(flat)
    if whole and not KEYED.search(flat):
        return f"`{whole.group(0).strip().replace('(', '()')}` with no WHERE equality on an id key reads every row"
    m = LIMIT.search(flat)
    rows = m and (int(m.group(2)) + int(m.group(1)) if m.group(2) else int(m.group(1)) + int(m.group(3) or 0))
    return None if m and rows <= MAX_ROWS else "it has no final LIMIT" if not m else f"LIMIT reaches {rows} rows"


def sql_in(text):
    """SQL statements in a word or file: a D1 JSON body's "sql" fields, or the text itself."""
    try:
        body = json.loads(text)
    except ValueError:
        return [text] if SQL_START.match(text) else []
    found = []
    for item in body if isinstance(body, list) else [body]:
        if isinstance(item, dict):
            found += [item["sql"]] if isinstance(item.get("sql"), str) else sql_in(json.dumps(item.get("batch", [])))
    return found


def wrangler_d1(argv):
    """(database, --env, --command, --file) of a remote `wrangler d1 execute`, else None."""
    i = next((k for k, w in enumerate(argv) if re.match(r"wrangler(?:@\S*)?$", os.path.basename(w))), None)
    if i is None or argv[i + 1:i + 3] != ["d1", "execute"] or "--remote" not in argv:
        return None
    opts, db, args, k = {}, None, argv[i + 3:], 0
    while k < len(args):
        name, eq, value = args[k].partition("=")
        if name in VALUE_OPTS:
            opts[name] = value if eq else (args[k + 1] if k + 1 < len(args) else "")
            k += 1 if eq else 2
            continue
        db = db or (None if name.startswith("-") else name)
        k += 1
    return db or "", opts.get("--env") or opts.get("-e") or "", opts.get("--command"), opts.get("--file")


def rule_prod_d1_read(cmd, read_local, script_text):
    """read_local and script_text are process_guard's file readers: any path, and ad-hoc scripts only."""
    sqls, where = None, None
    remote = wrangler_d1(cmd.argv) if cmd.argv else None
    if remote:
        db, env, command, path = remote
        if NON_PROD.search(env or db):  # --env production outranks a staging-looking name
            return None
        sqls = [command] if command else (sql_in(read_local(path, cmd.cwd, cmd.env) or "") if path else [])
        where = f"wrangler d1 execute {db} --remote"
    elif cmd.prog in ("curl", "wget", "http", "https", "xh") and any(D1_API.search(w) for w in cmd.argv):
        bodies = [read_local(w[1:], cmd.cwd, cmd.env) or "" if w.startswith("@") else w for w in cmd.argv[1:]]
        sqls = [s for b in bodies + cmd.heredocs for s in sql_in(b)]
        where = "the D1 query API"
    elif cmd.argv and INTERPRETERS.match(os.path.basename(cmd.argv[0])):
        args = cmd.argv[1:]
        code = [args[k + 1] for k, a in enumerate(args[:-1]) if a in ("-c", "-e", "--eval")] + cmd.heredocs
        script = next((a for a in args if not a.startswith("-") and a not in code), None)
        code += [script_text(script, cmd.cwd, cmd.env, cmd.ctx) or ""] if script else []
        if not any(D1_API.search(c) for c in code):
            return None
        sqls = [s for a in args for s in sql_in(a)] or re.findall(r"\bSELECT\b[^\"'`;]*?\bFROM\b[^\"'`;]*", "\n".join(code), re.I)
        where = f"{script or cmd.argv[0]}, which calls the D1 query API"
    if where is None:
        return None
    statements = [s for sql in sqls for s in re.split(r";(?=(?:[^']*'[^']*')*[^']*$)", sql) if s.strip()]
    why = next(((s, w) for s in statements for w in [heavy(s)] if w), None)
    if statements and not why:
        return None
    shown, cause = (" ".join(why[0].split())[:160], why[1]) if why else ("", "the guard cannot read its SQL")
    return ("prod-d1-read", "unbounded read of production D1",
            f"This command reads production D1 through {where}, and {cause}{f': `{shown}`' if shown else ''}. Production "
            f"D1 overloads on one large read and then refuses every query for 7-16 s (37 failed requests on 2026-11-07). "
            f"Add LIMIT <= {MAX_ROWS}, or use a bounded indexed lookup (`WHERE id = ? LIMIT 1`); count or group a key range "
            "(`WHERE <id> = ?`), not the whole table, and page larger reads by key. Put the SQL in --command or the "
            "command's arguments so the guard can read it. The owner can allow it for a session with CC_ALLOW_D1_SCAN=1 "
            "(logged).", "CC_ALLOW_D1_SCAN")
