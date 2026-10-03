import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { LegalDocumentContent } from "@/content/legal/types";
import { APP_NAME, formatLegalDate, LEGAL_EFFECTIVE_DATE, LEGAL_PATHS } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { LegalDocumentView } from "./LegalDocumentView";
import { scrollToLegalSection } from "./scrollToLegalSection";

const FOOTER_LINKS = [
  { to: LEGAL_PATHS.terms, label: "Termos de Uso" },
  { to: LEGAL_PATHS.privacy, label: "Privacidade" },
  { to: LEGAL_PATHS.support, label: "Suporte" },
  { to: LEGAL_PATHS.deleteAccount, label: "Excluir conta" },
];

/**
 * Moldura das páginas públicas de Termos, Privacidade e Suporte: barra com
 * Voltar (respeita a safe area do APK), coluna de leitura e rodapé com os
 * outros documentos. Funciona sem login e dentro do app nativo.
 */
export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  // Aberta por link direto (sem histórico no app): Voltar leva ao início.
  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/", { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-20 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 contrast-more:bg-background">
        <div className="mx-auto flex h-[52px] w-full max-w-2xl items-center justify-between px-2 min-[430px]:px-3">
          <button
            type="button"
            onClick={goBack}
            className="flex min-h-[44px] items-center gap-0.5 rounded-[10px] pr-2 text-body text-primary transition-opacity active:opacity-60"
          >
            <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} aria-hidden="true" />
            Voltar
          </button>
          <span className="flex items-center gap-2 pr-2 text-subhead font-semibold" aria-hidden="true">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-prominent text-prominent-foreground dark:bg-card">
              <BrandMark className="h-4 w-4" />
            </span>
            {APP_NAME}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(max(env(safe-area-inset-bottom),16px)+32px)] pt-4 min-[430px]:px-5">
        {children}

        <footer className="mt-12 border-t border-separator pt-4">
          <nav aria-label="Documentos" className="-mx-2 flex flex-wrap">
            {FOOTER_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={location.pathname === item.to ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-footnote text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
                  "aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="mt-2 text-caption1 text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </footer>
      </main>
    </div>
  );
}

/** Página completa de um documento: abre no topo ou na seção do link (#id). */
export function LegalDocumentPage({ content, version }: { content: LegalDocumentContent; version?: string }) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo?.(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const frame = requestAnimationFrame(() => scrollToLegalSection(id));
    return () => cancelAnimationFrame(frame);
  }, [hash, content]);

  return (
    <LegalPageLayout title={content.title}>
      <LegalDocumentView content={content} updatedAt={formatLegalDate(LEGAL_EFFECTIVE_DATE)} version={version} />
    </LegalPageLayout>
  );
}
