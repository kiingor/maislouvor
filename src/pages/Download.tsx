import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { Download as DownloadIcon, Smartphone, ShieldCheck, ArrowRight } from "lucide-react";

const APP_VERSION = "1.0";
const APK_URL = "/LouvorMais.apk";

export default function Download() {
  const [size, setSize] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch(APK_URL, { method: "HEAD", cache: "no-store" })
      .then((r) => {
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
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center px-4 py-10">
      {/* Ambient glass orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-foreground/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -right-48 w-[500px] h-[500px] rounded-full bg-foreground/[0.02] blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-foreground/[0.03] blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in-up">
        <GlassCard className="p-8 text-center relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-foreground/[0.04] blur-2xl pointer-events-none" />

          {/* Logo */}
          <div className="h-20 w-20 rounded-3xl bg-foreground flex items-center justify-center mx-auto mb-5 shadow-xl">
            <BrandMark className="h-11 w-11 text-background" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight">+Louvor</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> App para Android
          </p>

          {/* Version chip */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className="text-[11px] font-medium bg-primary/10 text-primary rounded-full px-3 py-1">
              Versão {APP_VERSION}
            </span>
            {size && (
              <span className="text-[11px] font-medium bg-accent/60 text-muted-foreground rounded-full px-3 py-1">
                {size}
              </span>
            )}
          </div>
          {updated && (
            <p className="text-[11px] text-muted-foreground mt-2">Atualizado em {updated}</p>
          )}

          {/* Download button */}
          <a href={APK_URL} download="LouvorMais.apk" className="block mt-6">
            <Button className="w-full h-14 rounded-2xl text-base font-semibold gap-2.5 hover-lift">
              <DownloadIcon className="h-5 w-5" /> Baixar APK
            </Button>
          </a>

          {/* Install hint */}
          <div className="mt-5 rounded-xl bg-accent/40 p-3.5 text-left">
            <p className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Como instalar
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Toque em <strong>Baixar APK</strong> → abra o arquivo → se o Android avisar,
              permita <strong>instalar de fontes desconhecidas</strong> → Instalar. Atualizações
              instalam por cima, sem perder nada.
            </p>
          </div>

          {/* Use no navegador */}
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-5"
          >
            Prefere usar no navegador? Entrar <ArrowRight className="h-3 w-3" />
          </Link>
        </GlassCard>

        <p className="text-center text-[11px] text-muted-foreground/70 mt-5">
          iPhone em breve · também disponível como app web (PWA)
        </p>
      </div>
    </div>
  );
}
