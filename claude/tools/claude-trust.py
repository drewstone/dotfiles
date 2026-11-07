#!/usr/bin/env python3
"""Keep temporary directories out of Claude's automatic trust sources."""

import json
import os
import sys
import tempfile


def temporary(path):
    resolved = os.path.realpath(os.path.expanduser(path))
    roots = {os.path.realpath(root) for root in ("/tmp", "/private/tmp", "/var/tmp", "/private/var/tmp")}
    return any(resolved == root or resolved.startswith(root + os.sep) for root in roots)


def read(path):
    with open(path, encoding="utf-8") as stream:
        data = json.load(stream)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def write(path, data):
    mode = os.stat(path).st_mode & 0o777
    descriptor, scratch = tempfile.mkstemp(prefix=".claude-trust-", dir=os.path.dirname(path))
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2)
            stream.write("\n")
        os.chmod(scratch, mode)
        os.replace(scratch, path)
    finally:
        if os.path.exists(scratch):
            os.unlink(scratch)


def main():
    action, path, *requested = sys.argv[1:]
    data = read(path)
    if action in ("check-local", "sanitize-local"):
        trusted = data.get("trustedDirectories", [])
        if not isinstance(trusted, list) or not all(isinstance(item, str) for item in trusted):
            raise ValueError("trustedDirectories must be a list of paths")
        safe = [item for item in trusted if not temporary(item)]
        if action == "check-local":
            return 0 if safe == trusted else 1
        if safe != trusted:
            data["trustedDirectories"] = safe
            write(path, data)
            print(f"  REMOVED temporary directories from {path}")
    elif action in ("check-projects", "set-projects"):
        projects = data.setdefault("projects", {}) if action == "set-projects" else data.get("projects", {})
        if not isinstance(projects, dict):
            raise ValueError("projects must be a JSON object")
        if not all(isinstance(key, str) and isinstance(value, dict) for key, value in projects.items()):
            raise ValueError("projects must map paths to JSON objects")
        if any(temporary(item) for item in requested):
            raise ValueError("temporary directories cannot be granted Claude trust")
        unsafe = [key for key, value in projects.items()
                  if temporary(key) and isinstance(value, dict) and value.get("hasTrustDialogAccepted")]
        if action == "check-projects":
            return 0 if not unsafe and all(projects.get(item, {}).get("hasTrustDialogAccepted") for item in requested) else 1
        for key in unsafe:
            del projects[key]["hasTrustDialogAccepted"]
        for item in requested:
            projects.setdefault(item, {})["hasTrustDialogAccepted"] = True
        if unsafe or requested:
            write(path, data)
            if unsafe:
                print(f"  REMOVED temporary project trust from {path}")
    else:
        raise ValueError(f"unknown action: {action}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"Claude trust: {error}", file=sys.stderr)
        sys.exit(2)
