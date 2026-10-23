"""Gate report owner; the shell owns transport and passes retained records."""
import collections, datetime as dt, json, math, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from beelink_gate_metrics import throughput
from beelink_gate_disk import disk_summary
from beelink_gate_release import GITHUB_CACHE_SECONDS
path, hours, gh, missing = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
json_output = len(sys.argv) > 5 and sys.argv[5] == "--json"
if json_output:
    def print(*args, **kwargs):
        pass
now = dt.datetime.now(dt.timezone.utc)
since = (now - dt.timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
if len(sys.argv) > 6 and sys.argv[6]:
    requested = dt.datetime.fromisoformat(sys.argv[6].replace("Z", "+00:00"))
    if requested.tzinfo is None or requested > now:
        raise SystemExit("--since must be a past timestamp with a timezone")
    since = requested.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
history = []
capacity_logs = []
samples = []
for line in open(path):
    try:
        r = json.loads(line)
    except ValueError:
        continue
    if not isinstance(r, dict):
        continue
    if r.get("kind") == "capacity_intent_logs":
        capacity_logs.append(r)
    elif r.get("kind") == "host_cpu_sample":
        samples.append(r)
    elif isinstance(r.get("at"), str) and isinstance(r.get("repo"), str):
        history.append(r)
# GitHub follows a renamed repo but its search does not, so receipts group under the
# current name; otherwise agent-dev-container's runs after its rename had no merged count.
# gh owns persistence/expiry. Cache age is not returned by its API command, so
# expose the maximum possible staleness without calling a cached response fresh.
GITHUB_METADATA_CACHE_SECONDS = GITHUB_CACHE_SECONDS
canonical_names = {}
canonical_unknown = set()
def github(args):
    try:
        return subprocess.run([gh, "api", "--cache", f"{GITHUB_METADATA_CACHE_SECONDS}s", *args], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(args, 124 if isinstance(error, subprocess.TimeoutExpired) else 127, "", "metadata unavailable")
def canonical(repo):
    if not repo.startswith("github.com/"):
        return repo
    if not gh:
        canonical_unknown.add(repo)
        return repo
    if repo not in canonical_names:
        out = github([f"repos/{repo[len('github.com/'):]}", "--jq", ".full_name"])
        name = out.stdout.strip()
        if out.returncode == 0 and name.count("/") == 1:
            canonical_names[repo] = f"github.com/{name}"
        else:
            canonical_unknown.add(repo)
            canonical_names[repo] = repo
    return canonical_names[repo]
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(canonical, {r["repo"] for r in history if r.get("repo")}))
for r in history:
    if r.get("repo"):
        r["repo"] = canonical(r["repo"])
rows = [r for r in history if r.get("at", "") >= since]
def exit_class(code):
    return {0: "pass", 1: "fail", 2: "exit_2", 3: "exit_3", 75: "tempfail", 76: "replaced", 124: "timeout", 143: "stopped"}.get(code, "other")
by_repo = collections.defaultdict(list)
for r in rows:
    by_repo[r.get("repo", "?")].append(r)
def merged(repo):
    if not gh or not repo.startswith("github.com/"):
        return None
    q = f"repo:{repo[len('github.com/'):]} is:pr is:merged merged:>={since}"
    out = github(["-X", "GET", "search/issues", "-f", f"q={q}", "--jq", ".total_count"])
    return int(out.stdout.strip()) if out.returncode == 0 and out.stdout.strip().isdigit() else None
print(f"beelink-gate report: {since} to {now:%Y-%m-%dT%H:%M:%SZ} ({len(rows)} gate runs)")
for logs in capacity_logs:
    print(f"CAPACITY_INTENT {logs['from']}: refusals={logs['refusals']} retained_logs={logs['logs_scanned']} "
          f"window={logs['window_from']}..{logs['window_to']} oldest_retained={logs['oldest_retained']}; expired logs unavailable")
    print(f"NONTERMINAL {logs['from']}: {json.dumps(logs.get('nonterminal_jobs', []), sort_keys=True)}")
if missing:
    print(f"PARTIAL missing receipts from {missing}; every count below omits that host")
print(f"{'repo':38} {'runs':>5} {'merged':>6} {'runs/PR':>7} {'p50 wait':>8} {'repeats':>7}  modes / exits")
total_runs = total_merged = 0
# The JSON consumer never includes merged counts. Do not spend search quota on
# text that its print sink discards; canonical grouping still runs above.
merged_counts = dict.fromkeys(by_repo)
if not json_output:
    with ThreadPoolExecutor(max_workers=4) as pool:
        merged_counts = dict(zip(by_repo, pool.map(merged, by_repo)))
print(f"GITHUB_METADATA enabled={bool(gh)} cache_max_age_s={GITHUB_METADATA_CACHE_SECONDS} "
      f"actual_cache_age=unknown canonical_unknown={sorted(canonical_unknown)} "
      f"merged_unknown={sorted(repo for repo, count in merged_counts.items() if count is None)}")
for repo, rs in sorted(by_repo.items(), key=lambda kv: -len(kv[1])):
    m = merged_counts[repo]
    waits = sorted(r.get("waited_s", 0) for r in rs)
    keys = collections.Counter((r.get("sha"), r.get("mode"), r.get("command")) for r in rs)
    repeats = sum(n - 1 for n in keys.values())
    modes = collections.Counter(r.get("class") if r.get("class") in ("dev", "light") else r.get("mode") for r in rs)
    exits = collections.Counter(exit_class(r.get("exit")) for r in rs)
    ratio = f"{len(rs) / m:.1f}" if m else "-"
    total_runs += len(rs)
    total_merged += m or 0
    print(f"{repo[len('github.com/'):] if repo.startswith('github.com/') else repo:38} {len(rs):5} {m if m is not None else '?':>6} {ratio:>7} {waits[len(waits) // 2]:7}s {repeats:7}  "
          + " ".join(f"{k}={v}" for k, v in modes.most_common()) + " / " + " ".join(f"{k}={v}" for k, v in exits.most_common()))
if total_merged:
    print(f"TOTAL {total_runs} runs / {total_merged} merged PRs = {total_runs / total_merged:.1f} runs per merged PR (target <= 1.5)"
          + (f" PARTIAL missing {missing}" if missing else ""))
# Recompute across both hosts: a receipt's own reason only sees its host's
# history. A prior checkout on the other Beelink must not look like a first run.
last_head, last_exact = {}, {}
reasons = collections.Counter()
repeat_repos, repeat_lanes = collections.Counter(), collections.Counter()
for r in sorted(history, key=lambda item: item.get("at", "")):
    head = (r.get("repo"), r.get("sha"))
    exact = head + (r.get("mode"), r.get("command"))
    prior = last_exact.get(exact)
    if prior is None:
        reason = "different_command" if head in last_head else "first"
    elif prior.get("exit") == 0 and r.get("base_sha") and prior.get("base_sha") and r["base_sha"] != prior["base_sha"]:
        reason = "after_base_move"
    elif prior.get("exit") != 0:
        reason = "after_red"
    elif not r.get("base_sha") or not prior.get("base_sha"):
        reason = "after_green_base_unknown"
    else:
        reason = "after_green"
    if r.get("at", "") >= since:
        reasons[reason] += 1
        if reason != "first":
            repeat_repos[r.get("repo") or "?"] += 1
            repeat_lanes[r.get("lane") or "unknown"] += 1
    last_head[head], last_exact[exact] = r, r
measured = sum("base_sha" in r for r in rows)
print(f"METADATA base_sha={sum(bool(r.get('base_sha')) for r in rows)}/{len(rows)} "
      f"pr_number={sum(r.get('pr_number') is not None for r in rows)}/{len(rows)} "
      f"lane={sum(bool(r.get('lane')) for r in rows)}/{len(rows)}")
print(f"REASONS {measured}/{len(rows)} receipts have new metadata; "
      + " ".join(f"{key}={reasons[key]}" for key in ("first", "different_command", "after_red", "after_green", "after_base_move", "after_green_base_unknown")))
print(f"AVOIDABLE CANDIDATES {reasons['after_green'] + reasons['after_base_move']} "
      "(same head + command after green, with unchanged or moved base; a moved base alone does not prove motive)")
for label, counts in (("REPEAT_REPO", repeat_repos), ("REPEAT_LANE", repeat_lanes)):
    for name, count in counts.most_common(5):
        print(f"{label} {name} {count}")
# Pressure observations are evidence; configured admission limits belong to each host.
by_host = collections.defaultdict(list)
for r in rows:
    by_host[r.get("host", "?")].append(r)
for host, rs in sorted(by_host.items()):
    hp = sorted(r["start_host_cpu_pressure"] for r in rs if isinstance(r.get("start_host_cpu_pressure"), (int, float)))
    waits = sorted(r.get("waited_s", 0) for r in rs)
    p50 = f"{hp[len(hp) // 2]:.1f}" if hp else "-"
    print(f"HOST {host}: {len(rs)} runs, p50 wait {waits[len(waits) // 2]}s, host cpu avg60 at admission p50 {p50} "
          f"({len(hp)} measured), timeouts {sum(1 for r in rs if r.get('exit') == 124 or r.get('timed_out'))}")
disk = disk_summary(history, since)
for host, summary in disk["hosts"].items():
    print(f"DISK {host}: last20 admitted n={summary['n']} qualified={summary['measured_n']} "
          f"unknown={summary['unknown_n']} missing_history={summary['missing_history_n']} "
          f"whole20 p99={summary['sampled_highwater_p99_bytes']} "
          f"qualified-subset p99={summary['qualified_subset_p99_bytes']} "
          f"observed lower-bound max={summary['observed_highwater_lower_bound_max_bytes']} bytes "
          f"({summary['observed_n']} numeric rows including partials); "
          "host-shared sampled lower bounds, not exact transient peaks or a floor")
performance = throughput(history, since, now)
rolling_since = (now - dt.timedelta(hours=24)).isoformat()
performance_24h = throughput(history, rolling_since, now)
history_coverage = {"requested_hours": hours, "missing_hosts": missing.split(",") if missing else [],
                    "rolling_24h_requested": hours >= 24,
                    "limits": "Both timing windows reuse the same retained history already read; completeness/expired records unknown. Requested history shorter than 24h cannot cover the rolling window."}
for group in performance["groups"]:
    print(f"THROUGHPUT {group['repo']} {group['class']}: n={group['n']} "
          f"wait p90={group['wait_p90_s']}s wall p50={group['wall_p50_s']}s "
          f"passed={group['passed_n']} passed wait p90={group['passed_wait_p90_s']}s passed wall p50={group['passed_wall_p50_s']}s "
          f"phase coverage={group['phase_coverage']} turbo_cache={group['turbo_cache']}")
for label, window in (("SINCE", performance), ("ROLLING_24H", performance_24h)):
    print(f"TIMING_WINDOW {label} {window['window_from']}..{window['window_to']} history={history_coverage}")
    for group in window["groups"]:
        if label == "ROLLING_24H":
            print(f"THROUGHPUT_24H {group['repo']} {group['class']}: n={group['n']} wait p90={group['wait_p90_s']}s wall p50={group['wall_p50_s']}s")
        print(f"CAPACITY_CLAIM_WAIT {label} {group['repo']} {group['class']}: {json.dumps(group['capacity_claim_wait'], sort_keys=True)}")
print("PHASE_LABELS " + json.dumps(performance["phase_labels"], sort_keys=True))
print("TIMING submission-start cohort; nearest-rank percentiles; incomplete/unadmitted attempts excluded and counted; missing phases stay unknown")
cpu_missing = sorted(set(("beelink1", "beelink2")) - {s.get("from") for s in samples if not s.get("error")})
if cpu_missing:
    print(f"PARTIAL CPU telemetry missing from {','.join(cpu_missing)}")
for sample in samples:
    print(f"CPU_NOW {sample.get('from')}: at={sample.get('observed_at')} "
          f"sample={sample.get('interval_seconds')}s cores={sample.get('cores')} cpu={sample.get('cpu')} "
          f"runnable_threads={sample.get('runnable_threads')} pressure={sample.get('cpu_pressure')} admission={sample.get('admission')} "
          f"unattributed_cpu_pct={sample.get('unattributed_cpu_pct')} error={sample.get('error')}")
    for process in sample.get("processes", [])[:5]:
        print(f"CPU_PROCESS {sample.get('from')}: {json.dumps(process, sort_keys=True)}")
    for group in sample.get("groups", [])[:6]:
        print(f"CPU_CGROUP {sample.get('from')}: {json.dumps(group, sort_keys=True)}")
if json_output:
    sys.stdout.write(json.dumps({"window_from": since, "window_to": now.isoformat(),
                                "missing_hosts": missing.split(",") if missing else [],
                                "performance": performance, "performance_24h": performance_24h,
                                "timing_history_coverage": history_coverage, "disk": disk, "host_cpu_samples": samples,
                                "missing_cpu_hosts": cpu_missing,
                                "retained_job_logs": capacity_logs,
                                "github_metadata": {"enabled": bool(gh),
                                                    "cache_max_age_s": GITHUB_METADATA_CACHE_SECONDS,
                                                    "cache_age_s": None,
                                                    "canonical_names": {repo: name for repo, name in canonical_names.items() if repo not in canonical_unknown},
                                                    "canonical_unknown": sorted(canonical_unknown),
                                                    "merged_counts_requested": False}}, sort_keys=True) + "\n")
sys.exit(75 if missing or cpu_missing else 0)
