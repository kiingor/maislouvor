import { Component, ErrorInfo, ReactNode } from "react";

/**
 * Rede de segurança do app.
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira do React
 * e o usuário fica com a página em branco — sem mensagem, sem saída e sem nenhum
 * sinal de diagnóstico. Este boundary transforma esse caso em uma tela legível.
 *
 * Os estilos são inline de propósito: se a falha envolver o CSS, a tela de erro
 * ainda precisa aparecer.
 */

type Props = {
  children: ReactNode;
  /** Identifica onde o erro ocorreu (ex.: "app", "ensaio"). Só para diagnóstico. */
  scope?: string;
};

type State = { error: Error | null };

/** Erro de chunk = o bundle mudou (deploy novo) e o arquivo pedido não existe mais. */
function isChunkError(error: Error): boolean {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically")
  );
}

/** Limpa caches do PWA e service workers antes de recarregar. */
async function hardReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* se a limpeza falhar, recarrega mesmo assim */
  }
  window.location.reload();
}

const S = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#0B0B0C",
    color: "#F2F2F3",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, sans-serif",
  } as const,
  card: { width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" } as const,
  title: { fontSize: "1.35rem", fontWeight: 600, margin: 0, lineHeight: 1.25 } as const,
  text: { fontSize: "0.95rem", lineHeight: 1.6, color: "#A1A1A6", margin: 0 } as const,
  row: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "6px" } as const,
  btn: {
    appearance: "none",
    border: "1px solid #2A2A2D",
    background: "#F2F2F3",
    color: "#0B0B0C",
    borderRadius: "10px",
    padding: "11px 18px",
    fontSize: "0.92rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const,
  btnGhost: {
    appearance: "none",
    border: "1px solid #2A2A2D",
    background: "transparent",
    color: "#F2F2F3",
    borderRadius: "10px",
    padding: "11px 18px",
    fontSize: "0.92rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const,
  details: { marginTop: "8px", fontSize: "0.8rem", color: "#6E6E73" } as const,
  pre: {
    marginTop: "8px",
    padding: "10px 12px",
    background: "#151517",
    border: "1px solid #2A2A2D",
    borderRadius: "8px",
    fontSize: "0.72rem",
    lineHeight: 1.5,
    color: "#A1A1A6",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } as const,
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Único lugar onde este erro fica registrado hoje. Se um dia entrar Sentry
    // ou equivalente, é aqui que ele deve ser reportado.
    console.error(`[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);

    return (
      <div style={S.wrap} role="alert">
        <div style={S.card}>
          <h1 style={S.title}>
            {chunk ? "O app foi atualizado" : "Algo deu errado nesta tela"}
          </h1>
          <p style={S.text}>
            {chunk
              ? "Saiu uma versão nova enquanto você usava o app. Recarregue para carregar a versão atualizada."
              : "A tela não pôde ser exibida. Recarregar costuma resolver; se continuar, envie a mensagem abaixo para o suporte."}
          </p>

          <div style={S.row}>
            <button style={S.btn} onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <button style={S.btnGhost} onClick={hardReload}>
              Limpar cache e recarregar
            </button>
          </div>

          <details style={S.details}>
            <summary style={{ cursor: "pointer" }}>Detalhes técnicos</summary>
            <pre style={S.pre}>
              {error.name}: {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
