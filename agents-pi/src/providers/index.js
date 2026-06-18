import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { OpenCodeProvider } from "./opencode.js";

export { ClaudeProvider } from "./claude.js";
export { CodexProvider } from "./codex.js";
export { OpenCodeProvider } from "./opencode.js";

export function createProvider(name, options = {}) {
  switch (name) {
    case "claude":
      return new ClaudeProvider(options);
    case "codex":
      return new CodexProvider(options);
    case "opencode":
      return new OpenCodeProvider(options);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export const DEFAULT_ROLE_PROVIDER = {
  orchestration: "opencode",
  planning: "claude",
  review: "codex",
};
