export interface GasPaymentDto {
  objectId: string;
  version: string;
  digest: string;
}

export interface PaybeSignatureData {
  bytes: string;
  signature: string;
  gasOwner?: string;
  gasPayments?: GasPaymentDto[];
}

export interface PaybeStandardResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
