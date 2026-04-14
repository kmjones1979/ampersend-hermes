#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  bootstrapStart,
  bootstrapFinish,
} from "./bootstrap.js";
import { ConfigError, AgentError } from "./errors.js";

function usage(): never {
  process.stderr.write(`
Usage: ampersend-hermes-bootstrap [start|finish] [options]

Commands:
  start     Generate an agent key and request approval via the ampersend dashboard
  finish    Poll for approval, activate config, and write .env

Options (start):
  --name          Agent name (required)
  --mode          Setup mode: 'create' (default) or 'connect'
  --agent         Address of existing agent to connect to (connect mode)
  --key-name      Name for the agent key
  --daily-limit   Daily spending limit in atomic units (1000000 = 1 USDC)
  --monthly-limit Monthly spending limit in atomic units
  --per-tx-limit  Per-transaction spending limit in atomic units
  --auto-topup    Allow automatic balance top-up
  --api-url       API base URL (default: https://api.ampersend.ai)
  --network       Network: base (default) or base-sepolia
  --env-path      Path to .env file

Options (finish):
  --poll-interval  Seconds between status checks (default: 5)
  --timeout        Maximum seconds to wait (default: 600)
  --force          Overwrite existing active config
  --env-path       Path to .env file

Recommended flow:
  pnpm bootstrap start --name my-hermes-agent
  # Approve in ampersend dashboard
  pnpm bootstrap finish
`);
  process.exit(0);
}

function shiftArgv(): { cmd: string | undefined; rest: string[] } {
  const argv = process.argv.slice(2);
  const first = argv[0];
  if (first === "start" || first === "finish" || first === "help") {
    return { cmd: first, rest: argv.slice(1) };
  }
  return { cmd: undefined, rest: argv };
}

async function main(): Promise<void> {
  const { cmd, rest } = shiftArgv();

  if (cmd === "help" || (!cmd && rest.length === 0)) usage();

  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: "string" },
      mode: { type: "string" },
      agent: { type: "string" },
      "key-name": { type: "string" },
      "daily-limit": { type: "string" },
      "monthly-limit": { type: "string" },
      "per-tx-limit": { type: "string" },
      "auto-topup": { type: "boolean" },
      "api-url": { type: "string" },
      network: { type: "string" },
      "env-path": { type: "string" },
      "poll-interval": { type: "string" },
      timeout: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help) usage();

  if (cmd === "finish") {
    const result = await bootstrapFinish({
      envPath: values["env-path"],
      apiUrl: values["api-url"],
      pollInterval: values["poll-interval"] ? parseInt(values["poll-interval"], 10) : undefined,
      timeout: values.timeout ? parseInt(values.timeout, 10) : undefined,
      force: values.force,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (cmd === "start" || !cmd) {
    const name = values.name;
    if (!name) {
      process.stderr.write("Error: --name is required\n");
      process.exit(1);
    }

    const result = await bootstrapStart({
      agentName: name,
      mode: values.mode as "create" | "connect" | undefined,
      agentAddress: values.agent,
      keyName: values["key-name"],
      dailyLimit: values["daily-limit"],
      monthlyLimit: values["monthly-limit"],
      perTransactionLimit: values["per-tx-limit"],
      autoTopup: values["auto-topup"],
      apiUrl: values["api-url"],
      envPath: values["env-path"],
      network: values.network,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError || err instanceof AgentError) {
    process.stderr.write(`Error: ${err.message}\n`);
  } else if (err instanceof Error) {
    process.stderr.write(`Error: ${err.message}\n`);
  } else {
    process.stderr.write(`Unknown error: ${String(err)}\n`);
  }
  process.exit(1);
});
