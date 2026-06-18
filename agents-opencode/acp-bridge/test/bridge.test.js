import assert from "node:assert/strict";
import test from "node:test";
import { runBridge, formatBridgeResult } from "../src/bridge.js";

function fakeProvider(name) {
  return {
    async execute(request) {
      return { name, status: "success", output: `${name}: ${request.role}`, durationMs: 1 };
    },
  };
}

test("runBridge fans out one role prompt to selected providers", async () => {
  const seen = [];
  const result = await runBridge({
    role: "prometheus",
    prompt: "make a plan",
    providers: "claude,pi,codex,gemini",
    providerFactory(name) {
      seen.push(name);
      return fakeProvider(name);
    },
  });

  assert.deepEqual(seen, ["claude", "pi", "codex", "gemini"]);
  assert.equal(result.results.length, 4);
  assert.match(result.request.prompt, /Prometheus/);
});

test("formatBridgeResult includes provider sections and summary", async () => {
  const result = await runBridge({
    role: "sisyphus",
    prompt: "verify work",
    providers: "claude,pi",
    providerFactory: fakeProvider,
  });

  const report = formatBridgeResult(result);
  assert.match(report, /# OMC ACP Bridge Report/);
  assert.match(report, /Role: sisyphus/);
  assert.match(report, /## Claude Code/);
  assert.match(report, /## Pi/);
  assert.match(report, /## Summary/);
});

test("unknown roles fail before provider execution", async () => {
  await assert.rejects(
    () => runBridge({ role: "unknown", prompt: "x", providerFactory: fakeProvider }),
    /Unknown role: unknown/,
  );
});
