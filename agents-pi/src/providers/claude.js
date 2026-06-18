import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";

export class ClaudeProvider extends ProviderAdapter {
  get name() {
    return "claude";
  }

  get role() {
    return "planning";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMO_CLAUDE_PATH ?? "claude";
    return {
      command,
      args: ["-p", request.prompt, "--output-format", "json", "--max-turns", "0"],
    };
  }

  async execute(request) {
    const invocation = this.buildInvocation(request);
    return runProcess({
      provider: this.name,
      command: invocation.command,
      args: invocation.args,
      timeoutMs: this.timeoutMs,
      env: this.env,
    });
  }
}
