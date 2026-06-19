// ~/.omp/agent/extensions/zz-worktree-redirect.js
// Redirects approved large/contended/non-default-branch plans into a dedicated git worktree.
//
// Disable globally by adding this to ~/.omp/agent/config.yml:
//   disabledExtensions: [extension-module:zz-worktree-redirect]
//
// Thresholds, branch naming, and worktree placement are controlled by the
// constants below. This user-level placement applies to all repos; for a single
// repo only, put the same file at <repo>/.omp/extensions/zz-worktree-redirect.js.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const FILES_THRESHOLD = 6;
const LINES_THRESHOLD = 250;
const BRANCH_PREFIX = "omp/plan/";
const WORKTREE_DIR_SUFFIX = ".worktrees";
const SOURCE_TOOL = "plan_worktree_redirect";
const MARKER_REL = ".omp/.plan-worktree";
const BACKGROUND_TTL_MS = 15 * 60_000;

function currentMode(ctx) {
  const branch = ctx.sessionManager.getBranch?.() ?? [];
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "mode_change") {
      return { mode: entry.mode, data: entry.data ?? {} };
    }
  }
  return { mode: "none", data: {} };
}

function localRoot(ctx) {
  const artifactsDir = ctx.sessionManager.getArtifactsDir?.();
  if (artifactsDir) return path.join(artifactsDir, "local");

  const rawSessionId = ctx.sessionManager.getSessionId?.() ?? "session";
  const safeSessionId = String(rawSessionId).replace(/[^a-zA-Z0-9_.-]/g, "_") || "session";
  return path.join("/tmp", "omp-local", safeSessionId);
}

