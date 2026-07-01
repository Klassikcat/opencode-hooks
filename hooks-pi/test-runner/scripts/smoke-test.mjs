import testRunner from "../test-runner.js";

if (typeof testRunner !== "function") {
  throw new Error("test-runner default export must be a function");
}

const zStub = new Proxy(function() { }, {
  get() {
    return () => zStub;
  },
  apply() {
    return zStub;
  },
});

const registeredTools = [];

const pi = {
  zod: zStub,
  setLabel() { },
  registerTool(def) {
    if (!def || typeof def.name !== "string") {
      throw new Error("registerTool called without a tool name");
    }
    registeredTools.push(def.name);
  },
};

testRunner(pi);

if (!registeredTools.includes("run_tests")) {
  throw new Error(`Expected tool 'run_tests' to be registered; got: ${registeredTools.join(", ")}`);
}

console.log("test-runner smoke test passed");
