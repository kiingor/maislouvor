# Preparação do iOS — 6 de outubro de 2026

> **08/10 — novas etapas:** aviso para computador e consentimento individual preparados; 462 testes do app, 25 de consentimento e 159 integrados aprovados. Backup diário criptografado instalado na VPS e restauração isolada validada; cópia externa/retenção completa ainda em conferência. Quatro screenshots de demonstração gerados, com a diferença entre login web antigo e beta documentada. Google, Apple e Face ID confirmados pelo titular; RevenueCat pendente de teste de compra/restauração. Titular autorizou o NVMe e a compilação nativa de validação passou nele. GoDaddy E-mail Profissional e criação de suporte@maislouvor.com confirmados; SMTP aguarda senha em arquivo privado. Retenção completa dos backups ainda bloqueia a release. Sem novo deploy do app ou TestFlight. [Estado detalhado](../privacidade-backups-screenshots-20261008.md).

> **08/10 — cadastro exclusivo da web:** criação de repertório e cadastro/edição de músicas disponíveis para líderes na web; apps sem importação por arquivo ou YouTube. Separação local, Asafe e demais funções preservados. 456 testes aprovados e QA em Chromium/WebKit. Alteração local, sem novo TestFlight. [Escopo e validação](../gestao-musicas-web-20261008.md).

> **08/10 — dados confirmados:** nome e endereço completos aplicados ao rascunho. O titular confirmou o envio de arquivos pelos usuários e importação do YouTube nas versões em que está disponível. Os Termos refletem esse fluxo, sem presumir licenças. Restam três campos do modelo: SMTP adiado, retenção efetiva dos backups e base/fluxo para dados sensíveis. [Definições atualizadas](../definicoes-privacidade-20261007.md). Sem nova publicação.

> **07/10 — formulário recebido:** identificação, contato público e hospedagem preenchidos no rascunho. Endereço incompleto, retenção efetiva de backups, base/fluxo de dados sensíveis e SMTP ainda pendentes; sem nova publicação. [Pesquisa e definições](../definicoes-privacidade-20261007.md).

> **07/10 — integração autorizada:** preparação nativa/conformidade e RevenueCat/Stripe reunidos em `codex/integracao-lojas-revenuecat`. Asafe e separação local preservados; 439 testes do app e compilação iOS aprovados. Integração local, sem nova publicação ou TestFlight; os dados jurídicos reais continuam pendentes. [Registro da integração](integracao-revenuecat-20261007.md).

> **07/10 — recursos removidos:** sugestões de músicas por IA e importação do Moises retiradas do código; somente as duas rotas correspondentes desativadas no servidor (HTTP 410). Asafe, edição manual e separação local de faixas preservados; três rotas extras retiradas inicialmente foram restauradas. Não houve novo upload: os botões do build 6 só desaparecerão com um cliente atualizado. [Escopo corrigido e validação](../preservacao-asafe-faixas-20261007.md).

> **07/10 — backend:** chave de Sign in with Apple configurada, tabela privada e
> endpoint de tokens publicados; exclusão e moderação também ativadas, com 101
> verificações integradas. E-mail adiado por Filipe.
> [Registro e pendências atuais](../backend-exclusao-moderacao-20261007.md).
> Ainda não houve novo upload após o build 6.

> Atualização visual aprovada: **1.0.0 (6)** está **Em testes**, com login compacto,
> carrossel automático e arraste, sem play/pausa. Frases curtas e separação de
> faixas destacada no slide de ensaio. Ver [registro do login](testflight-login-20261006.md).
>
> Atualização de autenticação: após testar o primeiro beta, o titular pediu Google,
> Apple no iOS e Face ID opcional após o primeiro login. **1.0.0 (2)** já está
> **Em testes** no grupo **Teste iPhone**. A **1.0.0 (5)** reúne Face ID,
> Google com PKCE e correção da reabertura; também está **Em testes** no mesmo grupo.
> Builds 3/4 não foram distribuídos.
> Ver [registro de autenticação e Face ID](testflight-autenticacao-20261006.md).
> O [primeiro beta](testflight-interno-20261006.md) e seu archive foram preservados.
> A automação original permanece PAUSED. Pendências jurídicas e da release pública
> continuam separadas do snapshot interno.

## Estado confirmado

