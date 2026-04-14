#!/usr/bin/env node
import { parseArgs } from "node:util";
import { config, requireAgentKey, requireAgentAccount } from "../config.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help) {
    process.stderr.write(`Usage: pnpm proxy [--port <number>]

Starts the ampersend MCP proxy server locally.
Reads agent credentials from .env or environment.

Environment:
  AMPERSEND_AGENT_KEY              Agent session key (0x...)
  AMPERSEND_AGENT_ACCOUNT          Agent smart account address (0x...)
  AMPERSEND_API_URL                API URL (default: https://api.ampersend.ai)
  AMPERSEND_NETWORK                Network (default: base)
  AMPERSEND_MCP_PROXY_PORT         Port (default: 3000)
`);
    process.exit(0);
  }

  const port = values.port
    ? parseInt(values.port, 10)
    : config.ampersendMcpProxyPort;

  const agentKey = requireAgentKey();
  const agentAccount = requireAgentAccount();

  const chainId = config.ampersendChainId ??
    (config.ampersendNetwork === "base-sepolia" ? 84532 : 8453);

  console.error(`[ampersend-hermes] Starting MCP proxy on port ${port}...`);
  console.error(`[ampersend-hermes] Agent: ${agentAccount}`);
  console.error(`[ampersend-hermes] Network: ${config.ampersendNetwork} (chain ${chainId})`);

  const { createAmpersendProxy } = await import("@ampersend_ai/ampersend-sdk");

  const { server } = await createAmpersendProxy({
    port,
    smartAccountAddress: agentAccount as `0x${string}`,
    sessionKeyPrivateKey: agentKey as `0x${string}`,
    apiUrl: config.ampersendApiUrl,
    chainId,
  });

  console.error(`[ampersend-hermes] MCP proxy ready at http://127.0.0.1:${port}/mcp`);
  console.error(`[ampersend-hermes] Connect with: http://127.0.0.1:${port}/mcp?target=<server-url>`);

  const shutdown = () => {
    console.error("\n[ampersend-hermes] Shutting down proxy...");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
