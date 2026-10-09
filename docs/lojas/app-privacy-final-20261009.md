# App Privacy — matriz de evidências para o iOS

Revisão de 09/10/2026. Base: `3d86495be7d1b4cab21461c424221710a39d5ec5`,
mais a alteração local autorizada de abertura externa do YouTube descrita abaixo.
Este documento prepara respostas; não comprova seu salvamento ou publicação no
App Store Connect e não certifica direitos de conteúdo ou conformidade jurídica.

## Qual compilação esta matriz cobre

- **Compilação 10 já enviada:** archive local identificado como
  `com.maislouvor.app`, `1.0.0 (10)`, fonte congelada `e497632`. Ainda contém
  players YouTube incorporados. Não sustenta uma declaração global de ausência
  de rastreamento apenas com a auditoria do código próprio.
- **Próxima compilação 11:** código local passa a abrir YouTube em aplicativo
  externo no nativo, sem iframe nem carregamento de `iframe_api`. A coluna
  “rastreamento” abaixo é a proposta para essa implementação, condicionada à
  inclusão e conferência da mudança no binário que será selecionado para revisão.
  Não aplicar retroativamente a conclusão ao build 10.
- As nove fontes examinadas de compras, push, player, política e Asafe estavam
  idênticas entre `e497632` e `3d86495` antes da alteração. A auditoria das
  bibliotecas usou os manifests efetivamente presentes no archive 10.

## Respostas por tipo de dado

“Funcionalidade” = **Funcionalidade do app / App Functionality**;
“Análise” = **Análise / Analytics**. Em todos os itens abaixo há coleta fora do
aparelho e ligação com a conta nos fluxos descritos. Não marcar publicidade do
desenvolvedor, outras finalidades ou personalização apenas porque existe uma
tela individual de equipe. A seleção corresponde ao uso identificado, não a
todos os usos possíveis de um fornecedor.

| Tipo selecionado na Apple | Finalidades a marcar | Ligado à identidade | Usado para rastreamento | Evidência e certeza |
| --- | --- | --- | --- | --- |
| Nome | Funcionalidade | Sim | Não¹ | **Alta.** Cadastro/perfil, autoria no chat e escalas; nome também compõe o contexto do Asafe autorizado. `SignUp.tsx`, `TeamSettings.tsx`, `Chat.tsx`, `whatsapp-assistant/handler.ts:347`. |
| Endereço de e-mail | Funcionalidade | Sim | Não¹ | **Alta.** Autenticação, conta, recuperação, convites e atendimento. Google/Apple podem fornecer e-mail escolhido no login. Não são configurados atributos de e-mail no SDK RevenueCat. |
| Número de telefone | Funcionalidade | Sim | Não¹ | **Alta.** Perfil opcional e identificação/vínculo WhatsApp do Asafe. `TeamSettings.tsx:332`; `assistant_resolve_sender`. Não há campo de telefone no payload estruturado enviado à OpenAI. |
| Informações confidenciais / Sensitive Info | Funcionalidade | Sim | Não¹ | **Alta.** Equipe de igreja, funções e participação em cultos podem revelar religião. `team_members`, `culto_lineup`, disponibilidade e consentimento individual. Não confundir com coleta de Face ID. |
| E-mails ou mensagens de texto | Funcionalidade | Sim | Não¹ | **Alta.** Texto, autoria, equipe e horário do chat persistem. `Chat.tsx:347–356`. O canal opcional Asafe também armazena perguntas/respostas, com consentimento separado. |
| Fotos ou vídeos | Funcionalidade | Sim | Não¹ | **Alta.** Fotos de perfil e imagens do chat, vinculadas ao perfil/mensagem. `TeamSettings.tsx:304–309`, `Chat.tsx:380–409`. A categoria conjunta não significa que há upload de vídeo nativo. |
| Dados de áudio | Funcionalidade | Sim | Não¹ | **Alta.** Mensagens de voz enviadas pelo usuário: `Chat.tsx:380–413`; gravações/faixas da equipe são armazenadas e processadas pelo serviço. Separação continua em infraestrutura própria; não envia áudio à OpenAI pelo fluxo Asafe auditado. |
| Atendimento ao cliente | Funcionalidade | Sim | Não¹ | **Alta.** Chamados e respostas têm autor/solicitante identificados. `Suggestions.tsx:21`, `SupportTicketDetail.tsx`, migration `20260930010000_platform_admin_and_support.sql:117–135`. |
| Outros conteúdos de usuário | Funcionalidade | Sim | Não¹ | **Alta.** Anotações, marcações de ensaio, disponibilidade, confirmações e conteúdo da equipe. `LoopPanel.tsx:159–171`, telas de culto e música. A gestão de músicas/repertórios ser restrita à web não elimina os demais conteúdos criados no iOS. |
| ID de usuário | Funcionalidade **e Análise** | Sim | Não¹ | **Alta.** `profiles.user_id`, IDs internos e UUID de cobrança da equipe. RevenueCat recebe `context.app_user_id`; o servidor permite relacioná-lo à equipe/responsável. Asafe envia também um hash estável de `profile_id` como `safety_identifier`; hash não torna a conta anônima para o +Louvor. |
| Histórico de compras | Funcionalidade **e Análise** | Sim | Não¹ | **Alta.** RevenueCat valida/sincroniza transações, assinaturas e acesso. `src/lib/billing/revenuecat.ts:33–89`, tabela `revenuecat_customers` e webhook. O erro atual de ofertas não retira a coleta prevista pelo recurso. |

