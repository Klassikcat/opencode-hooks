import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";

function parseArgsTemplate(template, prompt) {
  if (!template) return ["run", "--print", prompt];
  return template.split(" ").filter(Boolean).map((part) => (part === "{prompt}" ? prompt : part));
}

export class OpenCodeProvider extends ProviderAdapter {
  get name() {
    return "opencode";
  }

  get role() {
    return "orchestration";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMO_OPENCODE_PATH ?? "opencode";
    return {
      command,
      args: parseArgsTemplate(process.env.OMO_OPENCODE_ARGS, request.prompt),
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
