/**
 * Mensagens em português para os erros do Supabase Auth. O `error.message` do Supabase vem em
 * inglês ("Invalid login credentials") e não deve aparecer para o usuário (PrimeTestLab 10957, M-01).
 * Usa o `code` estável do GoTrue e, nas versões que não o enviam, a mensagem original.
 */
type AuthErrorLike = { code?: string | null; message?: string | null; name?: string | null; status?: number | null };

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Email ou senha incorretos.",
  email_not_confirmed: "Confirme seu email antes de entrar. Procure a mensagem de confirmação na sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este email. Tente entrar ou redefinir a senha.",
  email_exists: "Já existe uma conta com este email. Tente entrar ou redefinir a senha.",
  weak_password: "Senha fraca. Use pelo menos 6 caracteres, misturando letras e números.",
  same_password: "A nova senha precisa ser diferente da atual.",
  email_address_invalid: "Email inválido. Confira o endereço digitado.",
  validation_failed: "Confira o email e a senha digitados.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos emails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.",
  signup_disabled: "Novos cadastros estão desativados no momento.",
  email_provider_disabled: "O acesso por email está desativado no momento.",
  user_banned: "Esta conta está suspensa.",
  user_not_found: "Não encontramos uma conta com este email.",
  session_not_found: "Sua sessão expirou. Entre novamente.",
  session_expired: "Sua sessão expirou. Entre novamente.",
  reauthentication_needed: "Por segurança, entre novamente antes de trocar a senha.",
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/user already registered/i, BY_CODE.user_already_exists],
  [/password should be|weak password/i, BY_CODE.weak_password],
  [/different from the old password/i, BY_CODE.same_password],
  [/rate limit|too many requests/i, BY_CODE.over_request_rate_limit],
  [/unable to validate email|invalid email/i, BY_CODE.email_address_invalid],
  [/failed to fetch|network ?error|load failed/i, "Sem conexão com o servidor. Confira sua internet e tente de novo."],
];

export const AUTH_ERROR_FALLBACK = "Não foi possível concluir agora. Tente de novo em instantes.";

export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return AUTH_ERROR_FALLBACK;
  const { code, message, name, status } = error as AuthErrorLike;
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (message) {
    const match = BY_MESSAGE.find(([pattern]) => pattern.test(message));
    if (match) return match[1];
  }
  // supabase-js usa AuthRetryableFetchError (status 0) quando a requisição nem chega ao servidor.
  if (name === "AuthRetryableFetchError" || status === 0) return BY_MESSAGE[BY_MESSAGE.length - 1][1];
  if (status === 429) return BY_CODE.over_request_rate_limit;
  return AUTH_ERROR_FALLBACK;
}
