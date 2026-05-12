import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InstallPWABanner } from "@/components/InstallPWABanner";
import { Music, ListMusic, Users, Mic2, MonitorSmartphone, Layers } from "lucide-react";

const features = [
  { icon: ListMusic, title: "Repertórios", desc: "Organize músicas em listas para cada culto" },
  { icon: Music, title: "Cifras & Letras", desc: "Acesse cifras e letras sincronizadas" },
  { icon: Mic2, title: "Apresentação", desc: "Modo tela cheia com letra para projetar" },
  { icon: Users, title: "Equipe", desc: "Convide músicos e gerencie permissões" },
  { icon: MonitorSmartphone, title: "Multiplataforma", desc: "Use no celular, tablet ou computador" },
  { icon: Layers, title: "Transposição", desc: "Mude o tom da música com um clique" },
];

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-foreground/[0.03] blur-3xl" />
          <div className="absolute top-1/3 -right-48 w-[500px] h-[500px] rounded-full bg-foreground/[0.02] blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-foreground/[0.03] blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-sm animate-in-up text-center px-6">
          <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-4">
            <span className="text-background text-xl font-bold">+L</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">Verifique seu email</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Enviamos um link de confirmação para <strong>{email}</strong>.
          </p>
          <Link to="/login" className="text-foreground font-medium text-sm hover:underline underline-offset-4">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient glass orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-foreground/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -right-48 w-[500px] h-[500px] rounded-full bg-foreground/[0.02] blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-foreground/[0.03] blur-3xl" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-16 px-4 py-8 lg:px-16 xl:px-24">
        {/* Left — Hero / Features */}
        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <div className="animate-in-up">
            <div className="flex items-center gap-3 mb-6 lg:mb-10">
              <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-2xl bg-foreground flex items-center justify-center hover-lift shadow-lg">
                <span className="text-background text-sm lg:text-base font-bold">+L</span>
              </div>
              <div>
                <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">+Louvor</h1>
                <p className="text-xs text-muted-foreground tracking-wide">Sua equipe, uma só voz</p>
              </div>
            </div>

            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight leading-tight mb-2 lg:mb-3">
              Tudo que sua equipe
              <br />
              de louvor precisa.
            </h2>
            <p className="text-muted-foreground text-sm lg:text-base mb-6 lg:mb-10 max-w-sm">
              Repertórios, cifras, letras e apresentações — tudo organizado em um único lugar.
            </p>

            <div className="hidden lg:grid grid-cols-2 gap-3">
              {features.map((f, i) => (
                <GlassCard
                  key={f.title}
                  className="p-3.5 flex items-start gap-3 hover-lift cursor-default"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="h-8 w-8 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
                    <f.icon className="h-4 w-4 text-foreground/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">{f.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{f.desc}</p>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Sign Up form */}
        <div className="w-full max-w-md lg:min-w-[420px]">
          <div className="animate-in-up" style={{ animationDelay: "150ms" }}>
            <GlassCard className="p-6 lg:p-10 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-foreground/[0.03] blur-2xl pointer-events-none" />

              <div className="relative z-10">
                <h3 className="text-lg font-semibold tracking-tight mb-1">Crie sua conta</h3>
                <p className="text-sm text-muted-foreground mb-6">Comece a organizar seus repertórios</p>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Nome completo
                    </label>
                    <GlassInput
                      type="text"
                      placeholder="Seu nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </label>
                    <GlassInput
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Senha
                    </label>
                    <GlassInput
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl text-sm font-semibold hover-lift mt-2"
                  >
                    {loading ? (
                      <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    ) : (
                      "Criar conta"
                    )}
                  </Button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link to="/login" className="text-foreground font-medium hover:underline underline-offset-4">
                    Entrar
                  </Link>
                </p>
              </div>
            </GlassCard>

            <div className="flex justify-center mt-6">
              <div className="glass-subtle rounded-full px-4 py-1.5 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
                <span className="text-[11px] text-muted-foreground font-medium">Gratuito para equipes pequenas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InstallPWABanner />
    </div>
  );
}
