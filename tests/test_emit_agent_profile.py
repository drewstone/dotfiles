"""The profile emitter carries a version promoted in the learned store onto each new base, and drops it on rollback."""
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EMITTER = REPO / 'claude' / 'tools' / 'emit-agent-profile.py'
NAME = 'walkthrough'


def mounted(name, content):
    """An inline skill and its provenance record, as agent-interface's mountSkill writes them."""
    skill = {'kind': 'inline', 'name': name, 'content': content}
    record = {'repository': 'example/skills', 'ref': 'a' * 40, 'path': f'skills/{name}/SKILL.md', 'name': name,
              'sha256': hashlib.sha256(content.encode()).hexdigest()}
    return skill, record


def mounted_directory(name, content, siblings):
    """An inline skill, its sibling file mounts and their records, as agent-interface's mountSkillDirectory writes them."""
    skill, record = mounted(name, content)
    record = {**record, 'mountedAt': f'.claude/skills/{name}', 'siblings': sorted(siblings)}
    files = [{'path': f'.claude/skills/{name}/{rel}', 'resource': {'kind': 'inline', 'name': f'{name}/{rel}', 'content': text}}
             for rel, text in sorted(siblings.items())]
    records = [{'name': f'{name}/{rel}', 'repository': 'example/skills', 'ref': 'a' * 40, 'path': f'skills/{name}/{rel}',
                'sha256': hashlib.sha256(text.encode()).hexdigest(), 'skill': name} for rel, text in sorted(siblings.items())]
    return skill, [record, *records], files


class LearnedVersion(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / 'private' / 'claude' / 'config').mkdir(parents=True)
        (self.tmp / 'private' / 'claude' / 'config' / 'emit-agent-profile.env').write_text(f'PROFILE_NAME={NAME}\n')
        self.store = self.tmp / 'learned' / NAME
        (self.store / 'profiles').mkdir(parents=True)
        self.base = self.emit()

    def emit(self):
        out = self.tmp / 'profile.json'
        result = subprocess.run(
            ['python3', '-S', str(EMITTER), '--out', str(out), '--ref', 'HEAD', '--learned', str(self.store)],
            env={**os.environ, 'DOTFILES_PRIVATE': str(self.tmp / 'private')},
            capture_output=True, text=True, check=True)
        self.stderr = result.stderr
        return json.loads(out.read_text())

    def promote(self, version, *units):
        profile = json.loads(json.dumps(self.base))
        profile['version'] = version
        profile['resources']['skills'] += [skill for skill, _ in units]
        profile['extensions'] = {NAME: {'resourceProvenance': [record for _, record in units]}}
        path = self.store / 'profiles' / f'{version}.json'
        path.write_text(json.dumps(profile))
        self.record({'action': 'promoted', 'version': version, 'profile': str(path)})
        return path

    def promote_directory(self, version, unit):
        """Promote a version whose one learned skill was mounted with its directory."""
        skill, records, files = unit
        profile = json.loads(json.dumps(self.base))
        profile['version'] = version
        profile['resources']['skills'].append(skill)
        profile['resources']['files'] += files
        profile['extensions'] = {NAME: {'resourceProvenance': records}}
        path = self.store / 'profiles' / f'{version}.json'
        path.write_text(json.dumps(profile))
        self.record({'action': 'promoted', 'version': version, 'profile': str(path)})
        return path

    def record(self, record):
        with (self.store / 'versions.jsonl').open('a') as history:
            history.write(json.dumps(record) + '\n')

    def skill_names(self, profile):
        return [skill['name'] for skill in profile['resources']['skills']]

    def test_the_promoted_version_rides_on_the_base_until_it_is_rolled_back(self):
        self.assertNotIn('version', self.base)
        self.assertNotIn('extensions', self.base)
        tidy, audit = mounted('tidy', 'Tidy the answer.\n'), mounted('audit', 'Audit the answer.\n')

        self.promote('learn.1', tidy)
        first = self.emit()
        self.assertEqual(first['version'], 'learn.1')
        self.assertEqual(self.skill_names(first), self.skill_names(self.base) + ['tidy'])
        self.assertEqual(first['resources']['skills'][-1], tidy[0])
        self.assertEqual(first['extensions'][NAME]['resourceProvenance'], [tidy[1]])

        self.promote('learn.2', tidy, audit)
        self.assertEqual(self.skill_names(self.emit()), self.skill_names(self.base) + ['tidy', 'audit'])

        self.record({'action': 'rolled back', 'from': 'learn.2'})
        self.assertEqual(self.emit(), first)

        self.record({'action': 'rolled back', 'from': 'learn.1'})
        self.assertEqual(self.emit(), self.base)

    def test_an_edited_inline_skill_is_not_carried_and_the_base_is_emitted(self):
        path = self.promote('learn.1', mounted('tidy', 'Tidy the answer.\n'))
        profile = json.loads(path.read_text())
        profile['resources']['skills'][-1]['content'] = 'Tidy the answer, and also something else.\n'
        path.write_text(json.dumps(profile))
        self.assertEqual(self.emit(), self.base)
        self.assertIn('does not hash to its provenance record', self.stderr)

    def test_a_skill_the_base_now_ships_is_kept_from_the_base(self):
        base_skill = self.base['resources']['skills'][0]['name']
        self.promote('learn.1', mounted(base_skill, 'A local copy.\n'), mounted('tidy', 'Tidy the answer.\n'))
        profile = self.emit()
        self.assertEqual(self.skill_names(profile), self.skill_names(self.base) + ['tidy'])
        self.assertEqual(profile['resources']['skills'][0], self.base['resources']['skills'][0])
        self.assertEqual([record['name'] for record in profile['extensions'][NAME]['resourceProvenance']], ['tidy'])
        self.assertIn('is now in the base', self.stderr)

    def test_a_skill_mounted_with_its_directory_carries_its_files_and_records(self):
        unit = mounted_directory('operate', 'Operate the run.\n', {'references/format.md': 'One line per step.\n'})
        self.promote_directory('learn.1', unit)
        profile = self.emit()
        self.assertEqual(profile['version'], 'learn.1')
        self.assertEqual(self.skill_names(profile), self.skill_names(self.base) + ['operate'])
        self.assertEqual(profile['resources']['files'], self.base['resources']['files'] + unit[2])
        self.assertEqual(profile['extensions'][NAME]['resourceProvenance'], unit[1])

        self.record({'action': 'rolled back', 'from': 'learn.1'})
        self.assertEqual(self.emit(), self.base)

    def test_an_edited_sibling_file_is_not_carried_and_the_base_is_emitted(self):
        path = self.promote_directory('learn.1', mounted_directory(
            'operate', 'Operate the run.\n', {'references/format.md': 'One line per step.\n'}))
        profile = json.loads(path.read_text())
        profile['resources']['files'][-1]['resource']['content'] = 'Two lines per step.\n'
        path.write_text(json.dumps(profile))
        self.assertEqual(self.emit(), self.base)
        self.assertIn('beside skill operate does not hash to its provenance record', self.stderr)


if __name__ == '__main__':
    unittest.main()
