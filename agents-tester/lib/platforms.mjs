const ROLE_GRANTS = {
  "test-author": {
    pi: { tools: "read, search, find, edit, write, bash, lsp", model: "pi/default", thinkingLevel: "medium" },
    claude: { tools: "Read, Grep, Glob, Write, Edit, Bash", model: "sonnet" },
    opencode: { edit: "allow", bash: "allow" },
  },
  "test-runner": {
    pi: { tools: "read, search, find, bash", model: "pi/smol", thinkingLevel: "low" },
    claude: { tools: "Read, Grep, Glob, Bash", model: "haiku" },
    opencode: { edit: "deny", bash: "allow" },
  },
  "coverage-judge": {
    pi: { tools: "read, search, find, bash", model: "pi/default", thinkingLevel: "medium" },
    claude: { tools: "Read, Grep, Glob, Bash", model: "sonnet" },
    opencode: { edit: "deny", bash: "allow" },
  },
};

function grantFor(platform, id) {
  const grants = ROLE_GRANTS[id]?.[platform];
  if (!grants) throw new Error(`No ${platform} grants configured for role ${id}`);
  return grants;
}

export const PLATFORMS = {
  pi: {
    outPath(id) {
      return `agents-pi/agents/${id}.md`;
    },
    frontmatter(meta) {
      const grant = grantFor("pi", meta.id);
      return [
        "---",
        `name: ${meta.id}`,
        `description: "${meta.descriptionPi}"`,
        `tools: ${grant.tools}`,
        `model: ${grant.model}`,
        `thinking-level: ${grant.thinkingLevel}`,
        "---",
      ].join("\n");
    },
  },
  claude: {
    outPath(id) {
      return `agents-claude/agents/${id}.md`;
    },
    frontmatter(meta) {
      const grant = grantFor("claude", meta.id);
      return [
        "---",
        `name: ${meta.id}`,
        `description: "${meta.descriptionClaude}"`,
        `tools: ${grant.tools}`,
        `model: ${grant.model}`,
        "---",
      ].join("\n");
    },
  },
  opencode: {
    outPath(id) {
      return `agents-opencode/${id}/AGENT.md`;
    },
    frontmatter(meta) {
      const grant = grantFor("opencode", meta.id);
      return [
        "---",
        `description: ${meta.descriptionOpencode}`,
        "mode: subagent",
        "permission:",
        `  edit: ${grant.edit}`,
        `  bash: ${grant.bash}`,
        "---",
      ].join("\n");
    },
  },
};
