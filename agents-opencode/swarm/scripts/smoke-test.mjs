import { execSync } from "node:child_process";

const result = execSync(`node src/cli.js --prompt "smoke test"`, {
  encoding: "utf8",
  env: {
    ...process.env,
    SWARM_CLAUDE_PATH: "echo",
    SWARM_CODEX_PATH: "echo",
    SWARM_GEMINI_PATH: "echo"
  }
});

if (!result.includes("Claude") && !result.includes("Codex") && !result.includes("Gemini")) {
  process.exit(1);
}

console.log("smoke test passed");
