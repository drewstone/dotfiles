import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const healScript = readFileSync(new URL('../tmux/tmux-heal', import.meta.url), 'utf8')
const installScript = readFileSync(new URL('../tmux/install-heal.sh', import.meta.url), 'utf8')
const managerProtection = readFileSync(
  new URL('../tmux/systemd/user-manager-oom-protection.conf', import.meta.url),
  'utf8'
)
const managerDefaults = readFileSync(
  new URL('../tmux/systemd/user-manager-defaults.conf.in', import.meta.url),
  'utf8'
)
const tmuxOomScore = readFileSync(
  new URL('../tmux/systemd/20-oom-score.conf', import.meta.url),
  'utf8'
)
const tmuxService = readFileSync(
  new URL('../tmux/systemd/tmux-heal.service', import.meta.url),
  'utf8'
)
const tmuxStability = readFileSync(
  new URL('../tmux/systemd/10-stability.conf', import.meta.url),
  'utf8'
)

test('tmux recovery scripts have valid shell syntax', () => {
  for (const script of ['tmux/tmux-heal', 'tmux/install-heal.sh']) {
    const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  }
})

test('the installer requires a systemd version with user OOM defaults', () => {
  const reject = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; require_systemd_version 249'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' }
  )
  const accept = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; require_systemd_version 250'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' }
  )

  assert.equal(reject.status, 1)
  assert.match(reject.stderr, /requires systemd 250 or newer/)
  assert.equal(accept.status, 0, accept.stderr)
})

test('a vanished OOM target does not abort installation', (context) => {
  if (process.platform !== 'linux') {
    context.skip('requires Linux process paths')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-oom-race-test-'))
  const procRoot = join(testRoot, 'proc')
  const scoreDirectory = join(procRoot, '4242')
  const scoreFile = join(scoreDirectory, 'oom_score_adj')
  const sudoWrapper = join(testRoot, 'sudo')
  mkdirSync(procRoot)
  mkdirSync(scoreDirectory)
  writeFileSync(scoreFile, '100\n')
  writeFileSync(
    sudoWrapper,
    '#!/bin/sh\nif [ "$1" = tee ]; then\n  mv "$2" "$2.gone"\n  /bin/cat >/dev/null\n  exit 1\nfi\nexit 1\n'
  )
  chmodSync(sudoWrapper, 0o755)
  context.after(() => rmSync(testRoot, { recursive: true, force: true }))

  const environment = {
    ...process.env,
    TMUX_HEAL_PROC_ROOT: procRoot,
    TMUX_HEAL_SUDO_BIN: sudoWrapper
  }
  const vanished = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; set_oom_score 4242 0'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: environment }
  )
  assert.equal(vanished.status, 0, vanished.stderr)

  writeFileSync(scoreFile, '100\n')
  writeFileSync(
    sudoWrapper,
    '#!/bin/sh\nif [ "$1" = tee ]; then\n  /bin/cat >/dev/null\nfi\nexit 1\n'
  )
  const persistentFailure = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; set_oom_score 4242 0'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: environment }
  )
  assert.equal(persistentFailure.status, 1)
  assert.match(persistentFailure.stderr, /Failed to set OOM score/)
})

test('the legacy global score zero migrates to the original host score', (context) => {
  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-default-migration-test-'))
  const testHome = join(testRoot, 'home')
  const legacyDefaults = join(testRoot, 'legacy.conf')
  mkdirSync(testHome)
  writeFileSync(legacyDefaults, '[Manager]\nDefaultOOMScoreAdjust=0\n')
  context.after(() => rmSync(testRoot, { recursive: true, force: true }))

  const result = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; default_user_oom_score'],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: testHome,
        TMUX_HEAL_LEGACY_GLOBAL_DEFAULTS: legacyDefaults
      }
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '200\n')
})

test('a foreign-owned legacy stamp is ignored', (context) => {
  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-legacy-stamp-test-'))
  const legacyStamp = join(testRoot, 'legacy-stamp')
  const statWrapper = join(testRoot, 'stat')
  writeFileSync(legacyStamp, 'hostile\n')
  writeFileSync(statWrapper, '#!/bin/sh\nprintf "99999\\n"\n')
  chmodSync(statWrapper, 0o755)
  context.after(() => rmSync(testRoot, { recursive: true, force: true }))

  const result = spawnSync(
    'bash',
    ['-c', 'source tmux/install-heal.sh; remove_owned_legacy_stamp "$1"', 'bash', legacyStamp],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, TMUX_HEAL_STAT_BIN: statWrapper }
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /Ignoring legacy stamp not owned/)
  assert.equal(readFileSync(legacyStamp, 'utf8'), 'hostile\n')
})

