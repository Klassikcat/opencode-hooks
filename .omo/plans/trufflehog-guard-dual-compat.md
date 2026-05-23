# Trufflehog Guard: Verified/Unverified Differentiation + Dual Compatibility

## TL;DR

> **Quick Summary**: Refactor `trufflehog-guard` to block verified credentials and pause-for-user-approval on unverified credentials, supporting both OpenCode (in-process plugin) and Claude Code (stdin/stdout subprocess) protocols natively from a single JS entry point.
> 
> **Deliverables**:
> - Modified `trufflehog-guard.py`: scanner-only backend (no decision logic)
> - Restructured `index.js`: dual-mode entry (OpenCode plugin + Claude Code CLI) with shared decision logic
> - New test suite: decision logic, Python interface, OpenCode mode, Claude Code CLI mode
> - Updated README with Claude Code configuration docs
> - New `.claude/settings.json` example snippet
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 → Task 6 → Task 7 → Task 8 → Task 9 → Task 12

---

## Context

### Original Request
현재 opencode-hooks에서 trufflehog를 통한 credential file read hook이 있다. 여기서는 현재 hook을 다르게 받지 않고 unverified와 verified 모두 block한다. 이를 다음과 같이 변경하여야 한다:
- verified: block 후 작업 중단
- unverified: 작업 일시중지 후 ask
또한, 이 hook은 opencode뿐만 아니라 claude code와도 호환되어야 한다.

### Interview Summary
**Key Discussions**:
- Verified findings → block (deny): Both OpenCode and Claude Code block immediately
- Unverified findings → ask (pause for user): OpenCode uses throw Error with message; Claude Code uses `permissionDecision: "ask"`
- Dual compatibility: JS plugin in dual-mode (plugin export for OpenCode + CLI mode for Claude Code)
- CLI mode detection: `CLAUDE_CODE_HOOK=1` env var (avoids stdin.isTTY conflicts with test runners/OpenCode runtime)
- Test strategy: TDD, new test files

**Research Findings**:
- Python script already speaks Claude Code stdin/stdout JSON protocol
- OpenCode tool names are lowercase; Claude Code are PascalCase
- Claude Code `permissionDecision` values: "deny", "allow", "ask", "defer"
- Decision precedence: verified deny > unverified ask > clean allow
- Scanner failure: fail-closed (deny/block)
- All messages must redact raw secrets (never include secret values)

### Metis Review
**Identified Gaps** (addressed):
- Decision precedence must be explicit: verified deny > unverified ask > clean allow
- CLI mode detection must not conflict with OpenCode runtime → use env var, not stdin.isTTY
- Python should become scanner-only; JS handles all decisions → avoids duplicated logic
- Scanner failure policy: fail-closed (deny)
- Secret redaction must be enforced in all output paths
- Mixed findings (both verified and unverified): verified takes precedence

---

## Work Objectives

### Core Objective
Refactor `trufflehog-guard` to block verified credentials and pause-for-user-approval on unverified credentials, supporting both OpenCode (in-process plugin) and Claude Code (stdin/stdout subprocess) protocols natively from a single JS entry point.

### Concrete Deliverables
- `hooks-opencode/trufflehog-guard/trufflehog-guard.py` — scanner-only backend
- `hooks-opencode/trufflehog-guard/index.js` — dual-mode entry with shared decision logic
- `hooks-opencode/trufflehog-guard/decision.js` — shared decision module (new file)
- `hooks-opencode/trufflehog-guard/claude-code.js` — CLI entry point for Claude Code (new file)
- `hooks-opencode/trufflehog-guard/__tests__/decision.test.js` — decision logic tests
- `hooks-opencode/trufflehog-guard/__tests__/python-interface.test.js` — Python scanner interface tests
- `hooks-opencode/trufflehog-guard/__tests__/opencode-plugin.test.js` — OpenCode plugin mode tests
- `hooks-opencode/trufflehog-guard/__tests__/claude-code-cli.test.js` — Claude Code CLI mode tests
- `hooks-opencode/trufflehog-guard/__tests__/fixtures/` — mock trufflehog outputs
- `hooks-opencode/trufflehog-guard/.claude/settings.json` — example Claude Code hook config
- `hooks-opencode/trufflehog-guard/README.md` — updated documentation
- `hooks-opencode/trufflehog-guard/package.json` — updated scripts

### Definition of Done
- [ ] `bun test` passes all new and existing tests
- [ ] Verified credential → deny/block in both OpenCode and Claude Code modes
- [ ] Unverified credential → ask/pause in both OpenCode and Claude Code modes
- [ ] Clean file → allow silently in both modes
- [ ] Well-known sensitive path → deny in both modes
- [ ] Scanner timeout → deny in both modes
- [ ] Scanner not found → deny in both modes
- [ ] Mixed findings (verified + unverified) → verified precedence (deny)
- [ ] No raw secret values in any error message, stdout, or test snapshot
- [ ] Claude Code can use the hook via `.claude/settings.json` subprocess config

### Must Have
- Verified findings produce deny/block behavior in both modes
- Unverified findings produce ask/pause behavior in both modes
- Python script returns raw scan data (findings with verified flag) — no decision logic
- JS handles all decisions: precedence verified deny > unverified ask > clean allow
- Dual-mode entry: `plugin` export for OpenCode, CLI for Claude Code
- All secret values redacted from error messages and output
- TDD test suite with mocking for trufflehog subprocess
- Scanner failure produces fail-closed (deny) behavior

### Must NOT Have (Guardrails)
- Do NOT modify the alarm hook (unrelated component)
- Do NOT add the `opencode-claude-hooks` npm package as a dependency
- Do NOT change the Python script's subprocess interface (stdin/stdout JSON) — only simplify its output schema
- Do NOT duplicate decision logic in both Python and JS — decisions live in JS only
- Do NOT add AI-slop: excessive comments, over-abstraction, generic names
- Do NOT support `Stop` hook re-activation (Claude Code-only feature, no OpenCode equivalent)
- Do NOT expand scanning beyond `Read` tool
- Do NOT include raw secret values in any message, log, or test output

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (no test framework configured for trufflehog-guard)
- **Automated tests**: YES (TDD — tests before implementation)
- **Framework**: `bun test` (Node.js built-in test runner via `node:test`)
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Logic**: Use `bun test` — run tests, assert results, capture output
- **CLI/Subprocess**: Use Bash — pipe stdin, capture stdout/stderr, assert exit codes and JSON
- **Integration**: Use Bash — configure mock, run full flow, verify end-to-end behavior

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Setup + TDD RED phase):
├── Task 0: Create separate git worktree [quick]
├── Task 1: Test infrastructure setup [quick]
├── Task 2: Create test fixtures for mock trufflehog outputs [quick]
├── Task 3: Write decision logic unit tests [quick]
├── Task 4: Write Python scanner interface tests [quick]
├── Task 5: Write OpenCode plugin mode tests [quick]
└── Task 6: Write Claude Code CLI mode tests [quick]

Wave 2 (After Wave 1 - Implementation GREEN phase):
├── Task 7: Implement shared decision module (depends: 3) [unspecified-high]
├── Task 8: Refactor Python script to scanner-only (depends: 4) [unspecified-high]
├── Task 9: Implement dual-mode detection + OpenCode plugin (depends: 5, 7) [unspecified-high]
└── Task 10: Implement Claude Code CLI entry point (depends: 6, 7) [unspecified-high]

Wave 3 (After Wave 2 - Integration + docs):

