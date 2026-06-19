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
- `hooks-opencode/kube-context-guard`: Bash guard that blocks `kubectl`/`helm` commands run against an ambient kube context (no explicit `--context`) for write/prod operations. Shared Python core also works as a Claude Code `PreToolUse` hook and as a pi extension.

### pi (oh-my-pi)

- `hooks-pi/completion-gate`: Local, deterministic quality gate — a per-step gate for the main agent and a return self-gate for mutating subagents (syntax/LSP/linter checks).
- `hooks-pi/auto-plan-review`: Pauses plan approval until a reviewer subagent has reviewed the latest plan.
- `hooks-pi/worktree-redirect`: Redirects approved large/contended/non-default-branch plans into a dedicated git worktree.
- `hooks-pi/nu-prefix`: Rewrites a `>` / `>>` input prefix into a `nu -c` (Nushell) bash command.
- `hooks-pi/kube-context-guard`: Blocks `bash` `kubectl`/`helm` commands run against an ambient kube context (no explicit `--context`) for write/prod operations. Thin pi adapter that reuses the `hooks-opencode/kube-context-guard` Python core.
- `agents-pi/agents/code-reviewer`: READ-ONLY completion reviewer agent used by the completion-gate flow.
- `agents-pi/agents/document-specialist`: READ-ONLY external documentation lookup agent.
