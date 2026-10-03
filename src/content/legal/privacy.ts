/*
 * POLÍTICA DE PRIVACIDADE — texto para revisão jurídica.
 * Formato em ./types.ts. Valores do responsável e contatos vêm de src/lib/legal.ts.
 * Mudança relevante? Atualize PRIVACY_VERSION em src/lib/legal.ts (pede novo aceite).
 */
import {
  APP_NAME,
  ASAFE_AI_PROVIDER,
  ASAFE_ALLOW_LABEL,
  ASAFE_HISTORY_RETENTION_DAYS,
  ASAFE_PROVIDER_RETENTION,
  BACKUP_RETENTION,
  DELETE_ACCOUNT_IN_APP,
  DPO_NAME,
  EMAIL_PROVIDER,
  INFRA_PROVIDER,
  LEGAL_ADDRESS,
  LEGAL_DOCUMENT,
  LEGAL_ENTITY_NAME,
  LEGAL_PATHS,
  LEGAL_SITE_URL,
  MIN_AGE,
  MY_SETTINGS_IN_APP,
  PRIVACY_EMAIL,
  PRIVACY_REQUEST_RESPONSE_DAYS,
  REPORT_REVIEW_TIME,
  SENSITIVE_DATA_LEGAL_BASIS,
} from "@/lib/legal";
import { link, mail, value, type LegalDocumentContent } from "./types";

