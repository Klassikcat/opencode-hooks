import { plugin } from "../index.js";

// The bundled kube-context-guard.py next to index.js is used by default.
const instance = await plugin({ directory: process.cwd() });
const before = instance["tool.execute.before"];

// 1. A non-kube command must pass untouched (fast path).
await before({ tool: "bash" }, { args: { command: "git status" } });

// 2. A kubectl write without --context must be denied, regardless of the live
//    cluster (write verbs always deny; an undeterminable context fails safe).
let denied = false;
try {
  await before({ tool: "bash" }, { args: { command: "kubectl delete pod smoke-test-nonexistent" } });
} catch (error) {
  denied = String(error?.message || error).includes("kube-context-guard");
}
if (!denied) {
  throw new Error("Expected `kubectl delete` without --context to be denied");
}

// 3. An explicit --context must pass even for a write.
await before({ tool: "bash" }, { args: { command: "kubectl --context=smoke-test delete pod smoke-test-nonexistent" } });

console.log("kube-context-guard smoke test passed");
