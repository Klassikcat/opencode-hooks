# OpenCode trufflehog guard hook

Blocks OpenCode `Read` tool calls when the target file appears to contain credentials.

## Behavior

- Does not scan at session start.
- Runs only immediately before a `Read` tool call.
- Scans only the requested file with `trufflehog filesystem <file>`.
- Blocks well-known sensitive local paths such as `~/.ssh`, `~/.aws/credentials`, `~/.kube/config`, and similar credential files.
- Emits only a deny reason with detector names. It does not print raw trufflehog findings or secret values.

## Requirements

- `python3`
- `trufflehog` on `PATH`, or at `/home/linuxbrew/.linuxbrew/bin/trufflehog`
- OpenCode plugin support

If `trufflehog` is not installed, the hook still blocks well-known sensitive paths but allows normal files.

## Install

1. Copy this directory somewhere stable, for example:

   ```bash
   mkdir -p ~/.config/opencode/hooks/trufflehog-guard
   cp index.js trufflehog-guard.py ~/.config/opencode/hooks/trufflehog-guard/
   ```

2. Add the plugin path to `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "/home/you/.config/opencode/hooks/trufflehog-guard/index.js"
     ]
   }
   ```

3. Restart OpenCode so the plugin is loaded.

## Options

The plugin defaults to the bundled `trufflehog-guard.py` next to `index.js`.

You can override the helper path with either:

- plugin option: `scriptPath`
- environment variable: `OPENCODE_TRUFFLEHOG_GUARD_SCRIPT`

You can override the JavaScript-side timeout with either:

- plugin option: `timeoutMs`
- environment variable: `OPENCODE_TRUFFLEHOG_GUARD_TIMEOUT_MS`

The Python helper's per-file trufflehog timeout is currently 15 seconds.

## Verify

Run:

```bash
npm run check
```

The smoke test creates a safe temporary file and verifies that it is allowed, then verifies that a well-known sensitive path is denied.
