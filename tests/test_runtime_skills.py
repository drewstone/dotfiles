"""install-runtime-skills.py against a local fake npm registry."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

INSTALLER = Path(__file__).resolve().parent.parent / 'claude' / 'install-runtime-skills.py'


def tarball(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
        for name, body in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(body)
            archive.addfile(info, io.BytesIO(body))
    return buffer.getvalue()


def integrity(data: bytes) -> str:
    return 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()


class Registry:
    """Serves one package version at /@tangle-network%2fagent-runtime/<spec>."""

    def __init__(self) -> None:
        self.versions: dict[str, tuple[bytes, str]] = {}
        registry = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args) -> None:
                pass

            def do_GET(self) -> None:
                if self.path.startswith('/tarballs/'):
                    version = self.path.rsplit('/', 1)[1].removesuffix('.tgz')
                    self.reply(200, registry.versions[version][0])
                    return
                spec = self.path.rsplit('/', 1)[1]
                version = max(registry.versions) if spec == 'latest' else spec
                if version not in registry.versions:
                    self.reply(404, b'{}')
                    return
                data, sri = registry.versions[version]
                meta = {'version': version, 'dist': {'tarball': f'{registry.url}/tarballs/{version}.tgz', 'integrity': sri}}
                self.reply(200, json.dumps(meta).encode())

            def reply(self, status: int, body: bytes) -> None:
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.url = f'http://127.0.0.1:{self.server.server_address[1]}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def publish(self, version: str, files: dict[str, bytes], sri: str | None = None) -> None:
        data = tarball(files)
        self.versions[version] = (data, sri or integrity(data))

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


def run(store: Path, registry: str, version: str = 'latest') -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(INSTALLER), '--store', str(store), '--registry', registry, '--version', version],
        capture_output=True,
        text=True,
    )


SKILL = b'---\nname: profile-authoring\ndescription: d\n---\n'


class InstallRuntimeSkillsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = Registry()
        self.home = tempfile.TemporaryDirectory()
        self.store = Path(self.home.name) / 'store'

    def tearDown(self) -> None:
        self.registry.close()
        self.home.cleanup()

    def test_installs_the_skills_of_the_published_version_with_their_hashes(self) -> None:
        self.registry.publish('1.0.0', {
            'package/package.json': b'{}',
            'package/dist/index.js': b'',
            'package/skills/profile-authoring/SKILL.md': SKILL,
            'package/skills/supervise/SKILL.md': b'---\nname: supervise\n---\n',
            'package/skills/supervise/references/x.md': b'x',
        })
        result = run(self.store, self.registry.url)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'version': '1.0.0', 'skills': ['profile-authoring', 'supervise']})
        current = self.store / 'current'
        self.assertEqual(current.resolve(), (self.store / '1.0.0').resolve())
        self.assertEqual((current / 'skills' / 'profile-authoring' / 'SKILL.md').read_bytes(), SKILL)
        self.assertTrue((current / 'skills' / 'supervise' / 'references' / 'x.md').is_file())
        self.assertFalse((current / 'dist').exists())
        manifest = json.loads((current / 'manifest.json').read_text())
        self.assertEqual(manifest['skills']['profile-authoring']['sha256'], hashlib.sha256(SKILL).hexdigest())

    def test_a_new_version_replaces_the_old_one(self) -> None:
        self.registry.publish('1.0.0', {'package/skills/supervise/SKILL.md': b'old'})
        self.assertEqual(run(self.store, self.registry.url).returncode, 0)
        self.registry.publish('1.1.0', {'package/skills/profile-authoring/SKILL.md': SKILL})
        result = run(self.store, self.registry.url)
        self.assertEqual(json.loads(result.stdout)['version'], '1.1.0')
        self.assertFalse((self.store / '1.0.0').exists())
        self.assertFalse((self.store / 'current' / 'skills' / 'supervise').exists())

    def test_refuses_a_tarball_whose_integrity_does_not_match(self) -> None:
        self.registry.publish('1.0.0', {'package/skills/supervise/SKILL.md': b'x'}, sri=integrity(b'other'))
        result = run(self.store, self.registry.url)
        self.assertEqual(result.returncode, 1)
        self.assertIn('integrity mismatch', result.stderr)
        self.assertFalse((self.store / 'current').exists())

    def test_refuses_a_path_that_escapes_the_store(self) -> None:
        self.registry.publish('1.0.0', {'package/skills/../../escape/SKILL.md': b'x'})
        result = run(self.store, self.registry.url)
        self.assertEqual(result.returncode, 1)
        self.assertIn('unsafe path', result.stderr)
        self.assertFalse((Path(self.home.name) / 'escape').exists())

    def test_keeps_the_installed_version_when_the_registry_is_unreachable(self) -> None:
        self.registry.publish('1.0.0', {'package/skills/profile-authoring/SKILL.md': SKILL})
        self.assertEqual(run(self.store, self.registry.url).returncode, 0)
        result = run(self.store, 'http://127.0.0.1:9')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'version': '1.0.0', 'skills': ['profile-authoring'], 'kept': True})
        self.assertIn('keeping installed', result.stderr)

    def test_pins_an_exact_version(self) -> None:
        self.registry.publish('1.0.0', {'package/skills/supervise/SKILL.md': b'one'})
        self.registry.publish('2.0.0', {'package/skills/supervise/SKILL.md': b'two'})
        result = run(self.store, self.registry.url, '1.0.0')
        self.assertEqual(json.loads(result.stdout)['version'], '1.0.0')


if __name__ == '__main__':
    unittest.main()
