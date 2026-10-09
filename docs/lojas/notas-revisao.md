# Notas para a revisão das lojas

Material atualizado em **09/10/2026**. O iOS **1.0.0 (11)** foi gerado da
fonte **`94b9a93`**, enviado, processado e disponibilizado ao grupo interno
**Teste iPhone**. A ficha 1.0.0 seleciona esse build, mantém lançamento manual
e está em **Preparar para envio**, sem submissão pública. Foram salvas seis
capturas de iPhone, cinco de iPad e estas notas; a declaração App Privacy foi
publicada com doze categorias. Ver o
[registro final](preparacao-final-20261009.md).

**Pendências de envio:** o teste anterior no iPhone brasileiro apresentou
`ML-IOS-OFFERINGS-23-BRA`. Carregamento dos produtos, compra, restauração e
liberação do plano no build 11 continuam sem validação concluída. O teste direto
StoreKit do simulador USA não encontrou produtos, mas não explica sozinho a
falha brasileira. Não é solicitado logout da conta Apple pessoal. Também faltam
documentação dos direitos do acervo e acesso controlado de revisão ao Asafe.
Ver o [diagnóstico](diagnostico-nativo-assinaturas-20261009.md).

## Contas e campos privados

O roteiro usa as equipes fictícias de `scripts/review-demo/seed.mjs`, uma por
loja. Conferir login, estado atual, plano e permissões antes de copiar as notas.
Em **09/10/2026**, a conta Apple foi criada sem reset, após inspeção dos cinco
e-mails e implantação da migração pendente do catálogo. Login e leitura com as
permissões da própria conta foram validados pela API: cinco integrantes, seis
músicas, cinco faixas, um repertório, dois cultos, onze mensagens e onze arquivos
de áudio acessíveis. O aceite dos termos foi concluído somente para a conta fictícia Apple durante
o QA nativo. Login, repertório, ensaio, mixer com reprodução/pausa e culto foram
conferidos nos simuladores iPhone e iPad. Uma separação real posterior foi
validada em fixture temporária independente: seis faixas, sem alterar a demo.
O teste não valida cobrança nem qualidade musical do isolamento. A conta Google
não foi criada nesta etapa. Ver o [registro de preparação](preparacao-revisao-20261009.md).

Preencher os marcadores somente nos formulários privados das lojas, a partir de
`~/.local/share/maislouvor-review/credentials.json`. Não gravar credenciais no
Git, em screenshots ou em notas públicas. A preparação coordenada está no
[README do seed](../../scripts/review-demo/README.md). Nunca recriar a conta
quando a respectiva loja estiver revisando o app: isso encerra a sessão do revisor.

| Marcador | Origem |
| --- | --- |
| `{{APPLE_REVIEW_EMAIL}}` / `{{APPLE_REVIEW_PASSWORD}}` | Conta Apple no arquivo privado |
| `{{GOOGLE_REVIEW_EMAIL}}` / `{{GOOGLE_REVIEW_PASSWORD}}` | Conta Google no arquivo privado |

Contato público para suporte e estas notas: **suporte@maislouvor.com**. Pedidos de
privacidade seguem o canal informado em `https://maislouvor.com/privacidade`;
não presumir que uma segunda caixa no domínio já exista. Dados pessoais de contato
exigidos pela loja devem ser preenchidos diretamente no formulário privado.

## App Store Connect — Notes for Review

**Sign-in required:** Yes

**User name:** `{{APPLE_REVIEW_EMAIL}}`

**Password:** `{{APPLE_REVIEW_PASSWORD}}`

Texto em inglês salvo no App Store Connect e conferido por leitura após salvar.
Atualizar as ressalvas somente quando os respectivos testes estiverem concluídos.

