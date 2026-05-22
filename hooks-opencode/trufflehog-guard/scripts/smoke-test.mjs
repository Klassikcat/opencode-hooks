import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { plugin } from "../index.js";

const tempDir = await mkdtemp(path.join(tmpdir(), "opencode-trufflehog-guard-"));

try {
  const safeFile = path.join(tempDir, "safe.txt");
  await writeFile(safeFile, "safe smoke test content\n", "utf8");

  const instance = await plugin({ directory: tempDir });
  await instance["tool.execute.before"]({ tool: "Read" }, { args: { filePath: safeFile } });

  let denied = false;
  try {
    await instance["tool.execute.before"](
      { tool: "Read" },
      { args: { filePath: path.join(process.env.HOME || "", ".ssh", "nonexistent-private-key") } },
    );
  } catch (error) {
    denied = String(error?.message || error).includes("blocked");
  }

  if (!denied) {
    throw new Error("Expected well-known sensitive path to be denied");
  }

  console.log("trufflehog guard smoke test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
