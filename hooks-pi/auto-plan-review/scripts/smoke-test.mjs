// Structural smoke test for the auto-plan-review pi extension.
//
// Runtime behavior (pausing plan approval, spawning a reviewer subagent) requires
// the OMP/pi runtime and is verified by manual agent QA. This only asserts the
// default export loads and subscribes to the expected lifecycle event.

import autoPlanReview from "../auto-plan-review.js";

if (typeof autoPlanReview !== "function") {
  throw new Error("auto-plan-review default export must be a function");
}

const handlers = new Map();

const pi = {
  setLabel() { },
  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new Error(`on("${eventName}") called without a handler function`);
    }
    const list = handlers.get(eventName) ?? [];
    list.push(handler);
    handlers.set(eventName, list);
  },
};

autoPlanReview(pi);

if (!handlers.has("tool_result")) {
  throw new Error(`Expected a 'tool_result' handler; got: ${Array.from(handlers.keys()).join(", ")}`);
}

if (!handlers.has("tool_call")) {
  throw new Error(`Expected a 'tool_call' handler; got: ${Array.from(handlers.keys()).join(", ")}`);
}

const missingReason = { toolName: "resolve", input: { action: "apply" } };
for (const handler of handlers.get("tool_call")) await handler(missingReason, {});
if (missingReason.input.reason !== "User approved the pending action.") {
  throw new Error("Expected tool_call handler to provide a default resolve reason");
}

console.log("auto-plan-review smoke test passed");
