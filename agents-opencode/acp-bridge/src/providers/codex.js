import { ProviderAdapter } from "./base.js";
import { runProcess } from "./process.js";
import { parseArgsTemplate } from "./template.js";

function parseJsonLines(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return "";

  const parsed = [];
  let sawJson = false;
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
      sawJson = true;
    } catch {
      parsed.push(line);
    }
  }

  if (!sawJson) return stdout.trim();

  const last = parsed.at(-1);
  if (typeof last === "string") return stdout.trim();
  return last.output ?? last.result ?? last.message ?? last.delta ?? JSON.stringify(last, null, 2);
}

export class CodexProvider extends ProviderAdapter {
  get name() {
    return "codex";
  }

  buildInvocation(request) {
    const command = this.command ?? process.env.OMC_ACP_CODEX_PATH ?? "codex";
    const args = process.env.OMC_ACP_CODEX_ARGS
      ? parseArgsTemplate(process.env.OMC_ACP_CODEX_ARGS, request.prompt)
      : ["exec", request.prompt, "--json", "--sandbox", "read-only"];
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
      output: parseJsonLines,
    });
  }
}
