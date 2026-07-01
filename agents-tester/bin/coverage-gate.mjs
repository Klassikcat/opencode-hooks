#!/usr/bin/env node
import path from "node:path";
import { readBaseline, writeBaseline } from "../lib/baseline.mjs";
import { CoverageNotFound, parseCoverage } from "../lib/coverage.mjs";
import { loadConfig } from "../lib/config.mjs";
import { detectProject } from "../lib/detect.mjs";
import { runCommand } from "../lib/run.mjs";

const METRICS = ["lines", "branches", "functions", "statements"];

function parseArgs(argv) {
  const opts = { cwd: process.cwd(), json: false, updateBaseline: false, run: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") {
      opts.cwd = argv[index + 1];
      index += 1;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--update-baseline") {
      opts.updateBaseline = true;
    } else if (arg === "--run") {
      opts.run = true;
    } else if (arg === "--no-run") {
      opts.run = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function resolveMaybeRelative(cwd, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function emitJson(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function humanStatus(result) {
  if (result.status === "skipped") return `SKIPPED: ${result.reason}`;
  if (result.status === "pass") return "PASS: coverage gate passed";
  const failures = result.failures.map((failure) => `${failure.metric}/${failure.rule}`).join(", ");
  return `FAIL: coverage gate failed (${failures})`;
}

function thresholdFailures(metrics, thresholds) {
  const failures = [];
  for (const metric of METRICS) {
    const actual = metrics[metric];
    const required = thresholds[metric];
    if (actual === null || required === null || required === undefined) continue;
    if (actual < required) failures.push({ metric, rule: "threshold", actual, required });
  }
  return failures;
}

function regressionFailures(metrics, baseline, tolerance) {
  const failures = [];
  if (!baseline) return failures;
  for (const metric of METRICS) {
    const actual = metrics[metric];
    const previous = baseline[metric];
    if (actual === null || previous === null || previous === undefined) continue;
    const required = previous - tolerance;
    if (actual < required) failures.push({ metric, rule: "regression", actual, required });
  }
  return failures;
}

async function skipped(reason, opts) {
  const result = {
    status: "skipped",
    metrics: null,
    thresholds: null,
    baseline: null,
    failures: [],
    reason,
  };
  if (opts.json) emitJson(result);
  else console.log(humanStatus(result));
  process.exitCode = 2;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(opts.cwd);
  const config = await loadConfig(cwd);
  const detected = await detectProject(cwd, config);

  if (opts.run && detected.coverageCommand) {
    await runCommand(detected.coverageCommand, cwd, { capture: opts.json });
  }

  if (!detected.coverageFile) {
    await skipped("no coverage file detected", opts);
    return;
  }

  let metrics;
  try {
    metrics = await parseCoverage(resolveMaybeRelative(cwd, detected.coverageFile));
  } catch (error) {
    if (error instanceof CoverageNotFound || error instanceof SyntaxError) {
      await skipped(error.message, opts);
      return;
    }
    await skipped(error instanceof Error ? error.message : String(error), opts);
    return;
  }

  const baselinePath = resolveMaybeRelative(cwd, config.baselineFile);
  if (opts.updateBaseline) {
    await writeBaseline(baselinePath, metrics);
    const result = { status: "pass", metrics, thresholds: config.thresholds, baseline: metrics, failures: [] };
    if (opts.json) emitJson(result);
    else console.log(`PASS: updated coverage baseline at ${baselinePath}`);
    process.exitCode = 0;
    return;
  }

  const baseline = await readBaseline(baselinePath);
  const failures = [
    ...thresholdFailures(metrics, config.thresholds),
    ...(config.allowRegression ? [] : regressionFailures(metrics, baseline, config.regressionTolerancePct)),
  ];
  const result = {
    status: failures.length === 0 ? "pass" : "fail",
    metrics,
    thresholds: config.thresholds,
    baseline,
    failures,
  };

  if (opts.json) emitJson(result);
  else console.log(humanStatus(result));
  process.exitCode = failures.length === 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
