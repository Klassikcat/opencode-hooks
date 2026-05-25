import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import {
  STATUS_FAILED,
  STATUS_SUCCESS,
  STATUS_TIMEOUT
} from "../../src/providers/base.js";
import { ClaudeAdapter } from "../../src/providers/claude.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.killed = true;
    child.emit("close", null, "SIGTERM");
  });
  child.killed = false;
  return child;
}

function mockSpawn(child = createChild()) {
  spawn.mockReturnValueOnce(child);
  return child;
}

describe("ClaudeAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    delete process.env.SWARM_CLAUDE_PATH;
    delete process.env.SWARM_CLAUDE_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SWARM_CLAUDE_PATH;
    delete process.env.SWARM_CLAUDE_TIMEOUT_MS;
  });

  it("extends the provider contract with the Claude name", () => {
    const adapter = new ClaudeAdapter();

    expect(adapter.name).toBe("claude");
  });

  it("builds Claude Code headless args with prompt as the -p argument", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("Review this change");

    child.stdout.emit("data", '{"result":"looks good"}');
    child.emit("close", 0);

    await execution;

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      ["-p", "Review this change", "--output-format", "json", "--max-turns", "0"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("prepends review target content to the prompt", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("Find risks", "diff --git a/file.js b/file.js");

    child.stdout.emit("data", "plain output");
    child.emit("close", 0);

    await execution;

    const [, args] = spawn.mock.calls[0];
    expect(args[1]).toContain("Review target:\n");
    expect(args[1]).toContain("diff --git a/file.js b/file.js");
    expect(args[1]).toContain("Find risks");
  });

  it("uses SWARM_CLAUDE_PATH for the executable", async () => {
    process.env.SWARM_CLAUDE_PATH = "/opt/bin/claude-code";
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("hello");

    child.emit("close", 0);

    await execution;

    expect(spawn.mock.calls[0][0]).toBe("/opt/bin/claude-code");
  });

  it("uses SWARM_CLAUDE_TIMEOUT_MS for the timeout", () => {
    process.env.SWARM_CLAUDE_TIMEOUT_MS = "2500";

    const adapter = new ClaudeAdapter();

    expect(adapter.timeoutMs).toBe(2500);
  });

  it("returns a success result and parsed JSON stdout when possible", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("review");

    child.stdout.emit("data", '{"result":"ship it","usage":{"total_cost_usd":0.01}}');
    child.emit("close", 0);

    await expect(execution).resolves.toEqual({
      provider: "claude",
      status: STATUS_SUCCESS,
      output: "ship it",
      rawOutput: '{"result":"ship it","usage":{"total_cost_usd":0.01}}',
      parsed: { result: "ship it", usage: { total_cost_usd: 0.01 } },
      exitCode: 0,
      signal: null,
      error: null
    });
  });

  it("returns plain stdout when JSON parsing is not possible", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("review");

    child.stdout.emit("data", "plain success");
    child.emit("close", 0);

    await expect(execution).resolves.toMatchObject({
      provider: "claude",
      status: STATUS_SUCCESS,
      output: "plain success",
      parsed: null,
      error: null
    });
  });

  it("returns a failed result for nonzero exits", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 1000 });
    const execution = adapter.execute("review");

    child.stderr.emit("data", "permission denied");
    child.emit("close", 2);

    await expect(execution).resolves.toMatchObject({
      provider: "claude",
      status: STATUS_FAILED,
      output: "",
      error: "permission denied",
      exitCode: 2,
      signal: null
    });
  });

  it("kills the process and returns timeout when execution exceeds timeoutMs", async () => {
    const child = mockSpawn();
    const adapter = new ClaudeAdapter({ timeoutMs: 50 });
    const execution = adapter.execute("review");

    await vi.advanceTimersByTimeAsync(50);

    await expect(execution).resolves.toMatchObject({
      provider: "claude",
      status: STATUS_TIMEOUT,
      error: "Claude Code timed out after 50ms",
      exitCode: null,
      signal: "SIGTERM"
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
