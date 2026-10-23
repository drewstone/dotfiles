"""Release admission owner: native Worker identity joined to read-only Actions jobs.

Imported reports reuse the metadata TTL; import performs no reads or API calls.
The shell embeds this source once and invokes main before admitting new work.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time

GITHUB_CACHE_SECONDS = 300
READ_BUDGET_SECONDS = 15.0
MAX_API_BYTES = 2 * 1024 * 1024
MAX_API_REQUESTS = 32
MAX_CONCURRENT_JOB_READS = 3
MAX_PAGES = 4
CACHE_SCHEMA = 2
REPOSITORY = "tangle-network/agent-container"
# Release owner b5-gate-jobs-0250, 2026-10-23; exact caller names. Reusable
# workflow jobs retain the caller name followed by " / ", as ADC's maintained
# scripts/lib/workflow-job-name.mjs isWorkflowJob defines (verified at
# ADC 4409324b1cea8919a36c9c072edf99ba1891aaef).
CRITICAL_JOBS = {
    ".github/workflows/release-build.yml": (
        "Build", "Wake the compiled cut's release gate",
    ),
    ".github/workflows/release-pr.yml": (
        "Cut or refresh the release PR", "Resolve Production Release",
        "Complete Production Release", "Advance Production Release",
    ),
    ".github/workflows/deploy.yml": (
        "Skip a superseded automated deploy", "Await signed production images",
        "Prepare Build Host", "Build Agent Runtime Image",
        "Build Collaboration Server Image", "Build Admin Portal Image",
        "Build Orchestrator and Host Agent Images", "Build Edge Router Image",
        "Verify signed production image set", "Deploy Preflight",
        "Converge D1 Migrations (production)", "Deploy to Production",
        "Smoke Test (Production)", "Dispatch Firecracker Rollout",
    ),
}
POLICY_HASH = hashlib.sha256(json.dumps(CRITICAL_JOBS, sort_keys=True).encode()).hexdigest()
CGROUP_ROOT = Path("/sys/fs/cgroup/deploy.slice/deploy-runners.slice")
_cancelled = False


class Unknown(Exception):
    """A bounded reason code, never a raw response or exception containing data."""


def utc(epoch=None):
    return dt.datetime.fromtimestamp(time.time() if epoch is None else epoch,
                                     dt.timezone.utc).isoformat()


def check_deadline(deadline, abort=None):
    if _cancelled:
        raise Unknown("read_cancelled")
    if abort is not None and abort.is_set():
        raise Unknown("github_inventory_aborted")
    if time.monotonic() >= deadline:
        raise Unknown("read_deadline")


def release_hold(path):
    """Preserve strict host limits semantics; do not auto-expire a hold."""
    try:
        before = path.lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(before.st_mode) or before.st_size > 65536:
        raise Unknown("limits_file_ambiguous")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        opened = os.fstat(source.fileno())
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise Unknown("limits_file_changed")
        raw = source.read(65537)
    if len(raw) > 65536:
        raise Unknown("limits_file_oversized")
    try:
        lines = raw.decode().splitlines()
    except UnicodeError:
        raise Unknown("limits_file_encoding") from None
    entries = [line for line in lines if line.lstrip().startswith("release_critical")]
    if not entries:
        return False
    if len(entries) != 1 or entries[0] not in ("release_critical=0", "release_critical=1"):
        raise Unknown("release_critical_malformed_or_duplicate")
    return entries[0] == "release_critical=1"


def native_workers(host, deadline):
    """Read only systemd membership, comm and PID start ticks; no args/env/logs."""
    if not stat.S_ISDIR(CGROUP_ROOT.lstat().st_mode):
        raise Unknown("cgroup_root_ambiguous")
    pattern = re.compile(r"actions\.runner\.tangle-network\.((?:release|deploy)-" +
                         re.escape(host) + r"-adc-[0-9]{2})\.service")
    workers = []
    for index, group in enumerate(CGROUP_ROOT.iterdir()):
        check_deadline(deadline)
        if index >= 128:
            raise Unknown("cgroup_inventory_bound")
        match = pattern.fullmatch(group.name)
        if not match:
            continue
        if not stat.S_ISDIR(group.lstat().st_mode):
            raise Unknown("runner_cgroup_ambiguous")
        pids = (group / "cgroup.procs").read_text().split()
        if len(pids) > 1024:
            raise Unknown("runner_pid_bound")
        in_unit = []
        for pid in pids:
            check_deadline(deadline)
            if not pid.isdecimal():
                raise Unknown("runner_pid_invalid")
            process = Path("/proc", pid)
            worker_seen = False
            try:
                raw = (process / "stat").read_text()
                end = raw.rindex(")")
                if raw[raw.index("(") + 1:end] != "Runner.Worker":
                    continue
                worker_seen = True
                start = int(raw[end + 2:].split()[19])
                memberships = [line[3:] for line in (process / "cgroup").read_text().splitlines()
                               if line.startswith("0::")]
                if len(memberships) != 1:
                    raise Unknown("worker_membership_ambiguous")
                expected = "/" + str(group.relative_to("/sys/fs/cgroup"))
                if memberships[0] != expected and not memberships[0].startswith(expected + "/"):
                    raise Unknown("worker_membership_changed")
                again = (process / "stat").read_text()
                if int(again[again.rindex(")") + 2:].split()[19]) != start:
                    raise Unknown("worker_pid_reused")
                in_unit.append({"unit": group.name, "runner_name": match[1],
                                "pid": int(pid), "start_ticks": start})
            except FileNotFoundError:
                if worker_seen:
                    raise Unknown("worker_changed_during_read") from None
                continue  # Unrelated shell/compiler exit is not Worker ambiguity.
        if len(in_unit) > 1:
            raise Unknown("multiple_workers_in_unit")
        workers.extend(in_unit)
    return sorted(workers, key=lambda row: row["unit"])


def worker_birth_bounds(worker):
    # Linux /proc starttime is quantized to SC_CLK_TCK ticks since boot. The
    # paired realtime readings bound the CLOCK_BOOTTIME-to-UTC mapping; there
    # is no guessed grace margin. Birth bounds are evidence, not a fingerprint.
    lower = time.time()
    boot = time.clock_gettime(time.CLOCK_BOOTTIME)
    upper = time.time()
    hz = os.sysconf("SC_CLK_TCK")
    if upper < lower or hz <= 0:
        raise Unknown("clock_mapping_ambiguous")
    return (lower - boot + worker["start_ticks"] / hz,
            upper - boot + (worker["start_ticks"] + 1) / hz)


def timestamp_interval(value):
    if not isinstance(value, str) or len(value) > 64:
        raise Unknown("setup_time_missing_or_oversized")
    try:
        stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.utcoffset() != dt.timedelta(0):
            raise ValueError()
        start = stamp.timestamp()
    except (ValueError, OverflowError):
        raise Unknown("setup_time_invalid") from None
    fraction = re.search(r"\.(\d+)(?:Z|[+]00:00)$", value)
    quantum = 10 ** -len(fraction[1]) if fraction else 1.0
    if not math.isfinite(start) or start + quantum <= start:
        raise Unknown("setup_time_precision_unknown")
    return start, start + quantum


def setup_binding(job, before, after):
    # The native setup_job child starts inside Runner.Worker (actions/runner
    # v2.337.0 JobExtension.cs63-74, ExecutionContext.cs475). Real paired B1
    # reads refuted job.started_at as a Worker-birth marker; only initial setup
    # timing is used here. This is temporal evidence, never a native UUID join.
    if max(before[0], after[0]) > min(before[1], after[1]):
        raise Unknown("clock_discontinuity")
    birth_lower, birth_upper = min(before[0], after[0]), max(before[1], after[1])
    setup_lower, setup_upper = timestamp_interval(job.get("setup_started_at"))
    if setup_lower > time.time():
        raise Unknown("setup_time_in_future")
    if setup_lower <= birth_upper:
        raise Unknown("setup_does_not_strictly_follow_worker_birth")
    return {"kind": "system_setup_step_temporal_relation_not_uuid_proof",
            "worker_birth_lower_epoch": birth_lower, "worker_birth_upper_epoch": birth_upper,
            "setup_lower_epoch": setup_lower, "setup_upper_epoch": setup_upper}


def initial_setup(job):
    steps = job.get("steps")
    if not isinstance(steps, list):
        raise Unknown("initial_setup_missing")
    first = [step for step in steps if isinstance(step, dict)
             and type(step.get("number")) is int and step["number"] == 1]
    if (len(first) != 1 or first[0].get("name") != "Set up job"
            or first[0].get("status") not in ("in_progress", "completed")):
        raise Unknown("initial_setup_ambiguous")
    timestamp_interval(first[0].get("started_at"))
    return first[0]["started_at"]


def safe_directory(path):
    """Cache under the existing gate state, never a runner home or new service."""
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    for parent in (path, *path.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid()):
            raise Unknown("cache_directory_identity")
        if info.st_mode & 0o022:
            raise Unknown("cache_directory_writable_by_other")


def read_cache(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise Unknown("cache_file_identity")
        raw = source.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise Unknown("cache_file_oversized")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise Unknown("cache_file_invalid") from None
    if not isinstance(value, dict):
        raise Unknown("cache_file_invalid")
    return value


def write_cache(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".release-priority-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as target:
            json.dump(value, target, separators=(",", ":"), allow_nan=False)
            target.write("\n")
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def lock_cache(path, deadline):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        os.close(fd)
        raise Unknown("cache_lock_identity")
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return fd
            except BlockingIOError:
                check_deadline(deadline)
                time.sleep(min(0.05, max(0, deadline - time.monotonic())))
    except BaseException:
        os.close(fd)
        raise


def terminate_child(child):
    """Keep the leader unreaped until signalling its owned PGID, preventing reuse."""
    try:
        os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    except ChildProcessError:
        raise Unknown("github_child_ownership_lost") from None
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=0.5)
    except subprocess.TimeoutExpired:
        raise Unknown("github_child_not_reaped") from None
    try:
        os.killpg(child.pid, 0)
    except ProcessLookupError:
        return
    raise Unknown("github_descendants_not_reaped")


def bounded_read(argv, deadline, abort=None):
    check_deadline(deadline, abort)
    child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, start_new_session=True)
    output = bytearray()
    count = 0
    try:
        with selectors.DefaultSelector() as selector:
            for stream in (child.stdout, child.stderr):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ)
            while selector.get_map():
                check_deadline(deadline, abort)
                for key, _ in selector.select(min(0.1, max(0, deadline - time.monotonic()))):
                    data = os.read(key.fd, 65536)
                    if not data:
                        selector.unregister(key.fileobj)
                        continue
                    count += len(data)
                    if count > MAX_API_BYTES:
                        raise Unknown("github_output_bound")
                    if key.fileobj is child.stdout:
                        output.extend(data)
            # WNOWAIT preserves PID ownership until finally kills any remaining
            # descendants. Popen.wait/poll here would free the PID too early.
            while True:
                check_deadline(deadline, abort)
                ended = os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                if ended is not None:
                    break
                time.sleep(min(0.01, max(0, deadline - time.monotonic())))
        if ended.si_code != os.CLD_EXITED or ended.si_status != 0:
            raise Unknown("github_read_failed")
        return bytes(output)
    finally:
        try:
            terminate_child(child)
        finally:
            child.stdout.close()
            child.stderr.close()


class ActionsRead:
    def __init__(self, gh, deadline):
        self.gh, self.deadline = gh, deadline
        self.requests = 0
        self.request_lock = threading.Lock()
        self.abort = threading.Event()
        self.active_reads = self.peak_concurrent_reads = 0
        self.started = time.monotonic()
        self.coverage = {"runs_enumerated": 0, "runs_with_jobs_read": 0, "job_rows_read": 0}

    def get(self, endpoint):
        # Reserve from one invocation-wide budget before a worker launches gh.
        with self.request_lock:
            check_deadline(self.deadline, self.abort)
            if self.requests >= MAX_API_REQUESTS:
                raise Unknown("github_request_bound")
            self.requests += 1
            self.active_reads += 1
            self.peak_concurrent_reads = max(self.peak_concurrent_reads, self.active_reads)
        try:
            raw = bounded_read([self.gh, "api", "--hostname", "github.com",
                                "-H", "Accept: application/vnd.github+json",
                                "-H", "Cache-Control: no-cache", endpoint], self.deadline, self.abort)
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeError):
                raise Unknown("github_response_invalid") from None
            if not isinstance(value, dict):
                raise Unknown("github_response_invalid")
            return value
        finally:
            with self.request_lock:
                self.active_reads -= 1

    def pages(self, endpoint, key):
        rows, seen, expected = [], set(), None
        for page in range(1, MAX_PAGES + 1):
            value = self.get(endpoint + ("&" if "?" in endpoint else "?") +
                             f"per_page=100&page={page}")
            total, entries = value.get("total_count"), value.get(key)
            if type(total) is not int or total < 0 or not isinstance(entries, list):
                raise Unknown("github_page_invalid")
            if expected is not None and total != expected:
                raise Unknown("github_inventory_changed")
            expected = total
            for row in entries:
                if not isinstance(row, dict) or type(row.get("id")) is not int or row["id"] in seen:
                    raise Unknown("github_row_identity")
                seen.add(row["id"])
                rows.append(row)
            if len(rows) == total:
                return rows
            if len(entries) != 100 or len(rows) > total:
                raise Unknown("github_inventory_partial")
        raise Unknown("github_pagination_bound")

    def job_inventories(self, prefix, runs):
        # Only independent run inventories overlap; each run's pages stay serial.
        # Never return a partial inventory or leave worker-owned sessions behind.
        pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_JOB_READS)
        futures = {}
        try:
            for run in runs:
                check_deadline(self.deadline, self.abort)
                endpoint = prefix + f"runs/{run['id']}/attempts/{run['run_attempt']}/jobs"
                futures[pool.submit(self.pages, endpoint, "jobs")] = run["id"]
            inventories = {}
            for future in as_completed(futures):
                jobs = future.result()
                inventories[futures[future]] = jobs
                self.coverage["runs_with_jobs_read"] += 1
                self.coverage["job_rows_read"] += len(jobs)
            return inventories
        except BaseException:
            self.abort.set()
            for future in futures:
                future.cancel()
            raise
        finally:
            pool.shutdown(wait=True, cancel_futures=True)

    def join(self, workers):
        prefix = f"repos/{REPOSITORY}/actions/"
        runs = self.pages(prefix + "runs?status=in_progress", "workflow_runs")
        self.coverage["runs_enumerated"] = len(runs)
        wanted = {worker["runner_name"] for worker in workers}
        matched = {}
        for run in runs:
            repository = run.get("repository")
            if not isinstance(repository, dict) or repository.get("full_name") != REPOSITORY:
                raise Unknown("github_repository_mismatch")
            path, attempt = run.get("path"), run.get("run_attempt")
            if not isinstance(path, str) or not re.fullmatch(r"\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml", path):
                raise Unknown("github_workflow_path_unknown")
            if type(attempt) is not int or attempt < 1 or run.get("status") != "in_progress":
                raise Unknown("github_run_identity")
        inventories = self.job_inventories(prefix, runs)
        for run in runs:
            path, attempt = run["path"], run["run_attempt"]
            for job in inventories[run["id"]]:
                runner = job.get("runner_name")
                if job.get("status") != "in_progress" or runner not in wanted:
                    continue
                if runner in matched:
                    raise Unknown("multiple_active_api_jobs_for_worker")
                name, started = job.get("name"), job.get("started_at")
                if job.get("run_id") != run["id"] or not isinstance(name, str) or not 0 < len(name) <= 256:
                    raise Unknown("github_job_identity")
                try:
                    stamp = dt.datetime.fromisoformat(started.replace("Z", "+00:00"))
                    if stamp.tzinfo is None:
                        raise ValueError()
                except (AttributeError, ValueError):
                    raise Unknown("github_job_time_unknown") from None
                matched[runner] = {"repository": REPOSITORY, "workflow_path": path,
                                   "job_name": name, "job_id": job["id"], "run_id": run["id"],
                                   "run_attempt": attempt, "started_at": started,
                                   "setup_started_at": initial_setup(job)}
        # A first match is not unique until every active run has been read.
        # An older stale row and a current row on one runner must fail closed.
        if wanted != matched.keys():
            raise Unknown("active_worker_without_unique_api_job")
        return [dict(worker, **matched[worker["runner_name"]]) for worker in workers]


def critical(job):
    return any(job["job_name"] == name or job["job_name"].startswith(name + " / ")
               for name in CRITICAL_JOBS.get(job["workflow_path"], ()))


def cache_age(cache, now, boot, host):
    if (not cache or cache.get("schema") != CACHE_SCHEMA or cache.get("host") != host
            or cache.get("boot_id") != boot):
        return None
    observed = cache.get("attempt_monotonic")
    if type(observed) not in (int, float) or not 0 <= observed <= now:
        raise Unknown("cache_time_invalid")
    return now - observed


def verified_jobs(cache, workers):
    jobs = cache.get("jobs")
    if (cache.get("state") != "verified" or cache.get("policy_hash") != POLICY_HASH
            or cache.get("workers") != workers or not isinstance(jobs, list)):
        return None
    if len(jobs) != len(workers):
        raise Unknown("cache_identity_invalid")
    job_fields = {"unit", "runner_name", "pid", "start_ticks", "repository", "workflow_path",
              "job_name", "job_id", "run_id", "run_attempt", "started_at",
              "setup_started_at", "temporal_relation"}
    for job, worker in zip(jobs, workers):
        if (not isinstance(job, dict) or set(job) != job_fields
                or any(job.get(key) != value for key, value in worker.items())):
            raise Unknown("cache_identity_invalid")
        if (job.get("repository") != REPOSITORY or not isinstance(job.get("workflow_path"), str)
                or not re.fullmatch(r"\.github/workflows/[A-Za-z0-9_.-]+\.ya?ml", job["workflow_path"])
                or not isinstance(job.get("job_name"), str) or not 0 < len(job["job_name"]) <= 256
                or type(job.get("job_id")) is not int
                or type(job.get("run_id")) is not int or type(job.get("run_attempt")) is not int):
            raise Unknown("cache_identity_invalid")
        relation = job.get("temporal_relation")
        relation_fields = {"kind", "worker_birth_lower_epoch", "worker_birth_upper_epoch",
                  "setup_lower_epoch", "setup_upper_epoch"}
        if (not isinstance(relation, dict) or set(relation) != relation_fields
                or relation["kind"] != "system_setup_step_temporal_relation_not_uuid_proof"
                or any(type(relation[key]) not in (int, float) or not math.isfinite(relation[key])
                       for key in relation_fields - {"kind"})):
            raise Unknown("cache_temporal_identity_invalid")
        prior = (relation["worker_birth_lower_epoch"], relation["worker_birth_upper_epoch"])
        if prior[0] > prior[1]:
            raise Unknown("cache_temporal_identity_invalid")
        current = worker_birth_bounds(worker)
        validated = setup_binding(job, prior, current)
        if (validated["setup_lower_epoch"] != relation["setup_lower_epoch"]
                or validated["setup_upper_epoch"] != relation["setup_upper_epoch"]):
            raise Unknown("cache_setup_time_changed")
    return jobs


def decision(host, limits, state_dir, gh, deadline):
    result = {"state": "unknown", "reason": "unread", "host": host, "observed_at": utc(), "workers": [],
              "persistent_hold": None, "policy_source": "b5-gate-jobs-0250", "policy_hash": POLICY_HASH,
              "critical_workflow_paths": list(CRITICAL_JOBS),
              "cache": {"max_age_s": GITHUB_CACHE_SECONDS, "age_s": None, "state": "not_read"},
              "api": {"request_count": 0, "duration_s": 0.0, "coverage": {}}}
    lock_fd = None
    api = None
    try:
        result["persistent_hold"] = release_hold(limits)
        if result["persistent_hold"]:
            result.update(state="held", reason="release_critical_host_hold")
            return result
        workers = native_workers(host, deadline)
        result["workers"] = workers
        if not workers:
            result.update(state="open", reason="no_native_adc_release_or_deploy_workers")
        else:
            safe_directory(state_dir)
            lock_fd = lock_cache(state_dir / "release-priority-cache.lock", deadline)
            # Waiting for another gate's lookup invalidates the first snapshot.
            workers = native_workers(host, deadline)
            result["workers"] = workers
            if not workers:
                result.update(state="open", reason="native_workers_finished_before_lookup")
            else:
                path = state_dir / "release-priority-cache.json"
                cache = read_cache(path)
                boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
                age = cache_age(cache, time.monotonic(), boot, host)
                jobs = verified_jobs(cache, workers) if age is not None else None
                result["cache"]["age_s"] = age
                if age is not None and age < GITHUB_CACHE_SECONDS:
                    result["cache"].update(state="hit" if jobs is not None else "refresh_cooldown",
                                           next_refresh_after=utc(time.time() + GITHUB_CACHE_SECONDS - age))
                    if jobs is None:
                        raise Unknown("worker_changed_or_prior_lookup_unknown")
                else:
                    cache = {"schema": CACHE_SCHEMA, "policy_hash": POLICY_HASH, "boot_id": boot, "host": host,
                             "attempt_monotonic": time.monotonic(), "attempt_at": utc(),
                             "state": "unknown", "workers": workers}
                    # Persist the attempt before a child can fail or this caller
                    # can die, so all gates share one refresh cooldown.
                    write_cache(path, cache)
                    births = {worker["unit"]: worker_birth_bounds(worker) for worker in workers}
                    api = ActionsRead(gh, deadline - 0.5)
                    try:
                        jobs = api.join(workers)
                        if native_workers(host, deadline) != workers:
                            raise Unknown("worker_changed_during_api_read")
                        jobs = [dict(job, temporal_relation=setup_binding(
                            job, births[job["unit"]], worker_birth_bounds(job))) for job in jobs]
                        cache.update(state="verified", jobs=jobs)
                        write_cache(path, cache)
                    except (Unknown, OSError, ValueError):
                        cache["state"] = "unknown"
                        write_cache(path, cache)
                        raise
                    age = time.monotonic() - cache["attempt_monotonic"]
                    result["cache"].update(state="refreshed", age_s=age,
                                           next_refresh_after=utc(time.time() + max(0, GITHUB_CACHE_SECONDS - age)))
                if native_workers(host, deadline) != workers:
                    raise Unknown("worker_changed_after_identity_read")
                if verified_jobs(cache, workers) is None:
                    raise Unknown("cached_api_identity_unverified")
                result["workers"] = [dict(job, classification="critical" if critical(job) else "noncritical")
                                     for job in jobs]
                is_critical = any(critical(job) for job in jobs)
                result.update(state="held" if is_critical else "open",
                              reason="verified_release_critical_job" if is_critical else "verified_noncritical_jobs")
        # An operator may close admission while an API/cache read runs. No open
        # verdict is based only on a pre-read limits observation.
        if result["state"] == "open":
            if release_hold(limits):
                result.update(state="held", reason="release_critical_host_hold", persistent_hold=True)
            elif native_workers(host, deadline) != workers:
                raise Unknown("worker_changed_before_open")
    except Unknown as error:
        result.update(state="unknown", reason=str(error))
    except (OSError, ValueError, IndexError, KeyError, TypeError, AttributeError, RecursionError, OverflowError):
        result.update(state="unknown", reason="release_evidence_unavailable")
    finally:
        if api is not None:
            result["api"] = {"request_count": api.requests,
                             "parallel_job_workers": MAX_CONCURRENT_JOB_READS,
                             "peak_concurrent_reads": api.peak_concurrent_reads,
                             "concurrency_scope": "owner read attempts, including bounded child cleanup",
                             "duration_s": round(time.monotonic() - api.started, 6),
                             "request_count_scope": "explicit Actions CLI requests; wrapper auth/quota reads excluded",
                             "coverage": api.coverage}
        if lock_fd is not None:
            os.close(lock_fd)
    return result


def cancel_read(_signal, _frame):
    global _cancelled
    # A flag avoids an async exception between Popen creating its child and
    # entering its finally block. Bounded reads observe it and reap the session.
    _cancelled = True


def main():
    signal.signal(signal.SIGTERM, cancel_read)
    signal.signal(signal.SIGINT, cancel_read)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", choices=("beelink1", "beelink2"))
    parser.add_argument("limits", type=Path)
    parser.add_argument("state_dir", type=Path)
    parser.add_argument("gh")
    args = parser.parse_args()
    started = time.monotonic()
    row = decision(args.host, args.limits, args.state_dir, args.gh, started + READ_BUDGET_SECONDS)
    if _cancelled and row["state"] != "held":
        row.update(state="unknown", reason="read_cancelled")
    row["read_elapsed_s"] = round(time.monotonic() - started, 6)
    row["read_elapsed_scope"] = "decision; excludes atomic observation write"
    row["observed_at"] = utc()
    try:
        safe_directory(args.state_dir)
        write_cache(args.state_dir / "release-priority.json", row)
    except (OSError, Unknown, ValueError):
        row["observation_error"] = "observation_publish_failed"
        if row["state"] != "held":
            row.update(state="unknown", reason="observation_publish_failed")
    if _cancelled and row["state"] != "held" and row.get("reason") != "read_cancelled":
        row.update(state="unknown", reason="read_cancelled")
        try:
            write_cache(args.state_dir / "release-priority.json", row)
        except (OSError, Unknown, ValueError):
            row["observation_error"] = "observation_publish_failed"
            row["reason"] = "observation_publish_failed"
    # Operator0413: only positively known critical work holds admission. Unknown
    # identity keeps its diagnostic and uses the existing host-PSI/disk admission.
    if row["state"] == "unknown":
        print("beelink-gate: release priority unknown: " + row["reason"] +
              "; using host PSI admission", file=sys.stderr)
    elif row.get("observation_error"):
        print("beelink-gate: release priority held; observation publish failed; hold retained",
              file=sys.stderr)
    print(json.dumps(row, separators=(",", ":"), allow_nan=False))
    return 3 if row["state"] == "held" else 0


if __name__ == "__main__":
    sys.exit(main())
