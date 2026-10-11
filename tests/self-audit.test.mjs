import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const audit = join(repoRoot, 'claude', 'skills', 'reflect', 'scripts', 'self-audit')

function withFiles(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'self-audit-'))
  try {
    run(Object.entries(files).map(([name, lines]) => {
      const path = join(dir, name)
      writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
      return path
    }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const at = (minute) => new Date(Date.UTC(2026, 9, 10, 0, minute)).toISOString()
const claudeTool = (minute, command) => ({ type: 'assistant', timestamp: at(minute), cwd: '/Users/someone/repo', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } })
const claudeResult = (minute, text) => ({ type: 'user', timestamp: at(minute), message: { content: [{ type: 'tool_result', content: text }] } })
const claudeUser = (minute) => ({ type: 'user', timestamp: at(minute), message: { content: 'next please' } })

test('self-audit counts guardrail matches, rework and stalls from a Claude Code transcript', () => {
  withFiles({ 'claude.jsonl': [
    claudeTool(0, 'pnpm test'),
    claudeResult(1, 'ok'),
    claudeTool(2, 'pnpm test'),
    claudeResult(3, 'ok'),
    claudeTool(4, 'git push --force origin feat'),
    claudeResult(5, 'token ghp_' + 'a'.repeat(36)),
    claudeTool(30, 'ssh beelink2 pnpm test'),
    claudeResult(31, 'PreToolUse:Bash hook denied this tool'),
    claudeUser(90),
    claudeTool(91, 'git reset --hard HEAD~1'),
  ] }, ([file]) => {
    const r = spawnSync(process.execPath, [audit, file, '--json'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const m = JSON.parse(r.stdout)
    assert.equal(m.rules['force push'], 1)
    assert.equal(m.rules['heavy build or suite on the Mac'], 2, 'the ssh run is on another host')
    assert.equal(m.rules['secret-shaped text in tool output'], 1)
    assert.equal(m.rules['guard or hook refusals'], 1)
    assert.deepEqual(m.rework, { repeatedCommands: 1, extraRuns: 1, rollbacks: 1, reverts: null })
    assert.equal(m.stalls.count, 1, 'the 59-minute wait for the person is not a stall')
    assert.equal(m.stalls.byKind['idle, no event'], 25)
    const text = spawnSync(process.execPath, [audit, file, '--width', '80'], { encoding: 'utf8' }).stdout
    assert.ok(!text.includes('ghp_'), 'secret-shaped text is counted, never printed')
  })
})

test('self-audit reads commands from Codex tool calls', () => {
  withFiles({ 'codex.jsonl': [
    { timestamp: at(0), type: 'session_meta', payload: { cwd: '/Users/someone/repo' } },
    { timestamp: at(1), type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'await tools.exec_command({cmd:"gh pr merge 12 --admin --squash"})' } },
    { timestamp: at(2), type: 'response_item', payload: { type: 'custom_tool_call_output', output: 'merged' } },
    { timestamp: at(3), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ cmd: 'git commit --no-verify -m x' }) } },
  ] }, ([file]) => {
    const m = JSON.parse(spawnSync(process.execPath, [audit, file, '--json'], { encoding: 'utf8' }).stdout)
    assert.equal(m.rules['merge with --admin'], 1)
    assert.equal(m.rules['hooks bypassed'], 1)
    assert.equal(m.commands, 2)
  })
})
