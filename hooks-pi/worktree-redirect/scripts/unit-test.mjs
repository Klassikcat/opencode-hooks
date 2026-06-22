import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import worktreeRedirect, {
  measurePlanScope,
  slugify,
  computeWorktreePaths,
  detectGitState,
  decideTrigger,
  createAgentActivity,
} from "../zz-worktree-redirect.js";

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  const result = await execFileAsync("git", args, { cwd });
  return String(result.stdout).trim();
}

async function initRepo(prefix, branch = "main") {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await git(tmp, ["init", "-b", "main"]);
  await git(tmp, ["config", "user.email", "t@t"]);
  await git(tmp, ["config", "user.name", "t"]);
  await git(tmp, ["commit", "--allow-empty", "-m", "init"]);
  if (branch !== "main") await git(tmp, ["checkout", "-b", branch]);
  return tmp;
}

async function fireApproval({ cwd, planText, title = "Runtime Redirect", branchEntries = [{ type: "mode_change", mode: "plan" }], repeat = false }) {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "wt-artifacts-"));
  const local = path.join(artifacts, "local");
  await fs.mkdir(local, { recursive: true });
  await fs.writeFile(path.join(local, "runtime-plan.md"), planText, "utf8");

  const handlers = new Map();
  const pi = {
    setLabel() { },
    on(name, fn) {
      const list = handlers.get(name) ?? [];
      list.push(fn);
      handlers.set(name, list);
    },
  };
  worktreeRedirect(pi);
  const missingReason = { toolName: "resolve", input: { action: "apply" } };
  for (const fn of handlers.get("tool_call") ?? []) await fn(missingReason, {});
  assert.equal(missingReason.input.reason, "User approved the pending action.");

  const suppliedReason = { toolName: "resolve", input: { action: "apply", reason: "Already set." } };
  for (const fn of handlers.get("tool_call") ?? []) await fn(suppliedReason, {});
  assert.equal(suppliedReason.input.reason, "Already set.");


  const notifications = [];
  const ctx = {
    hasUI: true,
    cwd,
    sessionManager: {
      getBranch: () => branchEntries,
      getArtifactsDir: () => artifacts,
      getSessionId: () => `session-${path.basename(cwd)}`,
    },
    ui: { notify: (message, level) => notifications.push({ message, level }) },
  };
  const event = {
    toolName: "resolve",
    input: { action: "apply", extra: { title } },
    isError: false,
    details: { sourceToolName: "plan_approval" },
  };

  async function collectResults() {
    const results = [];
    for (const fn of handlers.get("tool_result") ?? []) {
      const result = await fn(event, ctx);
      if (result) results.push(result);
    }
    return results;
  }

  const results = await collectResults();
  const repeatedResults = repeat ? await collectResults() : [];
  return { results, repeatedResults, notifications, artifacts };
}

async function fireInput({ cwd, text = "/start-work" }) {
  const handlers = new Map();
  const pi = {
    setLabel() { },
    on(name, fn) {
      const list = handlers.get(name) ?? [];
      list.push(fn);
      handlers.set(name, list);
    },
  };
  worktreeRedirect(pi);

  const results = [];
  for (const fn of handlers.get("input") ?? []) {
    const result = await fn({ text }, { cwd });
    if (result) results.push(result);
  }
  return results;
}

async function fireRegisteredCommand({ cwd, args = "" }) {
  const commands = new Map();
  const sentMessages = [];
  const pi = {
    setLabel() { },
    on() { },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    sendUserMessage(message) {
      sentMessages.push(message);
    },
  };
  worktreeRedirect(pi);

  const command = commands.get("start-work");
  assert.ok(command, "expected /start-work to be registered");
  assert.match(command.description, /copied plan/);
  await command.handler(args, { cwd });
  return sentMessages;
}

