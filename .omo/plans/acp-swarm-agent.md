# @swarm Agent — ACP Fan-out Plan/Work Verification

## TL;DR

> **Quick Summary**: Create `@swarm` — an OpenCode subagent that fans out a verification prompt to Claude Code, Codex CLI, and Gemini CLI via provider adapters, collects results, and generates a sectioned comparison report for cross-validation of plans and work outputs. **All work MUST be done in a separate `git worktree`** — never touch the main working tree directly.
> 
> **Deliverables**:
> 
> **Deliverables**:
> - `agents-opencode/swarm/AGENT.md` — OpenCode markdown agent definition
> - `agents-opencode/swarm/src/providers/claude.js` — Claude Code adapter
> - `agents-opencode/swarm/src/providers/codex.js` — Codex CLI adapter
> - `agents-opencode/swarm/src/providers/gemini.js` — Gemini CLI adapter
> - `agents-opencode/swarm/src/providers/base.js` — Base adapter interface
> - `agents-opencode/swarm/src/compare.js` — Result comparison + summary generator
> - `agents-opencode/swarm/src/cli.js` — CLI entry point / orchestrator
> - `agents-opencode/swarm/package.json` — Node.js ESM project
> - `agents-opencode/swarm/vitest.config.js` — Vitest config
> - `agents-opencode/swarm/__tests__/` — TDD test files
> - `agents-opencode/swarm/README.md` — Documentation
> - `agents-opencode/swarm/scripts/smoke-test.mjs` — Smoke test
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 4-6 → Task 8 → Task 9 → F1-F4

---

## Context

### Original Request
Create a new OpenCode agent that calls Claude Code, Codex, and Gemini CLI via ACP (Agent Communication Protocol). Purpose: agent swarming, verify plan/work by other models.

### Interview Summary
**Key Discussions**:
- **Architecture**: Markdown Agent (persona) + Node.js helper scripts. NOT a hook/plugin.
- **Invocation**: Provider adapters calling each CLI via its native headless protocol (not uniform ACP — each CLI has different machine interface)
- **Workflow**: Fan-out (same prompt → all 3 tools in parallel) + sectioned comparison report
- **Primary use case**: Plan/Work Verification — cross-validation by different AI coding tools
- **Connection model**: Short-lived per-call process (spawn → send → collect → kill)
- **Helper structure**: Unified script with `--tool` flag pattern, but internal provider adapters per CLI
- **Comparison format**: Sectioned + Summary (per-tool sections + consensus/differences analysis)
- **Error handling**: Partial — failed tool shown as "failed", remaining results proceed
- **Configuration**: Environment variables (`SWARM_CLAUDE_PATH`, `SWARM_CODEX_PATH`, `SWARM_GEMINI_PATH`, `SWARM_TIMEOUT_MS`)
- **Test strategy**: TDD with Vitest (new setup from scratch)
- **Agent name**: `@swarm`

**Research Findings**:
- OpenCode agents defined as markdown with YAML frontmatter (mode, model, permissions, prompt)
- **ACP is NOT uniform**: Gemini CLI has `--acp` (true ACP), Claude Code uses `--output-format stream-json`, Codex uses `codex exec --json`. Each CLI needs its own adapter.
- Existing plugins use Node.js ESM, `@opencode-ai/plugin` peer dep, `npm run check` script pattern
- No test infrastructure exists in this project — must set up from scratch
- `agents-opencode/` directory is empty (blank README only)

### Metis Review
**Identified Gaps** (addressed):
- **Protocol mismatch**: Not all CLIs implement ACP uniformly → Use "provider adapter" pattern, not "unified ACP client"
- **Read-only guardrail**: `@swarm` should NEVER modify files → Add to Must NOT Have + agent permissions
- **No recursive swarm**: Prevent `@swarm` from invoking itself → Add guardrail
- **No invented consensus**: Comparison must distinguish consensus vs disagreement vs single-tool claims → Explicit in compare.js logic
- **No silent degradation**: Missing CLI, timeout, nonzero exit must appear in report → Partial error handling covers this
- **Prompt delivery**: CLI args risk shell limits → Use stdin for prompt delivery where possible
- **Interactive prompts from CLIs**: CLIs may hang waiting for user approval → Use headless/non-interactive flags + timeout
- **ACP naming honesty**: Don't claim full ACP compliance for providers using non-ACP JSON/stdout modes → Name it "provider adapter"

---

## Work Objectives

### Core Objective
Create `@swarm` — an OpenCode subagent in `agents-opencode/swarm/` that dispatches a verification prompt to Claude Code, Codex CLI, and Gemini CLI in parallel, collects their responses, and generates a sectioned comparison report for cross-validation of plans and work outputs.

### Concrete Deliverables
- A callable `@swarm` agent in OpenCode (via `@mention` or Task tool)
- A Node.js CLI tool that orchestrates fan-out to 3 provider adapters
- A deterministic comparison module that produces sectioned markdown reports
- Full TDD test suite with Vitest
- Documentation (README, .env.example)

