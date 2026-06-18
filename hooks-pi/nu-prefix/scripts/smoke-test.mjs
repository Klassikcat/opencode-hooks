// Type-check smoke test for the nu-prefix pi extension.
//
// nu-prefix is TypeScript, so there is no `node --check` equivalent. When a
// TypeScript compiler is available we type-check it with `tsc --noEmit`; when it
// is not installed we skip gracefully (exit 0) so the check does not fail purely
// because of a missing toolchain.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFile = path.join(here, "..", "nu-prefix.ts");

const result = spawnSync(
  "tsc",
  ["--noEmit", "--strict", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", sourceFile],
  { encoding: "utf8" },
);

if (result.error && result.error.code === "ENOENT") {
  console.log("SKIPPED: typescript not installed (tsc not on PATH)");
  process.exit(0);
}

if (result.status !== 0) {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  throw new Error(`tsc --noEmit failed for nu-prefix.ts (exit ${result.status})`);
}

console.log("nu-prefix type-check passed");
