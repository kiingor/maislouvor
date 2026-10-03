/*
 * PÁGINA DE SUPORTE — texto editável sem mexer na tela.
 * Formato em ./types.ts. Contatos e prazos vêm de src/lib/legal.ts.
 */
import {
  APP_NAME,
  ASAFE_ALLOW_LABEL,
  DELETE_ACCOUNT_IN_APP,
  LEGAL_PATHS,
  MIN_AGE,
  PRIVACY_EMAIL,
  REPORT_REVIEW_TIME,
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE_TIME,
} from "@/lib/legal";
import { link, mail, type LegalDocumentContent } from "./types";

export const supportPage: LegalDocumentContent = {
  title: "Suporte",
  summary: `Fale com a equipe do ${APP_NAME}, denuncie abuso e encontre respostas para as dúvidas mais comuns.`,
  sections: [
    {
      id: "fale-conosco",
      title: "Fale com a gente",
      blocks: [
        `E-mail: ${mail(SUPPORT_EMAIL)}. Respondemos em **${SUPPORT_RESPONSE_TIME}**.`,
        `Já usa o app? Abra um chamado em ${link("Sugestões e suporte", "/app/sugestoes")}, no menu do app, e acompanhe a resposta por lá.`,
        "Para agilizar, conte o que aconteceu, o nome da equipe e o aparelho que você usa (Android, iPhone ou navegador).",
        `Assuntos de privacidade e dados pessoais: ${mail(PRIVACY_EMAIL)}.`,
      ],
    },
    {
      id: "denunciar",
      title: "Denunciar abuso",
      blocks: [
        [
          "No chat, toque e segure a mensagem (ou abra o menu dela) e escolha **Denunciar**. Você também pode **bloquear** a pessoa.",
          `Fora do app, escreva para ${mail(SUPPORT_EMAIL)} com o assunto “Denúncia”, contando o que aconteceu, a equipe e, se possível, enviando capturas de tela.`,
          `Analisamos as denúncias em até **${REPORT_REVIEW_TIME}** e removemos o conteúdo que viola os ${link("Termos de Uso", LEGAL_PATHS.terms)}.`,
        ],
        {
          note: `Em caso de risco imediato, ligue **190**. Abuso ou exploração sexual de crianças e adolescentes também pode ser denunciado no **Disque 100** e na ${link("SaferNet Brasil", "https://new.safernet.org.br/denuncie")}.`,
        },
      ],
    },
    {
      id: "direitos-autorais",
      title: "Direitos autorais",
      blocks: [
        `Se um conteúdo no ${APP_NAME} viola seus direitos autorais, escreva para ${mail(SUPPORT_EMAIL)} com o assunto “Direitos autorais”, seguindo as orientações dos ${link("Termos de Uso", `${LEGAL_PATHS.terms}#direitos-autorais`)}.`,
      ],
    },
    {
      id: "perguntas-frequentes",
      title: "Perguntas frequentes",
      blocks: [
        {
          faq: [
            {
              q: "Esqueci minha senha. E agora?",
              a: "Na tela de entrada, digite seu e-mail e toque em **Esqueceu a senha?** para receber um link e criar uma nova senha. Se você criou a conta com o Google, use **Continuar com Google**.",
            },
            {
              q: "Como entro na equipe da minha igreja?",
              a: "Peça ao líder o link de convite ou o **código da equipe**. Entre na sua conta e abra o link ou informe o código. Pedidos feitos pelo código aguardam a aprovação do líder.",
            },
            {
              q: "Como convido pessoas para a equipe?",
              a: `Líderes e quem tem permissão para gerenciar membros convidam em **Usuário › Membros**, enviando um convite ou o código da equipe. Lembre-se: a idade mínima para ter conta é ${MIN_AGE} anos.`,
            },
            {
              q: "Como excluo minha conta?",
              a: `No app, em **${DELETE_ACCOUNT_IN_APP}**. Sem o app, use a página ${link("Excluir conta", LEGAL_PATHS.deleteAccount)}. O que é apagado e o que fica está na ${link("Política de Privacidade", `${LEGAL_PATHS.privacy}#exclusao`)}.`,
            },
            {
              q: "Como desativo o Asafe, o assistente no WhatsApp?",
              a: `Para você: desligue **${ASAFE_ALLOW_LABEL}** em **Usuário › Meu usuário**; o Asafe deixa de reconhecer você e apaga o seu histórico com ele. Para toda a equipe: líderes desativam o assistente na aba **Equipe**.`,
            },
            {
              q: `O ${APP_NAME} vende meus dados?`,
              a: `Não. Não vendemos dados, não exibimos anúncios e não rastreamos você. Veja a ${link("Política de Privacidade", LEGAL_PATHS.privacy)}.`,
            },
          ],
        },
      ],
    },
    {
      id: "documentos",
      title: "Documentos",
      blocks: [
        [
          link("Termos de Uso", LEGAL_PATHS.terms),
          link("Política de Privacidade", LEGAL_PATHS.privacy),
          link("Excluir conta", LEGAL_PATHS.deleteAccount),
        ],
      ],
    },
  ],
};
