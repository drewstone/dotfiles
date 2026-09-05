# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Combine Semgrep SARIF files while preserving each complete run.

Usage: python3 merge_sarif.py RAW_DIR OUTPUT_FILE
Duplicate findings remain in their original runs for later triage.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


def reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


def read_runs(path: Path) -> list[dict]:
    document = json.loads(path.read_text(), parse_constant=reject_constant)
    if not isinstance(document, dict) or document.get("version") != "2.1.0":
        raise ValueError(f"{path}: expected SARIF version 2.1.0")
    unsupported = document.keys() - {"version", "$schema", "runs"}
    if unsupported:
        raise ValueError(f"{path}: unsupported top-level fields: {sorted(unsupported)}")
    runs = document.get("runs")
    if not isinstance(runs, list) or not runs:
        raise ValueError(f"{path}: expected a nonempty runs array")
    for run in runs:
        if not isinstance(run, dict) or not isinstance(run.get("tool"), dict):
            raise ValueError(f"{path}: each run needs a tool object")
        if not isinstance(run["tool"].get("driver"), dict):
            raise ValueError(f"{path}: each tool needs a driver object")
        results = run.get("results", [])
        if not isinstance(results, list) or any(not isinstance(result, dict) for result in results):
            raise ValueError(f"{path}: results must be an array of objects")
    return runs


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} RAW_DIR OUTPUT_FILE", file=sys.stderr)
        return 1
    raw_dir, output_file = map(Path, sys.argv[1:])
    temporary_path: Path | None = None
    try:
        if not raw_dir.is_dir():
            raise ValueError(f"{raw_dir}: not a directory")
        if output_file.parent.resolve() == raw_dir.resolve():
            raise ValueError("keep combined output outside the raw input directory")
        inputs = sorted(raw_dir.glob("*.sarif"))
        if not inputs:
            raise ValueError(f"{raw_dir}: no SARIF files found")
        runs = [run for path in inputs for run in read_runs(path)]
        merged = {
            "version": "2.1.0",
            "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
            "runs": runs,
        }
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output_file.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(merged, temporary, indent=2, allow_nan=False)
            temporary.write("\n")
        os.replace(temporary_path, output_file)
        count = sum(len(run.get("results", [])) for run in runs)
        print(f"Combined {len(runs)} runs from {len(inputs)} files: {count} findings; duplicates retained")
        print(f"Written to {output_file}")
        return 0
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
