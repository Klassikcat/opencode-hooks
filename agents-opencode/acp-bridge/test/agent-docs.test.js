import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const agent of ["prometheus", "atlas", "sisyphus"]) {
  test(`${agent} AGENT.md calls the ACP bridge with its role`, () => {
    const content = fs.readFileSync(new URL(`../../${agent}/AGENT.md`, import.meta.url), "utf8");
    assert.match(content, /mode: subagent/);
    assert.match(content, /edit: deny/);
    assert.match(content, new RegExp(`--role ${agent}`));
    assert.match(content, /claude,pi,codex,gemini/);
  });
}
