import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { STATUS_FAILED, STATUS_SUCCESS, STATUS_TIMEOUT } from "../../src/providers/base.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

const { CodexAdapter } = await import("../../src/providers/codex.js");

function createProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  return child;
}

function mockSpawnWithProcess(child = createProcess()) {
  spawnMock.mockReturnValueOnce(child);
  return child;
}

describe("CodexAdapter", () => {
  beforeEach(() => {
    vi.useRealTimers();
    spawnMock.mockReset();
    delete process.env.SWARM_CODEX_PATH;
    delete process.env.SWARM_CODEX_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SWARM_CODEX_PATH;
    delete process.env.SWARM_CODEX_TIMEOUT_MS;
  });

  it("extends the provider contract with the codex name", () => {
    const adapter = new CodexAdapter();

    expect(adapter.name).toBe("codex");
  });

  it("spawns codex exec with read-only JSON sandbox args", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("Review this change");

    child.stdout.emit("data", '{"type":"result","result":"looks good"}\n');
    child.emit("close", 0);

    await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "Review this change", "--json", "--sandbox", "read-only"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("keeps the prompt as the positional exec argument", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("positional prompt");

    child.stdout.emit("data", '{"type":"result","result":"ok"}\n');
    child.emit("close", 0);

    await resultPromise;

    const args = spawnMock.mock.calls[0][1];
    expect(args[0]).toBe("exec");
    expect(args[1]).toBe("positional prompt");
    expect(args.slice(2)).toEqual(["--json", "--sandbox", "read-only"]);
  });

  it("prepends review target content to the prompt", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("Summarize risk", "diff --git a/file.js b/file.js");

    child.stdout.emit("data", '{"type":"result","result":"risk summary"}\n');
    child.emit("close", 0);

    await resultPromise;

    const prompt = spawnMock.mock.calls[0][1][1];
    expect(prompt).toContain("Review target:\n");
    expect(prompt).toContain("diff --git a/file.js b/file.js");
    expect(prompt).toContain("Prompt:\nSummarize risk");
  });

  it("parses successful JSONL output into a standardized result", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("review");

    child.stdout.emit("data", '{"type":"message","content":"first"}\n');
    child.stdout.emit("data", '{"type":"result","result":"final answer"}\n');
    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      provider: "codex",
      status: STATUS_SUCCESS,
      output: "final answer",
      events: [
        { type: "message", content: "first" },
        { type: "result", result: "final answer" }
      ],
      stderr: "",
      exitCode: 0
    });
  });

  it("falls back to message content when no result field is present", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("review");

    child.stdout.emit("data", '{"type":"message","content":"message output"}\n');
    child.emit("close", 0);

    const result = await resultPromise;

    expect(result.status).toBe(STATUS_SUCCESS);
    expect(result.output).toBe("message output");
  });

  it("returns failed status for nonzero exits with stderr", async () => {
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("review");

    child.stderr.emit("data", "codex failed");
    child.emit("close", 2);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({
        provider: "codex",
        status: STATUS_FAILED,
        stderr: "codex failed",
        exitCode: 2,
        error: "codex failed"
      })
    );
  });

  it("returns timeout status and kills the child process", async () => {
    vi.useFakeTimers();
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter({ timeoutMs: 25 });
    const resultPromise = adapter.execute("review");

    await vi.advanceTimersByTimeAsync(25);
    child.emit("close", null);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({
        provider: "codex",
        status: STATUS_TIMEOUT,
        error: "codex timed out after 25ms",
        exitCode: null
      })
    );
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("uses SWARM_CODEX_PATH for the executable", async () => {
    process.env.SWARM_CODEX_PATH = "/opt/bin/codex";
    const child = mockSpawnWithProcess();
    const adapter = new CodexAdapter();
    const resultPromise = adapter.execute("review");

    child.stdout.emit("data", '{"type":"result","result":"ok"}\n');
    child.emit("close", 0);

    await resultPromise;

    expect(spawnMock.mock.calls[0][0]).toBe("/opt/bin/codex");
  });

  it("uses SWARM_CODEX_TIMEOUT_MS for the default timeout", () => {
    process.env.SWARM_CODEX_TIMEOUT_MS = "1234";

    const adapter = new CodexAdapter();

    expect(adapter.timeoutMs).toBe(1234);
  });
});
