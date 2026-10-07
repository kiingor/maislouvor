// Supabase puts non-2xx Edge Function payloads in the response context.
export async function functionError(error: unknown, data: unknown): Promise<{ code?: string; error?: string }> {
  const payload = data as { code?: string; error?: string } | null;
  if (payload?.error) return payload;
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === 'function') {
    try { return await context.clone().json(); } catch { /* Use the transport error below. */ }
  }
  return { error: (error as Error | null)?.message ?? 'Confira sua conexão e tente novamente.' };
}
