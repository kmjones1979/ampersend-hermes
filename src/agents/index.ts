import { getApprovalClient } from "../client.js";
import { config } from "../config.js";
import { AgentError } from "../errors.js";

export interface AgentSetupRequest {
  name: string;
  dailyLimit?: string;
  monthlyLimit?: string;
  perTransactionLimit?: string;
  autoTopup?: boolean;
}

export interface AgentApprovalPending {
  status: "pending";
  token: string;
  userApproveUrl: string;
  agentKeyAddress: string;
}

export interface AgentApprovalResolved {
  status: "resolved";
  agentAddress: string;
  agentKeyAddress?: string;
}

export interface AgentApprovalRejected {
  status: "rejected" | "blocked";
}

export type AgentApprovalStatus =
  | { status: "pending" }
  | AgentApprovalResolved
  | AgentApprovalRejected;

/**
 * Request agent creation approval via the ampersend dashboard.
 * Returns an approval token and URL for the user to visit.
 */
export async function requestAgentApproval(
  agentKeyAddress: string,
  request: AgentSetupRequest,
): Promise<AgentApprovalPending> {
  const client = getApprovalClient();

  const hasSpendConfig =
    request.dailyLimit != null ||
    request.monthlyLimit != null ||
    request.perTransactionLimit != null ||
    request.autoTopup;

  const spendConfig = hasSpendConfig
    ? {
        auto_topup_allowed: request.autoTopup ?? false,
        daily_limit: request.dailyLimit ?? null,
        monthly_limit: request.monthlyLimit ?? null,
        per_transaction_limit: request.perTransactionLimit ?? null,
      }
    : undefined;

  try {
    const response = await client.requestAgentCreation({
      name: request.name ?? null,
      agent_key_address: agentKeyAddress as `0x${string}`,
      spend_config: spendConfig,
    });

    return {
      status: "pending",
      token: response.token,
      userApproveUrl: response.user_approve_url,
      agentKeyAddress,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentError("APPROVAL_REQUEST_FAILED", `Agent approval request failed: ${msg}`);
  }
}

/**
 * Check the status of an approval request.
 */
export async function checkApprovalStatus(
  token: string,
): Promise<AgentApprovalStatus> {
  const client = getApprovalClient();

  try {
    const status = await client.getApprovalStatus(token);

    if (status.status === "pending") {
      return { status: "pending" };
    }

    if (status.status === "resolved" && "agent" in status && status.agent) {
      return {
        status: "resolved",
        agentAddress: status.agent.address,
        agentKeyAddress: status.agent.agent_key_address,
      };
    }

    if (status.status === "rejected" || status.status === "blocked") {
      return { status: status.status };
    }

    return { status: "pending" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentError("APPROVAL_CHECK_FAILED", `Approval status check failed: ${msg}`);
  }
}

/**
 * Poll for approval until resolved, rejected, or timeout.
 */
export async function waitForApproval(
  token: string,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<AgentApprovalStatus> {
  const interval = options.pollIntervalMs ?? 5_000;
  const timeout = options.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await checkApprovalStatus(token);

    if (status.status !== "pending") {
      return status;
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new AgentError("APPROVAL_TIMEOUT", `Approval timed out after ${timeout / 1000}s`);
}

/**
 * Get the current agent configuration status by running `ampersend config status`.
 */
export async function getAgentStatus(): Promise<{
  status: string;
  agentKeyAddress?: string;
  agentAccount?: string;
  network?: string;
}> {
  const { execSync } = await import("node:child_process");

  try {
    const output = execSync("npx -y ampersend config status", {
      encoding: "utf-8",
      timeout: 15_000,
      env: {
        ...process.env as Record<string, string>,
        ...(config.ampersendApiUrl !== "https://api.ampersend.ai"
          ? { AMPERSEND_API_URL: config.ampersendApiUrl }
          : {}),
      },
    }).trim();

    const result = JSON.parse(output);
    if (result.ok && result.data) {
      return {
        status: result.data.status,
        agentKeyAddress: result.data.agentKeyAddress,
        agentAccount: result.data.agentAccount,
        network: result.data.network,
      };
    }

    return { status: result.data?.status ?? "unknown" };
  } catch {
    return { status: "not_initialized" };
  }
}
