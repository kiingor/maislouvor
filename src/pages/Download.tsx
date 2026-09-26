import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Download as DownloadIcon, Smartphone, ShieldCheck, ChevronRight, Info } from "lucide-react";

const APP_VERSION = "1.0.2";
const APK_URL = "/LouvorMais-1.0.2.apk";

/** Página pública do APK, no estilo de página de produto da App Store sobre o fundo agrupado. */
export default function Download() {
  const [size, setSize] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch(APK_URL, { method: "HEAD", cache: "no-store" })
      .then((r) => {
        if (!r.ok) return;
        const len = r.headers.get("content-length");
        if (len) setSize((Number(len) / 1024 / 1024).toFixed(1) + " MB");
        const lm = r.headers.get("last-modified");
        if (lm) {
          const d = new Date(lm);
          setUpdated(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }));
        }
      })
      .catch(() => { /* mostra sem metadados */ });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 min-[430px]:px-5 pt-[calc(max(env(safe-area-inset-top),12px)+28px)] pb-[calc(max(env(safe-area-inset-bottom),16px)+24px)] animate-in-up">
        {/* Cabeçalho do produto */}
        <header className="flex flex-col items-center text-center">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[22px] bg-prominent text-prominent-foreground dark:bg-card dark:ring-1 dark:ring-inset dark:ring-white/10">
            <BrandMark className="h-12 w-12" />
          </div>
          <h1 className="mt-5 text-title1">+Louvor</h1>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-subhead text-muted-foreground">
            <Smartphone className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" /> App para Android
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-fill-tertiary px-3 py-1 text-footnote font-medium">
              Versão {APP_VERSION}
            </span>
            {size && (
              <span className="rounded-full bg-fill-tertiary px-3 py-1 text-footnote font-medium text-muted-foreground">
                {size}
              </span>
            )}
          </div>
          {updated && (
            <p className="mt-2 text-footnote text-muted-foreground">Atualizado em {updated}</p>
          )}
        </header>

        {/* Aviso de atualização: precisa vir antes do link de download (coberto por teste). */}
        <div role="note" className="mt-7 rounded-card bg-card p-4 text-left">
          <p className="flex items-center gap-2 text-subhead font-semibold">
            <Info className="h-[17px] w-[17px] shrink-0 text-ios-orange" strokeWidth={2.25} aria-hidden="true" />
            Já tem o app instalado?
          </p>
          <p className="mt-1.5 text-footnote text-muted-foreground">
            Se você instalou a versão 1.0.1 deste site, <strong className="font-semibold text-foreground">atualize sem desinstalar</strong>.
            {" "}A versão 1.0 usa outra assinatura: esta atualização <strong className="font-semibold text-foreground">não instala por cima da versão 1.0</strong>.
            {" "}Antes de remover o app antigo, confira seus dados sincronizados e salve o que existe
            apenas no celular. A desinstalação pode apagar esses dados locais.
          </p>
        </div>

        {/* Download: o próprio link é o botão proeminente (sem <button> dentro de <a>). */}
        <a
          href={APK_URL}
          download="LouvorMais-1.0.2.apk"
          className="mt-6 flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-prominent px-5 text-headline text-prominent-foreground transition-transform active:scale-[0.98]"
        >
          <DownloadIcon className="h-5 w-5" aria-hidden="true" /> Baixar APK
        </a>

        {/* Como instalar */}
        <div className="mt-6 flex gap-3 rounded-card bg-card p-4 text-left">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
            <ShieldCheck className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-subhead font-semibold">Como instalar</p>
            <p className="mt-1 text-footnote text-muted-foreground">
              Toque em <strong className="font-semibold text-foreground">Baixar APK</strong> → abra o arquivo → se o Android avisar,
              permita a instalação para o navegador usado → Instalar. Se você usa a versão 1.0,
              leia o aviso acima antes de remover o app antigo. Depois, entre na mesma conta.
            </p>
          </div>
        </div>

        {/* Use no navegador */}
        <Link
          to="/login"
          className="mx-auto mt-5 inline-flex min-h-[44px] items-center gap-0.5 rounded-[10px] px-2 text-subhead font-medium text-primary"
        >
          Prefere usar no navegador? Entrar <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>

        <p className="mt-3 text-center text-caption1 text-muted-foreground">
          iPhone em breve · também disponível como app web (PWA)
        </p>
      </div>
    </div>
  );
}
