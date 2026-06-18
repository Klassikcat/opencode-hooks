// Structural smoke test for the completion-gate pi extension.
//
// This does NOT exercise the gate's runtime behavior — that requires the OMP/pi
// runtime and is verified by manual agent QA (see README). It only asserts that
// the default export loads, registers the expected tools, and subscribes to the
// expected lifecycle events without throwing.

import gate from "../completion-gate.js";

if (typeof gate !== "function") {
  throw new Error("completion-gate default export must be a function");
}

// Minimal chainable zod stub: every property access returns a callable that
// returns the same stub, so z.object({ x: z.string().describe(...).optional() })
// and z.enum([...]) all resolve without a real zod dependency.
const zStub = new Proxy(function () {}, {
  get() {
    return () => zStub;
  },
  apply() {
    return zStub;
  },
});

const registeredTools = [];
const registeredEvents = [];

const pi = {
  zod: zStub,
  setLabel() {},
  registerTool(def) {
    if (!def || typeof def.name !== "string") {
      throw new Error("registerTool called without a tool name");
    }
    registeredTools.push(def.name);
  },
  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new Error(`on("${eventName}") called without a handler function`);
    }
    registeredEvents.push(eventName);
  },
};

gate(pi);

const expectedTools = ["step_quality_pass", "subagent_quality_pass", "gate_pass"];
for (const name of expectedTools) {
  if (!registeredTools.includes(name)) {
    throw new Error(`Expected tool '${name}' to be registered; got: ${registeredTools.join(", ")}`);
  }
}

const expectedEvents = ["tool_result", "tool_call"];
for (const name of expectedEvents) {
  if (!registeredEvents.includes(name)) {
    throw new Error(`Expected event '${name}' handler; got: ${registeredEvents.join(", ")}`);
  }
}

console.log("completion-gate smoke test passed");
