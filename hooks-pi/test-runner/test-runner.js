import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function candidatePaths(cwd) {
  const hookDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [];
  if (process.env.TESTER_TOOLKIT_DIR) {
    candidates.push(path.resolve(process.env.TESTER_TOOLKIT_DIR, "bin/run-tests.mjs"));
  }
  candidates.push(path.resolve(hookDir, "agents-tester/bin/run-tests.mjs"));
  candidates.push(path.resolve(cwd, "agents-tester/bin/run-tests.mjs"));
  return candidates;
}

function resolveBin(cwd) {
  const candidates = candidatePaths(cwd);
  return { binPath: candidates.find((candidate) => existsSync(candidate)) ?? null, candidates };
}

function parseResult(stdout) {
  return JSON.parse(stdout.trim());
}

export default function testRunner(pi) {
  pi.setLabel?.("Test Runner");
  const z = pi.zod;

  pi.registerTool({
    name: "run_tests",
    label: "Run Tests",
    description: "Run the project's detected test suite via the tester toolkit and report pass/fail.",
    parameters: z.object({
      cwd: z.string().optional().describe("Project directory to test. Defaults to the current process directory."),
    }),
    async execute(_id, params) {
      const cwd = path.resolve(params?.cwd ?? process.cwd());
      const { binPath, candidates } = resolveBin(cwd);
      if (!binPath) {
        return {
          content: [
            {
              type: "text",
              text: `tester toolkit not found; probed ${candidates.join(", ")}; set TESTER_TOOLKIT_DIR`,
            },
          ],
          isError: true,
        };
      }

      let stdout = "";
      try {
        const result = await execFileAsync(process.execPath, [binPath, "--cwd", cwd, "--json"]);
        stdout = result.stdout;
      } catch (error) {
        stdout = String(error.stdout ?? "");
      }

      const result = parseResult(stdout);
      return {
        content: [
          {
            type: "text",
            text: `${result.status}: ${result.command} (exit ${result.exitCode})`,
          },
        ],
        details: result,
        isError: result.status === "fail",
      };
    },
  });
}
