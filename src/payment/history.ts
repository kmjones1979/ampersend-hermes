import { getApiClient } from "../client.js";
import { PaymentError } from "../errors.js";

export interface PaymentRecord {
  id: string;
  timestamp: Date;
  amount: string;
  network: string;
  resource: string;
  status: "sending" | "accepted" | "rejected" | "error";
  payTo: string;
}

/**
 * Retrieve recent payment records from the ampersend API.
 *
 * Note: The ampersend API tracks payment events reported via
 * the treasurer. This helper queries those records for
 * audit and display purposes.
 */
export async function recentPayments(limit = 50): Promise<PaymentRecord[]> {
  // The ampersend SDK doesn't expose a direct payment history API
  // at the client level — payment events are reported via the treasurer's
  // onStatus callback. For now, return an empty array.
  // Future: integrate with ampersend's payment history endpoint
  // when it becomes available in the SDK.
  return [];
}
