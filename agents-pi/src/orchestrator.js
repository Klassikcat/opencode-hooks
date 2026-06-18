import fs from "node:fs/promises";
import { DEFAULT_ROLE_PROVIDER, createProvider } from "./providers/index.js";
import { STATUS_SUCCESS } from "./providers/base.js";
import { buildRolePrompt } from "./prompts.js";

export const ROLES = ["orchestration", "planning", "review"];

export async function buildRequest({ role, prompt, targetPath }) {
  if (!prompt) throw new Error("prompt is required");
  let targetContent = "";
  if (targetPath) {
    targetContent = await fs.readFile(targetPath, "utf8");
  }
  return {
    role,
    prompt: buildRolePrompt({ role, prompt, targetContent, targetPath }),
    rawPrompt: prompt,
    targetPath,
  };
}

export async function runRole({ role, prompt, targetPath, providerName, timeoutMs, provider }) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
  const selectedProvider = provider ?? createProvider(providerName ?? DEFAULT_ROLE_PROVIDER[role], { timeoutMs });
  const request = await buildRequest({ role, prompt, targetPath });
  return selectedProvider.execute(request);
}

export async function runWorkflow({ prompt, targetPath, timeoutMs, providers = {} }) {
  const planning = await runRole({
    role: "planning",
    prompt,
    targetPath,
    timeoutMs,
    provider: providers.planning,
  });

  const reviewInput = planning.status === STATUS_SUCCESS
    ? `${prompt}\n\n## Planning Result\n${planning.output}`
    : `${prompt}\n\nPlanning failed with: ${planning.error ?? planning.output}`;

  const review = await runRole({
    role: "review",
    prompt: reviewInput,
    targetPath,
    timeoutMs,
    provider: providers.review,
  });

  return { planning, review };
}

export function formatResult(result) {
  const status = result.status.toUpperCase();
  const error = result.error ? `\n\nError: ${result.error}` : "";
  return `## ${result.name}\n\nStatus: ${status}\nDuration: ${result.durationMs}ms\n\n${result.output ?? ""}${error}`;
}

export function formatWorkflow(results) {
  return `# OMO Offload Workflow Result\n\n${formatResult(results.planning)}\n\n${formatResult(results.review)}\n`;
}