```text
+Louvor helps church worship teams organize services, rehearse and communicate. The interface is in Brazilian Portuguese.

ACCESS
Use the supplied demo email/password and tap Entrar. Google, Apple and Face ID are optional. Accept Terms/Privacy if prompted. The account owns Igreja Demonstração (App Review) with four fictitious members. Demo participation records are explicitly marked as fictitious; no real person's consent was inferred.

FEATURES
1. Repertório > Repertório da Demonstração: six songs with lyrics/chords. Ensaio > Baby Bird (demo) > Mixer opens five stems. Playback/pause was checked on iPhone and iPad simulators. Loop provides saved practice sections. The five original songs and synthesized guides were created for this demo. Baby Bird is a credited CC BY 3.0 excerpt by Admiral Bob, with source/license and modifications described in the song.
2. Cultos > Culto de Domingo shows the service order and Escala. Início > Disponibilidade opens the availability calendar.
3. Chat > Geral: hold a member's message to Denunciar or block the sender. Leaders review reports at Usuário > Membros > Denúncias do chat. Manage blocks at Usuário > Perfil > Usuários bloqueados.
4. Creating repertoires, registering/editing songs and importing audio are web management actions. The native app explains Continue pelo computador. Existing songs can be added to an existing repertoire with permission. Native YouTube video actions open the YouTube app or external browser; no YouTube embed runs inside this iOS build. Uploaded audio, mixer and track separation remain in the app.
5. Track separation: open a song > Ensaio > Gravação > Separar em faixas (IA). It runs on infrastructure operated by +Louvor and requires the appropriate team permission/plan. Existing demo stems are not proof of a new separation run.

PRIVACY AND DELETION
Real users separately authorize team participation on Sua participação, sua escolha. Continuing without authorization preserves privacy choices, support and deletion. Withdraw at Usuário > Perfil > Minhas escolhas de privacidade. Excluir minha conta is on Perfil. If ownership transfer is required, select Ana Exemplo, tap Transferir, then type EXCLUIR and confirm. Deleting an account does not cancel an App Store subscription.

SUBSCRIPTIONS
Usuário > Assinatura. Essencial is free for up to five team members including the owner. Paid plans expand capacity and may include separation, Asafe or both. Only the owner manages billing. iOS uses Apple In-App Purchase through RevenueCat and offers Restaurar compras and Atualizar. Gerenciar assinatura appears for RevenueCat subscriptions. +Louvor includes no advertising SDK.

ASAFE (OPTIONAL WHATSAPP ASSISTANT)
Usuário > Equipe > Assistente no WhatsApp > Gerar código de ativação presents the OpenAI data-sharing notice. A leader authorizes activation; each person separately permits their own data under Usuário > Perfil > Permitir que o Asafe use meus dados. Both choices are revocable. No WhatsApp test group is connected to this demo and no AI consent was automatically accepted; end-to-end assistant review still requires controlled group setup and plan access.

VALIDATION LIMIT
The earlier Brazilian iPhone TestFlight test reported ML-IOS-OFFERINGS-23-BRA. Build 11 purchase/restoration and paid access are not yet validated. Public submission is held pending resolution and content-rights documentation.

Support: https://maislouvor.com/suporte
Privacy: https://maislouvor.com/privacidade
Terms: https://maislouvor.com/termos
Deletion: https://maislouvor.com/excluir-conta
```

## Google Play Console — App access

Em "Conteúdo do app → Acesso ao app", informar funcionalidades restritas e a
conta Google independente. O roteiro curto não confirma um AAB final nem valida
as compras Google Play.

- **Name:** `Demo leader account (Google Play)`
- **Username / e-mail:** `{{GOOGLE_REVIEW_EMAIL}}`
- **Password:** `{{GOOGLE_REVIEW_PASSWORD}}`
- **Any other information required to access your app:**

```text
Use the supplied e-mail/password > "Entrar". Accept Terms if prompted. Demo data is fictitious. If shown, review "Sua participação, sua escolha" to authorize team access or continue without it. Privacy: Usuário > Perfil > Minhas escolhas de privacidade. Delete: Perfil > Excluir minha conta; transfer to Ana Exemplo if requested, type EXCLUIR. Billing: Usuário > Assinatura. Support: suporte@maislouvor.com
```