- [ ] 11. Update package.json and build pipeline

  **What to do**:
  - Update `hooks-opencode/trufflehog-guard/package.json`:
    - Add `"test": "bun test"` script (alongside existing `"check"`)
    - Add `"test:all": "bun test && python3 -m py_compile trufflehog-guard.py && node scripts/smoke-test.mjs"` script
    - Ensure `"type": "module"` is still set
    - Verify all existing scripts still work: `npm run check`
  - Run full test suite: `bun test` → all new and existing tests pass
  - Run smoke test: `node scripts/smoke-test.mjs` → passes

  **Must NOT do**:
  - Do NOT change `"type": "module"` to `"commonjs"`
  - Do NOT remove existing `"check"` script
  - Do NOT add unnecessary npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 9 and 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing (final tasks)
  - **Blocked By**: Task 9 (OpenCode plugin), Task 10 (Claude Code CLI)

  **References**:
  - `hooks-opencode/trufflehog-guard/package.json:1-19` — current package config to update

  **Acceptance Criteria**:

  - [ ] `bun test` passes all tests from Tasks 3-6
  - [ ] `node scripts/smoke-test.mjs` passes
  - [ ] `npm run check` passes
  - [ ] `package.json` has `"test"` and `"test:all"` scripts

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `bun test` from hooks-opencode/trufflehog-guard/
      2. Assert exit code 0
      3. Run `node scripts/smoke-test.mjs` from hooks-opencode/trufflehog-guard/
      4. Assert "trufflehog guard smoke test passed" in output
    Expected Result: All tests pass, smoke test passes
    Failure Indicators: Any test fails, smoke test fails
    Evidence: .omo/evidence/task-11-full-test-suite.txt
  ```

  **Commit**: YES
  - Message: `chore(trufflehog-guard): update package.json with test scripts`
  - Files: `hooks-opencode/trufflehog-guard/package.json`
  - Pre-commit: `bun test && node scripts/smoke-test.mjs`

- [ ] 12. Add .claude/settings.json example

  **What to do**:
  - Create `hooks-opencode/trufflehog-guard/.claude/settings.json` — example Claude Code hook configuration:
    ```json
    {
      "hooks": {
        "PreToolUse": [
          {
            "matcher": "Read",
            "hooks": [
              {
                "type": "command",
                "command": "CLAUDE_CODE_HOOK=1 node /absolute/path/to/opencode-hooks/hooks-opencode/trufflehog-guard/claude-code.js",
                "timeout": 30
              }
            ]
          }
        ]
      }
    }
    ```
  - Add a comment/note that users should replace `/absolute/path/to/` with their actual path

  **Must NOT do**:
  - Do NOT hardcode paths that won't work on other machines (use placeholder)
  - Do NOT include any real credentials or API keys

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 13, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 10 (Claude Code CLI must exist)

  **References**:
  - `hooks-opencode/trufflehog-guard/opencode.plugin.snippet.json` — existing OpenCode plugin config snippet to follow as a pattern

  **Acceptance Criteria**:

  - [ ] `.claude/settings.json` exists with valid JSON
  - [ ] Contains `PreToolUse` hook with `Read` matcher pointing to `claude-code.js`
  - [ ] Has `CLAUDE_CODE_HOOK=1` env var in command
  - [ ] Has timeout of 30 seconds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Claude Code settings file is valid JSON
    Tool: Bash
    Preconditions: .claude/settings.json created
    Steps:
      1. Run `node -e "JSON.parse(require('fs').readFileSync('hooks-opencode/trufflehog-guard/.claude/settings.json','utf8')); console.log('valid')"`
      2. Assert output is "valid"
    Expected Result: Settings file is valid JSON
    Failure Indicators: JSON parse error
    Evidence: .omo/evidence/task-12-settings-json-valid.txt
  ```

  **Commit**: YES (groups with Wave 3 docs)
  - Message: `docs(trufflehog-guard): add Claude Code hook configuration example`
  - Files: `hooks-opencode/trufflehog-guard/.claude/settings.json`

- [ ] 13. Update README.md for new behavior + Claude Code docs

  **What to do**:
  - Update `hooks-opencode/trufflehog-guard/README.md`:
    - Update "Behavior" section to describe verified vs unverified distinction:
      - Verified credentials → block (deny)
      - Unverified credentials → ask for user approval (OpenCode: throw Error; Claude Code: `permissionDecision: "ask"`)
      - Well-known sensitive paths → block (deny)
      - Timeout → block (deny)
      - Scanner not found → block (deny, fail-closed)
      - Clean files → allow silently
    - Add "Claude Code Usage" section with configuration instructions and `.claude/settings.json` example
    - Add "Dual Mode" section explaining OpenCode plugin mode vs Claude Code CLI mode
    - Update "Options" section to include `CLAUDE_CODE_HOOK` env var
    - Update "Verify" section with new test commands
  - Update project root `hooks-opencode/README.md` to mention Claude Code compatibility

  **Must NOT do**:
  - Do NOT remove existing OpenCode documentation
  - Do NOT add marketing language or unnecessary elaboration
  - Do NOT include real secret values in examples

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 9 (OpenCode plugin), Task 10 (Claude Code CLI)

  **References**:
  - `hooks-opencode/trufflehog-guard/README.md:1-66` — current README to update
  - `hooks-opencode/README.md:1-8` — root project README to add Claude Code mention

  **Acceptance Criteria**:

  - [ ] README.md documents verified → deny, unverified → ask behavior
  - [ ] README.md has "Claude Code Usage" section
  - [ ] README.md has "Dual Mode" section explaining both modes
  - [ ] README.md has `CLAUDE_CODE_HOOK` env var documentation
  - [ ] Root README.md mentions Claude Code compatibility

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: README documents all new behaviors
    Tool: Bash
    Preconditions: README.md updated
    Steps:
      1. Grep README.md for "verified" — assert found
      2. Grep README.md for "unverified" — assert found
      3. Grep README.md for "Claude Code" — assert found
      4. Grep README.md for "CLAUDE_CODE_HOOK" — assert found
    Expected Result: All key terms present in documentation
    Failure Indicators: Missing key term
    Evidence: .omo/evidence/task-13-readme-complete.txt
  ```

  **Commit**: YES (groups with Wave 3 docs)
  - Message: `docs(trufflehog-guard): update README with verified/unverified behavior and Claude Code usage`
  - Files: `hooks-opencode/trufflehog-guard/README.md`, `hooks-opencode/README.md`

- [ ] 14. Update smoke-test.mjs for new behavior

  **What to do**:
  - Update `hooks-opencode/trufflehog-guard/scripts/smoke-test.mjs`:
    - Keep existing tests: safe file allowed, well-known path denied
    - Add test for verified finding: mock Python subprocess to return verified finding, assert `throw Error` with "verified" in message
    - Add test for unverified finding: mock Python subprocess to return unverified finding, assert `throw Error` with "unverified" in message
    - Add test for Claude Code CLI mode: spawn `node claude-code.js` with `CLAUDE_CODE_HOOK=1`, pipe JSON stdin, assert stdout JSON contains `permissionDecision`
  - Mock the Python subprocess since real trufflehog may not be installed
  - Run `node scripts/smoke-test.mjs` → all tests pass

  **Must NOT do**:
  - Do NOT remove existing smoke test cases
  - Do NOT require real trufflehog binary for smoke tests
  - Do NOT add real secret values to test data

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing
  - **Blocked By**: Task 9 (OpenCode plugin), Task 10 (Claude Code CLI)

  **References**:
  - `hooks-opencode/trufflehog-guard/scripts/smoke-test.mjs:1-32` — current smoke test to extend

  **Acceptance Criteria**:

  - [ ] `node scripts/smoke-test.mjs` passes all tests
  - [ ] Smoke test covers: safe file allow, well-known path deny, verified deny, unverified ask, Claude Code CLI mode

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Smoke test passes with new behavior
    Tool: Bash
    Preconditions: Smoke test updated
    Steps:
      1. Run `node scripts/smoke-test.mjs` from hooks-opencode/trufflehog-guard/
      2. Assert exit code 0
      3. Assert output contains "passed" or similar success message
    Expected Result: All smoke tests pass
    Failure Indicators: Exit code non-zero, test failure message
    Evidence: .omo/evidence/task-14-smoke-test-pass.txt
  ```

  **Commit**: YES (groups with Wave 3 docs)
  - Message: `test(trufflehog-guard): update smoke test for verified/unverified behavior and Claude Code mode`
  - Files: `hooks-opencode/trufflehog-guard/scripts/smoke-test.mjs`

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

