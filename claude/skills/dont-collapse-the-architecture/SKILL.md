---
name: dont-collapse-the-architecture
description: When tempted to collapse an ambitious-but-unproven architecture (multi-agent topology, context-lifecycle management, a recursive loop system) into a dumb/old pattern because an early A/B looked marginal — don't. Marginal-early almost always means the regime that makes the architecture pay off wasn't active. Find that regime, build the missing competency, then judge.
---

# Don't collapse the architecture

The reductive instinct — *"it's unproven, an A/B was marginal, simplify it to the dumb/old pattern"* — deletes the exact thing that would have worked once the missing competency was built. **Marginal-early ≠ worthless.** It almost always means the constraint that makes the architecture pay off was not active in the test.

This is a one-way door: collapsing throws away the thing whose value was *latent*. Default to **holding the architecture and finding its regime**, not collapsing it.

## The worked case: agents are a context-management problem

Agent capability is, at bottom, a **context-management and knowledge problem**. The finite context window is the binding constraint; quality rots as it fills. The value of a multi-agent topology is **latent** — unlocked by one competency: **expert management of the context lifecycle** (close a chapter → checkpoint to external tracking state; open a chapter → respawn a fresh agent against that state; recurse).

A naive "does 2 agents beat 1" A/B on a task that fits in one context window **will tie** — because the context constraint never bit. That tie says nothing about the topology; it says you measured in the wrong regime. (See `docs/research/smart-loops-context-lifecycle.md` in agent-runtime, and the Autodata null that was an extractive task + a memorized doc, not "the loop doesn't work.")

## The rule — when you catch yourself about to simplify on marginal evidence

1. **Name the regime where the architecture is supposed to pay off.** Was the test in that regime? (For context-lifecycle work: long-horizon tasks where context exhaustion is the binding constraint.) If not, the result is uninformative — do not act on it.
2. **Name the competency that's missing.** Marginal-*without*-the-competency ≠ marginal-*with* it. (Here: the chapter close/open policy.)
3. **Build the competency and test in the right regime** before reducing. Only a result *in the regime, with the competency built* can justify collapsing.
4. If you still feel the pull to simplify, say out loud: *"I'm about to delete something whose value is latent."* Then don't — find the regime instead.

Hold the thesis. Find where it bites. Build the policy. Then — and only then — judge.

## Then consider (post-hook)

- About to A/B the architecture? → `calibrate-before-measure`: prove the metric discriminates a good policy from a bad one AND that the test sits in the regime where the constraint is active. A tie outside that regime is uninformative, not a verdict.
- Sitting on a marginal/null result? → `push-past-easy`: the next move is the experiment *in the right regime with the competency built* — never a collapse to the old pattern.
