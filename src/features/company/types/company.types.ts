export interface CompanySummary {
  id: string;
  name: string;
  currency: string | null;
}

export interface CompanyUser {
  id: string;
  companyId: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}
