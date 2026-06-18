import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  OMC_ACP_CLAUDE_PATH: "/bin/echo",
  OMC_ACP_PI_PATH: "/bin/echo",
  OMC_ACP_CODEX_PATH: "/bin/echo",
  OMC_ACP_GEMINI_PATH: "/bin/echo",
};

const result = spawnSync(process.execPath, [
  "src/cli.js",
  "--role",
  "sisyphus",
  "--prompt",
  "smoke",
  "--review-target",
  "fixtures/sample-plan.md",
], {
  cwd: new URL("..", import.meta.url),
  env,
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /# OMC ACP Bridge Report/);
assert.match(result.stdout, /## Claude Code/);
assert.match(result.stdout, /## Pi/);
assert.match(result.stdout, /## Codex/);
assert.match(result.stdout, /## Gemini/);
assert.match(result.stdout, /## Summary/);

console.log("smoke ok");
