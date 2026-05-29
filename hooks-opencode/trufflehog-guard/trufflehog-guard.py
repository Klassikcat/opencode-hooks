#!/usr/bin/env python3
"""Per-file trufflehog guard for Read and Bash tool calls.

The script reads a hook payload from stdin and emits a PreToolUse deny decision
only when a requested file is sensitive or trufflehog finds credentials in that
exact file. It never scans the whole session directory.

For ``Read`` it inspects ``tool_input.file_path``.

For ``Bash`` it parses the command, extracts the files that content-printing
commands (``cat``, ``head``, ``tail`` and friends) or input redirects (``<``)
would expose, and scans only those files. Commands that merely write, list, or
otherwise do not stream file contents are left alone.
"""
import json
import shlex
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

# Commands whose positional file arguments are streamed to stdout (and thus
# into the model context). Pattern/script-first tools such as grep/sed/awk are
# included too: their leading pattern argument is almost never an existing
# file, so scanning it is a harmless no-op while their trailing file arguments
# are caught correctly.
READ_COMMANDS: frozenset[str] = frozenset(
    {
        "cat", "tac", "nl", "rev",
        "head", "tail",
        "less", "more", "most", "pg",
        "bat", "batcat", "view",
        "strings", "xxd", "od", "hexdump", "hd",
        "base64", "base32", "uuencode",
        "cut", "sort", "uniq", "comm", "paste", "join",
        "grep", "egrep", "fgrep", "rg", "ag", "ack",
        "sed", "awk", "gawk",
        "fold", "fmt", "pr", "column", "expand", "unexpand",
        "diff", "cmp",
        "jq", "yq",
        "dd",
    }
)

# Transparent prefixes: skip them (and their leading flags) to reach the real
# command. Wrappers that consume a value argument (nice -n N, timeout N, env
# VAR=v) are intentionally omitted to avoid mis-parsing them as the command.
WRAPPERS: frozenset[str] = frozenset(
    {"sudo", "doas", "command", "builtin", "exec", "nohup", "time"}
)


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


# ("well_known", reason) | ("secret", (detectors, verified)) | ("timeout", None) | None
Verdict = tuple[str, object] | None


def evaluate_file(file_abs: str) -> Verdict:
    well_known = matches_well_known(file_abs)
    if well_known:
        return ("well_known", well_known)

    result = scan_file(file_abs)
    findings = result.get("findings", [])
    if findings:
        detectors = sorted({finding["detector"] for finding in findings})
        verified = any(finding["verified"] for finding in findings)
        return ("secret", (detectors, verified))
    if result.get("timeout"):
        return ("timeout", None)
    return None


def basename_cmd(token: str) -> str:
    token = token.lstrip("\\")
    try:
        return Path(token).name or token
    except Exception:
        return token