test('layout restore runs only after tmux starts a replacement server', () => {
  assert.match(healScript, /RESTORE_LAYOUTS="\$\{TMUX_HEAL_RESTORE_LAYOUTS:-1\}"/)
  assert.match(healScript, /SERVER_STARTED=1/)
  assert.match(
    healScript,
    /if \[ "\$RESTORE_LAYOUTS" = "1" \] && \[ "\$SERVER_STARTED" = "1" \]; then/
  )
})

test('live snapshots use parseable tabs and reject malformed rows', () => {
  assert.match(
    healScript,
    /list-windows -a -F \$'#{session_name}\\t#{window_index}\\t#{window_name}\\t#{pane_current_path}'/
  )
  assert.match(
    healScript,
    /if snapshot_is_usable "\$LIVE_STATE"; then/
  )
})

test('a replacement server restores saved windows once', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-test-'))
  const testHome = join(testRoot, 'home')
  const testBin = join(testRoot, 'bin')
  const snapshot = join(testRoot, 'live-state.tsv')
  const socketDirectory = join(testRoot, 'socket')
  const socketPath = join(socketDirectory, 'server.sock')
  const pgrepWrapper = join(testBin, 'pgrep')
  mkdirSync(testHome)
  mkdirSync(testBin)

  writeFileSync(pgrepWrapper, '#!/bin/sh\nexit 1\n')
  chmodSync(pgrepWrapper, 0o755)
  writeFileSync(
    snapshot,
    [
      'session\twindow\tname\tcwd',
      'alpha\t0\teditor\t/tmp',
      'beta\t0\tlogs\t/tmp',
      'beta\t1\tshell\t/tmp',
      ''
    ].join('\n')
  )

  const environment = {
    ...process.env,
    HOME: testHome,
    PATH: `${testBin}:${process.env.PATH}`,
    TMUX_BIN: '/usr/bin/tmux',
    TMUX_CONF: '/dev/null',
    TMUX_SOCKET_PATH: socketPath,
    TMUX_HEAL_STATE_DIR: join(testRoot, 'state'),
    TMUX_HEAL_LIVE_STATE: snapshot,
    TMUX_HEAL_SAVE_STAMP: join(testRoot, 'save-stamp'),
    TMUX_HEAL_SOURCE_STAMP: join(testRoot, 'source-stamp'),
    TMUX_RESURRECT_DIR: testRoot,
    TMUX_RESURRECT_SAVE_SCRIPT: join(testRoot, 'missing-save.sh')
  }
  const runHeal = () => {
    const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: environment
    })
    assert.equal(result.status, 0, result.stderr)
  }
  const tmux = (...arguments_) => execFileSync('/usr/bin/tmux', ['-S', socketPath, ...arguments_], {
    encoding: 'utf8'
  })

  context.after(() => {
    spawnSync('/usr/bin/tmux', ['-S', socketPath, 'kill-server'])
    rmSync(testRoot, { recursive: true, force: true })
  })

  runHeal()
  assert.deepEqual(
    tmux('list-sessions', '-F', '#{session_name}:#{session_windows}').trim().split('\n').sort(),
    ['alpha:1', 'beta:2', 'recovered:1']
  )
  const generatedSnapshot = readFileSync(snapshot, 'utf8')
  assert.match(generatedSnapshot, /^session\twindow\tname\tcwd$/m)
  assert.doesNotMatch(generatedSnapshot, /\\t/)
  assert.equal(statSync(snapshot).mode & 0o777, 0o600)

  tmux('kill-server')
  runHeal()
  assert.deepEqual(
    tmux('list-sessions', '-F', '#{session_name}:#{session_windows}').trim().split('\n').sort(),
    ['alpha:1', 'beta:2', 'recovered:1']
  )

  tmux('kill-session', '-t', 'alpha')
  runHeal()
  assert.deepEqual(
    tmux('list-sessions', '-F', '#{session_name}').trim().split('\n').sort(),
    ['beta', 'recovered']
  )
})

test('a malformed live snapshot falls back to the active resurrect pane', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-resurrect-test-'))
  const testHome = join(testRoot, 'home')
  const testBin = join(testRoot, 'bin')
  const liveSnapshot = join(testRoot, 'live-state.tsv')
  const resurrectSnapshot = join(testRoot, 'tmux_resurrect_20260902T120000.txt')
  const resurrectLast = join(testRoot, 'last')
  const activeDirectory = join(testRoot, 'active directory')
  const escapedActiveDirectory = activeDirectory.replaceAll(' ', '\\ ')
  const socketPath = join(testRoot, 'socket', 'server.sock')
  const pgrepWrapper = join(testBin, 'pgrep')
  mkdirSync(testHome)
  mkdirSync(testBin)
  mkdirSync(activeDirectory)
  writeFileSync(pgrepWrapper, '#!/bin/sh\nexit 1\n')
  chmodSync(pgrepWrapper, 0o755)
  writeFileSync(
    liveSnapshot,
    'session\\twindow\\tname\\tcwd\ngamma\\t0\\teditor\\t/tmp/wrong\n'
  )
  writeFileSync(
    resurrectSnapshot,
    [
      'window\tgamma\t0\t:editor\t1',
      `pane\tgamma\t0\t1\t:-\t1\t:bash\t:${escapedActiveDirectory}\t1`,
      'pane\tgamma\t0\t1\t:-\t2\t:bash\t:/var/tmp\t0',
      ''
    ].join('\n')
  )
  writeFileSync(resurrectLast, 'corrupt\n')

  context.after(() => {
    spawnSync('/usr/bin/tmux', ['-S', socketPath, 'kill-server'])
    rmSync(testRoot, { recursive: true, force: true })
  })

  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: testHome,
      PATH: `${testBin}:${process.env.PATH}`,
      TMUX_BIN: '/usr/bin/tmux',
      TMUX_CONF: '/dev/null',
      TMUX_SOCKET_PATH: socketPath,
      TMUX_HEAL_STATE_DIR: join(testRoot, 'state'),
      TMUX_HEAL_LIVE_STATE: liveSnapshot,
      TMUX_HEAL_SAVE_STAMP: join(testRoot, 'save-stamp'),
      TMUX_HEAL_SOURCE_STAMP: join(testRoot, 'source-stamp'),
      TMUX_RESURRECT_DIR: testRoot,
      TMUX_RESURRECT_LAST: resurrectLast,
      TMUX_RESURRECT_SAVE_SCRIPT: join(testRoot, 'missing-save.sh')
    }
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(
    execFileSync('/usr/bin/tmux', ['-S', socketPath, 'display-message', '-p', '-t', 'gamma:0.0', '#{pane_current_path}'], {
      encoding: 'utf8'
    }).trim(),
    activeDirectory
  )
})

test('a running server recreates a deleted socket without losing sessions', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-socket-test-'))
  const testHome = join(testRoot, 'home')
  const testBin = join(testRoot, 'bin')
  const socketDirectory = join(testRoot, 'socket')
  const socketPath = join(socketDirectory, 'server.sock')
  const pgrepWrapper = join(testBin, 'pgrep')
  mkdirSync(testHome)
  mkdirSync(testBin)
  mkdirSync(socketDirectory)

  execFileSync('/usr/bin/tmux', ['-S', socketPath, '-f', '/dev/null', 'new-session', '-d', '-s', 'original'])
  const serverPid = execFileSync('/usr/bin/tmux', ['-S', socketPath, 'display-message', '-p', '#{pid}'], {
    encoding: 'utf8'
  }).trim()
  writeFileSync(pgrepWrapper, `#!/bin/sh\nprintf '%s\\n' '${serverPid}'\n`)
  chmodSync(pgrepWrapper, 0o755)

  context.after(() => {
    try {
      process.kill(Number(serverPid), 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    rmSync(testRoot, { recursive: true, force: true })
  })

  rmSync(socketDirectory, { recursive: true })
  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: testHome,
      PATH: `${testBin}:${process.env.PATH}`,
      TMUX_BIN: '/usr/bin/tmux',
      TMUX_CONF: '/dev/null',
      TMUX_SOCKET_PATH: socketPath,
      TMUX_HEAL_STATE_DIR: join(testRoot, 'state'),
      TMUX_HEAL_SAVE_STAMP: join(testRoot, 'save-stamp'),
      TMUX_HEAL_SOURCE_STAMP: join(testRoot, 'source-stamp'),
      TMUX_RESURRECT_DIR: testRoot,
      TMUX_RESURRECT_SAVE_SCRIPT: join(testRoot, 'missing-save.sh')
    }
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(statSync(socketDirectory).mode & 0o777, 0o700)
  assert.deepEqual(
    execFileSync('/usr/bin/tmux', ['-S', socketPath, 'list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8'
    }).trim().split('\n'),
    ['original']
  )
})

