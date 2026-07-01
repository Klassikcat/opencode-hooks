import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const METRICS = ["lines", "branches", "functions", "statements"];

export class CoverageNotFound extends Error {
  constructor(filePath) {
    super(`Coverage report not found: ${filePath}`);
    this.name = "CoverageNotFound";
    this.filePath = filePath;
  }
}

function pct(covered, total) {
  return total > 0 ? (covered / total) * 100 : null;
}

function emptyMetrics() {
  return { lines: null, branches: null, functions: null, statements: null };
}

function parseJsonSummary(report) {
  if (!report?.total) return null;
  const metrics = emptyMetrics();
  let matched = false;
  for (const key of METRICS) {
    const value = report.total[key]?.pct;
    if (typeof value === "number") {
      metrics[key] = value;
      matched = true;
    }
  }
  return matched ? metrics : null;
}

function countMap(map) {
  if (!map || typeof map !== "object") return { total: 0, covered: 0 };
  const values = Object.values(map);
  return {
    total: values.length,
    covered: values.filter((value) => Number(value) > 0).length,
  };
}

function countBranches(branches) {
  if (!branches || typeof branches !== "object") return { total: 0, covered: 0 };
  let total = 0;
  let covered = 0;
  for (const values of Object.values(branches)) {
    if (!Array.isArray(values)) continue;
    total += values.length;
    covered += values.filter((value) => Number(value) > 0).length;
  }
  return { total, covered };
}

function addCounts(target, source) {
  target.total += source.total;
  target.covered += source.covered;
}

function parseIstanbulFinal(report) {
  if (!report || typeof report !== "object" || report.total) return null;
  const statements = { total: 0, covered: 0 };
  const branches = { total: 0, covered: 0 };
  const functions = { total: 0, covered: 0 };
  let matched = false;

  for (const fileCoverage of Object.values(report)) {
    if (!fileCoverage || typeof fileCoverage !== "object") continue;
    if (fileCoverage.s || fileCoverage.b || fileCoverage.f) matched = true;
    addCounts(statements, countMap(fileCoverage.s));
    addCounts(branches, countBranches(fileCoverage.b));
    addCounts(functions, countMap(fileCoverage.f));
  }

  if (!matched) return null;
  const statementsPct = pct(statements.covered, statements.total);
  return {
    lines: statementsPct,
    branches: pct(branches.covered, branches.total),
    functions: pct(functions.covered, functions.total),
    statements: statementsPct,
  };
}

function parsePythonCoverage(report) {
  const totals = report?.totals;
  if (!totals || typeof totals.percent_covered !== "number") return null;
  return {
    lines: totals.percent_covered,
    branches: Number(totals.num_branches ?? 0) > 0 ? totals.percent_covered : null,
    functions: null,
    statements: null,
  };
}

function parseJsonCoverage(text) {
  const report = JSON.parse(text);
  return parseJsonSummary(report) ?? parseIstanbulFinal(report) ?? parsePythonCoverage(report);
}

function parseLcov(text) {
  const totals = {
    LF: 0,
    LH: 0,
    BRF: 0,
    BRH: 0,
    FNF: 0,
    FNH: 0,
  };
  let matched = false;
  for (const line of text.split(/\r?\n/)) {
    const match = /^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/.exec(line.trim());
    if (!match) continue;
    matched = true;
    totals[match[1]] += Number(match[2]);
  }
  if (!matched) return null;
  return {
    lines: pct(totals.LH, totals.LF),
    branches: pct(totals.BRH, totals.BRF),
    functions: pct(totals.FNH, totals.FNF),
    statements: null,
  };
}

export async function parseCoverage(absPath) {
  if (!existsSync(absPath)) throw new CoverageNotFound(absPath);
  const text = await readFile(absPath, "utf8");
  try {
    const parsed = parseJsonCoverage(text);
    if (parsed) return parsed;
  } catch {
    // Fall through to lcov sniffing.
  }
  const lcov = parseLcov(text);
  if (lcov) return lcov;
  throw new Error(`Unsupported coverage report format: ${absPath}`);
}
