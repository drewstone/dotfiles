// A per-key request budget shared by every operator-API client on this host.
//
// Agent apps allow each key a fixed number of requests per minute (sliding
// window; a refused request does not count) and answer the excess with 429 and
// Retry-After. Several lanes share one key, so each client waiting out its own
// refusals still produces bursts: on 2026-10-10 one key served 1,121 requests,
// 653 of them refused. Taking a slot here before each request keeps the host
// under the key's limit instead.
//
// State is a list of request times per key, under ~/.local/state/operator-api/,
// named by a hash of the key (never the key). An exclusive lock file guards
// each read-modify-write; a lock older than LOCK_STALE_MS belongs to a process
// that died holding it and is broken.
//
// OPERATOR_API_RATE_PER_MIN sets this host's share (default 50, under the
// apps' 60). Give each lane a share of the key's limit when lanes run on
// different hosts. 0 disables the budget.
import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WINDOW_MS = 60_000
const LOCK_STALE_MS = 5_000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function ratePerMinute(env = process.env) {
  const raw = env.OPERATOR_API_RATE_PER_MIN
  if (raw === undefined || raw === '') return 50
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`OPERATOR_API_RATE_PER_MIN must be a whole number, got ${raw}`)
  return value
}

function stateDir(env) {
  return env.OPERATOR_API_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'operator-api')
}

async function withLock(lockPath, action) {
  for (;;) {
    let fd
    try {
      fd = openSync(lockPath, 'wx')
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath)
      } catch { /* another client released or broke it */ }
      await sleep(10 + Math.random() * 20)
      continue
    }
    try {
      return action()
    } finally {
      closeSync(fd)
      try { unlinkSync(lockPath) } catch { /* already broken as stale */ }
    }
  }
}

/** Waits until this host may send one more request with `key`, then records it. */
export async function takeSlot(key, { env = process.env, now = () => Date.now() } = {}) {
  const limit = ratePerMinute(env)
  if (limit === 0) return 0
  const dir = stateDir(env)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const name = createHash('sha256').update(key).digest('hex').slice(0, 24)
  const file = join(dir, `${name}.json`)
  let waited = 0
  for (;;) {
    const wait = await withLock(`${file}.lock`, () => {
      let times = []
      try { times = JSON.parse(readFileSync(file, 'utf8')) } catch { /* absent or torn: start a fresh window */ }
      const at = now()
      times = Array.isArray(times) ? times.filter((t) => Number.isFinite(t) && t > at - WINDOW_MS) : []
      if (times.length < limit) {
        times.push(at)
        writeFileSync(`${file}.tmp`, JSON.stringify(times))
        renameSync(`${file}.tmp`, file)
        return 0
      }
      return times[times.length - limit] + WINDOW_MS - at
    })
    if (wait <= 0) return waited
    const pause = Math.min(wait, WINDOW_MS) + Math.random() * 250
    waited += pause
    await sleep(pause)
  }
}

/** Seconds a 429 asks the caller to wait, or null when it gives no usable bound. */
export function retryAfterSeconds(response, maxSeconds = 65) {
  const value = Number(response.headers.get('retry-after'))
  return value > 0 && value <= maxSeconds ? value : null
}
