export const STATUS_SUCCESS = "success";
export const STATUS_FAILED = "failed";
export const STATUS_TIMEOUT = "timeout";

export const DEFAULT_TIMEOUT_MS = 30000;

export class ProviderAdapter {
  constructor(options = {}) {
    this.command = options.command;
    this.timeoutMs = Number(options.timeoutMs ?? process.env.OMC_ACP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.env = { ...process.env, ...(options.env ?? {}) };
  }

  get name() {
    throw new Error("ProviderAdapter.name must be implemented");
  }

  buildInvocation(_request) {
    throw new Error("ProviderAdapter.buildInvocation must be implemented");
  }

  async execute(_request) {
    throw new Error("ProviderAdapter.execute must be implemented");
  }
}
