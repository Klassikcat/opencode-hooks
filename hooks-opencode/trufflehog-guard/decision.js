/**
 * @param {Object} scanResult
 * @param {Array<{detector: string, verified: boolean}>} scanResult.findings
 * @param {string|null} scanResult.wellKnown
 * @param {boolean} scanResult.timeout
 * @param {boolean} scanResult.scannerMissing
 * @param {string} filePath
 * @returns {{decision: "allow"|"deny"|"ask", reason?: string, detectors?: string[], verifiedCount?: number, unverifiedCount?: number}}
 */
export function decideAction(scanResult, filePath) {
  const { findings = [], wellKnown, timeout, scannerMissing } = scanResult;

  if (wellKnown) {
    return { decision: "deny", reason: `well-known sensitive file: ${filePath}` };
  }

  if (scannerMissing) {
    return { decision: "deny", reason: "trufflehog not found on PATH" };
  }

  if (timeout) {
    return { decision: "deny", reason: `trufflehog timeout while scanning '${filePath}'` };
  }

  const verified = findings.filter((finding) => finding.verified);
  const unverified = findings.filter((finding) => !finding.verified);

  if (verified.length > 0) {
    return {
      decision: "deny",
      reason: `verified credential(s) detected in '${filePath}'`,
      detectors: verified.map((finding) => finding.detector),
      verifiedCount: verified.length,
      unverifiedCount: unverified.length,
    };
  }

  if (unverified.length > 0) {
    return {
      decision: "ask",
      reason: `unverified credential candidate(s) detected in '${filePath}'. Ask user before reading.`,
      detectors: unverified.map((finding) => finding.detector),
      verifiedCount: 0,
      unverifiedCount: unverified.length,
    };
  }

  return { decision: "allow" };
}
