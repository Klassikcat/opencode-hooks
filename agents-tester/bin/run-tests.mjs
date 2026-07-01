#!/usr/bin/env node
import path from "node:path";
import { detectProject } from "../lib/detect.mjs";
import { loadConfig } from "../lib/config.mjs";
import { runCommand } from "../lib/run.mjs";

const TAIL_LIMIT = 8192;

function parseArgs(argv) {
  const opts = { cwd: process.cwd(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") {
      opts.cwd = argv[index + 1];
      index += 1;
    } else if (arg === "--json") {
      opts.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function tail(text) {
  return text.length > TAIL_LIMIT ? text.slice(-TAIL_LIMIT) : text;
}

function emitJson(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(opts.cwd);
  const config = await loadConfig(cwd);
  const detected = await detectProject(cwd, config);

  if (!detected.testCommand) {
    const result = { status: "skipped", command: null, exitCode: null, stdout: "", stderr: "" };
    if (opts.json) emitJson(result);
    else console.log("SKIPPED: no test command detected");
    process.exitCode = 2;
    return;
  }

  const run = await runCommand(detected.testCommand, cwd, { capture: opts.json });
  const status = run.exitCode === 0 ? "pass" : "fail";
  const result = {
    status,
    command: detected.testCommand,
    exitCode: run.exitCode,
    stdout: tail(run.stdout),
    stderr: tail(run.stderr),
  };

  if (opts.json) emitJson(result);
  else console.log(`${status.toUpperCase()}: ${detected.testCommand} (exit ${run.exitCode})`);
  process.exitCode = run.exitCode === 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
