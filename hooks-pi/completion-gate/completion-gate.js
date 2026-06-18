// hooks-pi/completion-gate/completion-gate.js
// Lightweight per-step quality gate.
//
// This intentionally does NOT run a session/work-end reviewer audit. When code
// changes are made during a main interactive session, the next completed todo
// step requires the primary agent to run cheap local checks itself: LSP
// diagnostics for changed source files and an existing non-mutating linter when
// one is discoverable. No reviewer subagent is spawned.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";

const execFileAsync = promisify(execFile);
const MUTATING_TOOLS = new Set(["edit", "write", "ast_edit"]);

const GLOBAL_STATE_KEY = "__ompStepQualityGateState";
const SUBAGENT_STATE_KEY = "__ompSubagentQualityGateState";
const SUBAGENT_MAX_RETRIES = 3;

function initialState() {
  return {
    mutationCount: 0,
    lastChecked: 0,
    currentTicket: null,
    ticketAtMutation: -1,
    passedTicket: null,
  };
}

function store() {
  const existing = globalThis[GLOBAL_STATE_KEY];
  if (existing?.sessions instanceof Map && existing?.tickets instanceof Map) {
    return existing;
  }
  const created = { sessions: new Map(), tickets: new Map() };
  globalThis[GLOBAL_STATE_KEY] = created;
  return created;
}

function sessionKey(ctx) {
  return (
    ctx.sessionManager?.getSessionId?.() ??
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.cwd ??
    "default"
  );
}

function stateFor(ctx) {
  const key = sessionKey(ctx);
  const shared = store();
  let state = shared.sessions.get(key);
  if (!state) {
    state = initialState();
    shared.sessions.set(key, state);
  }
  return state;
}

function currentMode(ctx) {
  const branch = ctx.sessionManager?.getBranch?.() ?? [];
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "mode_change") return entry.mode ?? "none";
  }
  return "none";
}

function isPlanMode(ctx) {
  return currentMode(ctx) === "plan";
}

function normalizePathLike(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\\+/g, "/").replace(/\/+$/g, "");
  return normalized || null;
}

function branchHasSessionInit(ctx) {
  const branch = ctx.sessionManager?.getBranch?.() ?? [];
  return branch.some(entry => entry?.type === "session_init");
}

function isSubagentContext(ctx, event) {
  void event;
  if (isPlanMode(ctx)) return false;

  const sessionFile = normalizePathLike(ctx.sessionManager?.getSessionFile?.());
  const artifactsDir = normalizePathLike(ctx.sessionManager?.getArtifactsDir?.());
  if (!sessionFile || !artifactsDir) return false;

  return sessionFile.startsWith(`${artifactsDir}/`) && branchHasSessionInit(ctx);
}

function initialSubagentState() {
  return {
    mutationCount: 0,
    lastChecked: 0,
    currentTicket: null,
    ticketAtMutation: -1,
    passedTicket: null,
    retryCount: 0,
  };
}

function subagentStore() {
  const existing = globalThis[SUBAGENT_STATE_KEY];
  if (existing?.sessions instanceof Map && existing?.tickets instanceof Map) {
    return existing;
  }
  const created = { sessions: new Map(), tickets: new Map() };
  globalThis[SUBAGENT_STATE_KEY] = created;
  return created;
}

function subagentSessionKey(ctx) {
  // The session file is the richest observed subagent invocation key; nested
  // subagents are isolated when the runtime gives each nested call a file.
  return (
    ctx.sessionManager?.getSessionFile?.() ??
    ctx.sessionManager?.getSessionId?.() ??
    ctx.cwd ??
    "default"
  );
}

function subagentStateFor(ctx) {
  const key = subagentSessionKey(ctx);
  const shared = subagentStore();
  let state = shared.sessions.get(key);
  if (!state) {
    state = initialSubagentState();
    shared.sessions.set(key, state);
  }
  return state;
}

