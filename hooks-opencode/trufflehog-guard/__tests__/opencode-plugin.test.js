import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import will fail RED phase if module structure is not updated yet.
let plugin;
try {
  plugin = (await import("../index.js")).plugin;
} catch (e) {
  // Expected RED phase failure
}

function createScannerMock(resultsByPath = {}) {
  const calls = [];
  const scanner = async (filePath) => {
    calls.push(filePath);
    const result = resultsByPath[filePath];

    if (result instanceof Error) {
      throw result;
    }

    return result || { findings: [], wellKnown: null, timeout: false, scannerMissing: false };
  };

  scanner.calls = calls;
  return scanner;
}

async function createHook(resultsByPath) {
  const scanner = createScannerMock(resultsByPath);
  const instance = await plugin({}, { scanner });
  return { hook: instance["tool.execute.before"], instance, scanner };
}

describe("OpenCode plugin mode", () => {
  it("returns an object with tool.execute.before key", async () => {
    const { instance } = await createHook();
    assert.ok(instance["tool.execute.before"]);
  });

  it("intercepts Read tool calls", async () => {
    const { hook, scanner } = await createHook();
    await hook({ tool: "Read" }, { args: { filePath: "/tmp/test" } });
    assert.deepEqual(scanner.calls, ["/tmp/test"]);
  });

  it("passes through non-Read tools without scanning", async () => {
    const { hook, scanner } = await createHook();
    const result = await hook({ tool: "write" }, { args: { filePath: "/tmp/test" } });
    assert.equal(result, undefined);
    assert.deepEqual(scanner.calls, []);
  });

  it("throws for verified findings", async () => {
    const { hook } = await createHook({
      "/tmp/.env": {
        findings: [{ detector: "AWS", verified: true }],
        wellKnown: null,
        timeout: false,
        scannerMissing: false,
      },
    });

    await assert.rejects(
      () => hook({ tool: "Read" }, { args: { filePath: "/tmp/.env" } }),
      /verified/i,
    );
  });

  it("throws for unverified findings with ask message", async () => {
    const { hook } = await createHook({
      "/tmp/notes.txt": {
        findings: [{ detector: "AWS", verified: false }],
        wellKnown: null,
        timeout: false,
        scannerMissing: false,
      },
    });

    await assert.rejects(
      () => hook({ tool: "Read" }, { args: { filePath: "/tmp/notes.txt" } }),
      /unverified/i,
    );
  });

  it("allows clean files without throwing", async () => {
    const { hook } = await createHook({
      "/tmp/safe.txt": { findings: [], wellKnown: null, timeout: false, scannerMissing: false },
    });

    await assert.doesNotReject(() =>
      hook({ tool: "Read" }, { args: { filePath: "/tmp/safe.txt" } }),
    );
  });

  it("throws for well-known sensitive paths", async () => {
    const { hook } = await createHook({
      "/home/user/.ssh/id_rsa": {
        findings: [],
        wellKnown: "well-known sensitive file: ~/.ssh/id_rsa",
        timeout: false,
        scannerMissing: false,
      },
    });

    await assert.rejects(
      () => hook({ tool: "Read" }, { args: { filePath: "/home/user/.ssh/id_rsa" } }),
      /well-known/i,
    );
  });

  it("throws for scanner timeout", async () => {
    const { hook } = await createHook({
      "/tmp/slow.env": { findings: [], wellKnown: null, timeout: true, scannerMissing: false },
    });

    await assert.rejects(
      () => hook({ tool: "Read" }, { args: { filePath: "/tmp/slow.env" } }),
      /timeout/i,
    );
  });

  it("throws when scanner is not found (fail-closed)", async () => {
    const { hook } = await createHook({
      "/tmp/test": { findings: [], wellKnown: null, timeout: false, scannerMissing: true },
    });

    await assert.rejects(
      () => hook({ tool: "Read" }, { args: { filePath: "/tmp/test" } }),
      /not found/i,
    );
  });
});
