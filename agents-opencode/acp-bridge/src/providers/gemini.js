import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";
import { parseArgsTemplate } from "./template.js";

export class GeminiProvider extends ProviderAdapter {
  get name() {
    return "gemini";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMC_ACP_GEMINI_PATH ?? "gemini";
    const args = process.env.OMC_ACP_GEMINI_ARGS
      ? parseArgsTemplate(process.env.OMC_ACP_GEMINI_ARGS, request.prompt)
      : ["-p", request.prompt, "--output-format", "json"];
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
