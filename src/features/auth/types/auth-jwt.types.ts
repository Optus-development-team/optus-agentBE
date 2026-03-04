export type AuthSessionState = 'FULL' | 'PENDING_WHATSAPP';

export interface AuthJwtPayload {
  userId: string;
  companyId: string;
  role: string;
  email: string;
  authState: AuthSessionState;
  phoneVerified: boolean;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthenticatedCompanyUser {
  userId: string;
  companyId: string;
  role: string;
  email: string;
  authState?: AuthSessionState;
  phoneVerified?: boolean;
}
