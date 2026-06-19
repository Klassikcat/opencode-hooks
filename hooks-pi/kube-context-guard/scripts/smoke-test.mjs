import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import kubeContextGuard from "../kube-context-guard.pi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Point the adapter at the shared Python core in the OpenCode hook dir.
process.env.OPENCODE_KUBE_GUARD_SCRIPT = path.resolve(
  HERE,
  "../../../hooks-opencode/kube-context-guard/kube-context-guard.py",
);

// Minimal fake `pi` that captures the tool_call handler.
let handler = null;
const pi = {
  setLabel() {},
  on(eventName, fn) {
    if (eventName === "tool_call") handler = fn;
  },
};

kubeContextGuard(pi);
assert(typeof handler === "function", "extension did not register a tool_call handler");

// 1. Non-bash tool -> ignored.
assert.equal(await handler({ toolName: "read", input: { filePath: "/tmp/x" } }), undefined);

// 2. Non-kube bash command -> not blocked.
const safe = await handler({ toolName: "bash", input: { command: "git status" } });
assert(!safe || safe.block !== true, "non-kube command should not be blocked");

// 3. kubectl write without --context -> blocked.
const blocked = await handler({ toolName: "bash", input: { command: "kubectl delete pod smoke-test-nonexistent" } });
assert(blocked && blocked.block === true, "kubectl delete without --context should be blocked");
assert(String(blocked.reason).includes("kube-context-guard"), "block reason should mention kube-context-guard");

// 4. Explicit --context -> passes even for a write.
const pinned = await handler({ toolName: "bash", input: { command: "kubectl --context=smoke-test delete pod smoke-test-nonexistent" } });
assert(!pinned || pinned.block !== true, "explicit --context should pass");

console.log("pi kube-context-guard smoke test passed");
