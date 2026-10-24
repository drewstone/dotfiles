"""Classification shared by census and the ratchets; patterns.json owns the definitions."""
import json
import os
import re

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
WINDOW = _P["window"]
FILE_LIMIT = _P["fileLimit"]
FUNCTION_LIMIT = _P["functionLimit"]
CLASS_MEMBERS = _P["classMembers"]
FILE_HUG = tuple(_P["fileHug"])
FUNCTION_HUG = tuple(_P["functionHug"])


def logic(path):
    """A file whose lines count toward production size: logic or a workflow, and not a test, declaration, vendored path or dated record."""
    return bool((LOGIC.search(path) or WORKFLOW.search(path)) and not EXEMPT.search(path) and not history(path))


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
    """A file that says it is generated in its first 2,000 bytes."""
    return "@generated" in head or "DO NOT EDIT" in head


def line_count(data):
    """Lines in a blob: newlines, plus one for a last line without one."""
    return data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)


def normalized(text, *, locations=False):
    """Nontrivial normalized lines, optionally paired with physical LF line numbers."""
    lines, number = [], 1
    for piece in text.splitlines(keepends=True):
        line = re.sub(r"\s+", " ", piece.strip())
        if line and not TRIVIAL.match(line):
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
