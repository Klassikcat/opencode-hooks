# hooks-pi

Reusable extensions ("hooks") for the [pi](https://oh-my-pi) coding agent (oh-my-pi / OMP). These are extensions I wrote on top of pi — not pi built-ins — packaged here so others can install them.

## Contents

- [`completion-gate`](./completion-gate) — local, deterministic quality gate: a per-step gate for the main agent and a return self-gate for mutating subagents (syntax / LSP / linter checks, no session-end auditor).
- [`auto-plan-review`](./auto-plan-review) — pauses plan approval until a reviewer subagent has reviewed the latest plan.
- [`nu-prefix`](./nu-prefix) — rewrites a `>` / `>>` input prefix into a `nu -c` (Nushell) bash command.

## How pi loads extensions

A pi extension is an ES module with a default export `(pi) => { ... }` that registers tools and subscribes to lifecycle events (`tool_result`, `tool_call`, `input`, ...). Pi loads extensions placed in its runtime extensions directory **by filename**:

```bash
mkdir -p ~/.omp/agent/extensions
cp <hook>/<file> ~/.omp/agent/extensions/
```

Restart pi after copying. Each hook's own README has exact install + verify steps.

> The `~/.omp/agent/extensions/` path reflects **OMP v16.0.4**, the version these extensions were validated against. pi's extension API is undocumented and may change between versions — confirm the path and re-verify behavior after upgrading.

## Model roles

The bundled pi agents (see [`../agents-pi/agents`](../agents-pi/agents)) and the completion-gate reviewer flow reference pi model roles (`slow`, `smol`, ...). See [`config.example.yml`](./config.example.yml) for the roles you need to define in your pi config.
