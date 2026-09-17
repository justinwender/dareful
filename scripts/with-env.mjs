// Runs a command with .env.local loaded into its environment, optionally in another directory.
//   node scripts/with-env.mjs [--cwd <dir>] <command> [args...]
import { spawnSync } from "node:child_process";

process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
let cwd = process.cwd();
if (args[0] === "--cwd") {
  cwd = args[1] ?? cwd;
  args.splice(0, 2);
}
const [cmd, ...rest] = args;
if (!cmd) {
  console.error("usage: node scripts/with-env.mjs [--cwd <dir>] <command> [args...]");
  process.exit(2);
}
const r = spawnSync(cmd, rest, { cwd, stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
