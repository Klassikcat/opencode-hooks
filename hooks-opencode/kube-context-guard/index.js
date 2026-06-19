import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "kube-context-guard.py");

function scriptPathFrom(options) {
  return options.scriptPath || process.env.OPENCODE_KUBE_GUARD_SCRIPT || DEFAULT_SCRIPT;
}

function commandFrom(args) {
  return args?.command ?? args?.cmd;
}

function runHook(scriptPath, payload, timeoutMs) {
  return new Promise((resolve) => {
    if (!existsSync(scriptPath)) {
      resolve(null);
      return;
    }

    const proc = spawn("python3", [scriptPath, "check"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      if (killed) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || "{}"));
      } catch {
        resolve(null);
      }
    });

    try {
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    } catch {
      resolve(null);
    }
  });
}

export const plugin = async (ctx = {}, options = {}) => {
  const directory = ctx.directory || process.cwd();
  const scriptPath = scriptPathFrom(options);
  const timeoutMs = Number(options.timeoutMs || process.env.OPENCODE_KUBE_GUARD_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool || "").toLowerCase();
      if (tool !== "bash") return;

      const command = commandFrom(output?.args);
      if (!command || typeof command !== "string") return;

      const result = await runHook(
        scriptPath,
        {
          tool_name: "Bash",
          tool_input: { command },
          cwd: directory,
        },
        timeoutMs,
      );

      // OpenCode's tool.execute.before has no allow-with-context channel, so the
      // non-prod-read "additionalContext" reminder is intentionally ignored here;
      // only an explicit deny blocks the command.
      const decision = result?.hookSpecificOutput?.permissionDecision;
      if (decision === "deny") {
        const reason =
          result.hookSpecificOutput.permissionDecisionReason ||
          "Kubernetes command blocked by kube-context-guard (no explicit --context).";
        throw new Error(reason);
      }
    },
  };
};

export const KubeContextGuard = plugin;
export const server = plugin;

export default plugin;
