"""skill-run-log, skill-scoreboard and lead-scorecard against synthetic transcripts and ledgers.

Every test pins the clock (SKILL_LEDGER_NOW), the state root, and the Claude and Codex homes to a
temporary directory, and puts a gh-drew stub first on PATH, so nothing reads real sessions or GitHub.
"""

import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "claude" / "tools"
sys.path.insert(0, str(TOOLS))

from skill_ledger import core as L  # noqa: E402
from skill_ledger import outcomes as O  # noqa: E402

SID = "11111111-2222-3333-4444-555555555555"
T0 = dt.datetime(2026, 10, 9, 12, 0, tzinfo=dt.timezone.utc)


def ts(minutes: float) -> str:
    return (T0 + dt.timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def human(minutes, text, uuid="h"):
    return {"type": "user", "timestamp": ts(minutes), "uuid": uuid, "origin": {"kind": "human"},
            "promptSource": "typed", "message": {"role": "user", "content": text}}


def tool_use(minutes, name, args, msg_id, tool_id="t", usage=(10, 5)):
    return {"type": "assistant", "timestamp": ts(minutes), "uuid": f"a-{msg_id}",
            "message": {"id": msg_id, "model": "claude-test", "role": "assistant",
                        "usage": {"input_tokens": usage[0], "output_tokens": usage[1],
                                  "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0},
                        "content": [{"type": "tool_use", "id": tool_id, "name": name, "input": args}]}}


def tool_result(minutes, tool_id, text):
    return {"type": "user", "timestamp": ts(minutes), "uuid": f"r-{tool_id}",
            "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tool_id, "content": text}]}}


class Sandbox(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.state = base / "state"
        self.claude = base / "claude"
        self.codex = base / "codex"
        self.work = base / "work" / "proj"
        self.bin = base / "bin"
        for path in (self.state, self.claude / "projects" / "-work-proj", self.codex, self.work, self.bin):
            path.mkdir(parents=True)
        stub = self.bin / "gh-drew"
        stub.write_text("#!/bin/sh\necho '{\"data\": {}}'\n")
        stub.chmod(0o755)
        self.transcript = self.claude / "projects" / "-work-proj" / f"{SID}.jsonl"
        self.env = {
            "PATH": f"{self.bin}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
            "HOME": str(base), "XDG_STATE_HOME": str(self.state), "CLAUDE_CONFIG_DIR": str(self.claude),
            "CODEX_HOME": str(self.codex), "TZ": "UTC", "SKILL_SCOREBOARD_HOSTS": "",
        }

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, path: Path, entries):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a") as handle:
            for entry in entries:
                handle.write(json.dumps(entry, separators=(",", ":")) + "\n")

    def run_tool(self, tool, *args, now_minutes=None, session=True, check=True):
        env = dict(self.env)
        if now_minutes is not None:
            env["SKILL_LEDGER_NOW"] = ts(now_minutes)
        if session:
            env["CLAUDE_CODE_SESSION_ID"] = SID
        done = subprocess.run([sys.executable, str(TOOLS / tool), *args], cwd=self.work, env=env,
                              capture_output=True, text=True)
        if check and done.returncode != 0:
            self.fail(f"{tool} {args} exited {done.returncode}: {done.stderr}")
        return done

    def ledger(self, name=L.RUNS):
        path = self.state / "agent-work" / "proj" / name
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []


class VerdictMapTest(unittest.TestCase):
    def test_enum_labels_prefixes_and_sentences(self):
        self.assertEqual(L.map_verdict("PASS"), ("PASS", "enum"))
        self.assertEqual(L.map_verdict("request-changes"), ("FAIL", "label"))
        self.assertEqual(L.map_verdict("ITERATE"), ("PARTIAL", "label"))
        self.assertEqual(L.map_verdict("insufficient data"), ("BLOCKED", "label"))
        self.assertEqual(L.map_verdict("DEFERRED"), ("ABANDONED", "label"))
        self.assertEqual(L.map_verdict("BLOCKED: owner holds the deploy"), ("BLOCKED", "prefix"))
        self.assertEqual(L.map_verdict("KEEP_CURRENT: no latency benefit"), ("PASS", "prefix"))
        self.assertEqual(L.map_verdict("it went fine mostly"), (None, "unmapped"))
        self.assertEqual(L.map_verdict("n/a"), (None, "missing"))

    def test_tables_hold_only_enum_values(self):
        for value in list(L.LABEL_VERDICTS.values()) + list(L.SENTENCE_VERDICTS.values()):
            self.assertIn(value, L.VERDICTS)
        for key in L.SENTENCE_VERDICTS:
            self.assertRegex(key, r"^[0-9a-f]{16}$")

    def test_sentence_lookup_is_by_hash(self):
        text = "a verdict sentence written by hand"
        key = hashlib.sha1(text.encode()).hexdigest()[:16]
        L.SENTENCE_VERDICTS[key] = "PARTIAL"
        try:
            self.assertEqual(L.map_verdict(text), ("PARTIAL", "sentence"))
        finally:
            del L.SENTENCE_VERDICTS[key]


class LogTest(Sandbox):
    def session_transcript(self):
        self.write(self.transcript, [
            human(0, "please verify the change"),
            tool_use(1, "Skill", {"skill": "verify"}, "m1", "t1"),
            tool_use(3, "Bash", {"command": "gh pr create --fill"}, "m2", "t2"),
            tool_result(4, "t2", "https://github.com/acme/widget/pull/5"),
            tool_use(5, "Bash", {"command": "pnpm test"}, "m3", "t3"),
            tool_use(5.1, "Bash", {"command": "pnpm test"}, "m3", "t3b"),  # same message id: counted once
            tool_use(10.9, "Bash", {"command": 'skill-run-log /verify --target "acme" --verdict APPROVE'}, "m4", "t4"),
        ])

    def test_log_captures_session_duration_tokens_and_prs(self):
        self.session_transcript()
        done = self.run_tool("skill-run-log", "/verify", "--target", "acme widget", "--verdict", "APPROVE",
                             "--metric", "p90 latency", "--unit", "ms", "--before", "420", "--after", "310",
                             "--source", "run-1", "--prediction", "p90 below 350 ms", "--score", "24",
                             "--next", "/ship", now_minutes=11)
        self.assertIn("logged: /verify -> /ship (PASS)", done.stdout)
        row = self.ledger()[-1]
        self.assertEqual((row["schema"], row["layer"], row["hill"]), (2, "operator tools", "skill:/verify"))
        self.assertEqual((row["verdict"], row["verdictDetail"]), ("PASS", "APPROVE"))
        self.assertEqual(row["durationMin"], 10.0)
        self.assertEqual(row["durationSource"], "transcript:Skill")
        self.assertEqual(row["session"]["id"], SID)
        self.assertIsNone(row["session"]["agentId"])
        self.assertEqual(row["transcriptPath"], str(self.transcript))
        self.assertEqual(row["prs"], [{"repo": "acme/widget", "number": 5, "how": "pr-create"}])
        self.assertEqual(row["outcome"]["status"], "PENDING")
        self.assertEqual(row["cost"]["tokens"]["input"], 40)  # m1..m4 inside the window; m3's repeat counted once
        self.assertEqual(row["metrics"], [{"name": "p90 latency", "unit": "ms", "before": 420, "after": 310, "source": "run-1"}])
        self.assertEqual((row["prediction"], row["score"]), ("p90 below 350 ms", 24))
        self.assertIsNone(row["operatorOverride"])

    def test_subagent_call_is_attributed_to_the_subagent(self):
        self.session_transcript()
        sub = self.transcript.parent / SID / "subagents" / "agent-abc123.jsonl"
        self.write(sub, [tool_use(10.95, "Bash", {"command": "skill-run-log /verify --verdict PASS"}, "s1", "s1")])
        self.run_tool("skill-run-log", "/verify", "--verdict", "PASS", now_minutes=11)
        row = self.ledger()[-1]
        self.assertEqual(row["session"]["agentId"], "abc123")
        self.assertEqual(row["transcriptPath"], str(sub))
        self.assertEqual(row["session"]["mainTranscriptPath"], str(self.transcript))

    def test_free_text_verdict_is_refused(self):
        done = self.run_tool("skill-run-log", "/verify", "--verdict", "mostly fine", now_minutes=11, check=False)
        self.assertEqual(done.returncode, 2)
        self.assertIn("--detail", done.stderr)
        self.assertEqual(self.ledger(), [])

    def test_without_a_session_the_row_still_lands(self):
        self.run_tool("skill-run-log", "verify", "--verdict", "FAIL", "--duration", "3.5", now_minutes=11, session=False)
        row = self.ledger()[-1]
        self.assertEqual((row["skill"], row["verdict"], row["durationMin"], row["durationSource"]), ("/verify", "FAIL", 3.5, "flag"))
        self.assertIsNone(row["session"])


class SettleTest(Sandbox):
    def test_next_operator_message_settles_the_correction(self):
        self.write(self.transcript, [
            human(0, "verify it"),
            tool_use(1, "Skill", {"skill": "verify"}, "m1", "t1"),
            tool_use(4.9, "Bash", {"command": "skill-run-log /verify --verdict PASS"}, "m2", "t2"),
        ])
        self.run_tool("skill-run-log", "/verify", "--verdict", "PASS", now_minutes=5)
        self.write(self.transcript, [human(8, "no, that's wrong: the served page still 500s", uuid="h2")])
        self.run_tool("skill-run-log", "--settle", "--session", SID, now_minutes=9)
        events = self.ledger(L.EVENTS)
        self.assertEqual(len(events), 1)
        self.assertEqual((events[0]["operatorOverride"], events[0]["basis"], events[0]["layer"]), (True, "next-operator-message", "operator"))
        self.assertEqual(events[0]["evidence"]["uuid"], "h2")
        # Settled once: a second pass adds nothing.
        self.run_tool("skill-run-log", "--settle", "--session", SID, now_minutes=10)
        self.assertEqual(len(self.ledger(L.EVENTS)), 1)

    def test_quiet_window_settles_false_after_twelve_hours(self):
        self.write(self.transcript, [
            human(0, "verify it"),
            tool_use(1, "Skill", {"skill": "verify"}, "m1", "t1"),
            tool_use(4.9, "Bash", {"command": "skill-run-log /verify --verdict PASS"}, "m2", "t2"),
        ])
        self.run_tool("skill-run-log", "/verify", "--verdict", "PASS", now_minutes=5)
        self.run_tool("skill-run-log", "--settle", "--session", SID, now_minutes=60)
        self.assertEqual(self.ledger(L.EVENTS), [])  # window still open
        self.run_tool("skill-run-log", "--settle", "--session", SID, now_minutes=13 * 60)
        self.assertEqual(self.ledger(L.EVENTS)[-1]["operatorOverride"], False)

    def test_explicit_override_outranks_the_labeler(self):
        self.write(self.transcript, [human(0, "go"), tool_use(4.9, "Bash", {"command": "skill-run-log /ship --verdict PASS"}, "m1", "t1")])
        self.run_tool("skill-run-log", "/ship", "--verdict", "PASS", now_minutes=5)
        self.run_tool("skill-run-log", "--override", "--theme", "rigor", "--note", "served revision was stale", now_minutes=6)
        self.write(self.transcript, [human(8, "great, thanks")])
        self.run_tool("skill-run-log", "--settle", "--session", SID, now_minutes=13 * 60)
        files = {f"proj/{name}": (self.state / "agent-work" / "proj" / name).read_text() for name in (L.RUNS, L.EVENTS)}
        row = L.rows_from_files(files, "test")[0]
        self.assertEqual((row["operatorOverride"], row["overrideBasis"]), (True, "explicit"))

    def test_classifier_markers(self):
        for text in ("no, redo the chart", "have you even read the drivers?", "they shouldn't run the CLI",
                     "Literally do not stop until parity", "this is not what I asked"):
            self.assertTrue(L.classify_followup(text)[0], text)
        for text in ("yalla keep going!", "i like it, can we make a list?", "do you think a cheaper model would do instead?"):
            self.assertFalse(L.classify_followup(text)[0], text)


class BackfillTest(Sandbox):
    def test_schema1_rows_link_without_touching_the_original(self):
        runs = self.state / "agent-work" / "proj" / L.RUNS
        runs.parent.mkdir(parents=True)
        original = json.dumps({"skill": "/diagnose", "ts": ts(20)[:19] + "Z", "project": "proj", "target": "t",
                               "operatorPrompt": "", "durationMin": None, "verdict": "ROOT_CAUSE_CONFIRMED",
                               "dispatchedTo": "stop", "operatorOverride": None, "transcriptPath": None, "traceDir": None})
        unlinked = json.dumps({"skill": "report", "ts": ts(30)[:19] + "Z", "verdict": "PARTIAL: half"})
        runs.write_text(original + "\n" + unlinked + "\n")
        before = runs.read_bytes()
        self.write(self.transcript, [
            human(0, "why does it fail"),
            tool_use(2, "Read", {"file_path": f"{self.claude}/skills/diagnose/SKILL.md"}, "m1", "t1"),
            tool_use(19.9, "Bash", {"command": "skill-run-log /diagnose --verdict ROOT_CAUSE_CONFIRMED"}, "m2", "t2"),
            tool_result(20.01, "t2", f"logged: /diagnose -> stop (ROOT_CAUSE_CONFIRMED) [/elsewhere/agent-work/proj/{L.RUNS}]"),
            human(25, "why did you skip the served check?", uuid="h9"),
        ])
        done = self.run_tool("skill-run-log", "--backfill", now_minutes=40, session=False)
        self.assertIn("linked 1", done.stdout)
        self.assertEqual(runs.read_bytes(), before)
        rows = self.ledger(L.BACKFILL)
        self.assertEqual(len(rows), 2)
        linked, other = rows
        self.assertEqual((linked["verdict"], linked["verdictDetail"], linked["verdictRule"]), ("PASS", "ROOT_CAUSE_CONFIRMED", "label"))
        self.assertTrue(linked["backfill"]["linked"])
        self.assertEqual(linked["session"]["id"], SID)
        self.assertEqual(linked["durationMin"], 18.0)
        self.assertEqual((linked["operatorOverride"], linked["overrideBasis"]), (True, "next-operator-message"))
        self.assertEqual((other["verdict"], other["skill"], other["backfill"]["linked"]), ("PARTIAL", "/report", False))


class CodexScanTest(Sandbox):
    def test_codex_rollout_supplies_start_logs_humans_and_tokens(self):
        rollout = self.codex / "sessions" / "2026" / "10" / "09" / "rollout-2026-10-09T12-00-00-tid.jsonl"
        def line(minutes, kind, payload):
            return {"timestamp": ts(minutes), "type": kind, "payload": payload}
        self.write(rollout, [
            line(0, "session_meta", {"id": "tid"}),
            line(0.5, "event_msg", {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 100, "output_tokens": 10}}}),
            line(1, "response_item", {"type": "function_call", "call_id": "c1", "arguments": json.dumps({"cmd": "cat ~/.codex/skills/ship/SKILL.md"})}),
            line(6, "event_msg", {"type": "item_completed", "item": {"type": "CommandExecution", "command": ["zsh", "-lc", "skill-run-log /ship --verdict PASS"],
                                                                      "aggregated_output": f"logged: /ship -> stop (PASS) [/x/agent-work/proj/{L.RUNS}]\n"}}),
            line(5.5, "event_msg", {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 400, "output_tokens": 70}}}),
            line(6.5, "event_msg", {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 900, "output_tokens": 90}}}),
            line(7, "event_msg", {"type": "item_completed", "item": {"type": "UserMessage", "id": "u1", "content": [{"type": "text", "text": "redo it"}]}}),
            line(8, "event_msg", {"type": "item_completed", "item": {"type": "UserMessage", "id": "u2", "content": [{"type": "text", "text": "[fleet-message-id:x] read /inbox/1.json"}]}}),
        ])
        events = L.scan(rollout)
        self.assertEqual([e.data["uuid"] for e in events if e.kind == "human"], ["u1"])  # fleet notices are not the operator
        kinds = [e.kind for e in events]
        self.assertIn("skill", kinds)
        self.assertIn("log", kinds)
        self.assertIn("human", kinds)
        log = next(e for e in events if e.kind == "log")
        measured = L.measure(events, "/ship", log.ts)
        self.assertEqual(measured["durationMin"], 5.0)
        self.assertEqual(measured["cost"]["tokens"]["input"], 300)
        self.assertEqual(L.transcript_session(rollout)["harness"], "codex")


