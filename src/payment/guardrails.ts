import { SpendLimitViolationError } from "../errors.js";

export interface SpendPolicy {
  dailyLimitWei: string | null;
  monthlyLimitWei: string | null;
  perTxLimitWei: string | null;
  allowedNetworks: string[];
  autoTopupAllowed: boolean;
}

export interface PaymentRequest {
  amount: string;
  network: string;
  resource: string;
}

/**
 * Client-side pre-flight check. Throws SpendLimitViolationError
 * with a machine-readable code if any constraint fails.
 * The ampersend API enforces these again server-side.
 */
export function validatePayment(
  request: PaymentRequest,
  policy: SpendPolicy,
): void {
  if (
    policy.allowedNetworks.length > 0 &&
    !policy.allowedNetworks.includes(request.network)
  ) {
    throw new SpendLimitViolationError(
      "NETWORK_NOT_ALLOWED",
      `Network "${request.network}" is not in the allowed list: ${policy.allowedNetworks.join(", ")}`,
    );
  }

  if (
    policy.perTxLimitWei !== null &&
    BigInt(request.amount) > BigInt(policy.perTxLimitWei)
  ) {
    throw new SpendLimitViolationError(
      "PER_TX_LIMIT_EXCEEDED",
      `Payment amount ${request.amount} exceeds per-transaction limit of ${policy.perTxLimitWei}`,
    );
  }

  // Daily and monthly limits require server-side state tracking.
  // The API enforces these — this is a best-effort client-side hint.
  // Full enforcement happens in authorizePayment() via the API.
}

/**
 * Build a SpendPolicy from common parameters.
 */
export function buildSpendPolicy(params: {
  dailyLimit?: string;
  monthlyLimit?: string;
  perTxLimit?: string;
  networks?: string[];
  autoTopup?: boolean;
}): SpendPolicy {
  return {
    dailyLimitWei: params.dailyLimit ?? null,
    monthlyLimitWei: params.monthlyLimit ?? null,
    perTxLimitWei: params.perTxLimit ?? null,
    allowedNetworks: params.networks ?? [],
    autoTopupAllowed: params.autoTopup ?? false,
  };
}
