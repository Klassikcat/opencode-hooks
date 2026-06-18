import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";

function parseJsonLines(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return "";
  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      parsed.push(line);
    }
  }
  const last = parsed.at(-1);
  if (typeof last === "string") return last;
  return last.output ?? last.result ?? last.message ?? last.delta ?? JSON.stringify(last, null, 2);
}

export class CodexProvider extends ProviderAdapter {
  get name() {
    return "codex";
  }

  get role() {
    return "review";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMO_CODEX_PATH ?? "codex";
    return {
      command,
      args: ["exec", request.prompt, "--json", "--sandbox", "read-only"],
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
      output: parseJsonLines,
    });
  }
}
