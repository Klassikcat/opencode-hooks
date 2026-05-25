import { describe, expect, it } from "vitest";

import { generateReport } from "../src/compare.js";

const successfulResults = [
  {
    name: "claude",
    status: "success",
    output: "Use input validation before saving.\nAdd tests for edge cases.",
    durationMs: 1200
  },
  {
    name: "codex",
    status: "success",
    output: "Use input validation before saving.\nConsider logging failures.",
    durationMs: 900
  },
  {
    name: "gemini",
    status: "success",
    output: "Use input validation before saving.\nDocument the API contract.",
    durationMs: 1500
  }
];

describe("generateReport", () => {
  it("renders provider and summary sections for three successful results", () => {
    const report = generateReport(successfulResults);

    expect(report).toContain("## Claude");
    expect(report).toContain("## Codex");
    expect(report).toContain("## Gemini");
    expect(report).toContain("## Summary");
    expect(report).toContain("### Consensus");
    expect(report).toContain("### Differences");
    expect(report).toContain("### Unavailable");
    expect(report).toContain("✅ success");
    expect(report).toContain("Duration: 1200ms");
  });

  it("shows failed providers and notes partial results", () => {
    const report = generateReport([
      successfulResults[0],
      {
        name: "codex",
        status: "failed",
        error: "process exited with code 1",
        durationMs: 300
      },
      successfulResults[2]
    ]);

    expect(report).toContain("## Codex");
    expect(report).toContain("❌ failed");
    expect(report).toContain("process exited with code 1");
    expect(report).toContain("Partial results available: 2 of 3 providers succeeded.");
    expect(report).toContain("- Codex: failed");
  });

  it("shows all failures and notes no successful results", () => {
    const report = generateReport([
      { name: "claude", status: "failed", error: "missing binary", durationMs: 10 },
      { name: "codex", status: "failed", error: "auth failed", durationMs: 20 },
      { name: "gemini", status: "failed", error: "quota exceeded", durationMs: 30 }
    ]);

    expect(report).toContain("## Claude");
    expect(report).toContain("## Codex");
    expect(report).toContain("## Gemini");
    expect(report).toContain("No successful results to compare.");
    expect(report).toContain("- Claude: failed");
    expect(report).toContain("- Codex: failed");
    expect(report).toContain("- Gemini: failed");
  });

  it("identifies consensus from repeated nontrivial lines", () => {
    const report = generateReport(successfulResults);

    expect(report).toContain("- Use input validation before saving.");
  });

  it("does not invent consensus that is not present", () => {
    const report = generateReport([
      { name: "claude", status: "success", output: "Add a cache layer.", durationMs: 100 },
      { name: "codex", status: "success", output: "Rename the function.", durationMs: 100 },
      { name: "gemini", status: "success", output: "Update the README.", durationMs: 100 }
    ]);

    expect(report).toContain("No consensus found.");
    expect(report).not.toContain("cache layer and rename");
    expect(report).not.toContain("All providers agree");
  });

  it("treats empty output as no response instead of consensus", () => {
    const report = generateReport([
      { name: "claude", status: "success", output: "", durationMs: 100 },
      { name: "codex", status: "success", durationMs: 100 },
      { name: "gemini", status: "success", output: "Use retries for transient errors.", durationMs: 100 }
    ]);

    expect(report).toContain("No response.");
    expect(report).toContain("No consensus found.");
    expect(report).not.toContain("- No response.");
  });

  it("shows timeout results with the timeout status indicator", () => {
    const report = generateReport([
      successfulResults[0],
      { name: "codex", status: "timeout", error: "timed out after 30000ms", durationMs: 30000 },
      successfulResults[2]
    ]);

    expect(report).toContain("## Codex");
    expect(report).toContain("⏱️ timeout");
    expect(report).toContain("timed out after 30000ms");
    expect(report).toContain("- Codex: timeout");
  });

  it("emits valid markdown with ordered sections and redacted credentials", () => {
    const report = generateReport([
      {
        name: "claude",
        status: "success",
        output: "API_TOKEN=super-secret-token\nUse input validation before saving.",
        durationMs: 1200
      },
      successfulResults[1],
      successfulResults[2]
    ]);

    expect(report).toMatch(/^## Claude\n/);
    expect(report).toMatch(/\n## Codex\n/);
    expect(report).toMatch(/\n## Gemini\n/);
    expect(report).toMatch(/\n## Summary\n/);
    expect(report).toMatch(/\n### Consensus\n/);
    expect(report).toMatch(/\n### Differences\n/);
    expect(report).toMatch(/\n### Unavailable\n/);
    expect(report).not.toMatch(/^#{4,}/m);
    expect(report).toContain("API_TOKEN=[REDACTED]");
    expect(report).not.toContain("super-secret-token");
  });
});
