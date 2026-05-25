export const STATUS_SUCCESS = "success";
export const STATUS_FAILED = "failed";
export const STATUS_TIMEOUT = "timeout";
export const DEFAULT_TIMEOUT_MS = 30000;
export const ENV_PREFIX = "SWARM_";

export class ProviderAdapter {
  constructor(options = {}) {
    const {
      command,
      args = [],
      timeoutMs = DEFAULT_TIMEOUT_MS,
      env = {}
    } = options;

    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.env = env;
  }

  get name() {
    throw new Error("ProviderAdapter subclasses must implement the name getter");
  }

  async execute(prompt, reviewTarget) {
    void prompt;
    void reviewTarget;
    throw new Error("ProviderAdapter subclasses must implement execute()");
  }
}