- **0**: No dependencies (start immediately)
- **1-6**: No dependencies (start immediately, can run in parallel with Task 0)
- **7**: depends on 3
- **8**: depends on 4
- **9**: depends on 5, 7
- **10**: depends on 6, 7
- **11**: depends on 9, 10
- **12**: depends on 10
- **13**: depends on 9, 10
- **14**: depends on 9, 10

### Agent Dispatch Summary

- **Wave 1**: **7** tasks — T0 → `quick`, T1-T6 → `quick`
- **Wave 2**: 4 tasks — T7-T8 → `unspecified-high`, T9-T10 → `unspecified-high`
- **Wave 3**: 4 tasks — T11-T12,T14 → `quick`, T13 → `writing`
- **FINAL**: 4 tasks — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 0. Create separate git worktree

  **What to do**:
  - Create a separate git worktree for this work to keep the main branch clean:
    ```bash
    git worktree add ../opencode-hooks-trufflehog main
    cd ../opencode-hooks-trufflehog
    git checkout -b feature/trufflehog-guard-dual-compat
    ```
  - Verify the worktree is set up correctly: `git worktree list` should show both the original and new worktree
  - Verify the new branch: `git branch --show-current` should output `feature/trufflehog-guard-dual-compat`
  - All subsequent tasks should be executed from the worktree directory

  **Must NOT do**:
  - Do NOT work in the original repository directory — use the worktree
  - Do NOT skip the worktree creation — it isolates the work from the main branch

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: For `git worktree add` and branch creation operations
  - **Skills Evaluated but Omitted**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1-6)
  - **Parallel Group**: Wave 1 (with Tasks 1-6)
  - **Blocks**: All implementation tasks (7-14)
  - **Blocked By**: None (can start immediately)

  **Acceptance Criteria**:
  - [ ] Worktree directory `../opencode-hooks-trufflehog` exists
  - [ ] `git worktree list` shows 2+ worktrees
  - [ ] Current branch is `feature/trufflehog-guard-dual-compat`
  - [ ] All files from `hooks-opencode/trufflehog-guard/` are accessible

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Worktree created and branch checked out
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `git worktree list` from the original repo
      2. Assert at least 2 entries in the output (original + new)
      3. Run `cd ../opencode-hooks-trufflehog && git branch --show-current`
      4. Assert output is "feature/trufflehog-guard-dual-compat"
      5. Run `ls hooks-opencode/trufflehog-guard/index.js`
      6. Assert the file exists
    Expected Result: Worktree exists, branch is correct, project files accessible
    Failure Indicators: Worktree not listed, wrong branch, missing files
    Evidence: .omo/evidence/task-0-worktree-created.txt
  ```

  **Commit**: NO (setup task, no code changes)

- [x] 1. Test infrastructure setup

  **What to do**:
  - Create `hooks-opencode/trufflehog-guard/__tests__/` directory
  - Add `node:test` import style test runner setup in a helper file `__tests__/helpers.js`
  - Create `__tests__/fixtures/` directory for mock trufflehog JSON outputs
  - Update `package.json` to add `"test": "bun test"` script and `devDependencies` for `bun` test runner
  - Verify `bun test` runs (even with 0 tests) without errors

  **Must NOT do**:
  - Do NOT add Jest, Vitest, or other test frameworks — use `node:test` + `bun test`
  - Do NOT modify existing `smoke-test.mjs` yet (separate task)
  - Do NOT add any implementation code yet (TDD: RED phase only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none needed for this straightforward setup

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-6)
  - **Blocks**: Tasks 7-14 (all implementation tasks)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/package.json:1-19` — current package config, add test script here
  - `hooks-opencode/trufflehog-guard/scripts/smoke-test.mjs:1-32` — existing smoke test pattern to follow

  **API/Type References**:
  - `node:test` — Node.js built-in test runner, `describe`, `it`, `assert` from `node:test`
  - `bun test` — Bun's test runner that supports `node:test` syntax

  **WHY Each Reference Matters**:
  - `package.json` — needs `"test"` script and potential devDependencies
  - `smoke-test.mjs` — shows existing test pattern (inline, no framework) that new tests should NOT follow (they should use `node:test`)

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `__tests__/` directory exists
  - [ ] `__tests__/fixtures/` directory exists
  - [ ] `bun test` runs without errors (0 tests found is OK)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test infrastructure runs
    Tool: Bash
    Preconditions: Project directory is hooks-opencode/trufflehog-guard
    Steps:
      1. Run `bun test` from hooks-opencode/trufflehog-guard/
      2. Assert exit code is 0
      3. Assert no "cannot find" or "module not found" errors in output
    Expected Result: bun test exits 0, reports 0 tests found (or placeholder test passes)
    Failure Indicators: Exit code non-zero, missing module errors
    Evidence: .omo/evidence/task-1-test-infra-runs.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add TDD test infrastructure`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/`, `hooks-opencode/trufflehog-guard/package.json`
  - Pre-commit: `bun test`

