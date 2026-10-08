# Primeiro beta interno do +Louvor

> Registro histórico do build 1. Google/Apple e Face ID foram acrescentados nos builds
> seguintes; ver [autenticação](testflight-autenticacao-20261006.md). Os comandos abaixo
> retratam o preparo original; o script atual usa snapshots separados por número.

## Escopo

Versão 1.0.0, build 1, bundle `com.maislouvor.app`, App Store Connect 6819834048.
Destino: grupo interno **Teste iPhone**, que já contém o titular da conta.

Após o pedido explícito de concluir até o TestFlight, foi preparado um snapshot
da base `016eed98cedc5cfbd6bb5f5ecdbed6fe9b0eed28`. Essa base está documentada como
compatível com o backend existente e inclui o cadastro de músicas aprovado.
A integração de conformidade 2ae6be8 depende de migrações e de dados jurídicos
ausentes; por isso não compõe este primeiro teste interno.

A opção Apple `testFlightInternalTestingOnly=true` impede distribuir esse pacote
em grupos externos ou na App Store. Os comandos normais de release continuam com
a verificação dos dados jurídicos. Nenhum marcador foi preenchido com suposição.
Não houve alteração do servidor, banco, site público ou Android.

## Diferenças em relação à base

- Projeto iOS preparado nesta sessão: Capacitor 8.5.2, UIScene, ícones, permissões,
  assinatura automática da equipe correta e nome +Louvor.
- Importação de áudio do YouTube desabilitada na compilação (`VITE_STORE_BUILD=1`),
  com os mesmos componentes e testes da branch de conformidade.
- Push nativo restrito ao Android; no iPhone permanece pendente implementar APNs.
- Primeiro beta com e-mail/senha; botão Google removido apenas do snapshot interno.
  Recuperação de senha abre a URL pública de redefinição.
- Correções de tipos já validadas para messages.channel_id, songs.duration_seconds,
  team_join_requests, consulta do chat e reordenação do roteiro.
- `ITSAppUsesNonExemptEncryption=false`: foram encontrados HTTPS/WebKit,
  autenticação e funções criptográficas do sistema, sem criptografia própria de
  conteúdo. Referência Apple abaixo. Não significa ausência de proteção HTTPS.

## Preparação reproduzível

O script cria uma cópia ignorada em `tmp/ios-internal-testflight/source`, preserva
os fontes normais e bloqueia um segundo preparo por cima da cópia. Só parâmetros
públicos VITE_SUPABASE_* da configuração local entram no build; não registrar
valores nem credenciais em documentação.

```sh
node scripts/ios-internal-testflight.mjs prepare
node scripts/ios-internal-testflight.mjs archive
node scripts/ios-internal-testflight.mjs upload
```

`validate` repete a checagem do snapshot, testes, build e sincronização após uma
correção local. `upload` verifica a opção de restrição a teste interno. Antes do
archive, o bundle é verificado contra marcadores legais, import-youtube e RPCs de
aceite ainda ausentes do servidor. Não usar o snapshot para release pública.

## Verificações desta compilação

- Typecheck passou; quatro arquivos e 44 testes passaram (push e importação de áudio).
- Build web em modo loja e sincronização Capacitor passaram.
- Archive Release para dispositivo: **ARCHIVE SUCCEEDED**; codesign deep/strict passou.
- Versão/build/bundle conferidos no Info.plist do archive; manifests de privacidade
  do Capacitor e Cordova presentes.
- Build Release do simulador passou; app iniciou e mostrou login com e-mail/senha.
- Endpoint público de configurações da autenticação respondeu 200, e-mail habilitado
  e CORS compatível com a origem nativa. Não foi feito login nem modificado dado real.
- Captura: `tmp/ios-validation/iphone-internal-beta-1.png`.
- Logs: `tmp/ios-validation/internal-{prepare,archive,simulator-build,upload}.log`.

## Estado do envio

Autorização da chave Apple Distribution concluída pelo titular. A primeira
exportação avançou até o upload, mas terminou com `EXPORT FAILED` / código 70:
“Couldn’t communicate with a helper application”. Não confirmou recebimento.

Na retomada, iniciada nova exportação do mesmo archive já validado. A nova tentativa
passou pela assinatura sem solicitar outra senha e enviou a análise do pacote ao
App Store Connect. Log separado: `tmp/ios-validation/internal-upload-retry.log`.
**Upload concluído:** `Uploading “App.ipa” is complete`, `Uploaded package is
processing`, `Upload succeeded` e **EXPORT SUCCEEDED** confirmados.

**Disponível no TestFlight:** processamento encerrado, compilação marcada como
**Pronto para testar** e **Internos**. Adicionada ao grupo **Teste iPhone**; após
recarregar a interface, confirmados **1 tester e 1 compilação**, **1.0.0 (1) Em testes**
e titular **Aceito**. A Apple mostra expiração em 90 dias. Não houve publicação na
App Store nem convite a terceiros. Instalação/sessão no iPhone ainda não observada.

Evidências locais: `tmp/ios-validation/testflight-1.0.0-1-em-testes.png` e
`tmp/ios-validation/testflight-tester-aceito.png`. Acompanhamento automático
`acompanhar-testflight-do-louvor` encerrado com status PAUSED após confirmar o acesso.

Para instalar: abrir TestFlight no iPhone com a conta Apple cadastrada como tester,
selecionar +Louvor e tocar em Instalar. Se necessário, abrir o convite recebido no
e-mail indicado pelo titular. Dentro do app, usar o e-mail e senha habituais do
+Louvor; a conta Apple do TestFlight não substitui a conta do aplicativo.

## Texto de teste preparado

Primeiro teste interno do +Louvor no iPhone. Entre com seu e-mail e senha habituais.
Confira a navegação, repertórios, músicas, cifras, reprodução de áudio e chat.
O app usa a mesma conta e os mesmos dados do site. Neste beta, login Google/Apple
e notificações push do iPhone ainda não estão disponíveis. Envie falhas e capturas
pelo TestFlight.

## Referências

- https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers
- https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption
