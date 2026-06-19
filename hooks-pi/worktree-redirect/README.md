# worktree-redirect (pi extension)

A [pi](https://oh-my-pi) (oh-my-pi / OMP) extension that **redirects risky approved plan execution** into a dedicated git worktree instead of continuing in the current checkout.

## What it does

When you approve a plan in plan mode (`resolve action: apply` from the `plan_approval` flow), this extension locates the newest `*plan.md` and checks three redirect triggers:

1. **Large scope** — the plan references at least 6 distinct path-like files, or has at least 250 non-empty lines.
2. **Agent working** — a non-plan `task` subagent/background launch in this session is still active or inside the async TTL window.
3. **Feature branch / linked worktree** — the current checkout is detached, linked, or not on the repo default branch.

If any trigger fires, it creates or reuses:

- branch: `omp/plan/<slug>`
- worktree: `<repo>.worktrees/<slug>`
- copied plan: `<repo>.worktrees/<slug>/.omp/plans/<slug>-plan.md`

Then it pauses approval with a handoff message telling the agent to stop in the current session and continue with:

```bash
cd "<worktree>" && omp
```

The current checkout is left untouched. Uncommitted files are not moved; the handoff warns when they exist.

## Loop guard

Branches under `omp/plan/*` are skipped. This prevents redirecting again when you continue inside the created worktree.

## Requirements & coupling

- **pi / OMP runtime.** Uses pi's extension API (`pi.on("tool_result")`, `pi.on("tool_call")`, `ctx.sessionManager`, `ctx.hasUI`, `ctx.ui.notify`). Validated against OMP v16.x behavior; re-verify after upgrading.
- **git worktree support.** Uses `git worktree add`, `git worktree list --porcelain`, and normal branch refs.
- **UI plan approval.** The hook only acts when `ctx.hasUI` is true and the source tool is `plan_approval`.

## Install

The `zz-` filename biases this hook to load after other plan-approval hooks so its redirect override usually wins first.

```bash
mkdir -p ~/.omp/agent/extensions
cp zz-worktree-redirect.js ~/.omp/agent/extensions/zz-worktree-redirect.js
```

Restart pi so the extension is loaded.

To disable after install, add this to `~/.omp/agent/config.yml`:

```yaml
disabledExtensions: [extension-module:zz-worktree-redirect]
```

For one repo only, place the file at `<repo>/.omp/extensions/zz-worktree-redirect.js` instead of the global extensions directory.

## Verify

```bash
npm run check
```

`node --check` validates syntax; `scripts/smoke-test.mjs` asserts the default export registers the expected lifecycle handlers; `scripts/unit-test.mjs` covers pure trigger logic and a runtime-style redirect with temporary git repos.

> Runtime behavior inside the interactive pi approval UI still needs manual agent QA after OMP upgrades because the extension relies on the same `plan_approval` discard-override contract as `auto-plan-review`.