## Conteúdo e privacidade — respostas a conferir

- **Interação e conteúdo de usuários:** sim; chat e conteúdos das equipes, com
  denúncia e bloqueio. Conferir a classificação etária sugerida a partir do
  conteúdo efetivamente acessível, sem presumir a faixa pela finalidade religiosa.
- **Compras digitais:** sim, há assinaturas. No iOS, existe integração de compras
  App Store; falha no carregamento não significa ausência da função. Android
  exige conferência própria da cobrança no AAB; TestFlight não valida Google Play.
- **Anúncios:** não há SDK de publicidade no escopo conferido. Conferir o inventário
  final e as integrações ao declarar ausência de rastreamento publicitário.
- **Dados e finalidades:** conta, conteúdo e comunicação da equipe, disponibilidade,
  escalas, notificações e assinaturas. Nome, e-mail, telefone/foto opcionais,
  mensagens/mídias, músicas/cifras/áudios e identificadores precisam constar da
  avaliação. Não marcar "não coleta dados". O servidor +Louvor não recebe números
  de cartão, mas trata histórico e estado de compras.
- **Provedores:** RevenueCat para assinaturas; Apple/Google para compras nativas
  e logins escolhidos; Stripe na web; Hostinger e provedores de comunicação
  descritos na política. Asafe utiliza WhatsApp/Meta e OpenAI conforme escolhas
  específicas. Mapear operadores e compartilhamento às definições de cada loja.
- **Participação religiosa:** a fonte publicada declara consentimento específico
  e destacado de cada pessoa antes das funções de equipe. O líder não autoriza
  em nome dos integrantes. Versão e data da escolha são registradas; revogar
  bloqueia funções de equipe, preservando conta, suporte e exclusão. Avaliar os
  dados que podem revelar convicção religiosa nas categorias de dados sensíveis.
  Essa implementação não equivale a parecer jurídico ou aprovação das lojas.
- **Asafe e separação:** autorizações de participação e IA são separadas. Ativação
  administrativa pelo líder não substitui escolha individual. Asafe e separação
  de faixas permanecem; a separação usa infraestrutura operada pelo +Louvor e
  não depende do aceite do Asafe. Sugestão de músicas com IA e importação do Moises
  foram removidas. Consentimentos e documentos já fazem parte da versão integrada.
- **Proteção e exclusão:** HTTPS; exclusão no app e instruções em
  `https://maislouvor.com/excluir-conta`. A política descreve retenção e backups;
  não prometer eliminação instantânea de todas as cópias ou cancelamento de
  assinatura pela exclusão da conta.
- **Contatos:** suporte em `suporte@maislouvor.com`; privacidade na página pública.
  SMTP configurado e autenticado; entrega na caixa de entrada ainda não testada
  segundo o registro da implantação. O prazo publicado para análise de denúncias
  é de 24 horas; a operação de atendimento deve acompanhar a fila.

### App Privacy: complementos da integração RevenueCat

A declaração foi preenchida e publicada em 09/10/2026 para o build 11, com
doze categorias vinculadas, incluindo compras e diagnósticos. User ID e Purchase
History usam Funcionalidade e Análise; as demais usam Funcionalidade. Rastreamento
foi marcado Não. A [matriz final](app-privacy-final-20261009.md) contém as evidências
e os limites; o resumo abaixo conserva o raciocínio específico de RevenueCat.

