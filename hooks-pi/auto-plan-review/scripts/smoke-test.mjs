// Structural smoke test for the auto-plan-review pi extension.
//
// Runtime behavior (pausing plan approval, spawning a reviewer subagent) requires
// the OMP/pi runtime and is verified by manual agent QA. This only asserts the
// default export loads and subscribes to the expected lifecycle event.

import autoPlanReview from "../auto-plan-review.js";

if (typeof autoPlanReview !== "function") {
  throw new Error("auto-plan-review default export must be a function");
}

const registeredEvents = [];

const pi = {
  setLabel() {},
  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new Error(`on("${eventName}") called without a handler function`);
    }
    registeredEvents.push(eventName);
  },
};

autoPlanReview(pi);

if (!registeredEvents.includes("tool_result")) {
  throw new Error(`Expected a 'tool_result' handler; got: ${registeredEvents.join(", ")}`);
}

console.log("auto-plan-review smoke test passed");
