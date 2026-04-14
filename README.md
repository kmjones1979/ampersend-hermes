# @ampersend/hermes

Integration package that wires [ampersend](https://ampersend.ai) x402 payment capabilities into [Hermes Agent](https://github.com/anthropics/hermes) across three planes: MCP-based payment proxy, agent identity management via the ampersend dashboard, and client-side spend limit guardrails.

This package is a thin, typed layer over the [`@ampersend_ai/ampersend-sdk`](https://github.com/edgeandnode/ampersend-sdk). It provides opinionated defaults for Hermes workflows — automatic agent setup via the approval flow, Hermes config patching for MCP payment proxying, and pre-flight spend validation — while staying composable enough to use in any agent framework.

## Quick Start (Bootstrap)

**Recommended (Hermes, CI shells, non-TTY):** two-step flow — `start` generates a key and requests approval, `finish` polls and activates.

```bash
cd packages/ampersend-hermes
pnpm install
pnpm bootstrap start --name my-hermes-agent
# Show the user_approve_url to the user — they approve in the ampersend dashboard
pnpm bootstrap finish
```

**One-shot setup (patches Hermes + starts proxy):**

```bash
pnpm setup --name my-hermes-agent
# Requests approval, waits for it, patches Hermes config, starts MCP proxy
# Switch to Hermes and run /reload-mcp
```

## Installation (Manual)

```bash
cd packages/ampersend-hermes
cp .env.example .env
# Fill in AMPERSEND_AGENT_KEY and AMPERSEND_AGENT_ACCOUNT
pnpm install && pnpm build
```

## Configuration

All environment variables are validated at startup with Zod. The variables required for operation are `AMPERSEND_AGENT_KEY` and `AMPERSEND_AGENT_ACCOUNT` — everything else has sensible defaults.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| AMPERSEND\_AGENT\_KEY | Yes | — | 0x-prefixed session key private key (66 chars) |
| AMPERSEND\_AGENT\_ACCOUNT | Yes | — | 0x-prefixed smart account address (42 chars) |
| AMPERSEND\_API\_URL | No | https://api.ampersend.ai | ampersend API base URL |
| AMPERSEND\_NETWORK | No | base | Network: `base` or `base-sepolia` |
| AMPERSEND\_CHAIN\_ID | No | auto from network | Chain ID (8453 for base, 84532 for base-sepolia) |
| AMPERSEND\_MCP\_PROXY\_PORT | No | 3000 | MCP proxy listen port |
| AMPERSEND\_ENV\_FILE | No | — | Absolute path to .env when not next to this package |
| HERMES\_CONFIG\_DIR | No | ~/.hermes | Path to Hermes config directory |

For test isolation, use `loadConfig()` with partial overrides:

```typescript
import { loadConfig } from "@ampersend/hermes";
const cfg = loadConfig({ AMPERSEND_AGENT_KEY: "0x..." });
```

## Patch Hermes Config

Register ampersend under `mcp_servers.ampersend` (tools proxied via x402):

```typescript
import { patchHermesConfig } from "@ampersend/hermes";
await patchHermesConfig("~/.hermes");
```

**Default (`stdio`) — recommended:** writes a **stdio** server entry that runs the ampersend MCP proxy via `npx` with agent credentials in `env`. The proxy handles SIWE authentication and x402 payments internally.

**Optional HTTP (`transport: 'http'`):** connects to an already-running proxy at `http://127.0.0.1:<port>/mcp`:

```typescript
await patchHermesConfig("~/.hermes", { transport: "http", proxyPort: 3000 });
```

**Apply in Hermes** (no full restart required):

```
/reload-mcp
```

## One Command Setup (after bootstrap)

```bash
pnpm setup --name my-hermes-agent --network base
```

This does **everything**:

1. Reads `AMPERSEND_AGENT_KEY` / `AMPERSEND_AGENT_ACCOUNT` from `.env` (runs bootstrap if missing).
2. Patches `~/.hermes/config.yaml` → `mcp_servers.ampersend` (MCP proxy with x402 payments).
3. Starts the MCP proxy → waits for ready → prints "ready".
4. Keeps running (Ctrl+C to stop).

Switch back to Hermes and run `/reload-mcp`. Done.

Options:

```bash
pnpm setup --name my-agent --network base-sepolia    # testnet
pnpm setup --name my-agent --proxy-port 4000          # custom port
pnpm setup --name my-agent --no-proxy                 # patch only, start proxy yourself
pnpm setup --name my-agent --daily-limit 10000000     # 10 USDC daily limit
pnpm setup -h                                          # full help
```

## Authorize Payments

Use the ampersend API to authorize payments with spend limits:

```typescript
import { authorizePayment, getTreasurer } from "@ampersend/hermes";

// Option 1: Direct API authorization
const result = await authorizePayment({
  requirements: [{ scheme: "exact", network: "base", maxAmountRequired: "1000000", ... }],
  context: { method: "tools/call", serverUrl: "https://api.example.com" },
});

// Option 2: Get a pre-configured X402Treasurer for proxy/client use
const treasurer = getTreasurer();
```

## Client-Side Guardrails

Pre-validate payments before they hit the API:

```typescript
import { validatePayment, buildSpendPolicy } from "@ampersend/hermes";

const policy = buildSpendPolicy({
  perTxLimit: "1000000",    // 1 USDC
  dailyLimit: "10000000",   // 10 USDC
  networks: ["base"],
});

validatePayment(
  { amount: "500000", network: "base", resource: "/api/data" },
  policy,
); // passes

validatePayment(
  { amount: "2000000", network: "base", resource: "/api/data" },
  policy,
); // throws SpendLimitViolationError (PER_TX_LIMIT_EXCEEDED)
```

## Agent Management

Create and manage agents through the ampersend approval flow:

```typescript
import {
  requestAgentApproval,
  waitForApproval,
  getAgentStatus,
} from "@ampersend/hermes";

// Request setup approval
const pending = await requestAgentApproval("0xAgentKeyAddress", {
  name: "my-agent",
  dailyLimit: "10000000",
});
console.log("Approve at:", pending.userApproveUrl);

// Wait for user to approve
const result = await waitForApproval(pending.token, {
  timeoutMs: 600_000,
});

// Check status
const status = await getAgentStatus();
```

## Development

```bash
pnpm dev          # watch mode
pnpm test         # run all tests
pnpm test:watch   # watch mode
pnpm build        # compile to dist/
pnpm bootstrap start --name agent    # request approval
pnpm bootstrap finish                # poll + activate
pnpm setup --name agent              # all-in-one
pnpm proxy                           # start MCP proxy only
```

## Architecture

```
src/
  config.ts          — Zod-validated env + runtime config, needsBootstrap() helper
  client.ts          — Singleton wrappers: ApiClient, ApprovalClient, createTreasurer
  dotenv-path.ts     — resolveDotEnvPath (AMPERSEND_ENV_FILE, cwd walk, package .env)
  errors.ts          — Typed error classes (ConfigError, PaymentError, SpendLimitViolationError)
  bootstrap.ts       — Two-phase: start (generate key + request approval) → finish (poll + write .env)
  bootstrap-cli.ts   — CLI: start | finish
  setup.ts           — Unified CLI: bootstrap → patch MCP → start proxy
  mcp/
    index.ts         — buildMcpEntry (proxy URL)
    hermes-config.ts — patchHermesConfig, patchHermesModel, unpatchHermesModel → config.yaml
    proxy-cli.ts     — Standalone MCP proxy runner
  payment/
    index.ts         — Payment authorization and event reporting via ampersend API
    guardrails.ts    — Client-side spend limit validation (network, per-tx)
    history.ts       — Payment record queries (future: API integration)
  agents/
    index.ts         — Agent approval flow: request, check, wait, status
  index.ts           — Public API barrel exports
```

## How It Compares to 1claw-hermes

This package follows the same architectural pattern as [1claw-hermes](https://github.com/1clawAI/1claw-hermes) but integrates ampersend's payment capabilities instead of 1Claw's secrets management:

| 1claw-hermes | ampersend-hermes |
| --- | --- |
| Vault secrets (get/set/list) | x402 payment authorization |
| Shroud LLM proxy (TEE) | MCP payment proxy |
| Subagent identities + policies | Agent approval flow + spend limits |
| Intents API (on-chain tx signing) | x402 payment execution |
| Audit log queries | Payment event tracking |

## License

Apache 2.0
