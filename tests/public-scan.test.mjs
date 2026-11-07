// The public tree names nothing private: every tracked file is checked against git/hooks/public-denylist, the list the
// pre-commit hook enforces on staged files (one case-insensitive regex per line, # comments). Each hit is file:line.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patterns = readFileSync(join(root, 'git', 'hooks', 'public-denylist'), 'utf8').split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => new RegExp(line.trim(), 'i'))

test('no tracked file matches the public denylist', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const hits = []
  for (const file of files) {
    const path = join(root, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (!stat || (!stat.isFile() && !stat.isSymbolicLink())) continue   // deleted, or a submodule its own repository checks
    const data = stat.isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path)
    if (data.includes(0)) continue
    data.toString('utf8').split('\n').forEach((line, index) => {
      for (const pattern of patterns) if (pattern.test(line)) hits.push(`${file}:${index + 1}: ${pattern.source}`)
    })
  }
  assert.deepEqual(hits, [], `${hits.length} denylist hits:\n${hits.join('\n')}`)
})
