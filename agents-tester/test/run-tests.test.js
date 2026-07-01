import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin/run-tests.mjs");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("passing fixture exits 0 with pass status", async () => {
  const result = await run(["--cwd", path.join(root, "fixtures/passing"), "--json"]);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).status, "pass");
});

test("failing fixture exits 1 with fail status", async () => {
  const result = await run(["--cwd", path.join(root, "fixtures/failing"), "--json"]);
  assert.equal(result.code, 1, result.stdout || result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.status, "fail");
  assert.match(json.stdout, /intentional fixture failure/);
});

test("undetected fixture exits 2 with skipped status", async () => {
  const result = await run(["--cwd", path.join(root, "fixtures/no-tests"), "--json"]);
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).status, "skipped");
});
