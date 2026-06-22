// Structural smoke test for the worktree-redirect pi extension.
//
// Interactive plan approval requires the OMP/pi runtime. This test only asserts
// that the extension loads and subscribes to the expected lifecycle events.

import worktreeRedirect from "../zz-worktree-redirect.js";

if (typeof worktreeRedirect !== "function") {
  throw new Error("worktree-redirect default export must be a function");
}

const registeredEvents = [];
const registeredCommands = new Map();


const pi = {
  setLabel() { },
  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new Error(`on("${eventName}") called without a handler function`);
    }
    registeredEvents.push(eventName);
  },
  registerCommand(name, options) {
    if (typeof options?.handler !== "function") {
      throw new Error(`registerCommand("${name}") called without a handler function`);
    }
    registeredCommands.set(name, options);
  },
};

worktreeRedirect(pi);

if (!registeredEvents.includes("input")) {
  throw new Error(`Expected an 'input' handler for /start-work; got: ${registeredEvents.join(", ")}`);
}

if (!registeredCommands.has("start-work")) {
  throw new Error(`Expected a registered /start-work command; got: ${[...registeredCommands.keys()].join(", ")}`);
}


if (!registeredEvents.includes("tool_call")) {
  throw new Error(`Expected a 'tool_call' handler; got: ${registeredEvents.join(", ")}`);
}

const toolResultCount = registeredEvents.filter(eventName => eventName === "tool_result").length;
if (toolResultCount < 2) {
  throw new Error(`Expected at least two 'tool_result' handlers; got: ${registeredEvents.join(", ")}`);
}

console.log("worktree-redirect smoke test passed");
