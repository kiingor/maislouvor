# Login social e Face ID no TestFlight

> Continuação: a [compilação 6](testflight-login-20261006.md) preserva esta
> autenticação e acrescenta o login redesenhado. Está Em testes; grupo agora com
> 1 tester e 4 compilações. O App Store Connect confirmou a instalação da 5 no
> iPhone 17 Pro Max. Os detalhes abaixo registram a entrega de autenticação.

## Distribuição

- App Store Connect: +Louvor, `6819834048`, bundle `com.maislouvor.app`.
- 1.0.0 (2): upload concluído, processamento concluído e grupo **Teste iPhone** associado; interface confirmou **Em testes**.
- 1.0.0 (3): acrescentou Face ID; upload aceito, mantida sem grupo de teste enquanto o retorno Google foi reforçado.
- 1.0.0 (4): acrescentou PKCE; upload aceito, sem grupo.
- 1.0.0 (5): pacote final com Google/PKCE, Apple e Face ID; corrige também a repetição do callback após desbloquear. Upload concluído em 06/10/2026 às 22:46 (America/Fortaleza); processamento concluído e grupo **Teste iPhone** associado. Interface confirmou **Em testes**, com um tester e validade exibida de 90 dias.
- Todas essas compilações são **somente internas**. Não houve envio para revisão pública.
- Grupo confirmado com **1 tester e 3 compilações** (1, 2 e 5); distribuição automática continua desativada. Builds 3/4 permanecem sem grupo. Não foram reenviados convites.
- Instruções de teste em português salvas no build 5. Captura da disponibilidade: `tmp/ios-validation/build5-testflight-em-testes.png`. O tester já havia instalado o build 1; a instalação do build 5 ainda depende de atualizar pelo TestFlight.

## Implementação

Google foi reativado no snapshot interno. O navegador do sistema retorna pelo
esquema `com.maislouvor.app://auth/callback`. O tratamento agora exige URL exata,
troca um código de autorização com **PKCE** antes de navegar, contempla abertura a
frio, ignora entregas duplicadas, inclusive após desmontar/remontar as rotas no bloqueio Face ID, e apresenta erro sem liberar a conta. Tokens
bearer arbitrários recebidos no deep link são rejeitados. O cliente OAuth separado
persiste somente o verificador; a sessão vai para o armazenamento principal
protegido por Face ID quando habilitado. Mantido o fluxo existente de
e-mail/senha e redefinição de senha pela página pública.

Apple usa AuthenticationServices nativo, com nonce aleatório e SHA-256, validação
de state e troca do ID token no Supabase. O botão aparece somente no app iOS,
inclusive no cadastro. Nome recebido na primeira autorização é salvo sem substituir
nome personalizado existente. A capability Sign in with Apple foi habilitada pelo
provisionamento automático; conferida no portal Apple e no perfil do archive.

Face ID é oferecido após o primeiro login por conta/aparelho. **Agora não** evita
repetir a pergunta; **Ajustes > Segurança** permite alterar a escolha. Quando
ativado, a sessão sai do localStorage e fica no Keychain, com
`kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` e `biometryCurrentSet`.
O app não guarda a senha nem recebe dados biométricos. Alterar o cadastro biométrico
ou remover o código do aparelho invalida o acesso protegido. O fallback exige
login normal, depois de apagar a credencial anterior. Sair da conta também remove
a sessão protegida.

O app bloqueia o conteúdo ao voltar do segundo plano e ao iniciar com Face ID
ativo. Cancelar a biometria ou falhar a recuperação da sessão mantém o bloqueio.
O contexto autorizado fica apenas em memória durante o uso e é invalidado no
segundo plano, inclusive pelo SceneDelegate nativo. Logs de payloads da ponte
Capacitor estão desabilitados para não registrar credenciais.

## Servidor

GoTrue existente: `supabase/gotrue:v2.189.0`, em `/opt/supabase`.
Google e o retorno nativo já estavam configurados. Foi acrescentado somente:

```yaml
GOTRUE_EXTERNAL_APPLE_ENABLED: "true"
GOTRUE_EXTERNAL_APPLE_CLIENT_ID: "com.maislouvor.app"
GOTRUE_EXTERNAL_APPLE_SKIP_NONCE_CHECK: "false"
```

Backup local no servidor: `docker-compose.yml.before-apple-native-20261007T012009Z`,
modo 0600. Configurações resolvidas antes/depois foram comparadas: só as três
variáveis acima mudaram. Apenas o serviço `auth` foi recriado, mantendo a imagem.
Endpoint público de settings retornou HTTP 200 com Google, Apple e e-mail ativos.
Início real do OAuth Google retornou HTTP 302 para `accounts.google.com`, com o
callback público correto. Verificação adicional com PKCE/S256 também retornou
302 para o Google, com verificador armazenado e desafio presente. Não foi gerado
segredo Apple de OAuth web: o fluxo
implementado é nativo com ID token. Banco, site público e Android não foram publicados.

## Validação realizada

- Typecheck do projeto e do snapshot; ESLint dos módulos de autenticação; diff sem erros de espaço.
- Mais 12 testes do conteúdo legal passaram após a descrição factual do Face ID.
- Snapshot build 5: **91 testes**, dez arquivos, incluindo callback, Apple/Google,
  plataforma, cancelamento, falhas, armazenamento protegido, opt-in, sessão inválida
  e retorno do segundo plano.
- Archive Release assinado para iOS e build Debug do simulador concluídos.
- Abertura no simulador iPhone 18 Pro/iOS 27; login renderizado com Google e Apple.
- Archive final contém `NSFaceIDUsageDescription`, versão 1.0.0 (5), entitlement Apple
  e `loggingBehavior: none`.
- Login real com Google/Apple e reconhecimento facial físico precisam do teste no
  iPhone do titular; não foram simulados como sucesso.

## Fontes e reprodução

Mantida a base interna `016eed98cedc5cfbd6bb5f5ecdbed6fe9b0eed28`, compatível com o
backend, com overlays explícitos. A preparação normal da release pública ainda
bloqueia os dez marcadores jurídicos. Nenhuma migração de conformidade foi aplicada.
Os rascunhos locais de privacidade e termos receberam as descrições factuais de
Apple e Face ID; não foram publicados. Validar o remetente do Private Email Relay
antes de depender de mensagens para endereços privados da Apple.

```sh
IOS_BUILD_NUMBER=5 node scripts/ios-internal-testflight.mjs prepare
IOS_BUILD_NUMBER=5 node scripts/ios-internal-testflight.mjs archive
IOS_BUILD_NUMBER=5 node scripts/ios-internal-testflight.mjs upload
```

Manifestos de overlays e hashes nativos do build 5 foram preservados.
Os snapshots existentes não são sobrescritos. Build 1 permanece em
`tmp/ios-internal-testflight`; builds seguintes em `tmp/ios-internal-testflight-N`.
Logs e capturas ficam em `tmp/ios-validation/build2-*` e `build3-*`, `build4-*` e `build5-*`.
Para um novo envio, usar outro número. Não repetir upload de um build já recebido.

Referências: [Supabase Apple nativo](https://supabase.com/docs/guides/auth/social-login/auth-apple),
[Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[Capacitor: plugin local](https://capacitorjs.com/docs/ios/custom-code),
[Apple: Keychain com biometria](https://developer.apple.com/documentation/localauthentication/accessing-keychain-items-with-face-id-or-touch-id).
