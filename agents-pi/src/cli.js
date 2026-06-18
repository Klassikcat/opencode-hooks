#!/usr/bin/env node
import fs from "node:fs/promises";
import { formatResult, formatWorkflow, runRole, runWorkflow } from "./orchestrator.js";

function usage() {
  return `Usage:
  node src/cli.js --role <orchestration|planning|review> --prompt <text> [--target <file>] [--provider <name>] [--timeout <ms>]
  node src/cli.js --workflow omo --prompt <text> [--target <file>] [--timeout <ms>]

Defaults:
  orchestration -> opencode
  planning      -> claude
  review        -> codex
`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--role") args.role = argv[++i];
    else if (arg === "--workflow") args.workflow = argv[++i];
    else if (arg === "--prompt") args.prompt = argv[++i];
    else if (arg === "--prompt-file") args.promptFile = argv[++i];
    else if (arg === "--target" || arg === "--review-target") args.targetPath = argv[++i];
    else if (arg === "--provider") args.providerName = argv[++i];
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

  if (args.workflow) {
    if (args.workflow !== "omo") throw new Error(`Unknown workflow: ${args.workflow}`);
    const result = await runWorkflow({ prompt, targetPath: args.targetPath, timeoutMs: args.timeoutMs });
    process.stdout.write(formatWorkflow(result));
    return result.planning.status === "success" || result.review.status === "success" ? 0 : 1;
  }

  if (!args.role) throw new Error(`--role is required unless --workflow is used\n\n${usage()}`);
  const result = await runRole({
    role: args.role,
    prompt,
    targetPath: args.targetPath,
    providerName: args.providerName,
    timeoutMs: args.timeoutMs,
  });
  process.stdout.write(`${formatResult(result)}\n`);
  return result.status === "success" ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
