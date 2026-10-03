import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { ChevronRight, FileText, Info, LifeBuoy, ShieldCheck, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DELETE_ACCOUNT_ANCHOR, LEGAL_PATHS } from "@/lib/legal";

/* Mesmas peças de lista agrupada da tela de Ajustes (TeamSettings). */
const ROW_BODY = "flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 group-first/row:border-t-0";

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

/**
 * Com a exclusão já nesta tela, vai até ela em vez de sair do app para a página
 * pública (que mandaria de volta para cá). Sem a seção, segue o link normal.
 */
function goToInAppDeletion(event: MouseEvent<HTMLAnchorElement>) {
  const section = document.getElementById(DELETE_ACCOUNT_ANCHOR);
  if (!section) return;
  event.preventDefault();
  section.scrollIntoView?.({ block: "center" });
  section.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
}

const LINKS: { to: string; label: string; icon: LucideIcon; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }[] = [
  { to: LEGAL_PATHS.terms, label: "Termos de Uso", icon: FileText },
  { to: LEGAL_PATHS.privacy, label: "Política de Privacidade", icon: ShieldCheck },
  { to: LEGAL_PATHS.support, label: "Suporte", icon: LifeBuoy },
  { to: LEGAL_PATHS.deleteAccount, label: "Excluir conta", icon: UserX, onClick: goToInAppDeletion },
];

/** Versão instalada no app nativo (ex.: 1.0.5 (6)); no navegador, "Web". */
function useAppVersion(): string {
  const [version, setVersion] = useState(Capacitor.isNativePlatform() ? "…" : "Web");
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    import("@capacitor/app")
      .then(({ App }) => App.getInfo())
      .then((info) => {
        if (active) setVersion(info.build ? `${info.version} (${info.build})` : info.version);
      })
      .catch(() => {
        if (active) setVersion("—");
      });
    return () => {
      active = false;
    };
  }, []);
  return version;
}

/** Grupo "Sobre" no fim de Usuário › Meu usuário: documentos, suporte, exclusão e versão. */
export function SettingsAboutGroup() {
  const version = useAppVersion();
  return (
    <section aria-labelledby="settings-about">
      <h2 id="settings-about" className="mx-4 mb-1.5 text-footnote text-muted-foreground">
        Sobre
      </h2>
      <div className="overflow-hidden rounded-card bg-card">
        {LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={item.onClick}
            className="group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary"
          >
            <IconTile icon={item.icon} />
            <span className={ROW_BODY}>
              <span className="min-w-0 flex-1 text-body">{item.label}</span>
              <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
            </span>
          </Link>
        ))}
        <div className="group/row flex items-center gap-3 pl-4">
          <IconTile icon={Info} />
          <div className={ROW_BODY}>
            <span className="min-w-0 flex-1 text-body">Versão</span>
            <span className="shrink-0 text-body tabular-nums text-muted-foreground">{version}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