def segment_command(command: str) -> list[str]:
    """Split a command line into pipeline/list segments on unquoted shell
    control operators (``;`` ``\\n`` ``|`` ``||`` ``&`` ``&&``). Quotes and
    backslash escapes are respected so separators inside strings do not split.
    """
    segments: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    i = 0
    n = len(command)
    while i < n:
        c = command[i]
        if quote is not None:
            buf.append(c)
            if c == "\\" and quote == '"' and i + 1 < n:
                buf.append(command[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c == "\\":
            buf.append(c)
            if i + 1 < n:
                buf.append(command[i + 1])
                i += 2
                continue
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
            buf.append(c)
            i += 1
            continue
        if c in ";\n":
            segments.append("".join(buf))
            buf = []
            i += 1
            continue
        if c == "|":
            segments.append("".join(buf))
            buf = []
            i += 2 if (i + 1 < n and command[i + 1] == "|") else 1
            continue
        if c == "&":
            segments.append("".join(buf))
            buf = []
            i += 2 if (i + 1 < n and command[i + 1] == "&") else 1
            continue
        buf.append(c)
        i += 1
    segments.append("".join(buf))
    return segments


def collect_segment_targets(tokens: list[str], targets: list[str]) -> None:
    # Skip transparent wrappers and their leading flags to find the real command.
    idx = 0
    while idx < len(tokens):
        if basename_cmd(tokens[idx]) in WRAPPERS:
            idx += 1
            while idx < len(tokens) and tokens[idx].startswith("-"):
                idx += 1
            continue
        break
    if idx >= len(tokens):
        return

    cmd = basename_cmd(tokens[idx])
    is_reader = cmd in READ_COMMANDS
    args = tokens[idx + 1:]

    j = 0
    while j < len(args):
        tok = args[j]

        # Output redirects (>, >>, 2>, &>, 2>file, ...): the following word is a
        # write target, never a file we read. Skip it so it is not scanned.
        if ">" in tok:
            inline = tok.rsplit(">", 1)[1]
            j += 2 if inline == "" else 1
            continue

        # Heredoc / herestring: the next word is a delimiter or literal string.
        if tok in ("<<", "<<<"):
            j += 2
            continue

        # Input redirect: the file feeds stdin and may be echoed to the model.
        if tok == "<":
            if j + 1 < len(args):
                targets.append(args[j + 1])
                j += 2
                continue
            j += 1
            continue
        if tok.startswith("<"):
            targets.append(tok[1:])
            j += 1
            continue

        if is_reader and not tok.startswith("-"):
            if cmd == "dd":
                if tok.startswith("if="):
                    targets.append(tok[3:])
            else:
                targets.append(tok)
        j += 1


def extract_read_targets(command: str) -> list[str]:
    targets: list[str] = []
    for segment in segment_command(command):
        if not segment.strip():
            continue
        try:
            tokens = shlex.split(segment, posix=True, comments=False)
        except ValueError:
            continue
        if tokens:
            collect_segment_targets(tokens, targets)
    return targets


def reason_for_verdict(verb: str, display: str, verdict: Verdict) -> str | None:
    if verdict is None:
        return None
    kind, detail = verdict
    if kind == "well_known":
        return f"{verb} of '{display}' blocked: {detail}."
    if kind == "secret":
        detectors, verified = cast(tuple[list[str], bool], detail)
        verified_suffix = ", VERIFIED live secret" if verified else ""
        return (
            f"{verb} of '{display}' blocked: trufflehog detected credentials "
            f"(detectors: {', '.join(detectors)}{verified_suffix}). "
            f"If this is a false positive, ask the user to confirm before proceeding."
        )
    # timeout
    return (
        f"{verb} of '{display}' blocked: trufflehog timed out after "
        f"{SCAN_TIMEOUT}s while scanning the file. Ask the user before reading."
    )


def check_read(tool_input: dict[str, object]) -> str | None:
    file_path_raw = tool_input.get("file_path")
    if not isinstance(file_path_raw, str) or not file_path_raw:
        return None
    verdict = evaluate_file(normalize(file_path_raw))
    return reason_for_verdict("Read", file_path_raw, verdict)


def check_bash(tool_input: dict[str, object]) -> str | None:
    command = tool_input.get("command")
    if not isinstance(command, str) or not command:
        return None

    seen: set[str] = set()
    for raw in extract_read_targets(command):
        if not raw or raw in seen:
            continue
        seen.add(raw)
        verdict = evaluate_file(normalize(raw))
        reason = reason_for_verdict("Bash command read", raw, verdict)
        if reason is not None:
            return reason
    return None


def cmd_check() -> int:
    payload = decode_json_object(sys.stdin.read())
    if payload is None:
        return 0

    tool_name = payload.get("tool_name")
    tool_input_raw = payload.get("tool_input")
    if not isinstance(tool_input_raw, dict):
        return 0
    tool_input = cast(dict[str, object], tool_input_raw)

    if tool_name == "Read":
        reason = check_read(tool_input)
    elif tool_name == "Bash":
        reason = check_bash(tool_input)
    else:
        return 0

    if reason is None:
        return 0

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    return 0


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] != "check":
        print("usage: trufflehog-guard.py check", file=sys.stderr)
        return 1
    return cmd_check()


if __name__ == "__main__":
    sys.exit(main())