function clearSubagentTicket(state) {
  if (state.currentTicket) subagentStore().tickets.delete(state.currentTicket);
  state.currentTicket = null;
  state.ticketAtMutation = -1;
  state.passedTicket = null;
}

function mintSubagentTicket(state, key) {
  clearSubagentTicket(state);
  state.currentTicket = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  state.ticketAtMutation = state.mutationCount;
  subagentStore().tickets.set(state.currentTicket, key);
  return state.currentTicket;
}

function isLspApply(event) {
  if (event.toolName !== "lsp") return false;
  const action = event.input?.action;
  if (action === "rename" || action === "rename_file") return true;
  return action === "code_actions" && event.input?.apply === true;
}

function isMutation(event) {
  if (event.isError) return false;
  if (MUTATING_TOOLS.has(event.toolName)) return true;
  return isLspApply(event);
}

// Subagent yield-gate trigger: a successful mutation, decided by TOOL IDENTITY
// (not by whether a path was extractable) so path-less results — single-section
// hashline edits, `write conflict://` — still gate.
function isCountedMutation(event) {
  if (event.isError) return false;
  const t = event.toolName;
  if (t === "write" || t === "edit") return true;
  if (t === "ast_edit") return event.details?.applied === true;
  if (t === "resolve") return event.details?.action === "apply" && event.details?.sourceToolName === "ast_edit";
  return isLspApply(event);
}

