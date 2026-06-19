// hooks-pi/kube-context-guard/kube-context-guard.pi.js
//
// pi (oh-my-pi / OMP) extension: blocks `bash` tool calls that run kubectl/helm
// against an ambient kube context (no explicit --context) for write/prod
// operations. It reuses the SAME Python core as the OpenCode plugin
// (../../hooks-opencode/kube-context-guard/kube-context-guard.py) so the
// detection logic stays single-sourced — this file is only the pi adapter.
//
// pi contract used:
//   pi.on("tool_call", (event) => ...) where event.toolName === "bash" and
//   event.input.command is the command string; returning { block: true, reason }
//   blocks the call (mirrors hooks-pi/completion-gate's yield gate).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TIMEOUT_MS = 20_000;

// Resolve the shared Python core. First match wins:
//   1. $OPENCODE_KUBE_GUARD_SCRIPT
//   2. kube-context-guard.py copied next to this extension (recommended install)
//   3. the repo's hooks-opencode core (dev / monorepo layout)
const SCRIPT_CANDIDATES = [
  process.env.OPENCODE_KUBE_GUARD_SCRIPT,
  path.join(HERE, "kube-context-guard.py"),
  path.join(HERE, "..", "..", "hooks-opencode", "kube-context-guard", "kube-context-guard.py"),
].filter(Boolean);

function resolveScript() {
  for (const candidate of SCRIPT_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function runHook(scriptPath, payload, timeoutMs) {
  return new Promise((resolve) => {
    const proc = spawn("python3", [scriptPath, "check"], { stdio: ["pipe", "pipe", "pipe"] });
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

export default function kubeContextGuard(pi) {
  pi.setLabel?.("kube context guard");

  const scriptPath = resolveScript();
  const timeoutMs = Number(process.env.OPENCODE_KUBE_GUARD_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!scriptPath) {
    console.warn(
      "[kube-context-guard] Python core not found; guard disabled. " +
        "Set OPENCODE_KUBE_GUARD_SCRIPT or copy kube-context-guard.py next to this extension.",
    );
  }

  pi.on("tool_call", async (event) => {
    if (!scriptPath) return;
    if (event?.toolName !== "bash") return;

    const command = event.input?.command;
    if (!command || typeof command !== "string") return;

    const result = await runHook(
      scriptPath,
      { tool_name: "Bash", tool_input: { command } },
      timeoutMs,
    );

    // pi's tool_call gate is block-or-allow; the non-prod-read "additionalContext"
    // reminder has no surface here, so only an explicit deny blocks.
    const decision = result?.hookSpecificOutput?.permissionDecision;
    if (decision === "deny") {
      const reason =
        result.hookSpecificOutput.permissionDecisionReason ||
        "Kubernetes command blocked by kube-context-guard (no explicit --context).";
      return { block: true, reason };
    }
  });
}
