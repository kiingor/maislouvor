# Auditoria de preparação para as lojas

Data: 7 de outubro de 2026, America/Fortaleza.

**Conclusão: o +Louvor ainda não está pronto para a revisão pública.** Há bloqueios
confirmados no pacote atual e riscos que precisam de validação antes do lançamento.
O recebimento da compilação 1.0.0 (6) pelo TestFlight não comprova conformidade de
publicação. Ela foi enviada como **Internal Only**; a Apple não permite usar esse
tipo de compilação para distribuição pública. Será necessário outro build, com a
versão completa integrada. [Apple — builds internos](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/).

## Escopo e evidência

- Código de `MaisLouvor-lojas`, branch `feat/conformidade-lojas`, base `2ae6be8`,
  incluindo as alterações locais de autenticação e layout.
- Fonte congelada e archive efetivamente enviados: `tmp/ios-internal-testflight-6`.
- Integração RevenueCat no checkout `MaisLouvor`, consultada somente em leitura.
  Esse trabalho está separado do beta e pode continuar mudando em outra sessão.
- Navegação real, sem autenticação, nas quatro páginas legais públicas e no login.
- Regras oficiais da Apple e do Google consultadas nesta data.
- A tela inicial do TestFlight mostrava a compilação 6 Em testes. Ao abrir a área
  Distribuição, a sessão Apple expirou; os formulários de publicação não puderam
  ser revalidados. Pendências desses formulários abaixo vêm dos registros locais,
  não de uma nova confirmação no painel. Play Console não foi acessado.

Nenhuma compra, exclusão de conta real, migração, moderação, publicação ou mudança
de configuração de produção foi executada. As verificações não incluem um teste
completo autenticado em dispositivos físicos nem um AAB final do Google Play.

## Achados prioritários

### 1. Privacidade, termos, suporte e exclusão pública ainda retornam uma página 404

**P1 — bloqueio confirmado para lançamento. Apple e Google.**

`/privacidade`, `/termos`, `/suporte` e `/excluir-conta` exibiram `404 / Oops! Page
not found`. O servidor responde HTTP 200 por fallback da aplicação; testar somente
o status HTTP daria um falso resultado positivo. Evidência reproduzível em
`tmp/store-audit-20261007/public-routes.json` e `public-privacy.png`.

Além disso, `src/lib/legal.ts:32–54` tem dez valores `PREENCHER`. O verificador
`scripts/check-legal-placeholders.mjs` recusou corretamente a preparação pública.
O beta não inclui o grupo Sobre nem os links legais do login; o gerador remove
explicitamente esse rodapé (`scripts/ios-internal-testflight.mjs:91–94`).

**Correção:** concluir os textos e contatos reais, publicar as rotas, incorporar os
acessos dentro do app e testar os links no navegador anônimo e no pacote assinado.
Os dez campos são pendências do modelo local; isso não significa que todo campo,
como CPF ou endereço pessoal, deva ser publicado sem avaliar a necessidade.