¹ **Não** significa ausência de uso identificado para publicidade entre apps/sites
ou corretagem de dados nos fluxos examinados. Vale para o próximo binário com a
abertura externa validada, não para concluir que o YouTube incorporado do build 10
não rastreia. Não há envio de nome, e-mail, telefone, chat ou histórico de compras
do +Louvor ao YouTube no código examinado. Também não foi encontrado SDK de
anúncios/atribuição ou leitura de IDFA. Novas integrações externas exigem revisão.

O enquadramento dos tipos, vínculo e finalidade segue as
[definições da Apple](https://developer.apple.com/app-store/app-privacy-details/).
Dados opcionais continuam declarados aqui; não foi demonstrado que todos os
critérios da exceção de divulgação opcional seriam cumpridos. Estatísticas
funcionais de escalas e loops criados manualmente não foram tratadas como prova
de um sistema de telemetria de cliques.

### Acrescentar um tipo por evidência do servidor

| Tipo adicional | Finalidade | Ligado à identidade | Rastreamento | Base |
| --- | --- | --- | --- | --- |
| Outros dados diagnósticos / Other Diagnostic Data | Funcionalidade | Sim | Não¹ | Logs persistentes de requisições/erros no gateway. URLs de consultas podem conter IDs que o próprio serviço relaciona a contas; não há anonimização comprovada antes de registrar. É uma classificação conservadora sustentada pela configuração, sem presumir localização ou publicidade. |

## RevenueCat: resposta específica

O SDK Capacitor instalado é `13.7.0`. A configuração usa UUID de cobrança próprio;
não chama `setEmail`, `setDisplayName`, `setAttributes` ou coleta de identificador
publicitário no fluxo auditado. A relação `revenuecat_customers.team_id` e
`app_user_id` impede classificar compras como anônimas. A orientação oficial pede
Funcionalidade e Análise para compras, e vínculo “Sim” quando o ID é relacionável
à pessoa. RevenueCat não usa compras inerentemente para anúncios entre apps.
[Guia oficial RevenueCat](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy).

O manifest do framework no archive declara compras para funcionalidade, não
ligadas e sem tracking. É a descrição genérica do SDK; não substitui o uso
concreto do UUID próprio nem o questionário do aplicativo. O manifest principal
declara uso de UserDefaults; os manifests de Capacitor/Cordova declaram ausência
de tracking. Isso não é uma auditoria automática de todo o backend.

## Asafe / OpenAI

`whatsapp-assistant/handler.ts:302–364` monta texto, histórico e contexto com nome,
papel, instrumentos e equipe. Ferramentas fornecem somente dados permitidos pelo
fluxo de consentimento; a autorização geral e a individual do Asafe continuam
separadas. `safetyIdentifier: hashId(profile_id)` é um identificador estável,
classificado na matriz como vinculado. Não se deve descrevê-lo como anonimização.

`whatsapp-assistant/openai.ts:64–111` usa **Responses API** com `store: false`.
Isso desativa a persistência de estado solicitada pela aplicação, mas não é
Zero Data Retention. A documentação permite logs de monitoramento de abuso por
até 30 dias por padrão, com exceções, e não usa dados da API para treinamento por
padrão; configurações especiais/opt-in da organização não foram inspecionadas.
[Controles de dados da API OpenAI](https://developers.openai.com/api/docs/guides/your-data).

No +Louvor, `assistant_messages` guarda conversa, IDs, erro e contadores; existem
contagens diárias por membro. Esses registros operacionais vêm do canal WhatsApp,
não são evidência de coleta de toques/sessões do iPhone. Dados da conta/equipe
originados no app e depois usados pelo assistente estão abrangidos pelas
categorias acima. Não declarar “nenhum dado sai do aparelho” para Asafe ou
separação de faixas: esta última é própria do serviço, não necessariamente local
ao iPhone. Nenhum consentimento foi alterado nesta revisão.

## YouTube: diferença entre build 10 e próxima versão

No archive 10 foram encontrados `youtube.com/embed` em bundles de
SongEditor, Presentation e CultoDetail (inclui SongSummaryModal), além de
`youtube.com/iframe_api` em PublicPlaylist. Os três primeiros correspondem a
player padrão; Presentation e SongSummary acionam autoplay.

O Google informa coleta ao carregar o player e coleta adicional ao reproduzir;
autoplay antecipa esse segundo momento. Isso exige análise própria de interação,
identificadores e eventual publicidade, não apenas das onze categorias do banco.
[Políticas do player YouTube](https://developers.google.com/youtube/terms/developer-policies).
A política Google descreve identificadores, atividade e possível associação à
conta; não determina sozinha quais campos saíram deste iPhone específico.
[Política Google](https://policies.google.com/privacy).

A alteração autorizada para o próximo binário:

- `src/lib/youtubePlayback.ts`: só constrói URL `https://www.youtube.com/watch`
  a partir de ID validado de 11 caracteres, sem dados de conta ou parâmetros de
  atribuição; abre `_blank` com `noopener,noreferrer` após ação do usuário.
- `SongSummaryModal`, `SongEditor`, `Presentation` e `PublicPlaylist`: nenhum
  iframe/API YouTube é montado no nativo. Vídeo abre externamente; áudio próprio,
  mixer e faixas continuam dentro do app. Web mantém o comportamento existente.
- Capacitor iOS **8.5.2**, fonte instalada
  `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:334`:
  o delegado de nova janela chama `UIApplication.shared.open` e retorna `nil`.
  A navegação externa também é cancelada/delegada ao sistema em `:108–120`.
  Não foi usado `Browser.open`/SFSafariViewController para esse recurso.
- Os links canônicos só levam o identificador público do vídeo. Não afirmar que
  YouTube/Safari deixam de coletar dados no aplicativo externo; apenas não há
  player incorporado ao +Louvor nesse caminho.

Trocar só por `youtube-nocookie.com` não seria equivalente a remover o player.
O modo reforçado limita personalização, mas a documentação não promete ausência
de toda coleta. [Ajuda oficial do YouTube](https://support.google.com/youtube/answer/171780).

## IP e registros técnicos: leitura de configuração real

Inspeção SSH somente leitura em 09/10, limitada a configuração de logging; não
foram lidos conteúdos de logs, dumps de ambiente ou dados de usuários.

- `supabase-kong`: `access_log /dev/stdout combined` no gateway, e error logs.
- O formato `combined` inclui endereço remoto, requisição, status, horário,
  referer e user-agent. [Formato oficial NGINX](https://nginx.org/en/docs/http/ngx_http_log_module.html).
- Kong contém `real_ip_header X-Real-IP` e `real_ip_recursive off`; a inspeção não
  demonstrou a cadeia de confiança que faria `remote_addr` ser o IP real do
  usuário em vez do proxy. Não afirmar precisão/localização a partir disso.
- `supabase-auth`, `supabase-edge-functions`, `supabase-kong`, `supabase-rest` e
  `supabase-storage` usam Docker `json-file`, com opções de logging vazias.
  `/etc/docker/daemon.json` não existe. Esse driver persiste stdout/stderr; sem
  `max-size` configurado, o padrão não limita tamanho. Não foi identificado um
  prazo de retenção por essas configurações. [Docker json-file](https://docs.docker.com/engine/logging/drivers/json-file/).
- O Caddyfile examinado não contém diretiva de access logging; isso não elimina
  os registros do gateway/auth/edge. Rotação por ferramentas externas não foi
  auditada. Não prometer que todos esses logs expiram em 30 dias.

Nenhum uso de IP para geolocalização ou publicidade foi identificado. Declarar
“Outros dados diagnósticos”, conforme a finalidade operacional, em vez de
acrescentar localização/Device ID por dedução automática. `ErrorBoundary` apenas
escreve no console; não prova um coletor remoto de crashes do iPhone.

## Itens que não têm evidência de coleta no iOS auditado

- **Device ID por push:** `src/lib/push.ts:127` retorna fora do Android. O archive
  10 não contém Firebase e não registra token APNs nesse fluxo. A referência
  “FCM Android/iOS” da política é ampla demais para esta implementação.
- **Biometria:** Face ID verifica localmente e não entrega molde biométrico ao
  backend; não acrescentar biometria por esse recurso.
- **Cartão, localização, agenda de contatos e identificador publicitário:** não
  encontrados no fluxo iOS examinado. Compras e identidades já estão declaradas.
- **Crash/performance nativos:** nenhum SDK dedicado identificado. O código de
  suporte de cobrança é mostrado localmente, sem telemetria própria.

## Verificações e pendências para fechar a ficha

1. **Código:** 36 testes em cinco arquivos passaram, cobrindo todos os caminhos
   de vídeo alterados, URL canônica, ausência de iframe/API no nativo, player web
   preservado, áudio da playlist, separação e mixer/loops existentes. Typecheck
   e `git diff --check` passaram. Após os esclarecimentos factuais da política,
   outros **19 testes documentais** e a guarda de placeholders dos cinco
   documentos passaram. Não houve instalação de dependência.
2. **Binário:** o coordenador deve congelar/compilar a versão seguinte e confirmar
   em simulador/dispositivo a troca efetiva para Safari/YouTube e o retorno ao
   app. Os testes JS e a leitura de Swift não substituem essa verificação.
3. **Ficha:** completar as onze linhas e acrescentar Outros dados diagnósticos.
   Vincular a conclusão sobre vídeo externo ao build efetivamente selecionado.
   Este documento não confirma publicação de App Privacy.
4. **Texto público:** esclarecimento factual autorizado aplicado em `privacy.ts`:
   substituídas as afirmações globais “não exibimos anúncios / não rastreamos”
   pela distinção entre dados da conta/equipe e o player YouTube da web; vídeo
   externo no nativo explicado; FCM identificado como Android. As versões legais,
   timestamps de aceite, migrations e regras de consentimento foram preservados.
   A publicação desse texto depende da release coordenada; este registro não a
   confirma.
5. **Operação:** definir/verificar rotação real de logs e revisão das configurações
   dos fornecedores caso sejam ativadas integrações de publicidade, atribuição
   ou compartilhamento para treinamento. Não executar mudanças de runtime como
   parte do preenchimento da ficha.
6. **Fora desta matriz:** direitos autorais continuam sem comprovação; acesso a
   música em site público não demonstra licença. Oferta, compra/restauração
   RevenueCat e revisão pública continuam pendentes conforme os registros
   próprios. Nenhuma resposta desta matriz afirma que esses testes passaram.
