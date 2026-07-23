import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
