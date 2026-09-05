import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mergeScript = join(repoRoot, 'claude', 'skills', 'semgrep', 'scripts', 'merge_sarif.py')
const python = execFileSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).trim()

function withScan(run) {
  const directory = mkdtempSync(join(tmpdir(), 'semgrep-merge-test-'))
  const raw = join(directory, 'raw')
  const output = join(directory, 'results', 'combined.sarif')
  mkdirSync(raw)
  try {
    run({ raw, output, execute: () => spawnSync(python, [mergeScript, raw, output], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    }) })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function sarif(runs) {
  return { version: '2.1.0', runs }
}

function scanRun(ruleId, results, executionSuccessful = true) {
  return {
    tool: { driver: { name: 'Semgrep', rules: [{ id: ruleId }] } },
    invocations: [{ executionSuccessful }],
    originalUriBaseIds: { SOURCE: { uri: `file:///project/${ruleId}/` } },
    artifacts: [{ location: { uri: 'source.ts', uriBaseId: 'SOURCE' } }],
    results,
  }
}

function finding(ruleId, column = 1) {
  return {
    ruleId,
    ruleIndex: 0,
    message: { text: 'A concrete finding' },
    locations: [{ physicalLocation: {
      artifactLocation: { index: 0, uri: 'source.ts', uriBaseId: 'SOURCE' },
      region: { startLine: 4, startColumn: column },
    } }],
  }
}

function writeScan(raw, name, runs) {
  writeFileSync(join(raw, name), JSON.stringify(sarif(runs)))
}

test('preserves complete runs and their independent rule, artifact, and invocation references', () => {
  withScan(({ raw, output, execute }) => {
    const first = scanRun('rule-a', [finding('rule-a')])
    const second = scanRun('rule-b', [finding('rule-b')], false)
    second.invocations[0].toolExecutionNotifications = [{ level: 'error', message: { text: 'Timed out' } }]
    writeScan(raw, 'first.sarif', [first])
    writeScan(raw, 'second.sarif', [second])
    const result = execute()
    assert.equal(result.status, 0, result.stderr)
    const merged = JSON.parse(readFileSync(output, 'utf8'))
    assert.deepEqual(merged.runs, [first, second])
    for (const run of merged.runs) {
      for (const item of run.results) {
        assert.equal(run.tool.driver.rules[item.ruleIndex].id, item.ruleId)
      }
    }
  })
})

test('retains successful scans with zero findings, including multiple runs in one file', () => {
  withScan(({ raw, output, execute }) => {
    const runs = [scanRun('first', []), scanRun('second', [])]
    writeScan(raw, 'empty-findings.sarif', runs)
    const result = execute()
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).runs, runs)
    assert.match(result.stdout, /2 runs from 1 files: 0 findings/)
  })
})

test('retains separate findings that share a rule, file, and line', () => {
  withScan(({ raw, output, execute }) => {
    const run = scanRun('same-rule', [finding('same-rule', 1), finding('same-rule', 12)])
    writeScan(raw, 'findings.sarif', [run])
    assert.equal(execute().status, 0)
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).runs[0].results, run.results)
  })
})

test('rejects malformed inputs without publishing partial output', () => {
  const malformed = ['{broken', 'null', JSON.stringify({ version: '2.0.0', runs: [] }),
    JSON.stringify({ version: '2.1.0', runs: {} }), JSON.stringify(sarif([{}])),
    JSON.stringify(sarif([scanRun('bad-results', {})])),
    '{"version":"2.1.0","runs":[{"tool":{"driver":{}},"results":[NaN]}]}']
  for (const content of malformed) {
    withScan(({ raw, output, execute }) => {
      writeScan(raw, 'a-valid.sarif', [scanRun('valid', [])])
      writeFileSync(join(raw, 'b-invalid.sarif'), content)
      const result = execute()
      assert.notEqual(result.status, 0, content)
      assert.match(result.stderr, /Error:/)
      assert.equal(existsSync(output), false)
    })
  }
})

test('rejects empty or unsupported documents instead of discarding their metadata', () => {
  for (const document of [sarif([]), { ...sarif([scanRun('rule', [])]), inlineExternalProperties: [{ guid: 'external' }] }]) {
    withScan(({ raw, output, execute }) => {
      writeFileSync(join(raw, 'input.sarif'), JSON.stringify(document))
      assert.notEqual(execute().status, 0)
      assert.equal(existsSync(output), false)
    })
  }
})

test('leaves existing output untouched when an input cannot be parsed', () => {
  withScan(({ raw, output, execute }) => {
    mkdirSync(dirname(output))
    writeFileSync(output, 'previous output')
    writeFileSync(join(raw, 'broken.sarif'), '{broken')
    assert.notEqual(execute().status, 0)
    assert.equal(readFileSync(output, 'utf8'), 'previous output')
  })
})

test('rejects an empty raw directory', () => {
  withScan(({ output, execute }) => {
    assert.notEqual(execute().status, 0)
    assert.equal(existsSync(output), false)
  })
})
