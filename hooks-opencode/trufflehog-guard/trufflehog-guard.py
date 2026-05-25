#!/usr/bin/env python3
"""Per-file trufflehog guard for OpenCode Read tool calls.

The script reads a hook payload from stdin and emits a PreToolUse deny decision
only when the requested file is sensitive or trufflehog finds credentials in
that exact file. It never scans the whole session directory.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import TypedDict, cast

HOME = Path.home()
SCAN_TIMEOUT = 15

WELL_KNOWN_SENSITIVE: list[Path] = [
    HOME / ".ssh",
    HOME / ".aws" / "credentials",
    HOME / ".aws" / "config",
    HOME / ".config" / "gcloud",
    HOME / ".docker" / "config.json",
    HOME / ".netrc",
    HOME / ".pgpass",
    HOME / ".kube" / "config",
    HOME / ".npmrc",
    HOME / ".pypirc",
]


class Finding(TypedDict):
    detector: str
    verified: bool


class ScanResult(TypedDict, total=False):
    findings: list[Finding]
    timeout: bool
    error: str


def trufflehog_bin() -> str | None:
    return shutil.which("trufflehog") or (
        "/home/linuxbrew/.linuxbrew/bin/trufflehog"
        if Path("/home/linuxbrew/.linuxbrew/bin/trufflehog").exists()
        else None
    )


def normalize(p: str) -> str:
    try:
        return str(Path(p).expanduser().resolve())
    except Exception:
        return p


def decode_json_object(text: str) -> dict[str, object] | None:
    try:
        raw = cast(object, json.loads(text))
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    return cast(dict[str, object], raw)


def scan_file(file_abs: str) -> ScanResult:
    bin_path = trufflehog_bin()
    if not bin_path:
        return {"findings": [], "error": "trufflehog not found on PATH"}

    try:
        if not Path(file_abs).is_file():
            return {"findings": []}
    except Exception:
        return {"findings": []}

    try:
        proc = subprocess.run(
            [
                bin_path,
                "filesystem",
                file_abs,
                "--json",
                "--no-update",
                "--no-verification",
            ],
            capture_output=True,
            text=True,
            timeout=SCAN_TIMEOUT,
        )
        timeout = False
        stdout = proc.stdout
    except subprocess.TimeoutExpired as error:
        timeout = True
        stdout = error.stdout.decode() if isinstance(error.stdout, bytes) else (error.stdout or "")

    findings: list[Finding] = []
    for line in stdout.splitlines():
        obj = decode_json_object(line.strip())
        if obj is None:
            continue
        detector_raw = obj.get("DetectorName", "unknown")
        detector = detector_raw if isinstance(detector_raw, str) else "unknown"
        findings.append({"detector": detector, "verified": bool(obj.get("Verified", False))})

    return {"findings": findings, "timeout": timeout}


def matches_well_known(file_abs: str) -> str | None:
    target = Path(file_abs)
    for known in WELL_KNOWN_SENSITIVE:
        try:
            resolved = known.resolve() if known.exists() else known
        except Exception:
            resolved = known
        if target == resolved:
            return f"well-known sensitive file: {resolved}"
        try:
            if resolved.is_dir() and resolved in target.parents:
                if known.name == ".ssh" and target.name.endswith(".pub"):
                    return None
                return f"inside well-known sensitive directory: {resolved}"
        except Exception:
            continue
    return None


def cmd_check() -> int:
    payload = decode_json_object(sys.stdin.read())
    if payload is None:
        print(json.dumps({"findings": [], "wellKnown": None, "timeout": False, "scannerMissing": False, "filePath": ""}))
        return 0

    file_path_raw = ""
    if isinstance(payload.get("tool_input"), dict):
        file_path_raw = payload["tool_input"].get("file_path", "")

    if not isinstance(file_path_raw, str) or not file_path_raw:
        print(json.dumps({"findings": [], "wellKnown": None, "timeout": False, "scannerMissing": False, "filePath": ""}))
        return 0

    file_abs = normalize(file_path_raw)
    well_known = matches_well_known(file_abs)

    bin_path = trufflehog_bin()
    if not bin_path:
        print(
            json.dumps(
                {
                    "findings": [],
                    "wellKnown": well_known,
                    "timeout": False,
                    "scannerMissing": True,
                    "filePath": file_abs,
                }
            )
        )
        return 0

    result = scan_file(file_abs)
    output = {
        "findings": result.get("findings", []),
        "wellKnown": well_known,
        "timeout": result.get("timeout", False),
        "scannerMissing": False,
        "filePath": file_abs,
    }
    print(json.dumps(output))
    return 0


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] != "check":
        print("usage: trufflehog-guard.py check", file=sys.stderr)
        return 1
    return cmd_check()


if __name__ == "__main__":
    sys.exit(main())