| Categoria Apple | Preparação para este app | Evidência |
| --- | --- | --- |
| Purchases → Purchase History | Coletado; App Functionality e Analytics; vinculado à identidade | Validação/liberação da assinatura e painel RevenueCat; `src/lib/billing/revenuecat.ts`, tabela `revenuecat_customers` e guia oficial abaixo |
| Identifiers → User ID | Coletado; vinculado; funcionalidade da assinatura e análise de compras | O SDK recebe `context.app_user_id`; o banco relaciona esse ID opaco à equipe e ao dono. Opacidade não é anonimização |
| Tracking | A integração de compras examinada não usa dados para publicidade entre apps | Conferir a resposta final com os demais SDKs e integrações; não inferir tracking apenas do uso de um provedor externo |
| Device ID, contatos enviados ao RevenueCat, Usage Data e Diagnostics | Não acrescentar automaticamente por causa do SDK de compras; conferir usos adicionais | O adaptador não chama coleta de IDFA nem atributos de contato; diagnósticos locais não foram acrescentados como telemetria |

O [guia oficial RevenueCat de App Privacy](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy),
consultado em 09/10/2026, pede histórico de compras para funcionalidade e análise,
e User ID quando há identificador próprio. Quando o backend permite relacionar
esse identificador à pessoa, o histórico deve ser declarado como vinculado.
As [definições oficiais da Apple](https://developer.apple.com/app-store/app-privacy-details/)
abrangem também os SDKs de terceiros e distinguem vínculo com identidade de
rastreamento publicitário. A análise não substitui as demais categorias do app,
inclusive seus próprios dados de contato, conteúdo e participação religiosa.

Conferência local adicional: o manifest `RevenueCat_RevenueCat.bundle/PrivacyInfo.xcprivacy`
do archive **1.0.0 (9)** contém `PurchaseHistory`, finalidade `AppFunctionality`,
`Linked=false` e `Tracking=false`. Esse manifest genérico **não basta para copiar
`Linked=false` para o +Louvor**: a implementação configura um ID próprio que o
servidor relaciona à conta/equipe (`20261006220000_revenuecat_billing.sql`). O
questionário deve refletir esse uso concreto, além do manifest do fornecedor.

## Limites para a preparação final

- Conferir a conta demo, plano/permissões, estado dos consentimentos e grupo
  controlado do Asafe antes do envio. O seed cria consentimento de participação
  só para personagens fictícios (`review_fixture`), não concede aceite de IA nem
  comprova liberação de recursos pagos. Sua configuração atual permite ativação
  manual do Asafe; não o suspende administrativamente.
- Conferir a política de compras de teste para a conta usada pela revisão. A
  exceção sandbox existente é limitada a uma equipe e prazo; não presumir que
  cubra demos ou revisores. Compra, restauração e acesso seguem pendentes.
- O build 11 foi exportado para App Store Connect sem limitação a testes internos
  e selecionado na versão pública em preparação. Os materiais de revisão dos
  produtos de assinatura e os testes de compra continuam pendentes. Capturas
  com preços fictícios não comprovam compra nem substituem a conferência final.
- Gestão de músicas/repertórios na web não regulariza o acervo: o app continua
  acessando o conteúdo disponibilizado pela equipe. Não afirmar que música
  pública ou uso religioso implica licença. Documentar as permissões necessárias
  para composição, gravação, faixas e fontes; não ocultar a relação web/app da revisão.

## Fontes locais conferidas

- `src/lib/storeBuild.ts`, `src/hooks/useMusicManagement.ts`,
  `src/components/WebMusicManagementNotice.tsx` e
  [gestão de músicas](gestao-musicas-web-20261008.md).
- `src/components/billing/TeamBilling.tsx`, `PlanBuilder.tsx`,
  `src/lib/billing/revenuecat.ts` e [escopo sandbox](revenuecat-sandbox-controlado-20261009.md).
- `src/components/legal/TeamDataConsentGate.tsx`, `src/pages/PrivacyChoices.tsx`,
  `src/components/AssistantSettings.tsx`, `src/lib/legal.ts` e
  [implantação dos consentimentos](deploy-consentimento-coordenado-20261008.md).
- `src/content/legal/privacy.ts`, `terms.ts`, `scripts/review-demo/README.md` e
  [publicação da fonte 26013cc](publicacao-diagnostico-assinaturas-20261009.md).