class OutcomeTest(unittest.TestCase):
    AT = dt.datetime(2026, 10, 20, tzinfo=dt.timezone.utc)

    def pr(self, **extra):
        base = {"repo": "acme/widget", "number": 10, "title": "feat: add the widget export", "state": "MERGED", "merged": True,
                "mergedAt": "2026-10-09T00:00:00Z", "files": {"nodes": [{"path": "src/export.ts"}, {"path": "package.json"}]},
                "mergeCommit": {"oid": "abcdef1234567890", "statusCheckRollup": {"state": "SUCCESS"}, "deployments": {"nodes": []}}}
        base.update(extra)
        return base

    def test_clean_merge_passes_after_seven_days(self):
        snap = O.judge_pr(self.pr(), [], [], self.AT)
        self.assertEqual((snap["status"], snap["signal"], snap["windowClosed"], snap["final"]), ("PASS", "merged-clean-7d", True, True))
        early = O.judge_pr(self.pr(), [], [], dt.datetime(2026, 10, 10, tzinfo=dt.timezone.utc))
        self.assertEqual((early["status"], early["final"]), ("PENDING", False))

    def test_revert_and_causal_fix_fail_but_context_mentions_do_not(self):
        revert = {"number": 11, "title": 'Revert "feat: add the widget export"', "body": "", "mergedAt": "2026-10-10T00:00:00Z", "files": {"nodes": []}}
        self.assertEqual(O.judge_pr(self.pr(), [revert], [], self.AT)["signal"], "reverted-within-7d")
        fix = {"number": 12, "title": "fix(export): keep headers", "body": "After #10 deployed, exports lost headers.",
               "mergedAt": "2026-10-11T00:00:00Z", "files": {"nodes": [{"path": "src/export.ts"}]}}
        self.assertEqual(O.judge_pr(self.pr(), [fix], [], self.AT)["signal"], "hot-fixed-within-7d")
        context = {**fix, "body": "Tested on the base that includes #10 and its merge commit abcdef12."}
        snap = O.judge_pr(self.pr(), [context], [], self.AT)
        self.assertEqual((snap["signal"], snap["fixTouches"]), ("merged-clean-7d", 1))
        late = {**fix, "mergedAt": "2026-10-19T00:00:00Z"}
        self.assertEqual(O.judge_pr(self.pr(), [late], [], self.AT)["signal"], "merged-clean-7d")

    def test_red_ci_and_unmerged_close_fail(self):
        red = self.pr(mergeCommit={"oid": "a1", "statusCheckRollup": {"state": "FAILURE"}, "deployments": {"nodes": [{"latestStatus": {"state": "SUCCESS"}}]}})
        snap = O.judge_pr(red, [], [], self.AT)
        self.assertEqual((snap["signal"], snap["served"]), ("ci-red-after-merge", True))
        closed = self.pr(merged=False, mergedAt=None, state="CLOSED", closedAt="2026-10-09T00:00:00Z")
        self.assertEqual(O.judge_pr(closed, [], [], self.AT)["signal"], "closed-unmerged")

    def test_run_outcome_combines_prs(self):
        snaps = {("acme/widget", 1): {"status": "PASS", "signal": "merged-clean-7d", "windowClosed": True},
                 ("acme/widget", 2): {"status": "FAIL", "signal": "ci-red-after-merge", "windowClosed": False}}
        both = O.run_outcome([{"repo": "acme/widget", "number": 1}, {"repo": "acme/widget", "number": 2}], snaps)
        self.assertEqual((both["status"], both["windowClosed"]), ("FAIL", False))
        self.assertEqual(O.run_outcome([{"repo": "Acme/Widget", "number": 1}], snaps)["status"], "PASS")
        self.assertIsNone(O.run_outcome([], snaps))


