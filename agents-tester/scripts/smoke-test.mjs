import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { readBaseline, writeBaseline } from "../lib/baseline.mjs";
import { loadConfig } from "../lib/config.mjs";
import { parseCoverage } from "../lib/coverage.mjs";
import { detectProject } from "../lib/detect.mjs";
import { PLATFORMS } from "../lib/platforms.mjs";
import { parseRole, renderAgentFile } from "../bin/generate-agents.mjs";

assert.deepEqual(Object.keys(PLATFORMS).sort(), ["claude", "opencode", "pi"]);
for (const platform of Object.values(PLATFORMS)) {
  assert.equal(typeof platform.frontmatter, "function");
  assert.equal(typeof platform.outPath, "function");
}

const rolesDir = new URL("../roles/", import.meta.url);
const roleFiles = (await readdir(rolesDir)).filter((file) => file.endsWith(".md")).sort();
assert.deepEqual(roleFiles, ["coverage-judge.md", "test-author.md", "test-runner.md"]);

for (const file of roleFiles) {
  const { meta, body } = parseRole(await readFile(new URL(file, rolesDir), "utf8"));
  assert.ok(meta.id);
  assert.ok(body.trim());
  for (const platform of Object.keys(PLATFORMS)) {
    const rendered = renderAgentFile(platform, meta, body);
    assert.ok(rendered.startsWith("---"));
    if (platform === "pi") {
      assert.match(rendered, /name:/);
      assert.match(rendered, /tools:/);
      assert.match(rendered, /model:/);
      assert.match(rendered, /thinking-level:/);
    } else if (platform === "claude") {
      assert.match(rendered, /name:/);
      assert.match(rendered, /tools:/);
      assert.match(rendered, /model:/);
    } else {
      assert.match(rendered, /mode: subagent/);
      assert.match(rendered, /permission:/);
    }
  }
}

const tmp = await mkdtemp(path.join(tmpdir(), "agents-tester-smoke-"));
await writeFile(path.join(tmp, "coverage-summary.json"), JSON.stringify({ total: { lines: { pct: 91 } } }));
const metrics = await parseCoverage(path.join(tmp, "coverage-summary.json"));
assert.equal(metrics.lines, 91);
await writeBaseline(path.join(tmp, "baseline.json"), metrics);
assert.equal((await readBaseline(path.join(tmp, "baseline.json"))).lines, 91);
assert.equal((await loadConfig(tmp)).thresholds.lines, 80);
assert.equal((await detectProject(tmp, {})).testCommand, null);

console.log("agents-tester smoke test passed");