### Definition of Done
- [ ] `node agents-opencode/swarm/src/cli.js --prompt "test" --review-target <file>` produces markdown report with sections for each provider + summary
- [ ] `npm test` in `agents-opencode/swarm/` passes all tests
- [ ] `@swarm` agent is invocable within OpenCode via `@mention`

### Must Have
- Fan-out to all 3 CLI tools in parallel (Promise.all with settled results)
- Sectioned markdown report: `## Claude`, `## Codex`, `## Gemini`, `## Summary`
- Summary section with consensus/differences analysis
- Partial failure handling (failed tools shown, others proceed)
- Environment variable configuration for CLI paths and timeout
- `--review-target` flag that reads a local file and includes content in prompt
- Read-only agent (no file modifications)
- Short-lived processes (no daemon)
- TDD test suite with mocked providers

### Must NOT Have (Guardrails)
- **No file modifications**: `@swarm` is verification-only, never edit/create files
- **No daemon/persistent processes**: Every CLI call is short-lived and cleaned up
- **No recursive swarm calls**: `@swarm` cannot invoke itself or spawn nested swarms
- **No prompt mutation per tool**: Same prompt sent to all enabled tools
- **No invented consensus**: Report must distinguish consensus, disagreement, single-tool claims, and unavailable tools
- **No silent degradation**: Missing CLI, timeout, nonzero exit, parse error must appear in report
- **No root-level project pollution**: All package/test setup stays under `agents-opencode/swarm/`
- **No full ACP claim for non-ACP providers**: Name abstraction honestly — "provider adapter" not "ACP client"
- **No auto-fix**: Don't apply suggestions found by swarm, only report them
- **No interactive CLI mode**: Always use headless/non-interactive flags to prevent hangs
- **No secrets in reports**: Redact env var values, tokens if present in output

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: Vitest
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI/Node.js**: Use Bash — Run commands, parse output, assert exit codes and content
- **Unit tests**: Use Bash — Run `npm test`, assert pass/fail counts

---

## Execution Strategy

### ⚠️ Git Worktree (MANDATORY)

**ALL work for this plan MUST be done in a separate `git worktree`. NEVER modify the main working tree directly.**

```bash
# Step 1: Create the worktree (executor MUST run this before any other task)
git worktree add /tmp/opencode-swarm main

# Step 2: Do ALL work inside the worktree
cd /tmp/opencode-swarm

# Step 3: After all tasks complete, cleanup
cd /tmp/opencode-hooks && git worktree remove /tmp/opencode-swarm
```

**Why worktree:**
- Isolates in-progress work from the main tree
- Prevents accidental modification of existing hooks (`hooks-opencode/alarm/`, `hooks-opencode/trufflehog-guard/`)
- Allows parallel work on other branches without interference
- Safely testable and removable if something goes wrong

**Worktree lifecycle:**
1. Executor creates worktree → Task 1 (scaffolding)
2. All implementation happens in worktree
3. After Final Verification passes and user approves → commit chain to main branch → remove worktree

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation + scaffolding):
├── Task 1: Project scaffolding (package.json, vitest, directory structure) [quick]
├── Task 2: Base provider adapter interface + types [quick]
├── Task 3: AGENT.md markdown agent definition [quick]

Wave 2 (After Wave 1 - provider adapters + core, MAX PARALLEL):
├── Task 4: Claude Code provider adapter (TDD) (depends: 2) [unspecified-high]
├── Task 5: Codex CLI provider adapter (TDD) (depends: 2) [unspecified-high]
├── Task 6: Gemini CLI provider adapter (TDD) (depends: 2) [unspecified-high]
├── Task 7: Result comparison module (TDD) (depends: 2) [unspecified-high]
├── Task 8: CLI entry point / orchestrator (TDD) (depends: 4, 5, 6, 7) [deep]

Wave 3 (After Wave 2 - integration + documentation):
├── Task 9: Integration test + smoke test (depends: 8) [unspecified-high]
├── Task 10: README.md documentation (depends: 1, 8) [writing]
├── Task 11: .env.example + final polish (depends: 8) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4/5/6 → Task 8 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3, 10 | 1 |
| 2 | 1 | 4, 5, 6, 7 | 1 |
| 3 | 1 | — | 1 |
| 4 | 2 | 8 | 2 |
| 5 | 2 | 8 | 2 |
| 6 | 2 | 8 | 2 |
| 7 | 2 | 8 | 2 |
| 8 | 4, 5, 6, 7 | 9, 10, 11 | 2 |
| 9 | 8 | — | 3 |
| 10 | 1, 8 | — | 3 |
| 11 | 8 | — | 3 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 5 tasks — T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `deep`
- **Wave 3**: 3 tasks — T9 → `unspecified-high`, T10 → `writing`, T11 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project scaffolding (package.json, vitest, directory structure)

