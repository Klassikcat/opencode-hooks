# kube context guard hook

Blocks `Bash` commands that run `kubectl` / `helm` (and friends) against an
**ambient `current-context`** instead of an explicitly chosen one. Prevents
"oops, that ran against prod" mistakes when the agent forgets which cluster is
selected.

Works in both **Claude Code** (point a `PreToolUse` Bash hook directly at
`kube-context-guard.py`) and **OpenCode** (load `index.js` as a plugin). A
companion **pi / oh-my-pi** extension that reuses this same Python core lives in
[`../../hooks-pi/kube-context-guard`](../../hooks-pi/kube-context-guard).

## Behavior

Risk-tiered. When a kube command has **no explicit `--context`** (helm:
`--kube-context`):

- **write verbs** (`delete`, `apply`, `create`, `patch`, `edit`, `scale`,
  `rollout`, `drain`, `exec`, `cp`, `run`, ...) → **blocked**.
- **prod context** (current-context matches a prod pattern, or can't be
  determined) → **blocked even for reads**.
- **non-prod reads** (`get`, `describe`, `logs`, `top`, ...) → allowed, with a
  context reminder injected (Claude Code only; see note).
- **context switch tools** (`kubectx`, `kubens`, `k9s`) → allowed, with a switch
  reminder (Claude Code only).
- An explicit `--context` / `--kube-context` always passes (intent is recorded).
- Unknown/plugin verbs are treated as writes (fail-safe).

It parses the command defensively: splits on `| ; & && ||` and newlines, follows
env-var prefixes (`AWS_PROFILE=… kubectl …`), wrappers (`sudo`, `xargs`,
`timeout`, `watch`, ...), leading shell keywords (`for …; do kubectl …`), and
`bash -c "…"`. A per-session allowlist file can bypass specific commands.

> **OpenCode note:** OpenCode's `tool.execute.before` can only block (throw); it
> has no "allow but inject context" channel, so the non-prod-read reminders are
> Claude-Code-only. OpenCode still enforces all blocks.

## Requirements

- `python3`
- `kubectl` on `PATH` (used to resolve the current context; if missing, the
  guard fails safe and blocks ambiguous commands)
- OpenCode plugin support (for the `index.js` path)

## Configuration

Two optional files (plain substring patterns, `#` comments):

| File | Purpose | Resolution order |
| --- | --- | --- |
| prod contexts | which contexts count as "prod/dangerous" | `$OPENCODE_KUBE_GUARD_PROD_FILE` → `~/.claude/.kube-prod-contexts` → bundled `kube-prod-contexts.example` → built-ins (`prod`,`production`,`prd`) |
| allowlist | per-session command bypass | `$OPENCODE_KUBE_GUARD_ALLOWLIST` → `~/.claude/.kube-context-allowlist` → bundled `kube-context-allowlist.example` |

Keep real cluster names / AWS account IDs in your **private**
`~/.claude/.kube-prod-contexts`, not in the committed example.

## Install (OpenCode)

1. Copy this directory somewhere stable:

   ```bash
   mkdir -p ~/.config/opencode/hooks/kube-context-guard
   cp index.js kube-context-guard.py ~/.config/opencode/hooks/kube-context-guard/
   ```

2. Add the plugin path to `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "/home/you/.config/opencode/hooks/kube-context-guard/index.js"
     ]
   }
   ```

3. Restart OpenCode.

## Install (Claude Code)

Point a `PreToolUse` Bash hook at the Python core in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "python3 /path/to/kube-context-guard/kube-context-guard.py check" }
        ]
      }
    ]
  }
}
```

The Python core emits a `permissionDecision: "deny"` (and, for non-prod reads, an
`additionalContext` reminder) on stdout — both honored by Claude Code.

## Options (OpenCode plugin)

- `scriptPath` option / `OPENCODE_KUBE_GUARD_SCRIPT` — override the Python core path.
- `timeoutMs` option / `OPENCODE_KUBE_GUARD_TIMEOUT_MS` — JS-side spawn timeout (default 20s).

## Verify

```bash
npm run check
```

Compiles both files and runs a smoke test: a non-kube command passes, a
`kubectl delete` without `--context` is denied, and an explicit `--context`
passes.
