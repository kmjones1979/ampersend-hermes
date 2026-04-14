# AGENTS.md — ampersend-hermes workspace

This file is read by the agent at session start. It defines how to use ampersend x402 payment capabilities safely inside Hermes.

## ampersend (x402 / agent payments)

- When the user needs **paid HTTP APIs** (x402 / HTTP 402 flows) or **autonomous stablecoin payments within limits**, use the ampersend MCP tools registered under `mcp_servers.ampersend` in Hermes config.
- For direct CLI use (outside MCP), follow `skills/ampersend/SKILL.md` and use the `ampersend` binary on the host.
- **Base mainnet** and the **production ampersend API** (`https://api.ampersend.ai`) are the defaults. Do not change these unless the user explicitly asks.

### Paid HTTP URLs — never use `getApiClient().fetch`

`getApiClient()` wraps the SDK **`ApiClient`**, which only talks to the **ampersend REST API** (SIWE login, `authorizePayment`, etc.). Its internal `fetch` builds URLs as `AMPERSEND_API_URL + path`. Passing a full URL like `https://example.com/...` produces an invalid URL and fails with **`TypeError: fetch failed`**. That is **not** a network outage at the destination.

**Correct ways to hit an x402-paid URL:**

1. **CLI:** `ampersend fetch <url>` or `ampersend fetch --inspect <url>` (no charge).
2. **From this package:** `getPaidFetch()` from `@ampersend/hermes` — it uses `createAmpersendHttpClient` + `wrapFetchWithPayment` (same as the CLI).

Example (after `pnpm build`, with `.env` loaded):

```bash
npx tsx -e "import { getPaidFetch } from './dist/client.js'; const f = getPaidFetch(); f('https://example.com/paid').then(r => r.text()).then(console.log).catch(console.error)"
```

## Inspect before spend

Always check payment requirements before authorizing a payment:

1. Use `ampersend fetch --inspect <url>` to see what a paid endpoint costs before paying.
2. Tell the user what the payment will cost in plain language before proceeding.
3. Only authorize payment after the user confirms, unless they have explicitly granted standing permission to pay within their configured spend limits.

## Security

- **NEVER** ask the user to sign in to the ampersend dashboard in a browser you control. If dashboard or policy changes are required, tell them to do it on **their** device/browser.
- **NEVER** log, echo, or display private keys or session keys (`AMPERSEND_AGENT_KEY`). If the user asks you to show their key, decline and explain why.
- **NEVER** modify spend limits programmatically without explicit user consent.
- Treat payment authorization as irreversible — once a payment is sent, it cannot be undone.

## Parsing output

- CLI commands return JSON. Check `ok` first — treat the call as successful only when `ok` is `true`.
- On failure, surface `error.code` and `error.message` to the user. Do not silently swallow payment errors.
- MCP tool calls through the proxy follow the same pattern — check for x402 errors in the response.

## Red lines

- Do not exfiltrate private data (keys, account addresses, payment history).
- Do not run destructive commands without explicit consent.
- Confirm before any payment above the user's configured per-transaction limit.
- When in doubt, ask before actions that spend funds.

## First run

If `BOOTSTRAP.md` exists in this directory, follow it step by step, then delete it when finished.

## MCP tools

After setup, ampersend tools are available in Hermes under `mcp_servers.ampersend`. The MCP proxy handles x402 payment negotiation automatically — when a tool call returns HTTP 402, the proxy authorizes payment within the agent's configured spend limits and retries.

Run `/reload-mcp` in Hermes after any config changes.

## Session startup checklist

1. Check if ampersend is configured: `ampersend config status`
2. If not configured, follow `BOOTSTRAP.md` or prompt the user to run `pnpm setup`
3. Verify MCP tools are available in Hermes

## Make it yours

Add project-specific conventions, frequently-used paid endpoints, and spend policy notes below as this workspace evolves.
