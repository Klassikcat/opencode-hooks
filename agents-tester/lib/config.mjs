import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_CONFIG = {
  testCommand: null,
  coverageCommand: null,
  coverageFile: null,
  thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
  baselineFile: ".tester/coverage-baseline.json",
  allowRegression: false,
  regressionTolerancePct: 0.0,
};

function mergeConfig(raw, explicitKeys = []) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(raw.thresholds ?? {}),
    },
    __explicitKeys: explicitKeys,
  };
}

export async function loadConfig(cwd) {
  const filePath = path.join(cwd, ".testerrc.json");
  if (!existsSync(filePath)) return mergeConfig({}, []);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  return mergeConfig(raw, Object.keys(raw));
}
