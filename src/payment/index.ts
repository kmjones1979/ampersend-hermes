import { getApiClient, createTreasurer } from "../client.js";
import { PaymentError } from "../errors.js";
import type { X402Treasurer } from "@ampersend_ai/ampersend-sdk";

export interface PaymentAuthorizationRequest {
  requirements: ReadonlyArray<PaymentRequirement>;
  context?: {
    method?: string;
    serverUrl?: string;
    params?: unknown;
  };
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface PaymentAuthorizationResult {
  authorized: boolean;
  recommendedIndex: number | null;
  requirements: Array<{
    requirement: PaymentRequirement;
    limits: {
      dailyRemaining: string;
      monthlyRemaining: string;
    };
  }>;
  rejected: Array<{
    requirement: PaymentRequirement;
    reason: string;
  }>;
}

/**
 * Authorize a payment through the ampersend API.
 * Returns authorization status and remaining spend limits.
 */
export async function authorizePayment(
  request: PaymentAuthorizationRequest,
): Promise<PaymentAuthorizationResult> {
  const client = getApiClient();

  try {
    const response = await client.authorizePayment(
      request.requirements as any,
      request.context,
    );

    return {
      authorized: response.authorized.requirements.length > 0,
      recommendedIndex: response.authorized.recommended,
      requirements: response.authorized.requirements.map((r: any) => ({
        requirement: r.requirement as PaymentRequirement,
        limits: {
          dailyRemaining: r.limits.dailyRemaining,
          monthlyRemaining: r.limits.monthlyRemaining,
        },
      })),
      rejected: response.rejected.map((r: any) => ({
        requirement: r.requirement as PaymentRequirement,
        reason: r.reason,
      })),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PaymentError("AUTH_FAILED", `Payment authorization failed: ${msg}`);
  }
}

export type PaymentEventType =
  | { type: "sending" }
  | { type: "accepted" }
  | { type: "rejected"; reason: string }
  | { type: "error"; reason: string };

/**
 * Report a payment lifecycle event to the ampersend API for tracking.
 */
export async function reportPaymentEvent(
  eventId: string,
  payment: unknown,
  event: PaymentEventType,
): Promise<void> {
  const client = getApiClient();

  try {
    await client.reportPaymentEvent(eventId, payment as any, event as any);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PaymentError("EVENT_REPORT_FAILED", `Failed to report payment event: ${msg}`);
  }
}

/**
 * Get a pre-configured X402Treasurer for use with the MCP proxy
 * or HTTP client. The treasurer handles payment authorization and
 * event reporting automatically.
 */
export function getTreasurer(): X402Treasurer {
  return createTreasurer();
}

export { validatePayment } from "./guardrails.js";
export type { SpendPolicy } from "./guardrails.js";
export { recentPayments, type PaymentRecord } from "./history.js";
