# agents-pi

Oh My OpenAgent-inspired workflow skills and offload adapters for the pi coding agent.

Pi intentionally does not ship built-in subagents. This package models subagent roles as Agent Skills and adds a small CLI for role-specific offload to external coding agents.

## Skills

- `omo-investigation-agent` — codebase reconnaissance and evidence collection
- `omo-planning-agent` — `.omo`-style task plans with waves, guardrails, and QA
- `omo-execute-agent` — execute a single planned task with evidence
- `omo-verification-agent` — run tests, checks, and QA scenarios
- `omo-review-agent` — independent review against plan, quality, and scope
- `omo-orchestration-agent` — coordinate the full investigate → plan → execute → verify → review loop

## Agents

Native pi agent definitions (distinct from the skills above) live in [`agents/`](./agents). Pi loads agent `.md` files from its runtime agents directory (`~/.omp/agent/agents/` on OMP v16.0.4); copy them there to install.

- [`code-reviewer`](./agents/code-reviewer.md) — READ-ONLY completion reviewer. Checks changed code with LSP diagnostics, code review, and non-mutating formatter/linter checks; skips unavailable tooling explicitly. Declares `model: pi/slow`. This is the reviewer the [`completion-gate`](../hooks-pi/completion-gate) flow relies on.
- [`document-specialist`](./agents/document-specialist.md) — direct external documentation lookup (official docs, API references, release notes). READ-ONLY. Declares `model: pi/smol`.

Both agents reference pi model roles (`pi/slow`, `pi/smol`). Define those roles in your pi config, plus `task.agentModelOverrides.code-reviewer` if you want to pin the reviewer model — see [`../hooks-pi/config.example.yml`](../hooks-pi/config.example.yml).

## Offload Layer

Default role mapping:

| Role | Provider | Default command |
|---|---|---|
| orchestration | OpenCode | `opencode run --print <prompt>` |
| planning | Claude Code | `claude -p <prompt> --output-format json --max-turns 0` |
| review | Codex | `codex exec <prompt> --json --sandbox read-only` |

This is an adapter layer, not a claim that every provider speaks the same ACP protocol. Each provider uses its practical headless CLI interface.

## Install locally

From this directory:

```bash
pi install -l .
```

Or run ad hoc:

```bash
pi -e .
```

## Usage

Use explicit skill commands:

```text
/skill:omo-orchestration-agent implement this feature
/skill:omo-planning-agent create a plan for refactoring X
/skill:omo-review-agent review the current diff against .omo/plans/foo.md
```

Call the offload CLI directly:

```bash
node src/cli.js --role planning --prompt "Create an OMO plan for feature X"
node src/cli.js --role review --target .omo/plans/feature-x.md --prompt "Review this plan"
node src/cli.js --workflow omo --prompt "Plan and review feature X"
```

## Configuration

Override provider binaries:

```bash
OMO_OPENCODE_PATH=opencode
OMO_CLAUDE_PATH=claude
OMO_CODEX_PATH=codex
OMO_AGENT_TIMEOUT_MS=30000
```

OpenCode args are configurable with a `{prompt}` placeholder:

```bash
OMO_OPENCODE_ARGS="run --print {prompt}"
```

The skills borrow the OMO conventions visible in this repo: `.omo/plans/`, `.omo/evidence/`, task waves, acceptance criteria, guardrails, and final parallel review roles.
