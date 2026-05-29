# trufflehog guard hook

Blocks `Read` tool calls — and `Bash` commands that would print a file's contents — when the target file appears to contain credentials.

## Behavior

- Does not scan at session start.
- Runs only immediately before a `Read` tool call or a `Bash` tool call.
- For `Read`: scans `tool_input.file_path`.
- For `Bash`: parses the command and scans the files that content-printing commands (`cat`, `head`, `tail`, `less`, `grep`, `xxd`, `base64`, `jq`, ...) or an input redirect (`< file`) would expose. It splits on shell operators (`|`, `;`, `&&`, `||`, `&`), follows transparent wrappers (`sudo`, `nohup`, ...), and ignores write redirects (`> file`). Commands that only write, list, or move files are left alone.
- Scans only the resolved file(s) with `trufflehog filesystem <file>`.
- Blocks well-known sensitive local paths such as `~/.ssh`, `~/.aws/credentials`, `~/.kube/config`, and similar credential files.
- Emits only a deny reason with detector names. It does not print raw trufflehog findings or secret values.

### Bash parsing limitations

The Bash parser is a best-effort compromise, not a full shell. It does not resolve variables (`$FILE`), command substitution (`$(...)`), or value-taking wrappers (`timeout 5 cat ...`, `env X=y cat ...`). Such cases fall through as a no-op (allowed). The `Read` hook remains the primary guard.

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
