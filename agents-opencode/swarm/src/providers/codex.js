import { spawn } from "node:child_process";
import {
  DEFAULT_TIMEOUT_MS,
  ProviderAdapter,
  STATUS_FAILED,
  STATUS_SUCCESS,
  STATUS_TIMEOUT
} from "./base.js";

export class CodexAdapter extends ProviderAdapter {
  constructor(options = {}) {
    const command = process.env.SWARM_CODEX_PATH || "codex";
    const timeoutMs = process.env.SWARM_CODEX_TIMEOUT_MS
      ? Number(process.env.SWARM_CODEX_TIMEOUT_MS)
      : options.timeoutMs || DEFAULT_TIMEOUT_MS;

    super({ ...options, command, timeoutMs });
  }

  get name() {
    return "codex";
  }

  async execute(prompt, reviewTarget) {
    const fullPrompt = reviewTarget
      ? `Review target:\n${reviewTarget}\n\nPrompt:\n${prompt}`
      : prompt;
    const args = ["exec", fullPrompt, "--json", "--sandbox", "read-only"];

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
          events: [],
          stderr: "",
          exitCode: null,
          error: `Failed to spawn ${this.command}: ${err.message}`
        });
        return;
      }
      const events = [];
      let stdoutBuffer = "";
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
          events: [],
          stderr: "",
          exitCode: null,
          error: `Failed to spawn ${this.command}: ${err.message}`
        });
      });

      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            events.push(JSON.parse(line));
          }
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (exitCode) => {
        clearTimeout(timeout);

        if (stdoutBuffer.trim()) {
          events.push(JSON.parse(stdoutBuffer));
        }

        const output = getOutput(events);

        if (timedOut) {
          resolve({
            provider: this.name,
            status: STATUS_TIMEOUT,
            output,
            events,
            stderr,
            exitCode,
            error: `codex timed out after ${this.timeoutMs}ms`
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            provider: this.name,
            status: STATUS_FAILED,
            output,
            events,
            stderr,
            exitCode,
            error: stderr
          });
          return;
        }

        resolve({
          provider: this.name,
          status: STATUS_SUCCESS,
          output,
          events,
          stderr,
          exitCode
        });
      });
    });
  }
}

function getOutput(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (Object.prototype.hasOwnProperty.call(events[index], "result")) {
      return events[index].result;
    }
  }

  const lastEvent = events[events.length - 1];
  return lastEvent && Object.prototype.hasOwnProperty.call(lastEvent, "content")
    ? lastEvent.content
    : "";
}
