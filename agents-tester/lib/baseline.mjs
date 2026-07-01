import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readBaseline(absPath) {
  if (!existsSync(absPath)) return null;
  return JSON.parse(await readFile(absPath, "utf8"));
}

export async function writeBaseline(absPath, metrics) {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(metrics, null, 2)}\n`);
}