class ScoreboardTest(Sandbox):
    def seed(self):
        runs = self.state / "agent-work" / "proj" / L.RUNS
        runs.parent.mkdir(parents=True)
        rows = [
            {"skill": "/verify", "ts": ts(0)[:19] + "Z", "verdict": "PASS", "durationMin": None},
            {"skill": "/verify", "ts": ts(60)[:19] + "Z", "verdict": "REQUEST_CHANGES", "durationMin": 4},
            {"schema": 2, "runId": "run-a", "skill": "/verify", "ts": ts(120)[:19] + "Z", "verdict": "PASS", "durationMin": 10,
             "score": 21, "skillSha": "abc", "metrics": [{"name": "p90", "unit": "ms", "before": 400, "after": 300, "source": None}],
             "session": {"id": SID}, "prs": []},
        ]
        runs.write_text("".join(json.dumps(r) + "\n" for r in rows))
        (runs.parent / L.EVENTS).write_text(json.dumps({"event": "override", "runKey": "run-a", "operatorOverride": True,
                                                         "method": "explicit", "basis": "explicit"}) + "\n")

    def test_json_summary_and_coverage(self):
        self.seed()
        done = self.run_tool("skill-scoreboard", "--local", "--no-join", "--json", "--since", "2d", now_minutes=180, session=False)
        report = json.loads(done.stdout)
        verify = report["skills"][0]
        self.assertEqual((verify["skill"], verify["summary"]["runs"]), ("/verify", 3))
        self.assertEqual(verify["summary"]["claimedPassPct"], 67)
        self.assertEqual((verify["summary"]["corrected"], verify["summary"]["judged"]), (1, 1))
        self.assertEqual(verify["summary"]["judgeScoreP50"], 21)
        self.assertEqual(verify["summary"]["metrics"]["p90"]["delta"], -100)
        self.assertEqual(report["coverage"]["durationMin"]["schema1Original"], 1)
        self.assertEqual(report["coverage"]["verdict"]["schema1Original"], 1)
        text = self.run_tool("skill-scoreboard", "--local", "--no-join", "--since", "2d", now_minutes=180, session=False).stdout
        self.assertIn("/verify", text)
        self.assertIn("Capture coverage", text)

    def test_climb_export_appends_once(self):
        self.seed()
        ledger = self.work / ".agent" / "climb.jsonl"
        for _ in range(2):
            self.run_tool("skill-scoreboard", "--local", "--no-join", "--climb", "--append", str(ledger), "--since", "2d",
                          now_minutes=180, session=False)
        rows = [json.loads(l) for l in ledger.read_text().splitlines()]
        layers = sorted({r["layer"] for r in rows})
        self.assertEqual(layers, ["operator", "operator tools"])
        self.assertEqual(len(rows), len({r["id"] for r in rows}))
        self.assertTrue(all("quote" not in r for r in rows))


