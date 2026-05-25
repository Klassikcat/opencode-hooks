import { describe, it } from "node:test";
import assert from "node:assert/strict";

// RED phase: this import will fail because python-interface.js doesn't exist yet
let runPythonScanner;
try {
  runPythonScanner = (await import("../python-interface.js")).runPythonScanner;
} catch (e) {
  // Expected — RED phase
}

describe("Python scanner interface", () => {
  it("returns findings with verified=true for a verified fixture", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.equal(result.findings[0].verified, true);
  });

  it("returns findings with verified=false for an unverified fixture", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.equal(result.findings[0].verified, false);
  });

  it("returns empty findings for a clean file", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.deepEqual(result.findings, []);
  });

  it("sets timeout flag when scanner times out", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.equal(result.timeout, true);
  });

  it("returns null for malformed JSON output", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.equal(result, null);
  });

  it("returns scannerMissing when trufflehog not found", async () => {
    const result = await runPythonScanner({ tool_name: "Read", tool_input: { file_path: "/tmp/test" } });
    assert.equal(result.scannerMissing, true);
  });
});