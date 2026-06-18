import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeProvider } from "../src/providers/claude.js";
import { CodexProvider } from "../src/providers/codex.js";
import { OpenCodeProvider } from "../src/providers/opencode.js";

test("claude provider builds planning invocation", () => {
  const provider = new ClaudeProvider({ command: "claude-test" });
  assert.equal(provider.role, "planning");
  assert.deepEqual(provider.buildInvocation({ prompt: "make a plan" }), {
    command: "claude-test",
    args: ["-p", "make a plan", "--output-format", "json", "--max-turns", "0"],
  });
});

test("codex provider enforces read-only review sandbox", () => {
  const provider = new CodexProvider({ command: "codex-test" });
  const invocation = provider.buildInvocation({ prompt: "review diff" });
  assert.equal(provider.role, "review");
  assert.equal(invocation.command, "codex-test");
  assert.deepEqual(invocation.args, ["exec", "review diff", "--json", "--sandbox", "read-only"]);
});

test("opencode provider builds orchestration invocation", () => {
  const provider = new OpenCodeProvider({ command: "opencode-test" });
  assert.equal(provider.role, "orchestration");
  assert.deepEqual(provider.buildInvocation({ prompt: "coordinate" }), {
    command: "opencode-test",
    args: ["run", "--print", "coordinate"],
  });
});