O registro do **+Louvor** foi criado na conta Apple já conectada no Safari:
[App Store Connect](https://appstoreconnect.apple.com/apps/6819834048).
Bundle ID `com.maislouvor.app`, equipe `U9PP989T5D`, SKU `MAISLOUVOR-IOS-001`,
idioma português do Brasil. O cadastro está em **Preparar para envio**.
Descrição, texto promocional, palavras-chave e URL de marketing foram salvos;
lançamento configurado como manual. O EULA padrão da Apple está selecionado.

O TestFlight tem o grupo interno **Teste iPhone**, sem distribuição automática,
**1 tester e 4 compilações**, builds **1.0.0 (1)**, **1.0.0 (2)**, **1.0.0 (5)** e **1.0.0 (6)**. A Apple terminou
o processamento e essas compilações foram adicionadas ao grupo. Estado **Em testes**, com
prazo exibido de 90 dias; titular **Aceito**. O titular confirmou que testou o primeiro
beta e pediu Google, Apple e Face ID. O App Store Connect confirmou o build 5
instalado no iPhone 17 Pro Max. Build 6 disponível para atualizar pelo TestFlight;
teste físico do novo visual e confirmação dos fluxos de autenticação ainda pendentes.
Não houve envio para revisão pública ou distribuição a testers externos.

**Xcode e assinatura resolvidos:** Xcode 27.0 (27A266a), SDK e simulador iOS 27,
conta Apple e certificado de distribuição configurados. A compilação nativa Debug
assinada passou e o app abriu no simulador. O primeiro beta usava e-mail/senha;
o build 2 acrescentou Google/Apple e o build 5 inclui Face ID e Google com PKCE.
Para a versão completa de lançamento, seguem pendentes os dados legais,
a publicação da conformidade no backend/site e o teste físico dos novos logins.

Fonte usada: `MaisLouvor-lojas`, branch `feat/conformidade-lojas`, base `2ae6be8`.
A `main` não contém a integração da conformidade e não deve ser usada para publicar
esta versão. A alteração preexistente de `.env` foi preservada.

## Histórico da preparação local inicial

- Criado `ios/` com Swift Package Manager; Capacitor core/cli/ios/android atualizados
  de 8.4.1 para **8.5.2** após a validação no iOS 27.
- Identificador e equipe configurados, assinatura automática, versão 1.0.0/build 1.
- Nome no iPhone: +Louvor; idioma de desenvolvimento português brasileiro.
- Ícone existente do produto em 1024 × 1024, sem canal alpha; telas de abertura geradas.
- Permissões explicadas para microfone (gravação no chat) e câmera (foto escolhida pelo usuário).
- Esquema de URL `com.maislouvor.app` para os callbacks já tratados pelo app.
- `AppDelegate` usa `@main`; adicionado `SceneDelegate`, manifesto de cenas e
  encaminhamento de URLs pelo `SceneDelegateProxy` oficial do Capacitor 8.5.2.
  Essa mudança corrigiu o encerramento imediato observado ao abrir no iOS 27.
- Corrigidos os nove diagnósticos de tipagem preexistentes: tabela
  `team_join_requests`, `songs.duration_seconds`, `messages.channel_id` e o tipo
  PromiseLike usado na reordenação do roteiro. Não houve alteração de banco.
- O bundle antigo copiado automaticamente pelo `cap add` foi removido de
  `ios/App/App/public`; só deve ser recriado pelo comando `ios:prepare` depois de
  resolver os campos jurídicos. O build de validação em `tmp/ios-validation-dist`
  contém rascunhos e **não é um pacote para publicar**.

## Validação da preparação inicial

- **35 arquivos / 313 testes passaram**, inclusive após Capacitor 8.5.2 e o ajuste
  do registro de push no iOS.
- `npm run typecheck`: passou.
- Build local com `VITE_STORE_BUILD=1`: passou; `import-youtube` ausente nos JS gerados.
- Quatro páginas legais locais no WebKit, viewport 390 × 844: títulos corretos,
  sem erro JavaScript e sem transbordamento horizontal. Capturas e logs em
  `tmp/ios-validation/`. A prévia local é `http://127.0.0.1:5186/termos`.
- `Info.plist`, `project.pbxproj` e `ExportOptions.plist`: sintaxe validada com plutil.
- `git diff --check`: passou.
- Preflight de exclusão executado **somente em leitura** no banco real: sete FKs
  previstas para ajuste pela migração, zero referências desconhecidas que a impeçam.
- `npm run build:store` / `ios:prepare`: bloqueados corretamente pelos 10 valores
  jurídicos pendentes. Não equivale a um archive iOS bem-sucedido.
- Compilação Swift para simulador e compilação Debug para dispositivo: passaram.
  Assinatura do bundle `com.maislouvor.app` confirmada com a equipe `U9PP989T5D`;
  `codesign --verify --deep --strict` passou. Isso não substitui um archive Release.
- App iniciado no simulador iPhone 18 Pro / iOS 27: tela de login renderizada.
  Captura: `tmp/ios-validation/iphone-native-launch.png`.
- URL de teste sem credenciais reconhecida pelo iOS, que exibiu “Abrir com +Louvor?”.
  O callback após essa confirmação não foi validado. Login real e teste físico pendentes.
- Validação nativa isolada em `tmp/ios-native-validation`, ignorada pelo Git.
  Essa cópia contém páginas legais em rascunho e não foi arquivada ou enviada.
  `ios/App/App/public` continua ausente no projeto destinado à distribuição.

## Pendências da versão completa para lançamento

1. **Xcode completo — concluído.** `xcodebuild -checkFirstLaunchStatus` retorna 0;
   conta, equipe, certificado Apple Distribution e perfil automático disponíveis.
   A autorização de uso da chave no Chaves também foi concluída, comprovada pela
   compilação assinada. Não solicitar novamente essas autenticações sem novo erro.
2. **Textos definitivos.** `src/lib/legal.ts` ainda possui 10 marcadores. Solicitados
   nome/razão social, contato de suporte e privacidade, e dados comerciais para
   divulgação. Também confirmar hospedagem e país, SMTP, retenção de backups,
   canal/encarregado de privacidade e tratamento de dados sensíveis. Não publicar
   CPF/endereço pessoal obtidos da conta Apple automaticamente. Os prazos prometidos
   pelos rascunhos precisam corresponder à operação real.
3. **Publicar conformidade.** Seguir `docs/lojas/release-conformidade-20261003.md`:
   backup, migrações 130000 → 133000, functions novas e atualizadas, prazo do Asafe,
   site e conta de revisão. A migração 120000 já está em produção e fica preservada.
   O servidor ainda não tinha as functions `delete-account` e
   `platform-suspend-account`. A navegação real no site retorna página **404** nas
   quatro rotas legais, embora HTTP devolva 200 por fallback da SPA.
4. **Login do iOS.** Google e Apple nativo implementados e distribuídos no build 2;
   Face ID opcional implementado; build 5 reúne Face ID e Google com PKCE. Conferir o teste real
   com os provedores e a biometria no iPhone antes da revisão pública. Não repetir a
   pergunta já respondida sobre quais métodos oferecer.
5. **Push no iOS — desativado no primeiro beta.** O plugin entrega token APNs, mas
   o `send-push` atual envia tokens por FCM. O registro nativo agora executa apenas
   no Android; testes verificam esse comportamento. Implementar APNs para habilitar
   push no iPhone posteriormente. Não anunciar push no iPhone como validado.
6. Confirmar as declarações de criptografia e privacidade a partir do archive real;
   não foi marcado “não coleta dados”. Completar metadados de contato/suporte e
   screenshots reais. Para lançamento público, faltam também categoria,
   classificação etária, disponibilidade e declaração de comerciante da Apple.
7. **Beta interno concluído.** Archives e uploads realizados; builds 1, 2, 5 e 6
   processados e associados ao grupo interno. O build 6 é o candidato atual.
   Após o teste físico e a conclusão das pendências públicas, preparar a release
   completa para revisão da loja.

## Comandos preparados

Acompanhamento neste chat `acompanhar-testflight-do-louvor` encerrado após confirmar
a compilação Em testes e o titular Aceito: status **PAUSED** na automação.
Os comandos a seguir continuam destinados à versão completa de lançamento.
Para reproduzir o primeiro beta interno, ver `testflight-interno-20261006.md`.

Na pasta `MaisLouvor-lojas`, após resolver as pendências:

```sh
npm run ios:prepare
npm run ios:open
npm run ios:archive
npm run ios:upload
```

`ios:archive` refaz a preparação. `ios:upload` usa o archive em
`ios/App/build/MaisLouvor.xcarchive` e exige a conta de distribuição configurada;
não foi executado nesta sessão. Incrementar CURRENT_PROJECT_VERSION antes de novo
upload da mesma versão. Não substituir a preparação por `cap sync` de um dist antigo.

## Referências consultadas

- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/app-store/review/guidelines/
- https://capacitorjs.com/docs/ios/privacy-manifest
- https://developer.apple.com/xcode/resources/
- https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022

Nenhum deploy em produção, alteração de dados, commit, merge ou push foi realizado
nesta sessão. O registro Apple e o grupo TestFlight foram criados externamente.

## Continuação — tester e instalação do Xcode

Após o usuário fornecer o e-mail de destino e autorizar a instalação, o titular
da conta foi adicionado ao grupo **Teste iPhone**. Estado confirmado na interface:
**1 tester e 0 compilações**, com status **Nenhuma compilação disponível**.
A inclusão foi concluída; ainda não existe pacote instalável nem evidência de
convite com compilação enviado.

A App Store ficou parada em Carregando. Foi encerrada normalmente e reaberta na
página oficial do Xcode; acionado Baixar Novamente. A autenticação avançou até o
campo de senha, deixado para preenchimento direto pelo usuário. Não foi fornecida
senha pelo agente. O download e a instalação ainda não foram confirmados.

O registro de push nativo em `src/lib/push.ts` agora executa apenas no Android,
onde o servidor possui entrega por FCM. Isso impede pedir permissão e salvar
tokens APNs no primeiro beta iOS sem um serviço capaz de entregá-los. Push no
iPhone permanece pendente; notificações dentro do app mantêm o comportamento
existente. Typecheck e três testes comportamentais em `src/lib/push.test.ts`
passaram (iOS/web sem registro nativo; Android registra e salva FCM).

O endereço informado pelo usuário destina-se ao TestFlight. Não foi reutilizado
como contato público dos termos ou da política. As demais pendências jurídicas,
de backend e autenticação do app listadas acima continuam abertas.

### Xcode baixado e instalado

Registro histórico da etapa anterior; autenticações e instalação foram concluídas
na continuação descrita abaixo.

Confirmados `/Applications/Xcode.app`, versão **27.0 (27A266a)**, e seleção de
`/Applications/Xcode.app/Contents/Developer`. Restam cerca de 34 GiB livres.
O Xcode foi aberto e a ação Agree da licença foi acionada dentro da instalação
autorizada. O macOS apresentou **Xcode quer fazer alterações**, solicitando a
senha local do Mac. A janela foi deixada para o usuário; a configuração inicial
e a licença ainda não estão efetivadas (`xcodebuild -checkFirstLaunchStatus`
retorna 69). Não confundir com o login da conta Apple, que será necessário para
assinatura. Nenhuma compilação ou upload executado nesta etapa.

### Continuação — instalação concluída e validação nativa

O usuário concluiu a instalação e a autenticação. Confirmados Xcode 27.0, SDK iOS 27,
runtime do simulador disponível e conta vinculada à equipe correta. Criado o
certificado Apple Distribution; provisionamento automático e assinatura Debug
funcionaram. A senha foi preenchida diretamente pelo usuário na interface do macOS.

O primeiro teste nativo encerrou o app por falta do ciclo de vida UIScene. Aplicada
a migração oficial do Capacitor 8.5.2 (SceneDelegate, manifesto, hook no AppDelegate
e pacote Swift atualizado). Após compilação limpa, o app abriu e exibiu o login.
Também foram removidas três imagens de splash padrão sem referência no catálogo.

Logs em `tmp/ios-validation/native-simulator-build.log`,
`tmp/ios-validation/native-signed-build.log` e
`tmp/ios-validation/tests-after-uiscene.log`. Nenhum archive Release, IPA, upload,
deploy, commit, push ou alteração de banco foi executado nesta continuação.

Os 10 marcadores de `src/lib/legal.ts` permanecem e o guard de distribuição continua
bloqueando o pacote. Não reutilizar automaticamente o e-mail do TestFlight como
contato público. Permanecem solicitados os dados do responsável, suporte e privacidade,
as definições operacionais da política e a escolha de login do primeiro beta.

Referências da correção nativa:
- https://capacitorjs.com/docs/updating/8-5
- https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle
