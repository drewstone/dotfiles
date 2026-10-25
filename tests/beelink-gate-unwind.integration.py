#!/usr/bin/env python3
"""Real Bash/process/receipt checks, plus native SYSTEM cancellation cases.

Load the production functions, as the cache-lock integration does. Admission,
network, package installation and managed systemd placement are outside this
seam. Native cancellation cases use real managed jobs on a Beelink.
No executables or production functions are replaced.
"""
import argparse
import fcntl
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "claude/tools/beelink-gate"


def function(source, name):
    match = re.search(r"^( *)" + re.escape(name) + r"\(\) \{", source, re.M)
    assert match, name
    start = match.start()
    first_end = source.index("\n", start)
    if source[start:first_end].rstrip().endswith("}"):
        return source[start:first_end]
    end = source.index("\n" + match[1] + "}", first_end)
    return source[start:end + len(match[1]) + 2]


def seam(gate):
    source = gate.read_text()
    # Resolve libraries beside --gate, so a baseline comparison cannot silently
    # run the branch's libraries. Git show/archive can supply a baseline tree.
    library = gate.parent / "beelink-gate-lib"
    code = "set -uo pipefail\n"
    for name in ["install", "cache", "admission", "resources"]:
        code += (library / (name + ".sh")).read_text() + "\n"
    for name in ["sparse_normalize", "sparse_apply", "prune_build_dirs",
                 "receipt", "step", "reap_leftovers", "save_unpushed", "stop", "finish"]:
        code += function(source + "\n" + (library / "install.sh").read_text(), name) + "\n"
    code += r'''
root=$1 mode=$2
beelink_gate_metrics_source=$(cat "$3")
beelink=beelink2 host=local owner=fixture repo=gate
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa install_mode=no-install
cache_root="$root/cache" checkout="$cache_root/local/fixture/gate"
cache_max=1048576 build_root="$root/build" STATE_DIR="$root/state"
mkdir -p "$checkout/.git" "$cache_root/.locks" "$build_root" "$STATE_DIR"
lock="$cache_root/.locks/checkout.lock"
exec {lock_fd}>"$lock"
flock -x "$lock_fd"
printf 'fixture\n' > "$lock.holder"
exec {slot_fd}>"$root/slot.lock"
flock -x "$slot_fd"
started=$SECONDS deadline=$((SECONDS + 15)) max_hold=15
display=/usr/bin/true current= watchdog=0 timed_out=0 reaped=0 run_token="fixture-$$-$RANDOM"
gate_refs_taken=0 gate_refs_before= gate_turbo_fd= gate_turbo_root= disk_dir= bundle_note=
lock_released=0 observed_install_reserve_bytes=0 preview_result= waited=0
light=0 dev=0 starved=0 launcher=fixture start_load= start_pressure=
cpu_s= gate_node= native_rebuild= gate_cgroup_joined= cache_note= gate_workers=1
sparse_source= sparse_spec= checkout_temperature= start_host_pressure= gate_id=
base_sha= gate_pr= gate_lane= reserve_gate_bytes= reserve_host_drop= reserve_basis= reserve_du_ms=
timing_file= timing_phase=command fetch_s= pre_command_s= command_s= cleanup_s=
capacity_claim_wait_ms=0 admission_path= admission_signal= command_exit= post_command_exit= post_command_phase=
trap 'admission_signal=TERM; stop' TERM
@EXIT_TRAP@
if [ "$mode" = term ]; then
  # A real child survives the gate's TERM, keeping stop's sleep open so a
  # second TERM deterministically reaches the stop/EXIT transition.
  BEELINK_GATE_RUN=$run_token setsid /usr/bin/bash -c '
    trap "" TERM
    printf "%s\n" "$$" > "$1/child.pid"
    exec sleep 12
  ' child "$root" {lock_fd}>&- {slot_fd}>&- >/dev/null 2>&1 &
  current=$!
  printf 'ready\n' > "$root/ready"
  wait "$current"
else
  product_exit=0
  [ "$mode" != command-failure ] || product_exit=7
  step /usr/bin/bash -o pipefail -lc 'set -euo pipefail; echo ALL_REMAINING_CHECKS_EXIT="$1"; exit "$1"' product "$product_exit"
  result=$?
  timing_phase=post_command
  if [ "$mode" = post-command-unwind ]; then
    # Bash 5.2's genuine eval/errexit unwind diagnostic, after a real exit-0
    # child. This is a post-command error, NOT the unreproduced incident.
    set -e
    post_command() { eval false; }
    post_command
  fi
  if [ "$mode" = cleanup-failure ]; then
    # A real failed used-marker write must still fail the gate after exit 0.
    ln -s "$root/missing/marker" "$checkout/.git/beelink-gate-used"
  fi
  if [ "$mode" = unreadable-observation ]; then
    export BEELINK_GATE_COMMAND_STARTED_MS=1
    mkdir -p "$checkout/.turbo/runs"
    printf 'not JSON\n' > "$checkout/.turbo/runs/unreadable.json"
  fi
  exit "$result"
fi
'''
    return code.replace("@EXIT_TRAP@", re.search(r"^  trap finish\w* EXIT$", source, re.M)[0])


