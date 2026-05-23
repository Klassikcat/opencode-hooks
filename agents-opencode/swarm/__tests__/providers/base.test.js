import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  ENV_PREFIX,
  ProviderAdapter,
  STATUS_FAILED,
  STATUS_SUCCESS,
  STATUS_TIMEOUT
} from "../../src/providers/base.js";

describe("ProviderAdapter base contract", () => {
  it("exports provider status and environment constants", () => {
    expect(STATUS_SUCCESS).toBe("success");
    expect(STATUS_FAILED).toBe("failed");
    expect(STATUS_TIMEOUT).toBe("timeout");
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
    expect(ENV_PREFIX).toBe("SWARM_");
  });

  it("stores constructor options with defaults", () => {
    const adapter = new ProviderAdapter({
      command: "opencode",
      args: ["run"],
      env: { SWARM_TEST: "1" }
    });

    expect(adapter.command).toBe("opencode");
    expect(adapter.args).toEqual(["run"]);
    expect(adapter.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(adapter.env).toEqual({ SWARM_TEST: "1" });
  });

  it("preserves an explicit timeout", () => {
    const adapter = new ProviderAdapter({ timeoutMs: 1000 });

    expect(adapter.timeoutMs).toBe(1000);
  });

  it("requires subclasses to override the name getter", () => {
    const adapter = new ProviderAdapter();

    expect(() => adapter.name).toThrow(/name getter/);
  });

  it("requires subclasses to override execute", async () => {
    const adapter = new ProviderAdapter();

    await expect(adapter.execute("prompt", "target")).rejects.toThrow(/execute/);
  });
});
