export interface PayNegotiationResponse {
  jobId?: string;
  accepts?: Array<Record<string, unknown>>;
  challenge?: string;
  qrBase64?: string;
  raw?: unknown;
}

export interface PayVerificationResponse {
  success: boolean;
  txHash?: string;
  statusCode?: number;
  reason?: string;
  raw?: unknown;
}