- [x] 2. Create test fixtures for mock trufflehog outputs

  **What to do**:
  - Create `__tests__/fixtures/verified-finding.json` — mock trufflehog output with `Verified: true` finding (AWS key detector)
  - Create `__tests__/fixtures/unverified-finding.json` — mock trufflehog output with `Verified: false` finding
  - Create `__tests__/fixtures/mixed-findings.json` — both verified and unverified findings
  - Create `__tests__/fixtures/no-findings.json` — empty findings array (clean file)
  - Create `__tests__/fixtures/multiple-verified.json` — 2+ verified findings
  - Create `__tests__/fixtures/malformed-output.json` — invalid JSON line to test error handling
  - Create `__tests__/fixtures/timeout-simulated.json` — mock for timeout scenario (or document how timeout is tested)
  - Each fixture must NOT contain real secret values — use obviously fake values like `AKIAIOSFODNN7EXAMPLE`

  **Must NOT do**:
  - Do NOT include real secret values — use fake/example values only
  - Do NOT create implementation code yet
  - Do NOT modify existing files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-6)
  - **Blocks**: Tasks 7-14 (all implementation tasks)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:98-106` — shows the exact JSON shape trufflehog produces: `DetectorName`, `Verified` fields, parsed from `--json` output
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:32-35` — Finding TypedDict showing `detector: str` and `verified: bool`

  **WHY Each Reference Matters**:
  - `trufflehog-guard.py:98-106` — shows the JSON parsing logic that the mock outputs must match
  - `trufflehog-guard.py:32-35` — defines the exact schema of a Finding that tests must produce

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] All 7 fixture files exist in `__tests__/fixtures/`
  - [ ] Each fixture has valid JSON matching trufflehog output format
  - [ ] No fixture contains real secret values

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fixtures are valid trufflehog output format
    Tool: Bash
    Preconditions: Fixtures created
    Steps:
      1. For each .json file in __tests__/fixtures/, run `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('valid')" <file>`
      2. Assert each outputs "valid"
    Expected Result: All fixture files are valid JSON
    Failure Indicators: Any file fails to parse
    Evidence: .omo/evidence/task-2-fixtures-valid.txt

  Scenario: No real secrets in fixtures
    Tool: Bash
    Preconditions: Fixtures created
    Steps:
      1. Grep all fixture files for patterns that look like real AWS keys (AKIA followed by 14 uppercase chars), real private keys (BEGIN RSA PRIVATE KEY), etc.
      2. Assert no matches found (only fake/example values)
    Expected Result: No real secret patterns found in any fixture
    Failure Indicators: Real-looking secrets found
    Evidence: .omo/evidence/task-2-no-real-secrets.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add mock trufflehog output fixtures`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/fixtures/*.json`
  - Pre-commit: `node -e "JSON.parse(require('fs').readFileSync('...'))"` for each fixture

