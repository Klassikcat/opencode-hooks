import { spawn } from "node:child_process";
import { STATUS_FAILED, STATUS_SUCCESS, STATUS_TIMEOUT } from "./base.js";

export function normalizeOutput(stdout) {
  const text = stdout.trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
    return parsed.result ?? parsed.output ?? parsed.response ?? parsed.message ?? JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

export function runProcess({ provider, command, args, stdin, timeoutMs, env, output = normalizeOutput }) {
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ name: provider, durationMs: Date.now() - started, ...result });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ status: STATUS_TIMEOUT, output: stdout.trim(), error: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish({ status: STATUS_FAILED, output: stdout.trim(), error: error.message });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      if (code === 0) {
        finish({ status: STATUS_SUCCESS, output: output(stdout) });
        return;
      }

      finish({
        status: STATUS_FAILED,
        output: stdout.trim(),
        error: stderr.trim() || `Process exited with code ${code}${signal ? ` (${signal})` : ""}`,
      });
    });

    if (stdin && child.stdin) child.stdin.end(stdin);
  });
}
