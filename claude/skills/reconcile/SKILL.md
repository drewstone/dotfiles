---
name: reconcile
description: "Someone sent a paper, post, repo, or technique — decide whether we benefit. Extract the real claim, check we don't already have it, name the cheapest falsification, adopt or reject on record."
---

# Reconcile an external idea

Most useful knowledge arrives from outside: a paper, a tweet, a repo, someone's benchmark.
The failure is not ignoring it — it is adopting it because it sounded good, or rebuilding something we already own because the author called it a different name.
This skill turns "here, look at this" into a decision with evidence behind it, recorded whether the answer is yes or no.

The output is always a written decision. A rejection recorded is worth as much as an adoption, because it stops the same idea being re-litigated in three weeks by someone who forgot.

## Extract the claim, not the pitch

Read the primary source. Not the abstract alone, not the thread summarizing it, not a fetch tool's paraphrase — those mis-summarize formal work routinely, and a wrong definition here poisons every step after it.

State, in your own words:

- **The claim** — one sentence, falsifiable. If you cannot make it falsifiable, that is the finding.
- **The evidence** — what was actually measured: n, the comparison arm, the effect size. "Improves performance" with no denominator is a marketing claim, and you should say so.
- **The assumption** — what must be true for it to hold. Nearly every result has one that quietly does not apply to us.
- **The mechanism** — *why* it would work. A result with a mechanism transfers; a result without one is a correlation someone got lucky with.

## Check we don't already have it — mechanically

The single most common failure. The author's name for a thing is never the name we would have chosen, so a name search returns nothing and you conclude it is absent.

Do not grep for the idea's name. List the surfaces that would contain it:

```bash
# the knowledge base, by topic not by name
ls kb/pages/ 2>/dev/null
# the capability census of the shared stack
for r in agent-runtime agent-eval agent-knowledge; do echo "=== $r"; ls ~/code/$r/src; done
# the harness capability cards, by FIELD not by keyword
python3 -c "import json;print(list(json.load(open('<card>.json'))['card'].keys()))"
```

Then say one of these out loud, with what you ran:

- "Found it at `<path>` — this is the same thing under a different name; the question becomes whether their version is better."
- "Checked `<surfaces>`, none exists — this would be new."

A proposal without this check is rejected on sight. Twice in one session I proposed adding a capability that was already a populated field in our own knowledge base.

## Decide whether it applies to us

| question | reject if |
| --- | --- |
| Does the stated assumption hold here? | the assumption is the thing we violate — say which and stop |
| Is the regime the same? | measured on a toy scale, and our problem is orders of magnitude larger |
| Is it better than what we do *now*? | "better than nothing" when we already do something adequate |
| Would it change a decision? | nothing we do differs under it — interesting is not the same as useful |

Name the measure on which it would be better *before* deciding. An improvement with no metric is a preference.

## Name the cheapest falsification

The test that would tell us it is wrong, runnable in under a day, ideally under an hour. Offline beats live; retrospective beats prospective — we usually have data that already contains the answer.

If nothing cheap can falsify it, say so plainly and record it as **defer**, not adopt. An unfalsifiable idea adopted becomes doctrine nobody can remove.

## Decide, and record all four outcomes

| verdict | means | what to write |
| --- | --- | --- |
| **adopt** | reproduced here, or the mechanism is sound and the cost of being wrong is low | the smallest change that lands it, plus the falsification you ran |
| **adapt** | the mechanism transfers, the specifics do not | what carries, what does not, and why |
| **reject** | the assumption fails, we already have it, or it changes no decision | the reason — so it is not re-litigated |
| **defer** | plausible, nothing cheap decides it | the experiment that would, and what would trigger running it |

Record it in the knowledge base as a `prior` page with evidence level **`external-unverified`** — always, even for adopt. Promoting it to `measured` requires reproducing the result here, and that is a separate act that should look like one:

```bash
node -e "import('./tools/kb.mjs').then(kb => kb.ingest({
  uri:'<source url>', title:'<the claim in a few words>', topic:'<domain keywords>',
  text:'<claim, evidence with n, assumption, mechanism>',
  note:'VERDICT: adopt|adapt|reject|defer — <one line why> — falsification: <what you ran or would run>',
}))"
```

## Then land it, or it did not happen

An adopted idea that changes no file is a rejection with extra steps.
The smallest landing is usually: one rule in the skill or doc that governs the decision it improves, citing the source. Not a new module.

## Then consider

| Condition | Next skill | What to pass |
|---|---|---|
| Verdict is adopt and it needs a measured comparison before it governs anything | `/evolve` | the metric, the current baseline, and the change |
| Verdict is defer and the deciding experiment is worth designing properly | `/hypothesize` | the claim, its mechanism, and the falsification you could not cheaply run |
| The idea claims a capability our stack may already own | `/build-with-agent-runtime` | the capability in plain words, never the author's name for it |
| Adoption would change how agents are instructed | `/evolve` on the skill text | the failing cases the new rule should fix |

## Log the run

```bash
skill-run-log /reconcile --target "<the external thing>" --verdict <ADOPT|ADAPT|REJECT|DEFER> --next /<next-skill-or-stop>
```
