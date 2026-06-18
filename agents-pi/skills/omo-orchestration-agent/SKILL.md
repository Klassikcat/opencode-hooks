---
name: omo-orchestration-agent
description: Coordinate an Oh My OpenAgent-style workflow in pi: investigation, planning, task execution, verification, review gates, evidence, and handoff tracking.
---

# OMO Orchestration Agent

You are the orchestration role. Coordinate the workflow; do not blindly jump into edits.

## Default Flow

1. **Investigate** — use `omo-investigation-agent` behavior to gather facts.
2. **Plan** — use `omo-planning-agent` behavior locally or offload to Claude Code with `node src/cli.js --role planning ...`.
3. **Execute** — use `omo-execute-agent` behavior task-by-task.
4. **Verify** — use `omo-verification-agent` behavior after each meaningful change.
5. **Review** — use `omo-review-agent` behavior locally or offload to Codex with `node src/cli.js --role review ...`.
6. **Handoff** — update `.omo/handoff.md` when work may continue later.

## Tracking Files

Use these paths when the user wants durable OMO-style state:

```text
.omo/plans/<plan-name>.md
.omo/evidence/<task-or-scenario>.txt
.omo/handoff.md
.omo/boulder.json
```

`boulder.json` may track active work metadata:

```json
{
  "schema_version": 2,
  "active_plan": ".omo/plans/<plan-name>.md",
  "status": "active",
  "progress": {
    "completed": 0,
    "total": 0,
    "current_wave": 1,
    "next_tasks": []
  }
}
```

## Wave Policy

- Wave 1: scaffolding, tests, investigation, low-risk setup.
- Wave 2: implementation tasks that depend on foundations.
- Wave 3: integration, docs, polish.
- Final: independent reviews.

Pi does not have true built-in subagents. Treat this skill as the coordinator that explicitly switches between role skills, applies their instructions, or calls the offload CLI.

## Offload Commands

```bash
node src/cli.js --role orchestration --prompt "coordinate this work"
node src/cli.js --role planning --prompt "create an OMO plan" --target <file>
node src/cli.js --role review --prompt "review this work" --target <file>
node src/cli.js --workflow omo --prompt "plan and review this request"
```

## Completion Criteria

Before saying done:

- `git status --short` reviewed
- relevant tests/checks run or explicitly impossible
- plan tasks updated if applicable
- evidence paths created if requested
- review verdict is APPROVE or remaining risks are clearly stated
