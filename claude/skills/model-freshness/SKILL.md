---
name: model-freshness
description: Verify declared model IDs against live routing and current releases before choosing, changing, or shipping a model.
---

# Model freshness

A model id in product config is a claim about the world that rots silently. Three
different things go wrong and they look identical from inside the product:

| what happened | what the product sees |
|---|---|
| the id is a generation behind | nothing — it works, on an old model |
| the id no longer exists upstream | an error, eventually, in production |
| the upstream account is capped or its key is dead | **a 200 from a different model** |

The third is the dangerous one. The router fails over, so a request for
`gpt-5.5` can answer 200 with `body.model = gemini-2.5-flash`. Status codes and
catalog listings both say "fine". Only comparing the id that ANSWERED against
the id you ASKED for catches it.

## Run it

```bash
model-freshness            # full report
model-freshness --quiet    # only problems (what the cron runs)
model-freshness --json     # machine-readable
```

Exit code is non-zero when something needs a human. The daily local cron writes
`/tmp/model-freshness.log`; there is no CI gate for this by design.

Verdicts:

- `ok` — the id served itself.
- `SUB` — **served, by a different model.** Read the `failover` field: it names
  the trigger (`provider_quota_exhausted`, `provider_key_invalid`, …). The
  product is silently running on something else.
- `DEAD` — the router refused. The `cause` is the router's own
  `X-Tangle-Failure-Category`, so a spend cap, a revoked credential and a
  genuinely unmapped model are three different lines, not one message.
- `GONE` — the id is not in the catalog at all.
- `newer available` — the id serves, and a later generation of the same family
  is in the catalog.

## Changing a model id

1. **Probe before you write it down.** A real chat completion, and check that
   the answer came back under the id you asked for. Catalog presence is not
   liveness; a 200 is not proof it was your model.
2. **Fallback chains leave the family.** A same-family fallback shares the
   outage it exists to escape. `claude-* → gemini-*`, not `gpt-5.5 → gpt-5`.
3. **Update every declaration site.** Products name models in more than one
   place: the profile catalog, the chat resolver, `wrangler.toml`, and the tests
   that pin them. `model-freshness` prints the file for every id it found.
4. **Tests that pin a literal id must move with it.** Where the literal is
   really a product constant, assert the constant instead — it cannot rot.
5. **Re-run the tool.** The id you just wrote should read `ok` with no
   `newer available`.

## When a model is DEAD or SUB

The cause decides who fixes it, and they are not the same person:

- `provider_quota_exhausted` — the upstream account hit a spend limit. Nothing
  in our code fixes it; raise the cap or fund the account.
- `provider_key_invalid` — rotate the credential in
  `~/company/devops/secrets/tangle-router.env` and redeploy the router.
- `model_not_found` — the upstream retired the id. Pick the successor.
- `no_provider_configured` — genuinely unmapped: add the prefix to the router's
  `prefixMap` (`lib/ai.ts`).

Do not "fix" a SUB by deleting the failover. Failover is why the product stayed
up. Fix the cause, then re-probe.

## Adding a product

`PRODUCTS` at the top of `claude/tools/model-freshness` lists each repo and the
files it declares model ids in. Explicit paths, not a glob: a scan that wanders
starts reporting prose and file names as models.

## Log the run

```bash
skill-run-log /model-freshness --target "<product-or-repository>" --verdict <FRESH|DRIFT|BLOCKED> --next /<next-skill-or-stop>
```
