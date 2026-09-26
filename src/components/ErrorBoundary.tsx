import { Component, ErrorInfo, ReactNode } from "react";

/**
 * Rede de segurança do app.
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira do React
 * e o usuário fica com a página em branco — sem mensagem, sem saída e sem nenhum
 * sinal de diagnóstico. Este boundary transforma esse caso em uma tela legível.
 *
 * Os estilos ficam nesta tela de propósito (um <style> próprio): se a falha envolver
 * o CSS do app, a tela de erro ainda precisa aparecer.
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

/*
 * Estilos autocontidos (um <style> junto da tela), sem depender do CSS do app.
 * Usam os tokens do app quando existem e caem nos valores iOS claro/escuro se o CSS falhar.
 * Layout de estado de erro do iOS (ContentUnavailableView): símbolo, título, texto e ações.
 */
const CSS = `
.ml-eb{--eb-bg:240 24% 96%;--eb-label:0 0% 0%;--eb-label2:240 2% 55%;--eb-card:0 0% 100%;--eb-prom:48 10% 10%;--eb-fill:rgba(120,120,128,.16);
  min-height:100dvh;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
  padding:max(env(safe-area-inset-top),24px) 24px max(env(safe-area-inset-bottom),24px);
  background:hsl(var(--background,var(--eb-bg)));color:hsl(var(--foreground,var(--eb-label)));
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){.ml-eb{--eb-bg:0 0% 0%;--eb-label:0 0% 100%;--eb-label2:240 3% 56%;--eb-card:240 3% 11%;--eb-prom:240 2% 39%;--eb-fill:rgba(120,120,128,.32)}}
.ml-eb-box{width:100%;max-width:360px;display:flex;flex-direction:column;align-items:center;text-align:center}
.ml-eb-symbol{width:48px;height:48px;color:hsl(var(--muted-foreground,var(--eb-label2)));margin-bottom:16px}
.ml-eb-title{margin:0;font-size:22px;line-height:28px;letter-spacing:-.26px;font-weight:700}
.ml-eb-text{margin:8px 0 0;font-size:17px;line-height:22px;letter-spacing:-.43px;color:hsl(var(--muted-foreground,var(--eb-label2)))}
.ml-eb-actions{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:28px}
.ml-eb-btn{appearance:none;border:0;min-height:50px;padding:0 20px;border-radius:9999px;font:inherit;font-size:17px;letter-spacing:-.43px;font-weight:600;cursor:pointer;
  background:hsl(var(--prominent,var(--eb-prom)));color:hsl(var(--prominent-foreground,0 0% 100%))}
.ml-eb-btn.secondary{background:var(--fill-secondary,var(--eb-fill));color:hsl(var(--foreground,var(--eb-label)))}
.ml-eb-btn:active{opacity:.7}
.ml-eb-details{width:100%;margin-top:24px;font-size:13px;line-height:18px;letter-spacing:-.08px;color:hsl(var(--muted-foreground,var(--eb-label2)))}
.ml-eb-details summary{cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:center;gap:4px;list-style:none}
.ml-eb-details summary::-webkit-details-marker{display:none}
.ml-eb-chev{width:14px;height:14px;flex-shrink:0}
.ml-eb-details[open] .ml-eb-chev{transform:rotate(90deg)}
@media (prefers-reduced-motion:no-preference){.ml-eb-chev{transition:transform .2s ease}}
.ml-eb-pre{margin:4px 0 0;padding:12px 16px;border-radius:16px;text-align:left;background:hsl(var(--card,var(--eb-card)));
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:16px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
`;

/** Símbolo SVG inline (lucide: triangle-alert / refresh-cw), também sem depender de CSS. */
function ErrorSymbol({ chunk }: { chunk: boolean }) {
  return (
    <svg
      className="ml-eb-symbol"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {chunk ? (
        <>
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </>
      ) : (
        <>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      )}
    </svg>
  );
}

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
      <div className="ml-eb" role="alert">
        <style>{CSS}</style>
        <div className="ml-eb-box">
          <ErrorSymbol chunk={chunk} />
          <h1 className="ml-eb-title">
            {chunk ? "O app foi atualizado" : "Algo deu errado nesta tela"}
          </h1>
          <p className="ml-eb-text">
            {chunk
              ? "Saiu uma versão nova enquanto você usava o app. Recarregue para carregar a versão atualizada."
              : "A tela não pôde ser exibida. Recarregar costuma resolver; se continuar, envie a mensagem abaixo para o suporte."}
          </p>

          <div className="ml-eb-actions">
            <button type="button" className="ml-eb-btn" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <button type="button" className="ml-eb-btn secondary" onClick={hardReload}>
              Limpar cache e recarregar
            </button>
          </div>

          <details className="ml-eb-details">
            <summary>
              Detalhes técnicos
              {/* Divisa explícita (o marcador nativo some com display:flex); gira ao abrir. */}
              <svg
                className="ml-eb-chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </summary>
            <pre className="ml-eb-pre">
              {error.name}: {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
