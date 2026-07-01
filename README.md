# Opencode-Hooks

Reusable hooks, plugins, and agents for the OpenCode and pi (oh-my-pi) coding agents.

## Contents

### OpenCode

- `agents-opencode/acp-bridge`: Oh My OpenCode bridge that lets Prometheus, Atlas, and Sisyphus fan out prompts to Claude Code, Pi, Codex, and Gemini CLI through provider adapters.
- `agents-opencode/prometheus`: Prometheus subagent definition wired to the ACP bridge.
- `agents-opencode/atlas`: Atlas subagent definition wired to the ACP bridge.
- `agents-opencode/sisyphus`: Sisyphus subagent definition wired to the ACP bridge.
- `hooks-opencode/alarm`: Telegram alarm plugin for OpenCode session lifecycle and question events.
- `hooks-opencode/trufflehog-guard`: Read-time credential guard that scans only the requested file with trufflehog before allowing `Read`.


### Cross-platform

- `agents-tester`: Canonical tester-agent roles plus deterministic `tester-run`, `tester-coverage`, and agent-generation CLIs.
- `agents-claude/`: Claude Code subagent definitions generated from `agents-tester/roles/`.
- `test-author`, `test-runner`, `coverage-judge`: Three distinct tester roles generated for pi, Claude Code, and opencode. Author writes tests; runner executes; judge measures coverage and enforces thresholds/baselines.

### pi (oh-my-pi)

- `hooks-pi/completion-gate`: Local, deterministic quality gate — a per-step gate for the main agent and a return self-gate for mutating subagents (syntax/LSP/linter checks).
- `hooks-pi/test-runner`: Optional `run_tests` tool backed by `agents-tester` for deterministic pass/fail/skipped test execution.
- `hooks-pi/auto-plan-review`: Pauses plan approval until a reviewer subagent has reviewed the latest plan.
- `hooks-pi/nu-prefix`: Rewrites a `>` / `>>` input prefix into a `nu -c` (Nushell) bash command.
- `agents-pi/agents/code-reviewer`: READ-ONLY completion reviewer agent used by the completion-gate flow.
- `agents-pi/agents/document-specialist`: READ-ONLY external documentation lookup agent.
- `agents-pi/agents/test-author`, `test-runner`, `coverage-judge`: Native pi tester roles generated from `agents-tester/roles/`.
