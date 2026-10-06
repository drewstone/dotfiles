#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const json = args.includes('--json')
const maxIndex = args.indexOf('--max')
const max = maxIndex >= 0 ? Number(args[maxIndex + 1]) : 250
const targets = args.filter((arg, index) => {
  if (arg === '--json') return false
  if (arg === '--max') return false
  if (maxIndex >= 0 && index === maxIndex + 1) return false
  return true
})

if (targets.length === 0) {
  console.error('Usage: scan-docs-slop.mjs [--json] [--max N] <file-or-dir>...')
  process.exit(2)
}

const excludedDirs = new Set([
  '.git',
  '.next',
  'dist',
  'node_modules',
  'out',
  'public',
  '.turbo',
])

const extensions = new Set(['.md', '.mdx', '.txt'])

const opencodePeerContext =
  /\b(Claude Code|Codex|AMP|Factory Droids|Kimi Code|Pi|Forge|ACP|Cursor|OpenClaw|NanoClaw|Hermes|CLI base|Gemini CLI|\/infrastructure\/harnesses|\/api\/capabilities|supported harnesses|peer harnesses|other supported harnesses)\b/i

const boundarySeparationContext =
  /\b(raw protocol|protocol fallback|without implying any protocol guarantee|depends on a registered blueprint service instance|chain\/indexer|live operator|operator endpoint|product\/API-key|hosted app owns|protocol page owns|generic protocol route|raw service state)\b/i

const rules = [
  {
    id: 'boundary-hosted-protocol',
    severity: 'high',
    pattern:
      /\b(protocol|onchain|decentralized|trustless)\b.*\b(router\.tangle\.tools|sandbox\.tangle\.tools|intelligence\.tangle\.tools|hosted|cloud)\b|\b(router\.tangle\.tools|sandbox\.tangle\.tools|intelligence\.tangle\.tools|hosted|cloud)\b.*\b(protocol|onchain|decentralized|trustless)\b/i,
    message:
      'Check protocol-vs-hosted-infra boundary. Name what the protocol enforces and what hosted Tangle infrastructure does.',
  },
  {
    id: 'single-harness-opencode',
    severity: 'high',
    pattern: /\bopencode\b/i,
    message:
      'OpenCode mention. Verify the page does not imply OpenCode is the only or canonical harness when sandbox supports multiple harnesses.',
  },
  {
    id: 'claim-secure-without-mechanism',
    severity: 'high',
    pattern:
      /\b(secure|verifiable|auditable|trustless|decentralized|production-grade|enterprise-grade)\b/i,
    exclude:
      /\b(private key|private keys|private storage|keep .* private|privacy pool|secure-code-execution|url=|name=)\b/i,
    message:
      'Load-bearing claim. Make sure the same paragraph names the mechanism, source of truth, or limitation.',
  },
  {
    id: 'coming-soon-live-state',
    severity: 'high',
    pattern: /\b(coming soon|planned|roadmap|will support|will allow|will add)\b/i,
    message:
      'Launch-state claim. Verify whether this is still future tense or already shipped.',
  },
  {
    id: 'throat-clearing',
    severity: 'medium',
    pattern:
      /\b(here'?s what|here'?s why|here'?s the|at its core|it'?s worth noting|let'?s dive|let'?s unpack|the bottom line|make no mistake)\b/i,
    message: 'Throat-clearing phrase. Cut to the fact or instruction.',
  },
  {
    id: 'inflated-adjective',
    severity: 'medium',
    pattern:
      /\b(seamless|robust|powerful|comprehensive|cutting-edge|state-of-the-art|groundbreaking|revolutionary|game-changing|world-class|best-in-class|next-generation)\b/i,
    message: 'Inflated adjective. Replace with the mechanism, number, or concrete capability.',
  },
  {
    id: 'jargon',
    severity: 'medium',
    pattern:
      /\b(landscape|paradigm|synergy|holistic|delve|unlock|showcase|leverage)\b/i,
    message: 'Likely AI/business jargon. Replace with plain technical language.',
  },
  {
    id: 'negative-parallelism',
    severity: 'medium',
    pattern:
      /\b(not just|more than just|not merely|isn'?t just|is not just|not only)\b/i,
    message: 'Formulaic contrast. State the positive claim directly.',
  },
  {
    id: 'em-dash',
    severity: 'medium',
    pattern: /—/,
    message: 'Em dash in prose. Replace with a period, comma, colon, or rewrite.',
  },
  {
    id: 'weak-softener',
    severity: 'low',
    pattern:
      /\b(just|simply|actually|basically|really|very|extremely|generally|typically|easily)\b/i,
    message: 'Softener or filler. Keep only if it changes technical meaning.',
  },
]

function walk(target) {
  const absolute = path.resolve(target)
  if (!fs.existsSync(absolute)) return []

  const stat = fs.statSync(absolute)
  if (stat.isFile()) {
    return extensions.has(path.extname(absolute)) ? [absolute] : []
  }

  if (!stat.isDirectory()) return []

  const entries = fs.readdirSync(absolute, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirs.has(entry.name)) continue
    files.push(...walk(path.join(absolute, entry.name)))
  }

  return files
}

function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  const findings = []
  let inFence = false

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) return
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) return

    for (const rule of rules) {
      if (rule.exclude?.test(line)) continue
      if (rule.pattern.test(line)) {
        if (rule.id === 'boundary-hosted-protocol') {
          const start = Math.max(0, index - 2)
          const end = Math.min(lines.length, index + 3)
          const context = lines.slice(start, end).join('\n')
          if (boundarySeparationContext.test(context)) continue
        }

        if (rule.id === 'single-harness-opencode') {
          const start = Math.max(0, index - 8)
          const end = Math.min(lines.length, index + 9)
          const context = lines.slice(start, end).join('\n')
          if (opencodePeerContext.test(context)) continue
        }

        findings.push({
          file,
          line: index + 1,
          severity: rule.severity,
          rule: rule.id,
          message: rule.message,
          text: line.trim(),
        })
      }
    }
  })

  return findings
}

const files = [...new Set(targets.flatMap(walk))].sort()
const findings = files.flatMap(scanFile)
const severityRank = { high: 0, medium: 1, low: 2 }
findings.sort((a, b) => {
  const severity = severityRank[a.severity] - severityRank[b.severity]
  if (severity !== 0) return severity
  const file = a.file.localeCompare(b.file)
  if (file !== 0) return file
  return a.line - b.line
})

const limited = findings.slice(0, max)

if (json) {
  console.log(
    JSON.stringify(
      {
        scannedFiles: files.length,
        findingCount: findings.length,
        emittedCount: limited.length,
        findings: limited,
      },
      null,
      2,
    ),
  )
} else {
  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1
      return acc
    },
    { high: 0, medium: 0, low: 0 },
  )

  console.log(
    `Scanned ${files.length} files. Findings: ${findings.length} (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  )

  for (const finding of limited) {
    const relative = path.relative(process.cwd(), finding.file)
    console.log(
      `${finding.severity.toUpperCase()} ${relative}:${finding.line} ${finding.rule} - ${finding.message}`,
    )
    console.log(`  ${finding.text}`)
  }

  if (limited.length < findings.length) {
    console.log(`... ${findings.length - limited.length} more findings hidden. Re-run with --max ${findings.length}.`)
  }
}