test('a stale socket is replaced when only an unrelated server remains', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-stale-test-'))
  const testHome = join(testRoot, 'home')
  const testBin = join(testRoot, 'bin')
  const targetSocket = join(testRoot, 'target', 'server.sock')
  const unrelatedSocket = join(testRoot, 'unrelated', 'server.sock')
  const pgrepWrapper = join(testBin, 'pgrep')
  mkdirSync(testHome)
  mkdirSync(testBin)
  mkdirSync(join(testRoot, 'target'))
  mkdirSync(join(testRoot, 'unrelated'))
  execFileSync('/usr/bin/tmux', ['-S', targetSocket, '-f', '/dev/null', 'new-session', '-d', '-s', 'doomed'])
  execFileSync('/usr/bin/tmux', ['-S', unrelatedSocket, '-f', '/dev/null', 'new-session', '-d', '-s', 'unrelated'])
  const targetPid = Number(execFileSync(
    '/usr/bin/tmux',
    ['-S', targetSocket, 'display-message', '-p', '#{pid}'],
    { encoding: 'utf8' }
  ).trim())
  const unrelatedPid = execFileSync(
    '/usr/bin/tmux',
    ['-S', unrelatedSocket, 'display-message', '-p', '#{pid}'],
    { encoding: 'utf8' }
  ).trim()
  writeFileSync(pgrepWrapper, `#!/bin/sh\nprintf '%s\\n' '${unrelatedPid}'\n`)
  chmodSync(pgrepWrapper, 0o755)

  context.after(() => {
    spawnSync('/usr/bin/tmux', ['-S', targetSocket, 'kill-server'])
    spawnSync('/usr/bin/tmux', ['-S', unrelatedSocket, 'kill-server'])
    rmSync(testRoot, { recursive: true, force: true })
  })

  process.kill(targetPid, 'SIGKILL')
  for (let attempt = 0; attempt < 100 && existsSync(`/proc/${targetPid}`); attempt += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  assert.equal(existsSync(targetSocket), true)

  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: testHome,
      PATH: `${testBin}:${process.env.PATH}`,
      TMUX_BIN: '/usr/bin/tmux',
      TMUX_CONF: '/dev/null',
      TMUX_SOCKET_PATH: targetSocket,
      TMUX_HEAL_STATE_DIR: join(testRoot, 'state'),
      TMUX_RESURRECT_DIR: testRoot,
      TMUX_RESURRECT_SAVE_SCRIPT: join(testRoot, 'missing-save.sh')
    }
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /removing unusable socket/)
  assert.equal(
    execFileSync('/usr/bin/tmux', ['-S', targetSocket, 'list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8'
    }).trim(),
    'recovered'
  )
  assert.equal(
    execFileSync('/usr/bin/tmux', ['-S', unrelatedSocket, 'list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8'
    }).trim(),
    'unrelated'
  )
})

test('a partial tmux read preserves the prior index and retries resurrect', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-partial-test-'))
  const testHome = join(testRoot, 'home')
  const testBin = join(testRoot, 'bin')
  const socketPath = join(testRoot, 'socket', 'server.sock')
  const tmuxWrapper = join(testBin, 'tmux')
  const saveScript = join(testBin, 'save.sh')
  const liveSnapshot = join(testRoot, 'live-state.tsv')
  const saveStamp = join(testRoot, 'save-stamp')
  const priorSnapshot = 'session\twindow\tname\tcwd\noriginal\t0\tshell\t/tmp\n'
  mkdirSync(testHome)
  mkdirSync(testBin)
  mkdirSync(join(testRoot, 'socket'))
  writeFileSync(
    tmuxWrapper,
    "#!/bin/sh\nif [ \"${3:-}\" = list-windows ]; then\n  printf 'partial\\t0\\tshell\\t/tmp\\n'\n  exit 1\nfi\nexec /usr/bin/tmux \"$@\"\n"
  )
  writeFileSync(saveScript, '#!/bin/sh\nexit 1\n')
  chmodSync(tmuxWrapper, 0o755)
  chmodSync(saveScript, 0o755)
  writeFileSync(liveSnapshot, priorSnapshot)
  execFileSync('/usr/bin/tmux', ['-S', socketPath, '-f', '/dev/null', 'new-session', '-d', '-s', 'original'])

  context.after(() => {
    spawnSync('/usr/bin/tmux', ['-S', socketPath, 'kill-server'])
    rmSync(testRoot, { recursive: true, force: true })
  })

  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: testHome,
      PATH: `${testBin}:${process.env.PATH}`,
      TMUX_BIN: tmuxWrapper,
      TMUX_CONF: '/dev/null',
      TMUX_SOCKET_PATH: socketPath,
      TMUX_HEAL_STATE_DIR: join(testRoot, 'state'),
      TMUX_HEAL_LIVE_STATE: liveSnapshot,
      TMUX_HEAL_SAVE_STAMP: saveStamp,
      TMUX_HEAL_SOURCE_STAMP: join(testRoot, 'source-stamp'),
      TMUX_RESURRECT_DIR: testRoot,
      TMUX_RESURRECT_SAVE_SCRIPT: saveScript
    }
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(readFileSync(liveSnapshot, 'utf8'), priorSnapshot)
  assert.equal(existsSync(saveStamp), false)
  assert.match(result.stdout, /keeping the prior index/)
  assert.match(result.stdout, /retrying on the next pass/)
})

