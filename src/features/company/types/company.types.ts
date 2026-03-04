export interface CompanySummary {
  id: string;
  name: string;
  vertical: string;
  currency: string | null;
}

export interface CompanyUser {
  id: string;
  companyId: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

export type CompanyProductRecord = Record<string, unknown>;

export type CompanyOrderRecord = Record<string, unknown>;
