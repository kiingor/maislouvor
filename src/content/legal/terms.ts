/*
 * TERMOS DE USO — texto para revisão jurídica.
 * Formato em ./types.ts. Valores do responsável e contatos vêm de src/lib/legal.ts.
 * Mudança relevante? Atualize TERMS_VERSION em src/lib/legal.ts (pede novo aceite).
 */
import {
  APP_NAME,
  LEGAL_ADDRESS,
  LEGAL_DOCUMENT,
  LEGAL_ENTITY_NAME,
  LEGAL_PATHS,
  LEGAL_SITE_URL,
  MIN_AGE,
  PRIVACY_EMAIL,
  REPORT_REVIEW_TIME,
  SUPPORT_EMAIL,
} from "@/lib/legal";
import { link, mail, value, type LegalDocumentContent } from "./types";

export const termsOfUse: LegalDocumentContent = {
  title: "Termos de Uso",
  summary:
    `As regras para usar o ${APP_NAME}: o que oferecemos, o que esperamos de você e da sua equipe e como tratamos ` +
    "conteúdo, denúncias e direitos autorais.",
  sections: [
    {
      id: "aceite",
      title: "Aceitação",
      blocks: [
        `Estes Termos de Uso regulam o uso do ${APP_NAME} — app para Android, iOS e navegador, e o site ${link("maislouvor.com", LEGAL_SITE_URL)} —, oferecido por ${value(LEGAL_ENTITY_NAME)} (${value(LEGAL_DOCUMENT)}). Ao criar uma conta ou usar o serviço, você declara que leu e concorda com estes termos e com a ${link("Política de Privacidade", LEGAL_PATHS.privacy)}. Se não concordar, não use o ${APP_NAME}.`,
        `Para quem baixa o app na App Store, também vale o ${link("Contrato de Licença de Usuário Final padrão da Apple", "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")} (EULA). Estes termos são um acordo entre você e o ${APP_NAME} — não com a Apple nem com o Google, que não são responsáveis pelo app, pelo conteúdo dele nem pelo suporte.`,
      ],
    },
    {
      id: "servico",
      title: "O serviço",
      blocks: [
        `O ${APP_NAME} ajuda equipes de louvor a organizar escalas, cultos, repertórios, músicas, cifras, letras, áudios de ensaio, disponibilidade e a comunicação da equipe, com recursos opcionais de inteligência artificial e um assistente no WhatsApp (Asafe).`,
        "É uma ferramenta de organização e de ensaio para uso interno da sua equipe, e não uma plataforma de distribuição de música.",
      ],
    },
    {
      id: "elegibilidade",
      title: "Quem pode usar",
      blocks: [
        [
          `Você precisa ter pelo menos **${MIN_AGE} anos**.`,
          `Entre ${MIN_AGE} e 17 anos, só com autorização dos pais ou responsáveis legais, que respondem pelo uso e aceitam estes termos em nome do adolescente.`,
          `Líderes não podem convidar nem cadastrar crianças menores de ${MIN_AGE} anos.`,
          "Não pode usar o serviço quem já teve a conta encerrada por violar estes termos, salvo autorização nossa.",
        ],
        "Podemos pedir confirmação de idade ou de autorização e suspender contas que não cumpram essas regras.",
      ],
    },
    {
      id: "conta",
      title: "Sua conta",
      blocks: [
        [
          "Informe dados verdadeiros e mantenha-os atualizados.",
          "A conta é pessoal: não compartilhe sua senha nem deixe outra pessoa usar seu acesso.",
          "Você responde pelo que acontece na sua conta. Avise o suporte se suspeitar de uso indevido.",
          `Você pode excluir a conta a qualquer momento pelo app ou pela página ${link("Excluir conta", LEGAL_PATHS.deleteAccount)}.`,
        ],
      ],
    },
    {
      id: "lideres",
      title: "Líderes e administradores de equipe",
      blocks: [
        "Quem cria ou administra uma equipe assume responsabilidades a mais:",
        [
          "convidar apenas pessoas que fazem parte do ministério e querem participar, respeitando a idade mínima;",
          "definir permissões adequadas e remover o acesso de quem deixar a equipe;",
          "cadastrar só as informações dos membros necessárias à organização da equipe, de forma correta e respeitosa;",
          "usar com cuidado os links públicos de culto e de repertório: quem tiver o link vê o conteúdo compartilhado, inclusive o nome das pessoas escaladas;",
          "ativar o Asafe apenas em grupos de WhatsApp da equipe e avisar os participantes sobre o assistente;",
          "agir contra conteúdo ou comportamento abusivo na equipe e encaminhar denúncias quando necessário.",
        ],
      ],
    },
    {
      id: "conteudo",
      title: "Seu conteúdo",
      blocks: [
        "Conteúdo é tudo o que você envia ou cria no app: músicas, cifras, letras, áudios, imagens, anotações, mensagens e demais materiais.",
        "**Você continua dono do seu conteúdo.** Para o serviço funcionar, você nos concede uma licença não exclusiva, gratuita, mundial e válida enquanto o conteúdo estiver no serviço, para hospedar, armazenar, copiar, converter formatos, processar (por exemplo, separar trilhas, sincronizar letras ou transpor tons) e exibir esse conteúdo para você, para a sua equipe e para quem acessar os links públicos que vocês criarem.",
        "A licença termina quando o conteúdo é excluído, exceto nas cópias de segurança até serem substituídas, no que já faz parte do acervo da equipe e no que a lei exigir guardar.",
      ],
    },
    {
      id: "direitos-autorais",
      title: "Direitos autorais e licenças de música",
      blocks: [
        "Ao enviar ou importar áudios, letras, cifras, partituras ou multitracks, você declara que tem os direitos ou as licenças necessárias para esse uso, como:",
        [
          "faixas ou multitracks comprados, usados dentro das condições da licença do vendedor;",
          "licenças de uso de letras e músicas em igrejas (como a CCLI ou equivalentes), quando aplicáveis;",
          "gravações, arranjos e composições próprios ou da sua equipe, ou autorizados pelos autores;",
          "obras em domínio público.",
        ],
        "Importe conteúdo de plataformas de terceiros (como YouTube, Moises ou sites de cifras) **somente quando tiver autorização** do titular dos direitos e os termos da plataforma permitirem. Use o material apenas no ensaio interno da equipe e não o redistribua.",
        `**Notificação de violação:** se você acredita que um conteúdo no ${APP_NAME} viola seus direitos autorais, escreva para ${mail(SUPPORT_EMAIL)} com o assunto “Direitos autorais”, informando: (1) seus dados de contato; (2) a obra protegida; (3) onde está o conteúdo (por exemplo, o link público ou uma descrição); (4) a comprovação de que você é o titular ou o representante dele; e (5) uma declaração de boa-fé de que as informações são verdadeiras. Analisaremos o pedido, poderemos remover o conteúdo e avisaremos quem o publicou, que poderá contestar. Contas com violações repetidas serão encerradas.`,
      ],
    },
    {
      id: "conduta",
      title: "Conteúdo e condutas proibidos",
      blocks: [
        {
          note: "**Tolerância zero.** Não aceitamos conteúdo censurável ou abusivo nem usuários abusivos. Quem violar estas regras terá o conteúdo removido e poderá ter a conta suspensa ou encerrada — sem aviso prévio nos casos graves.",
        },
        `É proibido usar o ${APP_NAME} para publicar, enviar ou compartilhar:`,
        [
          "assédio, intimidação, ameaças, perseguição ou humilhação de qualquer pessoa;",
          "discurso de ódio ou discriminação por raça, cor, etnia, religião, origem, gênero, orientação sexual, deficiência ou qualquer outra condição;",
          "conteúdo sexual, pornográfico ou sexualmente sugestivo;",
          "**qualquer conteúdo que envolva abuso ou exploração sexual de crianças e adolescentes** — além de remover o conteúdo e encerrar a conta, comunicamos o caso às autoridades;",
          "violência explícita, incitação à violência ou ao terrorismo e incentivo à automutilação ou ao suicídio;",
          "spam, correntes, golpes, phishing, vírus ou qualquer código malicioso;",
          "conteúdo ilegal ou que viole direitos de terceiros, inclusive direitos autorais, de imagem e de privacidade (como expor dados pessoais de alguém sem autorização);",
          "falsificação de identidade ou de vínculo com igrejas, pessoas ou organizações.",
        ],
        "Também é proibido tentar acessar dados de outras equipes ou contas, burlar limites e permissões, sobrecarregar ou atacar o serviço, coletar dados de forma automatizada e fazer engenharia reversa do app, salvo quando a lei permitir.",
      ],
    },
    {
      id: "denuncias",
      title: "Denúncias, bloqueio e moderação",
      blocks: [
        [
          "No chat, você pode **denunciar** uma mensagem (toque e segure a mensagem, ou abra o menu dela, e escolha “Denunciar”) e **bloquear** quem estiver incomodando.",
          `Também é possível denunciar pelo e-mail ${mail(SUPPORT_EMAIL)} ou pela ${link("página de suporte", LEGAL_PATHS.support)}.`,
          `Analisamos as denúncias em até **${REPORT_REVIEW_TIME}**. Quando há violação, removemos o conteúdo e, conforme a gravidade, advertimos, suspendemos ou encerramos a conta de quem o publicou, podendo também retirá-lo da equipe.`,
          "Líderes também podem remover membros e mensagens da própria equipe.",
          "Se discordar de uma decisão de moderação, peça revisão pelo suporte.",
        ],
      ],
    },
    {
      id: "inteligencia-artificial",
      title: "Recursos de inteligência artificial",
      blocks: [
        [
          "Alguns recursos usam inteligência artificial: sincronizar letras, transpor tons, sugerir músicas para cultos, importar cifras e projetos do Moises e o assistente Asafe.",
          "**As respostas podem conter erros.** Confira letras, cifras, tons, datas e sugestões antes de usar; elas não substituem a decisão da liderança.",
          `Para gerar os resultados, o conteúdo necessário é enviado a provedores de inteligência artificial, inclusive no exterior, como explica a ${link("Política de Privacidade", LEGAL_PATHS.privacy)}.`,
          "O Asafe é opcional: precisa ser ativado pela equipe e só atende quem deu o consentimento. Você pode desativá-lo quando quiser nos ajustes do app.",
          "Não envie ao Asafe dados sensíveis, como informações de saúde, documentos ou senhas.",
        ],
      ],
    },
    {
      id: "whatsapp",
      title: "Integração com o WhatsApp",
      blocks: [
        `A integração com o WhatsApp é opcional e depende do WhatsApp e de serviços de terceiros. Ao usá-la, você também se sujeita aos ${link("Termos de Serviço do WhatsApp", "https://www.whatsapp.com/legal/terms-of-service")}. O ${APP_NAME} não é afiliado ao WhatsApp nem à Meta. Mensagens trocadas em grupos podem ser vistas por todos os participantes do grupo.`,
      ],
    },
    {
      id: "servicos-de-terceiros",
      title: "Serviços de terceiros",
      blocks: [
        `O ${APP_NAME} usa os Serviços de API do YouTube para exibir vídeos. Ao assistir a vídeos do YouTube no app, você concorda com os ${link("Termos de Serviço do YouTube", "https://www.youtube.com/t/terms")}, e o Google trata os dados conforme a ${link("Política de Privacidade do Google", "https://policies.google.com/privacy")}.`,
        "Entrar com Google, notificações e links para sites de terceiros seguem as regras de cada serviço. Não respondemos pelo conteúdo nem pelas práticas desses serviços.",
      ],
    },
    {
      id: "planos",
      title: "Planos e pagamentos",
      blocks: [
        `Hoje o ${APP_NAME} oferece uso gratuito. No futuro, poderemos oferecer planos pagos ou recursos adicionais; preço, período, recursos e forma de cobrança serão informados com clareza antes de qualquer contratação.`,
        [
          "Compras feitas pela App Store ou pelo Google Play são processadas pela Apple ou pelo Google e seguem os termos da respectiva loja.",
          "Assinaturas renovam automaticamente ao fim de cada período, a menos que você cancele com antecedência nas configurações da sua conta na loja (na App Store, até 24 horas antes da renovação). Desinstalar o app não cancela a assinatura.",
          "Reembolsos de compras feitas nas lojas são pedidos à própria loja, sem prejuízo dos seus direitos pelo Código de Defesa do Consumidor.",
        ],
      ],
    },
    {
      id: "disponibilidade",
      title: "Disponibilidade e mudanças no serviço",
      blocks: [
        `Trabalhamos para manter o ${APP_NAME} disponível e seguro, mas o serviço pode passar por manutenções, falhas ou interrupções, inclusive de terceiros (hospedagem, lojas, WhatsApp, provedores de inteligência artificial). Podemos alterar, incluir ou remover recursos; quando uma mudança relevante afetar você, avisaremos com antecedência razoável. Recomendamos manter cópia dos arquivos importantes.`,
      ],
    },
    {
      id: "encerramento",
      title: "Suspensão e encerramento",
      blocks: [
        "Você pode deixar de usar o serviço e excluir a conta a qualquer momento. Podemos suspender ou encerrar contas que violem estes termos ou a lei, que coloquem outras pessoas em risco ou quando houver ordem de autoridade. Sempre que possível e seguro, informaremos o motivo e daremos a chance de se manifestar.",
      ],
    },
    {
      id: "responsabilidade",
      title: "Responsabilidade",
      blocks: [
        "Respondemos pelos serviços que prestamos nos termos da lei, inclusive do Código de Defesa do Consumidor. Nada nestes termos afasta direitos que a lei garante e que não podem ser renunciados.",
        "Na medida permitida pela lei, não respondemos por conteúdo publicado por usuários e equipes; por uso indevido da conta causado por descuido com a senha; por decisões tomadas com base em respostas de inteligência artificial sem conferência; por falhas e práticas de serviços de terceiros; e por danos decorrentes de caso fortuito ou força maior.",
      ],
    },
    {
      id: "propriedade",
      title: "Propriedade do +Louvor",
      blocks: [
        `A marca, o nome, o software, o design e os demais elementos do ${APP_NAME} pertencem a ${value(LEGAL_ENTITY_NAME)} ou a seus licenciantes. Concedemos a você uma licença pessoal, não exclusiva, intransferível e revogável para usar o app conforme estes termos. Componentes de código aberto incluídos no app seguem as próprias licenças.`,
      ],
    },
    {
      id: "alteracoes",
      title: "Alterações destes termos",
      blocks: [
        "Podemos atualizar estes termos. A data da versão fica no topo da página. Mudanças relevantes serão avisadas no app e exigirão um novo aceite para você continuar usando o serviço.",
      ],
    },
    {
      id: "lei-aplicavel",
      title: "Lei aplicável e foro",
      blocks: [
        "Estes termos seguem as leis do Brasil. Fica eleito o foro do seu domicílio para resolver qualquer controvérsia, como garante o Código de Defesa do Consumidor. Antes de recorrer à Justiça, fale com o nosso suporte: a maioria dos problemas se resolve rapidamente.",
      ],
    },
    {
      id: "contato",
      title: "Contato",
      blocks: [
        `Suporte: ${mail(SUPPORT_EMAIL)} ou ${link("página de suporte", LEGAL_PATHS.support)}. Privacidade: ${mail(PRIVACY_EMAIL)}.`,
        `${value(LEGAL_ENTITY_NAME)} · ${value(LEGAL_DOCUMENT)} · ${value(LEGAL_ADDRESS)}`,
      ],
    },
  ],
};
