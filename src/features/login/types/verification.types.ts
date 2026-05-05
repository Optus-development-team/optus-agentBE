export interface IssueCodeResult {
  code: string;
  expiresAt: Date;
}

export interface VerificationRecord {
  phone: string;
  code: string | null;
  expiresAt: Date | null;
  verified: boolean;
  verifiedAt: Date | null;
}

export interface VerificationStatus {
  verified: boolean;
  linkedAt?: Date | null;
}
