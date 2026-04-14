# BOOTSTRAP.md — First run

You are booting a workspace built for **ampersend** (x402 agent payments) on **Hermes**.

Follow each step below. Delete this file when finished.

## 1) Install dependencies

On the host where Hermes runs:

```bash
cd ampersend-hermes
pnpm install
```

## 2) Set up the agent

### Option A: One command (recommended)

```bash
pnpm setup --name "my-hermes-agent"
```

This generates a key, requests approval, patches Hermes config, and starts the MCP proxy. It will print a `user_approve_url` — the **human** must open that URL in **their own browser** (not one the agent controls) and approve.

### Option B: Two-step flow

```bash
pnpm bootstrap start --name "my-hermes-agent"
```

Show the `user_approve_url` from the output to the human. After they approve:

```bash
pnpm bootstrap finish
```

### Option C: Manual config

If the human already has an agent key and account address:

```bash
cp .env.example .env
# Edit .env: set AMPERSEND_AGENT_KEY and AMPERSEND_AGENT_ACCOUNT
pnpm build
```

## 3) Verify

```bash
ampersend config status
```

Should show `"status": "ready"` with an `agentAccount` address.

## 4) Reload Hermes MCP

Switch to Hermes and run:

```
/reload-mcp
```

The ampersend MCP tools should now be available.

## 5) Test

Try inspecting a paid endpoint (no funds spent):

```bash
ampersend fetch --inspect https://api.example.com/paid-endpoint
```

From TypeScript, use **`getPaidFetch()`** from `@ampersend/hermes` for paid URLs — **not** `getApiClient().fetch(...)`, which only works for ampersend API paths (see README “Fetch paid (x402) URLs”).

## 6) Done

Delete this file:

```bash
rm BOOTSTRAP.md
```

The workspace is ready. See `AGENTS.md` for ongoing usage rules and `skills/ampersend/SKILL.md` for command reference.
