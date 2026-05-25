import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { decideAction } from "./decision.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "trufflehog-guard.py");

const HOME = os.homedir();
const WELL_KNOWN_PATHS = [
  path.join(HOME, ".ssh"),
  path.join(HOME, ".aws", "credentials"),
  path.join(HOME, ".aws", "config"),
  path.join(HOME, ".config", "gcloud"),
  path.join(HOME, ".docker", "config.json"),
  path.join(HOME, ".netrc"),
  path.join(HOME, ".pgpass"),
  path.join(HOME, ".kube", "config"),
  path.join(HOME, ".npmrc"),
  path.join(HOME, ".pypirc"),
];

function matchesWellKnown(filePath) {
  const resolved = path.resolve(filePath);
  for (const known of WELL_KNOWN_PATHS) {
    if (resolved === known) {
      return `well-known sensitive file: ${known}`;
    }
    try {
      if (resolved.startsWith(known + path.sep)) {
        return `inside well-known sensitive directory: ${known}`;
      }
    } catch {}
  }
  return null;
}

function scriptPathFrom(options) {
  return options.scriptPath || process.env.OPENCODE_TRUFFLEHOG_GUARD_SCRIPT || DEFAULT_SCRIPT;
}

function readPathFrom(args) {
  return args?.filePath || args?.file_path || args?.path;
}

function runHook(scriptPath, payload, timeoutMs) {
  return new Promise((resolve) => {
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
        resolve({
          findings: [],
          wellKnown: null,
          timeout: true,
          scannerMissing: false,
          filePath: readPathFrom(payload?.tool_input) || "",
        });
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

function outputFor(decision) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
    },
  };
}

function scanPayload(filePath, directory) {
  return {
    tool_name: "Read",
    tool_input: { file_path: filePath },
    cwd: directory,
  };
}

async function decideRead(scriptPath, filePath, directory, timeoutMs, scannerOverride) {
  // Check well-known paths first (in JS, not just in Python)
  const wellKnown = matchesWellKnown(filePath);
  if (wellKnown) {
    return decideAction(
      { findings: [], wellKnown, timeout: false, scannerMissing: false },
      filePath,
    );
  }

  let result;
  if (scannerOverride) {
    result = await scannerOverride(filePath);
  } else {
    result = await runHook(scriptPath, scanPayload(filePath, directory), timeoutMs);
  }
  const decisionPath = result?.filePath || filePath;
  return decideAction(
    {
      findings: result?.findings || [],
      wellKnown: result?.wellKnown || null,
      timeout: Boolean(result?.timeout),
      scannerMissing: Boolean(result?.scannerMissing),
    },
    decisionPath,
  );
}

async function runClaudeCodeCliMode() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.stdout.write(JSON.stringify(outputFor("deny")));
    return;
  }
  const toolName = payload?.tool_name;
  const filePath = payload?.tool_input?.file_path;

  if (toolName !== "Read" || !filePath) {
    process.stdout.write(JSON.stringify(outputFor("allow")));
    return;
  }

  const scriptPath = scriptPathFrom({});
  const timeoutMs = Number(process.env.OPENCODE_TRUFFLEHOG_GUARD_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const result = await decideRead(scriptPath, filePath, payload?.cwd || process.cwd(), timeoutMs);
  process.stdout.write(JSON.stringify(outputFor(result.decision)));
}

if (process.env.CLAUDE_CODE_HOOK === "1") {
  await runClaudeCodeCliMode();
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

      const result = await decideRead(scriptPath, filePath, directory, timeoutMs, options.scanner);
      if (result.decision === "deny") {
        throw new Error(`deny: ${result.reason || `Read of '${filePath}' blocked by trufflehog-guard.`}`);
      }
      if (result.decision === "ask") {
        throw new Error(`ask: ${result.reason || `Read of '${filePath}' requires confirmation.`}`);
      }
    },
  };
};

export const TrufflehogGuard = plugin;
export const server = plugin;

export default plugin;