As lojas exigem política acessível e coerente com a coleta de dados.
[Apple 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#privacy),
[Google — dados do usuário](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en).

### 2. Exclusão de conta ausente no beta e incompleta para o novo login Apple

**P1 — bloqueio confirmado no beta; correções também necessárias na versão completa.**

O snapshot 6 oferece cadastro, mas seu `src/pages/TeamSettings.tsx` não contém
`DeleteAccountSection`. A versão completa contém a tela em
`src/components/account/DeleteAccountSection.tsx`, RPCs e a função `delete-account`,
mas essas partes ficaram fora do pacote enviado. O último registro de deploy
também mantém sua publicação pendente; o backend não foi rechecado nesta auditoria.

Há uma lacuna nova após adicionar Apple: `ios/App/App/AppleSignInPlugin.swift:57–72`
devolve somente identity token, nonce e nome, sem fluxo para guardar uma credencial
revogável. `supabase/functions/delete-account/index.ts:69–81` remove os dados e o
usuário Supabase, mas não revoga a autorização Apple. Não foi encontrado outro
fluxo de revogação no código do app/servidor analisado.

**Correção:** integrar e publicar a exclusão completa, implementar revogação Apple
com o servidor e testar cadastro → exclusão → novo cadastro com uma conta de teste.
Verificar também limpeza da sessão protegida por Face ID e retenção realmente
necessária. A tela já avisa que assinaturas devem ser canceladas na loja; ao integrar
RevenueCat, oferecer o gerenciamento da origem e revalidar exclusão com cobrança ativa.

A Apple exige exclusão dentro do app e revogação dos tokens de Sign in with Apple.
O Google pede também um caminho externo. [Apple — exclusão](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion),
[Google — exclusão](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en).

**P2 adicional:** o caso `support_required` impede excluir a conta de um dono que
perdeu a liderança e cuja equipe não tem outro líder. O SQL bloqueia a operação
(`20261003130000_account_deletion.sql:322–352`), e a UI só oferece suporte
(`DeleteAccountSection.tsx:233–236`). Projetar uma saída segura dentro do app ou
um pedido de exclusão processável, sem exigir uma conversa de suporte para começar.
A Apple restringe esse tipo de obstáculo em apps que não são de setores regulados.

### 3. Chat do TestFlight sem denúncia, bloqueio e moderação da versão completa

**P1 — bloqueio confirmado no pacote atual. Apple e Google.**

O `src/pages/Chat.tsx` congelado no build 6 não usa `useChatModeration`; os controles
e a infraestrutura preparados em `20261003132000_chat_moderation.sql` não fazem
parte dessa entrega. Na versão completa local, há denúncia, bloqueio, filtro,
análise por líderes e suspensão pela plataforma.

**Correção:** integrar UI e backend de moderação e testar denúncia por membro,
denúncia contra líder, bloqueio, remoção e resposta da plataforma. Definir quem
atende e comprovar a operação. O prazo de **24 horas** é uma promessa do projeto,
não um prazo universal imposto pela Apple.

Revisar também a cobertura das músicas, letras, imagens e áudios compartilhados:
o fluxo preparado `src/lib/chatModeration.ts:143` recebe `messageId`; não há um
fluxo equivalente identificado para denunciar um item do catálogo musical.

As políticas cobrem conteúdo criado por usuários, inclusive em comunidades
restritas. [Apple 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content),
[Google — conteúdo de usuários](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

### 4. Compartilhamento com IA precisa de consentimento efetivo e cobertura completa

**P1 — ausência confirmada no beta; risco remanescente no desenho da versão completa.**

O snapshot 6 não inclui `AssistantConsentGate`. O Asafe continua disponível na base
do produto, enquanto os avisos e RPCs de consentimento pertencem à integração ainda
não distribuída. Na versão completa, a migração
`20261003133000_assistant_ai_consent.sql:119–132,193–238` permite uma tolerância
inicial de 30 dias para equipes e membros antigos. O handler só bloqueia o estado
`blocked` (`supabase/functions/whatsapp-assistant/handler.ts:504–510`); `pending`
continua respondendo. Essa tolerância, por si só, não demonstra permissão explícita
prévia para enviar os dados pessoais à IA.

Também há outros fluxos: `AddCultoSongModal.tsx:152–164` manda liturgia, catálogo e
letras para sugestões; `SongEditor.tsx:763` envia o texto colado do Moises. O backend
usa um gateway configurável e outro modelo, além da OpenAI usada pelo Asafe. A
política genérica e o consentimento específico do Asafe não cobrem automaticamente
todo texto pessoal eventualmente informado nesses fluxos.

**Correção:** mapear os operadores reais, os dados enviados por recurso e obter
consentimento antes do envio de dados pessoais, inclusive para usuários antigos.
Minimizar conteúdo, permitir recusa e aplicar a decisão no servidor.
[Apple 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing).

**Validação adicional para Google:** sugestões geradas exibem justificativas em
`AddCultoSongModal.tsx:448`, sem ação específica para reportá-las. Avaliar o
enquadramento desses recursos e do Asafe na política de IA generativa; nos fluxos
abrangidos, disponibilizar denúncia de resposta ofensiva e tratamento operacional.
[Google — conteúdo gerado por IA](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en).

### 5. Preferência do Face ID usa API sem manifesto de privacidade do app

**P1 — lacuna técnica confirmada no archive iOS.**

`BiometricSessionPlugin.swift:22,91,138` lê e grava `UserDefaults.standard`. O archive
6 não contém `PrivacyInfo.xcprivacy` na raiz de `App.app`. Só foram encontrados os
manifestos de Capacitor e Cordova, ambos com `NSPrivacyAccessedAPITypes` vazio.
Evidência: `tmp/store-audit-20261007/privacy-manifests.json`.

**Correção:** incluir o manifesto como recurso do target, declarar o uso de
UserDefaults e o motivo aplicável — `CA92.1` corresponde à preferência acessível
somente pelo próprio app — e inspecionar o próximo archive. Revisar novamente os
SDKs após integrar compras. Não inventar declarações de coleta ou rastreamento.

É uma pendência documental da API, não evidência de vazamento biométrico. O envio
interno anterior foi aceito; não houve rejeição Apple observada por esse motivo.
[Apple — APIs com motivo obrigatório](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api),
[motivos para UserDefaults](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).

### 6. Assinaturas ainda precisam entrar no pacote e ser homologadas

**P1 se a primeira versão pública oferecer planos pagos.**

O código RevenueCat está no checkout principal; não está na compilação 6. O registro
`MaisLouvor/docs/revenuecat.md` confirma catálogo Apple criado, mas produtos ainda
com `MISSING_METADATA`, migração/seed/backend pendentes e nenhuma compra sandbox
real validada. Google/Web ainda dependem de configuração própria. Esse estado dos
serviços não foi reconsultado no painel nesta auditoria.

O código escolhe SDK nativo no iOS/Android e não oferece fallback de checkout web,
o que é adequado. Há restauração e gerenciamento. Entretanto, `PlanBuilder.tsx`
e `TeamBilling.tsx` não incluem links de termos e privacidade no fluxo de oferta;
é necessário integrá-los à camada legal funcional.

**Correção:** unir os trabalhos, finalizar metadados e testar compra, restauração,
ampliação, renovação, cancelamento, expiração e reembolso no sandbox real, com
confirmação no backend. Preços/períodos exibidos devem vir da loja, como já preparado.
Atualizar as declarações de privacidade para RevenueCat e histórico de compras.

Uma primeira versão realmente gratuita não depende de vender assinaturas; nesse
caso, a ficha e a experiência devem refletir o que está disponível. Para recursos
digitais pagos, seguir as regras da loja e as condições aplicáveis ao território.
[Apple — assinaturas](https://developer.apple.com/app-store/subscriptions/),
[Google — pagamentos](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

### 7. Remover a importação do YouTube não comprova os direitos do acervo

**Risco alto, condicionado à procedência e às licenças do conteúdo.**

O bloqueio de importação no build das lojas existe e o bundle 6 não contém a chamada
`import-youtube`. Porém, `useSongAudioAttachments.ts:9–12` consulta anexos sem filtro
de origem. `SongAudioAttachments.tsx:170–190` ainda permite ouvir os anexos importados
e muda o rótulo de YouTube para Importado no build de loja. `Presentation.tsx:1206`
reproduz o `audio_path` disponível. Material que entrou pelo site pode, portanto,
continuar acessível no iPhone.

Isso não demonstra que uma gravação específica viole direitos. **Falta verificar a
autorização para armazenar, reproduzir, compartilhar e processar o acervo**, incluindo
faixas separadas, letras, cifras e capas. Atribuir o envio ao usuário ou renomear a
origem não substitui essa autorização.

**Correção:** registrar procedência/licenças, disponibilizar denúncia e retirada e
impedir disponibilização de material sem autorização aplicável. Manter separação
de faixas com material próprio ou licenciado. A demo já tem conteúdo original e uma
licença CC BY documentada, mas isso não resolve todo o acervo.
[Apple 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property),
[Google — propriedade intelectual](https://support.google.com/googleplay/android-developer/answer/9888072?hl=en).

### 8. Gravação de áudio Android sem as permissões necessárias declaradas

**P2 — defeito de configuração confirmado; efeito em aparelho ainda não reproduzido.**

`ChatAudioRecorder.tsx:74` chama `getUserMedia({audio:true})`. O manifesto do app
Android declara somente INTERNET; os manifestos locais das dependências também não
declaram RECORD_AUDIO nem MODIFY_AUDIO_SETTINGS. A ponte instalada do Capacitor
solicita ambas ao receber AUDIO_CAPTURE (`BridgeWebChromeClient.java:107–110`).

**Correção:** declarar as permissões pertinentes, manter a solicitação contextual e
testar permitir/recusar/gravar/enviar no Android real. Conferir o manifesto mesclado
do AAB final; não foi produzido um AAB nesta auditoria.
[Android — gravação e permissão](https://developer.android.com/media/platform/mediarecorder).

## Pendências de submissão e testes finais

- **App Privacy e Data Safety:** reconciliar conta, contato, foto, mensagens, áudio,
  arquivos, equipes, escalas, push, dados enviados à IA e futuras compras com a
  coleta real. Avaliar informações que revelem religião. Face ID não significa
  que o app receba o mapa biométrico. A conclusão não é “não coleta dados”.
- **Metadados:** segundo os registros locais, faltam screenshots de uso real,
  classificação etária, categoria e outras declarações da release pública.
  Revalidar no painel após autenticar; não marcar como concluído por este relatório.
- **Conta de revisão:** há seed e notas preparados, mas não foi validado um login
  de revisão ativo nesta auditoria. O seed suspende Asafe para a demo; se o recurso
  for oferecido na versão pública, fornecer um caminho claro para o revisor avaliar
  seu funcionamento e consentimento, inclusive os recursos pagos.
- **iPad:** o target anuncia iPhone e iPad (`TARGETED_DEVICE_FAMILY = "1,2"`).
  Validar login, teclado, rotação, ensaio/mixer e diálogos também no iPad, em tela
  pequena, com fonte maior, sem rede e após retornar do segundo plano.
- **Push:** continua desativado no iOS por incompatibilidade entre APNs e o envio
  atual via FCM. Não anunciar entrega de push no iPhone como recurso validado.
- **Android:** target 36 já está alinhado à exigência oficial atual. Restam AAB
  assinado, Play App Signing, versionCode, bibliotecas nativas/16 KB e relatório de
  pré-lançamento. A compatibilidade de 16 KB depende do pacote final.
  [Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN),
  [páginas de memória](https://developer.android.com/guide/practices/page-sizes).
- **Acesso à produção Google:** se a conta for pessoal criada após 13/11/2023,
  conferir o requisito de teste fechado com 12 testers por 14 dias contínuos.
  O tipo e o estado da conta não foram verificados.
  [Google — testes para contas pessoais](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## O que passou e o que isso demonstra

- **360 testes em 41 arquivos**, executados nesta auditoria: passaram.
- **TypeScript:** passou no checkout de lojas.
- **Verificador jurídico:** encontrou os dez campos pendentes, como esperado.
- **Navegação pública:** cinco rotas verificadas; login funciona, quatro rotas
  legais exibem 404, sem erro JavaScript observado.
- **Archive 6:** inspecionados fonte, recursos de privacidade e opção Internal Only.
- Na entrega anterior, houve archive assinado, validação de 39 cenários de UI e
  abertura no simulador iPhone 17 Pro Max. Esses resultados são históricos, não
  uma nova aprovação funcional completa de ensaio, chat, compras e exclusão.

Não foi reproduzido um crash novo nesta varredura. Os principais riscos confirmados
são de conformidade e integração; testes automatizados aprovados não os eliminam.
Não há evidência de rejeição ou remoção atual pela Apple/Google.

## Ordem sugerida para preparar a versão pública

1. Concluir dados legais e publicar páginas; integrar exclusão, moderação e
   consentimento com o backend, incluindo os ajustes de Apple e da tolerância da IA.
2. Corrigir manifesto iOS e permissões Android; auditar os direitos do acervo.
3. Integrar/homologar compras se incluídas no lançamento; atualizar privacidade,
   oferta e notas de revisão conforme o produto final.
4. Gerar uma nova compilação elegível para App Store e um AAB de loja, executar
   os fluxos completos em aparelhos e completar os formulários com evidências reais.

Relatório somente de auditoria: nenhum código de produto foi alterado para corrigir
os achados e nenhuma submissão às lojas foi feita nesta etapa.


## Atualização de implementação — 07/10/2026

As correções autorizadas, exceto assinaturas (outra branch), foram implementadas localmente e validadas. Ver [correções, testes e ordem de implantação](correcoes-conformidade-20261007.md). Este relatório continua sendo o retrato da auditoria do build 6 e das páginas públicas naquele momento; implementar localmente não altera esse build nem confirma publicação. Direitos sobre o acervo e dados jurídicos/configurações reais permanecem pendentes.
