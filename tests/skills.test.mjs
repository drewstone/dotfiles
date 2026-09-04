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

test('reports the documented unknown-context catalog fallback', () => {
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
    for (let index = 0; index < 10; index += 1) {
      writeSkill(root, `oversized-${index}`, 'x'.repeat(1_000))
    }

    const oversized = runSkills(home, ['--check'])
    assert.equal(oversized.status, 0, oversized.stderr)
    assert.match(oversized.stderr, /8,000-character unknown-context fallback/)
    assert.match(oversized.stderr, /Codex may shorten descriptions/)
  })

  withHome((home) => {
    const root = join(home, '.claude', 'skills')
    for (let index = 0; index < 200; index += 1) {
      writeSkill(root, `minimum-metadata-${index}`, '')
    }

    const omitted = runSkills(home, ['--check'])
    assert.equal(omitted.status, 0, omitted.stderr)
    assert.match(omitted.stderr, /8,000-character unknown-context fallback/)
    assert.match(omitted.stderr, /some skills may be omitted/)
  })
})

test('deduplicates byte-identical skill folders installed for different harnesses', () => {
  withHome((home) => {
    writeSkill(join(home, '.claude', 'skills'), 'shared-copy', 'Same skill')
    writeSkill(join(home, '.agents', 'skills'), 'shared-copy', 'Same skill')

    const result = runSkills(home, ['--check'])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /OK: 1 skills/)
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

test('every conversation profile skill exists in the source catalog', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  const installer = readFileSync(join(repoRoot, 'claude', 'install.sh'), 'utf8')
  const match = installer.match(/^PI_SKILLS=\(([^)]*)\)$/m)
  assert.ok(match, 'install.sh must declare PI_SKILLS')
  const missing = match[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((name) => !existsSync(join(skillsDir, name, 'SKILL.md')))
  assert.deepEqual(missing, [], `PI_SKILLS cites missing skills: ${missing.join(', ')}`)
})

test('an explicit Runtime skill source wins over guessed checkout paths', () => {
  const installer = readFileSync(join(repoRoot, 'claude', 'install.sh'), 'utf8')
  const explicit = installer.indexOf('${AGENT_RUNTIME_DIR:+$AGENT_RUNTIME_DIR/skills}')
  const guessed = installer.indexOf('$HOME/webb/agent-runtime/skills')
  assert.ok(explicit >= 0, 'install.sh must honor AGENT_RUNTIME_DIR')
  assert.ok(explicit < guessed, 'AGENT_RUNTIME_DIR must precede guessed checkout paths')
})

test('installer skips and prunes directories without SKILL.md', () => {
  withHome((home) => {
    const installer = join(repoRoot, 'claude', 'install.sh')
    const invalidSource = join(home, 'invalid-source')
    writeSkill(join(home, 'external'), 'valid-source', 'External skill')
    mkdirSync(invalidSource)

    for (const harness of ['.claude', '.codex']) {
      const root = join(home, harness, 'skills')
      mkdirSync(root, { recursive: true })
      symlinkSync(invalidSource, join(root, 'invalid-source'))
      symlinkSync('../../external/valid-source', join(root, 'valid-source'))
    }

    const result = spawnSync('bash', [installer], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        PATH: '/usr/local/bin:/usr/bin:/bin',
      },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /invalid skill symlink/)

    for (const harness of ['.claude', '.codex']) {
      const root = join(home, harness, 'skills')
      assert.throws(() => readlinkSync(join(root, 'invalid-source')), { code: 'ENOENT' })
      assert.equal(readlinkSync(join(root, 'valid-source')), '../../external/valid-source')
    }
  })
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
  // The remaining shim redirects to another skill, which owns the run log.
  const shims = new Set(['site-clone'])
  const missing = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !shims.has(e.name))
    .filter((e) => existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .filter((e) => !readFileSync(join(skillsDir, e.name, 'SKILL.md'), 'utf8').includes('## Log the run'))
    .map((e) => e.name)
  assert.deepEqual(missing, [], `skills with no '## Log the run' section: ${missing.join(', ')}`)
})

test('skill chaining uses one final footer after the completed-work log', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  const misplaced = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, 'SKILL.md'))
    .filter(existsSync)
    .filter((path) => {
      const source = readFileSync(path, 'utf8')
      const footers = [...source.matchAll(/\n## Then consider\n/g)]
      if (footers.length === 0) return false
      if (footers.length > 1) return true
      const thenIndex = footers[0].index
      const logIndex = source.indexOf('\n## Log the run\n')
      if (logIndex !== -1 && thenIndex < logIndex) return true
      const laterHeading = source.slice(thenIndex + 1).match(/\n## (?!Then consider\b)/)
      return laterHeading !== null
    })
    .map((path) => path.slice(skillsDir.length + 1))

  assert.deepEqual(
    misplaced,
    [],
    `'## Then consider' must be the final section: ${misplaced.join(', ')}`,
  )
})

test('no skill keeps the obsolete Dispatch section', () => {
  const skillsDir = join(repoRoot, 'claude', 'skills')
  const markdownFiles = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(path)
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
    })
  const obsolete = markdownFiles(skillsDir)
    .filter((path) => readFileSync(path, 'utf8').includes('\n## Dispatch\n'))
    .map((path) => path.slice(skillsDir.length + 1))

  assert.deepEqual(obsolete, [], `replace Dispatch with the final Then consider footer: ${obsolete.join(', ')}`)
})
