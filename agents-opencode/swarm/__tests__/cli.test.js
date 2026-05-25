import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = new URL("../src/cli.js", import.meta.url).pathname;
const cwd = new URL("..", import.meta.url).pathname;
const tempDirs = [];

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function createCommand(source) {
  const directory = mkdtempSync(join(tmpdir(), "swarm-cli-"));
  tempDirs.push(directory);
  const commandPath = join(directory, "command.mjs");
  writeFileSync(commandPath, `#!/usr/bin/env node\n${source}`);
  chmodSync(commandPath, 0o755);
  return commandPath;
}

function successCommandEnv() {
  const command = createCommand(`
const args = process.argv.slice(2);
const output = args.join(" ");
if (args[0] === "exec") {
  console.log(JSON.stringify({ type: "result", result: output }));
} else {
  console.log(JSON.stringify({ result: output }));
}
`);

  return {
    SWARM_CLAUDE_PATH: command,
    SWARM_CODEX_PATH: command,
    SWARM_GEMINI_PATH: command
  };
}

describe("CLI", () => {
  afterEach(() => {
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("produces markdown output containing provider names for a prompt", () => {
    const result = runCli(["--prompt", "hello"], successCommandEnv());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Claude");
    expect(result.stdout).toContain("## Codex");
    expect(result.stdout).toContain("## Gemini");
    expect(result.stdout).toContain("## Summary");
  });

  it("reads --review-target content and includes it in provider output", () => {
    const directory = mkdtempSync(join(tmpdir(), "swarm-target-"));
    tempDirs.push(directory);
    const targetPath = join(directory, "target.txt");
    writeFileSync(targetPath, "review target body");

    const result = runCli(["--prompt", "hello", "--review-target", targetPath], successCommandEnv());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("review target body");
    expect(result.stdout).toContain("hello");
  });

  it("exits 1 when --review-target does not exist", () => {
    const result = runCli(["--prompt", "hello", "--review-target", "/missing/review-target.txt"], successCommandEnv());

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Error: review target file not found: /missing/review-target.txt");
  });

  it("exits 1 with usage when --prompt is missing", () => {
    const result = runCli([], successCommandEnv());

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: node src/cli.js --prompt <text>");
  });

  it("uses the --timeout flag for adapter execution", () => {
    const command = createCommand("setTimeout(() => {}, 1000);");
    const result = runCli(["--prompt", "hello", "--timeout", "25"], {
      SWARM_CLAUDE_PATH: command,
      SWARM_CODEX_PATH: command,
      SWARM_GEMINI_PATH: command
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("timed out after 25ms");
  });

  it("exits 1 when all adapters fail", () => {
    const command = createCommand("process.stderr.write('adapter failed'); process.exit(2);");
    const result = runCli(["--prompt", "hello"], {
      SWARM_CLAUDE_PATH: command,
      SWARM_CODEX_PATH: command,
      SWARM_GEMINI_PATH: command
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("## Claude");
    expect(result.stdout).toContain("## Codex");
    expect(result.stdout).toContain("## Gemini");
    expect(result.stdout).toContain("No successful results to compare.");
  });

  it("handles missing binary gracefully with a failed report", () => {
    const env = successCommandEnv();
    const result = runCli(["--prompt", "hello"], {
      ...env,
      SWARM_CLAUDE_PATH: "/nonexistent/binary"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Claude");
    expect(result.stdout).toMatch(/Failed to spawn|ENOENT/);
  });

  it("produces valid markdown with all required sections", () => {
    const result = runCli(["--prompt", "hello"], successCommandEnv());
    const sectionOrder = ["## Claude", "## Codex", "## Gemini", "## Summary"];
    const sectionIndexes = sectionOrder.map((section) => result.stdout.indexOf(section));

    expect(result.status).toBe(0);
    expect(result.stdout.startsWith("## Claude")).toBe(true);
    expect(sectionIndexes.every((index) => index >= 0)).toBe(true);
    expect(sectionIndexes).toEqual([...sectionIndexes].sort((left, right) => left - right));
    expect(result.stdout).toContain("### Consensus");
    expect(result.stdout).toContain("### Differences");
    expect(result.stdout).toContain("### Unavailable");
  });

  it("includes duration information for each provider", () => {
    const result = runCli(["--prompt", "hello"], successCommandEnv());

    expect(result.status).toBe(0);
    for (const provider of ["Claude", "Codex", "Gemini"]) {
      expect(result.stdout).toMatch(new RegExp(`## ${provider}[\\s\\S]*Duration:`));
    }
  });
});