test('a symlinked private state directory is rejected', (context) => {
  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-state-test-'))
  const victimDirectory = join(testRoot, 'victim')
  const stateDirectory = join(testRoot, 'state')
  const marker = join(victimDirectory, 'marker')
  mkdirSync(victimDirectory)
  writeFileSync(marker, 'unchanged\n')
  symlinkSync(victimDirectory, stateDirectory, 'dir')
  context.after(() => rmSync(testRoot, { recursive: true, force: true }))

  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: join(testRoot, 'home'),
      TMUX_HEAL_STATE_DIR: stateDirectory,
      TMUX_SOCKET_PATH: join(testRoot, 'socket', 'server.sock')
    }
  })

  assert.equal(result.status, 1)
  assert.match(result.stdout, /refusing symlinked private directory/)
  assert.equal(readFileSync(marker, 'utf8'), 'unchanged\n')
})

test('a corrupt symlinked save stamp is replaced without touching its target', (context) => {
  const tmuxProbe = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
  if (process.platform !== 'linux' || tmuxProbe.status !== 0) {
    context.skip('requires tmux on Linux')
    return
  }

  const testRoot = mkdtempSync(join(tmpdir(), 'tmux-heal-stamp-test-'))
  const testHome = join(testRoot, 'home')
  const stateDirectory = join(testRoot, 'state')
  const socketPath = join(testRoot, 'socket', 'server.sock')
  const victim = join(testRoot, 'victim')
  const saveStamp = join(stateDirectory, 'last-save')
  const saveScript = join(testRoot, 'save.sh')
  mkdirSync(testHome)
  mkdirSync(stateDirectory, { mode: 0o700 })
  mkdirSync(join(testRoot, 'socket'))
  writeFileSync(victim, '09\n')
  writeFileSync(saveScript, '#!/bin/sh\nexit 0\n')
  chmodSync(saveScript, 0o755)
  symlinkSync(victim, saveStamp)
  execFileSync('/usr/bin/tmux', ['-S', socketPath, '-f', '/dev/null', 'new-session', '-d', '-s', 'original'])

  context.after(() => {
    spawnSync('/usr/bin/tmux', ['-S', socketPath, 'kill-server'])
    rmSync(testRoot, { recursive: true, force: true })
  })

  const result = spawnSync('bash', ['tmux/tmux-heal', 'once'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: testHome,
      TMUX_BIN: '/usr/bin/tmux',
      TMUX_CONF: '/dev/null',
      TMUX_SOCKET_PATH: socketPath,
      TMUX_HEAL_STATE_DIR: stateDirectory,
      TMUX_HEAL_LIVE_STATE: join(testRoot, 'live-state.tsv'),
      TMUX_RESURRECT_DIR: testRoot,
      TMUX_RESURRECT_SAVE_SCRIPT: saveScript
    }
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(readFileSync(victim, 'utf8'), '09\n')
  assert.equal(lstatSync(saveStamp).isSymbolicLink(), false)
  assert.match(readFileSync(saveStamp, 'utf8'), /^\d+\n$/)
})

test('the user manager is protected without shielding memory-heavy panes', () => {
  assert.match(managerProtection, /OOMScoreAdjust=-900/)
  assert.match(managerProtection, /ManagedOOMPreference=avoid/)
  assert.match(managerDefaults, /DefaultOOMScoreAdjust=@DEFAULT_OOM_SCORE@/)
  assert.match(tmuxOomScore, /OOMScoreAdjust=0/)
  assert.doesNotMatch(`${tmuxService}\n${tmuxStability}`, /Memory(?:Min|Low)=/)
  assert.doesNotMatch(`${tmuxService}\n${tmuxStability}`, /ManagedOOMPreference=/)
  assert.match(installScript, /set_oom_score "\$user_manager_pid" -900/)
  assert.match(installScript, /set_oom_score "\$process_id" 0/)
  assert.match(installScript, /USER_MANAGER_DIR="\$HOME\/\.config\/systemd\/user\.conf\.d"/)
  assert.match(installScript, /mapfile -t process_ids < "\$cgroup_processes" 2>\/dev\/null \|\| continue/)
})
