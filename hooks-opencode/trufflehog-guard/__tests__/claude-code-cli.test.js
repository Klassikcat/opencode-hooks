import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(testDir, "..");
const indexPath = path.join(packageDir, "index.js");
const fixturesDir = path.join(testDir, "fixtures");

function fixturePath(name) {
  return path.join(fixturesDir, name);
}

async function withMockPython(run) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "trufflehog-guard-cli-test-"));
  const binDir = path.join(tempDir, "bin");
  const pythonPath = path.join(binDir, "python3");

  await mkdir(binDir);
  await writeFile(
    pythonPath,
    `#!/usr/bin/env node
import { readFileSync } from "node:fs";

process.stdin.resume();
process.stdin.on("end", () => {
  const fixture = process.env.MOCK_SCANNER_FIXTURE;
  if (fixture) {
    process.stdout.write(readFileSync(fixture, "utf8"));
  }
});
`,
    { mode: 0o755 },
  );
  await chmod(pythonPath, 0o755);

  try {
    return await run({ tempDir, binDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runCli({ payload, fixture = "no-findings.json", claudeCodeHook = true }) {
  return withMockPython(
    ({ binDir, tempDir }) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [indexPath], {
          cwd: packageDir,
          env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
            MOCK_SCANNER_FIXTURE: fixturePath(fixture),
            OPENCODE_TRUFFLEHOG_GUARD_SCRIPT: path.join(tempDir, "mock-scanner.py"),
            ...(claudeCodeHook ? { CLAUDE_CODE_HOOK: "1" } : { CLAUDE_CODE_HOOK: undefined }),
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          resolve({ code, stdout, stderr });
        });

        child.stdin.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      }),
  );
}

function readPayload(filePath) {
  return {
    tool_name: "Read",
    tool_input: { file_path: filePath },
    cwd: packageDir,
  };
}

function parseCliOutput(result) {
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.notEqual(result.stdout.trim(), "", "expected Claude Code CLI JSON on stdout");
  return JSON.parse(result.stdout);
}

function assertPermissionDecision(result, expectedDecision) {
  const output = parseCliOutput(result);
  assert.equal(output?.hookSpecificOutput?.permissionDecision, expectedDecision);
}

describe("Claude Code CLI mode", () => {
  it("denies a verified scanner finding and exits successfully", async () => {
    const result = await runCli({
      payload: readPayload("/tmp/project/.env"),
      fixture: "verified-finding.json",
    });

    assertPermissionDecision(result, "deny");
  });

  it("asks for permission on an unverified scanner finding and exits successfully", async () => {
    const result = await runCli({
      payload: readPayload("/tmp/project/notes.txt"),
      fixture: "unverified-finding.json",
    });

    assertPermissionDecision(result, "ask");
  });

  it("allows a clean file and exits successfully", async () => {
    const result = await runCli({
      payload: readPayload("/tmp/project/src/app.js"),
      fixture: "no-findings.json",
    });

    assertPermissionDecision(result, "allow");
  });

  it("denies a well-known sensitive path and exits successfully", async () => {
    const result = await runCli({
      payload: readPayload(path.join(process.env.HOME || "/home/example", ".ssh", "id_rsa")),
      fixture: "no-findings.json",
    });

    assertPermissionDecision(result, "deny");
  });

  it("allows non-Read tools as a passthrough and exits successfully", async () => {
    const result = await runCli({
      payload: {
        tool_name: "Bash",
        tool_input: { command: "printf safe" },
        cwd: packageDir,
      },
      fixture: "verified-finding.json",
    });

    assertPermissionDecision(result, "allow");
  });

  it("denies malformed stdin JSON fail-closed", async () => {
    const result = await runCli({
      payload: "{ this is not valid JSON",
      fixture: "no-findings.json",
    });

    assertPermissionDecision(result, "deny");
  });

  it("does not activate CLI mode when CLAUDE_CODE_HOOK is missing", async () => {
    const result = await runCli({
      payload: readPayload("/tmp/project/.env"),
      fixture: "verified-finding.json",
      claudeCodeHook: false,
    });

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "");
  });
});
