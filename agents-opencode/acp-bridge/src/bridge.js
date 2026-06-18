import fs from "node:fs/promises";
import { DEFAULT_PROVIDERS, createProvider } from "./providers/index.js";
import { buildRolePrompt, ROLES } from "./prompts.js";
import { formatReport } from "./report.js";

function parseProviderList(value) {
  if (!value) return DEFAULT_PROVIDERS;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export async function buildRequest({ role = "atlas", prompt, targetPath }) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
  if (!prompt) throw new Error("prompt is required");

  const targetContent = targetPath ? await fs.readFile(targetPath, "utf8") : "";
  return {
    role,
    rawPrompt: prompt,
    targetPath,
    prompt: buildRolePrompt({ role, prompt, targetPath, targetContent }),
  };
}

export async function runBridge({ role = "atlas", prompt, targetPath, providers, timeoutMs, providerFactory = createProvider }) {
  const providerNames = parseProviderList(providers);
  const request = await buildRequest({ role, prompt, targetPath });
  const instances = providerNames.map((name) => providerFactory(name, { timeoutMs }));
  const results = await Promise.all(instances.map((provider) => provider.execute(request)));
  return { request, results };
}

export function formatBridgeResult({ request, results }) {
  return formatReport({
    role: request.role,
    prompt: request.rawPrompt,
    targetPath: request.targetPath,
    results,
  });
}
