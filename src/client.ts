import {
  ApiClient,
  AmpersendManagementClient,
  ApprovalClient,
} from "@ampersend_ai/ampersend-sdk/ampersend";
import {
  createAmpersendTreasurer,
  type X402Treasurer,
  type AmpersendTreasurerConfig,
} from "@ampersend_ai/ampersend-sdk";
import { config, requireAgentKey, requireAgentAccount } from "./config.js";

let _apiClient: ApiClient | null = null;
let _approvalClient: ApprovalClient | null = null;

/**
 * Returns a singleton ApiClient authenticated via SIWE with the agent's
 * session key. Handles payment authorization and event reporting.
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
