import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL_PATHS, type LegalDocKind } from "@/lib/legal";
import { cn } from "@/lib/utils";

const INLINE_LINK = "font-semibold text-primary underline-offset-4 hover:underline";

/**
 * Link para os Termos ou a Política. Com `onOpen`, abre o documento por cima da
 * tela (folha) em vez de navegar — o cadastro não perde o que já foi digitado.
 * Continua sendo um link (e não um botão): dentro do <label> da caixa de aceite,
 * o texto dele entra no nome acessível da caixa.
 */
export function LegalDocLink({ doc, onOpen, children }: { doc: LegalDocKind; onOpen?: (doc: LegalDocKind) => void; children: ReactNode }) {
  return (
    <Link
      to={doc === "terms" ? LEGAL_PATHS.terms : LEGAL_PATHS.privacy}
      onClick={
        onOpen
          ? (e) => {
              e.preventDefault();
              onOpen(doc);
            }
          : undefined
      }
      className={INLINE_LINK}
    >
      {children}
    </Link>
  );
}

/** "Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade." */
export function LegalConsentNotice({
  lead = "Ao continuar",
  onOpen,
  className,
}: {
  lead?: string;
  onOpen?: (doc: LegalDocKind) => void;
  className?: string;
}) {
  return (
    <p className={cn("text-center text-footnote text-muted-foreground", className)}>
      {lead}, você concorda com os{" "}
      <LegalDocLink doc="terms" onOpen={onOpen}>
        Termos de Uso
      </LegalDocLink>{" "}
      e a{" "}
      <LegalDocLink doc="privacy" onOpen={onOpen}>
        Política de Privacidade
      </LegalDocLink>
      .
    </p>
  );
}

/** Rodapé das telas de entrada: Termos · Privacidade · Suporte. */
export function LegalLinksFooter({ onOpen, className }: { onOpen?: (doc: LegalDocKind) => void; className?: string }) {
  const item = "inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-footnote text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
  return (
    <nav aria-label="Informações legais" className={cn("flex flex-wrap items-center justify-center", className)}>
      {(["terms", "privacy"] as const).map((doc) => (
        <Fragment key={doc}>
          <Link
            to={doc === "terms" ? LEGAL_PATHS.terms : LEGAL_PATHS.privacy}
            onClick={
              onOpen
                ? (e) => {
                    e.preventDefault();
                    onOpen(doc);
                  }
                : undefined
            }
            className={item}
          >
            {doc === "terms" ? "Termos de Uso" : "Privacidade"}
          </Link>
          <span aria-hidden="true" className="text-footnote text-label-tertiary">·</span>
        </Fragment>
      ))}
      <Link to={LEGAL_PATHS.support} className={item}>Suporte</Link>
    </nav>
  );
}
