# OMC ACP Bridge

Shared Oh My OpenCode bridge for Prometheus, Atlas, and Sisyphus to fan out one prompt to Claude Code, Pi, Codex, and Gemini CLI.

The bridge provides a common provider-adapter surface. It does not pretend every tool has the same ACP wire protocol: each adapter uses the tool's practical headless CLI by default, and environment variables can override paths or arguments when a local CLI supports a different ACP-compatible mode.

## Usage

```bash
node agents-opencode/acp-bridge/src/cli.js \
  --role atlas \
  --prompt "Review this architecture" \
  --review-target README.md \
  --providers claude,pi,codex,gemini
```

Roles:

- `prometheus`: planning, constraints, acceptance criteria, risk review
- `atlas`: system context, architecture, dependency impact
- `sisyphus`: execution readiness and completion verification

## Configuration

```bash
OMC_ACP_CLAUDE_PATH=claude
OMC_ACP_PI_PATH=pi
OMC_ACP_CODEX_PATH=codex
OMC_ACP_GEMINI_PATH=gemini
OMC_ACP_TIMEOUT_MS=30000
```

Argument templates can be overridden with `{prompt}`:

```bash
OMC_ACP_CLAUDE_ARGS="-p {prompt} --output-format json --max-turns 0"
OMC_ACP_PI_ARGS="-p {prompt}"
OMC_ACP_CODEX_ARGS="exec {prompt} --json --sandbox read-only"
OMC_ACP_GEMINI_ARGS="-p {prompt} --output-format json"
```

## Verify

```bash
cd agents-opencode/acp-bridge
npm test
npm run check
OMC_ACP_CLAUDE_PATH=/bin/echo OMC_ACP_PI_PATH=/bin/echo OMC_ACP_CODEX_PATH=/bin/echo OMC_ACP_GEMINI_PATH=/bin/echo \
  node src/cli.js --role sisyphus --prompt "smoke" --review-target fixtures/sample-plan.md
```
