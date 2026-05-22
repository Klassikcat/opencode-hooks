import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "trufflehog-guard.py");

function scriptPathFrom(options) {
  return options.scriptPath || process.env.OPENCODE_TRUFFLEHOG_GUARD_SCRIPT || DEFAULT_SCRIPT;
}

function readPathFrom(args) {
  return args?.filePath || args?.file_path || args?.path;
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
  const timeoutMs = Number(options.timeoutMs || process.env.OPENCODE_TRUFFLEHOG_GUARD_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool || "").toLowerCase();
      if (tool !== "read") return;

      const filePath = readPathFrom(output?.args);
      if (!filePath) return;

      const result = await runHook(
        scriptPath,
        {
          tool_name: "Read",
          tool_input: { file_path: filePath },
          cwd: directory,
        },
        timeoutMs,
      );

      const decision = result?.hookSpecificOutput?.permissionDecision;
      if (decision === "deny") {
        const reason =
          result.hookSpecificOutput.permissionDecisionReason ||
          `Read of '${filePath}' blocked by trufflehog-guard.`;
        throw new Error(reason);
      }
    },
  };
};

export const TrufflehogGuard = plugin;
export const server = plugin;

export default plugin;
