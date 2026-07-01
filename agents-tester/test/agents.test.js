import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const roles = ["test-author", "test-runner", "coverage-judge"];
const platforms = {
  pi: (id) => path.join(repoRoot, "agents-pi/agents", `${id}.md`),
  claude: (id) => path.join(repoRoot, "agents-claude/agents", `${id}.md`),
  opencode: (id) => path.join(repoRoot, "agents-opencode", id, "AGENT.md"),
};

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, "frontmatter block missing");
  return match[1];
}

test("all generated tester agents exist with required frontmatter", async () => {
  for (const role of roles) {
    for (const [platform, fileFor] of Object.entries(platforms)) {
      const fm = frontmatter(await readFile(fileFor(role), "utf8"));
      if (platform === "pi") {
        assert.match(fm, /^name:/m);
        assert.match(fm, /^tools:/m);
        assert.match(fm, /^model:/m);
        assert.match(fm, /^thinking-level:/m);
      } else if (platform === "claude") {
        assert.match(fm, /^name:/m);
        assert.match(fm, /^tools:/m);
        assert.match(fm, /^model:/m);
      } else {
        assert.match(fm, /^mode: subagent/m);
        assert.match(fm, /^permission:/m);
      }
    }
  }
});

test("author can write but runner and judge cannot", async () => {
  const piAuthor = frontmatter(await readFile(platforms.pi("test-author"), "utf8"));
  assert.match(piAuthor, /^tools: .*\bedit\b.*\bwrite\b/m);
  const claudeAuthor = frontmatter(await readFile(platforms.claude("test-author"), "utf8"));
  assert.match(claudeAuthor, /^tools: .*\bWrite\b.*\bEdit\b/m);
  const openAuthor = frontmatter(await readFile(platforms.opencode("test-author"), "utf8"));
  assert.match(openAuthor, /edit: allow/);

  for (const role of ["test-runner", "coverage-judge"]) {
    const piFm = frontmatter(await readFile(platforms.pi(role), "utf8"));
    assert.doesNotMatch(piFm, /^tools: .*\b(edit|write)\b/m);
    const claudeFm = frontmatter(await readFile(platforms.claude(role), "utf8"));
    assert.doesNotMatch(claudeFm, /^tools: .*\b(Write|Edit)\b/m);
    const openFm = frontmatter(await readFile(platforms.opencode(role), "utf8"));
    assert.match(openFm, /edit: deny/);
  }
});
