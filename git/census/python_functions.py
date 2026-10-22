"""Python AST spans, shared by the census and staged function ratchet."""
import ast
import json
import sys


def function_spans(file, text):
    tree = ast.parse(text, filename=file)
    functions = []
    classes = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append({"key": node.name, "span": node.end_lineno - node.lineno + 1})
        elif isinstance(node, ast.ClassDef):
            members = sum(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                                         ast.Assign, ast.AnnAssign)) for n in node.body)
            classes.append({"name": node.name, "members": members})
    return {"fns": functions, "classes": classes}


if __name__ == "__main__":
    try:
        print(json.dumps([function_spans(item["file"], item["text"])
                          for item in json.load(sys.stdin)]))
    except (SyntaxError, ValueError, KeyError, TypeError) as error:
        print(f"python functions refused: {error}", file=sys.stderr)
        sys.exit(2)
