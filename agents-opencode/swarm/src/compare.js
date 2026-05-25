const STATUS_ICONS = {
  success: "✅",
  failed: "❌",
  timeout: "⏱️"
};

const SECRET_LINE_PATTERN = /\b(?:api[_-]?key|api[_-]?token|token|secret|password|credential|auth[_-]?token)\b\s*[:=]/i;

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function redactLine(line) {
  if (!SECRET_LINE_PATTERN.test(line)) {
    return line;
  }

  return line.replace(/([A-Za-z0-9_-]*(?:api[_-]?key|api[_-]?token|token|secret|password|credential|auth[_-]?token)[A-Za-z0-9_-]*\s*[:=]\s*).*/i, "$1[REDACTED]");
}

function redactText(text = "") {
  return text
    .split(/\r?\n/)
    .map((line) => redactLine(line))
    .join("\n");
}

function splitNotableText(text = "") {
  return redactText(text)
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "No response." && !SECRET_LINE_PATTERN.test(line));
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function findConsensus(successfulResults) {
  const phraseProviders = new Map();

  for (const result of successfulResults) {
    const provider = titleCase(result.name);
    const phrases = uniqueValues(splitNotableText(result.output));

    for (const phrase of phrases) {
      if (!phraseProviders.has(phrase)) {
        phraseProviders.set(phrase, new Set());
      }

      phraseProviders.get(phrase).add(provider);
    }
  }

  return [...phraseProviders.entries()]
    .filter(([, providers]) => providers.size >= 2)
    .map(([phrase]) => phrase)
    .sort((left, right) => left.localeCompare(right));
}

function findDifferences(successfulResults, consensus) {
  const consensusSet = new Set(consensus);
  const phraseCounts = new Map();

  for (const result of successfulResults) {
    for (const phrase of uniqueValues(splitNotableText(result.output))) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }

  return successfulResults
    .map((result) => {
      const provider = titleCase(result.name);
      const uniquePhrases = uniqueValues(splitNotableText(result.output))
        .filter((phrase) => !consensusSet.has(phrase) && phraseCounts.get(phrase) === 1);

      return { provider, uniquePhrases };
    })
    .filter(({ uniquePhrases }) => uniquePhrases.length > 0);
}

function renderProviderSection(result) {
  const provider = titleCase(result.name);
  const icon = STATUS_ICONS[result.status] ?? "❔";
  const lines = [
    `## ${provider}`,
    "",
    `${icon} ${result.status}`,
    `Duration: ${result.durationMs}ms`,
    ""
  ];

  const body = result.status === "success" ? redactText(result.output ?? "") : redactText(result.error ?? "");
  lines.push(body.trim() || "No response.");

  return lines.join("\n");
}

function renderConsensus(successfulResults) {
  if (successfulResults.length === 0) {
    return ["### Consensus", "", "No successful results to compare."];
  }

  const consensus = findConsensus(successfulResults);
  if (consensus.length === 0) {
    return ["### Consensus", "", "No consensus found."];
  }

  return ["### Consensus", "", ...consensus.map((phrase) => `- ${phrase}`)];
}

function renderDifferences(successfulResults, consensus) {
  const differences = findDifferences(successfulResults, consensus);
  const lines = ["### Differences", ""];

  if (differences.length === 0) {
    lines.push("No notable differences found.");
    return lines;
  }

  for (const { provider, uniquePhrases } of differences) {
    for (const phrase of uniquePhrases) {
      lines.push(`- ${provider}: ${phrase}`);
    }
  }

  return lines;
}

function renderUnavailable(results) {
  const unavailable = results.filter((result) => result.status !== "success");
  const lines = ["### Unavailable", ""];

  if (unavailable.length === 0) {
    lines.push("All providers returned results.");
    return lines;
  }

  for (const result of unavailable) {
    lines.push(`- ${titleCase(result.name)}: ${result.status}`);
  }

  return lines;
}

function renderSummary(results) {
  const successfulResults = results.filter((result) => result.status === "success");
  const consensus = findConsensus(successfulResults);
  const lines = ["## Summary", ""];

  if (successfulResults.length > 0 && successfulResults.length < results.length) {
    lines.push(`Partial results available: ${successfulResults.length} of ${results.length} providers succeeded.`, "");
  }

  lines.push(
    ...renderConsensus(successfulResults),
    "",
    ...renderDifferences(successfulResults, consensus),
    "",
    ...renderUnavailable(results)
  );

  return lines.join("\n");
}

export function generateReport(results) {
  return [
    ...results.map((result) => renderProviderSection(result)),
    renderSummary(results)
  ].join("\n\n");
}
