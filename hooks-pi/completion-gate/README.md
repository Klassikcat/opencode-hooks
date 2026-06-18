# completion-gate (pi extension)

A lightweight, **local and deterministic** quality gate for the [pi](https://oh-my-pi) coding agent (oh-my-pi / OMP). It nudges the agent to run cheap, file-scoped checks on changed code before moving on — it does **not** spawn a session-end reviewer/auditor subagent.

## What it does

Two independent gates, both keyed on real mutations (`edit`, `write`, `ast_edit`, applied LSP `rename`/`code_actions`):

1. **Main-agent step gate.** When code changed since the last completed step, the next `todo done` op is intercepted with an instruction to run a syntax/parse check, `lsp diagnostics`, and any discoverable non-mutating formatter/linter on the changed files. The agent records the result via the `step_quality_pass` tool. Checks that have no available tooling are reported `SKIPPED` (never blocking).

2. **Subagent return self-gate.** A mutating subagent's `yield` is blocked until it runs the same self-checks and records a verdict via `subagent_quality_pass` (`PASS` / `FAIL` / `SKIPPED`). On `FAIL` the subagent self-fixes and re-checks, up to a retry cap (`SUBAGENT_MAX_RETRIES = 3`), after which the gate returns a deterministic terminal failure. A post-edit syntax floor (`node --check`, `python -m py_compile`, `bash -n`, `ruby -c`) runs immediately on the mutated file and blocks the return if it fails to parse.

Diagnostic markers are logged to stderr: `SUBAGENT_GATE_MUTATION_DETECTED`, `SUBAGENT_GATE_PASS`, `SUBAGENT_GATE_SKIPPED_NO_QUALITY_TOOLS`, `SUBAGENT_GATE_FAIL`, `SUBAGENT_GATE_FAIL_MAX_RETRIES`, `SUBAGENT_GATE_SYNTAX_FAIL`.

Plan mode is exempt — the gate clears its state and does nothing while a plan is being drafted.

## Tools it registers

- `step_quality_pass` — records the main-agent step-gate result.
- `subagent_quality_pass` — records the subagent self-gate verdict.
- `gate_pass` — deprecated no-op kept for backward compatibility with older prompts.

## Requirements & coupling

- **pi / OMP runtime.** This extension depends on pi's (undocumented) extension API: `pi.on("tool_result")`, `pi.on("tool_call")` with a blocking `yield`, `pi.registerTool`, `pi.zod`, and `ctx.sessionManager` / `ctx.hasUI` / `ctx.ui`. It was developed and validated against **OMP v16.0.4** (a compiled binary with no public API docs). Behavior on other pi versions is not guaranteed — re-verify after upgrading.
- **`code-reviewer` agent + `pi/slow` role (recommended).** The companion [`code-reviewer`](../../agents-pi/agents/code-reviewer.md) READ-ONLY agent declares `model: pi/slow`. Define the `slow` model role (and `task.agentModelOverrides.code-reviewer`) in your pi config — see [`../config.example.yml`](../config.example.yml).

## Install

Pi loads extensions placed in its runtime extensions directory by filename. Copy the file there:

```bash
mkdir -p ~/.omp/agent/extensions
cp completion-gate.js ~/.omp/agent/extensions/completion-gate.js
```

Restart pi so the extension is loaded. (Confirm the extensions directory against your pi version's documentation; the path above reflects OMP v16.0.4.)

## Verify

```bash
npm run check
```

`node --check completion-gate.js` validates syntax; `scripts/smoke-test.mjs` asserts the extension registers the expected tools and event handlers.

> **Limitation — functional behavior is not unit-tested here.** The gate's actual gating logic can only be exercised inside the pi runtime. Functional verification is **manual agent QA** in pi: confirm a mutating subagent logs `SUBAGENT_GATE_MUTATION_DETECTED`; a main-agent mutation followed by `todo done` triggers the step gate; and a read-only subagent does not trigger the gate. See `subagent-quality-gate` provenance in the original OMP plan/evidence.
