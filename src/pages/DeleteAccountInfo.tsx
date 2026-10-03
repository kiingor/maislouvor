import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Clock, Mail, Smartphone, Trash2, Users, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LegalInline } from "@/components/legal/LegalText";
import { value } from "@/content/legal/types";
import { DELETE_CONFIRMATION } from "@/lib/accountDeletion";
import {
  BACKUP_RETENTION,
  DELETE_ACCOUNT_SETTINGS_PATH,
  isLegalPlaceholder,
  LEGAL_PATHS,
  MY_SETTINGS_IN_APP,
  PRIVACY_EMAIL,
  PRIVACY_REQUEST_RESPONSE_DAYS,
} from "@/lib/legal";

const LOGIN_TO_DELETE = `/login?redirect=${encodeURIComponent(DELETE_ACCOUNT_SETTINGS_PATH)}`;
const MAIL_SUBJECT = encodeURIComponent("Excluir minha conta do +Louvor");

/** Valor de src/lib/legal.ts: destacado enquanto estiver pendente (como nas páginas jurídicas). */
function LegalValue({ text }: { text: string }) {
  return isLegalPlaceholder(text) ? <LegalInline text={value(text)} /> : <>{text}</>;
}

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 rounded-card bg-card p-4 text-left">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-subhead font-semibold">{title}</h2>
        <div className="mt-1 space-y-2 text-footnote text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}

/**
 * Página pública (sem login) sobre a exclusão de conta — exigida pelo Google Play e
 * útil para a App Store. Também abre dentro do app nativo (Usuário › Meu usuário › Como funciona).
 */
export default function DeleteAccountInfo() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main className="mx-auto w-full max-w-md px-4 min-[430px]:px-5 pt-[calc(max(env(safe-area-inset-top),12px)+28px)] pb-[calc(max(env(safe-area-inset-bottom),16px)+24px)] animate-in-up">
        <header className="flex flex-col items-center text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-prominent text-prominent-foreground dark:bg-card dark:ring-1 dark:ring-inset dark:ring-white/10">
            <BrandMark className="h-10 w-10" />
          </div>
          <h1 className="mt-5 text-title1">Excluir sua conta</h1>
          <p className="mt-1 text-subhead text-muted-foreground">
            Você pode excluir sua conta do +Louvor quando quiser, pelo app ou pelo site.
          </p>
        </header>

        <div className="mt-7 space-y-3">
          <Card icon={Smartphone} title="Como excluir">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Entre na sua conta no app ou em maislouvor.com.</li>
              <li>
                Abra <strong className="font-semibold text-foreground">{MY_SETTINGS_IN_APP}</strong>.
              </li>
              <li>
                Toque em <strong className="font-semibold text-foreground">Excluir minha conta</strong>, confira o
                resumo e digite <strong className="font-semibold text-foreground">{DELETE_CONFIRMATION}</strong>.
              </li>
            </ol>
            <p>
              Se você é dono(a) ou o único líder de uma equipe com outros membros, o app pede para passar a
              equipe para outra pessoa antes. Equipes em que você é o único membro são excluídas junto.
            </p>
          </Card>

          <Link
            to={LOGIN_TO_DELETE}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-prominent px-5 text-headline text-prominent-foreground transition-transform active:scale-[0.98]"
          >
            Entrar e excluir minha conta
          </Link>

          <Card icon={Trash2} title="O que é apagado">
            <ul className="list-disc space-y-1 pl-4">
              <li>Perfil: nome, foto, e-mail, telefone e preferências de notificação.</li>
              <li>Escalas, disponibilidade, funções e loops de ensaio.</li>
              <li>Mensagens que você enviou no chat e os arquivos anexados.</li>
              <li>Rascunhos de músicas que você começou e não cadastrou, com os arquivos deles.</li>
              <li>Vínculo com o assistente no WhatsApp e as conversas com ele.</li>
              <li>Notificações, aparelhos cadastrados para avisos, tickets de suporte e convites para o seu e-mail.</li>
              <li>Equipes em que você é o único membro, com tudo o que há nelas.</li>
            </ul>
          </Card>

          <Card icon={Users} title="O que continua com a equipe">
            <p>
              Músicas já cadastradas, repertórios, cultos e avisos que você criou pertencem à equipe e continuam
              disponíveis para os outros membros, sem o seu nome.
            </p>
            <p>
              Denúncias do chat que envolvem você continuam com a moderação, sem ligação com a sua conta: a cópia da
              mensagem denunciada fica pelo tempo da apuração e o anexo dela, até a denúncia ser analisada. Fora isso,
              guardamos só o registro de que a exclusão foi feita, sem dados pessoais.
            </p>
          </Card>

          <Card icon={Clock} title="Prazo">
            <p>
              A exclusão é imediata. Cópias de segurança que ainda contenham seus dados são substituídas em até{" "}
              <LegalValue text={BACKUP_RETENTION} />.
            </p>
          </Card>

          <Card icon={Mail} title="Não consegue entrar?">
            <p>
              Envie um e-mail para{" "}
              {isLegalPlaceholder(PRIVACY_EMAIL) ? (
                <LegalValue text={PRIVACY_EMAIL} />
              ) : (
                <a
                  href={`mailto:${PRIVACY_EMAIL}?subject=${MAIL_SUBJECT}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {PRIVACY_EMAIL}
                </a>
              )}{" "}
              a partir do endereço cadastrado na conta. Confirmamos que o pedido é seu e excluímos a conta em até{" "}
              {PRIVACY_REQUEST_RESPONSE_DAYS} dias.
            </p>
          </Card>

          <p role="note" className="flex gap-2 rounded-card bg-card p-4 text-footnote text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ios-orange" aria-hidden="true" />
            Assinaturas feitas pela App Store ou Google Play precisam ser canceladas na loja. Excluir a conta não
            cancela a cobrança da loja.
          </p>
        </div>

        <nav aria-label="Mais informações" className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {[
            { to: LEGAL_PATHS.privacy, label: "Política de Privacidade" },
            { to: LEGAL_PATHS.terms, label: "Termos de Uso" },
            { to: LEGAL_PATHS.support, label: "Suporte" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="inline-flex min-h-[44px] items-center gap-0.5 rounded-[10px] px-1 text-subhead font-medium text-primary"
            >
              {item.label}
              <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
