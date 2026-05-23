import { describe, expect, it } from "vitest";
import { main } from "../../src/cli.js";

describe("swarm scaffold", () => {
  it("exposes the CLI entry point", () => {
    expect(main()).toBe("opencode-swarm-agent");
  });
});
