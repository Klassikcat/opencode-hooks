import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { decideAction } from "../decision.js";

describe("decideAction", () => {
  it("allows a clean file with no scanner findings", () => {
    const result = decideAction(
      { findings: [], wellKnown: null, timeout: false, scannerMissing: false },
      "/tmp/project/src/config.js",
    );

    assert.deepEqual(result, { decision: "allow" });
  });

  it("denies a file when a verified AWS finding is present", () => {
    const result = decideAction(
      { findings: [{ detector: "AWS", verified: true }], wellKnown: null, timeout: false, scannerMissing: false },
      "/tmp/project/.env",
    );

    assert.equal(result.decision, "deny");
    assert.match(result.reason, /verified/i);
  });

  it("asks before allowing a file when only unverified findings are present", () => {
    const result = decideAction(
      { findings: [{ detector: "AWS", verified: false }], wellKnown: null, timeout: false, scannerMissing: false },
      "/tmp/project/notes.txt",
    );

    assert.equal(result.decision, "ask");
    assert.match(result.reason, /unverified/i);
  });

  it("denies mixed findings because verified findings take precedence", () => {
    const result = decideAction(
      {
        findings: [
          { detector: "AWS", verified: false },
          { detector: "GitHub", verified: true },
        ],
        wellKnown: null,
        timeout: false,
        scannerMissing: false,
      },
      "/tmp/project/mixed.env",
    );

    assert.equal(result.decision, "deny");
  });

  it("denies reads from well-known sensitive credential paths", () => {
    const result = decideAction(
      { findings: [], wellKnown: "well-known sensitive file: ~/.ssh/id_rsa", timeout: false, scannerMissing: false },
      "/home/example/.ssh/id_rsa",
    );

    assert.equal(result.decision, "deny");
    assert.match(result.reason, /well-known/i);
  });

  it("denies when the scanner times out", () => {
    const result = decideAction(
      { findings: [], wellKnown: null, timeout: true, scannerMissing: false },
      "/tmp/project/slow.env",
    );

    assert.equal(result.decision, "deny");
    assert.match(result.reason, /timeout/i);
  });

  it("denies when the scanner is not found so the guard fails closed", () => {
    const result = decideAction(
      { findings: [], wellKnown: null, timeout: false, scannerMissing: true },
      "/tmp/project/app.js",
    );

    assert.equal(result.decision, "deny");
    assert.match(result.reason, /not found/i);
  });
});
