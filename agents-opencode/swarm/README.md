# @swarm OpenCode Agent

## Behavior

`@swarm` is a verification agent for OpenCode. It fans a review prompt out to Claude Code, Codex CLI, and Gemini CLI in parallel, then compares their results so you can see consensus, disagreements, failures, and timeouts in one report.

Use it when you want a plan, implementation, or review target checked by more than one coding tool before you act on it.

## Requirements

- Node.js >= 20
- At least one supported provider CLI installed and available on your `PATH`:
  - Claude Code CLI
  - Codex CLI
  - Gemini CLI

The agent can run with one provider, but comparison works best when two or more provider CLIs are available.

## Install

Add the agent to OpenCode by copying or referencing this agent directory in your OpenCode agent configuration:

```text
/tmp/opencode-swarm/agents-opencode/swarm
```

After it is registered, invoke it from OpenCode as `@swarm`.

## Usage

From OpenCode:

```text
@swarm review this plan
```

Direct CLI usage from the swarm package directory:

```sh
node src/cli.js --prompt "verify this" --review-target plan.md
```

The `--prompt` value describes what to verify. The optional `--review-target` value points to the file that should be included as review context.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `SWARM_CLAUDE_PATH` | Path to Claude Code binary. | `claude` |
| `SWARM_CODEX_PATH` | Path to Codex CLI binary. | `codex` |
| `SWARM_GEMINI_PATH` | Path to Gemini CLI binary. | `gemini` |
| `SWARM_TIMEOUT_MS` | Default timeout in milliseconds. | `30000` |
| `SWARM_CLAUDE_TIMEOUT_MS` | Claude specific timeout override in milliseconds. | Uses `SWARM_TIMEOUT_MS` |
| `SWARM_CODEX_TIMEOUT_MS` | Codex specific timeout override in milliseconds. | Uses `SWARM_TIMEOUT_MS` |
| `SWARM_GEMINI_TIMEOUT_MS` | Gemini specific timeout override in milliseconds. | Uses `SWARM_TIMEOUT_MS` |

## Output Format

The CLI prints a comparison report with one section per provider and a final summary. A typical report looks like this:

```text
# Swarm Comparison Report

## Claude
Status: success
Output:
<Claude Code findings>

## Codex
Status: success
Output:
<Codex CLI findings>

## Gemini
Status: timeout
Error: timed out after 30000ms

## Summary
Consensus:
- Areas where providers agree.

Disagreements:
- Areas where providers disagree or where one provider failed.
```

## Verify

Run the test suite from the swarm package directory:

```sh
npm test
```

Run the smoke test directly:

```sh
node scripts/smoke-test.mjs
```
