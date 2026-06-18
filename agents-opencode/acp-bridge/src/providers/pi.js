import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";
import { parseArgsTemplate } from "./template.js";

export class PiProvider extends ProviderAdapter {
  get name() {
    return "pi";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMC_ACP_PI_PATH ?? "pi";
    const args = process.env.OMC_ACP_PI_ARGS
      ? parseArgsTemplate(process.env.OMC_ACP_PI_ARGS, request.prompt)
      : ["-p", request.prompt];
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
