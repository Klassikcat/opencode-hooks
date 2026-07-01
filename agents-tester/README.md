# agents-tester

Cross-platform tester-agent toolkit for pi, Claude Code, and opencode. It provides three separate agent roles plus deterministic Node ESM CLIs for detecting test commands, running suites, parsing coverage, and enforcing coverage thresholds/regression baselines.

## Roles and separation contract

- `test-author`: writes or updates test files only. It may write test files, but does not run suites or measure coverage.
- `test-runner`: read-only executor. It runs `tester-run` and reports pass/fail/skipped; it never edits.
- `coverage-judge`: read-only coverage gate. It runs `tester-coverage`, enforces thresholds plus baseline no-regression, and never edits or updates baselines.

Generated frontmatter enforces the split: author agents receive write/edit permissions; runner and judge do not.

## `.testerrc.json`

All fields are optional and override detection when set:

```json
{
  "testCommand": null,
  "coverageCommand": null,
  "coverageFile": null,
  "thresholds": {
    "lines": 80,
    "branches": 80,
    "functions": 80,
    "statements": 80
  },
  "baselineFile": ".tester/coverage-baseline.json",
  "allowRegression": false,
  "regressionTolerancePct": 0.0
}
```

A project that only gates line coverage can set the other thresholds to `0`.

## CLI usage

Run detected tests:

```bash
node agents-tester/bin/run-tests.mjs --cwd /path/to/project --json
```

Measure coverage and enforce the gate:

```bash
node agents-tester/bin/coverage-gate.mjs --cwd /path/to/project --json
```

Read an existing report without executing a coverage command:

```bash
node agents-tester/bin/coverage-gate.mjs --cwd /path/to/project --no-run --json
```

Update the baseline intentionally; coverage-judge agents must never pass this flag:

```bash
node agents-tester/bin/coverage-gate.mjs --cwd /path/to/project --no-run --update-baseline
```

Exit codes: `0` pass, `1` fail, `2` skipped/no detected command or report.

## Install generated agents

Generated files are checked in for each runtime:

- pi: copy `agents-pi/agents/test-author.md`, `test-runner.md`, and `coverage-judge.md` into `~/.omp/agent/agents/`.
- Claude Code: copy `agents-claude/agents/*.md` into `~/.claude/agents/` or `.claude/agents/`.
- opencode: copy each `agents-opencode/<id>/AGENT.md` to `~/.config/opencode/agents/<id>.md` (or project `.opencode/agents/<id>.md`). Rename from `AGENT.md` to the agent id when copying.

## Editing generated agents

Edit `agents-tester/roles/*.md`, then regenerate:

```bash
node agents-tester/bin/generate-agents.mjs
node agents-tester/bin/generate-agents.mjs --check
```

Never hand-edit generated platform files.
