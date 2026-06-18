export function buildRolePrompt({ role, prompt, targetContent, targetPath }) {
  const target = targetContent
    ? `\n\n## Review Target: ${targetPath ?? "inline"}\n\n\`\`\`\n${targetContent}\n\`\`\``
    : "";

  switch (role) {
    case "orchestration":
      return `You are the OMO orchestration layer. Coordinate investigation, planning, execution, verification, review, evidence, and handoff. Do not edit directly unless explicitly asked.\n\n## User Request\n${prompt}${target}`;
    case "planning":
      return `You are the OMO planning agent. Produce a concrete .omo-style plan with TL;DR, context, objectives, Must Have, Must NOT Have, verification strategy, waves, dependencies, task acceptance criteria, QA scenarios, and final review gates.\n\n## User Request\n${prompt}${target}`;
    case "review":
      return `You are the OMO review agent. Review for plan compliance, correctness, tests, security, and scope fidelity. Return APPROVE or REQUEST CHANGES with blocking issues. Do not modify files.\n\n## User Request\n${prompt}${target}`;
    default:
      return `${prompt}${target}`;
  }
}
