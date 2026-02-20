export interface ProvingProofResponse {
  proofPoints?: string[];
  issBase64Details?: string;
  headerBase64?: string;
  addressSeed?: string;
  [key: string]: unknown;
}

export interface ProvingPingResponse {
  status: string;
}
