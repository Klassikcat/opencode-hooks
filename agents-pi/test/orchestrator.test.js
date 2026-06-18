import assert from "node:assert/strict";
import test from "node:test";
import { runRole, runWorkflow } from "../src/orchestrator.js";

function fakeProvider(name) {
  return {
    name,
    async execute(request) {
      return { name, status: "success", output: `${name}: ${request.role}`, durationMs: 1 };
    },
  };
}

test("runRole offloads a role to supplied provider", async () => {
  const result = await runRole({ role: "planning", prompt: "build feature", provider: fakeProvider("claude") });
  assert.equal(result.name, "claude");
  assert.equal(result.status, "success");
  assert.match(result.output, /planning/);
});

test("runWorkflow calls planning before review", async () => {
  const calls = [];
  const planning = {
    async execute(request) {
      calls.push(["planning", request.prompt]);
      return { name: "claude", status: "success", output: "PLAN", durationMs: 1 };
    },
  };
  const review = {
    async execute(request) {
      calls.push(["review", request.prompt]);
      return { name: "codex", status: "success", output: "APPROVE", durationMs: 1 };
    },
  };

  const result = await runWorkflow({ prompt: "request", providers: { planning, review } });
  assert.equal(result.planning.output, "PLAN");
  assert.equal(result.review.output, "APPROVE");
  assert.equal(calls[0][0], "planning");
  assert.equal(calls[1][0], "review");
  assert.match(calls[1][1], /Planning Result/);
});
