import { spawn } from "node:child_process";
import {
  DEFAULT_TIMEOUT_MS,
  ProviderAdapter,
  STATUS_FAILED,
  STATUS_SUCCESS,
  STATUS_TIMEOUT
} from "./base.js";

export class ClaudeAdapter extends ProviderAdapter {
  constructor(options = {}) {
    const command = process.env.SWARM_CLAUDE_PATH || "claude";
    const timeoutMs = process.env.SWARM_CLAUDE_TIMEOUT_MS
      ? Number(process.env.SWARM_CLAUDE_TIMEOUT_MS)
      : options.timeoutMs || DEFAULT_TIMEOUT_MS;

    super({ ...options, command, timeoutMs });
  }

  get name() {
    return "claude";
  }

  async execute(prompt, reviewTarget) {
    const fullPrompt = reviewTarget
      ? `Review target:\n${reviewTarget}\n\nPrompt:\n${prompt}`
      : prompt;
    const args = ["-p", fullPrompt, "--output-format", "json", "--max-turns", "0"];

    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(this.command, args, {
          env: { ...process.env, ...this.env },
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (err) {
        resolve({
          provider: this.name,
          status: STATUS_FAILED,
          output: "",
          rawOutput: "",
          parsed: null,
          exitCode: null,
          signal: null,
          error: `Failed to spawn ${this.command}: ${err.message}`
        });
        return;
      }
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          provider: this.name,
          status: STATUS_FAILED,
          output: "",
          rawOutput: "",
          parsed: null,
          exitCode: null,
          signal: null,
          error: `Failed to spawn ${this.command}: ${err.message}`
        });
      });

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (exitCode, signal = null) => {
        clearTimeout(timeout);

        const parsed = parseStdout(stdout);
        const output = parsed ? getOutput(parsed, stdout) : stdout;

        if (timedOut) {
          resolve({
            provider: this.name,
            status: STATUS_TIMEOUT,
            output,
            rawOutput: stdout,
            parsed,
            exitCode,
            signal,
            error: `Claude Code timed out after ${this.timeoutMs}ms`
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            provider: this.name,
            status: STATUS_FAILED,
            output,
            rawOutput: stdout,
            parsed,
            exitCode,
            signal,
            error: stderr
          });
          return;
        }

        resolve({
          provider: this.name,
          status: STATUS_SUCCESS,
          output,
          rawOutput: stdout,
          parsed,
          exitCode,
          signal,
          error: null
        });
      });
    });
  }
}

function parseStdout(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function getOutput(parsed, rawOutput) {
  const extracted = extractText(parsed);
  return extracted === null ? rawOutput : extracted;
}

function extractText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of ["result", "text", "content", "output", "response"]) {
    if (typeof value[key] === "string") {
      return value[key];
    }
  }

  if (Array.isArray(value.parts)) {
    return joinTextParts(value.parts);
  }

  if (Array.isArray(value.candidates)) {
    for (const candidate of value.candidates) {
      const text = extractText(candidate);
      if (text !== null) {
        return text;
      }
    }
  }

  if (value.content && typeof value.content === "object") {
    return extractText(value.content);
  }

  return null;
}

function joinTextParts(parts) {
  const textParts = parts
    .map((part) => extractText(part))
    .filter((part) => part !== null);
  return textParts.length > 0 ? textParts.join("") : null;
}
