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

export interface DbVerificationRow {
  id: string;
  phone: string;
  code: string;
  expires_at: string | null;
  verified: boolean;
  created_at: string | null;
}

export interface VerificationStatus {
  verified: boolean;
  linkedAt?: Date | null;
}
