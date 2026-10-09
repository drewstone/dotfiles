import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// gh-read runs read-only calls as tangletools through gh-drew, so fleet polling never spends drewstone's quota.
// A fake gh answers the identity check by token; nothing here reaches GitHub.
const DREW = "ghp_FAKEdrewFAKEdrewFAKEdrew000001";
const TOOLS = "ghp_FAKEtoolsFAKEtoolsFAKEtools01";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "gh-read-"));
  const home = join(root, "home");
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  // gh-read finds gh-drew beside itself, as install.sh links both into ~/bin.
  for (const tool of ["gh-read", "gh-drew", "gh"]) copyFileSync(resolve("claude/tools", tool), join(bin, tool));
  const realGh = join(root, "real-gh");
  const ran = join(root, "ran");
  writeFileSync(realGh, `#!/usr/bin/env bash
case "$*" in
  "api graphql -f query={viewer{login}} --jq .data.viewer.login")
    case "$GH_TOKEN" in ${DREW}) echo drewstone ;; ${TOOLS}) echo tangletools ;; *) exit 1 ;; esac ;;
  "api rate_limit --jq .resources.core.remaining") echo "\${FAKE_CORE:-4000}" ;;
  "api rate_limit --jq .resources.core.reset") echo 1790332087 ;;
  *) printf '%s %s\\n' "$GH_TOKEN" "$*" >> "${ran}"; echo "gh ran" ;;
esac
`);
  for (const f of [realGh, ...["gh-read", "gh-drew", "gh"].map((t) => join(bin, t))]) chmodSync(f, 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home, GH_SHIM_REAL_GH: realGh,
    DREW_GH_TOKEN: DREW, GH_TOKEN: DREW, TANGLETOOLS_GH_TOKEN: TOOLS,
    GH_DREW_CACHE_DIR: join(root, "cache"), GH_DREW_SECRETS_FILE: join(root, "absent.env"),
    XDG_STATE_HOME: join(root, "state") };
  return { root, bin, ran, env, state: join(root, "state") };
}

const run = (s, cmd, args, env = {}) => spawnSync(join(s.bin, cmd), args, { cwd: s.root, env: { ...s.env, ...env }, encoding: "utf8" });
const ran = (s) => (existsSync(s.ran) ? readFileSync(s.ran, "utf8").trim().split("\n") : []);
const logged = (s, tool) => {
  const dir = join(s.state, tool);
  return existsSync(dir) ? readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean)) : [];
};

test("reads run as tangletools and are logged apart from drewstone's calls", () => {
  const s = sandbox();
  try {
    for (const args of [["api", "repos/o/r/actions/workflows/deploy.yml/runs?per_page=5", "--jq", ".x"],
      ["api", "-X", "GET", "search/issues", "-f", "q=repo:o/r"],
      ["api", "graphql", "-f", "query={ repository(owner:\"o\", name:\"r\") { id } }"],
      ["pr", "view", "12", "-R", "o/r"], ["run", "list", "-R", "o/r"], ["search", "prs", "x"]]) {
      const result = run(s, "gh-read", args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(ran(s).length, 6);
    assert.ok(ran(s).every((line) => line.startsWith(`${TOOLS} `)), ran(s).join("\n"));
    assert.equal(logged(s, "gh-read").length, 6);
    assert.equal(logged(s, "gh-drew").length, 0);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("anything that could write or hand out the token is refused before gh runs", () => {
  const s = sandbox();
  try {
    for (const args of [["api", "-X", "POST", "repos/o/r/issues"], ["api", "--method=PATCH", "repos/o/r/pulls/1"],
      ["api", "repos/o/r/issues", "-f", "title=x"], ["api", "repos/o/r/issues", "--input", "body.json"],
      ["api", "graphql", "-f", "query=mutation { addStar(input:{}) { clientMutationId } }"],
      ["api", "graphql", "-F", "query=@q.graphql"],
      ["pr", "merge", "1"], ["pr", "create"], ["workflow", "run", "deploy.yml"], ["run", "rerun", "5"],
      ["auth", "token"], ["secret", "list"]]) {
      const result = run(s, "gh-read", args);
      assert.equal(result.status, 3, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /gh-read: refused/);
    }
    assert.deepEqual(ran(s), []);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test("reads stop at gh-read's own floor, and a call through the gh shim is logged once", () => {
  const s = sandbox();
  try {
    const refused = run(s, "gh-read", ["run", "list", "-R", "o/r"], { FAKE_CORE: "400" });
    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /reserved floor 500/);
    assert.equal(run(s, "gh-drew", ["pr", "list"]).status, 0);
    assert.equal(run(s, "gh", ["pr", "list"], { GH_DREW_SHIM: "" }).status, 0);
    assert.equal(logged(s, "gh-drew").length, 2);
    assert.ok(ran(s).every((line) => line.startsWith(`${DREW} `)));
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});
