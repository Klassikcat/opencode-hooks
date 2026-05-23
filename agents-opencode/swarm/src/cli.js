export function main() {
  return "opencode-swarm-agent";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(main());
}
