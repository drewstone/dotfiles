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
    """A file whose lines count toward production size: logic or a workflow, and not a test, declaration or vendored path."""
    return bool((LOGIC.search(path) or WORKFLOW.search(path)) and not EXEMPT.search(path))


def source(path):
    """A TypeScript or JavaScript file outside tests: the duplication/export population."""
    return bool(SOURCE.search(path) and not SKIP.search(path))


def function_source(path):
    """A supported AST source outside tests, including Python."""
    return bool(FUNCTION_SOURCE.search(path) and not SKIP.search(path))


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