class LeadScorecardTest(Sandbox):
    def test_incidents_decisions_and_guard_rows(self):
        run = lambda *a, m=0: self.run_tool("lead-scorecard", *a, now_minutes=m, session=False)
        run("incident", "open", "inc-1", "--started", ts(0), "--detected", ts(30), "--summary", "502s on chat")
        run("incident", "recover", "inc-1", "--at", ts(90))
        run("decision", "ask", "q-1", "--question", "spend cap?", "--asked", ts(60))
        guards = self.state / "agent-work" / "_guards" / "secret-scan.jsonl"
        guards.parent.mkdir(parents=True)
        guards.write_text(json.dumps({"ts": ts(10), "guard": "secret-scan", "decision": "deny"}) + "\n"
                          + json.dumps({"ts": ts(11), "guard": "kill-guard", "decision": "allow"}) + "\n")
        report = json.loads(run("--local", "--no-github", "--json", "--days", "1", m=180).stdout)
        day = report["days"][-1]
        self.assertEqual((day["incidentsOpened"], day["ttdHoursP50"], day["ttrHoursP50"]), (1, 0.5, 1.0))
        self.assertEqual((day["queueOpenAtEnd"], day["queueOldestHours"]), (1, 2.0))
        self.assertEqual((day["violations"], day["violationsByGuard"]), (1, {"secret-scan": 1}))
        climb = run("--local", "--no-github", "--climb", "--days", "1", m=180).stdout.splitlines()
        hills = {json.loads(line)["hill"] for line in climb}
        self.assertIn("operator:time-to-recover", hills)


if __name__ == "__main__":
    unittest.main()
