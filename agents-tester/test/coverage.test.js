import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin/coverage-gate.mjs");

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

async function runJson(cwd, extra = ["--no-run"]) {
  const result = await run(["--cwd", cwd, ...extra, "--json"]);
  return { ...result, json: JSON.parse(result.stdout) };
}

test("coverage pass fixture passes", async () => {
  const result = await runJson("fixtures/coverage/pass");
  assert.equal(result.code, 0);
  assert.equal(result.json.status, "pass");
});

test("coverage below fixture fails threshold", async () => {
  const result = await runJson("fixtures/coverage/below");
  assert.equal(result.code, 1);
  assert.ok(result.json.failures.some((failure) => failure.metric === "lines" && failure.rule === "threshold"));
});

test("coverage regress fixture fails baseline regression", async () => {
  const result = await runJson("fixtures/coverage/regress");
  assert.equal(result.code, 1);
  assert.ok(result.json.failures.some((failure) => failure.metric === "lines" && failure.rule === "regression"));
});

test("coverage missing fixture is skipped", async () => {
  const result = await runJson("fixtures/coverage/missing");
  assert.equal(result.code, 2);
  assert.equal(result.json.status, "skipped");
});

test("coverage update-baseline writes current metrics", async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "agents-tester-coverage-"));
  await cp(path.join(root, "fixtures/coverage/regress"), tmp, { recursive: true });
  const update = await run(["--cwd", tmp, "--no-run", "--update-baseline"]);
  assert.equal(update.code, 0);
  const baseline = JSON.parse(await readFile(path.join(tmp, "baseline.json"), "utf8"));
  assert.equal(baseline.lines, 82);
  const after = await runJson(tmp);
  assert.equal(after.code, 0);
  assert.equal(after.json.status, "pass");
});

test("coverage --json captures child stdout and stderr noise", async () => {
  const result = await runJson("fixtures/coverage/run-json", ["--run"]);
  assert.equal(result.code, 0);
  assert.equal(result.json.status, "pass");
  assert.doesNotMatch(result.stdout, /NOISE-OUT/);
  assert.doesNotMatch(result.stdout, /NOISE-ERR/);
});