- [x] 3. Write decision logic unit tests

  **What to do**:
  - Create `__tests__/decision.test.js` using `node:test`
  - Write tests for the shared `decideAction(scanResult, filePath)` function that will live in `decision.js`:
    - `decideAction({ findings: [], wellKnown: null, timeout: false }, "/safe/file")` → `{ decision: "allow" }`
    - `decideAction({ findings: [{ detector: "AWS", verified: true }], wellKnown: null, timeout: false }, "/file")` → `{ decision: "deny", reason: "...verified..." }`
    - `decideAction({ findings: [{ detector: "AWS", verified: false }], wellKnown: null, timeout: false }, "/file")` → `{ decision: "ask", reason: "...unverified..." }`
    - `decideAction({ findings: [{ detector: "AWS", verified: true }, { detector: "GitHub", verified: false }], wellKnown: null, timeout: false }, "/file")` → `{ decision: "deny", reason: "...verified...precedence..." }` (verified precedence)
    - `decideAction({ findings: [], wellKnown: "well-known sensitive file: ~/.ssh", timeout: false }, "/home/user/.ssh/id_rsa")` → `{ decision: "deny", reason: "...well-known..." }`
    - `decideAction({ findings: [], wellKnown: null, timeout: true }, "/file")` → `{ decision: "deny", reason: "...timeout..." }`
    - `decideAction({ findings: [], wellKnown: null, timeout: false }, "/file")` when trufflehog not found → `{ decision: "deny", reason: "...not found..." }` (fail-closed)
  - Each test must use descriptive `it()` names: `it("should deny verified findings")`, `it("should ask for unverified findings")`, etc.
  - All tests MUST FAIL at this point (TDD RED phase — `decision.js` doesn't exist yet)

  **Must NOT do**:
  - Do NOT create `decision.js` yet (that's Task 7)
  - Do NOT import from existing files (mock the module path)
  - Do NOT include real secret values in test assertions — use fake detector names like `"AWS"` and fake paths

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-6)
  - **Blocks**: Task 7 (decision logic implementation)
  - **Blocked By**: Task 1 (test infrastructure)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:129-202` — current decision logic in Python that needs to be replicated in JS. Study the flow: well-known → deny, findings → (verified/unverified decision), timeout → deny, no findings → allow
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:32-41` — ScanResult and Finding TypedDict showing exact shape: `{ findings: [{ detector, verified }], timeout, error }`

  **WHY Each Reference Matters**:
  - `trufflehog-guard.py:129-202` — the decision flow that must be ported from Python to JS. Currently it always allows findings; we need deny/ask/allow precedence
  - `trufflehog-guard.py:32-41` — the TypeScript/JS test must match this exact data shape

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `__tests__/decision.test.js` exists with 7+ test cases
  - [ ] `bun test __tests__/decision.test.js` fails (RED phase — module not found)
  - [ ] Test names are descriptive and cover: allow, deny-verified, ask-unverified, mixed-precedence, well-known, timeout, scanner-not-found

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Decision tests are properly structured and fail (RED phase)
    Tool: Bash
    Preconditions: Task 1 completed, decision.test.js created
    Steps:
      1. Run `bun test __tests__/decision.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code is non-zero (tests fail because decision.js doesn't exist)
      3. Assert output mentions "Cannot find module" or "decision" in error messages
      4. Count test cases — assert at least 7 test cases defined
    Expected Result: Tests fail with module-not-found or similar import error
    Failure Indicators: Tests pass (implementation already exists), fewer than 7 test cases
    Evidence: .omo/evidence/task-3-decision-tests-red.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add decision logic unit tests (RED phase)`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/decision.test.js`
  - Pre-commit: `bun test __tests__/decision.test.js` (expected to fail)

- [~] 4. Write Python scanner interface tests (RED phase — PC went down, needs re-dispatch)

  **What to do**:
  - Create `__tests__/python-interface.test.js` using `node:test`
  - Test the JS function that spawns `python3 trufflehog-guard.py check` and parses its output:
    - Mock `spawn` to return fixture JSON for verified findings → parsed result has `findings[0].verified === true`
    - Mock `spawn` to return fixture JSON for unverified findings → parsed result has `findings[0].verified === false`
    - Mock `spawn` to return fixture JSON for no findings → parsed result has `findings: []`
    - Mock `spawn` to timeout → `result.timeout === true`
    - Mock `spawn` to return malformed JSON → parsed result is `null`
    - Mock `spawn` to return well-known path deny → parsed result has `permissionDecision: "deny"`
  - Mock the subprocess rather than calling real Python (deterministic, no trufflehog dependency)
  - Tests MUST FAIL at this point (the module function doesn't exist yet in the new structure)

  **Must NOT do**:
  - Do NOT create `decision.js` or modify `index.js` yet
  - Do NOT call real `python3` or `trufflehog` binary in tests
  - Do NOT include real secret values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-6)
  - **Blocks**: Task 8 (Python scanner refactor)
  - **Blocked By**: Task 1 (test infrastructure), Task 2 (fixtures)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:17-63` — current `runHook()` function that spawns Python and parses output. This is the exact interface that tests must mock and verify
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:129-202` — current Python `cmd_check()` that produces the JSON output format. Test fixtures must match this format

  **WHY Each Reference Matters**:
  - `index.js:17-63` — shows the exact spawn interface (stdin JSON, stdout JSON, timeout handling) that tests need to mock
  - `trufflehog-guard.py:129-202` — shows the JSON output format with `hookSpecificOutput.permissionDecision` structure

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `__tests__/python-interface.test.js` exists with 6+ test cases
  - [ ] `bun test __tests__/python-interface.test.js` fails (RED phase)
  - [ ] Tests mock subprocess spawn, not call real Python

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Python interface tests are properly structured and fail (RED phase)
    Tool: Bash
    Preconditions: Task 1-2 completed, python-interface.test.js created
    Steps:
      1. Run `bun test __tests__/python-interface.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code is non-zero (tests fail because module doesn't exist)
      3. Assert at least 6 test cases defined
    Expected Result: Tests fail with module-not-found error
    Failure Indicators: Tests pass (implementation exists), fewer than 6 test cases
    Evidence: .omo/evidence/task-4-python-interface-tests-red.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add Python scanner interface tests (RED phase)`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/python-interface.test.js`
  - Pre-commit: `bun test __tests__/python-interface.test.js` (expected to fail)

- [~] 5. Write OpenCode plugin mode tests (RED phase — PC went down, needs re-dispatch)

  **What to do**:
  - Create `__tests__/opencode-plugin.test.js` using `node:test`
  - Test the OpenCode plugin entry point (`plugin()` export):
    - Plugin returns `{ "tool.execute.before": async (input, output) => {...} }`
    - `tool.execute.before` is called with `tool: "Read"` → should proceed to scan
    - `tool.execute.before` is called with `tool: "write"` → should return immediately (not intercepted)
    - Verified finding result → `throw Error` with message containing "verified"
    - Unverified finding result → `throw Error` with message containing "unverified" and "ask" or "approval"
    - Clean file result → no error thrown, function returns undefined
    - Well-known path → `throw Error` with message containing "well-known"
    - Timeout result → `throw Error` with message containing "timeout"
    - Scanner not found → `throw Error` (fail-closed)
  - Mock `runHook` / `scanFile` to return fixture data rather than calling real Python
  - Tests MUST FAIL at this point (module structure doesn't exist yet)

  **Must NOT do**:
  - Do NOT create or modify `index.js` yet
  - Do NOT call real subprocess in tests
  - Do NOT test Claude Code mode here (that's Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6)
  - **Blocks**: Task 9 (OpenCode plugin implementation)
  - **Blocked By**: Task 1 (test infrastructure)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:65-97` — current plugin export structure: `plugin(ctx, options)` returns `{ "tool.execute.before": async (input, output) => {...} }`. Tests must match this exact interface
  - `hooks-opencode/trufflehog-guard/index.js:72-74` — tool filtering: `tool.toLowerCase() !== "read"` returns early. Tests must verify this behavior

  **WHY Each Reference Matters**:
  - `index.js:65-97` — the exact plugin contract that the new implementation must satisfy
  - `index.js:72-74` — the tool filtering logic that must be preserved

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `__tests__/opencode-plugin.test.js` exists with 8+ test cases
  - [ ] `bun test __tests__/opencode-plugin.test.js` fails (RED phase)
  - [ ] Tests mock scanner function, not call real subprocess

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OpenCode plugin tests are properly structured and fail (RED phase)
    Tool: Bash
    Preconditions: Task 1 completed, opencode-plugin.test.js created
    Steps:
      1. Run `bun test __tests__/opencode-plugin.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code is non-zero
      3. Assert at least 8 test cases defined covering: Read intercept, non-Read passthrough, verified deny, unverified ask, clean allow, well-known deny, timeout deny, scanner-not-found deny
    Expected Result: Tests fail with module-not-found error
    Failure Indicators: Tests pass, fewer than 8 test cases
    Evidence: .omo/evidence/task-5-opencode-plugin-tests-red.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add OpenCode plugin mode tests (RED phase)`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/opencode-plugin.test.js`
  - Pre-commit: `bun test __tests__/opencode-plugin.test.js` (expected to fail)

- [x] 6. Write Claude Code CLI mode tests

  **What to do**:
  - Create `__tests__/claude-code-cli.test.js` using `node:test`
  - Test the Claude Code CLI entry point (when `CLAUDE_CODE_HOOK=1` is set):
    - Valid stdin JSON with `tool_name: "Read"` + verified finding → stdout JSON with `permissionDecision: "deny"` and exit code 0
    - Valid stdin JSON with `tool_name: "Read"` + unverified finding → stdout JSON with `permissionDecision: "ask"` and exit code 0
    - Valid stdin JSON with `tool_name: "Read"` + clean file → stdout JSON with `permissionDecision: "allow"` and exit code 0
    - Valid stdin JSON with `tool_name: "Read"` + well-known path → stdout JSON with `permissionDecision: "deny"` and exit code 0
    - Valid stdin JSON with `tool_name: "Bash"` → stdout JSON with `permissionDecision: "allow"` and exit code 0 (passthrough)
    - Invalid/malformed stdin JSON → stdout JSON with `permissionDecision: "deny"` and error message (fail-closed)
    - Missing `CLAUDE_CODE_HOOK` env var → CLI mode not activated (module export path used instead)
  - Test by spawning `node index.js` as subprocess with `CLAUDE_CODE_HOOK=1` env var and piping JSON to stdin
  - Mock the Python scanner subprocess to return fixture data
  - Tests MUST FAIL at this point (CLI mode doesn't exist yet)

  **Must NOT do**:
  - Do NOT create or modify `index.js` or `claude-code.js` yet
  - Do NOT call real Python/trufflehog in tests
  - Do NOT test OpenCode plugin mode here (that's Task 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5)
  - **Blocks**: Task 10 (Claude Code CLI implementation)
  - **Blocked By**: Task 1 (test infrastructure), Task 2 (fixtures)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:129-202` — Python `cmd_check()` shows the exact JSON input/output format that Claude Code uses: stdin `{ "tool_name": "Read", "tool_input": { "file_path": "..." }, "cwd": "..." }`, stdout `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny"|"allow"|"ask", ... } }`

  **API/Type References**:
  - Claude Code hook protocol: stdin JSON with `tool_name`, `tool_input`, `cwd`, `session_id`; stdout JSON with `hookSpecificOutput.permissionDecision`; exit code 0 for structured responses

  **WHY Each Reference Matters**:
  - `trufflehog-guard.py:129-202` — the current JSON protocol format that must be preserved for Claude Code compatibility. The JS CLI mode must produce the same output format

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `__tests__/claude-code-cli.test.js` exists with 7+ test cases
  - [ ] `bun test __tests__/claude-code-cli.test.js` fails (RED phase)
  - [ ] Tests spawn node subprocess with CLAUDE_CODE_HOOK=1, not import in-process

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Claude Code CLI tests are properly structured and fail (RED phase)
    Tool: Bash
    Preconditions: Task 1-2 completed, claude-code-cli.test.js created
    Steps:
      1. Run `bun test __tests__/claude-code-cli.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code is non-zero
      3. Assert at least 7 test cases defined covering: verified deny, unverified ask, clean allow, well-known deny, non-Read passthrough, malformed input, missing env var
    Expected Result: Tests fail with module-not-found or CLI mode not found error
    Failure Indicators: Tests pass, fewer than 7 test cases
    Evidence: .omo/evidence/task-6-claude-code-cli-tests-red.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `test(trufflehog-guard): add Claude Code CLI mode tests (RED phase)`
  - Files: `hooks-opencode/trufflehog-guard/__tests__/claude-code-cli.test.js`
  - Pre-commit: `bun test __tests__/claude-code-cli.test.js` (expected to fail)

- [ ] 7. Implement shared decision module

  **What to do**:
  - Create `hooks-opencode/trufflehog-guard/decision.js` — pure decision logic module
  - Export `decideAction(scanResult, filePath)` that takes the scan result and returns a decision object
  - Decision precedence: verified deny > unverified ask > clean allow
  - Function signature: `decideAction(scanResult: { findings: [{ detector: string, verified: boolean }], wellKnown: string|null, timeout: boolean, scannerMissing: boolean }, filePath: string) => { decision: "allow"|"deny"|"ask", reason?: string, detectors?: string[], verifiedCount?: number, unverifiedCount?: number }`
  - Implementation logic:
    1. If `wellKnown` is set → `{ decision: "deny", reason: "well-known sensitive file: ..." }`
    2. If `scannerMissing` → `{ decision: "deny", reason: "trufflehog not found on PATH" }` (fail-closed)
    3. If `timeout` → `{ decision: "deny", reason: "trufflehog timed out after Xs..." }`
    4. If any `verified: true` finding → `{ decision: "deny", reason: "...verified credential(s) detected in '{filePath}'...", detectors: [...] }`
    5. If any `verified: false` finding (and no verified) → `{ decision: "ask", reason: "...unverified credential candidate(s) detected in '{filePath}'. Ask user before reading.", detectors: [...] }`
    6. Otherwise → `{ decision: "allow" }` (no output)
  - All reason strings must NOT include raw secret values — only detector names and file paths
  - Run `bun test __tests__/decision.test.js` → all tests should now PASS (GREEN phase)

  **Must NOT do**:
  - Do NOT include subprocess spawning logic (that stays in the caller)
  - Do NOT import from `node:child_process` or `node:fs` — this is pure logic
  - Do NOT add console.log or logging — return data only
  - Do NOT duplicate logic from Python script — this replaces the Python decision logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 2 (with Task 8)
  - **Blocks**: Tasks 9, 10 (depend on decision.js)
  - **Blocked By**: Task 3 (decision tests must exist first — TDD)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:129-202` — current Python decision logic. This entire flow must be ported to JS. Study the precedence: well-known → deny, timeout → deny, findings → (currently allow, changing to: verified→deny, unverified→ask), no findings → allow
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:32-41` — ScanResult and Finding TypedDict shapes that the JS function must accept
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:18-29` — WELL_KNOWN_SENSITIVE list (will be moved to JS in Task 11)

  **Test References**:
  - `hooks-opencode/trufflehog-guard/__tests__/decision.test.js` — all tests from Task 3 must pass

  **WHY Each Reference Matters**:
  - `trufflehog-guard.py:129-202` — the decision flow to port. Currently allows all findings; needs verified→deny, unverified→ask logic
  - `trufflehog-guard.py:32-41` — data shapes that `decideAction()` must accept as input
  - `trufflehog-guard.py:18-29` — well-known paths list that will eventually be moved to JS (but for now, the caller passes the wellKnown result)

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `decision.js` exists and exports `decideAction`
  - [ ] `bun test __tests__/decision.test.js` → ALL PASS (GREEN phase)
  - [ ] No raw secret values in any reason string
  - [ ] Verified findings produce `{ decision: "deny" }`
  - [ ] Unverified findings produce `{ decision: "ask" }`
  - [ ] Mixed findings produce `{ decision: "deny" }` (verified precedence)
  - [ ] Clean file produces `{ decision: "allow" }`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Decision module makes correct decisions (TDD GREEN phase)
    Tool: Bash
    Preconditions: decision.js created, decision.test.js from Task 3 exists
    Steps:
      1. Run `bun test __tests__/decision.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code 0 (all tests pass)
      3. Assert no "FAIL" in output
    Expected Result: All 7+ decision tests pass
    Failure Indicators: Any test fails, exit code non-zero
    Evidence: .omo/evidence/task-7-decision-tests-green.txt

  Scenario: No raw secrets in reason strings
    Tool: Bash
    Preconditions: decision.js created
    Steps:
      1. Grep decision.js for patterns that look like secret values (AKIA, private key patterns, etc.)
      2. Assert no matches
    Expected Result: No raw secret patterns found in decision.js
    Failure Indicators: Real-looking secrets found
    Evidence: .omo/evidence/task-7-no-secrets.txt
  ```

  **Commit**: YES
  - Message: `feat(trufflehog-guard): implement shared decision logic module`
  - Files: `hooks-opencode/trufflehog-guard/decision.js`
  - Pre-commit: `bun test __tests__/decision.test.js`

- [ ] 8. Refactor Python script to scanner-only mode

  **What to do**:
  - Modify `hooks-opencode/trufflehog-guard/trufflehog-guard.py`:
    - Remove the decision logic from `cmd_check()` (lines 129-202) — the function should now only scan and return raw results
    - Change `cmd_check()` output format: instead of `hookSpecificOutput.permissionDecision`, return raw scan data:
      ```json
      {
        "findings": [{"detector": "AWS", "verified": true}],
        "wellKnown": null,
        "timeout": false,
        "scannerMissing": false,
        "filePath": "/path/to/file"
      }
      ```
    - Keep `scan_file()`, `trufflehog_bin()`, `normalize()`, `matches_well_known()` functions as-is
    - Keep `WELL_KNOWN_SENSITIVE` list but now expose it as part of the output (move wellKnown check result to output, not decision)
    - Keep `cmd_check()` as the entry point but simplify: read stdin → extract file_path → run well_known check → run scan → output raw result JSON → exit 0
    - Remove all `permissionDecision` logic from Python — this is now handled by JS
    - Keep error handling: trufflehog not found → `scannerMissing: true`, timeout → `timeout: true`
  - Run `python3 -m py_compile trufflehog-guard.py` to verify syntax
  - Run `bun test __tests__/python-interface.test.js` → may need minor adjustments to match new output format

  **Must NOT do**:
  - Do NOT remove `WELL_KNOWN_SENSITIVE` or `matches_well_known` — they still provide value
  - Do NOT change the stdin/stdout subprocess interface — JS still calls `python3 trufflehog-guard.py check`
  - Do NOT add new dependencies to Python script
  - Do NOT remove `--json` or `--no-update` flags from trufflehog invocation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 10 (depend on scanner-only Python)
  - **Blocked By**: Task 4 (Python interface tests must exist first — TDD)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:129-202` — current `cmd_check()` with decision logic. REMOVE all decision logic, keep only: stdin read → file_path extraction → well_known check → scan → raw result output
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:68-107` — `scan_file()` function to keep as-is (returns raw findings)
  - `hooks-opencode/trufflehog-guard/trufflehog-guard.py:110-126` — `matches_well_known()` function to keep as-is

  **Test References**:
  - `hooks-opencode/trufflehog-guard/__tests__/python-interface.test.js` — may need fixture format updates to match new output

  **WHY Each Reference Matters**:
  - `trufflehog-guard.py:129-202` — the entire function body to simplify. Decision logic moves to JS `decision.js`
  - `trufflehog-guard.py:68-107` — must be preserved exactly, this is the core scanner
  - `trufflehog-guard.py:110-126` — must be preserved, but result goes into output data instead of making a deny decision

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Python script compiles: `python3 -m py_compile trufflehog-guard.py` exits 0
  - [ ] Python script returns raw scan data (no `permissionDecision` field)
  - [ ] Python script still handles well-known paths, timeout, scanner-missing as data flags
  - [ ] All python-interface tests pass (may need fixture format updates)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Python script returns raw scan data format
    Tool: Bash
    Preconditions: Python script refactored
    Steps:
      1. Create a safe temp file: `echo "safe content" > /tmp/test-safe.txt`
      2. Run `echo '{"tool_name":"Read","tool_input":{"file_path":"/tmp/test-safe.txt"},"cwd":"/tmp"}' | python3 trufflehog-guard.py check`
      3. Parse output JSON
      4. Assert output has "findings" array (even if empty)
      5. Assert output does NOT have "hookSpecificOutput.permissionDecision"
      6. Clean up temp file
    Expected Result: Python returns raw scan data with findings array, no permission decision
    Failure Indicators: Output contains permissionDecision, JSON parse fails, missing findings field
    Evidence: .omo/evidence/task-8-python-scanner-only.txt

  Scenario: Python script reports well-known path in output
    Tool: Bash
    Preconditions: Python script refactored
    Steps:
      1. Run `echo '{"tool_name":"Read","tool_input":{"file_path":"~/.ssh/id_rsa"},"cwd":"/tmp"}' | python3 trufflehog-guard.py check`
      2. Parse output JSON
      3. Assert output has "wellKnown" field with non-null value
      4. Assert output does NOT have "permissionDecision"
    Expected Result: Python returns wellKnown field, no permission decision
    Failure Indicators: Output contains permissionDecision, wellKnown is null for known sensitive path
    Evidence: .omo/evidence/task-8-python-wellknown.txt
  ```

  **Commit**: YES
  - Message: `refactor(trufflehog-guard): simplify Python to scanner-only mode`
  - Files: `hooks-opencode/trufflehog-guard/trufflehog-guard.py`
  - Pre-commit: `python3 -m py_compile trufflehog-guard.py`

- [ ] 9. Implement dual-mode detection + OpenCode plugin

  **What to do**:
  - Refactor `hooks-opencode/trufflehog-guard/index.js`:
    - Extract shared scanning logic (spawn Python, parse result, call `decideAction`) into reusable functions
    - Keep `plugin()` export for OpenCode mode — returns `{ "tool.execute.before": async (input, output) => {...} }`
    - In `tool.execute.before` handler:
      1. Check `tool === "read"` (case-insensitive)
      2. Extract `filePath` from `output.args` (support `filePath`, `file_path`, `path`)
      3. Call Python scanner, parse raw result
      4. Call `decideAction(scanResult, filePath)` from `decision.js`
      5. If `decision === "deny"` → `throw new Error(reason)`
      6. If `decision === "ask"` → `throw new Error(reason)` (same throw, different reason message suggesting user approval)
      7. If `decision === "allow"` → return undefined (silently allow)
    - Add `CLAUDE_CODE_HOOK` env var detection at module level: if set, the module should NOT export the plugin but instead be usable as a CLI entry point (handled in Task 10)
    - Keep existing exports: `plugin`, `TrufflehogGuard`, `server`, `default`
    - Import and use `decideAction` from `decision.js`
    - Keep `runHook()` function but update it to work with new Python output format (raw data instead of hookSpecificOutput)
    - Keep `readPathFrom()` utility as-is
  - Run `bun test __tests__/opencode-plugin.test.js` → all tests should now PASS (GREEN phase)

  **Must NOT do**:
  - Do NOT remove existing exports (`plugin`, `TrufflehogGuard`, `server`, `default`)
  - Do NOT change the `plugin(ctx, options)` interface signature
  - Do NOT add new npm dependencies
  - Do NOT include any CLI mode code in this task (that's Task 10)
  - Do NOT hardcode well-known paths in JS yet (that's Task 11)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 5 and 7)
  - **Parallel Group**: Wave 2 (sequential after Task 7)
  - **Blocks**: Tasks 11-14 (Wave 3)
  - **Blocked By**: Task 5 (OpenCode plugin tests), Task 7 (decision module), Task 8 (Python refactor)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:1-102` — current full implementation. Study the `plugin()` export, `runHook()` spawn logic, `readPathFrom()` utility, and `tool.execute.before` handler structure. All must be preserved or adapted
  - `hooks-opencode/trufflehog-guard/decision.js` — new module from Task 7 that provides `decideAction()`

  **Test References**:
  - `hooks-opencode/trufflehog-guard/__tests__/opencode-plugin.test.js` — all tests from Task 5 must pass

  **WHY Each Reference Matters**:
  - `index.js:1-102` — the full current implementation that must be refactored. Every line needs to be understood before modifying
  - `decision.js` — the shared decision module that `index.js` must import and use instead of inline logic

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `bun test __tests__/opencode-plugin.test.js` → ALL PASS (GREEN phase)
  - [ ] `index.js` still exports `plugin`, `TrufflehogGuard`, `server`, `default`
  - [ ] Verified finding → throws Error with "verified" in message
  - [ ] Unverified finding → throws Error with "unverified" and "ask" or "approval" in message
  - [ ] Clean file → returns undefined (no error)
  - [ ] Well-known path → throws Error with "well-known" in message

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OpenCode plugin tests pass (TDD GREEN phase)
    Tool: Bash
    Preconditions: index.js refactored, opencode-plugin.test.js from Task 5 exists
    Steps:
      1. Run `bun test __tests__/opencode-plugin.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code 0 (all tests pass)
      3. Assert no "FAIL" in output
    Expected Result: All 8+ OpenCode plugin tests pass
    Failure Indicators: Any test fails, exit code non-zero
    Evidence: .omo/evidence/task-9-opencode-plugin-tests-green.txt

  Scenario: Module exports preserved
    Tool: Bash
    Preconditions: index.js refactored
    Steps:
      1. Run `node -e "const m = require('./index.js'); console.log(typeof m.plugin, typeof m.TrufflehogGuard, typeof m.server)"`
      2. Assert output contains "function function function"
    Expected Result: All three exports are functions
    Failure Indicators: Missing exports, undefined values
    Evidence: .omo/evidence/task-9-exports-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(trufflehog-guard): implement dual-mode detection and OpenCode plugin`
  - Files: `hooks-opencode/trufflehog-guard/index.js`
  - Pre-commit: `bun test __tests__/opencode-plugin.test.js`

- [ ] 10. Implement Claude Code CLI entry point

  **What to do**:
  - Create `hooks-opencode/trufflehog-guard/claude-code.js` — CLI entry point for Claude Code mode
  - Implementation:
    1. Detect `CLAUDE_CODE_HOOK=1` env var (or check if `process.argv[1]` points to this file)
    2. Read stdin JSON (Claude Code hook protocol format):
       ```json
       {
         "session_id": "...",
         "cwd": "/path/to/project",
         "tool_name": "Read",
         "tool_input": { "file_path": "/path/to/file" },
         "hook_event_name": "PreToolUse"
       }
       ```
    3. If `tool_name` is not `"Read"` → output `{ "hookSpecificOutput": { "permissionDecision": "allow" } }` and exit 0
    4. Extract `file_path` from `tool_input` (support `file_path`, `filePath`, `path`)
    5. Normalize path
    6. Check well-known sensitive paths (import list from `decision.js` or shared module)
    7. Spawn Python scanner, parse raw result
    8. Call `decideAction(scanResult, filePath)` from `decision.js`
    9. Map decision to Claude Code output:
       - `"allow"` → `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "allow" } }`
       - `"deny"` → `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason } }`
       - `"ask"` → `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason } }`
    10. Write JSON to stdout and exit 0
    11. On malformed input → `{ "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "Invalid hook input" } }` and exit 0 (fail-closed)
  - Also update `index.js` to conditionally run CLI mode when `CLAUDE_CODE_HOOK=1` env var is set (or add shebang and bin entry)
  - Run `bun test __tests__/claude-code-cli.test.js` → all tests should now PASS (GREEN phase)

  **Must NOT do**:
  - Do NOT use exit code 2 for deny (Claude Code JSON protocol uses exit 0 with `permissionDecision` field)
  - Do NOT include raw secret values in `permissionDecisionReason`
  - Do NOT hardcode well-known paths here (use shared module from `decision.js`)
  - Do NOT change Python script interface

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 6 and 7)
  - **Parallel Group**: Wave 2 (can run parallel with Task 9 if Task 7 is done)
  - **Blocks**: Tasks 11-14 (Wave 3)
  - **Blocked By**: Task 6 (Claude Code tests), Task 7 (decision module)

  **References**:

  **Pattern References**:
  - `hooks-opencode/trufflehog-guard/index.js:17-63` — `runHook()` function that spawns Python and parses output. Same pattern will be used in Claude Code mode but with different decision mapping
  - `hooks-opencode/trufflehog-guard/decision.js` — `decideAction()` function to import and use

  **API/Type References**:
  - Claude Code hook protocol: stdin JSON `{ "tool_name": "Read", "tool_input": { "file_path": "..." }, "cwd": "..." }`, stdout JSON `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny"|"allow"|"ask", "permissionDecisionReason": "..." } }`, exit code 0

  **Test References**:
  - `hooks-opencode/trufflehog-guard/__tests__/claude-code-cli.test.js` — all tests from Task 6 must pass

  **WHY Each Reference Matters**:
  - `index.js:17-63` — the spawn pattern that Claude Code mode will reuse
  - `decision.js` — the shared decision function that maps scan results to deny/ask/allow
  - Claude Code protocol — the exact stdin/stdout format the CLI mode must satisfy

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] `claude-code.js` exists and exports CLI handler
  - [ ] `bun test __tests__/claude-code-cli.test.js` → ALL PASS (GREEN phase)
  - [ ] Verified finding → stdout JSON has `permissionDecision: "deny"`
  - [ ] Unverified finding → stdout JSON has `permissionDecision: "ask"`
  - [ ] Clean file → stdout JSON has `permissionDecision: "allow"`
  - [ ] Non-Read tool → stdout JSON has `permissionDecision: "allow"` (passthrough)
  - [ ] Malformed input → stdout JSON has `permissionDecision: "deny"` (fail-closed)
  - [ ] All outputs use exit code 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Claude Code CLI tests pass (TDD GREEN phase)
    Tool: Bash
    Preconditions: claude-code.js created, claude-code-cli.test.js from Task 6 exists
    Steps:
      1. Run `bun test __tests__/claude-code-cli.test.js` from hooks-opencode/trufflehog-guard/
      2. Assert exit code 0 (all tests pass)
      3. Assert no "FAIL" in output
    Expected Result: All 7+ Claude Code CLI tests pass
    Failure Indicators: Any test fails, exit code non-zero
    Evidence: .omo/evidence/task-10-claude-code-cli-tests-green.txt

  Scenario: Claude Code CLI produces correct JSON output
    Tool: Bash
    Preconditions: claude-code.js created, Python scanner available
    Steps:
      1. Create a safe temp file: `echo "safe content" > /tmp/test-safe-cc.txt`
      2. Run `echo '{"tool_name":"Read","tool_input":{"file_path":"/tmp/test-safe-cc.txt"},"cwd":"/tmp"}' | CLAUDE_CODE_HOOK=1 node claude-code.js`
      3. Parse output JSON
      4. Assert `hookSpecificOutput.permissionDecision === "allow"`
      5. Assert exit code is 0
      6. Clean up
    Expected Result: Clean file produces allow decision with exit 0
    Failure Indicators: JSON parse error, wrong decision, non-zero exit
    Evidence: .omo/evidence/task-10-claude-code-cli-output.txt

  Scenario: No raw secrets in CLI output
    Tool: Bash
    Preconditions: claude-code.js created
    Steps:
      1. Grep claude-code.js for patterns that look like secret values
      2. Assert no real secret patterns found
    Expected Result: No raw secret patterns in any output path
    Failure Indicators: Real-looking secrets found
    Evidence: .omo/evidence/task-10-no-secrets-cli.txt
  ```

  **Commit**: YES
  - Message: `feat(trufflehog-guard): implement Claude Code CLI entry point`
  - Files: `hooks-opencode/trufflehog-guard/claude-code.js`
  - Pre-commit: `bun test __tests__/claude-code-cli.test.js`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

  **Acceptance Criteria**:
  - [ ] All 10 "Must Have" items verified as implemented in codebase
  - [ ] All 8 "Must NOT Have" items verified as absent (grep for patterns: opencode-claude-hooks import, alarm hook changes, real secret values, etc.)
  - [ ] Evidence files exist in `.omo/evidence/` for each task's QA scenarios
  - [ ] All 6 concrete deliverable files exist: `decision.js`, refactored `trufflehog-guard.py`, refactored `index.js`, `claude-code.js`, `.claude/settings.json`, updated `README.md`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test` and linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no raw secrets in any output path.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

  **Acceptance Criteria**:
  - [ ] `bun test` passes with 0 failures
  - [ ] `python3 -m py_compile trufflehog-guard.py` exits 0
  - [ ] No `as any` or `@ts-ignore` in any `.js` file
  - [ ] No `console.log` statements in production code (only in test files)
  - [ ] No raw secret values (AKIA keys, private keys, real passwords) in any file
  - [ ] No commented-out code blocks in production files
  - [ ] All function/variable names are descriptive (no `data`, `result`, `item`, `temp`)

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-mode integration: OpenCode plugin + Claude Code CLI both work. Test edge cases: mixed findings, missing trufflehog binary, timeout, malformed stdin. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

  **Acceptance Criteria**:
  - [ ] Every task's QA scenario evidence exists in `.omo/evidence/`
  - [ ] OpenCode plugin mode: verified → throws Error, unverified → throws Error, clean → returns undefined
  - [ ] Claude Code CLI mode: verified → `permissionDecision: "deny"`, unverified → `permissionDecision: "ask"`, clean → `permissionDecision: "allow"`
  - [ ] Mixed findings: verified takes precedence (deny)
  - [ ] Cross-mode integration: both modes work from same codebase without configuration changes
  - [ ] Edge cases tested: missing trufflehog binary, timeout, malformed stdin JSON, non-Read tool passthrough

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

  **Acceptance Criteria**:
  - [ ] Each task's "What to do" items have corresponding implementation in the diff
  - [ ] Each task's "Must NOT do" items are not violated
  - [ ] No files changed that aren't accounted for in any task
  - [ ] No task touches files from another task's scope (no cross-contamination)
  - [ ] `alarm/` directory is unchanged
  - [ ] No `opencode-claude-hooks` dependency added to `package.json`

---

## Commit Strategy

- **Wave 1**: `test(trufflehog-guard): add TDD test infrastructure and RED-phase tests` — test files, fixtures
- **Task 7-8**: `feat(trufflehog-guard): implement shared decision logic and scanner-only Python` — decision.js, trufflehog-guard.py
- **Task 9-10**: `feat(trufflehog-guard): implement dual-mode entry points (OpenCode + Claude Code)` — index.js, claude-code.js
- **Wave 3**: `docs(trufflehog-guard): update README, Claude Code config, and smoke tests` — README.md, .claude/settings.json, smoke-test.mjs, package.json

---

## Success Criteria

### Verification Commands
```bash
bun test                                          # Expected: all tests pass
node -e "require('./index.js')"                   # Expected: module loads without error
echo '{"tool_name":"Read","tool_input":{"file_path":"/etc/hosts"}}' | CLAUDE_CODE_HOOK=1 node index.js  # Expected: JSON with permissionDecision
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass