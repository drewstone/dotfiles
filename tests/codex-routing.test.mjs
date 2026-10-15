import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import test from "node:test";

const wrapper = resolve(process.env.CODEX_WRAPPER_SOURCE || "claude/tools/codex");
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "codex-tasks-"));
  const bin = join(home, "bin"), real = join(home, "native-codex");
  mkdirSync(bin);
  symlinkSync(wrapper, join(bin, "codex"));
  writeFileSync(join(home, "quota.json"), JSON.stringify({ a: 0, b: 0 }));
  writeFileSync(join(bin, "acct"), `#!${process.execPath}
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = process.env.FIXTURE_HOME, quota = JSON.parse(fs.readFileSync(path.join(root, 'quota.json')));
const seat = Object.keys(quota).filter(k => quota[k] < 100).sort((a,b) => quota[a] - quota[b])[0];
fs.appendFileSync(path.join(root, 'admissions.jsonl'), JSON.stringify({seat:seat || null})+'\\n');
if (!seat) process.exit(42);
const home = path.join(root, '.config/agent-accounts/codex', seat);
const argv = process.argv.slice(2); if (argv[0] !== 'run' || argv[1] !== '--') process.exit(90);
const result = cp.spawnSync(argv[2], argv.slice(3), {env:{...process.env, ACCT_ROUTED:'codex', CODEX_HOME:home},stdio:['inherit','inherit','inherit',3]});
process.exit(result.status ?? 91);
`);
  // The native fixture implements the actual JSON-RPC process boundary. It
  // models quota refusal and persistent homes; no subscription calls are made.
  writeFileSync(real, `#!${process.execPath}
const fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');
if (process.argv.includes('--version') || process.argv.includes('--help')) {console.log('fixture codex'); process.exit(0);}
const home = process.env.CODEX_HOME || path.join(process.env.HOME,'.codex'), seat=path.basename(home);
const root = process.env.FIXTURE_HOME, quotaFile=path.join(root,'quota.json');
fs.mkdirSync(path.join(home,'sessions'),{recursive:true});
const log=(event)=>fs.appendFileSync(path.join(root,'workers.jsonl'),JSON.stringify({seat,pid:process.pid,...event})+'\\n');
log({event:'start'}); process.on('exit',()=>log({event:'exit'}));
const out=m=>console.log(JSON.stringify(m));
const result=(m,r)=>out({id:m.id,result:r});
const turns=new Map(); let approval;
function finish(threadId,turn) {
  out({method:'item/completed',params:{threadId,turnId:turn.id,item:{id:'item',type:'agentMessage',text:seat}}});
  out({method:'turn/completed',params:{threadId,turn:{...turn,status:'completed'}}});
  turns.delete(threadId);
}
readline.createInterface({input:process.stdin}).on('line',line=>{
const m=JSON.parse(line), p=m.params || {};
if (!m.method) {if(approval){finish(approval.threadId,approval.turn);approval=null;} return;}
if(m.method==='initialized') return;
if(m.method==='initialize') return result(m,{userAgent:'fixture-codex'});
if(m.method==='thread/start') {
  const id=crypto.randomUUID();
  fs.writeFileSync(path.join(home,'sessions','rollout-2026-10-15T00-00-00-'+id+'.jsonl'),JSON.stringify({type:'session_meta',payload:{id,cwd:process.cwd(),timestamp:new Date().toISOString()}})+'\\n');
  return result(m,{thread:{id}});
}
if(m.method==='thread/resume'||m.method==='thread/fork') {
  if(!fs.readdirSync(path.join(home,'sessions')).some(f=>f.endsWith('-'+p.threadId+'.jsonl'))) return out({id:m.id,error:{code:-32000,message:'session-not-found'}});
  return result(m,{thread:{id:p.threadId}});
}
if(m.method==='turn/start') {
  const quota=JSON.parse(fs.readFileSync(quotaFile));
  if(quota[seat]>=100) return out({id:m.id,error:{code:-32000,message:'subscription-exhausted'}});
  const text=p.input?.[0]?.text || '', turn={id:crypto.randomUUID(),status:'inProgress'}; turns.set(p.threadId,turn);
  if(text==='exhaust'){quota[seat]=100;fs.writeFileSync(quotaFile,JSON.stringify(quota));}
  result(m,{turn});out({method:'turn/started',params:{threadId:p.threadId,turn}});
  if(text==='approve'){approval={threadId:p.threadId,turn};out({id:1,method:'item/commandExecution/requestApproval',params:{threadId:p.threadId}});}
  else if(text!=='hold') setTimeout(()=>finish(p.threadId,turn),20);
  return;
}
if(m.method==='turn/interrupt') {result(m,{});const turn=turns.get(p.threadId);if(turn)finish(p.threadId,turn);return;}
result(m,{});
});
`);
  chmodSync(real, 0o755); chmodSync(join(bin, "acct"), 0o755);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"),
    CODEX_HOME: "", ACCT_ROUTED: "", CODEX_REAL_BIN: real, FIXTURE_HOME: home,
    PATH: `${bin}:${process.env.PATH}`, CLAUDE_PLUGIN_DATA: join(home, "plugin-data") };
  delete env.CODEX_COMPANION_APP_SERVER_ENDPOINT;
  const records = (file) => existsSync(join(home, file)) ? readFileSync(join(home, file), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  return { home, bin, real, env, records, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function rpc(proc) {
  let next = 0;
  const pending = new Map(), notifications = [], waiters = [];
  createInterface({ input: proc.stdout }).on("line", line => {
    const message = JSON.parse(line);
    if (message.method) {
      if (message.id !== undefined) proc.stdin.write(JSON.stringify({ id: message.id, result: { decision: "accept" } }) + "\n");
      notifications.push(message);
      for (const wake of waiters.splice(0)) wake();
    } else if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  proc.on("exit", () => { for (const p of pending.values()) p.reject(new Error("router exited")); });
  return {
    request(method, params = {}) { return new Promise((resolve, reject) => {
      const id = ++next; pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    }); },
    async notification(method, threadId) {
      for (;;) {
        const found = notifications.find(m => m.method === method && m.params?.threadId === threadId);
        if (found) return found;
        await new Promise(resolve => waiters.push(resolve));
      }
    },
  };
}

test("saved exec resumes and forks retain the origin across differently loaded accounts", () => {
  const f = fixture();
  const a = join(f.home, ".config/agent-accounts/codex/a"), b = join(f.home, ".config/agent-accounts/codex/b");
  const idA = "11111111-1111-1111-1111-111111111111", idB = "22222222-2222-2222-2222-222222222222";
  for (const [home, id, at, cwd] of [[a, idA, "2026-10-15T01:00:00Z", process.cwd()], [b, idB, "2026-10-15T02:00:00Z", "/another/workspace"]]) {
    mkdirSync(join(home, "sessions"), { recursive: true });
    writeFileSync(join(home, "sessions", `rollout-${at}-${id}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id, timestamp: at, cwd } }) + "\n");
  }
  writeFileSync(join(a, "session_index.jsonl"), JSON.stringify({ id: idA, thread_name: "saved-name" }) + "\n");
  writeFileSync(f.real, `#!${process.execPath}
require('fs').writeFileSync(process.env.FIXTURE_HOME+'/origin',process.env.CODEX_HOME||'default');
`);
  writeFileSync(join(f.home, "quota.json"), JSON.stringify({ a: 100, b: 0 }));
  try {
    for (const [args, home] of [
      [["exec", "resume", idA, "continue"], a], [["exec", "fork", idA, "continue"], a],
      [["exec", "resume", "saved-name", "continue"], a],
      [["exec", "--output-schema", "/fixture/schema.json", "resume", idA, "continue"], a],
      [["exec", "-o", "/fixture/output", "fork", idA, "continue"], a],
      [["exec", "resume", "--last", "continue"], a],
      [["exec", "resume", "--last", "--all", "continue"], b],
      [["--cd", "/another/workspace", "exec", "resume", "--last", "continue"], b],
    ]) {
      const result = spawnSync(wrapper, args, { env: f.env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(f.home, "origin"), "utf8"), home);
    }
    // Native --last uses last update and current cwd from SQLite, even when
    // an older-created rollout was resumed after a newer-created rollout.
    const db = spawnSync("python3", ["-c", `import sqlite3,sys
from pathlib import Path
home,session=sys.argv[1:]
rollout=next(Path(home).joinpath('sessions').glob('*.jsonl'))
with sqlite3.connect(str(Path(home)/'state_5.sqlite')) as con:
 con.execute('CREATE TABLE threads(id TEXT,cwd TEXT,rollout_path TEXT,updated_at INTEGER,updated_at_ms INTEGER,name TEXT,title TEXT,archived INTEGER)')
 con.execute('INSERT INTO threads VALUES(?,?,?,?,?,?,?,0)',(session,'/another/workspace',str(rollout),9999999999,9999999999000,'saved-name','saved-title'))
`, a, idA], { encoding: "utf8" });
    assert.equal(db.status, 0, db.stderr);
    for (const args of [["exec", "resume", "--last", "--all", "continue"],
      ["--cd", "/another/workspace", "exec", "resume", "--last", "continue"],
      ["exec", "resume", "--all", "saved-title", "continue"]]) {
      const result = spawnSync(wrapper, args, { env: f.env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(f.home, "origin"), "utf8"), a);
    }
    const customRoot = join(f.home, "custom-accounts");
    mkdirSync(join(customRoot, "codex"), { recursive: true });
    symlinkSync(a, join(customRoot, "codex/linked-seat"));
    const linked = spawnSync(wrapper, ["exec", "resume", idA, "continue"], { env: { ...f.env, ACCT_CONFIG: customRoot }, encoding: "utf8" });
    assert.equal(linked.status, 0, linked.stderr);
    assert.equal(readFileSync(join(f.home, "origin"), "utf8"), a);
    assert.deepEqual(f.records("admissions.jsonl"), []);
  } finally { f.cleanup(); }
});

test("one stdio broker allocates each new task, preserves active threads and approvals, and refuses exhausted resumes", { timeout: 15000 }, async () => {
  const f = fixture();
  const proc = spawn(process.execPath, [resolve("claude/tools/codex-routing/app-server.mjs"), wrapper, f.real, "app-server"], { env: f.env, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = ""; proc.stderr.on("data", b => { stderr += b; });
  const client = rpc(proc);
  try {
    await client.request("initialize", { clientInfo: { name: "companion-fixture", version: "1" } });
    const first = (await client.request("thread/start", {})).thread.id;
    await client.request("turn/start", { threadId: first, input: [{ type: "text", text: "hold" }] });
    // Quota changes while the first task is in flight. Its worker stays live.
    writeFileSync(join(f.home, "quota.json"), JSON.stringify({ a: 100, b: 0 }));
    const second = (await client.request("thread/start", {})).thread.id;
    await client.request("turn/start", { threadId: second, input: [{ type: "text", text: "approve" }] });
    await client.notification("turn/completed", second);
    const firstPid = f.records("workers.jsonl").find(r => r.seat === "a" && r.event === "start").pid;
    assert.ok(!f.records("workers.jsonl").some(r => r.pid === firstPid && r.event === "exit"));
    await client.request("turn/interrupt", { threadId: first });
    await client.notification("turn/completed", first);
    await client.request("thread/resume", { threadId: first });
    await assert.rejects(client.request("turn/start", { threadId: first, input: [{ type: "text", text: "continue" }] }), /subscription-exhausted/);
    assert.deepEqual(f.records("admissions.jsonl"), [{ seat: "a" }, { seat: "b" }]);
    writeFileSync(join(f.home, "quota.json"), JSON.stringify({ a: 100, b: 100 }));
    await assert.rejects(client.request("thread/start", {}), /worker unavailable/);
    assert.deepEqual(f.records("admissions.jsonl"), [{ seat: "a" }, { seat: "b" }, { seat: null }]);
  } finally {
    const exited = once(proc, "exit"); proc.stdin.end(); await exited;
    assert.equal(proc.exitCode, 0, stderr);
    const records = f.records("workers.jsonl");
    assert.deepEqual(records.filter(r => r.event === "start").map(r => r.pid).sort(), records.filter(r => r.event === "exit").map(r => r.pid).sort());
    f.cleanup();
  }
});

test("Codex Companion v1.0.4 runs sequential tasks through one real shared broker after quota exhaustion", { skip: !process.env.CODEX_PLUGIN_ROOT, timeout: 20000 }, async () => {
  const f = fixture(), previous = { ...process.env };
  const plugin = resolve(process.env.CODEX_PLUGIN_ROOT);
  const lifecycle = await import(pathToFileURL(join(plugin, "scripts/lib/broker-lifecycle.mjs")));
  const codex = await import(pathToFileURL(join(plugin, "scripts/lib/codex.mjs")));
  let session;
  // Native Codex can be installed without node in PATH. The companion itself
  // uses an absolute Node executable; the wrapper must find the nvm default.
  const nvm = join(f.home, "nvm"), nodeBin = join(nvm, "versions/node/v-fixture/bin");
  mkdirSync(join(nvm, "alias"), { recursive: true }); mkdirSync(nodeBin, { recursive: true });
  writeFileSync(join(nvm, "alias/default"), "fixture\n"); symlinkSync(process.execPath, join(nodeBin, "node"));
  for (const command of ["bash", "readlink", "dirname", "ps", "cat", "python3"]) {
    const path = spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" }).stdout.trim();
    symlinkSync(path, join(f.bin, command));
  }
  f.env.PATH = f.bin; f.env.NVM_DIR = nvm;
  try {
    Object.assign(process.env, f.env);
    delete process.env.CODEX_COMPANION_APP_SERVER_ENDPOINT;
    session = await lifecycle.ensureBrokerSession(f.home, { env: f.env, timeoutMs: 10000 });
    assert.ok(session, "real companion broker started");
    process.env.CODEX_COMPANION_APP_SERVER_ENDPOINT = session.endpoint;
    const first = await codex.runAppServerTurn(f.home, { prompt: "exhaust", persistThread: true });
    assert.equal(first.status, 0); assert.equal(first.finalMessage, "a");
    const second = await codex.runAppServerTurn(f.home, { prompt: "normal" });
    assert.equal(second.status, 0); assert.equal(second.finalMessage, "b");
    assert.equal(lifecycle.loadBrokerSession(f.home).endpoint, session.endpoint);
    assert.deepEqual(f.records("admissions.jsonl"), [{ seat: "a" }, { seat: "b" }]);
    writeFileSync(join(f.home, "quota.json"), JSON.stringify({ a: 100, b: 100 }));
    await assert.rejects(codex.runAppServerTurn(f.home, { prompt: "normal" }), /worker unavailable/);
    assert.deepEqual(f.records("admissions.jsonl"), [{ seat: "a" }, { seat: "b" }, { seat: null }]);
  } finally {
    if (session) await lifecycle.sendBrokerShutdown(session.endpoint);
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    // The real broker cleans its own child before shutdown responds/exits.
    await new Promise(resolve => setTimeout(resolve, 150));
    f.cleanup();
  }
});
