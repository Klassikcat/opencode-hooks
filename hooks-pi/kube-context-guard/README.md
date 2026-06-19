# kube context guard (pi extension)

A pi (oh-my-pi / OMP) extension that blocks `bash` tool calls running
`kubectl` / `helm` against an **ambient kube context** (no explicit `--context`)
for write or prod operations — the pi counterpart of the OpenCode plugin in
[`../../hooks-opencode/kube-context-guard`](../../hooks-opencode/kube-context-guard).

It is **only the pi adapter**: the detection logic is the shared Python core
`kube-context-guard.py` from the OpenCode hook directory. This keeps one source
of truth for the (security-sensitive) parsing/policy.

## Behavior

Same risk-tiered policy as the OpenCode/Claude Code guard:

- write verbs / prod context (or undeterminable) without `--context` → **blocked**
  (the extension returns `{ block: true, reason }` from the `tool_call` hook).
- non-prod reads, explicit `--context`/`--kube-context` → allowed.

See the [OpenCode hook README](../../hooks-opencode/kube-context-guard/README.md)
for the full policy, parser coverage, and the `OPENCODE_KUBE_GUARD_PROD_FILE` /
`OPENCODE_KUBE_GUARD_ALLOWLIST` configuration files.

> pi's `tool_call` gate is block-or-allow, so the non-prod-read context reminder
> (Claude Code only) is not surfaced in pi. pi still enforces all blocks.

## Requirements

- `python3` and `kubectl` on `PATH`
- pi / oh-my-pi (validated against the extension API used by the bundled
  `completion-gate` hook; pi's extension API is undocumented and may change)

## Install

pi loads extensions by filename from its runtime extensions directory. Copy
**both** the adapter and the shared Python core:

```bash
mkdir -p ~/.omp/agent/extensions
cp kube-context-guard.pi.js ~/.omp/agent/extensions/
cp ../../hooks-opencode/kube-context-guard/kube-context-guard.py ~/.omp/agent/extensions/
```

The adapter finds the core via (first match wins): `$OPENCODE_KUBE_GUARD_SCRIPT`
→ `kube-context-guard.py` next to the extension → the repo's `hooks-opencode`
core. If you prefer not to copy the `.py`, set `OPENCODE_KUBE_GUARD_SCRIPT` to
its absolute path instead.

Restart pi after copying.

## Verify

```bash
npm run check
```

Syntax-checks the adapter and runs a smoke test that registers the `tool_call`
handler against the shared core: a non-kube command passes, a `kubectl delete`
without `--context` is blocked, and an explicit `--context` passes.
