"""Classification shared by census and the ratchets; patterns.json owns the definitions."""
import io
import json
import os
import re
import tokenize

_P = json.load(open(os.path.join(os.path.dirname(os.path.realpath(__file__)), "patterns.json")))

LOGIC = re.compile(_P["logic"])
WORKFLOW = re.compile(_P["workflow"])
EXEMPT = re.compile(_P["exempt"])
TEST = re.compile(_P["test"])
SOURCE = re.compile(_P["source"])
FUNCTION_SOURCE = re.compile(_P["functionSource"])
SKIP = re.compile(_P["skip"])
DECLARATION = re.compile(_P["declaration"])
CONVENTION = frozenset(_P["conventionNames"])
HISTORY = tuple(_P["history"])
TRIVIAL = re.compile(_P["trivial"])
SHEBANG = re.compile(_P["shebang"])
WINDOW = _P["window"]
FILE_LIMIT = _P["fileLimit"]
GROWTH_LIMIT = _P["growthLimit"]
TOKENS_PER_LINE = _P["tokensPerLine"]
LINE_LIMIT = _P["lineLimit"]
FUNCTION_LIMIT = _P["functionLimit"]
CLASS_MEMBERS = _P["classMembers"]
FILE_HUG = tuple(_P["fileHug"])
FUNCTION_HUG = tuple(_P["functionHug"])


def logic(path, head=None):
    """A file whose lines count toward production size: logic or a workflow, and not a test, declaration, vendored path or dated record.

    An extensionless file (bin/tool, git/hooks/pre-commit) is logic when its first line runs an interpreter; `head` is
    its first bytes, and without them such a file is only a candidate (see `candidate`)."""
    named = LOGIC.search(path) or WORKFLOW.search(path)
    return bool((named or (head is not None and extensionless(path) and SHEBANG.match(head)))
                and not EXEMPT.search(path) and not history(path))


def candidate(path):
    """A path that is logic by name, or extensionless and so logic if its first line is an interpreter: read its head."""
    return logic(path) or bool(extensionless(path) and not EXEMPT.search(path) and not history(path))


def extensionless(path):
    name = path.rsplit("/", 1)[-1]
    return bool(name) and "." not in name


def head_of(data):
    return data[:200].decode(errors="replace")


def source(path):
    """A TypeScript or JavaScript file outside tests: the duplication/export population."""
    return bool(SOURCE.search(path) and not SKIP.search(path) and not history(path))


def function_source(path):
    """A supported AST source outside tests, including Python."""
    return bool(FUNCTION_SOURCE.search(path) and not SKIP.search(path) and not history(path))


def history(path):
    """Dated history records what was true on its day; doc checks never count it."""
    return path.startswith(HISTORY) or "/archive/" in path or "/fixtures/" in path or path.endswith("CHANGELOG.md")


def generated(head):
    """Opening marker comments, excluding quoted source and documentary mentions."""
    for line in head.splitlines():
        comment = re.match(r"^\s*(?://|#|/\*+|\*|--|<!--)\s*(.*)", line)
        if not comment and line.strip():
            return False
        if comment and re.match(r"(?:@generated\b|DO NOT EDIT\b|Code generated\b.*\bDO NOT EDIT\b)", comment[1]):
            return True
    return False


def line_count(data):
    """Lines in a blob: newlines, plus one for a last line without one."""
    return data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)


TOKEN = re.compile(r"\w+|[^\w\s]")
HASH_STYLE = re.compile(r"py|python[0-9.]*|sh|bash|zsh|dash|rb|ruby|perl|ya?ml")
# Comment syntax per style: one regex whose `c` group is a comment; any other match is a string literal (a shell heredoc's
# body included) and stays code. Regular-expression literals are not parsed.
STYLES = {
    "//": re.compile(r'''"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?|(?P<c>//[^\n]*|/\*[\s\S]*?(?:\*/|\Z)|<!--[\s\S]*?(?:-->|\Z))'''),
    "#": re.compile(r'''<<[-~]?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n(?:[\s\S]*?\n)?[ \t]*\2$|"(?:\\.|[^"\\])*"?|'[^']*'?|`(?:\\.|[^`\\])*`?|(?P<c>(?:^|(?<=\s))#[^\n]*)''', re.M),
    "--": re.compile(r'''"[^"]*"?|'[^']*'?|(?P<c>--[^\n]*|/\*[\s\S]*?(?:\*/|\Z))'''),
}
URL_OR_HASH = re.compile(r"https?://\S+|\b[0-9a-fA-F]{32,}\b|\bsha(?:1|256|384|512)-[A-Za-z0-9+/]+=*")


