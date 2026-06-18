import { STATUS_SUCCESS } from "./providers/base.js";

const TITLE = {
  claude: "Claude Code",
  pi: "Pi",
  codex: "Codex",
  gemini: "Gemini",
};

function sectionFor(result) {
  const title = TITLE[result.name] ?? result.name;
  const status = result.status.toUpperCase();
  const error = result.error ? `\n\nError: ${result.error}` : "";
  const output = result.output || "(no output)";
  return `## ${title}\n\nStatus: ${status}\nDuration: ${result.durationMs}ms\n\n${output}${error}`;
}

function summarize(results) {
  const successful = results.filter((result) => result.status === STATUS_SUCCESS).map((result) => result.name);
  const unavailable = results.filter((result) => result.status !== STATUS_SUCCESS).map((result) => result.name);

  const lines = ["## Summary", ""];
  lines.push(`Successful providers: ${successful.length ? successful.join(", ") : "none"}`);
  lines.push(`Unavailable providers: ${unavailable.length ? unavailable.join(", ") : "none"}`);
  lines.push("");

  if (successful.length >= 2) {
    lines.push("Compare the provider sections above for consensus and disagreements before acting on any single recommendation.");
  } else if (successful.length === 1) {
    lines.push("Only one provider returned successfully; treat the result as a single-model opinion, not consensus.");
  } else {
    lines.push("No provider returned successfully; fix CLI availability, authentication, or timeout configuration first.");
  }

  return lines.join("\n");
}

export function formatReport({ role, prompt, targetPath, results }) {
  const header = [
    "# OMC ACP Bridge Report",
    "",
    `Role: ${role}`,
    `Providers: ${results.map((result) => result.name).join(", ")}`,
    targetPath ? `Review target: ${targetPath}` : null,
    "",
    "## Prompt",
    "",
    prompt,
  ].filter((line) => line !== null).join("\n");

  return `${header}\n\n${results.map(sectionFor).join("\n\n")}\n\n${summarize(results)}\n`;
}
