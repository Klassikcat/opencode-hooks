import fs from "node:fs/promises";
import path from "node:path";

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


function reviewPrompt(plan, title, ticket) {
  return [
    "Automatic plan review gate.",
    "",
    `Review the latest plan at ${plan.url} before requesting user approval.`,
    "",
    "1. Spawn exactly one `reviewer` subagent to review the plan file. Use the bundled OMP/Pi `reviewer` agent. The subagent is READ-ONLY: it must not run formatters, tests, project-wide commands, or edit files.",
    "2. Ask the subagent to check whether a competent implementer could execute the plan with zero design decisions, whether all requested outcomes map to concrete steps, whether verification proves the new behavior, and whether any callsites/tests/docs are omitted.",
    "3. If the review finds a blocker, edit the same plan file to fix it, then call `resolve` normally. The gate will run again for the changed plan.",
    "4. If the review passes with no blockers, call `resolve` with `action: \"apply\"`, a reason that mentions the reviewer pass, and exactly this extra object:",
    `   { "title": "${title}", "autoPlanReviewTicket": "${ticket}" }`,
    "",
    "Do not open `/plan-review` directly. Do not invoke OMC, OMC skills, or OMC reviewer agents. The normal approval overlay will open only after the reviewed plan calls `resolve` again with the ticket.",
  ].join("\n");
}

function titleFrom(plan, input) {
  const supplied = input?.extra?.title;
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  return plan.name.replace(/\\.md$/i, "").replace(/-plan$/i, "");
}

function ensureResolveReason(event) {
  if (event?.toolName !== "resolve" || event.input?.action !== "apply") return;
  if (typeof event.input.reason === "string" && event.input.reason.trim()) return;
  event.input.reason = "User approved the pending action.";
}


export default function autoPlanReview(pi) {
  pi.setLabel?.("Auto Plan Review");

  const reviewTickets = new Map();

  pi.on("tool_call", event => {
    ensureResolveReason(event);
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

    const key = planKey(ctx, plan);
    const ticket = reviewTickets.get(key);
    if (ticket && event.input?.extra?.autoPlanReviewTicket === ticket) return;

    const nextTicket = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    reviewTickets.set(key, nextTicket);
    ctx.ui.notify("Plan approval paused; automatic reviewer review is required.", "info");

    return {
      content: [{ type: "text", text: reviewPrompt(plan, titleFrom(plan, event.input), nextTicket) }],
      details: {
        action: "discard",
        reason: "Automatic plan review required before user approval.",
        sourceToolName: "auto_plan_review",
        label: "Plan approval paused",
      },
      isError: false,
    };
  });
}
