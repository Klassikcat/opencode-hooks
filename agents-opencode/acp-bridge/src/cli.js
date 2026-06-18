#!/usr/bin/env node
import fs from "node:fs/promises";
import { runBridge, formatBridgeResult } from "./bridge.js";

function usage() {
  return `Usage:
  node src/cli.js --role <prometheus|atlas|sisyphus> --prompt <text> [--review-target <file>] [--providers claude,pi,codex,gemini] [--timeout <ms>]
  node src/cli.js --role <prometheus|atlas|sisyphus> --prompt-file <file> [--review-target <file>]

Defaults:
  role      -> atlas
  providers -> claude,pi,codex,gemini

Environment overrides:
  OMC_ACP_CLAUDE_PATH / OMC_ACP_CLAUDE_ARGS
  OMC_ACP_PI_PATH     / OMC_ACP_PI_ARGS
  OMC_ACP_CODEX_PATH  / OMC_ACP_CODEX_ARGS
  OMC_ACP_GEMINI_PATH / OMC_ACP_GEMINI_ARGS
  OMC_ACP_TIMEOUT_MS
`;
}

function parseArgs(argv) {
  const args = { role: "atlas" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--role") args.role = argv[++i];
    else if (arg === "--prompt") args.prompt = argv[++i];
    else if (arg === "--prompt-file") args.promptFile = argv[++i];
    else if (arg === "--review-target" || arg === "--target") args.targetPath = argv[++i];
    else if (arg === "--providers") args.providers = argv[++i];
    else if (arg === "--timeout") args.timeoutMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }

  const prompt = args.promptFile ? await fs.readFile(args.promptFile, "utf8") : args.prompt;
  if (!prompt) throw new Error(`--prompt or --prompt-file is required\n\n${usage()}`);

  const result = await runBridge({
    role: args.role,
    prompt,
    targetPath: args.targetPath,
    providers: args.providers,
    timeoutMs: args.timeoutMs,
  });
  process.stdout.write(formatBridgeResult(result));
  return result.results.some((providerResult) => providerResult.status === "success") ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
