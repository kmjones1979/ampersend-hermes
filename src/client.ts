import {
  ApiClient,
  AmpersendManagementClient,
  ApprovalClient,
} from "@ampersend_ai/ampersend-sdk/ampersend";
import {
  createAmpersendTreasurer,
  createAmpersendHttpClient,
  type X402Treasurer,
  type AmpersendTreasurerConfig,
} from "@ampersend_ai/ampersend-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { config, requireAgentKey, requireAgentAccount } from "./config.js";

let _apiClient: ApiClient | null = null;
let _approvalClient: ApprovalClient | null = null;
let _paidFetch: ReturnType<typeof wrapFetchWithPayment> | null = null;

/**
 * Returns a singleton ApiClient authenticated via SIWE with the agent's
 * session key. Use for ampersend REST methods (`authorizePayment`, `reportPaymentEvent`, etc.).
 *
 * Do **not** use this client to `fetch` arbitrary `https://…` URLs — use {@link getPaidFetch} for x402-paid HTTP.
 */
export function getApiClient(): ApiClient {
  if (!_apiClient) {
    _apiClient = new ApiClient({
      baseUrl: config.ampersendApiUrl,
      sessionKeyPrivateKey: requireAgentKey() as `0x${string}`,
      agentAddress: requireAgentAccount() as `0x${string}`,
      timeout: 30_000,
    });
  }
  return _apiClient;
}

/**
 * Returns a `fetch` that can pay x402-protected URLs (same stack as `ampersend fetch`).
 *
 * Do **not** use {@link getApiClient}'s internal HTTP for arbitrary URLs — `ApiClient` only
 * talks to paths under {@link config.ampersendApiUrl} (SIWE + payment authorization API).
 */
export function getPaidFetch(): ReturnType<typeof wrapFetchWithPayment> {
  if (!_paidFetch) {
    const x402Client = createAmpersendHttpClient({
      smartAccountAddress: requireAgentAccount() as `0x${string}`,
      sessionKeyPrivateKey: requireAgentKey() as `0x${string}`,
      apiUrl: config.ampersendApiUrl,
      network: config.ampersendNetwork,
    });
    _paidFetch = wrapFetchWithPayment(fetch, x402Client);
  }
  return _paidFetch;
}

/**
 * Returns a singleton ApprovalClient for the setup/approval flow.
 * Does not require authentication — used before credentials exist.
 */
export function getApprovalClient(): ApprovalClient {
  if (!_approvalClient) {
    _approvalClient = new ApprovalClient({
      apiUrl: config.ampersendApiUrl,
    });
  }
  return _approvalClient;
}

/**
 * Creates an AmpersendTreasurer that consults the ampersend API before
 * making payments. This is the primary integration point for x402 payments.
 */
export function createTreasurer(
  overrides?: Partial<AmpersendTreasurerConfig>,
): X402Treasurer {
  return createAmpersendTreasurer({
    smartAccountAddress: requireAgentAccount() as `0x${string}`,
    sessionKeyPrivateKey: requireAgentKey() as `0x${string}`,
    apiUrl: config.ampersendApiUrl,
    chainId: config.ampersendChainId ?? (config.ampersendNetwork === "base-sepolia" ? 84532 : 8453),
    ...overrides,
  });
}

/**
 * Creates a ManagementClient for agent CRUD operations.
 * Requires an API key (separate from session key auth).
 */
export function createManagementClient(apiKey: string): AmpersendManagementClient {
  return new AmpersendManagementClient({
    apiKey,
    apiUrl: config.ampersendApiUrl,
  });
}
