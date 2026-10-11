import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const command = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude', 'tools', 'journeys-env')

/** A vault of two files and a dotenvx stand-in that "decrypts" by reading the plain value. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'journeys-env-'))
  const secrets = join(root, 'secrets')
  const bin = join(root, 'bin')
  mkdirSync(secrets)
  mkdirSync(bin)
  writeFileSync(join(secrets, '.env.keys'), '')
  writeFileSync(join(secrets, 'app.env'), 'OWNER_EMAIL=owner@example.com\nOWNER_PASSWORD=hunter2-owner\nUNRELATED_KEY=must-not-load\n')
  writeFileSync(join(secrets, 'ci.env'), 'MEMBER_PASSWORD=hunter2-member\nEMPTY_ONE=\n')
  writeFileSync(join(bin, 'dotenvx'), `#!/usr/bin/env bash\n# dotenvx get NAME -f FILE ...\nname="$2"; file="$4"\ngrep -E "^$name=" "$file" | head -1 | cut -d= -f2-\n`)
  chmodSync(join(bin, 'dotenvx'), 0o755)
  return { root, secrets, bin, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function run(f, names, script, extraEnv = {}) {
  return spawnSync(command, ['--', 'bash', '-c', script], {
    encoding: 'utf8',
    env: { PATH: `${f.bin}:/usr/bin:/bin`, HOME: f.root, TANGLE_SECRETS_DIR: f.secrets, JOURNEYS_ENV_NAMES: names, ...extraEnv },
  })
}

test('loads exactly the named credentials, from whichever vault file holds each', () => {
  const f = fixture()
  try {
    const r = run(f, 'OWNER_EMAIL OWNER_PASSWORD MEMBER_PASSWORD', 'echo "$OWNER_EMAIL|$OWNER_PASSWORD|$MEMBER_PASSWORD|${UNRELATED_KEY:-unset}"')
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout.trim(), 'owner@example.com|hunter2-owner|hunter2-member|unset')
    assert.equal(r.stderr, '')
  } finally {
    f.cleanup()
  }
})

test('keeps a value already in the environment', () => {
  const f = fixture()
  try {
    const r = run(f, 'OWNER_EMAIL', 'echo "$OWNER_EMAIL"', { OWNER_EMAIL: 'override@example.com' })
    assert.equal(r.stdout.trim(), 'override@example.com')
  } finally {
    f.cleanup()
  }
})

test('refuses a missing or empty name without printing any value', () => {
  const f = fixture()
  try {
    const missing = run(f, 'OWNER_PASSWORD NOPE_PASSWORD', 'echo ran')
    assert.equal(missing.status, 2)
    assert.match(missing.stderr, /NOPE_PASSWORD is in no vault file/)
    assert.doesNotMatch(missing.stdout + missing.stderr, /hunter2/)
    const empty = run(f, 'EMPTY_ONE', 'echo ran')
    assert.equal(empty.status, 2)
    assert.match(empty.stderr, /EMPTY_ONE is empty in ci\.env/)
    const bad = run(f, 'owner-email', 'echo ran')
    assert.match(bad.stderr, /'owner-email' is not a variable name/)
  } finally {
    f.cleanup()
  }
})
