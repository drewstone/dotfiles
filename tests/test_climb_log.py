"""climb-log refuses ledger numbers that do not say how their sample was chosen.

The refused rows replay the numbers retracted on 2026-10-10; each has a corrected twin that passes.
"""
import copy
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent / 'claude' / 'tools' / 'climb-log'
GLOBAL_ATTRIBUTES = Path(__file__).resolve().parent.parent / 'git' / 'gitattributes_global'


def measurement(**overrides):
    block = {
        'metric': 'turn stream events p50', 'unit': 'events', 'basis': 'measured',
        'selection': 'every turn stream on b81b whose request started in the window',
        'selectBy': 'start', 'n': 212,
        'window': {'from': '2026-10-10T21:00:00Z', 'to': '2026-10-10T23:00:00Z'},
        'codeVersion': 'gtm-agent@db179c57', 'deployedAt': '2026-10-10T20:41:00Z',
    }
    block.update(overrides)
    return {k: v for k, v in block.items() if v is not None}


def comparison(**result_overrides):
    """A code change measured before and after: the shape of the coalescing row."""
    return {
        'id': 'coalesce-events-20261010', 'project': 'gtm-agent', 'layer': 'product', 'hill': 'turn-event-coalescing',
        'category': 'code', 'lever': 'agent-app#946 coalesced turn events', 'prediction': 'p50 events per stream < 2,000',
        'outcome': 'PENDING', 'timestamp': '2026-10-11T00:10:00Z',
        'baseline': {'value': 32401, 'measurement': measurement(
            codeVersion='gtm-agent@9c6b7a92', deployedAt='2026-10-10T17:02:00Z',
            window={'from': '2026-10-10T18:00:00Z', 'to': '2026-10-10T20:00:00Z'})},
        'result': {'value': 1904, 'measurement': measurement(**result_overrides)},
    }


def baseline_row(**block_overrides):
    block = measurement(metric='failure detection lag p95', unit='min', instrument='GET /api/admin/reliability',
                        calibration={'verdict': 'PASS', 'check': 'tests/reliability-lag.test.ts',
                                     'against': 'the 09:13Z request and its 19:43Z notice, read from D1'})
    block.update(block_overrides)
    return {
        'id': 'baseline-failure-detection-lag-20261011', 'project': 'gtm-agent', 'layer': 'system',
        'hill': 'failure-detection-lag', 'category': 'criteria', 'lever': 'baseline', 'prediction': 'p95 <= 15 min',
        'outcome': 'PENDING', 'timestamp': '2026-10-11T00:20:00Z',
        'baseline': {'value': 630, 'measurement': {k: v for k, v in block.items() if v is not None}}, 'result': None,
    }


class Ledger(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'widget'
        (self.root / '.agent').mkdir(parents=True)
        self.ledger = self.root / '.agent' / 'climb.jsonl'

    def tearDown(self):
        self.tmp.cleanup()

    def git_env(self):
        # The host's Git configuration stays out of the fixture: its global config, the system config, and
        # $XDG_CONFIG_HOME/git/attributes, which git/install.sh links to the global attributes file and Git
        # reads even when no config names it. The fixture's own gitconfig starts empty.
        config = Path(self.tmp.name) / 'gitconfig'
        config.touch()
        return {**os.environ, 'GIT_CEILING_DIRECTORIES': self.tmp.name, 'GIT_CONFIG_GLOBAL': str(config),
                'GIT_CONFIG_NOSYSTEM': '1', 'XDG_CONFIG_HOME': str(Path(self.tmp.name) / 'xdg')}

    def run_tool(self, *args, stdin=None):
        return subprocess.run([str(TOOL), *args], input=stdin, capture_output=True, text=True, cwd=self.root,
                              env=self.git_env())

    def append(self, row):
        return self.run_tool('append', '--project', str(self.root), stdin=json.dumps(row))

    def assertRefused(self, row, *phrases):
        before = self.ledger.read_text() if self.ledger.exists() else ''
        r = self.append(row)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        for phrase in phrases:
            self.assertIn(phrase, r.stderr)
        self.assertEqual(self.ledger.read_text() if self.ledger.exists() else '', before, 'a refused row is not written')
        return r.stderr

    def assertAccepted(self, row):
        r = self.append(row)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.strip()


class RetractedNumbers(Ledger):
    def test_coalescing_p50_chosen_by_finish_time_across_releases_is_refused(self):
        row = comparison(selection='turn streams that finished in the hour', selectBy='finish',
                         window={'from': '2026-10-10T20:00:00Z', 'to': '2026-10-10T21:00:00Z'},
                         codeVersion='gtm-agent@9c6b7a92..db179c57')
        err = self.assertRefused(row, 'reaches into items the previous release served', 'names a range or a set',
                                 'is before deployedAt')
        self.assertIn('result.measurement', err)

    def test_coalescing_p50_chosen_by_start_after_the_deploy_passes(self):
        self.assertAccepted(comparison())

    def test_a_comparison_cannot_opt_out_of_one_code_version(self):
        self.assertRefused(comparison(perRelease=False, codeVersion=None), 'result.measurement.codeVersion')

    def test_failure_time_measured_from_its_notice_is_refused(self):
        self.assertRefused(baseline_row(selectBy='notice', perRelease=False),
                           'a duration (min) chosen by selectBy notice is biased')

    def test_failure_time_measured_from_its_request_passes(self):
        self.assertAccepted(baseline_row())

    def test_an_estimated_reclaim_is_refused(self):
        row = comparison(metric='disk reclaimed', unit='GiB', basis='estimated')
        self.assertRefused(row, 'an estimate belongs in prediction')

    def test_a_number_without_a_selection_rule_is_refused(self):
        row = comparison()
        row['result'] = {'value': '1,904 events p50'}
        self.assertRefused(row, 'result reports a number without result.measurement')
        row['result'] = '1,904 events p50'
        self.assertRefused(row, 'result reports a number as bare str')


class Contract(Ledger):
    def test_baseline_rows_name_instrument_and_calibration(self):
        self.assertRefused(baseline_row(instrument=None, calibration=None),
                           'baseline.measurement.instrument is missing', 'baseline.measurement.calibration is missing')
        self.assertRefused(baseline_row(calibration={'verdict': 'PASS', 'check': 'tests/x.test.ts'}), 'needs against')
        self.assertRefused(baseline_row(calibration={'verdict': 'UNCALIBRATED'}), 'UNCALIBRATED needs next')
        row = baseline_row(calibration={'verdict': 'UNCALIBRATED', 'next': 'replay 20 failures with known request times'})
        self.assertAccepted(row)

    def test_a_baseline_row_reports_a_value(self):
        row = baseline_row()
        row['baseline'] = None
        self.assertRefused(row, "reports the hill's current value")

    def test_a_multi_release_slo_declares_itself_and_still_names_its_window(self):
        row = baseline_row(metric='turn completion', unit='%', codeVersion=None, deployedAt=None, perRelease=False)
        row['layer'], row['hill'] = 'product', 'turn-completion'
        self.assertAccepted(row)
        row['id'] += '-b'
        row['baseline']['measurement'].pop('window')
        self.assertRefused(row, 'window needs from and to')

    def test_product_numbers_default_to_one_release(self):
        row = baseline_row(metric='turn completion', unit='%', codeVersion='latest')
        row['layer'], row['hill'] = 'product', 'turn-completion'
        self.assertRefused(row, 'codeVersion is missing or vague')

    def test_a_fixed_sample_needs_no_deploy_time(self):
        row = baseline_row(metric='first text p50', unit='s', selection='the 14 short asks in bench/latency.json',
                           selectBy='sample', n=14, window=None, deployedAt=None)
        self.assertAccepted(row)

    def test_operator_rows_are_not_per_release(self):
        row = baseline_row(metric='retracted numbers', unit='numbers', codeVersion=None, deployedAt=None)
        row['layer'], row['hill'], row['category'] = 'operator', 'measurement-correctness', 'criteria'
        self.assertAccepted(row)

    def test_rows_without_numbers_need_no_measurement(self):
        row = comparison()
        row['baseline'], row['result'] = {'routerBrandIntake': 'refused, no kit'}, {'value': None}
        self.assertAccepted(row)

    def test_numerals_are_not_dates_shas_versions_or_refs(self):
        row = comparison()
        row['baseline'] = {'label': 'hosted run on 6e961c70 at 2026-10-10T21:26Z (#1486, agent-app 0.132.3, glm-5.3)'}
        row['result'] = None
        self.assertAccepted(row)
        row['id'] += '-b'
        row['baseline'] = {'value': 'critique 9/18'}
        self.assertRefused(row, 'baseline reports a number without baseline.measurement')


class Commands(Ledger):
    def test_append_fills_identity_and_refuses_a_repeated_id(self):
        row = comparison()
        del row['id'], row['timestamp'], row['project']
        rid = self.assertAccepted(row)
        written = [json.loads(line) for line in self.ledger.read_text().splitlines()]
        self.assertEqual([r['id'] for r in written], [rid])
        self.assertEqual(written[0]['project'], 'widget')
        self.assertTrue(rid.startswith('turn-event-coalescing-'))
        again = copy.deepcopy(written[0])
        self.assertRefused(again, 'already has a row')

    def test_append_keeps_a_ledger_whose_last_line_has_no_newline(self):
        self.ledger.write_text('{"id": "old", "hill": "h"}')
        self.assertAccepted(comparison())
        lines = self.ledger.read_text().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual(json.loads(lines[0])['id'], 'old')

    def test_check_grandfathers_rows_before_the_policy_and_flags_new_ones(self):
        old = comparison(selectBy='finish')
        old['id'], old['timestamp'] = 'old', '2026-10-10T20:00:00Z'
        new = comparison(selectBy='finish')
        new['id'] = 'new'
        rows = (old, comparison(), new, comparison())
        self.ledger.write_text('\n'.join(json.dumps(r) for r in rows) + '\nnot json\n')
        r = self.run_tool('check', '--project', str(self.root), '--json')
        self.assertEqual(r.returncode, 1)
        report = json.loads(r.stdout)
        self.assertEqual(report['checked'], 2)  # the repeated row is an integrity failure, not a contract check
        self.assertEqual([f['id'] for f in report['rows']], ['new', 'coalesce-events-20261010', None])
        self.assertIn('id repeats line 2', report['rows'][1]['problems'][0])
        self.assertEqual([f['kind'] for f in report['rows']], ['contract', 'integrity', 'integrity'])
        r = self.run_tool('check', '--project', str(self.root), '--since', '2026-10-01')
        self.assertIn(':1 old', r.stdout)

    def test_check_passes_a_clean_ledger(self):
        self.ledger.write_text(json.dumps(comparison()) + '\n')
        r = self.run_tool('check', '--project', str(self.root))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn('1/1 rows since', r.stdout)

    def test_hills_counts_the_calibrated_instruments(self):
        uncalibrated = baseline_row(calibration={'verdict': 'UNCALIBRATED', 'next': 'replay known failures'})
        uncalibrated['hill'], uncalibrated['id'] = 'first-text', 'b-first-text'
        rows = [baseline_row(), uncalibrated, comparison()]
        self.ledger.write_text('\n'.join(json.dumps(r) for r in rows) + '\n')
        r = self.run_tool('hills', '--project', str(self.root), '--json')
        self.assertEqual(r.returncode, 0)
        report = json.loads(r.stdout)
        self.assertEqual((report['hills'], report['calibrated']), (3, 1))
        verdicts = {h['hill']: h['calibration'] for h in report['rows']}
        self.assertEqual(verdicts, {'failure-detection-lag': 'PASS', 'first-text': 'UNCALIBRATED',
                                    'turn-event-coalescing': 'no baseline'})
        self.assertEqual(self.run_tool('hills', '--project', str(self.root), '--strict').returncode, 1)

    def test_a_discovery_lab_project_uses_its_reports_ledger(self):
        (self.root / 'reports' / 'climb').mkdir(parents=True)
        self.assertAccepted(comparison())
        self.assertTrue((self.root / 'reports' / 'climb' / 'ledger.jsonl').is_file())
        self.assertFalse(self.ledger.exists())


class UnionMerge(Ledger):
    """Two PRs that each append rows merge cleanly under merge=union, and check rejects what a union gets wrong."""

    def git(self, *args, check=True):
        env = {**self.git_env(), 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.com',
               'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.com'}
        # A throwaway fixture repo: the machine's global hooks guard real commits, not these.
        return subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-C', str(self.root),
                               *args], capture_output=True, text=True, env=env, check=check)

    def row(self, rid):
        row = comparison()
        row['id'] = rid
        return row

    def branches(self, attributes):
        self.git('init', '-q', '-b', 'main')
        if attributes:
            (self.root / '.gitattributes').write_text('.agent/climb.jsonl merge=union\n')
        self.ledger.write_text(json.dumps(self.row('base')) + '\n')
        self.git('add', '-A')
        self.git('commit', '-qm', 'base')
        self.git('checkout', '-qb', 'a')
        self.assertAccepted(self.row('from-a'))
        self.git('commit', '-qam', 'a')
        self.git('checkout', '-q', 'main')
        self.git('checkout', '-qb', 'b')
        self.assertAccepted(self.row('from-b'))
        self.git('commit', '-qam', 'b')
        return self.git('merge', '-q', '--no-edit', 'a', check=False)

    def test_parallel_appends_merge_and_every_row_survives(self):
        merged = self.branches(attributes=True)
        self.assertEqual(merged.returncode, 0, merged.stdout + merged.stderr)
        ids = [json.loads(line)['id'] for line in self.ledger.read_text().splitlines()]
        self.assertEqual(sorted(ids), ['base', 'from-a', 'from-b'])
        check = self.run_tool('check', '--project', str(self.root), '--since', '2000-01-01')
        self.assertEqual(check.returncode, 0, check.stdout)

    def test_without_the_attribute_the_same_appends_conflict(self):
        self.assertNotEqual(self.branches(attributes=False).returncode, 0)

    def test_the_global_attributes_file_merges_a_branch_cut_before_the_repo_named_its_ledger(self):
        # git/install.sh points core.attributesFile at git/gitattributes_global on every host.
        (Path(self.tmp.name) / 'gitconfig').write_text(f'[core]\n\tattributesFile = {GLOBAL_ATTRIBUTES}\n')
        merged = self.branches(attributes=False)
        self.assertEqual(merged.returncode, 0, merged.stdout + merged.stderr)
        ids = sorted(json.loads(line)['id'] for line in self.ledger.read_text().splitlines())
        self.assertEqual(ids, ['base', 'from-a', 'from-b'])

    def test_append_names_a_ledger_without_the_attribute(self):
        self.git('init', '-q', '-b', 'main')
        r = self.append(self.row('x'))
        self.assertEqual(r.returncode, 0)
        self.assertIn('merge=union', r.stderr)
        (self.root / '.gitattributes').write_text('.agent/climb.jsonl merge=union\n')
        self.assertNotIn('merge=union', self.append(self.row('y')).stderr)

    def test_check_rejects_what_a_union_merge_gets_wrong_at_any_date(self):
        old = self.row('old')
        old['timestamp'] = '2026-10-01T00:00:00Z'
        edited = dict(old, outcome='PASS 1,904 events')
        pretty = json.dumps(self.row('pretty'), indent=1)
        self.ledger.write_text('\n'.join([json.dumps(old), json.dumps(edited), json.dumps(old), pretty]) + '\n')
        report = json.loads(self.run_tool('check', '--project', str(self.root), '--json').stdout)
        problems = {f['line']: ' '.join(f['problems']) for f in report['rows'] if f['kind'] == 'integrity'}
        self.assertIn('id repeats line 1', problems[2])
        self.assertIn('id repeats line 1', problems[3])
        self.assertIn('not one whole JSON object', problems[4])
        self.assertEqual(report['checked'], 0)


class BriefJudge(Ledger):
    def load(self):
        import importlib.machinery
        import importlib.util
        path = TOOL.parent.parent / 'skills' / 'report' / 'scripts' / 'brief-judge'
        loader = importlib.machinery.SourceFileLoader('brief_judge', str(path))
        spec = importlib.util.spec_from_loader('brief_judge', loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        return module

    def test_scores_reach_the_ledger_through_the_checked_append(self):
        bj = self.load()
        judge = {'requested': 'opus', 'served': ['claude-opus-5-5'], 'via': 'claude-cli', 'account': None, 'seconds': 12.5}
        rows = [{'key': 'answer', 'name': 'Answer', 'score': 2, 'fix': 'lead with the number'}]
        first = bj.append_ledger(self.ledger, self.root, '/tmp/brief.html', 'ab' * 32, 22, rows, rows, judge, None)
        second = bj.append_ledger(self.ledger, self.root, '/tmp/brief.html', 'cd' * 32, 25, rows, rows, judge, 22)
        written = [json.loads(line) for line in self.ledger.read_text().splitlines()]
        self.assertEqual([r['id'] for r in written], [first['id'], second['id']])
        self.assertEqual(written[0]['baseline']['measurement']['calibration']['verdict'], 'UNCALIBRATED')
        self.assertEqual((written[1]['outcome'], bj.last_score(self.ledger)), ('PASS 25/30', 25))
        self.assertEqual(self.run_tool('check', '--project', str(self.root), '--since', '2000-01-01').returncode, 0)

    def test_level_three_is_read_from_the_climb_rubric(self):
        bj = self.load()
        anchors = bj.load_anchors()
        self.assertEqual(sorted(anchors), sorted(key for key, *_ in bj.DIMENSIONS))
        for key, text in anchors.items():
            self.assertNotRegex(text, r'\]\(|\]\[|`', f'{key} keeps Markdown link syntax')
        self.assertIn('Feynman', anchors['refutation'])
        prompt = bj.build_prompt('Status: all good.', '[page structure] markdown', None, anchors)
        for text in anchors.values():
            self.assertIn(text, prompt)
        self.assertNotIn(' 3: ', ' '.join(levels for *_, levels in bj.DIMENSIONS))

    def test_a_rubric_missing_a_level_three_line_stops_the_judge(self):
        bj = self.load()
        text = bj.RUBRIC.read_text()
        start = text.index('\n   **3:**', text.index('**Shape:**'))
        rubric = self.root / 'climb.md'
        rubric.write_text(text[:start] + text[text.index('\n', start + 1):])
        with self.assertRaisesRegex(ValueError, r"no '3:' line for Shape$"):
            bj.load_anchors(rubric)


if __name__ == '__main__':
    unittest.main()
