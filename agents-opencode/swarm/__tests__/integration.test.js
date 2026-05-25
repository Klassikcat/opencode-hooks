import { chmodSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const cwd = new URL("..", import.meta.url).pathname;
const cliPath = join(cwd, "src/cli.js");
const fixturesPath = join(cwd, "__tests__/fixtures");

const fixtureCommands = {
  claude: join(fixturesPath, "mock-claude.mjs"),
  codex: join(fixturesPath, "mock-codex.mjs"),
  fail: join(fixturesPath, "mock-fail.mjs"),
  gemini: join(fixturesPath, "mock-gemini.mjs"),
  slow: join(fixturesPath, "mock-slow.mjs")
};

function runCli(args = [], env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SWARM_CLAUDE_TIMEOUT_MS: undefined,
      SWARM_CODEX_TIMEOUT_MS: undefined,
      SWARM_GEMINI_TIMEOUT_MS: undefined,
      SWARM_TIMEOUT_MS: undefined,
      ...env
    }
  });
}

function successEnv(overrides = {}) {
  return {
    SWARM_CLAUDE_PATH: fixtureCommands.claude,
    SWARM_CODEX_PATH: fixtureCommands.codex,
    SWARM_GEMINI_PATH: fixtureCommands.gemini,
    ...overrides
  };
}

describe("CLI integration", () => {
  beforeAll(() => {
    for (const command of Object.values(fixtureCommands)) {
      chmodSync(command, 0o755);
    }
  });

  it("runs full end-to-end with mock provider scripts", () => {
    const result = runCli(["--prompt", "test"], successEnv());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Claude");
    expect(result.stdout).toContain("claude fixture response");
    expect(result.stdout).toContain("## Codex");
    expect(result.stdout).toContain("codex fixture response");
    expect(result.stdout).toContain("## Gemini");
    expect(result.stdout).toContain("gemini fixture response");
    expect(result.stdout).toContain("## Summary");
  });

  it("fans out and reports all three provider results", () => {
    const result = runCli(["--prompt", "test"], successEnv());

    expect(result.status).toBe(0);
    expect(result.stdout.match(/✅ success/g)).toHaveLength(3);
    expect(result.stdout).toContain("claude fixture response");
    expect(result.stdout).toContain("codex fixture response");
    expect(result.stdout).toContain("gemini fixture response");
  });

  it("renders every report section", () => {
    const result = runCli(["--prompt", "test"], successEnv());

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^## Claude\n/);
    expect(result.stdout).toMatch(/\n## Codex\n/);
    expect(result.stdout).toMatch(/\n## Gemini\n/);
    expect(result.stdout).toMatch(/\n## Summary\n/);
  });

  it("reports partial failure when one provider exits nonzero", () => {
    const result = runCli(["--prompt", "test"], successEnv({
      SWARM_GEMINI_PATH: fixtureCommands.fail
    }));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("claude fixture response");
    expect(result.stdout).toContain("codex fixture response");
    expect(result.stdout).toContain("## Gemini");
    expect(result.stdout).toContain("❌ failed");
    expect(result.stdout).toContain("fixture provider failed");
    expect(result.stdout).toContain("Partial results available: 2 of 3 providers succeeded.");
    expect(result.stdout).toContain("- Gemini: failed");
  });

  it("reports timeout when one provider exceeds the CLI timeout", () => {
    const result = runCli(["--prompt", "test", "--timeout", "500"], successEnv({
      SWARM_GEMINI_PATH: fixtureCommands.slow
    }));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("claude fixture response");
    expect(result.stdout).toContain("codex fixture response");
    expect(result.stdout).toContain("## Gemini");
    expect(result.stdout).toContain("⏱️ timeout");
    expect(result.stdout).toContain("Gemini CLI timed out after 500ms");
    expect(result.stdout).toContain("Partial results available: 2 of 3 providers succeeded.");
    expect(result.stdout).toContain("- Gemini: timeout");
  });
});