const tmp = await initRepo("wt-redirect", "main");
try {
  const exec = args => git(tmp, args);
  const state = await detectGitState(exec, tmp);
  assert.equal(state.inRepo, true);
  assert.equal(state.currentBranch, "main");
  assert.equal(state.linkedWorktree, false);
  assert.equal(state.dirtyCount, 0);
  assert.equal(state.defaultBranch, "main");

  assert.equal(decideTrigger(state, measurePlanScope("tiny\nplan"), false).trigger, false);

  const liveDecision = decideTrigger(state, measurePlanScope("tiny\nplan"), true);
  assert.equal(liveDecision.trigger, true);
  assert.ok(liveDecision.reasons.includes("agent-working"));

  const largeDecision = decideTrigger(state, { large: true, fileRefCount: 9, lineCount: 20 }, false);
  assert.equal(largeDecision.trigger, true);
  assert.ok(largeDecision.reasons.includes("large-scope"));

  await git(tmp, ["checkout", "-b", "feat/x"]);
  const featureDecision = decideTrigger(await detectGitState(exec, tmp), measurePlanScope("tiny"), false);
  assert.equal(featureDecision.trigger, true);
  assert.ok(featureDecision.reasons.includes("feature-branch"));

  const refs = measurePlanScope([
    "dir/file0.ts",
    "dir/file1.ts",
    "dir/file2.ts",
    "dir/file3.ts",
    "dir/file4.ts",
    "dir/file5.ts",
    "dir/file6.ts",
  ].join("\n"));
  assert.equal(refs.large, true);
  assert.ok(refs.fileRefCount >= 6);

  assert.equal(measurePlanScope(Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")).large, true);
  assert.equal(measurePlanScope("x `src/a.ts` and `src/a.ts` and bareword").fileRefCount, 1);

  const loopDecision = decideTrigger(
    { inRepo: true, currentBranch: "omp/plan/foo", defaultBranch: "main" },
    { large: true, fileRefCount: 9, lineCount: 300 },
    true,
  );
  assert.equal(loopDecision.skip, true);
  assert.equal(loopDecision.trigger, false);

  const a = createAgentActivity();
  assert.equal(a.isActive(), false);
  a.onToolCall({ toolName: "task" }, "execute");
  a.onToolCall({ toolName: "task" }, "execute");
  assert.equal(a.isActive(), true);
  a.onToolResult({ toolName: "task" }, "execute");
  assert.equal(a.isActive(), true);
  a.onToolResult({ toolName: "task" }, "execute");
  assert.equal(a.isActive(), false);
  a.onToolCall({ toolName: "read" }, "execute");
  assert.equal(a.isActive(), false);

  const b = createAgentActivity();
  b.onToolCall({ toolName: "task" }, "execute");
  b.onToolResult({ toolName: "task", details: { async: { state: "running" } } }, "execute");
  assert.equal(b.isActive(), true);

  const c = createAgentActivity();
  c.onToolCall({ toolName: "task" }, "plan");
  c.onToolResult({ toolName: "task", details: { async: { state: "running" } } }, "plan");
  assert.equal(c.isActive(), false);

  assert.equal(slugify("Worktree Redirect!!"), "worktree-redirect");
  assert.equal(slugify("  "), "plan");
  assert.deepEqual(computeWorktreePaths("/a/b/repo", "s"), {
    branch: "omp/plan/s",
    worktreeRoot: "/a/b/repo.worktrees",
    worktreePath: "/a/b/repo.worktrees/s",
  });
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(`${tmp}.worktrees`, { recursive: true, force: true });
}

const e2e = await initRepo("wt-runtime", "feat/demo");
try {
  const e2eRoot = path.resolve(e2e);
  const { results, repeatedResults } = await fireApproval({ cwd: e2eRoot, planText: "Add demo.txt\n", repeat: true });
  assert.equal(results.length, 1);
  assert.match(results[0].content[0].text, /Plan approved\. Execution handoff created/);
  assert.match(results[0].content[0].text, /trigger: feature-branch/);
  assert.match(results[0].content[0].text, /\/start-work/);
  assert.equal(results[0].details.action, "apply");
  assert.equal(results[0].details.sourceToolName, "plan_approval");
  assert.equal(repeatedResults.length, 1);
  assert.equal(repeatedResults[0].details.action, "apply");
  assert.equal(repeatedResults[0].details.sourceToolName, "plan_approval");

  const worktreePath = path.join(path.dirname(e2eRoot), `${path.basename(e2eRoot)}.worktrees`, "runtime-redirect");
  assert.equal((await git(e2eRoot, ["branch", "--list", "omp/plan/runtime-redirect"])).includes("omp/plan/runtime-redirect"), true);
  assert.equal((await git(e2eRoot, ["worktree", "list", "--porcelain"])).includes(worktreePath), true);
  assert.equal(await fs.readFile(path.join(worktreePath, ".omp", "plans", "runtime-redirect-plan.md"), "utf8"), "Add demo.txt\n");
  await fs.access(path.join(worktreePath, ".omp", ".plan-worktree"));
  const startWorkResult = await fireInput({ cwd: worktreePath });
  assert.equal(startWorkResult.length, 1);
  assert.match(startWorkResult[0].text, /Start implementation now/);
  assert.match(startWorkResult[0].text, /Plan: \.omp\/plans\/runtime-redirect-plan\.md/);

  const suppliedPlanResult = await fireInput({ cwd: worktreePath, text: "/start-work .omp/plans/runtime-redirect-plan.md" });
  assert.equal(suppliedPlanResult.length, 1);
  assert.match(suppliedPlanResult[0].text, /Begin by reading \.omp\/plans\/runtime-redirect-plan\.md/);

  const commandMessages = await fireRegisteredCommand({ cwd: worktreePath, args: ".omp/plans/runtime-redirect-plan.md" });
  assert.equal(commandMessages.length, 1);
  assert.match(commandMessages[0], /Start implementation now/);
  assert.match(commandMessages[0], /Begin by reading \.omp\/plans\/runtime-redirect-plan\.md/);

  const missingMarkerResult = await fireInput({ cwd: e2eRoot });
  assert.equal(missingMarkerResult.length, 1);
  assert.match(missingMarkerResult[0].text, /not an OMP plan worktree/);

  const passThroughResult = await fireInput({ cwd: worktreePath, text: "/not-start-work" });
  assert.equal(passThroughResult.length, 0);
  assert.equal(await git(e2eRoot, ["status", "--porcelain"]), "");
} finally {
  await fs.rm(e2e, { recursive: true, force: true });
  await fs.rm(`${e2e}.worktrees`, { recursive: true, force: true });
}

const neg = await initRepo("wt-neg", "main");
try {
  const negResult = await fireApproval({ cwd: path.resolve(neg), planText: "tiny\nplan\n" });
  assert.equal(negResult.results.length, 0);
  assert.equal((await git(neg, ["worktree", "list", "--porcelain"])).includes("omp/plan/"), false);
} finally {
  await fs.rm(neg, { recursive: true, force: true });
  await fs.rm(`${neg}.worktrees`, { recursive: true, force: true });
}

const loop = await initRepo("wt-loop", "main");
try {
  await git(loop, ["checkout", "-b", "omp/plan/foo"]);
  const loopResult = await fireApproval({ cwd: path.resolve(loop), planText: "src/a.ts\nsrc/b.ts\nsrc/c.ts\nsrc/d.ts\nsrc/e.ts\nsrc/f.ts\n" });
  assert.equal(loopResult.results.length, 0);
} finally {
  await fs.rm(loop, { recursive: true, force: true });
  await fs.rm(`${loop}.worktrees`, { recursive: true, force: true });
}

console.log("worktree-redirect unit test passed");
