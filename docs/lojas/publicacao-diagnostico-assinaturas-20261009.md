# Publicação do diagnóstico de assinaturas — 09/10/2026

A versão web foi alinhada ao código revisado de diagnóstico do cliente nativo,
commit **`26013cc63ee49b786843f863270864d9768615db`**. A publicação foi concluída
em **08/10/2026 às 22:20:27 de Brasília** (09/10/2026, 01:20:27 UTC), release
`20261009-billing-diagnostics-v2`.

## Mudança e limite

As falhas nativas de contexto, configuração do SDK, ofertas e consulta de
compras recebem mensagens fixas e códigos de suporte permitidos. Não são
expostos identificadores de clientes, chaves, mensagens brutas ou `userInfo`
do SDK. O diagnóstico da loja tem prazo limitado e não bloqueia países. Não
foi acrescentada telemetria. A proteção contra nova compra também considera
assinaturas ativas sem entitlement.

Mensagens já existentes de preço, capacidade e regras de compra foram
preservadas. A web mantém seu fluxo de assinaturas; a mudança não altera
produtos, preços, contratos, contas ou permissões no provedor. Esta publicação
**não comprova resolução da disponibilidade das ofertas Apple**. A validação do
novo diagnóstico no iPhone e o envio do build iOS 9 são coordenados separadamente.

## Gates e fonte

- Preparação em worktree gerenciado isolado, com o commit exato revisado e
  saída de build/pacote no NVMe. O checkout compartilhado e seu `.env`
  preexistente não foram alterados.
- O pacote anterior, de `dd0ac62`, foi retido antes de qualquer upload ou
  alteração no servidor, para incluir o diagnóstico da falha anterior ao SDK.
- 54 testes direcionados e TypeScript aprovados na revisão. Na primeira rodada
  completa, um teste de `Presentation.test.tsx` excedeu cinco segundos durante
  compilações concorrentes. A aplicação ficou suspensa. O arquivo passou
  isoladamente (12/12), e a suíte completa final passou com **61 arquivos e
  525 testes**, sem alterar código ou limites de tempo dos testes.
- Build normal `npm run build` e trava legal aprovados. O pacote contém apenas
  a saída pública do app; documentos internos e relatórios pessoais não foram
  incluídos no payload publicado.
- Login local do pacote final conferido no Chrome via CUA em 440 × 956: três
  slides, sem rolagem e sem erros no console.

## Publicação verificada

O pipeline existente manteve as verificações de concorrência e hashes, lock
compartilhado, backup de arquivos substituídos, atualização do service worker
por último e reversão automática em caso de falha. Não houve falha no apply nem
necessidade de reversão.

- 223 arquivos conferidos no servidor, 140 assets/shell por HTTPS e sete rotas
  principais aprovadas.
- 59 arquivos protegidos de marketing/Caddy preservados, além de APKs e assets
  anteriores. O `landing-sw.js` permaneceu idêntico e o service worker gerado
  manteve `/baixar` fora do fallback da aplicação.
- Novo `index.html`:
  `87a5f5ae9d7913da4f28da99daeed5515f3cb35f5d637cd6a4b4901dade5710f`.
- Asset principal do pacote: `index-5PAlF4oM.js`.
- Resultado privado remoto:
  `/var/lib/maislouvor-deploy/20261009-billing-diagnostics-v2/result.json`.

Após a instalação do service worker e recarga normal, o Chrome recebeu o asset
final `index-5PAlF4oM.js` no domínio público. O login manteve os três slides e
440 × 956 sem rolagem, sem erros no console. Não foi necessário limpar dados do
navegador. Captura pública sem dados de conta em
`screenshots/billing-diagnostics-web-20261009/login-publicado.jpg`. Essa captura
comprova o login preservado, não uma compra ou o diagnóstico no iPhone.

O preflight anterior confirmou Auth, banco, Edge, Kong e REST saudáveis, health
de autenticação HTTP 200 e páginas públicas HTTP 200. Não foram consultadas
contas nem invocada a RPC de billing que pode criar mapeamento de cliente.

## Evidências e recuperação

Pacote, hash, manifestos, resultados e logs preservados e conferidos em
`/Volumes/Extreme SSD/MaisLouvor/Releases/Web/20261009-billing-diagnostics-v2/`.
O diretório também mantém a evidência de retenção do primeiro pacote, que não
foi enviado. A área de trabalho do build fica no volume APFS externo
`/Volumes/MaisLouvorBuild/Web-Releases/20261009-billing-diagnostics-v2/`.

SHA-256 do pacote:
`d4a5cfdbbde9f6b13ddda4db2f79fa6ba435a30d4b578285fdc67daa1fd896a0`.

Reversão: `python3 scripts/lojas/publish-integrated-web.py rollback --release
20261009-billing-diagnostics-v2`, somente enquanto essa release continuar
ativa. A proteção recusa sobrescrever mudanças posteriores e não reverte banco,
marketing ou configurações de outros serviços.
