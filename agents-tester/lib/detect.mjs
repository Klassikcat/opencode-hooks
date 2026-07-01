import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const COVERAGE_TOOLS = [
  ["c8", "npx c8 --reporter=json-summary --reporter=text npm test"],
  ["vitest", "npx vitest run --coverage --coverage.reporter=json-summary"],
  ["jest", "npx jest --coverage --coverageReporters=json-summary"],
  ["nyc", "npx nyc --reporter=json-summary npm test"],
];

const PYTHON_MARKERS = ["pyproject.toml", "pytest.ini", "setup.cfg", "tox.ini"];

function override(rc, key, fallback) {
  const explicitKeys = Array.isArray(rc.__explicitKeys) ? rc.__explicitKeys : null;
  const isExplicit = explicitKeys ? explicitKeys.includes(key) : Object.hasOwn(rc, key);
  return isExplicit ? rc[key] : fallback;
}

async function readPackageJson(cwd) {
  try {
    return JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function dependenciesOf(pkg) {
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
}

function applyOverrides(detected, rc = {}) {
  return {
    testCommand: override(rc, "testCommand", detected.testCommand),
    coverageCommand: override(rc, "coverageCommand", detected.coverageCommand),
    coverageFile: override(rc, "coverageFile", detected.coverageFile),
    ecosystem: override(rc, "ecosystem", detected.ecosystem),
  };
}

async function detectNode(cwd) {
  const pkg = await readPackageJson(cwd);
  if (!pkg) return null;

  const deps = dependenciesOf(pkg);
  let coverageCommand = null;
  let coverageFile = null;
  for (const [name, command] of COVERAGE_TOOLS) {
    if (Object.hasOwn(deps, name)) {
      coverageCommand = command;
      coverageFile = "coverage/coverage-summary.json";
      break;
    }
  }

  return {
    testCommand: pkg.scripts?.test ? "npm test" : null,
    coverageCommand,
    coverageFile,
    ecosystem: "node",
  };
}

function detectPython(cwd) {
  if (!PYTHON_MARKERS.some((marker) => existsSync(path.join(cwd, marker)))) return null;
  return {
    testCommand: "pytest",
    coverageCommand: "pytest --cov --cov-report=json",
    coverageFile: "coverage.json",
    ecosystem: "python",
  };
}

export async function detectProject(cwd, rc = {}) {
  const absCwd = path.resolve(cwd);
  const detected =
    (await detectNode(absCwd)) ??
    detectPython(absCwd) ??
    { testCommand: null, coverageCommand: null, coverageFile: null, ecosystem: null };

  return applyOverrides(detected, rc);
}
