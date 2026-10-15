import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const sessionResolver = fileURLToPath(new URL("./session-home.py", import.meta.url));

// The companion keeps one stdio broker per Claude session. Keep its connection
// stable while admitting each new thread through acct, rather than assigning
// every future task to the account that happened to launch the broker.
const [wrapper, binary, ...args] = process.argv.slice(2);
const workers = new Set(), threads = new Map(), serverRequests = new Map();
let initialization, sequence = 0, closed = false;
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const failure = () => new Error("Codex account worker unavailable.");

function retire(worker) {
  if (!worker.retired && worker.completed && !worker.pending.size && !worker.turns.size && ![...serverRequests.values()].some(r => r.worker === worker)) {
    worker.retired = true;
    worker.proc.stdin.end();
  }
}

function startWorker(home) {
  const env = { ...process.env, CODEX_REAL_BIN: binary, CODEX_ROUTER_CHILD: "1" };
  delete env.ACCT_RESERVATION;
  delete env.ACCT_ROUTED;
  if (home) env.CODEX_HOME = home;
  else delete env.CODEX_HOME;
  const proc = spawn(home ? wrapper : "acct", home ? args : ["run", "--", wrapper, ...args], {
    env, stdio: ["pipe", "pipe", "inherit", "pipe"],
  });
  const worker = { proc, home, pending: new Map(), turns: new Set(), retired: false, completed: false };
  workers.add(worker);
  worker.homeReady = new Promise((resolve, reject) => {
    createInterface({ input: proc.stdio[3] }).once("line", (home) => { worker.home = home; resolve(); });
    proc.once("exit", () => reject(failure()));
    proc.once("error", () => reject(failure()));
  });
  // Initialization below awaits both promises; mark an early process failure
  // handled while its JSON-RPC initialization rejection is being delivered.
  worker.homeReady.catch(() => {});
  proc.stdin.on("error", () => {});
  const lines = createInterface({ input: proc.stdout });
  lines.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { proc.stdin.end(); return; }
    if (message.method) {
      const thread = message.params?.thread?.id ?? message.params?.threadId;
      if (thread) threads.set(thread, worker);
      if (message.method === "turn/started") worker.turns.add(message.params?.turn?.id);
      if (message.method === "turn/completed") {
        worker.turns.delete(message.params?.turn?.id);
        worker.completed = true;
      }
      if (message.id !== undefined) {
        const id = `acct-server-${++sequence}`;
        serverRequests.set(id, { worker, id: message.id });
        send({ ...message, id });
      } else send(message);
      retire(worker);
    } else {
      const pending = worker.pending.get(message.id);
      if (!pending) return;
      worker.pending.delete(message.id);
      if (message.error) pending.reject(Object.assign(new Error("Codex request failed."), { rpc: message.error }));
      else pending.resolve(message.result);
      // Promise continuations may still need this worker to send another request.
    }
  });
  const exited = () => {
    worker.retired = true;
    workers.delete(worker);
    for (const pending of worker.pending.values()) pending.reject(failure());
    worker.pending.clear();
    for (const [id, request] of serverRequests) if (request.worker === worker) serverRequests.delete(id);
  };
  proc.on("error", exited);
  proc.on("exit", exited);
  return worker;
}

function request(worker, method, params) {
  if (worker.retired) return Promise.reject(failure());
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    worker.pending.set(id, { resolve, reject });
    worker.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

async function ready(home) {
  if (closed) throw failure();
  const worker = startWorker(home);
  try {
    [worker.initializeResult] = await Promise.all([
      request(worker, "initialize", initialization), worker.homeReady,
    ]);
    worker.proc.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    return worker;
  } catch (error) { worker.proc.stdin.end(); throw error; }
}

async function handle(message) {
  if (!message.method) {
    const origin = serverRequests.get(message.id);
    if (origin && !origin.worker.retired) {
      serverRequests.delete(message.id);
      origin.worker.proc.stdin.write(`${JSON.stringify({ ...message, id: origin.id })}\n`);
    }
    return;
  }
  if (message.method === "initialized") return;
  if (message.id === undefined) {
    const worker = threads.get(message.params?.threadId);
    if (worker && !worker.retired) worker.proc.stdin.write(`${JSON.stringify(message)}\n`);
    return;
  }
  let worker;
  try {
    if (message.method === "initialize") {
      initialization = message.params;
      worker = await ready(join(homedir(), ".codex"));
      send({ id: message.id, result: worker.initializeResult });
      worker.completed = true;
      retire(worker);
      return;
    }
    if (!initialization) throw new Error("Initialize Codex before making requests.");
    const threadId = message.params?.threadId;
    const previous = threads.get(threadId);
    if (message.method === "thread/start") {
      worker = await ready();
    } else if (threadId) {
      if (previous && !previous.retired) worker = previous;
      else {
        const home = previous?.home ?? execFileSync("python3", [sessionResolver, "exec", "resume", threadId], { encoding: "utf8" });
        // Never silently resume a different account's history, including after
        // a broker restart. Native Codex reports missing sessions in its home.
        if (!home) throw new Error("Saved Codex thread home was not found.");
        worker = await ready(home);
        threads.set(threadId, worker);
      }
    } else {
      worker = await ready(join(homedir(), ".codex"));
      worker.completed = true;
    }
    const result = await request(worker, message.method, message.params ?? {});
    if (result?.thread?.id) threads.set(result.thread.id, worker);
    if (result?.reviewThreadId) threads.set(result.reviewThreadId, worker);
    send({ id: message.id, result });
    retire(worker);
  } catch (error) {
    if (worker) { worker.completed = true; retire(worker); }
    send({ id: message.id, error: error.rpc ?? { code: -32000, message: error.message } });
  }
}

const input = createInterface({ input: process.stdin });
// Keep client requests ordered, but let server-request answers pass through
// immediately so approval requests cannot deadlock an in-flight client call.
let chain = Promise.resolve();
input.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); }
  catch { send({ id: null, error: { code: -32700, message: "Invalid JSON-RPC message." } }); return; }
  if (!message.method) void handle(message);
  else chain = chain.then(() => handle(message));
});
function shutdown() {
  closed = true;
  for (const worker of workers) worker.proc.stdin.end();
}
input.on("close", shutdown);
process.stdout.on("error", shutdown);
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  shutdown();
  process.stdin.destroy();
});
