# pi test-runner hook

Optional pi extension exposing a first-class `run_tests` tool backed by the cross-platform `agents-tester` toolkit.

## What it does

`run_tests` resolves `agents-tester/bin/run-tests.mjs`, executes it with `--json`, and returns the structured pass/fail/skipped result to pi. It never edits files.

Resolution order:

1. `TESTER_TOOLKIT_DIR/bin/run-tests.mjs` when `TESTER_TOOLKIT_DIR` is set.
2. `agents-tester/bin/run-tests.mjs` copied beside this extension directory.
3. `<cwd>/agents-tester/bin/run-tests.mjs` from the tool `cwd` parameter or process cwd.

## Boundary

This v1 hook is tool-only. It does not subscribe to `todo done`, file-save, or session events, because auto-running a suite after every mutation is surprising and slow. If automatic runs are needed later, add an opt-in event handler gated behind an environment flag that defaults off.

## Check

```bash
npm run check
```