def case(gate, mode):
    with tempfile.TemporaryDirectory(prefix="gate-unwind-integration-") as tmp:
        root = Path(tmp)
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_")) and
               k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        driver = root / "gate-seam.sh"
        driver.write_text(seam(gate))
        capacity_lock = None
        if mode == "cleanup-term":
            locks = root / "cache/.locks"
            locks.mkdir(parents=True)
            capacity_lock = (locks / ".capacity.lock").open("a+")
            fcntl.flock(capacity_lock, fcntl.LOCK_EX)
        proc = subprocess.Popen(
            ["bash", "-c", driver.read_text(), "gate-unwind", str(root), mode,
             str(ROOT / "claude/tools/beelink_gate_metrics.py")],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            start_new_session=True)
        child_pid = None
        try:
            if mode == "cleanup-term":
                marker = root / "cache/local/fixture/gate/.git/beelink-gate-used"
                holder = root / "cache/.locks/checkout.lock.holder"
                deadline = time.monotonic() + 3
                while not (marker.exists() and not holder.exists()):
                    assert proc.poll() is None and time.monotonic() < deadline, "no cleanup boundary"
                    time.sleep(0.01)
                proc.send_signal(signal.SIGTERM)
                # Bash defers the handler while its actual prune Python waits
                # for this flock; unlock so the real cleanup can complete.
                fcntl.flock(capacity_lock, fcntl.LOCK_UN)
            if mode == "term":
                deadline = time.monotonic() + 3
                while not ((root / "ready").exists() and (root / "child.pid").exists()):
                    assert proc.poll() is None and time.monotonic() < deadline, "no ready child"
                    time.sleep(0.01)
                child_pid = int((root / "child.pid").read_text())
                proc.send_signal(signal.SIGTERM)
                # stop resets its TERM disposition before starting its real
                # two-second sleep. Wait for that disposition via /proc.
                deadline = time.monotonic() + 1
                while True:
                    status = (Path("/proc") / str(proc.pid) / "status").read_text()
                    caught = int(re.search(r"^SigCgt:\s*(\w+)", status, re.M)[1], 16)
                    if not caught & (1 << (signal.SIGTERM - 1)):
                        break
                    assert time.monotonic() < deadline, "stop did not handle TERM"
                    time.sleep(0.01)
                proc.send_signal(signal.SIGTERM)
            try:
                stdout, stderr = proc.communicate(timeout=8)
            except subprocess.TimeoutExpired:
                raise AssertionError(f"{mode}: gate cleanup exceeded 8 seconds") from None
            path = root / "state/receipts.jsonl"
            rows = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
            expected = {"pass": 0, "command-failure": 7, "post-command-unwind": 1,
                        "cleanup-failure": 3, "term": 143, "cleanup-term": 143,
                        "unreadable-observation": 0}[mode]
            expected_command = None if mode == "term" else 7 if mode == "command-failure" else 0
            expected_post = None if mode == "term" else expected if mode in (
                "post-command-unwind", "cleanup-failure", "cleanup-term") else 0
            expected_phase = {"post-command-unwind": "post_command", "cleanup-failure": "cleanup_used_marker",
                              "cleanup-term": "cleanup_signal"}.get(mode)
            lock_path = root / "cache/.locks/checkout.lock"
            with lock_path.open("a+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            passed = (proc.returncode == expected and len(rows) == 1 and
                      rows[0]["exit"] == expected and "command_exit" in rows[0] and
                      rows[0]["command_exit"] == expected_command and
                      rows[0].get("post_command_exit", "absent") == expected_post and
                      rows[0].get("post_command_phase") == expected_phase and
                      not Path(str(lock_path) + ".holder").exists())
            if mode == "unreadable-observation":
                passed = passed and rows[0]["timing"]["turbo_cache"]["unreadable"] == 1
            if child_pid is not None:
                passed = passed and not Path(f"/proc/{child_pid}").exists()
            return {"case": mode, "passed": passed, "exit": proc.returncode,
                    "receipt_exit": rows[0]["exit"] if rows else None,
                    "command_exit": rows[0].get("command_exit", "absent") if rows else "no receipt",
                    "post_command_exit": rows[0].get("post_command_exit", "absent") if rows else "no receipt",
                    "bash_unwind_diagnostic": "pop_var_context" in stderr,
                    "stderr": stderr if not passed else ""}
        finally:
            if capacity_lock is not None:
                capacity_lock.close()
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
            if child_pid is not None:
                try:
                    os.killpg(child_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            proc.communicate(timeout=2)


def native_job_case(gate, mode):
    """Prove exit-0 receipts and cancel-on-term using actual SYSTEM jobs.

    Run only on a Beelink through --light. The nested light gate has a genuine
    local Git origin, a real managed SYSTEM unit, and the maintained cancel CLI.
    No systemctl, systemd-run, SSH, Git or production function is replaced.
    """
    transport = (gate.parent / "beelink-gate-lib/source.sh").read_text()
    host_code = "\n".join(function(transport, name) for name in
                          ["canonical_beelink", "self_beelink"])
    host = subprocess.check_output(
        ["bash", "-c", host_code + '\nREG_EXE=${BEELINK_GATE_REG:-/mnt/c/Windows/System32/reg.exe}\nself_beelink'],
        text=True).strip()
    assert host in ("beelink1", "beelink2"), "native cancellation integration requires a real Beelink"
    with tempfile.TemporaryDirectory(prefix="gate-native-cancel-") as tmp:
        root = Path(tmp)
        origin = root / root.name / "repo"
        origin.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(origin)], check=True)
        tree = subprocess.check_output(["git", "-C", str(origin), "mktree"], input="", text=True).strip()
        sha = subprocess.check_output(["git", "-C", str(origin), "commit-tree", tree],
                                      input="native cancellation integration\n", text=True).strip()
        subprocess.run(["git", "-C", str(origin), "update-ref", "HEAD", sha], check=True)
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("BEELINK_GATE_", "BASH_FUNC_")) and
               k not in ("BASH_ENV", "SHELLOPTS", "BASHOPTS")}
        env.update(BEELINK_GATE_LOAD_WAIT="30s", BEELINK_GATE_MAX_HOLD="90s")
        # Keep SYSTEM jobs and their receipts in the real owner's state store;
        # schedule_cancellation runs independently under the user manager.
        state_assignment = next(line for line in gate.read_text().splitlines()
                                if line.startswith("STATE_DIR="))
        state = Path(subprocess.check_output(
            ["bash", "-c", state_assignment + '\nprintf "%s" "$STATE_DIR"'], env=env, text=True))
        command = r'''
trap 'printf "terminal\n" > "$1/native-terminal"' EXIT
printf 'ready\n' > "$1/native-ready"
while :; do printf 'native gate output\n'; sleep 0.05; done
'''
        positive = mode.startswith("native-pass")
        if positive:
            command = r'''
set -euo pipefail
printf 'ready\n' > "$1/native-ready"
if [ "$2" = native-pass-observation ]; then
  mkdir -p .turbo/runs
  printf 'not JSON\n' > .turbo/runs/unreadable.json
fi
echo CHECK_ONE_EXIT=0
echo CHECK_TWO_EXIT=0
echo ALL_REMAINING_CHECKS_EXIT=0
exit 0
'''
        retry_term = mode == "native-retry-term"
        if retry_term:
            # Invoke the production TEMPFAIL path in the real managed command.
            # This yields a terminal native attempt and exercises the frontend's
            # retry-wait machinery without replacing any executable or function.
            command = "\n".join(function(gate.read_text(), name) for name in
                                ["tempfail_line", "tempfail", "utc_in_minutes"])
            command += '\nTEMPFAIL=75\nprintf "ready\\n" > "$1/native-ready"\ntempfail "$(utc_in_minutes 5)" "retry wait integration"\n'
        payload = mode.startswith("native-pass-payload")
        product = ["/usr/bin/bash", "-lc" if positive else "-c", command,
                   "native-job", str(root), mode]
        if payload:
            # Use the real Windows SSH -> WSL route back to this same Beelink,
            # so the fixture Git origin stays accessible to the actual job.
            # SELF only controls transport selection; no executable is replaced.
            env["BEELINK_GATE_SELF"] = "beelink2" if host == "beelink1" else "beelink1"
            length = 5902 if mode.endswith("boundary") else 12000
            command = ("from pathlib import Path\n" +
                       f"Path({str(root / 'native-ready')!r}).write_text('ready\\n')\n" +
                       "print('ALL_REMAINING_CHECKS_EXIT=0', flush=True)\n# ")
            command += ("quotes '\" $ backticks ` tabs\t " * length)[:length - len(command)]
            assert len(command.encode()) == length
            product = ["python3", "-c", command]
        retry_options = ["--retry", "10"] if retry_term else []
        proc = subprocess.Popen(
            ["bash", str(gate.resolve()), "--light", "--pin-host", "--cancel-on-term", *retry_options, host,
             "file://" + str(origin), sha, "--", *product], env=env, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, start_new_session=True)
        gate_id = ""
        job = None
        output = bytearray()
        os.set_blocking(proc.stdout.fileno(), False)

        def native_alive():
            try:
                pid, birth = (job / "gate.pid").read_text().split()
                fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
                return fields[19] == birth and fields[0] not in ("Z", "X")
            except (FileNotFoundError, ProcessLookupError):
                return False

        def unit_active():
            result = subprocess.run(
                ["systemctl", "show", "beelink-gate-" + gate_id + ".service",
                 "-p", "ActiveState", "--value"], capture_output=True, text=True, timeout=4)
            return result.returncode == 0 and result.stdout.strip() in (
                "active", "activating", "reloading", "deactivating")

        try:
            deadline = time.monotonic() + 90
            while not (root / "native-ready").exists():
                try:
                    output.extend(os.read(proc.stdout.fileno(), 65536))
                except BlockingIOError:
                    pass
                match = re.search(rb"gate_id=(beelink[12]-[0-9a-f]{32})", output)
                if match:
                    gate_id = match[1].decode()
                assert proc.poll() is None and time.monotonic() < deadline, "native job never reached its real command"
                time.sleep(0.05)
            if not gate_id:
                try:
                    output.extend(os.read(proc.stdout.fileno(), 65536))
                except BlockingIOError:
                    pass
                match = re.search(rb"gate_id=(beelink[12]-[0-9a-f]{32})", output)
                gate_id = match[1].decode() if match else ""
            assert gate_id, "frontend did not publish its exact allocated gate ID"
            job = state / "jobs" / gate_id
            assert (job / "systemd-manager").read_text() == "system\n"
            if retry_term:
                # Wait for the actual owned sleep, not merely the preceding log.
                sleeper = None
                deadline = time.monotonic() + 20
                while sleeper is None and time.monotonic() < deadline:
                    try:
                        output.extend(os.read(proc.stdout.fileno(), 65536))
                    except BlockingIOError:
                        pass
                    children = Path(f"/proc/{proc.pid}/task/{proc.pid}/children").read_text().split()
                    for pid in children:
                        try:
                            argv = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
                            if argv[0] == b"sleep" and float(argv[1]) >= 30:
                                sleeper = int(pid)
                        except (FileNotFoundError, ProcessLookupError):
                            pass
                    if sleeper is None:
                        time.sleep(0.05)
                assert sleeper is not None, "frontend never reached a real between-attempt retry sleep"
                assert (job / "exit").read_text().strip() == "75" and not native_alive() and not unit_active()
                term_at = time.monotonic()
                proc.send_signal(signal.SIGTERM)
                tail, _ = proc.communicate(timeout=8)
                output.extend(tail)
                elapsed = time.monotonic() - term_at
                sleeper_reaped = not Path(f"/proc/{sleeper}").exists()
                terminal = (job / "exit").read_text().strip() == "75" and not native_alive() and not unit_active()
                return {"case": mode, "passed": proc.returncode == 143 and elapsed < 8 and sleeper_reaped and terminal,
                        "gate_id": gate_id, "frontend_exit": proc.returncode, "term_elapsed_s": round(elapsed, 3),
                        "retry_sleeper_reaped": sleeper_reaped, "native_exit": 75, "native_confirmed_terminal": terminal}
            if positive:
                tail, _ = proc.communicate(timeout=60)
                output.extend(tail)
                receipt = json.loads((job / "receipt.json").read_text())
                exit_code = int((job / "exit").read_text())
                admission_exit = (receipt["timing"]["admission_wait"] or {}).get("exit")
                unreadable = receipt["timing"]["turbo_cache"]["unreadable"]
                payload_intact = True
                payload_info = {}
                if payload:
                    args_file = job / "args"
                    stored = args_file.read_bytes().split(b"\0")
                    actual = base64.b64decode(stored[-2])
                    expected_hash = hashlib.sha256(command.encode()).hexdigest()
                    actual_hash = hashlib.sha256(actual).hexdigest()
                    submit_bytes = len(b"--job-submit " + gate_id.encode() + b" " + b" ".join(stored[:-1]))
                    boundary_valid = not mode.endswith("boundary") or submit_bytes <= 8192
                    payload_intact = (actual_hash == expected_hash and boundary_valid and
                                      args_file.stat().st_mode & 0o777 == 0o600)
                    payload_info = {"payload_bytes": len(actual), "expected_sha256": expected_hash,
                                    "received_sha256": actual_hash, "submit_argument_bytes": submit_bytes, "args_mode": oct(args_file.stat().st_mode & 0o777),
                                    "transport": "ssh Windows wsl.exe (same physical Beelink)"}
                return {"case": mode, "passed": payload_intact and proc.returncode == exit_code == receipt["exit"] ==
                        receipt.get("command_exit") == receipt.get("post_command_exit") == admission_exit == 0
                        and b"ALL_REMAINING_CHECKS_EXIT=0" in output
                        and (mode != "native-pass-observation" or unreadable == 1),
                        "gate_id": gate_id, "frontend_exit": proc.returncode, "exit_file": exit_code,
                        "receipt_exit": receipt["exit"], "command_exit": receipt.get("command_exit"),
                        "post_command_exit": receipt.get("post_command_exit"),
                        "admission_wait_exit": admission_exit, "unreadable_observations": unreadable, **payload_info}
            assert native_alive() and unit_active(), "no independent live SYSTEM job"
            # The native command writes to its retained log, independent of the
            # frontend's pipe and process group. It stops only through cancel-job.
            proc.stdout.close()
            if mode == "cancel-group-term":
                os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                return {"case": mode, "passed": False, "gate_id": gate_id,
                        "reason": "frontend survived closed stdout / group TERM"}
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and (native_alive() or unit_active()):
                time.sleep(0.1)
            canceled = (state / "jobs/.canceled" / gate_id).exists()
            terminal = (job / "exit").exists()
            stopped = not native_alive() and not unit_active()
            return {"case": mode, "passed": proc.returncode != 0 and canceled and terminal and stopped,
                    "frontend_exit": proc.returncode, "gate_id": gate_id,
                    "manager": "system", "canceled": canceled,
                    "native_terminal": terminal, "native_stopped": stopped}
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=3)
            if proc.stdout is not None:
                proc.stdout.close()
            # The red baseline must not leave the independently managed unit
            # running. Retire it only through the maintained exact-ID cancel CLI.
            if gate_id:
                cleanup = subprocess.run(["bash", str(gate.resolve()), "--cancel-job", gate_id],
                                         env=env, capture_output=True, text=True, timeout=40)
                assert cleanup.returncode == 0, "maintained fixture cancellation was not confirmed: " + cleanup.stderr


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", type=Path, default=GATE)
    parser.add_argument("--case", choices=["pass", "command-failure", "post-command-unwind",
                                          "cleanup-failure", "term", "cleanup-term",
                                          "unreadable-observation", "native-pass", "native-pass-observation",
                                          "native-pass-payload-boundary", "native-pass-payload-large", "native-retry-term", "cancel-group-term", "cancel-stdout-pipe"], action="append")
    args = parser.parse_args()
    rows = [(native_job_case(args.gate, mode) if mode.startswith(("native-", "cancel-")) else case(args.gate, mode))
            for mode in args.case or ["pass", "command-failure", "post-command-unwind", "cleanup-failure",
                                      "term", "cleanup-term", "unreadable-observation", "native-pass",
                                      "native-pass-observation", "native-pass-payload-boundary", "native-pass-payload-large",
                                      "native-retry-term", "cancel-group-term", "cancel-stdout-pipe"]]
    print(json.dumps({"bash": subprocess.check_output(["bash", "--version"], text=True).splitlines()[0],
                      "cases": rows, "passed": sum(row["passed"] for row in rows),
                      "total": len(rows)}, indent=2))
    raise SystemExit(0 if all(row["passed"] for row in rows) else 1)


if __name__ == "__main__":
    main()
