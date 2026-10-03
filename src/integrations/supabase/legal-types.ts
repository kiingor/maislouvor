// Tipos do aceite dos Termos de Uso e da Política de Privacidade
// (migração 20261003131000_terms_acceptance.sql). Ficam fora de types.ts
// (gerado) para não divergir do schema publicado enquanto a migração não sobe.

/** Colunas de aceite em public.profiles. Gravadas só pela RPC accept_terms. */
export type LegalProfileRow = {
  user_id: string;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_version: string | null;
};

export type LegalTables = {
  profiles: { Row: LegalProfileRow; Insert: never; Update: never; Relationships: [] };
};

export type TermsAcceptanceRecord = {
  terms_accepted_at: string;
  terms_version: string;
  privacy_version: string;
};

export type LegalFunctions = {
  accept_terms: {
    Args: { p_terms_version: string; p_privacy_version: string };
    Returns: TermsAcceptanceRecord;
  };
};
