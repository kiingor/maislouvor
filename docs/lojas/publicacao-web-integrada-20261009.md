# Publicação web integrada — 09/10/2026

Filipe confirmou que o login aprovado já aparece no TestFlight, mas a web ainda
mostra o formulário antigo, e autorizou publicar a versão integrada. A fonte é
`MaisLouvor-lojas`, branch `codex/integracao-lojas-revenuecat`. A cópia `main`
possui trabalho paralelo e não é usada como base desta publicação.

## Estado da preparação

Preparado `scripts/lojas/publish-integrated-web.py`, independente dos scripts
pontuais antigos de RevenueCat. A preparação não publica. A publicação só pode
seguir após a coordenação do backend de consentimento e o commit final do app.
Este registro sozinho não comprova publicação: o resultado real é salvo em
`result.json` local e no diretório privado da release na VPS.

Base observada no servidor durante a preparação:

- `index.html`: `7427ea557d277eab893a7fccaf6ff8eb21bd8a89ae260e55b6af9337f223293e`.
- `sw.js`: `48806cfddd2a8c55f6cd17f98025ab3d1a66321f33dc4269f9a2d658cb33757f`.
- `landing-sw.js`: `b444eb8742f125aa79f4cbc52126f6d5dc5fbbeb85f7971ddb6a2f48b41a4b88`.

O script consulta novamente a base em cada preparação. Não reutiliza esses
hashes como permissão permanente para substituir uma versão posterior.

## Sequência operacional

No checkout integrado, com as mudanças do aplicativo revisadas e commitadas:

```sh
python3 scripts/lojas/publish-integrated-web.py inspect
python3 -m unittest discover -s scripts/lojas -p test_publish_integrated_web.py -v
python3 scripts/lojas/publish-integrated-web.py prepare \
  --release 20261009-web-integrada \
  --expect-commit SHA_COMPLETO_DO_COMMIT_REVISADO
```

`prepare` executa `npm run build` com a trava legal normal, define build web
(sem `VITE_STORE_BUILD=1`), exige o commit esperado e a ausência de alterações
pendentes no código/configuração do aplicativo. O `.env` preexistente não é
alterado, impresso ou incluído no pacote. O destino separado
`tmp/web-releases/<release>/dist` evita substituir o `dist` do trabalho iOS.

Antes da próxima operação: backend de consentimento/convites compatível
publicado e conferido pelo coordenador; checagens do aplicativo aprovadas; login
e páginas legais conferidos no pacote preparado. Só então:

```sh
python3 scripts/lojas/publish-integrated-web.py apply \
  --release 20261009-web-integrada
```

Se a produção ou o commit mudar entre a preparação e a aplicação, o processo
para. Faça nova inspeção e preparação com outro identificador; não remova as
travas e não reutilize uma tentativa antiga. O script não executa migrações,
não altera SMTP, billing, Caddy ou infraestrutura.

Exceção explícita para commits posteriores exclusivamente de backend/scripts/
documentação: `apply --allow-source-identical-descendant` aceita o mesmo pacote
somente se o HEAD descender do commit preparado e o diff de todas as fontes e
configurações de build do aplicativo estiver vazio. Alterações não commitadas
nessas fontes continuam bloqueadas. Isso evita rebuild sem mudar o pacote
revisado; o resultado local registra também o commit conferido no checkout.

## Preservação e reversão

- Snapshot dos hashes de todos os arquivos do app, da árvore separada de
  marketing e do Caddy; a raiz pública, `/conheca/` e `/robots.txt` também são
  conferidos por HTTPS.
- Lock compartilhado `/var/lock/maislouvor-deploy.lock`.
- Nenhum APK incluído no pacote; os downloads existentes são preservados.
- Backup privado de todos os arquivos que serão sobrescritos, antes da primeira
  troca. Assets antigos nunca são apagados. O service worker da landing deve
  permanecer idêntico.
- Cópia atômica de dependências primeiro, shell depois e `sw.js` por último.
- Hashes de todos os arquivos conferidos no servidor; rotas principais e assets
  do app conferidos por HTTPS. Falha provoca reversão automática dos arquivos
  substituídos. Assets novos com hash podem permanecer, sem substituir os antigos.
- Pacote e evidências em `/var/lib/maislouvor-deploy/<release>`, com acesso privado.

Reversão posterior, somente se os arquivos dessa release ainda forem os ativos:

```sh
python3 scripts/lojas/publish-integrated-web.py rollback \
  --release 20261009-web-integrada
```

A reversão restaura o frontend anterior e verifica `/login` por HTTPS. Ela não
reverte migrações nem remove registros de consentimento, direitos ou assinaturas.
Antes de reverter, coordenar a compatibilidade com o backend ativo. Qualquer
alteração posterior no site interrompe a reversão para não sobrescrevê-la.

## Validação da preparação

Dez testes isolados, sem rede nem produção: publicação e reversão completas;
preservação de APK/assets; bloqueio de produção alterada; reversão automática
quando a rota HTTPS difere; proteção contra pacote alterado/traversal; bloqueio
de reversão sobre uma publicação posterior; aceitação explícita de descendente
com fonte idêntica e rejeição de fonte alterada, suja ou história não descendente.
A inspeção remota é somente leitura.

## Publicação confirmada

Aplicação concluída em **09/10/2026 às 00:17:42 UTC**, correspondente a
**08/10/2026 às 21:17:42 de Brasília**, depois da confirmação do backend de
consentimento. Fonte do pacote: `d9346dd507f5702c4f2eaee40cf2fdc8659ef378`.
Checkout na aplicação: `759eb9b98f9aed9d2ccb20005527edb4b4d52a04`, descendente
com fontes do app idênticas, verificado pelo modo explícito acima.

- Release: `20261009-web-integrada`, com `published: true` no `result.json`.
- 223 arquivos verificados no servidor, 140 assets/shell conferidos por HTTPS
  e sete rotas principais aprovadas.
- Novo `index.html`: `9ae4dd994d87c79a76e1b2ef0c469ed6d06528852a3d742183e27389e097cad6`.
- Marketing, Caddy, APKs, service worker da landing e assets anteriores
  preservados. Reversão automática não foi necessária.
- Build de produção normal e trava legal passaram. As fontes não foram
  recompiladas depois dos commits exclusivamente de backend/scripts.

QA visual feita com Chrome via CUA, em aba própria, pois o navegador integrado
não estava disponível nessa execução; Safari não foi utilizado. Login compacto
conferido em 440 × 956 e 1440 × 900, sem rolagem horizontal ou vertical nesses
tamanhos. Navegação manual e avanço automático do carrossel observados, sem
botão play/pause. A política mostra o provedor e a retenção confirmados, sem
marcadores pendentes; `/suporte` aponta para `suporte@maislouvor.com`. O contato
de privacidade permanece no e-mail Outlook confirmado, até a segunda caixa ser
definida. Nenhuma credencial, cadastro ou compra foi enviado nesta QA visual.

O Chrome já tinha o service worker anterior: o primeiro acesso ainda mostrou o
login antigo enquanto o navegador instalava os novos arquivos. Depois da
instalação e de recarregar, `/login` passou a mostrar o novo formulário e o asset
`index-DoFg0z4t.js`. Não foi feita limpeza de cache ou dos dados do usuário.
Abas antigas podem precisar ser reabertas/recarregadas depois da atualização.

Capturas reais do domínio publicado e do pacote previamente revisado ficam em
`docs/lojas/screenshots/web-release-20261009/`. Não são capturas do binário iOS e
não substituem a validação do TestFlight.
