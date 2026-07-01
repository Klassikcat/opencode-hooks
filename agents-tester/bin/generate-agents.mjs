#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS } from "../lib/platforms.mjs";

export const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.resolve(packageDir, "..");

function parseMeta(text) {
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(":");
    if (index === -1) throw new Error(`Invalid role meta line: ${line}`);
    meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return meta;
}

export function parseRole(text) {
  if (!text.startsWith("---\n")) throw new Error("Role file must start with shared meta block");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Role file missing closing shared meta delimiter");
  const meta = parseMeta(text.slice(4, end));
  const body = text.slice(end + 5).trimStart();
  if (!meta.id) throw new Error("Role meta requires id");
  if (!body.trim()) throw new Error(`Role ${meta.id} has empty body`);
  return { meta, body };
}

export function renderAgentFile(platform, meta, body) {
  const renderer = PLATFORMS[platform];
  if (!renderer) throw new Error(`Unknown platform: ${platform}`);
  return `${renderer.frontmatter(meta)}\n\n${body.trimEnd()}\n`;
}

export async function targets() {
  const rolesDir = path.join(packageDir, "roles");
  const roleFiles = (await readdir(rolesDir)).filter((file) => file.endsWith(".md")).sort();
  const result = [];
  for (const file of roleFiles) {
    const { meta } = parseRole(await readFile(path.join(rolesDir, file), "utf8"));
    for (const platform of Object.keys(PLATFORMS)) {
      result.push({ platform, id: meta.id, absPath: path.join(repoRoot, PLATFORMS[platform].outPath(meta.id)) });
    }
  }
  return result;
}

async function generatedFiles() {
  const rolesDir = path.join(packageDir, "roles");
  const roleFiles = (await readdir(rolesDir)).filter((file) => file.endsWith(".md")).sort();
  const result = [];
  for (const file of roleFiles) {
    const { meta, body } = parseRole(await readFile(path.join(rolesDir, file), "utf8"));
    for (const platform of Object.keys(PLATFORMS)) {
      const relPath = PLATFORMS[platform].outPath(meta.id);
      result.push({ relPath, content: renderAgentFile(platform, meta, body) });
    }
  }
  return result;
}

async function check() {
  const drifted = [];
  for (const file of await generatedFiles()) {
    const absPath = path.join(repoRoot, file.relPath);
    const current = existsSync(absPath) ? await readFile(absPath, "utf8") : null;
    if (current !== file.content) drifted.push(file.relPath);
  }
  if (drifted.length > 0) {
    for (const file of drifted) console.log(file);
    process.exitCode = 1;
    return;
  }
  console.log("generated agents are up to date");
}

async function writeGenerated() {
  for (const file of await generatedFiles()) {
    const absPath = path.join(repoRoot, file.relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, file.content);
    console.log(file.relPath);
  }
}

async function main() {
  if (process.argv.includes("--check")) await check();
  else await writeGenerated();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
