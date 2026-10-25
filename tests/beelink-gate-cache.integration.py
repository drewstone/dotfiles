"""Exercise the maintained pruner against real Git, du, sparse checkout and flock."""
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile


def run(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise AssertionError(f"{args[0]} exited {result.returncode}: {result.stderr}")
    return result


def size(path):
    return int(run(["du", "-s", "-B1", str(path)]).stdout.split()[0])


def main():
    owner = Path(__file__).resolve().parents[1] / "claude/tools/beelink-gate"
    library = owner.parent / "beelink-gate-lib"
    # Load the actual complete module owners; the native filesystem, Git,
    # sparse checkout and locks supply the integration boundary.
    functions = (library / "resources.sh").read_text() + "\n" + (library / "cache.sh").read_text()
    with tempfile.TemporaryDirectory(prefix="gate-cache-integration-") as directory:
        root = Path(directory)
        repo = root / "source"
        repo.mkdir()
        run(["git", "init", "-q", str(repo)])
        (repo / "keep.txt").write_text("retained\n")
        (repo / "omit").mkdir()
        (repo / "omit/payload").write_bytes(os.urandom(1024 * 1024))
        run(["git", "-C", str(repo), "add", "."])
        run(["git", "-C", str(repo), "commit", "-qm", "integration fixture"])

        def cache(name):
            path = root / name
            (path / ".locks").mkdir(parents=True)
            return path

        def clone(path, name):
            target = path / "github.com/owner" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            run(["git", "clone", "-q", str(repo), str(target)])
            return target

        def prune(path, cap):
            timing = root / (path.name + ".timing")
            timing.unlink(missing_ok=True)
            result = run(["bash", "-c", "set -uo pipefail\n" + functions + '\nprune_cache "$1" "$2" "$3"',
                          "integration", str(path), str(path / "not-a-checkout"), str(cap)],
                         env={**os.environ, "timing_file": str(timing)})
            scans = [int(line.split()[2]) for line in timing.read_text().splitlines()
                     if line.startswith("cache_scans ")]
            return scans, result.stderr

        plain = cache("plain")
        clone(plain, "idle")
        scans, _ = prune(plain, 1 << 50)
        assert scans == [1], scans

        (repo / ".beelink-gate").mkdir()
        (repo / ".beelink-gate/sparse-checkout").write_text("/*\n!/omit/\n")
        run(["git", "-C", str(repo), "add", "."])
        run(["git", "-C", str(repo), "commit", "-qm", "integration sparse shape"])
        sparse = cache("sparse")
        checkout = clone(sparse, "idle")
        before = size(sparse)
        scans, _ = prune(sparse, 1 << 50)
        assert scans == [1] and not (checkout / "omit").exists()
        assert (checkout / "keep.txt").read_text() == "retained\n"
        assert size(sparse) < before

        bounded = cache("bounded")
        active, idle = clone(bounded, "active"), clone(bounded, "idle")
        # A real second owner holds the active checkout's flock throughout eviction.
        with (bounded / ".locks/github.com-owner-active.lock").open("a+") as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            cap = size(active) + 128 * 1024
            assert size(bounded) > cap
            scans, log = prune(bounded, cap)
            assert active.exists() and not idle.exists(), log
            assert size(bounded) <= cap
            assert scans == [2], scans
        print("PASS: one scan without eviction; sparse maintenance measured once; real flock protects active cache; eviction remeasured with shared Git hardlinks")


if __name__ == "__main__":
    main()
