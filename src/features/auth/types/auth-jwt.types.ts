export interface AuthJwtPayload {
  userId: string;
  companyId: string;
  role: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthenticatedCompanyUser {
  userId: string;
  companyId: string;
  role: string;
  email: string;
}
