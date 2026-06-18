import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeProvider } from "../src/providers/claude.js";
import { CodexProvider } from "../src/providers/codex.js";
import { GeminiProvider } from "../src/providers/gemini.js";
import { PiProvider } from "../src/providers/pi.js";

const prompt = "review plan";

test("claude provider builds default headless invocation", () => {
  const provider = new ClaudeProvider({ command: "claude-test" });
  assert.deepEqual(provider.buildInvocation({ prompt }), {
    command: "claude-test",
    args: ["-p", prompt, "--output-format", "json", "--max-turns", "0"],
  });
});

test("pi provider builds configurable prompt invocation", () => {
  const provider = new PiProvider({ command: "pi-test" });
  assert.deepEqual(provider.buildInvocation({ prompt }), {
    command: "pi-test",
    args: ["-p", prompt],
  });
});

test("codex provider builds read-only json invocation", () => {
  const provider = new CodexProvider({ command: "codex-test" });
  assert.deepEqual(provider.buildInvocation({ prompt }), {
    command: "codex-test",
    args: ["exec", prompt, "--json", "--sandbox", "read-only"],
  });
});

test("gemini provider builds headless json invocation", () => {
  const provider = new GeminiProvider({ command: "gemini-test" });
  assert.deepEqual(provider.buildInvocation({ prompt }), {
    command: "gemini-test",
    args: ["-p", prompt, "--output-format", "json"],
  });
});

test("codex provider preserves non-json multiline output", async () => {
  const provider = new CodexProvider({ command: "/bin/echo" });
  const result = await provider.execute({ prompt: "line one\nline two" });
  assert.equal(result.status, "success");
  assert.match(result.output, /line one/);
  assert.match(result.output, /line two/);
});

test("provider arg templates can override defaults", () => {
  const previous = process.env.OMC_ACP_PI_ARGS;
  process.env.OMC_ACP_PI_ARGS = "run --json {prompt}";
  try {
    const provider = new PiProvider({ command: "pi-test" });
    assert.deepEqual(provider.buildInvocation({ prompt }), {
      command: "pi-test",
      args: ["run", "--json", prompt],
    });
  } finally {
    if (previous === undefined) delete process.env.OMC_ACP_PI_ARGS;
    else process.env.OMC_ACP_PI_ARGS = previous;
  }
});
