import { main } from "../src/cli.js";

if (main() !== "opencode-swarm-agent") {
  throw new Error("Unexpected CLI smoke-test result");
}
