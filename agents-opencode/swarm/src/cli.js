import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { generateReport } from "./compare.js";
import { ClaudeAdapter } from "./providers/claude.js";
import { CodexAdapter } from "./providers/codex.js";
import { GeminiAdapter } from "./providers/gemini.js";

const USAGE = "Usage: node src/cli.js --prompt <text> [--review-target <path>] [--timeout <ms>]";

export async function main(args = process.argv.slice(2)) {
  const promptIdx = args.indexOf("--prompt");
  if (promptIdx === -1 || promptIdx + 1 >= args.length) {
    console.error(USAGE);
    process.exit(1);
  }

  const prompt = args[promptIdx + 1];
  const reviewContent = readReviewTarget(args);
  const timeoutMs = readTimeout(args);
  const adapters = [
    new ClaudeAdapter({ timeoutMs }),
    new CodexAdapter({ timeoutMs }),
    new GeminiAdapter({ timeoutMs })
  ];

  const start = Date.now();
  const settled = await settleAdapters(adapters, prompt, reviewContent);
  const durationMs = Date.now() - start;
  const results = settled.map((settledResult, index) => normalizeResult(settledResult, adapters[index], durationMs));
  const report = generateReport(results);
  const anySuccess = results.some((result) => result.status === "success");

  console.log(report);
  process.exit(anySuccess ? 0 : 1);
}

function readReviewTarget(args) {
  const targetIdx = args.indexOf("--review-target");
  if (targetIdx === -1 || targetIdx + 1 >= args.length) {
    return null;
  }

  const targetPath = args[targetIdx + 1];
  if (!existsSync(targetPath)) {
    console.error(`Error: review target file not found: ${targetPath}`);
    process.exit(1);
  }

  return readFileSync(targetPath, "utf8");
}

function readTimeout(args) {
  const timeoutIdx = args.indexOf("--timeout");
  const rawTimeout = timeoutIdx !== -1 && timeoutIdx + 1 < args.length
    ? args[timeoutIdx + 1]
    : process.env.SWARM_TIMEOUT_MS || "30000";

  return parseInt(rawTimeout, 10);
}

async function settleAdapters(adapters, prompt, reviewContent) {
  const recoverableAdapterErrors = [];
  const onUncaughtException = (error) => {
    recoverableAdapterErrors.push(error);
  };

  process.prependListener("uncaughtException", onUncaughtException);
  try {
    const settled = await Promise.allSettled(adapters.map((adapter) => adapter.execute(prompt, reviewContent)));

    if (recoverableAdapterErrors.length === 0) {
      return settled;
    }

    return settled.map((settledResult) => settledResult.status === "fulfilled" && settledResult.value.output
      ? settledResult
      : { status: "rejected", reason: recoverableAdapterErrors[0] });
  } finally {
    process.removeListener("uncaughtException", onUncaughtException);
  }
}

function normalizeResult(settledResult, adapter, durationMs) {
  if (settledResult.status === "fulfilled") {
    const result = settledResult.value;
    return {
      name: result.provider || adapter.name,
      status: result.status,
      output: result.output || "",
      error: result.error || "",
      durationMs: result.durationMs || durationMs
    };
  }

  return {
    name: adapter.name,
    status: "failed",
    output: "",
    error: settledResult.reason?.message || String(settledResult.reason),
    durationMs
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
