# auto-plan-review (pi extension)

A [pi](https://oh-my-pi) (oh-my-pi / OMP) extension that **pauses plan approval** until the latest plan has been reviewed by a reviewer subagent.

## What it does

When you approve a plan in plan mode (`resolve action: apply` from the `plan_approval` flow), this gate intercepts the approval once per plan revision and instead:

1. Locates the newest `*plan.md` in the session's local artifacts directory.
2. Returns an instruction to spawn exactly **one** READ-ONLY `reviewer` subagent to review that plan file (executability, outcome→step mapping, verification coverage, omitted callsites/tests/docs).
3. If the review finds a blocker, the agent edits the same plan file and re-runs `resolve` — the gate fires again for the changed plan.
4. If the review passes, the agent calls `resolve` with `action: "apply"` plus the gate's `autoPlanReviewTicket`, and the normal approval overlay opens.

Each plan revision is tracked by a content key (`sessionId:name:mtime:size`) so a re-approval of the same reviewed plan is not blocked twice.

## Requirements & coupling

- **pi / OMP runtime.** Uses pi's extension API (`pi.on("tool_result")`, `ctx.sessionManager`, `ctx.hasUI`, `ctx.ui.notify`). Validated against **OMP v16.0.4**; re-verify after upgrading.
- **A `reviewer` agent.** The gate instruction tells the agent to use the bundled pi/OMP `reviewer` agent. Ensure such a READ-ONLY reviewer agent is available in your pi setup (you can adapt [`../../agents-pi/agents/code-reviewer.md`](../../agents-pi/agents/code-reviewer.md) for this role).

## Install

```bash
mkdir -p ~/.omp/agent/extensions
cp auto-plan-review.js ~/.omp/agent/extensions/auto-plan-review.js
```

Restart pi so the extension is loaded.

## Verify

```bash
npm run check
```

`node --check` validates syntax; `scripts/smoke-test.mjs` asserts the default export loads and registers a `tool_result` handler.

> **Limitation:** runtime gating behavior (pausing approval, spawning the reviewer) requires the pi runtime and is verified by manual agent QA, not by this smoke test.