export const privacyPolicy: LegalDocumentContent = {
  title: "Política de Privacidade",
  summary:
    `Como o ${APP_NAME} coleta, usa, compartilha e protege dados pessoais, e como você exerce seus direitos pela ` +
    "Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
  sections: [
    {
      id: "resumo",
      title: "Resumo",
      blocks: [
        [
          `Usamos seus dados para o ${APP_NAME} funcionar para você e para a sua equipe: conta, escalas, repertórios, músicas, chat e notificações.`,
          "**Não vendemos** dados pessoais, **não exibimos anúncios** e **não rastreamos** você em outros apps ou sites.",
          `Alguns recursos usam provedores de inteligência artificial. O assistente Asafe, no WhatsApp, é opcional: um líder o ativa na equipe, ele envia mensagens e dados da equipe à ${ASAFE_AI_PROVIDER}, e cada pessoa escolhe no app se ele pode usar os dados dela — e muda de ideia quando quiser.`,
          "No chat, um filtro automático esconde palavras ofensivas, e você pode denunciar mensagens e bloquear pessoas.",
          `Você pode acessar, corrigir e excluir seus dados — inclusive excluir a conta pelo app ou pela página ${link("Excluir conta", LEGAL_PATHS.deleteAccount)}.`,
        ],
      ],
    },
    {
      id: "controlador",
      title: "Quem é o responsável pelos seus dados",
      blocks: [
        `O ${APP_NAME} é oferecido por ${value(LEGAL_ENTITY_NAME)}, inscrito(a) sob o nº ${value(LEGAL_DOCUMENT)}, com endereço em ${value(LEGAL_ADDRESS)}, que atua como **controlador** dos dados pessoais tratados para prestar o serviço.`,
        `Encarregado pelo tratamento de dados pessoais (DPO): ${value(DPO_NAME)}, pelo e-mail ${mail(PRIVACY_EMAIL)}.`,
        `Esta política vale para o app ${APP_NAME} no Android, no iOS e no navegador (inclusive instalado como app web) e para o site ${link("maislouvor.com", LEGAL_SITE_URL)}.`,
      ],
    },
    {
      id: "dados-coletados",
      title: "Quais dados coletamos",
      blocks: [
        "**Dados que você informa ou cria:**",
        [
          `**Conta:** nome, e-mail e senha. A senha é guardada pelo servidor de autenticação apenas como hash criptográfico — ninguém da equipe do ${APP_NAME} tem acesso a ela.`,
          "**Entrar com Google:** se você escolher essa opção, recebemos do Google o identificador da sua conta, nome, e-mail e foto de perfil.",
          "**Aceites:** a data e a versão dos Termos de Uso e desta Política que você aceitou.",
          "**Perfil:** foto, telefone/WhatsApp (opcional), funções e instrumentos, nível em cada função e preferências de notificação e de aparência.",
          "**Dados da equipe:** equipes de que você participa, papel e permissões, disponibilidade e indisponibilidade (datas e o motivo, se você informar), escalas, cultos e eventos, repertórios, músicas, cifras, letras, tons, vozes, anotações, marcações de ensaio e estatísticas de participação.",
          "**Arquivos:** áudios (faixas, multitracks e trilhas separadas), capas, imagens e fotos que você envia, o áudio importado de links que você informar (por exemplo, do YouTube ou do Moises) e o texto de cifras importado de sites que você indicar.",
          "**Chat da equipe:** mensagens de texto, imagens e mensagens de voz, com autor e data/hora. Ao salvar uma mensagem, um filtro automático troca por asteriscos as palavras ofensivas de uma lista mantida por nós; o texto original dessas palavras não é guardado.",
          "**Denúncias e bloqueios:** o motivo e os detalhes que você informar, quem denunciou, uma cópia da mensagem denunciada (texto e anexo) para servir de prova, a decisão da moderação e as pessoas que você bloqueou.",
          "**Suporte:** chamados, sugestões e mensagens trocadas com o suporte, inclusive por e-mail.",
          "**Convites:** o e-mail de quem um líder convida para a equipe.",
        ],
        "**Dados gerados pelo uso:**",
        [
          "**Notificações push:** o token do aparelho no Firebase Cloud Messaging (app Android/iOS) ou a assinatura de notificações do navegador (app web), para enviar os avisos da equipe.",
          `**Asafe (assistente no WhatsApp):** só nas equipes em que um líder ativa o assistente e só de quem permite o uso dos próprios dados, em **${ASAFE_ALLOW_LABEL}** (em ${MY_SETTINGS_IN_APP}). Com a permissão, o Asafe reconhece você comparando o número do WhatsApp com o telefone do seu perfil (ou pelo código de vínculo que você gerar no app) e guarda esse vínculo, o identificador do WhatsApp, o nome exibido, as mensagens que você envia ao Asafe nos grupos ativados, as respostas geradas e contadores de uso. Quem já usava o Asafe antes do aviso sobre a IA continua reconhecido até decidir no app (ou até o prazo informado lá). Se você não permitir ou desligar a permissão, ele deixa de reconhecer você, apaga o vínculo e o seu histórico de conversas e não marca mais você nos avisos. Guardamos também a sua escolha (permitir ou não, com a versão do aviso e a data).`,
          "**Registros técnicos:** endereço IP, data e hora de acesso, tipo de aparelho e de navegador e registros de erro, mantidos pelo servidor.",
          "**Armazenamento no aparelho:** a sessão de login, preferências (tema, equipe selecionada, ajustes do modo ensaio) e uma cópia temporária (cache) para o app abrir mais rápido e funcionar com conexão instável.",
        ],
        "**O que não coletamos:** localização, contatos da agenda, identificadores de publicidade ou dados de cartão. O microfone só é usado quando você grava uma mensagem de voz, e a câmera ou a galeria só quando você escolhe uma imagem.",
      ],
    },
    {
      id: "finalidades",
      title: "Para que usamos e com qual base legal",
      blocks: [
        "Tratamos dados pessoais com base nas hipóteses do art. 7º da LGPD:",
        [
          "**Execução do contrato** (art. 7º, V): criar e manter sua conta, autenticar o acesso, permitir que você participe de equipes, escalas, repertórios e chat, armazenar e processar seus arquivos (por exemplo, separar as trilhas de um áudio), enviar notificações e e-mails do serviço (como redefinição de senha e convites) e executar os recursos que você aciona, inclusive os de inteligência artificial.",
          "**Legítimo interesse** (art. 7º, IX): manter a segurança, prevenir fraudes e abusos, moderar conteúdo (inclusive com o filtro automático de palavras ofensivas no chat), analisar denúncias e guardar a prova delas, atender o suporte, enviar convites a pedido de um líder e melhorar o serviço com estatísticas internas — sempre respeitando suas expectativas e seus direitos.",
          `**Asafe**, o assistente opcional no WhatsApp, que envia dados a um provedor de inteligência artificial: usar os seus dados — reconhecer você, responder às suas perguntas e marcar você nos avisos — depende do seu **consentimento** (art. 7º, I), dado ao permitir **${ASAFE_ALLOW_LABEL}** ou ao vincular o WhatsApp por código, e do consentimento do líder que ativa o assistente para a equipe. O consentimento pode ser revogado a qualquer momento nos ajustes do app. Quem já usava o Asafe antes do aviso continua reconhecido até decidir (no máximo até o prazo informado no app), com base no **legítimo interesse** da equipe (art. 7º, IX), e pode se opor pelo mesmo interruptor. Sem o seu consentimento, o seu nome não vai para o provedor: nas escalas e na disponibilidade que o Asafe consulta, você aparece sem nome.`,
          "**Cumprimento de obrigação legal** (art. 7º, II): guardar registros de acesso pelo prazo do Marco Civil da Internet e atender ordens de autoridades.",
          "**Exercício regular de direitos** (art. 7º, VI): guardar o necessário para defesa em processos judiciais, administrativos ou arbitrais.",
        ],
        "Não tomamos decisões exclusivamente automatizadas que afetem seus interesses (art. 20 da LGPD).",
      ],
    },
    {
      id: "dados-sensiveis",
      title: "Dados pessoais sensíveis",
      blocks: [
        `O ${APP_NAME} é feito para equipes de louvor de igrejas. Por isso, participar de uma equipe — que costuma ter o nome de uma igreja ou ministério —, as escalas de culto e o repertório podem revelar a sua **convicção religiosa**, que a LGPD considera **dado pessoal sensível** (art. 5º, II).`,
        `Tratamos esses dados só para prestar o serviço que você e a sua equipe usam, com base em ${value(SENSITIVE_DATA_LEGAL_BASIS)} (art. 11 da LGPD). **Não os usamos para publicidade nem para traçar perfil religioso** e não os compartilhamos além do descrito nesta Política.`,
        `No Asafe, o nome da equipe, os cultos e o repertório vão para a ${ASAFE_AI_PROVIDER} com o consentimento específico e em destaque do líder que ativa o assistente e de cada pessoa que permite o uso dos próprios dados (art. 11, I).`,
        "Não informe dados de saúde ou outros dados sensíveis no motivo de uma indisponibilidade, no chat ou ao Asafe: escreva só o necessário (por exemplo, “compromisso de família”). A sua equipe pode ver o motivo que você informar.",
      ],
    },
    {
      id: "compartilhamento",
      title: "Com quem compartilhamos",
      blocks: [
        "Compartilhamos dados apenas no necessário para o serviço funcionar:",
        [
          "**Sua equipe:** os membros veem seu nome, foto, funções, disponibilidade, escalas, mensagens do chat e o conteúdo da equipe, conforme as permissões definidas pelos líderes.",
          `**Denúncias:** quando você denuncia uma mensagem, os líderes da equipe e a equipe do ${APP_NAME} veem a denúncia, com o seu nome, o motivo e a cópia da mensagem; se ela for sobre alguém da liderança, só a equipe do ${APP_NAME} vê. A pessoa denunciada não é avisada da denúncia nem de quem a fez.`,
          `**Infraestrutura:** o banco de dados, os arquivos e a autenticação ficam em servidor contratado junto a ${value(INFRA_PROVIDER)}, onde operamos o software de código aberto Supabase.`,
          `**Google:** login com Google (se você escolher), entrega de notificações pelo Firebase Cloud Messaging e o player do YouTube incorporado ao app, que usa os Serviços de API do YouTube. Ao reproduzir um vídeo, o Google pode coletar dados conforme a ${link("Política de Privacidade do Google", "https://policies.google.com/privacy")}. Quando você importa o áudio de um link do YouTube, nosso servidor acessa o vídeo indicado por você.`,
          "**Serviços de notificação dos navegadores** (como Google, Mozilla, Apple e Microsoft), que entregam os avisos do app web.",
          `**${ASAFE_AI_PROVIDER}:** quando alguém chama o Asafe numa equipe que o usa, a OpenAI recebe, para gerar a resposta, a mensagem enviada ao assistente, o nome, o papel e as funções de quem pergunta e as informações da equipe necessárias para responder — por exemplo, o nome da equipe, a escala de um culto com a função e a confirmação das pessoas escaladas, o repertório e o roteiro. **Nomes de outras pessoas só vão quando elas permitem o uso dos próprios dados:** quem não permite aparece sem nome nas escalas e nas vozes do roteiro e fica fora das listas de disponibilidade (que nunca levam o motivo). O texto de uma mensagem de outra pessoa, citada ao chamar o Asafe, só vai se essa pessoa for da equipe e permitir o uso dos dados dela, e o ${APP_NAME} não guarda esse texto. Telefone, e-mail e identificadores do WhatsApp não são enviados. ${ASAFE_PROVIDER_RETENTION}`,
          "**Provedores de inteligência artificial contratados** (inclusive nos Estados Unidos): recebem o conteúdo necessário quando você usa recursos como sincronizar letras, transpor tons, sugerir músicas para um culto e importar cifras ou projetos do Moises — por exemplo, a letra, a cifra ou os títulos das músicas.",
          `**WhatsApp (Meta) e gateway de integração (Evolution API):** quando sua equipe usa o Asafe, as mensagens passam pelo WhatsApp e pelo gateway que conecta o WhatsApp ao ${APP_NAME}, hospedado em infraestrutura contratada por nós.`,
          `**Envio de e-mails:** ${value(EMAIL_PROVIDER)}, para e-mails de redefinição de senha, confirmação e convite.`,
          "**Autoridades:** quando exigido por lei ou ordem judicial, ou para proteger direitos e a segurança de pessoas — inclusive comunicando às autoridades conteúdo de abuso ou exploração sexual de crianças e adolescentes.",
          "**Reorganizações societárias:** em caso de fusão, aquisição ou venda do serviço, os dados seguem com o serviço, protegidos por esta política.",
        ],
        `Os operadores só podem usar os dados para prestar o serviço ao ${APP_NAME}, segundo nossas instruções. **Exigimos, por contrato ou pelos termos dos serviços contratados, que ofereçam aos dados pessoais proteção igual ou superior à descrita nesta Política e à exigida pela LGPD.**`,
        "**Não vendemos nem alugamos dados pessoais, não os usamos para publicidade e não os repassamos a corretores de dados.** Também não rastreamos você em apps ou sites de outras empresas.",
      ],
    },
    {
      id: "links-publicos",
      title: "Links públicos de culto e repertório",
      blocks: [
        "Líderes podem gerar um link público de um culto ou de um repertório para compartilhar com quem não tem conta. **Qualquer pessoa com o link** vê o conteúdo compartilhado: nome, data e descrição do culto, a ordem do culto, as músicas com letra, cifra, tom e áudio e, no caso do culto, o nome e a função das pessoas escaladas.",
        `Compartilhe esses links só com quem precisa. Para desativar um link já enviado, fale com o ${link("suporte", LEGAL_PATHS.support)} ou exclua o culto ou o repertório.`,
      ],
    },
    {
      id: "transferencia-internacional",
      title: "Transferência internacional",
      blocks: [
        "Alguns operadores — como OpenAI, Google, Meta e provedores de inteligência artificial — tratam dados fora do Brasil, principalmente nos **Estados Unidos**. Essas transferências seguem o art. 33 da LGPD: ocorrem quando necessárias para executar o contrato com você (art. 33, IX), com garantias contratuais dos provedores (art. 33, II) e, no caso do Asafe, também com o consentimento específico e em destaque de quem autoriza o uso dos próprios dados (art. 33, VIII): o líder, ao aceitar o aviso que ativa o assistente, e cada membro, ao permitir o uso dos seus dados.",
      ],
    },
    {
      id: "retencao",
      title: "Por quanto tempo guardamos",
      blocks: [
        [
          `**Conta e perfil:** enquanto a conta existir. Quando você exclui a conta pelo app, são apagados na hora; pedidos de exclusão por e-mail são atendidos em até ${PRIVACY_REQUEST_RESPONSE_DAYS} dias.`,
          "**Conteúdo da equipe** (músicas, repertórios, cultos, escalas, arquivos e chat): enquanto a equipe existir ou até ser apagado por quem tem permissão. As mensagens que você enviou no chat são apagadas junto com a sua conta.",
          `**Asafe:** histórico de mensagens por ${ASAFE_HISTORY_RETENTION_DAYS} dias; códigos de ativação e de vínculo por até 7 dias depois do uso ou da expiração; contadores de uso agregados por dia; registros de aceite e de revogação do aviso sobre a IA, como prova da escolha, que deixam de identificar você quando a conta é excluída.`,
          "**Registros de acesso** (IP, data e hora): 6 meses, como exige o art. 15 do Marco Civil da Internet (Lei nº 12.965/2014), ou mais, se houver ordem judicial.",
          `**Denúncias e registros de moderação:** pelo tempo necessário para a apuração (analisamos em até ${REPORT_REVIEW_TIME}) e, depois, pelo prazo legal para defesa de direitos. Se a conta de quem denunciou ou de quem foi denunciado for excluída, a denúncia perde a ligação com essa conta; a cópia da mensagem denunciada continua como prova, e o anexo dela é apagado quando a denúncia é analisada.`,
          "**Bloqueios:** até você desbloquear a pessoa ou uma das duas contas ser excluída.",
          "**Suporte:** chamados e sugestões abertos no app ficam enquanto a conta existir e são apagados com ela; e-mails trocados com o suporte, por até 5 anos, para defesa de direitos (art. 27 do Código de Defesa do Consumidor).",
          "**Tokens de notificação:** até você sair da conta, desinstalar o app ou o token expirar.",
          "**Convites pendentes:** até serem aceitos, cancelados ou expirarem.",
        ],
        `Cópias de segurança (backups) podem conter dados já excluídos por ${value(BACKUP_RETENTION)}, até serem substituídas.`,
      ],
    },
    {
      id: "exclusao",
      title: "Exclusão da conta",
      blocks: [
        `Você pode excluir sua conta a qualquer momento, sem custo: no app, em **${DELETE_ACCOUNT_IN_APP}**, ou pela página ${link("Excluir conta", LEGAL_PATHS.deleteAccount)}, que funciona mesmo sem o app instalado.`,
        "Ao excluir a conta, apagamos seu perfil (nome, foto, e-mail, telefone, preferências e o registro do aceite dos termos), suas escalas, disponibilidade, funções e loops de ensaio, as mensagens que você enviou no chat e os arquivos anexados, os rascunhos de músicas que você não chegou a cadastrar (com os arquivos deles; o que já entrou num repertório ou culto fica com a equipe, sem o seu nome), as pessoas que você bloqueou, o vínculo e as conversas com o Asafe, notificações, aparelhos cadastrados para avisos, chamados de suporte, convites para o seu e-mail e as equipes de que você é dono(a) e o único membro, com tudo o que há nelas.",
        "Músicas já cadastradas, repertórios, cultos e avisos que você criou dentro de uma equipe com outros membros fazem parte do acervo da equipe e continuam disponíveis para eles **sem identificar você**. Se você for dono(a) ou o único líder de uma equipe com outros membros, o app pede que você passe a equipe ou a liderança a outra pessoa antes de excluir a conta.",
        "Continuam, sem ligação com a sua conta: as denúncias do chat que envolvem você, com a cópia da mensagem denunciada, pelo prazo da apuração (o anexo, só até a denúncia ser analisada), e o histórico de aceites e recusas do aviso sobre a IA do Asafe. Guardamos também o registro de que a exclusão foi feita, sem dados pessoais, e o que a lei exige ou for necessário para defesa de direitos, pelos prazos da seção anterior.",
      ],
    },
    {
      id: "direitos",
      title: "Seus direitos",
      blocks: [
        "Pela LGPD (art. 18), você pode pedir a qualquer momento:",
        [
          "confirmação de que tratamos seus dados e acesso a eles;",
          "correção de dados incompletos, inexatos ou desatualizados;",
          "anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;",
          "portabilidade dos dados a outro fornecedor, conforme a regulamentação da ANPD;",
          "eliminação dos dados tratados com base no consentimento e revogação do consentimento;",
          "informação sobre com quem compartilhamos seus dados e sobre a possibilidade de não consentir, com as consequências da recusa;",
          "oposição a tratamento feito em desacordo com a lei.",
        ],
        `Muita coisa você faz direto no app: editar nome, foto e telefone, mudar as notificações, desligar o uso dos seus dados pelo Asafe e excluir a conta. Para os demais pedidos, escreva para ${mail(PRIVACY_EMAIL)}. Podemos pedir informações para confirmar sua identidade e respondemos em até ${PRIVACY_REQUEST_RESPONSE_DAYS} dias.`,
        `Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (${link("ANPD", "https://www.gov.br/anpd")}).`,
      ],
    },
    {
      id: "seguranca",
      title: "Segurança",
      blocks: [
        "Adotamos medidas técnicas e administrativas para proteger seus dados: conexão criptografada (HTTPS), senhas guardadas só como hash, regras de acesso no banco de dados que isolam cada equipe, arquivos do chat privados com links temporários e acesso administrativo restrito.",
        "Nenhum sistema é totalmente seguro. Se houver um incidente de segurança que possa causar risco ou dano relevante, avisaremos você e a ANPD, como determina o art. 48 da LGPD.",
      ],
    },
    {
      id: "criancas",
      title: "Crianças e adolescentes",
      blocks: [
        `O ${APP_NAME} não é destinado a crianças. A idade mínima para ter conta é **${MIN_AGE} anos**. Adolescentes de ${MIN_AGE} a 17 anos só podem usar o app com autorização e acompanhamento dos pais ou responsáveis legais.`,
        `Líderes não devem convidar nem cadastrar crianças menores de ${MIN_AGE} anos. Se soubermos de uma conta de criança abaixo dessa idade, vamos excluí-la. Pais e responsáveis podem pedir a exclusão pelo e-mail ${mail(PRIVACY_EMAIL)}.`,
      ],
    },
    {
      id: "armazenamento-local",
      title: "Cookies e armazenamento local",
      blocks: [
        "O app usa o armazenamento do navegador ou do aparelho apenas para funcionar: manter você conectado, lembrar preferências e guardar uma cópia temporária para abrir mais rápido. **Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros.** O player do YouTube, quando usado, pode gravar cookies do Google.",
      ],
    },
    {
      id: "alteracoes",
      title: "Alterações desta política",
      blocks: [
        "Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A data da versão fica no topo da página. Quando a mudança for relevante, avisaremos no app e pediremos um novo aceite antes de você continuar.",
      ],
    },
    {
      id: "contato",
      title: "Contato",
      blocks: [
        `Dúvidas e pedidos sobre privacidade: ${mail(PRIVACY_EMAIL)} (encarregado: ${value(DPO_NAME)}). Outros assuntos: ${link("página de suporte", LEGAL_PATHS.support)}.`,
        `${value(LEGAL_ENTITY_NAME)} · ${value(LEGAL_DOCUMENT)} · ${value(LEGAL_ADDRESS)}`,
      ],
    },
  ],
};
