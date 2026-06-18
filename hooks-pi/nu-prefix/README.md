# nu-prefix (pi extension)

A small [pi](https://oh-my-pi) (oh-my-pi / OMP) input extension that lets you run [Nushell](https://www.nushell.sh) one-liners from the pi prompt with a `>` prefix.

## What it does

Hooks the `input` event and rewrites the prompt line before pi handles it:

- `> <code>`  → `!nu -c '<code>'`  — runs the Nushell code via pi's existing bash `!` prefix (full streaming/abort/recording UI), result kept in context.
- `>> <code>` → `!!nu -c '<code>'` — same, but `!!` keeps the output **out** of context.
- Bare `>` / `>>` (no code) falls through unchanged, matching how empty `!` / `$` behave.

Embedded single quotes in the code are escaped for POSIX parsing. The rewrite reuses pi's bash prefix rather than introducing a new execution path.

## Requirements & coupling

- **pi / OMP runtime** with the bash `!` / `!!` input prefix (the rewrite targets it). Validated against **OMP v16.0.4**.
- **`nu`** (Nushell) on `PATH` for the rewritten command to run.
- Uses pi's input-extension API: `pi.setLabel`, `pi.on("input", ...)`.

## Install

```bash
mkdir -p ~/.omp/agent/extensions
cp nu-prefix.ts ~/.omp/agent/extensions/nu-prefix.ts
```

Restart pi so the extension is loaded.

## Verify

```bash
npm run check
```

The check runs `tsc --noEmit` on `nu-prefix.ts` when a TypeScript compiler is available. If `tsc` is not installed it prints `SKIPPED: typescript not installed` and exits 0, so the check does not fail purely due to a missing toolchain.