// Best-effort changed-file paths for the syntax floor, read from RESULT details
// (real, resolved, post-unwrap), with a fallback to the edit patch input's
// `[PATH#TAG]` headers for single-section hashline edits whose details omit the
// path. Returns [] when no path is recoverable (floor skips; mutation still counts).
function floorFilesOf(event) {
  const d = event && typeof event.details === "object" && event.details ? event.details : {};
  const out = [];
  const push = v => {
    if (typeof v === "string" && v) out.push(v);
  };
  if (event.toolName === "write") {
    push(d.resolvedPath);
  } else if (event.toolName === "edit") {
    push(d.path);
    if (Array.isArray(d.perFileResults)) for (const r of d.perFileResults) push(r?.path);
    if (out.length === 0) {
      const patch =
        typeof event.input?.input === "string"
          ? event.input.input
          : typeof event.input?._input === "string"
            ? event.input._input
            : "";
      for (const m of patch.matchAll(/\[([^\]\n]+?)#[0-9A-Fa-f]{4}\]/g)) push(m[1]);
      for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) push(m[1].trim());
      for (const m of patch.matchAll(/^\*\*\* Move to: (.+)$/gm)) push(m[1].trim());
    }
  } else if (event.toolName === "ast_edit") {
    if (d.applied === true && Array.isArray(d.files)) for (const f of d.files) push(f);
  } else if (event.toolName === "resolve") {
    if (d.action === "apply" && d.sourceToolName === "ast_edit") {
      const sd = d.sourceResultDetails;
      if (sd && Array.isArray(sd.files)) for (const f of sd.files) push(f);
    }
  }
  return out;
}

const SYNTAX_FLOOR_TIMEOUT_MS = 4000;
const SYNTAX_FLOOR_MAX_FILES = 10;
const PY_PARSE = "import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])";
// Side-effect-free syntax/parse commands keyed by file extension. Languages
// without a cheap, reliable syntax-only checker (notably .ts/.tsx, .json) are
// intentionally absent; the yield gate covers them via `lsp diagnostics`.
const SYNTAX_CHECKERS = {
  ".js": ["node", "--check"],
  ".cjs": ["node", "--check"],
  ".mjs": ["node", "--check"],
  ".py": ["python3", "-c", PY_PARSE],
  ".sh": ["bash", "-n"],
  ".bash": ["bash", "-n"],
  ".rb": ["ruby", "-c"],
};

// Returns null on pass/skip, or { message, log } when a changed file fails to
// parse. Missing checker binary or timeout is treated as SKIP so tooling gaps
// never block a valid edit.
async function runSyntaxFloor(event, ctx) {
  const cwd = typeof ctx.cwd === "string" && ctx.cwd ? ctx.cwd : process.cwd();
  const failures = [];
  let checked = 0;
  for (const raw of floorFilesOf(event)) {
    if (checked >= SYNTAX_FLOOR_MAX_FILES) break;
    if (typeof raw !== "string" || !raw || raw.includes("://")) continue;
    const abs = nodePath.isAbsolute(raw) ? raw : nodePath.resolve(cwd, raw);
    let stat;
    try {
      stat = nodeFs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const checker = SYNTAX_CHECKERS[nodePath.extname(abs).toLowerCase()];
    if (!checker) continue;
    checked += 1;
    const [cmd, ...args] = checker;
    try {
      await execFileAsync(cmd, [...args, abs], { timeout: SYNTAX_FLOOR_TIMEOUT_MS });
    } catch (err) {
      if (err && (err.code === "ENOENT" || err.killed || err.signal)) continue;
      const detail = String((err && (err.stderr || err.stdout || err.message)) || "syntax check failed").trim();
      failures.push({ path: abs, detail: detail.slice(0, 2000) });
    }
  }
  if (failures.length === 0) return null;
  const lines = failures.map(f => `- ${f.path}\n${f.detail}`).join("\n\n");
  return {
    message:
      "SUBAGENT QUALITY GATE — post-edit syntax check FAILED.\n\n" +
      "Your edit was applied to disk, but the changed file(s) do not parse:\n\n" +
      lines +
      "\n\nFix the syntax error with another edit before returning. The edit is recorded.",
    log: { files: failures.map(f => f.path) },
  };
}

function completedTodoStep(event) {
  if (event.isError || event.toolName !== "todo") return false;
  const ops = Array.isArray(event.input?.ops) ? event.input.ops : [];
  return ops.some(op => op?.op === "done" && (op.task || op.phase));
}

function clearTicket(state) {
  if (state.currentTicket) store().tickets.delete(state.currentTicket);
  state.currentTicket = null;
  state.ticketAtMutation = -1;
  state.passedTicket = null;
}

function mintTicket(state, key) {
  clearTicket(state);
  state.currentTicket = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  state.ticketAtMutation = state.mutationCount;
  store().tickets.set(state.currentTicket, key);
  return state.currentTicket;
}

function subagentStepInstruction(ticket) {
  return [
    "SUBAGENT QUALITY GATE — self-check before returning to the parent agent.",
    "",
    "This subagent changed files or applied a mutating LSP action. Before your final return:",
    "",
    "1. Identify the files you changed in this subagent turn.",
    "2. Run a syntax/parse check for changed source files when your available tools can do so, e.g. `node --check`, `python -m py_compile`, `sh -n`, `ruby -c`, or an equivalent parser.",
    "3. Run LSP diagnostics for changed source files when an LSP tool is available.",
    "4. Run existing non-mutating formatter/linter checks when discoverable and reasonably scoped. Do not install dependencies or run mutating fixers.",
    "5. Run targeted tests only when an obvious narrow test exists and your available tools can execute it.",
    "6. If no quality tools are available in this subagent context, call `subagent_quality_pass` with verdict `SKIPPED` and a concrete no-tools reason.",
    "7. If any check FAILS, call `subagent_quality_pass` with verdict `FAIL`, the failing evidence, and the concrete issue. Then fix the issue, rerun checks, and call this tool again. Do not return normally after a FAIL unless the retry cap response explicitly tells you the gate is terminal.",
    "8. Only after all available checks PASS, or are explicitly SKIPPED because no quality tools are available, call `subagent_quality_pass` with ticket \"" + ticket + "\", verdict `PASS` or `SKIPPED`, and short evidence for `syntax`, `lsp`, `linter`, plus optional `formatter`/`tests` evidence.",
    "9. After your verdict is recorded, call `yield` again with your final result to return to the parent agent.",
    "",
    "Keep this self-gate local and deterministic: no reviewer subagents, no auditor subagents, no broad architecture/security review.",
  ].join("\n");
}

function subagentFixInstruction(ticket, retryCount, reason) {
  return [
    "SUBAGENT QUALITY GATE FAIL — self-fix required before returning.",
    "",
    "The subagent reported a failing check for ticket \"" + ticket + "\".",
    "Reason: " + reason,
    "Retry " + retryCount + " of " + SUBAGENT_MAX_RETRIES + ".",
    "",
    "Fix the concrete failure with your available tools, rerun the failed check and any impacted cheap checks, then call `subagent_quality_pass` again with verdict `PASS`, `SKIPPED` only if no quality tools are available, or `FAIL` if the problem remains.",
    "Do not return normally to the parent agent while this gate is failing.",
  ].join("\n");
}

function subagentMaxRetriesInstruction(ticket, retryCount, reason) {
  return [
    "SUBAGENT QUALITY GATE TERMINAL FAIL — retry cap reached.",
    "",
    "Ticket: " + ticket,
    "Reason: " + reason,
    "Retries: " + retryCount + " of " + SUBAGENT_MAX_RETRIES + ".",
    "",
    "Return deterministic failure content to the parent agent now. State that the subagent quality gate could not pass within the retry cap and include the last failing evidence. Do not continue retrying this gate.",
  ].join("\n");
}

function normalizeVerdict(value) {
  const verdict = String(value ?? "").trim().toUpperCase();
  if (verdict === "PASS" || verdict === "FAIL" || verdict === "SKIPPED") return verdict;
  return "";
}

function logSubagentGateMarker(marker, details) {
  console.error(`${marker} ${JSON.stringify(details)}`);
}

function stepInstruction(ticket) {
  return [
    "STEP QUALITY GATE — lightweight checks before continuing to the next step.",
    "",
    "Code changed since the last completed step. Before starting the next todo step:",
    "",
    "1. Determine the files changed in this step. In a git repo use `git --no-pager diff --stat`, `git --no-pager diff`, and `git status --porcelain`; otherwise use the files edited this session.",
    "2. Run a syntax/parse check for changed source files when a cheap file-scoped checker exists, e.g. `node --check`, `python -m py_compile`, `sh -n`, `ruby -c`, or an equivalent parser. Report SKIPPED when no safe checker exists.",
    "3. Run `lsp diagnostics` for changed source files when an LSP is available. Skip prose/assets/generated files and report SKIPPED when no LSP supports the file type.",
    "4. Run existing non-mutating formatter and linter checks when discoverable and reasonably scoped. Do not install dependencies, run mutating fixers, or run broad project-wide commands for this step. Report SKIPPED when unavailable.",
    "5. Run targeted tests only when there is an obvious test file or narrow command for the changed behavior. Do not run the full suite from this step gate unless it is already the narrow command. Report SKIPPED when no targeted test exists.",
    "6. If any check FAILS, fix the concrete issue in this same primary-agent flow, rerun the failed check, and only continue once it is PASS or explicitly SKIPPED for a valid reason. Do not spawn a reviewer/auditor subagent for failures.",
    "7. When checks are PASS or explicitly SKIPPED for this state, call `step_quality_pass` with ticket \"" + ticket + "\" and short evidence for `syntax`, `lsp`, `linter`, plus optional `formatter`/`tests` evidence.",
    "",
    "Keep this gate local and deterministic: no reviewer subagents, no architecture audits, no broad security reviews.",
  ].join("\n");
}

export default function completionGate(pi) {
  pi.setLabel?.("Step Quality Gate");
  const z = pi.zod;

  pi.registerTool({
    name: "step_quality_pass",
    label: "Step Quality Gate Pass",
    description:
      "Record that the current todo-step quality gate passed after direct syntax, LSP, linter, and optional narrow checks, or explicit skips.",
    parameters: z.object({
      ticket: z.string().describe("The step-quality-gate ticket from the gate instruction."),
      syntax: z.string().describe("Short PASS/SKIPPED/FAIL evidence for syntax or parse checks."),
      lsp: z.string().describe("Short PASS/SKIPPED/FAIL evidence for LSP diagnostics."),
      linter: z.string().describe("Short PASS/SKIPPED/FAIL evidence for the linter check."),
      formatter: z.string().optional().describe("Optional PASS/SKIPPED/FAIL evidence for formatter checks."),
      tests: z.string().optional().describe("Optional PASS/SKIPPED/FAIL evidence for targeted tests."),
    }),
    async execute(_id, params) {
      const ticket = String(params?.ticket ?? "").trim();
      const shared = store();
      const key = shared.tickets.get(ticket);
      const state = key ? shared.sessions.get(key) : undefined;
      let accepted = false;

      if (state && state.currentTicket === ticket && state.ticketAtMutation === state.mutationCount) {
        state.passedTicket = ticket;
        state.lastChecked = state.mutationCount;
        clearTicket(state);
        accepted = true;
      }

      return {
        content: [
          {
            type: "text",
            text: accepted
              ? `Recorded step quality pass for ticket ${ticket}.`
              : `Ignored stale or unknown step quality ticket ${ticket}.`,
          },
        ],
        details: {
          ticket,
          accepted,
          sessionKey: key ?? null,
          mutationCount: state?.mutationCount ?? null,
          syntax: String(params?.syntax ?? ""),
          lsp: String(params?.lsp ?? ""),
          linter: String(params?.linter ?? ""),
          formatter: String(params?.formatter ?? ""),
          tests: String(params?.tests ?? ""),
        },
      };
    },
  });

  pi.registerTool({
    name: "subagent_quality_pass",
    label: "Subagent Quality Gate Verdict",
    description:
      "Record the subagent return self-gate verdict for a subagent-only ticket: PASS, FAIL, or SKIPPED when no quality tools are available.",
    parameters: z.object({
      ticket: z.string().describe("The subagent-quality-gate ticket from the gate instruction."),
      verdict: z.enum(["PASS", "FAIL", "SKIPPED"]).describe("Gate verdict for this subagent self-check."),
      reason: z.string().describe("Concrete reason for PASS, FAIL, or SKIPPED. SKIPPED must explain unavailable quality tools."),
      syntax: z.string().optional().describe("Short PASS/SKIPPED/FAIL evidence for syntax or parse checks."),
      lsp: z.string().optional().describe("Short PASS/SKIPPED/FAIL evidence for LSP diagnostics."),
      linter: z.string().optional().describe("Short PASS/SKIPPED/FAIL evidence for the linter check."),
      formatter: z.string().optional().describe("Optional PASS/SKIPPED/FAIL evidence for formatter checks."),
      tests: z.string().optional().describe("Optional PASS/SKIPPED/FAIL evidence for targeted tests."),
    }),
    async execute(_id, params) {
      const ticket = String(params?.ticket ?? "").trim();
      const verdict = normalizeVerdict(params?.verdict);
      const reason = String(params?.reason ?? "").trim() || "no reason provided";
      const shared = subagentStore();
      const key = shared.tickets.get(ticket);
      const state = key ? shared.sessions.get(key) : undefined;
      const valid = Boolean(state && state.currentTicket === ticket && state.ticketAtMutation === state.mutationCount);
      const evidence = {
        syntax: String(params?.syntax ?? ""),
        lsp: String(params?.lsp ?? ""),
        linter: String(params?.linter ?? ""),
        formatter: String(params?.formatter ?? ""),
        tests: String(params?.tests ?? ""),
      };

      if (!valid || !verdict) {
        return {
          content: [
            {
              type: "text",
              text: !verdict
                ? `Ignored subagent quality ticket ${ticket}: verdict must be PASS, FAIL, or SKIPPED.`
                : `Ignored stale or unknown subagent quality ticket ${ticket}.`,
            },
          ],
          details: {
            ticket,
            accepted: false,
            sessionKey: key ?? null,
            mutationCount: state?.mutationCount ?? null,
            verdict,
            reason,
            ...evidence,
          },
        };
      }

      if (verdict === "PASS") {
        state.passedTicket = ticket;
        state.lastChecked = state.mutationCount;
        state.retryCount = 0;
        logSubagentGateMarker("SUBAGENT_GATE_PASS", {
          sessionKey: key,
          ticket,
          mutationCount: state.mutationCount,
          reason: `subagent self-check passed: ${reason}`,
          ...evidence,
        });
        clearSubagentTicket(state);
        return {
          content: [{ type: "text", text: `Recorded subagent quality PASS for ticket ${ticket}.` }],
          details: {
            ticket,
            accepted: true,
            terminal: true,
            sessionKey: key,
            mutationCount: state.mutationCount,
            verdict,
            reason,
            retryCount: state.retryCount,
            ...evidence,
          },
        };
      }

      if (verdict === "SKIPPED") {
        state.passedTicket = ticket;
        state.lastChecked = state.mutationCount;
        state.retryCount = 0;
        logSubagentGateMarker("SUBAGENT_GATE_SKIPPED_NO_QUALITY_TOOLS", {
          sessionKey: key,
          ticket,
          mutationCount: state.mutationCount,
          reason: `subagent reported no available quality tools: ${reason}`,
          ...evidence,
        });
        clearSubagentTicket(state);
        return {
          content: [{ type: "text", text: `Recorded subagent quality SKIPPED_NO_QUALITY_TOOLS for ticket ${ticket}.` }],
          details: {
            ticket,
            accepted: true,
            terminal: true,
            sessionKey: key,
            mutationCount: state.mutationCount,
            verdict,
            reason,
            retryCount: state.retryCount,
            skipReason: "NO_QUALITY_TOOLS",
            ...evidence,
          },
        };
      }

      state.retryCount += 1;
      if (state.retryCount >= SUBAGENT_MAX_RETRIES) {
        state.lastChecked = state.mutationCount;
        logSubagentGateMarker("SUBAGENT_GATE_FAIL_MAX_RETRIES", {
          sessionKey: key,
          ticket,
          mutationCount: state.mutationCount,
          retryCount: state.retryCount,
          maxRetries: SUBAGENT_MAX_RETRIES,
          reason: `subagent quality gate failed at retry cap: ${reason}`,
          ...evidence,
        });
        const retryCount = state.retryCount;
        clearSubagentTicket(state);
        return {
          content: [{ type: "text", text: subagentMaxRetriesInstruction(ticket, retryCount, reason) }],
          details: {
            ticket,
            accepted: false,
            terminal: true,
            sessionKey: key,
            mutationCount: state.mutationCount,
            verdict,
            reason,
            retryCount,
            maxRetries: SUBAGENT_MAX_RETRIES,
            ...evidence,
          },
          isError: true,
        };
      }

      logSubagentGateMarker("SUBAGENT_GATE_FAIL", {
        sessionKey: key,
        ticket,
        mutationCount: state.mutationCount,
        retryCount: state.retryCount,
        maxRetries: SUBAGENT_MAX_RETRIES,
        reason: `subagent quality gate failed and requires self-fix: ${reason}`,
        ...evidence,
      });
      return {
        content: [{ type: "text", text: subagentFixInstruction(ticket, state.retryCount, reason) }],
        details: {
          ticket,
          accepted: false,
          terminal: false,
          sessionKey: key,
          mutationCount: state.mutationCount,
          verdict,
          reason,
          retryCount: state.retryCount,
          maxRetries: SUBAGENT_MAX_RETRIES,
          ...evidence,
        },
      };
    },
  });

  // Backward-compatible no-op for sessions or prompts that still mention the old
  // completion gate. It no longer authorizes a stop hook and no longer triggers
  // a reviewer/auditor flow.
  pi.registerTool({
    name: "gate_pass",
    label: "Deprecated Completion Gate Pass",
    description: "Deprecated no-op. Completion/session-end reviewer gates are disabled; use step_quality_pass for todo-step checks.",
    parameters: z.object({
      ticket: z.string().optional(),
    }),
    async execute(_id, params) {
      return {
        content: [{ type: "text", text: "Completion/session-end reviewer gate is disabled. Use step_quality_pass for step checks." }],
        details: { accepted: false, deprecated: true, ticket: params?.ticket ?? null },
      };
    },
  });

  pi.on("tool_result", async (event, ctx) => {
    if (isSubagentContext(ctx, event)) {
      const subagentState = subagentStateFor(ctx);
      if (isCountedMutation(event)) {
        subagentState.mutationCount += 1;
        clearSubagentTicket(subagentState);
        const failure = await runSyntaxFloor(event, ctx);
        if (failure) {
          logSubagentGateMarker("SUBAGENT_GATE_SYNTAX_FAIL", {
            sessionKey: subagentSessionKey(ctx),
            mutationCount: subagentState.mutationCount,
            files: failure.log.files,
          });
          return { isError: true, content: [{ type: "text", text: failure.message }] };
        }
      }
      return;
    }

    const state = stateFor(ctx);

    if (isPlanMode(ctx)) {
      clearTicket(state);
      state.mutationCount = 0;
      state.lastChecked = 0;
      return;
    }

    if (event.toolName === "step_quality_pass" && event.details?.accepted === true) {
      state.lastChecked = Number(event.details.mutationCount ?? state.mutationCount);
      clearTicket(state);
      return;
    }

    if (isMutation(event)) {
      state.mutationCount += 1;
      clearTicket(state);
      return;
    }

    if (!ctx.hasUI || ctx.hasPendingMessages?.() || !completedTodoStep(event)) return;
    if (state.mutationCount <= state.lastChecked) return;

    const ticket =
      state.currentTicket && state.ticketAtMutation === state.mutationCount
        ? state.currentTicket
        : mintTicket(state, sessionKey(ctx));

    ctx.ui?.notify?.("Step quality gate: run LSP/linter checks before the next todo step.", "info");
    return {
      content: [{ type: "text", text: stepInstruction(ticket) }],
      details: {
        sourceToolName: "step_quality_gate",
        label: "Step quality gate",
        ticket,
        mutationCount: state.mutationCount,
      },
      isError: false,
    };
  });

  // Subagent return gate. `turn_end`/`session_stop` cannot enforce for subagents
  // (turn_end results are discarded by the runner; session_stop is not emitted to
  // sub-agents), so block the `yield` tool until the subagent records a verdict.
  // A blocked yield errors without terminating the subagent (yieldCalled requires
  // a non-error yield result), so it stays live, reads this instruction, runs
  // checks, calls `subagent_quality_pass`, then re-yields. mutationCount is
  // advanced by the tool_result handler above.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "yield") return;
    if (!isSubagentContext(ctx, event) || isPlanMode(ctx)) return;

    const subagentState = subagentStateFor(ctx);
    if (subagentState.mutationCount <= subagentState.lastChecked) return;

    const key = subagentSessionKey(ctx);
    const reuse =
      subagentState.currentTicket && subagentState.ticketAtMutation === subagentState.mutationCount;
    const ticket = reuse ? subagentState.currentTicket : mintSubagentTicket(subagentState, key);

    if (!reuse) {
      logSubagentGateMarker("SUBAGENT_GATE_MUTATION_DETECTED", {
        sessionKey: key,
        ticket,
        mutationCount: subagentState.mutationCount,
        retryCount: subagentState.retryCount,
        sourceHook: "tool_call:yield",
        reason: "mutating subagent work requires self-check verdict before return",
      });
    }

    return { block: true, reason: subagentStepInstruction(ticket) };
  });

  // No session-end hook. Finishing a work turn or session still does not spawn a
  // code-reviewer/auditor subagent.
}
