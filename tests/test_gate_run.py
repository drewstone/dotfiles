"""host/gates/gate-run and its shims: heavy agent gates are capped and queued, servers and nested calls are not."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

GATES = Path(__file__).resolve().parents[1] / 'host/gates'
LOADER = importlib.machinery.SourceFileLoader('gate_run', str(GATES / 'gate-run'))
SPEC = importlib.util.spec_from_loader('gate_run', LOADER)
gate = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(gate)


class ClassifyTests(unittest.TestCase):
    def test_installs_builds_checks_and_tests_are_gated(self):
        for tool, args in (('pnpm', ['install']), ('pnpm', ['i', '--frozen-lockfile']), ('pnpm', ['-C', 'apps/x', 'test']),
                           ('pnpm', ['run', 'check-types']), ('pnpm', ['--filter', 'web', 'build']), ('pnpm', ['typecheck']),
                           ('pnpm', ['exec', 'vitest', 'run']), ('pnpm', ['-r', 'run', 'test:unit']), ('pnpm', ['turbo', 'check-types']),
                           ('npm', ['ci']), ('npm', ['test']), ('npx', ['vitest', 'run']), ('npx', ['tsc', '--noEmit']),
                           ('turbo', ['run', 'check-types', 'test']), ('turbo', ['build']), ('vitest', ['run']), ('vitest', []),
                           ('tsc', ['-p', 'tsconfig.json'])):
            self.assertTrue(gate.is_heavy(tool, args), (tool, args))

    def test_servers_watchers_and_quick_commands_are_not(self):
        for tool, args in (('pnpm', ['dev']), ('pnpm', ['run', 'dev:web']), ('pnpm', ['exec', 'vite', 'preview']),
                           ('pnpm', ['start']), ('pnpm', ['--version']), ('pnpm', ['store', 'path']), ('pnpm', ['ls']),
                           ('pnpm', []), ('pnpm', ['run', 'test:watch']), ('npx', ['tsx', 'scripts/serve.ts']),
                           ('turbo', ['run', 'dev']), ('turbo', ['daemon', 'status']), ('vitest', ['--watch']),
                           ('vitest', ['watch']), ('tsc', ['--watch']), ('tsc', ['--version'])):
            self.assertFalse(gate.is_heavy(tool, args), (tool, args))


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp(prefix='gate-run-test-'))
        (self.base / 'config.json').write_text(json.dumps({'slots': 1, 'cpus': '0'}))
        self.env = {**os.environ, 'GATE_RUN_CONFIG': str(self.base / 'config.json'), 'GATE_RUN_STATE': str(self.base / 'state'),
                    'GATE_RUN_SCOPE': '0'}
        self.env.pop('GATE_RUN', None)

    def gate(self, name, seconds, env=None):
        log = self.base / 'log'
        script = f'echo "{name} start $(date +%s.%N) ${{GATE_RUN:-}}" >> {log}; sleep {seconds}; echo "{name} end $(date +%s.%N)" >> {log}'
        return subprocess.Popen([sys.executable, str(GATES / 'gate-run'), '--name', name, '--', 'bash', '-c', script],
                                env=env or self.env, stderr=subprocess.PIPE, text=True)

    def events(self):
        rows = [line.split() for line in (self.base / 'log').read_text().splitlines()]
        return [(r[0], r[1], float(r[2])) for r in rows]

    def test_one_slot_runs_gates_one_at_a_time_in_arrival_order(self):
        first = self.gate('a', 1.5)
        time.sleep(0.4)
        second = self.gate('b', 0.2)
        time.sleep(0.4)
        third = self.gate('c', 0.2)
        errors = {}
        for name, child in (('a', first), ('b', second), ('c', third)):
            errors[name] = child.communicate(timeout=30)[1]
            self.assertEqual(child.returncode, 0)
        events = self.events()
        self.assertEqual([(n, kind) for n, kind, _ in events],
                         [('a', 'start'), ('a', 'end'), ('b', 'start'), ('b', 'end'), ('c', 'start'), ('c', 'end')])
        self.assertIn('waits for one of 1 gate slots', errors['b'])

    def test_a_gate_inside_a_gate_runs_at_once_and_holds_no_second_slot(self):
        outer = self.gate('outer', 1.0)
        time.sleep(0.4)
        inner = self.gate('inner', 0.1, env={**self.env, 'GATE_RUN': 'outer'})
        inner.communicate(timeout=5)
        outer.communicate(timeout=10)
        self.assertEqual((inner.returncode, outer.returncode), (0, 0))
        names = [n for n, kind, _ in self.events() if kind == 'start']
        self.assertEqual(names, ['outer', 'inner'])

    def test_the_command_exit_code_comes_back(self):
        result = subprocess.run([sys.executable, str(GATES / 'gate-run'), '--', 'bash', '-c', 'exit 7'], env=self.env)
        self.assertEqual(result.returncode, 7)


class ShimTests(unittest.TestCase):
    def test_a_heavy_pnpm_command_goes_through_gate_run_and_a_server_does_not(self):
        base = Path(tempfile.mkdtemp(prefix='gate-run-shim-'))
        real = base / 'bin'
        real.mkdir()
        (real / 'pnpm').write_text('#!/usr/bin/env bash\necho "real pnpm $* gate=${GATE_RUN:-none}"\n')
        (real / 'pnpm').chmod(0o755)
        tools = base / 'tools'
        tools.mkdir()
        (tools / 'gate-run').symlink_to(GATES / 'gate-run')
        (base / 'config.json').write_text(json.dumps({'slots': 1, 'cpus': '0'}))
        env = {**os.environ, 'PATH': f"{GATES / 'shims'}:{tools}:{real}:/usr/bin:/bin", 'GATE_RUN_SCOPE': '0',
               'GATE_RUN_CONFIG': str(base / 'config.json'), 'GATE_RUN_STATE': str(base / 'state')}
        env.pop('GATE_RUN', None)
        heavy = subprocess.run(['pnpm', 'install'], env=env, capture_output=True, text=True)
        server = subprocess.run(['pnpm', 'dev'], env=env, capture_output=True, text=True)
        self.assertEqual(heavy.stdout.strip(), 'real pnpm install gate=pnpm install')
        self.assertEqual(server.stdout.strip(), 'real pnpm dev gate=none')


if __name__ == '__main__':
    unittest.main()