- [x] 2. Base provider adapter interface + types

  **What to do**:
  - Create `src/providers/base.js` — abstract base class or interface for provider adapters
  - Define the adapter contract:
    ```js
    // Each provider adapter must implement:
    export class ProviderAdapter {
      constructor(options)  // { command, args, timeoutMs, env }
      async execute(prompt, reviewTarget) → { status: "success"|"failed"|"timeout", output: string, error?: string, durationMs: number }
      get name() → string  // e.g. "claude", "codex", "gemini"
    }
    ```
  - Create `__tests__/providers/base.test.js` — TDD: test that base class enforces contract
  - Define shared types/constants: `STATUS_SUCCESS`, `STATUS_FAILED`, `STATUS_TIMEOUT`
  - Define default timeout constant: `DEFAULT_TIMEOUT_MS = 30000`
  - Define env var prefix: `SWARM_`

  **Must NOT do**:
  - Do NOT implement actual CLI spawning (that's in provider-specific tasks 4-6)
  - Do NOT use TypeScript (project uses plain JS ESM)
  - Do NOT add runtime npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface definition, minimal logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: 4, 5, 6, 7
  - **Blocked By**: 1

  **References**:
  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:1-30` — timeout pattern with AbortController/process.kill
  - `hooks-opencode/alarm/index.js:1-30` — timeout pattern with AbortController

  **Acceptance Criteria**:
  - [ ] `src/providers/base.js` exports `ProviderAdapter` class with `execute()` and `name` getter
  - [ ] `__tests__/providers/base.test.js` tests: constructor, execute signature, name getter, STATUS constants
  - [ ] `npm test -- __tests__/providers/base.test.js` passes (GREEN)

  **QA Scenarios**:

  ```
  Scenario: Base adapter contract enforcement
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. cd agents-opencode/swarm && npm test -- __tests__/providers/base.test.js
    Expected Result: All tests pass, ProviderAdapter class is importable, STATUS constants defined
    Failure Indicators: Import error, missing methods, test failures
    Evidence: .omo/evidence/task-2-base-adapter.txt

  Scenario: Invalid subclass throws on execute
    Tool: Bash
    Steps:
      1. node -e "import { ProviderAdapter } from './src/providers/base.js'; class Bad extends ProviderAdapter {}; const b = new Bad(); try { await b.execute('test'); } catch(e) { console.log('OK:', e.message); process.exit(0); }" (from agents-opencode/swarm/)
    Expected Result: Throws error about execute not implemented
    Evidence: .omo/evidence/task-2-contract-enforce.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add base provider adapter interface`
  - Files: `agents-opencode/swarm/src/providers/base.js, agents-opencode/swarm/__tests__/providers/base.test.js`

- [x] 3. AGENT.md markdown agent definition

  **What to do**:
  - Create `agents-opencode/swarm/AGENT.md` — OpenCode markdown agent with YAML frontmatter
  - Frontmatter:
    ```yaml
    ---
    description: Fan-out verification agent that dispatches prompts to Claude Code, Codex CLI, and Gemini CLI in parallel, then compares results for cross-validation.
    mode: subagent
    steps: 10
    permission:
      edit: deny
      bash:
        "node agents-opencode/swarm/src/cli.js*": allow
        "cat *": allow
        "*": ask
    ---
    ```
  - System prompt body defining:
    1. Role: You are @swarm, a verification agent that cross-validates plans and work by dispatching to multiple AI coding tools
    2. Workflow: Read the review target → Construct prompt → Run `node agents-opencode/swarm/src/cli.js --prompt "..." --review-target <path>` → Present the comparison report
    3. Guidelines: Never modify files, always present full report, highlight consensus vs disagreements
    4. Usage examples for the user

  **Must NOT do**:
  - Do NOT set `mode: "primary"` (this is a subagent only)
  - Do NOT allow edit permission
  - Do NOT add model specification (use user's default model)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single markdown file, content-focused
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: None (agent definition is standalone)
  - **Blocked By**: 1

  **References**:
  **Pattern References**:
  - Existing agent definitions from librarian research: YAML frontmatter format with description, mode, steps, permission

  **External References**:
  - OpenCode agent docs: `https://www.opencodebook.xyz/en/chapter_06_agent_system/6.5_custom_agent_configuration` — agent schema

  **Acceptance Criteria**:
  - [ ] `AGENT.md` has valid YAML frontmatter with `mode: subagent`
  - [ ] Permission block denies `edit` and allows only `node agents-opencode/swarm/src/cli.js*` for bash
  - [ ] System prompt describes the swarm workflow clearly

  **QA Scenarios**:

  ```
  Scenario: Agent frontmatter validation
    Tool: Bash
    Preconditions: AGENT.md created
    Steps:
      1. node -e "import fs from 'fs'; const content = fs.readFileSync('agents-opencode/swarm/AGENT.md','utf8'); const fm = content.match(/^---([^-]*)---/s); if(!fm) { console.log('FAIL: no frontmatter'); process.exit(1); } const y = fm[1]; if(!y.includes('mode: subagent')) { console.log('FAIL: wrong mode'); process.exit(1); } if(!y.includes('edit: deny')) { console.log('FAIL: edit not denied'); process.exit(1); } console.log('OK: frontmatter valid');"
    Expected Result: "OK: frontmatter valid"
    Evidence: .omo/evidence/task-3-agent-frontmatter.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add @swarm agent markdown definition`
  - Files: `agents-opencode/swarm/AGENT.md`

- [ ] 4. Claude Code provider adapter (TDD)

  **What to do**:
  - RED: Write `__tests__/providers/claude.test.js` first:
    - Test: `execute()` spawns `claude` with correct args (`-p`, `--output-format json`, `--max-turns 0`)
    - Test: prompt is passed as the `-p` argument
    - Test: `--review-target` content is prepended to prompt
    - Test: timeout kills process and returns `{ status: "timeout" }`
    - Test: nonzero exit code returns `{ status: "failed", error: stderr }`
    - Test: successful execution returns `{ status: "success", output: stdout }`
    - Test: `SWARM_CLAUDE_PATH` env var overrides default `claude` command
    - Test: `SWARM_CLAUDE_TIMEOUT_MS` env var overrides default timeout
  - GREEN: Implement `src/providers/claude.js`:
    - Extend `ProviderAdapter`
    - Build spawn args: `[SWARM_CLAUDE_PATH || "claude", "-p", fullPrompt, "--output-format", "json", "--max-turns", "0"]`
    - Use `child_process.spawn` with timeout via `AbortController`
    - Parse stdout JSON for structured output, fall back to raw text
    - Return standardized result object `{ status, output, error?, durationMs }`
  - REFACTOR: Clean up

  **Must NOT do**:
  - Do NOT use `--permission-prompt-tool stdio` (too complex for v1)
  - Do NOT use `--input-format stream-json` (v1 uses `-p` flag only)
  - Do NOT allow interactive mode (always `--max-turns 0` or `--print`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: TDD cycle with subprocess mocking, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: 8
  - **Blocked By**: 2

  **References**:
  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:30-80` — child_process.spawn with timeout pattern
  - `src/providers/base.js` — base class to extend

  **External References**:
  - Claude Code CLI docs: `claude -p "prompt" --output-format json --max-turns 0` for headless mode

  **Acceptance Criteria**:
  - [ ] `__tests__/providers/claude.test.js` exists with 7+ test cases
  - [ ] `npm test -- __tests__/providers/claude.test.js` passes
  - [ ] `src/providers/claude.js` extends ProviderAdapter, implements `execute()`

  **QA Scenarios**:

  ```
  Scenario: Claude adapter test suite passes
    Tool: Bash
    Preconditions: Task 2 complete, vitest installed
    Steps:
      1. cd agents-opencode/swarm && npm test -- __tests__/providers/claude.test.js
    Expected Result: All tests pass (7+ tests, 0 failures)
    Failure Indicators: Import errors, missing methods, test failures
    Evidence: .omo/evidence/task-4-claude-adapter-tests.txt

  Scenario: Claude adapter handles missing binary
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && SWARM_CLAUDE_PATH=/nonexistent node -e "import { ClaudeAdapter } from './src/providers/claude.js'; const a = new ClaudeAdapter(); const r = await a.execute('test'); console.log(JSON.stringify(r));"
    Expected Result: status "failed" with error containing "ENOENT" or "not found"
    Evidence: .omo/evidence/task-4-claude-missing-binary.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add Claude Code provider adapter`
  - Files: `agents-opencode/swarm/src/providers/claude.js, agents-opencode/swarm/__tests__/providers/claude.test.js`

- [ ] 5. Codex CLI provider adapter (TDD)

  **What to do**:
  - RED: Write `__tests__/providers/codex.test.js` first:
    - Test: `execute()` spawns `codex` with correct args (`exec`, prompt, `--json`, `--sandbox read-only`)
    - Test: prompt is passed as positional argument to `exec`
    - Test: `--review-target` content is prepended to prompt
    - Test: timeout kills process and returns `{ status: "timeout" }`
    - Test: nonzero exit code returns `{ status: "failed", error: stderr }`
    - Test: successful execution returns `{ status: "success", output: parsed JSON }`
    - Test: `SWARM_CODEX_PATH` env var overrides default `codex` command
    - Test: `SWARM_CODEX_TIMEOUT_MS` env var overrides default timeout
  - GREEN: Implement `src/providers/codex.js`:
    - Extend `ProviderAdapter`
    - Build spawn args: `[SWARM_CODEX_PATH || "codex", "exec", fullPrompt, "--json", "--sandbox", "read-only"]`
    - Use `child_process.spawn` with timeout
    - Parse JSONL output, extract last meaningful message
    - Return standardized result object
  - REFACTOR: Clean up

  **Must NOT do**:
  - Do NOT use `--dangerously-bypass-approvals` (always use `--sandbox read-only`)
  - Do NOT use interactive/approval modes
  - Do NOT allow `--sandbox danger-full-access`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: TDD cycle with subprocess mocking, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6, 7)
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: 8
  - **Blocked By**: 2

  **References**:
  **Pattern References**:
  - `src/providers/claude.js` — same adapter pattern (parallel task, may not be complete yet, but same structure)
  - `src/providers/base.js` — base class to extend
  - `hooks-opencode/trufflehog-guard/index.js:30-80` — spawn with timeout pattern

  **External References**:
  - Codex CLI: `codex exec "prompt" --json --sandbox read-only` for headless mode

  **Acceptance Criteria**:
  - [ ] `__tests__/providers/codex.test.js` exists with 8+ test cases
  - [ ] `npm test -- __tests__/providers/codex.test.js` passes
  - [ ] `src/providers/codex.js` extends ProviderAdapter, uses `--sandbox read-only`

  **QA Scenarios**:

  ```
  Scenario: Codex adapter test suite passes
    Tool: Bash
    Preconditions: Task 2 complete
    Steps:
      1. cd agents-opencode/swarm && npm test -- __tests__/providers/codex.test.js
    Expected Result: All tests pass (8+ tests, 0 failures)
    Evidence: .omo/evidence/task-5-codex-adapter-tests.txt

  Scenario: Codex adapter enforces read-only sandbox
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import { CodexAdapter } from './src/providers/codex.js'; const a = new CodexAdapter(); console.log(a.buildArgs ? a.buildArgs('test') : 'no buildArgs');"
    Expected Result: Args contain "--sandbox" and "read-only"
    Evidence: .omo/evidence/task-5-codex-readonly.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add Codex CLI provider adapter`
  - Files: `agents-opencode/swarm/src/providers/codex.js, agents-opencode/swarm/__tests__/providers/codex.test.js`

- [ ] 6. Gemini CLI provider adapter (TDD)

  **What to do**:
  - RED: Write `__tests__/providers/gemini.test.js` first:
    - Test: `execute()` spawns `gemini` with correct args (`-p`, prompt, `--output-format json`)
    - Test: prompt is passed as the `-p` argument
    - Test: `--review-target` content is prepended to prompt
    - Test: timeout kills process and returns `{ status: "timeout" }`
    - Test: nonzero exit code returns `{ status: "failed", error: stderr }`
    - Test: successful execution returns `{ status: "success", output: parsed output }`
    - Test: `SWARM_GEMINI_PATH` env var overrides default `gemini` command
    - Test: `SWARM_GEMINI_TIMEOUT_MS` env var overrides default timeout
  - GREEN: Implement `src/providers/gemini.js`:
    - Extend `ProviderAdapter`
    - Build spawn args: `[SWARM_GEMINI_PATH || "gemini", "-p", fullPrompt, "--output-format", "json"]`
    - Note: v1 uses `-p` headless mode, NOT `--acp` (ACP mode requires persistent connection, too complex for short-lived model)
    - Use `child_process.spawn` with timeout
    - Parse stdout, handle both JSON and text output
    - Return standardized result object
  - REFACTOR: Clean up

  **Must NOT do**:
  - Do NOT implement `--acp` mode in v1 (requires persistent bidirectional stdio — too complex)
  - Do NOT use `--yolo` flag (use safe permissions only)
  - Do NOT implement `--headless-interactive` (use simple `-p` mode)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: TDD cycle with subprocess mocking, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 7)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: 8
  - **Blocked By**: 2

  **References**:
  **Pattern References**:
  - `src/providers/claude.js` — same adapter pattern
  - `src/providers/base.js` — base class to extend

  **External References**:
  - Gemini CLI: `gemini -p "prompt" --output-format json` for headless mode

  **Acceptance Criteria**:
  - [ ] `__tests__/providers/gemini.test.js` exists with 8+ test cases
  - [ ] `npm test -- __tests__/providers/gemini.test.js` passes
  - [ ] `src/providers/gemini.js` extends ProviderAdapter, does NOT use `--acp`

  **QA Scenarios**:

  ```
  Scenario: Gemini adapter test suite passes
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && npm test -- __tests__/providers/gemini.test.js
    Expected Result: All tests pass (8+ tests, 0 failures)
    Evidence: .omo/evidence/task-6-gemini-adapter-tests.txt

  Scenario: Gemini adapter does NOT use --acp flag
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import { GeminiAdapter } from './src/providers/gemini.js'; const a = new GeminiAdapter(); const args = a.buildArgs ? a.buildArgs('test') : a.args; const s = JSON.stringify(args); if(s.includes('--acp')) { console.log('FAIL: uses --acp'); process.exit(1); } console.log('OK: no --acp');"
    Expected Result: "OK: no --acp"
    Evidence: .omo/evidence/task-6-gemini-no-acp.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add Gemini CLI provider adapter`
  - Files: `agents-opencode/swarm/src/providers/gemini.js, agents-opencode/swarm/__tests__/providers/gemini.test.js`

- [ ] 7. Result comparison module (TDD)

  **What to do**:
  - RED: Write `__tests__/compare.test.js` first:
    - Test: `generateReport(results)` with 3 successful results → markdown with `## Claude`, `## Codex`, `## Gemini`, `## Summary` sections
    - Test: `generateReport(results)` with 1 failed, 2 successful → report shows failed section with error, summary notes partial results
    - Test: `generateReport(results)` with all failed → report shows all failures, exits nonzero
    - Test: Summary section identifies consensus (text appearing in 2+ results) and differences
    - Test: Summary does NOT invent consensus — only reports what's actually present
    - Test: Empty/missing output treated as "no response" not consensus
    - Test: Timeout result shown with `status: timeout` and duration
    - Test: Report is valid markdown (no broken formatting)
  - GREEN: Implement `src/compare.js`:
    - `generateReport(results: Array<ProviderResult>) → string` — returns markdown string
    - Section format per provider: `## {Name}`, status badge (✅/❌/⏱️), response content, duration
    - Summary section: `## Summary`, `### Consensus` (shared points), `### Differences` (unique points), `### Unavailable` (failed tools)
    - Consensus detection: simple string overlap analysis (not LLM-based)
    - Return markdown string
  - REFACTOR: Clean up

  **Must NOT do**:
  - Do NOT use an LLM to generate the summary (deterministic only)
  - Do NOT invent consensus that isn't in the actual outputs
  - Do NOT silently omit failed providers from the report
  - Do NOT include raw env var values or tokens in report

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Non-trivial string analysis logic with multiple edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: 8
  - **Blocked By**: 2

  **References**:
  **Pattern References**:
  - `src/providers/base.js` — result type shape (`{ status, output, error, durationMs }`)

  **Acceptance Criteria**:
  - [ ] `__tests__/compare.test.js` exists with 8+ test cases
  - [ ] `npm test -- __tests__/compare.test.js` passes
  - [ ] `src/compare.js` exports `generateReport()` function
  - [ ] Report format: `## {Provider}`, `## Summary` with `### Consensus`, `### Differences`, `### Unavailable`

  **QA Scenarios**:

  ```
  Scenario: Comparison report with 3 successful results
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import { generateReport } from './src/compare.js'; const r = generateReport([{name:'claude',status:'success',output:'Use caching',durationMs:100},{name:'codex',status:'success',output:'Use caching',durationMs:200},{name:'gemini',status:'success',output:'Add rate limiting',durationMs:150}]); console.log(r.includes('## Claude'), r.includes('## Summary'), r.includes('### Consensus'));"
    Expected Result: true true true — report contains all required sections
    Evidence: .omo/evidence/task-7-compare-success.txt

  Scenario: Comparison report with partial failure
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import { generateReport } from './src/compare.js'; const r = generateReport([{name:'claude',status:'success',output:'OK',durationMs:100},{name:'codex',status:'failed',error:'ENOENT',durationMs:0},{name:'gemini',status:'timeout',durationMs:30000}]); console.log(r.includes('## Codex'), r.includes('❌'), r.includes('⏱️'), r.includes('### Unavailable'));"
    Expected Result: true true true true — failed/timeout providers shown in report
    Evidence: .omo/evidence/task-7-compare-partial.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add result comparison module`
  - Files: `agents-opencode/swarm/src/compare.js, agents-opencode/swarm/__tests__/compare.test.js`

- [ ] 8. CLI entry point / orchestrator (TDD)

  **What to do**:
  - RED: Write `__tests__/cli.test.js` first:
    - Test: `main(["--prompt", "test prompt"])` invokes all 3 adapters
    - Test: `--review-target <path>` reads file and prepends content to prompt
    - Test: `--review-target <nonexistent>` exits with error message (no crash)
    - Test: Fan-out runs adapters in parallel (Promise.allSettled)
    - Test: Partial failure (1 adapter fails) → report still generated with 2 successful + 1 failed
    - Test: All fail → exits nonzero with failure report
    - Test: `--timeout` flag overrides default timeout
    - Test: `--prompt` is required, exits with usage message if missing
    - Test: Output is valid markdown written to stdout
  - GREEN: Implement `src/cli.js`:
    - Parse CLI args: `--prompt <text>`, `--review-target <path>`, `--timeout <ms>`
    - Read review target file if provided, prepend to prompt
    - Instantiate all 3 adapters
    - Run `Promise.allSettled(adapters.map(a => a.execute(prompt, reviewTarget)))`
    - Pass results to `generateReport()` from `src/compare.js`
    - Write report to stdout
    - Exit 0 if at least 1 success, exit 1 if all failed
  - REFACTOR: Clean up, extract arg parsing

  **Must NOT do**:
  - Do NOT run adapters sequentially (must be parallel)
  - Do NOT write to files (stdout only)
  - Do NOT add interactive prompts
  - Do NOT support `--tool <name>` selective dispatch in v1

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Orchestrator that ties all modules together, complex integration logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 2 tasks)
  - **Parallel Group**: Wave 2 (last task, depends on 4, 5, 6, 7)
  - **Blocks**: 9, 10, 11
  - **Blocked By**: 4, 5, 6, 7

  **References**:
  **Pattern References**:
  - `src/providers/claude.js` — Claude adapter API
  - `src/providers/codex.js` — Codex adapter API
  - `src/providers/gemini.js` — Gemini adapter API
  - `src/compare.js` — generateReport() API
  - `hooks-opencode/alarm/scripts/smoke-test.mjs` — CLI smoke test pattern

  **Acceptance Criteria**:
  - [ ] `__tests__/cli.test.js` exists with 9+ test cases
  - [ ] `npm test -- __tests__/cli.test.js` passes
  - [ ] `node src/cli.js --prompt "test" --review-target fixtures/sample-plan.md` outputs markdown report
  - [ ] Exit code 0 when at least 1 adapter succeeds

  **QA Scenarios**:

  ```
  Scenario: CLI with mock adapters produces report
    Tool: Bash
    Preconditions: All provider adapters and compare module exist
    Steps:
      1. cd agents-opencode/swarm && SWARM_CLAUDE_PATH=echo SWARM_CODEX_PATH=echo SWARM_GEMINI_PATH=echo node src/cli.js --prompt "test prompt" 2>&1
    Expected Result: Output contains "## Claude", "## Codex", "## Gemini", "## Summary" (echo commands produce minimal output, adapters report success)
    Failure Indicators: Missing sections, crash, non-zero exit
    Evidence: .omo/evidence/task-8-cli-basic.txt

  Scenario: CLI missing --prompt flag
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node src/cli.js 2>&1; echo "EXIT: $?"
    Expected Result: Usage message printed, exit code non-zero
    Evidence: .omo/evidence/task-8-cli-no-prompt.txt

  Scenario: CLI with nonexistent --review-target
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node src/cli.js --prompt "test" --review-target /nonexistent/path.md 2>&1; echo "EXIT: $?"
    Expected Result: Error message about missing file, graceful exit
    Evidence: .omo/evidence/task-8-cli-bad-target.txt
  ```

  **Commit**: YES
  - Message: `feat(swarm): add CLI entry point / orchestrator`
  - Files: `agents-opencode/swarm/src/cli.js, agents-opencode/swarm/__tests__/cli.test.js`

- [ ] 9. Integration test + smoke test

  **What to do**:
  - Create `__tests__/integration.test.js`:
    - Test: Full end-to-end with mock provider scripts (shell scripts that echo JSON)
    - Test: Fan-out produces 3 results in parallel (verify timing shows parallel execution)
    - Test: Report contains all sections
    - Test: Partial failure scenario (1 mock script exits 1)
    - Test: Timeout scenario (1 mock script sleeps longer than timeout)
  - Create `scripts/smoke-test.mjs`:
    - Verify `node src/cli.js --prompt "hello" --review-target fixtures/sample-plan.md` runs and produces output
    - Check exit code is 0 (if any provider binary exists) or 1 (if all missing, which is fine for smoke test)
    - Follow pattern from `hooks-opencode/alarm/scripts/smoke-test.mjs`

  **Must NOT do**:
  - Do NOT call real Claude/Codex/Gemini binaries in tests (use mock scripts)
  - Do NOT add flaky timing-dependent assertions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test design with mock subprocess orchestration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: None
  - **Blocked By**: 8

  **References**:
  **Pattern References**:
  - `hooks-opencode/alarm/scripts/smoke-test.mjs` — smoke test pattern
  - `__tests__/cli.test.js` — unit tests for cli.js to build upon

  **Acceptance Criteria**:
  - [ ] `__tests__/integration.test.js` exists with 5+ test cases
  - [ ] `npm test` passes all tests (unit + integration)
  - [ ] `node scripts/smoke-test.mjs` runs without error

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && npm test 2>&1
    Expected Result: All tests pass, 0 failures
    Evidence: .omo/evidence/task-9-full-test-suite.txt

  Scenario: Smoke test runs
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node scripts/smoke-test.mjs 2>&1
    Expected Result: Completes without throwing, reports pass/fail clearly
    Evidence: .omo/evidence/task-9-smoke-test.txt
  ```

  **Commit**: YES
  - Message: `test(swarm): add integration + smoke tests`
  - Files: `agents-opencode/swarm/__tests__/integration.test.js, agents-opencode/swarm/scripts/smoke-test.mjs`

- [ ] 10. README.md documentation

  **What to do**:
  - Create `agents-opencode/swarm/README.md` with sections:
    1. **Behavior**: What @swarm does (fan-out verification)
    2. **Requirements**: Node.js >= 20, Claude Code / Codex / Gemini CLI installed
    3. **Install**: How to add to OpenCode (copy `opencode.plugin.snippet.json` pattern or add agent path)
    4. **Usage**: `@swarm review this plan` example, direct CLI usage example
    5. **Environment Variables**: Complete list (`SWARM_CLAUDE_PATH`, `SWARM_CODEX_PATH`, `SWARM_GEMINI_PATH`, `SWARM_TIMEOUT_MS`, etc.)
    6. **Output Format**: Example comparison report
    7. **Verify**: How to test the installation

  **Must NOT do**:
  - Do NOT add installation instructions that modify root project files
  - Do NOT add instructions for providers not supported in v1

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: 1, 8

  **References**:
  **Pattern References**:
  - `hooks-opencode/alarm/README.md` — README format (Behavior, Install, Options, Verify)
  - `hooks-opencode/trufflehog-guard/README.md` — second README example

  **Acceptance Criteria**:
  - [ ] README.md has sections: Behavior, Requirements, Install, Usage, Environment Variables, Output Format, Verify
  - [ ] All env vars documented

  **QA Scenarios**:

  ```
  Scenario: README completeness check
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import fs from 'fs'; const r = fs.readFileSync('README.md','utf8'); const sections = ['Behavior','Requirements','Install','Usage','Environment Variables','Output Format','Verify']; const missing = sections.filter(s => !r.includes(s)); if(missing.length) { console.log('FAIL: missing', missing.join(', ')); process.exit(1); } console.log('OK: all sections present');"
    Expected Result: "OK: all sections present"
    Evidence: .omo/evidence/task-10-readme-check.txt
  ```

  **Commit**: YES
  - Message: `docs(swarm): add README documentation`
  - Files: `agents-opencode/swarm/README.md`

- [ ] 11. .env.example + final polish

  **What to do**:
  - Create `.env.example` with all supported env vars and comments:
    ```
    # Path to Claude Code binary (default: claude)
    SWARM_CLAUDE_PATH=claude
    # Path to Codex CLI binary (default: codex)
    SWARM_CODEX_PATH=codex
    # Path to Gemini CLI binary (default: gemini)
    SWARM_GEMINI_PATH=gemini
    # Default timeout in milliseconds (default: 30000)
    SWARM_TIMEOUT_MS=30000
    # Individual provider timeouts (optional, overrides SWARM_TIMEOUT_MS)
    SWARM_CLAUDE_TIMEOUT_MS=
    SWARM_CODEX_TIMEOUT_MS=
    SWARM_GEMINI_TIMEOUT_MS=
    ```
  - Update root `README.md` to list `agents-opencode/swarm` in Contents section
  - Review all files for consistency: import paths, env var names, error messages
  - Ensure `npm run check` passes

  **Must NOT do**:
  - Do NOT add actual env values (only examples)
  - Do NOT modify root package.json

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small finishing touches
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: 8

  **References**:
  **Pattern References**:
  - `hooks-opencode/alarm/.env.example` — env example format
  - `README.md` (root) — add entry to Contents section

  **Acceptance Criteria**:
  - [ ] `.env.example` exists with all env vars documented
  - [ ] Root `README.md` lists `agents-opencode/swarm` in Contents
  - [ ] `npm run check` passes

  **QA Scenarios**:

  ```
  Scenario: Env example completeness
    Tool: Bash
    Steps:
      1. cd agents-opencode/swarm && node -e "import fs from 'fs'; const e = fs.readFileSync('.env.example','utf8'); const vars = ['SWARM_CLAUDE_PATH','SWARM_CODEX_PATH','SWARM_GEMINI_PATH','SWARM_TIMEOUT_MS']; const missing = vars.filter(v => !e.includes(v)); if(missing.length) { console.log('FAIL:', missing); process.exit(1); } console.log('OK: all env vars present');"
    Expected Result: "OK: all env vars present"
    Evidence: .omo/evidence/task-11-env-example.txt

  Scenario: Root README updated
    Tool: Bash
    Steps:
      1. node -e "import fs from 'fs'; const r = fs.readFileSync('README.md','utf8'); if(!r.includes('swarm')) { console.log('FAIL'); process.exit(1); } console.log('OK');"
    Expected Result: "OK"
    Evidence: .omo/evidence/task-11-root-readme.txt
  ```

  **Commit**: YES
  - Message: `chore(swarm): add .env.example and final polish`
  - Files: `agents-opencode/swarm/.env.example, README.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm test` + `npm run check` in `agents-opencode/swarm/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: missing CLI, timeout, empty response. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

> **IMPORTANT**: All commits happen inside the worktree at `/tmp/opencode-swarm`. After Final Verification passes and user approves, executor merges the worktree branch back to `main`.

### Worktree Lifecycle
```bash
# Before Task 1
git worktree add /tmp/opencode-swarm main

# Inside worktree (ALL tasks)
cd /tmp/opencode-swarm
# ... implementation, commits ...

# After Final Verification + user approval
cd /path/to/main/repo
git merge /tmp/opencode-swarm --no-ff -m "feat(swarm): add @swarm agent for ACP fan-out verification"
git worktree remove /tmp/opencode-swarm
```

### Commit Log
- **2**: `feat(swarm): add base provider adapter interface` — src/providers/base.js, __tests__/providers/base.test.js
- **3**: `feat(swarm): add @swarm agent markdown definition` — AGENT.md
- **4**: `feat(swarm): add Claude Code provider adapter` — src/providers/claude.js, __tests__/providers/claude.test.js
- **5**: `feat(swarm): add Codex CLI provider adapter` — src/providers/codex.js, __tests__/providers/codex.test.js
- **6**: `feat(swarm): add Gemini CLI provider adapter` — src/providers/gemini.js, __tests__/providers/gemini.test.js
- **7**: `feat(swarm): add result comparison module` — src/compare.js, __tests__/compare.test.js
- **8**: `feat(swarm): add CLI entry point / orchestrator` — src/cli.js, __tests__/cli.test.js
- **9**: `test(swarm): add integration + smoke tests` — __tests__/integration.test.js, scripts/smoke-test.mjs
- **10**: `docs(swarm): add README documentation` — README.md
- **11**: `chore(swarm): add .env.example and final polish` — .env.example, final cleanup

---

## Success Criteria

### Verification Commands
```bash
cd agents-opencode/swarm && npm test                    # Expected: all tests pass
cd agents-opencode/swarm && npm run check                # Expected: syntax check + smoke test pass
cd agents-opencode/swarm && node src/cli.js --prompt "test" --review-target README.md  # Expected: markdown report with 3 sections + summary
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] `@swarm` agent invocable in OpenCode
- [ ] Fan-out produces sectioned comparison report
- [ ] Partial failures handled gracefully
