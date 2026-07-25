import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillsCommand = join(repoRoot, 'claude', 'tools', 'skills')

function withHome(run) {
  const home = mkdtempSync(join(tmpdir(), 'skills-test-'))
  try {
    run(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

function writeSkill(root, name, description) {
  const directory = join(root, name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  )
  return directory
}

function runSkills(home, args = []) {
  return spawnSync(skillsCommand, args, {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  })
}

test('discovers system skills and deduplicates the same source across roots', () => {
  withHome((home) => {
    const source = writeSkill(join(home, 'source'), 'shared', 'Shared source')
    const claudeRoot = join(home, '.claude', 'skills')
    const codexRoot = join(home, '.codex', 'skills')
    mkdirSync(claudeRoot, { recursive: true })
    mkdirSync(codexRoot, { recursive: true })
    symlinkSync(source, join(claudeRoot, 'shared'))
    symlinkSync(source, join(codexRoot, 'shared'))
    writeSkill(join(codexRoot, '.system'), 'system-one', 'System source')

    const output = execFileSync(skillsCommand, {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })

    assert.match(output, /shared\s+Shared source/)
    assert.match(output, /system-one\s+System source/)
    assert.match(output, /2 skill\(s\)/)
  })
})

test('passes a compact catalog and rejects one that would emit the Codex warning', () => {
  withHome((home) => {
    const root = join(home, '.claude', 'skills')
    for (let index = 0; index < 20; index += 1) {
      writeSkill(root, `compact-${index}`, 'Short description')
    }

    const compact = runSkills(home, ['--check'])
    assert.equal(compact.status, 0, compact.stderr)
    assert.match(compact.stdout, /OK: 20 skills/)
  })

  withHome((home) => {
    const root = join(home, '.claude', 'skills')
    for (let index = 0; index < 100; index += 1) {
      writeSkill(root, `oversized-${index}`, 'x'.repeat(600))
    }

    const oversized = runSkills(home, ['--check'])
    assert.equal(oversized.status, 2)
    assert.match(oversized.stderr, /emit the 2% warning/)
  })
})

test('rejects distinct installed skills with the same name', () => {
  withHome((home) => {
    writeSkill(join(home, '.claude', 'skills'), 'duplicate', 'First implementation')
    writeSkill(join(home, '.agents', 'skills'), 'duplicate', 'Second implementation')

    const result = runSkills(home, ['--check'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /duplicate skill name 'duplicate'/)
  })
})

test('flags a skill directory whose symlink target is gone', () => {
  withHome((home) => {
    const root = join(home, '.claude', 'skills')
    writeSkill(root, 'real', 'A real skill')
    symlinkSync(join(home, 'nowhere'), join(root, 'orphan'))

    const result = runSkills(home, ['--check'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /dangling skill link 'orphan'/)
  })
})

// The source repo is what drifts. skill_paths() silently drops a broken symlink
// and install.sh silently declines to install it, so nothing else notices when a
// skill stops resolving — build-with-agent-runtime pointed at a Linux path on a
// macOS machine for months.
test('every skill directory in the repo resolves', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  const broken = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isSymbolicLink() && !existsSync(join(skillsDir, e.name)))
    .map((e) => `${e.name} -> ${readlinkSync(join(skillsDir, e.name))}`)
  assert.deepEqual(broken, [], `dangling skill symlinks: ${broken.join(', ')}`)
})

// _ladder.md is the only place the flat skill names are given a structure. It is
// hand-maintained, so it drifts silently unless something checks it.
test('_ladder.md names every skill in the repo, and no skill it names is gone', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  const ladder = readFileSync(join(skillsDir, '_ladder.md'), 'utf8')
  const skills = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .map((e) => e.name)

  const unmapped = skills.filter((name) => !ladder.includes(name))
  assert.deepEqual(unmapped, [], `skills missing from _ladder.md: ${unmapped.join(', ')}`)

  const cited = [...new Set([...ladder.matchAll(/`\/([a-z][a-z0-9-]*)`/g)].map((m) => m[1]))]
  const phantom = cited.filter((name) => !existsSync(join(skillsDir, name, 'SKILL.md')))
  assert.deepEqual(phantom, [], `_ladder.md cites skills that do not exist: ${phantom.join(', ')}`)
})

// The harness loads a skill's own SKILL.md and nothing else, so the logging rule
// has to live there. Stated only in _common.md it was invisible to the model and
// zero skills wrote a line for months, leaving /reflect nothing to grade.
test('every live skill tells the model to log its run', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  // Shims only redirect to another skill; the skill they name does the logging.
  const shims = new Set(['code-review', 'research', 'site-clone'])
  const missing = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !shims.has(e.name))
    .filter((e) => existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .filter((e) => !readFileSync(join(skillsDir, e.name, 'SKILL.md'), 'utf8').includes('## Log the run'))
    .map((e) => e.name)
  assert.deepEqual(missing, [], `skills with no '## Log the run' section: ${missing.join(', ')}`)
})