async function newestPlan(ctx) {
  const root = localRoot(ctx);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const plans = await Promise.all(
    entries
      .filter(entry => entry.isFile() && /plan\.md$/i.test(entry.name))
      .map(async entry => {
        const filePath = path.join(root, entry.name);
        const stat = await fs.stat(filePath).catch(() => undefined);
        return stat
          ? { name: entry.name, url: `local://${entry.name}`, filePath, mtimeMs: stat.mtimeMs, size: stat.size }
          : undefined;
      }),
  );

  return plans
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function planKey(ctx, plan) {
  return `${ctx.sessionManager.getSessionId?.() ?? "session"}:${plan.name}:${plan.mtimeMs}:${plan.size}`;
}

function titleFrom(plan, input) {
  const supplied = input?.extra?.title;
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  return plan.name.replace(/\.md$/i, "").replace(/-plan$/i, "");
}

export function slugify(raw) {
  const slug = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug || "plan";
}

export function measurePlanScope(text) {
  const body = String(text ?? "");
  const lineCount = body.split(/\r?\n/).filter(line => line.trim()).length;
  const matches = body.match(/(?<![\w/])[\w.-]+(?:\/[\w.-]+)+(?:\.[A-Za-z0-9]{1,8})?/g) ?? [];
  const refs = new Set(matches.filter(token => token.includes("/")));
  const fileRefCount = refs.size;
  return {
    fileRefCount,
    lineCount,
    large: fileRefCount >= FILES_THRESHOLD || lineCount >= LINES_THRESHOLD,
  };
}

async function optionalGit(execFn, args) {
  try {
    return await execFn(args);
  } catch {
    return "";
  }
}

function resolveGitPath(repoRoot, rawPath) {
  if (!rawPath) return "";
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(repoRoot, rawPath);
}

export async function detectGitState(execFn, cwd) {
  void cwd;
  let repoRoot;
  try {
    repoRoot = await execFn(["rev-parse", "--show-toplevel"]);
  } catch {
    return { inRepo: false };
  }
  if (!repoRoot) return { inRepo: false };

  const currentBranch = await optionalGit(execFn, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const detached = currentBranch === "HEAD";

  let gitDir = await optionalGit(execFn, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  let gitCommonDir = await optionalGit(execFn, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!gitDir) gitDir = resolveGitPath(repoRoot, await optionalGit(execFn, ["rev-parse", "--git-dir"]));
  if (!gitCommonDir) gitCommonDir = resolveGitPath(repoRoot, await optionalGit(execFn, ["rev-parse", "--git-common-dir"]));
  const linkedWorktree = Boolean(gitDir && gitCommonDir && path.resolve(gitDir) !== path.resolve(gitCommonDir));

  const originHead = await optionalGit(execFn, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  let defaultBranch = originHead.replace(/^origin\//, "");
  if (!defaultBranch) {
    for (const candidate of ["main", "master"]) {
      const exists = await optionalGit(execFn, ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`]);
      if (exists) {
        defaultBranch = candidate;
        break;
      }
    }
  }
  if (!defaultBranch) defaultBranch = "main";

  const status = await optionalGit(execFn, ["status", "--porcelain"]);
  const dirtyCount = status.split(/\r?\n/).filter(line => line.trim()).length;

  return { inRepo: true, repoRoot, currentBranch, detached, linkedWorktree, defaultBranch, dirtyCount };
}

export function decideTrigger(state, scope, liveAgents) {
  const skip = !state?.inRepo || state.currentBranch?.startsWith(BRANCH_PREFIX);
  if (skip) return { trigger: false, reasons: [], skip: true };

  const reasons = [];
  if (scope?.large) reasons.push("large-scope");
  if (liveAgents) reasons.push("agent-working");
  if (
    state.detached ||
    state.linkedWorktree ||
    (state.currentBranch && state.currentBranch !== state.defaultBranch)
  ) {
    reasons.push("feature-branch");
  }

  return { trigger: reasons.length > 0, reasons, skip: false };
}

export function computeWorktreePaths(repoRoot, slug) {
  const worktreeRoot = path.join(path.dirname(repoRoot), path.basename(repoRoot) + WORKTREE_DIR_SUFFIX);
  return {
    branch: BRANCH_PREFIX + slug,
    worktreeRoot,
    worktreePath: path.join(worktreeRoot, slug),
  };
}

export function createAgentActivity() {
  let syncPending = 0;
  let lastBackgroundLaunchAt = 0;

  return {
    onToolCall(e, mode) {
      if (e?.toolName !== "task" || mode === "plan") return;
      syncPending += 1;
    },
    onToolResult(e, mode) {
      if (e?.toolName !== "task" || mode === "plan") return;
      syncPending = Math.max(0, syncPending - 1);
      if (e.details?.async?.state === "running") lastBackgroundLaunchAt = Date.now();
    },
    isActive() {
      return syncPending > 0 || Date.now() - lastBackgroundLaunchAt < BACKGROUND_TTL_MS;
    },
  };
}

function parseWorktreeList(text) {
  const records = [];
  let current;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) records.push(current);
      current = undefined;
      continue;
    }
    const space = line.indexOf(" ");
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? "" : line.slice(space + 1);
    if (key === "worktree") {
      if (current) records.push(current);
      current = { worktree: value };
    } else if (current) {
      current[key] = value;
    }
  }
  if (current) records.push(current);
  return records;
}

async function ensureWorktree(git, state, slug, plan, planText) {
  void plan;
  const { branch, worktreeRoot, worktreePath } = computeWorktreePaths(state.repoRoot, slug);
  let selectedPath = worktreePath;
  const baseSha = await git(["rev-parse", "HEAD"]);
  const baseRef = state.detached ? baseSha.slice(0, 12) : state.currentBranch;

  const worktrees = parseWorktreeList(await optionalGit(git, ["worktree", "list", "--porcelain"]));
  const branchRef = `refs/heads/${branch}`;
  const branchWorktree = worktrees.find(record => record.branch === branchRef);
  const pathWorktree = worktrees.find(record => path.resolve(record.worktree) === path.resolve(worktreePath));

  if (branchWorktree?.worktree) {
    selectedPath = branchWorktree.worktree;
  } else if (!pathWorktree) {
    await fs.mkdir(worktreeRoot, { recursive: true });
    const branchExists = await optionalGit(git, ["rev-parse", "--verify", "--quiet", branchRef]);
    if (branchExists) {
      await git(["worktree", "add", worktreePath, branch]);
    } else {
      await git(["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
    }
  }

  const planDest = path.join(selectedPath, ".omp", "plans", `${slug}-plan.md`);
  await fs.mkdir(path.dirname(planDest), { recursive: true });
  await fs.writeFile(planDest, planText, "utf8");
  await fs.writeFile(
    path.join(selectedPath, MARKER_REL),
    JSON.stringify({ slug, branch, baseSha, createdAt: Date.now() }),
    "utf8",
  );

  return { branch, worktreePath: selectedPath, baseSha, baseRef, planRel: path.relative(selectedPath, planDest) };
}

function buildHandoff(wt, decision, state) {
  const lines = [
    `Plan execution redirected to an isolated git worktree (trigger: ${decision.reasons.join(", ")}).`,
    "",
    "Created / reused:",
    `  worktree : ${wt.worktreePath}`,
    `  branch   : ${wt.branch}  (based on ${wt.baseRef} @ ${wt.baseSha.slice(0, 12)})`,
    `  plan     : ${path.join(wt.worktreePath, wt.planRel)}`,
    "",
    `The current checkout (${state.repoRoot} on ${state.currentBranch}) is left untouched; review and merge ${wt.branch} yourself when done.`,
    "",
    "Do NOT implement in this session. Continue in the worktree:",
    "",
    `    cd ${JSON.stringify(wt.worktreePath)} && omp`,
    "",
    `Then implement the plan at ${wt.planRel} in that session.`,
  ];

  if (state.dirtyCount > 0) {
    lines.push(
      "",
      `Note: ${state.dirtyCount} uncommitted file(s) in the current checkout were NOT moved. If the plan builds on them, commit or \`git stash\` here and apply them in the worktree.`,
    );
  }

  return lines.join("\n");
}

function ensureResolveReason(event) {
  if (event?.toolName !== "resolve" || event.input?.action !== "apply") return;
  if (typeof event.input.reason === "string" && event.input.reason.trim()) return;
  event.input.reason = "User approved the pending action.";
}


export default function worktreeRedirect(pi) {
  pi.setLabel?.("Worktree Redirect");

  const activity = createAgentActivity();
  const processed = new Map();

  pi.on("tool_call", (event, ctx) => {
    ensureResolveReason(event);
    if (event?.toolName === "task") activity.onToolCall(event, currentMode(ctx).mode);
  });

  pi.on("tool_result", (event, ctx) => {
    if (event?.toolName === "task") activity.onToolResult(event, currentMode(ctx).mode);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (
      !ctx.hasUI ||
      event.toolName !== "resolve" ||
      event.input?.action !== "apply" ||
      event.isError ||
      event.details?.sourceToolName !== "plan_approval"
    ) {
      return;
    }

    const mode = currentMode(ctx);
    if (mode.mode !== "plan") return;

    const plan = await newestPlan(ctx);
    if (!plan || plan.size === 0) return;

    const slug = slugify(titleFrom(plan, event.input));
    const git = args => execFileAsync("git", args, { cwd: ctx.cwd }).then(result => String(result.stdout).trim());
    const state = await detectGitState(git, ctx.cwd);
    let planText = "";
    try {
      planText = await fs.readFile(plan.filePath, "utf8");
    } catch { }

    const liveAgents = activity.isActive();
    const decision = decideTrigger(state, measurePlanScope(planText), liveAgents);
    if (decision.skip || !decision.trigger) return;

    const key = planKey(ctx, plan);
    const stored = processed.get(key);
    if (stored) {
      return {
        content: [{ type: "text", text: buildHandoff(stored, { ...decision, reasons: stored.reasons }, stored.state) }],
        details: {
          action: "discard",
          reason: "Plan execution redirected to a dedicated git worktree.",
          sourceToolName: SOURCE_TOOL,
          label: "Plan execution redirected to worktree",
        },
        isError: false,
      };
    }

    let wt;
    try {
      wt = await ensureWorktree(git, state, slug, plan, planText);
    } catch (err) {
      ctx.ui.notify?.(`Worktree redirect skipped: ${String(err?.message ?? err)}`, "warn");
      return;
    }

    const storedInfo = { ...wt, reasons: decision.reasons, state };
    processed.set(key, storedInfo);
    ctx.ui.notify?.("Plan execution redirected to a dedicated worktree.", "info");

    return {
      content: [{ type: "text", text: buildHandoff(wt, decision, state) }],
      details: {
        action: "discard",
        reason: "Plan execution redirected to a dedicated git worktree.",
        sourceToolName: SOURCE_TOOL,
        label: "Plan execution redirected to worktree",
      },
      isError: false,
    };
  });
}