def python_code(text):
    """Python less its comments and string statements (docstrings), by Python's own tokenizer; None if it does not tokenize."""
    rows = io.StringIO(text).readlines()
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except SyntaxError:
        return None
    for i, t in enumerate(toks):
        j = i + 1 + (i + 1 < len(toks) and toks[i + 1].type == tokenize.COMMENT)
        docstring = (t.type == tokenize.STRING and (i == 0 or toks[i - 1].type in (tokenize.NEWLINE, tokenize.NL, tokenize.INDENT, tokenize.DEDENT))
                     and (j >= len(toks) or toks[j].type in (tokenize.NEWLINE, tokenize.ENDMARKER)))
        for r in range(t.start[0], t.end[0] + 1) if t.type == tokenize.COMMENT or docstring else ():
            row = rows[r - 1]
            a, b = t.start[1] if r == t.start[0] else 0, t.end[1] if r == t.end[0] else len(row.rstrip("\r\n"))
            rows[r - 1] = row[:a] + " " * (b - a) + row[b:]
    return "".join(rows)


def code(path, data):
    """A production file's text with its comments blanked, by language (an extensionless script's interpreter names it):
    Python by its tokenizer, so docstrings are comments; the rest by STYLES. A line left blank was blank or comment-only."""
    text, name = data.decode(errors="replace"), path.rsplit("/", 1)[-1]
    lang = name.rsplit(".", 1)[1] if "." in name else (m[1] if (m := SHEBANG.match(text)) else "")
    if lang.startswith("py") and (stripped := python_code(text)) is not None:
        return stripped
    style = STYLES["#" if HASH_STYLE.fullmatch(lang) else "--" if lang == "sql" else "//"]
    return style.sub(lambda m: "\n" * m[0].count("\n") if m["c"] else m[0], text)


def tokens(text):
    """The growth unit: words and single punctuation characters, so packing, reflowing and line breaks change nothing."""
    return len(TOKEN.findall(text))


def long_lines(old, new):
    """(line number, length) of each line `new` adds over LINE_LIMIT characters, unless one URL or hash is the excess."""
    seen = set(old.decode(errors="replace").splitlines()) if old else set()
    return [(n, len(line)) for n, line in enumerate(new.decode(errors="replace").splitlines(), 1) if len(line) > LINE_LIMIT
            and line not in seen and len(line) - max(map(len, URL_OR_HASH.findall(line)), default=0) > LINE_LIMIT]


def normalized(text, *, locations=False, trivial=False):
    """Nontrivial normalized lines (every non-blank one with `trivial`), optionally paired with physical LF line numbers."""
    lines, number = [], 1
    for piece in text.splitlines(keepends=True):
        line = re.sub(r"\s+", " ", piece.strip())
        if line and (trivial or not TRIVIAL.match(line)):
            lines.append((number, line) if locations else line)
        number += piece.count("\n")
    return lines


def declared_exports(text):
    """Exported declaration names in a JS/TS file, skipping lines that start inside a template literal.

    A generator script writes `export const X` into a template string that becomes another file; that line is
    text the script emits, not a declaration, so counting it reports the generator and its output as duplicates.
    """
    names, stack, i, n, line_start = [], [], 0, len(text), True
    # stack holds "`" for an open template literal and "{" for each brace inside a ${...} substitution.
    while i < n:
        if line_start and (not stack or stack[-1] == "{"):
            end = text.find("\n", i)
            line = text[i : n if end < 0 else end]
            if (m := DECLARATION.match(line)) and m.group(1) not in CONVENTION:
                names.append(m.group(1))
        line_start = False
        c = text[i]
        if c == "\n":
            line_start = True
        elif stack and stack[-1] == "`":
            if c == "\\":
                i += 1
            elif c == "`":
                stack.pop()
            elif text.startswith("${", i):
                stack.append("{")
                i += 1
        elif c == "`":
            stack.append("`")
        elif c == "{" and stack:
            stack.append("{")
        elif c == "}" and stack:
            stack.pop()
        elif text.startswith("//", i):
            end = text.find("\n", i)
            i = (n if end < 0 else end) - 1
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = (n if end < 0 else end + 2) - 1
        elif c in "'\"":
            j = i + 1
            while j < n and text[j] != c and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            i = j
        i += 1
    return names
