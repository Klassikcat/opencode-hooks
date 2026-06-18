import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";
import { parseArgsTemplate } from "./template.js";

export class ClaudeProvider extends ProviderAdapter {
  get name() {
    return "claude";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMC_ACP_CLAUDE_PATH ?? "claude";
    const args = process.env.OMC_ACP_CLAUDE_ARGS
      ? parseArgsTemplate(process.env.OMC_ACP_CLAUDE_ARGS, request.prompt)
      : ["-p", request.prompt, "--output-format", "json", "--max-turns", "0"];
    return { command, args };
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
