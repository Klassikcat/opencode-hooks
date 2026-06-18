import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { GeminiProvider } from "./gemini.js";
import { PiProvider } from "./pi.js";

export { ClaudeProvider } from "./claude.js";
export { CodexProvider } from "./codex.js";
export { GeminiProvider } from "./gemini.js";
export { PiProvider } from "./pi.js";

export const DEFAULT_PROVIDERS = ["claude", "pi", "codex", "gemini"];

export function createProvider(name, options = {}) {
  switch (name) {
    case "claude":
      return new ClaudeProvider(options);
    case "codex":
      return new CodexProvider(options);
    case "gemini":
      return new GeminiProvider(options);
    case "pi":
      return new PiProvider(options);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}
